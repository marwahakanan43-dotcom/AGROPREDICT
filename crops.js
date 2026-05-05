const router = require('express').Router();
const db     = require('../db');

// GET /api/crops
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM crops ORDER BY crop_name');
    res.json({ crops: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
