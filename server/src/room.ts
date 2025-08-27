import { WebSocket } from "ws";
import { makeDeck, legalPlays, trickWinner, evalTrumpPointsExact, SUITS } from "./engine";
import { Card, Seat, Suit, SEATS, State, Bid, BID_VAL, Contract } from "./types";

const TURN_MS = 25000;
function rand<T>(a: T[]): T { return a[Math.floor(Math.random()*a.length)]; }

export type Conn = { id: string; ws: WebSocket; seat: Seat|null; handle: string; isBot?: boolean };

export class Room {
  id: string;
  conns: Conn[] = [];
  mode: "tresillo"|"quadrille" = "quadrille";
  state: State;
  hands: Record<Seat, Card[]> = { you:[], left:[], across:[], right:[] };
  original: Record<Seat, Card[]> = { you:[], left:[], across:[], right:[] };
  talon: Card[] = [];
  table: Card[] = [];
  playOrder: Seat[] = [];
  timer: NodeJS.Timeout | null = null;
  restIndex = 0;

  constructor(id: string){
    this.id = id;
    this.state = {
      roomId: id,
      mode: "quadrille",
      phase: "lobby",
      turn: null,
      ombre: null,
      trump: null,
      contract: null,
      resting: null,
      handNo: 1,
      table: [],
      playOrder: [],
      handsCount: { you:0,left:0,across:0,right:0 },
      scores: { you:0,left:0,across:0,right:0 },
      tricks: { you:0,left:0,across:0,right:0 },
      auction: { currentBid:"pass", currentBidder:null, passed:[], order:[] },
      exchange: { current: null, order: [], talonSize: 0, completed: [] },
      gameTarget: 12,
      seq: 0,
      rules: { espadaObligatoria: true, penetroEnabled: true }
    };
  }

  send(conn: Conn, msg: any){ 
    if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
      try {
        conn.ws.send(JSON.stringify(msg));
      } catch (error) {
        console.error(`[room] Failed to send message to ${conn.id}:`, error);
      }
    }
  }

  broadcastState(){ 
    for(const c of this.conns) { 
      const sh = c.seat ? this.hands[c.seat] : undefined; 
      this.send(c, { type:"STATE", patch:this.state, selfHand:sh }); 
    } 
  }

  patch(p: Partial<State>){ 
    Object.assign(this.state, p); 
    this.state.seq++; 
    this.broadcastState(); 
  }

  event(name: string, payload?: any){ 
    this.conns.forEach(c => this.send(c, { type:"EVENT", name, payload })); 
  }

  attach(ws: WebSocket): Conn { 
    const conn: Conn = { 
      id: Math.random().toString(36).slice(2), 
      ws, 
      seat: null, 
      handle: `p${Math.floor(Math.random()*999)}` 
    }; 
    
    this.conns.push(conn); 
    this.send(conn, { 
      type: "WELCOME", 
      clientId: conn.id, 
      roomId: this.id 
    }); 
    this.sync(conn); 
    
    console.log(`[room] Client ${conn.id} attached`);
    return conn; 
  }

  detach(conn: Conn){ 
    if (conn.seat) {
      console.log(`[room] Player ${conn.handle} (${conn.seat}) left the game`);
      this.event("PLAYER_LEFT", { seat: conn.seat, handle: conn.handle });
    }
    
    this.conns = this.conns.filter(c => c !== conn); 
    this.ensureFullSeats(); 
    
    console.log(`[room] Client ${conn.id} detached. Active connections: ${this.conns.length}`);
  }

  sync(conn: Conn){ 
    this.send(conn, { 
      type: "STATE", 
      patch: this.state, 
      selfHand: conn.seat ? this.hands[conn.seat] : undefined 
    }); 
  }

  setMode(m: "tresillo"|"quadrille"){ 
    this.state.mode = m; 
    this.patch({ mode: m, resting: this.restSeat() }); 
  }

  seat(conn: Conn, seat: Seat){ 
    conn.seat = seat; 
    console.log(`[room] ${conn.handle} seated at ${seat}`);
    this.event("SEATED", { seat, id: conn.id, handle: conn.handle, bot: !!conn.isBot }); 
  }

  restSeat(): Seat { 
    return this.state.mode === "quadrille" ? SEATS[this.restIndex % 4] : "across"; 
  }

  seatsActive(): Seat[] { 
    if (this.state.contract === "penetro") return SEATS.slice(); 
    const rest = this.restSeat(); 
    return SEATS.filter(s => s !== rest).slice(0, 3); 
  }

  makeBot(): Conn { 
    const fake = {
      readyState: WebSocket.OPEN,
      send: () => {},
      close: () => {},
      addEventListener: () => {},
      removeEventListener: () => {}
    } as any;
    
    return { 
      id: "bot-" + Math.random().toString(36).slice(2), 
      ws: fake, 
      seat: null, 
      handle: "🤖 Bot", 
      isBot: true 
    };
  }

  ensureFullSeats(){
    const activeSeats = this.seatsActive();
    const assigned = new Set(this.conns.map(c => c.seat).filter(Boolean) as Seat[]);
    
    for (const s of activeSeats) { 
      if (!assigned.has(s)) { 
        const b = this.makeBot(); 
        this.conns.push(b); 
        this.seat(b, s); 
      } 
    }
    
    // Remove bots that are no longer needed
    this.conns = this.conns.filter(c => 
      !c.isBot || activeSeats.includes(c.seat as Seat)
    );
  }

  newHand(){
    if (this.timer) { 
      clearTimeout(this.timer); 
      this.timer = null; 
    }
    
    if (this.state.mode === "quadrille") this.restIndex = (this.restIndex + 1) % 4;
    
    this.ensureFullSeats();
    
    // Reset hand data
    for (const s of SEATS) { 
      this.hands[s] = []; 
      this.original[s] = []; 
    }
    this.talon = []; 
    this.table = []; 
    this.playOrder = [];
    
    // Reset game state
    this.state.ombre = null; 
    this.state.trump = null; 
    this.state.contract = null;
    this.state.tricks = { you:0, left:0, across:0, right:0 };
    this.state.phase = "dealing"; 
    this.state.resting = this.restSeat();
    
    // Deal cards
    const active = this.seatsActive();
    const deck = makeDeck();
    
    for (let r = 0; r < 3; r++) {
      for (const p of active) {
        for (let i = 0; i < 3; i++) {
          this.hands[p].push(deck.pop()!);
        }
      }
    }
    
    for (const s of active) {
      this.original[s] = this.hands[s].slice();
    }
    
    this.talon = deck.splice(0, 40 - active.length * 9);
    this.state.handsCount = { 
      you: this.hands.you.length, 
      left: this.hands.left.length, 
      across: this.hands.across.length, 
      right: this.hands.right.length 
    };

    // Start auction
    const order = [this.leftOf("you"), this.leftOf(this.leftOf("you")), "you"].slice(0, 3) as Seat[];
    this.state.auction = { 
      currentBid: "pass", 
      currentBidder: null, 
      passed: [], 
      order 
    };
    
    this.state.phase = "auction"; 
    this.state.turn = order[0];
    this.patch(this.state); 
    this.armTimer(); 
    this.botMaybeAct();
  }

  leftOf(s: Seat): Seat { 
    const a = this.seatsActive(); 
    const i = a.indexOf(s); 
    return a[(i + 1) % a.length]; 
  }

  armTimer(){ 
    if (this.timer) { 
      clearTimeout(this.timer); 
      this.timer = null; 
    } 
    this.timer = setTimeout(() => { 
      this.timer = null; 
      this.onTimeout(); 
    }, TURN_MS); 
  }

  onTimeout(){ 
    const seat = this.state.turn as Seat; 
    if (!seat) return; 
    console.log(`[room] Turn timeout for ${seat}`);
    this.botAct(seat); 
  }

  botMaybeAct(){ 
    const seat = this.state.turn as Seat; 
    const conn = this.conns.find(c => c.seat === seat); 
    if (conn?.isBot) {
      setTimeout(() => this.botAct(seat), 600 + Math.random() * 600); 
    }
  }

  botAct(seat: Seat){
    const conn = this.conns.find(c => c.seat === seat);
    if (conn && !conn.isBot) {
      console.log(`[room] Forcing action for inactive human player: ${seat}`);
    }

    switch(this.state.phase){
      case "auction": {
        const hand0 = this.original[seat] || this.hands[seat];
        let bestSuit: Suit = "oros", bestPts = -1;
        
        for (const s of SUITS) { 
          const p = evalTrumpPointsExact(hand0, s); 
          if (p > bestPts) { 
            bestPts = p; 
            bestSuit = s; 
          } 
        }
        
        const threshold = (bestSuit === "oros" || bestSuit === "copas") ? 23 : 22;
        let bid: Bid = "pass";
        
        if (bestPts >= threshold + 12) bid = "bola";
        else if (bestPts >= threshold + 6) bid = (bestSuit === "oros" ? "solo_oros" : "solo");
        else if (bestPts >= threshold + 3) bid = (bestSuit === "oros" ? "oros" : "volteo");
        else if (bestPts >= threshold) bid = (bestSuit === "oros" ? "oros" : "entrada");

        const a = this.state.auction; 
        const allPass = (a.currentBid === "pass") && a.passed.length === (a.order.length - 1);
        const isLast = a.order.indexOf(seat) === a.order.length - 1;
        
        if (allPass && isLast && bestPts < threshold && Math.random() < 0.1) {
          bid = "contrabola";
        }

        this.applyBid(seat, bid);
        break;
      }
      
      case "trump_choice": {
        const needOros = this.state.contract === "oros" || this.state.contract === "solo_oros";
        const suit = needOros ? "oros" : rand(SUITS);
        this.chooseTrump(seat, suit); 
        break;
      }
      
      case "exchange": {
        const isOmbre = seat === this.state.ombre; 
        const isOros = this.state.contract === "oros" || this.state.contract === "solo_oros";
        const max = isOmbre ? 
          (this.state.auction.currentBid === "solo" || this.state.contract === "solo_oros" ? 0 : (isOros ? 6 : 8)) : 
          5;
        const n = Math.min(max, this.talon.length, Math.floor(Math.random() * 3));
        const disc = this.hands[seat].slice(0, n).map(c => c.id);
        this.finishExchange(seat, disc); 
        break;
      }
      
      case "play": {
        const led = this.table.length ? this.table[0] : null; 
        const hand = this.hands[seat];
        const legal = legalPlays(this.state.trump, hand, led); 
        const card = legal[0];
        if (card) {
          this.playCard(seat, card.id); 
        }
        break;
      }
    }
  }

  applyBid(seat: Seat, value: Bid){
    if (this.state.phase !== "auction" || this.state.turn !== seat) return;
    
    const a = this.state.auction;

    const isAllPassSoFar = (a.currentBid === "pass") && a.passed.length === (a.order.length - 1);
    const isLastToAct = a.order.indexOf(seat) === a.order.length - 1;
    const isContrabolaAllowed = value === "contrabola" && isAllPassSoFar && isLastToAct;

    if (!isContrabolaAllowed) {
      if (value !== "pass" && BID_VAL[value] <= BID_VAL[a.currentBid]) {
        return this.errorSeat(seat, "BAD_BID", "Must beat previous bid");
      }
    }

    if (value === "pass") { 
      if (!a.passed.includes(seat)) a.passed.push(seat); 
    } else { 
      a.currentBid = value; 
      a.currentBidder = seat; 
    }

    const idx = a.order.indexOf(seat); 
    const next = a.order[(idx + 1) % a.order.length];
    const alive = a.order.filter(s => !a.passed.includes(s));
    
    if (alive.length === 0) return this.onPassOut();

    if (alive.length === 1 && a.currentBidder && alive[0] === a.currentBidder) {
      this.state.ombre = a.currentBidder;
      this.state.contract = this.mapBidToContract(a.currentBid);
      this.event("AUCTION_WIN", { 
        ombre: a.currentBidder, 
        bid: a.currentBid, 
        contract: this.state.contract 
      });

      if (a.currentBid === "volteo") { 
        const top = this.talon[0]; 
        this.state.trump = top.s; 
        this.event("TRUMP_SET", { method: "volteo", suit: this.state.trump }); 
        this.startExchange(); 
      } else if (a.currentBid === "contrabola" || a.currentBid === "bola") { 
        this.state.phase = "play"; 
        this.state.turn = this.leftOf(this.state.ombre as Seat); 
        this.patch(this.state); 
        this.armTimer(); 
        this.botMaybeAct(); 
      } else { 
        this.state.phase = "trump_choice"; 
        this.state.turn = this.state.ombre; 
        this.patch(this.state); 
        this.armTimer(); 
        this.botMaybeAct(); 
      }
      return;
    }

    this.state.turn = next; 
    this.patch(this.state); 
    this.armTimer(); 
    this.botMaybeAct();
  }

  private mapBidToContract(b: Bid): Contract {
    switch(b) {
      case "entrada": return "entrada";
      case "oros": return "oros";
      case "volteo": return "volteo";
      case "solo": return "solo";
      case "solo_oros": return "solo_oros";
      case "bola": return "bola";
      case "contrabola": return "contrabola";
      default: return "entrada";
    }
  }

  private onPassOut(){
    if (this.state.mode === "quadrille" && this.state.rules.penetroEnabled) {
      return this.startPenetro();
    }
    
    if (this.state.rules.espadaObligatoria) {
      const forced = this.findSpadilleHolder();
      if (forced) {
        this.state.ombre = forced; 
        this.state.contract = "entrada"; 
        this.state.phase = "trump_choice"; 
        this.state.turn = forced;
        this.event("ESPADA_OBLIGATORIA", { ombre: forced }); 
        this.patch(this.state); 
        this.armTimer(); 
        this.botMaybeAct(); 
        return;
      }
    }
    
    this.event("AUCTION_PASS_OUT", {}); 
    this.newHand();
  }

  private findSpadilleHolder(): Seat | null { 
    for (const s of this.seatsActive()) { 
      if (this.hands[s].some(c => c.s === "espadas" && c.r === 1)) return s; 
    } 
    return null; 
  }

  chooseTrump(seat: Seat, suit: Suit){
    if (this.state.phase !== "trump_choice") return this.errorSeat(seat, "WRONG_PHASE");
    if (this.state.ombre !== seat) return this.errorSeat(seat, "NOT_OMBRE");
    if (this.state.contract === "contrabola" || this.state.contract === "bola") {
      return this.errorSeat(seat, "NO_TRUMP_FOR_CONTRACT");
    }
    if ((this.state.contract === "oros" || this.state.contract === "solo_oros") && suit !== "oros") {
      return this.errorSeat(seat, "TRUMP_MUST_BE_OROS");
    }
    
    this.state.trump = suit; 
    this.event("TRUMP_SET", { method: "choice", suit }); 
    this.startExchange();
  }

  startExchange(){
    if (this.state.contract === "bola" || this.state.contract === "contrabola") {
      this.state.phase = "play"; 
      this.state.turn = this.leftOf(this.state.ombre as Seat);
      this.patch(this.state); 
      this.armTimer(); 
      this.botMaybeAct(); 
      return;
    }
    
    this.state.phase = "exchange"; 
    const order = this.seatsActive().slice(); 
    let ex: Seat[];
    
    if (this.state.auction.currentBid === "solo" || this.state.contract === "solo_oros") {
      ex = order.filter(s => s !== this.state.ombre);
    } else {
      ex = [this.state.ombre as Seat, ...order.filter(s => s !== this.state.ombre)];
    }

    this.state.exchange = { 
      current: ex[0] || null, 
      order: ex, 
      talonSize: this.talon.length, 
      completed: [] 
    };
    
    this.state.turn = this.state.exchange.current; 
    this.patch(this.state); 
    this.armTimer(); 
    this.botMaybeAct();
  }

  finishExchange(seat: Seat, discardIds: string[]){
    if (this.state.phase !== "exchange" || this.state.turn !== seat) return;
    
    const isOmbre = seat === this.state.ombre; 
    const isOros = this.state.contract === "oros" || this.state.contract === "solo_oros";
    const max = isOmbre ? 
      (this.state.auction.currentBid === "solo" || this.state.contract === "solo_oros" ? 0 : (isOros ? 6 : 8)) : 
      5;
    
    const hand = this.hands[seat]; 
    const ids = new Set(discardIds);
    const toDiscard: Card[] = []; 
    
    for (let i = hand.length - 1; i >= 0; i--) {
      if (ids.has(hand[i].id)) {
        toDiscard.push(hand[i]);
      }
    }
    
    const count = Math.min(toDiscard.length, this.talon.length, max);
    
    for (let i = 0; i < count; i++) {
      const k = hand.findIndex(c => c.id === toDiscard[i].id); 
      if (k >= 0) hand.splice(k, 1);
    }
    
    for (let i = 0; i < count; i++) { 
      if (this.talon.length) hand.push(this.talon.shift()!); 
    }
    
    this.state.handsCount[seat] = hand.length; 
    this.state.exchange.completed.push(seat);

    const ex = this.state.exchange; 
    const curIdx = ex.order.indexOf(seat); 
    let next: Seat | undefined;
    
    for (let k = 1; k < ex.order.length; k++) { 
      const cand = ex.order[(curIdx + k) % ex.order.length]; 
      if (!ex.completed.includes(cand)) { 
        next = cand; 
        break; 
      } 
    }
    
    if (next) { 
      ex.current = next; 
      this.state.turn = next; 
      this.patch(this.state); 
      this.armTimer(); 
      this.botMaybeAct(); 
    } else { 
      this.state.phase = "play"; 
      this.state.turn = this.leftOf(this.state.ombre as Seat); 
      this.patch(this.state); 
      this.armTimer(); 
      this.botMaybeAct(); 
    }
  }

  playCard(seat: Seat, cardId: string){
    if (this.state.phase !== "play" || this.state.turn !== seat) return;
    
    const hand = this.hands[seat]; 
    const idx = hand.findIndex(c => c.id === cardId); 
    if (idx < 0) return; 
    
    const card = hand[idx];
    const led = this.table.length ? this.table[0] : null; 
    const legal = legalPlays(this.state.trump, hand, led); 
    
    if (!legal.find(c => c.id === card.id)) return;
    
    hand.splice(idx, 1); 
    this.table.push(card); 
    this.playOrder.push(seat); 
    this.state.handsCount[seat] = hand.length;

    const needed = this.state.contract === "penetro" ? 4 : 3;
    
    if (this.table.length === needed) {
      const winIdx = trickWinner(this.state.trump, this.table[0].s, this.table); 
      const winner = this.playOrder[winIdx];
      this.state.tricks[winner]++; 
      
      this.event("TRICK_TAKEN", { winner, cards: this.table });
      
      this.table = []; 
      this.playOrder = []; 
      this.state.turn = winner; 
      this.patch(this.state); 
      this.armTimer();
      
      const everyone = (this.state.contract === "penetro" ? SEATS : this.seatsActive());
      const empty = everyone.every(p => this.hands[p].length === 0);
      
      if (empty) {
        this.finishHand();
      } else {
        this.botMaybeAct();
      }
    } else { 
      this.state.turn = this.leftOf(seat); 
      this.patch(this.state); 
      this.armTimer(); 
      this.botMaybeAct(); 
    }
  }

  finishHand(){
    if (this.timer) { 
      clearTimeout(this.timer); 
      this.timer = null; 
    }
    
    const om = this.state.ombre as Seat; 
    const active = this.state.contract === "penetro" ? SEATS : this.seatsActive();
    const t = this.state.tricks; 
    const omTricks = t[om];

    if (this.state.contract === "penetro") {
      const entries = Object.entries(t) as [Seat, number][];
      entries.sort((a, b) => b[1] - a[1]);
      const top = entries[0]; 
      this.state.scores[top[0]] += 2; 
      this.event("PENETRO_RESULT", { winner: top[0], tricks: this.state.tricks }); 
      return this.nextHand();
    }

    let result = "", points = 0, award: Seat[] = [];
    
    switch(this.state.contract) {
      case "bola": {
        const ok = omTricks === 9; 
        result = ok ? "bola_made" : "bola_failed";
        if (ok) { 
          points = 6; 
          this.state.scores[om] += points; 
          award = [om]; 
        } else { 
          for (const d of active.filter(s => s !== om)) {
            this.state.scores[d] += 2; 
          }
          award = active.filter(s => s !== om); 
        }
        break;
      }
      
      case "contrabola": {
        const ok = omTricks === 0; 
        result = ok ? "contrabola_made" : "contrabola_failed";
        if (ok) { 
          points = 4; 
          this.state.scores[om] += points; 
          award = [om]; 
        } else { 
          for (const d of active.filter(s => s !== om)) {
            this.state.scores[d] += 1; 
          }
          award = active.filter(s => s !== om); 
        }
        break;
      }
      
      default: {
        if (omTricks >= 5) {
          result = "sacada"; 
          points = omTricks === 9 ? 4 : (omTricks >= 7 ? 2 : 1);
          if (this.state.contract === "oros") points += 1;
          if (this.state.contract === "solo_oros") points += 1;
          this.state.scores[om] += points; 
          award = [om];
        } else {
          const defenders = active.filter(s => s !== om); 
          const maxDef = Math.max(...defenders.map(s => t[s]));
          if (maxDef >= 5) { 
            result = "codille"; 
            points = 2; 
            const w = defenders.find(s => t[s] === maxDef)!; 
            this.state.scores[w] += points; 
            award = [w]; 
          } else { 
            result = "puesta"; 
            points = 1; 
            for (const d of defenders) {
              this.state.scores[d] += 1; 
            }
            award = defenders; 
          }
        }
      }
    }
    
    this.event("HAND_RESULT", { result, points, award, tricks: this.state.tricks });
    this.nextHand();
  }

  private nextHand() { 
    const target = this.state.gameTarget; 
    const who = SEATS.find(s => this.state.scores[s] >= target);
    
    if (who) { 
      this.state.phase = "scoring"; 
      this.patch(this.state); 
      
      this.event("GAME_END", {
        winner: who,
        finalScores: this.state.scores
      });
      
      setTimeout(() => { 
        this.state.scores = { you: 0, left: 0, across: 0, right: 0 }; 
        this.state.handNo = 1; 
        this.newHand(); 
      }, 3000); 
    } else { 
      this.state.handNo += 1; 
      this.newHand(); 
    } 
  }

  handle(conn: Conn, msg: any){
    try {
      if (msg.type === "JOIN") {
        if (msg.mode) this.setMode(msg.mode);
        
        const seats = this.seatsActive();
        const botAt = this.conns.find(c => c.isBot && seats.includes(c.seat as Seat));
        
        if (botAt) { 
          const s = botAt.seat as Seat; 
          this.conns = this.conns.filter(c => c !== botAt); 
          this.seat(conn, s); 
        } else { 
          const used = new Set(this.conns.map(c => c.seat).filter(Boolean) as Seat[]); 
          const free = seats.find(s => !used.has(s)); 
          if (free) this.seat(conn, free); 
        }
        
        if (this.state.phase === "lobby") {
          this.newHand(); 
        } else {
          this.sync(conn); 
        }
        return;
      }

      if (msg.type === "PING") {
        this.send(conn, { type: "PONG" });
        return;
      }

      if (!conn.seat) {
        return this.send(conn, { type: "ERROR", code: "NO_SEAT" });
      }

      switch(msg.type) {
        case "BID": 
          return this.applyBid(conn.seat, msg.value);
        
        case "CHOOSE_TRUMP": 
          return this.chooseTrump(conn.seat, msg.suit);
        
        case "EXCHANGE": 
          return this.finishExchange(conn.seat, msg.discardIds || []);
        
        case "PLAY": 
          return this.playCard(conn.seat, msg.cardId);
        
        default:
          console.warn(`[room] Unknown message type: ${msg.type}`);
      }
    } catch (error) {
      console.error(`[room] Error handling message from ${conn.id}:`, error);
      this.send(conn, { 
        type: "ERROR", 
        code: "INTERNAL_ERROR", 
        message: "An internal error occurred" 
      });
    }
  }

  errorSeat(seat: Seat, code: string, why?: string) { 
    const c = this.conns.find(x => x.seat === seat); 
    if (c) {
      this.send(c, { type: "ERROR", code, why }); 
    }
  }

  private startPenetro() {
    const rest = this.restSeat();
    const can = Math.min(9, this.talon.length);
    
    for (let i = 0; i < can; i++) {
      this.hands[rest].push(this.talon.shift()!);
    }
    
    this.state.handsCount[rest] = this.hands[rest].length;
    this.state.contract = "penetro";
    this.state.phase = "play";
    this.state.turn = this.leftOf("you");
    
    this.event("PENETRO_START", { restingPlayer: rest });
    this.patch(this.state); 
    this.armTimer(); 
    this.botMaybeAct();
  }

  // Cleanup method for graceful shutdown
  cleanup() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    
    // Notify all clients about room closing
    this.event("ROOM_CLOSING", {});
    
    // Close all connections
    for (const conn of this.conns) {
      if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
        try {
          conn.ws.close(1000, "Room closing");
        } catch (error) {
          console.error(`Failed to close connection ${conn.id}:`, error);
        }
      }
    }
    
    this.conns = [];
    console.log(`[room] Room ${this.id} cleaned up`);
  }
}