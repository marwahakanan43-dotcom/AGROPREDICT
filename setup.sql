-- AgroPredict Database Setup
-- Run: mysql -u root -pKanan@123 agropredict < setup.sql

USE agropredict;

-- ── Districts ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS districts (
  district_id   INT AUTO_INCREMENT PRIMARY KEY,
  district_name VARCHAR(100) NOT NULL UNIQUE
);

INSERT IGNORE INTO districts (district_name) VALUES
  ('Hisar'),('Sirsa'),('Fatehabad'),('Bhiwani'),
  ('Rohtak'),('Karnal'),('Jind'),('Hansi');

-- ── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  user_id       INT AUTO_INCREMENT PRIMARY KEY,
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(64)  NOT NULL,
  role          ENUM('Admin','Officer','Viewer') DEFAULT 'Officer',
  district_id   INT,
  last_login    DATETIME,
  FOREIGN KEY (district_id) REFERENCES districts(district_id)
);

INSERT IGNORE INTO users (full_name, email, password_hash, role) VALUES
  ('Admin User', 'admin@agropredict.in', SHA2('admin123', 256), 'Admin');

-- ── Crops ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crops (
  crop_id    INT AUTO_INCREMENT PRIMARY KEY,
  crop_name  VARCHAR(100) NOT NULL UNIQUE,
  local_name VARCHAR(100),
  season     ENUM('Kharif','Rabi','Zaid','All') DEFAULT 'Rabi'
);

INSERT IGNORE INTO crops (crop_name, local_name, season) VALUES
  ('Wheat',     'Gehun',   'Rabi'),
  ('Rice',      'Dhan',    'Kharif'),
  ('Corn',      'Makka',   'Kharif'),
  ('Mustard',   'Sarson',  'Rabi'),
  ('Cotton',    'Kapas',   'Kharif'),
  ('Barley',    'Jau',     'Rabi'),
  ('Sugarcane', 'Ganna',   'All');

-- ── Farmers ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS farmers (
  farmer_id    INT AUTO_INCREMENT PRIMARY KEY,
  full_name    VARCHAR(100) NOT NULL,
  phone        VARCHAR(15),
  district_id  INT NOT NULL,
  village      VARCHAR(100),
  total_area_ha DECIMAL(8,2) DEFAULT 0,
  soil_type    ENUM('Loamy','Sandy','Clay','Silt','Sandy Loam') DEFAULT 'Loamy',
  status       ENUM('Active','Inactive','Low Yield') DEFAULT 'Active',
  registered_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (district_id) REFERENCES districts(district_id)
);

INSERT IGNORE INTO farmers (full_name, phone, district_id, village, total_area_ha, soil_type, status) VALUES
  ('Ramesh Kumar',   '9812345601', 1, 'Adampur',   4.5, 'Loamy',     'Active'),
  ('Suresh Singh',   '9812345602', 2, 'Ellenabad', 6.0, 'Sandy',     'Active'),
  ('Mohan Lal',      '9812345603', 3, 'Tohana',    3.2, 'Clay',      'Low Yield'),
  ('Rajvir Yadav',   '9812345604', 4, 'Loharu',    8.1, 'Loamy',     'Active'),
  ('Kamal Sharma',   '9812345605', 5, 'Asthal',    5.5, 'Sandy Loam','Active');

-- ── Farmer Crops ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS farmer_crops (
  farmer_crop_id INT AUTO_INCREMENT PRIMARY KEY,
  farmer_id      INT NOT NULL,
  crop_id        INT NOT NULL,
  area_ha        DECIMAL(8,2),
  season_year    YEAR,
  is_active      TINYINT(1) DEFAULT 1,
  UNIQUE KEY uq_farmer_crop_year (farmer_id, crop_id, season_year),
  FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id) ON DELETE CASCADE,
  FOREIGN KEY (crop_id)   REFERENCES crops(crop_id)
);

INSERT IGNORE INTO farmer_crops (farmer_id, crop_id, area_ha, season_year, is_active) VALUES
  (1, 1, 3.0, 2026, 1),
  (1, 4, 1.5, 2026, 1),
  (2, 5, 5.0, 2026, 1),
  (3, 2, 3.2, 2026, 1),
  (4, 1, 4.0, 2026, 1),
  (5, 3, 2.5, 2026, 1);

-- ── Market Prices ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_prices (
  price_id         INT AUTO_INCREMENT PRIMARY KEY,
  crop_id          INT NOT NULL,
  district_id      INT NOT NULL,
  price_date       DATE NOT NULL,
  price_per_quintal DECIMAL(8,2) NOT NULL,
  price_change     DECIMAL(6,2) DEFAULT 0,
  mandi_name       VARCHAR(100),
  UNIQUE KEY uq_crop_dist_date (crop_id, district_id, price_date),
  FOREIGN KEY (crop_id)     REFERENCES crops(crop_id),
  FOREIGN KEY (district_id) REFERENCES districts(district_id)
);

INSERT IGNORE INTO market_prices (crop_id, district_id, price_date, price_per_quintal, price_change, mandi_name) VALUES
  (1, 1, CURDATE(), 2150,  45, 'Hisar Mandi'),
  (2, 1, CURDATE(), 3100, -20, 'Hisar Mandi'),
  (3, 1, CURDATE(), 1892,  80, 'Hisar Mandi'),
  (4, 1, CURDATE(), 5200,  80, 'Hisar Mandi'),
  (5, 1, CURDATE(), 6800,-150, 'Hisar Mandi'),
  (6, 1, CURDATE(), 1750,  30, 'Hisar Mandi');

-- ── Disease Alerts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS disease_alerts (
  alert_id      INT AUTO_INCREMENT PRIMARY KEY,
  crop_id       INT NOT NULL,
  district_id   INT NOT NULL,
  disease_name  VARCHAR(150) NOT NULL,
  alert_type    ENUM('Disease','Pest','Weather','Nutrient') DEFAULT 'Disease',
  severity      ENUM('Low','Medium','High','Critical') DEFAULT 'Medium',
  description   TEXT,
  reported_date DATE,
  is_active     TINYINT(1) DEFAULT 1,
  FOREIGN KEY (crop_id)     REFERENCES crops(crop_id),
  FOREIGN KEY (district_id) REFERENCES districts(district_id)
);

INSERT IGNORE INTO disease_alerts (crop_id, district_id, disease_name, alert_type, severity, description, reported_date, is_active) VALUES
  (1, 1, 'Yellow Rust',        'Disease', 'High',   'Yellow rust (Puccinia striiformis) detected in Wheat fields. Immediate fungicide spray required.', '2026-05-01', 1),
  (1, 2, 'Yellow Rust',        'Disease', 'High',   'Spread confirmed from Hisar region. Check all wheat plots.', '2026-05-01', 1),
  (4, 3, 'Aphid Infestation',  'Pest',    'Medium', 'Aphid colonies on Mustard in Bhiwani. Spray recommended.', '2026-04-30', 1),
  (2, 4, 'Leaf Blight',        'Disease', 'Medium', 'Rice leaf blight (Xanthomonas oryzae) in Fatehabad. Monitor and treat.', '2026-04-28', 1),
  (6, 5, 'Powdery Mildew',     'Disease', 'Low',    'Powdery mildew on Barley in Rohtak. Preventive action only.', '2026-04-29', 1);

-- ── Yield Records ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS yield_records (
  yield_id           INT AUTO_INCREMENT PRIMARY KEY,
  farmer_crop_id     INT NOT NULL,
  recorded_date      DATE,
  actual_yield_kg    INT,
  predicted_yield_kg INT,
  yield_per_ha       INT,
  quality_status     ENUM('Excellent','Good','Average','Low','Failed') DEFAULT 'Good',
  irrigation_method  VARCHAR(50),
  rainfall_mm        DECIMAL(6,1),
  avg_temp_c         DECIMAL(4,1),
  fertilizer_kgha    DECIMAL(6,1),
  notes              TEXT,
  FOREIGN KEY (farmer_crop_id) REFERENCES farmer_crops(farmer_crop_id) ON DELETE CASCADE
);

-- ── Weather Readings ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weather_readings (
  reading_id        INT AUTO_INCREMENT PRIMARY KEY,
  district_id       INT NOT NULL,
  reading_date      DATE NOT NULL,
  temp_max_c        DECIMAL(4,1),
  temp_min_c        DECIMAL(4,1),
  humidity_pct      INT,
  wind_kmh          INT,
  wind_direction    VARCHAR(3),
  soil_moisture_pct INT,
  uv_index          INT,
  `condition`       VARCHAR(50),
  UNIQUE KEY uq_dist_date (district_id, reading_date),
  FOREIGN KEY (district_id) REFERENCES districts(district_id)
);

SELECT '✅ AgroPredict database setup complete!' AS Status;
SELECT CONCAT('Tables created with sample data. Login: admin@agropredict.in / admin123') AS Info;
