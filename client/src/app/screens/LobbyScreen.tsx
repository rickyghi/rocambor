import type { ReactElement } from "react";
import { useEffect } from "react";
import { createTranslator, emptySeatWord, modeLabel, seatWord } from "../../i18n";
import type { AppContext } from "../../router";
import type { SeatIndex } from "../../protocol";
import { showToast } from "../../ui/toast";
import { buildBotAvatarUrl, buildDiceBearUrl, fallbackAvatarAt } from "../../lib/avatars";
import { useClientState, useConnectionSnapshot, useProfile, useSettings } from "../hooks";
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
  const settings = useSettings(ctx.settings);
  const { connected } = useConnectionSnapshot(ctx.connection);
  const game = state.game;
  const pendingRoomCode = state.roomCode;
  const locale = settings.locale;
  const { t } = createTranslator(locale);

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
          showToast(t("lobby.joinedToast", { name: msg.payload.handle }), "info");
        }
      }),
    ];

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [ctx.connection, locale]);

  if (!game) {
    return (
      <div className="screen lobby-screen">
        <button
          className="lobby-float-leave"
          data-action="leave"
          type="button"
          aria-label={t("common.leave")}
          onClick={() => {
            ctx.connection.send({ type: "LEAVE_ROOM" });
            ctx.state.reset();
            ctx.router.navigate("home");
          }}
        >
          <span className="lobby-back-arrow">
            <Icon markup={ICON_ARROW_LEFT} />
          </span>
          <span>{t("common.leave")}</span>
        </button>

        <div className="lobby-body">
          <div className="lobby-title-stack">
            <span className={`lobby-session-pill${connected ? "" : " offline"}`}>
              <span className="lobby-session-dot" aria-hidden="true" />
              {connected ? t("lobby.sessionActive") : t("lobby.reconnecting")}
            </span>
            <h1 className="lobby-room-title">{t("lobby.joiningSalon")}</h1>
            <p className="lobby-room-subtitle">
              {t("lobby.roomPreparing", { code: pendingRoomCode || "..." })}
            </p>
          </div>

          <div className="lobby-panel lobby-panel-loading">
            <div className="lobby-loading-shell" role="status" aria-live="polite">
              <div className="lobby-loading-orb" aria-hidden="true" />
              <div className="lobby-loading-copy">
                <span className="lobby-loading-kicker">{t("lobby.preparing")}</span>
                <strong className="lobby-loading-title">{t("lobby.fetching")}</strong>
                <p className="lobby-loading-text">{t("lobby.waitSnapshot")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const code = state.roomCode || "...";
  const mode = game.mode || "quadrille";
  const modeLabelText = modeLabel(mode, locale, true);
  const mySeat = state.mySeat;
  const hostSeat = game.hostSeat ?? null;
  const isHost = mySeat !== null && (hostSeat === null || hostSeat === mySeat);
  const totalSeats = mode === "tresillo" ? 3 : 4;
  const gameTarget = game.gameTarget || 12;
  const roomName = game.roomName?.trim() || (locale === "es" ? "Salón privado" : "The Salon Lobby");

  let filledSeats = 0;
  for (let i = 0; i < totalSeats; i++) {
    if (game.players[i]) filledSeats++;
  }

  const canStart = isHost && filledSeats >= 1;
  const hasOpenSeats = filledSeats > 0 && filledSeats < totalSeats;
  const emptyCount = totalSeats - filledSeats;

  const startArea = isHost ? (
    <div className="lobby-start-area" id="lobby-start-area">
      <span className="lobby-start-kicker">{t("lobby.hostControls")}</span>
      <span className="lobby-start-hint">
        {hasOpenSeats
          ? t("lobby.startNowBots", { count: emptyCount, seatWord: seatWord(emptyCount, locale) })
          : t("lobby.allActiveSeatsClaimed")}
      </span>
      {hasOpenSeats ? (
        <span className="lobby-bot-hint">
          <Icon markup={ICON_BOT} />{" "}
          {t("lobby.emptySeatsBots", {
            count: emptyCount,
            seatWord: emptySeatWord(emptyCount, locale),
          })}
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
        {t("common.startGame")}
      </button>
      {!canStart ? (
        <span className="lobby-start-hint lobby-waiting-pulse">
          {t("lobby.awaitingPlayers")}
          <span className="lobby-waiting-dots" />
        </span>
      ) : null}
    </div>
  ) : mySeat !== null ? (
    <div className="lobby-start-area">
      <span className="lobby-start-kicker">{t("lobby.matchStatus")}</span>
      <span className="lobby-start-hint lobby-waiting-pulse">
        {t("lobby.waitingForHost")}
        <span className="lobby-waiting-dots" />
      </span>
    </div>
  ) : null;

  return (
    <div className="screen lobby-screen">
      <button
        className="lobby-float-leave"
        data-action="leave"
        type="button"
        aria-label={t("common.leave")}
        onClick={() => {
          ctx.connection.send({ type: "LEAVE_ROOM" });
          ctx.state.reset();
          ctx.router.navigate("home");
        }}
      >
        <span className="lobby-back-arrow">
          <Icon markup={ICON_ARROW_LEFT} />
        </span>
        <span>{t("common.leave")}</span>
      </button>

      <div className="lobby-body">
        <div className="lobby-title-stack">
          <span className={`lobby-session-pill${connected ? "" : " offline"}`}>
            <span className="lobby-session-dot" aria-hidden="true" />
            {connected ? t("lobby.sessionActive") : t("lobby.reconnecting")}
          </span>
          <h1 className="lobby-room-title">{roomName}</h1>
          <p className="lobby-room-subtitle">
            {locale === "es"
              ? `Mesa privada de ${modeLabelText} · sala ${code} · ${filledSeats}/${totalSeats} sentados`
              : `${modeLabelText} private table · room ${code} · ${filledSeats}/${totalSeats} seated`}
          </p>
        </div>

        <div className="lobby-panel">
          <div className="lobby-code-header">
            <div className="lobby-code-block">
              <span className="lobby-code-icon" aria-hidden="true">
                <Icon markup={ICON_USERS} />
              </span>
              <div className="lobby-code-text">
                <span className="lobby-code-label">{t("lobby.privateRoomCode")}</span>
                <span className="lobby-code-value">{code}</span>
              </div>
            </div>
            <div className="lobby-code-row">
              <button
                className="lobby-copy-btn"
                data-action="copy"
                type="button"
                aria-label={t("common.copyCode")}
                onClick={() => {
                  if (!state.roomCode) return;
                  navigator.clipboard.writeText(state.roomCode).then(
                    () => showToast(t("lobby.codeCopied"), "success", 1200),
                    () => showToast(t("lobby.copyFailed"), "error")
                  );
                }}
              >
                <Icon markup={ICON_COPY} />
                <span>{t("common.copyCode")}</span>
              </button>
            </div>
          </div>

          <div className="lobby-panel-body">
            <div className="lobby-meta-row">
              <span className="lobby-player-count">
                <strong>{filledSeats}</strong>/{totalSeats}{" "}
                {locale === "es" ? "sentados" : "seated"}
              </span>
              <span className="lobby-config-dot" aria-hidden="true" />
              <span className="lobby-config-item">
                <span className="lobby-config-key">{t("common.mode")}</span>
                <strong>{modeLabelText}</strong>
              </span>
              <span className="lobby-config-dot" aria-hidden="true" />
              <span className="lobby-config-item">
                <span className="lobby-config-key">{t("common.target")}</span>
                <strong>{gameTarget} pts</strong>
              </span>
            </div>

            <div
              className={`lobby-seats${mode === "tresillo" ? " tresillo" : ""}`}
              role="list"
              aria-label={locale === "es" ? "Asientos de jugadores" : "Player seats"}
            >
              {Array.from({ length: totalSeats }, (_, seatIndex) => {
                const seat = seatIndex as SeatIndex;
                const player = game.players[seat];
                const isMine = mySeat === seat;
                const isHostSeat = hostSeat === seat || (hostSeat === null && isMine);
                const safeName = isMine ? profile.name : player?.handle || t("lobby.seat", { seat: seat + 1 });

                let statusClass = "open";
                let avatar = OPEN_SEAT_AVATAR;
                let openAvatarClass = " open-seat-avatar";
                let badge: ReactElement | null = (
                  <span className="lobby-seat-badge badge-open">{t("common.open")}</span>
                );
                let seatLabel = t("lobby.seat", { seat: seat + 1 });
                let seatMeta = t("lobby.openSeatMeta");

                if (player) {
                  openAvatarClass = "";

                  if (isMine) {
                    statusClass = "you";
                    avatar = profile.avatar;
                    seatLabel = isHostSeat ? t("lobby.hostSeat") : t("lobby.yourSeat");
                    seatMeta = t("lobby.seatedReady");
                    badge = isHostSeat ? (
                      <span className="lobby-seat-badge badge-host">
                        <span className="lobby-crown-icon">
                          <Icon markup={ICON_CROWN} />
                        </span>
                        {" "}
                        {t("common.host")}
                      </span>
                    ) : (
                      <span className="lobby-seat-badge badge-you">{t("common.you")}</span>
                    );
                  } else if (player.isBot) {
                    statusClass = "bot";
                    avatar = buildBotAvatarUrl(
                      player.handle || `bot-${seat}`,
                      seat,
                      game.roomCode || state.roomCode
                    );
                    seatMeta = t("lobby.botSeatMeta");
                    badge = (
                      <span className="lobby-seat-badge badge-bot">
                        <span className="lobby-bot-icon">
                          <Icon markup={ICON_BOT} />
                        </span>
                        {" "}
                        {t("common.bot")}
                      </span>
                    );
                  } else if (!player.connected) {
                    statusClass = "offline";
                    avatar = buildDiceBearUrl(player.handle || `seat-${seat}`, "identicon");
                    seatLabel = isHostSeat ? t("lobby.hostSeat") : t("lobby.seat", { seat: seat + 1 });
                    seatMeta = t("lobby.reconnectSeatMeta");
                    badge = <span className="lobby-seat-badge badge-offline">{t("common.offline")}</span>;
                  } else {
                    statusClass = "ready";
                    avatar = buildDiceBearUrl(player.handle || `seat-${seat}`, "identicon");
                    seatLabel = isHostSeat ? t("lobby.hostSeat") : t("lobby.seat", { seat: seat + 1 });
                    seatMeta = t("lobby.claimedReady");
                    badge = isHostSeat ? (
                      <span className="lobby-seat-badge badge-host">
                        <span className="lobby-crown-icon">
                          <Icon markup={ICON_CROWN} />
                        </span>
                        {" "}
                        {t("common.host")}
                      </span>
                    ) : (
                      <span className="lobby-seat-badge badge-ready">{t("common.ready")}</span>
                    );
                  }
                }

                return (
                  <article
                    key={seat}
                    className={`lobby-seat ${statusClass}`}
                    aria-label={statusClass === "open" ? t("lobby.openSeat", { seat: seat + 1 }) : safeName}
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
                          {statusClass === "open" ? t("lobby.openSeat", { seat: seat + 1 }) : safeName}
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
                            {t("lobby.sitHere")}
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
                <h2 className="lobby-config-title">{t("lobby.matchConfiguration")}</h2>
                <div className="lobby-config-grid">
                  <span className="lobby-config-item">
                    <span className="lobby-config-key">{t("common.mode")}</span>
                    <strong>{modeLabelText}</strong>
                  </span>
                  <span className="lobby-config-item">
                    <span className="lobby-config-key">{t("common.target")}</span>
                    <strong>{locale === "es" ? `${gameTarget} puntos` : `${gameTarget} points`}</strong>
                  </span>
                  <span className="lobby-config-item">
                    <span className="lobby-config-key">{t("common.deck")}</span>
                    <strong>{locale === "es" ? "Española 40" : "Spanish 40"}</strong>
                  </span>
                </div>
              </div>

              <div className="lobby-desktop-start">{startArea}</div>
            </div>
          </div>
        </div>

        <div className="lobby-support-grid">
          <article className="lobby-support-card">
            <span className="lobby-support-kicker">{t("lobby.invitation")}</span>
            <p className="lobby-support-copy">
              {t("lobby.shareCode", { code })}
            </p>
          </article>
          <article className="lobby-support-card">
            <span className="lobby-support-kicker">{t("lobby.seats")}</span>
            <p className="lobby-support-copy">
              {hasOpenSeats
                ? t("lobby.activeSeatsOpen", { count: emptyCount, seatWord: seatWord(emptyCount, locale) })
                : t("lobby.activeSeatsClaimed")}
            </p>
          </article>
          <article className="lobby-support-card">
            <span className="lobby-support-kicker">{t("lobby.format")}</span>
            <p className="lobby-support-copy">
              {t("lobby.withDeck", { mode: modeLabelText, target: gameTarget })}
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
