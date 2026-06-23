
const { verifyAdmin } = require('../middleware/auth');
const express = require('express');
const router = express.Router();
const Client = require('../models/Client');

// GET /api/clients/admin - Interface de gestion
router.get('/admin', async (req, res) => {
  try {
    const clients = await Client.find();
    
    let html = `
      <h2>Gestion Clients UniPay</h2>
      <a href="/api/clients/add">+ Ajouter un client</a>
      <table border="1" cellpadding="8" style="border-collapse:collapse; margin-top:20px">
        <tr>
          <th>Nom</th><th>Prénom</th><th>Email</th><th>Téléphone</th><th>Solde</th><th>Actions</th>
        </tr>
    `;
    
    clients.forEach(c => {
      html += `
        <tr>
          <td>${c.nom}</td>
          <td>${c.prenom}</td>
          <td>${c.email}</td>
          <td>${c.telephone}</td>
          <td>${c.solde} FCFA</td>
          <td>
            <button onclick="modifierClient('${c._id}')">Modifier</button>
            <button onclick="supprimerClient('${c._id}')">Supprimer</button>
          </td>
        </tr>
      `;
    });
    
    html += `
      </table>
      
      <script>
        async function supprimerClient(id) {
          if (!confirm('Supprimer ce client ?')) return;
          
          const res = await fetch('/api/clients/' + id, { method: 'DELETE' });
          const data = await res.json();
          alert(data.message);
          location.reload();
        }
        
        function modifierClient(id) {
          const nouveauSolde = prompt('Nouveau solde:');
          if (nouveauSolde === null) return;
          
          fetch('/api/clients/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ solde: Number(nouveauSolde) })
          })
          .then(res => res.json())
          .then(data => {
            alert(data.message);
            location.reload();
          });
        }
      </script>
    `;
    
    res.send(html);
  } catch (error) {
    res.status(500).send('Erreur: ' + error.message);
  }
});
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
