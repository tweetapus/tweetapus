export const CROP_CANCELLED = Symbol("CROP_CANCELLED");

export function openImageCropper(file, options = {}) {
  const aspect = options.aspect || 1;
  const outSize = options.size || 300;

  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file provided"));

    const objectUrl = URL.createObjectURL(file);

    const overlay = document.createElement("div");
    overlay.className = "image-cropper-overlay";

    const panel = document.createElement("div");
    panel.className = "image-cropper-panel";

    const canvas = document.createElement("canvas");
    const displaySize = Math.min(600, Math.max(240, outSize));
    canvas.width = displaySize;
    canvas.height = displaySize / aspect;
    canvas.className = "image-cropper-canvas";

    const controls = document.createElement("div");
    controls.className = "image-cropper-controls";

    const zoom = document.createElement("input");
    zoom.type = "range";
    zoom.min = 0;
    zoom.max = 1;
    zoom.step = 0.01;
    zoom.value = 0;
    zoom.className = "image-cropper-zoom";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.className = "btn secondary image-cropper-cancel";

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.textContent = "Apply";
    applyBtn.className = "btn primary image-cropper-apply";

    controls.appendChild(zoom);

    const actionRow = document.createElement("div");
    actionRow.className = "image-cropper-action-row";
    actionRow.appendChild(cancelBtn);
    actionRow.appendChild(applyBtn);

    controls.appendChild(actionRow);

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
      let baseScale = 1;
      let offsetX = 0;
      let offsetY = 0;
      let dragging = false;
      let lastX = 0;
      let lastY = 0;

      let maxFactor = 1;
      const pointers = new Map();
      let prevPinchDistance = 0;

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
        canvas.style.cursor = "grabbing";
        ev.preventDefault();
      });

      window.addEventListener("pointermove", (ev) => {
        // if there are two pointers, treat move as pinch (handled elsewhere)
        if (pointers.size === 2) return;
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
        canvas.style.cursor = "grab";
      });

      // pointer tracking for pinch-to-zoom
      canvas.addEventListener("pointerdown", (ev) => {
        pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      });

      canvas.addEventListener("pointermove", (ev) => {
        if (!pointers.has(ev.pointerId)) return;
        pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (pointers.size === 2) {
          const pts = Array.from(pointers.values());
          const dx = pts[0].x - pts[1].x;
          const dy = pts[0].y - pts[1].y;
          const dist = Math.hypot(dx, dy);
          if (prevPinchDistance && Math.abs(dist - prevPinchDistance) > 2) {
            const ratio = dist / prevPinchDistance;
            // convert ratio into slider delta for smoother control
            const delta = Math.log2(ratio) * 0.25;
            zoom.value = Math.min(
              1,
              Math.max(0, parseFloat(zoom.value) + delta)
            );
            zoom.dispatchEvent(new Event("input"));
          }
          prevPinchDistance = dist;
        }
      });

      const endPointer = (ev) => {
        pointers.delete(ev.pointerId);
        prevPinchDistance = 0;
      };

      canvas.addEventListener("pointerup", endPointer);
      canvas.addEventListener("pointercancel", endPointer);
      canvas.addEventListener("pointerout", endPointer);
      canvas.addEventListener("pointerleave", endPointer);

      // wheel zooming (desktop)
      canvas.addEventListener(
        "wheel",
        (ev) => {
          ev.preventDefault();
          const delta = ev.deltaY > 0 ? -0.03 : 0.03;
          zoom.value = Math.min(1, Math.max(0, parseFloat(zoom.value) + delta));
          zoom.dispatchEvent(new Event("input"));
        },
        { passive: false }
      );

      zoom.addEventListener("input", (e) => {
        const sliderPos = Math.min(
          1,
          Math.max(0, parseFloat(e.target.value) || 0)
        );
        const factor = 1 + sliderPos * (maxFactor - 1);
        const newScale = baseScale * factor;
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

      // initialize scale so image never renders smaller than source bounds
      const scaleX = canvas.width / img.width;
      const scaleY = canvas.height / img.height;
      const coverScale = Math.max(scaleX, scaleY);
      baseScale = Math.max(1, coverScale);
      scale = baseScale;
      offsetX = (canvas.width - img.width * scale) / 2;
      offsetY = (canvas.height - img.height * scale) / 2;
      // allow a much larger maximum zoom so users can zoom in further
      const maxAbsoluteScale = Math.max(6, baseScale * 4);
      maxFactor = Math.max(2, maxAbsoluteScale / baseScale);
      zoom.value = 0;
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
