const jwt  = require('jsonwebtoken');
const pool = require('../db');

async function auth(req, res, next) {
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = header.slice(7);
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        const { rows } = await pool.query('SELECT is_suspended, suspend_reason FROM users WHERE id=$1', [req.user.id]);
        if (!rows.length || rows[0].is_suspended) {
            const msg = rows[0]?.suspend_reason
                ? `Tài khoản của bạn đã bị khoá. Lý do: ${rows[0].suspend_reason}`
                : 'Tài khoản của bạn đã bị khoá bởi quản trị viên.';
            return res.status(401).json({ error: msg, suspended: true });
        }
        next();
    } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

function adminAuth(req, res, next) {
    auth(req, res, () => {
        if (!req.user.is_admin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    });
}

module.exports = { auth, adminAuth };
