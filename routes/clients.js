const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const streamifier = require('streamifier');
const Client = require('../models/Client');
const Transaction = require('../models/Transaction');
const { verifyAdmin, authUser, verifyToken } = require('../middleware/auth');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({ storage: multer.memoryStorage() });

const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'unipay_clients', resource_type: 'image' },
      (err, result) => err? reject(err) : resolve(result)
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};
// ==================== CLIENT CONNECTÉ ====================

router.get('/me', authUser, async (req, res) => {
  try {
    const client = await Client.findById(req.user.id).select('-password');
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/save-push-token', authUser, async (req, res) => {
  try {
    await Client.findByIdAndUpdate(req.user.id, { expoPushToken: req.body.pushToken });
    res.json({ message: 'Token push enregistré' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/toggle-notifications', authUser, async (req, res) => {
  try {
    const client = await Client.findByIdAndUpdate(req.user.id, { notificationsEnabled: req.body.enabled }, { new: true }).select('-password');
    res.json({ message: `Notifications ${req.body.enabled ? 'activées' : 'désactivées'}`, notificationsEnabled: client.notificationsEnabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/change-password', authUser, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Champs manquants' });
    if (newPassword.length < 4) return res.status(400).json({ error: 'Mot de passe trop court (4 min)' });

    const client = await Client.findById(req.user.id);
    const isMatch = await client.comparePassword(oldPassword);
    if (!isMatch) return res.status(401).json({ error: 'Ancien mot de passe incorrect' });

    client.password = newPassword; // Le pre('save') va hasher
    await client.save();
    res.json({ message: 'Mot de passe modifié' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ROUTE CORRIGÉE
router.post('/update-profile', authUser, upload.fields([
  { name: 'photoProfil', maxCount: 1 },
  { name: 'carteRecto', maxCount: 1 },
  { name: 'carteVerso', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('reçus:');
    //const userId = req.user.id;
    const userId = req.client._id;
    const { nom, prenom } = req.body;
    const updateData = { updatedAt: new Date() };

    if (nom) updateData.nom = nom.trim();
    if (prenom) updateData.prenom = prenom.trim();
    if (nom && prenom) {
      updateData.pseudo = `${prenom.trim()}${nom.trim().charAt(0)}`.toLowerCase().replace(/\s/g,'') + Date.now().toString().slice(-3);
    }

    console.log('Files reçus:', req.files); // pour debug

    if (req.files?.photoProfil?.[0]) {
      const result = await uploadToCloudinary(req.files.photoProfil[0].buffer);
      updateData.photoProfil = result.secure_url; // CORRECTION
    }
    if (req.files?.carteRecto?.[0]) {
      const result = await uploadToCloudinary(req.files.carteRecto[0].buffer);
      updateData.carteRecto = result.secure_url;
      updateData.verificationStatus = 'en_cours';
    }
    if (req.files?.carteVerso?.[0]) {
      const result = await uploadToCloudinary(req.files.carteVerso[0].buffer);
      updateData.carteVerso = result.secure_url;
      updateData.verificationStatus = 'en_cours';
    }

    const updatedUser = await Client.findByIdAndUpdate(userId, { $set: updateData }, { new: true }).select('-password -otpCode -otpExpires');
    if (!updatedUser) return res.status(404).json({ error: 'Utilisateur introuvable' });

    res.json({ message: 'Profil mis à jour avec succès', user: updatedUser });

  } catch (err) {
    console.error('update-profile error:', err);
    if (err.code === 11000) return res.status(400).json({ error: 'Pseudo déjà pris' });
    res.status(500).json({ error: err.message });
  }
});
router.get('/search', authUser, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const clients = await Client.find({
      _id: { $ne: req.user.id },
      $or: [
        { telephone: { $regex: q, $options: 'i' } },
        { pseudo: { $regex: q, $options: 'i' } },
        { nom: { $regex: q, $options: 'i' } }
      ]
    }).select('nom prenom pseudo telephone photoProfil isVerified').limit(10);
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== ADMIN ====================

router.get('/add', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><title>Ajouter Client</title><meta charset="UTF-8"><style>body{font-family:Arial;padding:20px;max-width:600px;margin:auto}input{width:100%;padding:8px;margin:8px 0}button{padding:10px 20px;background:#007bff;color:white;border:none;cursor:pointer}fieldset{border:1px solid #ddd;padding:10px;margin:10px 0}#msg{margin-top:15px;padding:10px}.success{background:#d4edda;color:#155724}.error{background:#f8d7da;color:#721c24}</style></head><body>
<h2>Ajouter un client</h2><a href="/api/clients/admin">← Retour</a><br><br>
<form id="addForm" enctype="multipart/form-data">
<input name="nom" placeholder="Nom" required><input name="prenom" placeholder="Prénom" required><input name="pseudo" placeholder="Pseudo unique" required><input name="email" type="email" placeholder="Email" required><input name="telephone" placeholder="Téléphone" required><input name="password" type="password" placeholder="Mot de passe" value="1234" required><input name="solde" type="number" placeholder="Solde initial" value="0">
<fieldset><legend>Limites (PawaPay)</legend><label>Journalière:</label><input name="limiteJournaliere" type="number" value="500000"><label>Mensuelle:</label><input name="limiteMensuelle" type="number" value="2000000"></fieldset>
<fieldset><legend>KYC</legend><input name="numeroCNIB" placeholder="Numéro CNIB"><input name="adresse" placeholder="Adresse"><input name="dateNaissance" type="date"><label>Photo profil:</label><input name="photoProfil" type="file" accept="image/*"><label>CNIB Recto:</label><input name="carteRecto" type="file" accept="image/*"><label>CNIB Verso:</label><input name="carteVerso" type="file" accept="image/*"></fieldset>
<button type="submit">Créer</button></form><div id="msg"></div>
<script>const token=localStorage.getItem('token');if(!token)location.href='/api/auth/login';addForm.onsubmit=async e=>{e.preventDefault();msg.innerText='Envoi...';const fd=new FormData(e.target);try{const res=await fetch('/api/clients',{method:'POST',headers:{'Authorization':'Bearer '+token},body:fd});const data=await res.json();if(res.ok){msg.className='success';msg.innerHTML='Client créé : '+data.client.pseudo;e.target.reset()}else{msg.className='error';msg.innerText=data.error}}catch(err){msg.className='error';msg.innerText=err.message}}</script></body></html>`);
});


router.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<title>UniPay Admin - KYC</title>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*{box-sizing:border-box}
body{font-family:Inter,Segoe UI,Arial;background:#f6f5f2;margin:0;padding:20px;color:#2b1e12}
h2{margin:0 0 10px}
.topbar{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
.topbar button{padding:8px 14px;border-radius:20px;border:1px solid #e5ddd0;background:white;cursor:pointer;font-weight:600}
.topbar button.primary{background:#2b1e12;color:#f8e7c0;border-color:#2b1e12}
.search-bar{margin:16px 0;display:flex;gap:10px}
.search-bar input{padding:10px 14px;border-radius:12px;border:1px solid #ddd;flex:1;max-width:420px}
table{border-collapse:separate;border-spacing:0;width:100%;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.06);margin-top:10px}
th,td{padding:12px 10px;text-align:left;border-bottom:1px solid #f0ece4;font-size:14px}
th{background:#faf7ef;font-size:12px;text-transform:uppercase;letter-spacing:.6px;color:#8a7a60}
img.avatar{width:42px;height:42px;border-radius:50%;object-fit:cover;border:2px solid #f0e0b8}
.badge{padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;display:inline-block}
.badge-ok{background:#dcfce7;color:#166534}.badge-bloque{background:#fee2e2;color:#991b1b}.badge-wait{background:#fef3c7;color:#92400e}.badge-no{background:#eee;color:#666}
button.action{padding:6px 10px;margin:2px;border-radius:8px;border:none;cursor:pointer;font-size:12px;font-weight:600}
.view{background:#2b1e12;color:#f8e7c0}.block{background:#f59e0b;color:white}.unblock{background:#10b981;color:white}.delete{background:#fff;color:#ef4444;border:1px solid #fee2e2}
.limit{background:#ede9fe;color:#5b21b6}.edit{background:#e0f2fe;color:#075985}
/* MODAL MODERNE */
.modal{display:none;position:fixed;inset:0;z-index:1000;background:rgba(18,12,5,.6);backdrop-filter:blur(6px);padding:16px;overflow:auto}
.modal-card{margin:2% auto;background:white;width:100%;max-width:900px;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);animation:pop .2s ease}
@keyframes pop{from{transform:scale(.96);opacity:0}to{transform:scale(1);opacity:1}}
.modal-header{display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid #f2eee6;background:#fdfbf5}
.modal-header h3{margin:0;font-size:18px}
.close{font-size:28px;cursor:pointer;line-height:1}
.modal-body{display:grid;grid-template-columns:320px 1fr;max-height:80vh}
.modal-left{padding:20px;background:#faf7f0;border-right:1px solid #f0ece4;overflow:auto}
.modal-right{background:#111;display:flex;flex-direction:column;overflow:hidden}
.info-line{margin:8px 0;font-size:13px}.info-line b{display:block;font-size:11px;color:#8a7a60;text-transform:uppercase;margin-bottom:2px}
.cni-viewer{flex:1;overflow:auto;display:flex;scroll-snap-type:x mandatory;gap:0}
.cni-slide{min-width:100%;scroll-snap-align:start;position:relative;background:#000;display:flex;align-items:center;justify-content:center;padding:10px}
.cni-slide img{max-width:100%;max-height:65vh;object-fit:contain;border-radius:12px;cursor:zoom-in;transition:transform .2s}
.cni-slide img.zoomed{transform:scale(1.8);cursor:zoom-out}
.cni-label{position:absolute;top:16px;left:16px;background:rgba(0,0,0,.7);color:white;padding:4px 10px;border-radius:20px;font-size:12px}
.viewer-controls{display:flex;gap:8px;padding:12px;background:#1a1a1a;justify-content:center}
.viewer-controls button{background:#2a2a2a;color:white;border:none;padding:8px 14px;border-radius:8px;cursor:pointer}
.modal-footer{padding:14px 20px;display:flex;gap:10px;justify-content:flex-end;border-top:1px solid #f2eee6;background:white}
.btn-verify{background:#10b981;color:white;padding:10px 18px;border-radius:10px;border:none;font-weight:700;cursor:pointer}
.btn-reject{background:#fff1f2;color:#991b1b;border:1px solid #fecdd3;padding:10px 18px;border-radius:10px;font-weight:700;cursor:pointer}
@media(max-width:800px){.modal-body{grid-template-columns:1fr}.modal-left{order:2}.modal-right{order:1}}
</style>
</head>
<body>
<h2>Gestion Clients UniPay - KYC</h2>
<div class="topbar">
<a href="/api/transactions/add"><button>Transfert</button></a>
<a href="/api/transactions"><button>Historique</button></a>
<a href="/api/transactions/dashboard"><button>Dashboard</button></a>
<a href="/api/clients/add"><button class="primary">+ Ajouter client</button></a>
<button style="margin-left:auto" onclick="localStorage.removeItem('token');location.href='/api/auth/login'">Déconnexion</button>
</div>

<div class="search-bar"><input type="text" id="searchInput" placeholder="Rechercher pseudo, téléphone, CNIB..." onkeyup="filterClients()"><button class="action view" onclick="loadClients()">Actualiser</button></div>
<div id="content">Chargement...</div>

<!-- MODAL KYC MODERNE -->
<div id="cniModal" class="modal">
<div class="modal-card">
<div class="modal-header"><h3>Dossier KYC</h3><span class="close" onclick="closeModal('cniModal')">&times;</span></div>
<div class="modal-body">
<div class="modal-left" id="cniInfos"></div>
<div class="modal-right">
<div class="cni-viewer" id="cniViewer"></div>
<div class="viewer-controls">
<button onclick="scrollViewer(-1)">◀ Recto</button>
<button onclick="toggleZoom()">🔍 Zoom</button>
<button onclick="scrollViewer(1)">Verso ▶</button>
<button onclick="openFull()">⛶ Plein écran</button>
</div>
</div>
</div>
<div class="modal-footer">
<span id="kycStatusText" style="margin-right:auto;font-size:13px;color:#666"></span>
<button class="btn-reject" onclick="setVerify('rejete')">❌ Rejeter</button>
<button class="btn-verify" onclick="setVerify('verifie')">✅ Vérifier ce client</button>
</div>
</div>
</div>

<div id="limitModal" class="modal"><div class="modal-card" style="max-width:420px"><div class="modal-header"><h3>Modifier limites</h3><span class="close" onclick="closeModal('limitModal')">&times;</span></div><div style="padding:20px"><div style="margin-bottom:12px"><b>Journalière</b><input type="number" id="limitJour" style="width:100%;padding:10px;border-radius:8px;border:1px solid #ddd;margin-top:6px"></div><div style="margin-bottom:12px"><b>Mensuelle</b><input type="number" id="limitMois" style="width:100%;padding:10px;border-radius:8px;border:1px solid #ddd;margin-top:6px"></div><button style="width:100%;padding:12px;background:#2b1e12;color:#f8e7c0;border:none;border-radius:10px;font-weight:700" onclick="saveLimites()">Enregistrer</button></div></div></div>

<script>
const token=localStorage.getItem('token');if(!token)location.href='/api/auth/login';
let allClients=[];let currentClientId=null;let currentZoom=false;

async function loadClients(){
 const res=await fetch('/api/clients',{headers:{'Authorization':'Bearer '+token}});
 if(res.status===401||res.status===403){localStorage.removeItem('token');location.href='/api/auth/login';return}
 allClients=await res.json();renderTable(allClients)
}
function filterClients(){
 const s=document.getElementById('searchInput').value.toLowerCase();
 renderTable(allClients.filter(c=>c.pseudo?.toLowerCase().includes(s)||c.telephone?.includes(s)||c.nom?.toLowerCase().includes(s)||c.numeroCNIB?.includes(s)))
}
function renderTable(clients){
 let html='<table><tr><th>Client</th><th>Contact</th><th>Solde</th><th>Limites J/M</th><th>KYC</th><th>Actions</th></tr>';
 clients.forEach(c=>{
  const photo=c.photoProfil?'<img src="'+c.photoProfil+'" class="avatar">':'<div class="avatar" style="background:#eee;display:flex;align-items:center;justify-content:center;font-weight:700">'+(c.prenom?.[0]||'?')+'</div>';
  let badgeKyc=c.verificationStatus==='verifie'?'<span class="badge badge-ok">VERIFIÉ</span>':c.verificationStatus==='en_cours'?'<span class="badge badge-wait">EN COURS</span>':c.verificationStatus==='rejete'?'<span class="badge badge-bloque">REJETÉ</span>':'<span class="badge badge-no">NON VÉRIFIÉ</span>';
  const statut=c.bloque?'<span class="badge badge-bloque">BLOQUÉ</span>':'<span class="badge badge-ok">ACTIF</span>';
  const btnBlock=c.bloque?'<button class="action unblock" onclick="toggleBlock(\\''+c._id+'\\',false)">Débloquer</button>':'<button class="action block" onclick="toggleBlock(\\''+c._id+'\\',true)">Bloquer</button>';
   
  html+=\`<tr><td><div style="display:flex;gap:10px;align-items:center">\${photo}<div><b>\${c.prenom||''} \${c.nom||''}</b><br><small style="color:#8a7a60">\${c.pseudo||''}
  </small></div></div></td><td>\${c.telephone}<br><small>\${c.numeroCNIB||'CNIB: -'}</small></td><td><b>\${(c.solde||0).toLocaleString()} FCFA</b></td>
  <td style="font-size:12px">\${(c.limiteJournaliere||0).toLocaleString()}<br>\${(c.limiteMensuelle||0).toLocaleString()}</td><td>\${badgeKyc}<div style="margin-top:4px">\${statut}
  </div></td><td><button class="action view" onclick='voirCNI(\${JSON.stringify(c).replace(/'/g,"&#39;")})'>
  Voir KYC</button><button class="action limit" onclick="modifierLimites('\${c._id}',\${c.limiteJournaliere||0},\${c.limiteMensuelle||0})">Limites</button><br>\${btnBlock}
  <button class="action delete" onclick="supprimerClient('\${c._id}')">Supp</button><button class="action" style="background:#fef3c7;color:#92400e" onclick="resetPassword('\${c._id}')">1234</button></td></tr>\`;

   });
 html+='</table>';document.getElementById('content').innerHTML=html;
}

function voirCNI(client){
 currentClientId=client._id;
 // Infos gauche
 document.getElementById('cniInfos').innerHTML=\`
  <div class="info-line"><b>Nom complet</b>\${client.prenom||''} \${client.nom||''}</div>
  <div class="info-line"><b>Pseudo</b>\${client.pseudo||'-'}</div>
  <div class="info-line"><b>Téléphone</b>\${client.telephone||'-'}</div>
  <div class="info-line"><b>Email</b>\${client.email||'-'}</div>
  <div class="info-line"><b>CNIB Numéro</b>\${client.numeroCNIB||'<span style=color:#c00>Non renseigné</span>'}</div>
  <div class="info-line"><b>Adresse</b>\${client.adresse||'-'}</div>
  <div class="info-line"><b>Date naissance</b>\${client.dateNaissance?new Date(client.dateNaissance).toLocaleDateString('fr-FR'):'-'}</div>
  <div class="info-line"><b>Statut KYC</b>\${client.verificationStatus||'non_verifie'}</div>
  <div class="info-line"><b>Vérifié</b>\${client.isVerified?'✅ Oui':'❌ Non'}</div>
  <div class="info-line"><b>Créé le</b>\${client.createdAt?new Date(client.createdAt).toLocaleString('fr-FR'):''}</div>
 \`;
 document.getElementById('kycStatusText').innerText='Dossier: '+client._id;

 // Viewer droite scrollable
 let viewerHtml='';
 if(client.carteRecto){
  viewerHtml+=\`<div class="cni-slide"><span class="cni-label">RECTO</span><img id="imgRecto" src="\${client.carteRecto}" onclick="this.classList.toggle('zoomed')"></div>\`;
 }
 if(client.carteVerso){
  viewerHtml+=\`<div class="cni-slide"><span class="cni-label">VERSO</span><img id="imgVerso" src="\${client.carteVerso}" onclick="this.classList.toggle('zoomed')"></div>\`;
 }
 if(!client.carteRecto && !client.carteVerso){
  viewerHtml='<div style="padding:40px;color:#999;text-align:center;width:100%">Aucune pièce CNIB uploadée<br><br>Demande au client de renvoyer via l\\'app mobile</div>';
 }
 document.getElementById('cniViewer').innerHTML=viewerHtml;
 document.getElementById('cniModal').style.display='block';
}

function scrollViewer(dir){
 const el=document.getElementById('cniViewer');
 el.scrollBy({left: dir*el.clientWidth, behavior:'smooth'});
}
function toggleZoom(){
 document.querySelectorAll('.cni-slide img').forEach(img=>img.classList.toggle('zoomed'));
}
function openFull(){
 const el=document.getElementById('cniViewer');
 if(el.requestFullscreen) el.requestFullscreen();
}
function closeModal(id){document.getElementById(id).style.display='none'}
async function setVerify(status){
 if(!currentClientId) return;
 if(!confirm('Passer le statut à '+status+' ?')) return;
 const res=await fetch('/api/clients/'+currentClientId+'/verify',{method:'PUT',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({status})});
 if(res.ok){alert('KYC '+status);closeModal('cniModal');loadClients()}else{const d=await res.json();alert(d.error||'Erreur')}
}
async function supprimerClient(id){if(!confirm('Supprimer ce client?'))return;const res=await fetch('/api/clients/'+id,{method:'DELETE',headers:{'Authorization':'Bearer '+token}});if(res.ok)loadClients();else{const d=await res.json();alert(d.error)}}
function modifierLimites(id,j,m){currentClientId=id;document.getElementById('limitJour').value=j;document.getElementById('limitMois').value=m;document.getElementById('limitModal').style.display='block'}
async function saveLimites(){const res=await fetch('/api/clients/'+currentClientId,{method:'PUT',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({limiteJournaliere:Number(document.getElementById('limitJour').value),limiteMensuelle:Number(document.getElementById('limitMois').value)})});if(res.ok){closeModal('limitModal');loadClients()}}
async function toggleBlock(id,bloquer){if(!confirm((bloquer?'Bloquer':'Débloquer')+' ce client?'))return;await fetch('/api/clients/'+id+'/block',{method:'PUT',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({bloque:bloquer})});loadClients()}
window.onclick=function(e){if(e.target.classList.contains('modal')) e.target.style.display='none'}
loadClients();

async function resetPassword(id){
  if(!confirm('Réinitialiser le mot de passe à 1234 ?')) return;
  const res=await fetch('/api/clients/'+id+'/reset-password',{
    method:'PUT',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
    body: JSON.stringify({ newPassword: '1234' })
  });
  const d=await res.json();
  if(res.ok) alert('Mot de passe reset à 1234');
  else alert(d.error||'Erreur');
}
</script>
</body>
</html>`);
});

// ==================== API ADMIN SECURISEES ====================

router.get('/', verifyAdmin, async (req, res) => {
  try {
    const clients = await Client.find().select('-password').sort({ createdAt: -1 });
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', verifyAdmin, upload.fields([
  { name: 'photoProfil', maxCount: 1 },
  { name: 'carteRecto', maxCount: 1 },
  { name: 'carteVerso', maxCount: 1 }
]), async (req, res) => {
  try {
    const { nom, prenom, pseudo, email, telephone, solde, limiteJournaliere, limiteMensuelle, numeroCNIB, adresse, dateNaissance } = req.body;

    if (await Client.findOne({ pseudo })) return res.status(400).json({ error: 'Pseudo déjà utilisé' });
    if (await Client.findOne({ email })) return res.status(400).json({ error: 'Email déjà utilisé' });
    if (await Client.findOne({ telephone })) return res.status(400).json({ error: 'Téléphone déjà utilisé' });

    const newClient = { nom, prenom, pseudo, email, telephone, solde: Number(solde) || 0, password: telephone, limiteJournaliere: Number(limiteJournaliere) || 500000, limiteMensuelle: Number(limiteMensuelle) || 2000000, numeroCNIB, adresse, dateNaissance };

    if (req.files?.photoProfil?.[0]) {
      const r = await uploadToCloudinary(req.files.photoProfil[0].buffer);
      newClient.photoProfil = r.secure_url;
    }
    if (req.files?.carteRecto?.[0]) {
      const r = await uploadToCloudinary(req.files.carteRecto[0].buffer);
      newClient.carteRecto = r.secure_url;
      newClient.verificationStatus = 'en_cours';
    }
    if (req.files?.carteVerso?.[0]) {
      const r = await uploadToCloudinary(req.files.carteVerso[0].buffer);
      newClient.carteVerso = r.secure_url;
    }

    const client = new Client(newClient);
    await client.save();
    res.status(201).json({ message: 'Client créé', client });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id/verify', verifyAdmin, async (req, res) => {
  try {
    const { status } = req.body; // verifie, rejete, en_cours
    const update = { verificationStatus: status, dateVerification: new Date(), isVerified: status === 'verifie' };
    const client = await Client.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!client) return res.status(404).json({ error: 'Client introuvable' });
    res.json({ message: 'KYC mis à jour', client });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/block', verifyAdmin, async (req, res) => {
  try {
    const client = await Client.findByIdAndUpdate(req.params.id, { bloque: req.body.bloque, raisonBlocage: req.body.bloque ? 'Bloqué par admin' : null }, { new: true });
    res.json({ success: true, client });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/reset-password', verifyAdmin, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client introuvable' });
    client.password = '1234'; // pre('save') va hasher
    await client.save();
    res.json({ success: true, message: 'Mot de passe réinitialisé à 1234' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', verifyAdmin, async (req, res) => {
  try {
    const { solde, limiteJournaliere, limiteMensuelle, numeroCNIB, adresse } = req.body;
    const update = {};
    if (solde !== undefined) update.solde = solde;
    if (limiteJournaliere !== undefined) update.limiteJournaliere = limiteJournaliere;
    if (limiteMensuelle !== undefined) update.limiteMensuelle = limiteMensuelle;
    if (numeroCNIB !== undefined) update.numeroCNIB = numeroCNIB;
    if (adresse !== undefined) update.adresse = adresse;
    update.updatedAt = new Date();
    
    const client = await Client.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!client) return res.status(404).json({ error: 'Client introuvable' });
    res.json({ success: true, client });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client introuvable' });
    if (client.role === 'admin') return res.status(403).json({ error: 'Impossible de supprimer un admin' });
    if (client.solde > 0) return res.status(400).json({ error: `Solde restant ${client.solde} FCFA` });

    await Client.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Client supprimé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
