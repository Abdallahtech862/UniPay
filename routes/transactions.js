const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Transaction = require('../models/Transaction');
const { verifyAdmin } = require('../middleware/auth');

// Page formulaire transfert
router.get('/add', async (req, res) => {
  const clients = await Client.find().select('nom prenom telephone solde');
  let options = '';
  clients.forEach(c => {
    options += `<option value="${c._id}">${c.prenom} ${c.nom} - ${c.telephone} - ${c.solde} FCFA</option>`;
  });

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Transfert UniPay</title>
      <style>
        body { font-family: Arial; padding: 20px; max-width: 500px; margin: auto; }
        input, select { width: 100%; padding: 8px; margin: 8px 0; }
        button { padding: 10px 20px; background: #007bff; color: white; border: none; cursor: pointer; }
        #msg { margin-top: 15px; padding: 10px; }
       .success { background: #d4edda; color: #155724; }
       .error { background: #f8d7da; color: #721c24; }
      </style>
    </head>
    <body>
      <h2>Effectuer un transfert</h2>
      <a href="/api/clients/admin">← Admin</a> | <a href="/api/transactions">Historique</a> | <a href="/api/transactions/dashboard">Dashboard</a><br><br>
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
        if (!token) window.location.href = '/api/auth/login';
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
            msg.className = 'error'; msg.innerText = 'Erreur: ' + data.error;
          }
        };
      </script>
    </body>
    </html>
  `);
});

// Page HTML Historique
// Page HTML Historique
router.get('/', async (req, res) => {
  const clients = await Client.find().select('nom prenom');
  let optionsClients = '<option value="">Tous les clients</option>';
  clients.forEach(c => {
    optionsClients += `<option value="${c._id}">${c.prenom} ${c.nom}</option>`;
  });

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Historique Transactions</title>
      <style>
        body { font-family: Arial; padding: 20px; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background: #007bff; color: white; }
        tr:nth-child(even) { background: #f2f2f2; }
        tr.annulee { opacity: 0.5; background: #ffe6e6; }
       .montant { color: #28a745; font-weight: bold; }
       .filtres { margin: 15px 0; }
        select, input, button { padding: 8px; margin-right: 10px; }
       .actions button { margin: 5px; color: white; border: none; cursor: pointer; }
       .print { background: #6c757d; }.csv { background: #17a2b8; }.pdf { background: #dc3545; }
       .btn-annuler { background: #dc3545; padding: 5px 10px; border-radius: 3px; }
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
          const clientId = document.getElementById('filterClient').value;
          const dateDebut = document.getElementById('dateDebut').value;
          const dateFin = document.getElementById('dateFin').value;
          let url = '/api/transactions/data?';
          if (clientId) url += 'client=' + clientId + '&';
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
        }
        
        function renderStats(stats) {
          document.getElementById('stats').innerHTML = '<p><b>Total:</b> ' + stats.total + ' | <b>Volume:</b> ' + stats.volumeTotal.toLocaleString() + ' FCFA</p>';
        }
        
        function renderTable(transactions) {
          if (transactions.length === 0) {
            document.getElementById('content').innerHTML = 'Aucune transaction trouvée';
            return;
          }
          
          let html = '<table id="tableTransactions"><tr><th>Date</th><th>Expéditeur</th><th>Destinataire</th><th>Montant</th><th>Motif</th><th>Statut</th><th>Action</th></tr>';
          transactions.forEach(t => {
            const date = new Date(t.date).toLocaleString('fr-FR');
            const diffHeures = (Date.now() - new Date(t.date)) / (1000 * 60 * 60);
            const peutAnnuler = diffHeures <= 24 && !t.annulee;
            const statut = t.annulee ? '<span class="badge-ko">ANNULÉE</span>' : '<span class="badge-ok">VALIDÉE</span>';
            
            let bouton = '-';
            if (peutAnnuler) {
              bouton = '<button class="btn-annuler" onclick="annulerTx(\'' + t._id + '\')">Annuler</button>';
            } else if (t.annulee) {
              bouton = '-';
            } else {
              bouton = '<span style="color:#999">Expiré</span>';
            }
            
            html += '<tr' + (t.annulee ? ' class="annulee"' : '') + '>';
            html += '<td>' + date + '</td>';
            html += '<td>' + t.expediteur.prenom + ' ' + t.expediteur.nom + '</td>';
            html += '<td>' + t.destinataire.prenom + ' ' + t.destinataire.nom + '</td>';
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
          if (!confirm('Confirmer l\\'annulation ? Les soldes seront remboursés.')) return;
          const res = await fetch('/api/transactions/' + id, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
          });
          const data = await res.json();
          if (res.ok) {
            alert(data.message);
            loadTransactions();
          } else {
            alert('Erreur: ' + data.error);
          }
        }
        
        function exportCSV() {
          if (currentTransactions.length === 0) { alert('Aucune donnée'); return; }
          let csv = 'Date,Expéditeur,Destinataire,Montant,Motif,Statut\\n';
          currentTransactions.forEach(t => {
            const date = new Date(t.date).toLocaleString('fr-FR');
            const exp = t.expediteur.prenom + ' ' + t.expediteur.nom;
            const dest = t.destinataire.prenom + ' ' + t.destinataire.nom;
            const statut = t.annulee ? 'Annulée' : 'Validée';
            csv += '"' + date + '","' + exp + '","' + dest + '",' + t.montant + ',"' + (t.motif || '') + '","' + statut + '"\\n';
          });
          const blob = new Blob([csv], { type: 'text/csv' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = 'transactions_' + new Date().toISOString().split('T')[0] + '.csv';
          link.click();
        }
        
        function exportPDF() {
          if (currentTransactions.length === 0) { alert('Aucune donnée'); return; }
          const { jsPDF } = window.jspdf;
          const doc = new jsPDF();
          doc.setFontSize(18);
          doc.text('Historique Transactions UniPay', 14, 20);
          const tableData = currentTransactions.map(t => [
            new Date(t.date).toLocaleString('fr-FR'),
            t.expediteur.prenom + ' ' + t.expediteur.nom,
            t.destinataire.prenom + ' ' + t.destinataire.nom,
            t.montant.toLocaleString() + ' FCFA',
            t.motif || '-',
            t.annulee ? 'Annulée' : 'Validée'
          ]);
          doc.autoTable({
            head: [['Date', 'Expéditeur', 'Destinataire', 'Montant', 'Motif', 'Statut']],
            body: tableData,
            startY: 30,
            styles: { fontSize: 8 }
          });
          doc.save('transactions.pdf');
        }
        
        function resetFiltres() {
          document.getElementById('filterClient').value = '';
          document.getElementById('dateDebut').value = '';
          document.getElementById('dateFin').value = '';
          loadTransactions();
        }
        
        loadTransactions();
      </script>
    </body>
    </html>
  `);
});

// Annuler une transaction - PROTÉGÉ
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
     .populate('expediteur')
     .populate('destinataire');

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction introuvable' });
    }

    // Check 24h max
    const diffHeures = (Date.now() - transaction.date) / (1000 * 60 * 60);
    if (diffHeures > 24) {
      return res.status(400).json({ error: 'Annulation possible que pendant 24h' });
    }

    // Check si déjà annulée
    if (transaction.annulee) {
      return res.status(400).json({ error: 'Transaction déjà annulée' });
    }

    const clientExp = await Client.findById(transaction.expediteur._id);
    const clientDest = await Client.findById(transaction.destinataire._id);

    if (!clientExp || !clientDest) {
      return res.status(404).json({ error: 'Client introuvable' });
    }

    // Vérifier que le destinataire a encore le montant
    if (clientDest.solde < transaction.montant) {
      return res.status(400).json({ 
        error: 'Impossible d\'annuler : solde destinataire insuffisant (' + clientDest.solde + ' FCFA)' 
      });
    }

    // Remboursement inverse
    clientExp.solde += Number(transaction.montant);
    clientDest.solde -= Number(transaction.montant);
    
    await clientExp.save();
    await clientDest.save();

    // Marquer comme annulée au lieu de supprimer
    transaction.annulee = true;
    transaction.dateAnnulation = new Date();
    await transaction.save();

    res.json({ 
      message: 'Transaction annulée. ' + transaction.montant + ' FCFA remboursé à ' + clientExp.prenom + ' ' + clientExp.nom
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dashboard
router.get('/dashboard', async (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Dashboard UniPay</title>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <style>
        body { font-family: Arial; padding: 20px; background: #f5f5f5; }
       .container { max-width: 1200px; margin: auto; }
       .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 20px 0; }
       .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
       .card h3 { margin: 0 0 10px 0; color: #666; font-size: 14px; }
       .card.value { font-size: 32px; font-weight: bold; color: #007bff; }
       .chart-container { background: white; padding: 20px; border-radius: 8px; margin-top: 20px; }
        button { padding: 10px 20px; margin: 5px; border: none; cursor: pointer; border-radius: 4px; background: #007bff; color: white; }
       .filtres { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
        select { padding: 8px; margin-right: 10px; }
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
          </select>
          <button onclick="loadDashboard()">Actualiser</button>
        </div>
        <div class="cards">
          <div class="card"><h3>TOTAL TRANSACTIONS</h3><div class="value" id="totalTx">0</div></div>
          <div class="card"><h3>VOLUME TOTAL</h3><div class="value" id="volumeTotal">0 FCFA</div></div>
          <div class="card"><h3>TRANSACTION MOYENNE</h3><div class="value" id="moyenne">0 FCFA</div></div>
          <div class="card"><h3>CLIENTS ACTIFS</h3><div class="value" id="clientsActifs">0</div></div>
        </div>
        <div class="chart-container"><h3>Volume par jour</h3><canvas id="volumeChart"></canvas></div>
        <div class="chart-container"><h3>Nombre de transactions par jour</h3><canvas id="countChart"></canvas></div>
      </div>
      <script>
        const token = localStorage.getItem('token');
        if (!token) window.location.href = '/api/auth/login';
        let volumeChart, countChart;
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
        loadDashboard();
      </script>
    </body>
    </html>
  `);
});

// POST transfert
router.post('/', verifyAdmin, async (req, res) => {
  try {
    const { expediteur, destinataire, montant, motif } = req.body;
    if (expediteur === destinataire) return res.status(400).json({ error: 'Même compte' });
    const clientExp = await Client.findById(expediteur);
    const clientDest = await Client.findById(destinataire);
    if (!clientExp ||!clientDest) return res.status(404).json({ error: 'Client introuvable' });
    if (clientExp.solde < montant) return res.status(400).json({ error: 'Solde insuffisant: ' + clientExp.solde + ' FCFA' });
    clientExp.solde -= Number(montant);
    clientDest.solde += Number(montant);
    await clientExp.save();
    await clientDest.save();
    const transaction = new Transaction({ expediteur, destinataire, montant, motif });
    await transaction.save();
    res.json({ message: 'Transfert de ' + montant + ' FCFA réussi', transaction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API data historique
router.get('/data', verifyAdmin, async (req, res) => {
  try {
    const { client, debut, fin } = req.query;
    let query = {};
    if (client) query = { $or: [{ expediteur: client }, { destinataire: client }] };
    if (debut || fin) {
      query.date = {};
      if (debut) query.date.$gte = new Date(debut);
      if (fin) query.date.$lte = new Date(fin + 'T23:59:59');
    }
    const transactions = await Transaction.find(query)
     .populate('expediteur', 'nom prenom')
     .populate('destinataire', 'nom prenom')
     .sort({ date: -1 });
    const volumeTotal = transactions.reduce((sum, t) => sum + t.montant, 0);
    res.json({ transactions, stats: { total: transactions.length, volumeTotal } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API Stats dashboard
router.get('/stats', verifyAdmin, async (req, res) => {
  try {
    const jours = parseInt(req.query.jours) || 30;
    const dateDebut = new Date();
    dateDebut.setDate(dateDebut.getDate() - jours);
    const transactions = await Transaction.find({ date: { $gte: dateDebut } });
    const totalTx = transactions.length;
    const volumeTotal = transactions.reduce((sum, t) => sum + t.montant, 0);
    const moyenne = totalTx > 0? volumeTotal / totalTx : 0;
    const clientsSet = new Set();
    transactions.forEach(t => {
      clientsSet.add(t.expediteur.toString());
      clientsSet.add(t.destinataire.toString());
    });
    const parJour = {};
    for (let i = 0; i < jours; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      parJour[key] = { date: key, volume: 0, count: 0 };
    }
    transactions.forEach(t => {
      const key = t.date.toISOString().split('T')[0];
      if (parJour[key]) {
        parJour[key].volume += t.montant;
        parJour[key].count += 1;
      }
    });
    const parJourArray = Object.values(parJour).reverse();
    res.json({ totalTx, volumeTotal, moyenne, clientsActifs: clientsSet.size, parJour: parJourArray });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
