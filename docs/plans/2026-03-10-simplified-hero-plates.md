# Simplified Hero Plates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Strip hero plates to essentials (avatar, name, position, role badge, trick dots) and add YOUR TURN flash on self plate.

**Architecture:** Two distinct plate styles — opponents float on felt (no panel), self plate is a compact glass strip. Diamond dots repurposed from card count to trick count. New CONTRA badge for non-ombre players.

**Tech Stack:** TypeScript (game.ts template), CSS (game.css responsive styles)

---

## Task 1: Rewrite Opponent Plate HTML Template

**Files:**
- Modify: `client/src/screens/game.ts:1288-1384`

**Step 1: Add CONTRA badge logic after the ombreTag (line ~1289-1293)**

Replace the role tag block (lines 1288-1293) with:

```typescript
    // Role tags — show contract type on OMBRE badge, CONTRA for defenders
    const isPlayPhase = game.phase === "play" || game.phase === "exchange" || game.phase === "trump";
    const ombreTag = game.ombre === seat
      ? `<span class="hero-badge-ombre">OMBRE${game.contract ? ` · ${this.contractDisplayLabel(game.contract, game.trump)}` : ""}</span>`
      : "";
    const contraTag = isPlayPhase && game.ombre !== null && game.ombre !== seat && game.resting !== seat
      ? `<span class="hero-badge-contra">CONTRA</span>`
      : "";
    const turnTag = game.turn === seat ? `<span class="hero-badge-turn">TURN</span>` : "";
    const restingTag = game.resting === seat ? `<span class="hero-badge-resting">RESTING</span>` : "";
```

**Step 2: Rewrite the opponent plate template (lines 1350-1383)**

Replace the opponent `return` block with:

```typescript
    // Trick dots (diamond indicators for tricks won)
    const trickDotsHtml = this.renderTrickDots(tricks);

    const ariaText = `${name}, ${positionTag.toLowerCase()}, tricks ${tricks}`;

    return `
      <section class="hero-plate hero-${position} hero-side${active}${resting}${disconnected}" aria-label="${escapeHtml(ariaText)}">
        <div class="hero-header">
          <span class="hero-avatar-wrap">
            <img class="hero-avatar" src="${avatar}" data-fallback="${fallback}" alt="" />
          </span>
          <div class="hero-id">
            <span class="hero-position-tag">${positionTag}</span>
            <span class="hero-name">${escapeHtml(name)}</span>
          </div>
          <div class="hero-role-tags">
            ${ombreTag}
            ${contraTag}
            ${turnTag}
            ${restingTag}
            ${bidStatusHtml}
          </div>
        </div>
        <div class="hero-trick-dots" aria-label="${escapeHtml(`Tricks won: ${tricks}`)}">${trickDotsHtml}</div>
      </section>
    `;
```

**Step 3: Run build to verify**

Run: `cd client && npx tsc --noEmit`
Expected: Clean (will fail on `renderTrickDots` — that's Task 2)

---

## Task 2: Rewrite Self Plate HTML Template

**Files:**
- Modify: `client/src/screens/game.ts:1307-1347`

**Step 1: Rewrite the self plate template (lines 1307-1347)**

Replace from the `cardDotsHtml` line through the self plate return block with:

```typescript
    // Trick dots (diamond indicators for tricks won)
    const trickDotsHtml = this.renderTrickDots(tricks);

    // YOUR TURN flash — only on self plate when it's our turn
    const turnFlashHtml = game.turn === seat
      ? `<span class="hero-turn-flash">YOUR TURN</span>`
      : "";

    const ariaText = `${name}, ${positionTag.toLowerCase()}, tricks ${tricks}`;

    if (isSelf) {
      return `
        <section class="hero-plate hero-self${active}${resting}${disconnected}" aria-label="${escapeHtml(ariaText)}">
          <div class="hero-header">
            <span class="hero-avatar-wrap">
              <img class="hero-avatar" src="${avatar}" data-fallback="${fallback}" alt="" />
            </span>
            <div class="hero-id">
              <span class="hero-position-tag${youClass}">${positionTag}</span>
              <span class="hero-name">${escapeHtml(name)}</span>
            </div>
            <div class="hero-role-tags">
              ${ombreTag}
              ${contraTag}
              ${bidStatusHtml}
            </div>
            ${turnFlashHtml}
          </div>
          <div class="hero-trick-dots" aria-label="${escapeHtml(`Tricks won: ${tricks}`)}">${trickDotsHtml}</div>
        </section>
      `;
    }
```

Note: The self plate does NOT show `turnTag` (the small TURN badge) — replaced by the larger `hero-turn-flash` element. Also does not show `restingTag` (self is never resting in their own view).

---

## Task 3: Rename renderCardDots → renderTrickDots

**Files:**
- Modify: `client/src/screens/game.ts:1386-1394`

**Step 1: Rename method and change semantics**

Replace lines 1386-1394:

```typescript
  private renderTrickDots(tricksWon: number): string {
    const maxDots = 9;
    const filled = Math.max(0, Math.min(maxDots, tricksWon));
    const dots = Array.from({ length: maxDots }, (_, idx) => {
      const active = idx < filled ? " filled" : "";
      return `<span class="hero-trick-dot${active}" aria-hidden="true"></span>`;
    });
    return dots.join("");
  }
```

Changes: method name `renderCardDots` → `renderTrickDots`, param `cardsRemaining` → `tricksWon`, CSS class `hero-card-dot` → `hero-trick-dot`.

**Step 2: Remove dead code — old statsInlineClass variable**

Delete line 1311: `const statsInlineClass = isSelf ? " inline" : "";`

Also remove the now-unused `score` and `cards` variable declarations if they are no longer referenced anywhere in the method. Keep `tricks` — it's now used by `renderTrickDots(tricks)`.

**Step 3: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: PASS (all template references updated)

**Step 4: Commit**

```
git add client/src/screens/game.ts
git commit -m "refactor: simplify hero plates — remove stats, add CONTRA badge, YOUR TURN flash"
```

---

## Task 4: Rewrite Hero Plate CSS — Opponent Plates (Floating)

**Files:**
- Modify: `client/src/screens/game.css:434-731`

**Step 1: Strip panel styling from `.hero-plate` base and `.hero-side`**

Replace lines 434-451:

```css
.hero-plate {
  border-radius: 0;
  border: none;
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: none;
  padding: 0;
  display: grid;
  gap: 6px;
  pointer-events: auto;
}

.hero-side {
  width: auto;
  max-width: 280px;
  padding: 0;
  gap: 6px;
}
```

**Step 2: Self plate gets its OWN panel styling**

After `.hero-side`, add new self-plate rules to replace old `.hero-self-slot .hero-self`:

Replace lines 477-487:

```css
.hero-self-slot {
  display: flex;
  justify-content: center;
  min-height: 0;
}

.hero-self-slot .hero-self {
  position: relative;
  width: min(500px, 90vw);
  min-height: 0;
  border-radius: 14px;
  border: 1px solid var(--panel-dark-border);
  background: var(--panel-dark);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.25);
  padding: 8px 14px;
}
```

**Step 3: Update opponent avatar for felt visibility**

Replace `.hero-avatar-wrap` (lines 511-518):

```css
.hero-avatar-wrap {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid rgba(200, 166, 81, 0.35);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  flex-shrink: 0;
}
```

Self avatar smaller — replace `.hero-self .hero-avatar-wrap` (lines 520-523):

```css
.hero-self .hero-avatar-wrap {
  width: 40px;
  height: 40px;
}
```

**Step 4: Update opponent name for felt visibility**

Replace `.hero-name` (lines 554-564):

```css
.hero-name {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: rgba(248, 246, 240, 0.9);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
  line-height: 1.15;
}
```

Remove `.hero-side .hero-name` override (lines 716-718) — no longer needed, single size.

**Step 5: Update position tag to glass pill**

Replace `.hero-position-tag` (lines 537-548):

```css
.hero-position-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--tag-gold-text);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
```

**Step 6: Delete stat grid CSS entirely**

Delete lines 613-645 (`.hero-stats`, `.hero-stat`, `.hero-stat-label`, `.hero-stat-value`).

Delete lines 669-683 (`.hero-self .hero-header` gap override, `.hero-self .hero-stats.inline`, `.hero-self .hero-stats.inline .hero-stat`).

**Step 7: Rename card dots → trick dots**

Replace `.hero-card-dots` and `.hero-card-dot` (lines 649-667):

```css
/* -- Trick Diamond Dots -- */

.hero-trick-dots {
  display: flex;
  gap: 4px;
  justify-content: center;
}

.hero-trick-dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06);
  transform: rotate(45deg);
}

.hero-trick-dot.filled {
  border-color: rgba(200, 166, 81, 0.6);
  background: rgba(200, 166, 81, 0.4);
}
```

Delete `.hero-side .hero-card-dot` override (lines 728-731) — no longer needed.

---

## Task 5: Add CONTRA Badge + YOUR TURN Flash CSS

**Files:**
- Modify: `client/src/screens/game.css` (after existing badge rules ~line 611)

**Step 1: Add CONTRA badge after `.hero-badge-resting`**

```css
.hero-badge-contra {
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--tag-teal-bg);
  border: 1px solid var(--tag-teal-border);
  color: var(--tag-teal-text);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}
```

**Step 2: Add YOUR TURN flash**

```css
/* -- YOUR TURN Flash (Self Plate) -- */

.hero-turn-flash {
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(200, 166, 81, 0.35);
  border: 1px solid rgba(200, 166, 81, 0.5);
  color: var(--tag-gold-text);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
  flex-shrink: 0;
  animation: turn-flash-pulse 1.5s ease-in-out infinite;
}

@keyframes turn-flash-pulse {
  0%, 100% {
    background: rgba(200, 166, 81, 0.25);
    box-shadow: 0 0 8px rgba(200, 166, 81, 0.1);
  }
  50% {
    background: rgba(200, 166, 81, 0.55);
    box-shadow: 0 0 16px rgba(200, 166, 81, 0.3);
  }
}
```

**Step 3: Update active-turn glow for floating opponent plates**

Replace `.hero-plate.active-turn` (lines 489-493):

```css
.hero-plate.active-turn .hero-avatar-wrap {
  border-color: rgba(200, 166, 81, 0.7);
  box-shadow: 0 0 12px rgba(200, 166, 81, 0.35), 0 2px 8px rgba(0, 0, 0, 0.4);
}

.hero-self.active-turn {
  border-color: rgba(200, 166, 81, 0.5);
  box-shadow: 0 0 0 1px rgba(200, 166, 81, 0.3), 0 0 20px rgba(200, 166, 81, 0.15);
}
```

Remove the old `hero-turn-pulse` keyframe (lines 1157-1165) — replaced by avatar glow for opponents and panel glow + flash pill for self.

**Step 4: Add `.hero-badge-contra` to the side sizing rule**

Find the existing `.hero-side .hero-badge-ombre, ...` rule and add `.hero-badge-contra`:

```css
.hero-side .hero-badge-ombre,
.hero-side .hero-badge-contra,
.hero-side .hero-badge-turn,
.hero-side .hero-badge-resting,
.hero-side .hero-bid-status {
  padding: 2px 6px;
  font-size: 9px;
}
```

**Step 5: Update prefers-reduced-motion**

Replace `hero-plate.active-turn` in prefers-reduced-motion block:

```css
  .hero-turn-flash,
  .hero-self.active-turn {
    animation: none !important;
  }
```

---

## Task 6: Update Responsive Breakpoints

**Files:**
- Modify: `client/src/screens/game.css` (breakpoint sections)

**Step 1: Simplify 1260px breakpoint** (line ~1597-1608)

Replace hero-side rules:

```css
  .hero-side {
    max-width: 240px;
  }

  .hero-left {
    left: 6px;
  }

  .hero-right {
    right: 6px;
  }
```

**Step 2: Simplify 1060px breakpoint** (line ~1635)

Replace hero-side rule:

```css
  .hero-side {
    max-width: 200px;
  }
```

**Step 3: 920px mobile — self plate**

Self plate already adapts since it uses `min(500px, 90vw)`. Update the existing `.hero-self-slot .hero-self` mobile rule (line ~1887):

```css
  .hero-self-slot .hero-self {
    width: 100%;
    max-width: none;
    border-radius: 12px;
  }
```

**Step 4: 360px small phone**

Replace existing hero self overrides (lines ~2257-2267):

```css
  .hero-self-slot .hero-self {
    padding: 6px 10px;
  }

  .hero-self-slot .hero-name {
    font-size: 13px;
  }
```

Remove the `.hero-self-slot .hero-stat-value` rule — stats no longer exist.

**Step 5: Commit**

```
git add client/src/screens/game.css
git commit -m "style: floating opponent plates, compact self strip, YOUR TURN flash animation"
```

---

## Task 7: Build Verify + Visual Check

**Step 1: TypeScript check**

Run: `cd client && npx tsc --noEmit`
Expected: PASS

**Step 2: Vite production build**

Run: `cd client && npx vite build`
Expected: Clean build, CSS ~72-74KB (smaller than 76KB — removed stat rules)

**Step 3: Server tests**

Run: `cd server && npx vitest run`
Expected: 152 tests pass (no server changes)

**Step 4: Commit all**

```
git add -A
git commit -m "feat: simplified hero plates — floating opponents, compact self strip, trick dots, YOUR TURN flash"
```

---

## Summary of Removed Elements

| CSS Class | Purpose | Action |
|-----------|---------|--------|
| `.hero-stats` | 3-column stat grid | DELETE |
| `.hero-stat` | Individual stat box | DELETE |
| `.hero-stat-label` | "SCORE"/"CARDS"/"TRICKS" label | DELETE |
| `.hero-stat-value` | Numeric value display | DELETE |
| `.hero-self .hero-stats.inline` | Self plate inline stats | DELETE |
| `.hero-card-dots` | Card remaining dots container | RENAME → `.hero-trick-dots` |
| `.hero-card-dot` | Individual card dot | RENAME → `.hero-trick-dot` |
| `@keyframes hero-turn-pulse` | Panel pulse animation | REPLACE with avatar glow + flash pill |

## Summary of Added Elements

| CSS Class | Purpose |
|-----------|---------|
| `.hero-badge-contra` | Teal CONTRA pill badge |
| `.hero-turn-flash` | Gold pulsing YOUR TURN indicator |
| `@keyframes turn-flash-pulse` | YOUR TURN pulse animation |
| `.hero-self.active-turn` | Self plate gold border glow |
| `.hero-plate.active-turn .hero-avatar-wrap` | Opponent avatar gold glow |
