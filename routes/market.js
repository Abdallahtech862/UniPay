const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Récupération des modèles Mongoose déclarés dans server.js
const Produit = mongoose.model('Produit');
const Commande = mongoose.model('Commande');
const Utilisateur = mongoose.model('Client'); // Ton modèle s'appelle 'Client' dans server.js

// Middleware d'authentification (adapte le chemin si nécessaire)
const authentification = require('../middlewares/auth');

// 1. Créer un produit
// Route réelle : POST /api/marketplace/products
router.post('/products', authentification, async (req, res) => {
  try {
    const vendeur = await Utilisateur.findById(req.userId);

    const produit = await Produit.create({
      ...req.body,
      vendeurId: req.userId,
      vendeurNom: vendeur ? `${vendeur.prenom || ''} ${vendeur.nom || ''}`.trim() : 'Vendeur',
      vendeurTel: vendeur?.telephone || '',
      vendeurPhoto: vendeur?.photoProfil || ''
    });

    if (global.io) {
      global.io.emit('nouveau_produit', produit);
    }

    res.status(201).json(produit);
  } catch (error) {
    res.status(500).json({ erreur: error.message });
  }
});

// 2. Liste des produits actifs
// Route réelle : GET /api/marketplace/products
router.get('/products', async (req, res) => {
  try {
    const produits = await Produit.find({ statut: 'actif' })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(produits);
  } catch (error) {
    res.status(500).json({ erreur: error.message });
  }
});

// 3. Payer une commande (Séquestre)
// Route réelle : POST /api/marketplace/orders/pay
router.post('/orders/pay', authentification, async (req, res) => {
  try {
    const { produitId, adresseLivraison } = req.body;
    const produit = await Produit.findById(produitId);
    
    if (!produit) return res.status(404).json({ erreur: 'Produit introuvable' });
    if (produit.statut !== 'actif') return res.status(400).json({ erreur: 'Produit non disponible' });

    const acheteur = await Utilisateur.findById(req.userId);
    if (!acheteur) return res.status(404).json({ erreur: 'Utilisateur introuvable' });

    const frais = produit.prix * 0.02; // Commission 2%
    const total = produit.prix; // Ou produit.prix + frais selon ta logique

    if (acheteur.solde < total) {
      return res.status(400).json({ erreur: 'Solde insuffisant' });
    }

    // Débit du portefeuille acheteur
    acheteur.solde -= total;
    await acheteur.save();

    // Création de la commande
    const commande = await Commande.create({
      produitId,
      acheteurId: req.userId,
      vendeurId: produit.vendeurId,
      prix: produit.prix,
      frais: frais,
      total: total,
      statut: 'paye',
      adresseLivraison: adresseLivraison || ''
    });

    // Optionnel : Passer le produit en "vendu" si stock unique
    if (produit.stock <= 1) {
      produit.statut = 'vendu';
    }
    produit.stock = Math.max(0, produit.stock - 1);
    await produit.save();

    // Notification Socket.io au vendeur en temps réel
    if (global.emitToUser) {
      global.emitToUser(produit.vendeurId, 'notification', {
        type: 'ordre_marche',
        titre: `Nouvelle vente ! ${produit.titre}`,
        corps: `${acheteur.prenom || 'Un client'} a payé ${produit.prix} FCFA`,
        orderId: commande._id
      });
    }

    res.json(commande);
  } catch (error) {
    res.status(500).json({ erreur: error.message });
  }
});

// 4. Confirmer la réception et libérer l'argent au vendeur
// Route réelle : POST /api/marketplace/orders/:id/confirm
router.post('/orders/:id/confirm', authentification, async (req, res) => {
  try {
    const commande = await Commande.findById(req.params.id);
    if (!commande) return res.status(404).json({ erreur: 'Commande introuvable' });

    // Seul l'acheteur peut confirmer la réception
    if (commande.acheteurId.toString() !== req.userId) {
      return res.status(403).json({ erreur: 'Non autorisé' });
    }

    if (commande.statut === 'confirme') {
      return res.status(400).json({ erreur: 'Commande déjà confirmée' });
    }

    const vendeur = await Utilisateur.findById(commande.vendeurId);
    if (!vendeur) return res.status(404).json({ erreur: 'Vendeur introuvable' });

    // Le vendeur reçoit 98% du prix
    const montantVendeur = commande.prix * 0.98;
    vendeur.solde += montantVendeur;
    await vendeur.save();

    commande.statut = 'confirme';
    await commande.save();

    // Notifier le vendeur
    if (global.emitToUser) {
      global.emitToUser(commande.vendeurId, 'notification', {
        type: 'ordre_confirme',
        titre: 'Paiement libéré !',
        corps: `Vous avez reçu ${montantVendeur} FCFA sur votre solde.`
      });
    }

    res.json({ succes: true, commande });
  } catch (error) {
    res.status(500).json({ erreur: error.message });
  }
});

// 5. Obtenir mes commandes (Acheteur & Vendeur)
// Route réelle : GET /api/marketplace/orders/my
router.get('/orders/my', authentification, async (req, res) => {
  try {
    const ordres = await Commande.find({
      $or: [{ acheteurId: req.userId }, { vendeurId: req.userId }]
    })
      .sort({ createdAt: -1 })
      .populate('produitId')
      .lean();

    res.json(ordres);
  } catch (error) {
    res.status(500).json({ erreur: error.message });
  }
});

// 6. Marquer comme livré par le vendeur
// Route réelle : POST /api/marketplace/orders/:id/deliver
router.post('/orders/:id/deliver', authentification, async (req, res) => {
  try {
    const commande = await Commande.findById(req.params.id);
    if (!commande) return res.status(404).json({ erreur: 'Commande introuvable' });

    if (commande.vendeurId.toString() !== req.userId) {
      return res.status(403).json({ erreur: 'Non autorisé' });
    }

    commande.statut = 'livre';
    await commande.save();

    // Notifier l'acheteur
    if (global.emitToUser) {
      global.emitToUser(commande.acheteurId, 'notification', {
        type: 'ordre_livre',
        titre: 'Commande livrée !',
        corps: 'Le vendeur a marqué le colis comme livré. Merci de confirmer la réception.',
        orderId: commande._id
      });
    }

    res.json(commande);
  } catch (error) {
    res.status(500).json({ erreur: error.message });
  }
});

module.exports = router;
