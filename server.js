app.get('/health', (req, res) => res.status(200).send('OK'));
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Ne bloque pas le serveur si MongoDB fail
const mongoURL = process.env.MONGO_URL;
mongoose.connect(mongoURL).catch(err => console.error('Erreur MongoDB:', err));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/transfer', require('./routes/transfer'));
app.use('/api/cards', require('./routes/cards'));

app.get('/', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
  res.json({ 
    message: 'UniPay API v1.0',
    db: dbStatus,
    status: 'OK'
  });
});

// OBLIGATOIRE pour Railway
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur sur port ${PORT}`);
});
