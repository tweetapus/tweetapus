import { existsSync, promises as fsPromises, mkdirSync } from "node:fs";
import { join } from "node:path";
import { jwt } from "@elysiajs/jwt";
import { Elysia, file } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import db from "../db.js";
import ratelimit from "../helpers/ratelimit.js";
import {
  compressVideo,
  shouldCompressVideo,
} from "../helpers/video-compression.js";

const JWT_SECRET = process.env.JWT_SECRET;

const getUserByUsername = db.query(
  "SELECT * FROM users WHERE LOWER(username) = LOWER(?)"
);

const uploadsDir = join(process.cwd(), ".data", "uploads");
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

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
const MAX_COMPRESSED_SIZE = 10 * 1024 * 1024;

export default new Elysia({ prefix: "/upload" })
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))
  .use(
    rateLimit({
      duration: 60_000,
      max: 20,
      scoping: "scoped",
      generator: ratelimit,
    })
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
            "Unsupported file type. Only images (PNG, JPG, WebP) and MP4 videos are allowed",
        };
      }

      // Validate file size - different limits for videos vs images
      if (file.type === "video/mp4" && file.size > MAX_VIDEO_SIZE) {
        return { error: "Video too large. Maximum size is 100MB" };
      } else if (file.type !== "video/mp4" && file.size > MAX_FILE_SIZE) {
        return { error: "File too large. Maximum size is 50MB" };
      }

      // Get file content
      const arrayBuffer = await file.arrayBuffer();

      let finalArrayBuffer = arrayBuffer;
      const finalType = file.type;
      const originalSize = file.size;

      // Handle video compression
      if (file.type === "video/mp4") {
        // Create temporary file for processing
        const tempInputPath = join(
          uploadsDir,
          `temp_input_${Bun.randomUUIDv7()}.mp4`
        );
        const tempOutputPath = join(
          uploadsDir,
          `temp_output_${Bun.randomUUIDv7()}.mp4`
        );

        try {
          // Write original file to temp location
          await Bun.write(tempInputPath, arrayBuffer);

          // Check if compression is needed
          const compressionCheck = await shouldCompressVideo(
            tempInputPath,
            MAX_COMPRESSED_SIZE
          );

          if (compressionCheck.needsCompression) {
            const compressionResult = await compressVideo(
              tempInputPath,
              tempOutputPath,
              {
                crf: 28,
                preset: "fast",
                maxWidth: 1280,
                maxHeight: 720,
              }
            );

            if (compressionResult.success) {
              finalArrayBuffer = await Bun.file(tempOutputPath).arrayBuffer();
            } else {
              console.error(
                "Video compression failed:",
                compressionResult.error
              );
              try {
                (await Bun.file(tempInputPath).exists()) &&
                  (await fsPromises.unlink(tempInputPath));
                (await Bun.file(tempOutputPath).exists()) &&
                  (await fsPromises.unlink(tempOutputPath));
              } catch (cleanupError) {
                console.error("Cleanup error:", cleanupError);
              }
              return {
                error: "Video compression failed. Please try a smaller file.",
              };
            }
          }

          try {
            (await Bun.file(tempInputPath).exists()) &&
              (await fsPromises.unlink(tempInputPath));
            (await Bun.file(tempOutputPath).exists()) &&
              (await fsPromises.unlink(tempOutputPath));
          } catch (cleanupError) {
            console.error("Cleanup error:", cleanupError);
          }
        } catch (videoError) {
          console.error("Video processing error:", videoError);
          // Clean up temp files on error
          try {
            (await Bun.file(tempInputPath).exists()) &&
              (await fsPromises.unlink(tempInputPath));
            (await Bun.file(tempOutputPath).exists()) &&
              (await fsPromises.unlink(tempOutputPath));
          } catch (cleanupError) {
            console.error("Cleanup error:", cleanupError);
          }
          return { error: "Video processing failed. Please try again." };
        }
      }

      // Final size check after compression
      if (finalArrayBuffer.byteLength > MAX_COMPRESSED_SIZE) {
        return {
          error: `File too large after processing. Maximum size is ${
            MAX_COMPRESSED_SIZE / 1024 / 1024
          }MB`,
        };
      }

      // Calculate SHA256 hash of final file
      const hasher = new Bun.CryptoHasher("sha256");
      hasher.update(finalArrayBuffer);
      const fileHash = hasher.digest("hex");

      // Save file with hash as filename (secure against path traversal)
      const fileExtension = ALLOWED_TYPES[finalType];
      const fileName = fileHash + fileExtension;

      // Validate filename to prevent path traversal
      if (!/^[a-f0-9]{64}\.(webp|mp4|gif)$/i.test(fileName)) {
        return { error: "Invalid filename generated" };
      }

      const filePath = join(uploadsDir, fileName);
      const fileUrl = `/api/uploads/${fileName}`;

      // Write final file to disk
      await Bun.write(filePath, finalArrayBuffer);

      // Return file data for client to include in tweet creation
      return {
        success: true,
        file: {
          hash: fileHash,
          name: file.name,
          type: finalType,
          size: finalArrayBuffer.byteLength,
          url: fileUrl,
          originalSize: originalSize,
          compressed: originalSize !== finalArrayBuffer.byteLength,
          compressionRatio:
            originalSize !== finalArrayBuffer.byteLength
              ? (
                  ((originalSize - finalArrayBuffer.byteLength) /
                    originalSize) *
                  100
                ).toFixed(1)
              : 0,
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
    if (!/^[a-f0-9]{64}\.(webp|mp4|gif)$/i.test(filename)) {
      return new Response("Invalid filename", { status: 400 });
    }

    const filePath = join(process.cwd(), ".data", "uploads", filename);
    return file(filePath);
  }
);
