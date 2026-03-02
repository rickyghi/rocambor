import type { Screen, AppContext } from "../router";
import { showModal } from "../ui/modal";
import { showToast } from "../ui/toast";
import type { Mode } from "../protocol";

export class HomeScreen implements Screen {
  private ctx!: AppContext;
  private container!: HTMLElement;
  private unsubscribes: Array<() => void> = [];

  mount(container: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    this.container = container;

    container.innerHTML = `
      <div class="screen home-screen">
        <div class="home-center">
          <div class="home-logo">
            <h1 class="logo-text">Rocambor</h1>
            <p class="logo-sub">Tresillo Online</p>
          </div>

          <div class="home-actions">
            <div class="action-group">
              <h3>Quick Play</h3>
              <div class="btn-row">
                <button class="primary quick-play-btn" data-mode="tresillo">
                  Tresillo <span class="badge">3P</span>
                </button>
                <button class="primary quick-play-btn" data-mode="quadrille">
                  Quadrille <span class="badge">4P</span>
                </button>
              </div>
            </div>

            <div class="action-group">
              <div class="btn-row">
                <button class="create-room-btn">Create Room</button>
                <button class="join-room-btn">Join by Code</button>
              </div>
            </div>
          </div>

          <div class="home-footer">
            <button class="settings-btn">Settings</button>
            <button class="rules-btn">How to Play</button>
          </div>

          <div class="connection-status" id="conn-status">
            <span class="status-dot"></span>
            <span class="status-text">connecting...</span>
          </div>
        </div>
      </div>
    `;

    this.addStyles();
    this.attachHandlers();

    // Connect if not already
    if (!ctx.connection.connected) {
      ctx.connection.connect();
    }

    // Listen for connection events
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
    // Quick play
    this.container.querySelectorAll<HTMLButtonElement>(".quick-play-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode as Mode;
        this.ctx.connection.send({ type: "QUICK_PLAY", mode });
        btn.disabled = true;
        setTimeout(() => (btn.disabled = false), 2000);
      });
    });

    // Create room
    this.container.querySelector(".create-room-btn")?.addEventListener("click", () => {
      this.showCreateRoomModal();
    });

    // Join by code
    this.container.querySelector(".join-room-btn")?.addEventListener("click", () => {
      this.showJoinRoomModal();
    });

    // Settings
    this.container.querySelector(".settings-btn")?.addEventListener("click", () => {
      this.showSettingsModal();
    });

    // Rules
    this.container.querySelector(".rules-btn")?.addEventListener("click", () => {
      this.showRulesModal();
    });
  }

  private showCreateRoomModal(): void {
    const content = document.createElement("div");
    content.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <label style="color:var(--text-secondary);">Mode
          <select id="create-mode" style="margin-left:8px;">
            <option value="tresillo">Tresillo (3 players)</option>
            <option value="quadrille" selected>Quadrille (4 players)</option>
          </select>
        </label>
        <label style="color:var(--text-secondary);">Points to win
          <input id="create-target" type="number" value="12" min="6" max="30" style="margin-left:8px;width:60px;" />
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
            const target = parseInt(
              (content.querySelector("#create-target") as HTMLInputElement).value
            );
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
      <div style="display:flex;flex-direction:column;gap:12px;">
        <label style="color:var(--text-secondary);">Room Code
          <input id="join-code" type="text" maxlength="6" placeholder="ABC123"
            style="margin-left:8px;width:120px;text-transform:uppercase;font-size:18px;letter-spacing:3px;text-align:center;" />
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
            const code = (
              content.querySelector("#join-code") as HTMLInputElement
            ).value
              .trim()
              .toUpperCase();
            if (code.length >= 4) {
              this.ctx.connection.send({ type: "JOIN_ROOM", code });
            } else {
              showToast("Enter a valid room code", "error");
            }
          },
        },
      ],
    });

    // Auto-focus the input
    setTimeout(() => {
      (content.querySelector("#join-code") as HTMLInputElement)?.focus();
    }, 100);
  }

  private showSettingsModal(): void {
    const s = this.ctx.settings;
    const content = document.createElement("div");
    content.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
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
      </div>
    `;

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
            s.set(
              "tableTheme",
              (content.querySelector("#set-theme") as HTMLSelectElement).value as any
            );
            showToast("Settings saved", "success");
          },
        },
      ],
    });
  }

  private showRulesModal(): void {
    showModal({
      title: "How to Play",
      content: `Rocambor (Tresillo) is a classic Spanish trick-taking card game for 3-4 players using the Spanish 40-card deck. Players bid to become the Ombre (declarer), choose a trump suit, exchange cards from the talon, then play tricks. The Ombre must win at least 5 of 9 tricks to succeed. Points are awarded based on contract difficulty and tricks won. First to reach the target score wins!`,
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
        background: radial-gradient(ellipse at center, #1a3b2e 0%, #0c1912 70%);
      }
      .home-center {
        text-align: center;
        max-width: 480px;
        width: 100%;
        padding: 24px;
      }
      .home-logo { margin-bottom: 48px; }
      .logo-text {
        font-size: 56px;
        font-weight: 700;
        color: var(--text-accent);
        letter-spacing: 4px;
        text-shadow: 0 2px 12px rgba(251,191,36,0.3);
        margin-bottom: 4px;
      }
      .logo-sub {
        font-size: 16px;
        color: var(--text-secondary);
        letter-spacing: 6px;
        text-transform: uppercase;
      }
      .home-actions {
        display: flex;
        flex-direction: column;
        gap: 24px;
        margin-bottom: 32px;
      }
      .action-group h3 {
        font-size: 13px;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 2px;
        margin-bottom: 10px;
      }
      .btn-row {
        display: flex;
        gap: 12px;
        justify-content: center;
      }
      .btn-row button {
        flex: 1;
        max-width: 200px;
        padding: 14px 20px;
        font-size: 15px;
      }
      .badge {
        display: inline-block;
        font-size: 11px;
        background: rgba(255,255,255,0.15);
        padding: 2px 6px;
        border-radius: 999px;
        margin-left: 6px;
        vertical-align: middle;
      }
      .home-footer {
        display: flex;
        gap: 12px;
        justify-content: center;
        margin-bottom: 24px;
      }
      .home-footer button {
        font-size: 13px;
        padding: 8px 16px;
        opacity: 0.8;
      }
      .connection-status {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font-size: 12px;
        color: var(--text-secondary);
      }
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--error);
      }
      @media (max-width: 480px) {
        .logo-text { font-size: 40px; }
        .btn-row { flex-direction: column; align-items: center; }
        .btn-row button { max-width: 100%; }
      }
    `;
    document.head.appendChild(style);
  }
}
