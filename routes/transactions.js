const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Transaction = require('../models/Transaction');
const { verifyAdmin } = require('../middleware/auth');

// 1. ROUTES API JSON - EN PREMIER
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
     
    // Filtrer les transactions où le client a été supprimé
    const transactionsValides = transactions.filter(t => t.expediteur && t.destinataire);
     
    const volumeTotal = transactionsValides
      .filter(t => !t.annulee)
      .reduce((sum, t) => sum + t.montant, 0);
    
    res.json({ 
      transactions: transactionsValides, 
      stats: { total: transactionsValides.length, volumeTotal } 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', verifyAdmin, async (req, res) => {
  try {
    const jours = parseInt(req.query.jours) || 30;
    const dateDebut = new Date();
    dateDebut.setDate(dateDebut.getDate() - jours);
    
    const transactions = await Transaction.find({ 
      date: { $gte: dateDebut },
      annulee: { $ne: true }
    });
    
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

// 2. ROUTES HTML
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
       .badge-ok { color: #28a745
