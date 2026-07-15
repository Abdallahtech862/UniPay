const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const streamifier = require('streamifier');
const Client = require('../models/Client');
const Transaction = require('../models/Transaction');
const { verifyAdmin, authUser } = require('../middleware/auth');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({ storage: multer.memoryStorage() });

const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    if (!process.env.CLOUDINARY_CLOUD_NAME) return reject(new Error('Cloudinary config manquante'));
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'unipay_clients', resource_type: 'image', timeout: 60000 },
      (error, result) => error ? reject(error) : resolve(result)
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
    if (newPassword.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 min)' });

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

router.put('/update-profile', authUser, upload.fields([
  { name: 'photoProfil', maxCount: 1 },
  { name: 'carteRecto', maxCount: 1 },
  { name: 'carteVerso', maxCount: 1 }
]), async (req, res) => {
  try {
    const { nom, prenom, dateNaissance, adresse, numeroCNIB } = req.body;
    const updateData = { nom, prenom, dateNaissance, adresse, numeroCNIB };

    if (req.files?.photoProfil?.[0]) {
      const result = await uploadToCloudinary(req.files.photoProfil[0].buffer);
      updateData.photoProfil = result.secure_url;
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

    const client = await Client.findByIdAndUpdate(req.user.id, updateData, { new: true }).select('-password');
    res.json({ message: 'Profil mis à jour', client });
  } catch (err) {
    console.error(err);
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

router.get('/add', verifyAdmin, (req, res) => {
  res.send(`<!DOCTYPE html><html><head><title>Ajouter Client</title><meta charset="UTF-8"><style>body{font-family:Arial;padding:20px;max-width:600px;margin:auto}input{width:100%;padding:8px;margin:8px 0}button{padding:10px 20px;background:#007bff;color:white;border:none;cursor:pointer}fieldset{border:1px solid #ddd;padding:10px;margin:10px 0}#msg{margin-top:15px;padding:10px}.success{background:#d4edda;color:#155724}.error{background:#f8d7da;color:#721c24}</style></head><body>
<h2>Ajouter un client</h2><a href="/api/clients/admin">← Retour</a><br><br>
<form id="addForm" enctype="multipart/form-data">
<input name="nom" placeholder="Nom" required><input name="prenom" placeholder="Prénom" required><input name="pseudo" placeholder="Pseudo unique" required><input name="email" type="email" placeholder="Email" required><input name="telephone" placeholder="Téléphone" required><input name="solde" type="number" placeholder="Solde initial" value="0">
<fieldset><legend>Limites (PawaPay)</legend><label>Journalière:</label><input name="limiteJournaliere" type="number" value="500000"><label>Mensuelle:</label><input name="limiteMensuelle" type="number" value="2000000"></fieldset>
<fieldset><legend>KYC</legend><input name="numeroCNIB" placeholder="Numéro CNIB"><input name="adresse" placeholder="Adresse"><input name="dateNaissance" type="date"><label>Photo profil:</label><input name="photoProfil" type="file" accept="image/*"><label>CNIB Recto:</label><input name="carteRecto" type="file" accept="image/*"><label>CNIB Verso:</label><input name="carteVerso" type="file" accept="image/*"></fieldset>
<button type="submit">Créer</button></form><div id="msg"></div>
<script>const token=localStorage.getItem('token');if(!token)location.href='/api/auth/login';addForm.onsubmit=async e=>{e.preventDefault();msg.innerText='Envoi...';const fd=new FormData(e.target);try{const res=await fetch('/api/clients',{method:'POST',headers:{'Authorization':'Bearer '+token},body:fd});const data=await res.json();if(res.ok){msg.className='success';msg.innerHTML='Client créé : '+data.client.pseudo;e.target.reset()}else{msg.className='error';msg.innerText=data.error}}catch(err){msg.className='error';msg.innerText=err.message}}</script></body></html>`);
});

router.get('/admin', verifyAdmin, (req, res) => {
  // ... garde ton HTML actuel, il est OK, juste remplace la fonction voirCNI pour afficher verificationStatus
  res.send(`<!DOCTYPE html><html><head><title>UniPay Admin</title><meta charset="UTF-8"><style>body{font-family:Arial;padding:20px}table{border-collapse:collapse;width:100%;margin-top:20px}th,td{border:1px solid #ddd;padding:10px;text-align:left}th{background:#f2f2f2}button{padding:5px 10px;margin:2px;cursor:pointer;border:none;border-radius:3px}.delete{background:#ff4444;color:white}.edit{background:#44bb44;color:white}.block{background:#f59e0b;color:white}.unblock{background:#10b981;color:white}.view{background:#3b82f6;color:white}.limit{background:#8b5cf6;color:white}.reset{background:#ec4899;color:white}.verify{background:#0ea5e9;color:white}img.avatar{width:40px;height:40px;border-radius:50%;object-fit:cover}.search-bar{margin:15px 0;display:flex;gap:10px}.search-bar input{padding:8px;flex:1;max-width:300px}.badge-bloque{background:#ef4444;color:white;padding:2px 8px;border-radius:12px;font-size:12px}.badge-actif{background:#10b981;color:white;padding:2px 8px;border-radius:12px;font-size:12px}.badge-wait{background:#f59e0b;color:white;padding:2px 8px;border-radius:12px;font-size:12px}.modal{display:none;position:fixed;z-index:1000;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,0.8)}.modal-content{margin:5% auto;padding:20px;background:white;width:80%;max-width:600px;border-radius:8px}.modal-content img{width:100%;max-height:400px;object-fit:contain;margin:10px 0}.close{float:right;font-size:28px;cursor:pointer}.form-group{margin:15px 0}.form-group label{display:block;margin-bottom:5px;font-weight:bold}.form-group input{width:100%;padding:8px;box-sizing:border-box}.btn-primary{background:#007bff;color:white;padding:10px 20px;width:100%;margin-top:10px}</style></head><body>
<h2>Gestion Clients UniPay - KYC</h2><button style="float:right" onclick="localStorage.removeItem('token');location.href='/api/auth/login'">Déconnexion</button>
<a href="/api/transactions/add"><button>Transfert</button></a><a href="/api/transactions"><button>Historique</button></a><a href="/api/transactions/dashboard"><button>Dashboard</button></a><a href="/api/clients/add"><button>+ Ajouter</button></a>
<div class="search-bar"><input type="text" id="searchInput" placeholder="pseudo, téléphone, CNIB..." onkeyup="filterClients()"><button onclick="loadClients()">Actualiser</button></div>
<div id="content">Chargement...</div>
<div id="cniModal" class="modal"><div class="modal-content"><span class="close" onclick="closeModal('cniModal')">&times;</span><h3>Vérification KYC</h3><div id="cniContent"></div><div style="margin-top:15px"><button class="verify" onclick="setVerify('verifie')">✅ Vérifier</button><button class="block" onclick="setVerify('rejete')">❌ Rejeter</button></div></div></div>
<div id="limitModal" class="modal"><div class="modal-content"><span class="close" onclick="closeModal('limitModal')">&times;</span><h3>Modifier les limites</h3><div class="form-group"><label>Journalière</label><input type="number" id="limitJour"></div><div class="form-group"><label>Mensuelle</label><input type="number" id="limitMois"></div><button class="btn-primary" onclick="saveLimites()">Enregistrer</button></div></div>
<script>
const token=localStorage.getItem('token');if(!token)location.href='/api/auth/login';let allClients=[];let currentClientId=null;
async function loadClients(){const res=await fetch('/api/clients',{headers:{'Authorization':'Bearer '+token}});if(res.status===401||res.status===403){localStorage.removeItem('token');location.href='/api/auth/login';return}allClients=await res.json();renderTable(allClients)}
function filterClients(){const s=document.getElementById('searchInput').value.toLowerCase();renderTable(allClients.filter(c=>c.pseudo?.toLowerCase().includes(s)||c.telephone?.includes(s)||c.nom?.toLowerCase().includes(s)||c.numeroCNIB?.includes(s)))}
function renderTable(clients){let html='<table><tr><th>Photo</th><th>Client</th><th>Tél / CNIB</th><th>Solde</th><th>Limites</th><th>Statut KYC</th><th>Actions</th></tr>';clients.forEach(c=>{const photo=c.photoProfil?'<img src="'+c.photoProfil+'" class="avatar">':'-';let badgeKyc=c.verificationStatus==='verifie'?'<span class="badge-actif">VERIFIE</span>':c.verificationStatus==='en_cours'?'<span class="badge-wait">EN COURS</span>':'<span style="background:#999;color:white;padding:2px 8px;border-radius:12px;font-size:12px">'+(c.verificationStatus||'NON VERIFIE')+'</span>';const statut=c.bloque?'<span class="badge-bloque">BLOQUÉ</span>':'<span class="badge-actif">ACTIF</span>';const btnBlock=c.bloque?'<button class="unblock" onclick="toggleBlock(\\''+c._id+'\\',false)">Débloquer</button>':'<button class="block" onclick="toggleBlock(\\''+c._id+'\\',true)">Bloquer</button>';html+=\`<tr><td>\${photo}</td><td>\${c.prenom} \${c.nom}<br><small>\${c.pseudo||''}</small></td><td>\${c.telephone}<br><small>\${c.numeroCNIB||''}</small></td><td>\${c.solde.toLocaleString()} FCFA</td><td>\${(c.limiteJournaliere||0).toLocaleString()}/\${(c.limiteMensuelle||0).toLocaleString()}</td><td>\${badgeKyc}<br>\${statut}</td><td><button class="edit" onclick="modifierSolde('\${c._id}','\${c.nom}',\${c.solde})">Solde</button><button class="limit" onclick="modifierLimites('\${c._id}',\${c.limiteJournaliere||0},\${c.limiteMensuelle||0})">Limites</button><button class="view" onclick='voirCNI(\${JSON.stringify(c).replace(/'/g,"&#39;")})'>KYC</button>\${btnBlock}<button class="delete" onclick="supprimerClient('\${c._id}')">X</button></td></tr>\`});html+='</table>';document.getElementById('content').innerHTML=html}
async function setVerify(status){if(!currentClientId)return;const res=await fetch('/api/clients/'+currentClientId+'/verify',{method:'PUT',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({status})});if(res.ok){alert('Statut KYC: '+status);closeModal('cniModal');loadClients()}else{alert('Erreur')}}
function voirCNI(client){currentClientId=client._id;let html='<p><b>'+client.prenom+' '+client.nom+'</b> - '+client.telephone+'</p><p>CNIB: '+(client.numeroCNIB||'-')+'<br>Adresse: '+(client.adresse||'-')+'</p>';if(client.carteRecto)html+='<p>Recto:</p><img src="'+client.carteRecto+'">';if(client.carteVerso)html+='<p>Verso:</p><img src="'+client.carteVerso+'">';if(!client.carteRecto&&!client.carteVerso)html+='<p style="color:#999">Aucune pièce</p>';document.getElementById('cniContent').innerHTML=html;document.getElementById('cniModal').style.display='block'}
function closeModal(id){document.getElementById(id).style.display='none'}async function supprimerClient(id){if(!confirm('Supprimer?'))return;const res=await fetch('/api/clients/'+id,{method:'DELETE',headers:{'Authorization':'Bearer '+token}});if(res.ok)loadClients();else{const d=await res.json();alert(d.error)}}async function modifierSolde(id,nom,s){const n=prompt('Nouveau solde pour '+nom+':',s);if(n===null)return;const res=await fetch('/api/clients/'+id,{method:'PUT',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({solde:Number(n)})});if(res.ok)loadClients()}function modifierLimites(id,j,m){currentClientId=id;document.getElementById('limitJour').value=j;document.getElementById('limitMois').value=m;document.getElementById('limitModal').style.display='block'}async function saveLimites(){const res=await fetch('/api/clients/'+currentClientId,{method:'PUT',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({limiteJournaliere:Number(document.getElementById('limitJour').value),limiteMensuelle:Number(document.getElementById('limitMois').value)})});if(res.ok){closeModal('limitModal');loadClients()}}async function toggleBlock(id,bloquer){if(!confirm((bloquer?'Bloquer':'Débloquer')+' ce client?'))return;await fetch('/api/clients/'+id+'/block',{method:'PUT',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({bloque:bloquer})});loadClients()}loadClients();
</script></body></html>`);
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
