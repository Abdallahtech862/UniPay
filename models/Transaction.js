const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  from: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Client',
    required: true 
  },
  to: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Client',
    required: true 
  },
  montant: { 
    type: Number, 
    required: true,
    min: 1 
  },
  type: { 
    type: String, 
    enum: ['transfert', 'depot', 'retrait'], 
    default: 'transfert' 
  },
  statut: { 
    type: String, 
    enum: ['succès', 'échec', 'en_attente'], 
    default: 'succès' 
  },
  description: String,
  date: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('Transaction', transactionSchema);
