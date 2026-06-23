const express = require('express');
const router = express.Router();
const Client = require('../models/Client');


// GET /api/clients/:id - Voir un client
router.get('/:id', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client introuvable' });
    res.json(client);
  } catch (error) {
    res.status(400).json({ message: 'Erreur', error: error.message });
  }
});

module.exports = router;
// GET formulaire
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

// POST créer client
router.post('/', async (req, res) => {
  try {
    const client = new Client(req.body);
    await client.save();
    res.json({ message: 'Client créé', client });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET lister clients
router.get('/', async (req, res) => {
  const clients = await Client.find();
  res.json(clients);
});

module.exports = router;
