-- Add use_c_algorithm column to users table
-- Run this with: sqlite3 ./.data/db.sqlite < scripts/add_c_algorithm_column.sql

ALTER TABLE users ADD COLUMN use_c_algorithm BOOLEAN DEFAULT FALSE;
