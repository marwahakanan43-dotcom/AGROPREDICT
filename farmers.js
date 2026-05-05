const router = require('express').Router();
const db     = require('../db');
const { callClaude, AGRO_SYSTEM } = require('../claude');

// GET /api/farmers  — list all with district name
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT f.farmer_id, f.full_name, f.phone, f.village, f.total_area_ha,
             f.soil_type, f.status, f.registered_at,
             d.district_name,
             GROUP_CONCAT(DISTINCT c.crop_name ORDER BY c.crop_name SEPARATOR ', ') AS crops
        FROM farmers f
        JOIN districts d ON d.district_id = f.district_id
        LEFT JOIN farmer_crops fc ON fc.farmer_id = f.farmer_id AND fc.is_active = 1
        LEFT JOIN crops c         ON c.crop_id    = fc.crop_id
       GROUP BY f.farmer_id
       ORDER BY f.registered_at DESC
    `);
    res.json({ farmers: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/farmers/stats
router.get('/stats', async (req, res) => {
  try {
    const [[r]] = await db.query(`
      SELECT COUNT(*) AS total,
             ROUND(SUM(total_area_ha),1) AS totalLand,
             SUM(status='Active') AS active,
             COUNT(DISTINCT district_id) AS districts
        FROM farmers
    `);
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/farmers  — add new farmer
router.post('/', async (req, res) => {
  const { full_name, phone, district_name, village, total_area_ha, soil_type, status } = req.body;
  if (!full_name || !district_name || !total_area_ha) {
    return res.status(400).json({ error: 'full_name, district_name and total_area_ha are required' });
  }
  try {
    const [[dist]] = await db.query('SELECT district_id FROM districts WHERE district_name = ?', [district_name]);
    if (!dist) return res.status(400).json({ error: 'Unknown district: ' + district_name });

    const [result] = await db.query(
        `INSERT INTO farmers (full_name, phone, district_id, village, total_area_ha, soil_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [full_name, phone || null, dist.district_id, village || null,
          total_area_ha, soil_type || 'Loamy', status || 'Active']
    );
    res.json({ success: true, farmer_id: result.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/farmers/:id  — edit farmer
router.put('/:id', async (req, res) => {
  const { full_name, phone, village, total_area_ha, soil_type, status } = req.body;
  try {
    await db.query(
        `UPDATE farmers SET full_name=?, phone=?, village=?, total_area_ha=?, soil_type=?, status=? WHERE farmer_id=?`,
        [full_name, phone || null, village || null, total_area_ha, soil_type, status, req.params.id]
    );
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/farmers/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM farmers WHERE farmer_id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/farmers/:id/advisory  — AI advisory for a farmer
router.post('/:id/advisory', async (req, res) => {
  const { id } = req.params;
  const { adviceType } = req.body;
  try {
    const [[f]] = await db.query(`
      SELECT f.*, d.district_name,
             GROUP_CONCAT(DISTINCT c.crop_name SEPARATOR ', ') AS crops
        FROM farmers f
        JOIN districts d ON d.district_id = f.district_id
        LEFT JOIN farmer_crops fc ON fc.farmer_id = f.farmer_id AND fc.is_active = 1
        LEFT JOIN crops c ON c.crop_id = fc.crop_id
       WHERE f.farmer_id = ?
       GROUP BY f.farmer_id
    `, [id]);
    if (!f) return res.status(404).json({ error: 'Farmer not found' });

    const prompt = `Give personalized ${adviceType || 'farming advice'} for this Haryana farmer:
Name: ${f.full_name}
Location: ${f.village ? f.village + ', ' : ''}${f.district_name}, Haryana
Land Area: ${f.total_area_ha} hectares
Soil Type: ${f.soil_type}
Crops: ${f.crops || 'Not registered yet'}
Farm Status: ${f.status}
Current Season: Kharif 2026 (May sowing preparation)

Provide 4–5 specific, actionable recommendations for this farmer right now. Include what to do this week, this month, and preparation for next crop.`;

    const advisory = await callClaude([{ role: 'user', content: prompt }], AGRO_SYSTEM, 600);
    res.json({ advisory });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
