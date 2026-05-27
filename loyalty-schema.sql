-- Программа лояльности PHICANDLES
-- Запустить в phpMyAdmin на Reg.ru (база данных phicandles)

CREATE TABLE IF NOT EXISTS loyalty_members (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL DEFAULT '',
    phone           VARCHAR(50)  NOT NULL DEFAULT '',
    referral_code   VARCHAR(20)  NOT NULL UNIQUE,
    referred_by     VARCHAR(20)  DEFAULT NULL,
    points_balance  INT          NOT NULL DEFAULT 0,
    total_spent     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    email       VARCHAR(255) NOT NULL,
    type        ENUM('earned','spent','referral_bonus','referral_friend_bonus','manual') NOT NULL,
    points      INT NOT NULL,
    order_id    VARCHAR(50) DEFAULT NULL,
    description VARCHAR(500) DEFAULT '',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
