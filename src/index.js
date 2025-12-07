import { jwt } from "@elysiajs/jwt";
import { openapi } from "@elysiajs/openapi";
import { staticPlugin } from "@elysiajs/static";
import { Elysia, file } from "elysia";
import { mountServerExtensions } from "./api/extensions.js";
import sse, { broadcastToUser, sendUnreadCounts } from "./api/sse.js";
import api from "./api.js";
import { compression } from "./helpers/compress.js";
import { embeds } from "./helpers/embeds.js";

export { broadcastToUser, sendUnreadCounts };

const appServer = new Elysia()
	.use(embeds)
	.use(compression)
	.use(staticPlugin())
	.use(
		openapi({
			path: "/api",
			scalar: {
				hideTestRequestButton: true,
				hideModels: true,
				showSidebar: true,
				telemetry: false,
			},
			documentation: {
				info: {
					title: "Tweetapus",
					description: "Tweetapus' REST API endpoints",
				},
				tags: [
					{
						name: "Admin",
						description: "All endpoints used by the admin panel",
					},
					{
						name: "Articles",
						description: "Viewing, creating and managing article",
					},
					{
						name: "Auth",
						description:
							"Logging in, registering, and managing passkeys and accounts",
					},
					{ name: "Blocking", description: "Blocking & unblocking users" },
					{
						name: "Bookmarks",
						description: "Bookmarking and viewing bookmarks",
					},
					{
						name: "Communities",
						description: "All endpoints related to communities",
					},
					{ name: "Delegates", description: "Managing and using delegates" },
					{ name: "DM", description: "Sending and reading DMs" },
					{
						name: "Extensions",
						description: "Downloading and installing extensions",
					},
					{
						name: "Notifications",
						description: "Receiving and managing notifications",
					},
					{ name: "Profile", description: "Viewing and editing profiles" },
					{ name: "Reports", description: "Reporting and managing reports" },
					{
						name: "Scheduling",
						description: "Managing and viewing scheduled tweets",
					},
					{ name: "Search", description: "Searching tweets and users" },
					{
						name: "Tenor",
						description: "Searching for GIFs using Tweetapus' Tenor API",
					},
					{ name: "Timeline", description: "Scrolling your timeline" },
					{
						name: "Tweet",
						description: "Creating, viewing, and managing tweets",
					},
					{ name: "Upload", description: "Managing and viewing uploads" },
					{ name: "Emojis", description: "Downloading emoji lists" },
				],
				components: {
					securitySchemes: {
						bearerAuth: {
							type: "http",
							scheme: "bearer",
							bearerFormat: "JWT",
						},
					},
				},
			},
			exclude: {
				paths: [
					"/*",
					"/public/*",
					"/legal",
					"/admin",
					"/api/owoembed",
					"/public/landing",
					"/public/admin",
					"/public/shared/assets/img/flags/LICENSE",
				],
			},
		}),
	)
	.use(jwt({ name: "jwt", secret: process.env.JWT_SECRET }))
	.use(sse)
	.get("/sw.js", ({ set }) => {
		set.headers["Service-Worker-Allowed"] = "/";
		set.headers["Content-Type"] = "application/javascript";
		return file("./public/sw.js");
	})
	.get("/admin", () => file("./public/admin/index.html"))
	.get("/legal", () => file("./public/legal.html"))
	.get("/public/temporary/font-text.html", ({ set }) => {
		set.headers["content-type"] = "text/html; charset=utf-8";
		return file("./public/temporary/font-text.html");
	})
	.get("/public/temporary/font-text.css", ({ set }) => {
		set.headers["content-type"] = "text/css; charset=utf-8";
		return file("./public/temporary/font-text.css");
	})
	.get("/public/temporary/HappiesFont-Regular.otf", ({ set }) => {
		set.headers["content-type"] = "font/otf";
		return file("./public/temporary/HappiesFont-Regular.otf");
	})
	.get("/public/paste/script.js", () => file("./public/paste/script.js"))
	.get("/public/shared/badge-utils.js", ({ set }) => {
		set.headers["Content-Type"] = "application/javascript; charset=utf-8";
		return file("./public/shared/badge-utils.js");
	})
	.get("*", ({ cookie }) => {
		return cookie.agree?.value === "yes"
			? file("./public/app/index.html")
			: file("./public/landing/index.html");
	})
	.use(api)
	.head(
		"/public/shared/assets/js/emoji-picker-element/data.json",
		({ set }) => {
			set.headers = {
				"access-control-allow-origin": "*",
				"access-control-expose-headers": "*",
				"cache-control": "public, max-age=604800, s-maxage=43200",
				"content-type": "application/json; charset=utf-8",
				date: "Wed, 19 Nov 2025 14:59:33 GMT",
				etag: '"ok1"',
				"timing-allow-origin": "*",
			};

			return null;
		},
		{
			detail: {
				description:
					"Returns static emoji data file headers. Always returns the same headers.",
			},
			tags: ["Emojis"],
		},
	);

appServer.listen(
	{ port: process.env.PORT || 3000, idleTimeout: 255 },
	async () => {
		try {
			await mountServerExtensions(appServer);
		} catch (err) {
			console.error("Failed to mount server extensions:", err);
		}

		console.log(
			`\x1b[38;2;29;161;242m __    _                     _
 \\ \\  | |___      _____  ___| |_ __ _ _ __  _   _ ___
  \\ \\ | __\\ \\ /\\ / / _ \\/ _ \\ __/ _\` | '_ \\| | | / __|
  / / | |_ \\ V  V /  __/  __/ || (_| | |_) | |_| \\__ \\
 /_/   \\__| \\_/\\_/ \\___|\\___|\\__\\__,_| .__/ \\__,_|___/
                                     |_|\x1b[0m

Happies tweetapus app is running on \x1b[38;2;29;161;242m\x1b[1m\x1b[4mhttp://localhost:${
				process.env.PORT || 3000
			}\x1b[0m`,
		);
	},
);
