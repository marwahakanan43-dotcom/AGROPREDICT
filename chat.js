const router = require('express').Router();
const { callClaude, AGRO_SYSTEM } = require('../claude');

// POST /api/chat
router.post('/', async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages array required' });
  }

  try {
    const reply = await callClaude(messages, AGRO_SYSTEM, 1000);
    res.json({ reply });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
