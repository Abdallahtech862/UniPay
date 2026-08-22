const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Produit = mongoose.model('Produit');
const Commande = mongoose.model('Commande');
const Utilisateur = mongoose.model('Client');
//const authentification = require('../middlewares/auth');
const { verifyAdmin, authUser, verifyToken } = require('../middleware/auth');
// 1. Créer un produit
router.post('/products', verifyToken, async (req, res) => {
  try {
    const vendeur = await Utilisateur.findById(req.userId);
    const produit = await Produit.create({
      titre: req.body.titre,
      description: req.body.description,
      prix: Number(req.body.prix),
      images: req.body.images || [],
      categorie: req.body.categorie || 'Autres',
      ville: req.body.ville || 'Ouagadougou',
      stock: 1,
      statut: 'actif',
      vendeurId: req.userId,
      vendeurNom: vendeur? `${vendeur.prenom || ''} ${vendeur.nom || ''}`.trim() : 'Vendeur',
      vendeurTel: vendeur?.telephone || '',
      vendeurPhoto: vendeur?.photoProfil || ''
    });
    if (global.io) global.io.emit('nouveau_produit', produit);
    res.status(201).json(produit);
  } catch (error) {
    console.log(error);
    res.status(500).json({ erreur: error.message });
  }
});

// 2. Liste active
router.get('/products', async (req, res) => {
  try {
    const produits = await Produit.find({ statut: 'actif' }).sort({ createdAt: -1 }).limit(100);
    res.json(produits);
  } catch (error) {
    res.status(500).json({ erreur: error.message });
  }
});

// 2bis. IMPORTANT: Détail d'un produit (manquait chez toi)
router.get('/products/:id', async (req, res) => {
  try {
    const produit = await Produit.findById(req.params.id);
    if (!produit) return res.status(404).json({ erreur: 'Produit introuvable' });
    res.json(produit);
  } catch (error) {
    res.status(500).json({ erreur: error.message });
  }
});

// 3. Payer (Escrow)
router.post('/orders/pay',verifyToken, async (req, res) => {
  try {
    const { produitId, adresseLivraison } = req.body;
    const produit = await Produit.findById(produitId);
    if (!produit) return res.status(404).json({ erreur: 'Produit introuvable' });
    if (produit.statut!== 'actif') return res.status(400).json({ erreur: 'Produit non disponible' });

    const acheteur = await Utilisateur.findById(req.userId);
    if (acheteur.solde < produit.prix) return res.status(400).json({ erreur: 'Solde insuffisant' });

    acheteur.solde -= produit.prix;
    await acheteur.save();

    const commande = await Commande.create({
      produitId: produit._id,
      acheteurId: req.userId,
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
        corps: `${acheteur.prenom} a payé ${produit.prix} FCFA`,
        orderId: commande._id
      });
    }
    res.json(commande);
  } catch (error) {
    res.status(500).json({ erreur: error.message });
  }
});

// 4. Confirmer réception
router.post('/orders/:id/confirm', verifyToken, async (req, res) => {
  try {
    const commande = await Commande.findById(req.params.id);
    if (!commande) return res.status(404).json({ erreur: 'Commande introuvable' });
    if (commande.acheteurId.toString()!== req.userId) return res.status(403).json({ erreur: 'Non autorisé' });
    if (commande.statut === 'confirme') return res.status(400).json({ erreur: 'Déjà confirmée' });

    const vendeur = await Utilisateur.findById(commande.vendeurId);
    const montantVendeur = commande.prix * 0.98;
    vendeur.solde += montantVendeur;
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
  } catch (error) {
    res.status(500).json({ erreur: error.message });
  }
});

// 5. Mes commandes
router.get('/orders/my', verifyToken, async (req, res) => {
  try {
    const ordres = await Commande.find({ $or: [{ acheteurId: req.userId }, { vendeurId: req.userId }] })
     .sort({ createdAt: -1 })
     .lean();
    // Populate manuel car ton champ s'appelle produitId et pas ref
    for (let o of ordres) {
      o.produit = await Produit.findById(o.produitId);
    }
    res.json(ordres);
  } catch (error) {
    res.status(500).json({ erreur: error.message });
  }
});

// 6. Marquer livré
router.post('/orders/:id/deliver', verifyToken, async (req, res) => {
  try {
    const commande = await Commande.findById(req.params.id);
    if (!commande) return res.status(404).json({ erreur: 'Commande introuvable' });
    if (commande.vendeurId.toString()!== req.userId) return res.status(403).json({ erreur: 'Non autorisé' });
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
  } catch (error) {
    res.status(500).json({ erreur: error.message });
  }
});

module.exports = router;
