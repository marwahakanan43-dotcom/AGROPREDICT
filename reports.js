const router = require('express').Router();
const db     = require('../db');

// GET /api/reports/summary
router.get('/summary', async (req, res) => {
  try {
    const [farmersByDistrict] = await db.query(`
      SELECT d.district_name,
             COUNT(*)                       AS total,
             ROUND(SUM(f.total_area_ha), 1) AS land,
             SUM(f.status = 'Active')       AS active,
             SUM(f.status = 'Low Yield')    AS low_yield
        FROM farmers f
        JOIN districts d ON d.district_id = f.district_id
       GROUP BY d.district_name
       ORDER BY total DESC
    `);

    const [cropStats] = await db.query(`
      SELECT c.crop_name, c.season,
             COUNT(DISTINCT fc.farmer_id)  AS farmers,
             ROUND(SUM(fc.area_ha), 1)     AS total_area
        FROM farmer_crops fc
        JOIN crops c ON c.crop_id = fc.crop_id
       WHERE fc.is_active = 1
       GROUP BY c.crop_name, c.season
       ORDER BY total_area DESC
    `);

    const [yieldStats] = await db.query(`
      SELECT c.crop_name,
             ROUND(AVG(yr.yield_per_ha)) AS avg_yield,
             ROUND(MAX(yr.yield_per_ha)) AS max_yield,
             ROUND(MIN(yr.yield_per_ha)) AS min_yield,
             COUNT(*)                    AS records
        FROM yield_records yr
        JOIN farmer_crops fc ON fc.farmer_crop_id = yr.farmer_crop_id
        JOIN crops c         ON c.crop_id = fc.crop_id
       GROUP BY c.crop_name
       ORDER BY avg_yield DESC
    `);

    const [alertStats] = await db.query(`
      SELECT severity, COUNT(*) AS count
        FROM disease_alerts
       WHERE is_active = 1
       GROUP BY severity
       ORDER BY FIELD(severity, 'Critical', 'High', 'Medium', 'Low')
    `);

    const [marketStats] = await db.query(`
      SELECT c.crop_name,
             ROUND(AVG(mp.price_per_quintal)) AS avg_price,
             MAX(mp.price_per_quintal)         AS max_price,
             MIN(mp.price_per_quintal)         AS min_price
        FROM market_prices mp
        JOIN crops c ON c.crop_id = mp.crop_id
       GROUP BY c.crop_name
       ORDER BY avg_price DESC
    `);

    const [[totals]] = await db.query(`
      SELECT
        COUNT(DISTINCT f.farmer_id)                              AS total_farmers,
        ROUND(SUM(f.total_area_ha), 1)                          AS total_land,
        COUNT(DISTINCT fc.crop_id)                              AS total_crops,
        (SELECT COUNT(*) FROM disease_alerts WHERE is_active=1) AS active_alerts,
        (SELECT COUNT(*) FROM yield_records)                    AS yield_records,
        (SELECT COUNT(*) FROM market_prices)                    AS price_records
        FROM farmers f
        LEFT JOIN farmer_crops fc ON fc.farmer_id = f.farmer_id
    `);

    res.json({
      totals:            totals            || {},
      farmersByDistrict: farmersByDistrict || [],
      cropStats:         cropStats         || [],
      yieldStats:        yieldStats        || [],
      alertStats:        alertStats        || [],
      marketStats:       marketStats       || [],
    });
  } catch (e) {
    console.error('GET /reports/summary error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/reports/yield-records
router.get('/yield-records', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT yr.yield_id,
             yr.recorded_date,
             yr.actual_yield_kg,
             yr.predicted_yield_kg,
             yr.yield_per_ha,
             yr.quality_status,
             yr.irrigation_method,
             yr.rainfall_mm,
             yr.avg_temp_c,
             yr.fertilizer_kgha,
             f.full_name  AS farmer_name,
             c.crop_name,
             d.district_name
        FROM yield_records yr
        JOIN farmer_crops fc ON fc.farmer_crop_id = yr.farmer_crop_id
        JOIN farmers f       ON f.farmer_id  = fc.farmer_id
        JOIN crops c         ON c.crop_id    = fc.crop_id
        JOIN districts d     ON d.district_id = f.district_id
       ORDER BY yr.recorded_date DESC
       LIMIT 100
    `);
    res.json({ records: rows || [] });
  } catch (e) {
    console.error('GET /reports/yield-records error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
