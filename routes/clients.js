const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const Client = require('../models/Client');
const { verifyAdmin } = require('../middleware/auth');

// Config Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'unipay_clients',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp']
  }
});

const upload = multer({ storage });

// ==================== ROUTES HTML ====================

// GET /api/clients/add - Formulaire
router.get('/add', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Ajouter Client</title>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial; padding: 20px; max-width: 600px; margin: auto; }
        input, select { width: 100%; padding: 8px; margin: 8px 0; box-sizing: border-box; }
        button { padding: 10px 20px; background: #007bff; color: white; border: none; cursor: pointer; }
        fieldset { border: 1px solid #ddd; padding: 10px; margin: 10px 0; }
        #msg { margin-top: 15px; padding: 10px; }
     .success { background: #d4edda; color: #155724; }
     .error { background: #f8d7da; color: #721c24; }
      </style>
    </head>
    <body>
      <h2>Ajouter un client</h2>
      <a href="/api/clients/admin">← Retour</a><br><br>
      <form id="addForm" enctype="multipart/form-data">
        <input name="nom" placeholder="Nom" required><br><br>
        <input name="prenom" placeholder="Prénom" required><br><br>
        <input name="pseudo" placeholder="Pseudo unique" required><br><br>
        <input name="email" type="email" placeholder="Email" required><br><br>
        <input name="telephone" placeholder="Téléphone" required><br><br>
        <input name="solde" type="number" placeholder="Solde initial" value="0"><br><br>

        <fieldset>
          <legend>Limites de transfert</legend>
          <label>Limite journalière (FCFA):</label>
          <input name="limiteJournaliere" type="number" value="500000" min="0"><br><br>
          <label>Limite mensuelle (FCFA):</label>
          <input name="limiteMensuelle" type="number" value="5000000" min="0">
        </fieldset>

        <fieldset>
          <legend>Documents</legend>
          <label>Photo de profil:</label>
          <input name="photoProfil" type="file" accept="image/*"><br><br>
          <label>Carte d'identité recto:</label>
          <input name="carteRecto" type="file" accept="image/*"><br><br>
          <label>Carte d'identité verso:</label>
          <input name="carteVerso" type="file" accept="image/*">
        </fieldset>

        <button type="submit">Créer le client</button>
      </form>

      <div id="msg"></div>

      <script>
        const token = localStorage.getItem('token');
        if (!token) window.location.href = '/api/auth/login';

        addForm.onsubmit = async e => {
          e.preventDefault();
          msg.innerText = 'Envoi en cours...';
          msg.className = '';
          const formData = new FormData(e.target);

          try {
            const res = await fetch('/api/clients', {
              method: 'POST',
              headers: { 'Authorization': 'Bearer ' + token },
              body: formData
            });

            const data = await res.json();
            if (res.ok) {
              msg.className = 'success';
              msg.innerHTML = 'Client créé : ' + data.client.pseudo + '<br><a href="/api/clients/admin">Voir la liste</a>';
              e.target.reset();
            } else {
              msg.className = 'error';
              msg.innerText = 'Erreur: ' + data.error;
            }
          } catch (err) {
            msg.className = 'error';
            msg.innerText = 'Erreur: ' + err.message;
          }
        };
      </script>
    </body>
    </html>
  `);
});

// GET /api/clients/admin - Panel admin - AJOUT verifyAdmin ICI
router.get('/admin', async (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>UniPay Admin</title>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial; padding: 20px; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background: #f2f2f2; }
        button { padding: 5px 10px; margin: 2px; cursor: pointer; }
     .delete { background: #ff4444; color: white; border: none; }
     .edit { background: #44bb44; color: white; border: none; }
        #logout { float: right; }
        img.avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
      </style>
    </head>
    <body>
      <h2>Gestion Clients UniPay</h2>
      <button id="logout" onclick="logout()">Déconnexion</button>
      <a href="/api/transactions/add"><button>Faire un transfert</button></a>
      <a href="/api/transactions"><button>Historique</button></a>
      <a href="/api/transactions/dashboard"><button>Dashboard</button></a>
      <a href="/api/clients/add"><button>+ Ajouter un client</button></a>

      <div id="content">Chargement...</div>

      <script>
        const token = localStorage.getItem('token');
        if (!token) window.location.href = '/api/auth/login';

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
          let html = '<table><tr><th>Photo</th><th>Pseudo</th><th>Nom</th><th>Téléphone</th><th>Solde</th><th>Limite J/M</th><th>Actions</th></tr>';

          clients.forEach(c => {
            const photo = c.photoProfil? '<img src="' + c.photoProfil + '" class="avatar">' : '-';
            html += \`
              <tr id="row-\${c._id}">
                <td>\${photo}</td>
                <td>\${c.pseudo || '-'}</td>
                <td>\${c.prenom} \${c.nom}</td>
                <td>\${c.telephone}</td>
                <td>\${c.solde.toLocaleString()} FCFA</td>
                <td>\${(c.limiteJournaliere||0).toLocaleString()}/\${(c.limiteMensuelle||0).toLocaleString()}</td>
                <td>
                  <button class="edit" onclick="modifierClient('\${c._id}', '\${c.nom}', \${c.solde})">Solde</button>
                  <button class="delete" onclick="supprimerClient('\${c._id}')">Supprimer</button>
                </td>
              </tr>
            \`;
          });

          html += '</table>';
          document.getElementById('content').innerHTML = html;
        }

        async function supprimerClient(id) {
          if (!confirm('Supprimer ce client?')) return;
          const res = await fetch('/api/clients/' + id, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
          });
          if (res.ok) {
            document.getElementById('row-' + id).remove();
            alert('Client supprimé');
          } else {
            const data = await res.json();
            alert('Erreur: ' + data.error);
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
            const data = await res.json();
            alert('Erreur: ' + data.error);
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

// ==================== ROUTES API ====================

// GET tous les clients
router.get('/', verifyAdmin, async (req, res) => {
  try {
    const clients = await Client.find().select('-password');
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST créer client avec upload
router.post('/', verifyAdmin, upload.fields([
  { name: 'photoProfil', maxCount: 1 },
  { name: 'carteRecto', maxCount: 1 },
  { name: 'carteVerso', maxCount: 1 }
]), async (req, res) => {
  try {
    const { nom, prenom, pseudo, email, telephone, solde, limiteJournaliere, limiteMensuelle } = req.body;

    // Check doublons
    if (await Client.findOne({ pseudo })) return res.status(400).json({ error: 'Pseudo déjà utilisé' });
    if (await Client.findOne({ email })) return res.status(400).json({ error: 'Email déjà utilisé' });
    if (await Client.findOne({ telephone })) return res.status(400).json({ error: 'Téléphone déjà utilisé' });

    // Password = téléphone hashé
    const hashedPassword = await bcrypt.hash(telephone, 10);

    const client = new Client({
      nom,
      prenom,
      pseudo,
      email,
      telephone,
      solde: Number(solde) || 0,
      password: hashedPassword,
      limiteJournaliere: Number(limiteJournaliere) || 500000,
      limiteMensuelle: Number(limiteMensuelle) || 5000000,
      photoProfil: req.files['photoProfil']?.[0]?.path || null,
      carteRecto: req.files['carteRecto']?.[0]?.path || null,
      carteVerso: req.files['carteVerso']?.[0]?.path || null
    });

    await client.save();
    res.status(201).json({ message: 'Client créé', client });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
const.logs(client);
// GET un client - DOIT ÊTRE EN DERNIER
router.get('/:id', verifyAdmin, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).select('-password');
    if (!client) return res.status(404).json({ error: 'Client introuvable' });
    res.json(client);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT modifier client
router.put('/:id', verifyAdmin, async (req, res) => {
  try {
    const client = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-password');
    if (!client) return res.status(404).json({ error: 'Client introuvable' });
    res.json({ message: 'Client modifié', client });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE supprimer client
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client introuvable' });
    res.json({ message: 'Client supprimé' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
