const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  nom: { type: String, required: true },
  prenom: { type: String, required: true },
  pseudo: { type: String, required: true, unique: true },
  telephone: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  solde: { type: Number, default: 0 },
  password: { type: String, required: true },
  role: { type: String, default: 'client' },

  limiteJournaliere: { type: Number, default: 500000 },
  limiteMensuelle: { type: Number, default: 5000000 },

  photoProfil: String, // URL Cloudinary ou chemin
  carteRecto: String,
  carteVerso: String,

  dateCreation: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Client', clientSchema);
