import { Elysia, t } from "elysia";
import { rateLimit } from "elysia-rate-limit";

import admin from "./api/admin.js";
import articles from "./api/articles.js";
import auth from "./api/auth.js";
import blocking from "./api/blocking.js";
import bookmarks from "./api/bookmarks.js";
import captcha from "./api/captcha.js";
import communities from "./api/communities.js";
import delegates from "./api/delegates.js";
import dm from "./api/dm.js";
import extensions from "./api/extensions.js";
import notifications from "./api/notifications.js";
import pastes from "./api/pastes.js";
import profile from "./api/profile.js";
import publicTweets from "./api/public-tweets.js";
import push from "./api/push.js";
import reports from "./api/reports.js";
import scheduled from "./api/scheduled.js";
import search from "./api/search.js";
import tenor from "./api/tenor.js";
import timeline from "./api/timeline.js";
import trends from "./api/trends.js";
import tweet from "./api/tweet.js";
import unsplash from "./api/unsplash.js";
import upload, { uploadRoutes } from "./api/upload.js";
import db from "./db.js";
import { emojiCache } from "./helpers/cache.js";
import ratelimit from "./helpers/ratelimit.js";
import {
	getSuspensionCache,
	setSuspensionCache,
} from "./helpers/suspensionCache.js";

function formatExpiry(expiryStr) {
	const now = new Date();
	const expiry = new Date(expiryStr);

	const diffMs = expiry - now;
	if (diffMs <= 0) return "expired";

	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHour / 24);

	if (diffSec < 60) return "in less than 1 minute";
	if (diffMin < 60) return `in ${diffMin} minute${diffMin > 1 ? "s" : ""}`;
	if (diffHour < 24) {
		const hours = diffHour;
		const minutes = diffMin % 60;
		return `in ${hours} hour${hours > 1 ? "s" : ""}${
			minutes ? ` and ${minutes} minute${minutes > 1 ? "s" : ""}` : ""
		}`;
	}
	if (diffDay < 7) {
		const days = diffDay;
		const hours = diffHour % 24;
		return `in ${days} day${days > 1 ? "s" : ""}${
			hours ? ` and ${hours} hour${hours > 1 ? "s" : ""}` : ""
		}`;
	}

	return expiry.toLocaleString("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

const isSuspendedQuery = db.prepare(`
  SELECT * FROM suspensions WHERE user_id = ? AND status = 'active' AND action = 'suspend' AND (expires_at IS NULL OR expires_at > datetime('now'))
`);

const isRestrictedQuery = db.prepare(`
  SELECT * FROM suspensions WHERE user_id = ? AND status = 'active' AND action = 'restrict' AND (expires_at IS NULL OR expires_at > datetime('now'))
`);

const liftSuspension = db.prepare(`
  UPDATE suspensions SET status = 'lifted' WHERE id = ?
`);

const updateUserSuspended = db.prepare(
	"UPDATE users SET suspended = ? WHERE id = ?",
);
const updateUserRestricted = db.prepare(
	"UPDATE users SET restricted = ? WHERE id = ?",
);

const checkIpBan = db.prepare(
	"SELECT reason FROM ip_bans WHERE ip_address = ?",
);

const CACHE_TTL = 30_000;

export default new Elysia({
	prefix: "/api",
})
	.use(
		rateLimit({
			duration: 10_000,
			max: 50,
			scoping: "scoped",
			generator: ratelimit,
		}),
	)
	.onBeforeHandle(async ({ headers, request, set }) => {
		const ip = headers["cf-connecting-ip"];
		if (ip) {
			const ban = checkIpBan.get(ip);
			if (ban) {
				set.status = 403;
				return {
					error: "Your IP address has been banned",
					reason: ban.reason,
				};
			}
		}

		const token = headers.authorization?.split(" ")[1];
		if (!token) return;

		const parts = token.split(".");
		if (parts.length !== 3) return;

		let payload;
		try {
			payload = JSON.parse(atob(parts[1]));
		} catch {
			return;
		}
		const { userId } = payload;
		if (!userId) return;

		const now = Date.now();
		let cached = getSuspensionCache(userId);
		let suspension = null;
		let restriction = null;

		if (!cached || cached.expiry < now) {
			suspension = isSuspendedQuery.get(userId);

			if (suspension?.expires_at) {
				const expiresAt = new Date(suspension.expires_at).getTime();
				if (Date.now() > expiresAt) {
					liftSuspension.run(suspension.id);
					updateUserSuspended.run(false, userId);
					suspension = null;
				}
			}

			restriction = isRestrictedQuery.get(userId);
			if (restriction?.expires_at) {
				const expiresAt = new Date(restriction.expires_at).getTime();
				if (Date.now() > expiresAt) {
					liftSuspension.run(restriction.id);
					updateUserRestricted.run(false, userId);
					restriction = null;
				}
			}

			cached = {
				suspension: suspension,
				restriction: restriction,
				expiry: now + CACHE_TTL,
			};
			setSuspensionCache(userId, cached);
		}

		suspension = cached.suspension;
		restriction = cached.restriction;

		if (suspension) {
			const suspensionHtml = (
				await Bun.file("./src/assets/suspended.html").text()
			).replace(
				"%%text%%",
				`${suspension.reason}${
					suspension.expires_at
						? `<br>Expires ${formatExpiry(suspension.expires_at)}`
						: ""
				}`,
			);

			return {
				error: "You are suspended",
				suspension: suspensionHtml,
			};
		}

		if (restriction && !["GET", "OPTIONS"].includes(request.method)) {
			return {
				success: false,
				restricted: true,
				error:
					"Your account is in a read-only state and is not allowed to perform this action",
			};
		}
		if (restriction && request.url.endsWith("/auth/me")) {
			set.restricted = true;
		}
	})
	.get(
		"/emojis",
		async () => {
			try {
				const cached = emojiCache.get("all");
				if (cached) return { emojis: cached };

				const rows = db
					.query(
						"SELECT id, name, file_hash, file_url, created_by, created_at FROM emojis ORDER BY created_at DESC",
					)
					.all();

				emojiCache.set("all", rows);
				return { emojis: rows };
			} catch (_err) {
				return { emojis: [] };
			}
		},
		{
			detail: {
				description: "Lists all custom emojis",
				tags: ["Emojis"],
			},
			response: t.Object({
				emojis: t.Array(
					t.Object({
						id: t.String(),
						name: t.String(),
						file_hash: t.String(),
						file_url: t.String(),
						created_by: t.String(),
						created_at: t.String(),
					}),
				),
			}),
		},
	)
	.get(
		"/transparency/:user",
		async ({ params, set }) => {
			const { user } = params;
			if (!user) {
				set.status = 400;
				return { error: "User parameter is required" };
			}

			const userRecord = db
				.query(
					"SELECT account_creation_transparency, account_login_transparency, transparency_location_display FROM users WHERE username = ?",
				)
				.get(user);

			if (!userRecord) {
				set.status = 404;
				return { error: "User not found" };
			}

			const parseTransparency = (jsonStr) => {
				if (!jsonStr) return null;
				try {
					return JSON.parse(jsonStr);
				} catch {
					return null;
				}
			};

			const filterLocation = (data, displayMode) => {
				if (!data || !displayMode || displayMode === "full") return data;

				const filtered = { ...data };

				if (displayMode === "country") {
					delete filtered.city;
					delete filtered.latitude;
					delete filtered.longitude;
				} else if (displayMode === "continent") {
					delete filtered.city;
					delete filtered.country;
					delete filtered.latitude;
					delete filtered.longitude;
				}

				return filtered;
			};

			const displayMode = userRecord.transparency_location_display || "full";
			const creation = parseTransparency(
				userRecord.account_creation_transparency,
			);
			const login = parseTransparency(userRecord.account_login_transparency);

			return {
				creation: filterLocation(creation, displayMode),
				login: filterLocation(login, displayMode),
			};
		},
		{
			detail: {
				description:
					"Get account transparency data (city and country) for a user",
				tags: ["Transparency"],
			},
		},
	)
	.get("/owoembed", async ({ query }) => {
		const { i, a } = query;

		return {
			author_name: a,
			author_url: `${process.env.BASE_URL}/tweet/${encodeURIComponent(i)}`,
			provider_name: "Tweetapus",
			provider_url: process.env.BASE_URL,
			title: "Embed",
			type: "rich",
			version: "1.0",
		};
	})
	.use(auth)
	.use(admin)
	.use(blocking)
	.use(bookmarks)
	.use(captcha)
	.use(communities)
	.use(delegates)
	.use(tweet)
	.use(articles)
	.use(profile)
	.use(timeline)
	.use(publicTweets)
	.use(search)
	.use(upload)
	.use(extensions)
	.use(pastes)
	.use(notifications)
	.use(dm)
	.use(push)
	.use(tenor)
	.use(unsplash)
	.use(scheduled)
	.use(reports)
	.use(uploadRoutes)
	.use(trends);
