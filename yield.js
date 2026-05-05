const router = require('express').Router();
const db     = require('../db');
const { callClaude, AGRO_SYSTEM } = require('../claude');

// POST /api/yield/predict
router.post('/predict', async (req, res) => {
  const {
    crop, soil, rainfall, temp, fertilizer,
    irrigation, area, season, variety, district, farmerId
  } = req.body;

  if (!crop) {
    return res.status(400).json({ error: 'crop is required' });
  }

  const prompt = `Predict crop yield for a farmer in ${district || 'Haryana'}, India:
Crop: ${crop}
Soil type: ${soil || 'Unknown'}
Rainfall: ${rainfall || 'Average'} mm/season
Average temperature: ${temp || '25'}°C
Fertilizer applied: ${fertilizer || 'Standard'} kg/ha
Irrigation method: ${irrigation || 'Canal'}
Total land area: ${area || 1} hectares
Season: ${season || 'Kharif'}
Seed variety: ${variety || 'Local'}

Provide:
1. YIELD ESTIMATE: Expected yield in kg/ha and total yield for the ${area || 1} hectare plot
2. KEY FACTORS: Top 3 factors affecting yield (positive and negative)
3. RECOMMENDATIONS: 3 specific, actionable steps to maximize yield
4. EXPECTED REVENUE: Approximate income estimate based on current Haryana mandi prices (₹)

Format clearly with numbers. Be specific to Haryana conditions.`;

  try {
    const prediction = await callClaude(
      [{ role: 'user', content: prompt }],
      AGRO_SYSTEM, 900
    );

    // Extract yield estimate from response for DB storage
    const yieldMatch    = prediction.match(/(\d[\d,]+)\s*kg\/ha/i);
    const predictedKgHa = yieldMatch ? parseInt(yieldMatch[1].replace(/,/g, '')) : null;

    let recordId = null;

    // Save to DB only if farmer is selected and we got a yield value
    if (farmerId && predictedKgHa) {
      try {
        const [[cropRow]] = await db.query(
          'SELECT crop_id FROM crops WHERE crop_name = ?', [crop]
        );

        if (cropRow) {
          // Upsert farmer_crop record
          const [fcResult] = await db.query(`
            INSERT INTO farmer_crops (farmer_id, crop_id, area_ha, season_year, is_active)
            VALUES (?, ?, ?, YEAR(CURDATE()), 1)
            ON DUPLICATE KEY UPDATE area_ha = VALUES(area_ha), is_active = 1
          `, [farmerId, cropRow.crop_id, area || 1]);

          // Use insertId or get existing record
          let farmerCropId = fcResult.insertId;
          if (!farmerCropId) {
            const [[existing]] = await db.query(
              'SELECT farmer_crop_id FROM farmer_crops WHERE farmer_id = ? AND crop_id = ?',
              [farmerId, cropRow.crop_id]
            );
            farmerCropId = existing?.farmer_crop_id;
          }

          if (farmerCropId) {
            const [yrResult] = await db.query(`
              INSERT INTO yield_records
                (farmer_crop_id, recorded_date, predicted_yield_kg, yield_per_ha,
                 rainfall_mm, avg_temp_c, fertilizer_kgha, irrigation_method, notes)
              VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, ?)
            `, [
              farmerCropId,
              Math.round(predictedKgHa * (area || 1)),
              predictedKgHa,
              rainfall || null,
              temp     || null,
              fertilizer || null,
              irrigation || null,
              `AI prediction via AgroPredict. Variety: ${variety || 'Unknown'}`
            ]);
            recordId = yrResult.insertId;
          }
        }
      } catch (dbErr) {
        console.warn('Could not save yield record:', dbErr.message);
        // Don't fail the whole request if DB save fails
      }
    }

    res.json({ prediction, predictedKgHa, recordId });
  } catch (e) {
    console.error('POST /yield/predict error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/yield/records — all yield records with farmer & crop info
router.get('/records', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT yr.yield_id,
             yr.recorded_date,
             yr.actual_yield_kg,
             yr.predicted_yield_kg,
             yr.yield_per_ha,
             yr.quality_status,
             yr.irrigation_method,
             f.full_name  AS farmer_name,
             c.crop_name,
             d.district_name
        FROM yield_records yr
        JOIN farmer_crops fc ON fc.farmer_crop_id = yr.farmer_crop_id
        JOIN farmers f       ON f.farmer_id  = fc.farmer_id
        JOIN crops c         ON c.crop_id    = fc.crop_id
        JOIN districts d     ON d.district_id = f.district_id
       ORDER BY yr.recorded_date DESC
       LIMIT 50
    `);
    res.json({ records: rows || [] });
  } catch (e) {
    console.error('GET /yield/records error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
