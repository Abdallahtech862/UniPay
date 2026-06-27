const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: true,
    trim: true
  },
  prenom: {
    type: String,
    required: true,
    trim: true
  },
  telephone: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 4 // Tu utilises PIN 4 chiffres
  },
  solde: {
    type: Number,
    default: 0,
    min: 0
  },
  role: {
    type: String,
    enum: ['client', 'admin', 'merchant'],
    default: 'client'
  },
  carteRecto: {
    type: String,
    default: null
  },
  carteVerso: {
    type: String,
    default: null
  },
  limiteJournaliere: {
    type: Number,
    default: 500000
  },
  limiteMensuelle: {
    type: Number,
    default: 5000000
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// SUPPRIME LE PRE SAVE - tu hash déjà dans la route
// clientSchema.pre('save', async function(next) { ... });

// Garde juste la méthode compare
clientSchema.methods.comparePassword = async function(candidatePassword) {
  const bcrypt = require('bcryptjs');
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Client', clientSchema);
