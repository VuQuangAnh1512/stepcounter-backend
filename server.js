require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const pool    = require('./src/db');

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth',       require('./src/routes/auth'));
app.use('/api/workouts',   require('./src/routes/workouts'));
app.use('/api/challenges', require('./src/routes/challenges'));
app.use('/api/groups',     require('./src/routes/groups'));
app.use('/api/admin',      require('./src/routes/admin'));
app.use('/api/users',      require('./src/routes/users'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
});

// Tự động tạo bảng, seed data và chạy migrations khi server khởi động
async function initDatabase() {
    try {
        const schema = fs.readFileSync(
            path.join(__dirname, 'src/db/schema.sql'), 'utf8'
        );
        await pool.query(schema);

        // Chạy các migration để thêm cột còn thiếu (idempotent)
        const migrations = [
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS suspend_reason TEXT`,
        ];
        for (const sql of migrations) {
            await pool.query(sql);
        }

        console.log('Database initialized successfully');
    } catch (err) {
        console.error('Database init error:', err.message);
    }
}

const PORT = process.env.PORT || 3000;
initDatabase().then(() => {
    app.listen(PORT, () => console.log(`StepCounter API running on port ${PORT}`));
});
