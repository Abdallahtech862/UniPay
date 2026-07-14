const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const Client = require('../models/Client');
const Transaction = require('../models/Transaction');
const { authUser } = require('../middleware/auth');

const PAWAPAY_BASE_URL = process.env.PAWAPAY_BASE_URL; // https://api.sandbox.pawapay.io
const PAWAPAY_API_KEY = process.env.PAWAPAY_API_KEY;

// Correspondents SANDBOX PawaPay - PAS les vrais
const OPERATOR_MAP = {
  'orange': 'ORANGE_SANDBOX',
  'moov': 'MOOV_SANDBOX',
  'mtn': 'MTN_SANDBOX',
  'wave': 'WAVE_SANDBOX'
};

// PROD: remplace par ORANGE_BF, MOOV_BF, MTN_CI, WAVE_CI etc

router.post('/init', authUser, async (req, res) => {
  try {
    const { montant, numero, operateur, clientId } = req.body;
    const userId = req.user.id;

    if (!montant || montant < 100) {
      return res.status(400).json({ error: 'Montant minimum: 100 FCFA' });
    }

    const client = await Client.findById(userId);
    if (!client) return res.status(404).json({ error: 'Client introuvable' });

    const correspondent = OPERATOR_MAP[operateur];
    if (!correspondent) {
      return res.status(400).json({ error: 'Opérateur non supporté' });
    }

    const depositId = `unipay_${Date.now()}_${userId}`;

    await Transaction.create({
      type: 'recharge',
      expediteur: userId,
      destinataire: userId,
      montant,
      operateur,
      numeroSource: numero,
      status: 'en_attente',
      depositId,
      soldeExpediteurAvant: client.solde,
      motif: `Recharge ${operateur}`,
      date: new Date()
    });

    // ENDPOINT CORRECT POUR CHECKOUT
    const payload = {
      depositId,
      amount: String(montant),
      currency: 'XOF',
      correspondent, // ORANGE_SANDBOX en sandbox
      payer: { phoneNumber: numero },
      customerTimestamp: new Date().toISOString(),
      statementDescription: 'UniPay Recharge',
      metadata: [{ fieldName: 'userId', fieldValue: userId }]
    };

    console.log('PAWAPAY PAYLOAD:', payload);

    const { data } = await axios.post(
      `${PAWAPAY_BASE_URL}/payouts/checkout`, // CORRIGÉ ICI
      payload,
      {
        headers: {
          'Authorization': `Bearer ${PAWAPAY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    res.json({
      success: true,
      depositId,
      checkoutUrl: data.checkoutUrl,
      message: 'Redirection vers PawaPay'
    });

  } catch (err) {
    console.error('PAWAPAY INIT ERROR:', err.response?.data || err.message);
    res.status(500).json({
      error: 'Erreur initiation paiement',
      details: err.response?.data || err.message
    });
  }
});

module.exports = router;
