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
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// GET /api/auth/login - Page login admin web
router.get('/login', (req, res) => {
  res.send(`
    <h2>Login Admin UniPay</h2>
    <form id="f">
      <input name="email" type="email" placeholder="Email" required><br><br>
      <input name="password" type="password" placeholder="Mot de passe" required><br><br>
      <button>Connexion</button>
    </form>
    <div id="msg"></div>
    <script>
      f.onsubmit = async e => {
        e.preventDefault();
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: f.email.value,
            password: f.password.value
          })
        });
        const data = await res.json();
        if (data.token) {
          localStorage.setItem('token', data.token);
          msg.innerHTML = 'Connecté! <a href="/api/clients/admin">Panel Admin</a>';
        } else {
          msg.innerText = data.error || data.message;
        }
      };
    </script>
  `);
});

// POST /api/auth/check-phone - Vérifier si numéro existe
router.post('/check-phone', async (req, res) => {
  try {
    const { telephone } = req.body;
    const client = await Client.findOne({ telephone });
    res.json({ exists:!!client });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login-phone - Login client mobile par téléphone
router.post('/login-phone', async (req, res) => {
  try {
    const { telephone } = req.body;
    const client = await Client.findOne({ telephone }).select('-password');

    if (!client) return res.status(404).json({ error: 'Compte introuvable' });

    const token = jwt.sign({ id: client._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'Connexion réussie',
      token,
      user: { id: client._id, nom: client.nom, prenom: client.prenom, solde: client.solde }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/register - Inscription client mobile avec images CNI
router.post('/register', upload.fields([
  { name: 'carteRecto', maxCount: 1 },
  { name: 'carteVerso', maxCount: 1 }
]), async (req, res) => {
  try {
    const { nom, prenom, telephone, email, password } = req.body;

    if (!nom ||!prenom ||!telephone ||!password) {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }

    if (await Client.findOne({ $or: [{ email }, { telephone }] })) {
      return res.status(400).json({ error: 'Email ou téléphone déjà utilisé' });
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
      carteRecto: req.files['carteRecto']?.[0]?.path || null,
      carteVerso: req.files['carteVerso']?.[0]?.path || null
    });

    await client.save();

    const token = jwt.sign({ id: client._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ message: 'Compte créé', token });
  } catch (err) {
    console.log('Erreur register:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login - Login admin web OU client mobile par email
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Check si c'est l'admin du.env
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      const token = jwt.sign(
        { email, role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      return res.json({ message: 'Connecté', token, role: 'admin' });
    }

    // 2. Sinon cherche un client en base
    const client = await Client.findOne({ email });
    if (!client) return res.status(401).json({ error: 'Identifiants incorrects' });

    const validPassword = await bcrypt.compare(password, client.password);
    if (!validPassword) return res.status(401).json({ error: 'Identifiants incorrects' });

    const token = jwt.sign({ id: client._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'Connexion réussie',
      token,
      user: { id: client._id, nom: client.nom, prenom: client.prenom, solde: client.solde, role: client.role }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
