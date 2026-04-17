-- ============================================================
--  StepCounter - Full Database Schema (all-in-one)
-- ============================================================

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    email       VARCHAR(255) UNIQUE NOT NULL,
    password    VARCHAR(255) NOT NULL,
    gender      VARCHAR(10),
    age         INTEGER,
    weight      REAL,
    height      REAL,
    step_goal   INTEGER DEFAULT 10000,
    is_admin    BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Workouts ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workouts (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
    mode         VARCHAR(50) NOT NULL,
    steps        INTEGER DEFAULT 0,
    distance     REAL DEFAULT 0,
    duration     INTEGER DEFAULT 0,
    calories     REAL DEFAULT 0,
    route_points JSONB,
    started_at   TIMESTAMPTZ NOT NULL,
    ended_at     TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Challenges ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS challenges (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    goal_steps  INTEGER NOT NULL,
    type        VARCHAR(20)  NOT NULL DEFAULT 'STEPS',
    difficulty  VARCHAR(10)  NOT NULL DEFAULT 'MEDIUM',
    days_total  INTEGER      NOT NULL DEFAULT 30,
    reward      VARCHAR(200),
    badge_emoji VARCHAR(10)  DEFAULT '🏆',
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_challenges (
    user_id      INTEGER REFERENCES users(id)      ON DELETE CASCADE,
    challenge_id INTEGER REFERENCES challenges(id) ON DELETE CASCADE,
    progress     INTEGER DEFAULT 0,
    completed    BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, challenge_id)
);

-- ── Groups ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(200) NOT NULL,
    description         TEXT,
    invite_code         VARCHAR(20)  UNIQUE NOT NULL,
    owner_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    running_level       VARCHAR(20)  DEFAULT 'all',
    target_km_per_week  REAL         DEFAULT 0,
    created_at          TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
    group_id   INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    user_id    INTEGER REFERENCES users(id)  ON DELETE CASCADE,
    joined_at  TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

-- ── Run Schedules ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS run_schedules (
    id           SERIAL PRIMARY KEY,
    group_id     INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    title        VARCHAR(200) NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    location     TEXT,
    distance_km  REAL DEFAULT 0,
    notes        TEXT,
    created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedule_participants (
    schedule_id INTEGER REFERENCES run_schedules(id) ON DELETE CASCADE,
    user_id     INTEGER REFERENCES users(id)         ON DELETE CASCADE,
    joined_at   TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (schedule_id, user_id)
);

-- ============================================================
--  Seed data
-- ============================================================

-- Default admin user (password: admin123)
INSERT INTO users (name, email, password, is_admin)
VALUES ('Admin', 'admin@stepcounter.com',
        '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17', TRUE)
ON CONFLICT (email) DO NOTHING;

-- Sample challenges
INSERT INTO challenges (title, description, goal_steps, type, difficulty, days_total, reward, badge_emoji) VALUES
('First Steps',    'Complete your first 1,000 steps', 1000,   'STEPS', 'EASY',   7,  'Beginner badge', '👟'),
('Daily Walker',   'Walk 10,000 steps in a day',       10000,  'STEPS', 'MEDIUM', 1,  'Walker badge',   '🚶'),
('Marathon Ready', 'Accumulate 42,195 steps',          42195,  'STEPS', 'HARD',   30, 'Runner badge',   '🏃'),
('Step Master',    'Reach 100,000 total steps',        100000, 'STEPS', 'HARD',   30, 'Master badge',   '🏅')
ON CONFLICT DO NOTHING;
