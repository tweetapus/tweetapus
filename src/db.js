import { Database } from "bun:sqlite";

const db = new Database("./.data/db.sqlite");

db.exec(`
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username VARCHAR,
  created_at TIMESTAMP DEFAULT (datetime('now'))
, name TEXT DEFAULT NULL, avatar TEXT DEFAULT NULL, verified BOOLEAN DEFAULT FALSE);
CREATE TABLE passkeys (
  cred_id TEXT PRIMARY KEY,
  cred_public_key BLOB,
  internal_user_id TEXT,
  webauthn_user_id TEXT UNIQUE,
  counter INTEGER,
  backup_eligible BOOLEAN,
  backup_status BOOLEAN,
  transports TEXT,
  created_at TIMESTAMP DEFAULT (datetime('now')),
  last_used TIMESTAMP, name TEXT DEFAULT NULL,
  FOREIGN KEY (internal_user_id) REFERENCES users(id)
);
CREATE UNIQUE INDEX idx_passkeys_internal_user_id_webauthn_user_id
  ON passkeys (internal_user_id, webauthn_user_id);
CREATE INDEX idx_passkeys_internal_user_id_cred_id
  ON passkeys (internal_user_id, cred_id);
CREATE INDEX idx_passkeys_webauthn_user_id_cred_id
  ON passkeys (webauthn_user_id, cred_id);
CREATE INDEX idx_passkeys_cred_id
  ON passkeys (cred_id);
CREATE TABLE follows (
  id TEXT PRIMARY KEY,
  follower_id TEXT NOT NULL,
  following_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now')),
  FOREIGN KEY (follower_id) REFERENCES users(id),
  FOREIGN KEY (following_id) REFERENCES users(id),
  UNIQUE(follower_id, following_id)
);
CREATE INDEX idx_follows_follower_id ON follows(follower_id);
CREATE INDEX idx_follows_following_id ON follows(following_id);
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  reply_to TEXT,
  created_at TIMESTAMP DEFAULT (datetime('now')),
  like_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  retweet_count INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE sqlite_sequence(name,seq);
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_reply_to ON posts(reply_to);
CREATE TABLE likes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  UNIQUE(user_id, post_id)
);
CREATE TABLE retweets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  UNIQUE(user_id, post_id)
);
CREATE INDEX idx_likes_user_id ON likes(user_id);
CREATE INDEX idx_likes_post_id ON likes(post_id);
CREATE INDEX idx_retweets_user_id ON retweets(user_id);
CREATE INDEX idx_retweets_post_id ON retweets(post_id);
`);

export default db;