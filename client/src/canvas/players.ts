import type { ClientState } from "../state";
import type { Layout } from "./layout";
import type { SeatIndex, PlayerInfo } from "../protocol";
import { drawCard, type CardSkin } from "./cards";

type Position = "self" | "left" | "across" | "right";

const FONT_SANS = '"Inter", system-ui, sans-serif';

export function drawPlayers(
  ctx: CanvasRenderingContext2D,
  state: ClientState,
  layout: Layout,
  colorblind: boolean,
  cardSkin: CardSkin
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

    // Draw name badge
    drawNameBadge(ctx, coords.x, coords.y, player, seat, isMyTurn, isResting, pos === "self");

    // Draw score
    const score = state.game.scores[seat] || 0;
    drawScore(ctx, coords.x, coords.y + (pos === "self" ? -20 : 20), score);

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
    if (state.game.phase === "play" || state.game.phase === "post_hand") {
      drawTricks(ctx, coords.x, coords.y + (pos === "self" ? -40 : 40), tricks);
    }

    // Disconnected indicator
    if (player && !player.connected) {
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
  x: number,
  y: number,
  player: PlayerInfo | undefined,
  seat: SeatIndex,
  isMyTurn: boolean,
  isResting: boolean,
  isSelf: boolean
): void {
  const name = player?.handle || (isSelf ? "You" : `Seat ${seat}`);
  const label = isResting ? `${name} (resting)` : name;

  ctx.save();

  // Background pill
  ctx.font = `${isMyTurn ? "bold " : ""}13px ${FONT_SANS}`;
  const textW = ctx.measureText(label).width || 60;
  const pillW = Math.max(textW + 20, 80);
  const pillH = 24;

  ctx.fillStyle = isMyTurn
    ? "rgba(200,166,81,0.2)"
    : "rgba(0,0,0,0.6)";
  roundRect(ctx, x - pillW / 2, y - pillH / 2, pillW, pillH, 12);
  ctx.fill();

  if (isMyTurn) {
    ctx.strokeStyle = "#C8A651";
    ctx.lineWidth = 2;
    // Gold glow
    ctx.shadowColor = "#C8A651";
    ctx.shadowBlur = 6;
    roundRect(ctx, x - pillW / 2, y - pillH / 2, pillW, pillH, 12);
    ctx.stroke();
    ctx.shadowColor = "transparent";
  }

  // Name text
  ctx.fillStyle = isMyTurn ? "#C8A651" : isResting ? "#666" : "#F8F6F0";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y);

  ctx.restore();
}

function drawScore(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  score: number
): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  roundRect(ctx, x - 20, y - 10, 40, 20, 10);
  ctx.fill();

  ctx.fillStyle = "#F8F6F0";
  ctx.font = `bold 13px ${FONT_SANS}`;
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
  ctx.fillStyle = "rgba(200,166,81,0.15)";
  roundRect(ctx, x - 16, y - 8, 32, 16, 8);
  ctx.fill();
  ctx.fillStyle = "#C8A651";
  ctx.font = `bold 11px ${FONT_SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${tricks}T`, x, y);
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
