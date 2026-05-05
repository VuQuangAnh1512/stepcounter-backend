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

        // Chạy các migration để thêm cột còn thiếu (idempotent - an toàn khi chạy nhiều lần)
        const migrations = [
            // users
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS suspend_reason TEXT`,
            // challenges
            `ALTER TABLE challenges ADD COLUMN IF NOT EXISTS type       VARCHAR(20) NOT NULL DEFAULT 'STEPS'`,
            `ALTER TABLE challenges ADD COLUMN IF NOT EXISTS difficulty  VARCHAR(10) NOT NULL DEFAULT 'MEDIUM'`,
            `ALTER TABLE challenges ADD COLUMN IF NOT EXISTS days_total  INTEGER     NOT NULL DEFAULT 30`,
            // cập nhật dữ liệu mẫu challenges nếu thiếu
            `UPDATE challenges SET type='STEPS', difficulty='EASY',   days_total=7  WHERE title='First Steps'   AND difficulty='MEDIUM'`,
            `UPDATE challenges SET type='STEPS', difficulty='MEDIUM', days_total=1  WHERE title='Daily Walker'  AND days_total=30`,
            `UPDATE challenges SET type='STEPS', difficulty='HARD',   days_total=30 WHERE title='Marathon Ready' AND difficulty='MEDIUM'`,
            `UPDATE challenges SET type='STEPS', difficulty='HARD',   days_total=30 WHERE title='Step Master'   AND difficulty='MEDIUM'`,
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
