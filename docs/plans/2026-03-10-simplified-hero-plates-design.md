# Simplified Hero Plates Design

**Date**: 2026-03-10
**Status**: Approved

## Goal

Strip hero plates down to essential info. Remove redundant SCORE/CARDS/TRICKS stat boxes. Repurpose diamond dots as trick counters. Make plates resize-resilient.

## Opponent Plates (Left / Right / Across) — Approach C: Floating on Felt

No panel background. Elements float individually with glass pill styling.

**Keep:**
- Avatar (44px, gold border, drop shadow)
- Name (ivory, text-shadow)
- Position pill (glass bg `rgba(0,0,0,0.3)` + blur)
- Role badge: `OMBRE · {contract}` (gold) or `CONTRA` (teal) — only when applicable
- Bid status pills (auction phase only): PASSED / active bid / Waiting
- Trick dots: 9 diamonds, filled = trick won (repurposed from card count)
- Active turn: gold glow on avatar ring

**Remove:**
- `.hero-stats` grid (SCORE/CARDS/TRICKS boxes)
- Panel background, border, backdrop-filter on container
- `.hero-card-dots` label/semantics change: cards remaining → tricks won

## Self Plate (YOU) — Approach A: Compact Glass Strip

Keeps dark glass panel but slimmer — one flex row + trick dots.

**Structure:**
- Row 1 (flex): Avatar (40px) → Name → `[YOU]` pill → Role badge → `YOUR TURN` flash
- Row 2: Trick dots centered
- Panel: `var(--panel-dark)`, `blur(16px)`, `border-radius: 14px`, `padding: 8px 14px`
- Width: `min(500px, 90vw)`

**YOUR TURN indicator:**
- Gold pulsing pill, only visible when `game.turn === mySeat`
- Pulse: `rgba(200,166,81,0.3)` ↔ `rgba(200,166,81,0.6)` at 1.5s
- Respects `prefers-reduced-motion`

## Dots Semantics Change

- Current: filled dot = card in hand (tracks `handsCount[seat]`)
- New: filled dot = trick won (tracks `tricks[seat]`)
- Max dots stays 9

## New Badge: CONTRA

- Teal glass pill (`--tag-teal-*` tokens)
- Shown on non-ombre, non-resting players during play phase

## Mobile (≤920px)

- Opponent plates: already hidden (mobile opponents strip) — no change
- Self plate: `width: 100%`, same compact strip structure

## Files to Change

1. `client/src/screens/game.ts` — `renderHeroPlates()`: rewrite HTML templates
2. `client/src/screens/game.css` — hero plate CSS: strip stats, restyle opponents, add YOUR TURN animation
