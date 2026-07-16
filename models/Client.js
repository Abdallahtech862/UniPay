const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const clientSchema = new mongoose.Schema({
  nom: { type: String, required: true, trim: true },
  prenom: { type: String, required: true, trim: true },
  telephone: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  //pseudo: { type: String, sparse: true, trim: true }, // ← J'ai enlevé unique:true ici
  pseudo: { type: String, unique: true, sparse: true },
  password: { type: String, required: true, minlength: 4 },
  solde: { type: Number, default: 0, min: 0 },
  role: { type: String, enum: ['client', 'admin', 'merchant'], default: 'client' },
  photoProfil: { type: String, default: null },
  
  dateNaissance: { type: Date, default: null },
  adresse: { type: String, default: null },
  numeroCNIB: { type: String, default: null, trim: true },
  isVerified: { type: Boolean, default: false },
  verificationStatus: { 
    type: String, 
    enum: ['non_verifie', 'en_cours', 'verifie', 'rejete'], 
    default: 'non_verifie' 
  },
  
  carteRecto: { type: String, default: null },
  carteVerso: { type: String, default: null },
  dateVerification: { type: Date, default: null },

  bloque: { type: Boolean, default: false },
  raisonBlocage: { type: String, default: null },
  limiteJournaliere: { type: Number, default: 500000 },
  limiteMensuelle: { type: Number, default: 2000000 },
  totalDepotJour: { type: Number, default: 0 },
  totalDepotMois: { type: Number, default: 0 },
  dernierResetJour: { type: Date, default: Date.now },

  otpCode: { type: String, default: null },
  otpExpires: { type: Date, default: null },
  expoPushToken: { type: String, default: null },
  notificationsEnabled: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

clientSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  if (this.password.startsWith('$2a$')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

clientSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

clientSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// UN SEUL endroit pour les index - plus de duplicate
clientSchema.index({ telephone: 1 }, { unique: true });
clientSchema.index({ email: 1 }, { unique: true });
clientSchema.index({ pseudo: 1 }, { unique: true, sparse: true });
clientSchema.index({ numeroCNIB: 1 }, { sparse: true });

module.exports = mongoose.model('Client', clientSchema);
