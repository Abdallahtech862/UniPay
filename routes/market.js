const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Produit = mongoose.models.Produit || mongoose.model('Produit');
const Commande = mongoose.models.Commande || mongoose.model('Commande');
const Utilisateur = require('../models/Client');
const Client = require('../models/Client');
const { verifyToken } = require('../middleware/auth');

const getUserId = (req) => {
  const id = req.client?._id || req.user?._id || req.client || req.user;
  return id ? id.toString() : null;
};

// ===================== 0. ROUTES PUBLIQUES POUR WHATSAPP =====================


const sharp = require('sharp');

const Report = require('../models/Report');

router.post('/products/:id/report', auth, async (req, res) => {
  try {
    const { reason, description } = req.body;
    const product = await Product.findById(req.params.id);
    if(!product) return res.status(404).json({ erreur: 'Produit introuvable' });
    
    if(product.vendeurId.toString() === req.user.id.toString()){
      return res.status(400).json({ erreur: 'Vous ne pouvez pas signaler votre propre article' });
    }

    const report = await Report.create({
      produitId: req.params.id,
      vendeurId: product.vendeurId,
      reporterId: req.user.id,
      reason,
      description
    });

    // Optionnel: si 3 signalements -> masque le produit auto
    const count = await Report.countDocuments({ produitId: req.params.id });
    if(count >= 3){
      await Product.findByIdAndUpdate(req.params.id, { statut: 'suspended' });
    }

    res.json({ success: true, report });
  } catch(e){
    if(e.code === 11000) return res.status(400).json({ erreur: 'Déjà signalé' });
    res.status(500).json({ erreur: e.message });
  }
});

// Pour admin voir les signalements
router.get('/reports', authAdmin, async (req, res) => {
  const reports = await Report.find().populate('produitId').sort({ createdAt: -1 });
  res.json(reports);
});

router.get('/product-image/:id/:index', async (req, res) => {
  try {
    const p = await mongoose.model('Produit').findById(req.params.id).lean();
    if (!p ||!p.images?.[req.params.index]) return res.status(404).end();

    let img = p.images[req.params.index];
    if (!img.startsWith('data:')) {
      // Si c'est déjà une URL https, ne REDIRIGE PAS pour Facebook, télécharge
      return res.redirect(302, img);
    }

    const base64Data = img.split('base64,')[1];
    const inputBuffer = Buffer.from(base64Data, 'base64');

    // Facebook exige 1200x630 minimum, ratio 1.91:1
    const outputBuffer = await sharp(inputBuffer)
     .resize(1200, 630, { fit: 'cover' })
     .jpeg({ quality: 80 })
     .toBuffer();

    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Length': outputBuffer.length,
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(outputBuffer);

  } catch (e) {
    console.error(e);
    res.status(500).end();
  }
});

router.get('/share/:id', async (req, res) => {
  try {
    const p = await mongoose.model('Produit').findById(req.params.id).lean();
    if (!p) return res.status(404).send('introuvable');

    const DOMAIN = 'https://unipay-production-d2a0.up.railway.app';
    // CRITIQUE : og:url doit être EXACTEMENT l'URL partagée
    const shareUrl = `${DOMAIN}/api/marketplace/share/${p._id}`;
    const ogImageUrl = `${DOMAIN}/api/marketplace/product-image/${p._id}/0`;

    const titre = `${p.titre}`.replace(/"/g,'');
    const description = `${p.description?.slice(0,200) || 'Sur UniPay Market'}`.replace(/"/g,'').replace(/\n/g,' ');

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<meta property="og:type" content="website" />
<meta property="og:site_name" content="UniPay" />
<meta property="og:title" content="${titre} - ${Number(p.prix).toLocaleString()} FCFA" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${shareUrl}" />
<meta property="og:image" content="${ogImageUrl}" />
<meta property="og:image:secure_url" content="${ogImageUrl}" />
<meta property="og:image:type" content="image/jpeg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
</head><body>
<img src="${ogImageUrl}" />
<h1>${titre}</h1>
<script>
if(!/facebookexternalhit|WhatsApp|Twitterbot|Facebot/i.test(navigator.userAgent)){
  location.href="unipay://market/${p._id}";
}
</script>
</body></html>`;

    res.set('Content-Type','text/html; charset=utf-8').send(html);
  } catch(e){ res.status(500).send('err'); }
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
    
    // Tous les clients rejetés / bloqués
    const bloqueIdsObj = await Client.find({ 
      $or: [
        { verificationStatus: 'rejete' },
        { bloque: true }
      ]
    }).distinct('_id');

    const bloqueIds = [
      ...bloqueIdsObj,
      ...bloqueIdsObj.map(id => id.toString())
    ];

    const filter = { 
      statut: 'actif',
      vendeurId: { $nin: bloqueIds }
    };
    
    if(req.query.categorie && req.query.categorie!== 'Tous') {
      filter.categorie = req.query.categorie;
    }

    let produits = [];
    if (sortType === 'random') {
      produits = await mongoose.model('Produit').aggregate([
        { $match: filter },
        { $sample: { size: limit * 3 } },
        { $skip: skip % 60 },
        { $limit: limit }
      ]);
    } else {
      produits = await mongoose.model('Produit').find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
    }
    
    const total = await mongoose.model('Produit').countDocuments(filter);
    res.json({ produits, hasMore: skip + produits.length < total, total });
  } catch (e) { 
    console.log(e);
    res.status(500).json({ erreur: e.message }); 
  }
});
// Suppression DEFINITIVE
router.delete('/products/:id/hard', verifyToken, async (req,res)=>{
  try{
    const userId = getUserId(req);
    const prod = await Produit.findById(req.params.id);
    if(!prod) return res.status(404).json({erreur:'Introuvable'});
    if(prod.vendeurId.toString() !== userId.toString()){
      return res.status(403).json({erreur:'Pas autorisé'});
    }
    await Produit.findByIdAndDelete(req.params.id);
    res.json({ message: 'Supprimé définitivement' });
  }catch(e){ res.status(500).json({erreur:e.message}); }
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
  try {
    const userId = getUserId(req);
    const commande = await Commande.findById(req.params.id).populate('produit');
    if (!commande) return res.status(404).json({ erreur: 'Commande introuvable' });
    if (commande.acheteurId.toString() !== userId.toString()) return res.status(403).json({ erreur: 'Seul acheteur peut confirmer' });
    if (commande.statut === 'confirme') return res.status(400).json({ erreur: 'Déjà confirmée' });

    const vendeur = await Utilisateur.findById(commande.vendeurId);
    const acheteur = await Utilisateur.findById(commande.acheteurId);
    if (!vendeur || !acheteur) return res.status(404).json({ erreur: 'Vendeur ou acheteur introuvable' });

    const totalPaye = commande.total || commande.prix;
    const frais = Math.round(totalPaye * 0.02);
    const netVendeur = totalPaye - frais;

    // 1. Débloque argent VENDEUR + on récupère les soldes AVANT
    const soldeAcheteurAvant = acheteur.solde || 0;
    vendeur.solde = (vendeur.solde || 0) + netVendeur;
    await vendeur.save();

    // 2. Commission admin
    const admin = await Utilisateur.findOne({ telephone: '+22670000000' });
    if (admin) {
      admin.solde = (admin.solde || 0) + frais;
      await admin.save();
    }

    // 3. Update commande
    commande.statut = 'confirme';
    commande.dateConfirmation = new Date();
    await commande.save();

    // 4. Log transaction UNIQUE avec les 2 soldes
    try {
      const Transaction = mongoose.model('Transaction');
      await Transaction.create({
        expediteur: acheteur._id,           // acheteur
        destinataire: vendeur._id,          // vendeur
        type: 'vente',
        montant: totalPaye,
        montantNet: totalPaye,
        montantNetRecu: netVendeur,
        frais: frais,
        fraisDestinataire: frais,
        status: 'validee',
        motif: `Vente ${commande.quantite||1}x ${commande.produit?.titre||''}`,
        commandeId: commande._id,
        produitId: commande.produitId || commande.produit?._id,
        // === ICI LES SOLDES ===
        soldeExpediteurApres: soldeAcheteurAvant, // solde acheteur (n'a pas changé à la confirmation, il a payé avant)
        soldeDestinataireApres: vendeur.solde,    // solde vendeur APRES crédit
        expediteurNom: `${acheteur.prenom} ${acheteur.nom}`,
        destinataireNom: `${vendeur.prenom} ${vendeur.nom}`,
        adminId: admin?._id
      });
    } catch(e){ console.log('Tx log ignore', e.message); }

    if (global.io) global.io.emit('commande_update', commande);

    res.json({ 
      succes: true, 
      message: `${netVendeur.toLocaleString()} FCFA débloqués`,
      commande,
      detail: { total: totalPaye, frais, netVendeur, soldeVendeurApres: vendeur.solde, soldeAcheteurApres: soldeAcheteurAvant }
    });

  } catch (e) {
    console.error('CONFIRM ERROR:', e);
    res.status(500).json({ erreur: e.message });
  }
});
router.post('/orders/:id/confirmm', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const commande = await Commande.findById(req.params.id);
    if (!commande) return res.status(404).json({ erreur: 'Commande introuvable' });
    if (commande.acheteurId.toString() !== userId.toString()) return res.status(403).json({ erreur: 'Seul acheteur peut confirmer' });
    if (commande.statut === 'confirme') return res.status(400).json({ erreur: 'Déjà confirmée' });

    const vendeur = await Utilisateur.findById(commande.vendeurId);
    const acheteur = await Utilisateur.findById(commande.acheteurId);
    if (!vendeur) return res.status(404).json({ erreur: 'Vendeur introuvable' });

    const totalPaye = commande.total || commande.prix;
    const frais = Math.round(totalPaye * 0.02);
    const netVendeur = totalPaye - frais;

    // 1. Débloque argent
    vendeur.solde = (vendeur.solde || 0) + netVendeur;
    await vendeur.save();

    // 2. Commission admin (optionnel)
    const admin = await Utilisateur.findOne({ telephone: '+22670000000' });
    if (admin) {
      admin.solde = (admin.solde || 0) + frais;
      await admin.save();
    }

    // 3. Update commande
    commande.statut = 'confirme';
    commande.dateConfirmation = new Date();
    await commande.save();

    // 4. Log transaction - CORRIGÉ SANS SESSION
    try {
      const Transaction = mongoose.model('Transaction');
      await Transaction.create({
        expediteur: acheteur?._id,
        destinataire: vendeur._id,
        montant: totalPaye,
        frais: frais,
        type: 'vente',
        status: 'validee',
        motif: `Vente ${commande.quantite||1}x ${commande.produit?.titre||''}`,
        commandeId: commande._id
      });
    } catch(e){ console.log('Tx log ignore', e.message); }

    if (global.io) global.io.emit('commande_update', commande);

    res.json({ 
      succes: true, 
      message: `${netVendeur.toLocaleString()} FCFA débloqués`,
      commande,
      detail: { total: totalPaye, frais, netVendeur }
    });

  } catch (e) {
    console.error('CONFIRM ERROR:', e);
    res.status(500).json({ erreur: e.message });
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
