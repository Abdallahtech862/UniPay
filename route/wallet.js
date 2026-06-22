
const express = require('express');
const router = express.Router();

router.get('/test', (req, res) => {
  res.json({ msg: 'Wallet route OK' });
});

module.exports = router;
