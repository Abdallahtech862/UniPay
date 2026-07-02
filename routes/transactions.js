const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Transaction = require('../models/Transaction');
const { verifyAdmin, authUser } = require('../middleware/auth');

// ==================== ROUTES pour rechercher un contact pour des transferts B2B ====================
//rechercher des client par numero ou par pseudo pour faire un transfert
router.get('/search', authUser, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Recherche trop courte' });
    }
    
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
    .limit(50)
    .lean();

    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// rechercher un seul client pour un transfert par QRCode
router.get('/searchClient', authUser, async (req, res) => {
  try {
    const { pseudo, telephone } = req.query;
    
    const cleanPseudo = pseudo && pseudo !== 'undefined' ? pseudo.replace('@', '') : null;
    let cleanTel = telephone && telephone !== 'undefined' ? String(telephone) : null;
    
    if (!cleanPseudo && !cleanTel) {
      return res.status(400).json({ error: 'Pseudo ou téléphone requis' });
    }

    // ✅ Normalise le numéro : retire +226, 00226, espaces, tirets
    const normalizePhone = (num) => {
      if (!num) return null;
      return num.replace(/^\+?226|^00226|[\s-]/g, '');
    };

    const normalizedTel = normalizePhone(cleanTel);

    let query = {};
    if (cleanPseudo) {
      query.$or = [{ pseudo: new RegExp(`^${cleanPseudo}$`, 'i') }];
    }
    
    if (normalizedTel) {
      // Cherche avec ou sans +226 en BDD
      const telRegex = new RegExp(`^(\\+?226|00226)?${normalizedTel}$`);
      query.$or = query.$or || [];
      query.$or.push({ telephone: telRegex });
    }

    const user = await Client.findOne(query)
      .select('_id nom prenom pseudo telephone photoProfil')
      .lean();
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ==================== ROUTES des transfert unipay a mobil money ====================


// POST /api/transactions/withdraw/preview - Calcule les frais seulement
router.post('/withdraw/preview', authUser, async (req, res) => {
  try {
    const { montant, operateur, numero } = req.body;
    const userId = req.user.id;

    if (!montant || montant <= 0 ||!operateur ||!numero) {
      return res.status(400).json({ error: 'Données manquantes' });
    }

    const user = await Client.findById(userId);

    if (user.bloque) {
      return res.status(403).json({
        error: 'Compte suspendu. Impossible d’effectuer un retrait.'
      });
    }

    if (user.solde < montant) {
      return res.status(400).json({ error: 'Solde insuffisant' });
    }

    const FRAIS = {
      'MTN Money': 0.01,
      'Orange Money': 0.01,
      'Moov Money': 0.015,
      'SankMoney': 0.005,
      'Coris Money': 0.01,
      'Wave': 0.01,
      'XpresCash': 0.02,
      'Carte Visa': 0.025
    };

    const tauxFrais = FRAIS[operateur] || 0.01;
    const frais = Math.ceil(montant * tauxFrais);
    const total = montant + frais;

    if (user.solde < total) {
      return res.status(400).json({ error: `Solde insuffisant. Total avec frais: ${total} FCFA` });
    }

    // ✅ Ne crée rien, retourne juste les données
    res.json({
      montant,
      frais,
      total,
      operateur,
      numero,
      soldeRestant: user.solde - total
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/transactions/withdraw/confirm - Crée et débite après auth
router.post('/withdraw/confirm', authUser, async (req, res) => {
  console.log('User ID:', req.user.id); // ← Vérifie si tu reçois l'user
  console.log('Headers:', req.headers.authorization); // ← Vérifie le token
  try {
    // ... reste du code
  } catch (err) {
    console.error('Erreur confirm:', err);
    res.status(500).json({ error: err.message });
  }
});
// GET /api/transactions/pending - Admin voit les retraits/transferts en attente
router.get('/pending', authUser, async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès réservé aux admins' });
    }

    const transactions = await Transaction.find({ status: 'en_attente' })
      .populate({
        path: 'expediteur',
        select: 'nom prenom telephone solde bloque'
      })
      .populate({
        path: 'destinataire',
        select: 'nom prenom telephone'
      })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ total: transactions.length, transactions });

  } catch (err) {
    console.error('Erreur /pending:', err.message, err.stack);
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

// POST /api/transactions/:id/validate - Valider un retrait/transfert
router.post('/:id/validate', authUser, async (req, res) => { // ← authUser obligatoire
  try {
    // Check admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès réservé aux admins' });
    }

    const tx = await Transaction.findById(req.params.id)
      .populate('expediteur');

    if (!tx) {
      return res.status(404).json({ error: 'Transaction introuvable' });
    }

    if (tx.status !== 'en_attente') {
      return res.status(400).json({ error: 'Transaction déjà traitée' });
    }

    // Vérif solde encore suffisant
    const total = tx.montant + (tx.frais || 0);
    if (tx.expediteur.solde < total) {
      await Transaction.findByIdAndUpdate(req.params.id, { 
        status: 'annulee',
        motifAnnulation: 'Solde insuffisant au moment de la validation'
      });
      return res.status(400).json({ error: 'Solde insuffisant. Transaction annulée.' });
    }

    // Vérif client pas bloqué entre-temps
    if (tx.expediteur.bloque) {
      await Transaction.findByIdAndUpdate(req.params.id, { 
        status: 'annulee',
        motifAnnulation: 'Client suspendu'
      });
      return res.status(403).json({ error: 'Client suspendu. Transaction annulée.' });
    }

    const nouveauSolde = tx.expediteur.solde - total;

    await Promise.all([
      Transaction.findByIdAndUpdate(req.params.id, {
        status: 'validee',
        soldeExpediteurApres: nouveauSolde,
        dateValidation: new Date()
      }),
      Client.findByIdAndUpdate(tx.expediteur._id, { solde: nouveauSolde })
    ]);

    res.json({ 
      success: true, 
      message: 'Transaction validée',
      nouveauSolde
    });

  } catch (err) {
    console.error('Erreur /validate:', err);
    res.status(500).json({ error: err.message });
  }
});
// POST /api/transactions/:id/reject - Refuser une transaction
router.post('/:id/reject', authUser, async (req, res) => { // ← authUser ici aussi
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès réservé aux admins' });
    }

    const { motif } = req.body;

    const tx = await Transaction.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'annulee',
        motifAnnulation: motif || 'Refusé par admin',
        dateAnnulation: new Date()
      },
      { new: true }
    );

    if (!tx) return res.status(404).json({ error: 'Transaction introuvable' });

    res.json({ 
      success: true, 
      message: 'Transaction refusée',
      transaction: tx
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// le code pour voir les transactions en attent
router.get('/pending-view', async (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Transactions en attente</title>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial; padding: 20px; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background: #f59e0b; color: white; }
        button { padding: 8px 15px; margin: 2px; cursor: pointer; border: none; border-radius: 4px; }
        .validate { background: #10b981; color: white; }
        .reject { background: #ef4444; color: white; }
        .badge { padding: 3px 8px; border-radius: 12px; font-size: 12px; }
        .badge-wait { background: #f59e0b; color: white; }
        .error { color: #ef4444; padding: 20px; background: #fee; border-radius: 4px; }
      </style>
    </head>
    <body>
      <h2>Transactions en attente de validation</h2>
      <a href="/api/clients/admin">← Admin</a>
      <button onclick="loadPending()">Actualiser</button>
      <div id="content">Chargement...</div>

      <script>
        const token = localStorage.getItem('token');
        if (!token) window.location.href = '/api/auth/login';

        async function loadPending() {
          try {
            console.log('Chargement des transactions...');
            const res = await fetch('/api/transactions/pending', {
              headers: { 'Authorization': 'Bearer ' + token }
            });
            
            console.log('Status:', res.status);
            
            if (res.status === 401 || res.status === 403) {
              document.getElementById('content').innerHTML = 
                '<div class="error">Accès refusé. Connecte-toi en tant qu\\'admin.</div>';
              localStorage.removeItem('token');
              setTimeout(() => window.location.href = '/api/auth/login', 2000);
              return;
            }

            if (!res.ok) {
              throw new Error('Erreur serveur: ' + res.status);
            }
            
            const data = await res.json();
            console.log('Data reçue:', data);
            renderTable(data.transactions || []);
            
          } catch (err) {
            console.error('Erreur:', err);
            document.getElementById('content').innerHTML = 
              '<div class="error">Erreur: ' + err.message + '<br>Vérifie la console F12</div>';
          }
        }

        function renderTable(tx) {
          if (!tx || tx.length === 0) {
            document.getElementById('content').innerHTML = '<p>Aucune transaction en attente</p>';
            return;
          }

          let html = '<table><tr><th>Date</th><th>Type</th><th>Client</th><th>Montant</th><th>Frais</th><th>Destinataire</th><th>Actions</th></tr>';
          
          tx.forEach(t => {
            const date = new Date(t.createdAt).toLocaleString('fr-FR');
            const type = t.type === 'retrait' ? 'Retrait ' + (t.operateur || '') : 'Transfert';
            const client = t.expediteur ? (t.expediteur.prenom + ' ' + t.expediteur.nom + ' (' + t.expediteur.telephone + ')') : 'Inconnu';
            const dest = t.type === 'retrait' ? (t.numeroDestination || '-') : (t.destinataire ? t.destinataire.prenom + ' ' + t.destinataire.nom : '-');
            
            html += \`
              <tr id="row-\${t._id}">
                <td>\${date}</td>
                <td><span class="badge badge-wait">\${type}</span></td>
                <td>\${client}<br><small>Solde: \${t.expediteur?.solde?.toLocaleString() || 0} FCFA</small></td>
                <td><b>\${t.montant.toLocaleString()} FCFA</b></td>
                <td>\${(t.frais||0).toLocaleString()} FCFA</td>
                <td>\${dest}</td>
                <td>
                  <button class="validate" onclick="validateTx('\${t._id}')">Valider</button>
                  <button class="reject" onclick="rejectTx('\${t._id}')">Refuser</button>
                </td>
              </tr>
            \`;
          });
          
          html += '</table>';
          document.getElementById('content').innerHTML = html;
        }

        async function validateTx(id) {
          if (!confirm('Valider cette transaction ?')) return;
          const res = await fetch('/api/transactions/' + id + '/validate', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token }
          });
          const data = await res.json();
          alert(data.message || data.error);
          loadPending();
        }

        async function rejectTx(id) {
          const motif = prompt('Motif du refus:');
          if (!motif) return;
          const res = await fetch('/api/transactions/' + id + '/reject', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token 
            },
            body: JSON.stringify({ motif })
          });
          const data = await res.json();
          alert(data.message || data.error);
          loadPending();
        }

        loadPending();
      </script>
    </body>
    </html>
  `);
});

// ==================== ROUTES HTML pour voir toutes les transaction====================

// GET /api/transactions/data - Données pour le tableau avec recherche historique
router.get('/data', async (req, res) => {
  try {
    const { client, debut, fin, q, montantMin, montantMax } = req.query;
    let query = {};
    
    // Filtre par client depuis select
    if (client) {
      query = { $or: [{ expediteur: client }, { destinataire: client }] };
    }
    
    // Filtre par date - utilise createdAt, pas date
    if (debut || fin) {
      query.createdAt = {}; // ✅ createdAt au lieu de date
      if (debut) query.createdAt.$gte = new Date(debut);
      if (fin) query.createdAt.$lte = new Date(fin + 'T23:59:59');
    }
    
    // Filtre par montant
    if (montantMin || montantMax) {
      query.montant = {};
      if (montantMin) query.montant.$gte = Number(montantMin);
      if (montantMax) query.montant.$lte = Number(montantMax);
    }
    
    let transactions = await Transaction.find(query)
     .populate('expediteur', 'nom prenom telephone')
     .populate('destinataire', 'nom prenom telephone') // Ne crash pas si null
     .sort({ createdAt: -1 }) // ✅ createdAt au lieu de date
     .lean();
    
    // ❌ SUPPRIME CETTE LIGNE - elle vire les retraits
    // transactions = transactions.filter(t => t.expediteur && t.destinataire);
    
    // ✅ Garde seulement les tx où expediteur existe
    transactions = transactions.filter(t => t.expediteur);
    
    // Recherche texte : nom, téléphone, opérateur, numéro destination
    if (q && q.trim() !== '') {
      const search = q.toLowerCase();
      transactions = transactions.filter(t => {
        const expNom = `${t.expediteur?.prenom || ''} ${t.expediteur?.nom || ''}`.toLowerCase();
        const destNom = `${t.destinataire?.prenom || ''} ${t.destinataire?.nom || ''}`.toLowerCase();
        const expTel = t.expediteur?.telephone || '';
        const destTel = t.destinataire?.telephone || '';
        const operateur = t.operateur || '';
        const numDest = t.numeroDestination || '';
        
        return expNom.includes(search) || destNom.includes(search) || 
               expTel.includes(search) || destTel.includes(search) ||
               operateur.toLowerCase().includes(search) || // ✅ Cherche opérateur
               numDest.includes(search); // ✅ Cherche numéro retrait
      });
    }
    
    const volumeTotal = transactions
      .filter(t => t.status !== 'annulee') // ✅ utilise status au lieu de annulee
      .reduce((sum, t) => sum + t.montant, 0);
    
    res.json({ 
      transactions, 
      stats: { total: transactions.length, volumeTotal } 
    });
  } catch (error) {
    console.error('Erreur /data:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/transactions/stats - Stats dashboard
router.get('/stats',verifyAdmin, async (req, res) => {
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

// ==================== ROUTES HTML pour tableau de bor de ladministrateur====================

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
// GET /api/transactions/me - Historique du client connecté
router.get('/me', authUser, async (req, res) => {
  try {
    const user = await Client.findById(req.user.id).select('solde');
    const transactions = await Transaction.find({
      $or: [{ expediteur: req.user.id }, { destinataire: req.user.id }]
    })
    .populate('expediteur', 'nom prenom telephone photoProfil pseudo')
    .populate('destinataire', 'nom prenom telephone photoProfil pseudo')
    .sort({ createdAt: -1 })
    .lean();

    res.json({
      solde: user?.solde || 0,
      transactions: transactions.map(t => ({
        id: t._id,
        type: t.type || (t.expediteur._id.equals(req.user.id) ? 'envoi' : 'reception'), // ✅ Prend le type du schema
        montant: t.montant,
        frais: t.frais || 0,
        contact: t.expediteur._id.equals(req.user.id) ? t.destinataire : t.expediteur,
        operateur: t.operateur || null, // ✅ Ajouté
        numeroDestination: t.numeroDestination || null, // ✅ Ajouté
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
    tr.partielle { background: #fff3cd; }
   .montant { color: #28a745; font-weight: bold; }
   .solde-apres { color: #6c757d; font-size: 12px; }
   .filtres { margin: 15px 0; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    select, input, button { padding: 8px; }
   .actions button { margin: 5px; color: white; border: none; cursor: pointer; }
   .print { background: #6c757d; }.csv { background: #17a2b8; }.pdf { background: #dc3545; }
   .btn-annuler { background: #dc3545; padding: 5px 10px; border-radius: 3px; color: white; border: none; cursor: pointer; }
   .badge-ok { color: #28a745; font-weight: bold; }
   .badge-ko { color: #dc3545; font-weight: bold; }
   .badge-partiel { color: #f59e0b; font-weight: bold; }
    @media print {.filtres,.actions, a, .btn-annuler { display: none; } }
  </style>
</head>
<body>
  <h2>Historique des transactions</h2>
  <a href="/api/clients/admin">← Admin</a> | <a href="/api/transactions/add">Nouveau transfert</a> | <a href="/api/transactions/dashboard">Dashboard</a>| <a href="/api/transactions/pending-view">Transactions en attente</a>
  
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
      
      let html = '<table><tr><th>Date</th><th>Expéditeur</th><th>Tél Exp.</th><th>Solde Exp.</th><th>Destinataire</th><th>Tél Dest.</th><th>Solde Dest.</th><th>Montant</th><th>Motif</th><th>Statut</th><th>Action</th></tr>';
      
      transactions.forEach(t => {
        if (!t.expediteur || !t.destinataire) return;
        
        const date = new Date(t.createdAt).toLocaleString('fr-FR');
        const peutAnnuler = !t.annulee && t.status === 'validee';
        
        let statut = '<span class="badge-ok">VALIDÉE</span>';
        let rowClass = '';
        
        if (t.annulee) {
          statut = t.montantAnnule < t.montant ? '<span class="badge-partiel">ANNULÉE PARTIELLE</span>' : '<span class="badge-ko">ANNULÉE</span>';
          rowClass = t.montantAnnule < t.montant ? ' class="partielle"' : ' class="annulee"';
        }
        
        let bouton = '-';
        if (peutAnnuler) {
          bouton = '<button class="btn-annuler" onclick="annulerTx(\\'' + t._id + '\\')">Annuler</button>';
        }
        
        html += '<tr' + rowClass + '>';
        html += '<td>' + date + '</td>';
        html += '<td>' + t.expediteur.prenom + ' ' + t.expediteur.nom + '</td>';
        html += '<td>' + t.expediteur.telephone + '</td>';
        html += '<td class="solde-apres">' + (t.soldeExpediteurApres?.toLocaleString() || '0') + ' FCFA</td>';
        html += '<td>' + t.destinataire.prenom + ' ' + t.destinataire.nom + '</td>';
        html += '<td>' + t.destinataire.telephone + '</td>';
        html += '<td class="solde-apres">' + (t.soldeDestinataireApres?.toLocaleString() || '0') + ' FCFA</td>';
        html += '<td class="montant">' + t.montant.toLocaleString() + ' FCFA';
        if (t.annulee && t.montantAnnule < t.montant) {
          html += '<br><small>Annulé: ' + t.montantAnnule.toLocaleString() + ' FCFA</small>';
        }
        html += '</td>';
        html += '<td>' + (t.motif || '-') + '</td>';
        html += '<td>' + statut + '</td>';
        html += '<td>' + bouton + '</td>';
        html += '</tr>';
      });
      
      html += '</table>';
      document.getElementById('content').innerHTML = html;
    }
    
    async function annulerTx(id) {
      if (!confirm('Confirmer l\\'annulation ? Si le solde est insuffisant, le solde disponible sera annulé.')) return;
      const res = await fetch('/api/transactions/' + id + '/cancel', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();
      alert(data.message || data.error);
      loadTransactions();
    }
    
    function exportCSV() {
      if (!currentTransactions.length) { alert('Aucune donnée'); return; }
      let csv = 'Date,Expéditeur,Tél Exp,Solde Exp Après,Destinataire,Tél Dest,Solde Dest Après,Montant,Montant Annulé,Motif,Statut\\n';
      currentTransactions.forEach(t => {
        if (!t.expediteur || !t.destinataire) return;
        const date = new Date(t.createdAt).toLocaleString('fr-FR');
        let statut = 'Validée';
        if (t.annulee) statut = t.montantAnnule < t.montant ? 'Annulée partielle' : 'Annulée';
        csv += '"' + date + '","' + t.expediteur.prenom + ' ' + t.expediteur.nom + '","' + t.expediteur.telephone + '",' + (t.soldeExpediteurApres || 0) + ',"' + t.destinataire.prenom + ' ' + t.destinataire.nom + '","' + t.destinataire.telephone + '",' + (t.soldeDestinataireApres || 0) + ',' + t.montant + ',' + (t.montantAnnule || 0) + ',"' + (t.motif || '') + '","' + statut + '"\\n';
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
        new Date(t.createdAt).toLocaleString('fr-FR'),
        t.expediteur.prenom + ' ' + t.expediteur.nom,
        t.expediteur.telephone,
        (t.soldeExpediteurApres || 0).toLocaleString() + ' FCFA',
        t.destinataire.prenom + ' ' + t.destinataire.nom,
        t.destinataire.telephone,
        (t.soldeDestinataireApres || 0).toLocaleString() + ' FCFA',
        t.montant.toLocaleString() + ' FCFA',
        t.motif || '-',
        t.annulee ? (t.montantAnnule < t.montant ? 'Annulée partielle' : 'Annulée') : 'Validée'
      ]);
      doc.autoTable({
        head: [['Date', 'Expéditeur', 'Tél Exp', 'Solde Exp', 'Destinataire', 'Tél Dest', 'Solde Dest', 'Montant', 'Motif', 'Statut']],
        body: tableData,
        startY: 25,
        styles: { fontSize: 6 }
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

// ==================== ROUTES pour effectuer des transfert B2B avec lapplication====================


router.post('/', authUser, async (req, res) => {
  try {
    const { expediteur, destinataire, montant, motif } = req.body;
    
    if (req.user.id !== expediteur) {
      return res.status(403).json({ error: 'Tu ne peux transférer que depuis ton compte' });
    }

    const exp = await Client.findById(expediteur);
    const dest = await Client.findById(destinataire);

    if (!exp || !dest) return res.status(404).json({ error: 'Compte introuvable' });
    
    // ✅ Check si expéditeur bloqué
    if (exp.bloque) {
      return res.status(403).json({ error: 'Compte suspendu. Impossible d’effectuer un transfert.' });
    }

    // ✅ Check si destinataire bloqué aussi
    if (dest.bloque) {
      return res.status(403).json({ error: 'Le destinataire a un compte suspendu.' });
    }

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
      soldeExpediteurApres: nouveauSoldeExp,
      soldeDestinataireApres: nouveauSoldeDest
    });

    // Tu fais 2 fois la mise à jour, supprime le premier bloc
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
      nouveauSoldeDestinataire: updatedDest.solde,
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


// POST /api/transactions/:id/cancel
router.post('/:id/cancel', async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ error: 'Transaction introuvable' });
    if (tx.annulee) return res.status(400).json({ error: 'Déjà annulée' });
    if (tx.status !== 'validee') return res.status(400).json({ error: 'Transaction non validée' });

    const destinataire = await Client.findById(tx.destinataire);
    if (!destinataire) return res.status(404).json({ error: 'Destinataire introuvable' });

    // ✅ Si solde < montant, on annule tout le solde disponible
    const montantAAnnuler = Math.min(tx.montant, destinataire.solde);
    
    if (montantAAnnuler <= 0) {
      return res.status(400).json({ error: 'Solde du destinataire à 0, impossible d’annuler' });
    }

    // Débite le destinataire
    destinataire.solde -= montantAAnnuler;
    await destinataire.save();

    // Crédite l’expéditeur
    const expediteur = await Client.findById(tx.expediteur);
    expediteur.solde += montantAAnnuler;
    await expediteur.save();

    // Marque la transaction
    tx.annulee = true;
    tx.montantAnnule = montantAAnnuler; // ✅ Nouveau champ
    tx.dateAnnulation = new Date();
    await tx.save();

    const message = montantAAnnuler < tx.montant 
      ? `Annulation partielle: ${montantAAnnuler.toLocaleString()} FCFA remboursés sur ${tx.montant.toLocaleString()} FCFA`
      : `Transaction annulée intégralement`;

    res.json({ success: true, message, montantAnnule: montantAAnnuler });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
