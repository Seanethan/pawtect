DROP DATABASE IF EXISTS pawtect_db;

CREATE DATABASE pawtect_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

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







-- ============================================
-- 1. DEMO USERS
-- 5 REPORTERS + 5 RESCUERS
-- ============================================

INSERT IGNORE INTO users
(first_name, last_name, username, email, password_hash,
 contact_number, birthday, role, account_status, email_verified)
VALUES
('Maria', 'Santos', 'maria_santos', 'maria.demo@pawtect.test',
 'DEMO_ONLY_NOT_A_REAL_PASSWORD_HASH', '09171234501', '2002-04-15', 'reporter', 'active', 1),

('Juan', 'Dela Cruz', 'juan_dc', 'juan.demo@pawtect.test',
 'DEMO_ONLY_NOT_A_REAL_PASSWORD_HASH', '09171234502', '2001-08-22', 'reporter', 'active', 1),

('Angela', 'Reyes', 'angela_reyes', 'angela.demo@pawtect.test',
 'DEMO_ONLY_NOT_A_REAL_PASSWORD_HASH', '09171234503', '2003-01-10', 'reporter', 'pending', 0),

('Carlo', 'Garcia', 'carlo_g', 'carlo.demo@pawtect.test',
 'DEMO_ONLY_NOT_A_REAL_PASSWORD_HASH', '09171234504', '2000-11-05', 'reporter', 'suspended', 1),

('Sofia', 'Ramos', 'sofia_r', 'sofia.demo@pawtect.test',
 'DEMO_ONLY_NOT_A_REAL_PASSWORD_HASH', '09171234505', '2002-06-30', 'reporter', 'active', 1),

('Mark', 'Villanueva', 'mark_v', 'mark.rescuer@pawtect.test',
 'DEMO_ONLY_NOT_A_REAL_PASSWORD_HASH', '09181234501', '1998-02-14', 'rescuer', 'active', 1),

('Lea', 'Mendoza', 'lea_m', 'lea.rescuer@pawtect.test',
 'DEMO_ONLY_NOT_A_REAL_PASSWORD_HASH', '09181234502', '1995-07-19', 'rescuer', 'active', 1),

('Kevin', 'Torres', 'kevin_t', 'kevin.rescuer@pawtect.test',
 'DEMO_ONLY_NOT_A_REAL_PASSWORD_HASH', '09181234503', '2000-03-25', 'rescuer', 'pending', 0),

('Patricia', 'Flores', 'patricia_f', 'patricia.rescuer@pawtect.test',
 'DEMO_ONLY_NOT_A_REAL_PASSWORD_HASH', '09181234504', '1997-12-08', 'rescuer', 'active', 1),

('Daniel', 'Bautista', 'daniel_b', 'daniel.rescuer@pawtect.test',
 'DEMO_ONLY_NOT_A_REAL_PASSWORD_HASH', '09181234505', '1999-09-17', 'rescuer', 'suspended', 1);


-- ============================================
-- 2. RESCUER PROFILES
-- ============================================

INSERT IGNORE INTO rescuer_profiles
(user_id, application_status, experience, address, reviewed_by, reviewed_at)
VALUES
(
  (SELECT user_id FROM users WHERE email = 'mark.rescuer@pawtect.test'),
  'approved',
  'Three years of volunteer animal rescue experience. Experienced in handling injured dogs and cats.',
  'Malanday, Valenzuela City',
  NULL,
  NOW() - INTERVAL 5 DAY
),
(
  (SELECT user_id FROM users WHERE email = 'lea.rescuer@pawtect.test'),
  'approved',
  'Former animal shelter volunteer. Experienced in transporting animals to veterinary clinics.',
  'Marulas, Valenzuela City',
  NULL,
  NOW() - INTERVAL 3 DAY
),
(
  (SELECT user_id FROM users WHERE email = 'kevin.rescuer@pawtect.test'),
  'pending',
  'Beginner volunteer. Has experience feeding and assisting stray animals in the community.',
  'Karuhatan, Valenzuela City',
  NULL,
  NULL
),
(
  (SELECT user_id FROM users WHERE email = 'patricia.rescuer@pawtect.test'),
  'rejected',
  'One year of animal care experience. Application requires additional verification documents.',
  'Dalandanan, Valenzuela City',
  NULL,
  NOW() - INTERVAL 2 DAY
),
(
  (SELECT user_id FROM users WHERE email = 'daniel.rescuer@pawtect.test'),
  'pending',
  'Interested in animal rescue and community volunteer work.',
  'Gen. T. de Leon, Valenzuela City',
  NULL,
  NULL
);


-- ============================================
-- 3. RESCUER VERIFICATION DOCUMENTS
-- ============================================

INSERT INTO rescuer_verification_documents
(rescuer_profile_id, document_type, file_url, verification_status)
SELECT rescuer_profile_id, 'Valid Government ID',
       'uploads/demo/mark-id.jpg', 'approved'
FROM rescuer_profiles
WHERE user_id = (SELECT user_id FROM users WHERE email = 'mark.rescuer@pawtect.test');

INSERT INTO rescuer_verification_documents
(rescuer_profile_id, document_type, file_url, verification_status)
SELECT rescuer_profile_id, 'Volunteer Certificate',
       'uploads/demo/lea-certificate.jpg', 'approved'
FROM rescuer_profiles
WHERE user_id = (SELECT user_id FROM users WHERE email = 'lea.rescuer@pawtect.test');

INSERT INTO rescuer_verification_documents
(rescuer_profile_id, document_type, file_url, verification_status)
SELECT rescuer_profile_id, 'Government ID',
       'uploads/demo/kevin-id.jpg', 'pending'
FROM rescuer_profiles
WHERE user_id = (SELECT user_id FROM users WHERE email = 'kevin.rescuer@pawtect.test');

INSERT INTO rescuer_verification_documents
(rescuer_profile_id, document_type, file_url, verification_status)
SELECT rescuer_profile_id, 'Proof of Address',
       'uploads/demo/patricia-address.jpg', 'rejected'
FROM rescuer_profiles
WHERE user_id = (SELECT user_id FROM users WHERE email = 'patricia.rescuer@pawtect.test');

INSERT INTO rescuer_verification_documents
(rescuer_profile_id, document_type, file_url, verification_status)
SELECT rescuer_profile_id, 'Government ID',
       'uploads/demo/daniel-id.jpg', 'pending'
FROM rescuer_profiles
WHERE user_id = (SELECT user_id FROM users WHERE email = 'daniel.rescuer@pawtect.test');


-- ============================================
-- 4. STRAY ANIMAL REPORTS
-- ============================================

INSERT INTO stray_reports
(user_id, animal_type, photo_url, animal_description, `condition`,
 urgency, location_address, latitude, longitude, location_hint,
 status, rejection_reason, escalated, created_at)
VALUES
(
  (SELECT user_id FROM users WHERE email = 'maria.demo@pawtect.test'),
  'dog',
  'uploads/demo/stray-dog-01.jpg',
  'Brown medium-sized dog with a visible wound on its front leg.',
  'injured',
  'urgent',
  'Malanday, Valenzuela City, Philippines',
  14.7008000, 120.9650000,
  'Near the public market entrance.',
  'accepted',
  NULL,
  1,
  NOW() - INTERVAL 2 DAY
),
(
  (SELECT user_id FROM users WHERE email = 'juan.demo@pawtect.test'),
  'cat',
  'uploads/demo/stray-cat-02.jpg',
  'Small white cat with signs of illness and watery eyes.',
  'sick',
  'medium',
  'Marulas, Valenzuela City, Philippines',
  14.6935000, 120.9700000,
  'Beside a small convenience store.',
  'en_route',
  NULL,
  0,
  NOW() - INTERVAL 1 DAY
),
(
  (SELECT user_id FROM users WHERE email = 'angela.demo@pawtect.test'),
  'dog',
  'uploads/demo/stray-dog-03.jpg',
  'Black puppy found wandering without its mother.',
  'healthy',
  'low',
  'Karuhatan, Valenzuela City, Philippines',
  14.6850000, 120.9780000,
  'Near the basketball court.',
  'arrived',
  NULL,
  0,
  NOW() - INTERVAL 12 HOUR
),
(
  (SELECT user_id FROM users WHERE email = 'carlo.demo@pawtect.test'),
  'cat',
  'uploads/demo/stray-cat-04.jpg',
  'Orange cat successfully rescued and transported for treatment.',
  'injured',
  'urgent',
  'Dalandanan, Valenzuela City, Philippines',
  14.7060000, 120.9800000,
  'Near the residential gate.',
  'brought_to_vet',
  NULL,
  0,
  NOW() - INTERVAL 4 DAY
),
(
  (SELECT user_id FROM users WHERE email = 'sofia.demo@pawtect.test'),
  'other',
  'uploads/demo/stray-animal-05.jpg',
  'Animal report could not be verified. No animal was found at the provided location.',
  'unknown',
  'medium',
  'Gen. T. de Leon, Valenzuela City, Philippines',
  14.6950000, 120.9900000,
  'Near the tricycle terminal.',
  'rejected',
  'The reported animal could not be located after verification.',
  1,
  NOW() - INTERVAL 6 DAY
);


-- ============================================
-- 5. RESCUE CASES
-- ============================================

INSERT INTO rescue_cases
(report_id, rescuer_id, status, cancellation_reason)
VALUES
(
  (SELECT report_id FROM stray_reports WHERE location_address = 'Malanday, Valenzuela City, Philippines'),
  (SELECT user_id FROM users WHERE email = 'mark.rescuer@pawtect.test'),
  'accepted',
  NULL
),
(
  (SELECT report_id FROM stray_reports WHERE location_address = 'Marulas, Valenzuela City, Philippines'),
  (SELECT user_id FROM users WHERE email = 'lea.rescuer@pawtect.test'),
  'en_route',
  NULL
),
(
  (SELECT report_id FROM stray_reports WHERE location_address = 'Karuhatan, Valenzuela City, Philippines'),
  (SELECT user_id FROM users WHERE email = 'mark.rescuer@pawtect.test'),
  'arrived',
  NULL
),
(
  (SELECT report_id FROM stray_reports WHERE location_address = 'Dalandanan, Valenzuela City, Philippines'),
  (SELECT user_id FROM users WHERE email = 'lea.rescuer@pawtect.test'),
  'completed',
  NULL
),
(
  (SELECT report_id FROM stray_reports WHERE location_address = 'Gen. T. de Leon, Valenzuela City, Philippines'),
  (SELECT user_id FROM users WHERE email = 'daniel.rescuer@pawtect.test'),
  'cancelled',
  'Report could not be verified at the specified location.'
);


-- ============================================
-- 6. RESCUE OUTCOMES
-- ============================================

INSERT INTO rescue_outcomes
(case_id, outcome_type, facility_name, photo_url, notes, show_on_map)
SELECT case_id, 'rescued', NULL,
       'uploads/demo/outcome-01.jpg',
       'Animal rescue is still being coordinated.',
       0
FROM rescue_cases
WHERE report_id = (
  SELECT report_id FROM stray_reports
  WHERE location_address = 'Malanday, Valenzuela City, Philippines'
);

INSERT INTO rescue_outcomes
(case_id, outcome_type, facility_name, photo_url, notes, show_on_map)
SELECT case_id, 'brought_to_vet', 'Valenzuela Veterinary Clinic',
       'uploads/demo/outcome-02.jpg',
       'Animal is being transported for medical attention.',
       1
FROM rescue_cases
WHERE report_id = (
  SELECT report_id FROM stray_reports
  WHERE location_address = 'Marulas, Valenzuela City, Philippines'
);

INSERT INTO rescue_outcomes
(case_id, outcome_type, facility_name, photo_url, notes, show_on_map)
SELECT case_id, 'rescued', NULL,
       'uploads/demo/outcome-03.jpg',
       'Puppy has been safely secured by the rescue team.',
       1
FROM rescue_cases
WHERE report_id = (
  SELECT report_id FROM stray_reports
  WHERE location_address = 'Karuhatan, Valenzuela City, Philippines'
);

INSERT INTO rescue_outcomes
(case_id, outcome_type, facility_name, photo_url, notes, show_on_map)
SELECT case_id, 'brought_to_vet', 'Happy Paws Animal Clinic',
       'uploads/demo/outcome-04.jpg',
       'Cat was transported to the clinic for treatment.',
       1
FROM rescue_cases
WHERE report_id = (
  SELECT report_id FROM stray_reports
  WHERE location_address = 'Dalandanan, Valenzuela City, Philippines'
);

INSERT INTO rescue_outcomes
(case_id, outcome_type, facility_name, photo_url, notes, show_on_map)
SELECT case_id, 'animal_not_found', NULL,
       NULL,
       'No animal was found at the reported location.',
       0
FROM rescue_cases
WHERE report_id = (
  SELECT report_id FROM stray_reports
  WHERE location_address = 'Gen. T. de Leon, Valenzuela City, Philippines'
);


-- ============================================
-- 7. CASE STATUS LOGS
-- ============================================

INSERT INTO case_status_log
(report_id, case_id, actor_user_id, previous_status, new_status, remarks)
SELECT r.report_id, c.case_id, c.rescuer_id,
       NULL, 'accepted',
       'Rescuer accepted the reported case.'
FROM stray_reports r
JOIN rescue_cases c ON c.report_id = r.report_id
WHERE r.location_address = 'Malanday, Valenzuela City, Philippines';

INSERT INTO case_status_log
(report_id, case_id, actor_user_id, previous_status, new_status, remarks)
SELECT r.report_id, c.case_id, c.rescuer_id,
       'accepted', 'en_route',
       'Rescuer is on the way to the reported location.'
FROM stray_reports r
JOIN rescue_cases c ON c.report_id = r.report_id
WHERE r.location_address = 'Marulas, Valenzuela City, Philippines';

INSERT INTO case_status_log
(report_id, case_id, actor_user_id, previous_status, new_status, remarks)
SELECT r.report_id, c.case_id, c.rescuer_id,
       'en_route', 'arrived',
       'Rescue team has arrived at the location.'
FROM stray_reports r
JOIN rescue_cases c ON c.report_id = r.report_id
WHERE r.location_address = 'Karuhatan, Valenzuela City, Philippines';

INSERT INTO case_status_log
(report_id, case_id, actor_user_id, previous_status, new_status, remarks)
SELECT r.report_id, c.case_id, c.rescuer_id,
       'arrived', 'completed',
       'Animal was transported to a veterinary clinic.'
FROM stray_reports r
JOIN rescue_cases c ON c.report_id = r.report_id
WHERE r.location_address = 'Dalandanan, Valenzuela City, Philippines';

INSERT INTO case_status_log
(report_id, case_id, actor_user_id, previous_status, new_status, remarks)
SELECT r.report_id, c.case_id, c.rescuer_id,
       'accepted', 'cancelled',
       'Rescue attempt cancelled because the animal was not found.'
FROM stray_reports r
JOIN rescue_cases c ON c.report_id = r.report_id
WHERE r.location_address = 'Gen. T. de Leon, Valenzuela City, Philippines';


-- ============================================
-- 8. ALERT ZONES
-- ============================================

INSERT INTO alert_zones
(rescuer_id, zone_name, center_latitude, center_longitude,
 radius_km, animal_type, is_active)
VALUES
(
  (SELECT user_id FROM users WHERE email = 'mark.rescuer@pawtect.test'),
  'Malanday Rescue Zone', 14.7008000, 120.9650000, 5.00, 'dog', 1
),
(
  (SELECT user_id FROM users WHERE email = 'lea.rescuer@pawtect.test'),
  'Marulas Rescue Zone', 14.6935000, 120.9700000, 3.00, 'cat', 1
),
(
  (SELECT user_id FROM users WHERE email = 'mark.rescuer@pawtect.test'),
  'Karuhatan Community Zone', 14.6850000, 120.9780000, 4.50, 'all', 1
),
(
  (SELECT user_id FROM users WHERE email = 'lea.rescuer@pawtect.test'),
  'Dalandanan Animal Zone', 14.7060000, 120.9800000, 2.50, 'dog', 0
),
(
  (SELECT user_id FROM users WHERE email = 'daniel.rescuer@pawtect.test'),
  'Gen. T. de Leon Zone', 14.6950000, 120.9900000, 6.00, 'all', 1
);


-- ============================================
-- 9. NOTIFICATIONS
-- ============================================

INSERT INTO notifications
(user_id, report_id, case_id, title, message, notification_type, is_read)
VALUES
(
  (SELECT user_id FROM users WHERE email = 'maria.demo@pawtect.test'),
  (SELECT report_id FROM stray_reports WHERE location_address = 'Malanday, Valenzuela City, Philippines'),
  (SELECT case_id FROM rescue_cases WHERE report_id = (
    SELECT report_id FROM stray_reports WHERE location_address = 'Malanday, Valenzuela City, Philippines'
  )),
  'Report Accepted',
  'A rescuer has accepted your injured dog report.',
  'report_update',
  1
),
(
  (SELECT user_id FROM users WHERE email = 'juan.demo@pawtect.test'),
  (SELECT report_id FROM stray_reports WHERE location_address = 'Marulas, Valenzuela City, Philippines'),
  NULL,
  'Rescuer On The Way',
  'A rescuer is currently travelling to the reported location.',
  'rescue_update',
  0
),
(
  (SELECT user_id FROM users WHERE email = 'angela.demo@pawtect.test'),
  (SELECT report_id FROM stray_reports WHERE location_address = 'Karuhatan, Valenzuela City, Philippines'),
  NULL,
  'Rescuer Arrived',
  'The rescue team has arrived at the reported location.',
  'rescue_update',
  0
),
(
  (SELECT user_id FROM users WHERE email = 'carlo.demo@pawtect.test'),
  (SELECT report_id FROM stray_reports WHERE location_address = 'Dalandanan, Valenzuela City, Philippines'),
  NULL,
  'Animal Brought To Vet',
  'Your reported animal has been transported to a veterinary clinic.',
  'report_update',
  1
),
(
  (SELECT user_id FROM users WHERE email = 'sofia.demo@pawtect.test'),
  (SELECT report_id FROM stray_reports WHERE location_address = 'Gen. T. de Leon, Valenzuela City, Philippines'),
  NULL,
  'Report Rejected',
  'Your report could not be verified at the provided location.',
  'report_update',
  0
);


-- ============================================
-- 10. REPORT ESCALATIONS
-- ============================================

INSERT INTO report_escalations
(report_id, escalation_level, reason, response_status,
 handled_by, handled_at, remarks)
VALUES
(
  (SELECT report_id FROM stray_reports WHERE location_address = 'Malanday, Valenzuela City, Philippines'),
  3,
  'Urgent report involving an injured dog.',
  'pending',
  NULL,
  NULL,
  'Requires immediate rescue attention.'
),
(
  (SELECT report_id FROM stray_reports WHERE location_address = 'Marulas, Valenzuela City, Philippines'),
  2,
  'Animal reported sick and potentially needs medical assistance.',
  'handled',
  NULL,
  NOW() - INTERVAL 1 HOUR,
  'Rescue team has been assigned.'
),
(
  (SELECT report_id FROM stray_reports WHERE location_address = 'Karuhatan, Valenzuela City, Philippines'),
  1,
  'Puppy reported without its mother.',
  'handled',
  NULL,
  NOW() - INTERVAL 3 HOUR,
  'Rescue team has reached the location.'
),
(
  (SELECT report_id FROM stray_reports WHERE location_address = 'Dalandanan, Valenzuela City, Philippines'),
  3,
  'Injured cat requiring veterinary attention.',
  'handled',
  NULL,
  NOW() - INTERVAL 2 DAY,
  'Animal was transported to a veterinary clinic.'
),
(
  (SELECT report_id FROM stray_reports WHERE location_address = 'Gen. T. de Leon, Valenzuela City, Philippines'),
  1,
  'Report could not be verified.',
  'dismissed',
  NULL,
  NOW() - INTERVAL 1 DAY,
  'Escalation dismissed after verification.'
);


-- ============================================
-- DONE
-- ============================================

SELECT 'Demo data inserted successfully!' AS message;


SELECT role, account_status, COUNT(*) AS total
FROM users
GROUP BY role, account_status;

SELECT application_status, COUNT(*) AS total
FROM rescuer_profiles
GROUP BY application_status;

SELECT status, COUNT(*) AS total
FROM stray_reports
GROUP BY status;

SELECT urgency, COUNT(*) AS total
FROM stray_reports
GROUP BY urgency;

SELECT status, COUNT(*) AS total
FROM rescue_cases
GROUP BY status;


SELECT COUNT(*) AS total_users FROM users;
SELECT COUNT(*) AS total_reports FROM stray_reports;
SELECT COUNT(*) AS total_rescuers FROM rescuer_profiles;
SELECT COUNT(*) AS total_cases FROM rescue_cases;