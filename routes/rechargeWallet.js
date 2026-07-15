const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
//const crypto = require('crypto');
const Client = require('../models/Client');
const Transaction = require('../models/Transaction');
const { authUser } = require('../middleware/auth');

// Met ça dans .env, JAMAIS en dur
const PAWAPAY_API_KEY = process.env.PAWAPAY_API_KEY;
const PAWAPAY_BASE_URL = process.env.PAWAPAY_BASE_URL || 'https://api.sandbox.pawapay.io';
const PAWAPAY_WEBHOOK_SECRET = process.env.PAWAPAY_WEBHOOK_SECRET;

const PROVIDER_CONFIG = {
  '226': { currency: 'XOF', operators: { orange: 'ORANGE_BFA', moov: 'MOOV_BFA' } },
  '221': { currency: 'XOF', operators: { orange: 'ORANGE_SEN', free: 'FREE_SEN' } }
};

// ─── Page HTML identique au screen ──────────────────────────────────────────
router.get('/recharge-page', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(401).send('Token manquant');

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
  <title>Recharge du wallet</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box;font-family:'Inter',sans-serif}
    body{background:#F9F5ED;min-height:100vh;padding:0 16px 24px}
    .header{display:flex;align-items:center;gap:16px;padding:18px 0 20px}
    .back{width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer}
    .title{font-size:18px;font-weight:700;color:#2B1E12}
    .label{font-size:14px;font-weight:600;color:#2B1E12;margin:16px 0 10px}
    .operators{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .op{background:#FFFFFF;border:1.5px solid #E9E2D0;border-radius:16px;padding:14px;display:flex;flex-direction:column;align-items:center;gap:10px;cursor:pointer;position:relative;transition:.2s}
    .op.selected{background:#F1E6CC;border-color:#2B1E12}
    .op .check{position:absolute;top:8px;right:8px;width:20px;height:20px;background:#2B1E12;border-radius:50%;display:none;align-items:center;justify-content:center;color:#fff;font-size:12px}
    .op.selected .check{display:flex}
    .op img{width:64px;height:32px;object-fit:contain}
    .op span{font-size:13px;font-weight:600;color:#2B1E12}
    .input-box{position:relative;background:#FFFFFF;border:1.5px solid #E9E2D0;border-radius:14px;display:flex;align-items:center;padding:0 14px;height:54px}
    .input-box:focus-within{border-color:#2B1E12}
    .input-box .icon{margin-right:10px;opacity:.7}
    .input-box input{flex:1;border:none;outline:none;font-size:14px;background:transparent;color:#2B1E12}
    .input-box .suffix{font-size:13px;font-weight:700;color:#2B1E12;margin-left:8px}
    .receive-box{background:#F1E6CC;border:1.5px solid #E9E2D0;border-radius:14px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;height:54px;margin-top:2px}
    .receive-box .left{display:flex;align-items:center;gap:10px;color:#7A6A52}
    .receive-box .value{font-weight:700;color:#2B1E12;font-size:16px}
    .info{display:flex;gap:10px;background:#FFFFFF;border:1.5px solid #E9E2D0;border-radius:14px;padding:12px 14px;margin-top:16px}
    .info i{width:22px;height:22px;border:1.5px solid #2B1E12;border-radius:50%;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:12px;font-weight:700;flex-shrink:0}
    .info p{font-size:12.5px;line-height:1.4;color:#5A4A35}
    .otp-box{display:none;margin-top:16px}
    .otp-box.show{display:block}
    .otp-hint{font-size:11.5px;color:#8A7A65;margin-top:8px;line-height:1.3;background:#FFF7E5;border-radius:10px;padding:8px 10px}
    .btn{width:100%;height:54px;background:#E8D5A7;border:none;border-radius:16px;font-size:15px;font-weight:700;color:#2B1E12;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:18px;cursor:pointer}
    .btn:disabled{opacity:.5}
    .hidden{display:none}
  </style>
</head>
<body>
  <div class="header">
    <div class="back" onclick="window.history.back()">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2B1E12" stroke-width="2"><path d="M19 12H5"/><path d="M12 19L5 12L12 5"/></svg>
    </div>
    <div class="title">Recharge du wallet</div>
  </div>

  <div class="label">Choisissez un opérateur</div>
  <div class="operators">
    <div class="op" id="op-orange" onclick="selectOp('orange')">
      <div class="check">✓</div>
      <img src="https://upload.wikimedia.org/wikipedia/commons/c/c8/Orange_logo.svg" alt="Orange">
      <span>Orange Money</span>
    </div>
    <div class="op" id="op-moov" onclick="selectOp('moov')">
      <div class="check">✓</div>
      <img src="https://upload.wikimedia.org/wikipedia/commons/9/9a/Moov_Africa_logo.png" alt="Moov">
      <span>Moov Money</span>
    </div>
  </div>

  <div class="label" id="numeroLabel">Numéro Orange Money</div>
  <div class="input-box">
    <span class="icon">📞</span>
    <input type="tel" id="numero" placeholder="07 12 34 56" value="${client.telephone || ''}">
  </div>

  <div class="label">Montant</div>
  <div class="input-box">
    <span class="icon">💳</span>
    <input type="number" id="montant" placeholder="Saisir le montant" min="100">
    <span class="suffix">FCFA</span>
  </div>

  <div class="label">Vous recevrez</div>
  <div class="receive-box">
    <div class="left"><span>💳</span></div>
    <div class="value" id="receiveValue">0 FCFA</div>
  </div>

  <div class="otp-box" id="otpBox">
    <div class="label">Code OTP Orange</div>
    <div class="input-box">
      <span class="icon">🔑</span>
      <input type="text" id="otp" placeholder="Entrez le code OTP">
    </div>
    <div class="otp-hint">
      Composez <b>*144*4*6*<span id="otpMontant">montant</span>#</b> pour obtenir votre OTP Orange Money
    </div>
  </div>

  <div class="info">
    <i>i</i>
    <p id="infoText">Assurez-vous que votre numéro Orange Money est actif et que vous avez suffisamment de solde.</p>
  </div>

  <button class="btn" id="submitBtn">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
    Recharger mon wallet
  </button>
  <div id="result" class="hidden" style="margin-top:14px;text-align:center;font-size:13px"></div>

<script>
  const TOKEN = "${token}";
  let selected = null;
  const numeroLabel = document.getElementById('numeroLabel');
  const infoText = document.getElementById('infoText');
  const montantInput = document.getElementById('montant');
  const receiveValue = document.getElementById('receiveValue');
  const otpBox = document.getElementById('otpBox');
  const otpMontant = document.getElementById('otpMontant');
  const result = document.getElementById('result');

  function selectOp(op){
    selected = op;
    document.getElementById('op-orange').classList.toggle('selected', op==='orange');
    document.getElementById('op-moov').classList.toggle('selected', op==='moov');
    
    if(op==='orange'){
      numeroLabel.textContent='Numéro Orange Money';
      infoText.textContent="Assurez-vous que votre numéro Orange Money est actif et que vous avez suffisamment de solde.";
      otpBox.classList.add('show');
    } else {
      numeroLabel.textContent='Numéro Moov Money';
      infoText.textContent="Assurez-vous que votre numéro Moov Money est actif et que vous avez suffisamment de solde.";
      otpBox.classList.remove('show');
    }
  }

  montantInput.addEventListener('input', ()=>{
    const v = parseInt(montantInput.value)||0;
    receiveValue.textContent = v.toLocaleString('fr-FR') + ' FCFA';
    otpMontant.textContent = v || 'montant';
  });

  document.getElementById('submitBtn').addEventListener('click', async (e)=>{
    e.preventDefault();
    const btn = e.currentTarget;
    if(!selected) return alert('Choisissez un opérateur');
    const numero = document.getElementById('numero').value.replace(/\\s+/g,'').replace('+','');
    const montant = montantInput.value;
    const otp = document.getElementById('otp').value;

    if(!numero || !montant) return alert('Remplis tous les champs');
    if(selected==='orange' && !otp) return alert('Entrez le code OTP Orange');

    btn.disabled=true;
    btn.textContent='Traitement...';
    result.classList.add('hidden');

    try{
      const res = await fetch('/api/rechargeWallet/init', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
        body: JSON.stringify({ montant, numero, operateur: selected, otp })
      });
      const data = await res.json();
      if(!data.success) throw new Error(data.error||'Erreur');

      result.className='';
      result.style.cssText='margin-top:14px;padding:12px;background:#E8F5E9;border-radius:12px;color:#2E7D32';
      result.innerHTML='✓ Demande envoyée<br><small>Validez sur votre téléphone<br>ID: '+data.depositId+'</small>';
      result.classList.remove('hidden');

      let attempts=0;
      const poll=setInterval(async()=>{
        attempts++;
        const r=await fetch('/api/rechargeWallet/status/'+data.depositId,{headers:{'Authorization':'Bearer '+TOKEN}});
        const s=await r.json();
        if(s.status==='reussie'){
          clearInterval(poll);
          result.innerHTML+='<br><b>✓ Wallet crédité!</b>';
          setTimeout(()=>window.ReactNativeWebView?.postMessage(JSON.stringify({type:'RECHARGE_SUCCESS',nouveauSolde:s.montant})),800);
        } else if(s.status==='echouee' || attempts>=20){
          clearInterval(poll);
          if(s.status==='echouee') result.innerHTML+='<br><span style="color:#C62828">✗ Paiement échoué</span>';
        }
      },5000);

    }catch(err){
      result.style.cssText='margin-top:14px;padding:12px;background:#FFEBEE;border-radius:12px;color:#C62828';
      result.textContent='✗ '+err.message;
      result.classList.remove('hidden');
    }finally{
      btn.disabled=false;
      btn.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Recharger mon wallet';
    }
  });
</script>
</body>
</html>
    `);
  } catch (err) {
    res.status(401).send('Token invalide');
  }
});

// ─── POST /init ───────────────────────────────────────────────────────────────
router.post('/init', authUser, async (req, res) => {
  try {
    const { montant, numero, operateur, otp } = req.body;
    const userId = req.user.id;

    if (!montant || !numero || !operateur) {
      return res.status(400).json({ error: 'Champs manquants' });
    }

    const cleanNumero = numero.replace('+','').replace(/\s/g,'');
    if(!cleanNumero.startsWith('226')) return res.status(400).json({ error: 'Numéro doit commencer par 226' });

    const config = PROVIDER_CONFIG['226'];
    const provider = config.operators[operateur.toLowerCase()];
    if (!provider) return res.status(400).json({ error: 'Opérateur non supporté' });

    if (operateur==='orange' && !otp) {
      return res.status(400).json({ error: 'OTP requis pour Orange Money' });
    }

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

    const pawapayPayload = {
      depositId,
      amount: String(montant),
      currency: 'XOF',
      payer: {
        type: "MMO",
        accountDetails: { phoneNumber: cleanNumero, provider }
      },
      customerMessage: "UniPay Recharge"
    };

    // Si Orange, PawaPay veut l'OTP dans certains cas
    if (operateur==='orange' && otp) {
      pawapayPayload.payer.accountDetails.otp = otp;
    }

    console.log('PAWAPAY REQUEST:', pawapayPayload);

    const { data } = await axios.post(
      \`\${PAWAPAY_BASE_URL}/v2/deposits\`,
      pawapayPayload,
      { headers: { 'Authorization': \`Bearer \${PAWAPAY_API_KEY}\`, 'Content-Type': 'application/json' } }
    );

    if (data.status === 'ACCEPTED') {
      return res.json({ success: true, depositId, transactionId: tx._id });
    }

    await Transaction.findByIdAndUpdate(tx._id, { status: 'echouee' });
    return res.status(400).json({ error: data.failureReason?.failureMessage || 'Paiement refusé' });

  } catch (err) {
    console.error('PAWAPAY INIT ERROR:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.failureReason?.failureMessage || 'Erreur serveur' });
  }
});

router.get('/status/:depositId', authUser, async (req, res) => {
  const tx = await Transaction.findOne({ depositId: req.params.depositId, expediteur: req.user.id });
  if (!tx) return res.status(404).json({ error: 'Introuvable' });
  res.json({ status: tx.status, montant: tx.montant });
});

router.post('/callback', async (req, res) => {
  console.log('CALLBACK RAW:', req.body);
  try {
    const { depositId, status } = req.body;
    const newStatus = status==='COMPLETED' ? 'reussie' : 'echouee';
    const tx = await Transaction.findOneAndUpdate({ depositId }, { status: newStatus }, { new: true });
    if (newStatus==='reussie' && tx) {
      await Client.findByIdAndUpdate(tx.expediteur, { $inc: { solde: tx.montant } });
    }
    res.json({ received: true });
  } catch (e) { res.status(500).json({ error: 'err' }); }
});

module.exports = router;
