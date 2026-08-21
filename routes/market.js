// routes/marketplace.js
const express = require('express');
const router = express.Router();

// Import des modèles (adapte les chemins selon ton projet)
const Produit = require('../models/Produit');
const Commande = require('../models/Commande');
const Utilisateur = require('../models/Utilisateur');

// Importer le middleware d'authentification et les outils requis
const authentification = require('../middlewares/auth');
// const { envoyerPushToUser } = require('../services/push');

// 1. Créer un produit
router.post('/api/products', authentification, async (req, res) => {
  try {
    // S'assurer d'associer le vendeur à l'utilisateur connecté
    const produit = await Produit.create({ ...req.body, vendeurId: req.userId });
    
    // Si 'io' est accessible (ex: req.app.get('io'))
    const io = req.app.get('io');
    if (io) io.emit('nouveau_produit', produit);

    res.status(201).json(produit);
  } catch (error) {
    res.status(500).json({ erreur: error.message });
  }
});

// 2. Liste des produits
router.get('/api/products', async (req, res) => {
  try {
    const produits = await Produit.find({ statut: 'actif' })
      .sort({ creeA: -1 }) // ou createdAt: -1 selon ton schéma
      .limit(100);
    res.json(produits);
  } catch (error) {
    res.status(500).json({ erreur: error.message });
  }
});

// 3. Payer une commande (Séquestre)
router.post('/api/orders/pay', authentification, async (req, res) => {
  try {
    const { produitId } = req.body;
    const produit = await Produit.findById(produitId);
    if (!produit) return res.status(404).json({ erreur: 'Produit introuvable' });

    const acheteur = await Utilisateur.findById(req.userId);

    if (acheteur.solde < produit.prix) {
      return res.status(400).json({ erreur: 'Solde insuffisant' });
    }

    // Débit du portefeuille acheteur
    acheteur.solde -= produit.prix;
    await acheteur.save();

    // Création de la commande
    const commande = await Commande.create({
      produitId,
      acheteurId: req.userId,
      vendeurId: produit.vendeurId,
      prix: produit.prix,
      statut: 'paye'
    });

    // Envoi de la notification push
    if (typeof envoyerPushToUser === 'function') {
      envoyerPushToUser(produit.vendeurId, {
        titre: `Nouvelle vente ! ${produit.titre}`,
        corps: `${acheteur.prenom} a payé ${produit.prix} FCFA`,
        donnees: { type: 'ordre_marche', orderId: commande._id }
      });
    }

    res.json(commande);
  } catch (error) {
    res.status(500).json({ erreur: error.message });
  }
});

// 4. Confirmer la réception et libérer l'argent
router.post('/api/orders/:id/confirm', authentification, async (req, res) => {
  try {
    const commande = await Commande.findById(req.params.id);
    if (!commande) return res.status(404).json({ erreur: 'Commande introuvable' });

    // Vérifier que seul l'acheteur peut confirmer
    if (commande.acheteurId.toString() !== req.userId) {
      return res.status(403).json({ erreur: 'Non autorisé' });
    }

    const vendeur = await Utilisateur.findById(commande.vendeurId);
    
    // Commission de 2% (98% au vendeur)
    vendeur.solde += commande.prix * 0.98; 
    await vendeur.save();

    commande.statut = 'confirmer';
    await commande.save();

    res.json({ succes: true });
  } catch (error) {
    res.status(500).json({ erreur: error.message });
  }
});

// 5. Mes commandes (Acheteur & Vendeur)
router.get('/api/orders/my', authentification, async (req, res) => {
  try {
    // Utilisation de .populate() au lieu de boucle async manuel
    const ordres = await Commande.find({
      $or: [{ acheteurId: req.userId }, { vendeurId: req.userId }]
    })
      .sort({ creeA: -1 })
      .populate('produitId')
      .lean();

    res.json(ordres);
  } catch (error) {
    res.status(500).json({ erreur: error.message });
  }
});

// 6. Marquer comme livré par le vendeur
router.post('/api/orders/:id/deliver', authentification, async (req, res) => {
  try {
    const commande = await Commande.findById(req.params.id);
    if (!commande) return res.status(404).json({ erreur: 'Commande introuvable' });

    if (commande.vendeurId.toString() !== req.userId) {
      return res.status(403).json({ erreur: 'Non autorisé' });
    }

    commande.statut = 'livre';
    await commande.save();

    res.json(commande);
  } catch (error) {
    res.status(500).json({ erreur: error.message });
  }
});

module.exports = router;
