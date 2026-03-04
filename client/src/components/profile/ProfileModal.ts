import {
  buildDiceBearUrl,
  buildInitialsAvatarDataUrl,
  createAvatarPresets,
  fallbackAvatarAt,
  randomAvatarSeed,
} from "../../lib/avatars";
import {
  ProfileManager,
  normalizeProfileName,
  validateProfileName,
} from "../../lib/profile";
import { showModal } from "../../ui/modal";

function isNameSeedAvatar(name: string, avatar: string): boolean {
  return avatar === buildDiceBearUrl(name, "identicon");
}

export interface ProfileModalOptions {
  force?: boolean;
  title?: string;
  onSaved?: () => void;
}

export function openProfileModal(profile: ProfileManager, options: ProfileModalOptions = {}): void {
  const current = profile.get();
  let useNameSeed = isNameSeedAvatar(current.name, current.avatar);
  let selectedAvatar = current.avatar || buildDiceBearUrl(current.name, "identicon");
  let baseSeed = current.name || randomAvatarSeed();
  let presets = createAvatarPresets(baseSeed);

  const content = document.createElement("div");
  content.className = "profile-modal";
  content.innerHTML = `
    <div class="profile-preview panel-parchment panel-noise">
      <img class="profile-preview-avatar" alt="Selected avatar" />
      <div class="profile-preview-meta">
        <div class="profile-preview-name"></div>
        <div class="profile-preview-caption">Visible on your local client</div>
      </div>
    </div>
    <div class="modal-form-group">
      <label for="profile-name">Display Name</label>
      <input id="profile-name" type="text" maxlength="18" autocomplete="nickname" />
    </div>
    <label class="profile-seed-toggle">
      <input id="profile-name-seed" type="checkbox" ${useNameSeed ? "checked" : ""} />
      Use my name as avatar seed
    </label>
    <div class="profile-avatar-toolbar">
      <button type="button" class="btn-ivory-engraved profile-randomize">Randomize choices</button>
    </div>
    <div class="profile-avatar-grid" role="listbox" aria-label="Avatar choices"></div>
    <p class="profile-status" aria-live="polite"></p>
  `;

  const nameInput = content.querySelector("#profile-name") as HTMLInputElement;
  const useNameSeedInput = content.querySelector("#profile-name-seed") as HTMLInputElement;
  const randomizeBtn = content.querySelector(".profile-randomize") as HTMLButtonElement;
  const grid = content.querySelector(".profile-avatar-grid") as HTMLElement;
  const status = content.querySelector(".profile-status") as HTMLElement;
  const previewAvatar = content.querySelector(".profile-preview-avatar") as HTMLImageElement;
  const previewName = content.querySelector(".profile-preview-name") as HTMLElement;
  nameInput.value = current.name;

  const setPreview = (): void => {
    const normalized = normalizeProfileName(nameInput.value) || "Player";
    const fallback = fallbackAvatarAt(Math.abs(normalized.charCodeAt(0) || 0) % 12);
    const initials = buildInitialsAvatarDataUrl(normalized);
    const avatar = useNameSeedInput.checked
      ? buildDiceBearUrl(normalized, "identicon")
      : selectedAvatar;
    previewName.textContent = normalized;
    previewAvatar.src = avatar;
    previewAvatar.onerror = () => {
      if (previewAvatar.src.endsWith(fallback)) {
        previewAvatar.src = initials;
        return;
      }
      previewAvatar.src = fallback;
    };
  };

  const renderAvatarGrid = (): void => {
    grid.innerHTML = "";
    presets.forEach((preset, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "profile-avatar-option";
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-label", `Avatar ${idx + 1}`);
      btn.setAttribute("aria-selected", String(selectedAvatar === preset.url));
      if (selectedAvatar === preset.url && !useNameSeedInput.checked) {
        btn.classList.add("selected");
      }

      const img = document.createElement("img");
      img.src = preset.url;
      img.alt = `Avatar option ${idx + 1}`;
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => {
        if (img.src.endsWith(preset.fallback)) {
          img.src = buildInitialsAvatarDataUrl(normalizeProfileName(nameInput.value) || "Player");
          return;
        }
        img.src = preset.fallback;
      };

      btn.appendChild(img);
      btn.addEventListener("click", () => {
        useNameSeedInput.checked = false;
        selectedAvatar = preset.url;
        renderAvatarGrid();
        setPreview();
      });
      grid.appendChild(btn);
    });
  };

  nameInput.addEventListener("input", () => {
    if (useNameSeedInput.checked) {
      selectedAvatar = buildDiceBearUrl(normalizeProfileName(nameInput.value) || "Player", "identicon");
    }
    setPreview();
  });

  useNameSeedInput.addEventListener("change", () => {
    if (useNameSeedInput.checked) {
      selectedAvatar = buildDiceBearUrl(normalizeProfileName(nameInput.value) || "Player", "identicon");
    }
    renderAvatarGrid();
    setPreview();
  });

  randomizeBtn.addEventListener("click", () => {
    baseSeed = randomAvatarSeed();
    presets = createAvatarPresets(baseSeed);
    useNameSeedInput.checked = false;
    renderAvatarGrid();
    setPreview();
  });

  renderAvatarGrid();
  setPreview();

  showModal({
    title: options.title || "Profile",
    content,
    size: "md",
    dismissible: !options.force,
    scroll: true,
    actions: [
      ...(options.force ? [] : [{ label: "Cancel", onClick: () => {} }]),
      {
        label: "Save",
        className: "btn-primary",
        onClick: () => {
          const normalized = normalizeProfileName(nameInput.value);
          const err = validateProfileName(normalized);
          if (err) {
            status.textContent = err;
            status.classList.add("error");
            nameInput.focus();
            return false;
          }

          const avatar = useNameSeedInput.checked
            ? buildDiceBearUrl(normalized, "identicon")
            : selectedAvatar;

          const saveErr = profile.set({ name: normalized, avatar });
          if (saveErr) {
            status.textContent = saveErr;
            status.classList.add("error");
            return false;
          }

          profile.markComplete();
          status.textContent = "";
          status.classList.remove("error");
          options.onSaved?.();
          return true;
        },
      },
    ],
  });

  setTimeout(() => {
    nameInput.focus();
    nameInput.select();
  }, 40);
}
