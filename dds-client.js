// dds-client.js -- Deep Deep Space (Dimensional Battlefield)
// 50-zone grid (s-1 through s-50), 10 columns x 5 rows
// Players pilot their designed Gundams
// Same engine as deepspace-client but with:
//   - Gundam renderer instead of ship
//   - Sword swing button (replaces aim joystick)
//   - Auto-targeting turrets
//   - Dark matter drops
//   - 6000x6000 zones (larger than DS's 4000)

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const DDS_WORLD  = 6000;
const DDS_CENTER = DDS_WORLD / 2;
const DDS_EDGE   = 150;
const DDS_COLS   = 10;
const DDS_ROWS   = 5;

// ── STATE ─────────────────────────────────────────────────────────────────────
let ddsActive    = false;
let ddsCanvas    = null;
let ddsCtx       = null;
let ddsAnimId    = null;
let ddsShip      = null; // shared structure same as dsShip
let ddsZone      = { n:1, e:1 }; // s-1 = n:1,e:1
let ddsPlanets   = []; // materialized planets in current zone
let ddsZoneTransitioning = false;
let ddsBullets   = [];
let ddsMissiles  = [];
let ddsEnemyBullets = [];
let ddsExplosions   = [];
let ddsOtherPlayers = {};
let ddsStars     = [];
let ddsWarpCooldown = 0;
let ddsSwordSwing   = null; // { angle, radius, t, maxT }
let ddsAutoTarget   = null; // nearest enemy
let ddsAutoFireTimer = 0;
let ddsGundamData   = null; // active gundam data
let ddsDesign       = null; // active gundam design
let ddsKeys      = {};
let ddsWeaponsOn = true;   // auto turret toggle
let ddsLaserState = { charging:false, chargeT:0, firing:false, fireT:0, beam:null };
let ddsJerichoLock = null;
let ddsDamageNumbers = []; // {x,y,val,t,maxT,color,vx,vy}
let ddsLootCrates = [];   // {id,x,y,zone,darkMatter,t}
let ddsNpcEntities = {};  // id -> {x,y,angle,zone,factionId,shield,maxShield,design}
let ddsKothZones = [];    // legacy
let ddsKothHotspots = []; // [{id,n,e,x,y,mega,rEpic,rWar,rCont}]
let ddsSanctumBeacon = null; // dock point in s-1
let ddsDockPrompt = false;
let _ddsDocking = false; // locked target for jericho barrage
let ddsJerichoMissiles = [];
let ddsHellfireReady = false;
let ddsHellfireFlash = 0;
let ddsScreenShake   = 0;
// ── MISSILE DEFLECTION ATTACK STATE ──
let mda = {
  phase: 'none', // none, spawn, countdown, missiles_incoming, sword_window, success, failed
  mechs: [],     // 20 enemy mechs in ring
  missiles: [],  // incoming missiles from mechs
  wave: 0,       // current wave (1 wave for intro)
  maxWaves: 1,
  windowTimer: 0,     // time left to tap sword
  countdownTimer: 0,  // pre-missile countdown
  checkpointX: 0, checkpointY: 0, // player position to restore on fail
  swordFlash: 0,  // red flash intensity on success
  shockwave: null, // expanding ring
};
let ddsLastTime  = 0;
let ddsDarkMatter = 0;
let ddsScanActive = false;
let ddsScanTimer  = 0;
let ddsScanState  = { active:false, timer:0, duration:5, zoom:1.0, targets:[] };
let ddsEnemyProjectiles = []; // moving NPC bullets/missiles
let ddsWolFountain = null;    // {zone,x,y,active,timer}
let ddsWolBalance  = 0;       // player WoL wallet
let ddsLastMoveSent = 0;
const DDS_MOVE_INTERVAL = 50;

// ── SOCKET ────────────────────────────────────────────────────────────────────
const DDS_SKT = () => window._mineGetSocket?.();
function DDS_NOTIFY(msg) { window._mineShowNotification?.(msg); }

// ── ZONE KEY ──────────────────────────────────────────────────────────────────
function ddsZoneKey(z) { return 's-' + ((z.n - 1) * DDS_COLS + z.e); }
function ddsZoneFromKey(key) {
  var n = parseInt(key.replace('s-', '')) - 1;
  return { n: Math.floor(n / DDS_COLS) + 1, e: (n % DDS_COLS) + 1 };
}

// ── INIT ──────────────────────────────────────────────────────────────────────
function initDDS() {
  if (ddsCanvas) return;
  ddsCanvas = document.createElement('canvas');
  ddsCanvas.id = 'ddsCanvas';
  ddsCanvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:90;display:none;';
  document.body.appendChild(ddsCanvas);
  ddsCtx = ddsCanvas.getContext('2d');

  window.addEventListener('resize', ddsResize);
  ddsResize();
  // Canvas click handlers
  ddsCanvas.addEventListener('click', function(e) {
    if (!ddsActive) return;
    var rect = ddsCanvas.getBoundingClientRect();
    var cx=e.clientX-rect.left, cy=e.clientY-rect.top;
    // Return button
    if (cx>=8&&cx<=98&&cy>=8&&cy<=36) { leaveDDS(); return; }
    // Left click = sword swing
    ddsSwingSword();
  });
  // Right click = laser
  ddsCanvas.addEventListener('contextmenu', function(e) {
    if (!ddsActive) return;
    e.preventDefault();
    ddsChargeLaser();
  });

  // Key controls -- same as deepspace
  document.addEventListener('keydown', function(e) {
    if (!ddsActive) return;
    ddsKeys[e.code] = true;
    if (e.code === 'Space') { e.preventDefault(); ddsDoWarp(); }
    if (e.code === 'KeyF') ddsSwingSword();
    if (e.code === 'KeyQ') ddsActivateScanner();
    if (e.code === 'KeyE') { if (ddsDockPrompt) { ddsDockAtSanctum(); return; } if (ddsWolFountain&&!ddsWolFountain.active&&ddsWolFountain.zone===ddsZoneKey(ddsZone)&&ddsShip&&Math.hypot(ddsShip.x-ddsWolFountain.x,ddsShip.y-ddsWolFountain.y)<200){ DDS_SKT()?.emit('dds:wolActivate'); return; } ddsActivateScanner(); }
    if (e.code === 'Escape') { /* handled by menu */ }
  });
  document.addEventListener('keyup', function(e) { ddsKeys[e.code] = false; });

  // Touch controls
  var _ddsHint=document.createElement('div');
  _ddsHint.id='ddsDockHint';
  _ddsHint.style.cssText='position:fixed;bottom:140px;left:50%;transform:translateX(-50%);'
    +'background:rgba(18,0,30,0.88);color:rgba(180,120,255,0.95);font-family:Courier New,monospace;'
    +'font-size:13px;font-weight:bold;padding:10px 22px;border-radius:12px;z-index:820;'
    +'pointer-events:auto;border:1px solid rgba(150,80,255,0.35);display:none;cursor:pointer;';
  _ddsHint.textContent='Tap to DOCK — Transfer DM';
  _ddsHint.addEventListener('touchend',function(e){e.preventDefault();ddsDockAtSanctum();},{passive:false});
  _ddsHint.addEventListener('click',function(){ddsDockAtSanctum();});
  document.body.appendChild(_ddsHint);
  window._ddsDockHint=_ddsHint;
  var _ddsHint=document.createElement('div');
  _ddsHint.style.cssText='position:fixed;bottom:140px;left:50%;transform:translateX(-50%);'
    +'background:rgba(18,0,30,0.88);color:rgba(180,120,255,0.95);font-family:Courier New,monospace;'
    +'font-size:13px;font-weight:bold;padding:10px 22px;border-radius:12px;z-index:820;'
    +'pointer-events:auto;border:1px solid rgba(150,80,255,0.35);display:none;cursor:pointer;';
  _ddsHint.textContent='Tap to DOCK — Transfer DM';
  _ddsHint.addEventListener('touchend',function(e){e.preventDefault();ddsDockAtSanctum();},{passive:false});
  _ddsHint.addEventListener('click',function(){ddsDockAtSanctum();});
  document.body.appendChild(_ddsHint);
  ddsCanvas.addEventListener('touchstart', ddsTouchStart, {passive:false});
  ddsCanvas.addEventListener('touchmove',  ddsTouchMove,  {passive:false});
  ddsCanvas.addEventListener('touchend',   ddsTouchEnd,   {passive:false});

  // Socket events
  var skt = DDS_SKT();
  if (skt) {
    skt.on('dds:otherMove',     ddsOnOtherMove);
    skt.on('dds:otherLeft',     function(d){ delete ddsOtherPlayers[d.socketId]; });
    skt.on('dds:darkMatter',    function(d){ ddsDarkMatter=(d.darkMatter||0); ddsUpdateDMHUD(); });
    skt.on('dds:hit',           ddsOnHit);
    skt.on('dds:npcUpdate',     ddsOnNpcUpdate);
    skt.on('dds:npcDamage',     ddsOnNpcDamage);
    skt.on('dds:npcBullet',     ddsOnNpcBullet);
    skt.on('dds:npcMissile',    ddsOnNpcMissile);
    skt.on('dds:lootSpawn',     ddsOnLootSpawn);
    skt.on('dds:wolFountainSpawn',  function(d){ ddsWolFountain={zone:d.zone,x:d.x,y:d.y,active:false,timer:0,t:0}; });
    skt.on('dds:wolFountainActive', function(d){ if(ddsWolFountain){ddsWolFountain.active=true;ddsWolFountain.timer=d.duration||180;} DDS_NOTIFY('💧 FOUNTAIN OF LIFE ACTIVE — '+d.zone+' — 3 MINUTES!'); });
    skt.on('dds:wolFountainDespawn',function(){ ddsWolFountain=null; DDS_NOTIFY('💧 Fountain of Life despawned.'); });
    skt.on('dds:zonePlanets',      function(d){ ddsPlanets = d.planets||[]; });
    skt.on('dds:planetDamage',     ddsOnPlanetDamage);
    skt.on('dds:planetHitConfirm', ddsOnPlanetDamage);
    skt.on('dds:planetDestroyed',  ddsOnPlanetDestroyed);
    skt.on('planet:guardsDespawned', function(d){
      DDS_NOTIFY('[!] Guards despawned -- could not afford '+((d.cost||0).toLocaleString())+' DM!');
    });
    skt.on('dds:planetSpawned', function(d){ if(d.zone===ddsZoneKey(ddsZone)) DDS_SKT()?.emit('dds:enter',{zone:ddsZoneKey(ddsZone)}); });
    skt.on('dds:planetUpdate', function(d){ var idx=ddsPlanets.findIndex(function(p){return p.username===d.username;}); if(idx>=0) ddsPlanets[idx]=Object.assign(ddsPlanets[idx],d); else ddsPlanets.push(d); });
    skt.on('dds:wolGain',           function(d){ ddsWolBalance=d.total||ddsWolBalance; ddsUpdateWolHUD(); });
    skt.on('dds:dmGain',        ddsOnDMGain);
    skt.on('dds:kothUpdate',    ddsOnKothUpdate);
    skt.on('dds:kothHotspots',  function(d){ ddsKothHotspots=d.hotspots||[]; });
    skt.on('dds:megaCircle',    function(d){ DDS_NOTIFY('🔥 MEGA CIRCLE FORMING AT '+d.zone+' — TRIPLE DM!'); });
    skt.on('dds:npcHitConfirm', ddsOnNpcHitConfirm);
    skt.on('dds:dockConfirm',   ddsOnDockConfirm);
  }
}

function ddsResize() {
  if (!ddsCanvas) return;
  ddsCanvas.width  = window.innerWidth;
  ddsCanvas.height = window.innerHeight;
}

// ── CREATE SHIP (Gundam) ──────────────────────────────────────────────────────
function ddsCreateShip(x, y) {
  var g = ddsGundamData;
  var slots = (g && g.slots) || {};
  var shieldHP = (g && g.stats && g.stats.shieldHP) || 50000;
  // Add equipped part bonuses
  ['helmet','body','legs','jetpack','weapon1','weapon2','sword'].forEach(function(slot) {
    var part = slots[slot];
    if (!part || !part.stats) return;
    if (part.stats.hpBonus)    shieldHP += part.stats.hpBonus;
    if (part.stats.regenBonus) {}
  });
  return {
    x: x, y: y, vx: 0, vy: 0,
    angle: -Math.PI/2,
    speed: (g && g.stats && g.stats.speed) || 0.8,
    shield: shieldHP*2, maxShield: shieldHP*2,
    shieldRegen: (g && g.stats && g.stats.shieldRegen) || 200,
    swordDmg: ((g && g.stats && g.stats.swordDmg) || 10000) * 3,
    turretDmg: ((g && g.stats && g.stats.turretDmg) || 5000) * 3,
    warpMult: (g && g.stats && g.stats.warpRange) || 1.5,
    warpFlash: 0, thrusting: false,
    trail: [], smokeParticles: [], smokeTimer: 0,
    systems: { warp: true, scan: true, turret1: true, turret2: true },
  };
}

// ── ENTER DDS ────────────────────────────────────────────────────────────────
window.enterDDS = function(data) {
  if (!ddsCanvas) initDDS();
  ddsActive = true;
  window._ddsActive = true;
  window._playerZone = 'dds';

  // Load gundam data
  ddsGundamData = data && data.gundam;
  ddsDesign     = ddsGundamData && ddsGundamData.design;
  ddsDarkMatter = data && data.darkMatter || 0;

  // Blackout transition
  var blackout = document.createElement('div');
  blackout.style.cssText = 'position:fixed;inset:0;background:#000;z-index:1000;';
  document.body.appendChild(blackout);

  // Hide everything else
  window._spaceOverride = true;
  document.querySelectorAll('canvas').forEach(function(c) {
    if (c === ddsCanvas) return;
    c.dataset.ddsHidden = c.style.display || 'show';
    c.style.display = 'none';
  });
  document.querySelectorAll('*').forEach(function(el) {
    if (el === ddsCanvas || el === blackout) return;
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'BODY' || el.tagName === 'HTML') return;
    var pos = el.style.position || window.getComputedStyle(el).position;
    if ((pos === 'fixed' || pos === 'absolute') && !el.dataset.ddsHidden) {
      el.dataset.ddsHidden = el.style.display || 'show';
      el.style.display = 'none';
    }
  });

  // Init zone
  ddsZone = { n:1, e:1 };
  ddsBullets = []; ddsMissiles = []; ddsEnemyBullets = []; ddsExplosions = [];
  ddsOtherPlayers = {};

  ddsCanvas.style.display = 'block';
  ddsShip = ddsCreateShip(DDS_CENTER, DDS_CENTER);
  ddsGenerateStars(1);
  // Sanctum beacon in s-1
  ddsSanctumBeacon = (ddsZoneKey(ddsZone)==='s-1') ? {
    x: DDS_WORLD/2+600, y: DDS_WORLD/2-200,
    r: 55, promptRadius: 280,
    name: 'THE SANCTUM',
    color: '#AA44FF', accentColor: '#CC88FF',
  } : null;
  ddsLootCrates = []; ddsNpcEntities = {}; ddsDamageNumbers = []; ddsPlanets = [];
  DDS_SKT()?.emit('dds:getKoth');
  DDS_SKT()?.emit('dds:getFountain', {});

  // Tell server
  DDS_SKT()?.emit('player:zone', { zone: 'dds' });
  DDS_SKT()?.emit('player:move', { x:0, y:-1000, z:0, rotY:0 }); // ghost from earth
  DDS_SKT()?.emit('dds:enter', { zone: ddsZoneKey(ddsZone) });

  // Warp flash
  setTimeout(function() {
    blackout.style.transition = 'opacity 0.8s';
    blackout.style.opacity = '0';
    setTimeout(function() { blackout.remove(); }, 800);
  }, 300);

  // Start loop
  ddsLastTime = performance.now();
  if (!ddsAnimId) ddsLoop();

  // Move earth camera out of range -- stops proximity triggers (ANGER, robots, ducks etc)
  if (typeof camera !== "undefined") { camera.position.set(0, -9999, 0); }
  // Hide earth UI elements
  if (window._earthPlacesBtn) window._earthPlacesBtn.style.display='none';
  if (window._doorPrompt) window._doorPrompt.style.display='none';
  // Block doorPrompt from showing while in DDS
  if (window._doorPrompt) window._doorPrompt._ddsBlocked = true;
  window._ddsActive = true;
  // Also move _mineCamera -- this drives proximity for robots/ducks/animals
  if (window._mineCamera) window._mineCamera.position.set(5000,5000,5000);
  // Continuous rehide interval -- same as station pattern
  if (window._ddsHideInterval) clearInterval(window._ddsHideInterval);
  window._ddsHideInterval = setInterval(function() {
    if (!window._ddsActive) { clearInterval(window._ddsHideInterval); return; }
    if (window._doorPrompt) window._doorPrompt.style.display="none";
    if (window._mineCamera && window._mineCamera.position.y < 4000) window._mineCamera.position.set(5000,5000,5000);
    if (window._mineHUD) window._mineHUD.style.display="none";
    var _rb=document.getElementById("robotsBtn"); if(_rb) _rb.style.display="none";
    if (window.otherPlayers) Object.values(window.otherPlayers).forEach(function(p){ if(p.nameTag) p.nameTag.style.display="none"; if(p.chatBubble) p.chatBubble.style.display="none"; });
  }, 150);
  // Hide any visible fixed elements not yet tagged
  document.querySelectorAll('.npc-prompt,.door-prompt,#interactHint,#sitPrompt').forEach(function(el){
    el.dataset.ddsHidden='1'; el.style.display='none';
  });
  if (window._closePlacesMenu) window._closePlacesMenu();
  // Mobile HUD
  setTimeout(ddsInitMobileHUD, 800);
  // Desktop buttons
  ddsInitDesktopButtons();

  // DM HUD
  ddsUpdateDMHUD();

  DDS_NOTIFY('Entering Dimensional Battlefield — Zone s-1');
  // Trigger Missile Deflection Attack on first entry
  setTimeout(function(){ mdaTrigger(); }, 2500);
};

// ── LEAVE DDS ─────────────────────────────────────────────────────────────────
function leaveDDS() {
  ddsActive = false;
  document.getElementById('ddsDockHint')?.remove(); window._ddsDockHint=null;
  window._ddsActive = false;
  window._spaceOverride = false;
  if (window._ddsHideInterval) { clearInterval(window._ddsHideInterval); window._ddsHideInterval=null; }
  window._playerZone = 'sanctum';

  if (ddsAnimId) { cancelAnimationFrame(ddsAnimId); ddsAnimId = null; }
  if (ddsCanvas) ddsCanvas.style.display = 'none';

  // Restore everything
  document.querySelectorAll('[data-ddsHidden]').forEach(function(el) {
    var was = el.dataset.ddsHidden;
    el.style.display = was === 'show' ? '' : was;
    delete el.dataset.ddsHidden;
  });

  // Restore earth places
  if (window._earthPlacesBtn) window._earthPlacesBtn.style.display='';
  DDS_SKT()?.emit('dds:leave', {});
  DDS_SKT()?.emit('player:zone', { zone: 'sanctum' });

  ddsRemoveMobileHUD();
  document.getElementById('ddsDesktopBtns')?.remove();

  // Return to sanctum
  if (typeof window.enterSanctum === 'function') window.enterSanctum();
}

// ── GAME LOOP ─────────────────────────────────────────────────────────────────
function ddsLoop(ts) {
  ddsAnimId = requestAnimationFrame(ddsLoop);
  if (!ddsActive) return;
  var now = ts || performance.now();
  var dt = Math.min((now - ddsLastTime) / 1000, 0.05);
  ddsLastTime = now;
  ddsUpdate(dt);
  ddsDraw();
}

// ── UPDATE ────────────────────────────────────────────────────────────────────
function ddsUpdate(dt) {
  if (!ddsShip) return;

  // Timers
  if (ddsWarpCooldown > 0) ddsWarpCooldown--;
  if (ddsScanTimer > 0) ddsScanTimer -= dt;
  if (ddsShip._edgeCooldown > 0) ddsShip._edgeCooldown -= dt;

  // Movement -- same physics as deepspace
  var spd = 280 * (ddsShip.speed || 0.8);
  var mx = 0, my = 0;

  // Keyboard
  if (ddsKeys['ArrowLeft']  || ddsKeys['KeyA']) { ddsShip.angle -= 3.5 * dt; }
  if (ddsKeys['ArrowRight'] || ddsKeys['KeyD']) { ddsShip.angle += 3.5 * dt; }
  if (ddsKeys['ArrowUp']    || ddsKeys['KeyW']) { mx = Math.cos(ddsShip.angle)*spd*dt; my = Math.sin(ddsShip.angle)*spd*dt; ddsShip.thrusting=true; }
  else if (ddsKeys['ArrowDown'] || ddsKeys['KeyS']) { mx = -Math.cos(ddsShip.angle)*spd*0.5*dt; my = -Math.sin(ddsShip.angle)*spd*0.5*dt; ddsShip.thrusting=false; }
  else { ddsShip.thrusting = false; }

  // Joystick
  var joy = _ddsJoy.active ? {x:_ddsJoy.dx,y:_ddsJoy.dy} : (window._joystickDelta||{x:0,y:0});
  if (Math.abs(joy.x) > 0.1 || Math.abs(joy.y) > 0.1) {
    var jangle = Math.atan2(joy.y, joy.x);
    var jmag = Math.min(1, Math.sqrt(joy.x*joy.x+joy.y*joy.y));
    ddsShip.angle = jangle;
    mx += Math.cos(jangle)*spd*jmag*dt;
    my += Math.sin(jangle)*spd*jmag*dt;
    ddsShip.thrusting = jmag > 0.2;
  }

  ddsShip.vx += mx; ddsShip.vy += my;
  ddsShip.vx *= 0.96; ddsShip.vy *= 0.96;
  ddsShip.x += ddsShip.vx * dt * 60;
  ddsShip.y += ddsShip.vy * dt * 60;
  // No hard clamp -- zone transition handles edges
  ddsShip.x = Math.max(0, Math.min(DDS_WORLD, ddsShip.x));
  ddsShip.y = Math.max(0, Math.min(DDS_WORLD, ddsShip.y));

  // Trail
  ddsShip.trail.push({x:ddsShip.x, y:ddsShip.y});
  if (ddsShip.trail.length > 18) ddsShip.trail.shift();

  // Shield regen
  if (ddsShip.shield < ddsShip.maxShield) {
    ddsShip.shield = Math.min(ddsShip.maxShield, ddsShip.shield + ddsShip.shieldRegen * dt);
  }

  // Warp flash decay
  if (ddsShip.warpFlash > 0) ddsShip.warpFlash -= dt * 3;

  // Smoke particles
  ddsShip.smokeTimer += dt;
  if (ddsShip.thrusting && ddsShip.smokeTimer > 0.06) {
    ddsShip.smokeTimer = 0;
    var sa = ddsShip.angle + Math.PI + (Math.random()-0.5)*0.5;
    ddsShip.smokeParticles.push({
      x: ddsShip.x - Math.cos(ddsShip.angle)*18,
      y: ddsShip.y - Math.sin(ddsShip.angle)*18,
      vx: Math.cos(sa)*1.5+(Math.random()-0.5), vy: Math.sin(sa)*1.5+(Math.random()-0.5),
      life: 1, r: 4+Math.random()*4,
      color: ddsDesign ? (ddsDesign.colGlow || '#00FFCC') : '#00FFCC',
    });
  }
  ddsShip.smokeParticles = ddsShip.smokeParticles.filter(function(p){
    p.x+=p.vx; p.y+=p.vy; p.life-=0.04; p.r*=0.97; return p.life>0;
  });

  // Bullets
  ddsBullets = ddsBullets.filter(function(b) {
    b.x+=b.vx; b.y+=b.vy; b.life--;
    b.trail.push({x:b.x,y:b.y}); if(b.trail.length>6) b.trail.shift();
    if (b.isPlayer) {
      for (var _bpi=0;_bpi<ddsPlanets.length;_bpi++) {
        var _bpl=ddsPlanets[_bpi];
        if (!_bpl||_bpl.zone!==ddsZoneKey(ddsZone)||_bpl.username===window._myUsername) continue;
        var _bpr=60+(_bpl.tier||2)*20+Math.min((_bpl.population||0)/500,40);
        if (Math.hypot(b.x-_bpl.x,b.y-_bpl.y)<_bpr) {
          DDS_SKT()?.emit('dds:hitPlanet',{planetOwner:_bpl.username,dmg:b.dmg||5000});
          b.life=0;
        }
      }
    }
    return b.life > 0;
  });

  // Missiles + smoke
  ddsMissiles = ddsMissiles.filter(function(m) {
    m.x+=m.vx; m.y+=m.vy; m.life--; m.age++;
    if (!m.smokeTrail) m.smokeTrail=[];
    if (m.age%2===0) m.smokeTrail.push({
      x:m.x, y:m.y, vx:(Math.random()-0.5)*0.5, vy:(Math.random()-0.5)*0.5,
      life:1, r:3+Math.random()*3,
    });
    m.smokeTrail = m.smokeTrail.filter(function(s){s.x+=s.vx;s.y+=s.vy;s.life-=0.06;return s.life>0;});
    return m.life > 0;
  });

  // Explosions
  ddsExplosions = ddsExplosions.filter(function(e) {
    e.t+=dt; return e.t < e.maxT;
  });

  // Sword swing
  if (ddsSwordSwing) {
    ddsSwordSwing.t += dt;
    if (ddsSwordSwing.t >= ddsSwordSwing.maxT) ddsSwordSwing = null;
  }

  // Auto-targeting -- find nearest other player or NPC
  var nearest = null, nearDist = 1200; // turret range
  // Check other players
  Object.values(ddsOtherPlayers).forEach(function(op) {
    if (op.zone && op.zone !== ddsZoneKey(ddsZone)) return;
    var d = Math.hypot(op.x-ddsShip.x, op.y-ddsShip.y);
    if (d < nearDist) { nearDist=d; nearest={...op, isNpc:false}; }
  });
  // Check NPCs in same zone -- skip own planet guards
  Object.values(ddsNpcEntities).forEach(function(n) {
    if (n.zone !== ddsZoneKey(ddsZone)) return;
    if (n.factionId === 'planet_'+window._myUsername) return; // own defense force
    var d = Math.hypot(n.x-ddsShip.x, n.y-ddsShip.y);
    if (d < nearDist) { nearDist=d; nearest={...n, isNpc:true, username:n.id}; }
  });
  ddsAutoTarget = nearest;

  // Auto fire turrets
  if (ddsWeaponsOn && ddsAutoTarget && ddsShip.systems.turret1) {
    ddsAutoFireTimer += dt;
    if (ddsAutoFireTimer >= 0.8) { // fire every 0.8s
      ddsAutoFireTimer = 0;
      var ta = Math.atan2(ddsAutoTarget.y-ddsShip.y, ddsAutoTarget.x-ddsShip.x);
      // Turret bullet -- colored by visor color
      var bcol = ddsDesign ? (ddsDesign.colVisor||'#FF2200') : '#FF2200';
      ddsBullets.push({
        x:ddsShip.x, y:ddsShip.y,
        vx:Math.cos(ta)*14, vy:Math.sin(ta)*14,
        life:70, trail:[], dmg:ddsShip.turretDmg||5000,
        color:bcol, isPlayer:true,
      });
      // Second turret fires missile every 3 fires
      if (ddsAutoFireTimer === 0 && Math.random() < 0.3) {
        ddsMissiles.push({
          x:ddsShip.x, y:ddsShip.y,
          vx:Math.cos(ta)*6, vy:Math.sin(ta)*6,
          angle:ta, life:180, trail:[], smokeTrail:[], age:0,
          dmg:ddsShip.turretDmg*3||15000, isPlayer:true,
          color:bcol,
        });
        // Hit NPC with missile
        if (ddsAutoTarget && ddsAutoTarget.isNpc) {
          DDS_SKT()?.emit('dds:hitNpc', { npcId: ddsAutoTarget.id, dmg: ddsShip.turretDmg*3||15000, type:'missile' });
        }
      }
      DDS_SKT()?.emit('dds:shoot', { x:ddsShip.x, y:ddsShip.y, angle:ta, type:'bullet' });
      // If target is NPC, emit hit directly
      if (ddsAutoTarget && ddsAutoTarget.isNpc) {
        DDS_SKT()?.emit('dds:hitNpc', { npcId: ddsAutoTarget.id, dmg: ddsShip.turretDmg||5000, type:'bullet' });
      }
      // Planet hitbox -- check if auto-target is near a planet
      ddsPlanets.forEach(function(_apl){
        if (!_apl||_apl.zone!==ddsZoneKey(ddsZone)) return;
        if (_apl.username===window._myUsername) return;
        var _apr=60+(_apl.tier||2)*20+Math.min((_apl.population||0)/500,40);
        var _atx=ddsAutoTarget?ddsAutoTarget.x:ddsShip.x+Math.cos(ta)*_apr;
        var _aty=ddsAutoTarget?ddsAutoTarget.y:ddsShip.y+Math.sin(ta)*_apr;
        if (Math.hypot(_atx-_apl.x,_aty-_apl.y)<_apr+40) {
          DDS_SKT()?.emit('dds:hitPlanet',{planetOwner:_apl.username,dmg:ddsShip.turretDmg||5000});
        }
      });
    }
  }

  // MDA update
  mdaUpdate(dt);

  // Laser update
  if (ddsLaserState.charging) {
    ddsLaserState.chargeT += dt;
    if (ddsLaserState.chargeT >= 1.5) { ddsFireLaser(); }
  }
  if (ddsLaserState.firing) {
    ddsLaserState.fireT -= dt;
    if (ddsLaserState.fireT <= 0) { ddsLaserState.firing=false; ddsLaserState.beam=null; }
  }
  // Jericho missiles homing
  ddsJerichoMissiles = ddsJerichoMissiles.filter(function(m){
    if (m.target) {
      var ta=Math.atan2(m.target.y-m.y,m.target.x-m.x);
      m.angle+=(ta-m.angle)*0.12; m.vx=Math.cos(m.angle)*10; m.vy=Math.sin(m.angle)*10;
      if (Math.hypot(m.target.x-m.x,m.target.y-m.y)<55) {
        ddsExplosions.push({x:m.x,y:m.y,r:130,t:0,maxT:0.8,color:'#FF6600'});
        ddsExplosions.push({x:m.x,y:m.y,r:55,t:0,maxT:0.45,color:'#FFCC00'});
        ddsScreenShake=Math.max(ddsScreenShake,12);
        return false;
      }
    }
    m.x+=m.vx; m.y+=m.vy; m.life--; m.age++;
    if (!m.smokeTrail) m.smokeTrail=[];
    if (m.age%2===0) m.smokeTrail.push({x:m.x,y:m.y,life:1,r:5+Math.random()*3});
    m.smokeTrail=m.smokeTrail.filter(function(sm){sm.life-=0.07;return sm.life>0;});
    return m.life>0;
  });
  if (ddsScreenShake>0.3) ddsScreenShake*=0.78; else ddsScreenShake=0;
  if (ddsHellfireFlash>0) ddsHellfireFlash=Math.max(0,ddsHellfireFlash-dt*2.5);
  // Scanner zoom update
  if (ddsScanState.active) {
    ddsScanState.timer += dt;
    ddsScanState.zoom += (2.0-ddsScanState.zoom)*dt*2.5;
    if (ddsScanState.timer >= ddsScanState.duration) {
      ddsScanState.active=false;
    }
  } else if (ddsScanState.zoom > 1.0) {
    ddsScanState.zoom = Math.max(1.0, ddsScanState.zoom-dt*0.8);
  }
  // Enemy projectiles
  ddsEnemyProjectiles = ddsEnemyProjectiles.filter(function(p){
    p.x+=p.vx; p.y+=p.vy; p.life--;
    if (p.trail) { p.trail.push({x:p.x,y:p.y}); if(p.trail.length>6) p.trail.shift(); }
    // Check hit on player
    if (ddsShip && Math.hypot(p.x-ddsShip.x,p.y-ddsShip.y)<28) {
      ddsOnHit({dmg:p.dmg||1000}); return false;
    }
    return p.life>0;
  });
  // Advance NPC interpolation
  Object.values(ddsNpcEntities).forEach(function(n) {
    if (n.interpInterval) {
      n.interpT = Math.min(1, (n.interpT||0) + dt / n.interpInterval);
      n.x = n.prevX + (n.nextX - n.prevX) * n.interpT;
      n.y = n.prevY + (n.nextY - n.prevY) * n.interpT;
      // Smooth angle
      if (n.nextAngle !== undefined) {
        var da = n.nextAngle - (n.angle||0);
        while (da > Math.PI) da -= Math.PI*2;
        while (da < -Math.PI) da += Math.PI*2;
        n.angle = (n.angle||0) + da * Math.min(1, dt*8);
      }
    }
  });

  // Sanctum beacon proximity
  // WoL fountain update
  if (ddsWolFountain) {
    ddsWolFountain.t = (ddsWolFountain.t||0) + (1/60);
    if (ddsWolFountain.active && ddsWolFountain.timer > 0) {
      ddsWolFountain.timer -= (1/60);
      if (ddsWolFountain.timer <= 0) ddsWolFountain = null;
    }
  }
  ddsDockPrompt = false;
  if (ddsSanctumBeacon && ddsShip) {
    var _bd = Math.hypot(ddsShip.x-ddsSanctumBeacon.x, ddsShip.y-ddsSanctumBeacon.y);
    if (_bd < ddsSanctumBeacon.promptRadius) ddsDockPrompt = true;
  }
  if (window._ddsDockHint) window._ddsDockHint.style.display=(ddsDockPrompt?'block':'none');
  // Loot crate proximity
  ddsLootCrates = ddsLootCrates.filter(function(lc){
    if (lc.zone !== ddsZoneKey(ddsZone)) return true;
    lc.t += dt;
    if (!ddsShip) return true;
    var ld = Math.hypot(ddsShip.x-lc.x, ddsShip.y-lc.y);
    if (ld < 60) {
      DDS_SKT()?.emit('dds:collectLoot', { id:lc.id, darkMatter:lc.darkMatter });
      ddsDarkMatter += lc.darkMatter;
      ddsUpdateDMHUD();
      DDS_NOTIFY('⬡ +'+Math.round(lc.darkMatter).toLocaleString()+' DM collected');
      return false;
    }
    return lc.t < 120; // despawn after 2 min
  });
  // Damage number update
  ddsDamageNumbers = ddsDamageNumbers.filter(function(dn){
    dn.t+=dt; dn.x+=dn.vx*dt; dn.y+=dn.vy*dt; dn.vy*=0.92;
    return dn.t < dn.maxT;
  });
  // Zone edge transition
  if (!ddsZoneTransitioning) {
    if (ddsShip.y < DDS_EDGE)             ddsAttemptZoneTransition('north');
    else if (ddsShip.y > DDS_WORLD-DDS_EDGE) ddsAttemptZoneTransition('south');
    else if (ddsShip.x > DDS_WORLD-DDS_EDGE) ddsAttemptZoneTransition('east');
    else if (ddsShip.x < DDS_EDGE)           ddsAttemptZoneTransition('west');
  }

  // Broadcast position
  var now2 = performance.now();
  if (now2 - ddsLastMoveSent > DDS_MOVE_INTERVAL) {
    ddsLastMoveSent = now2;
    DDS_SKT()?.emit('dds:move', {
      x: Math.round(ddsShip.x), y: Math.round(ddsShip.y),
      angle: parseFloat(ddsShip.angle.toFixed(3)),
      zone: ddsZoneKey(ddsZone),
    });
  }
}

// ── DRAW ──────────────────────────────────────────────────────────────────────
function ddsDraw() {
  if (!ddsCtx || !ddsShip) return;
  var W = ddsCanvas.width, H = ddsCanvas.height;
  var cx = W/2 - ddsShip.x, cy = H/2 - ddsShip.y; // camera offset

  // Background
  ddsCtx.fillStyle = '#000308';
  ddsCtx.fillRect(0,0,W,H);

  ddsCtx.save();
  var _sx=(ddsScreenShake>0.5)?(Math.random()-0.5)*ddsScreenShake:0;
  var _sy=(ddsScreenShake>0.5)?(Math.random()-0.5)*ddsScreenShake:0;
  ddsCtx.translate(cx+_sx, cy+_sy);

  // Stars
  ddsStars.forEach(function(s) {
    ddsCtx.globalAlpha = s.a||0.6;
    ddsCtx.fillStyle = '#FFFFFF';
    ddsCtx.beginPath(); ddsCtx.arc(s.x,s.y,s.r,0,Math.PI*2); ddsCtx.fill();
  });
  ddsCtx.globalAlpha = 1;

  // Smoke particles
  ddsShip.smokeParticles.forEach(function(p) {
    ddsCtx.globalAlpha = p.life * 0.5;
    ddsCtx.fillStyle = p.color;
    ddsCtx.shadowColor = p.color; ddsCtx.shadowBlur = 8;
    ddsCtx.beginPath(); ddsCtx.arc(p.x,p.y,p.r,0,Math.PI*2); ddsCtx.fill();
    ddsCtx.shadowBlur = 0;
  });
  ddsCtx.globalAlpha = 1;

  // Zone boundaries
  ddsDrawZoneBoundaries();

  // Other players
  Object.values(ddsOtherPlayers).forEach(function(op) {
    if (op.zone && op.zone !== ddsZoneKey(ddsZone)) return;
    ddsDrawGundamShip(op.x, op.y, op.angle||0, null, false);
    // Nametag
    ddsCtx.font = '10px Courier New'; ddsCtx.textAlign='center';
    ddsCtx.fillStyle='rgba(100,200,255,0.8)';
    ddsCtx.fillText(op.username||'', op.x, op.y-32);
  });

  // Missile smoke trails
  ddsMissiles.forEach(function(m) {
    if (m.smokeTrail) m.smokeTrail.forEach(function(s) {
      ddsCtx.globalAlpha = s.life*0.3;
      ddsCtx.fillStyle = m.color||'#FF8800';
      ddsCtx.beginPath(); ddsCtx.arc(s.x,s.y,s.r,0,Math.PI*2); ddsCtx.fill();
    });
    // Missile body
    ddsCtx.globalAlpha = 1;
    ddsCtx.shadowColor = m.color||'#FF8800'; ddsCtx.shadowBlur=10;
    ddsCtx.fillStyle = m.color||'#FF8800';
    ddsCtx.save(); ddsCtx.translate(m.x,m.y); ddsCtx.rotate(m.angle||0);
    ddsCtx.beginPath(); ddsCtx.ellipse(0,0,3,7,0,0,Math.PI*2); ddsCtx.fill();
    ddsCtx.restore(); ddsCtx.shadowBlur=0;
  });

  // Bullets
  ddsBullets.forEach(function(b) {
    var bcol = b.color || '#00FFFF';
    if (b.trail.length>1) {
      ddsCtx.strokeStyle=bcol; ddsCtx.lineWidth=2; ddsCtx.globalAlpha=0.4;
      ddsCtx.beginPath(); ddsCtx.moveTo(b.trail[0].x,b.trail[0].y);
      b.trail.forEach(function(t){ddsCtx.lineTo(t.x,t.y)}); ddsCtx.stroke();
    }
    ddsCtx.globalAlpha=1;
    ddsCtx.shadowColor=bcol; ddsCtx.shadowBlur=8;
    ddsCtx.fillStyle=bcol;
    ddsCtx.beginPath(); ddsCtx.arc(b.x,b.y,3,0,Math.PI*2); ddsCtx.fill();
    ddsCtx.shadowBlur=0;
  });

  // Explosions
  ddsExplosions.forEach(function(e) {
    var pct = e.t/e.maxT;
    ddsCtx.globalAlpha=(1-pct)*0.8;
    ddsCtx.strokeStyle=e.color||'#FF8800'; ddsCtx.lineWidth=3;
    ddsCtx.shadowColor=e.color||'#FF8800'; ddsCtx.shadowBlur=20;
    ddsCtx.beginPath(); ddsCtx.arc(e.x,e.y,e.r*pct,0,Math.PI*2); ddsCtx.stroke();
    ddsCtx.shadowBlur=0; ddsCtx.globalAlpha=1;
  });

  // Laser beam
  ddsDrawLaser();

  // Jericho missiles
  ddsJerichoMissiles.forEach(function(m) {
    m.smokeTrail&&m.smokeTrail.forEach(function(s){
      ddsCtx.globalAlpha=s.life*0.3; ddsCtx.fillStyle=m.color||'#FF4400';
      ddsCtx.beginPath(); ddsCtx.arc(s.x,s.y,s.r,0,Math.PI*2); ddsCtx.fill();
    });
    ddsCtx.globalAlpha=1; ddsCtx.fillStyle=m.color||'#FF4400';
    ddsCtx.shadowColor=m.color||'#FF4400'; ddsCtx.shadowBlur=10;
    ddsCtx.save(); ddsCtx.translate(m.x,m.y); ddsCtx.rotate(m.angle);
    ddsCtx.beginPath(); ddsCtx.ellipse(0,0,3,9,0,0,Math.PI*2); ddsCtx.fill();
    ddsCtx.restore(); ddsCtx.shadowBlur=0;
  });

  // Sword swing animation
  if (ddsSwordSwing && ddsShip) {
    var sw = ddsSwordSwing;
    var swPct = sw.t/sw.maxT;
    var swColor = ddsDesign ? (ddsDesign.colVisor||'#FF2200') : '#FF2200';
    ddsCtx.save();
    ddsCtx.translate(ddsShip.x, ddsShip.y);
    // Arc sweep
    var startA = sw.startAngle;
    var sweepA = sw.sweepAngle * swPct;
    ddsCtx.strokeStyle = swColor;
    ddsCtx.lineWidth = 6 - swPct*3;
    ddsCtx.globalAlpha = 1 - swPct*0.7;
    ddsCtx.shadowColor = swColor; ddsCtx.shadowBlur = 20;
    ddsCtx.beginPath();
    ddsCtx.arc(0, 0, sw.radius, startA, startA + sweepA);
    ddsCtx.stroke();
    // Blade tip glow
    var tipA = startA + sweepA;
    ddsCtx.globalAlpha = (1-swPct)*0.9;
    ddsCtx.fillStyle = swColor;
    ddsCtx.beginPath();
    ddsCtx.arc(Math.cos(tipA)*sw.radius, Math.sin(tipA)*sw.radius, 8-swPct*6, 0, Math.PI*2);
    ddsCtx.fill();
    ddsCtx.shadowBlur=0; ddsCtx.globalAlpha=1;
    ddsCtx.restore();
  }

  // Player gundam
  ddsDrawGundamShip(ddsShip.x, ddsShip.y, ddsShip.angle, ddsDesign, true);

  // Auto-target indicator
  if (ddsAutoTarget) {
    ddsCtx.strokeStyle='rgba(255,50,50,0.5)'; ddsCtx.lineWidth=1;
    ddsCtx.setLineDash([4,4]);
    ddsCtx.beginPath();
    ddsCtx.arc(ddsAutoTarget.x, ddsAutoTarget.y, 22, 0, Math.PI*2);
    ddsCtx.stroke(); ddsCtx.setLineDash([]);
  }
  // NPC entities + loot + koth + damage numbers (world space)
  ddsDrawNPCs();
  // Enemy projectiles (world space)
  ddsEnemyProjectiles.forEach(function(p){
    if (p.type==="missile") {
      if (p.smokeTrail) p.smokeTrail.forEach(function(sm){ ddsCtx.globalAlpha=sm.life*0.3; ddsCtx.fillStyle=p.color; ddsCtx.beginPath(); ddsCtx.arc(sm.x,sm.y,3,0,Math.PI*2); ddsCtx.fill(); });
      ddsCtx.globalAlpha=1; ddsCtx.fillStyle=p.color; ddsCtx.shadowColor=p.color; ddsCtx.shadowBlur=10;
      ddsCtx.save(); ddsCtx.translate(p.x,p.y); ddsCtx.rotate(p.angle||0);
      ddsCtx.beginPath(); ddsCtx.ellipse(0,0,3,8,0,0,Math.PI*2); ddsCtx.fill();
      ddsCtx.restore(); ddsCtx.shadowBlur=0;
    } else {
      if (p.trail&&p.trail.length>1) { ddsCtx.strokeStyle=p.color; ddsCtx.lineWidth=2; ddsCtx.globalAlpha=0.4; ddsCtx.beginPath(); ddsCtx.moveTo(p.trail[0].x,p.trail[0].y); p.trail.forEach(function(t){ddsCtx.lineTo(t.x,t.y);}); ddsCtx.stroke(); }
      ddsCtx.globalAlpha=1; ddsCtx.fillStyle=p.color; ddsCtx.shadowColor=p.color; ddsCtx.shadowBlur=8;
      ddsCtx.beginPath(); ddsCtx.arc(p.x,p.y,3,0,Math.PI*2); ddsCtx.fill(); ddsCtx.shadowBlur=0;
    }
  });


  ddsCtx.restore();
  if (ddsHellfireFlash>0.02) {
    ddsCtx.globalAlpha=ddsHellfireFlash*0.55;
    ddsCtx.fillStyle='#FF5500';
    ddsCtx.fillRect(0,0,W,H);
    ddsCtx.globalAlpha=1;
  }
  ddsDrawScannerHUD(W,H);

  // MDA draw
  mdaDraw(W,H);

  // HUD
  ddsDrawHUD(W,H);
  if (window.innerWidth<=900) ddsDrawMobileRings(W,H);
}

// ── DRAW GUNDAM SHIP ─────────────────────────────────────────────────────────
function ddsDrawGundamShip(x, y, angle, design, isPlayer) {
  ddsCtx.save();
  ddsCtx.translate(x, y);
  ddsCtx.rotate(angle + Math.PI/2);

  var pri  = design ? (design.colPri||'#1144BB')    : '#1144BB';
  var visor= design ? (design.colVisor||'#FF2200')   : (isPlayer?'#FF2200':'#FF8800');
  var glow = design ? (design.colGlow||'#00FFCC')    : '#00FFCC';
  var acc  = design ? (design.colAccent||'#AACCFF')  : '#AACCFF';
  var s    = isPlayer ? 14 : 22; // scale

  // Jetpack glow trail
  if (isPlayer && ddsShip.thrusting) {
    var tg = ddsCtx.createRadialGradient(0,s*1.4,0,0,s*1.4,s*2.5);
    tg.addColorStop(0, glow.replace('rgb','rgba').replace(')',',0.8)') || 'rgba(0,255,200,0.8)');
    tg.addColorStop(1, 'transparent');
    ddsCtx.fillStyle=tg; ddsCtx.beginPath(); ddsCtx.arc(0,s*1.4,s*2.5,0,Math.PI*2); ddsCtx.fill();
  }

  // Body
  ddsCtx.fillStyle = pri;
  ddsCtx.fillRect(-s*0.55, -s*0.9, s*1.1, s*1.8);
  // Shoulders
  ddsCtx.fillStyle = acc;
  ddsCtx.fillRect(-s*1.1, -s*0.8, s*0.5, s*0.9);
  ddsCtx.fillRect(s*0.6,  -s*0.8, s*0.5, s*0.9);
  // Head
  ddsCtx.fillStyle = pri;
  ddsCtx.fillRect(-s*0.4, -s*1.5, s*0.8, s*0.65);
  // Visor
  ddsCtx.fillStyle = visor;
  ddsCtx.shadowColor = visor; ddsCtx.shadowBlur = 8;
  ddsCtx.fillRect(-s*0.35, -s*1.35, s*0.7, s*0.28);
  ddsCtx.shadowBlur = 0;
  // Head design
  if (design && design.head === 'vfin') {
    ddsCtx.fillStyle = acc;
    ddsCtx.beginPath(); ddsCtx.moveTo(-s*0.08,-s*1.5); ddsCtx.lineTo(-s*0.35,-s*2.1); ddsCtx.lineTo(-s*0.02,-s*1.5); ddsCtx.fill();
    ddsCtx.beginPath(); ddsCtx.moveTo(s*0.08,-s*1.5); ddsCtx.lineTo(s*0.35,-s*2.1); ddsCtx.lineTo(s*0.02,-s*1.5); ddsCtx.fill();
  } else if (design && design.head === 'halo') {
    ddsCtx.strokeStyle=glow; ddsCtx.lineWidth=2; ddsCtx.globalAlpha=0.7;
    ddsCtx.shadowColor=glow; ddsCtx.shadowBlur=10;
    ddsCtx.beginPath(); ddsCtx.ellipse(0,-s*1.8,s*0.6,s*0.2,0,0,Math.PI*2); ddsCtx.stroke();
    ddsCtx.shadowBlur=0; ddsCtx.globalAlpha=1;
  } else if (design && design.head === 'horn') {
    ddsCtx.fillStyle=visor;
    ddsCtx.beginPath(); ddsCtx.moveTo(-s*0.06,-s*1.5); ddsCtx.lineTo(0,-s*2.2); ddsCtx.lineTo(s*0.06,-s*1.5); ddsCtx.fill();
  }
  // Chest glow
  ddsCtx.fillStyle=glow; ddsCtx.globalAlpha=0.7;
  ddsCtx.shadowColor=glow; ddsCtx.shadowBlur=10;
  ddsCtx.beginPath(); ddsCtx.arc(0,-s*0.1,s*0.2,0,Math.PI*2); ddsCtx.fill();
  ddsCtx.shadowBlur=0; ddsCtx.globalAlpha=1;
  // Arms
  ddsCtx.fillStyle=pri;
  ddsCtx.fillRect(-s*0.9,-s*0.3,s*0.3,s*1.0);
  ddsCtx.fillRect(s*0.6, -s*0.3,s*0.3,s*1.0);
  // Arm cannons
  ddsCtx.fillStyle=visor; ddsCtx.shadowColor=visor; ddsCtx.shadowBlur=6;
  ddsCtx.fillRect(-s*0.95,s*0.5,s*0.15,s*0.35);
  ddsCtx.fillRect(s*0.8,  s*0.5,s*0.15,s*0.35);
  ddsCtx.shadowBlur=0;
  // Legs
  ddsCtx.fillStyle=pri;
  ddsCtx.fillRect(-s*0.48,s*0.9,s*0.4,s*1.0);
  ddsCtx.fillRect(s*0.08, s*0.9,s*0.4,s*1.0);
  // Boots glow
  ddsCtx.fillStyle=glow; ddsCtx.globalAlpha=0.5;
  ddsCtx.fillRect(-s*0.52,s*1.8,s*0.48,s*0.15);
  ddsCtx.fillRect(s*0.04, s*1.8,s*0.48,s*0.15);
  ddsCtx.globalAlpha=1;
  // Missile launchers on back
  ddsCtx.fillStyle='#0a1525';
  ddsCtx.fillRect(-s*1.3,-s*0.6,s*0.18,s*0.9);
  ddsCtx.fillRect(s*1.12, -s*0.6,s*0.18,s*0.9);
  ddsCtx.fillStyle=visor; ddsCtx.shadowColor=visor; ddsCtx.shadowBlur=6;
  for(var mi=0;mi<3;mi++){
    ddsCtx.fillRect(-s*1.3,-s*0.55+mi*s*0.28,s*0.08,s*0.1);
    ddsCtx.fillRect(s*1.22,-s*0.55+mi*s*0.28,s*0.08,s*0.1);
  }
  ddsCtx.shadowBlur=0;

  // Shield ring
  if (isPlayer && ddsShip && ddsShip.shield > 0) {
    var pct = ddsShip.shield/ddsShip.maxShield;
    ddsCtx.strokeStyle='rgba(0,200,255,'+(pct*0.35)+')';
    ddsCtx.lineWidth=2;
    ddsCtx.beginPath(); ddsCtx.arc(0,0,s*2.4,0,Math.PI*2); ddsCtx.stroke();
  }

  // Warp flash
  if (isPlayer && ddsShip && ddsShip.warpFlash > 0) {
    ddsCtx.globalAlpha = ddsShip.warpFlash * 0.6;
    ddsCtx.fillStyle='rgba(100,200,255,0.9)';
    ddsCtx.fillRect(-s*2,-s*3,s*4,s*6);
    ddsCtx.globalAlpha=1;
  }

  ddsCtx.restore();
}

// ── MISSILE DEFLECTION ATTACK ────────────────────────────────────────────────
function mdaTrigger() {
  if (!ddsShip || mda.phase !== 'none') return;
  mda.checkpointX = ddsShip.x;
  mda.checkpointY = ddsShip.y;
  mda.phase = 'spawn';
  mda.wave = 1;
  mda.mechs = [];
  mda.missiles = [];
  mda.swordFlash = 0;
  mda.shockwave = null;
  // Spawn 20 mechs in ring around player
  var RING_RADIUS = 800;
  for (var i=0; i<20; i++) {
    var ang = (i/20)*Math.PI*2;
    mda.mechs.push({
      x: ddsShip.x + Math.cos(ang)*RING_RADIUS,
      y: ddsShip.y + Math.sin(ang)*RING_RADIUS,
      angle: ang + Math.PI, // face player
      alive: true,
      flashTimer: 0,
    });
  }
  DDS_NOTIFY('⚠ THREAT DETECTED — ENEMY MECHS SURROUNDING');
  // Countdown before missiles
  mda.countdownTimer = 3.5;
  mda.phase = 'countdown';
}

function mdaReset() {
  // Restore checkpoint
  if (ddsShip) { ddsShip.x=mda.checkpointX; ddsShip.y=mda.checkpointY; ddsShip.vx=0; ddsShip.vy=0; }
  mda.phase = 'none';
  mda.mechs = []; mda.missiles = [];
  ddsExplosions = [];
  DDS_NOTIFY('Mission failed — restarting encounter');
  setTimeout(mdaTrigger, 2000);
}

function mdaSuccess() {
  mda.phase = 'success';
  // Red flash
  mda.swordFlash = 1.0;
  // Shockwave ring
  mda.shockwave = { r:0, maxR:1000, t:0, maxT:0.8 };
  // Kill all mechs
  mda.mechs.forEach(function(m) {
    m.alive = false;
    ddsExplosions.push({x:m.x,y:m.y,r:80,t:0,maxT:0.6,color:'#FF4400'});
  });
  // Destroy all missiles
  mda.missiles.forEach(function(m) {
    ddsExplosions.push({x:m.x,y:m.y,r:40,t:0,maxT:0.4,color:'#FF8800'});
  });
  mda.missiles = [];
  DDS_NOTIFY('✦ MISSILE DEFLECTION — ALL TARGETS DESTROYED');
  // Hide mobile sword flash
  var sb = document.getElementById('ddsMobSword');
  if (sb) { sb.style.border='2px solid #FF2200'; sb.style.boxShadow=''; }
  setTimeout(function() {
    mda.phase = 'none';
    mda.mechs = []; mda.missiles = [];
    mda.shockwave = null;
    DDS_NOTIFY('Zone clear. Explore the Dimensional Battlefield.');
  }, 3000);
}

function mdaUpdate(dt) {
  if (mda.phase === 'none' || mda.phase === 'success') {
    if (mda.swordFlash > 0) mda.swordFlash -= dt*3;
    if (mda.shockwave) { mda.shockwave.t+=dt; if(mda.shockwave.t>=mda.shockwave.maxT) mda.shockwave=null; }
    return;
  }
  if (mda.phase === 'countdown') {
    mda.countdownTimer -= dt;
    if (mda.countdownTimer <= 0) {
      // Fire missiles from all mechs
      mda.missiles = [];
      mda.mechs.forEach(function(m) {
        if (!ddsShip) return;
        var ta = Math.atan2(ddsShip.y-m.y, ddsShip.x-m.x);
        mda.missiles.push({ x:m.x, y:m.y, vx:Math.cos(ta)*4, vy:Math.sin(ta)*4, angle:ta, life:500, trail:[], smokeTrail:[], age:0 });
      });
      mda.phase = 'missiles_incoming';
      mda.windowTimer = 0; // will open when missiles get close
      DDS_NOTIFY('⚠ MISSILES INCOMING');
    }
    return;
  }
  if (mda.phase === 'missiles_incoming') {
    // Update missiles
    var allDead = true;
    mda.missiles = mda.missiles.filter(function(m) {
      m.x+=m.vx; m.y+=m.vy; m.life--; m.age++;
      if (!m.smokeTrail) m.smokeTrail=[];
      if (m.age%3===0) m.smokeTrail.push({x:m.x,y:m.y,vx:(Math.random()-0.5)*0.3,vy:(Math.random()-0.5)*0.3,life:1,r:3});
      m.smokeTrail=m.smokeTrail.filter(function(s){s.life-=0.07;return s.life>0;});
      return m.life > 0;
    });
    if (mda.missiles.length === 0) { mdaReset(); return; }
    // Check if closest missile is within sword window range
    if (!ddsShip) return;
    var swordR = (ddsGundamData&&ddsGundamData.slots&&ddsGundamData.slots.sword&&ddsGundamData.slots.sword.stats&&ddsGundamData.slots.sword.stats.sweepRadius)||120;
    var openWindow = false;
    mda.missiles.forEach(function(m) {
      var d = Math.hypot(m.x-ddsShip.x, m.y-ddsShip.y);
      if (d < swordR * 1.8) openWindow = true;
      // If missile actually hits player
      if (d < 24) { mdaReset(); }
    });
    if (openWindow && mda.phase === 'missiles_incoming') {
      mda.phase = 'sword_window';
      mda.windowTimer = 1.2; // 1.2s to tap sword
      DDS_NOTIFY('⚔ TAP SWORD NOW!');
      // Flash mobile sword button
      var sb = document.getElementById('ddsMobSword');
      if (sb) {
        var _fi = true;
        var _fiv = setInterval(function() {
          if (!_fi || mda.phase !== 'sword_window') { clearInterval(_fiv); return; }
          sb.style.border = sb.style.border.includes('FFFFFF') ? '3px solid #FF0000' : '3px solid #FFFFFF';
          sb.style.boxShadow = sb.style.border.includes('FF0000') ? '0 0 20px #FF0000' : '0 0 20px #FFFFFF';
        }, 150);
      }
    }
    return;
  }
  if (mda.phase === 'sword_window') {
    // Update missiles
    mda.missiles.forEach(function(m) { m.x+=m.vx; m.y+=m.vy; m.life--; m.age++; });
    mda.missiles = mda.missiles.filter(function(m){ return m.life>0; });
    mda.windowTimer -= dt;
    if (mda.windowTimer <= 0) {
      // Missed window -- fail
      if (ddsShip) { ddsShip.shield = Math.max(0, ddsShip.shield - ddsShip.maxShield*0.8); }
      mdaReset();
    }
    // Check hits
    if (ddsShip) {
      mda.missiles.forEach(function(m) {
        if (Math.hypot(m.x-ddsShip.x,m.y-ddsShip.y) < 24) { mdaReset(); }
      });
    }
    return;
  }
}

// Hook sword swing into MDA
var _origSwingSword = ddsSwingSword;
ddsSwingSword = function() {
  _origSwingSword();
  if (mda.phase === 'sword_window') { mdaSuccess(); }
};

function mdaDraw(W, H) {
  // Draw enemy mechs
  if (mda.mechs.length > 0 && ddsShip) {
    var cx = W/2-ddsShip.x, cy = H/2-ddsShip.y;
    ddsCtx.save(); ddsCtx.translate(cx,cy);
    mda.mechs.forEach(function(m) {
      if (!m.alive) return;
      ddsDrawGundamShip(m.x, m.y, m.angle, null, false);
    });
    // MDA missile smoke + body
    mda.missiles.forEach(function(m) {
      m.smokeTrail && m.smokeTrail.forEach(function(s) {
        ddsCtx.globalAlpha=s.life*0.3; ddsCtx.fillStyle='#FF8800';
        ddsCtx.beginPath(); ddsCtx.arc(s.x,s.y,s.r,0,Math.PI*2); ddsCtx.fill();
      });
      ddsCtx.globalAlpha=1; ddsCtx.fillStyle='#FF4400';
      ddsCtx.shadowColor='#FF4400'; ddsCtx.shadowBlur=10;
      ddsCtx.save(); ddsCtx.translate(m.x,m.y); ddsCtx.rotate(m.angle);
      ddsCtx.beginPath(); ddsCtx.ellipse(0,0,3,8,0,0,Math.PI*2); ddsCtx.fill();
      ddsCtx.restore(); ddsCtx.shadowBlur=0;
    });
    // Shockwave
    if (mda.shockwave && ddsShip) {
      var sw=mda.shockwave, pct=sw.t/sw.maxT;
      ddsCtx.globalAlpha=(1-pct)*0.8;
      ddsCtx.strokeStyle='rgba(255,200,100,0.9)'; ddsCtx.lineWidth=6-pct*4;
      ddsCtx.shadowColor='#FFAA00'; ddsCtx.shadowBlur=30;
      ddsCtx.beginPath(); ddsCtx.arc(ddsShip.x,ddsShip.y,sw.maxR*pct,0,Math.PI*2); ddsCtx.stroke();
      ddsCtx.shadowBlur=0; ddsCtx.globalAlpha=1;
    }
    ddsCtx.restore();
  }
  // Red sword flash on success
  if (mda.swordFlash > 0) {
    ddsCtx.fillStyle='rgba(255,0,0,'+( mda.swordFlash*0.5)+')';
    ddsCtx.fillRect(0,0,W,H);
    // Diagonal slash lines
    ddsCtx.strokeStyle='rgba(255,200,200,'+(mda.swordFlash*0.9)+')';
    ddsCtx.lineWidth=8;
    ddsCtx.shadowColor='#FF0000'; ddsCtx.shadowBlur=20;
    ddsCtx.beginPath(); ddsCtx.moveTo(0,0); ddsCtx.lineTo(W,H); ddsCtx.stroke();
    ddsCtx.beginPath(); ddsCtx.moveTo(W,0); ddsCtx.lineTo(0,H); ddsCtx.stroke();
    ddsCtx.shadowBlur=0;
  }
  // Countdown HUD
  if (mda.phase === 'countdown' && mda.countdownTimer > 0) {
    var ct = Math.ceil(mda.countdownTimer);
    ddsCtx.font='bold 72px Courier New'; ddsCtx.textAlign='center';
    ddsCtx.fillStyle='rgba(255,100,100,0.9)';
    ddsCtx.shadowColor='#FF0000'; ddsCtx.shadowBlur=30;
    ddsCtx.fillText(ct, W/2, H/2-40);
    ddsCtx.font='bold 18px Courier New';
    ddsCtx.fillStyle='rgba(255,200,200,0.8)';
    ddsCtx.fillText('MISSILES INCOMING — PREPARE SWORD', W/2, H/2+20);
    ddsCtx.shadowBlur=0;
  }
  // Sword window prompt
  if (mda.phase === 'sword_window') {
    var pulse = 0.5+Math.sin(Date.now()/80)*0.5;
    ddsCtx.font='bold 36px Courier New'; ddsCtx.textAlign='center';
    ddsCtx.fillStyle='rgba(255,'+(Math.floor(pulse*200))+',0,0.95)';
    ddsCtx.shadowColor='#FF0000'; ddsCtx.shadowBlur=25;
    ddsCtx.fillText('⚔ TAP SWORD! ⚔', W/2, H*0.35);
    // Timer bar
    var barPct = mda.windowTimer/1.2;
    ddsCtx.fillStyle='rgba(0,5,20,0.7)'; ddsCtx.fillRect(W/2-150,H*0.35+16,300,12);
    ddsCtx.fillStyle=barPct>0.5?'#FF4400':'#FF0000';
    ddsCtx.fillRect(W/2-150,H*0.35+16,300*barPct,12);
    ddsCtx.shadowBlur=0;
  }
}

// ── MOBILE RINGS + RIGHT BUTTONS ────────────────────────────────────────────
function ddsDrawMobileRings(W,H) {
  // Left joystick ring
  var _mjx = _ddsJoy.active ? _ddsJoy.startX : 80;
  var _mjy = _ddsJoy.active ? _ddsJoy.startY : H-160;
  ddsCtx.save();
  ddsCtx.beginPath(); ddsCtx.arc(_mjx,_mjy,52,0,Math.PI*2);
  ddsCtx.strokeStyle=_ddsJoy.active?'rgba(255,255,255,0.98)':'rgba(200,220,255,0.85)';
  ddsCtx.lineWidth=2.5; ddsCtx.stroke();
  if (_ddsJoy.active) {
    ddsCtx.beginPath(); ddsCtx.arc(_mjx+_ddsJoy.dx*52,_mjy+_ddsJoy.dy*52,22,0,Math.PI*2);
    ddsCtx.fillStyle='rgba(220,235,255,0.55)'; ddsCtx.fill();
    ddsCtx.strokeStyle='rgba(255,255,255,0.98)'; ddsCtx.lineWidth=2; ddsCtx.stroke();
  }
  ddsCtx.textAlign='center'; ddsCtx.font='bold 9px Courier New';
  ddsCtx.fillStyle='rgba(200,220,255,0.75)';
  ddsCtx.fillText('MOVE',_mjx,_mjy+52+14);
  ddsCtx.restore();

  // Sword button -- canvas circle bottom right
  var sR=44, sX=W-60, sY=H-80;
  var sPulse = (mda.phase==='sword_window') ? (0.5+Math.sin(Date.now()/80)*0.5) : 0;
  ddsCtx.save();
  ddsCtx.beginPath(); ddsCtx.arc(sX,sY,sR,0,Math.PI*2);
  ddsCtx.fillStyle='rgba(0,5,20,0.8)'; ddsCtx.fill();
  ddsCtx.strokeStyle=mda.phase==='sword_window'?('rgba(255,'+(Math.floor(sPulse*200))+',0,0.9)'):'rgba(255,50,50,0.7)';
  ddsCtx.lineWidth=3; ddsCtx.stroke();
  ddsCtx.font='22px Arial'; ddsCtx.textAlign='center'; ddsCtx.fillStyle='#FF4444';
  ddsCtx.fillText('⚔',sX,sY+8);
  ddsCtx.font='bold 8px Courier New'; ddsCtx.fillStyle='rgba(255,100,100,0.8)';
  ddsCtx.fillText('SWORD',sX,sY+sR+12);
  ddsCtx.restore();

  // Laser button -- above sword
  var lR=36, lX=W-60, lY=H-200;
  var lPulse = ddsLaserState.charging ? ddsLaserState.chargeT/1.5 : 0;
  ddsCtx.save();
  ddsCtx.beginPath(); ddsCtx.arc(lX,lY,lR,0,Math.PI*2);
  ddsCtx.fillStyle=ddsLaserState.charging?'rgba(0,50,100,'+(lPulse*0.6)+')':'rgba(0,5,20,0.8)'; ddsCtx.fill();
  ddsCtx.strokeStyle=ddsLaserState.charging?'rgba(100,200,255,0.9)':'rgba(0,150,255,0.6)';
  ddsCtx.lineWidth=3;
  if (ddsLaserState.charging) { ddsCtx.shadowColor='rgba(0,200,255,0.9)'; ddsCtx.shadowBlur=20; }
  ddsCtx.stroke(); ddsCtx.shadowBlur=0;
  ddsCtx.font='18px Arial'; ddsCtx.textAlign='center'; ddsCtx.fillStyle='#00CCFF';
  ddsCtx.fillText(ddsLaserState.charging?'⚡':'🔵',lX,lY+6);
  ddsCtx.font='bold 7px Courier New'; ddsCtx.fillStyle='rgba(0,200,255,0.7)';
  ddsCtx.fillText(ddsLaserState.charging?'CHARGING...':'LASER',lX,lY+lR+11);
  ddsCtx.restore();

  // Weapons toggle -- left of sword
  var wR=28, wX=W-170, wY=H-120;
  ddsCtx.save();
  ddsCtx.beginPath(); ddsCtx.arc(wX,wY,wR,0,Math.PI*2);
  ddsCtx.fillStyle='rgba(0,5,20,0.8)'; ddsCtx.fill();
  ddsCtx.strokeStyle=ddsWeaponsOn?'rgba(100,255,100,0.7)':'rgba(255,80,80,0.6)';
  ddsCtx.lineWidth=2; ddsCtx.stroke();
  ddsCtx.font='11px Arial'; ddsCtx.textAlign='center';
  ddsCtx.fillStyle=ddsWeaponsOn?'#44FF88':'#FF4444';
  ddsCtx.fillText(ddsWeaponsOn?'🔫':'🚫',wX,wY+4);
  ddsCtx.font='bold 7px Courier New'; ddsCtx.fillStyle='rgba(200,220,255,0.6)';
  ddsCtx.fillText(ddsWeaponsOn?'GUNS ON':'GUNS OFF',wX,wY+wR+10);
  ddsCtx.restore();
}

// ── LASER BEAM ────────────────────────────────────────────────────────────────
function ddsChargeLaser() {
  if (ddsLaserState.charging||ddsLaserState.firing) return;
  ddsLaserState.charging=true; ddsLaserState.chargeT=0;
  DDS_NOTIFY('⚡ LASER CHARGING...');
}
function ddsFireLaser() {
  ddsLaserState.charging=false; ddsLaserState.firing=true; ddsLaserState.fireT=0.6;
  if (!ddsShip) return;
  ddsLaserState.beam={x1:ddsShip.x,y1:ddsShip.y,angle:ddsShip.angle};
  // Damage everything in beam path
  Object.values(ddsOtherPlayers).forEach(function(op){
    if (!op || op.zone!==ddsZoneKey(ddsZone)) return;
    var dx=op.x-ddsShip.x, dy=op.y-ddsShip.y;
    var proj=dx*Math.cos(ddsShip.angle)+dy*Math.sin(ddsShip.angle);
    if (proj<0) return;
    var perp=Math.abs(-dx*Math.sin(ddsShip.angle)+dy*Math.cos(ddsShip.angle));
    if (perp<80) DDS_SKT()?.emit('dds:laserHit',{targetId:op.socketId,dmg:ddsShip.swordDmg*3||30000});
  });
  // Planet hitbox -- same ray-cast logic as players
  var _laserDmg = ddsShip.swordDmg*3||30000;
  ddsPlanets.forEach(function(_lpl){
    if (!_lpl||_lpl.zone!==ddsZoneKey(ddsZone)||_lpl.username===window._myUsername) return;
    var _ldx=_lpl.x-ddsShip.x, _ldy=_lpl.y-ddsShip.y;
    var _lproj=_ldx*Math.cos(ddsShip.angle)+_ldy*Math.sin(ddsShip.angle);
    if (_lproj<0) return; // behind ship
    var _lperp=Math.abs(-_ldx*Math.sin(ddsShip.angle)+_ldy*Math.cos(ddsShip.angle));
    var _lpr=60+(_lpl.tier||2)*20+Math.min((_lpl.population||0)/500,40);
    if (_lperp<_lpr+40) {
      DDS_SKT()?.emit('dds:hitPlanet',{planetOwner:_lpl.username,dmg:_laserDmg});
      ddsExplosions.push({x:_lpl.x,y:_lpl.y,r:_lpr*0.8,t:0,maxT:0.5,color:'#00CCFF'});
    }
  });
  ddsExplosions.push({x:ddsShip.x+Math.cos(ddsShip.angle)*400,y:ddsShip.y+Math.sin(ddsShip.angle)*400,r:100,t:0,maxT:0.4,color:'#00CCFF'});
  DDS_NOTIFY('LASER FIRED');
}

// ── JERICHO HELLFIRE BARRAGE ─────────────────────────────────────────────────
function ddsJerichoFire() {
  var targets=ddsScanState.targets.filter(function(t){return t.type==='enemy'&&t.npcRef;});
  if (!targets.length||!ddsShip) return;
  ddsHellfireReady=false;
  document.getElementById('ddsBtnHellfire')?.remove();
  ddsHellfireFlash=1.0;
  ddsScreenShake=20;
  DDS_NOTIFY('🔥 HELLFIRE UNLEASHED — '+targets.length+' TARGET'+(targets.length>1?'S':''));
  targets.forEach(function(tgt,ti){
    for (var i=0;i<3;i++) {
      (function(delay,target){
        setTimeout(function(){
          if (!ddsShip||!target.npcRef) return;
          var spread=(Math.random()-0.5)*0.22;
          var a=Math.atan2(target.npcRef.y-ddsShip.y,target.npcRef.x-ddsShip.x)+spread;
          ddsJerichoMissiles.push({
            x:ddsShip.x+Math.cos(a)*22,y:ddsShip.y+Math.sin(a)*22,
            vx:Math.cos(a)*10,vy:Math.sin(a)*10,
            angle:a,life:400,age:0,smokeTrail:[],
            target:target.npcRef,
            dmg:(ddsShip.turretDmg||5000)*4,
            color:'#FF5500',
          });
          ddsScreenShake=Math.max(ddsScreenShake,5);
        },delay);
      })(ti*200+i*80,tgt);
    }
    DDS_SKT()?.emit('dds:jericho',{targetId:tgt.npcId});
  });
  ddsScanState.targets=[];
}

function ddsShowHellfireBtn(count) {
  document.getElementById('ddsBtnHellfire')?.remove();
  var btn=document.createElement('div');
  btn.id='ddsBtnHellfire';
  btn.style.cssText='position:fixed;bottom:130px;left:50%;transform:translateX(-50%);'
    +'padding:16px 32px;background:rgba(18,0,0,0.94);border:3px solid #FF4400;'
    +'border-radius:14px;color:#FF4400;font-family:Courier New,monospace;font-size:17px;'
    +'font-weight:bold;cursor:pointer;letter-spacing:0.12em;user-select:none;'
    +'box-shadow:0 0 30px #FF440077,0 0 70px #FF220033;z-index:900;text-align:center;';
  btn.innerHTML='🔥 UNLEASH HELLFIRE<br><span style="font-size:10px;opacity:0.7;letter-spacing:0.08em;">'
    +count+' TARGET'+(count>1?'S':'')+' LOCKED</span>';
  btn.addEventListener('click',ddsJerichoFire);
  var _p=0,_pi=setInterval(function(){
    var b=document.getElementById('ddsBtnHellfire');
    if(!b){clearInterval(_pi);return;}
    _p+=0.08;
    b.style.boxShadow='0 0 '+(22+Math.sin(_p)*12)+'px #FF4400,0 0 '+(55+Math.sin(_p)*25)+'px #FF220044';
    b.style.borderColor='hsl('+(8+Math.sin(_p)*6)+',100%,'+(52+Math.sin(_p)*12)+'%)';
  },50);
  setTimeout(function(){document.getElementById('ddsBtnHellfire')?.remove();ddsHellfireReady=false;},22000);
  document.body.appendChild(btn);
}

// ── DRAW LASER BEAM ──────────────────────────────────────────────────────────
// Called in ddsDraw after world translate
function ddsDrawLaser() {
  if (!ddsLaserState.firing || !ddsLaserState.beam || !ddsShip) return;
  var b=ddsLaserState.beam;
  var endX=b.x1+Math.cos(b.angle)*3000, endY=b.y1+Math.sin(b.angle)*3000;
  var pct=ddsLaserState.fireT/0.6;
  ddsCtx.save();
  // Outer glow
  ddsCtx.strokeStyle='rgba(0,150,255,'+(pct*0.3)+')';
  ddsCtx.lineWidth=40; ddsCtx.shadowColor='#00CCFF'; ddsCtx.shadowBlur=40;
  ddsCtx.beginPath(); ddsCtx.moveTo(b.x1,b.y1); ddsCtx.lineTo(endX,endY); ddsCtx.stroke();
  // Core beam
  ddsCtx.strokeStyle='rgba(150,230,255,'+(pct*0.95)+')';
  ddsCtx.lineWidth=6; ddsCtx.shadowBlur=20;
  ddsCtx.beginPath(); ddsCtx.moveTo(b.x1,b.y1); ddsCtx.lineTo(endX,endY); ddsCtx.stroke();
  // White hot center
  ddsCtx.strokeStyle='rgba(255,255,255,'+(pct*0.9)+')';
  ddsCtx.lineWidth=2; ddsCtx.shadowBlur=10;
  ddsCtx.beginPath(); ddsCtx.moveTo(b.x1,b.y1); ddsCtx.lineTo(endX,endY); ddsCtx.stroke();
  ddsCtx.shadowBlur=0; ddsCtx.restore();
}

// ── DESKTOP BUTTONS ──────────────────────────────────────────────────────────
function ddsInitDesktopButtons() {
  document.getElementById('ddsDesktopBtns')?.remove();
  var wrap = document.createElement('div');
  wrap.id = 'ddsDesktopBtns';
  wrap.style.cssText = 'position:fixed;top:50px;right:12px;z-index:821;display:flex;flex-direction:column;gap:8px;';

  function mkBtn(id, label, color, fn) {
    var b = document.createElement('div');
    b.id = id;
    b.style.cssText = 'padding:8px 14px;background:rgba(0,8,22,0.88);border:2px solid '+color
      +';border-radius:10px;color:'+color+';font-family:Courier New,monospace;font-size:11px;'
      +'font-weight:bold;cursor:pointer;letter-spacing:0.08em;user-select:none;'
      +'box-shadow:0 0 10px '+color+'44;text-align:center;min-width:90px;';
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  var btnWarp  = mkBtn('ddsBtnWarp',  '🌀 WARP',     '#00FFFF', function(){ ddsDoWarp(); });
  var btnScan  = mkBtn('ddsBtnScan',  '🔍 SCAN',     '#00FFB8', function(){ ddsActivateScanner(); });
  var btnGuns  = mkBtn('ddsBtnGuns',  '🔫 GUNS ON',  '#44FF88', function(){
    ddsWeaponsOn=!ddsWeaponsOn;
    btnGuns.textContent = ddsWeaponsOn?'🔫 GUNS ON':'🚫 GUNS OFF';
    btnGuns.style.color = ddsWeaponsOn?'#44FF88':'#FF4444';
    btnGuns.style.borderColor = ddsWeaponsOn?'#44FF88':'#FF4444';
  });

  wrap.appendChild(btnWarp);
  wrap.appendChild(btnScan);
  wrap.appendChild(btnGuns);
  if (window.innerWidth >= 900) document.body.appendChild(wrap);
}

// ── DOCK AT SANCTUM ──────────────────────────────────────────────────────────
function ddsDockAtSanctum() {
  if (!ddsActive || _ddsDocking) return;
  _ddsDocking = true;
  DDS_NOTIFY('Docking... transferring Dark Matter to Sanctum.');
  // Send gundam's held DM to server for transfer
  DDS_SKT()?.emit('dds:dock', { gundamDM: Math.floor(ddsDarkMatter) });
  ddsDarkMatter = 0; // clear gundam balance
  ddsUpdateDMHUD();
  // ddsOnDockConfirm will handle teardown after server confirms
  // Timeout fallback
  setTimeout(function(){
    if (!_ddsDocking) return;
    _ddsDocking = false;
    DDS_NOTIFY('Dock timeout — try again.');
  }, 5000);
}

// ── DRAW NPCS ────────────────────────────────────────────────────────────────
// Called INSIDE the world-space translate (ddsCtx already translated)
function ddsDrawNPCs() {
  if (!ddsShip) return;
  Object.values(ddsNpcEntities).forEach(function(n){
    if (n.zone!==ddsZoneKey(ddsZone)) return;
    // Draw ship -- use faction colors
    var design = n.shipDesign || null;
    if (n.hitFlash > 0) n.hitFlash = Math.max(0, n.hitFlash - 0.05);
    if (n.hitFlash > 0) { ddsCtx.globalAlpha = 0.5 + n.hitFlash; }
    ddsDrawGundamShip(n.x, n.y, n.angle||0, design, false);
    ddsCtx.globalAlpha = 1;
    // Faction color nametag
    var fc = n.factionId==='raiders'?'#FF4444':'#00FF88';
    ddsCtx.font='9px Courier New'; ddsCtx.textAlign='center';
    ddsCtx.fillStyle=fc;
    ddsCtx.fillText((n.factionId==='raiders'?'⚙ ':'👽 ')+n.id.split('_')[1], n.x, n.y-34);
    // Shield bar
    if (n.maxShield>0) {
      var sp=n.shield/n.maxShield;
      ddsCtx.fillStyle='rgba(0,5,20,0.7)'; ddsCtx.fillRect(n.x-22,n.y-30,44,5);
      ddsCtx.fillStyle=sp>0.5?fc:'#FF4444'; ddsCtx.fillRect(n.x-22,n.y-30,44*sp,5);
    }
    // Escorting indicator
    if (n.escorting) {
      ddsCtx.globalAlpha=0.7; ddsCtx.fillStyle='#FFD700';
      ddsCtx.font='bold 11px Arial'; ddsCtx.textAlign='center';
      ddsCtx.fillText('◈', n.x, n.y-44);
      ddsCtx.globalAlpha=1;
    }
  });
  // Loot crates
  ddsLootCrates.forEach(function(lc){
    if (lc.zone!==ddsZoneKey(ddsZone)) return;
    var pulse=0.5+Math.sin(lc.t*3)*0.5;
    ddsCtx.save();
    ddsCtx.shadowColor='#00FFCC'; ddsCtx.shadowBlur=10+pulse*8;
    ddsCtx.strokeStyle='rgba(0,255,200,'+(0.6+pulse*0.4)+')';
    ddsCtx.lineWidth=2; ddsCtx.strokeRect(lc.x-12,lc.y-12,24,24);
    ddsCtx.fillStyle='rgba(0,255,200,0.15)'; ddsCtx.fillRect(lc.x-12,lc.y-12,24,24);
    ddsCtx.font='bold 8px Courier New'; ddsCtx.textAlign='center';
    ddsCtx.fillStyle='rgba(0,255,200,0.9)';
    ddsCtx.fillText(Math.round(lc.darkMatter/1000)+'K DM', lc.x, lc.y+22);
    ddsCtx.shadowBlur=0; ddsCtx.restore();
  });
  // WoL Fountain
  if (ddsWolFountain && ddsWolFountain.zone===ddsZoneKey(ddsZone)) {
    var _ft=ddsWolFountain.t||0, _fx=ddsWolFountain.x, _fy=ddsWolFountain.y;
    var _fpulse=0.5+Math.sin(_ft*2)*0.5;
    var _factive=ddsWolFountain.active;
    var _fcol=_factive?'#00FFFF':'#0088FF';
    ddsCtx.save();
    ddsCtx.beginPath(); ddsCtx.arc(_fx,_fy,60+_fpulse*20,0,Math.PI*2);
    ddsCtx.strokeStyle=_factive?'rgba(0,255,255,'+(_fpulse*0.8)+')':'rgba(0,136,255,'+(_fpulse*0.6)+')';
    ddsCtx.lineWidth=2; ddsCtx.stroke();
    ddsCtx.beginPath(); ddsCtx.arc(_fx,_fy,30,0,Math.PI*2);
    ddsCtx.fillStyle=_factive?'rgba(0,255,255,0.2)':'rgba(0,136,255,0.12)'; ddsCtx.fill();
    ddsCtx.strokeStyle=_fcol; ddsCtx.lineWidth=3; ddsCtx.stroke();
    ddsCtx.beginPath(); ddsCtx.arc(_fx,_fy,10,0,Math.PI*2);
    ddsCtx.fillStyle=_fcol; ddsCtx.fill();
    ddsCtx.font='bold 11px Courier New'; ddsCtx.textAlign='center'; ddsCtx.fillStyle=_fcol;
    ddsCtx.fillText(_factive?'💧 ACTIVE — '+Math.ceil(ddsWolFountain.timer||0)+'s':'💧 FOUNTAIN OF LIFE', _fx, _fy-78);
    if (!_factive && ddsShip && Math.hypot(ddsShip.x-_fx,ddsShip.y-_fy)<200) {
      ddsCtx.font='bold 10px Courier New'; ddsCtx.fillStyle='rgba(0,220,255,0.9)';
      ddsCtx.fillText('[E] ACTIVATE', _fx, _fy-62);
    }
    if (_factive) { ddsCtx.font='9px Courier New'; ddsCtx.fillStyle='rgba(0,255,200,0.7)'; ddsCtx.fillText('+WoL', _fx, _fy+52); }
    ddsCtx.shadowBlur=0; ddsCtx.restore();
  }
  // ── PLANETS ──────────────────────────────────────────────────────────────
  ddsPlanets.forEach(function(pl){
    if (!pl || pl.zone!==ddsZoneKey(ddsZone)) return;
    ddsDrawPlanet(pl);
  });
  // KotH hotspots -- multi-zone circles (no shadowBlur for perf)
  var _t=Date.now()*0.001;
  var _kpulse=0.4+Math.sin(_t*1.5)*0.3;
  ddsKothHotspots.forEach(function(hs){
    var wx=hs.x+(hs.e-ddsZone.e)*DDS_WORLD;
    var wy=hs.y+(ddsZone.n-hs.n)*DDS_WORLD;
    var rC=hs.rCont||4500, rW=hs.rWar||2800, rE=hs.rEpic||1200;
    if (wx<-rC||wx>DDS_WORLD+rC||wy<-rC||wy>DDS_WORLD+rC) return;
    ddsCtx.save();
    // Contested -- dashed outer ring
    ddsCtx.setLineDash([18,12]);
    ddsCtx.beginPath(); ddsCtx.arc(wx,wy,rC,0,Math.PI*2);
    ddsCtx.strokeStyle=hs.mega?'rgba(255,0,255,'+(_kpulse*0.6)+')':'rgba(255,140,0,'+(_kpulse*0.5)+')';
    ddsCtx.lineWidth=1.5; ddsCtx.globalAlpha=1; ddsCtx.stroke();
    ddsCtx.setLineDash([]);
    // Warzone -- solid mid ring
    ddsCtx.beginPath(); ddsCtx.arc(wx,wy,rW,0,Math.PI*2);
    ddsCtx.strokeStyle=hs.mega?'rgba(255,80,255,'+(_kpulse*0.8)+')':'rgba(255,180,0,'+(_kpulse*0.75)+')';
    ddsCtx.lineWidth=2; ddsCtx.stroke();
    // Epicenter -- bright inner ring
    ddsCtx.beginPath(); ddsCtx.arc(wx,wy,rE,0,Math.PI*2);
    ddsCtx.strokeStyle=hs.mega?'rgba(255,150,255,'+_kpulse+')':'rgba(255,240,80,'+_kpulse+')';
    ddsCtx.lineWidth=3; ddsCtx.stroke();
    // Center dot
    ddsCtx.beginPath(); ddsCtx.arc(wx,wy,8,0,Math.PI*2);
    ddsCtx.fillStyle=hs.mega?'#FF88FF':'#FFDD44'; ddsCtx.fill();
    // Label
    ddsCtx.font='bold 12px Courier New'; ddsCtx.textAlign='center';
    ddsCtx.fillStyle=hs.mega?'#FF88FF':'#FFDD44';
    ddsCtx.fillText(hs.mega?'MEGA':'HOTSPOT', wx, wy-rE-12);
    ddsCtx.restore();
  });
  // Sanctum beacon
  if (ddsSanctumBeacon) {
    var sb=ddsSanctumBeacon;
    var t=Date.now()/1000;
    ddsCtx.save();
    ddsCtx.strokeStyle=sb.color; ddsCtx.lineWidth=3;
    ddsCtx.shadowColor=sb.color; ddsCtx.shadowBlur=20;
    ddsCtx.globalAlpha=0.7+Math.sin(t*2)*0.2;
    ddsCtx.beginPath(); ddsCtx.arc(sb.x,sb.y,sb.r,0,Math.PI*2); ddsCtx.stroke();
    // Inner fill
    var sg=ddsCtx.createRadialGradient(sb.x,sb.y,0,sb.x,sb.y,sb.r);
    sg.addColorStop(0,'rgba(150,50,255,0.4)'); sg.addColorStop(1,'rgba(100,0,200,0.05)');
    ddsCtx.fillStyle=sg; ddsCtx.beginPath(); ddsCtx.arc(sb.x,sb.y,sb.r,0,Math.PI*2); ddsCtx.fill();
    ddsCtx.globalAlpha=1; ddsCtx.shadowBlur=0;
    ddsCtx.font='bold 11px Courier New'; ddsCtx.textAlign='center'; ddsCtx.fillStyle=sb.accentColor;
    ddsCtx.fillText(sb.name, sb.x, sb.y+sb.r+18);
    if (ddsDockPrompt) {
      ddsCtx.font='bold 13px Courier New'; ddsCtx.fillStyle='rgba(200,150,255,0.9)';
      ddsCtx.fillText('[E] DOCK — Transfer DM to Sanctum', sb.x, sb.y+sb.r+36);
    }
    ddsCtx.restore();
  }
  // Damage float numbers
  ddsDamageNumbers.forEach(function(dn){
    var alpha=1-(dn.t/dn.maxT);
    ddsCtx.globalAlpha=alpha;
    ddsCtx.font=(dn.crit?'bold 18px':'bold 13px')+' Courier New';
    ddsCtx.textAlign='center'; ddsCtx.fillStyle=dn.color;
    ddsCtx.shadowColor=dn.color; ddsCtx.shadowBlur=dn.crit?12:6;
    var fmtDmg=dn.val>=1000000?(dn.val/1000000).toFixed(1)+'M':dn.val>=1000?(dn.val/1000).toFixed(0)+'K':String(dn.val);
    ddsCtx.fillText((dn.crit?'★ ':'')+fmtDmg, dn.x, dn.y);
    ddsCtx.shadowBlur=0; ddsCtx.globalAlpha=1;
  });
}

// ── SCANNER HUD ──────────────────────────────────────────────────────────────
function ddsDrawScannerHUD(W, H) {
  var t = Date.now()*0.001;
  if (ddsScanState.active) {
    var prog = ddsScanState.timer/ddsScanState.duration;
    var ringR = prog*Math.min(W,H)*0.48;
    ddsCtx.beginPath(); ddsCtx.arc(W/2,H/2,ringR,0,Math.PI*2);
    ddsCtx.strokeStyle='rgba(0,255,180,'+(1-prog)*0.5+')'; ddsCtx.lineWidth=2; ddsCtx.stroke();
    if (ringR>40) {
      ddsCtx.beginPath(); ddsCtx.arc(W/2,H/2,ringR*0.6,0,Math.PI*2);
      ddsCtx.strokeStyle='rgba(0,200,255,'+(1-prog)*0.3+')'; ddsCtx.lineWidth=1; ddsCtx.stroke();
    }
    ddsCtx.fillStyle='rgba(0,255,180,'+(0.6+Math.sin(t*8)*0.3)+')';
    ddsCtx.font='bold 11px Courier New'; ddsCtx.textAlign='center';
    ddsCtx.fillText('SCANNING...', W/2, 80); ddsCtx.textAlign='left';
  }
  // Draw target markers
  if (!ddsShip) return;
  ddsScanState.targets.forEach(function(tgt) {
    if (!ddsScanState.active) {
      tgt.fadeTimer=Math.max(0,(tgt.fadeTimer||0)-0.016);
      if ((tgt.fadeTimer||0)<=0) return;
    }
    var alpha=ddsScanState.active?1:Math.min(1,(tgt.fadeTimer||0)/5);
    if (alpha<=0) return;
    var col=tgt.type==='enemy'?[255,60,60]:tgt.type==='player'?[255,150,0]:tgt.type==='loot'?[255,200,50]:[0,200,255];
    var sx=W/2+(tgt.x-ddsShip.x), sy=H/2+(tgt.y-ddsShip.y);
    var onScreen=sx>20&&sx<W-20&&sy>20&&sy<H-20;
    if (onScreen) {
      if (tgt.type==='enemy'||tgt.type==='player') {
        // Iron Man rotating corner-bracket reticle
        var rS=24,cL=9,rot=(Date.now()*0.0018)%(Math.PI*2);
        ddsCtx.save(); ddsCtx.translate(sx,sy); ddsCtx.rotate(rot);
        ddsCtx.strokeStyle='rgba('+col[0]+','+col[1]+','+col[2]+','+alpha+')';
        ddsCtx.lineWidth=2; ddsCtx.shadowColor='rgba('+col[0]+','+col[1]+','+col[2]+',1)'; ddsCtx.shadowBlur=10;
        [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(function(c){
          ddsCtx.beginPath();
          ddsCtx.moveTo(c[0]*rS,c[1]*(rS-cL)); ddsCtx.lineTo(c[0]*rS,c[1]*rS); ddsCtx.lineTo(c[0]*(rS-cL),c[1]*rS);
          ddsCtx.stroke();
        });
        ddsCtx.lineWidth=1; ddsCtx.globalAlpha=alpha*0.45;
        ddsCtx.beginPath(); ddsCtx.moveTo(-9,0); ddsCtx.lineTo(9,0); ddsCtx.stroke();
        ddsCtx.beginPath(); ddsCtx.moveTo(0,-9); ddsCtx.lineTo(0,9); ddsCtx.stroke();
        ddsCtx.shadowBlur=0; ddsCtx.restore();
      }
      ddsCtx.fillStyle='rgba('+col[0]+','+col[1]+','+col[2]+','+alpha+')';
      ddsCtx.font='bold 9px Courier New'; ddsCtx.textAlign='center';
      ddsCtx.fillText(tgt.label,sx,sy-32);
      if (tgt.hp!==undefined) ddsCtx.fillText('HP:'+tgt.hp+'% '+tgt.dist+'u',sx,sy-22);
      else ddsCtx.fillText(tgt.dist+'u',sx,sy-22);
      if (tgt.sublabel) { ddsCtx.font='8px Courier New'; ddsCtx.fillText(tgt.sublabel,sx,sy-13); }
    } else {
      var angle=Math.atan2(tgt.y-ddsShip.y,tgt.x-ddsShip.x);
      var margin=38;
      var ax=Math.max(margin,Math.min(W-margin,W/2+Math.cos(angle)*(Math.min(W,H)/2-margin)));
      var ay=Math.max(margin,Math.min(H-margin,H/2+Math.sin(angle)*(Math.min(W,H)/2-margin)));
      ddsCtx.save(); ddsCtx.translate(ax,ay); ddsCtx.rotate(angle);
      ddsCtx.fillStyle='rgba('+col[0]+','+col[1]+','+col[2]+','+alpha+')';
      ddsCtx.beginPath(); ddsCtx.moveTo(14,0); ddsCtx.lineTo(-8,-7); ddsCtx.lineTo(-8,7);
      ddsCtx.closePath(); ddsCtx.fill(); ddsCtx.restore();
      ddsCtx.fillStyle='rgba('+col[0]+','+col[1]+','+col[2]+','+alpha*0.8+')';
      ddsCtx.font='bold 8px Courier New'; ddsCtx.textAlign='center';
      ddsCtx.fillText(tgt.dist+'u',ax,ay+16); ddsCtx.fillText(tgt.label,ax,ay+25);
    }
    ddsCtx.textAlign='left';
  });
}

// ── ZONE BOUNDARIES ──────────────────────────────────────────────────────────
function ddsDrawZoneBoundaries() {
  var edges = [
    {dir:'north',x1:0,y1:DDS_EDGE,x2:DDS_WORLD,y2:DDS_EDGE,adj:{n:ddsZone.n+1,e:ddsZone.e}},
    {dir:'south',x1:0,y1:DDS_WORLD-DDS_EDGE,x2:DDS_WORLD,y2:DDS_WORLD-DDS_EDGE,adj:{n:ddsZone.n-1,e:ddsZone.e}},
    {dir:'east', x1:DDS_WORLD-DDS_EDGE,y1:0,x2:DDS_WORLD-DDS_EDGE,y2:DDS_WORLD,adj:{n:ddsZone.n,e:ddsZone.e+1}},
    {dir:'west', x1:DDS_EDGE,y1:0,x2:DDS_EDGE,y2:DDS_WORLD,adj:{n:ddsZone.n,e:ddsZone.e-1}},
  ];
  edges.forEach(function(e) {
    var adj = e.adj;
    if (adj.n<1||adj.n>DDS_ROWS||adj.e<1||adj.e>DDS_COLS) return;
    var accessible = true; // all zones accessible in DDS
    var danger = Math.floor(((adj.n-1)*DDS_COLS+(adj.e-1))/(DDS_ROWS*DDS_COLS)*5)+1;
    var dc = ['#44FF88','#FFFF44','#FFAA00','#FF6600','#FF2200'][Math.min(4,danger-1)];
    ddsCtx.save();
    ddsCtx.strokeStyle = dc+'88';
    ddsCtx.lineWidth=2; ddsCtx.setLineDash([16,10]);
    ddsCtx.beginPath(); ddsCtx.moveTo(e.x1,e.y1); ddsCtx.lineTo(e.x2,e.y2); ddsCtx.stroke();
    ddsCtx.setLineDash([]);
    var mx=(e.x1+e.x2)/2, my=(e.y1+e.y2)/2;
    ddsCtx.fillStyle=dc+'AA'; ddsCtx.font='bold 10px Courier New'; ddsCtx.textAlign='center';
    ddsCtx.fillText(ddsZoneKey(adj), mx, my-8);
    ddsCtx.restore();
  });
}

// ── DRAW HUD ──────────────────────────────────────────────────────────────────
function ddsDrawHUD(W, H) {
  var _mob = window.innerWidth <= 900;
  var _fs = _mob ? 1.5 : 1.0; // font scale
  // Zone label
  ddsCtx.font='bold '+Math.round(13*_fs)+'px Courier New'; ddsCtx.textAlign='center';
  ddsCtx.fillStyle='rgba(0,200,255,0.7)';
  ddsCtx.fillText('DIMENSIONAL BATTLEFIELD — Zone '+ddsZoneKey(ddsZone), W/2, 22*_fs);

  // Shield bar -- top left with mech icon
  if (ddsShip) {
    var pct = ddsShip.shield/ddsShip.maxShield;
    var shColor = pct>0.5?'#00CCFF':pct>0.25?'#FFAA00':'#FF4444';
    var pw=_mob?280:220, ph=_mob?56:42, px=8, py=_mob?44:38;
    var bx=_mob?52:42, bw=_mob?220:178;
    // Background panel
    ddsCtx.fillStyle='rgba(0,5,18,0.85)';
    ddsCtx.fillRect(px, py, pw, ph);
    ddsCtx.strokeStyle='rgba(0,150,200,0.3)'; ddsCtx.lineWidth=1;
    ddsCtx.strokeRect(px, py, pw, ph);
    // Mech icon
    ddsCtx.font=(_mob?'28px':'22px')+' Arial'; ddsCtx.textAlign='left';
    ddsCtx.fillStyle=shColor;
    ddsCtx.fillText('⚙', 14, py+ph-8);
    // Player name
    ddsCtx.font='bold '+(_mob?'13':'9')+'px Courier New'; ddsCtx.fillStyle='rgba(150,200,255,0.8)';
    ddsCtx.fillText((window._myUsername||'PILOT').toUpperCase(), bx, py+14);
    // Shield bar
    ddsCtx.fillStyle='rgba(0,20,40,0.9)';
    ddsCtx.fillRect(bx, py+18, bw, _mob?14:10);
    ddsCtx.fillStyle=shColor;
    ddsCtx.shadowColor=shColor; ddsCtx.shadowBlur=6;
    ddsCtx.fillRect(bx, py+18, bw*pct, _mob?14:10);
    ddsCtx.shadowBlur=0;
    ddsCtx.strokeStyle='rgba(0,100,160,0.4)'; ddsCtx.lineWidth=1;
    ddsCtx.strokeRect(bx, py+18, bw, _mob?14:10);
    // Shield value
    ddsCtx.font=(_mob?'12':'8')+'px Courier New'; ddsCtx.fillStyle='rgba(150,220,255,0.7)';
    ddsCtx.fillText(Math.round(ddsShip.shield).toLocaleString()+' / '+Math.round(ddsShip.maxShield).toLocaleString(), bx, py+ph-6);
  }

  // ── HOTSPOT PANEL -- below shield bar ────────────────────────────────────
  if (ddsKothHotspots.length > 0) {
    var _hpH = 14 + ddsKothHotspots.length * 14;
    var _hpY = 82;
    // Background
    ddsCtx.fillStyle='rgba(0,5,18,0.85)';
    ddsCtx.fillRect(8, _hpY, 220, _hpH);
    ddsCtx.strokeStyle='rgba(255,180,0,0.25)'; ddsCtx.lineWidth=1;
    ddsCtx.strokeRect(8, _hpY, 220, _hpH);
    // Header
    ddsCtx.font='bold 8px Courier New'; ddsCtx.textAlign='left';
    ddsCtx.fillStyle='rgba(255,200,50,0.7)';
    ddsCtx.fillText('◈ ACTIVE HOTSPOTS', 14, _hpY+10);
    // Each hotspot
    ddsKothHotspots.forEach(function(hs,i){
      var zk='s-'+((hs.n-1)*10+hs.e);
      // Determine if player is inside any ring
      var _inRing='';
      if (ddsShip) {
        var _wx=hs.x+(hs.e-ddsZone.e)*DDS_WORLD;
        var _wy=hs.y+(ddsZone.n-hs.n)*DDS_WORLD;
        var _dist=Math.hypot(ddsShip.x-_wx,ddsShip.y-_wy);
        var rE=hs.rEpic||1200,rW=hs.rWar||2800,rC=hs.rCont||4500;
        if (_dist<=rE) _inRing='EPIC';
        else if (_dist<=rW) _inRing='WAR';
        else if (_dist<=rC) _inRing='CONT';
      }
      var _col=hs.mega?'rgba(255,120,255,0.95)':_inRing==='EPIC'?'rgba(255,240,80,1)':_inRing==='WAR'?'rgba(255,160,0,0.9)':_inRing==='CONT'?'rgba(255,100,0,0.8)':'rgba(180,160,80,0.6)';
      var _rowY=_hpY+10+14*(i+1);
      // Active ring indicator
      if (_inRing) {
        ddsCtx.fillStyle='rgba(255,200,0,0.12)';
        ddsCtx.fillRect(10,_rowY-10,216,12);
      }
      ddsCtx.font='bold 8px Courier New'; ddsCtx.fillStyle=_col;
      var _label=(hs.mega?'★ MEGA':'  ◈   ')+'  ['+zk+']';
      ddsCtx.fillText(_label, 14, _rowY);
      // Ring label right aligned
      if (_inRing) {
        ddsCtx.textAlign='right';
        ddsCtx.fillStyle='rgba(255,240,100,0.9)';
        ddsCtx.fillText('▶ '+_inRing, 224, _rowY);
        ddsCtx.textAlign='left';
      }
    });
  }
  // Dock prompt
  if (ddsDockPrompt) {
    ddsCtx.font='bold 14px Courier New'; ddsCtx.textAlign='center';
    ddsCtx.fillStyle='rgba(200,150,255,0.95)';
    ddsCtx.shadowColor='#AA44FF'; ddsCtx.shadowBlur=15;
    ddsCtx.fillText('[E] DOCK — Return to Sanctum', W/2, H*0.42);
    ddsCtx.shadowBlur=0;
  }
  // Warp cooldown
  if (ddsWarpCooldown > 0) {
    ddsCtx.font='10px Courier New'; ddsCtx.textAlign='left';
    ddsCtx.fillStyle='rgba(0,200,255,0.5)';
    ddsCtx.fillText('WARP: '+(ddsWarpCooldown/60).toFixed(1)+'s', 12, H-60);
  }

  // Auto-target indicator
  if (ddsAutoTarget) {
    ddsCtx.font='10px Courier New'; ddsCtx.textAlign='left';
    ddsCtx.fillStyle='rgba(255,80,80,0.8)';
    var _atLabel = ddsAutoTarget.isNpc ? 
      (ddsAutoTarget.factionId==='raiders'?'⚙ RAIDER':'👽 ALIEN') : ddsAutoTarget.username;
    ddsCtx.fillText('🎯 AUTO: '+_atLabel, 12, H-44);
  }

  // Return button
  ddsCtx.fillStyle='rgba(0,5,20,0.8)';
  ddsCtx.fillRect(8, 8, 90, 28);
  ddsCtx.strokeStyle='rgba(150,0,255,0.5)'; ddsCtx.lineWidth=1;
  ddsCtx.strokeRect(8, 8, 90, 28);
  ddsCtx.font='10px Courier New'; ddsCtx.textAlign='center';
  ddsCtx.fillStyle='rgba(180,100,255,0.8)';
  ddsCtx.fillText('⬅ RETURN', 53, 27);
}

// ── WARP ──────────────────────────────────────────────────────────────────────
function ddsDoWarp() {
  if (!ddsShip || ddsWarpCooldown > 0) return;
  var dist = Math.min(ddsCanvas.width, ddsCanvas.height) * 0.45 * (ddsShip.warpMult||1.5);
  var nx = ddsShip.x + Math.cos(ddsShip.angle)*dist;
  var ny = ddsShip.y + Math.sin(ddsShip.angle)*dist;
  // Check zone edge
  var crossN = ny < DDS_EDGE ? 'north' : ny > DDS_WORLD-DDS_EDGE ? 'south' : null;
  var crossE = nx > DDS_WORLD-DDS_EDGE ? 'east' : nx < DDS_EDGE ? 'west' : null;
  if (crossN || crossE) { ddsAttemptZoneTransition(crossN||crossE); return; }
  ddsShip.x = Math.max(DDS_EDGE, Math.min(DDS_WORLD-DDS_EDGE, nx));
  ddsShip.y = Math.max(DDS_EDGE, Math.min(DDS_WORLD-DDS_EDGE, ny));
  ddsShip.vx *= 0.1; ddsShip.vy *= 0.1;
  ddsShip.warpFlash = 1.0;
  ddsWarpCooldown = 300;
  ddsExplosions.push({x:ddsShip.x,y:ddsShip.y,r:60,t:0,maxT:0.4,color:'rgba(0,200,255,0.8)'});
  DDS_SKT()?.emit('dds:move', { x:Math.round(ddsShip.x), y:Math.round(ddsShip.y), angle:ddsShip.angle, zone:ddsZoneKey(ddsZone) });
}

// ── SWORD SWING ───────────────────────────────────────────────────────────────
function ddsSwingSword() {
  if (!ddsShip || ddsSwordSwing) return; // one swing at a time
  var sweepRadius = 120;
  // Get sword radius from equipped sword part
  if (ddsGundamData && ddsGundamData.slots && ddsGundamData.slots.sword) {
    sweepRadius = (ddsGundamData.slots.sword.stats && ddsGundamData.slots.sword.stats.sweepRadius) || sweepRadius;
  }
  ddsSwordSwing = {
    startAngle: ddsShip.angle - Math.PI/2,
    sweepAngle: Math.PI * 1.5, // 270 degree sweep
    radius: sweepRadius,
    t: 0, maxT: 0.45,
  };
  // Emit sword swing to server
  DDS_SKT()?.emit('dds:sword', {
    x: ddsShip.x, y: ddsShip.y,
    angle: ddsShip.angle,
    radius: sweepRadius,
    dmg: ddsShip.swordDmg || 10000,
  });
  DDS_SKT()?.emit('dds:swordHit', {
    x: ddsShip.x, y: ddsShip.y,
    radius: sweepRadius,
    dmg: ddsShip.swordDmg || 10000,
  });
  // Explosion effect at tip
  ddsExplosions.push({x:ddsShip.x,y:ddsShip.y,r:sweepRadius,t:0,maxT:0.4,color:(ddsDesign&&ddsDesign.colVisor)||'#FF2200'});
}

// ── SCANNER ───────────────────────────────────────────────────────────────────
function ddsActivateScanner() {
  if (ddsScanState.active) return;
  ddsScanState.active = true;
  ddsScanState.timer = 0;
  ddsScanState.targets = [];
  ddsScanActive = true;
  ddsScanTimer = 8;
  DDS_SKT()?.emit('dds:scan', { zone: ddsZoneKey(ddsZone) });
  if (!ddsShip) return;
  var scanR = 1800;
  // Scan NPCs
  Object.values(ddsNpcEntities).forEach(function(n){
    if (n.zone!==ddsZoneKey(ddsZone)) return;
    var d=Math.hypot(n.x-ddsShip.x,n.y-ddsShip.y);
    if (n.factionId==='planet_'+window._myUsername) return; // skip own guards in scan
    if (d<scanR) ddsScanState.targets.push({x:n.x,y:n.y,type:'enemy',npcRef:n,npcId:n.id,
      label:(n.factionId==='raiders'?'RAIDER':(n.factionId.startsWith('planet_')?'GUARD':'ALIEN')),dist:Math.round(d),hp:Math.round(n.shield/Math.max(1,n.maxShield)*100)});
  });
  // Scan other players
  Object.values(ddsOtherPlayers).forEach(function(op){
    if (op.zone!==ddsZoneKey(ddsZone)) return;
    var d=Math.hypot(op.x-ddsShip.x,op.y-ddsShip.y);
    if (d<scanR) ddsScanState.targets.push({x:op.x,y:op.y,type:'player',label:op.username,dist:Math.round(d)});
  });
  // Scan loot crates
  ddsLootCrates.forEach(function(lc){
    if (lc.zone!==ddsZoneKey(ddsZone)) return;
    var d=Math.hypot(lc.x-ddsShip.x,lc.y-ddsShip.y);
    if (d<scanR) ddsScanState.targets.push({x:lc.x,y:lc.y,type:'loot',label:Math.round(lc.darkMatter/1000)+'K DM',dist:Math.round(d)});
  });
  // Scan planets
  ddsPlanets.forEach(function(pl){
    if (!pl||pl.zone!==ddsZoneKey(ddsZone)) return;
    var pd=Math.hypot(pl.x-ddsShip.x,pl.y-ddsShip.y);
    var pShPct=pl.maxShieldHP>0?Math.round((pl.shieldHP||0)/pl.maxShieldHP*100):100;
    var pWol=pl.reservoirWoL>0?(' | '+Math.round(pl.reservoirWoL/1000)+'K WoL'):'';
    if (pl.username===window._myUsername) {
      ddsScanState.targets.push({ x:pl.x, y:pl.y, type:'station',
        label:'[YOUR PLANET] '+pl.name, hp:pShPct, dist:Math.round(pd),
        sublabel:'T'+pl.tier+pWol });
    } else {
      ddsScanState.targets.push({ x:pl.x, y:pl.y, type:'enemy',
        label:'[PLANET] '+pl.name, hp:pShPct, dist:Math.round(pd),
        sublabel:'T'+pl.tier+pWol, isPlanet:true });
    }
  });
  // WoL Fountain
  if (ddsWolFountain && ddsWolFountain.zone===ddsZoneKey(ddsZone)) {
    var fd=Math.hypot(ddsWolFountain.x-ddsShip.x,ddsWolFountain.y-ddsShip.y);
    ddsScanState.targets.push({x:ddsWolFountain.x,y:ddsWolFountain.y,type:'station',label:(ddsWolFountain.active?'💧 FOUNTAIN ACTIVE':'💧 FOUNTAIN'),dist:Math.round(fd)});
  }
  // Sanctum beacon
  if (ddsSanctumBeacon) {
    var bd=Math.hypot(ddsSanctumBeacon.x-ddsShip.x,ddsSanctumBeacon.y-ddsShip.y);
    ddsScanState.targets.push({x:ddsSanctumBeacon.x,y:ddsSanctumBeacon.y,type:'station',label:'THE SANCTUM',dist:Math.round(bd)});
  }
  // Lock nearest hostile for jericho
  var nearest=null, nearD=scanR;
  ddsScanState.targets.filter(function(t){return t.type==='enemy'||t.type==='player';}).forEach(function(t){
    if (t.dist<nearD){nearD=t.dist;nearest=t;}
  });
  var _ef=ddsScanState.targets.filter(function(t){return t.type==='enemy'&&t.npcRef;});
  DDS_NOTIFY('SCAN: '+ddsScanState.targets.length+' contact'+(ddsScanState.targets.length!==1?'s':'')+' detected.');
  if (_ef.length>0) {
    DDS_NOTIFY('🎯 '+_ef.length+' HOSTILE'+(_ef.length>1?'S':'')+' LOCKED — TAP HELLFIRE');
    ddsHellfireReady=true;
    ddsShowHellfireBtn(_ef.length);
  }
  setTimeout(function(){
    ddsScanActive=false; ddsScanTimer=0;
    ddsScanState.targets.forEach(function(t){t.fadeTimer=20;});
  }, 5000);
}

// ── ZONE TRANSITION ───────────────────────────────────────────────────────────
function ddsAttemptZoneTransition(dir) {
  if (ddsZoneTransitioning) return;
  var nz = { n:ddsZone.n, e:ddsZone.e };
  if (dir==='north') nz.n++;
  if (dir==='south') nz.n--;
  if (dir==='east')  nz.e++;
  if (dir==='west')  nz.e--;
  // Bounds: 5 rows, 10 cols
  if (nz.n < 1 || nz.n > DDS_ROWS || nz.e < 1 || nz.e > DDS_COLS) {
    if (!ddsShip._edgeCooldown || ddsShip._edgeCooldown <= 0) {
      DDS_NOTIFY('Edge of Dimensional Battlefield.');
      ddsShip._edgeCooldown = 3.0;
    }
    return;
  }
  ddsZoneTransitioning = true;
  var oppositeEdge = {north:'south',south:'north',east:'west',west:'east'}[dir];
  ddsZone = nz;
  // Reposition ship at opposite edge
  if (dir==='north') { ddsShip.y = DDS_WORLD-DDS_EDGE*2; }
  else if (dir==='south') { ddsShip.y = DDS_EDGE*2; }
  else if (dir==='east')  { ddsShip.x = DDS_EDGE*2; }
  else if (dir==='west')  { ddsShip.x = DDS_WORLD-DDS_EDGE*2; }
  ddsShip.vx=0; ddsShip.vy=0;
  ddsShip.trail=[];
  ddsBullets=[]; ddsMissiles=[]; ddsEnemyBullets=[];
  ddsGenerateStars(ddsZone.n*10+ddsZone.e);
  DDS_SKT()?.emit('dds:changeZone', { zone: ddsZoneKey(ddsZone), x:Math.round(ddsShip.x), y:Math.round(ddsShip.y) });
  DDS_NOTIFY('Zone '+ddsZoneKey(ddsZone));
  ddsSanctumBeacon = (ddsZoneKey(ddsZone)==='s-1') ? {
    x:DDS_WORLD/2+600, y:DDS_WORLD/2-200, r:55, promptRadius:280,
    name:'THE SANCTUM', color:'#AA44FF', accentColor:'#CC88FF',
  } : null;
  ddsLootCrates = []; ddsNpcEntities = {};
  setTimeout(function(){ ddsZoneTransitioning=false; }, 600);
}

// ── STARS ─────────────────────────────────────────────────────────────────────
function ddsGenerateStars(seed) {
  var rng = (function(s){ return function(){ s=(s*16807+0)%2147483647; return (s-1)/2147483646; }; })(seed*999+1);
  ddsStars = [];
  for(var i=0;i<300;i++) ddsStars.push({x:rng()*DDS_WORLD,y:rng()*DDS_WORLD,r:rng()*1.8+0.3,a:rng()*0.7+0.3});
  // Nebula-esque large stars
  for(var j=0;j<20;j++) ddsStars.push({x:rng()*DDS_WORLD,y:rng()*DDS_WORLD,r:rng()*5+2,a:rng()*0.2+0.05});
}

// ── TOUCH CONTROLS ────────────────────────────────────────────────────────────
var _ddsJoy  = { active:false, id:null, startX:0, startY:0, dx:0, dy:0 };

function ddsIsTouchOnButton(cx, cy, bx, by, r) { return Math.hypot(cx-bx,cy-by)<r; }
function ddsTouchStart(e) {
  if (!ddsActive) return;
  e.preventDefault();
  var W=ddsCanvas.width, H=ddsCanvas.height;
  for (var i=0; i<e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    var cx=t.clientX, cy=t.clientY;
    // WoL fountain tap -- if in range and fountain present
    if (ddsWolFountain&&!ddsWolFountain.active&&ddsWolFountain.zone===ddsZoneKey(ddsZone)&&ddsShip&&Math.hypot(ddsShip.x-ddsWolFountain.x,ddsShip.y-ddsWolFountain.y)<200){ DDS_SKT()?.emit('dds:wolActivate'); continue; }
    // Sword button
    if (ddsIsTouchOnButton(cx,cy,W-60,H-80,52)) { ddsSwingSword(); continue; }
    // Laser button
    if (ddsIsTouchOnButton(cx,cy,W-60,H-200,40)) { ddsChargeLaser(); continue; }
    // Weapons toggle
    if (ddsIsTouchOnButton(cx,cy,W-170,H-120,32)) { ddsWeaponsOn=!ddsWeaponsOn; DDS_NOTIFY(ddsWeaponsOn?'Auto-turrets ON':'Auto-turrets OFF'); continue; }
    // Left joystick
    if (cx < W*0.5 && !_ddsJoy.active) {
      _ddsJoy={active:true,id:t.identifier,startX:cx,startY:cy,dx:0,dy:0};
    }
  }
}
function ddsTouchMove(e) {
  if (!ddsActive) return;
  e.preventDefault();
  for (var i=0; i<e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    if (_ddsJoy.active && t.identifier===_ddsJoy.id) {
      var dx=(t.clientX-_ddsJoy.startX)/55, dy=(t.clientY-_ddsJoy.startY)/55;
      _ddsJoy.dx=Math.max(-1,Math.min(1,dx)); _ddsJoy.dy=Math.max(-1,Math.min(1,dy));
    }
  }
}
function ddsTouchEnd(e) {
  if (!ddsActive) return;
  for (var i=0; i<e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    if (_ddsJoy.active && t.identifier===_ddsJoy.id) {
      _ddsJoy.active=false; _ddsJoy.dx=0; _ddsJoy.dy=0;
      window._joystickDelta={x:0,y:0};
    }
  }
}

// Return button click -- wired in initDDS after canvas creation

// ── SOCKET HANDLERS ───────────────────────────────────────────────────────────
function ddsOnOtherMove(d) {
  if (!ddsOtherPlayers[d.socketId]) ddsOtherPlayers[d.socketId]={username:d.username};
  Object.assign(ddsOtherPlayers[d.socketId], d);
}
function ddsOnHit(d) {
  if (!ddsShip) return;
  var dmg = d.dmg||1000;
  ddsShip.shield = Math.max(0, ddsShip.shield - dmg);
  ddsExplosions.push({x:ddsShip.x,y:ddsShip.y,r:30,t:0,maxT:0.3,color:'#FF4400'});
  // Damage float on player
  ddsDamageNumbers.push({x:ddsShip.x,y:ddsShip.y-30,val:dmg,t:0,maxT:1.2,color:'#FF4444',vx:(Math.random()-0.5)*20,vy:-40});
  if (ddsShip.shield <= 0) {
    DDS_NOTIFY('💀 Gundam destroyed — DM dropped. Returning to Sanctum.');
    if (ddsDarkMatter > 0) {
      DDS_SKT()?.emit('dds:dropDM', { x:ddsShip.x, y:ddsShip.y, zone:ddsZoneKey(ddsZone), amount:ddsDarkMatter });
      ddsDarkMatter = 0;
    }
    ddsRemoveMobileHUD();
    setTimeout(function(){ ddsInitMobileHUD(); leaveDDS(); }, 1500);
  }
}
function ddsOnNpcUpdate(d) {
  if (!d || !d.npcs) return;
  var inUpdate = {};
  d.npcs.forEach(function(n) {
    var existing = ddsNpcEntities[n.id] || {};
    inUpdate[n.id] = true;
    ddsNpcEntities[n.id] = {
      // Interpolation state -- same pattern as warzone bots
      x: existing.x !== undefined ? existing.x : n.x,
      y: existing.y !== undefined ? existing.y : n.y,
      prevX: existing.x !== undefined ? existing.x : n.x,
      prevY: existing.y !== undefined ? existing.y : n.y,
      nextX: n.x, nextY: n.y,
      interpT: 0, interpInterval: 0.1, // 100ms tick
      angle: existing.angle !== undefined ? existing.angle : n.angle,
      nextAngle: n.angle,
      // Data
      id: n.id, factionId: n.factionId, role: n.role,
      zone: n.zone, shield: n.shield, maxShield: n.maxShield,
      shipDesign: n.shipDesign, shipClass: n.shipClass,
      escorting: n.escorting, darkMatter: n.darkMatter,
      hitFlash: existing.hitFlash || 0,
    };
  });
  // Remove dead NPCs
  Object.keys(ddsNpcEntities).forEach(function(id){
    if (!inUpdate[id]) delete ddsNpcEntities[id];
  });
}
function ddsOnNpcDamage(d) {
  var npc = ddsNpcEntities[d.npcId]; if (!npc) return;
  npc.shield = d.shield; npc.maxShield = d.maxShield;
  npc.hitFlash = 0.5;
  if (d.dead) { delete ddsNpcEntities[d.npcId]; ddsExplosions.push({x:npc.x,y:npc.y,r:60,t:0,maxT:0.6,color:'#FF4400'}); }
}
function ddsOnNpcHitConfirm(d) {
  // Show damage float on NPC
  var npc = ddsNpcEntities[d.npcId]; if (!npc) return;
  var isCrit = d.dmg > 500000;
  ddsDamageNumbers.push({x:npc.x,y:npc.y-20,val:d.dmg,t:0,maxT:1.4,
    color:isCrit?'#FFFF00':'#FFFFFF',vx:(Math.random()-0.5)*15,vy:-50,crit:isCrit});
  ddsOnNpcDamage(d);
}
function ddsOnNpcBullet(d) {
  var fCol = d.faction==='raiders'?'#FF2200':'#00FF88';
  // Add to moving enemy projectiles array
  ddsEnemyProjectiles.push({x:d.x,y:d.y,vx:d.vx,vy:d.vy,life:70,trail:[],color:fCol,dmg:d.dmg,type:'bullet'});
}
function ddsOnNpcMissile(d) {
  var fCol = d.faction==='raiders'?'#FF4400':'#00FFAA';
  // Add to moving enemy projectiles
  ddsEnemyProjectiles.push({x:d.x,y:d.y,vx:d.vx,vy:d.vy,
    angle:Math.atan2(d.vy,d.vx),life:220,trail:[],smokeTrail:[],age:0,
    color:fCol,dmg:d.dmg,type:'missile'});
}
function ddsOnLootSpawn(d) {
  ddsLootCrates.push({id:d.id,x:d.x,y:d.y,zone:d.zone,darkMatter:d.darkMatter,t:0});
  DDS_NOTIFY('⬡ Dark matter loot dropped: '+Math.round(d.darkMatter).toLocaleString()+' DM');
}
function ddsOnDMGain(d) {
  ddsDarkMatter = d.total||ddsDarkMatter;
  ddsUpdateDMHUD();
}
function ddsOnKothUpdate(d) { ddsKothZones = d.zones||[]; }
function ddsOnDockConfirm(d) {
  _ddsDocking = false;
  var transferred = Math.round(d.transferred||0);
  var newBalance = Math.round(d.darkMatter||0);
  var prev = Math.round(d.prevBalance||0);
  if (transferred > 0) {
    DDS_NOTIFY('✦ DOCKED — Sanctum account: '+prev.toLocaleString()+' + '+transferred.toLocaleString()+' = '+newBalance.toLocaleString()+' DM');
  } else {
    DDS_NOTIFY('Docked at Sanctum. No DM to transfer.');
  }
  setTimeout(function(){ leaveDDS(); }, 1800);
}

// ── WoL HUD ───────────────────────────────────────────────────────────────────
function ddsUpdateWolHUD() {
  var el=document.getElementById('ddsWolHUD');
  if (!el) {
    el=document.createElement('div'); el.id='ddsWolHUD';
    el.style.cssText='position:fixed;bottom:70px;left:8px;'
      +'background:rgba(0,8,22,0.82);border:1px solid rgba(0,200,255,0.3);border-radius:20px;'
      +'padding:5px 16px;font-family:Courier New,monospace;font-size:11px;font-weight:bold;'
      +'color:#00DDFF;letter-spacing:0.1em;z-index:821;pointer-events:none;display:none;';
    document.body.appendChild(el);
  }
  el.style.display=ddsActive?'block':'none';
  el.textContent='💧 '+Math.floor(ddsWolBalance).toLocaleString()+' WoL';
}
// ── DM HUD ────────────────────────────────────────────────────────────────────
function ddsUpdateDMHUD() {
  var el = document.getElementById('ddsDMHUD');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ddsDMHUD';
    el.style.cssText = 'position:fixed;bottom:24px;left:8px;'
      +'background:rgba(0,8,22,0.82);border:1px solid rgba(0,200,255,0.3);border-radius:20px;'
      +'padding:8px 22px;font-family:Courier New,monospace;font-size:14px;font-weight:bold;'
      +'color:#44CCFF;letter-spacing:0.1em;z-index:821;pointer-events:none;display:none;';
    document.body.appendChild(el);
  }
  el.style.display = ddsActive ? 'block' : 'none';
  el.textContent = '◈ ' + Math.floor(ddsDarkMatter).toLocaleString() + ' Dark Matter';
}

// ── MOBILE HUD ────────────────────────────────────────────────────────────────
function ddsInitMobileHUD() {
  if (document.getElementById('ddsMobileHUD')) return;
  if (window.innerWidth >= 900) return;
  var hud = document.createElement('div');
  hud.id = 'ddsMobileHUD';
  hud.style.cssText = 'position:fixed;bottom:280px;right:12px;z-index:821;display:flex;flex-direction:column;align-items:center;gap:10px;';

  function mkBtn(color, id, html) {
    var b = document.createElement('div');
    b.id = id;
    b.style.cssText = 'width:64px;padding:8px 0 6px;background:rgba(0,8,22,0.88);border:2px solid '+color
      +';border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;'
      +'user-select:none;cursor:pointer;text-align:center;backdrop-filter:blur(6px);'
      +'-webkit-tap-highlight-color:transparent;box-shadow:0 0 12px '+color+'44;';
    b.innerHTML = html;
    return b;
  }

  var btnWarp = mkBtn('#00FFFF','ddsMobWarp',
    '<svg width="28" height="26" viewBox="0 0 28 26"><polygon points="10,5 23,13 10,21 13,13" fill="none" stroke="#00FFFF" stroke-width="1.8" stroke-linejoin="round"/><circle cx="23" cy="13" r="2" fill="#00FFFF"/></svg>'
    +'<div style="font-family:Courier New,monospace;font-size:9px;color:#00FFFF;letter-spacing:0.1em;">WARP</div>');

  var btnScan = mkBtn('#00FFB8','ddsMobScan',
    '<svg width="28" height="26" viewBox="0 0 28 26"><circle cx="19" cy="13" r="2.5" fill="#00FFB8"/><circle cx="19" cy="13" r="5.5" stroke="#00FFB8" stroke-width="1" fill="none" opacity="0.5"/><circle cx="19" cy="13" r="9" stroke="#00FFB8" stroke-width="0.6" fill="none" opacity="0.2"/></svg>'
    +'<div style="font-family:Courier New,monospace;font-size:9px;color:#00FFB8;letter-spacing:0.1em;">SCAN</div>');

  // Sword handled by canvas circle button

  btnWarp.addEventListener('touchstart',  function(e){ e.preventDefault(); ddsDoWarp(); }, {passive:false});
  btnScan.addEventListener('touchstart',  function(e){ e.preventDefault(); ddsActivateScanner(); }, {passive:false});


  hud.appendChild(btnWarp);
  hud.appendChild(btnScan);
  document.body.appendChild(hud);
}
function ddsRemoveMobileHUD() {
  var hud=document.getElementById('ddsMobileHUD'); if(hud) hud.remove();
  var dm=document.getElementById('ddsDMHUD'); if(dm) dm.remove();
  var wl=document.getElementById('ddsWolHUD'); if(wl) wl.remove();
}

// ── WIRE gundam:undockConfirmed ───────────────────────────────────────────────
(function() {
  function wireUndock() {
    var skt = window._mineGetSocket && window._mineGetSocket();
    if (!skt) { setTimeout(wireUndock, 500); return; }
    skt.on('gundam:undockConfirmed', function(data) {
      if (!data || !data.zone || !data.zone.startsWith('s-')) return;
      console.log('[DDS] undockConfirmed -- zone:', data.zone, 'gundam:', data.gundam && data.gundam.name);
      // Tear down sanctum
      if (typeof window.leaveSanctum === 'function' && window._inSanctum) {
        // Don't fully leave -- just hide sanctum canvas
        window.sanctumActive = false;
        window._inSanctum = false;
        var sc = document.getElementById('scCanvas');
        if (sc) sc.style.display = 'none';
      }
      // Enter DDS
      window.enterDDS(data);
    });
  }
  wireUndock();
})();

console.log('[DDS] Module loaded');

// ── PLANET COMBAT HANDLERS ───────────────────────────────────────────────────
function ddsOnPlanetDamage(d) {
  var idx = ddsPlanets.findIndex(function(p){ return p.username===d.planetOwner; });
  if (idx < 0) return;
  ddsPlanets[idx].shieldHP    = d.shieldHP;
  ddsPlanets[idx].maxShieldHP = d.maxShieldHP;
  ddsPlanets[idx]._hitFlash   = 0.6;
  var _bk = ddsPlanets[idx].name || ('p'+ddsPlanets[idx].username);
  Object.keys(_ddsPlanetCache).forEach(function(k){
    if (k.indexOf(_bk+'_')===0) delete _ddsPlanetCache[k];
  });
}

function ddsOnPlanetDestroyed(d) {
  DDS_NOTIFY('[DESTROYED] '+d.planetName+' -- taken out by '+d.killedBy+' | +'+(d.wolLooted||0).toLocaleString()+' WoL');
  // Force-remove lingering guard NPCs from client immediately
  var _dfid='planet_'+d.planetOwner;
  Object.keys(ddsNpcEntities).forEach(function(id){
    if (ddsNpcEntities[id]&&ddsNpcEntities[id].factionId===_dfid) delete ddsNpcEntities[id];
  });
  // Force-remove lingering guard NPCs from client immediately
  var _dfid='planet_'+d.planetOwner;
  Object.keys(ddsNpcEntities).forEach(function(id){
    if (ddsNpcEntities[id]&&ddsNpcEntities[id].factionId===_dfid) delete ddsNpcEntities[id];
  });
  ddsScreenShake = 1.0;
  var _dpx=d.x||3000, _dpy=d.y||3000;
  for (var _di=0; _di<8; _di++) {
    (function(_i){
      setTimeout(function(){
        ddsExplosions.push({
          x:_dpx+(Math.random()-0.5)*400, y:_dpy+(Math.random()-0.5)*400,
          r:100+_i*50, t:0, maxT:1.4,
          color:['#FF6600','#FF2200','#FFAA00','#FF8800','#FFFFFF'][_i%5],
        });
      }, _i*200);
    })(_di);
  }
  ddsPlanets = ddsPlanets.filter(function(p){ return p.username!==d.planetOwner; });
  Object.keys(_ddsPlanetCache).forEach(function(k){ delete _ddsPlanetCache[k]; });
}

// ── DDS PLANET RENDERER ───────────────────────────────────────────────────────
// Pixel-accurate globe renderer -- ported from planet-client.js
// Each planet is baked to an offscreen canvas (keyed by name+tier+resBucket).
// Cache invalidates on evolution so the image reflects current state.

var _ddsPlanetCache   = {};  // cacheKey -> offscreen canvas
var _ddsPlanetMapCache = {}; // planetName -> Float32Array heightmap

// ── NOISE / FBM ──
function _ddsNoise(x,y) {
  var n = Math.sin(x*127.1+y*311.7)*43758.5453;
  return n - Math.floor(n);
}
function _ddsSmoothNoise(x,y) {
  var ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  var a=_ddsNoise(ix,iy),b=_ddsNoise(ix+1,iy),c=_ddsNoise(ix,iy+1),d=_ddsNoise(ix+1,iy+1);
  var ux=fx*fx*(3-2*fx),uy=fy*fy*(3-2*fy);
  return a+(b-a)*ux+(c-a)*uy+(a-b-c+d)*ux*uy;
}
function _ddsFbm(x,y,oct) {
  var v=0,a=0.5,f=1;
  for(var i=0;i<oct;i++){v+=a*_ddsSmoothNoise(x*f,y*f);a*=0.5;f*=2.1;}
  return v;
}

// ── GLOBE COLOR -- identical logic to planet-client globeColor ──
function _ddsGlobeColor(h, waterAmt, metalAmt, lifeAmt) {
  var seaLevel=0.42+waterAmt*0.12;
  if(h<seaLevel-0.08) return [15,40,120];
  if(h<seaLevel)      return [25,65,160];
  if(h<seaLevel+0.02) return [210,190,140];
  if(h<seaLevel+0.08) {
    if(lifeAmt>0.3) return [_ddslrp(80,40,metalAmt),_ddslrp(160,100,metalAmt),_ddslrp(60,40,metalAmt)];
    return [_ddslrp(140,80,metalAmt),_ddslrp(120,80,metalAmt),_ddslrp(80,60,metalAmt)];
  }
  if(h<seaLevel+0.18) {
    if(lifeAmt>0.4) return [_ddslrp(55,35,metalAmt),_ddslrp(130,90,metalAmt),_ddslrp(45,35,metalAmt)];
    return [_ddslrp(120,80,metalAmt),_ddslrp(100,75,metalAmt),_ddslrp(80,65,metalAmt)];
  }
  if(h<seaLevel+0.28) return [_ddslrp(120,80,metalAmt),_ddslrp(100,80,metalAmt),_ddslrp(90,75,metalAmt)];
  return [240,245,255];
}
function _ddslrp(a,b,t){return Math.round(a+(b-a)*t);}

// ── BUILD HEIGHTMAP -- seeded per planet name for unique geography ──
function _ddsBuildPlanetMap(pl) {
  var seed = 0;
  for(var si=0;si<(pl.name||'X').length;si++) seed += pl.name.charCodeAt(si)*(si+1);
  seed = (seed % 997) / 997 * 12.0;
  var S = 128;
  var map = new Float32Array(S*S);
  for(var y=0;y<S;y++) for(var x=0;x<S;x++) {
    var lon=x/S, lat=y/S;
    var h=_ddsFbm(lon*4+seed, lat*4+seed, 6);
    var latN=Math.abs(lat-0.5)*2;
    h+=latN*latN*0.3;
    map[y*S+x]=h;
  }
  return map;
}

// ── RENDER PLANET TO OFFSCREEN CANVAS -- fires once per evolution state ──
function _ddsRenderPlanetToCanvas(pl) {
  var tier     = pl.tier||2;
  var resPct   = pl.reservoirCap>0 ? (pl.reservoirWoL||0)/pl.reservoirCap : 0;
  var waterAmt = Math.min(0.6, Math.max(0.1, resPct*0.5+tier*0.04));
  var lifeAmt  = Math.min(1, Math.max(0, (tier-2)/3));
  var metalAmt = Math.min(1, Math.max(0, (tier-5)/3));
  var pop      = pl.population||0;
  var baseR    = 60 + tier*20 + Math.min(pop/500, 40);
  var pad      = Math.ceil(baseR * 0.25);
  var diameter = Math.ceil(baseR*2) + pad*2;
  var cx = diameter/2, cy = diameter/2;
  var r = baseR;

  var oc = document.createElement('canvas');
  oc.width = diameter; oc.height = diameter;
  var octx = oc.getContext('2d');

  // Atmosphere glow (baked -- driven by tier/life, not _t)
  var atmA   = Math.min(1, lifeAmt*0.6+0.1);
  var atmCol = metalAmt>0.5 ? 'rgba(80,90,110,' : 'rgba(100,170,255,';
  var halo   = octx.createRadialGradient(cx,cy,r*0.85,cx,cy,r*1.25);
  halo.addColorStop(0, atmCol+atmA+')');
  halo.addColorStop(1, atmCol+'0)');
  octx.beginPath(); octx.arc(cx,cy,r*1.25,0,Math.PI*2);
  octx.fillStyle=halo; octx.fill();

  // Pixel sphere
  var mapKey = pl.name || ('p'+pl.id);
  if (!_ddsPlanetMapCache[mapKey]) _ddsPlanetMapCache[mapKey] = _ddsBuildPlanetMap(pl);
  var map = _ddsPlanetMapCache[mapKey];
  var S = 128;
  var id = octx.createImageData(diameter, diameter);
  var dd = id.data;
  for(var py=0;py<diameter;py++) {
    for(var px=0;px<diameter;px++) {
      var dx=(px-cx)/r, dy2=(py-cy)/r;
      var dist2=dx*dx+dy2*dy2;
      if(dist2>1) continue;
      var dz=Math.sqrt(1-dist2);
      var lat=(Math.asin(dy2)/Math.PI+0.5);
      var lon=((Math.atan2(dx,dz)/(Math.PI*2)))%1;
      if(lon<0) lon+=1;
      var mx=Math.floor(lon*S), my=Math.floor(lat*S);
      if(mx<0||mx>=S||my<0||my>=S) continue;
      var h=map[my*S+mx];
      var col=_ddsGlobeColor(h,waterAmt,metalAmt,lifeAmt);
      var light=Math.max(0.25, 0.3+dx*0.4+dy2*(-0.3)+dz*0.6);
      var terminator=Math.max(0,Math.min(1,(dx+0.5)*3));
      light*=(0.3+terminator*0.7);
      var idx=(py*diameter+px)*4;
      dd[idx]  =Math.min(255,col[0]*light);
      dd[idx+1]=Math.min(255,col[1]*light);
      dd[idx+2]=Math.min(255,col[2]*light);
      dd[idx+3]=255;
    }
  }
  octx.putImageData(id,0,0);

  // City lights (tier 4+)
  if(tier>=4 && lifeAmt>0.5) {
    octx.save();
    octx.beginPath(); octx.arc(cx,cy,r,0,Math.PI*2); octx.clip();
    var cityG=octx.createLinearGradient(cx-r*0.1,cy,cx+r,cy);
    cityG.addColorStop(0,'rgba(0,0,0,0)');
    cityG.addColorStop(0.5,'rgba(0,0,5,0.6)');
    cityG.addColorStop(1,'rgba(0,0,10,0.9)');
    octx.fillStyle=cityG; octx.fillRect(cx,cy-r,r,r*2);
    [[0.62,-0.2],[0.68,0.1],[0.58,0.36],[0.72,-0.4],[0.52,0.54],[0.64,0.24],[0.74,0.0]].forEach(function(l){
      var lx2=cx+l[0]*r, ly2=cy+l[1]*r;
      if(lx2>cx+r*0.35) {
        octx.beginPath(); octx.arc(lx2,ly2,1.5,0,Math.PI*2);
        octx.fillStyle='rgba(255,235,130,0.85)'; octx.fill();
      }
    });
    octx.restore();
  }

  // Metal plating (tier 6+)
  if(tier>=6) {
    octx.save();
    octx.beginPath(); octx.arc(cx,cy,r,0,Math.PI*2); octx.clip();
    octx.globalAlpha=metalAmt*0.35; octx.strokeStyle='#556677'; octx.lineWidth=1;
    for(var gi=-5;gi<=5;gi++){
      octx.beginPath(); octx.moveTo(cx+gi*r/4,cy-r); octx.lineTo(cx+gi*r/4,cy+r); octx.stroke();
      octx.beginPath(); octx.moveTo(cx-r,cy+gi*r/4); octx.lineTo(cx+r,cy+gi*r/4); octx.stroke();
    }
    if(metalAmt>0.7){
      [[0.4,-0.3],[-0.3,0.4],[0.1,0.5],[-0.5,-0.1]].forEach(function(pt){
        octx.globalAlpha=metalAmt*0.9;
        octx.beginPath(); octx.arc(cx+pt[0]*r,cy+pt[1]*r,4,0,Math.PI*2);
        octx.fillStyle='#FF4400'; octx.shadowColor='#FF4400'; octx.shadowBlur=8; octx.fill(); octx.shadowBlur=0;
      });
    }
    octx.globalAlpha=1; octx.restore();
  }

  // Rim shading + specular
  var rim=octx.createRadialGradient(cx,cy,r*0.65,cx,cy,r);
  rim.addColorStop(0,'rgba(0,0,0,0)'); rim.addColorStop(1,'rgba(0,0,10,0.72)');
  octx.beginPath(); octx.arc(cx,cy,r,0,Math.PI*2); octx.fillStyle=rim; octx.fill();
  var spec=octx.createRadialGradient(cx-r*0.32,cy-r*0.32,0,cx-r*0.32,cy-r*0.32,r*0.3);
  spec.addColorStop(0,'rgba(255,255,255,0.22)'); spec.addColorStop(1,'rgba(255,255,255,0)');
  octx.beginPath(); octx.arc(cx,cy,r,0,Math.PI*2); octx.fillStyle=spec; octx.fill();

  oc._ddsR   = baseR;
  oc._ddsPad = pad;
  return oc;
}

// ── CACHE MANAGER -- invalidates on tier or resource evolution ──
function _ddsGetPlanetCanvas(pl) {
  var tier      = pl.tier||2;
  var resPct    = pl.reservoirCap>0 ? (pl.reservoirWoL||0)/pl.reservoirCap : 0;
  var resBucket = Math.floor(resPct * 10);
  var baseKey   = pl.name || ('p'+pl.id);
  var cacheKey  = baseKey+'_t'+tier+'_r'+resBucket;
  if (!_ddsPlanetCache[cacheKey]) {
    Object.keys(_ddsPlanetCache).forEach(function(k){
      if(k.indexOf(baseKey+'_')===0) delete _ddsPlanetCache[k];
    });
    _ddsPlanetCache[cacheKey] = _ddsRenderPlanetToCanvas(pl);
    console.log('[DDS] Planet rendered:', baseKey, 'tier:'+tier, 'res:'+resBucket);
  }
  return _ddsPlanetCache[cacheKey];
}

// ── DRAW PLANET (called each frame) ──
// Blits cached globe + draws animated overlays live on top
function ddsDrawPlanet(pl) {
  var ctx  = ddsCtx;
  var px   = pl.x, py2 = pl.y;
  var tier = pl.tier||2;
  var pop  = pl.population||0;
  var happiness = pl.happiness||50;
  var resPct = pl.reservoirCap>0 ? (pl.reservoirWoL||0)/pl.reservoirCap : 0;
  var shPct  = pl.maxShieldHP>0 ? (pl.shieldHP||0)/pl.maxShieldHP : 1;
  var _t = Date.now()*0.001;
  var isOwn = pl.username===window._myUsername;
  var baseR = 60 + tier*20 + Math.min(pop/500, 40);

  // ── BLIT CACHED GLOBE ──
  var oc = _ddsGetPlanetCanvas(pl);
  ctx.drawImage(oc, px - oc._ddsPad - baseR, py2 - oc._ddsPad - baseR);

  // ── LIVE: HIT FLASH ──
  if (pl._hitFlash > 0) {
    pl._hitFlash = Math.max(0, pl._hitFlash - 0.04);
    ctx.beginPath(); ctx.arc(px,py2,baseR+8,0,Math.PI*2);
    ctx.strokeStyle='rgba(255,40,40,'+pl._hitFlash+')';
    ctx.lineWidth=6; ctx.stroke();
  }
  // ── LIVE: ATMOSPHERE HAPPINESS PULSE ──
  var atmPulse = 0.12 + Math.sin(_t*1.2)*0.06;
  var atmCol = happiness>60 ? 'rgba(80,160,255,' : happiness>30 ? 'rgba(255,180,80,' : 'rgba(255,60,60,';
  var atmRing = ctx.createRadialGradient(px,py2,baseR*0.9,px,py2,baseR*1.35);
  atmRing.addColorStop(0, atmCol+atmPulse+')');
  atmRing.addColorStop(1, atmCol+'0)');
  ctx.beginPath(); ctx.arc(px,py2,baseR*1.35,0,Math.PI*2);
  ctx.fillStyle=atmRing; ctx.fill();

  // ── LIVE: TRACTOR BEAM RING (tier 2+) ──
  if(tier>=2) {
    var tbPulse=0.2+Math.abs(Math.sin(_t*0.8))*0.3;
    ctx.beginPath(); ctx.arc(px,py2,baseR+40+Math.sin(_t)*8,0,Math.PI*2);
    ctx.strokeStyle='rgba(150,50,255,'+tbPulse+')'; ctx.lineWidth=1; ctx.stroke();
    if(isOwn) {
      ctx.font='7px Courier New'; ctx.fillStyle='rgba(150,50,255,0.6)';
      ctx.textAlign='center'; ctx.fillText('TRACTOR', px, py2+baseR+55);
    }
  }

  // ── LIVE: SHIELD RING ──
  var sCol = shPct>0.5 ? 'rgba(0,200,255,' : shPct>0.25 ? 'rgba(255,180,0,' : 'rgba(255,50,50,';
  var sPulse = 0.3+Math.sin(_t*2)*0.15;
  ctx.beginPath(); ctx.arc(px,py2,baseR+12,0,Math.PI*2*shPct);
  ctx.strokeStyle=sCol+sPulse+')'; ctx.lineWidth=3; ctx.stroke();
  ctx.font='bold 9px Courier New'; ctx.textAlign='center';
  ctx.fillStyle=sCol+'0.8)';
  ctx.fillText('⬡ '+Math.round(shPct*100)+'%', px, py2-baseR-18);

  // ── LIVE: NAME TAG + TIER/POP ──
  ctx.font='bold 11px Courier New'; ctx.textAlign='center';
  ctx.fillStyle=isOwn?'#FFDD44':'rgba(200,150,255,0.9)';
  ctx.fillText((isOwn?'★ ':'')+pl.name, px, py2+baseR+22);
  ctx.font='9px Courier New'; ctx.fillStyle='rgba(150,120,220,0.7)';
  ctx.fillText('T'+tier+' · Pop '+pop.toLocaleString(), px, py2+baseR+35);

  // ── LIVE: SHIELD BAR ──
  var sbW=baseR*2, sbX=px-baseR, sbY=py2+baseR+42;
  ctx.fillStyle='rgba(0,5,20,0.8)'; ctx.fillRect(sbX,sbY,sbW,6);
  ctx.fillStyle=shPct>0.5?'#00CCFF':shPct>0.25?'#FFAA00':'#FF4444';
  ctx.fillRect(sbX,sbY,sbW*shPct,6);
  ctx.strokeStyle='rgba(0,100,160,0.4)'; ctx.lineWidth=1; ctx.strokeRect(sbX,sbY,sbW,6);
}
