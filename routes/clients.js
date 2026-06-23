const express = require('express');
const router = express.Router();
const Client = require('../models/Client');

// POST /api/clients - Ajouter un client
router.post('/', async (req, res) => {
  try {
    const { nom, prenom, email, telephone, solde } = req.body;
    
    // Vérifier si email existe déjà
    const clientExiste = await Client.findOne({ email });
    if (clientExiste) {
      return res.status(400).json({ message: 'Email déjà utilisé' });
    }

    const nouveauClient = new Client({
      nom,
      prenom,
      email,
      telephone,
      solde: solde || 0
    });

    await nouveauClient.save();
    res.status(201).json({ 
      message: 'Client créé', 
      client: nouveauClient 
    });
    
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

// GET /api/clients - Lister tous les clients
router.get('/', async (req, res) => {
  try {
    const clients = await Client.find();
    res.json(clients);
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

module.exports = router;
