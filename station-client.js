// station-client.js -- Station Alpha
// Self-contained 3D world. Own Three.js scene + renderer + canvas.
// Only accessible via space mission transition. No connection to earth map.

const ST_SKT    = () => window._mineGetSocket?.();
const ST_NOTIFY = (m) => window._mineShowNotification?.(m);

let stationActive = false;
let stRenderer, stScene, stCamera, stCanvas;
let stClock, stAnimId;
let stTime = 0;
let stNPCs = [];
let stYaw = 0, stPitch = 0, stIsLocked = false;
let stVelocityY = 0, stIsGrounded = true;
let stKeys = {};
const ST_GROUND_Y = 1.7;
let stPlayerPos = { x: 0, y: ST_GROUND_Y, z: 42 };
let stPlayerMesh = null;
const ST_GRAVITY  = 20;
const STATION_SPAWN = { x: 0, y: ST_GROUND_Y, z: 42 };


// ── HELPERS ───────────────────────────────────────────────────────────────────
const stColliders = [];
function addSTC(cx, cz, w, d) { stColliders.push({ minX:cx-w/2, maxX:cx+w/2, minZ:cz-d/2, maxZ:cz+d/2 }); }

function stBox(T, w, h, d, color, x, y, z, em, ei=0.5) {
  const mat = new T.MeshLambertMaterial({ color });
  if (em) { mat.emissive = new T.Color(em); mat.emissiveIntensity = ei; }
  const m = new T.Mesh(new T.BoxGeometry(w,h,d), mat);
  m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; stScene.add(m); return m;
}
function stCyl(T, rt, rb, h, seg, color, x, y, z, em, ei=0.5) {
  const mat = new T.MeshLambertMaterial({ color });
  if (em) { mat.emissive = new T.Color(em); mat.emissiveIntensity = ei; }
  const m = new T.Mesh(new T.CylinderGeometry(rt,rb,h,seg), mat);
  m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; stScene.add(m); return m;
}


// ── PLAYER CHARACTER MESH (third-person) ──────────────────────────────────────
function buildStationCharacter(T) {
  const g = new T.Group();

  const white   = new T.MeshLambertMaterial({color:0xDDEEFF});
  const offWhite= new T.MeshLambertMaterial({color:0xBBCCDD});
  const dark    = new T.MeshLambertMaterial({color:0x223344});
  const visor   = new T.MeshLambertMaterial({color:0x0066CC,transparent:true,opacity:0.75,emissive:new T.Color(0x002244),emissiveIntensity:0.5});
  const glow    = new T.MeshLambertMaterial({color:0x00AAFF,emissive:new T.Color(0x0088FF),emissiveIntensity:1.0});
  const gold    = new T.MeshLambertMaterial({color:0xCCAA44});

  // ── BOOTS ──
  [-0.13,0.13].forEach(lx=>{
    const boot=new T.Mesh(new T.BoxGeometry(0.2,0.12,0.22),offWhite);
    boot.position.set(lx,0.06,0.03); g.add(boot);
  });
  // ── LEGS ──
  const leftLeg =new T.Mesh(new T.BoxGeometry(0.18,0.65,0.18),white);
  leftLeg.position.set(-0.13,0.53,0); g.add(leftLeg);
  const rightLeg=new T.Mesh(new T.BoxGeometry(0.18,0.65,0.18),white);
  rightLeg.position.set( 0.13,0.53,0); g.add(rightLeg);
  // Knee pads
  [-0.13,0.13].forEach(lx=>{
    const kp=new T.Mesh(new T.BoxGeometry(0.2,0.1,0.22),offWhite);
    kp.position.set(lx,0.42,0.04); g.add(kp);
  });
  // ── TORSO ──
  const torso=new T.Mesh(new T.BoxGeometry(0.56,0.54,0.38),white);
  torso.position.set(0,1.08,0); g.add(torso);
  // Chest pack
  const pack=new T.Mesh(new T.BoxGeometry(0.3,0.28,0.1),offWhite);
  pack.position.set(0,1.12,0.24); g.add(pack);
  const dispLight=new T.Mesh(new T.BoxGeometry(0.12,0.06,0.06),glow);
  dispLight.position.set(0,1.19,0.3); g.add(dispLight);
  // Shoulder pads
  [-0.36,0.36].forEach(sx=>{
    const sp=new T.Mesh(new T.BoxGeometry(0.18,0.14,0.42),offWhite);
    sp.position.set(sx,1.27,0); g.add(sp);
    const ss=new T.Mesh(new T.BoxGeometry(0.19,0.06,0.43),gold);
    ss.position.set(sx,1.21,0); g.add(ss);
  });
  // ── ARMS ──
  const leftArm =new T.Mesh(new T.BoxGeometry(0.16,0.42,0.16),white);
  leftArm.position.set(-0.38,0.99,0); g.add(leftArm);
  const rightArm=new T.Mesh(new T.BoxGeometry(0.16,0.42,0.16),white);
  rightArm.position.set( 0.38,0.99,0); g.add(rightArm);
  // Gloves
  [-0.38,0.38].forEach(ax=>{
    const glove=new T.Mesh(new T.BoxGeometry(0.18,0.12,0.18),dark);
    glove.position.set(ax,0.74,0); g.add(glove);
  });
  // ── HELMET ──
  const helm=new T.Mesh(new T.BoxGeometry(0.52,0.5,0.5),white);
  helm.position.set(0,1.54,0); g.add(helm);
  const neckRing=new T.Mesh(new T.BoxGeometry(0.44,0.1,0.44),gold);
  neckRing.position.set(0,1.31,0); g.add(neckRing);
  const vis=new T.Mesh(new T.BoxGeometry(0.34,0.22,0.14),visor);
  vis.position.set(0,1.57,0.26); g.add(vis);
  const vFrame=new T.Mesh(new T.BoxGeometry(0.38,0.26,0.1),gold);
  vFrame.position.set(0,1.57,0.21); g.add(vFrame);
  const hTop=new T.Mesh(new T.BoxGeometry(0.1,0.06,0.1),glow);
  hTop.position.set(0,1.8,0.1); g.add(hTop);
  const ant=new T.Mesh(new T.BoxGeometry(0.04,0.2,0.04),offWhite);
  ant.position.set(0.18,1.89,0); g.add(ant);
  const antTip=new T.Mesh(new T.BoxGeometry(0.06,0.06,0.06),glow);
  antTip.position.set(0.18,2.01,0); g.add(antTip);

  // store refs for walk animation
  g.userData.leftLeg=leftLeg; g.userData.rightLeg=rightLeg;
  g.userData.leftArm=leftArm; g.userData.rightArm=rightArm;

  return g;
}

// ── INIT ──────────────────────────────────────────────────────────────────────
function initStationWorld() {
  const T = window.THREE;
  if (!T) { console.error("[Station] THREE not available"); return; }

  stCanvas = document.createElement("canvas");
  stCanvas.style.position = 'fixed';
  stCanvas.style.top = '0';
  stCanvas.style.left = '0';
  stCanvas.style.zIndex = '90';
  stCanvas.style.display = 'none';
  document.body.appendChild(stCanvas);

  stRenderer = new T.WebGLRenderer({ canvas: stCanvas, antialias: true });
  stRenderer.setSize(window.innerWidth, window.innerHeight);
  // Force canvas to fill screen after THREE sets its own dimensions
  stCanvas.style.width = window.innerWidth + 'px';
  stCanvas.style.height = window.innerHeight + 'px';
  stRenderer.shadowMap.enabled = true;
  stRenderer.shadowMap.type = T.PCFSoftShadowMap;
  stRenderer.setClearColor(0x000810);

  stScene = new T.Scene();
  stScene.fog = new T.Fog(0x000810, 40, 120);

  stCamera = new T.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 300);
  stCamera.position.set(STATION_SPAWN.x, STATION_SPAWN.y, STATION_SPAWN.z);

  stClock = new T.Clock();
  buildStationGeometry(T);
  setupStationLights(T);
  buildStationNPCs(T);

  window.addEventListener("resize", () => {
    stRenderer.setSize(window.innerWidth, window.innerHeight);
    stCanvas.style.width = window.innerWidth + 'px';
    stCanvas.style.height = window.innerHeight + 'px';
    stCamera.aspect = window.innerWidth/window.innerHeight;
    stCamera.updateProjectionMatrix();
  });

  // Pointer lock on canvas click
  stCanvas.style.pointerEvents = 'none';

  // Request pointer lock on document click when in station (not on UI elements)
  document.addEventListener('click', (e) => {
    if (!stationActive || stIsLocked) return;
    // Don't lock if any overlay menu is open
    if (document.getElementById('shipMenu') || document.getElementById('shipOB') ||
        document.getElementById('cmdOverlay') || window.shipMenuOpen) return;
    // Don't lock if clicking on a UI element tag
    const tag = e.target.tagName;
    if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT') return;
    // Don't lock if clicking inside any fixed UI panel
    if (e.target.closest('#stPlacesBtn2,#stPlacesList2,#stHint,#shipMenu,#shipOB,#cmdOverlay')) return;
    const zIndex = parseInt(window.getComputedStyle(e.target).zIndex) || 0;
    if (zIndex > 90) return;
    stCanvas.requestPointerLock();
  });
  document.addEventListener("pointerlockchange", () => {
    stIsLocked = document.pointerLockElement === stCanvas;
  });
  document.addEventListener("mousemove", e => {
    if (!stIsLocked || !stationActive) return;
    stYaw   -= e.movementX * 0.002;
    stPitch -= e.movementY * 0.002;
    stPitch  = Math.max(-Math.PI/3, Math.min(Math.PI/3, stPitch));
  });

  // ── MOBILE TOUCH CONTROLS ──────────────────────────────────────
  window._stJoy  = { active:false, id:null, startX:0, startY:0, dx:0, dy:0 };
  window._stLook = { active:false, id:null, startX:0, startY:0 };

  stCanvas.addEventListener("touchstart", function(e) {
    if (!stationActive) return;
    for (var i=0; i<e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.clientX < window.innerWidth * 0.45 && !window._stJoy.active)
        window._stJoy = { active:true, id:t.identifier, startX:t.clientX, startY:t.clientY, dx:0, dy:0 };
      else if (t.clientX >= window.innerWidth * 0.45 && !window._stLook.active)
        window._stLook = { active:true, id:t.identifier, startX:t.clientX, startY:t.clientY };
    }
  }, { passive:true });

  stCanvas.addEventListener("touchmove", function(e) {
    if (!stationActive) return;
    for (var i=0; i<e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier === window._stJoy.id) {
        window._stJoy.dx = (t.clientX - window._stJoy.startX) / 50;
        window._stJoy.dy = (t.clientY - window._stJoy.startY) / 50;
      }
      if (t.identifier === window._stLook.id) {
        stYaw   -= (t.clientX - window._stLook.startX) * 0.007;
        stPitch -= (t.clientY - window._stLook.startY) * 0.005;
        stPitch  = Math.max(-Math.PI/3, Math.min(Math.PI/3, stPitch));
        window._stLook.startX = t.clientX; window._stLook.startY = t.clientY;
      }
    }
  }, { passive:true });

  stCanvas.addEventListener("touchend", function(e) {
    for (var i=0; i<e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier === window._stJoy.id)  window._stJoy  = { active:false, id:null, startX:0, startY:0, dx:0, dy:0 };
      if (t.identifier === window._stLook.id) window._stLook = { active:false, id:null, startX:0, startY:0 };
    }
  }, { passive:true });


  // Build player character mesh for third-person view
  stPlayerMesh = buildStationCharacter(window.THREE);
  stPlayerMesh.position.set(STATION_SPAWN.x, 0, STATION_SPAWN.z);
  stScene.add(stPlayerMesh);

  console.log("[Station] World initialized");
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function buildStationGeometry(T) {
  // Floor
  const floor = new T.Mesh(new T.CylinderGeometry(52,52,0.4,32), new T.MeshLambertMaterial({color:0xBBCCDD}));
  floor.position.set(0,0.2,0); floor.receiveShadow=true; stScene.add(floor);
  for (let i=-48; i<=48; i+=8) { stBox(T,96,0.05,0.18,0x8899AA,i,0.43,0); stBox(T,0.18,0.05,96,0x8899AA,0,0.43,i); }

  // Loading dock corridor
  stBox(T,10,0.4,65,0x778899,0,0.2,61);
  stBox(T,1,9,65,0x445566,-6,4.5,61); stBox(T,1,9,65,0x445566,6,4.5,61);
  for (let i=0;i<8;i++) {
    stBox(T,10,0.3,0.5,0x334455,0,9,29+i*7);
    stBox(T,0.6,0.3,0.6,0xAADDFF,-3.5,8.7,29+i*7,0x88CCFF,1.0);
    stBox(T,0.6,0.3,0.6,0xAADDFF, 3.5,8.7,29+i*7,0x88CCFF,1.0);
  }
  for (let i=0;i<7;i++) {
    stBox(T,0.25,0.06,5,0xFFFF88,-3.5,0.44,30+i*8,0xFFFF00,0.3);
    stBox(T,0.25,0.06,5,0xFFFF88, 3.5,0.44,30+i*8,0xFFFF00,0.3);
  }
  // Gate arch
  stBox(T,12,0.6,1.2,0x667788,0,9,28); stBox(T,1.2,9,1.2,0x667788,-6,4.5,28); stBox(T,1.2,9,1.2,0x667788,6,4.5,28);
  stBox(T,0.5,0.5,0.5,0xFF4400,-6,9.5,28,0xFF3300,1.5); stBox(T,0.5,0.5,0.5,0xFF4400,6,9.5,28,0xFF3300,1.5);
  stBox(T,12,10,1,0x334455,0,5,93); addSTC(0,93,12,1); addSTC(-6,61,1,65); addSTC(6,61,1,65);

  // Outer ring wall
  const wallH=16, wallR=52, segs=24;
  for (let i=0;i<segs;i++) {
    const a=(i/segs)*Math.PI*2, na=((i+1)/segs)*Math.PI*2, ma=(a+na)/2;
    const wx=Math.cos(ma)*wallR, wz=Math.sin(ma)*wallR;
    if (wz>44 && Math.abs(wx)<14) continue;
    const segW=2*wallR*Math.sin(Math.PI/segs)+0.2;
    const wm = new T.Mesh(new T.BoxGeometry(segW,wallH,1.2), new T.MeshLambertMaterial({color:0x334455}));
    wm.position.set(wx,wallH/2,wz); wm.rotation.y=-ma; wm.castShadow=true; stScene.add(wm);
    if (i%2===0) {
      const win = new T.Mesh(new T.BoxGeometry(segW*0.65,wallH*0.55,0.2),
        new T.MeshLambertMaterial({color:0x000d1a,transparent:true,opacity:0.9,emissive:new T.Color(0x001528),emissiveIntensity:0.5}));
      win.position.set(wx*0.98,wallH*0.52,wz*0.98); win.rotation.y=-ma; stScene.add(win);
      for (let s=0;s<5;s++) {
        const star = new T.Mesh(new T.BoxGeometry(0.1,0.1,0.1), new T.MeshBasicMaterial({color:0xFFFFFF}));
        star.position.set(Math.cos(ma+Math.PI)*(wallR-0.8)+(Math.random()-0.5)*5, 2+Math.random()*10, Math.sin(ma+Math.PI)*(wallR-0.8)+(Math.random()-0.5)*5);
        stScene.add(star);
      }
    }
    addSTC(wx,wz,segW,2);
  }

  // Columns
  [0,Math.PI/4,Math.PI/2,3*Math.PI/4,Math.PI,5*Math.PI/4,3*Math.PI/2,7*Math.PI/4].forEach(angle => {
    const cx=Math.cos(angle)*46, cz=Math.sin(angle)*46;
    if (cz>38 && Math.abs(cx)<10) return;
    stCyl(T,1.2,1.4,18,6,0x1a2233,cx,9,cz,0x001122,0.15);
    stCyl(T,1.8,1.2,0.6,6,0x334455,cx,18.3,cz); stCyl(T,2.0,1.8,0.5,6,0x334455,cx,0.45,cz);
    stBox(T,0.15,14,0.15,0x0055AA,cx+0.9,9,cz,0x0088FF,0.7); addSTC(cx,cz,3,3);
  });

  // Ceiling
  for (let i=0;i<segs;i++) {
    const a=(i/segs)*Math.PI*2,na=((i+1)/segs)*Math.PI*2,ma=(a+na)/2;
    const sw=2*50*Math.sin(Math.PI/segs)+0.3;
    const cm = new T.Mesh(new T.BoxGeometry(sw,0.8,2.5),new T.MeshLambertMaterial({color:0x223344}));
    cm.position.set(Math.cos(ma)*50,18,Math.sin(ma)*50); cm.rotation.y=-ma; stScene.add(cm);
  }
  const ceilCap = new T.Mesh(new T.CylinderGeometry(18,18,0.8,16),new T.MeshLambertMaterial({color:0x1a2233}));
  ceilCap.position.set(0,18,0); stScene.add(ceilCap);
  const glowRing = new T.Mesh(new T.TorusGeometry(14,0.4,8,32),
    new T.MeshLambertMaterial({color:0x0055AA,emissive:new T.Color(0x0088FF),emissiveIntensity:1.0}));
  glowRing.rotation.x=Math.PI/2; glowRing.position.set(0,17.5,0); stScene.add(glowRing);
  window._stGlowRing=glowRing;

  // Roads
  [0,Math.PI/2,Math.PI,3*Math.PI/2].forEach(angle => {
    const rm = new T.Mesh(new T.BoxGeometry(5,0.06,36),new T.MeshLambertMaterial({color:0x556677}));
    rm.position.set(Math.cos(angle)*22,0.44,Math.sin(angle)*22); rm.rotation.y=angle; stScene.add(rm);
    [-2.2,2.2].forEach(off => {
      for (let d=-16;d<=16;d+=6) {
        const lm = new T.Mesh(new T.BoxGeometry(0.3,0.15,0.3),new T.MeshBasicMaterial({color:0x00AAFF}));
        lm.position.set(Math.cos(angle)*22+Math.cos(angle+Math.PI/2)*off,0.52,Math.sin(angle)*22+Math.sin(angle+Math.PI/2)*off);
        stScene.add(lm);
      }
    });
  });

  // Central computer
  stCyl(T,5.5,6,1.2,8,0x223344,0,0.6,0); stCyl(T,4.8,5.5,0.4,8,0x334455,0,1.4,0); stCyl(T,1.8,2.0,6,8,0x1a2233,0,4.6,0,0x001122,0.2);
  for (let i=0;i<6;i++) {
    const ang=(i/6)*Math.PI*2, sx=Math.cos(ang)*3.5, sz=Math.sin(ang)*3.5;
    const panel = new T.Mesh(new T.BoxGeometry(2.2,3.2,0.18),
      new T.MeshLambertMaterial({color:0x001833,emissive:new T.Color(i%2===0?0x003366:0x002244),emissiveIntensity:0.9}));
    panel.position.set(sx,3.6,sz); panel.rotation.y=-ang; stScene.add(panel);
    const border = new T.Mesh(new T.BoxGeometry(2.4,3.4,0.08),new T.MeshBasicMaterial({color:i%2===0?0x0088FF:0x00CCAA}));
    border.position.set(sx*1.02,3.6,sz*1.02); border.rotation.y=-ang; stScene.add(border);
    const arm = new T.Mesh(new T.BoxGeometry(0.18,0.18,3.5),new T.MeshLambertMaterial({color:0x334455}));
    arm.position.set(sx*0.5,2.8,sz*0.5); arm.rotation.y=-ang; stScene.add(arm);
  }
  stCyl(T,0.5,0.5,0.4,8,0x0055AA,0,7.8,0,0x0088FF,2.0);
  const topRing = new T.Mesh(new T.TorusGeometry(1.2,0.18,6,16),new T.MeshBasicMaterial({color:0x00AAFF}));
  topRing.rotation.x=Math.PI/2; topRing.position.set(0,7.6,0); stScene.add(topRing); window._stTopRing=topRing;
  addSTC(0,0,14,14);

  buildHangar(T);

  // Cargo terminal SE
  stBox(T,14,6,12,0x2a3a4a,28,3,-24); stBox(T,14.4,0.5,12.4,0x334455,28,6.25,-24);
  stBox(T,8,3,0.2,0x001833,28,3.5,-18.1,0x003366,0.7); stBox(T,8.4,3.4,0.3,0x334455,28,3.5,-18.3);
  addSTC(28,-24,14,12);
}


function buildHangar(T) {
  const HX=-28, HZ=-28; // hangar center
  // West: HX-14=-42, East: HX+20=-8, North: HZ+12=-16, South: HZ-13=-41

  // ── MAIN BODY + ROOF ──
  stBox(T,34,12,26,0x1a2530,HX+3,6,HZ);
  stBox(T,34.5,0.5,26.5,0x223340,HX+3,12.25,HZ);
  for(let i=-2;i<=2;i++) {
    stBox(T,32,0.2,0.4,0x1a2530,HX+3,11.8,HZ+i*4.5);
    stBox(T,32,0.15,0.2,0x00AAFF,HX+3,11.75,HZ+i*4.5,0x0088FF,1.2);
  }
  [-13.5,19.5].forEach(ox=>{
    for(let i=0;i<4;i++) stBox(T,0.15,6,0.2,0x00FFAA,HX+ox,3+i*2.5,HZ,0x00CC88,0.8);
  });

  // ── NORTH PORTAL WALL (entrance from main station) ──
  stBox(T,9,12,0.6,0x1a2530,HX-9.5,6,HZ+12);
  stBox(T,9,12,0.6,0x1a2530,HX+9.5,6,HZ+12);
  stBox(T,34.5,4,0.6,0x1a2530,HX+3,10,HZ+12);
  stBox(T,34.5,2,0.6,0x1a2530,HX+3,1,HZ+12);

  // ── SOUTH WALL (solid) ──
  stBox(T,34.5,12,0.6,0x1a2530,HX+3,6,HZ-13);

  // ── EAST PORTAL WALL (exit) -- split with opening ──
  const EWX = HX+20; // east wall x = -8
  stBox(T,0.6,12,8,0x1a2530,EWX,6,HZ-9);   // south section
  stBox(T,0.6,12,8,0x1a2530,EWX,6,HZ+9);   // north section
  stBox(T,0.6,4,26,0x1a2530,EWX,10,HZ);    // top section
  stBox(T,0.6,2,26,0x1a2530,EWX,1,HZ);     // bottom section

  // ── WEST WALL (solid) ──
  stBox(T,0.6,12,26,0x1a2530,HX-14,6,HZ);

  // ── ALL WALL COLLIDERS ──
  addSTC(HX-9.5,HZ+12,9,0.6); addSTC(HX+9.5,HZ+12,9,0.6); // north portal sides
  addSTC(HX+17,HZ+12,6,0.6);    // north wall east extension gap
  addSTC(HX+3,HZ-13,34.5,0.6);  // south wall solid
  addSTC(EWX,HZ-9,0.6,8);       // east wall south section
  addSTC(EWX,HZ+9,0.6,8);       // east wall north section
  addSTC(HX-14,HZ,0.6,26);      // west wall

  // ── NORTH PORTAL RING (entrance, cyan) -- pushed out to HZ+13 so visible from station ──
  const portalRing = new T.Mesh(new T.TorusGeometry(4.2,0.45,12,48),new T.MeshBasicMaterial({color:0x00CCFF}));
  portalRing.position.set(HX,5.5,HZ+13); stScene.add(portalRing); window._stPortalRing=portalRing;
  const portalInner = new T.Mesh(new T.TorusGeometry(3.8,0.12,8,32),new T.MeshBasicMaterial({color:0x44EEFF}));
  portalInner.position.set(HX,5.5,HZ+12.9); stScene.add(portalInner); window._stPortalInner=portalInner;
  const portalFill = new T.Mesh(new T.CircleGeometry(4.0,32),new T.MeshBasicMaterial({color:0x001833,transparent:true,opacity:0.75,side:T.DoubleSide}));
  portalFill.position.set(HX,5.5,HZ+13.0); stScene.add(portalFill);
  for(let i=0;i<8;i++){
    const angle=(i/8)*Math.PI*2;
    stBox(T,0.3,0.3,0.3,0x0055AA,HX+Math.cos(angle)*4.8,5.5+Math.sin(angle)*4.8,HZ+13.2,0x0088FF,1.5);
  }
  stBox(T,8,0.8,0.3,0x001122,HX,10.2,HZ+13.2,0x003366,0.5);
  [-2.8,-1.4,0,1.4,2.8].forEach(ox=>stBox(T,0.8,0.5,0.2,0x0088FF,HX+ox,10.2,HZ+13.35,0x00AAFF,0.8));
  const portalGlow=new T.PointLight(0x00AAFF,2.0,14); portalGlow.position.set(HX,5.5,HZ+11); stScene.add(portalGlow);

  // ── EAST PORTAL RING (exit, orange-red) -- rotated 90deg to face east-west ──
  const exitRing = new T.Mesh(new T.TorusGeometry(4.2,0.45,12,48),new T.MeshBasicMaterial({color:0xFF6600}));
  exitRing.rotation.y=Math.PI/2;
  exitRing.position.set(EWX-0.1,5.5,HZ); stScene.add(exitRing); window._stExitRing=exitRing;
  const exitInner = new T.Mesh(new T.TorusGeometry(3.8,0.12,8,32),new T.MeshBasicMaterial({color:0xFF9944}));
  exitInner.rotation.y=Math.PI/2;
  exitInner.position.set(EWX-0.15,5.5,HZ); stScene.add(exitInner); window._stExitInner=exitInner;
  const exitFill = new T.Mesh(new T.CircleGeometry(4.0,32),new T.MeshBasicMaterial({color:0x1a0800,transparent:true,opacity:0.75,side:T.DoubleSide}));
  exitFill.rotation.y=Math.PI/2;
  exitFill.position.set(EWX-0.1,5.5,HZ); stScene.add(exitFill);
  for(let i=0;i<8;i++){
    const angle=(i/8)*Math.PI*2;
    stBox(T,0.3,0.3,0.3,0x662200,EWX-0.2,5.5+Math.sin(angle)*4.8,HZ+Math.cos(angle)*4.8,0xFF4400,1.5);
  }
  stBox(T,0.3,0.8,8,0x1a0800,EWX-0.3,10.2,HZ,0x331100,0.5);
  const exitGlow=new T.PointLight(0xFF4400,1.8,14); exitGlow.position.set(EWX-2,5.5,HZ); stScene.add(exitGlow);

  // ── FLOOR ──
  stBox(T,32,0.3,24,0x151E28,HX+3,0.15,HZ,false);
  for(let i=-5;i<=5;i++){
    stBox(T,32,0.04,0.15,0x00AAFF,HX+3,0.32,HZ+i*2.2,0x0066AA,0.4);
    stBox(T,0.15,0.04,24,0x00AAFF,HX+i*2.8,0.32,HZ,0x0066AA,0.4);
  }

  // ── LANDING PAD ──
  const pad = new T.Mesh(new T.CylinderGeometry(5.5,5.5,0.08,32),new T.MeshLambertMaterial({color:0x1a2530}));
  pad.position.set(HX,0.34,HZ-3); stScene.add(pad);
  const padRing = new T.Mesh(new T.TorusGeometry(5.2,0.12,6,32),new T.MeshBasicMaterial({color:0xFFAA00}));
  padRing.rotation.x=Math.PI/2; padRing.position.set(HX,0.38,HZ-3); stScene.add(padRing);
  const padRing2 = new T.Mesh(new T.TorusGeometry(3.5,0.08,6,32),new T.MeshBasicMaterial({color:0xFF6600}));
  padRing2.rotation.x=Math.PI/2; padRing2.position.set(HX,0.39,HZ-3); stScene.add(padRing2);
  [[4,-4],[4,4],[-4,-4],[-4,4]].forEach(([ox,oz])=>stBox(T,0.4,0.2,0.4,0xFF8800,HX+ox,0.4,HZ-3+oz,0xFF6600,2.0));

  // ── THE SHIP (gray) ──
  const SX=HX, SY=1.2, SZ=HZ-3;
  stBox(T,8,1.2,3.5,0x667777,SX,SY+0.6,SZ);
  stBox(T,3,0.8,2.5,0x556666,SX+4.5,SY+0.4,SZ);
  stBox(T,1.5,0.5,1.5,0x445555,SX+6.2,SY+0.25,SZ);
  stBox(T,2.2,0.8,2.0,0x334455,SX+2,SY+1.2,SZ);
  const cockpit=new T.Mesh(new T.BoxGeometry(2.0,0.6,1.8),new T.MeshLambertMaterial({color:0x223344,transparent:true,opacity:0.85,emissive:new T.Color(0x002244),emissiveIntensity:0.4}));
  cockpit.position.set(SX+2,SY+1.5,SZ); stScene.add(cockpit);
  stBox(T,5,0.2,7,0x556666,SX-1,SY+0.3,SZ);
  stBox(T,2.5,0.15,1.0,0x667777,SX-3,SY+0.25,SZ-4);
  stBox(T,2.5,0.15,1.0,0x667777,SX-3,SY+0.25,SZ+4);
  [-3,3].forEach(oz=>{
    stCyl(T,0.6,0.7,3.5,8,0x556666,SX-3.5,SY+0.5,SZ+oz);
    const dc=oz<0?0x330000:0x002244, dg=oz<0?0x440000:0x0044AA;
    stCyl(T,0.45,0.45,0.15,8,dc,SX-5.3,SY+0.5,SZ+oz,dg,oz<0?0.3:1.5);
  });
  stBox(T,1.5,0.6,1.0,0x221111,SX-2,SY+0.5,SZ-1.5,0x440000,0.4);
  stBox(T,0.3,0.3,0.3,0xFF4400,SX-2,SY+1.0,SZ-1.5,0xFF2200,2.0);
  addSTC(SX,SZ,10,6);
  // Ship spotlight
  const shipSpot=new T.SpotLight(0xCCDDFF,3.0,20,Math.PI/6,0.3);
  shipSpot.position.set(SX,11.5,SZ); shipSpot.target.position.set(SX,0,SZ);
  stScene.add(shipSpot); stScene.add(shipSpot.target);
  // Ship interact zone (press E)
  window._stShipInteract = {
    group: { position: { x: SX+2, y: SY, z: SZ+4 } },
    type: 'ship',
    interact: () => window._openShipMenu?.(),
  };
  stNPCs.push(window._stShipInteract);

  // ── TOOL BENCH ──
  const BX=HX-8, BZ=HZ+4;
  stBox(T,5,1.0,2.0,0x2a3a2a,BX,0.5,BZ);           // bench body
  stBox(T,5.2,0.12,2.2,0x3a4a3a,BX,1.06,BZ);        // bench top
  stBox(T,5.2,0.08,2.2,0x00AA44,BX,1.15,BZ,0x008833,0.6); // green edge glow
  // Legs
  [[-2,0.8],[2,0.8],[-2,-0.8],[2,-0.8]].forEach(([ox,oz])=>{
    stCyl(T,0.1,0.1,1.0,6,0x223322,BX+ox,0.5,BZ+oz);
  });
  // Items on bench
  stBox(T,0.8,0.5,0.5,0x887766,BX-1.5,1.25,BZ-0.5);  // part box
  stBox(T,0.4,0.8,0.3,0x556677,BX+0.5,1.45,BZ-0.6);  // upright tool
  stBox(T,1.2,0.15,0.8,0x334433,BX+1.5,1.2,BZ+0.2);  // flat panel
  stBox(T,0.3,0.3,0.3,0x00FF88,BX-0.2,1.25,BZ+0.5,0x00CC66,1.5); // glowing component
  // Wall-mounted tool pegboard
  stBox(T,5,3,0.12,0x1a2a1a,BX,2.8,BZ-1.05);
  [[0x00FF88,-1.8],[0xFF8800,-0.9],[0x8888FF,0],[0xFF4444,0.9],[0xFFFF00,1.8]].forEach(([col,ox])=>{
    stBox(T,0.12,1.0,0.15,col,BX+ox,2.5,BZ-1.0,col,0.7);
  });
  addSTC(BX,BZ,5.5,2.5);

  // ── MAIN SHIP COMPUTER ──
  const CX=HX+8, CZ=HZ-9;
  stBox(T,6,0.3,4,0x0d1520,CX,0.15,CZ);
  stBox(T,6.2,0.08,4.2,0x00AAFF,CX,0.31,CZ,0x0066FF,0.5);
  stBox(T,5.5,1.0,2.2,0x1a2530,CX,0.8,CZ);
  stBox(T,5.7,0.15,2.4,0x223344,CX,1.38,CZ);
  stBox(T,5.0,3.5,0.15,0x000d1a,CX,3.0,CZ-1.0,0x002255,0.9);
  stBox(T,5.2,3.7,0.2,0x0a1525,CX,3.0,CZ-1.1);
  stBox(T,5.2,0.1,0.15,0x00FFFF,CX,4.85,CZ-1.0,0x00CCFF,2.5);
  stBox(T,5.2,0.1,0.15,0x00FFFF,CX,1.15,CZ-1.0,0x00CCFF,2.5);
  stBox(T,0.1,3.7,0.15,0x00FFFF,CX-2.58,3.0,CZ-1.0,0x00CCFF,2.5);
  stBox(T,0.1,3.7,0.15,0x00FFFF,CX+2.58,3.0,CZ-1.0,0x00CCFF,2.5);
  stCyl(T,0.35,0.35,0.5,8,0x0055AA,CX,5.15,CZ-1.0,0x00AAFF,3.0);
  const holoGeo=new T.BoxGeometry(1.8,1.8,1.8);
  const holoMat=new T.MeshBasicMaterial({color:0x00DDFF,wireframe:true,transparent:true,opacity:0.5});
  const holo=new T.Mesh(holoGeo,holoMat); holo.position.set(CX,7.2,CZ-1.0); stScene.add(holo);
  window._stHoloBox=holo;
  [-2.2,2.2].forEach(ox=>stBox(T,0.8,2.5,0.12,0x001833,CX+ox,2.5,CZ-0.95,0x003366,0.7));
  stBox(T,4.5,0.12,1.4,0x112233,CX,1.45,CZ+0.4);
  stCyl(T,0.7,0.7,0.1,8,0x1a2530,CX,0.75,CZ+1.8);
  stCyl(T,0.08,0.08,1.3,6,0x223344,CX,0.35,CZ+1.8);
  stBox(T,0.5,0.08,0.5,0x00AAFF,CX-0.6,1.3,CZ+1.8,0x0088FF,0.8);
  stBox(T,0.5,0.08,0.5,0x00AAFF,CX+0.6,1.3,CZ+1.8,0x0088FF,0.8);
  addSTC(CX,CZ,6,3);
  const screenLight=new T.PointLight(0x0088FF,2.5,12); screenLight.position.set(CX,3.5,CZ-0.5); stScene.add(screenLight);

  // ── TOOLBOX ──
  const TX2=HX-9, TZ2=HZ-7;
  stBox(T,2.5,1.2,1.2,0x334455,TX2,0.6,TZ2);
  stBox(T,2.5,0.18,1.2,0x445566,TX2,1.29,TZ2);
  stBox(T,2.5,0.12,1.2,0xFF8800,TX2,1.1,TZ2,0xFF6600,0.8);
  [-0.6,0,0.6].forEach(ox=>{
    stBox(T,0.6,0.28,1.0,0x223344,TX2+ox,0.6,TZ2);
    stBox(T,0.25,0.1,0.08,0x00AAFF,TX2+ox,0.6,TZ2-0.56,0x0088FF,1.2);
  });
  [[0x00FFAA,0.3],[0xFF8800,0.6],[0x8888FF,0.9],[0xFF4444,1.2]].forEach(([col,xo])=>{
    stBox(T,0.15,0.8,0.15,col,TX2-0.8+xo,2.2,TZ2-0.5,col,0.6);
  });
  addSTC(TX2,TZ2,2.8,1.5);

  // ── GENERAL LIGHTS ──
  stBox(T,0.4,0.4,0.4,0xFF6600,SX-2,2.5,SZ-2,0xFF4400,3.0);
  stBox(T,0.4,0.4,0.4,0xFF6600,SX-3,2.5,SZ+2,0xFF4400,2.0);
  const dmgLight=new T.PointLight(0x440000,1.5,8); dmgLight.position.set(SX-2,1.5,SZ-2); stScene.add(dmgLight);
  [[-2,0],[2,0],[0,-2],[0,2]].forEach(([ox,oz])=>{
    const s=new T.PointLight(0x4488AA,1.5,12); s.position.set(HX+ox,11.5,HZ-3+oz); stScene.add(s);
  });
  const fillLight=new T.PointLight(0x002244,1.8,30); fillLight.position.set(HX+3,6,HZ); stScene.add(fillLight);
  [[-10,0],[10,0],[0,-10],[0,10]].forEach(([ox,oz])=>stBox(T,0.1,0.1,3,0x0088FF,HX+ox,0.35,HZ+oz,0x0066FF,1.0));

  // ── UNDOCK TERMINAL ──
  // Glowing launch console on west wall of hangar
  const UX=HX-18, UZ=HZ-2;
  stBox(T,3,0.3,2,0x0d1520,UX,0.15,UZ);
  stBox(T,3.2,0.08,2.2,0x00FF88,UX,0.31,UZ,0x00CC66,0.6);
  stBox(T,2.8,2.5,0.15,0x001a0d,UX,2.0,UZ-1.0,0x003322,0.9);
  stBox(T,3.0,0.1,0.15,0x00FF88,UX,3.25,UZ-1.0,0x00FFAA,2.5);
  // LAUNCH text on screen
  const uLight=new T.PointLight(0x00FF88,2.5,10); uLight.position.set(UX,2.5,UZ-0.5); stScene.add(uLight);
  addSTC(UX,UZ,3.5,2.5);
  // Interact zone
  // ── RANKING BOARD KIOSK ──
  const RX=12, RZ=-8; // main hall, east side
  stBox(T,3.5,0.3,1.5,0x0d1520,RX,0.15,RZ);
  stBox(T,3.7,0.08,1.7,0xFFAA00,RX,0.31,RZ,0xCC8800,0.7);
  stBox(T,3.2,4.0,0.15,0x000d1a,RX,2.5,RZ-0.8,0x112200,0.9);
  stBox(T,3.4,0.12,0.15,0xFFAA00,RX,4.55,RZ-0.8,0xFFCC00,2.5);
  const rkLight=new T.PointLight(0xFFAA00,2.0,12); rkLight.position.set(RX,3.0,RZ-0.5); stScene.add(rkLight);
  addSTC(RX,RZ,3.5,2.5);
  stNPCs.push({
    group: { position: { x: RX, y: ST_GROUND_Y, z: RZ+1.5 } },
    type: 'ranking',
    interact: () => window._openRankingBoard?.(),
  });

  // ── MISSION CONTROL ──
  const MX=-14, MZ=-8; // west side, across from ranking board
  stBox(T,3.5,0.3,1.5,0x0d1520,MX,0.15,MZ);
  stBox(T,3.7,0.08,1.7,0x00CCFF,MX,0.31,MZ,0x0099CC,0.7);
  stBox(T,3.2,4.0,0.15,0x000d1a,MX,2.5,MZ-0.8,0x001122,0.9);
  stBox(T,3.4,0.12,0.15,0x00CCFF,MX,4.55,MZ-0.8,0x00EEFF,2.5);
  // Mission Control label panel
  stBox(T,2.8,0.6,0.1,0x001824,MX,3.2,MZ-0.85,0x00AACC,0.5);
  const mcLight=new T.PointLight(0x00CCFF,2.0,12); mcLight.position.set(MX,3.0,MZ-0.5); stScene.add(mcLight);
  addSTC(MX,MZ,3.5,2.5);
  stNPCs.push({
    group: { position: { x: MX, y: ST_GROUND_Y, z: MZ+1.5 } },
    type: 'mission',
    interact: () => window._openMissionControl?.(),
  });

  window._stUndockInteract = {
    group: { position: { x: UX, y: ST_GROUND_Y, z: UZ+1.5 } },
    type: 'undock',
    interact: () => {
      if (typeof window.enterDeepSpace !== 'function') {
        window._mineShowNotification?.('Deep space module loading...');
        return;
      }
      ST_SKT()?.emit('deepspace:undock');
      var _skt = ST_SKT();
      if (_skt) {
        _skt.once('deepspace:undockConfirmed', function(data) {
          ST_NOTIFY('Undocking ' + (data.shipName||'ship') + '...');
          setTimeout(function() { window.enterDeepSpace(); }, 400);
        });
        _skt.once('deepspace:undockDenied', function(data) {
          window._mineShowNotification?.(data.msg || 'Undock denied.');
        });
      }
    },
  };
  stNPCs.push(window._stUndockInteract);

  // ── PORTAL TELEPORT ZONES ──
  window._stPortalZones = [
    { x:HX,    z:HZ+14, r:3.0, dest:{x:HX,    y:ST_GROUND_Y, z:HZ+6,  rot:Math.PI} }, // main -> hangar (north entrance)
    { x:EWX-2, z:HZ,    r:3.0, dest:{x:EWX+4, y:ST_GROUND_Y, z:HZ,    rot:Math.PI/2} }, // hangar -> main (east exit)
  ];

  console.log('[Station] Hangar built');
}

function setupStationLights(T) {
  stScene.add(new T.AmbientLight(0x223344,0.8));
  const main = new T.PointLight(0x4488BB,2.0,90); main.position.set(0,14,0); main.castShadow=true; stScene.add(main);
  const dock = new T.PointLight(0x2255AA,1.2,50); dock.position.set(0,6,60); stScene.add(dock);
  const hng  = new T.PointLight(0x1a88AA,2.0,40); hng.position.set(-28,6,-28); stScene.add(hng);
  const crg  = new T.PointLight(0x224455,1.2,30); crg.position.set(28,6,-24); stScene.add(crg);
}

function buildStationNPCs(T) {
  buildCommander(T,6,0,8);
  buildFreightBot(T,-12,0,15,1);
  buildFreightBot(T,16,0,10,-1);
}

function buildCommander(T,x,y,z) {
  const g=new T.Group();
  const skin=new T.MeshLambertMaterial({color:0xFFCC88}),suit=new T.MeshLambertMaterial({color:0x1a3344}),acc=new T.MeshLambertMaterial({color:0x0088CC});
  const body=new T.Mesh(new T.BoxGeometry(0.5,0.6,0.35),suit); body.position.y=0.88; g.add(body);
  [-0.2,0.2].forEach(ox=>{const s=new T.Mesh(new T.BoxGeometry(0.06,0.55,0.37),acc);s.position.set(ox,0.88,0);g.add(s);});
  const head=new T.Mesh(new T.BoxGeometry(0.42,0.42,0.4),skin); head.position.set(0,1.32,0); g.add(head);
  const visor=new T.Mesh(new T.BoxGeometry(0.36,0.18,0.06),new T.MeshLambertMaterial({color:0x001833,transparent:true,opacity:0.85,emissive:new T.Color(0x003366),emissiveIntensity:0.6}));
  visor.position.set(0,1.34,0.22); g.add(visor);
  [-0.32,0.32].forEach(ax=>{const arm=new T.Mesh(new T.BoxGeometry(0.14,0.38,0.14),suit);arm.position.set(ax,0.84,0);g.add(arm);});
  [-0.14,0.14].forEach(lx=>{const leg=new T.Mesh(new T.BoxGeometry(0.17,0.42,0.18),suit);leg.position.set(lx,0.3,0);g.add(leg);});
  const pad=new T.Mesh(new T.BoxGeometry(0.25,0.35,0.04),new T.MeshLambertMaterial({color:0x001122,emissive:new T.Color(0x003366),emissiveIntensity:0.8}));
  pad.position.set(0.42,0.72,0.1); g.add(pad);
  g.position.set(x,y,z); g.rotation.y=Math.PI*0.15; stScene.add(g);
  stNPCs.push({group:g,type:"commander",baseX:x,baseZ:z,phase:0,interact:()=>openCommanderUI()});
}

function buildFreightBot(T,x,y,z,dir) {
  const g=new T.Group();
  const bm=c=>new T.MeshLambertMaterial({color:c});
  const body=new T.Mesh(new T.BoxGeometry(1.8,1.4,2.8),bm(0x334455)); body.position.y=1.4; g.add(body);
  const cab=new T.Mesh(new T.BoxGeometry(1.6,0.9,1.2),bm(0x223344)); cab.position.set(0,2.55,-0.8); g.add(cab);
  const wind=new T.Mesh(new T.BoxGeometry(1.4,0.7,0.1),new T.MeshLambertMaterial({color:0x001833,transparent:true,opacity:0.7,emissive:new T.Color(0x002244),emissiveIntensity:0.5}));
  wind.position.set(0,2.6,-1.45); g.add(wind);
  [[-0.85,0.5,-0.9],[0.85,0.5,-0.9],[-0.85,0.5,0.9],[0.85,0.5,0.9]].forEach(([wx,wy,wz])=>{
    const t=new T.Mesh(new T.CylinderGeometry(0.45,0.45,0.3,8),bm(0x111111)); t.rotation.z=Math.PI/2; t.position.set(wx,wy,wz); g.add(t);
  });
  g.position.set(x,y,z); g.rotation.y=dir>0?0:Math.PI; stScene.add(g);
  stNPCs.push({group:g,type:"freight",baseX:x,baseZ:z,dir,phase:Math.random()*Math.PI*2});
}

// ── COMMANDER UI ──────────────────────────────────────────────────────────────
function openCommanderUI() {
  if (document.getElementById("cmdOverlay")) return;
  if (document.pointerLockElement) document.exitPointerLock();
  const o=document.createElement("div"); o.id="cmdOverlay";
  o.style.cssText="position:fixed;inset:0;background:rgba(0,8,22,0.96);color:white;font-family:'Courier New',monospace;z-index:500;display:flex;align-items:center;justify-content:center;";
  o.innerHTML=`<div style="max-width:460px;padding:32px;text-align:center;">
    <div style="font-size:0.65rem;letter-spacing:0.25em;color:rgba(0,180,255,0.4);margin-bottom:8px;">STATION ALPHA // COMMANDER</div>
    <div style="font-size:1.5rem;font-weight:bold;color:#00AAFF;margin-bottom:4px;">Commander Voss</div>
    <div style="font-size:0.75rem;color:rgba(255,255,255,0.3);margin-bottom:22px;">Operations Chief — SW Sector</div>
    <div style="background:rgba(0,40,80,0.4);border:1px solid rgba(0,150,255,0.15);border-radius:10px;padding:18px;text-align:left;line-height:1.9;font-size:0.82rem;margin-bottom:22px;">
      <p style="margin:0 0 10px;color:rgba(255,255,255,0.8);">You made it. Not many do on their first SW run.</p>
      <p style="margin:0 0 10px;color:rgba(255,255,255,0.5);">Hangar southwest. Cargo terminal east.</p>
      <p style="margin:0;color:rgba(0,200,255,0.7);">Those weren't random bandits. Something bigger is out there.</p>
    </div>
    <div style="display:flex;gap:10px;justify-content:center;">
      <button onclick="document.getElementById('cmdOverlay')?.remove()" style="background:rgba(0,100,200,0.25);color:#00AAFF;border:1px solid rgba(0,150,255,0.35);border-radius:8px;padding:10px 22px;cursor:pointer;font-family:'Courier New',monospace;font-size:12px;">Understood</button>
      <button onclick="window.exitStation()" style="background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.4);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:10px 22px;cursor:pointer;font-family:'Courier New',monospace;font-size:12px;">Undock</button>
    </div>
  </div>`;
  document.body.appendChild(o);
}

// ── ENTER / EXIT ──────────────────────────────────────────────────────────────
function showStationWelcome() {
  const w = document.createElement('div');
  w.id = 'stWelcome';
  w.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:450;overflow:hidden;`;

  // Confetti canvas
  const cc = document.createElement('canvas');
  cc.width = window.innerWidth; cc.height = window.innerHeight;
  cc.style.cssText = 'position:absolute;inset:0;';
  w.appendChild(cc);

  // Title
  const title = document.createElement('div');
  title.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
    text-align:center;font-family:'Courier New',monospace;
    animation:stWelcomePop 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards;opacity:0;`;
  title.innerHTML = `
    <div style="font-size:clamp(1.2rem,4vw,2rem);font-weight:bold;color:#FFD700;
      text-shadow:0 0 30px rgba(255,200,0,0.8);letter-spacing:0.15em;margin-bottom:8px;">
      WELCOME TO LEVEL 2
    </div>
    <div style="font-size:clamp(0.8rem,2vw,1rem);color:rgba(0,200,255,0.9);letter-spacing:0.2em;">
      STATION ALPHA
    </div>
    <div style="font-size:clamp(0.6rem,1.5vw,0.75rem);color:rgba(255,255,255,0.4);margin-top:12px;letter-spacing:0.1em;">
      the grind just got real
    </div>
  `;
  w.appendChild(title);

  const style = document.createElement('style');
  style.textContent = `@keyframes stWelcomePop{0%{opacity:0;transform:translate(-50%,-50%) scale(0.5)}100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}`;
  document.head.appendChild(style);
  document.body.appendChild(w);

  // Confetti
  const ctx2 = cc.getContext('2d');
  const particles = Array.from({length:120},()=>({
    x: Math.random()*cc.width, y: -20,
    vx: (Math.random()-0.5)*4, vy: 2+Math.random()*4,
    r: 4+Math.random()*6,
    color: `hsl(${Math.random()*360},90%,60%)`,
    spin: (Math.random()-0.5)*0.2, angle:0,
  }));

  let frame = 0;
  function animConf() {
    if (frame++ > 240) {
      title.style.transition='opacity 1s'; title.style.opacity='0';
      setTimeout(()=>{ w.remove(); style.remove(); }, 1000);
      return;
    }
    ctx2.clearRect(0,0,cc.width,cc.height);
    particles.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy; p.vy+=0.08; p.angle+=p.spin;
      if(p.y>cc.height+20) { p.y=-20; p.x=Math.random()*cc.width; p.vy=2+Math.random()*3; }
      ctx2.save(); ctx2.translate(p.x,p.y); ctx2.rotate(p.angle);
      ctx2.fillStyle=p.color; ctx2.fillRect(-p.r/2,-p.r/4,p.r,p.r/2);
      ctx2.restore();
    });
    requestAnimationFrame(animConf);
  }
  animConf();
}

window.enterStation = () => {
  if (stationActive && !window._forceStationReload) return;
  if (stationActive && window._forceStationReload) {
    hideStationHUD();
    stopStationMusic();
    if (stAnimId) cancelAnimationFrame(stAnimId);
    if (window._stHideInterval) { clearInterval(window._stHideInterval); window._stHideInterval = null; }
    stationActive = false;
    window._forceStationReload = false;
  }
  // Block earth position broadcast immediately
  window._inStation = true;
  // Hide deepspace mobile HUD buttons -- they dont belong in station
  if (typeof dsHideMobileHUD === 'function') dsHideMobileHUD();
  window._playerZone = "station";
  if (window._stationTpBtn) window._stationTpBtn.style.display = 'none';
  ST_SKT()?.emit("player:zone",{zone:"station"});
  ST_SKT()?.emit("player:move",{x:0,y:-1000,z:0,rotY:0});
  // Tell server we are in station (after zone is set server-side)
  setTimeout(() => ST_SKT()?.emit("station:enter"), 200);
  // Pre-load ship data so undock button works without opening ship terminal first
  setTimeout(() => ST_SKT()?.emit('ship:getData'), 400);
  if (!stRenderer) initStationWorld();
  stationActive=true;
  stCanvas.style.display="block";
  stCanvas.style.pointerEvents = "auto"; // enable touch for mobile
  // Hide earth renderer canvas so mobile touch doesnt bleed through
  if (window._earthRenderer) { window._earthCanvas = window._earthRenderer.domElement; window._earthCanvas.style.display="none"; }
  // Immediately kill any visible robot nametags before launch
  document.querySelectorAll('div').forEach(el => {
    if (el.textContent?.trim().startsWith('🤖')) el.style.display = 'none';
  });
  // Cinematic launch -- fly camera up like taking off, then cut to wormhole
  if (window._mineCamera) {
    const cam = window._mineCamera;
    const startY = cam.position.y;
    const startX = cam.position.x;
    const startZ = cam.position.z;
    let t = 0;
    const launch = setInterval(() => {
      t += 0.04;
      cam.position.y = startY + t * t * 180;
      cam.position.x = startX + Math.sin(t * 3) * t * 2;
      cam.rotation.x = -t * 0.3;
      if (t >= 1.2) {
        clearInterval(launch);
        cam.position.set(0, -500, 0);
        cam.rotation.x = 0;
      }
    }, 16);
  }
  // Clear all nametags and prompts after short delay
  setTimeout(() => {
    if (window._doorPrompt) window._doorPrompt.style.display = 'none';
    if (window.otherPlayers) {
      Object.values(window.otherPlayers).forEach(p => {
        if (p.nameTag) p.nameTag.style.display = 'none';
        if (p.chatBubble) p.chatBubble.style.display = 'none';
      });
    }
  }, 400);
  // Restore social UI that space hid
  window.showEarthUI?.();
  // Keep earth canvas hidden -- dsFullTeardown already handled it
  if (window._dsHiddenEarthCanvas) {
    window._dsHiddenEarthCanvas.style.display = 'none';
  }
  // Continuously hide earth-only elements (some get recreated by modules)
  // Immediately hide earth-only UI on enter
  if (window._mineHUD) { window._mineHUD.style.display='none'; window._mineHUD.dataset.sthidden='1'; }
  var _rb = document.getElementById('robotsBtn'); if (_rb) { _rb.dataset.sthidden='1'; _rb.style.display='none'; }
  document.querySelectorAll('div,button').forEach(el => {
    const txt = el.textContent?.trim() || '';
    if (txt === '🤖' || txt === '🔑' || txt.startsWith('📦 Bot deposit') || txt.startsWith('🔶 Smelt box') || el.id === 'rocketBtn' || el.id === 'robotsBtn') {
      el.dataset.sthidden = '1'; el.style.display = 'none';
    }
  });
  var HIDE_IDS = ['robotsBtn','rocketBtn','mineHUD'];
  window._stHideInterval = setInterval(() => {
    if (!stationActive) { clearInterval(window._stHideInterval); return; }
    // Direct ID kills first — fastest
    HIDE_IDS.forEach(id => {
      var el2 = document.getElementById(id);
      if (el2 && el2.style.display !== 'none') { el2.style.display='none'; el2.dataset.sthidden='1'; }
    });
    if (window._mineHUD && window._mineHUD.style.display !== 'none') { window._mineHUD.style.display='none'; window._mineHUD.dataset.sthidden='1'; }
    document.querySelectorAll('div,button').forEach(el => {
      if (el.dataset.sthidden) return;
      const txt = el.textContent?.trim() || '';
      if (txt === '🤖' || txt === '🔑' ||
          txt.startsWith('📦 Bot deposit') ||
          txt.startsWith('🔶 Smelt box') ||
          el.id === 'rocketBtn' || el.id === 'robotsBtn') {
        el.dataset.sthidden = '1'; el.style.display = 'none';
      }
    });
  }, 100);
  stPlayerPos={x:STATION_SPAWN.x,y:STATION_SPAWN.y,z:STATION_SPAWN.z};
  stYaw=Math.PI; stPitch=0; stVelocityY=0; stIsGrounded=true;
  showStationHUD();
  startStationMusic();
  stClock.start();
  stRenderer.setSize(window.innerWidth, window.innerHeight);
  stLoop();
  ST_NOTIFY("Welcome to Station Alpha. Press E near NPCs to interact.");
  // Unlock station server-side
  window._spaceUnlocked = true;
  ST_SKT()?.emit('space:unlockStation');
  // Inject Station Alpha into earth Places menu if not already there
  injectStationTeleport();
  hideEarthPlacesForStation();
  buildStationPlacesMenu();
  setTimeout(() => showStationWelcome(), 1500);
};

window.exitStation = () => {
  document.getElementById("cmdOverlay")?.remove();
  if (!stationActive) return;
  stationActive = false;
  window._inStation = false;
  if (window._stationTpBtn) window._stationTpBtn.style.display = '';
  // Mobile HUD re-initializes when deepspace activates -- just ensure it's gone for now
  var _oldHUD = document.getElementById('dsMobileHUD'); if (_oldHUD) _oldHUD.remove();

  stCanvas.style.display = "none";
  if (stAnimId) cancelAnimationFrame(stAnimId);
  hideStationHUD();
  stopStationMusic();
  window._playerZone = "earth";
  window._spaceOverride = false;
  ST_SKT()?.emit("station:leave");
  ST_SKT()?.emit("player:zone", { zone: "earth" });
  ST_SKT()?.emit("player:move", { x: 0, y: 1.7, z: 8, rotY: 0 });
  // Remove all other player meshes from station scene
  Object.values(stOtherPlayers).forEach(o => { if(o.mesh) stScene?.remove(o.mesh); });
  stOtherPlayers = {};
  // Restore earth Places button, remove station one
  document.getElementById('stPlacesBtn2')?.remove();
  document.getElementById('stPlacesList2')?.remove();
  restoreEarthPlaces();

  // Exit station pointer lock first
  if (document.pointerLockElement) document.exitPointerLock();

  // Restore earth canvas -- unhide it
  if (window._earthCanvas) {
    window._earthCanvas.style.display = '';
    window._earthCanvas = null;
  } else {
    // Find it as fallback
    const ec = [...document.querySelectorAll('canvas')].find(c => c !== stCanvas);
    if (ec) ec.style.display = '';
  }
  // Also restore the one hidden during wormhole transition
  if (window._earthCanvasHidden) {
    window._earthCanvasHidden.style.display = '';
    window._earthCanvasHidden = null;
  }

  if (window._stHideInterval) { clearInterval(window._stHideInterval); window._stHideInterval = null; }
  window.showEarthUI?.();
  document.querySelectorAll('[data-sthidden]').forEach(el => {
    el.style.display = ''; delete el.dataset.sthidden;
  });

  setTimeout(() => {
    window._earthResume?.();
    ST_SKT()?.emit('player:zone', { zone: 'earth' });
    // Request fresh earth player list so returning players are visible
    ST_SKT()?.emit('world:requestState');
  }, 150);
};

// ── HUD ───────────────────────────────────────────────────────────────────────
// ── AUCTION LISTENERS ─────────────────────────────────────────────────────────
function stSetupAuctionListeners() {
  var skt = ST_SKT(); if (!skt) return;
  skt.on('auction:pendingSales', function(data) {
    var total = (data.sales||[]).reduce(function(sum,s){return sum+s.price;},0);
    if (total <= 0) return;
    var msg = '★ Auction sales while offline: +' + total.toLocaleString() + ' bars ('
      + data.sales.map(function(s){return s.partName+' to '+s.buyer;}).join(', ') + ')';
    ST_NOTIFY(msg);
  });
  skt.on('auction:saleMade', function(data) {
    ST_NOTIFY('★ Your auction sold: "' + data.partName + '" to ' + data.buyer + ' for ' + data.price.toLocaleString() + ' bars!');
  });
  skt.on('faction:partBought', function(data) {
    if (window._shipMenuData) {
      window._shipMenuData.bars = data.bars;
      window._shipMenuData.inventory = window._shipMenuData.inventory || [];
      window._shipMenuData.inventory.push(data.part);
    }
    // Reset all PURCHASING buttons
    document.querySelectorAll('button').forEach(function(b) {
      if (b.textContent === 'PURCHASING...') {
        b.textContent = 'PURCHASED'; b.disabled = true;
        b.style.color = '#44FF88'; b.style.borderColor = '#44FF8866';
      }
    });
    ST_NOTIFY('[PART] ' + (data.part ? data.part.name : 'Part') + ' added to bag.');
    if (typeof refreshTab === 'function') refreshTab();
    if (window._lastStoreFaction) ST_SKT()?.emit('faction:getVendorStock', { factionId: window._lastStoreFaction });
  });
}
setTimeout(stSetupAuctionListeners, 1000);

function showStationHUD() {

  let hint=document.createElement("div"); hint.id="stHint";
  hint.style.cssText="position:fixed;bottom:140px;left:50%;transform:translateX(-50%);background:rgba(0,8,22,0.75);color:rgba(0,180,255,0.6);font-family:'Courier New',monospace;font-size:11px;padding:8px 18px;border-radius:10px;z-index:420;pointer-events:auto;border:1px solid rgba(0,150,255,0.15);display:none;cursor:pointer;";
  hint.addEventListener("touchend", function(e){ e.preventDefault(); if(nearestSt) nearestSt.interact(); }, {passive:false});
  hint.addEventListener("click", function(){ if(nearestSt) nearestSt.interact(); });
  var stJumpBtn=document.createElement("div"); stJumpBtn.id="stJumpBtn";
  stJumpBtn.innerHTML="&#11014;";
  stJumpBtn.style.cssText="position:fixed;bottom:100px;right:20px;width:60px;height:60px;background:rgba(255,255,255,0.15);border:2px solid rgba(255,255,255,0.4);border-radius:50%;display:none;align-items:center;justify-content:center;font-size:26px;color:white;user-select:none;z-index:421;cursor:pointer;";
  stJumpBtn.addEventListener("touchstart",function(e){e.preventDefault();if(stIsGrounded){stVelocityY=7;stIsGrounded=false;}},{passive:false});
  document.body.appendChild(stJumpBtn);
  if(window.innerWidth<900) stJumpBtn.style.display="flex";
  document.body.appendChild(hint); window._stHint=hint;

  // ── UNDOCK BUTTON ──
  var undockBtn = document.createElement('div');
  undockBtn.id = 'stUndockBtn';
  undockBtn.style.cssText = 'position:fixed;top:80px;left:16px;padding:10px 16px;background:rgba(0,8,22,0.75);border:1px solid rgba(0,180,255,0.35);border-radius:12px;color:rgba(0,200,255,0.85);font-family:Courier New,monospace;font-size:12px;font-weight:bold;letter-spacing:0.1em;cursor:pointer;user-select:none;z-index:421;backdrop-filter:blur(8px);display:flex;align-items:center;gap:8px;transition:border-color 0.15s;';
  undockBtn.innerHTML = '<span style="font-size:16px;">🚀</span> UNDOCK';
  undockBtn.addEventListener('mouseover', function(){ undockBtn.style.borderColor='rgba(0,220,255,0.7)'; });
  undockBtn.addEventListener('mouseout',  function(){ undockBtn.style.borderColor='rgba(0,180,255,0.35)'; });
  undockBtn.addEventListener('click', function() {
    if (document.pointerLockElement) document.exitPointerLock();
    var sd = window._shipMenuData;
    var activeShip = sd && sd.ships && sd.ships.find(function(s){ return s.id === sd.activeShipId; });
    if (!activeShip) {
      window._mineShowNotification && window._mineShowNotification('No active ship — set one in the Ship Terminal first.');
      return;
    }
    if (typeof window.enterDeepSpace !== 'function') {
      window._mineShowNotification && window._mineShowNotification('Deep space module loading, try again.');
      return;
    }
    // Ask server to validate undock before entering
    undockBtn.textContent = 'CHECKING...';
    undockBtn.style.pointerEvents = 'none';
    ST_SKT()?.emit('deepspace:undock');
    var _undockTimeout = setTimeout(function() {
      undockBtn.innerHTML = '<span style="font-size:16px;">🚀</span> UNDOCK';
      undockBtn.style.pointerEvents = '';
      window._mineShowNotification && window._mineShowNotification('Server timeout — try again.');
    }, 5000);
    // Listen for server response -- one time
    var _skt = ST_SKT();
    if (_skt) {
      _skt.once('deepspace:undockConfirmed', function(data) {
        clearTimeout(_undockTimeout);
        undockBtn.innerHTML = '<span style="font-size:16px;">🚀</span> UNDOCK';
        undockBtn.style.pointerEvents = '';
        ST_NOTIFY('Undocking ' + (data.shipName||'ship') + '...');
        setTimeout(function() { window.enterDeepSpace(); }, 400);
      });
      _skt.once('deepspace:undockDenied', function(data) {
        clearTimeout(_undockTimeout);
        undockBtn.innerHTML = '<span style="font-size:16px;">🚀</span> UNDOCK';
        undockBtn.style.pointerEvents = '';
        window._mineShowNotification && window._mineShowNotification(data.msg || 'Undock denied.');
      });
    }
  });
  document.body.appendChild(undockBtn);

  // ── BARS HUD -- bottom center ──
  var stBarsHUD = document.createElement('div');
  stBarsHUD.id = 'stBarsHUD';
  stBarsHUD.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(0,8,22,0.82);border:1px solid rgba(255,200,50,0.3);border-radius:20px;padding:8px 22px;font-family:Courier New,monospace;font-size:14px;font-weight:bold;color:#FFDD44;letter-spacing:0.1em;z-index:421;pointer-events:none;backdrop-filter:blur(8px);text-shadow:0 0 12px rgba(255,220,50,0.4);';
  stBarsHUD.textContent = '★ ...';
  document.body.appendChild(stBarsHUD);
  // Populate from ship data when available
  function _updateStBarsHUD() {
    var bars = window._shipMenuData && window._shipMenuData.bars;
    var el = document.getElementById('stBarsHUD');
    if (el && bars !== undefined) el.textContent = '★ ' + Math.floor(bars).toLocaleString() + ' bars';
  }
  setTimeout(_updateStBarsHUD, 600); // wait for ship data
  window._stBarsUpdate = _updateStBarsHUD;
  // Also listen for live bar updates
  var _stSkt = ST_SKT();
  if (_stSkt) {
    _stSkt.on('ship:barsUpdate', function(data) {
      if (window._shipMenuData) window._shipMenuData.bars = data.bars;
      var el = document.getElementById('stBarsHUD');
      if (el) el.textContent = '★ ' + Math.floor(data.bars).toLocaleString() + ' bars';
    });
  }

  // ── PLACES MENU ──
}

function stTeleport(x, y, z, rotY) {
  stPlayerPos={x,y,z};
  stYaw = rotY; stPitch = 0;
  stVelocityY = 0; stIsGrounded = true;
}

function stGoEarth() {
  if (document.pointerLockElement) document.exitPointerLock();

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:600;opacity:0;transition:opacity 0.8s;';
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.style.opacity = '1');

  setTimeout(() => {
    window.exitStation();
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 800);
  }, 800);
}

function stLaunchSpace() {
  if (document.pointerLockElement) document.exitPointerLock();

  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;background:#000;z-index:600;
    display:flex;align-items:center;justify-content:center;
    font-family:'Courier New',monospace;color:rgba(0,180,255,0.8);font-size:14px;
    letter-spacing:0.15em;opacity:0;transition:opacity 0.8s;`;
  overlay.textContent = 'LAUNCHING...';
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.style.opacity = '1');

  setTimeout(() => {
    window.exitStation();
    // Re-enter space at station beacon area
    setTimeout(() => {
      window.enterSpace?.();
    }, 500);
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 800);
  }, 1000);
}
function hideStationHUD() {
  ["stHint","stPlacesBtn2","stPlacesList2","stUndockBtn","stJumpBtn","stBarsHUD"].forEach(id=>document.getElementById(id)?.remove());
  window._stHint=null;
}


// ── MISSION CONTROL ────────────────────────────────────────────────────────────
window._openMissionControl = function() {
  if (document.getElementById('stMissionControl')) { document.getElementById('stMissionControl').remove(); return; }
  var RC = {Mythic:'#FF2244',Legendary:'#FFB300',Epic:'#AA44FF',Rare:'#4488FF',Uncommon:'#44CC44',Common:'#AAAAAA'};
  var SI = {engine:'⚡',shield:'🛡',weapon1:'🔫',weapon2:'💥',warp:'🌀',nav:'🧭'};
  var SLOT_LABELS = {engine:'Engine',shield:'Shield',weapon1:'Cannon',weapon2:'Missiles',warp:'Warp',nav:'Nav'};
  var mcTab = 'store';
  var storeFaction = 'verus';

  var ov = document.createElement('div');
  ov.id = 'stMissionControl';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:800;display:flex;flex-direction:column;font-family:Courier New,monospace;overflow:hidden;';

  // Header
  var hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid rgba(0,200,255,0.25);background:rgba(0,8,22,0.9);flex-shrink:0;';
  hdr.innerHTML = '<span style="color:#00CCFF;font-size:16px;font-weight:bold;letter-spacing:0.2em;">MISSION CONTROL</span>'
    + '<span style="color:rgba(150,200,255,0.5);font-size:11px;">Station Alpha</span>';
  var xBtn = document.createElement('button');
  xBtn.textContent = 'X'; xBtn.style.cssText = 'background:none;border:none;color:rgba(255,255,255,0.3);font-size:20px;cursor:pointer;padding:4px 10px;font-family:Courier New,monospace;';
  xBtn.onclick = function(){ ov.remove(); };
  hdr.appendChild(xBtn);
  ov.appendChild(hdr);

  // Tabs
  var tabRow = document.createElement('div');
  tabRow.style.cssText = 'display:flex;border-bottom:1px solid rgba(0,200,255,0.15);background:rgba(0,5,15,0.8);flex-shrink:0;overflow-x:auto;';
  var TABS = [['store','STORE'],['auction','AUCTION'],['bounty','BOUNTY BOARD'],['games','GAMES'],['singularity','SINGULARITY']];
  TABS.forEach(function(td) {
    var tb = document.createElement('button');
    tb.dataset.tab = td[0];
    tb.style.cssText = 'background:none;border:none;border-bottom:2px solid transparent;color:rgba(150,200,255,0.5);font-family:Courier New,monospace;font-size:11px;padding:10px 18px;cursor:pointer;letter-spacing:0.08em;white-space:nowrap;';
    tb.textContent = td[1];
    tb.addEventListener('click', function(){
      mcTab = td[0];
      tabRow.querySelectorAll('button').forEach(function(b){
        b.style.borderBottomColor='transparent'; b.style.color='rgba(150,200,255,0.5)';
      });
      tb.style.borderBottomColor='#00CCFF'; tb.style.color='#00CCFF';
      renderMCTab();
    });
    if (td[0]==='store') { tb.style.borderBottomColor='#00CCFF'; tb.style.color='#00CCFF'; }
    tabRow.appendChild(tb);
  });
  ov.appendChild(tabRow);

  // Content
  var ct = document.createElement('div');
  ct.id = 'stMCContent';
  ct.style.cssText = 'flex:1;overflow-y:auto;padding:20px;scrollbar-width:thin;scrollbar-color:#0a2a4a transparent;';
  ov.appendChild(ct);

  function renderMCTab() {
    ct.innerHTML = '';
    if (mcTab==='store') buildMCStore(ct);
    else if (mcTab==='auction') buildMCAuction(ct);
    else if (mcTab==='bounty') buildMCBounty(ct);
    else if (mcTab==='games') buildMCGames(ct);
    else if (mcTab==='singularity') buildMCSingularity(ct);
  }

  // ── TAB 1: STORE ──────────────────────────────────────────────────────────────
  function buildMCStore(ct) {
    var FACTIONS_MC = [
      { id:'verus', name:'Verus Prime',  color:'#FF6644' },
      { id:'slv',   name:'SLV',          color:'#44AAFF' },
      { id:'omig',  name:'Omigolation',  color:'#AA44FF' },
    ];
    // Faction sub-tabs
    var fTabRow = document.createElement('div');
    fTabRow.style.cssText = 'display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;';
    FACTIONS_MC.forEach(function(f) {
      var fb = document.createElement('button');
      fb.style.cssText = 'background:rgba(0,12,28,0.8);border:1px solid '+(storeFaction===f.id?f.color+'88':'rgba(0,100,200,0.2)')+';border-radius:8px;color:'+(storeFaction===f.id?f.color:'rgba(150,200,255,0.5)')+';font-family:Courier New,monospace;font-size:11px;padding:7px 16px;cursor:pointer;';
      fb.textContent = f.name;
      fb.addEventListener('click', function(){
        storeFaction = f.id;
        ct.innerHTML = '';
        buildMCStore(ct);
      });
      fTabRow.appendChild(fb);
    });
    ct.appendChild(fTabRow);

    var cf = FACTIONS_MC.find(function(f){return f.id===storeFaction;});
    var sd = window._shipMenuData || {};
    var hostility = (sd.factionHostility||{})[storeFaction]||0;
    if (hostility >= 100) {
      var warDiv = document.createElement('div');
      warDiv.style.cssText = 'background:rgba(255,0,0,0.08);border:1px solid rgba(255,0,0,0.3);border-radius:10px;padding:20px;text-align:center;';
      warDiv.innerHTML = '<div style="color:#FF4444;font-size:14px;font-weight:bold;margin-bottom:8px;">⚠ AT WAR WITH '+((cf&&cf.name)||storeFaction).toUpperCase()+'</div>'
        +'<div style="color:rgba(255,100,100,0.6);font-size:12px;">You are not welcome here. End your war to access their shop.</div>';
      ct.appendChild(warDiv);
      return;
    }

    var grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;';
    grid.innerHTML = '<div style="color:rgba(150,200,255,0.3);font-size:12px;grid-column:1/-1;padding:20px;text-align:center;">Loading inventory...</div>';
    ct.appendChild(grid);

    window._lastStoreFaction = storeFaction;
    ST_SKT()?.emit('faction:getVendorStock', { factionId: storeFaction });
    function _handler(data) {
      if (data.factionId !== storeFaction) return;
      ST_SKT()?.off('faction:vendorStock', _handler);
      grid.innerHTML = '';
      if (!data.parts||!data.parts.length) {
        grid.innerHTML = '<div style="color:rgba(150,200,255,0.3);font-size:12px;grid-column:1/-1;padding:20px;text-align:center;">No parts in stock right now.</div>';
        return;
      }
      data.parts.forEach(function(part) {
        var rc = RC[part.rarity]||'#888', price = part.price||500;
        var bars = (window._shipMenuData && window._shipMenuData.bars !== undefined) ? window._shipMenuData.bars : (sd.bars||0);
        var canAfford = bars >= price;
        var card = document.createElement('div');
        card.style.cssText = 'background:rgba(0,12,28,0.85);border:2px solid '+rc+'55;border-radius:8px;padding:10px;';
        var ch = document.createElement('div');
        ch.innerHTML = '<span style="font-size:9px;color:'+rc+';font-weight:bold;">'+part.rarity.toUpperCase()+'</span>'
          +' <span style="font-size:9px;color:rgba(150,200,255,0.4);">'+(SI[part.slot]||'⧡')+' '+(SLOT_LABELS[part.slot]||part.slot)+'</span>';
        card.appendChild(ch);
        var cn = document.createElement('div');
        cn.style.cssText = 'color:#CCEEFF;font-size:11px;font-weight:bold;margin:4px 0 6px;line-height:1.3;';
        cn.textContent = part.name; card.appendChild(cn);
        if (part.passive){var cp=document.createElement('div');cp.style.cssText='font-size:9px;color:#FFAA44;margin-bottom:2px;';cp.textContent=part.passive;card.appendChild(cp);}
        if (part.special){var cs=document.createElement('div');cs.style.cssText='font-size:9px;color:#FF4488;margin-bottom:4px;';cs.textContent=part.special;card.appendChild(cs);}
        var bb = document.createElement('button');
        bb.style.cssText = 'width:100%;background:rgba(0,20,50,0.8);border:1px solid '+(canAfford?rc+'66':'rgba(100,100,100,0.3)')+';color:'+(canAfford?rc:'rgba(150,150,150,0.4)')+';font-family:Courier New,monospace;font-size:10px;padding:6px;border-radius:6px;cursor:'+(canAfford?'pointer':'not-allowed')+';';
        bb.textContent = price.toLocaleString()+' ★';
        bb.disabled = !canAfford;
        (function(pid,pr,pname){bb.addEventListener('click',function(){
          if(bb.disabled)return;
          ST_SKT()?.emit('faction:buyPart',{factionId:storeFaction,partId:pid,price:pr});
          bb.textContent='PURCHASING...'; bb.disabled=true;
          ST_NOTIFY('Purchasing '+pname+'...');
        });})(part.id,price,part.name);
        card.appendChild(bb);
        grid.appendChild(card);
      });
    }
    ST_SKT()?.on('faction:vendorStock', _handler);
  }

  // ── TAB 2: AUCTION ────────────────────────────────────────────────────────────
  function buildMCAuction(ct) {
    var sd = window._shipMenuData || {};
    var inv = sd.inventory || [];
    // Sub-tabs: Browse / My Listings
    var aTab = 'browse';
    var aTabRow = document.createElement('div');
    aTabRow.style.cssText = 'display:flex;gap:6px;margin-bottom:16px;';
    [['browse','BROWSE'],['mylist','MY LISTINGS'],['list','+ LIST PART']].forEach(function(td) {
      var ab = document.createElement('button');
      ab.dataset.atab = td[0];
      ab.style.cssText = 'background:rgba(0,12,28,0.8);border:1px solid rgba(0,100,200,0.2);border-radius:8px;color:rgba(150,200,255,0.5);font-family:Courier New,monospace;font-size:11px;padding:7px 14px;cursor:pointer;';
      ab.textContent = td[1];
      ab.addEventListener('click', function(){
        aTab = td[0];
        aTabRow.querySelectorAll('button').forEach(function(b){b.style.borderColor='rgba(0,100,200,0.2)';b.style.color='rgba(150,200,255,0.5)';});
        ab.style.borderColor='#00CCFF66'; ab.style.color='#00CCFF';
        renderATab();
      });
      if (td[0]==='browse'){ab.style.borderColor='#00CCFF66';ab.style.color='#00CCFF';}
      aTabRow.appendChild(ab);
    });
    ct.appendChild(aTabRow);
    var aContent = document.createElement('div');
    ct.appendChild(aContent);

    function renderATab() {
      aContent.innerHTML = '';
      if (aTab==='browse') renderBrowse();
      else if (aTab==='mylist') renderMyListings();
      else if (aTab==='list') renderListForm();
    }

    function renderBrowse() {
      aContent.innerHTML = '<div style="color:rgba(150,200,255,0.3);font-size:12px;padding:20px;text-align:center;">Loading listings...</div>';
      ST_SKT()?.emit('auction:getListings');
      ST_SKT()?.once('auction:listings', function(listings) {
        aContent.innerHTML = '';
        if (!listings||!listings.length) {
          aContent.innerHTML = '<div style="color:rgba(150,200,255,0.3);font-size:12px;padding:40px;text-align:center;">No parts listed yet.<br><span style="font-size:10px;">Be the first to list a part!</span></div>';
          return;
        }
        var grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;';
        listings.forEach(function(l) {
          var rc = RC[l.part.rarity]||'#888';
          var bars = (sd.bars||0);
          var canBuy = bars>=l.price && l.seller!==(sd.username||'');
          var card = document.createElement('div');
          card.style.cssText = 'background:rgba(0,12,28,0.85);border:2px solid '+rc+'55;border-radius:8px;padding:10px;';
          var timeLeft = Math.max(0,Math.ceil((l.expiry-Date.now())/3600000));
          card.innerHTML = '<div style="font-size:9px;color:'+rc+';font-weight:bold;">'+l.part.rarity.toUpperCase()+'</div>'
            +'<div style="font-size:9px;color:rgba(150,200,255,0.4);margin-bottom:4px;">'+(SLOT_LABELS[l.part.slot]||l.part.slot)+'</div>'
            +'<div style="color:#CCEEFF;font-size:11px;font-weight:bold;margin-bottom:4px;">'+l.part.name+'</div>'
            +'<div style="font-size:9px;color:rgba(150,200,255,0.35);margin-bottom:6px;">Seller: '+l.seller+' · '+timeLeft+'h left</div>';
          if (l.part.passive){var cp=document.createElement('div');cp.style.cssText='font-size:9px;color:#FFAA44;margin-bottom:2px;';cp.textContent=l.part.passive;card.appendChild(cp);}
          if (l.part.special){var cs=document.createElement('div');cs.style.cssText='font-size:9px;color:#FF4488;margin-bottom:4px;';cs.textContent=l.part.special;card.appendChild(cs);}
          var bb = document.createElement('button');
          bb.style.cssText = 'width:100%;background:rgba(0,20,50,0.8);border:1px solid '+(canBuy?'rgba(0,200,100,0.4)':'rgba(100,100,100,0.2)')+';color:'+(canBuy?'#44FF88':'rgba(150,150,150,0.3)')+';font-family:Courier New,monospace;font-size:10px;padding:6px;border-radius:6px;cursor:'+(canBuy?'pointer':'not-allowed')+';';
          bb.textContent = l.seller===(sd.username||'') ? 'YOUR LISTING' : (l.price.toLocaleString()+' ★');
          bb.disabled = !canBuy;
          (function(lid,pname){bb.addEventListener('click',function(){
            if(!confirm('Buy "'+pname+'" for '+l.price.toLocaleString()+' bars?'))return;
            ST_SKT()?.emit('auction:buy',{listingId:lid});
            bb.textContent='BUYING...'; bb.disabled=true;
            ST_SKT()?.once('auction:bought',function(d){
              ST_NOTIFY('Purchased: '+d.part.name+' for '+d.price.toLocaleString()+' bars!');
              bb.textContent='PURCHASED'; bb.style.color='#44FF88';
              if(window._shipMenuData){window._shipMenuData.inventory=window._shipMenuData.inventory||[];window._shipMenuData.inventory.push(d.part);}
            });
          });})(l.id,l.part.name);
          card.appendChild(bb);
          grid.appendChild(card);
        });
        aContent.appendChild(grid);
      });
    }

    function renderMyListings() {
      aContent.innerHTML = '<div style="color:rgba(150,200,255,0.3);font-size:12px;padding:20px;text-align:center;">Loading your listings...</div>';
      ST_SKT()?.emit('auction:getListings');
      ST_SKT()?.once('auction:listings', function(listings) {
        aContent.innerHTML = '';
        var mine = listings.filter(function(l){return l.seller===(sd.username||'');});
        if (!mine.length) { aContent.innerHTML='<div style="color:rgba(150,200,255,0.3);font-size:12px;padding:40px;text-align:center;">No active listings.</div>'; return; }
        mine.forEach(function(l) {
          var rc = RC[l.part.rarity]||'#888';
          var row = document.createElement('div');
          row.style.cssText = 'background:rgba(0,12,28,0.8);border:1px solid '+rc+'44;border-radius:8px;padding:10px;margin-bottom:8px;display:flex;align-items:center;gap:12px;';
          var timeLeft = Math.max(0,Math.ceil((l.expiry-Date.now())/3600000));
          row.innerHTML = '<div style="flex:1;"><div style="font-size:9px;color:'+rc+';font-weight:bold;">'+l.part.rarity.toUpperCase()+' · '+(SLOT_LABELS[l.part.slot]||l.part.slot)+'</div>'
            +'<div style="color:#CCEEFF;font-size:11px;font-weight:bold;">'+l.part.name+'</div>'
            +'<div style="font-size:9px;color:rgba(150,200,255,0.35);">'+l.price.toLocaleString()+' ★ · '+timeLeft+'h left</div></div>';
          var cb = document.createElement('button');
          cb.style.cssText = 'background:none;border:1px solid rgba(255,80,80,0.3);color:rgba(255,100,100,0.6);font-family:Courier New,monospace;font-size:10px;padding:5px 10px;border-radius:6px;cursor:pointer;';
          cb.textContent = 'CANCEL';
          (function(lid){cb.addEventListener('click',function(){
            if(!confirm('Cancel listing and return part to inventory?'))return;
            ST_SKT()?.emit('auction:cancel',{listingId:lid});
            row.style.opacity='0.4'; cb.disabled=true;
          });})(l.id);
          row.appendChild(cb);
          aContent.appendChild(row);
        });
      });
    }

    function renderListForm() {
      if (!inv.length) {
        aContent.innerHTML='<div style="color:rgba(150,200,255,0.3);font-size:12px;padding:40px;text-align:center;">No parts in inventory to list.</div>';
        return;
      }
      var sel = document.createElement('select');
      sel.style.cssText = 'width:100%;background:rgba(0,15,35,0.8);border:1px solid rgba(0,100,200,0.3);border-radius:8px;color:#AACCFF;font-family:Courier New,monospace;font-size:11px;padding:8px 10px;margin-bottom:10px;';
      inv.forEach(function(p) {
        var o=document.createElement('option'); o.value=p.id;
        o.textContent=p.rarity+' '+p.name+' ('+p.slot+')'; sel.appendChild(o);
      });
      aContent.appendChild(sel);
      var priceLbl = document.createElement('div');
      priceLbl.style.cssText = 'color:rgba(150,200,255,0.5);font-size:10px;margin-bottom:4px;';
      priceLbl.textContent = 'SET PRICE (bars)';
      aContent.appendChild(priceLbl);
      var priceInput = document.createElement('input');
      priceInput.type='number'; priceInput.min='1'; priceInput.value='1000';
      priceInput.style.cssText='width:100%;background:rgba(0,15,35,0.8);border:1px solid rgba(0,100,200,0.3);border-radius:8px;color:#AACCFF;font-family:Courier New,monospace;font-size:13px;padding:8px 10px;margin-bottom:12px;box-sizing:border-box;';
      aContent.appendChild(priceInput);
      var listBtn = document.createElement('button');
      listBtn.style.cssText='width:100%;background:rgba(0,30,10,0.9);border:1px solid rgba(0,200,100,0.4);color:#44FF88;font-family:Courier New,monospace;font-size:12px;padding:10px;border-radius:8px;cursor:pointer;';
      listBtn.textContent='LIST FOR SALE (24h)';
      listBtn.addEventListener('click',function(){
        var price=parseInt(priceInput.value)||0;
        if(price<1){ST_NOTIFY('Enter a valid price.');return;}
        ST_SKT()?.emit('auction:list',{partId:sel.value,price:price});
        listBtn.textContent='LISTING...'; listBtn.disabled=true;
        ST_SKT()?.once('auction:listed',function(){
          ST_NOTIFY('Part listed on auction house!');
          aTab='mylist'; renderATab();
        });
      });
      aContent.appendChild(listBtn);
    }
    renderATab();
  }

  // ── TAB 3: BOUNTY BOARD ───────────────────────────────────────────────────────
  function buildMCBounty(ct) {
    var sd = window._shipMenuData || {};
    // Place bounty form
    var formDiv = document.createElement('div');
    formDiv.style.cssText = 'background:rgba(0,12,28,0.8);border:1px solid rgba(255,150,0,0.2);border-radius:10px;padding:14px;margin-bottom:16px;';
    formDiv.innerHTML = '<div style="color:#FF8844;font-size:11px;font-weight:bold;letter-spacing:0.1em;margin-bottom:10px;">☠ PLACE BOUNTY</div>';
    var nameInput = document.createElement('input');
    nameInput.type='text'; nameInput.placeholder='Player username...';
    nameInput.style.cssText='width:100%;background:rgba(0,15,35,0.8);border:1px solid rgba(0,100,200,0.3);border-radius:8px;color:#AACCFF;font-family:Courier New,monospace;font-size:11px;padding:7px 10px;margin-bottom:8px;box-sizing:border-box;';
    nameInput.addEventListener('keydown',function(e){e.stopPropagation();});
    nameInput.addEventListener('keyup',function(e){e.stopPropagation();});
    formDiv.appendChild(nameInput);
    var shipsDiv = document.createElement('div');
    shipsDiv.style.cssText = 'margin-bottom:8px;';
    formDiv.appendChild(shipsDiv);
    var amountInput = document.createElement('input');
    amountInput.type='number'; amountInput.min='100'; amountInput.placeholder='Amount (min 100 bars)...';
    amountInput.style.cssText='width:100%;background:rgba(0,15,35,0.8);border:1px solid rgba(0,100,200,0.3);border-radius:8px;color:#AACCFF;font-family:Courier New,monospace;font-size:11px;padding:7px 10px;margin-bottom:8px;box-sizing:border-box;';
    amountInput.addEventListener('keydown',function(e){e.stopPropagation();});
    amountInput.addEventListener('keyup',function(e){e.stopPropagation();});
    formDiv.appendChild(amountInput);
    var selectedShipId = null;
    var postBtn = document.createElement('button');
    postBtn.style.cssText='width:100%;background:rgba(40,0,0,0.9);border:1px solid rgba(255,80,0,0.4);color:#FF8844;font-family:Courier New,monospace;font-size:11px;padding:8px;border-radius:8px;cursor:pointer;';
    postBtn.textContent='POST BOUNTY';
    formDiv.appendChild(postBtn);
    ct.appendChild(formDiv);

    // Lookup ships on name input
    var _lookupTimer = null;
    nameInput.addEventListener('input', function(){
      clearTimeout(_lookupTimer);
      _lookupTimer = setTimeout(function(){
        var name = nameInput.value.trim();
        if (!name) { shipsDiv.innerHTML=''; return; }
        ST_SKT()?.emit('bounty:getPlayerShips',{targetUsername:name});
        ST_SKT()?.once('bounty:playerShips',function(data){
          shipsDiv.innerHTML='';
          selectedShipId=null;
          if(!data.ships||!data.ships.length){shipsDiv.innerHTML='<div style="color:rgba(255,100,100,0.5);font-size:10px;">No ships found.</div>';return;}
          data.ships.forEach(function(ship){
            var sb=document.createElement('button');
            sb.style.cssText='display:block;width:100%;text-align:left;background:rgba(0,15,35,0.8);border:1px solid rgba(0,100,200,0.2);border-radius:6px;color:rgba(150,200,255,0.7);font-family:Courier New,monospace;font-size:10px;padding:6px 10px;margin-bottom:4px;cursor:pointer;';
            sb.textContent=ship.name+' ('+ship.quality+' '+ship.class+' Rank '+ship.rank+')';
            sb.addEventListener('click',function(){
              selectedShipId=ship.id;
              shipsDiv.querySelectorAll('button').forEach(function(b){b.style.borderColor='rgba(0,100,200,0.2)';b.style.color='rgba(150,200,255,0.7)';});
              sb.style.borderColor='#FF884488'; sb.style.color='#FF8844';
            });
            shipsDiv.appendChild(sb);
          });
        });
      }, 500);
    });

    postBtn.addEventListener('click',function(){
      var name=nameInput.value.trim(), amount=parseInt(amountInput.value)||0;
      if(!name||!selectedShipId){ST_NOTIFY('Select a player and ship first.');return;}
      if(amount<100){ST_NOTIFY('Minimum bounty is 100 bars.');return;}
      if(confirm('Post '+amount.toLocaleString()+' bars bounty? This cannot be refunded.')){
        ST_SKT()?.emit('bounty:postBounty',{targetUsername:name,targetShipId:selectedShipId,amount:amount});
        ST_SKT()?.once('bounty:posted',function(data){
          ST_NOTIFY('Bounty posted: '+data.total.toLocaleString()+' bars on '+data.shipName+'!');
          ct.innerHTML = '';
          buildMCBounty(ct);
        });
      }
    });

    // Bounty leaderboard
    var lbHdr = document.createElement('div');
    lbHdr.style.cssText = 'color:rgba(255,150,0,0.6);font-size:10px;letter-spacing:0.1em;font-weight:bold;margin-bottom:8px;';
    lbHdr.textContent = 'ACTIVE BOUNTIES';
    ct.appendChild(lbHdr);
    var board = document.createElement('div');
    board.innerHTML = '<div style="color:rgba(150,200,255,0.3);font-size:11px;padding:10px;">Loading...</div>';
    ct.appendChild(board);
    ST_SKT()?.emit('bounty:getBoard');
    ST_SKT()?.once('bounty:boardData',function(data){
      board.innerHTML='';
      if(!data||!data.length){board.innerHTML='<div style="color:rgba(150,200,255,0.3);font-size:11px;padding:10px;">No active bounties.</div>';return;}
      data.forEach(function(b,i){
        var row=document.createElement('div');
        row.style.cssText='display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(0,50,100,0.2);font-size:11px;';
        var medals=['#FFD700','#C0C0C0','#CD7F32'];
        row.innerHTML='<span style="color:'+(medals[i]||'rgba(150,200,255,0.3)')+';min-width:20px;font-size:10px;">#'+(i+1)+'</span>'
          +'<div style="flex:1;"><div style="color:#FF8844;font-weight:bold;">'+b.shipName+'</div>'
          +'<div style="color:rgba(150,200,255,0.4);font-size:9px;">'+b.username+'</div></div>'
          +'<div style="color:#FFDD44;font-weight:bold;">★ '+b.amount.toLocaleString()+'</div>';
        board.appendChild(row);
      });
    });
  }

  // ── TAB 4: SINGULARITY ────────────────────────────────────────────────────────
  function buildMCGames(ct) {
    ST_SKT()?.emit('game:getState');
    // Warzone card
    var wDiv=document.createElement('div');
    wDiv.style.cssText='background:rgba(0,12,28,0.85);border:1px solid rgba(255,100,50,0.3);border-radius:10px;padding:16px;margin-bottom:14px;';
    wDiv.innerHTML='<div style="color:#FF8844;font-size:13px;font-weight:bold;letter-spacing:0.1em;margin-bottom:6px;">WARZONE</div>'
      +'<div style="color:rgba(150,200,255,0.45);font-size:11px;line-height:1.7;margin-bottom:10px;">Free-for-all in zones 4-1, 4-2, 5-1, 5-2. Shrinking gas cloud. Last alive wins. Runs every 3 min.</div>';
    var wStatus=document.createElement('div'); wStatus.id='mcWzStatus';
    wStatus.style.cssText='color:rgba(150,200,255,0.5);font-size:11px;margin-bottom:10px;';
    wStatus.textContent='Loading...';
    wDiv.appendChild(wStatus);
    var wJoin=document.createElement('button');
    wJoin.style.cssText='background:rgba(40,0,0,0.9);border:1px solid rgba(255,80,0,0.4);color:#FF8844;font-family:Courier New,monospace;font-size:12px;padding:9px 20px;border-radius:8px;cursor:pointer;margin-right:8px;';
    wJoin.textContent='JOIN QUEUE';
    var _wJoinQueued = false;
    wJoin.addEventListener('click',function(){
      if (_wJoinQueued) return;
      ST_SKT()?.emit('game:joinWarzone');
      _wJoinQueued = true;
      wJoin.style.display = 'none';
      // Replace button with instructions panel
      var wInstr = document.createElement('div');
      wInstr.id = 'mcWzInstr';
      wInstr.style.cssText = 'background:rgba(255,120,0,0.08);border:1px solid rgba(255,120,0,0.35);'
        + 'border-radius:8px;padding:12px 14px;margin-bottom:8px;';
      wInstr.innerHTML = '<div style="color:#FF8844;font-size:12px;font-weight:bold;letter-spacing:0.1em;margin-bottom:6px;">⚔ QUEUED FOR WARZONE</div>'
        + '<div style="color:#FFCC44;font-size:11px;margin-bottom:6px;">ENTER YOUR SHIP AND UNDOCK NOW</div>'
        + '<div style="color:rgba(150,200,255,0.6);font-size:11px;margin-bottom:4px;">You will be warped into the arena when the battle starts.</div>'
        + '<div style="color:rgba(150,200,255,0.5);font-size:10px;" id="mcWzCountdown">Loading...</div>';
      wDiv.insertBefore(wInstr, wStatus);
      // Countdown ticker
      var _wzt = setInterval(function() {
        var el = document.getElementById('mcWzCountdown');
        if (!el) { clearInterval(_wzt); return; }
        var stEl = document.getElementById('mcWzStatus');
        var isActive = stEl && stEl.textContent.indexOf('IN PROGRESS') >= 0;
        if (isActive) {
          el.textContent = 'BATTLE IN PROGRESS -- You will be warped in next round!';
        } else {
          // Use arenaState nextStart if available
          var secs = window._wzNextStart ? Math.max(0,Math.round((window._wzNextStart-Date.now())/1000)) : 0;
          el.textContent = secs > 0 ? 'Next battle in '+Math.floor(secs/60)+':'+(('0'+(secs%60)).slice(-2)) : 'Starting soon...';
        }
      }, 1000);
    });
    // Store nextStart for countdown
    ST_SKT()?.on('game:arenaState', function(d) { if(d.nextStart) window._wzNextStart = d.nextStart; });
    var wSpec=document.createElement('button');
    wSpec.style.cssText='background:rgba(0,15,35,0.8);border:1px solid rgba(0,150,255,0.3);color:rgba(100,180,255,0.8);font-family:Courier New,monospace;font-size:11px;padding:9px 16px;border-radius:8px;cursor:pointer;';
    wSpec.textContent='SPECTATE';
    wSpec.addEventListener('click',function(){ openSpectator('warzone'); });
    wDiv.appendChild(wJoin); wDiv.appendChild(wSpec);
    ct.appendChild(wDiv);
    // Payout table
    var pDiv=document.createElement('div');
    pDiv.style.cssText='background:rgba(0,8,20,0.8);border:1px solid rgba(0,100,200,0.2);border-radius:10px;padding:12px;';
    pDiv.innerHTML='<div style="color:rgba(150,200,255,0.5);font-size:10px;letter-spacing:0.1em;margin-bottom:8px;">PAYOUT MULTIPLIERS</div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      +'<span style="color:#FFDD44;font-size:10px;">#1 x11</span>'
      +'<span style="color:rgba(255,220,50,0.7);font-size:10px;">#2 x9</span>'
      +'<span style="color:rgba(255,220,50,0.6);font-size:10px;">#3 x7.5</span>'
      +'<span style="color:rgba(255,220,50,0.4);font-size:10px;">... last x2</span>'
      +'</div>'
      +'<div style="color:rgba(150,200,255,0.3);font-size:10px;margin-top:6px;">Applied to your current bar balance. Must undock to 1-1 to participate.</div>';
    ct.appendChild(pDiv);
    // State listeners
    function _gh(d){
      var el=document.getElementById(d.gameType==='race'?'mcRaceStatus':'mcWzStatus');
      if(!el)return;
      var msg=d.state==='idle'?'Waiting for players...'
        :d.state==='queuing'?'Queuing: '+(d.count||0)+'/'+(d.max||10)+' players'
        :d.state==='countdown'?'Starting! '+(d.count||0)+' players ready'
        :d.state==='active'?'IN PROGRESS -- '+(d.count||0)+' participants'
        :d.state==='payout'?'Finished -- results posted':'';
      el.textContent=msg;
    }
    ST_SKT()?.on('game:state',_gh);
    ST_SKT()?.on('game:raceQueue',function(d){var el=document.getElementById('mcRaceStatus');if(el)el.textContent='Queuing: '+d.count+'/'+d.max+' players';});
    ST_SKT()?.on('game:warzoneQueue',function(d){var el=document.getElementById('mcWzStatus');if(el)el.textContent='Queuing: '+d.count+'/'+d.max+' players';});
  ST_SKT()?.on('station:dailyBonus', function(d) {
    // Show on the house message
    var msg = document.createElement('div');
    msg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);'
      + 'background:rgba(0,8,22,0.96);border:1px solid rgba(255,200,50,0.6);border-radius:14px;'
      + 'padding:28px 40px;z-index:850;font-family:Courier New,monospace;text-align:center;';
    msg.innerHTML = '<div style="color:#FFDD44;font-size:22px;font-weight:bold;letter-spacing:0.15em;margin-bottom:10px;">★ 1,000 BARS</div>'
      + '<div style="color:rgba(255,220,50,0.7);font-size:13px;margin-bottom:6px;">ON THE HOUSE</div>'
      + '<div style="color:rgba(150,200,255,0.5);font-size:11px;">Come back tomorrow for another round, friend.</div>';
    document.body.appendChild(msg);
    setTimeout(function(){ msg.remove(); }, 4000);
    // Update bar HUD
    if (window._stBarsUpdate) window._stBarsUpdate();
  });
  }

  function openSpectator(gameType) {
    var sov=document.createElement('div');
    sov.style.cssText='position:fixed;inset:0;background:#000;z-index:900;display:flex;flex-direction:column;font-family:Courier New,monospace;';
    var shdr=document.createElement('div');
    shdr.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:8px 16px;background:rgba(0,8,22,0.9);border-bottom:1px solid rgba(0,200,255,0.2);flex-shrink:0;';
    var stitle=document.createElement('span');
    stitle.style.cssText='color:#00CCFF;font-size:13px;font-weight:bold;letter-spacing:0.1em;';
    stitle.textContent=(gameType==='race'?'RACE SPECTATOR':'WARZONE SPECTATOR');
    var scls=document.createElement('button');
    scls.textContent='X'; scls.style.cssText='background:none;border:none;color:rgba(255,255,255,0.3);font-size:18px;cursor:pointer;';
    shdr.appendChild(stitle); shdr.appendChild(scls);
    sov.appendChild(shdr);
    var W=window.innerWidth, H=window.innerHeight-44;
    var sc=document.createElement('canvas'); sc.width=W; sc.height=H;
    sc.style.cssText='display:block;background:#000810;';
    sov.appendChild(sc);
    document.body.appendChild(sov);
    var ctx=sc.getContext('2d');
    var spd={positions:[],waypoints:[],gasRadius:0,elapsed:0};
    var WORLD=4000, scale=Math.min(W,H)/WORLD*0.85;
    var offX=W/2-WORLD/2*scale, offY=H/2-WORLD/2*scale;
    function wx(x){return offX+x*scale;}
    function wy(y){return offY+y*scale;}
    ST_SKT()?.emit('game:spectate',{gameType:gameType});
    ST_SKT()?.on('game:spectateData',function(d){if(d.gameType===gameType)spd.waypoints=d.waypoints||[];});
    ST_SKT()?.on('game:racePositions',function(d){if(gameType==='race'){spd.positions=d.positions||[];spd.elapsed=d.elapsed||0;}});
    ST_SKT()?.on('game:warzonePositions',function(d){if(gameType==='warzone'){spd.positions=d.positions||[];}});
    ST_SKT()?.on('game:gasUpdate',function(d){spd.gasRadius=d.gasRadius||0;});
    function drawSpec(){
      ctx.fillStyle='#000810'; ctx.fillRect(0,0,W,H);
      for(var i=0;i<80;i++){ctx.fillStyle='rgba(255,255,255,0.12)';ctx.fillRect(((i*137)%W),((i*97)%H),1,1);}
      if(gameType==='race'){
        spd.waypoints.forEach(function(wp,i){
          ctx.strokeStyle='rgba(255,220,50,0.4)'; ctx.lineWidth=1;
          ctx.beginPath(); ctx.arc(wx(wp.x),wy(wp.y),wp.r*scale,0,Math.PI*2); ctx.stroke();
          ctx.fillStyle='rgba(255,220,50,0.6)'; ctx.font='10px Courier New'; ctx.textAlign='center';
          ctx.fillText(wp.label,wx(wp.x),wy(wp.y)-wp.r*scale-4);
        });
      }
      if(gameType==='warzone'&&spd.gasRadius>0){
        ctx.save(); ctx.globalAlpha=0.2;
        var gg=ctx.createRadialGradient(W/2,H/2,spd.gasRadius*scale,W/2,H/2,WORLD*scale);
        gg.addColorStop(0,'transparent'); gg.addColorStop(1,'rgba(80,200,80,0.9)');
        ctx.fillStyle=gg; ctx.fillRect(0,0,W,H); ctx.restore();
        ctx.strokeStyle='rgba(100,255,100,0.7)'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(W/2,H/2,spd.gasRadius*scale,0,Math.PI*2); ctx.stroke();
      }
      spd.positions.forEach(function(p){
        var px=wx(p.x||2000),py=wy(p.y||2000);
        var col=p.isBot?'rgba(150,150,150,0.7)':(p.alive===false?'rgba(255,50,50,0.4)':'#00CCFF');
        ctx.fillStyle=col; ctx.beginPath(); ctx.arc(px,py,6,0,Math.PI*2); ctx.fill();
        ctx.fillStyle=p.alive===false?'rgba(255,100,100,0.4)':'rgba(255,255,255,0.85)';
        ctx.font='9px Courier New'; ctx.textAlign='center';
        ctx.fillText(p.username+(p.kills?' ['+p.kills+']':''),px,py-10);
        if(gameType==='race'&&p.wpIdx!==undefined){
          ctx.fillStyle='rgba(255,220,50,0.6)'; ctx.font='8px Courier New';
          ctx.fillText('WP '+p.wpIdx+'/8',px,py+15);
        }
      });
      var alive=spd.positions.filter(function(p){return p.alive!==false;}).length;
      ctx.fillStyle='rgba(150,200,255,0.5)'; ctx.font='11px Courier New'; ctx.textAlign='left';
      ctx.fillText((gameType==='race'?'RACE':'WARZONE -- Gas: '+Math.round(spd.gasRadius)+'u')+' | '+alive+' active | '+spd.elapsed+'s',10,18);
    }
    var _si=setInterval(drawSpec,100);
    function _closeSpec(){ clearInterval(_si); ST_SKT()?.emit('game:unspectate',{gameType:gameType}); sov.remove(); }
    scls.onclick=_closeSpec;
  }

  function buildMCSingularity(ct) {
    var sd = window._shipMenuData || {};
    var singCount = sd.singularityCount || 0;
    var matrixTier = sd.matrixTier || 0;
    var frags = sd.singularityFragments || 0;
    var chips = window._myChips || 0;
    var isInfinity = !isFinite(chips);
    var expShip = sd.experimentalShip || null;
    var RATES = [0.1,0.15,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0,1.1,1.2,1.3,1.4,1.5,1.6,1.7,1.8,2.0];
    var curRate = matrixTier > 0 ? RATES[matrixTier-1] : 0;
    var nextCost = matrixTier < 20 ? Math.pow(10, 5+matrixTier*2) : null;

    // ── SINGULARITY COUNT ──
    var singDiv = document.createElement('div');
    singDiv.style.cssText = 'text-align:center;margin-bottom:16px;';
    singDiv.innerHTML = '<div style="font-size:36px;">⭑</div>'
      +'<div style="color:#AA88FF;font-size:20px;font-weight:bold;letter-spacing:0.2em;">'+singCount+' SINGULARIT'+(singCount===1?'Y':'IES')+'</div>'
      +(frags>0?'<div style="color:rgba(170,100,255,0.5);font-size:11px;margin-top:4px;">'+frags+'/10 fragments</div>':'');
    ct.appendChild(singDiv);

    // ── MATRIX ARRAY ──
    var matDiv = document.createElement('div');
    matDiv.style.cssText = 'background:rgba(0,20,50,0.8);border:1px solid rgba(0,150,255,0.3);border-radius:12px;padding:16px;margin-bottom:14px;';
    matDiv.innerHTML = '<div style="color:#44CCFF;font-size:12px;font-weight:bold;letter-spacing:0.1em;margin-bottom:6px;">⚙ MATRIX ARRAY TUMBLER  Tier '+matrixTier+'/20</div>'
      +'<div style="color:#FFDD44;font-size:11px;margin-bottom:8px;">Chip income: '+(curRate>0?curRate.toFixed(2)+'%/min':'INACTIVE'+(matrixTier===0?' -- upgrade to activate':''))+'</div>'
      +'<div style="color:rgba(150,200,255,0.4);font-size:10px;margin-bottom:10px;">Chips: '+(isInfinity?'♾ INFINITY':(isFinite(chips)?chips.toExponential(2):'0'))+'</div>';
    if (nextCost !== null) {
      var upBtn = document.createElement('button');
      upBtn.style.cssText = 'background:rgba(0,20,60,0.9);border:1px solid rgba(0,150,255,0.4);color:#88CCFF;font-family:Courier New,monospace;font-size:11px;padding:8px 16px;border-radius:8px;cursor:pointer;';
      upBtn.textContent = 'UPGRADE → '+(RATES[matrixTier]||2).toFixed(2)+'%/min | '+nextCost.toExponential(2)+' bars';
      upBtn.addEventListener('click', function(){ ST_SKT()?.emit('matrix:upgrade'); });
      matDiv.appendChild(upBtn);
    } else {
      matDiv.innerHTML += '<div style="color:rgba(0,255,100,0.6);font-size:11px;">MAX TIER -- Singularity generation active</div>';
    }
    ct.appendChild(matDiv);

    // ── SINGULARITY PURCHASE ──
    var purchDiv = document.createElement('div');
    purchDiv.style.cssText = 'background:rgba(80,0,150,0.12);border:1px solid rgba(150,0,255,0.3);border-radius:12px;padding:16px;margin-bottom:14px;';
    purchDiv.innerHTML = '<div style="color:#AA88FF;font-size:12px;font-weight:bold;letter-spacing:0.1em;margin-bottom:6px;">COMPRESS INFINITY</div>'
      +'<div style="color:rgba(150,200,255,0.5);font-size:11px;line-height:1.7;margin-bottom:10px;">Reach ♾ INFINITY chips, then compress into a Singularity.<br>Chips reset to 0. Bars reset to 1e55.</div>'
      +(isInfinity?'<div style="color:#AA88FF;font-size:13px;margin-bottom:8px;">♾ READY</div>':'<div style="color:rgba(150,200,255,0.35);font-size:11px;margin-bottom:8px;">Chip balance must reach INFINITY</div>');
    var purchBtn = document.createElement('button');
    purchBtn.style.cssText = 'background:rgba(80,0,150,0.8);border:1px solid rgba(150,0,255,0.6);color:#CC88FF;font-family:Courier New,monospace;font-size:11px;padding:9px 18px;border-radius:8px;cursor:pointer;opacity:'+(isInfinity?'1':'0.3')+';';
    purchBtn.textContent = 'COMPRESS → 1 SINGULARITY';
    purchBtn.addEventListener('click', function(){
      if (!isInfinity){ alert('Chip balance must reach INFINITY first.'); return; }
      if (confirm('Clear ALL chips and reset bars to 1e55 for 1 Singularity?')) ST_SKT()?.emit('singularity:purchase');
    });
    purchDiv.appendChild(purchBtn);
    ct.appendChild(purchDiv);

    // ── EXPERIMENTAL SHIP ──
    var expDiv = document.createElement('div');
    expDiv.style.cssText = 'background:rgba(20,0,40,0.9);border:1px solid rgba(150,0,255,0.4);border-radius:12px;padding:16px;margin-bottom:14px;';
    var SLOTS = ['engine','shield','weapon1','weapon2','warp','nav'];
    if (!expShip) {
      expDiv.innerHTML = '<div style="color:#AA88FF;font-size:12px;font-weight:bold;margin-bottom:6px;">🔬 EXPERIMENTAL VESSEL</div>'
        +'<div style="color:rgba(150,200,255,0.4);font-size:11px;margin-bottom:10px;">Craft using Singularity technology. 1 Singularity for frame + 1 per slot.</div>';
      if (singCount>=1) {
        var craftBtn=document.createElement('button');
        craftBtn.style.cssText='background:rgba(80,0,150,0.8);border:1px solid rgba(150,0,255,0.6);color:#CC88FF;font-family:Courier New,monospace;font-size:11px;padding:8px 16px;border-radius:8px;cursor:pointer;';
        craftBtn.textContent='CRAFT FRAME [1 ⭑]';
        craftBtn.addEventListener('click',function(){ if(confirm('Use 1 Singularity for frame?')) ST_SKT()?.emit('experimental:craftFrame'); });
        expDiv.appendChild(craftBtn);
      } else {
        expDiv.innerHTML+='<div style="color:rgba(150,100,255,0.4);font-size:11px;">Need 1 Singularity to begin.</div>';
      }
    } else {
      expDiv.innerHTML='<div style="color:#AA88FF;font-size:12px;font-weight:bold;margin-bottom:2px;">🔬 EXPERIMENTAL VESSEL</div>'
        +'<div style="color:rgba(255,80,255,0.6);font-size:10px;letter-spacing:0.2em;margin-bottom:10px;">⚠ TOP SECRET ⚠</div>';
      SLOTS.forEach(function(slot){
        var filled=expShip.slots&&expShip.slots[slot];
        var row=document.createElement('div');
        row.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:5px;';
        row.innerHTML='<div style="color:rgba(150,200,255,0.5);font-size:10px;width:60px;">'+slot.toUpperCase()+'</div>';
        if(filled){
          row.innerHTML+='<div style="color:#AA88FF;font-size:10px;">'+filled.name+'</div>';
        } else {
          var iBtn=document.createElement('button');
          iBtn.style.cssText='background:rgba(40,0,80,0.8);border:1px solid rgba(100,0,200,0.4);color:#8844CC;font-family:Courier New,monospace;font-size:10px;padding:3px 10px;border-radius:6px;cursor:pointer;';
          iBtn.textContent=singCount>=1?'INSTALL [1 ⭑]':'NEED ⭑';
          if(singCount>=1) iBtn.addEventListener('click',function(){
            var inv=(window._shipMenuData&&window._shipMenuData.inventory)||[];
            var part=inv.find(function(p){return p.slot===slot;});
            if(!part){alert('No '+slot+' part in inventory.');return;}
            ST_SKT()?.emit('experimental:installSlot',{slot:slot,partId:part.id});
          });
          row.appendChild(iBtn);
        }
        expDiv.appendChild(row);
      });
      expDiv.innerHTML+='<div style="color:rgba(150,100,255,0.4);font-size:10px;margin-top:6px;">'+Object.keys(expShip.slots||{}).length+'/6 slots -- cannot fly until Serenity update</div>';
    }
    ct.appendChild(expDiv);

    // ── EVENT LISTENERS ──
    ST_SKT()?.on('singularity:result',function(d){if(d.error){alert(d.error);return;}if(window._shipMenuData){window._shipMenuData.singularityCount=d.singularityCount;window._shipMenuData.bars=d.bars;}renderMCTab();});
    ST_SKT()?.on('matrix:upgradeResult',function(d){if(d.error){alert(d.error);return;}if(window._shipMenuData){window._shipMenuData.matrixTier=d.tier;window._shipMenuData.bars=d.bars;}if(window._stBarsUpdate)window._stBarsUpdate();renderMCTab();});
    ST_SKT()?.on('experimental:result',function(d){if(d.error){alert(d.error);return;}if(window._shipMenuData){window._shipMenuData.experimentalShip=d.ship;window._shipMenuData.singularityCount=d.singularityCount;}renderMCTab();});
    ST_SKT()?.on('singularity:gained',function(d){if(window._shipMenuData)window._shipMenuData.singularityCount=d.count;var m=document.createElement('div');m.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(30,0,60,0.97);border:2px solid rgba(150,0,255,0.8);border-radius:14px;padding:32px 48px;z-index:850;font-family:Courier New,monospace;text-align:center;';m.innerHTML='<div style="font-size:48px;">⭑</div><div style="color:#AA88FF;font-size:18px;font-weight:bold;">SINGULARITY OBTAINED</div>';document.body.appendChild(m);setTimeout(function(){m.remove();},5000);});
    ST_SKT()?.on('singularity:infinityReached',function(){var m=document.createElement('div');m.style.cssText='position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);background:rgba(10,0,30,0.97);border:2px solid rgba(150,0,255,0.9);border-radius:14px;padding:32px 48px;z-index:850;font-family:Courier New,monospace;text-align:center;pointer-events:none;';m.innerHTML='<div style="font-size:40px;">♾</div><div style="color:#AA88FF;font-size:20px;font-weight:bold;letter-spacing:0.3em;">INFINITY REACHED</div><div style="color:rgba(170,100,255,0.7);font-size:12px;">Visit the Singularity tab to compress.</div>';document.body.appendChild(m);setTimeout(function(){m.remove();},6000);});
    ST_SKT()?.on('station:passiveIncome',function(d){if(window._shipMenuData)window._shipMenuData.bars=(window._shipMenuData.bars||0)+d.gain;if(window._stBarsUpdate)window._stBarsUpdate();});
  }

  document.body.appendChild(ov);
  ov.addEventListener('keydown',function(e){if(e.code==='Escape')ov.remove();});
  renderMCTab();
};

// ── MUSIC ─────────────────────────────────────────────────────────────────────
let stMusicEl=null;
function startStationMusic() {
  if (window._bgMusic) { window._bgMusicVol=window._bgMusic.volume; window._bgMusic.volume=0; }
  stMusicEl=new Audio("/music1.mp3"); stMusicEl.loop=true; stMusicEl.volume=0;
  stMusicEl.play().then(()=>{
    let v=0; const fi=setInterval(()=>{v=Math.min(v+0.015,0.3);stMusicEl.volume=v;if(v>=0.3)clearInterval(fi);},80);
  }).catch(()=>{});
}
function stopStationMusic() {
  if (stMusicEl){stMusicEl.pause();stMusicEl=null;}
  if (window._bgMusic) window._bgMusic.volume=window._bgMusicVol||0.35;
}

// ── INPUT ─────────────────────────────────────────────────────────────────────
document.addEventListener("keydown",e=>{
  if (!stationActive) return;
  if (window.dsActive) return; // deepspace owns keyboard while flying
  // Block movement while typing in chat
  var _ae = document.activeElement;
  var _typing = _ae && (_ae.tagName==='INPUT'||_ae.tagName==='TEXTAREA');
  if (_typing) return;
  stKeys[e.code]=true;
  if (e.code==="Space"&&stIsGrounded){stVelocityY=7;stIsGrounded=false;}
  if (e.code==="KeyE") { if (nearestSt) nearestSt.interact(); }
});
document.addEventListener("keyup",e=>{ if (stationActive) stKeys[e.code]=false; });

// ── COLLISION ─────────────────────────────────────────────────────────────────
function stResolve(pos) {
  stColliders.forEach(c=>{
    const cx=Math.max(c.minX,Math.min(pos.x,c.maxX)),cz=Math.max(c.minZ,Math.min(pos.z,c.maxZ));
    const dx=pos.x-cx,dz=pos.z-cz,dist=Math.sqrt(dx*dx+dz*dz);
    if(dist<0.5&&dist>0){const p=(0.5-dist)/dist;pos.x+=dx*p;pos.z+=dz*p;}
  });
  const d=Math.sqrt(pos.x*pos.x+pos.z*pos.z);
  if(d>50){pos.x*=49/d;pos.z*=49/d;}
}

// ── LOOP ──────────────────────────────────────────────────────────────────────
let nearestSt=null;
function stLoop() {
  if (!stationActive) return;
  stAnimId=requestAnimationFrame(stLoop);
  const dt=Math.min(stClock.getDelta(),0.05);
  stTime+=dt;

  // Player movement -- drive stPlayerPos, not camera directly
  const T=window.THREE;
  var _stj = window._stJoy || {};
  var _stjWasActive = window._stjWasActive || false;
  if (_stj.active) {
    // Mobile joystick overrides keyboard
    stKeys['KeyW'] = _stj.dy < -0.2;
    stKeys['KeyS'] = _stj.dy >  0.2;
    stKeys['KeyA'] = _stj.dx < -0.2;
    stKeys['KeyD'] = _stj.dx >  0.2;
    window._stjWasActive = true;
  } else if (_stjWasActive) {
    // Finger lifted -- stop movement but dont block keyboard
    stKeys['KeyW'] = false; stKeys['KeyS'] = false;
    stKeys['KeyA'] = false; stKeys['KeyD'] = false;
    window._stjWasActive = false;
  }
  const fwd=new T.Vector3(-Math.sin(stYaw),0,-Math.cos(stYaw));
  const right=new T.Vector3(Math.cos(stYaw),0,-Math.sin(stYaw));
  const move=new T.Vector3();
  if(stKeys["KeyW"]||stKeys["ArrowUp"])   move.addScaledVector(fwd,1);
  if(stKeys["KeyS"]||stKeys["ArrowDown"]) move.addScaledVector(fwd,-1);
  if(stKeys["KeyA"]||stKeys["ArrowLeft"]) move.addScaledVector(right,-1);
  if(stKeys["KeyD"]||stKeys["ArrowRight"])move.addScaledVector(right,1);
  const spd = 5;
  if(move.length()>0){ move.normalize(); stPlayerPos.x+=move.x*spd*dt; stPlayerPos.z+=move.z*spd*dt; }
  if(!stIsGrounded){ stVelocityY-=ST_GRAVITY*dt; stPlayerPos.y+=stVelocityY*dt; if(stPlayerPos.y<=ST_GROUND_Y){stPlayerPos.y=ST_GROUND_Y;stVelocityY=0;stIsGrounded=true;} }
  stResolve(stPlayerPos);

  // Update character mesh
  if(stPlayerMesh){
    // y offset: boots bottom is at y=0, player floor is ST_GROUND_Y, so place mesh so boots sit on floor
    stPlayerMesh.position.set(stPlayerPos.x, stPlayerPos.y - ST_GROUND_Y, stPlayerPos.z);
    stPlayerMesh.rotation.y = stYaw + Math.PI;
    // Walk animation
    const ll=stPlayerMesh.userData.leftLeg, rl=stPlayerMesh.userData.rightLeg;
    const la=stPlayerMesh.userData.leftArm,  ra=stPlayerMesh.userData.rightArm;
    if(move.length()>0){
      const swing=Math.sin(stTime*10)*0.5;
      if(ll) ll.rotation.x= swing;
      if(rl) rl.rotation.x=-swing;
      if(la) la.rotation.x=-swing*0.5;
      if(ra) ra.rotation.x= swing*0.5;
    } else {
      if(ll) ll.rotation.x=0; if(rl) rl.rotation.x=0;
      if(la) la.rotation.x=0; if(ra) ra.rotation.x=0;
    }
  }

  // Third-person camera -- orbit behind player
  const camDist=5, camHeight=3.2;
  const camX = stPlayerPos.x + Math.sin(stYaw)*camDist;
  const camZ = stPlayerPos.z + Math.cos(stYaw)*camDist;
  stCamera.position.set(camX, stPlayerPos.y + camHeight, camZ);
  stCamera.lookAt(stPlayerPos.x, stPlayerPos.y + 1.1, stPlayerPos.z);

  // NPC update
  // Animate portal rings
  if(window._stPortalRing) window._stPortalRing.rotation.z = stTime * 0.8;
  if(window._stPortalInner) window._stPortalInner.rotation.z = -stTime * 1.4;

  // Portal teleport check
  if(window._stPortalZones) {
    window._stPortalZones.forEach(zone => {
      const dx = stPlayerPos.x - zone.x;
      const dz = stPlayerPos.z - zone.z;
      if(Math.sqrt(dx*dx+dz*dz) < zone.r && Math.abs(stPlayerPos.y - ST_GROUND_Y) < 1.5) {
        stPlayerPos.x=zone.dest.x; stPlayerPos.y=zone.dest.y; stPlayerPos.z=zone.dest.z;
        stYaw = zone.dest.rot;
        stVelocityY = 0;
      }
    });
  }

  // Don't show station prompts while player is undocked in deepspace
  if (window.dsActive || window._spaceOverride) { nearestSt=null; if(window._stHint) window._stHint.style.display='none'; return; }
  nearestSt=null; let closest=3.5;
  window._stExtraTick?.();
  window._stChatTick?.(dt);
  stNPCs.forEach(n=>{
    if(n.type==="freight"){n.phase+=dt*0.45;const t=Math.sin(n.phase)*10;n.group.position.x=n.baseX+t*(n.dir>0?1:-1);n.group.rotation.y=t>0?(n.dir>0?0:Math.PI):(n.dir>0?Math.PI:0);}
    if(n.type==="commander"){n.phase+=dt;n.group.position.y=Math.sin(n.phase*1.1)*0.03;n.group.rotation.y=Math.PI*0.15+Math.sin(n.phase*0.3)*0.08;}
    if(n.interact){const dx=stPlayerPos.x-n.group.position.x,dz=stPlayerPos.z-n.group.position.z,d=Math.sqrt(dx*dx+dz*dz);if(d<closest){closest=d;nearestSt=n;}}
  });
  if(window._stHint) window._stHint.style.display=nearestSt?"block":"none";
  if(window._stHint&&nearestSt) {
    var _mob = window.innerWidth <= 900, _act = _mob ? 'Tap' : 'Press E';
    if (nearestSt.type==='undock') window._stHint.textContent=_act+" to Undock — Enter Deep Space";
    else if (nearestSt.type==='ship') window._stHint.textContent=_act+" to open Ship Terminal";
    else if (nearestSt.type==='ranking') window._stHint.textContent=_act+" to view Space Faction Rankings";
    else if (nearestSt.type==='mission') window._stHint.textContent=_act+" MISSION CONTROL";
    else window._stHint.textContent=_act+" to interact";
  }

  // Animate rings
  if(window._stTopRing) window._stTopRing.rotation.z=stTime*0.5;
  if(window._stGlowRing) window._stGlowRing.rotation.z=stTime*0.2;
  if(window._stHoloBox){ window._stHoloBox.rotation.x=stTime*0.6; window._stHoloBox.rotation.y=stTime*0.9; }
  if(window._stExitRing) window._stExitRing.rotation.z = stTime * 0.8;
  if(window._stExitInner) window._stExitInner.rotation.z = -stTime * 1.4;

  stMaybeSendMove();
  updateStationPeerMeshes(dt);
  stRenderer.render(stScene,stCamera);
}

// Signal ready
window.enterStation_ready=true;

function injectStationTeleport() {
  function tryInject() {
    if (!window._earthPlacesMenuList) { setTimeout(tryInject, 300); return; }
    if (document.getElementById('stTeleportItem')) return;
    const item = document.createElement('div');
    item.id = 'stTeleportItem';
    item.textContent = '🛸 Station Alpha';
    item.style.cssText = 'padding:11px 18px;color:#88DDFF;font-family:sans-serif;font-size:14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.08);transition:background 0.15s;';
    item.addEventListener('mouseover', () => item.style.background = 'rgba(255,255,255,0.15)');
    item.addEventListener('mouseout',  () => item.style.background = 'transparent');
    const go = () => { window._closePlacesMenu?.(); window.enterStation?.(); };
    item.addEventListener('click', go);
    item.addEventListener('touchend', go);
    window._earthPlacesMenuList.appendChild(item);
  }
  tryInject();
}

function hideEarthPlacesForStation() {
  const earthPlacesBtn = [...document.querySelectorAll('div')].find(d =>
    d.textContent?.trim() === 'Places' && d.style.position === 'fixed' && d.style.bottom === '20px'
    && !d.id?.startsWith('st'));
  if (earthPlacesBtn) {
    earthPlacesBtn.style.display = 'none';
    window._earthPlacesBtn = earthPlacesBtn;
  }
  if (window._earthPlacesMenuList) window._earthPlacesMenuList.style.display = 'none';
}

function restoreEarthPlaces() {
  if (window._earthPlacesBtn) {
    window._earthPlacesBtn.style.display = '';
    window._earthPlacesBtn = null;
  }
}

window._openRankingBoard = function() {
  if (document.getElementById('stRankingBoard')) return;
  var board = window._factionLeaderboard || [];

  var ov = document.createElement('div');
  ov.id = 'stRankingBoard';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:500;display:flex;align-items:center;justify-content:center;font-family:Courier New,monospace;';

  var box = document.createElement('div');
  box.style.cssText = 'background:rgba(0,8,22,0.98);border:1px solid rgba(255,170,0,0.4);border-radius:14px;padding:28px 32px;max-width:520px;width:92%;max-height:80vh;overflow-y:auto;';

  var title = document.createElement('div');
  title.style.cssText = 'color:#FFAA00;font-size:15px;font-weight:bold;letter-spacing:0.15em;margin-bottom:4px;text-align:center;';
  title.textContent = '★ SPACE FACTION RANKINGS';
  box.appendChild(title);

  var sub = document.createElement('div');
  sub.style.cssText = 'color:rgba(255,170,0,0.4);font-size:10px;letter-spacing:0.1em;text-align:center;margin-bottom:20px;';
  sub.textContent = 'RANKED BY FLEET SCORE — UPDATES EVERY 30s';
  box.appendChild(sub);

  if (!board.length) {
    var loading = document.createElement('div');
    loading.style.cssText = 'color:rgba(150,200,255,0.4);font-size:12px;text-align:center;padding:20px;';
    loading.textContent = 'Loading faction data...';
    box.appendChild(loading);
    // Request fresh data
    window._mineGetSocket?.().emit('faction:getLeaderboard');
  }

  board.forEach(function(f, i) {
    var row = document.createElement('div');
    var rankColors = ['#FFD700','#C0C0C0','#CD7F32','#888888'];
    var rankNum = i+1;
    row.style.cssText = 'background:rgba(0,15,35,0.8);border:1px solid '+(f.color||'#333')+'33;border-radius:9px;padding:14px 16px;margin-bottom:10px;';
    row.innerHTML = '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">'
      + '<div style="color:'+(rankColors[i]||'#555')+';font-size:18px;font-weight:bold;min-width:24px;">#'+rankNum+'</div>'
      + '<div style="color:'+(f.color||'#FFF')+';font-size:13px;font-weight:bold;letter-spacing:0.06em;">'+f.name+'</div>'
      + '<div style="margin-left:auto;color:rgba(255,200,100,0.7);font-size:11px;">Score: '+f.fleetScore+'</div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">'
      + '<div style="background:rgba(0,20,50,0.6);border-radius:6px;padding:6px 8px;"><div style="color:rgba(150,200,255,0.45);font-size:9px;letter-spacing:0.08em;">BARS</div><div style="color:#AACCFF;font-size:12px;font-weight:bold;">'+(f.bars||0).toLocaleString()+'</div></div>'
      + '<div style="background:rgba(0,20,50,0.6);border-radius:6px;padding:6px 8px;"><div style="color:rgba(150,200,255,0.45);font-size:9px;letter-spacing:0.08em;">RESEARCH</div><div style="color:#AACCFF;font-size:12px;font-weight:bold;">Lv '+f.research+'</div></div>'
      + '<div style="background:rgba(0,20,50,0.6);border-radius:6px;padding:6px 8px;"><div style="color:rgba(150,200,255,0.45);font-size:9px;letter-spacing:0.08em;">MINERS ACTIVE</div><div style="color:'+(f.activeMiners>0?'#44FF88':'rgba(150,200,255,0.5)')+';font-size:12px;font-weight:bold;">'+f.activeMiners+'/3</div></div>'
      + '</div>';
    box.appendChild(row);
  });

  var closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'display:block;width:100%;background:none;border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.3);font-family:Courier New,monospace;font-size:11px;padding:10px;border-radius:8px;cursor:pointer;margin-top:8px;letter-spacing:0.1em;';
  closeBtn.textContent = '[ CLOSE ]';
  closeBtn.addEventListener('click', function(){ ov.remove(); });
  box.appendChild(closeBtn);

  ov.appendChild(box);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
  document.body.appendChild(ov);
};

function buildStationPlacesMenu() {
  // Remove old if exists
  document.getElementById('stPlacesBtn2')?.remove();
  document.getElementById('stPlacesList2')?.remove();

  const items = [
    { label: '🚀 Hangar',          action: () => stTeleport(-28, ST_GROUND_Y, -55+(-17)+8, Math.PI) },
    { label: '🌍 Return to Earth', action: () => window.exitStation?.() },
  ];

  const list = document.createElement('div');
  list.id = 'stPlacesList2';
  list.style.cssText = 'position:fixed;bottom:70px;right:20px;background:rgba(0,0,0,0.85);border:1px solid rgba(255,255,255,0.2);border-radius:14px;overflow:hidden;display:none;z-index:421;min-width:180px;backdrop-filter:blur(12px);';

  items.forEach(item => {
    const el = document.createElement('div');
    el.textContent = item.label;
    el.style.cssText = 'padding:12px 18px;color:white;font-family:sans-serif;font-size:14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.08);transition:background 0.15s;';
    el.addEventListener('mouseover', () => el.style.background = 'rgba(255,255,255,0.15)');
    el.addEventListener('mouseout',  () => el.style.background = 'transparent');
    el.addEventListener('click', () => { list.style.display='none'; btn.dataset.open='0'; item.action(); });
    list.appendChild(el);
  });

  const btn = document.createElement('div');
  btn.id = 'stPlacesBtn2';
  btn.textContent = 'Places';
  btn.dataset.open = '0';
  btn.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:10px 18px;background:rgba(0,0,0,0.55);border:2px solid rgba(255,255,255,0.35);border-radius:12px;color:white;font-family:sans-serif;font-size:14px;font-weight:bold;cursor:pointer;user-select:none;z-index:421;backdrop-filter:blur(8px);';
  btn.addEventListener('click', () => {
    const open = btn.dataset.open === '1';
    btn.dataset.open = open ? '0' : '1';
    list.style.display = open ? 'none' : 'block';
  });

  document.body.appendChild(list);
  document.body.appendChild(btn);
}


// Signal ready
window.enterStation_ready=true;

// Per-user unlock -- wait for username to be available
// ── STATION MULTIPLAYER ───────────────────────────────────────────────────────
let stOtherPlayers = {}; // socketId -> { mesh, username, x, y, z, rotY }
let stLastMoveSent = 0;
const ST_MOVE_INTERVAL = 100; // ms between position broadcasts

function getOrCreateStationPeerMesh(socketId, username) {
  if (stOtherPlayers[socketId]) return stOtherPlayers[socketId];
  const mesh = buildStationCharacter(window.THREE);
  mesh.position.set(0, 0, 42);
  stScene.add(mesh);
  // Username label
  const labelDiv = document.createElement('div');
  labelDiv.style.cssText = 'position:fixed;color:#00CCFF;font-family:"Courier New",monospace;font-size:11px;pointer-events:none;z-index:420;text-shadow:0 0 6px #0088FF;';
  labelDiv.textContent = username;
  document.body.appendChild(labelDiv);
  stOtherPlayers[socketId] = { mesh, username, x:0, y:1.7, z:42, rotY:0, label: labelDiv };
  return stOtherPlayers[socketId];
}

function removeStationPeer(socketId) {
  const peer = stOtherPlayers[socketId];
  if (!peer) return;
  if (peer.mesh && stScene) stScene.remove(peer.mesh);
  if (peer.label) peer.label.remove();
  delete stOtherPlayers[socketId];
}

function updateStationPeerLabels() {
  // Project 3D positions to screen for name labels
  if (!stCamera || !stRenderer) return;
  const T = window.THREE;
  const canvas = stRenderer.domElement;
  Object.values(stOtherPlayers).forEach(peer => {
    if (!peer.mesh || !peer.label) return;
    const pos = new T.Vector3(peer.x, peer.y + 2.2, peer.z);
    pos.project(stCamera);
    if (pos.z > 1) { peer.label.style.display = 'none'; return; }
    const sx = ( pos.x * 0.5 + 0.5) * canvas.clientWidth;
    const sy = (-pos.y * 0.5 + 0.5) * canvas.clientHeight;
    peer.label.style.display = 'block';
    peer.label.style.left = sx - peer.label.offsetWidth/2 + 'px';
    peer.label.style.top  = sy + 'px';
  });
}

function setupStationSocketEvents() {
  const skt = ST_SKT();
  if (!skt) { setTimeout(setupStationSocketEvents, 500); return; }

  skt.on('station:state', (others) => {
    // Full state on enter — add everyone currently in station
    // First clear any stale peers
    Object.keys(stOtherPlayers).forEach(id => removeStationPeer(id));
    others.forEach(p => {
      if (!stScene) return;
      const peer = getOrCreateStationPeerMesh(p.socketId, p.username);
      peer.x=p.x; peer.y=p.y; peer.z=p.z; peer.rotY=p.rotY;
      peer.mesh.position.set(p.x, p.y - ST_GROUND_Y, p.z);
      peer.mesh.rotation.y = p.rotY + Math.PI;
    });
  });

  skt.on('station:players', (others) => {
    // Delta update — reconcile list
    const receivedIds = new Set(others.map(p => p.socketId));
    // Remove players no longer in list
    Object.keys(stOtherPlayers).forEach(id => {
      if (!receivedIds.has(id)) removeStationPeer(id);
    });
    // Update or add
    others.forEach(p => {
      if (!stScene) return;
      const peer = getOrCreateStationPeerMesh(p.socketId, p.username);
      peer.x=p.x; peer.y=p.y; peer.z=p.z; peer.rotY=p.rotY;
    });
  });
}

// Emit our position on a throttle inside stLoop
function stMaybeSendMove() {
  const now = performance.now();
  if (now - stLastMoveSent < ST_MOVE_INTERVAL) return;
  stLastMoveSent = now;
  ST_SKT()?.emit('station:move', {
    x: stPlayerPos.x,
    z: stPlayerPos.z,
    rotY: stYaw,
  });
}

function updateStationPeerMeshes(dt) {
  Object.values(stOtherPlayers).forEach(peer => {
    if (!peer.mesh) return;
    // Smoothly interpolate to server position
    peer.mesh.position.x += (peer.x - peer.mesh.position.x) * 0.2;
    peer.mesh.position.z += (peer.z - peer.mesh.position.z) * 0.2;
    peer.mesh.position.y = peer.y - ST_GROUND_Y;
    peer.mesh.rotation.y = peer.rotY + Math.PI;
  });
  updateStationPeerLabels();
}

function setupUnlockListener() {
  const skt = ST_SKT();
  if (!skt) { setTimeout(setupUnlockListener, 500); return; }
  skt.on('space:unlockStatus', (data) => {
    if (data.unlocked && !window._spaceUnlocked) {
      window._spaceUnlocked = true;
      injectStationTeleport();
    }
  });
  // Request check after listener is attached
  setTimeout(() => skt.emit('space:checkUnlock'), 100);

  // ── STATION CHAT BUBBLES ────────────────────────────────────────
  // Create local player chat bubble
  var stMyChatBubble = document.createElement('div');
  stMyChatBubble.style.cssText = 'position:fixed;background:rgba(0,8,22,0.9);border:1px solid rgba(0,200,255,0.4);'
    + 'color:#AADDFF;font-family:Courier New,monospace;font-size:10px;padding:4px 8px;'
    + 'border-radius:8px;pointer-events:none;z-index:421;display:none;max-width:160px;word-wrap:break-word;';
  document.body.appendChild(stMyChatBubble);
  var stMyChatTimer = 0;

  skt.on('player:chatMsg', function(data) {
    if (!stationActive) return;
    if (data.socketId === window.mySocketId) {
      // Own bubble -- position above local player head center screen
      stMyChatBubble.textContent = data.msg;
      stMyChatBubble.style.display = 'block';
      stMyChatTimer = 5;
    } else {
      // Other player bubble -- add to their label
      var peer = stOtherPlayers[data.socketId];
      if (peer) {
        if (!peer.chatBubble) {
          var cb = document.createElement('div');
          cb.style.cssText = 'position:fixed;background:rgba(0,8,22,0.9);border:1px solid rgba(0,200,255,0.4);'
            + 'color:#AADDFF;font-family:Courier New,monospace;font-size:10px;padding:4px 8px;'
            + 'border-radius:8px;pointer-events:none;z-index:421;display:none;max-width:160px;word-wrap:break-word;';
          document.body.appendChild(cb);
          peer.chatBubble = cb;
        }
        peer.chatBubble.textContent = data.msg;
        peer.chatBubble.style.display = 'block';
        peer.chatBubble.timer = 5;
      }
    }
  });

  // Tick chat timers -- called from station update loop
  window._stChatTick = function(dt) {
    if (stMyChatTimer > 0) {
      stMyChatTimer -= dt;
      // Position above player -- center bottom of screen
      stMyChatBubble.style.left = (window.innerWidth/2 - stMyChatBubble.offsetWidth/2) + 'px';
      stMyChatBubble.style.top  = (window.innerHeight * 0.35) + 'px';
      if (stMyChatTimer <= 0) stMyChatBubble.style.display = 'none';
    }
    Object.values(stOtherPlayers).forEach(function(peer) {
      if (!peer.chatBubble || !peer.label) return;
      if (peer.chatBubble.timer > 0) {
        peer.chatBubble.timer -= dt;
        // Position above name label
        var lTop = parseInt(peer.label.style.top) || 0;
        peer.chatBubble.style.left = peer.label.style.left;
        peer.chatBubble.style.top  = (lTop - 28) + 'px';
        if (peer.chatBubble.timer <= 0) peer.chatBubble.style.display = 'none';
      }
    });
  };
}
setTimeout(setupUnlockListener, 2500);
setTimeout(setupStationSocketEvents, 2500);

console.log("[Station Client] Loaded");
