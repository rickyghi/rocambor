import "./lobby.css";

import type { Screen, AppContext } from "../router";
import { showToast } from "../ui/toast";
import type { SeatIndex } from "../protocol";
import { escapeHtml } from "../utils/escape";
import { buildBotAvatarUrl, buildDiceBearUrl, fallbackAvatarAt } from "../lib/avatars";

const OPEN_SEAT_AVATAR = "/assets/rocambor/open-seat-avatar.svg";

// Inline SVG icons (zero network requests)
const ICON_ARROW_LEFT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`;
const ICON_COPY = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const ICON_SHARE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;
const ICON_CROWN = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z"/></svg>`;
const ICON_BOT = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>`;

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
      ctx.profile.subscribe(() => this.render()),
      ctx.connection.on("EVENT", (msg: any) => {
        if (msg.name === "SEATED") {
          showToast(`${msg.payload.handle} joined`, "info");
        }
      }),
      ctx.connection.on("STATE", () => {
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
    const myProfile = this.ctx.profile.get();
    const isConnected = this.ctx.connection.connected;
    const hostSeat = game?.hostSeat ?? null;
    const isHost = mySeat !== null && (hostSeat === null || hostSeat === mySeat);
    const totalSeats = mode === "tresillo" ? 3 : 4;
    const gameTarget = game?.gameTarget || 12;

    // Count occupied seats — only iterate active seats
    let filledSeats = 0;
    for (let i = 0; i < totalSeats; i++) {
      if (game?.players[i]) filledSeats++;
    }

    // Can the game start? Server requires only 1 human — it fills empty seats with bots
    const canStart = isHost && filledSeats >= 1;
    const hasOpenSeats = filledSeats > 0 && filledSeats < totalSeats;

    // Build seat cards — only render totalSeats
    const seats: string[] = [];
    for (let i = 0; i < totalSeats; i++) {
      const player = game?.players[i];
      const isMine = mySeat === i;
      const isHostSeat = hostSeat === i || (hostSeat === null && isMine);
      const safeName = isMine
        ? escapeHtml(myProfile.name)
        : escapeHtml(player?.handle || `Seat ${i + 1}`);

      let statusClass = "open";
      let avatar = OPEN_SEAT_AVATAR;
      let openAvatarClass = " open-seat-avatar";
      let badgeHtml = "";
      let seatLabel = `Open Seat ${i + 1}`;

      if (player) {
        openAvatarClass = "";
        seatLabel = safeName;

        if (isMine) {
          statusClass = "you";
          avatar = myProfile.avatar;
          if (isHostSeat) {
            badgeHtml = `<span class="lobby-seat-badge badge-host"><span class="lobby-crown-icon">${ICON_CROWN}</span> Host</span>`;
          } else {
            badgeHtml = `<span class="lobby-seat-badge badge-you">You</span>`;
          }
        } else if (player.isBot) {
          statusClass = "bot";
          avatar = buildBotAvatarUrl(
            player.handle || `bot-${i}`,
            i,
            game?.roomCode || this.ctx.state.roomCode
          );
          badgeHtml = `<span class="lobby-seat-badge badge-bot"><span class="lobby-bot-icon">${ICON_BOT}</span> Bot</span>`;
        } else if (!player.connected) {
          statusClass = "offline";
          avatar = buildDiceBearUrl(player.handle || `seat-${i}`, "identicon");
          badgeHtml = `<span class="lobby-seat-badge badge-offline">Offline</span>`;
        } else {
          statusClass = "ready";
          avatar = buildDiceBearUrl(player.handle || `seat-${i}`, "identicon");
          if (isHostSeat) {
            badgeHtml = `<span class="lobby-seat-badge badge-host"><span class="lobby-crown-icon">${ICON_CROWN}</span> Host</span>`;
          } else {
            badgeHtml = `<span class="lobby-seat-badge badge-ready">Ready</span>`;
          }
        }
      } else {
        badgeHtml = `<span class="lobby-seat-badge badge-open">Open</span>`;
      }

      const sitBtnHtml =
        statusClass === "open" && mySeat === null
          ? `<button class="lobby-sit-btn" data-seat="${i}" type="button">Sit Here</button>`
          : "";

      seats.push(`
        <article class="lobby-seat ${statusClass}" aria-label="${statusClass === "open" ? `Open seat ${i + 1}` : safeName}">
          <img class="lobby-seat-avatar${openAvatarClass}" src="${avatar}" data-fallback="${fallbackAvatarAt(i)}" alt="${safeName}" />
          <div class="lobby-seat-info">
            <div class="lobby-seat-name">${statusClass === "open" ? seatLabel : safeName}</div>
            ${badgeHtml}
          </div>
          ${sitBtnHtml}
        </article>
      `);
    }

    // Start button area HTML
    const emptyCount = totalSeats - filledSeats;
    const botHintHtml = hasOpenSeats
      ? `<span class="lobby-bot-hint">${ICON_BOT} ${emptyCount} empty seat${emptyCount !== 1 ? "s" : ""} will be filled with bots</span>`
      : "";
    const startAreaHtml = isHost
      ? `
        <div class="lobby-start-area" id="lobby-start-area">
          ${botHintHtml}
          <button class="lobby-start-btn" data-action="start" type="button" ${canStart ? "" : "disabled"}>
            Start Game
          </button>
          ${!canStart ? `<span class="lobby-start-hint lobby-waiting-pulse">Awaiting players<span class="lobby-waiting-dots"></span></span>` : ""}
        </div>
      `
      : mySeat !== null
        ? `<div class="lobby-start-area"><span class="lobby-start-hint lobby-waiting-pulse">Waiting for host to start<span class="lobby-waiting-dots"></span></span></div>`
        : "";

    // Connection status
    const connDotClass = isConnected ? "" : " offline";
    const connLabel = isConnected ? "Connected" : "Disconnected";

    // Build full HTML
    this.container.innerHTML = `
      <div class="screen lobby-screen">
        <!-- Floating top-left Leave button -->
        <button class="lobby-float-leave" data-action="leave" type="button" aria-label="Leave room">
          <span class="lobby-back-arrow">${ICON_ARROW_LEFT}</span>
          <span>Leave</span>
        </button>

        <!-- Body -->
        <div class="lobby-body">
          <div class="lobby-panel">
            <!-- Mobile header (visible only on small screens via CSS) -->
            <div class="lobby-mobile-header" aria-hidden="true">
              <div class="lobby-mobile-title">Royal Salon</div>
              <div class="lobby-mobile-subtitle">Private Match &middot; ${mode === "tresillo" ? "Tresillo (3P)" : "Quadrille (4P)"}</div>
            </div>

            <!-- Room code -->
            <div class="lobby-code-header">
              <span class="lobby-code-label">Room Code</span>
              <div class="lobby-code-row">
                <span class="lobby-code-value">${escapeHtml(code)}</span>
                <button class="lobby-copy-btn" data-action="copy" type="button" aria-label="Copy room code">
                  ${ICON_COPY}
                  <span>Copy Code</span>
                </button>
              </div>
            </div>

            <!-- Meta row: player count + connection -->
            <div class="lobby-meta-row">
              <span class="lobby-player-count"><strong>${filledSeats}</strong>/${totalSeats} Players</span>
              <span class="lobby-config-dot" aria-hidden="true"></span>
              <span class="lobby-connection-label" aria-live="polite">
                <span class="lobby-connection-dot${connDotClass}" aria-hidden="true"></span>
                ${connLabel}
              </span>
            </div>

            <!-- Seats grid -->
            <div class="lobby-seats${mode === "tresillo" ? " tresillo" : ""}" role="list" aria-label="Player seats">
              ${seats.join("")}
            </div>

            <!-- Match configuration -->
            <div class="lobby-config-row">
              <span class="lobby-config-item">
                Mode: <strong>${mode === "tresillo" ? "Tresillo" : "Quadrille"}</strong>
              </span>
              <span class="lobby-config-dot" aria-hidden="true"></span>
              <span class="lobby-config-item">
                Target: <strong>${gameTarget} pts</strong>
              </span>
              <span class="lobby-config-dot" aria-hidden="true"></span>
              <span class="lobby-config-item">
                Deck: <strong>40 cards</strong>
              </span>
            </div>

            <!-- Divider -->
            <div class="lobby-divider" aria-hidden="true"></div>

            <!-- Start game (desktop) -->
            <div class="lobby-desktop-start">
              ${startAreaHtml}
            </div>
          </div>
        </div>

        <!-- Sticky start bar (mobile only, rendered via CSS) -->
        ${isHost || mySeat !== null
          ? `<div class="lobby-start-sticky" id="lobby-start-sticky">${startAreaHtml}</div>`
          : ""}
      </div>
    `;

    this.attachHandlers();
  }

  private attachHandlers(): void {
    // Leave room
    this.container.querySelector('[data-action="leave"]')?.addEventListener("click", () => {
      this.ctx.connection.send({ type: "LEAVE_ROOM" });
      this.ctx.state.reset();
      this.ctx.router.navigate("home");
    });

    // Copy room code (may appear multiple times)
    this.container.querySelectorAll('[data-action="copy"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const code = this.ctx.state.roomCode;
        if (!code) return;
        navigator.clipboard.writeText(code).then(
          () => showToast("Code copied!", "success", 1200),
          () => showToast("Failed to copy", "error")
        );
      });
    });

    // Start game
    this.container.querySelectorAll('[data-action="start"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        this.ctx.connection.send({ type: "START_GAME" });
      });
    });

    // Sit here buttons
    this.container.querySelectorAll<HTMLButtonElement>(".lobby-sit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const seat = parseInt(btn.dataset.seat || "0", 10) as SeatIndex;
        this.ctx.connection.send({ type: "TAKE_SEAT", seat });
      });
    });

    // Avatar fallbacks
    this.container.querySelectorAll<HTMLImageElement>(".lobby-seat-avatar").forEach((img) => {
      const fallback = img.dataset.fallback || "/avatars/avatar-01.svg";
      img.addEventListener("error", () => {
        if (img.src.endsWith(fallback)) return;
        img.src = fallback;
      });
    });

  }
}
