const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Transaction = require('../models/Transaction');
const { verifyAdmin, authUser } = require('../middleware/auth');

// ==================== ROUTES API JSON ====================

// GET /api/transactions/data - Données pour le tableau avec recherche
router.get('/data', async (req, res) => {
  try {
    const { client, debut, fin, q, montantMin, montantMax } = req.query;
    let query = {};
    
    // Filtre par client depuis select
    if (client) {
      query = { $or: [{ expediteur: client }, { destinataire: client }] };
    }
    
    // Filtre par date
    if (debut || fin) {
      query.date = {};
      if (debut) query.date.$gte = new Date(debut);
      if (fin) query.date.$lte = new Date(fin + 'T23:59:59');
    }
    
    // Filtre par montant
    if (montantMin || montantMax) {
      query.montant = {};
      if (montantMin) query.montant.$gte = Number(montantMin);
      if (montantMax) query.montant.$lte = Number(montantMax);
    }
    
    let transactions = await Transaction.find(query)
     .populate('expediteur', 'nom prenom telephone')
     .populate('destinataire', 'nom prenom telephone')
     .sort({ date: -1 })
     .lean();
    
    // Filtrer transactions avec clients supprimés
    transactions = transactions.filter(t => t.expediteur && t.destinataire);
    
    // Recherche texte : nom ou téléphone
    if (q && q.trim() !== '') {
      const search = q.toLowerCase();
      transactions = transactions.filter(t => {
        const expNom = `${t.expediteur.prenom} ${t.expediteur.nom}`.toLowerCase();
        const destNom = `${t.destinataire.prenom} ${t.destinataire.nom}`.toLowerCase();
        const expTel = t.expediteur.telephone || '';
        const destTel = t.destinataire.telephone || '';
        return expNom.includes(search) || destNom.includes(search) || 
               expTel.includes(search) || destTel.includes(search);
      });
    }
    
    const volumeTotal = transactions
      .filter(t => !t.annulee)
      .reduce((sum, t) => sum + t.montant, 0);
    
    res.json({ 
      transactions, 
      stats: { total: transactions.length, volumeTotal } 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// GET /api/transactions/stats - Stats dashboard
router.get('/stats', verifyAdmin, async (req, res) => {
  try {
    const jours = parseInt(req.query.jours) || 30;
    const dateDebut = new Date();
    dateDebut.setDate(dateDebut.getDate() - jours);
    
    const transactions = await Transaction.find({ 
      date: { $gte: dateDebut },
      annulee: { $ne: true }
    }).lean();
    
    const totalTx = transactions.length;
    const volumeTotal = transactions.reduce((sum, t) => sum + t.montant, 0);
    const moyenne = totalTx > 0 ? volumeTotal / totalTx : 0;
    
    const clientsSet = new Set();
    transactions.forEach(t => {
      if (t.expediteur) clientsSet.add(t.expediteur.toString());
      if (t.destinataire) clientsSet.add(t.destinataire.toString());
    });
    
    const parJour = {};
    for (let i = 0; i < jours; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      parJour[key] = { date: key, volume: 0, count: 0 };
    }
    
    transactions.forEach(t => {
      const key = new Date(t.date).toISOString().split('T')[0];
      if (parJour[key]) {
        parJour[key].volume += t.montant;
        parJour[key].count += 1;
      }
    });
    
    res.json({ 
      totalTx, 
      volumeTotal, 
      moyenne, 
      clientsActifs: clientsSet.size, 
      parJour: Object.values(parJour).reverse() 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/transactions/top-clients - Top expéditeurs/destinataires
router.get('/top-clients', verifyAdmin, async (req, res) => {
  try {
    const jours = parseInt(req.query.jours) || 30;
    const limit = parseInt(req.query.limit) || 10;
    const dateDebut = new Date();
    dateDebut.setDate(dateDebut.getDate() - jours);

    const transactions = await Transaction.find({
      date: { $gte: dateDebut },
      annulee: { $ne: true }
    }).populate('expediteur', 'nom prenom telephone').populate('destinataire', 'nom prenom telephone').lean();

    const expediteurs = {};
    const destinataires = {};

    transactions.forEach(t => {
      if (!t.expediteur ||!t.destinataire) return;

      // Top expéditeurs
      const expId = t.expediteur._id.toString();
      if (!expediteurs[expId]) {
        expediteurs[expId] = {
          id: expId,
          nom: t.expediteur.prenom + ' ' + t.expediteur.nom,
          telephone: t.expediteur.telephone,
          volume: 0,
          nbTx: 0
        };
      }
      expediteurs[expId].volume += t.montant;
      expediteurs[expId].nbTx += 1;

      // Top destinataires
      const destId = t.destinataire._id.toString();
      if (!destinataires[destId]) {
        destinataires[destId] = {
          id: destId,
          nom: t.destinataire.prenom + ' ' + t.destinataire.nom,
          telephone: t.destinataire.telephone,
          volume: 0,
          nbTx: 0
        };
      }
      destinataires[destId].volume += t.montant;
      destinataires[destId].nbTx += 1;
    });

    const topExpediteurs = Object.values(expediteurs)
     .sort((a, b) => b.volume - a.volume)
     .slice(0, limit);

    const topDestinataires = Object.values(destinataires)
     .sort((a, b) => b.volume - a.volume)
     .slice(0, limit);

    res.json({ topExpediteurs, topDestinataires });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/transactions/send - Un client envoie à un autre
router.post('/send', async (req, res) => {
  try {
    const { destinataire, montant, motif } = req.body; // destinataire = _id ou téléphone
    const expediteur = req.client._id; // Auto = client connecté

    if (expediteur.toString() === destinataire) {
      return res.status(400).json({ error: 'Tu ne peux pas t\'envoyer à toi-même' });
    }

    // Si destinataire = téléphone, on cherche l'_id
    let destId = destinataire;
    if (!mongoose.Types.ObjectId.isValid(destinataire)) {
      const dest = await Client.findOne({ telephone: destinataire });
      if (!dest) return res.status(404).json({ error: 'Destinataire introuvable' });
      destId = dest._id;
    }

    const clientExp = await Client.findById(expediteur);
    const clientDest = await Client.findById(destId);

    if (!clientDest) return res.status(404).json({ error: 'Destinataire introuvable' });
    if (clientExp.solde < montant) {
      return res.status(400).json({ error: `Solde insuffisant: ${clientExp.solde} FCFA` });
    }

    // Limites journalières
    const debutJour = new Date();
    debutJour.setHours(0, 0, 0, 0);
    const totalJour = await Transaction.aggregate([
      { $match: { expediteur: clientExp._id, date: { $gte: debutJour }, annulee: { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$montant' } } }
    ]);
    const dejaEnvoye = totalJour[0]?.total || 0;
    if (dejaEnvoye + montant > clientExp.limiteJournaliere) {
      return res.status(400).json({ error: `Limite journalière dépassée: ${clientExp.limiteJournaliere} FCFA` });
    }

    // Transfert atomique
    await Client.updateOne({ _id: expediteur }, { $inc: { solde: -Number(montant) } });
    await Client.updateOne({ _id: destId }, { $inc: { solde: Number(montant) } });

    const transaction = new Transaction({
      expediteur,
      destinataire: destId,
      montant: Number(montant),
      motif
    });
    await transaction.save();

    res.status(201).json({
      message: `Transfert de ${montant} FCFA à ${clientDest.prenom} réussi`,
      transaction
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//trouve lhistorique dun seul client
// GET /api/transactions/my - Historique du client connecté
router.get('/me', authUser, async (req, res) => {
  try {
    const user = await Client.findById(req.user.id).select('solde');
    const transactions = await Transaction.find({
      $or: [{expediteur: req.user._id }, { destinataire: req.user._id }]
    })
    .populate('expediteur', 'nom prenom telephone photoProfil pseudo')
    .populate('destinataire', 'nom prenom telephone photoProfil pseudo')
    .sort({ createdAt: -1 }) // ← createdAt, pas date si tu utilises timestamps
    .lean();

    

    res.json({
          solde: user?.solde || 0, // ✅ Fallback à 0
          transactions: transactions.map(t => ({
            id: t._id,
            type: t.expediteur._id.equals(req.user.id)? 'envoi' : 'reception',
            montant: t.montant,
            frais: t.frais || 0,
            contact: t.expediteur._id.equals(req.user.id)? t.destinataire : t.expediteur,
            motif: t.motif || '',
            status: t.status,
            soldeExpediteurApres: t.soldeExpediteurApres || 0,
            date: t.createdAt
          }))
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
// GET /api/transactions/my - Historique du client connecté
router.get('/my', async (req, res) => {
  const transactions = await Transaction.find({
    $or: [{ expediteur: req.client._id }, { destinataire: req.client._id }]
  })
 .populate('expediteur', 'nom prenom telephone photoProfil')
 .populate('destinataire', 'nom prenom telephone photoProfil')
 .sort({ date: -1 })
 .lean();

  res.json(transactions);
});



//rechercher un client par numero ou par pseudo
router.get('/search', authUser, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Recherche trop courte' });
    }
    console.log(q);
    const regex = new RegExp(q, 'i'); // case insensitive
    
    const users = await Client.find({
      $or: [
        { pseudo: regex },
        { telephone: regex },
        { nom: regex },
        { prenom: regex }
      ],
      _id: { $ne: req.user.id } // Exclure soi-même
    })
    .select('nom prenom pseudo telephone photoProfil')
    .limit(10)
    .lean();

    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== ROUTES HTML ====================

// GET /api/transactions/add - Formulaire transfert
router.get('/add', async (req, res) => {
  try {
    const clients = await Client.find().select('nom prenom telephone solde').lean();
    let options = '';
    clients.forEach(c => {
      options += `<option value="${c._id}">${c.prenom} ${c.nom} - ${c.telephone} - ${c.solde} FCFA</option>`;
    });

    res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Transfert UniPay</title>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial; padding: 20px; max-width: 500px; margin: auto; }
    input, select { width: 100%; padding: 8px; margin: 8px 0; box-sizing: border-box; }
    button { padding: 10px 20px; background: #007bff; color: white; border: none; cursor: pointer; }
    #msg { margin-top: 15px; padding: 10px; }
    .success { background: #d4edda; color: #155724; }
    .error { background: #f8d7da; color: #721c24; }
  </style>
</head>
<body>
  <h2>Effectuer un transfert</h2>
  <a href="/api/clients/admin">← Admin</a> | <a href="/api/transactions">Historique</a> | <a href="/api/transactions/dashboard">Dashboard</a> | <a href="#" onclick="logout()">Déconnexion</a><br><br>
  <form id="transferForm">
    <label>Expéditeur:</label><select name="expediteur" required><option value="">Choisir...</option>${options}</select>
    <label>Destinataire:</label><select name="destinataire" required><option value="">Choisir...</option>${options}</select>
    <label>Montant (FCFA):</label><input name="montant" type="number" min="1" required>
    <label>Motif:</label><input name="motif" placeholder="Ex: Remboursement">
    <button type="submit">Envoyer</button>
  </form>
  <div id="msg"></div>
  <script>
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Token manquant. Connecte-toi d\\'abord.');
      window.location.href = '/api/auth/login-test';
    }
    
    function logout() {
      localStorage.removeItem('token');
      window.location.href = '/api/auth/login-test';
    }
    
    transferForm.onsubmit = async e => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target));
      if (body.expediteur === body.destinataire) {
        msg.className = 'error'; msg.innerText = 'Même compte'; return;
      }
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok) {
        msg.className = 'success';
        msg.innerHTML = data.message + '<br><a href="/api/transactions">Voir historique</a>';
        e.target.reset();
      } else {
        msg.className = 'error'; 
        msg.innerText = 'Erreur: ' + data.error;
        if (res.status === 401) {
          setTimeout(() => window.location.href = '/api/auth/login-test', 2000);
        }
      }
    };
  </script>
</body>
</html>`);
  } catch (error) {
    res.status(500).send('Erreur: ' + error.message);
  }
});
// GET /api/transactions/dashboard - Dashboard avec top clients
router.get('/dashboard', async (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Dashboard UniPay</title>
  <meta charset="UTF-8">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: Arial; padding: 20px; background: #f5f5f5; }
  .container { max-width: 1400px; margin: auto; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 20px 0; }
  .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
  .card h3 { margin: 0 0 10px 0; color: #666; font-size: 14px; }
  .value { font-size: 32px; font-weight: bold; color: #007bff; }
  .chart-container { background: white; padding: 20px; border-radius: 8px; margin-top: 20px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .top-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  .top-table th { background: #007bff; color: white; padding: 10px; text-align: left; }
  .top-table td { border: 1px solid #ddd; padding: 8px; }
  .top-table tr:nth-child(even) { background: #f2f2f2; }
  .rank { font-weight: bold; color: #007bff; }
  .montant-top { color: #28a745; font-weight: bold; }
    button { padding: 10px 20px; margin: 5px; border: none; cursor: pointer; border-radius: 4px; background: #007bff; color: white; }
  .filtres { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
    select { padding: 8px; margin-right: 10px; }
    @media (max-width: 768px) {.grid-2 { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="container">
    <h1>Dashboard UniPay</h1>
    <a href="/api/clients/admin">← Admin</a> | <a href="/api/transactions">Historique</a>

    <div class="filtres">
      <select id="periode">
        <option value="7">7 derniers jours</option>
        <option value="30" selected>30 derniers jours</option>
        <option value="90">90 derniers jours</option>
        <option value="365">1 an</option>
      </select>
      <button onclick="loadAll()">Actualiser</button>
    </div>

    <div class="cards">
      <div class="card"><h3>TOTAL TRANSACTIONS</h3><div class="value" id="totalTx">0</div></div>
      <div class="card"><h3>VOLUME TOTAL</h3><div class="value" id="volumeTotal">0 FCFA</div></div>
      <div class="card"><h3>TRANSACTION MOYENNE</h3><div class="value" id="moyenne">0 FCFA</div></div>
      <div class="card"><h3>CLIENTS ACTIFS</h3><div class="value" id="clientsActifs">0</div></div>
    </div>

    <div class="grid-2">
      <div class="chart-container"><h3>Volume par jour</h3><canvas id="volumeChart"></canvas></div>
      <div class="chart-container"><h3>Nombre de transactions par jour</h3><canvas id="countChart"></canvas></div>
    </div>

    <div class="grid-2">
      <div class="chart-container">
        <h3>🏆 Top 10 Expéditeurs</h3>
        <table class="top-table" id="topExpediteurs">
          <tr><th>#</th><th>Client</th><th>Volume</th><th>Nb Tx</th></tr>
          <tr><td colspan="4">Chargement...</td></tr>
        </table>
      </div>
      <div class="chart-container">
        <h3>🎯 Top 10 Destinataires</h3>
        <table class="top-table" id="topDestinataires">
          <tr><th>#</th><th>Client</th><th>Volume</th><th>Nb Tx</th></tr>
          <tr><td colspan="4">Chargement...</td></tr>
        </table>
      </div>
    </div>
  </div>

  <script>
    const token = localStorage.getItem('token');
    if (!token) window.location.href = '/api/auth/login';
    let volumeChart, countChart;

    async function loadAll() {
      await Promise.all([loadDashboard(), loadTopClients()]);
    }

    async function loadDashboard() {
      const jours = document.getElementById('periode').value;
      const res = await fetch('/api/transactions/stats?jours=' + jours, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('token');
        window.location.href = '/api/auth/login';
        return;
      }
      const data = await res.json();
      document.getElementById('totalTx').innerText = data.totalTx.toLocaleString();
      document.getElementById('volumeTotal').innerText = data.volumeTotal.toLocaleString() + ' FCFA';
      document.getElementById('moyenne').innerText = Math.round(data.moyenne).toLocaleString() + ' FCFA';
      document.getElementById('clientsActifs').innerText = data.clientsActifs;

      if (volumeChart) volumeChart.destroy();
      volumeChart = new Chart(document.getElementById('volumeChart'), {
        type: 'line',
        data: {
          labels: data.parJour.map(d => d.date),
          datasets: [{
            label: 'Volume FCFA',
            data: data.parJour.map(d => d.volume),
            borderColor: '#007bff',
            backgroundColor: 'rgba(0, 123, 255, 0.1)',
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString() + ' FCFA' } } }
        }
      });

      if (countChart) countChart.destroy();
      countChart = new Chart(document.getElementById('countChart'), {
        type: 'bar',
        data: {
          labels: data.parJour.map(d => d.date),
          datasets: [{
            label: 'Transactions',
            data: data.parJour.map(d => d.count),
            backgroundColor: '#28a745'
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
      });
    }

    async function loadTopClients() {
      const jours = document.getElementById('periode').value;
      const res = await fetch('/api/transactions/top-clients?jours=' + jours + '&limit=10', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();

      let htmlExp = '<tr><th>#</th><th>Client</th><th>Volume</th><th>Nb Tx</th></tr>';
      data.topExpediteurs.forEach((c, i) => {
        htmlExp += '<tr><td class="rank">' + (i+1) + '</td><td>' + c.nom + '<br><small>' + c.telephone + '</small></td><td class="montant-top">' + c.volume.toLocaleString() + ' FCFA</td><td>' + c.nbTx + '</td></tr>';
      });
      document.getElementById('topExpediteurs').innerHTML = htmlExp;

      let htmlDest = '<tr><th>#</th><th>Client</th><th>Volume</th><th>Nb Tx</th></tr>';
      data.topDestinataires.forEach((c, i) => {
        htmlDest += '<tr><td class="rank">' + (i+1) + '</td><td>' + c.nom + '<br><small>' + c.telephone + '</small></td><td class="montant-top">' + c.volume.toLocaleString() + ' FCFA</td><td>' + c.nbTx + '</td></tr>';
      });
      document.getElementById('topDestinataires').innerHTML = htmlDest;
    }

    loadAll();
  </script>
</body>
</html>`);
});
router.get('/', async (req, res) => {
  try {
    const clients = await Client.find().select('nom prenom').lean();
    let optionsClients = '<option value="">Tous les clients</option>';
    clients.forEach(c => {
      optionsClients += `<option value="${c._id}">${c.prenom} ${c.nom}</option>`;
    });

    res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Historique Transactions</title>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial; padding: 20px; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
    th { background: #007bff; color: white; }
    tr:nth-child(even) { background: #f2f2f2; }
    tr.annulee { opacity: 0.5; background: #ffe6e6; }
   .montant { color: #28a745; font-weight: bold; }
   .filtres { margin: 15px 0; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    select, input, button { padding: 8px; }
   .actions button { margin: 5px; color: white; border: none; cursor: pointer; }
   .print { background: #6c757d; }.csv { background: #17a2b8; }.pdf { background: #dc3545; }
   .btn-annuler { background: #dc3545; padding: 5px 10px; border-radius: 3px; color: white; border: none; cursor: pointer; }
   .badge-ok { color: #28a745; font-weight: bold; }
   .badge-ko { color: #dc3545; font-weight: bold; }
    @media print {.filtres,.actions, a, .btn-annuler { display: none; } }
  </style>
</head>
<body>
  <h2>Historique des transactions</h2>
  <a href="/api/clients/admin">← Admin</a> | <a href="/api/transactions/add">Nouveau transfert</a> | <a href="/api/transactions/dashboard">Dashboard</a>
  
  <div class="filtres">
    <select id="filterClient">${optionsClients}</select>
    <input type="text" id="filterNumero" placeholder="Rechercher par numéro">
    <input type="number" id="filterMontant" placeholder="Montant exact">
    <input type="date" id="dateDebut">
    <input type="date" id="dateFin">
    <button onclick="loadTransactions()">Filtrer</button>
    <button onclick="resetFiltres()">Reset</button>
  </div>

  <div class="actions">
    <button class="print" onclick="window.print()">Imprimer</button>
    <button class="csv" onclick="exportCSV()">Export CSV</button>
    <button class="pdf" onclick="exportPDF()">Export PDF</button>
  </div>
  <div id="stats"></div>
  <div id="content">Chargement...</div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js"></script>
  <script>
    const token = localStorage.getItem('token');
    if (!token) window.location.href = '/api/auth/login';
    let currentTransactions = [];
    
    async function loadTransactions() {
      try {
        const clientId = document.getElementById('filterClient').value;
        const numero = document.getElementById('filterNumero').value;
        const montant = document.getElementById('filterMontant').value;
        const dateDebut = document.getElementById('dateDebut').value;
        const dateFin = document.getElementById('dateFin').value;
        
        let url = '/api/transactions/data?';
        if (clientId) url += 'client=' + clientId + '&';
        if (numero) url += 'numero=' + numero + '&';
        if (montant) url += 'montant=' + montant + '&';
        if (dateDebut) url += 'debut=' + dateDebut + '&';
        if (dateFin) url += 'fin=' + dateFin;
        
        const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem('token');
          window.location.href = '/api/auth/login';
          return;
        }
        
        const data = await res.json();
        currentTransactions = data.transactions;
        renderTable(data.transactions);
        renderStats(data.stats);
      } catch (err) {
        document.getElementById('content').innerHTML = 'Erreur: ' + err.message;
      }
    }
    
    function renderStats(stats) {
      document.getElementById('stats').innerHTML = '<p><b>Total:</b> ' + stats.total + ' | <b>Volume:</b> ' + stats.volumeTotal.toLocaleString() + ' FCFA</p>';
    }
    
    function renderTable(transactions) {
      if (!transactions || transactions.length === 0) {
        document.getElementById('content').innerHTML = 'Aucune transaction';
        return;
      }
      
      let html = '<table><tr><th>Date</th><th>Expéditeur</th><th>Tél Exp.</th><th>Destinataire</th><th>Tél Dest.</th><th>Montant</th><th>Motif</th><th>Statut</th><th>Action</th></tr>';
      
      transactions.forEach(t => {
        if (!t.expediteur || !t.destinataire) return;
        
        const date = new Date(t.date).toLocaleString('fr-FR');
        const diffMinutes = (Date.now() - new Date(t.date)) / 60000;
        const peutAnnuler = diffMinutes <= 1440 && !t.annulee;
        const statut = t.annulee ? '<span class="badge-ko">ANNULÉE</span>' : '<span class="badge-ok">VALIDÉE</span>';
        
        let bouton = '<span style="color:#999">Expiré</span>';
        if (t.annulee) {
          bouton = '-';
        } else if (peutAnnuler) {
          bouton = '<button class="btn-annuler" onclick="annulerTx(\\'' + t._id + '\\')">Annuler</button>';
        }
        
        html += '<tr' + (t.annulee ? ' class="annulee"' : '') + '>';
        html += '<td>' + date + '</td>';
        html += '<td>' + t.expediteur.prenom + ' ' + t.expediteur.nom + '</td>';
        html += '<td>' + t.expediteur.telephone + '</td>';
        html += '<td>' + t.destinataire.prenom + ' ' + t.destinataire.nom + '</td>';
        html += '<td>' + t.destinataire.telephone + '</td>';
        html += '<td class="montant">' + t.montant.toLocaleString() + ' FCFA</td>';
        html += '<td>' + (t.motif || '-') + '</td>';
        html += '<td>' + statut + '</td>';
        html += '<td>' + bouton + '</td>';
        html += '</tr>';
      });
      
      html += '</table>';
      document.getElementById('content').innerHTML = html;
    }
    
    async function annulerTx(id) {
      if (!confirm('Confirmer l\\'annulation ?')) return;
      const res = await fetch('/api/transactions/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();
      alert(data.message || data.error);
      loadTransactions();
    }
    
    function exportCSV() {
      if (!currentTransactions.length) { alert('Aucune donnée'); return; }
      let csv = 'Date,Expéditeur,Tél Exp,Destinataire,Tél Dest,Montant,Motif,Statut\\n';
      currentTransactions.forEach(t => {
        if (!t.expediteur || !t.destinataire) return;
        const date = new Date(t.date).toLocaleString('fr-FR');
        const statut = t.annulee ? 'Annulée' : 'Validée';
        csv += '"' + date + '","' + t.expediteur.prenom + ' ' + t.expediteur.nom + '","' + t.expediteur.telephone + '","' + t.destinataire.prenom + ' ' + t.destinataire.nom + '","' + t.destinataire.telephone + '",' + t.montant + ',"' + (t.motif || '') + '","' + statut + '"\\n';
      });
      const blob = new Blob([csv], { type: 'text/csv' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'transactions.csv';
      link.click();
    }
    
    function exportPDF() {
      if (!currentTransactions.length) { alert('Aucune donnée'); return; }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('l');
      doc.setFontSize(16);
      doc.text('Historique Transactions UniPay', 14, 15);
      const tableData = currentTransactions.filter(t => t.expediteur && t.destinataire).map(t => [
        new Date(t.date).toLocaleString('fr-FR'),
        t.expediteur.prenom + ' ' + t.expediteur.nom,
        t.expediteur.telephone,
        t.destinataire.prenom + ' ' + t.destinataire.nom,
        t.destinataire.telephone,
        t.montant.toLocaleString() + ' FCFA',
        t.motif || '-',
        t.annulee ? 'Annulée' : 'Validée'
      ]);
      doc.autoTable({
        head: [['Date', 'Expéditeur', 'Tél Exp', 'Destinataire', 'Tél Dest', 'Montant', 'Motif', 'Statut']],
        body: tableData,
        startY: 25,
        styles: { fontSize: 7 }
      });
      doc.save('transactions.pdf');
    }
    
    function resetFiltres() {
      document.getElementById('filterClient').value = '';
      document.getElementById('filterNumero').value = '';
      document.getElementById('filterMontant').value = '';
      document.getElementById('dateDebut').value = '';
      document.getElementById('dateFin').value = '';
      loadTransactions();
    }
    
    loadTransactions();
  </script>
</body>
</html>`);
  } catch (error) {
    res.status(500).send('Erreur: ' + error.message);
  }
});

// ==================== ROUTES ACTION ====================

router.post('/f', authUser, async (req, res) => {
  try {
    const { expediteur, destinataire, montant, motif } = req.body;
    
    if (req.user.id !== expediteur) {
      return res.status(403).json({ error: 'Tu ne peux transférer que depuis ton compte' });
    }

    const exp = await Client.findById(expediteur);
    const dest = await Client.findById(destinataire);

    if (!exp || !dest) return res.status(404).json({ error: 'Compte introuvable' });
    if (exp.solde < montant) return res.status(400).json({ error: 'Solde insuffisant' });

    const frais = Math.round(montant * 0.01);

    // Créer transaction
    const tx = new Transaction({
      expediteur: exp._id, // ✅ passe l'ID, pas l'objet complet
      destinataire: dest._id,
      montant: Number(montant),
      motif,
      frais,
      status: 'validee'
    });

    await tx.save(); // ✅ MANQUAIT CETTE LIGNE

    // Update soldes
    await Client.findByIdAndUpdate(
      expediteur, 
      { $inc: { solde: -(montant + frais) } }
    );

    await Client.findByIdAndUpdate(
      destinataire, 
      { $inc: { solde: montant } }
    );

    const updatedExp = await Client.findById(expediteur).select('solde');

    const transactions = await Transaction.find({
      $or: [{ expediteur: exp._id }, { destinataire: exp._id }]
    })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('expediteur', 'nom prenom telephone pseudo photoProfil')
    .populate('destinataire', 'nom prenom telephone pseudo photoProfil');

    res.json({
      message: 'Transfert effectué',
      nouveauSolde: updatedExp.solde,
      historique: transactions.map(t => ({
        id: t._id,
        type: t.expediteur._id.equals(exp._id)? 'envoi' : 'reception',
        montant: t.montant,
        frais: t.frais || 0,
        contact: t.expediteur._id.equals(exp._id)? t.destinataire : t.expediteur,
        motif: t.motif || '',
        status: t.status,
        date: t.createdAt
      }))
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// route nouvelle
router.post('/', authUser, async (req, res) => {
  try {
    const { expediteur, destinataire, montant, motif } = req.body;
    
    if (req.user.id !== expediteur) {
      return res.status(403).json({ error: 'Tu ne peux transférer que depuis ton compte' });
    }

    const exp = await Client.findById(expediteur);
    const dest = await Client.findById(destinataire);

    if (!exp || !dest) return res.status(404).json({ error: 'Compte introuvable' });
    if (exp.solde < montant) return res.status(400).json({ error: 'Solde insuffisant' });

    const frais = Math.round(montant * 0.01);
    const nouveauSoldeExp = exp.solde - montant - frais;
    const nouveauSoldeDest = dest.solde + montant;
    
    const tx = await Transaction.create({
      expediteur: exp._id,
      destinataire: dest._id,
      montant: Number(montant),
      motif,
      frais,
      status: 'validee',
      soldeExpediteurApres: nouveauSoldeExp, // ✅ stocke le solde
      soldeDestinataireApres: nouveauSoldeDest // ✅ stocke le solde
    });
    await tx.save(); // ✅ MANQUAIT CETTE LIGNE
    await Promise.all([
      Client.findByIdAndUpdate(expediteur, { solde: nouveauSoldeExp }),
      Client.findByIdAndUpdate(destinataire, { solde: nouveauSoldeDest })
    ]);

    // 2. Mettre à jour les soldes des 2 comptes
    const [updatedExp, updatedDest] = await Promise.all([
      Client.findByIdAndUpdate(
        expediteur, 
        { solde: nouveauSoldeExp },
        { new: true, select: 'solde nom prenom' }
      ),
      Client.findByIdAndUpdate(
        destinataire, 
        { solde: nouveauSoldeDest },
        { new: true, select: 'solde nom prenom' }
      )
    ]);

    // 3. Récupère l'historique
    const transactions = await Transaction.find({
      $or: [{ expediteur: exp._id }, { destinataire: exp._id }]
    })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('expediteur', 'nom prenom telephone pseudo photoProfil')
    .populate('destinataire', 'nom prenom telephone pseudo photoProfil');

    res.json({
      message: 'Transfert effectué',
      nouveauSolde: updatedExp.solde,
      nouveauSoldeDestinataire: updatedDest.solde, // ✅ tu peux renvoyer les 2
      historique: transactions.map(t => ({
        id: t._id,
        type: t.expediteur._id.equals(exp._id)? 'envoi' : 'reception',
        montant: t.montant,
        frais: t.frais || 0,
        contact: t.expediteur._id.equals(exp._id)? t.destinataire : t.expediteur,
        motif: t.motif || '',
        status: t.status,
        date: t.createdAt
      }))
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== ROUTES AVEC :id EN DERNIER ====================

// DELETE /api/transactions/:id - Annuler transaction
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
     .populate('expediteur')
     .populate('destinataire');

    if (!transaction) return res.status(404).json({ error: 'Transaction introuvable' });

    const diffHeures = (Date.now() - transaction.date) / (1000 * 60 * 60);
    if (diffHeures > 24) return res.status(400).json({ error: 'Annulation possible que pendant 24h' });
    if (transaction.annulee) return res.status(400).json({ error: 'Transaction déjà annulée' });
    if (!transaction.expediteur || !transaction.destinataire) return res.status(404).json({ error: 'Client introuvable' });

    const clientExp = await Client.findById(transaction.expediteur._id);
    const clientDest = await Client.findById(transaction.destinataire._id);

    if (!clientExp || !clientDest) return res.status(404).json({ error: 'Client introuvable' });
    if (clientDest.solde < transaction.montant) {
      return res.status(400).json({ error: 'Impossible d\'annuler : solde destinataire insuffisant (' + clientDest.solde + ' FCFA)' });
    }

    clientExp.solde += Number(transaction.montant);
    clientDest.solde -= Number(transaction.montant);
    await clientExp.save();
    await clientDest.save();

    transaction.annulee = true;
    transaction.dateAnnulation = new Date();
    await transaction.save();

    res.json({ message: 'Transaction annulée. ' + transaction.montant + ' FCFA remboursé à ' + clientExp.prenom + ' ' + clientExp.nom });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
