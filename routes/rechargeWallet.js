const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const Client = require('../models/Client');
const Transaction = require('../models/Transaction');
const { authUser } = require('../middleware/auth');

const PAWAPAY_API_KEY ='eyJraWQiOiIxIiwiYWxnIjoiRVMyNTYifQ.eyJ0dCI6IkFBVCIsInN1YiI6IjI0NzkwIiwibWF2IjoiMSIsImV4cCI6MjA5OTY2Nzc2MywiaWF0IjoxNzg0MDQ4NTYzLCJwbSI6IkRBRixQQUYiLCJqdGkiOiIwMDA3YjEwNy1kNGNjLTQzNjktOGJhZS1kN2U3YzViMGY5NzgifQ.BaUaCKboeg3R7oTHQDiE7Kdeq3_XkoLzY23rprbfSNprvn8OLW-My38Qnyj4BqpAH9mFMDKhL59SjLmtz5OXYA'; 
  //process.env.PAWAPAY_API_KEY;
const PAWAPAY_BASE_URL = process.env.PAWAPAY_BASE_URL || 'https://api.sandbox.pawapay.io';

const PROVIDER_CONFIG = {
  '226': { currency: 'XOF', operators: { orange: 'ORANGE_BFA', moov: 'MOOV_BFA' } }
};

router.get('/recharge-page', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).send('Token manquant');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const client = await Client.findById(decoded.id);
    if (!client) return res.status(401).send('Unauthorized');

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Recharge du wallet</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
body{background:#F9F5ED;min-height:100vh;padding:0 16px 24px}
.header{display:flex;align-items:center;gap:16px;padding:18px 0 20px}
.back{width:36px;height:36px;display:flex;align-items:center;justify-content:center}
.title{font-size:18px;font-weight:700;color:#2B1E12}
.label{font-size:14px;font-weight:600;color:#2B1E12;margin:16px 0 10px}
.operators{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.op{background:#FFFFFF;border:1.5px solid #E9E2D0;border-radius:16px;padding:14px;display:flex;flex-direction:column;align-items:center;gap:10px;cursor:pointer;position:relative}
.op.selected{background:#F1E6CC;border-color:#2B1E12}
.op .check{position:absolute;top:8px;right:8px;width:20px;height:20px;background:#2B1E12;border-radius:50%;display:none;align-items:center;justify-content:center;color:#fff;font-size:12px}
.op.selected .check{display:flex}
.op img{width:64px;height:32px;object-fit:contain}
.op span{font-size:13px;font-weight:600;color:#2B1E12}
.input-box{position:relative;background:#FFFFFF;border:1.5px solid #E9E2D0;border-radius:14px;display:flex;align-items:center;padding:0 14px;height:54px}
.input-box input{flex:1;border:none;outline:none;font-size:14px;background:transparent;color:#2B1E12}
.suffix{font-size:13px;font-weight:700;color:#2B1E12;margin-left:8px}
.receive-box{background:#F1E6CC;border:1.5px solid #E9E2D0;border-radius:14px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;height:54px}
.value{font-weight:700;color:#2B1E12;font-size:16px}
.info{display:flex;gap:10px;background:#FFFFFF;border:1.5px solid #E9E2D0;border-radius:14px;padding:12px 14px;margin-top:16px}
.info i{width:22px;height:22px;border:1.5px solid #2B1E12;border-radius:50%;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:12px;font-weight:700;flex-shrink:0}
.info p{font-size:12.5px;line-height:1.4;color:#5A4A35}
.otp-box{display:none;margin-top:16px}
.otp-box.show{display:block}
.otp-hint{font-size:11.5px;color:#8A7A65;margin-top:8px;background:#FFF7E5;border-radius:10px;padding:8px 10px}
.btn{width:100%;height:54px;background:#E8D5A7;border:none;border-radius:16px;font-size:15px;font-weight:700;color:#2B1E12;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:18px;cursor:pointer}
.btn:disabled{opacity:.5}
</style>
</head>
<body>

<div class="label">Choisissez un opérateur</div>
<div class="operators">
<div class="op" id="op-orange" onclick="selectOp('orange')"><div class="check">✓</div><img src="https://upload.wikimedia.org/wikipedia/commons/c/c8/Orange_logo.svg"><span>Orange Money</span></div>
<div class="op" id="op-moov" onclick="selectOp('moov')"><div class="check">✓</div><img src="https://upload.wikimedia.org/wikipedia/fr/thumb/1/1d/Moov_Africa_logo.png/250px-Moov_Africa_logo.png"><span>Moov Money</span></div>
</div>

<div class="label" id="numeroLabel">Numéro Orange Money</div>
<div class="input-box"><span style="margin-right:10px">📞</span><input type="tel" id="numero" placeholder="07 12 34 56" value="${client.telephone || ''}"></div>

<div class="label">Montant</div>
<div class="input-box"><span style="margin-right:10px">💳</span><input type="number" id="montant" placeholder="Saisir le montant" min="100"><span class="suffix">FCFA</span></div>

<div class="label">Vous recevrez</div>
<div class="receive-box"><div>💳</div><div class="value" id="receiveValue">0 FCFA</div></div>

<div class="otp-box" id="otpBox">
<div class="label">Code OTP Orange</div>
<div class="input-box"><span style="margin-right:10px">🔑</span><input type="text" id="otp" placeholder="Entrez le code OTP"></div>
<div class="otp-hint">Composez <b>*144*4*6*<span id="otpMontant">montant</span>#</b> pour obtenir votre OTP Orange Money</div>
</div>

<div class="info"><i>i</i><p id="infoText">Assurez-vous que votre numéro Orange Money est actif et que vous avez suffisamment de solde.</p></div>

<button class="btn" id="submitBtn">↗ Recharger mon wallet</button>
<div id="result" style="display:none;margin-top:14px;text-align:center;font-size:13px"></div>

<script>
var TOKEN = "${token}";
var selected = null;
var numeroLabel = document.getElementById('numeroLabel');
var infoText = document.getElementById('infoText');
var montantInput = document.getElementById('montant');
var receiveValue = document.getElementById('receiveValue');
var otpBox = document.getElementById('otpBox');
var otpMontant = document.getElementById('otpMontant');
var result = document.getElementById('result');

function selectOp(op){
  selected = op;
  document.getElementById('op-orange').classList.toggle('selected', op==='orange');
  document.getElementById('op-moov').classList.toggle('selected', op==='moov');
  if(op==='orange'){
    numeroLabel.textContent='Numéro Orange Money';
    infoText.textContent='Assurez-vous que votre numéro Orange Money est actif et que vous avez suffisamment de solde.';
    otpBox.classList.add('show');
  } else {
    numeroLabel.textContent='Numéro Moov Money';
    infoText.textContent='Assurez-vous que votre numéro Moov Money est actif et que vous avez suffisamment de solde.';
    otpBox.classList.remove('show');
  }
}

montantInput.addEventListener('input', function(){
  var v = parseInt(montantInput.value)||0;
  receiveValue.textContent = v.toLocaleString('fr-FR') + ' FCFA';
  otpMontant.textContent = v || 'montant';
});

document.getElementById('submitBtn').addEventListener('click', async function(e){
  e.preventDefault();
  var btn = e.currentTarget;
  if(!selected){ alert('Choisissez un opérateur'); return; }
  var numero = document.getElementById('numero').value.replace(/\\s+/g,'').replace('+','');
  var montant = montantInput.value;
  var otp = document.getElementById('otp').value;
  if(!numero || !montant){ alert('Remplis tous les champs'); return; }
  if(selected==='orange' && !otp){ alert('Entrez le code OTP Orange'); return; }

  btn.disabled=true; btn.textContent='Traitement...'; result.style.display='none';

  try{
    var res = await fetch('/api/rechargeWallet/init', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
      body: JSON.stringify({ montant: montant, numero: numero, operateur: selected, otp: otp })
    });
    var data = await res.json();
    if(!data.success) throw new Error(data.error||'Erreur');

    result.style.cssText='margin-top:14px;padding:12px;background:#E8F5E9;border-radius:12px;color:#2E7D32;display:block;text-align:center';
    result.innerHTML='✓ Demande envoyée<br><small>Validez sur votre téléphone<br>ID: '+data.depositId+'</small>';

    var attempts=0;
    var poll=setInterval(async function(){
      attempts++;
      var r=await fetch('/api/rechargeWallet/status/'+data.depositId,{headers:{'Authorization':'Bearer '+TOKEN}});
      var s=await r.json();
      if(s.status==='reussie'){
        clearInterval(poll);
        result.innerHTML+='<br><b>✓ Wallet crédité!</b>';
        setTimeout(function(){ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify({type:'RECHARGE_SUCCESS',nouveauSolde:s.montant})); } },800);
      } else if(s.status==='echouee' || attempts>=20){
        clearInterval(poll);
        if(s.status==='echouee') result.innerHTML+='<br><span style="color:#C62828">✗ Paiement échoué</span>';
      }
    },5000);

  }catch(err){
    result.style.cssText='margin-top:14px;padding:12px;background:#FFEBEE;border-radius:12px;color:#C62828;display:block;text-align:center';
    result.textContent='✗ '+err.message;
  }finally{
    btn.disabled=false; btn.textContent='Recharger mon wallet';
  }
});
</script>
</body>
</html>
    `;
    res.send(html);
  } catch (err) {
    res.status(401).send('Token invalide');
  }
});

router.post('/init', authUser, async (req, res) => {
  try {
    const { montant, numero, operateur, otp } = req.body;
    const userId = req.user.id;
    if (!montant || !numero || !operateur) return res.status(400).json({ error: 'Champs manquants' });

    const cleanNumero = numero.replace('+','').replace(/\s/g,'');
    const config = PROVIDER_CONFIG['226'];
    const provider = config.operators[operateur.toLowerCase()];
    if (!provider) return res.status(400).json({ error: 'Opérateur non supporté' });

    const depositId = uuidv4();
    const tx = await Transaction.create({
      type: 'recharge', expediteur: userId, destinataire: userId,
      montant: parseFloat(montant), operateur, numeroSource: cleanNumero,
      status: 'en_attente', depositId, date: new Date()
    });

    const payload = {
      depositId: depositId,
      amount: String(montant),
      currency: 'XOF',
      payer: { type: 'MMO', accountDetails: { phoneNumber: cleanNumero, provider: provider } },
      customerMessage: 'UniPay Recharge'
    };
    if (operateur === 'orange' && otp) payload.payer.accountDetails.otp = otp;

    console.log('PAWAPAY REQUEST:', payload);
    console.log(${process.env.PAWAPAY_API_KEY});
    const response = await axios.post(
      PAWAPAY_BASE_URL + '/v2/deposits',
      payload,
      { headers: { 'Authorization':`Bearer ${process.env.PAWAPAY_API_KEY}`, 'Content-Type': 'application/json' } }
    );

    if (response.data.status === 'ACCEPTED') {
      return res.json({ success: true, depositId: depositId, transactionId: tx._id });
    }
    await Transaction.findByIdAndUpdate(tx._id, { status: 'echouee' });
    return res.status(400).json({ error: response.data.failureReason?.failureMessage || 'Paiement refusé' });

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
  console.log('CALLBACK:', req.body);
  try {
    const { depositId, status } = req.body;
    const newStatus = status === 'COMPLETED' ? 'reussie' : 'echouee';
    const tx = await Transaction.findOneAndUpdate({ depositId: depositId }, { status: newStatus }, { new: true });
    if (newStatus === 'reussie' && tx) {
      await Client.findByIdAndUpdate(tx.expediteur, { $inc: { solde: tx.montant } });
    }
    res.json({ received: true });
  } catch (e) { res.status(500).json({ error: 'err' }); }
});

module.exports = router;
