const router = require('express').Router();
const pool   = require('../db');
const { auth } = require('../middleware/auth');

// GET /api/challenges — danh sách thử thách kèm trạng thái của user hiện tại
router.get('/', auth, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT c.id, c.title, c.description, c.goal_steps, c.type, c.difficulty,
                    c.days_total, c.reward, c.badge_emoji, c.is_active,
                    uc.progress, uc.completed, uc.completed_at,
                    (SELECT COUNT(*) FROM user_challenges WHERE challenge_id=c.id) AS participants
             FROM challenges c
             LEFT JOIN user_challenges uc ON c.id=uc.challenge_id AND uc.user_id=$1
             WHERE c.is_active=TRUE
             ORDER BY c.id`,
            [req.user.id]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/challenges/:id/join — tham gia thử thách
router.post('/:id/join', auth, async (req, res) => {
    const challengeId = parseInt(req.params.id);
    try {
        const { rows: ch } = await pool.query(
            'SELECT id FROM challenges WHERE id=$1 AND is_active=TRUE', [challengeId]
        );
        if (!ch.length) return res.status(404).json({ error: 'Challenge not found' });

        await pool.query(
            `INSERT INTO user_challenges (user_id, challenge_id, progress, completed)
             VALUES ($1, $2, 0, FALSE)
             ON CONFLICT (user_id, challenge_id) DO NOTHING`,
            [req.user.id, challengeId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/challenges/:id/join — rời thử thách
router.delete('/:id/join', auth, async (req, res) => {
    const challengeId = parseInt(req.params.id);
    try {
        await pool.query(
            'DELETE FROM user_challenges WHERE user_id=$1 AND challenge_id=$2',
            [req.user.id, challengeId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/challenges/:id/progress — cập nhật tiến độ
router.post('/:id/progress', auth, async (req, res) => {
    const { progress } = req.body;
    const challengeId  = parseInt(req.params.id);
    try {
        const { rows: ch } = await pool.query(
            'SELECT * FROM challenges WHERE id=$1', [challengeId]
        );
        if (!ch.length) return res.status(404).json({ error: 'Challenge not found' });

        const goal      = ch[0].goal_steps;
        const completed = progress >= goal;
        await pool.query(
            `INSERT INTO user_challenges (user_id, challenge_id, progress, completed, completed_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, challenge_id)
             DO UPDATE SET progress=$3, completed=$4, completed_at=$5`,
            [req.user.id, challengeId, progress, completed, completed ? new Date() : null]
        );
        res.json({ progress, completed });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
