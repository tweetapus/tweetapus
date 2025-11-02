export const CROP_CANCELLED = Symbol("CROP_CANCELLED");

export function openImageCropper(file, options = {}) {
  const aspect = options.aspect || 1;
  const outSize = options.size || 300;

  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file provided"));

    const objectUrl = URL.createObjectURL(file);

    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = 0;
    overlay.style.left = 0;
    overlay.style.right = 0;
    overlay.style.bottom = 0;
    overlay.style.background = "rgba(0,0,0,0.6)";
    overlay.style.zIndex = 99999;
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    const panel = document.createElement("div");
    panel.style.background = "var(--bg-primary, #111)";
    panel.style.padding = "12px";
    panel.style.borderRadius = "12px";
    panel.style.maxWidth = "calc(100vw - 40px)";
    panel.style.boxSizing = "border-box";

    const canvas = document.createElement("canvas");
    const displaySize = Math.min(600, Math.max(240, outSize));
    canvas.width = displaySize;
    canvas.height = displaySize / aspect;
    canvas.style.width = `${displaySize}px`;
    canvas.style.height = `${displaySize / aspect}px`;
    canvas.style.background = "#222";
    canvas.style.borderRadius = "8px";
    canvas.style.display = "block";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "8px";
    controls.style.marginTop = "10px";
    controls.style.justifyContent = "flex-end";

    const zoom = document.createElement("input");
    zoom.type = "range";
    zoom.min = 0.5;
    zoom.max = 3;
    zoom.step = 0.01;
    zoom.value = 1;
    zoom.style.flex = "1";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.padding = "8px 12px";

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.textContent = "Apply";
    applyBtn.style.padding = "8px 12px";

    controls.appendChild(zoom);
    controls.appendChild(cancelBtn);
    controls.appendChild(applyBtn);

    panel.appendChild(canvas);
    panel.appendChild(controls);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // crop state
      let scale = 1;
      let offsetX = 0;
      let offsetY = 0;
      let dragging = false;
      let lastX = 0;
      let lastY = 0;

      const draw = () => {
        const dw = canvas.width;
        const dh = canvas.height;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, dw, dh);
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, dw, dh);
        ctx.imageSmoothingEnabled = true;
        const iw = img.width * scale;
        const ih = img.height * scale;
        ctx.drawImage(img, offsetX, offsetY, iw, ih);
      };

      const constrain = () => {
        const dw = canvas.width;
        const dh = canvas.height;
        const iw = img.width * scale;
        const ih = img.height * scale;
        const minX = Math.min(0, dw - iw);
        const minY = Math.min(0, dh - ih);
        if (offsetX > 0) offsetX = 0;
        if (offsetY > 0) offsetY = 0;
        if (offsetX < minX) offsetX = minX;
        if (offsetY < minY) offsetY = minY;
      };

      canvas.addEventListener("pointerdown", (ev) => {
        dragging = true;
        lastX = ev.clientX;
        lastY = ev.clientY;
        canvas.setPointerCapture(ev.pointerId);
        ev.preventDefault();
      });

      window.addEventListener("pointermove", (ev) => {
        if (!dragging) return;
        const dx = ev.clientX - lastX;
        const dy = ev.clientY - lastY;
        lastX = ev.clientX;
        lastY = ev.clientY;
        offsetX += dx;
        offsetY += dy;
        constrain();
        draw();
      });

      window.addEventListener("pointerup", () => {
        dragging = false;
      });

      zoom.addEventListener("input", (e) => {
        const newScale = parseFloat(e.target.value);
        // try to keep center stable
        const cx = canvas.width / 2 - offsetX;
        const cy = canvas.height / 2 - offsetY;
        const relX = cx / scale;
        const relY = cy / scale;
        scale = newScale;
        offsetX = canvas.width / 2 - relX * scale;
        offsetY = canvas.height / 2 - relY * scale;
        constrain();
        draw();
      });

      // initialize scale so image covers canvas
      const scaleX = canvas.width / img.width;
      const scaleY = canvas.height / img.height;
      scale = Math.max(scaleX, scaleY);
      offsetX = (canvas.width - img.width * scale) / 2;
      offsetY = (canvas.height - img.height * scale) / 2;
      zoom.value = scale;
      draw();

      cancelBtn.addEventListener("click", () => {
        cleanup();
        resolve(CROP_CANCELLED);
      });

      applyBtn.addEventListener("click", () => {
        applyBtn.disabled = true;
        // create output canvas with requested size
        const outCanvas = document.createElement("canvas");
        outCanvas.width = outSize;
        outCanvas.height = Math.round(outSize / aspect);
        const outCtx = outCanvas.getContext("2d");
        outCtx.fillStyle = "#0000";
        outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);

        // compute source rect on the image used by canvas
        // we drew the image at (offsetX, offsetY) with size img.width*scale
        // map output canvas pixel to source canvas pixel
        const sx = (0 - offsetX) / scale;
        const sy = (0 - offsetY) / scale;
        const sw = outCanvas.width / scale;
        const sh = outCanvas.height / scale;

        // draw high-quality by drawing the original image portion scaled to outCanvas
        outCtx.imageSmoothingEnabled = true;
        outCtx.imageSmoothingQuality = "high";
        outCtx.drawImage(
          img,
          sx,
          sy,
          sw,
          sh,
          0,
          0,
          outCanvas.width,
          outCanvas.height
        );

        outCanvas.toBlob(
          (blob) => {
            applyBtn.disabled = false;
            if (!blob) {
              cleanup();
              return reject(new Error("Failed to create cropped image"));
            }
            const base = (file.name || "image").replace(/\.[^/.]+$/, "");
            const outFile = new File([blob], `${base}.webp`, {
              type: "image/webp",
              lastModified: Date.now(),
            });
            cleanup();
            resolve(outFile);
          },
          "image/webp",
          0.9
        );
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      cleanup();
      reject(new Error("Failed to load image for cropping"));
    };

    img.src = objectUrl;

    function cleanup() {
      try {
        overlay.remove();
      } catch (_) {}
      URL.revokeObjectURL(objectUrl);
    }
  });
}

export default openImageCropper;