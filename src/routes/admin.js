const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool   = require('../db');
const { adminAuth } = require('../middleware/auth');

// GET /api/admin/stats
router.get('/stats', adminAuth, async (req, res) => {
    try {
        const [users, workouts, challenges] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM users WHERE is_admin=FALSE'),
            pool.query('SELECT COUNT(*), COALESCE(SUM(steps),0) as total_steps, COALESCE(SUM(distance),0) as total_distance FROM workouts'),
            pool.query('SELECT COUNT(*) FROM challenges WHERE is_active=TRUE'),
        ]);
        res.json({
            total_users:      parseInt(users.rows[0].count),
            total_workouts:   parseInt(workouts.rows[0].count),
            total_steps:      parseInt(workouts.rows[0].total_steps),
            total_distance:   parseFloat(workouts.rows[0].total_distance),
            active_challenges: parseInt(challenges.rows[0].count),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/stats/daily?days=7|14|30
router.get('/stats/daily', adminAuth, async (req, res) => {
    const days = Math.min(Math.max(parseInt(req.query.days || '7'), 1), 90);
    try {
        // Tạo dãy ngày liên tục rồi LEFT JOIN để những ngày không có data vẫn hiện 0
        const { rows } = await pool.query(
            `SELECT
                date_series.day::date                                  AS date,
                COALESCE(SUM(w.steps), 0)::bigint                     AS total_steps,
                COUNT(w.id)::int                                       AS workout_count,
                COALESCE(MAX(nu.new_users), 0)::int                   AS new_users
             FROM generate_series(
                 (NOW() - INTERVAL '1 day' * ($1 - 1))::date,
                 NOW()::date,
                 '1 day'::interval
             ) AS date_series(day)
             LEFT JOIN workouts w
                 ON w.started_at::date = date_series.day::date
             LEFT JOIN (
                 SELECT created_at::date AS day, COUNT(*)::int AS new_users
                 FROM users WHERE is_admin = FALSE
                 GROUP BY created_at::date
             ) nu ON nu.day = date_series.day::date
             GROUP BY date_series.day
             ORDER BY date_series.day ASC`,
            [days]
        );
        res.json({ daily: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/stats/distributions
router.get('/stats/distributions', adminAuth, async (req, res) => {
    try {
        const [modesRes, gendersRes] = await Promise.all([
            // Phân bố chế độ vận động từ bảng workouts
            pool.query(
                `SELECT mode, COUNT(*)::int AS count
                 FROM workouts
                 GROUP BY mode
                 ORDER BY count DESC`
            ),
            // Phân bố giới tính từ bảng users (không đếm admin)
            pool.query(
                `SELECT COALESCE(gender, 'Unknown') AS gender, COUNT(*)::int AS count
                 FROM users
                 WHERE is_admin = FALSE
                 GROUP BY gender
                 ORDER BY count DESC`
            ),
        ]);
        res.json({
            modes:   modesRes.rows,
            genders: gendersRes.rows,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/users
router.get('/users', adminAuth, async (req, res) => {
    const limit   = Math.min(parseInt(req.query.limit  || '50'), 9999);
    const offset  = parseInt(req.query.offset || '0');
    const search  = req.query.search   || '';
    const sortBy  = req.query.sort_by  || 'created_at';
    const sortDir = req.query.sort_dir === 'asc' ? 'ASC' : 'DESC';

    const allowedSort = ['created_at', 'name', 'total_steps', 'workout_count'];
    const orderCol = allowedSort.includes(sortBy) ? sortBy : 'created_at';

    // total_steps and workout_count are subquery aliases — must use ORDER BY position or wrap
    const orderClause = orderCol === 'total_steps'
        ? `(SELECT COALESCE(SUM(steps),0) FROM workouts WHERE user_id=users.id) ${sortDir}`
        : orderCol === 'workout_count'
        ? `(SELECT COUNT(*) FROM workouts WHERE user_id=users.id) ${sortDir}`
        : `${orderCol} ${sortDir}`;

    try {
        const { rows } = await pool.query(
            `SELECT id,name,email,gender,age,weight,height,step_goal,is_admin,is_suspended,created_at,
                    (SELECT COUNT(*) FROM workouts WHERE user_id=users.id) as workout_count,
                    (SELECT COALESCE(SUM(steps),0) FROM workouts WHERE user_id=users.id) as total_steps
             FROM users
             WHERE is_admin=FALSE AND (name ILIKE $1 OR email ILIKE $1)
             ORDER BY ${orderClause} LIMIT $2 OFFSET $3`,
            [`%${search}%`, limit, offset]
        );
        const { rows: countRows } = await pool.query(
            `SELECT COUNT(*) FROM users WHERE is_admin=FALSE AND (name ILIKE $1 OR email ILIKE $1)`,
            [`%${search}%`]
        );
        res.json({ users: rows, total: parseInt(countRows[0].count) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/admin/users/:id/suspend
router.post('/users/:id/suspend', adminAuth, async (req, res) => {
    const { reason } = req.body;
    try {
        const { rowCount } = await pool.query(
            'UPDATE users SET is_suspended=TRUE, suspended_at=NOW(), suspend_reason=$2 WHERE id=$1 AND is_admin=FALSE',
            [req.params.id, reason?.trim() || null]
        );
        if (!rowCount) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/admin/users/:id/activate
router.post('/users/:id/activate', adminAuth, async (req, res) => {
    try {
        const { rowCount } = await pool.query(
            'UPDATE users SET is_suspended=FALSE, suspended_at=NULL, suspend_reason=NULL WHERE id=$1 AND is_admin=FALSE',
            [req.params.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// PATCH /api/admin/users/:id/role
router.patch('/users/:id/role', adminAuth, async (req, res) => {
    const { is_admin } = req.body;
    try {
        await pool.query('UPDATE users SET is_admin=$1 WHERE id=$2', [is_admin, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/users/:id
router.get('/users/:id', adminAuth, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id,name,email,gender,age,weight,height,step_goal,is_admin,is_suspended,suspended_at,suspend_reason,created_at FROM users WHERE id=$1`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Not found' });
        const { rows: workouts } = await pool.query(
            'SELECT * FROM workouts WHERE user_id=$1 ORDER BY started_at DESC',
            [req.params.id]
        );
        res.json({ ...rows[0], workouts });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT /api/admin/users/:id
router.put('/users/:id', adminAuth, async (req, res) => {
    const { name, email, gender, age, weight, height, step_goal } = req.body;
    try {
        const { rows } = await pool.query(
            `UPDATE users SET name=COALESCE($1,name), email=COALESCE($2,email),
             gender=COALESCE($3,gender), age=COALESCE($4,age), weight=COALESCE($5,weight),
             height=COALESCE($6,height), step_goal=COALESCE($7,step_goal)
             WHERE id=$8 RETURNING id,name,email,gender,age,weight,height,step_goal`,
            [name, email, gender, age, weight, height, step_goal, req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Not found' });
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', adminAuth, async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id=$1 AND is_admin=FALSE', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT /api/admin/users/:id/password
router.put('/users/:id/password', adminAuth, async (req, res) => {
    const { password } = req.body;
    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
    }
    try {
        const hash = await bcrypt.hash(password, 10);
        const { rowCount } = await pool.query(
            'UPDATE users SET password=$1 WHERE id=$2 AND is_admin=FALSE',
            [hash, req.params.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/admin/workouts/:id
router.delete('/workouts/:id', adminAuth, async (req, res) => {
    try {
        const { rowCount } = await pool.query('DELETE FROM workouts WHERE id=$1', [req.params.id]);
        if (!rowCount) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/challenges
router.get('/challenges', adminAuth, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT c.*,
                    (SELECT COUNT(*) FROM user_challenges WHERE challenge_id=c.id AND completed=TRUE) AS completions,
                    (SELECT COUNT(*) FROM user_challenges WHERE challenge_id=c.id) AS participants
             FROM challenges c ORDER BY c.id`
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/challenges/:id/participants
router.get('/challenges/:id/participants', adminAuth, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT u.id, u.name, u.email, uc.progress, uc.completed, uc.completed_at
             FROM user_challenges uc
             JOIN users u ON u.id = uc.user_id
             WHERE uc.challenge_id = $1
             ORDER BY uc.completed DESC, uc.progress DESC`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/admin/challenges
router.post('/challenges', adminAuth, async (req, res) => {
    const { title, description, goal_steps, type, difficulty, days_total, reward, badge_emoji } = req.body;
    if (!title || !goal_steps) return res.status(400).json({ error: 'title and goal_steps required' });
    try {
        const { rows } = await pool.query(
            `INSERT INTO challenges (title, description, goal_steps, type, difficulty, days_total, reward, badge_emoji)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [
                title,
                description  || null,
                goal_steps,
                type         || 'STEPS',
                difficulty   || 'MEDIUM',
                days_total   || 30,
                reward       || null,
                badge_emoji  || '🏆'
            ]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT /api/admin/challenges/:id
router.put('/challenges/:id', adminAuth, async (req, res) => {
    const { title, description, goal_steps, type, difficulty, days_total, reward, badge_emoji, is_active } = req.body;
    try {
        const { rows } = await pool.query(
            `UPDATE challenges
             SET title      = COALESCE($1, title),
                 description= COALESCE($2, description),
                 goal_steps = COALESCE($3, goal_steps),
                 type       = COALESCE($4, type),
                 difficulty = COALESCE($5, difficulty),
                 days_total = COALESCE($6, days_total),
                 reward     = COALESCE($7, reward),
                 badge_emoji= COALESCE($8, badge_emoji),
                 is_active  = COALESCE($9, is_active)
             WHERE id=$10 RETURNING *`,
            [title, description, goal_steps, type, difficulty, days_total, reward, badge_emoji, is_active, req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Not found' });
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/admin/challenges/:id
router.delete('/challenges/:id', adminAuth, async (req, res) => {
    try {
        await pool.query('DELETE FROM challenges WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── Admin Groups ─────────────────────────────────────────────

function generateInviteCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

// GET /api/admin/groups
router.get('/groups', adminAuth, async (req, res) => {
    const search = req.query.search || '';
    try {
        const { rows } = await pool.query(
            `SELECT g.id, g.name, g.description, g.invite_code,
                    g.running_level, g.target_km_per_week, g.created_at,
                    u.id AS owner_id, u.name AS owner_name, u.email AS owner_email,
                    COUNT(DISTINCT gm.user_id)::int AS member_count,
                    COALESCE(SUM(w.steps), 0)::bigint AS total_steps,
                    COUNT(DISTINCT w.id)::int AS total_workouts
             FROM groups g
             LEFT JOIN users u ON u.id = g.owner_id
             LEFT JOIN group_members gm ON gm.group_id = g.id
             LEFT JOIN workouts w ON w.user_id = gm.user_id
             WHERE ($1 = '' OR g.name ILIKE $2 OR g.description ILIKE $2)
             GROUP BY g.id, u.id, u.name, u.email
             ORDER BY g.created_at DESC`,
            [search, `%${search}%`]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/admin/groups
router.post('/groups', adminAuth, async (req, res) => {
    const { name, description, running_level, target_km_per_week } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });

    try {
        let invite_code, exists = true;
        while (exists) {
            invite_code = generateInviteCode();
            const { rows } = await pool.query('SELECT 1 FROM groups WHERE invite_code=$1', [invite_code]);
            exists = rows.length > 0;
        }
        const { rows } = await pool.query(
            `INSERT INTO groups (name, description, invite_code, owner_id, running_level, target_km_per_week)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [name.trim(), description || null, invite_code, req.user.id,
             running_level || 'all', parseFloat(target_km_per_week) || 0]
        );
        const group = rows[0];
        await pool.query('INSERT INTO group_members (group_id, user_id) VALUES ($1,$2)', [group.id, req.user.id]);
        res.status(201).json({ ...group, member_count: 1 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT /api/admin/groups/:id
router.put('/groups/:id', adminAuth, async (req, res) => {
    const { name, description, running_level, target_km_per_week } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
    try {
        const { rows } = await pool.query(
            `UPDATE groups
             SET name               = $1,
                 description        = $2,
                 running_level      = COALESCE($3, running_level),
                 target_km_per_week = COALESCE($4, target_km_per_week)
             WHERE id = $5 RETURNING *`,
            [name.trim(), description || null, running_level, parseFloat(target_km_per_week) || null, req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Not found' });
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/admin/groups/:id
router.delete('/groups/:id', adminAuth, async (req, res) => {
    try {
        const { rowCount } = await pool.query('DELETE FROM groups WHERE id=$1', [req.params.id]);
        if (!rowCount) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/groups/:id/members
router.get('/groups/:id/members', adminAuth, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT u.id, u.name, u.email, gm.joined_at,
                    COALESCE(SUM(w.steps), 0)::bigint        AS total_steps,
                    COALESCE(SUM(w.distance)/1000.0, 0)      AS total_distance,
                    COUNT(w.id)::int                         AS workout_count
             FROM group_members gm
             JOIN users u ON u.id = gm.user_id
             LEFT JOIN workouts w ON w.user_id = u.id
             WHERE gm.group_id = $1
             GROUP BY u.id, u.name, u.email, gm.joined_at
             ORDER BY total_steps DESC`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/admin/groups/:id/members
router.post('/groups/:id/members', adminAuth, async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    try {
        const { rows: grp } = await pool.query('SELECT 1 FROM groups WHERE id=$1', [req.params.id]);
        if (!grp.length) return res.status(404).json({ error: 'Group not found' });
        const { rows: existing } = await pool.query(
            'SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2',
            [req.params.id, user_id]
        );
        if (existing.length) return res.status(409).json({ error: 'Người dùng đã là thành viên' });
        await pool.query('INSERT INTO group_members (group_id, user_id) VALUES ($1,$2)', [req.params.id, user_id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/admin/groups/:id/members/:userId
router.delete('/groups/:id/members/:userId', adminAuth, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM group_members WHERE group_id=$1 AND user_id=$2',
            [req.params.id, req.params.userId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
