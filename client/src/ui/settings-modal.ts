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

function formatSkinTag(input: string | undefined, fallback: string): string {
  const source = (input || fallback).trim();
  if (!source) return fallback;
  return source
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
    <div class="settings-modal">
      <div class="settings-hero">
        <span class="settings-hero-kicker">Table Preferences</span>
        <p class="settings-hero-copy">
          Tune the salon for this device. Keep motion calm, audio intentional, and pick the deck
          that reads best at a glance.
        </p>
      </div>

      <div class="settings-modal-grid">
        <section class="settings-panel">
          <div class="settings-section-head">
            <span class="settings-section-kicker">Gameplay Feel</span>
            <h3 class="settings-section-title">How the table behaves</h3>
          </div>

          <div class="settings-toggle-list">
            <label class="settings-toggle-card" for="set-sound">
              <span class="settings-toggle-copy">
                <span class="settings-toggle-title">Enable sound</span>
                <span class="settings-toggle-caption">Card flicks, trick wins, and table feedback.</span>
              </span>
              <span class="settings-toggle-control">
                <input type="checkbox" id="set-sound" class="settings-toggle-input" ${settings.get("soundEnabled") ? "checked" : ""} />
                <span class="settings-toggle-check" aria-hidden="true"></span>
              </span>
            </label>

            <label class="settings-toggle-card" for="set-reduce-motion">
              <span class="settings-toggle-copy">
                <span class="settings-toggle-title">Reduce motion</span>
                <span class="settings-toggle-caption">Softens movement for a steadier reading pace.</span>
              </span>
              <span class="settings-toggle-control">
                <input type="checkbox" id="set-reduce-motion" class="settings-toggle-input" ${settings.get("reduceMotion") ? "checked" : ""} />
                <span class="settings-toggle-check" aria-hidden="true"></span>
              </span>
            </label>

            <label class="settings-toggle-card" for="set-espada-obligatoria">
              <span class="settings-toggle-copy">
                <span class="settings-toggle-title">Espada obligatoria</span>
                <span class="settings-toggle-caption">Preserves the traditional forced-espada rule set.</span>
              </span>
              <span class="settings-toggle-control">
                <input type="checkbox" id="set-espada-obligatoria" class="settings-toggle-input" ${settings.get("espadaObligatoria") ? "checked" : ""} />
                <span class="settings-toggle-check" aria-hidden="true"></span>
              </span>
            </label>
          </div>
        </section>

        <section class="settings-panel settings-panel-skins">
          <div class="settings-section-head">
            <span class="settings-section-kicker">Cards</span>
            <h3 class="settings-section-title">Choose your deck skin</h3>
          </div>

          <div class="settings-skin-showcase">
            <div class="settings-skin-copy">
              <span class="settings-skin-label">Selected Deck</span>
              <strong class="settings-skin-title" id="settings-skin-title"></strong>
              <p class="settings-skin-description" id="settings-skin-description"></p>
              <div class="settings-skin-meta" id="settings-skin-meta"></div>
            </div>
            <div class="settings-skin-preview" id="settings-skin-preview"></div>
          </div>

          <div class="settings-skin-grid" id="settings-skin-grid">
          ${skins
            .map((skin) => {
              const theme = formatSkinTag(skin.theme, "Classic");
              const rarity = formatSkinTag(skin.rarity, "Common");
              return `
              <button class="settings-skin-tile${skin.id === selectedSkinId ? " active" : ""}" type="button" data-skin-id="${skin.id}">
                <span class="settings-skin-tile-head">
                  <span class="settings-skin-name">${escapeText(skin.label)}</span>
                  <span class="settings-skin-badge">${escapeText(rarity)}</span>
                </span>
                <span class="settings-skin-theme">${escapeText(theme)}</span>
                <span class="settings-skin-note">${escapeText(skin.description)}</span>
              </button>
            `;
            })
            .join("")}
          </div>
        </section>
      </div>
    </div>
  `;

  const renderSkinPreview = (skin: CardSkinDefinition): void => {
    const preview = content.querySelector("#settings-skin-preview") as HTMLElement | null;
    const title = content.querySelector("#settings-skin-title") as HTMLElement | null;
    const description = content.querySelector("#settings-skin-description") as HTMLElement | null;
    const meta = content.querySelector("#settings-skin-meta") as HTMLElement | null;
    if (!preview || !title || !description || !meta) return;

    title.textContent = skin.label;
    description.textContent = skin.description;

    preview.innerHTML = `
      <div class="settings-skin-preview-stage">
        <div class="settings-skin-preview-card settings-skin-preview-card-face" style="background:${skin.faceColor};border-color:${skin.faceBorderColor}">
          <span class="settings-skin-preview-glyph" style="color:${skin.emblemColor}">${escapeText(skin.emblem)}</span>
        </div>
        <div class="settings-skin-preview-card settings-skin-preview-card-back" style="background:${skin.backColor};border-color:${skin.backBorderColor}">
          <span class="settings-skin-preview-pattern" style="color:${skin.backPatternColor}">${escapeText(skin.emblem)}</span>
        </div>
      </div>
    `;

    const details = [
      formatSkinTag(skin.theme, "Classic"),
      formatSkinTag(skin.rarity, "Common"),
      skin.author || "Rocambor",
    ];
    meta.innerHTML = details
      .map((detail) => `<span class="settings-skin-meta-pill">${escapeText(detail)}</span>`)
      .join("");
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
    size: "lg",
    scroll: true,
    modalClassName: "modal-dark settings-modal-dialog",
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
