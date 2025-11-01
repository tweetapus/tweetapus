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

      createReaction(emoji || randomReaction(), x, y);
    }, i * 50);
  }
};

export const createReaction = (emoji, x, y) => {
  const el = document.createElement("div");
  el.className = "floating-reaction";
  el.textContent = emoji;
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
