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
        size
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
        quality
      );

      URL.revokeObjectURL(objectUrl);
    };

    img.onerror = () => {
      reject(new Error("Failed to load image"));
    };

    // Create object URL and load the image
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
  });
}

/**
 * Convert and resize image to WebP format for banners
 * @param {File} file - The input image file
 * @param {number} maxWidth - Target width (default: 1500)
 * @param {number} maxHeight - Target height (default: 500)
 * @param {number} quality - WebP quality (default: 0.8)
 * @returns {Promise<File>} The converted WebP file
 */
export async function convertToWebPBanner(
  file,
  maxWidth = 1500,
  maxHeight = 500,
  quality = 0.8
) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      // Calculate dimensions maintaining aspect ratio for banner
      const aspectRatio = img.width / img.height;
      let newWidth = maxWidth;
      let newHeight = maxHeight;

      // For banners, we want to fill the width and crop height if needed
      if (aspectRatio > maxWidth / maxHeight) {
        // Image is wider than banner ratio, fit to height
        newHeight = maxHeight;
        newWidth = newHeight * aspectRatio;
      } else {
        // Image is taller than banner ratio, fit to width
        newWidth = maxWidth;
        newHeight = newWidth / aspectRatio;
      }

      // Set canvas to banner dimensions
      canvas.width = maxWidth;
      canvas.height = maxHeight;

      // Calculate position to center the image
      const x = (maxWidth - newWidth) / 2;
      const y = (maxHeight - newHeight) / 2;

      // Draw image centered on canvas
      ctx.drawImage(img, x, y, newWidth, newHeight);

      // Convert to WebP blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            // Create a File object with WebP MIME type
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
        quality
      );

      // Clean up the object URL
      URL.revokeObjectURL(objectUrl);
    };

    img.onerror = () => {
      reject(new Error("Failed to load image"));
    };

    // Create object URL and load the image
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
  });
}

/**
 * Validates if a file is a supported image format for conversion
 * @param {File} file - The file to validate
 * @returns {boolean} True if the file can be converted
 */
export function isConvertibleImage(file) {
  const supportedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
    "image/svg+xml",
  ];

  return supportedTypes.includes(file.type);
}

/**
 * Gets a preview URL for an image file
 * @param {File} file - The image file
 * @returns {string} Object URL for preview
 */
export function getImagePreviewUrl(file) {
  return URL.createObjectURL(file);
}

/**
 * Revokes an object URL to free memory
 * @param {string} url - The object URL to revoke
 */
export function revokeImagePreviewUrl(url) {
  URL.revokeObjectURL(url);
}
