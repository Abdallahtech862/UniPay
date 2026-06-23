const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  expediteur: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  destinataire: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  montant: {
    type: Number,
    required: true,
    min: 1
  },
  motif: String,
  date: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Transaction', transactionSchema); 
