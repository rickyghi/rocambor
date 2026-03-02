import type { Screen, AppContext } from "../router";
import type { GameState, SeatIndex } from "../protocol";

export class PostHandScreen implements Screen {
  private ctx!: AppContext;
  private container!: HTMLElement;
  private unsubscribes: Array<() => void> = [];

  mount(container: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    this.container = container;
    this.render();

    // Listen for state changes (next hand will switch phase)
    this.unsubscribes.push(
      ctx.state.subscribe(() => {
        const game = ctx.state.game;
        if (!game) return;

        if (game.phase === "match_end") {
          ctx.router.navigate("match-summary");
        } else if (
          game.phase !== "post_hand" &&
          game.phase !== "scoring"
        ) {
          // Next hand started, go back to game
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
    if (!game) {
      this.ctx.router.navigate("home");
      return;
    }

    const ombre = game.ombre;
    const contract = game.contract;
    const trump = game.trump;

    // Gather trick counts
    const trickRows = this.buildTrickRows(game);
    const resultText = this.getResultText(game);
    const resultClass = this.getResultClass(game);

    // Trump symbol
    const trumpSymbols: Record<string, string> = {
      oros: "\u2666 Oros",
      copas: "\u2665 Copas",
      espadas: "\u2660 Espadas",
      bastos: "\u2663 Bastos",
    };

    // Contract display
    const contractLabels: Record<string, string> = {
      entrada: "Entrada",
      volteo: "Volteo",
      solo: "Solo",
      oros: "Oros",
      solo_oros: "Solo Oros",
      bola: "Bola",
      contrabola: "Contrabola",
      penetro: "Penetro",
    };

    this.container.innerHTML = `
      <div class="screen post-hand-screen">
        <div class="post-hand-overlay">
          <div class="post-hand-card">
            <h2>Hand ${game.handNo} Complete</h2>

            <div class="post-hand-result ${resultClass}">
              ${resultText}
            </div>

            <div class="post-hand-details">
              <div class="detail-row">
                <span class="detail-label">Contract</span>
                <span class="detail-value">${contractLabels[contract || ""] || contract || "-"}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Trump</span>
                <span class="detail-value">${trumpSymbols[trump || ""] || "-"}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Ombre</span>
                <span class="detail-value">${this.seatLabel(ombre)}</span>
              </div>
            </div>

            <div class="post-hand-tricks">
              <h3>Tricks Won</h3>
              <div class="tricks-table">
                ${trickRows}
              </div>
            </div>

            <div class="post-hand-scores">
              <h3>Scores</h3>
              <div class="scores-table">
                ${this.buildScoreRows(game)}
              </div>
            </div>

            <div class="post-hand-hint">
              Next hand starting shortly...
            </div>
          </div>
        </div>
      </div>
    `;

    this.addStyles();
    this.ctx.sounds.trickWin();
  }

  private buildTrickRows(game: GameState): string {
    const seats = game.mode === "tresillo" ? [0, 1, 2, 3] : [0, 1, 2, 3];
    return seats
      .filter((s) => game.resting !== s)
      .map((s) => {
        const tricks = game.tricks[s] || 0;
        const isOmbre = game.ombre === s;
        const label = this.seatLabel(s as SeatIndex);
        return `
          <div class="trick-row ${isOmbre ? "ombre" : ""}">
            <span class="trick-name">${label}${isOmbre ? " (Ombre)" : ""}</span>
            <span class="trick-count">${tricks}</span>
          </div>
        `;
      })
      .join("");
  }

  private buildScoreRows(game: GameState): string {
    return [0, 1, 2, 3]
      .filter((s) => game.players[s])
      .map((s) => {
        const score = game.scores[s] || 0;
        const label = this.seatLabel(s as SeatIndex);
        const isSelf = this.ctx.state.mySeat === s;
        return `
          <div class="score-row ${isSelf ? "self" : ""}">
            <span class="score-name">${label}</span>
            <span class="score-value">${score}</span>
          </div>
        `;
      })
      .join("");
  }

  private getResultText(game: GameState): string {
    if (!game.ombre && game.ombre !== 0) return "Hand Complete";

    const ombreTricks = game.tricks[game.ombre] || 0;
    const isOmbreSelf = game.ombre === this.ctx.state.mySeat;

    if (game.contract === "bola") {
      if (ombreTricks === 9) {
        return isOmbreSelf ? "Bola Made!" : `${this.seatLabel(game.ombre)} made Bola!`;
      } else {
        return isOmbreSelf ? "Bola Failed" : `${this.seatLabel(game.ombre)} failed Bola`;
      }
    }

    if (game.contract === "contrabola") {
      if (ombreTricks === 0) {
        return isOmbreSelf ? "Contrabola Made!" : `${this.seatLabel(game.ombre)} made Contrabola!`;
      } else {
        return isOmbreSelf ? "Contrabola Failed" : `${this.seatLabel(game.ombre)} failed Contrabola`;
      }
    }

    if (ombreTricks >= 5) {
      return isOmbreSelf ? "Sacada! You won!" : `${this.seatLabel(game.ombre)} won (Sacada)`;
    } else {
      // Check codille vs puesta
      const opponentTricks = Object.entries(game.tricks)
        .filter(([seat]) => Number(seat) !== game.ombre && Number(seat) !== game.resting)
        .map(([, t]) => t as number);
      const anyOpponentOver5 = opponentTricks.some((t) => t >= 5);

      if (anyOpponentOver5) {
        return isOmbreSelf ? "Codille! You lost..." : `Codille against ${this.seatLabel(game.ombre)}`;
      } else {
        return isOmbreSelf ? "Puesta - draw" : `Puesta - ${this.seatLabel(game.ombre)} tied`;
      }
    }
  }

  private getResultClass(game: GameState): string {
    if (!game.ombre && game.ombre !== 0) return "";
    const ombreTricks = game.tricks[game.ombre] || 0;
    const isOmbreSelf = game.ombre === this.ctx.state.mySeat;

    if (game.contract === "bola") {
      if (ombreTricks === 9) return isOmbreSelf ? "result-win" : "result-loss";
      return isOmbreSelf ? "result-loss" : "result-win";
    }

    if (game.contract === "contrabola") {
      if (ombreTricks === 0) return isOmbreSelf ? "result-win" : "result-loss";
      return isOmbreSelf ? "result-loss" : "result-win";
    }

    if (ombreTricks >= 5) return isOmbreSelf ? "result-win" : "result-loss";
    return isOmbreSelf ? "result-loss" : "result-neutral";
  }

  private seatLabel(seat: SeatIndex | null): string {
    if (seat === null) return "...";
    if (seat === this.ctx.state.mySeat) return "You";
    const player = this.ctx.state.game?.players[seat];
    return player?.handle || `Seat ${seat}`;
  }

  private addStyles(): void {
    if (document.getElementById("post-hand-styles")) return;
    const style = document.createElement("style");
    style.id = "post-hand-styles";
    style.textContent = `
      .post-hand-screen {
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(12, 25, 18, 0.95);
      }
      .post-hand-overlay {
        animation: fadeInUp 0.4s ease-out;
      }
      @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .post-hand-card {
        background: var(--bg-secondary);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: 32px;
        max-width: 420px;
        width: 90vw;
        text-align: center;
      }
      .post-hand-card h2 {
        color: var(--text-primary);
        font-size: 20px;
        margin-bottom: 16px;
      }
      .post-hand-result {
        font-size: 22px;
        font-weight: 700;
        padding: 12px 20px;
        border-radius: var(--radius-md);
        margin-bottom: 20px;
      }
      .result-win {
        color: #4ade80;
        background: rgba(74, 222, 128, 0.1);
        border: 1px solid rgba(74, 222, 128, 0.3);
      }
      .result-loss {
        color: #ff6b6b;
        background: rgba(255, 107, 107, 0.1);
        border: 1px solid rgba(255, 107, 107, 0.3);
      }
      .result-neutral {
        color: #fbbf24;
        background: rgba(251, 191, 36, 0.1);
        border: 1px solid rgba(251, 191, 36, 0.3);
      }
      .post-hand-details {
        display: flex;
        gap: 16px;
        justify-content: center;
        margin-bottom: 20px;
        flex-wrap: wrap;
      }
      .detail-row {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }
      .detail-label {
        font-size: 11px;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      .detail-value {
        font-size: 15px;
        color: var(--text-primary);
        font-weight: 600;
      }
      .post-hand-tricks, .post-hand-scores {
        margin-bottom: 16px;
      }
      .post-hand-tricks h3, .post-hand-scores h3 {
        font-size: 12px;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 2px;
        margin-bottom: 8px;
      }
      .tricks-table, .scores-table {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .trick-row, .score-row {
        display: flex;
        justify-content: space-between;
        padding: 6px 12px;
        border-radius: var(--radius-sm);
        font-size: 14px;
      }
      .trick-row.ombre {
        background: rgba(251, 191, 36, 0.1);
        border: 1px solid rgba(251, 191, 36, 0.2);
      }
      .trick-name, .score-name {
        color: var(--text-secondary);
      }
      .trick-count, .score-value {
        color: var(--text-primary);
        font-weight: 700;
      }
      .score-row.self {
        background: rgba(74, 222, 128, 0.08);
      }
      .score-row.self .score-name {
        color: var(--text-accent);
      }
      .post-hand-hint {
        font-size: 13px;
        color: var(--text-secondary);
        font-style: italic;
        margin-top: 8px;
      }
    `;
    document.head.appendChild(style);
  }
}
