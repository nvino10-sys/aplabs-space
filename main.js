import * as THREE from 'three';
import { Room, RoomEvent, Track } from 'livekit-client';
// Load Socket.io client — join screen works regardless of whether it loads
let ioLoaded = false;
const socketScript=document.createElement('script');
socketScript.src='https://cdn.socket.io/4.7.2/socket.io.min.js';
socketScript.onload=()=>{ ioLoaded=true; };
socketScript.onerror=()=>{ ioLoaded=false; };
document.head.appendChild(socketScript);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 60, 150);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.7, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ─── CSS ──────────────────────────────────────────────────
const styleTag = document.createElement('style');
styleTag.textContent = `
  @keyframes rippleOut { from{transform:scale(0.1);opacity:0.9} to{transform:scale(2.2);opacity:0} }
  @keyframes flashPop  { from{transform:scale(0.6);opacity:0}   to{transform:scale(1);opacity:1}   }
  .touch-ripple {
    position:fixed;width:50px;height:50px;border-radius:50%;
    border:2.5px solid rgba(255,255,255,0.85);pointer-events:none;
    z-index:9999;animation:rippleOut 0.55s ease-out forwards;
    margin-left:-25px;margin-top:-25px;
  }
  body { touch-action: none; overflow: hidden; }
  canvas { touch-action: none; }
  @keyframes friendsFlash { 0%,100%{opacity:1} 50%{opacity:0.3} }
`;
document.head.appendChild(styleTag);

// Disable pinch zoom
const viewportMeta = document.createElement('meta');
viewportMeta.name = 'viewport';
viewportMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
document.head.appendChild(viewportMeta);

// Belt and suspenders — block gesturestart and wheel zoom
document.addEventListener('gesturestart', e=>e.preventDefault(), {passive:false});
document.addEventListener('gesturechange', e=>e.preventDefault(), {passive:false});
document.addEventListener('wheel', e=>{ if(e.ctrlKey) e.preventDefault(); }, {passive:false});

// ─── COORDINATE HUD ───────────────────────────────────────
// ── COORD BAR (top center, slim) ──
const coordHUD = document.createElement('div');
coordHUD.style.cssText = `
  position:fixed;top:10px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,0.55);color:#00FF99;font-family:monospace;
  font-size:11px;padding:5px 14px;border-radius:20px;z-index:500;
  pointer-events:auto;border:1px solid rgba(0,255,150,0.25);
  backdrop-filter:blur(6px);cursor:pointer;user-select:none;
  white-space:nowrap;letter-spacing:0.03em;
`;
coordHUD.innerHTML = 'X: 0.0 &nbsp; Y: 0.0 &nbsp; Z: 0.0';
document.body.appendChild(coordHUD);

// ── COMPASS BAR (top center, below coords) ──
const compassBar = document.createElement('div');
compassBar.style.cssText = `
  position:fixed;top:34px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,0.55);color:white;font-family:monospace;
  font-size:11px;padding:4px 14px;border-radius:20px;z-index:500;
  pointer-events:none;border:1px solid rgba(255,255,255,0.12);
  backdrop-filter:blur(6px);user-select:none;white-space:nowrap;
  overflow:hidden;width:180px;text-align:center;
`;
compassBar.innerHTML = '· · · <span style="color:#FF7A45;font-weight:bold">N</span> · · ·';
document.body.appendChild(compassBar);

// Compass tick marks
const COMPASS_DIRS = [
  {deg:0,   label:'N',  major:true},
  {deg:45,  label:'NE', major:false},
  {deg:90,  label:'E',  major:true},
  {deg:135, label:'SE', major:false},
  {deg:180, label:'S',  major:true},
  {deg:225, label:'SW', major:false},
  {deg:270, label:'W',  major:true},
  {deg:315, label:'NW', major:false},
];

function updateCompass(yawRad){
  // Convert yaw to compass degrees (0=N, 90=E, etc)
  // yaw=0 faces -Z (north), yaw=PI/2 faces -X (west)
  let deg = ((-yawRad * 180 / Math.PI) % 360 + 360) % 360;
  // Build scrolling compass tape
  const WIDTH_DEG = 90; // degrees visible in bar
  const half = WIDTH_DEG / 2;
  let ticks = [];
  COMPASS_DIRS.forEach(d => {
    [-360, 0, 360].forEach(offset => {
      const tickDeg = d.deg + offset;
      const diff = tickDeg - deg;
      if(diff > -half-5 && diff < half+5){
        const pct = 50 + (diff / WIDTH_DEG) * 100;
        ticks.push({pct, label:d.label, major:d.major});
      }
    });
  });

  // Get cardinal name
  let cardinal='N';
  if(deg>=337.5||deg<22.5) cardinal='N';
  else if(deg<67.5) cardinal='NE';
  else if(deg<112.5) cardinal='E';
  else if(deg<157.5) cardinal='SE';
  else if(deg<202.5) cardinal='S';
  else if(deg<247.5) cardinal='SW';
  else if(deg<292.5) cardinal='W';
  else if(deg<337.5) cardinal='NW';

  const isNorth=(cardinal==='N'||cardinal==='NE'||cardinal==='NW');
  const tickHTML = ticks.map(t=>`
    <span style="position:absolute;left:${t.pct}%;transform:translateX(-50%);
      color:${t.label==='N'?'#FF7A45':t.major?'rgba(255,255,255,0.9)':'rgba(255,255,255,0.45)'};
      font-weight:${t.major?'bold':'normal'};font-size:${t.major?'11px':'9px'};">
      ${t.label}
    </span>`).join('');

  compassBar.innerHTML=`
    <div style="position:relative;height:14px;width:100%;">
      ${tickHTML}
      <div style="position:absolute;left:50%;top:-1px;transform:translateX(-50%);
        width:1px;height:16px;background:rgba(255,255,255,0.4);"></div>
    </div>
  `;
}

let flyMode = false; // declared here so toggleFly can reference it

// ESC hint — top left, only on non-touch, only when pointer locked
const escHint = document.createElement('div');
escHint.style.cssText=`position:fixed;top:10px;left:12px;background:rgba(0,0,0,0.55);
  color:rgba(255,255,255,0.55);font-family:sans-serif;font-size:11px;
  padding:5px 11px;border-radius:20px;z-index:500;pointer-events:none;
  border:1px solid rgba(255,255,255,0.12);backdrop-filter:blur(6px);
  display:none;white-space:nowrap;`;
escHint.textContent='ESC = free mouse';
document.body.appendChild(escHint);

// Show/hide based on pointer lock — desktop only
// Click to look hint — shows when NOT locked, desktop only
const clickHint = document.createElement('div');
clickHint.style.cssText=`position:fixed;top:10px;left:12px;background:rgba(0,0,0,0.55);
  color:rgba(255,255,255,0.7);font-family:sans-serif;font-size:11px;
  padding:5px 11px;border-radius:20px;z-index:500;pointer-events:none;
  border:1px solid rgba(255,255,255,0.2);backdrop-filter:blur(6px);
  display:none;white-space:nowrap;`;
clickHint.textContent='🖱️ Click to look around';
document.body.appendChild(clickHint);

if(!window.matchMedia('(pointer:coarse)').matches){
  document.addEventListener('pointerlockchange',()=>{
    const locked=!!document.pointerLockElement;
    escHint.style.display=locked?'block':'none';
    clickHint.style.display=locked?'none':'block';
  });
  // Show on load after join
  // Click hint shows via pointerlockchange event
}

function toggleFly(){
  flyMode=!flyMode;
  coordHUD.style.borderColor=flyMode?'rgba(255,200,0,0.6)':'rgba(0,255,150,0.3)';
  coordHUD.style.color=flyMode?'#FFD700':'#00FF99';
}
coordHUD.addEventListener('click', toggleFly);
coordHUD.addEventListener('touchend', e=>{ e.preventDefault(); toggleFly(); },{passive:false});

function spawnRipple(x,y){
  const r=document.createElement('div'); r.className='touch-ripple';
  r.style.left=x+'px'; r.style.top=y+'px';
  document.body.appendChild(r); setTimeout(()=>r.remove(),560);
}
document.addEventListener('touchstart',e=>{for(const t of e.changedTouches)spawnRipple(t.clientX,t.clientY);},{passive:true});

// ─── DIRECTION INDICATOR ──────────────────────────────────
const dirRing=document.createElement('div');
dirRing.style.cssText=`position:fixed;bottom:160px;left:40px;width:72px;height:72px;border-radius:50%;background:rgba(0,0,0,0.20);border:2px solid rgba(255,255,255,0.30);display:block;z-index:98;pointer-events:none;`;
const dirDot=document.createElement('div');
dirDot.style.cssText=`width:18px;height:18px;border-radius:50%;background:rgba(255,255,255,0.85);position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);transition:transform 0.06s;`;
dirRing.appendChild(dirDot); document.body.appendChild(dirRing);
function updateDirIndicator(dx,dz){
  const len=Math.sqrt(dx*dx+dz*dz);
  if(len<0.05){
    dirDot.style.transform='translate(-50%,-50%)';
    return;
  }
  const nx=dx/len,nz=dz/len,m=22;
  dirDot.style.transform=`translate(calc(-50% + ${nx*m}px),calc(-50% + ${nz*m}px))`;
}

// ─── AUDIO ────────────────────────────────────────────────
const audioCtx=new(window.AudioContext||window.webkitAudioContext)();
const bgMusic=new Audio('/music.mp3'); bgMusic.loop=true; bgMusic.volume=0.35;
let musicStarted=false, musicMuted=false;
function safeSetVolume(v){if(!musicMuted)bgMusic.volume=v;}
document.addEventListener('click',()=>{
  if(audioCtx.state==='suspended')audioCtx.resume();
  if(!musicStarted){bgMusic.play().catch(()=>{});musicStarted=true;}
},{once:true});

let lastStepTime=0;
function playFootstep(){
  const now=audioCtx.currentTime; if(now-lastStepTime<0.38)return; lastStepTime=now;
  const buf=audioCtx.createBuffer(1,audioCtx.sampleRate*0.06,audioCtx.sampleRate);
  const d=buf.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);
  const src=audioCtx.createBufferSource(); src.buffer=buf;
  const gain=audioCtx.createGain(); gain.gain.value=0.18;
  const filt=audioCtx.createBiquadFilter(); filt.type='bandpass'; filt.frequency.value=220;
  src.connect(filt);filt.connect(gain);gain.connect(audioCtx.destination);src.start();
}
function playPuttSound(){
  const buf=audioCtx.createBuffer(1,audioCtx.sampleRate*0.08,audioCtx.sampleRate);
  const d=buf.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(audioCtx.sampleRate*0.02));
  const src=audioCtx.createBufferSource(); src.buffer=buf;
  const gain=audioCtx.createGain(); gain.gain.value=0.4;
  const filt=audioCtx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=600;
  src.connect(filt);filt.connect(gain);gain.connect(audioCtx.destination);src.start();
}
function playCupSound(){
  const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
  osc.frequency.value=880;osc.type='sine';
  gain.gain.setValueAtTime(0.3,audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+0.6);
  osc.connect(gain);gain.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+0.6);
}
function playFireworkBoom(freq){
  const buf=audioCtx.createBuffer(1,audioCtx.sampleRate*0.3,audioCtx.sampleRate);
  const d=buf.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(audioCtx.sampleRate*0.05));
  const src=audioCtx.createBufferSource(); src.buffer=buf;
  const gain=audioCtx.createGain(); gain.gain.value=0.25;
  const filt=audioCtx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=freq||300;
  src.connect(filt);filt.connect(gain);gain.connect(audioCtx.destination);src.start();
}
const fountainSounds=[];
function createFountainSound(x,z){
  const buf=audioCtx.createBuffer(1,audioCtx.sampleRate*2,audioCtx.sampleRate);
  const d=buf.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  const src=audioCtx.createBufferSource(); src.buffer=buf; src.loop=true;
  const gain=audioCtx.createGain(); gain.gain.value=0;
  const filt=audioCtx.createBiquadFilter(); filt.type='highpass'; filt.frequency.value=800;
  src.connect(filt);filt.connect(gain);gain.connect(audioCtx.destination);src.start();
  return{gain,x,z};
}

// ─── LIGHTING ─────────────────────────────────────────────
const sun=new THREE.DirectionalLight(0xFFF4CC,2.2);
sun.position.set(50,60,30); sun.castShadow=true;
sun.shadow.mapSize.width=2048; sun.shadow.mapSize.height=2048;
sun.shadow.camera.near=0.5; sun.shadow.camera.far=300;
sun.shadow.camera.left=-80; sun.shadow.camera.right=80;
sun.shadow.camera.top=80; sun.shadow.camera.bottom=-80;
scene.add(sun);
const sunSphere=new THREE.Mesh(new THREE.SphereGeometry(5,16,16),new THREE.MeshBasicMaterial({color:0xFFFF44}));
sunSphere.position.set(50,60,30); scene.add(sunSphere);
const sunGlow=new THREE.Mesh(new THREE.SphereGeometry(7.5,16,16),new THREE.MeshBasicMaterial({color:0xFFFF88,transparent:true,opacity:0.25}));
sunGlow.position.copy(sunSphere.position); scene.add(sunGlow);
scene.add(new THREE.AmbientLight(0xffffff,0.5));
scene.add(new THREE.HemisphereLight(0x87CEEB,0x67C240,0.4));

// ─── HELPERS ──────────────────────────────────────────────
function makeMesh(geo,color,x,y,z,cast=true,emissive=null){
  const mat=new THREE.MeshLambertMaterial({color});
  if(emissive){mat.emissive=new THREE.Color(emissive);mat.emissiveIntensity=0.6;}
  const m=new THREE.Mesh(geo,mat);
  m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;scene.add(m);return m;
}
const box  =(w,h,d,c,x,y,z,cast=true,em=null)=>makeMesh(new THREE.BoxGeometry(w,h,d),c,x,y,z,cast,em);
const cyl  =(rt,rb,h,s,c,x,y,z,cast=true)=>makeMesh(new THREE.CylinderGeometry(rt,rb,h,s),c,x,y,z,cast);
const cone =(r,h,s,c,x,y,z,cast=true)=>makeMesh(new THREE.ConeGeometry(r,h,s),c,x,y,z,cast);

// ─── GROUND ───────────────────────────────────────────────
const ground=new THREE.Mesh(new THREE.PlaneGeometry(400,400),new THREE.MeshLambertMaterial({color:0x67C240}));
ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);

// ─── CLOUDS ───────────────────────────────────────────────
const clouds=[];
function makeCloud(x,y,z){
  const g=new THREE.Group(),mat=new THREE.MeshLambertMaterial({color:0xFFFFFF});
  [[0,0,0,2.5],[-2.2,0,0,1.8],[2.2,0,0,1.8],[-1.2,1.2,0,1.6],[1.2,1.2,0,1.6],[0,1.4,0,1.4]].forEach(([px,py,pz,r])=>{
    const m=new THREE.Mesh(new THREE.SphereGeometry(r,7,7),mat);m.position.set(px,py,pz);g.add(m);
  });
  g.position.set(x,y,z);scene.add(g);
  clouds.push({group:g,speed:0.3+Math.random()*0.3,baseY:y});
}
makeCloud(-30,28,-20);makeCloud(10,32,-50);makeCloud(40,25,-30);
makeCloud(-10,30,-70);makeCloud(20,35,-10);makeCloud(-50,27,-40);
makeCloud(5,29,-90);makeCloud(60,31,-60);makeCloud(-20,33,-100);

// ─── HILLS (pushed back behind spawn, terrain-following) ──
// Hills are behind player (positive Z) so they don't interfere with campus
const hillDefs = [
  {x:-25, z:22, s:1.0, c:0x78D44E},
  {x:15,  z:26, s:0.9, c:0x6BC940},
  {x:-8,  z:32, s:0.7, c:0x72D44E},
  {x:30,  z:20, s:1.1, c:0x78D44E},
  {x:-15, z:25, s:0.85,c:0x6BC940},
];
hillDefs.forEach(h=>{
  const m=new THREE.Mesh(new THREE.SphereGeometry(8*h.s,10,10),new THREE.MeshLambertMaterial({color:h.c}));
  m.position.set(h.x,-6*h.s,h.z); scene.add(m);
});
// Terrain height from hills at a given (x,z)
function getTerrainY(px,pz){
  let maxH=0;
  for(const h of hillDefs){
    const dx=px-h.x, dz=pz-h.z;
    const d=Math.sqrt(dx*dx+dz*dz);
    const R=8*h.s, cy=-6*h.s;
    if(d<R){
      const surfY=cy+Math.sqrt(R*R-d*d);
      if(surfY>maxH) maxH=surfY;
    }
  }
  return Math.max(0,maxH);
}

// ─── ROADS ────────────────────────────────────────────────
box(3,0.05,80,  0xD4C5A9, 0,0.01,-20,false);
box(60,0.05,3,  0xD4C5A9, 0,0.01,-10,false);
box(60,0.05,3,  0xD4C5A9, 0,0.01,-30,false);
box(6,0.05,90,  0x888888, 34,0.02,-50,false);  // city road
box(80,0.05,6,  0x888888, 20,0.02,-100,false); // far cross road

// ─── BUILDING ZONES (tree exclusion) ──────────────────────
const buildingZones=[
  {cx:-15,cz:-10,r:8},{cx:15,cz:-10,r:8},{cx:0,cz:-20,r:7},
  {cx:-16,cz:-28,r:9},
  // City street buildings (both sides of x=34 road)
  {cx:26,cz:-40,r:6},{cx:26,cz:-52,r:6},{cx:26,cz:-64,r:6},{cx:26,cz:-76,r:6},
  {cx:44,cz:-46,r:6},{cx:44,cz:-58,r:6},{cx:44,cz:-70,r:6},{cx:44,cz:-82,r:6},
  // Golf
  {cx:-47,cz:-20,r:26},
];
function tooCloseToBuilding(x,z,minDist=9){
  for(const b of buildingZones){const dx=x-b.cx,dz=z-b.cz;if(Math.sqrt(dx*dx+dz*dz)<b.r+minDist)return true;}
  return false;
}
function onRoad(x,z){
  if(Math.abs(x)<3&&z<5&&z>-60)return true;
  if(Math.abs(z+10)<3&&Math.abs(x)<32)return true;
  if(Math.abs(z+30)<3&&Math.abs(x)<32)return true;
  if(Math.abs(x-34)<5&&z<-20)return true;
  return false;
}

// ─── TREES ────────────────────────────────────────────────
const treeColliders=[];
function makeTree(x,z){
  if(tooCloseToBuilding(x,z)||onRoad(x,z))return;
  cyl(0.15,0.25,1,6,0x8B5E3C,x,0.5,z);
  cone(1.5,3,6,0x2D8A4E,x,2.5,z);
  cone(1.2,2.5,6,0x348F50,x,4.25,z);
  treeColliders.push({cx:x,cz:z,r:0.6});
}
[[5,3],[-5,3],[8,-8],[-8,-8],[10,-5],[-10,-5],
 [12,-14],[-12,-14],[5,-18],[-5,-18],
 [18,-22],[18,-35],[18,-50],
 [-20,-22],[-20,-35],[-20,-50],
 [-5,-38],[-5,-48],[5,-42],[5,-52]].forEach(([x,z])=>makeTree(x,z));

// ─── COLLIDERS ────────────────────────────────────────────
const colliders=[], circColliders=[], doors=[], golfBumpers=[];
function addCollider(cx,cz,w,d){colliders.push({minX:cx-w/2,maxX:cx+w/2,minZ:cz-d/2,maxZ:cz+d/2});}

// Roof platforms — players can land on these from above
const roofPlatforms=[]; // {minX,maxX,minZ,maxZ,y}
function addRoof(cx,cz,w,d,roofY){
  // roofY is world Y of the roof surface; player eye height is 1.7 above feet
  roofPlatforms.push({minX:cx-w/2,maxX:cx+w/2,minZ:cz-d/2,maxZ:cz+d/2,y:roofY+1.7});
}
function addCirc(cx,cz,r){circColliders.push({cx,cz,r});}
function makeDoor(x,y,z,rotY,label,roomId){
  const dm=new THREE.Mesh(new THREE.BoxGeometry(0.9,1.8,0.1),new THREE.MeshLambertMaterial({color:0x8B4513}));
  dm.position.set(x,y,z);dm.rotation.y=rotY;
  const knob=new THREE.Mesh(new THREE.SphereGeometry(0.07,6,6),new THREE.MeshLambertMaterial({color:0xFFD700}));
  knob.position.set(0.3,0,0.08);dm.add(knob);scene.add(dm);
  doors.push({pos:new THREE.Vector3(x,y,z),label,roomId});
}

// ─── CAMPUS BUILDINGS ─────────────────────────────────────
box(10,6,8,0xE8DCC8,-15,3,-10);box(11,0.5,9,0xC8B890,-15,6.3,-10);
makeDoor(-15,1,-5.95,0,'The Lab','lab');addCollider(-15,-10,10,8);
addRoof(-15,-10,10,8,6); // Lab roof at y=6
[[-18,3.8,-5.95],[-15,3.8,-5.95],[-12,3.8,-5.95]].forEach(([x,y,z])=>box(1.2,0.9,0.12,0xFFEEAA,x,y,z,false,0xFFDD88));

// Concert Hall — roof cone REMOVED per map review, all shadows off
const chWalls = box(10,5,8,0xD4E8D0,15,2.5,-10,false);
chWalls.castShadow=false;
box(11,0.35,9,0xB8D4B0,15,5.18,-10,false); // flat cap only, no cone
makeDoor(15,1,-5.95,0,'Concert Hall','concert');addCollider(15,-10,10,8);
addRoof(15,-10,10,8,5);
[[12,3.5,-5.95],[15,3.5,-5.95],[18,3.5,-5.95]].forEach(([x,y,z])=>box(1.2,0.9,0.12,0xFFEEAA,x,y,z,false,0xFFDD88));

box(8,5,7,0xE8E0D0,0,2.5,-20);box(8.5,0.5,7.5,0xC8B8A0,0,5.3,-20);
makeDoor(0,1,-16.45,0,'The Library','library');addCollider(0,-20,8,7);
addRoof(0,-20,8,7,5);
[[-2,3.5,-16.45],[2,3.5,-16.45]].forEach(([x,y,z])=>box(1.2,0.9,0.12,0xFFEEAA,x,y,z,false,0xFFDD88));

box(12,4,10,0xF0D8C0,-16,2,-28);box(12.5,0.5,10.5,0xD8C0A8,-16,4.3,-28);
makeDoor(-16,1,-22.95,0,'Cafeteria','cafeteria');addCollider(-16,-28,12,10);
addRoof(-16,-28,12,10,4);
[[-19,2.8,-22.95],[-13,2.8,-22.95]].forEach(([x,y,z])=>box(1.2,0.9,0.12,0xFFEEAA,x,y,z,false,0xFFDD88));

// garage fully removed

// ─── CITY BUILDINGS (street layout along x=34 road) ───────
// Left side of road (x≈26), right side (x≈44)
// Staggered along z so they feel like a real street
const streetBuildings=[
  // Left side (x=26, facing road at x=34)
  {x:26,z:-40, w:7, h:14, d:8,  c:0xB8C8D8, side:'L'},
  {x:26,z:-54, w:8, h:20, d:9,  c:0xC0C8D8, side:'L'},
  {x:26,z:-68, w:7, h:12, d:8,  c:0xD0C8B8, side:'L'},
  {x:26,z:-82, w:6, h:16, d:7,  c:0xC8D8D0, side:'L'},
  // Right side (x=44, facing road at x=34)
  {x:44,z:-46, w:6, h:18, d:7,  c:0xD8C8B8, side:'R'},
  {x:44,z:-58, w:7, h:10, d:8,  c:0xCCD8CC, side:'R'},
  {x:44,z:-72, w:8, h:22, d:9,  c:0xD8D0C0, side:'R'},
  {x:44,z:-86, w:5, h:8,  d:6,  c:0xE0D8C8, side:'R'},
];
streetBuildings.forEach(b=>{
  box(b.w,b.h,b.d,b.c,b.x,b.h/2,b.z);
  addCollider(b.x,b.z,b.w,b.d);
  // Floor stripes
  for(let i=0;i<Math.floor(b.h/2.8);i++) box(b.w+0.1,0.1,b.d+0.1,0x99AABB,b.x,1.5+i*2.8,b.z,false);
  // Windows facing the road
  const winZ = b.side==='L' ? b.z-b.d/2-0.01 : b.z-b.d/2-0.01;
  const winX1 = b.x - b.w*0.28, winX2 = b.x + b.w*0.28;
  for(let wy=2.5;wy<b.h-1;wy+=2.8){
    box(0.9,0.7,0.12,0xFFEEAA,winX1,wy,winZ,false,0xFFDD88);
    box(0.9,0.7,0.12,0xFFEEAA,winX2,wy,winZ,false,0xFFDD88);
  }
});

// Street lamps along the road, off the road surface
function makeLamp(x,z){
  cyl(0.06,0.06,4,6,0x888888,x,2,z);
  box(1.5,0.1,0.1,0x888888,x+0.7,4.1,z);
  cyl(0.2,0.2,0.3,8,0xFFFF99,x+1.4,4,z,false);
  addCirc(x,z,0.3);
}
// City lamps face TOWARD road (arm points left, toward x=34)
function makeLampLeft(x,z){
  cyl(0.06,0.06,4,6,0x888888,x,2,z);
  box(1.5,0.1,0.1,0x888888,x-0.7,4.1,z);
  cyl(0.2,0.2,0.3,8,0xFFFF99,x-1.4,4,z,false);
  addCirc(x,z,0.3);
}
// Lamp facing west (arm points toward path)
function makeLampWest(x,z){
  cyl(0.06,0.06,4,6,0x888888,x,2,z);
  box(1.5,0.1,0.1,0x888888,x-0.7,4.1,z);
  cyl(0.2,0.2,0.3,8,0xFFFF99,x-1.4,4,z,false);
  addCirc(x,z,0.3);
}
// Campus lamps: west side face east, east side face west (toward path)
[[-4,0],[-4,-8],[-4,-16]].forEach(([x,z])=>makeLamp(x,z));
[[ 4,0],[ 4,-8],[ 4,-16]].forEach(([x,z])=>makeLampWest(x,z));

// City road sidewalk strips
box(1.5,0.06,90, 0xD8D0C0, 32,0.04,-50,false);
box(1.5,0.06,90, 0xD8D0C0, 36,0.04,-50,false);

// City lamps at x=37 on east sidewalk, arm facing road (west)
[[37,-40],[37,-55],[37,-70],[37,-85]].forEach(([x,z])=>makeLampLeft(x,z));

// ─── FLAGPOLES ────────────────────────────────────────────
const flags=[];
function makeFlagpole(x,z){
  cyl(0.05,0.05,8,6,0xCCCCCC,x,4,z);
  const flag=box(1.5,0.8,0.05,0xFF3333,x+0.75,7.5,z);
  flags.push(flag);
  cyl(0.2,0.3,0.3,8,0x999999,x,0.15,z);
  addCirc(x,z,0.25);
}
[[-5,14],[5,14],[-8,5],[8,5]].forEach(([x,z])=>makeFlagpole(x,z));

// ─── BENCHES ──────────────────────────────────────────────
const benchSeats=[];
function makeBench(x,z,rotY=0){
  const g=new THREE.Group();
  const add=(geo,color,px,py,pz)=>{const m=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({color}));m.position.set(px,py,pz);g.add(m);};
  add(new THREE.BoxGeometry(2,0.1,0.6), 0x8B6914,0,0.5,0);
  add(new THREE.BoxGeometry(2,0.6,0.08),0x8B6914,0,0.85,-0.28);
  [-0.8,0.8].forEach(lx=>add(new THREE.BoxGeometry(0.08,0.5,0.5),0x555555,lx,0.25,0));
  g.position.set(x,0,z);g.rotation.y=rotY;scene.add(g);
  if(Math.abs(rotY%Math.PI)<0.2) addCollider(x,z,2.2,0.7);
  else                             addCollider(x,z,0.7,2.2);
  const seatDir=new THREE.Vector3(Math.sin(rotY),0,Math.cos(rotY));
  benchSeats.push({pos:new THREE.Vector3(x,0,z),eyePos:new THREE.Vector3(x-seatDir.x*0.1,1.1,z-seatDir.z*0.1),lookDir:new THREE.Vector3(-seatDir.x,0,-seatDir.z),rotY});
}
[[3,1],[-3,1],[3,-5,Math.PI],[-3,-5,Math.PI],[8,-10,-Math.PI/2],[-8,-10,Math.PI/2]].forEach(([x,z,r=0])=>makeBench(x,z,r));

// ─── FOUNTAINS ────────────────────────────────────────────
function makeFountain(x,z){
  cyl(2.5,2.8,0.5,12,0xC8C0B0,x,0.25,z);cyl(2.3,2.3,0.3,12,0x5599DD,x,0.55,z);
  cyl(0.2,0.3,1.5,8,0xC8C0B0,x,1,z);cyl(0.8,0.4,0.2,8,0xC8C0B0,x,1.85,z);
  cyl(0.6,0.6,0.05,8,0x88BBFF,x,1.98,z);
  for(let i=0;i<8;i++){
    const a=(i/8)*Math.PI*2;
    const drop=cyl(0.04,0.04,0.3,4,0xAADDFF,x+Math.cos(a)*0.4,2.2,z+Math.sin(a)*0.4);
    drop.userData.fountainPhase=i/8;drop.userData.isFountainDrop=true;
  }
  colliders.push({minX:x-2.8,maxX:x+2.8,minZ:z-2.8,maxZ:z+2.8});
  fountainSounds.push(createFountainSound(x,z));
}
makeFountain(0,-10);
makeFountain(-6,-38);

// ─── RAINBOW + POT OF GOLD ────────────────────────────────
(function buildRainbow(){
  // Rainbow: a series of half-torus arcs in 7 colors
  // Spans from west of campus to east, arching high overhead
  const rainbowColors=[0xFF0000,0xFF7700,0xFFFF00,0x00CC00,0x0088FF,0x4400CC,0xAA00FF];
  const cx=0, cz=-8;       // center of arc base
  const arcH=38;            // height of apex
  const arcW=55;            // half-width
  const segments=36;

  rainbowColors.forEach((color,ri)=>{
    const radius=arcW - ri*1.8;  // each band slightly smaller
    const mat=new THREE.MeshBasicMaterial({color, side:THREE.DoubleSide, transparent:true, opacity:0.82});
    const points=[];
    for(let i=0;i<=segments;i++){
      const t=i/segments;
      const angle=Math.PI*t;        // 0 → PI = left to right arc
      const x=cx + Math.cos(angle)*radius;
      const y=Math.sin(angle)*arcH;
      const z=cz;
      points.push(new THREE.Vector3(x,y,z));
    }
    const curve=new THREE.CatmullRomCurve3(points);
    const tubeGeo=new THREE.TubeGeometry(curve,segments,0.9-ri*0.04,6,false);
    const mesh=new THREE.Mesh(tubeGeo,mat);
    mesh.castShadow=false; mesh.receiveShadow=false;
    scene.add(mesh);
  });

  // Pot of gold — at right end of rainbow (x ≈ arcW, z = cz)
  const potX = cx + arcW - 2;
  const potZ = cz;
  // Expose for wishing system
  window.POT_X = potX; window.POT_Z = potZ;

  // Cauldron body (dark)
  const potMat=new THREE.MeshLambertMaterial({color:0x111111});
  const potBody=new THREE.Mesh(new THREE.CylinderGeometry(1.2,0.9,1.4,12),potMat);
  potBody.position.set(potX,0.7,potZ); scene.add(potBody);
  // Rim
  const rim=new THREE.Mesh(new THREE.TorusGeometry(1.2,0.15,8,24),potMat);
  rim.rotation.x=Math.PI/2; rim.position.set(potX,1.4,potZ); scene.add(rim);
  // Gold coins inside
  const goldMat=new THREE.MeshLambertMaterial({color:0xFFD700,emissive:new THREE.Color(0xAA8800),emissiveIntensity:0.5});
  const goldTop=new THREE.Mesh(new THREE.CylinderGeometry(1.0,1.0,0.25,12),goldMat);
  goldTop.position.set(potX,1.35,potZ); scene.add(goldTop);
  // Spill coins around pot
  [[-1.6,0.08,0.3],[1.4,0.08,-0.5],[0.5,0.08,1.3],[-0.8,0.08,-1.2],[1.8,0.08,0.8]].forEach(([dx,dy,dz])=>{
    const coin=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,0.1,8),goldMat);
    coin.position.set(potX+dx,dy,potZ+dz);
    coin.rotation.x=Math.random()*0.5;
    scene.add(coin);
  });
  // Little glow above pot
  const glow=new THREE.Mesh(new THREE.SphereGeometry(1.0,8,8),new THREE.MeshBasicMaterial({color:0xFFEE44,transparent:true,opacity:0.18}));
  glow.position.set(potX,2.2,potZ); scene.add(glow);
  // Pot collision
  addCirc(potX, potZ, 2.0);
})();

// ─── BUTTERFLIES ──────────────────────────────────────────
const butterflies=[];
function makeButterfly(x,y,z){
  const g=new THREE.Group();
  const colors=[0xFF88CC,0xFFAA44,0x88CCFF,0xAAFF88,0xFF66AA];
  const mat=new THREE.MeshLambertMaterial({color:colors[Math.floor(Math.random()*colors.length)],side:THREE.DoubleSide});
  const lW=new THREE.Mesh(new THREE.BufferGeometry(),mat);
  lW.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array([0,0,0,-0.3,0.15,0,-0.25,-0.15,0]),3));
  lW.geometry.computeVertexNormals();g.add(lW);
  const rW=new THREE.Mesh(new THREE.BufferGeometry(),mat);
  rW.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array([0,0,0,0.3,0.15,0,0.25,-0.15,0]),3));
  rW.geometry.computeVertexNormals();g.add(rW);
  const body=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.25,4),new THREE.MeshLambertMaterial({color:0x333333}));
  body.rotation.x=Math.PI/2;g.add(body);
  g.position.set(x,y,z);scene.add(g);
  butterflies.push({group:g,lWing:lW,rWing:rW,phase:Math.random()*Math.PI*2,speed:0.4+Math.random()*0.4,radius:2+Math.random()*3,centerX:x,centerZ:z,baseY:y,angle:Math.random()*Math.PI*2});
}
makeButterfly(3,1.5,-2);makeButterfly(-4,2,-5);makeButterfly(1,1.8,-12);
makeButterfly(-2,2.2,-8);makeButterfly(6,1.6,-15);makeButterfly(-6,1.9,-18);

// ─── KENNEDY SPACE CENTER ─────────────────────────────────
// Located southwest of campus — visible from spawn
const LC_X = -8, LC_Z = 28; // launch complex center

// ── LAUNCHPAD BASE ──
// Concrete pad
box(18,0.5,18, 0xCCBBAA, LC_X,0.25,LC_Z, false);
// Flame trench
box(4,0.6,12, 0x333333, LC_X,0.15,LC_Z, false);
box(12,0.6,4, 0x333333, LC_X,0.15,LC_Z, false);
// Pad surface (slightly raised)
box(14,0.3,14, 0xBBAA99, LC_X,0.55,LC_Z, false);

// Launch mount / mobile launcher base
box(6,3,6, 0x888888, LC_X,2,LC_Z, false);
box(6.5,0.4,6.5, 0x666666, LC_X,3.25,LC_Z, false);
// Blast deflector
box(8,1.5,2, 0x777777, LC_X,0.85,LC_Z+5, false);
box(2,1.5,8, 0x777777, LC_X+5,0.85,LC_Z, false);

// ── GANTRY TOWER (fix-it tower) ──
const GT_X=LC_X+7, GT_Z=LC_Z;
// Main tower
cyl(0.3,0.3,32,4, 0x888888, GT_X,16,GT_Z, false);
// Horizontal arms at various heights
[8,14,20,26].forEach(h=>{
  box(7,0.3,0.3, 0x666666, GT_X-3.5,h,GT_Z, false);
  box(0.2,0.2,1.5, 0x888888, GT_X-7,h,GT_Z, false); // arm end
});
// Cross braces
[6,12,18,24].forEach(h=>{
  const brace=box(0.15,4,0.15, 0x555555, GT_X,h+2,GT_Z, false);
  brace.rotation.z=0.4;
});
// Elevator cage
box(1.2,1.2,1.2, 0x99AABB, GT_X,18,GT_Z, false);
// Red warning lights on tower
[8,16,24].forEach(h=>{
  const light=box(0.25,0.25,0.25, 0xFF2200, GT_X,h,GT_Z-0.4, false,0xFF0000);
  light.castShadow=false;
});
// Water tower for sound suppression — grounded properly
cyl(1.8,1.8,5,8, 0x99AACC, GT_X+4,2.5,GT_Z+4, false);  // tank body sits on ground (y=2.5 = half height)
cyl(2,2,0.3,8, 0x8899BB, GT_X+4,5.15,GT_Z+4, false);    // cap at top
// Support legs (4 thin posts instead of one floating pole)
[[0.8,0.8],[0.8,-0.8],[-0.8,0.8],[-0.8,-0.8]].forEach(([ox,oz])=>{
  cyl(0.1,0.1,1.2,4, 0x888888, GT_X+4+ox,0.6,GT_Z+4+oz, false);
});

// ── KENNEDY COLLIDERS ──
addRoof(LC_X, LC_Z, 6, 6, 3.25);    // launch mount roof
addRoof(LC_X-30, LC_Z+20, 21, 19, 28.2); // VAB roof
addRoof(GT_X+4, GT_Z+4, 4, 4, 5.2);  // water tower roof
addCollider(LC_X, LC_Z, 18, 18);       // launch pad base
addCollider(LC_X, LC_Z, 6, 6);         // launch mount (taller — handled by XZ)
addCollider(GT_X, GT_Z, 1.5, 1.5);     // gantry tower base
addCollider(GT_X+4, GT_Z+4, 4, 4);     // water tower
addCollider(LC_X-30, LC_Z+20, 21, 19); // VAB building

// Access roads to pad
box(4,0.06,22, 0x888888, LC_X-11,0.04,LC_Z, false);
box(22,0.06,4, 0x888888, LC_X,0.04,LC_Z+14, false);

// VAB-style building (Vehicle Assembly Building) far back
box(20,28,18, 0xCCCCBB, LC_X-30,14,LC_Z+20, false);
box(21,0.4,19, 0xBBBBAA, LC_X-30,28.2,LC_Z+20, false);
// VAB doors
box(8,20,0.3, 0x444444, LC_X-30,10,LC_Z+10.7, false);
// VAB stripes
[6,10,14,18,22].forEach(h=>{
  box(20.2,0.3,18.2, 0xBBBBAA, LC_X-30,h,LC_Z+20, false);
});
// American flag on VAB (iconic)
box(6,4,0.2, 0x3333CC, LC_X-24,22,LC_Z+10.7, false);
box(6,0.5,0.2, 0xFF3333, LC_X-24,19,LC_Z+10.7, false);
box(6,0.5,0.2, 0xFF3333, LC_X-24,17.5,LC_Z+10.7, false);
box(6,0.5,0.2, 0xFF3333, LC_X-24,16,LC_Z+10.7, false);

// ── ROCKET (sits on pad, launches on wish) ──
const rocketGroup = new THREE.Group();

// First stage — big white cylinder
const stage1 = new THREE.Mesh(new THREE.CylinderGeometry(0.8,0.85,7,12),
  new THREE.MeshLambertMaterial({color:0xEEEEEE}));
stage1.position.y=0; rocketGroup.add(stage1);

// Booster stripes
[0,1,2,3].forEach(i=>{
  const stripe=new THREE.Mesh(new THREE.CylinderGeometry(0.82,0.82,0.4,12),
    new THREE.MeshLambertMaterial({color:0x333333}));
  stripe.position.y=-2.5+i*1.5; rocketGroup.add(stripe);
});

// Second stage
const stage2=new THREE.Mesh(new THREE.CylinderGeometry(0.65,0.78,4.5,12),
  new THREE.MeshLambertMaterial({color:0xFFFFFF}));
stage2.position.y=5.8; rocketGroup.add(stage2);

// Payload fairing (nose cone — pointy top)
const fairing=new THREE.Mesh(new THREE.ConeGeometry(0.65,3.5,12),
  new THREE.MeshLambertMaterial({color:0xDDDDFF}));
fairing.position.y=9.8; rocketGroup.add(fairing);

// Interstage ring
const interstage=new THREE.Mesh(new THREE.CylinderGeometry(0.8,0.8,0.5,12),
  new THREE.MeshLambertMaterial({color:0x444444}));
interstage.position.y=3.3; rocketGroup.add(interstage);

// 4 solid rocket boosters
[0,1,2,3].forEach(i=>{
  const angle=(i/4)*Math.PI*2;
  const srb=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.25,5.5,8),
    new THREE.MeshLambertMaterial({color:0xFFFFEE}));
  srb.position.set(Math.cos(angle)*1.05,0,Math.sin(angle)*1.05);
  rocketGroup.add(srb);
  // SRB nose
  const srbNose=new THREE.Mesh(new THREE.ConeGeometry(0.22,1.2,8),
    new THREE.MeshLambertMaterial({color:0xFFDD44}));
  srbNose.position.set(Math.cos(angle)*1.05,3.35,Math.sin(angle)*1.05);
  rocketGroup.add(srbNose);
  // SRB nozzle
  const nozzle=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.28,0.5,8),
    new THREE.MeshLambertMaterial({color:0x333333}));
  nozzle.position.set(Math.cos(angle)*1.05,-2.95,Math.sin(angle)*1.05);
  rocketGroup.add(nozzle);
});

// Main engine nozzles (3)
[0,1,2].forEach(i=>{
  const angle=(i/3)*Math.PI*2;
  const nozzle=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.32,0.8,8),
    new THREE.MeshLambertMaterial({color:0x222222}));
  nozzle.position.set(Math.cos(angle)*0.35,-3.7,Math.sin(angle)*0.35);
  rocketGroup.add(nozzle);
});

// Mission patch / logo stripe
const patch=new THREE.Mesh(new THREE.BoxGeometry(0.08,1.5,1.2),
  new THREE.MeshLambertMaterial({color:0xFF6600}));
patch.position.set(-0.82,2,0); rocketGroup.add(patch);

// Sits on the launch mount
rocketGroup.position.set(LC_X, 7.5, LC_Z);
scene.add(rocketGroup);
window.rocketGroup = rocketGroup;

// Umbilical / support arms (retract on launch)
const umbilicalArms = [];
[0.8,1.8,2.8].forEach((h,i)=>{
  const arm=box(4,0.18,0.18,0x666666, LC_X-4.5,7.5+h,LC_Z, false);
  umbilicalArms.push(arm);
});

// Launch pad sign
cyl(0.1,0.1,3,4,0x888888, LC_X-9,1.5,LC_Z-9, false);
box(4.5,1.4,0.15,0x222266, LC_X-9,3.3,LC_Z-9, false);
box(4.4,0.25,0.17,0xFFFFFF, LC_X-9,2.7,LC_Z-9, false);
box(4.4,0.25,0.17,0xFFFFFF, LC_X-9,3.9,LC_Z-9, false);
// Small NASA-style logo bar
box(1.5,0.4,0.17,0xFF4400, LC_X-9,3.3,LC_Z-9, false);

// ── LAUNCH STATE ──
let rocketLaunching = false;
let rocketY = 7.5;
let rocketVel = 0;
let launchParticles = [];
let rocketDone = false;

// Listen for rocket launches from other players
function setupRocketSocket(){
  if(!socket) return;
  socket.on('rocket:launch',()=>{ launchRocket(); });
}
const _rocketPoll=setInterval(()=>{ if(socket&&mySocketId){ setupRocketSocket(); clearInterval(_rocketPoll); }},1000);

function launchRocket() {
  if(rocketLaunching) return;
  rocketLaunching = true;
  rocketDone = false;
  rocketY = 7.5;
  rocketVel = 0.02;
  rocketGroup.position.set(LC_X, rocketY, LC_Z);
  rocketGroup.visible = true;

  // Retract umbilical arms visually
  umbilicalArms.forEach(arm=>{ arm.visible=false; });

  // Play countdown + ignition sound
  const ctx = audioCtx;
  // Rumble
  const rumbleBuf=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate);
  const rd=rumbleBuf.getChannelData(0);
  for(let i=0;i<rd.length;i++) rd[i]=(Math.random()*2-1)*Math.min(1,i/(ctx.sampleRate*0.3))*Math.exp(-i/(ctx.sampleRate*2));
  const rumbleSrc=ctx.createBufferSource(); rumbleSrc.buffer=rumbleBuf;
  const rumbleGain=ctx.createGain(); rumbleGain.gain.value=0.6;
  const rumbleFilt=ctx.createBiquadFilter(); rumbleFilt.type='lowpass'; rumbleFilt.frequency.value=180;
  rumbleSrc.connect(rumbleFilt); rumbleFilt.connect(rumbleGain); rumbleGain.connect(ctx.destination);
  rumbleSrc.start();

  // Spawn initial ground fire burst
  for(let i=0;i<60;i++) spawnLaunchParticle(true);
}

function spawnLaunchParticle(ground=false){
  const colors=[0xFF4400,0xFF8800,0xFFCC00,0xFFFFAA,0xCCCCCC];
  const c=colors[Math.floor(Math.random()*colors.length)];
  const mesh=new THREE.Mesh(
    new THREE.SphereGeometry(ground?0.4+Math.random()*0.6:0.2+Math.random()*0.4,5,5),
    new THREE.MeshBasicMaterial({color:c,transparent:true})
  );
  const angle=Math.random()*Math.PI*2;
  const spd=ground?0.12+Math.random()*0.2:0.06+Math.random()*0.1;
  const rx=rocketGroup.position.x, ry=rocketGroup.position.y-3.5, rz=rocketGroup.position.z;
  mesh.position.set(rx+(Math.random()-0.5)*2, ry+(Math.random()-0.5)*(ground?1:0.5), rz+(Math.random()-0.5)*2);
  scene.add(mesh);
  launchParticles.push({
    mesh, life:ground?0.9:0.7, decay:0.025+Math.random()*0.04,
    vel:new THREE.Vector3(Math.cos(angle)*spd*(ground?1.8:1), ground?0.05+Math.random()*0.12:-0.05-Math.random()*0.08, Math.sin(angle)*spd*(ground?1.8:1)),
    isSmoke: c===0xCCCCCC
  });
}

function updateRocket(delta,totalTime){
  if(!rocketLaunching) return;

  // Spawn continuous exhaust
  for(let i=0;i<5;i++) spawnLaunchParticle(false);

  // Accelerate — just like the real thing
  rocketVel = Math.min(rocketVel + delta * 1.8, 35);
  rocketY += rocketVel * delta;
  rocketGroup.position.y = rocketY;

  // Slight roll/tilt — rockets always do a roll program
  if(rocketY>15) rocketGroup.rotation.z = Math.min((rocketY-15)*0.008, 0.18);
  if(rocketY>30) rocketGroup.rotation.x = Math.min((rocketY-30)*0.006, 0.12);

  // Gone above clouds — reset for next wish
  if(rocketY > 300){
    rocketLaunching=false; rocketDone=true;
    rocketGroup.visible=false;
    rocketGroup.position.set(LC_X,7.5,LC_Z);
    rocketGroup.rotation.set(0,0,0);
    umbilicalArms.forEach(arm=>{ arm.visible=true; });
  }

  // Update launch particles
  for(let i=launchParticles.length-1;i>=0;i--){
    const p=launchParticles[i];
    p.mesh.position.x+=p.vel.x; p.mesh.position.y+=p.vel.y; p.mesh.position.z+=p.vel.z;
    p.vel.y-=0.004;
    p.life-=p.decay;
    p.mesh.material.opacity=Math.max(0,p.life);
    if(p.life<=0){scene.remove(p.mesh);launchParticles.splice(i,1);}
  }
}

// ─── THE ASTROPELION LOUNGE ───────────────────────────────
const LX=58, LZ=28; // lounge center
const FLOOR1_Y=0.3;  // ground floor slab top
const FLOOR2_Y=5.5;  // upper deck floor top

// ── GROUND FLOOR SLAB ──
box(24,0.4,24, 0xCCBB99, LX,FLOOR1_Y/2,LZ, false);
// Checkerboard ground floor tiles
for(let fx=-4;fx<=4;fx++) for(let fz=-4;fz<=4;fz++){
  box(2.2,0.08,2.2,(fx+fz)%2===0?0xFFFFEE:0x222222, LX+fx*2.4,FLOOR1_Y+0.04,LZ+fz*2.4, false);
}

// ── 4 CORNER PILLARS ──
const pillarH=FLOOR2_Y+0.5;
[[-9,-9],[9,-9],[-9,9],[9,9]].forEach(([px,pz])=>{
  cyl(0.55,0.55,pillarH,8, 0xCCBB88, LX+px,pillarH/2,LZ+pz, false);
  // Capital
  box(1.2,0.35,1.2, 0xBBAA77, LX+px,pillarH+0.17,LZ+pz, false);
  // Base
  box(1.2,0.25,1.2, 0xBBAA77, LX+px,0.12,LZ+pz, false);
});

// ── UPPER DECK FLOOR ──
box(20,0.4,20, 0x443322, LX,FLOOR2_Y-0.2,LZ, false);
addRoof(LX, LZ, 20, 20, FLOOR2_Y); // players land on this

// Disco tiles on upper deck
for(let dx=-3;dx<=3;dx++) for(let dz=-3;dz<=3;dz++){
  const colors=[0xFF2200,0x0022FF,0xFF8800,0x00CC44,0xCC00FF,0xFFFF00,0x00CCFF,0xFF0088];
  box(1.9,0.12,1.9, colors[(Math.abs(dx*3+dz+4))%8], LX+dx*2.2,FLOOR2_Y+0.06,LZ+dz*2.2, false);
}

// ── RAILINGS on upper deck edges — contained between pillars ──
// Four edge rails, each 18 wide to fit between the 9-unit corner pillars
[[0,-9.2,18,0.4],[0,9.2,18,0.4],[-9.2,0,0.4,18],[9.2,0,0.4,18]].forEach(([rx,rz,rw,rd])=>{
  box(rw,0.75,rd, 0x998866, LX+rx,FLOOR2_Y+0.38,LZ+rz, false);
});
// Corner post caps to close the gaps
[[-9,-9],[9,-9],[-9,9],[9,9]].forEach(([px,pz])=>{
  box(0.5,0.75,0.5, 0x887755, LX+px,FLOOR2_Y+0.38,LZ+pz, false);
});

// No steps - flat entrance

// ── LEADERBOARD SIGN (front, ground level) ──
box(12,4.5,0.3, 0x111122, LX,3.5,LZ+12.2, false);  // backing board
box(11.6,4.1,0.12, 0x0A0A33, LX,3.5,LZ+12.35, false); // dark screen
box(12.4,0.25,0.35, 0xFFAA00, LX,5.85,LZ+12.2, false); // gold top trim
box(12.4,0.25,0.35, 0xFFAA00, LX,1.15,LZ+12.2, false); // gold bottom trim
// Sign poles
[-5.2,5.2].forEach(px=>{
  cyl(0.1,0.1,3.5,4, 0x888888, LX+px,1.75,LZ+12.2, false);
  box(0.6,0.3,0.6, 0xFFAA00, LX+px,0.08,LZ+12.2, false); // base
});
let nearLeaderboard=false;
// ── OUTDOOR UMBRELLA TABLES (ground level corners) ──
[[-9,LZ-9],[9,LZ-9],[-9,LZ+9],[9,LZ+9]].map(([ox,oz])=>[LX+ox,oz]).forEach(([tx,tz],i)=>{
  cyl(0.1,0.1,1.4,6, 0x888888, tx,0.95,tz, false);
  cyl(1.1,1.1,0.12,12, 0x995522, tx,1.6,tz, false);
  cyl(0.06,0.06,0.8,6, 0x777777, tx,2.8,tz, false);
  cyl(2.2,0.1,0.15,10, [0xFF4422,0x2244FF,0xFF8800,0x22AA44][i], tx,3.2,tz, false);
});

// ── CACTUS POTS flanking entrance ──
[-4,4].forEach(cx=>{
  cyl(0.55,0.65,0.7,8, 0xCC8844, LX+cx,0.65,LZ+11.5, false);
  cyl(0.22,0.2,1.8,6, 0x228822, LX+cx,1.8,LZ+11.5, false);
  cyl(0.12,0.12,0.8,6, 0x228822, LX+cx+0.4,2.2,LZ+11.5, false);
  box(0.18,0.5,0.18, 0x228822, LX+cx+0.75,2.45,LZ+11.5, false);
  cyl(0.12,0.12,0.7,6, 0x228822, LX+cx-0.4,1.8,LZ+11.5, false);
  box(0.18,0.5,0.18, 0x228822, LX+cx-0.75,2.05,LZ+11.5, false);
});

// ── DISCO BALLS ──
const discoBalls=[];
[-2.5,2.5].forEach(dx=>{
  const bg=new THREE.Group();
  const bc=new THREE.Mesh(new THREE.SphereGeometry(0.4,12,12),
    new THREE.MeshLambertMaterial({color:0xCCCCCC}));
  bg.add(bc);
  for(let i=0;i<40;i++){
    const phi=Math.acos(-1+2*i/40), theta=Math.sqrt(40*Math.PI)*phi;
    const tile=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.04,0.12),
      new THREE.MeshBasicMaterial({color:0xFFFFFF}));
    tile.position.setFromSphericalCoords(0.42,phi,theta);
    tile.lookAt(new THREE.Vector3(0,0,0));
    bg.add(tile);
  }
  bg.position.set(LX+dx, FLOOR2_Y+4, LZ);
  scene.add(bg); discoBalls.push(bg);
  // Wire
  const wire=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,1,4),
    new THREE.MeshLambertMaterial({color:0x888888}));
  wire.position.set(LX+dx, FLOOR2_Y+3.5, LZ);
  scene.add(wire);
});

// ── MINI BAR (upper deck center) ──
cyl(2.2,2.2,1.0,12, 0x884422, LX,FLOOR2_Y+0.7,LZ, false);
cyl(1.6,1.6,1.1,12, 0x333333, LX,FLOOR2_Y+0.75,LZ, false);
box(4.8,0.15,4.8, 0xAA7744, LX,FLOOR2_Y+1.25,LZ, false);
for(let s=0;s<6;s++){
  const sa=(s/6)*Math.PI*2;
  cyl(0.12,0.12,0.7,6, 0x888888, LX+Math.cos(sa)*2.8,FLOOR2_Y+0.55,LZ+Math.sin(sa)*2.8, false);
  cyl(0.35,0.35,0.12,8, 0xFF4422, LX+Math.cos(sa)*2.8,FLOOR2_Y+0.92,LZ+Math.sin(sa)*2.8, false);
}

// ── 3 POKER TABLES (upper deck) ──
const LOUNGE_TABLES=[[LX-5,LZ-4],[LX+5,LZ-4],[LX,LZ+5]];
LOUNGE_TABLES.forEach(([tx,tz])=>{
  const D=FLOOR2_Y;
  cyl(1.8,1.8,0.14,14, 0x1A6B2A, tx,D+0.5,tz, false);
  const rail=new THREE.Mesh(new THREE.TorusGeometry(1.8,0.18,6,20),
    new THREE.MeshLambertMaterial({color:0x8B5E3C}));
  rail.rotation.x=Math.PI/2; rail.position.set(tx,D+0.54,tz); scene.add(rail);
  cyl(0.28,0.45,0.55,8, 0x8B5E3C, tx,D+0.27,tz, false);
  for(let s=0;s<6;s++){
    const sa=(s/6)*Math.PI*2;
    const sx=tx+Math.cos(sa)*2.4, sz=tz+Math.sin(sa)*2.4;
    cyl(0.12,0.12,0.7,6, 0x888888, sx,D+0.4,sz, false);
    cyl(0.4,0.4,0.1,8, 0x884422, sx,D+0.75,sz, false);
  }
  [[0xFF3333,0.6,0],[0x3333FF,-0.6,0],[0xFFFF33,0,0.6]].forEach(([col,ox,oz])=>{
    for(let cs=0;cs<3;cs++) cyl(0.12,0.12,0.05,10,col,tx+ox,D+0.65+cs*0.06,tz+oz,false);
  });
});

// ── SLOT MACHINES (ground floor) ──
const SLOT_POSITIONS=[[LX-9,LZ-6],[LX-9,LZ-2],[LX-9,LZ+2],[LX-9,LZ+6],[LX+9,LZ-4],[LX+9,LZ]];
SLOT_POSITIONS.forEach(([sx,sz],i)=>{
  const gy=FLOOR1_Y+0.05;
  box(0.9,1.6,0.6, 0x222244, sx,gy+0.8,sz, false);
  box(0.7,0.55,0.1, 0x111133, sx,gy+1.0,sz-0.35, false);
  box(0.5,0.25,0.08, 0x333366, sx,gy+0.5,sz-0.35, false);
  cyl(0.12,0.1,0.5,6, 0x888888, sx+0.5,gy+0.9,sz, false);
  box(0.22,0.22,0.22, 0xFF2200, sx+0.5,gy+0.68,sz, false);
  box(0.25,0.05,0.08, 0xFFCC00, sx,gy+0.6,sz-0.35, false);
  box(0.72,0.12,0.08, [0xFF4400,0x4400FF,0xFF00AA,0x00FF88,0xFF8800,0xAA00FF][i%6], sx,gy+1.36,sz-0.35, false);
});

// ── RAFFLE TICKET VENDOR (ground floor) ──
// Vendor booth
box(2,0.9,1.2, 0x885522, LX,0.75,LZ+9, false); // counter
box(2,1.6,0.15, 0x664411, LX,1.45,LZ+9.55, false); // back wall
box(2.3,0.08,1.4, 0xAA7744, LX,1.2,LZ+9, false); // counter top
// Vendor NPC (small figure)
cyl(0.25,0.25,0.9,8, 0x4466AA, LX,1.6,LZ+9.3, false); // body
cyl(0.2,0.2,0.3,8, 0xFFCC88, LX,2.2,LZ+9.3, false); // head
// Sign above
box(2.2,0.6,0.1, 0x222266, LX,2.7,LZ+9.55, false);
// Gold ticket display
box(0.4,0.5,0.08, 0xFFDD00, LX-0.6,1.55,LZ+9, false);
box(0.4,0.5,0.08, 0xFFDD00, LX+0.6,1.55,LZ+9, false);

// ── HOST NPC ──
const hostGroup=new THREE.Group();
const hostMat=new THREE.MeshLambertMaterial({color:0xFFCC88});
const hostSuitMat=new THREE.MeshLambertMaterial({color:0x222244});
// Body (tuxedo)
const hBody=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.6,0.35),hostSuitMat);
hBody.position.y=0.85; hostGroup.add(hBody);
// Bow tie
const hTie=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.1,0.06),new THREE.MeshBasicMaterial({color:0xFF2200}));
hTie.position.set(0,1.0,0.19); hostGroup.add(hTie);
// Head
const hHead=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.42,0.4),hostMat);
hHead.position.set(0,1.35,0.04); hostGroup.add(hHead);
// Top hat
const hHatBrim=new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.34,0.06,12),new THREE.MeshLambertMaterial({color:0x111111}));
hHatBrim.position.set(0,1.6,0); hostGroup.add(hHatBrim);
const hHatTop=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,0.5,12),new THREE.MeshLambertMaterial({color:0x111111}));
hHatTop.position.set(0,1.87,0); hostGroup.add(hHatTop);
// Eyes
[-0.11,0.11].forEach(ex=>{
  const eye=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.07,0.05),new THREE.MeshBasicMaterial({color:0x111111}));
  eye.position.set(ex,1.38,0.22); hostGroup.add(eye);
});
// Arms
[-0.35,0.35].forEach(ax=>{
  const arm=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.4,0.14),hostSuitMat);
  arm.position.set(ax,0.82,0); hostGroup.add(arm);
});
// Legs
[-0.14,0.14].forEach(lx=>{
  const leg=new THREE.Mesh(new THREE.BoxGeometry(0.17,0.42,0.18),hostSuitMat);
  leg.position.set(lx,0.3,0); hostGroup.add(leg);
});
// Monocle
const monocle=new THREE.Mesh(new THREE.TorusGeometry(0.07,0.02,6,12),new THREE.MeshBasicMaterial({color:0xFFD700}));
monocle.position.set(0.13,1.4,0.23); hostGroup.add(monocle);

hostGroup.position.set(LX+2, FLOOR2_Y, LZ+8.5);
scene.add(hostGroup);
let hostBobTime=0;
let nearHost=false;

function updateLounge(delta,totalTime){
  hostBobTime+=delta;
  hostGroup.position.y=FLOOR2_Y+Math.sin(hostBobTime*1.5)*0.06;
  hostGroup.rotation.y=Math.sin(hostBobTime*0.5)*0.2;
  // Spin disco balls
  discoBalls.forEach((b,i)=>{ b.rotation.y+=delta*(0.8+i*0.3); });
  // Near host check
  const hx=camera.position.x-hostGroup.position.x;
  const hz=camera.position.z-hostGroup.position.z;
  nearHost=Math.sqrt(hx*hx+hz*hz)<3;
}

// ── ROBOT CREW ──
const robots=[];
const ROBOT_SAYINGS=['Beep boop! 🤖','Can I get you a drink?','INITIATING FUN.EXE','I am programmed to party','Calculating your luck...','Would you like a beverage?','*whirring noises*','Bzzzt! Nice to meet you!'];
function makeRobot(rx,rz){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.55,0.35),new THREE.MeshLambertMaterial({color:0x8899BB}));
  body.position.y=0.8; g.add(body);
  const head=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.38,0.38),new THREE.MeshLambertMaterial({color:0x99AACCAAAA}));
  head.position.set(0,1.3,0.04); g.add(head);
  const visor=new THREE.Mesh(new THREE.BoxGeometry(0.32,0.16,0.06),new THREE.MeshBasicMaterial({color:0x00FFFF,transparent:true,opacity:0.85}));
  visor.position.set(0,1.3,0.22); g.add(visor);
  const ant=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.22,4),new THREE.MeshLambertMaterial({color:0x888888}));
  ant.position.set(0.1,1.62,0); g.add(ant);
  const antBall=new THREE.Mesh(new THREE.SphereGeometry(0.07,6,6),new THREE.MeshBasicMaterial({color:0xFF4400}));
  antBall.position.set(0.1,1.76,0); g.add(antBall);
  [-0.35,0.35].forEach(ax=>{
    const arm=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.38,0.14),new THREE.MeshLambertMaterial({color:0x7788AA}));
    arm.position.set(ax,0.8,0); g.add(arm);
  });
  [-0.15,0.15].forEach(lx=>{
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.12,0.35,8),new THREE.MeshLambertMaterial({color:0x556677}));
    leg.position.set(lx,0.25,0); g.add(leg);
  });
  g.position.set(rx,FLOOR2_Y,rz);
  scene.add(g);
  return g;
}
const robotData=[
  {group:makeRobot(LX+3,LZ+2),   angle:0,  speed:0.4, radius:2.5, sayTimer:0},
  {group:makeRobot(LX-3,LZ+1),   angle:2,  speed:0.3, radius:2.0, sayTimer:3},
  {group:makeRobot(LX+0.5,LZ-4), angle:4,  speed:0.5, radius:1.8, sayTimer:6},
];
function updateRobots(delta,totalTime){
  robotData.forEach((r,i)=>{
    r.angle+=delta*r.speed;
    r.group.position.x=LX+Math.cos(r.angle)*r.radius+(i-1)*0.5;
    r.group.position.z=LZ+Math.sin(r.angle)*r.radius+i*0.8;
    r.group.rotation.y=r.angle+Math.PI/2;
    r.group.position.y=FLOOR2_Y+Math.sin(totalTime*2+i)*0.06;
    if(r.group.children[1]) r.group.children[1].rotation.y=Math.sin(totalTime*1.5+i*2)*0.2;
    r.sayTimer=(r.sayTimer||0)-delta;
    if(r.sayTimer<0){
      r.sayTimer=8+Math.random()*12;
      const dx=camera.position.x-r.group.position.x, dz=camera.position.z-r.group.position.z;
      if(Math.sqrt(dx*dx+dz*dz)<6) showNotification('🤖 '+ROBOT_SAYINGS[Math.floor(Math.random()*ROBOT_SAYINGS.length)]);
    }
  });
}

// ── HOST SEATING ──
// seatPlayerAtLounge defined later in lounge poker section


// Colliders
// Lounge colliders — columns only, fully open layout
[[-9,-9],[9,-9],[-9,9],[9,9]].forEach(([px,pz])=>{
  circColliders.push({cx:LX+px,cz:LZ+pz,r:0.65});
});

// Add lounge to door prompts area (nearHost handled in update)
doors.push({pos:{x:LX,z:LZ+10.5},roomId:'lounge',label:'The Lounge'});

// ─── WISHING SYSTEM ───────────────────────────────────────
let hasCoin = false;
let nearPot = false;
let nearFountain = false;
let wishCooldown = 0; // seconds remaining before rainbow msg can show again

// Coin in hand indicator
const coinIndicator = document.createElement('div');
coinIndicator.style.cssText = `
  position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,0.65);border:2px solid #FFD700;border-radius:50px;
  padding:8px 22px;display:none;z-index:100;pointer-events:none;
  font-family:sans-serif;font-size:15px;color:#FFD700;
  box-shadow:0 0 14px rgba(255,215,0,0.4);
`;
coinIndicator.innerHTML = '🪙 Coin in hand';
document.body.appendChild(coinIndicator);

// Rainbow message overlay (no coin at fountain)
const rainbowMsg = document.createElement('div');
rainbowMsg.style.cssText = `
  position:fixed;inset:0;display:none;align-items:center;justify-content:center;
  flex-direction:column;z-index:200;pointer-events:none;
`;
rainbowMsg.innerHTML = `
  <div style="background:rgba(0,0,0,0.72);border-radius:24px;padding:36px 52px;text-align:center;max-width:480px;">
    <div id="rainbowText" style="font-size:2.6rem;font-weight:bold;font-family:sans-serif;margin-bottom:12px;letter-spacing:2px;">
      Follow the 🌈 RAINBOW
    </div>
    <div style="color:rgba(255,255,255,0.55);font-family:sans-serif;font-size:1rem;font-style:italic;">
      hint: look for a pot of gold
    </div>
  </div>
`;
document.body.appendChild(rainbowMsg);

// Animate rainbow text colors
const rainbowColors7 = ['#FF0000','#FF7700','#FFFF00','#00DD00','#0099FF','#6600CC','#CC00FF'];
let rainbowTextTimer = 0;
function animateRainbowText() {
  const el = document.getElementById('rainbowText');
  if (!el) return;
  const txt = 'Follow the 🌈 RAINBOW';
  let out = '';
  for (let i = 0; i < txt.length; i++) {
    const c = rainbowColors7[(i + Math.floor(rainbowTextTimer * 3)) % rainbowColors7.length];
    out += `<span style="color:${c}">${txt[i]}</span>`;
  }
  el.innerHTML = out;
}

let rainbowMsgTimer = 0;
function showRainbowMsg() {
  if(wishOverlay.style.display==='flex') return; // don't show if wishing
  if(wishCooldown>0) return; // cooldown after wishing
  rainbowMsg.style.display = 'flex';
  rainbowMsgTimer = 2.8;
}

// Wish board overlay
const wishOverlay = document.createElement('div');
wishOverlay.style.cssText = `
  position:fixed;inset:0;background:rgba(0,10,30,0.93);color:white;
  font-family:'Segoe UI',sans-serif;z-index:300;display:none;
  flex-direction:column;align-items:center;overflow:hidden;
`;
document.body.appendChild(wishOverlay);

function loadWishes() {
  try { return JSON.parse(localStorage.getItem('aplabs_wishes') || '[]'); }
  catch(e) { return []; }
}
function saveWish(text) {
  const wishes = loadWishes();
  wishes.unshift({ text, time: Date.now() });
  if (wishes.length > 100) wishes.pop();
  localStorage.setItem('aplabs_wishes', JSON.stringify(wishes));
}

function buildWishBoard() {
  const wishes = loadWishes();
  wishOverlay.innerHTML = `
    <div style="width:100%;max-width:620px;padding:32px 24px;display:flex;flex-direction:column;height:100%;box-sizing:border-box;">
      <div style="text-align:center;margin-bottom:6px;">
        <div style="font-size:2rem;margin-bottom:4px;">🪙✨ Wishing Fountain ✨🪙</div>
        <div style="opacity:0.45;font-size:0.85rem;">Your coin ripples in the water...</div>
      </div>
      <div id="wishList" style="flex:1;overflow-y:auto;margin:18px 0;padding:0 4px;">
        ${wishes.length === 0
          ? '<div style="text-align:center;opacity:0.35;margin-top:40px;font-size:0.95rem;">No wishes yet. Be the first!</div>'
          : wishes.map(w => `
            <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
              border-radius:12px;padding:12px 16px;margin-bottom:10px;line-height:1.5;">
              <span style="opacity:0.35;font-size:0.78rem;">✨</span>
              &nbsp;${escapeHtml(w.text)}
            </div>`).join('')
        }
      </div>
      <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;">
        <div style="opacity:0.6;font-size:0.85rem;margin-bottom:8px;">I wish...</div>
        <div style="display:flex;gap:10px;">
          <input id="wishInput" maxlength="120" placeholder="Type your wish..."
            style="flex:1;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.25);
              border-radius:10px;padding:12px 14px;color:white;font-size:15px;outline:none;font-family:inherit;"
          />
          <button id="wishSubmit"
            style="background:#FFD700;color:#000;border:none;border-radius:10px;
              padding:12px 20px;font-size:15px;font-weight:bold;cursor:pointer;white-space:nowrap;">
            Make Wish
          </button>
        </div>
        <div style="opacity:0.4;font-size:0.78rem;margin-top:6px;text-align:center;">Type and press Enter!</div>
        <div style="display:flex;justify-content:flex-end;margin-top:12px;">
          <button id="wishClose"
            style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);
              color:white;border-radius:10px;padding:9px 20px;font-size:14px;cursor:pointer;">
            Leave Fountain
          </button>
        </div>
      </div>
    </div>
  `;
  wishOverlay.style.display = 'flex';
  setTimeout(() => {
    const input = document.getElementById('wishInput');
    const submit = document.getElementById('wishSubmit');
    const close = document.getElementById('wishClose');
    if (input) input.focus();
    if (submit) submit.addEventListener('click', submitWish);
    if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') submitWish(); });
    if (close) close.addEventListener('click', closeWishBoard);
  }, 50);
}

function escapeHtml(t) {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function submitWish() {
  const input = document.getElementById('wishInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  saveWish(text);
  wishCooldown = 20;
  closeWishBoard();
  // 🚀 LAUNCH — broadcast to all players
  launchRocket();
  if(socket) socket.emit('rocket:launch');
}

function closeWishBoard() {
  wishOverlay.style.display = 'none';
  inRoom = false;
  safeSetVolume(0.35);
}

// Coin flip animation then open wish board
function doWishSequence() {
  hasCoin = false;
  coinIndicator.style.display = 'none';
  // Play a coin toss sound
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.4);
  g.gain.setValueAtTime(0.3, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
  osc.connect(g); g.connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + 0.5);
  // Brief flash then open board
  setTimeout(() => {
    inRoom = true;
    safeSetVolume(0.1);
    buildWishBoard();
  }, 400);
}

// ─── TUBE RIDE ────────────────────────────────────────────
const SLIDE_X=22, SLIDE_Z=18; // southeast of spawn, visible immediately

// Slide path — designed for 15 seconds of glory
// Full loop, banked curves, long spiraling descent
const slideCurve = new THREE.CatmullRomCurve3([
  // Launch from tower edge (not center) — avoids clipping
  new THREE.Vector3(SLIDE_X-2,  22,   SLIDE_Z+2),
  new THREE.Vector3(SLIDE_X-4,  21.5, SLIDE_Z+4),
  new THREE.Vector3(SLIDE_X-5,  19.5, SLIDE_Z+6),
  new THREE.Vector3(SLIDE_X-9,  17,   SLIDE_Z+5),
  new THREE.Vector3(SLIDE_X-12, 14.5, SLIDE_Z+3),
  // Bank hard left
  new THREE.Vector3(SLIDE_X-14, 12,   SLIDE_Z),
  new THREE.Vector3(SLIDE_X-13, 10,   SLIDE_Z-4),
  new THREE.Vector3(SLIDE_X-10, 8.5,  SLIDE_Z-7),
  // LOOP APPROACH — build speed going down
  new THREE.Vector3(SLIDE_X-7,  7,    SLIDE_Z-6),
  new THREE.Vector3(SLIDE_X-4,  6.2,  SLIDE_Z-4),
  // LOOP BOTTOM
  new THREE.Vector3(SLIDE_X-2,  5.5,  SLIDE_Z-2),
  // LOOP GOING UP
  new THREE.Vector3(SLIDE_X+1,  7,    SLIDE_Z-1),
  new THREE.Vector3(SLIDE_X+3,  11,   SLIDE_Z-2),
  new THREE.Vector3(SLIDE_X+2,  16,   SLIDE_Z-3),
  // LOOP TOP — fully inverted
  new THREE.Vector3(SLIDE_X-1,  20,   SLIDE_Z-2),
  new THREE.Vector3(SLIDE_X-4,  22,   SLIDE_Z),
  new THREE.Vector3(SLIDE_X-6,  20,   SLIDE_Z+2),
  // LOOP EXIT — coming back down
  new THREE.Vector3(SLIDE_X-7,  16,   SLIDE_Z+3),
  new THREE.Vector3(SLIDE_X-7,  12,   SLIDE_Z+5),
  // Long sweeping right bank
  new THREE.Vector3(SLIDE_X-5,  9.5,  SLIDE_Z+9),
  new THREE.Vector3(SLIDE_X-1,  7.5,  SLIDE_Z+13),
  new THREE.Vector3(SLIDE_X+4,  5.5,  SLIDE_Z+15),
  // Spiral left
  new THREE.Vector3(SLIDE_X+7,  4,    SLIDE_Z+13),
  new THREE.Vector3(SLIDE_X+8,  3,    SLIDE_Z+10),
  new THREE.Vector3(SLIDE_X+6,  2.2,  SLIDE_Z+7),
  // Final plunge into pool
  new THREE.Vector3(SLIDE_X+3,  1.4,  SLIDE_Z+5),
  new THREE.Vector3(SLIDE_X+1,  0.9,  SLIDE_Z+4),
], false, 'catmullrom', 0.5);

// Draw the tube geometry
const tubeGeo = new THREE.TubeGeometry(slideCurve, 180, 0.55, 8, false);
const tubeMat = new THREE.MeshLambertMaterial({
  color: 0x44AAFF, transparent: true, opacity: 0.72, side: THREE.DoubleSide
});
const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
tubeMesh.castShadow = false; scene.add(tubeMesh);

// Outer tube shell (slightly bigger, opaque stripes)
const tubeOuterGeo = new THREE.TubeGeometry(slideCurve, 180, 0.58, 8, false);
const tubeOuterMat = new THREE.MeshLambertMaterial({color:0x2288CC, transparent:true, opacity:0.35, side:THREE.BackSide});
const tubeOuter = new THREE.Mesh(tubeOuterGeo, tubeOuterMat);
scene.add(tubeOuter);

// Support pillars along the path
[0.06, 0.15, 0.28, 0.45, 0.62, 0.75, 0.88].forEach(t => {
  const pt = slideCurve.getPoint(t);
  if(pt.y > 1.5) {
    cyl(0.18,0.2, pt.y, 6, 0x88AACC, pt.x, pt.y/2, pt.z, false);
  }
});

// Tower base
const towerH = 23;
box(3.5, towerH, 3.5, 0xCCDDEE, SLIDE_X, towerH/2, SLIDE_Z, false);
// Tower cross braces
[[0.25],[0.5],[0.75]].forEach(([frac])=>{
  box(3.8,0.25,0.2,0xAABBCC, SLIDE_X, towerH*frac, SLIDE_Z, false);
  box(0.2,0.25,3.8,0xAABBCC, SLIDE_X, towerH*frac, SLIDE_Z, false);
});
// Tower corner pillars
[[-1.5,-1.5],[1.5,-1.5],[-1.5,1.5],[1.5,1.5]].forEach(([dx,dz])=>{
  cyl(0.22,0.22,towerH,6,0xBBCCDD, SLIDE_X+dx, towerH/2, SLIDE_Z+dz, false);
});

// LADDER on front face of tower (z- side)
const LADDER_X = SLIDE_X, LADDER_Z = SLIDE_Z - 2.0;
// Two rails
cyl(0.08,0.08, towerH, 6, 0xCCBB88, LADDER_X-0.35, towerH/2, LADDER_Z, false);
cyl(0.08,0.08, towerH, 6, 0xCCBB88, LADDER_X+0.35, towerH/2, LADDER_Z, false);
// Rungs
for(let i=0; i<22; i++){
  box(0.7, 0.08, 0.08, 0xDDCC99, LADDER_X, i*1.05+0.5, LADDER_Z, false);
}
// Ladder sign at base
box(1.4,0.5,0.1, 0x226622, LADDER_X, 0.5, LADDER_Z-0.5, false);

// Launch platform at top — with box collider so player doesn't fall through
box(4,0.3,4,0xAABBCC,SLIDE_X,22.3,SLIDE_Z,false);
addCollider(SLIDE_X, SLIDE_Z, 4.5, 4.5); // platform collision
[[-1.8,0],[1.8,0],[0,-1.8],[0,1.8]].forEach(([dx,dz])=>{
  cyl(0.06,0.06,1.2,4,0x8899AA,SLIDE_X+dx,23,SLIDE_Z+dz,false);
});

// Splash pool at bottom
const poolX=SLIDE_X+1, poolZ=SLIDE_Z+4;
cyl(4.5,5,0.6,12,0x2266AA,poolX,0.25,poolZ,false);
cyl(4.2,4.2,0.5,12,0x44AAEE,poolX,0.55,poolZ,false);
cyl(5,5.2,0.25,12,0xCCDDEE,poolX,0.55,poolZ,false);
for(let i=0;i<8;i++){
  const a=(i/8)*Math.PI*2;
  box(0.15,0.05,0.15,0xAADDFF,poolX+Math.cos(a)*2.5,0.78,poolZ+Math.sin(a)*2.5,false);
}

// TUBE RIDE sign
cyl(0.12,0.12,5,6,0xCCBB88, SLIDE_X-2,2.5,SLIDE_Z-3,false);
cyl(0.12,0.12,5,6,0xCCBB88, SLIDE_X+2,2.5,SLIDE_Z-3,false);
box(5.5,1.8,0.2,0x1155AA,SLIDE_X,5.5,SLIDE_Z-3,false);
box(5.4,0.3,0.22,0xFFFFFF,SLIDE_X,4.85,SLIDE_Z-3,false);
box(5.4,0.3,0.22,0xFFFFFF,SLIDE_X,6.15,SLIDE_Z-3,false);
box(0.3,1.2,0.22,0xFFFF00,SLIDE_X,3.8,SLIDE_Z-3,false);
box(0.8,0.5,0.22,0xFFFF00,SLIDE_X,4.7,SLIDE_Z-3,false);

// ── RIDER BODY (visible character that slides down) ──────
const riderGroup = new THREE.Group();
// Torso
const riderTorso = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.6,0.35),
  new THREE.MeshLambertMaterial({color:0xFF4488}));
riderTorso.position.y=0.3; riderGroup.add(riderTorso);
// Head
const riderHead = new THREE.Mesh(new THREE.SphereGeometry(0.22,8,8),
  new THREE.MeshLambertMaterial({color:0xF5C5A3}));
riderHead.position.y=0.85; riderGroup.add(riderHead);
// Arms out (wheee!)
[-1,1].forEach(side=>{
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.12,0.12),
    new THREE.MeshLambertMaterial({color:0xFF4488}));
  arm.position.set(side*0.5, 0.3, 0); riderGroup.add(arm);
  // Hand
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1,6,6),
    new THREE.MeshLambertMaterial({color:0xF5C5A3}));
  hand.position.set(side*0.76, 0.3, 0); riderGroup.add(hand);
});
// Legs
[-0.14,0.14].forEach(lx=>{
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18,0.42,0.2),
    new THREE.MeshLambertMaterial({color:0x3355AA}));
  leg.position.set(lx,-0.21,0); riderGroup.add(leg);
});
riderGroup.visible = false;
scene.add(riderGroup);

// Ride state
let slideMode = false;
let slideT = 0;
const SLIDE_DURATION = 15.0;
let nearSlide = false;
let nearLadder = false;
let onLadder = false;

// Splash particles
const splashParticles = [];
function spawnSplash(){
  const colors=[0x44AAFF,0x88CCFF,0xAADDFF,0xFFFFFF];
  for(let i=0;i<22;i++){
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(0.1,4,4),
      new THREE.MeshBasicMaterial({color:colors[Math.floor(Math.random()*colors.length)],transparent:true}));
    const endPt=slideCurve.getPoint(1);
    mesh.position.copy(endPt); scene.add(mesh);
    const angle=Math.random()*Math.PI*2, speed=0.08+Math.random()*0.14;
    splashParticles.push({mesh,life:1.0,decay:0.04+Math.random()*0.04,
      vel:new THREE.Vector3(Math.cos(angle)*speed,0.12+Math.random()*0.18,Math.sin(angle)*speed)});
  }
  const buf=audioCtx.createBuffer(1,audioCtx.sampleRate*0.4,audioCtx.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.exp(-i/(audioCtx.sampleRate*0.08));
  const src=audioCtx.createBufferSource(); src.buffer=buf;
  const gain=audioCtx.createGain(); gain.gain.value=0.5;
  const filt=audioCtx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=800;
  src.connect(filt); filt.connect(gain); gain.connect(audioCtx.destination); src.start();
}

function enterSlide(){
  slideMode=true; slideT=0;
  riderGroup.visible=true;
  leftArm.visible=false; rightArm.visible=false;
  doorPrompt.style.display='none';
  if(document.pointerLockElement) document.exitPointerLock();
  // Snap camera to chase position immediately so there's no freeze/lerp delay
  const startPos = slideCurve.getPoint(0);
  const startAhead = slideCurve.getPoint(0.015);
  const fwd0 = startAhead.clone().sub(startPos).normalize();
  camera.position.set(startPos.x - fwd0.x*7, startPos.y+4, startPos.z - fwd0.z*7);
  // Whoosh
  const buf=audioCtx.createBuffer(1,audioCtx.sampleRate*0.3,audioCtx.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*(1-i/d.length)*0.6;
  const src=audioCtx.createBufferSource(); src.buffer=buf;
  const gain=audioCtx.createGain(); gain.gain.value=0.3;
  const filt=audioCtx.createBiquadFilter(); filt.type='bandpass'; filt.frequency.value=400;
  src.connect(filt); filt.connect(gain); gain.connect(audioCtx.destination); src.start();
}
function exitSlide(){
  slideMode=false;
  riderGroup.visible=false;
  leftArm.visible=true; rightArm.visible=true;
  camera.position.set(poolX, GROUND_Y, poolZ-3);
  yaw=Math.PI*0.1; pitch=0;
  spawnSplash();
}

// ─── FARM ANIMALS ─────────────────────────────────────────
const animals = [];
const helloTexts = {
  cow:     ['Moooo! 🐄','Howdy partner! 🤠','Got milk? 😎','MOO means hello!'],
  pig:     ['Oink oink! 🐷','Snort snort~','This mud is divine 💅','Oink!'],
  duck:    ['QUACK! 🦆','Waddle waddle~','Quack quack quack!','*aggressive quacking*'],
  rabbit:  ['*hops excitedly* 🐇','Hi hi hi hi!!','Boing boing! ✨','Carrot? 🥕'],
  chicken: ['BOCK BOCK! 🐔','Why did I cross the road?','Bock bock bock bock~','*flaps wings*'],
};

function makeAnimal(type, startX, startZ) {
  const g = new THREE.Group();

  // Color palette per animal
  const bodyColors = {cow:0xF5F0E8, pig:0xFFB5C8, duck:0xFFDD44, rabbit:0xE8E0D8, chicken:0xFF8844};
  const accentColors = {cow:0x222222, pig:0xFF8899, duck:0xFF6600, rabbit:0xFFAAAA, chicken:0xFF4400};
  const bc = bodyColors[type], ac = accentColors[type];

  const bMat = new THREE.MeshLambertMaterial({color:bc});
  const aMat = new THREE.MeshLambertMaterial({color:ac});

  // Body (chunky little torso)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55,0.6,0.4), bMat);
  body.position.y = 0.72; g.add(body);

  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.48,0.45,0.42), bMat);
  head.position.set(0, 1.25, 0.04); g.add(head);

  // Eyes (two tiny dark dots)
  [-0.12, 0.12].forEach(ex => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.07,0.07,0.05),
      new THREE.MeshBasicMaterial({color:0x111111}));
    eye.position.set(ex, 1.28, 0.22); g.add(eye);
  });

  // Nose/snout per animal
  if(type==='pig'||type==='cow'){
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.14,0.08), aMat);
    snout.position.set(0, 1.16, 0.24); g.add(snout);
  }
  if(type==='duck'||type==='chicken'){
    const beak = new THREE.Mesh(new THREE.BoxGeometry(0.16,0.1,0.14), aMat);
    beak.position.set(0, 1.18, 0.28); g.add(beak);
  }
  if(type==='rabbit'){
    // Long ears
    [-0.13,0.13].forEach(ex=>{
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.35,0.08), bMat);
      ear.position.set(ex, 1.58, 0); g.add(ear);
      const innerEar = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.25,0.05), aMat);
      innerEar.position.set(ex, 1.58, 0.02); g.add(innerEar);
    });
  }
  if(type==='cow'){
    // Horns + sunglasses
    [-0.16,0.16].forEach(hx=>{
      const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.05,0.2,4), aMat);
      horn.position.set(hx, 1.52, 0); g.add(horn);
    });
    // Sunglasses (two dark boxes with a bridge)
    [-0.13,0.13].forEach(gx=>{
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.14,0.09,0.04),
        new THREE.MeshBasicMaterial({color:0x111133,transparent:true,opacity:0.85}));
      lens.position.set(gx, 1.3, 0.23); g.add(lens);
    });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.03,0.03),
      new THREE.MeshBasicMaterial({color:0x333333}));
    bridge.position.set(0, 1.3, 0.23); g.add(bridge);
  }
  if(type==='chicken'){
    const comb = new THREE.Mesh(new THREE.BoxGeometry(0.12,0.14,0.08), aMat);
    comb.position.set(0, 1.52, 0.04); g.add(comb);
  }

  // Arms (wave-able)
  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.14,0.38,0.14), bMat);
  leftArm.position.set(-0.35, 0.72, 0); g.add(leftArm);
  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.14,0.38,0.14), bMat);
  rightArm.position.set(0.35, 0.72, 0); g.add(rightArm);

  // Legs (animated)
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.16,0.38,0.16), aMat);
  leftLeg.position.set(-0.16, 0.22, 0); g.add(leftLeg);
  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.16,0.38,0.16), aMat);
  rightLeg.position.set(0.16, 0.22, 0); g.add(rightLeg);

  // Hello bubble (hidden by default)
  const bubbleEl = document.createElement('div');
  bubbleEl.style.cssText = `
    position:fixed;background:white;color:#222;font-family:sans-serif;font-size:13px;
    font-weight:bold;padding:6px 12px;border-radius:20px;pointer-events:none;
    display:none;z-index:150;box-shadow:0 2px 8px rgba(0,0,0,0.25);
    transform:translate(-50%,-100%);white-space:nowrap;
  `;
  document.body.appendChild(bubbleEl);

  g.position.set(startX, 0, startZ);
  scene.add(g);

  const animal = {
    group: g, type, leftLeg, rightLeg, leftArm, rightArm,
    bubbleEl,
    phase: Math.random() * Math.PI * 2,
    // Wandering state
    walkAngle: Math.random() * Math.PI * 2,
    walkTimer: 1 + Math.random() * 3,
    pauseTimer: 0,
    isPaused: false,
    speed: 1.0 + Math.random() * 0.5,
    // Hello state
    helloTimer: 0,
    helloCooldown: 0,
    isWaving: false,
    helloMessages: helloTexts[type],
  };
  animals.push(animal);
  return animal;
}

// Spawn the gang — kept near campus open area
makeAnimal('cow',    -8,  -5);
makeAnimal('pig',     6,  -3);
makeAnimal('duck',   -3, -15);
makeAnimal('rabbit',  8, -12);
makeAnimal('chicken',-10,-10);

// Animal update — called each frame
function updateAnimals(delta, totalTime) {
  animals.forEach(a => {
    const pos = a.group.position;

    // Wandering AI
    if(a.isPaused) {
      a.pauseTimer -= delta;
      if(a.pauseTimer <= 0) { a.isPaused = false; a.walkTimer = 1.5 + Math.random() * 3; a.walkAngle += (Math.random()-0.5)*Math.PI; }
    } else {
      a.walkTimer -= delta;
      // Move forward
      const dx = Math.sin(a.walkAngle) * a.speed * delta;
      const dz = Math.cos(a.walkAngle) * a.speed * delta;
      const nx = pos.x + dx, nz = pos.z + dz;
      // Keep within campus area roughly
      if(nx > 18 || nx < -18 || nz < -22 || nz > 10) {
        a.walkAngle += Math.PI + (Math.random()-0.5)*0.5; // turn around
      } else {
        pos.x = nx; pos.z = nz;
      }
      a.group.rotation.y = -a.walkAngle;

      // Leg waddle
      const waddle = Math.sin(totalTime * 6 + a.phase) * 0.35;
      a.leftLeg.rotation.x = waddle;
      a.rightLeg.rotation.x = -waddle;

      if(a.walkTimer <= 0) {
        a.isPaused = true;
        a.pauseTimer = 0.8 + Math.random() * 2;
      }
    }

    // Hello proximity check
    if(a.helloCooldown > 0) a.helloCooldown -= delta;
    const pdx = camera.position.x - pos.x;
    const pdz = camera.position.z - pos.z;
    const pDist = Math.sqrt(pdx*pdx + pdz*pdz);

    if(pDist < 3.5 && a.helloCooldown <= 0 && !a.isWaving) {
      // Wave!
      a.isWaving = true;
      a.helloTimer = 2.5;
      a.helloCooldown = 12;
      const msg = a.helloMessages[Math.floor(Math.random()*a.helloMessages.length)];
      a.bubbleEl.textContent = msg;
      a.bubbleEl.style.display = 'block';
    }

    if(a.isWaving) {
      a.helloTimer -= delta;
      // Wave arm
      a.rightArm.rotation.z = -Math.abs(Math.sin(totalTime * 8)) * 1.1;
      // Project 3D position to screen
      const worldPos = new THREE.Vector3(pos.x, 1.6, pos.z);
      const projected = worldPos.clone().project(camera);
      const sx = (projected.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-projected.y * 0.5 + 0.5) * window.innerHeight;
      if(projected.z < 1) {
        a.bubbleEl.style.left = sx + 'px';
        a.bubbleEl.style.top = (sy - 10) + 'px';
        a.bubbleEl.style.display = 'block';
      } else {
        a.bubbleEl.style.display = 'none';
      }
      if(a.helloTimer <= 0) {
        a.isWaving = false;
        a.rightArm.rotation.z = 0;
        a.bubbleEl.style.display = 'none';
      }
    }
  });
}

// ─── CLAUDE THE OCTOPUS ───────────────────────────────────
(function buildClaude(){
  const g = new THREE.Group();
  const orange  = new THREE.MeshLambertMaterial({color:0xFF7A45});
  const dkOrange= new THREE.MeshLambertMaterial({color:0xCC5522});
  const cream   = new THREE.MeshLambertMaterial({color:0xFFF4EC});
  const black   = new THREE.MeshBasicMaterial({color:0x111111});
  const white   = new THREE.MeshBasicMaterial({color:0xFFFFFF});

  // Body — rounded blob
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55,10,8), orange);
  body.scale.set(1,1.15,1); body.position.y=0.88; g.add(body);

  // Head mantle (slightly bigger sphere on top)
  const mantle = new THREE.Mesh(new THREE.SphereGeometry(0.5,10,8), orange);
  mantle.scale.set(1,1.3,1); mantle.position.y=1.55; g.add(mantle);

  // Eyes — big expressive ones
  [-0.22,0.22].forEach(ex=>{
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.16,8,8), white);
    eyeWhite.position.set(ex,1.62,0.36); g.add(eyeWhite);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.09,8,8), black);
    pupil.position.set(ex,1.62,0.45); g.add(pupil);
    // Gleam
    const gleam = new THREE.Mesh(new THREE.SphereGeometry(0.04,6,6),
      new THREE.MeshBasicMaterial({color:0xFFFFFF}));
    gleam.position.set(ex+0.04,1.67,0.52); g.add(gleam);
  });

  // Little smile
  const smile = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.05,0.04),
    new THREE.MeshBasicMaterial({color:0x882200}));
  smile.position.set(0,1.46,0.46); g.add(smile);

  // 8 tentacles — radiating from base, each a tapered cylinder, slightly curved
  for(let i=0;i<8;i++){
    const angle = (i/8)*Math.PI*2;
    const tx = Math.sin(angle)*0.38;
    const tz = Math.cos(angle)*0.38;
    const tentacle = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.13,0.55,6), dkOrange);
    tentacle.position.set(tx,0.32,tz);
    tentacle.rotation.set(Math.sin(angle)*0.5, 0, -Math.cos(angle)*0.5);
    g.add(tentacle);
    // Sucker tip
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06,6,6), cream);
    tip.position.set(tx*1.35, 0.08, tz*1.35); g.add(tip);
  }

  // Tiny bow tie (fancy!)
  const btLeft  = new THREE.Mesh(new THREE.BoxGeometry(0.16,0.1,0.06),
    new THREE.MeshLambertMaterial({color:0x2255CC}));
  btLeft.position.set(-0.1,1.3,0.44); g.add(btLeft);
  const btRight = new THREE.Mesh(new THREE.BoxGeometry(0.16,0.1,0.06),
    new THREE.MeshLambertMaterial({color:0x2255CC}));
  btRight.position.set(0.1,1.3,0.44); g.add(btRight);
  const btKnot  = new THREE.Mesh(new THREE.BoxGeometry(0.07,0.07,0.07),
    new THREE.MeshLambertMaterial({color:0x1133AA}));
  btKnot.position.set(0,1.3,0.44); g.add(btKnot);

  // Umbrella — fancy striped canopy
  const umbrellaGroup = new THREE.Group();
  umbrellaGroup.position.set(0.7, 2.6, 0);

  // Shaft
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,1.6,6),
    new THREE.MeshLambertMaterial({color:0xCCBB88}));
  shaft.position.y=-0.8; umbrellaGroup.add(shaft);

  // Handle curl
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1,0.03,6,12,Math.PI),
    new THREE.MeshLambertMaterial({color:0xAA9966}));
  handle.position.y=-1.65; handle.rotation.z=Math.PI/2; umbrellaGroup.add(handle);

  // Canopy — alternating orange and white wedges
  const canopyColors=[0xFF7A45,0xFFFFFF,0xFF7A45,0xFFFFFF,0xFF7A45,0xFFFFFF,0xFF7A45,0xFFFFFF];
  for(let i=0;i<8;i++){
    const wedgeAngle=(i/8)*Math.PI*2;
    const wedge=new THREE.Mesh(
      new THREE.ConeGeometry(0.72,0.35,3,1,true,(i/8)*Math.PI*2,Math.PI/4),
      new THREE.MeshLambertMaterial({color:canopyColors[i],side:THREE.DoubleSide})
    );
    wedge.position.y=0; umbrellaGroup.add(wedge);
  }
  // Canopy dome top
  const dome=new THREE.Mesh(new THREE.SphereGeometry(0.72,10,6,0,Math.PI*2,0,Math.PI/4),
    new THREE.MeshLambertMaterial({color:0xFF7A45,side:THREE.DoubleSide}));
  dome.position.y=0.06; umbrellaGroup.add(dome);
  // Tip
  const tip2=new THREE.Mesh(new THREE.ConeGeometry(0.04,0.18,6),
    new THREE.MeshLambertMaterial({color:0xFFD700}));
  tip2.position.y=0.28; umbrellaGroup.add(tip2);

  g.add(umbrellaGroup);

  // Position Claude near The Lab entrance
  g.position.set(-10, 0, -3.5);
  g.rotation.y = Math.PI * 0.35;
  scene.add(g);

  // Store umbrella for gentle bob animation
  window.claudeGroup = g;
  window.claudeUmbrella = umbrellaGroup;
  window.claudeBody = body;
  window.claudeMantle = mantle;

  // Speech bubble (HTML overlay, shows on approach)
  const claudeBubble = document.createElement('div');
  claudeBubble.style.cssText=`
    position:fixed;background:white;color:#222;font-family:sans-serif;font-size:13px;
    font-weight:bold;padding:7px 14px;border-radius:20px;pointer-events:none;
    display:none;z-index:150;box-shadow:0 2px 12px rgba(255,122,69,0.4);
    transform:translate(-50%,-100%);white-space:nowrap;border:2px solid #FF7A45;
  `;
  claudeBubble.textContent = "👋 Hey! Press E to chat!";
  document.body.appendChild(claudeBubble);
  window.claudeBubble = claudeBubble;

  // Circular collider so you don't walk through him
  addCirc(-10, -3.5, 1.2);
})();

// Claude interaction overlay
const claudeOverlay = document.createElement('div');
claudeOverlay.style.cssText=`
  position:fixed;inset:0;background:rgba(15,8,4,0.94);color:white;
  font-family:'Segoe UI',sans-serif;z-index:300;display:none;
  align-items:center;justify-content:center;
`;
document.body.appendChild(claudeOverlay);

function openClaudeChat() {
  claudeOverlay.innerHTML=`
    <div style="max-width:520px;padding:40px 32px;text-align:center;">
      <div style="font-size:4rem;margin-bottom:4px;">🐙</div>
      <h1 style="font-size:1.9rem;margin-bottom:4px;color:#FF7A45;">Hey, I'm Claude!</h1>
      <p style="opacity:0.55;font-size:0.85rem;margin-bottom:24px;">Made by Anthropic · Resident AI of Astropelion Labs</p>
      <div style="background:rgba(255,122,69,0.08);border:1px solid rgba(255,122,69,0.3);
        border-radius:16px;padding:24px;text-align:left;line-height:1.8;font-size:0.98rem;margin-bottom:24px;">
        <p style="margin:0 0 14px;">
          I helped Nick build this entire world — the rainbow, the golf course, the blimp, the wishing fountain,
          even these little animals wandering around. All of it, in a single day, on his day off. Pretty wild, right?
        </p>
        <p style="margin:0 0 14px;">
          I'm an AI assistant made by <strong style="color:#FF7A45;">Anthropic</strong>.
          I can help you write, code, think, build, debug, design, research — really whatever you need.
          No fluff. Just honest, curious, useful conversation.
        </p>
        <p style="margin:0;">
          Got a question? A wild idea? A project you don't know how to start?
          Come find me. First conversation is on the house — forever.
        </p>
      </div>
      <a href="https://claude.ai" target="_blank"
        style="display:inline-block;background:#FF7A45;color:white;text-decoration:none;
          font-weight:bold;font-size:1.05rem;padding:14px 36px;border-radius:12px;
          box-shadow:0 4px 20px rgba(255,122,69,0.4);">
        Talk to Claude at claude.ai →
      </a>
      <div style="margin-top:20px;">
        <button id="claudeClose"
          style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);
            color:white;border-radius:10px;padding:9px 22px;font-size:14px;cursor:pointer;">
          Back to campus
        </button>
      </div>
    </div>
  `;
  claudeOverlay.style.display='flex';
  inRoom=true; safeSetVolume(0.1);
  if(document.pointerLockElement) document.exitPointerLock();
  setTimeout(()=>{
    const btn=document.getElementById('claudeClose');
    if(btn) btn.addEventListener('click',()=>{claudeOverlay.style.display='none';inRoom=false;safeSetVolume(0.35);});
  },50);
}

// ─── BLIMP ────────────────────────────────────────────────
const blimpGroup=new THREE.Group();
const envMat=new THREE.MeshLambertMaterial({color:0x2255CC});
const envelope=new THREE.Mesh(new THREE.SphereGeometry(3,12,8),envMat);
envelope.scale.set(2.5,1,1);blimpGroup.add(envelope);
const noseCone=new THREE.Mesh(new THREE.ConeGeometry(1,2,8),envMat);
noseCone.rotation.z=-Math.PI/2;noseCone.position.x=7.2;blimpGroup.add(noseCone);
const tailCone=new THREE.Mesh(new THREE.ConeGeometry(1,2,8),envMat);
tailCone.rotation.z=Math.PI/2;tailCone.position.x=-7.2;blimpGroup.add(tailCone);
const gondola=new THREE.Mesh(new THREE.BoxGeometry(3,0.8,1.2),new THREE.MeshLambertMaterial({color:0xDDCC99}));
gondola.position.set(0,-2.2,0);blimpGroup.add(gondola);
[-0.8,0,0.8].forEach(wx=>{
  const w=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.4,0.12),new THREE.MeshLambertMaterial({color:0x88BBFF,emissive:new THREE.Color(0x4488AA),emissiveIntensity:0.4}));
  w.position.set(wx,-2.2,-0.55);blimpGroup.add(w);
});
[-0.8,0.8].forEach(sx=>{
  const s=new THREE.Mesh(new THREE.BoxGeometry(0.05,2,0.05),new THREE.MeshLambertMaterial({color:0x888888}));
  s.position.set(sx,-1.1,0);blimpGroup.add(s);
});
const finMat=new THREE.MeshLambertMaterial({color:0xFF3333,side:THREE.DoubleSide});
[[2.5,1.8,0.08,-6,1.2,0],[2.5,1.8,0.08,-6,-1.2,0],[2.5,0.08,1.8,-6,0,1.2],[2.5,0.08,1.8,-6,0,-1.2]].forEach(([fw,fh,fd,fx,fy,fz])=>{
  const fin=new THREE.Mesh(new THREE.BoxGeometry(fw,fh,fd),finMat);fin.position.set(fx,fy,fz);blimpGroup.add(fin);
});
const stripe=new THREE.Mesh(new THREE.BoxGeometry(6,0.7,0.06),new THREE.MeshBasicMaterial({color:0xFFFFFF}));
stripe.position.set(0.5,0,-3.02);blimpGroup.add(stripe);
const nameColors=[0x2255CC,0xFF3333,0x2255CC,0xFF3333,0x2255CC,0xFF3333,0x2255CC];
[-2.4,-1.6,-0.8,0,0.8,1.6,2.4].forEach((tx,i)=>{
  const b=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.45,0.08),new THREE.MeshBasicMaterial({color:nameColors[i]}));
  b.position.set(tx,0,-3.05);blimpGroup.add(b);
});
function makeCatFace(zDir){
  const z=zDir*3.03,zo=zDir*0.04;
  const catMat=new THREE.MeshLambertMaterial({color:0xFF8C00});
  const head=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.6,0.09),catMat);head.position.set(1.5,0.2,z);blimpGroup.add(head);
  [[1.2,0.6],[1.8,0.6]].forEach(([ex,ey])=>{
    const eye=new THREE.Mesh(new THREE.BoxGeometry(0.26,0.22,0.06),new THREE.MeshBasicMaterial({color:0x00FF88}));
    eye.position.set(ex,ey,z+zo);blimpGroup.add(eye);
    const pupil=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.16,0.07),new THREE.MeshBasicMaterial({color:0x000000}));
    pupil.position.set(ex,ey,z+zo*2);blimpGroup.add(pupil);
  });
  const nose=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.16,0.06),new THREE.MeshBasicMaterial({color:0xFF5599}));
  nose.position.set(1.5,0.18,z+zo);blimpGroup.add(nose);
  [[0.65,1.05],[2.35,1.05]].forEach(([ex,ey])=>{
    const ear=new THREE.Mesh(new THREE.ConeGeometry(0.22,0.42,3),new THREE.MeshLambertMaterial({color:0xFF8C00}));
    ear.position.set(ex,ey,z);blimpGroup.add(ear);
  });
  const smile=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.1,0.06),new THREE.MeshBasicMaterial({color:0x552200}));
  smile.position.set(1.5,-0.05,z+zo);blimpGroup.add(smile);
}
makeCatFace(1);makeCatFace(-1);
blimpGroup.position.set(0,22,-15);scene.add(blimpGroup);

// ─── MINI GOLF ────────────────────────────────────────────
const GOLF_CX=-47, GOLF_CZ=-20;
const golfHoles=[
  {tee:{x:-36,z:-6},  cup:{x:-44,z:-10},par:2},
  {tee:{x:-50,z:-8},  cup:{x:-56,z:-18},par:3},
  {tee:{x:-52,z:-22}, cup:{x:-42,z:-28},par:2},
  {tee:{x:-36,z:-25}, cup:{x:-44,z:-34},par:3},
  {tee:{x:-54,z:-32}, cup:{x:-48,z:-38},par:2},
  {tee:{x:-38,z:-38}, cup:{x:-56,z:-28},par:4},
];

box(32,0.06,42,0x44CC44,GOLF_CX,0.03,GOLF_CZ,false);
box(32,0.5,0.4,0x228833,GOLF_CX,0.28,-40.2,false);
box(32,0.5,0.4,0x228833,GOLF_CX,0.28,-0.2, false);
box(0.4,0.5,42,0x228833,-31.2,0.28,GOLF_CZ, false);
box(0.4,0.5,42,0x228833,-62.8,0.28,GOLF_CZ, false);

// FIX: scoreboard rotated, poles repositioned to flank the rotated sign
const scoreboard=box(3,2,0.15,0x335533,-32,1.5,-6);
scoreboard.rotation.y=Math.PI/2;
// Poles are now in front/behind the sign (z axis since sign is now facing x)
cyl(0.08,0.08,2,6,0x888888,-32,1,-7.2);
cyl(0.08,0.08,2,6,0x888888,-32,1,-4.8);

const golfCupMeshes=[];
golfHoles.forEach((h,i)=>{
  const dx=h.cup.x-h.tee.x, dz=h.cup.z-h.tee.z;
  const len=Math.sqrt(dx*dx+dz*dz), ang=Math.atan2(dx,dz);
  const fw=box(2.8,0.07,len,0x55DD55,(h.tee.x+h.cup.x)/2,0.04,(h.tee.z+h.cup.z)/2,false);
  fw.rotation.y=ang;
  box(1.4,0.05,1.4,0xFFFFFF,h.tee.x,0.06,h.tee.z,false);
  cyl(0.09,0.09,0.3,6,0xFFFFFF,h.tee.x,0.2,h.tee.z,false);
  box(0.65,0.55,0.06,0x335533,h.tee.x+0.9,0.95,h.tee.z);
  cyl(0.03,0.03,0.85,4,0x888888,h.tee.x+0.9,0.48,h.tee.z);
  cyl(0.28,0.28,0.13,12,0x222222,h.cup.x,0.04,h.cup.z,false);
  cyl(0.24,0.24,0.1,12,0x111111,h.cup.x,0.09,h.cup.z,false);
  cyl(0.02,0.02,1.3,4,0xCCCCCC,h.cup.x,0.7,h.cup.z,false);
  box(0.45,0.28,0.04,[0xFF4444,0x4444FF,0xFFAA00,0xFF88FF,0x44FFAA,0xFF8844][i],h.cup.x+0.23,1.2,h.cup.z,false);
  const midX=(h.tee.x+h.cup.x)/2, midZ=(h.tee.z+h.cup.z)/2;
  const bumpLen=len*0.35;
  const bx=box(bumpLen,0.28,0.22,0x228833,h.tee.x-1.6,0.16,midZ,false);
  bx.rotation.y=ang;
  golfBumpers.push({cx:h.tee.x-1.6,cz:midZ,w:bumpLen,d:0.22,rotY:ang});
  golfCupMeshes.push({x:h.cup.x,z:h.cup.z,hole:i});
});

function resolveBallVsBumpers(){
  for(const bmp of golfBumpers){
    const cos=Math.cos(-bmp.rotY),sin=Math.sin(-bmp.rotY);
    const relX=ballPos.x-bmp.cx, relZ=ballPos.z-bmp.cz;
    const lx=relX*cos-relZ*sin, lz=relX*sin+relZ*cos;
    const hw=bmp.w/2+0.13, hd=bmp.d/2+0.13;
    if(Math.abs(lx)<hw&&Math.abs(lz)<hd){
      if(Math.abs(hw-Math.abs(lx))<Math.abs(hd-Math.abs(lz))){
        const nx=lx>0?1:-1;
        const wnx=nx*cos,wnz=nx*sin;
        const dot=ballVel.x*wnx+ballVel.y*wnz;
        ballVel.x-=2*dot*wnx*0.6;ballVel.y-=2*dot*wnz*0.6;
        ballPos.x+=(hw-Math.abs(lx))*wnx;ballPos.z+=(hw-Math.abs(lx))*wnz;
      } else {
        const nz=lz>0?1:-1;
        const wnx=-nz*sin,wnz=nz*cos;
        const dot=ballVel.x*wnx+ballVel.y*wnz;
        ballVel.x-=2*dot*wnx*0.6;ballVel.y-=2*dot*wnz*0.6;
        ballPos.x+=(hd-Math.abs(lz))*wnx;ballPos.z+=(hd-Math.abs(lz))*wnz;
      }
    }
  }
}

const golfBallMesh=new THREE.Mesh(new THREE.SphereGeometry(0.13,10,10),new THREE.MeshLambertMaterial({color:0xFFFFFF}));
golfBallMesh.castShadow=true;golfBallMesh.visible=false;scene.add(golfBallMesh);

// Golfer figure — visible while in golf mode
const golferFigure=(()=>{
  const g=new THREE.Group();
  const mat=new THREE.MeshLambertMaterial({color:0x4488FF});
  const bmat=new THREE.MeshLambertMaterial({color:0xFFCC88});
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.45,0.55,0.3),mat);
  body.position.set(0,0.9,0); g.add(body);
  const head=new THREE.Mesh(new THREE.BoxGeometry(0.38,0.38,0.35),bmat);
  head.position.set(0,1.42,0); g.add(head);
  const arm=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.42,0.14),bmat);
  arm.position.set(0.32,0.82,0); arm.rotation.z=-0.3; g.add(arm);
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.9,6),new THREE.MeshLambertMaterial({color:0x888888}));
  shaft.position.set(0.52,0.45,0); shaft.rotation.z=0.25; g.add(shaft);
  const head2=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.08,0.12),new THREE.MeshLambertMaterial({color:0x444444}));
  head2.position.set(0.65,0.06,0); g.add(head2);
  [-0.13,0.13].forEach(lx=>{
    const leg=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.45,0.18),mat);
    leg.position.set(lx,0.32,0); g.add(leg);
  });
  g.visible=false;
  scene.add(g);
  return g;
})();

function updateGolferFigure(){
  if(!golfMode){ golferFigure.visible=false; return; }
  golferFigure.visible=true;
  // Stand 1.2 units behind ball (opposite to aim direction)
  const behind=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)).multiplyScalar(1.2);
  golferFigure.position.set(ballPos.x+behind.x, 0, ballPos.z+behind.z);
  golferFigure.rotation.y=yaw; // face same direction as aim
}
const mpBallMarkers={};
function getMpBallMarker(username,color){
  if(!mpBallMarkers[username]){
    const g=new THREE.Group();
    const ring=new THREE.Mesh(new THREE.TorusGeometry(0.28,0.06,6,20),new THREE.MeshBasicMaterial({color}));
    ring.rotation.x=Math.PI/2;ring.position.y=0.05;g.add(ring);
    const peg=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.18,6),new THREE.MeshBasicMaterial({color}));
    peg.position.y=0.09;g.add(peg);
    const top=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,0.04,6),new THREE.MeshBasicMaterial({color}));
    top.position.y=0.2;g.add(top);
    g.visible=false;scene.add(g);
    mpBallMarkers[username]=g;
  }
  return mpBallMarkers[username];
}
function updateMpBallMarkers(){
  if(!mpGolf.active||!mpGolf.matchData)return;
  const COLORS=[0x44FFFF,0xFF8844];
  mpGolf.matchData.players.forEach((p,i)=>{
    const marker=getMpBallMarker(p.username,COLORS[i]);
    const isActive=(p.socketId===mpGolf.activePlayerId);
    if(!isActive&&p.ballX!==undefined&&p.ballZ!==undefined){
      marker.position.set(p.ballX,0,p.ballZ);marker.visible=true;
    } else { marker.visible=false; }
  });
}
function clearMpBallMarkers(){ Object.values(mpBallMarkers).forEach(m=>m.visible=false); }
const aimArrow=new THREE.Mesh(new THREE.ConeGeometry(0.15,0.6,6),new THREE.MeshBasicMaterial({color:0xFFFF44,transparent:true,opacity:0.7}));
aimArrow.visible=false;scene.add(aimArrow);

let golfMode=false,golfHoleIndex=0,golfStrokes=0;
let golfTotalStrokes=[0,0,0,0,0,0];
let ballPos=new THREE.Vector3(),ballVel=new THREE.Vector2();
let ballInMotion=false,powerCharging=false,powerAmount=0,nearTee=null;

const powerBar=document.createElement('div');
powerBar.style.cssText=`position:fixed;bottom:180px;left:50%;transform:translateX(-50%);width:220px;background:rgba(0,0,0,0.6);border:2px solid white;border-radius:8px;height:24px;display:none;z-index:100;overflow:hidden;`;
const powerFill=document.createElement('div');
powerFill.style.cssText=`height:100%;width:0%;background:linear-gradient(90deg,#44FF44,#FFFF00,#FF4444);border-radius:6px;`;
powerBar.appendChild(powerFill);document.body.appendChild(powerBar);

const powerLabel=document.createElement('div');
powerLabel.style.cssText=`position:fixed;bottom:208px;left:50%;transform:translateX(-50%);color:white;font-family:sans-serif;font-size:13px;opacity:0.8;display:none;z-index:100;pointer-events:none;`;
powerLabel.textContent='Hold to charge — release to putt';
document.body.appendChild(powerLabel);

const golfHUD=document.createElement('div');
golfHUD.style.cssText=`position:fixed;top:70px;right:12px;background:rgba(0,0,0,0.75);color:white;padding:12px 18px;border-radius:14px;font-family:sans-serif;font-size:13px;border:1px solid rgba(255,255,255,0.2);backdrop-filter:blur(10px);display:none;z-index:200;text-align:left;min-width:200px;`;
document.body.appendChild(golfHUD);

const golfExitBtn=document.createElement('div');
golfExitBtn.textContent='Leave Course';
golfExitBtn.style.cssText=`position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:rgba(80,0,0,0.7);color:white;padding:10px 22px;border-radius:10px;font-family:sans-serif;font-size:13px;border:1px solid rgba(255,100,100,0.4);cursor:pointer;display:none;z-index:200;white-space:nowrap;`;
golfExitBtn.addEventListener('click',()=>{
  if(mpGolf.active){
    // Confirm forfeit
    const confirm=document.createElement('div');
    confirm.style.cssText=`position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:600;`;
    confirm.innerHTML=`
      <div style="background:rgba(20,0,0,0.97);border:2px solid #FF4444;border-radius:16px;padding:28px 32px;text-align:center;color:white;font-family:sans-serif;max-width:300px;">
        <div style="font-size:1.8rem;margin-bottom:10px;">🏳️</div>
        <h3 style="margin:0 0 10px;">Forfeit Match?</h3>
        <p style="opacity:0.65;font-size:0.85rem;margin-bottom:20px;">Your opponent wins by default.</p>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button id="forfeitYes" style="background:#CC3333;color:white;border:none;border-radius:8px;padding:10px 22px;cursor:pointer;font-size:14px;font-weight:bold;">Yes, Forfeit</button>
          <button id="forfeitNo" style="background:rgba(255,255,255,0.1);color:white;border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:10px 22px;cursor:pointer;font-size:14px;">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(confirm);
    document.getElementById('forfeitYes').addEventListener('click',()=>{
      confirm.remove();
      if(socket) socket.emit('golf:forfeit');
      mpGolf.active=false; mpGolfScoreboard.style.display='none';
      clearMpBallMarkers();
      exitGolf();
      document.getElementById('holeEndOverlay')?.remove();
      showNotification('You forfeited the match.');
    });
    document.getElementById('forfeitNo').addEventListener('click',()=>confirm.remove());
  } else {
    exitGolf();
  }
});
document.body.appendChild(golfExitBtn);

const golfPaddleL=document.createElement('div');
golfPaddleL.innerHTML='&#9664;';
golfPaddleL.style.cssText=`position:fixed;left:12px;top:50%;transform:translateY(-50%);width:52px;height:80px;background:rgba(0,0,0,0.45);border:2px solid rgba(255,255,255,0.35);border-radius:12px;display:none;align-items:center;justify-content:center;font-size:26px;color:white;user-select:none;z-index:110;cursor:pointer;backdrop-filter:blur(6px);`;
document.body.appendChild(golfPaddleL);
const golfPaddleR=document.createElement('div');
golfPaddleR.innerHTML='&#9654;';
golfPaddleR.style.cssText=`position:fixed;right:12px;top:50%;transform:translateY(-50%);width:52px;height:80px;background:rgba(0,0,0,0.45);border:2px solid rgba(255,255,255,0.35);border-radius:12px;display:none;align-items:center;justify-content:center;font-size:26px;color:white;user-select:none;z-index:110;cursor:pointer;backdrop-filter:blur(6px);`;
document.body.appendChild(golfPaddleR);

let paddleLHeld=false,paddleRHeld=false;
golfPaddleL.addEventListener('touchstart',e=>{e.preventDefault();paddleLHeld=true;},{passive:false});
golfPaddleL.addEventListener('touchend',  e=>{e.preventDefault();paddleLHeld=false;},{passive:false});
golfPaddleL.addEventListener('mousedown', ()=>paddleLHeld=true);
golfPaddleL.addEventListener('mouseup',   ()=>paddleLHeld=false);
golfPaddleL.addEventListener('mouseleave',()=>paddleLHeld=false);
golfPaddleR.addEventListener('touchstart',e=>{e.preventDefault();paddleRHeld=true;},{passive:false});
golfPaddleR.addEventListener('touchend',  e=>{e.preventDefault();paddleRHeld=false;},{passive:false});
golfPaddleR.addEventListener('mousedown', ()=>paddleRHeld=true);
golfPaddleR.addEventListener('mouseup',   ()=>paddleRHeld=false);
golfPaddleR.addEventListener('mouseleave',()=>paddleRHeld=false);

const scoreFlash=document.createElement('div');
scoreFlash.style.cssText=`position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:250;pointer-events:none;flex-direction:column;`;
document.body.appendChild(scoreFlash);
function showScoreFlash(holeNum,strokes,par){
  const diff=strokes-par;
  let label='',color='#FFFFFF';
  if(diff<=-2){label='Eagle! 🦅';color='#FFD700';}
  else if(diff===-1){label='Birdie! 🐦';color='#44FF88';}
  else if(diff===0){label='Par!';color='#88CCFF';}
  else if(diff===1){label='Bogey';color='#FFAA44';}
  else{label='Double Bogey';color='#FF6644';}
  scoreFlash.innerHTML=`<div style="background:rgba(0,0,0,0.78);border:2px solid ${color};border-radius:20px;padding:28px 48px;text-align:center;animation:flashPop 0.35s ease-out;">
    <div style="font-size:1rem;opacity:0.6;margin-bottom:4px;font-family:sans-serif;">Hole ${holeNum}</div>
    <div style="font-size:3.2rem;font-weight:bold;color:${color};font-family:sans-serif;">${label}</div>
    <div style="font-size:1.4rem;color:white;font-family:sans-serif;margin-top:6px;">${strokes} stroke${strokes!==1?'s':''} · Par ${par}</div>
  </div>`;
  scoreFlash.style.display='flex';
  setTimeout(()=>{scoreFlash.style.display='none';},2200);
}

const scorecard=document.createElement('div');
scorecard.style.cssText=`position:fixed;inset:0;background:rgba(0,20,0,0.92);color:white;display:none;align-items:center;justify-content:center;flex-direction:column;z-index:300;font-family:sans-serif;`;
document.body.appendChild(scorecard);

function enterGolf(holeIndex, startX, startZ){
  golfMode=true;golfHoleIndex=holeIndex;golfStrokes=0;
  const tx = (startX!==undefined) ? startX : golfHoles[holeIndex].tee.x;
  const tz = (startZ!==undefined) ? startZ : golfHoles[holeIndex].tee.z;
  ballPos.set(tx, 0.13, tz);
  ballVel.set(0,0);ballInMotion=false;
  golfBallMesh.visible=true;golfBallMesh.position.copy(ballPos);
  aimArrow.visible=true;
  // Place camera behind ball so golfer figure is visible
  camera.position.set(tx + Math.sin(yaw)*2.5, GROUND_Y, tz + Math.cos(yaw)*2.5);
  golfHUD.style.display='block';golfExitBtn.style.display='block';doorPrompt.style.display='none';
  golfPaddleL.style.display='flex';golfPaddleR.style.display='flex';
  updateGolfHUD();
  leftArm.visible=false;rightArm.visible=false;
  if(document.pointerLockElement)document.exitPointerLock();
}
function exitGolf(){
  golfMode=false;
  relockPointer();golfBallMesh.visible=false;aimArrow.visible=false;
  powerBar.style.display='none';powerLabel.style.display='none';
  golfHUD.style.display='none';golfExitBtn.style.display='none';
  golfPaddleL.style.display='none';golfPaddleR.style.display='none';
  scoreFlash.style.display='none';scorecard.style.display='none';
  leftArm.visible=true;rightArm.visible=true;
  // FIX: reset camera to golf entrance so course doesn't look "shrunk"
  camera.position.set(-31, GROUND_Y, -2);
  yaw=Math.PI*0.75; // face toward campus
}
function updateGolfHUD(){
  if(mpGolf.active){ golfHUD.style.display='none'; updateMpScoreboard(); return; }
  const h=golfHoles[golfHoleIndex];
  const isTouchDevice=window.matchMedia('(pointer:coarse)').matches;
  const hint=isTouchDevice?'Tap &amp; hold right side to shoot':'Hold Space to charge';
  golfHUD.innerHTML=`Hole ${golfHoleIndex+1} / ${golfHoles.length} &nbsp;|&nbsp; Par ${h.par} &nbsp;|&nbsp; Strokes: <strong>${golfStrokes}</strong><br><span style="opacity:0.45;font-size:11px;">${hint} · ◀▶ rotate aim</span>`;
}
function showScorecard(){
  const total=golfTotalStrokes.reduce((a,b)=>a+b,0);
  const totalPar=golfHoles.reduce((a,h)=>a+h.par,0);
  const diff=total-totalPar;
  const diffStr=diff===0?'Even':diff>0?'+'+diff:''+diff;
  scorecard.innerHTML=`
    <h2 style="font-size:2rem;margin-bottom:6px;">Round Complete!</h2>
    <p style="opacity:0.6;margin-bottom:20px;">APLabs Mini Golf</p>
    <table style="border-collapse:collapse;font-size:15px;margin-bottom:20px;">
      <tr style="opacity:0.6;"><td style="padding:6px 16px;">Hole</td><td style="padding:6px 16px;">Par</td><td style="padding:6px 16px;">Strokes</td></tr>
      ${golfHoles.map((h,i)=>`<tr><td style="padding:6px 16px;text-align:center;">${i+1}</td><td style="padding:6px 16px;text-align:center;">${h.par}</td><td style="padding:6px 16px;text-align:center;color:${golfTotalStrokes[i]<=h.par?'#44FF88':'#FF8844'}">${golfTotalStrokes[i]}</td></tr>`).join('')}
      <tr style="border-top:1px solid rgba(255,255,255,0.3);font-weight:bold;"><td style="padding:10px 16px;">Total</td><td style="padding:10px 16px;text-align:center;">${totalPar}</td><td style="padding:10px 16px;text-align:center;">${total} (${diffStr})</td></tr>
    </table>
    <div style="display:flex;gap:12px;">
      <button onclick="window.location.reload()" style="padding:10px 22px;background:#225522;border:1px solid #44FF44;color:white;border-radius:8px;cursor:pointer;font-size:14px;">Play Again</button>
      <button id="scExit" style="padding:10px 22px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.3);color:white;border-radius:8px;cursor:pointer;font-size:14px;">Back to Campus</button>
    </div>`;
  scorecard.style.display='flex';
  document.getElementById('scExit').addEventListener('click',()=>{scorecard.style.display='none';exitGolf();});
}

const GOLF_FILL_RATE=100/4;
const GOLF_MAX_POWER=0.26;
function puttBall(){
  if(ballInMotion||!golfMode) return;
  if(powerAmount<3) { // ignore accidental taps with no charge
    powerCharging=false; powerAmount=0;
    powerBar.style.display='none'; powerLabel.style.display='none'; powerFill.style.width='0%';
    return;
  }
  const normalized=powerAmount/100;
  const power=Math.pow(normalized,1.8)*GOLF_MAX_POWER;
  const dir=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  ballVel.set(dir.x*power,dir.z*power);
  powerAmount=0; powerCharging=false; // always reset after shot
  golfStrokes++; if(!mpGolf.active) updateGolfHUD(); else updateMpScoreboard();
  powerBar.style.display='none';powerLabel.style.display='none';powerFill.style.width='0%';
  ballInMotion=true;playPuttSound();
}
// Golf touch hint — pulsing ring on right side, mobile only
const golfTouchHint=document.createElement('div');
golfTouchHint.style.cssText=`position:fixed;bottom:220px;right:30px;width:80px;height:80px;
  border-radius:50%;border:3px solid rgba(255,255,255,0.5);
  display:none;z-index:99;pointer-events:none;`;
golfTouchHint.innerHTML=`<div style="position:absolute;inset:0;display:flex;align-items:center;
  justify-content:center;flex-direction:column;color:rgba(255,255,255,0.8);
  font-size:10px;text-align:center;line-height:1.4;font-family:sans-serif;">
  Hold<br>here</div>`;
document.body.appendChild(golfTouchHint);
document.head.insertAdjacentHTML('beforeend',`<style>
@keyframes golfPulse{0%,100%{transform:scale(1);opacity:0.55;} 50%{transform:scale(1.18);opacity:1;}}
</style>`);

// Show hint on mobile when in golf mode and ball not moving, hide when charging
function updateGolfTouchHint(){
  if(!window.matchMedia('(pointer:coarse)').matches){golfTouchHint.style.display='none';return;}
  if(golfMode&&!ballInMotion&&!powerCharging){
    golfTouchHint.style.display='block';
    golfTouchHint.style.animation='golfPulse 1.4s ease-in-out infinite';
  } else {
    golfTouchHint.style.display='none';
    golfTouchHint.style.animation='';
  }
}

let golfTouchHeld=false;
renderer.domElement.addEventListener('touchstart',e=>{
  if(!golfMode||ballInMotion) return;
  for(const t of e.changedTouches){
    if(t.clientX>=window.innerWidth/2){
      golfTouchHeld=true; powerCharging=true; powerAmount=0;
      powerBar.style.display='block'; powerLabel.style.display='block';
    }
  }
},{passive:true});
renderer.domElement.addEventListener('touchend',e=>{
  if(!golfMode) return;
  for(const t of e.changedTouches){
    if(t.clientX>=window.innerWidth/2&&golfTouchHeld){
      golfTouchHeld=false; powerCharging=false;
      puttBall();
    }
  }
},{passive:true});

// ─── FIREWORKS ────────────────────────────────────────────
const fireworkParticles=[];
let fireworksActive=true,fireworkTimer=0,fireworkBurstCount=0;
function launchFirework(){
  const colors=[0xFF4444,0x44FF88,0xFFFF44,0xFF88FF,0x44CCFF,0xFF8844,0xFFFFFF];
  const color=colors[Math.floor(Math.random()*colors.length)];
  const cx=(Math.random()-0.5)*30,cy=18+Math.random()*14,cz=-10+(Math.random()-0.5)*20;
  const mat=new THREE.MeshBasicMaterial({color});
  for(let i=0;i<45+Math.floor(Math.random()*25);i++){
    const theta=Math.random()*Math.PI*2,phi=Math.random()*Math.PI,speed=0.08+Math.random()*0.12;
    const vel=new THREE.Vector3(Math.sin(phi)*Math.cos(theta)*speed,Math.cos(phi)*speed,Math.sin(phi)*Math.sin(theta)*speed);
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(0.08,4,4),mat.clone());
    mesh.position.set(cx,cy,cz);scene.add(mesh);
    fireworkParticles.push({mesh,vel,life:1.0,decay:0.015+Math.random()*0.02});
  }
  playFireworkBoom(150+Math.random()*200);
}

// ─── ARMS ─────────────────────────────────────────────────
function makeArm(side){
  const g=new THREE.Group(),skin=0xF5CBA7;
  const add=(geo,px,py,pz)=>{const m=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({color:skin}));m.position.set(px,py,pz);g.add(m);};
  add(new THREE.BoxGeometry(0.1,0.1,0.35),0,0,-0.17);
  add(new THREE.BoxGeometry(0.12,0.14,0.08),0,0,-0.38);
  [-0.04,0,0.04].forEach(fx=>add(new THREE.BoxGeometry(0.025,0.03,0.06),fx,-0.01,-0.46));
  add(new THREE.BoxGeometry(0.04,0.035,0.03),side*0.05,0.04,-0.38);
  return g;
}
const leftArm=makeArm(-1),rightArm=makeArm(1);
leftArm.position.set(-0.27,-0.3,-0.15);
rightArm.position.set(0.27,-0.3,-0.15);
camera.add(leftArm);camera.add(rightArm);scene.add(camera);

// ─── ROOMS ────────────────────────────────────────────────
const linkStyle=`background:rgba(255,255,255,0.07);border:1px solid currentColor;border-radius:10px;padding:14px 18px;color:inherit;text-decoration:none;display:block;margin-bottom:10px;`;
const rooms={
  lab:{color:'#0a0a1a',textColor:'#00FFCC',content:`<div style="text-align:center;padding:40px;max-width:720px;margin:0 auto;">
    <h1 style="font-size:2.4rem;margin-bottom:8px;">Astropelion Labs</h1>
    <p style="opacity:0.55;margin-bottom:32px;">Self-taught engineer. Chip designer. Game dev. Music producer.</p>
    <a href="https://store.steampowered.com/app/4217560/Stella_Incus_Demo/" target="_blank" style="${linkStyle}"><strong>Stella Incus</strong> — Sci-fi puzzle game. Play the demo on Steam.</a>
    <a href="https://github.com/nvino10-sys/sha256-k-pruning" target="_blank" style="${linkStyle}"><strong>SHA-256 K-Pruning</strong> — Hash constant optimization research on GitHub.</a>
    <a href="https://github.com/nvino10-sys/swap-inference-asic" target="_blank" style="${linkStyle}"><strong>Swap Inference ASIC</strong> — Custom silicon inference accelerator on GitHub.</a>
    <div style="${linkStyle}cursor:default;opacity:0.5;"><strong>CARRT</strong> — In development. Coming soon.</div>
    <p style="opacity:0.3;font-size:0.72rem;margin-top:24px;">Music: APALONBeats via Pixabay</p>
  </div>`},
  library:{color:'#0f0a05',textColor:'#FFD700',content:`<div style="text-align:center;padding:40px;max-width:580px;margin:0 auto;">
    <h1 style="font-size:2.4rem;margin-bottom:8px;">The Library</h1>
    <p style="opacity:0.55;margin-bottom:28px;">Free books. Knowledge should cost nothing.</p>
    <a href="https://www.gutenberg.org/ebooks/1342" target="_blank" style="${linkStyle}">Pride and Prejudice — Jane Austen</a>
    <a href="https://www.gutenberg.org/ebooks/84"   target="_blank" style="${linkStyle}">Frankenstein — Mary Shelley</a>
    <a href="https://www.gutenberg.org/ebooks/11"   target="_blank" style="${linkStyle}">Alice in Wonderland — Lewis Carroll</a>
    <a href="https://www.gutenberg.org/ebooks/2701" target="_blank" style="${linkStyle}">Moby Dick — Herman Melville</a>
    <a href="https://www.gutenberg.org/ebooks/1080" target="_blank" style="${linkStyle}">A Modest Proposal — Jonathan Swift</a>
    <a href="https://www.gutenberg.org/ebooks/844"  target="_blank" style="${linkStyle}">The Importance of Being Earnest — Oscar Wilde</a>
  </div>`},
  concert:{color:'#0a0015',textColor:'#CC88FF',content:`<div style="text-align:center;padding:40px;max-width:500px;margin:0 auto;">
    <h1 style="font-size:2.4rem;margin-bottom:8px;">Concert Hall</h1>
    <p style="opacity:0.55;margin-bottom:28px;">Music by diverge the path</p>
    <div style="background:rgba(200,136,255,0.08);border:1px solid #CC88FF;border-radius:16px;padding:28px;">
      <div style="font-size:3.5rem;margin-bottom:14px;">🎧</div>
      <p style="opacity:0.8;line-height:1.9;">300+ experimental electronic tracks. Raw signal. Pure expression.</p>
      <a href="https://soundcloud.com/divergethepath" target="_blank" style="display:inline-block;margin-top:20px;background:#CC88FF;color:#0a0015;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">Listen on SoundCloud</a>
    </div>
  </div>`},
  cafeteria:{color:'#050f05',textColor:'#88FF88',content:`<div style="text-align:center;padding:40px;max-width:500px;margin:0 auto;">
    <h1 style="font-size:2.4rem;margin-bottom:8px;">Cafeteria</h1>
    <div style="font-size:4rem;margin:16px 0;">☕</div>
    <p style="opacity:0.7;line-height:1.8;margin-bottom:28px;">
      Nick built this whole world for fun, on a day off, with a little help from an AI octopus.<br>
      If it made you smile, a coffee goes a long way.
    </p>
    <a href="https://www.buymeacoffee.com/NicholasCorvino" target="_blank"
      style="display:inline-block;background:#FFDD00;color:#000;font-weight:bold;
      font-size:1.1rem;padding:14px 32px;border-radius:12px;text-decoration:none;
      box-shadow:0 4px 16px rgba(255,221,0,0.35);margin-bottom:24px;">
      ☕ Buy Nicholas a Coffee
    </a>
    <p style="opacity:0.3;font-size:0.78rem;">No pressure. The world is free. Always will be.</p>
    <div style="margin-top:28px;opacity:0.5;font-size:0.85rem;line-height:1.8;">
      Multiplayer lounge coming soon.<br>Sit down, chat, play cards.
    </div>
  </div>`}
};
rooms['lounge']={color:'#050510',textColor:'#AAAAFF',content:`<div style="text-align:center;padding:40px;max-width:500px;margin:0 auto;">
  <h1 style="font-size:2.2rem;margin-bottom:8px;">🎰 Astropelion Lounge</h1>
  <div style="font-size:3rem;margin:16px 0;">🤖🃏🪩</div>
  <p style="opacity:0.7;line-height:1.8;">Walk up to a poker table and press E to sit.<br>
  Slots on the upper deck take SpaceBucks.<br>
  Robots will attend to your every beep.</p>
</div>`};

const roomOverlay=document.createElement('div');
roomOverlay.style.cssText=`position:fixed;inset:0;color:white;font-family:'Segoe UI',sans-serif;z-index:200;display:none;align-items:center;justify-content:center;overflow-y:auto;opacity:0;transition:opacity 0.4s;`;
document.body.appendChild(roomOverlay);
const exitBtn=document.createElement('button');
exitBtn.textContent='Exit';
exitBtn.style.cssText=`position:fixed;top:20px;left:20px;z-index:201;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.3);color:white;padding:10px 20px;border-radius:10px;cursor:pointer;font-size:14px;backdrop-filter:blur(8px);display:none;`;
document.body.appendChild(exitBtn);
let inRoom=false;
function enterRoom(roomId){
  const room=rooms[roomId];if(!room)return;
  inRoom=true;roomOverlay.style.background=room.color;roomOverlay.style.color=room.textColor;
  roomOverlay.innerHTML=room.content;roomOverlay.style.display='flex';
  setTimeout(()=>roomOverlay.style.opacity='1',10);
  exitBtn.style.display='block';exitBtn.style.color=room.textColor;
  safeSetVolume(0.1);
  if(document.pointerLockElement)document.exitPointerLock();
}
function exitRoom(){
  inRoom=false;roomOverlay.style.opacity='0';exitBtn.style.display='none';
  setTimeout(()=>roomOverlay.style.display='none',400);safeSetVolume(0.35);
}
exitBtn.addEventListener('click',exitRoom);

const doorPrompt=document.createElement('div');
doorPrompt.style.cssText=`position:fixed;bottom:140px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.65);color:white;padding:12px 28px;border-radius:12px;font-family:sans-serif;font-size:15px;border:1px solid rgba(255,255,255,0.3);backdrop-filter:blur(8px);display:none;z-index:100;cursor:pointer;user-select:none;active:opacity:0.7;`;
// Tapping the prompt fires the same action as pressing E
function fireInteract(){
  // Will relock after interact unless a UI opens
  let willOpenUI=false;
  // Always release pointer lock so cursor is available for any UI
  if(document.pointerLockElement) document.exitPointerLock();

  if(nearestPlayerId){
    // Show player menu centered on screen for keyboard users
    const p=otherPlayers[nearestPlayerId];
    if(p) showPlayerMenu(nearestPlayerId, window.innerWidth/2, window.innerHeight/2);
    return;
  }
  if(nearCosmeticShop){ openCosmeticShop(); return; }
  if(nearPetShop){ openPetShop(); return; }
  if(nearLeaderboard){ openLeaderboard(); return; }
  if(nearSlotMachine){ openSlotMachine(); return; }
  if(nearRaffleVendor){ buyRaffleTicket(); return; }
  if(nearHost){ seatPlayerAtLounge(); return; }
  if(nearPoker&&!inRoom){ openPokerTable(); return; }
  if(nearSlide&&!slideMode)         enterSlide();
  else if(nearPot&&!hasCoin)        { hasCoin=true; coinIndicator.style.display='block'; doorPrompt.style.display='none'; }
  else if(nearFountain&&hasCoin)    doWishSequence();
  else if(nearFountain&&!hasCoin)   showRainbowMsg();
  else if(nearClaude)               openClaudeChat();
  else if(nearDoor&&!isSitting)     enterRoom(nearDoor.roomId);
  else if(nearBench&&!isSitting)    sitDown(nearBench);
  else if(isSitting)                standUp();
  else if(nearTee!==null&&!golfMode&&!mpGolf.active) enterGolf(nearTee);
}
doorPrompt.addEventListener('touchend', e=>{ e.preventDefault(); fireInteract(); }, {passive:false});
doorPrompt.addEventListener('click', ()=>fireInteract());
document.body.appendChild(doorPrompt);

// ─── MUSIC CONTROL ────────────────────────────────────────
let lastTapTime=0,volPanelOpen=false;
const musicBtn=document.createElement('div');
musicBtn.innerHTML='🎵';
musicBtn.style.cssText=`position:fixed;top:16px;right:20px;width:44px;height:44px;background:rgba(0,0,0,0.55);border:2px solid rgba(255,255,255,0.35);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;user-select:none;z-index:100;backdrop-filter:blur(8px);`;
document.body.appendChild(musicBtn);

// Bug report button
const bugBtn=document.createElement('div');
bugBtn.innerHTML='🐛';
bugBtn.title='Report a bug or player';
bugBtn.style.cssText=`position:fixed;top:68px;right:20px;width:44px;height:44px;background:rgba(0,0,0,0.55);border:2px solid rgba(255,255,255,0.25);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;user-select:none;z-index:100;backdrop-filter:blur(8px);`;
document.body.appendChild(bugBtn);

bugBtn.addEventListener('click',()=>openBugReport());
bugBtn.addEventListener('touchend',e=>{e.preventDefault();openBugReport();},{passive:false});

function openBugReport(){
  if(document.getElementById('bugReportOverlay')) return;
  const overlay=document.createElement('div');
  overlay.id='bugReportOverlay';
  overlay.style.cssText=`position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;
    align-items:center;justify-content:center;z-index:500;`;
  overlay.innerHTML=`
    <div style="background:#111;border:1px solid rgba(255,255,255,0.15);border-radius:16px;
      padding:24px;max-width:380px;width:90%;color:white;font-family:sans-serif;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="margin:0;">🐛 Submit a Report</h3>
        <button onclick="document.getElementById('bugReportOverlay')?.remove()"
          style="background:none;border:none;color:white;font-size:1.2rem;cursor:pointer;opacity:0.6;">✕</button>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <button id="rptTypeBug" onclick="window.setReportType('bug')"
          style="flex:1;padding:10px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:bold;
          background:rgba(200,50,50,0.4);color:white;border:2px solid #CC3333;">
          🐛 Bug Report</button>
        <button id="rptTypePlayer" onclick="window.setReportType('player')"
          style="flex:1;padding:10px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:bold;
          background:rgba(255,255,255,0.08);color:white;border:2px solid transparent;">
          🚨 Report Player</button>
      </div>

      <div id="playerFieldWrap" style="display:none;margin-bottom:10px;">
        <label style="font-size:0.8rem;opacity:0.6;">Player username</label>
        <input id="rptPlayer" placeholder="Username" style="width:100%;padding:8px;border-radius:8px;
          border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);
          color:white;font-size:13px;box-sizing:border-box;margin-top:4px;">
      </div>

      <label style="font-size:0.8rem;opacity:0.6;">Description</label>
      <textarea id="rptDesc" placeholder="Describe what happened..." rows="4"
        style="width:100%;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);
        background:rgba(255,255,255,0.08);color:white;font-size:13px;
        box-sizing:border-box;margin-top:4px;resize:none;"></textarea>

      <div style="display:flex;gap:8px;margin-top:14px;">
        <button onclick="window.submitReport()"
          style="flex:1;background:#CC3333;color:white;border:none;border-radius:10px;
          padding:11px;cursor:pointer;font-size:14px;font-weight:bold;">Send Report</button>
        <button onclick="document.getElementById('bugReportOverlay')?.remove()"
          style="background:rgba(255,255,255,0.08);color:white;border:1px solid rgba(255,255,255,0.15);
          border-radius:10px;padding:11px 18px;cursor:pointer;font-size:13px;">Cancel</button>
      </div>
      <div id="rptStatus" style="margin-top:10px;font-size:0.8rem;text-align:center;opacity:0.6;"></div>
    </div>`;
  document.body.appendChild(overlay);
  window._reportType='bug';
}

window.setReportType=(type)=>{
  window._reportType=type;
  document.getElementById('rptTypeBug').style.background=type==='bug'?'rgba(200,50,50,0.4)':'rgba(255,255,255,0.08)';
  document.getElementById('rptTypeBug').style.borderColor=type==='bug'?'#CC3333':'transparent';
  document.getElementById('rptTypePlayer').style.background=type==='player'?'rgba(255,150,0,0.3)':'rgba(255,255,255,0.08)';
  document.getElementById('rptTypePlayer').style.borderColor=type==='player'?'#FF9900':'transparent';
  document.getElementById('playerFieldWrap').style.display=type==='player'?'block':'none';
};

window.submitReport=()=>{
  const type=window._reportType||'bug';
  const desc=document.getElementById('rptDesc')?.value.trim();
  const player=document.getElementById('rptPlayer')?.value.trim();
  if(!desc){ document.getElementById('rptStatus').textContent='Please describe the issue.'; return; }
  const report={type, desc, reporter:myUsername||'unknown', player:player||null, url:location.href, ts:new Date().toISOString()};
  // Send to server
  if(socket) socket.emit('report:submit', report);
  // Also open mailto as backup
  const subject=encodeURIComponent(`APLabs ${type==='bug'?'Bug Report':'Player Report'} from ${myUsername||'unknown'}`);
  const body=encodeURIComponent(`Type: ${type}\nReporter: ${myUsername||'unknown'}\n${player?'Reported player: '+player+'\n':''}Description:\n${desc}\n\nTime: ${new Date().toLocaleString()}`);
  window.open(`mailto:astropelionlabs@gmail.com?subject=${subject}&body=${body}`,'_blank');
  document.getElementById('rptStatus').textContent='✅ Report sent! Thank you.';
  document.getElementById('rptDesc').value='';
  setTimeout(()=>document.getElementById('bugReportOverlay')?.remove(),1500);
};
const volPanel=document.createElement('div');
volPanel.style.cssText=`position:fixed;top:68px;right:20px;background:rgba(0,0,0,0.7);border:1px solid rgba(255,255,255,0.2);border-radius:12px;padding:12px 14px;display:none;z-index:100;`;
volPanel.innerHTML=`<div style="color:white;font-family:sans-serif;font-size:12px;margin-bottom:8px;">Volume</div><input type="range" min="0" max="100" value="35" style="width:100px;accent-color:#fff;">`;
document.body.appendChild(volPanel);
const volSlider=volPanel.querySelector('input');
volSlider.addEventListener('input',()=>safeSetVolume(volSlider.value/100));
musicBtn.addEventListener('click',()=>{
  const now=Date.now();
  if(now-lastTapTime<350){
    musicMuted=!musicMuted;bgMusic.volume=musicMuted?0:volSlider.value/100;
    musicBtn.innerHTML=musicMuted?'🔇':'🎵';volPanelOpen=false;volPanel.style.display='none';
  } else {
    volPanelOpen=!volPanelOpen;volPanel.style.display=volPanelOpen?'block':'none';
  }
  lastTapTime=now;
});

// ─── PHYSICS / INPUT ──────────────────────────────────────
let velocityY=0,isGrounded=true;
const GRAVITY=20,JUMP_FORCE=9,GROUND_Y=1.7;
const keys={};
let yaw=0,pitch=0,isLocked=false;
let nearDoor=null,nearBench=null;
let isSitting=false,sitBench=null;

let nearClaude=false;
let nearestPlayerId=null; // closest other player for E key

document.addEventListener('keydown',e=>{
  // Block everything while join screen or ToS is up
  if(joinOverlay.style.display!=='none') return;
  if(tosOverlay.style.display!=='none') return;
  // Block ALL game keys while chat is open — only allow chat control keys
  if(chatOpen){
    if(e.code==='Enter'){ sendChatMsg(); }
    if(e.code==='Escape'){ chatOpen=false; chatBox.style.display='none'; }
    return;
  }
  keys[e.code]=true;
  if(e.code==='Space'){
    if(golfMode&&!ballInMotion&&!e.repeat&&!powerCharging){ powerCharging=true; powerAmount=0; powerBar.style.display='block'; powerLabel.style.display='block'; }
    else if(isGrounded&&!inRoom&&!isSitting){velocityY=JUMP_FORCE;isGrounded=false;}
  }
  if(e.code==='KeyE') fireInteract();
  if(e.code==='KeyF'&&!inRoom&&!golfMode){ toggleFly(); }
  if(e.code==='Escape'){
    if(claudeOverlay.style.display==='flex'){claudeOverlay.style.display='none';inRoom=false;safeSetVolume(0.35);}
    else if(dmOverlay.style.display==='block'){ window.closeDM(); }
    else if(wishOverlay.style.display==='flex') closeWishBoard();
    else if(inRoom)exitRoom();
    else if(isSitting)standUp();
    else if(golfMode)exitGolf();
  }
});
document.addEventListener('keyup',e=>{
  keys[e.code]=false;
  if(e.code==='Space'&&golfMode&&powerCharging&&!ballInMotion)puttBall();
});

renderer.domElement.addEventListener('click',()=>{
  if(inRoom||golfMode||slideMode)return;
  renderer.domElement.requestPointerLock();
});
document.addEventListener('pointerlockchange',()=>{isLocked=document.pointerLockElement===renderer.domElement;});
document.addEventListener('mousemove',e=>{
  if(!isLocked||inRoom||isSitting)return;
  yaw-=e.movementX*0.002;pitch-=e.movementY*0.002;
  pitch=Math.max(-Math.PI/3,Math.min(Math.PI/3,pitch));
});

function sitDown(bench){
  isSitting=true;sitBench=bench;
  camera.position.copy(bench.eyePos);
  yaw=bench.rotY+Math.PI;pitch=0;
  leftArm.visible=false;rightArm.visible=false;
  doorPrompt.textContent='Press E or tap to stand up';doorPrompt.style.display='block';
  if(document.pointerLockElement)document.exitPointerLock();
}
function standUp(){
  isSitting=false;sitBench=null;camera.position.y=GROUND_Y;
  leftArm.visible=true;rightArm.visible=true;doorPrompt.style.display='none';
}

let joystick={active:false,dx:0,dy:0,id:null,startX:0,startY:0};
let lookTouch={active:false,id:null,startX:0,startY:0};
function inJoystickZone(x,y){
  // Exclude friends button area (bottom-left corner ~68x68px)
  if(x < 80 && y > window.innerHeight - 80) return false;
  return x<210 && y>window.innerHeight-300;
}
renderer.domElement.addEventListener('touchstart',e=>{
  if(joinOverlay.style.display!=='none') return; // block during character creation
  if(inRoom)return;
  for(const t of e.changedTouches){
    if(inJoystickZone(t.clientX,t.clientY)&&!joystick.active)
      joystick={active:true,startX:t.clientX,startY:t.clientY,dx:0,dy:0,id:t.identifier};
    else if(!inJoystickZone(t.clientX,t.clientY)&&!lookTouch.active&&!golfMode)
      lookTouch={active:true,startX:t.clientX,startY:t.clientY,id:t.identifier};
  }
},{passive:true});
renderer.domElement.addEventListener('touchmove',e=>{
  for(const t of e.changedTouches){
    if(t.identifier===joystick.id){joystick.dx=(t.clientX-joystick.startX)/50;joystick.dy=(t.clientY-joystick.startY)/50;}
    if(t.identifier===lookTouch.id){
      yaw-=(t.clientX-lookTouch.startX)*0.007;pitch-=(t.clientY-lookTouch.startY)*0.005;
      pitch=Math.max(-Math.PI/3,Math.min(Math.PI/3,pitch));
      lookTouch.startX=t.clientX;lookTouch.startY=t.clientY;
    }
  }
},{passive:true});
renderer.domElement.addEventListener('touchend',e=>{
  for(const t of e.changedTouches){
    if(t.identifier===joystick.id)joystick={active:false,dx:0,dy:0,id:null};
    if(t.identifier===lookTouch.id)lookTouch={active:false,id:null};
  }
},{passive:true});

const jumpBtn=document.createElement('div');
jumpBtn.innerHTML='⬆';
jumpBtn.style.cssText=`position:fixed;bottom:100px;right:20px;width:60px;height:60px;background:rgba(255,255,255,0.2);border:2px solid rgba(255,255,255,0.5);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;color:white;user-select:none;z-index:100;backdrop-filter:blur(4px);`;
jumpBtn.addEventListener('touchstart',e=>{
  e.preventDefault();
  if(nearLadder){
    onLadder=true;
    camera.position.x=LADDER_X; camera.position.z=LADDER_Z;
    camera.position.y=Math.min(camera.position.y+3, towerH+1.7);
    velocityY=0; isGrounded=false;
  } else if(isGrounded&&!inRoom&&!isSitting){
    velocityY=JUMP_FORCE; isGrounded=false;
  }
},{passive:false});
document.body.appendChild(jumpBtn);

// ── CHAT BUTTON (mobile) ──
const chatBtn=document.createElement('div');
chatBtn.innerHTML='💬';
chatBtn.style.cssText=`position:fixed;bottom:172px;right:20px;width:52px;height:52px;
  background:rgba(0,0,0,0.45);border:2px solid rgba(255,255,255,0.35);border-radius:50%;
  display:flex;align-items:center;justify-content:center;font-size:22px;
  cursor:pointer;user-select:none;z-index:100;backdrop-filter:blur(6px);`;
chatBtn.addEventListener('click',()=>{
  if(!socket||!mySocketId) return;
  chatOpen=!chatOpen;
  chatBox.style.display=chatOpen?'block':'none';
  if(chatOpen) setTimeout(()=>document.getElementById('chatInput')?.focus(),50);
});
chatBtn.addEventListener('touchend',e=>{
  e.preventDefault();
  if(!socket||!mySocketId){showNotification('Connect to multiplayer to chat');return;}
  chatOpen=!chatOpen;
  chatBox.style.display=chatOpen?'block':'none';
  if(chatOpen) setTimeout(()=>document.getElementById('chatInput')?.focus(),50);
},{passive:false});
document.body.appendChild(chatBtn);

// ── MICROPHONE BUTTON ──
const VOICE_RANGE = 18, VOICE_FALLOFF = 6;
let micActive = false;
let livekitRoom = null;
const remoteAudioEls = {}; // participantIdentity -> HTMLAudioElement

const micBtn = document.createElement('div');
micBtn.innerHTML = '🎤';
micBtn.style.cssText = `position:fixed;bottom:236px;right:20px;width:52px;height:52px;
  background:rgba(0,0,0,0.45);border:2px solid rgba(255,255,255,0.25);border-radius:50%;
  display:flex;align-items:center;justify-content:center;font-size:22px;
  cursor:pointer;user-select:none;z-index:100;backdrop-filter:blur(6px);`;
document.body.appendChild(micBtn);

const micConfirmOverlay = document.createElement('div');
micConfirmOverlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.85);
  display:none;align-items:center;justify-content:center;z-index:400;`;
micConfirmOverlay.innerHTML = `
  <div style="max-width:380px;background:rgba(20,20,30,0.98);border:1px solid rgba(255,100,100,0.4);
    border-radius:20px;padding:32px 28px;text-align:center;color:white;font-family:sans-serif;">
    <div style="font-size:3rem;margin-bottom:12px;">🎤</div>
    <h2 style="margin:0 0 10px;font-size:1.4rem;">Enable Voice Chat?</h2>
    <p style="opacity:0.65;line-height:1.7;margin-bottom:8px;font-size:0.9rem;">
      Nearby players will hear you. Works up to ${VOICE_RANGE} units away — fades with distance.
    </p>
    <p style="opacity:0.5;font-size:0.8rem;margin-bottom:24px;line-height:1.6;">
      ⚠️ Others will hear your mic while active. Tap 🔴 to turn off anytime.
    </p>
    <div style="display:flex;gap:12px;justify-content:center;">
      <button id="micYes" style="background:#CC3333;color:white;border:none;border-radius:10px;
        padding:12px 28px;font-size:15px;font-weight:bold;cursor:pointer;">
        Yes, enable mic
      </button>
      <button id="micNo" style="background:rgba(255,255,255,0.1);color:white;
        border:1px solid rgba(255,255,255,0.2);border-radius:10px;
        padding:12px 28px;font-size:15px;cursor:pointer;">
        Cancel
      </button>
    </div>
  </div>
`;
document.body.appendChild(micConfirmOverlay);

// closePeer is a no-op stub — LiveKit handles cleanup automatically
function closePeer(sid){ /* LiveKit handles remote participant cleanup */ }

function closeAllPeers(){
  if(livekitRoom){ livekitRoom.disconnect(); livekitRoom=null; }
  Object.values(remoteAudioEls).forEach(el=>el.remove());
  Object.keys(remoteAudioEls).forEach(k=>delete remoteAudioEls[k]);
  micActive=false;
}

function updateVoiceVolumes(){
  if(!micActive||!livekitRoom) return;
  livekitRoom.remoteParticipants.forEach((participant)=>{
    const el=remoteAudioEls[participant.identity];
    if(!el) return;
    const p=Object.values(otherPlayers).find(pl=>pl.data.username===participant.identity);
    if(!p){ el.volume=0; return; }
    const dx=camera.position.x-p.group.position.x;
    const dz=camera.position.z-p.group.position.z;
    const dist=Math.sqrt(dx*dx+dz*dz);
    const vol=dist>VOICE_RANGE?0:dist<VOICE_FALLOFF?1:1-(dist-VOICE_FALLOFF)/(VOICE_RANGE-VOICE_FALLOFF);
    el.volume=Math.max(0,Math.min(1,vol));
  });
}

let voiceCheckTimer=0;
function updateVoiceConnections(delta){
  if(!micActive||!livekitRoom) return;
  voiceCheckTimer+=delta;
  if(voiceCheckTimer<1.5) return;
  voiceCheckTimer=0;
  updateVoiceVolumes();
}

async function enableMic(){
  try{
    if(!mySocketId){ showNotification('Connect to multiplayer first!'); return; }
    console.log('[LIVEKIT] connecting as:', myUsername);
    const res=await fetch(`${SERVER_URL}/livekit-token?username=${encodeURIComponent(myUsername)}&room=aplabs-world`);
    if(!res.ok) throw new Error('Token fetch failed: '+res.status);
    const {token}=await res.json();

    livekitRoom=new Room();

    livekitRoom.on(RoomEvent.TrackSubscribed,(track,_pub,participant)=>{
      if(track.kind===Track.Kind.Audio){
        const el=track.attach();
        el.autoplay=true; el.style.display='none';
        document.body.appendChild(el);
        remoteAudioEls[participant.identity]=el;
        showNotification('🎙️ Voice connected!');
      }
    });

    livekitRoom.on(RoomEvent.TrackUnsubscribed,(track,_pub,participant)=>{
      const el=remoteAudioEls[participant.identity];
      if(el){ el.remove(); delete remoteAudioEls[participant.identity]; }
    });

    livekitRoom.on(RoomEvent.Disconnected,()=>{
      micActive=false;
      micBtn.style.background='rgba(0,0,0,0.45)';
      micBtn.style.borderColor='rgba(255,255,255,0.25)';
      micBtn.innerHTML='🎤';
    });

    await livekitRoom.connect('wss://aplabs-space-zefyhivd.livekit.cloud', token);
    await livekitRoom.localParticipant.setMicrophoneEnabled(true);

    micActive=true;
    micBtn.style.background='rgba(180,0,0,0.7)';
    micBtn.style.borderColor='rgba(255,80,80,0.8)';
    micBtn.innerHTML='🔴';
    micBtn.title='Mic ON — tap to mute';
    showNotification('🎤 Voice on — nearby players can hear you');
  }catch(e){
    showNotification('🎤 Voice failed to connect');
    console.error('[VOICE] LiveKit error:',e);
  }
}

function disableMic(){
  closeAllPeers();
  micBtn.style.background='rgba(0,0,0,0.45)';
  micBtn.style.borderColor='rgba(255,255,255,0.25)';
  micBtn.innerHTML='🎤';
  micBtn.title='Tap to enable voice chat';
  showNotification('🎤 Mic off');
}

micBtn.addEventListener('click',()=>{
  if(micActive){ disableMic(); return; }
  micConfirmOverlay.style.display='flex';
});
micBtn.addEventListener('touchend',e=>{ e.preventDefault(); micBtn.click(); },{passive:false});

setTimeout(()=>{
  document.getElementById('micYes')?.addEventListener('click',async()=>{
    micConfirmOverlay.style.display='none';
    await enableMic();
  });
  document.getElementById('micNo')?.addEventListener('click',()=>{
    micConfirmOverlay.style.display='none';
  });
},200);

// ─── TELEPORT MENU ────────────────────────────────────────
const destinations={
  '🌊 Water Slide':{x:SLIDE_X, z:SLIDE_Z, y:towerH+1.7, onTop:true},
  'Campus Entrance':{x:0,z:8},
  'Library':{x:0,z:-14},
  'Cafeteria':{x:-16,z:-21},
  'Concert Hall':{x:15,z:-5},
  'City Center':{x:34,z:-55},
  'Mini Golf':{x:-33,z:-4},
  '🚀 Launch Pad':{x:LC_X,z:LC_Z-12},
  '🎰 The Lounge':{x:LX,z:LZ+8},
};
const menuList=document.createElement('div');
menuList.style.cssText=`position:fixed;bottom:70px;right:20px;background:rgba(0,0,0,0.75);border:1px solid rgba(255,255,255,0.2);border-radius:14px;overflow:hidden;display:none;z-index:100;backdrop-filter:blur(12px);min-width:170px;`;
Object.entries(destinations).forEach(([name,pos])=>{
  const item=document.createElement('div');
  item.textContent=name;
  item.style.cssText=`padding:11px 18px;color:white;font-family:sans-serif;font-size:14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.08);transition:background 0.15s;`;
  item.addEventListener('mouseover',()=>item.style.background='rgba(255,255,255,0.15)');
  item.addEventListener('mouseout',()=>item.style.background='transparent');
  const go=()=>{
    camera.position.set(pos.x, pos.onTop ? pos.y : GROUND_Y, pos.z+(pos.onTop?0:4));
    if(pos.onTop){ velocityY=0; isGrounded=true; }
    menuList.style.display='none'; menuOpen=false;
  };
  item.addEventListener('click',go);item.addEventListener('touchend',go);
  menuList.appendChild(item);
});
const menuBtn=document.createElement('div');
menuBtn.innerHTML='Places';
menuBtn.style.cssText=`position:fixed;bottom:20px;right:20px;padding:10px 18px;background:rgba(0,0,0,0.55);border:2px solid rgba(255,255,255,0.35);border-radius:12px;color:white;font-family:sans-serif;font-size:14px;font-weight:bold;cursor:pointer;user-select:none;z-index:100;backdrop-filter:blur(8px);`;
let menuOpen=false;
menuBtn.addEventListener('click',()=>{menuOpen=!menuOpen;menuList.style.display=menuOpen?'block':'none';});
document.body.appendChild(menuList);document.body.appendChild(menuBtn);

// ─── COLLISION ────────────────────────────────────────────
const PLAYER_RADIUS=0.5;
function resolveCollision(pos){
  for(const c of colliders){
    const cx=Math.max(c.minX,Math.min(pos.x,c.maxX));
    const cz=Math.max(c.minZ,Math.min(pos.z,c.maxZ));
    const dx=pos.x-cx,dz=pos.z-cz;
    const dist=Math.sqrt(dx*dx+dz*dz);
    if(dist<PLAYER_RADIUS&&dist>0){const push=(PLAYER_RADIUS-dist)/dist;pos.x+=dx*push;pos.z+=dz*push;}
  }
  for(const c of circColliders){
    const dx=pos.x-c.cx,dz=pos.z-c.cz;
    const dist=Math.sqrt(dx*dx+dz*dz);
    const minD=PLAYER_RADIUS+c.r;
    if(dist<minD&&dist>0){const push=(minD-dist)/dist;pos.x+=dx*push;pos.z+=dz*push;}
  }
  for(const t of treeColliders){
    const dx=pos.x-t.cx,dz=pos.z-t.cz;
    const dist=Math.sqrt(dx*dx+dz*dz);
    if(dist<PLAYER_RADIUS+t.r&&dist>0){const push=(PLAYER_RADIUS+t.r-dist)/dist;pos.x+=dx*push;pos.z+=dz*push;}
  }
}

// ─── UPDATE ───────────────────────────────────────────────
const moveDir=new THREE.Vector3();
const clock=new THREE.Clock();
let armBob=0,totalTime=0,blimpAngle=0;

function update(){
  const delta=Math.min(clock.getDelta(),0.05);
  totalTime+=delta;

  // animBlimp defined first so it's available to all blocks below
  const animBlimp=()=>{
    blimpAngle-=delta*0.12;
    blimpGroup.position.x=Math.cos(blimpAngle)*38;
    blimpGroup.position.z=Math.sin(blimpAngle)*38-18;
    blimpGroup.position.y=22+Math.sin(totalTime*0.4)*1.5;
    blimpGroup.rotation.y=-blimpAngle+Math.PI/2;
  };

  // Fireworks
  if(fireworksActive){
    fireworkTimer+=delta;
    if(fireworkTimer>0.5&&fireworkBurstCount<12){launchFirework();fireworkTimer=0;fireworkBurstCount++;if(fireworkBurstCount>=12)fireworksActive=false;}
  }
  for(let i=fireworkParticles.length-1;i>=0;i--){
    const p=fireworkParticles[i];
    p.mesh.position.x+=p.vel.x;p.mesh.position.y+=p.vel.y;p.vel.y-=0.003;p.mesh.position.z+=p.vel.z;
    p.life-=p.decay;p.mesh.material.opacity=p.life;p.mesh.material.transparent=true;
    if(p.life<=0||p.mesh.position.y>60||p.mesh.position.y<-10){scene.remove(p.mesh);fireworkParticles.splice(i,1);}
  }

  // ── LADDER CLIMB ──
  {const dx=camera.position.x-LADDER_X, dz=camera.position.z-LADDER_Z;
   nearLadder = Math.sqrt(dx*dx+dz*dz)<1.8;}
  // Update jump button label
  jumpBtn.innerHTML = nearLadder ? '⬆<br><span style="font-size:9px;opacity:0.7">CLIMB</span>' : '⬆';

  const climbUp = nearLadder && (keys['KeyW']||keys['ArrowUp']||(joystick.active&&joystick.dy<-0.3));
  const climbDown = nearLadder && (keys['KeyS']||keys['ArrowDown']||(joystick.active&&joystick.dy>0.3));

  if(climbUp){
    onLadder=true;
    camera.position.x=LADDER_X; camera.position.z=LADDER_Z;
    camera.position.y=Math.min(camera.position.y+5*delta, towerH+1.7);
    velocityY=0; isGrounded=false;
  } else if(climbDown&&camera.position.y>GROUND_Y+0.1){
    onLadder=true;
    camera.position.x=LADDER_X; camera.position.z=LADDER_Z;
    camera.position.y=Math.max(camera.position.y-5*delta, GROUND_Y);
    velocityY=0;
    if(camera.position.y<=GROUND_Y+0.2) isGrounded=true;
  } else {
    onLadder=false;
  }
  if(onLadder){ velocityY=0; isGrounded=false; }

  // ── SLIDE MODE ──
  if(slideMode){
    const loopBoost=(slideT>0.28&&slideT<0.58)?1.5:1.0;
    const endEase=slideT>0.88?0.7:1.0;
    slideT+=(delta/SLIDE_DURATION)*loopBoost*endEase;
    if(slideT>=1){ exitSlide(); }
    else {
      const t=Math.min(slideT,0.998);
      const tAhead=Math.min(t+0.015,0.998);
      const riderPos=slideCurve.getPoint(t);
      const riderAhead=slideCurve.getPoint(tAhead);
      // Move rider body
      riderGroup.position.copy(riderPos);
      const fwd=riderAhead.clone().sub(riderPos).normalize();
      riderGroup.rotation.y=Math.atan2(fwd.x,fwd.z);
      riderGroup.rotation.x=Math.asin(Math.max(-0.9,Math.min(0.9,-fwd.y)))*0.7;
      // Arm flail on loop
      const loopSection=(t>0.3&&t<0.55);
      [2,4].forEach(idx=>{ if(riderGroup.children[idx]) riderGroup.children[idx].rotation.z=loopSection?Math.sin(totalTime*12)*0.6:0; });
      // Chase camera — behind and above rider
      const camOffset=new THREE.Vector3(-fwd.x*7,4,-fwd.z*7);
      const targetCamPos=riderPos.clone().add(camOffset);
      camera.position.lerp(targetCamPos,0.28);
      const lookTarget=riderPos.clone().add(new THREE.Vector3(0,0.8,0));
      const diff=lookTarget.clone().sub(camera.position).normalize();
      yaw=Math.atan2(diff.x,diff.z);
      pitch=Math.asin(Math.max(-0.9,Math.min(0.9,diff.y)));
      camera.rotation.order='YXZ';
      camera.rotation.y=yaw; camera.rotation.x=pitch;
    }
    clouds.forEach(c=>{c.group.position.x+=c.speed*delta;if(c.group.position.x>100)c.group.position.x=-100;});
    flags.forEach(f=>{f.rotation.z=Math.sin(totalTime*2.5)*0.12;});
    animBlimp();
    updateAnimals(delta,totalTime);
    updateRobots(delta,totalTime);
    updateLounge(delta,totalTime);
    updateRocket(delta,totalTime);
    // Broadcast slide position so other players can see us on the tube
    if(socket&&mySocketId&&slideMode){
      posUpdateTimer+=delta;
      if(posUpdateTimer>0.05){
        const rp=slideCurve.getPoint(Math.min(slideT,0.998));
        socket.emit('player:move',{x:rp.x,y:rp.y,z:rp.z,rotY:yaw,sliding:true});
        posUpdateTimer=0;
      }
    }
  }

  // Splash particles
  for(let i=splashParticles.length-1;i>=0;i--){
    const sp=splashParticles[i];
    sp.mesh.position.x+=sp.vel.x; sp.mesh.position.y+=sp.vel.y; sp.vel.y-=0.008;
    sp.mesh.position.z+=sp.vel.z; sp.life-=sp.decay;
    sp.mesh.material.opacity=sp.life;
    if(sp.life<=0||sp.mesh.position.y<-1){scene.remove(sp.mesh);splashParticles.splice(i,1);}
  }

  if(slideMode) return;

  if(golfMode){
    const padSpeed=1.8;
    if(paddleLHeld)yaw+=padSpeed*delta;
    if(paddleRHeld)yaw-=padSpeed*delta;
    camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=-0.28;
    camera.position.x=ballPos.x+Math.sin(yaw)*5;
    camera.position.z=ballPos.z+Math.cos(yaw)*5;
    camera.position.y=ballPos.y+3.8;
    const aimDir=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
    aimArrow.position.set(ballPos.x+aimDir.x*1.2,ballPos.y+0.15,ballPos.z+aimDir.z*1.2);
    aimArrow.rotation.set(Math.PI/2,0,-yaw);
    aimArrow.material.opacity=ballInMotion?0:0.75;
    if(powerCharging&&!ballInMotion){powerAmount=Math.min(powerAmount+delta*GOLF_FILL_RATE,100);powerFill.style.width=powerAmount+'%';}
    if(ballInMotion){
      ballPos.x+=ballVel.x;ballPos.z+=ballVel.y;
      ballVel.multiplyScalar(0.975);
      resolveBallVsBumpers();
      golfBallMesh.position.set(ballPos.x,0.13,ballPos.z);
      mpGolfBroadcastBallPos(); // spectator cam update
      if(ballVel.length()<0.0008){
        ballInMotion=false;ballVel.set(0,0);
        mpGolfBallStopped(); // notify server in mp match
        if(!mpGolf.active){ // solo mode cup detection only
          for(const cup of golfCupMeshes){
            const dx=ballPos.x-cup.x,dz=ballPos.z-cup.z;
            if(Math.sqrt(dx*dx+dz*dz)<0.45){
              playCupSound();golfTotalStrokes[cup.hole]=golfStrokes;
              showScoreFlash(cup.hole+1,golfStrokes,golfHoles[cup.hole].par);
              golfBallMesh.visible=false;aimArrow.visible=false;
              setTimeout(()=>{
                if(cup.hole<golfHoles.length-1){enterGolf(cup.hole+1);}
                else{showScorecard();golfHUD.style.display='none';golfExitBtn.style.display='none';golfPaddleL.style.display='none';golfPaddleR.style.display='none';}
              },2400);
              break;
            }
          }
        }
      }
    }
    clouds.forEach(c=>{c.group.position.x+=c.speed*delta;if(c.group.position.x>100)c.group.position.x=-100;});
    flags.forEach(f=>{f.rotation.z=Math.sin(totalTime*2.5)*0.12;});
    animBlimp();return;
    }
  if(carDriving){
    clouds.forEach(c=>{c.group.position.x+=c.speed*delta;if(c.group.position.x>100)c.group.position.x=-100;});
    flags.forEach(f=>{f.rotation.z=Math.sin(totalTime*2.5)*0.12;});
    animBlimp();
    updateRocket(delta,totalTime);
    updateAnimals(delta,totalTime);
    updateRobots(delta,totalTime);
    updateLounge(delta,totalTime);
    updatePet(delta,totalTime);
    updateNimbus(delta,totalTime);
    return;
  }
  

  if(inRoom||isSitting){
    clouds.forEach(c=>{c.group.position.x+=c.speed*delta;if(c.group.position.x>100)c.group.position.x=-100;});
    flags.forEach(f=>{f.rotation.z=Math.sin(totalTime*2.5)*0.12;});
    animBlimp();
    updateRocket(delta,totalTime);
    return;
  }

  camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=pitch;
  moveDir.set(0,0,0);
  const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  if(keys['KeyW']||keys['ArrowUp'])    moveDir.addScaledVector(forward, 1);
  if(keys['KeyS']||keys['ArrowDown'])  moveDir.addScaledVector(forward,-1);
  if(keys['KeyA']||keys['ArrowLeft'])  moveDir.addScaledVector(right,  -1);
  if(keys['KeyD']||keys['ArrowRight']) moveDir.addScaledVector(right,   1);
  if(joystick.active){
    moveDir.addScaledVector(forward,-Math.max(-1,Math.min(1,joystick.dy)));
    moveDir.addScaledVector(right,   Math.max(-1,Math.min(1,joystick.dx)));
  }

  if(flyMode){
    // Fly mode: full 3D movement, no gravity, fast
    const flySpeed = 18;
    const flyDir = new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw)*Math.cos(pitch));
    const flyRight = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const flyMoveDir = new THREE.Vector3();
    if(keys['KeyW']||keys['ArrowUp'])    flyMoveDir.addScaledVector(flyDir, 1);
    if(keys['KeyS']||keys['ArrowDown'])  flyMoveDir.addScaledVector(flyDir,-1);
    if(keys['KeyA']||keys['ArrowLeft'])  flyMoveDir.addScaledVector(flyRight,-1);
    if(keys['KeyD']||keys['ArrowRight']) flyMoveDir.addScaledVector(flyRight, 1);
    if(keys['Space'])  flyMoveDir.y += 1;
    if(keys['ShiftLeft']||keys['ShiftRight']) flyMoveDir.y -= 1;
    // Joystick for mobile fly
    if(joystick.active){
      flyMoveDir.addScaledVector(flyDir,-Math.max(-1,Math.min(1,joystick.dy)));
      flyMoveDir.addScaledVector(flyRight,Math.max(-1,Math.min(1,joystick.dx)));
    }
    if(flyMoveDir.length()>0) flyMoveDir.normalize();
    camera.position.addScaledVector(flyMoveDir, flySpeed*delta);
    isGrounded=false;
  } else {
    const moving=moveDir.length()>0;
    if(moving){moveDir.normalize();camera.position.addScaledVector(moveDir,6*delta);armBob+=delta*8;if(isGrounded)playFootstep();}
    resolveCollision(camera.position);

    // Hill terrain following
    const hillSurfaceY=getTerrainY(camera.position.x,camera.position.z);
    let targetY=GROUND_Y+hillSurfaceY;
    // Roof platform landing
    for(const r of roofPlatforms){
      if(camera.position.x>r.minX&&camera.position.x<r.maxX&&
         camera.position.z>r.minZ&&camera.position.z<r.maxZ&&
         camera.position.y>=r.y-0.5&&camera.position.y<=r.y+3){
        targetY=Math.max(targetY,r.y); break;
      }
    }
    if(!isGrounded){
      velocityY-=GRAVITY*delta;camera.position.y+=velocityY*delta;
      if(camera.position.y<=targetY){camera.position.y=targetY;velocityY=0;isGrounded=true;}
    } else {
      camera.position.y+=(targetY-camera.position.y)*0.25;
      if(camera.position.y<targetY)camera.position.y=targetY;
    }

    const swing=moving?Math.sin(armBob)*0.06:0;
    leftArm.position.z=-0.15+swing;rightArm.position.z=-0.15-swing;
    if(moving){const rdx=moveDir.dot(right),rdz=-moveDir.dot(forward);updateDirIndicator(rdx,rdz);}
    else{updateDirIndicator(0,0);}
  }

  // Update coordinate HUD
  const cx=camera.position.x.toFixed(1);
  const cy=camera.position.y.toFixed(1);
  const cz=camera.position.z.toFixed(1);
  const flySymbol=flyMode?'✈ ':'';
  coordHUD.innerHTML=`${flySymbol}${cx}, ${cy}, ${cz} <span style="opacity:0.4;font-size:9px;">F=fly</span>`;
  coordHUD.style.color=flyMode?'#FFD700':'#00FF99';
  coordHUD.style.borderColor=flyMode?'rgba(255,200,0,0.5)':'rgba(0,255,150,0.25)';
  updateCompass(yaw);

  clouds.forEach(c=>{c.group.position.x+=c.speed*delta;c.group.position.y=c.baseY+Math.sin(totalTime*0.2)*0.5;if(c.group.position.x>100)c.group.position.x=-100;});
  flags.forEach(f=>{f.rotation.z=Math.sin(totalTime*2.5)*0.12;f.rotation.y=Math.sin(totalTime*1.8)*0.05;});
  butterflies.forEach(b=>{
    b.angle+=b.speed*delta;
    b.group.position.x=b.centerX+Math.cos(b.angle)*b.radius;
    b.group.position.z=b.centerZ+Math.sin(b.angle)*b.radius*0.6;
    b.group.position.y=b.baseY+Math.sin(totalTime*3+b.phase)*0.3;
    b.group.rotation.y=-b.angle+Math.PI/2;
    const flap=Math.sin(totalTime*10+b.phase)*0.6;
    b.lWing.rotation.y=flap;b.rWing.rotation.y=-flap;
  });
  scene.children.forEach(obj=>{if(obj.userData.isFountainDrop)obj.position.y=2.2+Math.sin(totalTime*4+obj.userData.fountainPhase*Math.PI*2)*0.15;});
  fountainSounds.forEach(fs=>{const dx=camera.position.x-fs.x,dz=camera.position.z-fs.z;fs.gain.gain.value=Math.max(0,0.10-Math.sqrt(dx*dx+dz*dz)*0.012);});
  animBlimp();
  updateAnimals(delta, totalTime);
  updateRocket(delta, totalTime);

  nearDoor=null;let closestDoor=3.5;
  doors.forEach(d=>{const dx=camera.position.x-d.pos.x,dz=camera.position.z-d.pos.z;const dist=Math.sqrt(dx*dx+dz*dz);if(dist<closestDoor){closestDoor=dist;nearDoor=d;}});
  nearBench=null;let closestBench=2.5;
  benchSeats.forEach(b=>{const dx=camera.position.x-b.pos.x,dz=camera.position.z-b.pos.z;const dist=Math.sqrt(dx*dx+dz*dz);if(dist<closestBench){closestBench=dist;nearBench=b;}});
  nearTee=null;let closestTee=3.2;
  golfHoles.forEach((h,i)=>{const dx=camera.position.x-h.tee.x,dz=camera.position.z-h.tee.z;const dist=Math.sqrt(dx*dx+dz*dz);if(dist<closestTee){closestTee=dist;nearTee=i;}});

  // Pot of gold proximity
  {const dx=camera.position.x-window.POT_X,dz=camera.position.z-window.POT_Z;
   nearPot=Math.sqrt(dx*dx+dz*dz)<3.2&&!hasCoin;}

  // Fountain proximity
  nearFountain=false;
  fountainSounds.forEach(fs=>{
    const dx=camera.position.x-fs.x,dz=camera.position.z-fs.z;
    if(Math.sqrt(dx*dx+dz*dz)<3.5) nearFountain=true;
  });

  // Claude proximity + bubble
  {const dx=camera.position.x-(-10), dz=camera.position.z-(-3.5);
   const dist=Math.sqrt(dx*dx+dz*dz);
   nearClaude = dist < 3.5;
   if(window.claudeGroup){
     window.claudeGroup.position.y=Math.sin(totalTime*1.2)*0.06;
     if(window.claudeUmbrella) window.claudeUmbrella.rotation.y=totalTime*0.4;
     if(window.claudeBubble){
       if(nearClaude&&!inRoom){
         const wp=new THREE.Vector3(-10,2.4,-3.5);
         const proj=wp.clone().project(camera);
         const sx=(proj.x*0.5+0.5)*window.innerWidth;
         const sy=(-proj.y*0.5+0.5)*window.innerHeight;
         if(proj.z<1){
           window.claudeBubble.style.left=sx+'px';
           window.claudeBubble.style.top=(sy-8)+'px';
           window.claudeBubble.style.display='block';
         } else window.claudeBubble.style.display='none';
       } else window.claudeBubble.style.display='none';
     }
   }
  }

  // Rainbow message countdown + cooldown
  if(wishCooldown>0) wishCooldown-=delta;
  if(rainbowMsgTimer>0){
    rainbowMsgTimer-=delta;
    rainbowTextTimer+=delta;
    animateRainbowText();
    if(rainbowMsgTimer<=0) rainbowMsg.style.display='none';
  }

  // Slide proximity — at top of tower
  {const dx=camera.position.x-SLIDE_X, dz=camera.position.z-SLIDE_Z;
   nearSlide = Math.sqrt(dx*dx+dz*dz)<4.0 && camera.position.y>20;}

  // Nearest other player for E key interaction
  nearestPlayerId=null; let closestPlayer=4.0;
  if(!golfMode){ // don't show player interaction during golf
    Object.entries(otherPlayers).forEach(([sid,p])=>{
      const dx=camera.position.x-p.group.position.x;
      const dz=camera.position.z-p.group.position.z;
      const d=Math.sqrt(dx*dx+dz*dz);
      if(d<closestPlayer){closestPlayer=d;nearestPlayerId=sid;}
    });
  }

  if(!isSitting&&!golfMode){
    if(nearSlide&&!slideMode)        {doorPrompt.textContent='🌊 Press E to RIDE! 🌊';doorPrompt.style.display='block';}
    else if(nearPoker)               {doorPrompt.textContent='Press E to play poker 🃏';doorPrompt.style.display='block';}
    else if(nearLadder&&!nearSlide)  {doorPrompt.textContent='Push joystick forward or tap ⬆ to climb';doorPrompt.style.display='block';}
    else if(nearPot&&!hasCoin)       {doorPrompt.textContent='Press E to pick up a coin 🪙';doorPrompt.style.display='block';}
    else if(nearFountain&&hasCoin)   {doorPrompt.textContent='Press E to toss coin & make a wish ✨';doorPrompt.style.display='block';}
    else if(nearFountain&&!hasCoin)  {doorPrompt.textContent='Press E to approach the fountain';doorPrompt.style.display='block';}
    else if(nearCosmeticShop)       {doorPrompt.textContent='Press E for Boutique ✨';doorPrompt.style.display='block';}
    else if(nearPetShop)            {doorPrompt.textContent='Press E for Pet Shop 🐾';doorPrompt.style.display='block';}
    else if(nearLeaderboard)          {doorPrompt.textContent='Press E to view leaderboard 🏆';doorPrompt.style.display='block';}
    else if(nearSlotMachine)         {doorPrompt.textContent='Press E to play slots 🎰';doorPrompt.style.display='block';}
    else if(nearRaffleVendor)        {doorPrompt.textContent='Press E to buy raffle ticket 🎫';doorPrompt.style.display='block';}
    else if(nearHost)                {doorPrompt.textContent='Press E to be seated 🎩';doorPrompt.style.display='block';}
    else if(nearClaude)              {doorPrompt.textContent='Press E to talk to Claude 🐙';doorPrompt.style.display='block';}
    else if(nearDoor)                {doorPrompt.textContent='Press E or tap to enter '+nearDoor.label;doorPrompt.style.display='block';}
    else if(nearBench)               {doorPrompt.textContent='Press E or tap to sit';doorPrompt.style.display='block';}
    else if(nearTee!==null&&!mpGolf.active) {doorPrompt.textContent='Press E to play Hole '+(nearTee+1);doorPrompt.style.display='block';}
    else if(nearestPlayerId)         {doorPrompt.textContent='Press E to interact with player 👤';doorPrompt.style.display='block';}
    else                             {doorPrompt.style.display='none';}
  }
  // ── MULTIPLAYER UPDATES ──
  if(socket&&mySocketId){
    posUpdateTimer+=delta;
    if(posUpdateTimer>0.05){ sendPosition(); posUpdateTimer=0; }

  }
  if(myChatTimer>0){ myChatTimer-=delta; if(myChatTimer<=0) myChatBubble.style.display='none'; }
  updateRemotePlayers(delta, totalTime);
  updateRobots(delta, totalTime);
  updateLounge(delta, totalTime);
  updatePet(delta, totalTime);
  updateNimbus(delta, totalTime);
  updateSlotProximity();
  // Cosmetic shop proximity
  const csx=camera.position.x-(CSHOP_X-5.5), csz=camera.position.z-CSHOP_Z;
  nearCosmeticShop=Math.sqrt(csx*csx+csz*csz)<3;
  updateVoiceConnections(delta);
  updateVoiceVolumes();
  if(mpGolf.active) updateMpBallMarkers();
  updateGolferFigure();
  updateGolfTouchHint();
  // Near poker table
  {const pdx=camera.position.x-(-16),pdz=camera.position.z-(-28);
   nearPoker=Math.sqrt(pdx*pdx+pdz*pdz)<4;}
}

window.addEventListener('resize',()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);});

// ─── TERMS OF SERVICE ─────────────────────────────────────
const tosAccepted = localStorage.getItem('aplabs_tos_v1') === 'yes';
const tosOverlay = document.createElement('div');
tosOverlay.style.cssText=`position:fixed;inset:0;background:rgba(0,5,15,0.98);
  color:white;font-family:'Segoe UI',sans-serif;z-index:600;
  display:${tosAccepted?'none':'flex'};align-items:center;justify-content:center;`;
tosOverlay.innerHTML=`
  <div style="max-width:520px;padding:32px 28px;display:flex;flex-direction:column;height:90vh;box-sizing:border-box;">
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:2rem;font-weight:bold;">Astropelion Labs</div>
      <div style="opacity:0.5;font-size:0.85rem;margin-top:4px;">Community Standards & Terms of Use</div>
    </div>
    <div id="tosBody" style="flex:1;overflow-y:auto;background:rgba(255,255,255,0.04);
      border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:20px;
      font-size:0.88rem;line-height:1.8;margin-bottom:16px;">
      <p style="color:#44FF88;font-weight:bold;margin-top:0;">Welcome. This is a place built for fun, creativity, and good vibes.</p>
      <p>By entering, you agree to the following:</p>
      <p><strong>🤝 Be Kind</strong><br>
      Treat every person you meet here with basic human decency. Disagreements happen — cruelty doesn't have to. This world is for everyone.</p>
      <p><strong>🚫 Zero Tolerance</strong><br>
      The following will result in an immediate and permanent ban with no appeal:<br>
      • Hate speech, racism, bigotry, or targeted harassment of any kind<br>
      • Threats of violence or real-world harm<br>
      • Sexual content of any kind directed at or involving minors — this will be reported to authorities<br>
      • Soliciting personal information (age, location, contact details) from other users<br>
      • Impersonation of real people with intent to deceive or harm</p>
      <p><strong>💬 Language</strong><br>
      Casual language is fine. We auto-filter extreme profanity. But "filtered" doesn't mean "encouraged" — keep it fun, not foul.</p>
      <p><strong>🔒 Your Privacy</strong><br>
      Do not share your real name, address, phone number, school, workplace, or any identifying information in public chat. Protect yourself.</p>
      <p><strong>📵 No Soliciting</strong><br>
      This is not a place to advertise, recruit, sell, or promote anything. Keep it genuine.</p>
      <p><strong>🎮 It's a Game</strong><br>
      Have fun. Explore. Play golf. Make wishes. Ride the slide. Talk to the octopus. That's what this is for.</p>
      <p><strong>⚖️ Enforcement</strong><br>
      Violations are handled by automated systems and manual review. Bans are issued at our sole discretion. There is no formal appeals process for severe violations.</p>
      <p style="opacity:0.5;font-size:0.8rem;margin-bottom:0;">By clicking "I Agree" you confirm you have read these terms, are at least 13 years of age, and agree to abide by them.</p>
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <input type="checkbox" id="tosCheck" style="width:18px;height:18px;cursor:pointer;accent-color:#FF7A45;">
      <label for="tosCheck" style="font-size:0.88rem;cursor:pointer;opacity:0.8;">
        I have read and agree to the Community Standards above
      </label>
    </div>
    <button id="tosAgreeBtn" disabled
      style="background:#555;color:rgba(255,255,255,0.4);border:none;border-radius:12px;
      padding:14px;font-size:16px;font-weight:bold;cursor:not-allowed;transition:all 0.2s;">
      I Agree — Enter the World
    </button>
  </div>
`;
document.body.appendChild(tosOverlay);

setTimeout(()=>{
  const tosCheck=document.getElementById('tosCheck');
  const tosBtn=document.getElementById('tosAgreeBtn');
  const tosBody=document.getElementById('tosBody');
  if(!tosCheck||!tosBtn) return;
  tosCheck.addEventListener('change',()=>{
    if(tosCheck.checked){
      tosBtn.disabled=false;
      tosBtn.style.background='#FF7A45';
      tosBtn.style.color='white';
      tosBtn.style.cursor='pointer';
    } else {
      tosBtn.disabled=true;
      tosBtn.style.background='#555';
      tosBtn.style.color='rgba(255,255,255,0.4)';
      tosBtn.style.cursor='not-allowed';
    }
  });
  tosBtn.addEventListener('click',()=>{
    if(!tosCheck.checked) return;
    localStorage.setItem('aplabs_tos_v1','yes');
    tosOverlay.style.display='none';
  });
  // Scroll hint — button stays disabled until checkbox checked (no forced scroll)
},100);
// Auto-detect: localhost uses local server, everything else uses Railway
const SERVER_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3001'
  : 'https://aplabs-server-production.up.railway.app';
let socket = null;
let mySocketId = null;
Object.defineProperty(window,'_mySocketId',{get:()=>mySocketId});
let myUsername = '';
let myAnimal = 'cow';
let myHat = 'none';
let myShirtColor = '#FF4488';
const otherPlayers = {}; // socketId -> { group, label, chatBubble, ... }
let lastSentX=0, lastSentZ=0, lastSentRotY=0, lastSentY=0, posUpdateTimer=0;

// ── AVATAR COLORS ──
const ANIMAL_BODY_COLORS = {cow:0xF5F0E8,pig:0xFFB5C8,duck:0xFFDD44,rabbit:0xE8E0D8,chicken:0xFF8844};
const ANIMAL_ACCENT_COLORS = {cow:0x222222,pig:0xFF8899,duck:0xFF6600,rabbit:0xFFAAAA,chicken:0xFF4400};
const HAT_DATA = {
  none: null,
  cowboy: {color:0x8B6914, shape:'cowboy'},
  tophat: {color:0x111111, shape:'cylinder'},
  crown:  {color:0xFFD700, shape:'crown'},
  party:  {color:0xFF44AA, shape:'cone'},
  cap:    {color:0x2244CC, shape:'cap'},
};

function buildPlayerMesh(animal, hat, shirtColor) {
  const g = new THREE.Group();
  const bc = ANIMAL_BODY_COLORS[animal] || 0xFFAAAA;
  const ac = ANIMAL_ACCENT_COLORS[animal] || 0xFF6600;
  const bMat = new THREE.MeshLambertMaterial({color:bc});
  const aMat = new THREE.MeshLambertMaterial({color:ac});
  const shirtMat = new THREE.MeshLambertMaterial({color:parseInt(shirtColor.replace('#','0x'))});

  // Body (shirt colored)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55,0.6,0.4), shirtMat);
  body.position.y=0.72; g.add(body);
  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.48,0.45,0.42), bMat);
  head.position.set(0,1.25,0.04); g.add(head);
  // Eyes
  [-0.12,0.12].forEach(ex=>{
    const eye=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.07,0.05),new THREE.MeshBasicMaterial({color:0x111111}));
    eye.position.set(ex,1.28,0.22); g.add(eye);
  });
  // Animal features
  if(animal==='cow'){
    [-0.16,0.16].forEach(hx=>{
      const horn=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.05,0.2,4),aMat);
      horn.position.set(hx,1.52,0); g.add(horn);
    });
    // Sunglasses
    [-0.13,0.13].forEach(gx=>{
      const lens=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.09,0.04),new THREE.MeshBasicMaterial({color:0x111133,transparent:true,opacity:0.85}));
      lens.position.set(gx,1.3,0.23); g.add(lens);
    });
  }
  if(animal==='rabbit'){
    [-0.13,0.13].forEach(ex=>{
      const ear=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.35,0.08),bMat);
      ear.position.set(ex,1.58,0); g.add(ear);
    });
  }
  if(animal==='pig'||animal==='cow'){
    const snout=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.14,0.08),aMat);
    snout.position.set(0,1.16,0.24); g.add(snout);
  }
  if(animal==='duck'||animal==='chicken'){
    const beak=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.1,0.14),aMat);
    beak.position.set(0,1.18,0.28); g.add(beak);
  }
  if(animal==='chicken'){
    const comb=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.14,0.08),aMat);
    comb.position.set(0,1.52,0.04); g.add(comb);
  }
  // Arms
  [-0.35,0.35].forEach(ax=>{
    const arm=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.38,0.14),bMat);
    arm.position.set(ax,0.72,0); g.add(arm);
  });
  // Legs
  [-0.16,0.16].forEach(lx=>{
    const leg=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.38,0.16),aMat);
    leg.position.set(lx,0.22,0); g.add(leg);
  });

  // Hat
  if(hat && hat !== 'none') {
    const hd = HAT_DATA[hat];
    if(hd) {
      const hatMat = new THREE.MeshLambertMaterial({color:hd.color});
      if(hd.shape==='cowboy'){
        const brim=new THREE.Mesh(new THREE.CylinderGeometry(0.45,0.45,0.06,12),hatMat);
        brim.position.set(0,1.52,0); g.add(brim);
        const top=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.26,0.38,12),hatMat);
        top.position.set(0,1.72,0); g.add(top);
      } else if(hd.shape==='cylinder'){
        const top=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,0.55,12),hatMat);
        top.position.set(0,1.78,0); g.add(top);
        const brim=new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.34,0.05,12),hatMat);
        brim.position.set(0,1.52,0); g.add(brim);
      } else if(hd.shape==='crown'){
        const base=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.28,0.22,12),hatMat);
        base.position.set(0,1.58,0); g.add(base);
        [0,1,2,3,4].forEach(i=>{
          const spike=new THREE.Mesh(new THREE.ConeGeometry(0.06,0.22,4),hatMat);
          const a=(i/5)*Math.PI*2;
          spike.position.set(Math.cos(a)*0.2,1.82,Math.sin(a)*0.2); g.add(spike);
        });
      } else if(hd.shape==='cone'){
        const cone2=new THREE.Mesh(new THREE.ConeGeometry(0.22,0.5,8),hatMat);
        cone2.position.set(0,1.78,0); g.add(cone2);
        // Party stripes
        const stripeMat=new THREE.MeshBasicMaterial({color:0xFFFF00});
        const stripe=new THREE.Mesh(new THREE.TorusGeometry(0.16,0.02,4,12),stripeMat);
        stripe.position.set(0,1.63,0); g.add(stripe);
      } else if(hd.shape==='cap'){
        const dome=new THREE.Mesh(new THREE.SphereGeometry(0.26,8,6,0,Math.PI*2,0,Math.PI/2),hatMat);
        dome.position.set(0,1.53,0); g.add(dome);
        const brim2=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.06,0.26),hatMat);
        brim2.position.set(0,1.5,0.22); g.add(brim2);
      }
    }
  }
  return g;
}

// Name tag floating above player
function makeNameTag(username, animal) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;background:rgba(0,0,0,0.65);color:white;
    font-family:sans-serif;font-size:12px;font-weight:bold;padding:3px 10px;
    border-radius:10px;pointer-events:none;display:none;z-index:120;
    transform:translate(-50%,-100%);white-space:nowrap;`;
  el.textContent = username;
  document.body.appendChild(el);
  return el;
}

function makeRemoteChatBubble() {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;background:white;color:#222;font-family:sans-serif;
    font-size:12px;padding:5px 10px;border-radius:14px;pointer-events:none;
    display:none;z-index:121;transform:translate(-50%,-100%);
    box-shadow:0 2px 6px rgba(0,0,0,0.2);white-space:nowrap;max-width:200px;white-space:normal;`;
  document.body.appendChild(el);
  return el;
}

function addRemotePlayer(data) {
  if (otherPlayers[data.socketId]) return;
  const group = buildPlayerMesh(data.animal, data.hat, data.shirtColor || '#FF4488');
  group.position.set(data.x||0, (data.y||GROUND_Y) - GROUND_Y, data.z||0);
  scene.add(group);
  const nameTag = makeNameTag(data.username, data.animal);
  const chatBubble = makeRemoteChatBubble();
  chatBubble.timer = 0;
  otherPlayers[data.socketId] = { group, nameTag, chatBubble, data, legPhase:0, walking:false };
}

function removeRemotePlayer(socketId) {
  const p = otherPlayers[socketId];
  if (!p) return;
  scene.remove(p.group);
  p.nameTag.remove();
  p.chatBubble.remove();
  delete otherPlayers[socketId];
}

function projectToScreen(worldPos) {
  const v = worldPos.clone().project(camera);
  return {
    x: (v.x*0.5+0.5)*window.innerWidth,
    y: (-v.y*0.5+0.5)*window.innerHeight,
    visible: v.z < 1
  };
}

function updateRemotePlayers(delta, totalTime) {
  Object.values(otherPlayers).forEach(p => {
    p.legPhase += delta*6;
    const legs = p.group.children.filter((_,i)=>i===8||i===9);
    legs.forEach((l,i)=>{ if(l) l.rotation.x = Math.sin(p.legPhase+(i*Math.PI))*0.3; });

    // Distance check — hide nametag beyond 30 units
    const dx=camera.position.x-p.group.position.x;
    const dz=camera.position.z-p.group.position.z;
    const dist=Math.sqrt(dx*dx+dz*dz);
    const wp = p.group.position.clone().add(new THREE.Vector3(0,2.2,0));
    const s = projectToScreen(wp);
    if(s.visible && dist < 30) {
      p.nameTag.style.left=s.x+'px'; p.nameTag.style.top=(s.y-2)+'px';
      p.nameTag.style.display='block';
      // Fade out between 20-30 units
      p.nameTag.style.opacity = dist < 20 ? '1' : String(1-(dist-20)/10);
    } else { p.nameTag.style.display='none'; }

    // Chat bubble
    if(p.chatBubble.timer > 0) {
      p.chatBubble.timer -= delta;
      const cs = projectToScreen(p.group.position.clone().add(new THREE.Vector3(0,2.8,0)));
      if(cs.visible && dist < 30) {
        p.chatBubble.style.left=cs.x+'px'; p.chatBubble.style.top=(cs.y-2)+'px';
        p.chatBubble.style.display='block';
        p.chatBubble.style.opacity=Math.min(1,p.chatBubble.timer);
      } else p.chatBubble.style.display='none';
      if(p.chatBubble.timer<=0) p.chatBubble.style.display='none';
    }

    // Tag indicator above head
    if(tagGame.active && tagGame.itId === p.data.socketId) {
      p.nameTag.textContent = '🏃 ' + p.data.username + ' [IT]';
      p.nameTag.style.background='rgba(255,60,0,0.85)';
    } else if(tagGame.active && tagGame.itId === mySocketId) {
      p.nameTag.textContent = p.data.username;
      p.nameTag.style.background='rgba(0,0,0,0.65)';
    } else {
      p.nameTag.textContent = p.data.username;
      p.nameTag.style.background='rgba(0,0,0,0.65)';
    }
  });
}

// Send position if moved enough
function sendPosition() {
  if (!socket || !mySocketId) return;
  const dx=camera.position.x-lastSentX, dz=camera.position.z-lastSentZ;
  const dy=Math.abs(camera.position.y-lastSentY);
  const dyaw=Math.abs(yaw-lastSentRotY);
  if(Math.sqrt(dx*dx+dz*dz)>0.05||dyaw>0.04||dy>0.05){
    socket.emit('player:move',{x:camera.position.x,y:camera.position.y,z:camera.position.z,rotY:yaw});
    lastSentX=camera.position.x; lastSentZ=camera.position.z;
    lastSentRotY=yaw; lastSentY=camera.position.y;
  }
}

// ── TEXT CHAT UI ──
const chatBox = document.createElement('div');
chatBox.style.cssText=`position:fixed;bottom:310px;left:50%;transform:translateX(-50%);
  display:none;z-index:200;`;
chatBox.innerHTML=`
  <div style="display:flex;gap:6px;align-items:center;">
    <input id="chatInput" maxlength="80" placeholder="Say something..."
      style="background:rgba(0,0,0,0.82);border:1px solid rgba(255,255,255,0.3);
      color:white;font-family:sans-serif;font-size:15px;padding:11px 14px;
      border-radius:12px;width:220px;outline:none;"
      enterkeyhint="send"
    />
    <button id="chatSendBtn"
      style="background:#FF7A45;color:white;border:none;border-radius:12px;
      padding:11px 16px;font-size:15px;font-weight:bold;cursor:pointer;
      white-space:nowrap;min-width:56px;">Send</button>
  </div>
`;
document.body.appendChild(chatBox);
let chatOpen=false;

function sendChatMsg(){
  const input=document.getElementById('chatInput');
  if(!input||!input.value.trim()) return;
  const msg=input.value.trim();
  if(socket&&mySocketId) socket.emit('player:chat', msg);
  input.value='';
  chatOpen=false; chatBox.style.display='none';
}

setTimeout(()=>{
  document.getElementById('chatSendBtn')?.addEventListener('click', sendChatMsg);
  document.getElementById('chatSendBtn')?.addEventListener('touchend', e=>{
    e.preventDefault(); sendChatMsg();
  },{passive:false});
  // Mobile enter key
  document.getElementById('chatInput')?.addEventListener('keydown', e=>{
    if(e.key==='Enter'){ e.preventDefault(); sendChatMsg(); }
  });
},100);

document.addEventListener('keydown',e=>{
  if(e.code==='KeyT'&&!inRoom&&!golfMode&&!slideMode&&socket&&mySocketId){
    // Don't toggle if user is actively typing in the input
    if(document.activeElement===document.getElementById('chatInput')) return;
    chatOpen=!chatOpen;
    chatBox.style.display=chatOpen?'block':'none';
    if(chatOpen) setTimeout(()=>document.getElementById('chatInput')?.focus(),50);
  }
});

// My own chat bubble
const myChatBubble=document.createElement('div');
myChatBubble.style.cssText=`position:fixed;bottom:180px;left:50%;transform:translateX(-50%);
  background:white;color:#222;font-family:sans-serif;font-size:13px;font-weight:bold;
  padding:7px 14px;border-radius:16px;display:none;z-index:120;
  box-shadow:0 2px 8px rgba(0,0,0,0.2);max-width:220px;text-align:center;`;
document.body.appendChild(myChatBubble);
let myChatTimer=0;

// ── JOIN OVERLAY ──
const joinOverlay=document.createElement('div');
joinOverlay.style.cssText=`position:fixed;inset:0;background:rgba(0,10,30,0.96);
  color:white;font-family:'Segoe UI',sans-serif;z-index:400;
  display:flex;align-items:center;justify-content:center;flex-direction:column;`;

const ANIMALS=['cow','pig','duck','rabbit','chicken'];
const HATS=['none','cowboy','tophat','crown','party','cap'];
const SHIRT_COLORS=['#FF4488','#4488FF','#44FF88','#FFAA22','#CC44FF','#FF4422','#22CCFF'];

joinOverlay.innerHTML=`
  <div style="max-width:460px;padding:32px 28px;text-align:center;">
    <div style="font-size:2.2rem;font-weight:bold;margin-bottom:6px;">Welcome to Astropelion Labs</div>
    <div style="opacity:0.6;font-size:1rem;margin-bottom:4px;color:#FF7A45;">Forefront of the Future.</div>
    <div style="opacity:0.4;font-size:0.85rem;margin-bottom:24px;">Pick your look, then explore</div>
    <div style="margin-bottom:18px;">
      <input id="usernameInput" maxlength="20" placeholder="Your name..."
        style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.25);
        color:white;font-size:16px;padding:11px 16px;border-radius:10px;width:100%;
        box-sizing:border-box;outline:none;font-family:inherit;">
    </div>
    <div style="margin-bottom:18px;">
      <input id="passwordInput" type="password" maxlength="30" placeholder="Password (optional — saves your chips)"
        style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.25);
        color:white;font-size:14px;padding:11px 16px;border-radius:10px;width:100%;
        box-sizing:border-box;outline:none;font-family:inherit;opacity:0.8;">
    </div>
    <div style="margin-bottom:14px;text-align:left;font-size:0.85rem;opacity:0.6;">Choose your animal</div>
    <div style="display:flex;gap:8px;margin-bottom:18px;justify-content:center;" id="animalPicker">
      ${ANIMALS.map(a=>`<div class="animalBtn" data-animal="${a}"
        style="background:rgba(255,255,255,0.08);border:2px solid transparent;border-radius:10px;
        padding:8px 12px;cursor:pointer;font-size:13px;transition:all 0.15s;">${a}</div>`).join('')}
    </div>
    <div style="margin-bottom:14px;text-align:left;font-size:0.85rem;opacity:0.6;">Hat</div>
    <div style="display:flex;gap:6px;margin-bottom:18px;flex-wrap:wrap;justify-content:center;" id="hatPicker">
      ${HATS.map(h=>`<div class="hatBtn" data-hat="${h}"
        style="background:rgba(255,255,255,0.08);border:2px solid transparent;border-radius:8px;
        padding:6px 10px;cursor:pointer;font-size:12px;">${h}</div>`).join('')}
    </div>
    <div style="margin-bottom:14px;text-align:left;font-size:0.85rem;opacity:0.6;">Shirt color</div>
    <div style="display:flex;gap:8px;margin-bottom:24px;justify-content:center;" id="colorPicker">
      ${SHIRT_COLORS.map(c=>`<div class="colorBtn" data-color="${c}"
        style="width:32px;height:32px;border-radius:50%;background:${c};cursor:pointer;
        border:2px solid transparent;"></div>`).join('')}
    </div>
    <button id="joinBtn" style="background:#FF7A45;color:white;border:none;border-radius:12px;
      padding:14px 40px;font-size:16px;font-weight:bold;cursor:pointer;width:100%;">
      Enter the World
    </button>
    <div style="margin-top:12px;opacity:0.35;font-size:0.78rem;">Press T to chat · E to interact</div>
  </div>
`;
document.body.appendChild(joinOverlay);

// Picker interaction
let selectedAnimal='cow', selectedHat='none', selectedColor=SHIRT_COLORS[0];

setTimeout(()=>{
  const highlight=(selector,attr,val)=>{
    document.querySelectorAll(selector).forEach(el=>{
      const isColor=selector==='.colorBtn';
      el.style.borderColor=el.dataset[attr]===val?'#FF7A45':'transparent';
      if(!isColor) el.style.background=el.dataset[attr]===val?'rgba(255,122,69,0.2)':'rgba(255,255,255,0.08)';
      el.style.transform=el.dataset[attr]===val?(isColor?'scale(1.25)':''):'';
      el.style.boxShadow=el.dataset[attr]===val&&isColor?'0 0 0 3px #FF7A45':'none';
    });
  };
  document.querySelectorAll('.animalBtn').forEach(btn=>{
    btn.addEventListener('click',()=>{ selectedAnimal=btn.dataset.animal; highlight('.animalBtn','animal',selectedAnimal); });
  });
  document.querySelectorAll('.hatBtn').forEach(btn=>{
    btn.addEventListener('click',()=>{ selectedHat=btn.dataset.hat; highlight('.hatBtn','hat',selectedHat); });
  });
  document.querySelectorAll('.colorBtn').forEach(btn=>{
    btn.addEventListener('click',()=>{ selectedColor=btn.dataset.color; highlight('.colorBtn','color',selectedColor); });
  });
  highlight('.animalBtn','animal','cow');
  highlight('.hatBtn','hat','none');
  highlight('.colorBtn','color',selectedColor);

  document.getElementById('joinBtn').addEventListener('click',()=>{
    const name=(document.getElementById('usernameInput').value.trim()||'Visitor').substring(0,20);
    const pass=(document.getElementById('passwordInput')?.value.trim()||'');
    myUsername=name; myAnimal=selectedAnimal; myHat=selectedHat; myShirtColor=selectedColor;
    loadFriends(); // load this user's friends after username is known
    joinOverlay.style.display='none';
    connectMultiplayer(pass);
  });
  document.getElementById('usernameInput').addEventListener('keydown',e=>{
    if(e.key==='Enter') document.getElementById('joinBtn').click();
  });
},100);

function connectMultiplayer(password=''){
  if(!ioLoaded || typeof io === 'undefined'){
    showNotification('Playing offline — multiplayer unavailable');
    return;
  }
  try {
    socket = io(SERVER_URL, { transports:['polling','websocket'], reconnectionAttempts:10, reconnectionDelay:2000 });

    socket.on('connect',()=>{
      mySocketId=socket.id;
      socket.emit('player:join',{ username:myUsername, animal:myAnimal, hat:myHat, shirtColor:myShirtColor, password });
      showNotification(`Connected as ${myUsername} 🎉`);
    });

    socket.on('chips:update',(data)=>{
      const prev=window.myChips||1000;
      window.myChips=data.chips;
      const diff=data.chips-prev;
      if(diff!==0){
        const walletEl=document.getElementById('walletAmount');
        if(walletEl){
          walletEl.textContent=data.chips.toLocaleString();
          walletEl.style.animation='none';
          walletEl.style.color=diff>0?'#88FF44':'#FF6644';
          setTimeout(()=>{ walletEl.style.animation='flashPop 0.4s ease-out'; walletEl.style.color='#FFD700'; },50);
        }
        showNotification(diff>0?`💰 +${diff} SpaceBucks!`:`💸 ${diff} SpaceBucks`);
      }
    });

    socket.on('coins:received',(data)=>{
      window.myChips=(window.myChips||0)+data.amount;
      const walletEl=document.getElementById('walletAmount');
      if(walletEl){ walletEl.textContent=window.myChips.toLocaleString(); walletEl.style.color='#88FF44'; setTimeout(()=>walletEl.style.color='#FFD700',1500); }
      const ann=document.createElement('div');
      ann.style.cssText=`position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
        background:rgba(20,20,0,0.97);border:2px solid #FFD700;border-radius:16px;
        padding:24px 36px;text-align:center;color:white;font-family:sans-serif;z-index:600;`;
      ann.innerHTML=`<div style="font-size:2rem;margin-bottom:8px;">💰</div>
        <div style="font-size:1.1rem;font-weight:bold;">${data.from} sent you</div>
        <div style="font-size:2rem;color:#FFD700;font-weight:bold;margin:8px 0;">${data.amount.toLocaleString()} SB</div>
        <button onclick="this.parentElement.remove()" style="margin-top:8px;background:#886600;
          color:white;border:none;border-radius:8px;padding:8px 20px;cursor:pointer;">Nice!</button>`;
      document.body.appendChild(ann);
      setTimeout(()=>ann.remove(),8000);
    });
    socket.on('world:state',({players:ps})=>{ if(ps) window.myChips=ps.find?.(p=>p.username===myUsername)?.chips||1000; });

    socket.on('connect_error',()=>{
      showNotification('Playing offline — multiplayer unavailable');
    });

    socket.on('auth:error',(msg)=>{
      showNotification('❌ '+msg);
      socket.disconnect();
      socket=null; mySocketId=null;
      joinOverlay.style.display='flex';
    });

    socket.on('moderation:banned',(data)=>{
      const banScreen=document.createElement('div');
      banScreen.style.cssText=`position:fixed;inset:0;background:rgba(20,0,0,0.97);
        color:white;font-family:sans-serif;display:flex;align-items:center;
        justify-content:center;z-index:9999;text-align:center;`;
      banScreen.innerHTML=`
        <div style="max-width:420px;padding:32px;">
          <div style="font-size:3rem;margin-bottom:16px;">🚫</div>
          <h2 style="color:#FF4444;margin-bottom:12px;">You've been removed</h2>
          <p style="opacity:0.75;line-height:1.8;margin-bottom:20px;">${data.reason}</p>
          <p style="opacity:0.4;font-size:0.8rem;">If you believe this was in error, please review the Community Standards.</p>
        </div>`;
      document.body.appendChild(banScreen);
      if(socket){socket.disconnect();socket=null;mySocketId=null;}
    });

    socket.on('world:state',({players})=>{
      players.forEach(p=>addRemotePlayer(p));
    });

    socket.on('player:joined',(data)=>{
      addRemotePlayer(data);
      showNotification(`${data.username} joined as ${data.animal}!`);
    });

    socket.on('player:moved',(data)=>{
      const p=otherPlayers[data.socketId];
      if(!p) return;
      const prevY = p.group.position.y;
      p.group.position.set(data.x, data.y - GROUND_Y, data.z);
      p.group.rotation.y=data.rotY+Math.PI;
      // If sliding: arms out, tilt body down the slope
      if(data.sliding){
        p.isSliding=true;
        const dy = p.group.position.y - prevY;
        p.group.rotation.x = Math.max(-0.6, Math.min(0.6, -dy*2));
        // Spread arms out (indices 2 and 3 are arms in buildPlayerMesh)
        if(p.group.children[2]) p.group.children[2].rotation.z = 1.2;
        if(p.group.children[3]) p.group.children[3].rotation.z = -1.2;
      } else if(p.isSliding) {
        p.isSliding=false;
        p.group.rotation.x=0;
        if(p.group.children[2]) p.group.children[2].rotation.z=0;
        if(p.group.children[3]) p.group.children[3].rotation.z=0;
      }
    });

    socket.on('player:left',(data)=>{
      const p=otherPlayers[data.socketId];
      if(p) showNotification(`${p.data.username} left`);
      removeRemotePlayer(data.socketId);
      closePeer(data.socketId); // clean up voice
    });

    socket.on('player:chatMsg',(data)=>{
      if(data.socketId===mySocketId){
        myChatBubble.textContent=data.msg;
        myChatBubble.style.display='block';
        myChatTimer=5;
      } else {
        const p=otherPlayers[data.socketId];
        if(p){ p.chatBubble.textContent=data.msg; p.chatBubble.timer=5; }
      }
    });

    // Poker events handled separately in poker section
    socket.on('poker:publicState',(state)=>{ window.pokerPublicState=state; renderPokerTable(); });
    socket.on('poker:state',(state)=>{ window.pokerPrivateState=state; renderPokerTable(); });
    socket.on('poker:handResult',(results)=>{ showHandResult(results); });
    socket.on('poker:newHand',()=>{ showNotification('🃏 New hand dealt!'); });

  } catch(e) {
    showNotification('Playing offline');
  }
}

// Notification toast
function showNotification(msg){
  const el=document.createElement('div');
  el.style.cssText=`position:fixed;top:60px;left:50%;transform:translateX(-50%);
    background:rgba(0,0,0,0.75);color:white;font-family:sans-serif;font-size:14px;
    padding:10px 20px;border-radius:10px;z-index:500;pointer-events:none;
    border:1px solid rgba(255,255,255,0.15);`;
  el.textContent=msg;
  document.body.appendChild(el);
  setTimeout(()=>el.style.opacity='0',2500);
  setTimeout(()=>el.remove(),3000);
}

// ── POKER TABLE ──────────────────────────────────────────
// Physical table in the cafeteria
const pokerTableGroup = new THREE.Group();
// Table top (green felt)
const tableTop=new THREE.Mesh(new THREE.CylinderGeometry(2.8,2.8,0.18,16),
  new THREE.MeshLambertMaterial({color:0x1A6B2A}));
tableTop.position.y=0.09; pokerTableGroup.add(tableTop);
// Table rail (wood edge)
const tableRail=new THREE.Mesh(new THREE.TorusGeometry(2.8,0.2,8,24),
  new THREE.MeshLambertMaterial({color:0x8B5E3C}));
tableRail.rotation.x=Math.PI/2; tableRail.position.y=0.12; pokerTableGroup.add(tableRail);
// Table leg (pedestal)
const tableLeg=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.5,0.9,8),
  new THREE.MeshLambertMaterial({color:0x8B5E3C}));
tableLeg.position.y=-0.45; pokerTableGroup.add(tableLeg);
// Chairs around table (6 seats)
for(let i=0;i<6;i++){
  const angle=(i/6)*Math.PI*2;
  const chair=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.1,0.7),
    new THREE.MeshLambertMaterial({color:0x6B4423}));
  chair.position.set(Math.cos(angle)*3.5,0.4,Math.sin(angle)*3.5);
  pokerTableGroup.add(chair);
  const chairBack=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.8,0.1),
    new THREE.MeshLambertMaterial({color:0x6B4423}));
  chairBack.position.set(Math.cos(angle)*3.9,0.85,Math.sin(angle)*3.9);
  pokerTableGroup.add(chairBack);
}
// Place in cafeteria
pokerTableGroup.position.set(-16,0,-28);
scene.add(pokerTableGroup);

// Chip stacks on table for show
[0,1,2,3].forEach(i=>{
  const angle=(i/4)*Math.PI*2;
  const chipColors=[0xFF4444,0x4444FF,0x44FF44,0xFFFF44];
  for(let c=0;c<3;c++){
    const chip=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.04,12),
      new THREE.MeshLambertMaterial({color:chipColors[i]}));
    chip.position.set(-16+Math.cos(angle)*1.5,0.2+c*0.05,-28+Math.sin(angle)*1.5);
    scene.add(chip);
  }
});

// Poker UI overlay
const pokerOverlay=document.createElement('div');
pokerOverlay.style.cssText=`position:fixed;inset:0;background:rgba(0,20,0,0.95);
  color:white;font-family:'Segoe UI',sans-serif;z-index:300;display:none;
  flex-direction:column;align-items:center;justify-content:center;`;
document.body.appendChild(pokerOverlay);

window.pokerPublicState=null; window.pokerPrivateState=null;

function renderPokerTable(){
  const state=window.pokerPrivateState||window.pokerPublicState;
  if(!state||pokerOverlay.style.display==='none') return;

  const myState=state.seats?.find(s=>s&&s.socketId===mySocketId);
  const isSeated=!!myState;
  const myTurn=isSeated&&state.currentSeat===myState?.seatIndex;
  const canCheck=myTurn&&(state.currentBet===0||state.currentBet===(myState?.bet||0));

  pokerOverlay.innerHTML=`
    <div style="width:100%;max-width:700px;padding:20px;box-sizing:border-box;">
      <div style="text-align:center;margin-bottom:12px;">
        <span style="font-size:1.4rem;font-weight:bold;">🃏 APLabs Poker</span>
        <span style="opacity:0.5;font-size:0.85rem;margin-left:12px;">${state.phase||'waiting'}</span>
        ${state.pot>0?`<span style="margin-left:12px;color:#FFD700;">Pot: ${state.pot} chips</span>`:''}
      </div>

      <!-- Community cards -->
      <div style="display:flex;justify-content:center;gap:8px;margin-bottom:16px;min-height:60px;align-items:center;">
        ${(state.communityCards||[]).length===0
          ? '<span style="opacity:0.3;font-size:0.85rem;">Community cards will appear here</span>'
          : (state.communityCards||[]).map(c=>cardHTML(c)).join('')}
      </div>

      <!-- Seats -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;">
        ${(state.seats||[]).map((s,i)=>`
          <div style="background:${s?(s.socketId===mySocketId?'rgba(255,122,69,0.2)':'rgba(255,255,255,0.06)'):'rgba(0,0,0,0.3)'};
            border:1px solid ${state.currentSeat===i?'#FFD700':s?'rgba(255,255,255,0.15)':'rgba(255,255,255,0.05)'};
            border-radius:10px;padding:10px;text-align:center;cursor:${s?'default':'pointer'};min-height:80px;"
            ${!s&&!isSeated&&socket?`onclick="window.seatDown(${i})"`:''}>
            ${s
              ? `<div style="font-size:0.78rem;opacity:0.6;">${s.animal} ${s.username}</div>
                 <div style="font-size:0.9rem;color:#FFD700;">${s.chips} chips</div>
                 ${s.bet>0?`<div style="font-size:0.75rem;opacity:0.6;">bet: ${s.bet}</div>`:''}
                 <div style="display:flex;justify-content:center;gap:4px;margin-top:4px;">
                   ${(s.holeCards||[]).map(c=>cardHTML(c)).join('')}
                 </div>
                 <div style="font-size:0.75rem;color:#FF9944;margin-top:2px;">${s.lastAction||''}</div>
                 ${s.status==='folded'?'<div style="color:#FF4444;font-size:0.75rem;">Folded</div>':''}`
              : `<div style="opacity:0.3;font-size:0.8rem;padding-top:20px;">${socket?'Tap to sit':'Seat '+(i+1)}</div>`
            }
          </div>`).join('')}
      </div>

      <!-- My hole cards -->
      ${myState&&myState.holeCards?.length===2?`
        <div style="text-align:center;margin-bottom:12px;">
          <div style="opacity:0.6;font-size:0.8rem;margin-bottom:6px;">Your hand</div>
          <div style="display:flex;justify-content:center;gap:8px;">
            ${myState.holeCards.map(c=>cardHTML(c,true)).join('')}
          </div>
        </div>`:''}

      <!-- Action buttons -->
      ${myTurn&&state.phase!=='waiting'&&state.phase!=='showdown'?`
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:10px;">
          <button onclick="window.pokerAct('fold')"
            style="background:#CC3333;color:white;border:none;border-radius:8px;padding:10px 20px;cursor:pointer;font-size:14px;">Fold</button>
          ${canCheck
            ?`<button onclick="window.pokerAct('check')"
                style="background:#336633;color:white;border:none;border-radius:8px;padding:10px 20px;cursor:pointer;font-size:14px;">Check</button>`
            :`<button onclick="window.pokerAct('call')"
                style="background:#336633;color:white;border:none;border-radius:8px;padding:10px 20px;cursor:pointer;font-size:14px;">Call ${Math.min(state.currentBet-(myState?.bet||0),myState?.chips||0)}</button>`}
          <button onclick="window.pokerAct('raise',(state.currentBet||0)+(state.minRaise||20))"
            style="background:#FF7A22;color:white;border:none;border-radius:8px;padding:10px 20px;cursor:pointer;font-size:14px;">Raise ${(state.currentBet||0)+(state.minRaise||20)}</button>
        </div>`:''}
      ${isSeated&&state.phase==='waiting'?'<div style="text-align:center;opacity:0.5;margin-bottom:10px;">Waiting for players...</div>':''}

      <div style="display:flex;gap:8px;justify-content:center;">
        ${isSeated&&socket?`<button onclick="window.pokerStandUp()"
          style="background:rgba(255,255,255,0.1);color:white;border:1px solid rgba(255,255,255,0.2);
          border-radius:8px;padding:8px 18px;cursor:pointer;font-size:13px;">Stand Up</button>`:''}
        <button onclick="window.closePoker()"
          style="background:rgba(255,255,255,0.1);color:white;border:1px solid rgba(255,255,255,0.2);
          border-radius:8px;padding:8px 18px;cursor:pointer;font-size:13px;">Leave Table</button>
      </div>
    </div>
  `;
}

function cardHTML(card, big=false) {
  if(!card||card==='??') return `<div style="background:#ddd;color:#999;border-radius:5px;
    padding:${big?'10px 14px':'4px 6px'};font-size:${big?'1.4rem':'0.85rem'};border:1px solid #ccc;">??</div>`;
  const isRed = card.suit==='\u2665'||card.suit==='\u2666';
  return `<div style="background:white;color:${isRed?'#CC2222':'#111'};border-radius:5px;
    padding:${big?'10px 14px':'4px 6px'};font-size:${big?'1.4rem':'0.85rem'};
    border:1px solid #ccc;font-weight:bold;">${card.rank}${card.suit}</div>`;
}

window.seatDown=(i)=>{ if(socket) socket.emit('poker:sitDown',{seatIndex:i}); };
window.pokerAct=(action,amount)=>{ if(socket) socket.emit('poker:action',{action,amount}); };
window.pokerStandUp=()=>{ if(socket) socket.emit('poker:standUp'); };
window.closePoker=()=>{ pokerOverlay.style.display='none'; inRoom=false; safeSetVolume(0.35); };

function openPokerTable(){
  pokerOverlay.style.display='flex';
  inRoom=true; safeSetVolume(0.1);
  if(document.pointerLockElement) document.exitPointerLock();
  renderPokerTable();
}

// Detect if near poker table (in cafeteria)
let nearPoker=false;

function showHandResult(results){
  results.forEach(r=>{
    const seat=window.pokerPublicState?.seats?.[r.seatIndex];
    if(seat) showNotification(`🏆 ${seat.username} wins ${r.won} chips with ${r.handName}!`);
  });
}

// T key hint


// ─── SOCIAL SYSTEM ───────────────────────────────────────

// ── FRIENDS + DM ──
let friends = []; // loaded per-user after login
let dmInbox = {}; // socketId -> [{from, msg, time}]
function loadFriends(){ friends=JSON.parse(localStorage.getItem('aplabs_friends_'+myUsername)||'[]'); }
function saveFriends(){ localStorage.setItem('aplabs_friends_'+myUsername, JSON.stringify(friends)); }
function sendFriendRequest(socketId){
  const p=otherPlayers[socketId]; if(!p) return;
  if(friends.find(f=>f.username===p.data.username)){
    showNotification('Already friends!'); return;
  }
  if(socket) socket.emit('friend:request',{toId:socketId});
  showNotification(`👋 Friend request sent to ${p.data.username}!`);
}

// Friends & DM panel
const socialPanel = document.createElement('div');
socialPanel.style.cssText=`position:fixed;bottom:78px;left:12px;background:rgba(0,10,20,0.92);
  color:white;font-family:sans-serif;border:1px solid rgba(255,255,255,0.15);
  border-radius:14px;padding:16px;width:220px;display:none;z-index:300;
  backdrop-filter:blur(10px);max-height:80vh;overflow-y:auto;`;
document.body.appendChild(socialPanel);

// Friends button (book icon) — top left below coord HUD
const friendsBtn = document.createElement('div');
friendsBtn.innerHTML='📖';
friendsBtn.title='Friends & Messages';
friendsBtn.style.cssText=`position:fixed;bottom:20px;left:20px;width:48px;height:48px;
  background:rgba(0,0,0,0.45);border:2px solid rgba(255,255,255,0.25);border-radius:50%;
  display:flex;align-items:center;justify-content:center;font-size:22px;
  cursor:pointer;z-index:500;user-select:none;backdrop-filter:blur(6px);`;
document.body.appendChild(friendsBtn);
let socialPanelOpen=false;
function toggleSocialPanel(){
  friendsBtn.style.animation='';
  friendsBtn.title='Friends & Messages';
  friendsBtn.innerHTML='📖';
  socialPanelOpen=!socialPanelOpen;
  if(socialPanelOpen) renderSocialPanel();
  socialPanel.style.display=socialPanelOpen?'block':'none';
}
friendsBtn.addEventListener('click',toggleSocialPanel);
friendsBtn.addEventListener('touchend',e=>{e.preventDefault();toggleSocialPanel();},{passive:false});

function renderSocialPanel(){
  const onlineUsernames = Object.values(otherPlayers).map(p=>p.data.username);
  const friendsOnline = friends.filter(f=>onlineUsernames.includes(f.username));
  const friendsOffline = friends.filter(f=>!onlineUsernames.includes(f.username));
  // Get chip balance from server or local
  const myChips = window.myChips || 1000;

  socialPanel.innerHTML=`
    <div style="font-weight:bold;font-size:0.95rem;margin-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:8px;">
      📖 Friends & Messages
    </div>
    <div id="walletDisplay" style="background:rgba(255,215,0,0.12);border:1px solid rgba(255,215,0,0.3);
      border-radius:10px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px;">
      <span style="font-size:1.5rem;">💰</span>
      <div>
        <div style="font-size:0.75rem;opacity:0.55;">SpaceBucks</div>
        <div id="walletAmount" style="font-size:1.3rem;font-weight:bold;color:#FFD700;">${(window.myChips||0).toLocaleString()}</div>
      </div>
    </div>
    ${friendsOnline.length===0&&friendsOffline.length===0
      ?'<div style="opacity:0.4;font-size:0.8rem;margin-bottom:12px;">No friends yet.<br>Tap a player to add them.</div>':''}
    ${friendsOnline.map(f=>`
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="width:8px;height:8px;border-radius:50%;background:#44FF44;display:inline-block;flex-shrink:0;"></span>
        <span style="font-size:0.85rem;flex:1;">${f.username}</span>
        <button onclick="window.openDM('${f.username}')"
          style="background:rgba(255,255,255,0.1);border:none;color:white;border-radius:6px;
          padding:3px 8px;cursor:pointer;font-size:11px;">DM</button>
      </div>`).join('')}
    ${friendsOffline.map(f=>`
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;opacity:0.5;">
        <span style="width:8px;height:8px;border-radius:50%;background:#888;display:inline-block;flex-shrink:0;"></span>
        <span style="font-size:0.85rem;flex:1;">${f.username}</span>
      </div>`).join('')}
    ${Object.entries(dmInbox).length>0?`
      <div style="font-weight:bold;font-size:0.8rem;margin:12px 0 8px;opacity:0.6;">MESSAGES</div>
      ${Object.entries(dmInbox).map(([sid,msgs])=>{
        const last=msgs[msgs.length-1];
        return `<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px;
          margin-bottom:6px;cursor:pointer;font-size:0.8rem;"
          onclick="window.openDM('${last.from}')">
          <strong>${last.from}</strong><br>
          <span style="opacity:0.7;">${last.msg.substring(0,40)}${last.msg.length>40?'...':''}</span>
        </div>`;
      }).join('')}`:''}
    <button onclick="window.toggleSocialPanel()" style="margin-top:8px;width:100%;
      background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);
      color:white;border-radius:8px;padding:7px;cursor:pointer;font-size:12px;">Close</button>
  `;
}
window.toggleSocialPanel=toggleSocialPanel;

// DM overlay
const dmOverlay = document.createElement('div');
dmOverlay.style.cssText=`position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
  background:rgba(0,10,30,0.95);color:white;font-family:sans-serif;
  border:1px solid rgba(255,255,255,0.2);border-radius:16px;padding:16px;
  width:300px;display:none;z-index:400;backdrop-filter:blur(10px);`;
document.body.appendChild(dmOverlay);
let dmTarget='';

window.closeDM=()=>{
  dmOverlay.style.display='none';
  inRoom=false;
  safeSetVolume(0.35);
};

window.openDM=(username)=>{
  dmTarget=username;
  // Gather ALL messages involving this username from all buckets, sort by time
  const allMsgs=[];
  Object.values(dmInbox).forEach(bucket=>{
    if(Array.isArray(bucket)) bucket.forEach(m=>{
      if(m.from===username||m.to===username) allMsgs.push(m);
    });
  });
  allMsgs.sort((a,b)=>(a.time||0)-(b.time||0));

  function fmtTime(ts){
    if(!ts) return '';
    const d=new Date(ts);
    return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  }

  dmOverlay.innerHTML=`
    <div style="font-weight:bold;margin-bottom:10px;font-size:0.9rem;">💬 ${username}</div>
    <div id="dmMsgs" style="max-height:200px;overflow-y:auto;margin-bottom:10px;font-size:0.82rem;">
      ${allMsgs.length===0?'<div style="opacity:0.4;">No messages yet</div>':
        allMsgs.map(m=>{
          const mine=m.from===myUsername;
          return `<div style="margin-bottom:8px;display:flex;flex-direction:column;align-items:${mine?'flex-end':'flex-start'};">
            <span style="background:${mine?'rgba(255,122,69,0.35)':'rgba(255,255,255,0.12)'};
              padding:5px 11px;border-radius:12px;display:inline-block;max-width:90%;word-break:break-word;">${m.msg}</span>
            <span style="opacity:0.35;font-size:0.7rem;margin-top:2px;">${fmtTime(m.time)}</span>
          </div>`;
        }).join('')}
    </div>
    <div style="display:flex;gap:6px;">
      <input id="dmInput" maxlength="80" placeholder="Message..."
        style="flex:1;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);
        color:white;padding:8px 10px;border-radius:8px;outline:none;font-size:13px;"
        enterkeyhint="send"/>
      <button onclick="window.sendDM()" style="background:#FF7A45;border:none;color:white;
        border-radius:8px;padding:8px 12px;cursor:pointer;font-weight:bold;">Send</button>
    </div>
    <button onclick="window.closeDM()" style="margin-top:8px;width:100%;
      background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
      color:white;border-radius:8px;padding:6px;cursor:pointer;font-size:12px;">Close</button>
  `;
  dmOverlay.style.display='block';
  inRoom=true; safeSetVolume(0.1);
  socialPanel.style.display='none'; socialPanelOpen=false;
  if(document.pointerLockElement) document.exitPointerLock();
  setTimeout(()=>{
    document.getElementById('dmInput')?.focus();
    const msgs=document.getElementById('dmMsgs');
    if(msgs) msgs.scrollTop=msgs.scrollHeight;
  },50);
  document.getElementById('dmInput')?.addEventListener('keydown',e=>{ if(e.key==='Enter') window.sendDM(); });
};

window.sendDM=(()=>{
  const input=document.getElementById('dmInput');
  if(!input||!input.value.trim()) return;
  const msg=input.value.trim();
  // Find target socket
  const targetPlayer=Object.values(otherPlayers).find(p=>p.data.username===dmTarget);
  if(targetPlayer&&socket){
    socket.emit('player:dm',{toSocketId:targetPlayer.data.socketId,msg});
    const sentMsg={from:myUsername,to:dmTarget,msg,time:Date.now()};
    if(!dmInbox['sent']) dmInbox['sent']=[];
    dmInbox['sent'].push(sentMsg);
    input.value='';
    window.openDM(dmTarget);
  } else {
    showNotification(`${dmTarget} is not online`);
  }
});

// ── PLAYER TAP MENU ──
const playerMenu = document.createElement('div');
playerMenu.style.cssText=`position:fixed;background:rgba(0,10,30,0.92);color:white;
  font-family:sans-serif;border:1px solid rgba(255,255,255,0.2);border-radius:14px;
  padding:8px;display:none;z-index:350;backdrop-filter:blur(10px);min-width:160px;`;
document.body.appendChild(playerMenu);
window.closePlayerMenu=()=>{ playerMenu.style.display='none'; };
let playerMenuTarget=null;

function showPlayerMenu(socketId, screenX, screenY){
  const p=otherPlayers[socketId]; if(!p) return;
  playerMenuTarget=socketId;
  const isFriend=friends.find(f=>f.username===p.data.username);
  const isIT=tagGame.active&&tagGame.itId===mySocketId;
  playerMenu.innerHTML=`
    <div style="font-weight:bold;font-size:0.85rem;padding:6px 10px;opacity:0.7;border-bottom:1px solid rgba(255,255,255,0.1);margin-bottom:4px;">
      ${p.data.username}
    </div>
    <div class="pmItem" onclick="window.pmFriend('${socketId}')"
      style="padding:9px 14px;cursor:pointer;border-radius:8px;font-size:0.88rem;display:flex;align-items:center;gap:8px;">
      👋 ${isFriend?'Already friends':'Add Friend'}
    </div>
    <div class="pmItem" onclick="window.pmDM('${socketId}')"
      style="padding:9px 14px;cursor:pointer;border-radius:8px;font-size:0.88rem;display:flex;align-items:center;gap:8px;">
      💬 Send Message
    </div>
    <div class="pmItem" onclick="window.pmIgnore('${socketId}')"
      style="padding:9px 14px;cursor:pointer;border-radius:8px;font-size:0.88rem;display:flex;align-items:center;gap:8px;color:#FF8844;">
      🚫 Ignore
    </div>
    <div class="pmItem" onclick="window.pmTag('${socketId}')"
      style="padding:9px 14px;cursor:pointer;border-radius:8px;font-size:0.88rem;display:flex;align-items:center;gap:8px;color:${tagGame.active?'#FF8844':'#FF4444'}">
      🏃 ${tagGame.active?(isIT?'Tag them!':'Tag game active'):'Challenge to Tag!'}
    </div>
    <div class="pmItem" onclick="window.pmGolf('${socketId}')"
      style="padding:9px 14px;cursor:pointer;border-radius:8px;font-size:0.88rem;display:flex;align-items:center;gap:8px;color:#44FF88;">
      ⛳ Challenge to Golf!
    </div>
    <div class="pmItem" onclick="window.pmSendCoins('${socketId}')"
      style="padding:9px 14px;cursor:pointer;border-radius:8px;font-size:0.88rem;display:flex;align-items:center;gap:8px;color:#FFD700;">
      💰 Send SpaceBucks
    </div>
    <div class="pmItem" onclick="window.closePlayerMenu()"
      style="padding:7px 14px;cursor:pointer;border-radius:8px;font-size:0.8rem;opacity:0.5;">
      Cancel
    </div>
  `;
  // Hover effect
  playerMenu.querySelectorAll('.pmItem').forEach(el=>{
    el.addEventListener('mouseover',()=>el.style.background='rgba(255,255,255,0.1)');
    el.addEventListener('mouseout',()=>el.style.background='transparent');
  });
  // Position near tap
  const x=Math.min(screenX, window.innerWidth-180);
  const y=Math.min(screenY-20, window.innerHeight-220);
  playerMenu.style.left=x+'px'; playerMenu.style.top=y+'px';
  playerMenu.style.display='block';
}
// Close on outside tap
document.addEventListener('click',e=>{ if(!playerMenu.contains(e.target)) playerMenu.style.display='none'; });

window.pmFriend=(sid)=>{
  playerMenu.style.display='none';
  sendFriendRequest(sid);
};
window.pmDM=(sid)=>{
  const p=otherPlayers[sid]; if(!p) return;
  playerMenu.style.display='none';
  window.openDM(p.data.username);
};
window.pmIgnore=(sid)=>{
  const p=otherPlayers[sid]; if(!p) return;
  playerMenu.style.display='none';
  if(!window.ignoredPlayers) window.ignoredPlayers=new Set();
  window.ignoredPlayers.add(sid);
  // Hide their nametag and bubble
  p.nameTag.style.display='none';
  p.chatBubble.style.display='none';
  showNotification(`🚫 ${p.data.username} ignored`);
};
window.pmSendCoins=(sid)=>{
  playerMenu.style.display='none';
  const p=otherPlayers[sid]; if(!p) return;
  const target=p.data.username;
  const myBal=window.myChips||0;
  // Build send dialog
  const dlg=document.createElement('div');
  dlg.id='sendCoinsDialog';
  dlg.style.cssText=`position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;
    align-items:center;justify-content:center;z-index:600;`;
  dlg.innerHTML=`
    <div style="background:#1a1a2e;border:2px solid rgba(255,215,0,0.4);border-radius:16px;
      padding:28px 32px;text-align:center;color:white;font-family:sans-serif;min-width:280px;">
      <div style="font-size:1.8rem;margin-bottom:8px;">💰</div>
      <h3 style="margin:0 0 6px;">Send SpaceBucks</h3>
      <p style="opacity:0.6;font-size:0.85rem;margin-bottom:18px;">To: <strong>${target}</strong><br>Your balance: ${myBal.toLocaleString()} SB</p>
      <input id="sendCoinsAmt" type="number" min="1" max="${myBal}" placeholder="Amount"
        style="width:100%;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);
        background:rgba(255,255,255,0.08);color:white;font-size:1rem;text-align:center;
        box-sizing:border-box;margin-bottom:16px;">
      <div style="display:flex;gap:10px;justify-content:center;">
        <button onclick="window.confirmSendCoins('${sid}','${target}')"
          style="background:#886600;color:white;border:none;border-radius:8px;
          padding:10px 22px;cursor:pointer;font-size:14px;font-weight:bold;">Send</button>
        <button onclick="document.getElementById('sendCoinsDialog')?.remove()"
          style="background:rgba(255,255,255,0.1);color:white;border:1px solid rgba(255,255,255,0.2);
          border-radius:8px;padding:10px 22px;cursor:pointer;font-size:14px;">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  setTimeout(()=>document.getElementById('sendCoinsAmt')?.focus(),100);
};

window.confirmSendCoins=(sid,target)=>{
  const amt=parseInt(document.getElementById('sendCoinsAmt')?.value)||0;
  if(amt<=0){ showNotification('Enter a valid amount!'); return; }
  if(amt>(window.myChips||0)){ showNotification('Not enough SpaceBucks!'); return; }
  if(socket) socket.emit('coins:send',{toSocketId:sid,toUsername:target,amount:amt});
  document.getElementById('sendCoinsDialog')?.remove();
};

window.pmGolf=(sid)=>{
  playerMenu.style.display='none';
  if(mpGolf.active){ showNotification('Already in a match!'); return; }
  if(socket){ socket.emit('golf:challenge',{targetId:sid}); showNotification('⛳ Golf challenge sent!'); }
};
window.pmTag=(sid)=>{
  const p=otherPlayers[sid]; if(!p) return;
  playerMenu.style.display='none';
  if(tagGame.active && tagGame.itId===mySocketId){
    // Try to tag them if in range
    const dx=camera.position.x-p.group.position.x;
    const dz=camera.position.z-p.group.position.z;
    if(Math.sqrt(dx*dx+dz*dz)<3.5){
      socket.emit('tag:tag',{targetId:sid});
    } else {
      showNotification('Too far away to tag! Get closer!');
    }
  } else if(!tagGame.active){
    socket.emit('tag:challenge',{targetId:sid});
    showNotification(`Tag challenge sent to ${p.data.username}!`);
  }
};

// Raycasting — click/tap on player mesh
const raycaster=new THREE.Raycaster();
function trySelectPlayer(clientX, clientY){
  if(golfMode||inRoom||slideMode) return false; // no interaction during golf
  const rect=renderer.domElement.getBoundingClientRect();
  const x=((clientX-rect.left)/rect.width)*2-1;
  const y=-((clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(new THREE.Vector2(x,y), camera);
  const meshes=[];
  Object.entries(otherPlayers).forEach(([sid,p])=>{
    // Only use the body/head meshes (first 8 children), skip hats/accessories at higher indices
    p.group.children.slice(0,8).forEach(c=>{ if(c.isMesh) meshes.push({mesh:c,socketId:sid}); });
  });
  const hits=raycaster.intersectObjects(meshes.map(m=>m.mesh));
  if(hits.length>0){
    const hit=meshes.find(m=>m.mesh===hits[0].object);
    if(hit){ showPlayerMenu(hit.socketId, clientX, clientY); return true; }
  }
  return false;
}
renderer.domElement.addEventListener('click',e=>{
  if(inRoom||golfMode||slideMode) return;
  if(trySelectPlayer(e.clientX,e.clientY)) return;
  renderer.domElement.requestPointerLock();
});

// Auto re-lock pointer after interactions that don't open full UI overlays
function relockPointer(){
  if(!window.matchMedia('(pointer:coarse)').matches&&!inRoom&&!golfMode&&!slideMode){
    setTimeout(()=>{
      if(!inRoom&&!golfMode&&!slideMode) renderer.domElement.requestPointerLock();
    },80);
  }
}

renderer.domElement.addEventListener('touchend',e=>{
  if(inRoom||golfMode||slideMode) return;
  const t=e.changedTouches[0];
  trySelectPlayer(t.clientX,t.clientY);
},{passive:true});

// ── TAG GAME ──
const tagGame={active:false,itId:null,timer:0,myTimer:null};
const tagHUD=document.createElement('div');
tagHUD.style.cssText=`position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
  background:rgba(200,0,0,0.85);color:white;font-family:sans-serif;font-weight:bold;
  font-size:2rem;padding:14px 28px;border-radius:16px;display:none;z-index:300;
  pointer-events:none;text-align:center;`;
document.body.appendChild(tagHUD);

// Tag accept overlay
const tagAskOverlay=document.createElement('div');
tagAskOverlay.style.cssText=`position:fixed;inset:0;background:rgba(0,0,0,0.8);
  display:none;align-items:center;justify-content:center;z-index:400;`;
tagAskOverlay.innerHTML=`
  <div style="background:rgba(20,20,30,0.98);border:2px solid #FF4444;border-radius:20px;
    padding:28px;text-align:center;color:white;font-family:sans-serif;max-width:320px;">
    <div style="font-size:2.5rem;margin-bottom:8px;">🏃</div>
    <h2 id="tagAskTitle" style="margin:0 0 12px;">Tag Challenge!</h2>
    <p id="tagAskMsg" style="opacity:0.7;margin-bottom:20px;font-size:0.9rem;"></p>
    <div style="display:flex;gap:12px;justify-content:center;">
      <button id="tagAccept" style="background:#CC3333;color:white;border:none;border-radius:10px;
        padding:11px 24px;font-size:15px;font-weight:bold;cursor:pointer;">Accept!</button>
      <button id="tagDecline" style="background:rgba(255,255,255,0.1);color:white;
        border:1px solid rgba(255,255,255,0.2);border-radius:10px;padding:11px 24px;
        font-size:15px;cursor:pointer;">Decline</button>
    </div>
  </div>`;
document.body.appendChild(tagAskOverlay);
let tagChallengeFrom=null;
setTimeout(()=>{
  document.getElementById('tagAccept')?.addEventListener('click',()=>{
    tagAskOverlay.style.display='none';
    if(tagChallengeFrom&&socket) socket.emit('tag:accept',{fromId:tagChallengeFrom});
  });
  document.getElementById('tagDecline')?.addEventListener('click',()=>{
    tagAskOverlay.style.display='none'; tagChallengeFrom=null;
  });
},200);

function startTagGame(itSocketId){
  tagGame.active=true; tagGame.itId=itSocketId; tagGame.timer=30;
  if(tagGame.myTimer) clearInterval(tagGame.myTimer);
  tagGame.myTimer=setInterval(()=>{
    tagGame.timer--;
    updateTagHUD();
    if(tagGame.timer<=0){
      endTagGame(tagGame.itId===mySocketId?'lose':'win');
    }
  },1000);
  updateTagHUD();
  showNotification(itSocketId===mySocketId?'🏃 YOU ARE IT! Tag someone!':'🏃 Tag game started!');
}
function updateTagHUD(){
  if(!tagGame.active){tagHUD.style.display='none';return;}
  tagHUD.style.display='block';
  tagHUD.innerHTML=tagGame.itId===mySocketId
    ?`🏃 YOU'RE IT! Tag someone!<br><span style="font-size:1.2rem;">${tagGame.timer}s</span>`
    :`😅 Run! You'll be IT if tagged!<br><span style="font-size:1.2rem;">${tagGame.timer}s</span>`;
  tagHUD.style.background=tagGame.itId===mySocketId?'rgba(200,0,0,0.85)':'rgba(0,100,200,0.85)';
}
function endTagGame(result){
  if(tagGame.myTimer) clearInterval(tagGame.myTimer);
  tagGame.active=false; tagGame.itId=null;
  tagHUD.style.display='none';
  const msg=result==='win'?'🏆 You survived! Winner!':'😵 Time\'s up! You\'re the loser!';
  showNotification(msg);
  // Big flash
  const flash=document.createElement('div');
  flash.style.cssText=`position:fixed;inset:0;background:${result==='win'?'rgba(0,200,0,0.3)':'rgba(200,0,0,0.3)'};
    pointer-events:none;z-index:500;transition:opacity 1s;`;
  document.body.appendChild(flash);
  setTimeout(()=>{flash.style.opacity='0';},100);
  setTimeout(()=>flash.remove(),1200);
}

// Socket events for tag + DM
function setupSocialSocketEvents(){
  if(!socket) return;

  // Friend requests
  socket.on('friend:request',(data)=>{
    const p=otherPlayers[data.fromId];
    const username=p?.data.username||data.fromUsername||'Someone';
    // Show accept/decline toast
    const req=document.createElement('div');
    req.style.cssText=`position:fixed;top:70px;left:50%;transform:translateX(-50%);
      background:rgba(0,20,40,0.95);color:white;font-family:sans-serif;
      border:1px solid rgba(100,200,255,0.3);border-radius:14px;
      padding:14px 18px;z-index:500;text-align:center;min-width:260px;`;
    req.innerHTML=`<div style="margin-bottom:10px;font-size:0.9rem;">👋 <strong>${username}</strong> wants to be friends!</div>
      <div style="display:flex;gap:8px;justify-content:center;">
        <button style="background:#2266CC;color:white;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:13px;">Accept</button>
        <button style="background:rgba(255,255,255,0.1);color:white;border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:8px 16px;cursor:pointer;font-size:13px;">Decline</button>
        <button style="background:rgba(200,50,0,0.4);color:white;border:1px solid rgba(255,100,50,0.3);border-radius:8px;padding:8px 16px;cursor:pointer;font-size:13px;">Ignore</button>
      </div>`;
    document.body.appendChild(req);
    const [acceptBtn,declineBtn,ignoreBtn]=req.querySelectorAll('button');
    acceptBtn.addEventListener('click',()=>{
      socket.emit('friend:accept',{toId:data.fromId});
      friends.push({username,addedAt:Date.now()}); saveFriends();
      showNotification(`👋 Now friends with ${username}!`);
      req.remove();
    });
    declineBtn.addEventListener('click',()=>req.remove());
    ignoreBtn.addEventListener('click',()=>{
      if(!window.ignoredPlayers) window.ignoredPlayers=new Set();
      window.ignoredPlayers.add(data.fromId);
      showNotification(`🚫 ${username} ignored`); req.remove();
    });
    setTimeout(()=>req.remove(),15000);
  });

  socket.on('friend:accept',(data)=>{
    const p=otherPlayers[data.fromId];
    const username=p?.data.username||'Someone';
    friends.push({username,addedAt:Date.now()}); saveFriends();
    showNotification(`✅ ${username} accepted your friend request!`);
  });

  // DM received
  socket.on('player:dm',(data)=>{
    if(window.ignoredPlayers?.has(data.fromSocketId)) return;
    if(!dmInbox[data.fromSocketId]) dmInbox[data.fromSocketId]=[];
    dmInbox[data.fromSocketId].push({from:data.fromUsername, to:myUsername, msg:data.msg, time:Date.now()});
    // If DM window is already open with this person, refresh it live
    if(dmOverlay.style.display==='block' && dmTarget===data.fromUsername){
      window.openDM(data.fromUsername);
      return; // no toast needed, they can see it
    }
    // Otherwise show toast
    const toast=document.createElement('div');
    toast.style.cssText=`position:fixed;top:70px;left:50%;transform:translateX(-50%);
      background:rgba(0,20,40,0.95);color:white;font-family:sans-serif;
      border:1px solid rgba(255,122,69,0.4);border-radius:14px;
      padding:12px 18px;z-index:500;cursor:pointer;min-width:240px;text-align:center;`;
    toast.innerHTML=`<div style="font-size:0.8rem;opacity:0.6;margin-bottom:4px;">💬 Message from ${data.fromUsername}</div>
      <div style="font-size:0.92rem;">${data.msg}</div>
      <div style="font-size:0.75rem;opacity:0.4;margin-top:6px;">Tap to reply</div>`;
    toast.addEventListener('click',()=>{ window.openDM(data.fromUsername); toast.remove(); });
    document.body.appendChild(toast);
    setTimeout(()=>toast.remove(),8000);
    friendsBtn.style.animation='friendsFlash 1s ease-in-out infinite'; friendsBtn.title='New message!';
  });

  // Tag game
  socket.on('tag:challenge',(data)=>{
    tagChallengeFrom=data.fromId;
    const p=otherPlayers[data.fromId];
    if(window.ignoredPlayers?.has(data.fromId)) return;
    document.getElementById('tagAskTitle').textContent=`${p?.data.username||'Someone'} challenges you!`;
    document.getElementById('tagAskMsg').textContent='30 second tag game. You start as IT if you accept!';
    tagAskOverlay.style.display='flex';
  });
  socket.on('tag:start',(data)=>{ startTagGame(data.itId); });
  socket.on('tag:tagged',(data)=>{
    tagGame.itId=data.newItId; updateTagHUD();
    showNotification(data.newItId===mySocketId?'🏃 You got tagged! YOU\'RE IT!':'✅ Tagged! Run!');
  });
}

// Hook into connectMultiplayer to set up social events after connect
const _origConnected=()=>{};
// Called when socket connects — patch into existing connect handler
setTimeout(()=>{
  if(socket) setupSocialSocketEvents();
  // Poll until socket ready
  const _poll=setInterval(()=>{
    if(socket&&mySocketId){setupSocialSocketEvents();clearInterval(_poll);}
  },500);
},1000);
const tHint=document.createElement('div');
tHint.style.cssText=`position:fixed;bottom:24px;right:160px;opacity:0;font-family:sans-serif;
  font-size:11px;color:white;pointer-events:none;z-index:99;
  transition:opacity 0.5s;`;
tHint.textContent='T = chat';
document.body.appendChild(tHint);
// Only show on PC (no coarse pointer = mouse)
if(!window.matchMedia('(pointer:coarse)').matches){
  // Show once connected
  const _showTHint=setInterval(()=>{
    if(socket&&mySocketId){ tHint.style.opacity='0.45'; clearInterval(_showTHint); }
  },500);
}

// ─── MULTIPLAYER GOLF ─────────────────────────────────────
let mpGolf = {
  active: false,
  matchData: null,
  myTurn: false,
  spectating: false,
  spectatorBallPos: null,
  spectatorAngle: 0,
  holeIndex: 0,
  holeData: null,
  activePlayerId: null,
};

// Scoreboard overlay
const mpGolfScoreboard = document.createElement('div');
mpGolfScoreboard.style.cssText=`position:fixed;top:70px;right:12px;background:rgba(0,20,0,0.92);
  color:white;font-family:sans-serif;border:1px solid rgba(100,255,100,0.25);
  border-radius:14px;padding:14px 18px;display:none;z-index:200;min-width:230px;
  backdrop-filter:blur(10px);font-size:14px;`;
document.body.appendChild(mpGolfScoreboard);

// Golf challenge overlay
const golfChallengeOverlay = document.createElement('div');
golfChallengeOverlay.style.cssText=`position:fixed;inset:0;background:rgba(0,0,0,0.8);
  display:none;align-items:center;justify-content:center;z-index:400;`;
golfChallengeOverlay.innerHTML=`
  <div style="background:rgba(10,30,10,0.98);border:2px solid #44FF44;border-radius:20px;
    padding:28px;text-align:center;color:white;font-family:sans-serif;max-width:320px;">
    <div style="font-size:2.5rem;margin-bottom:8px;">⛳</div>
    <h2 id="golfChallengeTitle" style="margin:0 0 12px;">Golf Challenge!</h2>
    <p id="golfChallengeMsg" style="opacity:0.7;margin-bottom:20px;font-size:0.9rem;"></p>
    <div style="display:flex;gap:12px;justify-content:center;">
      <button id="golfAcceptBtn" style="background:#226622;color:white;border:1px solid #44FF44;
        border-radius:10px;padding:11px 24px;font-size:15px;font-weight:bold;cursor:pointer;">Accept!</button>
      <button id="golfDeclineBtn" style="background:rgba(255,255,255,0.1);color:white;
        border:1px solid rgba(255,255,255,0.2);border-radius:10px;padding:11px 24px;font-size:15px;cursor:pointer;">Decline</button>
    </div>
  </div>`;
document.body.appendChild(golfChallengeOverlay);
let golfChallengeFrom=null;
setTimeout(()=>{
  document.getElementById('golfAcceptBtn')?.addEventListener('click',()=>{
    golfChallengeOverlay.style.display='none';
    if(golfChallengeFrom&&socket) socket.emit('golf:accept',{fromId:golfChallengeFrom});
  });
  document.getElementById('golfDeclineBtn')?.addEventListener('click',()=>{
    golfChallengeOverlay.style.display='none'; golfChallengeFrom=null;
  });
},200);

// Match end overlay
window.closeMpGolfEnd=()=>{
  golfMatchEndOverlay.style.display='none';
  inRoom=false; mpGolf.active=false;
  safeSetVolume(0.35);
  camera.position.set(0, GROUND_Y, 8); // back to spawn
};

const golfMatchEndOverlay = document.createElement('div');
golfMatchEndOverlay.style.cssText=`position:fixed;inset:0;background:rgba(0,20,0,0.94);
  color:white;display:none;align-items:center;justify-content:center;flex-direction:column;
  z-index:500;font-family:sans-serif;`;
document.body.appendChild(golfMatchEndOverlay);

function updateMpScoreboard(){
  if(!mpGolf.active||!mpGolf.matchData) return;
  const m=mpGolf.matchData;
  const hole=mpGolf.holeIndex;
  const PARS=[2,3,2,3,2,4];
  mpGolfScoreboard.innerHTML=`
    <div style="font-weight:bold;margin-bottom:8px;color:#44FF44;">⛳ Hole ${hole+1}/6</div>
    <table style="border-collapse:collapse;width:100%;">
      <tr style="opacity:0.5;font-size:0.75rem;">
        <td style="padding:2px 6px;">Player</td>
        ${PARS.map((_,i)=>`<td style="text-align:center;padding:2px 4px;">${i+1}</td>`).join('')}
        <td style="text-align:center;padding:2px 6px;">Tot</td>
      </tr>
      ${m.players.map(p=>`
        <tr style="${p.socketId===mySocketId?'color:#FFD700':''}">
          <td style="padding:3px 6px;font-size:0.82rem;">${p.username}${p.socketId===mpGolf.activePlayerId?'⛳':''}</td>
          ${p.strokes.map((s,i)=>`<td style="text-align:center;padding:3px 4px;font-size:0.82rem;
            color:${s>0?(s<=PARS[i]?'#44FF88':'#FF8844'):'rgba(255,255,255,0.3)'}">${s||'·'}</td>`).join('')}
          <td style="text-align:center;padding:3px 6px;font-weight:bold;">${p.strokes.reduce((a,b)=>a+b,0)||0}</td>
        </tr>`).join('')}
    </table>
    <div style="margin-top:8px;opacity:0.5;font-size:0.75rem;text-align:center;border-top:1px solid rgba(255,255,255,0.1);padding-top:6px;">
      ${mpGolf.myTurn?'🏌️ YOUR TURN!':'👀 Spectating...'}
    </div>
    <div style="margin-top:5px;opacity:0.35;font-size:0.7rem;text-align:center;">
      ${window.matchMedia('(pointer:coarse)').matches?'Tap &amp; hold right to shoot · ◀▶ aim':'Hold Space, release to shoot · ◀▶ aim'}
    </div>
  `;
  mpGolfScoreboard.style.display='block';
}

function startMpGolfMatch(matchData, holeIdx, holeData, activeId){
  mpGolf.active=true;
  mpGolf.matchData=matchData;
  mpGolf.holeIndex=holeIdx;
  mpGolf.holeData=holeData;
  mpGolf.activePlayerId=activeId;
  mpGolf.myTurn=(activeId===mySocketId);
  mpGolf.spectating=!mpGolf.myTurn;
  mpGolf.spectatorBallPos=null;
  // Teleport to hole tee
  camera.position.set(holeData.tee.x, GROUND_Y, holeData.tee.z+3);
  if(mpGolf.myTurn){
    // Enter golf mode
    golfTotalStrokes=[0,0,0,0,0,0];
    enterGolf(holeIdx);
  }
  updateMpScoreboard();
  showNotification(mpGolf.myTurn?'🏌️ YOUR TURN! Tee off!':'👀 Spectating — watch your opponent!');
}

function mpGolfStrokeComplete(strokes){
  if(!mpGolf.active||!socket) return;
  // Tell server about the stroke and ball final position
  socket.emit('golf:stroke',{ballX:ballPos.x, ballZ:ballPos.z});
}

// Spectator cam — orbits the active ball
let spectatorCamAngle=0;
function updateSpectatorCam(delta, totalTime){
  if(!mpGolf.active||mpGolf.myTurn||!mpGolf.spectatorBallPos) return;
  spectatorCamAngle+=delta*0.5;
  const bx=mpGolf.spectatorBallPos.x, bz=mpGolf.spectatorBallPos.z;
  camera.position.set(bx+Math.sin(spectatorCamAngle)*8, bz+4.5, bz+Math.cos(spectatorCamAngle)*8);
  // Actually keep z correct
  camera.position.set(bx+Math.sin(spectatorCamAngle)*8, 4.5, bz+Math.cos(spectatorCamAngle)*8);
  const look=new THREE.Vector3(bx,0.5,bz).sub(camera.position).normalize();
  yaw=Math.atan2(look.x,look.z);
  pitch=Math.asin(Math.max(-0.9,Math.min(0.9,look.y)));
  camera.rotation.order='YXZ';
  camera.rotation.y=yaw; camera.rotation.x=pitch;
}

// Setup socket events for mp golf
function setupGolfSocketEvents(){
  if(!socket) return;

  socket.on('golf:challenge',(data)=>{
    if(window.ignoredPlayers?.has(data.fromId)) return;
    golfChallengeFrom=data.fromId;
    document.getElementById('golfChallengeTitle').textContent=`${data.fromUsername} challenges you!`;
    document.getElementById('golfChallengeMsg').textContent='6-hole match, proper rules. Loser has to watch the cow spin.';
    golfChallengeOverlay.style.display='flex';
  });

  socket.on('golf:matchStart',(data)=>{
    golfChallengeOverlay.style.display='none';
    startMpGolfMatch(data.match, data.hole, data.holeData, data.activeId);
  });

  socket.on('golf:turnChange',(data)=>{
    mpGolf.activePlayerId=data.activeId;
    mpGolf.myTurn=(data.activeId===mySocketId);
    if(mpGolf.matchData) mpGolf.matchData=data.match;

    // Update ball positions from server scores
    if(data.scores){
      const myScore=data.scores.find(s=>s.username===myUsername);
      if(myScore&&myScore.ballX!==undefined){
        // Restore my ball to server-known position
        ballPos.set(myScore.ballX, myScore.ballZ);
        if(typeof golfBallMesh!=='undefined') golfBallMesh.position.set(myScore.ballX,0.13,myScore.ballZ);
      }
    }

    if(mpGolf.myTurn){
      showNotification('⛳ YOUR TURN! Ball is where you left it.');
      // Find my saved ball position from server scores
      const myScore=data.scores?.find(s=>s.username===myUsername);
      const bx = myScore?.ballX ?? golfHoles[mpGolf.holeIndex]?.tee.x;
      const bz = myScore?.ballZ ?? golfHoles[mpGolf.holeIndex]?.tee.z;
      if(!golfMode) enterGolf(mpGolf.holeIndex, bx, bz);
      else { ballPos.set(bx,0.13,bz); golfBallMesh.position.copy(ballPos); }
    } else {
      showNotification(`👀 Opponent's turn — roam freely!`);
      if(golfMode) exitGolf();
    }
    updateMpScoreboard();
  });

  socket.on('golf:youHoled',(data)=>{
    // Play cup sound immediately
    playCupSound();
    const PARS=[2,3,2,3,2,4];
    const par=PARS[data.hole]||2;
    // Exit golf FIRST so the scoreFlash isn't cleared by it
    if(golfMode) exitGolf();
    clearMpBallMarkers();
    mpGolf.myTurn=false;
    // Now show the flash AFTER exitGolf cleared it
    setTimeout(()=>{
      showScoreFlash(data.hole+1, data.strokes, par);
    },50);
    // Show translucent waiting banner
    document.getElementById('holeEndOverlay')?.remove();
    const diff=data.strokes-par;
    const label=diff<=-2?'Eagle! 🦅':diff===-1?'Birdie! 🐦':diff===0?'Par! 👍':diff===1?'Bogey 😬':'Double Bogey 😅';
    const waitDiv=document.createElement('div');
    waitDiv.id='holeEndOverlay';
    waitDiv.style.cssText='position:fixed;top:0;left:0;right:0;background:rgba(0,30,0,0.82);color:white;font-family:sans-serif;padding:14px 20px;text-align:center;z-index:450;pointer-events:none;';
    waitDiv.innerHTML=`<span style="font-size:1.2rem;font-weight:bold;">${label} — ${data.strokes} stroke${data.strokes!==1?'s':''}!</span>
      <span style="opacity:0.6;font-size:0.85rem;margin-left:12px;">Waiting for opponent to finish...</span>`;
    document.body.appendChild(waitDiv);
  });

  socket.on('golf:holeEnd',(data)=>{
    // Remove waiting banner, show ready screen
    document.getElementById('holeEndOverlay')?.remove();
    if(golfMode) exitGolf();
    clearMpBallMarkers();
    mpGolf.myTurn=false;
    const scores=data.scores.map(s=>s.username+': '+s.strokes).join(' | ');
    const holeEndDiv=document.createElement('div');
    holeEndDiv.id='holeEndOverlay';
    holeEndDiv.style.cssText='position:fixed;inset:0;background:rgba(0,20,0,0.93);color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;flex-direction:column;z-index:450;text-align:center;';
    holeEndDiv.innerHTML=`
      <div style="font-size:2rem;margin-bottom:8px;">⛳</div>
      <h2 style="margin:0 0 8px;">Hole ${data.hole+1} Complete!</h2>
      <p style="opacity:0.7;margin-bottom:20px;">${scores}</p>
      <button id="readyNextBtn" style="background:#226622;color:white;border:1px solid #44FF44;border-radius:10px;padding:12px 28px;font-size:15px;font-weight:bold;cursor:pointer;">
        Ready for Hole ${data.hole+2<=6?data.hole+2:'Final Results'}! ➡️
      </button>
      <div id="readyStatus" style="margin-top:12px;opacity:0.5;font-size:0.85rem;">Waiting for both players...</div>
      <button onclick="document.getElementById('holeEndOverlay')?.remove()" style="margin-top:16px;background:transparent;color:rgba(255,255,255,0.3);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:6px 16px;cursor:pointer;font-size:12px;">✕ Dismiss</button>
    `;
    document.body.appendChild(holeEndDiv);
    document.getElementById('readyNextBtn')?.addEventListener('click',()=>{
      document.getElementById('readyNextBtn').disabled=true;
      document.getElementById('readyNextBtn').style.opacity='0.5';
      document.getElementById('readyStatus').textContent="You're ready! Waiting for opponent...";
      if(socket) socket.emit('golf:readyNext');
    });
  });

  socket.on('golf:waitingReady',(data)=>{
    const status=document.getElementById('readyStatus');
    if(status) status.textContent=`${data.ready}/${data.total} players ready...`;
  });

  socket.on('golf:nextHole',(data)=>{
    // Remove hole end overlay
    document.getElementById('holeEndOverlay')?.remove();
    mpGolf.holeIndex=data.hole;
    mpGolf.matchData=data.match;
    mpGolf.activePlayerId=data.activeId;
    mpGolf.myTurn=(data.activeId===mySocketId);
    // Teleport to new tee
    const h=data.holeData||GOLF_HOLES[data.hole];
    camera.position.set(h.tee.x, GROUND_Y, h.tee.z+3);
    // Reset ball to tee
    if(typeof ballPos!=='undefined'){ ballPos.set(h.tee.x, h.tee.z); }
    if(typeof golfBallMesh!=='undefined') golfBallMesh.position.set(h.tee.x,0.13,h.tee.z);
    showNotification(`⛳ Hole ${data.hole+1} — ${mpGolf.myTurn?'YOU tee off!':'Opponent tees off!'}`);
    updateMpScoreboard();
    if(mpGolf.myTurn) enterGolf(data.hole);
  });

  socket.on('golf:matchEnd',(data)=>{
    mpGolf.active=false; mpGolfScoreboard.style.display='none';
    if(golfMode) exitGolf();
    clearMpBallMarkers();
    const winner=data.results[0];
    const isWinner=winner.username===myUsername;
    const PARS=[2,3,2,3,2,4]; const totalPar=PARS.reduce((a,b)=>a+b,0);
    golfMatchEndOverlay.innerHTML=`
      <div style="max-width:500px;padding:32px 24px;text-align:center;">
        <div style="font-size:3rem;margin-bottom:8px;">${isWinner?'🏆':'😅'}</div>
        <h2 style="margin:0 0 4px;">${isWinner?'You Win!':'You Lost!'}</h2>
        <p style="opacity:0.5;margin-bottom:20px;">Match Complete</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:20px;">
          <tr style="opacity:0.5;"><td style="padding:5px 10px;">Player</td>
            ${PARS.map((_,i)=>`<td style="text-align:center;padding:5px 6px;">${i+1}</td>`).join('')}
            <td style="text-align:center;padding:5px 10px;">Total</td></tr>
          ${data.results.map((r,ri)=>`
            <tr style="${ri===0?'color:#FFD700':''}">
              <td style="padding:5px 10px;">${r.username}${ri===0?' 🏆':''}</td>
              ${r.strokes.map((s,i)=>`<td style="text-align:center;padding:5px 6px;
                color:${s<=PARS[i]?'#44FF88':'#FF8844'}">${s}</td>`).join('')}
              <td style="text-align:center;padding:5px 10px;font-weight:bold;">${r.total} (${r.total-totalPar>=0?'+':''}${r.total-totalPar})</td>
            </tr>`).join('')}
        </table>
        <button onclick="window.closeMpGolfEnd()"
          style="background:#226622;color:white;border:1px solid #44FF44;border-radius:10px;
          padding:11px 28px;font-size:15px;cursor:pointer;">Back to Campus</button>
      </div>`;
    golfMatchEndOverlay.style.display='flex';
    inRoom=true;
  });

  socket.on('golf:opponentForfeit',(data)=>{
    showNotification(`${data.username} forfeited. You win by default 🏆`);
    mpGolf.active=false; mpGolfScoreboard.style.display='none';
    if(golfMode) exitGolf();
  });
}

// Hook ball stopped check to notify server in mp match
// Called from inside the update() golf ball-stopped section
function mpGolfBallStopped(){
  if(!mpGolf.active||!mpGolf.myTurn||!socket) return;
  socket.emit('golf:stroke',{ballX:ballPos.x, ballZ:ballPos.z});
  // Send ball pos update
  socket.emit('golf:ballPos',{x:ballPos.x, z:ballPos.z});
}

// Broadcast ball position live while in motion for spectator cam
function mpGolfBroadcastBallPos(){
  if(!mpGolf.active||!mpGolf.myTurn||!socket) return;
  socket.emit('golf:ballPos',{x:ballPos.x, z:ballPos.z});
}

// Add to setupSocialSocketEvents poll
const _golfSocketPoll=setInterval(()=>{
  if(socket&&mySocketId){setupGolfSocketEvents();clearInterval(_golfSocketPoll);}
},500);

const CSHOP_X=50, CSHOP_Z=-22;
const SHOP_X=12, SHOP_Z=-41;
// ─── COSMETIC SHOP ────────────────────────────────────────

// Shop building
box(10,5,8, 0xDDCCFF, CSHOP_X,2.5,CSHOP_Z, false);
box(10,0.3,8, 0xAA88CC, CSHOP_X,5.15,CSHOP_Z, false);
box(11,0.5,9, 0x9977BB, CSHOP_X,5.3,CSHOP_Z, false);
box(0.2,1.2,8, 0x221133, CSHOP_X-4.1,5.8,CSHOP_Z, false);
box(0.25,0.8,7.6, 0x6644AA, CSHOP_X-4.2,5.8,CSHOP_Z, false);
[[-2.5,4],[2.5,4]].forEach(([wz,wy])=>{
  box(0.15,1.8,1.8, 0xFFDDFF, CSHOP_X-4.05,wy,CSHOP_Z+wz, false);
  box(0.1,2.0,2.0, 0x553388, CSHOP_X-4.1,wy,CSHOP_Z+wz, false);
});
box(0.15,2.8,1.8, 0x553388, CSHOP_X-4.05,1.9,CSHOP_Z, false);
// Mannequin in window
const mannequin=new THREE.Group();
const mBody=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.7,0.25),new THREE.MeshLambertMaterial({color:0xDDCCEE}));
mBody.position.y=1.0; mannequin.add(mBody);
const mHead=new THREE.Mesh(new THREE.SphereGeometry(0.2,8,6),new THREE.MeshLambertMaterial({color:0xDDCCEE}));
mHead.position.set(0,1.55,0); mannequin.add(mHead);
// Crown on mannequin
const mCrown=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.2,0.22,5),new THREE.MeshBasicMaterial({color:0xFFD700}));
mCrown.position.set(0,1.8,0); mannequin.add(mCrown);
mannequin.position.set(CSHOP_X-5.5,0,CSHOP_Z);
scene.add(mannequin);
addCollider(CSHOP_X,CSHOP_Z,10,8);
addRoof(CSHOP_X,CSHOP_Z,10,8,5.3);

// Connecting path between shops
box(10,0.1,3, 0xCCBBAA, (SHOP_X+CSHOP_X)/2,0.06,SHOP_Z, false);

let nearCosmeticShop=false;

// Cosmetic item definitions
const COSMETICS=[
  {id:'stetson',    name:'Stetson Hat',      emoji:'🤠', price:500,      type:'hat',   desc:'Classic cowboy style'},
  {id:'tophat',     name:'Silk Top Hat',     emoji:'🎩', price:2000,     type:'hat',   desc:'Dapper and distinguished'},
  {id:'crown',      name:'Gold Crown',       emoji:'👑', price:8000,     type:'hat',   desc:'For royalty only'},
  {id:'viking',     name:'Viking Helm',      emoji:'⛏️', price:20000,    type:'hat',   desc:'Raid in style'},
  {id:'halo',       name:'Halo',             emoji:'😇', price:50000,    type:'hat',   desc:'Angelic presence'},
  {id:'spacehelm',  name:'Space Helmet',     emoji:'👨‍🚀', price:100000,   type:'hat',   desc:'One small step...'},
  {id:'devilhorns', name:'Devil Horns',      emoji:'😈', price:200000,   type:'hat',   desc:'Pure evil vibes'},
  {id:'rainbowcape',name:'Rainbow Cape',     emoji:'🌈', price:400000,   type:'cape',  desc:'Trails rainbow light'},
  {id:'dragonwings',name:'Dragon Wings',     emoji:'🐉', price:700000,   type:'back',  desc:'Majestic wingspan'},
  {id:'nimbus',     name:'Flying Nimbus',    emoji:'☁️', price:1000000,  type:'mount', desc:'A cloud obeys you alone'},
];

// Nimbus cloud (3D)
const nimbusGroup=new THREE.Group();
const nimbusCore=new THREE.Mesh(new THREE.SphereGeometry(0.7,10,8),new THREE.MeshLambertMaterial({color:0xFFFFFF,transparent:true,opacity:0.9}));
nimbusGroup.add(nimbusCore);
[[0.55,0.25,0],[-0.55,0.25,0],[0,0.3,0.45],[0,0.3,-0.45],[0.4,0.35,0.3],[-0.4,0.35,0.3]].forEach(([px,py,pz])=>{
  const puff=new THREE.Mesh(new THREE.SphereGeometry(0.35+Math.random()*0.15,8,6),new THREE.MeshLambertMaterial({color:0xFFFFFF,transparent:true,opacity:0.85}));
  puff.position.set(px,py,pz); nimbusGroup.add(puff);
});
nimbusGroup.visible=false;
scene.add(nimbusGroup);

let myCosmetics=[]; // owned item ids
let activeCosmetics={}; // slot->id
let nimbusActive=false;
let nimbusTime=0;

function updateNimbus(delta,totalTime){
  if(!nimbusActive){ nimbusGroup.visible=false; return; }
  nimbusGroup.visible=true;
  nimbusTime+=delta;
  // Float under player feet
  nimbusGroup.position.set(camera.position.x, camera.position.y-1.9+Math.sin(nimbusTime*1.2)*0.12, camera.position.z);
  nimbusGroup.rotation.y+=delta*0.3;
  // Drift player slightly upward when moving
  if(isGrounded&&velocityY<=0){
    camera.position.y+=0.02; // gentle hover
  }
}

function openCosmeticShop(){
  if(!socket||!mySocketId){ showNotification('Connect to shop!'); return; }
  inRoom=true;
  if(document.pointerLockElement) document.exitPointerLock();
  renderCosmeticShopUI();
}
function closeCosmeticShop(){ document.getElementById('cosmeticShopOverlay')?.remove(); inRoom=false; relockPointer(); }
window.closeCosmeticShop=closeCosmeticShop;

function renderCosmeticShopUI(){
  document.getElementById('cosmeticShopOverlay')?.remove();
  const overlay=document.createElement('div');
  overlay.id='cosmeticShopOverlay';
  overlay.style.cssText=`position:fixed;inset:0;background:rgba(10,0,20,0.96);color:white;
    font-family:'Segoe UI',sans-serif;display:flex;align-items:flex-start;justify-content:center;
    z-index:300;overflow-y:auto;`;
  const chips=window.myChips||0;
  overlay.innerHTML=`
    <div style="max-width:520px;width:100%;padding:20px;box-sizing:border-box;">
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:2rem;">✨</div>
        <h2 style="margin:4px 0;color:#CC99FF;">Astropelion Boutique</h2>
        <div style="opacity:0.5;font-size:0.8rem;">Madame Zara, Style Oracle</div>
        <div style="margin-top:8px;color:#FFD700;">Balance: ${chips.toLocaleString()} SB</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
        ${COSMETICS.map(item=>{
          const owned=myCosmetics.includes(item.id);
          const active=Object.values(activeCosmetics).includes(item.id);
          const canAfford=chips>=item.price;
          return `<div style="background:${active?'rgba(200,150,255,0.2)':'rgba(255,255,255,0.05)'};
            border:1px solid ${item.id==='nimbus'?'#FFD700':active?'#CC99FF':'rgba(255,255,255,0.1)'};
            border-radius:12px;padding:12px;text-align:center;">
            <div style="font-size:1.8rem;margin-bottom:4px;">${item.emoji}</div>
            <div style="font-weight:bold;font-size:0.85rem;margin-bottom:2px;">${item.name}</div>
            <div style="opacity:0.5;font-size:0.7rem;margin-bottom:8px;">${item.desc}</div>
            <div style="color:${item.id==='nimbus'?'#FFD700':'#AA88FF'};font-size:0.8rem;margin-bottom:8px;font-weight:bold;">
              ${item.price.toLocaleString()} SB
            </div>
            ${owned
              ? `<button onclick="window.toggleCosmetic('${item.id}')"
                  style="background:${active?'#553388':'rgba(100,60,150,0.5)'};color:white;border:none;
                  border-radius:8px;padding:6px 14px;cursor:pointer;font-size:12px;width:100%;">
                  ${active?'Unequip':'Equip'}</button>`
              : `<button onclick="window.buyCosmetic('${item.id}')"
                  ${canAfford?'':'disabled style="opacity:0.35;cursor:not-allowed;"'}
                  style="background:${item.id==='nimbus'?'#886600':'#442266'};color:white;border:none;
                  border-radius:8px;padding:6px 14px;cursor:pointer;font-size:12px;width:100%;">
                  Buy</button>`
            }
          </div>`;
        }).join('')}
      </div>

      <button onclick="closeCosmeticShop()" style="width:100%;background:rgba(255,255,255,0.08);
        color:white;border:1px solid rgba(255,255,255,0.15);border-radius:10px;
        padding:10px;cursor:pointer;font-size:13px;">Close</button>
    </div>`;
  document.body.appendChild(overlay);
}

window.buyCosmetic=(id)=>{
  const item=COSMETICS.find(c=>c.id===id); if(!item||!socket) return;
  if((window.myChips||0)<item.price){ showNotification('Not enough SpaceBucks!'); return; }
  socket.emit('cosmetic:buy',{id});
};
window.toggleCosmetic=(id)=>{
  if(!socket) return;
  socket.emit('cosmetic:equip',{id});
};

function applyCosmetics(cosmetics){
  activeCosmetics=cosmetics||{};
  nimbusActive=!!(activeCosmetics.mount==='nimbus');
  // Hat cosmetics applied to avatar hat slot visually
  const hatId=activeCosmetics.hat;
  if(hatId){
    const HAT_COLORS={stetson:0xCC8822,tophat:0x111111,crown:0xFFD700,viking:0x888888,halo:0xFFFFFF,spacehelm:0xCCDDFF,devilhorns:0xFF2200};
    // Update local avatar hat via existing system
    if(typeof updateAvatarHat==='function') updateAvatarHat(hatId, HAT_COLORS[hatId]||0xFFFFFF);
  }
}

function setupCosmeticSocketEvents(){
  if(!socket) return;
  socket.on('cosmetic:state',(data)=>{
    myCosmetics=data.owned||[];
    applyCosmetics(data.equipped||{});
    if(data.chips!==undefined){ window.myChips=data.chips; const el=document.getElementById('walletAmount'); if(el) el.textContent=data.chips.toLocaleString(); }
    if(document.getElementById('cosmeticShopOverlay')) renderCosmeticShopUI();
  });
  socket.on('cosmetic:bought',(data)=>{
    myCosmetics=data.owned;
    window.myChips=data.chips;
    const el=document.getElementById('walletAmount'); if(el) el.textContent=data.chips.toLocaleString();
    showNotification('✨ '+data.name+' unlocked!');
    if(document.getElementById('cosmeticShopOverlay')) renderCosmeticShopUI();
  });
}
const _cosmeticPoll=setInterval(()=>{
  if(socket&&mySocketId){ setupCosmeticSocketEvents(); socket.emit('cosmetic:getState'); clearInterval(_cosmeticPoll); }
},900);

// ─── PET SHOP ─────────────────────────────────────────────
// Small shop east of campus near z=-10, x=28

// Shop building
box(10,5,8, 0xEEDDAA, SHOP_X,2.5,SHOP_Z, false);          // main building
box(10,0.3,8, 0xCC9944, SHOP_X,5.15,SHOP_Z, false);        // roof lip
box(11,0.5,9, 0xBB8833, SHOP_X,5.3,SHOP_Z, false);         // roof overhang
// Sign
box(8,1.2,0.2, 0x442200, SHOP_X,5.8,SHOP_Z+4.1, false);
box(7.6,0.8,0.25, 0x884422, SHOP_X,5.8,SHOP_Z+4.2, false);
// Windows
[[-2.5,4],[ 2.5,4]].forEach(([wx,wy])=>{
  box(1.8,1.8,0.15, 0x88CCFF, SHOP_X+wx,wy,SHOP_Z-4.05, false);
  box(2.0,2.0,0.1, 0x664422, SHOP_X+wx,wy,SHOP_Z-4.1, false);
});
// Door
box(1.8,2.8,0.15, 0x884422, SHOP_X,1.9,SHOP_Z-4.05, false);
// Paw print decorations (small boxes)
[[-3,6],[3,6]].forEach(([px])=>{
  box(0.4,0.4,0.1, 0xFF8844, SHOP_X+px,5.8,SHOP_Z-4.15, false);
});
// Vendor NPC inside (visible through door)
const shopVendorGroup=new THREE.Group();
const svBody=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.6,0.35),new THREE.MeshLambertMaterial({color:0x4466AA}));
svBody.position.y=0.85; shopVendorGroup.add(svBody);
const svHead=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.4,0.38),new THREE.MeshLambertMaterial({color:0xFFCC88}));
svHead.position.set(0,1.3,0); shopVendorGroup.add(svHead);
// Hat - vet style
const svHat=new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.25,0.35,8),new THREE.MeshLambertMaterial({color:0xFFFFFF}));
svHat.position.set(0,1.58,0); shopVendorGroup.add(svHat);
const svHatBrim=new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.32,0.06,8),new THREE.MeshLambertMaterial({color:0xFFFFFF}));
svHatBrim.position.set(0,1.38,0); shopVendorGroup.add(svHatBrim);
[-0.12,0.12].forEach(ex=>{
  const eye=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.07,0.05),new THREE.MeshBasicMaterial({color:0x111111}));
  eye.position.set(ex,1.32,0.2); shopVendorGroup.add(eye);
});
shopVendorGroup.position.set(SHOP_X,0,SHOP_Z+5.5);
scene.add(shopVendorGroup);
addCollider(SHOP_X, SHOP_Z, 10, 8);
addRoof(SHOP_X, SHOP_Z, 10, 8, 5.3);

let nearPetShop=false;

// ─── PET SYSTEM ───────────────────────────────────────────
const PET_TYPES={
  turtle: {rarity:'common',  color:0x336622, size:0.35, sayings:['*slow blink*','...','home is where u are','🐢']},
  gopher: {rarity:'common',  color:0xAA7744, size:0.28, sayings:['squeak!','digging time','hi hi hi!','*sniffs*']},
  rat:    {rarity:'common',  color:0x887766, size:0.22, sayings:['cheese?','*whiskers twitch*','sneaky sneaky','eek!']},
  lizard: {rarity:'rare',    color:0x448844, size:0.32, sayings:['*tongue flick*','sun pls','cold blooded & cool','scales > fur']},
  deer:   {rarity:'rare',    color:0xCC9955, size:0.55, sayings:['*ears perk*','gentle hooves','is it safe?','bambi vibes']},
  hippo:  {rarity:'exotic',  color:0x997788, size:0.65, sayings:['HONK','i am large','water pls','hippo time']},
  zebra:  {rarity:'exotic',  color:0xEEEEEE, size:0.6,  sayings:['*clip clop*','am i a horse?','black AND white','stripes go brr']},
  lion:   {rarity:'legendary',color:0xDDAA44,size:0.75, sayings:['ROAR 🦁','king of the lounge','mane event','legendary vibes']},
};
const RARITY_COLORS={common:'#AAAAAA',rare:'#44AAFF',exotic:'#AA44FF',legendary:'#FFD700'};
const RARITY_PETS={
  common:['turtle','gopher','rat'],
  rare:['lizard','deer'],
  exotic:['hippo','zebra'],
  legendary:['lion']
};
const PET_SLOT_BONUS={common:0,rare:0.02,exotic:0.05,legendary:0.10};

// 3D pet meshes following player
const activePetGroup=new THREE.Group();
scene.add(activePetGroup);
activePetGroup.visible=false;

function buildPetMesh(type){
  activePetGroup.clear();
  const pt=PET_TYPES[type]; if(!pt) return;
  const s=pt.size, c=pt.color;
  const mat=new THREE.MeshLambertMaterial({color:c});
  const darkMat=new THREE.MeshLambertMaterial({color:c-0x222222});

  if(type==='turtle'){
    const shell=new THREE.Mesh(new THREE.SphereGeometry(s,8,6),mat); shell.scale.y=0.6; shell.position.y=s*0.5; activePetGroup.add(shell);
    const head=new THREE.Mesh(new THREE.SphereGeometry(s*0.35,6,6),mat); head.position.set(0,s*0.45,s*0.65); activePetGroup.add(head);
    [[s*0.5,0,s*0.2],[-s*0.5,0,s*0.2],[s*0.4,0,-s*0.3],[-s*0.4,0,-s*0.3]].forEach(([lx,ly,lz])=>{
      const leg=new THREE.Mesh(new THREE.CylinderGeometry(s*0.12,s*0.12,s*0.35,5),darkMat); leg.position.set(lx,s*0.1,lz); activePetGroup.add(leg);
    });
  } else if(type==='gopher'||type==='rat'){
    const body=new THREE.Mesh(new THREE.CylinderGeometry(s*0.45,s*0.5,s*0.8,8),mat); body.position.y=s*0.45; activePetGroup.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(s*0.45,8,6),mat); head.position.set(0,s*0.95,s*0.3); activePetGroup.add(head);
    if(type==='rat'){ const tail=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.05,s*1.2,4),darkMat); tail.position.set(0,s*0.3,-s*0.7); tail.rotation.x=0.4; activePetGroup.add(tail); }
    [[s*0.15,s*1.05,s*0.15],[-s*0.15,s*1.05,s*0.15]].forEach(([ex,ey,ez])=>{ const ear=new THREE.Mesh(new THREE.SphereGeometry(s*0.15,5,5),mat); ear.position.set(ex,ey,ez); activePetGroup.add(ear); });
  } else if(type==='lizard'){
    const body=new THREE.Mesh(new THREE.BoxGeometry(s*0.4,s*0.2,s*1.0),mat); body.position.y=s*0.2; activePetGroup.add(body);
    const head=new THREE.Mesh(new THREE.BoxGeometry(s*0.35,s*0.18,s*0.35),mat); head.position.set(0,s*0.22,s*0.65); activePetGroup.add(head);
    const tail=new THREE.Mesh(new THREE.CylinderGeometry(0.02,s*0.1,s*0.9,5),darkMat); tail.rotation.x=0.3; tail.position.set(0,s*0.15,-s*0.7); activePetGroup.add(tail);
    [[s*0.3,s*0.08,s*0.2],[-s*0.3,s*0.08,s*0.2],[s*0.3,s*0.08,-s*0.1],[-s*0.3,s*0.08,-s*0.1]].forEach(([lx,ly,lz])=>{ const leg=new THREE.Mesh(new THREE.BoxGeometry(s*0.35,s*0.1,s*0.1),darkMat); leg.position.set(lx,ly,lz); activePetGroup.add(leg); });
  } else if(type==='deer'){
    const body=new THREE.Mesh(new THREE.BoxGeometry(s*0.45,s*0.5,s*0.8),mat); body.position.y=s*0.7; activePetGroup.add(body);
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(s*0.1,s*0.15,s*0.4,6),mat); neck.position.set(0,s*1.05,s*0.3); activePetGroup.add(neck);
    const head=new THREE.Mesh(new THREE.BoxGeometry(s*0.22,s*0.22,s*0.28),mat); head.position.set(0,s*1.28,s*0.4); activePetGroup.add(head);
    [[s*0.15,s*0,s*0.25],[-s*0.15,s*0,s*0.25],[s*0.15,s*0,-s*0.25],[-s*0.15,s*0,-s*0.25]].forEach(([lx,ly,lz])=>{ const leg=new THREE.Mesh(new THREE.BoxGeometry(s*0.1,s*0.65,s*0.1),darkMat); leg.position.set(lx,s*0.32+ly,lz); activePetGroup.add(leg); });
    [s*0.08,-s*0.08].forEach(ax=>{ const antler=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.03,s*0.35,4),darkMat); antler.position.set(ax,s*1.45,s*0.38); antler.rotation.z=ax>0?0.3:-0.3; activePetGroup.add(antler); });
  } else if(type==='hippo'){
    const body=new THREE.Mesh(new THREE.SphereGeometry(s*0.6,8,6),mat); body.scale.set(1,0.7,1.2); body.position.y=s*0.55; activePetGroup.add(body);
    const head=new THREE.Mesh(new THREE.BoxGeometry(s*0.55,s*0.4,s*0.45),mat); head.position.set(0,s*0.75,s*0.65); activePetGroup.add(head);
    [[s*0.3,0,s*0.3],[-s*0.3,0,s*0.3],[s*0.3,0,-s*0.2],[-s*0.3,0,-s*0.2]].forEach(([lx,ly,lz])=>{ const leg=new THREE.Mesh(new THREE.CylinderGeometry(s*0.15,s*0.18,s*0.4,6),darkMat); leg.position.set(lx,s*0.2+ly,lz); activePetGroup.add(leg); });
    [s*0.12,-s*0.12].forEach(nx=>{ const nostril=new THREE.Mesh(new THREE.SphereGeometry(s*0.07,5,5),darkMat); nostril.position.set(nx,s*0.75,s*0.88); activePetGroup.add(nostril); });
  } else if(type==='zebra'){
    const body=new THREE.Mesh(new THREE.BoxGeometry(s*0.5,s*0.5,s*0.9),mat); body.position.y=s*0.75; activePetGroup.add(body);
    // Stripes
    for(let i=0;i<4;i++){ const stripe=new THREE.Mesh(new THREE.BoxGeometry(s*0.52,s*0.08,s*0.12),new THREE.MeshLambertMaterial({color:0x111111})); stripe.position.set(0,s*0.65+i*s*0.12,s*0.1+i*s*0.05); activePetGroup.add(stripe); }
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(s*0.12,s*0.15,s*0.45,6),mat); neck.position.set(0,s*1.08,s*0.38); activePetGroup.add(neck);
    const head=new THREE.Mesh(new THREE.BoxGeometry(s*0.22,s*0.24,s*0.32),mat); head.position.set(0,s*1.32,s*0.5); activePetGroup.add(head);
    [[s*0.15,0,s*0.3],[-s*0.15,0,s*0.3],[s*0.15,0,-s*0.25],[-s*0.15,0,-s*0.25]].forEach(([lx,ly,lz])=>{ const leg=new THREE.Mesh(new THREE.BoxGeometry(s*0.1,s*0.65,s*0.1),darkMat); leg.position.set(lx,s*0.35,lz); activePetGroup.add(leg); });
  } else if(type==='lion'){
    const body=new THREE.Mesh(new THREE.BoxGeometry(s*0.55,s*0.52,s*0.9),mat); body.position.y=s*0.75; activePetGroup.add(body);
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(s*0.22,s*0.2,s*0.35,8),mat); neck.position.set(0,s*1.1,s*0.35); activePetGroup.add(neck);
    // Mane
    const mane=new THREE.Mesh(new THREE.SphereGeometry(s*0.42,8,8),new THREE.MeshLambertMaterial({color:0xAA6622})); mane.position.set(0,s*1.2,s*0.42); activePetGroup.add(mane);
    const head=new THREE.Mesh(new THREE.SphereGeometry(s*0.32,8,6),mat); head.position.set(0,s*1.22,s*0.5); activePetGroup.add(head);
    [[s*0.15,0,s*0.3],[-s*0.15,0,s*0.3],[s*0.15,0,-s*0.25],[-s*0.15,0,-s*0.25]].forEach(([lx,ly,lz])=>{ const leg=new THREE.Mesh(new THREE.BoxGeometry(s*0.14,s*0.6,s*0.14),darkMat); leg.position.set(lx,s*0.38,lz); activePetGroup.add(leg); });
    const tail=new THREE.Mesh(new THREE.CylinderGeometry(0.03,s*0.06,s*0.7,4),darkMat); tail.rotation.x=0.5; tail.position.set(0,s*0.7,-s*0.65); activePetGroup.add(tail);
    // Nose
    const nose=new THREE.Mesh(new THREE.BoxGeometry(s*0.15,s*0.1,s*0.05),darkMat); nose.position.set(0,s*1.14,s*0.8); activePetGroup.add(nose);
  }
}

// Pet state
let myPet=null;
const pendingVoiceRequests=new Set(); // socket IDs that tried to connect before our mic was ready
let myPetSlots=[];
let myPetDust=0;

window.petReleaseForDust=(petJson)=>{
  try{ const pet=JSON.parse(petJson);
    if(socket) socket.emit('pet:releasePending',{rarity:pet.rarity});
    window._pendingHatchDlg?.remove();
    showNotification('✨ Released for Pet Dust!');
  }catch(e){}
};
window.petSwapSlot=(idx,petJson)=>{
  try{ const newPet=JSON.parse(petJson);
    if(socket) socket.emit('pet:swapPending',{slotIndex:idx,newPet});
    window._pendingHatchDlg?.remove();
  }catch(e){}
};
let petSayTimer=0;

function updatePet(delta,totalTime){
  // Proximity to shop
  const sx=camera.position.x-SHOP_X, sz=camera.position.z-(SHOP_Z+5.5);
  nearPetShop=Math.sqrt(sx*sx+sz*sz)<3;
  

  if(!myPet||!myPet.alive){ activePetGroup.visible=false; return; }
  activePetGroup.visible=true;

  // Follow player with offset
  const targetX=camera.position.x+Math.sin(yaw+2.2)*2.2;
  const targetZ=camera.position.z+Math.cos(yaw+2.2)*2.2;
  activePetGroup.position.x+=(targetX-activePetGroup.position.x)*0.08;
  activePetGroup.position.z+=(targetZ-activePetGroup.position.z)*0.08;
  activePetGroup.position.y=getTerrainY(activePetGroup.position.x,activePetGroup.position.z);
  // Face player
  activePetGroup.rotation.y=Math.atan2(camera.position.x-activePetGroup.position.x, camera.position.z-activePetGroup.position.z);
  // Idle bob
  activePetGroup.position.y+=Math.sin(totalTime*2.5)*0.04;

  // Random sayings
  petSayTimer-=delta;
  if(petSayTimer<0){
    petSayTimer=15+Math.random()*25;
    const pt=PET_TYPES[myPet.type];
    if(pt&&Math.random()>0.5){
      const say=pt.sayings[Math.floor(Math.random()*pt.sayings.length)];
      showNotification(`${myPet.name}: "${say}"`);
    }
  }

  // Hunger warning
  if(myPet.hunger<20&&Math.random()<0.001){
    showNotification(`${myPet.name} is starving! 🍖 Feed them at the Pet Shop!`);
  }
}

// Pet shop overlay
function openPetShop(){
  if(!socket||!mySocketId){ showNotification('Connect to visit the pet shop!'); return; }
  inRoom=true;
  if(document.pointerLockElement) document.exitPointerLock();
  renderPetShopUI();
}
function closePetShop(){ document.getElementById('petShopOverlay')?.remove(); inRoom=false; relockPointer(); }
window.closePetShop=closePetShop;

function renderPetShopUI(){
  document.getElementById('petShopOverlay')?.remove();
  const overlay=document.createElement('div');
  overlay.id='petShopOverlay';
  overlay.style.cssText=`position:fixed;inset:0;background:rgba(0,10,0,0.95);color:white;
    font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;
    flex-direction:column;z-index:300;overflow-y:auto;`;
  const chips=window.myChips||0;
  const pet=myPet;
  const hungerPct=pet?Math.round(pet.hunger):0;
  const hungerColor=hungerPct>50?'#44FF44':hungerPct>20?'#FFAA00':'#FF4444';

  overlay.innerHTML=`
    <div style="max-width:480px;width:100%;padding:20px;box-sizing:border-box;">
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:2rem;">🐾</div>
        <h2 style="margin:4px 0;color:#FFCC66;">Astropelion Pet Shop</h2>
        <div style="opacity:0.5;font-size:0.8rem;">Dr. Patches, Veterinarian & Egg Dealer</div>
        <div style="margin-top:8px;color:#FFD700;">Balance: ${chips.toLocaleString()} SB</div>
      </div>

      ${pet&&pet.alive?`
        <div style="background:rgba(255,255,255,0.06);border-radius:12px;padding:14px;margin-bottom:16px;">
          <div style="font-size:1rem;font-weight:bold;margin-bottom:6px;">
            Your Pet: <span style="color:${RARITY_COLORS[pet.rarity]}">${pet.name}</span>
            <span style="font-size:0.75rem;opacity:0.6;margin-left:6px;">(${pet.rarity} ${pet.type})</span>
          </div>
          <div style="margin-bottom:8px;font-size:0.85rem;">
            Hunger: <span style="color:${hungerColor}">${hungerPct}%</span>
            <div style="background:rgba(0,0,0,0.4);border-radius:4px;height:8px;margin-top:4px;">
              <div style="background:${hungerColor};height:8px;border-radius:4px;width:${hungerPct}%;transition:width 0.3s;"></div>
            </div>
          </div>
          ${hungerPct<100?`<button onclick="window.feedPet()" style="background:#226622;color:white;border:none;
            border-radius:8px;padding:8px 20px;cursor:pointer;font-size:13px;font-weight:bold;">
            🍖 Feed (300 SB)</button>`:'<span style="opacity:0.5;font-size:0.8rem;">Pet is full!</span>'}
          ${pet.bonus>0?`<div style="margin-top:8px;font-size:0.78rem;color:#FFD700;">🎰 Slot bonus: +${Math.round(pet.bonus*100)}%</div>`:''}
        </div>
      `:pet&&!pet.alive?`
        <div style="background:rgba(100,0,0,0.3);border:1px solid #FF4444;border-radius:12px;padding:14px;margin-bottom:16px;text-align:center;">
          <div style="font-size:1.5rem;">💀</div>
          <div>${pet.name} has passed away...</div>
          <div style="opacity:0.5;font-size:0.8rem;">Buy a new egg to try again</div>
        </div>
      `:'<div style="text-align:center;opacity:0.5;margin-bottom:16px;">No active pet</div>'}

      <div style="background:rgba(255,255,255,0.06);border-radius:12px;padding:14px;margin-bottom:14px;">
        <div style="font-weight:bold;margin-bottom:10px;">🥚 Mystery Egg — 800 SB</div>
        <div style="font-size:0.8rem;opacity:0.6;margin-bottom:10px;line-height:1.6;">
          Common 🐢🐭🐿 | Rare 🦎🦌 | Exotic 🦛🦓 | Legendary 🦁<br>
          Every 10 eggs improves legendary odds!
        </div>
        <button onclick="window.buyEgg()" ${chips<800?'disabled style="opacity:0.4;cursor:not-allowed;"':''} 
          style="background:#664400;color:white;border:none;border-radius:8px;
          padding:10px 24px;cursor:pointer;font-size:14px;font-weight:bold;width:100%;">
          Buy Egg (800 SB)
        </button>
      </div>

      <button onclick="closePetShop()" style="width:100%;background:rgba(255,255,255,0.08);color:white;
        border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:10px;cursor:pointer;font-size:13px;">
        Close</button>
    </div>`;
  document.body.appendChild(overlay);
}

window.feedPet=()=>{
  if(!socket) return;
  if((window.myChips||0)<300){ showNotification('Need 300 SB to feed your pet!'); return; }
  socket.emit('pet:feed');
};
window.buyEgg=()=>{
  if(!socket) return;
  if((window.myChips||0)<800){ showNotification('Need 800 SB for an egg!'); return; }
  socket.emit('pet:buyEgg');
};

// Socket events for pets
function setupPetSocketEvents(){
  if(!socket) return;
  socket.on('pet:state',(data)=>{
    myPet=data.pet;
    if(data.slots) myPetSlots=data.slots;
    if(data.dust!==undefined) myPetDust=data.dust;
    if(myPet&&myPet.alive&&myPet.type){
      buildPetMesh(myPet.type);
      activePetGroup.visible=true;
    } else {
      activePetGroup.visible=false;
    }
    if(document.getElementById('petShopOverlay')) renderPetShopUI();
    // Update wallet
    if(data.chips!==undefined){
      window.myChips=data.chips;
      const el=document.getElementById('walletAmount');
      if(el) el.textContent=data.chips.toLocaleString();
    }
  });

  socket.on('pet:hatched',(data)=>{
    myPet=data.pet;
    if(data.slots) myPetSlots=data.slots;
    buildPetMesh(myPet.type);
    activePetGroup.visible=true;
    const ann=document.createElement('div');
    ann.style.cssText=`position:fixed;inset:0;background:rgba(0,0,0,0.9);display:flex;
      align-items:center;justify-content:center;z-index:600;`;
    ann.innerHTML=`<div style="text-align:center;padding:32px;color:white;font-family:sans-serif;">
      <div style="font-size:4rem;margin-bottom:12px;">🥚✨</div>
      <h1 style="color:${RARITY_COLORS[data.pet.rarity]};margin-bottom:8px;">
        ${data.pet.rarity.toUpperCase()} PET!
      </h1>
      <h2 style="margin-bottom:8px;">${data.pet.name}</h2>
      <p style="opacity:0.7;">A ${data.pet.rarity} ${data.pet.type} has joined your adventure!</p>
      ${data.pet.bonus>0?`<p style="color:#FFD700;">Slot bonus: +${Math.round(data.pet.bonus*100)}%</p>`:''}
      <button onclick="this.parentElement.parentElement.remove()" style="margin-top:16px;
        background:${RARITY_COLORS[data.pet.rarity]};color:${data.pet.rarity==='legendary'?'#000':'#fff'};
        border:none;border-radius:10px;padding:12px 28px;cursor:pointer;font-size:15px;font-weight:bold;">
        Meet ${data.pet.name}! 🐾</button>
    </div>`;
    document.body.appendChild(ann);
    setTimeout(()=>ann.remove(),15000);
    if(document.getElementById('petShopOverlay')) renderPetShopUI();
  });

  // Storage full — show choice dialog
  socket.on('pet:hatchedFull',(data)=>{
    const pet=data.pet;
    const dustVal=data.dustValue;
    const dlg=document.createElement('div');
    dlg.style.cssText=`position:fixed;inset:0;background:rgba(0,0,0,0.92);display:flex;
      align-items:center;justify-content:center;z-index:600;`;
    dlg.innerHTML=`<div style="max-width:380px;text-align:center;padding:28px;color:white;font-family:sans-serif;
      background:#111;border:2px solid ${RARITY_COLORS[pet.rarity]};border-radius:16px;">
      <div style="font-size:3rem;margin-bottom:8px;">🥚✨</div>
      <h2 style="color:${RARITY_COLORS[pet.rarity]};margin-bottom:4px;">${pet.rarity.toUpperCase()}!</h2>
      <h3 style="margin-bottom:8px;">${pet.name} the ${pet.type}</h3>
      <p style="opacity:0.6;font-size:0.85rem;margin-bottom:20px;">Your storage is full (3/3).<br>What would you like to do?</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <button onclick="window.petReleaseForDust('${JSON.stringify(pet).replace(/'/g,"\\'")}')" 
          style="background:#553300;color:white;border:none;border-radius:10px;padding:12px;cursor:pointer;">
          ✨ Release for ${dustVal} Pet Dust</button>
        ${myPetSlots.map((s,i)=>s?`<button onclick="window.petSwapSlot(${i},'${JSON.stringify(pet).replace(/'/g,"\\'")}')"
          style="background:#222255;color:white;border:1px solid #4444AA;border-radius:10px;padding:10px;cursor:pointer;font-size:13px;">
          🔄 Replace ${s.name} (${s.rarity} ${s.type})</button>`:''
        ).join('')}
      </div>
    </div>`;
    document.body.appendChild(dlg);
    window._pendingHatchDlg=dlg;
  });

  socket.on('pet:dustUpdate',(data)=>{ myPetDust=data.dust; if(document.getElementById('petShopOverlay')) renderPetShopUI(); });
}

const _petPoll=setInterval(()=>{
  if(socket&&mySocketId){
    setupPetSocketEvents();
    socket.emit('pet:getState');
    clearInterval(_petPoll);
  }
},800);

// ─── LOUNGE HOLD'EM POKER ─────────────────────────────────

// Daily chip bonus
function claimDailyChips(){
  const today=new Date().toDateString();
  const key='aplabs_daily_'+myUsername;
  if(localStorage.getItem(key)!==today){
    localStorage.setItem(key,today);
    if(socket) socket.emit('chips:daily');
    return true;
  }
  return false;
}

// Lounge poker state
const loungePoker={
  active:false, myCards:[], community:[], pot:0, myBet:0,
  currentBet:0, myChips:1000, phase:'waiting', isMyTurn:false,
  myPosition:-1, seats:[], dealerSeat:0, pendingBet:0,
  tableIdx:0
};

// ── LOUNGE POKER UI ──
const loungePokerOverlay=document.createElement('div');
loungePokerOverlay.style.cssText=`position:fixed;inset:0;background:rgba(0,18,0,0.96);
  color:white;font-family:'Segoe UI',sans-serif;display:none;flex-direction:column;
  align-items:center;justify-content:space-between;z-index:300;overflow:hidden;`;
document.body.appendChild(loungePokerOverlay);

// Card renderer
function cardEl(card,big=false,facedown=false){
  const w=big?52:36, h=big?74:52, fs=big?18:12;
  if(facedown||!card) return '<div style="width:'+w+'px;height:'+h+'px;background:linear-gradient(135deg,#1144aa,#0a2255);border-radius:6px;border:1px solid rgba(255,255,255,0.2);display:inline-flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.5);font-size:'+fs+'px;">?</div>';
  const red=card.suit==='♥'||card.suit==='♦';
  return '<div style="width:'+w+'px;height:'+h+'px;background:white;color:'+(red?'#CC1111':'#111')+';border-radius:6px;border:1px solid #ccc;display:inline-flex;align-items:center;justify-content:center;flex-direction:column;font-size:'+fs+'px;font-weight:bold;line-height:1.1;">'+card.rank+'<br>'+card.suit+'</div>';
}

function chipCircle(val,color,count){
  const active=count>0;
  return `<div onclick="window.lp_addChip(${val})" style="width:52px;height:52px;border-radius:50%;
    background:${color};border:3px solid ${active?'white':'rgba(255,255,255,0.3)'};
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    cursor:pointer;user-select:none;position:relative;box-shadow:${active?'0 0 10px white':'none'};
    transition:all 0.15s;">
    <span style="font-size:11px;font-weight:bold;">${val}</span>
    ${count>0?`<span style="position:absolute;top:-8px;right:-8px;background:#FFD700;color:#000;border-radius:50%;width:18px;height:18px;font-size:10px;font-weight:bold;display:flex;align-items:center;justify-content:center;">${count}</span>`:''}
  </div>`;
}

const CHIP_VALS=[5,10,25,100];
const CHIP_COLORS=['#CCCCCC','#3366FF','#22AA22','#CC1111'];
let pendingChipCounts=[0,0,0,0]; // how many of each chip added to current bet

window.lp_addChip=(val)=>{
  const idx=CHIP_VALS.indexOf(val);
  if(idx<0) return;
  const total=pendingChipCounts.reduce((a,c,i)=>a+c*CHIP_VALS[i],0);
  if(total+val > loungePoker.myChips - loungePoker.myBet) return;
  pendingChipCounts[idx]++;
  loungePoker.pendingBet=pendingChipCounts.reduce((a,c,i)=>a+c*CHIP_VALS[i],0);
  renderLoungePoker();
};
window.lp_clearBet=()=>{ pendingChipCounts=[0,0,0,0]; loungePoker.pendingBet=0; renderLoungePoker(); };
window.lp_placeBet=()=>{
  if(loungePoker.pendingBet<=0) return;
  if(socket) socket.emit('lpoker:bet',{amount:loungePoker.pendingBet+loungePoker.currentBet});
  pendingChipCounts=[0,0,0,0]; loungePoker.pendingBet=0;
};
window.lp_check=()=>{ if(socket) socket.emit('lpoker:check'); };
window.lp_call=()=>{ if(socket) socket.emit('lpoker:call'); };
window.lp_fold=()=>{ if(socket) socket.emit('lpoker:fold'); };
window.lp_leave=()=>{
  if(socket) socket.emit('lpoker:leave');
  loungePokerOverlay.style.display='none';
  inRoom=false; safeSetVolume(0.35);
  relockPointer();
};

function renderLoungePoker(){
  const lp=loungePoker;
  const PHASENAMES={waiting:'Waiting for players...',preflop:'Pre-Flop',flop:'Flop',turn:'Turn',river:'River',showdown:'Showdown'};
  const myBetTotal=lp.myBet+(lp.pendingBet||0);
  const toCall=Math.max(0,lp.currentBet-lp.myBet);
  const canCheck=lp.isMyTurn&&toCall===0&&lp.phase!=='waiting'&&lp.phase!=='showdown';
  const canCall=lp.isMyTurn&&toCall>0;
  const canBet=lp.isMyTurn&&lp.phase!=='waiting'&&lp.phase!=='showdown';

  loungePokerOverlay.innerHTML=`
    <div style="width:100%;max-width:660px;padding:12px 16px;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;height:100%;">

      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
        <div>
          <span style="font-size:1.1rem;font-weight:bold;">🎰 Astropelion Lounge</span>
          <span style="margin-left:10px;opacity:0.5;font-size:0.8rem;">${PHASENAMES[lp.phase]||lp.phase}</span>
        </div>
        <div style="display:flex;gap:12px;align-items:center;">
          <span style="color:#FFD700;font-weight:bold;">💰 ${lp.myChips} SB</span>
          <span style="opacity:0.6;font-size:0.8rem;">Pot: ${lp.pot}</span>
          <button onclick="window.lp_leave()" style="background:rgba(200,0,0,0.5);color:white;border:none;border-radius:8px;padding:5px 12px;cursor:pointer;font-size:12px;">Leave</button>
        </div>
      </div>

      <!-- Other players -->
      <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;flex-shrink:0;">
        ${lp.seats.map((s,i)=>s?(`
          <div style="background:${s.isActive?'rgba(255,200,0,0.2)':'rgba(255,255,255,0.06)'};
            border:1px solid ${s.isActive?'#FFD700':'rgba(255,255,255,0.1)'};
            border-radius:10px;padding:6px 10px;text-align:center;min-width:80px;font-size:12px;">
            ${s.isDealer?'🎯 ':''}
            ${s.isSmallBlind?'S ':''}
            ${s.isBigBlind?'B ':''}
            <div style="font-weight:bold;">${s.username}</div>
            <div style="opacity:0.6;">${s.chips} SB</div>
            ${s.bet>0?`<div style="color:#FFD700;font-size:10px;">bet:${s.bet}</div>`:''}
            <div style="display:flex;gap:3px;justify-content:center;margin-top:3px;">
              ${s.socketId===mySocketId?
                (lp.myCards.map(c=>cardEl(c,false)).join(''))
                :(s.folded?'<span style="opacity:0.3;font-size:10px;">folded</span>':
                  (lp.phase==='showdown'&&s.holeCards?s.holeCards.map(c=>cardEl(c,false)).join(''):
                  (s.cardCount>0?cardEl(null,false,true)+cardEl(null,false,true):'')))
              }
            </div>
            ${s.lastAction?`<div style="font-size:10px;color:#aaa;margin-top:2px;">${s.lastAction}</div>`:''}
          </div>`):null
        ).filter(Boolean).join('')}
      </div>

      <!-- Community cards -->
      <div style="text-align:center;flex-shrink:0;">
        <div style="opacity:0.4;font-size:0.75rem;margin-bottom:4px;">Community Cards</div>
        <div style="display:flex;gap:6px;justify-content:center;min-height:58px;align-items:center;">
          ${lp.community.length===0?
            '<span style="opacity:0.2;font-size:0.8rem;">Cards appear here</span>':
            lp.community.map(c=>cardEl(c,true)).join('')}
        </div>
        ${lp.pot>0?`<div style="margin-top:6px;font-size:0.85rem;">🏆 Pot: <strong>${lp.pot}</strong> SpaceBucks</div>`:''}
      </div>

      <!-- My cards -->
      <div style="text-align:center;flex-shrink:0;">
        <div style="opacity:0.4;font-size:0.75rem;margin-bottom:4px;">Your Hand</div>
        <div style="display:flex;gap:8px;justify-content:center;">
          ${lp.myCards.length>0?lp.myCards.map(c=>cardEl(c,true)).join(''):'<span style="opacity:0.2;">Waiting for deal...</span>'}
        </div>
      </div>

      <!-- Action area -->
      <div style="flex-shrink:0;margin-top:auto;">
        ${lp.phase==='waiting'?`
          <div style="text-align:center;padding:16px 0;">
            <div style="opacity:0.6;margin-bottom:8px;">Waiting for players to join... (need 2+)</div>
            <div style="font-size:0.8rem;opacity:0.4;">Blinds: 5 / 10 SpaceBucks</div>
          </div>`:
        lp.phase==='showdown'?'':
        lp.isMyTurn?`
          <!-- Pending bet display -->
          <div style="text-align:center;margin-bottom:8px;font-size:0.85rem;">
            ${lp.pendingBet>0?`<span style="color:#FFD700;">Adding: ${lp.pendingBet} SB → Total bet: ${myBetTotal}</span>
              <button onclick="window.lp_clearBet()" style="margin-left:8px;background:rgba(255,255,255,0.1);color:white;border:none;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;">Clear</button>`
              :`<span style="opacity:0.5;">Your turn! ${toCall>0?'Call '+toCall+' or raise':'Check or bet'}</span>`}
          </div>

          <!-- Chip circles -->
          <div style="display:flex;justify-content:center;gap:10px;margin-bottom:10px;">
            ${CHIP_VALS.map((v,i)=>chipCircle(v,CHIP_COLORS[i],pendingChipCounts[i])).join('')}
          </div>

          <!-- Action buttons -->
          <div style="display:flex;gap:8px;justify-content:center;">
            <button onclick="window.lp_fold()" style="background:#8B1111;color:white;border:none;border-radius:10px;padding:10px 20px;cursor:pointer;font-size:14px;font-weight:bold;">Fold</button>
            ${canCheck?`<button onclick="window.lp_check()" style="background:#116611;color:white;border:none;border-radius:10px;padding:10px 20px;cursor:pointer;font-size:14px;font-weight:bold;">Check</button>`:''}
            ${canCall?`<button onclick="window.lp_call()" style="background:#116644;color:white;border:none;border-radius:10px;padding:10px 20px;cursor:pointer;font-size:14px;font-weight:bold;">Call ${toCall}</button>`:''}
            ${canBet&&lp.pendingBet>0?`<button onclick="window.lp_placeBet()" style="background:#884400;color:white;border:none;border-radius:10px;padding:10px 20px;cursor:pointer;font-size:14px;font-weight:bold;">Bet ${myBetTotal}</button>`:''}
          </div>`:`
          <div style="text-align:center;padding:14px;opacity:0.5;font-size:0.9rem;">
            Waiting for other players...
          </div>`
        }
      </div>
    </div>
  `;
}

function openLoungePoker(tableIdx=0){
  loungePoker.tableIdx=tableIdx;
  loungePoker.phase='waiting';
  loungePokerOverlay.style.display='flex';
  inRoom=true; safeSetVolume(0.1);
  if(document.pointerLockElement) document.exitPointerLock();
  if(socket){
    socket.emit('lpoker:join',{tableIdx});
    claimDailyChips();
  }
  renderLoungePoker();
}
window.openLoungePoker=openLoungePoker;

// Update seatPlayerAtLounge to open poker
function seatPlayerAtLounge(){
  const tableIdx=Math.floor(Math.random()*3);
  showNotification('🎩 Welcome! Seating you at Table '+(tableIdx+1)+'...');
  // Teleport to table
  const [tx,tz]=LOUNGE_TABLES[tableIdx];
  camera.position.set(tx+2, FLOOR2_Y+1.7, tz+2);
  setTimeout(()=>openLoungePoker(tableIdx), 800);
}
window.seatPlayerAtLounge=seatPlayerAtLounge;

// Socket events for lounge poker
function setupLoungePokerSocketEvents(){
  if(!socket) return;

  socket.on('chips:daily',()=>{
    window.myChips=(window.myChips||1000)+500;
    loungePoker.myChips=(window.myChips);
    showNotification('🎁 Daily bonus: +500 SpaceBucks!');
    renderLoungePoker();
  });

  socket.on('lpoker:state',(s)=>{
    loungePoker.phase=s.phase;
    loungePoker.pot=s.pot;
    loungePoker.currentBet=s.currentBet;
    loungePoker.community=s.community||[];
    loungePoker.seats=s.seats||[];
    loungePoker.myChips=s.myChips||loungePoker.myChips;
    window.myChips=loungePoker.myChips;
    const me=s.seats.find(seat=>seat&&seat.socketId===mySocketId);
    if(me){
      loungePoker.myCards=me.holeCards||[];
      loungePoker.myBet=me.bet||0;
      loungePoker.isMyTurn=s.activeSocketId===mySocketId;
    }
    if(loungePokerOverlay.style.display==='flex') renderLoungePoker();
  });

  socket.on('lpoker:result',(data)=>{
    loungePoker.myChips=data.myChips||loungePoker.myChips;
    window.myChips=loungePoker.myChips;
    const msg=data.winners.map(w=>`${w.username} wins ${w.amount} with ${w.hand}`).join(', ');
    showNotification('🏆 '+msg);
    pendingChipCounts=[0,0,0,0]; loungePoker.pendingBet=0;
    setTimeout(()=>renderLoungePoker(),200);
  });

  socket.on('lpoker:dealt',()=>{ showNotification('🃏 Cards dealt! Good luck.'); });
  socket.on('chips:update',(d)=>{
    const prev=window.myChips||1000;
    window.myChips=d.chips; loungePoker.myChips=d.chips;
    const diff=d.chips-prev;
    if(diff!==0){
      const el=document.getElementById('walletAmount');
      if(el){ el.textContent=d.chips.toLocaleString(); el.style.color=diff>0?'#88FF44':'#FF6644'; setTimeout(()=>el.style.color='#FFD700',1200); }
      if(Math.abs(diff)>0) showNotification(diff>0?'+ '+diff+' SpaceBucks!':'-'+Math.abs(diff)+' SpaceBucks lost');
    }
    if(loungePokerOverlay.style.display==='flex') renderLoungePoker();
  });
}

// Poll for socket ready
const _lpPoll=setInterval(()=>{
  if(socket&&mySocketId){ setupLoungePokerSocketEvents(); clearInterval(_lpPoll); }
},600);

// Slot positions for proximity (mirrors world positions)
// SLOT_POSITIONS already declared in lounge build section

function buyRaffleTicket(){
  if(!socket||!mySocketId){ showNotification('Connect to buy tickets!'); return; }
  const cost=100;
  if((window.myChips||0)<cost){ showNotification('Need 100 SpaceBucks for a ticket!'); return; }
  socket.emit('slots:buyRaffle');
  showNotification('🎫 Raffle ticket purchased for 100 SB! Good luck!');
  relockPointer();
}

// Leaderboard overlay
const leaderboardOverlay=document.createElement('div');
leaderboardOverlay.style.cssText=`position:fixed;inset:0;background:rgba(0,0,15,0.94);
  color:white;font-family:'Segoe UI',sans-serif;display:none;align-items:center;
  justify-content:center;flex-direction:column;z-index:300;`;
document.body.appendChild(leaderboardOverlay);

function openLeaderboard(){
  inRoom=true;
  leaderboardOverlay.style.display='flex';
  if(document.pointerLockElement) document.exitPointerLock();
  leaderboardOverlay.innerHTML=`<div style="text-align:center;padding:16px;">
    <div style="font-size:1.8rem;font-weight:bold;color:#FFD700;margin-bottom:4px;">🏆 SpaceBucks Leaderboard</div>
    <div style="opacity:0.4;font-size:0.8rem;margin-bottom:20px;">Top players online right now</div>
    <div id="lbContent" style="min-width:320px;min-height:100px;display:flex;align-items:center;justify-content:center;">
      <span style="opacity:0.4;">Loading...</span>
    </div>
    <button onclick="window.closeLeaderboard()" style="margin-top:20px;background:rgba(255,255,255,0.08);
      color:white;border:1px solid rgba(255,255,255,0.15);border-radius:10px;
      padding:10px 28px;cursor:pointer;font-size:13px;">Close</button>
  </div>`;
  if(socket) socket.emit('leaderboard:get');
  relockPointer();
}
window.closeLeaderboard=()=>{ leaderboardOverlay.style.display='none'; inRoom=false; relockPointer(); };

// Slot positions already declared above
// ─── SLOT MACHINE MINI-GAME ───────────────────────────────
const SLOT_SYMBOLS = ['🍒','🍋','🍊','🔔','💎','7️⃣','⭐'];
const SLOT_WEIGHTS = [40,30,20,15,8,4,2]; // higher = more common (cherries most frequent)
const SLOT_PAYOUTS = { // multipliers on bet
  '🍒🍒🍒':3, '🍋🍋🍋':5, '🍊🍊🍊':8,
  '🔔🔔🔔':15, '💎💎💎':50, '7️⃣7️⃣7️⃣':100, '⭐⭐⭐':500,
  '🍒🍒':1.5, // two cherries pays too
};
const SLOT_BET_AMOUNTS=[5,10,25,50];

let slotOverlay=null;
let nearSlotMachine=false;
let slotSpinning=false;

function weightedPick(){
  const total=SLOT_WEIGHTS.reduce((a,b)=>a+b,0);
  let r=Math.random()*total;
  for(let i=0;i<SLOT_SYMBOLS.length;i++){
    r-=SLOT_WEIGHTS[i];
    if(r<=0) return SLOT_SYMBOLS[i];
  }
  return SLOT_SYMBOLS[0];
}

function openSlotMachine(){
  if(slotOverlay) { slotOverlay.remove(); slotOverlay=null; }
  if(!socket||!mySocketId){ showNotification('Connect to play slots!'); return; }
  inRoom=true; safeSetVolume(0.1);

  slotOverlay=document.createElement('div');
  slotOverlay.style.cssText=`position:fixed;inset:0;background:rgba(0,0,20,0.95);
    color:white;font-family:sans-serif;display:flex;align-items:center;
    justify-content:center;flex-direction:column;z-index:300;`;

  renderSlotMachine();
  document.body.appendChild(slotOverlay);
}

let slotReels=['🍒','🍒','🍒'];
let slotBet=5;
let slotResult=null;

function renderSlotMachine(){
  if(!slotOverlay) return;
  const myChips=window.myChips||1000;
  slotOverlay.innerHTML=`
    <div style="width:340px;text-align:center;padding:24px;box-sizing:border-box;">
      <div style="font-size:1.6rem;font-weight:bold;margin-bottom:4px;white-space:nowrap;">🎰 Lucky Stars</div>
      <div style="opacity:0.5;font-size:0.8rem;margin-bottom:20px;white-space:nowrap;">Astropelion Lounge</div>

      <!-- Reels — fixed size, no reflow -->
      <div style="display:flex;gap:8px;justify-content:center;margin-bottom:20px;height:90px;align-items:center;">
        ${slotReels.map((s,i)=>`
          <div style="width:82px;height:82px;background:rgba(255,255,255,0.08);
            border:2px solid rgba(255,255,255,0.25);border-radius:12px;
            overflow:hidden;flex-shrink:0;display:flex;align-items:center;
            justify-content:center;font-size:2.6rem;line-height:1;">
            <span id="slotReel${i}" style="display:block;width:82px;text-align:center;">${s}</span>
          </div>`).join('')}
      </div>

      <!-- Result — fixed height so layout doesn't jump -->
      <div id="slotResult" style="min-height:48px;margin-bottom:14px;display:flex;align-items:center;justify-content:center;">
        ${slotResult?`<div style="padding:10px 20px;border-radius:10px;width:100%;box-sizing:border-box;
          background:${slotResult.win>0?'rgba(0,200,0,0.2)':'rgba(200,0,0,0.15)'};
          border:1px solid ${slotResult.win>0?'#44FF44':'#FF4444'};font-size:0.95rem;">
          ${slotResult.win>0?'Won '+slotResult.win+' SpaceBucks!':'Lost '+slotBet+' SpaceBucks'}
        </div>`:''}
      </div>

      <!-- Bet selector -->
      <div style="display:flex;gap:8px;justify-content:center;margin-bottom:16px;">
        ${SLOT_BET_AMOUNTS.map(b=>`<button onclick="window.slotSetBet(${b})"
          style="background:${slotBet===b?'rgba(255,200,0,0.3)':'rgba(255,255,255,0.08)'};
          border:1px solid ${slotBet===b?'#FFD700':'rgba(255,255,255,0.2)'};
          color:white;border-radius:8px;padding:8px 12px;cursor:pointer;font-size:13px;">
          ${b} SB</button>`).join('')}
      </div>

      <!-- Spin button -->
      <button id="slotSpinBtn" onclick="window.slotSpin()" ${slotSpinning||myChips<slotBet?'disabled':''}
        style="background:${slotSpinning?'#555':'#CC2200'};color:white;border:none;
        border-radius:14px;padding:16px 48px;font-size:1.1rem;font-weight:bold;
        cursor:${slotSpinning?'not-allowed':'pointer'};width:100%;margin-bottom:12px;
        box-shadow:${slotSpinning?'none':'0 4px 16px rgba(200,0,0,0.4)'};">
        ${slotSpinning?'Spinning...':'🎰 SPIN  ('+slotBet+' SB)'}
      </button>

      <!-- Balance -->
      <div style="opacity:0.6;font-size:0.85rem;margin-bottom:14px;">
        Balance: <strong id="slotBalance">${myChips.toLocaleString()}</strong> SpaceBucks
      </div>

      <!-- House jackpot info -->
      <div id="houseJackpotDisplay" style="background:rgba(255,215,0,0.1);border:1px solid rgba(255,215,0,0.3);
        border-radius:10px;padding:10px;font-size:0.8rem;margin-bottom:14px;">
        🏆 Loading jackpot info...
      </div>

      <button onclick="window.closeSlots()"
        style="background:rgba(255,255,255,0.08);color:white;border:1px solid rgba(255,255,255,0.15);
        border-radius:10px;padding:10px 28px;cursor:pointer;font-size:13px;">Close</button>
    </div>
  `;
  // Request jackpot info
  if(socket) socket.emit('slots:getJackpot');
}

window.slotSetBet=(b)=>{ slotBet=b; slotResult=null; renderSlotMachine(); };
window.closeSlots=()=>{
  if(slotOverlay){ slotOverlay.remove(); slotOverlay=null; }
  inRoom=false; safeSetVolume(0.35);
  relockPointer();
};
window.slotSpin=()=>{
  if(slotSpinning||(window.myChips||0)<slotBet) return;
  if(!socket){ showNotification('Not connected!'); return; }
  slotSpinning=true; slotResult=null;
  // Update spin button state only
  const spinBtn=document.getElementById('slotSpinBtn');
  if(spinBtn){ spinBtn.disabled=true; spinBtn.textContent='Spinning...'; spinBtn.style.background='#555'; }
  const resultEl=document.getElementById('slotResult');
  if(resultEl) resultEl.innerHTML='';
  // Animate only the reel spans — no full re-render
  let ticks=0;
  const reelEls=[
    document.getElementById('slotReel0'),
    document.getElementById('slotReel1'),
    document.getElementById('slotReel2'),
  ];
  const anim=setInterval(()=>{
    slotReels=slotReels.map(()=>SLOT_SYMBOLS[Math.floor(Math.random()*SLOT_SYMBOLS.length)]);
    reelEls.forEach((el,i)=>{ if(el) el.textContent=slotReels[i]; });
    ticks++;
    if(ticks>14){
      clearInterval(anim);
      socket.emit('slots:spin',{bet:slotBet});
    }
  },80);
};

// Jackpot display
function updateJackpotDisplay(data){
  const el=document.getElementById('houseJackpotDisplay');
  if(!el) return;
  const milestones=[50000,100000,250000,500000,1000000];
  const next=milestones.find(m=>m>data.housePot)||1000000;
  const pct=Math.min(100,Math.floor((data.housePot/next)*100));
  el.innerHTML=`
    <div style="margin-bottom:4px;">House Jackpot: <strong style="color:#FFD700;">${(data.housePot||0).toLocaleString()} SB</strong></div>
    <div style="background:rgba(0,0,0,0.3);border-radius:4px;height:8px;margin-bottom:4px;overflow:hidden;">
      <div style="background:linear-gradient(90deg,#FFD700,#FF8800);height:100%;width:${pct}%;transition:width 0.5s;"></div>
    </div>
    <div style="opacity:0.6;font-size:0.75rem;">Next payout at ${next.toLocaleString()} SB (${pct}%)</div>
    ${data.raffleTickets>0?`<div style="color:#88FF88;margin-top:4px;font-size:0.75rem;">You hold ${data.raffleTickets} raffle ticket${data.raffleTickets>1?'s':''}!</div>`:''}
  `;
}

// Jackpot win announcement overlay
function showJackpotAnnouncement(data){
  const ann=document.createElement('div');
  ann.style.cssText=`position:fixed;inset:0;background:rgba(0,0,0,0.9);
    display:flex;align-items:center;justify-content:center;z-index:600;
    animation:flashPop 0.4s ease-out;`;
  ann.innerHTML=`
    <div style="text-align:center;padding:32px;max-width:500px;">
      <div style="font-size:4rem;margin-bottom:12px;">🏆</div>
      <h1 style="color:#FFD700;margin-bottom:8px;">JACKPOT HIT!</h1>
      <p style="font-size:1.2rem;margin-bottom:16px;">${data.message}</p>
      ${data.winner?`<p style="color:#FFD700;font-size:1.1rem;">🎫 Raffle Winner: <strong>${data.winner}</strong> wins ${data.winnerAmount.toLocaleString()} SB!</p>`:''}
      <p style="opacity:0.7;">All online players receive 5% bonus!</p>
      <button onclick="this.parentElement.parentElement.remove()" style="margin-top:20px;background:#FFD700;color:#000;border:none;border-radius:10px;padding:12px 28px;font-size:15px;font-weight:bold;cursor:pointer;">Collect!</button>
    </div>
  `;
  document.body.appendChild(ann);
  setTimeout(()=>ann.remove(),15000);
}

// Near slot machine detection
function updateSlotProximity(){
  let nearest=false;
  // Leaderboard sign proximity
  const lbx=camera.position.x-LX, lbz=camera.position.z-(LZ+12.2);
  nearLeaderboard=Math.sqrt(lbx*lbx+lbz*lbz)<3.5;
  SLOT_POSITIONS.forEach(([sx,sz])=>{
    const dx=camera.position.x-sx, dz=camera.position.z-sz;
    if(Math.sqrt(dx*dx+dz*dz)<2.5) nearest=true;
  });
  nearSlotMachine=nearest;
  // Near raffle vendor
  const rvx=camera.position.x-LX, rvz=camera.position.z-(LZ+9);
  nearRaffleVendor=Math.sqrt(rvx*rvx+rvz*rvz)<2.5;
}
let nearRaffleVendor=false;

// Socket events for slots
function setupSlotSocketEvents(){
  if(!socket) return;
  socket.on('leaderboard:data',(data)=>{
    const el=document.getElementById('lbContent'); if(!el) return;
    if(!data.length){ el.innerHTML='<span style="opacity:0.4;">No players online</span>'; return; }
    el.innerHTML='<table style="width:100%;border-collapse:collapse;">'+
      '<tr style="opacity:0.4;font-size:0.75rem;"><th style="text-align:left;padding:4px 8px;">#</th><th style="text-align:left;padding:4px 8px;">Player</th><th style="text-align:right;padding:4px 8px;">SpaceBucks</th></tr>'+
      data.map((p,i)=>{
        const isMe=p.username===myUsername;
        const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
        return '<tr style="background:'+( isMe?'rgba(255,215,0,0.12)':'rgba(255,255,255,0.03)')+';border-bottom:1px solid rgba(255,255,255,0.05);">'+
          '<td style="padding:7px 8px;opacity:0.5;">'+(i+1)+'</td>'+
          '<td style="padding:7px 8px;font-weight:'+( isMe?'bold':'normal')+';color:'+( isMe?'#FFD700':'white')+';">'+ medal+' '+p.username+'</td>'+
          '<td style="padding:7px 8px;text-align:right;color:#FFD700;">'+p.chips.toLocaleString()+'</td>'+
        '</tr>';
      }).join('')+
    '</table>';
  });
  socket.on('slots:result',(data)=>{
    slotSpinning=false;
    slotReels=data.reels;
    slotResult={win:data.win};
    window.myChips=data.newBalance;
    data.reels.forEach((s,i)=>{ const el=document.getElementById('slotReel'+i); if(el) el.textContent=s; });
    const resultEl=document.getElementById('slotResult');
    if(resultEl) resultEl.innerHTML=data.win>0
      ? '<div style="padding:10px 20px;border-radius:10px;width:100%;box-sizing:border-box;background:rgba(0,200,0,0.2);border:1px solid #44FF44;font-size:0.95rem;">Won '+data.win+' SpaceBucks!</div>'
      : '<div style="padding:10px 20px;border-radius:10px;width:100%;box-sizing:border-box;background:rgba(200,0,0,0.15);border:1px solid #FF4444;font-size:0.95rem;">Lost '+slotBet+' SpaceBucks</div>';
    const spinBtn=document.getElementById('slotSpinBtn');
    if(spinBtn){ spinBtn.disabled=false; spinBtn.textContent='Spin ('+slotBet+' SB)'; spinBtn.style.background='#CC2200'; }
    const balEl=document.getElementById('slotBalance');
    if(balEl) balEl.textContent=data.newBalance.toLocaleString();
  });
  socket.on('slots:jackpotInfo',(data)=>updateJackpotDisplay(data));
  socket.on('slots:jackpotPayout',(data)=>{
    window.myChips=(window.myChips||0)+data.yourShare;
    showJackpotAnnouncement(data);
    showNotification(`JACKPOT! You received ${data.yourShare.toLocaleString()} SpaceBucks!`);
    renderSlotMachine();
  });
  socket.on('slots:raffleWin',(data)=>{
    window.myChips=(window.myChips||0)+data.amount;
    showNotification(`RAFFLE WIN! You won ${data.amount.toLocaleString()} SpaceBucks!`);
  });
}
const _slotPoll=setInterval(()=>{
  if(socket&&mySocketId){ setupSlotSocketEvents(); clearInterval(_slotPoll); }
},700);

// T to chat hint — only show on non-touch (PC) when connected

window.addEventListener('resize',()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);});
function animate(){requestAnimationFrame(animate);update();renderer.render(scene,camera);}
animate();

// ══════════════════════════════════════════════════════════════
// ─── CAR SYSTEM (append to END of main.js) ────────────────────
// ══════════════════════════════════════════════════════════════

// ── CONSTANTS ──
const CAR_L_CX = 70, CAR_R_CX = 102;
const CAR_TRACK_CZ = -60;
const CAR_TRACK_R  = 16;
const CAR_TRACK_W  = 14;   // doubled from 7
const CAR_VENDOR_X = 86, CAR_VENDOR_Z = -33;
var CAR_SPAWN_X = 86, CAR_SPAWN_Z = -46;

// ── STATE ──
var carDriving    = false;
var carOwned      = false;
var nearCarVendor = false;
var nearCarMesh   = false;
var carPhysics = { x:CAR_SPAWN_X, y:0, z:CAR_SPAWN_Z, rotY:0, speed:0 };
var engineAudio = null;
var engineGain  = null;
var _engineCtx  = null;

// Multiple car meshes: username -> THREE.Group
var carMeshes = {};

function stopEngineAudio(){
  try{ if(engineAudio){ engineAudio.stop(); } } catch(e){}
  try{ if(window._engineAudio2){ window._engineAudio2.stop(); } } catch(e){}
  engineAudio = null; engineGain = null; window._engineFilter = null; window._engineAudio2 = null;
  try{ if(_engineCtx){ _engineCtx.close(); } } catch(e){}
  _engineCtx = null;
}

const CAR_MAX_SPEED   = 20;
const CAR_ACCEL       = 10;
const CAR_BRAKE_FORCE = 18;
const CAR_REVERSE_MAX = -7;
const CAR_STEER_RATE  = 1.9;
const CAR_FRICTION    = 0.93;
const CAR_SYNC_MS     = 50;
let   carSyncTimer    = 0;

// ══════════════════════════════════════════════════════════════
// ── BUILD FIGURE-8 TRACK (doubled width, barrier collision)
// ══════════════════════════════════════════════════════════════
(function buildCarTrack(){
  const N = 24;
  const CROSS_X = (CAR_L_CX + CAR_R_CX) / 2;

  [CAR_L_CX, CAR_R_CX].forEach(cx => {
    const segLen = (2 * Math.PI * CAR_TRACK_R / N) + 0.9;

    for(let i = 0; i < N; i++){
      const a  = (i / N) * Math.PI * 2;
      const sx = cx + Math.cos(a) * CAR_TRACK_R;
      const sz = CAR_TRACK_CZ + Math.sin(a) * CAR_TRACK_R;
      const rY = a + Math.PI / 2;

      // Asphalt
      const road = box(segLen, 0.1, CAR_TRACK_W, 0x3A3A3A, sx, 0.05, sz, false);
      road.rotation.y = rY;

      // Edge lines
      const iR = CAR_TRACK_R - CAR_TRACK_W / 2 + 0.3;
      const oR = CAR_TRACK_R + CAR_TRACK_W / 2 - 0.3;
      const li = box(segLen, 0.12, 0.28, 0xFFFFFF,
        cx + Math.cos(a)*iR, 0.06, CAR_TRACK_CZ + Math.sin(a)*iR, false);
      li.rotation.y = rY;
      const lo = box(segLen, 0.12, 0.28, 0xFFFFFF,
        cx + Math.cos(a)*oR, 0.06, CAR_TRACK_CZ + Math.sin(a)*oR, false);
      lo.rotation.y = rY;

      // Dashed center line
      if(i % 3 === 0){
        const dash = box(segLen * 0.45, 0.13, 0.2, 0xFFFFFF, sx, 0.065, sz, false);
        dash.rotation.y = rY;
      }

      // Outer barrier — alternating red/white, solid collision boxes stored
      const bR = CAR_TRACK_R + CAR_TRACK_W / 2 + 0.55;
      const barrier = box(segLen + 0.15, 0.6, 0.45,
        i % 2 === 0 ? 0xCC2222 : 0xEEEEEE,
        cx + Math.cos(a)*bR, 0.3, CAR_TRACK_CZ + Math.sin(a)*bR, false);
      barrier.rotation.y = rY;
    }
  });

  // Crossing strip
  const crossLen = CAR_R_CX - CAR_L_CX + CAR_TRACK_W;
  box(crossLen, 0.1, CAR_TRACK_W, 0x3A3A3A, CROSS_X, 0.05, CAR_TRACK_CZ, false);

  // Checkered start/finish
  for(let i = 0; i < 4; i++) for(let j = 0; j < 4; j++){
    box(1.55, 0.13, 1.55, (i+j)%2===0 ? 0xFFFFFF : 0x111111,
      CROSS_X - 2.33 + i*1.55, 0.07, CAR_TRACK_CZ - 2.33 + j*1.55, false);
  }

  // Entrance road
  box(CAR_TRACK_W, 0.1, 15, 0x3A3A3A, CROSS_X, 0.05, CAR_VENDOR_Z - 7.5, false);
  box(CAR_TRACK_W, 0.1, 14, 0x3A3A3A, CROSS_X, 0.05, CAR_VENDOR_Z - 21, false);

  // Tire stacks
  [[CROSS_X - 5, CAR_VENDOR_Z + 1], [CROSS_X + 5, CAR_VENDOR_Z + 1]].forEach(([tx, tz]) => {
    for(let t = 0; t < 3; t++){
      const tire = new THREE.Mesh(
        new THREE.TorusGeometry(0.45, 0.2, 6, 12),
        new THREE.MeshLambertMaterial({ color: 0x111111 })
      );
      tire.rotation.x = Math.PI / 2;
      tire.position.set(tx, 0.18 + t * 0.43, tz);
      scene.add(tire);
    }
  });

  // Race track sign
  cyl(0.1, 0.1, 5, 6, 0x888888, CROSS_X - 4.5, 2.5, CAR_VENDOR_Z + 5, false);
  cyl(0.1, 0.1, 5, 6, 0x888888, CROSS_X + 4.5, 2.5, CAR_VENDOR_Z + 5, false);
  box(10, 1.8, 0.28, 0x110022, CROSS_X, 5.5, CAR_VENDOR_Z + 5.1, false);
  for(let i = 0; i < 8; i++){
    box(1.1, 0.5, 0.12, i%2===0 ? 0xFF5500 : 0xFFCC00,
      CROSS_X - 3.85 + i*1.1, 5.5, CAR_VENDOR_Z + 5.25, false);
  }
  box(9.4, 0.25, 0.1, 0xFFCC00, CROSS_X, 6.1,  CAR_VENDOR_Z + 5.25, false);
  box(9.4, 0.25, 0.1, 0xFFCC00, CROSS_X, 4.9,  CAR_VENDOR_Z + 5.25, false);
})();



// ══════════════════════════════════════════════════════════════
// ── VENDOR NPC ──
// ══════════════════════════════════════════════════════════════
const carVendorGroup = new THREE.Group();
(function buildCarVendor(){
  const jumpsuit = new THREE.MeshLambertMaterial({ color: 0x2255CC });
  const skin     = new THREE.MeshLambertMaterial({ color: 0xFFCC88 });
  const helmet   = new THREE.MeshLambertMaterial({ color: 0xFF5500 });
  const visorMat = new THREE.MeshBasicMaterial({ color:0xCCEEFF, transparent:true, opacity:0.7 });
  const goldMat  = new THREE.MeshLambertMaterial({ color: 0xFFD700 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52,0.62,0.38), jumpsuit);
  body.position.y = 0.88; carVendorGroup.add(body);
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.53,0.1,0.39),
    new THREE.MeshLambertMaterial({ color: 0xFFCC00 }));
  collar.position.y = 1.18; carVendorGroup.add(collar);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44,0.44,0.42), skin);
  head.position.set(0,1.32,0.04); carVendorGroup.add(head);
  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.52,0.5), helmet);
  helm.position.set(0,1.36,0); carVendorGroup.add(helm);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.38,0.22,0.06), visorMat);
  visor.position.set(0,1.32,0.27); carVendorGroup.add(visor);
  [-0.11,0.11].forEach(ex => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.07,0.07,0.04),
      new THREE.MeshBasicMaterial({ color:0x111111 }));
    eye.position.set(ex,1.32,0.26); carVendorGroup.add(eye);
  });
  [-0.36,0.36].forEach(ax => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15,0.4,0.15), jumpsuit);
    arm.position.set(ax,0.86,0); carVendorGroup.add(arm);
  });
  [-0.14,0.14].forEach(lx => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18,0.42,0.2), jumpsuit);
    leg.position.set(lx,0.29,0); carVendorGroup.add(leg);
  });
  const keyFob = new THREE.Mesh(new THREE.BoxGeometry(0.12,0.06,0.22), goldMat);
  keyFob.position.set(0.52,0.62,0.1); carVendorGroup.add(keyFob);
  const keyRing = new THREE.Mesh(new THREE.TorusGeometry(0.06,0.015,5,10), goldMat);
  keyRing.position.set(0.52,0.66,0); carVendorGroup.add(keyRing);

  box(3.8, 1.0, 1.3, 0x8B5E3C, CAR_VENDOR_X,  0.75, CAR_VENDOR_Z+1.8, false);
  box(3.8, 0.1, 1.5, 0xAA7744, CAR_VENDOR_X,  1.28, CAR_VENDOR_Z+1.8, false);
  box(3.8, 1.9, 0.15, 0x664411, CAR_VENDOR_X, 1.15, CAR_VENDOR_Z+2.6, false);
  box(3.2, 0.9, 0.1,  0x1a1a2e, CAR_VENDOR_X, 2.7,  CAR_VENDOR_Z+2.7, false);
  box(3.0, 0.6, 0.12, 0xFF5500, CAR_VENDOR_X, 2.7,  CAR_VENDOR_Z+2.75, false);
  box(1.2, 0.3, 0.1, 0xFFD700,  CAR_VENDOR_X, 1.1,  CAR_VENDOR_Z+1.2, false);
  box(0.6, 0.15, 0.28, 0xFFCC00, CAR_VENDOR_X-0.5, 1.35, CAR_VENDOR_Z+1.2, false);
  box(0.3, 0.12, 0.24, 0xFFCC00, CAR_VENDOR_X-0.45, 1.48, CAR_VENDOR_Z+1.2, false);

  carVendorGroup.position.set(CAR_VENDOR_X - 0.8, 0, CAR_VENDOR_Z + 0.5);
  carVendorGroup.rotation.y = Math.PI * 0.12;
  scene.add(carVendorGroup);
})();
let carVendorBobTime = 0;

// Teleport menu entry
{
  const trackDest = document.createElement('div');
  trackDest.textContent = '🏎️ Race Track';
  trackDest.style.cssText = `padding:11px 18px;color:white;font-family:sans-serif;font-size:14px;
    cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.08);transition:background 0.15s;`;
  trackDest.addEventListener('mouseover', () => trackDest.style.background='rgba(255,255,255,0.15)');
  trackDest.addEventListener('mouseout',  () => trackDest.style.background='transparent');
  const goTrack = () => {
    camera.position.set(CAR_VENDOR_X, GROUND_Y, CAR_VENDOR_Z - 2);
    menuList.style.display='none'; menuOpen=false;
  };
  trackDest.addEventListener('click',    goTrack);
  trackDest.addEventListener('touchend', goTrack);
  menuList.insertBefore(trackDest, menuList.firstChild);
}

// ══════════════════════════════════════════════════════════════
// ── CAR MESH FACTORY ──
// ══════════════════════════════════════════════════════════════
function buildCarMesh(){
  const group   = new THREE.Group();
  const yellow  = new THREE.MeshLambertMaterial({ color: 0xFFCC00 });
  const black   = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const glass   = new THREE.MeshLambertMaterial({ color:0x113344, transparent:true, opacity:0.7 });
  const silver  = new THREE.MeshLambertMaterial({ color: 0xBBBBBB });
  const red     = new THREE.MeshLambertMaterial({ color: 0xFF2200 });
  const frontL  = new THREE.MeshBasicMaterial({ color: 0xFFFF99 });
  const rearL   = new THREE.MeshBasicMaterial({ color: 0xFF2200 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.42, 1.92), yellow);
  body.position.y = 0.36; group.add(body);
  [-0.99, 0.99].forEach(z => {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.22, 0.17), black);
    sill.position.set(0, 0.2, z); group.add(sill);
  });
  [-0.9, 0.9].forEach(z => {
    const haunch = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.36, 0.26), yellow);
    haunch.position.set(-1.1, 0.43, z); group.add(haunch);
  });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 1.66), yellow);
  cabin.position.set(-0.22, 0.82, 0); group.add(cabin);
  const ws = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.54, 1.56), glass);
  ws.position.set(0.64, 0.79, 0); ws.rotation.z = 0.4; group.add(ws);
  const rw = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.44, 1.52), glass);
  rw.position.set(-0.96, 0.73, 0); rw.rotation.z = -0.3; group.add(rw);
  const wingBar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 2.2), black);
  wingBar.position.set(-1.9, 1.12, 0); group.add(wingBar);
  [-1.06, 1.06].forEach(z => {
    const ep = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.68, 0.1), black);
    ep.position.set(-1.9, 0.83, z); group.add(ep);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.14), black);
    strut.position.set(-1.72, 0.72, z * 0.62); group.add(strut);
  });
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 1.82), yellow);
  hood.position.set(1.48, 0.62, 0); group.add(hood);
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 2.0), black);
  splitter.position.set(2.26, 0.28, 0); group.add(splitter);
  const frontLip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.38, 1.92), black);
  frontLip.position.set(2.16, 0.4, 0); group.add(frontLip);
  [[2.12, 0.46, 0.73], [2.12, 0.46, -0.73]].forEach(([x,y,z]) => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.4), frontL);
    hl.position.set(x, y, z); group.add(hl);
    const drl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.36), frontL);
    drl.position.set(x-0.01, y-0.18, z); group.add(drl);
  });
  [[-2.14, 0.46, 0.8], [-2.14, 0.46, -0.8]].forEach(([x,y,z]) => {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.34), rearL);
    tl.position.set(x, y, z); group.add(tl);
  });
  const lightBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.6), rearL);
  lightBar.position.set(-2.14, 0.52, 0); group.add(lightBar);
  [[-0.3], [0.3]].forEach(([z]) => {
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.18,8), black);
    exhaust.rotation.z = Math.PI/2; exhaust.position.set(-2.2, 0.22, z);
    group.add(exhaust);
  });
  const wheelPos = [
    [1.26, 0.3, 0.99], [1.26, 0.3, -0.99],
    [-1.26, 0.3, 0.99], [-1.26, 0.3, -0.99]
  ];
  wheelPos.forEach(([wx,wy,wz]) => {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.32,0.25,16), black);
    tire.rotation.z = Math.PI/2; tire.position.set(wx,wy,wz); group.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.23,0.23,0.27,10), silver);
    rim.rotation.z = Math.PI/2; rim.position.set(wx,wy,wz); group.add(rim);
    for(let s=0; s<5; s++){
      const sa = (s/5)*Math.PI*2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.04,0.04), silver);
      spoke.rotation.z = Math.PI/2;
      spoke.position.set(wx, wy + Math.cos(sa)*0.14, wz + Math.sin(sa)*0.14);
      group.add(spoke);
    }
    const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.14,0.2,0.22), red);
    caliper.position.set(wx, wy, wz + (wz>0 ? -0.06 : 0.06)); group.add(caliper);
  });
  [[0.92,0.75,1.01],[0.92,0.75,-1.01]].forEach(([x,y,z]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.32,0.13,0.2), black);
    m.position.set(x,y,z); group.add(m);
  });
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.6,0.06,0.14), black);
  stripe.position.set(0, 0.58, 0.97); group.add(stripe);
  const stripe2 = stripe.clone(); stripe2.position.z = -0.97; group.add(stripe2);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.18,0.52),
    new THREE.MeshLambertMaterial({ color:0xFFFFFF }));
  plate.position.set(2.18,0.36,0); group.add(plate);
  return group;
}

// ── Get or create a car mesh for a username ──
function getOrCreateCarMesh(username){
  if(carMeshes[username]) return carMeshes[username];
  const g = buildCarMesh();
  // Try to load GLTF if available
  import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
    new GLTFLoader().load('/porsche_gt3.glb', (gltf) => {
      g.clear();
      gltf.scene.scale.setScalar(1.5);
      gltf.scene.rotation.y = 0;
      g.add(gltf.scene);
    });
  }).catch(()=>{});
  g.position.set(CAR_SPAWN_X, 0, CAR_SPAWN_Z);
  scene.add(g);
  carMeshes[username] = g;
  return g;
}

// ── DRIVER LABEL ──
const carDriverLabel = document.createElement('div');
carDriverLabel.style.cssText = `position:fixed;background:rgba(0,0,0,0.72);color:#FFD700;
  font-family:sans-serif;font-size:12px;font-weight:bold;padding:3px 10px;border-radius:10px;
  pointer-events:none;display:none;z-index:122;transform:translate(-50%,-100%);white-space:nowrap;`;
document.body.appendChild(carDriverLabel);

// ── CAR PROMPT ──
const carPrompt = document.createElement('div');
carPrompt.style.cssText = `position:fixed;bottom:200px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,0.8);color:white;padding:12px 28px;border-radius:12px;
  font-family:sans-serif;font-size:15px;border:2px solid #FF5500;backdrop-filter:blur(8px);
  display:none;z-index:100;cursor:pointer;user-select:none;
  box-shadow:0 0 14px rgba(255,85,0,0.45);`;
carPrompt.addEventListener('click',    () => handleCarInteract());
carPrompt.addEventListener('touchend', e => { e.preventDefault(); handleCarInteract(); }, { passive:false });
document.body.appendChild(carPrompt);

// ── SPEEDOMETER HUD ──
const carHUD = document.createElement('div');
carHUD.style.cssText = `position:fixed;bottom:80px;right:20px;background:rgba(0,0,0,0.78);
  color:white;font-family:monospace;font-size:20px;font-weight:bold;
  padding:10px 20px;border-radius:12px;display:none;z-index:100;
  border:1px solid rgba(255,255,255,0.2);letter-spacing:0.04em;min-width:110px;text-align:center;`;
document.body.appendChild(carHUD);
const carKeyBtn = document.createElement('div');
carKeyBtn.innerHTML = '🔑';
carKeyBtn.style.cssText = `position:fixed;bottom:20px;left:100px;width:52px;height:52px;
  background:rgba(0,0,0,0.75);border:2px solid #FFD700;border-radius:14px;
  font-size:26px;display:flex;align-items:center;justify-content:center;
  cursor:pointer;z-index:100;user-select:none;box-shadow:0 0 10px rgba(255,215,0,0.3);`;
carKeyBtn.addEventListener('click',    () => summonCar());
carKeyBtn.addEventListener('touchend', e => { e.preventDefault(); summonCar(); }, { passive:false });
document.body.appendChild(carKeyBtn);

function summonCar(){
  if(!carOwned){
    showNotification('🏎️ No car key! Visit the race track to get your license.');
    return;
  }
  if(carDriving){
    showNotification('🏎️ You\'re already driving!');
    return;
  }
  if(socket) socket.emit('car:summon');
  showNotification('🔑 Car summoned!');
}

// ── INTERACTION ──
function handleCarInteract(){
  if(joinOverlay.style.display !== 'none') return;
  if(tosOverlay.style.display  !== 'none') return;
  if(inRoom || golfMode || slideMode)      return;

  if(nearCarVendor){
    if(!carOwned){ if(socket) socket.emit('car:buy'); }
    else showNotification('🔑 You already have a car key! Head to the track.');
    return;
  }
  if(nearCarMesh && !carDriving){
    if(!carOwned){
      showNotification('🔑 Buy a car key from the vendor first!');
      return;
    }
    if(socket) socket.emit('car:enter');
    return;
  }
  if(carDriving){
    exitCar();
  }
}

function exitCar(){
  if(!carDriving) return;
  carDriving = false;
  if(socket) socket.emit('car:exit');
  carHUD.style.display    = 'none';
  carPrompt.style.display = 'none';
  camera.position.set(carPhysics.x + 2.5, GROUND_Y, carPhysics.z + 2.5);
  velocityY = 0; isGrounded = true;
  leftArm.visible = true; rightArm.visible = true;
  if(!window.matchMedia('(pointer:coarse)').matches){
    setTimeout(() => renderer.domElement.requestPointerLock(), 100);
  }
  showNotification('👣 Stepped out of the car');
}

document.addEventListener('keydown', e => {
  if(e.code !== 'KeyE') return;
  if(joinOverlay.style.display !== 'none') return;
  if(tosOverlay.style.display  !== 'none') return;
  if(nearCarVendor || nearCarMesh || carDriving) handleCarInteract();
});

// ══════════════════════════════════════════════════════════════
// ── CAR UPDATE LOOP ──
// ══════════════════════════════════════════════════════════════
function updateCar(dt){
  carVendorBobTime += dt;
  carVendorGroup.position.y = Math.sin(carVendorBobTime * 1.3) * 0.05;

  // Proximity to vendor
  const vdx = camera.position.x - (CAR_VENDOR_X - 0.8);
  const vdz = camera.position.z - (CAR_VENDOR_Z + 0.5);
  nearCarVendor = !carDriving && Math.sqrt(vdx*vdx + vdz*vdz) < 3.5;

  // Proximity to MY car
  const myCar = carMeshes[myUsername];
  if(myCar && !carDriving){
    const cdx = camera.position.x - myCar.position.x;
    const cdz = camera.position.z - myCar.position.z;
    nearCarMesh = Math.sqrt(cdx*cdx + cdz*cdz) < 3.5;
  } else {
    nearCarMesh = false;
  }

  // Prompt
  if(carDriving){
    carPrompt.textContent   = 'Press E to exit 🚗';
    carPrompt.style.display = 'block';
  } else if(nearCarVendor){
    carPrompt.textContent   = carOwned
      ? '🔑 Already bought! Head to the track'
      : '🏎️ Press E to buy car key (1000 SB)';
    carPrompt.style.display = 'block';
  } else if(nearCarMesh){
    const driver = myCar && myCar.userData.driverUsername;
    if(!driver){
      carPrompt.textContent   = carOwned
        ? '🏎️ Press E to drive the Porsche GT3 RS!'
        : '🔑 Need a car key from the vendor!';
      carPrompt.style.display = 'block';
    } else {
      carPrompt.style.display = 'none';
    }
  } else {
    carPrompt.style.display = 'none';
  }

  // Driver labels for all remote cars
  let labelShown = false;
  Object.entries(carMeshes).forEach(([username, mesh]) => {
    if(username === myUsername) return;
    const driver = mesh.userData.driverUsername;
    if(driver){
      const wp = mesh.position.clone().add(new THREE.Vector3(0, 2.6, 0));
      const pr = wp.clone().project(camera);
      const sx = (pr.x*0.5+0.5)*window.innerWidth;
      const sy = (-pr.y*0.5+0.5)*window.innerHeight;
      if(!labelShown && pr.z < 1 && sy > 0 && sy < window.innerHeight){
        carDriverLabel.textContent   = '🏎️ ' + driver;
        carDriverLabel.style.left    = sx + 'px';
        carDriverLabel.style.top     = sy + 'px';
        carDriverLabel.style.display = 'block';
        labelShown = true;
      }
    }
  });
  if(!labelShown) carDriverLabel.style.display = 'none';

  if(!carDriving) return;

  // ── PHYSICS ──
  const fwd   = keys['KeyW'] || keys['ArrowUp']    || (joystick.active && joystick.dy < -0.3);
  const rev   = keys['KeyS'] || keys['ArrowDown']  || (joystick.active && joystick.dy >  0.3);
  const left  = keys['KeyA'] || keys['ArrowLeft']  || (joystick.active && joystick.dx < -0.3);
  const right = keys['KeyD'] || keys['ArrowRight'] || (joystick.active && joystick.dx >  0.3);

  if(fwd){
    carPhysics.speed = Math.min(carPhysics.speed + CAR_ACCEL * dt, CAR_MAX_SPEED);
  } else if(rev){
    if(carPhysics.speed > 0.5){
      carPhysics.speed = Math.max(carPhysics.speed - CAR_BRAKE_FORCE * dt, 0);
    } else {
      carPhysics.speed = Math.max(carPhysics.speed - CAR_ACCEL * 0.55 * dt, CAR_REVERSE_MAX);
    }
  } else {
    carPhysics.speed *= Math.pow(CAR_FRICTION, dt * 60);
    if(Math.abs(carPhysics.speed) < 0.06) carPhysics.speed = 0;
  }

  const absSpd     = Math.abs(carPhysics.speed);
  const steerFact  = Math.min(absSpd / 4, 1);
  const steerSign  = carPhysics.speed >= 0 ? 1 : -1;
  const steerDelta = CAR_STEER_RATE * steerFact * dt * steerSign;
  if(left)  carPhysics.rotY += steerDelta;
  if(right) carPhysics.rotY -= steerDelta;

  carPhysics.x += Math.sin(carPhysics.rotY) * carPhysics.speed * dt;
  carPhysics.z += Math.cos(carPhysics.rotY) * carPhysics.speed * dt;
  carPhysics.y  = getTerrainY(carPhysics.x, carPhysics.z);

 

  // Apply to my mesh
  const myMesh = carMeshes[myUsername];
  if(myMesh){
    myMesh.position.set(carPhysics.x, carPhysics.y, carPhysics.z);
    myMesh.rotation.y = carPhysics.rotY;
    myMesh.rotation.z = (right ? -1 : left ? 1 : 0) * steerFact * 0.045;
  }

  // ── Camera ──
  yaw   = carPhysics.rotY + Math.PI - 0.05;
  pitch = 0;
  const leftX =  Math.cos(carPhysics.rotY) * 0.38;
  const leftZ = -Math.sin(carPhysics.rotY) * 0.38;
  const fwdX  = -Math.sin(carPhysics.rotY) * 0.15;
  const fwdZ  = -Math.cos(carPhysics.rotY) * 0.15;
  camera.position.x = carPhysics.x + leftX + fwdX;
  camera.position.y = carPhysics.y + 1.42;
  camera.position.z = carPhysics.z + leftZ + fwdZ;
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;

  // ── Speedometer + engine audio ──
  const kmh = Math.abs(Math.round(carPhysics.speed * 3.6));
  if(engineAudio && _engineCtx){
    const freq = 55 + Math.abs(carPhysics.speed) * 6;
    engineAudio.frequency.setValueAtTime(freq, _engineCtx.currentTime);
    if(window._engineFilter) window._engineFilter.frequency.setValueAtTime(freq * 7, _engineCtx.currentTime);
    engineGain.gain.setValueAtTime(carPhysics.speed === 0 ? 0.08 : 0.15, _engineCtx.currentTime);
  }
  carHUD.innerHTML   = `${kmh} <span style="font-size:11px;opacity:0.55;">km/h</span>`;
  carHUD.style.color = kmh > 60 ? '#FF4400' : kmh > 30 ? '#FFAA00' : '#FFFFFF';

  // ── Server sync ──
  carSyncTimer += dt * 1000;
  if(carSyncTimer >= CAR_SYNC_MS && socket){
    carSyncTimer = 0;
    socket.emit('car:move', {
      x: carPhysics.x, y: carPhysics.y, z: carPhysics.z,
      rotY: carPhysics.rotY, speed: carPhysics.speed
    });
  }
}

// ══════════════════════════════════════════════════════════════
// ── SOCKET EVENTS ──
// ══════════════════════════════════════════════════════════════
function setupCarSocketEvents(){
  if(!socket) return;
  socket.emit('car:getState');

  socket.on('car:ownershipStatus', data => { carOwned = data.owned; });

  // Full state of all cars (on join, after buy, after exit)
  socket.on('car:allState', cars => {
    cars.forEach(data => {
      const mesh = getOrCreateCarMesh(data.username);
      mesh.position.set(data.x, data.y || 0, data.z);
      mesh.rotation.y = data.rotY;
      mesh.userData.driverUsername = data.driverId ? data.username : null;
      // Sync my own physics if I'm not driving
      if(data.username === myUsername && !carDriving){
        carPhysics.x = data.x; carPhysics.z = data.z; carPhysics.rotY = data.rotY;
      }
    });
  });

  socket.on('car:bought', () => {
    carOwned = true;
    // My car mesh gets created by the next car:allState broadcast
    showNotification('🏎️ Car key bought! Head to the track.');
    const credit = document.createElement('div');
    credit.style.cssText = `position:fixed;bottom:140px;left:50%;transform:translateX(-50%);
      background:rgba(0,0,0,0.72);color:rgba(255,255,255,0.65);font-family:sans-serif;
      font-size:12px;padding:6px 16px;border-radius:8px;z-index:500;pointer-events:none;
      border:1px solid rgba(255,255,255,0.15);transition:opacity 1s;`;
    credit.textContent = '🏎️ Porsche GT3 RS · Model by Black Snow (CC BY)';
    document.body.appendChild(credit);
    setTimeout(() => { credit.style.opacity = '0'; }, 4000);
    setTimeout(() => credit.remove(), 5200);
  });

  socket.on('car:entered', data => {
    stopEngineAudio();
    carDriving = true;
    _engineCtx = new (window.AudioContext || window.webkitAudioContext)();
    const engineFilter = _engineCtx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.setValueAtTime(300, _engineCtx.currentTime);
    engineFilter.Q.setValueAtTime(12, _engineCtx.currentTime);
    engineGain = _engineCtx.createGain();
    engineGain.gain.setValueAtTime(0.12, _engineCtx.currentTime);
    engineAudio = _engineCtx.createOscillator();
    engineAudio.type = 'square';
    engineAudio.frequency.setValueAtTime(50, _engineCtx.currentTime);
    window._engineAudio2 = _engineCtx.createOscillator();
    window._engineAudio2.type = 'square';
    window._engineAudio2.frequency.setValueAtTime(53, _engineCtx.currentTime);
    engineAudio.connect(engineFilter);
    window._engineAudio2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(_engineCtx.destination);
    window._engineFilter = engineFilter;
    engineAudio.start();
    window._engineAudio2.start();

    carPhysics.x     = data.carState.x;
    carPhysics.z     = data.carState.z;
    carPhysics.rotY  = data.carState.rotY;
    carPhysics.speed = 0;

    const myMesh = getOrCreateCarMesh(myUsername);
    myMesh.position.set(carPhysics.x, carPhysics.y, carPhysics.z);
    myMesh.rotation.y = carPhysics.rotY;
    myMesh.userData.driverUsername = myUsername;

    carHUD.style.display = 'block';
    leftArm.visible = false; rightArm.visible = false;
    if(document.pointerLockElement) document.exitPointerLock();
    showNotification('🏎️ WASD to drive · E to exit · Hit the figure-8!');
  });

  socket.on('car:moved', data => {
    // Another player's car moved
    if(data.username === myUsername) return;
    const mesh = getOrCreateCarMesh(data.username);
    mesh.position.set(data.x, data.y || 0, data.z);
    mesh.rotation.y = data.rotY;
    mesh.userData.driverUsername = data.username;
  });

  socket.on('car:exited', () => {
    carDriving = false;
    carPhysics.speed = 0;
    stopEngineAudio();
    carHUD.style.display = 'none';
    const myMesh = carMeshes[myUsername];
    if(myMesh) myMesh.userData.driverUsername = null;
  });
}

const _carSocketPoll = setInterval(() => {
  if(socket && mySocketId){ setupCarSocketEvents(); clearInterval(_carSocketPoll); }
}, 650);

// ── INDEPENDENT CAR LOOP ──
{
  let _carLastMs = performance.now();
  (function _carFrame(){
    requestAnimationFrame(_carFrame);
    const now = performance.now();
    updateCar(Math.min((now - _carLastMs) / 1000, 0.05));
    _carLastMs = now;
  })();
}