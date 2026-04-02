// space-client.js -- APLabs Space Zone
// Standalone 2D canvas module, compatible with existing socket/joystick

const SKT    = () => window._mineGetSocket?.();
const USR    = () => window._mineGetUsername?.() || 'Pilot';
const NOTIFY = (msg) => window._mineShowNotification?.(msg);

// ── STATE ─────────────────────────────────────────────────────────────────────
let spaceActive   = false;
let canvas, ctx;
let ship, otherShips = [];
let stars = [], nebulaParticles = [];
let worms = [];
let bullets = [], missiles = [];
let keys = {};
let lastTime = 0;
let cameraX = 0, cameraY = 0;
let panOffsetX = 0, panOffsetY = 0;
let isPanning = false, panStartX = 0, panStartY = 0;
let scriptPhase  = 'explore'; // explore, worm1_appear, worm1_charge, warp, worm2, blackout, done
let scriptTimer  = 0;
let warpCooldown = 0;
let aiQueue      = [];
let aiShowing    = false;
let waveformAnim = 0;
let audioCtx     = null;
let mobileBtns   = {};

const WORLD_W = 4000;
const WORLD_H = 4000;
const LIGHT_RADIUS    = window.innerWidth < 768 ? 180 : 220;
const FLASHLIGHT_R    = window.innerWidth < 768 ?  55 :  70;
const AMBIENT_RADIUS  = window.innerWidth < 768 ? 280 : 340;

// ── SHIP INIT ─────────────────────────────────────────────────────────────────
function createShip() {
  return {
    x: WORLD_W / 2, y: WORLD_H / 2,
    vx: 0, vy: 0,
    angle: -Math.PI / 2, // facing up
    shield: 150,
    maxShield: 150,
    shieldRegen: 0,
    systems: { weapons: true, warp: true, engine: true, navigation: true },
    thrusting: false,
    warping: false,
    warpFlash: 0,
    hitFlash: 0,
    smokeTimer: 0,
    smokeParticles: [],
    trail: [],
  };
}

// ── STAR FIELD ────────────────────────────────────────────────────────────────
function generateStars() {
  stars = [];
  for (let i = 0; i < 800; i++) {
    stars.push({
      x: Math.random() * WORLD_W,
      y: Math.random() * WORLD_H,
      r: Math.random() * 1.5 + 0.2,
      brightness: Math.random() * 0.7 + 0.3,
      twinkle: Math.random() * Math.PI * 2,
      layer: Math.floor(Math.random() * 3), // 0=far, 1=mid, 2=near
    });
  }
  // Big distant stars / galaxies
  for (let i = 0; i < 12; i++) {
    stars.push({
      x: Math.random() * WORLD_W,
      y: Math.random() * WORLD_H,
      r: Math.random() * 4 + 2,
      brightness: Math.random() * 0.4 + 0.1,
      twinkle: Math.random() * Math.PI * 2,
      layer: 0,
      isGalaxy: true,
      hue: Math.random() * 60 + 200, // blue-purple
    });
  }
  // Nebula particles
  nebulaParticles = [];
  for (let i = 0; i < 60; i++) {
    nebulaParticles.push({
      x: Math.random() * WORLD_W,
      y: Math.random() * WORLD_H,
      r: Math.random() * 80 + 40,
      hue: Math.random() * 60 + 200,
      alpha: Math.random() * 0.04 + 0.01,
    });
  }
}

// ── WORM ──────────────────────────────────────────────────────────────────────
function createWorm(x, y, size, isLeviathan) {
  const segments = isLeviathan ? 40 : 22;
  const segSpacing = isLeviathan ? 38 : 22;
  const segs = [];
  for (let i = 0; i < segments; i++) {
    segs.push({ x: x + i * segSpacing, y });
  }
  return {
    x, y,
    segments: segs,
    segSpacing,
    size,
    isLeviathan,
    angle: Math.PI, // facing left
    speed: isLeviathan ? 1.2 : 2.2,
    anglerAngle: 0,
    anglerPulse: 0,
    eyeFlash: 0,
    alpha: 0,
    visible: false,
    phase: 'idle', // idle, appear, patrol, charge, flee, eat
    phaseTimer: 0,
    targetX: x, targetY: y,
    opacity: isLeviathan ? 0 : 0,
  };
}

// ── SPACE MUSIC ───────────────────────────────────────────────────────────────
let spaceMusicNodes = [];
let spaceMusicGain = null;

function startSpaceMusic() {
  if (!audioCtx) initAudio();
  stopSpaceMusic();

  // Use music1.mp3 if available, fall back to generated ambient
  const music1 = new Audio('/music1.mp3');
  music1.loop = true;
  music1.volume = 0;
  music1.play().then(() => {
    spaceMusicNodes.push({ stop: () => { music1.pause(); music1.currentTime = 0; } });
    // Fade in
    let vol = 0;
    const fadeIn = setInterval(() => {
      vol = Math.min(vol + 0.02, 0.5);
      music1.volume = vol;
      if (vol >= 0.5) clearInterval(fadeIn);
    }, 80);
    spaceMusicGain = { isMusicEl: true, el: music1 };
  }).catch(() => {
    // Fallback to generated ambient drone
    _startGeneratedSpaceMusic();
  });

  // Mute earth music
  if (window._bgMusic) {
    window._bgMusicVol = window._bgMusic.volume;
    window._bgMusic.volume = 0;
  }
}

function _startGeneratedSpaceMusic() {
  try {
    spaceMusicGain = audioCtx.createGain();
    spaceMusicGain.gain.setValueAtTime(0, audioCtx.currentTime);
    spaceMusicGain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 3);
    spaceMusicGain.connect(audioCtx.destination);

    const drone = audioCtx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 40;
    const droneGain = audioCtx.createGain();
    droneGain.gain.value = 0.6;
    drone.connect(droneGain);
    droneGain.connect(spaceMusicGain);
    drone.start();
    spaceMusicNodes.push(drone);

    // Mid harmonic
    const mid = audioCtx.createOscillator();
    mid.type = 'sine';
    mid.frequency.value = 80;
    const midGain = audioCtx.createGain();
    midGain.gain.value = 0.3;
    mid.connect(midGain);
    midGain.connect(spaceMusicGain);
    mid.start();
    spaceMusicNodes.push(mid);

    // Slow LFO on drone pitch for drift feel
    const lfo = audioCtx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 3;
    lfo.connect(lfoGain);
    lfoGain.connect(drone.frequency);
    lfo.start();
    spaceMusicNodes.push(lfo);

    // Occasional high ping
    const pingInterval = setInterval(() => {
      if (!spaceActive) { clearInterval(pingInterval); return; }
      try {
        const ping = audioCtx.createOscillator();
        const pingGain = audioCtx.createGain();
        ping.type = 'sine';
        ping.frequency.value = 800 + Math.random() * 400;
        pingGain.gain.setValueAtTime(0.04, audioCtx.currentTime);
        pingGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 2);
        ping.connect(pingGain);
        pingGain.connect(spaceMusicGain);
        ping.start();
        ping.stop(audioCtx.currentTime + 2);
      } catch(e) {}
    }, 8000 + Math.random() * 12000);
    spaceMusicNodes.push({ stop: () => clearInterval(pingInterval) });

    // Mute earth music if playing
    if (window._earthMusicGain) {
      window._earthMusicGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1);
    }
  } catch(e) { console.error('[Space Music]', e); }
}

function stopSpaceMusic() {
  try {
    // Handle music1.mp3 element
    if (spaceMusicGain?.isMusicEl) {
      const el = spaceMusicGain.el;
      let vol = el.volume;
      const fadeOut = setInterval(() => {
        vol = Math.max(0, vol - 0.03);
        el.volume = vol;
        if (vol <= 0) { clearInterval(fadeOut); el.pause(); el.currentTime = 0; }
      }, 80);
    } else if (spaceMusicGain) {
      spaceMusicGain.gain.linearRampToValueAtTime(0, audioCtx?.currentTime + 1.5);
      setTimeout(() => {
        spaceMusicNodes.forEach(n => { try { n.stop?.(); } catch(e) {} });
        spaceMusicNodes = [];
        spaceMusicGain = null;
      }, 2000);
    }
    spaceMusicGain = null;
    // Restore earth music
    if (window._bgMusic) {
      window._bgMusic.volume = window._bgMusicVol || 0.35;
    }
  } catch(e) {}
}

// ── AUDIO ─────────────────────────────────────────────────────────────────────
function initAudio() {
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
}

function playWhompy() {
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(60, audioCtx.currentTime + 0.3);
    g.gain.setValueAtTime(0.15, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    o.start(); o.stop(audioCtx.currentTime + 0.4);
  } catch(e) {}
}

function playWarp() {
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(200, audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(2000, audioCtx.currentTime + 0.3);
    g.gain.setValueAtTime(0.2, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    o.start(); o.stop(audioCtx.currentTime + 0.5);
  } catch(e) {}
}

function playAlert() {
  if (!audioCtx) return;
  try {
    [0, 0.15, 0.3].forEach(t => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.type = 'square';
      o.frequency.value = 440;
      g.gain.setValueAtTime(0.08, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.12);
      o.start(audioCtx.currentTime + t);
      o.stop(audioCtx.currentTime + t + 0.12);
    });
  } catch(e) {}
}

function playShipHum() {
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type = 'sine';
    o.frequency.value = 55;
    g.gain.setValueAtTime(0.04, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.5);
    o.start(); o.stop(audioCtx.currentTime + 1.5);
  } catch(e) {}
}

// ── AI TERMINAL ───────────────────────────────────────────────────────────────
const aiTerminal = document.createElement('div');
aiTerminal.style.cssText = `
  position:fixed;top:0;left:0;right:0;
  background:rgba(0,8,20,0.96);border-bottom:2px solid rgba(0,255,180,0.3);
  font-family:'Courier New',monospace;color:#00FFB8;padding:10px 16px;
  z-index:500;display:none;pointer-events:none;
  box-shadow:0 2px 20px rgba(0,255,180,0.15);
`;
aiTerminal.innerHTML = `
  <div style="display:flex;align-items:center;gap:12px;">
    <div style="font-size:0.65rem;opacity:0.5;white-space:nowrap;">SHIP AI v2.1</div>
    <canvas id="waveformCanvas" width="80" height="24" style="opacity:0.7;"></canvas>
    <div id="aiText" style="font-size:0.85rem;letter-spacing:0.05em;flex:1;"></div>
  </div>
`;
document.body.appendChild(aiTerminal);

let aiTyping = false;
let aiTimeout = null;

function queueAI(text, delay = 0, onDone = null) {
  aiQueue.push({ text, delay, onDone });
  if (!aiShowing) processAIQueue();
}

function processAIQueue() {
  if (aiQueue.length === 0) { aiShowing = false; return; }
  aiShowing = true;
  const item = aiQueue.shift();
  setTimeout(() => {
    showAI(item.text, () => {
      if (item.onDone) item.onDone();
      setTimeout(processAIQueue, 800);
    });
  }, item.delay);
}

function showAI(text, onDone) {
  aiTerminal.style.display = 'block';
  const el = document.getElementById('aiText');
  el.textContent = '';
  playWhompy();
  let i = 0;
  aiTyping = true;
  const interval = setInterval(() => {
    el.textContent += text[i];
    i++;
    if (i >= text.length) {
      clearInterval(interval);
      aiTyping = false;
      if (onDone) {
        aiTimeout = setTimeout(() => {
          if (aiQueue.length === 0) aiTerminal.style.display = 'none';
          onDone();
        }, Math.max(2000, text.length * 60));
      }
    }
  }, 28);
}

function animateWaveform() {
  const wc = document.getElementById('waveformCanvas');
  if (!wc) return;
  const wctx = wc.getContext('2d');
  wctx.clearRect(0, 0, 80, 24);
  wctx.strokeStyle = '#00FFB8';
  wctx.lineWidth = 1.5;
  wctx.beginPath();
  for (let x = 0; x < 80; x++) {
    const y = 12 + Math.sin(x * 0.3 + waveformAnim) * (aiTyping ? 8 : 2)
              + Math.sin(x * 0.7 + waveformAnim * 1.3) * (aiTyping ? 4 : 1);
    x === 0 ? wctx.moveTo(x, y) : wctx.lineTo(x, y);
  }
  wctx.stroke();
}

// ── CANVAS SETUP ──────────────────────────────────────────────────────────────
function setupCanvas() {
  canvas = document.createElement('canvas');
  canvas.style.cssText = `
    position:fixed;inset:0;z-index:400;display:none;
    background:#000008;touch-action:none;
  `;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx = canvas.getContext('2d');
  document.body.appendChild(canvas);

  window.addEventListener('resize', () => {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  });

  // Pan to look ahead
  canvas.addEventListener('mousedown', e => {
    if (e.button === 2) { isPanning = true; panStartX = e.clientX; panStartY = e.clientY; }
  });
  canvas.addEventListener('mousemove', e => {
    if (isPanning) { panOffsetX = (e.clientX - panStartX) * 0.5; panOffsetY = (e.clientY - panStartY) * 0.5; }
  });
  canvas.addEventListener('mouseup', () => { isPanning = false; panOffsetX = 0; panOffsetY = 0; });
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (!ship) return;
    const wx = e.clientX - canvas.width/2 + cameraX;
    const wy = e.clientY - canvas.height/2 + cameraY;
    firePlayerMissile(Math.atan2(wy - ship.y, wx - ship.x));
  });

  // Shoot on click (left=guns, right=missiles)
  canvas.addEventListener('click', e => {
    if (!spaceActive || !ship || !ship.systems.weapons) return;
    if (window.innerWidth <= 900) return; // mobile uses touchstart only
    // Aim click -- fire toward world position
    const wx = e.clientX - canvas.width/2 + cameraX;
    const wy = e.clientY - canvas.height/2 + cameraY;
    const angle = Math.atan2(wy - ship.y, wx - ship.x);
    if (activeWeapon === 'missiles') firePlayerMissile(angle);
    else fireBullet(angle);
  });
}

// ── MOBILE CONTROLS ───────────────────────────────────────────────────────────
// Mobile state
let _spJoy = { active:false, id:null, startX:0, startY:0, dx:0, dy:0 };
let _spAimId = null;
let _spLastAimAngle = -Math.PI/2;
let _spMobileTapCount = 0;
let _spJoyVisible = false;
let _spAimFlash = 0;   // flashes aim ring when a shot fires
let _spAimJoy   = { active:false, id:null }; // dedicated aim joystick
let _spAutoFireTimer = 0;  // frames until next auto-shot
let _spAutoShotCount = 0;  // tracks every-3rd for missile alternation

function setupMobileControls() {
  if (window.innerWidth > 900) return; // desktop -- skip

  // Guard: already created -- just ensure visible and bail
  const _existing = document.getElementById('spaceMobileHUD');
  if (_existing) { _existing.style.display = 'flex'; return; }

  const cvs = document.getElementById('spaceCanvas') || canvas;
  if (!cvs) return;

  // Kill old button bar permanently on mobile
  var _oldBar = document.getElementById('spaceBtnBar');
  if (_oldBar) { _oldBar.style.display = 'none'; _oldBar.style.visibility = 'hidden'; }

  // ── NEW MOBILE HUD BUTTONS (right side) ─────────────────────────
  function mkBtn(label, color, id, svgInner) {
    const b = document.createElement('div');
    b.id = id;
    b.style.cssText = 'width:62px;border-radius:14px;padding:8px 0 6px 0;'
      + 'background:rgba(0,6,18,0.85);border:2px solid ' + color + ';'
      + 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;'
      + 'user-select:none;cursor:pointer;-webkit-tap-highlight-color:transparent;'
      + 'box-shadow:0 0 14px ' + color + '55;backdrop-filter:blur(6px);';
    b.innerHTML = svgInner
      + '<div style="font-family:Courier New,monospace;font-size:9px;color:' + color
      + ';letter-spacing:0.08em;opacity:0.9;">' + label + '</div>';
    return b;
  }

  const hud = document.createElement('div');
  hud.id = 'spaceMobileHUD';
  hud.style.cssText = 'position:fixed;bottom:24px;right:16px;z-index:820;display:flex;flex-direction:column;gap:10px;align-items:center;';

  // SHOOT -- holographic bullseye
  const shootSVG = '<svg width="36" height="36" viewBox="0 0 36 36">'
    + '<circle cx="18" cy="18" r="15" stroke="#00AAFF" stroke-width="1.5" fill="none" opacity="0.7"/>'
    + '<circle cx="18" cy="18" r="9" stroke="#00CCFF" stroke-width="1.5" fill="none"/>'
    + '<circle cx="18" cy="18" r="3" fill="#00FFFF"/>'
    + '<line x1="18" y1="2" x2="18" y2="10" stroke="#00AAFF" stroke-width="1.5"/>'
    + '<line x1="18" y1="26" x2="18" y2="34" stroke="#00AAFF" stroke-width="1.5"/>'
    + '<line x1="2" y1="18" x2="10" y2="18" stroke="#00AAFF" stroke-width="1.5"/>'
    + '<line x1="26" y1="18" x2="34" y2="18" stroke="#00AAFF" stroke-width="1.5"/>'
    + '</svg>';
  mobileBtns.shoot = mkBtn('SHOOT', '#00AAFF', 'spMobShoot', shootSVG);

  // WARP
  const warpSVG = '<svg width="32" height="32" viewBox="0 0 32 32">'
    + '<polygon points="16,2 20,12 30,12 22,19 25,30 16,23 7,30 10,19 2,12 12,12" fill="none" stroke="#00FFFF" stroke-width="1.5"/>'
    + '<circle cx="16" cy="16" r="4" fill="#00FFFF" opacity="0.8"/>'
    + '</svg>';
  mobileBtns.warp = mkBtn('WARP', '#00FFFF', 'spMobWarp', warpSVG);

  // SCAN
  const scanSVG = '<svg width="32" height="32" viewBox="0 0 32 32">'
    + '<circle cx="16" cy="16" r="13" stroke="#00FFB8" stroke-width="1.5" fill="none" stroke-dasharray="4 3"/>'
    + '<line x1="16" y1="3" x2="16" y2="16" stroke="#00FFB8" stroke-width="2"/>'
    + '<circle cx="16" cy="16" r="2.5" fill="#00FFB8"/>'
    + '</svg>';
  mobileBtns.scan = mkBtn('SCAN', '#00FFB8', 'spMobScan', scanSVG);

  hud.appendChild(mobileBtns.shoot);
  hud.appendChild(mobileBtns.warp);
  hud.appendChild(mobileBtns.scan);
  document.body.appendChild(hud);
  // SCAN locked until scanner beacon collected in mission
  if (mobileBtns.scan) mobileBtns.scan.style.display = 'none';

  // Fire on shoot button
  // SHOOT button fires at last aimed angle -- same as canvas tap
  mobileBtns.shoot.addEventListener('touchstart', function(e) {
    e.preventDefault();
    if (!ship) return;
    fireBullet(_spLastAimAngle);
    firePlayerMissile(_spLastAimAngle);
    _spAimFlash = 1.0;
  }, {passive:false});

  mobileBtns.warp.addEventListener('touchstart', e => { e.preventDefault(); doWarp(); }, {passive:false});
  mobileBtns.scan.addEventListener('touchstart', e => { e.preventDefault(); if (hasScanner && !scannerActive) activateScanner(); }, {passive:false});

  // ── CANVAS TOUCH -- dual joystick: left=move, right=aim
  function inJoyZone(x, y) {
    return x < 160 && y > window.innerHeight - 160;
  }
  function inAimJoyZone(x, y) {
    var ax = canvas.width - 145, ay = canvas.height - 150;
    var dx = x - ax, dy = y - ay;
    return Math.sqrt(dx*dx + dy*dy) < 55;
  }

  canvas.addEventListener('touchstart', function(e) {
    if (!spaceActive || !ship) return;
    for (var i=0; i<e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (inJoyZone(t.clientX, t.clientY) && !_spJoy.active) {
        // Movement joystick
        _spJoy = { active:true, id:t.identifier, startX:t.clientX, startY:t.clientY, dx:0, dy:0 };
      } else if (inAimJoyZone(t.clientX, t.clientY) && !_spAimJoy.active) {
        // Aim joystick -- start tracking, snap angle immediately
        _spAimJoy = { active:true, id:t.identifier };
        var ax = canvas.width - 145, ay = canvas.height - 150;
        var dx = t.clientX - ax, dy = t.clientY - ay;
        if (Math.sqrt(dx*dx+dy*dy) > 8) _spLastAimAngle = Math.atan2(dy, dx);
      } else if (!inJoyZone(t.clientX, t.clientY) && !inAimJoyZone(t.clientX, t.clientY)) {
        // Canvas tap outside both zones -- fire at current aim angle
        _spMobileTapCount++;
        fireBullet(_spLastAimAngle);
        if (_spMobileTapCount % 3 === 0 && missileCount > 0) firePlayerMissile(_spLastAimAngle);
        _spAimFlash = 1.0;
      }
    }
  }, {passive:true});

  canvas.addEventListener('touchmove', function(e) {
    if (!spaceActive || !ship) return;
    for (var i=0; i<e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier === _spJoy.id) {
        _spJoy.dx = (t.clientX - _spJoy.startX) / 55;
        _spJoy.dy = (t.clientY - _spJoy.startY) / 55;
        window._joystickDelta = { x:_spJoy.dx, y:_spJoy.dy };
      }
      if (_spAimJoy.active && t.identifier === _spAimJoy.id) {
        // Aim joystick drag -- angle from ring center
        var ax = canvas.width - 145, ay = canvas.height - 150;
        var dx = t.clientX - ax, dy = t.clientY - ay;
        if (Math.sqrt(dx*dx+dy*dy) > 8) _spLastAimAngle = Math.atan2(dy, dx);
      }
    }
  }, {passive:true});

  canvas.addEventListener('touchend', function(e) {
    for (var i=0; i<e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier === _spJoy.id) {
        _spJoy = { active:false, id:null, startX:0, startY:0, dx:0, dy:0 };
        window._joystickDelta = { x:0, y:0 };
      }
      if (_spAimJoy.active && t.identifier === _spAimJoy.id) {
        _spAimJoy = { active:false, id:null };
      }
    }
  }, {passive:true});
}

// ── KEYBOARD ──────────────────────────────────────────────────────────────────
let playerDead = false;
let deathOverlay = null;

document.addEventListener('keydown', e => {
  if (!spaceActive) return;
  keys[e.code] = true;
  if (e.code === 'Space')   { e.preventDefault(); doWarp(); }
  if (e.code === 'KeyF')    fireMissile();
  if (e.code === 'KeyQ')    { activeWeapon = activeWeapon === 'guns' ? 'missiles' : 'guns'; }
  if (e.code === 'KeyE')    { if (hasScanner && !scannerActive) activateScanner(); }
  // No escape -- you can't just leave space
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

// ── WEAPONS ───────────────────────────────────────────────────────────────────
function fireBullet(angle) {
  if (!ship || !ship.systems.weapons || scriptPhase !== 'done' && scriptPhase !== 'explore') return;
  bullets.push({
    x: ship.x + Math.cos(angle) * 20,
    y: ship.y + Math.sin(angle) * 20,
    vx: Math.cos(angle) * 12,
    vy: Math.sin(angle) * 12,
    life: 60,
    trail: [],
  });
}

function firePlayerMissile(angle) {
  if (!ship || !ship.systems.weapons || missileCount <= 0) return;
  const a = angle !== undefined ? angle : ship.angle;
  missiles.push({
    x: ship.x, y: ship.y,
    vx: Math.cos(a) * 6,
    vy: Math.sin(a) * 6,
    angle: a,
    life: 180,
    trail: [],
    smokeTrail: [],
    isEnemy: false,
    isPlayer: true,
    age: 0,
  });
  missileCount--;
}

function fireMissile() {
  firePlayerMissile(ship?.angle);
}

// ── WARP ──────────────────────────────────────────────────────────────────────
function doWarp() {
  // During leviathan inhale -- warp fails
  if (scriptPhase === 'inhale') { onWarpFailed(); return; }
  if (!ship || !ship.systems.warp || warpCooldown > 0) return;

  playWarp();
  const dist = Math.min(canvas.width, canvas.height) * 0.5;
  ship.x += Math.cos(ship.angle) * dist;
  ship.y += Math.sin(ship.angle) * dist;
  // Clamp to safe zone -- can't warp outside boundary
  const WARP_SAFE = WORLD_W * 0.42;
  const WCX = WORLD_W / 2, WCY = WORLD_H / 2;
  const wdx = ship.x - WCX, wdy = ship.y - WCY;
  const wdist = Math.sqrt(wdx*wdx + wdy*wdy);
  if (wdist > WARP_SAFE) {
    ship.x = WCX + (wdx/wdist) * WARP_SAFE;
    ship.y = WCY + (wdy/wdist) * WARP_SAFE;
  }
  ship.vx *= 0.1; ship.vy *= 0.1;
  ship.warpFlash = 1.0;
  warpCooldown = 300;

  // Pirates see the warp and pursue after 1s delay
  if (missionPhase === 'combat') {
    const TAUNTS = [
      "YOU'RE NOT GETTING OUT OF HERE.",
      "Not on my watch!",
      "PURSUE. PURSUE.",
      "Don't run from me.",
      "Nowhere to hide out here.",
      "I see you.",
    ];
    const taunt = TAUNTS[Math.floor(Math.random() * TAUNTS.length)];
    setTimeout(() => {
      if (missionPhase !== 'combat' || playerDead) return;
      // Each alive enemy warps to near player's new position
      enemies.forEach((e, i) => {
        if (!e.alive) return;
        setTimeout(() => {
          if (!e.alive || playerDead) return;
          const scatter = 180 + Math.random() * 120;
          const angle = Math.random() * Math.PI * 2;
          e.x = ship.x + Math.cos(angle) * scatter;
          e.y = ship.y + Math.sin(angle) * scatter;
          e.vx = 0; e.vy = 0;
          e.warpCooldown = 3.0;
          spawnExplosion(e.x, e.y, 'small');
        }, i * 200); // stagger slightly so they don't all appear at once
      });
      // Show taunt as notification
      NOTIFY(taunt);
    }, 1000 + Math.random() * 400);
  }

  if (scriptPhase === 'worm1_charge') onWarpEscape();

  SKT()?.emit('space:move', { x: ship.x, y: ship.y, angle: ship.angle });

  if (mobileBtns.scan) mobileBtns.scan.style.display = hasScanner ? 'flex' : 'none';
  if (mobileBtns.warp) {
    mobileBtns.warp.style.opacity = '0.3';
    mobileBtns.warp.style.border = '2px solid #00FFFF';
    setTimeout(() => {
      if (mobileBtns.warp) { mobileBtns.warp.style.opacity = '1'; }
    }, 5000);
  }
}

// ── SCRIPT SEQUENCE ───────────────────────────────────────────────────────────
// ── SCRIPT SEQUENCE ──────────────────────────────────────────────────────────
// PHASE 1: intro -> explore -> worm1_charge
//   Player must press SPACE or get eaten. Restart if eaten.
// PHASE 2: warped -> disturbance -> leviathan
//   Leviathan inevitable. Warp fails. Sucked in. Expelled.

function startScript() {
  scriptPhase = 'intro';

  setTimeout(() => queueAI("Systems at 12%. Welcome to deep space."), 1500);
  
  
  setTimeout(() => { scriptPhase = 'explore'; }, 12000);

  // Worm appears after 20s of exploring
  setTimeout(() => {
    if (scriptPhase === 'explore' && missionPhase === 'none') triggerWorm1();
  }, 20000);
}

function triggerWorm1() {
  if (missionPhase !== 'none') return; // don't spawn worms if already in mission
  scriptPhase = 'worm1_appear';
  const w = createWorm(ship.x + 500, ship.y - 150, 1.0, false);
  w.visible = true;
  w.phase = 'patrol';
  worms.push(w);

  // Eyes flash -- warning
  setTimeout(() => {
    w.eyeFlash = 3.0;
    playAlert();
    queueAI("...contact.");
  }, 1500);

  // Starts charging after 3s
  setTimeout(() => {
    if (playerDead || scriptPhase !== 'worm1_appear') return;
    w.phase = 'charge';
    scriptPhase = 'worm1_charge';
    playAlert();
    queueAI("CHARGING. PRESS SPACE TO WARP.");
    // Flash mobile warp button
    if (mobileBtns.warp) {
      let f = true;
      const fi = setInterval(() => {
        if (!f || scriptPhase !== 'worm1_charge') { clearInterval(fi); return; }
        mobileBtns.warp.style.border = mobileBtns.warp.style.border.includes('FF0000')
          ? '2px solid #00FFFF' : '3px solid #FF0000';
      }, 250);
    }
  }, 3000);
}

// Called when player warps during worm1_charge
function onWarpEscape() {
  scriptPhase = 'warped';
  // Worm 1 gone -- it lost us
  worms = [];

  setTimeout(() => queueAI("Close call."), 500);
  setTimeout(() => queueAI("Disturbance detected ahead."), 3000);
  
  setTimeout(() => {
    if (scriptPhase === 'warped') triggerLeviathan();
  }, 10000);
}

function triggerLeviathan() {
  scriptPhase = 'leviathan';
  // Remove worm 1
  worms = worms.filter(w => w.isLeviathan);
  playAlert();

  // Leviathan spawns far, moves in slowly
  const lev = createWorm(ship.x - 1200, ship.y + 600, 2.8, true);
  lev.visible = true;
  lev.phase = 'patrol';
  lev.alpha = 0;
  lev.targetX = ship.x + 200;
  lev.targetY = ship.y;
  worms.push(lev);

  // Stars start going dark one by one (just dim the canvas)
  setTimeout(() => {
    queueAI("...");
  }, 2000);
  setTimeout(() => {
    queueAI("Unknown entity.");
    lev.phase = 'charge';
    playAlert();
  }, 4500);
  
  setTimeout(() => {
    queueAI("It is inhaling.");
    scriptPhase = 'inhale'; // player can try warp but will fail
    leviathanInhale(lev);
  }, 8500);
}

function leviathanInhale(lev) {
  // Gravity pull -- ship drifts toward leviathan regardless of input
  let pullStrength = 0;
  const pullInterval = setInterval(() => {
    if (!ship || scriptPhase !== 'inhale') { clearInterval(pullInterval); return; }
    pullStrength = Math.min(pullStrength + 0.02, 0.8);
    const dx = lev.segments[0].x - ship.x;
    const dy = lev.segments[0].y - ship.y;
    const dist = Math.sqrt(dx*dx+dy*dy);
    if (dist > 10) {
      ship.vx += (dx/dist) * pullStrength * 2;
      ship.vy += (dy/dist) * pullStrength * 2;
    }
    // Eaten when close enough
    if (dist < 80) {
      clearInterval(pullInterval);
      scriptPhase = 'blackout';
      worms = []; // clear all worms
      canvas.style.filter = 'brightness(0)';
      setTimeout(() => {
        canvas.style.filter = '';
        showMonthsLater(true);
      }, 1500);
    }
  }, 50);
}

// warp during inhale does nothing -- just narrate it
function onWarpFailed() {
  queueAI("Warp failing.");
}

function triggerEaten(worm) {
  if (playerDead) return;
  playerDead = true;
  scriptPhase = 'eaten';

  worm.segments[0].x = ship.x;
  worm.segments[0].y = ship.y;
  playAlert();
  queueAI("...oh.");

  let r = 0;
  const ei = setInterval(() => {
    r += 0.05;
    canvas.style.filter = `brightness(${Math.max(0, 1-r)}) saturate(${1+r*4})`;
    if (r >= 1) {
      clearInterval(ei);
      canvas.style.filter = '';
      showEatenScreen();
    }
  }, 25);
}

function showEatenScreen(killedByBandits = false) {
  canvas.style.display = 'none';
  aiTerminal.style.display = 'none';
  aiQueue = []; aiShowing = false;

  deathOverlay = document.createElement('div');
  deathOverlay.style.cssText = `
    position:fixed;inset:0;background:#000;z-index:510;
    display:flex;align-items:center;justify-content:center;
    flex-direction:column;font-family:'Courier New',monospace;text-align:center;padding:40px;
  `;

  const title    = killedByBandits ? 'DESTROYED'          : 'YOU WERE EATEN';
  const subtitle = killedByBandits ? 'be more careful.'   : 'the worm did not notice';
  const flavor   = killedByBandits
    ? 'bandits are notorious for setting up traps.'
    : 'press space or tap to try again';
  const titleColor = killedByBandits ? '#FF8800' : '#FF2200';

  deathOverlay.innerHTML = `
    <div style="color:${titleColor};font-size:1.8rem;letter-spacing:0.25em;opacity:0;transition:opacity 2s;" id="et1">${title}</div>
    <div style="color:#555;font-size:0.9rem;letter-spacing:0.1em;opacity:0;transition:opacity 2s;margin-top:12px;" id="et2">${subtitle}</div>
    <div style="color:#333;font-size:0.75rem;letter-spacing:0.05em;opacity:0;transition:opacity 2s;margin-top:16px;font-style:italic;" id="et3">${flavor}</div>
    <div style="color:#00FFB8;font-size:0.8rem;opacity:0;transition:opacity 2s;margin-top:32px;" id="et4">press space or tap to try again</div>
  `;
  document.body.appendChild(deathOverlay);

  setTimeout(() => document.getElementById('et1').style.opacity = '1', 600);
  setTimeout(() => document.getElementById('et2').style.opacity = '1', 2500);
  setTimeout(() => document.getElementById('et3').style.opacity = '0.6', 4000);
  setTimeout(() => document.getElementById('et4').style.opacity = '0.5', 5500);

  const retry = () => {
    deathOverlay?.remove(); deathOverlay = null;
    playerDead = false;
    bullets = []; enemyBullets = []; explosions = []; spaceOre = [];
    aiTerminal.style.display = 'block';
    canvas.style.display = 'block';
    canvas.style.opacity = '1';
    ship = createShip();

    if ((missionPhase === 'combat' || missionPhase === 'done') && checkpointState) {
      // Restore exact state from before combat
      const cp = checkpointState;
      // Spawn 1200 units away so player must fly back
      const cpAngle = cp.shipAngle + Math.PI + (Math.random()-0.5)*0.4;
      ship.x = cp.wreckX + Math.cos(cpAngle) * 1200;
      ship.y = cp.wreckY + Math.sin(cpAngle) * 1200;
      ship.angle = Math.atan2(cp.wreckY - ship.y, cp.wreckX - ship.x);
      ship.vx = 0; ship.vy = 0;
      ship.shield = cp.shield;
      missileCount = cp.missileCount;
      shipCargo.ore = cp.cargo.ore;
      // Restore wreck
      wreck = { x: cp.wreckX, y: cp.wreckY, visited: false };
      // Wipe enemies completely
      enemies = [];
      missionPhase = 'wreck_spawned';
      scriptPhase = 'done';
      queueAI("Checkpoint restored.");
      
    } else {
      // Died to worm -- restart worm sequence
      worms = [];
      missionPhase = 'none';
      scriptPhase = 'explore';
      queueAI("Rebooting.");
      setTimeout(() => {
        if (scriptPhase === 'explore') triggerWorm1();
      }, 5000);
    }
  };

  const keyRetry = (e) => { if (e.code === 'Space') { document.removeEventListener('keydown', keyRetry); retry(); } };
  setTimeout(() => {
    document.addEventListener('keydown', keyRetry);
    deathOverlay?.addEventListener('click', retry);
    deathOverlay?.addEventListener('touchend', e => { e.preventDefault(); retry(); });
  }, 5500);
}

let monthsOverlay = null;
function showMonthsLater(fromLeviathan = false) {
  monthsOverlay = document.createElement('div');
  monthsOverlay.style.cssText = `
    position:fixed;inset:0;background:#000;z-index:510;
    display:flex;align-items:center;justify-content:center;
    flex-direction:column;gap:16px;font-family:'Courier New',monospace;text-align:center;padding:40px;
  `;
  monthsOverlay.innerHTML = `
    <div id="ml1" style="color:#444;font-size:0.8rem;letter-spacing:0.2em;opacity:0;transition:opacity 3s;">you were swallowed whole</div>
    <div id="ml2" style="color:#666;font-size:1.1rem;letter-spacing:0.3em;opacity:0;transition:opacity 3s;margin-top:8px;">months later...</div>
    <div id="ml3" style="color:#333;font-size:0.75rem;opacity:0;transition:opacity 2s;margin-top:30px;">something stirs</div>
    <div id="mlcont" style="color:#00FFB8;font-size:0.8rem;opacity:0;transition:opacity 2s;margin-top:24px;cursor:pointer;">[ tap to continue ]</div>
  `;
  document.body.appendChild(monthsOverlay);

  setTimeout(() => document.getElementById('ml1').style.opacity = '1', 800);
  setTimeout(() => document.getElementById('ml2').style.opacity = '1', 2500);
  setTimeout(() => document.getElementById('ml3').style.opacity = '1', 5000);
  setTimeout(() => document.getElementById('mlcont').style.opacity = '0.6', 7000);

  const cont = () => finishScript();
  setTimeout(() => {
    document.getElementById('mlcont')?.addEventListener('click', cont);
    document.getElementById('mlcont')?.addEventListener('touchend', e => { e.preventDefault(); cont(); });
  }, 7000);
}

function finishScript() {
  if (monthsOverlay) { monthsOverlay.remove(); monthsOverlay = null; }
  canvas.style.display = 'block';
  canvas.style.opacity = '1';
  canvas.style.filter = '';
  worms = [];
  enemies = [];
  playerDead = false;
  ship = createShip();
  scriptPhase = 'done';

  aiTerminal.style.display = 'block';
  queueAI("Expelled.");
  
  setTimeout(() => queueAI("Navigation online."), 2000);
  
  setTimeout(() => spawnPostTutorial(), 4000);
}

// ── UPDATE ────────────────────────────────────────────────────────────────────
function update(dt) {
  if (!ship) return;
  waveformAnim += dt * 4;

  // Shield regen -- always trying to reach full, 25 HP/s
  if (!playerDead && ship.shield < (ship.maxShield || 150)) {
    ship.shield = Math.min(ship.maxShield || 150, ship.shield + 10 * dt);
  }

  // Map boundary -- warn and redirect
  const mapLimit = WORLD_W * 0.44;
  const distFromCenter = Math.sqrt((ship.x - WORLD_W/2)**2 + (ship.y - WORLD_H/2)**2);
  if (distFromCenter > mapLimit) {
    ship.vx += ((WORLD_W/2 - ship.x) / distFromCenter) * 0.5;
    ship.vy += ((WORLD_H/2 - ship.y) / distFromCenter) * 0.5;
    if (!ship._boundaryWarned) {
      ship._boundaryWarned = true;
      queueAI("Dangerous space.");
      setTimeout(() => { if (ship) ship._boundaryWarned = false; }, 5000);
    }
  }

  // Warp cooldown
  if (warpCooldown > 0) warpCooldown -= dt * 60;

  // Ship movement
  const speed = ship.systems.engine ? 0.18 : 0.06;
  const friction = 0.97;
  let thrusting = false;

  // Desktop WASD
  if (keys['KeyW'] || keys['ArrowUp'])    { ship.vy -= speed; thrusting = true; }
  if (keys['KeyS'] || keys['ArrowDown'])  { ship.vy += speed; thrusting = true; }
  if (keys['KeyA'] || keys['ArrowLeft'])  { ship.vx -= speed; thrusting = true; }
  if (keys['KeyD'] || keys['ArrowRight']) { ship.vx += speed; thrusting = true; }

  // Mobile joystick
  const joy = window._joystickDelta;
  if (joy && (Math.abs(joy.x) > 0.05 || Math.abs(joy.y) > 0.05)) {
    ship.vx += joy.x * speed * 1.5;
    ship.vy += joy.y * speed * 1.5;
    thrusting = true;
  }

  // Mobile auto-fire -- hold aim joystick to keep shooting
  if (window.innerWidth <= 900 && _spAimJoy && _spAimJoy.active) {
    _spAutoFireTimer--;
    if (_spAutoFireTimer <= 0) {
      _spAutoFireTimer = 8; // ~7-8 shots/sec at 60fps
      _spAutoShotCount++;
      fireBullet(_spLastAimAngle);
      if (_spAutoShotCount % 3 === 0 && missileCount > 0) firePlayerMissile(_spLastAimAngle);
      _spAimFlash = 0.5;
    }
  } else if (window.innerWidth <= 900) {
    _spAutoFireTimer = 0; // reset so first shot fires instantly on next hold
  }

  ship.thrusting = thrusting;
  if (thrusting) {
    const mag = Math.sqrt(ship.vx*ship.vx + ship.vy*ship.vy);
    if (mag > 0.01) ship.angle = Math.atan2(ship.vy, ship.vx);
  }

  const maxSpeed = ship.systems.engine ? 4.5 : 1.5;
  const mag = Math.sqrt(ship.vx*ship.vx + ship.vy*ship.vy);
  if (mag > maxSpeed) { ship.vx = (ship.vx/mag)*maxSpeed; ship.vy = (ship.vy/mag)*maxSpeed; }

  ship.vx *= friction; ship.vy *= friction;
  ship.x += ship.vx; ship.y += ship.vy;
  ship.x = Math.max(30, Math.min(WORLD_W-30, ship.x));
  ship.y = Math.max(30, Math.min(WORLD_H-30, ship.y));

  // Warp flash decay
  if (ship.warpFlash > 0) ship.warpFlash -= dt * 3;

  // Smoke
  ship.smokeTimer += dt;
  if (ship.smokeTimer > 0.08) {
    ship.smokeTimer = 0;
    ship.smokeParticles.push({
      x: ship.x - Math.cos(ship.angle) * 18 + (Math.random()-0.5)*8,
      y: ship.y - Math.sin(ship.angle) * 18 + (Math.random()-0.5)*8,
      vx: (Math.random()-0.5)*0.5 - ship.vx*0.3,
      vy: (Math.random()-0.5)*0.5 - ship.vy*0.3,
      life: 1.0, r: Math.random()*4+2,
    });
  }
  ship.smokeParticles = ship.smokeParticles.filter(p => {
    p.x += p.vx; p.y += p.vy; p.life -= dt * 1.5; return p.life > 0;
  });

  // Trail
  ship.trail.push({ x: ship.x, y: ship.y, t: 1.0 });
  if (ship.trail.length > 20) ship.trail.shift();
  ship.trail.forEach(t => t.t -= dt * 2);

  // Camera
  const targetCamX = ship.x + panOffsetX;
  const targetCamY = ship.y + panOffsetY;
  cameraX += (targetCamX - cameraX) * 0.08;
  cameraY += (targetCamY - cameraY) * 0.08;

  // Bullets
  bullets = bullets.filter(b => {
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 8) b.trail.shift();
    b.x += b.vx; b.y += b.vy; b.life--;
    return b.life > 0;
  });

  // Missiles
  missiles = missiles.filter(m => {
    m.trail.push({ x: m.x, y: m.y });
    if (m.trail.length > 15) m.trail.shift();
    // Player missile: generate smoke particles
    if (m.isPlayer) {
      m.age = (m.age||0) + 1;
      if (!m.smokeTrail) m.smokeTrail = [];
      if (m.age % 2 === 0) {
        m.smokeTrail.push({
          x: m.x - Math.cos(m.angle)*8 + (Math.random()-0.5)*6,
          y: m.y - Math.sin(m.angle)*8 + (Math.random()-0.5)*6,
          vx: (Math.random()-0.5)*0.4,
          vy: (Math.random()-0.5)*0.4,
          life: 1.0, r: 4+Math.random()*5,
        });
      }
      m.smokeTrail = m.smokeTrail.filter(s => { s.x+=s.vx; s.y+=s.vy; s.life-=0.055; return s.life>0; });
    }
    m.x += m.vx; m.y += m.vy; m.life--;
    return m.life > 0;
  });

  // Worms
  updateWorms(dt);

  // Mission
  if (missionPhase !== 'none') updateMission(dt);
  updateOre(dt);
  updateScannerDrop(dt);
  updateScanner(dt);

  // Broadcast position
  if (Math.abs(ship.vx) > 0.1 || Math.abs(ship.vy) > 0.1) {
    SKT()?.emit('space:move', { x: ship.x, y: ship.y, angle: ship.angle });
  }
}

function updateWorms(dt) {
  worms.forEach(w => {
    w.anglerPulse += dt * 3;
    w.phaseTimer += dt;

    if (w.eyeFlash > 0) w.eyeFlash -= dt * 1.5;

    // Fade in
    if (w.visible && w.alpha < 1) w.alpha = Math.min(1, w.alpha + dt * 0.8);

    switch (w.phase) {
      case 'appear':
        w.targetX = w.x + (Math.random()-0.5)*200;
        w.targetY = w.y + (Math.random()-0.5)*200;
        if (w.phaseTimer > 2) { w.phase = 'patrol'; w.phaseTimer = 0; }
        break;
      case 'patrol':
        // Slow sinusoidal patrol
        w.targetX = ship.x + Math.sin(w.phaseTimer * 0.3) * 400 + (w.isLeviathan ? -800 : 300);
        w.targetY = ship.y + Math.cos(w.phaseTimer * 0.2) * 300 + (w.isLeviathan ? 200 : -200);
        break;
      case 'charge':
        // Always track player's current position while charging
        if (ship) { w.targetX = ship.x; w.targetY = ship.y; }
        w.speed = w.isLeviathan ? 1.8 : 3.5;
        break;
      case 'flee':
        // Worm 1 flees from leviathan
        w.targetX = ship.x + 2000;
        w.targetY = ship.y - 1000;
        w.speed = 5;
        break;
    }

    // Move head toward target
    const dx = w.targetX - w.segments[0].x;
    const dy = w.targetY - w.segments[0].y;
    const dist = Math.sqrt(dx*dx+dy*dy);
    if (dist > 5) {
      const moveX = (dx/dist) * w.speed;
      const moveY = (dy/dist) * w.speed;
      w.segments[0].x += moveX;
      w.segments[0].y += moveY;
      w.angle = Math.atan2(dy, dx);
    }

    // Chain segments
    for (let i = 1; i < w.segments.length; i++) {
      const prev = w.segments[i-1];
      const curr = w.segments[i];
      const sdx = prev.x - curr.x;
      const sdy = prev.y - curr.y;
      const sdist = Math.sqrt(sdx*sdx+sdy*sdy);
      if (sdist > w.segSpacing) {
        const ratio = (sdist - w.segSpacing) / sdist;
        curr.x += sdx * ratio * 0.6;
        curr.y += sdy * ratio * 0.6;
      }
    }

    // Check eat/warp for script
    if ((scriptPhase === 'worm1_appear' || scriptPhase === 'worm1_charge') && w.phase === 'charge' && !w.isLeviathan) {
      const ddx = w.segments[0].x - ship.x;
      const ddy = w.segments[0].y - ship.y;
      const distToShip = Math.sqrt(ddx*ddx+ddy*ddy);

      if (distToShip < 55 && !playerDead) {
        triggerEaten(w);
        return;
      }
    }
  });
}

// ── DRAW ──────────────────────────────────────────────────────────────────────
let _frameCount = 0;
function draw() {
  if (!ctx) return;
  _frameCount++;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  // (aim line removed -- gun fires at last tapped direction silently)
  const sx = W/2 - cameraX;
  const sy = H/2 - cameraY;

  ctx.save();
  ctx.translate(sx, sy);

  // Nebula
  nebulaParticles.forEach(n => {
    const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    grd.addColorStop(0, `hsla(${n.hue},70%,60%,${n.alpha})`);
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI*2);
    ctx.fill();
  });

  // Stars (parallax by layer)
  const time = Date.now() * 0.001;
  stars.forEach(s => {
    const parallax = [0.2, 0.5, 0.8][s.layer];
    const px = (s.x - cameraX * (1-parallax) * 0.3);
    const py = (s.y - cameraY * (1-parallax) * 0.3);
    const twinkle = s.brightness * (0.7 + Math.sin(time * 2 + s.twinkle) * 0.3);
    if (s.isGalaxy) {
      const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r*3);
      grd.addColorStop(0, `hsla(${s.hue},60%,70%,${twinkle*0.6})`);
      grd.addColorStop(1, 'transparent');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r*3, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
    ctx.fillStyle = `rgba(255,255,255,${twinkle})`;
    ctx.fill();
  });

  // Other ships
  otherShips.forEach(os => {
    drawOtherShip(os);
  });

  // Bullets
  bullets.forEach(b => {
    // Tracer
    if (b.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(b.trail[0].x, b.trail[0].y);
      b.trail.forEach(t => ctx.lineTo(t.x, t.y));
      ctx.strokeStyle = 'rgba(0,255,150,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2.5, 0, Math.PI*2);
    ctx.fillStyle = '#00FF96';
    ctx.shadowColor = '#00FF96';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  // Missiles
  missiles.forEach(m => {
    if (m.isPlayer) {
      // ── PLAYER MISSILE: 3-body with gray smoke ──
      // Smoke trail particles
      if (m.smokeTrail) {
        m.smokeTrail.forEach(s => {
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r * s.life, 0, Math.PI*2);
          ctx.fillStyle = `rgba(180,190,200,${s.life * 0.35})`;
          ctx.fill();
        });
      }
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.angle);
      // Main body
      ctx.fillStyle = '#CCDDEE';
      ctx.shadowColor = '#88CCFF'; ctx.shadowBlur = 10;
      ctx.fillRect(-10, -2.5, 20, 5);
      // Nose cone
      ctx.fillStyle = '#AADDFF';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(6, -3);
      ctx.lineTo(6, 3);
      ctx.closePath(); ctx.fill();
      // Two side fins
      ctx.fillStyle = '#7799BB';
      ctx.fillRect(-10, -4.5, 5, 2);
      ctx.fillRect(-10, 2.5, 5, 2);
      // Engine glow
      const eGrd = ctx.createRadialGradient(-10, 0, 0, -10, 0, 8);
      eGrd.addColorStop(0, 'rgba(100,200,255,0.9)');
      eGrd.addColorStop(1, 'transparent');
      ctx.fillStyle = eGrd;
      ctx.beginPath(); ctx.arc(-10, 0, 8, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    } else {
      // ── ENEMY MISSILE: simple orange bar ──
      if (m.trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(m.trail[0].x, m.trail[0].y);
        m.trail.forEach(t => ctx.lineTo(t.x, t.y));
        ctx.strokeStyle = 'rgba(255,80,0,0.25)';
        ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.angle);
      ctx.fillStyle = '#FF5500';
      ctx.shadowColor = '#FF4400'; ctx.shadowBlur = 8;
      ctx.fillRect(-7, -1.5, 14, 3);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  });

  // Worms
  worms.forEach(w => drawWorm(w));

  // Mission
  drawMission();
  drawOre();
  drawScannerDrop();
  drawStationBeacon();

  // Ship smoke
  if (ship) {
    ship.smokeParticles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(100,120,140,${p.life * 0.3})`;
      ctx.fill();
    });

    // Ship trail
    if (ship.trail.length > 1) {
      ctx.beginPath();
      ship.trail.forEach((t, i) => {
        i === 0 ? ctx.moveTo(t.x, t.y) : ctx.lineTo(t.x, t.y);
      });
      ctx.strokeStyle = 'rgba(0,200,255,0.15)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    drawShip();
  }

  ctx.restore();

  // Mobile joystick rings -- drawn AFTER world so they appear on top

  // MOVE ring
  if (window.innerWidth <= 900) {
    const jx = _spJoy.active ? _spJoy.startX : 80;
    const jy = _spJoy.active ? _spJoy.startY : H - 160;
    ctx.save();
    ctx.beginPath(); ctx.arc(jx, jy, 52, 0, Math.PI*2);
    ctx.strokeStyle = _spJoy.active ? 'rgba(255,255,255,0.98)' : 'rgba(200,220,255,0.85)';
    ctx.lineWidth = 2.5; ctx.stroke();
    if (_spJoy.active) {
      ctx.beginPath(); ctx.arc(jx + _spJoy.dx*52, jy + _spJoy.dy*52, 22, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(220,235,255,0.55)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.98)'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.font = 'bold 9px Courier New';
    ctx.fillStyle = `rgba(200,220,255,${_spJoy.active ? 0.95 : 0.75})`;
    ctx.fillText('MOVE', jx, jy + 52 + 14);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // Ship-center reticule -- always shows current aim direction
  if (window.innerWidth <= 900 && ship) {
    if (_spAimFlash > 0) _spAimFlash = Math.max(0, _spAimFlash - 0.08);
    const rR    = 90;
    const rX    = W/2 + Math.cos(_spLastAimAngle) * rR;
    const rY    = H/2 + Math.sin(_spLastAimAngle) * rR;
    const alpha = 0.3 + _spAimFlash * 0.65;
    ctx.save();
    // Dim guide circle around ship
    ctx.beginPath(); ctx.arc(W/2, H/2, rR, 0, Math.PI*2);
    ctx.strokeStyle = `rgba(0,200,255,${0.1 + _spAimFlash * 0.15})`;
    ctx.lineWidth = 1; ctx.stroke();
    // Aim crosshair at ring edge
    ctx.beginPath(); ctx.arc(rX, rY, 9, 0, Math.PI*2);
    ctx.fillStyle = `rgba(0,220,255,${alpha * 0.25})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(0,220,255,${alpha})`;
    ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.85})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(rX-7, rY); ctx.lineTo(rX+7, rY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rX, rY-7); ctx.lineTo(rX, rY+7); ctx.stroke();
    ctx.restore();
  }

  // AIM joystick ring -- right side, clear of phone chrome
  if (window.innerWidth <= 900 && ship) {
    const ajx   = W - 145;
    const ajy   = H - 150;
    const ajR   = 44;
    const ajOn  = _spAimJoy && _spAimJoy.active;
    const lineX = ajx + Math.cos(_spLastAimAngle) * (ajR - 10);
    const lineY = ajy + Math.sin(_spLastAimAngle) * (ajR - 10);
    ctx.save();
    ctx.beginPath(); ctx.arc(ajx, ajy, ajR, 0, Math.PI*2);
    ctx.strokeStyle = ajOn ? 'rgba(0,230,255,0.95)' : 'rgba(0,210,255,0.7)';
    ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(ajx, ajy, ajR, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,130,230,0.1)';
    ctx.fill();
    // Direction line
    ctx.strokeStyle = `rgba(0,230,255,${0.7 + _spAimFlash * 0.25})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(ajx, ajy); ctx.lineTo(lineX, lineY); ctx.stroke();
    // Dot at tip
    ctx.beginPath(); ctx.arc(lineX, lineY, 6, 0, Math.PI*2);
    ctx.fillStyle = `rgba(0,230,255,${0.8 + _spAimFlash * 0.2})`;
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = 'bold 9px Courier New';
    ctx.fillStyle = `rgba(0,210,255,${ajOn ? 1.0 : 0.75})`;
    ctx.fillText('AIM', ajx, ajy + ajR + 14);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // Fog of war overlay
  drawFogOfWar(W, H);

  // Warp flash
  if (ship && ship.warpFlash > 0) {
    ctx.fillStyle = `rgba(200,240,255,${ship.warpFlash * 0.6})`;
    ctx.fillRect(0, 0, W, H);
  }

  // HUD
  drawTacticalHUD(W, H);
  drawMiniMap(W, H);
  drawWeaponHUD(W, H);
  drawShipStatus(W, H);
  drawBoundaryWarning(W, H);
  drawScannerOverlay(W, H);

  // Waveform only every 3 frames
  if (_frameCount % 3 === 0) animateWaveform();
}

function drawShip() {
  if (!ship) return;
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle + Math.PI/2);

  const s = 14;

  // Engine glow
  if (ship.thrusting) {
    const grd = ctx.createRadialGradient(0, s*1.2, 0, 0, s*1.2, s*1.8);
    grd.addColorStop(0, 'rgba(0,150,255,0.8)');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, s*1.2, s*1.8, 0, Math.PI*2);
    ctx.fill();
  }

  // Hull
  ctx.beginPath();
  ctx.moveTo(0, -s*1.4);
  ctx.lineTo(s*0.7, s*0.8);
  ctx.lineTo(s*0.4, s*0.4);
  ctx.lineTo(0, s*0.6);
  ctx.lineTo(-s*0.4, s*0.4);
  ctx.lineTo(-s*0.7, s*0.8);
  ctx.closePath();
  ctx.fillStyle = '#AACCDD';
  ctx.fill();
  ctx.strokeStyle = '#DDEEFF';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Cockpit
  ctx.beginPath();
  ctx.ellipse(0, -s*0.4, s*0.3, s*0.5, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(100,200,255,0.7)';
  ctx.fill();

  // Shield glow if active
  if (ship.shield > 0) {
    ctx.beginPath();
    ctx.arc(0, 0, s*1.8, 0, Math.PI*2);
    ctx.strokeStyle = `rgba(0,200,255,${ship.shield/100 * 0.3})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Smoke damage visual
  if (ship.systems.engine === false) {
    ctx.fillStyle = 'rgba(100,80,60,0.6)';
    ctx.fillRect(-4, 4, 8, 6);
  }

  ctx.restore();

  // Ship light (drawn in world space for fog mask)
}

function drawOtherShip(os) {
  // Red outline if in gray zone
  const dx = ship ? os.x - ship.x : 0;
  const dy = ship ? os.y - ship.y : 0;
  const dist = Math.sqrt(dx*dx+dy*dy);
  const inGray = dist < AMBIENT_RADIUS && dist > LIGHT_RADIUS;

  ctx.save();
  ctx.translate(os.x, os.y);
  ctx.rotate(os.angle + Math.PI/2);
  const s = 12;

  if (inGray) {
    ctx.beginPath();
    ctx.arc(0, 0, s*2, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,50,50,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Faint glow
  const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, s*3);
  grd.addColorStop(0, 'rgba(150,200,255,0.3)');
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(0, 0, s*3, 0, Math.PI*2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, -s*1.4);
  ctx.lineTo(s*0.7, s*0.8);
  ctx.lineTo(0, s*0.6);
  ctx.lineTo(-s*0.7, s*0.8);
  ctx.closePath();
  ctx.fillStyle = inGray ? '#FF4444' : '#88AACC';
  ctx.fill();
  ctx.restore();

  // Username
  if (dist < LIGHT_RADIUS * 1.5) {
    const sx = os.x - cameraX + canvas.width/2;
    const sy = os.y - cameraY + canvas.height/2;
    ctx.save();
    ctx.font = '11px Courier New';
    ctx.fillStyle = inGray ? 'rgba(255,80,80,0.7)' : 'rgba(100,200,255,0.7)';
    ctx.textAlign = 'center';
    ctx.fillText(os.username, os.x, os.y - 22);
    ctx.restore();
  }
}

function drawWorm(w) {
  if (!w.visible || w.alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = w.alpha;

  const baseR = w.isLeviathan ? 38 * w.size : 18 * w.size;

  // Body segments
  w.segments.forEach((seg, i) => {
    const ratio = i / w.segments.length;
    const r = baseR * (1 - ratio * 0.5);
    const brightness = w.isLeviathan ? 20 : 30;

    // Segment glow
    const grd = ctx.createRadialGradient(seg.x, seg.y, 0, seg.x, seg.y, r*1.5);
    grd.addColorStop(0, w.isLeviathan ? `rgba(40,0,60,0.8)` : `rgba(0,40,30,0.6)`);
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(seg.x, seg.y, r*1.5, 0, Math.PI*2);
    ctx.fill();

    // Segment body
    ctx.beginPath();
    ctx.arc(seg.x, seg.y, r, 0, Math.PI*2);
    ctx.fillStyle = w.isLeviathan
      ? `rgb(${brightness},0,${brightness*2})`
      : `rgb(0,${brightness*1.5},${brightness})`;
    ctx.fill();
    ctx.strokeStyle = w.isLeviathan ? 'rgba(120,0,180,0.4)' : 'rgba(0,180,120,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Head details
  const head = w.segments[0];
  const headR = baseR * 1.4;

  // Eyes
  const eyeFlashIntensity = w.eyeFlash > 0 ? w.eyeFlash : 0;
  const eyeOffset = headR * 0.5;
  const perpAngle = w.angle + Math.PI/2;
  const eye1x = head.x + Math.cos(perpAngle) * eyeOffset;
  const eye1y = head.y + Math.sin(perpAngle) * eyeOffset;
  const eye2x = head.x - Math.cos(perpAngle) * eyeOffset;
  const eye2y = head.y - Math.sin(perpAngle) * eyeOffset;

  [eye1x, eye2x].forEach((ex, i) => {
    const ey = i === 0 ? eye1y : eye2y;
    ctx.beginPath();
    ctx.arc(ex, ey, headR*0.25, 0, Math.PI*2);
    ctx.fillStyle = `rgba(255,${w.isLeviathan ? 0 : 200},0,${0.6 + eyeFlashIntensity*0.4})`;
    ctx.shadowColor = w.isLeviathan ? '#FF0000' : '#FFCC00';
    ctx.shadowBlur = 10 + eyeFlashIntensity * 20;
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  // Teeth
  if (!w.isLeviathan) {
    const teethCount = 6;
    for (let t = 0; t < teethCount; t++) {
      const ta = w.angle + (t/teethCount - 0.5) * 0.8;
      const tx = head.x + Math.cos(ta) * headR;
      const ty = head.y + Math.sin(ta) * headR;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + Math.cos(ta)*headR*0.4, ty + Math.sin(ta)*headR*0.4);
      ctx.strokeStyle = 'rgba(200,255,220,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Angler light (worm 1 only)
  if (!w.isLeviathan) {
    const anglerDist = headR * 1.8;
    const ax = head.x + Math.cos(w.angle) * anglerDist;
    const ay = head.y + Math.sin(w.angle) * anglerDist;
    const pulse = 0.7 + Math.sin(w.anglerPulse) * 0.3;

    const agrd = ctx.createRadialGradient(ax, ay, 0, ax, ay, 40);
    agrd.addColorStop(0, `rgba(200,255,150,${pulse * 0.9})`);
    agrd.addColorStop(0.3, `rgba(100,255,100,${pulse * 0.4})`);
    agrd.addColorStop(1, 'transparent');
    ctx.fillStyle = agrd;
    ctx.beginPath();
    ctx.arc(ax, ay, 40, 0, Math.PI*2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(ax, ay, 5, 0, Math.PI*2);
    ctx.fillStyle = `rgba(220,255,180,${pulse})`;
    ctx.shadowColor = '#AAFFAA';
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

let fogCanvas = null;
let fogCtx = null;

function ensureFogCanvas(W, H) {
  if (!fogCanvas || fogCanvas.width !== W || fogCanvas.height !== H) {
    fogCanvas = document.createElement('canvas');
    fogCanvas.width = W; fogCanvas.height = H;
    fogCtx = fogCanvas.getContext('2d');
  }
}

function drawFogOfWar(W, H) {
  if (!ship) return;
  ensureFogCanvas(W, H);
  const shipScreenX = W/2;
  const shipScreenY = H/2;
  // Scanner expands the fog reveal
  const fogScale = scanZoom || 1.0;
  const lightR   = LIGHT_RADIUS * fogScale;
  const ambR     = AMBIENT_RADIUS * fogScale;
  const flashR   = FLASHLIGHT_R * fogScale;

  fogCtx.clearRect(0, 0, W, H);
  fogCtx.fillStyle = '#000010';
  fogCtx.fillRect(0, 0, W, H);

  fogCtx.globalCompositeOperation = 'destination-out';

  // Ambient area
  const ambGrd = fogCtx.createRadialGradient(
    shipScreenX, shipScreenY, lightR * 0.3,
    shipScreenX, shipScreenY, ambR
  );
  ambGrd.addColorStop(0, 'rgba(0,0,0,0.85)');
  ambGrd.addColorStop(0.6, 'rgba(0,0,0,0.5)');
  ambGrd.addColorStop(1, 'rgba(0,0,0,0)');
  fogCtx.fillStyle = ambGrd;
  fogCtx.beginPath();
  fogCtx.arc(shipScreenX, shipScreenY, ambR, 0, Math.PI*2);
  fogCtx.fill();

  // Light bubble
  const lightGrd = fogCtx.createRadialGradient(
    shipScreenX, shipScreenY, 0,
    shipScreenX, shipScreenY, lightR
  );
  lightGrd.addColorStop(0, 'rgba(0,0,0,1)');
  lightGrd.addColorStop(0.7, 'rgba(0,0,0,0.95)');
  lightGrd.addColorStop(1, 'rgba(0,0,0,0)');
  fogCtx.fillStyle = lightGrd;
  fogCtx.beginPath();
  fogCtx.arc(shipScreenX, shipScreenY, lightR, 0, Math.PI*2);
  fogCtx.fill();

  // Flashlight cone
  const flashAngle = ship.angle;
  const flashX = shipScreenX + Math.cos(flashAngle) * flashR * 0.5;
  const flashY = shipScreenY + Math.sin(flashAngle) * flashR * 0.5;
  const flashGrd = fogCtx.createRadialGradient(flashX, flashY, 0, flashX, flashY, flashR * 2);
  flashGrd.addColorStop(0, 'rgba(0,0,0,1)');
  flashGrd.addColorStop(0.5, 'rgba(0,0,0,0.8)');
  flashGrd.addColorStop(1, 'rgba(0,0,0,0)');
  fogCtx.fillStyle = flashGrd;
  fogCtx.beginPath();
  fogCtx.arc(flashX, flashY, flashR * 2, 0, Math.PI*2);
  fogCtx.fill();

  fogCtx.globalCompositeOperation = 'source-over';

  ctx.drawImage(fogCanvas, 0, 0);
  ctx.fillStyle = 'rgba(0,5,20,0.25)';
  ctx.fillRect(0, 0, W, H);
}

function drawSpaceHUD(W, H) {
  if (!ship) return;

  // Shield bar
  const shieldColor = ship.shield > 60 ? '#00FFCC' : ship.shield > 30 ? '#FFCC00' : '#FF4444';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(16, H - 60, 160, 14);
  ctx.fillStyle = shieldColor;
  ctx.fillRect(16, H - 60, 160 * (ship.shield/100), 14);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(16, H - 60, 160, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '10px Courier New';
  ctx.fillText(`SHIELD ${ship.shield}%`, 20, H - 49);

  // Warp cooldown
  const warpReady = warpCooldown <= 0;
  ctx.fillStyle = warpReady ? 'rgba(0,200,255,0.8)' : 'rgba(100,100,100,0.5)';
  ctx.font = '11px Courier New';
  ctx.fillText(warpReady ? '⚡ WARP READY' : `⚡ ${Math.ceil(warpCooldown/60)}s`, 16, H - 30);

  // System damage indicators
  let sysY = H - 90;
  Object.entries(ship.systems).forEach(([sys, ok]) => {
    if (!ok) {
      ctx.fillStyle = 'rgba(255,80,80,0.9)';
      ctx.font = '10px Courier New';
      ctx.fillText(`⚠ ${sys.toUpperCase()} OFFLINE`, 16, sysY);
      sysY -= 14;
    }
  });

  // Zone indicator
  ctx.fillStyle = 'rgba(0,255,180,0.4)';
  ctx.font = '10px Courier New';
  ctx.textAlign = 'right';
  ctx.fillText('SECTOR: SW-ALPHA', W - 16, H - 16);
  ctx.textAlign = 'left';

  // Warp warning during charge
  if (scriptPhase === 'worm1_charge') {
    const pulse = 0.5 + Math.sin(Date.now() * 0.012) * 0.5;
    ctx.fillStyle = `rgba(255,30,30,${pulse})`;
    ctx.font = `bold ${window.innerWidth < 768 ? 20 : 26}px Courier New`;
    ctx.textAlign = 'center';
    ctx.fillText('PRESS SPACE TO WARP', W/2, H/2 + 90);
    ctx.textAlign = 'left';
  }
}

function drawShipStatus(W, H) {
  if (!ship) return;
  const x = 12, y = H - 12;
  const pw = 160, ph = 70;
  const t = Date.now() * 0.001;

  // Panel background
  ctx.fillStyle = 'rgba(0,8,22,0.78)';
  ctx.strokeStyle = 'rgba(0,180,220,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x, y - ph, pw, ph, 8); ctx.fill(); ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Title
  ctx.font = 'bold 8px Courier New';
  ctx.fillStyle = 'rgba(0,200,220,0.55)';
  ctx.fillText('SHIP STATUS', x + 8, y - ph + 7);

  // Cargo bar
  const cargoY = y - ph + 20;
  const cargoPct = shipCargo.ore / shipCargo.maxOre;
  ctx.fillStyle = 'rgba(0,200,255,0.12)';
  ctx.fillRect(x+8, cargoY, pw-16, 10);
  ctx.fillStyle = cargoPct > 0.8 ? 'rgba(255,140,0,0.8)' : 'rgba(0,180,255,0.75)';
  ctx.fillRect(x+8, cargoY, (pw-16)*cargoPct, 10);
  ctx.strokeStyle = 'rgba(0,180,255,0.3)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(x+8, cargoY, pw-16, 10);
  ctx.font = '8px Courier New';
  ctx.fillStyle = 'rgba(180,230,255,0.8)';
  ctx.fillText(`ORE  ${shipCargo.ore}/${shipCargo.maxOre}`, x+10, cargoY + 1);

  // Missiles
  const mslY = cargoY + 16;
  ctx.fillStyle = 'rgba(180,230,255,0.5)';
  ctx.font = '8px Courier New';
  ctx.fillText(`MSSL  ${missileCount}/25`, x+10, mslY);

  // Warp cooldown
  const warpY = mslY + 13;
  const warpPct = Math.max(0, 1 - warpCooldown / 300);
  ctx.fillStyle = 'rgba(100,180,255,0.1)';
  ctx.fillRect(x+8, warpY, pw-16, 8);
  ctx.fillStyle = warpPct >= 1 ? 'rgba(0,220,255,0.8)' : 'rgba(60,120,200,0.6)';
  ctx.fillRect(x+8, warpY, (pw-16)*warpPct, 8);
  ctx.strokeStyle = 'rgba(0,180,255,0.25)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(x+8, warpY, pw-16, 8);
  ctx.fillStyle = warpPct >= 1 ? 'rgba(0,220,255,0.9)' : 'rgba(100,160,220,0.6)';
  ctx.fillText(warpPct >= 1 ? 'WARP  READY' : `WARP  ${Math.ceil(warpCooldown/60)}s`, x+10, warpY);

  ctx.textBaseline = 'alphabetic';
}

function drawBoundaryWarning(W, H) {
  if (!ship) return;
  const mapLimit = WORLD_W * 0.44;
  const distFromCenter = Math.sqrt((ship.x - WORLD_W/2)**2 + (ship.y - WORLD_H/2)**2);
  if (distFromCenter < mapLimit * 0.88) return;

  const t = Date.now() * 0.001;
  const pulse = 0.5 + Math.sin(t * 6) * 0.4;

  // Border flicker
  ctx.strokeStyle = `rgba(255,80,30,${pulse * 0.7})`;
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, W-8, H-8);

  // Warning text
  ctx.textAlign = 'center';
  ctx.font = `bold ${W < 768 ? 14 : 16}px Courier New`;
  ctx.fillStyle = `rgba(255,80,30,${pulse})`;
  ctx.shadowColor = `rgba(255,60,0,${pulse*0.6})`;
  ctx.shadowBlur = 10;
  ctx.fillText('⚠ DANGEROUS SPACE — REDIRECTING', W/2, 60);
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';
}

function updateScannerDrop(dt) {
  if (!scannerDrop || scannerDrop.collected || !ship) return;
  scannerDrop.pulse = (scannerDrop.pulse || 0) + dt * 3;

  // Collect on approach
  const dx = ship.x - scannerDrop.x, dy = ship.y - scannerDrop.y;
  if (Math.sqrt(dx*dx+dy*dy) < 30) {
    scannerDrop.collected = true;
    hasScanner = true;
    if (mobileBtns.scan) mobileBtns.scan.style.display = 'flex';
    NOTIFY("Scanner acquired. Tap SCAN or press E to scan.");
    playWarp();
    // Now reveal the station beacon
    if (stationBeacon) {
      stationBeacon.visible = true;
      setTimeout(() => queueAI("New signal. Station bearing 045."), 800);
    }
  }
}

function drawScannerDrop() {
  if (!scannerDrop || scannerDrop.collected) return;
  const t = Date.now() * 0.003;
  const { x, y } = scannerDrop;

  // Outer pulse rings
  [1, 2].forEach(i => {
    const r = 20 + i * 18 + Math.sin(t * 2 + i) * 6;
    const alpha = (0.6 - i * 0.2) * (0.5 + Math.sin(t*3)*0.3);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.strokeStyle = `rgba(0,255,180,${alpha})`;
    ctx.lineWidth = 1.5; ctx.stroke();
  });

  // Icon — small hexagon glow
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 0.5);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i/6)*Math.PI*2;
    i===0 ? ctx.moveTo(Math.cos(a)*10, Math.sin(a)*10)
           : ctx.lineTo(Math.cos(a)*10, Math.sin(a)*10);
  }
  ctx.closePath();
  ctx.strokeStyle = 'rgba(0,255,180,0.9)';
  ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = 'rgba(0,255,180,0.15)'; ctx.fill();

  // Center dot
  ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI*2);
  ctx.fillStyle = '#00FFB8';
  ctx.shadowColor = '#00FFB8'; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0;
  ctx.restore();

  // Label
  ctx.fillStyle = 'rgba(0,255,180,0.8)';
  ctx.font = 'bold 10px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('SCANNER', x, y - 22);
  ctx.textAlign = 'left';
}

function drawStationBeacon() {
  if (!stationBeacon?.visible || !ship) return;
  const t = Date.now() * 0.001;
  const { x, y } = stationBeacon;

  // Pulsing station marker
  const pulse = 0.5 + Math.sin(t*2)*0.4;
  const grd = ctx.createRadialGradient(x, y, 0, x, y, 60);
  grd.addColorStop(0, `rgba(255,200,50,${pulse*0.4})`);
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(x, y, 60, 0, Math.PI*2); ctx.fill();

  // Station icon — cross/plus shape
  ctx.strokeStyle = `rgba(255,200,50,${pulse*0.9})`;
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(255,180,0,0.6)'; ctx.shadowBlur = 12;
  [[x-14,y,x+14,y],[x,y-14,x,y+14]].forEach(([x1,y1,x2,y2]) => {
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  });
  ctx.shadowBlur = 0;

  // Label
  ctx.fillStyle = `rgba(255,200,50,${pulse})`;
  ctx.font = 'bold 11px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('STATION ALPHA', x, y - 22);
  ctx.font = '9px Courier New';
  ctx.fillStyle = 'rgba(255,200,50,0.55)';
  ctx.fillText('fly to dock', x, y - 10);
  ctx.textAlign = 'left';

  // On minimap — orange dot
  // (handled in drawMiniMap via stationBeacon check)

  // Check if player reaches it
  if (ship) {
    const dx = ship.x - x, dy = ship.y - y;
    if (Math.sqrt(dx*dx+dy*dy) < 80) {
      triggerStationTransition();
    }
  }
}

function triggerStationTransition() {
  if (window._stationTransitioning) return;
  window._stationTransitioning = true;

  // Kill space immediately -- black out everything before earth can show
  spaceActive = false;
  canvas.style.display = 'none';
  aiTerminal.style.display = 'none';
  stopSpaceMusic();
  window._spaceOverride = false;
  // Hide mobile space HUD
  var _smhud = document.getElementById('spaceMobileHUD');
  if (_smhud) _smhud.style.display = 'none';

  // Hide earth's 3D renderer canvas too -- kills the chicken/earth bleed
  const earthCv = [...document.querySelectorAll('canvas')].find(c => c !== canvas);
  if (earthCv) { earthCv.style.display = 'none'; window._earthCanvasHidden = earthCv; }

  // Black overlay goes up instantly
  const blackout = document.createElement('div');
  blackout.style.cssText = 'position:fixed;inset:0;background:#000;z-index:509;';
  document.body.appendChild(blackout);

  // Wormhole canvas on top
  const wc = document.createElement('canvas');
  wc.style.cssText = 'position:fixed;inset:0;z-index:510;';
  wc.width = window.innerWidth; wc.height = window.innerHeight;
  document.body.appendChild(wc);
  const wx = wc.getContext('2d');
  const W = wc.width, H = wc.height;
  const cx = W/2, cy = H/2;
  let wt = 0;
  const DURATION = 5500; // 5.5 seconds
  const startTime = Date.now();

  function drawWormhole() {
    wt = (Date.now() - startTime) / DURATION;
    if (wt > 1) wt = 1;
    wx.clearRect(0, 0, W, H);
    wx.fillStyle = '#000';
    wx.fillRect(0, 0, W, H);

    // Rings rushing toward center (tunnel effect)
    const rings = 18;
    for (let i = 0; i < rings; i++) {
      const phase = ((i / rings) + wt * 2.5) % 1;
      const r = (1 - phase) * Math.max(W, H) * 0.75;
      const alpha = phase * (1 - phase) * 3.5;
      const hue = 200 + i * 8 + wt * 60;
      wx.beginPath();
      wx.arc(cx, cy, r, 0, Math.PI * 2);
      wx.strokeStyle = `hsla(${hue},90%,60%,${alpha})`;
      wx.lineWidth = 2 + phase * 6;
      wx.stroke();
    }

    // Streaking lines
    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * Math.PI * 2;
      const speed = 0.4 + (i % 5) * 0.15;
      const len = wt * speed * Math.max(W, H) * 0.6;
      const x1 = cx + Math.cos(angle) * len * 0.2;
      const y1 = cy + Math.sin(angle) * len * 0.2;
      const x2 = cx + Math.cos(angle) * len;
      const y2 = cy + Math.sin(angle) * len;
      wx.beginPath(); wx.moveTo(x1, y1); wx.lineTo(x2, y2);
      const hue2 = 180 + i * 5;
      wx.strokeStyle = `hsla(${hue2},80%,70%,${0.3 + wt * 0.4})`;
      wx.lineWidth = 1;
      wx.stroke();
    }

    // Center glow
    const grd = wx.createRadialGradient(cx, cy, 0, cx, cy, 120 + wt * 80);
    grd.addColorStop(0, `rgba(100,200,255,${0.6 + wt * 0.3})`);
    grd.addColorStop(0.4, `rgba(50,100,200,${0.3 * wt})`);
    grd.addColorStop(1, 'transparent');
    wx.fillStyle = grd;
    wx.beginPath(); wx.arc(cx, cy, 200, 0, Math.PI * 2); wx.fill();

    // Text
    if (wt > 0.5) {
      const textAlpha = (wt - 0.5) * 2;
      wx.fillStyle = `rgba(150,220,255,${textAlpha * 0.8})`;
      wx.font = 'bold 14px Courier New';
      wx.textAlign = 'center';
      wx.fillText('APPROACHING STATION ALPHA', cx, cy + 160);
    }

    if (wt < 1) {
      requestAnimationFrame(drawWormhole);
    } else {
      // Fade out wormhole
      let fadeOut = 0;
      const fo = setInterval(() => {
        fadeOut += 0.06;
        wc.style.opacity = Math.max(0, 1 - fadeOut);
        if (fadeOut >= 1) {
          clearInterval(fo);
          wc.remove();
          showStationArrival(blackout);
        }
      }, 30);
    }
  }
  drawWormhole();
}

function showStationArrival(blackout) {
  window._stationTransitioning = false;

  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;background:#000;z-index:511;
    display:flex;align-items:center;justify-content:center;flex-direction:column;
    font-family:'Courier New',monospace;color:white;`;
  overlay.innerHTML = `
    <div style="opacity:0;transition:opacity 2s;font-size:1.4rem;letter-spacing:0.25em;color:rgba(255,200,50,0.95);text-shadow:0 0 20px rgba(255,180,0,0.5);" id="stA">STATION ALPHA</div>
    <div style="opacity:0;transition:opacity 2s;font-size:0.8rem;margin-top:10px;color:rgba(255,255,255,0.35);letter-spacing:0.1em;" id="stB">SW-ALPHA SECTOR  //  DOCKING COMPLETE</div>
  `;
  document.body.appendChild(overlay);
  blackout?.remove();

  setTimeout(() => document.getElementById('stA').style.opacity = '1', 200);
  setTimeout(() => document.getElementById('stB').style.opacity = '1', 1200);
  setTimeout(() => {
    overlay.style.transition = 'opacity 1.2s';
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.remove();
      window.enterStation?.();
    }, 1200);
  }, 5500);
}

function activateScanner() {
  if (!hasScanner || scannerActive) return;
  scannerActive = true;
  scannerTimer = 0;
  scanTargets = [];
  playWarp();

  // Detect enemies and objectives in a wide radius
  const scanRadius = 1200;
  enemies.forEach((e, i) => {
    if (!e.alive) return;
    const dx = e.x - ship.x, dy = e.y - ship.y;
    const dist = Math.sqrt(dx*dx+dy*dy);
    if (dist < scanRadius) {
      scanTargets.push({
        x: e.x, y: e.y,
        type: 'enemy',
        label: `BANDIT ${dist < 400 ? '⚠' : ''}`,
        hp: Math.round((e.shield / (e.maxShield||250))*100),
        dist: Math.round(dist),
      });
    }
  });

  // Station beacon
  if (stationBeacon?.visible) {
    const dx = stationBeacon.x - ship.x, dy = stationBeacon.y - ship.y;
    scanTargets.push({
      x: stationBeacon.x, y: stationBeacon.y,
      type: 'objective',
      label: 'STATION ALPHA',
      dist: Math.round(Math.sqrt(dx*dx+dy*dy)),
    });
  }

  // Wreck if not yet visited
  if (wreck && !wreck.visited) {
    const dx = wreck.x - ship.x, dy = wreck.y - ship.y;
    scanTargets.push({
      x: wreck.x, y: wreck.y,
      type: 'objective',
      label: 'DEBRIS FIELD',
      dist: Math.round(Math.sqrt(dx*dx+dy*dy)),
    });
  }

  const found = scanTargets.length;
  queueAI(found > 0 ? `Scan: ${found} contact${found>1?'s':''} detected.` : "Scan: sector clear.");
}

function updateScanner(dt) {
  if (!scannerActive) {
    // Decay zoom back to normal
    if (scanZoom > 1.0) scanZoom = Math.max(1.0, scanZoom - dt * 0.8);
    return;
  }
  scannerTimer += dt;

  // Zoom out during active scan
  const targetZoom = 2.2;
  scanZoom += (targetZoom - scanZoom) * dt * 2.5;

  if (scannerTimer >= SCANNER_DURATION) {
    scannerActive = false;
    scannerTimer = 0;
    // Keep targets visible as arrows for 30s after scan
    scanTargets.forEach(t => t.fadeTimer = 30);
  }
}

function drawScannerOverlay(W, H) {
  if (!hasScanner) return;
  const t = Date.now() * 0.001;

  // Scan pulse ring expanding from ship center
  if (scannerActive) {
    const progress = scannerTimer / SCANNER_DURATION;
    const maxR = Math.min(W, H) * 0.48;
    const ringR = progress * maxR;

    ctx.beginPath(); ctx.arc(W/2, H/2, ringR, 0, Math.PI*2);
    ctx.strokeStyle = `rgba(0,255,180,${(1-progress)*0.5})`;
    ctx.lineWidth = 2; ctx.stroke();

    // Second smaller ring
    if (ringR > 40) {
      ctx.beginPath(); ctx.arc(W/2, H/2, ringR * 0.6, 0, Math.PI*2);
      ctx.strokeStyle = `rgba(0,200,255,${(1-progress)*0.3})`;
      ctx.lineWidth = 1; ctx.stroke();
    }

    // Scanner active indicator
    ctx.fillStyle = `rgba(0,255,180,${0.6+Math.sin(t*8)*0.3})`;
    ctx.font = 'bold 11px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('SCANNING...', W/2, 80);
    ctx.textAlign = 'left';
  }

  // Draw target arrows + labels for all detected contacts
  scanTargets.forEach(target => {
    if (!ship) return;

    // Fade timer decay
    if (!scannerActive) {
      target.fadeTimer = Math.max(0, (target.fadeTimer||0) - 0.016);
      if (target.fadeTimer <= 0) return;
    }

    const alpha = scannerActive ? 1 : Math.min(1, (target.fadeTimer||0) / 5);
    if (alpha <= 0) return;

    // Project world position to screen
    const sx = W/2 + (target.x - ship.x) * (1/scanZoom);
    const sy = H/2 + (target.y - ship.y) * (1/scanZoom);
    const onScreen = sx > 20 && sx < W-20 && sy > 20 && sy < H-20;

    const enemyColor  = [255, 60, 60];
    const objColor    = [255, 200, 50];
    const col = target.type === 'enemy' ? enemyColor : objColor;

    if (onScreen) {
      // Red outline box around enemy
      if (target.type === 'enemy') {
        ctx.strokeStyle = `rgba(${col},${alpha*0.8})`.replace('rgba(${col}',`rgba(${col[0]},${col[1]},${col[2]}`);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx-18, sy-18, 36, 36);
        // Corner ticks
        [[sx-18,sy-18],[sx+18,sy-18],[sx-18,sy+18],[sx+18,sy+18]].forEach(([cx2,cy2]) => {
          ctx.beginPath(); ctx.moveTo(cx2,cy2); ctx.lineTo(cx2+(cx2<sx?6:-6),cy2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx2,cy2); ctx.lineTo(cx2,cy2+(cy2<sy?6:-6)); ctx.stroke();
        });
      }
      // Label
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha*0.9})`;
      ctx.font = 'bold 9px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText(target.label, sx, sy - 24);
      if (target.type === 'enemy' && target.hp !== undefined) {
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha*0.6})`;
        ctx.fillText(`HP ${target.hp}%  ${target.dist}u`, sx, sy - 14);
      } else {
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha*0.5})`;
        ctx.fillText(`${target.dist}u`, sx, sy - 14);
      }
      ctx.textAlign = 'left';
    } else {
      // Off-screen arrow pointing toward target
      const angle = Math.atan2(target.y - ship.y, target.x - ship.x);
      const margin = 38;
      const ax = Math.max(margin, Math.min(W-margin, W/2 + Math.cos(angle)*((Math.min(W,H)/2)-margin)));
      const ay = Math.max(margin, Math.min(H-margin, H/2 + Math.sin(angle)*((Math.min(W,H)/2)-margin)));

      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(angle);
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha*0.9})`;
      // Arrow triangle
      ctx.beginPath();
      ctx.moveTo(14, 0); ctx.lineTo(-8, -7); ctx.lineTo(-8, 7);
      ctx.closePath(); ctx.fill();
      ctx.restore();

      // Distance label
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha*0.7})`;
      ctx.font = 'bold 8px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText(`${target.dist}u`, ax, ay + 16);
      ctx.fillText(target.label, ax, ay + 25);
      ctx.textAlign = 'left';
    }
  });

  // Scanner button hint bottom-left area
  if (hasScanner && !scannerActive) {
    const cooldownDone = scannerTimer <= 0 || scannerTimer >= SCANNER_DURATION;
    ctx.fillStyle = 'rgba(0,255,180,0.3)';
    ctx.font = '9px Courier New';
    ctx.fillText('[E] SCAN', 16, 165);
  }
}

window.showEarthUI = showEarthUI;
window.hideEarthUI = hideEarthUI;

// ── MAIN LOOP ─────────────────────────────────────────────────────────────────
function loop(timestamp) {
  if (!spaceActive) return;
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// ── ENTER / EXIT SPACE ────────────────────────────────────────────────────────
function hideEarthUI() {
  SKT()?.emit('player:zone', { zone: 'space' });
  // Move player underground so earth players can't see them
  SKT()?.emit('player:move', { x: 0, y: -1000, z: 0, rotY: 0 });

  // Explicitly hide known earth HUD elements
  if (window._mineHUD) window._mineHUD.style.display = 'none';

  // Hide ALL fixed/absolute positioned elements except space ones
  document.querySelectorAll('*').forEach(el => {
    if (el === canvas || el === aiTerminal) return;
    if (el.id === 'spaceBtnBar' || el.id === 'rocketBtn') return;
    if (el.id === 'spaceMobileHUD' || el.closest?.('#spaceMobileHUD')) return;
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'BODY' || el.tagName === 'HTML') return;
    if (el.closest && (el.closest('#spaceBtnBar') || el.closest('#rocketBtn'))) return;
    const pos = el.style.position || window.getComputedStyle(el).position;
    if (pos === 'fixed' || pos === 'absolute') {
      if (!el.dataset.spaceHidden) {
        el.dataset.spaceHidden = el.style.display || 'show';
        el.style.display = 'none';
      }
    }
  });

  // Mute ALL audio -- nuclear option
  document.querySelectorAll('audio, video').forEach(a => {
    a._spaceVol = a.volume;
    a._spacePaused = a.paused;
    a.volume = 0;
    a.pause();
  });
  // Web Audio API gain nodes
  if (window._earthMusicGain) window._earthMusicGain.gain.value = 0;
  if (window._bgMusic) { window._bgMusicVol = window._bgMusic.volume; window._bgMusic.volume = 0; }
  if (window._howlMusic) { window._howlVol = window._howlMusic.volume(); window._howlMusic.volume(0); }
  // Tell main.js to mute
  window._spaceMuted = true;
  if (window._setMusicVolume) window._setMusicVolume(0);
}

function showEarthUI() {
  // Restore hidden elements -- skip canvases (station manages those)
  document.querySelectorAll('[data-space-hidden]').forEach(el => {
    if (el.tagName === 'CANVAS') return;
    const was = el.dataset.spaceHidden;
    if (was !== 'none') el.style.display = (was === 'show') ? '' : (was || '');
    delete el.dataset.spaceHidden;
  });

  // Restore mine HUD
  if (window._mineHUD) window._mineHUD.style.display = '';

  // Unmute audio
  document.querySelectorAll('audio, video').forEach(a => {
    a.volume = a._spaceVol !== undefined ? a._spaceVol : 1;
    if (!a._spacePaused) a.play().catch(()=>{});
  });
  if (window._earthMusicGain) window._earthMusicGain.gain.value = window._earthMusicVolume || 0.15;
  if (window._bgMusic) window._bgMusic.volume = window._bgMusicVol || 0.5;
  if (window._howlMusic) window._howlMusic.volume(window._howlVol || 0.5);
  window._spaceMuted = false;
  if (window._setMusicVolume) window._setMusicVolume(window._earthMusicVolume || 1);
  // Only emit earth zone if actually returning to earth (not going to station)
  if (window._playerZone === 'earth') {
    SKT()?.emit('player:zone', { zone: 'earth' });
    SKT()?.emit('player:move', { x: 0, y: 1.7, z: 8, rotY: 0 });
  }
}

window.enterSpace = () => {
  if (spaceActive) return;
  // Block earth position broadcast immediately -- before anything else
  window._spaceOverride = true;
  window._playerZone = 'space';
  SKT()?.emit('player:zone', { zone: 'space' });
  SKT()?.emit('player:move', { x: 0, y: -1000, z: 0, rotY: 0 });
  if (!audioCtx) initAudio();

  spaceActive = true;
  setupMobileControls(); // init mobile HUD now that space is active
  canvas.style.display = 'block';
  canvas.style.opacity = '1';
  ship = createShip();
  generateStars();
  worms = [];
  bullets = [];
  missiles = [];
  enemies = [];
  asteroids = [];
  explosions = [];
  enemyBullets = [];
  wreck = null;
  missionPhase = 'none';
  scannerDrop = null;
  stationBeacon = null;
  hasScanner = false;
  spaceOre = [];
  shipCargo = { ore: 0, maxOre: 10 };
  activeWeapon = 'guns';
  missileCount = 25;
  warpCooldown = 0;
  scriptPhase = 'intro';
  aiQueue = [];
  aiShowing = false;
  playerDead = false;

  hideEarthUI();
  window._spaceOverride = true;
  // Release all earth keys so character stops moving
  ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].forEach(code => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  });

  if (window.innerWidth <= 900) {
    var _ob=document.getElementById('spaceBtnBar'); if(_ob) _ob.style.display='none';
    var _nh=document.getElementById('spaceMobileHUD'); if(_nh) _nh.style.display='flex';
  } else {
    var _bb=document.getElementById('spaceBtnBar'); if(_bb) _bb.style.display='flex';
  }

  SKT()?.emit('space:enter');
  SKT()?.emit('player:zone', { zone: 'space' });
  window._playerZone = 'space';
  startSpaceMusic();
  playShipHum();

  // Music credit
  setTimeout(() => {
    const credit = document.createElement('div');
    credit.style.cssText = `
      position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
      background:rgba(0,0,0,0.6);color:rgba(255,255,255,0.45);
      font-family:'Courier New',monospace;font-size:11px;
      padding:6px 16px;border-radius:20px;z-index:501;pointer-events:none;
      border:1px solid rgba(255,255,255,0.1);transition:opacity 1.5s;
    `;
    credit.textContent = '♪ Music by Konstantin Nestsiarovich from Pixabay';
    document.body.appendChild(credit);
    setTimeout(() => { credit.style.opacity = '0'; }, 5000);
    setTimeout(() => credit.remove(), 6500);
  }, 2000);

  lastTime = performance.now();
  requestAnimationFrame(loop);
  startScript();
};

window.exitSpace = () => {
  spaceActive = false;
  canvas.style.display = 'none';
  aiTerminal.style.display = 'none';
  worms = [];
  bullets = [];
  missiles = [];
  const btnBar = document.getElementById('spaceBtnBar');
  if (btnBar) btnBar.style.display = 'none';
  const _mhud = document.getElementById('spaceMobileHUD');
  if (_mhud) _mhud.style.display = 'none';
  window._spaceOverride = false;
  showEarthUI();
  window._playerZone = 'earth';
  SKT()?.emit('player:zone', { zone: 'earth' });
  SKT()?.emit('space:leave');
  stopSpaceMusic();
  if (monthsOverlay) { monthsOverlay.remove(); monthsOverlay = null; }
  if (deathOverlay)  { deathOverlay.remove();  deathOverlay  = null; }
};

// ── SOCKET EVENTS ─────────────────────────────────────────────────────────────
function setupSocketEvents() {
  const skt = SKT(); if (!skt) return;

  skt.on('space:players', data => {
    otherShips = data;
  });

  skt.on('space:hailReceived', data => {
    const popup = document.createElement('div');
    popup.style.cssText = `
      position:fixed;top:80px;left:50%;transform:translateX(-50%);
      background:rgba(0,10,30,0.97);border:2px solid #00FFB8;
      border-radius:12px;padding:18px 24px;color:white;
      font-family:'Courier New',monospace;z-index:510;min-width:280px;text-align:center;
    `;
    popup.innerHTML = `
      <div style="color:#00FFB8;margin-bottom:8px;">📡 INCOMING HAIL</div>
      <div style="opacity:0.7;margin-bottom:4px;">${data.fromUsername}</div>
      ${data.offer > 0 ? `<div style="color:#FFD700;margin-bottom:12px;">Offers: ${data.offer.toLocaleString()} SB safe passage</div>` : '<div style="margin-bottom:12px;">Requests to negotiate.</div>'}
      <div style="display:flex;gap:8px;justify-content:center;">
        <button onclick="
          window._mineGetSocket?.().emit('space:hailResponse',{toSocketId:'${data.fromSocketId}',accepted:true,message:'Safe passage granted.'});
          this.closest('[style]').remove();
        " style="background:rgba(0,200,100,0.2);color:#44FF88;border:1px solid #44FF88;
          border-radius:6px;padding:8px 16px;cursor:pointer;font-family:'Courier New',monospace;">
          Accept
        </button>
        <button onclick="
          window._mineGetSocket?.().emit('space:hailResponse',{toSocketId:'${data.fromSocketId}',accepted:false,message:'Not interested.'});
          this.closest('[style]').remove();
        " style="background:rgba(255,50,50,0.2);color:#FF6666;border:1px solid #FF6666;
          border-radius:6px;padding:8px 16px;cursor:pointer;font-family:'Courier New',monospace;">
          Refuse
        </button>
      </div>
    `;
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 20000);
  });

  skt.on('space:hailResponse', data => {
    NOTIFY(`${data.fromUsername}: ${data.message}`);
  });

}


// ── INIT ──────────────────────────────────────────────────────────────────────
function init() {
  setupCanvas();
  // Mobile controls set up when space actually starts, not on load

  const _poll = setInterval(() => {
    if (SKT()) { setupSocketEvents(); clearInterval(_poll); }
  }, 1000);

}

(function waitForBridge() {
  if (window._mineScene && window._mineCamera) init();
  else setTimeout(waitForBridge, 200);
})();

// ══════════════════════════════════════════════════════════════
// ── ENEMY / MISSION SYSTEM ────────────────────────────────────
// ══════════════════════════════════════════════════════════════

let enemies = [];
let asteroids = [];
let wreck = null;
let missionPhase = 'none';
let checkpointState = null;
let scannerDrop = null;
let stationBeacon = null;
let hasScanner = false;
let scannerActive = false;
let scannerTimer = 0;      // how long scan pulse has been going
const SCANNER_DURATION = 4; // seconds scan stays active
let scanTargets = [];       // {x, y, type, label} detected by scan
let scanZoom = 1.0;         // camera zoom multiplier (fog radius)
let activeWeapon = 'guns'; // guns | missiles
let missileCount = 25;
let enemyBullets = [];
let explosions = [];

function spawnPostTutorial() {
  worms = [];
  missionPhase = 'wreck_spawned';

  // Wreck spawns ahead in the direction the player is facing
  const dist2 = 700;
  const rawWX = ship.x + Math.cos(ship.angle) * dist2 + (Math.random()-0.5)*200;
  const rawWY = ship.y + Math.sin(ship.angle) * dist2 + (Math.random()-0.5)*200;
  const SAFE2 = 1500;
  const WC2 = WORLD_W / 2;
  wreck = {
    x: Math.max(WC2 - SAFE2, Math.min(WC2 + SAFE2, rawWX)),
    y: Math.max(WC2 - SAFE2, Math.min(WC2 + SAFE2, rawWY)),
    visited: false,
  };

  // Asteroids cluster
  asteroids = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const dist  = 180 + Math.random() * 220;
    asteroids.push({
      x: wreck.x + Math.cos(angle) * dist + (Math.random()-0.5)*120,
      y: wreck.y + Math.sin(angle) * dist + (Math.random()-0.5)*120,
      r: 22 + Math.random() * 40,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random()-0.5) * 0.012,
      vx: (Math.random()-0.5) * 0.3,
      vy: (Math.random()-0.5) * 0.3,
      color: `hsl(${20 + Math.random()*20},15%,${30+Math.random()*20}%)`,
      craters: Array.from({length:3+Math.floor(Math.random()*3)},()=>({
        a: Math.random()*Math.PI*2, d: Math.random()*0.6, r: 0.15+Math.random()*0.25
      }))
    });
  }

  queueAI("Sector map loading.");
  setTimeout(() => queueAI("Debris field ahead. Investigate."), 2000);
}

function spawnPirates() {
  missionPhase = 'combat';
  worms = []; // ensure no worms during combat
  playAlert();
  queueAI("THREE HOSTILES. Weapons free.");
  

  const baseX = wreck.x, baseY = wreck.y;
  const spread = 200;
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    enemies.push({
      x: baseX + Math.cos(angle) * spread,
      y: baseY + Math.sin(angle) * spread,
      vx: 0, vy: 0,
      angle: 0,
      shield: 250,
      maxShield: 250,
      alive: true,
      fireTimer: 0.3 + i * 0.5,
      missileTimer: 0.5 + i * 0.6,
      state: 'attack',
      trail: [],
      flashTimer: 0,
      warpCooldown: 0,
      orbitAngle: (i / 3) * Math.PI * 2,
      color: `hsl(${0 + i*15},90%,50%)`,
    });
  }

  // Opening salvo — each fires a missile immediately
  setTimeout(() => {
    enemies.forEach(e => { if (e.alive) fireEnemyMissile(e); });
  }, 800);
}

function updateEnemies(dt) {
  if (!ship || playerDead) return;

  enemies.forEach(e => {
    if (!e.alive) return;
    e.flashTimer = Math.max(0, e.flashTimer - dt);
    if (e.warpCooldown > 0) e.warpCooldown -= dt;

    const dx = ship.x - e.x;
    const dy = ship.y - e.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const targetAngle = Math.atan2(dy, dx);

    // Check if player missile is heading at us — warp dodge
    const incomingMissile = missiles.find(m => {
      if (m.isEnemy) return false;
      const mdx = m.x - e.x, mdy = m.y - e.y;
      const mdist = Math.sqrt(mdx*mdx + mdy*mdy);
      if (mdist > 200) return false;
      const mAngle = Math.atan2(mdy, mdx);
      const mFacing = Math.atan2(m.vy, m.vx);
      const diff = Math.abs(mAngle - mFacing);
      return mdist < 160 && (diff < 0.4 || diff > Math.PI*2 - 0.4);
    });

    if (incomingMissile && e.warpCooldown <= 0) {
      // Warp perpendicular to missile
      const perpAngle = Math.atan2(incomingMissile.vy, incomingMissile.vx) + Math.PI/2;
      const warpDist = 220 + Math.random() * 100;
      e.x += Math.cos(perpAngle) * warpDist * (Math.random() > 0.5 ? 1 : -1);
      e.y += Math.sin(perpAngle) * warpDist * (Math.random() > 0.5 ? 1 : -1);
      e.vx = 0; e.vy = 0;
      e.warpCooldown = 4.0;
      spawnExplosion(e.x, e.y, 'small');
    }

    // Orbit player aggressively
    e.orbitAngle = (e.orbitAngle || 0) + dt * 0.9;
    const idealDist = 220;
    const orbitX = ship.x + Math.cos(e.orbitAngle) * idealDist;
    const orbitY = ship.y + Math.sin(e.orbitAngle) * idealDist;
    const odx = orbitX - e.x, ody = orbitY - e.y;
    const odist = Math.sqrt(odx*odx + ody*ody);
    const speed = 4.2;
    if (odist > 20) {
      e.vx += (odx/odist) * speed * dt * 60 * 0.055;
      e.vy += (ody/odist) * speed * dt * 60 * 0.055;
    }

    e.angle = targetAngle;
    const mag = Math.sqrt(e.vx*e.vx + e.vy*e.vy);
    if (mag > speed) { e.vx = (e.vx/mag)*speed; e.vy = (e.vy/mag)*speed; }
    e.vx *= 0.96; e.vy *= 0.96;
    e.x += e.vx; e.y += e.vy;

    e.trail.push({ x: e.x, y: e.y });
    if (e.trail.length > 16) e.trail.shift();

    // Gun fire — tight aim with lead prediction
    e.fireTimer -= dt;
    if (e.fireTimer <= 0 && dist < 550) {
      e.fireTimer = 0.45 + Math.random() * 0.25;
      // Lead the player
      const bulletSpeed = 13;
      const timeToHit = dist / bulletSpeed;
      const predictX = ship.x + ship.vx * timeToHit;
      const predictY = ship.y + ship.vy * timeToHit;
      const aimAngle = Math.atan2(predictY - e.y, predictX - e.x) + (Math.random()-0.5) * 0.1;
      enemyBullets.push({
        x: e.x + Math.cos(aimAngle) * 22,
        y: e.y + Math.sin(aimAngle) * 22,
        vx: Math.cos(aimAngle) * bulletSpeed,
        vy: Math.sin(aimAngle) * bulletSpeed,
        life: 80,
      });
    }

    // Missile fire every 3s
    e.missileTimer -= dt;
    if (e.missileTimer <= 0) {
      e.missileTimer = 3.0 + Math.random() * 0.5;
      fireEnemyMissile(e);
    }
  });

  // Enemy bullets
  enemyBullets = enemyBullets.filter(b => {
    b.x += b.vx; b.y += b.vy; b.life--;
    if (!ship || playerDead) return b.life > 0;
    const dx = b.x - ship.x, dy = b.y - ship.y;
    if (Math.sqrt(dx*dx+dy*dy) < 20) {
      hitPlayer(14);
      return false;
    }
    return b.life > 0;
  });

  // Player bullets hitting enemies + asteroids
  bullets = bullets.filter(b => {
    let hit = false;
    enemies.forEach(e => {
      if (!e.alive || hit) return;
      const dx = b.x - e.x, dy = b.y - e.y;
      if (Math.sqrt(dx*dx+dy*dy) < 24) {
        e.shield -= 12; e.flashTimer = 0.15; hit = true;
        spawnExplosion(b.x, b.y, 'small');
        if (e.shield <= 0) killEnemy(e);
      }
    });
    if (hit) return false;
    // Asteroid bullet hits
    for (let i = asteroids.length-1; i >= 0; i--) {
      const a = asteroids[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.sqrt(dx*dx+dy*dy) < a.r) {
        a.hp = (a.hp || a.r * 2) - 8;
        a.flashTimer = 0.1;
        spawnExplosion(b.x, b.y, 'small');
        if (a.hp <= 0) { spawnAsteroidOre(a); asteroids.splice(i, 1); }
        hit = true; break;
      }
    }
    return !hit;
  });

  // Player missiles hitting enemies + asteroids
  missiles = missiles.filter(m => {
    if (m.isEnemy) return m.life > 0;
    let hit = false;
    enemies.forEach(e => {
      if (!e.alive || hit) return;
      const dx = m.x - e.x, dy = m.y - e.y;
      if (Math.sqrt(dx*dx+dy*dy) < 55) { // bigger AOE for player missile
        e.shield -= 55; e.flashTimer = 0.4; hit = true;
        if (m.isPlayer) spawnPlayerExplosion(m.x, m.y);
        else spawnExplosion(m.x, m.y, 'big');
        if (e.shield <= 0) killEnemy(e);
      }
    });
    if (hit) return false;
    for (let i = asteroids.length-1; i >= 0; i--) {
      const a = asteroids[i];
      const dx = m.x - a.x, dy = m.y - a.y;
      if (Math.sqrt(dx*dx+dy*dy) < a.r + 15) {
        a.hp = (a.hp || a.r * 2) - 80;
        if (m.isPlayer) spawnPlayerExplosion(m.x, m.y);
        else spawnExplosion(m.x, m.y, 'big');
        if (a.hp <= 0) { spawnAsteroidOre(a); asteroids.splice(i, 1); }
        hit = true; break;
      }
    }
    return !hit;
  });

  // Check win condition
  if (missionPhase === 'combat' && enemies.every(e => !e.alive)) {
    missionPhase = 'done';
    queueAI("All hostiles eliminated.");
    setTimeout(() => {
      queueAI("Check the wreck.");
      // Drop scanner at wreck center
      if (wreck) {
        scannerDrop = { x: wreck.x, y: wreck.y, pulse: 0, collected: false };
        // Spawn station beacon far off in a fixed direction
    // Spawn station beacon -- clamped within safe zone (center ± 1400)
    const beaconAngle = ship.angle + Math.PI * 0.6; // off to the side, not directly ahead
    const RAW_BX = wreck.x + Math.cos(beaconAngle) * 900;
    const RAW_BY = wreck.y + Math.sin(beaconAngle) * 900;
    const SAFE = 1400; // max distance from world center (2000,2000)
    const WC = WORLD_W / 2;
    stationBeacon = {
      x: Math.max(WC - SAFE, Math.min(WC + SAFE, RAW_BX)),
      y: Math.max(WC - SAFE, Math.min(WC + SAFE, RAW_BY)),
      visible: false,
    };
      }
    }, 2000);
  }
}

function fireEnemyMissile(e) {
  if (!ship) return;
  const dx = ship.x - e.x, dy = ship.y - e.y;
  const angle = Math.atan2(dy, dx);
  missiles.push({
    x: e.x, y: e.y,
    vx: Math.cos(angle) * 4,
    vy: Math.sin(angle) * 4,
    angle,
    life: 180,
    trail: [],
    isEnemy: true,
  });
}

function hitPlayer(dmg) {
  if (!ship || playerDead) return;
  ship.shield = Math.max(0, ship.shield - dmg);
  ship.shieldRegen = 0; // reset regen timer on every hit
  ship.hitFlash = 0.5;
  playAlert();
  if (ship.shield <= 0) {
    // Ship destroyed
    spawnExplosion(ship.x, ship.y, 'huge');
    triggerPlayerDeath();
  }
}

function triggerPlayerDeath() {
  playerDead = true;
  scriptPhase = 'eaten';
  const killedByBandits = missionPhase === 'combat';
  setTimeout(() => showEatenScreen(killedByBandits), 800);
}

let spaceOre = [];
let shipCargo = { ore: 0, maxOre: 10 };

function spawnAsteroidOre(asteroid) {
  const count = 2 + Math.floor(asteroid.r / 15);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 2;
    spaceOre.push({
      x: asteroid.x + (Math.random()-0.5)*asteroid.r,
      y: asteroid.y + (Math.random()-0.5)*asteroid.r,
      vx: Math.cos(angle)*speed + asteroid.vx,
      vy: Math.sin(angle)*speed + asteroid.vy,
      life: 600, // 10 seconds at 60fps
      r: 5 + Math.random()*4,
    });
  }
  spawnExplosion(asteroid.x, asteroid.y, 'big');
}

function updateOre(dt) {
  if (!ship) return;
  spaceOre = spaceOre.filter(o => {
    o.x += o.vx; o.y += o.vy;
    o.vx *= 0.995; o.vy *= 0.995;
    o.life--;
    // Collect if close to ship
    const dx = o.x - ship.x, dy = o.y - ship.y;
    if (Math.sqrt(dx*dx+dy*dy) < 35) {
      // Add to ship cargo
      if (shipCargo.ore < shipCargo.maxOre) {
        shipCargo.ore++;
        NOTIFY(`Ore → Ship cargo: ${shipCargo.ore}/${shipCargo.maxOre}`);
      } else {
        NOTIFY('Ship cargo full! Unload at a space station.');
      }
      return false;
    }
    return o.life > 0;
  });
}

function drawOre() {
  const t = Date.now() * 0.003;
  spaceOre.forEach(o => {
    const alpha = Math.min(1, o.life / 60);
    ctx.save();
    ctx.translate(o.x, o.y);
    // Glowing mineral
    const grd = ctx.createRadialGradient(0,0,0,0,0,o.r*2);
    grd.addColorStop(0, `rgba(100,220,255,${alpha*0.8})`);
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0,0,o.r*2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = `rgba(180,240,255,${alpha})`;
    ctx.beginPath(); ctx.arc(0,0,o.r,0,Math.PI*2); ctx.fill();
    ctx.restore();
  });
}

function spawnPlayerExplosion(x, y) {
  // Big AOE -- ring burst + colorful crisscross
  // Outer shockwave ring
  explosions.push({
    x, y, vx:0, vy:0,
    life:1.0, decay:0.045,
    r:8, maxR:90,
    isRing: true,
    color:'hsl(200,100%,70%)',
  });
  // Second ring offset
  setTimeout(() => {
    explosions.push({
      x, y, vx:0, vy:0,
      life:0.8, decay:0.04,
      r:4, maxR:60,
      isRing: true,
      color:'hsl(160,100%,65%)',
    });
  }, 80);
  // Crisscross color burst particles
  const colors = ['hsl(200,100%,70%)','hsl(160,100%,65%)','hsl(180,100%,75%)','hsl(140,80%,70%)','hsl(220,100%,80%)'];
  for (let i = 0; i < 28; i++) {
    const angle = (i / 28) * Math.PI * 2;
    const speed = 1.5 + Math.random() * 3.5;
    explosions.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.0,
      decay: 0.025 + Math.random()*0.02,
      r: 3 + Math.random() * 5,
      color: colors[Math.floor(Math.random()*colors.length)],
      isRing: false,
    });
  }
  // Core flash
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 1.5;
    explosions.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.0, decay: 0.06,
      r: 6 + Math.random() * 8,
      color: 'hsl(200,100%,95%)',
      isRing: false,
    });
  }
}

function killEnemy(e) {
  e.alive = false;
  e.vx = 0; e.vy = 0;
  e.fireTimer = 9999; e.missileTimer = 9999;
  // Remove any bullets this enemy fired immediately
  enemyBullets = enemyBullets.filter(b => b.owner !== e);
  spawnExplosion(e.x, e.y, 'big');
  setTimeout(() => spawnExplosion(e.x + (Math.random()-0.5)*40, e.y + (Math.random()-0.5)*40, 'small'), 200);
  setTimeout(() => spawnExplosion(e.x, e.y, 'huge'), 400);
  playAlert();
}

function spawnExplosion(x, y, size) {
  const count = size === 'small' ? 8 : size === 'big' ? 18 : 32;
  const maxR   = size === 'small' ? 0.12 : size === 'big' ? 0.22 : 0.35;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (0.5 + Math.random()) * maxR * 60;
    explosions.push({
      x, y,
      vx: Math.cos(angle) * speed * 0.5,
      vy: Math.sin(angle) * speed * 0.5,
      life: 1.0,
      decay: 0.03 + Math.random() * 0.04,
      r: (2 + Math.random() * 5) * (size === 'huge' ? 2.5 : size === 'big' ? 1.5 : 1),
      color: `hsl(${20 + Math.random()*40},100%,${60+Math.random()*30}%)`,
    });
  }
}

function updateMission(dt) {
  if (missionPhase === 'wreck_spawned' && ship && wreck && !wreck.visited) {
    const dx = ship.x - wreck.x, dy = ship.y - wreck.y;
    if (Math.sqrt(dx*dx+dy*dy) < 220) {
      wreck.visited = true;
      queueAI("Ambushed vessel.");
      // Save checkpoint NOW -- before anything hostile happens
      checkpointState = {
        shipX: ship.x, shipY: ship.y,
        shipAngle: ship.angle,
        shield: ship.maxShield || 150,
        missileCount: missileCount,
        cargo: { ore: shipCargo.ore },
        wreckX: wreck.x, wreckY: wreck.y,
      };
      setTimeout(() => {
        queueAI("Surprise.");
        spawnPirates();
      }, 2200);
    }
  }

  // Asteroids drift
  asteroids.forEach(a => {
    a.x += a.vx; a.y += a.vy;
    a.angle += a.spin;
  });

  // Enemy missiles hit player
  missiles = missiles.filter(m => {
    if (!m.isEnemy || !ship || playerDead) return m.life > 0;
    m.trail.push({ x: m.x, y: m.y });
    if (m.trail.length > 15) m.trail.shift();
    m.x += m.vx; m.y += m.vy; m.life--;
    const dx = m.x - ship.x, dy = m.y - ship.y;
    if (Math.sqrt(dx*dx+dy*dy) < 25) {
      hitPlayer(25);
      spawnExplosion(m.x, m.y, 'big');
      return false;
    }
    return m.life > 0;
  });

  updateEnemies(dt);

  // Explosions
  explosions = explosions.filter(ex => {
    if (ex.isRing) {
      ex.r = Math.min(ex.r + 5, ex.maxR);
    } else {
      ex.x += ex.vx; ex.y += ex.vy;
      ex.vx *= 0.93; ex.vy *= 0.93;
    }
    ex.life -= ex.decay;
    return ex.life > 0;
  });
}

// ── DRAW ENEMIES / MISSION ────────────────────────────────────
function drawMission() {
  if (!wreck) return;

  // Wreck
  ctx.save();
  ctx.translate(wreck.x, wreck.y);
  ctx.rotate(0.4);
  // Broken hull pieces
  [[0,0,40,18],[18,-20,25,12],[-22,15,20,10],[-10,-10,15,8]].forEach(([px,py,w,h],i) => {
    ctx.fillStyle = `rgba(${80+i*10},${70+i*5},60,0.9)`;
    ctx.fillRect(px-w/2, py-h/2, w, h);
  });
  // Glow
  const wgrd = ctx.createRadialGradient(0,0,0,0,0,80);
  wgrd.addColorStop(0, 'rgba(255,150,50,0.15)');
  wgrd.addColorStop(1, 'transparent');
  ctx.fillStyle = wgrd;
  ctx.beginPath(); ctx.arc(0,0,80,0,Math.PI*2); ctx.fill();
  ctx.restore();

  // Asteroids
  asteroids.forEach(a => {
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.angle);
    ctx.fillStyle = a.color;
    ctx.beginPath(); ctx.arc(0,0,a.r,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Craters
    a.craters.forEach(c => {
      const cx2 = Math.cos(c.a) * a.r * c.d;
      const cy2 = Math.sin(c.a) * a.r * c.d;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.arc(cx2, cy2, a.r*c.r, 0, Math.PI*2); ctx.fill();
    });
    ctx.restore();
  });

  // Enemies
  enemies.forEach(e => {
    if (!e.alive) return;
    // Trail
    if (e.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(e.trail[0].x, e.trail[0].y);
      e.trail.forEach(t => ctx.lineTo(t.x, t.y));
      ctx.strokeStyle = `rgba(255,80,80,0.2)`;
      ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle + Math.PI/2);
    const s = 12;
    // Flash white on hit
    const flash = e.flashTimer > 0;
    ctx.fillStyle = flash ? '#FFFFFF' : e.color;
    ctx.shadowColor = flash ? '#FFFFFF' : '#FF4400';
    ctx.shadowBlur = flash ? 20 : 8;
    // Enemy ship shape (more aggressive, wider)
    ctx.beginPath();
    ctx.moveTo(0, -s*1.5);
    ctx.lineTo(s*0.9, s*1.0);
    ctx.lineTo(s*0.4, s*0.5);
    ctx.lineTo(0, s*0.8);
    ctx.lineTo(-s*0.4, s*0.5);
    ctx.lineTo(-s*0.9, s*1.0);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // Shield ring
    if (e.shield > 0) {
      ctx.beginPath(); ctx.arc(0,0,s*1.8,0,Math.PI*2);
      ctx.strokeStyle = `rgba(255,80,0,${e.shield/100 * 0.5})`;
      ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();
    // Shield bar above enemy
    const sx2 = e.x - cameraX + canvas.width/2;
    const sy2 = e.y - cameraY + canvas.height/2;
    const bw = 40, bh = 4;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(sx2 - bw/2, sy2 - 28, bw, bh);
    ctx.fillStyle = e.shield > 50 ? '#FF6600' : '#FF2200';
    ctx.fillRect(sx2 - bw/2, sy2 - 28, bw*(e.shield/100), bh);
  });

  // Enemy bullets
  enemyBullets.forEach(b => {
    ctx.beginPath(); ctx.arc(b.x, b.y, 2.5, 0, Math.PI*2);
    ctx.fillStyle = '#FF6600';
    ctx.shadowColor = '#FF4400'; ctx.shadowBlur = 8;
    ctx.fill(); ctx.shadowBlur = 0;
  });

  // Explosions
  explosions.forEach(ex => {
    if (ex.isRing) {
      ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.r, 0, Math.PI*2);
      ctx.strokeStyle = ex.color.replace('hsl','hsla').replace(')',`,${ex.life * 0.8})`);
      ctx.lineWidth = 2.5 * ex.life;
      ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.r * (0.5 + ex.life*0.5), 0, Math.PI*2);
      ctx.fillStyle = ex.color.replace('hsl','hsla').replace(')',`,${ex.life})`);
      ctx.fill();
    }
  });
}

// ── NEW HUD ────────────────────────────────────────────────────

function drawTacticalHUD(W, H) {
  if (!ship) return;
  const t = Date.now() * 0.001;
  const cx = W / 2;
  const cy = H - 120;
  const shieldPct = Math.max(0, ship.shield / 100);
  const sc = shieldPct > 0.6 ? [0,220,255] : shieldPct > 0.3 ? [255,180,0] : [255,50,50];

  // ── BIG BACKGROUND TRIANGLE ───────────────────────────────
  const triR = 92;
  ctx.save();
  ctx.translate(cx, cy + 10);
  // Slow rotation
  ctx.rotate(Math.sin(t * 0.18) * 0.04);
  const triPts = [0,1,2].map(i => {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(a) * triR, Math.sin(a) * triR];
  });
  ctx.beginPath();
  ctx.moveTo(triPts[0][0], triPts[0][1]);
  ctx.lineTo(triPts[1][0], triPts[1][1]);
  ctx.lineTo(triPts[2][0], triPts[2][1]);
  ctx.closePath();
  const triGrd = ctx.createRadialGradient(0, 0, 10, 0, 0, triR);
  triGrd.addColorStop(0, `rgba(${sc[0]},${sc[1]},${sc[2]},0.07)`);
  triGrd.addColorStop(1, `rgba(${sc[0]},${sc[1]},${sc[2]},0.02)`);
  ctx.fillStyle = triGrd;
  ctx.fill();
  ctx.strokeStyle = `rgba(${sc[0]},${sc[1]},${sc[2]},${0.25 + Math.sin(t*1.5)*0.08})`;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Small circles at triangle corners
  triPts.forEach(([px,py], i) => {
    const pulse = 0.5 + Math.sin(t * 2.5 + i * 2.1) * 0.35;
    // Outer ring
    ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI*2);
    ctx.strokeStyle = `rgba(${sc[0]},${sc[1]},${sc[2]},${pulse * 0.7})`;
    ctx.lineWidth = 1; ctx.stroke();
    // Inner dot
    ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI*2);
    ctx.fillStyle = `rgba(${sc[0]},${sc[1]},${sc[2]},${pulse})`;
    ctx.fill();
    // Connecting line toward center
    ctx.beginPath(); ctx.moveTo(px*0.85, py*0.85); ctx.lineTo(px*0.4, py*0.4);
    ctx.strokeStyle = `rgba(${sc[0]},${sc[1]},${sc[2]},${pulse * 0.3})`;
    ctx.lineWidth = 0.8; ctx.stroke();
  });

  // Interleaving inner triangle (counter-rotated)
  ctx.rotate(Math.PI / 3 + Math.sin(t * 0.22) * 0.04);
  const triR2 = 68;
  ctx.beginPath();
  [0,1,2].forEach((i, idx) => {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(a) * triR2, py = Math.sin(a) * triR2;
    idx === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.strokeStyle = `rgba(${sc[0]},${sc[1]},${sc[2]},${0.15 + Math.sin(t*1.8+1)*0.06})`;
  ctx.lineWidth = 0.8; ctx.stroke();

  ctx.restore();

  // ── PENTAGON SHIELD SEGMENTS ───────────────────────────────
  const pentR = 55;
  const sides = 5;
  for (let i = 0; i < sides; i++) {
    const segStart = (i * 2 * Math.PI / sides) - Math.PI / 2;
    const segEnd   = ((i+1) * 2 * Math.PI / sides) - Math.PI / 2;
    const segAlive = ship.shield > (i * (100/sides));
    if (!segAlive) {
      // Broken spark
      if (Math.sin(t * 18 + i) > 0.5) {
        const midA = (segStart+segEnd)/2;
        ctx.fillStyle = `rgba(255,80,30,${0.3+Math.random()*0.4})`;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(midA)*pentR*0.9, cy + Math.sin(midA)*pentR*0.9,
          1.5+Math.random()*2, 0, Math.PI*2);
        ctx.fill();
      }
      continue;
    }
    const pulse = 0.65 + Math.sin(t*2.5 + i*1.2)*0.25;
    ctx.beginPath();
    ctx.arc(cx, cy, pentR, segStart+0.07, segEnd-0.07);
    ctx.arc(cx, cy, pentR-10, segEnd-0.07, segStart+0.07, true);
    ctx.closePath();
    ctx.fillStyle = `rgba(${sc[0]},${sc[1]},${sc[2]},${pulse*0.2})`;
    ctx.fill();
    // Edge glow
    ctx.beginPath();
    ctx.arc(cx, cy, pentR, segStart+0.07, segEnd-0.07);
    ctx.strokeStyle = `rgba(${sc[0]},${sc[1]},${sc[2]},${pulse*0.9})`;
    ctx.lineWidth = 2.5; ctx.stroke();
  }

  // Outer glow halo
  const haloGrd = ctx.createRadialGradient(cx, cy, pentR*0.6, cx, cy, pentR+30);
  haloGrd.addColorStop(0, `rgba(${sc[0]},${sc[1]},${sc[2]},${shieldPct*0.35})`);
  haloGrd.addColorStop(1, 'transparent');
  ctx.fillStyle = haloGrd;
  ctx.beginPath(); ctx.arc(cx, cy, pentR+30, 0, Math.PI*2); ctx.fill();

  // ── INNER ORB ─────────────────────────────────────────────
  const orbR = 40;
  const orbGrd = ctx.createRadialGradient(cx, cy-5, 3, cx, cy, orbR);
  orbGrd.addColorStop(0, `rgba(${sc[0]},${sc[1]},${sc[2]},0.20)`);
  orbGrd.addColorStop(0.5, `rgba(${sc[0]},${sc[1]},${sc[2]},0.06)`);
  orbGrd.addColorStop(1, 'rgba(0,8,22,0.88)');
  ctx.fillStyle = orbGrd;
  ctx.beginPath(); ctx.arc(cx, cy, orbR, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = `rgba(${sc[0]},${sc[1]},${sc[2]},0.55)`;
  ctx.lineWidth = 1.2; ctx.stroke();

  // Shield arc
  if (shieldPct > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, orbR - 5, -Math.PI/2, -Math.PI/2 + shieldPct*Math.PI*2);
    ctx.strokeStyle = `rgba(${sc[0]},${sc[1]},${sc[2]},0.9)`;
    ctx.lineWidth = 2.5; ctx.stroke();
  }

  // Small ring of 4 system dots
  const dotRing = orbR - 13;
  const sysDots = [
    { label:'ENG', angle:-Math.PI/2, ok:ship.systems.engine },
    { label:'GUN', angle:0,          ok:ship.systems.weapons },
    { label:'WRP', angle:Math.PI/2,  ok:ship.systems.warp, blink:warpCooldown<=0 },
    { label:'NAV', angle:Math.PI,    ok:ship.systems.navigation },
  ];
  sysDots.forEach((d, i) => {
    const dx = cx + Math.cos(d.angle) * dotRing;
    const dy = cy + Math.sin(d.angle) * dotRing;
    let col;
    if (!d.ok) col = 'rgba(255,40,40,0.95)';
    else if (d.blink) col = 'rgba(0,230,255,1)'; // steady cyan when warp ready
    else col = `rgba(${i===0?'0,200,255':i===1?'0,255,160':i===2?'120,190,255':'0,230,210'},0.85)`;
    ctx.beginPath(); ctx.arc(dx, dy, 3.5, 0, Math.PI*2);
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 7; ctx.fill();
    ctx.shadowBlur = 0;
  });

  // ── CENTER TEXT ───────────────────────────────────────────
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  // Shield number — big, bright
  const shieldNum = Math.round((ship.shield / (ship.maxShield || 150)) * 100);
  ctx.font = `bold ${shieldNum >= 100 ? 20 : 22}px 'Courier New'`;
  ctx.fillStyle = `rgba(${sc[0]},${sc[1]},${sc[2]},1)`;
  ctx.shadowColor = `rgba(${sc[0]},${sc[1]},${sc[2]},0.8)`;
  ctx.shadowBlur = 12;
  ctx.fillText(`${shieldNum}%`, cx, cy - 6);
  ctx.shadowBlur = 0;

  // SHIELD label
  ctx.font = 'bold 8px Courier New';
  ctx.fillStyle = `rgba(${sc[0]},${sc[1]},${sc[2]},0.55)`;
  ctx.letterSpacing = '2px';
  ctx.fillText('SHIELD', cx, cy + 9);



  // ── SPEED (below, clear of pentagon) ─────────────────────
  const spd = Math.round(Math.sqrt(ship.vx*ship.vx + ship.vy*ship.vy) * 60);
  ctx.font = 'bold 11px Courier New';
  ctx.fillStyle = `rgba(0,210,190,0.8)`;
  ctx.fillText(`${spd}`, cx, cy + pentR + 18);
  ctx.font = '8px Courier New';
  ctx.fillStyle = `rgba(0,200,180,0.45)`;
  ctx.fillText('u/s', cx, cy + pentR + 30);

  // ── WARP WARNING ──────────────────────────────────────────
  if (scriptPhase === 'worm1_charge') {
    const p = 0.5 + Math.sin(t*9)*0.5;
    ctx.font = `bold ${W < 768 ? 20 : 26}px Courier New`;
    ctx.fillStyle = `rgba(255,30,30,${p})`;
    ctx.shadowColor = `rgba(255,0,0,${p*0.6})`;
    ctx.shadowBlur = 15;
    ctx.fillText('PRESS SPACE TO WARP', cx, H/2 + 90);
    ctx.shadowBlur = 0;
  }

  // ── HIT FLASH ─────────────────────────────────────────────
  if (ship.hitFlash > 0) {
    ship.hitFlash = Math.max(0, ship.hitFlash - 0.04);
    ctx.fillStyle = `rgba(255,0,0,${ship.hitFlash * 0.35})`;
    ctx.fillRect(0,0,W,H);
  }

  // ── OFFLINE WARNINGS ──────────────────────────────────────
  let sysY = cy - pentR - 20;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  Object.entries(ship.systems).forEach(([sys, ok]) => {
    if (!ok) {
      ctx.fillStyle = 'rgba(255,70,70,0.9)';
      ctx.font = 'bold 10px Courier New';
      ctx.fillText(`⚠ ${sys.toUpperCase()} OFFLINE`, 16, sysY);
      sysY -= 15;
    }
  });
}


function drawWeaponHUD(W, H) {
  if (!ship) return;
  if (W <= 900) return; // mobile uses canvas joystick rings instead
  const t = Date.now() * 0.001;
  const btnR = 24, mslR = 17;
  const bx = W - 44;

  // FIRE BUTTON
  const fireY = H - 75;
  const fp = activeWeapon === 'guns' ? 0.7 + Math.sin(t*4)*0.2 : 0.4;
  ctx.beginPath(); ctx.arc(bx, fireY, btnR + 4, 0, Math.PI*2);
  ctx.strokeStyle = `rgba(0,255,140,${fp*0.5})`; ctx.lineWidth = 1; ctx.stroke();
  const fg = ctx.createRadialGradient(bx, fireY-4, 2, bx, fireY, btnR);
  fg.addColorStop(0, `rgba(0,255,140,${fp*0.35})`); fg.addColorStop(1, 'rgba(0,80,50,0.7)');
  ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(bx, fireY, btnR, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = `rgba(0,255,140,${fp*0.9})`; ctx.lineWidth = 1.8; ctx.stroke();
  ctx.strokeStyle = `rgba(0,255,140,${fp})`; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(bx-10, fireY); ctx.lineTo(bx+10, fireY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx, fireY-10); ctx.lineTo(bx, fireY+10); ctx.stroke();
  ctx.beginPath(); ctx.arc(bx, fireY, 5, 0, Math.PI*2);
  ctx.strokeStyle = `rgba(0,255,140,${fp*0.8})`; ctx.stroke();
  ctx.fillStyle = `rgba(0,255,140,${fp*0.8})`; ctx.font = 'bold 8px Courier New';
  ctx.textAlign = 'center'; ctx.fillText('FIRE', bx, fireY + btnR + 12);

  // MISSILE BUTTON
  const mslY = fireY - btnR - mslR - 16;
  const mp = missileCount > 0 ? 0.6 + Math.sin(t*3+1)*0.25 : 0.2;
  const mc = missileCount > 2 ? [255,140,0] : missileCount > 0 ? [255,60,60] : [100,100,100];
  const mg = ctx.createRadialGradient(bx, mslY-3, 1, bx, mslY, mslR);
  mg.addColorStop(0, `rgba(${mc[0]},${mc[1]},${mc[2]},${mp*0.4})`);
  mg.addColorStop(1, 'rgba(40,20,0,0.7)');
  ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(bx, mslY, mslR, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = `rgba(${mc[0]},${mc[1]},${mc[2]},${mp*0.9})`; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.fillStyle = `rgba(${mc[0]},${mc[1]},${mc[2]},${mp})`;
  ctx.beginPath(); ctx.moveTo(bx, mslY-8); ctx.lineTo(bx-5, mslY+5); ctx.lineTo(bx+5, mslY+5);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = `rgba(${mc[0]},${mc[1]},${mc[2]},0.9)`; ctx.font = 'bold 8px Courier New';
  ctx.textAlign = 'center'; ctx.fillText(`×${missileCount}`, bx, mslY + mslR + 11);
  ctx.textAlign = 'left';
}

function drawMiniMap(W, H) {
  if (!ship) return;
  const mx = W - 110, my = 10;
  const mw = 100, mh = 100;
  const scale = mw / 1200;

  // Background
  ctx.fillStyle = 'rgba(0,10,25,0.75)';
  ctx.strokeStyle = 'rgba(0,200,255,0.3)';
  ctx.lineWidth = 1;
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeRect(mx, my, mw, mh);

  // Sector label
  ctx.fillStyle = 'rgba(0,200,255,0.5)';
  ctx.font = '8px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('SW-ALPHA', mx + mw/2, my + mh - 5);
  ctx.textAlign = 'left';

  const toMap = (wx, wy) => ({
    x: mx + mw/2 + (wx - ship.x) * scale,
    y: my + mh/2 + (wy - ship.y) * scale,
  });

  // Asteroids
  asteroids.forEach(a => {
    const p = toMap(a.x, a.y);
    if (p.x < mx || p.x > mx+mw || p.y < my || p.y > my+mh) return;
    ctx.fillStyle = 'rgba(150,120,80,0.6)';
    ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI*2); ctx.fill();
  });

  // Wreck
  if (wreck) {
    const p = toMap(wreck.x, wreck.y);
    if (p.x >= mx && p.x <= mx+mw && p.y >= my && p.y <= my+mh) {
      ctx.fillStyle = 'rgba(255,150,50,0.8)';
      ctx.fillRect(p.x-3, p.y-3, 6, 6);
    }
  }

  // Other ships
  otherShips.forEach(os => {
    const p = toMap(os.x, os.y);
    if (p.x < mx || p.x > mx+mw || p.y < my || p.y > my+mh) return;
    ctx.fillStyle = 'rgba(100,200,255,0.8)';
    ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI*2); ctx.fill();
  });

  // Enemies
  enemies.forEach(e => {
    if (!e.alive) return;
    const p = toMap(e.x, e.y);
    if (p.x < mx || p.x > mx+mw || p.y < my || p.y > my+mh) return;
    const t2 = Date.now() * 0.005;
    ctx.fillStyle = `rgba(255,60,60,${0.6 + Math.sin(t2)*0.3})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI*2); ctx.fill();
  });

  // Scanner drop
  if (scannerDrop && !scannerDrop.collected) {
    const p = toMap(scannerDrop.x, scannerDrop.y);
    if (p.x >= mx && p.x <= mx+mw && p.y >= my && p.y <= my+mh) {
      ctx.fillStyle = 'rgba(0,255,180,0.9)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI*2); ctx.fill();
    }
  }

  // Station beacon
  if (stationBeacon?.visible) {
    const p = toMap(stationBeacon.x, stationBeacon.y);
    const t3 = Date.now() * 0.005;
    const inBounds = p.x >= mx && p.x <= mx+mw && p.y >= my && p.y <= my+mh;
    // Always show arrow on minimap edge if off screen
    if (!inBounds) {
      const angle = Math.atan2(p.y - (my+mh/2), p.x - (mx+mw/2));
      const ex = mx+mw/2 + Math.cos(angle) * (mw/2 - 6);
      const ey = my+mh/2 + Math.sin(angle) * (mh/2 - 6);
      ctx.fillStyle = `rgba(255,200,50,${0.6+Math.sin(t3)*0.3})`;
      ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI*2); ctx.fill();
    } else {
      ctx.fillStyle = `rgba(255,200,50,${0.7+Math.sin(t3)*0.3})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill();
    }
  }

  // Player
  ctx.fillStyle = '#00FFB8';
  ctx.shadowColor = '#00FFB8'; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.arc(mx + mw/2, my + mh/2, 3, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
}

// drawWeaponHUD removed -- replaced by spaceMobileHUD DOM buttons
