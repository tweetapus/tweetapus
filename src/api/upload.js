import { jwt } from "@elysiajs/jwt";
import { Elysia, file } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import db from "../db.js";
import ratelimit from "../helpers/ratelimit.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getUserByUsername = db.query("SELECT * FROM users WHERE username = ?");

// Ensure uploads directory exists
const uploadsDir = join(process.cwd(), ".data", "uploads");
if (!existsSync(uploadsDir)) {
	mkdirSync(uploadsDir, { recursive: true });
}

// Allowed file types - only WebP for images
const ALLOWED_TYPES = {
	"image/webp": ".webp",
	"video/mp4": ".mp4",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default new Elysia({ prefix: "/upload" })
	.use(jwt({ name: "jwt", secret: JWT_SECRET }))
	.use(
		rateLimit({
			duration: 60_000,
			max: 20,
			scoping: "scoped",
			generator: ratelimit,
		}),
	)
	.post("/", async ({ jwt, headers, body }) => {
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

			// Validate file type
			if (!ALLOWED_TYPES[file.type]) {
				return {
					error:
						"Unsupported file type. Only WebP images and MP4 videos are allowed",
				};
			}

			// Validate file size
			if (file.size > MAX_FILE_SIZE) {
				return { error: "File too large. Maximum size is 10MB" };
			}

			// Calculate SHA256 hash
			const arrayBuffer = await file.arrayBuffer();
			const hasher = new Bun.CryptoHasher("sha256");
			hasher.update(arrayBuffer);
			const fileHash = hasher.digest("hex");

			// Save file with hash as filename (secure against path traversal)
			const fileExtension = ALLOWED_TYPES[file.type];
			const fileName = fileHash + fileExtension;

			// Validate filename to prevent path traversal
			if (!/^[a-f0-9]{64}\.(webp|mp4)$/i.test(fileName)) {
				return { error: "Invalid filename generated" };
			}

			const filePath = join(uploadsDir, fileName);
			const fileUrl = `/api/uploads/${fileName}`;

			// Write file to disk
			await Bun.write(filePath, arrayBuffer);

			// Return file data for client to include in tweet creation
			return {
				success: true,
				file: {
					hash: fileHash,
					name: file.name,
					type: file.type,
					size: file.size,
					url: fileUrl,
				},
			};
		} catch (error) {
			console.error("Upload error:", error);
			return { error: "Failed to upload file" };
		}
	});

// Secure file serving route
export const uploadRoutes = new Elysia({ prefix: "/uploads" }).get(
	"/:filename",
	({ params }) => {
		const { filename } = params;

		// Strict filename validation to prevent path traversal
		if (!/^[a-f0-9]{64}\.(webp|mp4)$/i.test(filename)) {
			return new Response("Invalid filename", { status: 400 });
		}

		const filePath = join(process.cwd(), ".data", "uploads", filename);
		return file(filePath);
	},
);
