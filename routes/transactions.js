const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Transaction = require('../models/Transaction');
const { verifyAdmin, authUser } = require('../middleware/auth');
const { sendPushNotification } = require('../utils/sendPushNotification');
const { io, onlineUsers } = require('../server'); // METS LE EN HAUT DU FICHIER, pas dans la route

const mongoose = require('mongoose');



// ==================== ROUTES pour rechercher un contact pour des transferts B2B ====================
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


// rechercher un seul client pour un transfert par QRCode
router.get('/search', authUser, async (req, res) => {
  try {
    const { q, pseudo, telephone, email } = req.query;
    
    // q = recherche générale, ou tu peux toujours utiliser pseudo/telephone/email
    const queryRaw = (q || pseudo || telephone || email || '').toString().trim();
    
    if (!queryRaw) {
      return res.status(400).json({ error: 'Query vide' });
    }

    // Nettoie le query
    const cleanQuery = queryRaw.replace('@', '').trim();
    
    // Pour téléphone: garde que les chiffres pour la recherche floue
    const onlyDigits = cleanQuery.replace(/\D/g, '');
    const isPhoneSearch = onlyDigits.length >= 4;

    let orConditions = [
      { pseudo: { $regex: cleanQuery, $options: 'i' } }, // ressemble à
      { nom: { $regex: cleanQuery, $options: 'i' } },
      { prenom: { $regex: cleanQuery, $options: 'i' } },
      { email: { $regex: cleanQuery, $options: 'i' } },
    ];

    if (isPhoneSearch) {
      orConditions.push({ telephone: { $regex: onlyDigits, $options: 'i' } });
    }

    const users = await Client.find({
      $or: orConditions,
      isAdmin: { $ne: true },
      role: { $ne: 'admin' },
      telephone: { $nin: ['7000000000'] }
    })
    .select('_id nom prenom pseudo telephone email photoProfil')
    .limit(20) // limite à 20 résultats
    .lean();

    // Filtre final anti-admin en JS au cas où
    const filtered = users.filter(u => !u.isAdmin && u.role !== 'admin');

    res.json({ users: filtered, count: filtered.length });

  } catch (err) {
    console.error('searchClient error', err);
    res.status(500).json({ error: err.message });
  }
});
// ==================== ROUTES des transfert unipay a mobil money ====================


// POST /api/transactions/withdraw/preview - Calcule les frais seulement
router.post('/withdraw/preview', authUser, async (req, res) => {
  try {
    const { montant, operateur, numero } = req.body;
    if (!montant || montant <= 0 ||!operateur ||!numero) {
      return res.status(400).json({ error: 'Données manquantes' });
    }

    const user = await Client.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (user.bloque) return res.status(403).json({ error: 'Compte suspendu.' });

    let frais = 0;
    if (operateur === 'Carte Visa') {
      frais = montant <= 71428? 1150 : Math.ceil(montant * 0.0161);
    }

    const total = montant + frais;
    if (user.solde < total) {
      return res.status(400).json({ error: `Solde insuffisant. Il te faut ${total} F` });
    }

    res.json({ montant, frais, total, operateur, numero, soldeRestant: user.solde - total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/transactions/withdraw/confirm - Crée et débite après auth

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
const OPERATEURS = [
  'Telecel Money','Orange Money','Moov Money','SankMoney',
  'Coris Money','Wave','XpresCash','Carte Visa'
];

router.post('/withdraw/confirm', authUser, async (req, res) => {
  try {
    let { montant, operateur, numero } = req.body;
    montant = Number(montant);
    
    console.log('FRONT ENVOIE:', { montant, operateur, numero });

    if (!OPERATEURS.includes(operateur?.trim())) {
      return res.status(400).json({ error: `Opérateur invalide: ${operateur}` });
    }

    const user = await Client.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (user.bloque) return res.status(403).json({ error: 'Compte suspendu.' });

    //const OPERATEURS_FRONT = ['CARTE', 'Carte Visa', 'CARTE VISA', 'VISA', 'visa'];
    let frais = 0;
    if (operateur === 'Carte Visa') {
      frais = montant <= 71428? 1150 : Math.ceil(montant * 0.0161);
    }
   

    const total = montant + frais;

    if (user.solde < total) {
      return res.status(400).json({ error: `Solde insuffisant. Il faut ${total}F dont ${frais}F frais` });
    }

    const nouveauSolde = user.solde - total;

    await Client.findByIdAndUpdate(user.id, { solde: nouveauSolde });

    const tx = await Transaction.create({
      expediteur: user.id,
      type: 'retrait',
      montant,
      frais,
      operateur,// operateur.trim(),
      numeroDestination: numero,
      status: 'en_attente',
      soldeExpediteurAvant: user.solde,
      soldeExpediteurApres: nouveauSolde,
      motif: `Retrait ${operateur}`
    });

    res.json({ success: true, transactionId: tx._id, montant, frais, total, nouveauSolde });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
// POST /api/transactions/:id/validate - Valider un retrait vers Mobile Money
router.post('/:id/validate', authUser, async (req, res) => {
  try {
    if (!req.user || req.user.role!== 'admin') {
      return res.status(403).json({ error: 'Accès réservé aux admins' });
    }

    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ error: 'Transaction introuvable' });
    if (tx.status!== 'en_attente') return res.status(400).json({ error: 'Transaction déjà traitée' });

    const COMPTE_PRINCIPAL_TEL = '+22670879425';
    const COMPTE_FRAIS_TEL = '+22670000000';

    const comptePrincipal = await Client.findOne({ telephone: COMPTE_PRINCIPAL_TEL });
    const compteFrais = await Client.findOne({ telephone: COMPTE_FRAIS_TEL });
    if (!comptePrincipal ||!compteFrais) {
      return res.status(404).json({ error: 'Compte principal ou frais introuvable' });
    }

    await Promise.all([
      Transaction.findByIdAndUpdate(req.params.id, {
        status: 'validee',
        dateValidation: new Date(),
        compteDestination: COMPTE_PRINCIPAL_TEL,
        compteFrais: COMPTE_FRAIS_TEL
      }),
      Client.findByIdAndUpdate(comptePrincipal._id, { $inc: { solde: tx.montant } }),
      Client.findByIdAndUpdate(compteFrais._id, { $inc: { solde: tx.frais } })
    ]);

    res.json({
      success: true,
      message: `Validé: ${tx.montant}F -> ${COMPTE_PRINCIPAL_TEL} | ${tx.frais}F -> ${COMPTE_FRAIS_TEL}`
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// POST /api/transactions/:id/reject - Refuser une transaction
router.post('/:id/reject', authUser, async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès réservé aux admins' });
    }

    const { motif } = req.body;
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ error: 'Transaction introuvable' });
    if (tx.status !== 'en_attente') return res.status(400).json({ error: 'Transaction déjà traitée' });

    const montant = Number(tx.montant);
    const frais = Number(tx.frais) || 0;
    const total = montant + frais;
    
    const user = await Client.findById(tx.expediteur);
    if (!user) return res.status(404).json({ error: 'Client introuvable' });

    const soldeAvantRemboursement = Number(user.solde);
    const soldeApresRemboursement = soldeAvantRemboursement + total;

    await Promise.all([
      Transaction.findByIdAndUpdate(req.params.id, {
        status: 'annulee',
        motifAnnulation: motif || 'Refusé par admin',
        dateAnnulation: new Date(),
        soldeExpediteurAvant: soldeAvantRemboursement,
        soldeExpediteurApres: soldeApresRemboursement,
      }),
      Client.findByIdAndUpdate(tx.expediteur, { $inc: { solde: total } })
    ]);

    res.json({ 
      success: true, 
      message: `Transaction annulée, ${total}F remboursés`,
      soldeAvant: soldeAvantRemboursement,
      soldeApres: soldeApresRemboursement
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
// le code pour voir les transactions en attent
router.get('/pending-vieww', async (req, res) => {
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
// UNIQUEMENT RETRAITS EN ATTENTE
router.get('/pending-view', async (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Retraits en attente - UniPay</title>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial; padding: 20px; background:#f8f9fa; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; background:white; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.05); }
        th, td { border: 1px solid #eee; padding: 10px; text-align: left; font-size:13px; }
        th { background: #f59e0b; color: white; }
        button { padding: 8px 15px; margin: 2px; cursor: pointer; border: none; border-radius: 4px; font-weight:bold; }
        .validate { background: #10b981; color: white; }
        .reject { background: #ef4444; color: white; }
        .badge { padding: 3px 8px; border-radius: 12px; font-size: 11px; color:white; }
        .badge-wait { background: #f59e0b; }
        .small{font-size:11px;color:#6c757d}
        .card{background:white;padding:15px;border-radius:10px;margin-bottom:15px}
        .error { color: #ef4444; padding: 20px; background: #fee; border-radius: 4px; }
      </style>
    </head>
    <body>
      <h2>💸 Retraits en attente de validation</h2>
      <div class="card">
        <a href="/api/clients/admin">← Admin</a> | 
        <a href="/api/transactions">Historique complet</a> | 
        <button onclick="loadPending()" style="width:auto">🔄 Actualiser</button>
        <span id="count" style="float:right;font-weight:bold"></span>
      </div>
      <div id="content">Chargement...</div>

      <script>
        const token = localStorage.getItem('token');
        if (!token) window.location.href = '/api/auth/login';

        async function loadPending() {
          try {
            const res = await fetch('/api/transactions/pending?type=retrait', {
              headers: { 'Authorization': 'Bearer ' + token }
            });
            if (res.status === 401 || res.status === 403) {
              document.getElementById('content').innerHTML = '<div class="error">Accès refusé. Connecte-toi en tant qu admin.</div>';
              return;
            }
            if (!res.ok) throw new Error('Erreur serveur: ' + res.status);
            const data = await res.json();
            let list = data.transactions || data || [];
            // Filtre sécurité côté front: que retraits en attente
            list = list.filter(t => t.type==='retrait' && (t.status==='en_attente' || t.status==='pending'));
            renderTable(list);
          } catch (err) {
            document.getElementById('content').innerHTML = '<div class="error">Erreur: ' + err.message + '</div>';
          }
        }

        function renderTable(tx) {
          document.getElementById('count').innerText = tx.length + ' retraits en attente';
          if (!tx || tx.length === 0) {
            document.getElementById('content').innerHTML = '<div class="card">✅ Aucun retrait en attente</div>';
            return;
          }
          let html = '<table><tr><th>Date</th><th>Client</th><th>Montant / Frais</th><th>Destination</th><th>Solde</th><th>Actions</th></tr>';
          tx.forEach(t => {
            const date = new Date(t.createdAt).toLocaleString('fr-FR');
            const client = t.expediteur ? (t.expediteur.prenom + ' ' + t.expediteur.nom + '<br><span class="small">' + t.expediteur.telephone + '</span>') : 'Inconnu';
            const totalADebiter = (t.montant||0) + (t.frais||0);
            html += '<tr id="row-'+t._id+'">'+
              '<td><span class="small">'+date+'</span><br><span class="badge badge-wait">RETRAIT</span></td>'+
              '<td>'+client+'</td>'+
              '<td><b>'+(t.montant||0).toLocaleString()+' F</b><br><span class="small" style="color:#dc3545">Frais: '+(t.frais||0)+' F</span><br><span class="small"><b>Total débit: '+totalADebiter.toLocaleString()+' F</b></span><br><span class="small">'+(t.motif||'')+'</span></td>'+
              '<td><b>'+(t.numeroDestination||'-')+'</b><br><span class="small">'+(t.operateur||'Orange Money')+'</span><br><span class="small">Compte: '+(t.compteDestination||'-')+'</span></td>'+
              '<td><span class="small">Avant: '+(t.soldeExpediteurAvant||0).toLocaleString()+' F</span><br><span class="small">Après: '+(t.soldeExpediteurApres||0).toLocaleString()+' F</span></td>'+
              '<td><button class="validate" onclick="validateTx(\\''+t._id+'\\')">✅ Valider</button><br><button class="reject" onclick="rejectTx(\\''+t._id+'\\')">❌ Refuser</button></td>'+
              '</tr>';
          });
          html += '</table>';
          document.getElementById('content').innerHTML = html;
        }

        async function validateTx(id) {
          if (!confirm('Valider ce retrait ? L argent sera envoyé.')) return;
          const res = await fetch('/api/transactions/' + id + '/validate', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
          const data = await res.json();
          alert(data.message || data.error || 'Validé');
          loadPending();
        }

        async function rejectTx(id) {
          const motif = prompt('Motif du refus:');
          if (!motif) return;
          const res = await fetch('/api/transactions/' + id + '/reject', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ motif })
          });
          const data = await res.json();
          alert(data.message || data.error || 'Refusé');
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
router.get('/data', authUser, async (req, res) => {
  try {
    const { client, debut, fin, q, numero, montant } = req.query;
    let query = {};

    // filtre client
    if (client) {
      query.$or = [{ expediteur: client }, { destinataire: client }];
    }

    if (debut || fin) {
      query.createdAt = {};
      if (debut) query.createdAt.$gte = new Date(debut);
      if (fin) query.createdAt.$lte = new Date(fin + 'T23:59:59');
    }

    if (montant) {
      query.montant = Number(montant);
    }

    if (numero) {
      // si on cherche par numéro, on écrase pas le filtre client
      const numQuery = {
        $or: [
          { numeroDestination: { $regex: numero, $options: 'i' } },
          { numeroSource: { $regex: numero, $options: 'i' } },
          { operateur: { $regex: numero, $options: 'i' } }
        ]
      };
      query = Object.keys(query).length ? { $and: [query, numQuery] } : numQuery;
    }

    let transactions = await Transaction.find(query)
      .populate('expediteur', 'nom prenom telephone')
      .populate('destinataire', 'nom prenom telephone')
      .sort({ createdAt: -1 })
      .lean();

    transactions = transactions.filter(t => t.expediteur);

    if (q && q.trim() !== '') {
      const search = q.toLowerCase();
      transactions = transactions.filter(t => {
        const exp = `${t.expediteur?.prenom || ''} ${t.expediteur?.nom || ''} ${t.expediteur?.telephone || ''}`.toLowerCase();
        const dest = `${t.destinataire?.prenom || ''} ${t.destinataire?.nom || ''} ${t.destinataire?.telephone || ''}`.toLowerCase();
        return exp.includes(search) || dest.includes(search) ||
          (t.operateur || '').toLowerCase().includes(search) ||
          (t.numeroDestination || '').includes(search) ||
          (t.numeroSource || '').includes(search);
      });
    }

    const stats = {
      total: transactions.length,
      volumeTotal: transactions.reduce((s, t) => s + (t.montant || 0), 0),
      totalRetraits: transactions.filter(t => t.type === 'retrait').length,
      totalRecharges: transactions.filter(t => t.type === 'recharge').length,
      totalTransferts: transactions.filter(t => t.type === 'envoi').length
    };

    res.json({ transactions, stats });

  } catch (err) {
    console.error('Erreur /data:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== ROUTES HTML pour tableau de bor de ladministrateur====================

// GET /api/transactions/top-clients - Top expéditeurs/destinataires
router.get('/top-clientss', verifyAdmin, async (req, res) => {
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
// GET /api/transactions/stats - Stats dashboard CORRIGÉ
router.get('/stats', authUser, async (req, res) => {
  try {
    const jours = parseInt(req.query.jours) || 30;
    const dateDebut = new Date();
    dateDebut.setDate(dateDebut.getDate() - jours);

    // ✅ Utilise createdAt et status, pas date et annulee
    const transactions = await Transaction.find({
      createdAt: { $gte: dateDebut },
      status: { $in: ['validee', 'reussie'] }
    }).lean();

    const totalTx = transactions.length;
    const volumeTotal = transactions.reduce((sum, t) => sum + (t.montant || 0), 0);
    const moyenne = totalTx > 0? volumeTotal / totalTx : 0;

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
      const key = new Date(t.createdAt).toISOString().split('T')[0]; // ✅ createdAt
      if (parJour[key]) {
        parJour[key].volume += t.montant || 0;
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
    console.error('stats error', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/transactions/top-clients - Top expéditeurs / destinataires CORRIGÉ
router.get('/top-clients', authUser, async (req, res) => {
  try {
    const jours = parseInt(req.query.jours) || 30;
    const limit = parseInt(req.query.limit) || 10;
    const dateDebut = new Date();
    dateDebut.setDate(dateDebut.getDate() - jours);

    const txs = await Transaction.find({
      createdAt: { $gte: dateDebut },
      status: { $in: ['validee', 'reussie'] }
    }).populate('expediteur destinataire', 'nom prenom telephone').lean();

    const mapExp = {};
    const mapDest = {};

    txs.forEach(t => {
      if (t.expediteur && t.expediteur._id) {
        const id = t.expediteur._id.toString();
        if (!mapExp[id]) mapExp[id] = { _id: id, nom: `${t.expediteur.prenom} ${t.expediteur.nom}`, telephone: t.expediteur.telephone, volume: 0, nbTx: 0 };
        mapExp[id].volume += t.montant || 0;
        mapExp[id].nbTx += 1;
      }
      // Pour les retraits/recharges, il n'y a pas de destinataire -> on ne les compte pas en top destinataires
      if (t.destinataire && t.destinataire._id) {
        const id = t.destinataire._id.toString();
        if (!mapDest[id]) mapDest[id] = { _id: id, nom: `${t.destinataire.prenom} ${t.destinataire.nom}`, telephone: t.destinataire.telephone, volume: 0, nbTx: 0 };
        mapDest[id].volume += t.montant || 0;
        mapDest[id].nbTx += 1;
      }
    });

    const topExpediteurs = Object.values(mapExp).sort((a,b) => b.volume - a.volume).slice(0, limit);
    const topDestinataires = Object.values(mapDest).sort((a,b) => b.volume - a.volume).slice(0, limit);

    res.json({ topExpediteurs, topDestinataires });

  } catch (err) {
    console.error('top-clients error', err);
    res.status(500).json({ error: err.message });
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


router.get('/me', authUser, async (req, res) => {
  try {
    const userIdStr = req.user.id.toString();
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
      transactions: transactions.map(t => {
        const expId = t.expediteur?._id?.toString() || t.expediteur?.toString();
        const destId = t.destinataire?._id?.toString() || t.destinataire?.toString();
        const estExpediteur = expId === userIdStr;

        return {
          id: t._id,
          _id: t._id,
          type: t.type, // GARDE LE VRAI TYPE, pas de fallback
          montant: t.montant,
          montantNet: t.montantNet,
          montantNetRecu: t.montantNetRecu,
          frais: t.frais || 0,
          // IMPORTANT: renvoie les deux pour le frontend
          expediteur: t.expediteur,
          destinataire: t.destinataire,
          expediteurNom: t.expediteurNom,
          destinataireNom: t.destinataireNom,
          contact: estExpediteur ? (t.destinataire || null) : (t.expediteur || null),
          operateur: t.operateur || null,
          numeroSource: t.numeroSource || null,
          numeroDestination: t.numeroDestination || null,
          motif: t.motif || '',
          commandeId: t.commandeId || null,
          produitId: t.produitId || null,
          status: t.status,
          soldeExpediteurApres: t.soldeExpediteurApres ?? 0,
          soldeDestinataireApres: t.soldeDestinataireApres ?? 0,
          date: t.createdAt,
          createdAt: t.createdAt
        };
      })
    });
  } catch (err) {
    console.error('Erreur /api/transactions/me:', err);
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
  <title>Historique Transactions - UniPay</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    *{box-sizing:border-box} body{font-family:Inter,Arial;padding:20px;background:#f8f9fa;color:#212529}
    h2{margin:0 0 10px} a{color:#007bff;text-decoration:none}
    .card{background:white;padding:15px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.05);margin-bottom:15px}
    .filtres{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
    select,input,button{padding:10px;border-radius:8px;border:1px solid #ddd;width:100%}
    button{cursor:pointer;font-weight:bold}
    .btn-primary{background:#007bff;color:white;border:none}
    .btn-dark{background:#343a40;color:white}.btn-info{background:#17a2b8;color:white}.btn-danger{background:#dc3545;color:white}
    table{border-collapse:collapse;width:100%;background:white;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.05)}
    th{background:#1a233a;color:white;padding:12px 8px;text-align:left;font-size:12px;text-transform:uppercase}
    td{padding:10px 8px;font-size:13px;border-bottom:1px solid #eee;vertical-align:top}
    tr:hover{background:#f1f5ff}
    .badge{padding:3px 8px;border-radius:20px;font-size:11px;font-weight:bold;color:white;display:inline-block}
    .ok{background:#28a745}.ko{background:#dc3545}.wait{background:#fd7e14}.annul{background:#6c757d}
    .type{font-weight:bold;text-transform:uppercase;font-size:11px}
    .small{font-size:11px;color:#6c757d}.montant{font-weight:bold;color:#111}
    .grid-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin:15px 0}
    .stat{background:white;padding:15px;border-radius:10px;border-left:4px solid #007bff}
    .stat b{font-size:20px;display:block}
    @media print{.no-print{display:none}}
  </style>
</head>
<body>
  <div class="no-print">
    <h2>📊 Historique Transactions UniPay</h2>
    <p><a href="/api/clients/admin">← Admin</a> | <a href="/api/transactions/dashboard">Dashboard</a>| <a href="/api/transactions/pending-view">Transactions en attente</a>
  </p>
    <div class="card">
      <div class="filtres">
        <select id="filterClient">${optionsClients}</select>
        <select id="filterType"><option value="">Tous types</option><option value="recharge">Recharge</option><option value="envoi">Envoi</option><option value="retrait">Retrait</option><option value="vente">Vente</option><option value="achat">Achat</option></select>
        <select id="filterStatus"><option value="">Tous statuts</option><option value="validee">Validée / Réussie</option><option value="echouee">Échouée</option><option value="annulee">Annulée</option><option value="en_attente">En attente</option></select>
        <input type="text" id="filterNumero" placeholder="N° tel / opérateur">
        <input type="number" id="filterMontant" placeholder="Montant exact">
        <input type="date" id="dateDebut"><input type="date" id="dateFin">
        <button class="btn-primary" onclick="loadTransactions()">🔍 Filtrer</button>
        <button class="btn-dark" onclick="resetFiltres()">Reset</button>
      </div>
    </div>
    <div class="card no-print" style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn-dark" onclick="window.print()">🖨 Imprimer</button>
      <button class="btn-info" onclick="exportCSV()">📄 Export CSV Complet</button>
      <button class="btn-danger" onclick="exportPDF()">📕 Export PDF</button>
      <span id="count" style="margin-left:auto;padding-top:8px;font-weight:bold"></span>
    </div>
  </div>
  <div id="stats"></div>
  <div id="content">Chargement...</div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js"></script>
  <script>
    const token = localStorage.getItem('token');
    if (!token) window.location.href = '/api/auth/login';
    let currentTransactions = [];
    async function loadTransactions(){
      try{
        const p = new URLSearchParams();
        const client = document.getElementById('filterClient').value;
        const type = document.getElementById('filterType').value;
        const status = document.getElementById('filterStatus').value;
        const numero = document.getElementById('filterNumero').value;
        const montant = document.getElementById('filterMontant').value;
        const debut = document.getElementById('dateDebut').value;
        const fin = document.getElementById('dateFin').value;
        if(client) p.append('client', client);
        if(type) p.append('type', type);
        if(status) p.append('status', status);
        if(numero) p.append('numero', numero);
        if(montant) p.append('montant', montant);
        if(debut) p.append('debut', debut);
        if(fin) p.append('fin', fin);
        const res = await fetch('/api/transactions/data?'+p.toString(), { headers:{'Authorization':'Bearer '+token}});
        if(res.status===401||res.status===403){ localStorage.removeItem('token'); window.location.href='/api/auth/login'; return; }
        const data = await res.json();
        currentTransactions = data.transactions || [];
        let filtered = currentTransactions;
        if(type) filtered = filtered.filter(t=> (t.type||'').toLowerCase()===type);
        if(status){ filtered = filtered.filter(t=> { if(status==='validee') return t.status==='validee' || t.status==='reussie'; return t.status===status; }); }
        currentTransactions = filtered;
        renderStats(data.stats, filtered);
        renderTable(filtered);
        document.getElementById('count').innerText = filtered.length + ' transactions';
      }catch(e){ document.getElementById('content').innerHTML='Erreur: '+e.message; }
    }
    function renderStats(globalStats, list){
      const ok = list.filter(t=> t.status==='validee'||t.status==='reussie');
      const volumeOk = ok.reduce((s,t)=> s+(t.montant||0),0);
      const fraisTotal = ok.reduce((s,t)=> s+(t.frais||0)+(t.fraisExpediteur||0)+(t.fraisDestinataire||0),0);
      const echecs = list.filter(t=> t.status==='echouee').length;
      const annules = list.filter(t=> t.status==='annulee' || t.annulee).length;
      document.getElementById('stats').innerHTML = '<div class="grid-stats">'+
        '<div class="stat" style="border-color:#007bff"><span class="small">TOTAL AFFICHÉ</span><b>'+list.length+'</b><span class="small">sur '+(globalStats?.total||0)+' total</span></div>'+
        '<div class="stat" style="border-color:#28a745"><span class="small">VOLUME VALIDÉ</span><b>'+volumeOk.toLocaleString()+' F</b></div>'+
        '<div class="stat" style="border-color:#e83e8c"><span class="small">FRAIS COLLECTÉS</span><b>'+fraisTotal.toLocaleString()+' F</b></div>'+
        '<div class="stat" style="border-color:#dc3545"><span class="small">ÉCHOUÉES</span><b>'+echecs+'</b></div>'+
        '<div class="stat" style="border-color:#6c757d"><span class="small">ANNULÉES</span><b>'+annules+'</b></div></div>';
    }
    function renderTable(transactions){
      if(!transactions.length){ document.getElementById('content').innerHTML='<div class="card">Aucune transaction</div>'; return; }
      let html = '<table><tr><th>Date</th><th>Type / Op</th><th>Expéditeur</th><th>Destinataire / N°</th><th>Montant</th><th>FRAIS DETAIL</th><th>Statut</th><th class="no-print">Action</th></tr>';
      transactions.forEach(t=>{
        if(!t.expediteur) return;
        const date = t.createdAt ? new Date(t.createdAt).toLocaleString('fr-FR') : '-';
        const type = t.type || 'transfert';
        let dest = '-';
        if(t.type==='retrait') dest = '<b>'+(t.numeroDestination||'-')+'</b><br><span class="small">'+(t.operateur||'')+'</span>';
        else if(t.type==='recharge') dest = '<b>'+(t.numeroSource||'-')+'</b><br><span class="small">'+(t.operateur||'')+'</span> '+(t.credited?'<span class="badge ok">Crédité</span>':'');
        else if(t.destinataire) dest = t.destinataire.prenom+' '+t.destinataire.nom+'<br><span class="small">'+t.destinataire.telephone+'</span>';
        else dest = t.numeroDestination || t.numeroSource || '-';
        let badgeStatut = '';
        if(t.status==='validee' || t.status==='reussie') badgeStatut = '<span class="badge ok">VALIDÉE</span>';
        else if(t.status==='echouee') badgeStatut = '<span class="badge ko">ÉCHOUÉE</span>';
        else if(t.status==='annulee' || t.annulee) badgeStatut = '<span class="badge annul">ANNULÉE</span>';
        else badgeStatut = '<span class="badge wait">'+(t.status||'').toUpperCase()+'</span>';
        if(t.motifAnnulation) badgeStatut += '<br><span class="small" style="color:#dc3545">'+t.motifAnnulation+'</span>';
        const fraisTotal = t.frais || 0;
        const fraisExp = t.fraisExpediteur || 0;
        const fraisDest = t.fraisDestinataire || 0;
        const fraisAdmin = t.fraisReversesAdmin || 0;
        const fraisNet = t.montantNet || t.montantNetRecu || '-';
        let htmlFrais = '<b style="color:#dc3545">'+fraisTotal+' F</b><br><span class="small">Net: '+fraisNet+' F</span><br>';
        if(fraisExp || fraisDest) htmlFrais += '<span class="small">Exp:'+fraisExp+' / Dest:'+fraisDest+'</span><br>';
        if(fraisAdmin) htmlFrais += '<span class="small">Admin:'+fraisAdmin+' F</span>';
        const peutAnnuler = (t.type==='envoi' || t.type==='vente') && (t.status==='validee' || t.status==='reussie') && !t.annulee;
        const actionBtn = peutAnnuler ? '<button class="btn-danger" style="padding:5px 10px;font-size:11px" onclick="annulerTx(\\''+t._id+'\\', \\''+type+'\\')">Annuler '+type+'<br><span style="font-size:9px">'+(t.montant||0)+' F</span></button>' : (t.annulee ? '<span class="small">Annulée</span>' : '-');
        html += '<tr><td><span class="small">'+date+'</span><br><span class="small">'+t._id.slice(-6)+'</span></td><td><span class="type">'+type+'</span><br><span class="small">'+(t.operateur||'')+'</span></td><td>'+t.expediteur.prenom+' '+t.expediteur.nom+'<br><span class="small">'+t.expediteur.telephone+'</span><br><span class="small">Après: '+(t.soldeExpediteurApres||0).toLocaleString()+' F</span></td><td>'+dest+'</td><td class="montant">'+(t.montant||0).toLocaleString()+' F</td><td>'+htmlFrais+'</td><td>'+badgeStatut+'</td><td class="no-print">'+actionBtn+'</td></tr>';
      });
      html+='</table>';
      document.getElementById('content').innerHTML=html;
    }
    function exportCSV(){
      if(!currentTransactions.length) return alert('Aucune donnée');
      const headers = ['_id','createdAt','date','type','montant','montantNet','montantNetRecu','frais','fraisExpediteur','fraisDestinataire','fraisReversesAdmin','montantAnnule','status','annulee','credited','expediteur_id','expediteur_nom','expediteur_prenom','expediteur_telephone','soldeExpediteurApres','destinataire_id','destinataire_nom','destinataire_prenom','destinataire_telephone','soldeDestinataireApres','numeroSource','numeroDestination','operateur','depositId','motif','motifAnnulation','commandeId','produitId','compteDestination','compteFrais'];
      let csv = headers.join(';')+'\\n';
      currentTransactions.forEach(t=>{
        const row = [t._id||'',t.createdAt||'',t.date||'',t.type||'',t.montant||0,t.montantNet||'',t.montantNetRecu||'',t.frais||0,t.fraisExpediteur||0,t.fraisDestinataire||0,t.fraisReversesAdmin||0,t.montantAnnule||0,t.status||'',t.annulee||false,t.credited||false,t.expediteur?._id||'',t.expediteur?.nom||'',t.expediteur?.prenom||'',t.expediteur?.telephone||'',t.soldeExpediteurApres||'',t.destinataire?._id||'',t.destinataire?.nom||'',t.destinataire?.prenom||'',t.destinataire?.telephone||'',t.soldeDestinataireApres||'',t.numeroSource||'',t.numeroDestination||'',t.operateur||'',t.depositId||'',(t.motif||'').replace(/;/g,','), (t.motifAnnulation||'').replace(/;/g,','), t.commandeId||'',t.produitId||'',t.compteDestination||'',t.compteFrais||''];
        csv += row.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(';')+'\\n';
      });
      const blob = new Blob(["\\ufeff"+csv], {type:'text/csv;charset=utf-8;'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='unipay_complet_'+new Date().toISOString().slice(0,10)+'.csv'; a.click();
    }
    async function annulerTx(id, type){
      if(!confirm('Confirmer annulation de '+type+' '+id+' ?')) return;
      try{
        const res = await fetch('/api/transactions/'+id+'/cancel', { method:'POST', headers:{'Authorization':'Bearer '+token}});
        const data = await res.json();
        alert(data.message || data.error || 'Fait');
        loadTransactions();
      }catch(e){ alert('Erreur: '+e.message); }
    }
    function exportPDF(){
      if(!currentTransactions.length) return alert('Aucune donnée');
      const {jsPDF}=window.jspdf; const doc=new jsPDF('l');
      doc.text('Historique UniPay - '+new Date().toLocaleDateString('fr-FR'),14,15);
      const body = currentTransactions.map(t=>[ new Date(t.createdAt).toLocaleString('fr-FR'), (t.type||'')+' '+(t.operateur||''), t.expediteur.prenom+' '+t.expediteur.nom, t.destinataire? t.destinataire.telephone : (t.numeroDestination||t.numeroSource||''), t.montant+' F', (t.frais||0)+' F', t.status ]);
      doc.autoTable({ head:[['Date','Type','Exp','Dest/Num','Montant','Frais','Statut']], body, startY:20, styles:{fontSize:7} });
      doc.save('unipay.pdf');
    }
    function resetFiltres(){
      ['filterClient','filterType','filterStatus','filterNumero','filterMontant','dateDebut','dateFin'].forEach(id=> document.getElementById(id).value='');
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
// ==================== ROUTE TRANSFERT B2B CORRIGEE ====================
// ==================== ROUTE TRANSFERT B2B CORRIGEE ====================
router.post('/', authUser, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { expediteur, destinataire, montant, motif } = req.body;
    const montantInt = Number(montant);

    // 1. VALIDATION DE BASE
    if (!Number.isInteger(montantInt) || montantInt <= 0) throw new Error('Montant invalide');
    if (montantInt > 2000000) throw new Error('Plafond de 2 000 000 FCFA dépassé');
    if (req.user.id !== expediteur) throw new Error('Tu ne peux transférer que depuis ton compte');
    if (expediteur === destinataire) throw new Error('Impossible de transférer à soi-même');

    // 2. RECUP + VERROU
    const [exp, dest, admin] = await Promise.all([
      Client.findById(expediteur).session(session),
      Client.findById(destinataire).session(session),
      Client.findOne({ telephone: '+22670000000' }).session(session) // COMPTE ADMIN
    ]);

    if (!exp) throw new Error('Compte expéditeur introuvable');
    if (!dest) throw new Error('Compte destinataire introuvable');
    if (!admin) throw new Error('Compte admin +22670000000 introuvable');
    if (exp.bloque) throw new Error('Compte suspendu. Contacte le support');
    if (dest.bloque) throw new Error('Destinataire suspendu');

    // 3. KYC
    if (!exp.isVerified || exp.verificationStatus !== 'verifie') {
      if (montantInt > 50000) {
        throw new Error('KYC non vérifié : tu ne peux envoyer que 50 000 FCFA max. Envoie ta CNIB dans Profil pour débloquer 2M');
      }
    }
    if (dest.verificationStatus === 'rejete') throw new Error('Destinataire rejeté KYC, transfert impossible');

    // 4. RESET LIMITES
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const isNewMonth = !exp.dernierResetJour || exp.dernierResetJour.getMonth() !== now.getMonth() || exp.dernierResetJour.getFullYear() !== now.getFullYear();

    if (!exp.dernierResetJour || exp.dernierResetJour < todayStart) {
      exp.totalDepotJour = 0;
    }
    if (isNewMonth) {
      exp.totalDepotMois = 0;
      exp.dernierResetJour = now;
    }
    
    const isNewMonthDest = !dest.dernierResetRecuMois || dest.dernierResetRecuMois.getMonth() !== now.getMonth() || dest.dernierResetRecuMois.getFullYear() !== now.getFullYear();
    if (isNewMonthDest) {
      dest.totalRecuMois = 0;
      dest.dernierResetRecuMois = now;
    }

    // 5. CALCUL FRAIS - NOUVELLE LOGIQUE UNIPAY
    const SEUIL_GRATUIT_RECEPTION = 200000;
    const TAUX_FRAIS_RECEPTION = 0.005; // 0.5%

    let fraisExpediteur = 0;
    let fraisDestinataire = 0;

    const volumeApres = (dest.totalRecuMois || 0) + montantInt;

    if (volumeApres > SEUIL_GRATUIT_RECEPTION) {
      if (dest.totalRecuMois >= SEUIL_GRATUIT_RECEPTION) {
        fraisDestinataire = Math.round(montantInt * TAUX_FRAIS_RECEPTION);
      } else {
        const depassement = volumeApres - SEUIL_GRATUIT_RECEPTION;
        fraisDestinataire = Math.round(depassement * TAUX_FRAIS_RECEPTION);
      }
    }

    const totalDebitExp = montantInt + fraisExpediteur; 
    const montantNetRecu = montantInt - fraisDestinataire;

    // 6. CHECKS SOLDE ET LIMITES ENVOI
    if (exp.solde < totalDebitExp) throw new Error(`Solde insuffisant. Solde: ${exp.solde.toLocaleString()} FCFA`);
    if ((exp.totalDepotJour + montantInt) > exp.limiteJournaliere) throw new Error(`Limite journalière dépassée. Restant: ${(exp.limiteJournaliere - exp.totalDepotJour).toLocaleString()} FCFA`);
    if ((exp.totalDepotMois + montantInt) > exp.limiteMensuelle) throw new Error(`Limite mensuelle dépassée. Restant: ${(exp.limiteMensuelle - exp.totalDepotMois).toLocaleString()} FCFA`);

    // 7. MOUVEMENTS DE FONDS
    exp.solde -= totalDebitExp;
    dest.solde += montantNetRecu;
    admin.solde += fraisDestinataire; 

    exp.totalDepotJour += montantInt;
    exp.totalDepotMois += montantInt;
    dest.totalRecuMois = volumeApres;
    exp.dernierResetJour = now;
    dest.dernierResetRecuMois = now;

    await exp.save({ session });
    await dest.save({ session });
    if (fraisDestinataire > 0) await admin.save({ session });

    // 8. TRANSACTION AUDIT
    const [tx] = await Transaction.create([{
      expediteur: exp._id,
      destinataire: dest._id,
      type: 'envoi',
      montant: montantInt,
      montantNetRecu,
      frais: fraisDestinataire, 
      fraisExpediteur,
      fraisDestinataire,
      fraisReversesAdmin: fraisDestinataire,
      adminId: admin._id,
      status: 'validee',
      motif: motif || '',
      verificationExpediteur: exp.verificationStatus,
      soldeExpediteurApres: exp.solde,
      soldeDestinataireApres: dest.solde,
      volumeRecuMoisApres: dest.totalRecuMois
    }], { session });

    // Validation définitive de l'écriture en B2B
    await session.commitTransaction();
    session.endSession();

    // 9. TRAITEMENT DU CHAT ET NOTIFICATIONS (HORS TRANSACTION ACID)
        setImmediate(async () => {
      try {
        const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const dateStr = new Date().toLocaleDateString('fr-FR').replaceAll('/', '');
        
        const expediteurIdStr = tx.expediteur.toString();
        const destinataireIdStr = tx.destinataire.toString();

        // FIX: onlineUsers est un Map<userId, Set<socketId>>
        const getSockets = (uid) => {
          const set = global.onlineUsers?.get(uid);
          return set ? Array.from(set) : [];
        };
        const destSockets = getSockets(destinataireIdStr);
        const expSockets = getSockets(expediteurIdStr);

        const initialDestStatus = destSockets.length > 0 ? 'delivered' : 'sent';

        const recuDestinataire = {
          id: tx._id.toString() + '_dest',
          type: 'pdf',
          name: `Reception_${dateStr}_${tx.montant}.pdf`,
          size: `${(Math.random() * 100 + 50).toFixed(0)} KB`,
          from: expediteurIdStr,
          to: destinataireIdStr,
          time,
          timestamp: Date.now(),
          createdAt: new Date().toISOString(),
          status: initialDestStatus,
          contactMeta: { _id: expediteurIdStr, prenom: exp.prenom, nom: exp.nom, telephone: exp.telephone, photoProfil: exp.photoProfil },
          tx: {...tx._doc, type: 'reception', contact: { _id: expediteurIdStr, prenom: exp.prenom, nom: exp.nom, telephone: exp.telephone, photoProfil: exp.photoProfil } }
        };

        const recuExpediteur = {
          id: tx._id.toString() + '_exp',
          type: 'pdf',
          name: `Envoi_${dateStr}_${tx.montant}.pdf`,
          size: `${(Math.random() * 100 + 50).toFixed(0)} KB`,
          from: expediteurIdStr,
          to: destinataireIdStr,
          time,
          timestamp: Date.now(),
          createdAt: new Date().toISOString(),
          status: 'read',
          contactMeta: { _id: destinataireIdStr, prenom: dest.prenom, nom: dest.nom, telephone: dest.telephone, photoProfil: dest.photoProfil },
          tx: {...tx._doc, type: 'envoi', contact: { _id: destinataireIdStr, prenom: dest.prenom, nom: dest.nom, telephone: dest.telephone, photoProfil: dest.photoProfil } }
        };

        // SAUVEGARDE
        const MessageModel = typeof Message !== 'undefined' ? Message : mongoose.models.Message;
        if (MessageModel) {
          await MessageModel.create([recuDestinataire, recuExpediteur]);
          console.log('PDF sauvé en base');
        }

        // ENVOI SOCKET - BROADCAST À TOUS LES SOCKETS DE L'USER
        if (global.io) {
          destSockets.forEach(sid => global.io.to(sid).emit('new_message', recuDestinataire));
          expSockets.forEach(sid => global.io.to(sid).emit('new_message', recuExpediteur));
          
          console.log(`📄 Dest ${destinataireIdStr}: ${destSockets.length} socket(s) | Exp ${expediteurIdStr}: ${expSockets.length} socket(s)`);
          console.log('ONLINE:', Array.from(global.onlineUsers?.keys() || []));
        }

      } catch (e) {
        console.error('Erreur async chat:', e.message, e.stack);
      }
    });

    // Réponse HTTP immédiate et performante pour le client
    return res.json({
      message: 'Transfert effectué',
      nouveauSolde: exp.solde,
      transactionId: tx._id,
      detailFrais: { montantEnvoye: montantInt, fraisDestinataire, montantRecu: montantNetRecu },
      transaction: tx
    });

  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    console.error('Erreur fatale transfert transaction:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

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
