const express = require('express');
const router = express.Router();

// routes/marketplace.js
app.post('/api/products', auth, async (req,res) => {
  const product = await Product.create(req.body);
  io.emit('new_product', product); // temps réel
  res.json(product);
});

app.get('/api/products', async (req,res) => {
  const products = await Product.find({status:'actif'}).sort({createdAt:-1}).limit(100);
  res.json(products);
});

app.post('/api/orders/pay', auth, async (req,res) => {
  const { produitId } = req.body;
  const product = await Product.findById(produitId);
  const acheteur = await User.findById(req.userId);

  if(acheteur.solde < product.prix) return res.status(400).json({error:'Solde insuffisant'});

  // Debit wallet
  acheteur.solde -= product.prix;
  await acheteur.save();

  // Crée commande en escrow
  const order = await Order.create({
    produitId, acheteurId: req.userId, vendeurId: product.vendeurId,
    prix: product.prix, status: 'paye'
  });

  // Notif vendeur via ton système de push déjà
  sendPushToUser(product.vendeurId, {
    title: `Nouvelle vente! ${product.titre}`,
    body: `${acheteur.prenom} a payé ${product.prix} FCFA`,
    data: { type: 'market_order', orderId: order._id }
  });

  res.json(order);
});

app.post('/api/orders/:id/confirm', auth, async (req,res) => {
  const order = await Order.findById(req.params.id);
  const vendeur = await User.findById(order.vendeurId);
  vendeur.solde += order.prix * 0.98; // 98% au vendeur, 2% commission
  await vendeur.save();
  order.status = 'confirme';
  await order.save();
  res.json({success:true});
});

// GET mes commandes (acheteur + vendeur)
app.get('/api/orders/my', auth, async (req,res)=>{
  const orders = await Order.find({ $or: [{acheteurId:req.userId}, {vendeurId:req.userId}] })
   .sort({createdAt:-1})
   .lean();
  // populate produit
  for(let o of orders){ o.produit = await Product.findById(o.produitId); }
  res.json(orders);
});

// Marquer livré par vendeur
app.post('/api/orders/:id/deliver', auth, async (req,res)=>{
  const order = await Order.findById(req.params.id);
  if(order.vendeurId!==req.userId) return res.status(403).json({error:'Non autorisé'});
  order.status='livre';
  await order.save();
  res.json(order);
});
module.exports = router;
