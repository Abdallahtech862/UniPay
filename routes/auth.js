const express = require('express');
const router = express.Router();
const multer = require('multer');
const streamifier = require('streamifier');
const { v2: cloudinary } = require('cloudinary');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Client = require('../models/Client');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// DÉFINIS LA FONCTION ICI
router.get('/cloudinary-test', async (req, res) => {
  try {
    const result = await cloudinary.api.ping();
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message, details: err });
  }
});
// test login transfert
// test login transfert
router.get('/login-test', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Login Test</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:Arial;max-width:400px;margin:50px auto;padding:20px">
  <h2>Login UniPay</h2>
  <form id="loginForm">
    <label>Email ou Téléphone</label>
    <input 
      name="identifier" 
      placeholder="admin@unipay.bf ou 0771234567" 
      required 
      style="width:100%;padding:10px;margin:8px 0;box-sizing:border-box"
    >
    <label>Mot de passe</label>
    <input 
      name="password" 
      type="password" 
      placeholder="Mot de passe" 
      required 
      style="width:100%;padding:10px;margin:8px 0;box-sizing:border-box"
    >
    <button 
      type="submit" 
      style="width:100%;padding:12px;background:#007bff;color:white;border:none;cursor:pointer;border-radius:4px"
    >
      Se connecter
    </button>
  </form>
  <div id="msg" style="margin-top:15px;padding:10px;border-radius:4px;display:none"></div>
  
  <script>
    loginForm.onsubmit = async e => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target));
      console.log('Envoi:', body);
      
      msg.style.display = 'block';
      msg.style.background = '#fff3cd';
      msg.innerText = 'Connexion...';
      
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        console.log('Réponse:', data);
        
        if (res.ok) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          msg.style.background = '#d4edda';
          msg.innerHTML = 'Connecté en tant que <b>' + data.role + '</b><br>' +
                          'Nom: ' + data.user.nom + ' ' + data.user.prenom + '<br>' +
                          '<a href="/api/transactions/add">Aller au transfert</a>';
        } else {
          msg.style.background = '#f8d7da';
          msg.innerText = 'Erreur: ' + data.error;
        }
      } catch (err) {
        msg.style.background = '#f8d7da';
        msg.innerText = 'Erreur réseau: ' + err.message;
      }
    };
  </script>
</body>
</html>`);
});

router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    // ✅ Cherche par email OU telephone
    const user = await Client.findOne({
      $or: [
        { email: identifier },
        { telephone: identifier }
      ]
    });

    if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Identifiants incorrects' });

    const token = jwt.sign(
      { id: user._id, role: user.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: user.role === 'admin'? '24h' : '7d' }
    );
    
    res.json({ 
      message: 'Connexion réussie', 
      token, 
      user,
      role: user.role
    });
  } catch (err) {
    console.error('Erreur login:', err);
    res.status(500).json({ error: err.message });
  }
});

//fin des test
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    console.log('Cloudinary upload start. Cloud:', process.env.CLOUDINARY_CLOUD_NAME);
    
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
      return reject(new Error('Variables Cloudinary manquantes'));
    }

    const stream = cloudinary.uploader.upload_stream(
      { 
        folder: 'unipay_clients',
        resource_type: 'image',
        timeout: 60000
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary ERROR complet:', JSON.stringify(error, null, 2));
          reject(new Error(`Cloudinary: ${error.message || error}`));
        } else {
          console.log('Cloudinary SUCCESS:', result.secure_url);
          resolve(result);
        }
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

// test register

router.post('/register', upload.fields([
  { name: 'carteRecto', maxCount: 1 },
  { name: 'carteVerso', maxCount: 1 }
]), async (req, res) => {
  try {
    const { nom, prenom, telephone, email, password } = req.body;
    
    if (!nom || !prenom || !telephone || !password) {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }

    if (await Client.findOne({ $or: [{ email }, { telephone }] })) {
      return res.status(400).json({ error: 'Email ou téléphone déjà utilisé' });
    }

    let carteRectoUrl = null;
    let carteVersoUrl = null;

    if (req.files?.carteRecto?.[0]) {
      const result = await uploadToCloudinary(req.files.carteRecto[0].buffer);
      carteRectoUrl = result.secure_url;
    }

    if (req.files?.carteVerso?.[0]) {
      const result = await uploadToCloudinary(req.files.carteVerso[0].buffer);
      carteVersoUrl = result.secure_url;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const client = new Client({
      nom: nom.trim(),
      prenom: prenom.trim(),
      telephone,
      email: email || `${telephone.replace('+226', '')}@unipay.local`,
      password: hashedPassword, // Déjà hashé
      solde: 0,
      role: 'client',
      limiteJournaliere: 500000,
      limiteMensuelle: 5000000,
      carteRecto: carteRectoUrl,
      carteVerso: carteVersoUrl
    });
    
    await client.save(); // Plus de pre('save') donc pas de double hash
    
    const token = jwt.sign({ id: client._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ message: 'Compte créé', token });
    
  } catch (err) {
    console.error('Erreur register:', err);
    res.status(500).json({ error: err.message });
  }
});

// 1. Check si tel/email existe
router.post('/check-user', async (req, res) => {
  try {
    const { identifier } = req.body; // +22670879425 ou email
    const user = await Client.findOne({
      $or: [{ telephone: identifier }, { email: identifier }]
    });
    res.json({ exists: !!user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Login avec password + envoi OTP
router.post('/login-password', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const user = await Client.findOne({
      $or: [{ telephone: identifier }, { email: identifier }]
    });

    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ error: 'Mot de passe incorrect' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    user.otpCode = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000; // 5min
    await user.save(); // ← CRUCIAL

    console.log(`OTP pour ${identifier}: ${otp}, expire: ${new Date(user.otpExpires)}`);
    res.json({ message: 'OTP envoyé', otp }); // Retire otp en prod
    
  } catch (err) {
    console.error('Erreur login-password:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Vérifier OTP et connecter
const Transaction = require('../models/Transaction'); // Assure-toi que le chemin est bon
router.post('/verify-otp', async (req, res) => {
  try {
    const { identifier, otp } = req.body;

    const user = await Client.findOne({
      $or: [{ telephone: identifier }, { email: identifier }]
    }); // ← Enlève .select('-password')

    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (!user.otpCode || user.otpCode!== otp) return res.status(401).json({ error: 'Code invalide' });
    if (!user.otpExpires || Date.now() > new Date(user.otpExpires).getTime()) {
      return res.status(401).json({ error: 'Code expiré' });
    }

    const transactions = await Transaction.find({
      $or: [{ senderId: user._id }, { receiverId: user._id }]
    })
     .sort({ createdAt: -1 })
     .limit(20)
     .populate('senderId', 'nom prenom telephone')
     .populate('receiverId', 'nom prenom telephone');

    user.otpCode = null;
    user.otpExpires = null;
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'Connexion réussie',
      token,
      passwordHash: user.password, // ← AJOUTE CETTE LIGNE
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        pseudo: user.pseudo || `${user.prenom}${user.nom.charAt(0)}`,
        telephone: user.telephone,
        email: user.email,
        photoProfil: user.photoProfil || null,
        solde: user.solde,
        carteRecto: user.carteRecto,
        carteVerso: user.carteVerso,
        isVerified: user.isVerified,
        limiteJournaliere: user.limiteJournaliere,
        limiteMensuelle: user.limiteMensuelle,
        step: 'done'
      },
      historique: transactions.map(t => ({
        id: t._id,
        type: t.senderId._id.equals(user._id)? 'envoi' : 'reception',
        montant: t.montant,
        frais: t.frais || 0,
        contact: t.senderId._id.equals(user._id)? t.receiverId : t.senderId,
        motif: t.motif || '',
        status: t.status,
        date: t.createdAt
      }))
    });

  } catch (err) {
    console.error('Erreur verify-otp:', err);
    res.status(500).json({ error: err.message });
  }
});


// POST /api/auth/login-phone
router.post('/login-phone', async (req, res) => {
  try {
    const { telephone } = req.body;
    const client = await Client.findOne({ telephone }).select('-password');
    if (!client) return res.status(404).json({ error: 'Compte introuvable' });

    const token = jwt.sign({ id: client._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Connexion réussie', token, user: client });
  } catch (err) {
    console.error('Erreur login-phone:', err);
    res.status(500).json({ error: err.message });
  }
});


router.post('/loginn', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    // Cherche par tel OU email
    const user = await Client.findOne({
      $or: [{ telephone: identifier }, { email: identifier }]
    });

    if (!user) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    // Compare le password avec le hash bcrypt
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'Connexion réussie',
      token,
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        pseudo: user.pseudo,
        telephone: user.telephone,
        email: user.email,
        solde: user.solde
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// POST /api/auth/check-phone
router.post('/check-phone', async (req, res) => {
  try {
    const { telephone } = req.body;
    const client = await Client.findOne({ telephone });
    res.json({ exists:!!client });
  } catch (err) {
    console.error('Erreur check-phone:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login-phone
router.post('/login-phonee', async (req, res) => {
  try {
    const { telephone } = req.body;
    const client = await Client.findOne({ telephone }).select('-password');
    if (!client) return res.status(404).json({ error: 'Compte introuvable' });

    const token = jwt.sign({ id: client._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Connexion réussie', token, user: client });
  } catch (err) {
    console.error('Erreur login-phone:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
