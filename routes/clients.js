const express = require('express');
const router = express.Router();
const Client = require('../models/Client');

// 1. Routes spécifiques EN PREMIER
router.get('/add', (req, res) => {
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

// 2. Route GET tous les clients
router.get('/', async (req, res) => {
  const clients = await Client.find();
  res.json(clients);
});

// 3. POST créer client
router.post('/', async (req, res) => {
  try {
    const client = new Client(req.body);
    await client.save();
    res.json({ message: 'Client créé', client });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4. Routes avec :id EN DERNIER
router.get('/:id', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client introuvable' });
    res.json(client);
  } catch (error) {
    res.status(400).json({ message: 'Erreur', error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const client = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!client) return res.status(404).json({ message: 'Client introuvable' });
    res.json({ message: 'Client modifié', client });
  } catch (error) {
    res.status(400).json({ message: 'Erreur', error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client introuvable' });
    res.json({ message: 'Client supprimé' });
  } catch (error) {
    res.status(400).json({ message: 'Erreur', error: error.message });
  }
});

module.exports = router;
