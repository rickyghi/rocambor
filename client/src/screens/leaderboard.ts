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

  private renderSkeletonRows(): string {
    return Array.from({ length: 6 })
      .map(
        (_, i) => `
        <div class="leaderboard-row skeleton-row" style="animation-delay: ${i * 80}ms">
          <div class="col rank"><span class="skel-block skel-circle" style="width:28px;height:28px;"></span></div>
          <div class="col handle"><span class="skel-block skel-text" style="width:${90 + Math.random() * 60}px;"></span></div>
          <div class="col wins"><span class="skel-block skel-text" style="width:28px;"></span></div>
          <div class="col games"><span class="skel-block skel-text" style="width:28px;"></span></div>
          <div class="col rate"><span class="skel-block skel-text" style="width:36px;"></span></div>
          <div class="col elo"><span class="skel-block skel-text" style="width:40px;"></span></div>
          <div class="col played"><span class="skel-block skel-text" style="width:72px;"></span></div>
        </div>
      `
      )
      .join("");
  }

  private renderRankBadge(idx: number): string {
    if (idx === 0) return `<span class="rank-badge rank-1st">1</span>`;
    if (idx === 1) return `<span class="rank-badge rank-2nd">2</span>`;
    if (idx === 2) return `<span class="rank-badge rank-3rd">3</span>`;
    return `<span class="rank-num">${idx + 1}</span>`;
  }

  private render(): void {
    if (this.loading) {
      this.container.innerHTML = `
        <div class="screen leaderboard-screen">
          <div class="leaderboard-wrap panel-parchment">
            <div class="leaderboard-header">
              <button class="btn-ghost-felt lb-back-btn" data-action="back">\u2190 Back</button>
              <h1>Leaderboard</h1>
              <button class="btn-ivory-engraved lb-refresh-btn" disabled>Refresh</button>
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
              ${this.renderSkeletonRows()}
            </div>
          </div>
        </div>
      `;
      this.attachHandlers();
      return;
    }

    if (this.error) {
      this.container.innerHTML = `
        <div class="screen leaderboard-screen">
          <div class="leaderboard-wrap panel-parchment">
            <div class="leaderboard-header">
              <button class="btn-ghost-felt lb-back-btn" data-action="back">\u2190 Back</button>
              <h1>Leaderboard</h1>
              <button class="btn-ivory-engraved lb-refresh-btn" data-action="refresh">Refresh</button>
            </div>
            <div class="leaderboard-state error">${this.error}</div>
          </div>
        </div>
      `;
      this.attachHandlers();
      return;
    }

    const myId = this.ctx.state.game?.players?.[this.ctx.state.mySeat ?? -1]?.playerId;

    const rows = this.rows.length
      ? this.rows
          .map((entry, idx) => {
            const winRate = `${Math.round((entry.winRate || 0) * 100)}%`;
            const played = entry.lastPlayed
              ? new Date(entry.lastPlayed).toLocaleDateString()
              : "-";
            const isSelf = myId && entry.playerId === myId;
            return `
              <div class="leaderboard-row ${idx < 3 ? "top" : ""} ${isSelf ? "self-row" : ""}">
                <div class="col rank">${this.renderRankBadge(idx)}</div>
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
      : `
        <div class="leaderboard-empty">
          <div class="empty-suit">\u2660</div>
          <p class="empty-msg">No matches recorded yet</p>
          <button class="btn-gold-plaque empty-cta" data-action="play">Play your first game</button>
        </div>
      `;

    this.container.innerHTML = `
      <div class="screen leaderboard-screen">
        <div class="leaderboard-wrap panel-parchment">
          <div class="leaderboard-header">
            <button class="btn-ghost-felt lb-back-btn" data-action="back">\u2190 Back</button>
            <h1>Leaderboard</h1>
            <button class="btn-ivory-engraved lb-refresh-btn" data-action="refresh">Refresh</button>
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
    this.container.querySelector('[data-action="play"]')?.addEventListener("click", () => {
      this.ctx.router.navigate("home");
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
        animation: fadeInUp var(--dur-slow) var(--ease-decelerate);
      }
      .leaderboard-wrap {
        width: min(980px, 95vw);
        max-height: 88vh;
        overflow: auto;
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
        font-size: 28px;
        font-family: var(--font-display);
        font-weight: 700;
        letter-spacing: 0.5px;
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
        transition: background var(--dur-fast) var(--ease-standard);
      }
      .leaderboard-row.head {
        background: var(--bg-tertiary);
        font-weight: 700;
        color: var(--text-primary);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        position: sticky;
        top: 0;
        z-index: 1;
      }
      .leaderboard-row:not(.head):nth-child(even) {
        background: rgba(248, 246, 240, 0.5);
      }
      .leaderboard-row:not(.head):hover {
        background: rgba(200, 166, 81, 0.08);
      }
      .leaderboard-row.top {
        background: rgba(200, 166, 81, 0.08);
      }
      .leaderboard-row.top:hover {
        background: rgba(200, 166, 81, 0.15);
      }
      .leaderboard-row.self-row {
        border-left: 3px solid var(--color-gold);
        background: rgba(200, 166, 81, 0.1);
      }

      /* --- Rank badges --- */
      .rank-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        font-size: 13px;
        font-weight: 700;
        color: #fff;
      }
      .rank-1st {
        background: linear-gradient(135deg, #D4B95E, #C8A651, #A88A3E);
        box-shadow: 0 1px 4px rgba(200,166,81,0.4);
      }
      .rank-2nd {
        background: linear-gradient(135deg, #B8B8B8, #A0A0A0, #888888);
        box-shadow: 0 1px 4px rgba(128,128,128,0.3);
      }
      .rank-3rd {
        background: linear-gradient(135deg, #CD8A5A, #B87333, #A0622E);
        box-shadow: 0 1px 4px rgba(184,115,51,0.3);
      }
      .rank-num {
        font-weight: 600;
        color: var(--text-secondary);
      }
      .col.rank {
        text-align: center;
        display: flex;
        align-items: center;
        justify-content: center;
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

      /* --- Skeleton rows --- */
      .skeleton-row .skel-block {
        display: inline-block;
      }
      .skeleton-row .col {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .skeleton-row .col.handle {
        justify-content: flex-start;
      }

      /* --- States --- */
      .leaderboard-state {
        color: var(--text-secondary);
        padding: 24px 8px;
        text-align: center;
        font-family: var(--font-sans);
      }
      .leaderboard-state.error {
        color: var(--color-crimson);
      }

      /* --- Empty state --- */
      .leaderboard-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        padding: 48px 16px;
      }
      .empty-suit {
        font-size: 48px;
        color: var(--border-light);
        line-height: 1;
      }
      .empty-msg {
        font-size: 16px;
        color: var(--text-secondary);
        font-family: var(--font-serif);
      }
      .empty-cta {
        padding: 10px 24px;
        font-size: 14px;
      }

      @media (max-width: 780px) {
        .leaderboard-wrap {
          padding: 16px;
        }
        .leaderboard-header h1 {
          font-size: 20px;
        }
        .leaderboard-row {
          grid-template-columns: 34px minmax(110px, 1.2fr) repeat(4, minmax(52px, 0.7fr));
          font-size: 12px;
          padding: 8px 10px;
        }
        .col.played {
          display: none;
        }
        .rank-badge {
          width: 24px;
          height: 24px;
          font-size: 11px;
        }
      }
    `;
    document.head.appendChild(style);
  }
}
