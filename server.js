const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Railway fournit MONGO_URL automatiquement
mongoose.connect(process.env.MONGO_URL || process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB Railway connecté'))
.catch(err => console.log('Erreur MongoDB:', err));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/transfer', require('./routes/transfer'));
app.use('/api/cards', require('./routes/cards'));

app.get('/', (req, res) => {
  res.json({ 
    message: 'UniPay API v1.0 - Burkina Faso',
    status: 'Railway OK',
    db: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Serveur UniPay sur port ${PORT}`));
