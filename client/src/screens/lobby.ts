import type { Screen, AppContext } from "../router";
import { showToast } from "../ui/toast";
import type { SeatIndex } from "../protocol";

export class LobbyScreen implements Screen {
  private ctx!: AppContext;
  private container!: HTMLElement;
  private unsubscribes: Array<() => void> = [];

  mount(container: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    this.container = container;
    this.render();

    this.unsubscribes.push(
      ctx.state.subscribe(() => this.render()),
      ctx.connection.on("EVENT", (msg: any) => {
        if (msg.name === "SEATED") {
          showToast(`${msg.payload.handle} joined`, "info");
        }
      }),
      ctx.connection.on("STATE", () => {
        // Auto-navigate to game when phase changes
        if (ctx.state.game && ctx.state.game.phase !== "lobby") {
          ctx.router.navigate("game");
        }
      })
    );
  }

  unmount(): void {
    this.unsubscribes.forEach((fn) => fn());
    this.unsubscribes = [];
  }

  private render(): void {
    const game = this.ctx.state.game;
    const code = this.ctx.state.roomCode || "...";
    const mode = game?.mode || "quadrille";
    const mySeat = this.ctx.state.mySeat;

    const seats: string[] = [];

    for (let i = 0; i < 4; i++) {
      const player = game?.players[i];
      const isResting = game?.resting === i;
      const isMine = mySeat === i;

      if (isResting && mode === "tresillo") continue;

      let label = "Empty";
      let statusClass = "empty";

      if (player) {
        label = player.handle;
        statusClass = player.isBot ? "bot" : player.connected ? "human" : "disconnected";
      }

      if (isMine) {
        label += " (You)";
        statusClass = "you";
      }

      seats.push(`
        <div class="seat-card ${statusClass}" data-seat="${i}">
          <div class="seat-icon">${player?.isBot ? "\uD83E\uDD16" : isMine ? "\uD83D\uDE0A" : "\uD83D\uDC64"}</div>
          <div class="seat-name">${label}</div>
          <div class="seat-status">${statusClass === "empty" ? "Open" : statusClass === "bot" ? "Bot" : statusClass === "disconnected" ? "Offline" : "Ready"}</div>
          ${statusClass === "empty" && mySeat === null ? `<button class="take-seat-btn" data-seat="${i}">Sit Here</button>` : ""}
        </div>
      `);
    }

    this.container.innerHTML = `
      <div class="screen lobby-screen">
        <div class="lobby-header">
          <button class="back-btn" data-action="leave">\u2190 Leave</button>
          <div class="room-info">
            <span class="room-code">${code}</span>
            <span class="room-mode">${mode === "tresillo" ? "Tresillo (3P)" : "Quadrille (4P)"}</span>
          </div>
          <button class="copy-code-btn" data-action="copy">Copy Code</button>
        </div>

        <div class="lobby-body">
          <h2>Waiting for Players</h2>
          <div class="seats-grid">
            ${seats.join("")}
          </div>

          <div class="lobby-actions">
            ${mySeat !== null ? `<button class="primary start-btn" data-action="start">Start Game</button>` : ""}
          </div>
        </div>
      </div>
    `;

    this.addStyles();
    this.attachHandlers();
  }

  private attachHandlers(): void {
    this.container.querySelector('[data-action="leave"]')?.addEventListener("click", () => {
      this.ctx.connection.send({ type: "LEAVE_ROOM" });
      this.ctx.state.reset();
      this.ctx.router.navigate("home");
    });

    this.container.querySelector('[data-action="copy"]')?.addEventListener("click", () => {
      const code = this.ctx.state.roomCode;
      if (code) {
        navigator.clipboard.writeText(code).then(
          () => showToast("Code copied!", "success"),
          () => showToast("Failed to copy", "error")
        );
      }
    });

    this.container.querySelector('[data-action="start"]')?.addEventListener("click", () => {
      this.ctx.connection.send({ type: "START_GAME" });
    });

    this.container.querySelectorAll<HTMLButtonElement>(".take-seat-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const seat = parseInt(btn.dataset.seat!) as SeatIndex;
        this.ctx.connection.send({ type: "TAKE_SEAT", seat });
      });
    });
  }

  private addStyles(): void {
    if (document.getElementById("lobby-styles")) return;
    const style = document.createElement("style");
    style.id = "lobby-styles";
    style.textContent = `
      .lobby-screen {
        background: var(--bg-primary);
      }
      .lobby-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: var(--bg-secondary);
        border-bottom: 1px solid rgba(200,166,81,0.2);
      }
      .room-info {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .room-code {
        font-family: var(--font-serif);
        font-size: 24px;
        font-weight: 700;
        letter-spacing: 6px;
        color: var(--color-gold);
      }
      .room-mode {
        font-size: 12px;
        color: var(--text-secondary);
      }
      .lobby-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px;
        gap: 32px;
      }
      .lobby-body h2 {
        font-family: var(--font-serif);
        color: var(--text-secondary);
        font-size: 18px;
        text-transform: uppercase;
        letter-spacing: 3px;
      }
      .seats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 16px;
        max-width: 720px;
        width: 100%;
      }
      .seat-card {
        background: var(--bg-tertiary);
        border: 2px solid var(--border);
        border-radius: var(--radius-lg);
        padding: 20px;
        text-align: center;
        transition: border-color 0.2s;
      }
      .seat-card.you { border-color: var(--text-accent); }
      .seat-card.human { border-color: var(--success); }
      .seat-card.bot { border-color: var(--info); }
      .seat-card.disconnected { border-color: var(--error); opacity: 0.6; }
      .seat-icon { font-size: 32px; margin-bottom: 8px; }
      .seat-name { font-weight: 600; margin-bottom: 4px; }
      .seat-status { font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; }
      .take-seat-btn { font-size: 12px; padding: 6px 12px; }
      .lobby-actions { margin-top: 16px; }
      .start-btn { padding: 14px 32px; font-size: 16px; }
    `;
    document.head.appendChild(style);
  }
}
