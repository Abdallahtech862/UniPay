const jwt = require('jsonwebtoken');
const Client = require('../models/Client');

// Vérifie juste que l'user est connecté - pour les clients
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const client = await Client.findById(decoded.id).select('-password');

    if (!client) return res.status(401).json({ error: 'Client introuvable' });
    if (client.bloque) return res.status(403).json({ error: 'Compte bloqué' });

    req.client = client;
    req.user = client; // compatibilité pour les 2 noms
    next();
  } catch (error) {
    console.log('verifyToken error:', error.message);
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
};

// Vérifie que c'est un admin
const verifyAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const client = await Client.findById(decoded.id).select('-password');

    if (!client) return res.status(401).json({ error: 'Client introuvable' });

    if (client.role!== 'admin') {
      return res.status(403).json({ error: 'Accès admin requis' });
    }

    req.client = client;
    req.user = client;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
};

// Alias pour l'app mobile - même chose que verifyToken
const authUser = verifyToken;

module.exports = { verifyToken, verifyAdmin, authUser };
