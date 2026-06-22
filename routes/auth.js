const express = require('express');
const router = express.Router();
router.get('/', (req, res) => res.json({ msg: 'Auth OK' }));
module.exports = router;
