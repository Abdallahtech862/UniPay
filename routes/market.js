const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Produit = mongoose.models.Produit || mongoose.model('Produit');
const Commande = mongoose.models.Commande || mongoose.model('Commande');
const Utilisateur = require('../models/Client');

const { verifyToken } = require('../middleware/auth');

const getUserId = (req) => {
  const id = req.client?._id || req.user?._id || req.client || req.user;
  return id ? id.toString() : null;
};

// 1. Créer produit - SÉCURISÉ avec token
router.post('/products', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ erreur: 'Non authentifié' });

    const vendeur = await Utilisateur.findById(userId);
    if (!vendeur) return res.status(404).json({ erreur: 'Vendeur introuvable' });

    const produit = await mongoose.model('Produit').create({
      titre: req.body.titre,
      description: req.body.description,
      prix: Number(req.body.prix),
      images: req.body.images || [],
      categorie: req.body.categorie || 'Autres',
      ville: req.body.ville || 'Ouagadougou',
      stock: 1,
      statut: 'actif',
      vendeurId: userId,
      vendeurNom: `${vendeur.prenom || ''} ${vendeur.nom || ''}`.trim() || 'Vendeur',
      vendeurTel: vendeur.telephone || '',
      vendeurPhoto: vendeur.photoProfil || ''
    });

    if (global.io) global.io.emit('nouveau_produit', produit);
    res.status(201).json(produit);
  } catch (e) {
    console.error('CREATE ERROR:', e);
    res.status(500).json({ erreur: e.message });
  }
});

// 2. Liste
router.get('/products', async (req, res) => {
  try {
    const produits = await mongoose.model('Produit').find({ statut: 'actif' }).sort({ createdAt: -1 });
    res.json(produits);
  } catch (e) { res.status(500).json({ erreur: e.message }); }
});

// 3. Détail - UNE SEULE FOIS
router.get('/products/:id', async (req, res) => {
  try {
    const p = await mongoose.model('Produit').findById(req.params.id);
    if (!p) return res.status(404).json({ erreur: 'Non trouvé' });
    res.json(p);
  } catch (e) { res.status(500).json({ erreur: e.message }); }
});

// 4. Payer (Escrow)
router.post('/orders/pay', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { produitId, adresseLivraison } = req.body;
    console.log('PAY:', { userId, produitId });

    const produit = await mongoose.model('Produit').findById(produitId);
    if (!produit) return res.status(404).json({ erreur: 'Produit introuvable' });
    if (produit.statut !== 'actif') return res.status(400).json({ erreur: 'Produit non disponible' });
    if (produit.vendeurId === userId) return res.status(400).json({ erreur: "Vous ne pouvez pas acheter votre propre article" });

    const acheteur = await Utilisateur.findById(userId);
    if (!acheteur) return res.status(404).json({ erreur: 'Acheteur introuvable' });

    if ((acheteur.solde || 0) < produit.prix) {
      return res.status(400).json({ erreur: `Solde insuffisant. Vous avez ${acheteur.solde} FCFA` });
    }

    acheteur.solde -= produit.prix;
    await acheteur.save();

    const commande = await mongoose.model('Commande').create({
      produitId: produit._id,
      acheteurId: userId,
      vendeurId: produit.vendeurId,
      prix: produit.prix,
      frais: produit.prix * 0.02,
      total: produit.prix,
      statut: 'paye',
      adresseLivraison: adresseLivraison || ''
    });

    produit.stock = Math.max(0, (produit.stock || 1) - 1);
    if (produit.stock <= 0) produit.statut = 'vendu';
    await produit.save();

    if (global.emitToUser) {
      global.emitToUser(produit.vendeurId, 'notification', {
        type: 'ordre_marche',
        titre: `Nouvelle vente! ${produit.titre}`,
        corps: `${acheteur.prenom} a payé ${produit.prix} FCFA`
      });
    }

    res.json(commande);
  } catch (e) {
    console.error('PAY ERROR:', e);
    res.status(500).json({ erreur: e.message });
  }
});

// 5. Confirmer réception -> libère argent vendeur
router.post('/orders/:id/confirm', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const commande = await mongoose.model('Commande').findById(req.params.id);
    if (!commande) return res.status(404).json({ erreur: 'Commande introuvable' });
    if (commande.acheteurId.toString() !== userId) return res.status(403).json({ erreur: 'Seul acheteur peut confirmer' });
    if (commande.statut === 'confirme') return res.status(400).json({ erreur: 'Déjà confirmée' });

    const vendeur = await Utilisateur.findById(commande.vendeurId);
    if (!vendeur) return res.status(404).json({ erreur: 'Vendeur introuvable' });

    const montantVendeur = commande.prix * 0.98;
    vendeur.solde = (vendeur.solde || 0) + montantVendeur;
    await vendeur.save();

    commande.statut = 'confirme';
    await commande.save();

    if (global.emitToUser) {
      global.emitToUser(commande.vendeurId, 'notification', {
        type: 'ordre_confirme',
        titre: 'Paiement libéré!',
        corps: `Vous avez reçu ${montantVendeur.toLocaleString()} FCFA`
      });
    }

    res.json({ succes: true, commande });
  } catch (e) { res.status(500).json({ erreur: e.message }); }
});

// 6. Mes commandes
router.get('/orders/my', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const ordres = await mongoose.model('Commande').find({
      $or: [{ acheteurId: userId }, { vendeurId: userId }]
    }).sort({ createdAt: -1 }).lean();

    for (let o of ordres) {
      o.produit = await mongoose.model('Produit').findById(o.produitId);
    }
    res.json(ordres);
  } catch (e) { res.status(500).json({ erreur: e.message }); }
});

// 7. Marquer livré
router.post('/orders/:id/deliver', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const commande = await mongoose.model('Commande').findById(req.params.id);
    if (!commande) return res.status(404).json({ erreur: 'Commande introuvable' });
    if (commande.vendeurId.toString() !== userId) return res.status(403).json({ erreur: 'Seul vendeur' });

    commande.statut = 'livre';
    await commande.save();

    if (global.emitToUser) {
      global.emitToUser(commande.acheteurId, 'notification', {
        type: 'ordre_livre',
        titre: 'Commande livrée!',
        corps: 'Confirmez la réception pour libérer le paiement.'
      });
    }
    res.json(commande);
  } catch (e) { res.status(500).json({ erreur: e.message }); }
});

module.exports = router;
