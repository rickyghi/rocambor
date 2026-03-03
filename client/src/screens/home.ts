import type { Screen, AppContext } from "../router";
import { showModal } from "../ui/modal";
import { showToast } from "../ui/toast";
import type { Card, Mode } from "../protocol";
import { drawCard } from "../canvas/cards";
import {
  importCustomCardSkin,
  isCustomCardSkin,
  listCardSkins,
  removeCustomCardSkin,
} from "../canvas/card-skin-registry";

export class HomeScreen implements Screen {
  private ctx!: AppContext;
  private container!: HTMLElement;
  private unsubscribes: Array<() => void> = [];

  mount(container: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    this.container = container;

    container.innerHTML = `
      <div class="screen home-screen">
        <div class="home-bg"></div>
        <div class="home-center">
          <div class="home-logo">
            <img src="/logo/wordmark.png" alt="Rocambor" class="logo-img" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" />
            <h1 class="logo-text" style="display:none">ROCAMBOR</h1>
            <p class="logo-tagline">THE GAME OF OMBRE</p>
          </div>

          <div class="home-hero">
            <div class="btn-row hero-row">
              <button class="primary hero-btn quick-play-btn" data-mode="tresillo">
                Tresillo <span class="badge">3P</span>
              </button>
              <button class="primary hero-btn quick-play-btn" data-mode="quadrille">
                Quadrille <span class="badge">4P</span>
              </button>
            </div>
          </div>

          <div class="home-secondary">
            <button class="secondary create-room-btn">Create Room</button>
            <button class="secondary join-room-btn">Join by Code</button>
          </div>

          <div class="home-divider"></div>

          <nav class="home-nav">
            <button class="ghost settings-btn">Settings</button>
            <button class="ghost rules-btn">How to Play</button>
            <button class="ghost leaderboard-btn">Leaderboard</button>
          </nav>

          <div class="connection-status" id="conn-status">
            <span class="status-dot"></span>
            <span class="status-text">connecting...</span>
          </div>
        </div>
      </div>
    `;

    this.addStyles();
    this.attachHandlers();

    if (!ctx.connection.connected) {
      ctx.connection.connect();
    }

    this.unsubscribes.push(
      ctx.connection.on("_connected", () => this.updateStatus(true)),
      ctx.connection.on("_disconnected", () => this.updateStatus(false)),
      ctx.connection.on("ROOM_JOINED", () => {
        ctx.router.navigate("lobby");
      }),
      ctx.connection.on("QUEUE_UPDATE", (msg: any) => {
        showToast(`In queue: position ${msg.position}`, "info");
      }),
      ctx.connection.on("ERROR", (msg: any) => {
        showToast(msg.message || msg.code, "error");
      })
    );

    this.updateStatus(ctx.connection.connected);
  }

  unmount(): void {
    this.unsubscribes.forEach((fn) => fn());
    this.unsubscribes = [];
  }

  private attachHandlers(): void {
    this.container.querySelectorAll<HTMLButtonElement>(".quick-play-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode as Mode;
        this.ctx.connection.send({ type: "QUICK_PLAY", mode });
        btn.disabled = true;
        setTimeout(() => (btn.disabled = false), 2000);
      });
    });

    this.container.querySelector(".create-room-btn")?.addEventListener("click", () => {
      this.showCreateRoomModal();
    });

    this.container.querySelector(".join-room-btn")?.addEventListener("click", () => {
      this.showJoinRoomModal();
    });

    this.container.querySelector(".settings-btn")?.addEventListener("click", () => {
      this.showSettingsModal();
    });

    this.container.querySelector(".rules-btn")?.addEventListener("click", () => {
      this.showRulesModal();
    });

    this.container.querySelector(".leaderboard-btn")?.addEventListener("click", () => {
      this.ctx.router.navigate("leaderboard");
    });
  }

  private showCreateRoomModal(): void {
    const content = document.createElement("div");
    content.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        <label style="color:var(--text-secondary);display:flex;align-items:center;gap:8px;">Mode
          <select id="create-mode">
            <option value="tresillo">Tresillo (3 players)</option>
            <option value="quadrille" selected>Quadrille (4 players)</option>
          </select>
        </label>
        <label style="color:var(--text-secondary);display:flex;align-items:center;gap:8px;">Points to win
          <input id="create-target" type="number" value="12" min="6" max="30" style="width:70px;" />
        </label>
      </div>
    `;

    showModal({
      title: "Create Room",
      content,
      actions: [
        { label: "Cancel", onClick: () => {} },
        {
          label: "Create",
          className: "primary",
          onClick: () => {
            const mode = (content.querySelector("#create-mode") as HTMLSelectElement).value as Mode;
            const target = parseInt((content.querySelector("#create-target") as HTMLInputElement).value);
            this.ctx.connection.send({
              type: "CREATE_ROOM",
              mode,
              target: isNaN(target) ? undefined : target,
            });
          },
        },
      ],
    });
  }

  private showJoinRoomModal(): void {
    const content = document.createElement("div");
    content.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        <label style="color:var(--text-secondary);">Room Code
          <input id="join-code" type="text" maxlength="6" placeholder="ABC123"
            style="display:block;margin-top:8px;width:100%;text-transform:uppercase;font-size:20px;letter-spacing:4px;text-align:center;padding:12px;" />
        </label>
      </div>
    `;

    showModal({
      title: "Join Room",
      content,
      actions: [
        { label: "Cancel", onClick: () => {} },
        {
          label: "Join",
          className: "primary",
          onClick: () => {
            const code = (content.querySelector("#join-code") as HTMLInputElement).value.trim().toUpperCase();
            if (code.length >= 4) {
              this.ctx.connection.send({ type: "JOIN_ROOM", code });
            } else {
              showToast("Enter a valid room code", "error");
            }
          },
        },
      ],
    });

    setTimeout(() => {
      (content.querySelector("#join-code") as HTMLInputElement)?.focus();
    }, 100);
  }

  private showSettingsModal(): void {
    const s = this.ctx.settings;
    let skinOptions = listCardSkins();
    let selectedSkin = s.get("cardSkin");
    if (!skinOptions.some((skin) => skin.id === selectedSkin)) {
      selectedSkin = "rocambor";
    }

    const content = document.createElement("div");
    content.innerHTML = `
      <div class="settings-grid">
        <label style="display:flex;align-items:center;gap:8px;color:var(--text-secondary);">
          <input type="checkbox" id="set-sound" ${s.get("soundEnabled") ? "checked" : ""} />
          Sound Effects
        </label>
        <label style="display:flex;align-items:center;gap:8px;color:var(--text-secondary);">
          <input type="checkbox" id="set-colorblind" ${s.get("colorblindMode") ? "checked" : ""} />
          Colorblind Mode
        </label>
        <label style="color:var(--text-secondary);">Table Theme
          <select id="set-theme" style="margin-left:8px;">
            <option value="classic" ${s.get("tableTheme") === "classic" ? "selected" : ""}>Classic Green</option>
            <option value="royal" ${s.get("tableTheme") === "royal" ? "selected" : ""}>Royal Blue</option>
            <option value="rustic" ${s.get("tableTheme") === "rustic" ? "selected" : ""}>Rustic Brown</option>
          </select>
        </label>
        <label style="color:var(--text-secondary);">Card Skin
          <select id="set-card-skin" style="margin-left:8px;">
            ${skinOptions
              .map(
                (skin) =>
                  `<option value="${skin.id}" ${skin.id === selectedSkin ? "selected" : ""}>${skin.label}</option>`
              )
              .join("")}
          </select>
        </label>
        <div id="set-skin-meta" class="settings-skin-meta"></div>
        <canvas id="set-skin-preview" class="settings-skin-preview" width="280" height="130"></canvas>

        <details class="settings-skin-import">
          <summary>Import / Update Custom Skin</summary>
          <p class="settings-skin-hint">
            Paste JSON with at least an <code>id</code>.
            Example: <code>{"id":"my_skin","label":"My Skin","backColor":"#203a31","backPattern":"crosshatch"}</code>
          </p>
          <textarea id="set-skin-json" rows="5" placeholder='{"id":"my_skin","label":"My Skin"}'></textarea>
          <div class="settings-skin-actions">
            <button id="set-skin-import-btn" type="button">Import / Update</button>
            <button id="set-skin-remove-btn" type="button" class="danger">Remove Selected</button>
          </div>
          <p id="set-skin-status" class="settings-skin-status"></p>
        </details>
      </div>
    `;

    const skinSelect = content.querySelector("#set-card-skin") as HTMLSelectElement;
    const colorblindInput = content.querySelector("#set-colorblind") as HTMLInputElement;
    const skinMeta = content.querySelector("#set-skin-meta") as HTMLElement;
    const previewCanvas = content.querySelector("#set-skin-preview") as HTMLCanvasElement;
    const importBtn = content.querySelector("#set-skin-import-btn") as HTMLButtonElement;
    const removeBtn = content.querySelector("#set-skin-remove-btn") as HTMLButtonElement;
    const status = content.querySelector("#set-skin-status") as HTMLElement;
    const jsonInput = content.querySelector("#set-skin-json") as HTMLTextAreaElement;

    const refreshSkinOptions = (targetId?: string): void => {
      skinOptions = listCardSkins();
      const selectedId =
        targetId && skinOptions.some((skin) => skin.id === targetId)
          ? targetId
          : skinOptions[0]?.id || "rocambor";
      skinSelect.innerHTML = skinOptions
        .map(
          (skin) =>
            `<option value="${skin.id}" ${skin.id === selectedId ? "selected" : ""}>${skin.label}</option>`
        )
        .join("");
    };

    const updateSkinPreview = (): void => {
      const skinId = skinSelect.value;
      const skin = skinOptions.find((entry) => entry.id === skinId);
      skinMeta.textContent = skin ? `${skin.label}: ${skin.description}` : "";
      this.renderSkinPreview(previewCanvas, skinId, colorblindInput.checked);
      removeBtn.disabled = !isCustomCardSkin(skinId);
    };

    refreshSkinOptions(selectedSkin);
    updateSkinPreview();

    skinSelect.addEventListener("change", () => updateSkinPreview());
    colorblindInput.addEventListener("change", () => updateSkinPreview());

    importBtn.addEventListener("click", () => {
      status.textContent = "";
      const raw = jsonInput.value.trim();
      if (!raw) {
        status.textContent = "Paste JSON before importing.";
        return;
      }
      try {
        const skin = importCustomCardSkin(raw);
        refreshSkinOptions(skin.id);
        updateSkinPreview();
        status.textContent = `Imported skin: ${skin.label}`;
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : "Could not import skin.";
      }
    });

    removeBtn.addEventListener("click", () => {
      const skinId = skinSelect.value;
      if (!isCustomCardSkin(skinId)) {
        status.textContent = "Select an imported custom skin first.";
        return;
      }
      const removed = removeCustomCardSkin(skinId);
      if (!removed) {
        status.textContent = "Could not remove selected skin.";
        return;
      }
      refreshSkinOptions("rocambor");
      updateSkinPreview();
      status.textContent = "Skin removed.";
    });

    showModal({
      title: "Settings",
      content,
      actions: [
        {
          label: "Save",
          className: "primary",
          onClick: () => {
            s.set("soundEnabled", (content.querySelector("#set-sound") as HTMLInputElement).checked);
            s.set("colorblindMode", (content.querySelector("#set-colorblind") as HTMLInputElement).checked);
            s.set("tableTheme", (content.querySelector("#set-theme") as HTMLSelectElement).value as any);
            s.set("cardSkin", (content.querySelector("#set-card-skin") as HTMLSelectElement).value);
            showToast("Settings saved", "success");
          },
        },
      ],
    });
  }

  private renderSkinPreview(canvas: HTMLCanvasElement, skinId: string, colorblind: boolean): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#2A4D41");
    bg.addColorStop(1, "#1A2F28");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const cards: Card[] = [
      { id: "preview-oros-1", s: "oros", r: 1 },
      { id: "preview-copas-7", s: "copas", r: 7 },
      { id: "preview-espadas-12", s: "espadas", r: 12 },
    ];

    drawCard(ctx, 56, 65, 54, 84, cards[0], colorblind, { skin: skinId });
    drawCard(ctx, 122, 65, 54, 84, cards[1], colorblind, { skin: skinId });
    drawCard(ctx, 188, 65, 54, 84, cards[2], colorblind, { skin: skinId });
    drawCard(ctx, 242, 65, 54, 84, null, colorblind, { skin: skinId, faceDown: true });
  }

  private showRulesModal(): void {
    showModal({
      title: "How to Play",
      content:
        "Rocambor (Tresillo) is a classic Spanish trick-taking card game for 3-4 players using the Spanish 40-card deck. Players bid to become the Ombre (declarer), choose a trump suit, exchange cards from the talon, then play tricks. The Ombre must win at least 5 of 9 tricks to succeed. Points are awarded based on contract difficulty and tricks won. First to reach the target score wins!",
      actions: [{ label: "Got it", className: "primary", onClick: () => {} }],
    });
  }

  private updateStatus(connected: boolean): void {
    const dot = this.container.querySelector(".status-dot") as HTMLElement;
    const text = this.container.querySelector(".status-text") as HTMLElement;
    if (dot && text) {
      dot.style.background = connected ? "var(--success)" : "var(--error)";
      text.textContent = connected ? "connected" : "disconnected";
    }
  }

  private addStyles(): void {
    if (document.getElementById("home-styles")) return;
    const style = document.createElement("style");
    style.id = "home-styles";
    style.textContent = `
      .home-screen {
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
      }
      .home-bg {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(ellipse at 50% 40%, #3A5D51 0%, #2A4D41 40%, #1A2F28 100%);
      }
      .home-bg::before {
        content: "";
        position: absolute;
        inset: 0;
        background: repeating-linear-gradient(
          45deg,
          rgba(255,255,255,0.015) 0,
          rgba(255,255,255,0.015) 1px,
          transparent 1px,
          transparent 6px
        );
        pointer-events: none;
      }
      .home-center {
        position: relative;
        z-index: 1;
        text-align: center;
        max-width: 480px;
        width: 100%;
        padding: 40px 32px 28px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }
      .home-logo {
        margin-bottom: 24px;
      }
      .logo-img {
        max-width: 320px;
        width: 100%;
        height: auto;
        filter: drop-shadow(0 2px 8px rgba(0,0,0,0.4));
      }
      .logo-text {
        font-size: 56px;
        font-family: var(--font-serif);
        font-weight: 700;
        color: var(--color-ivory);
        letter-spacing: 6px;
        text-shadow: 0 2px 8px rgba(0,0,0,0.5);
      }
      .logo-tagline {
        font-family: var(--font-serif);
        font-size: 13px;
        color: var(--color-gold);
        letter-spacing: 4px;
        text-transform: uppercase;
        margin-top: 6px;
        font-weight: 400;
      }

      /* --- Hero play buttons --- */
      .home-hero {
        margin-bottom: 16px;
        width: 100%;
      }
      .hero-row {
        gap: 16px;
      }
      .hero-btn {
        flex: 1;
        max-width: 200px;
        padding: 16px 24px !important;
        font-size: 16px !important;
        font-weight: 700 !important;
        border-radius: var(--radius-sm) !important;
        position: relative;
        overflow: hidden;
      }
      .hero-btn::after {
        content: "";
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
        transition: left 0.4s ease;
        pointer-events: none;
      }
      .hero-btn:hover::after {
        left: 100%;
      }
      .badge {
        display: inline-block;
        font-size: 11px;
        font-weight: 600;
        background: rgba(255,255,255,0.2);
        padding: 2px 7px;
        border-radius: 999px;
        margin-left: 6px;
        vertical-align: middle;
      }

      /* --- Secondary actions --- */
      .home-secondary {
        display: flex;
        gap: 12px;
        width: 100%;
        justify-content: center;
        margin-bottom: 12px;
      }
      .home-secondary button {
        flex: 1;
        max-width: 180px;
        padding: 10px 18px;
        font-size: 14px;
        color: var(--color-ivory) !important;
        border-color: rgba(200,166,81,0.5) !important;
      }
      .home-secondary button:hover:not(:disabled) {
        background: rgba(200,166,81,0.12) !important;
        border-color: var(--color-gold) !important;
      }

      /* --- Divider --- */
      .home-divider {
        width: 60px;
        height: 1px;
        background: rgba(200,166,81,0.3);
        margin: 8px 0;
      }

      /* --- Nav footer --- */
      .home-nav {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
      }
      .home-nav button {
        font-size: 13px;
        padding: 8px 14px;
        color: rgba(248,246,240,0.7) !important;
      }
      .home-nav button:hover:not(:disabled) {
        color: var(--color-ivory) !important;
        background: rgba(255,255,255,0.06) !important;
      }

      /* --- Connection status --- */
      .connection-status {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font-size: 11px;
        color: rgba(248,246,240,0.5);
      }
      .status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--error);
      }

      /* --- General overrides for dark-on-green context --- */
      .btn-row {
        display: flex;
        gap: 12px;
        justify-content: center;
      }
      .home-screen .primary {
        background: var(--color-crimson) !important;
        border-color: var(--color-crimson) !important;
        color: var(--color-ivory) !important;
      }
      .home-screen .primary:hover:not(:disabled) {
        background: #962626 !important;
        box-shadow: 0 4px 16px rgba(176,46,46,0.4);
      }

      /* --- Settings modal (inherits from global, slight overrides) --- */
      .settings-grid {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .settings-skin-meta {
        color: var(--text-secondary);
        font-size: 12px;
        min-height: 16px;
      }
      .settings-skin-preview {
        width: 100%;
        max-width: 280px;
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: #1A2F28;
      }
      .settings-skin-import {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: 10px;
      }
      .settings-skin-import summary {
        cursor: pointer;
        color: var(--text-secondary);
      }
      .settings-skin-hint {
        margin-top: 8px;
        color: var(--text-secondary);
        font-size: 12px;
        line-height: 1.45;
      }
      .settings-skin-hint code {
        font-size: 11px;
      }
      .settings-skin-import textarea {
        width: 100%;
        margin-top: 10px;
        resize: vertical;
        min-height: 92px;
      }
      .settings-skin-actions {
        margin-top: 10px;
        display: flex;
        gap: 8px;
      }
      .settings-skin-status {
        margin-top: 8px;
        min-height: 16px;
        color: var(--text-secondary);
        font-size: 12px;
      }

      @media (max-width: 480px) {
        .home-center {
          padding: 28px 16px 20px;
        }
        .logo-img {
          max-width: 240px;
        }
        .logo-text {
          font-size: 36px;
          letter-spacing: 4px;
        }
        .hero-row,
        .home-secondary {
          flex-direction: column;
          align-items: center;
        }
        .hero-btn,
        .home-secondary button {
          max-width: 100% !important;
          width: 100%;
        }
        .home-nav {
          flex-wrap: wrap;
          justify-content: center;
        }
        .settings-skin-actions {
          flex-direction: column;
        }
      }
    `;
    document.head.appendChild(style);
  }
}
