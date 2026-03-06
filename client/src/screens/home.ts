import "./home.css";

import type { Screen, AppContext } from "../router";
import { showModal } from "../ui/modal";
import { showToast } from "../ui/toast";
import { openSettingsModal } from "../ui/settings-modal";
import type { Mode } from "../protocol";
import { openProfileModal } from "../components/profile/ProfileModal";

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

    this.container.innerHTML = `
      <div class="screen home-screen">
        <div class="home-shell">
          <div class="home-topbar rc-panel rc-panel-noise">
            <div class="home-brand-inline">ROCAMBOR</div>
            <button class="btn-secondary home-profile-btn" type="button" aria-label="Open player profile">
              <img class="home-profile-avatar" src="${profile.avatar}" alt="${profile.name}" />
              <span>${profile.name}</span>
            </button>
          </div>

          <main class="home-main">
            <section class="home-hero rc-panel rc-panel-noise">
              <div class="home-logo-wrap">
                <img src="/assets/rocambor/logo-final.png" alt="Rocambor" class="home-logo-img" />
                <h1 class="home-logo-fallback">ROCAMBOR</h1>
                <p class="home-tagline tagline-smallcaps">THE GAME OF OMBRE</p>
              </div>

              <div class="ornament-divider" aria-hidden="true"></div>

              <div class="home-modes" role="group" aria-label="Game mode">
                <button class="mode-btn ${this.selectedMode === "tresillo" ? "active" : ""}" data-mode="tresillo" type="button">TRESILLO (3P)</button>
                <button class="mode-btn ${this.selectedMode === "quadrille" ? "active" : ""}" data-mode="quadrille" type="button">QUADRILLE (4P)</button>
              </div>

              <div class="home-actions" id="home-actions"></div>

              <div class="home-tertiary">
                <button class="btn-ghost home-rules-btn" type="button">HOW TO PLAY</button>
                <button class="btn-ghost home-settings-btn" type="button">SETTINGS</button>
                <button class="btn-ghost home-leaderboard-btn" type="button">LEADERBOARD</button>
              </div>

              <div class="ornament-divider alt" aria-hidden="true"></div>

              <div class="home-status" id="conn-status">
                <span class="status-dot" aria-hidden="true"></span>
                <span class="status-text">Connecting…</span>
              </div>
            </section>
          </main>
        </div>
      </div>
    `;

    this.attachHandlers();
    this.renderActionStack();
  }

  private renderActionStack(): void {
    const mount = this.container.querySelector("#home-actions");
    if (!mount) return;

    if (this.inQueue) {
      mount.innerHTML = `
        <div class="queue-block rc-panel rc-panel-noise">
          <div class="queue-spinner" aria-hidden="true"></div>
          <div class="queue-label">Searching for match${this.queuePosition ? ` (position ${this.queuePosition})` : "..."}</div>
          <button class="btn-secondary home-cancel-queue-btn" type="button">Cancel</button>
        </div>
      `;
      mount.querySelector(".home-cancel-queue-btn")?.addEventListener("click", () => {
        this.ctx.connection.send({ type: "LEAVE_QUEUE" });
        this.inQueue = false;
        this.renderActionStack();
      });
      return;
    }

    mount.innerHTML = `
      <div class="home-cta-stack">
        <button class="btn-primary home-create-btn" type="button">CREATE ROOM</button>
        <button class="btn-secondary home-join-btn" type="button">JOIN BY CODE</button>
        <button class="btn-gold-plaque home-quick-btn" type="button">QUICK PLAY</button>
      </div>
    `;

    mount.querySelector(".home-create-btn")?.addEventListener("click", () => this.showCreateRoomModal());
    mount.querySelector(".home-join-btn")?.addEventListener("click", () => this.showJoinRoomModal());
    mount.querySelector(".home-quick-btn")?.addEventListener("click", () => {
      this.ctx.connection.send({ type: "QUICK_PLAY", mode: this.selectedMode });
      this.inQueue = true;
      this.queuePosition = 0;
      this.renderActionStack();
    });
  }

  private attachHandlers(): void {
    const logoImg = this.container.querySelector<HTMLImageElement>(".home-logo-img");
    const logoFallback = this.container.querySelector<HTMLElement>(".home-logo-fallback");

    logoImg?.addEventListener("error", () => {
      if (logoImg) logoImg.style.display = "none";
      if (logoFallback) logoFallback.style.display = "block";
    });

    this.container.querySelectorAll<HTMLButtonElement>(".mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.selectedMode = (btn.dataset.mode || "tresillo") as Mode;
        this.container.querySelectorAll(".mode-btn").forEach((item) => {
          item.classList.toggle("active", item === btn);
        });
      });
    });

    this.container.querySelector(".home-profile-btn")?.addEventListener("click", () => {
      openProfileModal(this.ctx.profile);
    });

    this.container.querySelector(".home-rules-btn")?.addEventListener("click", () => {
      this.showRulesModal();
    });

    this.container.querySelector(".home-settings-btn")?.addEventListener("click", () => {
      this.showSettingsModal();
    });

    this.container.querySelector(".home-leaderboard-btn")?.addEventListener("click", () => {
      this.ctx.router.navigate("leaderboard");
    });

    this.container.querySelectorAll<HTMLImageElement>(".home-profile-avatar").forEach((img) => {
      const fallback = this.ctx.profile.getFallbackAvatar();
      img.addEventListener("error", () => {
        if (img.src.endsWith(fallback)) return;
        img.src = fallback;
      });
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

  private showSettingsModal(): void {
    openSettingsModal(this.ctx.settings);
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
    const text = this.container.querySelector(".status-text") as HTMLElement | null;
    const dot = this.container.querySelector(".status-dot") as HTMLElement | null;
    if (!text || !dot) return;

    text.textContent = connected ? "Connected" : "Disconnected";
    dot.style.background = connected ? "var(--success)" : "var(--crimson)";
  }
}
