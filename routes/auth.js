

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Client = require('../models/Client');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Config Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'unipay_clients',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 }
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


// POST /api/auth/registerrr - Version SANS images pour debug
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.post('/register', upload.any(), async (req, res) => {
  try {
    console.log('=== DEBUG MULTER ===');
    console.log('req.files:', req.files); // Array de fichiers
    console.log('req.body:', req.body);   // Fields texte
    
    const { nom, prenom, telephone, email, password } = req.body;
    
    if (!nom || !prenom || !telephone || !password) {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }

    let carteRectoUrl = null;
    let carteVersoUrl = null;

    // Trouve les fichiers par leur fieldname
    const rectoFile = req.files?.find(f => f.fieldname === 'carteRecto');
    const versoFile = req.files?.find(f => f.fieldname === 'carteVerso');

    console.log('Recto trouvé:', !!rectoFile);
    console.log('Verso trouvé:', !!versoFile);

    if (rectoFile) {
      const result = await uploadToCloudinary(rectoFile.buffer);
      carteRectoUrl = result.secure_url;
    }
    if (versoFile) {
      const result = await uploadToCloudinary(versoFile.buffer);
      carteVersoUrl = result.secure_url;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const client = new Client({
      nom: nom.trim(),
      prenom: prenom.trim(),
      telephone,
      email: email || `${telephone.replace('+226', '')}@unipay.local`,
      password: hashedPassword,
      solde: 0,
      role: 'client',
      limiteJournaliere: 500000,
      limiteMensuelle: 5000000,
      carteRecto: carteRectoUrl,
      carteVerso: carteVersoUrl
    });

    await client.save();
    const token = jwt.sign({ id: client._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ message: 'Compte créé', token });
  } catch (err) {
    console.error('Erreur register:', err);
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
