// Load emoji map once for rendering custom emoji shortcodes (e.g. :name:)
const emojiMapPromise = (async () => {
  try {
    const resp = await fetch("/api/emojis");
    if (!resp.ok) return {};
    const data = await resp.json();
    const map = {};
    for (const e of data.emojis || []) map[e.name] = e.file_url;
    return map;
  } catch (_err) {
    return {};
  }
})();

export const triggerReactionBurst = (element, emoji = null, count = 8) => {
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const angle = (Math.PI * 2 * i) / count;
      const distance = 50 + Math.random() * 50;
      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance;

      // createReaction is async (it may fetch emoji map); fire-and-forget is fine
      createReaction(emoji || randomReaction(), x, y);
    }, i * 50);
  }
};

export const createReaction = async (emoji, x, y) => {
  const el = document.createElement("div");
  el.className = "floating-reaction";
  el.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      transform: translate(-50%, -50%) scale(1);
      pointer-events: none;
      z-index: 99999;
      font-size: 20px;
      opacity: 1;
      transition: transform 700ms cubic-bezier(.2,.9,.2,1), opacity 700ms ease-out;
    `;

  // If emoji is a shortcode like :name:, try to render the custom emoji image.
  let rendered = false;
  try {
    if (typeof emoji === "string") {
      const m = emoji.match(/^:([a-zA-Z0-9_+-]+):$/);
      if (m) {
        const name = m[1];
        const map = await emojiMapPromise;
        const url = map[name];
        if (url) {
          const img = document.createElement("img");
          img.src = url;
          img.alt = emoji;
          img.width = 24;
          img.height = 24;
          img.style.display = "inline-block";
          img.style.verticalAlign = "middle";
          el.appendChild(img);
          rendered = true;
        }
      }
    }
  } catch (_err) {
    // fall back to text rendering
  }

  if (!rendered) {
    el.textContent = emoji;
  }

  document.body.appendChild(el);

  requestAnimationFrame(() => {
    const dx = -10 + Math.random() * 20;
    const dy = -70 - Math.random() * 40;
    const scale = 0.9 + Math.random() * 0.6;
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    el.style.opacity = "0";
  });

  setTimeout(() => {
    try {
      el.remove();
    } catch (_) {}
  }, 800);
};
