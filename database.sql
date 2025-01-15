CREATE DATABASE IF NOT EXISTS clicker_game;
USE clicker_game;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY,
    username VARCHAR(255),
    clicks BIGINT DEFAULT 0,
    coins BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS upgrades (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    cost BIGINT NOT NULL,
    multiplier FLOAT NOT NULL,
    image_url VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS user_upgrades (
    user_id BIGINT,
    upgrade_id INT,
    quantity INT DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (upgrade_id) REFERENCES upgrades(id),
    PRIMARY KEY (user_id, upgrade_id)
);

-- Начальные улучшения
INSERT INTO upgrades (name, description, cost, multiplier, image_url) VALUES
('Автокликер', 'Автоматически кликает каждую секунду', 100, 1, '/images/autoclicker.png'),
('Супер палец', 'Увеличивает количество монет за клик', 500, 2, '/images/superfinger.png'),
('Золотой курсор', 'Значительно увеличивает доход от кликов', 2000, 5, '/images/goldcursor.png'),
('Магический бустер', 'Временно удваивает все доходы', 5000, 10, '/images/magicbooster.png'); 