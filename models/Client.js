const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const clientSchema = new mongoose.Schema({
  nom: { type: String, required: true, trim: true },
  prenom: { type: String, required: true, trim: true },
  telephone: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 4 },
  solde: { type: Number, default: 0, min: 0 },
  role: { type: String, enum: ['client', 'admin', 'merchant'], default: 'client' },
  pseudo: { type: String, unique: true, sparse: true },
  photoProfil: { type: String, default: null },
  bloque: { type: Boolean, default: false },
  carteRecto: { type: String, default: null }, // ← URL Cloudinary complète
  carteVerso: { type: String, default: null }, // ← URL Cloudinary complète
  limiteJournaliere: { type: Number, default: 500000 },
  limiteMensuelle: { type: Number, default: 5000000 },
  isVerified: { type: Boolean, default: false },
  otpCode: { type: String, default: null },
  otpExpires: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

// Pas de pre('save') : tu hash déjà dans la route register

clientSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Client', clientSchema);
