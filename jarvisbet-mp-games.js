/* ================================================================
   MULTIPLAYER ADAPTERS — part one

   Every adapter owns its own layout. Nothing here funnels a game into
   a shared template, and nothing is reduced to a "you won" line.

   Adapter shape:
     name, blurb, minPlayers, maxPlayers
     settings[]        host options shown in the lobby panel
     main(el, api)     my large playfield
     mini(el, p, api)  one opponent, drawn live from their state
     start(api)        the round has gone live
   ================================================================ */
(function(){
'use strict';

const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const el = (h) => { const d = document.createElement('div'); d.innerHTML = h; return d.firstElementChild; };
const $$ = s => document.querySelector(s);

/* a small helper: count 3-2-1 in the middle of the board, then run cb */
function dramatic(host, cb){
  const n = el('<div class="mp-cdover"><span>3</span></div>');
  host.appendChild(n);
  let v = 3;
  const span = n.querySelector('span');
  const t = setInterval(() => {
    v--;
    if (v > 0){ span.textContent = v; span.style.animation = 'none'; void span.offsetWidth; span.style.animation = ''; }
    else { clearInterval(t); n.remove(); cb(); }
  }, 700);
}

/* ================================================================
   ROCK PAPER SCISSORS — split screen, locked picks, dramatic reveal
   ================================================================ */
MPGAMES.rps = {
  name:'Rock Paper Scissors', blurb:'Both lock in, then reveal together.',
  minPlayers:2, maxPlayers:2,
  settings:[
    { key:'bestOf', label:'Rounds to win', type:'select', def:1,
      options:[{v:1,t:'Single round'},{v:2,t:'Best of 3'},{v:3,t:'Best of 5'}] }
  ],

  main(el0, api){
    el0.innerHTML =
      '<div class="rps-arena" id="rps-arena">' +
        '<div class="rps-half mine">' +
          '<div class="rps-who">You</div>' +
          '<div class="rps-show" id="rps-mine">?</div>' +
          '<div class="rps-picks" id="rps-pick">' +
            [['rock','✊'],['paper','✋'],['scissors','✌️']].map(([k,g]) =>
              '<button class="rps-btn" data-k="'+k+'"><span>'+g+'</span><small>'+k+'</small></button>').join('') +
          '</div>' +
        '</div>' +
        '<div class="rps-mid"><span id="rps-vs">VS</span></div>' +
        '<div class="rps-half theirs">' +
          '<div class="rps-who" id="rps-oname">Opponent</div>' +
          '<div class="rps-show" id="rps-theirs">?</div>' +
          '<div class="rps-status" id="rps-ostat">choosing…</div>' +
        '</div>' +
      '</div>';
  },

  mini(){ /* two-player game: the opponent is the right-hand half */ },

  start(api){
    const G = { rock:'✊', paper:'✋', scissors:'✌️' };
    const beats = { rock:'scissors', paper:'rock', scissors:'paper' };
    const pickWrap = $$('#rps-pick'), mine = $$('#rps-mine'),
          theirs = $$('#rps-theirs'), ostat = $$('#rps-ostat'), arena = $$('#rps-arena');
    if (!pickWrap) return api.finish(0);

    let picked = null, revealed = false;
    const opp = () => api.players().find(p => p.uid !== api.me());
    const o = opp(); if (o) $$('#rps-oname').textContent = o.name;

    pickWrap.querySelectorAll('.rps-btn').forEach(b => {
      b.onclick = () => {
        if (picked) return;
        picked = b.dataset.k;
        mine.textContent = G[picked];
        mine.classList.add('locked');
        pickWrap.querySelectorAll('.rps-btn').forEach(x => {
          x.disabled = true; x.classList.toggle('on', x === b);
        });
        api.publish({ board:{ k:picked }, action:'locked in' });
        if (typeof sfx !== 'undefined') sfx.chip();
        waitForThem();
      };
    });

    function waitForThem(){
      const other = opp();
      if (!other || !other.board || !other.board.k){
        ostat.textContent = 'choosing…';
        return setTimeout(waitForThem, 220);
      }
      ostat.textContent = 'locked in';
      theirs.classList.add('locked');
      if (revealed) return;
      revealed = true;

      /* both are in — count down on the board itself, then reveal */
      dramatic(arena, () => {
        const t = other.board.k;
        theirs.textContent = G[t];
        mine.classList.add('reveal'); theirs.classList.add('reveal');

        let score, verdict;
        if (t === picked){ score = 0; verdict = 'Tie'; arena.classList.add('tie'); }
        else if (beats[picked] === t){ score = 1; verdict = 'You win'; mine.classList.add('won'); theirs.classList.add('lost'); }
        else { score = -1; verdict = 'They win'; theirs.classList.add('won'); mine.classList.add('lost'); }

        $$('#rps-vs').textContent = verdict;
        if (typeof sfx !== 'undefined') score > 0 ? sfx.win() : score < 0 ? sfx.lose() : sfx.chip();
        setTimeout(() => api.finish(score), 900);
      });
    }

    /* nobody gets to stall the table */
    setTimeout(() => { if (!picked) api.finish(-2); }, 15000);
  }
};

/* ================================================================
   CRASH — one shared curve, every cash-out visible live
   ================================================================ */
MPGAMES.crash = {
  name:'Crash', blurb:'One curve. Last to cash out safely takes it.',
  minPlayers:2, maxPlayers:8,
  settings:[
    { key:'speed', label:'Curve speed', type:'select', def:1,
      options:[{v:0.7,t:'Slow'},{v:1,t:'Normal'},{v:1.5,t:'Fast'}] }
  ],

  main(el0){
    el0.innerHTML =
      '<div class="mp-crash">' +
        '<div class="mp-mult" id="mpc-mult">1.00×</div>' +
        '<canvas id="mpc-canvas" height="200"></canvas>' +
        '<div class="mp-cashrow" id="mpc-cashrow"></div>' +
        '<div class="mp-hint" id="mpc-hint">Waiting for the round…</div>' +
      '</div>';
  },

  mini(el0, p){
    const at = p.board && p.board.at;
    el0.innerHTML = '<div class="mp-mini-crash ' + (p.done ? (at ? 'out' : 'bust') : '') + '">' +
      (at ? Number(at).toFixed(2)+'×' : (p.done ? 'BUST' : 'in')) + '</div>';
  },

  start(api){
    const r = api.shared();
    const crashAt = Math.max(1, Math.floor((0.99 / (1 - r())) * 100) / 100);
    const speed = Number(api.set('speed')) || 1;

    const mult = $$('#mpc-mult'), hint = $$('#mpc-hint'), cv = $$('#mpc-canvas');
    if (!cv) return api.finish(0);
    const ctx = cv.getContext('2d');
    cv.width = cv.clientWidth * 2; cv.height = 400;
    ctx.setTransform(2,0,0,2,0,0);
    const W = cv.clientWidth, H = 200;

    let cashed = null, running = true, cur = 1;
    const t0 = performance.now(), pts = [];

    const btn = $$('#mp-action');
    if (btn){
      btn.textContent = 'Cash out'; btn.disabled = false;
      btn.onclick = () => {
        if (!running || cashed) return;
        cashed = cur;
        api.publish({ board:{ at:cashed }, action:'out @ '+cashed.toFixed(2)+'×' });
        btn.disabled = true;
        hint.textContent = 'Out at ' + cashed.toFixed(2) + '× — still running for the others.';
        if (typeof sfx !== 'undefined') sfx.win();
        api.finish(cashed);
      };
    }

    const step = now => {
      if (!running) return;
      const t = (now - t0) / 1000;
      cur = Math.pow(Math.E, 0.09 * t * 4 * speed);

      if (cur >= crashAt){
        running = false;
        mult.textContent = crashAt.toFixed(2) + '×';
        mult.classList.add('bust');
        hint.textContent = 'Crashed at ' + crashAt.toFixed(2) + '×';
        if (btn) btn.disabled = true;
        if (!cashed){
          api.publish({ board:{ at:null }, action:'busted' });
          if (typeof sfx !== 'undefined') sfx.lose();
          api.finish(0);
        }
        return;
      }

      mult.textContent = cur.toFixed(2) + '×';
      if (!cashed) api.publish({ progress: Math.min(99, cur*8) });

      /* live list of who is still in and who has jumped */
      const row = $$('#mpc-cashrow');
      if (row) row.innerHTML = api.players().map(p =>
        '<span class="mp-chip ' + (p.done ? (p.board && p.board.at ? 'out':'bust') : 'live') + '">' +
        esc(p.name) + (p.board && p.board.at ? ' ' + Number(p.board.at).toFixed(2)+'×' : '') + '</span>').join('');

      pts.push(cur);
      ctx.clearRect(0,0,W,H);
      ctx.beginPath();
      const span = Math.max(24, pts.length);
      pts.forEach((v,i) => {
        const x = (i/span)*W;
        const y = H - Math.min(H-6, (v-1)/Math.max(1.2, crashAt-1)*(H-22));
        i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
      });
      ctx.strokeStyle = cashed ? '#43C08A' : '#4a9fd8';
      ctx.lineWidth = 3; ctx.stroke();
      requestAnimationFrame(step);
    };
    hint.textContent = 'Live — jump before it goes.';
    requestAnimationFrame(step);
  }
};

/* ================================================================
   MINES — everyone gets a board, all visible at once
   ================================================================ */
MPGAMES.mines = {
  name:'Mines', blurb:'Same layout for everyone. Most gems banked wins.',
  minPlayers:2, maxPlayers:6,
  settings:[
    { key:'bombs', label:'Bombs', type:'select', def:5,
      options:[{v:3,t:'3 — gentle'},{v:5,t:'5 — standard'},{v:8,t:'8 — nasty'},{v:12,t:'12 — brutal'}] },
    { key:'size', label:'Board size', type:'select', def:5,
      options:[{v:4,t:'4 × 4'},{v:5,t:'5 × 5'},{v:6,t:'6 × 6'}] },
    { key:'sameBoard', label:'Board layout', type:'select', def:1,
      options:[{v:1,t:'Identical for all'},{v:0,t:'Different per player'}] }
  ],

  main(el0){
    el0.innerHTML =
      '<div class="mp-mines">' +
        '<div class="mp-hint" id="mpm-hint">Waiting…</div>' +
        '<div class="mp-grid" id="mpm-grid"></div>' +
      '</div>';
  },

  mini(el0, p, api){
    const n = Number(api ? api.set('size') : 5) || 5;
    const b = (p.board && p.board.t) || '';
    let h = '<div class="mp-mini-grid" style="grid-template-columns:repeat('+n+',1fr)">';
    for (let i = 0; i < n*n; i++){
      const c = b[i] || '.';
      h += '<i class="' + (c==='g'?'g':c==='m'?'m':'') + '"></i>';
    }
    el0.innerHTML = h + '</div><div class="mp-mini-line">' + (p.board ? (p.board.n||0)+' gems' : '—') + '</div>';
  },

  start(api){
    const n = Number(api.set('size')) || 5;
    const cells = n*n;
    const bombs = Math.min(cells-2, Number(api.set('bombs')) || 5);
    const same = Number(api.set('sameBoard')) !== 0;
    const r = api.rng(same ? 'mines' : 'mines-' + api.me());

    const bomb = new Set();
    while (bomb.size < bombs) bomb.add(Math.floor(r()*cells));

    const grid = $$('#mpm-grid'), hint = $$('#mpm-hint');
    if (!grid) return api.finish(0);
    grid.style.gridTemplateColumns = 'repeat(' + n + ',1fr)';
    grid.innerHTML = '';

    let picks = 0, over = false;
    const tiles = new Array(cells).fill('.');
    const push = () => api.publish({
      board:{ t:tiles.join(''), n:picks },
      progress: Math.min(99, picks*(100/(cells-bombs))),
      action: over ? 'out on ' + picks : picks + ' gems'
    });

    for (let i = 0; i < cells; i++){
      const b = document.createElement('button');
      b.className = 'mp-tile';
      b.onclick = () => {
        if (over || tiles[i] !== '.') return;
        if (bomb.has(i)){
          tiles[i]='m'; b.classList.add('m'); b.textContent='💣'; over = true;
          hint.textContent = 'Mine. Banked ' + picks + '.';
          grid.querySelectorAll('.mp-tile').forEach(x => x.disabled = true);
          bomb.forEach(j => { if (j!==i){ grid.children[j].classList.add('m','faint'); grid.children[j].textContent='💣'; } });
          if (typeof sfx !== 'undefined') sfx.lose();
          push(); api.finish(picks);
        } else {
          tiles[i]='g'; b.classList.add('g'); b.textContent='💎'; b.disabled = true; picks++;
          hint.textContent = picks + ' banked — keep going or bank it.';
          if (typeof sfx !== 'undefined') sfx.chip();
          push();
          if (picks === cells - bombs){ over = true; api.finish(picks); }
        }
      };
      grid.appendChild(b);
    }

    const btn = $$('#mp-action');
    if (btn){
      btn.textContent = 'Bank it'; btn.disabled = false;
      btn.onclick = () => {
        if (over) return;
        over = true; btn.disabled = true;
        hint.textContent = 'Banked on ' + picks + '.';
        grid.querySelectorAll('.mp-tile').forEach(x => x.disabled = true);
        push(); api.finish(picks);
      };
    }
    hint.textContent = bombs + ' bombs. Bank more gems than anyone.';
    push();
  }
};

/* ================================================================
   TOWER — everyone climbs their own, live
   ================================================================ */
MPGAMES.tower = {
  name:'Tower', blurb:'Climb higher than anyone else, or fall trying.',
  minPlayers:2, maxPlayers:6,
  settings:[
    { key:'width', label:'Tiles per floor', type:'select', def:3,
      options:[{v:2,t:'2 — coin flip'},{v:3,t:'3 — standard'},{v:4,t:'4 — steady'}] },
    { key:'floors', label:'Floors', type:'select', def:8,
      options:[{v:6,t:'6'},{v:8,t:'8'},{v:12,t:'12'}] }
  ],

  main(el0){
    el0.innerHTML = '<div class="mp-tower"><div class="mp-hint" id="mpt-hint">Waiting…</div>' +
      '<div class="mp-tower-body" id="mpt-body"></div></div>';
  },

  mini(el0, p, api){
    const floors = Number(api ? api.set('floors') : 8) || 8;
    const at = (p.board && p.board.f) || 0;
    let h = '<div class="mp-mini-tower">';
    for (let i = floors; i > 0; i--)
      h += '<i class="' + (i <= at ? 'up' : '') + (p.board && p.board.dead && i === at+1 ? ' dead' : '') + '"></i>';
    el0.innerHTML = h + '</div><div class="mp-mini-line">floor ' + at + '</div>';
  },

  start(api){
    const W = Number(api.set('width')) || 3;
    const F = Number(api.set('floors')) || 8;
    const r = api.rng('tower-' + api.me());
    const safe = Array.from({length:F}, () => Math.floor(r()*W));

    const body = $$('#mpt-body'), hint = $$('#mpt-hint');
    if (!body) return api.finish(0);

    let floor = 0, dead = false;
    body.innerHTML = '';
    for (let f = F-1; f >= 0; f--){
      const row = document.createElement('div');
      row.className = 'mp-floor'; row.dataset.f = f;
      row.innerHTML = '<span class="mp-fl">' + (f+1) + '</span>';
      for (let i = 0; i < W; i++){
        const t = document.createElement('button');
        t.className = 'mp-ft'; t.textContent = '◆';
        t.onclick = () => pick(f, i, t, row);
        row.appendChild(t);
      }
      body.appendChild(row);
    }
    const paint = () => {
      body.querySelectorAll('.mp-floor').forEach(x =>
        x.classList.toggle('active', !dead && +x.dataset.f === floor));
      api.publish({ board:{ f:floor, dead }, progress: Math.min(99, floor*(100/F)),
                    action: dead ? 'fell on ' + (floor+1) : 'floor ' + floor });
    };

    function pick(f, i, t, row){
      if (dead || f !== floor) return;
      if (i === safe[f]){
        t.classList.add('ok'); t.textContent = '✓';
        floor++;
        if (typeof sfx !== 'undefined') sfx.chip();
        hint.textContent = 'Floor ' + floor + ' of ' + F + ' — keep going or bank it.';
        if (floor === F){ dead = true; paint(); api.finish(floor); return; }
      } else {
        t.classList.add('bad'); t.textContent = '✕';
        row.children[safe[f]+1].classList.add('ok');
        dead = true;
        hint.textContent = 'Fell on floor ' + (f+1) + '. Kept ' + floor + '.';
        if (typeof sfx !== 'undefined') sfx.lose();
        api.finish(floor);
      }
      paint();
    }

    const btn = $$('#mp-action');
    if (btn){
      btn.textContent = 'Bank it'; btn.disabled = false;
      btn.onclick = () => { if (dead) return; dead = true; btn.disabled = true;
        hint.textContent = 'Banked on floor ' + floor + '.'; paint(); api.finish(floor); };
    }
    hint.textContent = 'One tile per floor is safe. Climb.';
    paint();
  }
};

/* ================================================================
   LIMBO — shared roll, private targets
   ================================================================ */
MPGAMES.limbo = {
  name:'Limbo', blurb:'One shared roll. Highest target that still clears wins.',
  minPlayers:2, maxPlayers:8,
  settings:[
    { key:'maxTarget', label:'Target ceiling', type:'select', def:100,
      options:[{v:10,t:'10×'},{v:100,t:'100×'},{v:1000,t:'1000×'}] }
  ],

  main(el0){
    el0.innerHTML =
      '<div class="mp-limbo">' +
        '<div class="mp-hint" id="mpl-hint">Set your target before the roll.</div>' +
        '<div class="mp-limbo-num" id="mpl-num">—</div>' +
        '<div class="mp-limbo-set" id="mpl-set">' +
          '<label>Your target</label>' +
          '<input type="number" id="mpl-t" min="1.01" step="0.01" value="2.00">' +
          '<button class="act" id="mpl-lock">Lock target</button>' +
        '</div>' +
      '</div>';
  },

  mini(el0, p){
    const t = p.board && p.board.t;
    el0.innerHTML = '<div class="mp-mini-num">' + (t ? Number(t).toFixed(2)+'×' : '…') + '</div>' +
      '<div class="mp-mini-line">' + (p.done ? (p.score > 0 ? 'cleared' : 'missed') : 'choosing') + '</div>';
  },

  start(api){
    const cap = Number(api.set('maxTarget')) || 100;
    const inp = $$('#mpl-t'), hint = $$('#mpl-hint'), num = $$('#mpl-num');
    if (!inp) return api.finish(0);
    let locked = null;

    $$('#mpl-lock').onclick = () => {
      if (locked) return;
      locked = Math.max(1.01, Math.min(cap, parseFloat(inp.value) || 2));
      inp.disabled = true; $$('#mpl-lock').disabled = true;
      api.publish({ board:{ t:locked }, action:'target ' + locked.toFixed(2)+'×' });
      hint.textContent = 'Locked at ' + locked.toFixed(2) + '× — waiting for the table.';
      waitAll();
    };

    function waitAll(){
      const ps = api.players();
      if (!ps.every(p => p.board && p.board.t)) return setTimeout(waitAll, 220);

      /* one roll, shared by everyone */
      const r = api.shared();
      const roll = Math.max(1, Math.floor((0.99/(1-r()))*100)/100);
      let shown = 1;
      const t0 = performance.now();
      const tick = now => {
        const k = Math.min(1, (now-t0)/1400);
        shown = 1 + (roll-1)*(1-Math.pow(1-k,3));
        num.textContent = shown.toFixed(2)+'×';
        if (k < 1) requestAnimationFrame(tick);
        else {
          num.textContent = roll.toFixed(2)+'×';
          const cleared = roll >= locked;
          num.classList.add(cleared ? 'win' : 'lose');
          hint.textContent = cleared ? 'Cleared your ' + locked.toFixed(2) + '×' : 'Short of ' + locked.toFixed(2) + '×';
          if (typeof sfx !== 'undefined') cleared ? sfx.win() : sfx.lose();
          api.finish(cleared ? locked : 0);
        }
      };
      requestAnimationFrame(tick);
    }

    setTimeout(() => { if (!locked) api.finish(0); }, 15000);
  }
};

/* ================================================================
   COIN FLIP — one coin, called sides
   ================================================================ */
MPGAMES.coinflip = {
  name:'Coin Flip', blurb:'One coin. Call it right and split the pot.',
  minPlayers:2, maxPlayers:6,
  settings:[],

  main(el0){
    el0.innerHTML =
      '<div class="mp-coinwrap">' +
        '<div class="mp-hint" id="mpf-hint">Call it.</div>' +
        '<div class="mp-coin" id="mpf-coin">?</div>' +
        '<div class="mp-callrow">' +
          '<button class="act" data-c="heads">Heads</button>' +
          '<button class="act act-2" data-c="tails">Tails</button>' +
        '</div>' +
      '</div>';
  },

  mini(el0, p){
    const c = p.board && p.board.c;
    el0.innerHTML = '<div class="mp-mini-call">' + (c ? esc(c) : '…') + '</div>';
  },

  start(api){
    const hint = $$('#mpf-hint'), coin = $$('#mpf-coin');
    let call = null;
    document.querySelectorAll('.mp-callrow .act').forEach(b => {
      b.onclick = () => {
        if (call) return;
        call = b.dataset.c;
        document.querySelectorAll('.mp-callrow .act').forEach(x => { x.disabled = true; x.classList.toggle('on', x===b); });
        api.publish({ board:{ c:call }, action:'called ' + call });
        hint.textContent = 'Called ' + call + ' — waiting.';
        waitAll();
      };
    });

    function waitAll(){
      const ps = api.players();
      if (!ps.every(p => p.board && p.board.c)) return setTimeout(waitAll, 220);
      const r = api.shared();
      const res = r() < 0.5 ? 'heads' : 'tails';
      coin.classList.add('spin'); coin.textContent = '…';
      setTimeout(() => {
        coin.classList.remove('spin');
        coin.textContent = res.toUpperCase();
        const ok = res === call;
        hint.textContent = ok ? 'Called it.' : 'Wrong side.';
        if (typeof sfx !== 'undefined') ok ? sfx.win() : sfx.lose();
        api.finish(ok ? 1 : 0);
      }, 1500);
    }
    setTimeout(() => { if (!call) api.finish(-1); }, 15000);
  }
};

/* ================================================================
   DICE — everyone rolls, biggest total wins
   ================================================================ */
MPGAMES.dice = {
  name:'Dice Duel', blurb:'Two dice each, rolled together. Highest total wins.',
  minPlayers:2, maxPlayers:6,
  settings:[
    { key:'dice', label:'Dice per player', type:'select', def:2,
      options:[{v:1,t:'1'},{v:2,t:'2'},{v:3,t:'3'}] }
  ],

  main(el0){
    el0.innerHTML = '<div class="mp-dicewrap"><div class="mp-hint" id="mpd-hint">Roll when ready.</div>' +
      '<div class="mp-dice" id="mpd-dice"></div><div class="mp-dice-total" id="mpd-tot">—</div></div>';
  },

  mini(el0, p){
    const d = (p.board && p.board.d) || [];
    el0.innerHTML = '<div class="mp-mini-dice">' +
      (d.length ? d.map(v => '<span>'+'⚀⚁⚂⚃⚄⚅'[v-1]+'</span>').join('') : '<span class="wait">…</span>') +
      '</div><div class="mp-mini-line">' + (p.board && p.board.t ? p.board.t : '—') + '</div>';
  },

  start(api){
    const N = Number(api.set('dice')) || 2;
    const wrap = $$('#mpd-dice'), hint = $$('#mpd-hint'), tot = $$('#mpd-tot');
    const face = '⚀⚁⚂⚃⚄⚅';
    wrap.innerHTML = Array.from({length:N}, () => '<div class="mp-die">⚄</div>').join('');
    const dice = [...wrap.children];

    const btn = $$('#mp-action');
    let rolled = false;
    const doRoll = () => {
      if (rolled) return; rolled = true;
      if (btn) btn.disabled = true;
      const r = api.rng('dice-' + api.me());
      const vals = Array.from({length:N}, () => 1 + Math.floor(r()*6));
      let n = 0;
      const spin = setInterval(() => {
        dice.forEach(d => d.textContent = face[Math.floor(Math.random()*6)]);
        if (++n > 8){
          clearInterval(spin);
          dice.forEach((d,i) => { d.textContent = face[vals[i]-1]; d.classList.add('set'); });
          const t = vals.reduce((a,b)=>a+b,0);
          tot.textContent = t;
          hint.textContent = 'Rolled ' + t + '.';
          api.publish({ board:{ d:vals, t }, action:'rolled ' + t });
          if (typeof sfx !== 'undefined') sfx.chip();
          api.finish(t);
        }
      }, 80);
    };
    if (btn){ btn.textContent = 'Roll'; btn.disabled = false; btn.onclick = doRoll; }
    setTimeout(() => { if (!rolled) doRoll(); }, 8000);   // auto-roll stragglers
  }
};

/* ================================================================
   HIGHER / LOWER — own ladder, longest streak wins
   ================================================================ */
MPGAMES.higherlower = {
  name:'Higher or Lower', blurb:'Longest correct streak takes the pot.',
  minPlayers:2, maxPlayers:6,
  settings:[
    { key:'lives', label:'Lives', type:'select', def:1,
      options:[{v:1,t:'1 — sudden death'},{v:2,t:'2'},{v:3,t:'3'}] }
  ],

  main(el0){
    el0.innerHTML = '<div class="mp-hl"><div class="mp-hint" id="mph-hint">Call the next card.</div>' +
      '<div class="mp-hl-cards" id="mph-cards"></div>' +
      '<div class="mp-hl-row"><button class="act" id="mph-up">Higher</button>' +
      '<button class="act act-2" id="mph-dn">Lower</button></div>' +
      '<div class="mp-hl-meta" id="mph-meta">streak 0</div></div>';
  },

  mini(el0, p){
    el0.innerHTML = '<div class="mp-mini-num">' + ((p.board && p.board.s) || 0) + '</div>' +
      '<div class="mp-mini-line">' + (p.board && p.board.c ? esc(p.board.c) : 'streak') + '</div>';
  },

  start(api){
    const R = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    const S = ['♠','♥','♦','♣'];
    const lives0 = Number(api.set('lives')) || 1;
    const r = api.rng('hl-' + api.me());
    const draw = () => { const i = Math.floor(r()*13), s = S[Math.floor(r()*4)]; return { i, r:R[i], s }; };

    let cur = draw(), streak = 0, lives = lives0, over = false;
    const cards = $$('#mph-cards'), hint = $$('#mph-hint'), meta = $$('#mph-meta');

    const show = c => {
      const n = el('<div class="mp-card ' + (c.s==='♥'||c.s==='♦' ? 'red':'') + '">' + c.r + '<small>' + c.s + '</small></div>');
      cards.appendChild(n);
      while (cards.children.length > 5) cards.removeChild(cards.firstChild);
    };
    show(cur);
    const paint = () => {
      meta.textContent = 'streak ' + streak + (lives0 > 1 ? '  ·  ' + lives + ' lives' : '');
      api.publish({ board:{ s:streak, c:cur.r+cur.s }, progress: Math.min(99, streak*10), action:'streak ' + streak });
    };
    paint();

    const guess = up => {
      if (over) return;
      const next = draw();
      show(next);
      const good = up ? next.i > cur.i : next.i < cur.i;
      cur = next;
      if (good){ streak++; if (typeof sfx !== 'undefined') sfx.chip(); hint.textContent = 'Correct — streak ' + streak + '.'; }
      else {
        lives--;
        if (typeof sfx !== 'undefined') sfx.lose();
        if (lives <= 0){ over = true; hint.textContent = 'Out on ' + streak + '.'; paint(); api.finish(streak); return; }
        hint.textContent = 'Wrong — ' + lives + ' left.';
      }
      paint();
    };
    $$('#mph-up').onclick = () => guess(true);
    $$('#mph-dn').onclick = () => guess(false);

    const btn = $$('#mp-action');
    if (btn){
      btn.textContent = 'Bank streak'; btn.disabled = false;
      btn.onclick = () => { if (over) return; over = true; btn.disabled = true;
        hint.textContent = 'Banked on ' + streak + '.'; api.finish(streak); };
    }
  }
};

})();
