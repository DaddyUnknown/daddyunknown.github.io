const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');

const router = express.Router();

// Verify Telegram Web App data
function verifyTelegramWebAppData(initData, botToken) {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    
    const dataCheckString = Array.from(urlParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    
    return calculatedHash === hash;
}

// Login/Register user
router.post('/login', async (req, res) => {
    try {
        const { initData } = req.body;
        
        if (!initData) {
            return res.status(400).json({ error: 'Init data required' });
        }

        // For development, skip Telegram verification
        // In production, uncomment the verification below
        /*
        if (!verifyTelegramWebAppData(initData, process.env.BOT_TOKEN)) {
            return res.status(401).json({ error: 'Invalid Telegram data' });
        }
        */

        const urlParams = new URLSearchParams(initData);
        const userParam = urlParams.get('user');
        
        if (!userParam) {
            return res.status(400).json({ error: 'User data not found' });
        }

        const userData = JSON.parse(userParam);
        const { id: telegramId, username, first_name, last_name } = userData;

        // Check if user exists
        const [existingUsers] = await db.execute(
            'SELECT * FROM users WHERE telegram_id = ?',
            [telegramId]
        );

        let user;
        if (existingUsers.length > 0) {
            // Update existing user
            user = existingUsers[0];
            await db.execute(
                'UPDATE users SET username = ?, first_name = ?, last_name = ?, last_active = NOW() WHERE telegram_id = ?',
                [username, first_name, last_name, telegramId]
            );
        } else {
            // Create new user
            const [result] = await db.execute(
                'INSERT INTO users (telegram_id, username, first_name, last_name) VALUES (?, ?, ?, ?)',
                [telegramId, username, first_name, last_name]
            );
            
            const [newUser] = await db.execute(
                'SELECT * FROM users WHERE id = ?',
                [result.insertId]
            );
            user = newUser[0];
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, telegramId: user.telegram_id },
            process.env.JWT_SECRET || 'default_secret',
            { expiresIn: '30d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                telegram_id: user.telegram_id,
                username: user.username,
                first_name: user.first_name,
                last_name: user.last_name,
                coins: parseFloat(user.coins),
                gems: user.gems,
                level: user.level,
                experience: user.experience,
                click_power: user.click_power,
                auto_income: parseFloat(user.auto_income),
                prestige_level: user.prestige_level,
                prestige_points: user.prestige_points
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'default_secret', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
}

module.exports = router;
module.exports.authenticateToken = authenticateToken;
