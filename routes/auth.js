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
//const Transaction = require('../models/Transaction'); // adapte le nom

const Transaction = require('../models/Transaction'); // Assure-toi que le chemin est bon
//const jwt = require('jsonwebtoken');

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
// POST /api/auth/check-phone
router.post('/check-phonee', async (req, res) => {
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




// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      const token = jwt.sign({ email, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '24h' });
      return res.json({ message: 'Connecté', token, role: 'admin' });
    }

    const client = await Client.findOne({ email });
    if (!client) return res.status(401).json({ error: 'Identifiants incorrects' });

    const validPassword = await bcrypt.compare(password, client.password);
    if (!validPassword) return res.status(401).json({ error: 'Identifiants incorrects' });

    const token = jwt.sign({ id: client._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Connexion réussie', token, user: client });
  } catch (err) {
    console.error('Erreur login:', err);
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


// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      const token = jwt.sign({ email, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '24h' });
      return res.json({ message: 'Connecté', token, role: 'admin' });
    }

    const client = await Client.findOne({ email });
    if (!client) return res.status(401).json({ error: 'Identifiants incorrects' });

    const validPassword = await bcrypt.compare(password, client.password);
    if (!validPassword) return res.status(401).json({ error: 'Identifiants incorrects' });

    const token = jwt.sign({ id: client._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Connexion réussie', token, user: client });
  } catch (err) {
    console.error('Erreur login:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
