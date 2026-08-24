/* ================================================================
   JARVISBET — REAL-TIME PVP

   Loaded after the main game. Nothing here touches solo play; the
   solo modules are untouched and still run exactly as before.

   Transport is the Realtime Database. A room is one document that
   every client watches, so everyone sees the same round tick over at
   the same moment rather than each playing alone and comparing notes
   afterwards.

   ROOM LIFECYCLE
     open      players join, ready up, wager is locked to the room
     countdown 3, 2, 1 — nobody can change anything
     live      the round is running; players publish their board state
     settle    results shown, pot paid, tie triggers another round
   ================================================================ */
(function(){
'use strict';

const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ================================================================
   ENGINE
   ================================================================ */
const MP2 = {
  db:null, room:null, ref:null, sub:null, id:null,
  nonce:null, seed:null, settled:false, adapter:null, tickTimer:null,

  ready(){ return !!(this.db && typeof Cloud !== 'undefined' && Cloud.on()); },
  me(){ return Cloud.uid; },
  isHost(){ return this.room && this.room.host === this.me(); },

  init(){
    if (this.db || typeof firebase === 'undefined') return;
    try{ this.db = firebase.database(); }catch(e){ this.db = null; }
  },

  /* ---- fair shared randomness ---------------------------------
     Every player commits a hashed secret before anyone reveals, so
     the round seed can't be steered by whoever rolls first. */
  async sha(s){
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join('');
  },
  newNonce(){
    const a = new Uint8Array(16); crypto.getRandomValues(a);
    return [...a].map(b => b.toString(16).padStart(2,'0')).join('');
  },
  rng(seed, salt){
    let h = 2166136261;
    const s = seed + '|' + (salt || '');
    for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    let a = h >>> 0;
    return function(){
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  },

  code(){
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({length:5}, () => A[Math.floor(Math.random()*A.length)]).join('');
  },

  /* ---- creating and joining ---- */
  async create(game, wager, isPrivate){
    this.init();
    if (!this.ready()){ toast('Sign in on the portal to play multiplayer.','lose'); return; }
    if (wager > state.balance){ toast('Multiplayer wagers use real balance only.','lose'); return; }

    const g = MPGAMES[game];
    const ref = this.db.ref('/mp/rooms').push();
    await ref.set({
      game, wager: round2(wager),
      host: this.me(),
      code: this.code(),
      priv: !!isPrivate,
      status: 'open',
      round: 0,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      maxPlayers: g.maxPlayers || 6,
      players: { [this.me()]: this.seatData() }
    });
    this.attach(ref.key);
  },

  seatData(){
    return {
      name: (Cloud.name || 'Player').slice(0,20),
      pic: (typeof safePic === 'function' ? safePic(Cloud.pic) : '') || '',
      ready:false, online:true, spectator:false,
      action:'', progress:0, score:null, done:false
    };
  },

  async joinById(id, asSpectator){
    this.init();
    if (!this.ready()){ toast('Sign in on the portal to play multiplayer.','lose'); return; }
    const ref = this.db.ref('/mp/rooms/' + id);
    const snap = await ref.once('value');
    const r = snap.val();
    if (!r){ toast('That room is gone.','lose'); return; }

    const seats = Object.keys(r.players || {}).length;
    const mine = (r.players || {})[this.me()];
    const spec = asSpectator || (r.status !== 'open' && !mine) || (seats >= (r.maxPlayers||6) && !mine);

    if (!spec && r.wager > state.balance){
      toast('That room wagers ' + fmt(r.wager) + ' — not enough real balance.','lose'); return;
    }
    const seat = this.seatData();
    seat.spectator = spec;
    await ref.child('players/' + this.me()).update(seat);
    this.attach(id);
    if (spec) toast('Joined as a spectator.','');
  },

  async joinByCode(code){
    this.init();
    if (!this.ready()) return toast('Sign in on the portal first.','lose');
    code = (code||'').toUpperCase().trim();
    if (code.length !== 5) return toast('Invite codes are five characters.','lose');
    const snap = await this.db.ref('/mp/rooms').orderByChild('code').equalTo(code).once('value');
    const val = snap.val();
    if (!val) return toast('No room with that code.','lose');
    this.joinById(Object.keys(val)[0]);
  },

  attach(id){
    this.detach();
    this.id = id;
    this.ref = this.db.ref('/mp/rooms/' + id);
    this.settled = false; this.nonce = null; this.seed = null;

    /* If the tab dies, the seat is marked offline rather than left
       looking alive forever — a dropped player must never freeze
       everyone else's round. */
    const meRef = this.ref.child('players/' + this.me());
    meRef.child('online').onDisconnect().set(false);
    meRef.child('online').set(true);

    this.sub = this.ref.on('value', s => {
      const prev = this.room;
      this.room = s.val();
      if (!this.room){ this.detach(); renderMP(); return; }
      this.drive(prev);
      renderMP();
    });
  },

  detach(){
    if (this.ref && this.sub) this.ref.off('value', this.sub);
    clearInterval(this.tickTimer);
    this.ref = null; this.sub = null; this.room = null; this.id = null;
    this.adapter = null; this.seed = null; this.settled = false;
  },

  async leave(){
    if (this.ref){
      const wasHost = this.isHost();
      const others = this.seats().filter(p => p.uid !== this.me());
      try{
        await this.ref.child('players/' + this.me()).remove();
        if (!others.length) await this.ref.remove();
        else if (wasHost) await this.ref.child('host').set(others[0].uid);  // host migration
      }catch(e){}
    }
    this.detach();
    renderMP();
  },

  /* ---- helpers ---- */
  seats(){
    const p = (this.room && this.room.players) || {};
    return Object.keys(p).map(uid => Object.assign({ uid }, p[uid]));
  },
  players(){ return this.seats().filter(p => !p.spectator); },
  actives(){ return this.players().filter(p => p.online !== false); },
  mySeat(){ return this.seats().find(p => p.uid === this.me()) || {}; },

  publish(patch){
    if (!this.ref) return;
    this.ref.child('players/' + this.me()).update(patch).catch(()=>{});
  },

  setReady(v){ this.publish({ ready: !!v }); },

  /* ---- the state machine, driven by the host ---- */
  async drive(prev){
    const r = this.room; if (!r) return;
    const changedStatus = !prev || prev.status !== r.status;

    if (r.status === 'open' && this.isHost()){
      const ps = this.actives();
      if (ps.length >= (MPGAMES[r.game].minPlayers || 2) && ps.every(p => p.ready)){
        await this.ref.update({ status:'countdown', startAt: Date.now() + 3200 });
      }
    }

    if (r.status === 'countdown'){
      if (changedStatus){
        clearInterval(this.tickTimer);
        this.tickTimer = setInterval(() => {
          renderMP();
          if (this.room && this.room.status === 'countdown' && Date.now() >= this.room.startAt){
            clearInterval(this.tickTimer);
            if (this.isHost()) this.beginRound();
          }
        }, 120);
      }
    }

    if (r.status === 'commit' && !this.mySeat().commit && !this.mySeat().spectator){
      this.nonce = this.newNonce();
      const c = await this.sha(this.nonce);
      this.publish({ commit: c });
    }

    if (r.status === 'commit' && this.isHost()){
      const ps = this.actives();
      if (ps.length && ps.every(p => p.commit)) await this.ref.update({ status:'reveal' });
    }

    if (r.status === 'reveal'){
      if (this.nonce && !this.mySeat().reveal) this.publish({ reveal: this.nonce });
      if (this.isHost()){
        const ps = this.actives();
        if (ps.length && ps.every(p => p.reveal)){
          const seed = await this.sha(ps.map(p => p.reveal).sort().join('|'));
          await this.ref.update({ status:'live', seed, liveAt: Date.now() });
        }
      }
    }

    if (r.status === 'live' && changedStatus) this.startLocal();

    if (r.status === 'live' && this.isHost()){
      const ps = this.actives().filter(p => !p.spectator);
      if (ps.length && ps.every(p => p.done)) await this.ref.update({ status:'settle' });
    }

    if (r.status === 'settle' && changedStatus) this.settle();
  },

  async beginRound(){
    /* wagers are taken here, so nobody can change a bet mid-round */
    await this.ref.update({ status:'commit', round: (this.room.round||0) + 1 });
  },

  startLocal(){
    const r = this.room;
    this.settled = false;
    if (this.mySeat().spectator){ renderMP(); return; }

    /* take the stake once the round genuinely begins */
    betCtx = { forced: 'mp-' + r.game };
    if (!placeBet(r.wager)){
      toast('Could not cover the wager — sitting this round out.','lose');
      this.publish({ spectator:true, done:true, score:null });
      return;
    }
    this.publish({ done:false, score:null, action:'playing', progress:0 });

    const api = this.api();
    this.adapter = MPGAMES[r.game];
    try{ this.adapter.start(api); }catch(e){ console.error(e); this.finish(0); }
  },

  api(){
    const self = this;
    return {
      room: () => self.room,
      me: () => self.me(),
      wager: () => self.room.wager,
      seat: () => self.mySeat(),
      players: () => self.players(),
      rng: salt => self.rng(self.room.seed || 'x', salt),
      shared: () => self.rng(self.room.seed || 'x', 'shared'),
      publish: p => self.publish(p),
      finish: s => self.finish(s),
      elapsed: () => Date.now() - (self.room.liveAt || Date.now())
    };
  },

  finish(score){
    this.publish({ done:true, score: score, action:'finished', progress:100 });
  },

  /* ---- results and payout ---- */
  async settle(){
    if (this.settled) return;
    this.settled = true;

    const r = this.room;
    const ps = this.players().filter(p => p.score != null);
    if (!ps.length) return;

    const top = Math.max.apply(null, ps.map(p => p.score));
    const winners = ps.filter(p => p.score === top);
    const pot = round2(r.wager * ps.length);
    const mine = this.mySeat();

    if (mine.spectator || mine.score == null){ /* nothing staked */ }
    else if (winners.length > 1){
      /* tie: everyone gets their wager back and the room replays */
      resolveRound(r.wager, null);
      toast('Tied on ' + top + ' — wagers returned, playing again.','');
    } else if (winners[0].uid === this.me()){
      resolveRound(pot, true);
      toast('You took the pot — ' + fmt(pot), 'win');
      if (typeof sfx !== 'undefined') sfx.win();
    } else {
      resolveRound(0, false);
      toast(winners[0].name + ' took the pot.','lose');
      if (typeof sfx !== 'undefined') sfx.lose();
    }

    if (this.isHost()){
      const tie = winners.length > 1;
      setTimeout(() => {
        if (!this.ref) return;
        const upd = { status:'open', lastWinner: tie ? null : winners[0].name, lastTie: tie };
        this.seats().forEach(p => {
          upd['players/'+p.uid+'/ready']    = tie ? true : false;   // ties replay immediately
          upd['players/'+p.uid+'/done']     = false;
          upd['players/'+p.uid+'/score']    = null;
          upd['players/'+p.uid+'/commit']   = null;
          upd['players/'+p.uid+'/reveal']   = null;
          upd['players/'+p.uid+'/action']   = '';
          upd['players/'+p.uid+'/progress'] = 0;
          upd['players/'+p.uid+'/board']    = null;
        });
        this.ref.update(upd);
      }, tie ? 2600 : 4200);
    }
  }
};

window.MP2 = MP2;
window.MPGAMES = {};
window.renderMP = () => {};   // replaced by the view file
})();
