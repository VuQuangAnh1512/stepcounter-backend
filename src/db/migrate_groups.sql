-- Migration: tạo bảng groups và group_members
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
