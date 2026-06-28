const jwt = require('jsonwebtoken');
const Client = require('../models/Client');

// Vérifie juste que l'user est connecté
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

    req.client = client; // On met le client connecté dans req
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
};

// Vérifie que c'est un admin
const verifyAdmin = async (req, res, next) => {
  await verifyToken(req, res, () => {
    if (req.client.role!== 'admin') {
      return res.status(403).json({ error: 'Accès admin requis' });
    }
    next();
  });
};

const authUser = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await Client.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({ error: 'Utilisateur introuvable' });
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
};
module.exports = { verifyToken, verifyAdmin, authUser };
