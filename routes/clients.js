const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const { verifyAdmin } = require('../middleware/auth'); // ← Ajoute ça en haut

router.get('/add', verifyAdmin, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Ajouter Client</title></head>
    <body>
      <h2>Ajouter un client</h2>
      <a href="/api/clients/admin">← Retour</a><br><br>
      <form id="addForm">
        <input name="nom" placeholder="Nom" required><br><br>
        <input name="prenom" placeholder="Prénom" required><br><br>
        <input name="email" type="email" placeholder="Email" required><br><br>
        <input name="telephone" placeholder="Téléphone" required><br><br>
        <input name="solde" type="number" placeholder="Solde" value="0"><br><br>
        <button type="submit">Créer</button>
      </form>
      <div id="msg"></div>

      <script>
        const token = localStorage.getItem('token');
        if (!token) window.location.href = '/api/auth/login';
        
        addForm.onsubmit = async e => {
          e.preventDefault();
          const formData = new FormData(e.target);
          const body = Object.fromEntries(formData);
          
          const res = await fetch('/api/clients', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token 
            },
            body: JSON.stringify(body)
          });
          
          const data = await res.json();
          if (res.ok) {
            msg.innerHTML = 'Client créé! <a href="/api/clients/admin">Voir la liste</a>';
            e.target.reset();
          } else {
            msg.innerText = 'Erreur: ' + data.error;
          }
        };
      </script>
    </body>
    </html>
  `);
});

// Panel admin - PROTÉGÉ
router.get('/admin', verifyAdmin, async (req, res) => {
  try {
    const clients = await Client.find();
    
    let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>UniPay Admin</title>
      <style>
        body { font-family: Arial; padding: 20px; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background: #f2f2f2; }
        button { padding: 5px 10px; margin: 2px; cursor: pointer; }
        .delete { background: #ff4444; color: white; border: none; }
        .edit { background: #44bb44; color: white; border: none; }
        #logout { float: right; }
      </style>
    </head>
    <body>
      <h2>Gestion Clients UniPay</h2>
      <button id="logout" onclick="logout()">Déconnexion</button>
      <a href="/api/clients/add"><button>+ Ajouter un client</button></a>
      
      <table>
        <tr>
          <th>Nom</th><th>Prénom</th><th>Email</th><th>Téléphone</th><th>Solde</th><th>Actions</th>
        </tr>
    `;
    
    clients.forEach(c => {
      html += `
        <tr id="row-${c._id}">
          <td>${c.nom}</td>
          <td>${c.prenom}</td>
          <td>${c.email}</td>
          <td>${c.telephone}</td>
          <td>${c.solde} FCFA</td>
          <td>
            <button class="edit" onclick="modifierClient('${c._id}', '${c.nom}', ${c.solde})">Modifier</button>
            <button class="delete" onclick="supprimerClient('${c._id}')">Supprimer</button>
          </td>
        </tr>
      `;
    });
    
    html += `
      </table>

      <script>
        const token = localStorage.getItem('token');
        
        if (!token) {
          alert('Non connecté');
          window.location.href = '/api/auth/login';
        }

        async function supprimerClient(id) {
          if (!confirm('Supprimer ce client définitivement ?')) return;
          
          const res = await fetch('/api/clients/' + id, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
          });
          
          const data = await res.json();
          if (res.ok) {
            document.getElementById('row-' + id).remove();
            alert(data.message);
          } else {
            alert('Erreur: ' + data.message);
          }
        }
        
        async function modifierClient(id, nom, soldeActuel) {
          const nouveauSolde = prompt('Nouveau solde pour ' + nom + ':', soldeActuel);
          if (nouveauSolde === null) return;
          
          const res = await fetch('/api/clients/' + id, {
            method: 'PUT',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token 
            },
            body: JSON.stringify({ solde: Number(nouveauSolde) })
          });
          
          const data = await res.json();
          if (res.ok) {
            alert(data.message);
            location.reload();
          } else {
            alert('Erreur: ' + data.message);
          }
        }

        function logout() {
          localStorage.removeItem('token');
          window.location.href = '/api/auth/login';
        }
      </script>
    </body>
    </html>
    `;
    
    res.send(html);
  } catch (error) {
    res.status(500).send('Erreur: ' + error.message);
  }
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
