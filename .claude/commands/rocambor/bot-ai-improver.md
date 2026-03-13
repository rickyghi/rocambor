---
name: rocambor:bot-ai-improver
description: Improve bot AI with card counting, smarter bidding, and strategic play
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
---

# Bot AI Improver

You are improving the AI for bot players in a multiplayer Tresillo/Rocambor card game. The current bot plays legal moves with basic heuristics. Your goal is to make it play competitively by adding card counting, improved bidding, and strategic play decisions.

## Step 1: Read Context

Read these files:

1. `CLAUDE.md` — Critical game rules:
   - Spanish deck: 40 cards (ranks 1-7, 10-12; no 8 or 9)
   - Red suits (oros, copas) have **reversed** plain ranking: Ace > 2 > 3 > 4 > 5 > 6 > 7
   - Black suits (espadas, bastos) have standard ranking: 7 > 6 > ... > 2 > Ace
   - Matadors: Espadilla (espadas ace) > Manille (trump rank-2 or 7) > Basto (bastos ace)
   - Null trump: bola/contrabola have `state.trump === null`
   - Trump card points for bidding: Rank 1 = 9, Rank 2 = 8, Rank 3 = 7, etc.
   - Rank-2/3 score high as trump — avoid treating them as weak
2. `server/src/bot.ts` — The full bot implementation (~369 lines). Note:
   - `BotContext` interface (what info the bot receives)
   - `evaluateHand()` — hand strength scoring for bid decisions
   - `chooseBid()` — current bidding logic
   - `chooseTrump()` — trump suit selection
   - `chooseExchange()` — card exchange decisions
   - `choosePlay()` — card play selection
3. `server/src/engine.ts` — `legalPlays()`, `trickWinner()`, `isTrump()`, `isMatador()`, `plainSuitValue()`
4. `server/src/room.ts` — `buildBotContext()`, `doBotAction()`, `playCard()`, trick resolution
5. `shared/types.ts` — Card, Suit, Bid, SeatIndex types

## Step 2: Add Card Counting Infrastructure

### 2a: Extend Room with Trick History

In `room.ts`:
1. Add a `trickHistory: Card[][]` field to the Room class (array of completed tricks)
2. In the trick resolution code (where `trickWinner` is called and tricks are cleared), push the current `table` cards to `trickHistory` before clearing
3. Reset `trickHistory` in `newHand()`

### 2b: Extend BotContext

In `bot.ts`, extend the `BotContext` interface:
```typescript
export interface BotContext {
  // ... existing fields ...
  playedCards: Card[];  // All cards played so far this hand (flattened trickHistory)
}
```

In `room.ts` `buildBotContext()`:
- Populate `playedCards` from `this.trickHistory.flat()` plus current `this.state.table`

### 2c: Card Counting Utility

In `bot.ts`, add a helper:
```typescript
function remainingCards(
  playedCards: Card[],
  myHand: Card[],
  trump: Suit | null
): { bySuit: Map<Suit, Card[]>; trumpsOut: number }
```

This computes:
- Cards still unaccounted for (not in played, not in hand)
- Remaining trump count (for knowing when trumps are exhausted)
- Per-suit counts for void detection

## Step 3: Improve Play Decisions

### 3a: Leading Play (bot leads the trick)

Current: plays weakest card when leading.

Improved logic (in priority order):
1. **Guaranteed winners**: If holding the highest remaining card in a suit, lead it
2. **Trump draw**: If opponents likely hold trumps and bot has trump length advantage, lead trump to strip their trumps
3. **Void creation**: Lead from longest non-trump suit to set up future trumping
4. **Short suit leads**: Lead from shortest suit (excluding singletons of high cards)
5. **Fall back**: weakest non-trump card

### 3b: Following Play (bot is not leading)

Current: plays highest card when trick matters, lowest when it doesn't.

Improved logic:
1. **Partner is winning**: If the current trick winner is your partner (ombre/defender alignment), play your lowest legal card (duck)
2. **Can cheaply win**: If you can win with a mid-range card (not your highest), do so
3. **Must trump**: If void in led suit and have trump, trump with lowest winning trump
4. **Save high cards**: Preserve Kings and matadors for later tricks when possible
5. **Endgame**: When only 1-2 tricks remain and need exactly N more tricks to win/block, play optimally

### 3c: Null Trump Handling

For bola/contrabola contracts (`trump === null`):
- Follow-suit-only logic
- No trumping possible
- Focus entirely on high-card management

## Step 4: Improve Bidding

Current: `evaluateHand()` returns a score, bot bids proportionally.

Improved factors:
1. **Matador count**: Each matador adds significant value (Espadilla ~ +3 pts, Manille ~ +2, Basto ~ +2)
2. **Void suits**: Having 0 cards in a non-trump suit is valuable (can trump from trick 1)
3. **Long trump**: 5+ trumps is very strong, 3 or fewer is risky
4. **Position**: Being first to act is slightly weaker (no information); being last is stronger
5. **Contrabola decision**: Currently 4% random — replace with heuristic:
   - Consider contrabola if hand has only low cards across all suits
   - Must be the last remaining bidder (after all others passed)
   - Weigh void-avoidance (holding cards in all 4 suits makes 0-trick easier)

### Bidding thresholds (refine existing):
- **Entrada**: 12+ points (current may be too aggressive/conservative)
- **Oros**: 16+ points AND best suit is oros
- **Volteo**: 18+ points AND 5+ trumps
- **Solo**: 22+ points AND 6+ trumps AND matador(s)
- **Solo oros**: 24+ points AND 6+ oros-trump AND Espadilla

## Step 5: Improve Exchange

Current: discards weakest off-suit cards.

### As Ombre (declarer):
1. **Create voids**: Discard all cards from one or two off-suits to enable trumping
2. **Keep Kings**: Off-suit Kings can win tricks even without trump
3. **Keep matadors**: Never discard matadors (should already be the case)
4. **Maximize trump length**: After voiding, prioritize keeping trumps

### As Defender:
1. **Keep potential codille protection**: Cards that can block the ombre from winning 5 tricks
2. **Create one void**: Having one void suit lets you trump ombre's strong suit
3. **Keep high off-suit cards**: Kings and Queens can win tricks on their own

## Step 6: Write Tests

Create or extend `server/tests/bot.test.ts`:

### Card Counting Tests
- Bot correctly identifies remaining cards after seeing tricks
- Bot recognizes when a suit is exhausted

### Play Decision Tests
- Bot leads guaranteed winner when available
- Bot ducks when partner is winning the trick
- Bot trumps with lowest winning trump when void

### Bidding Tests
- Bot with 3 matadors + 5 trumps bids solo
- Bot with weak hand passes
- Bot with all-low-card hand considers contrabola appropriately

### Exchange Tests
- Ombre creates voids in exchange
- Defender keeps high cards

## Step 7: Verify

1. `cd server && npx vitest run` — all existing + new tests pass
2. Run a bot simulation (if `simulation.test.ts` exists) — verify bots complete games without errors
3. Check that `buildBotContext()` correctly populates `playedCards`
4. Verify null-trump guard: bot play logic handles `trump === null` in bola/contrabola

## Implementation Notes

- All changes are in `server/src/bot.ts` and `server/src/room.ts` only
- Do not change `engine.ts` — use its existing functions
- Do not change the C2S/S2C protocol
- Keep bot decision-making deterministic where possible (avoid unnecessary `Math.random()`)
- Log significant bot decisions at `console.debug` level for future tuning
- The bot must still respond within the existing timer constraints (no expensive computation)
