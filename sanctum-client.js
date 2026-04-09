// sanctum-client.js -- The Sanctum (Deep Deep Space hub)
// 2D side-scrolling world. Entry point from Serenity portal in zone 5-5.
// Follows same pattern as station-client.js.
//
// Architecture:
//   - 2D canvas (not Three.js)
//   - Player walks left/right as mech silhouette
//   - Camera follows player horizontally
//   - Dr. Zoidberg NPC in center
//   - Gundam Hangar shop on right side
//   - Other players rendered as mech silhouettes
//   - Chat/social layer same as station
//   - Places menu item injected after first visit (sanctumVisited flag)

const SC_SKT = () => window._mineGetSocket?.();

let sanctumActive = false;
let scCanvas = null;
let scCtx = null;
let scAnimId = null;
let scPlayer = { x: 400, y: 0, vy: 0, vx: 0, facing: 1, grounded: true };
let scCamera = { x: 0 };
let scOtherPlayers = {};
let scKeys = {};
let scNearNpc      = false;
let scNearHangar   = false;
let scNearArmillary = false;
let scWidth = 0, scHeight = 0;

// World dimensions
const SC_WORLD_W = 3200; // total scrollable width
const SC_FLOOR_Y = 0;    // floor y (we render from bottom)

// NPC and landmark positions
const SC_NPC_X    = 1200; // Dr. Zoidberg
const SC_HANGAR_X  = 2400; // Gundam Hangar entrance
const SC_ARMILLARY_X = 3000; // Cosmic Armillary -- Planet portal
const SC_SPAWN_X  = 400;

// ── INIT ──────────────────────────────────────────────────────────────────────
function initSanctum() {
  if (scCanvas) return;
  scCanvas = document.createElement('canvas');
  scCanvas.id = 'scCanvas';
  scCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:90;display:none;image-rendering:pixelated;';
  document.body.appendChild(scCanvas);
  scCtx = scCanvas.getContext('2d');
  window.addEventListener('resize', scResize);
  scResize();

  // Key controls
  document.addEventListener('keydown', scKeyDown);
  document.addEventListener('keyup',   e => { scKeys[e.code] = false; });

  // Socket events
  const skt = SC_SKT();
  if (skt) {
    skt.on('sanctum:state',      scOnState);
    skt.on('sanctum:playerMove', scOnPlayerMove);
    skt.on('sanctum:playerLeft', scOnPlayerLeft);
    skt.on('sanctum:chat',       scOnChat);
    skt.on('sanctum:zoidbergMsg',scOnZoidbergMsg);
    skt.on('gundam:zoidbergMsg', scOnGundamZoidberg);
    skt.on('gundam:data', function(d) { window._scDarkMatter=d.darkMatter||0; scUpdateDMHUD(); });
    skt.on('gundam:darkMatterUpdate', function(d){ window._scDarkMatter=d.darkMatter||0; scUpdateDMHUD(); });
    skt.on('gundam:crafted', function(d) { window._scDarkMatter=d.darkMatter||0; scUpdateDMHUD(); });
    skt.on('gundam:partRolled', function(d) { window._scDarkMatter=d.darkMatter||0; scUpdateDMHUD(); });
  }

  scLoop();
}

function scResize() {
  if (!scCanvas) return;
  scWidth  = scCanvas.width  = window.innerWidth;
  scHeight = scCanvas.height = window.innerHeight;
}

// ── ENTER / LEAVE ─────────────────────────────────────────────────────────────
window.enterSanctum = function() {
  if (!scCanvas) initSanctum();
  sanctumActive = true;
  // Restart loop on re-enter (cancelled on leave)
  if (!scAnimId) scLoop();
  window._inSanctum = true;
  window._inStation = false;
  window._playerZone = 'sanctum';

  // Hide all earth/station/deepspace UI
  if (typeof dsHideMobileHUD === 'function') dsHideMobileHUD();
  if (typeof dsFullTeardown  === 'function') dsFullTeardown();
  document.querySelectorAll('canvas').forEach(c => {
    if (c !== scCanvas) c.style.display = 'none';
  });

  scCanvas.style.display = 'block';
  scPlayer = { x: SC_SPAWN_X, y: 0, vy: 0, vx: 0, facing: 1, grounded: true };
  scCamera = { x: 0 };

  SC_SKT()?.emit('player:zone',   { zone: 'sanctum' });
  SC_SKT()?.emit('player:move',   { x: 0, y: -1000, z: 0, rotY: 0 }); // move out of earth world
  SC_SKT()?.emit('sanctum:enter', {});
  // Hide earth renderer canvas -- same as enterStation
  if (window._earthRenderer) {
    window._earthCanvas = window._earthRenderer.domElement;
    window._earthCanvas.style.display = "none";
  }
  // Exit pointer lock so earth camera stops
  if (document.pointerLockElement) document.exitPointerLock();
  // Kill robot nametags
  document.querySelectorAll("div").forEach(function(el){
    if ((el.textContent||"").trim().startsWith("🤖")) el.style.display="none";
  });
  // Hide car menu
  ["carMenuBtn","carMenu","rocketBtn","robotsBtn"].forEach(function(id){
    var el=document.getElementById(id); if(el) el.style.display="none";
  });

  // Inject Sanctum into Places menu if not already there
  injectSanctumTeleport();

  // Show mobile walk buttons
  scInitMobileControls();
  scInitDMHUD();
  scInitUndockBtn();
  buildSanctumPlacesMenu();
  ["mineHUD","robotsBtn","rocketBtn","stBarsHUD","dsMobileHUD"].forEach(function(id){
    var el=document.getElementById(id); if(el) el.style.display="none";
  });
  setTimeout(function(){ SC_SKT()?.emit("gundam:getData"); }, 500);
  // Continuous hide of earth UI -- some elements get recreated
  // Initial hide pass
  if (window._mineHUD) { window._mineHUD.style.display="none"; window._mineHUD.dataset.scHidden="1"; }
  document.querySelectorAll("div,button").forEach(function(el){
    var txt=(el.textContent||"").trim();
    if(txt==="🤖"||txt==="🔑"||txt.startsWith("📦 Bot deposit")||txt.startsWith("🔶 Smelt box")
      ||txt.startsWith("Press E or tap to sit")||txt.includes(" ore |")||txt.startsWith("0/4 ore")
      ||el.id==="rocketBtn"||el.id==="robotsBtn") {
      el.dataset.scHidden="1"; el.style.display="none";
    }
  });
  window._scHideInterval = setInterval(function() {
    if (!sanctumActive) { clearInterval(window._scHideInterval); return; }
    ["robotsBtn","rocketBtn","dsMobileHUD"].forEach(function(id){
      var el=document.getElementById(id);
      if(el&&el.style.display!="none"){el.style.display="none";el.dataset.scHidden="1";}
    });
    if(window._mineHUD&&window._mineHUD.style.display!="none") window._mineHUD.style.display="none";
    document.querySelectorAll("div,button").forEach(function(el){
      if(el.dataset&&el.dataset.scHidden) return;
      var txt=(el.textContent||"").trim();
      if(txt==="🤖"||txt==="🔑"||txt.startsWith("📦 Bot deposit")||txt.startsWith("🔶 Smelt box")
        ||txt.startsWith("Press E or tap to sit")||txt.includes(" ore |")||txt.startsWith("0/4 ore")
        ||el.id==="rocketBtn"||el.id==="robotsBtn") {
        el.dataset.scHidden="1"; el.style.display="none";
      }
    });
  }, 200);

  // Ambient music
  scStartMusic();

  console.log('[Sanctum] Entered');
};
window.leaveSanctum = function() {
  sanctumActive = false;
  window._inSanctum = false;
  window._sanctumActive = false;
  window._playerZone = "earth";
  if (scCanvas) scCanvas.style.display = "none";
  if (scAnimId) { cancelAnimationFrame(scAnimId); scAnimId = null; }
  if (window._scHideInterval) { clearInterval(window._scHideInterval); window._scHideInterval = null; }
  // Restore earth canvas -- match station pattern
  if (window._earthCanvas) { window._earthCanvas.style.display = ""; window._earthCanvas = null; }
  else if (window._scHiddenEarthCanvas) { window._scHiddenEarthCanvas.style.display = ""; window._scHiddenEarthCanvas = null; }
  else { var _ec=[...document.querySelectorAll("canvas")].find(function(c){return c!==scCanvas;}); if(_ec) _ec.style.display=""; }
  document.querySelectorAll("[data-scHidden]").forEach(function(el){ el.style.display=""; delete el.dataset.scHidden; });
  if (window._mineHUD) window._mineHUD.style.display="";
  var _scDMEl=document.getElementById("scDMHUD"); if(_scDMEl) _scDMEl.remove();
  var _scUndockEl=document.getElementById("scUndockBtn"); if(_scUndockEl) _scUndockEl.remove();
  restoreSanctumPlaces();
  if (document.pointerLockElement) document.exitPointerLock();
  SC_SKT()?.emit("sanctum:leave", {});
  SC_SKT()?.emit("player:zone", { zone: "earth" });
  SC_SKT()?.emit("player:move", { x: 0, y: 1.7, z: 8, rotY: 0 });
  scStopMusic();
  scRemoveMobileControls();
  window.showEarthUI?.();
  setTimeout(function(){ window._earthResume?.(); }, 300);
  console.log('[Sanctum] Left');
};
// ── GAME LOOP ─────────────────────────────────────────────────────────────────
function scLoop() {
  scAnimId = requestAnimationFrame(scLoop);
  if (!sanctumActive) return;
  scUpdate();
  scDraw();
}

function scUpdate() {
  const SPEED = 3.5, FRICTION = 0.82;

  var _jd = window._joystickDelta||{x:0,y:0};
  if (scKeys['ArrowLeft']  || scKeys['KeyA'] || window._scMoveLeft  || _jd.x < -0.2) { scPlayer.vx -= SPEED; scPlayer.facing = -1; }
  if (scKeys['ArrowRight'] || scKeys['KeyD'] || window._scMoveRight || _jd.x >  0.2) { scPlayer.vx += SPEED; scPlayer.facing =  1; }
  scPlayer.vx *= FRICTION;
  scPlayer.x = Math.max(0, Math.min(SC_WORLD_W, scPlayer.x + scPlayer.vx));
  // Jump physics
  var GRAVITY = 0.6, JUMP_FORCE = -12;
  scPlayer.vy += GRAVITY;
  scPlayer.y += scPlayer.vy;
  if (scPlayer.y >= 0) { scPlayer.y = 0; scPlayer.vy = 0; scPlayer.grounded = true; }
  // Jump keys
  if ((scKeys["Space"] || scKeys["ArrowUp"] || scKeys["KeyW"]) && scPlayer.grounded) {
    scPlayer.vy = JUMP_FORCE; scPlayer.grounded = false;
  }

  // Wire earth jump button to sanctum jump if not already done
  if (!scUpdate._jumpWired) {
    var _allDivs = document.querySelectorAll("div");
    for (var _ji=0; _ji<_allDivs.length; _ji++) {
      if (_allDivs[_ji].innerHTML === "⬆") {
        _allDivs[_ji].addEventListener("touchstart", function(e){
          e.preventDefault();
          if (sanctumActive && scPlayer.grounded) { scPlayer.vy=-12; scPlayer.grounded=false; }
        }, {passive:false});
        _allDivs[_ji].addEventListener("click", function(){
          if (sanctumActive && scPlayer.grounded) { scPlayer.vy=-12; scPlayer.grounded=false; }
        });
        scUpdate._jumpWired = true; break;
      }
    }
  }
  // Camera follows player
  const targetCamX = scPlayer.x - scWidth / 2;
  scCamera.x += (targetCamX - scCamera.x) * 0.12;
  scCamera.x  = Math.max(0, Math.min(SC_WORLD_W - scWidth, scCamera.x));

  // Clamp player to world and kill velocity at edges
  if (scPlayer.x <= 0 || scPlayer.x >= SC_WORLD_W) scPlayer.vx = 0;
  scPlayer.x = Math.max(0, Math.min(SC_WORLD_W, scPlayer.x));
  // NPC proximity
  scNearNpc       = Math.abs(scPlayer.x - SC_NPC_X)       < 90;
  scNearHangar    = Math.abs(scPlayer.x - SC_HANGAR_X)    < 100;
  scNearArmillary = Math.abs(scPlayer.x - SC_ARMILLARY_X) < 110;
  if (window._scInteractHint && !window._ddsActive) {
    if (scNearHangar)    { window._scInteractHint.textContent='Tap to open Gundam Hangar'; window._scInteractHint.style.display='block'; }
    else if (scNearNpc)  { window._scInteractHint.textContent='Tap to talk to Zoidberg'; window._scInteractHint.style.display='block'; }
    else if (scNearArmillary) { window._scInteractHint.textContent='✦ Tap — Cosmic Armillary'; window._scInteractHint.style.display='block'; }
    else { window._scInteractHint.style.display='none'; }
  } else if (window._scInteractHint && window._ddsActive) { window._scInteractHint.style.display='none'; }

  // Broadcast position every ~15 frames
  if (!scUpdate._t) scUpdate._t = 0;
  scUpdate._t++;
  if (scUpdate._t % 15 === 0) {
    SC_SKT()?.emit('sanctum:move', { x: Math.round(scPlayer.x), facing: scPlayer.facing });
  }
}

// ── DRAW ──────────────────────────────────────────────────────────────────────
function scDraw() {
  if (!scCtx) return;
  const W = scWidth, H = scHeight;
  const floor = H * 0.72; // floor y in screen space
  const ox = -scCamera.x; // world -> screen offset

  // ── BACKGROUND ──
  // Deep space gradient
  var bg = scCtx.createLinearGradient(0,0,0,H);
  bg.addColorStop(0, '#000008');
  bg.addColorStop(0.6, '#000520');
  bg.addColorStop(1, '#001040');
  scCtx.fillStyle = bg;
  scCtx.fillRect(0, 0, W, H);

  // Stars
  if (!scDraw._stars) {
    scDraw._stars = [];
    for (var i=0; i<200; i++) scDraw._stars.push({
      x: Math.random()*SC_WORLD_W, y: Math.random()*(H*0.65),
      r: Math.random()*1.5+0.3, b: Math.random()
    });
  }
  scDraw._stars.forEach(function(st) {
    scCtx.fillStyle = 'rgba(200,220,255,'+(0.4+st.b*0.6)+')';
    scCtx.beginPath(); scCtx.arc(ox+st.x, st.y, st.r, 0, Math.PI*2); scCtx.fill();
  });

  // ── FLOOR / PLATFORM ──
  scCtx.fillStyle = '#0A1428';
  scCtx.fillRect(0, floor, W, H-floor);
  // Floor line glow
  scCtx.strokeStyle = 'rgba(0,150,255,0.6)';
  scCtx.lineWidth = 2;
  scCtx.shadowColor = '#0088FF'; scCtx.shadowBlur = 12;
  scCtx.beginPath(); scCtx.moveTo(0,floor); scCtx.lineTo(W,floor); scCtx.stroke();
  scCtx.shadowBlur = 0;

  // Floor grid lines
  scCtx.strokeStyle = 'rgba(0,80,180,0.15)';
  scCtx.lineWidth = 1;
  for (var gx=0; gx<SC_WORLD_W; gx+=120) {
    var sx = ox+gx;
    if (sx < -10 || sx > W+10) continue;
    scCtx.beginPath(); scCtx.moveTo(sx,floor); scCtx.lineTo(sx,H); scCtx.stroke();
  }

  // ── BACKGROUND STRUCTURES ──
  // Sanctum arch portals
  [[400,floor],[800,floor],[1600,floor],[2000,floor],[2800,floor]].forEach(function(pos) {
    var px=ox+pos[0], py=pos[1];
    if (px < -200 || px > W+200) return;
    scCtx.strokeStyle = 'rgba(0,100,200,0.3)';
    scCtx.lineWidth = 3;
    scCtx.beginPath(); scCtx.arc(px, py, 80, Math.PI, 0); scCtx.stroke();
    scCtx.strokeStyle = 'rgba(0,60,150,0.15)';
    scCtx.lineWidth = 1;
    scCtx.beginPath();
    scCtx.moveTo(px-80, py); scCtx.lineTo(px-80, py-200);
    scCtx.moveTo(px+80, py); scCtx.lineTo(px+80, py-200);
    scCtx.stroke();
  });

  // ── DR. ZOIDBERG NPC ──
  var npcSx = ox + SC_NPC_X;
  if (npcSx > -100 && npcSx < W+100) {
    scDrawZoidberg(npcSx, floor, scDraw._t||0);
    if (scNearNpc) {
      scCtx.font = '11px Courier New'; scCtx.textAlign = 'center';
      scCtx.fillStyle = 'rgba(0,220,255,0.8)';
      scCtx.shadowColor = '#00CCFF'; scCtx.shadowBlur = 8;
      scCtx.fillText('[E] TALK TO DR. ZOIDBERG', npcSx, floor - 110);
      scCtx.shadowBlur = 0;
    }
  }

  // ── GUNDAM HANGAR ──
  var hangarSx = ox + SC_HANGAR_X;
  if (hangarSx > -300 && hangarSx < W+300) {
    scDrawHangar(hangarSx, floor);
    if (scNearHangar) {
      scCtx.font = '11px Courier New'; scCtx.textAlign = 'center';
      scCtx.fillStyle = 'rgba(255,180,0,0.9)';
      scCtx.shadowColor = '#FFAA00'; scCtx.shadowBlur = 8;
      scCtx.fillText('[E] GUNDAM HANGAR', hangarSx, floor - 180);
      scCtx.shadowBlur = 0;
    }
  }

  // ── COSMIC ARMILLARY ──
  var armSx = ox + SC_ARMILLARY_X;
  if (armSx > -300 && armSx < W+300) {
    scDrawArmillary(armSx, floor, scDraw._t||0);
    if (scNearArmillary) {
      scCtx.font = '11px Courier New'; scCtx.textAlign = 'center';
      scCtx.fillStyle = 'rgba(180,100,255,0.95)';
      scCtx.shadowColor = '#AA44FF'; scCtx.shadowBlur = 12;
      scCtx.fillText('[E] COSMIC ARMILLARY — Planet Portal', armSx, floor - 200);
      scCtx.shadowBlur = 0;
    }
  }

  // ── SANCTUM SIGN ──
  var signSx = ox + SC_WORLD_W/2;
  scCtx.font = 'bold 11px Courier New'; scCtx.textAlign = 'center';
  scCtx.fillStyle = 'rgba(100,180,255,0.35)';
  scCtx.fillText('THE SANCTUM', signSx, 40);

  // ── OTHER PLAYERS ──
  Object.values(scOtherPlayers).forEach(function(op) {
    if (op.username === window._myUsername) return;
    var opSx = ox + op.x;
    if (opSx < -80 || opSx > W+80) return;
    scDrawMech(opSx, floor, op.facing||1, 'rgba(0,180,255,0.7)', 0.7);
    scCtx.font = '10px Courier New'; scCtx.textAlign = 'center';
    scCtx.fillStyle = 'rgba(150,220,255,0.7)';
    scCtx.fillText(op.username||'', opSx, floor-85);
    // Chat bubble
    if (op.chatMsg && Date.now()-op.chatTime < 4000) {
      scCtx.font = '10px Courier New';
      scCtx.fillStyle = 'rgba(255,255,255,0.85)';
      scCtx.fillText(op.chatMsg, opSx, floor-100);
    }
  });

  // ── LOCAL PLAYER ──
  var playerColor = 'rgba(0,255,180,0.9)';
  var _psx = scPlayer.x - scCamera.x; // actual screen position
  scDrawMech(_psx, floor + scPlayer.y, scPlayer.facing, playerColor, 1.0);
  // Local player nametag
  scCtx.font = 'bold 10px Courier New'; scCtx.textAlign = 'center';
  scCtx.fillStyle = 'rgba(0,255,180,0.9)';
  scCtx.shadowColor = 'rgba(0,255,180,0.4)'; scCtx.shadowBlur = 6;
  scCtx.fillText(window._myUsername||'', _psx, floor + scPlayer.y - 90);
  scCtx.shadowBlur = 0;

  // ── HUD ──
  scCtx.fillStyle = 'rgba(0,5,20,0.7)';
  scCtx.fillRect(0, 0, 200, 36);
  scCtx.font = '10px Courier New'; scCtx.textAlign = 'left';
  scCtx.fillStyle = 'rgba(0,200,255,0.6)';
  scCtx.fillText('THE SANCTUM', 10, 22);



  scDraw._t = (scDraw._t||0)+1;
}

// ── MECH SILHOUETTE RENDERER ──────────────────────────────────────────────────
function scDrawMech(x, floor, facing, color, alpha) {
  scCtx.save();
  scCtx.globalAlpha = alpha;
  scCtx.fillStyle = color;
  scCtx.strokeStyle = color;
  scCtx.shadowColor = color;
  scCtx.shadowBlur = 10;
  scCtx.scale(facing, 1);
  var rx = facing === 1 ? x : -x;

  var legH=22, bodyH=28, headH=18, shoulderW=28;
  var bodyY = floor-legH-bodyH;

  // Legs
  scCtx.fillRect(rx-10, floor-legH, 8, legH); // left leg
  scCtx.fillRect(rx+2,  floor-legH, 8, legH); // right leg
  // Feet
  scCtx.fillRect(rx-13, floor-4, 12, 5);
  scCtx.fillRect(rx+1,  floor-4, 12, 5);
  // Body
  scCtx.fillRect(rx-shoulderW/2, bodyY, shoulderW, bodyH);
  // Shoulders
  scCtx.fillRect(rx-shoulderW/2-6, bodyY, 7, 14);
  scCtx.fillRect(rx+shoulderW/2-1, bodyY, 7, 14);
  // Head
  scCtx.fillRect(rx-9, bodyY-headH, 18, headH);
  // Visor/eyes
  scCtx.fillStyle = 'rgba(0,255,255,0.9)';
  scCtx.fillRect(rx-7, bodyY-headH+5, 5, 4);
  scCtx.fillRect(rx+2,  bodyY-headH+5, 5, 4);
  // Antenna
  scCtx.lineWidth = 2;
  scCtx.beginPath();
  scCtx.moveTo(rx+3, bodyY-headH);
  scCtx.lineTo(rx+3, bodyY-headH-10);
  scCtx.stroke();
  scCtx.beginPath();
  scCtx.arc(rx+3, bodyY-headH-12, 3, 0, Math.PI*2);
  scCtx.fill();
  // Jetpack
  scCtx.fillStyle = color;
  scCtx.fillRect(rx-shoulderW/2-2, bodyY+4, 5, 18);

  scCtx.restore();
}

// ── DR. ZOIDBERG RENDERER ─────────────────────────────────────────────────────
function scDrawZoidberg(x, floor, t) {
  scCtx.save();
  var bob = Math.sin(t*0.05)*4;
  // Tentacles
  for (var i=0; i<4; i++) {
    var ta = (i-1.5)*0.3 + Math.sin(t*0.08+i)*0.15;
    scCtx.strokeStyle = 'rgba(200,80,0,0.8)';
    scCtx.lineWidth = 3;
    scCtx.beginPath();
    scCtx.moveTo(x, floor-20);
    scCtx.lineTo(x+Math.cos(ta+Math.PI/2)*30, floor-20+30+Math.sin(t*0.1+i)*5);
    scCtx.stroke();
  }
  // Body
  scCtx.fillStyle = 'rgba(180,60,0,0.9)';
  scCtx.beginPath(); scCtx.ellipse(x, floor-50+bob, 22, 28, 0, 0, Math.PI*2); scCtx.fill();
  // Claws
  scCtx.strokeStyle = 'rgba(200,80,0,0.8)'; scCtx.lineWidth=2;
  scCtx.beginPath(); scCtx.moveTo(x-22,floor-55+bob); scCtx.lineTo(x-38,floor-48+bob); scCtx.stroke();
  scCtx.beginPath(); scCtx.moveTo(x+22,floor-55+bob); scCtx.lineTo(x+38,floor-48+bob); scCtx.stroke();
  // Head
  scCtx.fillStyle = 'rgba(200,70,0,0.95)';
  scCtx.beginPath(); scCtx.ellipse(x, floor-84+bob, 18, 16, 0, 0, Math.PI*2); scCtx.fill();
  // Eyes
  scCtx.fillStyle = '#FFFFFF';
  scCtx.beginPath(); scCtx.ellipse(x-7,floor-88+bob,4,5,0,0,Math.PI*2); scCtx.fill();
  scCtx.beginPath(); scCtx.ellipse(x+7,floor-88+bob,4,5,0,0,Math.PI*2); scCtx.fill();
  scCtx.fillStyle = '#111';
  scCtx.beginPath(); scCtx.arc(x-7,floor-87+bob,2,0,Math.PI*2); scCtx.fill();
  scCtx.beginPath(); scCtx.arc(x+7,floor-87+bob,2,0,Math.PI*2); scCtx.fill();
  // Beak
  scCtx.fillStyle = 'rgba(255,140,0,0.9)';
  scCtx.beginPath(); scCtx.moveTo(x-8,floor-80+bob); scCtx.lineTo(x+8,floor-80+bob); scCtx.lineTo(x,floor-72+bob); scCtx.closePath(); scCtx.fill();
  // Name
  scCtx.font = 'bold 10px Courier New'; scCtx.textAlign='center';
  scCtx.fillStyle='rgba(255,140,0,0.8)'; scCtx.shadowColor='#FF8800'; scCtx.shadowBlur=6;
  scCtx.fillText('DR. ZOIDBERG', x, floor-110+bob);
  scCtx.shadowBlur=0;
  scCtx.restore();
}

// ── GUNDAM HANGAR RENDERER ────────────────────────────────────────────────────
function scDrawHangar(x, floor) {
  scCtx.save();
  var hw=120, hh=160;
  // Building
  scCtx.fillStyle='rgba(5,15,35,0.9)';
  scCtx.fillRect(x-hw, floor-hh, hw*2, hh);
  scCtx.strokeStyle='rgba(255,160,0,0.6)'; scCtx.lineWidth=2;
  scCtx.strokeRect(x-hw, floor-hh, hw*2, hh);
  // Door
  scCtx.fillStyle='rgba(255,140,0,0.15)';
  scCtx.fillRect(x-25, floor-60, 50, 60);
  scCtx.strokeStyle='rgba(255,140,0,0.7)'; scCtx.lineWidth=2;
  scCtx.strokeRect(x-25, floor-60, 50, 60);
  // Glow lines on door
  scCtx.strokeStyle='rgba(255,160,0,0.4)'; scCtx.lineWidth=1;
  for(var i=1;i<4;i++){
    scCtx.beginPath(); scCtx.moveTo(x-25+i*12,floor-60); scCtx.lineTo(x-25+i*12,floor); scCtx.stroke();
  }
  // Sign
  scCtx.font='bold 11px Courier New'; scCtx.textAlign='center';
  scCtx.fillStyle='rgba(255,160,0,0.9)'; scCtx.shadowColor='#FF8800'; scCtx.shadowBlur=10;
  scCtx.fillText('GUNDAM HANGAR', x, floor-hh+18);
  scCtx.font='9px Courier New';
  scCtx.fillStyle='rgba(255,140,0,0.5)';
  scCtx.fillText('BUILD YOUR MECH', x, floor-hh+32);
  scCtx.shadowBlur=0;
  scCtx.restore();
}

// ── INPUT ─────────────────────────────────────────────────────────────────────
function scKeyDown(e) {
  if (!sanctumActive) return;
  if (window._ddsActive) return;
  if (window.shipMenuOpen) return; // ship menu handles its own keys
  scKeys[e.code] = true;
  if (e.code === 'KeyE') {
    if (scNearNpc)       { SC_SKT()?.emit('sanctum:talkZoidberg', {}); SC_SKT()?.emit('gundam:talkZoidberg'); }
    if (scNearHangar)    { openGundamHangar(); }
    if (scNearArmillary) { openArmillary(); }
  }
  if (e.code === 'Escape') {
    e.stopPropagation();
    // Close any open menus first, only leave if nothing to close
    if (window.shipMenuOpen) { window.closeShipMenu && window.closeShipMenu(); return; }
    var _ov = document.getElementById('scGundamHangar'); if (_ov) { _ov.remove(); return; }
    // ESC in sanctum -- don't leave
    // Exit via Places menu -> Return to Earth, or Dimensional Battlefield
  }
}



// ── SOCKET HANDLERS ───────────────────────────────────────────────────────────
function scOnState(d) {
  (d.players||[]).forEach(function(p) {
    if (p.username === window._myUsername) return;
    scOtherPlayers[p.socketId] = p;
  });
}
function scOnPlayerMove(d) {
  if (d.username === window._myUsername) return;
  if (!scOtherPlayers[d.socketId]) scOtherPlayers[d.socketId] = { username: d.username };
  scOtherPlayers[d.socketId].x = d.x;
  scOtherPlayers[d.socketId].facing = d.facing||1;
}
function scOnPlayerLeft(d) { delete scOtherPlayers[d.socketId]; }
function scOnChat(d) {
  if (d.socketId && scOtherPlayers[d.socketId]) {
    scOtherPlayers[d.socketId].chatMsg = d.msg;
    scOtherPlayers[d.socketId].chatTime = Date.now();
  }
}
// Also handle gundam:zoidbergMsg for DM bonus
function scOnGundamZoidberg(d) {
  scOnZoidbergMsg(d);
  if (d.bonus && d.bonus > 0) {
    window._scDarkMatter = d.darkMatter || 0;
    scUpdateDMHUD();
    var flash = document.createElement('div');
    flash.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);'
      +'background:rgba(5,10,30,0.97);border:2px solid rgba(100,200,255,0.6);border-radius:14px;'
      +'padding:24px 36px;z-index:500;font-family:Courier New,monospace;text-align:center;pointer-events:none;';
    flash.innerHTML = '<div style="color:#44CCFF;font-size:20px;font-weight:bold;margin-bottom:6px;">'
      +'+'+d.bonus.toLocaleString()+' DARK MATTER</div>'
      +'<div style="color:rgba(150,220,255,0.6);font-size:11px;">Welcome gift from Dr. Zoidberg</div>';
    document.body.appendChild(flash);
    setTimeout(function(){ flash.remove(); }, 4000);
  }
}
function scOnZoidbergMsg(d) {
  // Show Zoidberg dialog
  var dlg = document.createElement('div');
  dlg.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);'
    +'background:rgba(5,10,30,0.96);border:2px solid rgba(255,140,0,0.6);border-radius:14px;'
    +'padding:18px 28px;z-index:500;font-family:Courier New,monospace;text-align:center;max-width:420px;';
  dlg.innerHTML = '<div style="color:rgba(255,140,0,0.9);font-size:13px;font-weight:bold;margin-bottom:8px;">DR. ZOIDBERG</div>'
    +'<div style="color:rgba(200,220,255,0.8);font-size:12px;line-height:1.6;">'+d.msg+'</div>';
  document.body.appendChild(dlg);
  setTimeout(function(){ dlg.remove(); }, 6000);
}

// ── GUNDAM HANGAR UI ──────────────────────────────────────────────────────────
function openGundamHangar() {
  if (window._scInteractHint) window._scInteractHint.style.display='none';
  if (typeof window._openGundamMenu === 'function') window._openGundamMenu();
  // Restore hint when menu closes
  var _hintCheck = setInterval(function(){
    if (!document.getElementById('shipMenu') && !document.getElementById('scGundamHangar')) {
      clearInterval(_hintCheck);
      if (window._scInteractHint && scNearHangar) window._scInteractHint.style.display='block';
    }
  }, 300);
}

// ── MOBILE CONTROLS ───────────────────────────────────────────────────────────
function scInitMobileControls() {
  if (window.innerWidth >= 900) return;
  if (document.getElementById('scMobileCtrl')) return;
  // Joystick on scCanvas -- same pattern as DDS
  var _scJoyT = {active:false, id:null, startX:0, startY:0};
  scCanvas.addEventListener('touchstart', function(e) {
    if (window._ddsActive) return;
    for (var i=0;i<e.changedTouches.length;i++) {
      var t=e.changedTouches[i];
      if (t.clientX < window.innerWidth*0.45 && !_scJoyT.active) {
        _scJoyT = {active:true, id:t.identifier, startX:t.clientX, startY:t.clientY};
        e.preventDefault();
      }
    }
  }, {passive:false});
  scCanvas.addEventListener('touchmove', function(e) {
    if (window._ddsActive) return;
    for (var i=0;i<e.changedTouches.length;i++) {
      var t=e.changedTouches[i];
      if (t.identifier===_scJoyT.id) {
        var dx=(t.clientX-_scJoyT.startX)/55;
        window._joystickDelta={x:Math.max(-1,Math.min(1,dx)),y:0};
        window._scMoveLeft  = dx < -0.2;
        window._scMoveRight = dx >  0.2;
        e.preventDefault();
      }
    }
  }, {passive:false});
  scCanvas.addEventListener('touchend', function(e) {
    for (var i=0;i<e.changedTouches.length;i++) {
      if (e.changedTouches[i].identifier===_scJoyT.id) {
        _scJoyT.active=false;
        window._joystickDelta={x:0,y:0};
        window._scMoveLeft=false; window._scMoveRight=false;
      }
    }
  }, {passive:false});
  // Interact hint
  var _h=document.createElement('div');
  _h.id='scInteractHint';
  _h.style.cssText='position:fixed;bottom:140px;left:50%;transform:translateX(-50%);'
    +'background:rgba(0,8,22,0.85);color:rgba(0,180,255,0.85);font-family:Courier New,monospace;'
    +'font-size:13px;font-weight:bold;padding:10px 22px;border-radius:12px;z-index:820;'
    +'pointer-events:auto;border:1px solid rgba(0,150,255,0.25);display:none;cursor:pointer;';
  function _scDoInteract(){
    if(scNearHangar) openGundamHangar();
    else if(scNearNpc){ SC_SKT()&&SC_SKT().emit('sanctum:talkZoidberg',{}); SC_SKT()&&SC_SKT().emit('gundam:talkZoidberg'); }
    else if(scNearArmillary) openArmillary();
  }
  _h.addEventListener('touchend',function(e){e.preventDefault();_scDoInteract();},{passive:false});
  _h.addEventListener('click',_scDoInteract);
  document.body.appendChild(_h);
  window._scInteractHint=_h;
}
function scRemoveMobileControls() {
  // scJoyCanvas removed -- using main joystick
  window._scMoveLeft=false; window._scMoveRight=false;
  document.getElementById('scInteractHint')?.remove();
  window._scInteractHint=null;
  window._scMoveLeft=false; window._scMoveRight=false;
}

// ── DARK MATTER HUD ──────────────────────────────────────────────────────────
window._scDarkMatter = 0;
function scInitDMHUD() {
  var old = document.getElementById('scDMHUD'); if (old) old.remove();
  var hud = document.createElement('div');
  hud.id = 'scDMHUD';
  hud.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);'
    +'background:rgba(0,8,22,0.82);border:1px solid rgba(0,200,255,0.3);border-radius:20px;'
    +'padding:8px 22px;font-family:Courier New,monospace;font-size:14px;font-weight:bold;'
    +'color:#44CCFF;letter-spacing:0.1em;z-index:421;pointer-events:none;'
    +'backdrop-filter:blur(8px);text-shadow:0 0 12px rgba(0,200,255,0.4);';
  hud.textContent = '◈ ...';
  document.body.appendChild(hud);
}
function scUpdateDMHUD() {
  var el = document.getElementById('scDMHUD');
  if (el) el.textContent = '◈ ' + Math.floor(window._scDarkMatter||0).toLocaleString() + ' Dark Matter';
}

// Hangar opened via E key near hangar building -- no button needed

// ── MUSIC ─────────────────────────────────────────────────────────────────────
var scMusicEl = null;
function scStartMusic() {
  if (scMusicEl) return;
  scMusicEl = new Audio('/music1.mp3');
  scMusicEl.loop=true; scMusicEl.volume=0;
  scMusicEl.play().then(function(){
    var v=0; var fi=setInterval(function(){v=Math.min(v+0.01,0.2);scMusicEl.volume=v;if(v>=0.2)clearInterval(fi);},100);
  }).catch(function(){});
}
function scStopMusic() {
  if (!scMusicEl) return;
  var fi=setInterval(function(){scMusicEl.volume=Math.max(0,scMusicEl.volume-0.01);if(scMusicEl.volume<=0){scMusicEl.pause();scMusicEl=null;clearInterval(fi);}},60);
}

// ── DIMENSIONAL BATTLEFIELD UNDOCK ──────────────────────────────────────────────
function scInitUndockBtn() {
  var old = document.getElementById('scUndockBtn'); if (old) old.remove();
  var btn = document.createElement('div');
  btn.id = 'scUndockBtn';
  btn.style.cssText = 'position:fixed;top:80px;left:16px;padding:10px 16px;'
    +'background:rgba(10,0,25,0.85);border:1px solid rgba(150,0,255,0.5);'
    +'border-radius:12px;color:rgba(180,100,255,0.9);font-family:Courier New,monospace;'
    +'font-size:12px;font-weight:bold;letter-spacing:0.1em;cursor:pointer;'
    +'user-select:none;z-index:421;backdrop-filter:blur(8px);'
    +'display:flex;align-items:center;gap:8px;transition:border-color 0.15s;';
  btn.innerHTML = '<span style="font-size:16px;">⚡</span> BATTLEFIELD';
  btn.addEventListener('mouseover', function(){ btn.style.borderColor='rgba(200,100,255,0.8)'; });
  btn.addEventListener('mouseout',  function(){ btn.style.borderColor='rgba(150,0,255,0.5)'; });
  btn.addEventListener('click', function() {
    var sd = window._shipMenuData;
    var activeGundam = sd && sd.ships && sd.ships.find(function(g){ return g.id === sd.activeShipId; });
    if (!activeGundam) {
      window._mineShowNotification && window._mineShowNotification('No active Gundam — build one in the Hangar first.');
      return;
    }
    btn.innerHTML = '<span style="font-size:16px;">⚡</span> DEPLOYING...';
    btn.style.pointerEvents = 'none';
    SC_SKT()?.emit('gundam:undock', { gundamId: activeGundam.id });
    var _timeout = setTimeout(function() {
      btn.innerHTML = '<span style="font-size:16px;">⚡</span> BATTLEFIELD';
      btn.style.pointerEvents = '';
      window._mineShowNotification && window._mineShowNotification('Server timeout — try again.');
    }, 5000);
    SC_SKT()?.once('gundam:undockConfirmed', function(data) {
      clearTimeout(_timeout);
      btn.innerHTML = '<span style="font-size:16px;">⚡</span> BATTLEFIELD';
      btn.style.pointerEvents = '';
      console.log('[Sanctum] Deploying into Dimensional Battlefield with', data.gundam && data.gundam.name);
      // TODO: load deep deep space module
      window._mineShowNotification && window._mineShowNotification('Deploying ' + (data.gundam && data.gundam.name || 'Gundam') + '...');
    });
  });
  btn.addEventListener('touchend', function(e){
    e.preventDefault(); btn.click();
  }, {passive:false});
  document.body.appendChild(btn);
}

// ── SANCTUM PLACES MENU ──────────────────────────────────────────────────────
function buildSanctumPlacesMenu() {
  document.getElementById('scPlacesBtn')?.remove();
  document.getElementById('scPlacesList')?.remove();
  // Hide earth places button
  if (window._earthPlacesBtn) window._earthPlacesBtn.style.display = 'none';
  var earthPlacesBtn = [...document.querySelectorAll('div')].find(function(d){
    return d.textContent?.trim() === 'Places' && !d.id?.startsWith('sc') && !d.id?.startsWith('st');
  });
  if (earthPlacesBtn) { earthPlacesBtn.style.display = 'none'; window._scHiddenPlacesBtn = earthPlacesBtn; }
  var items = [
    { label: '🌍 Return to Earth', action: function(){ window.leaveSanctum(); } },
  ];
  var list = document.createElement('div');
  list.id = 'scPlacesList';
  list.style.cssText = 'position:fixed;bottom:70px;right:20px;background:rgba(0,0,0,0.85);border:1px solid rgba(255,255,255,0.2);border-radius:14px;overflow:hidden;display:none;z-index:421;min-width:180px;backdrop-filter:blur(12px);';
  items.forEach(function(item) {
    var el = document.createElement('div');
    el.textContent = item.label;
    el.style.cssText = 'padding:12px 18px;color:white;font-family:sans-serif;font-size:14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.08);transition:background 0.15s;';
    el.addEventListener('mouseover', function(){ el.style.background='rgba(255,255,255,0.15)'; });
    el.addEventListener('mouseout',  function(){ el.style.background='transparent'; });
    el.addEventListener('click', function(){ list.style.display='none'; btn.dataset.open='0'; item.action(); });
    el.addEventListener('touchend', function(e){ e.preventDefault(); list.style.display='none'; btn.dataset.open='0'; item.action(); }, {passive:false});
    list.appendChild(el);
  });
  var btn = document.createElement('div');
  btn.id = 'scPlacesBtn';
  btn.textContent = 'Places';
  btn.dataset.open = '0';
  btn.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:10px 18px;background:rgba(0,0,0,0.55);border:2px solid rgba(255,255,255,0.35);border-radius:12px;color:white;font-family:sans-serif;font-size:14px;font-weight:bold;cursor:pointer;user-select:none;z-index:421;backdrop-filter:blur(8px);';
  btn.addEventListener('click', function(){
    var open = btn.dataset.open === '1';
    btn.dataset.open = open ? '0' : '1';
    list.style.display = open ? 'none' : 'block';
  });
  document.body.appendChild(list);
  document.body.appendChild(btn);
}
function restoreSanctumPlaces() {
  document.getElementById('scPlacesBtn')?.remove();
  document.getElementById('scPlacesList')?.remove();
  if (window._scHiddenPlacesBtn) { window._scHiddenPlacesBtn.style.display = ''; window._scHiddenPlacesBtn = null; }
}

// ── PLACES MENU INJECTION ─────────────────────────────────────────────────────
function injectSanctumTeleport() {
  function tryInject() {
    if (!window._earthPlacesMenuList) { setTimeout(tryInject,300); return; }
    if (document.getElementById('scTeleportItem')) return;
    var item = document.createElement('div');
    item.id = 'scTeleportItem';
    item.textContent = '🌌 The Sanctum';
    item.style.cssText = 'padding:11px 18px;color:#88AAFF;font-family:sans-serif;font-size:14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.08);transition:background 0.15s;';
    item.addEventListener('mouseover', function(){ item.style.background='rgba(255,255,255,0.15)'; });
    item.addEventListener('mouseout',  function(){ item.style.background='transparent'; });
    var go = function(){ window._closePlacesMenu?.(); window.enterSanctum?.(); };
    item.addEventListener('click',    go);
    item.addEventListener('touchend', go);
    window._earthPlacesMenuList.appendChild(item);
  }
  tryInject();
}

// ── ENTRY POINT ───────────────────────────────────────────────────────────────
// Called from deepspace:enterSerenityResult when granted
window._sanctumReady = true;
console.log('[Sanctum] Module loaded');
// Inject sanctum teleport -- wire socket events as soon as socket is ready
(function() {
  function wireSanctumTeleport() {
    var skt = window._mineGetSocket && window._mineGetSocket();
    if (!skt) { setTimeout(wireSanctumTeleport, 300); return; }
    // sanctum:visited fires right after login -- server sends it with space:unlockStatus
    skt.on('sanctum:visited', function() {
      window._sanctumVisited = true;
      injectSanctumTeleport();
    });
    // ship:data fires when player opens ship terminal or enters station
    // sanctumVisited is included in this payload
    skt.on('ship:data', function(d) {
      if (d && d.sanctumVisited) {
        window._sanctumVisited = true;
        injectSanctumTeleport();
      }
    });
  }
  wireSanctumTeleport();
})();

// ── DRAW COSMIC ARMILLARY ─────────────────────────────────────────────────────
function scDrawArmillary(x, floor, t) {
  var ctx = scCtx;
  var cy = floor - 120;
  var pulse = 0.6 + Math.sin(t*1.8)*0.4;
  var spin1 = t*0.6, spin2 = t*0.9, spin3 = -t*0.4;

  ctx.save();

  // Base pillar
  ctx.fillStyle = 'rgba(60,0,100,0.9)';
  ctx.fillRect(x-8, floor-40, 16, 40);
  ctx.fillStyle = 'rgba(100,20,180,0.8)';
  ctx.fillRect(x-20, floor-8, 40, 8);

  // Glow core -- spinning planet
  ctx.shadowColor = '#AA44FF'; ctx.shadowBlur = 20*pulse;
  ctx.beginPath(); ctx.arc(x, cy, 18, 0, Math.PI*2);
  var cg = ctx.createRadialGradient(x,cy,0,x,cy,18);
  cg.addColorStop(0,'rgba(200,100,255,0.9)');
  cg.addColorStop(1,'rgba(80,0,180,0.3)');
  ctx.fillStyle = cg; ctx.fill();
  ctx.shadowBlur = 0;

  // Ring 1 -- tilted
  ctx.save(); ctx.translate(x,cy); ctx.rotate(spin1);
  ctx.scale(1, 0.35);
  ctx.beginPath(); ctx.arc(0,0,44,0,Math.PI*2);
  ctx.strokeStyle='rgba(180,80,255,'+(0.5+pulse*0.4)+')'; ctx.lineWidth=2; ctx.stroke();
  ctx.restore();

  // Ring 2 -- different tilt
  ctx.save(); ctx.translate(x,cy); ctx.rotate(spin2);
  ctx.scale(0.4, 1);
  ctx.beginPath(); ctx.arc(0,0,52,0,Math.PI*2);
  ctx.strokeStyle='rgba(120,60,255,'+(0.4+pulse*0.3)+')'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.restore();

  // Ring 3 -- equatorial
  ctx.save(); ctx.translate(x,cy); ctx.rotate(spin3);
  ctx.beginPath(); ctx.arc(0,0,58,0,Math.PI*2);
  ctx.strokeStyle='rgba(200,120,255,'+(0.3+pulse*0.25)+')'; ctx.lineWidth=1; ctx.stroke();
  ctx.restore();

  // Stars orbiting
  for (var si=0; si<5; si++) {
    var sa = spin1*1.5 + si*(Math.PI*2/5);
    var sx2 = x + Math.cos(sa)*44;
    var sy2 = cy + Math.sin(sa)*44*0.35;
    ctx.beginPath(); ctx.arc(sx2,sy2,2,0,Math.PI*2);
    ctx.fillStyle='rgba(220,180,255,0.9)'; ctx.fill();
  }

  // Label
  ctx.font = 'bold 10px Courier New'; ctx.textAlign='center';
  ctx.fillStyle='rgba(180,100,255,0.8)';
  ctx.fillText('COSMIC ARMILLARY', x, floor-8);
  ctx.font = '8px Courier New';
  ctx.fillStyle='rgba(140,80,220,0.6)';
  ctx.fillText('Planet Portal', x, floor+4);

  ctx.restore();
}

// ── OPEN ARMILLARY (Planet Menu) ──────────────────────────────────────────────
function openArmillary() {
  if (document.getElementById('scArmillaryMenu')) return;
  // If player already owns a planet, go straight there
  SC_SKT()?.emit('planet:get');
  var _checkOwn = function(d){
    SC_SKT()?.off('planet:state', _checkOwn);
    SC_SKT()?.off('planet:none', _checkNone);
    if (typeof window.openPlanetClient === 'function') window.openPlanetClient();
  };
  var _checkNone = function(){
    SC_SKT()?.off('planet:state', _checkOwn);
    SC_SKT()?.off('planet:none', _checkNone);
    _openArmillaryMenu();
  };
  SC_SKT()?.once('planet:state', _checkOwn);
  SC_SKT()?.once('planet:none',  _checkNone);
}
function _openArmillaryMenu() {
  if (document.getElementById('scArmillaryMenu')) return;
  var sd = window._shipMenuData;
  var planetDM = sd && sd.planetDM || 0;

  var ov = document.createElement('div');
  ov.id = 'scArmillaryMenu';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(8,0,18,0.96);z-index:900;'
    +'display:flex;flex-direction:column;align-items:center;justify-content:center;'
    +'font-family:Courier New,monospace;color:#CC88FF;';

  ov.innerHTML = '<div style="max-width:420px;width:90%;text-align:center;">'
    +'<div style="font-size:28px;margin-bottom:8px;">✦</div>'
    +'<div style="font-size:18px;font-weight:bold;color:#EE99FF;letter-spacing:0.12em;margin-bottom:4px;">COSMIC ARMILLARY</div>'
    +'<div style="font-size:11px;color:#8855BB;margin-bottom:24px;letter-spacing:0.08em;">DIMENSIONAL PLANET PORTAL</div>'
    +'<div style="background:rgba(40,0,80,0.8);border:1px solid rgba(150,50,255,0.4);border-radius:12px;padding:20px;margin-bottom:20px;">'
    +'<div style="font-size:12px;color:#AA77DD;line-height:1.7;">'
    +'Invest <span style="color:#FF88FF;font-weight:bold;">10,000,000 Dark Matter</span> to claim a patch of dimensional space and begin growing your own planet.<br><br>'
    +'Your planet starts as a raw asteroid. Collect <span style="color:#00FFFF;">Water of Life</span> from DDS fountains. Pour it. Watch it evolve.<br><br>'
    +'At full size your planet materializes in DDS — visible, raidable, yours.'
    +'</div></div>'
    +'<div style="font-size:11px;color:#8855BB;margin-bottom:16px;">Planet DM Balance: <span id="armDMBal" style="color:#CC88FF;">'+planetDM.toLocaleString()+'</span></div>'
    +'<div style="display:flex;gap:12px;justify-content:center;">'
    +'<div id="armCreateBtn" style="padding:12px 28px;background:rgba(80,0,140,0.9);border:2px solid #AA44FF;border-radius:10px;'
    +'color:#EE99FF;font-size:13px;font-weight:bold;cursor:pointer;letter-spacing:0.08em;">✦ CREATE PLANET</div>'
    +'<div id="armViewBtn" style="padding:12px 28px;background:rgba(40,0,80,0.9);border:2px solid #7733BB;border-radius:10px;'
    +'color:#AA77DD;font-size:13px;cursor:pointer;">VIEW PLANET</div>'
    +'<div id="armCloseBtn" style="padding:12px 20px;background:rgba(20,0,40,0.9);border:1px solid rgba(100,50,150,0.4);border-radius:10px;'
    +'color:#664488;font-size:13px;cursor:pointer;">✕</div>'
    +'</div></div>';

  document.body.appendChild(ov);

  document.getElementById('armCloseBtn').addEventListener('click', function(){ ov.remove(); });
  document.getElementById('armCloseBtn').addEventListener('touchend', function(e){ e.preventDefault(); ov.remove(); }, {passive:false});

  document.getElementById('armCreateBtn').addEventListener('click', function(){
    var pname = prompt('Name your planet (this is permanent):','');
    if (!pname||!pname.trim()) return;
    SC_SKT()?.emit('planet:create', {name:pname.trim()});
    ov.remove();
  });
  document.getElementById('armCreateBtn').addEventListener('touchend', function(e){
    e.preventDefault();
    var pname = prompt('Name your planet (this is permanent):','');
    if (!pname||!pname.trim()) return;
    SC_SKT()?.emit('planet:create', {name:pname.trim()});
    ov.remove();
  }, {passive:false});

  document.getElementById('armViewBtn').addEventListener('click', function(){
    ov.remove();
    if (typeof window.openPlanetClient === 'function') window.openPlanetClient();
  });
  document.getElementById('armViewBtn').addEventListener('touchend', function(e){
    e.preventDefault(); ov.remove();
    if (typeof window.openPlanetClient === 'function') window.openPlanetClient();
  },{passive:false});
  document.getElementById('armViewBtn').addEventListener('touchend', function(e){
    e.preventDefault(); ov.remove(); SC_SKT()?.emit('planet:get');
  }, {passive:false});

  // Listen for planet:created or planet:error
  var _skt = SC_SKT();
  if (_skt) {
    _skt.once('planet:created', function(d){
      alert('✦ Planet created in zone '+d.zone+'! Head to DDS to collect Water of Life.');
    });
    _skt.once('planet:error', function(d){
      alert('Error: '+d);
    });
  }
}
