// routes/rechargeWallet.js
const express = require('express');
const axios = require('axios');
//const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const Transaction = require('../models/Transaction');
const { authUser } = require('../middleware/auth');

const PAWAPAY_API_KEY = process.env.PAWAPAY_API_KEY;
const PAWAPAY_BASE_URL = process.env.PAWAPAY_BASE_URL || 'https://api.sandbox.pawapay.io';

const PROVIDER_CONFIG = {
  '221': { currency: 'XOF', operators: { orange: 'ORANGE_SEN', free: 'FREE_SEN' } },
  '233': { currency: 'GHS', operators: { mtn: 'MTN_MOMO_GHA', at: 'AIRTELTIGO_GHA', telecel: 'VODAFONE_GHA' } },
  '254': { currency: 'KES', operators: { safaricom: 'MPESA_KEN' } },
  '250': { currency: 'RWF', operators: { mtn: 'MTN_MOMO_RWA', airtel: 'AIRTEL_RWA' } },
  '260': { currency: 'ZMW', operators: { mtn: 'MTN_MOMO_ZMB', airtel: 'AIRTEL_OAPI_ZMB', zamtel: 'ZAMTEL_ZMB' } }
};

// ─── Page HTML ────────────────────────────────────────────────────────────────
router.get('/recharge-page', authUser, (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recharger UniPay</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 min-h-screen flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-lg p-6 w-full max-w-md">
    <h1 class="text-2xl font-bold text-gray-800 mb-6 text-center">Recharger mon wallet</h1>

    <form id="rechargeForm" class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Montant</label>
        <input type="number" id="montant" min="100" step="100" required
          class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          placeholder="Ex: 5000">
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Opérateur</label>
        <select id="operateur" required
          class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
          <option value="">Choisir...</option>
          <option value="orange">Orange Sénégal</option>
          <option value="free">Free Sénégal</option>
          <option value="mtn">MTN Ghana / Rwanda</option>
          <option value="at">AirtelTigo Ghana</option>
          <option value="telecel">Telecel Ghana</option>
          <option value="safaricom">Safaricom Kenya</option>
          <option value="airtel">Airtel Rwanda / Zambie</option>
          <option value="zamtel">Zamtel Zambie</option>
        </select>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Numéro Mobile Money</label>
        <input type="tel" id="numero" required
          class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          placeholder="Ex: 221771234567">
        <p class="text-xs text-gray-500 mt-1">Format: code pays + numéro, sans +</p>
      </div>

      <button type="submit" id="submitBtn"
        class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50">
        Recharger maintenant
      </button>
    </form>

    <div id="result" class="mt-4 hidden"></div>
  </div>

  <script>
    const form = document.getElementById('rechargeForm');
    const submitBtn = document.getElementById('submitBtn');
    const result = document.getElementById('result');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submitBtn.disabled = true;
      submitBtn.textContent = 'Traitement...';
      result.classList.add('hidden');

      const payload = {
        montant: document.getElementById('montant').value,
        operateur: document.getElementById('operateur').value,
        numero: document.getElementById('numero').value.replace('+', '')
      };

      try {
        const res = await fetch('/api/rechargeWallet/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.success) {
          result.className = 'mt-4 p-4 bg-green-50 border border-green-200 rounded-lg';
          result.innerHTML = \`
            <p class="text-green-800 font-medium">✓ Demande envoyée</p>
            <p class="text-sm text-green-700 mt-1">Validez le paiement sur votre téléphone.</p>
            <p class="text-xs text-gray-600 mt-2">ID: \${data.depositId}</p>
          \`;
          form.reset();

          // Polling statut toutes les 5s (max 12 tentatives = 1 min)
          let attempts = 0;
          const poll = setInterval(async () => {
            attempts++;
            const r = await fetch(\`/api/rechargeWallet/status/\${data.depositId}\`, {
              credentials: 'include'
            });
            const s = await r.json();
            if (s.status === 'reussie') {
              clearInterval(poll);
              result.innerHTML += \`<p class="text-green-700 font-semibold mt-2">✓ Wallet crédité !</p>\`;
            } else if (s.status === 'echouee' || attempts >= 12) {
              clearInterval(poll);
              if (s.status === 'echouee') {
                result.innerHTML += \`<p class="text-red-600 mt-2">✗ Paiement échoué.</p>\`;
              }
            }
          }, 5000);

        } else {
          throw new Error(data.error || 'Erreur inconnue');
        }
      } catch (err) {
        result.className = 'mt-4 p-4 bg-red-50 border border-red-200 rounded-lg';
        result.innerHTML = \`<p class="text-red-800">✗ \${err.message}</p>\`;
      } finally {
        result.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Recharger maintenant';
      }
    });
  </script>
</body>
</html>
  `);
});

// ─── POST /init ───────────────────────────────────────────────────────────────
router.post('/init', authUser, async (req, res) => {
  try {
    const { montant, numero, operateur } = req.body;
    const userId = req.user.id;

    if (!montant || !numero || !operateur) {
      return res.status(400).json({ error: 'Champs manquants' });
    }

    const cleanNumero = numero.replace('+', '');
    const prefix = cleanNumero.slice(0, 3);
    const config = PROVIDER_CONFIG[prefix];

    if (!config) {
      return res.status(400).json({ error: 'Pays non supporté' });
    }

    const provider = config.operators[operateur.toLowerCase()];
    if (!provider) {
      return res.status(400).json({ error: 'Opérateur non supporté pour ce pays' });
    }

    // depositId doit être un UUIDv4
    const depositId = uuidv4();

    const tx = await Transaction.create({
      type: 'recharge',
      expediteur: userId,
      destinataire: userId,
      montant: parseFloat(montant),
      operateur,
      numeroSource: cleanNumero,
      status: 'en_attente',
      depositId,
      date: new Date()
    });

    const { data } = await axios.post(
      `${PAWAPAY_BASE_URL}/v2/deposits`,
      {
        depositId,
        amount: String(montant),
        currency: config.currency,
        payer: {
          type: "MMO",
          accountDetails: {
            phoneNumber: cleanNumero,
            provider
          }
        },
        customerMessage: "UniPay Recharge"
      },
      {
        headers: {
          'Authorization': `Bearer ${PAWAPAY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (data.status === 'ACCEPTED') {
      return res.json({
        success: true,
        depositId,
        message: 'Validez le paiement sur votre téléphone',
        transactionId: tx._id
      });
    }

    await Transaction.findByIdAndUpdate(tx._id, { status: 'echouee' });
    return res.status(400).json({
      error: data.failureReason?.failureMessage || 'Paiement refusé'
    });

  } catch (err) {
    console.error('PAWAPAY INIT ERROR:', err.response?.data || err.message);
    const msg = err.response?.data?.failureReason?.failureMessage
             || err.response?.data?.errorMessage
             || 'Erreur serveur';
    res.status(500).json({ error: msg });
  }
});

// ─── GET /status/:depositId ───────────────────────────────────────────────────
router.get('/status/:depositId', authUser, async (req, res) => {
  try {
    const tx = await Transaction.findOne({
      depositId: req.params.depositId,
      expediteur: req.user.id
    });
    if (!tx) return res.status(404).json({ error: 'Transaction introuvable' });

    res.json({
      status: tx.status,
      montant: tx.montant,
      date: tx.date
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /callback (webhook PawaPay) ────────────────────────────────────────
router.post('/callback', async (req, res) => {
  try {
    const { depositId, status } = req.body;

    if (!depositId || !status) {
      return res.status(400).json({ error: 'Données manquantes' });
    }

    const newStatus = status === 'COMPLETED' ? 'reussie'
                    : status === 'FAILED'    ? 'echouee'
                    : null;

    if (newStatus) {
      const tx = await Transaction.findOneAndUpdate(
        { depositId },
        { status: newStatus },
        { new: true }
      );

      // Créditer le wallet si COMPLETED
      if (newStatus === 'reussie' && tx) {
        await User.findByIdAndUpdate(tx.expediteur, {
          $inc: { solde: tx.montant }
        });
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('CALLBACK ERROR:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
