const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  produitId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true,
    index: true 
  },
  vendeurId: { 
    type: String, 
    required: true 
  },
  reporterId: { 
    type: String, 
    required: true,
    index: true
  },
  reason: { 
    type: String, 
    enum: ['Arnaque', 'Contrefaçon', 'Article interdit', 'Prix abusif', 'Autre'],
    required: true 
  },
  description: { 
    type: String, 
    default: '' 
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'action_taken', 'rejected'],
    default: 'pending'
  }
}, { timestamps: true });

// Un user ne peut signaler le même produit qu'une fois
reportSchema.index({ produitId: 1, reporterId: 1 }, { unique: true });

module.exports = mongoose.model('Report', reportSchema);
