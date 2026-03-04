import type { Screen, AppContext } from "../router";
import type { SeatIndex } from "../protocol";
import { escapeHtml } from "../utils/escape";

export class MatchSummaryScreen implements Screen {
  private ctx!: AppContext;
  private container!: HTMLElement;
  private unsubscribes: Array<() => void> = [];
  private hasVoted = false;

  mount(container: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    this.container = container;
    this.render();

    // Listen for state changes (rematch → new game starts)
    this.unsubscribes.push(
      ctx.state.subscribe(() => {
        const game = ctx.state.game;
        if (!game) return;
        if (game.phase === "lobby") {
          ctx.router.navigate("lobby");
        } else if (game.phase !== "match_end") {
          ctx.router.navigate("game");
        }
      }),
      ctx.connection.on("ROOM_LEFT", () => {
        ctx.router.navigate("home");
      }),
      ctx.connection.on("EVENT", (msg: any) => {
        if (msg.name === "REMATCH_VOTE") {
          const { count, required } = msg.payload as { count: number; required: number };
          const btn = this.container.querySelector<HTMLButtonElement>("#rematch-btn");
          if (btn) {
            btn.textContent = `Play Again (${count}/${required})`;
          }
        }
      })
    );

    ctx.sounds.matchEnd();
  }

  unmount(): void {
    this.unsubscribes.forEach((fn) => fn());
    this.unsubscribes = [];
  }

  private render(): void {
    const game = this.ctx.state.game;
    if (!game) {
      this.ctx.router.navigate("home");
      return;
    }

    // Determine winner
    const target = game.gameTarget;
    const entries = Object.entries(game.scores)
      .filter(([seat]) => game.players[Number(seat)])
      .map(([seat, score]) => ({ seat: Number(seat) as SeatIndex, score: score as number }))
      .sort((a, b) => b.score - a.score);

    const winner = entries.length > 0 ? entries[0] : null;
    const isMyWin = winner && winner.seat === this.ctx.state.mySeat;

    // Build leaderboard
    const rows = entries
      .map((e, i) => {
        const label = this.seatLabel(e.seat);
        const isSelf = e.seat === this.ctx.state.mySeat;
        const isWinner = i === 0;
        const trophy = isWinner ? "\uD83C\uDFC6" : "";
        return `
          <div class="lb-row ${isSelf ? "self" : ""} ${isWinner ? "winner" : ""}">
            <span class="lb-rank">${i + 1}</span>
            <span class="lb-trophy">${trophy}</span>
            <span class="lb-name">${label}</span>
            <span class="lb-score">${e.score}</span>
          </div>
        `;
      })
      .join("");

    this.container.innerHTML = `
      <div class="screen match-summary-screen">
        <div class="match-summary-wrap">
          <div class="match-summary-card">
            <div class="confetti-container">
              ${isMyWin ? this.renderConfetti() : ""}
            </div>

            <h1 class="match-title">${isMyWin ? "Victory!" : "Match Complete"}</h1>
            <p class="match-subtitle">Target: ${target} points</p>

            <div class="match-winner">
              <span class="winner-trophy">\uD83C\uDFC6</span>
              <span class="winner-name">${winner ? this.seatLabel(winner.seat) : "Nobody"}</span>
              <span class="winner-score">${winner ? winner.score : 0} pts</span>
            </div>

            <div class="leaderboard">
              ${rows}
            </div>

            <div class="match-stats">
              <div class="stat">
                <span class="stat-label">Hands Played</span>
                <span class="stat-value">${game.handNo}</span>
              </div>
              <div class="stat">
                <span class="stat-label">Mode</span>
                <span class="stat-value">${game.mode === "tresillo" ? "Tresillo" : "Quadrille"}</span>
              </div>
            </div>

            <div class="match-actions">
              <button class="primary rematch-btn" id="rematch-btn">Play Again</button>
              <button class="leave-btn" id="leave-btn">Leave Room</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.addStyles();
    this.attachHandlers();
  }

  private attachHandlers(): void {
    const rematchBtn = this.container.querySelector<HTMLButtonElement>("#rematch-btn");
    rematchBtn?.addEventListener("click", () => {
      if (this.hasVoted) return;
      this.hasVoted = true;
      this.ctx.connection.send({ type: "REMATCH" });
      rematchBtn.classList.add("voted");
      rematchBtn.textContent = "Voted — waiting…";
    });

    this.container.querySelector("#leave-btn")?.addEventListener("click", () => {
      this.ctx.connection.send({ type: "LEAVE_ROOM" });
      this.ctx.state.reset();
      this.ctx.router.navigate("home");
    });
  }

  private seatLabel(seat: SeatIndex | null): string {
    if (seat === null) return "...";
    if (seat === this.ctx.state.mySeat) return "You";
    const player = this.ctx.state.game?.players[seat];
    return escapeHtml(player?.handle || `Seat ${seat}`);
  }

  private renderConfetti(): string {
    // CSS-only confetti particles
    const particles: string[] = [];
    const colors = ["#C8A651", "#B02E2E", "#2A4D41", "#F8F6F0", "#C8A651", "#B02E2E"];
    for (let i = 0; i < 30; i++) {
      const color = colors[i % colors.length];
      const left = Math.random() * 100;
      const delay = Math.random() * 2;
      const size = 4 + Math.random() * 6;
      particles.push(
        `<div class="confetti-piece" style="left:${left}%;animation-delay:${delay}s;background:${color};width:${size}px;height:${size}px;"></div>`
      );
    }
    return particles.join("");
  }

  private addStyles(): void {
    if (document.getElementById("match-summary-styles")) return;
    const style = document.createElement("style");
    style.id = "match-summary-styles";
    style.textContent = `
      .match-summary-screen {
        display: flex;
        align-items: center;
        justify-content: center;
        background: radial-gradient(ellipse at center, #3A5D51 0%, #1A2F28 70%);
      }
      .match-summary-wrap {
        animation: fadeInUp 0.5s ease-out;
        position: relative;
      }
      .match-summary-card {
        background: var(--color-ivory);
        border: 2px solid var(--color-gold);
        border-radius: var(--radius-lg);
        padding: 40px 32px;
        max-width: 480px;
        width: 90vw;
        text-align: center;
        position: relative;
        overflow: hidden;
        box-shadow: var(--shadow-elevated);
      }
      .confetti-container {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        overflow: hidden;
      }
      .confetti-piece {
        position: absolute;
        top: -10px;
        border-radius: 2px;
        animation: confettiFall 3s linear infinite;
      }
      @keyframes confettiFall {
        0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
        100% { transform: translateY(500px) rotate(720deg); opacity: 0; }
      }
      .match-title {
        font-family: var(--font-serif);
        font-size: 36px;
        font-weight: 700;
        color: var(--color-gold);
        margin-bottom: 4px;
        text-shadow: 0 2px 12px rgba(200, 166, 81, 0.3);
        position: relative;
      }
      .match-subtitle {
        font-size: 14px;
        color: var(--text-secondary);
        margin-bottom: 24px;
        position: relative;
      }
      .match-winner {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 16px;
        background: rgba(200, 166, 81, 0.1);
        border: 1px solid rgba(200, 166, 81, 0.3);
        border-radius: var(--radius-md);
        margin-bottom: 24px;
        position: relative;
      }
      .winner-trophy {
        font-size: 28px;
      }
      .winner-name {
        font-size: 20px;
        font-weight: 700;
        color: var(--text-accent);
      }
      .winner-score {
        font-size: 16px;
        color: var(--text-secondary);
      }
      .leaderboard {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-bottom: 20px;
        position: relative;
      }
      .lb-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: var(--radius-sm);
        font-size: 14px;
      }
      .lb-row.winner {
        background: rgba(200, 166, 81, 0.08);
      }
      .lb-row.self {
        border: 1px solid rgba(200, 166, 81, 0.3);
      }
      .lb-rank {
        width: 20px;
        font-weight: 700;
        color: var(--text-secondary);
      }
      .lb-trophy {
        width: 24px;
        font-size: 16px;
      }
      .lb-name {
        flex: 1;
        text-align: left;
        color: var(--text-primary);
        font-weight: 500;
      }
      .lb-score {
        font-weight: 700;
        color: var(--text-accent);
        font-size: 16px;
      }
      .match-stats {
        display: flex;
        justify-content: center;
        gap: 32px;
        margin-bottom: 24px;
        position: relative;
      }
      .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .stat-label {
        font-size: 11px;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      .stat-value {
        font-size: 18px;
        color: var(--text-primary);
        font-weight: 700;
      }
      .match-actions {
        display: flex;
        gap: 12px;
        justify-content: center;
        position: relative;
      }
      .rematch-btn {
        padding: 12px 28px;
        font-size: 16px;
        transition: opacity 0.2s;
      }
      .rematch-btn.voted {
        opacity: 0.7;
        cursor: default;
      }
      .leave-btn {
        padding: 12px 20px;
        font-size: 14px;
        opacity: 0.8;
      }
      @media (max-width: 480px) {
        .match-summary-card {
          padding: 28px 20px;
        }
        .match-title { font-size: 28px; }
        .match-actions { flex-direction: column; }
      }
    `;
    document.head.appendChild(style);
  }
}
