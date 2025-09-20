import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Elysia, t } from "elysia";
import sharp from "sharp";
import { requireAuth } from "../middleware/auth";

const UPLOAD_DIR = join(process.cwd(), ".data", "uploads");
const MAX_FILE_SIZE = 10 * 1024 * 1024;

if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

function generateFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function convertToWebP(buffer: Buffer): Promise<Buffer> {
  return await sharp(buffer).webp({ quality: 85 }).toBuffer();
}

export const uploadRouter = new Elysia({ prefix: "/upload" })
  .use(requireAuth)

  .post(
    "/image",
    async ({ body, user }) => {
      if (!user) {
        return { error: "Authentication required" };
      }

      const { file } = body;

      if (!file) {
        return { error: "No file provided" };
      }

      if (file.size > MAX_FILE_SIZE) {
        return { error: "File too large. Maximum size is 10MB" };
      }

      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
      ];
      if (!allowedTypes.includes(file.type)) {
        return {
          error: "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed",
        };
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const webpBuffer = await convertToWebP(buffer);
        const fileHash = generateFileHash(webpBuffer);
        const fileName = `${fileHash}.webp`;
        const filePath = join(UPLOAD_DIR, fileName);

        if (!existsSync(filePath)) {
          writeFileSync(filePath, webpBuffer);
        }

        return {
          success: true,
          url: `/uploads/${fileName}`,
          hash: fileHash,
          size: webpBuffer.length,
          type: "image/webp",
        };
      } catch {
        return { error: "Failed to process image" };
      }
    },
    {
      body: t.Object({
        file: t.File(),
      }),
    }
  )

  .post(
    "/video",
    async ({ body, user }) => {
      if (!user) {
        return { error: "Authentication required" };
      }

      const { file } = body;

      if (!file) {
        return { error: "No file provided" };
      }

      if (file.size > MAX_FILE_SIZE * 5) {
        return { error: "File too large. Maximum size is 50MB for videos" };
      }

      const allowedTypes = ["video/mp4", "video/webm", "video/mov"];
      if (!allowedTypes.includes(file.type)) {
        return {
          error: "Invalid file type. Only MP4, WebM, and MOV are allowed",
        };
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const fileHash = generateFileHash(buffer);
        const extension =
          file.type === "video/mp4"
            ? "mp4"
            : file.type === "video/webm"
            ? "webm"
            : "mov";
        const fileName = `${fileHash}.${extension}`;
        const filePath = join(UPLOAD_DIR, fileName);

        if (!existsSync(filePath)) {
          writeFileSync(filePath, buffer);
        }

        return {
          success: true,
          url: `/uploads/${fileName}`,
          hash: fileHash,
          size: buffer.length,
          type: file.type,
        };
      } catch (error) {
        return { error: "Failed to process video" };
      }
    },
    {
      body: t.Object({
        file: t.File(),
      }),
    }
  )

  .get("/uploads/:filename", async ({ params, set }) => {
    const filePath = join(UPLOAD_DIR, params.filename);

    if (!existsSync(filePath)) {
      set.status = 404;
      return "File not found";
    }

    const file = Bun.file(filePath);
    return new Response(file.stream());
  });
