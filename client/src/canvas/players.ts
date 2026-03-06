import type { ClientState } from "../state";
import type { Layout } from "./layout";
import type { SeatIndex, PlayerInfo } from "../protocol";
import { drawCard, type CardSkin } from "./cards";
import type { PlayerProfile } from "../lib/profile";
import { buildBotAvatarUrl, buildDiceBearUrl, fallbackAvatarAt } from "../lib/avatars";
import { getAvatarImage } from "./avatar-cache";

type Position = "self" | "left" | "across" | "right";

const FONT_SANS = '"Inter", system-ui, sans-serif';

export function drawPlayers(
  ctx: CanvasRenderingContext2D,
  state: ClientState,
  layout: Layout,
  colorblind: boolean,
  cardSkin: CardSkin,
  profile: PlayerProfile,
  compactMode = false
): void {
  if (!state.game) return;

  const positions: Position[] = ["self", "left", "across", "right"];

  for (const pos of positions) {
    const seat = state.seatAtPosition(pos);
    if (seat === null) continue;

    const player = state.game.players[seat];
    if (!player && pos !== "self") continue;

    const coords = layout.positions[pos];
    const isResting = state.game.resting === seat;
    const isMyTurn = state.game.turn === seat;
    const isSelf = pos === "self";

    const displayName = isSelf
      ? profile.name
      : player?.handle || `Seat ${seat}`;
    const avatarUrl = isSelf
      ? profile.avatar
      : player
        ? player.isBot
          ? buildBotAvatarUrl(player.handle || `bot-${seat}`, seat, state.game?.roomCode)
          : buildDiceBearUrl(player.handle || `Seat-${seat}`, "identicon")
        : fallbackAvatarAt(seat);
    const avatarFallback = fallbackAvatarAt(seat);

    if (!compactMode) {
      // Draw name badge
      drawNameBadge(
        ctx,
        pos,
        coords.x,
        coords.y,
        player,
        seat,
        isMyTurn,
        isResting,
        isSelf,
        player ? player.connected : true,
        displayName,
        avatarUrl,
        avatarFallback
      );

      // Draw score
      const score = state.game.scores[seat] || 0;
      drawScore(ctx, coords.x, coords.y + (pos === "self" ? -20 : 20), score);
    }

    // Draw opponent card backs
    if (pos !== "self" && !isResting) {
      const opCoords = layout.opponentCards[pos as "left" | "across" | "right"];
      if (opCoords) {
        drawOpponentCards(
          ctx,
          opCoords.x,
          opCoords.y,
          state.game.handsCount[seat] || 0,
          opCoords.vertical,
          layout,
          cardSkin
        );
      }
    }

    // Draw trick count
    const tricks = state.game.tricks[seat] || 0;
    if (!compactMode && (state.game.phase === "play" || state.game.phase === "post_hand")) {
      drawTricks(ctx, coords.x, coords.y + (pos === "self" ? -40 : 40), tricks);
    }

    // Disconnected indicator
    if (!compactMode && player && !player.connected) {
      ctx.save();
      ctx.fillStyle = "rgba(176,46,46,0.85)";
      ctx.font = `bold 11px ${FONT_SANS}`;
      ctx.textAlign = "center";
      ctx.fillText("OFFLINE", coords.x, coords.y + (pos === "across" ? 58 : -8));
      ctx.restore();
    }
  }
}

function drawNameBadge(
  ctx: CanvasRenderingContext2D,
  pos: Position,
  x: number,
  y: number,
  player: PlayerInfo | undefined,
  seat: SeatIndex,
  isMyTurn: boolean,
  isResting: boolean,
  isSelf: boolean,
  isConnected: boolean,
  displayName: string,
  avatarUrl: string,
  avatarFallback: string
): void {
  const name = displayName || player?.handle || (isSelf ? "You" : `Seat ${seat}`);
  const label = isResting ? `${name} (resting)` : name;

  ctx.save();

  // Background pill
  ctx.font = `${isMyTurn ? "700 " : "600 "}15px ${FONT_SANS}`;
  const textW = ctx.measureText(label).width || 60;
  const avatarSize = 24;
  const indicatorSize = 8;
  const pillW = Math.max(textW + 56 + avatarSize + indicatorSize, 156);
  const pillH = 34;

  ctx.fillStyle = isMyTurn
    ? "rgba(248,246,240,0.96)"
    : "rgba(248,246,240,0.9)";
  roundRect(ctx, x - pillW / 2, y - pillH / 2, pillW, pillH, 12);
  ctx.fill();

  ctx.strokeStyle = isMyTurn ? "#C8A651" : "rgba(13,13,13,0.12)";
  ctx.lineWidth = isMyTurn ? 2 : 1;
  if (isMyTurn) {
    ctx.shadowColor = "rgba(200,166,81,0.35)";
    ctx.shadowBlur = 16;
  }
  roundRect(ctx, x - pillW / 2, y - pillH / 2, pillW, pillH, 12);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Name text
  ctx.fillStyle = isMyTurn ? "#8a6a24" : isResting ? "#666" : "#0D0D0D";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  const avatarX = x - pillW / 2 + 10;
  const avatarY = y;
  const img = getAvatarImage(avatarUrl, avatarFallback);
  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(
      img,
      avatarX,
      avatarY - avatarSize / 2,
      avatarSize,
      avatarSize
    );
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle = "rgba(13,13,13,0.08)";
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.fillText(label, avatarX + avatarSize + 10, y);

  const dotX = x + pillW / 2 - 12;
  ctx.fillStyle = isConnected ? "#2f9e44" : "#B02E2E";
  ctx.beginPath();
  ctx.arc(dotX, y, indicatorSize / 2, 0, Math.PI * 2);
  ctx.fill();

  if (!isSelf) {
    const direction = pos === "left" ? "LEFT" : pos === "across" ? "ACROSS" : "RIGHT";
    ctx.fillStyle = "rgba(248,246,240,0.95)";
    roundRect(ctx, x - 36, y - 30, 72, 14, 7);
    ctx.fill();
    ctx.strokeStyle = "rgba(13,13,13,0.12)";
    ctx.lineWidth = 1;
    roundRect(ctx, x - 36, y - 30, 72, 14, 7);
    ctx.stroke();

    ctx.fillStyle = "#6d5a2f";
    ctx.font = `700 9px ${FONT_SANS}`;
    ctx.textAlign = "center";
    ctx.fillText(direction, x, y - 23);
  }

  ctx.restore();
}

function drawScore(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  score: number
): void {
  ctx.save();
  ctx.fillStyle = "rgba(248,246,240,0.92)";
  roundRect(ctx, x - 24, y - 12, 48, 24, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(13,13,13,0.12)";
  ctx.lineWidth = 1;
  roundRect(ctx, x - 24, y - 12, 48, 24, 12);
  ctx.stroke();

  ctx.fillStyle = "#0D0D0D";
  ctx.font = `700 15px ${FONT_SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(score), x, y);
  ctx.restore();
}

function drawTricks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tricks: number
): void {
  if (tricks === 0) return;
  ctx.save();
  ctx.fillStyle = "rgba(248,246,240,0.95)";
  roundRect(ctx, x - 24, y - 10, 48, 20, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(13,13,13,0.12)";
  ctx.lineWidth = 1;
  roundRect(ctx, x - 24, y - 10, 48, 20, 10);
  ctx.stroke();
  ctx.fillStyle = "#8a6a24";
  ctx.font = `700 12px ${FONT_SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`T${tricks}`, x, y);
  ctx.restore();
}

function drawOpponentCards(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  count: number,
  vertical: boolean,
  layout: Layout,
  cardSkin: CardSkin
): void {
  const cw = layout.cardW * 0.7;
  const ch = layout.cardH * 0.7;

  for (let i = 0; i < count; i++) {
    const offset = vertical ? i * 6 : i * 14;
    const cx = vertical ? x : x - ((count - 1) * 14) / 2 + offset;
    const cy = vertical ? y + offset : y;

    drawCard(ctx, cx, cy, cw, ch, null, false, {
      faceDown: true,
      skin: cardSkin,
    });
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
