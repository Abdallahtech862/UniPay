const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const { verifyAdmin } = require('../middleware/auth'); // ← Ajoute ça en haut

router.get('/add',  (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Ajouter Client</title></head>
    <body>
      <h2>Ajouter un client</h2>
      <a href="/api/clients/admin">← Retour</a><br><br>
      
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

// Panel admin - Token vérifié côté client, pas côté serveur
router.get('/admin', async (req, res) => {
  res.send(`
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
      <a href="/api/transactions/add"><button>Faire un transfert</button></a>
      <a href="/api/clients/add"><button>+ Ajouter un client</button></a>
      
      <div id="content">Chargement...</div>

      <script>
        const token = localStorage.getItem('token');
        
        if (!token) {
          alert('Non connecté');
          window.location.href = '/api/auth/login';
        }

        // Charge les clients avec le token
        async function loadClients() {
          const res = await fetch('/api/clients', {
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
          let html = '<table><tr><th>Nom</th><th>Prénom</th><th>Email</th><th>Téléphone</th><th>Solde</th><th>Actions</th></tr>';
          
          clients.forEach(c => {
            html += \`
              <tr id="row-\${c._id}">
                <td>\${c.nom}</td>
                <td>\${c.prenom}</td>
                <td>\${c.email}</td>
                <td>\${c.telephone}</td>
                <td>\${c.solde} FCFA</td>
                <td>
                  <button class="edit" onclick="modifierClient('\${c._id}', '\${c.nom}', \${c.solde})">Modifier</button>
                  <button class="delete" onclick="supprimerClient('\${c._id}')">Supprimer</button>
                </td>
              </tr>
            \`;
          });
          
          html += '</table>';
          document.getElementById('content').innerHTML = html;
        }

        async function supprimerClient(id) {
          if (!confirm('Supprimer ce client ?')) return;
          
          const res = await fetch('/api/clients/' + id, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
          });
          
          if (res.ok) {
            document.getElementById('row-' + id).remove();
            alert('Client supprimé');
          } else {
            alert('Erreur');
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
          
          if (res.ok) {
            alert('Client modifié');
            loadClients();
          } else {
            alert('Erreur');
          }
        }

        function logout() {
          localStorage.removeItem('token');
          window.location.href = '/api/auth/login';
        }

        loadClients();
      </script>
    </body>
    </html>
  `);
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
