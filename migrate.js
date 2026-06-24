const mongoose = require('mongoose');
require('dotenv').config();

const Transaction = require('./models/Transaction');

async function migrate() {
  try {
    console.log('Connexion à MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connecté');

    // 1. Ajouter annulee: false sur toutes les tx qui l'ont pas
    const result1 = await Transaction.updateMany(
      { annulee: { $exists: false } },
      { $set: { annulee: false } }
    );
    console.log(`${result1.modifiedCount} transactions mises à jour avec annulee: false`);

    // 2. Compter les transactions
    const total = await Transaction.countDocuments();
    const annulees = await Transaction.countDocuments({ annulee: true });
    const valides = await Transaction.countDocuments({ annulee: false });
    
    console.log('\n=== STATS ===');
    console.log(`Total transactions: ${total}`);
    console.log(`Validées: ${valides}`);
    console.log(`Annulées: ${annulees}`);

    await mongoose.disconnect();
    console.log('\nMigration terminée avec succès');
    process.exit(0);
  } catch (error) {
    console.error('Erreur migration:', error);
    process.exit(1);
  }
}

migrate();
