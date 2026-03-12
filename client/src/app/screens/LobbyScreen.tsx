import type { ReactElement } from "react";
import { useEffect } from "react";
import type { AppContext } from "../../router";
import type { SeatIndex } from "../../protocol";
import { showToast } from "../../ui/toast";
import { buildBotAvatarUrl, buildDiceBearUrl, fallbackAvatarAt } from "../../lib/avatars";
import { useClientState, useConnectionSnapshot, useProfile } from "../hooks";
import "../../screens/lobby.css";

const OPEN_SEAT_AVATAR = "/assets/rocambor/open-seat-avatar.svg";
const ICON_ARROW_LEFT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`;
const ICON_COPY = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const ICON_CROWN = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z"/></svg>`;
const ICON_BOT = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>`;
const ICON_USERS = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6"/><path d="M23 11h-6"/></svg>`;

function Icon({ markup }: { markup: string }): ReactElement {
  return <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />;
}

export function LobbyScreen({ ctx }: { ctx: AppContext }): ReactElement | null {
  const state = useClientState(ctx.state);
  const profile = useProfile(ctx.profile);
  const { connected } = useConnectionSnapshot(ctx.connection);
  const game = state.game;
  const pendingRoomCode = state.roomCode;

  useEffect(() => {
    if (!game) {
      if (!pendingRoomCode) {
        ctx.router.navigate("home");
      }
      return;
    }
    if (game.phase !== "lobby") {
      ctx.router.navigate("game");
    }
  }, [ctx.router, game, pendingRoomCode]);

  useEffect(() => {
    const unsubscribes = [
      ctx.connection.on("EVENT", (msg: any) => {
        if (msg.name === "SEATED") {
          showToast(`${msg.payload.handle} joined`, "info");
        }
      }),
    ];

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [ctx.connection]);

  if (!game) {
    return (
      <div className="screen lobby-screen">
        <button
          className="lobby-float-leave"
          data-action="leave"
          type="button"
          aria-label="Leave room"
          onClick={() => {
            ctx.connection.send({ type: "LEAVE_ROOM" });
            ctx.state.reset();
            ctx.router.navigate("home");
          }}
        >
          <span className="lobby-back-arrow">
            <Icon markup={ICON_ARROW_LEFT} />
          </span>
          <span>Leave</span>
        </button>

        <div className="lobby-body">
          <div className="lobby-title-stack">
            <span className={`lobby-session-pill${connected ? "" : " offline"}`}>
              <span className="lobby-session-dot" aria-hidden="true" />
              {connected ? "Session Active" : "Reconnecting"}
            </span>
            <h1 className="lobby-room-title">Joining your salon</h1>
            <p className="lobby-room-subtitle">
              Room {pendingRoomCode || "..."} is being prepared for the first snapshot.
            </p>
          </div>

          <div className="lobby-panel lobby-panel-loading">
            <div className="lobby-loading-shell" role="status" aria-live="polite">
              <div className="lobby-loading-orb" aria-hidden="true" />
              <div className="lobby-loading-copy">
                <span className="lobby-loading-kicker">Preparing Lobby</span>
                <strong className="lobby-loading-title">Fetching seats and room state</strong>
                <p className="lobby-loading-text">
                  You&apos;ll stay here for a moment while the table snapshot arrives from the
                  server.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const code = state.roomCode || "...";
  const mode = game.mode || "quadrille";
  const modeLabel = mode === "tresillo" ? "Tresillo (3P)" : "Quadrille (4P)";
  const mySeat = state.mySeat;
  const hostSeat = game.hostSeat ?? null;
  const isHost = mySeat !== null && (hostSeat === null || hostSeat === mySeat);
  const totalSeats = mode === "tresillo" ? 3 : 4;
  const gameTarget = game.gameTarget || 12;
  const roomName = game.roomName?.trim() || "The Salon Lobby";

  let filledSeats = 0;
  for (let i = 0; i < totalSeats; i++) {
    if (game.players[i]) filledSeats++;
  }

  const canStart = isHost && filledSeats >= 1;
  const hasOpenSeats = filledSeats > 0 && filledSeats < totalSeats;
  const emptyCount = totalSeats - filledSeats;

  const startArea = isHost ? (
    <div className="lobby-start-area" id="lobby-start-area">
      <span className="lobby-start-kicker">Host Controls</span>
      <span className="lobby-start-hint">
        {hasOpenSeats
          ? `Start now and ${emptyCount} open seat${emptyCount !== 1 ? "s" : ""} will be filled with bots.`
          : "All active seats are claimed and ready for the opening hand."}
      </span>
      {hasOpenSeats ? (
        <span className="lobby-bot-hint">
          <Icon markup={ICON_BOT} /> {emptyCount} empty seat{emptyCount !== 1 ? "s" : ""} will
          be filled with bots
        </span>
      ) : null}
      <button
        className="lobby-start-btn"
        data-action="start"
        type="button"
        disabled={!canStart}
        onClick={() => {
          ctx.connection.send({ type: "START_GAME" });
        }}
      >
        Start Game
      </button>
      {!canStart ? (
        <span className="lobby-start-hint lobby-waiting-pulse">
          Awaiting players<span className="lobby-waiting-dots" />
        </span>
      ) : null}
    </div>
  ) : mySeat !== null ? (
    <div className="lobby-start-area">
      <span className="lobby-start-kicker">Match Status</span>
      <span className="lobby-start-hint lobby-waiting-pulse">
        Waiting for host to start<span className="lobby-waiting-dots" />
      </span>
    </div>
  ) : null;

  return (
    <div className="screen lobby-screen">
      <button
        className="lobby-float-leave"
        data-action="leave"
        type="button"
        aria-label="Leave room"
        onClick={() => {
          ctx.connection.send({ type: "LEAVE_ROOM" });
          ctx.state.reset();
          ctx.router.navigate("home");
        }}
      >
        <span className="lobby-back-arrow">
          <Icon markup={ICON_ARROW_LEFT} />
        </span>
        <span>Leave</span>
      </button>

      <div className="lobby-body">
        <div className="lobby-title-stack">
          <span className={`lobby-session-pill${connected ? "" : " offline"}`}>
            <span className="lobby-session-dot" aria-hidden="true" />
            {connected ? "Session Active" : "Reconnecting"}
          </span>
          <h1 className="lobby-room-title">{roomName}</h1>
          <p className="lobby-room-subtitle">
            {modeLabel} private table · room {code} · {filledSeats}/{totalSeats} seated
          </p>
        </div>

        <div className="lobby-panel">
          <div className="lobby-code-header">
            <div className="lobby-code-block">
              <span className="lobby-code-icon" aria-hidden="true">
                <Icon markup={ICON_USERS} />
              </span>
              <div className="lobby-code-text">
                <span className="lobby-code-label">Private Room Code</span>
                <span className="lobby-code-value">{code}</span>
              </div>
            </div>
            <div className="lobby-code-row">
              <button
                className="lobby-copy-btn"
                data-action="copy"
                type="button"
                aria-label="Copy room code"
                onClick={() => {
                  if (!state.roomCode) return;
                  navigator.clipboard.writeText(state.roomCode).then(
                    () => showToast("Code copied!", "success", 1200),
                    () => showToast("Failed to copy", "error")
                  );
                }}
              >
                <Icon markup={ICON_COPY} />
                <span>Copy Code</span>
              </button>
            </div>
          </div>

          <div className="lobby-panel-body">
            <div className="lobby-meta-row">
              <span className="lobby-player-count">
                <strong>{filledSeats}</strong>/{totalSeats} seated
              </span>
              <span className="lobby-config-dot" aria-hidden="true" />
              <span className="lobby-config-item">
                <span className="lobby-config-key">Mode</span>
                <strong>{modeLabel}</strong>
              </span>
              <span className="lobby-config-dot" aria-hidden="true" />
              <span className="lobby-config-item">
                <span className="lobby-config-key">Target</span>
                <strong>{gameTarget} pts</strong>
              </span>
            </div>

            <div
              className={`lobby-seats${mode === "tresillo" ? " tresillo" : ""}`}
              role="list"
              aria-label="Player seats"
            >
              {Array.from({ length: totalSeats }, (_, seatIndex) => {
                const seat = seatIndex as SeatIndex;
                const player = game.players[seat];
                const isMine = mySeat === seat;
                const isHostSeat = hostSeat === seat || (hostSeat === null && isMine);
                const safeName = isMine ? profile.name : player?.handle || `Seat ${seat + 1}`;

                let statusClass = "open";
                let avatar = OPEN_SEAT_AVATAR;
                let openAvatarClass = " open-seat-avatar";
                let badge: ReactElement | null = (
                  <span className="lobby-seat-badge badge-open">Open</span>
                );
                let seatLabel = `Seat ${seat + 1}`;
                let seatMeta = "Invite a friend or start with a bot.";

                if (player) {
                  openAvatarClass = "";

                  if (isMine) {
                    statusClass = "you";
                    avatar = profile.avatar;
                    seatLabel = isHostSeat ? "Host Seat" : "Your Seat";
                    seatMeta = "You are seated and ready for the first hand.";
                    badge = isHostSeat ? (
                      <span className="lobby-seat-badge badge-host">
                        <span className="lobby-crown-icon">
                          <Icon markup={ICON_CROWN} />
                        </span>
                        {" "}Host
                      </span>
                    ) : (
                      <span className="lobby-seat-badge badge-you">You</span>
                    );
                  } else if (player.isBot) {
                    statusClass = "bot";
                    avatar = buildBotAvatarUrl(
                      player.handle || `bot-${seat}`,
                      seat,
                      game.roomCode || state.roomCode
                    );
                    seatMeta = "This chair will be played by a bot.";
                    badge = (
                      <span className="lobby-seat-badge badge-bot">
                        <span className="lobby-bot-icon">
                          <Icon markup={ICON_BOT} />
                        </span>
                        {" "}Bot
                      </span>
                    );
                  } else if (!player.connected) {
                    statusClass = "offline";
                    avatar = buildDiceBearUrl(player.handle || `seat-${seat}`, "identicon");
                    seatLabel = isHostSeat ? "Host Seat" : `Seat ${seat + 1}`;
                    seatMeta = "Connection lost. The seat is being held for reconnection.";
                    badge = <span className="lobby-seat-badge badge-offline">Offline</span>;
                  } else {
                    statusClass = "ready";
                    avatar = buildDiceBearUrl(player.handle || `seat-${seat}`, "identicon");
                    seatLabel = isHostSeat ? "Host Seat" : `Seat ${seat + 1}`;
                    seatMeta = "Claimed and ready for the salon.";
                    badge = isHostSeat ? (
                      <span className="lobby-seat-badge badge-host">
                        <span className="lobby-crown-icon">
                          <Icon markup={ICON_CROWN} />
                        </span>
                        {" "}Host
                      </span>
                    ) : (
                      <span className="lobby-seat-badge badge-ready">Ready</span>
                    );
                  }
                }

                return (
                  <article
                    key={seat}
                    className={`lobby-seat ${statusClass}`}
                    aria-label={statusClass === "open" ? `Open seat ${seat + 1}` : safeName}
                  >
                    <div className="lobby-seat-shell">
                      <div className="lobby-seat-avatar-wrap">
                        <img
                          className={`lobby-seat-avatar${openAvatarClass}`}
                          src={avatar}
                          alt={safeName}
                          onError={(event) => {
                            const fallback = fallbackAvatarAt(seat);
                            if (event.currentTarget.src.endsWith(fallback)) return;
                            event.currentTarget.src = fallback;
                          }}
                        />
                        {isHostSeat && player ? (
                          <span className="lobby-seat-corner-badge" aria-hidden="true">
                            <Icon markup={ICON_CROWN} />
                          </span>
                        ) : null}
                      </div>

                      <div className="lobby-seat-info">
                        <span className="lobby-seat-label">{seatLabel}</span>
                        <div className="lobby-seat-name">
                          {statusClass === "open" ? `Open Seat ${seat + 1}` : safeName}
                        </div>
                        <div className="lobby-seat-meta">{seatMeta}</div>
                      </div>

                      <div className="lobby-seat-footer">
                        {badge}
                        {statusClass === "open" && mySeat === null ? (
                          <button
                            className="lobby-sit-btn"
                            type="button"
                            onClick={() => {
                              ctx.connection.send({ type: "TAKE_SEAT", seat });
                            }}
                          >
                            Sit Here
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="lobby-divider" aria-hidden="true" />

            <div className="lobby-lower">
              <div className="lobby-config-panel">
                <h2 className="lobby-config-title">Match Configuration</h2>
                <div className="lobby-config-grid">
                  <span className="lobby-config-item">
                    <span className="lobby-config-key">Mode</span>
                    <strong>{modeLabel}</strong>
                  </span>
                  <span className="lobby-config-item">
                    <span className="lobby-config-key">Target</span>
                    <strong>{gameTarget} points</strong>
                  </span>
                  <span className="lobby-config-item">
                    <span className="lobby-config-key">Deck</span>
                    <strong>Spanish 40</strong>
                  </span>
                </div>
              </div>

              <div className="lobby-desktop-start">{startArea}</div>
            </div>
          </div>
        </div>

        <div className="lobby-support-grid">
          <article className="lobby-support-card">
            <span className="lobby-support-kicker">Invitation</span>
            <p className="lobby-support-copy">
              Share room code {code} to bring friends straight into this salon.
            </p>
          </article>
          <article className="lobby-support-card">
            <span className="lobby-support-kicker">Seats</span>
            <p className="lobby-support-copy">
              {hasOpenSeats
                ? `${emptyCount} seat${emptyCount !== 1 ? "s remain" : " remains"} open and can be bot-filled when the game starts.`
                : "Every active seat is claimed and ready for the first deal."}
            </p>
          </article>
          <article className="lobby-support-card">
            <span className="lobby-support-kicker">Format</span>
            <p className="lobby-support-copy">
              {modeLabel} to {gameTarget} points with the Spanish 40-card deck.
            </p>
          </article>
        </div>
      </div>

      {isHost || mySeat !== null ? (
        <div className="lobby-start-sticky" id="lobby-start-sticky">
          {startArea}
        </div>
      ) : null}
    </div>
  );
}
