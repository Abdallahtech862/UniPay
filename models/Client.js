const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const clientSchema = new mongoose.Schema({
  nom: { type: String, required: true, trim: true },
  prenom: { type: String, required: true, trim: true },
  telephone: { type: String, required: true, trim: true }, // enlève unique
  email: { type: String, required: true, lowercase: true, trim: true }, // enlève unique
  pseudo: { type: String, sparse: true },
  password: { type: String, required: true, minlength: 6 }, // 6 mini pour PawaPay
  solde: { type: Number, default: 0, min: 0 },
  role: { type: String, enum: ['client', 'admin', 'merchant'], default: 'client' },
  photoProfil: { type: String, default: null },
  
  // --- COMPLIANCE LBC/FT (ce qui manquait) ---
  dateNaissance: { type: Date, default: null },
  adresse: { type: String, default: null },
  numeroCNIB: { type: String, default: null, trim: true },
  isVerified: { type: Boolean, default: false },
  verificationStatus: { 
    type: String, 
    enum: ['non_verifie', 'en_cours', 'verifie', 'rejete'], 
    default: 'non_verifie' 
  },
  
  // Documents KYC
  carteRecto: { type: String, default: null }, // URL Cloudinary
  carteVerso: { type: String, default: null },
  dateVerification: { type: Date, default: null },

  // Securité & Limites
  bloque: { type: Boolean, default: false },
  raisonBlocage: { type: String, default: null },
  limiteJournaliere: { type: Number, default: 500000 },
  limiteMensuelle: { type: Number, default: 2000000 }, // 2M conforme UEMOA, pas 5M
  totalDepotJour: { type: Number, default: 0 },
  totalDepotMois: { type: Number, default: 0 },
  dernierResetJour: { type: Date, default: Date.now },

  // OTP & Push
  otpCode: { type: String, default: null },
  otpExpires: { type: Date, default: null },
  expoPushToken: { type: String, default: null },
  notificationsEnabled: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// --- FIX SECURITE : Hash auto même si tu oublies dans la route ---
clientSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  // Si déjà hashé (commence par $2a$), on skip
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

// Index pour recherche rapide admin
clientSchema.index({ telephone: 1 });
clientSchema.index({ email: 1 });
clientSchema.index({ numeroCNIB: 1 });
clientSchema.index({ pseudo: 1 });

module.exports = mongoose.model('Client', clientSchema);
