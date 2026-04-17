const router = require('express').Router();
const pool   = require('../db');
const { auth } = require('../middleware/auth');

// GET /api/users/search?q=keyword
router.get('/search', auth, async (req, res) => {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json([]);

    try {
        const { rows } = await pool.query(
            `SELECT id, name, email
             FROM users
             WHERE (name ILIKE $1 OR email ILIKE $1)
               AND id != $2
             LIMIT 20`,
            [`%${q}%`, req.user.id]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
