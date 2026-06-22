const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'UniPay test' });
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur sur port ${PORT}`);
});
