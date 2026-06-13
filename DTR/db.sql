-- =========================================================================
-- DATABASE INITIALIZATION SCRIPT FOR LGU LAOAG DTR SYSTEM
-- TARGET ENGINE: MySQL / MariaDB / PostgreSQL
-- =========================================================================

CREATE DATABASE IF NOT EXISTS lgu_laoag_dtr;
USE lgu_laoag_dtr;

-- 1. ADMIN ACCOUNTS TABLE
-- Manages credentials for securing administrative router guards
CREATE TABLE IF NOT EXISTS admin_accounts (
    admin_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL, -- Recommended to store using bcrypt/argon2
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. EMPLOYEE PROFILES DIRECTORY TABLE
-- Replaces the old 'DTR_USERS' local storage array map
CREATE TABLE IF NOT EXISTS employees (
    user_id VARCHAR(30) NOT NULL PRIMARY KEY, -- Supports custom formats like '23-140010'
    user_name VARCHAR(150) NOT NULL,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. TRANSACTIONAL ATTENDANCE LOGS MASTER GRID
-- Replaces the 'DTR_LOGS' tracking array with full relational data integrity
CREATE TABLE IF NOT EXISTS attendance_logs (
    log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(30) NOT NULL,
    log_date DATE NOT NULL,
    log_time TIME NOT NULL,
    shift_type ENUM('AM_IN', 'AM_OUT', 'PM_IN', 'PM_OUT') NOT NULL,
    duty_mode ENUM('RTO', 'WFH') DEFAULT 'RTO',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexing for optimized monthly search filters and heavy PDF report compilation
    INDEX idx_user_date (user_id, log_date),
    INDEX idx_date_lookup (log_date),
    
    -- Relational Integrity: If an employee profile is removed, cascade drop their logs
    CONSTRAINT fk_attendance_employee 
        FOREIGN KEY (user_id) 
        REFERENCES employees (user_id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =========================================================================
-- MANDATORY SYSTEM CONFIGURATION INITIAL SEED
-- =========================================================================

-- Seed a default administrative profile account to allow first login
-- Note: Replace with a secure hash inside your backend production pipeline!
INSERT INTO admin_accounts (username, password_hash) 
VALUES ('admin', '$2b$10$ExXpXqXzXvXwXuXtXsXfXeX.ExampleHashDontUseInProd')
ON DUPLICATE KEY UPDATE username=username;