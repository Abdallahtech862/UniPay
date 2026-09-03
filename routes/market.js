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
router.get('productt-image/:id/:index', async (req, res) => {
  try {
    const p = await mongoose.model('Produit').findById(req.params.id).lean();
    if (!p ||!p.images?.[req.params.index]) return res.status(404).send('no image');

    let img = p.images[req.params.index];
    // si tu stockes en data:image/jpeg;base64,....
    if (img.includes('base64,')) {
      const base64 = img.split('base64,')[1];
      const buffer = Buffer.from(base64, 'base64');
      res.set({
        'Content-Type': 'image/jpeg',
        'Content-Length': buffer.length,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*'
      });
      return res.send(buffer);
    } else {
      // si c'est une URL http, redirige pas, télécharge et renvoie
      return res.redirect(img);
    }
  } catch(e) {
    res.status(500).send('error image');
  }
});

router.get('/product-image/:id/:index', async (req, res) => {
  try {
    console.log('IMAGE REQ', req.params.id, req.params.index);
    const p = await mongoose.model('Produit').findById(req.params.id).lean();
    if (!p) {
      console.log('Produit not found');
      return res.status(404).send('Produit not found');
    }
    if (!p.images || !p.images[req.params.index]) {
      console.log('Image index not found, images length:', p.images?.length);
      return res.status(404).send('Image index not found');
    }
    
    let img = p.images[req.params.index];
    console.log('Image type:', typeof img, 'start:', img.substring(0,30));

    // Si déjà https
    if (!img.startsWith('data:')) {
      return res.redirect(img);
    }

    const matches = img.match(/^data:(.+);base64,(.+)$/);
    if (!matches) {
      console.log('Bad base64 format');
      return res.status(400).send('Bad base64');
    }
    
    const mime = matches[1]; // image/jpeg
    const base64Data = matches[2];
    console.log('MIME:', mime, 'base64 length:', base64Data.length);

    const buffer = Buffer.from(base64Data, 'base64');
    console.log('Buffer size:', buffer.length);

    res.set('Content-Type', mime);
    res.set('Content-Length', buffer.length);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(buffer);

  } catch (e) { 
    console.error('IMAGE ERROR FULL:', e);
    res.status(500).send(`err: ${e.message}`);
  }
});

// Page de partage avec Open Graph - C'EST CETTE URL QUE TU PARTAGES SUR WHATSAPP
// Ex: https://kori2-railway-production.up.railway.app/api/marketplace/share/ID
router.get('/share/:id', async (req, res) => {
  try {
    const p = await mongoose.model('Produit').findById(req.params.id).lean();
    if (!p) return res.status(404).send('Produit introuvable');

    const API_DOMAIN = 'https://unipay-production-d2a0.up.railway.app';
    const ogImageUrl = `${API_DOMAIN}/api/marketplace/product-image/${p._id}/0`;

    const titre = `${p.titre} - ${Number(p.prix).toLocaleString()} FCFA`;
    const description = `${p.description?.slice(0,147) || 'Disponible sur UniPay Market'}...`;

    // Facebook exige 1200x630 minimum pour large
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta property="fb:app_id" content="123456789" />
<meta property="og:type" content="product" />
<meta property="og:site_name" content="UniPay" />
<meta property="og:title" content="${titre.replace(/"/g,'')}" />
<meta property="og:description" content="${description.replace(/"/g,'')}" />
<meta property="og:url" content="${API_DOMAIN}/share/${p._id}" />
<meta property="og:image" content="${ogImageUrl}" />
<meta property="og:image:secure_url" content="${ogImageUrl}" />
<meta property="og:image:type" content="image/jpeg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${p.titre}" />
<meta property="product:price:amount" content="${p.prix}" />
<meta property="product:price:currency" content="XOF" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${ogImageUrl}" />

<title>${titre}</title>
</head>
<body>
<script>
  var ua = navigator.userAgent;
  if(!/facebookexternalhit|WhatsApp|Twitterbot/i.test(ua)){
    window.location.href = "unipay://market/${p._id}";
    setTimeout(()=>{ window.location.href="https://play.google.com/store/apps/details?id=com.abdallahtech.uniPay"; }, 1500);
  }
</script>
<img src="${ogImageUrl}" style="max-width:100%" />
<h1>${p.titre} - ${Number(p.prix).toLocaleString()} FCFA</h1>
</body></html>`;

    res.set('Content-Type','text/html; charset=utf-8').send(html);
  } catch(e){ res.status(500).send('erreur'); }
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
