const express = require('express');
const router  = express.Router();
const db      = require('../db');

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' });

  try {
    const [rows] = await db.execute(
        `SELECT user_id, full_name, email, role, district_id
       FROM users
       WHERE email = ? AND password_hash = SHA2(?, 256)
       LIMIT 1`,
        [email, password]
    );

    if (!rows.length)
      return res.status(401).json({ error: 'Invalid email or password' });

    await db.execute(
        'UPDATE users SET last_login = NOW() WHERE user_id = ?',
        [rows[0].user_id]
    );

    res.json({ user: rows[0] });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

module.exports = router;

