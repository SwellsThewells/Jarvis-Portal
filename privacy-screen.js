/* =============================================================
   PRIVACY SCREEN  —  drop-in cover page

   Add one line to any page, just before </body>:

       <script src="privacy-screen.js"></script>

   WHAT THIS DOES
   Slams a boring corporate page over the top of yours, instantly,
   on any trigger you choose. Pauses audio and video while it's up.

   WHAT THIS DOES NOT DO
   It cannot detect screen sharing, screen recording, a second
   monitor, or somebody reading over your shoulder. No web page
   can. Screen capture happens below the browser, in the operating
   system, and nothing in a tab can see it. Anyone selling you
   "screenshare detection" in JavaScript is guessing from things
   like tab-blur, which fires all day when nobody is watching and
   stays silent through an actual Zoom call.

   It also does not hide anything from monitoring software on a
   managed laptop. That records the screen at the OS level and
   will capture whatever was showing before the cover appeared.

   Treat it as a fast curtain you pull yourself, not an alarm.
   ============================================================= */

(function () {
  'use strict';

  const CONFIG = {
    // ---- triggers ----
    hotkey:        'Escape',  // tap to cover, tap again to return
    panicChord:    true,      // three rapid taps of Shift also covers
    coverOnBlur:   false,     // clicking to another window/monitor covers (off: it
                              // fires constantly on a multi-monitor setup)
    coverOnHide:   true,      // switching tabs covers
    idleSeconds:   0,         // cover after N seconds untouched (0 = off)

    // ---- how you get back ----
    // Tapping the hotkey works, but it's obvious to anyone watching.
    // Clicking the logo this many times is quieter.
    logoClicks:    3,

    startCovered:  false,     // true = cover first, reveal on demand

    // ---- what the cover page says ----
    coverTitle: 'HotelNT',    // browser tab title while covered
    company: 'The Harrowgate Hotel',
    tagline: 'A quiet forty-two room house on the north shore, open year round. Rooms, rates and reservations below.',
  };

  /* ----------------------------------------------------------
     SHARING THE KEYBIND ACROSS PAGES

     The portal saves your settings to your account, but a page
     like a game has no Firebase on it and can't read that. So
     the portal also mirrors the key into browser storage, which
     every page on the same site can see. That makes the binding
     work everywhere on this device the moment you set it once.

     Signing in on another device and opening the portal there
     re-mirrors it, so it follows you without each page needing
     an account.
     ---------------------------------------------------------- */

  const KEY_STORE = 'jarvis.panicKey';
  const ON_STORE  = 'jarvis.panicEnabled';
  const BLUR_STORE = 'jarvis.panicOnBlur';

  function readStoredKey() {
    try {
      const k = window.localStorage.getItem(KEY_STORE);
      return k || null;
    } catch (e) {
      return null;   // private mode, or storage blocked
    }
  }

  function writeStoredKey(k) {
    try { window.localStorage.setItem(KEY_STORE, k); } catch (e) {}
  }

  let enabled = true;

  function readEnabled() {
    try {
      const v = window.localStorage.getItem(ON_STORE);
      return v === null ? true : v !== 'off';   // default on
    } catch (e) { return true; }
  }

  function writeEnabled(on) {
    try { window.localStorage.setItem(ON_STORE, on ? 'on' : 'off'); } catch (e) {}
  }

  function readBlur() {
    try { return window.localStorage.getItem(BLUR_STORE) === 'on'; }
    catch (e) { return false; }
  }
  function writeBlur(on) {
    try { window.localStorage.setItem(BLUR_STORE, on ? 'on' : 'off'); } catch (e) {}
  }

  const stored = readStoredKey();
  if (stored) CONFIG.hotkey = stored;
  enabled = readEnabled();
  CONFIG.coverOnBlur = readBlur();

  // another tab changed something — follow along without a reload
  window.addEventListener('storage', e => {
    if (e.key === KEY_STORE && e.newValue) CONFIG.hotkey = e.newValue;
    if (e.key === ON_STORE) {
      enabled = e.newValue !== 'off';
      if (!enabled) uncover();
    }
    if (e.key === BLUR_STORE) CONFIG.coverOnBlur = e.newValue === 'on';
  });

  /* ---------------------------------------------------------- */

  const el = document.createElement('div');
  el.id = 'privacy-screen';
  el.setAttribute('aria-hidden', 'true');

  const style = document.createElement('style');
  style.textContent = `
    #privacy-screen{
      position:fixed; inset:0; z-index:2147483647;
      display:none; overflow-y:auto;
      background:#fff; color:#1c2530;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
      -webkit-font-smoothing:antialiased;
    }
    #privacy-screen.up{ display:block; }
    #privacy-screen *{ box-sizing:border-box; }

    #ps-top{ border-bottom:1px solid #e3e8ee; background:#fff; }
    #ps-topin{ max-width:1080px; margin:0 auto; padding:18px 26px;
      display:flex; align-items:center; gap:30px; }
    #ps-logo{ display:flex; align-items:center; gap:10px; cursor:default;
      font-size:17px; font-weight:600; letter-spacing:-.01em; user-select:none; }
    #ps-mark{ width:26px; height:26px; border-radius:5px;
      background:linear-gradient(135deg,#a8946b,#6b5b3e); flex:none; }
    #ps-nav{ display:flex; gap:24px; margin-left:auto;
      font-size:14px; color:#5a6673; }
    #ps-nav span{ cursor:default; }
    #ps-cta{ background:#6b5b3e; color:#fff; padding:8px 16px;
      border-radius:5px; font-size:14px; }
    @media (max-width:720px){ #ps-nav{ display:none; } }

    #ps-hero{ max-width:1080px; margin:0 auto; padding:74px 26px 60px; }
    #ps-hero h1{ margin:0 0 18px; font-size:clamp(28px,4.4vw,44px);
      line-height:1.15; letter-spacing:-.02em; max-width:17ch; }
    #ps-hero p{ margin:0 0 30px; font-size:17px; line-height:1.6;
      color:#5a6673; max-width:56ch; }
    #ps-btns{ display:flex; gap:12px; flex-wrap:wrap; }
    .ps-b{ padding:12px 22px; border-radius:6px; font-size:15px; }
    .ps-b1{ background:#6b5b3e; color:#fff; }
    .ps-b2{ border:1px solid #ccd4de; color:#1c2530; }

    #ps-grid{ border-top:1px solid #e3e8ee; background:#f7f9fc; }
    #ps-gridin{ max-width:1080px; margin:0 auto; padding:56px 26px;
      display:grid; grid-template-columns:repeat(3,1fr); gap:34px; }
    @media (max-width:820px){ #ps-gridin{ grid-template-columns:1fr; gap:26px; } }
    .ps-card h3{ margin:0 0 9px; font-size:16px; }
    .ps-card p{ margin:0; font-size:14.5px; line-height:1.6; color:#5a6673; }

    #ps-strip{ border-top:1px solid #e3e8ee; }
    #ps-stripin{ max-width:1080px; margin:0 auto; padding:34px 26px;
      display:flex; gap:44px; flex-wrap:wrap; font-size:13px; color:#8a94a0; }
    #ps-stripin b{ display:block; font-size:22px; color:#1c2530; margin-bottom:3px; }

    #ps-foot{ border-top:1px solid #e3e8ee; background:#fff; }
    #ps-footin{ max-width:1080px; margin:0 auto; padding:26px;
      font-size:12.5px; color:#8a94a0;
      display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  `;

  el.innerHTML = `
    <div id="ps-top"><div id="ps-topin">
      <div id="ps-logo"><div id="ps-mark"></div><span id="ps-name"></span></div>
      <div id="ps-nav">
        <span>Rooms</span><span>Dining</span><span>The area</span>
        <span>Contact</span><span id="ps-cta">Check availability</span>
      </div>
    </div></div>

    <div id="ps-hero">
      <h1>Rooms overlooking the north shore.</h1>
      <p id="ps-tag"></p>
      <div id="ps-btns">
        <span class="ps-b ps-b1">Check availability</span>
        <span class="ps-b ps-b2">View rooms and rates</span>
      </div>
    </div>

    <div id="ps-grid"><div id="ps-gridin">
      <div class="ps-card"><h3>Garden single &nbsp;·&nbsp; from 96</h3>
        <p>One double bed, desk, ensuite shower. Ground floor with doors onto the walled garden. No lift access required.</p></div>
      <div class="ps-card"><h3>Shore double &nbsp;·&nbsp; from 134</h3>
        <p>King bed and a seating corner facing the water. Bath and shower. Second and third floors, lift served.</p></div>
      <div class="ps-card"><h3>Long room &nbsp;·&nbsp; from 178</h3>
        <p>Sleeps four across two rooms with a connecting door. Kettle, small fridge, and a cot on request at no charge.</p></div>
    </div></div>

    <div id="ps-strip"><div id="ps-stripin">
      <div><b>3:00 pm</b>Check-in from, late arrival by arrangement</div>
      <div><b>11:00 am</b>Check-out, bags may be left at reception</div>
      <div><b>42</b>Rooms, breakfast included in every rate</div>
    </div></div>

    <div id="ps-foot"><div id="ps-footin">
      <span id="ps-copy"></span>
      <span>Directions · Accessibility · Cancellation policy</span>
    </div></div>
  `;

  function mount() {
    document.head.appendChild(style);
    document.body.appendChild(el);

    el.querySelector('#ps-name').textContent = CONFIG.company;
    el.querySelector('#ps-tag').textContent  = CONFIG.tagline;
    el.querySelector('#ps-copy').textContent =
      '© ' + new Date().getFullYear() + ' ' + CONFIG.company + '. All rights reserved.';

    el.querySelector('#ps-logo').addEventListener('click', onLogoClick);

    if (CONFIG.startCovered) cover();
    if (CONFIG.idleSeconds > 0) armIdle();
  }

  /* ---- tab disguise ----
     The cover is useless if the tab still says "iMessage — Jarvis
     Portal" in the strip along the top. Title and favicon both get
     swapped while it's up, and put back exactly as they were. */

  const HOTEL_ICON = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<rect width="64" height="64" rx="12" fill="#6b5b3e"/>' +
      '<rect x="16" y="16" width="32" height="36" rx="2" fill="#f3ede3"/>' +
      '<rect x="21" y="22" width="7" height="7" fill="#6b5b3e"/>' +
      '<rect x="36" y="22" width="7" height="7" fill="#6b5b3e"/>' +
      '<rect x="21" y="33" width="7" height="7" fill="#6b5b3e"/>' +
      '<rect x="36" y="33" width="7" height="7" fill="#6b5b3e"/>' +
      '<rect x="27" y="44" width="10" height="8" rx="1" fill="#6b5b3e"/>' +
    '</svg>'
  );

  let realTitle = null;
  let realIcons = null;

  function disguiseTab(){
    if (realTitle !== null) return;         // already disguised
    realTitle = document.title;
    document.title = CONFIG.coverTitle;

    // keep the originals so they can be put back untouched
    realIcons = Array.from(document.querySelectorAll('link[rel~="icon"]'));
    realIcons.forEach(l => l.remove());

    const link = document.createElement('link');
    link.rel = 'icon';
    link.id = 'ps-favicon';
    link.href = HOTEL_ICON;
    document.head.appendChild(link);
  }

  function restoreTab(){
    if (realTitle === null) return;
    document.title = realTitle;
    realTitle = null;

    const fake = document.getElementById('ps-favicon');
    if (fake) fake.remove();

    if (realIcons) realIcons.forEach(l => document.head.appendChild(l));
    else {
      // page had no icon of its own — nudge the browser to drop ours
      const blank = document.createElement('link');
      blank.rel = 'icon';
      blank.href = 'favicon.ico';
      document.head.appendChild(blank);
      setTimeout(() => blank.remove(), 60);
    }
    realIcons = null;
  }

  /* ---- raising and lowering ---- */

  let up = false;
  let paused = [];

  function cover() {
    if (up || !enabled) return;
    // some apps rebuild the page under us; make sure we're still attached
    if (!el.isConnected && document.body) document.body.appendChild(el);
    up = true;
    disguiseTab();
    el.classList.add('up');
    el.scrollTop = 0;
    document.documentElement.style.overflow = 'hidden';

    // silence anything playing, or the cover fools nobody
    paused = [];
    document.querySelectorAll('audio, video').forEach(m => {
      if (!m.paused) { m.pause(); paused.push(m); }
    });

    // don't leave a caret blinking in a field underneath
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  }

  function uncover() {
    if (!up) return;
    up = false;
    restoreTab();
    el.classList.remove('up');
    document.documentElement.style.overflow = '';
    paused.forEach(m => m.play().catch(() => {}));
    paused = [];
  }

  function toggle() { up ? uncover() : cover(); }

  /* ---- ways in ---- */

  let shiftTaps = 0, shiftTimer = null;

  /* On window, in the capture phase, so it runs before anything the page
     has bound. Games like Antimatter Dimensions use Escape themselves —
     stopImmediatePropagation keeps the key from reaching them at all. */
  window.addEventListener('keydown', e => {
    // the portal's settings panel is capturing a new key right now
    if (window.__psRebinding) return;

    if (e.key === CONFIG.hotkey || e.code === CONFIG.hotkey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      toggle();
      return;
    }

    if (CONFIG.panicChord && e.key === 'Shift' && !e.repeat) {
      shiftTaps++;
      clearTimeout(shiftTimer);
      shiftTimer = setTimeout(() => { shiftTaps = 0; }, 600);
      if (shiftTaps >= 3) { shiftTaps = 0; cover(); }
    }
  }, true);

  if (CONFIG.coverOnHide) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cover();
    });
  }

  /* 'blur' is a blunt instrument. It also fires when focus moves into an
     iframe on this very page — a map preview, an embedded player — and on
     a multi-monitor setup it fires every time you glance at the other
     screen. So: wait a moment, then only cover if the document genuinely
     lost focus. Focus landing in one of our own iframes leaves
     document.hasFocus() true, which is exactly the case we want to skip. */
  let blurTimer = null;

  window.addEventListener('blur', () => {
    if (!CONFIG.coverOnBlur || !enabled) return;
    clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      if (document.hasFocus()) return;                       // iframe, not another app
      if (document.activeElement &&
          document.activeElement.tagName === 'IFRAME') return;
      cover();
    }, 220);
  });

  window.addEventListener('focus', () => clearTimeout(blurTimer));

  function armIdle() {
    let t;
    const reset = () => {
      clearTimeout(t);
      if (!up) t = setTimeout(cover, CONFIG.idleSeconds * 1000);
    };
    ['mousemove','keydown','pointerdown','scroll','touchstart']
      .forEach(ev => document.addEventListener(ev, reset, { passive: true }));
    reset();
  }

  /* ---- the quiet way out ---- */

  let clicks = 0, clickTimer = null;

  function onLogoClick() {
    clicks++;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => { clicks = 0; }, 900);
    if (clicks >= CONFIG.logoClicks) { clicks = 0; uncover(); }
  }

  /* ---- go ---- */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  // for your own use from the console, or a button on the page
  window.privacyScreen = {
    cover, uncover, toggle,
    get isUp() { return up; },
    // used by the portal's settings panel
    setHotkey(k, remember) {
      if (!k) return;
      CONFIG.hotkey = k;
      if (remember !== false) writeStoredKey(k);
    },
    getHotkey() { return CONFIG.hotkey; },

    setCoverOnBlur(on, remember) {
      CONFIG.coverOnBlur = !!on;
      if (remember !== false) writeBlur(CONFIG.coverOnBlur);
    },
    getCoverOnBlur() { return CONFIG.coverOnBlur; },

    setEnabled(on, remember) {
      enabled = !!on;
      if (remember !== false) writeEnabled(enabled);
      if (!enabled) uncover();
    },
    isEnabled() { return enabled; },

    // still works from the console even when switched off
    forceCover() { const was = enabled; enabled = true; cover(); enabled = was; }
  };
})();
