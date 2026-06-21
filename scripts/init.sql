-- Social Square — Initial Database Schema
-- Run via: docker-compose up (auto-executed by postgres init)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(30) UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP DEFAULT NOW(),
  last_seen     TIMESTAMP DEFAULT NOW(),
  is_banned     BOOLEAN DEFAULT FALSE
);

-- Avatar configurations
CREATE TABLE IF NOT EXISTS avatar_configs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  body        SMALLINT DEFAULT 0,
  outfit      SMALLINT DEFAULT 0,
  hair        SMALLINT DEFAULT 0,
  hair_color  VARCHAR(7) DEFAULT '#8B4513',
  accessory   SMALLINT DEFAULT 0,
  expression  SMALLINT DEFAULT 0,
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- Rooms (static configuration)
CREATE TABLE IF NOT EXISTS rooms (
  id          VARCHAR(50) PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  max_users   SMALLINT DEFAULT 30,
  is_active   BOOLEAN DEFAULT TRUE,
  config      JSONB DEFAULT '{}'
);

-- Seed initial rooms
INSERT INTO rooms (id, name, description, max_users) VALUES
  ('mall',  'Centro Commerciale', 'Negozi, fontane e musica pop.', 30),
  ('bar',   'Bar',                'Bancone, tavolini e jukebox.', 20),
  ('park',  'Picnic al Parco',    'Coperte, alberi e giochi.', 25),
  ('lake',  'Pesca al Lago',      'Pontile, lago e tramonto.', 20)
ON CONFLICT (id) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_avatar_configs_user_id ON avatar_configs(user_id);
