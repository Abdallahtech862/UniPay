const express = require('express');
const app = express();

// Répond instantanément pour le healthcheck Railway
app.get('/', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Railway fournit PORT obligatoirement
const PORT = process.env.PORT;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur sur port ${PORT}`);
});
