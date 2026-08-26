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

// ===================== 0. ROUTES PUBLIQUES POUR WHATSAPP =====================
router.get('/product-image/:id/:index', async (req, res) => {
  try {
    const p = await mongoose.model('Produit').findById(req.params.id).lean();
    if (!p || !p.images || !p.images[req.params.index]) return res.status(404).send('Image not found');
    let img = p.images[req.params.index];
    if (!img.startsWith('data:')) return res.redirect(img);
    const matches = img.match(/^data:(.+);base64,(.+)$/);
    if (!matches) return res.status(400).send('Bad base64');
    const buffer = Buffer.from(matches[2], 'base64');
    res.set('Content-Type', matches[1]);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (e) { res.status(500).send(`err: ${e.message}`); }
});

router.get('/share/:id', async (req, res) => {
  try {
    const p = await mongoose.model('Produit').findById(req.params.id).lean();
    if (!p) return res.status(404).send('<h1>Produit introuvable - UniPay</h1>');
    const productId = req.params.id;
    const API_DOMAIN = 'https://unipay-production-d2a0.up.railway.app';
    const ogImageUrl = `${API_DOMAIN}/api/marketplace/product-image/${productId}/0`;
    const description = `${p.description?.slice(0,150) || 'Article'} - Vendu par ${p.vendeurNom} à ${p.ville}.`;
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta property="og:type" content="product" />
<meta property="og:title" content="${p.titre} - ${Number(p.prix).toLocaleString()} FCFA" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${ogImageUrl}" />
<meta property="og:url" content="${API_DOMAIN}/api/marketplace/share/${productId}" />
<title>${p.titre}</title></head><body><img src="${ogImageUrl}" style="width:100%"/><h1>${p.titre}</h1><p>${Number(p.prix).toLocaleString()} FCFA - ${p.ville}</p></body></html>`;
    res.set('Content-Type','text/html').send(html);
  } catch(e){ res.status(500).send('Erreur'); }
});

// ===================== 1. SERVICES =====================
router.get('/services', (req,res)=>{
  res.json([
    { _id: '6a59ee853dfa6cb478f7e2d3', nom: 'unipay Express', ville: 'Ouagadougou', prix: 1000, note: '4.9', telephone: '+22675322321' },
    { _id: 'liv2', nom: 'Rapide BF', ville: 'Ouagadougou', prix: 1500, note: '4.8' },
    { _id: 'liv3', nom: 'Bobo Livraison', ville: 'Bobo-Dioulasso', prix: 2000, note: '4.7' },
  ]);
});

// ===================== 2. PRODUITS =====================
router.post('/products', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ erreur: 'Non authentifié' });
    const vendeur = await Utilisateur.findById(userId);
    if (!vendeur) return res.status(404).json({ erreur: 'Vendeur introuvable' });

    const stock = req.body.stock !== undefined ? Math.max(1, parseInt(req.body.stock)) : 1;

    const produit = await mongoose.model('Produit').create({
      titre: req.body.titre,
      description: req.body.description,
      prix: Number(req.body.prix),
      images: req.body.images || [],
      categorie: req.body.categorie || 'Autres',
      ville: req.body.ville || 'Ouagadougou',
      stock: stock,
      statut: 'actif',
      vendeurId: userId,
      vendeurNom: `${vendeur.prenom || ''} ${vendeur.nom || ''}`.trim() || 'Vendeur',
      vendeurTel: vendeur.telephone || '',
      vendeurPhoto: vendeur.photoProfil || ''
    });

    if (global.io) global.io.emit('nouveau_produit', produit);
    res.status(201).json(produit);
  } catch(e){
    console.log(e);
    res.status(500).json({erreur: e.message});
  }
});

router.get('/products', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const sortType = req.query.sort || 'recent';
    const filter = { statut: 'actif' };
    if(req.query.categorie && req.query.categorie!== 'Tous') filter.categorie = req.query.categorie;
    let produits = [];
    if (sortType === 'random') {
      produits = await mongoose.model('Produit').aggregate([
        { $match: filter },
        { $sample: { size: limit * 3 } },
        { $skip: skip % 60 },
        { $limit: limit }
      ]);
    } else {
      produits = await mongoose.model('Produit').find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    }
    const total = await mongoose.model('Produit').countDocuments(filter);
    res.json({ produits, hasMore: skip + produits.length < total, total });
  } catch (e) { res.status(500).json({ erreur: e.message }); }
});

router.get('/products/my/mine', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const produits = await mongoose.model('Produit').find({ vendeurId: userId }).sort({ createdAt: -1 });
    res.json(produits);
  } catch(e){ res.status(500).json({erreur:e.message}); }
});

router.get('/products/:id', async (req, res) => {
  try {
    const p = await mongoose.model('Produit').findById(req.params.id);
    if (!p) return res.status(404).json({ erreur: 'Non trouvé' });
    res.json(p);
  } catch (e) { res.status(500).json({ erreur: e.message }); }
});

router.put('/products/:id', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const p = await mongoose.model('Produit').findById(req.params.id);
    if(!p) return res.status(404).json({erreur:'Non trouvé'});
    if(p.vendeurId.toString() !== userId) return res.status(403).json({erreur:'Pas ton article'});
    p.titre = req.body.titre ?? p.titre;
    p.description = req.body.description ?? p.description;
    p.prix = req.body.prix !== undefined ? Number(req.body.prix) : p.prix;
    p.stock = req.body.stock !== undefined ? Number(req.body.stock) : p.stock;
    p.categorie = req.body.categorie ?? p.categorie;
    p.ville = req.body.ville ?? p.ville;
    if(req.body.images && Array.isArray(req.body.images)) p.images = req.body.images;
    if(p.stock > 0 && p.statut === 'vendu') p.statut = 'actif';
    if(p.stock === 0) p.statut = 'vendu';
    await p.save();
    if (global.io) global.io.emit('produit_modifie', p);
    res.json(p);
  } catch(e){ res.status(500).json({erreur:e.message}); }
});

router.delete('/products/:id', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const p = await mongoose.model('Produit').findById(req.params.id);
    if(!p) return res.status(404).json({erreur:'Non trouvé'});
    if(p.vendeurId.toString()!== userId) return res.status(403).json({erreur:'Pas ton article'});
    p.statut = p.statut === 'actif'? 'suspendu' : 'actif';
    await p.save();
    res.json({ succes: true, statut: p.statut, produit: p });
  } catch(e){ res.status(500).json({erreur:e.message}); }
});

// ===================== 3. COMMANDES AVEC QUANTITÉ =====================
router.post('/orders/pay', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if(!userId) return res.status(401).json({ erreur: 'Non authentifié' });
    
    const { produitId, quantite = 1 } = req.body;
    const qty = Math.max(1, parseInt(quantite) || 1);
    
    const produit = await Produit.findById(produitId);
    if(!produit) return res.status(404).json({ erreur: 'Produit introuvable' });
    if(produit.vendeurId.toString() === userId) return res.status(400).json({ erreur: 'Votre article' });
    if(produit.statut !== 'actif') return res.status(400).json({ erreur: 'Article non disponible' });
    if((produit.stock||1) < qty) return res.status(400).json({ erreur: `Stock insuffisant, il ne reste que ${produit.stock}` });

    const total = produit.prix * qty;

    const buyer = await Utilisateur.findById(userId);
    if(!buyer) return res.status(404).json({ erreur: 'Acheteur introuvable' });
    if((buyer.solde||0) < total) return res.status(400).json({ erreur: 'Solde insuffisant' });

    buyer.solde -= total;
    await buyer.save();

    produit.stock -= qty;
    if(produit.stock <= 0){
      produit.stock = 0;
      produit.statut = 'vendu';
    }
    await produit.save();

    const commande = await Commande.create({
      produitId: produit._id,
      produit: produit,
      acheteurId: userId,
      vendeurId: produit.vendeurId,
      prix: produit.prix,
      quantite: qty,
      total: total,
      statut: 'paye'
    });

    if (global.io) global.io.emit('nouvelle_commande', commande);

    res.json({ success: true, commande, total, quantite: qty });
  } catch(e){
    console.log('PAY ERROR:', e);
    res.status(500).json({ erreur: e.message });
  }
});

router.post('/orders/:id/confirm', verifyToken, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userId = getUserId(req);
    const Transaction = mongoose.model('Transaction');
    const Message = mongoose.models.Message;
    const commande = await Commande.findById(req.params.id).session(session);
    if (!commande) throw new Error('Commande introuvable');
    if (commande.acheteurId.toString()!== userId) throw new Error('Seul l\'acheteur peut confirmer');
    if (commande.statut === 'confirme') throw new Error('Déjà confirmée');
    if (commande.statut!== 'livre' && commande.statut!== 'paye') throw new Error('La commande doit être livrée avant confirmation');
    const produit = await Produit.findById(commande.produitId).session(session);
    const vendeur = await Utilisateur.findById(commande.vendeurId).session(session);
    const acheteur = await Utilisateur.findById(commande.acheteurId).session(session);
    const admin = await Utilisateur.findOne({ telephone: '+22670000000' }).session(session);
    if (!vendeur ||!acheteur) throw new Error('Utilisateur introuvable');
    
    const totalPaye = commande.total || commande.prix;
    const prixUnitaire = commande.prix;
    const frais = Math.round(totalPaye * 0.02);
    const netVendeur = totalPaye - frais;
    
    vendeur.solde = (vendeur.solde || 0) + netVendeur;
    if (admin) admin.solde = (admin.solde || 0) + frais;
    commande.statut = 'confirme';
    commande.dateConfirmation = new Date();
    await vendeur.save({ session });
    if (admin) await admin.save({ session });
    await commande.save({ session });
    
    const [txAchat, txVente] = await Transaction.create([{
        expediteur: acheteur._id, destinataire: vendeur._id, montant: totalPaye, frais: frais,
        montantNetRecu: netVendeur, montantNet: totalPaye, type: 'achat', status: 'validee',
        motif: `${produit?.titre} x${commande.quantite||1}`, produitId: produit?._id, commandeId: commande._id,
        soldeExpediteurApres: acheteur.solde, soldeDestinataireApres: acheteur.solde,
        contact: { prenom: vendeur.prenom, nom: vendeur.nom, telephone: vendeur.telephone }
      },{
        expediteur: acheteur._id, destinataire: vendeur._id, montant: totalPaye, frais: frais,
        montantNetRecu: netVendeur, montantNet: netVendeur, type: 'vente', status: 'validee',
        motif: `${produit?.titre} x${commande.quantite||1}`, produitId: produit?._id, commandeId: commande._id,
        soldeExpediteurApres: vendeur.solde, soldeDestinataireApres: vendeur.solde,
        contact: { prenom: acheteur.prenom, nom: acheteur.nom, telephone: acheteur.telephone }
      }], { session });
      
    await session.commitTransaction(); session.endSession();
    res.json({ succes: true, commande, detail: { total: totalPaye, frais, netVendeur, quantite: commande.quantite } });
  } catch (e) {
    if (session.inTransaction()) await session.abortTransaction(); session.endSession();
    console.error('Erreur confirm:', e.message); res.status(400).json({ erreur: e.message });
  }
});

router.get('/orders/my', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const ordres = await Commande.find({ $or: [{ acheteurId: userId }, { vendeurId: userId }] }).sort({ createdAt: -1 }).lean();
    for (let o of ordres) { 
      if(!o.produit) o.produit = await Produit.findById(o.produitId); 
      o.status = o.statut; 
    }
    res.json(ordres);
  } catch (e) { res.status(500).json({ erreur: e.message }); }
});

router.post('/orders/:id/deliver', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const commande = await Commande.findById(req.params.id);
    if (!commande) return res.status(404).json({ erreur: 'Introuvable' });
    if (commande.vendeurId.toString() !== userId) return res.status(403).json({ erreur: 'Seul vendeur' });
    commande.statut = 'livre'; await commande.save(); res.json(commande);
  } catch (e) { res.status(500).json({ erreur: e.message }); }
});

module.exports = router;
