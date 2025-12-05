export function openImageFullscreen(imageUrl, imageName = "image") {
  const overlay = document.createElement("div");
  overlay.className = "image-fullscreen-overlay";

  const container = document.createElement("div");
  container.className = "image-fullscreen-container";

  container.addEventListener("click", (e) => {
    e.stopPropagation();

    if (e.target === container) {
      overlay.classList.add("closing");
      setTimeout(() => overlay.remove(), 300);
    }
  });

  const img = document.createElement("img");
  img.src = imageUrl;
  img.alt = imageName;
  img.draggable = false;

  const closeButton = document.createElement("button");
  closeButton.className = "image-fullscreen-close";
  closeButton.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  `;

  const close = () => {
    overlay.classList.add("closing");
    setTimeout(() => overlay.remove(), 300);
  };

  closeButton.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  container.appendChild(img);
  container.appendChild(closeButton);
  overlay.appendChild(container);
  document.body.appendChild(overlay);
}
