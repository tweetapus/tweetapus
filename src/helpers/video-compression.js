import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";

/**
 * Compresses a video file to reduce size while maintaining acceptable quality
 * @param {string} inputPath - Path to the input video file
 * @param {string} outputPath - Path where the compressed video will be saved
 * @param {Object} options - Compression options
 * @param {number} options.crf - Constant Rate Factor (18-28, lower = higher quality)
 * @param {string} options.preset - Encoding preset (ultrafast, fast, medium, slow)
 * @param {number} options.maxWidth - Maximum width in pixels
 * @param {number} options.maxHeight - Maximum height in pixels
 * @returns {Promise<{success: boolean, outputPath?: string, originalSize?: number, compressedSize?: number, error?: string}>}
 */
export async function compressVideo(inputPath, outputPath, options = {}) {
	const {
		crf = 28, // Good balance of quality/size for social media
		preset = "fast", // Faster encoding
		maxWidth = 1280, // HD width limit
		maxHeight = 720, // HD height limit
	} = options;

	try {
		// Get original file size
		const originalStats = await fs.stat(inputPath);
		const originalSize = originalStats.size;

		// Return promise that resolves when compression is complete
		return new Promise((resolve, reject) => {
			const command = ffmpeg(inputPath)
				.outputOptions([
					"-vcodec libx264", // H.264 codec for compatibility
					`-crf ${crf}`, // Quality setting
					`-preset ${preset}`, // Speed vs compression efficiency
					"-movflags +faststart", // Enable fast start for web playback
					"-pix_fmt yuv420p", // Ensure compatibility with all players
				])
				.videoFilters(
					`scale='min(${maxWidth},iw)':'min(${maxHeight},ih)':force_original_aspect_ratio=decrease`,
				) // Maintain aspect ratio
				.on("end", async () => {
					try {
						// Get compressed file size
						const compressedStats = await fs.stat(outputPath);
						const compressedSize = compressedStats.size;

						resolve({
							success: true,
							outputPath,
							originalSize,
							compressedSize,
							compressionRatio: (
								((originalSize - compressedSize) / originalSize) *
								100
							).toFixed(1),
						});
					} catch (error) {
						reject({
							success: false,
							error: `Failed to read compressed file stats: ${error.message}`,
						});
					}
				})
				.on("error", (err) => {
					reject({
						success: false,
						error: `FFmpeg error: ${err.message}`,
					});
				});

			// Add progress logging for debugging
			command.on("progress", (progress) => {
				console.log(
					`Video compression progress: ${progress.percent?.toFixed(1) || 0}%`,
				);
			});

			// Save the compressed video
			command.save(outputPath);
		});
	} catch (error) {
		return {
			success: false,
			error: `File system error: ${error.message}`,
		};
	}
}

/**
 * Gets video metadata (duration, dimensions, bitrate, etc.)
 * @param {string} videoPath - Path to the video file
 * @returns {Promise<Object>} Video metadata
 */
export function getVideoMetadata(videoPath) {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(videoPath, (err, metadata) => {
			if (err) {
				reject(err);
				return;
			}

			const videoStream = metadata.streams.find(
				(stream) => stream.codec_type === "video",
			);
			const audioStream = metadata.streams.find(
				(stream) => stream.codec_type === "audio",
			);

			resolve({
				duration: metadata.format.duration,
				size: metadata.format.size,
				bitrate: metadata.format.bit_rate,
				video: videoStream
					? {
							width: videoStream.width,
							height: videoStream.height,
							codec: videoStream.codec_name,
							fps: videoStream.r_frame_rate
								? videoStream.r_frame_rate.includes("/")
									? parseFloat(videoStream.r_frame_rate.split("/")[0]) /
										parseFloat(videoStream.r_frame_rate.split("/")[1])
									: parseFloat(videoStream.r_frame_rate)
								: null,
						}
					: null,
				audio: audioStream
					? {
							codec: audioStream.codec_name,
							bitrate: audioStream.bit_rate,
							sampleRate: audioStream.sample_rate,
						}
					: null,
			});
		});
	});
}

/**
 * Determines if a video needs compression based on file size and metadata
 * @param {string} videoPath - Path to the video file
 * @param {number} maxSizeBytes - Maximum acceptable file size in bytes
 * @returns {Promise<{needsCompression: boolean, reason?: string, metadata?: Object}>}
 */
export async function shouldCompressVideo(
	videoPath,
	maxSizeBytes = 5 * 1024 * 1024,
) {
	try {
		const stats = await fs.stat(videoPath);
		const metadata = await getVideoMetadata(videoPath);

		if (stats.size > maxSizeBytes) {
			return {
				needsCompression: true,
				reason: `File size ${(stats.size / 1024 / 1024).toFixed(1)}MB exceeds limit ${(maxSizeBytes / 1024 / 1024).toFixed(1)}MB`,
				metadata,
			};
		}

		// Also compress if video is very high resolution
		if (
			metadata.video &&
			(metadata.video.width > 1280 || metadata.video.height > 720)
		) {
			return {
				needsCompression: true,
				reason: `Resolution ${metadata.video.width}x${metadata.video.height} exceeds recommended 1280x720`,
				metadata,
			};
		}

		return {
			needsCompression: false,
			metadata,
		};
	} catch (error) {
		return {
			needsCompression: false,
			error: error.message,
		};
	}
}
