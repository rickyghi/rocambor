import "./home.css";

import type { Screen, AppContext } from "../router";
import { showModal } from "../ui/modal";
import { showToast } from "../ui/toast";
import { openSettingsModal } from "../ui/settings-modal";
import type { Mode } from "../protocol";
import { openProfileModal } from "../components/profile/ProfileModal";

// SVG icons (inline for zero network requests)
const ICON_SETTINGS = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
const ICON_VOLUME = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
const ICON_PLUS = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const ICON_PLAY = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>`;
const ICON_KEY = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const ICON_BOOK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`;
const ICON_TROPHY = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`;
const ICON_SHIELD = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`;

export class HomeScreen implements Screen {
  private ctx!: AppContext;
  private container!: HTMLElement;
  private unsubscribes: Array<() => void> = [];
  private selectedMode: Mode = "tresillo";
  private inQueue = false;
  private queuePosition = 0;

  mount(container: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    this.container = container;

    this.render();

    if (!ctx.connection.connected) {
      ctx.connection.connect();
    }

    this.unsubscribes.push(
      ctx.connection.on("_connected", () => this.updateStatus(true)),
      ctx.connection.on("_disconnected", () => this.updateStatus(false)),
      ctx.profile.subscribe(() => this.render()),
      ctx.connection.on("ROOM_JOINED", () => {
        this.inQueue = false;
        ctx.router.navigate("lobby");
      }),
      ctx.connection.on("QUEUE_UPDATE", (msg: any) => {
        this.queuePosition = msg.position;
        this.renderActionStack();
      }),
      ctx.connection.on("ERROR", (msg: any) => {
        showToast(msg.message || msg.code, "error");
      })
    );

    this.updateStatus(ctx.connection.connected);

    if (!ctx.profile.isComplete()) {
      setTimeout(() => {
        openProfileModal(ctx.profile, {
          force: true,
          title: "Choose Name & Avatar",
        });
      }, 120);
    }
  }

  unmount(): void {
    this.unsubscribes.forEach((fn) => fn());
    this.unsubscribes = [];
  }

  private render(): void {
    const profile = this.ctx.profile.get();
    const fallbackAvatar = this.ctx.profile.getFallbackAvatar();

    this.container.innerHTML = `
      <div class="screen home-screen">
        <!-- Navbar -->
        <nav class="home-navbar">
          <div class="home-nav-left">
            <img class="home-nav-logo" src="/assets/rocambor/coin.png" alt="" />
            <span class="home-nav-title">Rocambor</span>
          </div>
          <div class="home-nav-right">
            <button class="home-nav-icon home-settings-btn" type="button" aria-label="Settings">${ICON_SETTINGS}</button>
            <button class="home-nav-icon home-volume-btn" type="button" aria-label="Sound">${ICON_VOLUME}</button>
            <button class="home-nav-profile home-profile-btn" type="button" aria-label="Player profile">
              <div class="home-nav-profile-info">
                <span class="home-nav-name">${this.escapeHtml(profile.name)}</span>
                <span class="home-nav-rank">Player</span>
              </div>
              <img class="home-nav-avatar" src="${profile.avatar}" alt="${this.escapeHtml(profile.name)}"
                   onerror="this.src='${fallbackAvatar}'" />
            </button>
          </div>
        </nav>

        <!-- Main body -->
        <div class="home-body">
          <!-- Mobile hero section (hidden on desktop via CSS) -->
          <div class="home-hero-mobile">
            <div class="home-hero-tag">The Salon is Waiting</div>
            <h1 class="home-hero-title">Bienvenido, ${this.escapeHtml(profile.name.split(" ")[0] || "Player")}</h1>
            <p class="home-hero-subtitle">Select your table and claim your glory.</p>
          </div>

          <!-- Main panel -->
          <div class="home-panel">
            <!-- Desktop logo (hidden on mobile) -->
            <div class="home-panel-logo">
              <img src="/assets/rocambor/logo-light.png" alt="Rocambor" class="home-panel-logo-img" />
              <h1 class="home-panel-logo-fallback">ROCAMBOR</h1>
            </div>

            <!-- Mode selector -->
            <div class="home-mode-section">
              <span class="home-mode-label">SELECT GAME VARIATION</span>
              <div class="home-modes" role="group" aria-label="Game mode">
                <button class="home-mode-btn ${this.selectedMode === "tresillo" ? "active" : ""}"
                        data-mode="tresillo" type="button">Tresillo (3P)</button>
                <button class="home-mode-btn ${this.selectedMode === "quadrille" ? "active" : ""}"
                        data-mode="quadrille" type="button">Quadrille (4P)</button>
              </div>
            </div>

            <!-- Action buttons -->
            <div class="home-actions" id="home-actions"></div>

            <!-- Divider -->
            <div class="home-divider" aria-hidden="true"></div>

            <!-- Secondary links -->
            <div class="home-secondary">
              <button class="home-secondary-btn home-rules-btn" type="button">
                <span class="home-secondary-icon">${ICON_BOOK}</span>
                How to Play
              </button>
              <button class="home-secondary-btn home-leaderboard-btn" type="button">
                <span class="home-secondary-icon">${ICON_TROPHY}</span>
                Hall of Fame
              </button>
              <button class="home-secondary-btn home-honors-btn" type="button">
                <span class="home-secondary-icon">${ICON_SHIELD}</span>
                Honors
              </button>
            </div>

            <!-- Quote -->
            <p class="home-quote">"The game of Ombre is a game of wit, fortune, and Spanish pride."</p>
          </div>
        </div>

        <!-- Footer -->
        <footer class="home-footer">
          <div class="home-footer-left">
            <span class="home-footer-copy">Rocambor &mdash; The Game of Ombre &copy; 1726 - 2025</span>
          </div>
          <div class="home-footer-right">
            <span class="status-dot" id="footer-status-dot" aria-hidden="true"></span>
            <span id="footer-status-text">Connecting...</span>
          </div>
        </footer>
      </div>
    `;

    this.attachHandlers();
    this.renderActionStack();

    // Logo fallback
    const logoImg = this.container.querySelector<HTMLImageElement>(".home-panel-logo-img");
    const logoFallback = this.container.querySelector<HTMLElement>(".home-panel-logo-fallback");
    logoImg?.addEventListener("error", () => {
      if (logoImg) logoImg.style.display = "none";
      if (logoFallback) logoFallback.style.display = "block";
    });
  }

  private renderActionStack(): void {
    const mount = this.container.querySelector("#home-actions");
    if (!mount) return;
    const connected = this.ctx.connection.connected;

    if (this.inQueue) {
      mount.innerHTML = `
        <div class="home-queue-block">
          <div class="home-queue-spinner" aria-hidden="true"></div>
          <div class="home-queue-label">Searching for match${this.queuePosition ? ` (position ${this.queuePosition})` : "..."}</div>
          <button class="home-queue-cancel" type="button">Cancel</button>
        </div>
      `;
      mount.querySelector(".home-queue-cancel")?.addEventListener("click", () => {
        this.ctx.connection.send({ type: "LEAVE_QUEUE" });
        this.inQueue = false;
        this.renderActionStack();
      });
      return;
    }

    const disabledAttr = connected ? "" : "disabled";

    mount.innerHTML = `
      <button class="home-action-row home-action-row--create home-create-btn" type="button" ${disabledAttr}>
        <span class="home-action-icon">${ICON_PLUS}</span>
        <div class="home-action-text">
          <span class="home-action-title">Create Room</span>
          <span class="home-action-subtitle">The Ombre's Salon</span>
        </div>
      </button>
      <button class="home-action-row home-action-row--quick home-quick-btn" type="button" ${disabledAttr}>
        <span class="home-action-icon">${ICON_PLAY}</span>
        <div class="home-action-text">
          <span class="home-action-title">Quick Play</span>
          <span class="home-action-subtitle">Instant Match</span>
        </div>
      </button>
      <button class="home-action-row home-action-row--join home-join-btn" type="button" ${disabledAttr}>
        <span class="home-action-icon">${ICON_KEY}</span>
        <div class="home-action-text">
          <span class="home-action-title">Join by Code</span>
          <span class="home-action-subtitle">Private Invitation</span>
        </div>
      </button>
      ${!connected ? '<p class="home-connection-hint">Connect to the server to start a match.</p>' : ""}
    `;

    if (connected) {
      mount.querySelector(".home-create-btn")?.addEventListener("click", () => this.showCreateRoomModal());
      mount.querySelector(".home-join-btn")?.addEventListener("click", () => this.showJoinRoomModal());
      mount.querySelector(".home-quick-btn")?.addEventListener("click", () => {
        this.ctx.connection.send({ type: "QUICK_PLAY", mode: this.selectedMode });
        this.inQueue = true;
        this.queuePosition = 0;
        this.renderActionStack();
      });
    }
  }

  private attachHandlers(): void {
    // Mode toggle
    this.container.querySelectorAll<HTMLButtonElement>(".home-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.selectedMode = (btn.dataset.mode || "tresillo") as Mode;
        this.container.querySelectorAll(".home-mode-btn").forEach((item) => {
          item.classList.toggle("active", item === btn);
        });
      });
    });

    // Profile
    this.container.querySelector(".home-profile-btn")?.addEventListener("click", () => {
      openProfileModal(this.ctx.profile);
    });

    // Settings
    this.container.querySelector(".home-settings-btn")?.addEventListener("click", () => {
      openSettingsModal(this.ctx.settings);
    });

    // Volume toggle
    this.container.querySelector(".home-volume-btn")?.addEventListener("click", () => {
      const current = this.ctx.settings.get("soundEnabled");
      this.ctx.settings.set("soundEnabled", !current);
      showToast(current ? "Sound muted" : "Sound enabled", "info");
    });

    // Rules
    this.container.querySelector(".home-rules-btn")?.addEventListener("click", () => {
      this.showRulesModal();
    });

    // Leaderboard
    this.container.querySelector(".home-leaderboard-btn")?.addEventListener("click", () => {
      this.ctx.router.navigate("leaderboard");
    });

    // Honors (placeholder)
    this.container.querySelector(".home-honors-btn")?.addEventListener("click", () => {
      showToast("Honors coming soon", "info");
    });
  }

  private showCreateRoomModal(): void {
    const content = document.createElement("div");
    content.innerHTML = `
      <div class="modal-form-group">
        <label for="create-mode">Mode</label>
        <select id="create-mode">
          <option value="tresillo" ${this.selectedMode === "tresillo" ? "selected" : ""}>Tresillo (3 players)</option>
          <option value="quadrille" ${this.selectedMode === "quadrille" ? "selected" : ""}>Quadrille (4 players)</option>
        </select>
      </div>
      <div class="modal-form-group">
        <label for="create-target">Points to win</label>
        <input id="create-target" type="number" value="12" min="6" max="30" />
      </div>
    `;

    showModal({
      title: "Create Room",
      size: "sm",
      content,
      actions: [
        { label: "Cancel", className: "btn-secondary", onClick: () => {} },
        {
          label: "Create",
          className: "btn-primary",
          onClick: () => {
            const mode = (content.querySelector("#create-mode") as HTMLSelectElement).value as Mode;
            const target = parseInt((content.querySelector("#create-target") as HTMLInputElement).value, 10);
            this.ctx.connection.send({
              type: "CREATE_ROOM",
              mode,
              target: Number.isNaN(target) ? undefined : target,
              rules: {
                espadaObligatoria: this.ctx.settings.get("espadaObligatoria"),
              },
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
        <input id="join-code" type="text" maxlength="6" placeholder="ABC123" style="text-transform:uppercase;letter-spacing:4px;text-align:center;" />
      </div>
    `;

    showModal({
      title: "Join by Code",
      size: "sm",
      content,
      actions: [
        { label: "Cancel", className: "btn-secondary", onClick: () => {} },
        {
          label: "Join",
          className: "btn-primary",
          onClick: () => {
            const code = (content.querySelector("#join-code") as HTMLInputElement).value.trim().toUpperCase();
            if (code.length < 4) {
              showToast("Enter a valid room code", "error");
              return false;
            }
            this.ctx.connection.send({ type: "JOIN_ROOM", code });
          },
        },
      ],
    });

    setTimeout(() => {
      (content.querySelector("#join-code") as HTMLInputElement)?.focus();
    }, 40);
  }

  private showRulesModal(): void {
    const content = document.createElement("div");
    content.innerHTML = `
      <p>
        Rocambor is a classic Spanish trick-taking game played with a 40-card deck.
        Players bid for the contract, choose trump when required, exchange cards where allowed,
        and then play tricks. The declarer must meet the contract target to score.
      </p>
      <p>
        Tip: watch legal-play highlights on your hand and use exchange strategically when your
        contract permits it.
      </p>
    `;

    showModal({
      title: "How to Play",
      content,
      size: "md",
      scroll: true,
      actions: [{ label: "Close", className: "btn-primary", onClick: () => {} }],
    });
  }

  private updateStatus(connected: boolean): void {
    const dot = this.container.querySelector("#footer-status-dot") as HTMLElement | null;
    const text = this.container.querySelector("#footer-status-text") as HTMLElement | null;
    if (dot) {
      dot.classList.toggle("status-dot--off", !connected);
    }
    if (text) {
      text.textContent = connected ? "Server: Connected" : "Disconnected";
    }
    this.renderActionStack();
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}
