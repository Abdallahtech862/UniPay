const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Railway injecte MONGO_URL automatiquement
const mongoURL = process.env.MONGO_URL;

mongoose.connect(mongoURL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB Railway connecté'))
.catch(err => console.error('Erreur MongoDB:', err));

// Routes - assure-toi que ces fichiers existent
app.use('/api/auth', require('./routes/auth'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/transfer', require('./routes/transfer'));
app.use('/api/cards', require('./routes/cards'));

app.get('/', (req, res) => {
  res.json({ 
    message: 'UniPay API v1.0',
    db: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// Une seule fois, à la fin, avec 0.0.0.0 pour Railway
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`Serveur sur port ${PORT}`));
