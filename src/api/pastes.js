import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "./../db.js";
import { decryptText, encryptText } from "../helpers/encryption.js";
import ratelimit from "../helpers/ratelimit.js";

const JWT_SECRET = process.env.JWT_SECRET;
const MAX_PASTE_LENGTH = 200_000;
const MAX_TITLE_LENGTH = 120;
const MAX_LANGUAGE_LENGTH = 40;

const getUserByUsername = db.query(
	"SELECT id, admin FROM users WHERE LOWER(username) = LOWER(?)",
);

const getPasteBySlug = db.query("SELECT * FROM pastes WHERE slug = ?");
const getPasteById = db.query("SELECT * FROM pastes WHERE id = ?");
const checkSlugExists = db.query("SELECT 1 FROM pastes WHERE slug = ?");

const createPaste = db.query(`
	INSERT INTO pastes (id, user_id, title, content, language, is_public, burn_after_reading, secret_key, slug, expires_at, password_hash, show_author, created_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'utc'))
	RETURNING *
`);

const deletePasteById = db.query("DELETE FROM pastes WHERE id = ?");
const incrementViews = db.query(
	"UPDATE pastes SET view_count = view_count + 1 WHERE id = ?",
);
const listPublicPastes = db.query(`
	SELECT id, slug, title, language, view_count, created_at, is_public, burn_after_reading, expires_at, user_id, password_hash, show_author
	FROM pastes
	WHERE is_public = 1 AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
	ORDER BY created_at DESC
	LIMIT ? OFFSET ?
`);

const updatePaste = db.query(`
	UPDATE pastes
	SET title = ?, content = ?, language = ?, is_public = ?, burn_after_reading = ?, secret_key = ?, expires_at = ?, password_hash = ?, show_author = ?, updated_at = datetime('now', 'utc')
	WHERE id = ?
`);

const purgeExpiredPaste = db.query(
	"DELETE FROM pastes WHERE id = ? AND expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now')",
);

const slugTail = () => Bun.randomUUIDv7().split("-").pop();

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const parseExpiry = (expiresAt) => {
	if (!expiresAt) return null;
	const ts = new Date(expiresAt);
	if (Number.isNaN(ts.getTime())) {
		return null;
	}
	if (ts <= new Date()) {
		return null;
	}
	return ts.toISOString();
};

const ensureSlug = () => {
	let slug = slugTail();
	while (checkSlugExists.get(slug)) {
		slug = slugTail();
	}
	return slug;
};

const validateContent = (content) => {
	if (typeof content !== "string") return false;
	if (!content.trim()) return false;
	return content.length <= MAX_PASTE_LENGTH;
};

const sanitizeField = (value, maxLen) => {
	if (value === null || value === undefined) return null;
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	return trimmed.slice(0, maxLen);
};

const canAccessPrivatePaste = async (paste, headers, query, jwtPlugin) => {
	const providedSecret = query.secret || headers["x-paste-secret"] || null;
	if (providedSecret && providedSecret === paste.secret_key) {
		return true;
	}
	const auth = headers.authorization;
	if (!auth) return false;
	try {
		const token = auth.replace("Bearer ", "");
		const payload = await jwtPlugin.verify(token);
		if (!payload?.username) return false;
		const user = getUserByUsername.get(payload.username);
		if (!user) return false;
		return user.id === paste.user_id || !!user.admin;
	} catch {
		return false;
	}
};

const verifyPastePassword = async (paste, providedPassword) => {
	if (!paste.password_hash) return true;
	if (!providedPassword) return false;
	try {
		const storedPassword = await decryptText(paste.password_hash);
		return storedPassword === providedPassword;
	} catch {
		return false;
	}
};

const listUserPastes = db.query(`
	SELECT id, slug, title, language, view_count, created_at, is_public, burn_after_reading, expires_at, user_id, password_hash, show_author
	FROM pastes
	WHERE user_id = ?
	ORDER BY created_at DESC
	LIMIT ? OFFSET ?
`);

const serializePaste = (row, includeAuthor = true) => ({
	id: row.id,
	slug: row.slug ?? null,
	title: row.title ?? null,
	content: row.content ?? null,
	language: row.language ?? null,
	is_public: !!row.is_public,
	burn_after_reading: !!row.burn_after_reading,
	secret_key: row.secret_key ?? null,
	view_count: row.view_count ?? 0,
	expires_at: row.expires_at ?? null,
	created_at: row.created_at ?? null,
	updated_at: row.updated_at ?? null,
	user_id: includeAuthor && row.show_author ? (row.user_id ?? null) : null,
	has_password: !!row.password_hash,
	show_author: !!row.show_author,
});

export default new Elysia({ prefix: "/pastes", tags: ["Pastes"] })
	.use(jwt({ name: "jwt", secret: JWT_SECRET }))
	.use(
		rateLimit({
			duration: 240_000,
			max: 100,
			scoping: "scoped",
			generator: ratelimit,
		}),
	)
	.post("/", async ({ headers, body, jwt }) => {
		const payload = body && typeof body === "object" ? body : {};
		const title = sanitizeField(payload.title ?? null, MAX_TITLE_LENGTH);
		const content = payload.content;
		const language = sanitizeField(
			payload.language ?? null,
			MAX_LANGUAGE_LENGTH,
		);
		const isPublic = payload.is_public !== false;
		const burnAfterReading = !!payload.burn_after_reading;
		const expiresAt = parseExpiry(payload.expires_at || null);
		const showAuthor = payload.show_author !== false;
		const rawPassword =
			typeof payload.password === "string" && payload.password.trim().length > 0
				? payload.password.trim()
				: null;

		if (!validateContent(content)) {
			return { error: "Content is required and must be under 200k characters" };
		}

		let creatorId = null;
		if (headers.authorization) {
			try {
				const token = headers.authorization.replace("Bearer ", "");
				const parsed = await jwt.verify(token);
				if (parsed?.username) {
					const user = getUserByUsername.get(parsed.username);
					if (user) creatorId = user.id;
				}
			} catch {
				creatorId = null;
			}
		}

		const slug = ensureSlug();
		const secretKey = isPublic ? null : Bun.randomUUIDv7();
		const passwordHash = rawPassword ? await encryptText(rawPassword) : null;
		const paste = createPaste.get(
			Bun.randomUUIDv7(),
			creatorId,
			title,
			content,
			language,
			isPublic ? 1 : 0,
			burnAfterReading ? 1 : 0,
			secretKey,
			slug,
			expiresAt,
			passwordHash,
			showAuthor ? 1 : 0,
		);

		return {
			success: true,
			paste: {
				...serializePaste(paste),
				secret_key: secretKey,
			},
		};
	})
	.get("/public", ({ query }) => {
		const limit = clamp(Number(query.limit) || 20, 1, 50);
		const page = Math.max(0, Number(query.page) || 0);
		const rows = listPublicPastes.all(limit, page * limit);
		return { success: true, pastes: rows.map(serializePaste) };
	})
	.get("/id/:id", async ({ params, headers, query, jwt }) => {
		const row = getPasteById.get(params.id);
		if (!row) return { error: "Paste not found" };

		if (row.expires_at && new Date(row.expires_at) <= new Date()) {
			purgeExpiredPaste.run(row.id);
			return { error: "Paste not found" };
		}

		if (!row.is_public) {
			const allowed = await canAccessPrivatePaste(row, headers, query, jwt);
			if (!allowed) return { error: "Paste not found" };
		}

		if (row.password_hash) {
			const providedPassword =
				query.password || headers["x-paste-password"] || null;
			const passwordValid = await verifyPastePassword(row, providedPassword);
			if (!passwordValid) {
				return { error: "Password required", password_protected: true };
			}
		}

		incrementViews.run(row.id);
		const result = serializePaste(row);
		if (row.burn_after_reading) deletePasteById.run(row.id);
		return { success: true, paste: result };
	})
	.get("/:slug", async ({ params, headers, query, jwt }) => {
		const row = getPasteBySlug.get(params.slug);
		if (!row) return { error: "Paste not found" };

		if (row.expires_at && new Date(row.expires_at) <= new Date()) {
			purgeExpiredPaste.run(row.id);
			return { error: "Paste not found" };
		}

		if (!row.is_public) {
			const allowed = await canAccessPrivatePaste(row, headers, query, jwt);
			if (!allowed) return { error: "Paste not found" };
		}

		if (row.password_hash) {
			const providedPassword =
				query.password || headers["x-paste-password"] || null;
			const passwordValid = await verifyPastePassword(row, providedPassword);
			if (!passwordValid) {
				return { error: "Password required", password_protected: true };
			}
		}

		incrementViews.run(row.id);
		const result = serializePaste(row);
		if (row.burn_after_reading) {
			deletePasteById.run(row.id);
		}
		return { success: true, paste: result };
	})
	.delete("/:slug", async ({ params, headers, jwt }) => {
		const row = getPasteBySlug.get(params.slug);
		if (!row) return { error: "Paste not found" };
		if (!headers.authorization) return { error: "Unauthorized" };
		try {
			const token = headers.authorization.replace("Bearer ", "");
			const payload = await jwt.verify(token);
			if (!payload?.username) return { error: "Unauthorized" };
			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "Unauthorized" };
			if (user.id !== row.user_id && !user.admin) {
				return { error: "Unauthorized" };
			}
			deletePasteById.run(row.id);
			return { success: true };
		} catch {
			return { error: "Unauthorized" };
		}
	})
	.put("/:slug", async ({ params, headers, body, jwt }) => {
		const row = getPasteBySlug.get(params.slug);
		if (!row) return { error: "Paste not found" };
		if (!headers.authorization) return { error: "Authentication required" };
		try {
			const token = headers.authorization.replace("Bearer ", "");
			const payload = await jwt.verify(token);
			if (!payload?.username) return { error: "Unauthorized" };
			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "Unauthorized" };
			if (user.id !== row.user_id && !user.admin)
				return { error: "Unauthorized" };

			const patch = body && typeof body === "object" ? body : {};
			const title = sanitizeField(patch.title ?? null, MAX_TITLE_LENGTH);
			const language = sanitizeField(
				patch.language ?? null,
				MAX_LANGUAGE_LENGTH,
			);
			const content = patch.content ?? row.content;
			if (!validateContent(content)) {
				return {
					error: "Content is required and must be under 200k characters",
				};
			}
			const expiresAt = parseExpiry(patch.expires_at ?? row.expires_at);
			const isPublic =
				patch.is_public === undefined ? !!row.is_public : !!patch.is_public;
			const burnAfterReading =
				patch.burn_after_reading === undefined
					? !!row.burn_after_reading
					: !!patch.burn_after_reading;
			const showAuthor =
				patch.show_author === undefined
					? !!row.show_author
					: !!patch.show_author;
			let secretKey = row.secret_key;
			if (!isPublic && !secretKey) {
				secretKey = Bun.randomUUIDv7();
			}
			if (isPublic) {
				secretKey = null;
			}
			let passwordHash = row.password_hash;
			if (patch.password === null || patch.password === "") {
				passwordHash = null;
			} else if (
				typeof patch.password === "string" &&
				patch.password.trim().length > 0
			) {
				passwordHash = await encryptText(patch.password.trim());
			}
			updatePaste.run(
				title,
				content,
				language,
				isPublic ? 1 : 0,
				burnAfterReading ? 1 : 0,
				secretKey,
				expiresAt,
				passwordHash,
				showAuthor ? 1 : 0,
				row.id,
			);
			const updated = getPasteById.get(row.id);
			return {
				success: true,
				paste: serializePaste(updated),
			};
		} catch (error) {
			console.error("Update paste error:", error);
			return { error: "Failed to update paste" };
		}
	})
	.get("/mine/list", async ({ headers, query, jwt }) => {
		if (!headers.authorization) return { error: "Authentication required" };
		try {
			const token = headers.authorization.replace("Bearer ", "");
			const payload = await jwt.verify(token);
			if (!payload?.username) return { error: "Unauthorized" };
			const user = getUserByUsername.get(payload.username);
			if (!user) return { error: "Unauthorized" };
			const limit = clamp(Number(query.limit) || 20, 1, 50);
			const page = Math.max(0, Number(query.page) || 0);
			const rows = listUserPastes.all(user.id, limit, page * limit);
			return {
				success: true,
				pastes: rows.map((r) => ({
					id: r.id,
					slug: r.slug,
					title: r.title,
					language: r.language,
					view_count: r.view_count,
					created_at: r.created_at,
					is_public: !!r.is_public,
					burn_after_reading: !!r.burn_after_reading,
					expires_at: r.expires_at,
					has_password: !!r.password_hash,
					show_author: !!r.show_author,
				})),
			};
		} catch {
			return { error: "Unauthorized" };
		}
	});
