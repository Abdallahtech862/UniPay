const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Transaction = require('../models/Transaction');
const { verifyAdmin } = require('../middleware/auth');

// Page formulaire transfert - PUBLIQUE, JS vérifie le token
router.get('/add', async (req, res) => {
  const clients = await Client.find().select('nom prenom telephone');
  
  let options = '';
  clients.forEach(c => {
    options += `<option value="${c._id}">${c.prenom} ${c.nom} - ${c.telephone}</option>`;
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
      <a href="/api/clients/admin">← Retour Admin</a><br><br>
      
      <form id="transferForm">
        <label>Expéditeur:</label>
        <select name="expediteur" required>
          <option value="">Choisir...</option>
          ${options}
        </select>
        
        <label>Destinataire:</label>
        <select name="destinataire" required>
          <option value="">Choisir...</option>
          ${options}
        </select>
        
        <label>Montant (FCFA):</label>
        <input name="montant" type="number" min="1" required>
        
        <label>Motif:</label>
        <input name="motif" placeholder="Ex: Remboursement">
        
        <button type="submit">Envoyer</button>
      </form>
      
      <div id="msg"></div>

      <script>
        const token = localStorage.getItem('token');
        if (!token) {
          alert('Session expirée');
          window.location.href = '/api/auth/login';
        }
        
        transferForm.onsubmit = async e => {
          e.preventDefault();
          const formData = new FormData(e.target);
          const body = Object.fromEntries(formData);
          
          if (body.expediteur === body.destinataire) {
            msg.className = 'error';
            msg.innerText = 'Expéditeur et destinataire identiques';
            return;
          }
          
          const res = await fetch('/api/transactions', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token 
            },
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
          }
        };
      </script>
    </body>
    </html>
  `);
});

// POST faire un transfert - PROTÉGÉ
router.post('/', verifyAdmin, async (req, res) => {
  try {
    const { expediteur, destinataire, montant, motif } = req.body;
    
    if (expediteur === destinataire) {
      return res.status(400).json({ error: 'Même compte expéditeur/destinataire' });
    }
    
    const clientExp = await Client.findById(expediteur);
    const clientDest = await Client.findById(destinataire);
    
    if (!clientExp || !clientDest) {
      return res.status(404).json({ error: 'Client introuvable' });
    }
    
    if (clientExp.solde < montant) {
      return res.status(400).json({ error: 'Solde insuffisant. Solde actuel: ' + clientExp.solde + ' FCFA' });
    }
    
    // Transaction atomique
    clientExp.solde -= Number(montant);
    clientDest.solde += Number(montant);
    
    await clientExp.save();
    await clientDest.save();
    
    const transaction = new Transaction({ expediteur, destinataire, montant, motif });
    await transaction.save();
    
    res.json({ 
      message: `Transfert de ${montant} FCFA réussi`,
      transaction 
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET historique - PROTÉGÉ
router.get('/',  async (req, res) => {
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

module.exports = router;
