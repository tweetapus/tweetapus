async function createEmojiPicker() {
  let mod = null;
  if (!customElements.get("emoji-picker")) {
    try {
      mod = await import("https://unpkg.com/emoji-picker-element");
    } catch (_err) {
      // fall back to element registration if import fails Tr Stuck Cursor
    }
  }

  // Try to load custom emojis so we can initialize the picker with them if supported
  let custom = [];
  try {
    const resp = await fetch("/api/emojis");
    if (resp.ok) {
      const data = await resp.json();
      custom = (data.emojis || []).map((e) => ({
        name: e.name,
        shortcodes: [e.name],
        url: e.file_url,
        category: e.category || "Custom",
      }));
    }
  } catch (_err) {
    custom = [];
  }

  // If the module export provides a Picker constructor, use it so we can pass customEmoji
  if (mod && mod.Picker) {
    try {
      const picker = new mod.Picker({ customEmoji: custom });
      // mark picker as having integrated custom emoji UI
      try {
        picker.dataset = picker.dataset || {};
        picker.dataset.hasCustom = "1";
      } catch (_e) {}
      return picker;
    } catch (_err) {
      // fall back to element
    }
  }

  const picker = document.createElement("emoji-picker");
  // Best-effort: if the element exposes a setter for customEmoji, assign it
  try {
    if (custom.length && typeof picker.setAttribute === "function") {
      picker.customEmoji = custom;
    }
  } catch (_e) {}
  return picker;
}

export async function showEmojiPickerPopup(onEmojiSelect, position = {}) {
  const picker = await createEmojiPicker(onEmojiSelect);
  picker.className = "emoji-picker emoji-picker-popup";

  document
    .querySelectorAll("emoji-picker")
    .forEach((pickerEl) => pickerEl.remove());
  document.body.appendChild(picker);

  const rect = picker.getBoundingClientRect();
  let x = position.x ?? window.innerWidth / 2 - rect.width / 2;
  let y = position.y ?? window.innerHeight / 2 - rect.height / 2;

  if (x + rect.width > window.innerWidth)
    x = window.innerWidth - rect.width - 10;
  if (y + rect.height > window.innerHeight)
    y = window.innerHeight - rect.height - 10;
  if (x < 10) x = 10;
  if (y < 10) y = 10;

  picker.style.position = "fixed";
  picker.style.left = `${x}px`;
  picker.style.top = `${y}px`;

  // cleanup function removes picker and click handler
  const cleanup = () => {
    try {
      picker.parentNode?.removeChild(picker);
    } catch (_e) {}
    try {
      document.removeEventListener("click", closeOnClickOutside);
    } catch (_e) {}
  };

  picker.addEventListener("emoji-click", (event) => {
    try {
      const d = event.detail || {};
      let out = null;
      if (d.unicode) out = d.unicode;
      else if (d.name) out = `:${d.name}:`;
      else if (Array.isArray(d.shortcodes) && d.shortcodes[0])
        out = `:${d.shortcodes[0]}:`;
      else if (d.emoji) out = d.emoji;

      if (onEmojiSelect && out) onEmojiSelect(out);
    } catch (_err) {
      // ignore
    }
    cleanup();
  });

  // No legacy custom grid — picker is initialized with server customEmoji when supported.

  const closeOnClickOutside = (e) => {
    const clickedInsidePicker = picker.contains(e.target);
    if (!clickedInsidePicker) {
      cleanup();
    }
  };

  setTimeout(() => document.addEventListener("click", closeOnClickOutside), 10);

  return picker;
}
