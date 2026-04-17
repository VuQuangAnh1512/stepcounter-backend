-- Migration: thêm type, difficulty, days_total vào bảng challenges
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS type       VARCHAR(20)  NOT NULL DEFAULT 'STEPS';
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS difficulty  VARCHAR(10)  NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS days_total  INTEGER      NOT NULL DEFAULT 30;

-- Cập nhật dữ liệu mẫu đã có
UPDATE challenges SET type='STEPS', difficulty='EASY',   days_total=7  WHERE title='First Steps';
UPDATE challenges SET type='STEPS', difficulty='MEDIUM',  days_total=1  WHERE title='Daily Walker';
UPDATE challenges SET type='STEPS', difficulty='HARD',   days_total=30 WHERE title='Marathon Ready';
UPDATE challenges SET type='STEPS', difficulty='HARD',   days_total=30 WHERE title='Step Master';
