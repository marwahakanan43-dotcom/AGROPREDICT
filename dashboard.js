const router = require('express').Router();
const db     = require('../db');

// GET /api/dashboard/summary
router.get('/summary', async (req, res) => {
  try {
    const [[farmerRow]]   = await db.query('SELECT COUNT(*) AS total, SUM(total_area_ha) AS land FROM farmers');
    const [[activeRow]]   = await db.query("SELECT COUNT(*) AS cnt FROM farmers WHERE status = 'Active'");
    const [[alertRow]]    = await db.query("SELECT COUNT(*) AS cnt FROM disease_alerts WHERE is_active = 1");
    const [[cropRow]]     = await db.query('SELECT COUNT(DISTINCT crop_id) AS cnt FROM farmer_crops WHERE is_active = 1');
    const [[yieldAvgRow]] = await db.query('SELECT AVG(yield_per_ha) AS avg FROM yield_records');

    // Recent yield records
    const [recentYields] = await db.query(`
      SELECT yr.recorded_date, c.crop_name, f.full_name AS farmer_name,
             yr.actual_yield_kg, yr.quality_status
        FROM yield_records yr
        JOIN farmer_crops fc ON fc.farmer_crop_id = yr.farmer_crop_id
        JOIN farmers f ON f.farmer_id = fc.farmer_id
        JOIN crops   c ON c.crop_id   = fc.crop_id
       ORDER BY yr.recorded_date DESC
       LIMIT 8
    `);

    // Yield by crop for chart
    const [yieldByCrop] = await db.query(`
      SELECT c.crop_name, ROUND(AVG(yr.yield_per_ha)) AS avg_yield
        FROM yield_records yr
        JOIN farmer_crops fc ON fc.farmer_crop_id = yr.farmer_crop_id
        JOIN crops   c ON c.crop_id = fc.crop_id
       GROUP BY c.crop_name
       ORDER BY avg_yield DESC
    `);

    res.json({
      metrics: {
        totalFarmers:  farmerRow.total,
        totalLandHa:   parseFloat(farmerRow.land || 0).toFixed(1),
        activeFarmers: activeRow.cnt,
        activeAlerts:  alertRow.cnt,
        activeCrops:   cropRow.cnt,
        avgYieldKgHa:  Math.round(yieldAvgRow.avg || 0),
      },
      recentYields,
      yieldByCrop,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
