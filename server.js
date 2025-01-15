require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());

// Конфигурация базы данных
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

// Создание пула соединений
const pool = mysql.createPool(dbConfig);

// Middleware для проверки Telegram данных
const validateTelegramWebAppData = async (req, res, next) => {
    // Здесь должна быть валидация данных от Telegram
    // Для тестирования пропускаем все запросы
    next();
};

// Роуты API
app.post('/api/user', validateTelegramWebAppData, async (req, res) => {
    try {
        const { id, username } = req.body;
        const connection = await pool.getConnection();
        await connection.execute(
            'INSERT INTO users (id, username) VALUES (?, ?) ON DUPLICATE KEY UPDATE username = ?',
            [id, username, username]
        );
        connection.release();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/click', validateTelegramWebAppData, async (req, res) => {
    try {
        const { userId } = req.body;
        const connection = await pool.getConnection();
        await connection.execute(
            'UPDATE users SET clicks = clicks + 1, coins = coins + 1 WHERE id = ?',
            [userId]
        );
        const [[user]] = await connection.execute(
            'SELECT clicks, coins FROM users WHERE id = ?',
            [userId]
        );
        connection.release();
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/upgrades', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [upgrades] = await connection.execute('SELECT * FROM upgrades');
        connection.release();
        res.json(upgrades);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/buy-upgrade', validateTelegramWebAppData, async (req, res) => {
    try {
        const { userId, upgradeId } = req.body;
        const connection = await pool.getConnection();
        
        await connection.beginTransaction();
        
        const [[upgrade]] = await connection.execute(
            'SELECT * FROM upgrades WHERE id = ?',
            [upgradeId]
        );
        
        const [[user]] = await connection.execute(
            'SELECT coins FROM users WHERE id = ?',
            [userId]
        );

        if (user.coins >= upgrade.cost) {
            await connection.execute(
                'UPDATE users SET coins = coins - ? WHERE id = ?',
                [upgrade.cost, userId]
            );
            
            await connection.execute(
                'INSERT INTO user_upgrades (user_id, upgrade_id, quantity) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE quantity = quantity + 1',
                [userId, upgradeId]
            );
            
            await connection.commit();
            res.json({ success: true });
        } else {
            await connection.rollback();
            res.status(400).json({ error: 'Недостаточно монет' });
        }
        
        connection.release();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
}); 