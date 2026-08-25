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
//les livreurs
router.get('/services', (req,res)=>{
  res.json([
    { _id: '6a59ee853dfa6cb478f7e2d3', nom: 'unipay Express', ville: 'Ouagadougou', prix: 1000, note: '4.9', telephone: '+22675322321' },
    { _id: 'liv2', nom: 'Rapide BF', ville: 'Ouagadougou', prix: 1500, note: '4.8' },
    { _id: 'liv3', nom: 'Bobo Livraison', ville: 'Bobo-Dioulasso', prix: 2000, note: '4.7' },
  ]);
});
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
    const admin = await Utilisateur.findOne({ telephone: '+22670000000' }).session(session); // compte frais

    if (!vendeur ||!acheteur) throw new Error('Utilisateur introuvable');

    // Calculs
    const prix = Number(commande.prix);
    const fraisRate = 0.02;
    const frais = Math.round(prix * fraisRate);
    const netVendeur = prix - frais;

    // Mouvements de fonds
    vendeur.solde = (vendeur.solde || 0) + netVendeur;
    if (admin) admin.solde = (admin.solde || 0) + frais;
    commande.statut = 'confirme';
    commande.dateConfirmation = new Date();

    await vendeur.save({ session });
    if (admin) await admin.save({ session });
    await commande.save({ session });

    // Historique transaction achat
   const [tx] = await Transaction.create([{
      expediteur: acheteur._id,
      destinataire: vendeur._id,
      montant: prix,
      frais: frais,
      montantNetRecu: netVendeur,
      montantNet: netVendeur,
      type: 'achat', // ✅ maintenant autorisé
      status: 'validee',
      motif: `Achat confirmé: ${produit?.titre} #${commande._id.toString().slice(-6)}`,
      produitId: produit?._id,
      commandeId: commande._id,
      adminId: admin?._id,
      soldeExpediteurApres: acheteur.solde,
      soldeDestinataireApres: vendeur.solde,
    }], { session });

    await session.commitTransaction();
    session.endSession();

    // === NOTIFICATIONS + CHAT HORS TRANSACTION ===
    setImmediate(async () => {
      try {
        const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const vendeurIdStr = vendeur._id.toString();
        const acheteurIdStr = acheteur._id.toString();

        // 1. Messages chat pour les deux
        const msgVendeur = {
          id: Date.now().toString() + '_v',
          type: 'text',
          text: `✅ VENTE CONFIRMÉE!\nL'acheteur a confirmé la réception de "${produit?.titre}".\n\n💰 ${netVendeur.toLocaleString()} FCFA crédités sur ton solde (frais 2%: ${frais.toLocaleString()}F)\nCommande #${commande._id.toString().slice(-6)}`,
          from: acheteurIdStr,
          to: vendeurIdStr,
          time,
          timestamp: Date.now(),
          status: 'sent',
          contactMeta: { _id: acheteurIdStr, prenom: acheteur.prenom, nom: acheteur.nom, telephone: acheteur.telephone, photoProfil: acheteur.photoProfil },
          tx: {...tx._doc, type: 'vente_confirmee' }
        };

        const msgAcheteur = {
          id: Date.now().toString() + '_a',
          type: 'text',
          text: `🙏 Merci pour ta confirmation!\nTu as confirmé la réception de "${produit?.titre}". Le vendeur a été payé.`,
          from: vendeurIdStr,
          to: acheteurIdStr,
          time,
          timestamp: Date.now(),
          status: 'sent',
          contactMeta: { _id: vendeurIdStr, prenom: vendeur.prenom, nom: vendeur.nom, telephone: vendeur.telephone, photoProfil: vendeur.photoProfil },
          tx: {...tx._doc, type: 'achat_confirme' }
        };

        if (Message) await Message.create([msgVendeur, msgAcheteur]);

        if (global.io) {
          global.emitToUser(vendeurIdStr, 'new_message', msgVendeur);
          global.emitToUser(acheteurIdStr, 'new_message', msgAcheteur);
        }

        // 2. Push Notification forcée
        const { Expo } = require('expo-server-sdk');
        const expo = new Expo();

        for (const user of [vendeur, acheteur]) {
          if (user.expoPushToken && Expo.isExpoPushToken(user.expoPushToken)) {
            const isVendeur = user._id.toString() === vendeurIdStr;
            await expo.sendPushNotificationsAsync([{
              to: user.expoPushToken,
              sound: 'default',
              title: isVendeur? '✅ Vente confirmée!' : '📦 Achat confirmé',
              body: isVendeur
               ? `${netVendeur.toLocaleString()}F crédités pour "${produit?.titre}"`
                : `Merci! Vente de "${produit?.titre}" finalisée`,
              data: {
                url: `/orders/${commande._id}`,
                type: 'marketplace',
                commandeId: commande._id.toString(),
                transactionId: tx._id.toString()
              },
              channelId: 'orders'
            }]);
          }
        }

        console.log(`✅ Confirmation commande ${commande._id} notifiée`);

      } catch (e) {
        console.error('Erreur post-confirmation:', e.message);
      }
    });

    res.json({
      succes: true,
      message: `Achat confirmé! ${netVendeur.toLocaleString()}F versés au vendeur`,
      commande,
      transaction: tx,
      detail: { prix, frais, netVendeur }
    });

  } catch (e) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    console.error('Erreur confirm:', e.message);
    res.status(400).json({ erreur: e.message });
  }
});
router.post('/orders/:id/confirmm', verifyToken, async (req, res) => {
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
