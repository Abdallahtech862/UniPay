const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  expediteur: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  destinataire: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: function() {
      return this.type === 'envoi' || this.type === 'reception';
    }
  },
  type: {
    type: String,
    enum: ['envoi', 'reception', 'retrait', 'recharge'],
    required: false
  },
  montant: { type: Number, required: true, min: 1 },
  montantNet: { type: Number },
  frais: { type: Number },
  motif: String,
  
  // ✅ FIX RECHARGE
  status: { 
    type: String, 
    enum: ['validee', 'annulee', 'en_attente', 'reussie', 'echouee'], 
    default: 'en_attente' 
  },
  depositId: { type: String, unique: true, sparse: true, index: true }, // ✅ INDISPENSABLE
  numeroSource: { type: String }, // ✅ numéro qui paye
  numeroDestination: { type: String },
  operateur: { type: String },
  credited: { type: Boolean, default: false }, // ✅ évite double crédit

  soldeExpediteurApres: Number,
  soldeDestinataireApres: Number,
  expediteurSupprime: { type: Boolean, default: false },
  destinataireSupprime: { type: Boolean, default: false },
  expediteurNom: String,
  destinataireNom: String,
  annulee: { type: Boolean, default: false },
  montantAnnule: { type: Number, default: 0 },
  dateAnnulation: Date,
  dateValidation: Date,
  date: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
