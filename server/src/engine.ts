import { Card, Suit, Rank } from "./types";

export const SUITS: Suit[] = ["oros","copas","espadas","bastos"];
export const RANKS: Rank[] = [1,2,3,4,5,6,7,10,11,12];

export function makeDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ s, r, id: `${s}-${r}-${Math.random().toString(36).slice(2,8)}` });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

export function isBlack(s: Suit){ return s==="espadas" || s==="bastos"; }
export function isManille(tr: Suit, c: Card){ return (isBlack(tr) ? (c.s===tr && c.r===2) : (c.s===tr && c.r===7)); }
export function isMatador(tr: Suit, c: Card){ return (c.s==="espadas" && c.r===1) || isManille(tr,c) || (c.s==="bastos" && c.r===1); }
export function isTrump(tr: Suit|null, c: Card){ return !!tr && (c.s===tr || isMatador(tr,c)); }

export function legalPlays(tr: Suit|null, hand: Card[], led: Card|null): Card[] {
  if (!led) return hand.slice();
  const ledIsTrump = isTrump(tr, led);
  if (ledIsTrump){
    const must = hand.filter(c => isTrump(tr,c));
    return must.length ? must : hand.slice();
  }
  const must = hand.filter(c => c.s===led.s);
  return must.length ? must : hand.slice();
}

export function trickWinner(tr: Suit|null, ledSuit: Suit, cards: Card[]): number {
  function trumpVal(c: Card): number {
    if (!tr) return 0;
    if (c.s==="espadas" && c.r===1) return 100; // spadille
    if (isManille(tr,c)) return 99;
    if (c.s==="bastos" && c.r===1) return 98;   // basto ace
    if (c.s!==tr) return 0;
    const nb = isBlack(tr);
    const map = nb ? ({12:90,11:89,10:88,7:87,6:86,5:85,4:84,3:83} as any)
                   : ({12:90,11:89,10:88,2:87,3:86,4:85,5:84,6:83} as any);
    return map[c.r] || (nb? (c.r===2?2:0) : (c.r===1?97:0));
  }
  function plainVal(s: Suit, r: Rank){
    const nb = isBlack(s);
    const map = nb ? ({12:10,11:9,10:8,7:7,6:6,5:5,4:4,3:3,2:2,1:1} as any)
                   : ({12:10,11:9,10:8,1:7,2:6,3:5,4:4,5:3,6:2,7:1} as any);
    return map[r] || 0;
  }
  let best=-1, idx=0;
  cards.forEach((c,i)=>{ const tv = trumpVal(c); const v = tv>0 ? 1000+tv : (c.s===ledSuit ? 100+plainVal(c.s,c.r) : 0); if (v>best){best=v; idx=i;} });
  return idx;
}

// Exact auction point mapping for bots (your values)
export function trumpCardPoints(card: Card, trump: Suit): number {
  if (card.s === trump){
    if (card.r === 1) return 9;   // primer matador (Ace)
    if (card.r === 2) return 8;   // segundo
    if (card.r === 3) return 7;   // tercero
    if (card.r === 12) return 6;  // king
    if (card.r === 11) return 5;  // caballo (queen slot)
    if (card.r === 10) return 4;  // sota (jack slot)
    if (card.r === 7) return 3;   // tens mapped to 7 in 40-card
    return 2;                     // other trumps
  }
  if (card.r === 12) return 2;    // kings off-suit
  return 0;
}
export function evalTrumpPointsExact(hand: Card[], trump: Suit): number {
  return hand.reduce((s,c)=> s + trumpCardPoints(c, trump), 0);
}
