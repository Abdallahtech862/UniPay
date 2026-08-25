const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  expediteur: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  destinataire: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: function() {
      return this.type === 'envoi' || this.type === 'reception' || this.type === 'achat' || this.type === 'vente';
    }
  },
  type: {
    type: String,
    enum: ['envoi', 'reception', 'retrait', 'recharge', 'achat', 'vente', 'marketplace', 'livraison'],
    required: true
  },
  montant: { type: Number, required: true, min: 1 },
  montantNet: { type: Number },
  montantNetRecu: { type: Number },
  frais: { type: Number },
  fraisExpediteur: { type: Number },
  fraisDestinataire: { type: Number },
  motif: String,

  // Marketplace
  produitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Produit' },
  commandeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Commande' },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },

  status: {
    type: String,
    enum: ['validee', 'annulee', 'en_attente', 'reussie', 'echouee'],
    default: 'en_attente'
  },
  depositId: { type: String, unique: true, sparse: true, index: true },
  numeroSource: String,
  numeroDestination: String,
  operateur: String,
  credited: { type: Boolean, default: false },

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
}, { timestamps: true, strict: false });

module.exports = mongoose.model('Transaction', transactionSchema);
