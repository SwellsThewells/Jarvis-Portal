/* ================================================================
   MULTIPLAYER UI — lobby browser and the live match view

   The match view keeps the real game visible: your board is the big
   one, opponents get live miniatures of the same board updating as
   they act. No "Player 1 won" text screens.
   ================================================================ */
(function(){
'use strict';

const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let browseSub = null, browseRooms = [];

/* ---------------- entry point ---------------- */
window.renderVersus = function(content){
  MP2.init();
  content.innerHTML = '<div id="mp-root"></div>';
  renderMP();
};

window.renderMP = function(){
  const root = document.getElementById('mp-root');
  if (!root) return;

  if (typeof Cloud === 'undefined' || !Cloud.on()){
    root.innerHTML =
      '<div class="row-head"><h2>Versus</h2><span>Real-time PvP</span></div>' +
      '<div class="masthead"><div><h1 style="font-size:22px">Sign in to play</h1>' +
      '<p>Rooms are tied to your Jarvis Portal account. ' +
      '<a href="index.html" style="color:var(--accent)">Open the portal</a>.</p></div></div>';
    return;
  }

  if (MP2.room) renderRoom(root);
  else renderBrowser(root);
};

/* ================================================================
   LOBBY BROWSER
   ================================================================ */
function renderBrowser(root){
  const games = Object.keys(MPGAMES);

  root.innerHTML =
    '<div class="row-head"><h2>Versus</h2><span>Winner takes the pot</span></div>' +

    '<div class="mp-create">' +
      '<div class="field"><label>Game</label><div class="inp-row"><select id="mp-game">' +
        games.map(k => '<option value="'+k+'">'+esc(MPGAMES[k].name)+'</option>').join('') +
      '</select></div></div>' +
      '<div class="field"><label>Wager each</label><div class="inp-row">' +
        '<span class="unit pre">$</span><input type="number" id="mp-wager" min="1" step="1" value="25">' +
      '</div></div>' +
      '<div class="field"><label>Visibility</label><div class="inp-row"><select id="mp-priv">' +
        '<option value="0">Public — anyone can join</option>' +
        '<option value="1">Private — invite code only</option>' +
      '</select></div></div>' +
      '<div id="mp-optbox"></div>' +
      '<button class="act" id="mp-host">Create room</button>' +
    '</div>' +

    '<div class="mp-join">' +
      '<div class="field"><label>Have a code?</label><div class="inp-row">' +
        '<input type="text" id="mp-code" maxlength="5" placeholder="ABCDE" ' +
        'style="text-transform:uppercase;letter-spacing:4px;font-family:\'JetBrains Mono\',monospace">' +
        '<button class="mini" id="mp-codego">Join</button>' +
      '</div></div>' +
    '</div>' +

    '<div class="row-head" style="margin-top:18px"><h2>Open rooms</h2>' +
      '<span id="mp-count">searching…</span></div>' +
    '<div class="mp-rooms" id="mp-rooms"><div class="empty">Looking for rooms…</div></div>' +

    '<div class="note" style="margin-top:14px">' +
      'The round seed is fixed by every player committing a hashed secret before anyone reveals, ' +
      'so no one can steer the outcome. Balances still live in each browser, so play with people you trust.' +
    '</div>';

  /* the option list is per game, so it redraws when the game changes */
  const drawOpts = () => {
    const g = MPGAMES[document.getElementById('mp-game').value] || {};
    const box = document.getElementById('mp-optbox');
    const opts = g.settings || [];
    box.innerHTML = !opts.length ? '' :
      '<div class="mp-opts">' + opts.map(o =>
        '<div class="field"><label>' + esc(o.label) + '</label><div class="inp-row">' +
        '<select data-opt="' + o.key + '">' +
          o.options.map(x => '<option value="'+x.v+'"'+(x.v===o.def?' selected':'')+'>'+esc(x.t)+'</option>').join('') +
        '</select></div></div>').join('') +
      '<div class="field"><label>Player limit</label><div class="inp-row">' +
        '<select data-opt="maxPlayers">' +
        [2,3,4,5,6,8].filter(v => v <= (g.maxPlayers||6) && v >= (g.minPlayers||2))
          .map(v => '<option value="'+v+'"'+(v===(g.maxPlayers||6)?' selected':'')+'>'+v+' players</option>').join('') +
        '</select></div></div>' +
      '<div class="field"><label>Spectators</label><div class="inp-row">' +
        '<select data-opt="spectators"><option value="1">Allowed</option><option value="0">Blocked</option></select>' +
      '</div></div>' +
      '<div class="field"><label>On a finished round</label><div class="inp-row">' +
        '<select data-opt="autoRematch"><option value="1">Rematch automatically</option>' +
        '<option value="0">Back to the lobby</option></select>' +
      '</div></div>' +
      '</div>';
  };
  document.getElementById('mp-game').onchange = drawOpts;
  drawOpts();

  document.getElementById('mp-host').onclick = () => {
    const g = document.getElementById('mp-game').value;
    const w = round2(parseFloat(document.getElementById('mp-wager').value) || 0);
    if (w <= 0) return toast('Set a wager first.','lose');
    const settings = {};
    document.querySelectorAll('[data-opt]').forEach(sel => {
      const v = sel.value;
      settings[sel.dataset.opt] = isNaN(Number(v)) ? v : Number(v);
    });
    MP2.create(g, w, document.getElementById('mp-priv').value === '1', settings);
  };
  document.getElementById('mp-codego').onclick = () =>
    MP2.joinByCode(document.getElementById('mp-code').value);

  watchRooms();
}

function watchRooms(){
  MP2.init();
  if (!MP2.db) return;
  if (browseSub) MP2.db.ref('/mp/rooms').off('value', browseSub);

  browseSub = MP2.db.ref('/mp/rooms').limitToLast(40).on('value', s => {
    const val = s.val() || {};
    browseRooms = Object.keys(val).map(id => Object.assign({ id }, val[id]))
      .filter(r => !r.priv && r.status === 'open')
      .filter(r => Date.now() - (r.createdAt || 0) < 3600000)
      .sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
    paintRooms();
  }, () => {
    const box = document.getElementById('mp-rooms');
    if (box) box.innerHTML = '<div class="empty">Could not read rooms — the database rules may need publishing.</div>';
  });
}

function paintRooms(){
  const box = document.getElementById('mp-rooms');
  const count = document.getElementById('mp-count');
  if (!box) return;

  if (!browseRooms.length){
    box.innerHTML = '<div class="empty">No open rooms. Create one and send the code to a friend.</div>';
    if (count) count.textContent = 'none open';
    return;
  }
  if (count) count.textContent = browseRooms.length + ' open';

  box.innerHTML = browseRooms.map(r => {
    const seats = Object.values(r.players || {}).filter(p => !p.spectator).length;
    const max = r.maxPlayers || 6;
    const g = MPGAMES[r.game] || { name:r.game };
    return '<div class="mp-room" data-room="' + r.id + '">' +
      '<div class="mp-room-main">' +
        '<b>' + esc(g.name) + '</b>' +
        '<small>' + esc(g.blurb || '') + '</small>' +
      '</div>' +
      '<div class="mp-room-side">' +
        '<span class="mp-wager">' + fmt(r.wager) + '</span>' +
        '<span class="mp-seats">' + seats + '/' + max + '</span>' +
      '</div>' +
      '<button class="mini" data-join="' + r.id + '">' + (seats >= max ? 'Watch' : 'Join') + '</button>' +
    '</div>';
  }).join('');

  box.querySelectorAll('[data-join]').forEach(b => {
    b.onclick = () => MP2.joinById(b.dataset.join);
  });
}

/* ================================================================
   THE ROOM
   ================================================================ */
let mountedFor = null;

function renderRoom(root){
  const r = MP2.room;
  const g = MPGAMES[r.game] || {};
  const me = MP2.mySeat();
  const seats = MP2.players();
  const specs = MP2.seats().filter(p => p.spectator);
  const others = seats.filter(p => p.uid !== MP2.me());

  const phase =
      r.status === 'open'      ? (seats.length < (g.minPlayers||2) ? 'Waiting for players' : 'Ready up to start')
    : r.status === 'countdown' ? 'Starting'
    : r.status === 'commit' || r.status === 'reveal' ? 'Shuffling'
    : r.status === 'live'      ? 'Round live'
    : 'Results';

  /* the shell is only rebuilt when the round or room changes, so a
     live board is never wiped out by a routine state update */
  const key = r.status + ':' + r.round + ':' + r.game;
  if (mountedFor !== key){
    mountedFor = key;
    root.innerHTML =
      '<div class="mp-bar">' +
        '<div><b>' + esc(g.name || r.game) + '</b>' +
          '<small>' + esc(phase) + ' · pot ' + fmt(r.wager * Math.max(1,seats.length)) + '</small></div>' +
        '<span class="mp-code">' + esc(r.code) + '</span>' +
        (MP2.isHost() ? '<span class="mp-host-tag">host</span>' : '') +
        '<div class="mp-bar-acts">' +
          '<button class="mini" id="mp-copy">Copy invite</button>' +
          '<button class="mini" id="mp-leave">Leave</button>' +
        '</div>' +
      '</div>' +

      '<div class="mp-stage">' +
        '<div class="mp-main"><div id="mp-board"></div>' +
          '<div class="mp-controls">' +
            '<button class="act" id="mp-action" disabled>—</button>' +
            '<button class="act act-2" id="mp-ready"></button>' +
          '</div>' +
        '</div>' +
        '<div class="mp-side" id="mp-side"></div>' +
      '</div>' +

      '<div id="mp-hostbox"></div>' +
      '<div class="mp-count" id="mp-countdown"></div>' +
      (specs.length ? '<div class="note">' + specs.length + ' watching</div>' : '');

    document.getElementById('mp-leave').onclick = () => MP2.leave();
    document.getElementById('mp-copy').onclick = () => {
      const txt = 'Join my JarvisBet room — code ' + r.code;
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(
        () => toast('Invite copied.','win'), () => prompt('Copy this:', txt));
      else prompt('Copy this:', txt);
    };

    /* draw the big board for this game */
    const board = document.getElementById('mp-board');
    if (g.main) g.main(board, MP2.api());

    /* host-only settings, editable while the room is still open */
    const hb = document.getElementById('mp-hostbox');
    if (hb && MP2.isHost() && r.status === 'open'){
      const opts = g.settings || [];
      hb.innerHTML = '<div class="mp-hostpanel"><h4>Room settings</h4><div class="mp-opts">' +
        '<div class="field"><label>Wager each</label><div class="inp-row">' +
        '<span class="unit pre">$</span><input type="number" id="mp-w2" min="1" step="1" value="' + r.wager + '"></div></div>' +
        opts.map(o => '<div class="field"><label>' + esc(o.label) + '</label><div class="inp-row">' +
          '<select data-set="' + o.key + '">' + o.options.map(x =>
            '<option value="'+x.v+'"'+(String(x.v)===String((r.settings||{})[o.key] != null ? r.settings[o.key] : o.def)?' selected':'')+'>'+
            esc(x.t)+'</option>').join('') + '</select></div></div>').join('') +
        '</div><small>Changing anything un-readies the table.</small></div>';

      hb.querySelectorAll('[data-set]').forEach(sel => {
        sel.onchange = () => {
          const v = isNaN(Number(sel.value)) ? sel.value : Number(sel.value);
          MP2.setOption(sel.dataset.set, v);
        };
      });
      const w2 = document.getElementById('mp-w2');
      if (w2) w2.onchange = () => MP2.setWager(Math.max(1, parseFloat(w2.value)||1));
    } else if (hb) hb.innerHTML = '';
  }

  /* ready button */
  const rb = document.getElementById('mp-ready');
  if (rb){
    if (me.spectator){ rb.style.display = 'none'; }
    else if (r.status === 'open'){
      rb.style.display = '';
      rb.textContent = me.ready ? 'Cancel ready' : 'Ready up';
      rb.classList.toggle('act-amber', !!me.ready);
      rb.onclick = () => MP2.setReady(!me.ready);
    } else rb.style.display = 'none';
  }
  const ab = document.getElementById('mp-action');
  if (ab && r.status !== 'live'){ ab.disabled = true; ab.textContent = phase; }

  /* countdown */
  const cd = document.getElementById('mp-countdown');
  if (cd){
    if (r.status === 'countdown'){
      const left = Math.max(0, Math.ceil((r.startAt - Date.now())/1000));
      cd.innerHTML = '<div class="mp-cd-num">' + (left || 'GO') + '</div>';
    } else if (r.status === 'settle'){
      cd.innerHTML = '<div class="mp-cd-res">' +
        (r.lastTie ? 'Tied — replaying' : 'Round over') + '</div>';
    } else cd.innerHTML = '';
  }

  paintSide(others, r, g);
}

/* the opponent strip: avatar, name, bet, ready, action, progress,
   connection — plus a live miniature of their board */
function paintSide(others, r, g){
  const side = document.getElementById('mp-side');
  if (!side) return;

  if (!others.length){
    side.innerHTML = '<div class="empty">Waiting for opponents…</div>';
    return;
  }

  side.innerHTML = others.map(p => {
    const state =
        p.online === false ? '<span class="mp-dot off"></span>offline'
      : r.status === 'open' ? (p.ready ? '<span class="mp-dot on"></span>ready' : '<span class="mp-dot"></span>not ready')
      : p.done ? '<span class="mp-dot on"></span>done'
      : '<span class="mp-dot live"></span>' + esc(p.action || 'playing');

    return '<div class="mp-seat' + (p.online === false ? ' dim' : '') + '" data-seat="' + p.uid + '">' +
      '<div class="mp-seat-head">' +
        (p.pic ? '<img class="mp-av" src="' + esc(p.pic) + '" alt="">'
               : '<span class="mp-av init">' + esc((p.name||'?').slice(0,1).toUpperCase()) + '</span>') +
        '<div class="mp-seat-id"><b>' + esc(p.name) + '</b><small>' + state + '</small></div>' +
        '<span class="mp-seat-bet">' + fmt(r.wager) + '</span>' +
      '</div>' +
      '<div class="mp-seat-board" data-mini="' + p.uid + '"></div>' +
      '<div class="mp-prog"><i style="width:' + Math.max(0, Math.min(100, p.progress||0)) + '%"></i></div>' +
    '</div>';
  }).join('');

  /* let the adapter draw each opponent's live board */
  if (g.mini){
    others.forEach(p => {
      const cell = side.querySelector('[data-mini="' + p.uid + '"]');
      if (cell) try{ g.mini(cell, p, MP2.api()); }catch(e){}
    });
  }
}

})();

/* ---------------- styles ----------------
   Injected rather than shipped as a fourth file, and written against
   the existing palette variables so multiplayer looks like the rest
   of JarvisBet rather than a bolted-on system. */
(function(){
const css = `
.mp-create,.mp-join{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;align-items:end;margin-bottom:12px}
.mp-rooms{display:flex;flex-direction:column;gap:8px}
.mp-room{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--panel)}
.mp-room-main{min-width:0;flex:1}
.mp-room-main b{display:block;font-size:14px}
.mp-room-main small{display:block;font-size:11.5px;color:var(--text-3)}
.mp-room-side{display:flex;gap:14px;align-items:center}
.mp-wager{font-family:'JetBrains Mono',monospace;font-weight:700}
.mp-seats{font-size:12px;color:var(--text-3)}

.mp-bar{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--panel);margin-bottom:12px;flex-wrap:wrap}
.mp-bar b{font-size:15px}
.mp-bar small{display:block;font-size:11.5px;color:var(--text-3)}
.mp-code{font-family:'JetBrains Mono',monospace;letter-spacing:4px;font-size:16px;padding:5px 11px;border:1px dashed var(--line);border-radius:8px}
.mp-host-tag{font-size:10px;text-transform:uppercase;letter-spacing:1px;padding:3px 8px;border-radius:6px;background:var(--accent);color:#04121d}
.mp-bar-acts{margin-left:auto;display:flex;gap:6px}

.mp-stage{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:12px;align-items:start}
@media(max-width:900px){.mp-stage{grid-template-columns:1fr}}
.mp-main{border:1px solid var(--line);border-radius:12px;background:var(--panel);padding:16px}
.mp-controls{display:flex;gap:8px;margin-top:12px}
.mp-controls .act{flex:1}
.mp-side{display:flex;flex-direction:column;gap:8px;max-height:520px;overflow-y:auto}

.mp-seat{border:1px solid var(--line);border-radius:11px;background:var(--panel);padding:9px}
.mp-seat.dim{opacity:.5}
.mp-seat-head{display:flex;align-items:center;gap:8px}
.mp-av{width:28px;height:28px;border-radius:50%;object-fit:cover;flex:none}
.mp-av.init{display:grid;place-items:center;background:var(--accent);color:#04121d;font-weight:800;font-size:12px}
.mp-seat-id{min-width:0;flex:1}
.mp-seat-id b{display:block;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mp-seat-id small{display:flex;align-items:center;gap:5px;font-size:10.5px;color:var(--text-3)}
.mp-seat-bet{font-family:'JetBrains Mono',monospace;font-size:11.5px}
.mp-dot{width:6px;height:6px;border-radius:50%;background:var(--text-3);display:inline-block}
.mp-dot.on{background:#43C08A}
.mp-dot.live{background:var(--accent);animation:mpPulse 1s infinite}
.mp-dot.off{background:#E0574F}
@keyframes mpPulse{50%{opacity:.35}}
.mp-seat-board{margin-top:8px}
.mp-prog{height:3px;background:rgba(255,255,255,.08);border-radius:3px;margin-top:8px;overflow:hidden}
.mp-prog i{display:block;height:100%;background:var(--accent);transition:width .25s}

.mp-count{text-align:center;margin-top:12px}
.mp-cd-num{font-size:54px;font-weight:800;animation:mpPop .5s}
.mp-cd-res{font-size:17px;font-weight:700;color:var(--accent)}
@keyframes mpPop{from{transform:scale(.4);opacity:0}}

.mp-hint{font-size:12.5px;color:var(--text-3);margin-bottom:10px;text-align:center}
.mp-mult{font-family:'JetBrains Mono',monospace;font-size:46px;font-weight:700;text-align:center}
.mp-mult.bust{color:#E0574F}
#mpc-canvas{width:100%;display:block}
.mp-mini-crash{text-align:center;font-family:'JetBrains Mono',monospace;font-size:15px;padding:6px;border-radius:7px;background:rgba(255,255,255,.05)}
.mp-mini-crash.out{color:#43C08A}
.mp-mini-crash.bust{color:#E0574F}

.mp-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;max-width:380px;margin:0 auto}
.mp-tile{aspect-ratio:1;border:1px solid var(--line);border-radius:9px;background:var(--panel-2);font-size:20px;cursor:pointer}
.mp-tile:hover:not(:disabled){border-color:var(--accent)}
.mp-tile.g{background:rgba(67,192,138,.22);border-color:#43C08A}
.mp-tile.m{background:rgba(224,87,79,.25);border-color:#E0574F}
.mp-mini-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:2px}
.mp-mini-grid i{aspect-ratio:1;border-radius:2px;background:rgba(255,255,255,.07)}
.mp-mini-grid i.g{background:#43C08A}
.mp-mini-grid i.m{background:#E0574F}

.mp-throws{display:flex;gap:10px;justify-content:center}
.mp-throw{flex:1;max-width:120px;padding:16px 0;border:1px solid var(--line);border-radius:12px;background:var(--panel-2);font-size:30px;cursor:pointer}
.mp-throw small{display:block;font-size:11px;color:var(--text-3);margin-top:5px;text-transform:capitalize}
.mp-throw.on{border-color:var(--accent);background:rgba(74,159,216,.18)}
.mp-mini-throw{text-align:center;font-size:24px}
.mp-mini-throw .wait{font-size:14px;color:var(--text-3)}
`;
const el = document.createElement('style');
el.textContent = css;
document.head.appendChild(el);
})();

/* ---------------- per-game multiplayer styles ----------------
   Each game gets its own layout rules. Nothing shares a generic
   "casino panel" look. */
(function(){
const css = `
.mp-opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.mp-hostpanel{margin-top:12px;padding:12px;border:1px solid var(--line);border-radius:11px;background:var(--panel)}
.mp-hostpanel h4{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--text-3)}
.mp-hostpanel small{display:block;margin-top:8px;font-size:11px;color:var(--text-3)}

/* countdown overlay used by RPS */
.mp-cdover{position:absolute;inset:0;display:grid;place-items:center;z-index:5;background:rgba(6,14,22,.72);border-radius:12px}
.mp-cdover span{font-size:88px;font-weight:800;animation:mpPop .35s cubic-bezier(.2,1.5,.4,1)}

/* ---- RPS: 50/50 split ---- */
.rps-arena{position:relative;display:grid;grid-template-columns:1fr 76px 1fr;gap:10px;align-items:stretch;min-height:340px}
@media(max-width:760px){.rps-arena{grid-template-columns:1fr;grid-template-rows:1fr auto 1fr}}
.rps-half{border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px;background:var(--panel)}
.rps-half.mine{background:linear-gradient(180deg,rgba(74,159,216,.12),var(--panel))}
.rps-who{font-size:12px;text-transform:uppercase;letter-spacing:1.4px;color:var(--text-3)}
.rps-show{flex:1;display:grid;place-items:center;font-size:92px;line-height:1;transition:transform .3s}
.rps-show.locked{opacity:.35}
.rps-show.reveal{opacity:1;animation:mpPop .45s cubic-bezier(.2,1.5,.4,1)}
.rps-show.won{transform:scale(1.18)}
.rps-show.lost{opacity:.4;transform:scale(.86)}
.rps-picks{display:flex;gap:8px}
.rps-btn{flex:1;padding:12px 6px;border:1px solid var(--line);border-radius:12px;background:var(--panel-2);cursor:pointer}
.rps-btn span{display:block;font-size:30px}
.rps-btn small{display:block;font-size:10.5px;color:var(--text-3);text-transform:capitalize;margin-top:4px}
.rps-btn.on{border-color:var(--accent);background:rgba(74,159,216,.2)}
.rps-mid{display:grid;place-items:center;font-weight:800;font-size:15px;color:var(--text-3);text-align:center}
.rps-status{font-size:12px;color:var(--text-3)}
.rps-arena.tie .rps-mid{color:var(--accent)}

/* ---- crash ---- */
.mp-cashrow{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:10px}
.mp-chip{font-size:11px;padding:3px 8px;border-radius:999px;background:rgba(255,255,255,.07)}
.mp-chip.out{background:rgba(67,192,138,.22);color:#8FE3BC}
.mp-chip.bust{background:rgba(224,87,79,.22);color:#F0A9A4}
.mp-chip.live{background:rgba(74,159,216,.2)}

/* ---- tower ---- */
.mp-tower-body{display:flex;flex-direction:column;gap:5px;max-width:420px;margin:0 auto}
.mp-floor{display:grid;grid-template-columns:34px repeat(auto-fit,minmax(0,1fr));gap:5px;align-items:center;opacity:.4}
.mp-floor.active{opacity:1}
.mp-fl{font-size:11px;color:var(--text-3);text-align:right}
.mp-ft{padding:10px 0;border:1px solid var(--line);border-radius:9px;background:var(--panel-2);cursor:pointer}
.mp-floor.active .mp-ft:hover{border-color:var(--accent)}
.mp-ft.ok{background:rgba(67,192,138,.28);border-color:#43C08A}
.mp-ft.bad{background:rgba(224,87,79,.28);border-color:#E0574F}
.mp-mini-tower{display:flex;flex-direction:column;gap:2px}
.mp-mini-tower i{height:5px;border-radius:2px;background:rgba(255,255,255,.08)}
.mp-mini-tower i.up{background:#43C08A}
.mp-mini-tower i.dead{background:#E0574F}

/* ---- limbo ---- */
.mp-limbo{text-align:center}
.mp-limbo-num{font-family:'JetBrains Mono',monospace;font-size:56px;font-weight:700;margin:14px 0}
.mp-limbo-num.win{color:#43C08A}
.mp-limbo-num.lose{color:#E0574F}
.mp-limbo-set{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap}
.mp-limbo-set input{width:120px;padding:9px;border-radius:9px;border:1px solid var(--line);background:var(--panel-2);color:inherit}

/* ---- coin ---- */
.mp-coinwrap{text-align:center}
.mp-coin{width:130px;height:130px;margin:16px auto;border-radius:50%;display:grid;place-items:center;
 font-weight:800;letter-spacing:2px;background:radial-gradient(circle at 34% 30%,#FFE9A8,#D9A21C 55%,#8A6410);color:#3A2A05}
.mp-coin.spin{animation:mpFlip 1.5s cubic-bezier(.3,.75,.35,1)}
@keyframes mpFlip{50%{transform:rotateY(1440deg) translateY(-50px)}100%{transform:rotateY(2880deg)}}
.mp-callrow{display:flex;gap:8px;justify-content:center}
.mp-mini-call{text-align:center;font-size:13px;text-transform:capitalize}

/* ---- dice ---- */
.mp-dicewrap{text-align:center}
.mp-dice{display:flex;gap:14px;justify-content:center;margin:16px 0}
.mp-die{width:74px;height:74px;border-radius:14px;display:grid;place-items:center;font-size:46px;
 background:linear-gradient(160deg,#F6F8FC,#C9D5E6);color:#101B2D}
.mp-die.set{animation:mpPop .3s}
.mp-dice-total{font-family:'JetBrains Mono',monospace;font-size:30px;font-weight:700}
.mp-mini-dice{text-align:center;font-size:20px}

/* ---- higher/lower ---- */
.mp-hl{text-align:center}
.mp-hl-cards{display:flex;gap:8px;justify-content:center;min-height:104px;align-items:center}
.mp-card{width:66px;height:94px;border-radius:9px;background:linear-gradient(170deg,#FDFCF8,#E4E0D6);
 color:#15202F;display:grid;place-items:center;font-size:24px;font-weight:800;animation:mpPop .3s}
.mp-card.red{color:#D3383E}
.mp-card small{display:block;font-size:16px}
.mp-hl-row{display:flex;gap:8px;justify-content:center;margin-top:12px}
.mp-hl-meta{margin-top:10px;font-size:12px;color:var(--text-3)}

/* ---- roulette ---- */
.mp-roul-top{display:flex;gap:16px;align-items:center;justify-content:center;margin-bottom:12px}
.mp-roul-num{font-family:'JetBrains Mono',monospace;font-size:40px;font-weight:700;min-width:70px;text-align:center}
.mp-roul-num.red{color:#E0574F}.mp-roul-num.green{color:#43C08A}
.mp-felt{display:grid;grid-template-columns:repeat(13,1fr);gap:3px;margin-bottom:6px}
.mp-rn{position:relative;aspect-ratio:1;border-radius:5px;border:1px solid rgba(255,255,255,.1);
 font-size:10.5px;cursor:pointer;color:#fff}
.mp-rn.red{background:#9B2A33}.mp-rn.blk{background:#1B2434}.mp-rn.zero{background:#12885B;grid-column:span 1}
.mp-rn.has::after,.mp-rout.has::after{content:attr(data-n);position:absolute;top:-6px;right:-5px;
 background:#FFC93C;color:#2A1B00;border-radius:999px;font-size:9px;padding:1px 5px;font-weight:800}
.mp-rn.hit{outline:2px solid #FFC93C;z-index:2}
.mp-outs{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
.mp-rout{position:relative;padding:9px;border-radius:8px;border:1px solid var(--line);background:var(--panel-2);cursor:pointer;font-size:11.5px}
.mp-mini-bets{display:flex;gap:3px;flex-wrap:wrap}

/* ---- horse race ---- */
.mp-track{display:flex;flex-direction:column;gap:7px}
.mp-lane{position:relative;height:38px;border-radius:9px;background:rgba(255,255,255,.05);overflow:hidden;display:flex;align-items:center}
.mp-lane.mine{background:rgba(74,159,216,.16);box-shadow:inset 0 0 0 1px var(--accent)}
.mp-lane.won{background:rgba(67,192,138,.22)}
.mp-pick{position:relative;z-index:2;margin-left:8px;padding:4px 10px;border-radius:7px;border:1px solid var(--line);
 background:var(--panel);cursor:pointer;font-size:11.5px}
.mp-runner{position:absolute;left:0;font-size:22px;transition:left .1s linear}

/* ---- plinko / cases / wheel / slots ---- */
#mpp-c{width:100%;display:block;border-radius:10px;background:rgba(0,0,0,.25)}
.mp-reel-window{position:relative;overflow:hidden;height:70px;border-radius:10px;background:rgba(0,0,0,.3);margin:12px 0}
.mp-reel{display:flex;gap:6px;align-items:center;height:100%;padding-left:calc(50% - 40px)}
.mp-reel .mp-item{flex:0 0 80px;height:56px;display:grid;place-items:center;border-radius:8px;
 font-family:'JetBrains Mono',monospace;font-weight:700;background:rgba(255,255,255,.06)}
.mp-item.mhi{background:rgba(255,201,60,.3);color:#FFD983}
.mp-item.mmid{background:rgba(74,159,216,.28)}
.mp-reel-mark{position:absolute;left:50%;top:0;bottom:0;width:2px;background:#FFC93C}
.mp-case-out{text-align:center;font-family:'JetBrains Mono',monospace;font-size:30px;font-weight:700}
.mp-case-out.hi{color:#FFC93C}.mp-case-out.mid{color:#6BB7EA}
.mp-lw{text-align:center}
.mp-lw-picks{display:flex;gap:7px;justify-content:center;flex-wrap:wrap;margin-top:12px}
.mp-lwb{padding:9px 15px;border-radius:9px;border:1px solid var(--line);background:var(--panel-2);cursor:pointer}
.mp-lwb.on{border-color:var(--accent);background:rgba(74,159,216,.2)}
.mp-reels{display:flex;gap:9px;justify-content:center}
.mp-sreel{width:80px;height:84px;overflow:hidden;border-radius:9px;background:rgba(0,0,0,.3);display:flex;flex-direction:column}
.mp-sreel span{flex:0 0 84px;display:grid;place-items:center;font-size:34px}
.mp-slot-out{text-align:center;font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:700;margin-top:10px}
.mp-mini-reel{text-align:center;font-size:17px}

/* ---- keno ---- */
.mp-kgrid{display:grid;grid-template-columns:repeat(10,1fr);gap:5px}
@media(max-width:620px){.mp-kgrid{grid-template-columns:repeat(8,1fr)}}
.mp-kb{aspect-ratio:1;border-radius:50%;border:1px solid var(--line);background:var(--panel-2);
 font-family:'JetBrains Mono',monospace;font-size:11px;cursor:pointer}
.mp-kb.pick{background:var(--accent);color:#04121d;font-weight:700}
.mp-kb.drawn{background:rgba(255,255,255,.14);color:var(--text-3)}
.mp-kb.hit{background:#43C08A;color:#04231A;font-weight:800;animation:mpPop .3s}

/* ---- chicken cross ---- */
.mp-road{position:relative;display:flex;height:190px;border-radius:11px;overflow:hidden;background:rgba(0,0,0,.28);cursor:pointer}
.mp-cxlane{position:relative;flex:1;border-right:2px dashed rgba(255,255,255,.12)}
.mp-cxlane.done{background:rgba(67,192,138,.12)}
.mp-cxlane.crash{background:rgba(224,87,79,.2)}
.mp-car{position:absolute;top:6px;left:50%;transform:translateX(-50%);font-size:20px;opacity:.5}
.mp-chick{position:absolute;bottom:12px;left:0;font-size:28px;transition:left .32s cubic-bezier(.3,.9,.3,1);z-index:3}
.mp-chick.hop{animation:mpHop .32s}
.mp-chick.dead{transform:rotate(90deg);opacity:.45}
@keyframes mpHop{50%{transform:translateY(-22px)}}
.mp-mini-road{display:flex;gap:2px}
.mp-mini-road i{flex:1;height:8px;border-radius:2px;background:rgba(255,255,255,.08)}
.mp-mini-road i.done{background:#43C08A}
.mp-mini-road i.dead{background:#E0574F}

/* shared mini bits */
.mp-mini-num{text-align:center;font-family:'JetBrains Mono',monospace;font-size:19px;font-weight:700}
.mp-mini-line{text-align:center;font-size:10.5px;color:var(--text-3);margin-top:2px}
.mp-tile.faint{opacity:.4}
`;
const s = document.createElement('style');
s.textContent = css;
document.head.appendChild(s);
})();
