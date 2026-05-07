-- ALWAYS ON - Enterprise DB Tiered Access Script

-- 1. Create the Database
CREATE DATABASE IF NOT EXISTS alwayson;
USE alwayson;

-- 2. Create Tiered Users
-- ADMIN: Full rights (DDL + DML)
CREATE USER IF NOT EXISTS 'alwayson_admin'@'%' IDENTIFIED BY 'Admin@AlwaysOn2026';
GRANT ALL PRIVILEGES ON alwayson.* TO 'alwayson_admin'@'%';

-- APP_USER: Standard App rights (DML + Execute SPs)
CREATE USER IF NOT EXISTS 'alwayson_app'@'%' IDENTIFIED BY 'AppUser@AlwaysOn2026';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON alwayson.* TO 'alwayson_app'@'%';

-- REPORT_USER: Read-only access for reporting/auditing
CREATE USER IF NOT EXISTS 'alwayson_report'@'%' IDENTIFIED BY 'ReportOnly@AlwaysOn2026';
GRANT SELECT ON alwayson.* TO 'alwayson_report'@'%';

FLUSH PRIVILEGES; 

-- 3. Initial Table Schema (Handled by Java code usually, but good for reference)
-- Tables: users, messages, rooms
CREATE TABLE IF NOT EXISTS rooms (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
