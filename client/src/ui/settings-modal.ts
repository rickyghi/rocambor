import { drawCard } from "../canvas/cards";
import {
  getCardSkinDefinition,
  listCardSkins,
  type CardSkinDefinition,
} from "../canvas/card-skin-registry";
import { preloadSkinImages } from "../canvas/card-image-loader";
import type { Card } from "../protocol";
import { showModal } from "./modal";
import type { SettingsManager } from "./settings";
import { showToast } from "./toast";

const UNLOCKED_SKINS_KEY = "rocambor.unlockedSkins";

const SAMPLE_CARDS: Card[] = [
  { id: "settings-oros-1", s: "oros", r: 1 },
  { id: "settings-copas-12", s: "copas", r: 12 },
  { id: "settings-espadas-7", s: "espadas", r: 7 },
];

const ALWAYS_UNLOCKED = new Set(["rocambor", "classic", "minimal", "parchment"]);

function readUnlockedSkins(): Set<string> {
  try {
    const raw = localStorage.getItem(UNLOCKED_SKINS_KEY);
    if (!raw) return new Set(ALWAYS_UNLOCKED);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set(ALWAYS_UNLOCKED);
    const unlocked = new Set<string>(ALWAYS_UNLOCKED);
    parsed.forEach((id) => {
      if (typeof id === "string" && id.trim()) unlocked.add(id.trim());
    });
    return unlocked;
  } catch {
    return new Set(ALWAYS_UNLOCKED);
  }
}

function writeUnlockedSkins(unlocked: Set<string>): void {
  try {
    localStorage.setItem(UNLOCKED_SKINS_KEY, JSON.stringify(Array.from(unlocked)));
  } catch {
    // Ignore storage errors.
  }
}

function isUnlocked(skin: CardSkinDefinition, unlocked: Set<string>): boolean {
  if (skin.theme === "custom") return true;
  if (skin.id.startsWith("custom_")) return true;
  if (skin.rarity === "common") return true;
  return unlocked.has(skin.id);
}

function rarityLabel(skin: CardSkinDefinition): string {
  if (skin.rarity === "legendary") return "Legendary";
  if (skin.rarity === "rare") return "Rare";
  return "Common";
}

function renderPreview(canvas: HTMLCanvasElement, skinId: string): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#2A4D41");
  bg.addColorStop(1, "#1F3A32");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  drawCard(ctx, 68, 66, 56, 82, SAMPLE_CARDS[0], false, { skin: skinId });
  drawCard(ctx, 138, 66, 56, 82, SAMPLE_CARDS[1], false, { skin: skinId });
  drawCard(ctx, 208, 66, 56, 82, SAMPLE_CARDS[2], false, { skin: skinId });
  drawCard(ctx, 268, 66, 56, 82, null, false, { skin: skinId, faceDown: true });
}

export interface SettingsModalOptions {
  onApplied?: () => void;
}

export function openSettingsModal(settings: SettingsManager, options: SettingsModalOptions = {}): void {
  let skins = listCardSkins();
  let unlocked = readUnlockedSkins();
  let selectedSkin = settings.get("cardSkin");
  if (!skins.some((skin) => skin.id === selectedSkin)) {
    selectedSkin = "rocambor";
  }

  const content = document.createElement("div");
  content.innerHTML = `
    <div class="settings-grid luxe-settings">
      <div class="modal-form-group">
        <label>
          <input type="checkbox" id="set-sound" ${settings.get("soundEnabled") ? "checked" : ""} />
          Enable sound
        </label>
      </div>
      <div class="modal-form-group">
        <label>
          <input type="checkbox" id="set-reduce-motion" ${settings.get("reduceMotion") ? "checked" : ""} />
          Reduce motion
        </label>
      </div>
      <div class="modal-form-group">
        <label for="set-theme">Table theme</label>
        <select id="set-theme">
          <option value="classic" ${settings.get("tableTheme") === "classic" ? "selected" : ""}>Classic Green</option>
          <option value="royal" ${settings.get("tableTheme") === "royal" ? "selected" : ""}>Royal Blue</option>
          <option value="rustic" ${settings.get("tableTheme") === "rustic" ? "selected" : ""}>Rustic Brown</option>
        </select>
      </div>

      <div class="modal-form-group">
        <label>Card Skin</label>
        <canvas class="settings-skin-preview" id="settings-skin-preview" width="336" height="132" aria-label="Card skin preview"></canvas>

        <div class="settings-skin-meta" id="settings-skin-meta"></div>

        <div class="settings-skin-grid" id="settings-skin-grid" role="listbox" aria-label="Card skin choices"></div>

        <div class="settings-inline-actions">
          <button type="button" class="btn-secondary" id="unlock-selected-skin">Unlock Selected</button>
        </div>

        <p class="settings-skin-status" id="settings-skin-status" aria-live="polite"></p>
      </div>
    </div>
  `;

  const preview = content.querySelector("#settings-skin-preview") as HTMLCanvasElement;
  const meta = content.querySelector("#settings-skin-meta") as HTMLElement;
  const grid = content.querySelector("#settings-skin-grid") as HTMLElement;
  const unlockBtn = content.querySelector("#unlock-selected-skin") as HTMLButtonElement;
  const status = content.querySelector("#settings-skin-status") as HTMLElement;

  const updateMeta = (): void => {
    const skin = getCardSkinDefinition(selectedSkin);
    const unlockedState = isUnlocked(skin, unlocked) ? "Unlocked" : "Locked";
    meta.textContent = `${skin.label} · ${rarityLabel(skin)} · ${unlockedState}`;
    unlockBtn.disabled = isUnlocked(skin, unlocked);
  };

  const selectSkin = (skinId: string): void => {
    selectedSkin = skinId;
    renderGrid();
    updateMeta();
    renderPreview(preview, selectedSkin);

    const def = getCardSkinDefinition(skinId);
    if (def.imageMode && def.imagePath) {
      preloadSkinImages(def.id, def.imagePath)
        .then(() => {
          renderPreview(preview, selectedSkin);
        })
        .catch(() => {
          // Ignore and keep fallback preview.
        });
    }
  };

  const renderGrid = (): void => {
    grid.innerHTML = skins
      .map((skin) => {
        const unlockedState = isUnlocked(skin, unlocked);
        const active = skin.id === selectedSkin;
        return `
          <button
            type="button"
            class="settings-skin-tile${active ? " active" : ""}${unlockedState ? "" : " locked"}"
            data-skin-id="${skin.id}"
            role="option"
            aria-selected="${active ? "true" : "false"}"
          >
            <span class="settings-skin-name">${skin.label}</span>
            <span class="settings-skin-rarity">${rarityLabel(skin)}</span>
            ${unlockedState ? "" : `<span class="settings-skin-lock">Locked</span>`}
          </button>
        `;
      })
      .join("");

    grid.querySelectorAll<HTMLButtonElement>(".settings-skin-tile").forEach((btn) => {
      btn.addEventListener("click", () => {
        const skinId = btn.dataset.skinId;
        if (!skinId) return;
        selectSkin(skinId);
      });
    });
  };

  unlockBtn.addEventListener("click", () => {
    const skin = getCardSkinDefinition(selectedSkin);
    if (isUnlocked(skin, unlocked)) {
      status.textContent = "Selected skin is already unlocked.";
      return;
    }

    unlocked.add(skin.id);
    writeUnlockedSkins(unlocked);
    status.textContent = `${skin.label} unlocked on this device.`;
    renderGrid();
    updateMeta();
  });

  renderGrid();
  updateMeta();
  renderPreview(preview, selectedSkin);

  showModal({
    title: "Settings",
    size: "lg",
    scroll: true,
    content,
    actions: [
      { label: "Cancel", className: "btn-secondary", onClick: () => {} },
      {
        label: "Save",
        className: "btn-primary",
        onClick: () => {
          const soundEnabled = (content.querySelector("#set-sound") as HTMLInputElement).checked;
          const reduceMotion = (content.querySelector("#set-reduce-motion") as HTMLInputElement).checked;
          const tableTheme = (content.querySelector("#set-theme") as HTMLSelectElement).value as
            | "classic"
            | "royal"
            | "rustic";

          const selectedDef = getCardSkinDefinition(selectedSkin);
          const canUseSkin = isUnlocked(selectedDef, unlocked);
          const finalSkin = canUseSkin ? selectedSkin : "rocambor";

          settings.set("soundEnabled", soundEnabled);
          settings.set("reduceMotion", reduceMotion);
          settings.set("tableTheme", tableTheme);
          settings.set("cardSkin", finalSkin);

          if (!canUseSkin) {
            showToast(`${selectedDef.label} is locked. Using Rocambor skin instead.`, "warning", 1800);
          } else {
            showToast("Settings applied", "success", 1200);
          }

          options.onApplied?.();
        },
      },
    ],
  });
}
