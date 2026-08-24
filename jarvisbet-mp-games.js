/* ================================================================
   MULTIPLAYER GAME ADAPTERS

   Two shapes, exactly as asked for:

   SHARED ROUND  — everyone watches one live thing happen at the same
                   moment (Crash). The curve is identical on every
                   screen because it is drawn from the shared seed.

   OWN BOARD     — you get the big playable area, opponents get live
                   miniature versions of the same board updating as
                   they act (Mines, RPS).

   An adapter is:
     mode        'shared' | 'solo'
     main(el,api)   draw my large board
     mini(el,p)     draw one opponent's small board from their state
     start(api)     round has gone live
     stop()         tear down timers
   ================================================================ */
(function(){
'use strict';

const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ================================================================
   CRASH — one shared curve, everyone cashing out live
   ================================================================ */
MPGAMES.crash = {
  name:'Crash', minPlayers:2, maxPlayers:8, mode:'shared',
  blurb:'One curve, everyone watching. Last to cash out safely wins.',

  point(api){
    /* the crash point comes from the shared seed, so every client
       draws the identical curve */
    const r = api.shared();
    const u = r();
    return Math.max(1, Math.floor((0.99 / (1 - u)) * 100) / 100);
  },

  main(el, api){
    el.innerHTML =
      '<div class="mp-crash">' +
        '<div class="mp-mult" id="mpc-mult">1.00×</div>' +
        '<canvas id="mpc-canvas" height="190"></canvas>' +
        '<div class="mp-hint" id="mpc-hint">Waiting for the round…</div>' +
      '</div>';
  },

  mini(el, p){
    const at = p.board && p.board.at;
    el.innerHTML =
      '<div class="mp-mini-crash ' + (p.done ? (at ? 'out' : 'bust') : '') + '">' +
        '<b>' + (at ? Number(at).toFixed(2) + '×' : (p.done ? 'BUST' : '—')) + '</b>' +
      '</div>';
  },

  start(api){
    const crashAt = this.point(api);
    const mult = document.getElementById('mpc-mult');
    const hint = document.getElementById('mpc-hint');
    const cv   = document.getElementById('mpc-canvas');
    if (!mult || !cv) return api.finish(0);

    const ctx = cv.getContext('2d');
    cv.width = cv.clientWidth * 2; cv.height = 380;
    ctx.setTransform(2,0,0,2,0,0);

    const W = cv.clientWidth, H = 190;
    let cashed = null, running = true;
    const t0 = performance.now();
    const pts = [];

    const btn = document.getElementById('mp-action');
    if (btn){
      btn.textContent = 'Cash out';
      btn.disabled = false;
      btn.onclick = () => {
        if (!running || cashed) return;
        cashed = cur;
        api.publish({ board:{ at: cashed }, action:'out @ '+cashed.toFixed(2)+'×' });
        btn.disabled = true;
        hint.textContent = 'Out at ' + cashed.toFixed(2) + '× — waiting on the others.';
        api.finish(cashed);
      };
    }

    let cur = 1;
    const step = now => {
      if (!running) return;
      const t = (now - t0) / 1000;
      cur = Math.pow(Math.E, 0.09 * t * 4);           // same curve for everyone
      if (cur >= crashAt){
        running = false;
        mult.textContent = crashAt.toFixed(2) + '×';
        mult.classList.add('bust');
        hint.textContent = 'Crashed at ' + crashAt.toFixed(2) + '×';
        if (btn) btn.disabled = true;
        if (!cashed){ api.publish({ board:{ at:null }, action:'busted' }); api.finish(0); }
        return;
      }

      mult.textContent = cur.toFixed(2) + '×';
      if (!cashed) api.publish({ progress: Math.min(99, cur * 8) });

      pts.push(cur);
      ctx.clearRect(0,0,W,H);
      ctx.beginPath();
      const span = Math.max(20, pts.length);
      pts.forEach((v,i) => {
        const x = (i/span) * W;
        const y = H - Math.min(H-6, (v-1) / Math.max(1.2, crashAt-1) * (H-20));
        i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
      });
      ctx.strokeStyle = cashed ? '#43C08A' : '#4a9fd8';
      ctx.lineWidth = 3; ctx.stroke();

      requestAnimationFrame(step);
    };
    hint.textContent = 'Live — cash out before it goes.';
    requestAnimationFrame(step);
    this._stop = () => { running = false; };
  },

  stop(){ if (this._stop) this._stop(); }
};

/* ================================================================
   MINES — your board is big, theirs are live miniatures
   ================================================================ */
MPGAMES.mines = {
  name:'Mines', minPlayers:2, maxPlayers:6, mode:'solo',
  blurb:'Same board layout for everyone. Most gems banked wins.',

  main(el, api){
    el.innerHTML =
      '<div class="mp-mines">' +
        '<div class="mp-hint" id="mpm-hint">Waiting for the round…</div>' +
        '<div class="mp-grid" id="mpm-grid"></div>' +
      '</div>';
  },

  mini(el, p){
    const b = (p.board && p.board.t) || '';
    let html = '<div class="mp-mini-grid">';
    for (let i = 0; i < 25; i++){
      const c = b[i] || '.';
      html += '<i class="' + (c==='g'?'g':c==='m'?'m':'') + '"></i>';
    }
    html += '</div>';
    el.innerHTML = html;
  },

  start(api){
    const MINES = 5;
    const r = api.rng('mines');                 // identical layout for all
    const bomb = new Set();
    while (bomb.size < MINES) bomb.add(Math.floor(r() * 25));

    const grid = document.getElementById('mpm-grid');
    const hint = document.getElementById('mpm-hint');
    if (!grid) return api.finish(0);

    let picks = 0, dead = false;
    const tiles = new Array(25).fill('.');
    grid.innerHTML = '';

    const publish = () => api.publish({
      board:{ t: tiles.join('') },
      progress: Math.min(99, picks * 5),
      action: dead ? 'hit a mine' : picks + ' gems'
    });

    for (let i = 0; i < 25; i++){
      const b = document.createElement('button');
      b.className = 'mp-tile';
      b.onclick = () => {
        if (dead || tiles[i] !== '.') return;
        if (bomb.has(i)){
          tiles[i] = 'm'; b.classList.add('m'); b.textContent = '💣';
          dead = true;
          hint.textContent = 'Mine. Banked ' + picks + ' gems.';
          publish();
          api.finish(picks);
          grid.querySelectorAll('.mp-tile').forEach(x => x.disabled = true);
          if (typeof sfx !== 'undefined') sfx.lose();
        } else {
          tiles[i] = 'g'; b.classList.add('g'); b.textContent = '💎';
          b.disabled = true; picks++;
          hint.textContent = picks + ' banked — keep going or cash out.';
          publish();
          if (typeof sfx !== 'undefined') sfx.chip();
          if (picks === 20){ api.finish(picks); }
        }
      };
      grid.appendChild(b);
    }

    const btn = document.getElementById('mp-action');
    if (btn){
      btn.textContent = 'Cash out';
      btn.disabled = false;
      btn.onclick = () => {
        if (dead) return;
        dead = true;
        btn.disabled = true;
        hint.textContent = 'Cashed out on ' + picks + ' gems.';
        grid.querySelectorAll('.mp-tile').forEach(x => x.disabled = true);
        publish();
        api.finish(picks);
      };
    }

    hint.textContent = 'Five mines. Bank more gems than anyone else.';
    publish();
  },

  stop(){}
};

/* ================================================================
   ROCK PAPER SCISSORS — simultaneous, revealed together
   ================================================================ */
MPGAMES.rps = {
  name:'Rock Paper Scissors', minPlayers:2, maxPlayers:6, mode:'solo',
  blurb:'Everyone throws at once. Most wins across the table takes it.',

  main(el){
    el.innerHTML =
      '<div class="mp-rps">' +
        '<div class="mp-hint" id="mpr-hint">Waiting for the round…</div>' +
        '<div class="mp-throws" id="mpr-pick">' +
          ['rock','paper','scissors'].map(k =>
            '<button class="mp-throw" data-k="' + k + '">' +
            ({rock:'✊',paper:'✋',scissors:'✌️'})[k] +
            '<small>' + k + '</small></button>').join('') +
        '</div>' +
      '</div>';
  },

  mini(el, p){
    const t = p.board && p.board.k;
    el.innerHTML = '<div class="mp-mini-throw">' +
      (p.done ? ({rock:'✊',paper:'✋',scissors:'✌️'})[t] || '?' : '<span class="wait">…</span>') +
      '</div>';
  },

  start(api){
    const hint = document.getElementById('mpr-hint');
    const wrap = document.getElementById('mpr-pick');
    if (!wrap) return api.finish(0);
    let picked = null;

    hint.textContent = 'Throw. Everyone reveals together.';
    wrap.querySelectorAll('.mp-throw').forEach(b => {
      b.onclick = () => {
        if (picked) return;
        picked = b.dataset.k;
        wrap.querySelectorAll('.mp-throw').forEach(x => {
          x.disabled = true;
          x.classList.toggle('on', x === b);
        });
        api.publish({ board:{ k:picked }, action:'thrown' });
        hint.textContent = 'Locked in — waiting on the rest.';

        /* score once everyone has thrown: a point per opponent beaten */
        const settle = () => {
          const ps = api.players().filter(p => p.uid !== api.me());
          if (!ps.length || !ps.every(p => p.board && p.board.k)){
            return setTimeout(settle, 250);
          }
          const beats = { rock:'scissors', paper:'rock', scissors:'paper' };
          let pts = 0;
          ps.forEach(p => { if (beats[picked] === p.board.k) pts++; });
          hint.textContent = 'Beat ' + pts + ' of ' + ps.length + '.';
          api.finish(pts);
        };
        settle();
      };
    });

    /* nobody should be able to stall the table forever */
    setTimeout(() => { if (!picked) api.finish(-1); }, 12000);
  },

  stop(){}
};

})();
