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

      let label = "Open Seat";
      let statusClass = "open";
      let badgeLabel = "Open";
      let badgeClass = "badge-open";

      if (player) {
        label = player.handle;
        if (isMine) {
          statusClass = "you";
          badgeLabel = "You";
          badgeClass = "badge-you";
        } else if (player.isBot) {
          statusClass = "bot";
          badgeLabel = "Bot";
          badgeClass = "badge-bot";
        } else if (!player.connected) {
          statusClass = "offline";
          badgeLabel = "Offline";
          badgeClass = "badge-offline";
        } else {
          statusClass = "ready";
          badgeLabel = "Ready";
          badgeClass = "badge-ready";
        }
      }

      seats.push(`
        <div class="seat-plaque ${statusClass}" data-seat="${i}">
          <span class="seat-badge ${badgeClass}">${badgeLabel}</span>
          <div class="seat-name">${label}</div>
          ${statusClass === "open" && mySeat === null ? `<button class="btn-ivory-engraved take-seat-btn" data-seat="${i}">Sit Here</button>` : ""}
        </div>
      `);
    }

    const modeLabel = mode === "tresillo" ? "Tresillo" : "Quadrille";

    this.container.innerHTML = `
      <div class="screen lobby-screen">
        <div class="lobby-header">
          <button class="btn-ghost-felt back-btn" data-action="leave">\u2190 Leave</button>
          <div class="room-info-strip">
            <span class="room-code">${code}</span>
            <span class="room-meta">${modeLabel}</span>
          </div>
          <button class="btn-ivory-engraved copy-code-btn" data-action="copy">Copy Code</button>
        </div>

        <div class="lobby-body">
          <h2>Waiting for Players</h2>
          <div class="seats-grid">
            ${seats.join("")}
          </div>

          <div class="lobby-actions">
            ${mySeat !== null ? `<button class="btn-gold-plaque start-btn" data-action="start">Start Game</button>` : ""}
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
        background: var(--surface-card);
        border-bottom: 1px solid rgba(200,166,81,0.2);
      }
      .room-info-strip {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }
      .room-code {
        font-family: var(--font-display);
        font-size: 22px;
        font-weight: 700;
        letter-spacing: 6px;
        color: var(--color-gold);
      }
      .room-meta {
        font-size: 12px;
        color: var(--text-secondary);
        letter-spacing: 0.5px;
      }
      .lobby-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px;
        gap: 32px;
        animation: fadeInUp var(--dur-slow) var(--ease-decelerate);
      }
      .lobby-body h2 {
        font-family: var(--font-serif);
        color: var(--text-secondary);
        font-size: 16px;
        text-transform: uppercase;
        letter-spacing: 3px;
        font-weight: 400;
      }
      .seats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 16px;
        max-width: 720px;
        width: 100%;
      }

      /* --- Seat plaques --- */
      .seat-plaque {
        background: var(--surface-parchment);
        border: 2px solid var(--border);
        border-radius: var(--radius-lg);
        padding: 20px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        transition: border-color var(--dur-fast) var(--ease-standard),
                    box-shadow var(--dur-fast) var(--ease-standard);
      }
      .seat-plaque.you {
        border-color: var(--color-gold);
        box-shadow: 0 0 0 1px rgba(200,166,81,0.15), var(--shadow-soft);
      }
      .seat-plaque.ready {
        border-color: var(--success);
      }
      .seat-plaque.bot {
        border-color: var(--info);
      }
      .seat-plaque.offline {
        border-color: var(--error);
        opacity: 0.65;
      }
      .seat-plaque.open {
        border-style: dashed;
        border-color: var(--border-light);
      }

      /* --- Seat badges --- */
      .seat-badge {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        padding: 3px 10px;
        border-radius: var(--radius-pill);
      }
      .badge-you {
        background: rgba(200,166,81,0.15);
        color: var(--color-gold);
      }
      .badge-ready {
        background: rgba(31,122,77,0.1);
        color: var(--success);
      }
      .badge-bot {
        background: rgba(116,192,252,0.12);
        color: #2D8AC7;
      }
      .badge-offline {
        background: rgba(176,46,46,0.1);
        color: var(--error);
      }
      .badge-open {
        background: rgba(0,0,0,0.04);
        color: var(--text-secondary);
      }

      .seat-name {
        font-weight: 600;
        font-size: 15px;
        color: var(--text-primary);
      }
      .take-seat-btn {
        font-size: 12px;
        padding: 6px 16px;
        margin-top: 4px;
      }

      .lobby-actions {
        margin-top: 8px;
      }
      .start-btn {
        padding: 14px 40px;
        font-size: 16px;
        min-height: 52px;
      }

      @media (max-width: 480px) {
        .lobby-body {
          padding: 24px 16px;
          gap: 24px;
        }
        .seats-grid {
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .seat-plaque {
          padding: 16px 12px;
        }
        .lobby-header {
          padding: 10px 12px;
        }
        .room-code {
          font-size: 18px;
          letter-spacing: 4px;
        }
      }
    `;
    document.head.appendChild(style);
  }
}
