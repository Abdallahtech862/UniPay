process.on('uncaughtException', (err) => {
  console.error('FATAL:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('PROMISE CRASH:', err);
});

const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const PORT = process.env.PORT;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur sur port ${PORT}`);
});
