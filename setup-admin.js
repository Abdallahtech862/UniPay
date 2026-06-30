// setup-admin.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Client = require('./models/Client');

const setupAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connecté');

    const existingAdmin = await Client.findOne({ email: process.env.ADMIN_EMAIL });
    if (existingAdmin) {
      console.log('Admin existe déjà');
      process.exit(0);
    }

    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    await Client.create({
      nom: 'Admin',
      prenom: 'UniPay',
      email: process.env.ADMIN_EMAIL,
      password: hash,
      role: 'admin', // ✅ Ton enum contient bien 'admin'
      telephone: '00000000',
      pseudo: 'admin',
      solde: 0
    });
    
    console.log('✅ Admin créé avec succès');
    console.log('Email:', process.env.ADMIN_EMAIL);
    process.exit(0);
  } catch (err) {
    console.error('Erreur:', err);
    process.exit(1);
  }
};

setupAdmin();
