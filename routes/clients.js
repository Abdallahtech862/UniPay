const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const { verifyAdmin } = require('../middleware/auth');

// GET /api/clients/admin - Page admin
router.get('/admin', async (req, res) => {
  try {
    const clients = await Client.find().select('-password').sort({ createdAt: -1 }).lean();

    let rows = '';
    clients.forEach(c => {
      rows += `<tr>
        <td>${c.prenom} ${c.nom}</td>
        <td>${c.telephone}</td>
        <td>${c.email}</td>
        <td>${c.solde.toLocaleString()} FCFA</td>
        <td>${c.role}</td>
        <td>
          <button onclick="deleteClient('${c._id}')" style="background:#dc3545;color:white;border:none;padding:5px 10px;cursor:pointer;">Supprimer</button>
        </td>
      </tr>`;
    });

    res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Admin UniPay</title>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial; padding: 20px; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
    th { background: #007bff; color: white; }
    tr:nth-child(even) { background: #f2f2f2; }
    button { padding: 8px 16px; margin: 5px; border: none; cursor: pointer; background: #007bff; color: white; }
  </style>
</head>
<body>
  <h2>Administration Clients</h2>
  <a href="/api/transactions">Historique</a> |
  <a href="/api/transactions/add">Nouveau transfert</a> |
  <a href="/api/transactions/dashboard">Dashboard</a> |
  <button onclick="logout()">Déconnexion</button>
  <table>
    <tr><th>Nom</th><th>Téléphone</th><th>Email</th><th>Solde</th><th>Rôle</th><th>Action</th></tr>
    ${rows}
  </table>
  <script>
    const token = localStorage.getItem('token');
    if (!token) window.location.href = '/api/auth/login';

    async function deleteClient(id) {
      if (!confirm('Supprimer ce client?')) return;
      const res = await fetch('/api/clients/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        location.reload();
      } else {
        alert('Erreur: ' + data.error);
      }
    }

    function logout() {
      localStorage.removeItem('token');
      window.location.href = '/api/auth/login';
    }
  </script>
</body>
</html>`);
  } catch (error) {
    res.status(500).send('Erreur: ' + error.message);
  }
});
// GET /api/clients - Liste JSON
router.get('/', verifyAdmin, async (req, res) => {
  try {
    const clients = await Client.find().select('-password').lean();
    res.json(clients);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/clients/:id
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client introuvable' });
    res.json({ message: 'Client supprimé' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
