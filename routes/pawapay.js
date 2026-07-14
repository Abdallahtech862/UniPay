const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');

// Assure-toi que t’as ces modèles Mongoose
const Transaction = require('../models/Transaction');
const User = require('../models/User');

const PAWAPAY_BASE_URL = process.env.PAWAPAY_BASE_URL || 'https://api.sandbox.pawapay.io';
const PAWAPAY_API_KEY = process.env.PAWAPAY_API_KEY;
const PAWAPAY_WEBHOOK_SECRET = process.env.PAWAPAY_WEBHOOK_SECRET; // Tu le récupères dans dashboard PawaPay

// 1. INITIER UN DEPOT
router.post('/deposit', async (req, res) => {
  const session = await Transaction.startSession();
  session.startTransaction();
  
  try {
    const { userId, amount, phoneNumber, provider } = req.body;
    
    if (!userId || !amount || !phoneNumber || !provider) {
      return res.status(400).json({ error: 'Champs manquants: userId, amount, phoneNumber, provider' });
    }

    const user = await User.findById(userId).session(session);
    if (!user) throw new Error('Utilisateur introuvable');

    const depositId = `unipay_${Date.now()}_${userId}`;

    // Créer la transaction en PENDING dans ta DB
    const tx = await Transaction.create([{
      userId,
      depositId,
      amount,
      currency: 'XOF', // adapte
      phoneNumber,
      provider, // MTN_MOMO_CI, ORANGE_CI, MOOV_CI, etc
      status: 'PENDING',
      type: 'DEPOSIT'
    }], { session });

    // Appel API PawaPay
    const pawapayPayload = {
      depositId,
      amount: String(amount), // PawaPay veut string
      currency: 'XOF',
      payer: {
        type: 'MSISDN',
        address: { value: phoneNumber }
      },
      provider: provider,
      metadata: [
        { fieldName: 'userId', fieldValue: userId },
        { fieldName: 'app', fieldValue: 'UniPay' }
      ]
    };

    const response = await axios.post(
      `${PAWAPAY_BASE_URL}/v1/deposits`,
      pawapayPayload,
      {
        headers: {
          'Authorization': `Bearer ${PAWAPAY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      depositId,
      status: 'PENDING',
      pawapayResponse: response.data
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('PAWAPAY DEPOSIT ERROR:', err.response?.data || err.message);
    res.status(500).json({ 
      error: 'Erreur initiation dépôt', 
      details: err.response?.data || err.message 
    });
  }
});

// 2. CALLBACK PAWAPAY - PawaPay tape ici quand le paiement change de statut
router.post('/callback', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-pawapay-signature'];
    const rawBody = req.body; // Buffer car express.raw()
    
    // 1. Vérifier la signature - CRITIQUE
    if (!verifyPawaPaySignature(signature, rawBody)) {
      console.error('PAWAPAY CALLBACK: Signature invalide');
      return res.status(401).send('Invalid signature');
    }

    const body = JSON.parse(rawBody.toString());
    console.log('PAWAPAY CALLBACK:', body);

    const { depositId, status, failureReason } = body;

    if (!depositId) {
      return res.status(400).send('Missing depositId');
    }

    // 2. Idempotence : si déjà traité, on renvoie 200 direct
    const tx = await Transaction.findOne({ depositId });
    if (!tx) {
      console.error('PAWAPAY CALLBACK: Transaction introuvable', depositId);
      return res.status(404).send('Transaction not found');
    }

    if (tx.status === 'COMPLETED' || tx.status === 'FAILED') {
      console.log('PAWAPAY CALLBACK: Déjà traité', depositId);
      return res.status(200).send('Already processed');
    }

    // 3. Update transaction + crédit user si COMPLETED
    if (status === 'COMPLETED') {
      const session = await Transaction.startSession();
      session.startTransaction();
      
      try {
        await Transaction.findOneAndUpdate(
          { depositId },
          { status: 'COMPLETED', paidAt: new Date(), pawapayData: body },
          { session }
        );

        await User.findByIdAndUpdate(
          tx.userId,
          { $inc: { balance: tx.amount } },
          { session }
        );

        await session.commitTransaction();
        session.endSession();
        console.log('PAWAPAY: User crédité', tx.userId, tx.amount);

      } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
      }

    } else if (status === 'FAILED' || status === 'REJECTED') {
      await Transaction.findOneAndUpdate(
        { depositId },
        { status: 'FAILED', failureReason: failureReason || 'Unknown', failedAt: new Date() }
      );
      console.log('PAWAPAY: Paiement échoué', depositId, failureReason);
    }

    // 4. Toujours répondre 200 en <5s sinon PawaPay retry
    res.status(200).send('OK');

  } catch (err) {
    console.error('PAWAPAY CALLBACK ERROR:', err);
    res.status(500).send('Server error');
  }
});

// 3. CHECK STATUS MANUEL - pour debug
router.get('/status/:depositId', async (req, res) => {
  try {
    const { depositId } = req.params;
    
    const response = await axios.get(
      `${PAWAPAY_BASE_URL}/v1/deposits/${depositId}`,
      { headers: { 'Authorization': `Bearer ${PAWAPAY_API_KEY}` } }
    );
    
    res.status(200).json(response.data);
  } catch (err) {
    console.error('PAWAPAY STATUS ERROR:', err.response?.data || err.message);
    res.status(500).json({ error: 'Erreur status', details: err.response?.data });
  }
});

// Fonction de vérification signature HMAC SHA256
function verifyPawaPaySignature(signature, rawBody) {
  if (!PAWAPAY_WEBHOOK_SECRET) {
    console.warn('PAWAPAY_WEBHOOK_SECRET manquant. Signature non vérifiée.');
    return true; // En dev seulement. En prod return false
  }
  if (!signature) return false;
  
  const hmac = crypto.createHmac('sha256', PAWAPAY_WEBHOOK_SECRET);
  const digest = hmac.update(rawBody).digest('hex');
  
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

module.exports = router;
