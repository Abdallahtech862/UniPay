const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const cors = require('cors');
app.use(cors({
  origin: '*', // Accepte tout pour tester
  credentials: true
}));

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
//app.use(express.json());
//app.use(express.urlencoded({ extended: true })); // Pour les formulaires HTML

process.on('uncaughtException', (err) => {
  console.error('FATAL:', err.message);
});

app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/', (req, res) => res.status(200).json({ 
  status: 'OK',
  db: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
}));

mongoose.connect(process.env.MONGO_URL).catch(err => console.error('Mongo error:', err.message));

app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/wallet', require('./routes/wallet'));
//app.use('/api/transfer', require('./routes/transfer'));
app.use('/api/cards', require('./routes/cards'));
app.use('/api/clients', require('./routes/clients'));

const PORT = process.env.PORT;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur sur port ${PORT}`);
});
