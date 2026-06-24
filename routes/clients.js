const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const { verifyAdmin } = require('../middleware/auth'); // ← Ajoute ça en haut

// 1. ROUTES SPECIFIQUES EN PREMIER - AVANT /:id
// Page formulaire ajout - PROTÉGÉE
router.get('/add', verifyAdmin, (req, res) => {
  res.send(`
    <h2>Ajouter un client</h2>
    <form method="POST" action="/api/clients">
      <input name="nom" placeholder="Nom" required><br><br>
      <input name="prenom" placeholder="Prénom" required><br><br>
      <input name="email" type="email" placeholder="Email" required><br><br>
      <input name="telephone" placeholder="Téléphone" required><br><br>
      <input name="solde" type="number" placeholder="Solde" value="0"><br><br>
      <button type="submit">Créer</button>
    </form>
  `);
});

// Panel admin - PROTÉGÉ
router.get('/admin', verifyAdmin, async (req, res) => {
  const clients = await Client.find();
  res.send(`<h2>Panel Admin</h2><pre>${JSON.stringify(clients, null, 2)}</pre>`);
});

// 2. ROUTES CRUD

// GET tous les clients - PUBLIC
router.get('/', async (req, res) => {
  try {
    const clients = await Client.find();
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST créer client - PROTÉGÉ
router.post('/', verifyAdmin, async (req, res) => {
  try {
    const client = new Client(req.body);
    await client.save();
    res.json({ message: 'Client créé', client });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET un client par ID - PUBLIC
router.get('/:id', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client introuvable' });
    res.json(client);
  } catch (error) {
    res.status(400).json({ message: 'Erreur', error: error.message });
  }
});

// PUT modifier client - PROTÉGÉ
router.put('/:id', verifyAdmin, async (req, res) => {
  try {
    const client = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!client) return res.status(404).json({ message: 'Client introuvable' });
    res.json({ message: 'Client modifié', client });
  } catch (error) {
    res.status(400).json({ message: 'Erreur', error: error.message });
  }
});

// DELETE supprimer client - PROTÉGÉ
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client introuvable' });
    res.json({ message: 'Client supprimé' });
  } catch (error) {
    res.status(400).json({ message: 'Erreur', error: error.message });
  }
});

module.exports = router;
