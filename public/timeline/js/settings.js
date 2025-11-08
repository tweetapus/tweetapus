import toastQueue from "../../shared/toasts.js";
import { createModal } from "../../shared/ui-utils.js";
import query from "./api.js";
import { authToken } from "./auth.js";

let currentUser = null;
let currentUserPromise = null;

const ensureCurrentUser = async (forceReload = false) => {
  if (!authToken) return null;

  if (!forceReload && currentUser) {
    return currentUser;
  }

  if (!forceReload && currentUserPromise) {
    return currentUserPromise;
  }

  currentUserPromise = (async () => {
    try {
      const data = await query("/auth/me?requestPreload=1");
      if (data?.user) {
        currentUser = {
          ...data.user,
        };
        return currentUser;
      }
      currentUser = null;
      return null;
    } catch (error) {
      console.error("Failed to query user data:", error);
      currentUser = null;
      return null;
    } finally {
      currentUserPromise = null;
    }
  })();

  return currentUserPromise;
};

const settingsPages = [
  { key: "account", title: "Account", content: () => createAccountContent() },
  {
    key: "passkeys",
    title: "Passkeys",
    content: () => createPasskeysContent(),
  },
  { key: "themes", title: "Themes", content: () => createThemesContent() },
  {
    key: "scheduled",
    title: "Scheduled",
    content: () => createScheduledContent(),
  },
  {
    key: "others",
    title: "Others",
    content: () => createOthersContent(),
  },
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
    { v: "light", t: "Light" },
    { v: "dark", t: "Dark" },
    { v: "auto", t: "Auto" },
  ].forEach(({ v, t }) => {
    const option = document.createElement("div");
    option.className = "custom-dropdown-option";
    option.dataset.value = v;
    option.textContent = t;
    dropdownMenu.appendChild(option);
  });

  dropdown.appendChild(dropdownButton);
  dropdown.appendChild(dropdownMenu);
  themeControl.appendChild(dropdown);

  themeItem.appendChild(themeLabel);
  themeItem.appendChild(themeControl);
  group.appendChild(themeItem);

  const saveItem = document.createElement("div");
  saveItem.className = "setting-item";
  const saveLabel = document.createElement("div");
  saveLabel.className = "setting-label";
  const saveControl = document.createElement("div");
  saveControl.className = "setting-control";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn primary";
  saveBtn.id = "saveThemeBtn";
  saveBtn.textContent = "Save to Account";
  saveControl.appendChild(saveBtn);
  saveItem.appendChild(saveLabel);
  saveItem.appendChild(saveControl);
  group.appendChild(saveItem);

  section.appendChild(group);
  attachThemeSectionHandlers(section);

  return section;
};

const createAccountContent = () => {
  const section = document.createElement("div");
  section.className = "settings-section";

  const h1 = document.createElement("h1");
  h1.textContent = "Account Settings";
  section.appendChild(h1);

  const privacyGroup = document.createElement("div");
  privacyGroup.className = "setting-group";
  const privacyH2 = document.createElement("h2");
  privacyH2.textContent = "Privacy";
  privacyGroup.appendChild(privacyH2);

  const privateItem = document.createElement("div");
  privateItem.className = "setting-item";

  const privateLabel = document.createElement("div");
  privateLabel.className = "setting-label";
  const privateTitle = document.createElement("div");
  privateTitle.className = "setting-title";
  privateTitle.textContent = "Private Account";
  const privateDesc = document.createElement("div");
  privateDesc.className = "setting-description";
  privateDesc.textContent =
    "When enabled, only approved followers can see your posts";
  privateLabel.appendChild(privateTitle);
  privateLabel.appendChild(privateDesc);

  const privateControl = document.createElement("div");
  privateControl.className = "setting-control";

  const privateToggle = document.createElement("label");
  privateToggle.className = "toggle-switch";
  privateToggle.innerHTML = `
    <input type="checkbox" id="private-account-toggle" />
    <span class="toggle-slider"></span>
  `;

  privateControl.appendChild(privateToggle);
  privateItem.appendChild(privateLabel);
  privateItem.appendChild(privateControl);
  privacyGroup.appendChild(privateItem);

  section.appendChild(privacyGroup);

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

  attachAccountSectionHandlers(section);

  return section;
};

const openChangeUsernameModal = async () => {
  const userForModal = await ensureCurrentUser();
  if (!userForModal) {
    toastQueue.add(
      "<h1>Not Signed In</h1><p>Please sign in to manage your account</p>"
    );
    return;
  }

  const modal = document.getElementById("changeUsernameModal");
  if (!modal) return;

  showModal(modal);

  const usernameInput = document.getElementById("newUsername");
  if (usernameInput) {
    usernameInput.value = userForModal.username || "";
  }
};

const openChangePasswordModal = async () => {
  const userForPassword = await ensureCurrentUser();
  if (!userForPassword) {
    toastQueue.add(
      "<h1>Not Signed In</h1><p>Please sign in to manage your password</p>"
    );
    return;
  }

  const modal = document.getElementById("changePasswordModal");
  if (!modal) return;

  const hasPassword = !!userForPassword.has_password;

  const header = modal.querySelector("h2");
  if (header) {
    header.textContent = hasPassword ? "Change Password" : "Set Password";
  }

  const submit = modal.querySelector("button[type='submit']");
  if (submit) {
    submit.textContent = hasPassword ? "Change Password" : "Set Password";
  }

  const currentPasswordGroup = document.getElementById("currentPasswordGroup");
  if (currentPasswordGroup) {
    currentPasswordGroup.style.display = hasPassword ? "block" : "none";
  }

  const form = document.getElementById("changePasswordForm");
  if (form && typeof form.reset === "function") {
    form.reset();
  }

  showModal(modal);
};

const openDeleteAccountModal = async () => {
  const userForDeletion = await ensureCurrentUser();
  if (!userForDeletion) {
    toastQueue.add(
      "<h1>Not Signed In</h1><p>Please sign in to manage your account</p>"
    );
    return;
  }

  const modal = document.getElementById("deleteAccountModal");
  if (!modal) return;

  showModal(modal);
};

const attachAccountSectionHandlers = (root) => {
  if (!root) return;

  const usernameBtn = root.querySelector("#changeUsernameBtn");
  if (usernameBtn && !usernameBtn.dataset.bound) {
    usernameBtn.dataset.bound = "1";
    usernameBtn.addEventListener("click", (event) => {
      event.preventDefault();
      openChangeUsernameModal();
    });
  }

  const passwordBtn = root.querySelector("#changePasswordBtn");
  if (passwordBtn && !passwordBtn.dataset.bound) {
    passwordBtn.dataset.bound = "1";
    passwordBtn.addEventListener("click", (event) => {
      event.preventDefault();
      openChangePasswordModal();
    });
  }

  const deleteBtn = root.querySelector("#deleteAccountBtn");
  if (deleteBtn && !deleteBtn.dataset.bound) {
    deleteBtn.dataset.bound = "1";
    deleteBtn.addEventListener("click", (event) => {
      event.preventDefault();
      openDeleteAccountModal();
    });
  }
};

const attachThemeSectionHandlers = (root) => {
  if (!root) return;
  const saveBtn = root.querySelector("#saveThemeBtn");
  if (saveBtn && !saveBtn.dataset.bound) {
    saveBtn.dataset.bound = "1";
    saveBtn.addEventListener("click", (event) => {
      event.preventDefault();
      saveThemeToServer();
    });
  }
};

const enhanceSettingsSection = (root) => {
  if (!root) return;
  if (root.querySelector("#changeUsernameBtn")) {
    attachAccountSectionHandlers(root);
  }
  if (root.querySelector("#saveThemeBtn")) {
    attachThemeSectionHandlers(root);
  }
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
      const date = passkey.created_at
        ? new Date(passkey.created_at)
        : new Date();
      createdAt.textContent = `Created: ${date.toLocaleDateString()}`;

      info.appendChild(name);
      info.appendChild(createdAt);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn danger";
      deleteBtn.textContent = "Remove";
      deleteBtn.style.maxWidth = "120px";
      deleteBtn.onclick = () => deletePasskey(passkey.cred_id);

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

const createOthersContent = () => {
  const section = document.createElement("div");
  section.className = "settings-section";

  const h1 = document.createElement("h1");
  h1.textContent = "Others";
  section.appendChild(h1);

  const group = document.createElement("div");
  group.className = "setting-group";

  const h2 = document.createElement("h2");
  h2.textContent = "Composer";
  group.appendChild(h2);

  const cardComposerItem = document.createElement("div");
  cardComposerItem.className = "setting-item";

  const cardComposerLabel = document.createElement("div");
  cardComposerLabel.className = "setting-label";
  const cardComposerTitle = document.createElement("div");
  cardComposerTitle.className = "setting-title";
  cardComposerTitle.textContent = "Card Composer";
  const cardComposerDesc = document.createElement("div");
  cardComposerDesc.className = "setting-description";
  cardComposerDesc.textContent = "Create interactive cards";
  cardComposerLabel.appendChild(cardComposerTitle);
  cardComposerLabel.appendChild(cardComposerDesc);

  const cardComposerControl = document.createElement("div");
  cardComposerControl.className = "setting-control";

  const cardComposerBtn = document.createElement("button");
  cardComposerBtn.className = "btn primary";
  cardComposerBtn.id = "open-card-composer-btn";
  cardComposerBtn.textContent = "Open Card Composer";
  cardComposerBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await openCardComposer();
  });

  cardComposerControl.appendChild(cardComposerBtn);
  cardComposerItem.appendChild(cardComposerLabel);
  cardComposerItem.appendChild(cardComposerControl);
  group.appendChild(cardComposerItem);

  section.appendChild(group);

  const algoGroup = document.createElement("div");
  algoGroup.className = "setting-group";

  const algoH2 = document.createElement("h2");
  algoH2.textContent = "Timeline";
  algoGroup.appendChild(algoH2);

  const cAlgoItem = document.createElement("div");
  cAlgoItem.className = "setting-item";

  const cAlgoLabel = document.createElement("div");
  cAlgoLabel.className = "setting-label";
  const cAlgoTitle = document.createElement("div");
  cAlgoTitle.className = "setting-title";
  cAlgoTitle.textContent = "C Algorithm";
  const cAlgoDesc = document.createElement("div");
  cAlgoDesc.className = "setting-description";
  cAlgoDesc.textContent = "The algorithm but in C";
  cAlgoLabel.appendChild(cAlgoTitle);
  cAlgoLabel.appendChild(cAlgoDesc);

  const cAlgoControl = document.createElement("div");
  cAlgoControl.className = "setting-control";

  const cAlgoToggle = document.createElement("label");
  cAlgoToggle.className = "toggle-switch";
  cAlgoToggle.innerHTML = `
    <input type="checkbox" id="c-algorithm-toggle" />
    <span class="toggle-slider"></span>
  `;

  cAlgoControl.appendChild(cAlgoToggle);
  cAlgoItem.appendChild(cAlgoLabel);
  cAlgoItem.appendChild(cAlgoControl);
  algoGroup.appendChild(cAlgoItem);

  section.appendChild(algoGroup);

  setTimeout(async () => {
    const checkbox = document.getElementById("c-algorithm-toggle");
    if (!checkbox) return;

    try {
      const data = await query("/auth/me");
      const serverEnabled = !!data.user?.use_c_algorithm;
      checkbox.checked = serverEnabled;
      checkbox.defaultChecked = serverEnabled;
      checkbox.dataset.serverState = serverEnabled ? "on" : "off";
      checkbox.setAttribute("aria-checked", serverEnabled ? "true" : "false");
    } catch (error) {
      console.error("Failed to load C algorithm setting:", error);
      checkbox.checked = false;
      checkbox.defaultChecked = false;
      checkbox.dataset.serverState = "off";
      checkbox.setAttribute("aria-checked", "false");
    }

    checkbox.addEventListener("change", async (e) => {
      const enabled = e.target.checked;
      try {
        const result = await query("/profile/settings/c-algorithm", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ enabled }),
        });

        if (result.success) {
          checkbox.dataset.serverState = enabled ? "on" : "off";
          checkbox.setAttribute("aria-checked", enabled ? "true" : "false");
          toastQueue.add(
            `<h1>C Algorithm ${enabled ? "Enabled" : "Disabled"}</h1><p>${
              enabled
                ? "Timeline will now use the C-based ranking algorithm"
                : "Timeline will use chronological sorting"
            }</p>`
          );

          if (window.location.pathname === "/" || !pathname) {
            window.location.reload();
          }
        } else {
          e.target.checked = !enabled;
          checkbox.setAttribute("aria-checked", !enabled ? "true" : "false");
          toastQueue.add(`<h1>Failed to update setting</h1>`);
        }
      } catch {
        e.target.checked = !enabled;
        checkbox.setAttribute("aria-checked", !enabled ? "true" : "false");
        toastQueue.add(`<h1>Failed to update setting</h1>`);
      }
    });
  }, 100);

  return section;
};

const createScheduledContent = () => {
  const section = document.createElement("div");
  section.className = "settings-section";

  const h1 = document.createElement("h1");
  h1.textContent = "Scheduled Tweets";
  section.appendChild(h1);

  const group = document.createElement("div");
  group.className = "setting-group";

  const h2 = document.createElement("h2");
  h2.textContent = "Upcoming Posts";
  group.appendChild(h2);

  const listDiv = document.createElement("div");
  listDiv.id = "scheduled-posts-list";
  listDiv.style.display = "flex";
  listDiv.style.flexDirection = "column";
  listDiv.style.gap = "12px";
  group.appendChild(listDiv);

  section.appendChild(group);

  setTimeout(() => {
    loadScheduledPosts();
  }, 100);

  return section;
};

const loadScheduledPosts = async () => {
  const listDiv = document.getElementById("scheduled-posts-list");
  if (!listDiv) return;

  try {
    const data = await query("/scheduled/");

    if (data.error) {
      listDiv.innerHTML = `<p style="color: var(--text-secondary); font-size: 14px;">Failed to load scheduled posts</p>`;
      return;
    }

    if (!data.scheduledPosts || data.scheduledPosts.length === 0) {
      listDiv.innerHTML = `<p style="color: var(--text-secondary); font-size: 14px;">No scheduled posts yet</p>`;
      return;
    }

    listDiv.innerHTML = "";
    data.scheduledPosts.forEach((post) => {
      const item = document.createElement("div");
      item.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 16px;
        background-color: var(--bg-primary);
        border-radius: 8px;
        border: 1px solid var(--border-primary);
      `;

      const header = document.createElement("div");
      header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;

      const scheduledTime = document.createElement("div");
      scheduledTime.style.cssText = `
        font-weight: 500;
        color: var(--primary);
        font-size: 14px;
      `;
      scheduledTime.textContent = `Scheduled for ${new Date(
        post.scheduled_for
      ).toLocaleString()}`;

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn danger";
      deleteBtn.textContent = "Delete";
      deleteBtn.style.cssText = `
        padding: 6px 12px;
        font-size: 13px;
        max-width: 100px;
      `;
      deleteBtn.onclick = async () => {
        if (confirm("Are you sure you want to delete this scheduled post?")) {
          try {
            const result = await query(`/scheduled/${post.id}`, {
              method: "DELETE",
            });

            if (result.success) {
              toastQueue.add(`<h1>Deleted</h1><p>Scheduled post deleted</p>`);
              loadScheduledPosts();
            } else {
              toastQueue.add(`<h1>Error</h1><p>Failed to delete post</p>`);
            }
          } catch {
            toastQueue.add(`<h1>Error</h1><p>Failed to delete post</p>`);
          }
        }
      };

      header.appendChild(scheduledTime);
      header.appendChild(deleteBtn);

      const content = document.createElement("div");
      content.style.cssText = `
        color: var(--text-primary);
        font-size: 14px;
        word-wrap: break-word;
      `;
      content.textContent = post.content;

      item.appendChild(header);
      item.appendChild(content);
      listDiv.appendChild(item);
    });
  } catch (error) {
    console.error("Failed to load scheduled posts:", error);
    listDiv.innerHTML = `<p style="color: var(--text-secondary); font-size: 14px;">Failed to load scheduled posts</p>`;
  }
};

const createChangeUsernameModal = () => {
  const overlay = document.createElement("div");
  overlay.id = "changeUsernameModal";
  overlay.className = "settings-modal-overlay";
  overlay.style.display = "none";

  const modal = document.createElement("div");
  modal.className = "modal settings-form-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "changeUsernameHeading");

  const header = document.createElement("div");
  header.className = "modal-header";
  const h2 = document.createElement("h2");
  h2.id = "changeUsernameHeading";
  h2.textContent = "Change Username";
  const close = document.createElement("button");
  close.className = "close-btn";
  close.id = "closeUsernameModal";
  close.type = "button";
  close.setAttribute("aria-label", "Close change username dialog");
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

  modal.appendChild(header);
  modal.appendChild(body);
  overlay.appendChild(modal);
  return overlay;
};

const createDeleteAccountModal = () => {
  const overlay = document.createElement("div");
  overlay.id = "deleteAccountModal";
  overlay.className = "settings-modal-overlay";
  overlay.style.display = "none";

  const modal = document.createElement("div");
  modal.className = "modal settings-form-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "deleteAccountHeading");

  const header = document.createElement("div");
  header.className = "modal-header";
  const h2 = document.createElement("h2");
  h2.id = "deleteAccountHeading";
  h2.textContent = "Delete Account";
  const close = document.createElement("button");
  close.className = "close-btn";
  close.id = "closeDeleteModal";
  close.type = "button";
  close.setAttribute("aria-label", "Close delete account dialog");
  close.textContent = "×";
  header.appendChild(h2);
  header.appendChild(close);

  const body = document.createElement("div");
  body.className = "modal-body";
  const warning = document.createElement("p");
  warning.innerHTML =
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
  body.appendChild(warning);
  body.appendChild(form);

  modal.appendChild(header);
  modal.appendChild(body);
  overlay.appendChild(modal);
  return overlay;
};

const createChangePasswordModal = () => {
  const overlay = document.createElement("div");
  overlay.id = "changePasswordModal";
  overlay.className = "settings-modal-overlay";
  overlay.style.display = "none";

  const modal = document.createElement("div");
  modal.className = "modal settings-form-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "changePasswordHeading");
  modal.setAttribute("aria-describedby", "passwordModalDescription");

  const header = document.createElement("div");
  header.className = "modal-header";
  const h2 = document.createElement("h2");
  h2.id = "changePasswordHeading";
  h2.textContent = "Change Password";
  const close = document.createElement("button");
  close.className = "close-btn";
  close.id = "closePasswordModal";
  close.type = "button";
  close.setAttribute("aria-label", "Close change password dialog");
  close.textContent = "×";
  header.appendChild(h2);
  header.appendChild(close);

  const body = document.createElement("div");
  body.className = "modal-body";
  const description = document.createElement("p");
  description.id = "passwordModalDescription";
  description.textContent =
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
  const hint = document.createElement("small");
  hint.textContent = "Password must be at least 8 characters long.";
  fgNew.appendChild(labelNew);
  fgNew.appendChild(inputNew);
  fgNew.appendChild(hint);

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
  body.appendChild(description);
  body.appendChild(form);

  modal.appendChild(header);
  modal.appendChild(body);
  overlay.appendChild(modal);
  return overlay;
};

const ensureAccountModals = () => {
  const body = document.body;
  if (!body) return;

  if (!document.getElementById("changeUsernameModal")) {
    body.appendChild(createChangeUsernameModal());
  }

  if (!document.getElementById("changePasswordModal")) {
    body.appendChild(createChangePasswordModal());
  }

  if (!document.getElementById("deleteAccountModal")) {
    body.appendChild(createDeleteAccountModal());
  }
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

  document.querySelector(".main-content").appendChild(settingsContainer);
  return settingsContainer;
};

let settingsPage;
let settingsInitialized = false;
let eventHandlersSetup = false;

const initializeSettings = () => {
  if (settingsInitialized) return;
  settingsInitialized = true;

  const contentArea = settingsPage.querySelector("#settings-content");
  const tabButtons = settingsPage.querySelectorAll(".settings-tab-btn");

  const switchTab = (tabKey) => {
    const page = settingsPages.find((p) => p.key === tabKey);
    if (!page) {
      window.history.replaceState(null, null, "/settings/account");
      openSettings("account");
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
    enhanceSettingsSection(node);

    const newPath = `/settings/${tabKey}`;
    if (window.location.pathname !== newPath) {
      window.history.replaceState(null, null, newPath);
    }

    if (tabKey === "themes") {
      setTimeout(() => {
        loadCurrentThemeMode();
      }, 50);
    }

    if (tabKey === "account") {
      setTimeout(() => {
        loadPrivacySettings();
      }, 50);
    }
  };

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.tab);
    });
  });

  const backButton = settingsPage.querySelector(".back-button");
  backButton.addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "/";
  });

  if (!eventHandlersSetup) {
    eventHandlersSetup = true;
    setupSettingsEventHandlers();
  }
};

const setupSettingsEventHandlers = async () => {
  // Ensure we have the latest user data so toggles/modals reflect server state.
  ensureAccountModals();

  const user = await ensureCurrentUser();
  if (user?.theme) {
    localStorage.setItem("theme", user.theme);
    handleThemeModeChange(user.theme);
  }

  document.addEventListener("click", async (event) => {
    const target = event.target;

    if (target.closest?.(".custom-dropdown-button")) {
      const dropdown = target.closest?.(".custom-dropdown");
      const isOpen = dropdown?.classList?.contains("open");

      document
        .querySelectorAll(".custom-dropdown")
        .forEach((d) => d.classList.remove("open"));

      if (!isOpen) {
        dropdown.classList.add("open");
      }
    }

    const optionEl = target.closest?.(".custom-dropdown-option");
    if (optionEl) {
      const value = optionEl.dataset?.value;
      if (!value) return;
      const dropdown = optionEl.closest?.(".custom-dropdown");
      const button = dropdown?.querySelector(
        ".custom-dropdown-button .dropdown-text"
      );
      const hiddenSelect =
        dropdown?.parentElement?.querySelector(".theme-mode-select");

      if (button) button.textContent = optionEl.textContent;

      if (hiddenSelect) {
        hiddenSelect.value = value;
      }

      dropdown
        ?.querySelectorAll(".custom-dropdown-option")
        .forEach((opt) => opt.classList.remove("selected"));
      optionEl.classList.add("selected");

      dropdown?.classList.remove("open");

      handleThemeModeChange(value);
    }

    // Save theme/account-wide preferences
    if (target.closest?.("#saveThemeBtn")) {
      saveThemeToServer();
    }

    if (!target.closest?.(".custom-dropdown")) {
      document
        .querySelectorAll(".custom-dropdown")
        .forEach((d) => d.classList.remove("open"));
    }

    if (target.closest?.("#changeUsernameBtn")) {
      event.preventDefault();
      await openChangeUsernameModal();
      return;
    }

    if (target.closest?.("#addPasskeyBtn")) {
      handleAddPasskey();
    }

    if (target.closest?.("#open-card-composer-btn")) {
      event.preventDefault();
      openCardComposer();
    }

    if (target.closest?.("#changePasswordBtn")) {
      event.preventDefault();
      await openChangePasswordModal();
      return;
    }

    if (target.closest?.("#deleteAccountBtn")) {
      event.preventDefault();
      await openDeleteAccountModal();
      return;
    }

    if (
      target.classList?.contains("close-btn") ||
      target.id?.includes("cancel") ||
      target.id?.includes("close")
    ) {
      const overlay =
        target.closest?.(".settings-modal-overlay") ||
        target.closest?.(".modal");
      if (overlay) hideModal(overlay);
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
    if (event.target.classList?.contains("theme-mode-select")) {
      handleThemeModeChange(event.target.value);
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target.classList?.contains("settings-modal-overlay")) {
      hideModal(event.target);
    }
  });

  loadCurrentThemeMode();
};

const saveThemeToServer = async () => {
  const user = await ensureCurrentUser();
  if (!user) {
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

  try {
    const data = await query(`/profile/${user.username}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ theme }),
    });

    if (data.error) {
      toastQueue.add(`<h1>Save Failed</h1><p>${data.error}</p>`);
      return;
    }

    if (data.success) {
      currentUser = {
        ...user,
        theme,
      };
      handleThemeModeChange(theme);
      toastQueue.add(
        `<h1>Saved</h1><p>Your theme is now saved to your account</p>`
      );
    }
  } catch {
    toastQueue.add(`<h1>Save Failed</h1><p>Unable to contact server</p>`);
  }
};

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
};

const loadCurrentThemeMode = () => {
  let currentTheme = "auto";

  if (currentUser?.theme) {
    currentTheme = currentUser.theme;
  } else {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") currentTheme = "dark";
    else if (savedTheme === "light") currentTheme = "light";
  }

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
          button.textContent = option.textContent;
        }
      }
    });
  }
};

const loadPrivacySettings = async () => {
  const checkbox = document.getElementById("private-account-toggle");
  if (!checkbox) return;

  try {
    const user = await ensureCurrentUser();
    const serverEnabled = !!user?.private;
    checkbox.checked = serverEnabled;
    checkbox.defaultChecked = serverEnabled;
    checkbox.dataset.serverState = serverEnabled ? "on" : "off";
    checkbox.setAttribute("aria-checked", serverEnabled ? "true" : "false");
    checkbox.disabled = !user;
  } catch (error) {
    console.error("Failed to load privacy setting:", error);
    checkbox.checked = false;
    checkbox.defaultChecked = false;
    checkbox.dataset.serverState = "off";
    checkbox.setAttribute("aria-checked", "false");
    checkbox.disabled = true;
  }

  checkbox.addEventListener("change", async (e) => {
    const enabled = e.target.checked;
    try {
      const result = await query("/profile/settings/private", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled }),
      });

      if (result.success) {
        checkbox.dataset.serverState = enabled ? "on" : "off";
        checkbox.setAttribute("aria-checked", enabled ? "true" : "false");
        currentUser = {
          ...(currentUser || {}),
          private: enabled,
        };
        toastQueue.add(
          `<h1>Privacy ${enabled ? "Enabled" : "Disabled"}</h1><p>${
            enabled
              ? "Your account is now private. Only approved followers can see your posts."
              : "Your account is now public. Anyone can see your posts."
          }</p>`
        );
      } else {
        e.target.checked = !enabled;
        checkbox.setAttribute("aria-checked", !enabled ? "true" : "false");
        toastQueue.add(`<h1>Failed to update setting</h1>`);
      }
    } catch {
      e.target.checked = !enabled;
      checkbox.setAttribute("aria-checked", !enabled ? "true" : "false");
      toastQueue.add(`<h1>Failed to update setting</h1>`);
    }
  });
};

const showModal = (element) => {
  if (!element) return;
  const overlay = element.classList?.contains("settings-modal-overlay")
    ? element
    : element.closest?.(".settings-modal-overlay") || element;
  overlay.style.display = "flex";
};
const hideModal = (element) => {
  if (!element) return;
  const overlay = element.classList?.contains("settings-modal-overlay")
    ? element
    : element.closest?.(".settings-modal-overlay") || element;
  overlay.style.display = "none";
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
  const user = await ensureCurrentUser();
  if (!user) {
    toastQueue.add(
      `<h1>Not Signed In</h1><p>Please sign in to change your username</p>`
    );
    return;
  }

  const newUsername = document.getElementById("newUsername").value.trim();

  if (!newUsername || newUsername.length < 3 || newUsername.length > 20) {
    toastQueue.add(
      `<h1>Invalid Username</h1><p>Username must be between 3 and 20 characters</p>`
    );
    return;
  }

  if (newUsername === user.username) {
    toastQueue.add(
      `<h1>No Change</h1><p>Please enter a different username</p>`
    );
    return;
  }

  try {
    const data = await query(`/profile/${user.username}/username`, {
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
      currentUser = {
        ...user,
        username: data.username,
      };

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
  const user = await ensureCurrentUser();
  if (!user) {
    toastQueue.add(
      `<h1>Not Signed In</h1><p>Please sign in to change your password</p>`
    );
    return;
  }

  const hasPassword = !!user.has_password;
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
    const data = await query(`/profile/${user.username}/password`, {
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
      currentUser = {
        ...user,
        has_password: true,
      };
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
  const user = await ensureCurrentUser();
  if (!user) {
    toastQueue.add(
      `<h1>Not Signed In</h1><p>Please sign in to delete your account</p>`
    );
    return;
  }

  const confirmationText = document.getElementById("deleteConfirmation").value;

  if (confirmationText !== "DELETE MY ACCOUNT") {
    toastQueue.add(
      `<h1>Confirmation Required</h1><p>Please type "DELETE MY ACCOUNT" exactly as shown</p>`
    );
    return;
  }

  try {
    const data = await query(`/profile/${user.username}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ confirmationText }),
    });

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
  if (!settingsPage) {
    settingsPage = createSettingsPage();
  }

  Object.values(
    document.querySelectorAll(
      ".timeline, .tweetPage, .profile, .notifications, .search-page, .bookmarks-page, .direct-messages, .dm-conversation"
    )
  ).forEach((p) => {
    if (p) {
      p.style.display = "none";
      p.classList.remove("page-active");
    }
  });

  settingsPage.style.display = "flex";
  settingsPage.classList.add("page-active");

  if (!settingsInitialized) {
    initializeSettings();
  }

  const tabButtons = settingsPage.querySelectorAll(".settings-tab-btn");
  const contentArea = settingsPage.querySelector("#settings-content");
  const page = settingsPages.find((p) => p.key === section);

  if (page) {
    tabButtons.forEach((btn) => {
      if (btn.dataset.tab === section) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    contentArea.textContent = "";
    const node = page.content();
    contentArea.appendChild(node);
    enhanceSettingsSection(node);

    if (section === "themes") {
      setTimeout(() => {
        loadCurrentThemeMode();
      }, 50);
    }
  }

  return settingsPage;
};

export const openCardComposer = async () => {
  const { createComposer } = await import("./composer.js");
  const { createModal } = await import("../../shared/ui-utils.js");

  const composerEl = await createComposer({
    callback: () => {
      toastQueue.add(
        `<h1>Card Posted!</h1><p>Your interactive card has been posted</p>`
      );
      if (modal?.close) {
        modal.close();
      }
    },
    placeholder: "Create an interactive card...",
    autofocus: true,
    cardOnly: true,
  });

  const modal = createModal({
    title: "Card Composer",
    content: composerEl,
    className: "card-composer-modal",
    onClose: () => {},
  });

  return modal;
};

export const openSettingsModal = (section = "account") => {
  const modalContent = document.createElement("div");
  modalContent.className = "settings-modal-wrapper";

  const sidebar = document.createElement("div");
  sidebar.className = "settings-modal-sidebar";

  settingsPages.forEach((page) => {
    const btn = document.createElement("button");
    btn.className = `settings-modal-tab${
      page.key === section ? " active" : ""
    }`;
    btn.dataset.tab = page.key;
    btn.textContent = page.title;
    sidebar.appendChild(btn);
  });

  const contentWrapper = document.createElement("div");
  contentWrapper.className = "settings-modal-content-wrapper";

  const contentArea = document.createElement("div");
  contentArea.id = "settings-modal-content";
  contentWrapper.appendChild(contentArea);

  modalContent.appendChild(sidebar);
  modalContent.appendChild(contentWrapper);

  const modal = createModal({
    title: "Settings",
    content: modalContent,
    className: "settings-modal",
    onClose: () => {},
  });

  if (!eventHandlersSetup) {
    eventHandlersSetup = true;
    setupSettingsEventHandlers();
  }

  const switchTab = (tabKey) => {
    const page = settingsPages.find((p) => p.key === tabKey);
    if (!page) return;

    sidebar.querySelectorAll(".settings-modal-tab").forEach((btn) => {
      if (btn.dataset.tab === tabKey) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    contentArea.textContent = "";
    const node = page.content();
    contentArea.appendChild(node);
    enhanceSettingsSection(node);

    if (tabKey === "themes") {
      setTimeout(() => {
        loadCurrentThemeMode();
      }, 50);
    }
  };

  sidebar.querySelectorAll(".settings-modal-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.tab);
    });
  });

  switchTab(section);

  return modal;
};
