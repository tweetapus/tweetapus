import { promises as fs } from "node:fs";
import ffmpeg from "fluent-ffmpeg";

export async function compressVideo(inputPath, outputPath, options = {}) {
	const {
		crf = 28,
		preset = "fast",
		maxWidth = 1280,
		maxHeight = 720,
	} = options;

	try {
		return new Promise((resolve, reject) => {
			const command = ffmpeg(inputPath)
				.outputOptions([
					"-vcodec libx264",
					`-crf ${crf}`,
					`-preset ${preset}`,
					"-movflags +faststart",
					"-pix_fmt yuv420p",
				])
				.videoFilters(
					`scale='min(${maxWidth},iw)':'min(${maxHeight},ih)':force_original_aspect_ratio=decrease`,
				)
				.on("end", async () => {
					try {
						const compressedStats = await fs.stat(outputPath);
						const compressedSize = compressedStats.size;

						resolve({
							success: true,
							outputPath,
							compressedSize,
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

			command.save(outputPath);
		});
	} catch (error) {
		return {
			success: false,
			error: `File system error: ${error.message}`,
		};
	}
}

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
