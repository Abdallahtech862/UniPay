

//
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Client = require('../models/Client');
const multer = require('multer');

// multer sans storage = parse juste les champs texte
const upload = multer();

router.post('/register', upload.none(), async (req, res) => {
  try {
    console.log('Body reçu:', req.body); // Maintenant tu dois voir les champs
    
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
      limiteMensuelle: 5000000
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

