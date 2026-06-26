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
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { 
        folder: 'unipay_clients',
        transformation: [{ width: 800, crop: 'limit' }]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
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
    console.log('Body:', req.body);
    console.log('Files:', req.files);

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



module.exports = router;
