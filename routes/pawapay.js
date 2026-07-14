const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');

const Transaction = require('../models/Transaction');
const User = require('../models/User');

const PAWAPAY_BASE_URL = process.env.PAWAPAY_BASE_URL || 'https://api.sandbox.pawapay.io';
const PAWAPAY_API_KEY = process.env.PAWAPAY_API_KEY;
const PAWAPAY_WEBHOOK_SECRET = process.env.PAWAPAY_WEBHOOK_SECRET;

// 1. CREER UN CHECKOUT - le plus simple pour commencer
router.post('/create-checkout', async (req, res) => {
  try {
    const { userId, amount, phoneNumber, provider } = req.body;
    
    if (!userId || !amount || !phoneNumber || !provider) {
      return res.status(400).json({ error: 'userId, amount, phoneNumber, provider requis' });
    }

    const depositId = `unipay_${Date.now()}_${userId}`;

    // Sauve en PENDING
    await Transaction.create({
      userId,
      depositId,
      amount,
      currency: 'XOF',
      phoneNumber,
      provider,
      status: 'PENDING',
      type: 'DEPOSIT'
    });

    const payload = {
      depositId,
      amount: String(amount),
      currency: 'XOF',
      correspondent: provider, // ORANGE_BF, MOOV_BF, MTN_CI, etc
      payer: { phoneNumber },
      customerTimestamp: new Date().toISOString(),
      statementDescription: 'UniPay Recharge',
      metadata: [{ fieldName: 'userId', fieldValue: userId }]
    };

    const { data } = await axios.post(
      `${PAWAPAY_BASE_URL}/v1/checkout`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${PAWAPAY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    res.status(200).json({ 
      success: true, 
      depositId, 
      checkoutUrl: data.checkoutUrl 
    });

  } catch (err) {
    console.error('PAWAPAY CHECKOUT ERROR:', err.response?.data || err.message);
    res.status(500).json({ 
      error: 'Erreur création checkout', 
      details: err.response?.data 
    });
  }
});

// 2. CREER UN PAYOUT - retrait vers Mobile Money
router.post('/create-payout', async (req, res) => {
  const session = await Transaction.startSession();
  session.startTransaction();
  
  try {
    const { userId, amount, phoneNumber, provider } = req.body;
    
    const user = await User.findById(userId).session(session);
    if (!user || user.balance < amount) {
      throw new Error('Solde insuffisant');
    }

    const payoutId = `unipay_out_${Date.now()}_${userId}`;

    // Débite le user direct en PENDING
    await User.findByIdAndUpdate(userId, { $inc: { balance: -amount } }, { session });
    
    await Transaction.create([{
      userId,
      payoutId,
      amount,
      currency: 'XOF',
      phoneNumber,
      provider,
      status: 'PENDING',
      type: 'WITHDRAW'
    }], { session });

    const payload = {
      payoutId,
      amount: String(amount),
      currency: 'XOF',
      correspondent: provider,
      recipient: { phoneNumber },
      customerTimestamp: new Date().toISOString(),
      statementDescription: 'UniPay Retrait',
      metadata: [{ fieldName: 'userId', fieldValue: userId }]
    };

    const { data } = await axios.post(
      `${PAWAPAY_BASE_URL}/v1/payouts`,
      payload,
      {
        headers: { 'Authorization': `Bearer ${PAWAPAY_API_KEY}` },
        timeout: 15000
      }
    );

    await session.commitTransaction();
    res.status(200).json({ success: true, payoutId, data });

  } catch (err) {
    await session.abortTransaction();
    console.error('PAWAPAY PAYOUT ERROR:', err.response?.data || err.message);
    res.status(500).json({ error: 'Erreur retrait', details: err.response?.data });
  } finally {
    session.endSession();
  }
});

// 3. CALLBACK UNIFIÉ - PawaPay tape ici pour TOUT : checkouts, deposits, payouts, refunds
router.post('/callback', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-pawapay-signature'];
    const rawBody = req.body;
    
    // 1. Vérif signature OBLIGATOIRE
    if (!verifyPawaPaySignature(signature, rawBody)) {
      console.error('PAWAPAY CALLBACK: Signature invalide');
      return res.status(401).send('Invalid signature');
    }

    const body = JSON.parse(rawBody.toString());
    console.log('PAWAPAY CALLBACK:', body);

    const { depositId, payoutId, refundId, status, failureCode, failureMessage } = body;
    const metadata = body.metadata || [];
    const userId = metadata.find(m => m.fieldName === 'userId')?.fieldValue;

    // 2. DEPOSIT / CHECKOUT
    if (depositId) {
      const tx = await Transaction.findOne({ depositId });
      if (!tx) return res.status(404).send('Deposit not found');
      if (tx.status !== 'PENDING') return res.status(200).send('Already processed');

      if (status === 'COMPLETED') {
        await Transaction.findOneAndUpdate(
          { depositId }, 
          { status: 'COMPLETED', paidAt: new Date(), pawapayData: body }
        );
        await User.findByIdAndUpdate(userId, { $inc: { balance: body.amount } });
        console.log('DEPOSIT COMPLETED:', depositId, body.amount);
        
      } else if (status === 'FAILED' || status === 'REJECTED') {
        await Transaction.findOneAndUpdate(
          { depositId }, 
          { status: 'FAILED', failureReason: failureMessage || failureCode }
        );
      }
    }

    // 3. PAYOUT
    if (payoutId) {
      const tx = await Transaction.findOne({ payoutId });
      if (!tx) return res.status(404).send('Payout not found');
      if (tx.status !== 'PENDING') return res.status(200).send('Already processed');

      if (status === 'COMPLETED') {
        await Transaction.findOneAndUpdate(
          { payoutId }, 
          { status: 'COMPLETED', paidAt: new Date(), pawapayData: body }
        );
        console.log('PAYOUT COMPLETED:', payoutId);
        
      } else if (status === 'FAILED' || status === 'REJECTED') {
        // Rembourse le user car on avait débité en PENDING
        await Transaction.findOneAndUpdate(
          { payoutId }, 
          { status: 'FAILED', failureReason: failureMessage || failureCode }
        );
        await User.findByIdAndUpdate(userId, { $inc: { balance: body.amount } });
        console.log('PAYOUT FAILED - User refunded:', payoutId);
      }
    }

    // 4. REFUND
    if (refundId) {
      const { depositId: originalDepositId } = body;
      await Transaction.findOneAndUpdate(
        { depositId: originalDepositId },
        { refunded: true, refundId, refundStatus: status }
      );
      console.log('REFUND:', refundId, status);
    }

    // Toujours répondre 200 vite
    res.status(200).send('OK');

  } catch (err) {
    console.error('PAWAPAY CALLBACK ERROR:', err);
    res.status(500).send('Server error');
  }
});

// 4. VERIF SIGNATURE HMAC SHA256
function verifyPawaPaySignature(signature, rawBody) {
  if (!PAWAPAY_WEBHOOK_SECRET) {
    console.warn('PAWAPAY_WEBHOOK_SECRET manquant. Dev only.');
    return process.env.NODE_ENV !== 'production';
  }
  if (!signature) return false;
  
  const hmac = crypto.createHmac('sha256', PAWAPAY_WEBHOOK_SECRET);
  const digest = hmac.update(rawBody).digest('hex');
  
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch {
    return false;
  }
}

// 5. CHECK STATUS - pour debug
router.get('/status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const endpoint = id.startsWith('unipay_out_') ? 'payouts' : 'deposits';
    
    const { data } = await axios.get(
      `${PAWAPAY_BASE_URL}/v1/${endpoint}/${id}`,
      { headers: { 'Authorization': `Bearer ${PAWAPAY_API_KEY}` } }
    );
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data });
  }
});

module.exports = router;
