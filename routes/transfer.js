const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Transaction = require('../models/Transaction');
const { verifyAdmin } = require('../middleware/auth');

// POST - Faire un transfert - PROTÉGÉ
router.post('/transfer', verifyAdmin, async (req, res) => {
  const { fromId, toId, montant, description } = req.body;

  try {
    // 1. Validations
    if (!fromId || !toId || !montant) {
      return res.status(400).json({ message: 'fromId, toId et montant requis' });
    }
    
    if (fromId === toId) {
      return res.status(400).json({ message: 'Tu peux pas transférer vers le même compte' });
    }

    if (montant <= 0) {
      return res.status(400).json({ message: 'Le montant doit être > 0' });
    }

    // 2. Trouver les clients
    const expediteur = await Client.findById(fromId);
    const destinataire = await Client.findById(toId);

    if (!expediteur) return res.status(404).json({ message: 'Expéditeur introuvable' });
    if (!destinataire) return res.status(404).json({ message: 'Destinataire introuvable' });

    // 3. Vérifier le solde
    if (expediteur.solde < montant) {
      return res.status(400).json({ message: 'Solde insuffisant' });
    }

    // 4. Faire le transfert
    expediteur.solde -= montant;
    destinataire.solde += montant;

    await expediteur.save();
    await destinataire.save();

    // 5. Enregistrer la transaction
    const transaction = new Transaction({
      from: fromId,
      to: toId,
      montant,
      description: description || `Transfert de ${expediteur.prenom} vers ${destinataire.prenom}`,
      statut: 'succès'
    });

    await transaction.save();

    res.json({ 
      message: 'Transfert réussi', 
      transaction,
      nouveauSoldeExpediteur: expediteur.solde,
      nouveauSoldeDestinataire: destinataire.solde
    });

  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

// GET - Historique des transactions - PROTÉGÉ
router.get('/', verifyAdmin, async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate('from', 'nom prenom telephone')
      .populate('to', 'nom prenom telephone')
      .sort({ date: -1 });
    
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: 'Erreur', error: error.message });
  }
});

module.exports = router;
