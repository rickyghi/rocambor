import type { Screen, AppContext } from "../router";
import { showToast } from "../ui/toast";

interface LeaderboardEntry {
  playerId: string;
  handle: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
  elo: number;
  lastPlayed: string | null;
}

export class LeaderboardScreen implements Screen {
  private ctx!: AppContext;
  private container!: HTMLElement;
  private loading = false;
  private error: string | null = null;
  private rows: LeaderboardEntry[] = [];

  mount(container: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    this.container = container;
    this.addStyles();
    this.load();
  }

  unmount(): void {
    // no-op
  }

  private async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    this.render();

    try {
      const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "";
      const res = await fetch(`${base}/api/leaderboard?limit=25`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const payload = await res.json();
      this.rows = Array.isArray(payload?.leaderboard) ? payload.leaderboard : [];
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Could not load leaderboard";
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private render(): void {
    if (this.loading) {
      this.container.innerHTML = `
        <div class="screen leaderboard-screen">
          <div class="leaderboard-wrap">
            <div class="leaderboard-header">
              <button class="lb-back-btn" data-action="back">\u2190 Back</button>
              <h1>Leaderboard</h1>
              <button class="lb-refresh-btn" disabled>Refresh</button>
            </div>
            <div class="leaderboard-state">Loading leaderboard...</div>
          </div>
        </div>
      `;
      this.attachHandlers();
      return;
    }

    if (this.error) {
      this.container.innerHTML = `
        <div class="screen leaderboard-screen">
          <div class="leaderboard-wrap">
            <div class="leaderboard-header">
              <button class="lb-back-btn" data-action="back">\u2190 Back</button>
              <h1>Leaderboard</h1>
              <button class="lb-refresh-btn" data-action="refresh">Refresh</button>
            </div>
            <div class="leaderboard-state error">Failed to load: ${this.error}</div>
          </div>
        </div>
      `;
      this.attachHandlers();
      return;
    }

    const rows = this.rows.length
      ? this.rows
          .map((entry, idx) => {
            const winRate = `${Math.round((entry.winRate || 0) * 100)}%`;
            const played = entry.lastPlayed
              ? new Date(entry.lastPlayed).toLocaleDateString()
              : "-";
            const medal =
              idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "";
            return `
              <div class="leaderboard-row ${idx < 3 ? "top" : ""}">
                <div class="col rank">${medal || idx + 1}</div>
                <div class="col handle">${entry.handle}</div>
                <div class="col wins">${entry.wins}</div>
                <div class="col games">${entry.gamesPlayed}</div>
                <div class="col rate">${winRate}</div>
                <div class="col elo">${entry.elo}</div>
                <div class="col played">${played}</div>
              </div>
            `;
          })
          .join("")
      : `<div class="leaderboard-state">No matches recorded yet.</div>`;

    this.container.innerHTML = `
      <div class="screen leaderboard-screen">
        <div class="leaderboard-wrap">
          <div class="leaderboard-header">
            <button class="lb-back-btn" data-action="back">\u2190 Back</button>
            <h1>Leaderboard</h1>
            <button class="lb-refresh-btn" data-action="refresh">Refresh</button>
          </div>

          <div class="leaderboard-table">
            <div class="leaderboard-row head">
              <div class="col rank">#</div>
              <div class="col handle">Player</div>
              <div class="col wins">Wins</div>
              <div class="col games">Games</div>
              <div class="col rate">Win %</div>
              <div class="col elo">Elo</div>
              <div class="col played">Last Played</div>
            </div>
            ${rows}
          </div>
        </div>
      </div>
    `;

    this.attachHandlers();
  }

  private attachHandlers(): void {
    this.container.querySelector('[data-action="back"]')?.addEventListener("click", () => {
      this.ctx.router.navigate("home");
    });
    this.container.querySelector('[data-action="refresh"]')?.addEventListener("click", () => {
      this.load().catch(() => showToast("Could not refresh leaderboard", "error"));
    });
  }

  private addStyles(): void {
    if (document.getElementById("leaderboard-styles")) return;
    const style = document.createElement("style");
    style.id = "leaderboard-styles";
    style.textContent = `
      .leaderboard-screen {
        align-items: center;
        justify-content: center;
        background: var(--bg-primary);
      }
      .leaderboard-wrap {
        width: min(980px, 95vw);
        max-height: 88vh;
        overflow: auto;
        border: 1px solid rgba(200, 166, 81, 0.3);
        border-radius: var(--radius-lg);
        background: var(--bg-secondary);
        box-shadow: var(--shadow-elevated);
        padding: 24px;
      }
      .leaderboard-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 20px;
        padding-bottom: 16px;
        border-bottom: 1px solid var(--border);
      }
      .leaderboard-header h1 {
        margin: 0;
        color: var(--text-primary);
        font-size: 32px;
        font-family: var(--font-serif);
        font-weight: 700;
        letter-spacing: 0.5px;
      }
      .lb-back-btn, .lb-refresh-btn {
        min-width: 88px;
        font-family: var(--font-sans);
      }
      .leaderboard-table {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        overflow: hidden;
      }
      .leaderboard-row {
        display: grid;
        grid-template-columns: 52px minmax(180px, 1.4fr) repeat(4, minmax(70px, 0.7fr)) minmax(110px, 1fr);
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        color: var(--text-primary);
        font-size: 14px;
        font-family: var(--font-sans);
        transition: background 0.15s;
      }
      .leaderboard-row.head {
        background: var(--bg-tertiary);
        font-weight: 700;
        color: var(--text-primary);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .leaderboard-row:not(.head):nth-child(even) {
        background: rgba(248, 246, 240, 0.5);
      }
      .leaderboard-row:not(.head):hover {
        background: rgba(200, 166, 81, 0.08);
      }
      .leaderboard-row.top {
        background: rgba(200, 166, 81, 0.1);
      }
      .leaderboard-row.top:hover {
        background: rgba(200, 166, 81, 0.18);
      }
      .col.rank {
        text-align: center;
        font-weight: 700;
        color: var(--color-gold);
      }
      .col.handle {
        font-weight: 600;
      }
      .col.wins, .col.games, .col.rate {
        text-align: center;
        color: var(--text-secondary);
      }
      .col.elo {
        text-align: center;
        font-weight: 700;
        color: var(--color-gold);
      }
      .col.played {
        text-align: right;
        color: var(--text-secondary);
        font-size: 13px;
      }
      .leaderboard-state {
        color: var(--text-secondary);
        padding: 24px 8px;
        text-align: center;
        font-family: var(--font-sans);
      }
      .leaderboard-state.error {
        color: var(--color-crimson);
      }
      @media (max-width: 780px) {
        .leaderboard-wrap {
          padding: 16px;
        }
        .leaderboard-header h1 {
          font-size: 24px;
        }
        .leaderboard-row {
          grid-template-columns: 34px minmax(110px, 1.2fr) repeat(4, minmax(52px, 0.7fr));
          font-size: 12px;
          padding: 10px 12px;
        }
        .col.played {
          display: none;
        }
      }
    `;
    document.head.appendChild(style);
  }
}
