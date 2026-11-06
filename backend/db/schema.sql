CREATE TABLE IF NOT EXISTS airports (
  iata CHAR(3) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  city VARCHAR(128),
  latitude DECIMAL(9, 6),
  longitude DECIMAL(9, 6),
  scheduled_service BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS schedule_imports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source VARCHAR(32) NOT NULL,
  scope JSON NOT NULL,
  status ENUM('running', 'completed', 'failed') NOT NULL DEFAULT 'running',
  summary JSON,
  error TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL
);

-- One row per scheduled service (a weekly pattern), not per dated departure.
-- effective_from / effective_to are NULL when the source gives no validity window.
CREATE TABLE IF NOT EXISTS flights (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  source VARCHAR(32) NOT NULL,
  service_key VARCHAR(191) NOT NULL,
  airline_code VARCHAR(3) NOT NULL,
  flight_no VARCHAR(16) NOT NULL,
  dep_airport CHAR(3) NOT NULL,
  arr_airport CHAR(3) NOT NULL,
  dep_time TIME NOT NULL,
  arr_time TIME NOT NULL,
  arr_day_offset TINYINT NOT NULL DEFAULT 0,
  days_of_week VARCHAR(7) NOT NULL,
  effective_from DATE NULL,
  effective_to DATE NULL,
  aircraft VARCHAR(16),
  content_hash CHAR(40) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_import_id INT NOT NULL,
  last_confirmed_at TIMESTAMP NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_flight_service (source, service_key),
  KEY idx_flight_lookup (flight_no, dep_airport, arr_airport)
);

-- Every itinerary a live fare call returned, used as the source of rough fare estimates
CREATE TABLE IF NOT EXISTS fare_observations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  origin CHAR(3) NOT NULL,
  destination CHAR(3) NOT NULL,
  departure_date DATE NOT NULL,
  stops VARCHAR(64) NOT NULL,
  price DECIMAL(12, 2) NOT NULL,
  currency CHAR(3) NOT NULL,
  segments JSON NOT NULL,
  observed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_fare_lookup (origin, destination, departure_date)
);
