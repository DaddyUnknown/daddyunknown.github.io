const express = require('express');
const db = require('../config/database');
const authModule = require('./auth');
const authenticateToken = authModule.authenticateToken;

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get leaderboard by coins
router.get('/coins', async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const { userId } = req.user;

        const [leaderboard] = await db.execute(`
            SELECT id, username, first_name, coins, level, prestige_level,
                   ROW_NUMBER() OVER (ORDER BY coins DESC) as rank
            FROM users
            WHERE coins > 0
            ORDER BY coins DESC
            LIMIT ?
        `, [parseInt(limit)]);

        // Get current user's rank
        const [userRank] = await db.execute(`
            SELECT rank FROM (
                SELECT id, ROW_NUMBER() OVER (ORDER BY coins DESC) as rank
                FROM users
                WHERE coins > 0
            ) ranked
            WHERE id = ?
        `, [userId]);

        res.json({
            success: true,
            leaderboard: leaderboard.map(user => ({
                ...user,
                coins: parseFloat(user.coins),
                display_name: user.username || user.first_name || 'Anonymous'
            })),
            userRank: userRank.length > 0 ? userRank[0].rank : null
        });

    } catch (error) {
        console.error('Get coins leaderboard error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get leaderboard by level
router.get('/level', async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const { userId } = req.user;

        const [leaderboard] = await db.execute(`
            SELECT id, username, first_name, level, experience, prestige_level, coins,
                   ROW_NUMBER() OVER (ORDER BY level DESC, experience DESC) as rank
            FROM users
            WHERE level > 1
            ORDER BY level DESC, experience DESC
            LIMIT ?
        `, [parseInt(limit)]);

        // Get current user's rank
        const [userRank] = await db.execute(`
            SELECT rank FROM (
                SELECT id, ROW_NUMBER() OVER (ORDER BY level DESC, experience DESC) as rank
                FROM users
                WHERE level > 1
            ) ranked
            WHERE id = ?
        `, [userId]);

        res.json({
            success: true,
            leaderboard: leaderboard.map(user => ({
                ...user,
                coins: parseFloat(user.coins),
                display_name: user.username || user.first_name || 'Anonymous'
            })),
            userRank: userRank.length > 0 ? userRank[0].rank : null
        });

    } catch (error) {
        console.error('Get level leaderboard error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get leaderboard by prestige
router.get('/prestige', async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const { userId } = req.user;

        const [leaderboard] = await db.execute(`
            SELECT id, username, first_name, prestige_level, prestige_points, level, coins,
                   ROW_NUMBER() OVER (ORDER BY prestige_level DESC, prestige_points DESC) as rank
            FROM users
            WHERE prestige_level > 0
            ORDER BY prestige_level DESC, prestige_points DESC
            LIMIT ?
        `, [parseInt(limit)]);

        // Get current user's rank
        const [userRank] = await db.execute(`
            SELECT rank FROM (
                SELECT id, ROW_NUMBER() OVER (ORDER BY prestige_level DESC, prestige_points DESC) as rank
                FROM users
                WHERE prestige_level > 0
            ) ranked
            WHERE id = ?
        `, [userId]);

        res.json({
            success: true,
            leaderboard: leaderboard.map(user => ({
                ...user,
                coins: parseFloat(user.coins),
                display_name: user.username || user.first_name || 'Anonymous'
            })),
            userRank: userRank.length > 0 ? userRank[0].rank : null
        });

    } catch (error) {
        console.error('Get prestige leaderboard error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get leaderboard by total clicks
router.get('/clicks', async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const { userId } = req.user;

        const [leaderboard] = await db.execute(`
            SELECT id, username, first_name, total_clicks, level, coins,
                   ROW_NUMBER() OVER (ORDER BY total_clicks DESC) as rank
            FROM users
            WHERE total_clicks > 0
            ORDER BY total_clicks DESC
            LIMIT ?
        `, [parseInt(limit)]);

        // Get current user's rank
        const [userRank] = await db.execute(`
            SELECT rank FROM (
                SELECT id, ROW_NUMBER() OVER (ORDER BY total_clicks DESC) as rank
                FROM users
                WHERE total_clicks > 0
            ) ranked
            WHERE id = ?
        `, [userId]);

        res.json({
            success: true,
            leaderboard: leaderboard.map(user => ({
                ...user,
                coins: parseFloat(user.coins),
                display_name: user.username || user.first_name || 'Anonymous'
            })),
            userRank: userRank.length > 0 ? userRank[0].rank : null
        });

    } catch (error) {
        console.error('Get clicks leaderboard error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get combined leaderboard stats
router.get('/stats', async (req, res) => {
    try {
        const [stats] = await db.execute(`
            SELECT 
                COUNT(*) as total_players,
                MAX(coins) as highest_coins,
                MAX(level) as highest_level,
                MAX(prestige_level) as highest_prestige,
                MAX(total_clicks) as most_clicks,
                AVG(coins) as average_coins,
                AVG(level) as average_level
            FROM users
            WHERE last_active >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        `);

        const [activeToday] = await db.execute(`
            SELECT COUNT(*) as count
            FROM users
            WHERE last_active >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        `);

        const [activeWeek] = await db.execute(`
            SELECT COUNT(*) as count
            FROM users
            WHERE last_active >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        `);

        res.json({
            success: true,
            stats: {
                ...stats[0],
                highest_coins: parseFloat(stats[0].highest_coins) || 0,
                average_coins: parseFloat(stats[0].average_coins) || 0,
                average_level: parseFloat(stats[0].average_level) || 0,
                active_today: activeToday[0].count,
                active_week: activeWeek[0].count
            }
        });

    } catch (error) {
        console.error('Get leaderboard stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
