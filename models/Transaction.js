const mongoose = require('mongoose');


const transactionSchema = new mongoose.Schema({
  expediteur: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  //destinataire: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' }, // ✅ Plus required
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
    required: false//true
  },
  montant: { type: Number, required: true, min: 1 },
  frais: { type: Number, default: 0 },
  motif: String,
  status: { type: String, enum: ['validee', 'annulee', 'en_attente'], default: 'en_attente' },
  soldeExpediteurApres: Number,
  soldeDestinataireApres: Number,
  // Champs spécifiques retrait
  operateur: String, // MTN Money, Wave, etc
  numeroDestination: String, // numéro mobile money ou carte
  annulee: { type: Boolean, default: false },
  dateAnnulation: Date,
  dateValidation: Date
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
