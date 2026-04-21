-- ============================================
-- Supabase PostgreSQL Schema Migration
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Files table
CREATE TABLE IF NOT EXISTS files (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(username),
  role_id TEXT NOT NULL,
  content BYTEA,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Parsed data (row-level storage for uploaded tabular files)
CREATE TABLE IF NOT EXISTS parsed_data (
  id SERIAL PRIMARY KEY,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  data JSONB NOT NULL
);

-- File column metadata
CREATE TABLE IF NOT EXISTS file_columns (
  id SERIAL PRIMARY KEY,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  column_name TEXT NOT NULL,
  column_type TEXT NOT NULL DEFAULT 'text'
);

-- File analysis results
CREATE TABLE IF NOT EXISTS file_analysis (
  file_id INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
  file_kind TEXT NOT NULL,
  parse_status TEXT NOT NULL,
  summary_json JSONB NOT NULL,
  insights_json JSONB NOT NULL,
  extracted_text TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default users
INSERT INTO users (username, password, display_name, role_id)
VALUES
  ('admin', 'admin123', 'System Admin', 'admin'),
  ('analyst', 'analyst123', 'Data Analyst', 'analyst'),
  ('business', 'business123', 'Business User', 'business'),
  ('Sushant Jakhade', 'sushant123', 'Sj bhai ', 'analyst')
ON CONFLICT (username) DO NOTHING;
