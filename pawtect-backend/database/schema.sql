CREATE DATABASE IF NOT EXISTS pawtect_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE pawtect_db;

CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  username VARCHAR(60) NULL UNIQUE,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  contact_number VARCHAR(30) NULL,
  birthday DATE NULL,
  role ENUM('reporter','rescuer','admin') NOT NULL DEFAULT 'reporter',
  account_status ENUM('active','pending','suspended','disabled') NOT NULL DEFAULT 'active',
  email_verified TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_email_token_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_email_token_hash (token_hash)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rescuer_profiles (
  rescuer_profile_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  application_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  experience TEXT NULL,
  address TEXT NULL,
  reviewed_by INT NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rescuer_profile_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_rescuer_profile_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rescuer_verification_documents (
  document_id INT AUTO_INCREMENT PRIMARY KEY,
  rescuer_profile_id INT NOT NULL,
  document_type VARCHAR(100) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  verification_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rescuer_doc_profile FOREIGN KEY (rescuer_profile_id) REFERENCES rescuer_profiles(rescuer_profile_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stray_reports (
  report_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  animal_type ENUM('dog','cat','other') NOT NULL,
  photo_url VARCHAR(500) NULL,
  animal_description TEXT NULL,
  `condition` ENUM('injured','sick','healthy','unknown') NOT NULL DEFAULT 'unknown',
  urgency ENUM('urgent','medium','low') NOT NULL DEFAULT 'medium',
  location_address VARCHAR(500) NOT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  location_hint TEXT NULL,
  status ENUM('reported','accepted','en_route','arrived','rescued','brought_to_vet','brought_to_shelter','rejected') NOT NULL DEFAULT 'reported',
  rejection_reason TEXT NULL,
  escalated TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_report_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  INDEX idx_report_status (status),
  INDEX idx_report_location (latitude, longitude)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rescue_cases (
  case_id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  rescuer_id INT NOT NULL,
  status ENUM('accepted','en_route','arrived','completed','not_found','cancelled') NOT NULL DEFAULT 'accepted',
  cancellation_reason TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_case_report FOREIGN KEY (report_id) REFERENCES stray_reports(report_id),
  CONSTRAINT fk_case_rescuer FOREIGN KEY (rescuer_id) REFERENCES users(user_id),
  INDEX idx_case_rescuer (rescuer_id),
  INDEX idx_case_report (report_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rescue_outcomes (
  outcome_id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  outcome_type ENUM('rescued','brought_to_vet','brought_to_shelter','animal_not_found') NOT NULL,
  facility_name VARCHAR(255) NULL,
  photo_url VARCHAR(500) NULL,
  notes TEXT NULL,
  show_on_map TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_outcome_case FOREIGN KEY (case_id) REFERENCES rescue_cases(case_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS case_status_log (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  case_id INT NULL,
  actor_user_id INT NULL,
  previous_status VARCHAR(50) NULL,
  new_status VARCHAR(50) NOT NULL,
  remarks TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_log_report FOREIGN KEY (report_id) REFERENCES stray_reports(report_id) ON DELETE CASCADE,
  CONSTRAINT fk_log_case FOREIGN KEY (case_id) REFERENCES rescue_cases(case_id) ON DELETE SET NULL,
  CONSTRAINT fk_log_actor FOREIGN KEY (actor_user_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS alert_zones (
  alert_zone_id INT AUTO_INCREMENT PRIMARY KEY,
  rescuer_id INT NOT NULL,
  zone_name VARCHAR(150) NULL,
  center_latitude DECIMAL(10,7) NOT NULL,
  center_longitude DECIMAL(10,7) NOT NULL,
  radius_km DECIMAL(7,2) NOT NULL DEFAULT 5.00,
  animal_type ENUM('dog','cat','other','all') NOT NULL DEFAULT 'all',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_alert_zone_rescuer FOREIGN KEY (rescuer_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  report_id INT NULL,
  case_id INT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  notification_type VARCHAR(60) NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_report FOREIGN KEY (report_id) REFERENCES stray_reports(report_id) ON DELETE SET NULL,
  CONSTRAINT fk_notification_case FOREIGN KEY (case_id) REFERENCES rescue_cases(case_id) ON DELETE SET NULL,
  INDEX idx_notification_user_read (user_id, is_read)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS report_escalations (
  escalation_id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  escalation_level TINYINT NOT NULL DEFAULT 1,
  reason TEXT NULL,
  response_status ENUM('pending','handled','dismissed') NOT NULL DEFAULT 'pending',
  handled_by INT NULL,
  handled_at DATETIME NULL,
  remarks TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_escalation_report FOREIGN KEY (report_id) REFERENCES stray_reports(report_id) ON DELETE CASCADE,
  CONSTRAINT fk_escalation_handler FOREIGN KEY (handled_by) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;
