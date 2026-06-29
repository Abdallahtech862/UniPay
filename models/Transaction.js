const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  expediteur: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  destinataire: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  montant: { type: Number, required: true, min: 1 },
  frais: { type: Number, default: 0 },
  motif: String,
  status: { type: String, enum: ['validee', 'annulee', 'en_attente'], default: 'validee' },
  soldeExpediteurApres: Number, // ✅ nouveau
  soldeDestinataireApres: Number, // ✅ nouveau
  annulee: { type: Boolean, default: false },
  dateAnnulation: Date
}, { timestamps: true });
module.exports = mongoose.model('Transaction', transactionSchema);
