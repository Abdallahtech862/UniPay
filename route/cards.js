const express = require('express');
const router = express.Router();
router.get('/', (req, res) => res.json({ msg: 'Cards OK' }));
module.exports = router;
