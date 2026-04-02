// ─── workshop-client.js ─────────────────────────────────────────────────────
// APLabs Workshop — client side
// Append to main.dev.js bridge block:
//   import('./workshop-client.js');
// ────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';

// ── BRIDGE ────────────────────────────────────────────────────────────────────
const S       = () => window._mineScene;
const CAM     = () => window._mineCamera;
const SKT     = () => window._mineGetSocket?.();
const USR     = () => window._mineGetUsername?.() || '';
const SID     = () => window._mineGetSocketId?.();
const BLOCKED = () => window._mineIsBlocked?.() || false;
const NOTIFY  = (msg) => window._mineShowNotification?.(msg);

// ── WORKSHOP POSITION ────────────────────────────────────────────────────────
const WS_X = 80, WS_Z = -2;

// ── STATION INTERACTION ZONES ────────────────────────────────────────────────
const STATIONS = {
  foundry:  { x: WS_X + 2,  z: WS_Z - 5,  label: '🔥 Foundry',      key: 'foundry'  },
  anvil:    { x: WS_X + 2,  z: WS_Z,       label: '⚒️ Anvil',         key: 'anvil'    },
  assembly: { x: WS_X + 2,  z: WS_Z + 5,  label: '🤖 Assembly Bay',  key: 'assembly' },
};

// ── STATE ────────────────────────────────────────────────────────────────────
let wsState    = { ore:0, bars:0, tools:[], proficiency:0, recipes:{}, smeltRatio:2 };
let nearStation = null;
let wsUIOpen    = false;
let actionInProgress = false;

// ── THREE.JS HELPERS ─────────────────────────────────────────────────────────
function addMesh(geo, color, x, y, z, cast=true, emissive=null) {
  const mat = new THREE.MeshLambertMaterial({ color });
  if (emissive) { mat.emissive = new THREE.Color(emissive); mat.emissiveIntensity = 0.6; }
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true;
  S().add(m); return m;
}
const wb  = (w,h,d,c,x,y,z,cast=true,em=null) => addMesh(new THREE.BoxGeometry(w,h,d),c,x,y,z,cast,em);
const wc  = (rt,rb,h,s,c,x,y,z,cast=true)     => addMesh(new THREE.CylinderGeometry(rt,rb,h,s),c,x,y,z,cast);
const wcn = (r,h,s,c,x,y,z)                   => addMesh(new THREE.ConeGeometry(r,h,s),c,x,y,z);

// ── BUILD HANGAR ─────────────────────────────────────────────────────────────
function buildWorkshop() {
  const X = WS_X, Z = WS_Z;

  // Build into a group so we can rotate the whole thing
  const wsGroup = new THREE.Group();
  wsGroup.position.set(X, 0, Z);

  // Override helpers to add to group instead of scene, centered on origin
  function gbox(w,h,d,c,x,y,z,cast=true,em=null){
    const mat=new THREE.MeshLambertMaterial({color:c});
    if(em){mat.emissive=new THREE.Color(em);mat.emissiveIntensity=0.6;}
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    m.position.set(x-X,y,z-Z); m.castShadow=cast; m.receiveShadow=true;
    wsGroup.add(m); return m;
  }
  function gcyl(rt,rb,h,s,c,x,y,z,cast=true){
    const mat=new THREE.MeshLambertMaterial({color:c});
    const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,s),mat);
    m.position.set(x-X,y,z-Z); m.castShadow=cast; m.receiveShadow=true;
    wsGroup.add(m); return m;
  }

  // Rotate 90° so entrance faces west (-X), players coming from spawn face east into it
  wsGroup.rotation.y = -Math.PI / 2;
  S().add(wsGroup);

  // Reassign local helpers
  const wb  = gbox;
  const wc  = gcyl;

  // ── CONCRETE FLOOR SLAB ──
  wb(24, 0.25, 20, 0x888878, X, 0.12, Z, false);
  // Floor seam lines
  for(let i = -2; i <= 2; i++) {
    wb(24, 0.06, 0.12, 0x777767, X, 0.26, Z + i*3.5, false);
    wb(0.12, 0.06, 20, 0x777767, X + i*4.5, 0.26, Z, false);
  }

  // ── MAIN WALLS (corrugated metal look) ──
  // Back wall
  wb(24, 8, 0.4, 0x778899, X, 4, Z - 10, false);
  // Corrugation stripes on back wall
  for(let i = -5; i <= 5; i++) {
    wb(0.18, 8, 0.1, 0x667788, X + i*2.2, 4, Z - 10.1, false);
  }
  // Side walls
  wb(0.4, 8, 20, 0x778899, X - 12, 4, Z, false);
  wb(0.4, 8, 20, 0x778899, X + 12, 4, Z, false);
  // Side corrugation
  for(let i = -4; i <= 4; i++) {
    wb(0.1, 8, 0.18, 0x667788, X - 12.1, 4, Z + i*2.2, false);
    wb(0.1, 8, 0.18, 0x667788, X + 12.1, 4, Z + i*2.2, false);
  }

  // ── ROOF ──
  wb(25, 0.4, 21, 0x667788, X, 8.2, Z, false);
  // Roof ridge beam
  wb(25, 0.5, 0.5, 0x556677, X, 8.5, Z, false);
  // Support trusses inside
  for(let i = -2; i <= 2; i++) {
    wb(0.3, 0.3, 20, 0x556677, X + i*5, 7.8, Z, false);
    // Diagonal braces
    const brace = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 4, 0.2),
      new THREE.MeshLambertMaterial({ color: 0x445566 })
    );
    brace.position.set(i*5, 6, 0);
    brace.rotation.z = 0.5; wsGroup.add(brace);
  }

  // ── FRONT FACADE — big sliding door opening ──
  // Left panel
  wb(6, 8, 0.4, 0x778899, X - 9, 4, Z + 10, false);
  for(let i = -1; i <= 1; i++) wb(0.18, 8, 0.1, 0x667788, X - 9 + i*2, 4, Z + 10.1, false);
  // Right panel
  wb(6, 8, 0.4, 0x778899, X + 9, 4, Z + 10, false);
  for(let i = -1; i <= 1; i++) wb(0.18, 8, 0.1, 0x667788, X + 9 + i*2, 4, Z + 10.1, false);
  // Header above door opening
  wb(12, 1.2, 0.5, 0x667788, X, 7.6, Z + 10, false);
  // Door rail
  wb(24, 0.22, 0.28, 0x445566, X, 7.0, Z + 10.15, false);

  // ── DOOR PANELS (partially slid open) ──
  wb(4.5, 6.5, 0.25, 0x556677, X - 9.5, 3.75, Z + 10.2, false);
  for(let i=0;i<3;i++) wb(0.15,6.5,0.1,0x445566, X-8.0+i*0.8, 3.75, Z+10.3, false);
  wb(4.5, 6.5, 0.25, 0x556677, X + 9.5, 3.75, Z + 10.2, false);
  for(let i=0;i<3;i++) wb(0.15,6.5,0.1,0x445566, X+8.0+i*0.8, 3.75, Z+10.3, false);

  // ── SIGN ABOVE DOOR ──
  wb(10, 1.4, 0.3, 0x1a1a2e, X, 8.8, Z + 10.2, false);
  wb(9.6, 1.0, 0.12, 0xFF5500, X, 8.8, Z + 10.3, false);
  // WORKSHOP text blocks
  [-3.5,-2.5,-1.5,-0.5,0.5,1.5,2.5,3.5].forEach((tx, i) => {
    wb(0.7, 0.6, 0.15,
      [0xFFCC00,0xFF8800,0xFFCC00,0xFF8800,0xFFCC00,0xFF8800,0xFFCC00,0xFF8800][i],
      X + tx, 8.8, Z + 10.38, false);
  });
  wb(9.8, 0.15, 0.18, 0xFFCC00, X, 9.45, Z + 10.35, false);
  wb(9.8, 0.15, 0.18, 0xFFCC00, X, 8.12, Z + 10.35, false);

  // ── OUTDOOR LAMP POSTS ──
  [X - 8, X + 8].forEach(lx => {
    wc(0.06,0.06,5,6,0x888888,lx,2.5,Z+11.5,false);
    wb(2,0.1,0.1,0x888888,lx,5.1,Z+11.5,false);
    wc(0.2,0.2,0.3,8,0xFFFF99,lx+0.9,5.0,Z+11.5,false);
  });

  // ── PATH FROM MAIN ROAD ──
  wb(3, 0.08, 12, 0x7A6E5A, X, 0.05, Z + 16, false);

  // ── FOUNDRY STATION ──────────────────────────────────────────────────────
  const FX = X - 5, FZ = Z;
  // Base platform
  wb(3.5, 0.35, 3.5, 0x554433, FX, 0.17, FZ, false);
  // Furnace body — squat brick cylinder
  wc(1.1, 1.2, 1.8, 10, 0x664433, FX, 1.15, FZ, false);
  // Brick rings
  for(let i=0;i<4;i++) wc(1.12,1.12,0.12,10,0x553322,FX,0.3+i*0.45,FZ,false);
  // Furnace top rim
  wc(1.15,0.9,0.35,10,0x443322,FX,2.1,FZ,false);
  // Chimney
  wc(0.32,0.35,2.2,8,0x444433,FX,3.2,FZ,false);
  wc(0.38,0.38,0.18,8,0x333322,FX,4.35,FZ,false);
  // Fire glow inside — emissive orange
  wb(0.6,0.5,0.6,0xFF4400,FX,0.6,FZ,false,0xFF2200);
  // Fire light particles (static glowing spheres)
  [[0.2,0.9,0.1],[0.2,0.85,0.2],[0,1.1,0.15]].forEach(([ox,oy,oz]) => {
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.12,5,5),
      new THREE.MeshBasicMaterial({ color:0xFF8800, transparent:true, opacity:0.8 })
    );
    flame.position.set((FX-X)+ox, oy, (FZ-Z)+oz);
    flame.userData.isFlame = true;
    flame.userData.phase   = Math.random()*Math.PI*2;
    wsGroup.add(flame);
  });
  // Smoke pipe cap
  wc(0.42,0.42,0.1,8,0x333322,FX,4.46,FZ,false);
  // Station label plate
  wb(2.4,0.55,0.12,0x221100,FX,2.7,FZ+1.3,false);
  wb(2.2,0.35,0.15,0xFF4400,FX,2.7,FZ+1.38,false);
  // Ore hopper chute
  wb(0.6,0.5,0.5,0x885522,FX-0.8,1.8,FZ-0.6,false);
  wb(0.15,1.0,0.15,0x996633,FX-1.1,1.35,FZ-0.6,false);

  // ── ANVIL STATION ─────────────────────────────────────────────────────────
  const AX = X, AZ = Z - 3;
  // Workbench
  wb(3.2, 0.9, 2.0, 0x8B6644, AX, 0.45, AZ, false);
  wb(3.4, 0.12, 2.2, 0xAA8855, AX, 0.92, AZ, false);
  // Bench legs
  [[-1.4,-0.8],[1.4,-0.8],[-1.4,0.8],[1.4,0.8]].forEach(([lx,lz]) => {
    wb(0.12,0.9,0.12,0x664422,AX+lx,0.45,AZ+lz,false);
  });
  // Anvil itself — classic double-humped shape
  wb(1.4, 0.28, 0.7, 0x333333, AX, 1.17, AZ, false);   // body
  wb(1.0, 0.18, 0.5, 0x444444, AX, 1.37, AZ, false);   // top face
  wb(0.35,0.55,0.5, 0x333333, AX-0.35,0.92,AZ,false);  // left leg
  wb(0.35,0.55,0.5, 0x333333, AX+0.35,0.92,AZ,false);  // right leg
  // Horn
  const horn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05,0.2,0.65,6),
    new THREE.MeshLambertMaterial({color:0x333333})
  );
  horn.rotation.z = Math.PI/2;
  horn.position.set((AX-X)+0.95, 1.28, AZ-Z);
  wsGroup.add(horn);
  // Hammer resting on anvil
  wb(0.12,0.12,0.55,0x8B6644,AX-0.2,1.5,AZ-0.1,false); // handle
  wb(0.38,0.22,0.22,0x555555,AX-0.2,1.5,AZ+0.18,false); // head
  // Tool rack on wall behind anvil
  wb(2.8,0.12,0.15,0x8B6644,AX,2.5,AZ-1.0,false);
  // Hanging tools
  [[-0.8,1.8,'wrench'],[0,1.8,'hammer'],[0.8,1.8,'tongs']].forEach(([tx,ty,type]) => {
    wb(0.08,0.55,0.12,0x666666,AX+tx,ty,AZ-1.06,false);
    wb(0.25,0.12,0.12,0x666666,AX+tx,ty+0.25,AZ-1.06,false);
  });

  // ── ASSEMBLY BAY ──────────────────────────────────────────────────────────
  const ABX = X + 5, ABZ = Z;
  // Raised platform
  wb(4.5, 0.4, 4.5, 0x334455, ABX, 0.2, ABZ, false);
  // Assembly frame — 4 corner posts
  [[-1.8,-1.8],[1.8,-1.8],[-1.8,1.8],[1.8,1.8]].forEach(([px,pz]) => {
    wc(0.1,0.1,4.5,6,0x4466AA,ABX+px,2.25,ABZ+pz,false);
    wb(0.35,0.35,0.35,0x5577BB,ABX+px,4.6,ABZ+pz,false);
  });
  // Cross beams
  wb(3.8,0.18,0.18,0x4466AA,ABX,4.6,ABZ-1.8,false);
  wb(3.8,0.18,0.18,0x4466AA,ABX,4.6,ABZ+1.8,false);
  wb(0.18,0.18,3.8,0x4466AA,ABX-1.8,4.6,ABZ,false);
  wb(0.18,0.18,3.8,0x4466AA,ABX+1.8,4.6,ABZ,false);
  // Dangling chain/hoist
  wc(0.06,0.06,1.8,4,0x888888,ABX,3.7,ABZ,false);
  // Chain links
  for(let i=0;i<5;i++) {
    wb(0.14,0.1,0.08,0x999999,ABX,2.9-i*0.28,ABZ,false);
  }
  // Hook
  const hook = new THREE.Mesh(
    new THREE.TorusGeometry(0.12,0.04,6,12,Math.PI),
    new THREE.MeshLambertMaterial({color:0x777777})
  );
  hook.rotation.x = Math.PI/2;
  hook.position.set(ABX-X, 1.55, ABZ-Z);
  wsGroup.add(hook);

  // ── LOCK OVERLAY on Assembly Bay (visual — locked until wrench crafted) ──
  const lockMesh = new THREE.Mesh(
    new THREE.BoxGeometry(4.6,4.6,4.6),
    new THREE.MeshBasicMaterial({
      color:0x000033, transparent:true, opacity:0.35,
      side:THREE.BackSide
    })
  );
  lockMesh.position.set(ABX-X, 2.5, ABZ-Z);
  wsGroup.add(lockMesh);
  window._wsLockMesh = lockMesh;

  // Lock icon post
  wc(0.05,0.05,2.5,4,0x4466AA,ABX,1.25,ABZ+2.4,false);
  const lockSign = wb(1.4,1.0,0.18,0x111133,ABX,2.8,ABZ+2.52,false);
  window._wsLockSign = lockSign;

  // ── MISC WORKSHOP PROPS ──────────────────────────────────────────────────
  // Metal shelving
  wb(0.12,3,1.4,0x556677,X-11.5,1.5,Z-3,false);
  [0.8,1.8,2.8].forEach(sy => wb(1.5,0.1,1.4,0x667788,X-10.8,sy,Z-3,false));
  // Barrels
  [[X+10,Z-4],[X+10,Z-2],[X+10.8,Z-3.2]].forEach(([bx,bz]) => {
    wc(0.38,0.4,0.85,8,0x775533,bx,0.42,bz,false);
    wc(0.4,0.4,0.08,8,0x664422,bx,0.05,bz,false);
    wc(0.4,0.4,0.08,8,0x664422,bx,0.82,bz,false);
  });
  // Scrap pile
  [[X-10,Z+5],[X-9.2,Z+4.5],[X-10.5,Z+4.2]].forEach(([sx,sz]) => {
    wb(0.6+Math.random()*0.4, 0.3+Math.random()*0.3, 0.5+Math.random()*0.3,
      0x556655, sx, 0.2, sz, false);
  });
  // Central work light
  wc(0.05,0.05,1.2,4,0x888888,X,7.5,Z,false);
  wb(0.6,0.1,0.6,0x777777,X,6.85,Z,false);
  wb(0.5,0.18,0.5,0xFFFF99,X,6.72,Z,false,0xFFEE66);

  console.log('[Workshop Client] Hangar built at x=38, z=-28');

  // ── WALL COLLIDERS ───────────────────────────────────────────────────────
  // After 90° rotation: original Z-axis becomes X-axis
  // Entrance (was south/+Z) now faces west (-X)
  function addWallColliders() {
    const col = window.colliders;
    if (!col) { setTimeout(addWallColliders, 500); return; }
    const cx = WS_X, cz = WS_Z;
    // Back wall (east side, +X)
    col.push({ minX: cx+9.8,  maxX: cx+10.2, minZ: cz-12, maxZ: cz+12 });
    // North wall
    col.push({ minX: cx-10,   maxX: cx+10,   minZ: cz-12.2, maxZ: cz-11.8 });
    // South wall
    col.push({ minX: cx-10,   maxX: cx+10,   minZ: cz+11.8, maxZ: cz+12.2 });
    // Left door panel (entrance west side, -X)
    col.push({ minX: cx-10.2, maxX: cx-9.8,  minZ: cz+6,   maxZ: cz+12 });
    // Right door panel
    col.push({ minX: cx-10.2, maxX: cx-9.8,  minZ: cz-12,  maxZ: cz-6 });
  }
  addWallColliders();
}

// ── WORKSHOP UI ───────────────────────────────────────────────────────────────
const wsOverlay = document.createElement('div');
wsOverlay.style.cssText = `
  position:fixed;inset:0;background:rgba(5,8,20,0.96);color:white;
  font-family:'Segoe UI',sans-serif;z-index:300;display:none;
  align-items:center;justify-content:center;overflow-y:auto;
`;
document.body.appendChild(wsOverlay);

// ── PROGRESS RING (reused for smelt + craft) ──────────────────────────────────
const wsProgressBox = document.createElement('div');
wsProgressBox.style.cssText = `
  position:fixed;bottom:180px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,0.88);border:2px solid rgba(255,140,0,0.8);
  border-radius:16px;padding:14px 28px;display:none;z-index:400;
  font-family:sans-serif;text-align:center;min-width:200px;
  box-shadow:0 0 20px rgba(255,140,0,0.35);pointer-events:none;
`;
wsProgressBox.innerHTML = `
  <div style="position:relative;width:52px;height:52px;margin:0 auto 10px;">
    <svg width="52" height="52" style="transform:rotate(-90deg);">
      <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="4"/>
      <circle id="wsProgressRing" cx="26" cy="26" r="22" fill="none"
        stroke="#FF8C00" stroke-width="4" stroke-linecap="round"
        stroke-dasharray="138" stroke-dashoffset="138"
        style="transition:stroke-dashoffset 0.08s linear;"/>
    </svg>
    <div id="wsProgressIcon" style="position:absolute;inset:0;display:flex;
      align-items:center;justify-content:center;font-size:22px;">🔥</div>
  </div>
  <div id="wsProgressLabel" style="color:#FF8C00;font-size:13px;font-weight:bold;
    letter-spacing:0.05em;">SMELTING...</div>
`;
document.body.appendChild(wsProgressBox);

let wsActionTimer = null;

function startWSAction({ duration, icon, label, color, onComplete }) {
  if (actionInProgress) return;
  actionInProgress = true;

  const ring   = document.getElementById('wsProgressRing');
  const lbl    = document.getElementById('wsProgressLabel');
  const ico    = document.getElementById('wsProgressIcon');
  const circumference = 138;

  if (ring)  { ring.style.stroke = color; ring.style.strokeDashoffset = circumference; }
  if (lbl)   { lbl.textContent = label; lbl.style.color = color; }
  if (ico)   ico.textContent = icon;
  wsProgressBox.style.display = 'block';

  let elapsed = 0;
  const tick  = 60;

  wsActionTimer = setInterval(() => {
    elapsed += tick / 1000;
    const pct = Math.min(elapsed / duration, 1);
    if (ring) ring.style.strokeDashoffset = circumference * (1 - pct);

    if (pct >= 1) {
      clearInterval(wsActionTimer); wsActionTimer = null;
      if (lbl)  lbl.textContent = '...';
      if (ico)  ico.textContent = '⏳';
      onComplete();
    }
  }, tick);
}

function finishWSAction({ success, icon, label, color }) {
  const ring  = document.getElementById('wsProgressRing');
  const lbl   = document.getElementById('wsProgressLabel');
  const ico   = document.getElementById('wsProgressIcon');
  if (ring)  { ring.style.stroke = color; ring.style.strokeDashoffset = '0'; }
  if (lbl)   { lbl.textContent = label; lbl.style.color = color; }
  if (ico)   ico.textContent = icon;

  if (success) playSuccessChime(); else playFailThud();

  setTimeout(() => {
    wsProgressBox.style.display = 'none';
    const r = document.getElementById('wsProgressRing');
    if (r) r.style.strokeDashoffset = '138';
    actionInProgress = false;
    renderWSUI(); // refresh counts
  }, 700);
}

// ── RENDER WORKSHOP UI ────────────────────────────────────────────────────────
function renderWSUI(activeStation = 'foundry') {
  if (!wsUIOpen) return;
  const s = wsState;
  const hasWrench = (s.tools || []).includes('wrench');

  wsOverlay.innerHTML = `
    <div style="max-width:520px;width:100%;padding:24px;box-sizing:border-box;">

      <!-- Header -->
      <div style="text-align:center;margin-bottom:18px;">
        <div style="font-size:2rem;">🏭</div>
        <h2 style="margin:4px 0;color:#FF8C00;">Astropelion Workshop</h2>
        <div style="display:flex;justify-content:center;gap:18px;margin-top:8px;
          font-size:0.85rem;opacity:0.7;">
          <span>⛏️ ${s.ore} ore</span>
          <span id="wsHeaderBars">🔶 ${s.bars} bars</span>
          ${s.tools?.length ? `<span>🔧 ${s.tools.join(', ')}</span>` : ''}
        </div>
      </div>

      <!-- Station tabs -->
      <div style="display:flex;gap:6px;margin-bottom:18px;">
        ${Object.entries(STATIONS).map(([k,st]) => `
          <button onclick="window.wsTab('${k}')"
            style="flex:1;padding:9px 6px;border-radius:10px;cursor:pointer;font-size:13px;
            font-weight:bold;border:2px solid ${activeStation===k?'#FF8C00':'rgba(255,255,255,0.15)'};
            background:${activeStation===k?'rgba(255,140,0,0.2)':'rgba(255,255,255,0.05)'};
            color:white;">
            ${st.label}
          </button>`).join('')}
      </div>

      <!-- Station content -->
      ${activeStation === 'foundry' ? `
        <div style="background:rgba(255,100,0,0.08);border:1px solid rgba(255,100,0,0.3);
          border-radius:14px;padding:20px;margin-bottom:14px;">
          <div style="font-size:1.1rem;font-weight:bold;margin-bottom:8px;">🔥 Foundry</div>
          <div style="opacity:0.65;font-size:0.85rem;margin-bottom:14px;line-height:1.7;">
            Smelt ore into bars. Bars are used to craft tools and build robots.
          </div>

          ${s.smeltBatch >= 2 ? `
            <div style="background:rgba(255,200,0,0.12);border:1px solid rgba(255,200,0,0.3);
              border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:0.82rem;color:#FFD700;">
              🔥 Smelt Mastery — smelting <strong>2 bars at once!</strong>
            </div>` : `
            <div style="margin-bottom:12px;">
              <div style="display:flex;justify-content:space-between;font-size:0.78rem;opacity:0.55;margin-bottom:4px;">
                <span>Smelt mastery progress</span>
                <span>${s.totalSmelted || 0}/10 bars</span>
              </div>
              <div style="background:rgba(0,0,0,0.4);border-radius:4px;height:6px;overflow:hidden;">
                <div style="background:linear-gradient(90deg,#FF6600,#FFaa00);height:100%;
                  width:${Math.min(100, ((s.totalSmelted||0)/10)*100)}%;transition:width 0.4s;"></div>
              </div>
            </div>`}

          <div style="font-size:1.3rem;text-align:center;margin-bottom:14px;">
            ⛏️ ${s.ore} ore &nbsp;→&nbsp; 🔶 ${Math.floor(s.ore / (s.smeltRatio||2))} possible
            ${s.smeltBatch >= 2 ? '<span style="color:#FFD700;font-size:0.8rem;"> (×2)</span>' : ''}
          </div>
          ${(() => {
            const maxBatch = s.smeltBatch || 1;
            const actualBatch = Math.min(maxBatch, Math.floor(s.ore / (s.smeltRatio||2)));
            const canSmelt = actualBatch >= 1;
            const label = actualBatch > 1
              ? `Smelt (${(s.smeltRatio||2)*actualBatch} ore → ${actualBatch} bars)`
              : `Smelt (${s.smeltRatio||2} ore → 1 bar)`;
            return `<button onclick="window.wsSmelt()"
              ${!canSmelt ? 'disabled style="opacity:0.35;cursor:not-allowed;"' : ''}
              style="width:100%;background:#CC4400;color:white;border:none;border-radius:10px;
              padding:13px;font-size:15px;font-weight:bold;cursor:${canSmelt?'pointer':'not-allowed'};">
              ${canSmelt ? label : `Need ${s.smeltRatio||2} ore to smelt`}
            </button>`;
          })()}
        </div>
      ` : activeStation === 'anvil' ? `
        <div style="background:rgba(100,100,150,0.08);border:1px solid rgba(150,150,200,0.3);
          border-radius:14px;padding:20px;margin-bottom:14px;">
          <div style="font-size:1.1rem;font-weight:bold;margin-bottom:8px;">⚒️ Anvil</div>
          <div style="opacity:0.65;font-size:0.85rem;margin-bottom:14px;">
            Craft tools using bars. Tools unlock new capabilities.
          </div>
          ${Object.entries(s.recipes || {}).map(([id, recipe]) => {
            const owned = (s.tools||[]).includes(id);
            const canAfford = s.bars >= recipe.barCost;
            const prereqsMet = (recipe.requires||[]).every(r => (s.tools||[]).includes(r));
            return `
              <div style="background:rgba(255,255,255,0.05);border:1px solid
                ${owned?'rgba(100,255,100,0.3)':canAfford&&prereqsMet?'rgba(255,200,0,0.3)':'rgba(255,255,255,0.1)'};
                border-radius:10px;padding:14px;margin-bottom:10px;display:flex;
                align-items:center;justify-content:space-between;gap:12px;">
                <div>
                  <div style="font-weight:bold;font-size:0.95rem;">
                    ${id==='wrench'?'🔧':id==='hammer'?'🔨':'🛠️'} ${recipe.name}
                  </div>
                  <div style="opacity:0.55;font-size:0.78rem;margin-top:2px;">${recipe.desc||''}</div>
                  ${!prereqsMet?`<div style="color:#FF8844;font-size:0.75rem;margin-top:3px;">
                    Requires: ${recipe.requires.join(', ')}</div>`:''}
                </div>
                <div style="text-align:right;flex-shrink:0;">
                  <div style="color:#FFD700;font-size:0.85rem;margin-bottom:6px;">
                    ${recipe.barCost} bars
                  </div>
                  ${owned
                    ? `<div style="color:#44FF88;font-size:0.8rem;font-weight:bold;">✓ Owned</div>`
                    : `<button onclick="window.wsCraft('${id}')"
                        ${(!canAfford||!prereqsMet)?'disabled style="opacity:0.35;cursor:not-allowed;"':''}
                        style="background:#445588;color:white;border:none;border-radius:8px;
                        padding:7px 16px;cursor:pointer;font-size:13px;font-weight:bold;">
                        Craft</button>`
                  }
                </div>
              </div>`;
          }).join('')}

          <!-- Robot Parts — craft components for the Assembly Bay -->
          <div style="background:rgba(0,30,60,0.4);border:1px solid rgba(0,150,255,0.2);
            border-radius:12px;padding:14px;margin-top:14px;">
            <div style="font-weight:bold;margin-bottom:6px;font-size:0.9rem;color:#88CCFF;">
              🤖 Robot Parts
            </div>
            <div style="opacity:0.55;font-size:0.76rem;margin-bottom:10px;line-height:1.6;">
              Craft individual parts and save them for later.<br>
              Parts are stored — craft one at a time as you earn bars.
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
              ${[['head',2,'🦾','Head'],['torso',5,'🫀','Torso'],['bottom',3,'🦵','Bottom']].map(([part,cost,icon,label])=>{
                const canAffordPart = s.bars >= cost;
                const owned = window._myRobotParts?.[part] >= 1;
                return owned
                  ? `<div style="background:rgba(0,200,80,0.15);
                      border:2px solid rgba(0,255,100,0.6);
                      border-radius:10px;padding:10px 6px;
                      font-size:13px;text-align:center;position:relative;">
                      <div style="font-size:1.4rem;">${icon}</div>
                      <div style="font-size:0.8rem;margin-top:2px;color:#44FF88;">${label}</div>
                      <div style="font-size:1.6rem;color:#44FF88;font-weight:bold;margin-top:2px;">✓</div>
                      <div style="font-size:0.7rem;color:#44FF88;opacity:0.7;">Ready</div>
                    </div>`
                  : `<button data-rbpart="${part}" onclick="window._rbCraftPart('${part}')"
                      ${!canAffordPart?'disabled':''}
                      style="background:${canAffordPart?'#112244':'rgba(255,255,255,0.04)'};
                      color:white;border:1px solid ${canAffordPart?'rgba(0,200,255,0.4)':'rgba(255,255,255,0.1)'};
                      border-radius:10px;padding:10px 6px;cursor:${canAffordPart?'pointer':'not-allowed'};
                      font-size:13px;text-align:center;opacity:${canAffordPart?'1':'0.4'};">
                      <div style="font-size:1.4rem;">${icon}</div>
                      <div style="font-size:0.8rem;margin-top:2px;">${label}</div>
                      <div style="color:#FFD700;font-size:0.78rem;font-weight:bold;">${cost} bars</div>
                    </button>`;
              }).join('')}
            </div>
          </div>
        </div>
      ` : `
        <!-- Assembly Bay -->
        <div style="background:rgba(0,50,100,0.15);border:1px solid rgba(50,100,200,0.3);
          border-radius:14px;padding:24px;margin-bottom:14px;text-align:center;">
          <div style="font-size:2.5rem;margin-bottom:10px;">${hasWrench ? '🤖' : '🔒'}</div>
          <div style="font-size:1.1rem;font-weight:bold;margin-bottom:8px;">
            ${hasWrench ? 'Assembly Bay' : 'Assembly Bay — Locked'}
          </div>
          ${hasWrench
            ? `<div style="opacity:0.7;font-size:0.9rem;line-height:1.7;">
                Place your crafted parts and build your robot.<br>
                <button onclick="window._openAssemblyBay?.()"
                  style="margin-top:12px;background:#0044CC;color:white;border:none;
                  border-radius:10px;padding:12px 28px;font-size:14px;font-weight:bold;cursor:pointer;">
                  ⚙️ Open Robot Builder
                </button>
               </div>`
            : `<div style="opacity:0.6;font-size:0.85rem;line-height:1.8;">
                Craft a <strong style="color:#FF8C00;">Wrench</strong> at the Anvil<br>
                to unlock robot construction.
               </div>`
          }
      `}

      <!-- Close -->
      <button onclick="window.closeWorkshop()"
        style="width:100%;background:rgba(255,255,255,0.07);color:white;
        border:1px solid rgba(255,255,255,0.15);border-radius:10px;
        padding:10px;cursor:pointer;font-size:13px;">
        Leave Workshop
      </button>
    </div>
  `;
}

// ── WINDOW ACTIONS ────────────────────────────────────────────────────────────
window.wsTab = (tab) => { renderWSUI(tab); };
window._wsIsOpen = () => wsUIOpen;
window._wsNearStation = () => nearStation;

window.wsSmelt = () => {
  if (actionInProgress) return;
  wsOverlay.style.display = 'none'; // hide UI during action
  startWSAction({
    duration: 2.5,
    icon:  '🔥',
    label: 'SMELTING...',
    color: '#FF8C00',
    onComplete: () => SKT()?.emit('workshop:smelt'),
  });
};

window.wsCraft = (toolId) => {
  if (actionInProgress) return;
  wsOverlay.style.display = 'none';
  startWSAction({
    duration: 3.0,
    icon:  '⚒️',
    label: 'CRAFTING...',
    color: '#AABBFF',
    onComplete: () => SKT()?.emit('workshop:craft', { toolId }),
  });
};

window.closeWorkshop = () => {
  wsOverlay.style.display = 'none';
  wsUIOpen = false;
  if (window._mineIsBlocked) window._wsOpen = false;
};

// ── WORKSHOP PROMPT ───────────────────────────────────────────────────────────
const wsPrompt = document.createElement('div');
wsPrompt.style.cssText = `
  position:fixed;bottom:110px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,0.72);color:white;padding:12px 28px;border-radius:12px;
  font-family:sans-serif;font-size:15px;border:1px solid rgba(255,140,0,0.5);
  backdrop-filter:blur(8px);display:none;z-index:100;cursor:pointer;user-select:none;
  box-shadow:0 0 12px rgba(255,140,0,0.25);
`;
wsPrompt.addEventListener('click',    () => openNearestStation());
wsPrompt.addEventListener('touchend', e => { e.preventDefault(); openNearestStation(); }, { passive:false });
document.body.appendChild(wsPrompt);

// ── OPEN STATION ──────────────────────────────────────────────────────────────
function openNearestStation() {
  if (BLOCKED() && !wsUIOpen) return;
  if (!nearStation) return;
  if (actionInProgress) return;

  // Check assembly bay lock
  if (nearStation === 'assembly' && !(wsState.tools||[]).includes('wrench')) {
    NOTIFY('🔒 Assembly Bay locked — craft a Wrench at the Anvil first!');
    return;
  }

  wsUIOpen = true;
  wsOverlay.style.display = 'flex';
  SKT()?.emit('workshop:getState');
  renderWSUI(nearStation);

  if (window._wsOpen !== undefined) window._wsOpen = true;
  if (document.pointerLockElement) document.exitPointerLock();
}

// ── SOUNDS ────────────────────────────────────────────────────────────────────
function playSuccessChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const g   = ctx.createGain();
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+1.0);
    [880, 1320, 1760].forEach((f,i) => {
      const o = ctx.createOscillator(); o.type='sine';
      o.frequency.value = f;
      const g2 = ctx.createGain(); g2.gain.value = 1/(i+1);
      o.connect(g2); g2.connect(g); o.start(ctx.currentTime+i*0.08);
      o.stop(ctx.currentTime+1.0);
    });
    g.connect(ctx.destination);
    setTimeout(()=>ctx.close(),1200);
  } catch(e){}
}

function playFailThud() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = ctx.createBuffer(1, ctx.sampleRate*0.2, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.exp(-i/(ctx.sampleRate*0.05));
    const src = ctx.createBufferSource(); src.buffer=buf;
    const g   = ctx.createGain(); g.gain.value=0.5;
    const f   = ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=250;
    src.connect(f); f.connect(g); g.connect(ctx.destination); src.start();
    setTimeout(()=>ctx.close(),500);
  } catch(e){}
}

// ── SOCKET EVENTS ─────────────────────────────────────────────────────────────
function setupSocketEvents() {
  const skt = SKT(); if (!skt) return;

  skt.on('workshop:state', data => {
    wsState = { ...wsState, ...data };
    // Update assembly bay lock visual
    updateAssemblyLock();
    if (wsUIOpen) renderWSUI(nearStation || 'foundry');
  });

  skt.on('workshop:result', data => {
    // Always sync the mining HUD with latest counts
    window._mineSetInventory?.({
      ore:     data.ore,
      bars:    data.bars,
      tools:   data.tools,
      bagSize: data.bagSize,
    });

    wsState.ore          = data.ore          ?? wsState.ore;
    wsState.bars         = data.bars         ?? wsState.bars;
    wsState.tools        = data.tools        ?? wsState.tools;
    wsState.smeltBatch   = data.smeltBatch   ?? wsState.smeltBatch;
    wsState.totalSmelted = data.totalSmelted ?? wsState.totalSmelted;

    // Always refresh header bar count immediately — no wait for full re-render
    const headerBars = document.getElementById('wsHeaderBars');
    if (headerBars && data.bars !== undefined) headerBars.textContent = `🔶 ${data.bars} bars`;

    if (data.success) {
      if (data.action === 'smelt') {
        const label = data.barsGained > 1 ? `${data.barsGained} BARS!` : 'BAR READY!';
        finishWSAction({ success:true, icon:'🔶', label, color:'#FFD700' });
        NOTIFY(`🔶 Smelted! +${data.barsGained} bar${data.barsGained>1?'s':''}  (${data.bars} total)`);
        // Fanfare on unlock
        if (data.justUnlocked) {
          setTimeout(() => {
            NOTIFY('🔥 Smelt mastery! You can now smelt 2 bars at once!');
          }, 1000);
        }
      } else if (data.action === 'craft') {
        finishWSAction({ success:true, icon:'✨', label:'CRAFTED!', color:'#88FFAA' });
        NOTIFY(`✨ ${data.toolName} crafted!`);
        updateAssemblyLock();
        // Special wrench unlock fanfare
        if (data.toolId === 'wrench') {
          setTimeout(() => NOTIFY('🤖 Assembly Bay UNLOCKED! Time to build robots!'), 1200);
        }
      }
    } else {
      finishWSAction({ success:false, icon:'❌', label:'FAILED', color:'#FF4444' });
      NOTIFY('⚠️ ' + data.reason);
    }

    setTimeout(() => {
      wsOverlay.style.display = 'flex';
      renderWSUI(nearStation || 'foundry');
    }, 900);
  });

  skt.emit('workshop:getState');
  console.log('[Workshop Client] Socket events bound');
}

// ── ASSEMBLY LOCK VISUAL ──────────────────────────────────────────────────────
function updateAssemblyLock() {
  const hasWrench = (wsState.tools||[]).includes('wrench');
  if (window._wsLockMesh) window._wsLockMesh.visible = !hasWrench;
  if (window._wsLockSign) window._wsLockSign.visible = !hasWrench;
}

// ── UPDATE TICK ───────────────────────────────────────────────────────────────
function tick() {
  if (window._inStation) { wsPrompt.style.display = 'none'; return; }
  const cam = CAM(); if (!cam) return;

  // Find nearest station
  nearStation = null;
  let closest = 3.5;
  Object.entries(STATIONS).forEach(([key, st]) => {
    const dx = cam.position.x - st.x;
    const dz = cam.position.z - st.z;
    const d  = Math.sqrt(dx*dx + dz*dz);
    if (d < closest) { closest = d; nearStation = key; }
  });

  // Prompt
  if (!BLOCKED() && !wsUIOpen && !actionInProgress && nearStation) {
    const st = STATIONS[nearStation];
    wsPrompt.textContent   = `Press E for ${st.label}`;
    wsPrompt.style.display = 'block';
  } else {
    wsPrompt.style.display = 'none';
  }
}

// ── BLOCKED STATE includes wsUIOpen ──────────────────────────────────────────
// Patch the bridge so main.js E key doesn't fire while workshop is open
const _origBlocked = window._mineIsBlocked;
window._mineIsBlocked = () => (_origBlocked?.() || false) || wsUIOpen || actionInProgress;

// ── E KEY ─────────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.code === 'Escape') {
    if (wsUIOpen) { window.closeWorkshop(); return; }
    if (actionInProgress) return; // can't cancel a smelt
  }
  if (e.code !== 'KeyE') return;
  if (window._mineIsBlocked?.()) return;
  if (nearStation) openNearestStation();
});

// ── INIT ──────────────────────────────────────────────────────────────────────
function init() {
  buildWorkshop();

  // Add to Places menu
  const menuList = [...document.querySelectorAll('div')].find(d =>
    d.style.cssText?.includes('backdrop-filter') &&
    d.style.minWidth === '170px'
  );
  if (menuList) {
    const item = document.createElement('div');
    item.textContent = '🏭 Workshop';
    item.style.cssText = `padding:11px 18px;color:white;font-family:sans-serif;
      font-size:14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.08);
      transition:background 0.15s;`;
    item.addEventListener('mouseover', () => item.style.background='rgba(255,255,255,0.15)');
    item.addEventListener('mouseout',  () => item.style.background='transparent');
    const go = () => { const c=CAM(); if(c){c.position.set(WS_X-14, 1.7, WS_Z);} };
    item.addEventListener('click',    go);
    item.addEventListener('touchend', go);
    menuList.appendChild(item);
  }

  // Poll for socket
  const _poll = setInterval(() => {
    if (SKT() && SID()) { setupSocketEvents(); clearInterval(_poll); }
  }, 900);

  // Animation loop
  let last = performance.now();
  (function loop() {
    requestAnimationFrame(loop);
    const now = performance.now();
    tick();
    last = now;
  })();

  console.log('[Workshop Client] Initialized');
}

(function waitForBridge() {
  if (window._mineScene && window._mineCamera) init();
  else setTimeout(waitForBridge, 100);
})();
