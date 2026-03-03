import type { Screen, AppContext } from "../router";
import { showModal } from "../ui/modal";
import { showToast } from "../ui/toast";
import type { Card, Mode } from "../protocol";
import { drawCard } from "../canvas/cards";
import {
  getCardSkinDefinition,
  importCustomCardSkin,
  isCustomCardSkin,
  listCardSkins,
  removeCustomCardSkin,
} from "../canvas/card-skin-registry";
import { preloadSkinImages, getLoadedAtlas } from "../canvas/card-image-loader";

export class HomeScreen implements Screen {
  private ctx!: AppContext;
  private container!: HTMLElement;
  private unsubscribes: Array<() => void> = [];
  private selectedMode: Mode = "tresillo";

  mount(container: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    this.container = container;

    container.innerHTML = `
      <div class="screen home-screen">
        <div class="home-bg"></div>
        <div class="home-center">
          <div class="home-logo">
            <img src="/logo/wordmark.png" alt="Rocambor — The Game of Ombre" class="logo-img" onerror="this.style.display='none';this.nextElementSibling.style.display='block';this.parentElement.querySelector('.logo-tagline').style.display='block'" />
            <h1 class="logo-text" style="display:none">ROCAMBOR</h1>
            <p class="logo-tagline" style="display:none">THE GAME OF OMBRE</p>
          </div>

          <div class="play-card panel-felt">
            <div class="mode-toggle">
              <button class="mode-btn active" data-mode="tresillo">Tresillo</button>
              <button class="mode-btn" data-mode="quadrille">Quadrille</button>
            </div>
            <button class="btn-gold-plaque play-cta">Play Now</button>
          </div>

          <div class="home-secondary">
            <button class="btn-ivory-engraved create-room-btn">Create Room</button>
            <button class="btn-ivory-engraved join-room-btn">Join by Code</button>
          </div>

          <div class="ornament-divider"><span class="ornament-dot"></span></div>

          <nav class="home-nav">
            <button class="btn-ghost-felt settings-btn">Settings</button>
            <button class="btn-ghost-felt rules-btn">How to Play</button>
            <button class="btn-ghost-felt leaderboard-btn">Leaderboard</button>
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
    // Mode toggle
    this.container.querySelectorAll<HTMLButtonElement>(".mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.container.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.selectedMode = btn.dataset.mode as Mode;
      });
    });

    // Play CTA
    const playCta = this.container.querySelector(".play-cta") as HTMLButtonElement;
    playCta?.addEventListener("click", () => {
      this.ctx.connection.send({ type: "QUICK_PLAY", mode: this.selectedMode });
      playCta.disabled = true;
      setTimeout(() => (playCta.disabled = false), 2000);
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
      <div class="modal-form-group">
        <label for="create-mode">Mode</label>
        <select id="create-mode">
          <option value="tresillo">Tresillo (3 players)</option>
          <option value="quadrille" selected>Quadrille (4 players)</option>
        </select>
      </div>
      <div class="modal-form-group">
        <label for="create-target">Points to win</label>
        <input id="create-target" type="number" value="12" min="6" max="30" style="width:70px;" />
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
      <div class="modal-form-group">
        <label for="join-code">Room Code</label>
        <input id="join-code" type="text" maxlength="6" placeholder="ABC123"
          style="width:100%;text-transform:uppercase;font-size:20px;letter-spacing:4px;text-align:center;padding:12px;" />
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
        <div class="modal-form-group">
          <label>
            <input type="checkbox" id="set-sound" ${s.get("soundEnabled") ? "checked" : ""} />
            Sound Effects
          </label>
        </div>
        <div class="modal-form-group">
          <label>
            <input type="checkbox" id="set-colorblind" ${s.get("colorblindMode") ? "checked" : ""} />
            Colorblind Mode
          </label>
        </div>
        <div class="modal-form-group">
          <label for="set-theme">Table Theme</label>
          <select id="set-theme">
            <option value="classic" ${s.get("tableTheme") === "classic" ? "selected" : ""}>Classic Green</option>
            <option value="royal" ${s.get("tableTheme") === "royal" ? "selected" : ""}>Royal Blue</option>
            <option value="rustic" ${s.get("tableTheme") === "rustic" ? "selected" : ""}>Rustic Brown</option>
          </select>
        </div>
        <div class="modal-form-group">
          <label>Card Skin</label>
          <div class="skin-gallery" id="skin-gallery">
            ${skinOptions
              .map(
                (skin) =>
                  `<button type="button" class="skin-tile ${skin.id === selectedSkin ? "active" : ""}" data-skin="${skin.id}">
                    <canvas class="skin-tile-canvas" width="120" height="56" data-skin-id="${skin.id}"></canvas>
                    <span class="skin-tile-label">${skin.label}</span>
                    ${skin.rarity === "legendary" ? '<span class="skin-tile-star">&#9733;</span>' : skin.rarity === "rare" ? '<span class="skin-tile-star rare">&#9733;</span>' : ""}
                  </button>`
              )
              .join("")}
          </div>
          <input type="hidden" id="set-card-skin" value="${selectedSkin}" />
        </div>
        <div id="set-skin-meta" class="settings-skin-meta"></div>

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

    const skinInput = content.querySelector("#set-card-skin") as HTMLInputElement;
    const skinGallery = content.querySelector("#skin-gallery") as HTMLElement;
    const colorblindInput = content.querySelector("#set-colorblind") as HTMLInputElement;
    const skinMeta = content.querySelector("#set-skin-meta") as HTMLElement;
    const importBtn = content.querySelector("#set-skin-import-btn") as HTMLButtonElement;
    const removeBtn = content.querySelector("#set-skin-remove-btn") as HTMLButtonElement;
    const status = content.querySelector("#set-skin-status") as HTMLElement;
    const jsonInput = content.querySelector("#set-skin-json") as HTMLTextAreaElement;

    const renderTileCanvases = (): void => {
      content.querySelectorAll<HTMLCanvasElement>(".skin-tile-canvas").forEach((canvas) => {
        const skinId = canvas.dataset.skinId!;
        this.renderSkinTile(canvas, skinId, colorblindInput.checked);
      });
    };

    const selectSkinTile = (skinId: string): void => {
      skinInput.value = skinId;
      skinGallery.querySelectorAll(".skin-tile").forEach((tile) => {
        tile.classList.toggle("active", (tile as HTMLElement).dataset.skin === skinId);
      });
      const skin = skinOptions.find((entry) => entry.id === skinId);
      skinMeta.textContent = skin ? `${skin.label}: ${skin.description}` : "";
      removeBtn.disabled = !isCustomCardSkin(skinId);
    };

    const refreshSkinOptions = (targetId?: string): void => {
      skinOptions = listCardSkins();
      const selectedId =
        targetId && skinOptions.some((skin) => skin.id === targetId)
          ? targetId
          : skinOptions[0]?.id || "rocambor";
      skinGallery.innerHTML = skinOptions
        .map(
          (skin) =>
            `<button type="button" class="skin-tile ${skin.id === selectedId ? "active" : ""}" data-skin="${skin.id}">
              <canvas class="skin-tile-canvas" width="120" height="56" data-skin-id="${skin.id}"></canvas>
              <span class="skin-tile-label">${skin.label}</span>
              ${skin.rarity === "legendary" ? '<span class="skin-tile-star">&#9733;</span>' : skin.rarity === "rare" ? '<span class="skin-tile-star rare">&#9733;</span>' : ""}
            </button>`
        )
        .join("");
      selectSkinTile(selectedId);
      attachTileHandlers();
      renderTileCanvases();
    };

    const attachTileHandlers = (): void => {
      skinGallery.querySelectorAll<HTMLButtonElement>(".skin-tile").forEach((tile) => {
        tile.addEventListener("click", () => {
          selectSkinTile(tile.dataset.skin!);
        });
      });
    };

    // Initial render
    selectSkinTile(selectedSkin);
    attachTileHandlers();
    renderTileCanvases();

    colorblindInput.addEventListener("change", () => renderTileCanvases());

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
        status.textContent = `Imported skin: ${skin.label}`;
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : "Could not import skin.";
      }
    });

    removeBtn.addEventListener("click", () => {
      const skinId = skinInput.value;
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
            s.set("cardSkin", (content.querySelector("#set-card-skin") as HTMLInputElement).value);
            showToast("Settings saved", "success");
          },
        },
      ],
    });
  }

  private renderSkinTile(canvas: HTMLCanvasElement, skinId: string, colorblind: boolean): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    const drawTile = (): void => {
      ctx.clearRect(0, 0, w, h);
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#2A4D41");
      bg.addColorStop(1, "#1A2F28");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const cards: Card[] = [
        { id: "tile-oros-1", s: "oros", r: 1 },
        { id: "tile-copas-12", s: "copas", r: 12 },
      ];

      drawCard(ctx, 32, 28, 36, 48, cards[0], colorblind, { skin: skinId });
      drawCard(ctx, 72, 28, 36, 48, cards[1], colorblind, { skin: skinId });
      drawCard(ctx, 100, 28, 36, 48, null, colorblind, { skin: skinId, faceDown: true });
    };

    drawTile();

    const skinDef = getCardSkinDefinition(skinId);
    if (skinDef.imageMode && skinDef.imagePath) {
      const atlas = getLoadedAtlas(skinId);
      if (!atlas?.loaded) {
        preloadSkinImages(skinId, skinDef.imagePath).then(() => drawTile());
      }
    }
  }

  private renderSkinPreview(canvas: HTMLCanvasElement, skinId: string, colorblind: boolean): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const drawPreview = (): void => {
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
    };

    // Draw immediately (procedural fallback)
    drawPreview();

    // For image skins, preload images then redraw
    const skinDef = getCardSkinDefinition(skinId);
    if (skinDef.imageMode && skinDef.imagePath) {
      const atlas = getLoadedAtlas(skinId);
      if (!atlas?.loaded) {
        preloadSkinImages(skinId, skinDef.imagePath).then(() => {
          drawPreview();
        });
      }
    }
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
        gap: 16px;
        animation: fadeInUp var(--dur-slow) var(--ease-decelerate);
      }
      .home-logo {
        margin-bottom: 8px;
      }
      .logo-img {
        max-width: 420px;
        width: 100%;
        height: auto;
        filter: drop-shadow(0 2px 12px rgba(0,0,0,0.5));
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

      /* --- Play card (dominant CTA) --- */
      .play-card {
        width: 100%;
        max-width: 340px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        padding: 20px 24px;
        border-radius: var(--radius-lg);
      }

      /* --- Mode toggle --- */
      .mode-toggle {
        display: flex;
        background: rgba(0,0,0,0.25);
        border-radius: var(--radius-pill);
        padding: 3px;
        gap: 2px;
      }
      .mode-btn {
        font-family: var(--font-sans);
        font-size: 13px;
        font-weight: 600;
        padding: 8px 20px;
        border: none;
        border-radius: var(--radius-pill);
        background: transparent;
        color: var(--text-on-felt-muted);
        cursor: pointer;
        transition: background var(--dur-fast) var(--ease-standard),
                    color var(--dur-fast) var(--ease-standard);
        min-height: 36px;
      }
      .mode-btn:hover:not(.active) {
        color: var(--text-on-felt);
        background: rgba(255,255,255,0.06);
      }
      .mode-btn.active {
        background: rgba(200,166,81,0.2);
        color: var(--color-gold);
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      }
      .mode-btn:focus-visible {
        outline: none;
        box-shadow: var(--focus-ring), var(--focus-ring-offset);
      }

      /* --- Play CTA --- */
      .play-cta {
        width: 100%;
        max-width: 260px;
        min-height: 52px;
        font-size: 16px;
        letter-spacing: 0.5px;
      }

      /* --- Secondary actions --- */
      .home-secondary {
        display: flex;
        gap: 12px;
        width: 100%;
        justify-content: center;
      }
      .home-secondary .btn-ivory-engraved {
        flex: 1;
        max-width: 160px;
        font-size: 13px;
        padding: 10px 16px;
        color: var(--text-on-felt);
        background: rgba(248,246,240,0.08);
        border-color: rgba(200,166,81,0.4);
        box-shadow: none;
      }
      .home-secondary .btn-ivory-engraved:hover:not(:disabled) {
        background: rgba(200,166,81,0.12);
        border-color: var(--color-gold);
        color: var(--color-ivory);
        box-shadow: none;
      }

      /* --- Ornament divider on dark bg --- */
      .home-center .ornament-divider {
        width: 200px;
        margin: 4px 0;
      }
      .home-center .ornament-divider::before {
        background: linear-gradient(90deg, transparent, rgba(200,166,81,0.3));
      }
      .home-center .ornament-divider::after {
        background: linear-gradient(90deg, rgba(200,166,81,0.3), transparent);
      }
      .home-center .ornament-dot {
        opacity: 0.35;
      }

      /* --- Nav footer --- */
      .home-nav {
        display: flex;
        gap: 4px;
      }
      .home-nav .btn-ghost-felt {
        color: var(--text-on-felt-muted);
        font-size: 13px;
        padding: 8px 14px;
        border-color: transparent;
      }
      .home-nav .btn-ghost-felt:hover:not(:disabled) {
        color: var(--text-on-felt);
        background: rgba(255,255,255,0.06);
        border-color: transparent;
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

      /* --- Settings modal --- */
      .settings-grid {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .settings-grid .modal-form-group label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
      }

      /* --- Skin Gallery --- */
      .skin-gallery {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 8px;
        margin-top: 4px;
      }
      .skin-tile {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 6px;
        border: 2px solid var(--border);
        border-radius: var(--radius-md);
        background: var(--bg-tertiary);
        cursor: pointer;
        transition: border-color var(--dur-fast) var(--ease-standard),
                    box-shadow var(--dur-fast) var(--ease-standard);
        font-family: var(--font-sans);
        font-size: 11px;
        color: var(--text-secondary);
      }
      .skin-tile:hover {
        border-color: var(--color-gold);
      }
      .skin-tile.active {
        border-color: var(--color-gold);
        box-shadow: 0 0 0 1px rgba(200,166,81,0.2), 0 0 12px rgba(200,166,81,0.15);
        background: rgba(200,166,81,0.06);
      }
      .skin-tile.active .skin-tile-label {
        color: var(--text-primary);
        font-weight: 600;
      }
      .skin-tile-canvas {
        border-radius: 6px;
        width: 100%;
        height: auto;
        pointer-events: none;
      }
      .skin-tile-label {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }
      .skin-tile-star {
        position: absolute;
        top: 4px;
        right: 6px;
        font-size: 12px;
        color: var(--color-gold);
        line-height: 1;
      }
      .skin-tile-star.rare {
        color: #A0A0A0;
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
          max-width: 300px;
        }
        .logo-text {
          font-size: 36px;
          letter-spacing: 4px;
        }
        .play-card {
          max-width: 100%;
          padding: 16px 20px;
        }
        .home-secondary {
          flex-direction: column;
          align-items: center;
        }
        .home-secondary .btn-ivory-engraved {
          max-width: 100%;
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
