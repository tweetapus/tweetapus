export async function convertToWebPAvatar(file, size = 250, quality = 0.8) {
	return new Promise((resolve, reject) => {
		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d");
		const img = new Image();

		img.onload = () => {
			canvas.width = size;
			canvas.height = size;

			const minDimension = Math.min(img.width, img.height);
			const sourceX = (img.width - minDimension) / 2;
			const sourceY = (img.height - minDimension) / 2;

			ctx.drawImage(
				img,
				sourceX,
				sourceY,
				minDimension,
				minDimension,
				0,
				0,
				size,
				size,
			);

			canvas.toBlob(
				(blob) => {
					if (!blob) {
						reject(new Error("Failed to convert image to WebP"));
						return;
					}

					const webpFile = new File([blob], `${file.name.split(".")[0]}.webp`, {
						type: "image/webp",
						lastModified: Date.now(),
					});

					resolve(webpFile);
				},
				"image/webp",
				quality,
			);

			URL.revokeObjectURL(objectUrl);
		};

		img.onerror = () => {
			reject(new Error("Failed to load image"));
		};

		const objectUrl = URL.createObjectURL(file);
		img.src = objectUrl;
	});
}

export async function convertToWebPBanner(
	file,
	maxWidth = 1500,
	maxHeight = 500,
	quality = 0.8,
) {
	return new Promise((resolve, reject) => {
		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d");
		const img = new Image();

		img.onload = () => {
			const aspectRatio = img.width / img.height;
			let newWidth = maxWidth;
			let newHeight = maxHeight;

			if (aspectRatio > maxWidth / maxHeight) {
				newHeight = maxHeight;
				newWidth = newHeight * aspectRatio;
			} else {
				newWidth = maxWidth;
				newHeight = newWidth / aspectRatio;
			}

			canvas.width = maxWidth;
			canvas.height = maxHeight;

			const x = (maxWidth - newWidth) / 2;
			const y = (maxHeight - newHeight) / 2;

			ctx.drawImage(img, x, y, newWidth, newHeight);

			canvas.toBlob(
				(blob) => {
					if (blob) {
						const webpFile = new File([blob], "banner.webp", {
							type: "image/webp",
							lastModified: Date.now(),
						});
						resolve(webpFile);
					} else {
						reject(new Error("Failed to create WebP blob"));
					}
				},
				"image/webp",
				quality,
			);

			URL.revokeObjectURL(objectUrl);
		};

		img.onerror = () => {
			reject(new Error("Failed to load image"));
		};

		const objectUrl = URL.createObjectURL(file);
		img.src = objectUrl;
	});
}

export function isConvertibleImage(file) {
	const supportedTypes = [
		"image/jpeg",
		"image/jpg",
		"image/png",
		"image/gif",
		"image/webp",
		"image/bmp",
		"image/svg+xml",
		"image/tuff",
	];

	return supportedTypes.includes(file.type);
}
