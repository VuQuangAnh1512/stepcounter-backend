-- Migration: thêm cột is_suspended vào bảng users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE;
