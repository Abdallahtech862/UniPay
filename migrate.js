const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Import ton modèle Client
const Client = require('./models/Client');

async function migrate() {
  try {
    console.log('Connexion à MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connecté ✅');

    // 1. Ajouter limites aux clients existants
    const resultLimites = await Client.updateMany(
      { limiteJournaliere: { $exists: false } },
      { 
        $set: { 
          limiteJournaliere: 500000, 
          limiteMensuelle: 5000000 
        } 
      },
      { runValidators: false }
    );
    console.log(`${resultLimites.modifiedCount} clients : limites ajoutées`);

    // 2. Ajouter pseudo aux clients qui n'en ont pas
    const clientsSansPseudo = await Client.find({ pseudo: { $exists: false } });
    let countPseudo = 0;
    
    for (const client of clientsSansPseudo) {
      // Génère un pseudo basé sur prenom+nom+random
      const basePseudo = (client.prenom + client.nom).toLowerCase().replace(/\s/g, '');
      let pseudo = basePseudo;
      let i = 1;
      
      // Si le pseudo existe déjà, ajoute un numéro
      while (await Client.findOne({ pseudo })) {
        pseudo = basePseudo + i;
        i++;
      }
      
      client.pseudo = pseudo;
      await client.save({ validateBeforeSave: false });
      countPseudo++;
    }
    console.log(`${countPseudo} clients : pseudo généré`);

    // 3. Fix clients sans password
    const clientsSansPassword = await Client.find({ password: { $exists: false } });
    let countPassword = 0;
    
    for (const client of clientsSansPassword) {
      // Password = téléphone hashé
      const hashedPassword = await bcrypt.hash(client.telephone, 10);
      client.password = hashedPassword;
      await client.save({ validateBeforeSave: false });
      countPassword++;
    }
    console.log(`${countPassword} clients : password ajouté`);

    console.log('\n✅ Migration terminée avec succès');
    process.exit(0);
    
  } catch (err) {
    console.error('❌ Erreur migration:', err);
    process.exit(1);
  }
}

migrate();
