// deepspace-client.js -- APLabs Deep Space Zone
// 5x5 grid system. Built on space-client.js movement/rendering foundation.
// Coordinate: zone.n = north axis (1-5), zone.e = east axis (1-5)
// Player starts at 1-1 (south-west corner)

const DSKT    = () => window._mineGetSocket?.();
const DUSR    = () => window._mineGetUsername?.() || 'Pilot';
const DNOTIFY = (msg) => window._mineShowNotification?.(msg);

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const DS_WORLD  = 4000;
const DS_CENTER = DS_WORLD / 2;
const DS_EDGE   = 120;      // distance from edge triggers zone transition
const DS_LIGHT  = window.innerWidth < 768 ? 180 : 220;
const DS_AMBIENT= window.innerWidth < 768 ? 280 : 340;

// ── FACTIONS ──────────────────────────────────────────────────────────────────
const FACTIONS = {
  verus: {
    id: 'verus', name: 'Verus Prime',
    color: '#FF3333', accentColor: '#FF9900',
    desc: 'Corporate militarized. Suspicious of outsiders.',
    hqZone: { n:3, e:5 }, mineZone: { n:4, e:5 }, forgeAccess: { n:3, e:4 },
    researchLevel: 20, rep: 0, hostility: 0,
  },
  slv: {
    id: 'slv', name: 'Scientific Liberators Vanguard',
    color: '#44FF88', accentColor: '#00FFCC',
    desc: 'Academic, neutral. Earn trust through missions.',
    hqZone: { n:3, e:1 }, mineZone: { n:3, e:2 }, forgeAccess: { n:3, e:2 },
    researchLevel: 20, rep: 0, hostility: 0,
  },
  omig: {
    id: 'omig', name: 'Omigolation',
    color: '#AA44FF', accentColor: '#FF44AA',
    desc: 'Alien-influenced, eccentric. Trade-friendly.',
    hqZone: { n:2, e:3 }, mineZone: { n:2, e:4 }, forgeAccess: { n:3, e:3 },
    researchLevel: 20, rep: 0, hostility: 0,
  },
  pirates: {
    id: 'pirates', name: 'Void Reavers',
    color: '#FF6600', accentColor: '#FF2200',
    desc: 'Outlaws. Will attack mining routes. Buy tech if allied.',
    hqZone: { n:1, e:5 }, mineZone: null, forgeAccess: null,
    researchLevel: 15, rep: -50, hostility: 50,
  },
};

// Hostility: 0=neutral, 1-49=cautious, 50-99=hostile, 100=WAR (permanent)
// +10 per guard killed, decays 1pt/minute (10min per kill)
var dsHostilityDecayInterval = null;

function dsGetHostility(factionId) {
  return (FACTIONS[factionId] && FACTIONS[factionId].hostility) || 0;
}

function dsAddHostility(factionId, amount) {
  var f = FACTIONS[factionId]; if (!f) return;
  if (f.hostility >= 100) return; // already at war
  f.hostility = Math.min(100, (f.hostility||0) + amount);
  f.rep = -f.hostility; // sync rep

  var label = f.hostility >= 100 ? 'WAR' : f.hostility >= 50 ? 'HOSTILE' : f.hostility >= 20 ? 'CAUTIOUS' : 'NEUTRAL';
  var color = f.hostility >= 100 ? '#FF0000' : f.hostility >= 50 ? '#FF4400' : f.hostility >= 20 ? '#FF8800' : '#44FF88';

  if (f.hostility >= 100) {
    DNOTIFY('⚠ WAR DECLARED: ' + f.name + ' will hunt you on sight. Forever.');
    DSKT()?.emit('faction:hostilityUpdate', { faction: factionId, hostility: 100, war: true });
  } else {
    DNOTIFY('[' + f.name + '] Standing: ' + label + ' (' + f.hostility + '/100)');
    DSKT()?.emit('faction:hostilityUpdate', { faction: factionId, hostility: f.hostility });
  }

  // Save to server
  DSKT()?.emit('faction:setHostility', { faction: factionId, hostility: f.hostility });
}

function dsDecayHostility(dt) {
  Object.values(FACTIONS).forEach(function(f) {
    if (!f.hostility || f.hostility >= 100) return; // 100 = permanent war, no decay
    f.hostility = Math.max(0, f.hostility - dt * (1/600)); // 1pt per 10min
    f.rep = -Math.round(f.hostility);
  });
}

function dsIsHostile(factionId) {
  var h = dsGetHostility(factionId);
  return h >= 50 || factionId === 'pirates';
}

function dsIsWar(factionId) {
  return dsGetHostility(factionId) >= 100;
}

// Zone content definition
const ZONE_CONTENT = {
  '3-3': { type: 'starforge', name: 'Star Forge', danger: 0 },
  '3-5': { type: 'faction_hq', faction: 'verus', danger: 3 },
  '4-5': { type: 'faction_mine', faction: 'verus', danger: 3 },
  '3-4': { type: 'faction_forge', faction: 'verus', name: 'VP Forge Access', danger: 3 },
  '3-1': { type: 'faction_hq', faction: 'slv', danger: 2 },
  '3-2': { type: 'faction_mine', faction: 'slv', danger: 2 },
  '2-3': { type: 'faction_hq', faction: 'omig', danger: 2 },
  '2-2': { type: 'faction_mine', faction: 'omig', danger: 2 },
  '2-4': { type: 'faction_forge', faction: 'omig', name: 'Omig Forge Access', danger: 2 },
  '2-1': { type: 'border', name: 'Neutral Border', danger: 1, factions: ['slv','omig'] },
  '1-5': { type: 'pirate_hq', faction: 'pirates', danger: 4 },
  '2-5': { type: 'pirate_patrol', faction: 'pirates', danger: 3 },
  '1-4': { type: 'pirate_patrol', faction: 'pirates', danger: 3 },
  '5-4': { type: 'raid_boss', name: 'The Citadel', danger: 5, locked: true },
  '5-5': { type: 'serenity', name: 'Serenity', danger: 5, locked: true },
};

// Danger level names
const DANGER_NAMES = ['Safe', 'Low', 'Moderate', 'High', 'Extreme', 'LETHAL'];
const DANGER_COLORS= ['#44FF88','#88FF44','#FFDD44','#FF8800','#FF4400','#FF0000'];

// ── STATE ──────────────────────────────────────────────────────────────────────
let dsActive      = false;
let dsZoneTransitioning = false;
let dsCanvas, dsCtx;
let dsShip;
let dsZone        = { n:1, e:1 };
let dsKeys        = {};
let dsLastTime    = 0;
let dsCameraX     = 0, dsCameraY = 0;
let dsPanOffX     = 0, dsPanOffY = 0;
let dsPanning     = false, dsPanStartX = 0, dsPanStartY = 0;
let dsStars       = [], dsNebula = [];
let dsBullets      = [], dsMissiles = [];
let dsEnemyBullets = [];
let dsOtherPlayers  = {}; // socketId -> { x, y, angle, username, shield, maxShield, design, shipClass, quality, hitFlash }
let dsNpcMiners     = {}; // socketId -> miner data, shown as NPC ships in zone
let dsWarzoneBots   = {}; // username -> bot data for active warzone, rendered via dsDrawOtherPlayer
let dsGameRace=null,dsGameWarzone=null,dsGameWaypoints=[],dsGameGas=null,dsGamePositions=[];
var dsLeviathan=null; var LEV_SEG_COUNT=40,LEV_SEG_SPACING=38;
let dsWarzoneArena  = { active:false, cooldown:false, nextStart:0, playerCount:0, portalLocked:false };
let dsGameFinalZone = null; // zone key '4-1'..'5-2' that gas converges to
let dsWarzoneWinner = null; // username of current warzone winner (crown display)
let dsArenaPortals = []; // portals in current zone
let dsOtherBullets  = []; // bullets fired by other players
let dsOtherMissiles = []; // missiles fired by other players
let dsSalvageCrates = []; // contested salvage beacons
let dsExplosions  = [];
let dsAsteroids   = [];
let dsSpaceOre    = [];
let dsCargo       = { ore: 0, maxOre: 10 };
let dsGuards      = [];
let dsFactionStations = [];
let dsLootCrates  = [];
let dsSpaceParts  = [];     // parts collected in space, max 6, transfer on dock
let dsCombatLog   = [];     // rolling combat log, dumped on death
var _dsLogMax = 40;         // keep last 40 hits
function dsLogHit(attacker, target, dmg, weapon, shieldBefore, shieldAfter) {
  dsCombatLog.push({ t: Date.now(), attacker, target, dmg: Math.round(dmg), weapon, shieldBefore: Math.round(shieldBefore), shieldAfter: Math.round(shieldAfter) });
  if (dsCombatLog.length > _dsLogMax) dsCombatLog.shift();
  console.log('[Combat] ' + attacker + ' → ' + target + ' | ' + weapon + ' ' + Math.round(dmg).toLocaleString() + ' dmg | shield ' + Math.round(shieldBefore).toLocaleString() + ' → ' + Math.round(Math.max(0,shieldAfter)).toLocaleString());
}
let dsNearestCrate = null;  // crate player is near enough to interact with
let dsForge       = null;
let dsWarpCooldown= 0;
let dsMissileCount= 25;
let dsActiveWeapon= 'guns';
let dsPlayerDead  = false;
let dsAIQueue     = [], dsAIShowing = false;
let dsAudioCtx    = null;
let dsWaveformAnim= 0;
let dsBounty      = 0;   // player's pirate bounty
let dsForgeTimers = {}; // dock point → processing end time
let dsForgeDocked = null;
let dsForgeOreIn = 0;   // ore committed to current forge session
let dsForgeCancelling = false;
let dsForgeCancelTimer = 0;
let dsNearestStation = null;
let dsNearestForge = null;
let dsScanner = { active:false, timer:0, duration:4, zoom:1.0, targets:[], hasScanner:true };
let dsShipBars    = 0;  // forge bars earned in space, transferred on safe dock at 1-1
let dsCarriedBars = 0;  // loot bars grabbed from crates -- server-tracked in sp.carriedBars, synced here
let dsHomeStation = null; // Station Alpha dock point in zone 1-1

// Mobile touch state -- module-scope so dsDraw() and HUD buttons can access
var _dsJoy = { active:false, id:null, startX:0, startY:0, dx:0, dy:0 };
var _dsLastAimAngle = -Math.PI/2;
var _dsMobTapCount = 0;

// Ship data from ship system
let dsShipData = null; // populated from shipData on enter
let dsShipDesign = null;

// Mobile touch state (module-scope)
var _dsAimJoy        = { active:false, id:null };
var _dsAimFlash      = 0;
var _dsAutoFireTimer = 0;
var _dsAutoShotCount = 0;

// ── ZONE HELPERS ──────────────────────────────────────────────────────────────
function zoneKey(z) { return z.n + '-' + z.e; }

function zoneContent(z) {
  return ZONE_CONTENT[zoneKey(z)] || { type: 'empty', danger: Math.max(0, z.n + z.e - 3) };
}

function isZoneAccessible(from, to) {
  var fromKey = from.n+'-'+from.e;
  var toKey   = to.n+'-'+to.e;
  var ARENA   = ['4-1','4-2','5-1','5-2'];
  var STRIP   = ['5-3','5-4','5-5'];
  // Must be adjacent
  var dn = Math.abs(to.n - from.n), de = Math.abs(to.e - from.e);
  if (dn + de !== 1) return false;
  // Arena: only traversable within arena (portal-only access from outside)
  var fromArena = ARENA.includes(fromKey), toArena = ARENA.includes(toKey);
  if (toArena && !fromArena) return false;  // entering arena from outside
  if (fromArena && !toArena) return false;  // exiting arena to outside
  // Final strip (n=5, e>=3): south entry blocked -- no flying in from n=4
  if (STRIP.includes(toKey) && from.n === 4) return false;
  // 5-3 west: portal-only (5-2 east portal handles it, not normal flight)
  if (toKey === '5-3' && fromKey !== '5-4') return false;
  // 5-5: serenity lock + only reachable from 5-4
  if (toKey === '5-5') {
    if (fromKey !== '5-4') return false;
    if (!window._serenityUnlocked) return false;
  }
  return true;
}

function getDangerWarning(zone) {
  const content = zoneContent(zone);
  const danger  = content.danger || 0;
  const ship    = dsShipData;
  if (!ship) return null;

  // Compare ship rank to zone danger
  const RANK_NUMS = { F:0, E:1, D:2, C:3, B:4, A:5, Z:6 };
  const shipRank  = ship.ships && ship.ships[0] ? RANK_NUMS[ship.ships[0].rank] || 0 : 0;
  const warnings  = [];

  if (danger >= 3 && shipRank < 2) warnings.push('Your ship rank is too low for this zone.');
  if (danger >= 4) warnings.push('Extreme danger — even experienced pilots die here.');
  if (content.type === 'pirate_hq') warnings.push('Pirate stronghold. Expect ambush.');
  if (content.type === 'raid_boss') warnings.push('RAID BOSS ZONE. This is lethal.');
  if (!ship.ships?.[0]?.slots?.engine) warnings.push('No engine equipped — you will drift.');

  return warnings.length ? warnings : null;
}

// ── AUDIO ─────────────────────────────────────────────────────────────────────
function dsInitAudio() {
  try { dsAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
}
function dsPlayWhompy() {
  if (!dsAudioCtx) return;
  try {
    const o = dsAudioCtx.createOscillator(), g = dsAudioCtx.createGain();
    o.connect(g); g.connect(dsAudioCtx.destination);
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, dsAudioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(60, dsAudioCtx.currentTime + 0.3);
    g.gain.setValueAtTime(0.15, dsAudioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, dsAudioCtx.currentTime + 0.4);
    o.start(); o.stop(dsAudioCtx.currentTime + 0.4);
  } catch(e) {}
}
function dsPlayWarp() {
  if (!dsAudioCtx) return;
  try {
    const o = dsAudioCtx.createOscillator(), g = dsAudioCtx.createGain();
    o.connect(g); g.connect(dsAudioCtx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(200, dsAudioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(2000, dsAudioCtx.currentTime + 0.3);
    g.gain.setValueAtTime(0.2, dsAudioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, dsAudioCtx.currentTime + 0.5);
    o.start(); o.stop(dsAudioCtx.currentTime + 0.5);
  } catch(e) {}
}
function dsPlayAlert() {
  if (!dsAudioCtx) return;
  try {
    [0, 0.15, 0.3].forEach(t => {
      const o = dsAudioCtx.createOscillator(), g = dsAudioCtx.createGain();
      o.connect(g); g.connect(dsAudioCtx.destination);
      o.type = 'square'; o.frequency.value = 440;
      g.gain.setValueAtTime(0.08, dsAudioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, dsAudioCtx.currentTime + t + 0.12);
      o.start(dsAudioCtx.currentTime + t); o.stop(dsAudioCtx.currentTime + t + 0.12);
    });
  } catch(e) {}
}

// ── AI TERMINAL ───────────────────────────────────────────────────────────────
const dsAITerminal = document.createElement('div');
dsAITerminal.style.cssText = `position:fixed;top:0;left:0;right:0;
  background:rgba(0,8,20,0.96);border-bottom:2px solid rgba(0,255,180,0.3);
  font-family:'Courier New',monospace;color:#00FFB8;padding:10px 16px;
  z-index:500;display:none;pointer-events:none;box-shadow:0 2px 20px rgba(0,255,180,0.15);`;
dsAITerminal.innerHTML = `<div style="display:flex;align-items:center;gap:12px;">
  <div style="font-size:0.65rem;opacity:0.5;white-space:nowrap;">SHIP AI v2.1</div>
  <canvas id="dsWaveform" width="80" height="24" style="opacity:0.7;"></canvas>
  <div id="dsAIText" style="font-size:0.85rem;letter-spacing:0.05em;flex:1;"></div>
</div>`;
document.body.appendChild(dsAITerminal);

let dsAITyping = false;
function dsQueueAI(text, delay = 0, onDone = null) {
  dsAIQueue.push({ text, delay, onDone });
  if (!dsAIShowing) dsProcessAIQueue();
}
function dsProcessAIQueue() {
  if (!dsAIQueue.length) { dsAIShowing = false; return; }
  dsAIShowing = true;
  const item = dsAIQueue.shift();
  setTimeout(() => {
    dsShowAI(item.text, () => {
      if (item.onDone) item.onDone();
      setTimeout(dsProcessAIQueue, 800);
    });
  }, item.delay);
}
function dsShowAI(text, onDone) {
  dsAITerminal.style.display = 'block';
  const el = document.getElementById('dsAIText');
  if (!el) return;
  el.textContent = '';
  dsPlayWhompy();
  let i = 0; dsAITyping = true;
  const iv = setInterval(() => {
    el.textContent += text[i++];
    if (i >= text.length) {
      clearInterval(iv); dsAITyping = false;
      if (onDone) setTimeout(() => {
        if (!dsAIQueue.length) dsAITerminal.style.display = 'none';
        onDone();
      }, Math.max(2000, text.length * 60));
    }
  }, 28);
}
function dsAnimateWaveform() {
  const wc = document.getElementById('dsWaveform');
  if (!wc) return;
  const wctx = wc.getContext('2d');
  wctx.clearRect(0, 0, 80, 24);
  wctx.strokeStyle = '#00FFB8'; wctx.lineWidth = 1.5;
  wctx.beginPath();
  for (let x = 0; x < 80; x++) {
    const y = 12 + Math.sin(x*0.3+dsWaveformAnim)*(dsAITyping?8:2)
             + Math.sin(x*0.7+dsWaveformAnim*1.3)*(dsAITyping?4:1);
    x===0 ? wctx.moveTo(x,y) : wctx.lineTo(x,y);
  }
  wctx.stroke();
}

// ── CANVAS SETUP ──────────────────────────────────────────────────────────────
function dsSetupCanvas() {
  dsCanvas = document.createElement('canvas');
  dsCanvas.style.cssText = `position:fixed;inset:0;z-index:800;display:none;background:#000008;touch-action:none;`;
  dsCanvas.width  = window.innerWidth;
  dsCanvas.height = window.innerHeight;
  dsCtx = dsCanvas.getContext('2d');
  document.body.appendChild(dsCanvas);
  window.addEventListener('resize', () => { dsCanvas.width=window.innerWidth; dsCanvas.height=window.innerHeight; });

  // Right-click missile aim
  dsCanvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (!dsShip) return;
    const _z = dsScanner.zoom || 1.0;
    const wx = dsCameraX + (e.clientX - dsCanvas.width/2) * _z;
    const wy = dsCameraY + (e.clientY - dsCanvas.height/2) * _z;
    dsFireMissile(Math.atan2(wy-dsShip.y, wx-dsShip.x));
  });
  // Left click to fire toward
  dsCanvas.addEventListener('click', e => {
    if (!dsActive || !dsShip) return;
    // Check forge dock tap buttons
    if (dsForge && dsForge.dockPoints) {
      for (var _dpi=0; _dpi<dsForge.dockPoints.length; _dpi++) {
        var _dp = dsForge.dockPoints[_dpi];
        if (_dp._tapBtnX) {
          var _tdx = e.clientX - (_dp._tapBtnX - dsCameraX + dsCanvas.width/2);
          var _tdy = e.clientY - (_dp._tapBtnY - dsCameraY + dsCanvas.height/2);
          if (Math.sqrt(_tdx*_tdx+_tdy*_tdy) < (_dp._tapBtnR||28)+12) {
            dsStartForge(_dp); return;
          }
        }
      }
    }
    // Check passive button bounds first -- it lives on the canvas
    if (dsShip._passiveBtnX) {
      var _pbdx = e.clientX - dsShip._passiveBtnX;
      var _pbdy = e.clientY - dsShip._passiveBtnY;
      if (Math.sqrt(_pbdx*_pbdx+_pbdy*_pbdy) < (dsShip._passiveBtnR||22) + 8) {
        dsTogglePassiveMode(); return;
      }
    }
    // Block firing in passive mode
    if (dsShip.gunsOff) return;
    const _z = dsScanner.zoom || 1.0;
    const wx = dsCameraX + (e.clientX - dsCanvas.width/2) * _z;
    const wy = dsCameraY + (e.clientY - dsCanvas.height/2) * _z;
    const angle = Math.atan2(wy-dsShip.y, wx-dsShip.x);
    if (dsActiveWeapon === 'missiles') dsFireMissile(angle);
    else dsFireBullet(angle);
  });
  // Pan
  dsCanvas.addEventListener('mousedown', e => {
    if (e.button===2) { dsPanning=true; dsPanStartX=e.clientX; dsPanStartY=e.clientY; }
  });
  dsCanvas.addEventListener('mousemove', e => {
    if (dsPanning) { dsPanOffX=(e.clientX-dsPanStartX)*0.5; dsPanOffY=(e.clientY-dsPanStartY)*0.5; }
  });
  dsCanvas.addEventListener('mouseup', () => { dsPanning=false; dsPanOffX=0; dsPanOffY=0; });

  // ── DEEPSPACE MOBILE TOUCH ──────────────────────────────────
  _dsJoy = { active:false, id:null, startX:0, startY:0, dx:0, dy:0 };
  _dsLastAimAngle = -Math.PI/2;
  _dsMobTapCount = 0;
  _dsAimJoy = { active:false, id:null };
  _dsAimFlash = 0;
  _dsAutoFireTimer = 0;
  _dsAutoShotCount = 0;

  // Dual joystick zones
  function dsInJoyZone(x, y) {
    return x < 200 && y > window.innerHeight - 200;
  }
  function dsInAimJoyZone(x, y) {
    var ax = dsCanvas.width - 145, ay = dsCanvas.height - 150;
    var dx = x - ax, dy = y - ay;
    return Math.sqrt(dx*dx + dy*dy) < 55;
  }

  dsCanvas.addEventListener("touchstart", function(e) {
    if (!dsActive || !dsShip) return;
    for (var i=0; i<e.changedTouches.length; i++) {
      var t=e.changedTouches[i];
      if (dsInJoyZone(t.clientX, t.clientY) && !_dsJoy.active) {
        _dsJoy={active:true,id:t.identifier,startX:t.clientX,startY:t.clientY,dx:0,dy:0};
      } else if (dsInAimJoyZone(t.clientX, t.clientY) && !_dsAimJoy.active) {
        _dsAimJoy={active:true, id:t.identifier};
        var ax=dsCanvas.width-145, ay=dsCanvas.height-150;
        var dx=t.clientX-ax, dy=t.clientY-ay;
        if (Math.sqrt(dx*dx+dy*dy)>8) _dsLastAimAngle=Math.atan2(dy,dx);
      } else if (!dsInJoyZone(t.clientX,t.clientY) && !dsInAimJoyZone(t.clientX,t.clientY)) {
        if (!dsShip.gunsOff) {
          _dsMobTapCount++;
          dsFireBullet(_dsLastAimAngle);
          if (_dsMobTapCount%3===0 && dsMissileCount>0) dsFireMissile(_dsLastAimAngle);
          _dsAimFlash=1.0;
        }
        if (dsNearestStation) dsInteractNearest();
      }
    }
  }, {passive:true});

  dsCanvas.addEventListener("touchmove", function(e) {
    if (!dsActive || !dsShip) return;
    for (var i=0; i<e.changedTouches.length; i++) {
      var t=e.changedTouches[i];
      if (t.identifier===_dsJoy.id) {
        _dsJoy.dx=(t.clientX-_dsJoy.startX)/55;
        _dsJoy.dy=(t.clientY-_dsJoy.startY)/55;
        window._joystickDelta={x:_dsJoy.dx,y:_dsJoy.dy};
      }
      if (_dsAimJoy.active && t.identifier===_dsAimJoy.id) {
        var ax=dsCanvas.width-145, ay=dsCanvas.height-150;
        var dx=t.clientX-ax, dy=t.clientY-ay;
        if (Math.sqrt(dx*dx+dy*dy)>8) _dsLastAimAngle=Math.atan2(dy,dx);
      }
    }
  }, {passive:true});

  dsCanvas.addEventListener("touchend", function(e) {
    for (var i=0; i<e.changedTouches.length; i++) {
      var t=e.changedTouches[i];
      if (t.identifier===_dsJoy.id) {
        _dsJoy={active:false,id:null,startX:0,startY:0,dx:0,dy:0};
        window._joystickDelta={x:0,y:0};
      }
      if (_dsAimJoy.active && t.identifier===_dsAimJoy.id) {
        _dsAimJoy={active:false,id:null};
      }
    }
  }, {passive:true});
}

// ── KEYBOARD ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!dsActive) return;
  // Block ship controls while typing in chat
  if (document.activeElement && document.activeElement.id === 'dsChatInput') return;
  dsKeys[e.code] = true;
  if (document.activeElement && document.activeElement.id === 'dsChatInput') return;
  if (e.code==='Space') { e.preventDefault(); dsDoWarp(); }
  if (e.code==='KeyF')  dsFireMissile(dsShip?.angle);
  if (e.code==='KeyQ')  dsActiveWeapon = dsActiveWeapon==='guns' ? 'missiles' : 'guns';
  if (e.code==='KeyE') {
    if (dsForgeDocked && !dsForgeCancelling) { dsCancelForge(); return; }
    if (window._dsNearSerenityPortal) { DSKT()?.emit('deepspace:enterSerenity'); return; }
    if (dsNearestForge) { dsStartForge(dsNearestForge); return; }
    if (dsNearestStation) { dsInteractNearest(); return; }
    dsActivateScanner();
  }
});
document.addEventListener('keyup', e => { dsKeys[e.code] = false; });

// ── SHIP CREATION ──────────────────────────────────────────────────────────────
function dsCreateShip(spawnX, spawnY) {
  const activeShip  = dsShipData?.ships?.find(s => s.id === dsShipData.activeShipId);
  const shipStats   = activeShip?.stats || {};
  const slots       = activeShip?.slots || {};
  // Base stats from hull blueprint
  var _shieldBase   = shipStats.shieldHP    || 150;
  var _regenBase    = shipStats.shieldRegen || 5;
  var _engineBase   = shipStats.engine      || 0.5;
  var _warpBase     = shipStats.warp        || 1.0;
  var _navBase      = shipStats.nav         || 4;
  var _missileDmg   = shipStats.missileDmg  || 1000;
  var _bulletDmg    = shipStats.bulletDmg   || 250;
  // Add equipped slot bonuses -- this is what makes gear matter in combat
  if (slots.shield  && slots.shield.stats)  { _shieldBase += (slots.shield.stats.hpBonus    || 0); _regenBase  += (slots.shield.stats.regenBonus  || 0); }
  if (slots.engine  && slots.engine.stats)  { _engineBase += (slots.engine.stats.speedBonus  || 0); }
  if (slots.warp    && slots.warp.stats)    { _warpBase   += (slots.warp.stats.distMult      || 0); }
  if (slots.nav     && slots.nav.stats)     { _navBase    += (slots.nav.stats.navBonus        || 0) * 10; }
  if (slots.weapon2 && slots.weapon2.stats) { _missileDmg  = slots.weapon2.stats.missileDmg  || _missileDmg; }
  if (slots.weapon1 && slots.weapon1.stats) { _bulletDmg   = slots.weapon1.stats.bulletDmg   || _bulletDmg; }
  var maxShield = Math.max(1, Math.round(_shieldBase));
  return {
    x: spawnX || DS_CENTER, y: spawnY || DS_CENTER,
    vx: 0, vy: 0,
    angle: -Math.PI / 2,
    shield: maxShield, maxShield,
    shieldRegen: Math.round(_regenBase),
    engineMult: parseFloat(_engineBase.toFixed(3)),
    warpMult:   parseFloat(_warpBase.toFixed(2)),
    navLevel:   Math.round(_navBase),
    missileDmg: Math.round(_missileDmg),
    bulletDmg:  Math.round(_bulletDmg),
    thrusting: false, warping: false,
    warpFlash: 0, hitFlash: 0,
    trail: [], smokeParticles: [], smokeTimer: 0,
    systems: { engine: true, weapons: true, warp: true, navigation: true },
    design: dsShipDesign,
  };
}

// ── STARS / NEBULA ────────────────────────────────────────────────────────────
function dsGenerateStars(seed) {
  const rng = dsMulberry32(seed);
  dsStars = [];
  for (let i=0; i<700; i++) {
    dsStars.push({ x:rng()*DS_WORLD, y:rng()*DS_WORLD, r:rng()*1.5+0.2,
      brightness:rng()*0.7+0.3, twinkle:rng()*Math.PI*2, layer:Math.floor(rng()*3) });
  }
  for (let i=0; i<10; i++) {
    dsStars.push({ x:rng()*DS_WORLD, y:rng()*DS_WORLD, r:rng()*4+2,
      brightness:rng()*0.3+0.1, twinkle:rng()*Math.PI*2, layer:0,
      isGalaxy:true, hue:rng()*60+200 });
  }
  dsNebula = [];
  for (let i=0; i<50; i++) {
    dsNebula.push({ x:rng()*DS_WORLD, y:rng()*DS_WORLD, r:rng()*80+40,
      hue:rng()*60+200, alpha:rng()*0.03+0.01 });
  }
}

// ── ZONE SETUP ────────────────────────────────────────────────────────────────
function dsSetupZone(zone, spawnEdge) {
  // Reset nearby menu so it repopulates for new zone
  dsHideNearbyMenu();
  const content = zoneContent(zone);
  const seed = zone.n * 100 + zone.e;

  dsGenerateStars(seed);
  dsAsteroids = [];
  dsGuards    = [];
  dsFactionStations = [];
  dsWarzoneBots = {}; // clear on zone change -- bots re-broadcast by server
  dsLootCrates = [];
  dsForge      = null;
  dsForgeDocked= null;
  dsGameGas      = null;  // clear gas when entering a new zone
  dsWarzoneWinner = null; // clear crown on zone transition

  // Spawn position based on which edge we came from
  let spawnX = DS_CENTER, spawnY = DS_CENTER;
  if (spawnEdge === 'south') { spawnX = DS_CENTER + (Math.random()-0.5)*200; spawnY = DS_WORLD - DS_EDGE*2; }
  if (spawnEdge === 'north') { spawnX = DS_CENTER + (Math.random()-0.5)*200; spawnY = DS_EDGE*2; }
  if (spawnEdge === 'west')  { spawnX = DS_EDGE*2; spawnY = DS_CENTER + (Math.random()-0.5)*200; }
  if (spawnEdge === 'east')  { spawnX = DS_WORLD - DS_EDGE*2; spawnY = DS_CENTER + (Math.random()-0.5)*200; }

  // Save shield -- zone warp must NOT reset shields (exploit prevention)
  var _savedShield = dsShip ? dsShip.shield : -1;
  dsShip = dsCreateShip(spawnX, spawnY);
  if (_savedShield >= 0) dsShip.shield = Math.min(_savedShield, dsShip.maxShield);
  dsCameraX = spawnX; dsCameraY = spawnY;

  // ── STAR FORGE ──
  // ── SERENITY WORMHOLE (zone 5-5) ──
  if (content.type === 'serenity') {
    window._dsSerenityWormhole = {
      x: DS_CENTER, y: DS_CENTER,
      r: 220, pulseT: 0, lightningT: 0,
      promptRadius: 180,
    };
    DSKT()?.emit('deepspace:serenityCheck');
  } else {
    window._dsSerenityWormhole = null;
  }

  if (content.type === 'starforge') {
    dsForge = {
      x: DS_CENTER, y: DS_CENTER,
      ringR: 320, starR: 80,
      dockPoints: [],
      active: true,
    };
    for (let i=0; i<6; i++) {
      const angle = (i/6)*Math.PI*2;
      dsForge.dockPoints.push({
        x: DS_CENTER + Math.cos(angle) * dsForge.ringR,
        y: DS_CENTER + Math.sin(angle) * dsForge.ringR,
        occupied: false, processingUntil: 0, ownerName: null,
        idx: i,
      });
    }
  }

  // ── FACTION HQ ──
  // Server controls guards in all named faction/pirate zones.
  // Skip local dsSpawnGuards for those -- deepspace:guards broadcast handles rendering.
  const _serverGuardZones = new Set(['3-5','4-5','3-4','3-1','3-2','2-3','2-2','2-4','1-5','2-5','1-4','2-1']);
  var _skipLocalGuards = _serverGuardZones.has(zoneKey(zone));
  if (content.type === 'faction_hq' || content.type === 'pirate_hq') {
    const f = FACTIONS[content.faction];
    if (f) {
      dsFactionStations.push({
        faction: content.faction,
        x: DS_CENTER, y: DS_CENTER,
        r: 60, name: f.name + ' HQ',
        color: f.color, accentColor: f.accentColor,
        canDock: false, // float drive-up only
        promptRadius: 200,
      });
      if (!_skipLocalGuards) dsSpawnGuards(content.faction, 5, seed);
    }
  }

  // ── FACTION MINE ──
  if (content.type === 'faction_mine') {
    const f = FACTIONS[content.faction];
    if (f) {
      // Mining checkpoint
      dsFactionStations.push({
        faction: content.faction,
        x: DS_CENTER, y: DS_CENTER - 200,
        r: 40, name: f.name + ' Checkpoint',
        color: f.color, accentColor: f.accentColor,
        isMineCheckpoint: true,
        promptRadius: 150,
      });
      // Asteroid field
      dsSpawnAsteroidField(seed, 25);
      if (!_skipLocalGuards) dsSpawnGuards(content.faction, 3, seed + 50);
    }
  }

  // ── PIRATE PATROL ──
  if (content.type === 'pirate_patrol') {
    if (!_skipLocalGuards) dsSpawnGuards('pirates', 3, seed);
    dsSpawnAsteroidField(seed, 10); // some asteroids to hide behind
  }

  // ── FACTION FORGE ACCESS ──
  if (content.type === 'faction_forge') {
    var ff = FACTIONS[content.faction];
    if (ff) {
      dsFactionStations.push({
        faction: content.faction,
        x: DS_CENTER, y: DS_CENTER,
        r: 35, name: content.name || (ff.name + ' Relay'),
        color: ff.color, accentColor: ff.accentColor,
        promptRadius: 150,
      });
      if (!_skipLocalGuards) dsSpawnGuards(content.faction, 2, seed);
    }
  }

  // ── NEUTRAL BORDER ──
  if (content.type === 'border') {
    // SLV guards on north half, Omig on south half, they face each other
    var borderFactions = content.factions || ['slv','omig'];
    borderFactions.forEach(function(fid, fi) {
      var offsetY = fi === 0 ? -600 : 600;
      // 2 border crew per faction -- full fleet ships, fight back when provoked
      var _bFleet = (window._factionFleets && window._factionFleets[fid]) || [];
      for (var bi=0; bi<2; bi++) {
        var _bShip   = _bFleet[(bi+2) % Math.max(1,_bFleet.length)] || null;
        var _bShield = _bShip && _bShip.stats ? (_bShip.stats.shieldHP || 5000) : 5000;
        dsGuards.push({
          id: fid+'_border_'+seed+'_'+bi,
          faction: fid,
          x: DS_CENTER + (bi===0?-200:200),
          y: DS_CENTER + offsetY,
          vx: 0, vy: 0, angle: fi===0 ? Math.PI/2 : -Math.PI/2,
          shield: _bShield, maxShield: _bShield,
          alive: true,
          state: 'border', // hold position -- attack if provoked
          patrolCenter: { x: DS_CENTER, y: DS_CENTER + offsetY },
          patrolRadius: 150, orbitAngle: bi*Math.PI,
          fireTimer: 0.5 + Math.random()*0.5,
          missileTimer: 3 + Math.random(),
          trail: [], flashTimer: 0, warpCooldown: 0,
          color: FACTIONS[fid]?.color || '#888',
          pilotName: dsBorderPilotName(fid, bi),
          ship: _bShip,
          isBorderCrew: true,
        });
      }
    });
  }
  // ── EMPTY / DEFAULT ──
  if (content.type === 'empty') {
    const rng = dsMulberry32(seed);
    if (rng() < 0.4) dsSpawnAsteroidField(seed, 8 + Math.floor(rng()*8));
    // Transit zone pirates removed -- all guards are server-authoritative
  }

  dsBullets = []; dsMissiles = []; dsEnemyBullets = []; dsExplosions = [];
  dsSpaceOre = [];
  // Cross-zone aggro: if player is hostile to zone faction, guards attack immediately
  var _zoneFac = content.faction || null;
  if (_zoneFac && (dsIsHostile(_zoneFac) || dsIsWar(_zoneFac))) {
    setTimeout(function() {
      dsGuards.forEach(function(g) {
        if (g.alive && g.faction === _zoneFac && g.state !== 'border') {
          g.state = 'attack'; g._aggro = true;
        }
      });
      DNOTIFY('['+( FACTIONS[_zoneFac]?.name||_zoneFac)+'] YOU ARE NOT WELCOME HERE.');
    }, 800); // slight delay so zone loads first
  }

  // Station Alpha dock beacon — only in zone 1-1
  dsHomeStation = null;
  if (zoneKey(zone) === '1-1') {
    dsHomeStation = {
      x: DS_CENTER + 600,
      y: DS_CENTER - 200,
      r: 55, name: 'Station Alpha',
      color: '#00AAFF', accentColor: '#44CCFF',
      promptRadius: 250,
      isHomeStation: true,
      faction: null,
    };
    dsFactionStations.push(dsHomeStation);
  }
}

function dsSpawnAsteroidField(seed, count) {
  const rng = dsMulberry32(seed + 1000);
  const cx = DS_CENTER + (rng()-0.5)*1200;
  const cy = DS_CENTER + (rng()-0.5)*1200;
  for (let i=0; i<count; i++) {
    const angle = rng()*Math.PI*2;
    const dist  = 100 + rng()*500;
    dsAsteroids.push({
      x: cx + Math.cos(angle)*dist + (rng()-0.5)*80,
      y: cy + Math.sin(angle)*dist + (rng()-0.5)*80,
      r: 22 + rng()*40, angle: rng()*Math.PI*2, spin: (rng()-0.5)*0.01,
      vx: (rng()-0.5)*0.2, vy: (rng()-0.5)*0.2,
      color: `hsl(${20+rng()*20},15%,${28+rng()*18}%)`,
      hp: null,
      craters: Array.from({length:2+Math.floor(rng()*3)},()=>({
        a: rng()*Math.PI*2, d: rng()*0.6, r: 0.12+rng()*0.25
      })),
    });
  }
}

function dsSpawnGuards(factionId, count, seed) {
  var f   = FACTIONS[factionId];
  var rng = dsMulberry32(seed + 9000);
  // Pull ships from faction fleet data if available
  var fleetShips = (window._factionFleets && window._factionFleets[factionId]) || [];
  for (var i=0; i<count; i++) {
    var angle = (i/count)*Math.PI*2 + rng()*0.4;
    var dist  = 400 + rng()*300;
    var rl    = f ? f.researchLevel : 15;
    // Assign a fleet ship (cycle through available)
    var fleetShip = fleetShips[i % Math.max(1, fleetShips.length)] || null;
    var shieldHP  = fleetShip && fleetShip.stats ? (fleetShip.stats.shieldHP || 200 + rl*20) : 200 + rl*20;
    dsGuards.push({
      id: factionId + '_guard_' + seed + '_' + i,
      faction: factionId,
      x: DS_CENTER + Math.cos(angle)*dist,
      y: DS_CENTER + Math.sin(angle)*dist,
      vx: 0, vy: 0,
      angle: 0,
      shield: shieldHP, maxShield: shieldHP,
      alive: true,
      state: 'patrol',
      patrolAngle: angle,
      patrolCenter: { x: DS_CENTER, y: DS_CENTER },
      patrolRadius: 350 + rng()*200,
      orbitAngle: angle,
      fireTimer: 0.5 + rng()*0.8,
      missileTimer: 3 + rng(),
      trail: [], flashTimer: 0, warpCooldown: 0,
      color: f ? f.color : '#888',
      pilotName: dsPilotName(factionId, seed + i),
      rank: rl >= 15 ? 'D' : 'E',
      ship: fleetShip, // real ship with design + slots
    });
  }
}

function dsBorderPilotName(faction, idx) {
  var VERUS_B = ['Cael Thorn','Darnis Val'];
  var SLV_B   = ['Arch. Zen','Bio. Fenn'];
  var OMIG_B  = ['Zeth-5','Orix-2'];
  var PIR_B   = ['Grax','Wrex'];
  var pool = faction==='verus'?VERUS_B:faction==='slv'?SLV_B:faction==='omig'?OMIG_B:PIR_B;
  return pool[idx%pool.length];
}

function dsPilotName(faction, seed) {
  const rng = dsMulberry32(seed);
  const VERUS = ['Cdr.Vex','Cpt.Drex','Lt.Moran','Adm.Kell','Sgt.Vira'];
  const SLV   = ['Dr.Lenz','Prof.Ari','Rsch.Olex','Sci.Vex','Eng.Tara'];
  const OMIG  = ['Zx-7','Orix','Vel-9','Omnix','Quix-3'];
  const PIR   = ['Ravager','Nullar','Ghex','Void7','Burn'];
  const pool  = faction==='verus'?VERUS:faction==='slv'?SLV:faction==='omig'?OMIG:PIR;
  return pool[Math.floor(rng()*pool.length)];
}

// ── WEAPONS ───────────────────────────────────────────────────────────────────
function dsFireBullet(angle) {
  if (!dsShip || !dsShip.systems.weapons) return;
  if (dsShip.gunsOff) return; // passive mode -- cannot fire
  const bx = dsShip.x + Math.cos(angle)*20, by = dsShip.y + Math.sin(angle)*20;
  dsBullets.push({ x:bx, y:by, vx:Math.cos(angle)*13, vy:Math.sin(angle)*13, life:65, trail:[], dmg:dsShip.bulletDmg||250 });
  DSKT()?.emit('deepspace:fire', { type:'bullet', x:bx, y:by, vx:Math.cos(angle)*13, vy:Math.sin(angle)*13, dmg:dsShip.bulletDmg||250 });
}
function dsFireMissile(angle) {
  if (!dsShip || !dsShip.systems.weapons || dsMissileCount <= 0) return;
  if (dsShip.gunsOff) return; // passive mode -- cannot fire
  const a = angle !== undefined ? angle : dsShip.angle;
  dsMissiles.push({ x:dsShip.x, y:dsShip.y, vx:Math.cos(a)*6, vy:Math.sin(a)*6, angle:a, life:180, trail:[], smokeTrail:[], isPlayer:true, isEnemy:false, age:0, dmg:dsShip.missileDmg||1000 });
  var _wSlotF = dsShipData?.ships?.find(s=>s.id===dsShipData?.activeShipId);
  var _wPartF = _wSlotF?.slots?.weapon2 || _wSlotF?.slots?.weapon1;
  var _elemF  = _wPartF?.stats?.elemType || null;
  DSKT()?.emit('deepspace:fire', { type:'missile', x:dsShip.x, y:dsShip.y, vx:Math.cos(a)*6, vy:Math.sin(a)*6, angle:a, dmg:dsShip.missileDmg||1000, elemType:_elemF });
  dsMissileCount--;
}
function dsFireGuardBullet(g, angle) {
  const speed = 11;
  dsEnemyBullets.push({
    x: g.x + Math.cos(angle)*22, y: g.y + Math.sin(angle)*22,
    vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
    life: 75, owner: g.id, faction: g.faction,
    dmg: g.ship && g.ship.stats && g.ship.stats.bulletDmg
      ? g.ship.stats.bulletDmg
      : 10 + (FACTIONS[g.faction]?.researchLevel||15) * 2,
    trail: [],
  });
}
function dsFireGuardMissile(g) {
  if (!dsShip) return;
  const dx = dsShip.x - g.x, dy = dsShip.y - g.y;
  const angle = Math.atan2(dy, dx);
  dsMissiles.push({
    x: g.x, y: g.y,
    vx: Math.cos(angle)*4, vy: Math.sin(angle)*4,
    angle, life: 180, trail: [], isEnemy: true, isPlayer: false,
    faction: g.faction,
    dmg: g.ship && g.ship.stats && g.ship.stats.missileDmg
      ? g.ship.stats.missileDmg
      : 20 + (FACTIONS[g.faction]?.researchLevel||15) * 3,
  });
}

// ── WARP ──────────────────────────────────────────────────────────────────────
function dsDoWarp() {
  // Zone exit blocking is handled by isZoneAccessible in dsAttemptZoneTransition
  if (!dsShip || !dsShip.systems.warp || dsWarpCooldown > 0) return;
  dsPlayWarp();
  const dist = Math.min(dsCanvas.width, dsCanvas.height) * 0.5 * (dsShip.warpMult || 1);
  const newX = dsShip.x + Math.cos(dsShip.angle) * dist;
  const newY = dsShip.y + Math.sin(dsShip.angle) * dist;

  // Check if warp crosses zone boundary
  const crossN = newY < DS_EDGE ? 'north' : newY > DS_WORLD - DS_EDGE ? 'south' : null;
  const crossE = newX > DS_WORLD - DS_EDGE ? 'east' : newX < DS_EDGE ? 'west' : null;

  if (crossN || crossE) {
    const dir = crossN || crossE;
    dsAttemptZoneTransition(dir);
    return;
  }

  dsShip.x = Math.max(DS_EDGE, Math.min(DS_WORLD-DS_EDGE, newX));
  dsShip.y = Math.max(DS_EDGE, Math.min(DS_WORLD-DS_EDGE, newY));
  dsShip.vx *= 0.1; dsShip.vy *= 0.1;
  dsShip.warpFlash = 1.0;
  dsWarpCooldown = 300;
  DSKT()?.emit('space:move', { x: dsShip.x, y: dsShip.y, angle: dsShip.angle });
}

// ── ZONE TRANSITION ───────────────────────────────────────────────────────────
function dsAttemptZoneTransition(direction) {
  if (dsZoneTransitioning) return;
  const newZone = { ...dsZone };
  if (direction === 'north') newZone.n++;
  if (direction === 'south') newZone.n--;
  if (direction === 'east')  newZone.e++;
  if (direction === 'west')  newZone.e--;

  // Bounds check
  if (newZone.n < 1 || newZone.n > 5 || newZone.e < 1 || newZone.e > 5) {
    if (!dsShip._edgeCooldown || dsShip._edgeCooldown <= 0) {
      dsQueueAI("Edge of explored space.");
      dsShip._edgeCooldown = 3.0;
    }
    return;
  }

  // Access check (Serenity gate)
  if (!isZoneAccessible(dsZone, newZone)) {
    if (!dsShip._blockCooldown || dsShip._blockCooldown <= 0) {
      var _toKey = newZone.n+'-'+newZone.e;
      var _ARENA = ['4-1','4-2','5-1','5-2'];
      if (_ARENA.includes(_toKey)) dsQueueAI('SPACEZONE perimeter. Use a portal to enter.');
      else dsQueueAI('This path is blocked. Find another route.');
      dsShip._blockCooldown = 3.0;
    }
    return;
  }

  // Zone warning removed -- danger is self-evident when you get shot
  dsExecuteZoneTransition(newZone, direction);
}

function dsShowZoneWarning(zone, warnings, onContinue) {
  const content = zoneContent(zone);
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.88);
    z-index:600;display:flex;align-items:center;justify-content:center;
    font-family:'Courier New',monospace;`;
  const dc = DANGER_COLORS[content.danger] || '#888';
  overlay.innerHTML = `<div style="max-width:480px;text-align:center;padding:32px;">
    <div style="font-size:11px;letter-spacing:0.2em;color:rgba(150,200,255,0.4);margin-bottom:8px;">ENTERING ZONE ${dsZone.n+'-'+dsZone.e} → ${zone.n+'-'+zone.e}</div>
    <div style="font-size:22px;font-weight:bold;color:${dc};margin-bottom:6px;letter-spacing:0.1em;">${(content.name||'UNKNOWN SECTOR').toUpperCase()}</div>
    <div style="font-size:14px;color:${dc};margin-bottom:20px;font-weight:bold;">DANGER: ${DANGER_NAMES[content.danger]||'?'}</div>
    <div style="font-size:12px;color:rgba(255,150,150,0.7);line-height:1.8;margin-bottom:24px;">${warnings.join('<br>')}</div>
    <div style="display:flex;gap:12px;justify-content:center;">
      <button id="dsContinue" style="background:rgba(0,30,70,0.9);border:1px solid rgba(0,136,255,0.5);
        color:#0088FF;font-family:'Courier New',monospace;font-size:13px;padding:11px 24px;border-radius:7px;cursor:pointer;">CONTINUE ANYWAY</button>
      <button id="dsCancel" style="background:rgba(30,0,0,0.9);border:1px solid rgba(255,50,50,0.4);
        color:rgba(255,100,100,0.7);font-family:'Courier New',monospace;font-size:13px;padding:11px 24px;border-radius:7px;cursor:pointer;">STAY SAFE</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#dsContinue').addEventListener('click', () => { overlay.remove(); onContinue(); });
  overlay.querySelector('#dsCancel').addEventListener('click', () => { overlay.remove(); });
}

function dsExecuteZoneTransition(newZone, direction) {
  if (dsZoneTransitioning) return;
  dsZoneTransitioning = true;
  dsPlayWarp();

  // Flash out
  let alpha = 0;
  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;inset:0;background:#000;z-index:550;opacity:0;transition:opacity 0.4s;';
  document.body.appendChild(flash);
  requestAnimationFrame(() => { flash.style.opacity = '1'; });

  setTimeout(() => {
    // Move to new zone
    dsZone = newZone;
    const oppositeEdge = { north:'south', south:'north', east:'west', west:'east' }[direction];
    dsSetupZone(newZone, oppositeEdge);
  DSKT()?.emit('game:checkWarzoneEntry',{zone:newZone.n+'-'+newZone.e});
    dsBullets=[]; dsMissiles=[]; dsEnemyBullets=[];

    // Update server
    DSKT()?.emit('deepspace:zone', { zone: dsZone });

    const content = zoneContent(newZone);
    dsQueueAI(`Zone ${newZone.n}-${newZone.e}. ${content.name||'Sector clear.'}`);

    // Zone entry hostility check -- one warning per hostile faction, not per guard
    setTimeout(function() {
      var warnedFactions = {};
      dsGuards.forEach(function(g) {
        if (!g.alive || warnedFactions[g.faction]) return;
        if (dsIsWar(g.faction)) {
          warnedFactions[g.faction] = true;
          var fname = FACTIONS[g.faction]?.name || g.faction;
          dsQueueAI('⚔ ' + fname + ' hostile. They will engage on sight.');
          DNOTIFY('⚔ WAR — ' + fname + ' ships in sector. You will be hunted.');
        } else if (dsIsHostile(g.faction)) {
          warnedFactions[g.faction] = true;
          var fname = FACTIONS[g.faction]?.name || g.faction;
          DNOTIFY('⚠ ' + fname + ' hostile — guards may engage if you get close.');
        }
      });
    }, 600); // slight delay so zone AI message goes first

    // Flash back in
    flash.style.opacity = '0';
    setTimeout(() => { flash.remove(); dsZoneTransitioning = false; }, 500);
  }, 450);
  // Safety: force unlock after 2s in case transition got stuck
  setTimeout(() => { dsZoneTransitioning = false; }, 2000);
}

// ── UPDATE ─────────────────────────────────────────────────────────────────────
function dsUpdate(dt) {
  if (!dsShip || dsPlayerDead) return;
  dsWaveformAnim += dt * 4;

  // Edge and block cooldown decay
  if (dsShip._edgeCooldown  > 0) dsShip._edgeCooldown  -= dt;
  if (dsShip._blockCooldown > 0) dsShip._blockCooldown -= dt;

  // Shield regen
  if (dsShip.shield < dsShip.maxShield) {
    dsShip.shield = Math.min(dsShip.maxShield, dsShip.shield + dsShip.shieldRegen * dt);
  }

  // Movement
  const speed     = dsShip.systems.engine ? 0.18 * (dsShip.engineMult || 0.5) * 2 : 0.04;
  const maxSpeed  = dsShip.systems.engine ? 4.0 + (dsShip.engineMult||0.5)*2 : 1.5;
  const friction  = 0.97;
  let thrusting   = false;

  if (!dsForgeDocked) { // movement locked while smelting at Star Forge
  if (dsKeys['KeyW'] || dsKeys['ArrowUp'])    { dsShip.vy -= speed; thrusting = true; }
  if (dsKeys['KeyS'] || dsKeys['ArrowDown'])  { dsShip.vy += speed; thrusting = true; }
  if (dsKeys['KeyA'] || dsKeys['ArrowLeft'])  { dsShip.vx -= speed; thrusting = true; }
  if (dsKeys['KeyD'] || dsKeys['ArrowRight']) { dsShip.vx += speed; thrusting = true; }
  } // end forge movement lock

  const joy = window._joystickDelta;
  if (joy && (Math.abs(joy.x)>0.05||Math.abs(joy.y)>0.05)) {
    if (!dsForgeDocked) { dsShip.vx += joy.x*speed*1.5; dsShip.vy += joy.y*speed*1.5; thrusting=true; }
  }

  // Mobile auto-fire -- hold aim joystick to keep shooting
  if (window.innerWidth <= 900 && _dsAimJoy && _dsAimJoy.active && !dsShip.gunsOff) {
    _dsAutoFireTimer--;
    if (_dsAutoFireTimer <= 0) {
      _dsAutoFireTimer = 8;
      _dsAutoShotCount++;
      dsFireBullet(_dsLastAimAngle);
      if (_dsAutoShotCount % 3 === 0 && dsMissileCount > 0) dsFireMissile(_dsLastAimAngle);
      _dsAimFlash = 0.5;
    }
  } else if (window.innerWidth <= 900) {
    _dsAutoFireTimer = 0;
  }

  dsShip.thrusting = thrusting;
  if (thrusting) {
    const mag = Math.sqrt(dsShip.vx**2+dsShip.vy**2);
    if (mag > 0.01) dsShip.angle = Math.atan2(dsShip.vy, dsShip.vx);
  }

  const mag = Math.sqrt(dsShip.vx**2+dsShip.vy**2);
  if (mag > maxSpeed) { dsShip.vx=(dsShip.vx/mag)*maxSpeed; dsShip.vy=(dsShip.vy/mag)*maxSpeed; }
  dsShip.vx *= friction; dsShip.vy *= friction;
  dsShip.x += dsShip.vx; dsShip.y += dsShip.vy;

  // Zone edge detection
  if (!dsZoneTransitioning) {
    if (dsShip.y < DS_EDGE)             dsAttemptZoneTransition('north');
    else if (dsShip.y > DS_WORLD-DS_EDGE) dsAttemptZoneTransition('south');
    else if (dsShip.x > DS_WORLD-DS_EDGE) dsAttemptZoneTransition('east');
    else if (dsShip.x < DS_EDGE)          dsAttemptZoneTransition('west');
  }
  dsShip.x = Math.max(10, Math.min(DS_WORLD-10, dsShip.x));
  dsShip.y = Math.max(10, Math.min(DS_WORLD-10, dsShip.y));

  if (dsShip.warpFlash > 0)   dsShip.warpFlash -= dt*3;
  if (dsWarpCooldown > 0)     dsWarpCooldown    -= dt*60;

  // Trail + smoke
  dsShip.trail.push({ x:dsShip.x, y:dsShip.y, t:1.0 });
  if (dsShip.trail.length > 20) dsShip.trail.shift();
  dsShip.trail.forEach(t => t.t -= dt*2);

  dsShip.smokeTimer += dt;
  if (dsShip.smokeTimer > 0.08) {
    dsShip.smokeTimer = 0;
    dsShip.smokeParticles.push({
      x: dsShip.x - Math.cos(dsShip.angle)*18 + (Math.random()-0.5)*8,
      y: dsShip.y - Math.sin(dsShip.angle)*18 + (Math.random()-0.5)*8,
      vx: (Math.random()-0.5)*0.5 - dsShip.vx*0.3,
      vy: (Math.random()-0.5)*0.5 - dsShip.vy*0.3,
      life:1.0, r:Math.random()*4+2,
    });
  }
  dsShip.smokeParticles = dsShip.smokeParticles.filter(p => {
    p.x+=p.vx; p.y+=p.vy; p.life-=dt*1.5; return p.life>0;
  });

  // Camera
  dsCameraX += ((dsShip.x + dsPanOffX) - dsCameraX) * 0.08;
  dsCameraY += ((dsShip.y + dsPanOffY) - dsCameraY) * 0.08;

  // Bullets
  dsBullets = dsBullets.filter(b => {
    b.trail.push({x:b.x,y:b.y}); if(b.trail.length>8)b.trail.shift();
    b.x+=b.vx; b.y+=b.vy; b.life--;
    return b.life > 0;
  });

  // Other player bullets/missiles
  dsOtherBullets = dsOtherBullets.filter(b => {
    b.trail.push({x:b.x,y:b.y}); if(b.trail.length>8)b.trail.shift();
    b.x+=b.vx; b.y+=b.vy; b.life--;
    return b.life > 0;
  });
  dsOtherMissiles = dsOtherMissiles.filter(m => {
    m.trail.push({x:m.x,y:m.y}); if(m.trail.length>15)m.trail.shift();
    if (!m.smokeTrail) m.smokeTrail = [];
    m.age = (m.age||0)+1;
    if (m.age%2===0) m.smokeTrail.push({
      x:m.x-Math.cos(m.angle)*8+(Math.random()-0.5)*6,
      y:m.y-Math.sin(m.angle)*8+(Math.random()-0.5)*6,
      vx:(Math.random()-0.5)*0.4, vy:(Math.random()-0.5)*0.4,
      life:1.0, r:4+Math.random()*5,
    });
    m.smokeTrail = m.smokeTrail.filter(function(s){s.x+=s.vx;s.y+=s.vy;s.life-=0.055;return s.life>0;});
    m.x+=m.vx; m.y+=m.vy; m.life--;
    return m.life > 0;
  });

  // Missiles (player)
  dsMissiles = dsMissiles.filter(m => {
    m.trail.push({x:m.x,y:m.y}); if(m.trail.length>15)m.trail.shift();
    // Player missiles hit NPC miners
    if (!m.isEnemy) Object.entries(dsNpcMiners).forEach(function(e2) {
      if (hit) return;
      var _mid = e2[0], _m2 = e2[1];
      var _mdx = m.x-_m2.x, _mdy = m.y-_m2.y;
      if (Math.sqrt(_mdx*_mdx+_mdy*_mdy) < 40) {
        dsSpawnPlayerExplosion(m.x, m.y);
        DSKT()?.emit('deepspace:npcHit', { npcId:_mid, dmg:m.dmg||1000, weapon:'missile', zone:dsZone?(dsZone.n+'-'+dsZone.e):'?' });
        hit = true;
      }
    });
    if (m.isPlayer) {
      m.age = (m.age||0)+1;
      if (!m.smokeTrail) m.smokeTrail=[];
      if (m.age%2===0) m.smokeTrail.push({
        x:m.x-Math.cos(m.angle)*8+(Math.random()-0.5)*6,
        y:m.y-Math.sin(m.angle)*8+(Math.random()-0.5)*6,
        vx:(Math.random()-0.5)*0.4, vy:(Math.random()-0.5)*0.4,
        life:1.0, r:4+Math.random()*5,
      });
      m.smokeTrail = m.smokeTrail.filter(s=>{s.x+=s.vx;s.y+=s.vy;s.life-=0.055;return s.life>0;});
    }
    m.x+=m.vx; m.y+=m.vy; m.life--;
    return m.life > 0;
  });

  // Asteroids drift
  dsAsteroids.forEach(a => { a.x+=a.vx; a.y+=a.vy; a.angle+=a.spin; });

  // Guards AI
  dsUpdateGuards(dt);

  // Advance leviathan -- interpolate head + chain segments
  if(dsLeviathan&&dsLeviathan.segments){
    if(dsLeviathan.interpInterval){
      dsLeviathan.interpT=Math.min(1,(dsLeviathan.interpT||0)+dt/dsLeviathan.interpInterval);
      dsLeviathan.x=dsLeviathan.prevX+(dsLeviathan.nextX-dsLeviathan.prevX)*dsLeviathan.interpT;
      dsLeviathan.y=dsLeviathan.prevY+(dsLeviathan.nextY-dsLeviathan.prevY)*dsLeviathan.interpT;
    }
    dsLeviathan.anglerPulse=(dsLeviathan.anglerPulse||0)+dt*3;
    dsLeviathan.segments[0].x=dsLeviathan.x;dsLeviathan.segments[0].y=dsLeviathan.y;
    for(var _si=1;_si<dsLeviathan.segments.length;_si++){
      var _prev=dsLeviathan.segments[_si-1],_curr=dsLeviathan.segments[_si];
      var _sdx=_prev.x-_curr.x,_sdy=_prev.y-_curr.y,_sdist=Math.sqrt(_sdx*_sdx+_sdy*_sdy);
      if(_sdist>LEV_SEG_SPACING){var _r=(_sdist-LEV_SEG_SPACING)/_sdist;_curr.x+=_sdx*_r*0.6;_curr.y+=_sdy*_r*0.6;}
    }
  }
  // Advance warzone bot interpolation -- needs dt, done here not in dsDraw
  Object.values(dsWarzoneBots).forEach(function(bot) {
    if (bot.interpInterval) {
      bot.interpT = Math.min(1, (bot.interpT||0) + dt / bot.interpInterval);
      bot.x = bot.prevX + (bot.nextX - bot.prevX) * bot.interpT;
      bot.y = bot.prevY + (bot.nextY - bot.prevY) * bot.interpT;
    }
  });
  // Advance race competitor interpolation
  dsGamePositions.forEach(function(p) {
    if (p.interpInterval && p.username !== window._dsUsername) {
      p.interpT = Math.min(1, (p.interpT||0) + dt / p.interpInterval);
      p.x = p.prevX + (p.nextX - p.prevX) * p.interpT;
      p.y = p.prevY + (p.nextY - p.prevY) * p.interpT;
    }
  });

  // Advance miner interpolation
  Object.values(dsNpcMiners).forEach(function(m) {
    if (m.interpInterval) {
      m.interpT = Math.min(1, (m.interpT||0) + dt / m.interpInterval);
      m.x = m.prevX + (m.nextX - m.prevX) * m.interpT;
      m.y = m.prevY + (m.nextY - m.prevY) * m.interpT;
      if (m.targetAngle !== undefined) {
        var da = m.targetAngle - m.angle;
        while (da > Math.PI) da -= Math.PI*2;
        while (da < -Math.PI) da += Math.PI*2;
        m.angle += da * Math.min(1, dt * 6);
      }
    }
  });

  // Enemy bullets
  dsEnemyBullets = dsEnemyBullets.filter(b => {
    b.x+=b.vx; b.y+=b.vy; b.life--;
    if (b.trail) { b.trail.push({x:b.x,y:b.y}); if(b.trail.length>8) b.trail.shift(); }
    if (!dsShip||dsPlayerDead) return b.life>0;
    const dx=b.x-dsShip.x, dy=b.y-dsShip.y;
    if (Math.sqrt(dx*dx+dy*dy)<20) {
      var _ebd = b.dmg||12;
      dsLogHit(b.owner||'Guard', 'Player', _ebd, 'bullet', dsShip.shield, dsShip.shield-_ebd);
      dsHitPlayer(_ebd); return false; }
    return b.life>0;
  });

  // Bullet/missile hits
  dsBullets = dsBullets.filter(b => {
    let hit = false;
    dsGuards.forEach(g => {
      if (!g.alive||hit) return;
      const dx=b.x-g.x, dy=b.y-g.y;
      if (Math.sqrt(dx*dx+dy*dy)<24) {
        var _bdmg = b.dmg||12;
        dsLogHit('Player', g.pilotName||'Guard', _bdmg, 'bullet', g.shield, g.shield-_bdmg);
        dsSpawnExplosion(b.x,b.y,'small');
        dsPlayBulletImpact();
        if (g._serverControlled) {
          // Server-controlled guard -- reduce shield locally immediately (optimistic)
          // broadcast will correct to server value within 200ms
          g.shield = Math.max(0, g.shield - _bdmg);
          g.flashTimer = 0.2;
          DSKT()?.emit('deepspace:npcHit', { npcId:g.id, dmg:_bdmg, weapon:'bullet', zone:dsZone?(dsZone.n+'-'+dsZone.e):'?' });
        } else {
          dsHitGuard(g, _bdmg);
        }
        hit=true;
      }
    });
    if (hit) return false;
    // PvP -- bullets vs other players
    Object.entries(dsOtherPlayers).forEach(function(entry) {
      if (hit) return;
      var sid=entry[0], op=entry[1];
      var dx=b.x-op.x, dy=b.y-op.y;
      if (Math.sqrt(dx*dx+dy*dy)<22) {
        dsSpawnExplosion(b.x,b.y,'small');
        dsPlayBulletImpact();
        DSKT()?.emit('deepspace:pvpHit',{targetSocketId:sid,dmg:b.dmg||250,weapon:'bullet'});
        hit=true;
      }
    });
    if (hit) return false;
    // Player bullets hit NPC miners
    if (!hit) Object.entries(dsNpcMiners).forEach(function(e2) {
      if (hit) return;
      var _mid = e2[0], _m = e2[1];
      var _mdx = b.x-_m.x, _mdy = b.y-_m.y;
      if (Math.sqrt(_mdx*_mdx+_mdy*_mdy) < 24) {
        dsSpawnExplosion(b.x, b.y, 'small'); dsPlayBulletImpact();
        DSKT()?.emit('deepspace:npcHit', { npcId:_mid, dmg:b.dmg||250, weapon:'bullet', zone:dsZone?(dsZone.n+'-'+dsZone.e):'?' });
        hit = true;
      }
    });
    if (hit) return false;
    // Warzone bots
    if (!hit) Object.entries(dsWarzoneBots).forEach(function(entry) {
      if (hit) return;
      var bname=entry[0], bot=entry[1];
      var dx=b.x-bot.x, dy=b.y-bot.y;
      if (Math.sqrt(dx*dx+dy*dy)<24) {
        dsSpawnExplosion(b.x,b.y,'small'); dsPlayBulletImpact();
        if (dsWarzoneBots[bname]) dsWarzoneBots[bname].hitFlash=0.3;
        DSKT()?.emit('deepspace:npcHit',{npcId:'wz_bot_'+bname,dmg:b.dmg||250,weapon:'bullet',zone:dsZone?(dsZone.n+'-'+dsZone.e):'?'});
        hit=true;
      }
    });
    if (hit) return false;
    for (let i=dsAsteroids.length-1;i>=0;i--) {
      const a=dsAsteroids[i];
      const dx=b.x-a.x, dy=b.y-a.y;
      if (Math.sqrt(dx*dx+dy*dy)<a.r) {
        a.hp = (a.hp||a.r*2) - (b.dmg||12)*0.05;
        dsSpawnExplosion(b.x,b.y,'small');
        if (a.hp<=0) { dsSpawnAsteroidOre(a); dsAsteroids.splice(i,1); }
        hit=true; break;
      }
    }
    return !hit;
  });

  dsMissiles = dsMissiles.filter(m => {
    if (m.isEnemy) {
      if (!dsShip||dsPlayerDead) return m.life>0;
      const dx=m.x-dsShip.x, dy=m.y-dsShip.y;
      if (Math.sqrt(dx*dx+dy*dy)<25) {
        var _emd = m.dmg||25;
        dsLogHit(m.faction||'Guard', 'Player', _emd, 'missile', dsShip.shield, dsShip.shield-_emd);
        dsHitPlayer(_emd); dsSpawnExplosion(m.x,m.y,'big'); return false;
      }
      return m.life>0;
    }
    let hit = false;
    // Missiles vs NPC miners
    if (!hit) Object.entries(dsNpcMiners).forEach(function(e2) {
      if (hit) return;
      var _mid = e2[0], _m2 = e2[1];
      var _mdx = m.x-_m2.x, _mdy = m.y-_m2.y;
      if (Math.sqrt(_mdx*_mdx+_mdy*_mdy) < 40) {
        dsSpawnPlayerExplosion(m.x, m.y);
        DSKT()?.emit('deepspace:npcHit', { npcId:_mid, dmg:m.dmg||1000, weapon:'missile', zone:dsZone?(dsZone.n+'-'+dsZone.e):'?' });
        hit = true;
      }
    });
    dsGuards.forEach(g => {
      if (!g.alive||hit) return;
      const dx=m.x-g.x, dy=m.y-g.y;
      if (Math.sqrt(dx*dx+dy*dy)<55) {
        var _mdmg = m.dmg||1000;
        dsLogHit('Player', g.pilotName||'Guard', _mdmg, 'missile', g.shield, g.shield-_mdmg);
        dsHitGuard(g, _mdmg);
        dsSpawnPlayerExplosion(m.x,m.y); hit=true;
      }
    });
    // Warzone bots
    if (!hit) Object.entries(dsWarzoneBots).forEach(function(entry) {
      if (hit) return;
      var bname=entry[0], bot=entry[1];
      var dx=m.x-bot.x, dy=m.y-bot.y;
      if (Math.sqrt(dx*dx+dy*dy)<40) {
        dsSpawnPlayerExplosion(m.x,m.y); dsPlayMissileExplosion();
        if (dsWarzoneBots[bname]) dsWarzoneBots[bname].hitFlash=0.5;
        DSKT()?.emit('deepspace:npcHit',{npcId:'wz_bot_'+bname,dmg:m.dmg||1000,weapon:'missile',zone:dsZone?(dsZone.n+'-'+dsZone.e):'?'});
        hit=true;
      }
    });
    if (hit) return false;
    for (let i=dsAsteroids.length-1;i>=0;i--) {
      const a=dsAsteroids[i];
      const dx=m.x-a.x, dy=m.y-a.y;
      if (Math.sqrt(dx*dx+dy*dy)<a.r+15) {
        a.hp=(a.hp||a.r*2)-80;
        dsSpawnPlayerExplosion(m.x,m.y);
        if(a.hp<=0){dsSpawnAsteroidOre(a);dsAsteroids.splice(i,1);}
        hit=true; break;
      }
    }
    // PvP -- missiles vs other players
    if (!hit) Object.entries(dsOtherPlayers).forEach(function(entry) {
      if (hit) return;
      var sid=entry[0], op=entry[1];
      var dx=m.x-op.x, dy=m.y-op.y;
      if (Math.sqrt(dx*dx+dy*dy)<40) {
        dsSpawnPlayerExplosion(m.x,m.y);
        dsPlayMissileExplosion();
        DSKT()?.emit('deepspace:pvpHit',{targetSocketId:sid,dmg:m.dmg||1000,weapon:'missile'});
        hit=true;
      }
    });
    return !hit;
  });

  // Ore collection
  dsSpaceOre = dsSpaceOre.filter(o => {
    o.x+=o.vx; o.y+=o.vy; o.vx*=0.995; o.vy*=0.995; o.life--;
    const dx=o.x-dsShip.x, dy=o.y-dsShip.y;
    if (Math.sqrt(dx*dx+dy*dy)<35) {
      if (dsCargo.ore < dsCargo.maxOre) {
        dsCargo.ore++;
        DNOTIFY('+ Ore  ' + dsCargo.ore + '/' + dsCargo.maxOre);
      } else { DNOTIFY('Cargo full. Unload at Star Forge.'); }
      return false;
    }
    return o.life>0;
  });

  // Hostility decay
  dsDecayHostility(dt);

  // Star Forge interaction
  // Clear nearest targets each update frame, proximity checks re-set them
  dsNearestStation = null; dsNearestForge = null;
  if (dsForge) dsUpdateForge(dt);

  // Loot crate proximity -- ore auto-collects, parts/bars require E
  dsNearestCrate = null;
  dsLootCrates = dsLootCrates.filter(lc => {
    const dx=lc.x-dsShip.x, dy=lc.y-dsShip.y;
    const dist=Math.sqrt(dx*dx+dy*dy);
    if (dist < 50) {
      // Ore auto-collects
      if (lc.ore > 0 && dsCargo.ore < dsCargo.maxOre) {
        const take = Math.min(lc.ore, dsCargo.maxOre - dsCargo.ore);
        dsCargo.ore += take; lc.ore -= take;
        DNOTIFY('Salvaged ' + take + ' ore from wreckage.');
      }
      // Parts and bars require E interaction
      var _hasLoot = (lc.parts && lc.parts.length > 0) || (lc.bars && lc.bars > 0);
      if (_hasLoot) {
        dsNearestCrate = lc;
      } else if (lc.ore <= 0) {
        return false;
      }
    }
    lc.life = (lc.life||1200) - 1;
    return lc.life > 0;
  });

  // Leviathan bullet collision -- check if any player bullets hit leviathan head
  if (dsLeviathan && dsLeviathan.segments && dsShip) {
    var _lhx=dsLeviathan.segments[0].x, _lhy=dsLeviathan.segments[0].y;
    dsBullets.forEach(function(b) {
      if (b.dead) return;
      if (Math.hypot(b.x-_lhx,b.y-_lhy) < 60) {
        b.dead=true;
        DSKT()?.emit('deepspace:npcHit',{npcId:'leviathan_boss',dmg:b.dmg,weapon:'bullet',zone:dsZone?(dsZone.n+'-'+dsZone.e):'?'});
      }
    });
    dsMissiles.forEach(function(m) {
      if (m.dead) return;
      if (Math.hypot(m.x-_lhx,m.y-_lhy) < 80) {
        m.dead=true;
        DSKT()?.emit('deepspace:npcHit',{npcId:'leviathan_boss',dmg:m.dmg,weapon:'missile',zone:dsZone?(dsZone.n+'-'+dsZone.e):'?'});
      }
    });
  }
  // Scanner
  dsUpdateScanner(dt);
  if (typeof dsUpdateNearbyMenu === 'function') dsUpdateNearbyMenu(dt);

  // Explosions
  dsExplosions = dsExplosions.filter(ex => {
    if (ex.isRing) ex.r = Math.min(ex.r+5, ex.maxR);
    else { ex.x+=ex.vx; ex.y+=ex.vy; ex.vx*=0.93; ex.vy*=0.93; }
    ex.life -= ex.decay;
    return ex.life > 0;
  });

  // Broadcast position
  if (Math.abs(dsShip.vx)>0.1||Math.abs(dsShip.vy)>0.1) {
    DSKT()?.emit('space:move', { x:dsShip.x, y:dsShip.y, angle:dsShip.angle, shield:dsShip.shield, maxShield:dsShip.maxShield, gunsOff:!!dsShip.gunsOff });
    if (dsGameRace && dsZone) DSKT()?.emit('game:raceMove',{x:dsShip.x,y:dsShip.y,zone:dsZone.n+'-'+dsZone.e});
  }
}

// ── GUARD AI ──────────────────────────────────────────────────────────────────
function dsUpdateGuards(dt) {
  if (!dsShip) return;
  const content  = zoneContent(dsZone);
  const zoneFaction = content.faction;

  dsGuards.forEach(g => {
    if (!g.alive) return;
    g.flashTimer = Math.max(0, g.flashTimer-dt);
    if (g.warpCooldown > 0) g.warpCooldown -= dt;
    if (g._serverControlled) {
      if (g.interpInterval) {
        g.interpT = Math.min(1, (g.interpT||0) + dt / g.interpInterval);
        g.x = g.prevX + (g.nextX - g.prevX) * g.interpT;
        g.y = g.prevY + (g.nextY - g.prevY) * g.interpT;
        if (g.targetAngle !== undefined) {
          var da = g.targetAngle - g.angle;
          while (da > Math.PI) da -= Math.PI*2;
          while (da < -Math.PI) da += Math.PI*2;
          g.angle += da * Math.min(1, dt * 8);
        }
      }
      return;
    }

    const dx = dsShip.x - g.x, dy = dsShip.y - g.y;
    const dist = Math.sqrt(dx*dx+dy*dy);
    // Hostile check uses hostility track (separate from rep run count)
    const isHostile  = dsIsHostile(g.faction);
    const isWar      = dsIsWar(g.faction);
    // War = large detection range, hostile = normal range, neutral = no attack
    const attackRange = isWar ? 1200 : isHostile ? 800 : (dsBounty>0&&(g.faction==='pirates'||isWar)) ? 600 : 0;
    // Aggro'd guards (personally attacked) chase player across full zone
    const shouldAttack = (attackRange > 0 && dist < attackRange) || (g._aggro && dist < 2000);

    if (shouldAttack) {
      g.state = 'attack';
    } else if (g.state === 'attack' && !g._aggro && !isWar && dist > attackRange * 1.2) {
      // War guards never stand down -- neutral/hostile guards disengage at distance
      g.state = 'patrol';
    }

    // Border crew — hold position, quip occasionally, attack only if hit
    if (g.state === 'border') {
      // Face opposite faction guards
      g.angle = g.isBorderCrew ? (g.y < DS_CENTER ? Math.PI/2 : -Math.PI/2) : g.angle;
      // Slow drift along border
      g.orbitAngle = (g.orbitAngle||0) + dt * 0.15;
      g.x = g.patrolCenter.x + Math.cos(g.orbitAngle) * 80;
      g.y = g.patrolCenter.y + Math.sin(g.orbitAngle) * 30;
      return; // don't run normal patrol/attack logic
    }

    if (g.state === 'patrol') {
      // Circle patrol
      g.orbitAngle = (g.orbitAngle||0) + dt * 0.4;
      const tx = g.patrolCenter.x + Math.cos(g.orbitAngle) * g.patrolRadius;
      const ty = g.patrolCenter.y + Math.sin(g.orbitAngle) * g.patrolRadius;
      const odx = tx-g.x, ody = ty-g.y;
      const odist = Math.sqrt(odx*odx+ody*ody);
      if (odist>20) {
        g.vx += (odx/odist)*2*dt*60*0.05;
        g.vy += (ody/odist)*2*dt*60*0.05;
      }
      g.angle = Math.atan2(ty-g.y, tx-g.x);
    } else if (g.state === 'attack') {
      // Orbit player like space-client pirate AI
      g.orbitAngle = (g.orbitAngle||0) + dt * 0.9;
      const idealDist = 200;
      const ox = dsShip.x + Math.cos(g.orbitAngle)*idealDist;
      const oy = dsShip.y + Math.sin(g.orbitAngle)*idealDist;
      const odx=ox-g.x, ody=oy-g.y;
      const odist=Math.sqrt(odx*odx+ody*ody);
      if (odist>20) { g.vx+=(odx/odist)*4*dt*60*0.055; g.vy+=(ody/odist)*4*dt*60*0.055; }
      g.angle = Math.atan2(dy,dx);

      // Fire bullets
      g.fireTimer -= dt;
      if (g.fireTimer<=0 && dist<500) {
        g.fireTimer = 0.4 + Math.random()*0.2;
        const bspeed=13, timeToHit=dist/bspeed;
        const px=dsShip.x+dsShip.vx*timeToHit, py=dsShip.y+dsShip.vy*timeToHit;
        const aim = Math.atan2(py-g.y, px-g.x) + (Math.random()-0.5)*0.12;
        dsFireGuardBullet(g, aim);
      }
      // Fire missiles
      g.missileTimer -= dt;
      if (g.missileTimer<=0) { g.missileTimer=3+Math.random(); dsFireGuardMissile(g); }
    }

    const speed = g.state==='attack' ? 4.2 : 2.5;
    const mag = Math.sqrt(g.vx**2+g.vy**2);
    if (mag>speed) { g.vx=(g.vx/mag)*speed; g.vy=(g.vy/mag)*speed; }
    g.vx*=0.96; g.vy*=0.96;
    g.x+=g.vx; g.y+=g.vy;
    g.trail.push({x:g.x,y:g.y}); if(g.trail.length>16)g.trail.shift();
  });
}

var DS_TAUNTS = [
  "COME BACK ROUND HERE AGAIN BOY!", "SEE YOU NEXT TIME COWARD!",
  "YEAH YOU BETTER RUN!", "YOU MADE A BIG MISTAKE.", "THAT WAS YOUR LAST WARNING.",
  "I WILL HUNT YOU DOWN.", "NO ONE ATTACKS US AND LIVES.", "BIG MISTAKE PAL.",
  "YOU PICKED THE WRONG SECTOR.", "WE KNOW YOUR SHIP.",
];
var DS_AGGRO_LINES = [
  "HOSTILE DETECTED. ENGAGING.", "ALL UNITS — ATTACK ON SIGHT.",
  "SCRAMBLE. INTRUDER IN THE ZONE.", "WEAPONS FREE. TARGET ACQUIRED.",
];

function dsPlayBulletImpact() {
  if (!dsAudioCtx) return;
  try {
    var o=dsAudioCtx.createOscillator(), g=dsAudioCtx.createGain();
    o.connect(g); g.connect(dsAudioCtx.destination);
    o.type='square';
    o.frequency.setValueAtTime(300, dsAudioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(80, dsAudioCtx.currentTime+0.08);
    g.gain.setValueAtTime(0.12, dsAudioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, dsAudioCtx.currentTime+0.1);
    o.start(); o.stop(dsAudioCtx.currentTime+0.1);
  } catch(e) {}
}
function dsPlayMissileExplosion() {
  if (!dsAudioCtx) return;
  try {
    var buf=dsAudioCtx.createBuffer(1,Math.floor(dsAudioCtx.sampleRate*0.4),dsAudioCtx.sampleRate);
    var d=buf.getChannelData(0);
    for(var i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2);
    var src=dsAudioCtx.createBufferSource(), gn=dsAudioCtx.createGain();
    src.buffer=buf; src.connect(gn); gn.connect(dsAudioCtx.destination);
    gn.gain.setValueAtTime(0.35, dsAudioCtx.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.001, dsAudioCtx.currentTime+0.4);
    src.start();
  } catch(e) {}
}
function dsHitGuard(g, dmg) {
  g.flashTimer = 0.2;
  if (g._serverControlled) {
    // Server-authoritative -- reduce locally for immediate feedback, server confirms
    g.shield = Math.max(0, g.shield - dmg);
    DSKT()?.emit('deepspace:npcHit', { npcId:g.id, dmg:dmg, weapon:'missile', zone:dsZone?(dsZone.n+'-'+dsZone.e):'?' });
    return;
  }
  g.shield -= dmg; 
  // Guard was hit -- engage immediately and alert nearby allies
  if (g.alive && g.state !== 'attack') {
    g.state = 'attack';
    // Alert all same-faction guards within 1200u
    dsGuards.forEach(function(ally) {
      if (!ally.alive || ally === g || ally.faction !== g.faction) return;
      var adx = ally.x - g.x, ady = ally.y - g.y;
      if (Math.sqrt(adx*adx+ady*ady) < 1200) ally.state = 'attack';
    });
  }
  // Flag hostile immediately when attacked
  if (!g._aggro) {
    g._aggro = true;
    g.state = 'attack';
    // Flag whole faction hostile
    if (FACTIONS[g.faction]) FACTIONS[g.faction].rep = Math.min(-100, (FACTIONS[g.faction].rep||0) - 80);
    // Taunt
    var line = DS_AGGRO_LINES[Math.floor(Math.random()*DS_AGGRO_LINES.length)];
    DNOTIFY('[' + (g.pilotName||'Guard') + '] ' + line);
    // Alert nearby guards
    dsGuards.forEach(function(other) {
      if (other.alive && other.faction === g.faction) { other.state = 'attack'; other._aggro = true; }
    });
  }
  if (g.shield <= 0) dsKillGuard(g);
}
function dsKillGuard(g) {
  g.alive = false;
  // Guard death -- log final blow context
  var _gl = dsCombatLog.filter(function(e){return e.target===(g.pilotName||'Guard');});
  if (_gl.length > 0) {
    var _totalDmg = _gl.reduce(function(sum,e){return sum+e.dmg;},0);
    console.log('[Combat] GUARD DOWN: '+(g.pilotName||'Guard')+' | took '+_totalDmg.toLocaleString()+' total dmg in '+_gl.length+' hits | max shield was '+(_gl[0]?_gl[0].shieldBefore.toLocaleString():'?'));
  }
  // Debug: log slot contents to confirm gear drop
  if (g.ship && g.ship.slots) {
    var slotKeys = Object.keys(g.ship.slots).filter(function(k){return g.ship.slots[k]!=null;});
    console.log('[Loot] Guard killed:', g.pilotName, '| slots:', slotKeys.join(','), '| carriedBars:', g.ship.carriedBars||0);
  } else {
    console.log('[Loot] Guard killed:', g.pilotName, '| no ship/slots data');
  }
  dsSpawnExplosion(g.x, g.y, 'big');
  setTimeout(() => dsSpawnExplosion(g.x+(Math.random()-0.5)*40, g.y+(Math.random()-0.5)*40,'small'),200);
  setTimeout(() => dsSpawnExplosion(g.x, g.y, 'huge'), 400);
  dsPlayAlert();
  // Loot drop — includes guard's tech parts
  var lootParts = [];
  if (g.ship && g.ship.slots) {
    Object.values(g.ship.slots).forEach(function(part) {
      if (part && Math.random() < 0.5) lootParts.push(part); // 50% drop per part
    });
  }
  var lootCrate = {
    x: g.x+(Math.random()-0.5)*40, y: g.y+(Math.random()-0.5)*40,
    ore: 2+Math.floor(Math.random()*4),
    bars: (g.ship && g.ship.carriedBars) ? g.ship.carriedBars : 0,
    parts: lootParts, life: 36000, // 10 minutes at 60fps
  };
  dsLootCrates.push(lootCrate);
  if (lootParts.length) DNOTIFY('⧡ Tech dropped: ' + lootParts.map(function(p){return p.name||p.slot;}).join(', '));
  if (lootCrate.bars > 0) DNOTIFY('★ ' + lootCrate.bars + ' bars on board.');
  DSKT()?.emit('faction:guardKillLoot', {
    factionId: g.faction, parts: lootParts, bars: lootCrate.bars,
    ore: lootCrate.ore, zone: dsZone?(dsZone.n+'-'+dsZone.e):'?',
    x: Math.round(g.x), y: Math.round(g.y), pilot: g.pilotName||'Guard',
  });
  // Bounty update -- server tracks real bounty, client tracks display
  dsBounty += 100;
  dsAddHostility(g.faction, 10);
  DSKT()?.emit('faction:guardKilled',    { faction: g.faction });
  DSKT()?.emit('faction:guardDestroyed', { factionId: g.faction });
  DNOTIFY('Guard eliminated. Bounty: ' + dsBounty);
  // Surviving guards taunt
  var alive = dsGuards.filter(function(g2){ return g2.alive && g2.faction === g.faction; });
  if (alive.length > 0) {
    var taunt = DS_TAUNTS[Math.floor(Math.random()*DS_TAUNTS.length)];
    setTimeout(function(){ DNOTIFY('[' + (alive[0].pilotName||'Guard') + '] ' + taunt); }, 1200);
  }
  // Respawn after 60s
  const respawnFaction = g.faction;
  const respawnSeed    = Date.now() + Math.random()*1000;
  setTimeout(() => {
    if (!dsActive || zoneContent(dsZone).faction !== respawnFaction) return;
    dsSpawnGuards(respawnFaction, 1, respawnSeed);
    DNOTIFY(`New ${FACTIONS[respawnFaction]?.name} pilot arrived.`);
  }, 60000);
}

function dsHitPlayer(dmg) {
  if (dsShip) { dsShip._lastCombat = Date.now(); dsShip.gunsOff = false; }
  if (!dsShip||dsPlayerDead) return;
  // Spawn protection -- 5s immunity on warzone zone entry
  if (window._dsSpawnProtection && Date.now() < window._dsSpawnProtection) return;
  dsShip.shield = Math.max(0, dsShip.shield - dmg);
  dsShip.hitFlash = 0.5;
  dsPlayAlert();
  if (dsShip.shield <= 0) dsKillPlayer();
}
function dsKillPlayer() {
  if (dsPlayerDead) return;
  dsPlayerDead = true;
  // Save position before nulling ship -- explosions need it
  var _dx = dsShip ? dsShip.x : 2000, _dy = dsShip ? dsShip.y : 2000;
  // Dump combat log
  console.log('[Combat] ===== PLAYER DIED -- last ' + dsCombatLog.length + ' hits =====');
  dsCombatLog.forEach(function(e){
    console.log('[Combat] ' + e.attacker + ' → ' + e.target + ' | ' + e.weapon + ' ' + e.dmg.toLocaleString() + ' | shield ' + e.shieldBefore.toLocaleString() + ' → ' + Math.max(0,e.shieldAfter).toLocaleString());
  });
  dsCombatLog = [];
  // Tell server who killed us -- server spawns authoritative loot crate
  var _killerName = window._dsLastAttacker || null;
  DSKT()?.emit('deepspace:killedByPlayer', { killerUsername: _killerName || '' });
  window._dsLastAttacker = null;
  // Ore goes into server salvage crate (handled by destroyGhost)
  dsCargo.ore = 0;
  // Explosions use saved position
  dsSpawnExplosion(_dx, _dy, 'big');
  // Null ship NOW -- blocks any further damage from gas/bullets during death sequence
  dsShip = null;
  setTimeout(function(){ dsSpawnExplosion(_dx, _dy, 'huge'); }, 200);
  setTimeout(function(){ dsSpawnExplosion(_dx + (Math.random()-0.5)*80, _dy + (Math.random()-0.5)*80, 'big'); }, 400);
  setTimeout(function() { dsShowDeathScreen(); }, 800);
}

function dsShowDeathScreen() {
  dsCanvas.style.display = 'none';
  dsAITerminal.style.display = 'none';

  // Tell server to destroy active ship
  if (dsShipData && dsShipData.activeShipId) {
    DSKT()?.emit('ship:destroyActive', { shipId: dsShipData.activeShipId });
    // Remove locally so hangar shows no active ship
    if (dsShipData.ships) {
      dsShipData.ships = dsShipData.ships.filter(function(s){ return s.id !== dsShipData.activeShipId; });
    }
    dsShipData.activeShipId = null;
    if (window._shipMenuData) {
      window._shipMenuData.ships = dsShipData.ships;
      window._shipMenuData.activeShipId = null;
    }
  }

  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:#000;z-index:900;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:Courier New,monospace;text-align:center;padding:40px;';
  ov.innerHTML = '<div style="color:#FF2200;font-size:1.8rem;letter-spacing:0.25em;opacity:0;transition:opacity 2s;" id="dsD1">SHIP DESTROYED</div>'
    + '<div style="color:#555;font-size:0.9rem;opacity:0;transition:opacity 2s;margin-top:12px;" id="dsD2">everything on board was lost</div>'
    + '<div style="color:#333;font-size:0.75rem;opacity:0;transition:opacity 2s;margin-top:16px;font-style:italic;" id="dsD3">set a new active ship before undocking again</div>'
    + '<div style="color:#00FFB8;font-size:0.8rem;opacity:0;transition:opacity 2s;margin-top:32px;" id="dsD4">returning to Station Alpha...</div>';
  document.body.appendChild(ov);
  setTimeout(function(){ var e=document.getElementById('dsD1'); if(e)e.style.opacity='1'; }, 600);
  setTimeout(function(){ var e=document.getElementById('dsD2'); if(e)e.style.opacity='1'; }, 2500);
  setTimeout(function(){ var e=document.getElementById('dsD3'); if(e)e.style.opacity='0.6'; }, 4000);
  setTimeout(function(){ var e=document.getElementById('dsD4'); if(e)e.style.opacity='0.5'; }, 5000);

  // Auto-return to station after 6s
  setTimeout(function() {
    ov.remove();
    // dsFullTeardown sets dsActive=false first, stopping the update loop
    // Only then reset dsPlayerDead so gas/bullets cannot re-trigger death during teardown
    dsFullTeardown();
    dsPlayerDead = false;
    window._forceStationReload = true;
    setTimeout(function() { window.enterStation?.(); }, 300);
  }, 6500);
}

// ── SCANNER ────────────────────────────────────────────────────────────────────
function dsActivateScanner() {
  if (dsScanner.active) return;
  dsScanner.active = true;
  dsScanner.timer  = 0;
  dsScanner.targets= [];
  Object.values(dsNpcMiners).forEach(function(m) {
    var dx=m.x-dsShip.x, dy=m.y-dsShip.y, dist=Math.round(Math.sqrt(dx*dx+dy*dy));
    dsScanner.targets.push({ x:m.x, y:m.y, type:'miner', label:m.username, dist:dist });
  });
  dsPlayWarp();

  var playerNav = dsShip && dsShip.navLevel || 4;
  var scanRadius = 600 + playerNav * 80;

  // Find guards in range
  dsGuards.forEach(function(g) {
    if (!g.alive) return;
    var dx=g.x-dsShip.x, dy=g.y-dsShip.y, dist=Math.sqrt(dx*dx+dy*dy);
    if (dist < scanRadius) {
      dsScanner.targets.push({ x:g.x, y:g.y, type:'enemy', label:g.pilotName||'Guard',
        faction: g.faction, hp: Math.round(g.shield/g.maxShield*100), dist: Math.round(dist) });
    }
  });

  // Find loot crates
  dsLootCrates.forEach(function(lc) {
    var dx=lc.x-dsShip.x, dy=lc.y-dsShip.y, dist=Math.sqrt(dx*dx+dy*dy);
    if (dist < scanRadius) {
      dsScanner.targets.push({ x:lc.x, y:lc.y, type:'loot', label:'Loot Crate', dist:Math.round(dist) });
    }
  });

  // Find faction stations
  dsFactionStations.forEach(function(st) {
    var dx=st.x-dsShip.x, dy=st.y-dsShip.y, dist=Math.sqrt(dx*dx+dy*dy);
    var stRange = st.isHomeStation ? scanRadius*3 : scanRadius*1.5;
    if (dist < stRange) {
      dsScanner.targets.push({ x:st.x, y:st.y, type:'station', label:st.name, dist:Math.round(dist) });
    }
  });

  // Scan other players -- nav-gated range
  var playerScanR = dsShip.navLevel < 5 ? 350 : dsShip.navLevel < 8 ? 650 : scanRadius;
  Object.entries(dsOtherPlayers).forEach(function(entry) {
    var sid = entry[0], op = entry[1];
    var dx = op.x - dsShip.x, dy = op.y - dsShip.y, dist = Math.sqrt(dx*dx+dy*dy);
    if (dist < playerScanR) {
      dsScanner.targets.push({ x:op.x, y:op.y, type:'player', label:op.username, socketId:sid, quality:op.quality||'Common', shipClass:op.shipClass||'fighter', dist:Math.round(dist) });
    }
  });
  var found = dsScanner.targets.length;
  dsQueueAI(found > 0 ? 'Scan: ' + found + ' contact' + (found>1?'s':'') + ' detected.' : 'Scan: sector clear.');
}

function dsUpdateScanner(dt) {
  if (!dsScanner.active) {
    if (dsScanner.zoom > 1.0) dsScanner.zoom = Math.max(1.0, dsScanner.zoom - dt * 0.8);
    return;
  }
  dsScanner.timer += dt;
  dsScanner.zoom += (2.0 - dsScanner.zoom) * dt * 2.5;
  if (dsScanner.timer >= dsScanner.duration) {
    dsScanner.active = false;
    dsScanner.targets.forEach(function(t){ t.fadeTimer = 20; });
  }
}

function dsDrawScanner(W, H) {
  var t = Date.now() * 0.001;
  if (dsScanner.active) {
    var prog = dsScanner.timer / dsScanner.duration;
    var ringR = prog * Math.min(W,H) * 0.48;
    dsCtx.beginPath(); dsCtx.arc(W/2,H/2,ringR,0,Math.PI*2);
    dsCtx.strokeStyle='rgba(0,255,180,'+(1-prog)*0.5+')'; dsCtx.lineWidth=2; dsCtx.stroke();
    if (ringR>40) {
      dsCtx.beginPath(); dsCtx.arc(W/2,H/2,ringR*0.6,0,Math.PI*2);
      dsCtx.strokeStyle='rgba(0,200,255,'+(1-prog)*0.3+')'; dsCtx.lineWidth=1; dsCtx.stroke();
    }
    dsCtx.fillStyle='rgba(0,255,180,'+(0.6+Math.sin(t*8)*0.3)+')';
    dsCtx.font='bold 11px Courier New'; dsCtx.textAlign='center';
    dsCtx.fillText('SCANNING...', W/2, 80); dsCtx.textAlign='left';
  }

  // Draw target arrows
  dsScanner.targets.forEach(function(tgt) {
    if (!dsShip) return;
    if (!dsScanner.active) {
      tgt.fadeTimer = Math.max(0, (tgt.fadeTimer||0) - 0.016);
      if (tgt.fadeTimer <= 0) return;
    }
    var alpha = dsScanner.active ? 1 : Math.min(1, (tgt.fadeTimer||0)/5);
    if (alpha <= 0) return;

    var col = tgt.type==='enemy' ? [255,60,60] : tgt.type==='loot' ? [255,200,50] : [0,200,255];
    var sx = W/2 + (tgt.x - dsShip.x);
    var sy = H/2 + (tgt.y - dsShip.y);
    var onScreen = sx>20 && sx<W-20 && sy>20 && sy<H-20;

    if (onScreen) {
      if (tgt.type==='enemy') {
        dsCtx.strokeStyle='rgba('+col+','+alpha*0.8+')'.replace('rgba('+col,'rgba('+col[0]+','+col[1]+','+col[2]);
        dsCtx.lineWidth=1.5; dsCtx.strokeRect(sx-18,sy-18,36,36);
      }
      dsCtx.fillStyle='rgba('+col[0]+','+col[1]+','+col[2]+','+alpha*0.9+')';
      dsCtx.font='bold 9px Courier New'; dsCtx.textAlign='center';
      dsCtx.fillText(tgt.label, sx, sy-24);
      if (tgt.hp !== undefined) dsCtx.fillText('HP '+tgt.hp+'%  '+tgt.dist+'u', sx, sy-14);
      else dsCtx.fillText(tgt.dist+'u', sx, sy-14);
      dsCtx.textAlign='left';
    } else {
      var angle = Math.atan2(tgt.y-dsShip.y, tgt.x-dsShip.x);
      var margin = 38;
      var ax = Math.max(margin, Math.min(W-margin, W/2+Math.cos(angle)*(Math.min(W,H)/2-margin)));
      var ay = Math.max(margin, Math.min(H-margin, H/2+Math.sin(angle)*(Math.min(W,H)/2-margin)));
      dsCtx.save(); dsCtx.translate(ax,ay); dsCtx.rotate(angle);
      dsCtx.fillStyle='rgba('+col[0]+','+col[1]+','+col[2]+','+alpha*0.9+')';
      dsCtx.beginPath(); dsCtx.moveTo(14,0); dsCtx.lineTo(-8,-7); dsCtx.lineTo(-8,7);
      dsCtx.closePath(); dsCtx.fill(); dsCtx.restore();
      dsCtx.fillStyle='rgba('+col[0]+','+col[1]+','+col[2]+','+alpha*0.7+')';
      dsCtx.font='bold 8px Courier New'; dsCtx.textAlign='center';
      dsCtx.fillText(tgt.dist+'u', ax, ay+16); dsCtx.fillText(tgt.label, ax, ay+25);
      dsCtx.textAlign='left';
    }
  });

  // scan hint moved to dsDrawZoneHUD as styled button
}

// ── STATION INTERACTION ───────────────────────────────────────────────────────

function dsOpenLootPanel(lc) {
  if (document.getElementById('dsLootPanel')) return;
  var RARITY_COLORS = {Mythic:'#FF2244',Legendary:'#FFB300',Epic:'#AA44FF',Rare:'#4488FF',Uncommon:'#44CC44',Common:'#AAAAAA'};
  var SLOT_LABELS_S = {engine:'ENGINE',shield:'SHIELD',weapon1:'CANNON',weapon2:'MISSILE',warp:'WARP',nav:'NAV'};
  var SLOT_ICONS_S  = {engine:'⚡',shield:'🛡',weapon1:'🔫',weapon2:'💥',warp:'🌀',nav:'🧭'};
  var slotsUsed = dsSpaceParts.length;
  var slotsMax  = 6;

  var ov = document.createElement('div');
  ov.id = 'dsLootPanel';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:850;display:flex;align-items:center;justify-content:center;font-family:Courier New,monospace;';

  var box = document.createElement('div');
  box.style.cssText = 'background:rgba(0,8,22,0.97);border:1px solid rgba(100,200,255,0.3);border-radius:14px;padding:24px;max-width:520px;width:90%;';

  // Header
  var hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
  hdr.innerHTML = '<span style="color:#00FFB8;font-size:14px;font-weight:bold;letter-spacing:0.15em;">WRECKAGE</span>'
    +'<span style="color:rgba(150,200,255,0.45);font-size:11px;">SPACE BAG: '+slotsUsed+'/'+slotsMax+' PARTS</span>';
  box.appendChild(hdr);

  // Bars row
  if (lc.bars && lc.bars > 0) {
    var bRow = document.createElement('div');
    bRow.style.cssText = 'background:rgba(255,200,50,0.08);border:1px solid rgba(255,200,50,0.3);border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;';
    bRow.innerHTML = '<span style="color:#FFDD44;font-size:13px;font-weight:bold;">★ '+lc.bars.toLocaleString()+' bars</span>';
    var grabBars = document.createElement('button');
    grabBars.className = 'ship-btn';
    grabBars.style.cssText = 'font-size:11px;padding:5px 14px;';
    grabBars.textContent = 'GRAB';
    grabBars.addEventListener('click', function() {
      var grabbed = lc.bars;
      if (lc.serverId) {
        DSKT()?.emit('deepspace:grabNpcLoot', { crateId:lc.serverId, wantBars:true, wantOre:false, wantPartIds:[] });
      } else {
        DSKT()?.emit('deepspace:grabBars', { bars:grabbed, zone:dsZone?(dsZone.n+'-'+dsZone.e):'?', cratePilot:lc.pilotName||'wreckage' });
      }
      DNOTIFY('★ +'+grabbed.toLocaleString()+' bars secured in cargo hold.');
      lc.bars = 0;
      ov.remove();
    });
    bRow.appendChild(grabBars);
    box.appendChild(bRow);
  }

  // Parts grid
  if (lc.parts && lc.parts.length > 0) {
    var pHdr = document.createElement('div');
    pHdr.style.cssText = 'color:rgba(150,200,255,0.45);font-size:10px;letter-spacing:0.1em;margin-bottom:10px;';
    pHdr.textContent = lc.parts.length + ' PART' + (lc.parts.length>1?'S':'') + ' — click to grab individually';
    box.appendChild(pHdr);

    var grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:14px;';

    lc.parts.forEach(function(part, idx) {
      var rc = RARITY_COLORS[part.rarity] || '#888';
      var full = slotsUsed >= slotsMax;
      var card = document.createElement('div');
      card.style.cssText = 'border:2px solid '+rc+(full?'44':'88')+';border-radius:8px;padding:8px;cursor:'+(full?'not-allowed':'pointer')+';opacity:'+(full?'0.4':'1')+';background:rgba(0,8,22,0.9);';
      card.innerHTML = '<div style="font-size:9px;color:'+rc+';font-weight:bold;letter-spacing:0.06em;margin-bottom:3px;">'+part.rarity.toUpperCase()+'</div>'
        +'<div style="font-size:9px;color:rgba(150,200,255,0.5);margin-bottom:4px;">'+(SLOT_ICONS_S[part.slot]||'⬡')+' '+(SLOT_LABELS_S[part.slot]||part.slot)+'</div>'
        +'<div style="color:#CCEEFF;font-size:11px;font-weight:bold;line-height:1.3;margin-bottom:4px;">'+part.name+'</div>';
      if (!full) {
        card.addEventListener('click', function() {
          if (lc.serverId) {
            DSKT()?.emit('deepspace:grabNpcLoot', { crateId:lc.serverId, wantBars:false, wantOre:false, wantPartIds:[part.id] });
          } else {
            dsSpaceParts.push(part);
            lc.parts.splice(idx, 1);
            DSKT()?.emit('deepspace:lootParts', { parts:[part] });
          }
          slotsUsed++;
          DNOTIFY('⧡ Grabbed: '+part.name);
          ov.remove();
          if ((lc.parts && lc.parts.length > 0) || (lc.bars && lc.bars > 0)) dsOpenLootPanel(lc);
        });
      }
      grid.appendChild(card);
    });
    box.appendChild(grid);

    // Grab all button
    var grabAll = document.createElement('button');
    var canGrab = Math.min(lc.parts.length, slotsMax - slotsUsed);
    grabAll.className = 'ship-btn';
    grabAll.style.cssText = 'width:100%;font-size:12px;padding:9px;margin-bottom:10px;'+(canGrab<=0?'opacity:0.35;cursor:not-allowed;':'');
    grabAll.disabled = canGrab <= 0;
    grabAll.textContent = canGrab > 0 ? 'GRAB ALL ('+canGrab+' of '+lc.parts.length+')' : 'SPACE BAG FULL ('+slotsMax+'/'+slotsMax+')';
    grabAll.addEventListener('click', function() {
      if (grabAll.disabled) return;
      var toGrab = lc.parts.slice(0, canGrab);
      if (lc.serverId) {
        DSKT()?.emit('deepspace:grabNpcLoot', { crateId:lc.serverId, wantBars:false, wantOre:false,
          wantPartIds:toGrab.map(function(p){return p.id;}) });
      } else {
        lc.parts.splice(0, canGrab);
        toGrab.forEach(function(p){ dsSpaceParts.push(p); });
        DSKT()?.emit('deepspace:lootParts', { parts:toGrab });
      }
      toGrab.forEach(function(p){ dsSpaceParts.push(p); });
      DSKT()?.emit('deepspace:lootParts', { parts: toGrab });
      DNOTIFY('⧡ Grabbed '+toGrab.length+' part'+(toGrab.length>1?'s':'')+' from wreckage.');
      ov.remove();
      // If parts remain and bag is now full, reopen showing what's left
      if (lc.parts && lc.parts.length > 0) {
        DNOTIFY('Space bag full (' + slotsMax + '/' + slotsMax + ') — ' + lc.parts.length + ' parts remain in wreckage.');
        setTimeout(function(){ dsOpenLootPanel(lc); }, 300);
      }
    });
    box.appendChild(grabAll);
  }

  // Close button
  var closeBtn = document.createElement('button');
  closeBtn.className = 'ship-btn ship-btn-red';
  closeBtn.style.cssText = 'width:100%;font-size:11px;padding:7px;';
  closeBtn.textContent = 'LEAVE WRECKAGE';
  closeBtn.addEventListener('click', function() { ov.remove(); });
  box.appendChild(closeBtn);

  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
  ov.appendChild(box);
  document.body.appendChild(ov);
}

function dsInteractNearest() {
  if (dsNearestStation) {
    if (dsNearestStation.isHomeStation) { dsDockAtHome(); return; }
    dsOpenStationMenu(dsNearestStation);
    return;
  }
  // Check forge dock proximity handled in updateForge
}

// ── FACTION SHOP ──────────────────────────────────────────────────────────────
function dsOpenFactionShop(st, parentOv) {
  if (parentOv) parentOv.remove();
  var f = FACTIONS[st.faction] || {};
  var RC = {Mythic:'#FF2244',Legendary:'#FFB300',Epic:'#AA44FF',Rare:'#4488FF',Uncommon:'#44CC44',Common:'#AAAAAA'};
  var SI = {engine:'⚡',shield:'🛡',weapon1:'🔫',weapon2:'💥',warp:'🌀',nav:'🧭'};
  var ov2 = document.createElement('div');
  ov2.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:855;display:flex;align-items:center;justify-content:center;font-family:Courier New,monospace;';
  var box = document.createElement('div');
  box.style.cssText = 'background:rgba(0,8,22,0.97);border:1px solid '+(f.color||'#0088FF')+'55;border-radius:14px;padding:24px;max-width:540px;width:92%;max-height:80vh;overflow-y:auto;scrollbar-width:thin;';
  var hdr = document.createElement('div');
  hdr.style.cssText = 'color:'+(f.color||'#FFF')+';font-size:14px;font-weight:bold;letter-spacing:0.1em;margin-bottom:4px;';
  hdr.textContent = (f.name||st.faction) + ' — TECH SHOP';
  box.appendChild(hdr);
  var sub = document.createElement('div');
  sub.id = '_shopSub'; sub.style.cssText = 'color:rgba(150,200,255,0.4);font-size:10px;margin-bottom:16px;';
  sub.textContent = 'Loading inventory...';
  box.appendChild(sub);
  var grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;margin-bottom:12px;';
  box.appendChild(grid);
  var closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'display:block;width:100%;background:none;border:none;color:rgba(255,255,255,0.25);font-family:Courier New,monospace;font-size:11px;padding:8px;cursor:pointer;';
  closeBtn.textContent = '[ CLOSE ]';
  box.appendChild(closeBtn);
  function _handler(data) {
    if (data.factionId !== st.faction) return;
    sub.textContent = (data.parts||[]).length + ' parts available';
    grid.innerHTML = '';
    if (!data.parts||!data.parts.length) {
      grid.innerHTML = '<div style="color:rgba(150,200,255,0.3);font-size:12px;padding:20px;text-align:center;">No parts in stock right now.</div>';
      return;
    }
    data.parts.forEach(function(part) {
      var rc = RC[part.rarity]||'#888', price = part.price||500;
      var card = document.createElement('div');
      card.style.cssText = 'background:rgba(0,12,28,0.85);border:2px solid '+rc+'55;border-radius:8px;padding:10px;';
      var cHdr = document.createElement('div');
      cHdr.innerHTML = '<span style="font-size:9px;color:'+rc+';font-weight:bold;">'+part.rarity.toUpperCase()+'</span>'
        +' <span style="font-size:9px;color:rgba(150,200,255,0.4);">'+(SI[part.slot]||'⧡')+' '+part.slot+'</span>';
      card.appendChild(cHdr);
      var cName = document.createElement('div');
      cName.style.cssText = 'color:#CCEEFF;font-size:11px;font-weight:bold;margin:4px 0 6px;line-height:1.3;';
      cName.textContent = part.name; card.appendChild(cName);
      if (part.passive) { var cp=document.createElement('div'); cp.style.cssText='font-size:9px;color:#FFAA44;margin-bottom:2px;'; cp.textContent=part.passive; card.appendChild(cp); }
      if (part.special) { var cs=document.createElement('div'); cs.style.cssText='font-size:9px;color:#FF4488;margin-bottom:4px;'; cs.textContent=part.special; card.appendChild(cs); }
      var bb = document.createElement('button'); bb.className='ship-btn';
      bb.style.cssText = 'width:100%;font-size:10px;padding:6px;';
      bb.textContent = 'BUY — ' + price.toLocaleString() + ' bars';
      (function(pid,pr,pname){
        bb.addEventListener('click',function(){
          DSKT()?.emit('faction:buyPart',{factionId:st.faction,partId:pid,price:pr});
          bb.disabled=true; bb.textContent='PURCHASING...';
          DNOTIFY('Purchasing '+pname+'...');
        });
      })(part.id,price,part.name);
      card.appendChild(bb); grid.appendChild(card);
    });
  }
  DSKT()?.on('faction:vendorStock', _handler);
  function _close() { DSKT()?.off('faction:vendorStock',_handler); ov2.remove(); }
  closeBtn.addEventListener('click', _close);
  ov2.addEventListener('click', function(e){ if(e.target===ov2) _close(); });
  ov2.appendChild(box); document.body.appendChild(ov2);
  DSKT()?.emit('faction:getVendorStock', { factionId: st.faction });
}

function dsOpenStationMenu(st) {
  if (document.getElementById('dsStationMenu')) return;
  var f = FACTIONS[st.faction] || {};
  var rep = f.rep || 0;
  var repLabel = rep >= 50 ? 'ALLIED' : rep >= 0 ? 'NEUTRAL' : rep >= -50 ? 'CAUTIOUS' : 'HOSTILE';
  var repColor = rep >= 50 ? '#44FF88' : rep >= 0 ? '#FFDD44' : rep >= -50 ? '#FF8800' : '#FF4444';

  var ov = document.createElement('div');
  ov.id = 'dsStationMenu';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:850;display:flex;align-items:center;justify-content:center;font-family:Courier New,monospace;';

  var box = document.createElement('div');
  box.style.cssText = 'background:rgba(0,8,22,0.97);border:1px solid '+f.color+'55;border-radius:14px;padding:28px 32px;max-width:440px;width:90%;';

  var title = document.createElement('div');
  title.style.cssText = 'color:'+f.color+';font-size:16px;font-weight:bold;letter-spacing:0.1em;margin-bottom:4px;';
  title.textContent = st.name;
  box.appendChild(title);

  var repDiv = document.createElement('div');
  repDiv.style.cssText = 'color:'+repColor+';font-size:11px;margin-bottom:16px;letter-spacing:0.08em;';
  repDiv.textContent = 'STANDING: ' + repLabel + ' (' + rep + ')';
  box.appendChild(repDiv);

  var desc = document.createElement('div');
  desc.style.cssText = 'color:rgba(150,200,255,0.45);font-size:12px;line-height:1.7;margin-bottom:20px;';
  desc.textContent = f.desc || 'A faction station.';
  box.appendChild(desc);

  // Options
  var options = [
    { label: 'Request Mining Permit', fn: function() { dsRequestPermit(st); ov.remove(); } },
    { label: 'Tech Shop', fn: function() { dsOpenFactionShop(st, ov); } },
    { label: 'Submit Ore Delivery', fn: function() { dsSubmitOre(st); ov.remove(); } },
  ];
  if (st.isMineCheckpoint) options.splice(0,1); // no permit at checkpoint

  options.forEach(function(opt) {
    var btn = document.createElement('button');
    btn.style.cssText = 'display:block;width:100%;background:rgba(0,20,50,0.7);border:1px solid '+(f.color||'#0088FF')+'44;color:rgba(150,200,255,0.8);font-family:Courier New,monospace;font-size:12px;padding:10px 14px;border-radius:7px;cursor:pointer;margin-bottom:8px;text-align:left;letter-spacing:0.06em;';
    btn.textContent = (opt.disabled ? '  ' : '→ ') + opt.label;
    if (opt.disabled) btn.style.opacity = '0.4';
    btn.addEventListener('click', opt.fn);
    box.appendChild(btn);
  });

  var closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'display:block;width:100%;background:none;border:none;color:rgba(255,255,255,0.25);font-family:Courier New,monospace;font-size:11px;padding:8px;cursor:pointer;margin-top:4px;';
  closeBtn.textContent = '[ CLOSE ]';
  closeBtn.addEventListener('click', function(){ ov.remove(); });
  box.appendChild(closeBtn);

  ov.appendChild(box);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
  document.body.appendChild(ov);
}

function dsRequestPermit(st) {
  var hostility = FACTIONS[st.faction]?.hostility || 0;
  if (hostility >= 100) { DNOTIFY('[' + (FACTIONS[st.faction]?.name||st.faction) + '] You are at war with us. We will not sell you a permit.'); return; }
  if (hostility >= 50)  { DNOTIFY('[' + (FACTIONS[st.faction]?.name||st.faction) + '] Your standing is too hostile for a permit.'); return; }
  DSKT()?.emit('faction:buyPermit', { faction: st.faction });
}

function dsShowPermitGranted(st) {
  var f = FACTIONS[st.faction] || {};
  var zoneMap = { verus:'Zone 4-5', slv:'Zone 3-2', omig:'Zone 2-2', pirates:'Zone 1-5' };
  var mineZone = zoneMap[st.faction] || 'their territory';
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:860;display:flex;align-items:center;justify-content:center;font-family:Courier New,monospace;';
  ov.innerHTML = '<div style="max-width:460px;text-align:center;padding:28px;background:rgba(0,8,22,0.98);border:1px solid '+(f.color||'#333')+'55;border-radius:14px;">'
    + '<div style="color:'+(f.color||'#FFF')+';font-size:15px;font-weight:bold;margin-bottom:12px;">PERMIT GRANTED</div>'
    + '<div style="color:rgba(150,255,150,0.8);font-size:12px;line-height:1.9;margin-bottom:20px;">'
    + 'You are cleared to mine in <b style="color:'+(f.color||'#FFF')+'">' + mineZone + '</b>.<br>'
    + 'Fly there and blast asteroids to collect ore.<br>'
    + 'Take the ore to the <b style="color:#FFCC44;">Star Forge at Zone 3-3</b> to smelt it.<br>'
    + 'Then <b style="color:rgba(255,150,100,0.9)">bring the bars back to us</b> for payment.<br>'
    + '<span style="color:rgba(255,80,80,0.7);font-size:11px;">Don\'t think of anything funny. We will know.</span>'
    + '</div>'
    + '<button style="background:rgba(0,20,50,0.8);border:1px solid '+(f.color||'#FFF')+'44;color:'+(f.color||'#FFF')+';font-family:Courier New,monospace;font-size:12px;padding:10px 24px;border-radius:8px;cursor:pointer;">UNDERSTOOD</button>'
    + '</div>';
  ov.querySelector('button').addEventListener('click', function(){ ov.remove(); });
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
  document.body.appendChild(ov);
}

function dsShowPermitDenied(st) {
  var f = FACTIONS[st.faction] || {};
  DNOTIFY('[' + f.name + '] Access denied. Improve your standing first.');
}

function dsSubmitOre(st) {
  if (dsCargo.ore <= 0) { DNOTIFY('No ore to deliver.'); return; }
  var ore = dsCargo.ore;
  var keep = Math.floor(ore * 0.6);
  var faction = Math.floor(ore * 0.4);
  dsCargo.ore = 0;
  DSKT()?.emit('deepspace:returnCargo', { ore: keep });
  DSKT()?.emit('faction:confirmDelivery', { faction: st.faction });
  DNOTIFY('Delivered ' + ore + ' ore. You keep ' + keep + ' bars. ' + FACTIONS[st.faction]?.name + ' gets ' + faction + '.');
  if (FACTIONS[st.faction]) FACTIONS[st.faction].rep = Math.min(100, (FACTIONS[st.faction].rep||0) + 10);
}

// ── STAR FORGE ─────────────────────────────────────────────────────────────────
function dsUpdateForge(dt) {
  if (!dsForge || !dsShip) return;
  var now = Date.now();

  // Cancelling — 10s countdown then abort
  if (dsForgeCancelling) {
    dsForgeCancelTimer -= dt;
    if (dsForgeCancelTimer <= 0) {
      // Cancel complete — lose ore
      dsForgeCancelling = false;
      dsForgeCancelTimer = 0;
      if (dsForgeDocked) {
        dsForgeDocked.occupied = false;
        dsForgeDocked.ownerName = null;
        dsForgeDocked = null;
      }
      dsForgeOreIn = 0;
      document.getElementById('dsForgeCancelUI')?.remove();
      dsQueueAI("Ejected from Star Forge. Ore lost.");
      DNOTIFY('Forge cancelled. All ore lost.');
    }
    return; // don't process while cancelling
  }

  // Check dock proximity — E key triggers dock (handled in dsInteractNearest/zone)
  if (!dsForgeDocked) {
    dsForge.dockPoints.forEach(function(dp) {
      if (dp.occupied) return;
      var ddx=dsShip.x-dp.x, ddy=dsShip.y-dp.y;
      if (Math.sqrt(ddx*ddx+ddy*ddy) < 65) {
        dp._playerNear = true;
        dsNearestForge = dp; // set for E key handler
      } else {
        dp._playerNear = false;
      }
    });
  } else {
    // Processing — check complete
    if (now >= dsForgeDocked.processingUntil) {
      var bars = dsForgeOreIn;
      dsShipBars += bars;
      dsForgeDocked.occupied = false;
      dsForgeDocked.ownerName = null;
      dsForgeDocked = null;
      dsForgeOreIn = 0;
      document.getElementById('dsForgeCancelUI')?.remove();
      DSKT()?.emit('deepspace:forgeComplete');
      dsQueueAI("Processing complete. " + bars + " bars loaded. Dock at Station Alpha to collect.");
      DNOTIFY('+ ' + bars + ' bars on board. Dock safely to collect.');
    }
  }
}

function dsStartForge(dp) {
  if (dsForgeDocked || dsCargo.ore <= 0) return;
  dsForgeDocked = dp;
  dp.occupied = true;
  dp.ownerName = DUSR();
  dsForgeOreIn = dsCargo.ore;
  dp.processingUntil = Date.now() + 300000; // 5 min
  dsCargo.ore = 0;
  dsForgeCancelling = false;
  dsQueueAI("Docked at Star Forge. Processing " + dsForgeOreIn + " ore. 5 minutes.");
  DNOTIFY('Star Forge: processing started. 5 minutes. Press [E] or use cancel button to abort (10s delay, lose all ore).');
  dsShowForgeCancelUI();
}

function dsCancelForge() {
  if (!dsForgeDocked || dsForgeCancelling) return;
  dsForgeCancelling = true;
  dsForgeCancelTimer = 10;
  DNOTIFY('Cancelling forge... 10 seconds. All ore will be lost.');
  var bar = document.getElementById('dsForgeCancelBar');
  if (bar) bar.style.transition = 'width 10s linear'; bar && (bar.style.width = '0%');
}

function dsShowForgeCancelUI() {
  var existing = document.getElementById('dsForgeCancelUI');
  if (existing) existing.remove();

  var ui = document.createElement('div');
  ui.id = 'dsForgeCancelUI';
  ui.style.cssText = 'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);'
    + 'background:rgba(0,8,22,0.95);border:1px solid rgba(255,140,0,0.5);border-radius:10px;'
    + 'padding:12px 20px;z-index:850;font-family:Courier New,monospace;min-width:300px;text-align:center;';
  ui.innerHTML = '<div style="color:#FFAA00;font-size:11px;font-weight:bold;letter-spacing:0.1em;margin-bottom:8px;">⚙ STAR FORGE PROCESSING</div>'
    + '<div style="color:rgba(150,200,255,0.5);font-size:10px;margin-bottom:10px;">Ore is being smelted. Do not leave zone.</div>'
    + '<div style="background:rgba(0,0,0,0.5);border-radius:4px;height:6px;margin-bottom:10px;overflow:hidden;">'
    + '<div id="dsForgeCancelBar" style="width:100%;height:6px;background:#FFAA00;border-radius:4px;"></div></div>'
    + '<button id="dsForgeCancelBtn" style="background:rgba(50,0,0,0.8);border:1px solid rgba(255,50,50,0.4);'
    + 'color:rgba(255,100,100,0.8);font-family:Courier New,monospace;font-size:11px;padding:6px 18px;border-radius:6px;cursor:pointer;letter-spacing:0.08em;">CANCEL (lose all ore)</button>';

  document.body.appendChild(ui);
  document.getElementById('dsForgeCancelBtn').addEventListener('click', function() {
    dsCancelForge();
    document.getElementById('dsForgeCancelBtn').textContent = 'Cancelling... 10s';
    document.getElementById('dsForgeCancelBtn').disabled = true;
  });
}

// ── ORE SPAWNING ──────────────────────────────────────────────────────────────
function dsSpawnAsteroidOre(a) {
  const count = 2 + Math.floor(a.r/15);
  for (let i=0;i<count;i++) {
    const angle=Math.random()*Math.PI*2, speed=1+Math.random()*2;
    dsSpaceOre.push({
      x:a.x+(Math.random()-0.5)*a.r, y:a.y+(Math.random()-0.5)*a.r,
      vx:Math.cos(angle)*speed+a.vx, vy:Math.sin(angle)*speed+a.vy,
      life:600, r:5+Math.random()*4,
    });
  }
  dsSpawnExplosion(a.x,a.y,'big');
}

// ── EXPLOSIONS ────────────────────────────────────────────────────────────────
function dsSpawnExplosion(x,y,size) {
  const count=size==='small'?8:size==='big'?18:32;
  const maxR=size==='small'?0.12:size==='big'?0.22:0.35;
  for (let i=0;i<count;i++) {
    const angle=Math.random()*Math.PI*2, speed=(0.5+Math.random())*maxR*60;
    dsExplosions.push({
      x,y, vx:Math.cos(angle)*speed*0.5, vy:Math.sin(angle)*speed*0.5,
      life:1.0, decay:0.03+Math.random()*0.04,
      r:(2+Math.random()*5)*(size==='huge'?2.5:size==='big'?1.5:1),
      color:`hsl(${20+Math.random()*40},100%,${60+Math.random()*30}%)`,
    });
  }
}
function dsSpawnPlayerExplosion(x,y) {
  dsExplosions.push({ x,y,vx:0,vy:0, life:1.0,decay:0.045, r:8,maxR:90, isRing:true, color:'hsl(200,100%,70%)' });
  const colors=['hsl(200,100%,70%)','hsl(160,100%,65%)','hsl(180,100%,75%)'];
  for (let i=0;i<24;i++) {
    const a=Math.random()*Math.PI*2, s=1.5+Math.random()*3;
    dsExplosions.push({ x,y, vx:Math.cos(a)*s, vy:Math.sin(a)*s,
      life:1.0, decay:0.025+Math.random()*0.02, r:3+Math.random()*5,
      color:colors[i%3], isRing:false });
  }
}

// ── DRAW ──────────────────────────────────────────────────────────────────────
function dsDraw() {
  if (!dsCtx) return;
  const W=dsCanvas.width, H=dsCanvas.height;
  dsCtx.clearRect(0,0,W,H);
  const sx=W/2-dsCameraX, sy=H/2-dsCameraY;
  const zoom = dsScanner.zoom || 1.0;

  dsCtx.save();
  if (zoom !== 1.0) {
    dsCtx.translate(W/2, H/2);
    dsCtx.scale(1/zoom, 1/zoom);
    dsCtx.translate(-W/2, -H/2);
  }
  dsCtx.translate(sx,sy);

  // Nebula
  dsNebula.forEach(n => {
    const g=dsCtx.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r);
    g.addColorStop(0,`hsla(${n.hue},70%,60%,${n.alpha})`);
    g.addColorStop(1,'transparent');
    dsCtx.fillStyle=g; dsCtx.beginPath(); dsCtx.arc(n.x,n.y,n.r,0,Math.PI*2); dsCtx.fill();
  });

  // Stars
  const time=Date.now()*0.001;
  dsStars.forEach(s => {
    const parallax=[0.2,0.5,0.8][s.layer]||0.5;
    const twinkle=s.brightness*(0.7+Math.sin(time*2+s.twinkle)*0.3);
    if (s.isGalaxy) {
      const g=dsCtx.createRadialGradient(s.x,s.y,0,s.x,s.y,s.r*3);
      g.addColorStop(0,`hsla(${s.hue},60%,70%,${twinkle*0.6})`);
      g.addColorStop(1,'transparent');
      dsCtx.fillStyle=g; dsCtx.beginPath(); dsCtx.arc(s.x,s.y,s.r*3,0,Math.PI*2); dsCtx.fill();
    }
    dsCtx.beginPath(); dsCtx.arc(s.x,s.y,s.r,0,Math.PI*2);
    dsCtx.fillStyle=`rgba(255,255,255,${twinkle})`; dsCtx.fill();
  });

  // Zone boundary arrows
  dsDrawZoneBoundaries(W,H);

  // Star Forge
  if (dsForge) dsDrawForge();

  // Faction stations
  dsDrawArenaWalls();
  dsFactionStations.forEach(st => dsDrawFactionStation(st));
  // Home station beacon
  if (dsHomeStation) dsDrawHomeStation(dsHomeStation);

  // Loot crates
  dsLootCrates.forEach(lc => dsDrawLootCrate(lc));

  // Asteroids
  dsAsteroids.forEach(a => dsDrawAsteroid(a));

  // Ore
  dsSpaceOre.forEach(o => dsDrawOre(o));

  // Salvage crates
  dsSalvageCrates.forEach(function(c) {
    if (!dsShip) return;
    if (c.zone !== (dsZone.n+'-'+dsZone.e)) return;
    var t = Date.now()*0.003, alpha = 0.6+Math.sin(t*3)*0.4;
    var sg=dsCtx.createRadialGradient(c.x,c.y,0,c.x,c.y,65);
    sg.addColorStop(0,'rgba(255,200,0,'+(alpha*0.7)+')'); sg.addColorStop(1,'transparent');
    dsCtx.fillStyle=sg; dsCtx.beginPath(); dsCtx.arc(c.x,c.y,65,0,Math.PI*2); dsCtx.fill();
    dsCtx.strokeStyle='rgba(255,200,0,'+(alpha*0.9)+')'; dsCtx.lineWidth=3;
    dsCtx.shadowColor='#FFCC00'; dsCtx.shadowBlur=20;
    dsCtx.strokeRect(c.x-16,c.y-16,32,32);
    dsCtx.beginPath(); dsCtx.moveTo(c.x-16,c.y-16); dsCtx.lineTo(c.x+16,c.y+16);
    dsCtx.moveTo(c.x+16,c.y-16); dsCtx.lineTo(c.x-16,c.y+16); dsCtx.stroke(); dsCtx.shadowBlur=0;
    dsCtx.fillStyle='rgba(255,220,50,'+alpha+')'; dsCtx.font='bold 10px Courier New'; dsCtx.textAlign='center';
    dsCtx.fillText('WRECK: '+c.victimUsername, c.x, c.y-28);
    dsCtx.fillStyle='rgba(255,180,0,0.9)'; dsCtx.font='9px Courier New';
    dsCtx.fillText(c.bars.toLocaleString()+' bars', c.x, c.y+32);
    var cdx=dsShip.x-c.x, cdy=dsShip.y-c.y;
    if (Math.sqrt(cdx*cdx+cdy*cdy)<65) DSKT()?.emit('deepspace:collectSalvage',{crateId:c.id});
  });

  // Guards
  dsGuards.forEach(g => { if(g.alive) dsDrawGuard(g); });
  // Other players
  Object.entries(dsOtherPlayers).forEach(function(entry) { dsDrawOtherPlayer(entry[1], entry[0]); });
  // Warzone bots -- position already advanced in dsUpdate, just draw
  Object.entries(dsWarzoneBots).forEach(function(entry) {
    dsDrawOtherPlayer(entry[1], 'wz_'+entry[0]);
  });
  // Serenity wormhole -- zone 5-5 center portal
  if (window._dsSerenityWormhole && dsShip) {
    var _wh=window._dsSerenityWormhole;
    _wh.pulseT=(_wh.pulseT||0)+0.02; _wh.lightningT=(_wh.lightningT||0)+0.08;
    var _pulse=0.7+Math.sin(_wh.pulseT)*0.3;
    var _wx=_wh.x,_wy=_wh.y,_wr=_wh.r;
    dsCtx.save();
    // Outer glow
    for(var _ri=3;_ri>=0;_ri--){
      var _rg=dsCtx.createRadialGradient(_wx,_wy,_wr*0.3,_wx,_wy,_wr*(1.2+_ri*0.3));
      _rg.addColorStop(0,"rgba(0,200,255,"+0.15*_pulse+")");
      _rg.addColorStop(1,"transparent");
      dsCtx.fillStyle=_rg; dsCtx.beginPath(); dsCtx.arc(_wx,_wy,_wr*(1.2+_ri*0.3),0,Math.PI*2); dsCtx.fill();
    }
    // Dark void
    var _cg=dsCtx.createRadialGradient(_wx,_wy,0,_wx,_wy,_wr);
    _cg.addColorStop(0,"rgba(0,0,20,0.98)"); _cg.addColorStop(0.7,"rgba(0,20,60,0.9)"); _cg.addColorStop(1,"transparent");
    dsCtx.fillStyle=_cg; dsCtx.beginPath(); dsCtx.arc(_wx,_wy,_wr,0,Math.PI*2); dsCtx.fill();
    // Ring
    dsCtx.strokeStyle="rgba(0,220,255,"+(0.6+0.4*_pulse)+")"; dsCtx.lineWidth=6+Math.sin(_wh.pulseT*1.3)*3;
    dsCtx.shadowColor="#00CCFF"; dsCtx.shadowBlur=30;
    dsCtx.beginPath(); dsCtx.arc(_wx,_wy,_wr,0,Math.PI*2); dsCtx.stroke(); dsCtx.shadowBlur=0;
    // Lightning arcs
    for(var _li2=0;_li2<8;_li2++){
      var _la=(_li2/8)*Math.PI*2+_wh.lightningT;
      var _lx1=_wx+Math.cos(_la)*_wr*0.2,_ly1=_wy+Math.sin(_la)*_wr*0.2;
      var _lx2=_wx+Math.cos(_la+0.4)*_wr,_ly2=_wy+Math.sin(_la+0.4)*_wr;
      var _lmx=(_lx1+_lx2)/2+(Math.random()-0.5)*60,_lmy=(_ly1+_ly2)/2+(Math.random()-0.5)*60;
      dsCtx.strokeStyle="rgba(100,220,255,"+(0.3+Math.random()*0.5)+")";
      dsCtx.lineWidth=1.5; dsCtx.shadowColor="#00FFFF"; dsCtx.shadowBlur=10;
      dsCtx.beginPath(); dsCtx.moveTo(_lx1,_ly1); dsCtx.quadraticCurveTo(_lmx,_lmy,_lx2,_ly2); dsCtx.stroke();
    }
    dsCtx.shadowBlur=0;
    // Label
    dsCtx.font="bold 16px Courier New"; dsCtx.textAlign="center";
    dsCtx.fillStyle="rgba(0,220,255,"+(0.6+0.4*_pulse)+")";
    dsCtx.shadowColor="#00CCFF"; dsCtx.shadowBlur=15;
    dsCtx.fillText("SERENITY",_wx,_wy-_wr-20);
    dsCtx.font="10px Courier New"; dsCtx.fillStyle="rgba(150,220,255,0.6)";
    dsCtx.fillText("[E] ENTER SERENITY",_wx,_wy+_wr+20);
    dsCtx.shadowBlur=0; dsCtx.restore();
    // Proximity check
    window._dsNearSerenityPortal=Math.hypot(dsShip.x-_wx,dsShip.y-_wy)<_wh.promptRadius;
  }

  // Leviathan -- purple segmented worm
  if(dsLeviathan&&dsLeviathan.segments){
    var lev=dsLeviathan,levBaseR=38;
    dsCtx.save();
    for(var _li=lev.segments.length-1;_li>=0;_li--){
      var _ls=lev.segments[_li],_lr=levBaseR*(1-_li/lev.segments.length*0.5);
      var _lgrd=dsCtx.createRadialGradient(_ls.x,_ls.y,0,_ls.x,_ls.y,_lr*1.5);
      _lgrd.addColorStop(0,'rgba(40,0,60,0.7)');_lgrd.addColorStop(1,'transparent');
      dsCtx.fillStyle=_lgrd;dsCtx.beginPath();dsCtx.arc(_ls.x,_ls.y,_lr*1.5,0,Math.PI*2);dsCtx.fill();
      dsCtx.beginPath();dsCtx.arc(_ls.x,_ls.y,_lr,0,Math.PI*2);
      dsCtx.fillStyle='rgb(20,0,40)';dsCtx.fill();
      dsCtx.strokeStyle='rgba(120,0,180,0.5)';dsCtx.lineWidth=2;dsCtx.stroke();
    }
    var _lhead=lev.segments[0],_lhr=levBaseR*1.4,_lperp=lev.angle+Math.PI/2;
    [[1],[-1]].forEach(function(e,i){
      var _sign=i===0?1:-1;
      var _ex=_lhead.x+Math.cos(_lperp)*_lhr*0.5*_sign,_ey=_lhead.y+Math.sin(_lperp)*_lhr*0.5*_sign;
      dsCtx.beginPath();dsCtx.arc(_ex,_ey,_lhr*0.25,0,Math.PI*2);
      dsCtx.fillStyle='rgba(255,0,0,0.9)';dsCtx.shadowColor='#FF0000';dsCtx.shadowBlur=14;
      dsCtx.fill();dsCtx.shadowBlur=0;
    });
    dsCtx.restore();
    dsCtx.save();
    dsCtx.font='bold 14px Courier New';dsCtx.textAlign='center';
    dsCtx.fillStyle='#AA00FF';dsCtx.shadowColor='#8800CC';dsCtx.shadowBlur=12;
    dsCtx.fillText('⚠ THE LEVIATHAN',_lhead.x,_lhead.y-levBaseR*2-10);
    dsCtx.shadowBlur=0;
    var _lhpPct=lev.shield/Math.max(1,lev.maxShield),_lbw=140;
    dsCtx.fillStyle='rgba(0,0,0,0.7)';dsCtx.fillRect(_lhead.x-_lbw/2,_lhead.y-levBaseR*2+4,_lbw,7);
    dsCtx.fillStyle=_lhpPct>0.5?'#AA00FF':_lhpPct>0.2?'#CC44FF':'#FF00FF';
    dsCtx.fillRect(_lhead.x-_lbw/2,_lhead.y-levBaseR*2+4,_lbw*_lhpPct,7);
    dsCtx.restore();
  }
  // Race competitors -- render others in same zone
  if (dsGameRace && dsZone) {
    var _raceZone = dsZone.n+'-'+dsZone.e;
    dsGamePositions.forEach(function(p) {
      if (p.username === window._dsUsername) return; // skip self
      if (p.zone !== _raceZone) return; // same zone only
      if (p.finished) return;
      // Build a fake op object compatible with dsDrawOtherPlayer
      var _raceOp = {
        x: p.x, y: p.y, angle: p.angle||0,
        username: p.username,
        shield: 1, maxShield: 1, // race -- no health display needed
        design: p.ship ? p.ship.design : null,
        shipClass: p.ship ? (p.ship.class||'fighter') : 'fighter',
        quality: p.ship ? (p.ship.quality||'Common') : 'Common',
        isBot: p.isBot,
        hitFlash: 0, gunsOff: false,
      };
      dsDrawOtherPlayer(_raceOp, 'race_'+p.username);
    });
  }
  // Gas cloud and race waypoint rendering
  if (dsGameGas && dsGameGas.radius > 0) {
    var _gc=dsGameGas;
    var _cx=_gc.cx||DS_CENTER, _cy=_gc.cy||DS_CENTER;
    dsCtx.save();
    // Fill entire world with gas color, then punch out the safe circle
    dsCtx.globalAlpha=0.22;
    dsCtx.fillStyle='rgba(40,160,40,1)';
    dsCtx.fillRect(0,0,DS_WORLD,DS_WORLD);
    // Clear safe circle -- players stay INSIDE the circle to avoid gas
    dsCtx.globalCompositeOperation='destination-out';
    var _sg=dsCtx.createRadialGradient(_cx,_cy,_gc.radius*0.75,_cx,_cy,_gc.radius);
    _sg.addColorStop(0,'rgba(0,0,0,1)'); _sg.addColorStop(1,'rgba(0,0,0,0)');
    dsCtx.fillStyle=_sg; dsCtx.beginPath();
    dsCtx.arc(_cx,_cy,_gc.radius,0,Math.PI*2); dsCtx.fill();
    dsCtx.globalCompositeOperation='source-over';
    dsCtx.restore();
    // Danger ring at edge
    dsCtx.save();
    dsCtx.globalAlpha=0.7; dsCtx.strokeStyle='rgba(80,255,80,0.8)'; dsCtx.lineWidth=6;
    dsCtx.setLineDash([20,10]); dsCtx.beginPath();
    dsCtx.arc(_cx,_cy,_gc.radius,0,Math.PI*2); dsCtx.stroke();
    dsCtx.setLineDash([]); dsCtx.restore();
    if (dsShip) {
      var _gdx=dsShip.x-(_gc.cx||DS_CENTER), _gdy=dsShip.y-(_gc.cy||DS_CENTER);
      if (Math.sqrt(_gdx*_gdx+_gdy*_gdy)>_gc.radius) {
        dsCtx.save(); dsCtx.fillStyle='rgba(100,255,100,0.9)'; dsCtx.font='bold 12px Courier New'; dsCtx.textAlign='center';
        dsCtx.fillText('!! GAS CLOUD -- RETURN TO SAFE ZONE !!',DS_CENTER,40); dsCtx.restore();
      }
    }
  }
  if (dsGameRace && dsGameWaypoints.length>0 && dsZone) {
    var _curZ=dsZone.n+'-'+dsZone.e;
    dsGameWaypoints.forEach(function(wp,i){
      if(wp.zone!==_curZ) return;
      var _isNext=i===(dsGameRace.wpIdx||0);
      dsCtx.save(); dsCtx.globalAlpha=_isNext?0.9:0.3;
      dsCtx.strokeStyle=_isNext?'#FFDD44':'rgba(255,220,50,0.3)';
      dsCtx.lineWidth=_isNext?4:2; dsCtx.setLineDash(_isNext?[]:[10,5]);
      dsCtx.beginPath(); dsCtx.arc(wp.x,wp.y,wp.r,0,Math.PI*2); dsCtx.stroke();
      dsCtx.fillStyle=_isNext?'#FFDD44':'rgba(255,220,50,0.4)';
      dsCtx.font='bold 11px Courier New'; dsCtx.textAlign='center';
      dsCtx.fillText((_isNext?'> ':'')+wp.label, wp.x, wp.y-wp.r-8);
      dsCtx.setLineDash([]); dsCtx.restore();
    });
  }

  Object.entries(dsNpcMiners).forEach(function(entry) {
    var mid = entry[0], m = entry[1];
    if (!dsShip) return;
    var _mdx = m.x - dsShip.x, _mdy = m.y - dsShip.y;
    if (Math.sqrt(_mdx*_mdx+_mdy*_mdy) > DS_LIGHT*2) return;
    var _mCol = m.isMiner ? '#44FFCC' : '#AAAAAA';
    var _rendered = false;
    dsCtx.save();
    dsCtx.translate(m.x, m.y);
    dsCtx.rotate((m.angle||0) + Math.PI/2);
    dsCtx.scale(0.5, 0.5);
    if (m.shipDesign && m.shipDesign.nose && typeof window.drawShipBody !== 'undefined') {
      try {
        dsCtx.rotate(-Math.PI/2); // correct facing direction
        if (typeof window.drawEngineGlow !== 'undefined')
          window.drawEngineGlow(dsCtx, m.shipDesign.engines, m.shipClass||'miner', 0);
        window.drawShipBody(dsCtx, m.shipDesign, m.shipClass||'miner', 0.1, _mCol, 3);
        _rendered = true;
      } catch(e) { _rendered = false; }
    }
    if (!_rendered) {
      dsCtx.fillStyle = _mCol; dsCtx.shadowColor = _mCol; dsCtx.shadowBlur = 8;
      dsCtx.beginPath(); dsCtx.arc(0,0,12,0,Math.PI*2); dsCtx.fill();
      dsCtx.shadowBlur = 0;
    }
    dsCtx.restore();
    // Name label -- same style as other players
    dsCtx.save();
    dsCtx.font = 'bold 10px Courier New'; dsCtx.textAlign = 'center';
    dsCtx.fillStyle = _mCol; dsCtx.shadowColor = _mCol; dsCtx.shadowBlur = 4;
    dsCtx.fillText(m.username, m.x, m.y - 30);
    dsCtx.shadowBlur = 0;
    // Shield bar
    if (m.maxShield > 0) {
      var _pct = Math.max(0, m.shield/m.maxShield);
      var _bw = 36, _bh = 3;
      dsCtx.fillStyle = 'rgba(0,0,0,0.5)';
      dsCtx.fillRect(m.x-_bw/2, m.y-24, _bw, _bh);
      dsCtx.fillStyle = _mCol;
      dsCtx.fillRect(m.x-_bw/2, m.y-24, _bw*_pct, _bh);
    }
    dsCtx.restore();
  });

  // Enemy bullets
  dsEnemyBullets.forEach(b => {
    var _ec = dsElementColor(b.elemType||null);
    var _er = dsHexToRgb(_ec);
    if (b.trail && b.trail.length>1) {
      dsCtx.beginPath(); dsCtx.moveTo(b.trail[0].x,b.trail[0].y);
      b.trail.forEach(function(t){dsCtx.lineTo(t.x,t.y);});
      dsCtx.strokeStyle='rgba('+_er+',0.4)'; dsCtx.lineWidth=1.5; dsCtx.stroke();
    }
    dsCtx.beginPath(); dsCtx.arc(b.x,b.y,3.5,0,Math.PI*2);
    dsCtx.fillStyle=_ec; dsCtx.shadowColor=_ec; dsCtx.shadowBlur=14;
    dsCtx.fill(); dsCtx.shadowBlur=0;
  });

  // Other player bullets -- cyan
  dsOtherBullets.forEach(function(b) {
    if (b.trail && b.trail.length>1) {
      dsCtx.beginPath(); dsCtx.moveTo(b.trail[0].x,b.trail[0].y);
      b.trail.forEach(function(t){dsCtx.lineTo(t.x,t.y);});
      dsCtx.strokeStyle='rgba(0,220,255,0.35)'; dsCtx.lineWidth=1.5; dsCtx.stroke();
    }
    dsCtx.beginPath(); dsCtx.arc(b.x,b.y,3,0,Math.PI*2);
    dsCtx.fillStyle='#00DDFF'; dsCtx.shadowColor='#00BBFF'; dsCtx.shadowBlur=10;
    dsCtx.fill(); dsCtx.shadowBlur=0;
  });
  // Other player missiles -- full quality render
  dsOtherMissiles.forEach(function(m) {
    var mCol = dsElementColor(m.elemType||null);
    var mColRgb = dsHexToRgb(mCol);
    if (m.smokeTrail) { m.smokeTrail.forEach(function(s) {
      dsCtx.beginPath(); dsCtx.arc(s.x,s.y,s.r*s.life,0,Math.PI*2);
      dsCtx.fillStyle='rgba('+mColRgb+','+(s.life*0.3)+')'; dsCtx.fill();
    }); }
    if (m.trail && m.trail.length>1) {
      dsCtx.beginPath(); dsCtx.moveTo(m.trail[0].x,m.trail[0].y);
      m.trail.forEach(function(t){dsCtx.lineTo(t.x,t.y);});
      dsCtx.strokeStyle='rgba('+mColRgb+',0.3)'; dsCtx.lineWidth=1.5; dsCtx.stroke();
    }
    dsCtx.save(); dsCtx.translate(m.x,m.y); dsCtx.rotate(m.angle);
    dsCtx.fillStyle=mCol+'CC'; dsCtx.shadowColor=mCol; dsCtx.shadowBlur=10;
    dsCtx.fillRect(-10,-2.5,20,5); dsCtx.fillStyle=mCol;
    dsCtx.beginPath(); dsCtx.moveTo(10,0); dsCtx.lineTo(6,-3); dsCtx.lineTo(6,3); dsCtx.closePath(); dsCtx.fill();
    var eg=dsCtx.createRadialGradient(-10,0,0,-10,0,10);
    eg.addColorStop(0,'rgba('+mColRgb+',0.9)'); eg.addColorStop(1,'transparent');
    dsCtx.fillStyle=eg; dsCtx.beginPath(); dsCtx.arc(-10,0,10,0,Math.PI*2); dsCtx.fill();
    dsCtx.shadowBlur=0; dsCtx.restore();
  });

  // Player bullets
  var _wSlot2 = dsShipData && dsShipData.ships && dsShipData.ships.find(function(s){return s.id===dsShipData.activeShipId;});
  var _wPart2 = _wSlot2 && _wSlot2.slots && (_wSlot2.slots.weapon1 || _wSlot2.slots.weapon2);
  var _bElem  = _wPart2 && _wPart2.stats && _wPart2.stats.elemType;
  var _bCol   = dsElementColor(_bElem);
  var _bRgb   = dsHexToRgb(_bCol);
  dsBullets.forEach(function(b) {
    if (b.trail.length>1) {
      dsCtx.beginPath(); dsCtx.moveTo(b.trail[0].x,b.trail[0].y);
      b.trail.forEach(function(t){dsCtx.lineTo(t.x,t.y);});
      dsCtx.strokeStyle='rgba('+_bRgb+',0.4)'; dsCtx.lineWidth=1; dsCtx.stroke();
    }
    dsCtx.beginPath(); dsCtx.arc(b.x,b.y,2.5,0,Math.PI*2);
    dsCtx.fillStyle=_bCol; dsCtx.shadowColor=_bCol; dsCtx.shadowBlur=8;
    dsCtx.fill(); dsCtx.shadowBlur=0;
  });

  // Missiles
  dsMissiles.forEach(m => dsDrawMissile(m));

  // Explosions
  dsExplosions.forEach(ex => {
    if (ex.isRing) {
      dsCtx.beginPath(); dsCtx.arc(ex.x,ex.y,ex.r,0,Math.PI*2);
      dsCtx.strokeStyle=ex.color.replace('hsl','hsla').replace(')',`,${ex.life*0.8})`);
      dsCtx.lineWidth=2.5*ex.life; dsCtx.stroke();
    } else {
      dsCtx.beginPath(); dsCtx.arc(ex.x,ex.y,ex.r*(0.5+ex.life*0.5),0,Math.PI*2);
      dsCtx.fillStyle=ex.color.replace('hsl','hsla').replace(')',`,${ex.life})`); dsCtx.fill();
    }
  });

  // Ship smoke + trail
  if (dsShip) {
    dsShip.smokeParticles.forEach(p => {
      dsCtx.beginPath(); dsCtx.arc(p.x,p.y,p.r,0,Math.PI*2);
      dsCtx.fillStyle=`rgba(100,120,140,${p.life*0.3})`; dsCtx.fill();
    });
    if (dsShip.trail.length>1) {
      dsCtx.beginPath();
      dsShip.trail.forEach((t,i)=>i===0?dsCtx.moveTo(t.x,t.y):dsCtx.lineTo(t.x,t.y));
      dsCtx.strokeStyle='rgba(0,200,255,0.15)'; dsCtx.lineWidth=2; dsCtx.stroke();
    }
    dsDrawPlayerShip();
  }

  dsCtx.restore();

  // Fog of war
  dsDrawFog(W,H);

  // Warp flash
  if (dsShip?.warpFlash>0) {
    dsCtx.fillStyle=`rgba(200,240,255,${dsShip.warpFlash*0.6})`;
    dsCtx.fillRect(0,0,W,H);
  }
  // Hit flash
  if (dsShip?.hitFlash>0) {
    dsShip.hitFlash=Math.max(0,dsShip.hitFlash-0.04);
    dsCtx.fillStyle=`rgba(255,0,0,${dsShip.hitFlash*0.35})`;
    dsCtx.fillRect(0,0,W,H);
  }

  // HUDs
  dsDrawTacticalHUD(W,H);
  dsDrawPassiveBtn(W,H);
  // Mobile joystick rings (drawn after world render)
  if (window.innerWidth <= 900) {
    var _mjx = _dsJoy.active ? _dsJoy.startX : 80;
    var _mjy = _dsJoy.active ? _dsJoy.startY : H - 160;
    dsCtx.save();
    dsCtx.beginPath(); dsCtx.arc(_mjx,_mjy,52,0,Math.PI*2);
    dsCtx.strokeStyle=_dsJoy.active?'rgba(255,255,255,0.98)':'rgba(200,220,255,0.85)';
    dsCtx.lineWidth=2.5; dsCtx.stroke();
    if (_dsJoy.active) {
      dsCtx.beginPath(); dsCtx.arc(_mjx+_dsJoy.dx*52,_mjy+_dsJoy.dy*52,22,0,Math.PI*2);
      dsCtx.fillStyle='rgba(220,235,255,0.55)'; dsCtx.fill();
      dsCtx.strokeStyle='rgba(255,255,255,0.98)'; dsCtx.lineWidth=2; dsCtx.stroke();
    }
    dsCtx.textAlign='center'; dsCtx.font='bold 9px Courier New';
    dsCtx.fillStyle=_dsJoy.active?'rgba(200,220,255,0.95)':'rgba(200,220,255,0.75)';
    dsCtx.fillText('MOVE',_mjx,_mjy+52+14);
    dsCtx.textAlign='left';
    dsCtx.restore();
  }
  if (window.innerWidth <= 900 && dsShip) {
    var _rR=90, _rX=W/2+Math.cos(_dsLastAimAngle)*90, _rY=H/2+Math.sin(_dsLastAimAngle)*90;
    var _rA=0.3+_dsAimFlash*0.65;
    dsCtx.save();
    dsCtx.beginPath(); dsCtx.arc(W/2,H/2,_rR,0,Math.PI*2);
    dsCtx.strokeStyle=`rgba(0,200,255,${0.1+_dsAimFlash*0.15})`;
    dsCtx.lineWidth=1; dsCtx.stroke();
    dsCtx.beginPath(); dsCtx.arc(_rX,_rY,9,0,Math.PI*2);
    dsCtx.fillStyle=`rgba(0,220,255,${_rA*0.25})`; dsCtx.fill();
    dsCtx.strokeStyle=`rgba(0,220,255,${_rA})`; dsCtx.lineWidth=2; dsCtx.stroke();
    dsCtx.strokeStyle=`rgba(255,255,255,${_rA*0.85})`; dsCtx.lineWidth=1.5;
    dsCtx.beginPath(); dsCtx.moveTo(_rX-7,_rY); dsCtx.lineTo(_rX+7,_rY); dsCtx.stroke();
    dsCtx.beginPath(); dsCtx.moveTo(_rX,_rY-7); dsCtx.lineTo(_rX,_rY+7); dsCtx.stroke();
    dsCtx.restore();
  }
  if (window.innerWidth <= 900 && dsShip) {
    var _ajx=W-145,_ajy=H-150,_ajR=44;
    var _ajOn=_dsAimJoy&&_dsAimJoy.active;
    var _lx=_ajx+Math.cos(_dsLastAimAngle)*(_ajR-10);
    var _ly=_ajy+Math.sin(_dsLastAimAngle)*(_ajR-10);
    dsCtx.save();
    dsCtx.beginPath(); dsCtx.arc(_ajx,_ajy,_ajR,0,Math.PI*2);
    dsCtx.strokeStyle=_ajOn?'rgba(0,230,255,0.95)':'rgba(0,210,255,0.7)';
    dsCtx.lineWidth=2.5; dsCtx.stroke();
    dsCtx.beginPath(); dsCtx.arc(_ajx,_ajy,_ajR,0,Math.PI*2);
    dsCtx.fillStyle='rgba(0,130,230,0.1)'; dsCtx.fill();
    dsCtx.strokeStyle=`rgba(0,230,255,${0.7+_dsAimFlash*0.25})`;
    dsCtx.lineWidth=3;
    dsCtx.beginPath(); dsCtx.moveTo(_ajx,_ajy); dsCtx.lineTo(_lx,_ly); dsCtx.stroke();
    dsCtx.beginPath(); dsCtx.arc(_lx,_ly,6,0,Math.PI*2);
    dsCtx.fillStyle=`rgba(0,230,255,${0.8+_dsAimFlash*0.2})`; dsCtx.fill();
    dsCtx.textAlign='center'; dsCtx.font='bold 9px Courier New';
    dsCtx.fillStyle=`rgba(0,210,255,${_ajOn?1.0:0.75})`;
    dsCtx.fillText('AIM',_ajx,_ajy+_ajR+14);
    dsCtx.textAlign='left';
    dsCtx.restore();
  }
  dsDrawMiniMap(W,H);
  dsDrawWeaponHUD(W,H);
  dsDrawZoneHUD(W,H);
  dsDrawArenaHUD(W,H);
  if (dsForge && dsForgeDocked) dsDrawForgeTimer(W,H);
  dsDrawScanner(W,H);

  if (_dsFrameCount%3===0) dsAnimateWaveform();
  _dsFrameCount++;
}

let _dsFrameCount = 0;

// ── DRAW PLAYER SHIP ──────────────────────────────────────────────────────────
function dsDrawPlayerShip() {
  if (!dsShip) return;
  dsCtx.save();
  dsCtx.translate(dsShip.x, dsShip.y);
  dsCtx.rotate(dsShip.angle + Math.PI/2);

  const design = dsShipDesign;
  const s = 18; // base scale

  var activeShipData = dsShipData && dsShipData.ships && dsShipData.ships.find(function(s){ return s.id === dsShipData.activeShipId; });
  var shipClass = activeShipData ? (activeShipData.class || 'fighter') : 'fighter';
  var qCol = (activeShipData && window.SHIP_QUALITY_COLORS) ? (window.SHIP_QUALITY_COLORS[activeShipData.quality]||'#4488CC') : '#4488CC';
  if (design && typeof drawShipBody !== 'undefined') {
    dsCtx.scale(0.5, 0.5);
    if (design.body === 'ufo') {
      if (typeof drawUFOBody !== 'undefined') drawUFOBody(dsCtx, design, 0.1, qCol, 4, 0);
    } else {
      // drawShipBody faces RIGHT (+X). We're already rotated angle+PI/2, so correct by -PI/2
      dsCtx.rotate(-Math.PI/2);
      if (typeof drawEngineGlow !== 'undefined') drawEngineGlow(dsCtx, design.engines, shipClass, 0);
      if (typeof drawShipBody !== 'undefined') drawShipBody(dsCtx, design, shipClass, 0.1, qCol, 4);
    }
  } else {
    // Fallback triangle
    if (dsShip.thrusting) {
      const grd=dsCtx.createRadialGradient(0,s*1.2,0,0,s*1.2,s*1.8);
      grd.addColorStop(0,'rgba(0,150,255,0.8)'); grd.addColorStop(1,'transparent');
      dsCtx.fillStyle=grd; dsCtx.beginPath(); dsCtx.arc(0,s*1.2,s*1.8,0,Math.PI*2); dsCtx.fill();
    }
    dsCtx.beginPath();
    dsCtx.moveTo(0,-s*1.4); dsCtx.lineTo(s*0.7,s*0.8);
    dsCtx.lineTo(s*0.4,s*0.4); dsCtx.lineTo(0,s*0.6);
    dsCtx.lineTo(-s*0.4,s*0.4); dsCtx.lineTo(-s*0.7,s*0.8);
    dsCtx.closePath();
    dsCtx.fillStyle='#AACCDD'; dsCtx.fill();
    dsCtx.strokeStyle='#DDEEFF'; dsCtx.lineWidth=1; dsCtx.stroke();
    dsCtx.beginPath(); dsCtx.ellipse(0,-s*0.4,s*0.3,s*0.5,0,0,Math.PI*2);
    dsCtx.fillStyle='rgba(100,200,255,0.7)'; dsCtx.fill();
  }

  // Shield ring
  if (dsShip.shield > 0) {
    const pct=dsShip.shield/dsShip.maxShield;
    dsCtx.beginPath(); dsCtx.arc(0,0,s*2,0,Math.PI*2);
    dsCtx.strokeStyle=`rgba(0,200,255,${pct*0.3})`;
    dsCtx.lineWidth=2; dsCtx.stroke();
  }
  dsCtx.restore();
}

// ── DRAW GUARD ────────────────────────────────────────────────────────────────
function dsDrawGuard(g) {
  var f = FACTIONS[g.faction];
  var fCol = f ? f.color : '#FF4400';
  if (g.trail.length>1) {
    dsCtx.beginPath(); dsCtx.moveTo(g.trail[0].x,g.trail[0].y);
    g.trail.forEach(function(t){dsCtx.lineTo(t.x,t.y);});
    dsCtx.strokeStyle='rgba('+(g.state==='attack'?'255,80,80':'100,160,200')+',0.2)';
    dsCtx.lineWidth=2; dsCtx.stroke();
  }
  dsCtx.save();
  dsCtx.translate(g.x, g.y);
  dsCtx.rotate(g.angle + Math.PI/2);
  var flash = g.flashTimer > 0;
  // Render real ship even during flash -- white glow instead of triangle
  var rendered = false;
  if (g.ship && g.ship.design && typeof window.drawShipBody !== 'undefined') {
    try {
      if (flash) { dsCtx.shadowColor='#FFFFFF'; dsCtx.shadowBlur=30; }
      dsCtx.scale(0.65, 0.65);
      var d = g.ship.design;
      if (d.body === 'ufo') {
        window.drawUFOBody(dsCtx, d, 0.1, flash ? '#FFFFFF' : fCol, 4, 0);
      } else {
        // -PI/2 correction: drawShipBody faces RIGHT, canvas rotated angle+PI/2
        dsCtx.rotate(-Math.PI/2);
        window.drawEngineGlow(dsCtx, d.engines, g.ship.class||'fighter', 0);
        window.drawShipBody(dsCtx, d, g.ship.class||'fighter', flash ? 0.8 : 0.1, flash ? '#FFFFFF' : fCol, flash ? 8 : 4);
      }
      rendered = true;
    } catch(e) { rendered = false; }
  }
  if (!rendered) {
    // Faction-colored fighter silhouette
    var s = 13;
    dsCtx.fillStyle = flash ? '#FFFFFF' : fCol;
    dsCtx.shadowColor = flash ? '#FFFFFF' : fCol;
    dsCtx.shadowBlur = flash ? 20 : 10;
    dsCtx.beginPath();
    dsCtx.moveTo(0,-s*1.5); dsCtx.lineTo(s*0.9,s*1.0);
    dsCtx.lineTo(s*0.4,s*0.5); dsCtx.lineTo(0,s*0.8);
    dsCtx.lineTo(-s*0.4,s*0.5); dsCtx.lineTo(-s*0.9,s*1.0);
    dsCtx.closePath(); dsCtx.fill();
  }
  dsCtx.shadowBlur=0;
  // Shield ring
  if (g.shield>0) {
    dsCtx.beginPath(); dsCtx.arc(0,0,rendered?38:s*1.8,0,Math.PI*2);
    dsCtx.strokeStyle=fCol+'55'; dsCtx.lineWidth=2; dsCtx.stroke();
  }
  dsCtx.restore();
  // Name + shield bar
  const sx=g.x-dsCameraX+dsCanvas.width/2;
  const sy=g.y-dsCameraY+dsCanvas.height/2;
  const dx=g.x-dsShip.x, dy=g.y-dsShip.y;
  if (Math.sqrt(dx*dx+dy*dy)<DS_LIGHT*1.5) {
    dsCtx.save(); dsCtx.font='9px Courier New'; dsCtx.textAlign='center';
    dsCtx.fillStyle='rgba(255,100,100,0.7)';
    dsCtx.fillText(g.pilotName||'Guard', g.x, g.y-22);
    // Shield bar
    const bw=36, bh=4;
    dsCtx.fillStyle='rgba(0,0,0,0.6)'; dsCtx.fillRect(g.x-bw/2,g.y-32,bw,bh);
    dsCtx.fillStyle=f?.color||'#FF4400';
    dsCtx.fillRect(g.x-bw/2,g.y-32,bw*(g.shield/g.maxShield),bh);
    dsCtx.restore();
  }
}

// ── DRAW MISSILE ──────────────────────────────────────────────────────────────
var DS_ELEMENT_COLORS = {
  Plasma:'#FF44FF', Cryo:'#44DDFF', Shadow:'#8844AA', Solar:'#FFBB00',
  Arc:'#44FFFF', Toxic:'#44FF44', Gravity:'#AA88FF', Photon:'#FFFFAA',
  'Dark Matter':'#440066', Singularity:'#FF0066', Physical:'#AACCDD',
};
function dsElementColor(elemType) {
  return DS_ELEMENT_COLORS[elemType] || '#AACCDD';
}
function dsHexToRgb(hex) {
  if (!hex||hex.length<7) return '100,200,255';
  var r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return r+','+g+','+b;
}

function dsDrawMissile(m) {
  if (m.isPlayer) {
    if (m.smokeTrail) {
      m.smokeTrail.forEach(s => {
        dsCtx.beginPath(); dsCtx.arc(s.x,s.y,s.r*s.life,0,Math.PI*2);
        dsCtx.fillStyle=`rgba(180,190,200,${s.life*0.35})`; dsCtx.fill();
      });
    }
    // Get element color from equipped weapon
    var wSlot = dsShipData && dsShipData.ships && dsShipData.ships.find(function(s){return s.id===dsShipData.activeShipId;});
    var wPart = wSlot && wSlot.slots && (wSlot.slots.weapon2 || wSlot.slots.weapon1);
    var elemType = wPart && wPart.stats && wPart.stats.elemType;
    var mCol = dsElementColor(elemType);
    var mColRgb = dsHexToRgb(mCol);
    dsCtx.save(); dsCtx.translate(m.x,m.y); dsCtx.rotate(m.angle);
    dsCtx.fillStyle=mCol+'CC'; dsCtx.shadowColor=mCol; dsCtx.shadowBlur=10;
    dsCtx.fillRect(-10,-2.5,20,5);
    dsCtx.fillStyle=mCol; dsCtx.beginPath();
    dsCtx.moveTo(10,0); dsCtx.lineTo(6,-3); dsCtx.lineTo(6,3); dsCtx.closePath(); dsCtx.fill();
    dsCtx.fillStyle='rgba('+mColRgb+',0.5)'; dsCtx.fillRect(-10,-4.5,5,2); dsCtx.fillRect(-10,2.5,5,2);
    // Engine glow
    var eg=dsCtx.createRadialGradient(-10,0,0,-10,0,10);
    eg.addColorStop(0,'rgba('+mColRgb+',0.9)'); eg.addColorStop(1,'transparent');
    dsCtx.fillStyle=eg; dsCtx.beginPath(); dsCtx.arc(-10,0,10,0,Math.PI*2); dsCtx.fill();
    // Smoke trail color
    if (m.smokeTrail) {
      m.smokeTrail.forEach(function(s) {
        dsCtx.beginPath(); dsCtx.arc(s.x-m.x,s.y-m.y,s.r*s.life,0,Math.PI*2);
        dsCtx.fillStyle='rgba('+mColRgb+','+(s.life*0.25)+')'; dsCtx.fill();
      });
    }
    dsCtx.shadowBlur=0; dsCtx.restore();
  } else {
    // Enemy/NPC missile -- full render with element color same as player
    var eCol = dsElementColor(m.elemType||null);
    var eRgb = dsHexToRgb(eCol);
    if (m.smokeTrail) { m.smokeTrail.forEach(function(s) {
      dsCtx.beginPath(); dsCtx.arc(s.x,s.y,s.r*s.life,0,Math.PI*2);
      dsCtx.fillStyle='rgba('+eRgb+','+(s.life*0.3)+')'; dsCtx.fill();
    }); }
    if (m.trail && m.trail.length>1) {
      dsCtx.beginPath(); dsCtx.moveTo(m.trail[0].x,m.trail[0].y);
      m.trail.forEach(function(t){dsCtx.lineTo(t.x,t.y);});
      dsCtx.strokeStyle='rgba('+eRgb+',0.35)'; dsCtx.lineWidth=1.5; dsCtx.stroke();
    }
    dsCtx.save(); dsCtx.translate(m.x,m.y); dsCtx.rotate(m.angle);
    dsCtx.fillStyle=eCol+'CC'; dsCtx.shadowColor=eCol; dsCtx.shadowBlur=10;
    dsCtx.fillRect(-10,-2.5,20,5);
    dsCtx.fillStyle=eCol; dsCtx.beginPath();
    dsCtx.moveTo(10,0); dsCtx.lineTo(6,-3); dsCtx.lineTo(6,3); dsCtx.closePath(); dsCtx.fill();
    var eg=dsCtx.createRadialGradient(-10,0,0,-10,0,10);
    eg.addColorStop(0,'rgba('+eRgb+',0.9)'); eg.addColorStop(1,'transparent');
    dsCtx.fillStyle=eg; dsCtx.beginPath(); dsCtx.arc(-10,0,10,0,Math.PI*2); dsCtx.fill();
    dsCtx.shadowBlur=0; dsCtx.restore();
  }
}

// ── DRAW ASTEROID ─────────────────────────────────────────────────────────────
function dsDrawAsteroid(a) {
  dsCtx.save(); dsCtx.translate(a.x,a.y); dsCtx.rotate(a.angle);
  dsCtx.fillStyle=a.color;
  dsCtx.beginPath(); dsCtx.arc(0,0,a.r,0,Math.PI*2); dsCtx.fill();
  dsCtx.strokeStyle='rgba(255,255,255,0.08)'; dsCtx.lineWidth=1; dsCtx.stroke();
  a.craters.forEach(c => {
    const cx=Math.cos(c.a)*a.r*c.d, cy=Math.sin(c.a)*a.r*c.d;
    dsCtx.fillStyle='rgba(0,0,0,0.3)';
    dsCtx.beginPath(); dsCtx.arc(cx,cy,a.r*c.r,0,Math.PI*2); dsCtx.fill();
  });
  dsCtx.restore();
}

// ── DRAW ORE ──────────────────────────────────────────────────────────────────
function dsDrawOre(o) {
  const alpha=Math.min(1,o.life/60);
  const g=dsCtx.createRadialGradient(o.x,o.y,0,o.x,o.y,o.r*2);
  g.addColorStop(0,`rgba(100,220,255,${alpha*0.8})`); g.addColorStop(1,'transparent');
  dsCtx.fillStyle=g; dsCtx.beginPath(); dsCtx.arc(o.x,o.y,o.r*2,0,Math.PI*2); dsCtx.fill();
  dsCtx.fillStyle=`rgba(180,240,255,${alpha})`;
  dsCtx.beginPath(); dsCtx.arc(o.x,o.y,o.r,0,Math.PI*2); dsCtx.fill();
}

// ── DRAW LOOT CRATE ───────────────────────────────────────────────────────────
function dsDrawLootCrate(lc) {
  const t=Date.now()*0.003;
  const alpha=0.5+Math.sin(t*2)*0.3;
  var hasParts = lc.parts && lc.parts.length > 0;
  var hasBars  = lc.bars && lc.bars > 0;
  // Richer crates glow bigger and brighter
  var glowR = hasParts ? 65 : 40;
  var col   = lc.isPlayerCrate ? '255,200,50' : hasParts ? '180,100,255' : '100,200,255';
  dsCtx.save();
  dsCtx.translate(lc.x,lc.y);
  // Glow
  const g=dsCtx.createRadialGradient(0,0,2,0,0,glowR);
  g.addColorStop(0,`rgba(${col},${alpha*0.7})`); g.addColorStop(1,'transparent');
  dsCtx.fillStyle=g; dsCtx.beginPath(); dsCtx.arc(0,0,glowR,0,Math.PI*2); dsCtx.fill();
  // Box icon -- bigger if has parts
  var bx = hasParts ? 14 : 10;
  dsCtx.strokeStyle=`rgba(${col},${alpha*0.95})`; dsCtx.lineWidth=hasParts?2.5:2;
  dsCtx.shadowColor=`rgba(${col},0.8)`; dsCtx.shadowBlur=hasParts?12:6;
  dsCtx.strokeRect(-bx,-bx,bx*2,bx*2);
  dsCtx.beginPath(); dsCtx.moveTo(-bx,-bx); dsCtx.lineTo(bx,bx);
  dsCtx.moveTo(bx,-bx); dsCtx.lineTo(-bx,bx); dsCtx.stroke();
  dsCtx.shadowBlur=0;
  // Content labels
  var labelY = bx+14;
  dsCtx.fillStyle=`rgba(${col},0.9)`; dsCtx.font='9px Courier New'; dsCtx.textAlign='center';
  if (lc.ore > 0)   { dsCtx.fillText(lc.ore+' ore', 0, labelY); labelY+=13; }
  if (hasBars)      { dsCtx.fillStyle='rgba(255,220,80,0.9)'; dsCtx.fillText(lc.bars+' bars', 0, labelY); labelY+=13; }
  if (hasParts)     { dsCtx.fillStyle='rgba(200,120,255,0.9)'; dsCtx.fillText(lc.parts.length+' part'+(lc.parts.length>1?'s':''), 0, labelY); }
  dsCtx.restore();
}

// ── DRAW HOME STATION (Station Alpha dock point) ──────────────────────────────
function dsDrawHomeStation(st) {
  if (!st || !dsShip) return;
  // Visual drawn by dsDrawFactionStation (pushed to dsFactionStations on setup)
  var dx=dsShip.x-st.x, dy=dsShip.y-st.y, dist=Math.sqrt(dx*dx+dy*dy);
  if (dist < st.promptRadius) {
    dsNearestStation = st;
    dsCtx.fillStyle='rgba(100,220,255,0.9)'; dsCtx.font='bold 11px Courier New'; dsCtx.textAlign='center';
    var _dockTotal = dsShipBars + dsCarriedBars;
    dsCtx.fillText(_dockTotal>0?'[E] DOCK -- Transfer +'+_dockTotal.toLocaleString()+' bars':'[E] DOCK -- Station Alpha', st.x, st.y+st.r+30);
  }
  if ((dsShipBars+dsCarriedBars)>0 && dist<st.promptRadius*1.5) {
    dsCtx.fillStyle='rgba(100,220,255,0.7)'; dsCtx.font='9px Courier New'; dsCtx.textAlign='center';
    var _brkdwn = (dsShipBars>0&&dsCarriedBars>0)
      ? 'forge:'+dsShipBars.toLocaleString()+' loot:'+dsCarriedBars.toLocaleString()
      : '+'+(dsShipBars+dsCarriedBars).toLocaleString()+' bars on board';
    dsCtx.fillText(_brkdwn, st.x, st.y+st.r+44);
  }
}

function dsFullTeardown() {
  dsActive = false;
  window.dsActive = false;
  dsShip = null; // ensure nothing can damage a dead/gone ship
  window._spaceOverride = false;
  window._playerZone = 'station';
  window._inStation = true;
  dsHideMobileHUD();

  if (dsCanvas)     { dsCanvas.style.display = 'none'; dsCanvas.style.zIndex = '1'; }
  if (dsAITerminal) { dsAITerminal.style.display = 'none'; }

  ['dsNearbyMenu','dsChatWin','dsTargetOpts','dsStationMenu','dsIncomingHail',
   'dsRansomInput','dsForgeCancelUI','dsUndockScreen'].forEach(function(id) {
    document.getElementById(id)?.remove();
  });
  document.querySelectorAll('[data-dsoverlay]').forEach(function(el){ el.remove(); });

  if (typeof dsDSVoiceLeave === 'function') dsDSVoiceLeave();
  if (typeof dsDSCamStop   === 'function') dsDSCamStop();

  dsForgeDocked = null; dsForgeCancelling = false; dsForgeCancelTimer = 0;
  dsOtherBullets = []; dsOtherMissiles = [];
  dsCarriedBars = 0;  // reset on exit -- bars only transfer through dsDockAtHome

  if (dsCargo.ore > 0) {
    DSKT()?.emit('deepspace:returnCargo', { ore: dsCargo.ore });
    dsCargo.ore = 0;
  }

  DSKT()?.emit('deepspace:leave');
  DSKT()?.emit('player:zone', { zone: 'station' });

  // Restore UI elements -- skip canvases
  document.querySelectorAll('[data-dsHidden]').forEach(function(el) {
    if (el.tagName === 'CANVAS') { delete el.dataset.dsHidden; return; }
    var was = el.dataset.dsHidden;
    if (was && was !== 'none') { el.style.display = (was==='show') ? '' : was; }
    else { el.style.display = ''; }
    delete el.dataset.dsHidden;
  });

  // Keep earth canvas hidden -- station manages it
  if (window._dsHiddenEarthCanvas) {
    window._dsHiddenEarthCanvas.style.display = 'none';
  }

  if (window._bgMusic) window._bgMusic.volume = 0;
  if (window._earthMusicGain) window._earthMusicGain.gain.value = 0;
  console.log('[DS] dsFullTeardown complete -- dsActive:', dsActive,
    '| stCanvas:', document.getElementById("stCanvas")?.style?.display,
    '| dsCanvas:', dsCanvas?.style?.display,
    '| _inStation:', window._inStation);
}

function dsDockAtHome() {
  if (!dsActive || window._dsDocking) return;
  window._dsDocking = true;
  dsPlayWarp();
  var barsToTransfer = dsShipBars;
  dsShipBars = 0;
  // Replenish missiles on dock
  dsMissileCount = 25;
  DNOTIFY('Missiles restocked.');

  // Always emit returnCargo -- server also picks up sp.carriedBars (loot bars)
  var _haulTotal = barsToTransfer + dsCarriedBars;
  DSKT()?.emit('deepspace:returnCargo', { ore: 0, bars: barsToTransfer });
  dsCarriedBars = 0;
  if (_haulTotal > 0) {
    DNOTIFY('★ +' + _haulTotal.toLocaleString() + ' bars transferred.');
  } else {
    DNOTIFY('Docked at Station Alpha.');
  }

  // Transfer space parts bag to station inventory
  // Capture part IDs BEFORE clearing so parts tab can highlight them
  var _haulParts = dsSpaceParts.length;
  if (dsSpaceParts.length > 0) {
    window._shipNewPartIds = (window._shipNewPartIds||[]).concat(dsSpaceParts.map(function(p){return p.id;}));
    window._shipNewParts = (window._shipNewParts||0) + dsSpaceParts.length;
    DSKT()?.emit('deepspace:lootParts', { parts: dsSpaceParts });
    DNOTIFY('⧡ ' + dsSpaceParts.length + ' part' + (dsSpaceParts.length>1?'s':'') + ' transferred to your inventory.');
    dsSpaceParts = [];
  }

  // Ore stays in space -- dump it
  dsCargo.ore = 0;

  var _haulBars  = _haulTotal;  // forge + loot bars combined

  // Wormhole transition back to station -- full nuclear teardown
  setTimeout(function() {
    window._dsDocking = false;
    DSKT()?.emit('deepspace:dock');
    dsFullTeardown();
    // Show HAUL screen if player brought anything back
    if (_haulBars > 0 || _haulParts > 0) {
      var hov = document.createElement('div');
      hov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;display:flex;align-items:center;justify-content:center;font-family:Courier New,monospace;cursor:pointer;animation:dsFadeIn 0.4s ease-out;';
      var hbox = document.createElement('div');
      hbox.style.cssText = 'text-align:center;max-width:380px;padding:40px;';
      var htitle = document.createElement('div');
      htitle.style.cssText = 'color:#00FFB8;font-size:52px;font-weight:bold;letter-spacing:0.2em;text-shadow:0 0 40px rgba(0,255,184,0.6);margin-bottom:8px;';
      htitle.textContent = 'HAUL!';
      hbox.appendChild(htitle);
      var hsub = document.createElement('div');
      hsub.style.cssText = 'color:rgba(150,200,255,0.4);font-size:11px;letter-spacing:0.2em;margin-bottom:32px;';
      hsub.textContent = 'SAFE DOCK AT STATION ALPHA';
      hbox.appendChild(hsub);
      if (_haulBars > 0) {
        var hbars = document.createElement('div');
        hbars.style.cssText = 'color:#FFDD44;font-size:42px;font-weight:bold;margin-bottom:4px;text-shadow:0 0 30px rgba(255,220,50,0.7);letter-spacing:0.05em;';
        hbars.textContent = '+' + _haulBars.toLocaleString();
        hbox.appendChild(hbars);
        var hbarsLbl = document.createElement('div');
        hbarsLbl.style.cssText = 'color:rgba(255,220,50,0.6);font-size:13px;letter-spacing:0.2em;margin-bottom:16px;';
        hbarsLbl.textContent = 'BARS TRANSFERRED TO ACCOUNT';
        hbox.appendChild(hbarsLbl);
      }
      if (_haulParts > 0) {
        var hparts = document.createElement('div');
        hparts.style.cssText = 'color:#AA88FF;font-size:18px;margin-bottom:28px;';
        hparts.textContent = '⧡ ' + _haulParts + ' part' + (_haulParts>1?'s':'') + ' transferred to inventory';
        hbox.appendChild(hparts);
      }
      var hcont = document.createElement('div');
      hcont.style.cssText = 'color:rgba(150,200,255,0.25);font-size:11px;letter-spacing:0.1em;margin-top:16px;';
      hcont.textContent = 'tap to continue';
      hbox.appendChild(hcont);
      hov.appendChild(hbox);
      document.body.appendChild(hov);
      function _dismissHaul() {
        hov.remove();
        window._forceStationReload = true;
        window.enterStation?.();
      }
      hov.addEventListener('click', _dismissHaul);
      setTimeout(_dismissHaul, 4000); // auto-dismiss after 4s
    } else {
      setTimeout(function() {
        window._forceStationReload = true;
        window.enterStation?.();
      }, 150);
    }
  }, 1200);
}

// ── DRAW FACTION STATION ──────────────────────────────────────────────────────

// ── WARZONE ARENA WALLS + PORTALS ─────────────────────────────────────────────
var ARENA_ZONES = ['4-1','4-2','5-1','5-2'];
// Portal definitions: which zones have portals, where on the wall, and where they lead
var ARENA_PORTALS_DEF = {
  '4-1': [{ side:'south', x:DS_CENTER, y:DS_WORLD-80,  destZone:'3-1', destX:DS_CENTER, destY:80,       label:'EXIT S' }],
  '4-2': [{ side:'east',  x:DS_WORLD-80, y:DS_CENTER,  destZone:'4-3', destX:80,        destY:DS_CENTER, label:'EXIT E' }],
  '5-2': [{ side:'east',  x:DS_WORLD-80, y:DS_CENTER,  destZone:'5-3', destX:80,        destY:DS_CENTER, label:'EXIT E' }],
};
// Entry portals on outside zones leading into arena
var ARENA_ENTRY_PORTALS_DEF = {
  '3-1': [{ side:'north', x:DS_CENTER, y:80,           destZone:'4-1', destX:DS_CENTER, destY:DS_WORLD-200, label:'ENTER WARZONE' }],
  '4-3': [{ side:'west',  x:80,        y:DS_CENTER,    destZone:'4-2', destX:DS_WORLD-200, destY:DS_CENTER, label:'ENTER WARZONE' }],
  '5-3': [{ side:'west',  x:80,        y:DS_CENTER,    destZone:'5-2', destX:DS_WORLD-200, destY:DS_CENTER, label:'ENTER WARZONE' }],
};

function dsGetArenaPortals(zone) {
  var all = [];
  var def = ARENA_PORTALS_DEF[zone] || [];
  var ent = ARENA_ENTRY_PORTALS_DEF[zone] || [];
  def.forEach(function(p){ all.push(Object.assign({type:'exit'}, p)); });
  ent.forEach(function(p){ all.push(Object.assign({type:'entry'}, p)); });
  return all;
}

function dsDrawArenaWalls() {
  if (!dsZone) return;
  var zone = dsZone.n+'-'+dsZone.e;
  var isArena = ARENA_ZONES.includes(zone);
  var isEntry = ARENA_ENTRY_PORTALS_DEF[zone];
  if (!isArena && !isEntry) return;

  var t = Date.now()*0.001;
  var pulse = 0.5+Math.sin(t*2)*0.4;
  var wallColor = dsWarzoneArena.active ? 'rgba(255,80,20,0.9)' : 'rgba(80,200,255,0.7)';
  var wallGlow  = dsWarzoneArena.active ? 'rgba(255,80,20,0.3)' : 'rgba(0,150,255,0.2)';
  var WALL_W = 18;
  var portals = dsGetArenaPortals(zone);

  if (isArena) {
    // Draw the 4 outer walls with battlement notches
    // Each wall only drawn on arena-exterior sides
    // Outer perimeter walls:
    // e=1 (west column) and n=5 (north row) are the edge of space -- no wall drawn there
    // Only SOUTH faces of 4-1/4-2 and EAST faces of 4-2/5-2 are real arena barriers
    var walls = [];
    if (zone === '4-1') walls = ['south'];           // west is map edge (e=1 col)
    if (zone === '4-2') walls = ['south','east'];    // south borders 3-2, east borders 4-3
    if (zone === '5-1') walls = [];                  // north=map edge(n=5), west=map edge(e=1)
    if (zone === '5-2') walls = ['east'];            // north is map edge (n=5), east borders 5-3
    // Inner shared walls between adjacent arena zones
    var innerWalls = [];
    if (zone === '4-1') innerWalls = ['north','east'];
    if (zone === '4-2') innerWalls = ['north','west'];
    if (zone === '5-1') innerWalls = ['south','east'];
    if (zone === '5-2') innerWalls = ['south','west'];

    dsCtx.save();
    // Outer walls
    walls.forEach(function(side) {
      _drawWallSegment(side, portals.filter(function(p){return p.side===side;}), wallColor, wallGlow, WALL_W, pulse, true);
    });
    // Inner walls (lighter, shared between arena zones)
    dsCtx.globalAlpha = 0.35;
    innerWalls.forEach(function(side) {
      _drawWallSegment(side, [], 'rgba(0,200,255,0.5)', 'rgba(0,100,200,0.1)', 6, pulse, false);
    });
    dsCtx.globalAlpha = 1;
    dsCtx.restore();
  }

  // Draw portals in this zone (arena exits or entry from outside)
  portals.forEach(function(portal) {
    _drawPortal(portal, pulse);
  });

  // Update dsArenaPortals for proximity check
  dsArenaPortals = portals;
}

function _drawWallSegment(side, portals, color, glowColor, width, pulse, battlements) {
  var x0,y0,x1,y1;
  if (side==='north') { x0=0; y0=0;        x1=DS_WORLD; y1=0; }
  if (side==='south') { x0=0; y0=DS_WORLD; x1=DS_WORLD; y1=DS_WORLD; }
  if (side==='west')  { x0=0; y0=0;        x1=0;        y1=DS_WORLD; }
  if (side==='east')  { x0=DS_WORLD; y0=0; x1=DS_WORLD; y1=DS_WORLD; }
  var isH = (side==='north'||side==='south');

  // Glow
  dsCtx.shadowColor = glowColor;
  dsCtx.shadowBlur = 20;

  // Main wall body
  dsCtx.strokeStyle = color;
  dsCtx.lineWidth = width;
  dsCtx.setLineDash([]);

  // Draw wall with gaps for portals
  var portalGap = 80;
  if (portals.length === 0) {
    dsCtx.beginPath(); dsCtx.moveTo(x0,y0); dsCtx.lineTo(x1,y1); dsCtx.stroke();
  } else {
    portals.forEach(function(p) {
      var px = p.x, py = p.y;
      dsCtx.beginPath();
      if (isH) {
        dsCtx.moveTo(x0,y0); dsCtx.lineTo(px-portalGap,y0);
        dsCtx.moveTo(px+portalGap,y0); dsCtx.lineTo(x1,y1);
      } else {
        dsCtx.moveTo(x0,y0); dsCtx.lineTo(x0,py-portalGap);
        dsCtx.moveTo(x0,py+portalGap); dsCtx.lineTo(x1,y1);
      }
      dsCtx.stroke();
    });
  }

  // Battlements (castle notches)
  if (battlements) {
    var NOTCH_W = 30, NOTCH_H = width*0.8, NOTCH_SPACING = 120;
    dsCtx.fillStyle = color;
    dsCtx.shadowBlur = 0;
    var len = isH ? DS_WORLD : DS_WORLD;
    for (var i = NOTCH_SPACING/2; i < len; i += NOTCH_SPACING) {
      // Skip portal gaps
      var skip = false;
      portals.forEach(function(p){ var pp=isH?p.x:p.y; if(Math.abs(i-pp)<100)skip=true; });
      if (skip) continue;
      if (isH) {
        var wy = (side==='north') ? 0 : DS_WORLD - NOTCH_H;
        dsCtx.fillRect(i-NOTCH_W/2, wy, NOTCH_W, NOTCH_H);
      } else {
        var wx = (side==='west') ? 0 : DS_WORLD - NOTCH_H;
        dsCtx.fillRect(wx, i-NOTCH_W/2, NOTCH_H, NOTCH_W);
      }
    }
  }
  dsCtx.shadowBlur = 0;
}

function _drawPortal(portal, pulse) {
  var px = portal.x, py = portal.y;
  var locked = dsWarzoneArena.portalLocked && portal.type === 'exit';
  var col = locked ? 'rgba(255,50,50,' : (portal.type==='entry'?'rgba(0,255,150,':'rgba(0,200,255,');
  var r = 50;
  var t = Date.now()*0.001;

  // Portal ring
  dsCtx.save();
  dsCtx.shadowColor = col+'0.8)'; dsCtx.shadowBlur = 20;
  dsCtx.strokeStyle = col+(0.6+pulse*0.4)+')';
  dsCtx.lineWidth = 4;
  dsCtx.beginPath(); dsCtx.arc(px, py, r, 0, Math.PI*2); dsCtx.stroke();
  // Inner swirl
  dsCtx.strokeStyle = col+(0.3+pulse*0.3)+')';
  dsCtx.lineWidth = 2;
  dsCtx.beginPath(); dsCtx.arc(px, py, r*0.6, t%Math.PI*2, t%Math.PI*2+Math.PI*1.2); dsCtx.stroke();
  dsCtx.shadowBlur = 0; dsCtx.restore();

  // Label
  dsCtx.fillStyle = locked ? 'rgba(255,100,100,0.8)' : col+'0.9)';
  dsCtx.font = 'bold 9px Courier New'; dsCtx.textAlign = 'center';
  var labelY = (portal.side==='south'||portal.side==='east') ? py - r - 8 : py + r + 14;
  dsCtx.fillText(locked ? 'LOCKED' : portal.label, px, labelY);

  // Proximity: instant zone transfer
  if (dsShip && !locked) {
    var dx=dsShip.x-px, dy=dsShip.y-py;
    if (Math.sqrt(dx*dx+dy*dy) < r*0.8) {
      _usePortal(portal);
    }
  }
}

var _portalCooldown = 0;
var _ARENA_ZONES = ['4-1','4-2','5-1','5-2'];

function _usePortal(portal) {
  var now = Date.now();
  if (now - _portalCooldown < 3000) return;
  if (dsZoneTransitioning) return;
  // Block ALL portal access when warzone is active (portals locked both ways)
  if (dsWarzoneArena.portalLocked) {
    DNOTIFY('⚔ SPACEZONE ACTIVE -- Portals locked. Wait for cooldown.');
    return;
  }
  // Show entry prompt when flying into arena zones (set cooldown first to prevent every-frame spam)
  if (_ARENA_ZONES.includes(portal.destZone)) {
    _portalCooldown = now;
    _showArenaEntryPrompt(portal);
    return;
  }
  _execPortalTeleport(portal);
}

function _showArenaEntryPrompt(portal) {
  // Only one prompt at a time
  if (document.getElementById('_arenaPrompt')) return;
  // Request fresh state so timer is accurate
  DSKT()?.emit('game:getState');
  var _active = dsWarzoneArena.active;
  var ov = document.createElement('div');
  ov.id = '_arenaPrompt';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:850;display:flex;align-items:center;justify-content:center;font-family:Courier New,monospace;';
  if (_active) {
    // ACTIVE -- entry denied
    ov.innerHTML = '<div style="max-width:380px;text-align:center;padding:32px;">'
      + '<div style="font-size:10px;letter-spacing:0.2em;color:rgba(150,200,255,0.35);margin-bottom:10px;">PORTAL DETECTED</div>'
      + '<div style="font-size:22px;font-weight:bold;color:#FF6600;letter-spacing:0.15em;margin-bottom:10px;">SPACEZONE</div>'
      + '<div style="font-size:16px;font-weight:bold;color:#FF2200;letter-spacing:0.12em;margin-bottom:18px;">ENTRY DENIED</div>'
      + '<div style="color:rgba(150,200,255,0.5);font-size:11px;margin-bottom:6px;">GATES CLOSING IN</div>'
      + '<div id="_arenaTimer" style="font-size:28px;font-weight:bold;color:#FF4400;letter-spacing:0.1em;margin-bottom:24px;">--:--</div>'
      + '<div style="color:rgba(255,150,100,0.5);font-size:11px;margin-bottom:24px;">Portals are locked. Wait for cooldown.</div>'
      + '<button id="_pCancel" style="background:rgba(0,20,50,0.8);border:1px solid rgba(0,100,200,0.3);color:rgba(100,180,255,0.7);font-family:Courier New,monospace;font-size:13px;padding:10px 32px;border-radius:6px;cursor:pointer;">BACK</button>'
      + '</div>';
    document.body.appendChild(ov);
    var _ti = setInterval(function() {
      var _el = document.getElementById('_arenaTimer'); if (!_el) { clearInterval(_ti); return; }
      var _s = Math.max(0, Math.round((dsWarzoneArena.nextStart - Date.now())/1000));
      _el.textContent = Math.floor(_s/60) + ':' + ('0'+(_s%60)).slice(-2);
    }, 1000);
    ov.querySelector('#_pCancel').addEventListener('click', function() { clearInterval(_ti); ov.remove(); });
  } else {
    // COOLDOWN -- entry granted
    ov.innerHTML = '<div style="max-width:380px;text-align:center;padding:32px;">'
      + '<div style="font-size:10px;letter-spacing:0.2em;color:rgba(150,200,255,0.35);margin-bottom:10px;">PORTAL DETECTED</div>'
      + '<div style="font-size:22px;font-weight:bold;color:#FF6600;letter-spacing:0.15em;margin-bottom:10px;">SPACEZONE</div>'
      + '<div style="font-size:16px;font-weight:bold;color:#44FF88;letter-spacing:0.12em;margin-bottom:18px;">ENTRY GRANTED</div>'
      + '<div style="color:rgba(150,200,255,0.5);font-size:11px;margin-bottom:6px;">NEXT BATTLE STARTING IN</div>'
      + '<div id="_arenaTimer" style="font-size:28px;font-weight:bold;color:#FFAA00;letter-spacing:0.1em;margin-bottom:24px;">--:--</div>'
      + '<div style="color:rgba(255,150,100,0.5);font-size:11px;margin-bottom:24px;">Warning: portals lock when battle starts.<br>Players inside are trapped until it ends.</div>'
      + '<div style="display:flex;gap:12px;justify-content:center;">'
      + '<button id="_pEnter" style="background:rgba(0,200,80,0.15);border:1px solid rgba(0,200,80,0.5);color:#44FF88;font-family:Courier New,monospace;font-size:13px;padding:10px 28px;border-radius:6px;cursor:pointer;">ENTER</button>'
      + '<button id="_pCancel" style="background:rgba(0,20,50,0.8);border:1px solid rgba(0,100,200,0.3);color:rgba(100,180,255,0.7);font-family:Courier New,monospace;font-size:13px;padding:10px 28px;border-radius:6px;cursor:pointer;">CANCEL</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    var _ti = setInterval(function() {
      var _el = document.getElementById('_arenaTimer'); if (!_el) { clearInterval(_ti); return; }
      var _s = Math.max(0, Math.round((dsWarzoneArena.nextStart - Date.now())/1000));
      _el.textContent = Math.floor(_s/60) + ':' + ('0'+(_s%60)).slice(-2);
    }, 1000);
    ov.querySelector('#_pEnter').addEventListener('click', function() { clearInterval(_ti); ov.remove(); _execPortalTeleport(portal); });
    ov.querySelector('#_pCancel').addEventListener('click', function() { clearInterval(_ti); ov.remove(); });
  }
}

function _execPortalTeleport(portal) {
  if (dsZoneTransitioning) return;
  _portalCooldown = Date.now();
  dsZoneTransitioning = true;
  var destN = parseInt(portal.destZone.split('-')[0]);
  var destE = parseInt(portal.destZone.split('-')[1]);
  dsPlayWarp();
  var flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:550;opacity:0;pointer-events:none;transition:opacity 0.3s;';
  document.body.appendChild(flash);
  requestAnimationFrame(function(){ flash.style.opacity='0.85'; });
  setTimeout(function() {
    dsZone = { n:destN, e:destE };
    dsSetupZone(dsZone, null);
    if (dsShip) { dsShip.x = portal.destX; dsShip.y = portal.destY; }
    dsCameraX = portal.destX; dsCameraY = portal.destY;
    dsBullets=[]; dsMissiles=[]; dsEnemyBullets=[];
    DSKT()?.emit('deepspace:zone', { zone: dsZone });
    var _cname = _ARENA_ZONES.includes(portal.destZone) ? '⚔ Entered SPACEZONE' :
      (portal.destZone === '5-3' ? 'Darkness Strip' : 'Zone ' + portal.destZone);
    dsQueueAI(_cname + '. Portal transit complete.');
    flash.style.opacity = '0';
    setTimeout(function(){ flash.remove(); dsZoneTransitioning = false; }, 400);
  }, 350);
}

function dsDrawFactionStation(st) {
  const t=Date.now()*0.001;
  const pulse=0.5+Math.sin(t*1.5)*0.4;
  // Glow
  const g=dsCtx.createRadialGradient(st.x,st.y,0,st.x,st.y,st.r*3);
  g.addColorStop(0,`${st.color}44`); g.addColorStop(1,'transparent');
  dsCtx.fillStyle=g; dsCtx.beginPath(); dsCtx.arc(st.x,st.y,st.r*3,0,Math.PI*2); dsCtx.fill();
  // Body (hexagon)
  dsCtx.save(); dsCtx.translate(st.x,st.y); dsCtx.rotate(t*0.1);
  dsCtx.beginPath();
  for (let i=0;i<6;i++) {
    const a=(i/6)*Math.PI*2;
    i===0?dsCtx.moveTo(Math.cos(a)*st.r,Math.sin(a)*st.r):dsCtx.lineTo(Math.cos(a)*st.r,Math.sin(a)*st.r);
  }
  dsCtx.closePath();
  dsCtx.fillStyle=`rgba(${st.color.slice(1).match(/../g).map(h=>parseInt(h,16)).join(',')},0.3)`;
  dsCtx.strokeStyle=st.color; dsCtx.lineWidth=2;
  dsCtx.shadowColor=st.color; dsCtx.shadowBlur=16;
  dsCtx.fill(); dsCtx.stroke(); dsCtx.shadowBlur=0;
  dsCtx.restore();
  // Label
  dsCtx.fillStyle=`rgba(${st.color.slice(1).match(/../g).map(h=>parseInt(h,16)).join(',')},${pulse})`;
  dsCtx.font='bold 12px Courier New'; dsCtx.textAlign='center';
  dsCtx.fillText(st.name,st.x,st.y-st.r-12);
  // Proximity prompt + E key
  if (dsShip) {
    var sdx2=dsShip.x-st.x, sdy2=dsShip.y-st.y;
    if (Math.sqrt(sdx2*sdx2+sdy2*sdy2)<st.promptRadius) {
      dsCtx.fillStyle='rgba(255,255,255,0.7)'; dsCtx.font='11px Courier New'; dsCtx.textAlign='center';
      dsCtx.fillText('[E] HAIL STATION',st.x,st.y+st.r+16);
      // Store nearest station for E key
      dsNearestStation = st;
    }
  }
}

// ── DRAW STAR FORGE ───────────────────────────────────────────────────────────
function dsDrawForge() {
  if (!dsForge) return;
  const t=Date.now()*0.001;
  const { x, y, ringR, starR } = dsForge;

  // Star core glow
  const sg=dsCtx.createRadialGradient(x,y,0,x,y,starR*3);
  sg.addColorStop(0,'rgba(255,220,80,0.9)');
  sg.addColorStop(0.3,'rgba(255,140,20,0.5)');
  sg.addColorStop(1,'transparent');
  dsCtx.fillStyle=sg; dsCtx.beginPath(); dsCtx.arc(x,y,starR*3,0,Math.PI*2); dsCtx.fill();
  dsCtx.fillStyle='rgba(255,240,180,0.95)';
  dsCtx.shadowColor='#FFCC00'; dsCtx.shadowBlur=40;
  dsCtx.beginPath(); dsCtx.arc(x,y,starR,0,Math.PI*2); dsCtx.fill();
  dsCtx.shadowBlur=0;

  // Exclusion ring
  const ringPulse=0.6+Math.sin(t*0.8)*0.3;
  dsCtx.beginPath(); dsCtx.arc(x,y,ringR,0,Math.PI*2);
  dsCtx.strokeStyle=`rgba(255,100,0,${ringPulse*0.7})`;
  dsCtx.lineWidth=4; dsCtx.setLineDash([20,10]); dsCtx.stroke(); dsCtx.setLineDash([]);
  // Danger label
  dsCtx.fillStyle=`rgba(255,100,0,${ringPulse})`;
  dsCtx.font='bold 11px Courier New'; dsCtx.textAlign='center';
  dsCtx.fillText('STAR FORGE — EXCLUSION ZONE',x,y-ringR-14);

  // Dock points
  dsForge.dockPoints.forEach((dp,i) => {
    const dp_t = dp.occupied && dp.processingUntil
      ? Math.max(0, dp.processingUntil - Date.now()) / 300000 : 0;
    const col = dp.occupied ? '#FF8800' : '#00FFCC';
    dsCtx.save(); dsCtx.translate(dp.x,dp.y);
    dsCtx.rotate(t*0.5+i);
    // Dock icon
    dsCtx.strokeStyle=col; dsCtx.lineWidth=2;
    dsCtx.shadowColor=col; dsCtx.shadowBlur=10;
    dsCtx.strokeRect(-14,-14,28,28);
    if (dp.occupied) {
      // Processing bar
      dsCtx.fillStyle='rgba(0,0,0,0.5)'; dsCtx.fillRect(-14,16,28,5);
      dsCtx.fillStyle='#FF8800'; dsCtx.fillRect(-14,16,28*(1-dp_t),5);
      if (dp.ownerName) {
        dsCtx.fillStyle='rgba(255,180,0,0.8)'; dsCtx.font='8px Courier New';
        dsCtx.textAlign='center'; dsCtx.fillText(dp.ownerName,0,30);
      }
    }
    dsCtx.shadowBlur=0; dsCtx.restore();
    if (!dp.occupied) {
      dsCtx.fillStyle='rgba(0,255,200,0.7)'; dsCtx.font='9px Courier New';
      dsCtx.textAlign='center'; dsCtx.fillText('STAR FORGE',dp.x,dp.y+24);
    }
    // Proximity prompt
    if (dsShip) {
      const ddx=dsShip.x-dp.x, ddy=dsShip.y-dp.y;
      const ddist=Math.sqrt(ddx*ddx+ddy*ddy);
      if (ddist<120) {
        dsCtx.textAlign='center';
        if (dsCargo.ore>0 && !dp.occupied) {
          dsCtx.fillStyle='rgba(255,220,80,0.95)'; dsCtx.font='bold 12px Courier New';
          dsCtx.fillText('[E] SMELT ORE',dp.x,dp.y-30);
          dsCtx.fillStyle='rgba(255,255,255,0.5)'; dsCtx.font='9px Courier New';
          dsCtx.fillText(dsCargo.ore+' ore ready',dp.x,dp.y-16);
          // Mobile tap button -- store hitbox
          dp._tapBtnX = dp.x; dp._tapBtnY = dp.y-42; dp._tapBtnR = 28;
        } else if (dp.occupied && dp.ownerName===DUSR()) {
          dsCtx.fillStyle='rgba(255,140,0,0.9)'; dsCtx.font='bold 11px Courier New';
          dsCtx.fillText('SMELTING...',dp.x,dp.y-30);
          dp._tapBtnX = null;
        } else if (dsCargo.ore<=0 && !dp.occupied) {
          dsCtx.fillStyle='rgba(150,150,150,0.5)'; dsCtx.font='9px Courier New';
          dsCtx.fillText('need ore to smelt',dp.x,dp.y-20);
          dp._tapBtnX = null;
        }
      } else {
        dp._tapBtnX = null;
      }
    }
  });
}

// ── DRAW FORGE TIMER ──────────────────────────────────────────────────────────
function dsDrawForgeTimer(W,H) {
  if (!dsForgeDocked) return;
  const remaining = Math.max(0, dsForgeDocked.processingUntil - Date.now());
  const mins = Math.floor(remaining/60000);
  const secs = Math.floor((remaining%60000)/1000);
  const pct  = 1 - remaining/300000;
  dsCtx.save();
  dsCtx.fillStyle='rgba(0,10,25,0.85)';
  dsCtx.strokeStyle='rgba(255,140,0,0.5)';
  dsCtx.lineWidth=1;
  dsCtx.beginPath(); dsCtx.roundRect(W/2-100,H-90,200,50,8);
  dsCtx.fill(); dsCtx.stroke();
  dsCtx.fillStyle='rgba(255,140,0,0.3)'; dsCtx.fillRect(W/2-92,H-70,184*pct,12);
  dsCtx.strokeStyle='rgba(255,140,0,0.4)'; dsCtx.lineWidth=0.8;
  dsCtx.strokeRect(W/2-92,H-70,184,12);
  dsCtx.fillStyle='rgba(255,180,50,0.9)'; dsCtx.font='bold 11px Courier New';
  dsCtx.textAlign='center'; dsCtx.fillText('SMELTING: '+mins+'m '+secs+'s',W/2,H-78);
  dsCtx.restore();
}

// ── DRAW ZONE BOUNDARIES ──────────────────────────────────────────────────────
function dsDrawZoneBoundaries(W,H) {
  const edges=[
    {dir:'north',x1:0,y1:DS_EDGE,x2:DS_WORLD,y2:DS_EDGE,adj:{n:dsZone.n+1,e:dsZone.e}},
    {dir:'south',x1:0,y1:DS_WORLD-DS_EDGE,x2:DS_WORLD,y2:DS_WORLD-DS_EDGE,adj:{n:dsZone.n-1,e:dsZone.e}},
    {dir:'east', x1:DS_WORLD-DS_EDGE,y1:0,x2:DS_WORLD-DS_EDGE,y2:DS_WORLD,adj:{n:dsZone.n,e:dsZone.e+1}},
    {dir:'west', x1:DS_EDGE,y1:0,x2:DS_EDGE,y2:DS_WORLD,adj:{n:dsZone.n,e:dsZone.e-1}},
  ];
  edges.forEach(e => {
    const adj=e.adj;
    if (adj.n<1||adj.n>5||adj.e<1||adj.e>5) return;
    const accessible=isZoneAccessible(dsZone,adj);
    const ac=zoneContent(adj);
    const dc=DANGER_COLORS[ac.danger]||'#888';
    dsCtx.save();
    dsCtx.strokeStyle=accessible?dc+'88':'rgba(100,100,100,0.3)';
    dsCtx.lineWidth=2; dsCtx.setLineDash([16,10]);
    dsCtx.beginPath(); dsCtx.moveTo(e.x1,e.y1); dsCtx.lineTo(e.x2,e.y2); dsCtx.stroke();
    dsCtx.setLineDash([]);
    // Label at midpoint
    const mx=(e.x1+e.x2)/2, my=(e.y1+e.y2)/2;
    if (accessible) {
      dsCtx.fillStyle=dc+'AA'; dsCtx.font='bold 10px Courier New'; dsCtx.textAlign='center';
      dsCtx.fillText(`${adj.n}-${adj.e} ${ac.name?ac.name:DANGER_NAMES[ac.danger]}`,mx,my-8);
    }
    dsCtx.restore();
  });
}

// ── FOG OF WAR ────────────────────────────────────────────────────────────────
let dsFogCanvas=null, dsFogCtx=null;
function dsDrawFog(W,H) {
  if (!dsShip) return;
  if (!dsFogCanvas||dsFogCanvas.width!==W||dsFogCanvas.height!==H) {
    dsFogCanvas=document.createElement('canvas');
    dsFogCanvas.width=W; dsFogCanvas.height=H;
    dsFogCtx=dsFogCanvas.getContext('2d');
  }
  const scx=W/2, scy=H/2;
  dsFogCtx.clearRect(0,0,W,H);
  dsFogCtx.fillStyle='#000010'; dsFogCtx.fillRect(0,0,W,H);
  dsFogCtx.globalCompositeOperation='destination-out';
  // Ambient
  const ag=dsFogCtx.createRadialGradient(scx,scy,DS_LIGHT*0.3,scx,scy,DS_AMBIENT);
  ag.addColorStop(0,'rgba(0,0,0,0.85)'); ag.addColorStop(0.6,'rgba(0,0,0,0.5)'); ag.addColorStop(1,'rgba(0,0,0,0)');
  dsFogCtx.fillStyle=ag; dsFogCtx.beginPath(); dsFogCtx.arc(scx,scy,DS_AMBIENT,0,Math.PI*2); dsFogCtx.fill();
  // Light
  const lg=dsFogCtx.createRadialGradient(scx,scy,0,scx,scy,DS_LIGHT);
  lg.addColorStop(0,'rgba(0,0,0,1)'); lg.addColorStop(0.7,'rgba(0,0,0,0.95)'); lg.addColorStop(1,'rgba(0,0,0,0)');
  dsFogCtx.fillStyle=lg; dsFogCtx.beginPath(); dsFogCtx.arc(scx,scy,DS_LIGHT,0,Math.PI*2); dsFogCtx.fill();
  // Flashlight
  const fR=70, fa=dsShip.angle;
  const fx=scx+Math.cos(fa)*fR*0.5, fy=scy+Math.sin(fa)*fR*0.5;
  const fg=dsFogCtx.createRadialGradient(fx,fy,0,fx,fy,fR*2);
  fg.addColorStop(0,'rgba(0,0,0,1)'); fg.addColorStop(0.5,'rgba(0,0,0,0.8)'); fg.addColorStop(1,'rgba(0,0,0,0)');
  dsFogCtx.fillStyle=fg; dsFogCtx.beginPath(); dsFogCtx.arc(fx,fy,fR*2,0,Math.PI*2); dsFogCtx.fill();
  dsFogCtx.globalCompositeOperation='source-over';
  dsCtx.drawImage(dsFogCanvas,0,0);
  dsCtx.fillStyle='rgba(0,5,20,0.25)'; dsCtx.fillRect(0,0,W,H);
}

// ── TACTICAL HUD (reused from space-client) ───────────────────────────────────
function dsDrawTacticalHUD(W,H) {
  if (!dsShip) return;
  const t=Date.now()*0.001;
  const cx=W/2, cy=H-120;
  const shieldPct=Math.max(0,dsShip.shield/dsShip.maxShield);
  const sc=shieldPct>0.6?[0,220,255]:shieldPct>0.3?[255,180,0]:[255,50,50];

  // Triangle
  const triR=92;
  dsCtx.save(); dsCtx.translate(cx,cy+10); dsCtx.rotate(Math.sin(t*0.18)*0.04);
  const triPts=[0,1,2].map(i=>{const a=(i/3)*Math.PI*2-Math.PI/2;return[Math.cos(a)*triR,Math.sin(a)*triR];});
  dsCtx.beginPath(); dsCtx.moveTo(triPts[0][0],triPts[0][1]);
  dsCtx.lineTo(triPts[1][0],triPts[1][1]); dsCtx.lineTo(triPts[2][0],triPts[2][1]); dsCtx.closePath();
  const tg=dsCtx.createRadialGradient(0,0,10,0,0,triR);
  tg.addColorStop(0,`rgba(${sc},0.07)`.replace('rgba(${sc}',`rgba(${sc[0]},${sc[1]},${sc[2]}`));
  tg.addColorStop(1,`rgba(${sc},0.02)`.replace('rgba(${sc}',`rgba(${sc[0]},${sc[1]},${sc[2]}`));
  dsCtx.fillStyle=tg; dsCtx.fill();
  dsCtx.strokeStyle=`rgba(${sc[0]},${sc[1]},${sc[2]},${0.25+Math.sin(t*1.5)*0.08})`;
  dsCtx.lineWidth=1.2; dsCtx.stroke(); dsCtx.restore();

  // Pentagon shield
  const pentR=55, sides=5;
  for (let i=0;i<sides;i++) {
    const ss=(i*2*Math.PI/sides)-Math.PI/2, se=((i+1)*2*Math.PI/sides)-Math.PI/2;
    if (!(dsShip.shield>(i*(dsShip.maxShield/sides)))) continue;
    const pulse=0.65+Math.sin(t*2.5+i*1.2)*0.25;
    dsCtx.beginPath(); dsCtx.arc(cx,cy,pentR,ss+0.07,se-0.07);
    dsCtx.arc(cx,cy,pentR-10,se-0.07,ss+0.07,true); dsCtx.closePath();
    dsCtx.fillStyle=`rgba(${sc[0]},${sc[1]},${sc[2]},${pulse*0.2})`; dsCtx.fill();
    dsCtx.beginPath(); dsCtx.arc(cx,cy,pentR,ss+0.07,se-0.07);
    dsCtx.strokeStyle=`rgba(${sc[0]},${sc[1]},${sc[2]},${pulse*0.9})`;
    dsCtx.lineWidth=2.5; dsCtx.stroke();
  }

  // Inner orb
  const orbR=40;
  const og=dsCtx.createRadialGradient(cx,cy-5,3,cx,cy,orbR);
  og.addColorStop(0,`rgba(${sc[0]},${sc[1]},${sc[2]},0.20)`);
  og.addColorStop(1,'rgba(0,8,22,0.88)');
  dsCtx.fillStyle=og; dsCtx.beginPath(); dsCtx.arc(cx,cy,orbR,0,Math.PI*2); dsCtx.fill();
  dsCtx.strokeStyle=`rgba(${sc[0]},${sc[1]},${sc[2]},0.55)`; dsCtx.lineWidth=1.2; dsCtx.stroke();
  if (shieldPct>0) {
    dsCtx.beginPath(); dsCtx.arc(cx,cy,orbR-5,-Math.PI/2,-Math.PI/2+shieldPct*Math.PI*2);
    dsCtx.strokeStyle=`rgba(${sc[0]},${sc[1]},${sc[2]},0.9)`; dsCtx.lineWidth=2.5; dsCtx.stroke();
  }
  // Shield %
  dsCtx.textAlign='center'; dsCtx.textBaseline='middle';
  const shNum=Math.round(shieldPct*100);
  dsCtx.font=`bold ${shNum>=100?20:22}px 'Courier New'`;
  dsCtx.fillStyle=`rgba(${sc[0]},${sc[1]},${sc[2]},1)`;
  dsCtx.shadowColor=`rgba(${sc[0]},${sc[1]},${sc[2]},0.8)`; dsCtx.shadowBlur=12;
  dsCtx.fillText(`${shNum}%`,cx,cy-6); dsCtx.shadowBlur=0;
  dsCtx.font='bold 8px Courier New';
  dsCtx.fillStyle=`rgba(${sc[0]},${sc[1]},${sc[2]},0.55)`;
  dsCtx.fillText('SHIELD',cx,cy+9);
  dsCtx.textBaseline='alphabetic';

  // Hit flash
  if (dsShip.hitFlash>0) {
    dsCtx.fillStyle=`rgba(255,0,0,${dsShip.hitFlash*0.35})`; dsCtx.fillRect(0,0,W,H);
  }
  // Own white flag shown on HUD
  if (dsShip.gunsOff) {
    var _fa2=0.7+Math.sin(Date.now()*0.006)*0.3;
    dsCtx.save();
    dsCtx.strokeStyle='rgba(200,200,200,'+_fa2+')'; dsCtx.lineWidth=2;
    dsCtx.beginPath(); dsCtx.moveTo(W/2-80,H-160); dsCtx.lineTo(W/2-80,H-180); dsCtx.stroke();
    dsCtx.fillStyle='rgba(255,255,255,'+_fa2+')';
    dsCtx.beginPath(); dsCtx.moveTo(W/2-80,H-180); dsCtx.lineTo(W/2-64,H-175); dsCtx.lineTo(W/2-80,H-170); dsCtx.closePath(); dsCtx.fill();
    dsCtx.fillStyle='rgba(100,255,150,'+_fa2+')'; dsCtx.font='bold 9px Courier New'; dsCtx.textAlign='center';
    dsCtx.fillText('PASSIVE MODE',W/2-68,H-158);
    dsCtx.restore();
  }
}

// ── ZONE HUD ──────────────────────────────────────────────────────────────────────────────
function dsDrawArenaHUD(W,H) {
  if (!dsWarzoneArena) return;
  var _ARENA = ['4-1','4-2','5-1','5-2'];
  if (!dsZone || !_ARENA.includes(dsZone.n+'-'+dsZone.e)) return;
  var _secs = Math.max(0, Math.round((dsWarzoneArena.nextStart - Date.now())/1000));
  var _mins = Math.floor(_secs/60);
  var _ss   = ('0'+(_secs%60)).slice(-2);
  var _timer = _mins+':'+_ss;
  var _label = dsWarzoneArena.active ? 'BATTLE REMAINING' : 'NEXT BATTLE IN';
  var _col   = dsWarzoneArena.active ? '#FF4400' : '#FFAA00';
  dsCtx.save();
  // Background pill
  dsCtx.fillStyle = 'rgba(0,0,0,0.65)';
  dsCtx.strokeStyle = _col + '88';
  dsCtx.lineWidth = 1;
  dsCtx.beginPath();
  dsCtx.roundRect(W/2-90, 8, 180, 44, 8);
  dsCtx.fill(); dsCtx.stroke();
  // Label
  dsCtx.fillStyle = 'rgba(150,200,255,0.5)';
  dsCtx.font = '9px Courier New'; dsCtx.textAlign = 'center';
  dsCtx.fillText(_label, W/2, 24);
  // Timer
  dsCtx.fillStyle = _col;
  dsCtx.shadowColor = _col; dsCtx.shadowBlur = 8;
  dsCtx.font = 'bold 18px Courier New';
  dsCtx.fillText(_timer, W/2, 44);
  dsCtx.shadowBlur = 0;
  dsCtx.restore();
}

function dsDrawZoneHUD(W,H) {
  if (!dsShip) return;
  const t = Date.now() * 0.001;
  const content = zoneContent(dsZone);
  const dc = DANGER_COLORS[content.danger] || '#888';

  // Zone label under minimap
  dsCtx.save();
  dsCtx.textAlign = 'right';
  dsCtx.font = 'bold 10px Courier New';
  dsCtx.fillStyle = dc + 'CC';
  dsCtx.fillText('ZONE ' + dsZone.n + '-' + dsZone.e + '  ' + (content.name||DANGER_NAMES[content.danger]||'UNKNOWN').toUpperCase(), W-12, 136);
  dsCtx.restore();

  // Bounty -- top center pulsing
  // Arena HUD -- show while in warzone zones or adjacent
  if (dsZone) {
    var _az=['4-1','4-2','5-1','5-2'];
    var _near=['3-1','4-3','5-3'];
    var _cz=dsZone.n+'-'+dsZone.e;
    if (_az.includes(_cz)||_near.includes(_cz)) {
      var _aMsg = dsWarzoneArena.active
        ? 'WARZONE ACTIVE -- '+dsWarzoneArena.playerCount+' fighters'
        : (dsWarzoneArena.cooldown
          ? 'WARZONE COOLDOWN -- Next: '+Math.max(0,Math.ceil((dsWarzoneArena.nextStart-Date.now())/1000))+'s'
          : 'WARZONE -- Queuing');
      var _aCol = dsWarzoneArena.active ? 'rgba(255,80,20,0.9)' : 'rgba(0,200,255,0.7)';
      dsCtx.save();
      dsCtx.fillStyle=_aCol; dsCtx.font='bold 11px Courier New'; dsCtx.textAlign='center';
      dsCtx.fillText(_aMsg, W/2, 58);
      if (dsWarzoneArena.portalLocked&&_az.includes(_cz)) {
        dsCtx.fillStyle='rgba(255,100,100,0.8)'; dsCtx.fillText('PORTALS LOCKED -- Fight or die!', W/2, 74);
      }
      dsCtx.restore();
    }
  }
  if (dsBounty > 0) {
    const pulse = 0.7 + Math.sin(t * 3) * 0.3;
    dsCtx.save();
    dsCtx.textAlign = 'center';
    dsCtx.font = 'bold 13px Courier New';
    dsCtx.fillStyle = 'rgba(255,60,60,' + pulse + ')';
    dsCtx.shadowColor = 'rgba(255,0,0,0.6)'; dsCtx.shadowBlur = 10;
    dsCtx.fillText('⚠ BOUNTY: ' + dsBounty.toLocaleString() + ' bars', W/2, 32);
    dsCtx.shadowBlur = 0; dsCtx.restore();
  }

  // Ship status -- top-left on mobile, bottom-left on desktop
  const sw = W < 768 ? 160 : 192;
  const sh = 108;
  const sx = 10, sy = W < 768 ? 10 : H - sh - 10;
  dsCtx.save();
  dsCtx.fillStyle = 'rgba(0,6,18,0.82)';
  dsCtx.strokeStyle = 'rgba(0,180,220,0.3)'; dsCtx.lineWidth = 1;
  dsCtx.beginPath(); dsCtx.roundRect(sx, sy, sw, sh, 8); dsCtx.fill(); dsCtx.stroke();
  dsCtx.font = 'bold 10px Courier New'; dsCtx.fillStyle = 'rgba(0,200,220,0.6)';
  dsCtx.fillText('SHIP STATUS', sx+10, sy+15);
  const bw = sw - 20; const bx = sx + 10;
  const cp = dsCargo.maxOre > 0 ? dsCargo.ore / dsCargo.maxOre : 0;
  dsCtx.fillStyle = 'rgba(0,200,255,0.1)'; dsCtx.fillRect(bx, sy+22, bw, 10);
  dsCtx.fillStyle = cp > 0.8 ? 'rgba(255,140,0,0.85)' : 'rgba(0,180,255,0.8)';
  dsCtx.fillRect(bx, sy+22, bw*cp, 10);
  dsCtx.strokeStyle = 'rgba(0,180,255,0.3)'; dsCtx.lineWidth = 0.8; dsCtx.strokeRect(bx, sy+22, bw, 10);
  dsCtx.font = '11px Courier New'; dsCtx.fillStyle = 'rgba(180,230,255,0.9)';
  dsCtx.fillText('ORE  ' + dsCargo.ore + '/' + dsCargo.maxOre, bx, sy+45);
  const wp = Math.max(0, 1 - dsWarpCooldown/300);
  dsCtx.fillStyle = 'rgba(100,180,255,0.1)'; dsCtx.fillRect(bx, sy+52, bw, 10);
  dsCtx.fillStyle = wp >= 1 ? 'rgba(0,220,255,0.85)' : 'rgba(60,120,200,0.65)';
  dsCtx.fillRect(bx, sy+52, bw*wp, 10);
  dsCtx.strokeStyle = 'rgba(0,180,255,0.25)'; dsCtx.lineWidth = 0.8; dsCtx.strokeRect(bx, sy+52, bw, 10);
  dsCtx.font = '11px Courier New';
  dsCtx.fillStyle = wp >= 1 ? 'rgba(0,220,255,0.95)' : 'rgba(100,160,220,0.7)';
  dsCtx.fillText(wp >= 1 ? 'WARP  READY' : 'WARP  ' + Math.ceil(dsWarpCooldown/60) + 's', bx, sy+75);
  dsCtx.font = '11px Courier New';
  dsCtx.fillStyle = dsMissileCount > 0 ? 'rgba(255,140,0,0.85)' : 'rgba(150,150,150,0.5)';
  dsCtx.fillText('×' + dsMissileCount + ' MSL', bx, sy+92);
  if (dsWarzoneWinner && dsWarzoneWinner === window._dsUsername) {
    dsDrawWinnerCrown(dsShip.x, dsShip.y);
  }
  var _hudBars = dsShipBars + dsCarriedBars;
  if (_hudBars > 0) {
    dsCtx.fillStyle = 'rgba(255,200,50,0.95)'; dsCtx.textAlign = 'right';
    dsCtx.fillText('★ ' + _hudBars.toLocaleString(), sx+sw-10, sy+92);
    dsCtx.textAlign = 'left';
  }
  dsCtx.restore();

  // Key hints -- desktop only
  if (W >= 768) {
    if (!dsNearestStation && !dsScanner.active) {
      dsCtx.save();
      dsCtx.fillStyle = 'rgba(0,8,20,0.75)'; dsCtx.strokeStyle = 'rgba(0,255,180,0.35)'; dsCtx.lineWidth = 1;
      dsCtx.beginPath(); dsCtx.roundRect(10, H-210, 90, 26, 6); dsCtx.fill(); dsCtx.stroke();
      dsCtx.font = 'bold 10px Courier New'; dsCtx.fillStyle = 'rgba(0,255,180,0.75)';
      dsCtx.fillText('[E]  SCAN', 18, H-193); dsCtx.restore();
    }
    if (wp >= 1) {
      const pulse2 = 0.6 + Math.sin(t*2)*0.3;
      dsCtx.save();
      dsCtx.fillStyle = 'rgba(0,8,20,0.75)'; dsCtx.strokeStyle = 'rgba(0,220,255,' + pulse2 + ')'; dsCtx.lineWidth = 1;
      dsCtx.beginPath(); dsCtx.roundRect(10, H-178, 110, 26, 6); dsCtx.fill(); dsCtx.stroke();
      dsCtx.font = 'bold 10px Courier New'; dsCtx.fillStyle = 'rgba(0,220,255,' + pulse2 + ')';
      dsCtx.fillText('[SPACE]  WARP', 18, H-161); dsCtx.restore();
    }
  }
}
// ── MINIMAP ───────────────────────────────────────────────────────────────────
function dsDrawMiniMap(W,H) {
  if (!dsShip) return;
  // Full 5x5 grid minimap top-right
  const mx=W-120, my=10, mw=110, mh=110;
  const cw=mw/5, ch=mh/5;

  dsCtx.fillStyle='rgba(0,10,25,0.85)'; dsCtx.strokeStyle='rgba(0,200,255,0.3)';
  dsCtx.lineWidth=1; dsCtx.fillRect(mx,my,mw,mh); dsCtx.strokeRect(mx,my,mw,mh);

  // Draw zones
  for (let n=5;n>=1;n--) {
    for (let e=1;e<=5;e++) {
      const content=zoneContent({n,e});
      const zx=mx+(e-1)*cw, zy=my+(5-n)*ch;
      const dc=DANGER_COLORS[content.danger]||'#333';
      const isCurrentZone=dsZone.n===n&&dsZone.e===e;

      if (isCurrentZone) {
        dsCtx.fillStyle='rgba(0,220,255,0.2)'; dsCtx.fillRect(zx,zy,cw,ch);
      } else if (content.type==='starforge') {
        dsCtx.fillStyle='rgba(255,200,50,0.15)'; dsCtx.fillRect(zx,zy,cw,ch);
      } else if (content.type==='pirate_hq') {
        dsCtx.fillStyle='rgba(255,80,0,0.12)'; dsCtx.fillRect(zx,zy,cw,ch);
      }

      // Zone label -- mark arena (spacezone) distinctly
      var _isSZ = (n===4||n===5) && (e===1||e===2);
      if (_isSZ) {
        dsCtx.fillStyle='rgba(255,80,0,0.22)'; dsCtx.fillRect(zx,zy,cw,ch);
      }
      dsCtx.font='6px Courier New'; dsCtx.textAlign='center';
      dsCtx.fillStyle=_isSZ ? 'rgba(255,130,0,0.9)' : dc+'99';
      dsCtx.fillText(_isSZ ? 'SZ' : `${n}-${e}`,zx+cw/2,zy+ch/2+2);

      // Zone border
      dsCtx.strokeStyle='rgba(0,100,180,0.25)'; dsCtx.lineWidth=0.5;
      dsCtx.strokeRect(zx,zy,cw,ch);
    }
  }

  // Player dot
  const px=mx+(dsZone.e-1)*cw+cw/2;
  const py=my+(5-dsZone.n)*ch+ch/2;
  dsCtx.beginPath(); dsCtx.arc(px,py,3,0,Math.PI*2);
  dsCtx.fillStyle='#00FFB8'; dsCtx.shadowColor='#00FFB8'; dsCtx.shadowBlur=6;
  dsCtx.fill(); dsCtx.shadowBlur=0;

  // Legend icons for key zones
  dsCtx.font='8px Arial'; dsCtx.textAlign='center';
  // Star forge
  const sfz={n:3,e:3};
  dsCtx.fillText('★',mx+(sfz.e-1)*cw+cw/2,my+(5-sfz.n)*ch+ch/2+3);
  var _st=Date.now();
  dsSalvageCrates.forEach(function(c){
    var zp=c.zone.split('-'); var zn=parseInt(zp[0])||1,ze=parseInt(zp[1])||1;
    var bx=mx+(ze-1)*cw+cw/2, by=my+(5-zn)*ch+ch/2;
    dsCtx.fillStyle='rgba(255,200,0,'+(0.5+Math.sin(_st*0.005)*0.5)+')';
    dsCtx.font='bold 9px Arial'; dsCtx.textAlign='center';
    dsCtx.fillText('X',bx,by+3);
  });
}

// ── WEAPON HUD (same as space-client) ────────────────────────────────────────
function dsDrawWeaponHUD(W,H) {
  if (!dsShip) return;
  const t=Date.now()*0.001;
  const mobile=W<768, btnR=mobile?28:24, mslR=mobile?20:17;
  const bx=W-(mobile?52:44);

  const fireY=H-(mobile?90:75);
  const fp=dsActiveWeapon==='guns'?0.7+Math.sin(t*4)*0.2:0.4;
  dsCtx.beginPath(); dsCtx.arc(bx,fireY,btnR+4,0,Math.PI*2);
  dsCtx.strokeStyle=`rgba(0,255,140,${fp*0.5})`; dsCtx.lineWidth=1; dsCtx.stroke();
  const fg=dsCtx.createRadialGradient(bx,fireY-4,2,bx,fireY,btnR);
  fg.addColorStop(0,`rgba(0,255,140,${fp*0.35})`); fg.addColorStop(1,'rgba(0,80,50,0.7)');
  dsCtx.fillStyle=fg; dsCtx.beginPath(); dsCtx.arc(bx,fireY,btnR,0,Math.PI*2); dsCtx.fill();
  dsCtx.strokeStyle=`rgba(0,255,140,${fp*0.9})`; dsCtx.lineWidth=1.8; dsCtx.stroke();
  dsCtx.strokeStyle=`rgba(0,255,140,${fp})`; dsCtx.lineWidth=1.5;
  dsCtx.beginPath(); dsCtx.moveTo(bx-10,fireY); dsCtx.lineTo(bx+10,fireY); dsCtx.stroke();
  dsCtx.beginPath(); dsCtx.moveTo(bx,fireY-10); dsCtx.lineTo(bx,fireY+10); dsCtx.stroke();
  dsCtx.fillStyle=`rgba(0,255,140,${fp*0.8})`; dsCtx.font=`bold ${mobile?9:8}px Courier New`;
  dsCtx.textAlign='center'; dsCtx.fillText('FIRE',bx,fireY+btnR+12);

  const mslY=fireY-btnR-mslR-(mobile?20:16);
  const mp=dsMissileCount>0?0.6+Math.sin(t*3+1)*0.25:0.2;
  const mc=dsMissileCount>2?[255,140,0]:dsMissileCount>0?[255,60,60]:[100,100,100];
  const mg=dsCtx.createRadialGradient(bx,mslY-3,1,bx,mslY,mslR);
  mg.addColorStop(0,`rgba(${mc[0]},${mc[1]},${mc[2]},${mp*0.4})`); mg.addColorStop(1,'rgba(40,20,0,0.7)');
  dsCtx.fillStyle=mg; dsCtx.beginPath(); dsCtx.arc(bx,mslY,mslR,0,Math.PI*2); dsCtx.fill();
  dsCtx.strokeStyle=`rgba(${mc[0]},${mc[1]},${mc[2]},${mp*0.9})`; dsCtx.lineWidth=1.6; dsCtx.stroke();
  dsCtx.fillStyle=`rgba(${mc[0]},${mc[1]},${mc[2]},${mp})`;
  dsCtx.beginPath(); dsCtx.moveTo(bx,mslY-8); dsCtx.lineTo(bx-5,mslY+5); dsCtx.lineTo(bx+5,mslY+5);
  dsCtx.closePath(); dsCtx.fill();
  dsCtx.fillStyle=`rgba(${mc[0]},${mc[1]},${mc[2]},0.9)`; dsCtx.font=`bold ${mobile?9:8}px Courier New`;
  dsCtx.textAlign='center'; dsCtx.fillText(`×${dsMissileCount}`,bx,mslY+mslR+11);
  dsCtx.textAlign='left';
}

// ── MAIN LOOP ──────────────────────────────────────────────────────────────────
function dsLoop(ts) {
  if (!dsActive) return;
  const dt=Math.min((ts-dsLastTime)/1000,0.05);
  dsLastTime=ts;
  dsUpdate(dt);
  dsDraw();
  requestAnimationFrame(dsLoop);
}

// ── UNDOCK SCREEN ─────────────────────────────────────────────────────────────
function dsShowUndockScreen(onConfirm) {
  const content = zoneContent({ n:1, e:1 });
  const sd = window._shipMenuData || {};
  const activeShip = sd.ships?.find(s => s.id === sd.activeShipId);
  const hasEngine  = activeShip?.slots?.engine;

  const ov = document.createElement('div');
  ov.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.96);
    z-index:600;display:flex;align-items:center;justify-content:center;
    font-family:'Courier New',monospace;`;

  let shipInfo = '<div style="color:rgba(150,200,255,0.35);font-size:12px;">No active ship detected.</div>';
  if (activeShip) {
    const qc = { Common:'#888',Uncommon:'#44CC44',Rare:'#4488FF',Epic:'#AA44FF',Legendary:'#FFB300',Mythic:'#FF2244' }[activeShip.quality]||'#888';
    const dc  = DANGER_COLORS[1];
    shipInfo = `
      <div style="color:${qc};font-size:13px;font-weight:bold;">${activeShip.quality.toUpperCase()} ${activeShip.name}</div>
      <div style="color:rgba(150,200,255,0.45);font-size:11px;margin-top:3px;">${activeShip.classLabel||activeShip.class} · Rank ${activeShip.rank}</div>
      ${!hasEngine?'<div style="color:#FF4444;font-size:11px;margin-top:6px;">⚠ No engine equipped — you will drift and cannot warp</div>':''}
    `;
  }

  ov.innerHTML = `<div style="max-width:500px;text-align:center;padding:28px;">
    <div style="color:rgba(150,200,255,0.4);font-size:11px;letter-spacing:0.2em;margin-bottom:12px;">UNDOCKING FROM STATION ALPHA</div>
    <div style="font-size:20px;font-weight:bold;color:#00AAFF;margin-bottom:6px;letter-spacing:0.1em;">ENTERING DEEP SPACE</div>
    <div style="color:rgba(150,200,255,0.35);font-size:12px;margin-bottom:20px;">Zone 1-1 — ${DANGER_NAMES[1]}</div>
    <div style="background:rgba(0,12,28,0.9);border:1px solid rgba(0,100,200,0.3);border-radius:10px;padding:16px;margin-bottom:20px;">
      ${shipInfo}
    </div>
    <div style="color:rgba(255,180,100,0.7);font-size:11px;line-height:1.8;margin-bottom:22px;">
      Space is dangerous. If your ship is destroyed,<br>you will lose everything on board.<br>
      <span style="color:rgba(150,200,255,0.4);">Make sure you are prepared before leaving.</span>
    </div>
    <div style="display:flex;gap:12px;justify-content:center;">
      <button id="dsUndockConfirm" style="background:linear-gradient(135deg,rgba(0,30,70,0.9),rgba(0,50,100,0.9));
        border:1px solid rgba(0,180,255,0.6);color:#00CCFF;font-family:'Courier New',monospace;
        font-size:13px;padding:12px 28px;border-radius:8px;cursor:pointer;letter-spacing:0.1em;">UNDOCK ✓</button>
      <button id="dsUndockCancel" style="background:rgba(30,0,0,0.8);border:1px solid rgba(255,50,50,0.3);
        color:rgba(255,100,100,0.6);font-family:'Courier New',monospace;font-size:13px;
        padding:12px 28px;border-radius:8px;cursor:pointer;">STAY</button>
    </div>
  </div>`;

  document.body.appendChild(ov);
  ov.querySelector('#dsUndockConfirm').addEventListener('click', () => { ov.remove(); onConfirm(); });
  ov.querySelector('#dsUndockCancel').addEventListener('click',  () => { ov.remove(); });
}

// ── ENTER / EXIT ───────────────────────────────────────────────────────────────
window.enterDeepSpace = () => {
  // Load ship data
  dsShipData   = window._shipMenuData || null;
  dsShipDesign = dsShipData?.ships?.find(s=>s.id===dsShipData?.activeShipId)?.design || null;

  dsShowUndockScreen(() => {
    // ── STEP 1: Immediate blackout — cover everything NOW ──
    const blackout = document.createElement('div');
    blackout.style.cssText = 'position:fixed;inset:0;background:#000;z-index:900;';
    blackout.dataset.dsoverlay = '1';
    document.body.appendChild(blackout);

    // ── STEP 2: Kill earth canvas immediately ──
    window._spaceOverride = true;
    window._playerZone = 'space';
    DSKT()?.emit('player:zone', { zone: 'space' });
    DSKT()?.emit('player:move', { x:0, y:-1000, z:0, rotY:0 });
    // Hide all canvases except deepspace -- store main earth canvas ref
    document.querySelectorAll('canvas').forEach(function(c) {
      if (c === dsCanvas) return;
      c.dataset.dsHidden='1';
      c.dataset.spaceHidden=c.style.display||'show';
      c.style.display='none';
      if (!window._dsHiddenEarthCanvas && c.style.pointerEvents !== 'none') {
        window._dsHiddenEarthCanvas = c;
      }
    });
    // Kill earth audio
    if (window._bgMusic) { window._bgMusicVol=window._bgMusic.volume; window._bgMusic.volume=0; }
    if (window._earthMusicGain) window._earthMusicGain.gain.value=0;
    window._spaceMuted=true;
    if (window._setMusicVolume) window._setMusicVolume(0);
    // Release earth keys
    ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].forEach(function(code) {
      window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
    });

    // ── STEP 3: Hide all earth UI elements ──
    document.querySelectorAll('*').forEach(function(el) {
      if (el===dsCanvas||el===dsAITerminal||el===blackout) return;
      if (el.tagName==='SCRIPT'||el.tagName==='STYLE'||el.tagName==='BODY'||el.tagName==='HTML') return;
      const pos=el.style.position||window.getComputedStyle(el).position;
      if ((pos==='fixed'||pos==='absolute')&&!el.dataset.dsHidden) {
        el.dataset.dsHidden=el.style.display||'show';
        el.dataset.spaceHidden=el.style.display||'show';
        el.style.display='none';
      }
    });

    // ── STEP 4: Warp-in animation then show space ──
    if (!dsAudioCtx) dsInitAudio();
    dsActive = true;
    // Init mobile HUD on deepspace entry
    setTimeout(function(){ if(typeof dsInitMobileHUD==='function') dsInitMobileHUD(); }, 800);
    dsZone = { n:1, e:1 };
    dsCargo = { ore:0, maxOre: (dsShipData?.ships?.[0]?.stats?.cargo||0)*10 || 10 };
    // Check if player is queued for warzone -- show HUD if so
    setTimeout(function() { DSKT()?.emit('game:checkQueue'); }, 800);
    dsMissileCount=25; dsWarpCooldown=0;
    dsBullets=[]; dsMissiles=[]; dsEnemyBullets=[]; dsExplosions=[]; dsOtherBullets=[]; dsOtherMissiles=[];
    dsPlayerDead=false;
    dsSetupZone(dsZone, null);

    // Brief warp flash transition
    const warpFlash = document.createElement('div');
    warpFlash.style.cssText = 'position:fixed;inset:0;background:rgba(100,200,255,0.9);z-index:901;transition:opacity 0.6s;';
    warpFlash.dataset.dsoverlay = '1';
    document.body.appendChild(warpFlash);
    requestAnimationFrame(function() {
      setTimeout(function() { warpFlash.style.opacity='0'; }, 50);
      setTimeout(function() {
        warpFlash.remove(); blackout.remove();
        dsCanvas.style.display='block';
        dsCanvas.style.zIndex='800';
        dsAITerminal.style.display='block';
        dsAITerminal.style.zIndex='801';
        dsAIQueue=[]; dsAIShowing=false;
        dsQueueAI("Undocked. Zone 1-1. Safe travels.");
        setTimeout(function(){dsQueueAI("WASD = move. SPACE = warp. Right-click = missile.");},3000);
        DSKT()?.emit('deepspace:enter', { zone: dsZone });
    DSKT()?.emit('faction:getHostility');
    DSKT()?.emit('faction:getFleets');
    DSKT()?.emit('faction:getMyRep');
        dsLastTime=performance.now();
        requestAnimationFrame(dsLoop);
      }, 700);
    });
  });
};

window.exitDeepSpace = () => {
  dsActive = false;
  dsCanvas.style.display = 'none';
  dsAITerminal.style.display = 'none';
  window._spaceOverride = false;
  window._playerZone = 'station';
  DSKT()?.emit('deepspace:leave');
  DSKT()?.emit('player:zone', { zone: 'station' });

  // Remove any lingering overlay divs
  document.querySelectorAll('[data-dsoverlay]').forEach(function(el){ el.remove(); });
  document.getElementById('dsForgeCancelUI')?.remove();
  dsForgeDocked = null; dsForgeCancelling = false; dsForgeCancelTimer = 0;

  // Restore all hidden elements
  document.querySelectorAll('[data-ds-hidden]').forEach(function(el) {
    var was = el.dataset.dsHidden;
    if (el.tagName === 'CANVAS') {
      el.style.display = '';
    } else if (was !== 'none') {
      el.style.display = (was==='show') ? '' : (was||'');
    }
    delete el.dataset.dsHidden;
  });

  // Restore audio
  if (window._bgMusic) window._bgMusic.volume = window._bgMusicVol || 0.35;
  if (window._earthMusicGain) window._earthMusicGain.gain.value = window._earthMusicVolume || 0.15;
  window._spaceMuted = false;
  window._spaceOverride = false;
  if (window._setMusicVolume) window._setMusicVolume(window._earthMusicVolume || 1);

  // Drop any remaining ore
  if (dsCargo.ore > 0) {
    DSKT()?.emit('deepspace:returnCargo', { ore: dsCargo.ore });
    dsCargo.ore = 0;
  }
};

// ── SOCKET EVENTS ─────────────────────────────────────────────────────────────
function dsSetupSockets() {
  const skt = DSKT(); if (!skt) return;
  skt.on('deepspace:forgeResult', function(data) {
    if (data.bars) DNOTIFY('Star Forge: +' + data.bars + ' bars added.');
  });
  skt.on('deepspace:repUpdate', function(data) {
    if (FACTIONS[data.faction]) FACTIONS[data.faction].rep = data.rep;
  });
  skt.on('faction:announcement', function(data) { /* suppressed -- spam */ });
  skt.on('faction:borderQuip', function(data) { /* suppressed -- spam */ });
  skt.on('faction:minerAttacked', function(data) {
    if (!dsActive) return;
    DNOTIFY('!! ' + data.pilotName + ' intercepted by pirates at ' + data.zone + ' — ' + data.ore + ' ore lost!');
  });
  skt.on('faction:minerReturned', function(data) {
    if (!dsActive) return;
    DNOTIFY('+ ' + data.pilotName + ' returned! +'  + data.bars + ' bars credited.');
  });
  skt.on('faction:leaderboard', function(data) {
    window._factionLeaderboard = data;
  });
  skt.on('faction:fleetData', function(data) {
    window._factionFleets = data;
    // Race condition fix: fleet data may arrive after guards already spawned
    // Retroactively assign real ships to guards that got null (triangle fallback)
    if (dsActive && dsGuards && dsGuards.length > 0) {
      var factionIdx = {};
      dsGuards.forEach(function(g) {
        if (!g.alive || g.ship) return; // skip dead or already assigned
        var fleet = data[g.faction] || [];
        if (!fleet.length) return;
        var idx = factionIdx[g.faction] || 0;
        g.ship = fleet[idx % fleet.length];
        factionIdx[g.faction] = idx + 1;
        // Update shield to match real ship stats if guard is undamaged
        if (g.ship && g.ship.stats && g.shield === g.maxShield) {
          var hp = g.ship.stats.shieldHP || g.maxShield;
          g.shield = hp; g.maxShield = hp;
        }
      });
    }
  });
  skt.on('faction:hostilityData', function(data) {
    // Restore hostility state only -- rep is a separate track
    Object.entries(data).forEach(function(entry) {
      var fid = entry[0], h = entry[1];
      if (FACTIONS[fid]) { FACTIONS[fid].hostility = h; }
      // rep is NOT set here -- restored separately via faction:myRep
    });
  });
  skt.on('faction:myRep', function(data) {
    // Restore rep from server (separate from hostility)
    if (data.factionRep) {
      Object.entries(data.factionRep).forEach(function(e) {
        if (FACTIONS[e[0]]) FACTIONS[e[0]].rep = e[1];
      });
    }
    if (data.activeBounty !== undefined) dsBounty = data.activeBounty;
    if (data.permit) window._dsPermit = data.permit;
  });
  skt.on('faction:bountyUpdate', function(data) {
    dsBounty = data.activeBounty;
    if (data.warDeclared) {
      DNOTIFY('⚔ WAR DECLARED with ' + (FACTIONS[data.faction]?.name||data.faction) + ' — they will hunt you on sight.');
    }
  });
  skt.on('faction:repUpdate', function(data) {
    if (FACTIONS[data.faction]) FACTIONS[data.faction].rep = data.runs;
    DNOTIFY('[' + (FACTIONS[data.faction]?.name||data.faction) + '] Delivery confirmed. Runs: ' + data.runs + '/10');
  });
  skt.on('faction:friendlyUnlocked', function(data) {
    DNOTIFY('★ FRIENDLY STATUS: ' + (FACTIONS[data.faction]?.name||data.faction) + ' — Epic+ parts now available at their shop.');
  });
  skt.on('faction:permitGranted', function(data) {
    window._dsPermit = data;
    DNOTIFY('Mining permit granted for ' + (FACTIONS[data.faction]?.name||data.faction) + ' — valid 24 hours.');
  });
  skt.on('faction:permitDenied', function(data) {
    DNOTIFY('Permit denied: ' + data.msg);
  });
  skt.on('faction:permitStatus', function(data) {
    window._dsPermit = data.valid ? { faction: data.faction, expiresAt: data.expiresAt } : { faction: null, expiresAt: 0 };
  });
  skt.on('faction:warCleared', function(data) {
    if (FACTIONS[data.faction]) FACTIONS[data.faction].hostility = 0;
    var fname = FACTIONS[data.faction]?.name || data.faction;
    DSKT()?.emit('faction:setHostility', { faction: data.faction, hostility: 0 });
    DNOTIFY('⚖ War with ' + fname + ' settled — your ship paid the debt.');
  });
  skt.on('faction:warPending', function(data) {
    var names = (data.factions||[]).map(function(f){ return FACTIONS[f]?.name||f; }).join(', ');
    DNOTIFY('⚠ War debt with ' + names + ' will transfer to your next ship.');
  });
  skt.on('faction:warTransferred', function(data) {
    (data.factions||[]).forEach(function(f) {
      if (FACTIONS[f]) { FACTIONS[f].hostility = 100; }
      DSKT()?.emit('faction:setHostility', { faction: f, hostility: 100 });
    });
    var names = (data.factions||[]).map(function(f){ return FACTIONS[f]?.name||f; }).join(', ');
    DNOTIFY('⚔ WAR INHERITED: ' + names + ' remember what you did.');
  });
  skt.on('faction:warCleared', function(data) {
    // One war cleared by ship destruction -- update local hostility
    if (FACTIONS[data.faction]) FACTIONS[data.faction].hostility = 0;
    var fname = FACTIONS[data.faction]?.name || data.faction;
    DSKT()?.emit('faction:setHostility', { faction: data.faction, hostility: 0 });
    DNOTIFY('⚖ War with ' + fname + ' settled — your ship paid the debt.');
  });
  skt.on('faction:warPending', function(data) {
    // Remaining wars will transfer to next ship
    var names = (data.factions||[]).map(function(f){ return FACTIONS[f]?.name||f; }).join(', ');
    DNOTIFY('⚠ War debt with ' + names + ' will transfer to your next ship.');
  });
  skt.on('faction:warTransferred', function(data) {
    // Wars from previous ship now active on this ship
    (data.factions||[]).forEach(function(f) {
      if (FACTIONS[f]) { FACTIONS[f].hostility = 100; }
      DSKT()?.emit('faction:setHostility', { faction: f, hostility: 100 });
    });
    var names = (data.factions||[]).map(function(f){ return FACTIONS[f]?.name||f; }).join(', ');
    DNOTIFY('⚔ WAR INHERITED: ' + names + ' remember what you did.');
  });
  skt.on('deepspace:resumed', function(data) {
    // Server found our ghost ship — teleport to where we left off
    if (dsShip) { dsShip.x = data.x || DS_CENTER; dsShip.y = data.y || DS_CENTER; }
    dsQueueAI("Session restored. Zone " + data.zone + ".");
    DNOTIFY("Resumed where you left off — Zone " + data.zone);
  });
  skt.on('deepspace:deathNotice', function(data) {
    // Show death notice overlay
    var note = document.createElement('div');
    note.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.95);border:1px solid rgba(255,80,0,0.5);border-radius:12px;padding:24px 32px;z-index:850;font-family:Courier New,monospace;text-align:center;max-width:420px;';
    note.innerHTML = '<div style="color:#FF4400;font-size:14px;font-weight:bold;letter-spacing:0.1em;margin-bottom:10px;">SHIP LOST</div>'
      + '<div style="color:rgba(200,150,100,0.8);font-size:12px;line-height:1.7;margin-bottom:16px;">' + data.msg + '</div>'
      + '<button style="background:rgba(0,20,50,0.8);border:1px solid rgba(0,150,255,0.4);color:#AACCFF;font-family:Courier New,monospace;font-size:11px;padding:8px 20px;border-radius:7px;cursor:pointer;">GOT IT</button>';
    note.querySelector('button').addEventListener('click', function(){ note.remove(); });
    document.body.appendChild(note);
  });
  skt.on('faction:minerStatus', function(data) {
    window._factionMinerStatus = data;
  });
  skt.on('faction:playerMinerStatus', function(data) {
    window._playerMinerStatus = data;
  });
  skt.on('deepspace:lootGranted', function(data) {
    if (data.count) DNOTIFY('+ ' + data.count + ' parts added to your inventory.');
  });

  // PVP
  // -- GAME LISTENERS --
  skt.on('game:state',function(d){if(d.gameType==='race')dsGameRace=d.state!=='idle'?d:null;else dsGameWarzone=d.state!=='idle'?d:null;});
  skt.on('game:spectateData',function(d){if(d.gameType==='race')dsGameWaypoints=d.waypoints||[];dsGamePositions=[];});
  skt.on('game:racePositions',function(d){
    var newPos = d.positions||[];
    // Merge with interpolation state
    newPos.forEach(function(p) {
      var ex = dsGamePositions.find(function(e){return e.username===p.username;});
      p.prevX = ex ? ex.x : p.x;
      p.prevY = ex ? ex.y : p.y;
      p.nextX = p.x; p.nextY = p.y;
      p.x = ex ? ex.x : p.x;
      p.y = ex ? ex.y : p.y;
      p.interpT = 0; p.interpInterval = 0.1;
    });
    dsGamePositions = newPos;
    if (dsGameRace) dsGameRace.elapsed = d.elapsed;
  });
  skt.on('game:warzonePositions',function(d){dsGamePositions=d.positions||[];});
  skt.on('game:gasUpdate',function(d){
    var _wzZones=['5-1','5-2','4-1','4-2'];
    var _curZone = dsZone ? dsZone.n+'-'+dsZone.e : '';
    if (!_wzZones.includes(_curZone)) { dsGameGas=null; return; }
    // Gas center is the shared corner of all 4 warzone zones
    // 4-1=bottom-right corner, 4-2=bottom-left, 5-1=top-right, 5-2=top-left
    // Gas center: if finalZone known, converge toward its local center.
    // Uses zone-relative positioning: each zone is DS_WORLD units apart.
    // n increases north (lower y). e increases east (higher x).
    var _gasCx, _gasCy;
    var _fz = d.finalZone || dsGameFinalZone;
    if (_fz) {
      dsGameFinalZone = _fz;
      var _czN = parseInt(_curZone.split('-')[0]), _czE = parseInt(_curZone.split('-')[1]);
      _gasCx = (_fz.e - _czE) * DS_WORLD + DS_CENTER;
      _gasCy = (_czN - _fz.n) * DS_WORLD + DS_CENTER;
    } else {
      // Fallback: shared inner corner
      _gasCx = (_curZone==='4-1'||_curZone==='5-1') ? DS_WORLD : 0;
      _gasCy = (_curZone==='4-1'||_curZone==='4-2') ? 0 : DS_WORLD;
    }
    dsGameGas={radius:d.gasRadius,cx:_gasCx,cy:_gasCy,damage:d.gasDamage};
    if(dsShip&&dsGameGas.radius>0){var _gdx=dsShip.x-dsGameGas.cx,_gdy=dsShip.y-dsGameGas.cy;
      if(Math.sqrt(_gdx*_gdx+_gdy*_gdy)>dsGameGas.radius)dsHitPlayer(dsGameGas.damage*2);}
  });
  skt.on('game:waypointHit',function(d){if(dsGameRace)dsGameRace.wpIdx=d.wpIdx;DNOTIFY('Waypoint '+d.wpIdx+'! Next: '+(d.next&&d.next.zone||'?')+' -- '+d.remaining+' remaining');});
  skt.on('game:finished',function(d){DNOTIFY('FINISHED! Rank '+d.rank+' of '+d.total+'!');dsGameRace=null;});
  skt.on('game:countdown',function(d){DNOTIFY('['+d.gameType.toUpperCase()+'] Starting in '+d.seconds+'...');});
  skt.on('game:kicked',function(d){DNOTIFY('KICKED: '+d.reason);});
  skt.on('game:warzoneJoined',function(d){if(window._ddsActive)return;DNOTIFY('WARZONE! '+d.players+' fighters. Gas: '+Math.round(d.gasRadius)+'u');dsGameWarzone={active:true};});
  skt.on('game:arenaState',function(d){ if(window._ddsActive)return;
    var _prev = dsWarzoneArena.active;
    dsWarzoneArena.active      = d.active||false;
    dsWarzoneArena.cooldown    = d.cooldown||false;
    dsWarzoneArena.nextStart   = d.nextStart||0;
    dsWarzoneArena.playerCount = d.playerCount||0;
    dsWarzoneArena.portalLocked= d.portalLocked||false;
    if (d.finalZone) dsGameFinalZone = d.finalZone;
    if (!d.active) dsGameGas = null; // no gas outside active game
    if (d.active && !_prev) DNOTIFY('⚔ SPACEZONE ACTIVE -- Portals locked! Circle shrinking!');
    if (!d.active && _prev) DNOTIFY('SPACEZONE ended -- Portals open. Cooldown active.');
  });
  skt.on('game:arenaTransport',function(d){
    if (!dsActive) return; // only if in deepspace
    if (dsZoneTransitioning) return;
    dsZoneTransitioning = true;
    var destN = parseInt(d.zone.split('-')[0]);
    var destE = parseInt(d.zone.split('-')[1]);
    var spawnX = d.x || 2000, spawnY = d.y || 2000;
    dsPlayWarp();
    var flash = document.createElement('div');
    flash.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:550;opacity:0;pointer-events:none;transition:opacity 0.3s;';
    document.body.appendChild(flash);
    requestAnimationFrame(function(){ flash.style.opacity='0.9'; });
    setTimeout(function() {
      dsZone = { n:destN, e:destE };
      dsSetupZone(dsZone, null);
      if (dsShip) { dsShip.x = spawnX; dsShip.y = spawnY; }
      dsCameraX = spawnX; dsCameraY = spawnY;
      dsBullets=[]; dsMissiles=[]; dsEnemyBullets=[];
      DSKT()?.emit('deepspace:zone', { zone: dsZone });
      window._dsSpawnProtection = Date.now() + 5000; // 5s immunity on spawn
      DNOTIFY('⚔ Teleported into SPACEZONE -- ' + d.zone + '. FIGHT! (5s spawn protection)');
      dsQueueAI('Zone ' + destN + '-' + destE + '. Warzone active. Good luck.');
      flash.style.opacity = '0';
      setTimeout(function(){ flash.remove(); dsZoneTransitioning = false; }, 400);
    }, 400);
  });
  skt.on('game:state',function(d){
    if (d.gameType !== 'warzone') return;
    var _wasActive = dsWarzoneArena.active;
    dsWarzoneArena.active      = d.state === 'active';
    dsWarzoneArena.cooldown    = (d.state === 'payout' || d.state === 'idle' || d.state === 'queuing' || d.state === 'cooldown');
    // active: nextStart is the END time (startTime + 4min). nextGameAt is 0 during active.
    // Use d.nextGameAt when available (cooldown), otherwise keep existing value if already set.
    if (d.state === 'active') {
      // Server sends nextStart = startTime + WARZONE_ACTIVE_MS via game:arenaState.
      // game:state does not carry it, so only update if we have it.
      if (d.nextGameAt) dsWarzoneArena.nextStart = d.nextGameAt;
      // else keep whatever game:arenaState set
    } else {
      dsWarzoneArena.nextStart = d.nextGameAt || 0;
    }
    dsWarzoneArena.playerCount = d.playerCount !== undefined ? d.playerCount : (d.count || 0);
    dsWarzoneArena.portalLocked= d.state === 'active';
    if (d.finalZone) dsGameFinalZone = d.finalZone;
    // Clear gas on any non-active state
    if (d.state !== 'active') { dsGameGas = null; dsGameWarzone = null; }
    if (d.state === 'active' && !_wasActive)
      DNOTIFY('⚔ SPACEZONE ACTIVE -- Portals locked! Circle shrinking!');
    if (d.state === 'payout') {
      dsGameGas = null; dsGameRace = null;
      var me = d.results ? d.results.find(function(r){return r.username===window._dsUsername;}) : null;
      if (me && me.payout > 0)
        DNOTIFY('⚔ SPACEZONE PAYOUT: x'+me.mult+' = +'+me.payout.toLocaleString()+' bars!');
    }
    if (d.state === 'idle')    DNOTIFY('SPACEZONE cooldown -- portals open for ' + Math.round((d.nextGameAt-Date.now())/1000) + 's');
    if (d.state === 'queuing') DNOTIFY('SPACEZONE queuing -- enter via portal or station queue.');
  });

  skt.on('deepspace:carriedBars', function(d) {
    // Server confirms how many loot bars we are carrying after a grab
    dsCarriedBars = d.carriedBars || 0;
  });

  skt.on('deepspace:timerDeath', function(d) {
    DNOTIFY('[ELIMINATED] ' + (d.msg || 'Time expired.'));
    setTimeout(function() { dsKillPlayer(); }, 500);
  });

  skt.on('game:warzoneWinner', function(d) {
    dsWarzoneWinner = d.username || null;
    var isWinner = d.username === window._dsUsername;
    if (isWinner) {
      DNOTIFY('[WINNER] SPACEZONE -- You are the last ship standing.');
      // Full screen winner overlay
      var ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:850;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:Courier New,monospace;text-align:center;pointer-events:none;';
      ov.innerHTML = '<div style="color:#FFD700;font-size:3rem;font-weight:bold;letter-spacing:0.3em;text-shadow:0 0 40px rgba(255,215,0,0.8);margin-bottom:12px;">👑 WINNER</div>'
        + '<div style="color:#FFDD44;font-size:1.2rem;letter-spacing:0.2em;margin-bottom:8px;">SPACEZONE CHAMPION</div>'
        + '<div style="color:rgba(255,220,50,0.6);font-size:0.9rem;">Last ship standing</div>';
      document.body.appendChild(ov);
      setTimeout(function(){ ov.remove(); }, 6000);
    } else if (d.username) {
      DNOTIFY('[WINNER] ' + d.username + ' wins the SPACEZONE.');
    }
    // Crown fades after 30 seconds
    setTimeout(function() {
      if (dsWarzoneWinner === d.username) dsWarzoneWinner = null;
    }, 30000);
  });

  skt.on('deepspace:guards', function(data) {
    if (!dsActive) return;
    if (!dsZone || data.zone !== (dsZone.n+'-'+dsZone.e)) return;
    // Merge server guards into dsGuards -- preserve client-side flash/trail
    var fresh = [];
    (data.guards||[]).forEach(function(sg) {
      var existing = dsGuards.find(function(g){ return g.id === sg.id; });
      fresh.push({
        id: sg.id, faction: sg.faction, zone: sg.zone,
        x: existing ? existing.x : sg.x,
        y: existing ? existing.y : sg.y,
        prevX: existing ? existing.x : sg.x,
        prevY: existing ? existing.y : sg.y,
        nextX: sg.x, nextY: sg.y,
        interpT: 0, interpInterval: 0.2,
        angle: existing ? existing.angle : sg.angle,
        targetAngle: sg.angle,
        shield: sg.shield, maxShield: sg.maxShield,
        alive: true, state: sg.state,
        ship: sg.ship, pilotName: sg.pilotName,
        trail: existing ? existing.trail : [],
        flashTimer: existing ? existing.flashTimer : 0,
        warpCooldown: 0,
        _serverControlled: true,
      });
    });
    dsGuards = fresh;
  });

  // Guard bullets and missiles from server -- render and damage player
  skt.on('deepspace:guardBullet', function(data) {
    if (!dsActive) return;
    dsEnemyBullets.push({
      x:data.x, y:data.y, vx:data.vx, vy:data.vy,
      life:75, dmg:data.dmg||250, owner:data.owner, faction:data.faction,
      elemType:data.elemType||null, trail:[],
    });
  });
  skt.on('deepspace:guardMissile', function(data) {
    if (!dsActive) return;
    dsMissiles.push({
      x:data.x, y:data.y, vx:data.vx, vy:data.vy,
      angle: Math.atan2(data.vy, data.vx),
      life:180, isEnemy:true, isPlayer:false,
      dmg:data.dmg||800, faction:data.faction,
      elemType:data.elemType||null, trail:[], smokeTrail:[], age:0,
    });
  });

  skt.on('deepspace:miners', function(data) {
    if (!dsActive) return;
    if (!dsZone || data.zone !== (dsZone.n+'-'+dsZone.e)) return;
    var fresh = {};
    (data.miners||[]).forEach(function(m) {
      var ex = dsNpcMiners[m.socketId] || {};
      fresh[m.socketId] = Object.assign({}, m, {
        x: ex.x !== undefined ? ex.x : m.x,
        y: ex.y !== undefined ? ex.y : m.y,
        prevX: ex.x !== undefined ? ex.x : m.x,
        prevY: ex.y !== undefined ? ex.y : m.y,
        nextX: m.x, nextY: m.y,
        interpT: 0, interpInterval: 0.5,
        angle: ex.angle !== undefined ? ex.angle : m.angle,
        targetAngle: m.angle,
      });
    });
    dsNpcMiners = fresh;
  });
  skt.on('deepspace:npcLootSpawned', function(data) {
    if (!dsActive) return;
    if (!dsZone || data.zone !== (dsZone.n+'-'+dsZone.e)) return;
    dsLootCrates.push({
      x:data.x, y:data.y, bars:data.bars||0, ore:data.ore||0,
      parts:data.parts||[], life:6000,
      serverId:data.id, pilotName:'wreckage', isNpcCrate:true,
    });
    var _info = (data.bars>0 ? data.bars+' bars' : '')
      + (data.parts&&data.parts.length ? ' +'+data.parts.length+' parts' : '');
    DNOTIFY('[WRECKAGE] ' + (_info||'loot') + ' -- scan to find it.');
  });
  skt.on('deepspace:npcLootExpired', function(data) {
    dsLootCrates = dsLootCrates.filter(function(lc){ return lc.serverId !== data.id; });
  });
  skt.on('deepspace:npcLootUpdate', function(data) {
    var lc = dsLootCrates.find(function(c){ return c.serverId === data.id; });
    if (!lc) return;
    lc.bars = data.bars; lc.ore = data.ore; lc.parts = data.parts;
    if (data.removed) {
      dsLootCrates = dsLootCrates.filter(function(c){ return c.serverId !== data.id; });
      if (data.collectorUsername !== window._dsUsername)
        DNOTIFY(data.collectorUsername + ' looted the wreckage.');
    }
  });
  skt.on('deepspace:grabFailed', function(data) {
    DNOTIFY('[LOOT] ' + (data.reason||'Grab failed -- someone else got it first.'));
  });

  skt.on('deepspace:npcDamage', function(data) {
    // Guard
    if (data.isGuard) {
      var g = dsGuards.find(function(g){ return g.id === data.npcId; });
      if (g) {
        g.shield = Math.max(0, data.shield); g.flashTimer = 0.2;
        if (data.dead) {
          g.alive = false;
          dsSpawnExplosion(g.x,g.y,'big');
          setTimeout(function(){ dsSpawnExplosion(g.x,g.y,'huge'); },300);
          dsPlayAlert();
          DNOTIFY('[KILL] '+(g.pilotName||'Guard')+' ('+g.faction+') destroyed.');
        }
      }
      return;
    }
    // Warzone bot
    if (data.isWarzoneBot) {
      var bname = data.npcId.slice(7); // strip wz_bot_
      var bot = dsWarzoneBots[bname];
      if (bot) {
        bot.shield = Math.max(0, data.shield); bot.hitFlash = 0.3;
        if (data.dead) {
          dsSpawnExplosion(bot.x,bot.y,'big');
          setTimeout(function(){ dsSpawnExplosion(bot.x,bot.y,'huge'); },300);
          dsPlayAlert();
          DNOTIFY('[KILL] '+bname+' (pirate) destroyed.');
          delete dsWarzoneBots[bname];
        }
      }
      return;
    }
    // NPC miner
    var npc = dsNpcMiners[data.npcId];
    if (npc) {
      npc.shield = Math.max(0, data.shield); npc.hitFlash = 0.3;
      if (data.shield <= 0) {
        dsSpawnExplosion(npc.x,npc.y,'big');
        setTimeout(function(){ dsSpawnExplosion(npc.x,npc.y,'huge'); },300);
        dsPlayAlert();
        delete dsNpcMiners[data.npcId];
      }
    }
  });

  skt.on('mining:intercepted', function(data) {
    DNOTIFY('☠ ' + data.pilot + ' was intercepted by pirates in zone ' + data.zone + '! Ore lost. Ship destroyed.');
  });

  skt.on('space:players', function(data) {
    var fresh = {};
    data.forEach(function(p) {
      var existing = dsOtherPlayers[p.socketId] || {};
      fresh[p.socketId] = {
        x:p.x, y:p.y, angle:p.angle, username:p.username,
        shield: typeof p.shield==='number' ? p.shield : (existing.shield!==undefined ? existing.shield : 150),
        maxShield: p.maxShield || existing.maxShield || 150,
        design: p.shipDesign || existing.design || null,
        shipClass: p.shipClass || existing.shipClass || 'fighter',
        quality: p.shipQuality || existing.quality || 'Common',
        hitFlash: existing.hitFlash || 0,
        gunsOff: typeof p.gunsOff === 'boolean' ? p.gunsOff : (existing.gunsOff || false),
      };
    });
    dsOtherPlayers = fresh;
  });
  skt.on('deepspace:shieldUpdate', function(data) {
    if (dsOtherPlayers[data.socketId]) {
      dsOtherPlayers[data.socketId].shield = data.shield;
      dsOtherPlayers[data.socketId].maxShield = data.maxShield;
    }
  });
  skt.on('deepspace:pvpIncoming', function(data) {
    // Track last attacker for killedByPlayer on death
    if (data.attackerUsername) window._dsLastAttacker = data.attackerUsername;
    dsHitPlayer(data.dmg || 12);
    if (dsShip) dsShip.hitFlash = 0.5;
    if (dsShip) DSKT()?.emit('deepspace:shieldReport', { shield: dsShip.shield, maxShield: dsShip.maxShield });
  });
  skt.on('deepspace:playerLeftZone', function(data) {
    delete dsOtherPlayers[data.socketId];
  });
  skt.on('deepspace:pvpKill', function(data) {
    delete dsOtherPlayers[data.victimSocketId];
    DNOTIFY('☠️ ' + data.killerUsername + ' destroyed ' + data.victimUsername + '!');
  });
  skt.on('deepspace:bountyCollected', function(data) {
    DNOTIFY('💰 ' + (data.msg || (data.killerUsername + ' collected bounty on ' + data.targetUsername)));
  });

  // Other player shots
  skt.on('deepspace:otherFire', function(data) {
    if (data.type === 'bullet') {
      dsOtherBullets.push({ x:data.x, y:data.y, vx:data.vx, vy:data.vy, life:65, trail:[] });
    } else if (data.type === 'missile') {
      dsOtherMissiles.push({ x:data.x, y:data.y, vx:data.vx, vy:data.vy, angle:data.angle||0, life:180, trail:[], smokeTrail:[], age:0, elemType:data.elemType||null });
    }
  });

  // Salvage
  skt.on('deepspace:salvageSpawned', function(data) {
    dsSalvageCrates = dsSalvageCrates.filter(function(c){ return c.id !== data.id; });
    dsSalvageCrates.push(data);
    // Also push to dsLootCrates so loot panel works for parts
    if (dsZone && data.zone === (dsZone.n+'-'+dsZone.e)) {
      dsLootCrates = dsLootCrates.filter(function(c){ return c.serverId !== data.id; });
      dsLootCrates.push({
        x:data.x, y:data.y,
        bars:data.bars||0, ore:0,
        parts:data.parts||[],
        life:6000, serverId:data.id,
        pilotName:data.victimUsername, isSalvage:true,
      });
    }
    DNOTIFY('[WRECK] ' + data.victimUsername + ' -- '
      + (data.bars?data.bars.toLocaleString()+' bars':'')
      + (data.parts&&data.parts.length?' +'+data.parts.length+' parts':'') + ' -- scan to find it!');
  });
  skt.on('deepspace:salvageCollected', function(data) {
    dsSalvageCrates = dsSalvageCrates.filter(function(c){ return c.id !== data.id; });
    DNOTIFY(data.collectorUsername + ' salvaged ' + data.victimUsername + ' wreck -- ' + data.bars.toLocaleString() + ' bars!');
  });
  skt.on('deepspace:salvageExpired', function(data) {
    dsSalvageCrates = dsSalvageCrates.filter(function(c){ return c.id !== data.id; });
    DNOTIFY('Pirates claimed ' + data.victimUsername + ' salvage in zone ' + data.zone);
  });
  skt.on('deepspace:globalMsg', function(data) { /* suppressed -- NPC spam */ });

  // Hail / chat
  skt.on('deepspace:hailIncoming', function(data) { dsShowIncomingHail(data); });
  skt.on('deepspace:hailDeclined', function(data) { DNOTIFY('Hail declined by ' + data.fromUsername); });
  skt.on('deepspace:chatStart',    function(data) { if (typeof dsOpenChatWindow==='function') dsOpenChatWindow(data.roomId, data.partnerUsername, data.partnerSocketId); });
  skt.on('deepspace:chatMsg',      function(data) { if (typeof dsAppendChatMsg==='function') dsAppendChatMsg(data.fromUsername, data.msg); });
  skt.on('deepspace:ransomReceived', function(data) {
    DNOTIFY('Ransom received: +' + data.bars.toLocaleString() + ' bars from ' + data.fromUsername);
    if (typeof dsAppendChatMsg === 'function') dsAppendChatMsg('RANSOM', '+' + data.bars.toLocaleString() + ' bars received from ' + data.fromUsername);
  });
  skt.on('deepspace:ransomError',    function(data) { DNOTIFY(data.msg); });
  skt.on('deepspace:dockConfirmed',  function()     { DNOTIFY('Ship safely docked.'); });
  skt.on('deepspace:enterSerenityResult', function(d) {
    if (d.denied) {
      DNOTIFY('⚠ ' + (d.reason || 'Access denied.'));
      if (d.destroyShip) {
        // Ship destroyed -- forced back
        setTimeout(function(){ dsFullTeardown(); }, 1500);
      }
      return;
    }
    // Granted -- enter the Sanctum
    DNOTIFY('✦ ENTERING SERENITY...');
    setTimeout(function(){
      if (typeof window.enterSanctum === 'function') {
        dsFullTeardown();
        window.enterSanctum();
      }
    }, 1200);
  });

  skt.on('deepspace:serenityUnlocked', function() {
    window._serenityUnlocked = true;
    DNOTIFY('✦ SERENITY UNLOCKED -- Zone 5-5 portal now accessible.');
  });
  skt.on('deepspace:leviathanKilled', function() {
    DNOTIFY('☠ THE LEVIATHAN HAS BEEN SLAIN -- Serenity portal unlocking...');
    setTimeout(function(){ window.location.reload(); }, 3000);
  });

  // ── LEVIATHAN ─────────────────────────────────────────────────────────────
  skt.on('deepspace:leviathan',function(d){
    if(!dsActive) return;
    if(!d.alive){dsLeviathan=null;return;}
    if(!dsLeviathan){
      var segs=[];for(var i=0;i<LEV_SEG_COUNT;i++) segs.push({x:d.x+i*LEV_SEG_SPACING,y:d.y});
      dsLeviathan={x:d.x,y:d.y,angle:d.angle,shield:d.shield,maxShield:d.maxShield,
        prevX:d.x,prevY:d.y,nextX:d.x,nextY:d.y,interpT:0,interpInterval:0.2,
        segments:segs,anglerPulse:0};
    } else {
      dsLeviathan.prevX=dsLeviathan.x;dsLeviathan.prevY=dsLeviathan.y;
      dsLeviathan.nextX=d.x;dsLeviathan.nextY=d.y;dsLeviathan.interpT=0;
      dsLeviathan.shield=d.shield;dsLeviathan.maxShield=d.maxShield;dsLeviathan.angle=d.angle;
    }
  });
  skt.on('deepspace:leviathanDamage',function(d){
    if(dsLeviathan){dsLeviathan.shield=d.shield;dsLeviathan.maxShield=d.maxShield;}
    if(d.dead){dsLeviathan=null;dsSpawnExplosion(2000,2000,'huge');dsPlayAlert();DNOTIFY('[KILL] THE LEVIATHAN has been slain!');}
  });

  // ── EFFECT ENGINE VISUALS ──────────────────────────────────────────────
  // Active visual effects on entities { targetId -> { type, expiresAt, color } }
  window._dsActiveEffects = window._dsActiveEffects || {};

  skt.on('deepspace:effectApplied', function(d) {
    if (!dsActive) return;
    window._dsActiveEffects[d.targetId] = window._dsActiveEffects[d.targetId] || {};
    window._dsActiveEffects[d.targetId][d.type] = {
      expiresAt: Date.now() + d.duration,
      color: d.color || '#FF4400',
      x: d.x, y: d.y, r: d.r,
    };
    // AOE effects -- draw explosion ring
    if (d.x !== undefined && d.r !== undefined) {
      dsSpawnExplosion(d.x, d.y, 'big');
    }
    var _effectNames = {
      'Burning': '🔥 BURNING', 'Frozen': '❄ FROZEN', 'Slowed': '🌀 SLOWED',
      'EMPBurst': '⚡ EMP BURST', 'VoidAnchor': '🌑 VOID ANCHOR',
      'Supernova': '💥 SUPERNOVA', 'WarpShock': '⚡ WARP SHOCK',
    };
    if (_effectNames[d.type]) DNOTIFY('[EFFECT] ' + (_effectNames[d.type]||d.type));
  });

  skt.on('deepspace:effectExpired', function(d) {
    if (window._dsActiveEffects && window._dsActiveEffects[d.targetId]) {
      delete window._dsActiveEffects[d.targetId][d.type];
    }
  });

  skt.on('deepspace:selfEffect', function(d) {
    if (!dsShip) return;
    if (d.type === 'SpeedBoost') {
      var _origEngine = dsShip.engine;
      dsShip.engine = (_origEngine||1) * (1 + (d.value||0.05));
      DNOTIFY('⚡ SPEED BOOST active (' + (d.duration/1000).toFixed(0) + 's)');
      setTimeout(function(){ if(dsShip) dsShip.engine = _origEngine; }, d.duration||3000);
    } else if (d.type === 'CritReady') {
      window._dsCritReady = true;
      DNOTIFY('💀 CRITICAL SHOT ready!');
      setTimeout(function(){ window._dsCritReady = false; }, d.duration||10000);
    } else if (d.type === 'WarpCooldownReduce') {
      dsWarpCooldown = Math.max(0, dsWarpCooldown - (d.value||120));
    } else if (d.type === 'Untargetable') {
      window._dsUntargetable = Date.now() + (d.duration||1500);
      DNOTIFY('👻 UNTARGETABLE for ' + (d.duration/1000).toFixed(1) + 's');
    } else if (d.type === 'Overcharge') {
      window._dsOvercharge = { expiresAt: Date.now() + d.duration };
      DNOTIFY('⚡⚡ OVERCHARGE ACTIVE -- stats doubled for ' + (d.duration/1000).toFixed(0) + 's!');
      setTimeout(function(){ window._dsOvercharge = null; DNOTIFY('OVERCHARGE expired.'); }, d.duration);
    } else if (d.type === 'PhaseShift') {
      window._dsPhaseShift = { expiresAt: Date.now() + d.duration };
      DNOTIFY('👻 PHASE SHIFT -- ghost mode for ' + (d.duration/1000).toFixed(1) + 's!');
      setTimeout(function(){ window._dsPhaseShift = null; DNOTIFY('Phase shift ended.'); }, d.duration);
    } else if (d.type === 'SingularityShot') {
      window._dsSingularityShot = true;
      DNOTIFY('☢ SINGULARITY SHOT ready -- next bullet pierces all!');
      setTimeout(function(){ window._dsSingularityShot = false; }, d.duration||5000);
    } else if (d.type === 'EchoStrike') {
      window._dsEchoStrike = { expiresAt: Date.now() + d.duration };
      DNOTIFY('🔄 ECHO STRIKE active -- shots will repeat!');
      setTimeout(function(){ window._dsEchoStrike = null; }, d.duration||8000);
    }
  });

  skt.on('deepspace:selfDot', function(d) {
    if (!dsShip || dsPlayerDead) return;
    dsHitPlayer(d.dmg||100);
    if (d.type === 'Burning' && dsShip) {
      dsShip.hitFlash = 0.3;
      // Orange tint for burning
      window._dsBurning = Date.now() + 200;
    }
  });

  skt.on('deepspace:playerPhaseShift', function(d) {
    // Hide or show another player during phase shift
    if (dsOtherPlayers[d.socketId]) {
      dsOtherPlayers[d.socketId]._phased = d.active;
    }
  });

  // ── WARZONE QUEUE TRACKING ───────────────────────────────────────────────
  window._dsWarzoneQueued = false;

  skt.on('game:joinedQueue', function(d) {
    if (d.gameType !== 'warzone') return;
    window._dsWarzoneQueued = true;
    dsShowQueueHUD();
  });
  skt.on('game:queueStatus', function(d) {
    if (!dsActive) return;
    if (d.isQueued && !window._dsWarzoneQueued) {
      window._dsWarzoneQueued = true;
      // Store timing data for accurate estimate
      window._wzEndTime = d.warzoneEndTime || 0;
      window._wzNextGameAt = d.nextGameAt || 0;
      window._wzState = d.warzoneState || 'idle';
      dsShowQueueHUD();
    }
  });
  
  skt.on('game:leftQueue', function(d) {
    if (d.gameType !== 'warzone') return;
    window._dsWarzoneQueued = false;
    dsHideQueueHUD();
  });
  skt.on('game:arenaTransport', function() {
    // Teleported into arena -- queue HUD no longer needed
    window._dsWarzoneQueued = false;
    dsHideQueueHUD();
  });

  function dsShowQueueHUD() {
    dsHideQueueHUD();
    var hud = document.createElement('div');
    hud.id = 'dsQueueHUD';
    hud.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);'
      + 'background:rgba(0,8,22,0.92);border:1px solid rgba(255,140,0,0.5);border-radius:12px;'
      + 'padding:14px 24px;z-index:820;font-family:Courier New,monospace;text-align:center;'
      + 'pointer-events:none;min-width:280px;';
    hud.innerHTML = '<div style="color:#FF8844;font-size:11px;letter-spacing:0.15em;font-weight:bold;margin-bottom:6px;">⚔ WARZONE QUEUED</div>'
      + '<div style="color:#FFCC44;font-size:13px;font-weight:bold;margin-bottom:4px;" id="dsQueueInstruct">UNDOCK AND FLY TO ZONE 4-1</div>'
      + '<div style="color:rgba(150,200,255,0.6);font-size:10px;" id="dsQueueTimer">Loading...</div>';
    document.body.appendChild(hud);
    // Update timer every second
    if (window._dsQueueTimerInt) clearInterval(window._dsQueueTimerInt);
    window._dsQueueTimerInt = setInterval(function() {
      if (!window._dsWarzoneQueued) { clearInterval(window._dsQueueTimerInt); return; }
      var el = document.getElementById('dsQueueTimer');
      var inst = document.getElementById('dsQueueInstruct');
      if (!el) return;
      var COOLDOWN_MS = 3 * 60 * 1000; // 3 min cooldown matches server
      if (dsWarzoneArena.active) {
        // Player is IN the warzone area -- show battle time remaining
        var _inArena = dsZone && ['4-1','4-2','5-1','5-2'].includes(dsZone.n+'-'+dsZone.e);
        if (_inArena) {
          if (inst) inst.textContent = 'BATTLE IN PROGRESS';
          var rem = Math.max(0, Math.round((dsWarzoneArena.nextStart - Date.now())/1000));
          el.textContent = 'TIME REMAINING: ' + Math.floor(rem/60) + ':' + ('0'+(rem%60)).slice(-2);
        } else {
          // Queued but waiting for NEXT game -- estimate: game remaining + cooldown
          var gameRem = Math.max(0, (dsWarzoneArena.nextStart - Date.now()));
          var totalWait = Math.round((gameRem + COOLDOWN_MS) / 1000);
          if (inst) inst.textContent = 'WAITING FOR NEXT BATTLE';
          el.textContent = 'EST. WAIT: ~' + Math.floor(totalWait/60) + ':' + ('0'+(totalWait%60)).slice(-2);
        }
      } else {
        if (inst) inst.textContent = 'UNDOCK AND FLY TO ZONE 4-1, 4-2, 5-1, OR 5-2';
        var secs = Math.max(0, Math.round((dsWarzoneArena.nextStart - Date.now())/1000));
        el.textContent = secs > 0
          ? 'NEXT BATTLE IN ' + Math.floor(secs/60) + ':' + ('0'+(secs%60)).slice(-2)
          : 'BATTLE STARTING SOON...';
      }
    }, 1000);
  }
  function dsHideQueueHUD() {
    var el = document.getElementById('dsQueueHUD');
    if (el) el.remove();
    if (window._dsQueueTimerInt) { clearInterval(window._dsQueueTimerInt); window._dsQueueTimerInt = null; }
  }

  skt.on('warzone:botPositions', function(data) {
    if (!dsActive || !dsZone) return;
    var curZone = dsZone.n + '-' + dsZone.e;
    var fresh = {};
    (data.bots || []).forEach(function(b) {
      if (b.zone !== curZone) return; // only show bots in same zone
      var existing = dsWarzoneBots[b.username] || {};
      fresh[b.username] = {
        x: existing.x !== undefined ? existing.x : b.x,
        y: existing.y !== undefined ? existing.y : b.y,
        prevX: existing.x !== undefined ? existing.x : b.x,
        prevY: existing.y !== undefined ? existing.y : b.y,
        nextX: b.x, nextY: b.y,
        interpT: 0, interpInterval: 0.1,
        angle: existing.angle !== undefined ? existing.angle : b.angle,
        username: b.username,
        shield: b.shield, maxShield: b.maxShield,
        design: b.shipDesign || existing.design || null,
        shipClass: b.shipClass || 'fighter',
        quality: b.shipQuality || 'Common',
        hitFlash: existing.hitFlash || 0,
        gunsOff: false,
        isBot: true,
      };
    });
    dsWarzoneBots = fresh;
  });
  skt.on('deepspace:mediaState', function(data) {
    window._dsPartnerCamActive = data.cam;
    window._dsPartnerMicActive = data.mic;
    var camBtn = document.getElementById('dsChatCam');
    var micBtn = document.getElementById('dsChatVoice');
    if (camBtn) {
      if (data.cam && !_dsCamActive) {
        camBtn.style.animation = 'dsCamBlink 0.8s ease-in-out infinite';
        dsAppendChatMsg('SYSTEM', 'Partner camera is on -- click CAM to share yours!');
      } else {
        camBtn.style.animation = '';
      }
    }
    if (micBtn) {
      if (data.mic && !_dsVoiceActive) {
        micBtn.style.animation = 'dsCamBlink 0.8s ease-in-out infinite';
        dsAppendChatMsg('SYSTEM', 'Partner mic is on -- click MIC to join voice!');
      } else {
        micBtn.style.animation = '';
      }
    }
  });
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function dsMulberry32(seed) {
  return function() {
    seed|=0; seed=seed+0x6D2B79F5|0;
    let t=Math.imul(seed^seed>>>15,1|seed);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return((t^t>>>14)>>>0)/4294967296;
  };
}

// ── INIT ──────────────────────────────────────────────────────────────────────
function dsInit() {
  dsSetupCanvas();
  const poll=setInterval(()=>{ if(DSKT()){dsSetupSockets();clearInterval(poll);} },1000);
}

(function waitForDS() {
  if (window._mineScene && window._mineCamera) dsInit();
  else setTimeout(waitForDS, 200);
})();



// ============================================================
// -- OTHER PLAYER DRAW ---------------------------------------
// ============================================================
// ── WINNER CROWN (pure canvas, no text/emoji) ─────────────────────────────
function dsDrawWinnerCrown(cx, cy) {
  var t     = Date.now() * 0.002;
  var pulse = 0.6 + Math.sin(t * 3) * 0.4;
  dsCtx.save();
  dsCtx.translate(cx, cy - 54);
  dsCtx.shadowColor = 'rgba(255,210,50,0.7)';
  dsCtx.shadowBlur  = 14;
  // Crown outline: base + 3 peaks
  dsCtx.beginPath();
  dsCtx.moveTo(-13,  8);
  dsCtx.lineTo(-13, -1);
  dsCtx.lineTo( -7,-13);
  dsCtx.lineTo( -2, -2);
  dsCtx.lineTo(  0,-17);
  dsCtx.lineTo(  2, -2);
  dsCtx.lineTo(  7,-13);
  dsCtx.lineTo( 13, -1);
  dsCtx.lineTo( 13,  8);
  dsCtx.closePath();
  dsCtx.fillStyle   = 'rgba(255,185,0,' + (0.45 + pulse * 0.25).toFixed(2) + ')';
  dsCtx.strokeStyle = 'rgba(255,195,0,' + pulse.toFixed(2) + ')';
  dsCtx.lineWidth   = 2;
  dsCtx.fill();
  dsCtx.stroke();
  // Gem dots at each peak tip
  var gems = [[0,-17],[-7,-13],[7,-13]];
  gems.forEach(function(pt) {
    dsCtx.beginPath();
    dsCtx.arc(pt[0], pt[1], 2.2, 0, Math.PI * 2);
    dsCtx.fillStyle  = 'rgba(255,240,120,0.95)';
    dsCtx.shadowBlur = 6;
    dsCtx.fill();
  });
  dsCtx.shadowBlur = 0;
  dsCtx.restore();
}

function dsDrawOtherPlayer(op, sid) {
  if (!op || !dsShip) return;
  var dx = op.x - dsShip.x, dy = op.y - dsShip.y;
  if (Math.sqrt(dx*dx+dy*dy) > DS_LIGHT*2) return;
  if (op.hitFlash > 0) op.hitFlash = Math.max(0, op.hitFlash - 0.04);
  var flash = op.hitFlash > 0;
  // Scanner hit glow -- red ring if scanner active and player in range
  var _scanHit = dsScanner.active && dsScanner.targets.some(function(t){ return t.socketId === sid; });
  dsCtx.save();
  dsCtx.translate(op.x, op.y);
  dsCtx.rotate(op.angle + Math.PI/2);
  if (flash) { dsCtx.shadowColor='#FFFFFF'; dsCtx.shadowBlur=20; }
  if (_scanHit && !flash) { dsCtx.shadowColor='#FF2200'; dsCtx.shadowBlur=30; }
  var rendered = false;
  var qColors = { Common:'#AAAAAA',Uncommon:'#44CC44',Rare:'#4488FF',Epic:'#AA44FF',Legendary:'#FFB300',Mythic:'#FF2244' };
  var opQCol = qColors[op.quality] || '#4488CC';
  if (!flash && op.design && typeof window.drawShipBody !== 'undefined') {
    try {
      dsCtx.scale(0.5, 0.5);
      if (op.design.body === 'ufo') {
        window.drawUFOBody(dsCtx, op.design, 0.1, opQCol, 4, 0);
      } else {
        dsCtx.rotate(-Math.PI/2);
        window.drawEngineGlow(dsCtx, op.design.engines, op.shipClass||'fighter', 0);
        window.drawShipBody(dsCtx, op.design, op.shipClass||'fighter', 0.1, opQCol, 4);
      }
      rendered = true;
    } catch(e) { rendered = false; }
  }
  if (!rendered) {
    var s = 14;
    dsCtx.fillStyle = flash ? '#FFFFFF' : opQCol;
    dsCtx.shadowColor = flash ? '#FFFFFF' : opQCol;
    dsCtx.shadowBlur = flash ? 20 : 10;
    dsCtx.beginPath();
    dsCtx.moveTo(0,-s*1.5); dsCtx.lineTo(s*0.9,s*1.0);
    dsCtx.lineTo(s*0.4,s*0.5); dsCtx.lineTo(0,s*0.8);
    dsCtx.lineTo(-s*0.4,s*0.5); dsCtx.lineTo(-s*0.9,s*1.0);
    dsCtx.closePath(); dsCtx.fill();
  }
  dsCtx.shadowBlur = 0;
  if (op.shield > 0) {
    dsCtx.beginPath(); dsCtx.arc(0,0,rendered?38:14*1.8,0,Math.PI*2);
    dsCtx.strokeStyle='rgba(68,136,255,0.4)'; dsCtx.lineWidth=2; dsCtx.stroke();
  }
  if (_scanHit) {
    var _sp = 0.5 + Math.sin(Date.now()*0.008)*0.4;
    dsCtx.beginPath(); dsCtx.arc(0,0,(rendered?38:14*1.8)+8,0,Math.PI*2);
    dsCtx.strokeStyle='rgba(255,30,0,'+_sp+')'; dsCtx.lineWidth=2.5; dsCtx.stroke();
  }
  // White flag if guns-off -- draw above ship in world space
  if (op.gunsOff) {
    dsCtx.save();
    var _ft = Date.now()*0.002;
    var _fa = 0.7 + Math.sin(_ft*3)*0.3;
    // Flagpole
    dsCtx.strokeStyle='rgba(220,220,220,'+_fa+')';
    dsCtx.lineWidth=2;
    dsCtx.beginPath(); dsCtx.moveTo(op.x, op.y-28); dsCtx.lineTo(op.x, op.y-50);
    dsCtx.stroke();
    // Flag body
    dsCtx.fillStyle='rgba(255,255,255,'+_fa+')';
    dsCtx.beginPath();
    dsCtx.moveTo(op.x, op.y-50);
    dsCtx.lineTo(op.x+14, op.y-44);
    dsCtx.lineTo(op.x, op.y-38);
    dsCtx.closePath(); dsCtx.fill();
    // PEACE text below name
    dsCtx.fillStyle='rgba(180,255,180,'+_fa+')';
    dsCtx.font='8px Courier New'; dsCtx.textAlign='center';
    dsCtx.fillText('PASSIVE', op.x, op.y-20);
    dsCtx.restore();
  }
  dsCtx.restore();
  // Name + shield bar anchored to world coords (inside outer translate)
  if (Math.sqrt(dx*dx+dy*dy) < DS_LIGHT*1.5) {
    dsCtx.save();
    dsCtx.font='bold 10px Courier New'; dsCtx.textAlign='center';
    // Bots show red/orange names so players can distinguish enemies from allies
    var _nameCol = op.isBot ? '#FF6633' : '#88CCFF';
    var _shadowCol = op.isBot ? '#AA2200' : '#0044AA';
    dsCtx.fillStyle=_nameCol; dsCtx.shadowColor=_shadowCol; dsCtx.shadowBlur=4;
    dsCtx.fillText(op.username, op.x, op.y-30);
    if (dsWarzoneWinner && op.username === dsWarzoneWinner) {
      dsDrawWinnerCrown(op.x, op.y);
    }
    var bw=36, bh=3;
    dsCtx.fillStyle='rgba(0,0,0,0.5)'; dsCtx.fillRect(op.x-bw/2,op.y-24,bw,bh);
    dsCtx.fillStyle='#44AAFF';
    dsCtx.fillRect(op.x-bw/2,op.y-24,bw*(op.shield/Math.max(1,op.maxShield)),bh);
    // White flag above name if passive
    if (op.gunsOff) {
      var _fa=0.7+Math.sin(Date.now()*0.006)*0.3;
      dsCtx.strokeStyle='rgba(200,200,200,'+_fa+')'; dsCtx.lineWidth=1.5;
      dsCtx.beginPath(); dsCtx.moveTo(op.x-8,op.y-36); dsCtx.lineTo(op.x-8,op.y-52); dsCtx.stroke();
      dsCtx.fillStyle='rgba(255,255,255,'+_fa+')';
      dsCtx.beginPath(); dsCtx.moveTo(op.x-8,op.y-52); dsCtx.lineTo(op.x+6,op.y-47); dsCtx.lineTo(op.x-8,op.y-42); dsCtx.closePath(); dsCtx.fill();
      dsCtx.fillStyle='rgba(100,255,150,'+_fa+')'; dsCtx.font='7px Courier New'; dsCtx.textAlign='center';
      dsCtx.fillText('PASSIVE',op.x,op.y-36);
    }
    dsCtx.restore();
  }
}

// Call in dsDraw -- hook into other players draw call
(function() {
  var _origDraw = window.dsDraw;
  // dsDrawOtherPlayer is called directly from dsDraw via dsOtherPlayers loop
  // Make sure dsOtherPlayers entries get drawn
  var _dsDrawOtherPlayersHook = function() {
    Object.values(dsOtherPlayers).forEach(function(op) { dsDrawOtherPlayer(op); });
  };
  window._dsDrawOtherPlayersHook = _dsDrawOtherPlayersHook;
})();

// ============================================================
// -- NEARBY MENU ---------------------------------------------
// ============================================================
var _nearbyMenuEl   = null;
var _nearbyMenuMin  = false;
var _nearbyMenuTimer = 0;

if (!document.getElementById('dsCamBlinkStyle')) {
  var _bs = document.createElement('style');
  _bs.id = 'dsCamBlinkStyle';
  _bs.textContent = '@keyframes dsCamBlink { 0%,100%{opacity:1;box-shadow:0 0 8px #FFAA44;} 50%{opacity:0.3;box-shadow:none;} } @keyframes dsHailBlink { 0%,100%{border-color:#00FFB8;box-shadow:0 0 20px rgba(0,255,180,0.3);} 50%{border-color:#FFFFFF;box-shadow:0 0 30px rgba(255,255,255,0.5);} }';
  document.head.appendChild(_bs);
}
function dsInitNearbyMenu() {
  if (_nearbyMenuEl) return;
  var el = document.createElement('div');
  el.id = 'dsNearbyMenu';
  var _isMobNearby = window.innerWidth < 900;
  el.style.cssText = 'position:fixed;top:' + (_isMobNearby ? '130px' : '10px') + ';left:16px;min-width:190px;max-width:230px;'
    + 'background:rgba(0,8,22,0.88);border:1px solid rgba(0,200,255,0.25);border-radius:10px;'
    + 'font-family:Courier New,monospace;font-size:11px;z-index:820;'
    + 'backdrop-filter:blur(8px);overflow:hidden;user-select:none;';
  el.innerHTML = '<div id="dsNearbyHdr" style="display:flex;align-items:center;justify-content:space-between;'
    + 'padding:7px 10px 5px;border-bottom:1px solid rgba(0,200,255,0.12);cursor:grab;">'
    + '<span style="color:rgba(0,200,255,0.7);font-size:9px;letter-spacing:0.18em;font-weight:bold;">RADAR  NEARBY</span>'
    + '<span id="dsNearbyMin" style="color:rgba(0,200,255,0.5);font-size:12px;padding:0 2px;">-</span>'
    + '</div>'
    + '<div id="dsNearbyBody" style="max-height:240px;overflow-y:auto;padding:4px 0;"></div>';
  document.body.appendChild(el);
  _nearbyMenuEl = el;
  // Minimize toggle
  document.getElementById('dsNearbyMin').addEventListener('click', function(e) {
    e.stopPropagation();
    _nearbyMenuMin = !_nearbyMenuMin;
    document.getElementById('dsNearbyBody').style.display = _nearbyMenuMin ? 'none' : 'block';
    document.getElementById('dsNearbyMin').textContent = _nearbyMenuMin ? '+' : '-';
  });
  // Draggable header
  (function() {
    var hdr = document.getElementById('dsNearbyHdr');
    var dragStartX, dragStartY, elStartTop, elStartLeft, dragging = false;
    function onDown(cx, cy) {
      dragging = true;
      dragStartX = cx; dragStartY = cy;
      var rect = el.getBoundingClientRect();
      elStartTop = rect.top; elStartLeft = rect.left;
      hdr.style.cursor = 'grabbing';
    }
    function onMove(cx, cy) {
      if (!dragging) return;
      var dx = cx - dragStartX, dy = cy - dragStartY;
      var mw = el.offsetWidth || 200, mh = el.offsetHeight || 60;
      var newTop  = Math.max(0, Math.min(window.innerHeight - mh, elStartTop + dy));
      var newLeft = Math.max(0, Math.min(window.innerWidth  - mw, elStartLeft + dx));
      el.style.top = newTop + 'px'; el.style.left = newLeft + 'px';
    }
    function onUp() { dragging = false; hdr.style.cursor = 'grab'; }
    hdr.addEventListener('mousedown',  function(e){ if(e.target===document.getElementById('dsNearbyMin')) return; onDown(e.clientX, e.clientY); e.preventDefault(); e.stopPropagation(); });
    window.addEventListener('mousemove', function(e){ onMove(e.clientX, e.clientY); });
    window.addEventListener('mouseup',   onUp);
    hdr.addEventListener('touchstart',  function(e){ if(e.target===document.getElementById('dsNearbyMin')) return; var t=e.touches[0]; onDown(t.clientX, t.clientY); }, {passive:true});
    hdr.addEventListener('touchmove',   function(e){ var t=e.touches[0]; onMove(t.clientX, t.clientY); }, {passive:true});
    hdr.addEventListener('touchend',    onUp, {passive:true});
  })();
}

function dsUpdateNearbyMenu(dt) {
  if (!dsActive || !dsShip) return;
  _nearbyMenuTimer = (_nearbyMenuTimer||0) + dt;
  if (_nearbyMenuTimer < 0.5) return;
  _nearbyMenuTimer = 0;
  if (!_nearbyMenuEl) dsInitNearbyMenu();
  var body = document.getElementById('dsNearbyBody');
  if (!body || _nearbyMenuMin) return;

  var PROX = 600;
  var rows = [];
  var qColors = { Common:'#AAAAAA',Uncommon:'#44CC44',Rare:'#4488FF',Epic:'#AA44FF',Legendary:'#FFB300',Mythic:'#FF2244' };

  Object.entries(dsOtherPlayers).forEach(function(entry) {
    var sid = entry[0], op = entry[1];
    var dx = op.x-dsShip.x, dy = op.y-dsShip.y, dist = Math.sqrt(dx*dx+dy*dy);
    if (dist < PROX) {
      var shieldPct = Math.round((op.shield/Math.max(1,op.maxShield))*100);
      var qc = qColors[op.quality]||'#AAAAAA';
      rows.push({
        html: '<div style="padding:7px 10px;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;" data-sid="' + sid + '">'
          + '<div style="color:#88CCFF;font-size:11px;font-weight:bold;">' + op.username + '</div>'
          + '<div style="color:' + qc + ';font-size:10px;margin-top:2px;">'
          + (op.quality||'Common') + ' ' + (op.shipClass||'fighter')
          + '  |  ' + Math.round(dist) + 'u  |  shield ' + shieldPct + '%</div>'
          + '</div>',
        sid: sid,
        dist: dist,
      });
    }
  });

  dsScanner.targets.forEach(function(tgt) {
    if (tgt.type === 'player') return;
    var col = tgt.type==='enemy'?'#FF6060':tgt.type==='loot'?'#FFD040':'#44AAFF';
    // Loot crates within 200u get a clickable INSPECT row
    if (tgt.type === 'loot' && tgt.dist <= 200) {
      // Find the actual crate object
      var _lc = dsLootCrates.find(function(lc){
        var dx=lc.x-tgt.x, dy=lc.y-tgt.y; return Math.sqrt(dx*dx+dy*dy)<20;
      });
      var _parts = (_lc&&_lc.parts&&_lc.parts.length) ? _lc.parts.length+' part'+(_lc.parts.length>1?'s':'') : '';
      var _bars  = (_lc&&_lc.bars&&_lc.bars>0) ? _lc.bars+' bars' : '';
      var _contents = [_parts,_bars].filter(Boolean).join(', ') || 'ore only';
      rows.push({
        html: '<div style="padding:7px 10px;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;" data-crate-idx="'+dsLootCrates.indexOf(_lc)+'">'
          + '<div style="color:#FFD040;font-size:11px;font-weight:bold;">⧡ WRECKAGE</div>'
          + '<div style="color:rgba(255,200,50,0.6);font-size:10px;margin-top:2px;">'+_contents+'  |  '+tgt.dist+'u  — tap to inspect</div>'
          + '</div>',
        sid: null, crateRef: _lc,
      });
    } else {
      rows.push({
        html: '<div style="padding:5px 10px;border-bottom:1px solid rgba(255,255,255,0.04);">'
          + '<div style="color:' + col + ';font-size:10px;">'
          + tgt.label + '  |  ' + tgt.dist + 'u'
          + (tgt.hp !== undefined ? '  |  HP ' + tgt.hp + '%' : '')
          + '</div></div>',
        sid: null,
      });
    }
  });

  if (rows.length === 0) {
    body.innerHTML = '<div style="color:rgba(255,255,255,0.2);font-size:10px;padding:10px;text-align:center;">sector clear</div>';
  } else {
    // Sort player rows by distance
    rows.sort(function(a,b){ return (a.dist||0)-(b.dist||0); });
    body.innerHTML = rows.map(function(r){ return r.html; }).join('');
    body.querySelectorAll('[data-sid]').forEach(function(el) {
      el.addEventListener('mouseover', function(){ el.style.background='rgba(0,150,255,0.12)'; });
      el.addEventListener('mouseout',  function(){ el.style.background=''; });
      el.addEventListener('click', function() { dsOpenTargetOptions(el.dataset.sid); });
      el.addEventListener('touchend', function(e) { e.preventDefault(); dsOpenTargetOptions(el.dataset.sid); }, {passive:false});
    });
    // Crate rows
    body.querySelectorAll('[data-crate-idx]').forEach(function(el) {
      var idx = parseInt(el.dataset.crateIdx);
      el.addEventListener('mouseover', function(){ el.style.background='rgba(255,200,0,0.08)'; });
      el.addEventListener('mouseout',  function(){ el.style.background=''; });
      function _openCrate() { var lc=dsLootCrates[idx]; if(lc) dsOpenLootPanel(lc); }
      el.addEventListener('click', _openCrate);
      el.addEventListener('touchend', function(e){ e.preventDefault(); _openCrate(); }, {passive:false});
    });
  }
}

function dsHideNearbyMenu() {
  if (_nearbyMenuEl) { _nearbyMenuEl.remove(); _nearbyMenuEl = null; }
  _nearbyMenuMin = false;   // reset so next entry starts expanded
  _nearbyMenuTimer = 0;
}

// ============================================================
// -- TARGET OPTIONS ------------------------------------------
// ============================================================
function dsOpenTargetOptions(socketId) {
  var op = dsOtherPlayers[socketId]; if (!op) return;
  var existing = document.getElementById('dsTargetOpts'); if (existing) existing.remove();
  var ov = document.createElement('div');
  ov.id = 'dsTargetOpts';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:850;'
    + 'display:flex;align-items:center;justify-content:center;font-family:Courier New,monospace;';
  var qc = ({ Common:'#AAAAAA',Uncommon:'#44CC44',Rare:'#4488FF',Epic:'#AA44FF',Legendary:'#FFB300',Mythic:'#FF2244' })[op.quality]||'#AAAAAA';
  var dist = Math.round(Math.sqrt(Math.pow(op.x-dsShip.x,2)+Math.pow(op.y-dsShip.y,2)));
  ov.innerHTML = '<div style="background:rgba(0,8,22,0.97);border:1px solid rgba(0,200,255,0.3);'
    + 'border-radius:12px;padding:24px 28px;min-width:260px;text-align:center;">'
    + '<div style="color:rgba(0,200,255,0.4);font-size:9px;letter-spacing:0.2em;margin-bottom:8px;">TARGET ACQUIRED</div>'
    + '<div style="color:#88CCFF;font-size:16px;font-weight:bold;margin-bottom:4px;">' + op.username + '</div>'
    + '<div style="color:' + qc + ';font-size:11px;margin-bottom:4px;">' + (op.quality||'Common') + ' ' + (op.shipClass||'fighter') + '</div>'
    + '<div style="color:rgba(255,255,255,0.3);font-size:10px;margin-bottom:20px;">' + dist + 'u away</div>'
    + (op.gunsOff || (dsShip && dsShip.gunsOff)
        ? '<button id="dsOptHail" style="display:block;width:100%;margin-bottom:8px;background:rgba(0,60,140,0.6);'
          + 'border:1px solid rgba(0,150,255,0.4);color:#88CCFF;font-family:Courier New,monospace;'
          + 'font-size:12px;padding:10px;border-radius:7px;cursor:pointer;">'
          + (op.gunsOff ? 'HAIL (they are passive)' : 'HAIL (you are passive)') + '</button>'
        : '<div style="display:block;width:100%;margin-bottom:8px;padding:10px;text-align:center;'
          + 'color:rgba(255,255,255,0.2);font-size:11px;font-family:Courier New,monospace;'
          + 'border:1px solid rgba(255,255,255,0.07);border-radius:7px;box-sizing:border-box;">'
          + 'HAIL (raise white flag first)</div>')
    + '<button id="dsOptRansom" style="display:block;width:100%;margin-bottom:8px;background:rgba(80,40,0,0.6);'
    + 'border:1px solid rgba(255,160,0,0.4);color:#FFAA44;font-family:Courier New,monospace;'
    + 'font-size:12px;padding:10px;border-radius:7px;cursor:pointer;">REQUEST RANSOM</button>'
    + '<button id="dsOptClose"  style="display:block;width:100%;background:none;border:none;'
    + 'color:rgba(255,255,255,0.25);font-family:Courier New,monospace;font-size:11px;padding:8px;cursor:pointer;">[ CLOSE ]</button>'
    + '</div>';
  document.body.appendChild(ov);
  document.getElementById('dsOptClose').addEventListener('click', function(){ ov.remove(); });
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
  var _hailBtn = document.getElementById('dsOptHail');
  if (_hailBtn) _hailBtn.addEventListener('click', function(){
    ov.remove();
    DSKT()?.emit('deepspace:hail', { targetSocketId: socketId, ransomOffer: null });
    DNOTIFY('Hail sent to ' + op.username + '...');
  });
  var _ransomBtn = document.getElementById('dsOptRansom');
  if (_ransomBtn) _ransomBtn.addEventListener('click', function(){
    ov.remove();
    dsShowRansomInput(socketId, op.username);
  });
}

function dsShowRansomInput(socketId, username) {
  var ov = document.createElement('div');
  ov.id = 'dsRansomInput';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:850;'
    + 'display:flex;align-items:center;justify-content:center;font-family:Courier New,monospace;';
  ov.innerHTML = '<div style="background:rgba(10,4,0,0.98);border:2px solid rgba(255,160,0,0.4);'
    + 'border-radius:12px;padding:28px;min-width:280px;text-align:center;">'
    + '<div style="color:#FFAA44;font-size:13px;font-weight:bold;margin-bottom:4px;">RANSOM REQUEST</div>'
    + '<div style="color:rgba(255,255,255,0.4);font-size:10px;margin-bottom:18px;">Demanding payment from ' + username + '</div>'
    + '<input id="dsRansomBars" type="number" min="0" placeholder="bars amount" '
    + 'style="width:100%;background:rgba(0,0,0,0.5);border:1px solid rgba(255,160,0,0.3);'
    + 'color:#FFAA44;font-family:Courier New,monospace;font-size:13px;padding:8px;'
    + 'border-radius:6px;box-sizing:border-box;margin-bottom:12px;">'
    + '<button id="dsRansomSend"   style="width:100%;margin-bottom:8px;background:rgba(80,40,0,0.8);'
    + 'border:1px solid rgba(255,160,0,0.5);color:#FFCC66;font-family:Courier New,monospace;'
    + 'font-size:12px;padding:10px;border-radius:7px;cursor:pointer;">SEND DEMAND</button>'
    + '<button id="dsRansomCancel" style="width:100%;background:none;border:none;'
    + 'color:rgba(255,255,255,0.25);font-family:Courier New,monospace;font-size:11px;padding:8px;cursor:pointer;">[ CANCEL ]</button>'
    + '</div>';
  document.body.appendChild(ov);
  document.getElementById('dsRansomCancel').addEventListener('click', function(){ ov.remove(); });
  document.getElementById('dsRansomSend').addEventListener('click', function(){
    var bars = parseInt(document.getElementById('dsRansomBars').value)||0;
    if (bars <= 0) { DNOTIFY('Enter a bars amount.'); return; }
    ov.remove();
    DSKT()?.emit('deepspace:hail', { targetSocketId: socketId, ransomOffer: { bars: bars } });
    DNOTIFY('Ransom demand sent to ' + username + '...');
  });
}

// ============================================================
// -- INCOMING HAIL -------------------------------------------
// ============================================================
function dsShowIncomingHail(data) {
  var existing = document.getElementById('dsIncomingHail'); if (existing) existing.remove();
  var ov = document.createElement('div');
  ov.id = 'dsIncomingHail';
  ov.style.cssText = 'position:fixed;bottom:160px;right:16px;'
    + 'background:rgba(0,8,22,0.95);border:2px solid #00FFB8;border-radius:12px;'
    + 'padding:16px 20px;z-index:860;font-family:Courier New,monospace;text-align:center;'
    + 'min-width:240px;max-width:280px;animation:dsHailBlink 1s ease-in-out 3;'
    + 'box-shadow:0 0 20px rgba(0,255,180,0.3);';
  var ransomHtml = '';
  var _myBars = dsShipBars || 0;
  var _canPay = data.ransomOffer && data.ransomOffer.bars > 0 && _myBars >= data.ransomOffer.bars;
  if (data.ransomOffer && data.ransomOffer.bars > 0) {
    ransomHtml = '<div style="color:#FFAA44;font-size:11px;margin-bottom:4px;">Demands: '
      + data.ransomOffer.bars.toLocaleString() + ' bars</div>'
      + '<div style="color:' + (_myBars>=data.ransomOffer.bars?'#44FF88':'#FF4444') + ';font-size:10px;margin-bottom:10px;">'
      + 'Your ship bars: ' + _myBars.toLocaleString()
      + (_myBars < data.ransomOffer.bars ? ' (insufficient)' : ' (can pay)')
      + '</div>';
  }
  var hasRansom = data.ransomOffer && data.ransomOffer.bars > 0;
  ov.innerHTML = '<div style="color:#00FFB8;font-size:10px;letter-spacing:0.2em;margin-bottom:8px;">INCOMING HAIL</div>'
    + '<div style="color:white;font-size:15px;font-weight:bold;margin-bottom:4px;">' + data.fromUsername + '</div>'
    + ransomHtml
    + '<div style="display:flex;flex-direction:column;gap:8px;margin-top:14px;">'
    + (hasRansom
        ? (_canPay
          ? '<button id="dsHailPay" style="background:rgba(0,100,50,0.6);border:1px solid #44FF88;color:#44FF88;'
            + 'font-family:Courier New,monospace;font-size:12px;padding:10px;border-radius:7px;cursor:pointer;">PAY ' + data.ransomOffer.bars.toLocaleString() + ' BARS</button>'
          : '<div style="padding:10px;text-align:center;color:rgba(255,100,100,0.6);font-size:11px;'
            + 'font-family:Courier New,monospace;border:1px solid rgba(255,50,50,0.2);border-radius:7px;">'
            + 'CANNOT PAY (not enough bars on ship)</div>')
          + '<button id="dsHailCounter" style="background:rgba(80,60,0,0.6);border:1px solid #FFAA44;color:#FFAA44;'
          + 'font-family:Courier New,monospace;font-size:12px;padding:10px;border-radius:7px;cursor:pointer;">COUNTER OFFER</button>'
        : '<button id="dsHailAccept" style="background:rgba(0,100,50,0.6);border:1px solid #44FF88;color:#44FF88;'
          + 'font-family:Courier New,monospace;font-size:12px;padding:10px;border-radius:7px;cursor:pointer;">ACCEPT</button>')
    + '<button id="dsHailDecline" style="background:rgba(80,0,0,0.5);border:1px solid rgba(255,60,60,0.4);'
    + 'color:rgba(255,100,100,0.8);font-family:Courier New,monospace;font-size:12px;padding:10px;border-radius:7px;cursor:pointer;">DECLINE</button>'
    + '</div>';
  document.body.appendChild(ov);
  setTimeout(function(){ if (ov.parentNode) ov.remove(); }, 25000);

  function dsAcceptHailWithMedia() {
    ov.remove();
    navigator.mediaDevices?.getUserMedia({ audio: true, video: true })
      .then(function(stream) { window._dsPendingStream = stream; })
      .catch(function() {})
      .finally(function() {
        DSKT()?.emit('deepspace:hailResponse', { toSocketId: data.fromSocketId, accepted: true });
      });
  }

  var acceptBtn = document.getElementById('dsHailAccept');
  if (acceptBtn) acceptBtn.addEventListener('click', dsAcceptHailWithMedia);

  var payBtn = document.getElementById('dsHailPay');
  if (payBtn) {
    payBtn.addEventListener('click', function(){
      DSKT()?.emit('deepspace:ransomPay', { toSocketId: data.fromSocketId, bars: data.ransomOffer.bars });
      dsAcceptHailWithMedia();
    });
  }

  var counterBtn = document.getElementById('dsHailCounter');
  if (counterBtn) {
    counterBtn.addEventListener('click', function(){
      ov.remove();
      // Show counter input
      var cov = document.createElement('div');
      cov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:861;display:flex;align-items:center;justify-content:center;font-family:Courier New,monospace;';
      cov.innerHTML = '<div style="background:rgba(10,4,0,0.98);border:2px solid rgba(255,160,0,0.4);border-radius:12px;padding:28px;min-width:280px;text-align:center;">'
        + '<div style="color:#FFAA44;font-size:13px;font-weight:bold;margin-bottom:8px;">COUNTER OFFER</div>'
        + '<div style="color:rgba(255,255,255,0.4);font-size:10px;margin-bottom:16px;">They demanded ' + data.ransomOffer.bars.toLocaleString() + ' bars</div>'
        + '<input id="dsCounterBars" type="number" min="0" placeholder="your offer in bars" '
        + 'style="width:100%;background:rgba(0,0,0,0.5);border:1px solid rgba(255,160,0,0.3);'
        + 'color:#FFAA44;font-family:Courier New,monospace;font-size:13px;padding:8px;border-radius:6px;box-sizing:border-box;margin-bottom:12px;">'
        + '<button id="dsCounterSend" style="width:100%;margin-bottom:8px;background:rgba(80,40,0,0.8);border:1px solid rgba(255,160,0,0.5);color:#FFCC66;font-family:Courier New,monospace;font-size:12px;padding:10px;border-radius:7px;cursor:pointer;">SEND COUNTER</button>'
        + '<button id="dsCounterCancel" style="width:100%;background:none;border:none;color:rgba(255,255,255,0.25);font-family:Courier New,monospace;font-size:11px;padding:8px;cursor:pointer;">[ CANCEL ]</button>'
        + '</div>';
      document.body.appendChild(cov);
      document.getElementById('dsCounterCancel').addEventListener('click', function(){ cov.remove(); });
      document.getElementById('dsCounterSend').addEventListener('click', function(){
        var bars = parseInt(document.getElementById('dsCounterBars').value)||0;
        if (bars <= 0) { DNOTIFY('Enter a counter amount.'); return; }
        cov.remove();
        // Send counter as a new ransom hail back to them
        DSKT()?.emit('deepspace:hail', { targetSocketId: data.fromSocketId, ransomOffer: { bars: bars } });
        DNOTIFY('Counter offer sent: ' + bars.toLocaleString() + ' bars');
      });
    });
  }

  document.getElementById('dsHailDecline').addEventListener('click', function(){
    ov.remove();
    DSKT()?.emit('deepspace:hailResponse', { toSocketId: data.fromSocketId, accepted: false });
    DNOTIFY('Ransom declined.');
  });
}

// ============================================================
// -- CHAT WINDOW (Star Fox style webcam comms) ---------------
// ============================================================
var _dsActiveChatSocketId = null;
var _dsChatRoomId         = null;
var _dsChatEl             = null;
var _dsVoiceRoom          = null;
var _dsVoiceActive        = false;
var _dsCamActive          = false;
var _dsCamStream          = null;

function dsOpenChatWindow(roomId, partnerUsername, partnerSocketId) {
  if (_dsChatEl) return;
  _dsChatRoomId = roomId;
  _dsActiveChatSocketId = partnerSocketId;

  var el = document.createElement('div');
  el.id = 'dsChatWin';
  _dsChatEl = el;
  el.style.cssText = 'position:fixed;bottom:140px;left:16px;width:300px;'
    + 'background:rgba(0,6,18,0.95);border:1px solid rgba(0,200,255,0.3);'
    + 'border-radius:10px;z-index:830;font-family:Courier New,monospace;overflow:hidden;';

  // Header
  el.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;'
    + 'padding:7px 10px;background:rgba(0,30,60,0.6);border-bottom:1px solid rgba(0,200,255,0.15);">'
    + '<span style="color:#00AAFF;font-size:9px;letter-spacing:0.15em;">COMMS -- ' + partnerUsername.toUpperCase() + '</span>'
    + '<div style="display:flex;gap:6px;">'
    + '<button id="dsChatVoice" title="Voice" style="background:rgba(0,80,40,0.5);border:1px solid rgba(0,255,120,0.3);'
    + 'color:#44FF88;font-size:11px;padding:2px 8px;border-radius:5px;cursor:pointer;font-family:Courier New,monospace;">MIC</button>'
    + '<button id="dsChatCam"   title="Camera" style="background:rgba(0,40,80,0.5);border:1px solid rgba(0,150,255,0.3);'
    + 'color:#4488FF;font-size:11px;padding:2px 8px;border-radius:5px;cursor:pointer;font-family:Courier New,monospace;">CAM</button>'
    + '<button id="dsChatClose" style="background:none;border:none;color:rgba(255,255,255,0.3);font-size:13px;cursor:pointer;padding:0 2px;">X</button>'
    + '</div></div>'

    // Webcam row -- Star Fox style
    + '<div id="dsChatVidRow" style="display:none;padding:6px;background:rgba(0,0,0,0.5);'
    + 'border-bottom:1px solid rgba(0,100,200,0.2);gap:6px;align-items:center;">'
    + '<div style="flex:1;position:relative;">'
    + '<video id="dsChatLocalVid" autoplay muted playsinline '
    + 'style="width:100%;height:80px;object-fit:cover;border-radius:4px;'
    + 'border:2px solid rgba(0,255,120,0.4);background:#000;display:block;"></video>'
    + '<div style="position:absolute;bottom:3px;left:4px;color:#44FF88;font-size:8px;'
    + 'font-family:Courier New,monospace;text-shadow:0 0 4px #000;">YOU</div></div>'
    + '<div style="flex:1;position:relative;">'
    + '<video id="dsChatRemoteVid" autoplay playsinline '
    + 'style="width:100%;height:80px;object-fit:cover;border-radius:4px;'
    + 'border:2px solid rgba(0,150,255,0.4);background:#000;display:block;"></video>'
    + '<div style="position:absolute;bottom:3px;left:4px;color:#4488FF;font-size:8px;'
    + 'font-family:Courier New,monospace;text-shadow:0 0 4px #000;">' + partnerUsername.toUpperCase() + '</div>'
    + '</div></div>'

    // Chat log
    + '<div id="dsChatLog" style="height:120px;overflow-y:auto;padding:8px 10px;'
    + 'font-size:10px;color:rgba(150,200,255,0.7);line-height:1.6;"></div>'

    // Input
    + '<div style="display:flex;gap:6px;padding:6px 8px;border-top:1px solid rgba(0,200,255,0.1);">'
    + '<input id="dsChatInput" type="text" maxlength="200" placeholder="message..." '
    + 'style="flex:1;background:rgba(0,0,0,0.4);border:1px solid rgba(0,150,255,0.25);'
    + 'color:#AACCFF;font-family:Courier New,monospace;font-size:11px;padding:5px 8px;border-radius:5px;outline:none;">'
    + '<button id="dsChatSend" style="background:rgba(0,60,130,0.6);border:1px solid rgba(0,150,255,0.35);'
    + 'color:#88CCFF;font-family:Courier New,monospace;font-size:10px;padding:5px 10px;border-radius:5px;cursor:pointer;">SEND</button>'
    + '</div>';

  document.body.appendChild(el);

  // Range monitor -- close if too far
  var _rangeCheck = setInterval(function() {
    if (!dsActive || !dsShip) { clearInterval(_rangeCheck); dsChatClose(); return; }
    var op = dsOtherPlayers[partnerSocketId];
    if (!op) { clearInterval(_rangeCheck); dsChatClose(); return; }
    var dx=op.x-dsShip.x, dy=op.y-dsShip.y;
    if (Math.sqrt(dx*dx+dy*dy) > 1200) {
      clearInterval(_rangeCheck);
      dsAppendChatMsg('SYSTEM', 'Signal lost -- out of range.');
      setTimeout(dsChatClose, 3000);
    }
  }, 2000);

  document.getElementById('dsChatInput').addEventListener('keydown', function(e){
    if (e.code==='Enter') { e.stopPropagation(); dsChatSend(); }
  });
  document.getElementById('dsChatSend').addEventListener('click', dsChatSend);
  document.getElementById('dsChatClose').addEventListener('click', dsChatClose);
  document.getElementById('dsChatVoice').addEventListener('click', dsToggleDSVoice);
  document.getElementById('dsChatCam').addEventListener('click', dsToggleDSCamera);

  DNOTIFY('Comms open with ' + partnerUsername);
  dsAppendChatMsg('SYSTEM', 'Channel open. Range limit: 1200u.');

  // Cam/mic are opt-in -- buttons blink when partner enables theirs
}

function dsChatSend() {
  if (!_dsActiveChatSocketId) return;
  var input = document.getElementById('dsChatInput'); if (!input) return;
  var msg = input.value.trim(); if (!msg) return;
  input.value = '';
  DSKT()?.emit('deepspace:chatMsg', { toSocketId: _dsActiveChatSocketId, msg: msg });
  dsAppendChatMsg(DUSR(), msg);
}

function dsAppendChatMsg(from, msg) {
  var log = document.getElementById('dsChatLog'); if (!log) return;
  var line = document.createElement('div');
  var col = from === DUSR() ? '#88CCFF' : from === 'SYSTEM' ? '#FFAA44' : '#88FF88';
  line.innerHTML = '<span style="color:' + col + ';font-weight:bold;">' + from + ':</span> ' + msg;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function dsChatClose() {
  if (_dsChatEl) { _dsChatEl.remove(); _dsChatEl = null; }
  _dsActiveChatSocketId = null;
  _dsChatRoomId = null;
  dsDSVoiceLeave();
  dsDSCamStop();
}

// ============================================================
// -- DEEPSPACE VOICE (private LiveKit room) ------------------
// ============================================================
async function dsToggleDSVoice() {
  if (_dsVoiceActive) { dsDSVoiceLeave(); return; }
  if (!_dsChatRoomId) return;
  var btn = document.getElementById('dsChatVoice');
  try {
    var LKRoom = window._LKRoom;
    var LKRoomEvent = window._LKRoomEvent;
    if (!LKRoom) { DNOTIFY('LiveKit not loaded.'); return; }
    var SERVER = window.SERVER_URL || (window.location.hostname==='localhost'
      ? 'http://localhost:3001'
      : 'https://aplabs-space-server-production.up.railway.app');
    var res = await fetch(SERVER + '/livekit-token?username=' + encodeURIComponent(DUSR()) + '&room=' + encodeURIComponent(_dsChatRoomId));
    var data = await res.json();
    _dsVoiceRoom = new LKRoom();
    _dsVoiceRoom.on(LKRoomEvent.TrackSubscribed, function(track) {
      if (track.kind === 'audio') {
        var audioEl = track.attach();
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);
      }
      if (track.kind === 'video') {
        var vid = document.getElementById('dsChatRemoteVid');
        if (vid) track.attach(vid);
        var row = document.getElementById('dsChatVidRow');
        if (row) row.style.display = 'flex';
        window._dsPartnerCamActive = true;
        var camBtn2 = document.getElementById('dsChatCam');
        if (camBtn2) camBtn2.style.animation = '';
        dsAppendChatMsg('SYSTEM', 'Partner camera connected.');
      }
    });
    await _dsVoiceRoom.connect('wss://aplabs-space-zefyhivd.livekit.cloud', data.token);
    await _dsVoiceRoom.localParticipant.setMicrophoneEnabled(true);
    // Publish camera if already active
    if (_dsCamActive && _dsVoiceRoom.localParticipant) {
      await _dsVoiceRoom.localParticipant.setCameraEnabled(true);
    }
    _dsVoiceActive = true;
    if (btn) { btn.textContent = 'MIC ON'; btn.style.borderColor='rgba(255,60,60,0.6)'; btn.style.color='#FF6060'; btn.style.animation=''; }
    if (_dsActiveChatSocketId) DSKT()?.emit('deepspace:mediaState', { toSocketId: _dsActiveChatSocketId, cam: _dsCamActive, mic: true });
    dsAppendChatMsg('SYSTEM', 'Voice channel open.');
  } catch(e) { DNOTIFY('Voice error: ' + e.message); }
}

function dsDSVoiceLeave() {
  if (_dsVoiceRoom) { try { _dsVoiceRoom.disconnect(); } catch(e){} _dsVoiceRoom = null; }
  _dsVoiceActive = false;
  var btn = document.getElementById('dsChatVoice');
  if (btn) { btn.textContent = 'MIC'; btn.style.borderColor='rgba(0,255,120,0.3)'; btn.style.color='#44FF88'; }
}

// ============================================================
// -- WEBCAM --------------------------------------------------
// ============================================================
async function dsToggleDSCamera() {
  console.log('[CAM] dsToggleDSCamera called, _dsCamActive=', _dsCamActive, 'mediaDevices=', !!navigator.mediaDevices);
  if (_dsCamActive) { dsDSCamStop(); return; }
  var btn = document.getElementById('dsChatCam');
  console.log('[CAM] btn found=', !!btn);
  if (btn) { btn.textContent='CAM...'; btn.style.borderColor='rgba(255,200,0,0.8)'; }
  dsAppendChatMsg('SYSTEM', 'Requesting camera access...');
  try {
    console.log('[CAM] calling getUserMedia...');
    _dsCamStream = await navigator.mediaDevices.getUserMedia({ video:{ width:160,height:120 }, audio:false });
    console.log('[CAM] getUserMedia success, stream=', !!_dsCamStream);
    var localVid = document.getElementById('dsChatLocalVid');
    if (localVid) localVid.srcObject = _dsCamStream;
    var row = document.getElementById('dsChatVidRow');
    if (row) row.style.display = 'flex';
    _dsCamActive = true;
    if (btn) { btn.textContent='CAM ON'; btn.style.borderColor='rgba(255,60,60,0.5)'; btn.style.color='#FF6060'; btn.style.animation=''; }
    if (_dsVoiceRoom && _dsVoiceRoom.localParticipant) {
      await _dsVoiceRoom.localParticipant.setCameraEnabled(true);
    }
    if (_dsActiveChatSocketId) DSKT()?.emit('deepspace:mediaState', { toSocketId: _dsActiveChatSocketId, cam: true, mic: _dsVoiceActive });
    dsAppendChatMsg('SYSTEM', 'Camera enabled.');
  } catch(e) { console.error('[CAM] getUserMedia error:', e.name, e.message); DNOTIFY('Camera error: ' + e.name + ' -- ' + e.message); dsAppendChatMsg('SYSTEM', 'Camera failed: ' + e.message); }
}

function dsDSCamStop() {
  if (_dsCamStream) { _dsCamStream.getTracks().forEach(function(t){ t.stop(); }); _dsCamStream = null; }
  var localVid = document.getElementById('dsChatLocalVid');
  if (localVid) localVid.srcObject = null;
  var row = document.getElementById('dsChatVidRow');
  if (row) row.style.display = 'none';
  _dsCamActive = false;
  var btn = document.getElementById('dsChatCam');
  if (btn) { btn.textContent='CAM'; btn.style.borderColor='rgba(0,150,255,0.3)'; btn.style.color='#4488FF'; }
  if (_dsVoiceRoom && _dsVoiceRoom.localParticipant) {
    try { _dsVoiceRoom.localParticipant.setCameraEnabled(false); } catch(e) {}
  }
}

// ============================================================
// -- CLEANUP ON EXIT -----------------------------------------
// ============================================================
(function() {
  var _origExit = window.exitDeepSpace;
  window.exitDeepSpace = function() {
    dsHideMobileHUD();
    dsHideNearbyMenu();
    dsChatClose();
    if (_origExit) _origExit();
  };
})();


// ============================================================
// -- PASSIVE MODE / WHITE FLAG -------------------------------
// ============================================================
// Passive mode: gunsOff=true, cannot fire, can be hailed
// 15s combat cooldown before you can raise the flag
var PASSIVE_COMBAT_COOLDOWN = 15000; // ms

function dsCanRaiseFlag() {
  if (!dsShip) return false;
  var lastCombat = dsShip._lastCombat || 0;
  return (Date.now() - lastCombat) > PASSIVE_COMBAT_COOLDOWN;
}

function dsTogglePassiveMode() {
  if (!dsShip) return;
  if (!dsShip.gunsOff) {
    // Trying to raise flag
    if (!dsCanRaiseFlag()) {
      var remaining = Math.ceil((PASSIVE_COMBAT_COOLDOWN - (Date.now() - (dsShip._lastCombat||0))) / 1000);
      DNOTIFY('Cannot raise flag -- in combat cooldown (' + remaining + 's)');
      return;
    }
    dsShip.gunsOff = true;
    DNOTIFY('White flag raised. You are in passive mode. Weapons disabled.');
  } else {
    dsShip.gunsOff = false;
    DNOTIFY('Flag lowered. Weapons hot.');
  }
}

// Draw white flag button on HUD (called from dsDraw after tactical HUD)
function dsDrawPassiveBtn(W, H) {
  if (!dsShip) return;
  var t = Date.now() * 0.001;
  var cx = W/2 + 100; // left of fire circle, still near right thumb
  var cy = H - 80;
  var r  = 22;
  var isPassive = !!dsShip.gunsOff;
  var canRaise  = dsCanRaiseFlag();

  // Button circle
  var alpha = isPassive ? 0.9 : (canRaise ? 0.5 : 0.25);
  var col   = isPassive ? 'rgba(255,255,255,' + alpha + ')' : (canRaise ? 'rgba(200,200,200,' + alpha + ')' : 'rgba(100,100,100,' + alpha + ')');
  dsCtx.beginPath(); dsCtx.arc(cx, cy, r, 0, Math.PI*2);
  dsCtx.fillStyle = isPassive ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.3)';
  dsCtx.fill();
  dsCtx.strokeStyle = col; dsCtx.lineWidth = 1.5; dsCtx.stroke();

  // White flag icon
  dsCtx.save(); dsCtx.translate(cx - 6, cy + 8);
  // Flagpole
  dsCtx.strokeStyle = col; dsCtx.lineWidth = 1.5;
  dsCtx.beginPath(); dsCtx.moveTo(0, 0); dsCtx.lineTo(0, -16); dsCtx.stroke();
  // Flag
  dsCtx.fillStyle = isPassive ? 'rgba(255,255,255,0.95)' : col;
  dsCtx.beginPath();
  dsCtx.moveTo(0, -16); dsCtx.lineTo(10, -12); dsCtx.lineTo(0, -8);
  dsCtx.closePath(); dsCtx.fill();
  dsCtx.restore();

  // Label
  dsCtx.textAlign = 'center'; dsCtx.font = '8px Courier New';
  dsCtx.fillStyle = col;
  dsCtx.fillText(isPassive ? 'PASSIVE' : 'FLAG', cx, cy + r + 10);

  // Combat cooldown arc
  if (!canRaise && !isPassive) {
    var elapsed = Date.now() - (dsShip._lastCombat||0);
    var pct = Math.min(1, elapsed / PASSIVE_COMBAT_COOLDOWN);
    dsCtx.beginPath(); dsCtx.arc(cx, cy, r + 3, -Math.PI/2, -Math.PI/2 + pct * Math.PI*2);
    dsCtx.strokeStyle = 'rgba(255,120,0,0.5)'; dsCtx.lineWidth = 2; dsCtx.stroke();
  }

  // Pulsing glow when passive
  if (isPassive) {
    var pulse = 0.3 + Math.sin(t * 2) * 0.2;
    dsCtx.beginPath(); dsCtx.arc(cx, cy, r + 4, 0, Math.PI*2);
    dsCtx.strokeStyle = 'rgba(255,255,255,' + pulse + ')'; dsCtx.lineWidth = 1; dsCtx.stroke();
  }

  // Store hitbox for click detection
  dsShip._passiveBtnX = cx;
  dsShip._passiveBtnY = cy;
  dsShip._passiveBtnR = r;
}

// Passive button click handled in dsCanvas click listener above

// Hook into dsDraw -- call after tactical HUD
(function() {
  var _origTactical = window.dsDrawTacticalHUD;
  // We patch at draw time rather than replacing the function
  // The passive btn is drawn as part of the main dsDraw loop
  // It gets called via dsDrawPassiveBtn which we hook below
})();

// Notify hailer of response
function dsNotifyHailerOfResponse(toSocketId, responseType, counterBars) {
  if (responseType === 'pay') {
    DSKT()?.emit('deepspace:chatMsg', { toSocketId: toSocketId, msg: '[RANSOM PAID]' });
  } else if (responseType === 'counter') {
    DSKT()?.emit('deepspace:hail', { targetSocketId: toSocketId, ransomOffer: { bars: counterBars } });
    DNOTIFY('Counter offer sent: ' + counterBars.toLocaleString() + ' bars');
  } else {
    DSKT()?.emit('deepspace:chatMsg', { toSocketId: toSocketId, msg: '[RANSOM DECLINED]' });
    DNOTIFY('You declined the ransom demand.');
  }
}


// ============================================================
// -- DEEPSPACE MOBILE HUD ------------------------------------
// ============================================================
var _dsMobileTapCount = 0; // track shots for missile-every-3rd logic

function dsInitMobileHUD() {
  if (document.getElementById('dsMobileHUD')) return;
  if (window.innerWidth >= 900) return;
  var hud = document.createElement('div');
  hud.id = 'dsMobileHUD';
  // Bottom-right above weapon circles. Missile circle is at H-158 on mobile.
  hud.style.cssText = 'position:fixed;bottom:220px;right:12px;z-index:820;'
    + 'display:flex;flex-direction:column;align-items:center;gap:10px;';

  function mkBtn(color, id, innerHtml) {
    var b = document.createElement('div');
    b.id = id;
    b.style.cssText = 'width:64px;padding:8px 0 6px;background:rgba(0,8,22,0.88);border:2px solid ' + color
      + ';border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;'
      + ';user-select:none;cursor:pointer;text-align:center;'
      + 'backdrop-filter:blur(6px);-webkit-tap-highlight-color:transparent;'
      + 'box-shadow:0 0 12px ' + color + '44;';
    b.innerHTML = innerHtml;
    return b;
  }

  var btnWarp = mkBtn('#00FFFF', 'dsMobWarp',
    '<svg width="28" height="26" viewBox="0 0 28 26" style="display:block;margin:0 auto 3px;">' + '<line x1="2" y1="9" x2="9" y2="9" stroke="#00FFFF" stroke-width="1.5" opacity="0.45"/>' + '<line x1="4" y1="13" x2="9" y2="13" stroke="#00FFFF" stroke-width="1.5" opacity="0.3"/>' + '<line x1="2" y1="17" x2="9" y2="17" stroke="#00FFFF" stroke-width="1.5" opacity="0.45"/>' + '<polygon points="10,5 23,13 10,21 13,13" fill="none" stroke="#00FFFF" stroke-width="1.8" stroke-linejoin="round"/>' + '<circle cx="23" cy="13" r="2" fill="#00FFFF"/>' + '</svg>' + '<div style="font-family:Courier New,monospace;font-size:9px;color:#00FFFF;letter-spacing:0.1em;">WARP</div>'
  );
  var btnScan = mkBtn('#00FFB8', 'dsMobScan',
    '<svg width="28" height="26" viewBox="0 0 28 26" style="display:block;margin:0 auto 3px;">' + '<line x1="3" y1="8" x2="25" y2="8" stroke="#00FFB8" stroke-width="1.2" opacity="0.35"/>' + '<line x1="3" y1="13" x2="25" y2="13" stroke="#00FFB8" stroke-width="1.5" opacity="0.75"/>' + '<line x1="3" y1="18" x2="25" y2="18" stroke="#00FFB8" stroke-width="1.2" opacity="0.35"/>' + '<circle cx="19" cy="13" r="2.5" fill="#00FFB8"/>' + '<circle cx="19" cy="13" r="5.5" stroke="#00FFB8" stroke-width="1" fill="none" opacity="0.5"/>' + '<circle cx="19" cy="13" r="9" stroke="#00FFB8" stroke-width="0.6" fill="none" opacity="0.2"/>' + '</svg>' + '<div style="font-family:Courier New,monospace;font-size:9px;color:#00FFB8;letter-spacing:0.1em;">SCAN</div>'
  );

  btnWarp.addEventListener('touchstart', function(e) {
    e.preventDefault();
    if (typeof dsDoWarp === 'function') dsDoWarp();
  }, {passive: false});

  btnScan.addEventListener('touchstart', function(e) {
    e.preventDefault();
    if (typeof dsActivateScanner === 'function') dsActivateScanner();
  }, {passive: false});

  hud.appendChild(btnWarp);
  hud.appendChild(btnScan);
  document.body.appendChild(hud);
}

// Show/hide with deepspace
(function() {
  var _origEnterDS = window.enterDeepSpace;
  window.enterDeepSpace = function() {
    if (_origEnterDS) _origEnterDS.apply(this, arguments);
    setTimeout(dsInitMobileHUD, 1000);
  };
})();

function dsHideMobileHUD() {
  var hud = document.getElementById('dsMobileHUD');
  if (hud) hud.remove();
}
