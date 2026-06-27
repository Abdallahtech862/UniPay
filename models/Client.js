const mongoose = require('mongoose');

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

  carteRecto: { type: String, default: null },
  carteVerso: { type: String, default: null },
  limiteJournaliere: { type: Number, default: 500000 },
  limiteMensuelle: { type: Number, default: 5000000 },
  isVerified: { type: Boolean, default: false },
  
  // AJOUTE CES 2 LIGNES
  otpCode: { type: String, default: null },
  otpExpires: { type: Date, default: null },
  
  createdAt: { type: Date, default: Date.now }
});

clientSchema.methods.comparePassword = async function(candidatePassword) {
  const bcrypt = require('bcryptjs');
  return await bcrypt.compare(candidatePassword, this.password);
};

//module.exports = mongoose.model('Client', clientSchema);

clientSchema.methods.comparePassword = async function(candidatePassword) {
  const bcrypt = require('bcryptjs');
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Client', clientSchema);

// SUPPRIME LE PRE SAVE - tu hash déjà dans la route
// clientSchema.pre('save', async function(next) { ... });

// Garde juste la méthode compare
clientSchema.methods.comparePassword = async function(candidatePassword) {
  const bcrypt = require('bcryptjs');
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Client', clientSchema);
