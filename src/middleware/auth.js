const jwt = require('jsonwebtoken');

function auth(req, res, next) {
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = header.slice(7);
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
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
