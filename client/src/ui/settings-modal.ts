import { showModal } from "./modal";
import type { SettingsManager } from "./settings";
import { showToast } from "./toast";
import {
  getCardSkinDefinition,
  listCardSkins,
  type CardSkinDefinition,
} from "../canvas/card-skin-registry";

function escapeText(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface SettingsModalOptions {
  onApplied?: () => void;
}

export function openSettingsModal(
  settings: SettingsManager,
  options: SettingsModalOptions = {}
): void {
  const skins = listCardSkins();
  let selectedSkinId = settings.get("cardSkin");
  if (!skins.some((skin) => skin.id === selectedSkinId)) {
    selectedSkinId = skins[0]?.id || "clasica";
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
        <label>
          <input type="checkbox" id="set-espada-obligatoria" ${settings.get("espadaObligatoria") ? "checked" : ""} />
          Espada obligatoria
        </label>
      </div>
      <div class="modal-form-group">
        <label>Card Skin</label>
        <div class="settings-skin-preview" id="settings-skin-preview"></div>
        <div class="settings-skin-meta" id="settings-skin-meta"></div>
        <div class="settings-skin-grid" id="settings-skin-grid">
          ${skins
            .map((skin) => `
              <button class="settings-skin-tile${skin.id === selectedSkinId ? " active" : ""}" type="button" data-skin-id="${skin.id}">
                <span class="settings-skin-name">${escapeText(skin.label)}</span>
                <span class="settings-skin-rarity">${(skin.rarity || "common").toUpperCase()}</span>
              </button>
            `)
            .join("")}
        </div>
      </div>
    </div>
  `;

  const renderSkinPreview = (skin: CardSkinDefinition): void => {
    const preview = content.querySelector("#settings-skin-preview") as HTMLElement | null;
    const meta = content.querySelector("#settings-skin-meta") as HTMLElement | null;
    if (!preview || !meta) return;

    preview.innerHTML = `
      <div class="settings-skin-preview-card">
        <div class="settings-skin-preview-face" style="background:${skin.faceColor};border-color:${skin.faceBorderColor}"></div>
        <div class="settings-skin-preview-back" style="background:${skin.backColor};border-color:${skin.backBorderColor}"></div>
      </div>
    `;

    const details = [skin.description, skin.author].filter(Boolean).join(" · ");
    meta.textContent = details;
  };

  const selectSkin = (skinId: string): void => {
    selectedSkinId = skinId;
    content.querySelectorAll<HTMLButtonElement>(".settings-skin-tile").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.skinId === skinId);
    });
    renderSkinPreview(getCardSkinDefinition(skinId));
  };

  content.querySelectorAll<HTMLButtonElement>(".settings-skin-tile").forEach((btn) => {
    btn.addEventListener("click", () => {
      const skinId = btn.dataset.skinId;
      if (!skinId) return;
      selectSkin(skinId);
    });
  });
  selectSkin(selectedSkinId);

  showModal({
    title: "Settings",
    size: "md",
    content,
    actions: [
      { label: "Cancel", className: "btn-secondary", onClick: () => {} },
      {
        label: "Save",
        className: "btn-primary",
        onClick: () => {
          const soundEnabled = (content.querySelector("#set-sound") as HTMLInputElement).checked;
          const reduceMotion = (content.querySelector("#set-reduce-motion") as HTMLInputElement).checked;
          const espadaObligatoria = (
            content.querySelector("#set-espada-obligatoria") as HTMLInputElement
          ).checked;

          settings.set("soundEnabled", soundEnabled);
          settings.set("reduceMotion", reduceMotion);
          settings.set("espadaObligatoria", espadaObligatoria);
          settings.set("cardSkin", selectedSkinId);

          showToast("Settings applied", "success", 1200);
          options.onApplied?.();
        },
      },
    ],
  });
}
