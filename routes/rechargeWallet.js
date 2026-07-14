
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Client = require('../models/Client');
const Transaction = require('../models/Transaction');
const { authUser } = require('../middleware/auth');
const axios = require('axios');
//
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
router.get('/recharge-page', (req, res) => {
  const { token } = req.query;
  console.log('token', token);
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const client = await Client.findById(decoded.id);
    if (!client) return res.status(401).send('Unauthorized');
    
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
          <option value="mtn">MTN Ghana / Rwanda / Zambie</option>
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
    const TOKEN = "${token}";
    console.log('Token reçu:', TOKEN? 'OK' : 'VIDE'); // Debug

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
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + TOKEN
          },
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

          let attempts = 0;
          const poll = setInterval(async () => {
            attempts++;
            const r = await fetch('/api/rechargeWallet/status/' + data.depositId, {
              headers: { 'Authorization': 'Bearer ' + TOKEN }
            });
            const s = await r.json();
            if (s.status === 'reussie') {
              clearInterval(poll);
              result.innerHTML += '<p class="text-green-700 font-semibold mt-2">✓ Wallet crédité!</p>';
              setTimeout(() => window.ReactNativeWebView?.postMessage(JSON.stringify({type: 'RECHARGE_SUCCESS'})), 1000);
            } else if (s.status === 'echouee' || attempts >= 12) {
              clearInterval(poll);
              if (s.status === 'echouee') {
                result.innerHTML += '<p class="text-red-600 mt-2">✗ Paiement échoué.</p>';
              }
            }
          }, 5000);

        } else {
          throw new Error(data.error || 'Erreur inconnue');
        }
      } catch (err) {
        result.className = 'mt-4 p-4 bg-red-50 border border-red-200 rounded-lg';
        result.innerHTML = '<p class="text-red-800">✗ ' + err.message + '</p>';
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

    if (!montant ||!numero ||!operateur) {
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

    const depositId = uuidv4(); // Maintenant ça marche

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

    if (!depositId ||!status) {
      return res.status(400).json({ error: 'Données manquantes' });
    }

    const newStatus = status === 'COMPLETED'? 'reussie'
                    : status === 'FAILED'? 'echouee'
                    : null;

    if (newStatus) {
      const tx = await Transaction.findOneAndUpdate(
        { depositId },
        { status: newStatus },
        { new: true }
      );

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

// Page HTML servie par le backend
router.get('/recharge-pagee', async (req, res) => {
  const { token } = req.query;
  console.log('token', token);
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const client = await Client.findById(decoded.id);
    if (!client) return res.status(401).send('Unauthorized');
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Recharger Wallet</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #1a1a1a; color: #fff; padding: 20px;
          }
          .container { max-width: 400px; margin: 0 auto; }
          h1 { font-size: 24px; margin-bottom: 8px; color: #E8D19A; }
          .solde { font-size: 14px; color: #999; margin-bottom: 20px; }
          .service { 
            background: #2a2a2a; border-radius: 12px; padding: 16px; 
            margin-bottom: 12px; display: flex; align-items: center;
            cursor: pointer; border: 2px solid transparent;
          }
          .service:hover { border-color: #E8D19A; }
          .service img { width: 48px; height: 48px; border-radius: 8px; margin-right: 12px; }
          .service-name { font-size: 16px; font-weight: 600; }
          .service-desc { font-size: 13px; color: #999; }
          .input-group { margin: 20px 0; }
          label { display: block; margin-bottom: 8px; font-size: 14px; color: #ccc; }
          input { 
            width: 100%; padding: 14px; border-radius: 10px; 
            border: 1px solid #444; background: #2a2a2a; 
            color: #fff; font-size: 16px;
          }
          button {
            width: 100%; padding: 16px; border-radius: 12px;
            background: #E8D19A; color: #1a1a1a; font-size: 16px;
            font-weight: 600; border: none; cursor: pointer;
          }
          button:disabled { opacity: 0.5; }
          .hidden { display: none; }
          .loading { text-align: center; padding: 20px; color: #999; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Recharger mon wallet</h1>
          <div class="solde">Solde actuel: ${client.solde.toLocaleString()} FCFA</div>
          
          <div id="services">
            <div class="service" onclick="selectService('orange')">
              <img src="https://logo.clearbit.com/orange.bf" alt="Orange">
              <div>
                <div class="service-name">Orange Money</div>
                <div class="service-desc">Frais 1% - Instantané</div>
              </div>
            </div>
            
            <div class="service" onclick="selectService('moov')">
              <img src="https://logo.clearbit.com/moov.bf" alt="Moov">
              <div>
                <div class="service-name">Moov Money</div>
                <div class="service-desc">Frais 1% - Instantané</div>
              </div>
            </div>

            <div class="service" onclick="selectService('wave')">
              <img src="https://logo.clearbit.com/wave.com" alt="Wave">
              <div>
                <div class="service-name">Wave</div>
                <div class="service-desc">Frais 0% - Instantané</div>
              </div>
            </div>
          </div>

          <div id="form" class="hidden">
            <div class="input-group">
              <label>Montant à recharger</label>
              <input type="number" id="montant" placeholder="5000" min="100" />
            </div>
            <div class="input-group">
              <label>Numéro Mobile Money</label>
              <input type="tel" id="numero" placeholder="70 XX XX XX" value="${client.telephone || ''}" />
            </div>
            <button id="btnSubmit" onclick="submitRecharge()">Confirmer le paiement</button>
            <button onclick="back()" style="background:#444;margin-top:10px">Retour</button>
            <div id="loading" class="loading hidden">Traitement en cours...</div>
          </div>
        </div>

        <script>
          const CLIENT_ID = '${decoded.id}';
          const TOKEN = '${token}';
          let selectedService = null;

          function selectService(service) {
            selectedService = service;
            document.getElementById('services').classList.add('hidden');
            document.getElementById('form').classList.remove('hidden');
          }

          function back() {
            document.getElementById('form').classList.add('hidden');
            document.getElementById('services').classList.remove('hidden');
          }

          async function submitRecharge() {
            const montant = document.getElementById('montant').value;
            const numero = document.getElementById('numero').value;
            const btn = document.getElementById('btnSubmit');
            const loading = document.getElementById('loading');
            
            if (!montant || !numero) {
              alert('Remplis tous les champs');
              return;
            }

            if (parseInt(montant) < 100) {
              alert('Montant minimum: 100 FCFA');
              return;
            }

            btn.disabled = true;
            loading.classList.remove('hidden');

            try {
              const res = await fetch('/api/recharge/init', {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + TOKEN
                },
                body: JSON.stringify({
                  clientId: CLIENT_ID,
                  montant: parseInt(montant),
                  numero,
                  operateur: selectedService
                })
              });

              const data = await res.json();
              if (!res.ok) throw new Error(data.error || 'Erreur serveur');

              window.ReactNativeWebView?.postMessage(JSON.stringify({
                type: 'RECHARGE_SUCCESS',
                montant: data.montant,
                nouveauSolde: data.nouveauSolde
              }));
            } catch (err) {
              alert(err.message);
              btn.disabled = false;
              loading.classList.add('hidden');
            }
          }
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(401).send('Token invalide');
  }
});

// API pour initier la recharge
router.post('/init', authUser, async (req, res) => {
  try {
    const { montant, numero, operateur, clientId } = req.body;
    const userId = req.user.id;

    if (!montant || montant < 100) {
      return res.status(400).json({ error: 'Montant minimum: 100 FCFA' });
    }

    const client = await Client.findById(userId);
    if (!client) return res.status(404).json({ error: 'Client introuvable' });

    // TODO: Appeler API Orange/Moov/Wave ici
    // const result = await orangeMoneyApi.debit(numero, montant);
    
    // Pour test, on crédite direct
    client.solde += montant;
    await client.save();

    const tx = new Transaction({
      type: 'recharge',
      expediteur: userId,
      destinataire: userId,
      montant,
      operateur,
      numeroSource: numero,
      status: 'validee',
      soldeExpediteurApres: client.solde,
      motif: `Recharge ${operateur}`,
      date: new Date()
    });
    await tx.save();

    res.json({ 
      montant, 
      nouveauSolde: client.solde,
      message: 'Recharge effectuée' 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});



module.exports = router;
