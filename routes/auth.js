const express = require('express');
const router = express.Router();
const multer = require('multer');
const streamifier = require('streamifier');
const { v2: cloudinary } = require('cloudinary');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Client = require('../models/Client');
const { sendSMSOrange } = require('../utils/sendSMS');

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


// test login admin
router.get('/login', (req, res) => {
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
                          '<a href="/api/transactions">Aller au transfert</a>';
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
    const user = await Client.findOne({
      $or: [{ email: identifier }, { telephone: identifier }]
    });

    if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });
    if (user.bloque) return res.status(403).json({ error: 'Compte bloqué. Contactez le support.' }); // ✅

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Identifiants incorrects' });

    const token = jwt.sign(
      { id: user._id, role: user.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: user.role === 'admin'? '24h' : '7d' }
    );
    
    res.json({ message: 'Connexion réussie', token, user, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/// route pour creer des nouveaus utilisateurs
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
    //const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const pseudo = `${prenom.trim()}${nom.trim().charAt(0)}`;
    const client = new Client({
      nom: nom.trim(),
      prenom: prenom.trim(),
      //token,
      pseudo,
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
    const user = client.toObject();
    //delete user.password;
    res.status(201).json({message: 'Compte créé',token,user});   
  } catch (err) {
    console.error('Erreur register:', err);
    res.status(500).json({ error: err.message });
  }
});

//verifie si un utilisateur existe
router.post('/check-userr', async (req, res) => {
  try {
    let { identifier } = req.body;
    if (!identifier) return res.status(400).json({ error: "identifier manquant" });

    identifier = identifier.trim();

    // Normalise AVANT de chercher
    let normalizedPhone = identifier;
    if (!identifier.includes('@')) {
      // Enlève espaces
      normalizedPhone = identifier.replace(/\s/g, '');
      if (!normalizedPhone.startsWith('+')) {
        if (normalizedPhone.startsWith('226')) normalizedPhone = '+' + normalizedPhone;
        else if (!normalizedPhone.startsWith('+226')) normalizedPhone = '+226' + normalizedPhone;
      }
    }

    const query = identifier.includes('@') 
      ? { email: identifier.toLowerCase() }
      : { $or: [{ telephone: identifier }, { telephone: normalizedPhone }] };

    const user = await Client.findOne(query);

    if (user) {
      return res.json({ exists: true, userId: user._id });
    }

    // Si user n'existe pas
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`OTP pour ${normalizedPhone}: ${otp}`); // A retirer en prod

    const message = `Votre code UniPay : ${otp}. Valide 5 min.`;
    
    const smsSent = await sendSMSOrange(normalizedPhone, message);

    if (!smsSent) {
      return res.status(500).json({ error: "Échec envoi SMS Orange - POL0001" });
    }

    return res.json({
      exists: false,
      message: "OTP envoyé"
      // NE JAMAIS renvoyer otp:otp au frontend !
    });

  } catch (err) {
    console.error('CHECK-USER ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/check-user', async (req, res) => {
  try {
    let { identifier } = req.body;

    const user = await Client.findOne({
      $or: [
        { telephone: identifier },
        { email: identifier }
      ]
    });

    // L'utilisateur existe
    if (user) {
      return res.json({
        exists: true
      });
    }

    // Si c'est un numéro, ajouter +226 s'il n'est pas présent
    if (!identifier.includes('@') && !identifier.startsWith('+226')) {
      identifier = '+226' + identifier;
    }

    // Générer un OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // TODO : Stocker l'OTP (Redis, collection OTP, etc.)

    const message = `Votre code UniPay : ${otp}. Valide 5 min. Ne le partagez jamais.`;
    
    const smsSent = await sendSMSOrange(identifier, message);

    if (!smsSent) {
      return res.status(500).json({
        error: "Échec de l'envoi du SMS"
      });
    }

    return res.json({
      exists: false,
      message: "OTP envoyé",
      otp:otp
    });

  } catch (err) {
    console.error('CHECK-USER ERROR:', err); 
    res.status(500).json({
      error: err.message
    });
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

    if (user.bloque) {
      return res.status(403).json({ 
        error: 'Votre compte a été suspendu. Contactez le support UniPay.' 
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    user.otpCode = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000;
    await user.save();

    // ← Envoi SMS réel ici
    const message = `Votre code UniPay: ${otp}. Valide 5 min. Ne le partagez jamais.`;
    const smsSent = await sendSMSOrange(user.telephone, message);
    console.log(user.telephone, message);
    if (!smsSent) {
    return res.status(500).json({
      error: "Échec envoi SMS"
    });
  }
    res.json({ message: 'OTP envoyé par SMS' }); // ← Plus de otp dans la réponse
    
  } catch (err) {
    console.error('Erreur login-password:', err);
    res.status(500).json({ error: err.message });
  }
});

// Ajoute une route pour nouveau user aussi
router.post('/verify-otpp', async (req, res) => {
  try {
    const { identifier } = req.body;
    const exists = await Client.findOne({
      $or: [{ telephone: identifier }, { email: identifier }]
    });
    
    if (exists) return res.status(400).json({ error: 'Compte déjà existant' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Stockage temporaire en DB ou Redis. Ici on crée un user temp
    await Client.create({
      telephone: identifier.includes('@') ? null : identifier,
      email: identifier.includes('@') ? identifier : null,
      otpCode: otp,
      otpExpires: Date.now() + 5 * 60 * 1000,
      isVerified: false
    });

    const message = `Votre code UniPay: ${otp}. Valide 5 min.`;
    await sendSMSOrange(identifier, message);

    res.json({ message: 'OTP envoyé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Login avec password + envoi OTP
router.post('/login-passwordd', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const user = await Client.findOne({
      $or: [{ telephone: identifier }, { email: identifier }]
    });

    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const isMatch = await user.comparePassword(password);
    console.log('Test compare:', password, user.password, isMatch);
    if (!isMatch) return res.status(401).json({ error: 'Mot de passe incorrect' });

    // ✅ Vérif si client bloqué
    if (user.bloque) {
      return res.status(403).json({ 
        error: 'Votre compte a été suspendu. Contactez le support UniPay.' 
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    user.otpCode = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000; // 5min
    await user.save();

    console.log(`OTP pour ${identifier}: ${otp}, expire: ${new Date(user.otpExpires)}`);
    res.json({ message: 'OTP envoyé', otp }); // Retire otp en prod
    
  } catch (err) {
    console.error('Erreur login-password:', err);
    res.status(500).json({ error: err.message });
  }
});


// Stockage temporaire en mémoire pour rate limit (mieux avec Redis en prod)
const otpRateLimit = new Map();

// POST /api/auth/request-otp-signup → nouveau user
router.post('/request-otp-signup', async (req, res) => {
  try {
    const { identifier } = req.body; // +22675322321 ou email@...

    if (!identifier) {
      return res.status(400).json({ error: 'Numéro ou email requis' });
    }

    // 1. Formatage
    const isEmail = identifier.includes('@');
    let phone = null;
    let email = null;

    if (isEmail) {
      email = identifier.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Email invalide' });
      }
    } else {
      // Numéro BF
      const num = identifier.replace(/\D/g, '');
      if (num.length < 8) {
        return res.status(400).json({ error: 'Numéro invalide' });
      }
      phone = `+226${num.slice(-8)}`;
    }

    // 2. Rate limit : max 3 OTP / 10 min par numéro
    const key = phone || email;
    const now = Date.now();
    const attempts = otpRateLimit.get(key) || [];
    const recent = attempts.filter(t => now - t < 10 * 60 * 1000);
    
    if (recent.length >= 3) {
      return res.status(429).json({ 
        error: 'Trop de tentatives. Réessaie dans 10 minutes.' 
      });
    }
    recent.push(now);
    otpRateLimit.set(key, recent);

    // 3. Vérifie si user existe déjà
    const existingUser = await Client.findOne({
      $or: [
        { telephone: phone },
        { email: email },
        { telephone: `+226${phone?.slice(-3)}` } // tolérance
      ].filter(Boolean)
    });

    if (existingUser && existingUser.isVerified) {
      return res.status(400).json({ 
        error: 'Ce compte existe déjà. Connecte-toi.' 
      });
    }

    // 4. Génère OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

    // 5. Save / Update user temp
    let user;
    if (existingUser) {
      // User non vérifié → update OTP
      existingUser.otpCode = otp;
      existingUser.otpExpires = expiresAt;
      user = await existingUser.save();
    } else {
      // Nouveau user temp
      user = await Client.create({
        telephone: phone,
        email: email || null,
        nom: '',
        prenom: '',
        pseudo: '',
        password: '', // sera défini après
        otpCode: otp,
        otpExpires: expiresAt,
        isVerified: false,
        solde: 0,
        bloque: false,
        limiteJournaliere: 200000,
        limiteMensuelle: 2000000
      });
    }

    // 6. Envoi SMS Orange si téléphone
    if (phone) {
      const message = `Bienvenue sur UniPay! Votre code de vérification est: ${otp}. Valide 5 min. Ne le partagez pas.`;
      
      const sent = await sendSMSOrange(phone, message);
      
      if (!sent) {
        // Rollback si SMS échoue
        await Client.findByIdAndDelete(user._id);
        return res.status(500).json({ error: 'Échec envoi SMS. Réessaie.' });
      }
      
      console.log(`[OTP Signup] ${phone} → ${otp}`);
    } else {
      // Si email → envoi email (à implémenter)
      console.log(`[OTP Signup Email] ${email} → ${otp}`);
      // await sendEmail(email, otp);
    }

    res.json({ 
      message: 'Code envoyé',
      userId: user._id,
      identifier: phone || email,
      expiresIn: 300 // secondes
    });

  } catch (err) {
    console.error('Erreur request-otp-signup:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/verify-otp-signup → validation
router.post('/verify-otp-signup', async (req, res) => {
  try {
    const { identifier, otp } = req.body;

    if (!identifier || !otp) {
      return res.status(400).json({ error: 'Code requis' });
    }

    const isEmail = identifier.includes('@');
    const phone = isEmail ? null : identifier;
    const email = isEmail ? identifier.toLowerCase() : null;

    const user = await Client.findOne({
      $or: [
        { telephone: phone },
        { email: email }
      ].filter(Boolean),
      otpCode: otp
    });

    if (!user) {
      return res.status(401).json({ error: 'Code invalide' });
    }

    if (!user.otpExpires || Date.now() > new Date(user.otpExpires).getTime()) {
      return res.status(401).json({ error: 'Code expiré. Redemande un code.' });
    }

    // OK → clear OTP
    user.otpCode = null;
    user.otpExpires = null;
    await user.save();

    // Clear rate limit
    otpRateLimit.delete(phone || email);

    res.json({
      message: 'Code vérifié',
      userId: user._id,
      identifier: phone || email,
      nextStep: 'profile' // front va vers /profile
    });

  } catch (err) {
    console.error('Erreur verify-otp-signup:', err);
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

module.exports = router;
