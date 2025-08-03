const express = require('express');
const db = require('../config/database');
const authModule = require('./auth');
const authenticateToken = authModule.authenticateToken;

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Click action
router.post('/click', async (req, res) => {
    try {
        const { userId } = req.user;
        const { clicks = 1 } = req.body;

        // Get user's current stats
        const [users] = await db.execute(
            'SELECT * FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];
        const earnedCoins = user.click_power * clicks;
        const newExperience = user.experience + clicks;
        const newLevel = Math.floor(Math.sqrt(newExperience / 100)) + 1;
        const newTotalClicks = user.total_clicks + clicks;
        const newTotalEarned = parseFloat(user.total_earned) + earnedCoins;

        // Update user stats
        await db.execute(
            `UPDATE users SET 
             coins = coins + ?, 
             experience = ?, 
             level = ?, 
             total_clicks = ?, 
             total_earned = ?,
             last_active = NOW()
             WHERE id = ?`,
            [earnedCoins, newExperience, newLevel, newTotalClicks, newTotalEarned, userId]
        );

        // Record transaction
        await db.execute(
            'INSERT INTO transactions (to_user_id, amount, type, description) VALUES (?, ?, ?, ?)',
            [userId, earnedCoins, 'click_income', `Earned from ${clicks} clicks`]
        );

        // Check for achievements
        await checkAchievements(userId, {
            clicks: newTotalClicks,
            coins: parseFloat(user.coins) + earnedCoins,
            level: newLevel
        });

        res.json({
            success: true,
            earnedCoins,
            newLevel: newLevel > user.level ? newLevel : null,
            totalCoins: parseFloat(user.coins) + earnedCoins,
            experience: newExperience,
            level: newLevel
        });

    } catch (error) {
        console.error('Click error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user upgrades
router.get('/upgrades', async (req, res) => {
    try {
        const { userId } = req.user;

        const [upgrades] = await db.execute(`
            SELECT u.*, COALESCE(uu.level, 0) as user_level,
                   ROUND(u.base_cost * POWER(u.cost_multiplier, COALESCE(uu.level, 0)), 2) as current_cost
            FROM upgrades u
            LEFT JOIN user_upgrades uu ON u.id = uu.upgrade_id AND uu.user_id = ?
            ORDER BY u.id
        `, [userId]);

        res.json({ success: true, upgrades });

    } catch (error) {
        console.error('Get upgrades error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Purchase upgrade
router.post('/upgrade/:upgradeId', async (req, res) => {
    try {
        const { userId } = req.user;
        const { upgradeId } = req.params;

        // Get upgrade info
        const [upgrades] = await db.execute(
            'SELECT * FROM upgrades WHERE id = ?',
            [upgradeId]
        );

        if (upgrades.length === 0) {
            return res.status(404).json({ error: 'Upgrade not found' });
        }

        const upgrade = upgrades[0];

        // Get user's current upgrade level
        const [userUpgrades] = await db.execute(
            'SELECT * FROM user_upgrades WHERE user_id = ? AND upgrade_id = ?',
            [userId, upgradeId]
        );

        const currentLevel = userUpgrades.length > 0 ? userUpgrades[0].level : 0;
        
        // Check max level
        if (upgrade.max_level && currentLevel >= upgrade.max_level) {
            return res.status(400).json({ error: 'Maximum level reached' });
        }

        const cost = Math.round(upgrade.base_cost * Math.pow(upgrade.cost_multiplier, currentLevel));

        // Get user's coins
        const [users] = await db.execute(
            'SELECT coins FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userCoins = parseFloat(users[0].coins);

        if (userCoins < cost) {
            return res.status(400).json({ error: 'Insufficient coins' });
        }

        // Start transaction
        await db.execute('START TRANSACTION');

        try {
            // Deduct coins
            await db.execute(
                'UPDATE users SET coins = coins - ? WHERE id = ?',
                [cost, userId]
            );

            // Update or insert user upgrade
            if (userUpgrades.length > 0) {
                await db.execute(
                    'UPDATE user_upgrades SET level = level + 1 WHERE user_id = ? AND upgrade_id = ?',
                    [userId, upgradeId]
                );
            } else {
                await db.execute(
                    'INSERT INTO user_upgrades (user_id, upgrade_id, level) VALUES (?, ?, 1)',
                    [userId, upgradeId]
                );
            }

            // Update user stats based on upgrade type
            if (upgrade.type === 'click_power') {
                await db.execute(
                    'UPDATE users SET click_power = click_power + ? WHERE id = ?',
                    [upgrade.base_effect, userId]
                );
            } else if (upgrade.type === 'auto_income') {
                await db.execute(
                    'UPDATE users SET auto_income = auto_income + ? WHERE id = ?',
                    [upgrade.base_effect, userId]
                );
            }

            // Record transaction
            await db.execute(
                'INSERT INTO transactions (from_user_id, amount, type, description) VALUES (?, ?, ?, ?)',
                [userId, cost, 'purchase', `Purchased ${upgrade.name} upgrade`]
            );

            await db.execute('COMMIT');

            res.json({
                success: true,
                message: 'Upgrade purchased successfully',
                newLevel: currentLevel + 1,
                cost,
                remainingCoins: userCoins - cost
            });

        } catch (error) {
            await db.execute('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Purchase upgrade error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Collect auto income
router.post('/collect-auto', async (req, res) => {
    try {
        const { userId } = req.user;

        const [users] = await db.execute(
            'SELECT auto_income, last_active FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];
        const autoIncome = parseFloat(user.auto_income);

        if (autoIncome <= 0) {
            return res.json({ success: true, earned: 0 });
        }

        // Calculate time difference in seconds
        const lastActive = new Date(user.last_active);
        const now = new Date();
        const timeDiff = Math.floor((now - lastActive) / 1000);
        const maxHours = 24; // Maximum 24 hours of offline income
        const cappedTime = Math.min(timeDiff, maxHours * 3600);
        
        const earned = Math.floor(autoIncome * (cappedTime / 3600)); // Income per hour

        if (earned > 0) {
            await db.execute(
                'UPDATE users SET coins = coins + ?, last_active = NOW() WHERE id = ?',
                [earned, userId]
            );

            // Record transaction
            await db.execute(
                'INSERT INTO transactions (to_user_id, amount, type, description) VALUES (?, ?, ?, ?)',
                [userId, earned, 'business_income', `Auto income for ${Math.floor(cappedTime / 3600)} hours`]
            );
        }

        res.json({
            success: true,
            earned,
            hoursOffline: Math.floor(cappedTime / 3600)
        });

    } catch (error) {
        console.error('Collect auto income error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Check achievements function
async function checkAchievements(userId, stats) {
    try {
        const [achievements] = await db.execute(`
            SELECT a.* FROM achievements a
            LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
            WHERE ua.id IS NULL
        `, [userId]);

        for (const achievement of achievements) {
            let earned = false;

            switch (achievement.type) {
                case 'clicks':
                    earned = stats.clicks >= achievement.requirement_value;
                    break;
                case 'coins':
                    earned = stats.coins >= achievement.requirement_value;
                    break;
                case 'level':
                    earned = stats.level >= achievement.requirement_value;
                    break;
            }

            if (earned) {
                // Award achievement
                await db.execute(
                    'INSERT INTO user_achievements (user_id, achievement_id) VALUES (?, ?)',
                    [userId, achievement.id]
                );

                // Give rewards
                if (achievement.reward_coins > 0 || achievement.reward_gems > 0) {
                    await db.execute(
                        'UPDATE users SET coins = coins + ?, gems = gems + ? WHERE id = ?',
                        [achievement.reward_coins, achievement.reward_gems, userId]
                    );
                }
            }
        }
    } catch (error) {
        console.error('Check achievements error:', error);
    }
}

module.exports = router;
