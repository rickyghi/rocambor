import "./lobby.css";

import type { Screen, AppContext } from "../router";
import { showToast } from "../ui/toast";
import type { SeatIndex } from "../protocol";
import { escapeHtml } from "../utils/escape";
import { buildBotAvatarUrl, buildDiceBearUrl, fallbackAvatarAt } from "../lib/avatars";

const OPEN_SEAT_AVATAR = "/assets/rocambor/open-seat-avatar.svg";

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

    const seats: string[] = [];

    for (let i = 0; i < 4; i++) {
      const player = game?.players[i];
      const isResting = game?.resting === i;
      const isMine = mySeat === i;
      const safeName = isMine ? escapeHtml(myProfile.name) : escapeHtml(player?.handle || `Seat ${i}`);

      if (isResting && mode === "tresillo") continue;

      let badge = "OPEN";
      let statusClass = "open";
      let avatar = OPEN_SEAT_AVATAR;
      let openAvatarClass = " open-seat-avatar";

      if (player) {
        openAvatarClass = "";
        if (isMine) {
          badge = "YOU";
          statusClass = "you";
          avatar = myProfile.avatar;
        } else if (player.isBot) {
          badge = "BOT";
          statusClass = "bot";
          avatar = buildBotAvatarUrl(
            player.handle || `bot-${i}`,
            i,
            game?.roomCode || this.ctx.state.roomCode
          );
        } else if (!player.connected) {
          badge = "OFFLINE";
          statusClass = "offline";
          avatar = buildDiceBearUrl(player.handle || `seat-${i}`, "identicon");
        } else {
          badge = "READY";
          statusClass = "ready";
          avatar = buildDiceBearUrl(player.handle || `seat-${i}`, "identicon");
        }
      }

      seats.push(`
        <article class="lobby-seat ${statusClass}">
          <div class="lobby-seat-badge">${badge}</div>
          <img class="lobby-seat-avatar${openAvatarClass}" src="${avatar}" data-fallback="${fallbackAvatarAt(i)}" alt="${safeName}" />
          <div class="lobby-seat-name">${player ? safeName : "Open Seat"}</div>
          ${statusClass === "open" && mySeat === null ? `<button class="btn-secondary take-seat-btn" data-seat="${i}" type="button">Sit Here</button>` : ""}
        </article>
      `);
    }

    this.container.innerHTML = `
      <div class="screen lobby-screen">
        <header class="lobby-header rc-panel rc-panel-noise">
          <button class="btn-ghost" data-action="leave" type="button">Back</button>
          <div class="lobby-room-meta">
            <strong class="room-code">${escapeHtml(code)}</strong>
            <span class="room-mode">${mode === "tresillo" ? "Tresillo" : "Quadrille"}</span>
          </div>
          <button class="btn-secondary" data-action="copy" type="button">Copy Code</button>
        </header>

        <main class="lobby-main">
          <section class="lobby-panel rc-panel rc-panel-noise">
            <h2>Waiting for Players</h2>
            <div class="ornament-divider"></div>

            <div class="lobby-seats">
              ${seats.join("")}
            </div>

            ${mySeat !== null && (game?.hostSeat == null || game?.hostSeat === mySeat)
              ? `<div class="lobby-actions"><button class="btn-primary" data-action="start" type="button">Start Game</button></div>`
              : ""}
          </section>
        </main>
      </div>
    `;

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
      if (!code) return;
      navigator.clipboard.writeText(code).then(
        () => showToast("Code copied", "success", 1200),
        () => showToast("Failed to copy", "error")
      );
    });

    this.container.querySelector('[data-action="start"]')?.addEventListener("click", () => {
      this.ctx.connection.send({ type: "START_GAME" });
    });

    this.container.querySelectorAll<HTMLButtonElement>(".take-seat-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const seat = parseInt(btn.dataset.seat || "0", 10) as SeatIndex;
        this.ctx.connection.send({ type: "TAKE_SEAT", seat });
      });
    });

    this.container.querySelectorAll<HTMLImageElement>(".lobby-seat-avatar").forEach((img) => {
      const fallback = img.dataset.fallback || "/avatars/avatar-01.svg";
      img.addEventListener("error", () => {
        if (img.src.endsWith(fallback)) return;
        img.src = fallback;
      });
    });
  }
}
