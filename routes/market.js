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

// 1. Créer - GARDE BASE64 tel quel
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
      images: req.body.images || [], // on garde base64 direct
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

// 2. Liste active
router.get('/products', async (req, res) => {
  try {
    const filter = { statut: 'actif' };
    if(req.query.categorie) filter.categorie = req.query.categorie;
    const produits = await mongoose.model('Produit').find(filter).sort({ createdAt: -1 }).limit(50);
    res.json(produits);
  } catch (e) { res.status(500).json({ erreur: e.message }); }
});


// 2b. Mes articles - DOIT ETRE AVANT /products/:id sinon "my" est pris comme un id
router.get('/products/my/mine', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const produits = await mongoose.model('Produit').find({ vendeurId: userId }).sort({ createdAt: -1 });
    res.json(produits);
  } catch(e){ res.status(500).json({erreur:e.message}); }
});

// 3. Détail - CORRIGÉ: un seul /products/:id
router.get('/products/:id', async (req, res) => {
  try {
    const p = await mongoose.model('Produit').findById(req.params.id);
    if (!p) return res.status(404).json({ erreur: 'Non trouvé' });
    res.json(p);
  } catch (e) { res.status(500).json({ erreur: e.message }); }
});

// 4. MODIFIER - GARDE BASE64
router.put('/products/:id', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const p = await mongoose.model('Produit').findById(req.params.id);
    if(!p) return res.status(404).json({erreur:'Non trouvé'});
    if(p.vendeurId.toString() !== userId) return res.status(403).json({erreur:'Pas ton article'});

    p.titre = req.body.titre ?? p.titre;
    p.description = req.body.description ?? p.description;
    p.prix = req.body.prix ? Number(req.body.prix) : p.prix;
    p.categorie = req.body.categorie ?? p.categorie;
    p.ville = req.body.ville ?? p.ville;
    if(req.body.images && Array.isArray(req.body.images)){
      p.images = req.body.images; // base64 direct
    }
    await p.save();
    if (global.io) global.io.emit('produit_modifie', p);
    res.json(p);
  } catch(e){ 
    console.error('UPDATE ERROR', e);
    res.status(500).json({erreur:e.message}); 
  }
});

// SUPPRIMER / RESTAURER (toggle actif <-> suspendu)
router.delete('/products/:id', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const p = await mongoose.model('Produit').findById(req.params.id);
    if(!p) return res.status(404).json({erreur:'Non trouvé'});
    if(p.vendeurId.toString()!== userId) return res.status(403).json({erreur:'Pas ton article'});

    // Toggle
    p.statut = p.statut === 'actif'? 'suspendu' : 'actif';
    await p.save();

    res.json({ succes: true, statut: p.statut, produit: p });
  } catch(e){ res.status(500).json({erreur:e.message}); }
});

// Optionnel: route dédiée pour restaurer
router.patch('/products/:id/restore', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const p = await mongoose.model('Produit').findById(req.params.id);
    if(!p) return res.status(404).json({erreur:'Non trouvé'});
    if(p.vendeurId.toString()!== userId) return res.status(403).json({erreur:'Pas ton article'});
    p.statut = 'actif';
    await p.save();
    res.json(p);
  } catch(e){ res.status(500).json({erreur:e.message}); }
});

// 6. Payer, confirmer, etc...
router.post('/orders/pay', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { produitId } = req.body;
    const produit = await mongoose.model('Produit').findById(produitId);
    if (!produit) return res.status(404).json({ erreur: 'Produit introuvable' });
    if (produit.statut !== 'actif') return res.status(400).json({ erreur: 'Produit non disponible' });
    if (produit.vendeurId === userId) return res.status(400).json({ erreur: "Ton propre article" });
    const acheteur = await Utilisateur.findById(userId);
    if ((acheteur.solde || 0) < produit.prix) return res.status(400).json({ erreur: `Solde insuffisant: ${acheteur.solde} FCFA` });
    acheteur.solde -= produit.prix;
    await acheteur.save();
    const commande = await mongoose.model('Commande').create({
      produitId: produit._id, acheteurId: userId, vendeurId: produit.vendeurId,
      prix: produit.prix, frais: produit.prix * 0.02, total: produit.prix, statut: 'paye'
    });
    produit.stock = Math.max(0, (produit.stock || 1) - 1);
    if (produit.stock <= 0) produit.statut = 'vendu';
    await produit.save();
    res.json(commande);
  } catch (e) { res.status(500).json({ erreur: e.message }); }
});

router.post('/orders/:id/confirm', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const commande = await mongoose.model('Commande').findById(req.params.id);
    if (!commande) return res.status(404).json({ erreur: 'Introuvable' });
    if (commande.acheteurId.toString() !== userId) return res.status(403).json({ erreur: 'Seul acheteur' });
    if (commande.statut === 'confirme') return res.status(400).json({ erreur: 'Déjà confirmée' });
    const vendeur = await Utilisateur.findById(commande.vendeurId);
    vendeur.solde = (vendeur.solde || 0) + commande.prix * 0.98;
    await vendeur.save();
    commande.statut = 'confirme';
    await commande.save();
    res.json({ succes: true, commande });
  } catch (e) { res.status(500).json({ erreur: e.message }); }
});

router.get('/orders/my', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const ordres = await mongoose.model('Commande').find({ $or: [{ acheteurId: userId }, { vendeurId: userId }] }).sort({ createdAt: -1 }).lean();
    for (let o of ordres) { o.produit = await mongoose.model('Produit').findById(o.produitId); o.status = o.statut; }
    res.json(ordres);
  } catch (e) { res.status(500).json({ erreur: e.message }); }
});

router.post('/orders/:id/deliver', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const commande = await mongoose.model('Commande').findById(req.params.id);
    if (!commande) return res.status(404).json({ erreur: 'Introuvable' });
    if (commande.vendeurId.toString() !== userId) return res.status(403).json({ erreur: 'Seul vendeur' });
    commande.statut = 'livre';
    await commande.save();
    res.json(commande);
  } catch (e) { res.status(500).json({ erreur: e.message }); }
});

module.exports = router;
