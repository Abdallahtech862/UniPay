const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const Client = require('../models/Client');
const Transaction = require('../models/Transaction');
const { authUser } = require('../middleware/auth');

// --- CONFIG PROD ---
const PAWAPAY_API_KEY = process.env.PAWAPAY_API_KEY;
const PAWAPAY_BASE_URL = 'https://api.pawapay.io'; // ✅ PROD - ne jamais mettre dashboard.pawapay.io
const IS_PROD = process.env.NODE_ENV === 'production';

const PROVIDER_CONFIG = {
  '226': { currency: 'XOF', operators: { orange: 'ORANGE_BFA', moov: 'MOOV_BFA' } }
};
const FRAIS_CONFIG = { orange: 0.00, moov: 0.00 };
const ADMIN_TEL = '7000000000';

function calculerFrais(montant, operateur) {
  const taux = FRAIS_CONFIG[operateur.toLowerCase()] || 0.05;
  const frais = Math.ceil(parseFloat(montant) * taux);
  const net = parseFloat(montant) - frais;
  return { frais, net, taux: taux * 100 };
}

function getPrivateKey() {
  let key = process.env.PAWAPAY_PRIVATE_KEY;
  if (!key) return null;
  return key.replace(/\\n/g, '\n');
}
function getPawaPayPublicKey() {
  let key = process.env.PAWAPAY_PUBLIC_KEY;
  if (!key) return null;
  return key.replace(/\\n/g, '\n');
}

function signPayload(payload) {
  const privateKey = getPrivateKey();
  if (!privateKey) throw new Error('Clé privée manquante');
  const sign = crypto.createSign('SHA256');
  sign.update(JSON.stringify(payload));
  sign.end();
  return sign.sign(privateKey, 'base64');
}

function verifyPawapaySignature(payload, signature) {
  const publicKey = getPawaPayPublicKey();
  if (!publicKey) {
    if (IS_PROD) {
      console.error('❌ PROD: Clé publique pawaPay manquante !');
      return false;
    }
    return true;
  }
  if (!signature) return false;
  try {
    const verify = crypto.createVerify('SHA256');
    verify.update(JSON.stringify(payload));
    verify.end();
    return verify.verify(publicKey, signature, 'base64');
  } catch (e) {
    console.error('VERIFY ERROR', e.message);
    return false;
  }
}

// ... TA PARTIE HTML recharge-page RESTE IDENTIQUE ...
router.get('/recharge-page', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).send('Token manquant');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const client = await Client.findById(decoded.id);
    if (!client) return res.status(401).send('Unauthorized');
    const html = `<!DOCTYPE html><html lang="fr">
    <head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recharge</title>
    <style>*{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,sans-serif}body{background:#F9F5ED;min-height:100vh;padding:0 16px 24px}.label{font-size:14px;font-weight:600;color:#2B1E12;margin:16px 0 10px}.operators{display:grid;grid-template-columns:1fr 1fr;gap:12px}.op{background:#FFFFFF;border:1.5px solid #E9E2D0;border-radius:16px;padding:14px;display:flex;flex-direction:column;align-items:center;gap:10px;cursor:pointer;position:relative}.op.selected{background:#F1E6CC;border-color:#2B1E12}.op .check{position:absolute;top:8px;right:8px;width:20px;height:20px;background:#2B1E12;border-radius:50%;display:none;align-items:center;justify-content:center;color:#fff;font-size:12px}.op.selected .check{display:flex}.op img{width:64px;height:32px;object-fit:contain}.op span{font-size:13px;font-weight:600;color:#2B1E12}.input-box{position:relative;background:#FFFFFF;border:1.5px solid #E9E2D0;border-radius:14px;display:flex;align-items:center;padding:0 14px;height:54px}.input-box input{flex:1;border:none;outline:none;font-size:14px;background:transparent;color:#2B1E12}.suffix{font-size:13px;font-weight:700;color:#2B1E12;margin-left:8px}.receive-box{background:#F1E6CC;border:1.5px solid #E9E2D0;border-radius:14px;display:flex;flex-direction:column;justify-content:center;padding:10px 14px;min-height:64px}.receive-row{display:flex;justify-content:space-between;font-size:13px;margin:2px 0}.receive-row.total{font-weight:700;font-size:15px;border-top:1px dashed #C9B896;margin-top:6px;padding-top:6px}.info{display:flex;gap:10px;background:#FFFFFF;border:1.5px solid #E9E2D0;border-radius:14px;padding:12px 14px;margin-top:16px}.info i{width:22px;height:22px;border:1.5px solid #2B1E12;border-radius:50%;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:12px;font-weight:700;flex-shrink:0}.info p{font-size:12.5px;line-height:1.4;color:#5A4A35}.otp-box{display:none;margin-top:16px}.otp-box.show{display:block}.otp-help{margin-top:10px;background:#FFF3CD;border:1.5px solid #FFC107;border-radius:12px;padding:12px;text-align:center;display:none}.otp-help.show{display:block}.otp-help a{display:inline-block;margin-top:8px;background:#FF6A00;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px}.btn{width:100%;height:54px;background:#E8D5A7;border:none;border-radius:16px;font-size:15px;font-weight:700;color:#2B1E12;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:18px;cursor:pointer}.btn:disabled{opacity:.5}</style></head><body><div class="label">Choisissez un opérateur</div><div class="operators"><div class="op" id="op-orange" onclick="selectOp('orange')"><div class="check">✓</div><img src="https://upload.wikimedia.org/wikipedia/commons/c/c8/Orange_logo.svg"><span>Orange Money (4%)</span></div><div class="op" id="op-moov" onclick="selectOp('moov')"><div class="check">✓</div><img src="https://upload.wikimedia.org/wikipedia/fr/thumb/1/1d/Moov_Africa_logo.png/250px-Moov_Africa_logo.png"><span>Moov Money (5%)</span></div></div><div class="label" id="numeroLabel">Numéro</div>
    <div class="input-box"><span style="margin-right:10px">📞</span><input type="tel" id="numero" placeholder="07 12 34 56" value="${client.telephone || ''}"></div>
    <div class="label">Montant à payer</div><div class="input-box"><span style="margin-right:10px">💳</span>
    <input type="number" id="montant" placeholder="Saisir le montant" min="100"><span class="suffix">FCFA</span></div>
    <div class="label">Détail</div><div class="receive-box"><div class="receive-row"><span>Montant payé</span><span id="payValue">0 FCFA</span></div>
    <div class="receive-row"><span>Frais (<span id="fraisPct">0</span>%)</span><span id="fraisValue" style="color:#C62828">-0 FCFA</span></div>
    <div class="receive-row total"><span>Vous recevrez</span><span id="receiveValue">0 FCFA</span></div></div><div class="otp-box" id="otpBox">
    <div class="label">Code OTP Orange</div><div class="input-box"><span style="margin-right:10px">🔑</span><input type="text" id="otp" placeholder="Entrez le code OTP">
    </div><div class="otp-help" id="otpHelp"><div style="font-size:13px;color:#5A4A35">Composez ce code pour obtenir votre OTP :</div>
    <div id="ussdCode" style="font-weight:700;font-size:16px;margin-top:6px;color:#2B1E12">*144*4*6*1000#</div><a id="ussdLink" href="tel:*144*4*6*1000%23">📞 Obtenir mon OTP</a>
    <div style="font-size:11px;margin-top:6px;color:#8a7a60">Le montant sera mis à jour automatiquement</div>
    </div></div><div class="info"><i>i</i><p id="infoText">Choisis un opérateur pour voir les frais.</p></div><button class="btn" id="submitBtn">↗ Recharger mon wallet</button>
    <div id="result" style="display:none;margin-top:14px;text-align:center;font-size:13px"></div>
    <script>var TOKEN="${token}";var selected=null;function selectOp(op){selected=op;document.getElementById('op-orange').classList.toggle('selected',op==='orange');document.getElementById('op-moov').classList.toggle('selected',op==='moov');document.getElementById('fraisPct').textContent=op==='orange'?'4':'5';document.getElementById('numeroLabel').textContent=op==='orange'?'Numéro Orange Money':'Numéro Moov Money';document.getElementById('otpBox').classList.toggle('show',op==='orange');updateCalcul();}var montantInput=document.getElementById('montant');function updateCalcul(){var v=parseInt(montantInput.value)||0;if(!v)v=1000;var taux=selected==='orange'?0.04:selected==='moov'?0.05:0;var frais=Math.ceil(v*taux);var net=v-frais;document.getElementById('payValue').textContent=v.toLocaleString('fr-FR')+' FCFA';document.getElementById('fraisValue').textContent='-'+frais.toLocaleString('fr-FR')+' FCFA';document.getElementById('receiveValue').textContent=net.toLocaleString('fr-FR')+' FCFA';if(selected)document.getElementById('infoText').textContent='Frais '+(taux*100)+'% : vous payez '+v+'F, vous recevez '+net+'F.';if(selected==='orange'){var ussd='*144*4*6*'+v+'#';var ussdEncoded='*144*4*6*'+v+'%23';document.getElementById('ussdCode').textContent=ussd;document.getElementById('ussdLink').setAttribute('href','tel:'+ussdEncoded);document.getElementById('otpHelp').classList.add('show');}}montantInput.addEventListener('input',updateCalcul);document.getElementById('submitBtn').addEventListener('click',async function(e){e.preventDefault();var btn=e.currentTarget;if(!selected){alert('Choisissez un opérateur');return;}var numero=document.getElementById('numero').value.replace(/\\s+/g,'').replace('+','');var montant=montantInput.value;var otp=document.getElementById('otp').value;if(!numero||!montant){alert('Remplis tous les champs');return;}if(selected==='orange'&&!otp){alert('Entrez le code OTP Orange');return;}btn.disabled=true;btn.textContent='Traitement...';try{var res=await fetch('/api/rechargeWallet/init',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},body:JSON.stringify({montant:montant,numero:numero,operateur:selected,otp:otp})});var data=await res.json();if(!data.success)throw new Error(data.error||'Erreur');var result=document.getElementById('result');result.style.cssText='margin-top:14px;padding:12px;background:#E8F5E9;border-radius:12px;color:#2E7D32;display:block;text-align:center';result.innerHTML='✓ Demande envoyée<br><small>ID: '+data.depositId+'<br>Net: '+data.montantNet+'F, Frais: '+data.frais+'F</small>';var attempts=0;var poll=setInterval(async function(){attempts++;var r=await fetch('/api/rechargeWallet/status/'+data.depositId,{headers:{'Authorization':'Bearer '+TOKEN}});var s=await r.json();if(s.status==='reussie'){clearInterval(poll);result.innerHTML+='<br><b>✓ Wallet crédité de '+s.montantNet+'F !</b>';setTimeout(function(){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:'RECHARGE_SUCCESS',nouveauSolde:s.montantNet}));}},800);}else if(s.status==='echouee'||attempts>=20){clearInterval(poll);if(s.status==='echouee')result.innerHTML+='<br><span style="color:#C62828">✗ Paiement échoué</span>';}},5000);}catch(err){var result=document.getElementById('result');result.style.cssText='margin-top:14px;padding:12px;background:#FFEBEE;border-radius:12px;color:#C62828;display:block;text-align:center';result.textContent='✗ '+err.message;}finally{btn.disabled=false;btn.textContent='Recharger mon wallet';}});</script></body></html>`; 
    res.send(html);
  } catch (err) { res.status(401).send('Token invalide'); }
});

router.post('/init', authUser, async (req, res) => {
  try {
    const { montant, numero, operateur, otp } = req.body;
    const userId = req.user.id;
    if (!montant || !numero || !operateur) return res.status(400).json({ error: 'Champs manquants' });

    const cleanNumero = numero.replace('+','').replace(/\s/g,'');
    const provider = PROVIDER_CONFIG['226'].operators[operateur.toLowerCase()];
    if (!provider) return res.status(400).json({ error: 'Opérateur non supporté' });

    if (operateur.toLowerCase() === 'orange' && !otp) {
      return res.status(400).json({ error: 'Code OTP Orange requis' });
    }

    const { frais, net } = calculerFrais(montant, operateur);
    if (net <= 0) return res.status(400).json({ error: 'Montant trop faible' });

    const depositId = uuidv4();
    console.log('Creating Tx', depositId, 'for user', userId);
    try {
      await Transaction.create({
        type: 'recharge', expediteur: userId, destinataire: userId, motif: 'recharge',
        montant: parseFloat(montant), montantNet: net, frais,
        operateur:operateur +''+ numero, numeroSource: cleanNumero,
        status: 'en_attente', depositId, date: new Date()
      });
      console.log('✅ Tx créée', depositId);
    } catch (dbErr) {
      console.error('❌ ERREUR CREATE TX:', dbErr.message, dbErr.errors);
      return res.status(500).json({ error: 'Erreur DB: ' + dbErr.message });
    }

    // ✅ PAYLOAD CORRECT PAWAPAY
    const payload = {
      depositId,
      amount: String(montant),
      currency: 'XOF',
      payer: {
        type: 'MMO',
        accountDetails: {
          phoneNumber: cleanNumero,
          provider
        }
      },
      customerMessage: 'UniPay Recharge'
    };

    // ✅ Orange = preAuthorisationCode au niveau racine, pas dans accountDetails
    if (operateur.toLowerCase() === 'orange') {
      payload.preAuthorisationCode = String(otp).trim();
    }

    console.log('PAYLOAD PAWAPAY:', JSON.stringify(payload));

    const signature = signPayload(payload);

    const response = await axios.post(
      PAWAPAY_BASE_URL + '/v2/deposits',
      payload,
      { 
        headers: { 
          'Authorization': `Bearer ${PAWAPAY_API_KEY}`, 
          'Content-Type': 'application/json',
          'X-Signature': signature,
          'X-Signature-Algorithm': 'RSASSA-PKCS1-v1_5_SHA256'
        }
      }
    );

    console.log('PAWAPAY RESP:', response.data);

    if (response.data.status === 'ACCEPTED') {
      return res.json({ success: true, depositId, montantNet: net, frais });
    }
    
    await Transaction.findOneAndUpdate({ depositId }, { status: 'echouee' });
    return res.status(400).json({ error: response.data.failureReason?.failureMessage || 'Refusé' });

  } catch (err) {
    console.error('INIT ERROR:', err.response?.data || err.message);
    // Si échec pawaPay, marque échouée
    if (err.config?.data) {
      try {
        const d = JSON.parse(err.config.data);
        if (d.depositId) await Transaction.findOneAndUpdate({ depositId: d.depositId }, { status: 'echouee' });
      } catch(e) {}
    }
    res.status(500).json({ error: err.response?.data?.failureReason?.failureMessage || 'Erreur serveur' });
  }
});

router.get('/status/:depositId', authUser, async (req, res) => {
  const tx = await Transaction.findOne({ depositId: req.params.depositId, expediteur: req.user.id });
  if (!tx) return res.status(404).json({ error: 'Introuvable' });
  res.json({ status: tx.status, montantNet: tx.montantNet });
});

router.post('/callback', async (req, res) => {
  console.log('CALLBACK:', JSON.stringify(req.body));
  try {
    const { depositId, status, amount, payer } = req.body;
    const isSuccess = status === 'COMPLETED';
    
    // 1. Cherche la transaction
    let tx = await Transaction.findOne({ depositId: depositId.trim() });

    if (!tx) {
      console.log(`⚠️ Tx not found ${depositId} - recherche insensible à la casse`);
      tx = await Transaction.findOne({ depositId: { $regex: `^${depositId}$`, $options: 'i' } });
    }

    if (!tx) {
      console.log(`❌ Tx ${depositId} vraiment introuvable en DB. Création de secours`);
      // Si tu es en prod et que tu reçois un COMPLETED sans Tx, c'est que la Tx a été créée sur une autre DB
      // On log et on sort, on ne peut pas créditer sans userId
      // SAUF si tu veux créditer par numéro de téléphone (mode secours)
      if (isSuccess && payer?.accountDetails?.phoneNumber) {
        const phone = payer.accountDetails.phoneNumber.replace('226','');
        // Essaie de trouver un client avec ce numéro et crédite directement
        const clientByPhone = await Client.findOne({ telephone: { $regex: phone } });
        if (clientByPhone) {
          const montantBrut = parseFloat(amount);
          const { frais, net } = calculerFrais(montantBrut, 'moov'); // ou détecte opérateur
          await Client.findByIdAndUpdate(clientByPhone._id, { $inc: { solde: net } });
          console.log(`✅ SECOURS: Crédité ${net}F à ${clientByPhone.telephone} via phone lookup`);
        }
      }
      return res.json({ received: true, note: 'tx not found, secours tenté' });
    }

    if (isSuccess && tx.status !== 'reussie') {
      const montantACrediter = tx.montantNet || (tx.montant - (tx.frais || 0));
      
      await Transaction.findByIdAndUpdate(tx._id, { status: 'reussie', credited: true });
      await Client.findByIdAndUpdate(tx.expediteur, { $inc: { solde: montantACrediter } });
      
      const admin = await Client.findOne({ telephone: ADMIN_TEL });
      if (admin) {
        await Client.findByIdAndUpdate(admin._id, { $inc: { solde: montantACrediter } });
      }
      
      console.log(`✅ Recharge OK: depositId=${depositId} User=${tx.expediteur} +${montantACrediter}F`);
    } else if (!isSuccess) {
      await Transaction.findByIdAndUpdate(tx._id, { status: 'echouee' });
      console.log(`❌ Recharge échouée: ${depositId}`);
    }

    res.json({ received: true });
  } catch (e) {
    console.error('CALLBACK ERROR:', e);
    res.json({ received: true });
  }
});
module.exports = router;
