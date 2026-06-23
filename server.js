const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

process.on('uncaughtException', (err) => {
  console.error('FATAL:', err.message);
});

app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/', (req, res) => res.status(200).json({ 
  status: 'OK',
  db: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
}));

mongoose.connect(process.env.MONGO_URL).catch(err => console.error('Mongo error:', err.message));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/transfer', require('./routes/transfer'));
app.use('/api/cards', require('./routes/cards'));

const PORT = process.env.PORT;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur sur port ${PORT}`);
});
