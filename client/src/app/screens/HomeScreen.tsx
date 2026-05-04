import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import {
  contractDisplayLabel,
  createTranslator,
  modeLabel,
  type Locale,
} from "../../i18n";
import type { AppContext } from "../../router";
import type {
  MatchActivityEntry,
  Mode,
  StakeMode,
  WalletResponse,
} from "../../protocol";
import {
  claimCurrentWalletRescue,
  fetchRecentMatchActivity,
  fetchCurrentWallet,
} from "../../lib/account-api";
import {
  loadAccountWallet,
  saveAccountWallet,
  subscribeAccountWallet,
} from "../../lib/account-wallet-cache";
import { showModal } from "../../ui/modal";
import { showToast } from "../../ui/toast";
import { openSettingsModal } from "../../ui/settings-modal";
import { openProfileModal } from "../../components/profile/ProfileModal";
import { useAuthSnapshot, useConnectionSnapshot, useProfile, useSettings } from "../hooks";
import "../../screens/home.css";

function IconSettings(): ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconPlus(): ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconPlay(): ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

function IconKey(): ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function formatActivityTime(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function openCreateRoomModal(
  ctx: AppContext,
  selectedMode: Mode,
  stakeMode: StakeMode
): void {
  const locale = ctx.settings.get("locale");
  const { t } = createTranslator(locale);
  const content = document.createElement("div");

  const nameGroup = document.createElement("div");
  nameGroup.className = "modal-form-group";
  const nameLabel = document.createElement("label");
  nameLabel.className = "room-name-label";
  nameLabel.setAttribute("for", "create-room-name");
  nameLabel.style.cssText = "font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(248,246,240,0.6);margin-bottom:4px;display:block;";
  nameLabel.textContent = t("home.roomNameOptional");
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "room-name-input";
  nameInput.id = "create-room-name";
  nameInput.placeholder = t("home.roomNamePlaceholder");
  nameInput.maxLength = 30;
  nameGroup.appendChild(nameLabel);
  nameGroup.appendChild(nameInput);

  const modeGroup = document.createElement("div");
  modeGroup.className = "modal-form-group";
  const modeLabel_ = document.createElement("label");
  modeLabel_.setAttribute("for", "create-mode");
  modeLabel_.textContent = t("common.mode");
  const modeSelect = document.createElement("select");
  modeSelect.id = "create-mode";
  const optTresillo = document.createElement("option");
  optTresillo.value = "tresillo";
  optTresillo.textContent = modeLabel("tresillo", locale, true);
  optTresillo.selected = selectedMode === "tresillo";
  const optQuadrille = document.createElement("option");
  optQuadrille.value = "quadrille";
  optQuadrille.textContent = modeLabel("quadrille", locale, true);
  optQuadrille.selected = selectedMode === "quadrille";
  modeSelect.appendChild(optTresillo);
  modeSelect.appendChild(optQuadrille);
  modeGroup.appendChild(modeLabel_);
  modeGroup.appendChild(modeSelect);

  const targetGroup = document.createElement("div");
  targetGroup.className = "modal-form-group";
  const targetLabel = document.createElement("label");
  targetLabel.setAttribute("for", "create-target");
  targetLabel.textContent = t("home.pointsToWin");
  const targetInput = document.createElement("input");
  targetInput.id = "create-target";
  targetInput.type = "number";
  targetInput.value = "12";
  targetInput.min = "6";
  targetInput.max = "30";
  targetGroup.appendChild(targetLabel);
  targetGroup.appendChild(targetInput);

  content.appendChild(nameGroup);
  content.appendChild(modeGroup);
  content.appendChild(targetGroup);

  showModal({
    title: t("home.createRoomTitle"),
    size: "sm",
    modalClassName: "modal-dark",
    closeAriaLabel: t("common.closeModal"),
    content,
    actions: [
      { label: t("common.cancel"), className: "btn-secondary", onClick: () => {} },
      {
        label: t("common.create"),
        className: "btn-primary",
        onClick: () => {
          const mode = (content.querySelector("#create-mode") as HTMLSelectElement).value as Mode;
          const target = parseInt(
            (content.querySelector("#create-target") as HTMLInputElement).value,
            10
          );
          const roomName =
            (content.querySelector("#create-room-name") as HTMLInputElement)?.value?.trim() || "";
          ctx.connection.send({
            type: "CREATE_ROOM",
            mode,
            stakeMode,
            target: Number.isNaN(target) ? undefined : target,
            rules: {
              espadaObligatoria: ctx.settings.get("espadaObligatoria"),
            },
            roomName,
          });
        },
      },
    ],
  });
}

function openJoinRoomModal(ctx: AppContext): void {
  const { t } = createTranslator(ctx.settings.get("locale"));
  const content = document.createElement("div");

  const codeGroup = document.createElement("div");
  codeGroup.className = "modal-form-group";
  const codeLabel = document.createElement("label");
  codeLabel.setAttribute("for", "join-code");
  codeLabel.textContent = t("home.roomCode");
  const codeInput = document.createElement("input");
  codeInput.id = "join-code";
  codeInput.type = "text";
  codeInput.maxLength = 6;
  codeInput.placeholder = "ABC123";
  codeInput.style.cssText = "text-transform:uppercase;letter-spacing:4px;text-align:center;";
  codeGroup.appendChild(codeLabel);
  codeGroup.appendChild(codeInput);
  content.appendChild(codeGroup);

  showModal({
    title: t("home.joinByCodeTitle"),
    size: "sm",
    modalClassName: "modal-dark",
    closeAriaLabel: t("common.closeModal"),
    content,
    actions: [
      { label: t("common.cancel"), className: "btn-secondary", onClick: () => {} },
      {
        label: t("common.join"),
        className: "btn-primary",
        onClick: () => {
          const code = (content.querySelector("#join-code") as HTMLInputElement).value
            .trim()
            .toUpperCase();
          if (code.length < 4) {
            showToast(t("home.validRoomCode"), "error");
            return false;
          }
          ctx.connection.send({ type: "JOIN_ROOM", code });
        },
      },
    ],
  });

  requestAnimationFrame(() => {
    (content.querySelector("#join-code") as HTMLInputElement)?.focus();
  });
}

export function HomeScreen({ ctx }: { ctx: AppContext }): ReactElement {
  const profile = useProfile(ctx.profile);
  const auth = useAuthSnapshot(ctx.auth);
  const settings = useSettings(ctx.settings);
  const { connected } = useConnectionSnapshot(ctx.connection);
  const [selectedMode, setSelectedMode] = useState<Mode>("tresillo");
  const [stakeMode, setStakeMode] = useState<StakeMode>("free");
  const [inQueue, setInQueue] = useState(false);
  const [queuePosition, setQueuePosition] = useState(0);
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [activity, setActivity] = useState<MatchActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const quickGamePendingRef = useRef(false);
  const walletLastFetchedAt = useRef<number>(0);
  const { t } = createTranslator(settings.locale);

  useEffect(() => {
    if (!ctx.connection.connected) {
      ctx.connection.connect();
    }
  }, [ctx.connection]);

  useEffect(() => {
    const unsubscribes = [
      ctx.connection.on("ROOM_JOINED", (msg: any) => {
        setInQueue(false);
        const directToGame = Boolean(msg?.directToGame || quickGamePendingRef.current);
        quickGamePendingRef.current = false;
        ctx.router.navigate(directToGame ? "game" : "lobby");
      }),
      ctx.connection.on("QUEUE_UPDATE", (msg: any) => {
        setQueuePosition(msg.position || 0);
      }),
      ctx.connection.on("ERROR", (msg: any) => {
        setInQueue(false);
        quickGamePendingRef.current = false;
        showToast(msg.message || msg.code, "error");
      }),
      ctx.connection.on("_disconnected", () => {
        setInQueue(false);
        quickGamePendingRef.current = false;
      }),
    ];

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [ctx]);

  const firstName = profile.name.split(" ")[0] || t("player.unknown");
  const fallbackAvatar = ctx.profile.getFallbackAvatar();
  const setLocale = (locale: Locale): void => {
    ctx.settings.set("locale", locale);
  };

  const signInWithProvider = async (provider: "google"): Promise<void> => {
    try {
      await ctx.auth.signInWithProvider(provider);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("home.authUnavailable");
      showToast(message, "error");
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      await ctx.auth.signOut();
      showToast(t("home.signedOut"), "success", 1200);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("home.authUnavailable");
      showToast(message, "error");
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadWallet = async (): Promise<void> => {
      if (!auth.user) {
        setWallet(null);
        setWalletLoading(false);
        return;
      }

      const cachedWallet = loadAccountWallet(auth.user.id);
      const isStale = Date.now() - walletLastFetchedAt.current > 60_000;
      setWallet(cachedWallet);
      setWalletLoading(!cachedWallet);

      if (cachedWallet && !isStale) {
        return;
      }

      try {
        const nextWallet = await fetchCurrentWallet(ctx.auth);
        if (!cancelled) {
          walletLastFetchedAt.current = Date.now();
          saveAccountWallet(auth.user.id, nextWallet);
        }
      } catch {
        if (!cancelled) {
          setWallet(null);
          setWalletLoading(false);
          showToast(t("home.walletRefreshFailed"), "error");
        }
      }
    };

    const unsubscribe = auth.user
      ? subscribeAccountWallet(auth.user.id, (nextWallet) => {
          if (cancelled) return;
          setWallet(nextWallet);
          setWalletLoading(false);
        })
      : () => {};

    void loadWallet();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [auth.user?.id, ctx.auth, settings.locale]);

  useEffect(() => {
    let cancelled = false;
    setActivityLoading(true);

    void fetchRecentMatchActivity(4)
      .then((payload) => {
        if (cancelled) return;
        setActivity(payload.activity);
        setActivityLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[home] Failed to load recent activity:", error);
        setActivity([]);
        setActivityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const claimRescue = async (): Promise<void> => {
    try {
      const nextWallet = await claimCurrentWalletRescue(ctx.auth);
      if (auth.user) {
        saveAccountWallet(auth.user.id, nextWallet);
      } else {
        setWallet(nextWallet);
      }
      showToast(t("home.walletRescueSuccess"), "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : t("home.walletRefreshFailed");
      showToast(message, "error");
    }
  };

  const stakedActionsDisabled = stakeMode === "tokens" && !auth.user;
  const activityEntries = activity.slice(0, 4);

  return (
    <div className="screen home-screen">
      <div className="home-body">
        <div className="home-hero-mobile">
          <div className="home-hero-tag">{t("home.heroTag")}</div>
          <h1 className="home-hero-title">{t("home.welcome", { name: firstName })}</h1>
          <p className="home-hero-subtitle">{t("home.heroSubtitle")}</p>
        </div>

        <div className="home-panel">
          <div className="home-panel-logo">
            <img
              src="/assets/rocambor/logo-light.png"
              alt="Rocambor"
              className="home-panel-logo-img"
              onError={(event) => {
                event.currentTarget.style.display = "none";
                const fallback = event.currentTarget.nextElementSibling as HTMLElement | null;
                if (fallback) fallback.style.display = "block";
              }}
            />
            <h1 className="home-panel-logo-fallback">ROCAMBOR</h1>
          </div>

          <div className="home-mode-section">
            <span className="home-mode-label">{t("home.selectVariation")}</span>
            <div className="home-modes" role="group" aria-label={t("common.mode")}>
              <button
                className={`home-mode-btn ${selectedMode === "tresillo" ? "active" : ""}`}
                type="button"
                onClick={() => setSelectedMode("tresillo")}
              >
                {modeLabel("tresillo", settings.locale, true)}
              </button>
              <button
                className={`home-mode-btn ${selectedMode === "quadrille" ? "active" : ""}`}
                type="button"
                onClick={() => setSelectedMode("quadrille")}
              >
                {modeLabel("quadrille", settings.locale, true)}
              </button>
            </div>
          </div>

          <div className="home-mode-section">
            <span className="home-mode-label">{t("home.playStyle")}</span>
            <div className="home-modes home-modes--stakes" role="group" aria-label={t("home.playStyle")}>
              <button
                className={`home-mode-btn ${stakeMode === "free" ? "active" : ""}`}
                type="button"
                onClick={() => setStakeMode("free")}
              >
                {t("home.playStyleFree")}
              </button>
              <button
                className={`home-mode-btn ${stakeMode === "tokens" ? "active" : ""}`}
                type="button"
                disabled={!auth.user}
                onClick={() => setStakeMode("tokens")}
              >
                {t("home.playStyleStakes")}
              </button>
            </div>
            {stakeMode === "tokens" || (auth.configured && !auth.user) ? (
              <p className="home-stakes-hint">{t("home.stakesHint")}</p>
            ) : null}
          </div>

          <div className="home-actions" id="home-actions">
            {inQueue ? (
              <div className="home-queue-block">
                <div className="home-queue-spinner" aria-hidden="true" />
                <div className="home-queue-label">
                  {queuePosition
                    ? t("home.queueSearchingPosition", { position: queuePosition })
                    : t("home.queueSearching")}
                </div>
                <button
                  className="home-queue-cancel"
                  type="button"
                  onClick={() => {
                    ctx.connection.send({ type: "LEAVE_QUEUE" });
                    setInQueue(false);
                  }}
                >
                  {t("common.cancel")}
                </button>
              </div>
            ) : (
              <>
                <button
                  className="home-action-row home-action-row--create home-create-btn"
                  type="button"
                  disabled={!connected || stakedActionsDisabled}
                  onClick={() => openCreateRoomModal(ctx, selectedMode, stakeMode)}
                >
                  <span className="home-action-icon">
                    <IconPlus />
                  </span>
                  <div className="home-action-text">
                    <span className="home-action-title">{t("home.createRoom")}</span>
                    <span className="home-action-subtitle">{t("home.createRoomSubtitle")}</span>
                  </div>
                </button>
                <button
                  className="home-action-row home-action-row--quick home-quick-btn"
                  type="button"
                  disabled={!connected || stakedActionsDisabled}
                  onClick={() => {
                    if (stakeMode === "tokens") {
                      quickGamePendingRef.current = false;
                      setInQueue(true);
                      ctx.connection.send({
                        type: "QUICK_PLAY",
                        mode: selectedMode,
                        stakeMode,
                      });
                    } else {
                      quickGamePendingRef.current = true;
                      ctx.connection.send({
                        type: "CREATE_ROOM",
                        mode: selectedMode,
                        stakeMode: "free",
                        quickStart: true,
                        rules: {
                          espadaObligatoria: ctx.settings.get("espadaObligatoria"),
                        },
                      });
                    }
                  }}
                >
                  <span className="home-action-icon">
                    <IconPlay />
                  </span>
                  <div className="home-action-text">
                    <span className="home-action-title">{t("home.quickPlay")}</span>
                    <span className="home-action-subtitle">{t("home.quickPlaySubtitle")}</span>
                  </div>
                </button>
                <button
                  className="home-action-row home-action-row--join home-join-btn"
                  type="button"
                  disabled={!connected}
                  onClick={() => openJoinRoomModal(ctx)}
                >
                  <span className="home-action-icon">
                    <IconKey />
                  </span>
                  <div className="home-action-text">
                    <span className="home-action-title">{t("home.joinByCode")}</span>
                    <span className="home-action-subtitle">{t("home.joinByCodeSubtitle")}</span>
                  </div>
                </button>
                {!connected ? (
                  <p className="home-connection-hint">{t("home.connectHint")}</p>
                ) : null}
              </>
            )}
          </div>

          <div className="home-divider" aria-hidden="true" />

          <div className="home-utility-stack">
            <div className="home-bottom-bar">
              <button
                className="home-bottom-btn home-bottom-btn--settings home-settings-btn"
                type="button"
                aria-label={t("common.settings")}
                onClick={() => openSettingsModal(ctx.settings)}
              >
                <IconSettings />
                <span className="home-bottom-btn-label">{t("common.settings")}</span>
              </button>
              <button
                className="home-bottom-btn home-bottom-btn--profile home-profile-btn"
                type="button"
                aria-label={t("common.profile")}
                onClick={() =>
                  openProfileModal(ctx.profile, {
                    locale: settings.locale,
                    auth: ctx.auth,
                  })
                }
              >
                <img
                  className="home-bottom-avatar"
                  src={profile.avatar}
                  alt={profile.name}
                  onError={(event) => {
                    if (event.currentTarget.src.endsWith(fallbackAvatar)) return;
                    event.currentTarget.src = fallbackAvatar;
                  }}
                />
                <span className="home-bottom-btn-copy">
                  <span className="home-bottom-btn-label">{t("common.profile")}</span>
                  <span className="home-bottom-btn-value">{profile.name}</span>
                </span>
              </button>
            </div>

            {auth.configured ? (
              <div className="home-auth-card">
                <div className="home-auth-copy">
                  <span className="home-auth-label">{t("home.accountTitle")}</span>
                  <span className="home-auth-value">
                    {auth.user?.email || t("home.accountGuest")}
                  </span>
                </div>
                {auth.user ? (
                  <div className="home-wallet-row">
                    <div className="home-wallet-copy">
                      <span className="home-auth-label">{t("home.walletBalance")}</span>
                      <span className="home-wallet-value">
                        {walletLoading
                          ? t("home.walletLoading")
                          : wallet
                            ? `${wallet.balance.toLocaleString()} ${settings.locale === "es" ? "fichas" : "tokens"}`
                            : "—"}
                      </span>
                    </div>
                    {wallet?.canClaimRescue ? (
                      <button
                        className="home-auth-btn home-auth-btn--rescue"
                        type="button"
                        onClick={() => {
                          void claimRescue();
                        }}
                      >
                        {t("home.walletRescue")}
                      </button>
                    ) : wallet ? (
                      <span className="home-wallet-status">
                        {t("home.walletRescueCooldown")}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <div className="home-auth-actions">
                  {auth.user ? (
                    <button
                      className="home-auth-btn home-auth-btn--signout"
                      type="button"
                      onClick={() => {
                        void signOut();
                      }}
                    >
                      {t("home.signOut")}
                    </button>
                  ) : (
                    <button
                      className="home-auth-btn home-auth-btn--google"
                      type="button"
                      disabled={auth.loading}
                      onClick={() => {
                        void signInWithProvider("google");
                      }}
                    >
                      {t("home.signInGoogle")}
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            <div className="home-activity-card" aria-live="polite">
              <div className="home-activity-header">
                <span className="home-auth-label">{t("home.activityTitle")}</span>
                {activityLoading ? (
                  <span className="home-activity-status">{t("home.activityLoading")}</span>
                ) : null}
              </div>
              {activityEntries.length > 0 ? (
                <div className="home-activity-list">
                  {activityEntries.map((entry) => {
                    const contract = contractDisplayLabel(
                      entry.contract,
                      entry.trump,
                      settings.locale
                    );
                    return (
                      <article className="home-activity-item" key={entry.id}>
                        <div className="home-activity-top">
                          <span className="home-activity-winner">{entry.winnerName}</span>
                          <span className="home-activity-time">
                            {formatActivityTime(entry.endedAt, settings.locale)}
                          </span>
                        </div>
                        <div className="home-activity-meta">
                          {contract ? <span>{contract}</span> : null}
                          {entry.ombreName ? <span>{entry.ombreName}</span> : null}
                        </div>
                        <div className="home-activity-foot">
                          <span>{modeLabel(entry.mode, settings.locale)}</span>
                          <span>
                            {entry.stakeMode === "tokens"
                              ? t("home.activityPot", {
                                  amount: entry.pot.toLocaleString(),
                                })
                              : t("home.playStyleFree")}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="home-activity-empty">
                  {t("home.activityEmpty")}
                </p>
              )}
            </div>

            <div className="home-locale-row">
              <span className="home-locale-label">{t("common.language")}</span>
              <div className="home-locale-group" role="group" aria-label={t("common.language")}>
                <button
                  className={`home-locale-btn${settings.locale === "en" ? " active" : ""}`}
                  type="button"
                  aria-pressed={settings.locale === "en"}
                  onClick={() => setLocale("en")}
                >
                  {t("common.english")}
                </button>
                <button
                  className={`home-locale-btn${settings.locale === "es" ? " active" : ""}`}
                  type="button"
                  aria-pressed={settings.locale === "es"}
                  onClick={() => setLocale("es")}
                >
                  {t("common.spanish")}
                </button>
              </div>
            </div>
          </div>

          <p className="home-quote">{t("home.quote")}</p>

          <div className="home-panel-status" aria-live="polite">
            <span
              className={`home-status-dot${connected ? "" : " offline"}`}
              aria-hidden="true"
            />
            <span className="home-panel-status-text">
              {connected ? t("home.connected") : t("home.disconnected")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
