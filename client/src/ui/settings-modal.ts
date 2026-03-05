import { showModal } from "./modal";
import type { SettingsManager } from "./settings";
import { showToast } from "./toast";

export interface SettingsModalOptions {
  onApplied?: () => void;
}

export function openSettingsModal(
  settings: SettingsManager,
  options: SettingsModalOptions = {}
): void {
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
    </div>
  `;

  showModal({
    title: "Settings",
    size: "sm",
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

          showToast("Settings applied", "success", 1200);
          options.onApplied?.();
        },
      },
    ],
  });
}
