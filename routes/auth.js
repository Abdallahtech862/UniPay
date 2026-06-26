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
router.post('/register', upload.any(), async (req, res) => {
  try {
    console.log('=== START REGISTER ===');
    console.log('Body:', req.body);
    console.log('Files count:', req.files?.length);

    const { nom, prenom, telephone, email, password } = req.body;

    if (!nom ||!prenom ||!telephone ||!password) {
      console.log('Champs manquants');
      return res.status(400).json({ error: 'Champs requis manquants' });
    }

    const exists = await Client.findOne({ $or: [{ email }, { telephone }] });
    if (exists) {
      console.log('User existe déjà');
      return res.status(400).json({ error: 'Email ou téléphone déjà utilisé' });
    }

    let carteRectoUrl = null;
    let carteVersoUrl = null;

    const rectoFile = req.files?.find(f => f.fieldname === 'carteRecto');
    const versoFile = req.files?.find(f => f.fieldname === 'carteVerso');

    if (rectoFile) {
      console.log('Upload recto...', rectoFile.size);
      try {
        const result = await uploadToCloudinary(rectoFile.buffer);
        carteRectoUrl = result.secure_url;
        console.log('Recto OK:', carteRectoUrl);
      } catch (err) {
        console.error('Erreur upload recto:', err.message);
        return res.status(500).json({ error: 'Upload recto échoué: ' + err.message });
      }
    }

    if (versoFile) {
      console.log('Upload verso...', versoFile.size);
      try {
        const result = await uploadToCloudinary(versoFile.buffer);
        carteVersoUrl = result.secure_url;
        console.log('Verso OK:', carteVersoUrl);
      } catch (err) {
        console.error('Erreur upload verso:', err.message);
        return res.status(500).json({ error: 'Upload verso échoué: ' + err.message });
      }
    }

    console.log('Hash password...');
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log('Create client...');
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
    console.log('Client saved:', client._id);

    const token = jwt.sign({ id: client._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    console.log('=== SUCCESS ===');
    return res.status(201).json({ message: 'Compte créé', token });

  } catch (err) {
    console.error('=== ERREUR REGISTER ===', err);
    return res.status(500).json({ error: err.message || 'Erreur serveur' });
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
