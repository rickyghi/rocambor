#!/bin/bash
set -e

CARDS_DIR="$(cd "$(dirname "$0")/../public/cards" && pwd)"
SKIN="spanish_deck"
W=96
H=138
COLS=7
OUT_DIR="$CARDS_DIR"

cd "$CARDS_DIR"

# Build ordered file list
FILES=()
for suit in oros copas espadas bastos; do
  for rank in 1 2 3 4 5 6 7 10 11 12; do
    f="$SKIN/${suit}_${rank}.png"
    if [ ! -f "$f" ]; then
      echo "ERROR: missing $f"
      exit 1
    fi
    FILES+=("$f")
  done
done
FILES+=("$SKIN/back.png")

echo "Generating spritesheet from ${#FILES[@]} card images..."
echo "Cell size: ${W}x${H}, Grid: ${COLS} columns"

# Step 1: Create PNG spritesheet with montage (suppress labels)
montage "${FILES[@]}" \
  -geometry "${W}x${H}+0+0" \
  -tile "${COLS}x" \
  -background transparent \
  +set label \
  "$OUT_DIR/rocambor_cards_spritesheet.png" 2>/dev/null || true

echo "PNG spritesheet created: $(identify "$OUT_DIR/rocambor_cards_spritesheet.png" | awk '{print $3}')"

# Step 2: Convert to WebP
cwebp -q 90 -alpha_q 100 "$OUT_DIR/rocambor_cards_spritesheet.png" \
  -o "$OUT_DIR/rocambor_cards_spritesheet.webp" 2>/dev/null \
  || convert "$OUT_DIR/rocambor_cards_spritesheet.png" \
     -quality 90 "$OUT_DIR/rocambor_cards_spritesheet.webp"

echo "WebP spritesheet created"

# Step 3: Generate CSS
CSS="$OUT_DIR/rocambor_cards_spritesheet.css"
cat > "$CSS" << 'HEADER'
/* Auto-generated spritesheet CSS — do not edit manually */
.roc-card {
  display: inline-block;
  width: 96px;
  height: 138px;
  background-image: url('/cards/rocambor_cards_spritesheet.webp');
  background-repeat: no-repeat;
  background-size: 672px 828px;
  image-rendering: auto;
}
HEADER

ROW=0
COL=0
IDX=0
for suit in oros copas espadas bastos; do
  for rank in 1 2 3 4 5 6 7 10 11 12; do
    ROW=$((IDX / COLS))
    COL=$((IDX % COLS))
    X=$((COL * W))
    Y=$((ROW * H))
    echo ".roc-card--${suit}-${rank} { background-position: -${X}px -${Y}px; }" >> "$CSS"
    IDX=$((IDX + 1))
  done
done

# Back card
ROW=$((IDX / COLS))
COL=$((IDX % COLS))
X=$((COL * W))
Y=$((ROW * H))
echo ".roc-card--back { background-position: -${X}px -${Y}px; }" >> "$CSS"

echo "CSS generated with $((IDX + 1)) sprite classes"

# Step 4: Generate JSON metadata
JSON="$OUT_DIR/rocambor_cards_spritesheet.json"
echo '{' > "$JSON"
echo '  "meta": { "image": "rocambor_cards_spritesheet.webp", "size": { "w": 672, "h": 828 }, "format": "webp" },' >> "$JSON"
echo '  "frames": {' >> "$JSON"

IDX=0
TOTAL=${#FILES[@]}
for suit in oros copas espadas bastos; do
  for rank in 1 2 3 4 5 6 7 10 11 12; do
    ROW=$((IDX / COLS))
    COL=$((IDX % COLS))
    X=$((COL * W))
    Y=$((ROW * H))
    COMMA=","
    if [ $IDX -eq $((TOTAL - 1)) ]; then COMMA=""; fi
    echo "    \"${suit}-${rank}\": { \"frame\": { \"x\": $X, \"y\": $Y, \"w\": $W, \"h\": $H } }$COMMA" >> "$JSON"
    IDX=$((IDX + 1))
  done
done

# Back
ROW=$((IDX / COLS))
COL=$((IDX % COLS))
X=$((COL * W))
Y=$((ROW * H))
echo "    \"back\": { \"frame\": { \"x\": $X, \"y\": $Y, \"w\": $W, \"h\": $H } }" >> "$JSON"

echo '  }' >> "$JSON"
echo '}' >> "$JSON"

echo "JSON metadata generated"
echo ""
echo "Output files:"
ls -lh "$OUT_DIR/rocambor_cards_spritesheet."*
