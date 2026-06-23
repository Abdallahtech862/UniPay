const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Transaction = require('../models/Transaction');
const { verifyAdmin } = require('../middleware/auth');

// Page formulaire transfert - PUBLIQUE
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
      <a href="/api/clients/admin">← Admin</a> | <a href="/api/transactions">Historique</a><br><br>
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

// GET historique - Page HTML publique, data chargée via JS
// Page HTML Historique - PUBLIQUE
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
        .montant { color: #28a745; font-weight: bold; }
        .filtres { margin: 15px 0; }
        select, input, button { padding: 8px; margin-right: 10px; }
        .actions button { margin: 5px; background: #28a745; color: white; border: none; cursor: pointer; }
        .actions button.print { background: #6c757d; }
        .actions button.csv { background: #17a2b8; }
        .actions button.pdf { background: #dc3545; }
        @media print {
          .filtres, .actions, a { display: none; }
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <h2>Historique des transactions</h2>
      <a href="/api/clients/admin">← Admin</a> | <a href="/api/transactions/add">Nouveau transfert</a>
      
      <div class="filtres">
        <select id="filterClient">${optionsClients}</select>
        <input type="date" id="dateDebut">
        <input type="date" id="dateFin">
        <button onclick="loadTransactions()">Filtrer</button>
        <button onclick="resetFiltres()">Reset</button>
      </div>

      <div class="actions">
        <button class="print" onclick="window.print()">🖨️ Imprimer</button>
        <button class="csv" onclick="exportCSV()">📊 Export CSV</button>
        <button class="pdf" onclick="exportPDF()">📄 Export PDF</button>
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
          document.getElementById('stats').innerHTML = \`
            <p><b>Total transactions:</b> \${stats.total} | 
            <b>Volume total:</b> \${stats.volumeTotal.toLocaleString()} FCFA</p>
          \`;
        }

        function renderTable(transactions) {
          if (transactions.length === 0) {
            document.getElementById('content').innerHTML = 'Aucune transaction trouvée';
            return;
          }
          
          let html = '<table id="tableTransactions"><tr><th>Date</th><th>Expéditeur</th><th>Destinataire</th><th>Montant</th><th>Motif</th></tr>';
          transactions.forEach(t => {
            const date = new Date(t.date).toLocaleString('fr-FR');
            html += \`
              <tr>
                <td>\${date}</td>
                <td>\${t.expediteur.prenom} \${t.expediteur.nom}</td>
                <td>\${t.destinataire.prenom} \${t.destinataire.nom}</td>
                <td class="montant">\${t.montant.toLocaleString()} FCFA</td>
                <td>\${t.motif || '-'}</td>
              </tr>
            \`;
          });
          html += '</table>';
          document.getElementById('content').innerHTML = html;
        }

        function exportCSV() {
          if (currentTransactions.length === 0) {
            alert('Aucune donnée à exporter');
            return;
          }
          
          let csv = 'Date,Expéditeur,Destinataire,Montant,Motif\\n';
          currentTransactions.forEach(t => {
            const date = new Date(t.date).toLocaleString('fr-FR');
            const exp = \`\${t.expediteur.prenom} \${t.expediteur.nom}\`;
            const dest = \`\${t.destinataire.prenom} \${t.destinataire.nom}\`;
            csv += \`"\${date}","\${exp}","\${dest}",\${t.montant},"\${t.motif || ''}"\\n\`;
          });
          
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = 'transactions_unipay_' + new Date().toISOString().split('T')[0] + '.csv';
          link.click();
        }

        function exportPDF() {
          if (currentTransactions.length === 0) {
            alert('Aucune donnée à exporter');
            return;
          }
          
          const { jsPDF } = window.jspdf;
          const doc = new jsPDF();
          
          doc.setFontSize(18);
          doc.text('Historique Transactions UniPay', 14, 20);
          doc.setFontSize(10);
          doc.text('Généré le ' + new Date().toLocaleString('fr-FR'), 14, 28);
          
          const tableData = currentTransactions.map(t => [
            new Date(t.date).toLocaleString('fr-FR'),
            \`\${t.expediteur.prenom} \${t.expediteur.nom}\`,
            \`\${t.destinataire.prenom} \${t.destinataire.nom}\`,
            t.montant.toLocaleString() + ' FCFA',
            t.motif || '-'
          ]);
          
          doc.autoTable({
            head: [['Date', 'Expéditeur', 'Destinataire', 'Montant', 'Motif']],
            body: tableData,
            startY: 35,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [0, 123, 255] }
          });
          
          doc.save('transactions_unipay_' + new Date().toISOString().split('T')[0] + '.pdf');
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
// Route API JSON pour les data - PROTÉGÉE
router.get('/data', verifyAdmin, async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate('expediteur', 'nom prenom')
      .populate('destinataire', 'nom prenom')
      .sort({ date: -1 });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// POST faire un transfert - PROTÉGÉ
router.post('/', verifyAdmin, async (req, res) => {
  try {
    const { expediteur, destinataire, montant, motif } = req.body;
    if (expediteur === destinataire) return res.status(400).json({ error: 'Même compte' });
    
    const clientExp = await Client.findById(expediteur);
    const clientDest = await Client.findById(destinataire);
    
    if (!clientExp || !clientDest) return res.status(404).json({ error: 'Client introuvable' });
    if (clientExp.solde < montant) return res.status(400).json({ error: 'Solde insuffisant: ' + clientExp.solde + ' FCFA' });
    
    clientExp.solde -= Number(montant);
    clientDest.solde += Number(montant);
    await clientExp.save();
    await clientDest.save();
    
    const transaction = new Transaction({ expediteur, destinataire, montant, motif });
    await transaction.save();
    
    res.json({ message: \`Transfert de \${montant} FCFA réussi\`, transaction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET API data avec filtres - PROTÉGÉ
router.get('/data', verifyAdmin, async (req, res) => {
  try {
    const { client, debut, fin } = req.query;
    let query = {};
    
    if (client) {
      query = { $or: [{ expediteur: client }, { destinataire: client }] };
    }
    
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
    
    res.json({ 
      transactions, 
      stats: { total: transactions.length, volumeTotal } 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
