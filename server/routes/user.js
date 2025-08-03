const express = require('express');
const db = require('../config/database');
const authModule = require('./auth');
const authenticateToken = authModule.authenticateToken;

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get user profile
router.get('/profile', async (req, res) => {
    try {
        const { userId } = req.user;

        const [users] = await db.execute(`
            SELECT id, telegram_id, username, first_name, last_name, 
                   coins, gems, level, experience, click_power, auto_income,
                   prestige_level, prestige_points, total_clicks, total_earned,
                   created_at, last_active
            FROM users WHERE id = ?
        `, [userId]);

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];
        
        // Get user achievements count
        const [achievementCount] = await db.execute(
            'SELECT COUNT(*) as count FROM user_achievements WHERE user_id = ?',
            [userId]
        );

        // Get user businesses count
        const [businessCount] = await db.execute(
            'SELECT COUNT(*) as count FROM user_businesses WHERE user_id = ? AND level > 0',
            [userId]
        );

        res.json({
            success: true,
            user: {
                ...user,
                coins: parseFloat(user.coins),
                auto_income: parseFloat(user.auto_income),
                total_earned: parseFloat(user.total_earned),
                achievements_count: achievementCount[0].count,
                businesses_count: businessCount[0].count
            }
        });

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user achievements
router.get('/achievements', async (req, res) => {
    try {
        const { userId } = req.user;

        const [achievements] = await db.execute(`
            SELECT a.*, ua.earned_at,
                   CASE WHEN ua.id IS NOT NULL THEN 1 ELSE 0 END as earned
            FROM achievements a
            LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
            ORDER BY earned DESC, a.id
        `, [userId]);

        res.json({ success: true, achievements });

    } catch (error) {
        console.error('Get achievements error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Transfer coins to another user
router.post('/transfer', async (req, res) => {
    try {
        const { userId } = req.user;
        const { recipientId, amount } = req.body;

        if (!recipientId || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid transfer data' });
        }

        if (userId === recipientId) {
            return res.status(400).json({ error: 'Cannot transfer to yourself' });
        }

        // Get sender's coins
        const [senders] = await db.execute(
            'SELECT coins, username FROM users WHERE id = ?',
            [userId]
        );

        if (senders.length === 0) {
            return res.status(404).json({ error: 'Sender not found' });
        }

        const senderCoins = parseFloat(senders[0].coins);
        const senderName = senders[0].username || senders[0].first_name;

        if (senderCoins < amount) {
            return res.status(400).json({ error: 'Insufficient coins' });
        }

        // Check if recipient exists
        const [recipients] = await db.execute(
            'SELECT id, username, first_name FROM users WHERE id = ?',
            [recipientId]
        );

        if (recipients.length === 0) {
            return res.status(404).json({ error: 'Recipient not found' });
        }

        const recipientName = recipients[0].username || recipients[0].first_name;

        // Start transaction
        await db.execute('START TRANSACTION');

        try {
            // Deduct from sender
            await db.execute(
                'UPDATE users SET coins = coins - ? WHERE id = ?',
                [amount, userId]
            );

            // Add to recipient
            await db.execute(
                'UPDATE users SET coins = coins + ? WHERE id = ?',
                [amount, recipientId]
            );

            // Record transaction
            await db.execute(
                'INSERT INTO transactions (from_user_id, to_user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)',
                [userId, recipientId, amount, 'transfer', `Transfer from ${senderName} to ${recipientName}`]
            );

            await db.execute('COMMIT');

            res.json({
                success: true,
                message: 'Transfer completed successfully',
                remainingCoins: senderCoins - amount
            });

        } catch (error) {
            await db.execute('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Transfer error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Prestige/Rebirth
router.post('/prestige', async (req, res) => {
    try {
        const { userId } = req.user;

        // Get user stats
        const [users] = await db.execute(
            'SELECT level, prestige_level, coins FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];
        const minLevelForPrestige = 50;

        if (user.level < minLevelForPrestige) {
            return res.status(400).json({ 
                error: `Minimum level ${minLevelForPrestige} required for prestige` 
            });
        }

        // Calculate prestige points based on level
        const prestigePoints = Math.floor(user.level / 10);

        // Start transaction
        await db.execute('START TRANSACTION');

        try {
            // Reset user stats but keep prestige progress
            await db.execute(`
                UPDATE users SET 
                    coins = 1000,
                    level = 1,
                    experience = 0,
                    click_power = 1 + (prestige_level * 2),
                    auto_income = prestige_level * 5,
                    prestige_level = prestige_level + 1,
                    prestige_points = prestige_points + ?
                WHERE id = ?
            `, [prestigePoints, userId]);

            // Reset user upgrades
            await db.execute('DELETE FROM user_upgrades WHERE user_id = ?', [userId]);

            // Reset user businesses
            await db.execute('DELETE FROM user_businesses WHERE user_id = ?', [userId]);

            // Record prestige transaction
            await db.execute(
                'INSERT INTO transactions (to_user_id, amount, type, description) VALUES (?, ?, ?, ?)',
                [userId, 1000, 'reward', `Prestige bonus - Level ${user.prestige_level + 1}`]
            );

            await db.execute('COMMIT');

            res.json({
                success: true,
                message: 'Prestige completed successfully!',
                prestigeLevel: user.prestige_level + 1,
                prestigePoints: user.prestige_points + prestigePoints,
                bonuses: {
                    clickPower: 1 + ((user.prestige_level + 1) * 2),
                    autoIncome: (user.prestige_level + 1) * 5,
                    startingCoins: 1000
                }
            });

        } catch (error) {
            await db.execute('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Prestige error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
