const router = require('express').Router();
const db     = require('../db');
const { callClaude, AGRO_SYSTEM } = require('../claude');

// GET /api/disease/alerts
router.get('/alerts', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT da.alert_id, da.disease_name, da.alert_type, da.severity,
             da.description, da.reported_date, da.is_active,
             c.crop_name, d.district_name
        FROM disease_alerts da
        JOIN crops c     ON c.crop_id     = da.crop_id
        JOIN districts d ON d.district_id = da.district_id
       WHERE da.is_active = 1
       ORDER BY
         FIELD(da.severity,'Critical','High','Medium','Low'),
         da.reported_date DESC
    `);
    res.json({ alerts: rows, count: rows.length });
  } catch (e) {
    console.error('GET /disease/alerts error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/disease/alerts  — add new disease alert
router.post('/alerts', async (req, res) => {
  const { crop_name, district_name, disease_name, alert_type, severity, description } = req.body;

  if (!crop_name || !district_name || !disease_name) {
    return res.status(400).json({ error: 'crop_name, district_name and disease_name are required' });
  }

  try {
    const [[crop]] = await db.query('SELECT crop_id FROM crops WHERE crop_name = ?', [crop_name]);
    const [[dist]] = await db.query('SELECT district_id FROM districts WHERE district_name = ?', [district_name]);

    if (!crop) return res.status(400).json({ error: 'Invalid crop: ' + crop_name });
    if (!dist) return res.status(400).json({ error: 'Invalid district: ' + district_name });

    const [result] = await db.query(
      `INSERT INTO disease_alerts
         (crop_id, district_id, disease_name, alert_type, severity, description, reported_date, is_active)
       VALUES (?, ?, ?, ?, ?, ?, CURDATE(), 1)`,
      [crop.crop_id, dist.district_id, disease_name,
       alert_type || 'Disease', severity || 'Medium', description || '']
    );
    res.json({ success: true, alert_id: result.insertId });
  } catch (e) {
    console.error('POST /disease/alerts error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/disease/alerts/:id/resolve  — mark alert as resolved
router.put('/alerts/:id/resolve', async (req, res) => {
  try {
    const [result] = await db.query(
      'UPDATE disease_alerts SET is_active = 0 WHERE alert_id = ?',
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    res.json({ success: true });
  } catch (e) {
    console.error('PUT /disease/alerts resolve error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/disease/alerts/:id  — delete alert
router.delete('/alerts/:id', async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM disease_alerts WHERE alert_id = ?',
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /disease/alerts error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/disease/diagnose
router.post('/diagnose', async (req, res) => {
  const { crop, stage, symptom, extra, farmerId } = req.body;

  if (!crop || !symptom) {
    return res.status(400).json({ error: 'crop and symptom are required' });
  }

  const prompt = `Diagnose this crop disease for a Haryana farmer:
Crop: ${crop}
Crop Stage: ${stage || 'Unknown'}
Main Symptom: ${symptom}
Additional Details: ${extra || 'None'}

Provide:
1. DIAGNOSIS — Most likely disease/pest with confidence %
2. SCIENTIFIC NAME — of the pathogen
3. SEVERITY — Low/Medium/High and why
4. IMMEDIATE TREATMENT — specific fungicide/pesticide with dosage
5. PREVENTION — 3 steps to prevent recurrence
6. COST ESTIMATE — approximate treatment cost in ₹/acre

Be specific to Haryana conditions.`;

  try {
    const diagnosis = await callClaude(
      [{ role: 'user', content: prompt }],
      AGRO_SYSTEM, 600
    );
    res.json({ diagnosis, saved: false });
  } catch (e) {
    console.error('POST /disease/diagnose error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
