import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "../db.js";
import ratelimit from "../helpers/ratelimit.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getUserByUsername = db.query(
	"SELECT id, username FROM users WHERE LOWER(username) = LOWER(?)",
);

const uploadsDir = join(process.cwd(), ".data", "uploads");
if (!existsSync(uploadsDir)) {
	mkdirSync(uploadsDir, { recursive: true });
}

const getShardedPath = (hash) => {
	const shard1 = hash.substring(0, 3);
	const shard2 = hash.substring(3, 6);
	const remaining = hash.substring(6);
	return { shard1, shard2, remaining };
};

const ALLOWED_TYPES = {
	"image/webp": ".webp",
	"image/png": ".webp",
	"image/jpeg": ".webp",
	"image/jpg": ".webp",
	"image/gif": ".gif",
	"video/mp4": ".mp4",
};

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

export default new Elysia({ prefix: "/upload", tags: ["Upload"] })
	.use(jwt({ name: "jwt", secret: JWT_SECRET }))
	.use(
		rateLimit({
			duration: 240_000,
			max: 100,
			scoping: "scoped",
			generator: ratelimit,
		}),
	)
	.post(
		"/",
		async ({ jwt, headers, body }) => {
			const authorization = headers.authorization;
			if (!authorization) return { error: "Authentication required" };

			try {
				const payload = await jwt.verify(authorization.replace("Bearer ", ""));
				if (!payload) return { error: "Invalid token" };

				const user = getUserByUsername.get(payload.username);
				if (!user) return { error: "User not found" };

				if (!body.file) {
					return { error: "No file provided" };
				}

				const file = body.file;

				if (!ALLOWED_TYPES[file.type]) {
					return {
						error:
							"Unsupported file type. Only images (PNG, JPG, WebP) and MP4 videos are allowed",
					};
				}

				if (file.type === "video/mp4" && file.size > MAX_VIDEO_SIZE) {
					return { error: "Video too large. Maximum size is 100MB" };
				} else if (file.type !== "video/mp4" && file.size > MAX_FILE_SIZE) {
					return { error: "File too large. Maximum size is 50MB" };
				}

				const arrayBuffer = await file.arrayBuffer();

				const finalArrayBuffer = arrayBuffer;
				const finalType = file.type;

				const hasher = new Bun.CryptoHasher("sha256");
				hasher.update(finalArrayBuffer);
				const fileHash = hasher.digest("hex");

				const fileExtension = ALLOWED_TYPES[finalType];
				const fileName = fileHash + fileExtension;

				if (!/^[a-f0-9]{64}\.(webp|mp4|gif)$/i.test(fileName)) {
					return { error: "Invalid filename generated" };
				}

				const { shard1, shard2, remaining } = getShardedPath(fileHash);
				const shardDir = join(uploadsDir, shard1, shard2);
				mkdirSync(shardDir, { recursive: true });

				const shardedFileName = remaining + fileExtension;
				const filePath = join(shardDir, shardedFileName);
				const fileUrl = `/api/uploads/${fileName}`;

				await Bun.write(filePath, finalArrayBuffer);

				return {
					success: true,
					file: {
						hash: fileHash,
						name: file.name,
						type: finalType,
						size: finalArrayBuffer.byteLength,
						url: fileUrl,
					},
				};
			} catch (error) {
				console.error("Upload error:", error);
				return { error: "Failed to upload file" };
			}
		},
		{
			type: "multipart/form-data",
			body: t.Object({
				file: t.File(),
			}),
			detail: {
				description:
					"Uploads a file (image or video) and returns the file hash and URL",
			},
			response: t.Object({
				success: t.Optional(t.Boolean()),
				file: t.Optional(
					t.Object({
						hash: t.String(),
						name: t.String(),
						type: t.String(),
						size: t.Number(),
						url: t.String(),
					}),
				),
				error: t.Optional(t.String()),
			}),
		},
	);

export const uploadRoutes = new Elysia({
	prefix: "/uploads",
	tags: ["Upload"],
})
	.use(
		rateLimit({
			duration: 10_000,
			max: 1000,
			scoping: "scoped",
			generator: ratelimit,
		}),
	)
	.get(
		"/:filename",
		async ({ params, set }) => {
			const { filename } = params;

			if (!/^[a-f0-9]{64}\.(webp|mp4|gif)$/i.test(filename)) {
				return new Response("Invalid filename", { status: 400 });
			}
			if (filename.includes("..")) {
				return new Response("Invalid filename", { status: 400 });
			}

			const extMatch = filename.match(/\.(webp|mp4|gif)$/i);
			if (!extMatch) {
				return new Response("Invalid filename", { status: 400 });
			}

			const ext = extMatch[0];
			const fullHash = filename.slice(0, -ext.length);

			const { shard1, shard2, remaining } = getShardedPath(fullHash);

			const safeBase = join(process.cwd(), ".data", "uploads");
			const filePath = join(safeBase, shard1, shard2, remaining + ext);

			set.headers["Cache-Control"] = "public, max-age=31536000, immutable";

			let file = Bun.file(filePath);
			
			if (!(await file.exists())) {
				const legacyPath = join(safeBase, filename);
				file = Bun.file(legacyPath);
				
				if (!(await file.exists())) {
					return new Response("File not found", { status: 404 });
				}
			}

			return file;
		},
		{
			detail: {
				description: "Serves uploaded files by filename",
			},
			params: t.Object({
				filename: t.String(),
			}),
		},
	);