-- Telegram Clicker Game Database Schema

CREATE DATABASE IF NOT EXISTS telegram_clicker_game;
USE telegram_clicker_game;

-- Users table
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    coins DECIMAL(20, 2) DEFAULT 0,
    gems INT DEFAULT 0,
    level INT DEFAULT 1,
    experience BIGINT DEFAULT 0,
    click_power INT DEFAULT 1,
    auto_income DECIMAL(10, 2) DEFAULT 0,
    prestige_level INT DEFAULT 0,
    prestige_points INT DEFAULT 0,
    total_clicks BIGINT DEFAULT 0,
    total_earned DECIMAL(20, 2) DEFAULT 0,
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Upgrades table
CREATE TABLE upgrades (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type ENUM('click_power', 'auto_income', 'special') NOT NULL,
    base_cost DECIMAL(15, 2) NOT NULL,
    cost_multiplier DECIMAL(5, 2) DEFAULT 1.15,
    base_effect DECIMAL(10, 2) NOT NULL,
    max_level INT DEFAULT NULL,
    icon VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User upgrades table
CREATE TABLE user_upgrades (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    upgrade_id INT NOT NULL,
    level INT DEFAULT 0,
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (upgrade_id) REFERENCES upgrades(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_upgrade (user_id, upgrade_id)
);

-- Businesses table
CREATE TABLE businesses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    base_cost DECIMAL(15, 2) NOT NULL,
    base_income DECIMAL(10, 2) NOT NULL,
    cost_multiplier DECIMAL(5, 2) DEFAULT 1.07,
    income_time INT DEFAULT 3600, -- seconds
    icon VARCHAR(255),
    unlock_level INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User businesses table
CREATE TABLE user_businesses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    business_id INT NOT NULL,
    level INT DEFAULT 0,
    last_collected TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_business (user_id, business_id)
);

-- Transactions table
CREATE TABLE transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    from_user_id INT,
    to_user_id INT,
    amount DECIMAL(15, 2) NOT NULL,
    type ENUM('transfer', 'purchase', 'reward', 'business_income', 'click_income') NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Achievements table
CREATE TABLE achievements (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(100) NOT NULL,
    requirement_value BIGINT NOT NULL,
    reward_coins DECIMAL(15, 2) DEFAULT 0,
    reward_gems INT DEFAULT 0,
    icon VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User achievements table
CREATE TABLE user_achievements (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    achievement_id INT NOT NULL,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_achievement (user_id, achievement_id)
);

-- Insert default upgrades
INSERT INTO upgrades (name, description, type, base_cost, base_effect, icon) VALUES
('Stronger Finger', 'Увеличивает силу клика на 1', 'click_power', 15, 1, '👆'),
('Power Click', 'Увеличивает силу клика на 5', 'click_power', 100, 5, '💪'),
('Mega Click', 'Увеличивает силу клика на 25', 'click_power', 1000, 25, '⚡'),
('Auto Clicker', 'Автоматически кликает каждую секунду', 'auto_income', 500, 1, '🤖'),
('Turbo Mode', 'Увеличивает автоматический доход', 'auto_income', 2500, 5, '🚀');

-- Insert default businesses
INSERT INTO businesses (name, description, base_cost, base_income, icon, unlock_level) VALUES
('Лимонадный стенд', 'Простой бизнес для начинающих', 50, 2, '🍋', 1),
('Кофейня', 'Приносит стабильный доход', 300, 15, '☕', 5),
('Пекарня', 'Вкусная прибыль каждый час', 1500, 75, '🥖', 10),
('Ресторан', 'Высококлассное заведение', 8000, 400, '🍽️', 20),
('IT Компания', 'Технологический бизнес', 50000, 2500, '💻', 35),
('Банк', 'Финансовая империя', 300000, 15000, '🏦', 50);

-- Insert default achievements
INSERT INTO achievements (name, description, type, requirement_value, reward_coins, reward_gems, icon) VALUES
('Первый клик', 'Сделайте свой первый клик', 'clicks', 1, 10, 1, '🎯'),
('Кликер', 'Сделайте 100 кликов', 'clicks', 100, 100, 5, '👆'),
('Мастер кликов', 'Сделайте 1000 кликов', 'clicks', 1000, 1000, 10, '⚡'),
('Первые деньги', 'Заработайте 100 монет', 'coins', 100, 50, 2, '💰'),
('Богач', 'Заработайте 10000 монет', 'coins', 10000, 1000, 25, '💎'),
('Миллионер', 'Заработайте 1000000 монет', 'coins', 1000000, 50000, 100, '👑');
