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

// ===================== 0. ROUTES PUBLIQUES POUR WHATSAPP (DOIVENT ETRE EN HAUT) =====================

// Sert ton base64 en https:// pour que WhatsApp l'affiche
// REMPLACE product-image PAR CECI - VERSION QUI MARCHE SANS SHARP
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
    if (!p) return res.status(404).send('<h1>Produit introuvable - UniPay</h1>');

    const productId = req.params.id;
    const API_DOMAIN = 'https://unipay-production-d2a0.up.railway.app';
    const PUBLIC_DOMAIN = 'https://unipay-production-d2a0.up.railway.app'; // change si tu as un domaine custom
    
    // Image https qui sert ton base64
    const ogImageUrl = `${API_DOMAIN}/api/marketplace/product-image/${productId}/0`;
    const pageUrl = `${PUBLIC_DOMAIN}/product/${productId}`;
    const appDeepLink = `unipay://market/${productId}`;
    const playStoreLink = 'https://play.google.com/store/apps/details?id=com.abdallahtech.uniPay&pcampaignid=web_share';

    const titre = `${p.titre} - ${Number(p.prix).toLocaleString()} FCFA | UniPay Market`;
    const prixTexte = `${Number(p.prix).toLocaleString()} FCFA`;
    const description = `${p.description?.slice(0,150) || 'Article disponible sur UniPay Market'} - Vendu par ${p.vendeurNom} à ${p.ville}. Paiement sécurisé avec UniPay Wallet Burkina.`;

    const ua = req.headers['user-agent'] || '';
    const isBot = /WhatsApp|facebookexternalhit|Twitterbot|LinkedInBot|TelegramBot/i.test(ua);

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${p.titre} - UniPay Market Burkina Faso</title>
<!-- OG POUR WHATSAPP - CRITIQUE -->
<meta property="og:type" content="product" />
<meta property="og:site_name" content="UniPay Burkina" />
<meta property="og:title" content="${p.titre} - ${prixTexte}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${ogImageUrl}" />
<meta property="og:image:secure_url" content="${ogImageUrl}" />
<meta property="og:image:type" content="image/jpeg" />
<meta property="og:image:width" content="800" />
<meta property="og:image:height" content="800" />
<meta property="og:url" content="${pageUrl}" />
<meta property="og:locale" content="fr_BF" />
<meta property="product:price:amount" content="${p.prix}" />
<meta property="product:price:currency" content="XOF" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${p.titre} - ${prixTexte}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${ogImageUrl}" />
<style>
body{font-family:system-ui;background:#FFFBF0;margin:0;color:#3E2723}
.wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#fff;border-radius:24px;padding:24px;max-width:420px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.12);border:1px solid #F0E6C8;text-align:center}
.card img{width:100%;border-radius:16px;max-height:360px;object-fit:cover;background:#f5f5f5}
.price{font-size:26px;font-weight:900;color:#2E7D32;margin:12px 0 4px}
.badge{display:inline-block;background:#EAF4E2;color:#2E7D32;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:800;margin-bottom:10px}
.btn{background:#4A5D23;color:#fff;padding:16px 20px;border-radius:14px;text-decoration:none;display:block;font-weight:900;margin-top:16px}
.btn2{background:#fff;color:#4A5D23;border:2px solid #4A5D23;padding:14px 20px;border-radius:14px;display:block;font-weight:800;margin-top:10px;text-decoration:none}
.small{font-size:12px;color:#8D7A5A;margin-top:14px;line-height:1.4}
</style>
${!isBot?`<script>
setTimeout(()=>{ window.location.href="${appDeepLink}"; }, 900);
setTimeout(()=>{ window.location.href="${playStoreLink}"; }, 2800);
</script>`:''}
</head><body>
<div class="wrap"><div class="card">
<div class="badge">🛒 UniPay Market • Paiement Wallet Sécurisé Burkina</div>
<img src="${ogImageUrl}" alt="${p.titre}" />
<h1 style="font-size:20px;margin:14px 0 4px">${p.titre}</h1>
<div class="price">${prixTexte}</div>
<p style="color:#8D7A5A;font-size:13px;margin:0">${p.ville} • Vendeur: ${p.vendeurNom}</p>
<p style="background:#FFFBF0;padding:12px;border-radius:12px;font-size:14px;text-align:left;margin-top:14px">${p.description || ''}</p>
<p style="font-size:12px;color:#2E7D32;background:#EAF4E2;padding:8px;border-radius:8px">🔍 Recherche par image IA • 💰 Paiement sécurisé UniPay • Livraison partout au Burkina</p>
<a href="${appDeepLink}" class="btn">Ouvrir dans l'application UniPay</a>
<a href="${playStoreLink}" class="btn2">📲 Télécharger UniPay - Gratuit sur Play Store</a>
<p class="small">UniPay est le porte-monnaie mobile et marketplace 100% Burkinabè. Envoyez, recevez, achetez en toute sécurité sans frais cachés.<br><br><b>unipayburkina.com</b> • Support: +226 70 87 94 25</p>
</div></div>
</body></html>`;
    res.set('Content-Type','text/html; charset=utf-8').set('Cache-Control','public, max-age=3600').send(html);
  } catch(e){ console.log(e); res.status(500).send('Erreur UniPay Market'); }
});

// ===================== 1. SERVICES LIVREURS =====================
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

    const produit = await mongoose.model('Produit').create({
      titre: req.body.titre,
      description: req.body.description,
      prix: Number(req.body.prix),
      images: req.body.images || [], // BASE64 GARDÉ POUR IA
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
router.get('/products', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 2;
    const skip = (page - 1) * limit;
    const sortType = req.query.sort || 'recent'; // recent | random

    const filter = { statut: 'actif' };
    if(req.query.categorie && req.query.categorie!== 'Tous') filter.categorie = req.query.categorie;

    let produits = [];

    if (sortType === 'random') {
      // Mélange aléatoire côté MongoDB - pas de doublon par page grâce à $sample
      // On fait un random journalier pour éviter de revoir les mêmes articles si on refresh vite
      const seed = Math.floor(Date.now() / (1000*60*60*6)); // change toutes les 6h
      produits = await mongoose.model('Produit').aggregate([
        { $match: filter },
        { $sample: { size: limit * 3 } }, // prend 60 au hasard
        { $skip: skip % 60 }, // simule pagination dans le sample
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

    res.json({
      produits,
      hasMore: skip + produits.length < total,
      total
    });
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
    p.prix = req.body.prix ? Number(req.body.prix) : p.prix;
    p.categorie = req.body.categorie ?? p.categorie;
    p.ville = req.body.ville ?? p.ville;
    if(req.body.images && Array.isArray(req.body.images)) p.images = req.body.images;
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

// ===================== 3. COMMANDES =====================
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
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userId = getUserId(req);
    const CommandeModel = mongoose.model('Commande');
    const Transaction = mongoose.model('Transaction');
    const Message = mongoose.models.Message;
    const commande = await CommandeModel.findById(req.params.id).session(session);
    if (!commande) throw new Error('Commande introuvable');
    if (commande.acheteurId.toString()!== userId) throw new Error('Seul l\'acheteur peut confirmer');
    if (commande.statut === 'confirme') throw new Error('Déjà confirmée');
    if (commande.statut!== 'livre' && commande.statut!== 'paye') throw new Error('La commande doit être livrée avant confirmation');
    const produit = await mongoose.model('Produit').findById(commande.produitId).session(session);
    const vendeur = await Utilisateur.findById(commande.vendeurId).session(session);
    const acheteur = await Utilisateur.findById(commande.acheteurId).session(session);
    const admin = await Utilisateur.findOne({ telephone: '+22670000000' }).session(session);
    if (!vendeur ||!acheteur) throw new Error('Utilisateur introuvable');
    const prix = Number(commande.prix);
    const frais = Math.round(prix * 0.02);
    const netVendeur = prix - frais;
    vendeur.solde = (vendeur.solde || 0) + netVendeur;
    if (admin) admin.solde = (admin.solde || 0) + frais;
    commande.statut = 'confirme';
    commande.dateConfirmation = new Date();
    await vendeur.save({ session });
    if (admin) await admin.save({ session });
    await commande.save({ session });
    const [txAchat, txVente] = await Transaction.create([{
        expediteur: acheteur._id, destinataire: vendeur._id, montant: prix, frais: frais,
        montantNetRecu: netVendeur, montantNet: prix, type: 'achat', status: 'validee',
        motif: `${produit?.titre}`, produitId: produit?._id, commandeId: commande._id,
        soldeExpediteurApres: acheteur.solde, soldeDestinataireApres: acheteur.solde,
        contact: { prenom: vendeur.prenom, nom: vendeur.nom, telephone: vendeur.telephone }
      },{
        expediteur: acheteur._id, destinataire: vendeur._id, montant: prix, frais: frais,
        montantNetRecu: netVendeur, montantNet: netVendeur, type: 'vente', status: 'validee',
        motif: `${produit?.titre}`, produitId: produit?._id, commandeId: commande._id,
        soldeExpediteurApres: vendeur.solde, soldeDestinataireApres: vendeur.solde,
        contact: { prenom: acheteur.prenom, nom: acheteur.nom, telephone: acheteur.telephone }
      }], { session });
    await session.commitTransaction(); session.endSession();
    setImmediate(async () => {
      try {
        const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const vendeurIdStr = vendeur._id.toString(); const acheteurIdStr = acheteur._id.toString();
        const msgVendeur = { id: Date.now().toString() + '_v', type: 'text', text: `✅ VENTE CONFIRMÉE!\nL'acheteur a confirmé la réception de "${produit?.titre}".\n\n💰 ${netVendeur.toLocaleString()} FCFA crédités`, from: acheteurIdStr, to: vendeurIdStr, time, timestamp: Date.now(), status: 'sent', contactMeta: { _id: acheteurIdStr, prenom: acheteur.prenom, nom: acheteur.nom, telephone: acheteur.telephone, photoProfil: acheteur.photoProfil }, tx: {...txVente._doc, type: 'vente_confirmee' } };
        const msgAcheteur = { id: Date.now().toString() + '_a', type: 'text', text: `🙏 Merci pour ta confirmation!\nTu as confirmé la réception de "${produit?.titre}".`, from: vendeurIdStr, to: acheteurIdStr, time, timestamp: Date.now(), status: 'sent', contactMeta: { _id: vendeurIdStr, prenom: vendeur.prenom, nom: vendeur.nom, telephone: vendeur.telephone, photoProfil: vendeur.photoProfil }, tx: {...txAchat._doc, type: 'achat_confirme' } };
        if (Message) await Message.create([msgVendeur, msgAcheteur]);
        if (global.io) { global.emitToUser(vendeurIdStr, 'new_message', msgVendeur); global.emitToUser(acheteurIdStr, 'new_message', msgAcheteur); }
      } catch (e) { console.error('Erreur post-confirmation:', e.message); }
    });
    res.json({ succes: true, message: `Achat confirmé! ${netVendeur.toLocaleString()}F versés au vendeur`, commande, transaction: txAchat, detail: { prix, frais, netVendeur } });
  } catch (e) {
    if (session.inTransaction()) await session.abortTransaction(); session.endSession();
    console.error('Erreur confirm:', e.message); res.status(400).json({ erreur: e.message });
  }
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
    commande.statut = 'livre'; await commande.save(); res.json(commande);
  } catch (e) { res.status(500).json({ erreur: e.message }); }
});

module.exports = router;
