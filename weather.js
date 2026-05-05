const router  = require('express').Router();
const https   = require('https');
const db      = require('../db');
const { callClaude, AGRO_SYSTEM } = require('../claude');

const DISTRICT_COORDS = {
  Hisar:     { lat: 29.1492, lon: 75.7217 },
  Sirsa:     { lat: 29.5326, lon: 75.0316 },
  Fatehabad: { lat: 29.5116, lon: 75.4535 },
  Bhiwani:   { lat: 28.7975, lon: 76.1322 },
  Rohtak:    { lat: 28.8955, lon: 76.5775 },
  Karnal:    { lat: 29.6857, lon: 76.9905 },
};

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function weatherIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 2) return '⛅';
  if (code <= 3) return '☁';
  if (code <= 49) return '🌫';
  if (code <= 59) return '🌦';
  if (code <= 69) return '🌧';
  if (code <= 79) return '❄';
  if (code <= 84) return '🌧';
  if (code <= 99) return '⛈';
  return '🌤';
}

function weatherDesc(code) {
  if (code === 0) return 'Clear sky';
  if (code <= 2) return 'Partly cloudy';
  if (code <= 3) return 'Overcast';
  if (code <= 49) return 'Foggy';
  if (code <= 59) return 'Drizzle';
  if (code <= 69) return 'Rain';
  if (code <= 79) return 'Snow';
  if (code <= 84) return 'Rain showers';
  if (code <= 99) return 'Thunderstorm';
  return 'Clear';
}

// GET /api/weather/:district
router.get('/:district', async (req, res) => {
  const district = req.params.district;
  const coords   = DISTRICT_COORDS[district];
  if (!coords) return res.status(400).json({ error: 'Unknown district' });

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=Asia%2FKolkata&forecast_days=7`;

    const weather = await httpsGet(url);
    const c = weather.current;
    const d = weather.daily;

    const soilMoisture = Math.min(100, Math.round(c.relative_humidity_2m * 0.55 + 10));

    const forecast = d.time.map((date, i) => ({
      date,
      tempHighC: d.temperature_2m_max[i],
      tempLowC:  d.temperature_2m_min[i],
      rainfallChancePct: d.precipitation_probability_max[i],
      weatherCode: d.weather_code[i],
      icon: weatherIcon(d.weather_code[i]),
    }));

    const data = {
      district,
      tempC:           Math.round(c.temperature_2m),
      feelsLikeC:      Math.round(c.temperature_2m - 2),
      humidityPct:     c.relative_humidity_2m,
      windSpeedKmph:   Math.round(c.wind_speed_10m),
      windDirection:   degToDir(c.wind_direction_10m),
      description:     weatherDesc(c.weather_code),
      weatherCode:     c.weather_code,
      icon:            weatherIcon(c.weather_code),
      uvIndex:         8,
      soilMoisturePct: soilMoisture,
      forecast,
      irrigationAdvisory: soilMoisture < 45 ? 'Soil moisture is low. Irrigate Wheat and Mustard plots in the next 24–48 hours.' : null,
      cropAdvisories: buildCropAdvisories(c, soilMoisture),
    };

    saveWeatherToDB(district, data);
    res.json({ source: 'open-meteo', data });

  } catch (e) {
    console.error('Weather error:', e.message);
    res.json({ source: 'db', data: await getWeatherFromDB(district) });
  }
});

function degToDir(deg) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function buildCropAdvisories(c, soilMoisture) {
  const advisories = [];
  const temp  = c.temperature_2m;
  const humid = c.relative_humidity_2m;
  if (temp > 35)    advisories.push({ crop: 'Wheat',  advisory: 'High temperatures may stress grain filling. Irrigate if soil moisture < 50%.' });
  if (humid > 70)   advisories.push({ crop: 'Cotton', advisory: 'High humidity — watch for boll rot. Avoid overhead irrigation.' });
  if (soilMoisture < 40) advisories.push({ crop: 'Rice', advisory: 'Prepare nursery beds. Water availability critical for transplanting.' });
  return advisories;
}

async function getWeatherFromDB(district) {
  try {
    const [[dist]] = await db.query('SELECT district_id FROM districts WHERE district_name = ?', [district]);
    if (!dist) return null;
    const [[row]] = await db.query(`SELECT * FROM weather_readings WHERE district_id = ? ORDER BY reading_date DESC LIMIT 1`, [dist.district_id]);
    return row || null;
  } catch (e) { return null; }
}

async function saveWeatherToDB(district, data) {
  try {
    const [[dist]] = await db.query('SELECT district_id FROM districts WHERE district_name = ?', [district]);
    if (!dist) return;
    await db.query(`
      INSERT INTO weather_readings
        (district_id, reading_date, temp_max_c, temp_min_c, humidity_pct, wind_kmh, wind_direction, soil_moisture_pct, uv_index, \`condition\`)
      VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        temp_max_c=VALUES(temp_max_c), humidity_pct=VALUES(humidity_pct),
        wind_kmh=VALUES(wind_kmh), soil_moisture_pct=VALUES(soil_moisture_pct)
    `, [dist.district_id, data.tempC, data.tempC - 5, data.humidityPct,
      data.windSpeedKmph, data.windDirection, data.soilMoisturePct, data.uvIndex, 'Sunny']);
  } catch (e) { /* non-critical */ }
}

// POST /api/weather/advisory
router.post('/advisory', async (req, res) => {
  const { district, crop, weatherSummary } = req.body;
  const prompt = `Weather-based crop advisory for a Haryana farmer in ${district}:
Crop: ${crop}
Current conditions: ${weatherSummary}
Season: May 2026 (Kharif preparation)
Provide a 5-point weather-based advisory covering irrigation, harvest timing, kharif prep, and pest alerts.`;

  try {
    const advisory = await callClaude([{ role: 'user', content: prompt }], AGRO_SYSTEM, 600);
    res.json({ advisory });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;