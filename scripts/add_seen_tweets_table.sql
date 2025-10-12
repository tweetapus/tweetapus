-- Add seen_tweets table for tracking viewed tweets per user session
-- Run this with: sqlite3 ./.data/db.sqlite < scripts/add_seen_tweets_table.sql

CREATE TABLE IF NOT EXISTS seen_tweets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tweet_id TEXT NOT NULL,
  seen_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (tweet_id) REFERENCES posts(id) ON DELETE CASCADE,
  UNIQUE(user_id, tweet_id)
);

CREATE INDEX IF NOT EXISTS idx_seen_tweets_user_id ON seen_tweets(user_id);
CREATE INDEX IF NOT EXISTS idx_seen_tweets_seen_at ON seen_tweets(seen_at);

-- Clean up old seen tweets (older than 7 days)
DELETE FROM seen_tweets WHERE seen_at < datetime('now', '-7 days');
