const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { Expo } = require('expo-server-sdk');
const expo = new Expo();
const User = require('./models/Client');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// DOSSIER UPLOAD - UNE SEULE FOIS
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, Date.now() + '-' + Math.random().toString(36).substring(7) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });
const videoUpload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.use('/uploads', express.static(uploadDir));

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url });
});

app.post('/api/upload/video', videoUpload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ erreur: 'Pas de fichier' });
  const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  console.log('✅ Vidéo uploadée:', url);
  res.json({ url });
});
// ================== SCHÉMAS ET MODÈLES MONGOOSE ==================
const { Schema } = mongoose;

// Model Chat
const MessageSchema = new Schema({
  id: String,
  from: { type: String, required: true },
  to: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['text','image','audio','pdf','product','location','video'],
    default: 'text' 
  },
  text: String,
  content: String,
  image: String,
  video: String,
  audio: String,
  product: { type: Object },
  productId: String,
  location: { type: Object, default: null },
  latitude: Number,
  longitude: Number,
  address: String,
  status: { type: String, enum: ['sent','delivered','read'], default: 'sent' },
  createdAt: { type: Date, default: Date.now },
  tx: { type: Object },
  contactMeta: { type: Object }
}, { strict: false });
const Message = mongoose.model('Message', MessageSchema);

// Model Marketplace - Produit
const ProductSchema = new Schema({
  vendeurId: { type: String, required: true },
  vendeurNom: String,
  vendeurTel: String,
  vendeurPhoto: String,
  titre: { type: String, required: true },
  vues: { type: Number, default: 0 },
  vendeurVerifie: { type: Boolean, default: false },
  description: String,
  prix: { type: Number, required: true },
  images: [String],
  categorie: String,
  ville: String,
  stock: { type: Number, default: 1 },
  statut: { type: String, default: 'actif' }, // 'actif', 'vendu', 'suspendu'
  createdAt: { type: Date, default: Date.now }
});

const Produit = mongoose.model('Produit', ProductSchema);

// Model Marketplace - Commande
// Model Marketplace - Commande
const OrderSchema = new Schema({
  produitId: { type: Schema.Types.ObjectId, ref: 'Produit', required: true },
  acheteurId: { type: String, required: true },
  vendeurId: { type: String, required: true },
  prix: { type: Number, required: true }, // prix unitaire
  quantite: { type: Number, required: true, default: 1 }, // <-- AJOUTE ÇA
  frais: { type: Number, default: 0 },
  total: { type: Number, required: true }, // prix * quantite
  statut: { type: String, default: 'paye' },
  adresseLivraison: String,
  dateLivraison: Date,
  dateConfirmation: Date,
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const Commande = mongoose.model('Commande', OrderSchema);

// Exporter les modèles pour qu'ils soient réutilisables dans les fichiers routes si besoin
module.exports = { Message, Produit, Commande };

// ... garde le reste de ton fichier à partir de SCHÉMAS ET MODÈLES MONGOOSE
app.use('/api/legal', require('./routes/legal'));
app.use('/product', require('./routes/deeplink'));
app.use('/.well-known', require('./routes/well-known'));
app.use('/apple-app-site-association', (req, res) => {
  res.redirect('/.well-known/apple-app-site-association');
});
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/cards', require('./routes/cards'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/rechargeWallet', require('./routes/rechargeWallet'));
app.use('/api/pawapay', require('./routes/pawapay'));

// AJOUT DE LA ROUTE MARKETPLACE :
app.use('/api/marketplace', require('./routes/market'));


// ================== SOCKET.IO & SERVEUR HTTP ==================
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 10e6
});
global.io = io;
global.onlineUsers = new Map();

// Fonction globale pour émettre un événement à un utilisateur spécifique
const emitToUser = (userId, event, data) => {
  if (!userId) return;
  const sockets = global.onlineUsers.get(userId.toString());
  if (!sockets) return;
  if (sockets instanceof Set) sockets.forEach(sid => global.io.to(sid).emit(event, data));
  else global.io.to(sockets).emit(event, data);
};
global.emitToUser = emitToUser;

io.on('connection', (socket) => {
  console.log('Socket connecté:', socket.id);

  socket.on('user_online', async ({ userId }) => {
    if (!userId) return;
    const uid = userId.toString();
    if (!global.onlineUsers.has(uid)) global.onlineUsers.set(uid, new Set());
    const ex = global.onlineUsers.get(uid);
    if (typeof ex === 'string') global.onlineUsers.set(uid, new Set([ex]));
    global.onlineUsers.get(uid).add(socket.id);
    socket.userId = uid;
    socket.broadcast.emit('user_status', { userId: uid, status: 'online' });

    try {
      const undelivered = await Message.find({ to: uid, status: { $in: ['sent','delivered'] } }).sort({ createdAt: 1 }).limit(200);
      for (const msg of undelivered) {
        socket.emit('new_message', msg);
        if (msg.status === 'sent') {
          msg.status = 'delivered';
          await msg.save();
          emitToUser(msg.from, 'message_status', { messageId: msg.id, status: 'delivered' });
        }
      }
    } catch (e) { console.error(e.message); }
  });

  socket.on('send_message', async (data) => {
    try {
      if (!data?.to ||!data?.from) return;
      console.log(`💬 ${data.from} -> ${data.to} [${data.type}]`);

      // 1. Sauvegarde en base
      await Message.create({
        id: data.id,
        from: data.from.toString(),
        to: data.to.toString(),
        type: data.type || 'text',
        text: data.text || data.content || '',
        content: data.content || data.text || '',
        image: data.image || '',
        video: data.video || '',
        audio: data.audio || '',
        location: data.location || (data.latitude ? { latitude: data.latitude, longitude: data.longitude, address: data.address } : null),
        latitude: data.location?.latitude || data.latitude || null,
        longitude: data.location?.longitude || data.longitude || null,
        address: data.location?.address || data.address || null,
        product: data.product || null,
        productId: data.productId || data.product?._id || '',
        status: 'sent',
        createdAt: new Date(data.timestamp || Date.now()),
        contactMeta: data.contactMeta || null,
        tx: data.tx || null
      });

      
      // 2. Envoie temps réel si online
      emitToUser(data.to.toString(), 'new_message', data);
      emitToUser(data.from.toString(), 'message_status', { messageId: data.id, status: 'sent' });

      // 3. FORCE L'ENVOI DU PUSH NOTIFICATION DANS LES DEUX CAS (Online ou Offline)
      console.log(`🔔 Déclenchement Push forcé pour ${data.to}...`);
      try {
        const recipient = await User.findById(data.to);

        if (recipient?.expoPushToken && Expo.isExpoPushToken(recipient.expoPushToken)) {
          const senderName = data.contactMeta? `${data.contactMeta.prenom || ''} ${data.contactMeta.nom || ''}`.trim() : 'UniPay';

          let body = data.text || data.content || '';
          if (data.type === 'image') body = '📷 Photo';
          if (data.type === 'video') body = '🎥 Vidéo';
          if (data.type === 'audio') body = '🎤 Vocal';
          if (data.type === 'pdf') body = '📄 Reçu UniPay';
          if (data.type === 'product') body = `🛍️ ${data.product?.titre || 'Article partagé'}`;
          if (data.type === 'location') body = '📍 Position partagée';
          if (data.type === 'video' && data.text && data.text !== '[🎥 Vidéo]') {
            body = `🎥 ${data.text}`.substring(0, 100);
          }

          const receipts = await expo.sendPushNotificationsAsync([{
            to: recipient.expoPushToken,
            sound: 'default',
            title: senderName || 'Nouveau message',
            body: body.substring(0, 100),
            icon: data.contactMeta?.photoProfil || undefined,
            mutableContent: true,
            data: {
              url: `/chat/${data.from?.toString()}`,
              from: data.from?.toString(),
              to: data.to?.toString(),
              type: data.type,
              messageId: data.id,
              senderPhoto: data.contactMeta?.photoProfil || ''
            },
            channelId: 'messages',
          }]);

          console.log(`📲 Push envoyé à ${data.to}`, receipts);
        } else {
          console.log('❌ Pas de expoPushToken valide pour', data.to);
        }
      } catch (pushError) {
        console.error('❌ Erreur Push:', pushError.message);
      }

    } catch (e) {
      console.error('Erreur send_message fatale:', e.message, e.stack);
    }
  });

  socket.on('message_delivered', async ({ from, messageId }) => {
    await Message.findOneAndUpdate({ id: messageId }, { status: 'delivered' });
    emitToUser(from, 'message_status', { messageId, status: 'delivered' });
  });

  socket.on('message_read', async ({ from, messageId }) => {
    await Message.findOneAndUpdate({ id: messageId }, { status: 'read' });
    emitToUser(from, 'message_status', { messageId, status: 'read' });
  });

  socket.on('typing', ({ to, state }) => {
    if (!to ||!socket.userId) return;
    if (to.toString() === socket.userId.toString()) return;
    emitToUser(to.toString(), 'typing', { from: socket.userId, state });
  });

  socket.on('disconnect', () => {
    if (socket.userId && global.onlineUsers.has(socket.userId)) {
      const userSockets = global.onlineUsers.get(socket.userId);
      if (userSockets instanceof Set) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          global.onlineUsers.delete(socket.userId);
          socket.broadcast.emit('user_status', { userId: socket.userId, status: 'offline' });
        }
      }
    }
  });
});

// ================== TA PAGE HTML + HEALTH ==================

const htmlll =String.raw `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>UniPay - Marketplace, Wallet, Messagerie & Cartes Visa Burkina</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Poppins', sans-serif; background: #FDF8EF; color: #6B4423; line-height: 1.6; }
  .unipay-wrap { min-height: 100vh; }
  .page { display: none; } .page.active { display: block; }
  .unipay-container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
  .unipay-nav { background: #FFFFFF; padding: 15px 0; box-shadow: 0 2px 10px rgba(107,68,35,0.05); position: sticky; top:0; z-index:100; }
  .unipay-nav-inner { display:flex; justify-content:space-between; align-items:center; }
  .unipay-nav-logo { font-size:24px; font-weight:700; color:#6B4423; cursor:pointer; }
  .unipay-nav-links a { color:#6B4423; text-decoration:none; margin-left:20px; font-weight:500; cursor:pointer; font-size:14px; }
  .unipay-btn { background:#E8D19A; color:#6B4423; padding:16px 32px; border-radius:12px; font-weight:600; text-decoration:none; display:inline-block; transition:0.3s; border:none; cursor:pointer; }
  .unipay-btn:hover { transform:translateY(-2px); box-shadow:0 8px 20px rgba(232,209,154,0.4); }
  .unipay-btn-outline { background:transparent; border:2px solid #6B4423; color:#6B4423; }
  .unipay-hero { padding:80px 0 60px; text-align:center; }
  .unipay-hero h1 { font-size:44px; font-weight:700; margin-bottom:20px; line-height:1.15; }
  .unipay-hero p { font-size:18px; color:#9C7E5C; margin-bottom:30px; max-width:700px; margin-left:auto; margin-right:auto; }
  .unipay-badge { background:#DDE5D9; color:#2E7D32; padding:8px 16px; border-radius:20px; font-size:12px; font-weight:700; display:inline-block; margin-bottom:20px; }
  .unipay-phone { background:#E8D19A; width:300px; height:620px; border-radius:40px; margin:50px auto 0; padding:15px; box-shadow:0 30px 80px rgba(107,68,35,0.2); }
  .unipay-phone-screen { background:#FDF8EF; width:100%; height:100%; border-radius:30px; overflow:hidden; }
  .unipay-header { padding:20px; display:flex; justify-content:space-between; align-items:center; }
  .unipay-logo { font-size:18px; font-weight:700; }
  .unipay-solde-box { padding:0 20px 15px; }
  .unipay-solde-label { font-size:11px; color:#9C7E5C; } .unipay-solde { font-size:30px; font-weight:700; }
  .unipay-qr-section { background:#fff; margin:0 15px 15px; padding:15px; border-radius:16px; text-align:center; }
  .unipay-qr-box img { width:100px; height:100px; margin:0 auto; display:block; }
  .unipay-actions { padding:0 15px; display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:15px; }
  .unipay-action-btn { background:#E8D19A; padding:10px 4px; border-radius:10px; text-align:center; font-size:11px; font-weight:600; }
  .unipay-action-btn.secondary { background:#DDE5D9; } .unipay-action-btn.outline { background:transparent; border:1.5px solid #6B4423; }
  .unipay-section-title { font-size:13px; font-weight:600; padding:0 15px; margin:10px 0 8px; }
  .unipay-carte { background:#E8D19A; margin:0 15px 8px; padding:12px; border-radius:12px; display:flex; justify-content:space-between; align-items:center; }
  .unipay-carte-type { font-size:10px; opacity:0.7; } .unipay-carte-numero { font-size:13px; font-weight:600; letter-spacing:1px; }
  .unipay-section { padding:80px 0; }
  .unipay-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:24px; margin-top:40px; }
  .unipay-feature { background:#fff; padding:30px 24px; border-radius:20px; border:1px solid #F0E6C8; }
  .unipay-icon { width:56px; height:56px; background:#DDE5D9; border-radius:14px; margin-bottom:16px; display:flex; align-items:center; justify-content:center; font-size:26px; }
  .unipay-feature h3 { font-size:18px; margin-bottom:10px; } .unipay-feature p { color:#9C7E5C; font-size:14px; }
  .unipay-market-box { background:#fff; border-radius:24px; padding:50px 30px; display:grid; grid-template-columns:1.1fr 0.9fr; gap:30px; align-items:center; border:1px solid #E8D19A; }
  .unipay-market-list { display:flex; flex-direction:column; gap:12px; }
  .unipay-market-item { background:#FDF8EF; padding:14px; border-radius:12px; display:flex; gap:12px; align-items:center; border:1px solid #F0E6C8; }
  .unipay-cta { padding:80px 0; text-align:center; background:#6B4423; color:#FDF8EF; }
  .unipay-footer { background:#FDF8EF; padding:60px 0 30px; border-top:1px solid #E8D19A; }
  .unipay-footer-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:30px; margin-bottom:30px; }
  .unipay-footer h4 { font-size:15px; font-weight:600; margin-bottom:12px; } .unipay-footer p,.unipay-footer a { color:#9C7E5C; font-size:13px; text-decoration:none; display:block; margin-bottom:6px; cursor:pointer; }
  .unipay-copyright { text-align:center; padding-top:20px; border-top:1px solid #E8D19A; color:#9C7E5C; font-size:12px; }
  .legal-page { padding:60px 0; } .legal-page h1 { font-size:32px; margin-bottom:20px; } .legal-page h2 { font-size:20px; margin:25px 0 12px; } .legal-page p,.legal-page li { color:#9C7E5C; margin-bottom:12px; line-height:1.7; font-size:14px; }
  @media (max-width:900px){ .unipay-market-box{grid-template-columns:1fr;} .unipay-hero h1{font-size:32px;} .unipay-nav-links{display:none;} }
</style>
</head>
<body>
<div class="unipay-wrap">
<nav class="unipay-nav">
  <div class="unipay-container">
    <div class="unipay-nav-inner">
      <div class="unipay-nav-logo" onclick="showPage('home')">UniPay</div>
      <div class="unipay-nav-links">
        <a onclick="showPage('home')">Accueil</a>
        <a href="#marketplace">Marketplace</a>
        <a href="#cartes">Cartes Visa</a>
        <a onclick="showPage('cgu')">CGU</a>
        <a onclick="showPage('confidentialite')">Confidentialité</a>
      </div>
    </div>
  </div>
</nav>

<div id="home" class="page active">
<section class="unipay-hero">
  <div class="unipay-container">
    <div class="unipay-badge">🛍️ NOUVEAU: Marketplace + Messagerie intégrée</div>
    <h1>Le super-app pour vendre, acheter, payer et discuter au Burkina</h1>
    <p>UniPay c'est le tout-en-un : un marketplace pour vendre tes produits, une messagerie pour parler aux clients, un wallet Mobile Money et des cartes Visa virtuelles & physiques pour payer partout.</p>
    <div>
      <a href="https://play.google.com/store/apps/details?id=com.abdallahtech.uniPay" class="unipay-btn">Télécharger sur Play Store</a>
      <a href="#marketplace" class="unipay-btn unipay-btn-outline" style="margin-left:10px;">Voir le Marketplace</a>
    </div>
    <div class="unipay-phone">
      <div class="unipay-phone-screen">
        <div class="unipay-header"><div style="width:28px;height:28px;background:#E8D19A;border-radius:8px;"></div><div class="unipay-logo">UniPay</div><div style="width:8px;height:8px;background:#2E7D32;border-radius:50%;"></div></div>
        <div class="unipay-solde-box"><div class="unipay-solde-label">Solde Wallet</div><div class="unipay-solde">47 500 F</div></div>
        <div class="unipay-qr-section"><img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=unipay://pay" alt="QR"></div>
        <div class="unipay-actions"><div class="unipay-action-btn">Payer</div><div class="unipay-action-btn outline">Recevoir</div><div class="unipay-action-btn secondary">Market</div><div class="unipay-action-btn">Chat</div></div>
        <div class="unipay-section-title">Mes cartes Visa</div>
        <div class="unipay-carte"><div><div class="unipay-carte-type">VIRTUELLE</div><div class="unipay-carte-numero">**** 4582</div></div><div style="font-size:10px;background:#fff;padding:4px 8px;border-radius:8px;">ACTIVE</div></div>
        <div class="unipay-carte" style="background:#6B4423;color:#FDF8EF;"><div><div style="font-size:10px;opacity:0.7;">PHYSIQUE</div><div style="font-size:13px;font-weight:600;letter-spacing:1px;color:#FDF8EF;">**** 9021</div></div><div>💳</div></div>
        <div class="unipay-section-title">Messages récents</div>
        <div style="padding:0 15px;display:flex;flex-direction:column;gap:8px;"><div style="background:#fff;padding:10px;border-radius:12px;font-size:12px;">🛍️ Abdoul - "Le téléphone est dispo ?" <span style="float:right;color:#2E7D32;">●</span></div><div style="background:#fff;padding:10px;border-radius:12px;font-size:12px;">💬 Boutique Faso Mode - "Commande expédiée"</div></div>
      </div>
    </div>
  </div>
</section>

<section class="unipay-section" id="marketplace" style="background:#fff;">
  <div class="unipay-container">
    <h2 style="font-size:36px;text-align:center;">Marketplace intégré + Messagerie</h2>
    <p style="text-align:center;color:#9C7E5C;max-width:700px;margin:10px auto 0;">Vends en ligne et en boutique. Chaque produit a son bouton Chat direct. Les clients te parlent sans quitter UniPay.</p>
    <div class="unipay-market-box" style="margin-top:50px;">
      <div>
        <h3 style="font-size:26px;margin-bottom:15px;">Vends partout, discute instantanément</h3>
        <p style="color:#9C7E5C;margin-bottom:20px;">Publie ton produit en 30s avec photos, prix, ville. Les acheteurs voient ton article et cliquent sur <b>Message</b>. La messagerie UniPay garde l'historique, les vocaux, photos, position GPS pour livraison.</p>
        <div class="unipay-market-list">
          <div class="unipay-market-item">📦 <b>Produits physiques & digitaux</b> - téléphones, vêtements, services</div>
          <div class="unipay-market-item">💬 <b>Chat acheteur-vendeur</b> - texte, audio, image, vidéo, localisation</div>
          <div class="unipay-market-item">📍 <b>Vente en magasin avec QR</b> - scan & paye sans cash</div>
          <div class="unipay-market-item">📄 <b>Reçus PDF automatiques</b> - preuve pour chaque transaction</div>
        </div>
      </div>
      <div style="background:#FDF8EF;border-radius:20px;padding:20px;border:1px dashed #E8D19A;">
        <div style="background:#fff;border-radius:16px;padding:12px;display:flex;gap:10;align-items:center;border:1px solid #F0E6C8;"><img src="https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100" style="width:60px;height:60px;border-radius:12px;object-fit:cover;"><div><div style="font-weight:700;font-size:14px;">Nike Air Max - 25 000 F</div><div style="font-size:11px;color:#9C7E5C;">Ouagadougou • Stock: 5</div><div style="background:#2E7D32;color:#fff;padding:4px 10px;border-radius:10px;font-size:10px;display:inline-block;margin-top:4px;">💬 Discuter avec vendeur</div></div></div>
        <div style="margin-top:15px;background:#E8D19A;padding:12px;border-radius:12px;font-size:12px;">✅ <b>Marché central + en ligne:</b> Même compte pour vendre sur ton étal et sur l'app. Recharge via Orange Money, Wave, Moov, Telecel, Coris, Sank.</div>
      </div>
    </div>
  </div>
</section>

<section class="unipay-section" id="cartes">
  <div class="unipay-container">
    <h2 style="text-align:center;font-size:36px;">Cartes Visa Virtuelle & Physique</h2>
    <p style="text-align:center;color:#9C7E5C;max-width:700px;margin:10px auto 40px;">Une seule app pour créer ta carte virtuelle instantanée et commander ta carte physique livrée à Ouaga, Bobo, et partout au Burkina.</p>
    <div class="unipay-grid">
      <div class="unipay-feature"><div class="unipay-icon">💳</div><h3>Visa Virtuelle Instantanée</h3><p>Crée en 2 min. Paye Netflix, Spotify, Facebook Ads, Amazon, Play Store, Apple Store. Recharge par Mobile Money.</p><p style="margin-top:10px;font-size:12px;background:#DDE5D9;padding:6px 10px;border-radius:8px;display:inline-block;">À partir de 1 000 F</p></div>
      <div class="unipay-feature"><div class="unipay-icon">🏧</div><h3>Visa Physique</h3><p>Commande dans l'app. Retrait GAB, paiement TPE dans tous les magasins. Plafond élevé, suivi en temps réel dans l'app + messagerie support.</p><p style="margin-top:10px;font-size:12px;background:#E8D19A;padding:6px 10px;border-radius:8px;display:inline-block;">Livraison 3-7 jours</p></div>
      <div class="unipay-feature"><div class="unipay-icon">🔒</div><h3>Sécurité totale</h3><p>Bloque/débloque en 1 clic, change PIN, limite par transaction. Notification instantanée via Socket + empreinte/biométrie.</p></div>
      <div class="unipay-feature"><div class="unipay-icon">📱</div><h3>Wallet 6 opérateurs</h3><p>Orange, Moov, Telecel, Wave, Coris, Sank Money. Recharge 24/7, paiement QR en boutique sans carte.</p></div>
      <div class="unipay-feature"><div class="unipay-icon">💬</div><h3>Support dans le Chat</h3><p>Support UniPay intégré dans la messagerie. Envoie photo de ton problème, reçois réponse vocale, reçu PDF.</p></div>
      <div class="unipay-feature"><div class="unipay-icon">🛍️</div><h3>Gagne en vendant</h3><p>Deviens vendeur marketplace, reçois paiement directement dans ton wallet UniPay, retire vers Mobile Money.</p></div>
    </div>
  </div>
</section>

<section class="unipay-cta">
  <div class="unipay-container">
    <h2>UniPay = Vente + Achat + Paiement + Discussion</h2>
    <p style="color:#E8D19A;font-size:17px;max-width:700px;margin:15px auto;">Rejoins 10 000+ Burkinabè qui vendent et achètent sans se déplacer. Tout dans une seule app.</p>
    <a href="https://play.google.com/store/apps/details?id=com.abdallahtech.uniPay" class="unipay-btn" style="margin-top:20px;">Télécharger gratuitement</a>
  </div>
</section>
</div>

<div id="cgu" class="page"><div class="unipay-container"><div class="legal-page"><h1>CGU - UniPay Marketplace & Paiement</h1><p><b>Dernière mise à jour: 21 juin 2026</b></p><h2>1. Services</h2><p>UniPay est une plateforme burkinabè qui combine: (a) Marketplace C2C/B2C pour produits neufs et occasion, (b) Messagerie instantanée acheteur-vendeur avec fichiers, (c) Wallet Mobile Money multi-opérateurs, (d) Émission de cartes Visa virtuelles et physiques via partenaires agréés.</p><h2>2. Marketplace</h2><p>Le vendeur est responsable de la description, stock, livraison. UniPay n'est pas propriétaire des produits mais fournit l'interface, la messagerie et le paiement sécurisé. Litige = médiation via chat support.</p><h2>3. Cartes Visa</h2><p>Cartes émises par nos partenaires bancaires agréés BCEAO. UniPay fournit l'interface. Frais visibles dans l'app avant achat.</p><h2>4. Messagerie</h2><p>Messages stockés chiffrés localement. Interdiction de spam, arnaque. Signalement direct dans l'app.</p><p>Contact: abdallah.unipay@gmail.com</p></div></div></div>
<div id="confidentialite" class="page"><div class="unipay-container"><div class="legal-page"><h1>Confidentialité</h1><p>Nous collectons: identité KYC pour cartes, numéro tel, messages (chiffrés), transactions marketplace, position GPS si partagée pour livraison, contacts (uniquement pour trouver qui est sur UniPay). Jamais vendu. Stockage BF. Droits: accès/suppression via abdallah.unipay@gmail.com</p></div></div></div>
<div id="mentions" class="page"><div class="unipay-container"><div class="legal-page"><h1>Mentions Légales</h1><p><b>Etablissement Sabdou Transfert et Business</b><br>RCCM: BF-OUAGA-01-2023-A10-17269<br>Ouaga, Burkina<br>abdallah.unipay@gmail.com - +226 75 32 23 21<br><br>UniPay est une plateforme technique. Cartes Visa émises par partenaires agréés. Fonds détenus par partenaires EMI agréés BCEAO. UniPay n'est pas banque.</p></div></div></div>

<footer class="unipay-footer">
  <div class="unipay-container">
    <div class="unipay-footer-grid">
      <div><h4>UniPay Super-App</h4><p>Marketplace + Messagerie + Wallet + Carte Visa virtuelle & physique. Vente en ligne et en magasin.</p></div>
      <div><h4>Services</h4><a>Marketplace Burkina</a><a>Messagerie acheteur-vendeur</a><a>Carte Visa virtuelle</a><a>Carte Visa physique</a><a>Paiement QR magasin</a></div>
      <div><h4>Contact</h4><p>abdallah.unipay@gmail.com</p><p>+226 75 32 23 21</p></div>
      <div><h4>Légal</h4><a onclick="showPage('cgu')">CGU Marketplace & Cartes</a><a onclick="showPage('confidentialite')">Confidentialité</a><a onclick="showPage('mentions')">Mentions</a></div>
    </div>
    <div class="unipay-copyright"><p>© 2026 Sabdou Transfert et Business - UniPay Marketplace & Paiement - Tous droits réservés</p></div>
  </div>
</footer>
</div>
<script>
  function showPage(id){ document.querySelectorAll('.page').forEach(p=>p.classList.remove('active')); document.getElementById(id).classList.add('active'); window.scrollTo(0,0); }
  document.querySelectorAll('a[href^="#"]').forEach(a=>{ a.addEventListener('click',function(e){ e.preventDefault(); const t=document.querySelector(this.getAttribute('href')); if(t) t.scrollIntoView({behavior:'smooth'}); }); });
</script>
</body>
</html>`;


app.get('/', (req, res) => { res.set('Content-Type', 'text/html'); res.send(html); });
//app.get('/health', (req,res)=> res.json({status:'ok'}));

app.get('/health', (req, res) => 
  res.status(200).json({ 
    status: 'OK', 
    online: global.onlineUsers ? global.onlineUsers.size : 0, 
    db: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected' 
  })
);

// ================== CONNEXION MONGO + LANCEMENT ==================
const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL;
mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => console.log('✅ Mongo connecté'))
  .catch(err => console.error('❌ Mongo erreur:', err.message));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 UniPay Server + Socket sur port ${PORT}`);
});

// Exports de secours pour la rétrocompatibilité
module.exports.io = io;
module.exports.onlineUsers = global.onlineUsers;
