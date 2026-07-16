
// setup-admin.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Client = require('./models/Client');
const setupAdmin = async () => {
  try {
    const mongoUri = 'mongodb://mongo:WWWpSIAoHXfouCvtZUxcNiMBtzaHfqjP@mongodb.railway.internal:27017';
    await mongoose.connect(mongoUri);
    
    console.log('=== IDENTIFIANTS ADMIN ===');
    console.log('Email:', process.env.ADMIN_EMAIL);
    console.log('Password:', process.env.ADMIN_PASSWORD);
    console.log('=========================');

    const existingAdmin = await Client.findOne({ email: process.env.ADMIN_EMAIL });
    if (existingAdmin) {
      console.log('Admin existe déjà en DB');
      process.exit(0);
    }

    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    await Client.create({
      nom: 'Admin',
      prenom: 'UniPay',
      telephone: '+22600000000',
      email: 'admin@unipay.bf',
      pseudo: 'admin_unipay_' + Date.now(),
      password: 'Admin123!',
      role: 'admin',
      isVerified: true,
      verificationStatus: 'verifie',
      solde: 1000000,
      estActif: true
    });
    
    console.log('✅ Admin créé avec succès');
    process.exit(0);
  } catch (err) {
    console.error('Erreur:', err.message);
    process.exit(1);
  }
};
