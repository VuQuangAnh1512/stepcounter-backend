const router = require('express').Router();
const pool   = require('../db');
const { auth } = require('../middleware/auth');

// POST /api/workouts — sync a workout from device
router.post('/', auth, async (req, res) => {
    const { mode, steps, distance, duration, calories, route_points, started_at, ended_at } = req.body;
    if (!mode || !started_at || !ended_at) {
        return res.status(400).json({ error: 'mode, started_at, ended_at required' });
    }
    try {
        const { rows } = await pool.query(
            `INSERT INTO workouts (user_id,mode,steps,distance,duration,calories,route_points,started_at,ended_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [req.user.id, mode, steps||0, distance||0, duration||0, calories||0,
             route_points ? JSON.stringify(route_points) : null, started_at, ended_at]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/workouts — list user's workouts
router.get('/', auth, async (req, res) => {
    const limit  = parseInt(req.query.limit  || '50');
    const offset = parseInt(req.query.offset || '0');
    try {
        const { rows } = await pool.query(
            `SELECT id,mode,steps,distance,duration,calories,started_at,ended_at
             FROM workouts WHERE user_id=$1
             ORDER BY started_at DESC LIMIT $2 OFFSET $3`,
            [req.user.id, limit, offset]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/workouts/:id
router.get('/:id', auth, async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT * FROM workouts WHERE id=$1 AND user_id=$2',
            [req.params.id, req.user.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Not found' });
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
