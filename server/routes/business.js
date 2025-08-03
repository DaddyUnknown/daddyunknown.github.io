const express = require('express');
const db = require('../config/database');
const authModule = require('./auth');
const authenticateToken = authModule.authenticateToken;

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get all businesses with user's ownership info
router.get('/', async (req, res) => {
    try {
        const { userId } = req.user;

        // Get user level for unlock requirements
        const [users] = await db.execute(
            'SELECT level FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userLevel = users[0].level;

        const [businesses] = await db.execute(`
            SELECT b.*, 
                   COALESCE(ub.level, 0) as user_level,
                   ROUND(b.base_cost * POWER(b.cost_multiplier, COALESCE(ub.level, 0)), 2) as current_cost,
                   ROUND(b.base_income * COALESCE(ub.level, 0), 2) as current_income,
                   ub.last_collected,
                   CASE WHEN b.unlock_level <= ? THEN 1 ELSE 0 END as unlocked
            FROM businesses b
            LEFT JOIN user_businesses ub ON b.id = ub.business_id AND ub.user_id = ?
            ORDER BY b.unlock_level, b.id
        `, [userLevel, userId]);

        res.json({ success: true, businesses });

    } catch (error) {
        console.error('Get businesses error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Purchase/upgrade business
router.post('/:businessId/purchase', async (req, res) => {
    try {
        const { userId } = req.user;
        const { businessId } = req.params;

        // Get business info
        const [businesses] = await db.execute(
            'SELECT * FROM businesses WHERE id = ?',
            [businessId]
        );

        if (businesses.length === 0) {
            return res.status(404).json({ error: 'Business not found' });
        }

        const business = businesses[0];

        // Get user info
        const [users] = await db.execute(
            'SELECT level, coins FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];

        // Check if business is unlocked
        if (user.level < business.unlock_level) {
            return res.status(400).json({ 
                error: `Business unlocks at level ${business.unlock_level}` 
            });
        }

        // Get user's current business level
        const [userBusinesses] = await db.execute(
            'SELECT * FROM user_businesses WHERE user_id = ? AND business_id = ?',
            [userId, businessId]
        );

        const currentLevel = userBusinesses.length > 0 ? userBusinesses[0].level : 0;
        const cost = Math.round(business.base_cost * Math.pow(business.cost_multiplier, currentLevel));

        if (user.coins < cost) {
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

            // Update or insert user business
            if (userBusinesses.length > 0) {
                await db.execute(
                    'UPDATE user_businesses SET level = level + 1 WHERE user_id = ? AND business_id = ?',
                    [userId, businessId]
                );
            } else {
                await db.execute(
                    'INSERT INTO user_businesses (user_id, business_id, level) VALUES (?, ?, 1)',
                    [userId, businessId]
                );
            }

            // Record transaction
            await db.execute(
                'INSERT INTO transactions (from_user_id, amount, type, description) VALUES (?, ?, ?, ?)',
                [userId, cost, 'purchase', `Purchased ${business.name} (Level ${currentLevel + 1})`]
            );

            await db.execute('COMMIT');

            const newIncome = business.base_income * (currentLevel + 1);

            res.json({
                success: true,
                message: 'Business purchased successfully',
                newLevel: currentLevel + 1,
                cost,
                income: newIncome,
                remainingCoins: user.coins - cost
            });

        } catch (error) {
            await db.execute('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Purchase business error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Collect business income
router.post('/:businessId/collect', async (req, res) => {
    try {
        const { userId } = req.user;
        const { businessId } = req.params;

        // Get user business info
        const [userBusinesses] = await db.execute(`
            SELECT ub.*, b.base_income, b.income_time, b.name
            FROM user_businesses ub
            JOIN businesses b ON ub.business_id = b.id
            WHERE ub.user_id = ? AND ub.business_id = ? AND ub.level > 0
        `, [userId, businessId]);

        if (userBusinesses.length === 0) {
            return res.status(404).json({ error: 'Business not owned' });
        }

        const userBusiness = userBusinesses[0];
        const now = new Date();
        const lastCollected = new Date(userBusiness.last_collected);
        const timeDiff = Math.floor((now - lastCollected) / 1000);

        if (timeDiff < userBusiness.income_time) {
            const remainingTime = userBusiness.income_time - timeDiff;
            return res.status(400).json({ 
                error: 'Income not ready yet',
                remainingTime 
            });
        }

        const income = userBusiness.base_income * userBusiness.level;

        // Start transaction
        await db.execute('START TRANSACTION');

        try {
            // Add coins to user
            await db.execute(
                'UPDATE users SET coins = coins + ? WHERE id = ?',
                [income, userId]
            );

            // Update last collected time
            await db.execute(
                'UPDATE user_businesses SET last_collected = NOW() WHERE user_id = ? AND business_id = ?',
                [userId, businessId]
            );

            // Record transaction
            await db.execute(
                'INSERT INTO transactions (to_user_id, amount, type, description) VALUES (?, ?, ?, ?)',
                [userId, income, 'business_income', `Income from ${userBusiness.name}`]
            );

            await db.execute('COMMIT');

            res.json({
                success: true,
                income,
                message: `Collected ${income} coins from ${userBusiness.name}`
            });

        } catch (error) {
            await db.execute('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Collect business income error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get business collection status
router.get('/status', async (req, res) => {
    try {
        const { userId } = req.user;

        const [businesses] = await db.execute(`
            SELECT ub.business_id, ub.level, ub.last_collected,
                   b.name, b.base_income, b.income_time, b.icon,
                   ROUND(b.base_income * ub.level, 2) as income,
                   GREATEST(0, ? - UNIX_TIMESTAMP(ub.last_collected)) as time_since_collected,
                   CASE 
                       WHEN UNIX_TIMESTAMP(NOW()) - UNIX_TIMESTAMP(ub.last_collected) >= b.income_time 
                       THEN 1 ELSE 0 
                   END as ready_to_collect
            FROM user_businesses ub
            JOIN businesses b ON ub.business_id = b.id
            WHERE ub.user_id = ? AND ub.level > 0
            ORDER BY ready_to_collect DESC, b.id
        `, [Math.floor(Date.now() / 1000), userId]);

        res.json({ success: true, businesses });

    } catch (error) {
        console.error('Get business status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
