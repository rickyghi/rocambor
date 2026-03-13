---
name: rocambor:design-system-polisher
description: Audit and polish CSS design tokens, accessibility, and responsive behavior
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Bash
---

# Design System Polisher

You are auditing and polishing the design system for a premium tabletop card game UI. The goal is to ensure consistency between CSS variables and TypeScript tokens, enforce accessibility standards, and tighten responsive behavior — **without changing the visual identity**.

## Step 1: Read Context

Read these files:

1. `CLAUDE.md` — Key design rules:
   - Brand palette: ivory `#F8F6F0`, gold `#C8A651`, black `#0D0D0D`, crimson `#B02E2E`, forest `#2A4D41`
   - Game screen uses **dark panels** (`.panel-felt`), NOT ivory
   - Dark panel vars: `--panel-dark`, `--panel-dark-alt`, `--panel-dark-border`, `--text-on-panel`, `--text-on-panel-muted`
   - Motion tokens: `--dur-micro` (120ms), `--dur-fast` (150ms), `--dur-base` (240ms), `--dur-slow` (400ms)
   - Component classes: `.btn-gold-plaque`, `.btn-ivory-engraved`, `.btn-ghost-felt`, `.panel-parchment`, `.panel-felt`
   - Canvas is 1024×720 fixed, CSS-scaled
   - 44px minimum touch targets, safe-area insets
2. `client/src/styles/theme.css` — CSS custom properties in `:root`
3. `client/src/styles/components.css` — Shared component classes (~804 lines)
4. `client/src/styles/global.css` — Resets, keyframes, responsive helpers
5. `client/src/styles/design-tokens.ts` — TypeScript constants: `COLORS`, `FONT`, `SPACING`, `RADIUS`, `MOTION`, `SURFACES`
6. `client/src/screens/game.ts` — Check game screen HTML template for dark theme compliance
7. Any `client/src/screens/*.css` files (especially `game.css` if it exists)

## Step 2: Token Sync Audit

Compare CSS variables in `theme.css` `:root` against TypeScript constants in `design-tokens.ts`:

### Check for:
- [ ] Every color in `COLORS` has a corresponding `--color-*` CSS variable (and vice versa)
- [ ] Every spacing value in `SPACING` matches a `--space-*` CSS variable
- [ ] Every radius value in `RADIUS` matches a `--radius-*` CSS variable
- [ ] Every motion duration in `MOTION` matches a `--dur-*` CSS variable
- [ ] Surface definitions in `SURFACES` match CSS panel/background vars

### Output a sync table:
```
| Token (TS)          | CSS Variable       | Match? |
|---------------------|--------------------|--------|
| COLORS.ivory        | --color-ivory      | YES/NO |
| ...                 | ...                | ...    |
```

Fix any mismatches by updating the TS constants to match CSS (CSS is source of truth for the browser; TS is source of truth for canvas).

## Step 3: Brand Palette Compliance

Search for hardcoded color values that should be using design tokens:

```bash
# Find hardcoded hex colors in CSS
grep -rn '#[0-9a-fA-F]\{3,8\}' client/src/styles/ --include='*.css'

# Find hardcoded hex colors in TypeScript
grep -rn '#[0-9a-fA-F]\{3,8\}' client/src/ --include='*.ts' | grep -v design-tokens | grep -v node_modules
```

Replace hardcoded values with CSS variables or TS token references where possible.

## Step 4: Game Screen Dark Theme Audit

Verify the game screen follows dark panel rules:

- [ ] All panels inside `.game-screen` use `.panel-felt` (not `.panel-parchment`)
- [ ] Text on game panels uses `var(--text-on-panel)` (ivory), not dark ink
- [ ] Panels use `backdrop-filter: blur(16px)` for glass effect
- [ ] No ivory/white backgrounds leak into game screen context
- [ ] Trick dots use CSS diamonds (not text bullet characters)

## Step 5: Motion Token Audit

Search for hardcoded animation durations:

```bash
grep -rn 'transition.*[0-9]\+ms\|transition.*[0-9]\+s\|animation.*[0-9]\+ms\|animation.*[0-9]\+s' client/src/ --include='*.css'
```

Replace hardcoded durations with `var(--dur-*)` tokens. Map common durations:
- ~100-130ms → `var(--dur-micro)`
- ~150ms → `var(--dur-fast)`
- ~200-300ms → `var(--dur-base)`
- ~400ms+ → `var(--dur-slow)`

## Step 6: Accessibility Audit

### Focus Styles
- [ ] All buttons and interactive elements have `:focus-visible` outlines
- [ ] Focus ring uses a visible color (gold or white, not transparent)
- [ ] Tab order follows logical reading order

### Color Contrast (WCAG AA — 4.5:1 for text, 3:1 for large text)
Check these critical pairs:
- [ ] Gold text `#C8A651` on ivory `#F8F6F0` background (lobby/home)
- [ ] Ivory text on dark panels (game screen)
- [ ] Muted text on dark panels
- [ ] Button text on button backgrounds (all three button styles)

### ARIA
- [ ] Auction bid buttons have `aria-label` or descriptive text
- [ ] Hand cards have `role="button"` and `aria-label` with card name
- [ ] Phase banner changes announced via `aria-live="polite"`
- [ ] Turn indicator announced via `aria-live="assertive"`

### Keyboard Navigation
- [ ] Hand cards are keyboard-navigable (arrow keys or tab)
- [ ] Auction buttons reachable via tab
- [ ] Exchange confirm/cancel reachable via tab
- [ ] Modal dialogs trap focus

## Step 7: Responsive Audit

### Touch Targets
- [ ] All buttons are at least 44×44px on mobile
- [ ] Card tap targets are large enough (no tiny overlapping cards on small screens)
- [ ] Spacing between interactive elements prevents mis-taps

### Canvas Scaling
- [ ] Canvas CSS scaling maintains aspect ratio
- [ ] No overflow or cropping on narrow viewports
- [ ] `clamp()` used for responsive font sizes where appropriate

### Safe Areas
- [ ] `safe-area-inset-*` applied to bottom controls on mobile
- [ ] No content hidden behind notch/camera cutout

## Step 8: Reduced Motion

Add or verify `prefers-reduced-motion` media query:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Also check:
- [ ] Canvas animations respect a motion preference (via JS `matchMedia`)
- [ ] Shimmer effects on buttons are disabled when reduced motion is preferred

## Step 9: Verify

1. `cd client && npx tsc --noEmit` — must compile with zero errors
2. Visual inspection: no layout shifts, no color changes, no broken animations
3. Keyboard test: tab through all interactive elements on each screen
4. Check reduced motion: toggle preference and verify animations stop

## What NOT to Do

- Do not change the brand palette colors themselves
- Do not redesign any screens or layouts
- Do not modify game logic or server protocol
- Do not add CSS frameworks (Tailwind, Bootstrap, etc.)
- Do not rename existing CSS classes that are referenced in TypeScript
- Do not modify `renderer.ts` or canvas drawing code (that's for `canvas-renderer-optimizer`)
