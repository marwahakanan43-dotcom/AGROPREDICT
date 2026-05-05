const router = require('express').Router();
const db     = require('../db');
const { callClaude, AGRO_SYSTEM } = require('../claude');

const CROP_EMOJI = { Wheat:'🌾', Rice:'🌾', Corn:'🌽', Mustard:'🟡', Cotton:'🪴', Barley:'🌾', Sugarcane:'🎋' };

// GET /api/market/prices  — today's prices per crop (latest record per crop)
router.get('/prices', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT mp.price_id, mp.price_date, mp.price_per_quintal, mp.price_change, mp.mandi_name,
             c.crop_name, c.local_name, d.district_name
        FROM market_prices mp
        JOIN crops c     ON c.crop_id     = mp.crop_id
        JOIN districts d ON d.district_id = mp.district_id
       WHERE (mp.crop_id, mp.price_date) IN (
               SELECT crop_id, MAX(price_date)
                 FROM market_prices GROUP BY crop_id
             )
       ORDER BY c.crop_name
    `);
    res.json({ prices: rows.map(r => ({ ...r, emoji: CROP_EMOJI[r.crop_name] || '🌿' })) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/market/prices  — add new price entry
router.post('/prices', async (req, res) => {
  const { crop_name, district_name, price_per_quintal, price_change, mandi_name } = req.body;
  if (!crop_name || !district_name || !price_per_quintal) {
    return res.status(400).json({ error: 'crop_name, district_name and price_per_quintal are required' });
  }
  try {
    const [[crop]] = await db.query('SELECT crop_id FROM crops WHERE crop_name=?', [crop_name]);
    const [[dist]] = await db.query('SELECT district_id FROM districts WHERE district_name=?', [district_name]);
    if (!crop) return res.status(400).json({ error: 'Invalid crop: ' + crop_name });
    if (!dist) return res.status(400).json({ error: 'Invalid district: ' + district_name });

    await db.query(
        `INSERT INTO market_prices (crop_id, district_id, price_date, price_per_quintal, price_change, mandi_name)
       VALUES (?, ?, CURDATE(), ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         price_per_quintal=VALUES(price_per_quintal),
         price_change=VALUES(price_change),
         mandi_name=VALUES(mandi_name)`,
        [crop.crop_id, dist.district_id, price_per_quintal, price_change || 0,
          mandi_name || district_name + ' Mandi']
    );
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/market/prices/:id  — delete a price entry
router.delete('/prices/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM market_prices WHERE price_id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/market/trend/:crop  — 90-day price trend
router.get('/trend/:crop', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT mp.price_date, mp.price_per_quintal, d.district_name
        FROM market_prices mp
        JOIN crops c     ON c.crop_id     = mp.crop_id AND c.crop_name = ?
        JOIN districts d ON d.district_id = mp.district_id
       WHERE mp.price_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
       ORDER BY mp.price_date ASC
    `, [req.params.crop]);
    res.json({ trend: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/market/mandi  — comparison across mandis for latest prices
router.get('/mandi', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT mp.mandi_name, c.crop_name, mp.price_per_quintal, mp.price_change,
             mp.price_date, d.district_name
        FROM market_prices mp
        JOIN crops c ON c.crop_id = mp.crop_id
        JOIN districts d ON d.district_id = mp.district_id
       WHERE mp.price_date = (SELECT MAX(price_date) FROM market_prices)
       ORDER BY mp.price_per_quintal DESC
    `);
    res.json({ mandi: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/market/history  — full price history
router.get('/history', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT mp.price_id, mp.price_date, mp.price_per_quintal,
             mp.price_change, mp.mandi_name,
             c.crop_name, d.district_name
        FROM market_prices mp
        JOIN crops c     ON c.crop_id     = mp.crop_id
        JOIN districts d ON d.district_id = mp.district_id
       ORDER BY mp.price_date DESC
       LIMIT 100
    `);
    res.json({ history: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/market/ai-advice
router.post('/ai-advice', async (req, res) => {
  const { crop, quantity } = req.body;
  try {
    const [[price]] = await db.query(`
      SELECT mp.price_per_quintal, mp.price_change, mp.price_date, mp.mandi_name, d.district_name
        FROM market_prices mp
        JOIN crops c ON c.crop_id = mp.crop_id AND c.crop_name = ?
        JOIN districts d ON d.district_id = mp.district_id
       ORDER BY mp.price_date DESC LIMIT 1
    `, [crop]);

    const priceInfo = price
        ? `Current mandi price: ₹${price.price_per_quintal}/quintal (${price.mandi_name}, ${price.district_name}, ${price.price_date}). Change: ${price.price_change > 0 ? '+' : ''}${price.price_change}`
        : `Current estimated price for ${crop}`;

    const prompt = `Sell/hold market analysis for ${crop} in Haryana, India:
${priceInfo}
Farmer wants to sell: ${quantity || '50–100 qtl'}
Current month: May 2026

Provide:
1. SELL NOW or HOLD — clear recommendation with reasons
2. Expected price in 30 days and why
3. Best mandi for ${crop} in Haryana right now
4. Risk factors affecting price
5. Storage advice if holding`;

    const advice = await callClaude([{ role: 'user', content: prompt }], AGRO_SYSTEM, 600);
    res.json({ advice, currentPrice: price });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
