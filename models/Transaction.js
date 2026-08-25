const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  expediteur: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  destinataire: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: function() {
      return ['envoi','reception','achat','vente'].includes(this.type);
    }
  },
  type: {
    type: String,
    enum: [
      'envoi', 'reception', 'retrait', 'recharge',
      'achat', 'vente',
      'achat_market', 'vente_market', // <-- ton frontend
      'achat_marketplace', 'vente_marketplace', // <-- ton erreur actuelle
      'marketplace', 'livraison'
    ],
    required: true
  },
  montant: { type: Number, required: true, min: 1 },
  montantNet: Number,
  montantNetRecu: Number,
  frais: Number,
  fraisExpediteur: Number,
  fraisDestinataire: Number,
  motif: String,

  // Marketplace
  produitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Produit' },
  commandeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Commande' },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },

  status: {
    type: String,
    enum: ['validee', 'annulee', 'en_attente', 'reussie', 'echouee'],
    default: 'validee' // mets validee direct
  },
  depositId: { type: String, unique: true, sparse: true },
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
