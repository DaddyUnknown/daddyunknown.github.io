const express = require('express');
const db = require('../config/database');
const authModule = require('./auth');
const authenticateToken = authModule.authenticateToken;

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get user's transaction history
router.get('/history', async (req, res) => {
    try {
        const { userId } = req.user;
        const { page = 1, limit = 20, type } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE (t.from_user_id = ? OR t.to_user_id = ?)';
        let queryParams = [userId, userId];

        if (type) {
            whereClause += ' AND t.type = ?';
            queryParams.push(type);
        }

        const [transactions] = await db.execute(`
            SELECT t.*,
                   fu.username as from_username, fu.first_name as from_first_name,
                   tu.username as to_username, tu.first_name as to_first_name,
                   CASE 
                       WHEN t.from_user_id = ? THEN 'outgoing'
                       WHEN t.to_user_id = ? THEN 'incoming'
                       ELSE 'system'
                   END as direction
            FROM transactions t
            LEFT JOIN users fu ON t.from_user_id = fu.id
            LEFT JOIN users tu ON t.to_user_id = tu.id
            ${whereClause}
            ORDER BY t.created_at DESC
            LIMIT ? OFFSET ?
        `, [...queryParams, userId, userId, parseInt(limit), offset]);

        // Get total count for pagination
        const [countResult] = await db.execute(`
            SELECT COUNT(*) as total
            FROM transactions t
            ${whereClause}
        `, queryParams);

        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limit);

        res.json({
            success: true,
            transactions: transactions.map(t => ({
                ...t,
                amount: parseFloat(t.amount),
                from_display_name: t.from_username || t.from_first_name || 'System',
                to_display_name: t.to_username || t.to_first_name || 'System'
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });

    } catch (error) {
        console.error('Get transaction history error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get transaction statistics
router.get('/stats', async (req, res) => {
    try {
        const { userId } = req.user;

        // Get various transaction statistics
        const [stats] = await db.execute(`
            SELECT 
                SUM(CASE WHEN type = 'click_income' THEN amount ELSE 0 END) as total_click_income,
                SUM(CASE WHEN type = 'business_income' THEN amount ELSE 0 END) as total_business_income,
                SUM(CASE WHEN type = 'purchase' THEN amount ELSE 0 END) as total_spent,
                SUM(CASE WHEN type = 'transfer' AND from_user_id = ? THEN amount ELSE 0 END) as total_sent,
                SUM(CASE WHEN type = 'transfer' AND to_user_id = ? THEN amount ELSE 0 END) as total_received,
                COUNT(CASE WHEN type = 'transfer' AND from_user_id = ? THEN 1 END) as transfers_sent,
                COUNT(CASE WHEN type = 'transfer' AND to_user_id = ? THEN 1 END) as transfers_received
            FROM transactions
            WHERE from_user_id = ? OR to_user_id = ?
        `, [userId, userId, userId, userId, userId, userId]);

        const [recentActivity] = await db.execute(`
            SELECT COUNT(*) as count
            FROM transactions
            WHERE (from_user_id = ? OR to_user_id = ?) 
            AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        `, [userId, userId]);

        res.json({
            success: true,
            stats: {
                ...stats[0],
                total_click_income: parseFloat(stats[0].total_click_income) || 0,
                total_business_income: parseFloat(stats[0].total_business_income) || 0,
                total_spent: parseFloat(stats[0].total_spent) || 0,
                total_sent: parseFloat(stats[0].total_sent) || 0,
                total_received: parseFloat(stats[0].total_received) || 0,
                recent_activity_24h: recentActivity[0].count
            }
        });

    } catch (error) {
        console.error('Get transaction stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get transaction types for filtering
router.get('/types', async (req, res) => {
    try {
        const types = [
            { value: 'click_income', label: 'Доход от кликов', icon: '👆' },
            { value: 'business_income', label: 'Доход от бизнеса', icon: '🏢' },
            { value: 'purchase', label: 'Покупки', icon: '🛒' },
            { value: 'transfer', label: 'Переводы', icon: '💸' },
            { value: 'reward', label: 'Награды', icon: '🎁' }
        ];

        res.json({ success: true, types });

    } catch (error) {
        console.error('Get transaction types error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
