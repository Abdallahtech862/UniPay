// routes/rechargeWallet.js
const express = require('express');
const axios = require('axios');

const jwt = require('jsonwebtoken');
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

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Client = require('../models/Client');
const Transaction = require('../models/Transaction');
const { authUser } = require('../middleware/auth');

// Page HTML servie par le backend
router.get('/recharge-page', async (req, res) => {
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
