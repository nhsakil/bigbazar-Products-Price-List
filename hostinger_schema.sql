-- ==============================================================================
-- BigBazar E-Commerce Database Schema for Hostinger MySQL / MariaDB
-- ==============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Admin Users Table
CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) UNIQUE NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Site Settings Table (Slider, Banners, Announcements)
CREATE TABLE IF NOT EXISTS `site_settings` (
  `key` VARCHAR(100) PRIMARY KEY,
  `value` JSON
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Reviews Table
CREATE TABLE IF NOT EXISTS `reviews` (
  `id` VARCHAR(36) PRIMARY KEY,
  `rating` INT DEFAULT 5,
  `comment` TEXT,
  `customer_name` VARCHAR(255),
  `product_id` VARCHAR(36),
  `product_name` VARCHAR(255),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Customers Table (Mobile / Password auth)
CREATE TABLE IF NOT EXISTS `customers` (
  `id` VARCHAR(36) PRIMARY KEY,
  `name` VARCHAR(255),
  `email` VARCHAR(255) UNIQUE,
  `mobile` VARCHAR(20) UNIQUE NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Products Table
CREATE TABLE IF NOT EXISTS `products` (
  `id` VARCHAR(36) PRIMARY KEY,
  `serial_no` INT AUTO_INCREMENT UNIQUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `name` VARCHAR(255) NOT NULL,
  `price` DECIMAL(10,2) NOT NULL,
  `original_price` DECIMAL(10,2),
  `description` TEXT,
  `category` VARCHAR(100),
  `subcategory` VARCHAR(100),
  `images` JSON,
  `image_url` LONGTEXT,
  `video_url` LONGTEXT,
  `status` VARCHAR(50) DEFAULT 'published',
  `platform_id` VARCHAR(100),
  `is_sale` TINYINT(1) DEFAULT 0,
  `is_hot` TINYINT(1) DEFAULT 0,
  `is_new` TINYINT(1) DEFAULT 0,
  `is_sold_out` TINYINT(1) DEFAULT 0,
  `is_deleted` TINYINT(1) DEFAULT 0,
  `available_sizes` JSON,
  `available_colors` JSON,
  `stock_count` INT DEFAULT 0,
  `is_exclusive` TINYINT(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Orders Table
CREATE TABLE IF NOT EXISTS `orders` (
  `id` VARCHAR(36) PRIMARY KEY,
  `user_id` VARCHAR(36),
  `product_id` VARCHAR(36) NOT NULL,
  `product_name` VARCHAR(255),
  `product_price` DECIMAL(10,2),
  `customer_name` VARCHAR(255),
  `customer_phone` VARCHAR(20),
  `customer_address` TEXT,
  `customer_note` TEXT,
  `delivery_area` VARCHAR(50),
  `delivery_charge` DECIMAL(10,2),
  `total_amount` DECIMAL(10,2),
  `last_four_digits` VARCHAR(20),
  `status` VARCHAR(50) DEFAULT 'Pending',
  `size` VARCHAR(50),
  `color` VARCHAR(50),
  `is_advance_paid` TINYINT(1) DEFAULT 0,
  `is_exclusive_order` TINYINT(1) DEFAULT 0,
  `payment_status` VARCHAR(50) DEFAULT 'Unpaid',
  `moderator_reference` VARCHAR(255),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Users Table (Google Sign-In Accounts)
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(36) PRIMARY KEY,
  `google_id` VARCHAR(128) UNIQUE NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255),
  `avatar_url` TEXT,
  `phone` VARCHAR(20) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_google (`google_id`),
  INDEX idx_email (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Conversations Table (AI Shopping Assistant)
CREATE TABLE IF NOT EXISTS `conversations` (
  `id` VARCHAR(36) PRIMARY KEY,
  `session_id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(36) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `has_order` BOOLEAN DEFAULT FALSE,
  `order_id` VARCHAR(36) DEFAULT NULL,
  INDEX idx_session (`session_id`),
  INDEX idx_updated (`updated_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Messages Table (AI Assistant Chat Log)
CREATE TABLE IF NOT EXISTS `messages` (
  `id` VARCHAR(36) PRIMARY KEY,
  `conversation_id` VARCHAR(36) NOT NULL,
  `role` ENUM('user', 'assistant', 'system') NOT NULL,
  `content` TEXT NOT NULL,
  `metadata` JSON DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_conversation (`conversation_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Default Admin User (admin@bigbazar.com / admin)
INSERT IGNORE INTO `admin_users` (`email`, `password_hash`) 
VALUES ('admin@bigbazar.com', '$2a$10$w8.1UuC.7k/0G7UfB2d2lOzf6dD4v2c0B4jE4x5wG7dK8.F9.b82m');

SET FOREIGN_KEY_CHECKS = 1;
