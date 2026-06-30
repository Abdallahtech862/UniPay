// setup-admin.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Client = require('./models/Client');

const setupAdmin = async () => {
  try {
    // ✅ Utilise DATABASE_URL ou MONGODB_URI selon Railway
    const mongoUri = mongodb://mongo:WWWpSIAoHXfouCvtZUxcNiMBtzaHfqjP@mongodb.railway.internal:27017;
    
    if (!mongoUri) {
      throw new Error('Aucune URI Mongo trouvée. Check DATABASE_URL ou MONGODB_URI');
    }

    console.log('Connexion à Mongo...');
    await mongoose.connect(mongoUri);
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
      role: 'admin',
      telephone: '00000000',
      pseudo: 'admin',
      solde: 0
    });
    
    console.log('✅ Admin créé avec succès');
    console.log('Email:', process.env.ADMIN_EMAIL);
    process.exit(0);
  } catch (err) {
    console.error('Erreur:', err.message);
    process.exit(1);
  }
};

setupAdmin();
