import { Database } from "bun:sqlite";

const db = new Database("./.data/db.sqlite");

db.query(
	`
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = 10000; 
PRAGMA temp_store = MEMORY;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username VARCHAR,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  name TEXT DEFAULT NULL, 
  avatar TEXT DEFAULT NULL, 
  verified BOOLEAN DEFAULT FALSE,
  bio TEXT DEFAULT NULL,
  location TEXT DEFAULT NULL,
  website TEXT DEFAULT NULL,
  banner TEXT DEFAULT NULL,
  post_count INTEGER DEFAULT 0,
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  password_hash TEXT DEFAULT NULL,
  admin BOOLEAN DEFAULT FALSE,
  suspended BOOLEAN DEFAULT FALSE,
  restricted BOOLEAN DEFAULT FALSE,
  shadowbanned BOOLEAN DEFAULT FALSE,
  private BOOLEAN DEFAULT FALSE,
  pronouns TEXT DEFAULT NULL,
  theme TEXT DEFAULT NULL,
  accent_color TEXT DEFAULT NULL,
  avatar_radius INTEGER DEFAULT NULL,
  gold BOOLEAN DEFAULT FALSE,
  affiliate BOOLEAN DEFAULT FALSE,
  label_type TEXT DEFAULT NULL,
  label_automated BOOLEAN DEFAULT FALSE,
  character_limit INTEGER DEFAULT NULL,
  affiliate_with TEXT DEFAULT NULL,
  selected_community_tag TEXT DEFAULT NULL,
  account_creation_transparency TEXT DEFAULT NULL,
  account_login_transparency TEXT DEFAULT NULL,
  super_tweeter BOOLEAN DEFAULT FALSE,
  super_tweeter_boost REAL DEFAULT 50.0,
  transparency_location_display TEXT DEFAULT 'full',
  blocked_by_count INTEGER DEFAULT 0,
  muted_by_count INTEGER DEFAULT 0,
  spam_score REAL DEFAULT 0.0,
  ip_address TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users(LOWER(username));
CREATE INDEX IF NOT EXISTS idx_users_spam_score ON users(spam_score);
CREATE INDEX IF NOT EXISTS idx_users_suspended ON users(suspended);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_super_tweeter ON users(super_tweeter) WHERE super_tweeter = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_ip_address ON users(ip_address);

CREATE TABLE IF NOT EXISTS ip_bans (
  ip_address TEXT PRIMARY KEY,
  banned_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (banned_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_ips (
  user_id TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  use_count INTEGER DEFAULT 1,
  last_used_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  PRIMARY KEY (user_id, ip_address),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_ips_user_id ON user_ips(user_id);
CREATE INDEX IF NOT EXISTS idx_user_ips_ip_address ON user_ips(ip_address);

CREATE TABLE IF NOT EXISTS passkeys (
  cred_id TEXT PRIMARY KEY,
  cred_public_key BLOB,
  internal_user_id TEXT,
  webauthn_user_id TEXT UNIQUE,
  counter INTEGER,
  backup_eligible BOOLEAN,
  backup_status BOOLEAN,
  transports TEXT,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  last_used TIMESTAMP, name TEXT DEFAULT NULL,
  FOREIGN KEY (internal_user_id) REFERENCES users(id)  ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS follows (
  id TEXT PRIMARY KEY,
  follower_id TEXT NOT NULL,
  following_id TEXT NOT NULL,
  notify_tweets BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows(following_id);

CREATE TABLE IF NOT EXISTS ghost_follows (
  id TEXT PRIMARY KEY,
  follower_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ghost_follows_target_id ON ghost_follows(target_id);
CREATE INDEX IF NOT EXISTS idx_ghost_follows_follower_type ON ghost_follows(follower_type);

CREATE TABLE IF NOT EXISTS forced_follows (
  id TEXT PRIMARY KEY,
  follower_id TEXT NOT NULL,
  following_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_forced_follows_follower_id ON forced_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_forced_follows_following_id ON forced_follows(following_id);

CREATE TABLE IF NOT EXISTS follow_requests (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  responded_at TIMESTAMP DEFAULT NULL,
  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(requester_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_follow_requests_target_id ON follow_requests(target_id);
CREATE INDEX IF NOT EXISTS idx_follow_requests_status ON follow_requests(status);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  reply_to TEXT,
  community_id TEXT DEFAULT NULL,
  community_only BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  edited_at TIMESTAMP DEFAULT NULL,
  like_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  retweet_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  source TEXT DEFAULT NULL,
  poll_id TEXT DEFAULT NULL,
  quote_tweet_id TEXT DEFAULT NULL,
  quote_count INTEGER DEFAULT 0,
  pinned BOOLEAN DEFAULT FALSE,
  reply_restriction TEXT DEFAULT 'everyone',
  scheduled_post_id TEXT DEFAULT NULL,
  article_id TEXT DEFAULT NULL,
  is_article BOOLEAN DEFAULT FALSE,
  article_title TEXT DEFAULT NULL,
  article_body_markdown TEXT DEFAULT NULL,
  super_tweet BOOLEAN DEFAULT FALSE,
  super_tweet_boost REAL DEFAULT 50.0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
  FOREIGN KEY (quote_tweet_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_posts_article_id ON posts(article_id);
CREATE INDEX IF NOT EXISTS idx_posts_community_id ON posts(community_id);
CREATE INDEX IF NOT EXISTS idx_posts_super_tweet ON posts(super_tweet) WHERE super_tweet = TRUE;

CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_posts_reply_to ON posts(reply_to);
CREATE INDEX IF NOT EXISTS idx_posts_pinned ON posts(pinned);
CREATE INDEX IF NOT EXISTS idx_posts_view_count ON posts(view_count);

CREATE TABLE IF NOT EXISTS likes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  UNIQUE(user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id);
CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id);

CREATE TABLE IF NOT EXISTS retweets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  UNIQUE(user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_retweets_user_id ON retweets(user_id);
CREATE INDEX IF NOT EXISTS idx_retweets_post_id ON retweets(post_id);

CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  UNIQUE(post_id)
);

CREATE TABLE IF NOT EXISTS poll_options (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL,
  option_text TEXT NOT NULL,
  vote_count INTEGER DEFAULT 0,
  option_order INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  poll_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id) REFERENCES poll_options(id) ON DELETE CASCADE,
  UNIQUE(user_id, poll_id)
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  file_hash TEXT,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_url TEXT NOT NULL,
  is_spoiler BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  related_id TEXT,
  actor_id TEXT DEFAULT NULL,
  actor_username TEXT DEFAULT NULL,
  actor_name TEXT DEFAULT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS suspensions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  suspended_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  severity INTEGER NOT NULL DEFAULT 3,
  action TEXT DEFAULT 'suspend',
  expires_at TIMESTAMP DEFAULT NULL,
  status TEXT DEFAULT 'active',
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (suspended_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_suspensions_action ON suspensions(action);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  type TEXT DEFAULT 'direct',
  title TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  updated_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  disappearing_enabled BOOLEAN DEFAULT FALSE,
  disappearing_duration INTEGER DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  last_read_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS dm_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  reply_to TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  edited_at TIMESTAMP DEFAULT NULL,
  deleted_at TIMESTAMP DEFAULT NULL,
  expires_at TIMESTAMP DEFAULT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reply_to) REFERENCES dm_messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_dm_messages_expires_at ON dm_messages(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dm_messages_deleted_at ON dm_messages(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS dm_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (message_id) REFERENCES dm_messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dm_reactions (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (message_id) REFERENCES dm_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_dm_reactions_message_id ON dm_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_dm_reactions_user_id ON dm_reactions(user_id);

CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  blocker_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  source_tweet_id TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker_id ON blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked_id ON blocks(blocked_id);

CREATE TABLE IF NOT EXISTS mutes (
  id TEXT PRIMARY KEY,
  muter_id TEXT NOT NULL,
  muted_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (muter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (muted_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(muter_id, muted_id)
);

CREATE INDEX IF NOT EXISTS idx_mutes_muter_id ON mutes(muter_id);
CREATE INDEX IF NOT EXISTS idx_mutes_muted_id ON mutes(muted_id);

CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  UNIQUE(user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_post_id ON bookmarks(post_id);

CREATE TABLE IF NOT EXISTS hashtags (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  tweet_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc'))
);

CREATE INDEX IF NOT EXISTS idx_hashtags_name ON hashtags(name);
CREATE INDEX IF NOT EXISTS idx_hashtags_tweet_count ON hashtags(tweet_count);

CREATE TABLE IF NOT EXISTS post_hashtags (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  hashtag_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (hashtag_id) REFERENCES hashtags(id) ON DELETE CASCADE,
  UNIQUE(post_id, hashtag_id)
);

CREATE INDEX IF NOT EXISTS idx_post_hashtags_post_id ON post_hashtags(post_id);
CREATE INDEX IF NOT EXISTS idx_post_hashtags_hashtag_id ON post_hashtags(hashtag_id);

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  scheduled_for TIMESTAMP NOT NULL,
  poll_data TEXT DEFAULT NULL,
  files_data TEXT DEFAULT NULL,
  gif_url TEXT DEFAULT NULL,
  reply_restriction TEXT DEFAULT 'everyone',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  posted_at TIMESTAMP DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_user_id ON scheduled_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_scheduled_for ON scheduled_posts(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status ON scheduled_posts(status);

CREATE TABLE IF NOT EXISTS moderation_logs (
  id TEXT PRIMARY KEY,
  moderator_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (moderator_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_moderation_logs_moderator_id ON moderation_logs(moderator_id);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_target_id ON moderation_logs(target_id);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_action ON moderation_logs(action);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_created_at ON moderation_logs(created_at);

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

CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT NULL,
  rules TEXT DEFAULT NULL,
  icon TEXT DEFAULT NULL,
  banner TEXT DEFAULT NULL,
  owner_id TEXT NOT NULL,
  access_mode TEXT DEFAULT 'open',
  member_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  updated_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  tag_enabled BOOLEAN DEFAULT FALSE,
  tag_emoji TEXT DEFAULT NULL,
  tag_text TEXT DEFAULT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_communities_owner_id ON communities(owner_id);
CREATE INDEX IF NOT EXISTS idx_communities_name ON communities(name);
CREATE INDEX IF NOT EXISTS idx_communities_created_at ON communities(created_at);

CREATE TABLE IF NOT EXISTS community_members (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  banned BOOLEAN DEFAULT FALSE,
  banned_at TIMESTAMP DEFAULT NULL,
  banned_by TEXT DEFAULT NULL,
  ban_reason TEXT DEFAULT NULL,
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (banned_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_members_community_id ON community_members(community_id);
CREATE INDEX IF NOT EXISTS idx_community_members_user_id ON community_members(user_id);
CREATE INDEX IF NOT EXISTS idx_community_members_role ON community_members(role);

CREATE TABLE IF NOT EXISTS community_join_requests (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  responded_at TIMESTAMP DEFAULT NULL,
  responded_by TEXT DEFAULT NULL,
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (responded_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_join_requests_community_id ON community_join_requests(community_id);
CREATE INDEX IF NOT EXISTS idx_community_join_requests_user_id ON community_join_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_community_join_requests_status ON community_join_requests(status);

CREATE TABLE IF NOT EXISTS affiliate_requests (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  responded_at TIMESTAMP DEFAULT NULL,
  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(requester_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_requests_target_id ON affiliate_requests(target_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_requests_status ON affiliate_requests(status);

CREATE TABLE IF NOT EXISTS post_reactions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(post_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_post_reactions_post_id ON post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_user_id ON post_reactions(user_id);

CREATE TABLE IF NOT EXISTS emojis (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  file_hash TEXT NOT NULL,
  file_url TEXT NOT NULL,
  created_by TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now','utc'))
);

CREATE INDEX IF NOT EXISTS idx_emojis_name ON emojis(name);

CREATE TABLE IF NOT EXISTS fact_checks (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  note TEXT NOT NULL,
  severity TEXT DEFAULT 'warning',
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fact_checks_post_id ON fact_checks(post_id);
CREATE INDEX IF NOT EXISTS idx_fact_checks_created_by ON fact_checks(created_by);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  reported_type TEXT NOT NULL,
  reported_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  additional_info TEXT DEFAULT NULL,
  status TEXT DEFAULT 'pending',
  resolved_by TEXT DEFAULT NULL,
  resolved_at TIMESTAMP DEFAULT NULL,
  resolution_action TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported_id ON reports(reported_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);

CREATE TABLE IF NOT EXISTS report_bans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  banned_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (banned_by) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_report_bans_user_id ON report_bans(user_id);

CREATE TABLE IF NOT EXISTS extensions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  author TEXT NOT NULL,
  summary TEXT DEFAULT NULL,
  description TEXT DEFAULT NULL,
  changelog_url TEXT DEFAULT NULL,
  website TEXT DEFAULT NULL,
  root_file TEXT NOT NULL,
  entry_type TEXT DEFAULT 'module',
  styles TEXT DEFAULT NULL,
  capabilities TEXT DEFAULT NULL,
  targets TEXT DEFAULT NULL,
  bundle_hash TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  created_by TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  updated_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_extensions_enabled ON extensions(enabled);
CREATE INDEX IF NOT EXISTS idx_extensions_name ON extensions(name);

CREATE TABLE IF NOT EXISTS interactive_cards (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  media_type TEXT NOT NULL,
  media_url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_interactive_cards_post_id ON interactive_cards(post_id);

CREATE TABLE IF NOT EXISTS interactive_card_options (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  description TEXT NOT NULL,
  tweet_text TEXT NOT NULL,
  option_order INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (card_id) REFERENCES interactive_cards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_interactive_card_options_card_id ON interactive_card_options(card_id);

CREATE TABLE IF NOT EXISTS pastes (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT NULL,
  title TEXT DEFAULT NULL,
  content TEXT NOT NULL,
  language TEXT DEFAULT NULL,
  is_public BOOLEAN DEFAULT TRUE,
  burn_after_reading BOOLEAN DEFAULT FALSE,
  secret_key TEXT DEFAULT NULL,
  slug TEXT UNIQUE,
  view_count INTEGER DEFAULT 0,
  expires_at TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  updated_at TIMESTAMP DEFAULT NULL,
  password_hash TEXT DEFAULT NULL,
  show_author BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pastes_user_id ON pastes(user_id);
CREATE INDEX IF NOT EXISTS idx_pastes_created_at ON pastes(created_at);
CREATE INDEX IF NOT EXISTS idx_pastes_slug ON pastes(slug);
CREATE INDEX IF NOT EXISTS idx_pastes_is_public ON pastes(is_public) WHERE is_public = TRUE;

CREATE TABLE IF NOT EXISTS delegates (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  delegate_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  accepted_at TIMESTAMP DEFAULT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (delegate_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(owner_id, delegate_id)
);

CREATE INDEX IF NOT EXISTS idx_delegates_owner_id ON delegates(owner_id);
CREATE INDEX IF NOT EXISTS idx_delegates_delegate_id ON delegates(delegate_id);
CREATE INDEX IF NOT EXISTS idx_delegates_status ON delegates(status);

CREATE TABLE IF NOT EXISTS account_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_type TEXT DEFAULT 'primary',
  delegate_owner_id TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (delegate_owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_account_sessions_user_id ON account_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_account_sessions_account_type ON account_sessions(account_type);

CREATE TABLE IF NOT EXISTS extension_settings (
  extension_id TEXT PRIMARY KEY,
  settings TEXT NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT (datetime('now', 'utc'))
);

CREATE INDEX IF NOT EXISTS idx_extension_settings_updated_at ON extension_settings(updated_at);

CREATE TABLE IF NOT EXISTS tweet_edit_history (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  content TEXT NOT NULL,
  edited_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tweet_edit_history_post_id ON tweet_edit_history(post_id);
CREATE INDEX IF NOT EXISTS idx_tweet_edit_history_edited_at ON tweet_edit_history(edited_at);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
`,
).run();

export default db;
