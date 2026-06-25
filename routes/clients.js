const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const { verifyAdmin } = require('../middleware/auth');

// GET /api/clients/admin - PAGE HTML sans verifyAdmin
router.get('/admin', async (req, res) => {
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
   .btn-del { background: #dc3545; }
  </style>
</head>
<body>
  <h2>Administration Clients</h2>
  <a href="/api/transactions">Historique</a> | 
  <a href="/api/transactions/add">Nouveau transfert</a> | 
  <a href="/api/transactions/dashboard">Dashboard</a> | 
  <button onclick="logout()">Déconnexion</button>
  <div id="content">Chargement...</div>
  <script>
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/api/auth/login';
    }

    async function loadClients() {
      const res = await fetch('/api/clients/data', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('token');
        window.location.href = '/api/auth/login';
        return;
      }
      
      const clients = await res.json();
      renderTable(clients);
    }

    function renderTable(clients) {
      if (!clients.length) {
        document.getElementById('content').innerHTML = 'Aucun client';
        return;
      }
      let html = '<table><tr><th>Nom</th><th>Téléphone</th><th>Email</th><th>Solde</th><th>Rôle</th><th>Action</th></tr>';
      clients.forEach(c => {
        html += '<tr>';
        html += '<td>' + c.prenom + ' ' + c.nom + '</td>';
        html += '<td>' + c.telephone + '</td>';
        html += '<td>' + c.email + '</td>';
        html += '<td>' + c.solde.toLocaleString() + ' FCFA</td>';
        html += '<td>' + c.role + '</td>';
        html += '<td><button class="btn-del" onclick="deleteClient(\\'' + c._id + '\\')">Supprimer</button></td>';
        html += '</tr>';
      });
      html += '</table>';
      document.getElementById('content').innerHTML = html;
    }

    async function deleteClient(id) {
      if (!confirm('Supprimer ce client?')) return;
      const res = await fetch('/api/clients/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();
      alert(data.message || data.error);
      loadClients();
    }

    function logout() {
      localStorage.removeItem('token');
      window.location.href = '/api/auth/login';
    }

    loadClients();
  </script>
</body>
</html>`);
});

// GET /api/clients/data - API JSON avec verifyAdmin
router.get('/data', verifyAdmin, async (req, res) => {
  const clients = await Client.find().select('-password').sort({ createdAt: -1 }).lean();
  res.json(clients);
});

// POST /api/clients - Créer client
router.post('/', verifyAdmin, async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { nom, prenom, telephone, email, password, solde } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const client = new Client({
      nom, prenom, telephone, email,
      password: hashedPassword,
      solde: solde || 0,
      role: 'client'
    });

    await client.save();
    res.status(201).json({ message: 'Client créé', client: { id: client._id, nom, prenom } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/clients/:id - Supprimer
router.delete('/:id', verifyAdmin, async (req, res) => {
  await Client.findByIdAndDelete(req.params.id);
  res.json({ message: 'Client supprimé' });
});

module.exports = router;
