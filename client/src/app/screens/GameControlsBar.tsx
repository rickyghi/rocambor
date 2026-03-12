import type { CSSProperties, ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { bidDisplayLabel, createTranslator, suitLabel, type Locale } from "../../i18n";
import type { Bid, Suit } from "../../protocol";
import type { AppContext } from "../../router";
import { useClientState, useSettings } from "../hooks";

const AUCTION_QUOTE = "\u201CFortune favors the bold\u201D";

interface BidChoice {
  value: Bid;
  label: string;
  desc: string;
  icon: ReactElement;
}

function AuctionHeader({
  icon,
  title,
}: {
  icon: ReactElement;
  title: string;
}): ReactElement {
  return (
    <div className="auction-panel-header">
      <span className="auction-header-icon">{icon}</span>
      <span className="auction-header-title">{title}</span>
    </div>
  );
}

function AuctionPanel({
  icon,
  title,
  status,
  kind = "auction",
  compact = false,
  showFooter = true,
  children,
}: {
  icon: ReactElement;
  title: string;
  status?: string;
  kind?: "auction" | "exchange" | "trump" | "penetro";
  compact?: boolean;
  showFooter?: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <div
      className={`auction-panel auction-panel-${kind}${compact ? " exchange-panel-compact" : ""}`}
    >
      <AuctionHeader icon={icon} title={title} />
      {status ? <div className="auction-panel-status">{status}</div> : null}
      {children}
      {showFooter ? (
        <>
          <div className="auction-panel-divider"></div>
          <div className="auction-panel-quote">{AUCTION_QUOTE}</div>
        </>
      ) : null}
    </div>
  );
}

function GavelIcon(): ReactElement {
  return (
    <svg
      className="auction-header-svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.5 2.5L18 6l-9 9-3.5-3.5 9-9z" />
      <path d="M4 20l3.5-3.5" />
      <path d="M2 22l2-2" />
    </svg>
  );
}

function StarIcon(): ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
    </svg>
  );
}

function CoinIcon(): ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function BoltIcon(): ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function SoloIcon(): ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CrossIcon({ size = 14 }: { size?: number }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function DiceIcon(): ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="4" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function SwordIcon({
  size = 18,
  className = "auction-header-svg",
}: {
  size?: number;
  className?: string;
} = {}): ReactElement {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.5 2.5L18 6l-9 9-3.5-3.5 9-9z" />
      <path d="M4 20l3.5-3.5" />
      <path d="M2 22l2-2" />
    </svg>
  );
}

function CardsIcon(): ReactElement {
  return (
    <svg
      className="auction-header-svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="14" height="18" rx="2" />
      <rect x="7" y="1" width="14" height="18" rx="2" />
    </svg>
  );
}

function SwapIcon(): ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function ClockIcon(): ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function useActionLock(seq: number | undefined): [boolean, (value: boolean) => void] {
  const [locked, setLocked] = useState(false);
  const lastSeqRef = useRef(seq ?? -1);
  const unlockTimerRef = useRef<number | null>(null);

  const clearUnlockTimer = (): void => {
    if (unlockTimerRef.current !== null) {
      clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = null;
    }
  };

  const setLock = (value: boolean): void => {
    setLocked(value);
    clearUnlockTimer();
    if (value) {
      unlockTimerRef.current = window.setTimeout(() => {
        setLocked(false);
        unlockTimerRef.current = null;
      }, 1800);
    }
  };

  useEffect(() => {
    const nextSeq = seq ?? -1;
    if (nextSeq === lastSeqRef.current) return;
    lastSeqRef.current = nextSeq;
    clearUnlockTimer();
    setLocked(false);
  }, [seq]);

  useEffect(
    () => () => {
      clearUnlockTimer();
    },
    []
  );

  return [locked, setLock];
}

function renderAuctionControls(
  locale: Locale,
  currentBid: Bid,
  showContrabola: boolean,
  actionLocked: boolean,
  onBid: (bid: Bid) => void
): ReactElement {
  const { t } = createTranslator(locale);
  const bidRank = (bid: Bid): number =>
    ({ entrada: 0, oros: 1, volteo: 2, solo: 3, solo_oros: 4 } as Partial<Record<Bid, number>>)[
      bid
    ] ?? -1;
  const opening = currentBid === "pass";
  const rankedBids: BidChoice[] = [
    { value: "entrada", label: "Entrada", icon: <StarIcon />, desc: t("game.auction.openCall") },
    { value: "oros", label: "Oros", icon: <CoinIcon />, desc: t("game.auction.callOros") },
    { value: "volteo", label: "Volteo", icon: <BoltIcon />, desc: t("game.auction.flipTalon") },
    { value: "solo", label: "Solo", icon: <SoloIcon />, desc: t("game.auction.playAlone") },
    { value: "solo_oros", label: "Solo Oros", icon: <SoloIcon />, desc: t("game.auction.aloneOros") },
  ];
  const legal = opening
    ? rankedBids.filter((bid) => ["entrada", "volteo", "solo"].includes(bid.value))
    : rankedBids.filter((bid) => bidRank(bid.value) > bidRank(currentBid));
  const actionCount = legal.length + (showContrabola ? 1 : 0) + 1;
  const statusText =
    currentBid !== "pass"
      ? t("game.auctionPanelBeatOrPass", { bid: bidDisplayLabel(currentBid, locale) })
      : t("game.auctionPanelChooseOpening");

  return (
    <AuctionPanel
      icon={<GavelIcon />}
      title={t("game.auctionPanelTitle")}
      status={statusText}
      kind="auction"
      showFooter={false}
    >
      <div className="auction-bid-grid auction-bid-grid-auction" data-count={String(actionCount)}>
        {legal.map((bid) => (
          <button
            key={bid.value}
            className="auction-bid bid-btn"
            data-bid={bid.value}
            type="button"
            disabled={actionLocked}
            onClick={() => onBid(bid.value)}
          >
            <span className="auction-bid-icon">{bid.icon}</span>
            <span className="auction-bid-name">{bid.label}</span>
            <span className="auction-bid-desc">{bid.desc}</span>
          </button>
        ))}
        {showContrabola ? (
          <button
            className="auction-bid bid-btn contrabola-btn"
            data-bid="contrabola"
            type="button"
            disabled={actionLocked}
            onClick={() => onBid("contrabola")}
          >
            <span className="auction-bid-icon">
              <DiceIcon />
            </span>
            <span className="auction-bid-name">Contrabola</span>
            <span className="auction-bid-desc">{t("game.auction.allPassSpecial")}</span>
          </button>
        ) : null}
        <button
          className="auction-bid bid-btn pass-btn"
          data-bid="pass"
          type="button"
          disabled={actionLocked}
          onClick={() => onBid("pass")}
          >
            <span className="auction-bid-icon">
              <CrossIcon />
            </span>
            <span className="auction-bid-name">{bidDisplayLabel("pass", locale)}</span>
            <span className="auction-bid-desc">{t("game.auction.yieldCall")}</span>
          </button>
      </div>
    </AuctionPanel>
  );
}

function renderPenetroControls(
  locale: Locale,
  actionLocked: boolean,
  onDecision: (accept: boolean) => void
): ReactElement {
  const { t } = createTranslator(locale);
  return (
    <AuctionPanel
      icon={<GavelIcon />}
      title={t("game.penetro")}
      status={t("game.penetroPrompt")}
      kind="penetro"
      showFooter={false}
    >
      <div className="auction-bid-grid auction-bid-grid-penetro" data-count="2">
        <button
          className="auction-bid bid-btn penetro-btn"
          data-accept="false"
          type="button"
          disabled={actionLocked}
          onClick={() => onDecision(false)}
        >
          <span className="auction-bid-icon">
            <CrossIcon />
          </span>
          <span className="auction-bid-name">{t("game.penetro.decline")}</span>
          <span className="auction-bid-desc">{t("game.penetro.redeal")}</span>
        </button>
        <button
          className="auction-bid bid-btn penetro-btn"
          data-accept="true"
          type="button"
          disabled={actionLocked}
          onClick={() => onDecision(true)}
        >
          <span className="auction-bid-icon">
            <SwordIcon size={16} className="" />
          </span>
          <span className="auction-bid-name">{t("game.penetro.play")}</span>
          <span className="auction-bid-desc">{t("game.penetro.enter")}</span>
        </button>
      </div>
    </AuctionPanel>
  );
}

function renderTrumpControls(
  locale: Locale,
  contract: string | null,
  actionLocked: boolean,
  onChooseTrump: (suit: Suit) => void
): ReactElement {
  const { t } = createTranslator(locale);
  const orosOnly = contract === "oros" || contract === "solo_oros";
  const suits: Array<{ value: Suit; label: string; symbol: string; color: string }> = [
    { value: "oros", label: suitLabel("oros", locale), symbol: "\u2666", color: "#C8A651" },
    { value: "copas", label: suitLabel("copas", locale), symbol: "\u2665", color: "#B02E2E" },
    { value: "espadas", label: suitLabel("espadas", locale), symbol: "\u2660", color: "#0D0D0D" },
    { value: "bastos", label: suitLabel("bastos", locale), symbol: "\u2663", color: "#2A4D41" },
  ];

  return (
    <AuctionPanel
      icon={<SwordIcon />}
      title={t("game.chooseTrump")}
      status={t("game.trumpPrompt")}
      kind="trump"
      showFooter={false}
    >
      <div className="auction-trump-grid">
        {suits.map((suit) => (
          <button
            key={suit.value}
            className="auction-trump-btn trump-btn"
            data-suit={suit.value}
            type="button"
            style={{ "--suit-color": suit.color } as CSSProperties}
            disabled={actionLocked || (orosOnly && suit.value !== "oros")}
            onClick={() => onChooseTrump(suit.value)}
          >
            <span className="trump-suit-symbol" style={{ color: suit.color }}>
              {suit.symbol}
            </span>
            <span className="trump-suit-name">{suit.label}</span>
          </button>
        ))}
      </div>
    </AuctionPanel>
  );
}

function renderExchangeControls({
  locale,
  selected,
  min,
  max,
  canDefer,
  handSize,
  actionLocked,
  onConfirm,
  onSkip,
  onDefer,
}: {
  locale: Locale;
  selected: number;
  min: number;
  max: number;
  canDefer: boolean;
  handSize: number;
  actionLocked: boolean;
  onConfirm: () => void;
  onSkip: () => void;
  onDefer: () => void;
}): ReactElement {
  const { t } = createTranslator(locale);
  const maxExchange = Math.min(max, handSize);
  const requireExactOne = min === 1 && maxExchange === 1;
  const canConfirm = requireExactOne ? selected === 1 : selected > 0 && selected <= maxExchange;
  const actionCount = 1 + (min > 0 ? 0 : 1) + (canDefer ? 1 : 0);
  const hintText = requireExactOne
    ? t("game.exchange.selectedSingle", { selected })
    : selected > 0
      ? t("game.exchange.selectedMany", { selected, max: maxExchange })
      : t("game.exchange.chooseUpTo", { count: maxExchange });
  const confirmLabel =
    selected > 0 ? `${t("game.exchange.trade")} ${selected}` : t("game.exchange.trade");

  return (
    <AuctionPanel
      icon={<CardsIcon />}
      title={t("game.exchange")}
      status={hintText}
      kind="exchange"
      compact
      showFooter={false}
    >
      <div className="auction-bid-grid auction-bid-grid-exchange" data-count={String(actionCount)}>
        <button
          className="auction-bid exchange-btn"
          data-action="confirm"
          type="button"
          disabled={actionLocked || !canConfirm}
          onClick={onConfirm}
        >
          <span className="auction-bid-icon">
            <SwapIcon />
          </span>
          <span className="auction-bid-name">{confirmLabel}</span>
        </button>
        {min > 0 ? null : (
          <button
            className="auction-bid exchange-btn pass-btn"
            data-action="skip"
            type="button"
            disabled={actionLocked}
            onClick={onSkip}
          >
            <span className="auction-bid-icon">
              <CrossIcon />
            </span>
            <span className="auction-bid-name">{t("game.keepAll")}</span>
          </button>
        )}
        {canDefer ? (
          <button
            className="auction-bid exchange-btn"
            data-action="defer"
            type="button"
            disabled={actionLocked}
            onClick={onDefer}
          >
          <span className="auction-bid-icon">
            <ClockIcon />
          </span>
          <span className="auction-bid-name">{t("game.exchange.defer")}</span>
        </button>
        ) : null}
      </div>
    </AuctionPanel>
  );
}

function renderPlayControls(
  locale: Locale,
  actionLocked: boolean,
  onCloseHand: () => void
): ReactElement {
  const { t } = createTranslator(locale);
  return (
    <div className="control-group">
      <span className="control-label">{t("game.closeHandTitle")}</span>
      <span className="controls-hint">{t("game.closeHandHint")}</span>
      <button
        className="exchange-btn secondary"
        data-action="close-hand"
        type="button"
        disabled={actionLocked}
        onClick={onCloseHand}
      >
        {t("common.closeHand")}
      </button>
    </div>
  );
}

function renderMatchEndControls(
  locale: Locale,
  actionLocked: boolean,
  onRematch: () => void
): ReactElement {
  const { t } = createTranslator(locale);
  return (
    <div className="control-group">
      <span className="control-label">{t("game.matchComplete")}!</span>
      <button
        className="rematch-btn primary"
        data-action="rematch"
        type="button"
        disabled={actionLocked}
        onClick={onRematch}
      >
        {t("common.playAgain")}
      </button>
    </div>
  );
}

function renderLobbyControls(
  locale: Locale,
  actionLocked: boolean,
  onStart: () => void
): ReactElement {
  const { t } = createTranslator(locale);
  return (
    <div className="control-group">
      <button
        className="start-btn primary"
        data-action="start"
        type="button"
        disabled={actionLocked}
        onClick={onStart}
      >
        {t("common.startGame")}
      </button>
    </div>
  );
}

export function GameControlsBar({ ctx }: { ctx: AppContext }): ReactElement | null {
  const state = useClientState(ctx.state);
  const settings = useSettings(ctx.settings);
  const game = state.game;
  const [actionLocked, setActionLocked] = useActionLock(game?.seq);

  if (!game) return null;

  const lockAndSend = (message: Parameters<typeof ctx.connection.send>[0]): void => {
    if (actionLocked) return;
    ctx.connection.send(message);
    setActionLocked(true);
  };

  const renderContent = (): ReactElement | null => {
    if (game.phase === "auction" && state.isMyTurn) {
      const mySeatIdx = game.auction.order.indexOf(state.mySeat!);
      const isLast = mySeatIdx === game.auction.order.length - 1;
      const allOthersPassed =
        game.auction.currentBid === "pass" &&
        game.auction.passed.length === game.auction.order.length - 1;
      const showContrabola = isLast && allOthersPassed;

      return renderAuctionControls(settings.locale, game.auction.currentBid, showContrabola, actionLocked, (bid) => {
        lockAndSend({ type: "BID", value: bid });
      });
    }

    if (game.phase === "penetro_choice" && state.isMyTurn) {
      return renderPenetroControls(settings.locale, actionLocked, (accept) => {
        lockAndSend({ type: "PENETRO_DECISION", accept });
      });
    }

    if (game.phase === "trump_choice" && state.isMyTurn) {
      return renderTrumpControls(settings.locale, game.contract, actionLocked, (suit) => {
        lockAndSend({ type: "CHOOSE_TRUMP", suit });
      });
    }

    if (game.phase === "exchange" && state.canExchangeNow) {
      const { min, max } = state.getExchangeLimits();
      return renderExchangeControls({
        locale: settings.locale,
        selected: state.selectedCards.size,
        min,
        max,
        canDefer: state.canDeferExchangeOrder,
        handSize: state.hand.length,
        actionLocked,
        onConfirm: () => {
          if (actionLocked) return;
          let discardIds = Array.from(state.selectedCards);
          if (discardIds.length < min) return;
          if (discardIds.length > max) discardIds = discardIds.slice(0, max);
          ctx.connection.send({ type: "EXCHANGE", discardIds });
          state.clearSelection();
          setActionLocked(true);
        },
        onSkip: () => {
          if (actionLocked || min > 0) return;
          ctx.connection.send({ type: "EXCHANGE", discardIds: [] });
          state.clearSelection();
          setActionLocked(true);
        },
        onDefer: () => {
          lockAndSend({ type: "EXCHANGE_DEFER" });
        },
      });
    }

    if (game.phase === "play" && state.isMyTurn && state.canCloseHandNow) {
      return renderPlayControls(settings.locale, actionLocked, () => {
        lockAndSend({ type: "CLOSE_HAND" });
      });
    }

    if (game.phase === "match_end") {
      return renderMatchEndControls(settings.locale, actionLocked, () => {
        lockAndSend({ type: "REMATCH" });
      });
    }

    if (game.phase === "lobby") {
      return renderLobbyControls(settings.locale, actionLocked, () => {
        lockAndSend({ type: "START_GAME" });
      });
    }

    return null;
  };

  const content = renderContent();
  if (!content) return null;

  return (
    <div className="game-controls-shell" data-actionable="true" data-phase={game.phase}>
      <div
        className="game-controls-bar rc-panel rc-panel-noise"
        aria-hidden="false"
        data-phase={game.phase}
      >
        {content}
      </div>
    </div>
  );
}
