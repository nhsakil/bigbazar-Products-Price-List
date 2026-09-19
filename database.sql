
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for admin_users
-- ----------------------------
CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) UNIQUE NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for site_settings
-- ----------------------------
CREATE TABLE IF NOT EXISTS `site_settings` (
  `key` VARCHAR(100) PRIMARY KEY,
  `value` JSON
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for reviews
-- ----------------------------
CREATE TABLE IF NOT EXISTS `reviews` (
  `id` VARCHAR(36) PRIMARY KEY,
  `rating` INT DEFAULT 5,
  `comment` TEXT,
  `customer_name` VARCHAR(255),
  `product_id` VARCHAR(36),
  `product_name` VARCHAR(255),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for customers
-- ----------------------------
CREATE TABLE IF NOT EXISTS `customers` (
  `id` VARCHAR(36) PRIMARY KEY,
  `name` VARCHAR(255),
  `email` VARCHAR(255) UNIQUE,
  `mobile` VARCHAR(20) UNIQUE NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for products
-- ----------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for orders
-- ----------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for users
-- ----------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(36) PRIMARY KEY,
  `google_id` VARCHAR(128) UNIQUE NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255),
  `avatar_url` TEXT,
  `phone` VARCHAR(20) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_google (google_id),
  INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for conversations
-- ----------------------------
CREATE TABLE IF NOT EXISTS `conversations` (
  `id` VARCHAR(36) PRIMARY KEY,
  `session_id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(36) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `has_order` BOOLEAN DEFAULT FALSE,
  `order_id` VARCHAR(36) DEFAULT NULL,
  INDEX idx_session (session_id),
  INDEX idx_updated (updated_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for messages
-- ----------------------------
CREATE TABLE IF NOT EXISTS `messages` (
  `id` VARCHAR(36) PRIMARY KEY,
  `conversation_id` VARCHAR(36) NOT NULL,
  `role` ENUM('user', 'assistant', 'system') NOT NULL,
  `content` TEXT NOT NULL,
  `metadata` JSON DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_conversation (conversation_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- Data for table products
INSERT IGNORE INTO `products` (`id`, `serial_no`, `created_at`, `name`, `price`, `original_price`, `description`, `category`, `subcategory`, `video_url`, `status`, `is_sale`, `is_hot`, `is_new`, `is_sold_out`, `is_deleted`, `available_sizes`, `available_colors`, `stock_count`, `is_exclusive`, `images`, `image_url`, `platform_id`) VALUES 
  ('c4c7fd1a-694d-4792-89f5-d04df6aa86e6', 32709, '2026-09-17 05:00:54', 'Floral Print 2 Piece ', '1150.00', NULL, '🌸 ফ্লোরাল প্রিন্ট ২ পিস  🌸

স্টাইলিশ ও আকর্ষণীয় ফ্লোরাল প্রিন্টের ২ পিস সেট। সুন্দর ডিজাইনের লং কুর্তা ও প্যান্ট দৈনন্দিন ব্যবহার থেকে শুরু করে যেকোনো ক্যাজুয়াল বা সেমি-ফরমাল লুকে মানিয়ে যাবে। ✨

🎨 কালার:অলিভ / ম্যারুন
👗 সেট:কুর্তা + প্যান্ট
🌷 ডিজাইন: এলিগ্যান্ট ফ্লোরাল প্রিন্ট
💫 আরামদায়ক, স্টাইলিশ ও ট্রেন্ডি লুক

', 'Women', 'KURTI', 'https://www.instagram.com/reel/DdYBJOfFbcL/?stkn=MXJ5ZHBuMWpuMTd1eA==', 'published', 0, 0, 0, 0, 0, '[]', '[{"hex":"#989200","image":"/api/img/c4c7fd1a-694d-4792-89f5-d04df6aa86e6","is_available":true,"name":"Olive","sizes":[]},{"hex":"#811c00","image":"/api/img/c4c7fd1a-694d-4792-89f5-d04df6aa86e6","is_available":true,"name":"Maroon","sizes":[]}]', 6, 0, '["/api/img/c4c7fd1a-694d-4792-89f5-d04df6aa86e6","/api/img/c4c7fd1a-694d-4792-89f5-d04df6aa86e6"]', '/api/img/c4c7fd1a-694d-4792-89f5-d04df6aa86e6', 'DdYBJOfFbcL'),
  ('2a5885fc-adc3-414e-9764-5c768c0f91f8', 32708, '2026-09-16 16:50:35', 'Pakistani Inspired 2 Piece ', '1620.00', NULL, '*Pakistani Inspired 2 Piece

Elegant Pakistani-inspired design with a refined, premium finish.', 'Women', 'Pakistani-inspired-2-piece', 'https://www.instagram.com/reel/DdOyz1lDS91/?stkn=bjhydjJwdXlnMDRr', 'published', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"Free Size"}]', '[]', 3, 0, '["/api/img/up-5f284f6951aa486e"]', '/api/img/up-5f284f6951aa486e', 'DdOyz1lDS91'),
  ('4e032312-c9e9-4a1d-b162-ac1597f4224d', 32707, '2026-09-16 16:40:48', 'Pakistani Inspired 2 Piece ', '1620.00', NULL, 'Pakistani Inspired 2 Piece 
Elegant Pakistani-inspired design with a refined, premium finish.', 'Women', 'Pakistani-inspired-2-piece', 'https://www.instagram.com/reel/DdQoHRbFPRv/?stkn=MXVhNHpqZ2Nqa2Iweg==', 'published', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"Free Size"}]', '[]', 3, 0, '["/api/img/up-27c9b6803ab74a85"]', '/api/img/up-27c9b6803ab74a85', 'DdQoHRbFPRv'),
  ('b1e22477-d233-4f41-b341-324542df57e8', 32706, '2026-09-16 16:09:33', 'Block Print Saree', '620.00', '700.00', '🌸 লাল শাড়ি

নান্দনিক ঐতিহ্যবাহী ডিজাইনের এই লাল শাড়িটি সাজকে দেবে একদম আকর্ষণীয় ও রাজকীয় লুক। শাড়িজুড়ে রয়েছে সুন্দর পেইসলি ও ফুলেল মোটিফ, সঙ্গে আঞ্চল ও পাড়ে রয়েছে নজরকাড়া ঘন ডিজাইন এবং বড় সুন্দর মোটিফ।

শাড়িটির সাথে রয়েছে ম্যাচিং ব্লাউজ পিস ,তাই আপনার পছন্দমতো ব্লাউজ তৈরি করে নিতে পারবেন। উৎসব, পারিবারিক অনুষ্ঠান, পূজা, বিয়ে কিংবা যেকোনো বিশেষ আয়োজনে এটি হতে পারে আপনার সুন্দর একটি পছন্দ।

❤️ Available Colors: Red
✨ Matching Blouse Piece Included
', 'Women', 'SAREE', 'https://www.instagram.com/reel/DdWNKQpgruQ/?stkn=NzJkYmkzdzM1eXR0', 'published', 0, 0, 0, 0, 0, '[]', '[]', 10, 0, '["/api/img/up-8d4457577ed74cbe"]', '/api/img/up-8d4457577ed74cbe', 'DdWNKQpgruQ'),
  ('8a63cae9-365c-4cf4-bb3f-0f065519399a', 32705, '2026-09-16 15:50:32', 'Parshi', '4850.00', NULL, 'EleElegant Parshi with refined finish', 'Women', 'PARSHI', 'https://www.instagram.com/reel/DdTx--Oj5LF/?stkn=ZTluNTNoNGZkMHBv', 'published', 0, 0, 0, 1, 0, '[]', '[]', 0, 1, '["/api/img/up-6e1b5a73d518448c"]', '/api/img/up-6e1b5a73d518448c', 'DdTx--Oj5LF'),
  ('be1493fc-dc9c-4360-8d1b-a030f8d1031e', 32704, '2026-09-16 12:59:31', 'Luxury Karchupi Saree ', '17850.00', '18500.00', '✨ Luxury Karchupi Saree ✨

Regal detailing, premium finish & intricate Karchupi work — crafted to make your occasion look effortlessly luxurious. 👑

🧵 Work: Luxury Karchupi Work
🧣 Includes: Matching Dupatta
💎 Collection: Premium Luxury', 'Women', 'SAREE', 'https://www.instagram.com/reel/DdWSzG8jMZf/?stkn=MTR1dWg5amJ5cWMzZg==', 'published', 0, 0, 0, 0, 0, '[]', '[]', 3, 1, '["/api/img/up-f2c92370e2af4b97"]', '/api/img/up-f2c92370e2af4b97', 'DdWSzG8jMZf'),
  ('226c2732-8f43-4745-bf7d-684e1443ad81', 32703, '2026-09-16 09:28:15', 'Exclusive Party Saree ', '1599.00', '5850.00', '
Exclusive Party Saree — Special Price ৳1,599/- ✨
Limited Time Offer — Grab Yours Before It’s Gone! 🔥', 'Women', 'SAREE', 'https://www.instagram.com/reel/DdN2oX-HNV_/?stkn=Y3kzOWtuZDZxMGk1', 'published', 0, 0, 0, 0, 0, '[]', '[]', 15, 1, '["/api/img/up-8219bb15bf7f4a9f","/api/img/up-884edeb62c3a4cd9","/api/img/up-e31c519c5d1d49ba","/api/img/up-21c66ab29ece4064","/api/img/up-5782f82077924162","/api/img/up-446fc2c0909b42cd"]', '/api/img/up-8219bb15bf7f4a9f', 'DdN2oX-HNV_'),
  ('6973026e-2f59-4ae8-9a54-30568820ab2a', 32702, '2026-09-16 05:59:53', 'Luxury Party Saree', '5250.00', '5550.00', '✨ Luxury Party Saree ✨

Elegant drape • Premium finish • Statement look 💫
Perfect for weddings, parties & special occasions.
Because every celebration deserves a little luxury. 🤍
', 'Women', 'SAREE', 'https://www.instagram.com/reel/DdDvpMUE3wZ/?stkn=cWRvOGhkeDlxbXI5', 'published', 0, 0, 0, 0, 0, '[]', '[]', 10, 1, '["/api/img/up-d1d343fbca05428e","/api/img/up-06ea30f4ee974314","/api/img/up-a7a966ee35a34101","/api/img/up-b4e99244a04542e1"]', '/api/img/up-d1d343fbca05428e', 'DdDvpMUE3wZ'),
  ('8c6cd417-faea-4a3b-b0d2-7eb45164bc38', 32701, '2026-09-16 05:54:51', 'Luxury Kashmiri Saree ', '7850.00', '8250.00', '✨ Luxury Kashmiri Saree | Available Now ✨

Elegant Kashmiri craftsmanship with a rich, premium finish—perfect for festive moments, wedding events & special occasions. 🤍

📌 Quality: Premium
📌 Collection: Luxury Kashmiri Saree', 'Women', 'SAREE', 'https://www.instagram.com/reel/DdTl9eIGy-x/?stkn=MTlnazQxMXBtbnhubQ==', 'published', 0, 0, 0, 0, 0, '[]', '[]', 6, 1, '["/api/img/up-ef06e5304d1549d2","/api/img/up-41ab13cf2dad4c45","/api/img/up-7999208c697a4dbe","/api/img/up-00f709fc472b40f3","/api/img/up-a57ce816b3bf494e","/api/img/up-6b3aeab9b76848e7","/api/img/up-0e1269613a6b45ec"]', '/api/img/up-ef06e5304d1549d2', 'DdTl9eIGy-x'),
  ('5e1b77e5-7668-41f5-8a19-e421bc881b37', 32700, '2026-09-16 05:50:48', 'Luxury Karchupi Saree ', '17850.00', '18000.00', '✨ Luxury Karchupi Saree ✨

Regal detailing, premium finish & intricate Karchupi work — crafted to make your occasion look effortlessly luxurious. 👑

🧵 Work: Luxury Karchupi Work
🧣 Includes: Matching Dupatta
💎 Collection: Premium Luxury
', 'Women', 'SAREE', 'https://www.instagram.com/reel/DdTnPXzExkc/?stkn=MTc5bzN6a25mY3hpZw==', 'published', 0, 0, 0, 0, 0, '[]', '[]', 5, 1, '["/api/img/up-095b29b911b04ddb"]', '/api/img/up-095b29b911b04ddb', 'DdTnPXzExkc'),
  ('83a675b2-a005-4825-82f0-8ea0e71fb4a5', 32699, '2026-09-06 19:54:30', 'Three Piece ', '1950.00', NULL, '', 'Women', NULL, '', 'pending', 0, 0, 0, 0, 0, '[]', '[]', 3, 0, '["/api/img/up-1491a971a83e4175"]', '/api/img/up-1491a971a83e4175', NULL),
  ('464a7d7d-9e6b-4b59-9744-7758ccdc6cf7', 2542, '2026-09-05 15:24:36', ' Exclusive Party 3-Piece', '3750.00', '3850.00', '✨ Exclusive Party 3-Piece ✨
Elegant look • Premium feel • Perfect for every party 💫
', 'Women', 'Party-Three-Piece', 'https://www.instagram.com/reel/Dc3kZ0sD-m-/?igsi=eHNzN2Q3djQ0am4z', 'published', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"36"},{"is_available":true,"name":"38"},{"is_available":true,"name":"40"},{"is_available":true,"name":"42"},{"is_available":true,"name":"44"}]', '[]', 10, 1, '["/api/img/up-52ce55359d9049c4"]', '/api/img/up-52ce55359d9049c4', 'Dc3kZ0sD-m-'),
  ('82cc7ba6-2ab6-41d7-9a36-853d86af551a', 32698, '2026-09-05 15:22:43', 'Party 3 Piece', '1950.00', '2050.00', '✨ Ready Simple Party 3 Piece 💫
Elegant • Comfortable • Stylish 🤍

', 'Women', 'Party-Three-Piece', 'https://www.instagram.com/reel/Dc3CBIfG3Ww/?igsi=a3Q1MHhiaWRicjI0', 'pending', 0, 0, 0, 0, 0, '[]', '[]', 5, 0, '[]', NULL, 'Dc3CBIfG3Ww'),
  ('cbb1b160-381c-4752-978f-c75df19bb97c', 2153, '2026-09-05 15:21:06', 'সুতির Ready Three Piece', '2050.00', '215.00', '✨  সুতির Ready Three Piece ✨
সাইজ: 38–46 💫
আরামদায়ক কাপড়, সুন্দর ডিজাইন—দৈনন্দিন ও ক্যাজুয়াল লুকের জন্য পারফেক্ট! 🛍️
', 'Women', 'STITCHED-COTTON-THREE-PIECE', 'https://www.instagram.com/reel/Dc3awY9gPIB/?igsi=MTd5cHI3bnZmNDlxZw==', 'published', 0, 0, 0, 0, 0, '[]', '[]', 10, 0, '["/api/img/up-51b3e3e5a99847dd"]', '/api/img/up-51b3e3e5a99847dd', 'Dc3awY9gPIB'),
  ('9b3b2f26-61ee-40ef-a6e8-e1efc1eedd3c', 24685, '2026-09-04 13:30:35', 'Premium Luxury Saree ', '5000.00', '4680.00', ' PREMIUM LUXURY SAREE — 20% OFF! ✨

Elegance meets luxury! 💎
আপনার পছন্দের Premium Luxury Saree এখন পাচ্ছেন 20% OFF-এ! 🛍️❤️', 'Women', 'SAREE', 'https://www.instagram.com/reel/DctcwO9j7Ct/?igsi=MTI4djg4dXVxbGxpaQ==', 'published', 0, 0, 0, 0, 0, '[]', '[]', 3, 1, '["/api/img/up-bbc91dfa562f4b5f"]', '/api/img/up-bbc91dfa562f4b5f', 'DctcwO9j7Ct'),
  ('9d11e83a-fde9-44dc-b923-cd634508c498', 26982, '2026-09-04 13:27:47', 'Ready Simple Party 3 Piece ', '1950.00', '2090.00', '✨ Ready Simple Party 3 Piece 💫
Elegant • Comfortable • Stylish ', 'Women', 'STITCHED-COTTON-THREE-PIECE', 'https://www.instagram.com/reel/Dc3CBIfG3Ww/?igsi=a3Q1MHhiaWRicjI0', 'published', 0, 0, 0, 0, 0, '[]', '[]', 10, 0, '["/api/img/up-ebb3b3eef53f42ea"]', '/api/img/up-ebb3b3eef53f42ea', 'Dc3CBIfG3Ww'),
  ('cfb9d35d-fa7b-4068-9b41-6a62f7bcd99b', 31, '2026-09-03 14:17:23', 'Ready Luxury Partywear Sara-Ra ', '3350.00', '3650.00', '✨ Ready Luxury Partywear sara-ra ✨

Elegant look, premium feel & party-ready style 💎
Perfect for any special occasion! 🥰', 'Women', 'Party-Three-Piece', 'https://www.instagram.com/reel/Dcxv2jaAdJA/?igsi=N2R4dzFtMGFrYzZk', 'published', 0, 0, 0, 0, 0, '[]', '[]', 10, 1, '["/api/img/up-36d468209efe4a65","/api/img/up-932ac9d8d552428c"]', '/api/img/up-36d468209efe4a65', 'Dcxv2jaAdJA'),
  ('6d2bc150-4a53-4210-98c3-cf02ca95a5fe', 32, '2026-09-03 14:16:12', 'Ready Luxury Partywear Sara-Ra ', '3350.00', '3650.00', '✨ Ready Luxury Partywear sara-ra ✨

Elegant look, premium feel & party-ready style 💎
Perfect for any special occasion! 🥰', 'Women', 'Sharara-Dress', 'https://www.instagram.com/reel/Dc0r-z4COPA/?igsi=ODVyODl6M2dpNXdz', 'published', 0, 0, 0, 0, 0, '[]', '[]', 6, 1, '["/api/img/up-80cd3e388c094c32"]', '/api/img/up-80cd3e388c094c32', 'Dc0r-z4COPA'),
  ('2a66a8d8-c205-4464-a657-2ae6e520f2e0', 34, '2026-09-03 04:29:23', 'Pakistani Two Piece ', '1450.00', '1550.00', '✨ Pakistani Two Piece — Elegant & Trendy ✨

Premium Pakistani Two Piece collection, perfect for your everyday elegance & special occasions. 💫
', 'Women', 'Pakistani-inspired-2-piece', 'https://www.instagram.com/reel/DcvNp0alFaZ/?igsi=MXJhZmFiODI1ODZwag==', 'published', 0, 0, 0, 0, 0, '[]', '[]', 5, 0, '["/api/img/up-1f961eebd30b4db6"]', '/api/img/up-1f961eebd30b4db6', 'DcvNp0alFaZ'),
  ('8f391b78-b76a-41d0-b1fe-63af4d8b690a', 44, '2026-09-01 04:34:27', 'Bridal Saree With Blouse ', '15500.00', '16900.00', '', 'Women', 'Bridal-Collection', '', 'published', 0, 0, 0, 0, 0, '[]', '[]', 3, 1, '["/api/img/up-a4dcad90cfe04891","/api/img/up-4e67d80dc3cc465c","/api/img/up-3aa44b7c10c6431b"]', '/api/img/up-a4dcad90cfe04891', NULL),
  ('ebfc403a-188c-490c-9254-868031e17099', 38, '2026-08-31 20:30:32', 'Pakistani 2 Piece', '1350.00', '1450.00', 'Pakistani 2 piece', 'Women', 'Pakistani-inspired-2-piece', 'https://www.instagram.com/reel/DcnrNpljGyk/?igsi=NjU1ODN6ZXRzNHEx', 'published', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"38"},{"is_available":true,"name":"40"},{"is_available":true,"name":"42"},{"is_available":true,"name":"44"}]', '[]', 12, 0, '["/api/img/up-1c8b29fb54f74dfd"]', '/api/img/up-1c8b29fb54f74dfd', 'DcnrNpljGyk'),
  ('c733baea-55b9-45b6-8058-41e2fc74ffcf', 37, '2026-08-31 18:49:49', 'Western 2 Piec67', '1050.00', '1150.00', '', 'Women', 'WESTERN-2-PIECE', 'https://www.instagram.com/reel/Dcsx17_AdXc/?igsi=MXNkeGxsZWkxZjYyOQ==', 'published', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"Free Size"}]', '[]', 14, 0, '["/api/img/up-668b9bfd3d8540a5","/api/img/up-7ea937e6be814b4d"]', '/api/img/up-668b9bfd3d8540a5', 'Dcsx17_AdXc'),
  ('23d768d6-8e5b-48c4-9121-69bb1aad5028', 36, '2026-08-31 18:48:16', 'Western 2 Piece', '1050.00', '1150.00', '', 'Women', 'WESTERN-2-PIECE', 'https://www.instagram.com/reel/DcqkDvTCj-4/?igsi=MTN5YWdsenQ1c2cyeA==', 'published', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"Free Size"}]', '[]', 11, 0, '["/api/img/up-d3893738b05d46b8"]', '/api/img/up-d3893738b05d46b8', 'DcqkDvTCj-4'),
  ('969e74d6-8ed0-418b-a5e0-02205cac5e01', 40, '2026-08-31 18:46:43', 'Western 2 Piece', '1050.00', '1150.00', '', 'Women', 'WESTERN-2-PIECE', 'https://www.instagram.com/reel/DcqHYzjFMOl/?igsi=MTkyZzlwbXRtcWlzNQ==', 'published', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"Free Size"}]', '[]', 12, 0, '["/api/img/up-a2dfeba406394253","/api/img/up-da747bd80be14ae4"]', '/api/img/up-a2dfeba406394253', 'DcqHYzjFMOl'),
  ('be32af45-a0e4-4a55-911e-8e555354c396', 39, '2026-08-31 18:44:34', 'Western 2 Piece', '1050.00', '1150.00', '', 'Women', 'WESTERN-2-PIECE', 'https://www.instagram.com/reel/DcoD2WrFQr5/?igsi=MXY3cDEyYm0wb3kxZQ==', 'published', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"Free Size"}]', '[]', 10, 0, '["/api/img/up-e01e3b4b216d432d"]', '/api/img/up-e01e3b4b216d432d', 'DcoD2WrFQr5'),
  ('63f73b8e-e909-43b2-bc2f-e4beab3e99d4', 33, '2026-08-31 18:43:19', 'Western 2 Piece', '1050.00', '1150.00', '', 'Women', 'WESTERN-2-PIECE', 'https://www.instagram.com/reel/DcnRwfXgHVx/?igsi=OTFzM2V1Y21kcHZk', 'published', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"Free Size"}]', '[]', 11, 0, '["/api/img/up-d19fa5df576b477c"]', '/api/img/up-d19fa5df576b477c', 'DcnRwfXgHVx'),
  ('36c11d0d-b1c6-4f0b-af99-298dbab3184f', 42, '2026-08-31 18:40:14', 'Katan Saree ', '1250.00', '1550.00', 'Katan Saree ', 'Women', 'SAREE', 'https://www.instagram.com/reel/DclmduPk5Xo/?igsi=MWJwcTlseWR4bDMybQ==', 'published', 0, 0, 0, 0, 0, '[]', '[]', 9, 0, '["/api/img/up-116b57c47eab468d"]', '/api/img/up-116b57c47eab468d', 'DclmduPk5Xo'),
  ('a7738305-9410-4e16-a12b-9c7b819a678c', 43, '2026-08-31 18:38:04', 'Party Three Prices ', '3850.00', '3950.00', 'Readymade Three prices ', 'Women', 'Party-Three-Piece', 'https://www.instagram.com/reel/DclVnbzjNW9/?igsi=c2k3ZjB4MDB3YjY3', 'published', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"36"},{"is_available":true,"name":"38"},{"is_available":true,"name":"40"},{"is_available":true,"name":"42"},{"is_available":true,"name":"44"}]', '[]', 6, 1, '["/api/img/up-51fa9dd1c42b495a"]', '/api/img/up-51fa9dd1c42b495a', 'DclVnbzjNW9'),
  ('9819bbec-68f4-4f58-9af0-2bc6aa3522a8', 41, '2026-08-31 18:33:55', 'Western 2Piece', '1050.00', '1150.00', 'Fabric cotton brush ', 'Women', 'WESTERN-2-PIECE', 'https://www.instagram.com/reel/Dci6vqMDj32/?igsi=MTNha2UyMW16NDc5cA==', 'published', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"Free Size"}]', '[]', 6, 0, '["/api/img/up-27e4ad5b5c19477d"]', '/api/img/up-27e4ad5b5c19477d', 'Dci6vqMDj32'),
  ('95fb04a0-60e6-4d5a-9353-7f0e5baa3fae', 35, '2026-08-31 18:32:35', 'Western 2Piece', '1050.00', '1150.00', 'Fabric cotton brush ', 'Women', 'WESTERN-2-PIECE', 'https://www.instagram.com/reel/DcijvsCgBMn/?igsi=ZnhzaXU2MHVwZm9s', 'published', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"Free Size"}]', '[]', 8, 0, '["/api/img/up-43c9c5ea748042b9"]', '/api/img/up-43c9c5ea748042b9', 'DcijvsCgBMn'),
  ('5674be81-c68a-423a-a4a7-e563b8a7d5e0', 30, '2026-08-31 18:29:41', 'Westren 2Piece', '1050.00', '1150.00', 'Fabrics cotton brush
Long:34
Pent:40', 'Women', 'WESTERN-2-PIECE', 'https://www.instagram.com/reel/DcfzulxgJrI/?igsi=MTJzcWtha3AzdG9idA==', 'published', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"Free Size"}]', '[]', 5, 0, '["/api/img/up-cc8dd6ab9e0c48b2"]', '/api/img/up-cc8dd6ab9e0c48b2', 'DcfzulxgJrI'),
  ('7b7bbef3-ec91-48b4-87f0-5051b6615753', 29, '2026-08-31 18:27:53', 'Dupiyan Silk Saree ', '3850.00', '3950.00', 'Dupiyan silk saree', 'Women', 'SAREE', 'https://www.instagram.com/reel/Dcfn6xviEh1/?igsi=Z3V4MWM5ZDZhNG9r', 'published', 0, 0, 0, 0, 0, '[]', '[]', 5, 1, '["/api/img/up-2d258d7ef3cb44c3"]', '/api/img/up-2d258d7ef3cb44c3', 'Dcfn6xviEh1'),
  ('5ef07ff8-624d-452c-9aaa-dcab8094ab39', 28, '2026-08-31 18:21:22', 'Premium Karchupi Jamdani', '8650.00', '8950.00', '✨ Premium Karchupi Jamdani ✨

An exquisite blend of heritage and royal beauty. ❤️
Premium Karchupi Jamdani — adds an elegant & graceful touch to your look for weddings, festivals, or any special occasion. ✨', 'Women', 'SAREE', 'https://www.instagram.com/reel/DcqYIN9CMH_/?igsi=MnZjOTBqMGxmeXZ5', 'published', 0, 0, 0, 0, 0, '[]', '[]', 10, 1, '["/api/img/up-5ee70d69dae24c41"]', '/api/img/up-5ee70d69dae24c41', 'DcqYIN9CMH_'),
  ('7942e293-0faa-4fdd-9603-8f7cdcad468c', 27, '2026-08-26 19:58:39', 'Kurti', '580.00', NULL, '', 'Women', 'KURTI', 'https://www.instagram.com/reel/DcbLy8aE2QS/?igsi=MWZjZGQxNHhucmR6aw==', 'published', 0, 0, 0, 0, 0, '[]', '[{"hex":"#000000","image":"/img/products/7942e293-0faa-4fdd-9603-8f7cdcad468c_color_0.jpg","is_available":true,"name":"Black","sizes":[]},{"hex":"#964B00","image":"/img/products/7942e293-0faa-4fdd-9603-8f7cdcad468c_color_1.jpg","is_available":true,"name":"Brown","sizes":[]},{"hex":"#008080","image":"/img/products/7942e293-0faa-4fdd-9603-8f7cdcad468c_color_2.jpg","is_available":true,"name":"Teal","sizes":[]}]', 6, 0, '["/img/products/7942e293-0faa-4fdd-9603-8f7cdcad468c.jpg","/img/products/7942e293-0faa-4fdd-9603-8f7cdcad468c_1.jpg","/img/products/7942e293-0faa-4fdd-9603-8f7cdcad468c_2.jpg"]', '/img/products/7942e293-0faa-4fdd-9603-8f7cdcad468c.jpg', 'DcbLy8aE2QS'),
  ('f449038a-8c37-4108-b35b-152076a53088', 26, '2026-08-25 20:27:02', 'Party Three Piece', '2150.00', NULL, '', 'Women', 'Party-Three-Piece', 'https://www.instagram.com/reel/DcbSVtdEkby/?igsi=OHJkb3E1YXkxY2Vj', 'published', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"36"},{"is_available":true,"name":"38"},{"is_available":true,"name":"40"},{"is_available":true,"name":"42"},{"is_available":true,"name":"44"}]', '[]', 3, 0, '["/img/products/f449038a-8c37-4108-b35b-152076a53088.jpg"]', '/img/products/f449038a-8c37-4108-b35b-152076a53088.jpg', 'DcbSVtdEkby'),
  ('4ce293ac-20ae-45f1-86ef-26216a160192', 23, '2026-08-25 11:31:10', 'Karchupi Jamdani Saree ', '8650.00', '8950.00', 'Karcupi Jamdani 
With blawz pis', 'Women', 'SAREE', 'https://www.instagram.com/reel/DcdCCAQG5En/?igsi=MXRnMWl4a2IyNWhrdA==', 'published', 0, 0, 0, 0, 0, '[]', '[]', 5, 1, '["/img/products/4ce293ac-20ae-45f1-86ef-26216a160192.jpg"]', '/img/products/4ce293ac-20ae-45f1-86ef-26216a160192.jpg', 'DcdCCAQG5En'),
  ('e9a58a1c-c17d-4bb9-b716-e33877bc1a89', 25, '2026-08-25 09:26:12', 'Premium Dupiyan Silk Saree', '3850.00', '3950.00', '✨ Available Now | In Stock', 'Women', 'SAREE', 'https://www.instagram.com/reel/DcbKnIziVcm/?igsi=dzk3NXF3NXN2M2dw', 'published', 0, 0, 0, 0, 0, '[]', '[]', 1, 1, '["/img/products/e9a58a1c-c17d-4bb9-b716-e33877bc1a89.jpg"]', '/img/products/e9a58a1c-c17d-4bb9-b716-e33877bc1a89.jpg', 'DcbKnIziVcm'),
  ('2d069472-13f7-44df-abb1-81a70caddfc9', 24, '2026-08-25 09:24:14', 'Premium  Dupiyan Silk Party Saree ', '4850.00', '4990.00', '✨ Available Now | In Stock

', 'Women', 'SAREE', 'https://www.instagram.com/reel/DcbLImcgFei/?igsi=NjR4c2JrbTQ3NjZv', 'published', 0, 0, 0, 0, 0, '[]', '[]', 5, 1, '["/img/products/2d069472-13f7-44df-abb1-81a70caddfc9.jpg"]', '/img/products/2d069472-13f7-44df-abb1-81a70caddfc9.jpg', 'DcbLImcgFei'),
  ('9d639557-3995-4ff3-a369-62ca99e02a09', 22, '2026-08-25 09:11:02', 'Premium Party Ready Three Piece', '2150.00', '2390.00', '✨ Premium Party Ready Three Piece ✨

Elegant • Trendy • Party Ready 💫
Perfect for your next special occasion. ❤️

📍 BIG BAZAR — Bariyarhat, Mirsarai, Chattogram', 'Women', 'Party-Three-Piece', 'https://www.instagram.com/reel/DcbKjrQivBy/?igsi=OHNvZWV3d25hNnI2', 'published', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"36"},{"is_available":true,"name":"38"},{"is_available":true,"name":"40"},{"is_available":true,"name":"XXL"},{"is_available":true,"name":"44"}]', '[]', 5, 0, '["/img/products/9d639557-3995-4ff3-a369-62ca99e02a09.jpg"]', '/img/products/9d639557-3995-4ff3-a369-62ca99e02a09.jpg', 'DcbKjrQivBy'),
  ('82d92318-fe19-48de-846c-53ec3614629b', 21, '2026-08-24 14:35:51', 'Dupiyan Silk Saree ', '3850.00', '3950.00', 'Dupiyan silk sadi', 'Women', 'SAREE', 'https://www.instagram.com/reel/DcYfSlOAR0Z/?igsi=MTh1Z2lqcjhybGRrZA==', 'published', 0, 0, 0, 0, 0, '[]', '[]', 10, 1, '["/img/products/82d92318-fe19-48de-846c-53ec3614629b.jpg"]', '/img/products/82d92318-fe19-48de-846c-53ec3614629b.jpg', 'DcYfSlOAR0Z'),
  ('0261195a-de78-4c70-b124-a3044be66b9f', 20, '2026-08-24 14:30:15', 'Ready Jam Jam 3-Piece ', '1180.00', '1280.00', '✨ READY JAM JAM 3-PIECE ✨

Premium ready collection—স্টাইলিশ লুক, আরামদায়ক ফ্যাব্রিক ও একদম ready-to-wear! ', 'Women', 'STITCHED-COTTON-THREE-PIECE', 'https://www.instagram.com/reel/Dcaoms9ldTk/?igsi=MXJnODc0NzIzY3ppMw==', 'published', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"36"},{"is_available":true,"name":"38"},{"is_available":true,"name":"40"},{"is_available":true,"name":"42"},{"is_available":true,"name":"44"}]', '[]', 8, 0, '["/img/products/0261195a-de78-4c70-b124-a3044be66b9f.jpg"]', '/img/products/0261195a-de78-4c70-b124-a3044be66b9f.jpg', 'Dcaoms9ldTk'),
  ('d05f0342-d8df-4c6a-a1f5-9b00c03b46b7', 19, '2026-08-23 18:50:34', 'Western 2 Piece', '1050.00', '1150.00', 'Fabric: coton brush
Tops long :34
Pent long:40', 'Women', 'WESTERN-2-PIECE', 'https://www.instagram.com/reel/DcWDRTPlcML/?igsi=a2luN2Y1eGN2MGRt', 'published', 0, 0, 0, 1, 0, '[{"is_available":true,"name":"Free Size"}]', '[]', 3, 0, '["/img/products/d05f0342-d8df-4c6a-a1f5-9b00c03b46b7.jpg"]', '/img/products/d05f0342-d8df-4c6a-a1f5-9b00c03b46b7.jpg', 'DcWDRTPlcML'),
  ('0083d38e-8caf-4bc0-8a29-3e429bb262f9', 18, '2026-08-23 18:46:33', 'Premium Karchupi Jamdani ', '8650.00', '8900.00', '✨ Premium Karchupi Jamdani ✨

ঐতিহ্য আর রাজকীয় সৌন্দর্যের এক অপূর্ব মেলবন্ধন। ❤️
Premium Karchupi Jamdani — বিয়ে, উৎসব কিংবা যেকোনো বিশেষ আয়োজনে আপনার লুককে দেবে elegant & graceful touch. ✨', 'Women', 'SAREE', 'https://www.instagram.com/reel/DcYvD-KgtWR/?igsi=MWRkMzYwdHBzemQ1Nw==', 'pending', 0, 0, 0, 0, 0, '[]', '[]', 10, 1, '[]', NULL, 'DcYvD-KgtWR'),
  ('2d273c2a-2ef1-4120-a6f6-8ec056684152', 17, '2026-08-23 18:42:51', 'Organza Three Piece ', '2150.00', '2350.00', '✨ এক্সক্লুসিভ অরগানজা পার্টি থ্রি-পিস ✨

যেকোনো পার্টি বা উৎসবের জন্য পারফেক্ট এই প্রিমিয়াম কোয়ালিটির রেডিমেড থ্রি-পিসটি। আকর্ষণীয় ডিজাইন এবং আরামদায়ক ফেব্রিকের এই ড্রেসটি আপনাকে দেবে একটি গর্জিয়াস লুক!

প্রোডাক্ট ডিটেইলস:

মেটেরিয়াল/ফেব্রিক: প্রিমিয়াম অরগানজা

ধরন: সম্পূর্ণ রেডিমেড বা সেলাই করা (Stitched)

এভেইলেবল সাইজ: ৩৬, ৩৮, ৪০, ৪২, ৪৪

রেগুলার প্রাইস: ২৩৫০ টাকা

অফার প্রাইস: ২১৫০ টাকা

⚠️ বিশেষ দ্রষ্টব্য: এটি আমাদের এক্সক্লুসিভ কালেকশন, তাই অর্ডার কনফার্ম করার জন্য ৫০০ টাকা অগ্রিম (Advance) প্রযোজ্য।', 'Women', 'Party-Three-Piece', 'https://www.instagram.com/reel/DcX6CDQiTlD/?igsi=MThyMWU2azhzaG96bQ==', 'pending', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"36"},{"is_available":true,"name":"38"},{"is_available":true,"name":"40"},{"is_available":true,"name":"42"},{"is_available":true,"name":"44"}]', '[]', 5, 1, '["/api/img/2d273c2a-2ef1-4120-a6f6-8ec056684152"]', '/api/img/2d273c2a-2ef1-4120-a6f6-8ec056684152', 'DcX6CDQiTlD'),
  ('d7759356-c6e9-4b70-bfb6-884a0d7b18ae', 16, '2026-08-22 10:59:09', 'Halfsilk Saree', '250.00', '350.00', 'হাল্পসিল্ক শাড়ী।
১১ হাত', 'Women', 'SAREE', 'https://www.instagram.com/reel/DcNxqlGE5kS/?igsi=OXh3Mms2NGY0ZXZv', 'pending', 0, 0, 0, 0, 0, '[]', '[]', 50, 0, '["/api/img/d7759356-c6e9-4b70-bfb6-884a0d7b18ae"]', '/api/img/d7759356-c6e9-4b70-bfb6-884a0d7b18ae', 'DcNxqlGE5kS'),
  ('a62d7c2c-dc8e-4c91-9bcc-cad5c991d59b', 15, '2026-08-22 10:57:27', 'Dhupian Saree', '6850.00', '6850.00', '✨ Available Now | In Stock
', 'Women', 'SAREE', 'https://www.instagram.com/reel/DcS9gn0gCD-/?igsi=MWgyZW9kbGp5emwwYw==', 'pending', 0, 0, 0, 0, 0, '[]', '[]', 4, 1, '["/api/img/a62d7c2c-dc8e-4c91-9bcc-cad5c991d59b"]', '/api/img/a62d7c2c-dc8e-4c91-9bcc-cad5c991d59b', 'DcS9gn0gCD-'),
  ('f1300c18-ad6a-4006-a442-7fa8f61c6e6c', 14, '2026-08-22 10:54:55', 'Dhupian Saree', '5150.00', '5350.00', '✨ Available Now | In Stock', 'Women', 'SAREE', 'https://www.instagram.com/reel/DcTXk1UDl1B/?igsi=bzg5MjN0czQ4cWxn', 'pending', 0, 0, 0, 0, 0, '[]', '[]', 5, 1, '["/api/img/f1300c18-ad6a-4006-a442-7fa8f61c6e6c"]', '/api/img/f1300c18-ad6a-4006-a442-7fa8f61c6e6c', 'DcTXk1UDl1B'),
  ('153d21cb-8a92-4d1c-8bdf-f6d9d1fef573', 13, '2026-08-21 09:55:56', 'Readymade Three Piece ', '950.00', '1050.00', 'Readymade Three pises', 'Women', 'STITCHED-COTTON-THREE-PIECE', 'https://www.instagram.com/reel/DcQ7fxFjB6n/?igsi=bGdkNnF2Z2E0NzNx', 'pending', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"Free Size"}]', '[]', 10, 0, '["/api/img/153d21cb-8a92-4d1c-8bdf-f6d9d1fef573"]', '/api/img/153d21cb-8a92-4d1c-8bdf-f6d9d1fef573', 'DcQ7fxFjB6n'),
  ('c039831e-89b9-4959-988c-0487869f6597', 12, '2026-08-21 09:53:35', 'Tiger Print 2 Piece ', '1050.00', '1150.00', 'Westren 2pis
Fabric: Coton brush 
Tops long:34
Pent long :40', 'Women', 'WESTERN-2-PIECE', 'https://www.instagram.com/reel/DcQneE0jWAx/?igsi=YzZ0cjdyM2VnYzNl', 'pending', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"Free Size"}]', '[]', 5, 0, '["/api/img/c039831e-89b9-4959-988c-0487869f6597"]', '/api/img/c039831e-89b9-4959-988c-0487869f6597', 'DcQneE0jWAx'),
  ('5ec6ef69-b8a5-4ac9-942d-70f8a7565409', 11, '2026-08-20 07:34:53', 'Round Cut Parshi', '2650.00', '2850.00', '✨ Premium Cotton Round Cut Parshi ✨

🌿 Fabric: Premium Cotton
📏 Size: 38–44
💫 Comfortable fit with an elegant look
', 'Women', 'PARSHI', 'https://www.instagram.com/reel/DcOWHt8j6Ss/?igsh=MWl6OWVsemxwb2d6cQ==', 'pending', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"38"},{"is_available":true,"name":"40"},{"is_available":true,"name":"42"},{"is_available":true,"name":"44"}]', '[]', 5, 1, '["/api/img/5ec6ef69-b8a5-4ac9-942d-70f8a7565409"]', '/api/img/5ec6ef69-b8a5-4ac9-942d-70f8a7565409', 'DcOWHt8j6Ss');
INSERT IGNORE INTO `products` (`id`, `serial_no`, `created_at`, `name`, `price`, `original_price`, `description`, `category`, `subcategory`, `video_url`, `status`, `is_sale`, `is_hot`, `is_new`, `is_sold_out`, `is_deleted`, `available_sizes`, `available_colors`, `stock_count`, `is_exclusive`, `images`, `image_url`, `platform_id`) VALUES 
  ('a04484bb-f10b-430c-b5f7-acb7d42a3bd5', 10, '2026-08-20 07:31:27', 'Low Gol Cut Three  Piece ', '1220.00', '1350.00', '✨ Low Gol Cut 3 Piece ✨

👗 Fabric: Premium China Cotton
💫 Trendy Low Gol Cut Design
🌸 Comfortable & Stylish — Perfect for Everyday & Outing', 'Women', 'STITCHED-COTTON-THREE-PIECE', 'https://www.instagram.com/reel/DcLgWg1kmMC/?igsh=MTNpeWVjbmRucjJ3YQ==', 'pending', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"38"},{"is_available":true,"name":"40"},{"is_available":true,"name":"42"},{"is_available":true,"name":"44"}]', '[]', 5, 0, '["/api/img/a04484bb-f10b-430c-b5f7-acb7d42a3bd5"]', '/api/img/a04484bb-f10b-430c-b5f7-acb7d42a3bd5', 'DcLgWg1kmMC'),
  ('5a84ec9b-ef45-487d-a8bd-61642fbc4382', 9, '2026-08-20 07:27:42', 'Peyari Parshi ', '3650.00', '3850.00', '✨ Exclusive Trendy Parshi Dress ✨

Trendy design, premium Parshi fabric & elegant finishing—perfect for your everyday and outing look. 🤍

👗 Product: Exclusive Parshi Dress
🧵 Fabric: Premium Parshi', 'Women', 'PARSHI', 'https://www.instagram.com/reel/DcK-oL9FMSA/?igsh=MWp5b3MzYXVqdHYzZA==', 'pending', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"38"},{"is_available":true,"name":"40"},{"is_available":true,"name":"42"},{"is_available":true,"name":"44"}]', '[]', 5, 1, '["/api/img/5a84ec9b-ef45-487d-a8bd-61642fbc4382"]', '/api/img/5a84ec9b-ef45-487d-a8bd-61642fbc4382', 'DcK-oL9FMSA'),
  ('8223df2f-f7a3-4433-b467-0a698327f23f', 8, '2026-08-17 17:14:33', 'Round Cut Parshi', '2450.00', '2650.00', '✨ Premium Cotton Round Cut Parshi ✨

🌿 Fabric: Premium Cotton
📏 Size: 38–44
💫 Comfortable fit with an elegant look
', 'Women', 'PARSHI', 'https://www.instagram.com/reel/DcJET0xDMLy/?igsh=cXp0MmRrMTVuODFl', 'published', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"40"},{"is_available":true,"name":"38"},{"is_available":true,"name":"42"},{"is_available":true,"name":"44"}]', '[]', 6, 1, '["/img/products/8223df2f-f7a3-4433-b467-0a698327f23f.jpg"]', '/img/products/8223df2f-f7a3-4433-b467-0a698327f23f.jpg', 'DcJET0xDMLy'),
  ('2954b684-566d-4e7d-8021-48d41abab462', 7, '2026-08-16 12:46:23', 'Long Cut Parshi ', '3650.00', '3750.00', '✨ Exclusive Trendy Parshi Dress ✨

Trendy design, premium Parshi fabric & elegant finishing—perfect for your everyday and outing look. 🤍

👗 Product: Exclusive Parshi Dress
🧵 Fabric: Premium Parshi', 'Women', 'PARSHI', 'https://www.instagram.com/reel/DcGQ5vFAVvp/?igsh=MTg3MTlyazNsd212YQ==', 'published', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"36"},{"is_available":true,"name":"38"},{"is_available":true,"name":"40"},{"is_available":true,"name":"42"}]', '[]', 8, 1, '["/img/products/2954b684-566d-4e7d-8021-48d41abab462.jpg"]', '/img/products/2954b684-566d-4e7d-8021-48d41abab462.jpg', 'DcGQ5vFAVvp'),
  ('3d283e9b-f614-41a2-a371-72a1698a024a', 6, '2026-08-16 12:43:04', 'Premium Coton  3 Piece ', '1120.00', '1250.00', '✨ রেডি কটন থ্রি-পিস ✨

আরামদায়ক প্রিমিয়াম কটন ফ্যাব্রিক ও স্টাইলিশ ডিজাইনের সুন্দর কালেকশন। 💖

🧵 ফ্যাব্রিক: প্রিমিয়াম কটন
📏 সাইজ: ৩৮–৪৪', 'Women', 'STITCHED-COTTON-THREE-PIECE', 'https://www.instagram.com/reel/DcGQQtuDOm6/?igsh=MXRqZ2poeG1sOGxwOA==', 'pending', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"36"},{"is_available":true,"name":"38"},{"is_available":true,"name":"40"},{"is_available":true,"name":"42"}]', '[]', 12, 0, '["/api/img/3d283e9b-f614-41a2-a371-72a1698a024a","/api/img/up-e1584a2d1abe4712"]', '/api/img/3d283e9b-f614-41a2-a371-72a1698a024a', 'DcGQQtuDOm6'),
  ('6272582e-0885-4e62-a0f2-ca025528b479', 5, '2026-08-16 12:38:24', 'Silk Three Piece', '950.00', '1050.00', '🔥 SPECIAL OFFER! 🔥

✨ Premium Silk 3-Piece
💰 Offer Price: মাত্র 95*

Premium quality • Elegant look • Limited stock', 'Women', 'STITCHED-COTTON-THREE-PIECE', 'https://www.instagram.com/reel/DcF-mqSkje9/?igsh=MTIybGtkMGFzbjZxYg==', 'pending', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"Free Size"}]', '[]', 5, 0, '["/api/img/6272582e-0885-4e62-a0f2-ca025528b479"]', '/api/img/6272582e-0885-4e62-a0f2-ca025528b479', 'DcF-mqSkje9'),
  ('ff0e20de-63ce-4f1a-a696-32ac58561020', 4, '2026-08-15 19:55:42', 'রেডি কটন থ্রি- পিস ', '1120.00', '1280.00', '✨ রেডি কটন থ্রি-পিস ✨

আরামদায়ক প্রিমিয়াম কটন ফ্যাব্রিক ও স্টাইলিশ ডিজাইনের সুন্দর কালেকশন। 💖

🧵 ফ্যাব্রিক: প্রিমিয়াম কটন
📏 সাইজ: ৩৮–৪৪', 'Women', 'STITCHED-COTTON-THREE-PIECE', 'https://www.instagram.com/reel/DcDwrx5EcNQ/?igsh=MXJmZW1rNmU1MXQ0eQ==', 'published', 0, 0, 0, 1, 0, '[{"is_available":true,"name":"36"},{"is_available":true,"name":"38"},{"is_available":true,"name":"40"},{"is_available":true,"name":"42"}]', '[]', 6, 0, '["/img/products/ff0e20de-63ce-4f1a-a696-32ac58561020.jpg"]', '/img/products/ff0e20de-63ce-4f1a-a696-32ac58561020.jpg', 'DcDwrx5EcNQ'),
  ('2e0be2d1-3151-4a29-a53a-c8138a8e1202', 3, '2026-08-15 16:59:31', 'রেডি কটন থ্রি -পিস', '1120.00', '1250.00', '✨ রেডি কটন থ্রি-পিস ✨

আরামদায়ক প্রিমিয়াম কটন ফ্যাব্রিক ও স্টাইলিশ ডিজাইনের সুন্দর কালেকশন। 💖

🧵 ফ্যাব্রিক: প্রিমিয়াম কটন
📏 সাইজ: ৩৮–৪৪', 'Women', 'STITCHED-COTTON-THREE-PIECE', 'https://www.instagram.com/reel/DcD_68XgoVn/?igsh=cGRkdHI4YnozdDA4', 'published', 0, 0, 0, 0, 0, '[{"is_available":true,"name":"38"},{"is_available":true,"name":"40"},{"is_available":true,"name":"42"}]', '[]', 5, 0, '["/img/products/2e0be2d1-3151-4a29-a53a-c8138a8e1202.jpg"]', '/img/products/2e0be2d1-3151-4a29-a53a-c8138a8e1202.jpg', 'DcD_68XgoVn'),
  ('25bf0f2e-255c-4a0d-ba86-5340f6f1549d', 2, '2026-08-15 13:40:30', 'Tiger Print 2 Piece', '1050.00', '1150.00', 'Fabric coton brush
Dress:34 
Pent:40', 'Women', 'WESTERN-2-PIECE', 'https://www.instagram.com/reel/DcBq0jYAjTc/?igsh=MTU2amFrNW4wcDkzYg==', 'published', 0, 0, 0, 0, 0, '[]', '[{"hex":"#888888","image":"/img/products/25bf0f2e-255c-4a0d-ba86-5340f6f1549d_color_0.jpg","is_available":true,"name":"Tiger print","sizes":[]}]', 4, 0, '["/img/products/25bf0f2e-255c-4a0d-ba86-5340f6f1549d.jpg"]', '/img/products/25bf0f2e-255c-4a0d-ba86-5340f6f1549d.jpg', 'DcBq0jYAjTc'),
  ('0123574c-363a-4f0a-b1b7-40d60dfde7c3', 1, '2026-08-15 13:37:52', 'Holud Event Saree ', '450.00', '499.00', 'Instagram Content', 'Women', 'SAREE', 'https://www.instagram.com/reel/DcEAQ1mmumC/?utm_source=ig_web_copy_link&igsh=NTc4MTIwNjQ2YQ==', 'published', 0, 0, 0, 0, 0, '[]', '[]', 19, 0, '["/img/products/0123574c-363a-4f0a-b1b7-40d60dfde7c3.jpg"]', '/img/products/0123574c-363a-4f0a-b1b7-40d60dfde7c3.jpg', 'DcEAQ1mmumC');

-- Data for table orders
INSERT IGNORE INTO `orders` (`id`, `user_id`, `product_id`, `product_name`, `product_price`, `customer_name`, `customer_phone`, `customer_address`, `customer_note`, `delivery_area`, `delivery_charge`, `total_amount`, `last_four_digits`, `status`, `size`, `color`, `is_advance_paid`, `is_exclusive_order`, `payment_status`, `moderator_reference`, `created_at`) VALUES 
  ('f006ab10-a4bf-4750-ab6f-4d1ddae98c2f', NULL, '6d2bc150-4a53-4210-98c3-cf02ca95a5fe', 'Ready Luxury Partywear Sara-Ra ', '3350.00', 'ফারজানা', '01732782845', 'ক্রপচর নতুন বাজার চরপারা  শামচু বেপারী বাড়ি, শিবচর, মাদারীপুর', 'Chat order · advance ৳500 via bKash', 'outside', '150.00', '3500.00', '01732782845', 'Deleted', NULL, NULL, 1, 1, 'Advance Paid', NULL, '2026-09-17 04:45:54'),
  ('c1c66136-a46d-4ae9-a659-9594ab124f5a', NULL, '6d2bc150-4a53-4210-98c3-cf02ca95a5fe', 'Ready Luxury Partywear Sara-Ra ', '3350.00', 'ফারজানা', '01732782845', 'ক্রচর নতুন বাজার শামচু মেমবাড় বাড়ি, শিবচর, মাদারীপুর', 'Chat order · advance ৳500 via bKash', 'outside', '150.00', '3500.00', '01732782845', 'Pending', NULL, NULL, 0, 1, 'Unpaid', NULL, '2026-09-17 04:33:48'),
  ('2aba41ff-c2dd-4fb1-94e2-97c727f1a172', NULL, '63f73b8e-e909-43b2-bc2f-e4beab3e99d4', 'Western 2 Piece (Size: Free Size) (SKU: DcnRwfXgHVx) (Qty: 1) (PID: 63f73b8e-e909-43b2-bc2f-e4beab3e99d4)', '1050.00', 'Ashfa', '01858461188', 'Betor baper building, noukaghat er age, bhuwaliya para,Satkania, Chattogram  | সাতকানিয়া, চট্টগ্রাম', 'Cart Items: Western 2 Piece (Size: Free Size) (SKU: DcnRwfXgHVx) (Qty: 1) (PID: 63f73b8e-e909-43b2-bc2f-e4beab3e99d4)', 'chattogram', '100.00', '1150.00', 'COD: 01867426327', 'Delivered', 'Free Size', NULL, 1, 0, 'Advance Paid', NULL, '2026-09-08 17:18:10');

-- Data for table users
INSERT IGNORE INTO `users` (`id`, `name`, `email`, `phone`, `avatar_url`, `created_at`) VALUES 
  ('4524a5d0-7c8d-459c-a3b2-0ff12c6e557c', 'Arzu Akhter', 'akhterarzu9@gmail.com', NULL, 'https://lh3.googleusercontent.com/a/ACg8ocLIAdyH1aJAESMerizttgpYRPqBq4B54ZUVPDxNb-xeqTOF8A=s96-c', '2026-09-18 16:32:53'),
  ('52bc63e0-c69f-4324-b98b-cc96c080762a', 'Md Masum Billa', 'mdmasum255312@gmail.com', '01775954110', '', '2026-09-17 04:55:15'),
  ('6f422014-0acc-49ee-969c-6e5fd53b6602', 'Surfer Joynal', 'surferjoynal3@gmail.com', '+60146850998', 'https://lh3.googleusercontent.com/a/ACg8ocJR3e2qf2CIvbszsVB-MEE7oy6qMLSslGvzG1-7KpGpjsaN1lI=s96-c', '2026-09-17 04:30:53'),
  ('38d2cfed-f8c2-4bb3-899f-600069284533', 'zisan iphone11', 'iphonezisan@gmail.com', NULL, 'https://lh3.googleusercontent.com/a/ACg8ocKbCNb0SikqFlPTrCX4gOLqlCklvjOpqbHDahW-TA0DAPxPEio=s96-c', '2026-09-16 17:51:00'),
  ('53a864e5-ad50-4124-bcfa-c3a4af107868', 'Rj Pranto', 'prantorj740@gmail.com', NULL, 'https://lh3.googleusercontent.com/a/ACg8ocJ6tho75_rJHPh6lcsjfCGuXDXz3pPKnnmHgQGrHpYkjI7PUiCH=s96-c', '2026-09-16 09:15:39'),
  ('fbed6559-d330-48b4-9039-d1265782a50c', 'Arafa Jannat', 'arafajannat51@gmail.com', NULL, 'https://lh3.googleusercontent.com/a/ACg8ocLnpgFwMwK-Rl6ddDixBFxAwA6fFPQM_neEWswz2EGBldo-Pw=s96-c', '2026-09-14 20:45:12'),
  ('caca6ae6-c950-442c-b67d-aae85a199797', 'Raisa Hossain Raisu', 'raisahossainraisu100@gmail.com', NULL, 'https://lh3.googleusercontent.com/a/ACg8ocJINnNer1_oCJi0SDF31HmPxrCepj47NvGcHE24rmvgw-sg5g=s96-c', '2026-09-11 10:32:25'),
  ('d96b108e-83bd-479e-8233-0484d2c94e85', 'Tanisa Akther', 'akthertanisa77@gmail.com', NULL, 'https://lh3.googleusercontent.com/a/ACg8ocLX-u3fWzxaU_NtT_w8-gJ2rQmc1QzpwFvpqv72_1BgKa18ag=s96-c', '2026-09-10 09:54:20'),
  ('9d0f6e16-a891-4fec-8e09-c8e06924c626', 'Saleha Rahman Orpa', 'orpasaleharahman@gmail.com', '01837671061', 'https://lh3.googleusercontent.com/a/ACg8ocLr7RPuKozRDCti8BBmQ4EqIqEZTLl871O_Gk_W7Icu-3IiRA=s96-c', '2026-09-06 19:46:34'),
  ('87d953bf-5522-4ad1-9984-527e29619a75', 'Zh Zihad', 'zhzihad2000@gmail.com', NULL, 'https://lh3.googleusercontent.com/a/ACg8ocIrvDK7Yi2B6sYRLtjWtqRIZvGtAyGgwqxuKNcxwt0EykiUzxhF=s96-c', '2026-09-06 11:18:48'),
  ('96f61939-82e2-402b-90ab-f8be1e554477', 'ZIHAD', 'zihadlaptopasus@gmail.com', '01857045449', 'https://lh3.googleusercontent.com/a/ACg8ocJ7DxUgWbdfLm2Ie0ujUtqejxhY37sgaQ5fruIQ_5sK10JPUPg=s96-c', '2026-09-06 07:58:27');

SET FOREIGN_KEY_CHECKS = 1;
