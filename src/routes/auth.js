const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const pool    = require('../db');

// POST /api/auth/register
router.post('/register', async (req, res) => {
    const { name, email, password, gender, age, weight, height, step_goal } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'name, email and password are required' });
    }
    try {
        const hash = await bcrypt.hash(password, 10);
        const { rows } = await pool.query(
            `INSERT INTO users (name, email, password, gender, age, weight, height, step_goal)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, name, email, is_admin`,
            [name, email, hash, gender || null, age || null, weight || null, height || null, step_goal || 10000]
        );
        const user  = rows[0];
        const token = jwt.sign({ id: user.id, email: user.email, is_admin: user.is_admin },
            process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
        res.status(201).json({ token, user });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    try {
        const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
        if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
        const user = rows[0];
        const ok   = await bcrypt.compare(password, user.password);
        if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
        const token = jwt.sign({ id: user.id, email: user.email, is_admin: user.is_admin },
            process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
        res.json({ token, user: { id: user.id, name: user.name, email: user.email, is_admin: user.is_admin } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/auth/me
const { auth } = require('../middleware/auth');
router.get('/me', auth, async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT id,name,email,gender,age,weight,height,step_goal,is_admin,created_at FROM users WHERE id=$1',
            [req.user.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'User not found' });
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT /api/auth/profile
router.put('/profile', auth, async (req, res) => {
    const { name, gender, age, weight, height, step_goal } = req.body;
    try {
        const { rows } = await pool.query(
            `UPDATE users SET name=COALESCE($1,name), gender=COALESCE($2,gender),
             age=COALESCE($3,age), weight=COALESCE($4,weight), height=COALESCE($5,height),
             step_goal=COALESCE($6,step_goal)
             WHERE id=$7 RETURNING id,name,email,gender,age,weight,height,step_goal`,
            [name, gender, age, weight, height, step_goal, req.user.id]
        );
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
