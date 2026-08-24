/* ================================================================
   MULTIPLAYER ADAPTERS — part two

   The shared-spectacle games: one wheel, one race, one board, and
   everybody's stake riding on it at the same time. Nothing resolves
   instantly — the animation plays out and then the pot is settled.
   ================================================================ */
(function(){
'use strict';

const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $$ = s => document.querySelector(s);
const RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

/* ================================================================
   ROULETTE — one wheel, everyone's chips on the same felt
   ================================================================ */
MPGAMES.roulette = {
  name:'Roulette', blurb:'One wheel. Everyone bets on the same felt.',
  minPlayers:2, maxPlayers:8,
  settings:[
    { key:'betTime', label:'Betting window', type:'select', def:15,
      options:[{v:10,t:'10 seconds'},{v:15,t:'15 seconds'},{v:25,t:'25 seconds'}] }
  ],

  main(el0){
    el0.innerHTML =
      '<div class="mp-roul">' +
        '<div class="mp-hint" id="mpr-hint">Place your chips.</div>' +
        '<div class="mp-roul-top">' +
          '<canvas id="mpr-wheel" width="200" height="200"></canvas>' +
          '<div class="mp-roul-num" id="mpr-num">—</div>' +
        '</div>' +
        '<div class="mp-felt" id="mpr-felt"></div>' +
        '<div class="mp-outs" id="mpr-outs"></div>' +
      '</div>';

    const felt = $$('#mpr-felt');
    let h = '<button class="mp-rn zero" data-b="n0">0</button>';
    for (let n = 1; n <= 36; n++)
      h += '<button class="mp-rn ' + (RED.includes(n)?'red':'blk') + '" data-b="n'+n+'">'+n+'</button>';
    felt.innerHTML = h;
    $$('#mpr-outs').innerHTML =
      [['red','Red'],['blk','Black'],['odd','Odd'],['even','Even'],
       ['low','1–18'],['high','19–36'],['d1','1st 12'],['d2','2nd 12'],['d3','3rd 12']]
      .map(([k,t]) => '<button class="mp-rout" data-b="'+k+'">'+t+'</button>').join('');
  },

  mini(el0, p){
    const bets = (p.board && p.board.b) || {};
    const keys = Object.keys(bets);
    el0.innerHTML = '<div class="mp-mini-bets">' +
      (keys.length ? keys.slice(0,6).map(k =>
        '<span class="mp-chip">' + esc(k.replace('n','')) + '</span>').join('') : '<span class="wait">no bets</span>') +
      '</div>';
  },

  start(api){
    const secs = Number(api.set('betTime')) || 15;
    const hint = $$('#mpr-hint'), numEl = $$('#mpr-num');
    const bets = {};
    let locked = false;

    const put = k => {
      if (locked) return;
      bets[k] = (bets[k]||0) + 1;
      document.querySelectorAll('[data-b="'+k+'"]').forEach(b => {
        b.classList.add('has');
        b.dataset.n = bets[k];
      });
      api.publish({ board:{ b:bets }, action:Object.keys(bets).length + ' bets' });
      if (typeof sfx !== 'undefined') sfx.chip();
    };
    document.querySelectorAll('#mpr-felt .mp-rn, #mpr-outs .mp-rout')
      .forEach(b => b.onclick = () => put(b.dataset.b));

    /* betting window, then the wheel actually spins */
    let left = secs;
    hint.textContent = 'Betting closes in ' + left + 's';
    const tick = setInterval(() => {
      left--;
      hint.textContent = left > 0 ? 'Betting closes in ' + left + 's' : 'No more bets.';
      if (left <= 0){ clearInterval(tick); locked = true; spin(); }
    }, 1000);

    function spin(){
      const r = api.shared();
      const n = Math.floor(r()*37);
      const cv = $$('#mpr-wheel'), ctx = cv.getContext('2d');
      const order = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
      let ang = 0;
      const t0 = performance.now();
      const draw = () => {
        const R = 100;
        ctx.clearRect(0,0,200,200);
        ctx.save(); ctx.translate(R,R); ctx.rotate(ang);
        order.forEach((v,i) => {
          const a0 = i/37*Math.PI*2, a1 = (i+1)/37*Math.PI*2;
          ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,R-4,a0,a1); ctx.closePath();
          ctx.fillStyle = v===0 ? '#12885B' : RED.includes(v) ? '#A5242C' : '#141C2A';
          ctx.fill();
        });
        ctx.restore();
      };
      const step = now => {
        const k = Math.min(1,(now-t0)/4200);
        ang = (1-Math.pow(1-k,3.5)) * (10*Math.PI*2);
        draw();
        if (k < 1) requestAnimationFrame(step);
        else {
          numEl.textContent = n;
          numEl.className = 'mp-roul-num ' + (n===0?'green':RED.includes(n)?'red':'blk');
          document.querySelectorAll('[data-b="n'+n+'"]').forEach(b => b.classList.add('hit'));

          /* score = units won, so the biggest winner takes the pot */
          let units = 0;
          Object.keys(bets).forEach(k2 => {
            const c = bets[k2];
            const hit =
              k2 === 'n'+n ? 36 :
              n === 0 ? 0 :
              k2==='red'  ? (RED.includes(n)?2:0) :
              k2==='blk'  ? (!RED.includes(n)?2:0) :
              k2==='odd'  ? (n%2?2:0) :
              k2==='even' ? (n%2===0?2:0) :
              k2==='low'  ? (n<=18?2:0) :
              k2==='high' ? (n>=19?2:0) :
              k2==='d1'   ? (n<=12?3:0) :
              k2==='d2'   ? (n>=13&&n<=24?3:0) :
              k2==='d3'   ? (n>=25?3:0) : 0;
            units += c * hit;
          });
          const staked = Object.values(bets).reduce((a,b)=>a+b,0);
          hint.textContent = n + ' — you returned ' + units + ' of ' + staked + ' units.';
          if (typeof sfx !== 'undefined') units > staked ? sfx.win() : sfx.lose();
          setTimeout(() => api.finish(units), 1200);
        }
      };
      draw(); requestAnimationFrame(step);
    }
  }
};

/* ================================================================
   HORSE RACE — one race, everyone picks a runner
   ================================================================ */
MPGAMES.horse = {
  name:'Horse Race', blurb:'One race. Pick a runner and watch it out.',
  minPlayers:2, maxPlayers:6,
  settings:[
    { key:'runners', label:'Runners', type:'select', def:5,
      options:[{v:4,t:'4'},{v:5,t:'5'},{v:6,t:'6'}] }
  ],

  main(el0){
    el0.innerHTML = '<div class="mp-race"><div class="mp-hint" id="mpq-hint">Pick your runner.</div>' +
      '<div class="mp-track" id="mpq-track"></div></div>';
  },

  mini(el0, p){
    el0.innerHTML = '<div class="mp-mini-num">' + ((p.board && p.board.h) ? '#'+p.board.h : '…') + '</div>' +
      '<div class="mp-mini-line">runner</div>';
  },

  start(api){
    const N = Number(api.set('runners')) || 5;
    const track = $$('#mpq-track'), hint = $$('#mpq-hint');
    const NAMES = ['Bolt','Rascal','Comet','Dizzy','Tycoon','Nutmeg'];
    let mine = null, running = false;

    track.innerHTML = Array.from({length:N}, (_,i) =>
      '<div class="mp-lane" data-h="'+(i+1)+'">' +
        '<button class="mp-pick">#'+(i+1)+' '+NAMES[i]+'</button>' +
        '<div class="mp-runner">🐎</div>' +
      '</div>').join('');

    track.querySelectorAll('.mp-lane').forEach(lane => {
      lane.querySelector('.mp-pick').onclick = () => {
        if (mine) return;
        mine = +lane.dataset.h;
        track.querySelectorAll('.mp-lane').forEach(l => l.classList.toggle('mine', l===lane));
        track.querySelectorAll('.mp-pick').forEach(b => b.disabled = true);
        api.publish({ board:{ h:mine }, action:'backed #'+mine });
        hint.textContent = 'Backed #' + mine + ' — waiting for the gate.';
        waitAll();
      };
    });

    function waitAll(){
      if (running) return;
      const ps = api.players();
      if (!ps.every(p => p.board && p.board.h)) return setTimeout(waitAll, 220);
      running = true;
      race();
    }

    function race(){
      const r = api.shared();
      /* per-horse pace drawn from the shared seed, so every screen
         shows the identical race rather than each simulating its own */
      const pace = Array.from({length:N}, () => 0.55 + r()*0.5);
      const pos = new Array(N).fill(0);
      const lanes = [...track.querySelectorAll('.mp-lane')];
      hint.textContent = 'They\'re off!';
      const t0 = performance.now();

      const step = now => {
        const t = (now - t0)/1000;
        let done = -1;
        pos.forEach((_,i) => {
          pos[i] = Math.min(100, t * pace[i] * 26 + Math.sin(t*3+i)*1.2);
          lanes[i].querySelector('.mp-runner').style.left = pos[i] + '%';
          if (pos[i] >= 100 && done < 0) done = i;
        });
        if (done < 0) return requestAnimationFrame(step);

        const winner = pos.indexOf(Math.max.apply(null,pos)) + 1;
        lanes[winner-1].classList.add('won');
        const ok = winner === mine;
        hint.textContent = '#' + winner + ' ' + NAMES[winner-1] + ' takes it' + (ok ? ' — that\'s yours.' : '.');
        if (typeof sfx !== 'undefined') ok ? sfx.win() : sfx.lose();
        setTimeout(() => api.finish(ok ? 1 : 0), 1100);
      };
      requestAnimationFrame(step);
    }
    setTimeout(() => { if (!mine){ mine = 1; api.publish({ board:{h:1} }); waitAll(); } }, 12000);
  }
};

/* ================================================================
   PLINKO — same board, everyone's ball drops together
   ================================================================ */
MPGAMES.plinko = {
  name:'Plinko', blurb:'Same board, all balls dropped together.',
  minPlayers:2, maxPlayers:6,
  settings:[
    { key:'rows', label:'Rows', type:'select', def:12,
      options:[{v:8,t:'8'},{v:12,t:'12'},{v:16,t:'16'}] }
  ],

  main(el0){
    el0.innerHTML = '<div class="mp-plinko"><div class="mp-hint" id="mpp-hint">Dropping…</div>' +
      '<canvas id="mpp-c" width="600" height="420"></canvas></div>';
  },

  mini(el0, p){
    el0.innerHTML = '<div class="mp-mini-num">' + ((p.board && p.board.m != null) ? p.board.m+'×' : '…') + '</div>' +
      '<div class="mp-mini-line">multiplier</div>';
  },

  start(api){
    const rows = Number(api.set('rows')) || 12;
    const cv = $$('#mpp-c'), ctx = cv.getContext('2d'), hint = $$('#mpp-hint');
    const W = 600, H = 420, top = 30, slotH = 34;
    const gapY = (H-top-slotH-10)/rows, gapX = Math.min(gapY*1.15,(W-60)/(rows+1));

    const pegs = [];
    for (let r0=0;r0<rows;r0++){
      const c=r0+3, y=top+r0*gapY, sp=(c-1)*gapX;
      for (let i=0;i<c;i++) pegs.push({x:W/2-sp/2+i*gapX,y});
    }
    const bottom = pegs.slice(-(rows+2));
    const slots = [];
    for (let i=0;i<bottom.length-1;i++) slots.push({x0:bottom[i].x,x1:bottom[i+1].x});
    const table = slots.map((_,i) => {
      const mid=(i-(slots.length-1)/2)/((slots.length-1)/2);
      return Math.round((0.4 + Math.pow(Math.abs(mid),3)*28)*10)/10;
    });

    /* one ball per player, all from the shared seed so everyone sees
       the same drops in the same places */
    const ps = api.players();
    const balls = ps.map((p,idx) => {
      const r = api.rng('plinko-' + p.uid);
      return { uid:p.uid, mine:p.uid===api.me(),
               x:W/2+(r()-0.5)*12, y:12, vx:(r()-0.5)*1.3, vy:0, r, done:false, slot:null };
    });

    let settled = 0;
    const step = () => {
      ctx.clearRect(0,0,W,H);
      ctx.fillStyle='rgba(140,180,255,.4)';
      pegs.forEach(g => { ctx.beginPath(); ctx.arc(g.x,g.y,3,0,7); ctx.fill(); });
      slots.forEach((s,i) => {
        ctx.fillStyle = 'rgba(74,159,216,'+(0.12+Math.min(0.5,table[i]/30))+')';
        ctx.fillRect(s.x0+1,H-slotH,s.x1-s.x0-2,slotH-4);
        ctx.fillStyle='#cfe3f5'; ctx.font='600 10px monospace'; ctx.textAlign='center';
        ctx.fillText(table[i]+'×',(s.x0+s.x1)/2,H-slotH+20);
      });

      balls.forEach(b => {
        if (!b.done){
          b.vy += 0.4; b.x += b.vx; b.y += b.vy;
          for (const g of pegs){
            const dx=b.x-g.x, dy=b.y-g.y, m=9;
            if (dx*dx+dy*dy<m*m){
              const d=Math.hypot(dx,dy)||.01, nx=dx/d, ny=dy/d;
              b.x=g.x+nx*m; b.y=g.y+ny*m;
              const dot=b.vx*nx+b.vy*ny;
              b.vx=(b.vx-2*dot*nx)*.6; b.vy=(b.vy-2*dot*ny)*.6;
              b.vx += (b.r()-0.5)*1.2;
              break;
            }
          }
          if (b.x<6){b.x=6;b.vx=Math.abs(b.vx)*.6;}
          if (b.x>W-6){b.x=W-6;b.vx=-Math.abs(b.vx)*.6;}
          if (b.y > H-slotH-6){
            let idx = slots.findIndex(s => b.x>=s.x0 && b.x<s.x1);
            if (idx<0) idx = b.x<W/2?0:slots.length-1;
            b.done = true; b.slot = idx; settled++;
            if (b.mine){
              api.publish({ board:{ m:table[idx] }, action:table[idx]+'×' });
              hint.textContent = 'Landed on ' + table[idx] + '×';
              if (typeof sfx !== 'undefined') sfx.chip();
            }
          }
        }
        ctx.beginPath();
        ctx.arc(b.x, Math.min(b.y, H-slotH-6), b.mine?7:5, 0, 7);
        ctx.fillStyle = b.mine ? '#FFC93C' : 'rgba(200,220,240,.7)';
        ctx.fill();
      });

      if (settled < balls.length) requestAnimationFrame(step);
      else {
        const me = balls.find(b => b.mine);
        setTimeout(() => api.finish(me ? table[me.slot] : 0), 900);
      }
    };
    hint.textContent = 'Balls away.';
    requestAnimationFrame(step);
  }
};

/* ================================================================
   CASE OPENING — everyone opens together, best pull wins
   ================================================================ */
MPGAMES.cases = {
  name:'Case Opening', blurb:'Everyone opens at once. Best pull takes the pot.',
  minPlayers:2, maxPlayers:6,
  settings:[
    { key:'tier', label:'Case', type:'select', def:'field',
      options:[{v:'starter',t:'Starter'},{v:'field',t:'Field'},{v:'vault',t:'Vault'}] }
  ],

  main(el0){
    el0.innerHTML = '<div class="mp-case"><div class="mp-hint" id="mpc2-hint">Opening…</div>' +
      '<div class="mp-reel-window"><div class="mp-reel" id="mpc2-reel"></div><div class="mp-reel-mark"></div></div>' +
      '<div class="mp-case-out" id="mpc2-out">—</div></div>';
  },

  mini(el0, p){
    el0.innerHTML = '<div class="mp-mini-num">' + ((p.board && p.board.m!=null) ? p.board.m+'×' : '…') + '</div>' +
      '<div class="mp-mini-line">pull</div>';
  },

  start(api){
    const TIERS = {
      starter:[0,0.5,1,2,5,15,50],
      field:  [0,0.5,1,2,5,15,50,100],
      vault:  [0,0.5,1,2,5,15,50,100,500]
    };
    const pool = TIERS[api.set('tier')] || TIERS.field;
    const r = api.rng('case-' + api.me());
    const weights = pool.map((m,i) => 1/Math.pow(2.4,i));
    const total = weights.reduce((a,b)=>a+b,0);
    let pick = pool[0], acc = r()*total;
    for (let i=0;i<pool.length;i++){ acc -= weights[i]; if (acc<=0){ pick = pool[i]; break; } }

    const reel = $$('#mpc2-reel'), out = $$('#mpc2-out'), hint = $$('#mpc2-hint');
    const strip = [];
    for (let i=0;i<40;i++) strip.push(pool[Math.floor(r()*pool.length)]);
    strip.push(pick);
    reel.innerHTML = strip.map(m => '<span class="mp-item m'+(m>=50?'hi':m>=5?'mid':'lo')+'">'+m+'×</span>').join('');
    reel.style.transition = 'none'; reel.style.transform = 'translateX(0)';
    void reel.offsetWidth;
    reel.style.transition = 'transform 4s cubic-bezier(.12,.85,.2,1)';
    reel.style.transform = 'translateX(-' + (strip.length-1)*86 + 'px)';

    hint.textContent = 'Rolling…';
    setTimeout(() => {
      out.textContent = pick + '×';
      out.className = 'mp-case-out ' + (pick>=50?'hi':pick>=5?'mid':'lo');
      hint.textContent = 'Pulled ' + pick + '×';
      api.publish({ board:{ m:pick }, action:pick+'×' });
      if (typeof sfx !== 'undefined') pick >= 5 ? sfx.win() : sfx.lose();
      setTimeout(() => api.finish(pick), 800);
    }, 4100);
  }
};

/* ================================================================
   LUCKY WHEEL — one wheel, everyone rides the same spin
   ================================================================ */
MPGAMES.wheel = {
  name:'Lucky Wheel', blurb:'One spin, everyone on it.',
  minPlayers:2, maxPlayers:8,
  settings:[
    { key:'risk', label:'Risk', type:'select', def:'medium',
      options:[{v:'low',t:'Low'},{v:'medium',t:'Medium'},{v:'high',t:'High'}] }
  ],

  main(el0){
    el0.innerHTML = '<div class="mp-lw"><div class="mp-hint" id="mpw-hint">Pick a segment colour.</div>' +
      '<canvas id="mpw-c" width="260" height="260"></canvas>' +
      '<div class="mp-lw-picks" id="mpw-picks"></div></div>';
  },

  mini(el0, p){
    el0.innerHTML = '<div class="mp-mini-num">' + ((p.board && p.board.s!=null) ? p.board.s : '…') + '</div>' +
      '<div class="mp-mini-line">segment</div>';
  },

  start(api){
    const RISK = { low:[1.2,1.5,2,0], medium:[1.5,2,3,0], high:[2,5,10,0] };
    const vals = RISK[api.set('risk')] || RISK.medium;
    const SEG = 12;
    const cv = $$('#mpw-c'), ctx = cv.getContext('2d'), hint = $$('#mpw-hint');
    const picks = $$('#mpw-picks');
    let mine = null, spinning = false, ang = 0;

    const segVal = i => vals[i % vals.length];
    picks.innerHTML = vals.map((v,i) =>
      '<button class="mp-lwb" data-i="'+i+'">'+v+'×</button>').join('');

    const draw = () => {
      ctx.clearRect(0,0,260,260);
      ctx.save(); ctx.translate(130,130); ctx.rotate(ang);
      for (let i=0;i<SEG;i++){
        const a0=i/SEG*Math.PI*2, a1=(i+1)/SEG*Math.PI*2, v=segVal(i);
        ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,124,a0,a1); ctx.closePath();
        ctx.fillStyle = v===0 ? '#243040' : v>=5 ? '#C08A2A' : v>=2 ? '#2E7DD1' : '#35566F';
        ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,.12)'; ctx.stroke();
      }
      ctx.restore();
    };
    draw();

    picks.querySelectorAll('.mp-lwb').forEach(b => {
      b.onclick = () => {
        if (mine !== null) return;
        mine = +b.dataset.i;
        picks.querySelectorAll('.mp-lwb').forEach(x => { x.disabled=true; x.classList.toggle('on',x===b); });
        api.publish({ board:{ s:vals[mine]+'×' }, action:'on '+vals[mine]+'×' });
        hint.textContent = 'Riding ' + vals[mine] + '× — waiting.';
        waitAll();
      };
    });

    function waitAll(){
      if (spinning) return;
      const ps = api.players();
      if (!ps.every(p => p.board && p.board.s)) return setTimeout(waitAll, 220);
      spinning = true;
      const r = api.shared();
      const land = Math.floor(r()*SEG);
      const t0 = performance.now();
      const to = 8*Math.PI*2 + (SEG-land)/SEG*Math.PI*2;
      const step = now => {
        const k = Math.min(1,(now-t0)/4000);
        ang = (1-Math.pow(1-k,4))*to;
        draw();
        if (k<1) requestAnimationFrame(step);
        else {
          const got = segVal(land);
          const ok = got === vals[mine];
          hint.textContent = 'Landed on ' + got + '×' + (ok ? ' — yours.' : '.');
          if (typeof sfx !== 'undefined') ok ? sfx.win() : sfx.lose();
          setTimeout(() => api.finish(ok ? got : 0), 900);
        }
      };
      requestAnimationFrame(step);
    }
    setTimeout(() => { if (mine===null){ mine=0; api.publish({board:{s:vals[0]+'×'}}); waitAll(); } }, 14000);
  }
};

/* ================================================================
   SLOTS — everyone pulls at once, best line wins
   ================================================================ */
MPGAMES.slots = {
  name:'Slots', blurb:'Everyone pulls together. Best line takes the pot.',
  minPlayers:2, maxPlayers:6,
  settings:[],

  main(el0){
    el0.innerHTML = '<div class="mp-slots"><div class="mp-hint" id="mps-hint">Spinning…</div>' +
      '<div class="mp-reels"><div class="mp-sreel" id="mps-0"></div>' +
      '<div class="mp-sreel" id="mps-1"></div><div class="mp-sreel" id="mps-2"></div></div>' +
      '<div class="mp-slot-out" id="mps-out">—</div></div>';
  },

  mini(el0, p){
    const s = (p.board && p.board.s) || '';
    el0.innerHTML = '<div class="mp-mini-reel">' + (s ? esc(s) : '…') + '</div>' +
      '<div class="mp-mini-line">' + (p.board && p.board.m != null ? p.board.m+'×' : '') + '</div>';
  },

  start(api){
    const SYM = ['💎','7️⃣','🔔','🍒','🍋','⭐'];
    const PAY = { '💎':40,'7️⃣':18,'🔔':9,'🍒':5,'🍋':3,'⭐':2 };
    const r = api.rng('slots-' + api.me());
    const out = [0,1,2].map(() => SYM[Math.floor(r()*SYM.length)]);

    [0,1,2].forEach(i => {
      const reel = document.getElementById('mps-'+i);
      const list = Array.from({length:16}, () => SYM[Math.floor(Math.random()*SYM.length)]);
      list.push(out[i]);
      reel.innerHTML = list.map(s => '<span>'+s+'</span>').join('');
      reel.style.transition='none'; reel.style.transform='translateY(0)';
      void reel.offsetWidth;
      reel.style.transition = 'transform ' + (1.4+i*0.4) + 's cubic-bezier(.16,.86,.24,1)';
      reel.style.transform = 'translateY(-' + (list.length-1)*84 + 'px)';
    });

    setTimeout(() => {
      const [a,b,c] = out;
      const m = (a===b&&b===c) ? PAY[a] : (a===b||b===c||a===c) ? 1.5 : 0;
      $$('#mps-out').textContent = m ? m+'×' : 'no line';
      $$('#mps-hint').textContent = m ? 'Paid ' + m + '×' : 'Nothing.';
      api.publish({ board:{ s:out.join(''), m }, action: m?m+'×':'no line' });
      if (typeof sfx !== 'undefined') m ? sfx.win() : sfx.lose();
      setTimeout(() => api.finish(m), 700);
    }, 1400 + 2*400 + 200);
  }
};

/* ================================================================
   KENO — own card, one shared draw
   ================================================================ */
MPGAMES.keno = {
  name:'Keno', blurb:'Your card, one shared draw. Most hits wins.',
  minPlayers:2, maxPlayers:6,
  settings:[
    { key:'spots', label:'Numbers to pick', type:'select', def:6,
      options:[{v:4,t:'4'},{v:6,t:'6'},{v:8,t:'8'},{v:10,t:'10'}] }
  ],

  main(el0){
    el0.innerHTML = '<div class="mp-keno"><div class="mp-hint" id="mpk-hint">Pick your numbers.</div>' +
      '<div class="mp-kgrid" id="mpk-grid"></div></div>';
  },

  mini(el0, p){
    el0.innerHTML = '<div class="mp-mini-num">' + ((p.board && p.board.h != null) ? p.board.h : (p.board&&p.board.n)||0) + '</div>' +
      '<div class="mp-mini-line">' + (p.board && p.board.h != null ? 'hits' : 'picked') + '</div>';
  },

  start(api){
    const need = Number(api.set('spots')) || 6;
    const grid = $$('#mpk-grid'), hint = $$('#mpk-hint');
    const picks = new Set();
    let drawn = false;

    grid.innerHTML = Array.from({length:40}, (_,i) =>
      '<button class="mp-kb" data-n="'+(i+1)+'">'+(i+1)+'</button>').join('');

    grid.querySelectorAll('.mp-kb').forEach(b => {
      b.onclick = () => {
        if (drawn) return;
        const n = +b.dataset.n;
        if (picks.has(n)){ picks.delete(n); b.classList.remove('pick'); }
        else { if (picks.size >= need) return; picks.add(n); b.classList.add('pick'); }
        hint.textContent = picks.size + ' of ' + need + ' picked.';
        api.publish({ board:{ n:picks.size }, action:picks.size+'/'+need });
        if (picks.size === need) waitAll();
      };
    });

    function waitAll(){
      if (drawn) return;
      const ps = api.players();
      if (!ps.every(p => p.board && p.board.n >= need)) return setTimeout(waitAll, 250);
      drawn = true;
      const r = api.shared();
      const pool = Array.from({length:40},(_,i)=>i+1);
      for (let i=pool.length-1;i>0;i--){ const j=Math.floor(r()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
      const draw = pool.slice(0,10);

      let k = 0, hits = 0;
      hint.textContent = 'Drawing…';
      const t = setInterval(() => {
        const n = draw[k];
        const cell = grid.querySelector('[data-n="'+n+'"]');
        if (picks.has(n)){ cell.classList.add('hit'); hits++; if (typeof sfx!=='undefined') sfx.chip(); }
        else cell.classList.add('drawn');
        if (++k >= 10){
          clearInterval(t);
          hint.textContent = hits + ' of ' + need + ' matched.';
          api.publish({ board:{ h:hits, n:picks.size }, action:hits+' hits' });
          if (typeof sfx !== 'undefined') hits >= need/2 ? sfx.win() : sfx.lose();
          setTimeout(() => api.finish(hits), 700);
        }
      }, 320);
    }

    setTimeout(() => {
      if (picks.size < need){
        while (picks.size < need){
          const n = 1+Math.floor(Math.random()*40);
          if (!picks.has(n)){ picks.add(n); grid.querySelector('[data-n="'+n+'"]').classList.add('pick'); }
        }
        api.publish({ board:{ n:picks.size } });
        waitAll();
      }
    }, 18000);
  }
};

/* ================================================================
   CHICKEN CROSS — own road, live lane progress
   ================================================================ */
MPGAMES.chicken = {
  name:'Chicken Cross', blurb:'Cross further than anyone without getting flattened.',
  minPlayers:2, maxPlayers:6,
  settings:[
    { key:'diff', label:'Traffic', type:'select', def:'medium',
      options:[{v:'easy',t:'Light'},{v:'medium',t:'Normal'},{v:'hard',t:'Heavy'}] },
    { key:'lanes', label:'Lanes', type:'select', def:8,
      options:[{v:6,t:'6'},{v:8,t:'8'},{v:10,t:'10'}] }
  ],

  main(el0){
    el0.innerHTML = '<div class="mp-cx"><div class="mp-hint" id="mpx-hint">Cross when ready.</div>' +
      '<div class="mp-road" id="mpx-road"></div></div>';
  },

  mini(el0, p, api){
    const L = Number(api ? api.set('lanes') : 8) || 8;
    const at = (p.board && p.board.l) || 0;
    let h = '<div class="mp-mini-road">';
    for (let i=0;i<L;i++) h += '<i class="'+(i<at?'done':'')+(p.board&&p.board.dead&&i===at?' dead':'')+'"></i>';
    el0.innerHTML = h + '</div><div class="mp-mini-line">lane ' + at + '</div>';
  },

  start(api){
    const P = { easy:0.94, medium:0.88, hard:0.8 }[api.set('diff')] || 0.88;
    const L = Number(api.set('lanes')) || 8;
    const r = api.rng('cx-' + api.me());
    const road = $$('#mpx-road'), hint = $$('#mpx-hint');

    road.innerHTML = Array.from({length:L}, (_,i) =>
      '<div class="mp-cxlane" data-i="'+i+'"><span class="mp-car">🚗</span></div>').join('') +
      '<div class="mp-chick" id="mpx-chick">🐔</div>';

    let lane = 0, dead = false;
    const chick = $$('#mpx-chick');
    const paint = () => {
      road.querySelectorAll('.mp-cxlane').forEach((l,i) => l.classList.toggle('done', i<lane));
      chick.style.left = Math.min(96, lane*(100/L)) + '%';
      api.publish({ board:{ l:lane, dead }, progress:Math.min(99,lane*(100/L)),
                    action: dead ? 'hit on '+(lane+1) : 'lane '+lane });
    };
    paint();

    const btn = $$('#mp-action');
    const stepFwd = () => {
      if (dead) return;
      if (r() < P - lane*0.01){
        lane++;
        chick.classList.remove('hop'); void chick.offsetWidth; chick.classList.add('hop');
        if (typeof sfx !== 'undefined') sfx.chip();
        hint.textContent = 'Lane ' + lane + ' of ' + L + '.';
        if (lane >= L){ dead = true; paint(); api.finish(lane); return; }
      } else {
        dead = true;
        road.querySelectorAll('.mp-cxlane')[lane].classList.add('crash');
        chick.classList.add('dead');
        hint.textContent = 'Flattened in lane ' + (lane+1) + '.';
        if (typeof sfx !== 'undefined') sfx.lose();
        paint(); api.finish(lane); return;
      }
      paint();
    };

    if (btn){ btn.textContent = 'Cross a lane'; btn.disabled = false; btn.onclick = stepFwd; }
    road.onclick = stepFwd;
  }
};

})();
