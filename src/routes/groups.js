const router = require('express').Router();
const pool   = require('../db');
const { auth } = require('../middleware/auth');

function generateInviteCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

// GET /api/groups
router.get('/', auth, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT g.id, g.name, g.description, g.invite_code, g.owner_id,
                    g.running_level, g.target_km_per_week,
                    COUNT(gm.user_id)::int AS member_count
             FROM groups g
             LEFT JOIN group_members gm ON gm.group_id = g.id
             GROUP BY g.id
             ORDER BY g.created_at DESC`,
            []
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/groups
router.post('/', auth, async (req, res) => {
    const { name, description, running_level, target_km_per_week } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });

    const level    = running_level || 'all';
    const targetKm = parseFloat(target_km_per_week) || 0;

    try {
        let invite_code, exists = true;
        while (exists) {
            invite_code = generateInviteCode();
            const { rows } = await pool.query(
                'SELECT 1 FROM groups WHERE invite_code=$1', [invite_code]
            );
            exists = rows.length > 0;
        }

        const { rows } = await pool.query(
            `INSERT INTO groups (name, description, invite_code, owner_id, running_level, target_km_per_week)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [name.trim(), description || null, invite_code, req.user.id, level, targetKm]
        );
        const group = rows[0];
        await pool.query(
            'INSERT INTO group_members (group_id, user_id) VALUES ($1,$2)',
            [group.id, req.user.id]
        );
        res.status(201).json({ ...group, member_count: 1 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/groups/join-by-code
router.post('/join-by-code', auth, async (req, res) => {
    const { invite_code } = req.body;
    if (!invite_code) return res.status(400).json({ error: 'invite_code required' });

    try {
        const { rows } = await pool.query(
            'SELECT * FROM groups WHERE invite_code=$1',
            [invite_code.trim().toUpperCase()]
        );
        if (!rows.length) return res.status(404).json({ message: 'Mã mời không hợp lệ' });
        const group = rows[0];

        const { rows: existing } = await pool.query(
            'SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2',
            [group.id, req.user.id]
        );
        if (existing.length) return res.status(409).json({ message: 'Bạn đã là thành viên nhóm này' });

        await pool.query(
            'INSERT INTO group_members (group_id, user_id) VALUES ($1,$2)',
            [group.id, req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/groups/:id
router.get('/:id', auth, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT g.id, g.name, g.description, g.invite_code, g.owner_id,
                    g.running_level, g.target_km_per_week,
                    COUNT(gm.user_id)::int AS member_count
             FROM groups g
             LEFT JOIN group_members gm ON gm.group_id = g.id
             WHERE g.id=$1
             GROUP BY g.id`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Group not found' });
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/groups/:id/join
router.post('/:id/join', auth, async (req, res) => {
    const { invite_code } = req.body;
    let groupId = parseInt(req.params.id);

    try {
        let group;
        if (groupId === 0) {
            if (!invite_code) return res.status(400).json({ error: 'invite_code required' });
            const { rows } = await pool.query(
                'SELECT * FROM groups WHERE invite_code=$1',
                [invite_code.toUpperCase()]
            );
            if (!rows.length) return res.status(404).json({ error: 'Invalid invite code' });
            group   = rows[0];
            groupId = group.id;
        } else {
            const { rows } = await pool.query(
                'SELECT * FROM groups WHERE id=$1', [groupId]
            );
            if (!rows.length) return res.status(404).json({ error: 'Group not found' });
            group = rows[0];
        }

        const { rows: existing } = await pool.query(
            'SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2',
            [groupId, req.user.id]
        );
        if (existing.length) return res.status(409).json({ error: 'Already a member' });

        await pool.query(
            'INSERT INTO group_members (group_id, user_id) VALUES ($1,$2)',
            [groupId, req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/groups/:id/leave
router.post('/:id/leave', auth, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM group_members WHERE group_id=$1 AND user_id=$2',
            [req.params.id, req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/groups/:id/members
router.get('/:id/members', auth, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT u.id, u.name, u.email, u.is_admin
             FROM group_members gm
             JOIN users u ON u.id = gm.user_id
             WHERE gm.group_id=$1
             ORDER BY gm.joined_at`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/groups/:id/leaderboard
router.get('/:id/leaderboard', auth, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT u.id AS user_id, u.name,
                    COALESCE(SUM(w.steps), 0)::bigint       AS steps,
                    COALESCE(SUM(w.distance)/1000.0, 0)     AS distance_km,
                    COUNT(w.id)::int                        AS workouts
             FROM group_members gm
             JOIN users u ON u.id = gm.user_id
             LEFT JOIN workouts w ON w.user_id = u.id
             WHERE gm.group_id=$1
             GROUP BY u.id, u.name
             ORDER BY steps DESC`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── Run Schedules ────────────────────────────────────────────

// GET /api/groups/:id/schedules
router.get('/:id/schedules', auth, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT s.*,
                    COUNT(sp.user_id)::int AS participant_count,
                    EXISTS(
                        SELECT 1 FROM schedule_participants
                        WHERE schedule_id = s.id AND user_id = $2
                    ) AS is_joined
             FROM run_schedules s
             LEFT JOIN schedule_participants sp ON sp.schedule_id = s.id
             WHERE s.group_id = $1
             GROUP BY s.id
             ORDER BY s.scheduled_at ASC`,
            [req.params.id, req.user.id]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/groups/:id/schedules
router.post('/:id/schedules', auth, async (req, res) => {
    const { title, scheduled_at, location, distance_km, notes } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'title required' });
    if (!scheduled_at)          return res.status(400).json({ error: 'scheduled_at required' });

    // Verify user is a member of this group
    const { rows: memberCheck } = await pool.query(
        'SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2',
        [req.params.id, req.user.id]
    );
    if (!memberCheck.length) return res.status(403).json({ error: 'Not a member of this group' });

    try {
        const { rows } = await pool.query(
            `INSERT INTO run_schedules (group_id, title, scheduled_at, location, distance_km, notes, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
            [req.params.id, title.trim(), scheduled_at,
             location || null, parseFloat(distance_km) || 0, notes || null, req.user.id]
        );
        const schedule = rows[0];
        // Creator automatically joins
        await pool.query(
            'INSERT INTO schedule_participants (schedule_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [schedule.id, req.user.id]
        );
        res.status(201).json({ ...schedule, participant_count: 1, is_joined: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/groups/:groupId/schedules/:scheduleId/join
router.post('/:groupId/schedules/:scheduleId/join', auth, async (req, res) => {
    try {
        await pool.query(
            'INSERT INTO schedule_participants (schedule_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [req.params.scheduleId, req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/groups/:groupId/schedules/:scheduleId/join
router.delete('/:groupId/schedules/:scheduleId/join', auth, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM schedule_participants WHERE schedule_id=$1 AND user_id=$2',
            [req.params.scheduleId, req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── Invite member ─────────────────────────────────────────────

// POST /api/groups/:id/invite
router.post('/:id/invite', auth, async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    // Check requester is a member
    const { rows: memberCheck } = await pool.query(
        'SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2',
        [req.params.id, req.user.id]
    );
    if (!memberCheck.length) return res.status(403).json({ error: 'Not a member of this group' });

    try {
        const { rows: existing } = await pool.query(
            'SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2',
            [req.params.id, user_id]
        );
        if (existing.length) return res.status(409).json({ message: 'Người dùng đã là thành viên' });

        await pool.query(
            'INSERT INTO group_members (group_id, user_id) VALUES ($1,$2)',
            [req.params.id, user_id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
