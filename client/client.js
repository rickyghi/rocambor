let ws;
function getWebSocketUrl() {
  const qs = new URLSearchParams(location.search).get('ws');
  if (qs) return qs; // allow ?ws=wss://xyz.up.railway.app
  const meta = document.querySelector('meta[name="ws-base"]')?.content;
  if (meta) return meta;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'localhost:8080'
    : location.host;
  return `${protocol}//${host}`;
}
function connect(){
  const base = getWebSocketUrl();
  ws = new WebSocket(base);
  const status = document.getElementById('status');
  ws.onopen = () => { status.textContent = 'connected'; sendJoin('quadrille'); };
  ws.onclose = () => { status.textContent = 'disconnected – reconnecting…'; setTimeout(connect, 1500); };
  ws.onerror = () => { status.textContent = 'socket error'; };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'STATE') render(msg.patch, msg.selfHand || []);
    if (msg.type === 'ROOM_CREATED') console.log('room', msg.id);
    if (msg.type === 'EVENT') console.log('event', msg);
    if (msg.type === 'ERROR') console.warn('error', msg);
  };
}
function sendJoin(mode){ ws?.send(JSON.stringify({ type:'JOIN', mode })); }
function sendBid(value){ ws?.send(JSON.stringify({ type:'BID', value })); }
function chooseTrump(suit){ ws?.send(JSON.stringify({ type:'CHOOSE_TRUMP', suit })); }
function play(cardId){ ws?.send(JSON.stringify({ type:'PLAY', cardId })); }

function render(state, hand){
  document.getElementById('phase').textContent = state.phase;
  document.getElementById('turn').textContent = state.turn || '—';
  document.getElementById('trump').textContent = state.trump || '—';
  document.getElementById('scores').textContent = JSON.stringify(state.scores);
  document.getElementById('table').textContent = (state.table||[]).map(c => `${c.s}-${c.r}`).join(', ') || '—';

  const handDiv = document.getElementById('hand');
  handDiv.innerHTML = '';
  (hand || []).forEach(c => {
    const el = document.createElement('button');
    el.className = 'card';
    el.textContent = `${c.s}-${c.r}`;
    el.onclick = () => play(c.id);
    handDiv.appendChild(el);
  });

  if (state.phase === 'trump_choice' && state.turn === 'you'){
    // show quick chooser
    const chooser = document.createElement('div');
    ['oros','copas','espadas','bastos'].forEach(s => {
      const b = document.createElement('button');
      b.textContent = `Trump ${s}`;
      b.onclick = () => chooseTrump(s);
      chooser.appendChild(b);
    });
    handDiv.appendChild(chooser);
  }
}
connect();
