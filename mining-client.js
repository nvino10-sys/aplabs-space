// ─── mining-client.js ──────────────────────────────────────────────────────
// APLabs Mining System — client side
// Dynamically imported by main.dev.js at the bottom:
//   import('./mining-client.js');
//
// Reads from window bridge set in main.dev.js — see BRIDGE section below.
// Completely self-contained. Zero edits to main.js required.
// ────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';

// ── BRIDGE (reads globals set by main.dev.js) ─────────────────────────────
const S       = () => window._mineScene;
const CAM     = () => window._mineCamera;
const SKT     = () => window._mineGetSocket?.();
const USR     = () => window._mineGetUsername?.() || '';
const SID     = () => window._mineGetSocketId?.();
const BLOCKED = () => window._mineIsBlocked?.() || false;
const NOTIFY  = (msg) => window._mineShowNotification?.(msg);

const GROUND_Y = 1.7;

// ── ORE NODE POSITIONS — must mirror mining.js exactly ───────────────────
const ORE_NODES = [
  { id:'n1', x:-82, z:-62 },
  { id:'n2', x:-89, z:-67 },
  { id:'n3', x:-85, z:-74 },
  { id:'n4', x:-78, z:-70 },
  { id:'n5', x:-93, z:-64 },
];

// ── STATE ─────────────────────────────────────────────────────────────────
let inventory  = { ore:0, bars:0, bagSize:3, tools:[], proficiency:0 };
let nearNodeId = null;
const nodeMeshes = {};  // id -> { group, rock, rock2, veinMat, glint, available }
let _bobTime   = 0;

// ── SELF-CONTAINED THREE.JS HELPERS ───────────────────────────────────────
// Redefining here so we have zero dependency on main.js scope.
function addMesh(geo, color, x, y, z, cast=true, emissive=null) {
  const mat = new THREE.MeshLambertMaterial({ color });
  if (emissive) { mat.emissive = new THREE.Color(emissive); mat.emissiveIntensity = 0.5; }
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast; m.receiveShadow = true;
  S().add(m); return m;
}
const mbox  = (w,h,d,c,x,y,z,cast=true,em=null) => addMesh(new THREE.BoxGeometry(w,h,d),c,x,y,z,cast,em);
const mcyl  = (rt,rb,h,s,c,x,y,z,cast=true)     => addMesh(new THREE.CylinderGeometry(rt,rb,h,s),c,x,y,z,cast);
const mcone = (r,h,s,c,x,y,z)                   => addMesh(new THREE.ConeGeometry(r,h,s),c,x,y,z);

// ── BUILD ORE NODE MESH ───────────────────────────────────────────────────
function buildOreNode(node) {
  const g = new THREE.Group();

  // Main boulder — chunky irregular rock
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x8A8070 });
  const rock = new THREE.Mesh(new THREE.SphereGeometry(0.9, 7, 6), rockMat);
  rock.scale.set(1.3, 0.85, 1.1);
  rock.position.y = 0.55;
  rock.castShadow = true; g.add(rock);

  // Secondary smaller boulder beside it
  const rock2 = new THREE.Mesh(
    new THREE.SphereGeometry(0.52, 6, 5),
    new THREE.MeshLambertMaterial({ color: 0x7A7060 })
  );
  rock2.scale.set(1.0, 0.9, 1.1);
  rock2.position.set(0.75, 0.3, 0.35);
  rock2.castShadow = true; g.add(rock2);

  // Flat base rock
  const base = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 6, 4),
    new THREE.MeshLambertMaterial({ color: 0x6A6050 })
  );
  base.scale.set(1.5, 0.4, 1.3);
  base.position.y = 0.12;
  base.receiveShadow = true; g.add(base);

  // Mineral veins — orange/amber streaks visible in the rock face
  const veinMat = new THREE.MeshBasicMaterial({ color: 0xFF7722 });
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const vein = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.32, 0.05), veinMat);
    vein.position.set(
      Math.cos(angle) * 0.62,
      0.5 + Math.sin(i * 1.3) * 0.15,
      Math.sin(angle) * 0.56
    );
    vein.rotation.z = angle + 0.4;
    g.add(vein);
  }

  // Sparkle/glint — pulses when available
  const glint = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 5, 5),
    new THREE.MeshBasicMaterial({ color: 0xFFCC44, transparent: true, opacity: 0.75 })
  );
  glint.position.set(0.3, 1.05, 0.38);
  g.add(glint);

  g.position.set(node.x, 0, node.z);
  S().add(g);

  nodeMeshes[node.id] = { group: g, rock, rock2, veinMat, glint, available: true, rocks: 4 };
}

// ── UPDATE NODE VISUAL STATE ───────────────────────────────────────────────
function setNodeAvailable(nodeId, available) {
  const nm = nodeMeshes[nodeId]; if (!nm) return;
  nm.available = available;
  nm.rock.material.color.set(available ? 0x8A8070 : 0x3A3830);
  nm.rock2.material.color.set(available ? 0x7A7060 : 0x2E2C28);
  nm.veinMat.color.set(available ? 0xFF7722 : 0x222220);
  nm.glint.visible = available;
  nm.group.position.y = available ? 0 : -0.08;
  // Glint size reflects rocks remaining — bigger = more ore inside
  if (available && nm.rocks) {
    const s = 0.6 + (nm.rocks / 4) * 1.0;
    nm.glint.scale.setScalar(s);
  }
}

// ── BUILD ENTIRE MINE AREA ─────────────────────────────────────────────────
function buildMineArea() {

  // Slightly darker dirt patch
  const dirt = new THREE.Mesh(
    new THREE.PlaneGeometry(35, 35),
    new THREE.MeshLambertMaterial({ color: 0x524840 })
  );
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.set(-84, 0.01, -67);
  dirt.receiveShadow = true;
  S().add(dirt);

  // Path removed — mine is found by exploration

  // ── ENTRANCE SIGN — faces east (+X) toward arriving players ──────────
  // Poles spread in Z, sign board thin in X so face is visible from east
  mcyl(0.08, 0.08, 3.5, 6, 0x8B5E3C, -66, 1.75, -48.5);
  mcyl(0.08, 0.08, 3.5, 6, 0x8B5E3C, -66, 1.75, -45.5);
  // Crossbar spans Z
  mbox(0.12, 0.12, 4.5, 0x8B5E3C, -66, 3.6, -47);
  // Sign board — 0.22 thin in X, 7 wide in Z → face visible from east
  mbox(0.22, 1.4, 7,   0x5C3A1E, -66,   4.6, -47);
  mbox(0.28, 1.0, 6.8, 0x7A5030, -65.9, 4.6, -47);
  // Gold trim top and bottom
  mbox(0.3, 0.14, 6.9, 0xCC9933, -65.9, 5.25, -47);
  mbox(0.3, 0.14, 6.9, 0xCC9933, -65.9, 3.95, -47);
  // Pickaxe silhouette — handle vertical in Y, head horizontal in Z
  mbox(0.3, 1.1, 0.18, 0x888888, -65.75, 4.6,  -47);    // handle
  mbox(0.3, 0.18, 1.1, 0x888888, -65.75, 5.1,  -47);    // head
  mbox(0.3, 0.12, 0.6, 0xAAAAAA, -65.75, 4.48, -46.45); // pick point

  // ── SCENERY BOULDERS (non-interactive) ──────────────────────────────────
  const scenery = [
    [-73,-55, 0.5,0.4], [-77,-53, 0.6,0.5], [-96,-62, 0.7,0.55],
    [-98,-69, 0.6,0.5], [-95,-76, 0.5,0.45],[-88,-80, 0.6,0.5],
    [-80,-79, 0.55,0.45],[-73,-73, 0.5,0.4],[-70,-65, 0.45,0.4],
    [-68,-57, 0.4,0.35],[-100,-65,0.8,0.6], [-101,-71,0.65,0.5],
  ];
  scenery.forEach(([x, z, r, ys]) => {
    const rock = new THREE.Mesh(
      new THREE.SphereGeometry(r, 6, 5),
      new THREE.MeshLambertMaterial({ color: 0x686050 })
    );
    rock.scale.set(1.2 + Math.random()*0.4, ys, 1.1 + Math.random()*0.3);
    rock.position.set(x, r * ys * 0.5, z);
    rock.castShadow = true; rock.receiveShadow = true;
    S().add(rock);
  });

  // ── TREES RINGING THE MINE ────────────────────────────────────────────
  function mineTree(x, z) {
    mcyl(0.15, 0.22, 1.1, 6, 0x8B5E3C, x, 0.55, z);
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.6, 6),
      new THREE.MeshLambertMaterial({ color: 0x1A5C2E }));
    c1.position.set(x, 2.7, z); c1.castShadow = true; S().add(c1);
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.2, 6),
      new THREE.MeshLambertMaterial({ color: 0x236635 }));
    c2.position.set(x, 4.4, z); c2.castShadow = true; S().add(c2);
  }
  [
    [-69,-51],[-71,-55],[-74,-53],[-70,-60],
    [-100,-58],[-101,-63],[-100,-70],[-99,-77],
    [-94,-82],[-87,-82],[-80,-82],[-74,-80],
    [-70,-74],[-69,-68],[-69,-61]
  ].forEach(([x,z]) => mineTree(x, z));

  // ── MINING CAMP PROPS ────────────────────────────────────────────────
  // Wooden crate
  mbox(0.9, 0.8, 0.9, 0xAA8855, -77, 0.4, -59);
  mbox(0.95, 0.1, 0.95, 0xBB9966, -77, 0.82, -59);
  mbox(0.1, 0.8, 0.95, 0x996633, -77.47, 0.4, -59);
  // Bucket
  mcyl(0.22, 0.28, 0.45, 8, 0x8B6644, -80, 0.22, -61);
  mcyl(0.19, 0.25, 0.38, 8, 0x555544, -80, 0.24, -61);
  // Pickaxe on ground
  mbox(1.6, 0.07, 0.1, 0x888888, -75.5, 0.06, -61.5);
  mbox(0.45, 0.07, 0.38, 0x777777, -76.2, 0.08, -61.5);
  mbox(0.45, 0.07, 0.15, 0xAAAAAA, -74.85, 0.08, -61.35);
  // Old lantern on post
  mcyl(0.05, 0.05, 1.5, 6, 0x888888, -74, 0.75, -57);
  mbox(0.22, 0.28, 0.22, 0x333333, -74, 1.6, -57, false);
  mbox(0.17, 0.23, 0.17, 0xFFEE88, -74, 1.6, -57, false, 0xFFCC44);
  // Second lantern
  mcyl(0.05, 0.05, 1.5, 6, 0x888888, -74, 0.75, -54);
  mbox(0.22, 0.28, 0.22, 0x333333, -74, 1.6, -54, false);
  mbox(0.17, 0.23, 0.17, 0xFFEE88, -74, 1.6, -54, false, 0xFFCC44);

  // ── ORE NODES ────────────────────────────────────────────────────────
  ORE_NODES.forEach(n => buildOreNode(n));

  console.log('[Mining Client] Mine area built at northwest (~x=-85, z=-67)');
}

// ── MINE HUD (ore / bars counter — top left, below coords) ────────────────
const mineHUD = document.createElement('div');
window._mineHUD = mineHUD;
mineHUD.style.cssText = `
  position:fixed;top:58px;left:12px;
  background:rgba(0,0,0,0.65);color:#FF9944;font-family:monospace;
  font-size:12px;padding:6px 14px;border-radius:16px;z-index:500;
  pointer-events:none;display:none;
  border:1px solid rgba(255,153,68,0.35);backdrop-filter:blur(6px);
  white-space:nowrap;letter-spacing:0.03em;
`;
document.body.appendChild(mineHUD);

function updateMineHUD() {
  const hasProgress = inventory.ore > 0 || inventory.bars > 0 || 
                      (inventory.tools && inventory.tools.length > 0) || nearNodeId;
  if (hasProgress) {
    if (window._playerZone === 'space' || window._playerZone === 'station' || window._inStation || window._inSanctum || window._ddsActive) return;
    mineHUD.style.display = 'block';
    mineHUD.innerHTML =
      `⛏️ ${inventory.ore}/${inventory.bagSize} ore` +
      (inventory.bars > 0 ? ` &nbsp;|&nbsp; 🔶 ${inventory.bars} bars` : '') +
      (inventory.tools && inventory.tools.length > 0 ? ` &nbsp;|&nbsp; 🔧 ${inventory.tools.join(', ')}` : '');
  } else {
    mineHUD.style.display = 'none';
  }
}

// ── MINE PROMPT (independent of main.js doorPrompt) ───────────────────────
const minePrompt = document.createElement('div');
minePrompt.style.cssText = `
  position:fixed;bottom:110px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,0.72);color:white;padding:12px 28px;border-radius:12px;
  font-family:sans-serif;font-size:15px;border:1px solid rgba(255,153,68,0.5);
  backdrop-filter:blur(8px);display:none;z-index:100;cursor:pointer;user-select:none;
  box-shadow:0 0 12px rgba(255,153,68,0.3);
`;
minePrompt.addEventListener('touchend', e => { e.preventDefault(); doMine(); }, { passive: false });
minePrompt.addEventListener('click', () => doMine());
document.body.appendChild(minePrompt);

// ── FIND NEAREST ORE NODE ─────────────────────────────────────────────────
function findNearestNode() {
  const cam = CAM(); if (!cam) return null;
  let closest = null, closestDist = 3.8;
  ORE_NODES.forEach(n => {
    const dx = cam.position.x - n.x;
    const dz = cam.position.z - n.z;
    const d = Math.sqrt(dx*dx + dz*dz);
    if (d < closestDist) { closestDist = d; closest = n.id; }
  });
  return closest;
}

// ── MINING PROGRESS UI ────────────────────────────────────────────────────
let miningInProgress = false;
let miningNodeId     = null;
let miningInterval   = null;

const mineProgressBox = document.createElement('div');
mineProgressBox.style.cssText = `
  position:fixed;bottom:180px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,0.82);border:2px solid rgba(255,153,68,0.7);
  border-radius:16px;padding:14px 28px;display:none;z-index:200;
  font-family:sans-serif;text-align:center;min-width:200px;
  box-shadow:0 0 18px rgba(255,153,68,0.3);pointer-events:none;
`;
mineProgressBox.innerHTML = `
  <div style="position:relative;width:52px;height:52px;margin:0 auto 10px;">
    <svg width="52" height="52" style="transform:rotate(-90deg);">
      <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="4"/>
      <circle id="mineProgressRing" cx="26" cy="26" r="22" fill="none"
        stroke="#FF9944" stroke-width="4" stroke-linecap="round"
        stroke-dasharray="138" stroke-dashoffset="138"
        style="transition:stroke-dashoffset 0.1s linear;"/>
    </svg>
    <div id="mineProgressIcon" style="position:absolute;inset:0;display:flex;
      align-items:center;justify-content:center;font-size:20px;">⛏️</div>
  </div>
  <div id="mineProgressLabel" style="color:#FF9944;font-size:13px;font-weight:bold;
    letter-spacing:0.05em;">MINING...</div>
`;
document.body.appendChild(mineProgressBox);

const MINE_DURATION = 2.2; // seconds to fill the ring
const MINE_HITS     = 4;   // number of pickaxe sound hits during mining

function startMining(nodeId) {
  if (miningInProgress) return;
  miningInProgress = true;
  miningNodeId     = nodeId;

  mineProgressBox.style.display = 'block';
  minePrompt.style.display      = 'none';

  let elapsed  = 0;
  let lastHit  = 0;
  const ring   = document.getElementById('mineProgressRing');
  const label  = document.getElementById('mineProgressLabel');
  const icon   = document.getElementById('mineProgressIcon');
  const circumference = 138;
  const tickMs = 60;

  miningInterval = setInterval(() => {
    // If player walked away, cancel
    if (!nearNodeId || nearNodeId !== miningNodeId) {
      cancelMining();
      return;
    }

    elapsed += tickMs / 1000;
    const pct = Math.min(elapsed / MINE_DURATION, 1);

    // Update ring
    if (ring) ring.style.strokeDashoffset = circumference * (1 - pct);

    // Pickaxe swing animation on icon
    const hitInterval = MINE_DURATION / MINE_HITS;
    if (elapsed - lastHit >= hitInterval) {
      lastHit = elapsed;
      playMineSound();
      if (icon) {
        icon.style.transform = 'rotate(30deg)';
        setTimeout(() => { if(icon) icon.style.transform = 'rotate(0deg)'; }, 120);
      }
      // Tiny camera shake each hit
      const cam = CAM();
      if (cam) {
        cam.position.y += 0.05;
        setTimeout(() => { if(CAM()) CAM().position.y -= 0.05; }, 70);
      }
    }

    if (pct >= 1) {
      // Ring full — pause and wait for server result
      clearInterval(miningInterval);
      miningInterval = null;
      if (ring) ring.style.strokeDashoffset = '0';
      if (label) label.textContent = '...';
      if (icon)  icon.textContent  = '⏳';
      // Safety timeout — if server doesn't respond in 5s, cancel
      const _safetyTimer = setTimeout(() => {
        if (miningInProgress) {
          mineProgressBox.style.display = 'none';
          miningInProgress = false;
          miningNodeId = null;
        }
      }, 5000);

      SKT()?.emit('mine:mine', { nodeId: miningNodeId });
      // Result handled by mine:result socket event
      // Store timer so mine:result can clear it
      window._mineSafetyTimer = _safetyTimer;
    }
  }, tickMs);
}

function cancelMining() {
  if (!miningInProgress) return;
  clearInterval(miningInterval);
  miningInterval   = null;
  miningInProgress = false;
  miningNodeId     = null;
  mineProgressBox.style.display = 'none';
  const ring = document.getElementById('mineProgressRing');
  if (ring) ring.style.strokeDashoffset = '138';
}

// ── MINE ACTION ───────────────────────────────────────────────────────────
function doMine() {
  if (BLOCKED()) return;
  if (!nearNodeId) return;
  if (!SID()) { NOTIFY('Connect to multiplayer to mine!'); return; }
  if (miningInProgress) return;

  const nm = nodeMeshes[nearNodeId];
  if (nm && !nm.available) {
    NOTIFY('⛏️ Node depleted — try a different one!');
    return;
  }

  startMining(nearNodeId);
}

// ── MINING SOUND (percussive hit) ─────────────────────────────────────────
function playMineSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.14, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++)
      d[i] = (Math.random()*2-1) * Math.exp(-i/(ctx.sampleRate*0.025));
    const src  = ctx.createBufferSource(); src.buffer = buf;
    const gain = ctx.createGain();         gain.gain.value = 0.4;
    const filt = ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 700;
    src.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
    src.start();
    setTimeout(() => ctx.close(), 600);
  } catch(e) {}
}

// ── SUCCESS DING — bright metallic ping ───────────────────────────────────
function playSuccessDing() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
    // Two harmonics for a rich metallic ring
    [1200, 2400].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.85, ctx.currentTime + 0.8);
      const g2 = ctx.createGain(); g2.gain.value = i === 0 ? 1.0 : 0.4;
      osc.connect(g2); g2.connect(gain);
      osc.start(); osc.stop(ctx.currentTime + 0.9);
    });
    gain.connect(ctx.destination);
    setTimeout(() => ctx.close(), 1200);
  } catch(e) {}
}

// ── MISS CLUNK — dull thud, no ring ──────────────────────────────────────
function playMissClunk() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const buf  = ctx.createBuffer(1, ctx.sampleRate * 0.18, ctx.sampleRate);
    const d    = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++)
      d[i] = (Math.random()*2-1) * Math.exp(-i/(ctx.sampleRate*0.04));
    const src  = ctx.createBufferSource(); src.buffer = buf;
    const gain = ctx.createGain(); gain.gain.value = 0.45;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 280;
    src.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
    src.start();
    setTimeout(() => ctx.close(), 500);
  } catch(e) {}
}
function setupSocketEvents() {
  const skt = SKT(); if (!skt) return;

  skt.on('mine:result', data => {
    clearTimeout(window._mineSafetyTimer);
    const ring  = document.getElementById('mineProgressRing');
    const label = document.getElementById('mineProgressLabel');
    const icon  = document.getElementById('mineProgressIcon');

    if (data.success) {
      // ── SUCCESS ──
      if (label) label.textContent = 'GOT ONE!';
      if (icon)  icon.textContent  = '💎';
      if (ring)  ring.style.stroke = '#FFD700';
      playSuccessDing();
      if (data.bagFull) NOTIFY('🎒 Bag full! Head to the Workshop to smelt.');
    } else if (data.bagFull) {
      // ── BAG FULL ──
      if (label) { label.textContent = 'BAG FULL!'; label.style.color = '#FF9944'; }
      if (icon)  icon.textContent  = '🎒';
      if (ring)  { ring.style.stroke = '#FF9944'; ring.style.strokeDashoffset = '0'; }
      NOTIFY('🎒 Bag full! Head to the Workshop to smelt.');
    } else {
      // ── MISS ──
      if (label) { label.textContent = 'GLANCING BLOW'; label.style.color = '#FF4444'; }
      if (icon)  icon.textContent  = '💨';
      if (ring)  { ring.style.stroke = '#FF4444'; ring.style.strokeDashoffset = '138'; }
      playMissClunk();
      NOTIFY(`⛏️ Glancing blow! (${data.failPct}% miss — keep mining to improve)`);
    }

    setTimeout(() => {
      mineProgressBox.style.display = 'none';
      if (ring)  { ring.style.stroke = '#FF9944'; ring.style.strokeDashoffset = '138'; }
      if (label) { label.textContent = 'MINING...'; label.style.color = '#FF9944'; }
      if (icon)  icon.textContent  = '⛏️';
      miningInProgress = false;
      miningNodeId     = null;
    }, data.success ? 700 : data.bagFull ? 1400 : 500);
  });

  skt.on('mine:state', data => {
    // Update in-place to preserve live reference in window._mineInventory
    if (data.inventory) {
      Object.assign(inventory, data.inventory);
    }
    if (data.nodes) data.nodes.forEach(n => {
      setNodeAvailable(n.id, n.available);
      const nm = nodeMeshes[n.id];
      if (nm) nm.rocks = n.rocks ?? 0;
    });
    updateMineHUD();
  });

  skt.on('mine:nodeUpdate', data => {
    setNodeAvailable(data.nodeId, data.available);
    // Update rocks count display
    const nm = nodeMeshes[data.nodeId];
    if (nm) nm.rocks = data.rocks ?? 0;
    // Brief extra sparkle when a node respawns
    if (data.available) {
      if (nm && nm.glint) {
        nm.glint.material.opacity = 1.0;
        nm.glint.scale.setScalar(2.0);
        setTimeout(() => { nm.glint.scale.setScalar(1.0); }, 400);
      }
    }
  });

  skt.emit('mine:getState');
  console.log('[Mining Client] Socket events bound');
}

// ── ANIMATION TICK ────────────────────────────────────────────────────────
function tick(dt) {
  // Do nothing while in station or space -- mine is earth only
  if (window._inStation || window._spaceOverride || window._inSanctum || window._ddsActive) {
    minePrompt.style.display = 'none';
    return;
  }
  _bobTime += dt;

  // Available nodes gently pulse
  ORE_NODES.forEach((n, idx) => {
    const nm = nodeMeshes[n.id]; if (!nm || !nm.available) return;
    nm.glint.position.y = 1.05 + Math.sin(_bobTime*2.2 + idx)*0.09;
    nm.glint.material.opacity = 0.55 + Math.sin(_bobTime*3.0 + idx)*0.25;
  });

  // Proximity
  nearNodeId = findNearestNode();

  // Prompt
  if (BLOCKED() || miningInProgress) {
    minePrompt.style.display = 'none';
  } else if (nearNodeId) {
    const nm = nodeMeshes[nearNodeId];
    minePrompt.textContent = nm && nm.available
      ? `⛏️ Press E to mine  (${inventory.ore}/${inventory.bagSize}) — ${nm.rocks ?? '?'} rocks left`
      : '⛏️ Depleted — try another node';
    minePrompt.style.display = 'block';
  } else {
    minePrompt.style.display = 'none';
  }

  updateMineHUD();
}

// ── E KEY LISTENER ────────────────────────────────────────────────────────
// Fires alongside main.js's keydown. At the mine location, none of main's
// nearDoor/nearBench checks are true, so only this handler acts.
document.addEventListener('keydown', e => {
  if (window._inStation || window._spaceOverride || window._inSanctum || window._ddsActive) return;
  if (e.code === 'Escape') { cancelMining(); return; }
  if (e.code !== 'KeyE') return;
  if (BLOCKED()) return;
  if (nearNodeId) doMine();
});

// ── TELEPORT ENTRY ────────────────────────────────────────────────────────
// Adds "⛏️ The Mine" to the Places menu if it exists
function addTeleportEntry() {
  const menuList = document.querySelector('#teleportMenuList') ||
    [...document.querySelectorAll('div')].find(d =>
      d.style.cssText.includes('backdrop-filter') &&
      d.style.minWidth === '170px' &&
      d.children.length > 2
    );
  if (!menuList) return;
  const item = document.createElement('div');
  item.textContent = '⛏️ The Mine';
  item.style.cssText = `padding:11px 18px;color:white;font-family:sans-serif;
    font-size:14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.08);
    transition:background 0.15s;`;
  item.addEventListener('mouseover', () => item.style.background='rgba(255,255,255,0.15)');
  item.addEventListener('mouseout',  () => item.style.background='transparent');
  const go = () => {
    const cam = CAM(); if (!cam) return;
    cam.position.set(-68, 1.7, -47);
  };
  item.addEventListener('click',    go);
  item.addEventListener('touchend', go);
  menuList.appendChild(item);
}

// ── INIT ──────────────────────────────────────────────────────────────────
function init() {
  buildMineArea();
  addTeleportEntry();

  // Expose inventory updater so workshop-client can sync the HUD
  window._mineSetInventory = (data) => {
    if (data.ore      !== undefined) inventory.ore      = data.ore;
    if (data.bars     !== undefined) inventory.bars     = data.bars;
    if (data.bagSize  !== undefined) inventory.bagSize  = data.bagSize;
    if (data.tools    !== undefined && Array.isArray(data.tools)) inventory.tools = data.tools;
    window._mineInventory = inventory; // keep global in sync
    updateMineHUD();
  };
  window._mineInventory = inventory; // expose immediately

  // Expose colliders array so workshop-client can add building walls
  window._mineColliders     = window._mineColliders     || [];
  window._mineCircColliders = window._mineCircColliders || [];

  // Poll for socket (player might not have joined yet)
  const _poll = setInterval(() => {
    if (SKT() && SID()) { setupSocketEvents(); clearInterval(_poll); }
  }, 800);

  // Private animation loop
  let last = performance.now();
  (function loop() {
    requestAnimationFrame(loop);
    const now = performance.now();
    tick(Math.min((now - last) / 1000, 0.05));
    last = now;
  })();

}

// Wait for main.dev.js to populate the bridge before touching scene
(function waitForBridge() {
  if (window._mineScene && window._mineCamera) {
    init();
  } else {
    setTimeout(waitForBridge, 100);
  }
})();
