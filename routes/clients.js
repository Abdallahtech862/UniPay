const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const Client = require('../models/Client');
const { verifyAdmin, authUser } = require('../middleware/auth');
const streamifier = require('streamifier');
const upload = multer({ storage: multer.memoryStorage() }); // ← mémoire, pas dest: 'uploads/'

const Transaction = require('../models/Transaction'); // ✅ Ajoute cette ligne

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

const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    console.log('Cloudinary upload start. Cloud:', process.env.CLOUDINARY_CLOUD_NAME);
    
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
      return reject(new Error('Variables Cloudinary manquantes'));
    }

    const stream = cloudinary.uploader.upload_stream(
      { 
        folder: 'unipay_clients',
        resource_type: 'image',
        timeout: 60000
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary ERROR complet:', JSON.stringify(error, null, 2));
          reject(new Error(`Cloudinary: ${error.message || error}`));
        } else {
          console.log('Cloudinary SUCCESS:', result.secure_url);
          resolve(result);
        }
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};
//const upload = multer({ storage });
// GET profil avec notifsEnabled
router.get('/me', authUser, async (req, res) => {
  try {
    const client = await Client.findById(req.user.id).select('-password');
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sauvegarder le token push
router.post('/save-push-token', authUser, async (req, res) => {
  try {
    const { pushToken } = req.body;
    await Client.findByIdAndUpdate(req.user.id, { expoPushToken: pushToken });
    res.json({ message: 'Token push enregistré' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Activer/désactiver notifs
router.put('/toggle-notifications', authUser, async (req, res) => {
  try {
    const { enabled } = req.body;
    const client = await Client.findByIdAndUpdate(
      req.user.id,
      { notificationsEnabled: enabled },
      { new: true }
    ).select('-password');
    res.json({ 
      message: `Notifications ${enabled ? 'activées' : 'désactivées'}`,
      notificationsEnabled: client.notificationsEnabled 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


//changer le mot de passe
router.put('/change-password', authUser, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Champs manquants' });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'Mot de passe trop court' });
    }

    const client = await Client.findById(userId);
    if (!client) return res.status(404).json({ error: 'Client introuvable' });

    const isMatch = await bcrypt.compare(oldPassword, client.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Ancien mot de passe incorrect' });
    }

    // Ne hash pas ici si t’as un pre('save')
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    client.password = hashedPassword; // ← Laisse le hook hasher
    await client.save();

    res.json({ message: 'Mot de passe modifié' });
  } catch (err) {
    console.error('Erreur change-password:', err);
    res.status(500).json({ error: err.message });
  }
});

//gerer le profile


// modife les informations du client
router.put('/update-profile', authUser, upload.fields([
  { name: 'photoProfil', maxCount: 1 },
  { name: 'carteRecto', maxCount: 1 },
  { name: 'carteVerso', maxCount: 1 }
]), async (req, res) => {
  try {
    const { nom, prenom } = req.body;
    const userId = req.user.id;

    const updateData = { nom, prenom };

    // Upload photoProfil sur Cloudinary
    if (req.files?.photoProfil?.[0]) {
      const result = await uploadToCloudinary(req.files.photoProfil[0].buffer);
      updateData.photoProfil = result.secure_url; // ← URL complète https://res.cloudinary.com/...
    }

    // Upload carteRecto sur Cloudinary
    if (req.files?.carteRecto?.[0]) {
      const result = await uploadToCloudinary(req.files.carteRecto[0].buffer);
      updateData.carteRecto = result.secure_url;
    }

    // Upload carteVerso sur Cloudinary
    if (req.files?.carteVerso?.[0]) {
      const result = await uploadToCloudinary(req.files.carteVerso[0].buffer);
      updateData.carteVerso = result.secure_url;
    }

    console.log('updateData:', updateData);
    const client = await Client.findByIdAndUpdate(userId, updateData, { new: true });
    console.log('client:', client);
    res.json({ message: 'Profil mis à jour', client });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
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
        button { padding: 5px 10px; margin: 2px; cursor: pointer; border: none; border-radius: 3px; }
        .delete { background: #ff4444; color: white; }
        .edit { background: #44bb44; color: white; }
        .block { background: #f59e0b; color: white; }
        .unblock { background: #10b981; color: white; }
        .view { background: #3b82f6; color: white; }
        .limit { background: #8b5cf6; color: white; }
        .reset { background: #ec4899; color: white; }
        #logout { float: right; }
        img.avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
        .search-bar { margin: 15px 0; display: flex; gap: 10px; }
        .search-bar input { padding: 8px; flex: 1; max-width: 300px; }
        .badge-bloque { background: #ef4444; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
        .badge-actif { background: #10b981; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
        .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); }
        .modal-content { margin: 5% auto; padding: 20px; background: white; width: 80%; max-width: 600px; border-radius: 8px; }
        .modal-content img { width: 100%; max-height: 400px; object-fit: contain; margin: 10px 0; }
        .close { float: right; font-size: 28px; cursor: pointer; }
        .form-group { margin: 15px 0; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
        .form-group input { width: 100%; padding: 8px; box-sizing: border-box; }
        .btn-primary { background: #007bff; color: white; padding: 10px 20px; width: 100%; margin-top: 10px; }
      </style>
    </head>
    <body>
      <h2>Gestion Clients UniPay</h2>
      <button id="logout" onclick="logout()">Déconnexion</button>
      <a href="/api/transactions/add"><button>Faire un transfert</button></a>
      <a href="/api/transactions"><button>Historique</button></a>
      <a href="/api/transactions/dashboard"><button>Dashboard</button></a>
      <a href="/api/clients/add"><button>+ Ajouter un client</button></a>

      <div class="search-bar">
        <input type="text" id="searchInput" placeholder="Rechercher par pseudo ou téléphone..." onkeyup="filterClients()">
        <button onclick="loadClients()">Actualiser</button>
      </div>

      <div id="content">Chargement...</div>

      <!-- Modal CNI -->
      <div id="cniModal" class="modal">
        <div class="modal-content">
          <span class="close" onclick="closeModal('cniModal')">&times;</span>
          <h3>Pièces d'identité</h3>
          <div id="cniContent"></div>
        </div>
      </div>

      <!-- Modal Limites -->
      <div id="limitModal" class="modal">
        <div class="modal-content">
          <span class="close" onclick="closeModal('limitModal')">&times;</span>
          <h3>Modifier les limites</h3>
          <div id="limitContent">
            <div class="form-group">
              <label>Limite Journalière (FCFA)</label>
              <input type="number" id="limitJour" placeholder="Ex: 100000">
            </div>
            <div class="form-group">
              <label>Limite Mensuelle (FCFA)</label>
              <input type="number" id="limitMois" placeholder="Ex: 1000000">
            </div>
            <button class="btn-primary" onclick="saveLimites()">Enregistrer</button>
          </div>
        </div>
      </div>

      <script>
        const token = localStorage.getItem('token');
        if (!token) window.location.href = '/api/auth/login';
        let allClients = [];
        let currentClientId = null;

        async function loadClients() {
          const res = await fetch('/api/clients', {
            headers: { 'Authorization': 'Bearer ' + token }
          });

          if (res.status === 401 || res.status === 403) {
            localStorage.removeItem('token');
            window.location.href = '/api/auth/login';
            return;
          }

          allClients = await res.json();
          renderTable(allClients);
        }

        function filterClients() {
          const search = document.getElementById('searchInput').value.toLowerCase();
          const filtered = allClients.filter(c => 
            c.pseudo?.toLowerCase().includes(search) || 
            c.telephone?.includes(search) ||
            c.nom?.toLowerCase().includes(search) ||
            c.prenom?.toLowerCase().includes(search)
          );
          renderTable(filtered);
        }

        function renderTable(clients) {
          let html = '<table><tr><th>Photo</th><th>Pseudo</th><th>Nom</th><th>Téléphone</th><th>Solde</th><th>Limite J/M</th><th>Statut</th><th>Actions</th></tr>';

          clients.forEach(c => {
            const photo = c.photoProfil? '<img src="' + c.photoProfil + '" class="avatar">' : '-';
            const statut = c.bloque ? '<span class="badge-bloque">BLOQUÉ</span>' : '<span class="badge-actif">ACTIF</span>';
            const btnBlock = c.bloque 
              ? '<button class="unblock" onclick="toggleBlock(\\'' + c._id + '\\', false)">Débloquer</button>'
              : '<button class="block" onclick="toggleBlock(\\'' + c._id + '\\', true)">Bloquer</button>';
            
            html += \`
              <tr id="row-\${c._id}">
                <td>\${photo}</td>
                <td>\${c.pseudo || '-'}</td>
                <td>\${c.prenom} \${c.nom}</td>
                <td>\${c.telephone}</td>
                <td>\${c.solde.toLocaleString()} FCFA</td>
                <td>\${(c.limiteJournaliere||0).toLocaleString()}/\${(c.limiteMensuelle||0).toLocaleString()}</td>
                <td>\${statut}</td>
                <td>
                  <button class="edit" onclick="modifierSolde('\${c._id}', '\${c.nom}', \${c.solde})">Solde</button>
                  <button class="limit" onclick="modifierLimites('\${c._id}', \${c.limiteJournaliere||0}, \${c.limiteMensuelle||0})">Limites</button>
                  <button class="reset" onclick="resetPassword('\${c._id}', '\${c.pseudo || c.prenom}')">Reset Pass</button>
                  <button class="view" onclick='voirCNI(\${JSON.stringify(c)})'>CNI</button>
                  \${btnBlock}
                  <button class="delete" onclick="supprimerClient('\${c._id}')">Supprimer</button>
                </td>
              </tr>
            \`;
          });

          html += '</table>';
          document.getElementById('content').innerHTML = html;
        }

        async function resetPassword(id, nom) {
          if (!confirm('Réinitialiser le mot de passe de ' + nom + ' à "1234" ?')) return;
          
          const res = await fetch('/api/clients/' + id + '/reset-password', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ password: '1234' })
          });
          
          if (res.ok) {
            alert('Mot de passe réinitialisé à 1234 pour ' + nom);
          } else {
            const data = await res.json();
            alert('Erreur: ' + data.error);
          }
        }

        function modifierLimites(id, limitJour, limitMois) {
          currentClientId = id;
          document.getElementById('limitJour').value = limitJour;
          document.getElementById('limitMois').value = limitMois;
          document.getElementById('limitModal').style.display = 'block';
        }

        async function saveLimites() {
          const limitJour = Number(document.getElementById('limitJour').value);
          const limitMois = Number(document.getElementById('limitMois').value);
          
          if (!limitJour || !limitMois) {
            alert('Veuillez remplir les deux limites');
            return;
          }

          const res = await fetch('/api/clients/' + currentClientId, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ 
              limiteJournaliere: limitJour,
              limiteMensuelle: limitMois 
            })
          });
          
          if (res.ok) {
            alert('Limites modifiées avec succès');
            closeModal('limitModal');
            loadClients();
          } else {
            const data = await res.json();
            alert('Erreur: ' + data.error);
          }
        }

        async function toggleBlock(id, bloquer) {
          const action = bloquer ? 'bloquer' : 'débloquer';
          if (!confirm('Voulez-vous ' + action + ' ce client ?')) return;
          
          const res = await fetch('/api/clients/' + id + '/block', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ bloque: bloquer })
          });
          
          if (res.ok) {
            alert('Client ' + action + ' avec succès');
            loadClients();
          } else {
            const data = await res.json();
            alert('Erreur: ' + data.error);
          }
        }

        function voirCNI(client) {
          let html = '<p><b>' + client.prenom + ' ' + client.nom + '</b></p>';
          if (client.carteRecto) {
            html += '<p>Recto:</p><img src="' + client.carteRecto + '">';
          }
          if (client.carteVerso) {
            html += '<p>Verso:</p><img src="' + client.carteVerso + '">';
          }
          if (!client.carteRecto && !client.carteVerso) {
            html += '<p style="color:#999">Aucune pièce d\\'identité uploadée</p>';
          }
          document.getElementById('cniContent').innerHTML = html;
          document.getElementById('cniModal').style.display = 'block';
        }

        function closeModal(modalId) {
          document.getElementById(modalId).style.display = 'none';
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

        async function modifierSolde(id, nom, soldeActuel) {
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

        window.onclick = function(event) {
          if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
          }
        }

        loadClients();
      </script>
    </body>
    </html>
  `);
});
// ==================== ROUTES API ====================
// DELETE /api/clients/:id - Supprimer un client
router.delete('/:id', async (req, res) => {
  try {
    const clientId = req.params.id;
    console.log('ok');
    // 1. Vérifie que le client existe
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ error: 'Client introuvable' });
    }

    // 2. Empêche la suppression d'un admin
    if (client.role === 'admin') {
      return res.status(403).json({ error: 'Impossible de supprimer un administrateur' });
    }

    // 3. Vérifie qu'il n'a pas de solde
    if (client.solde > 0) {
      return res.status(400).json({ 
        error: `Impossible de supprimer: solde de ${client.solde.toLocaleString()} FCFA restant` 
      });
    }

    // 4. Vérifie qu'il n'a pas de transactions en attente
    const txEnAttente = await Transaction.findOne({ 
      $or: [{ expediteur: clientId }, { destinataire: clientId }],
      status: 'en_attente'
    });
    
    if (txEnAttente) {
      return res.status(400).json({ 
        error: 'Impossible de supprimer: transactions en attente' 
      });
    }

    // 5. Supprime le client
    await Client.findByIdAndDelete(clientId);

    // 6. Optionnel: anonymiser les transactions passées au lieu de les supprimer
    await Transaction.updateMany(
      { expediteur: clientId },
      { $set: { expediteurSupprime: true, expediteurNom: client.prenom + ' ' + client.nom } }
    );
    await Transaction.updateMany(
      { destinataire: clientId },
      { $set: { destinataireSupprime: true, destinataireNom: client.prenom + ' ' + client.nom } }
    );

    res.json({ 
      success: true, 
      message: 'Client supprimé avec succès' 
    });

  } catch (err) {
    console.error('Erreur suppression client:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/clients/:id/reset-password - Reset mot de passe à 1234
router.put('/:id/reset-password', async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('1234', 10);
    
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { password: hash },
      { new: true }
    );
    
    if (!client) return res.status(404).json({ error: 'Client introuvable' });
    
    res.json({ 
      success: true, 
      message: 'Mot de passe réinitialisé à 1234' 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET tous les clients
router.get('/', async (req, res) => {
  try {
    const clients = await Client.find().select('-password');
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clients/me - Profil du client connecté
router.get('/me', async (req, res) => {
  res.json(req.client);
});

// GET /api/clients/search - Chercher client par téléphone/pseudo pour transfert
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query; // q = téléphone ou pseudo
    if (!q) return res.json([]);

    const clients = await Client.find({
      $and: [
        { _id: { $ne: req.client._id } }, // Pas soi-même
        {
          $or: [
            { telephone: { $regex: q, $options: 'i' } },
            { pseudo: { $regex: q, $options: 'i' } },
            { nom: { $regex: q, $options: 'i' } },
            { prenom: { $regex: q, $options: 'i' } }
          ]
        }
      ]
    }).select('nom prenom pseudo telephone photoProfil').limit(10);

    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// POST créer client avec upload
router.post('/', upload.fields([
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
    console.log('client:', client);
    await client.save();
    res.status(201).json({ message: 'Client créé', client });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
// PUT /api/clients/:id/block - Bloquer/Débloquer
router.put('/:id/block', async (req, res) => {
  try {
    const { bloque } = req.body;
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { bloque },
      { new: true }
    );
    if (!client) return res.status(404).json({ error: 'Client introuvable' });
    res.json({ success: true, client });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// GET un client - DOIT ÊTRE EN DERNIER
router.put('/:id', async (req, res) => {
  try {
    const { solde, limiteJournaliere, limiteMensuelle } = req.body;
    const update = {};
    
    if (solde !== undefined) update.solde = solde;
    if (limiteJournaliere !== undefined) update.limiteJournaliere = limiteJournaliere;
    if (limiteMensuelle !== undefined) update.limiteMensuelle = limiteMensuelle;
    
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    );
    
    if (!client) return res.status(404).json({ error: 'Client introuvable' });
    res.json({ success: true, client });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
