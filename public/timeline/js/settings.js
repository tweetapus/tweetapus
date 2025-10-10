import toastQueue from "../../shared/toasts.js";
import query from "./api.js";
import { authToken } from "./auth.js";
import { showPage } from "./pages.js";

let currentUser = null;
let isRestoringState = false;

const hexToRgb = (hex) => {
  if (!hex) return null;
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
};

const initializeGlobalColors = () => {
  const savedColor = localStorage.getItem("accentColor") || "#1185fe";
  const root = document.documentElement;
  root.style.setProperty("--primary", savedColor);
  const rgb = hexToRgb(savedColor);
  if (rgb)
    root.style.setProperty("--primary-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  root.style.setProperty("--primary-hover", adjustBrightness(savedColor, -10));
  root.style.setProperty("--primary-focus", adjustBrightness(savedColor, -20));
};

const adjustBrightness = (hex, percent) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const adjust = (color) =>
    Math.max(0, Math.min(255, Math.round(color + (color * percent) / 100)));
  return `#${adjust(rgb.r).toString(16).padStart(2, "0")}${adjust(rgb.g)
    .toString(16)
    .padStart(2, "0")}${adjust(rgb.b).toString(16).padStart(2, "0")}`;
};

initializeGlobalColors();

const settingsPages = [
  { key: "account", title: "Account", content: () => createAccountContent() },
  {
    key: "passkeys",
    title: "Passkeys",
    content: () => createPasskeysContent(),
  },
  { key: "themes", title: "Themes", content: () => createThemesContent() },
  { key: "other", title: "Other", content: () => createOtherContent() },
];

const createThemesContent = () => {
  const section = document.createElement("div");
  section.className = "settings-section";

  const h1 = document.createElement("h1");
  h1.textContent = "Themes";
  section.appendChild(h1);

  const group = document.createElement("div");
  group.className = "setting-group";

  const h2 = document.createElement("h2");
  h2.textContent = "Appearance";
  group.appendChild(h2);

  // Theme Mode Setting
  const themeItem = document.createElement("div");
  themeItem.className = "setting-item";

  const themeLabel = document.createElement("div");
  themeLabel.className = "setting-label";
  const themeTitle = document.createElement("div");
  themeTitle.className = "setting-title";
  themeTitle.textContent = "Theme Mode";
  const themeDesc = document.createElement("div");
  themeDesc.className = "setting-description";
  themeDesc.textContent = "Choose light or dark mode";
  themeLabel.appendChild(themeTitle);
  themeLabel.appendChild(themeDesc);

  const themeControl = document.createElement("div");
  themeControl.className = "setting-control";

  const dropdown = document.createElement("div");
  dropdown.className = "custom-dropdown";
  dropdown.id = "themeDropdown";

  const dropdownButton = document.createElement("button");
  dropdownButton.className = "custom-dropdown-button";
  dropdownButton.setAttribute("aria-label", "Theme mode");
  dropdownButton.innerHTML = `
		<span class="dropdown-text">Auto</span>
		<svg class="custom-dropdown-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<polyline points="6,9 12,15 18,9"></polyline>
		</svg>
	`;

  const dropdownMenu = document.createElement("div");
  dropdownMenu.className = "custom-dropdown-menu";

  [
    { v: "light", t: "Light", icon: "☀️" },
    { v: "dark", t: "Dark", icon: "🌙" },
    { v: "auto", t: "Auto", icon: "🔄" },
  ].forEach(({ v, t, icon }) => {
    const option = document.createElement("div");
    option.className = "custom-dropdown-option";
    option.dataset.value = v;
    option.innerHTML = `${icon} ${t}`;
    dropdownMenu.appendChild(option);
  });

  dropdown.appendChild(dropdownButton);
  dropdown.appendChild(dropdownMenu);
  themeControl.appendChild(dropdown);

  themeItem.appendChild(themeLabel);
  themeItem.appendChild(themeControl);
  group.appendChild(themeItem);

  // Accent Color Setting
  const colorItem = document.createElement("div");
  colorItem.className = "setting-item";

  const colorLabel = document.createElement("div");
  colorLabel.className = "setting-label";
  const colorTitle = document.createElement("div");
  colorTitle.className = "setting-title";
  colorTitle.textContent = "Accent Color";
  const colorDesc = document.createElement("div");
  colorDesc.className = "setting-description";
  colorDesc.textContent = "Customize the accent color";
  colorLabel.appendChild(colorTitle);
  colorLabel.appendChild(colorDesc);

  const colorControl = document.createElement("div");
  colorControl.className = "setting-control";

  const accentSection = document.createElement("div");
  accentSection.className = "accent-color-section";

  const presetContainer = document.createElement("div");
  presetContainer.className = "color-presets";

  const savedColor = localStorage.getItem("accentColor") || "#1d9bf0";

  const presets = [
    { label: "Bluebird", color: "#1d9bf0" },
    { label: "Sunshine", color: "#ffad1f" },
    { label: "Flamingo", color: "#f91880" },
    { label: "Lavender", color: "#7856ff" },
    { label: "Emerald", color: "#00ba7c" },
    { label: "Coral", color: "#ff6347" },
    { label: "Ocean", color: "#0077be" },
    { label: "Cherry", color: "#e60023" },
    { label: "Forest", color: "#228b22" },
    { label: "Violet", color: "#8a2be2" },
    { label: "Sunset", color: "#ff4500" },
    { label: "Mint", color: "#00d4aa" },
    { label: "Custom", color: "custom" },
  ];

  presets.forEach((preset) => {
    const option = document.createElement("div");
    option.className = "color-option";
    option.title = preset.label;
    option.dataset.color = preset.color;

    if (preset.color === "custom") {
      option.style.background =
        "linear-gradient(45deg, #ff0000 0%, #ff7f00 14%, #ffff00 29%, #00ff00 43%, #0000ff 57%, #4b0082 71%, #9400d3 86%, #ff0000 100%)";
      // mark this option as the custom wrapper so other code can find it
      option.setAttribute("data-is-custom", "true");
      const picker = document.createElement("input");
      picker.type = "color";
      picker.id = "customColorPicker";
      picker.className = "custom-color-picker";
      picker.value = savedColor;
      picker.title = "Choose custom color";
      option.appendChild(picker);
    } else {
      option.style.backgroundColor = preset.color;
    }

    if (preset.color === savedColor) {
      option.classList.add("active");
    }

    option.addEventListener("click", () => {
      // Remove active from all options
      document
        .querySelectorAll(".color-option")
        .forEach((opt) => opt.classList.remove("active"));

      setTimeout(() => {
        option.classList.add("active");
      }, 10);

      if (preset.color === "custom") {
        const picker = option.querySelector(".custom-color-picker");
        picker.click();
      } else {
        setAccentColor(preset.color);
      }
    });

    if (preset.color === "custom") {
      const picker = option.querySelector(".custom-color-picker");
      picker.addEventListener("change", (e) => {
        setAccentColor(e.target.value);
        // replace the gradient with the chosen solid color so active checkmark is visible
        option.style.background = e.target.value;
      });
    }

    presetContainer.appendChild(option);
  });

  accentSection.appendChild(presetContainer);
  colorControl.appendChild(accentSection);

  colorItem.appendChild(colorLabel);
  colorItem.appendChild(colorControl);
  group.appendChild(colorItem);

  section.appendChild(group);
  return section;
};

const createAccountContent = () => {
  const section = document.createElement("div");
  section.className = "settings-section";

  const h1 = document.createElement("h1");
  h1.textContent = "Account Settings";
  section.appendChild(h1);

  const group = document.createElement("div");
  group.className = "setting-group";
  const h2 = document.createElement("h2");
  h2.textContent = "Profile";
  group.appendChild(h2);

  const item1 = document.createElement("div");
  item1.className = "setting-item";
  const label1 = document.createElement("div");
  label1.className = "setting-label";
  const control1 = document.createElement("div");
  control1.className = "setting-control";
  const btnUser = document.createElement("button");
  btnUser.className = "btn secondary";
  btnUser.id = "changeUsernameBtn";
  btnUser.textContent = "Change Username";
  control1.appendChild(btnUser);
  item1.appendChild(label1);
  item1.appendChild(control1);
  group.appendChild(item1);

  const item2 = document.createElement("div");
  item2.className = "setting-item";
  const label2 = document.createElement("div");
  label2.className = "setting-label";
  const control2 = document.createElement("div");
  control2.className = "setting-control";
  const btnPass = document.createElement("button");
  btnPass.className = "btn secondary";
  btnPass.id = "changePasswordBtn";
  btnPass.textContent = "Change Password";
  control2.appendChild(btnPass);
  item2.appendChild(label2);
  item2.appendChild(control2);
  group.appendChild(item2);

  section.appendChild(group);

  const danger = document.createElement("div");
  danger.className = "setting-group danger-group";
  const dh2 = document.createElement("h2");
  dh2.textContent = "Danger Zone";
  danger.appendChild(dh2);
  const item3 = document.createElement("div");
  item3.className = "setting-item";
  const label3 = document.createElement("div");
  label3.className = "setting-label";
  const control3 = document.createElement("div");
  control3.className = "setting-control";
  const btnDel = document.createElement("button");
  btnDel.className = "btn danger";
  btnDel.id = "deleteAccountBtn";
  btnDel.textContent = "Delete Account";
  control3.appendChild(btnDel);
  item3.appendChild(label3);
  item3.appendChild(control3);
  danger.appendChild(item3);
  section.appendChild(danger);

  section.appendChild(createChangeUsernameModal());
  section.appendChild(createDeleteAccountModal());
  section.appendChild(createChangePasswordModal());

  return section;
};

const createPasskeysContent = () => {
  const section = document.createElement("div");
  section.className = "settings-section";

  const h1 = document.createElement("h1");
  h1.textContent = "Passkey Management";
  section.appendChild(h1);

  const group = document.createElement("div");
  group.className = "setting-group";

  const h2 = document.createElement("h2");
  h2.textContent = "Your Passkeys";
  group.appendChild(h2);

  const description = document.createElement("p");
  description.style.color = "var(--text-secondary)";
  description.style.fontSize = "14px";
  description.style.marginBottom = "16px";
  description.textContent =
    "Passkeys allow you to sign in securely without a password. You can use your device's biometric authentication or security key.";
  group.appendChild(description);

  const addPasskeyItem = document.createElement("div");
  addPasskeyItem.className = "setting-item";
  const addPasskeyLabel = document.createElement("div");
  addPasskeyLabel.className = "setting-label";
  const addPasskeyTitle = document.createElement("div");
  addPasskeyTitle.className = "setting-title";
  addPasskeyTitle.textContent = "Add New Passkey";
  const addPasskeyDesc = document.createElement("div");
  addPasskeyDesc.className = "setting-description";
  addPasskeyDesc.textContent = "Register a new passkey for this account";
  addPasskeyLabel.appendChild(addPasskeyTitle);
  addPasskeyLabel.appendChild(addPasskeyDesc);
  const addPasskeyControl = document.createElement("div");
  addPasskeyControl.className = "setting-control";
  const addPasskeyBtn = document.createElement("button");
  addPasskeyBtn.className = "btn primary";
  addPasskeyBtn.id = "addPasskeyBtn";
  addPasskeyBtn.textContent = "Add Passkey";
  addPasskeyControl.appendChild(addPasskeyBtn);
  addPasskeyItem.appendChild(addPasskeyLabel);
  addPasskeyItem.appendChild(addPasskeyControl);
  group.appendChild(addPasskeyItem);

  section.appendChild(group);

  const passkeyListGroup = document.createElement("div");
  passkeyListGroup.className = "setting-group";
  const passkeyListTitle = document.createElement("h2");
  passkeyListTitle.textContent = "Registered Passkeys";
  passkeyListGroup.appendChild(passkeyListTitle);

  const passkeyList = document.createElement("div");
  passkeyList.id = "passkeyListSettings";
  passkeyList.style.display = "flex";
  passkeyList.style.flexDirection = "column";
  passkeyList.style.gap = "12px";
  passkeyListGroup.appendChild(passkeyList);

  section.appendChild(passkeyListGroup);

  setTimeout(() => {
    loadPasskeys();
  }, 100);

  return section;
};

const loadPasskeys = async () => {
  const passkeyList = document.getElementById("passkeyListSettings");
  if (!passkeyList) return;

  try {
    const data = await query("/auth/passkeys");

    if (data.error) {
      passkeyList.innerHTML = `<p style="color: var(--text-secondary); font-size: 14px;">Failed to load passkeys</p>`;
      return;
    }

    if (!data.passkeys || data.passkeys.length === 0) {
      passkeyList.innerHTML = `<p style="color: var(--text-secondary); font-size: 14px;">No passkeys registered yet</p>`;
      return;
    }

    passkeyList.innerHTML = "";
    data.passkeys.forEach((passkey) => {
      const item = document.createElement("div");
      item.style.display = "flex";
      item.style.justifyContent = "space-between";
      item.style.alignItems = "center";
      item.style.padding = "16px";
      item.style.backgroundColor = "var(--bg-primary)";
      item.style.borderRadius = "8px";
      item.style.border = "1px solid var(--border-primary)";

      const info = document.createElement("div");
      info.style.flex = "1";

      const name = document.createElement("div");
      name.style.fontWeight = "500";
      name.style.color = "var(--text-primary)";
      name.style.marginBottom = "4px";
      name.textContent = passkey.name || "Unnamed Passkey";

      const createdAt = document.createElement("div");
      createdAt.style.fontSize = "12px";
      createdAt.style.color = "var(--text-secondary)";
      createdAt.textContent = `Created: ${new Date(
        passkey.created_at
      ).toLocaleDateString()}`;

      info.appendChild(name);
      info.appendChild(createdAt);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn danger";
      deleteBtn.textContent = "Remove";
      deleteBtn.style.maxWidth = "120px";
      deleteBtn.onclick = () => deletePasskey(passkey.id);

      item.appendChild(info);
      item.appendChild(deleteBtn);
      passkeyList.appendChild(item);
    });
  } catch (error) {
    console.error("Failed to load passkeys:", error);
    passkeyList.innerHTML = `<p style="color: var(--text-secondary); font-size: 14px;">Failed to load passkeys</p>`;
  }
};

const deletePasskey = async (passkeyId) => {
  if (!confirm("Are you sure you want to remove this passkey?")) return;

  try {
    const data = await query(`/auth/passkeys/${passkeyId}`, {
      method: "DELETE",
    });

    if (data.error) {
      toastQueue.add(`<h1>Error</h1><p>${data.error}</p>`);
      return;
    }

    toastQueue.add(`<h1>Success</h1><p>Passkey removed successfully</p>`);
    loadPasskeys();
  } catch (error) {
    console.error("Failed to delete passkey:", error);
    toastQueue.add(`<h1>Error</h1><p>Failed to remove passkey</p>`);
  }
};

const createOtherContent = () => {
  const wrap = document.createElement("div");
  wrap.className = "settings-section";
  const h1 = document.createElement("h1");
  h1.textContent = "Other Settings";
  const p = document.createElement("p");
  p.textContent = "Additional settings will be added here.";
  wrap.appendChild(h1);
  wrap.appendChild(p);
  return wrap;
};

const createChangeUsernameModal = () => {
  const modal = document.createElement("div");
  modal.id = "changeUsernameModal";
  modal.className = "modal";
  modal.style.display = "none";

  const content = document.createElement("div");
  content.className = "modal-content";
  const header = document.createElement("div");
  header.className = "modal-header";
  const h2 = document.createElement("h2");
  h2.textContent = "Change Username";
  const close = document.createElement("button");
  close.className = "close-btn";
  close.id = "closeUsernameModal";
  close.textContent = "×";
  header.appendChild(h2);
  header.appendChild(close);
  const body = document.createElement("div");
  body.className = "modal-body";
  const form = document.createElement("form");
  form.id = "changeUsernameForm";
  const fg = document.createElement("div");
  fg.className = "form-group";
  const label = document.createElement("label");
  label.htmlFor = "newUsername";
  label.textContent = "New Username";
  const userWrap = document.createElement("div");
  userWrap.className = "username-wrapper";
  const at = document.createElement("span");
  at.setAttribute("inert", "");
  at.textContent = "@";
  const input = document.createElement("input");
  input.type = "text";
  input.id = "newUsername";
  input.placeholder = "new username";
  input.required = true;
  userWrap.appendChild(at);
  userWrap.appendChild(input);
  const small = document.createElement("small");
  small.textContent =
    "Username must be 3-20 characters and contain only letters, numbers, and underscores.";
  fg.appendChild(label);
  fg.appendChild(userWrap);
  fg.appendChild(small);
  const actions = document.createElement("div");
  actions.className = "form-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn secondary";
  cancel.id = "cancelUsernameChange";
  cancel.textContent = "Cancel";
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "btn primary";
  submit.textContent = "Change Username";
  actions.appendChild(cancel);
  actions.appendChild(submit);
  form.appendChild(fg);
  form.appendChild(actions);
  body.appendChild(form);
  content.appendChild(header);
  content.appendChild(body);
  modal.appendChild(content);
  return modal;
};

const createDeleteAccountModal = () => {
  const modal = document.createElement("div");
  modal.id = "deleteAccountModal";
  modal.className = "modal";
  modal.style.display = "none";
  const content = document.createElement("div");
  content.className = "modal-content";
  const header = document.createElement("div");
  header.className = "modal-header";
  const h2 = document.createElement("h2");
  h2.textContent = "Delete Account";
  const close = document.createElement("button");
  close.className = "close-btn";
  close.id = "closeDeleteModal";
  close.textContent = "×";
  header.appendChild(h2);
  header.appendChild(close);
  const body = document.createElement("div");
  body.className = "modal-body";
  const p = document.createElement("p");
  p.innerHTML =
    "<strong>Warning:</strong> This action cannot be undone. All your tweets, likes, follows, and account data will be permanently deleted.";
  const form = document.createElement("form");
  form.id = "deleteAccountForm";
  const fg = document.createElement("div");
  fg.className = "form-group";
  const label = document.createElement("label");
  label.htmlFor = "deleteConfirmation";
  label.textContent = 'Type "DELETE MY ACCOUNT" to confirm:';
  const input = document.createElement("input");
  input.type = "text";
  input.id = "deleteConfirmation";
  input.placeholder = "DELETE MY ACCOUNT";
  input.required = true;
  fg.appendChild(label);
  fg.appendChild(input);
  const actions = document.createElement("div");
  actions.className = "form-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn secondary";
  cancel.id = "cancelAccountDelete";
  cancel.textContent = "Cancel";
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "btn danger";
  submit.textContent = "Delete Account";
  actions.appendChild(cancel);
  actions.appendChild(submit);
  form.appendChild(fg);
  form.appendChild(actions);
  body.appendChild(p);
  body.appendChild(form);
  content.appendChild(header);
  content.appendChild(body);
  modal.appendChild(content);
  return modal;
};

const createChangePasswordModal = () => {
  const modal = document.createElement("div");
  modal.id = "changePasswordModal";
  modal.className = "modal";
  modal.style.display = "none";
  const content = document.createElement("div");
  content.className = "modal-content";
  const header = document.createElement("div");
  header.className = "modal-header";
  const h2 = document.createElement("h2");
  h2.textContent = "Change Password";
  const close = document.createElement("button");
  close.className = "close-btn";
  close.id = "closePasswordModal";
  close.textContent = "×";
  header.appendChild(h2);
  header.appendChild(close);
  const body = document.createElement("div");
  body.className = "modal-body";
  const p = document.createElement("p");
  p.id = "passwordModalDescription";
  p.textContent =
    "Set a password for your account to enable traditional username/password login.";
  const form = document.createElement("form");
  form.id = "changePasswordForm";
  const fgCur = document.createElement("div");
  fgCur.className = "form-group";
  fgCur.id = "currentPasswordGroup";
  fgCur.style.display = "none";
  const labelCur = document.createElement("label");
  labelCur.htmlFor = "current-password";
  labelCur.textContent = "Current Password";
  const inputCur = document.createElement("input");
  inputCur.type = "password";
  inputCur.id = "current-password";
  inputCur.placeholder = "enter your current password";
  inputCur.required = true;
  fgCur.appendChild(labelCur);
  fgCur.appendChild(inputCur);
  const fgNew = document.createElement("div");
  fgNew.className = "form-group";
  const labelNew = document.createElement("label");
  labelNew.htmlFor = "new-password";
  labelNew.textContent = "New Password";
  const inputNew = document.createElement("input");
  inputNew.type = "password";
  inputNew.id = "new-password";
  inputNew.placeholder = "enter your new password";
  inputNew.minLength = 8;
  inputNew.required = true;
  const small = document.createElement("small");
  small.textContent = "Password must be at least 8 characters long.";
  fgNew.appendChild(labelNew);
  fgNew.appendChild(inputNew);
  fgNew.appendChild(small);
  const actions = document.createElement("div");
  actions.className = "form-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn secondary";
  cancel.id = "cancelPasswordChange";
  cancel.textContent = "Cancel";
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "btn primary";
  submit.id = "changePasswordSubmit";
  submit.textContent = "Set Password";
  actions.appendChild(cancel);
  actions.appendChild(submit);
  form.appendChild(fgCur);
  form.appendChild(fgNew);
  form.appendChild(actions);
  body.appendChild(p);
  body.appendChild(form);
  content.appendChild(header);
  content.appendChild(body);
  modal.appendChild(content);
  return modal;
};

const createSettingsPage = () => {
  const settingsContainer = document.createElement("div");
  settingsContainer.className = "settings";
  settingsContainer.style.display = "none";

  const header = document.createElement("div");
  header.className = "settings-header";
  const back = document.createElement("a");
  back.href = "/";
  back.className = "back-button";
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("xmlns", svgNS);
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.25");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path1 = document.createElementNS(svgNS, "path");
  path1.setAttribute("d", "m12 19-7-7 7-7");
  const path2 = document.createElementNS(svgNS, "path");
  path2.setAttribute("d", "M19 12H5");
  svg.appendChild(path1);
  svg.appendChild(path2);
  back.appendChild(svg);
  const headerInfo = document.createElement("div");
  headerInfo.className = "settings-header-info";
  const h1 = document.createElement("h1");
  h1.textContent = "Settings";
  headerInfo.appendChild(h1);
  header.appendChild(back);
  header.appendChild(headerInfo);

  const body = document.createElement("div");
  body.className = "settings-body";
  const sidebar = document.createElement("div");
  sidebar.className = "settings-sidebar";
  settingsPages.forEach((page) => {
    const b = document.createElement("button");
    b.className = `settings-tab-btn${page.key === "account" ? " active" : ""}`;
    b.dataset.tab = page.key;
    b.textContent = page.title;
    sidebar.appendChild(b);
  });
  const content = document.createElement("div");
  content.className = "settings-content";
  content.id = "settings-content";
  body.appendChild(sidebar);
  body.appendChild(content);

  settingsContainer.appendChild(header);
  settingsContainer.appendChild(body);

  const style = document.createElement("style");
  style.textContent = `
    .main-content:has(.settings.page-active) {
      max-width: 100%;
    }
		
		.settings {
			flex-direction: column;
			min-height: 100vh;
			max-width: 1600px;
			margin: 0 auto;
			padding: 0 20px;
		}
		
		.settings-header {
			display: flex;
			align-items: center;
			padding: 20px 0;
			border-bottom: 1px solid var(--border-primary);
			margin-bottom: 12px;
		}
		
		.back-button {
			background: none;
			border: none;
			color: var(--text-primary);
			cursor: pointer;
			padding: 8px;
			margin-right: 20px;
			border-radius: 50%;
			display: flex;
			align-items: center;
			justify-content: center;
			transition: background-color 0.2s;
			text-decoration: none;
		}
		
		.back-button:hover {
			background-color: var(--bg-overlay-light);
		}
		
		.settings-header-info h1 {
			margin: 0;
			font-size: 24px;
			font-weight: 700;
			color: var(--text-primary);
		}
		
		.settings-body {
			display: flex;
			gap: 24px;
			flex: 1;
			width: 100%;
			align-items: flex-start;
			justify-content: center;
		}
		
		.settings-sidebar {
			background-color: var(--bg-secondary);
			border-radius: 8px;
			padding: 8px;
			width: 200px;
			flex-shrink: 0;
			height: fit-content;
		}
		
		.settings-tab-btn {
			width: 100%;
			background: transparent;
			border: none;
			color: var(--text-primary);
			text-align: left;
			padding: 12px 16px;
			font-size: 16px;
			cursor: pointer;
			border-radius: 6px;
			margin-bottom: 4px;
			font-family: inherit;
			font-weight: 400;
			transition: background-color 0.2s;
		}
		
		.settings-tab-btn:hover {
			background-color: var(--bg-overlay-light);
		}
		
		.settings-tab-btn.active {
			background-color: var(--primary);
			color: #fff;
			font-weight: 500;
		}
		
		.settings-content {
			background-color: var(--bg-secondary);
			border-radius: 8px;
			padding: 32px;
			flex: 1;
			min-width: 0;
			max-width: 900px;
			overflow-x: hidden;
		}
		
		.settings-section h1 {
			margin: 0 0 20px 0;
			font-size: 24px;
			font-weight: 700;
			color: var(--text-primary);
		}
		
		.setting-group {
			margin-bottom: 24px;
		}
		
		.setting-group h2 {
			margin: 0 0 18px 0;
			font-size: 18px;
			font-weight: 600;
			color: var(--text-primary);
		}
		
		.setting-item {
			display: flex;
			flex-direction: column;
			gap: 12px;
			align-items: stretch;
			padding: 18px 0;
			border-bottom: 1px solid var(--border-primary);
		}		.setting-item:last-child {
			border-bottom: none;
		}
		
		.setting-label {
			display: flex;
			flex-direction: column;
			gap: 4px;
			min-width: 0;
		}
		
		.setting-label:empty {
			display: none;
		}
		
		.setting-title {
			font-size: 16px;
			font-weight: 500;
			color: var(--text-primary);
		}
		
		.setting-description {
			font-size: 14px;
			color: var(--text-secondary);
		}
		
		.setting-control {
			flex-shrink: 0;
			min-width: 0;
			max-width: 100%;
		}
		
		.custom-dropdown {
			position: relative;
			display: inline-block;
		}
		
		.custom-dropdown-button {
			padding: 8px 12px;
			background: var(--bg-primary);
			border: 1px solid var(--border-primary);
			color: var(--text-primary);
			border-radius: 6px;
			font-size: 14px;
			cursor: pointer;
			display: flex;
			align-items: center;
			gap: 8px;
			min-width: 100px;
			transition: all 0.2s;
		}
		
		.custom-dropdown-button:hover {
			background: var(--bg-secondary);
			border-color: var(--border-hover);
		}
		
		.custom-dropdown-arrow {
			transition: transform 0.2s;
		}
		
		.custom-dropdown.open .custom-dropdown-arrow {
			transform: rotate(180deg);
		}
		
		.custom-dropdown-menu {
			position: absolute;
			top: 100%;
			left: 0;
			right: 0;
			background: var(--bg-primary);
			border: 1px solid var(--border-primary);
			border-radius: 6px;
			box-shadow: 0 4px 12px rgba(0,0,0,0.15);
			z-index: 1000;
			opacity: 0;
			visibility: hidden;
			transform: translateY(-8px);
			transition: all 0.2s;
		}
		
		.custom-dropdown.open .custom-dropdown-menu {
			opacity: 1;
			visibility: visible;
			transform: translateY(0);
		}
		
		.custom-dropdown-option {
			padding: 8px 12px;
			cursor: pointer;
			transition: background-color 0.2s;
			font-size: 14px;
		}
		
		.custom-dropdown-option:hover {
			background: var(--bg-secondary);
		}
		
		.custom-dropdown-option.selected {
			background: var(--primary);
			color: #fff;
		}
		
		.theme-mode-select {
			display: none;
		}
		
		.accent-color-section {
			display: flex;
			flex-direction: column;
			gap: 16px;
			width: 100%;
			max-width: 400px;
		}

		.color-presets {
			display: flex;
			flex-wrap: wrap;
			gap: 12px;
			align-items: center;
		}

		.color-option {
			width: 48px;
			height: 48px;
			border-radius: 50%;
			cursor: pointer;
			border: 3px solid var(--border-primary);
			transition: transform 0.18s ease, box-shadow 0.18s ease;
			position: relative;
			display: flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
			background-clip: padding-box;
		}

		.color-option:hover {
			transform: translateY(-3px) scale(1.03);
			box-shadow: 0 6px 18px rgba(0,0,0,0.12);
		}

		.color-option.active {
			border-color: var(--text-primary);
			transform: translateY(-2px) scale(1.04);
			box-shadow: 0 8px 22px rgba(0,0,0,0.18);
		}

		.color-option.active::before {
			content: '';
			position: absolute;
			inset: -3px;
			border-radius: 50%;
			border: 2px solid var(--text-primary);
			animation: checkmark-pulse 0.25s ease-out;
		}

		.color-option.active::after {
			content: '✓';
			position: absolute;
			color: white;
			font-size: 16px;
			font-weight: 800;
			text-shadow: 0 0 4px rgba(0,0,0,0.6);
			z-index: 10;
			pointer-events: none;
			animation: checkmark-appear 0.2s ease-out;
		}
		
		@keyframes checkmark-pulse {
			0% { transform: scale(0.8); opacity: 0; }
			50% { transform: scale(1.05); opacity: 1; }
			100% { transform: scale(1); opacity: 1; }
		}
		
		@keyframes checkmark-appear {
			0% { transform: scale(0); opacity: 0; }
			50% { transform: scale(1.2); opacity: 1; }
			100% { transform: scale(1); opacity: 1; }
		}
		
		.custom-color-picker {
			width: 100%;
			height: 100%;
			border: none;
			border-radius: 50%;
			cursor: pointer;
			padding: 0;
			background: none;
			opacity: 0;
			position: absolute;
			top: 0;
			left: 0;
		}
		
		.custom-color-picker::-webkit-color-swatch-wrapper {
			padding: 0;
			border-radius: 50%;
		}
		
		.custom-color-picker::-webkit-color-swatch {
			border: none;
			border-radius: 50%;
		}
		
		.custom-color-picker::-moz-color-swatch {
			border: none;
			border-radius: 50%;
		}
		
		.danger-group {
			border: 1px solid var(--error-color);
			border-radius: 8px;
			padding: 16px;
			background-color: rgba(220,38,38,.05);
		}
		
		.danger-group h2 {
			color: var(--error-color);
		}
		
		.modal {
			display: none;
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background-color: var(--bg-overlay);
			z-index: 1000;
			align-items: center;
			justify-content: center;
		}
		
		.modal-content {
			background: var(--bg-primary);
			border-radius: 12px;
			width: 90%;
			max-width: 500px;
			max-height: 90vh;
			overflow-y: auto;
			box-shadow: 0 20px 25px -5px rgba(0,0,0,.1), 0 10px 10px -5px rgba(0,0,0,.04);
		}
		
		.modal-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 20px 24px 0;
			border-bottom: 1px solid var(--border-primary);
			margin-bottom: 20px;
		}
		
		.modal-header h2 {
			margin: 0;
			font-size: 20px;
			font-weight: 600;
			color: var(--text-primary);
		}
		
		.close-btn {
			background: none;
			border: none;
			font-size: 24px;
			cursor: pointer;
			color: var(--text-secondary);
			padding: 0;
			width: 32px;
			height: 32px;
			display: flex;
			align-items: center;
			justify-content: center;
			border-radius: 50%;
			transition: background-color 0.2s;
		}
		
		.close-btn:hover {
			background-color: var(--bg-overlay-light);
		}
		
		.modal-body {
			padding: 0 24px 24px;
		}
		
		.form-group {
			margin-bottom: 20px;
		}
		
		.form-group label {
			display: block;
			margin-bottom: 8px;
			font-weight: 500;
			color: var(--text-primary);
		}
		
		.form-group input {
			width: 100%;
			padding: 12px;
			border: 1px solid var(--border-input);
			border-radius: 8px;
			font-size: 16px;
			background: var(--bg-primary);
			color: var(--text-primary);
			transition: border-color 0.2s;
			box-sizing: border-box;
		}
		
		.form-group input:focus {
			outline: none;
			border-color: var(--primary);
		}
		
		.form-group small {
			display: block;
			margin-top: 4px;
			color: var(--text-secondary);
			font-size: 14px;
		}
		
		.username-wrapper {
			display: flex;
			align-items: center;
			border: 1px solid var(--border-input);
			border-radius: 8px;
			overflow: hidden;
		}
		
		.username-wrapper span {
			padding: 12px 8px 12px 12px;
			background: var(--bg-secondary);
			color: var(--text-secondary);
			font-size: 16px;
		}
		
		.username-wrapper input {
			border: none;
			flex: 1;
		}
		
		.form-actions {
			display: flex;
			gap: 12px;
			justify-content: flex-end;
			margin-top: 24px;
		}

		/* Make buttons inside setting-control span full width but keep a sane max */
		.setting-control .btn {
			width: 100%;
			max-width: 100%;
			min-width: 0;
			margin: 0 auto;
			display: block;
		}
		
		.btn {
			padding: 12px 24px;
			border-radius: 8px;
			font-size: 16px;
			font-weight: 500;
			cursor: pointer;
			border: 1px solid transparent;
			transition: all 0.2s;
			min-width: 0;
			height: 44px;
			width: 100%;
			max-width: 100%;
		}		.btn.primary {
			background: var(--primary);
			color: #fff;
		}
		
		.btn.primary:hover {
			background: var(--primary-hover);
		}
		
		.btn.secondary {
			background: transparent;
			color: var(--btn-secondary-color);
			border-color: var(--btn-secondary-border);
		}
		
		.btn.secondary:hover {
			background: var(--btn-secondary-hover-bg);
			border-color: var(--btn-secondary-hover-border);
		}
		
		.btn.danger {
			background: var(--error-color);
			color: #fff;
		}
		
		.btn.danger:hover {
			background: #b91c1c;
		}
		
		@media (max-width: 768px) {
			.settings {
				padding: 0 10px;
			}
			
			.settings-body {
				flex-direction: column;
			}
			
			.settings-sidebar {
				width: 100%;
				display: flex;
				overflow-x: auto;
				gap: 8px;
			}
			
			.settings-tab-btn {
				white-space: nowrap;
				margin-bottom: 0;
			}
			
			.setting-item {
				flex-direction: column;
				gap: 16px;
			}
			
			.settings-content {
				max-width: 100%;
			}
			
			.color-presets {
				grid-template-columns: repeat(auto-fit, 40px);
				gap: 8px;
				justify-content: center;
			}
			
			.color-option {
				width: 40px;
				height: 40px;
			}
			
			.accent-color-section {
				max-width: 100%;
			}
		}
	`;

  document.head.appendChild(style);
  document.querySelector(".main-content").appendChild(settingsContainer);
  return settingsContainer;
};

let settingsPage;

const initializeSettings = () => {
  if (!settingsPage) {
    settingsPage = createSettingsPage();
  }

  const contentArea = settingsPage.querySelector("#settings-content");
  const tabButtons = settingsPage.querySelectorAll(".settings-tab-btn");

  const switchTab = (tabKey) => {
    const page = settingsPages.find((p) => p.key === tabKey);
    if (!page) {
      window.location.href = "/settings/account";
      return;
    }

    tabButtons.forEach((btn) => {
      if (btn.dataset.tab === tabKey) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    contentArea.textContent = "";
    const node = page.content();
    contentArea.appendChild(node);

    const newPath = `/settings/${tabKey}`;
    if (window.location.pathname !== newPath) {
      window.history.pushState(null, null, newPath);
    }

    if (tabKey === "themes") {
      setTimeout(() => {
        isRestoringState = true;
        loadCurrentAccentColor();
        loadCurrentThemeMode();
        setTimeout(() => {
          isRestoringState = false;
        }, 200);
      }, 50);
    }
  };

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.tab);
    });
  });

  const backButton = settingsPage.querySelector(".back-button");
  backButton.addEventListener("click", () => {
    window.location.href = "/";
  });

  const pathParts = window.location.pathname.split("/");
  let initialTab = pathParts[2];
  if (!initialTab || !settingsPages.find((p) => p.key === initialTab)) {
    initialTab = "account";
    window.history.replaceState(null, null, "/settings/account");
  }
  switchTab(initialTab);

  setupSettingsEventHandlers();

  setTimeout(() => {
    loadCurrentAccentColor();
    loadCurrentThemeMode();
  }, 100);
};

const setupSettingsEventHandlers = async () => {
  if (!authToken) return;

  try {
    const data = await query("/auth/me");
    if (data.user) {
      currentUser = data.user;

      // If server provides theme/accent, apply them (account-wide)
      if (currentUser.theme) {
        handleThemeModeChange(currentUser.theme);
      }
      if (currentUser.accent_color) {
        applyAccentColor(currentUser.accent_color);
      }
    }
  } catch (error) {
    console.error("Failed to query user data:", error);
  }

  document.addEventListener("click", (event) => {
    const target = event.target;

    if (target.closest(".custom-dropdown-button")) {
      const dropdown = target.closest(".custom-dropdown");
      const isOpen = dropdown.classList.contains("open");

      document
        .querySelectorAll(".custom-dropdown")
        .forEach((d) => d.classList.remove("open"));

      if (!isOpen) {
        dropdown.classList.add("open");
      }
    }

    if (target.classList.contains("custom-dropdown-option")) {
      const value = target.dataset.value;
      const dropdown = target.closest(".custom-dropdown");
      const button = dropdown.querySelector(
        ".custom-dropdown-button .dropdown-text"
      );
      const hiddenSelect =
        dropdown.parentElement.querySelector(".theme-mode-select");

      button.textContent = target.textContent;

      if (hiddenSelect) {
        hiddenSelect.value = value;
      }

      dropdown
        .querySelectorAll(".custom-dropdown-option")
        .forEach((opt) => opt.classList.remove("selected"));
      target.classList.add("selected");

      dropdown.classList.remove("open");

      handleThemeModeChange(value);
    }

    // Save theme/account-wide preferences
    if (target.id === "saveThemeBtn") {
      saveThemeToServer();
    }

    if (!target.closest(".custom-dropdown")) {
      document
        .querySelectorAll(".custom-dropdown")
        .forEach((d) => d.classList.remove("open"));
    }

    if (target.classList.contains("theme-mode-select")) {
    }

    if (target.id === "changeUsernameBtn") {
      showModal(document.getElementById("changeUsernameModal"));
      if (currentUser?.username) {
        document.getElementById("newUsername").value = currentUser.username;
      }
    }

    if (target.id === "addPasskeyBtn") {
      handleAddPasskey();
    }

    if (target.id === "changePasswordBtn") {
      const modal = document.getElementById("changePasswordModal");
      const hasPassword = currentUser?.password_hash !== null;

      modal.querySelector("h2").textContent = hasPassword
        ? "Change Password"
        : "Set Password";
      modal.querySelector("button[type='submit']").textContent = hasPassword
        ? "Change Password"
        : "Set Password";

      const currentPasswordGroup = document.getElementById(
        "currentPasswordGroup"
      );
      currentPasswordGroup.style.display = hasPassword ? "block" : "none";

      document.getElementById("changePasswordForm").reset();
      showModal(modal);
    }

    if (target.id === "deleteAccountBtn") {
      showModal(document.getElementById("deleteAccountModal"));
    }

    if (
      target.classList.contains("close-btn") ||
      target.id.includes("cancel") ||
      target.id.includes("close")
    ) {
      const modal = target.closest(".modal");
      if (modal) hideModal(modal);
    }
  });

  document.addEventListener("submit", (event) => {
    const form = event.target;

    if (form.id === "changeUsernameForm") {
      event.preventDefault();
      handleUsernameChange();
    }

    if (form.id === "changePasswordForm") {
      event.preventDefault();
      handlePasswordChange();
    }

    if (form.id === "deleteAccountForm") {
      event.preventDefault();
      handleAccountDeletion();
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.id === "newUsername") {
      event.target.value = event.target.value
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "");
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest(".modal") === event.target) {
      hideModal(event.target);
    }
  });

  loadCurrentAccentColor();
  loadCurrentThemeMode();

  document.addEventListener("input", (event) => {
    if (event.target.id === "newUsername") {
      event.target.value = event.target.value
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "");
    }
    if (event.target.classList.contains("theme-mode-select")) {
      handleThemeModeChange(event.target.value);
    }
  });
};

const saveThemeToServer = async () => {
  if (!currentUser) {
    toastQueue.add(
      `<h1>Not Signed In</h1><p>Please sign in to save theme settings</p>`
    );
    return;
  }

  const dropdown = document.querySelector("#themeDropdown");
  let theme = "auto";
  if (dropdown) {
    const selected = dropdown.querySelector(".custom-dropdown-option.selected");
    if (selected) theme = selected.dataset.value;
    else {
      const btnText = dropdown
        .querySelector(".dropdown-text")
        ?.textContent?.trim();
      if (btnText) theme = btnText.toLowerCase();
    }
  }

  const accent =
    localStorage.getItem("accentColor") ||
    document.getElementById("customColorPicker")?.value ||
    "#1185fe";

  try {
    const res = await query(`/profile/${currentUser.username}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ theme, accent_color: accent }),
    });

    const data = await res.json();
    if (data.error) {
      toastQueue.add(`<h1>Save Failed</h1><p>${data.error}</p>`);
      return;
    }

    if (data.success) {
      // update local copy
      currentUser.theme = theme;
      currentUser.accent_color = accent;
      // apply locally as well
      handleThemeModeChange(theme);
      applyAccentColor(accent);
      toastQueue.add(
        `<h1>Saved</h1><p>Your theme is now saved to your account</p>`
      );
    }
  } catch {
    toastQueue.add(`<h1>Save Failed</h1><p>Unable to contact server</p>`);
  }
};

let themeToastRef = null;
const handleThemeModeChange = (theme) => {
  const root = document.documentElement;
  const select = document.querySelector(".theme-mode-select");
  if (select) select.value = theme;
  if (theme === "auto") {
    localStorage.removeItem("theme");
    const systemDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    if (systemDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  } else if (theme === "dark") {
    root.classList.add("dark");
    localStorage.setItem("theme", "dark");
  } else {
    root.classList.remove("dark");
    localStorage.setItem("theme", "light");
  }

  if (!isRestoringState) {
    if (themeToastRef) {
      toastQueue.delete(themeToastRef.id);
    }
    themeToastRef = toastQueue.add(
      `<h1>Theme Changed</h1><p>Switched to ${theme} mode</p>`
    );
  }
};

const setAccentColor = (color, showToast = true) => {
  applyAccentColor(color);

  // Update all color options
  document.querySelectorAll(".color-option").forEach((option) => {
    option.classList.remove("active");
    if (option.dataset.color === color) {
      option.classList.add("active");
    }
  });

  // If it's a custom color, update the custom picker
  const customOption = document.querySelector(
    '.color-option[data-color="custom"]'
  );
  if (customOption && !document.querySelector(`[data-color="${color}"]`)) {
    customOption.classList.add("active");
    // ensure the custom option shows the selected color (remove gradient)
    customOption.style.background = color;
    const picker = customOption.querySelector(".custom-color-picker");
    if (picker) {
      picker.value = color;
      picker.style.background = color;
    }
  }

  if (showToast && !isRestoringState) {
    if (themeToastRef) toastQueue.delete(themeToastRef.id);
    themeToastRef = toastQueue.add(
      `<h1>Accent Color Changed</h1><p>Your accent color has been updated</p>`
    );
  }
};

const applyAccentColor = (color) => {
  const root = document.documentElement;
  root.style.setProperty("--primary", color);
  const rgb = hexToRgb(color);
  if (rgb)
    root.style.setProperty("--primary-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  root.style.setProperty("--primary-hover", adjustBrightness(color, -10));
  root.style.setProperty("--primary-focus", adjustBrightness(color, -20));
  localStorage.setItem("accentColor", color);
};

const loadCurrentThemeMode = () => {
  const savedTheme = localStorage.getItem("theme");
  let currentTheme = "auto";
  if (savedTheme === "dark") currentTheme = "dark";
  else if (savedTheme === "light") currentTheme = "light";

  const select = document.querySelector(".theme-mode-select");
  if (select) select.value = currentTheme;

  const dropdown = document.querySelector("#themeDropdown");
  if (dropdown) {
    const button = dropdown.querySelector(".dropdown-text");
    const options = dropdown.querySelectorAll(".custom-dropdown-option");

    options.forEach((option) => {
      option.classList.remove("selected");
      if (option.dataset.value === currentTheme) {
        option.classList.add("selected");
        if (button) {
          button.textContent = option.textContent.split(" ").slice(1).join(" ");
        }
      }
    });
  }
};

const loadCurrentAccentColor = () => {
  const savedColor = localStorage.getItem("accentColor") || "#1185fe";

  setTimeout(() => {
    document.querySelectorAll(".color-option").forEach((option) => {
      option.classList.remove("active");
    });

    const colorOption = document.querySelector(`[data-color="${savedColor}"]`);
    if (colorOption) {
      colorOption.classList.add("active");
      colorOption.style.backgroundColor = savedColor;
    } else {
      const customWrap = document.querySelector('[data-is-custom="true"]');
      if (customWrap) {
        customWrap.classList.add("active");
        customWrap.style.background = savedColor;
        const picker = customWrap.querySelector("#customColorPicker");
        if (picker) {
          picker.value = savedColor;
          picker.style.background = savedColor;
        }
      }
    }

    const picker = document.getElementById("customColorPicker");
    if (picker) {
      picker.value = savedColor;
    }
  }, 100);
};

const showModal = (modal) => {
  modal.style.display = "flex";
};
const hideModal = (modal) => {
  modal.style.display = "none";
};

const handleAddPasskey = async () => {
  try {
    const options = await query("/auth/passkey/register/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (options.error) {
      toastQueue.add(`<h1>Error</h1><p>${options.error}</p>`);
      return;
    }

    const { startRegistration } = window.SimpleWebAuthnBrowser;
    let attResp;
    try {
      attResp = await startRegistration({ optionsJSON: options });
    } catch (error) {
      console.error("Registration failed:", error);
      toastQueue.add(
        `<h1>Registration Cancelled</h1><p>Passkey registration was cancelled or failed</p>`
      );
      return;
    }

    const verificationJSON = await query("/auth/passkey/register/finish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(attResp),
    });

    if (verificationJSON.error) {
      toastQueue.add(
        `<h1>Verification Failed</h1><p>${verificationJSON.error}</p>`
      );
      return;
    }

    if (verificationJSON.verified) {
      toastQueue.add(`<h1>Success!</h1><p>Passkey added successfully</p>`);
      loadPasskeys();
    }
  } catch (error) {
    console.error("Failed to add passkey:", error);
    toastQueue.add(`<h1>Error</h1><p>Failed to add passkey</p>`);
  }
};

const handleUsernameChange = async () => {
  const newUsername = document.getElementById("newUsername").value.trim();

  if (!newUsername || newUsername.length < 3 || newUsername.length > 20) {
    toastQueue.add(
      `<h1>Invalid Username</h1><p>Username must be between 3 and 20 characters</p>`
    );
    return;
  }

  if (newUsername === currentUser?.username) {
    toastQueue.add(
      `<h1>No Change</h1><p>Please enter a different username</p>`
    );
    return;
  }

  try {
    const data = await query(`/profile/${currentUser.username}/username`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ newUsername }),
    });

    if (data.error) {
      toastQueue.add(`<h1>Username Change Failed</h1><p>${data.error}</p>`);
      return;
    }

    if (data.success) {
      currentUser.username = data.username;

      if (data.token) {
        localStorage.setItem("authToken", data.token);
      }

      hideModal(document.getElementById("changeUsernameModal"));
      toastQueue.add(
        `<h1>Username Changed!</h1><p>Your username is now @${data.username}</p>`
      );
    }
  } catch {
    toastQueue.add(
      `<h1>Username Change Failed</h1><p>Unable to connect to server</p>`
    );
  }
};

const handlePasswordChange = async () => {
  const hasPassword = currentUser?.password_hash !== null;
  const currentPassword = document.getElementById("current-password")?.value;
  const newPassword = document.getElementById("new-password").value;

  if (!newPassword || newPassword.length < 8) {
    toastQueue.add(
      `<h1>Invalid Password</h1><p>Password must be at least 8 characters long</p>`
    );
    return;
  }

  if (hasPassword && !currentPassword) {
    toastQueue.add(
      `<h1>Current Password Required</h1><p>Please enter your current password</p>`
    );
    return;
  }

  try {
    const data = await query(`/profile/${currentUser.username}/password`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: hasPassword ? currentPassword : undefined,
        newPassword,
      }),
    });

    if (data.error) {
      toastQueue.add(`<h1>Password Change Failed</h1><p>${data.error}</p>`);
      return;
    }

    if (data.success) {
      currentUser.password_hash = true;
      hideModal(document.getElementById("changePasswordModal"));
      toastQueue.add(
        `<h1>Password ${
          hasPassword ? "Changed" : "Set"
        }!</h1><p>Your password has been ${
          hasPassword ? "updated" : "set"
        } successfully</p>`
      );
    }
  } catch {
    toastQueue.add(
      `<h1>Password Change Failed</h1><p>Unable to connect to server</p>`
    );
  }
};

const handleAccountDeletion = async () => {
  const confirmationText = document.getElementById("deleteConfirmation").value;

  if (confirmationText !== "DELETE MY ACCOUNT") {
    toastQueue.add(
      `<h1>Confirmation Required</h1><p>Please type "DELETE MY ACCOUNT" exactly as shown</p>`
    );
    return;
  }

  try {
    const response = await query(`/profile/${currentUser.username}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ confirmationText }),
    });

    const data = await response.json();

    if (data.error) {
      toastQueue.add(`<h1>Account Deletion Failed</h1><p>${data.error}</p>`);
      return;
    }

    if (data.success) {
      hideModal(document.getElementById("deleteAccountModal"));
      toastQueue.add(
        `<h1>Account Deleted</h1><p>Your account has been permanently deleted</p>`
      );

      setTimeout(() => {
        localStorage.removeItem("authToken");
        window.location.href = "/account";
      }, 2000);
    }
  } catch {
    toastQueue.add(
      `<h1>Account Deletion Failed</h1><p>Unable to connect to server</p>`
    );
  }
};

export const openSettings = (section = "account") => {
  try {
    const page = showPage("settings", {
      path: `/settings/${section}`,
      recoverState: () => initializeSettings(),
    });

    if (!page) {
      initializeSettings();
      showPage("settings", { path: `/settings/${section}` });
    }

    return settingsPage;
  } catch (error) {
    console.error("Error opening settings:", error);
    initializeSettings();
    return settingsPage;
  }
};
