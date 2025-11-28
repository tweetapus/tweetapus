import { existsSync, promises as fs, mkdirSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { unzipSync, zipSync } from "fflate";
import db from "../db.js";
import { clearSuspensionCache } from "../helpers/suspensionCache.js";
import { addNotification } from "./notifications.js";

const superAdminIds = (process.env.SUPERADMIN_IDS || "")
	.split(";")
	.map((id) => id.trim())
	.filter(Boolean);

const logModerationAction = (
	moderatorId,
	action,
	targetType,
	targetId,
	details = null,
) => {
	const logId = Bun.randomUUIDv7();
	db.query(
		`
    INSERT INTO moderation_logs (id, moderator_id, action, target_type, target_id, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
	).run(
		logId,
		moderatorId,
		action,
		targetType,
		targetId,
		details ? JSON.stringify(details) : null,
	);
};

const adminQueries = {
	findUserById: db.prepare("SELECT * FROM users WHERE id = ?"),
	findUserByUsername: db.prepare(
		"SELECT * FROM users WHERE LOWER(username) = LOWER(?)",
	),
	getUsersWithCounts: db.prepare(`
    SELECT u.*, 
           (SELECT COUNT(*) FROM posts WHERE user_id = u.id) as actual_post_count,
           (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as actual_follower_count,
           (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as actual_following_count
    FROM users u
    WHERE u.username LIKE ? OR u.name LIKE ?
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `),
	getUsersCount: db.prepare(
		"SELECT COUNT(*) as count FROM users WHERE username LIKE ? OR name LIKE ?",
	),

	getPostsWithUsers: db.prepare(`
    SELECT p.*, u.username, u.name, u.avatar, u.verified, u.gold, u.avatar_radius
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE (p.content LIKE ? OR p.article_title LIKE ? OR p.article_body_markdown LIKE ?)
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `),
	getPostsCount: db.prepare(
		"SELECT COUNT(*) as count FROM posts WHERE (content LIKE ? OR article_title LIKE ? OR article_body_markdown LIKE ?)",
	),

	getUserStats: db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN suspended = 1 THEN 1 ELSE 0 END) as suspended,
	SUM(CASE WHEN restricted = 1 THEN 1 ELSE 0 END) as restricted,
      SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END) as verified,
      SUM(CASE WHEN gold = 1 THEN 1 ELSE 0 END) as gold
    FROM users
  `),
	getPostStats: db.prepare("SELECT COUNT(*) as total FROM posts"),
	getSuspensionStats: db.prepare(`
		SELECT 
			COUNT(*) as active,
			SUM(CASE WHEN s.action = 'restrict' THEN 1 ELSE 0 END) as active_restricted,
			SUM(CASE WHEN s.action = 'suspend' THEN 1 ELSE 0 END) as active_suspended
		FROM suspensions s
		WHERE s.status = 'active'
	`),

	createFactCheck: db.prepare(
		`INSERT INTO fact_checks (id, post_id, created_by, note, severity) VALUES (?, ?, ?, ?, ?)`,
	),
	getFactCheck: db.prepare(
		`SELECT fc.*, u.username as admin_username FROM fact_checks fc JOIN users u ON fc.created_by = u.id WHERE fc.post_id = ?`,
	),
	deleteFactCheck: db.prepare(`DELETE FROM fact_checks WHERE id = ?`),
	getPostInteractions: db.prepare(`
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM likes WHERE post_id = ?
      UNION
      SELECT user_id FROM retweets WHERE post_id = ?
      UNION
      SELECT user_id FROM posts WHERE reply_to = ?
      UNION
      SELECT user_id FROM post_reactions WHERE post_id = ?
      UNION
      SELECT user_id FROM bookmarks WHERE post_id = ?
    )
  `),

	getRecentUsers: db.prepare(
		"SELECT username, created_at FROM users ORDER BY created_at DESC LIMIT 15",
	),
	getRecentSuspensions: db.prepare(`
    SELECT u.username, s.created_at
    FROM suspensions s
    JOIN users u ON s.user_id = u.id
    WHERE s.status = 'active' AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))
    ORDER BY s.created_at DESC
    LIMIT 15
  `),

	getUserWithDetails: db.prepare(`
SELECT u.*, 
       (SELECT COUNT(*) FROM posts WHERE user_id = u.id) as actual_post_count,
       (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as actual_follower_count,
       (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as actual_following_count,
       (SELECT COUNT(*) FROM ghost_follows WHERE target_id = u.id AND follower_type = 'follower') as ghost_follower_count,
       (SELECT COUNT(*) FROM ghost_follows WHERE target_id = u.id AND follower_type = 'following') as ghost_following_count,
       (SELECT COUNT(*) FROM likes WHERE user_id = u.id) as likes_given,
       (SELECT COUNT(*) FROM retweets WHERE user_id = u.id) as retweets_given,
       (SELECT COUNT(*) FROM passkeys WHERE internal_user_id = u.id) as passkey_count,
       (SELECT JSON_GROUP_ARRAY(JSON_OBJECT(
           'id', p.id,
           'content', p.content,
           'created_at', p.created_at
       ))
        FROM (SELECT * FROM posts WHERE user_id = u.id ORDER BY created_at DESC LIMIT 30) p
       ) as recent_posts,
       (SELECT JSON_GROUP_ARRAY(JSON_OBJECT(
           'id', fu.id,
           'username', fu.username
       ))
        FROM (SELECT u2.* FROM users u2
              INNER JOIN follows f ON u2.id = f.follower_id
              WHERE f.following_id = u.id
              ORDER BY f.created_at DESC LIMIT 20) fu
       ) as recent_followers,
       (SELECT JSON_GROUP_ARRAY(JSON_OBJECT(
           'id', lp.id,
           'content', lp.content,
           'username', lp.username
       ))
        FROM (SELECT p.id, p.content, u3.username
              FROM posts p
              INNER JOIN likes l ON p.id = l.post_id
              INNER JOIN users u3 ON p.user_id = u3.id
              WHERE l.user_id = u.id
              ORDER BY l.created_at DESC LIMIT 10) lp
       ) as recent_likes
FROM users u
WHERE u.id = ?
  `),
	getUserRecentPosts: db.prepare(`
    SELECT * FROM posts 
    WHERE user_id = ? 
    ORDER BY created_at DESC 
    LIMIT 10
  `),
	getUserSuspensions: db.prepare(`
    SELECT s.*, u.username as suspended_by_username
    FROM suspensions s
    JOIN users u ON s.suspended_by = u.id
    WHERE s.user_id = ?
    ORDER BY s.created_at DESC
  `),

	createSuspension: db.prepare(`
		INSERT INTO suspensions (id, user_id, suspended_by, reason, severity, action, expires_at, notes)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
	updateUserSuspended: db.prepare(
		"UPDATE users SET suspended = ? WHERE id = ?",
	),
	updateUserRestricted: db.prepare(
		"UPDATE users SET restricted = ? WHERE id = ?",
	),
	updateSuspensionStatus: db.prepare(
		"UPDATE suspensions SET status = ? WHERE user_id = ? AND status = 'active'",
	),

	updateUserVerified: db.prepare("UPDATE users SET verified = ? WHERE id = ?"),
	updateUserGold: db.prepare("UPDATE users SET gold = ? WHERE id = ?"),
	deleteUser: db.prepare("DELETE FROM users WHERE id = ?"),
	deletePost: db.prepare("DELETE FROM posts WHERE id = ?"),

	getSuspensionsWithUsers: db.prepare(`
    SELECT s.*, u.username, u.name, u.avatar,
           suspended_by_user.username as suspended_by_username
    FROM suspensions s
    JOIN users u ON s.user_id = u.id
    JOIN users suspended_by_user ON s.suspended_by = suspended_by_user.id
    WHERE s.status = 'active' AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `),
	getSuspensionsCount: db.prepare(
		"SELECT COUNT(*) as count FROM suspensions WHERE status = 'active' AND (expires_at IS NULL OR expires_at > datetime('now'))",
	),

	getPostById: db.prepare("SELECT * FROM posts WHERE id = ?"),
	updatePost: db.prepare(
		"UPDATE posts SET content = ?, like_count = ?, retweet_count = ?, reply_count = ?, view_count = ?, created_at = ? WHERE id = ?",
	),
	updatePostId: db.prepare("UPDATE posts SET id = ? WHERE id = ?"),
	createPostAsUser: db.prepare(
		"INSERT INTO posts (id, user_id, content, reply_to, created_at) VALUES (?, ?, ?, ?, ?)",
	),
	updateUser: db.prepare(
		"UPDATE users SET username = ?, name = ?, bio = ?, verified = ?, admin = ?, gold = ?, follower_count = ?, following_count = ?, character_limit = ?, created_at = ?, account_creation_transparency = ?, account_login_transparency = ? WHERE id = ?",
	),

	getAllConversations: db.prepare(`
		SELECT c.id, c.created_at,
			   COUNT(DISTINCT cp.user_id) as participant_count,
			   COUNT(DISTINCT dm.id) as message_count,
			   MAX(dm.created_at) as last_message_at
		FROM conversations c
		LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id
		LEFT JOIN dm_messages dm ON c.id = dm.conversation_id
		GROUP BY c.id
		ORDER BY last_message_at DESC NULLS LAST
		LIMIT ? OFFSET ?
	`),
	getConversationsCount: db.prepare(
		"SELECT COUNT(*) as count FROM conversations",
	),

	getConversationDetails: db.prepare(`
		SELECT c.id, c.created_at,
			   GROUP_CONCAT(u.username, ', ') as participants,
			   GROUP_CONCAT(u.name, ', ') as participant_names
		FROM conversations c
		JOIN conversation_participants cp ON c.id = cp.conversation_id
		JOIN users u ON cp.user_id = u.id
		WHERE c.id = ?
		GROUP BY c.id
	`),

	getConversationMessages: db.prepare(`
		SELECT dm.id, dm.content, dm.created_at, u.username, u.name, u.avatar
		FROM dm_messages dm
		JOIN users u ON dm.sender_id = u.id
		WHERE dm.conversation_id = ?
		ORDER BY dm.created_at DESC
		LIMIT ? OFFSET ?
	`),

	getConversationMessagesCount: db.prepare(`
		SELECT COUNT(*) as count FROM dm_messages WHERE conversation_id = ?
	`),

	getMessageAttachments: db.prepare(`
		SELECT file_name as filename, file_hash FROM dm_attachments WHERE message_id = ?
	`),

	searchConversationsByUser: db.prepare(`
		SELECT c.id, c.created_at,
			   COUNT(DISTINCT cp.user_id) as participant_count,
			   COUNT(DISTINCT dm.id) as message_count,
			   MAX(dm.created_at) as last_message_at,
			   GROUP_CONCAT(DISTINCT u.username) as participants
		FROM conversations c
		JOIN conversation_participants cp ON c.id = cp.conversation_id
		JOIN users u ON cp.user_id = u.id
		LEFT JOIN dm_messages dm ON c.id = dm.conversation_id
		WHERE u.username LIKE ?
		GROUP BY c.id
		ORDER BY last_message_at DESC NULLS LAST
		LIMIT ? OFFSET ?
	`),

	deleteConversation: db.prepare("DELETE FROM conversations WHERE id = ?"),
	deleteMessage: db.prepare("DELETE FROM dm_messages WHERE id = ?"),

	getModerationLogs: db.prepare(`
    SELECT ml.*, u.username as moderator_username, u.name as moderator_name
    FROM moderation_logs ml
    JOIN users u ON ml.moderator_id = u.id
    ORDER BY ml.created_at DESC
    LIMIT ? OFFSET ?
  `),
	getModerationLogsCount: db.prepare(
		"SELECT COUNT(*) as count FROM moderation_logs",
	),
	getModerationLogsByTarget: db.prepare(`
    SELECT ml.*, u.username as moderator_username, u.name as moderator_name
    FROM moderation_logs ml
    JOIN users u ON ml.moderator_id = u.id
    WHERE ml.target_id = ?
    ORDER BY ml.created_at DESC
    LIMIT 50
  `),
	getModerationLogsByModerator: db.prepare(`
    SELECT ml.*, u.username as moderator_username, u.name as moderator_name
    FROM moderation_logs ml
    JOIN users u ON ml.moderator_id = u.id
    WHERE ml.moderator_id = ?
    ORDER BY ml.created_at DESC
    LIMIT ? OFFSET ?
  `),
	searchModerationLogs: db.prepare(`
    SELECT ml.*, u.username as moderator_username, u.name as moderator_name
    FROM moderation_logs ml
    JOIN users u ON ml.moderator_id = u.id
    WHERE ml.action LIKE ? OR ml.target_type LIKE ? OR ml.target_id LIKE ? OR u.username LIKE ? OR u.name LIKE ? OR ml.details LIKE ?
    ORDER BY ml.created_at DESC
    LIMIT ? OFFSET ?
  `),
	searchModerationLogsCount: db.prepare(
		"SELECT COUNT(*) as count FROM moderation_logs ml JOIN users u ON ml.moderator_id = u.id WHERE ml.action LIKE ? OR ml.target_type LIKE ? OR ml.target_id LIKE ? OR u.username LIKE ? OR u.name LIKE ? OR ml.details LIKE ?",
	),
	getAffiliateRequestsForTarget: db.prepare(`
    SELECT ar.*, req.username as requester_username, req.name as requester_name, req.avatar as requester_avatar, req.verified as requester_verified, req.gold as requester_gold
    FROM affiliate_requests ar
    JOIN users req ON req.id = ar.requester_id
    WHERE ar.target_id = ?
    ORDER BY ar.created_at DESC
  `),
	getAffiliateRequestsForRequester: db.prepare(`
    SELECT ar.*, target.username as target_username, target.name as target_name, target.avatar as target_avatar, target.verified as target_verified, target.gold as target_gold
    FROM affiliate_requests ar
    JOIN users target ON target.id = ar.target_id
    WHERE ar.requester_id = ?
    ORDER BY ar.created_at DESC
  `),
	getAffiliatesForUser: db.prepare(`
    SELECT u.id, u.username, u.name, u.avatar, u.verified, u.gold, u.avatar_radius
    FROM users u
    WHERE u.affiliate = 1 AND u.affiliate_with = ?
    ORDER BY u.created_at DESC
  `),
	getAffiliateRequestById: db.prepare(
		"SELECT * FROM affiliate_requests WHERE id = ?",
	),
	deleteAffiliateRequest: db.prepare(
		"DELETE FROM affiliate_requests WHERE requester_id = ? AND target_id = ?",
	),
	insertAffiliateRequest: db.prepare(
		"INSERT INTO affiliate_requests (id, requester_id, target_id) VALUES (?, ?, ?)",
	),
	updateAffiliateRequestStatus: db.prepare(
		"UPDATE affiliate_requests SET status = ?, responded_at = datetime('now', 'utc') WHERE id = ?",
	),
	setUserAffiliate: db.prepare(
		"UPDATE users SET affiliate = ?, affiliate_with = ? WHERE id = ?",
	),
	createEmoji: db.prepare(
		"INSERT INTO emojis (id, name, file_hash, file_url, created_by) VALUES (?, ?, ?, ?, ?)",
	),
	getAllEmojis: db.prepare("SELECT * FROM emojis ORDER BY created_at DESC"),
	getEmojiById: db.prepare("SELECT * FROM emojis WHERE id = ?"),
	getEmojiByName: db.prepare("SELECT * FROM emojis WHERE name = ?"),
	deleteEmoji: db.prepare("DELETE FROM emojis WHERE id = ?"),
	getUserIp: db.prepare("SELECT ip_address FROM users WHERE id = ?"),
	getUsersByIp: db.prepare("SELECT * FROM users WHERE ip_address = ?"),
	getUserIpHistory: db.prepare("SELECT ip_address, use_count, last_used_at FROM user_ips WHERE user_id = ? ORDER BY last_used_at DESC"),
	banIp: db.prepare(
		"INSERT INTO ip_bans (ip_address, banned_by, reason) VALUES (?, ?, ?)",
	),
	unbanIp: db.prepare("DELETE FROM ip_bans WHERE ip_address = ?"),
	getIpBans: db.prepare("SELECT * FROM ip_bans ORDER BY created_at DESC"),
	checkIpBan: db.prepare("SELECT 1 FROM ip_bans WHERE ip_address = ?"),
};

const extensionsInstallDir = join(process.cwd(), "ext");
if (!existsSync(extensionsInstallDir)) {
	mkdirSync(extensionsInstallDir, { recursive: true });
}
const legacyExtensionsDir = join(process.cwd(), ".data", "extensions");
if (!existsSync(legacyExtensionsDir)) {
	mkdirSync(legacyExtensionsDir, { recursive: true });
}

const MAX_EXTENSION_ARCHIVE_SIZE = 8 * 1024 * 1024;
const MAX_EXTENSION_EXTRACTED_SIZE = 12 * 1024 * 1024;
const ALLOWED_SOURCE_EXTENSIONS = new Set([
	".js",
	".mjs",
	".cjs",
	".json",
	".css",
	".svg",
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".mp4",
	".woff",
	".woff2",
]);
const EXTENSION_ALLOWED_PREFIXES = ["src/"];
const manifestDecoder = new TextDecoder();

const extensionQueries = {
	listAll: db.prepare("SELECT * FROM extensions ORDER BY created_at DESC"),
	getByNameVersion: db.prepare(
		"SELECT id FROM extensions WHERE LOWER(name) = LOWER(?) AND version = ?",
	),
	insert: db.prepare(`
		INSERT INTO extensions (
			id,
			name,
			version,
			author,
			summary,
			description,
			changelog_url,
			website,
			root_file,
			entry_type,
			styles,
			capabilities,
			targets,
			bundle_hash,
			manifest_json,
			enabled,
			created_by
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`),
	updateEnabled: db.prepare(
		"UPDATE extensions SET enabled = ?, updated_at = datetime('now','utc') WHERE id = ?",
	),
	delete: db.prepare("DELETE FROM extensions WHERE id = ?"),
	getById: db.prepare("SELECT * FROM extensions WHERE id = ?"),
};

const extensionSettingsQueries = {
	get: db.prepare(
		"SELECT settings FROM extension_settings WHERE extension_id = ?",
	),
	upsert: db.prepare(`
		INSERT INTO extension_settings (extension_id, settings)
		VALUES (?, ?)
		ON CONFLICT(extension_id)
		DO UPDATE SET settings = excluded.settings, updated_at = datetime('now','utc')
	`),
};

const sanitizeStringValue = (value, max = 255) => {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	return trimmed.slice(0, max);
};

const sanitizeUrlValue = (value) => {
	const sanitized = sanitizeStringValue(value, 2048);
	if (!sanitized) return null;
	if (!/^https?:\/\//i.test(sanitized)) return null;
	return sanitized;
};

const normalizeArchivePath = (value) => {
	if (typeof value !== "string") return null;
	const replaced = value.replace(/\\\\/g, "/");
	const trimmed = replaced.replace(/^\.\/+/, "");
	const parts = trimmed
		.split("/")
		.filter((segment) => segment && segment !== ".");
	if (!parts.length) return null;
	if (parts.some((segment) => segment === "..")) return null;
	return parts.join("/");
};

const sanitizeRelativePath = (value) => {
	const normalized = normalizeArchivePath(value);
	if (!normalized) return null;
	if (
		!EXTENSION_ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix))
	) {
		return null;
	}
	return normalized;
};

const sanitizeEntryPath = (value) => {
	const normalized = sanitizeRelativePath(value);
	if (!normalized) return null;
	if (!normalized.startsWith("src/")) return null;
	const extension = extname(normalized).toLowerCase();
	if (!ALLOWED_SOURCE_EXTENSIONS.has(extension) || extension !== ".js") {
		return null;
	}
	return normalized;
};

const sanitizeBundledFilePath = (value) => {
	const normalized = sanitizeRelativePath(value);
	if (!normalized) return null;
	const extension = extname(normalized).toLowerCase();
	return ALLOWED_SOURCE_EXTENSIONS.has(extension) ? normalized : null;
};

const sanitizeDirectorySegment = (value) => {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const withoutExt = trimmed.replace(/\.tweeta$/i, "");
	const normalized = withoutExt
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
	return normalized || null;
};

const resolveInstallDirectory = (record) => {
	const manifest = parseJsonField(record.manifest_json, {});
	const installDir = sanitizeDirectorySegment(manifest?.install_dir ?? "");
	if (installDir) {
		return join(extensionsInstallDir, installDir);
	}
	return join(legacyExtensionsDir, record.id);
};

const parseStringArray = (value, maxItems = 10, maxLength = 64) => {
	if (!Array.isArray(value)) return [];
	const unique = new Set();
	for (const entry of value) {
		const sanitized = sanitizeStringValue(entry, maxLength);
		if (sanitized && !unique.has(sanitized) && unique.size < maxItems) {
			unique.add(sanitized);
		}
	}
	return Array.from(unique);
};

const parseStylesArray = (value) => {
	if (!Array.isArray(value)) return [];
	const unique = new Set();
	for (const entry of value) {
		const sanitized = sanitizeRelativePath(entry);
		if (sanitized?.startsWith("src/") && sanitized.endsWith(".css")) {
			unique.add(sanitized);
		}
	}
	return Array.from(unique);
};

const allowedSettingTypes = new Set([
	"text",
	"textarea",
	"number",
	"select",
	"toggle",
]);

const sanitizeSettingsKey = (value) => {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const normalized = trimmed.replace(/[^A-Za-z0-9._-]/g, "_");
	return normalized.slice(0, 64);
};

const parseSettingsOptions = (value) => {
	if (!Array.isArray(value)) return [];
	const options = [];
	const seen = new Set();
	for (const raw of value) {
		if (typeof raw !== "object" || !raw) continue;
		const optionValue = sanitizeStringValue(
			raw.value ?? raw.id ?? raw.key ?? raw.name,
			120,
		);
		if (!optionValue || seen.has(optionValue)) continue;
		const label =
			sanitizeStringValue(raw.label ?? raw.name ?? raw.title, 120) ||
			optionValue;
		options.push({ value: optionValue, label });
		seen.add(optionValue);
		if (options.length >= 24) break;
	}
	return options;
};

const parseExtensionSettingsSchema = (value) => {
	if (!Array.isArray(value)) return [];
	const schema = [];
	const keys = new Set();
	for (const entry of value) {
		if (typeof entry !== "object" || !entry) continue;
		const key = sanitizeSettingsKey(entry.key ?? entry.name ?? entry.id);
		if (!key || keys.has(key)) continue;
		let type =
			typeof entry.type === "string" ? entry.type.trim().toLowerCase() : "text";
		if (!allowedSettingTypes.has(type)) {
			type = "text";
		}
		const label =
			sanitizeStringValue(entry.label ?? entry.name ?? key, 80) || key;
		const description = sanitizeStringValue(
			entry.description ?? entry.help ?? entry.subtitle,
			240,
		);
		const placeholder = sanitizeStringValue(entry.placeholder, 160);
		const field = { key, type, label };
		if (description) field.description = description;
		if (placeholder && (type === "text" || type === "textarea")) {
			field.placeholder = placeholder;
		}
		if (type === "number") {
			const min = Number(entry.min ?? entry.minimum);
			const max = Number(entry.max ?? entry.maximum);
			const step = Number(entry.step ?? entry.increment ?? 1);
			if (Number.isFinite(min)) field.min = min;
			if (Number.isFinite(max)) field.max = max;
			if (Number.isFinite(step) && step > 0) field.step = step;
			const defaultValue = Number(
				entry.default ?? entry.value ?? entry.initial,
			);
			if (Number.isFinite(defaultValue)) field.default = defaultValue;
		} else if (type === "select") {
			const options = parseSettingsOptions(
				entry.options ?? entry.choices ?? entry.values,
			);
			if (!options.length) continue;
			field.options = options;
			const defaultValue = sanitizeStringValue(
				entry.default ?? entry.value ?? entry.initial ?? options[0]?.value,
				120,
			);
			if (defaultValue) field.default = defaultValue;
		} else if (type === "toggle") {
			const rawDefault = entry.default ?? entry.value ?? entry.initial;
			const boolDefault =
				rawDefault === true ||
				rawDefault === 1 ||
				rawDefault === "1" ||
				rawDefault === "true";
			field.default = boolDefault;
		} else if (type === "textarea") {
			const maxLength = Number(entry.maxLength ?? entry.max_length);
			if (Number.isFinite(maxLength) && maxLength > 0) {
				field.maxLength = Math.min(Math.max(32, maxLength), 2000);
			}
			const defaultValue = sanitizeStringValue(
				entry.default ?? entry.value ?? entry.initial,
				field.maxLength || 512,
			);
			if (defaultValue) field.default = defaultValue;
		} else {
			const maxLength = Number(entry.maxLength ?? entry.max_length);
			if (Number.isFinite(maxLength) && maxLength > 0) {
				field.maxLength = Math.min(Math.max(16, maxLength), 512);
			}
			const defaultValue = sanitizeStringValue(
				entry.default ?? entry.value ?? entry.initial,
				field.maxLength || 256,
			);
			if (defaultValue) field.default = defaultValue;
		}
		schema.push(field);
		keys.add(key);
		if (schema.length >= 24) break;
	}
	return schema;
};

const buildManifestPayload = (raw) => {
	const source = typeof raw === "object" && raw ? raw : {};
	const manifest = {};
	manifest.name = sanitizeStringValue(source.name, 80);
	if (!manifest.name) throw new Error("Extension name is required");
	manifest.version = sanitizeStringValue(source.version, 32) || "0.1.0";
	manifest.author = sanitizeStringValue(source.author, 80) || "unknown";
	manifest.summary =
		sanitizeStringValue(
			source.summary ?? source["what-it-does"] ?? source.description,
			280,
		) || null;
	manifest.description =
		sanitizeStringValue(
			source.description ?? source.details ?? source["long-description"],
			2000,
		) || null;
	manifest.changelog_url = sanitizeUrlValue(
		source.changelog ?? source["changelog-url"] ?? source.changelog_url,
	);
	manifest.website = sanitizeUrlValue(
		source.website ?? source.homepage ?? source.url,
	);
	const entryCandidate =
		source["root-file"] ??
		source.root_file ??
		source.rootFile ??
		source.entry ??
		source.main;
	manifest.root_file = sanitizeEntryPath(entryCandidate);
	if (!manifest.root_file) {
		throw new Error("root_file must point to a .js file inside src/");
	}
	const modeCandidate = (
		source["entry-type"] ??
		source.entry_type ??
		source.entryType ??
		source.mode ??
		"module"
	)
		.toString()
		.toLowerCase();
	manifest.entry_type = modeCandidate === "script" ? "script" : "module";
	manifest.styles = parseStylesArray(source.styles ?? source["style-files"]);
	manifest.capabilities = parseStringArray(
		source.capabilities ?? source.scopes ?? source.features,
		12,
	);
	manifest.targets = parseStringArray(
		source.targets ?? source["applies-to"],
		12,
	);
	const schemaRaw =
		source.settings ??
		source.settings_schema ??
		source.preferences ??
		source.schema ??
		source["settings-schema"];
	manifest.settings_schema = parseExtensionSettingsSchema(schemaRaw);
	return manifest;
};

const parseJsonField = (value, fallback) => {
	if (!value) return fallback;
	try {
		return JSON.parse(value);
	} catch {
		return fallback;
	}
};

const formatExtensionRecord = (record) => {
	const manifest = parseJsonField(record.manifest_json, {}) || {};
	const installDir = sanitizeDirectorySegment(manifest?.install_dir ?? "");
	const schemaSource =
		manifest?.settings ??
		manifest?.settings_schema ??
		manifest?.preferences ??
		manifest?.schema ??
		[];
	return {
		id: record.id,
		name: record.name,
		version: record.version,
		author: record.author,
		summary: record.summary,
		description: record.description,
		website: record.website,
		changelog_url: record.changelog_url,
		root_file: record.root_file,
		entry_type: record.entry_type,
		styles: parseJsonField(record.styles, []),
		capabilities: parseJsonField(record.capabilities, []),
		targets: parseJsonField(record.targets, []),
		bundle_hash: record.bundle_hash,
		enabled: !!record.enabled,
		created_at: record.created_at,
		updated_at: record.updated_at,
		managed: true,
		install_dir: installDir || null,
		settings_schema: parseExtensionSettingsSchema(schemaSource),
	};
};

const resolveExtensionSettingsTarget = async (rawId) => {
	const managed = extensionQueries.getById.get(rawId);
	if (managed) {
		return {
			type: "managed",
			settingsKey: managed.id,
		};
	}
	const dirName = sanitizeDirectorySegment(rawId || "");
	if (!dirName) return null;
	try {
		await fs.access(join(extensionsInstallDir, dirName, "ext.json"));
		return {
			type: "manual",
			settingsKey: dirName,
		};
	} catch {
		return null;
	}
};

const sanitizeSvgMarkup = (svgText) => {
	if (typeof svgText !== "string") return null;
	const trimmed = svgText.trim();
	if (!trimmed || trimmed.length > 8000) return null;
	if (!trimmed.startsWith("<svg") || !trimmed.endsWith("</svg>")) return null;
	const lowered = trimmed.toLowerCase();
	const forbiddenTokens = [
		"<script",
		"<iframe",
		"<object",
		"<embed",
		"<link",
		"<meta",
		"<style",
		"javascript:",
		"onload",
		"onerror",
		"onclick",
		"onfocus",
		"onmouseenter",
		"onmouseover",
		"onanimation",
		"onbegin",
		"onend",
		"onrepeat",
		"foreignobject",
		"<?xml",
		"<!doctype",
	];
	for (const token of forbiddenTokens) {
		if (lowered.includes(token)) return null;
	}
	return trimmed;
};

const requireAdmin = async ({ headers, jwt, set }) => {
	const token = headers.authorization?.replace("Bearer ", "");
	if (!token) {
		set.status = 401;
		return {
			user: {},
		};
	}

	const payload = await jwt.verify(token);
	if (!payload) {
		set.status = 401;
		return {
			user: {},
		};
	}

	const userId = payload.userId;
	const user = adminQueries.findUserById.get(userId);

	return {
		user,
	};
};

export default new Elysia({ prefix: "/admin", tags: ["Admin"] })
	.use(jwt({ name: "jwt", secret: process.env.JWT_SECRET }))
	.derive(requireAdmin)
	.guard({
		beforeHandle: async ({ user, set }) => {
			if (!user || user.suspended || !user.admin) {
				set.status = 403;
				return { error: "Admin access required" };
			}
		},
	})

	.get(
		"/stats",
		async () => {
			const userStats = adminQueries.getUserStats.get();
			const postStats = adminQueries.getPostStats.get();
			const suspensionStats = adminQueries.getSuspensionStats.get();

			const recentUsers = adminQueries.getRecentUsers.all();
			const recentSuspensions = adminQueries.getRecentSuspensions.all();

			return {
				stats: {
					users: userStats,
					posts: postStats,
					suspensions: suspensionStats,
				},
				recentActivity: {
					users: recentUsers,
					suspensions: recentSuspensions,
				},
			};
		},
		{
			detail: {
				description: "Gets admin statistics and recent activity",
			},
			response: t.Object({
				stats: t.Object({
					users: t.Any(),
					posts: t.Any(),
					suspensions: t.Any(),
				}),
				recentActivity: t.Object({
					users: t.Array(t.Any()),
					suspensions: t.Array(t.Any()),
				}),
			}),
		},
	)

	.get(
		"/users",
		async ({ query }) => {
			const page = parseInt(query.page, 10) || 1;
			const limit = parseInt(query.limit, 10) || 20;
			const search = query.search || "";
			const offset = (page - 1) * limit;

			const searchPattern = `%${search}%`;
			const users = adminQueries.getUsersWithCounts.all(
				searchPattern,
				searchPattern,
				limit,
				offset,
			);
			const totalCount = adminQueries.getUsersCount.get(
				searchPattern,
				searchPattern,
			);

			return {
				users,
				pagination: {
					page,
					limit,
					total: totalCount.count,
					pages: Math.ceil(totalCount.count / limit),
				},
			};
		},
		{
			detail: {
				description: "Lists users with pagination and search",
			},
			query: t.Object({
				page: t.Optional(t.String()),
				limit: t.Optional(t.String()),
				search: t.Optional(t.String()),
			}),
			response: t.Object({
				users: t.Array(t.Any()),
				pagination: t.Object({
					page: t.Number(),
					limit: t.Number(),
					total: t.Number(),
					pages: t.Number(),
				}),
			}),
		},
	)

	.post(
		"/users",
		async ({ body, user: moderator }) => {
			const { username, name, bio, verified, gold, admin: isAdmin } = body;
			if (!username || !username.trim()) {
				return { error: "Username is required" };
			}

			const existing = adminQueries.findUserByUsername.get(username.trim());
			if (existing) {
				return { error: "Username already taken" };
			}

			const id = Bun.randomUUIDv7();

			const finalVerified = gold ? 0 : verified ? 1 : 0;
			const finalGold = gold ? 1 : 0;

			db.query(
				`INSERT INTO users (id, username, name, bio, verified, admin, gold, character_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				id,
				username.trim(),
				name || null,
				bio || null,
				finalVerified,
				isAdmin ? 1 : 0,
				finalGold,
				null,
			);

			logModerationAction(moderator.id, "create_user", "user", id, {
				username: username.trim(),
			});

			return { success: true, id };
		},
		{
			body: t.Object({
				username: t.String(),
				name: t.Optional(t.String()),
				bio: t.Optional(t.String()),
				verified: t.Optional(t.Boolean()),
				gold: t.Optional(t.Boolean()),
				admin: t.Optional(t.Boolean()),
				cloneAffiliate: t.Optional(t.Boolean()),
			}),
		},
	)

	.post(
		"/users/:id/affiliate-requests",
		async ({ params, body, user: moderator }) => {
			const targetUsername = body.target_username?.trim();
			if (!targetUsername) {
				return { error: "Target username required" };
			}

			let requester = adminQueries.findUserById.get(params.id);
			if (!requester) {
				requester = adminQueries.findUserByUsername.get(params.id);
			}

			if (!requester) {
				return { error: "User not found" };
			}

			const targetUser = adminQueries.findUserByUsername.get(targetUsername);
			if (!targetUser) {
				return { error: "Target user not found" };
			}

			if (targetUser.id === requester.id) {
				return {
					error: "Cannot create affiliate relationship with the same user",
				};
			}

			const existing = db
				.query(
					"SELECT * FROM affiliate_requests WHERE requester_id = ? AND target_id = ?",
				)
				.get(requester.id, targetUser.id);

			if (existing) {
				if (existing.status === "pending") {
					return { error: "Affiliate request already pending" };
				}
				if (existing.status === "approved") {
					return { error: "Affiliate request already approved" };
				}
				adminQueries.deleteAffiliateRequest.run(requester.id, targetUser.id);
			}

			const requestId = Bun.randomUUIDv7();
			adminQueries.insertAffiliateRequest.run(
				requestId,
				requester.id,
				targetUser.id,
			);

			addNotification(
				targetUser.id,
				"affiliate_request",
				`${requester.username} requested you to become an affiliate`,
				`affiliate_request:${requestId}`,
				requester.id,
				requester.username,
				requester.name || requester.username,
			);

			logModerationAction(
				moderator.id,
				"send_affiliate_request",
				"affiliate_request",
				requestId,
				{
					requester: requester.username,
					target: targetUser.username,
				},
			);

			return { success: true, id: requestId };
		},
		{
			body: t.Object({
				target_username: t.String(),
			}),
		},
	)

	.post(
		"/affiliate-requests/:id/approve",
		async ({ params, user: moderator }) => {
			const request = adminQueries.getAffiliateRequestById.get(params.id);
			if (!request) {
				return { error: "Affiliate request not found" };
			}

			adminQueries.updateAffiliateRequestStatus.run("approved", params.id);
			adminQueries.setUserAffiliate.run(
				1,
				request.requester_id,
				request.target_id,
			);

			const requester = adminQueries.findUserById.get(request.requester_id);
			const targetUser = adminQueries.findUserById.get(request.target_id);

			if (requester && targetUser) {
				addNotification(
					requester.id,
					"affiliate_approved",
					"accepted your affiliate request",
					targetUser.username,
					targetUser.id,
					targetUser.username,
					targetUser.name || targetUser.username,
				);
			}

			logModerationAction(
				moderator.id,
				"force_accept_affiliate",
				"affiliate_request",
				params.id,
				{
					requester: requester?.username,
					target: targetUser?.username,
				},
			);

			return { success: true };
		},
		{
			detail: {
				description: "Approves an affiliate request",
			},
			params: t.Object({
				id: t.String(),
			}),
			response: t.Any(),
		},
	)

	.post(
		"/affiliate-requests/:id/deny",
		async ({ params, user: moderator }) => {
			const request = adminQueries.getAffiliateRequestById.get(params.id);
			if (!request) {
				return { error: "Affiliate request not found" };
			}

			adminQueries.updateAffiliateRequestStatus.run("denied", params.id);

			const requester = adminQueries.findUserById.get(request.requester_id);
			const targetUser = adminQueries.findUserById.get(request.target_id);

			logModerationAction(
				moderator.id,
				"force_reject_affiliate",
				"affiliate_request",
				params.id,
				{
					requester: requester?.username,
					target: targetUser?.username,
				},
			);

			return { success: true };
		},
		{
			detail: {
				description: "Denies an affiliate request",
			},
			params: t.Object({
				id: t.String(),
			}),
			response: t.Any(),
		},
	)

	.get(
		"/users/:id",
		async ({ params }) => {
			const user = adminQueries.getUserWithDetails.get(params.id);
			if (!user) {
				return { error: "User not found" };
			}

			if (user.affiliate && user.affiliate_with) {
				const affiliateUser = db
					.query("SELECT username FROM users WHERE id = ?")
					.get(user.affiliate_with);
				if (affiliateUser) {
					user.affiliate_with_username = affiliateUser.username;
				}
			}

			const recentPosts = adminQueries.getUserRecentPosts.all(params.id);
			const suspensions = adminQueries.getUserSuspensions.all(params.id);
			const incomingAffiliateRequestsRaw =
				adminQueries.getAffiliateRequestsForTarget.all(params.id);
			const outgoingAffiliateRequestsRaw =
				adminQueries.getAffiliateRequestsForRequester.all(params.id);
			const managedAffiliates = adminQueries.getAffiliatesForUser.all(
				params.id,
			);

			const incomingAffiliateRequests = incomingAffiliateRequestsRaw.map(
				(request) => ({
					id: request.id,
					status: request.status,
					created_at: request.created_at,
					responded_at: request.responded_at,
					requester_id: request.requester_id,
					requester_username: request.requester_username,
					requester_name: request.requester_name,
					requester_avatar: request.requester_avatar,
					requester_verified: request.requester_verified,
					requester_gold: request.requester_gold,
					target_id: request.target_id,
				}),
			);

			const outgoingAffiliateRequests = outgoingAffiliateRequestsRaw.map(
				(request) => ({
					id: request.id,
					status: request.status,
					created_at: request.created_at,
					responded_at: request.responded_at,
					requester_id: request.requester_id,
					target_id: request.target_id,
					target_username: request.target_username,
					target_name: request.target_name,
					target_avatar: request.target_avatar,
					target_verified: request.target_verified,
					target_gold: request.target_gold,
				}),
			);

			const ipHistory = adminQueries.getUserIpHistory.all(params.id);

			return {
				user,
				recentPosts,
				suspensions,
				ipHistory,
				affiliate: {
					incoming: incomingAffiliateRequests,
					outgoing: outgoingAffiliateRequests,
					managed: managedAffiliates,
				},
			};
		},
		{
			detail: {
				description: "Gets detailed information for a specific user",
			},
			params: t.Object({
				id: t.String(),
			}),
			response: t.Any(),
		},
	)

	.patch(
		"/users/:id/verify",
		async ({ params, body, user }) => {
			const { verified } = body;
			const targetUser = adminQueries.findUserById.get(params.id);
			if (verified) {
				adminQueries.updateUserGold.run(0, params.id);
			}
			adminQueries.updateUserVerified.run(verified ? 1 : 0, params.id);
			logModerationAction(
				user.id,
				verified ? "verify_user" : "unverify_user",
				"user",
				params.id,
				{ username: targetUser?.username, verified },
			);
			return { success: true };
		},
		{
			body: t.Object({
				verified: t.Boolean(),
			}),
		},
	)

	.patch(
		"/users/:id/gold",
		async ({ params, body, user }) => {
			const { gold } = body;
			const targetUser = adminQueries.findUserById.get(params.id);
			if (gold) {
				adminQueries.updateUserVerified.run(0, params.id);
			}
			adminQueries.updateUserGold.run(gold ? 1 : 0, params.id);
			logModerationAction(
				user.id,
				gold ? "grant_gold" : "revoke_gold",
				"user",
				params.id,
				{ username: targetUser?.username, gold },
			);
			return { success: true };
		},
		{
			body: t.Object({
				gold: t.Boolean(),
			}),
		},
	)

	.post(
		"/users/:id/suspend",
		async ({ params, body, user }) => {
			const { reason, duration, notes, action } = body;

			// If caller requested a lift via the suspend endpoint, allow lifting specific flags
			if (action === "lift") {
				const targetUser = adminQueries.findUserById.get(params.id);
				if (!targetUser) return { error: "User not found" };
				const wasSuspended = !!targetUser?.suspended;
				const wasRestricted = !!targetUser?.restricted;
				const wasShadowbanned = !!targetUser?.shadowbanned;

				// Expect body.lift to be an array of specific actions to lift: 'suspend', 'restrict', 'shadowban'
				const lifts = Array.isArray(body.lift) ? body.lift : [];
				if (!lifts.length) {
					return {
						error:
							"No lift actions specified. Provide an array of actions to lift.",
					};
				}

				let changed = false;
				for (const liftAction of lifts) {
					if (liftAction === "suspend" && wasSuspended) {
						adminQueries.updateUserSuspended.run(false, params.id);
						db.query(
							"UPDATE suspensions SET status = 'lifted' WHERE user_id = ? AND action = 'suspend' AND status = 'active'",
						).run(params.id);
						logModerationAction(user.id, "unsuspend_user", "user", params.id, {
							username: targetUser?.username,
						});
						changed = true;
					}
					if (liftAction === "restrict" && wasRestricted) {
						adminQueries.updateUserRestricted.run(false, params.id);
						db.query(
							"UPDATE suspensions SET status = 'lifted' WHERE user_id = ? AND action = 'restrict' AND status = 'active'",
						).run(params.id);
						logModerationAction(user.id, "unrestrict_user", "user", params.id, {
							username: targetUser?.username,
						});
						changed = true;
					}
					if (liftAction === "shadowban" && wasShadowbanned) {
						db.query("UPDATE users SET shadowbanned = FALSE WHERE id = ?").run(
							params.id,
						);
						db.query(
							"UPDATE suspensions SET status = 'lifted' WHERE user_id = ? AND action = 'shadowban' AND status = 'active'",
						).run(params.id);
						logModerationAction(
							user.id,
							"unshadowban_user",
							"user",
							params.id,
							{
								username: targetUser?.username,
							},
						);
						changed = true;
					}
				}

				if (!changed) {
					return { error: "Selected lift actions did not apply to the user" };
				}

				try {
					clearSuspensionCache(params.id);
				} catch (_) {}

				return { success: true };
			}
			const suspensionId = Bun.randomUUIDv7();
			const targetUser = adminQueries.findUserById.get(params.id);

			if (!targetUser) return { error: "User not found" };

			// Prevent repeated actions (e.g., suspending an already suspended user),
			// but allow combinations such as restricting and shadowbanning the same user.
			// if (action === "suspend") {
			// 	if (targetUser.suspended) return { error: "User is already suspended" };
			// }
			if (action === "restrict" && targetUser.restricted) {
				return { error: "User is already restricted" };
			}
			if (action === "shadowban" && targetUser.shadowbanned) {
				return { error: "User is already shadowbanned" };
			}

			const expiresAt = duration
				? new Date(Date.now() + duration * 60 * 1000).toISOString()
				: null;

			// Insert suspension with action; severity no longer used
			adminQueries.createSuspension.run(
				suspensionId,
				params.id,
				user.id,
				reason,
				null,
				action || "suspend",
				expiresAt,
				notes,
			);

			if ((action || "suspend") === "suspend") {
				// Suspend overrides other states
				adminQueries.updateUserSuspended.run(true, params.id);
				adminQueries.updateUserRestricted.run(false, params.id);
				db.query("UPDATE users SET shadowbanned = FALSE WHERE id = ?").run(
					params.id,
				);
				db.query("DELETE FROM dm_messages WHERE sender_id = ?").run(params.id);
			} else if ((action || "suspend") === "restrict") {
				// Apply a restriction without touching other flags (allow combining with shadowban)
				adminQueries.updateUserRestricted.run(true, params.id);
			} else if ((action || "suspend") === "shadowban") {
				// Apply shadowban without touching other flags (allow combining with restrict)
				db.query("UPDATE users SET shadowbanned = TRUE WHERE id = ?").run(
					params.id,
				);
				db.query("DELETE FROM dm_messages WHERE sender_id = ?").run(params.id);
			}

			const moderationActionName =
				(action || "suspend") === "restrict"
					? "restrict_user"
					: (action || "suspend") === "shadowban"
						? "shadowban_user"
						: "suspend_user";
			logModerationAction(user.id, moderationActionName, "user", params.id, {
				username: targetUser?.username,
				reason,
				action: action || "suspend",
				duration,
				notes,
			});

			return { success: true };
		},
		{
			body: t.Object({
				reason: t.String(),
				action: t.Optional(
					t.Union([
						t.Literal("suspend"),
						t.Literal("restrict"),
						t.Literal("shadowban"),
						t.Literal("lift"),
					]),
				),
				lift: t.Optional(
					t.Array(
						t.Union([
							t.Literal("suspend"),
							t.Literal("restrict"),
							t.Literal("shadowban"),
						]),
					),
				),
				duration: t.Optional(t.Number()),
				notes: t.Optional(t.String()),
			}),
		},
	)

	.post(
		"/users/:id/unsuspend",
		async ({ params, user }) => {
			const targetUser = adminQueries.findUserById.get(params.id);
			const wasSuspended = !!targetUser?.suspended;
			const wasRestricted = !!targetUser?.restricted;
			const wasShadowbanned = !!targetUser?.shadowbanned;

			adminQueries.updateUserSuspended.run(false, params.id);
			adminQueries.updateUserRestricted.run(false, params.id);
			// Also clear shadowbanned flag so users regain visibility after unsuspend
			db.query("UPDATE users SET shadowbanned = FALSE WHERE id = ?").run(
				params.id,
			);
			adminQueries.updateSuspensionStatus.run("lifted", params.id);
			// Invalidate any cached suspension status server-side so it takes effect immediately
			try {
				clearSuspensionCache(params.id);
			} catch (_e) {}

			if (wasSuspended) {
				logModerationAction(user.id, "unsuspend_user", "user", params.id, {
					username: targetUser?.username,
				});
			}

			// Invalidate any cached suspension/restriction for this user
			try {
				clearSuspensionCache(params.id);
			} catch (_e) {}
			if (wasRestricted) {
				logModerationAction(user.id, "unrestrict_user", "user", params.id, {
					username: targetUser?.username,
				});
			}
			if (wasShadowbanned) {
				logModerationAction(user.id, "unshadowban_user", "user", params.id, {
					username: targetUser?.username,
				});
			}
			return { success: true };
		},
		{
			detail: {
				description: "Unsuspends a user and removes all suspension flags",
			},
			params: t.Object({
				id: t.String(),
			}),
			response: t.Any(),
		},
	)

	.delete(
		"/users/:id",
		async ({ params, user }) => {
			const targetUser = adminQueries.findUserById.get(params.id);
			if (!targetUser) return { error: "User not found" };

			adminQueries.deleteUser.run(params.id);
			logModerationAction(user.id, "delete_user", "user", params.id, {
				username: targetUser.username,
			});

			return { success: true };
		},
		{
			detail: {
				description: "Deletes a user",
			},
			params: t.Object({
				id: t.String(),
			}),
			response: t.Any(),
		},
	)

	.post(
		"/users/:id/clone",
		async ({ params, body, user: moderator }) => {
			let sourceUser = adminQueries.findUserById.get(params.id);
			if (!sourceUser) {
				sourceUser = adminQueries.findUserByUsername.get(params.id);
			}

			if (!sourceUser) return { error: "Source user not found" };

			const username = body.username?.trim();
			const name = body.name !== undefined ? body.name : sourceUser.name;
			const cloneRelations =
				body.cloneRelations === undefined ? true : !!body.cloneRelations;
			const cloneGhosts =
				body.cloneGhosts === undefined ? true : !!body.cloneGhosts;
			const cloneTweets =
				body.cloneTweets === undefined ? true : !!body.cloneTweets;
			const cloneReplies =
				body.cloneReplies === undefined ? true : !!body.cloneReplies;
			const cloneRetweets =
				body.cloneRetweets === undefined ? true : !!body.cloneRetweets;
			const cloneReactions =
				body.cloneReactions === undefined ? true : !!body.cloneReactions;
			const cloneCommunities =
				body.cloneCommunities === undefined ? true : !!body.cloneCommunities;
			const cloneMedia =
				body.cloneMedia === undefined ? false : !!body.cloneMedia;
			const cloneAffiliate =
				body.cloneAffiliate === undefined ? false : !!body.cloneAffiliate;

			if (!username) return { error: "Username is required" };

			const existing = adminQueries.findUserByUsername.get(username);
			if (existing) return { error: "Username already taken" };

			const newId = Bun.randomUUIDv7();

			try {
				db.transaction(() => {
					db.query(
						`INSERT INTO users (id, username, name, bio, avatar, verified, admin, gold, character_limit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					).run(
						newId,
						username,
						name || null,
						sourceUser.bio || null,
						sourceUser.avatar || null,
						sourceUser.verified ? 1 : 0,
						0,
						sourceUser.gold ? 1 : 0,
						sourceUser.character_limit || null,
						new Date().toISOString(),
					);

					if (cloneAffiliate && sourceUser.affiliate_with) {
						adminQueries.setUserAffiliate.run(
							1,
							sourceUser.affiliate_with,
							newId,
						);
					}

					if (cloneRelations) {
						const followers = db
							.query("SELECT follower_id FROM follows WHERE following_id = ?")
							.all(sourceUser.id);

						for (const f of followers) {
							if (!f || !f.follower_id) continue;
							if (f.follower_id === newId) continue;
							const exists = db
								.query(
									"SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?",
								)
								.get(f.follower_id, newId);
							if (!exists) {
								db.query(
									"INSERT INTO follows (id, follower_id, following_id) VALUES (?, ?, ?)",
								).run(Bun.randomUUIDv7(), f.follower_id, newId);
							}
						}

						const following = db
							.query("SELECT following_id FROM follows WHERE follower_id = ?")
							.all(sourceUser.id);

						for (const f of following) {
							if (!f || !f.following_id) continue;
							if (f.following_id === newId) continue;
							const exists = db
								.query(
									"SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?",
								)
								.get(newId, f.following_id);
							if (!exists) {
								db.query(
									"INSERT INTO follows (id, follower_id, following_id) VALUES (?, ?, ?)",
								).run(Bun.randomUUIDv7(), newId, f.following_id);
							}
						}
					}

					if (cloneGhosts) {
						const ghosts = db
							.query(
								"SELECT follower_type FROM ghost_follows WHERE target_id = ?",
							)
							.all(sourceUser.id);

						for (const g of ghosts) {
							if (!g || !g.follower_type) continue;
							db.query(
								"INSERT INTO ghost_follows (id, follower_type, target_id) VALUES (?, ?, ?)",
							).run(Bun.randomUUIDv7(), g.follower_type, newId);
						}
					}

					if (cloneTweets) {
						const posts = db
							.query(
								"SELECT id, content, reply_to, quote_tweet_id, created_at, community_id, pinned FROM posts WHERE user_id = ? ORDER BY created_at ASC",
							)
							.all(sourceUser.id);

						const postIdMap = new Map();
						const clonedPosts = [];

						for (const p of posts) {
							const newPostId = Bun.randomUUIDv7();
							const communityIdToUse = cloneCommunities ? p.community_id : null;

							db.query(
								"INSERT INTO posts (id, user_id, content, reply_to, quote_tweet_id, community_id, created_at, pinned) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
							).run(
								newPostId,
								newId,
								p.content,
								null,
								null,
								communityIdToUse,
								p.created_at || new Date().toISOString(),
								p.pinned ? 1 : 0,
							);

							postIdMap.set(p.id, newPostId);
							clonedPosts.push({
								origId: p.id,
								newId: newPostId,
								reply_to: p.reply_to,
								quote_tweet_id: p.quote_tweet_id,
								created_at: p.created_at,
								pinned: p.pinned,
								community_id: p.community_id,
							});
						}

						for (const cp of clonedPosts) {
							let mappedReplyTo = null;
							if (cloneReplies && cp.reply_to) {
								mappedReplyTo = postIdMap.has(cp.reply_to)
									? postIdMap.get(cp.reply_to)
									: cp.reply_to;
							}

							let mappedQuoteId = null;
							if (cp.quote_tweet_id) {
								mappedQuoteId = postIdMap.has(cp.quote_tweet_id)
									? postIdMap.get(cp.quote_tweet_id)
									: cp.quote_tweet_id;
							}

							db.query(
								"UPDATE posts SET reply_to = ?, quote_tweet_id = ? WHERE id = ?",
							).run(mappedReplyTo, mappedQuoteId, cp.newId);

							if (mappedReplyTo) {
								db.query(
									"UPDATE posts SET reply_count = COALESCE(reply_count,0) + 1 WHERE id = ?",
								).run(mappedReplyTo);
							}

							if (mappedQuoteId) {
								db.query(
									"UPDATE posts SET quote_count = COALESCE(quote_count,0) + 1 WHERE id = ?",
								).run(mappedQuoteId);
							}
						}

						if (cloneMedia) {
							const getAttachments = db.query(
								"SELECT id, file_hash, file_name, file_type, file_size, file_url, is_spoiler, created_at FROM attachments WHERE post_id = ?",
							);

							for (const cp of clonedPosts) {
								try {
									const atts = getAttachments.all(cp.origId);
									for (const a of atts) {
										const newAttId = Bun.randomUUIDv7();
										db.query(
											`INSERT INTO attachments (id, post_id, file_hash, file_name, file_type, file_size, file_url, is_spoiler, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
										).run(
											newAttId,
											cp.newId,
											a.file_hash,
											a.file_name,
											a.file_type,
											a.file_size,
											a.file_url,
											a.is_spoiler ? 1 : 0,
											a.created_at || new Date().toISOString(),
										);
									}
								} catch {
									console.error(
										"Failed to clone attachments for post",
										cp.origId,
										e,
									);
								}
							}
						}

						if (cloneRetweets) {
							const sourceRetweets = db
								.query(
									"SELECT post_id, created_at FROM retweets WHERE user_id = ?",
								)
								.all(sourceUser.id);

							for (const r of sourceRetweets) {
								const targetPostId = postIdMap.has(r.post_id)
									? postIdMap.get(r.post_id)
									: r.post_id;
								const exists = db
									.query(
										"SELECT 1 FROM retweets WHERE user_id = ? AND post_id = ?",
									)
									.get(newId, targetPostId);
								if (!exists) {
									db.query(
										"INSERT INTO retweets (id, user_id, post_id, created_at) VALUES (?, ?, ?, ?)",
									).run(
										Bun.randomUUIDv7(),
										newId,
										targetPostId,
										r.created_at || new Date().toISOString(),
									);
									db.query(
										"UPDATE posts SET retweet_count = COALESCE(retweet_count,0) + 1 WHERE id = ?",
									).run(targetPostId);
								}
							}
						}

						if (cloneReactions) {
							const sourceLikes = db
								.query(
									"SELECT post_id, created_at FROM likes WHERE user_id = ?",
								)
								.all(sourceUser.id);
							for (const l of sourceLikes) {
								const targetPostId = postIdMap.has(l.post_id)
									? postIdMap.get(l.post_id)
									: l.post_id;
								const exists = db
									.query(
										"SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?",
									)
									.get(newId, targetPostId);
								if (!exists) {
									db.query(
										"INSERT INTO likes (id, user_id, post_id, created_at) VALUES (?, ?, ?, ?)",
									).run(
										Bun.randomUUIDv7(),
										newId,
										targetPostId,
										l.created_at || new Date().toISOString(),
									);
									db.query(
										"UPDATE posts SET like_count = COALESCE(like_count,0) + 1 WHERE id = ?",
									).run(targetPostId);
								}
							}

							const sourceReacts = db
								.query(
									"SELECT post_id, emoji, created_at FROM post_reactions WHERE user_id = ?",
								)
								.all(sourceUser.id);
							for (const r of sourceReacts) {
								const targetPostId = postIdMap.has(r.post_id)
									? postIdMap.get(r.post_id)
									: r.post_id;
								const exists = db
									.query(
										"SELECT 1 FROM post_reactions WHERE user_id = ? AND post_id = ? AND emoji = ?",
									)
									.get(newId, targetPostId, r.emoji);
								if (!exists) {
									db.query(
										"INSERT INTO post_reactions (id, post_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?, ?)",
									).run(
										Bun.randomUUIDv7(),
										targetPostId,
										newId,
										r.emoji,
										r.created_at || new Date().toISOString(),
									);
								}
							}
						}

						if (cloneCommunities) {
							const memberships = db
								.query(
									"SELECT community_id, role, joined_at FROM community_members WHERE user_id = ?",
								)
								.all(sourceUser.id);
							for (const m of memberships) {
								const exists = db
									.query(
										"SELECT 1 FROM community_members WHERE user_id = ? AND community_id = ?",
									)
									.get(newId, m.community_id);
								if (!exists) {
									db.query(
										"INSERT INTO community_members (id, community_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)",
									).run(
										Bun.randomUUIDv7(),
										m.community_id,
										newId,
										m.role || "member",
										m.joined_at || new Date().toISOString(),
									);
									db.query(
										"UPDATE communities SET member_count = COALESCE(member_count,0) + 1 WHERE id = ?",
									).run(m.community_id);
								}
							}
						}
					}
				})();

				logModerationAction(moderator.id, "clone_user", "user", newId, {
					source: sourceUser.username,
					username,
					options: {
						cloneRelations,
						cloneGhosts,
						cloneTweets,
						cloneReplies,
						cloneRetweets,
						cloneReactions,
						cloneCommunities,
						cloneMedia,
						cloneAffiliate,
					},
				});

				return { success: true, id: newId, username };
			} catch (e) {
				console.error("Failed to clone user:", e);
				return { error: "Failed to clone user" };
			}
		},
		{
			body: t.Object({
				username: t.String(),
				name: t.Optional(t.String()),
				cloneRelations: t.Optional(t.Boolean()),
				cloneGhosts: t.Optional(t.Boolean()),
				cloneTweets: t.Optional(t.Boolean()),
				cloneReplies: t.Optional(t.Boolean()),
				cloneRetweets: t.Optional(t.Boolean()),
				cloneReactions: t.Optional(t.Boolean()),
				cloneCommunities: t.Optional(t.Boolean()),
				cloneMedia: t.Optional(t.Boolean()),
				cloneAffiliate: t.Optional(t.Boolean()),
			}),
		},
	)

	.get(
		"/posts",
		async ({ query }) => {
			const page = parseInt(query.page, 10) || 1;
			const limit = parseInt(query.limit, 10) || 20;
			const search = query.search || "";
			const offset = (page - 1) * limit;

			const searchPattern = `%${search}%`;
			const posts = adminQueries.getPostsWithUsers.all(
				searchPattern,
				searchPattern,
				searchPattern,
				limit,
				offset,
			);
			const totalCount = adminQueries.getPostsCount.get(
				searchPattern,
				searchPattern,
				searchPattern,
			);

			return {
				posts,
				pagination: {
					page,
					limit,
					total: totalCount.count,
					pages: Math.ceil(totalCount.count / limit),
				},
			};
		},
		{
			detail: {
				description: "Lists posts with pagination and search",
			},
			query: t.Object({
				page: t.Optional(t.String()),
				limit: t.Optional(t.String()),
				search: t.Optional(t.String()),
			}),
			response: t.Object({
				posts: t.Array(t.Any()),
				pagination: t.Any(),
			}),
		},
	)

	.delete(
		"/posts/:id",
		async ({ params, user }) => {
			const post = adminQueries.getPostById.get(params.id);
			const postAuthor = post
				? adminQueries.findUserById.get(post.user_id)
				: null;
			db.transaction(() => {
				db.query("DELETE FROM likes WHERE post_id = ?").run(params.id);
				db.query("DELETE FROM posts WHERE reply_to = ?").run(params.id);
				db.query("DELETE FROM retweets WHERE post_id = ?").run(params.id);
				adminQueries.deletePost.run(params.id);
			})();
			logModerationAction(user.id, "delete_post", "post", params.id, {
				author: postAuthor?.username,
				content: post?.content?.substring(0, 100),
			});
			return { success: true };
		},
		{
			detail: {
				description: "Deletes a post and all associated data",
			},
			params: t.Object({
				id: t.String(),
			}),
			response: t.Any(),
		},
	)

	.get(
		"/suspensions",
		async ({ query }) => {
			const page = parseInt(query.page, 10) || 1;
			const limit = parseInt(query.limit, 10) || 20;
			const offset = (page - 1) * limit;

			const suspensions = adminQueries.getSuspensionsWithUsers.all(
				limit,
				offset,
			);
			const totalCount = adminQueries.getSuspensionsCount.get();

			return {
				suspensions,
				pagination: {
					page,
					limit,
					total: totalCount.count,
					pages: Math.ceil(totalCount.count / limit),
				},
			};
		},
		{
			detail: {
				description: "Lists active suspensions with pagination",
			},
			query: t.Object({
				page: t.Optional(t.String()),
				limit: t.Optional(t.String()),
			}),
			response: t.Object({
				suspensions: t.Array(t.Any()),
				pagination: t.Any(),
			}),
		},
	)

	.get(
		"/posts/:id",
		async ({ params }) => {
			const post = adminQueries.getPostById.get(params.id);
			if (!post) {
				return { error: "Post not found" };
			}
			return post;
		},
		{
			/* im gonna make a simple js sdk javascript access and coffee true JavaScript K4L1 H4xx0r St1nkray i will continue the tweeta android app after the auth problems are fixed 🚀 idk what is causing the auth problems tho, can you take a look at the devtools network tab yes, GPT-5.1-Codex is doing things RN check your devtools network tap and see if any errors show up network tap🚀🎯 an error did appear but it disappeared make a video or check devtools im gonna make a video🚀🚀🚀🚀🚀 check discord*/
			detail: {
				description: "Gets details for a specific post",
			},
			params: t.Object({
				id: t.String(),
			}),
			response: t.Any(),
		},
	)

	.patch(
		"/posts/:id",
		async ({ params, body, user }) => {
			const post = adminQueries.getPostById.get(params.id);
			if (!post) {
				return { error: "Post not found" };
			}
			const postOwner = adminQueries.findUserById.get(post.user_id);
			const maxLength = postOwner?.gold
				? 16500
				: postOwner?.verified
					? 5500
					: 400;
			if (body.content && body.content.length > maxLength) {
				return { error: `Content must be ${maxLength} characters or less` };
			}

			const changes = {};
			if (body.content !== post.content)
				changes.content = {
					old: post.content?.substring(0, 100),
					new: body.content?.substring(0, 100),
				};
			if (body.likes !== undefined && body.likes !== post.like_count)
				changes.likes = { old: post.like_count, new: body.likes };
			if (body.retweets !== undefined && body.retweets !== post.retweet_count)
				changes.retweets = { old: post.retweet_count, new: body.retweets };
			if (body.replies !== undefined && body.replies !== post.reply_count)
				changes.replies = { old: post.reply_count, new: body.replies };
			if (body.views !== undefined && body.views !== post.view_count)
				changes.views = { old: post.view_count, new: body.views };

			let newCreatedAt = post.created_at;
			if (body.created_at !== undefined) {
				try {
					const parsed = new Date(body.created_at);
					if (Number.isNaN(parsed.getTime())) throw new Error("Invalid date");
					newCreatedAt = parsed.toISOString();
					if (newCreatedAt !== post.created_at) {
						changes.created_at = { old: post.created_at, new: newCreatedAt };
					}
				} catch (_err) {
					return { error: "Invalid created_at value" };
				}
			}

			adminQueries.updatePost.run(
				body.content,
				body.likes,
				body.retweets,
				body.replies,
				body.views,
				newCreatedAt,
				params.id,
			);

			logModerationAction(user.id, "edit_post", "post", params.id, {
				author: postOwner?.username,
				changes,
			});

			return { success: true };
		},
		{
			body: t.Object({
				content: t.String(),
				likes: t.Optional(t.Number()),
				retweets: t.Optional(t.Number()),
				replies: t.Optional(t.Number()),
				views: t.Optional(t.Number()),
				created_at: t.Optional(t.String()),
			}),
		},
	)

	.patch(
		"/posts/:id/id",
		async ({ params, body, user }) => {
			const rawNewId =
				typeof body?.new_id === "string" ? body.new_id.trim() : "";
			if (!rawNewId) {
				return { error: "New tweet ID is required" };
			}

			const post = adminQueries.getPostById.get(params.id);
			if (!post) {
				return { error: "Post not found" };
			}

			if (rawNewId === post.id) {
				return { success: true, id: post.id };
			}

			const existing = adminQueries.getPostById.get(rawNewId);
			if (existing) {
				return { error: "A post with that ID already exists" };
			}

			try {
				const updates = [
					{ table: "likes", column: "post_id" },
					{ table: "retweets", column: "post_id" },
					{ table: "attachments", column: "post_id" },
					{ table: "bookmarks", column: "post_id" },
					{ table: "post_hashtags", column: "post_id" },
					{ table: "post_reactions", column: "post_id" },
					{ table: "interactive_cards", column: "post_id" },
					{ table: "fact_checks", column: "post_id" },
					{ table: "polls", column: "post_id" },
					{ table: "seen_tweets", column: "tweet_id" },
				];

				db.transaction(() => {
					adminQueries.updatePostId.run(rawNewId, post.id);
					for (const { table, column } of updates) {
						db.query(
							`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`,
						).run(rawNewId, post.id);
					}
					db.query("UPDATE posts SET reply_to = ? WHERE reply_to = ?").run(
						rawNewId,
						post.id,
					);
					db.query(
						"UPDATE posts SET quote_tweet_id = ? WHERE quote_tweet_id = ?",
					).run(rawNewId, post.id);
					db.query(
						"UPDATE notifications SET related_id = ? WHERE related_id = ?",
					).run(rawNewId, post.id);
					db.query(
						"UPDATE moderation_logs SET target_id = ? WHERE target_type = 'post' AND target_id = ?",
					).run(rawNewId, post.id);
					db.query(
						"UPDATE reports SET reported_id = ? WHERE reported_type = 'post' AND reported_id = ?",
					).run(rawNewId, post.id);
				})();

				logModerationAction(user.id, "change_tweet_id", "post", rawNewId, {
					old_id: post.id,
					new_id: rawNewId,
				});

				return { success: true, id: rawNewId };
			} catch (error) {
				console.error("Failed to update tweet ID", error);
				return { error: "Failed to update tweet ID" };
			}
		},
		{
			body: t.Object({
				new_id: t.String(),
			}),
		},
	)

	.post(
		"/tweets",
		async ({ body, user }) => {
			const isSuperAdmin = superAdminIds.includes(user.id);
			if (body.massTweet && !isSuperAdmin) {
				return { error: "SuperAdmin access required" };
			}
			const postId = Bun.randomUUIDv7();
			const targetUser = adminQueries.findUserById.get(body.userId);
			if (!targetUser) return { error: "User not found" };

			const noCharLimit = !!body.noCharLimit;

			const maxLength = targetUser.gold
				? 16500
				: targetUser.verified
					? 5500
					: 400;

			if (!body.content || body.content.trim().length === 0) {
				return { error: "Content is required" };
			}

			if (!noCharLimit && body.content.length > maxLength) {
				return { error: `Content must be ${maxLength} characters or less` };
			}

			const replyTo = body.replyTo || null;

			let createdAtForInsert = new Date().toISOString();
			if (body.created_at) {
				try {
					const parsed = new Date(body.created_at);
					if (Number.isNaN(parsed.getTime())) throw new Error("Invalid date");
					createdAtForInsert = parsed.toISOString();
				} catch (_err) {
					return { error: "Invalid created_at value" };
				}
			}

			adminQueries.createPostAsUser.run(
				postId,
				body.userId,
				body.content.trim(),
				replyTo,
				createdAtForInsert,
			);

			logModerationAction(user.id, "create_post_as_user", "post", postId, {
				targetUser: targetUser.username,
				content: body.content.substring(0, 100),
				replyTo,
				noCharLimit,
			});

			if (replyTo) {
				try {
					db.query(
						"UPDATE posts SET reply_count = reply_count + 1 WHERE id = ?",
					).run(replyTo);
				} catch (e) {
					console.error("Failed to update parent reply count:", e);
				}
			}

			return { success: true, id: postId };
		},
		{
			body: t.Object({
				userId: t.String(),
				content: t.String(),
				replyTo: t.Optional(t.String()),
				noCharLimit: t.Optional(t.Boolean()),
				created_at: t.Optional(t.String()),
				massTweet: t.Optional(t.Boolean()),
			}),
		},
	)

	.patch(
		"/users/:id",
		async ({ params, body, user: moderator, jwt }) => {
			// Tr Cursor // Opuadm cursor Tr Neutral Cursor
			const user = adminQueries.findUserById.get(params.id);
			if (!user) {
				return { error: "User not found" };
			}

			const trimmedUsername =
				body.username !== undefined
					? body.username === null
						? ""
						: String(body.username).trim()
					: undefined;

			if (trimmedUsername !== undefined) {
				if (!trimmedUsername.length) {
					return { error: "Username cannot be empty" };
				}
				if (/\s/.test(trimmedUsername)) {
					return { error: "Username cannot contain spaces" };
				}
				if (trimmedUsername !== user.username) {
					const existingUser =
						adminQueries.findUserByUsername.get(trimmedUsername);
					if (existingUser && existingUser.id !== params.id) {
						return { error: "Username already taken" };
					}
				}
			}

			const trimmedName =
				body.name !== undefined
					? body.name === null
						? ""
						: String(body.name).trim()
					: undefined;
			const nameToPersist =
				trimmedName !== undefined
					? trimmedName.length
						? trimmedName
						: null
					: user.name;

			const trimmedBio =
				body.bio !== undefined
					? body.bio === null
						? ""
						: String(body.bio).trim()
					: undefined;
			const bioToPersist =
				trimmedBio !== undefined
					? trimmedBio.length
						? trimmedBio
						: null
					: user.bio;

			const changes = {};
			const newUsername =
				trimmedUsername !== undefined ? trimmedUsername : user.username;
			if (newUsername !== user.username) {
				changes.username = { old: user.username, new: newUsername };
			}
			if (trimmedName !== undefined && nameToPersist !== user.name) {
				changes.name = { old: user.name, new: nameToPersist };
			}
			if (trimmedBio !== undefined && bioToPersist !== user.bio) {
				changes.bio = {
					old: user.bio?.substring(0, 50),
					new: bioToPersist?.substring(0, 50),
				};
			}

			let newVerified =
				body.verified !== undefined
					? body.verified
						? 1
						: 0
					: user.verified
						? 1
						: 0;
			let newGold =
				body.gold !== undefined ? (body.gold ? 1 : 0) : user.gold ? 1 : 0;
			if (newGold) newVerified = 0;
			if (newVerified) newGold = 0;
			if (body.verified !== undefined && body.verified !== user.verified) {
				changes.verified = { old: user.verified, new: body.verified };
			}
			if (body.gold !== undefined && body.gold !== user.gold) {
				changes.gold = { old: user.gold, new: body.gold };
			}

			const newAdminFlag =
				body.admin !== undefined ? (body.admin ? 1 : 0) : user.admin ? 1 : 0;
			if (body.admin !== undefined && body.admin !== user.admin) {
				changes.admin = { old: user.admin, new: body.admin };
			}

			let affiliateWith = user.affiliate_with;
			const newAffiliateFlag =
				body.affiliate !== undefined
					? body.affiliate
						? 1
						: 0
					: user.affiliate
						? 1
						: 0;
			if (body.affiliate !== undefined && body.affiliate !== user.affiliate) {
				changes.affiliate = { old: user.affiliate, new: body.affiliate };
			}

			const affiliateUsername =
				body.affiliate_with_username !== undefined
					? body.affiliate_with_username === null
						? ""
						: String(body.affiliate_with_username).trim()
					: undefined;

			if (newAffiliateFlag && affiliateUsername) {
				const affiliateUser = db
					.query("SELECT id FROM users WHERE LOWER(username) = LOWER(?)")
					.get(affiliateUsername);
				if (affiliateUser) {
					affiliateWith = affiliateUser.id;
					if (affiliateWith !== user.affiliate_with) {
						changes.affiliate_with = {
							old: user.affiliate_with,
							new: affiliateWith,
						};
					}
				}
			} else if (!newAffiliateFlag) {
				if (user.affiliate_with !== null) {
					changes.affiliate_with = { old: user.affiliate_with, new: null };
				}
				affiliateWith = null;
			}

			if (body.ghost_followers !== undefined) {
				const currentGhostFollowers = db
					.query(
						"SELECT COUNT(*) as count FROM ghost_follows WHERE follower_type = 'follower' AND target_id = ?",
					)
					.get(params.id).count;

				if (body.ghost_followers !== currentGhostFollowers) {
					const diff = body.ghost_followers - currentGhostFollowers;

					if (diff > 0) {
						const values = [];
						for (let i = 0; i < diff; i++) {
							values.push(
								`('${Bun.randomUUIDv7()}', 'follower', '${params.id}')`,
							);
						}
						if (values.length > 0) {
							db.exec(
								`INSERT INTO ghost_follows (id, follower_type, target_id) VALUES ${values.join(
									",",
								)}`,
							);
						}
					} else if (diff < 0) {
						const toRemove = Math.abs(diff);
						db.exec(
							`DELETE FROM ghost_follows WHERE id IN (SELECT id FROM ghost_follows WHERE follower_type = 'follower' AND target_id = '${params.id}' LIMIT ${toRemove})`,
						);
					}

					changes.ghost_followers = {
						old: currentGhostFollowers,
						new: body.ghost_followers,
					};
				}
			}

			if (body.ghost_following !== undefined) {
				const currentGhostFollowing = db
					.query(
						"SELECT COUNT(*) as count FROM ghost_follows WHERE follower_type = 'following' AND target_id = ?",
					)
					.get(params.id).count;

				if (body.ghost_following !== currentGhostFollowing) {
					const diff = body.ghost_following - currentGhostFollowing;

					if (diff > 0) {
						const values = [];
						for (let i = 0; i < diff; i++) {
							values.push(
								`('${Bun.randomUUIDv7()}', 'following', '${params.id}')`,
							);
						}
						if (values.length > 0) {
							db.exec(
								`INSERT INTO ghost_follows (id, follower_type, target_id) VALUES ${values.join(
									",",
								)}`,
							);
						}
					} else if (diff < 0) {
						const toRemove = Math.abs(diff);
						db.exec(
							`DELETE FROM ghost_follows WHERE id IN (SELECT id FROM ghost_follows WHERE follower_type = 'following' AND target_id = '${params.id}' LIMIT ${toRemove})`,
						);
					}

					changes.ghost_following = {
						old: currentGhostFollowing,
						new: body.ghost_following,
					};
				}
			}

			const newCharacterLimit =
				body.character_limit !== undefined
					? body.character_limit
					: user.character_limit;
			if (body.character_limit !== undefined) {
				if (newCharacterLimit !== user.character_limit) {
					changes.character_limit = {
						old: user.character_limit,
						new: newCharacterLimit,
					};
				}
			}

			if (
				body.force_follow_usernames &&
				Array.isArray(body.force_follow_usernames)
			) {
				const followedUsers = [];
				const pendingUsers = [];
				const failedUsers = [];

				for (const usernameRaw of body.force_follow_usernames) {
					const username =
						typeof usernameRaw === "string" ? usernameRaw.trim() : "";
					if (!username) continue;

					const targetUser = db
						.query("SELECT id FROM users WHERE LOWER(username) = LOWER(?)")
						.get(username);

					if (!targetUser) {
						const forcedId = Bun.randomUUIDv7();
						db.query(
							"INSERT INTO forced_follows (id, follower_id, following_id) VALUES (?, ?, ?)",
						).run(forcedId, params.id, username);
						pendingUsers.push(username);
						continue;
					}

					if (targetUser.id === params.id) {
						failedUsers.push(`${username} (cannot follow self)`);
						continue;
					}

					const blocked = db
						.query(
							"SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)",
						)
						.get(params.id, targetUser.id, targetUser.id, params.id);

					if (blocked) {
						failedUsers.push(`${username} (blocked)`);
						continue;
					}

					const existing = db
						.query(
							"SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?",
						)
						.get(targetUser.id, params.id);

					if (!existing) {
						const followId = Bun.randomUUIDv7();
						db.query(
							"INSERT INTO follows (id, follower_id, following_id) VALUES (?, ?, ?)",
						).run(followId, targetUser.id, params.id);
						followedUsers.push(username);
					}
				}

				if (followedUsers.length > 0 || pendingUsers.length > 0) {
					changes.forced_follows = {
						added: followedUsers.length > 0 ? followedUsers : undefined,
						pending: pendingUsers.length > 0 ? pendingUsers : undefined,
						failed: failedUsers.length > 0 ? failedUsers : undefined,
					};
				}
			}

			let newUserCreatedAt = user.created_at;
			if (body.created_at !== undefined) {
				try {
					const parsed = new Date(body.created_at);
					if (Number.isNaN(parsed.getTime())) throw new Error("Invalid date");
					newUserCreatedAt = parsed.toISOString();
					if (newUserCreatedAt !== user.created_at) {
						changes.created_at = {
							old: user.created_at,
							new: newUserCreatedAt,
						};
					}
				} catch (_err) {
					return { error: "Invalid created_at value" };
				}
			}

			const normalizeTransparencyValue = (value) => {
				if (value === undefined) return undefined;
				if (value === null) return null;
				if (typeof value === "string") {
					const trimmed = value.trim();
					return trimmed.length ? trimmed : null;
				}
				const asString = `${value}`.trim();
				return asString.length ? asString : null;
			};

			const parseTransparency = (raw) => {
				if (!raw) return null;
				try {
					return JSON.parse(raw);
				} catch (_err) {
					return null;
				}
			};

			const hasTransparencyValue = (record) => {
				if (!record) return false;
				for (const key of [
					"city",
					"country",
					"latitude",
					"longitude",
					"timezone",
					"continent",
					"vpn",
					"suppress_vpn_warning",
					"preserve_override",
				]) {
					if (
						record[key] !== null &&
						record[key] !== undefined &&
						record[key] !== ""
					) {
						return true;
					}
				}
				return false;
			};

			const serializeTransparency = (record) => {
				if (!record) return null;
				return hasTransparencyValue(record) ? JSON.stringify(record) : null;
			};

			const updateTransparencyField = (
				target,
				key,
				inputValue,
				markChanged,
			) => {
				const normalized = normalizeTransparencyValue(inputValue);
				const previous = target ? (target[key] ?? null) : null;
				if (previous === normalized) {
					return target;
				}
				const nextTarget = target ? target : {};
				nextTarget[key] = normalized;
				markChanged();
				return nextTarget;
			};

			let creationTransparency = parseTransparency(
				user.account_creation_transparency,
			);
			let loginTransparency = parseTransparency(
				user.account_login_transparency,
			);
			let creationTransparencyChanged = false;
			let loginTransparencyChanged = false;

			if (body.creation_tor !== undefined) {
				const torFlag = !!body.creation_tor;
				const prevIsTor = creationTransparency?.country === "T1";
				if (torFlag && !prevIsTor) {
					if (!creationTransparency) creationTransparency = {};
					if (creationTransparency.country !== "T1") {
						creationTransparency.country = "T1";
						creationTransparencyChanged = true;
					}
					if (
						creationTransparency.city !== null &&
						creationTransparency.city !== undefined
					) {
						creationTransparency.city = null;
						creationTransparencyChanged = true;
					}
					if (
						creationTransparency.latitude !== null &&
						creationTransparency.latitude !== undefined
					) {
						creationTransparency.latitude = null;
						creationTransparencyChanged = true;
					}
					if (
						creationTransparency.longitude !== null &&
						creationTransparency.longitude !== undefined
					) {
						creationTransparency.longitude = null;
						creationTransparencyChanged = true;
					}
				}
				if (!torFlag && prevIsTor) {
					if (!creationTransparency) creationTransparency = {};
					creationTransparency.country = null;
					creationTransparencyChanged = true;
				}
			}

			if (body.login_tor !== undefined) {
				const torFlag = !!body.login_tor;
				const prevIsTor = loginTransparency?.country === "T1";
				if (torFlag && !prevIsTor) {
					if (!loginTransparency) loginTransparency = {};
					if (loginTransparency.country !== "T1") {
						loginTransparency.country = "T1";
						loginTransparencyChanged = true;
					}
					if (
						loginTransparency.city !== null &&
						loginTransparency.city !== undefined
					) {
						loginTransparency.city = null;
						loginTransparencyChanged = true;
					}
					if (
						loginTransparency.latitude !== null &&
						loginTransparency.latitude !== undefined
					) {
						loginTransparency.latitude = null;
						loginTransparencyChanged = true;
					}
					if (
						loginTransparency.longitude !== null &&
						loginTransparency.longitude !== undefined
					) {
						loginTransparency.longitude = null;
						loginTransparencyChanged = true;
					}
				}
				if (!torFlag && prevIsTor) {
					if (!loginTransparency) loginTransparency = {};
					loginTransparency.country = null;
					loginTransparencyChanged = true;
				}
			}

			const creationLocationFields = [
				["creation_city", "city"],
				["creation_country", "country"],
				["creation_latitude", "latitude"],
				["creation_longitude", "longitude"],
			];

			for (const [bodyKey, fieldKey] of creationLocationFields) {
				if (body[bodyKey] === undefined) continue;
				if (creationTransparency?.country === "T1") continue;
				creationTransparency = updateTransparencyField(
					creationTransparency,
					fieldKey,
					body[bodyKey],
					() => {
						creationTransparencyChanged = true;
					},
				);
			}

			const loginLocationFields = [
				["login_city", "city"],
				["login_country", "country"],
				["login_latitude", "latitude"],
				["login_longitude", "longitude"],
			];

			for (const [bodyKey, fieldKey] of loginLocationFields) {
				if (body[bodyKey] === undefined) continue;
				if (loginTransparency?.country === "T1") continue;
				loginTransparency = updateTransparencyField(
					loginTransparency,
					fieldKey,
					body[bodyKey],
					() => {
						loginTransparencyChanged = true;
					},
				);
			}

			if (body.creation_timezone !== undefined) {
				creationTransparency = updateTransparencyField(
					creationTransparency,
					"timezone",
					body.creation_timezone,
					() => {
						creationTransparencyChanged = true;
					},
				);
			}

			if (body.login_timezone !== undefined) {
				loginTransparency = updateTransparencyField(
					loginTransparency,
					"timezone",
					body.login_timezone,
					() => {
						loginTransparencyChanged = true;
					},
				);
			}

			if (body.creation_hide_datacenter_warning !== undefined) {
				const shouldSuppress = !!body.creation_hide_datacenter_warning;
				if (!creationTransparency && shouldSuppress) {
					creationTransparency = {};
				}
				if (creationTransparency) {
					const previous = !!creationTransparency.suppress_vpn_warning;
					if (shouldSuppress && !previous) {
						creationTransparency.suppress_vpn_warning = true;
						creationTransparencyChanged = true;
					} else if (!shouldSuppress && previous) {
						delete creationTransparency.suppress_vpn_warning;
						creationTransparencyChanged = true;
					}
				}
			}

			if (body.login_hide_datacenter_warning !== undefined) {
				const shouldSuppress = !!body.login_hide_datacenter_warning;
				if (!loginTransparency && shouldSuppress) {
					loginTransparency = {};
				}
				if (loginTransparency) {
					const previous = !!loginTransparency.suppress_vpn_warning;
					if (shouldSuppress && !previous) {
						loginTransparency.suppress_vpn_warning = true;
						loginTransparencyChanged = true;
					} else if (!shouldSuppress && previous) {
						delete loginTransparency.suppress_vpn_warning;
						loginTransparencyChanged = true;
					}
				}
			}

			if (body.login_preserve_override !== undefined) {
				const shouldPreserve = !!body.login_preserve_override;
				if (!loginTransparency && shouldPreserve) {
					loginTransparency = {};
				}
				if (loginTransparency) {
					const previous = !!loginTransparency.preserve_override;
					if (shouldPreserve && !previous) {
						loginTransparency.preserve_override = true;
						loginTransparencyChanged = true;
					} else if (!shouldPreserve && previous) {
						delete loginTransparency.preserve_override;
						loginTransparencyChanged = true;
					}
				}
			}

			const nextCreationTransparency = creationTransparencyChanged
				? serializeTransparency(creationTransparency)
				: user.account_creation_transparency;
			const nextLoginTransparency = loginTransparencyChanged
				? serializeTransparency(loginTransparency)
				: user.account_login_transparency;

			if (nextCreationTransparency !== user.account_creation_transparency) {
				changes.account_creation_transparency = {
					old: user.account_creation_transparency,
					new: nextCreationTransparency,
				};
			}
			if (nextLoginTransparency !== user.account_login_transparency) {
				changes.account_login_transparency = {
					old: user.account_login_transparency,
					new: nextLoginTransparency,
				};
			}

			adminQueries.updateUser.run(
				newUsername,
				nameToPersist,
				bioToPersist,
				newVerified,
				newAdminFlag,
				newGold,
				user.follower_count || 0,
				user.following_count || 0,
				newCharacterLimit,
				newUserCreatedAt,
				nextCreationTransparency,
				nextLoginTransparency,
				params.id,
			);

			db.query(
				"UPDATE users SET affiliate = ?, affiliate_with = ? WHERE id = ?",
			).run(newAffiliateFlag, affiliateWith, params.id);

			logModerationAction(
				moderator.id,
				"edit_user_profile",
				"user",
				params.id,
				{ username: user.username, changes },
			);

			const response = { success: true };

			if (moderator.id === params.id) {
				response.updatedUser = {
					username: newUsername,
					name: nameToPersist,
					bio: bioToPersist,
					verified: !!newVerified,
					gold: !!newGold,
					admin: !!newAdminFlag,
					affiliate: !!newAffiliateFlag,
					affiliate_with: affiliateWith,
					character_limit: newCharacterLimit,
				};

				if (newUsername !== user.username) {
					const issuedAt = Math.floor(Date.now() / 1000);
					response.token = await jwt.sign({
						userId: params.id,
						username: newUsername,
						iat: issuedAt,
						exp: issuedAt + 7 * 24 * 60 * 60,
					});
				}
			}

			return response;
		},
		{
			detail: {
				description: "Updates a user's profile and settings",
			},
			params: t.Object({
				id: t.String(),
			}),
			body: t.Object({
				username: t.Optional(t.String()),
				name: t.Optional(t.Union([t.String(), t.Null()])),
				bio: t.Optional(t.Union([t.String(), t.Null()])),
				verified: t.Optional(t.Boolean()),
				gold: t.Optional(t.Boolean()),
				admin: t.Optional(t.Boolean()),
				affiliate: t.Optional(t.Boolean()),
				affiliate_with_username: t.Optional(t.Union([t.String(), t.Null()])),
				ghost_followers: t.Optional(t.Number()),
				ghost_following: t.Optional(t.Number()),
				character_limit: t.Optional(t.Union([t.Number(), t.Null()])),
				created_at: t.Optional(t.String()),
				force_follow_usernames: t.Optional(t.Array(t.String())),
				login_city: t.Optional(t.Union([t.String(), t.Null()])),
				login_country: t.Optional(t.Union([t.String(), t.Null()])),
				login_latitude: t.Optional(t.Union([t.String(), t.Null()])),
				login_longitude: t.Optional(t.Union([t.String(), t.Null()])),
				login_timezone: t.Optional(t.Union([t.String(), t.Null()])),
				login_tor: t.Optional(t.Boolean()),
				login_hide_datacenter_warning: t.Optional(t.Boolean()),
				login_preserve_override: t.Optional(t.Boolean()),
				creation_city: t.Optional(t.Union([t.String(), t.Null()])),
				creation_country: t.Optional(t.Union([t.String(), t.Null()])),
				creation_latitude: t.Optional(t.Union([t.String(), t.Null()])),
				creation_longitude: t.Optional(t.Union([t.String(), t.Null()])),
				creation_hide_datacenter_warning: t.Optional(t.Boolean()),
				creation_timezone: t.Optional(t.Union([t.String(), t.Null()])),
				creation_tor: t.Optional(t.Boolean()),
			}),
			response: t.Any(),
		},
	)

	.post(
		"/impersonate/:id",
		async ({ params, jwt, user }) => {
			const targetUser = adminQueries.findUserById.get(params.id);
			if (!targetUser) {
				return { error: "User not found" };
			}

			if (
				targetUser.admin &&
				!process.env.SUPERADMIN_IDS?.split(";")?.includes(user.id)
			) {
				return { error: "Cannot impersonate admin users" };
			}

			const impersonationToken = await jwt.sign({
				userId: targetUser.id,
				username: targetUser.username,
				iat: Math.floor(Date.now() / 1000),
				exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
			});

			return {
				success: true,
				token: impersonationToken,
				user: {
					id: targetUser.id,
					username: targetUser.username,
					name: targetUser.name,
				},
				copyLink: `${
					process.env.BASE_URL || "http://localhost:3000"
				}/?impersonate=${encodeURIComponent(impersonationToken)}`,
			};
		},
		{
			detail: {
				description: "Creates an impersonation token for a user",
			},
			params: t.Object({
				id: t.String(),
			}),
			response: t.Any(),
		},
	)

	.get(
		"/dms",
		async ({ query }) => {
			const page = Math.max(1, Number.parseInt(query.page || "1", 10));
			const limit = Math.min(
				50,
				Math.max(1, Number.parseInt(query.limit || "20", 10)),
			);
			const offset = (page - 1) * limit;

			const conversations = adminQueries.getAllConversations.all(limit, offset);
			const totalCount = adminQueries.getConversationsCount.get().count;

			return {
				conversations,
				pagination: {
					page,
					limit,
					total: totalCount,
					pages: Math.ceil(totalCount / limit),
				},
			};
		},
		{
			detail: {
				description: "Lists all DM conversations with pagination",
			},
			query: t.Object({
				page: t.Optional(t.String()),
				limit: t.Optional(t.String()),
			}),
			response: t.Any(),
		},
	)

	.get(
		"/dms/search",
		async ({ query }) => {
			const username = query.username;
			if (!username) {
				return { error: "Username parameter required" };
			}

			const page = Math.max(1, Number.parseInt(query.page || "1", 10)); // stuck cursor
			const limit = Math.min(
				50,
				Math.max(1, Number.parseInt(query.limit || "20", 10)),
			);
			const offset = (page - 1) * limit;

			const conversations = adminQueries.searchConversationsByUser.all(
				`%${username}%`,
				limit,
				offset,
			);

			return { conversations };
		},
		{
			detail: {
				description: "Searches DM conversations by username",
			},
			query: t.Object({
				username: t.String(),
				page: t.Optional(t.String()),
				limit: t.Optional(t.String()),
			}),
			response: t.Any(),
		},
	)

	.get(
		"/dms/:id",
		async ({ params }) => {
			const conversation = adminQueries.getConversationDetails.get(params.id);
			if (!conversation) {
				return { error: "Conversation not found" };
			}

			return { conversation };
		},
		{
			detail: {
				description: "Gets details for a specific DM conversation",
			},
			params: t.Object({
				id: t.String(),
			}),
			response: t.Any(),
		},
	)

	.get(
		"/dms/:id/messages",
		async ({ params, query }) => {
			const conversation = adminQueries.getConversationDetails.get(params.id);
			if (!conversation) {
				return { error: "Conversation not found" };
			}

			const page = Math.max(1, Number.parseInt(query.page || "1", 10));
			const limit = Math.min(
				100,
				Math.max(1, Number.parseInt(query.limit || "20", 10)),
			);
			const offset = (page - 1) * limit;

			const messages = adminQueries.getConversationMessages.all(
				params.id,
				limit,
				offset,
			);
			const totalCount = adminQueries.getConversationMessagesCount.get(
				params.id,
			).count;

			for (const message of messages) {
				message.attachments = adminQueries.getMessageAttachments.all(
					message.id,
				);
			}

			return {
				conversation,
				messages,
				pagination: {
					page,
					limit,
					total: totalCount,
					pages: Math.ceil(totalCount / limit),
				},
			};
		},
		{
			detail: {
				description: "Gets messages for a specific DM conversation",
			},
			params: t.Object({
				id: t.String(),
			}),
			query: t.Object({
				page: t.Optional(t.String()),
				limit: t.Optional(t.String()),
			}),
			response: t.Any(),
		},
	)

	.delete(
		"/dms/:id",
		async ({ params, user }) => {
			const conversation = adminQueries.getConversationDetails.get(params.id);
			if (!conversation) {
				return { error: "Conversation not found" };
			}

			adminQueries.deleteConversation.run(params.id);
			logModerationAction(
				user.id,
				"delete_conversation",
				"conversation",
				params.id,
				{ conversation: conversation.participants },
			);
			return { success: true };
		},
		{
			detail: {
				description: "Deletes a DM conversation",
			},
			params: t.Object({
				id: t.String(),
			}),
			response: t.Any(),
		},
	)

	.delete(
		"/dms/messages/:id",
		async ({ params, user }) => {
			adminQueries.deleteMessage.run(params.id);
			logModerationAction(user.id, "delete_message", "message", params.id, {});
			return { success: true };
		},
		{
			detail: {
				description: "Deletes a DM message",
			},
			params: t.Object({
				id: t.String(),
			}),
			response: t.Any(),
		},
	)

	.post(
		"/fake-notification",
		async ({ body, user }) => {
			const {
				target,
				type = "default",
				title = null,
				message,
				subtitle = null,
				url,
				customIcon,
			} = body || {};

			if (!target) return { error: "target is required" };
			if (!title && !subtitle && !message)
				return {
					error: "At least one of title, subtitle, or message is required",
				};

			const subtitleText = subtitle?.trim() || null;
			const urlText = url?.trim() || null;

			let customIconMeta = null;
			if (customIcon) {
				if (customIcon.kind === "image") {
					const hash =
						typeof customIcon.hash === "string" ? customIcon.hash.trim() : "";
					let iconUrl =
						typeof customIcon.url === "string" ? customIcon.url.trim() : "";
					if (!hash || !/^[a-f0-9]+$/i.test(hash)) {
						return { error: "Invalid custom icon hash" };
					}
					if (iconUrl) {
						if (
							!iconUrl.startsWith("/api/uploads/") ||
							!iconUrl.includes(hash)
						) {
							return { error: "Invalid custom icon URL" };
						}
					} else {
						iconUrl = `/api/uploads/${hash}.webp`;
					}
					customIconMeta = { kind: "image", hash, url: iconUrl };
				} else if (customIcon.kind === "svg") {
					const markup = sanitizeSvgMarkup(customIcon.markup);
					if (!markup) return { error: "Invalid SVG markup" };
					const dataUri = `data:image/svg+xml;base64,${Buffer.from(
						markup,
						"utf8",
					).toString("base64")}`;
					customIconMeta = { kind: "svg", dataUri };
				} else {
					return { error: "Unsupported custom icon type" };
				}
			}

			let targetIds = [];

			if (target === "all") {
				const rows = db.query("SELECT id FROM users").all();
				targetIds = rows.map((r) => r.id);
			} else if (Array.isArray(target)) {
				for (const username of target) {
					const u = adminQueries.findUserByUsername.get(username);
					if (u) targetIds.push(u.id);
				}
			} else if (typeof target === "string") {
				const u = adminQueries.findUserByUsername.get(target);
				if (u) targetIds.push(u.id);
			}

			if (targetIds.length === 0) return { error: "No target users found" };

			const content = title || subtitleText || message || "";

			let encodedMeta = null;
			const metaPayload = {};
			if (subtitleText) metaPayload.subtitle = subtitleText;
			if (urlText) metaPayload.url = urlText;
			if (customIconMeta) metaPayload.customIcon = customIconMeta;
			if (Object.keys(metaPayload).length > 0) {
				encodedMeta = Buffer.from(JSON.stringify(metaPayload), "utf8").toString(
					"base64",
				);
			}

			const created = [];
			for (const userId of targetIds) {
				try {
					const relatedId = encodedMeta ? `meta:${encodedMeta}` : null;

					const nid = addNotification(
						userId,
						type,
						content,
						relatedId,
						null,
						null,
						null,
					);
					created.push(nid);
				} catch (e) {
					console.error("Failed to create notification for", userId, e);
				}
			}

			try {
				logModerationAction(
					user.id,
					"fake_notification",
					"notifications",
					null,
					{
						targets: targetIds.length,
						type,
						created: created.length,
						custom_icon_kind: customIconMeta?.kind || null,
					},
				);
			} catch {}

			return { success: true, created: created.length };
		},
		{
			body: t.Object({
				target: t.Union([t.String(), t.Array(t.String())]),
				type: t.Optional(t.String()),
				title: t.Optional(t.String()),
				message: t.Optional(t.String()),
				subtitle: t.Optional(t.String()),
				url: t.Optional(t.String()),
				customIcon: t.Optional(
					t.Object({
						kind: t.Union([t.Literal("image"), t.Literal("svg")]),
						hash: t.Optional(t.String()),
						url: t.Optional(t.String()),
						markup: t.Optional(t.String()),
					}),
				),
			}),
		},
	)

	.get(
		"/moderation-logs",
		async ({ query }) => {
			const page = parseInt(query.page, 10) || 1;
			const limit = parseInt(query.limit, 10) || 50;
			const offset = (page - 1) * limit;
			const search = query.search ? `%${query.search}%` : null;

			let logs, totalCount;

			if (search) {
				logs = adminQueries.searchModerationLogs.all(
					search,
					search,
					search,
					search,
					search,
					search,
					limit,
					offset,
				);
				totalCount = adminQueries.searchModerationLogsCount.get(
					search,
					search,
					search,
					search,
					search,
					search,
				);
			} else {
				logs = adminQueries.getModerationLogs.all(limit, offset);
				totalCount = adminQueries.getModerationLogsCount.get();
			}

			const logsWithDetails = logs.map((log) => ({
				...log,
				details: log.details ? JSON.parse(log.details) : null,
			}));

			return {
				logs: logsWithDetails,
				pagination: {
					page,
					limit,
					total: totalCount.count,
					pages: Math.ceil(totalCount.count / limit),
				},
			};
		},
		{
			detail: {
				description: "Lists moderation logs with pagination",
			},
			query: t.Object({
				page: t.Optional(t.String()),
				limit: t.Optional(t.String()),
				search: t.Optional(t.String()),
			}),
			response: t.Any(),
		},
	)

	.get(
		"/moderation-logs/target/:id",
		async ({ params }) => {
			const logs = adminQueries.getModerationLogsByTarget.all(params.id);
			const logsWithDetails = logs.map((log) => ({
				...log,
				details: log.details ? JSON.parse(log.details) : null,
			}));
			return { logs: logsWithDetails };
		},
		{
			detail: {
				description: "Gets moderation logs for a specific target",
			},
			params: t.Object({
				id: t.String(),
			}),
			response: t.Any(),
		},
	)

	.get(
		"/moderation-logs/moderator/:id",
		async ({ params, query }) => {
			const page = parseInt(query.page, 10) || 1;
			const limit = parseInt(query.limit, 10) || 50;
			const offset = (page - 1) * limit;

			const logs = adminQueries.getModerationLogsByModerator.all(
				params.id,
				limit,
				offset,
			);
			const logsWithDetails = logs.map((log) => ({
				...log,
				details: log.details ? JSON.parse(log.details) : null,
			}));
			return { logs: logsWithDetails };
		},
		{
			detail: {
				description: "Gets moderation logs for a specific moderator",
			},
			params: t.Object({
				id: t.String(),
			}),
			query: t.Object({
				page: t.Optional(t.String()),
				limit: t.Optional(t.String()),
			}),
			response: t.Any(),
		},
	)

	.get(
		"/emojis",
		async () => {
			const emojis = adminQueries.getAllEmojis.all();
			return { emojis };
		},
		{
			detail: {
				description: "Lists all custom emojis",
			},
			response: t.Object({
				emojis: t.Array(t.Any()),
			}),
		},
	)

	.post(
		"/emojis",
		async ({ body, user }) => {
			const { name, file_hash, file_url } = body || {};
			if (!name || !name.trim()) return { error: "Emoji name is required" };

			const sanitized = name.trim();
			const existing = adminQueries.getEmojiByName.get(sanitized);
			if (existing) return { error: "Emoji with that name already exists" };

			const id = Bun.randomUUIDv7();

			try {
				adminQueries.createEmoji.run(
					id,
					sanitized,
					file_hash || null,
					file_url || null,
					user.id || null,
				);
				logModerationAction(user.id, "create_emoji", "emoji", id, {
					name: sanitized,
				});
				return { success: true, id };
			} catch (e) {
				console.error("Failed to create emoji", e);
				return { error: "Failed to create emoji" };
			}
		},
		{
			body: t.Object({
				name: t.String(),
				file_hash: t.Optional(t.String()),
				file_url: t.Optional(t.String()),
			}),
		},
	)

	.delete(
		"/emojis/:id",
		async ({ params, user }) => {
			const e = adminQueries.getEmojiById.get(params.id);
			if (!e) return { error: "Emoji not found" };
			adminQueries.deleteEmoji.run(params.id);
			logModerationAction(user.id, "delete_emoji", "emoji", params.id, {
				name: e.name,
			});
			return { success: true };
		},
		{
			detail: {
				description: "Deletes a custom emoji",
			},
			params: t.Object({
				id: t.String(),
			}),
			response: t.Any(),
		},
	)

	.post(
		"/fact-check/:postId",
		async ({ params, body, user }) => {
			const { note, severity = "warning" } = body;
			if (!note || note.trim().length === 0) {
				return { error: "Note is required" };
			}

			const post = db
				.query("SELECT * FROM posts WHERE id = ?")
				.get(params.postId);
			if (!post) return { error: "Post not found" };

			const existing = adminQueries.getFactCheck.get(params.postId);
			if (existing) {
				return { error: "Fact-check already exists for this post" };
			}

			const id = Bun.randomUUIDv7();
			adminQueries.createFactCheck.run(
				id,
				params.postId,
				user.id,
				note.trim(),
				severity,
			);

			const interactedUsers = adminQueries.getPostInteractions.all(
				params.postId,
				params.postId,
				params.postId,
				params.postId,
				params.postId,
			);

			for (const { user_id } of interactedUsers) {
				if (user_id !== post.user_id && user_id !== user.id) {
					addNotification(
						user_id,
						"fact_check",
						`A tweet you have interacted with has been marked as misleading`,
						params.postId,
						undefined,
						undefined,
						undefined,
					);
				}
			}

			if (post.user_id !== user.id) {
				addNotification(
					post.user_id,
					"fact_check",
					`Your post has been marked as misleading`,
					params.postId,
					undefined,
					undefined,
					undefined,
				);
			}

			logModerationAction(user.id, "add_fact_check", "post", params.postId, {
				note,
				severity,
			});

			return {
				success: true,
				factCheck: { id, post_id: params.postId, note, severity },
			};
		},
		{
			detail: {
				description: "Adds a fact-check warning to a post",
			},
			params: t.Object({
				postId: t.String(),
			}),
			body: t.Object({
				note: t.String(),
				severity: t.Optional(t.String()),
			}),
			response: t.Any(),
		},
	)

	.delete(
		"/fact-check/:id",
		async ({ params, user }) => {
			const factCheck = db
				.query("SELECT * FROM fact_checks WHERE id = ?")
				.get(params.id);
			if (!factCheck) return { error: "Fact-check not found" };

			adminQueries.deleteFactCheck.run(params.id);

			logModerationAction(
				user.id,
				"remove_fact_check",
				"post",
				factCheck.post_id,
				{},
			);

			return { success: true };
		},
		{
			detail: {
				description: "Removes a fact-check from a post",
			},
			params: t.Object({
				id: t.String(),
			}),
			response: t.Any(),
		},
	)

	.get(
		"/reports",
		async ({ query }) => {
			const limit = Number.parseInt(query.limit, 10) || 50;
			const offset = Number.parseInt(query.offset, 10) || 0;

			const totalRow = db.query("SELECT COUNT(*) AS count FROM reports").get();
			const totalReports = totalRow?.count || 0;

			const reports = db
				.query(
					`
      SELECT * FROM reports
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
				)
				.all(limit, offset);

			const getUser = db.query(
				"SELECT id, username, name, avatar FROM users WHERE id = ?",
			);
			const getPost = db.query(
				"SELECT id, user_id, content FROM posts WHERE id = ?",
			);

			const enrichedReports = reports.map((report) => {
				const reporter = getUser.get(report.reporter_id);
				let reported = null;

				if (report.reported_type === "user") {
					reported = getUser.get(report.reported_id);
				} else if (report.reported_type === "post") {
					reported = getPost.get(report.reported_id);
				}

				return {
					...report,
					reporter: reporter
						? {
								id: reporter.id,
								username: reporter.username,
								name: reporter.name,
								avatar: reporter.avatar,
							}
						: null,
					reported,
				};
			});

			return { reports: enrichedReports, total: totalReports };
		},
		{
			detail: {
				description: "Lists all reports with pagination",
			},
			query: t.Object({
				limit: t.Optional(t.String()),
				offset: t.Optional(t.String()),
			}),
			response: t.Any(),
		},
	)

	.post(
		"/reports/:id/resolve",
		async ({ params, body, user }) => {
			const { action, duration, note, banAction } = body; // severity deprecated
			const report = db
				.query("SELECT * FROM reports WHERE id = ?")
				.get(params.id);

			if (!report) return { error: "Report not found" };

			let resolutionAction = action;

			if (action === "ban_user" && report.reported_type === "user") {
				const reportedUser = db
					.query("SELECT * FROM users WHERE id = ?")
					.get(report.reported_id);

				if (!reportedUser) return { error: "Reported user not found" };

				// Validate state constraints
				if (
					reportedUser.suspended &&
					(banAction === "restrict" || banAction === "shadowban")
				) {
					return { error: "Cannot restrict or shadowban a suspended user" };
				}

				const suspensionId = Bun.randomUUIDv7();
				const expiresAt = duration
					? new Date(Date.now() + duration * 60 * 60 * 1000).toISOString()
					: null;
				const banActionToUse = banAction || "suspend";
				db.query(
					`
					INSERT INTO suspensions (id, user_id, suspended_by, reason, severity, action, expires_at)
					VALUES (?, ?, ?, ?, ?, ?, ?)
				`,
				).run(
					suspensionId,
					report.reported_id,
					user.id,
					report.reason,
					null,
					banActionToUse,
					expiresAt,
				);

				if (banActionToUse === "restrict") {
					adminQueries.updateUserRestricted.run(true, report.reported_id);
				} else if (banActionToUse === "shadowban") {
					db.query("UPDATE users SET shadowbanned = TRUE WHERE id = ?").run(
						report.reported_id,
					);
				} else {
					adminQueries.updateUserSuspended.run(true, report.reported_id);
				}

				const logAction =
					banActionToUse === "restrict"
						? "restrict_user"
						: banActionToUse === "shadowban"
							? "shadowban_user"
							: "suspend_user";
				logModerationAction(user.id, logAction, "user", report.reported_id, {
					reportId: params.id,
					duration,
					action: banActionToUse,
				});
			} else if (action === "delete_post" && report.reported_type === "post") {
				const post = db
					.query("SELECT user_id FROM posts WHERE id = ?")
					.get(report.reported_id);

				db.query("DELETE FROM posts WHERE id = ?").run(report.reported_id);

				logModerationAction(
					user.id,
					"delete_post",
					"post",
					report.reported_id,
					{
						reportId: params.id,
					},
				);

				if (post) {
					addNotification(
						post.user_id,
						"post_deleted",
						"Your post was deleted due to a violation",
						null,
						null,
						null,
						null,
					);
				}
			} else if (
				action === "fact_check" &&
				report.reported_type === "post" &&
				note
			) {
				const factCheckId = Bun.randomUUIDv7();
				db.query(
					`INSERT INTO fact_checks (id, post_id, created_by, note, severity) VALUES (?, ?, ?, ?, ?)`,
				).run(
					factCheckId,
					report.reported_id,
					user.id,
					note,
					severity || "warning",
				);

				logModerationAction(user.id, "fact_check", "post", report.reported_id, {
					reportId: params.id,
					note,
					severity,
				});
			} else if (action === "ban_reporter") {
				const banId = Bun.randomUUIDv7();
				db.query(
					`INSERT INTO report_bans (id, user_id, banned_by, reason) VALUES (?, ?, ?, ?)`,
				).run(banId, report.reporter_id, user.id, "Abusing report system");

				logModerationAction(
					user.id,
					"ban_reporter",
					"user",
					report.reporter_id,
					{
						reportId: params.id,
					},
				);

				resolutionAction = "banned_reporter";
			} else if (action === "ignore") {
				resolutionAction = "ignored";
			} else {
				return { error: "Invalid action or missing required fields" };
			}

			db.query(
				`
        UPDATE reports
        SET status = ?, resolved_by = ?, resolved_at = datetime('now', 'utc'), resolution_action = ?
        WHERE id = ?
      `,
			).run("resolved", user.id, resolutionAction, params.id);

			if (action !== "ignore") {
				let notificationMessage = "";
				if (action === "ban_user") {
					notificationMessage = "Report resolved: User suspended";
				} else if (action === "delete_post") {
					notificationMessage = "Report resolved: Post deleted";
				} else if (action === "fact_check") {
					notificationMessage = "Report resolved: Fact-check added";
				} else if (action === "ban_reporter") {
					notificationMessage = "Your report was marked as abuse";
				}

				if (notificationMessage) {
					addNotification(
						report.reporter_id,
						"report_resolved",
						notificationMessage,
						params.id,
						null,
						null,
						null,
					);
				}
			}

			return { success: true };
		},
		{
			body: t.Object({
				action: t.String(),
				duration: t.Optional(t.Number()),
				severity: t.Optional(t.Number()),
				note: t.Optional(t.String()),
			}),
		},
	)

	.get("/extensions", async () => {
		const dbRows = extensionQueries.listAll.all();
		const managed = dbRows.map(formatExtensionRecord);

		// Discover manual ext/ folders and include them as un-managed entries
		const manual = [];
		try {
			const dirents = await fs.readdir(extensionsInstallDir, {
				withFileTypes: true,
			});
			// Keep a quick lookup for managed records by install_dir.
			const managedByDir = new Map(managed.map((r) => [r.install_dir, r]));
			for (const d of dirents) {
				if (!d.isDirectory()) continue;
				const name = d.name;
				// If a managed record has the same install_dir, normally this
				// would be the managed record we already included. However,
				// in some de-import edge cases the managed DB row might not
				// actually match the ext.json inside ext/<name>. If the ext
				// manifest id differs from the managed record's id, prefer
				// to show the manual entry as a reconstructed manual item.
				const managedRecord = managedByDir.get(name);
				const manifestPath = join(extensionsInstallDir, name, "ext.json");
				let content;
				try {
					content = await fs.readFile(manifestPath, "utf8");
				} catch {
					continue;
				}
				let json;
				try {
					json = JSON.parse(content);
				} catch {
					continue;
				}
				// If the manifest has an id that matches a managed DB row, skip manual entry.
				// Otherwise, treat this as a new manual extension with its directory as the id.
				if (managedRecord && json?.id && json.id === managedRecord.id) {
					// This directory corresponds to a managed DB row already
					// included above — skip it.
					continue;
				}
				try {
					const payload = buildManifestPayload(json);
					const fileEndpoint = `/api/extensions/${encodeURIComponent(name)}/file`;
					manual.push({
						id: name,
						name: payload.name || name,
						version: payload.version || "0.0.0",
						author: payload.author || null,
						summary: payload.summary || null,
						description: payload.description || null,
						website: payload.website || null,
						changelog_url: payload.changelog_url || null,
						root_file: payload.root_file,
						entry_type: payload.entry_type,
						styles: payload.styles || [],
						capabilities: payload.capabilities || [],
						targets: payload.targets || [],
						bundle_hash: null,
						fileEndpoint,
						enabled: false,
						managed: false,
						install_dir: name,
						settings_schema: payload.settings_schema || [],
					});
				} catch {
					// Provide a tolerant fallback for slightly malformed ext.json files
					try {
						const fileEndpoint = `/api/extensions/${encodeURIComponent(name)}/file`;
						const rootCandidate =
							json?.root_file ??
							json?.rootFile ??
							json?.main ??
							json?.entry ??
							"src/index.js";
						// Ensure root candidate looks like a src/ JS file
						if (
							typeof rootCandidate === "string" &&
							rootCandidate.startsWith("src/") &&
							rootCandidate.endsWith(".js")
						) {
							manual.push({
								id: name,
								name: json?.name || name,
								version: json?.version || "0.0.0",
								author: json?.author ?? null,
								summary: json?.summary ?? null,
								description: json?.description ?? null,
								website: json?.website ?? null,
								changelog_url: json?.changelog_url ?? null,
								root_file: rootCandidate,
								entry_type: json?.entry_type ?? json?.entryType ?? "module",
								styles: Array.isArray(json?.styles)
									? json.styles.filter(Boolean)
									: [],
								capabilities: Array.isArray(json?.capabilities)
									? json.capabilities
									: [],
								targets: Array.isArray(json?.targets) ? json.targets : [],
								bundle_hash: null,
								fileEndpoint,
								enabled: false,
								managed: false,
								install_dir: name,
								settings_schema: Array.isArray(json?.settings)
									? json.settings
									: [],
							});
						}
					} catch {}
				}
			}
		} catch {
			// ignore discovery errors
		}

		return { extensions: [...managed, ...manual] };
	})

	.get("/extensions/:id/settings", async ({ params, set }) => {
		const target = await resolveExtensionSettingsTarget(params.id);
		if (!target) {
			set.status = 404;
			return { error: "Extension not found" };
		}
		const row = extensionSettingsQueries.get.get(target.settingsKey);
		let settings = {};
		if (row?.settings) {
			try {
				settings = JSON.parse(row.settings) || {};
			} catch {
				settings = {};
			}
		}
		return { settings };
	})

	.put(
		"/extensions/:id/settings",
		async ({ params, body, user, set }) => {
			const target = await resolveExtensionSettingsTarget(params.id);
			if (!target) {
				set.status = 404;
				return { error: "Extension not found" };
			}
			if (typeof body !== "object" || body === null || Array.isArray(body)) {
				set.status = 400;
				return { error: "Settings payload must be an object" };
			}
			const serialized = JSON.stringify(body);
			if (serialized.length > 20000) {
				set.status = 400;
				return { error: "Settings payload is too large" };
			}
			extensionSettingsQueries.upsert.run(target.settingsKey, serialized);
			logModerationAction(
				user.id,
				"update_extension_settings",
				"extension",
				target.settingsKey,
				{
					keys: Object.keys(body || {}),
				},
			);
			return { success: true };
		},
		{
			body: t.Record(t.String(), t.Any()),
		},
	)

	.post("/extensions", async ({ body, user, set }) => {
		const packageFile = body?.package;
		if (!(packageFile instanceof File)) {
			set.status = 400;
			return { error: "A .tweeta file is required" };
		}

		const archiveName = packageFile.name?.toLowerCase?.();
		if (!archiveName?.endsWith?.(".tweeta")) {
			set.status = 400;
			return { error: "File must use the .tweeta extension" };
		}

		if (packageFile.size > MAX_EXTENSION_ARCHIVE_SIZE) {
			set.status = 400;
			return { error: "Extension archive exceeds the size limit" };
		}

		const archiveBuffer = new Uint8Array(await packageFile.arrayBuffer());
		let extractedEntries;
		// Quick sanity-check for ZIP magic header (PK..)
		if (!archiveBuffer || archiveBuffer.length < 4) {
			set.status = 400;
			return { error: "Invalid .tweeta archive (empty or too small)" };
		}
		try {
			const hdr0 = archiveBuffer[0];
			const hdr1 = archiveBuffer[1];
			const hdr2 = archiveBuffer[2];
			const hdr3 = archiveBuffer[3];
			// PK\x03\x04 or PK\x05\x06 (empty archive) or PK\x07\x08 are common
			if (hdr0 !== 0x50 || hdr1 !== 0x4b) {
				console.error("Uploaded archive does not start with PK signature", {
					firstBytes: [hdr0, hdr1, hdr2, hdr3],
				});
				set.status = 400;
				return {
					error:
						"Invalid .tweeta archive: not a ZIP file. Make sure you uploaded a standard ZIP renamed to .tweeta",
				};
			}
			extractedEntries = unzipSync(archiveBuffer);
		} catch (error) {
			console.error("Failed to unzip extension", error);
			set.status = 400;
			return {
				error:
					"Invalid or corrupted .tweeta archive (unzip failed). Ensure the file is a valid ZIP archive and not corrupted.",
			};
		}

		const manifestEntryName = Object.keys(extractedEntries).find(
			(key) => key.replace(/^\.\/+/, "").toLowerCase() === "ext.json",
		);
		if (!manifestEntryName) {
			set.status = 400;
			return { error: "ext.json manifest is missing" };
		}

		let manifestRaw;
		try {
			manifestRaw = JSON.parse(
				manifestDecoder.decode(extractedEntries[manifestEntryName]),
			);
		} catch (error) {
			console.error("Invalid manifest", error);
			set.status = 400;
			return { error: "ext.json must contain valid JSON" };
		}

		let manifest;
		try {
			manifest = buildManifestPayload(manifestRaw);
		} catch (error) {
			set.status = 400;
			return { error: error.message };
		}

		const duplicate = extensionQueries.getByNameVersion.get(
			manifest.name,
			manifest.version,
		);
		if (duplicate) {
			set.status = 400;
			return { error: "Extension with this name and version already exists" };
		}

		const bundleHasher = new Bun.CryptoHasher("sha256");
		bundleHasher.update(archiveBuffer);
		const bundleHash = bundleHasher.digest("hex");

		const extensionId = Bun.randomUUIDv7();
		const requestedDirName =
			sanitizeDirectorySegment(packageFile.name || "") ||
			`extension-${Date.now()}`;
		const extensionDir = join(extensionsInstallDir, requestedDirName);

		await fs.rm(extensionDir, { recursive: true, force: true });
		await fs.mkdir(extensionDir, { recursive: true });

		let extractedSize = 0;
		const writes = [];
		try {
			for (const [entryName, entryBody] of Object.entries(extractedEntries)) {
				if (entryName === manifestEntryName) continue;
				if (!entryBody?.length) continue;
				const sanitizedPath = sanitizeBundledFilePath(entryName);
				if (!sanitizedPath) continue;
				extractedSize += entryBody.length;
				if (extractedSize > MAX_EXTENSION_EXTRACTED_SIZE) {
					throw new Error("Extension contents exceed the size limit");
				}
				const destination = join(extensionDir, ...sanitizedPath.split("/"));
				await fs.mkdir(dirname(destination), { recursive: true });
				writes.push(fs.writeFile(destination, entryBody));
			}
			await Promise.all(writes);
			const rootAbsolute = join(extensionDir, ...manifest.root_file.split("/"));
			if (!(await Bun.file(rootAbsolute).exists())) {
				throw new Error("root_file was not found in the archive");
			}
			manifest.install_dir = requestedDirName;
			manifest.archive_name = packageFile.name || null;
			await fs.writeFile(
				join(extensionDir, "ext.json"),
				JSON.stringify(
					{
						id: extensionId,
						...manifest,
						original: manifestRaw ?? null,
					},
					null,
					2,
				),
			);
		} catch (error) {
			console.error("Failed to process extension files", error);
			await fs.rm(extensionDir, { recursive: true, force: true });
			set.status = 400;
			return { error: error.message || "Failed to install extension" };
		}

		const stylesJson = manifest.styles.length
			? JSON.stringify(manifest.styles)
			: null;
		const capabilitiesJson = manifest.capabilities.length
			? JSON.stringify(manifest.capabilities)
			: null;
		const targetsJson = manifest.targets.length
			? JSON.stringify(manifest.targets)
			: null;

		const manifestJson = JSON.stringify(manifest);

		try {
			extensionQueries.insert.run(
				extensionId,
				manifest.name,
				manifest.version,
				manifest.author,
				manifest.summary,
				manifest.description,
				manifest.changelog_url,
				manifest.website,
				manifest.root_file,
				manifest.entry_type,
				stylesJson,
				capabilitiesJson,
				targetsJson,
				bundleHash,
				manifestJson,
				1,
				user.id || null,
			);
		} catch (error) {
			console.error("Failed to record extension", error);
			await fs.rm(extensionDir, { recursive: true, force: true });
			set.status = 500;
			return { error: "Failed to store extension metadata" };
		}

		const record = extensionQueries.getById.get(extensionId);
		logModerationAction(
			user.id,
			"install_extension",
			"extension",
			extensionId,
			{
				name: manifest.name,
				version: manifest.version,
			},
		);
		return { success: true, extension: formatExtensionRecord(record) };
	})

	// Import a manual extension directory under ext/ into the DB so it can be managed
	.post("/extensions/import", async ({ body, user, set }) => {
		const dir = sanitizeDirectorySegment(body?.dir || "");
		if (!dir) {
			set.status = 400;
			return { error: "Invalid directory name" };
		}

		const manifestPath = join(extensionsInstallDir, dir, "ext.json");
		let content;
		try {
			content = await fs.readFile(manifestPath, "utf8");
		} catch {
			set.status = 404;
			return { error: "Manifest not found for directory" };
		}

		let json;
		try {
			json = JSON.parse(content);
		} catch {
			set.status = 400;
			return { error: "Invalid ext.json" };
		}

		let manifest;
		try {
			manifest = buildManifestPayload(json);
		} catch (err) {
			set.status = 400;
			return { error: err.message };
		}

		const duplicate = extensionQueries.getByNameVersion.get(
			manifest.name,
			manifest.version,
		);
		if (duplicate) {
			set.status = 400;
			return { error: "Extension with this name and version already exists" };
		}

		const extensionId = Bun.randomUUIDv7();
		// Ensure manifest stored in DB includes install_dir so managed records
		// reference the actual ext/<dir> directory on disk.
		manifest.install_dir = dir;
		const manifestJson = JSON.stringify(manifest);

		// Compute a stable bundle hash for imported manual directories
		const bundleHasher = new Bun.CryptoHasher("sha256");
		bundleHasher.update(dir);
		bundleHasher.update(content);
		const bundleHash = bundleHasher.digest("hex");
		const stylesJson = manifest.styles.length
			? JSON.stringify(manifest.styles)
			: null;
		const capabilitiesJson = manifest.capabilities.length
			? JSON.stringify(manifest.capabilities)
			: null;
		const targetsJson = manifest.targets.length
			? JSON.stringify(manifest.targets)
			: null;

		try {
			extensionQueries.insert.run(
				extensionId,
				manifest.name,
				manifest.version,
				manifest.author,
				manifest.summary,
				manifest.description,
				manifest.changelog_url,
				manifest.website,
				manifest.root_file,
				manifest.entry_type,
				stylesJson,
				capabilitiesJson,
				targetsJson,
				bundleHash,
				manifestJson,
				0,
				user.id || null,
			);
		} catch (err) {
			console.error("Failed to record imported extension", err);
			set.status = 500;
			return { error: "Failed to import extension" };
		}

		// If manual settings exist under the directory name, migrate them to the new managed id
		try {
			const manualSettings = extensionSettingsQueries.get.get(dir);
			if (manualSettings?.settings) {
				extensionSettingsQueries.upsert.run(
					extensionId,
					manualSettings.settings,
				);
				// remove manual settings so future reads use the managed id
				db.query("DELETE FROM extension_settings WHERE extension_id = ?").run(
					dir,
				);
			}
		} catch (e) {
			console.error("Failed to migrate manual extension settings", e);
		}

		// Optionally enrich the ext.json on disk with install metadata
		try {
			const enriched = { id: extensionId, install_dir: dir, ...manifest };
			await fs.writeFile(
				join(extensionsInstallDir, dir, "ext.json"),
				JSON.stringify(enriched, null, 2),
			);
		} catch {}

		const record = extensionQueries.getById.get(extensionId);
		logModerationAction(user.id, "import_extension", "extension", extensionId, {
			name: manifest.name,
			version: manifest.version,
			install_dir: dir,
		});
		return { success: true, extension: formatExtensionRecord(record) };
	})

	// Export an installed or manual extension directory as a .tweeta (zip) file
	.get("/extensions/:id/export", async ({ params, set }) => {
		// Locate directory: prefer DB manifest install_dir if present
		let dirName = null;
		const record = extensionQueries.getById.get(params.id);
		if (record) {
			dirName = parseJsonField(record.manifest_json, {})?.install_dir || null;
			// If managed but disabled, disallow export
			if (record && !record.enabled) {
				set.status = 403;
				return { error: "Extension is disabled" };
			}
		}

		if (!dirName) {
			// allow exporting manual ext/<dir>
			const candidate = params.id;
			if (!candidate || !/^[A-Za-z0-9._-]+$/.test(candidate)) {
				set.status = 404;
				return { error: "Extension not found" };
			}
			dirName = candidate;
		}

		const root = join(extensionsInstallDir, dirName);
		try {
			const exists = await fs
				.stat(root)
				.then(() => true)
				.catch(() => false);
			if (!exists) {
				set.status = 404;
				return { error: "Extension directory not found" };
			}
			// Read files recursively and populate zip entries
			const entries = {};
			const walk = async (base) => {
				const items = await fs.readdir(base, { withFileTypes: true });
				for (const it of items) {
					const p = join(base, it.name);
					if (it.isDirectory()) {
						await walk(p);
						continue;
					}
					const rel = relative(root, p).replace(/\\/g, "/");
					const data = await fs.readFile(p);
					entries[rel] = new Uint8Array(data);
				}
			};
			await walk(root);
			const zipped = zipSync(entries);
			const filenameBase = record
				? `${record.name.replace(/[^a-z0-9.-]+/gi, "_")}-${record.version}`
				: `${dirName}`;
			const headers = {
				"Content-Type": "application/zip",
				"Content-Disposition": `attachment; filename="${filenameBase}.tweeta"`,
			};
			return new Response(zipped, { headers });
		} catch (err) {
			console.error("Failed to export extension", err);
			set.status = 500;
			return { error: "Failed to export extension" };
		}
	})

	.patch(
		"/extensions/:id",
		async ({ params, body, user, set }) => {
			const record = extensionQueries.getById.get(params.id);
			if (!record) {
				set.status = 404;
				return { error: "Extension not found" };
			}

			const nextState = body.enabled ? 1 : 0;
			if (nextState === (record.enabled ? 1 : 0)) {
				return { success: true };
			}

			extensionQueries.updateEnabled.run(nextState, params.id);
			logModerationAction(
				user.id,
				nextState ? "enable_extension" : "disable_extension",
				"extension",
				params.id,
				{ name: record.name },
			);

			return { success: true };
		},
		{
			body: t.Object({ enabled: t.Boolean() }),
		},
	)

	.delete("/extensions/:id", async ({ params, user, set, query }) => {
		const record = extensionQueries.getById.get(params.id);
		if (!record) {
			set.status = 404;
			return { error: "Extension not found" };
		}

		extensionQueries.delete.run(params.id);
		const manifest = parseJsonField(record.manifest_json, {});
		const dirName = sanitizeDirectorySegment(manifest?.install_dir ?? "");
		const removeFiles =
			(query &&
				(query.remove_files === "1" || query.remove_files === "true")) ||
			false;
		if (removeFiles) {
			try {
				const primaryDir = resolveInstallDirectory(record);
				await fs.rm(primaryDir, { recursive: true, force: true });
				const legacyDir = join(legacyExtensionsDir, params.id);
				if (legacyDir !== primaryDir) {
					await fs.rm(legacyDir, { recursive: true, force: true });
				}
			} catch (error) {
				console.error("Failed to remove extension directory", error);
			}
			try {
				db.query("DELETE FROM extension_settings WHERE extension_id = ?").run(
					record.id,
				);
			} catch (error) {
				console.error("Failed to drop managed extension settings", error);
			}
		} else if (dirName) {
			try {
				const managedSettingsRow = extensionSettingsQueries.get.get(record.id);
				if (managedSettingsRow?.settings) {
					extensionSettingsQueries.upsert.run(
						dirName,
						managedSettingsRow.settings,
					);
				}
				db.query("DELETE FROM extension_settings WHERE extension_id = ?").run(
					record.id,
				);
			} catch (error) {
				console.error(
					"Failed to migrate extension settings to manual id",
					error,
				);
			}
			try {
				const manifestPath = join(extensionsInstallDir, dirName, "ext.json");
				const content = await fs.readFile(manifestPath, "utf8");
				let json;
				try {
					json = JSON.parse(content);
				} catch {
					json = {};
				}
				const manualManifest =
					typeof json.original === "object" && json.original
						? json.original
						: json;
				const nextManifest = {
					...manualManifest,
					install_dir: dirName,
				};
				delete nextManifest.id;
				await fs.writeFile(manifestPath, JSON.stringify(nextManifest, null, 2));
			} catch (error) {
				console.error("Failed to update ext.json after de-import", error);
			}
		} else {
			try {
				db.query("DELETE FROM extension_settings WHERE extension_id = ?").run(
					record.id,
				);
			} catch (error) {
				console.error("Failed to clean up extension settings", error);
			}
		}

		logModerationAction(user.id, "delete_extension", "extension", params.id, {
			name: record.name,
		});

		// If we preserved files (de-import), return the manual descriptor to the client
		if (!removeFiles && dirName) {
			const manifestPath = join(extensionsInstallDir, dirName, "ext.json");
			let content = null;
			try {
				content = await fs.readFile(manifestPath, "utf8");
				const json = JSON.parse(content);
				const payload = buildManifestPayload(json);
				const fileEndpoint = `/api/extensions/${encodeURIComponent(dirName)}/file`;
				return {
					success: true,
					manual: {
						id: dirName,
						name: payload.name || dirName,
						version: payload.version || "0.0.0",
						author: payload.author || null,
						summary: payload.summary || null,
						description: payload.description || null,
						website: payload.website || null,
						changelog_url: payload.changelog_url || null,
						root_file: payload.root_file,
						entry_type: payload.entry_type,
						styles: payload.styles || [],
						capabilities: payload.capabilities || [],
						targets: payload.targets || [],
						bundle_hash: null,
						fileEndpoint,
						enabled: false,
						managed: false,
						install_dir: dirName,
						settings_schema: payload.settings_schema || [],
					},
				};
			} catch {
				// Best effort: if we can't build a manifest to return, still report success
				return { success: true };
			}
		}

		return { success: true };
	})

	.patch(
		"/users/:id/super-tweeter",
		async ({ params, body, user }) => {
			const targetUser = adminQueries.findUserById.get(params.id);
			if (!targetUser) {
				return { error: "User not found" };
			}

			const superTweeter = body.super_tweeter ? 1 : 0;
			const boost =
				typeof body.boost === "number" && body.boost > 0 ? body.boost : 50.0;

			db.query(
				"UPDATE users SET super_tweeter = ?, super_tweeter_boost = ? WHERE id = ?",
			).run(superTweeter, boost, params.id);

			logModerationAction(user.id, "toggle_super_tweeter", "user", params.id, {
				super_tweeter: superTweeter,
				boost: boost,
			});

			return { success: true, super_tweeter: !!superTweeter, boost: boost };
		},
		{
			detail: {
				description:
					"Toggles the SuperTweeter status for a user with custom boost",
			},
			params: t.Object({
				id: t.String(),
			}),
			body: t.Object({
				super_tweeter: t.Boolean(),
				boost: t.Optional(t.Number()),
			}),
			response: t.Any(),
		},
	)

	.patch(
		"/posts/:id/super-tweet",
		async ({ params, body, user }) => {
			const post = adminQueries.getPostById.get(params.id);
			if (!post) {
				return { error: "Post not found" };
			}

			const superTweet = body.super_tweet ? 1 : 0;
			const boost =
				typeof body.boost === "number" && body.boost > 0 ? body.boost : 50.0;

			db.query(
				"UPDATE posts SET super_tweet = ?, super_tweet_boost = ? WHERE id = ?",
			).run(superTweet, boost, params.id);

			logModerationAction(user.id, "toggle_super_tweet", "post", params.id, {
				super_tweet: superTweet,
				boost: boost,
			});

			return { success: true, super_tweet: !!superTweet, boost: boost };
		},
		{
			detail: {
				description: "Toggles the SuperTweeta status for a post",
			},
			params: t.Object({
				id: t.String(),
			}),
			body: t.Object({
				super_tweet: t.Boolean(),
				boost: t.Optional(t.Number()),
			}),
			response: t.Any(),
		},
	)

	.get(
		"/fact-check/:postId",
		async ({ params }) => {
			const factCheck = adminQueries.getFactCheck.get(params.postId);
			return { factCheck };
		},
		{
			detail: {
				description: "Gets the fact-check for a post",
			},
			params: t.Object({
				postId: t.String(),
			}),
			response: t.Any(),
		},
	)

	.get(
		"/pastes",
		async ({ query }) => {
			const page = parseInt(query.page, 10) || 1;
			const limit = parseInt(query.limit, 10) || 20;
			const search = query.search || "";
			const offset = (page - 1) * limit;

			const searchPattern = `%${search}%`;
			const pastes = db
				.query(
					`SELECT p.*, u.username
					 FROM pastes p
					 LEFT JOIN users u ON p.user_id = u.id
					 WHERE p.title LIKE ? OR p.slug LIKE ? OR p.content LIKE ? OR u.username LIKE ?
					 ORDER BY p.created_at DESC
					 LIMIT ? OFFSET ?`,
				)
				.all(
					searchPattern,
					searchPattern,
					searchPattern,
					searchPattern,
					limit,
					offset,
				);
			const totalCount = db
				.query(
					`SELECT COUNT(*) as count
					 FROM pastes p
					 LEFT JOIN users u ON p.user_id = u.id
					 WHERE p.title LIKE ? OR p.slug LIKE ? OR p.content LIKE ? OR u.username LIKE ?`,
				)
				.get(searchPattern, searchPattern, searchPattern, searchPattern);

			return {
				pastes,
				pagination: {
					page,
					limit,
					total: totalCount.count,
					pages: Math.ceil(totalCount.count / limit),
				},
			};
		},
		{
			detail: {
				description: "Lists pastes with pagination and search",
			},
			query: t.Object({
				page: t.Optional(t.String()),
				limit: t.Optional(t.String()),
				search: t.Optional(t.String()),
			}),
			response: t.Object({
				pastes: t.Array(t.Any()),
				pagination: t.Any(),
			}),
		},
	)

	.get(
		"/pastes/:id",
		async ({ params, set }) => {
			const paste = db
				.query(
					`SELECT p.*, u.username
					 FROM pastes p
					 LEFT JOIN users u ON p.user_id = u.id
					 WHERE p.id = ? OR p.slug = ?`,
				)
				.get(params.id, params.id);
			if (!paste) {
				set.status = 404;
				return { error: "Paste not found" };
			}
			return { paste };
		},
		{
			detail: {
				description: "Gets a specific paste by id or slug",
			},
			params: t.Object({
				id: t.String(),
			}),
			response: t.Any(),
		},
	)

	.delete(
		"/pastes/:id",
		async ({ params, user, set }) => {
			const paste = db
				.query("SELECT * FROM pastes WHERE id = ? OR slug = ?")
				.get(params.id, params.id);
			if (!paste) {
				set.status = 404;
				return { error: "Paste not found" };
			}
			db.query("DELETE FROM pastes WHERE id = ?").run(paste.id);
			logModerationAction(user.id, "delete_paste", "paste", paste.id, {
				slug: paste.slug,
				title: paste.title,
			});
			return { success: true };
		},
		{
			detail: {
				description: "Deletes a paste",
			},
			params: t.Object({
				id: t.String(),
			}),
			response: t.Any(),
		},
	)
	.get(
		"/users/:id/ip",
		async ({ params, user, set }) => {
			const targetUser = adminQueries.getUserIp.get(params.id);
			if (!targetUser) {
				set.status = 404;
				return { error: "User not found" };
			}
			return { ip: targetUser.ip_address };
		},
		{
			detail: { description: "Get user IP address" },
			params: t.Object({ id: t.String() }),
		},
	)
	.get(
		"/ip/:ip/users",
		async ({ params }) => {
			const users = adminQueries.getUsersByIp.all(params.ip);
			return { users };
		},
		{
			detail: { description: "Get users by IP address" },
			params: t.Object({ ip: t.String() }),
		},
	)
	.post(
		"/ip/ban",
		async ({ body, user }) => {
			const { ip, reason } = body;
			try {
				adminQueries.banIp.run(ip, user.id, reason);
				logModerationAction(user.id, "ban_ip", "ip", ip, { reason });
				return { success: true };
			} catch (error) {
				return { error: "Failed to ban IP" };
			}
		},
		{
			detail: { description: "Ban an IP address" },
			body: t.Object({ ip: t.String(), reason: t.String() }),
		},
	)
	.post(
		"/ip/unban",
		async ({ body, user }) => {
			const { ip } = body;
			adminQueries.unbanIp.run(ip);
			logModerationAction(user.id, "unban_ip", "ip", ip);
			return { success: true };
		},
		{
			detail: { description: "Unban an IP address" },
			body: t.Object({ ip: t.String() }),
		},
	)
	.get(
		"/ip/bans",
		async () => {
			const bans = adminQueries.getIpBans.all();
			return { bans };
		},
		{
			detail: { description: "Get all IP bans" },
		},
	);
