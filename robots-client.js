// ─── robots-client.js ───────────────────────────────────────────────────────
// APLabs Robot System — client side
// Add to main.dev.js bridge block:
//   import('./robots-client.js');
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
const GROUND_Y = 1.7;

// ── STATE ─────────────────────────────────────────────────────────────────────
let myParts    = { head:0, torso:0, bottom:0 };
let myRobots   = [];
const allRobotMeshes = {};
window._allRobotMeshes = allRobotMeshes;
let robotsUIOpen = false;
let assemblyUIOpen = false;
let pendingEnhancement = null;
let robotsBuilt = 0;
let maxRobotSlots = 3;
let pendingDesign = {
  headShape:   'box',
  torsoShape:  'box',
  bottomShape: 'feet',
  headColor:   '#4488FF',
  torsoColor:  '#2255CC',
  bottomColor: '#113388',
  name:        '',
};

// ── FOLLOW CONFIG ─────────────────────────────────────────────────────────────
const FOLLOW_DIST   = 5.0;  // further behind player
const FOLLOW_SPEED  = 3.5;
const FOLLOW_SPREAD = 1.8;

// Track last player position to only follow on actual movement
let lastPlayerX = 0, lastPlayerZ = 0;

// ── ROBOT MESH BUILDER ────────────────────────────────────────────────────────
function hexToInt(hex) {
  return parseInt(hex.replace('#',''), 16);
}

function buildRobotMesh(design, ownerName) {
  const g = new THREE.Group();

  const hc = hexToInt(design.headColor   || '#4488FF');
  const tc = hexToInt(design.torsoColor  || '#2255CC');
  const bc = hexToInt(design.bottomColor || '#113388');
  const hMat = new THREE.MeshLambertMaterial({ color: hc });
  const tMat = new THREE.MeshLambertMaterial({ color: tc });
  const bMat = new THREE.MeshLambertMaterial({ color: bc });
  const eyeMat  = new THREE.MeshBasicMaterial({ color: 0x00FFFF });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const goldMat = new THREE.MeshLambertMaterial({ color: 0xFFD700 });

  // ── HEAD ──
  let head;
  switch(design.headShape) {
    case 'dome':
      head = new THREE.Mesh(new THREE.SphereGeometry(0.28,8,7), hMat);
      head.scale.y = 0.85;
      break;
    case 'pyramid':
      head = new THREE.Mesh(new THREE.ConeGeometry(0.28,0.52,4), hMat);
      break;
    default: // box
      head = new THREE.Mesh(new THREE.BoxGeometry(0.48,0.42,0.44), hMat);
  }
  head.position.y = 1.38;
  head.castShadow = true;
  g.add(head);

  // Eyes — always two glowing dots
  [-0.12, 0.12].forEach(ex => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07,6,6), eyeMat);
    eye.position.set(ex, 1.4, 0.2);
    g.add(eye);
    // Gleam
    const gleam = new THREE.Mesh(new THREE.SphereGeometry(0.03,4,4),
      new THREE.MeshBasicMaterial({color:0xFFFFFF}));
    gleam.position.set(ex+0.03, 1.44, 0.26);
    g.add(gleam);
  });

  // Antenna
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.28,5), darkMat);
  ant.position.set(0.1, 1.72, 0);
  g.add(ant);
  const antBall = new THREE.Mesh(new THREE.SphereGeometry(0.06,6,6),
    new THREE.MeshBasicMaterial({color:0xFF4400}));
  antBall.position.set(0.1, 1.88, 0);
  g.add(antBall);

  // ── TORSO ──
  let torso;
  switch(design.torsoShape) {
    case 'round':
      torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.32,0.62,10), tMat);
      break;
    case 'diamond': {
      torso = new THREE.Mesh(new THREE.BoxGeometry(0.52,0.6,0.42), tMat);
      torso.rotation.y = Math.PI/4;
      break;
    }
    default: // box
      torso = new THREE.Mesh(new THREE.BoxGeometry(0.52,0.62,0.42), tMat);
  }
  torso.position.y = 0.88;
  torso.castShadow = true;
  g.add(torso);

  // Chest panel detail
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.22,0.06),
    new THREE.MeshLambertMaterial({color:0x001133}));
  panel.position.set(0, 0.94, 0.22);
  g.add(panel);
  // Panel light
  const pLight = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.08,0.05),
    new THREE.MeshBasicMaterial({color:0x00FF88}));
  pLight.position.set(0, 0.94, 0.25);
  g.add(pLight);

  // Arms
  [-0.38, 0.38].forEach(ax => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14,0.44,0.14), tMat);
    arm.position.set(ax, 0.82, 0);
    arm.castShadow = true;
    g.add(arm);
    // Hand
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1,6,6), darkMat);
    hand.position.set(ax, 0.56, 0);
    g.add(hand);
  });

  // ── NAME PLATE on torso back ──
  const plateMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.05), plateMat);
  plate.position.set(0, 0.76, -0.24);
  g.add(plate);
  // Gold trim
  const plateTrim = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.05), goldMat);
  plateTrim.position.set(0, 0.85, -0.245);
  g.add(plateTrim);

  // ── BOTTOM ──
  switch(design.bottomShape) {
    case 'crawler': {
      // Wide flat body with 4 wheel pods
      const crawlBody = new THREE.Mesh(new THREE.BoxGeometry(0.7,0.2,0.55), bMat);
      crawlBody.position.y = 0.22;
      crawlBody.castShadow = true;
      g.add(crawlBody);
      [[-0.28,0.2,0.28],[0.28,0.2,0.28],[-0.28,0.2,-0.28],[0.28,0.2,-0.28]].forEach(([wx,wy,wz]) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.14,0.12,8), darkMat);
        wheel.rotation.z = Math.PI/2;
        wheel.position.set(wx, wy, wz);
        g.add(wheel);
      });
      break;
    }
    case 'spider': {
      // Central hub + 4 thin jointed legs
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.2,0.22,8), bMat);
      hub.position.y = 0.3;
      g.add(hub);
      [[-0.45,0.18,0.35],[0.45,0.18,0.35],[-0.45,0.18,-0.35],[0.45,0.18,-0.35]].forEach(([lx,ly,lz]) => {
        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.28,0.08), bMat);
        upper.position.set(lx*0.55, ly+0.1, lz*0.55);
        upper.rotation.z = lx < 0 ? 0.5 : -0.5;
        g.add(upper);
        const lower = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.26,0.06), darkMat);
        lower.position.set(lx, ly-0.08, lz);
        lower.rotation.z = lx < 0 ? -0.3 : 0.3;
        g.add(lower);
      });
      break;
    }
    default: { // feet — two blocky legs
      [-0.14, 0.14].forEach(lx => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18,0.44,0.2), bMat);
        leg.position.set(lx, 0.28, 0);
        leg.castShadow = true;
        g.add(leg);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.2,0.1,0.3), darkMat);
        foot.position.set(lx, 0.05, 0.06);
        g.add(foot);
      });
    }
  }

  return g;
}

// ── FLOATING NAME TAG ──────────────────────────────────────────────────────────
function makeRobotNameTag(robotName, ownerName) {
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed;background:rgba(0,20,60,0.82);color:#00FFCC;
    font-family:monospace;font-size:11px;font-weight:bold;
    padding:3px 10px;border-radius:8px;pointer-events:none;
    display:none;z-index:120;transform:translate(-50%,-100%);
    white-space:nowrap;border:1px solid rgba(0,255,200,0.3);
  `;
  el.textContent = `🤖 ${robotName}`;
  document.body.appendChild(el);
  return el;
}

// ── SPAWN / UPDATE ROBOT MESH IN WORLD ────────────────────────────────────────
function getOrCreateRobotMesh(robot, ownerName) {
  if (allRobotMeshes[robot.id]) return allRobotMeshes[robot.id];
  const group   = buildRobotMesh(robot.design, ownerName);
  const nameTag = makeRobotNameTag(robot.name, ownerName);
  group.position.set(robot.x || 0, 0, robot.z || 0);
  S().add(group);
  allRobotMeshes[robot.id] = {
    group, nameTag,
    robot,
    ownerName,
    targetX: robot.x || 0,
    targetZ: robot.z || 0,
    bobTime: Math.random()*Math.PI*2,
    legPhase: 0,
  };
  return allRobotMeshes[robot.id];
}

function removeRobotMesh(robotId) {
  const rm = allRobotMeshes[robotId];
  if (!rm) return;
  S().remove(rm.group);
  rm.nameTag.remove();
  delete allRobotMeshes[robotId];
}

// ── PROJECT WORLD POS TO SCREEN ───────────────────────────────────────────────
function projectToScreen(worldPos) {
  const cam = CAM(); if (!cam) return { x:0, y:0, visible:false };
  const v = worldPos.clone().project(cam);
  return {
    x: (v.x*0.5+0.5)*window.innerWidth,
    y: (-v.y*0.5+0.5)*window.innerHeight,
    visible: v.z < 1,
  };
}

// ── MY ROBOT FOLLOW LOGIC ─────────────────────────────────────────────────────
let robotSyncTimer = 0;

function updateMyRobots(delta, totalTime) {
  const cam = CAM(); if (!cam) return;
  const activeRobots = myRobots.filter(r => r.active);

  activeRobots.forEach((robot, idx) => {
    const rm = allRobotMeshes[robot.id];
    if (!rm) return;

    // If staying -- just bob in place, no follow
    if (robot.task === 'stay') {
      rm.bobTime += delta * 1.2;
      rm.group.position.y = Math.sin(rm.bobTime) * 0.05;
      return;
    }

    // If tasked — server drives position, just lerp to broadcast position
    if (robot.task && robot.task !== 'idle' && robot.task !== 'stay') {
      if (rm.targetX !== undefined) {
        rm.group.position.x += (rm.targetX - rm.group.position.x) * Math.min(1, 6*delta);
        rm.group.position.z += (rm.targetZ - rm.group.position.z) * Math.min(1, 6*delta);
        const dx = (rm.targetX||0) - rm.group.position.x;
        const dz = (rm.targetZ||0) - rm.group.position.z;
        if (Math.abs(dx)>0.1||Math.abs(dz)>0.1) {
          const targetAngle = Math.atan2(dx, dz);
          rm.group.rotation.y += (targetAngle - rm.group.rotation.y) * 0.15;
        }
      }
      if (robot.task === 'partying') {
        // Big goofy dance — spin + exaggerated bob
        rm.bobTime += delta * 4;
        rm.group.position.y = Math.abs(Math.sin(rm.bobTime)) * 0.4;
        rm.group.rotation.y += delta * 2.5;
      } else {
        rm.bobTime += delta * 2.5;
        rm.group.position.y = Math.sin(rm.bobTime) * 0.08;
      }
      return;
    }

    // Only update follow target when player actually moves (not just looks around)
    const movedX = Math.abs(cam.position.x - lastPlayerX);
    const movedZ = Math.abs(cam.position.z - lastPlayerZ);
    if (movedX > 0.05 || movedZ > 0.05) {
      lastPlayerX = cam.position.x;
      lastPlayerZ = cam.position.z;
      const forward = new THREE.Vector3();
      cam.getWorldDirection(forward);
      const spread = (idx - (activeRobots.length-1)/2) * FOLLOW_SPREAD;
      rm.targetX = cam.position.x - forward.x * FOLLOW_DIST + (-forward.z) * spread;
      rm.targetZ = cam.position.z - forward.z * FOLLOW_DIST + (forward.x) * spread;
    }

    rm.targetX = rm.targetX ?? cam.position.x;
    rm.targetZ = rm.targetZ ?? cam.position.z;

    // Smooth follow
    rm.group.position.x += (rm.targetX - rm.group.position.x) * Math.min(1, FOLLOW_SPEED * delta);
    rm.group.position.z += (rm.targetZ - rm.group.position.z) * Math.min(1, FOLLOW_SPEED * delta);

    // Face toward player
    const dx = cam.position.x - rm.group.position.x;
    const dz = cam.position.z - rm.group.position.z;
    if (Math.abs(dx) > 0.1 || Math.abs(dz) > 0.1) {
      const targetAngle = Math.atan2(dx, dz);
      rm.group.rotation.y += (targetAngle - rm.group.rotation.y) * 0.12;
    }

    // Bob + leg animation
    rm.bobTime += delta * 1.4;
    rm.group.position.y = Math.sin(rm.bobTime) * 0.06;

    // Animate legs based on movement
    const moveDist = Math.sqrt(dx*dx + dz*dz);
    if (moveDist > 0.5) {
      rm.legPhase += delta * 5;
      animateRobotLegs(rm, totalTime);
    }

    // Update robot position in local data
    robot.x = rm.group.position.x;
    robot.z = rm.group.position.z;
  });

  // Only sync position for idle (following) robots — server drives tasked bots
  robotSyncTimer += delta;
  if (robotSyncTimer > 0.1) {
    robotSyncTimer = 0;
    activeRobots.filter(r => !r.task || r.task === 'idle').forEach(robot => {
      SKT()?.emit('robots:move', {
        robotId: robot.id,
        x: robot.x,
        z: robot.z,
      });
    });
  }
}

function animateRobotLegs(rm, totalTime) {
  const children = rm.group.children;
  // Find leg meshes by position (y < 0.5) and animate
  children.forEach(child => {
    if (child.position.y < 0.5 && child.position.y > 0) {
      if (child.position.x < 0) {
        child.rotation.x = Math.sin(rm.legPhase) * 0.3;
      } else {
        child.rotation.x = Math.sin(rm.legPhase + Math.PI) * 0.3;
      }
    }
  });
}

// ── UPDATE ALL REMOTE ROBOTS ──────────────────────────────────────────────────
function updateAllRobots(delta, totalTime) {
  Object.values(allRobotMeshes).forEach(rm => {
    // Name tag
    const wp = rm.group.position.clone().add(new THREE.Vector3(0, 2.2, 0));
    const s  = projectToScreen(wp);
    const cam = CAM();
    if (window._inStation||window._inSanctum||window._ddsActive) { rm.nameTag.style.display="none"; return; }
    if (!cam) return;
    const dx = cam.position.x - rm.group.position.x;
    const dz = cam.position.z - rm.group.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);

    if (s.visible && dist < 25) {
      rm.nameTag.style.left    = s.x + 'px';
      rm.nameTag.style.top     = (s.y - 4) + 'px';
      rm.nameTag.style.display = 'block';
      rm.nameTag.style.opacity = dist < 15 ? '1' : String(1-(dist-15)/10);
    } else {
      rm.nameTag.style.display = 'none';
    }

    // Bob
    rm.bobTime = (rm.bobTime||0) + delta * 1.2;
    rm.group.position.y = Math.sin(rm.bobTime) * 0.05;

    // Panel light pulse
    const pLight = rm.group.children.find(c =>
      c.material?.color && c.material.color.getHex() === 0x00FF88);
    if (pLight) {
      pLight.material.opacity = 0.6 + Math.sin(totalTime*3 + rm.bobTime)*0.4;
      pLight.material.transparent = true;
    }
  });
}

// ── ASSEMBLY UI ───────────────────────────────────────────────────────────────
const assemblyOverlay = document.createElement('div');
assemblyOverlay.style.cssText = `
  position:fixed;inset:0;background:rgba(0,5,20,0.97);color:white;
  font-family:'Segoe UI',sans-serif;z-index:350;display:none;
  align-items:center;justify-content:center;overflow-y:auto;
`;
document.body.appendChild(assemblyOverlay);

// Live 3D preview canvas
const previewCanvas = document.createElement('canvas');
previewCanvas.width  = 160;
previewCanvas.height = 160;
previewCanvas.style.cssText = `border-radius:12px;border:1px solid rgba(0,255,200,0.2);
  background:#020814;display:block;margin:0 auto 12px;`;

let previewRenderer = null;
let previewScene    = null;
let previewCamera   = null;
let previewRobot    = null;
let previewAnimId   = null;

function initPreview() {
  if (previewRenderer) return;
  previewRenderer = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias:true, alpha:true });
  previewRenderer.setSize(160, 160);
  previewRenderer.setClearColor(0x020814, 1);
  previewScene  = new THREE.Scene();
  previewCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  previewCamera.position.set(0, 1.5, 3.5);
  previewCamera.lookAt(0, 1, 0);
  previewScene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dl = new THREE.DirectionalLight(0xffffff, 1.2);
  dl.position.set(3, 5, 3); previewScene.add(dl);
  const pl = new THREE.PointLight(0x0088FF, 0.5, 8);
  pl.position.set(-2, 2, 1); previewScene.add(pl);
}

function updatePreview() {
  if (!previewRenderer) initPreview();
  if (previewRobot) previewScene.remove(previewRobot);
  previewRobot = buildRobotMesh(pendingDesign, USR());
  previewScene.add(previewRobot);
  if (previewAnimId) cancelAnimationFrame(previewAnimId);
  let t = 0;
  function spin() {
    previewAnimId = requestAnimationFrame(spin);
    t += 0.02;
    if (previewRobot) previewRobot.rotation.y = t;
    previewRenderer.render(previewScene, previewCamera);
  }
  spin();
}

function renderAssemblyUI() {
  if (!assemblyUIOpen) return;
  const hasAll = myParts.head >= 1 && myParts.torso >= 1 && myParts.bottom >= 1;

  assemblyOverlay.innerHTML = `
    <div style="max-width:480px;width:100%;padding:22px;box-sizing:border-box;">
      <div style="text-align:center;margin-bottom:14px;">
        <div style="font-size:1.8rem;font-weight:bold;color:#00FFCC;">🤖 Assembly Bay</div>
        <div style="opacity:0.45;font-size:0.8rem;margin-top:4px;">Build your robot</div>
      </div>

      <!-- Preview -->
      <div id="previewMount" style="margin-bottom:16px;"></div>

      <!-- Parts inventory -->
      <div style="display:flex;gap:8px;justify-content:center;margin-bottom:18px;">
        ${['head','torso','bottom'].map(p => `
          <div style="background:${myParts[p]>0?'rgba(0,255,200,0.1)':'rgba(255,0,0,0.08)'};
            border:1px solid ${myParts[p]>0?'rgba(0,255,200,0.35)':'rgba(255,100,100,0.3)'};
            border-radius:10px;padding:10px 14px;text-align:center;flex:1;">
            <div style="font-size:1.2rem;">${p==='head'?'🦾':p==='torso'?'🫀':'🦵'}</div>
            <div style="font-size:0.8rem;opacity:0.6;margin-top:2px;">${p}</div>
            <div style="font-weight:bold;color:${myParts[p]>0?'#00FFCC':'#FF6644'};">
              ${myParts[p]} stored</div>
          </div>`).join('')}
      </div>

      <!-- Robot name -->
      <div style="margin-bottom:14px;">
        <div style="font-size:0.8rem;opacity:0.5;margin-bottom:5px;">Robot name</div>
        <input id="robotName" maxlength="20"
          value="${pendingDesign.name || USR()+'Bot'}"
          placeholder="${USR()}'s Bot"
          style="width:100%;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.2);
          color:white;padding:10px 12px;border-radius:10px;font-size:14px;
          box-sizing:border-box;outline:none;font-family:inherit;"
        />
      </div>

      <!-- Shape pickers -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px;">

        <!-- Head shape -->
        <div>
          <div style="font-size:0.75rem;opacity:0.5;margin-bottom:5px;text-align:center;">Head</div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            ${['box','dome','pyramid'].map(s=>`
              <button onclick="window.rbSetShape('head','${s}')"
                style="background:${pendingDesign.headShape===s?'rgba(0,255,200,0.2)':'rgba(255,255,255,0.05)'};
                border:1px solid ${pendingDesign.headShape===s?'#00FFCC':'rgba(255,255,255,0.12)'};
                color:white;border-radius:7px;padding:6px 4px;cursor:pointer;font-size:12px;">
                ${s==='box'?'□ Box':s==='dome'?'◯ Dome':'△ Cone'}
              </button>`).join('')}
          </div>
        </div>

        <!-- Torso shape -->
        <div>
          <div style="font-size:0.75rem;opacity:0.5;margin-bottom:5px;text-align:center;">Torso</div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            ${['box','round','diamond'].map(s=>`
              <button onclick="window.rbSetShape('torso','${s}')"
                style="background:${pendingDesign.torsoShape===s?'rgba(0,255,200,0.2)':'rgba(255,255,255,0.05)'};
                border:1px solid ${pendingDesign.torsoShape===s?'#00FFCC':'rgba(255,255,255,0.12)'};
                color:white;border-radius:7px;padding:6px 4px;cursor:pointer;font-size:12px;">
                ${s==='box'?'□ Box':s==='round'?'○ Round':'◇ Diamond'}
              </button>`).join('')}
          </div>
        </div>

        <!-- Bottom shape -->
        <div>
          <div style="font-size:0.75rem;opacity:0.5;margin-bottom:5px;text-align:center;">Bottom</div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            ${['feet','crawler','spider'].map(s=>`
              <button onclick="window.rbSetShape('bottom','${s}')"
                style="background:${pendingDesign.bottomShape===s?'rgba(0,255,200,0.2)':'rgba(255,255,255,0.05)'};
                border:1px solid ${pendingDesign.bottomShape===s?'#00FFCC':'rgba(255,255,255,0.12)'};
                color:white;border-radius:7px;padding:6px 4px;cursor:pointer;font-size:12px;">
                ${s==='feet'?'🦶 Feet':s==='crawler'?'🚗 Crawler':'🕷 Spider'}
              </button>`).join('')}
          </div>
        </div>
      </div>

      <!-- Color pickers -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:18px;">
        ${[['head','Head'],['torso','Torso'],['bottom','Bottom']].map(([part,label])=>`
          <div style="text-align:center;">
            <div style="font-size:0.75rem;opacity:0.5;margin-bottom:4px;">${label}</div>
            <input type="color" value="${pendingDesign[part+'Color']}"
              oninput="window.rbSetColor('${part}',this.value)"
              style="width:100%;height:34px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);
              cursor:pointer;background:none;padding:2px;">
          </div>`).join('')}
      </div>

      <!-- Enhancement selection — unlocks after 5 robots built -->
      ${robotsBuilt >= 5 ? `
        <div style="background:rgba(255,200,0,0.06);border:1px solid rgba(255,200,0,0.2);
          border-radius:12px;padding:14px;margin-bottom:14px;">
          <div style="font-size:0.85rem;font-weight:bold;margin-bottom:10px;color:#FFD700;">
            ✨ Enhanced Crafting
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${[
              ['standard','Standard','No enhancement — just the part','free','rgba(255,255,255,0.05)','rgba(255,255,255,0.15)'],
              ['enhanced','Enhanced','40% chance at a passive — 500 SB','500 SB','rgba(0,200,255,0.08)','rgba(0,200,255,0.4)'],
              ['premium','Premium','80% chance, better rarity — 2,000 SB','2,000 SB','rgba(255,200,0,0.1)','rgba(255,200,0,0.5)'],
            ].map(([val,label,desc,cost,bg,border])=>`
              <div onclick="window.rbSetEnhancement('${val}')"
                style="background:${pendingEnhancement===val?bg.replace('0.08','0.18').replace('0.1','0.2').replace('0.05','0.12'):bg};
                border:1px solid ${pendingEnhancement===val?border:'rgba(255,255,255,0.1)'};
                border-radius:8px;padding:10px 12px;cursor:pointer;
                display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <div style="font-size:0.85rem;font-weight:bold;
                    color:${pendingEnhancement===val?'#FFD700':'white'};">
                    ${pendingEnhancement===val?'✓ ':''} ${label}
                  </div>
                  <div style="opacity:0.5;font-size:0.72rem;">${desc}</div>
                </div>
                <div style="font-size:0.78rem;opacity:0.6;white-space:nowrap;">${cost}</div>
              </div>`).join('')}
          </div>
        </div>` : robotsBuilt >= 3 ? `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);
          border-radius:10px;padding:10px 14px;margin-bottom:14px;text-align:center;
          opacity:0.5;font-size:0.78rem;">
          🔒 Enhanced Crafting unlocks at 5 robots built (${robotsBuilt}/5)
        </div>` : ''}

      <!-- Build button -->
      <button onclick="window.rbBuild()"
        ${!hasAll?'disabled':''}
        style="width:100%;background:${hasAll?'#0044CC':'#333'};color:white;border:none;
        border-radius:12px;padding:14px;font-size:15px;font-weight:bold;cursor:${hasAll?'pointer':'not-allowed'};
        margin-bottom:10px;opacity:${hasAll?'1':'0.45'};">
        ${hasAll?'⚙️ Assemble Robot!':'Need 1 of each part first'}
      </button>

      ${myRobots.some(r=>r.isWreckage) ? `
        <button onclick="window.rbRebuild()"
          style="width:100%;background:rgba(255,68,0,0.2);color:#FF6622;
          border:2px solid rgba(255,68,0,0.5);border-radius:12px;padding:14px;
          font-size:15px;font-weight:bold;cursor:pointer;margin-bottom:10px;">
          🔥 Rebuild ${myRobots.find(r=>r.isWreckage)?.name} — 20 bars
        </button>` : ''}

      <button onclick="window.rbClose()"
        style="width:100%;background:rgba(255,255,255,0.07);color:white;
        border:1px solid rgba(255,255,255,0.15);border-radius:10px;
        padding:10px;cursor:pointer;font-size:13px;">
        Close
      </button>
    </div>
  `;

  // Mount preview canvas
  const mount = document.getElementById('previewMount');
  if (mount) {
    mount.appendChild(previewCanvas);
    setTimeout(updatePreview, 50);
  }
}

// ── ROBOTS MANAGEMENT UI ──────────────────────────────────────────────────────
const robotsOverlay = document.createElement('div');
robotsOverlay.style.cssText = `
  position:fixed;inset:0;background:rgba(0,5,20,0.96);color:white;
  font-family:'Segoe UI',sans-serif;z-index:350;display:none;
  align-items:center;justify-content:center;overflow-y:auto;
`;
document.body.appendChild(robotsOverlay);

function renderRobotsUI() {
  const active   = myRobots.filter(r => r.active);
  const inactive = myRobots.filter(r => !r.active);

  function statusBadge(robot) {
    if (!robot.task || robot.task === 'idle') {
      return `<span style="background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.5);
        border-radius:6px;padding:2px 8px;font-size:0.72rem;">💤 Idle</span>`;
    }
    if (robot.task === 'finance') {
      const warn = robot.taskState === 'waiting_for_funds';
      return `<span style="background:rgba(255,215,0,0.15);color:${warn?'#FF8800':'#FFD700'};
        border-radius:6px;padding:2px 8px;font-size:0.72rem;">
        💼 ${warn ? '⚠️ Needs funds' : 'Trading'} · ${robot.financePool||0} SB pool</span>`;
    }
    if (robot.task === 'partying') {
      return `<span style="background:rgba(255,50,150,0.2);color:#FF88CC;
        border-radius:6px;padding:2px 8px;font-size:0.72rem;animation:pulse 1s infinite;">
        🎉 ON STRIKE — empty the box!</span>`;
    }
    const stateLabels = {
      walking_to_mine: '🚶 Walking to mine',
      mining:          '⛏️ Mining',
      waiting_for_node:'⏳ Waiting for node',
      walking_to_box:  '🚶 Heading to box',
      depositing:      '📦 Depositing ore',
    };
    const label = stateLabels[robot.taskState] || `🔧 ${robot.task}`;
    return `<span style="background:rgba(255,153,68,0.2);color:#FF9944;
      border-radius:6px;padding:2px 8px;font-size:0.72rem;">${label}</span>`;
  }

  const scrollEl = robotsOverlay.querySelector('div');
  const scrollTop = scrollEl?.scrollTop || 0;

  robotsOverlay.innerHTML = `
    <div style="max-width:500px;width:100%;padding:22px;box-sizing:border-box;max-height:90vh;overflow-y:auto;">
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:1.8rem;font-weight:bold;color:#00FFCC;">🤖 My Robots</div>
        <div style="opacity:0.45;font-size:0.8rem;">${active.length}/${maxRobotSlots} active</div>
      </div>

      ${myRobots.length === 0 ? `
        <div style="text-align:center;opacity:0.4;padding:32px 0;">
          No robots yet. Craft parts at the Anvil<br>then assemble in the Assembly Bay.
        </div>` : ''}

      ${myRobots.map(robot => {
        const isTasked = robot.task && robot.task !== 'idle';
        const bagSize  = robot.botBagSize || 3;
        const speed    = robot.botSpeed   || 0.5;
        return `
        <div style="background:rgba(255,255,255,0.05);border:1px solid
          ${robot.active?'rgba(0,255,200,0.25)':'rgba(255,255,255,0.08)'};
          border-radius:12px;padding:14px;margin-bottom:10px;">

          <!-- Header row -->
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="font-size:1.6rem;">🤖</div>
            <div style="flex:1;">
              <div style="font-weight:bold;font-size:0.95rem;">${robot.name}</div>
              <div style="opacity:0.4;font-size:0.72rem;">
                ${robot.design.headShape} · ${robot.design.torsoShape} · ${robot.design.bottomShape}
                &nbsp;|&nbsp; ⚡${speed}x &nbsp;|&nbsp; 🎒${bagSize}
              </div>
              ${robot.passive ? `<div style="margin-top:3px;">
                <span style="background:${
                  robot.passive.rarity==='legendary'?'rgba(255,200,0,0.2)':
                  robot.passive.rarity==='rare'?'rgba(0,100,255,0.2)':
                  robot.passive.rarity==='bad'?'rgba(255,0,0,0.2)':'rgba(100,200,100,0.2)'};
                  color:${
                  robot.passive.rarity==='legendary'?'#FFD700':
                  robot.passive.rarity==='rare'?'#88AAFF':
                  robot.passive.rarity==='bad'?'#FF6666':'#88FF88'};
                  border-radius:5px;padding:1px 7px;font-size:0.7rem;font-weight:bold;">
                  ${robot.passive.good?'✨':'💀'} ${robot.passive.name}
                </span></div>` : ''}
              ${robot.deaths > 0 ? `<div style="margin-top:3px;">
                <span style="background:rgba(255,50,0,0.2);color:#FF6622;
                  border-radius:5px;padding:1px 7px;font-size:0.7rem;font-weight:bold;">
                  🔥 REBORN x${robot.deaths}
                </span></div>` : ''}
              ${robot.isWreckage ? `<div style="margin-top:3px;">
                <span style="background:rgba(100,100,100,0.2);color:#AAAAAA;
                  border-radius:5px;padding:1px 7px;font-size:0.7rem;font-weight:bold;">
                  💀 Awaiting Rebuild
                </span></div>` : ''}
              <!-- Durability bar -->
              ${!robot.isWreckage ? (() => {
                const dur = robot.durability ?? 100;
                const col = dur > 60 ? '#44FF88' : dur > 30 ? '#FFD700' : '#FF4444';
                return `<div style="margin-top:5px;">
                  <div style="display:flex;justify-content:space-between;font-size:0.68rem;opacity:0.5;margin-bottom:2px;">
                    <span>🛡️ Durability</span><span style="color:${col}">${dur}/100</span>
                  </div>
                  <div style="background:rgba(255,255,255,0.08);border-radius:4px;height:5px;overflow:hidden;">
                    <div style="background:${col};height:100%;width:${dur}%;border-radius:4px;"></div>
                  </div>
                </div>`;
              })() : ''}
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              <span style="width:16px;height:16px;border-radius:3px;display:inline-block;
                background:${robot.design.headColor};border:1px solid rgba(255,255,255,0.2);"></span>
              <span style="width:16px;height:16px;border-radius:3px;display:inline-block;
                background:${robot.design.torsoColor};border:1px solid rgba(255,255,255,0.2);"></span>
              <span style="width:16px;height:16px;border-radius:3px;display:inline-block;
                background:${robot.design.bottomColor};border:1px solid rgba(255,255,255,0.2);"></span>
            </div>
          </div>

          <!-- Status -->
          <div style="margin-bottom:10px;">
            ${statusBadge(robot)}
            ${isTasked ? `<span style="opacity:0.4;font-size:0.72rem;margin-left:6px;">
              Ore: ${robot.botOre||0}/${bagSize}
            </span>` : ''}
          </div>

          <!-- Action buttons -->
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${robot.active ? `
              ${isTasked
                ? `<button onclick="window.rbRecall('${robot.id}')"
                    style="background:rgba(255,50,50,0.2);color:#FF6666;
                    border:1px solid rgba(255,50,50,0.3);border-radius:8px;
                    padding:6px 12px;cursor:pointer;font-size:12px;font-weight:bold;">
                    🏃 Recall
                  </button>`
                : `<button onclick="window.rbQuickAssign('${robot.id}','mining')"
                    style="background:rgba(255,153,68,0.15);color:#FF9944;
                    border:1px solid rgba(255,153,68,0.3);border-radius:8px;
                    padding:6px 10px;cursor:pointer;font-size:11px;font-weight:bold;">
                    ⛏️ Mine
                  </button>
                  <button onclick="window.rbQuickAssign('${robot.id}','smelting')"
                    style="background:rgba(255,80,0,0.15);color:#FF6622;
                    border:1px solid rgba(255,80,0,0.3);border-radius:8px;
                    padding:6px 10px;cursor:pointer;font-size:11px;font-weight:bold;">
                    🔥 Smelt
                  </button>
                  <button onclick="window.rbQuickAssign('${robot.id}','slots')"
                    style="background:rgba(150,0,255,0.15);color:#CC88FF;
                    border:1px solid rgba(150,0,255,0.3);border-radius:8px;
                    padding:6px 10px;cursor:pointer;font-size:11px;font-weight:bold;">
                    🎰 Slots
                  </button>
                  ${robotsBuilt >= 25 ? `
                  <button onclick="window.rbOpenFinance('${robot.id}')"
                    style="background:rgba(255,215,0,0.15);color:#FFD700;
                    border:1px solid rgba(255,215,0,0.3);border-radius:8px;
                    padding:6px 10px;cursor:pointer;font-size:11px;font-weight:bold;">
                    💼 Finance
                  </button>` : ''}`
              }
              <button onclick="window.rbToggle('${robot.id}', true)"
                style="background:rgba(255,255,255,0.08);color:white;
                border:1px solid rgba(255,255,255,0.15);border-radius:8px;
                padding:6px 12px;cursor:pointer;font-size:12px;">
                Dismiss
              </button>
            ` : `
              <button onclick="window.rbToggle('${robot.id}', false)"
                style="background:rgba(0,200,100,0.15);color:#44FF88;
                border:1px solid rgba(0,200,100,0.3);border-radius:8px;
                padding:6px 12px;cursor:pointer;font-size:12px;font-weight:bold;">
                Summon
              </button>
            `}
          </div>
        </div>`;
      }).join('')}

      <button onclick="window.rbClose()"
        style="width:100%;background:rgba(255,255,255,0.07);color:white;
        border:1px solid rgba(255,255,255,0.15);border-radius:10px;
        padding:10px;cursor:pointer;font-size:13px;margin-top:6px;">
        Close
      </button>
    </div>
  `;
  // Restore scroll position
  const newScrollEl = robotsOverlay.querySelector('div');
  if (newScrollEl && scrollTop) newScrollEl.scrollTop = scrollTop;
}

// ── WINDOW ACTIONS ────────────────────────────────────────────────────────────
window.rbSetShape = (part, shape) => {
  pendingDesign[part+'Shape'] = shape;
  renderAssemblyUI();
  setTimeout(updatePreview, 30);
};
window.rbSetColor = (part, color) => {
  pendingDesign[part+'Color'] = color;
  setTimeout(updatePreview, 30);
};
window.rbSetEnhancement = (val) => {
  pendingEnhancement = val;
  renderAssemblyUI();
};

window.rbRebuild = () => {
  SKT()?.emit('battle:rebuild');
  window.rbClose();
};

window.rbBuild = () => {
  const nameEl = document.getElementById('robotName');
  pendingDesign.name = nameEl?.value.trim() || `${USR()}'s Bot`;
  const enhancement = pendingEnhancement || 'standard';
  SKT()?.emit('robots:assemble', { design: pendingDesign, enhancement });
  window.rbClose();
};
window.rbToggle = (robotId, isActive) => {
  if (isActive) SKT()?.emit('robots:deactivate', { robotId });
  else SKT()?.emit('robots:activate', { robotId });
  robotsOverlay.style.display = 'none';
  robotsUIOpen = false;
};
window.rbClose = () => {
  assemblyOverlay.style.display = 'none';
  robotsOverlay.style.display   = 'none';
  assemblyUIOpen = false;
  robotsUIOpen   = false;
  if (previewAnimId) { cancelAnimationFrame(previewAnimId); previewAnimId = null; }
};

// ── OPEN ASSEMBLY FROM WORKSHOP ───────────────────────────────────────────────
window.openAssemblyBay = () => {
  assemblyUIOpen = true;
  assemblyOverlay.style.display = 'flex';
  pendingDesign.name = `${USR()}'s Bot`;
  if (document.pointerLockElement) document.exitPointerLock();
  renderAssemblyUI();
};

// Expose so workshop-client can call it
window._openAssemblyBay = window.openAssemblyBay;

// ── ROBOTS MENU BUTTON (bottom bar) ──────────────────────────────────────────
const robotsBtn = document.createElement('div');
robotsBtn.innerHTML = '🤖';
robotsBtn.id = 'robotsBtn';
robotsBtn.title = 'My Robots';
robotsBtn.style.cssText = `position:fixed;bottom:20px;left:160px;width:48px;height:48px;
  background:rgba(0,0,0,0.45);border:2px solid rgba(0,255,200,0.3);border-radius:14px;
  font-size:22px;display:none;align-items:center;justify-content:center;
  cursor:pointer;z-index:100;user-select:none;box-shadow:0 0 10px rgba(0,255,200,0.15);`;
robotsBtn.addEventListener('click', () => {
  robotsUIOpen = true;
  robotsOverlay.style.display = 'flex';
  if (document.pointerLockElement) document.exitPointerLock();
  renderRobotsUI();
});
document.body.appendChild(robotsBtn);

// ── CRAFT PARTS UI (added to workshop anvil section) ──────────────────────────
// workshop-client.js will call window._rbCraftPart to trigger crafting
window._rbCraftPart = (part) => {
  const skt = SKT();
  if (!skt) { NOTIFY('Connect to multiplayer first!'); return; }

  // Prevent double-click — disable all part buttons briefly
  document.querySelectorAll('[data-rbpart]').forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
  });
  setTimeout(() => {
    document.querySelectorAll('[data-rbpart]').forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '';
    });
  }, 2000);

  skt.emit('robots:craftPart', { part });
  NOTIFY(`⚙️ Crafting ${part}...`);
};

// ── SOCKET EVENTS ─────────────────────────────────────────────────────────────
function setupSocketEvents() {
  const skt = SKT(); if (!skt) return;

  skt.on('robots:state', data => {
    myParts  = data.parts  || { head:0, torso:0, bottom:0 };
    myRobots = data.robots || [];
    robotsBuilt = data.robotsBuilt || 0;
    maxRobotSlots = data.maxRobots || 3;
    window._myRobotParts = myParts;
    // Sync task state on each robot
    myRobots.forEach(robot => {
      const rm = allRobotMeshes[robot.id];
      if (rm) rm.robot = robot;
    });

    robotsBtn.style.display = (myRobots.length > 0 && !window._inStation && !window._inSanctum && window._playerZone !== 'space') ? 'flex' : 'none';
    robotsBtn.style.display = myRobots.length > 0 ? 'flex' : 'none';

    // Spawn meshes for active robots
    myRobots.filter(r => r.active).forEach(robot => {
      getOrCreateRobotMesh(robot, USR());
    });
    // Remove meshes for inactive
    myRobots.filter(r => !r.active).forEach(robot => {
      if (allRobotMeshes[robot.id]) removeRobotMesh(robot.id);
    });

    // Keep _myRobots mirror in sync for vendor sell tab
    window._myRobots = myRobots;

    if (assemblyUIOpen) renderAssemblyUI();
    if (robotsUIOpen)   renderRobotsUI();

    // Sync mining HUD with updated bars
    if (data.bars !== undefined) window._mineSetInventory?.({ bars: data.bars });
  });

  skt.on('robots:partCrafted', data => {
    myParts = data.parts;
    window._myRobotParts = data.parts;

    // Update bars in mining HUD
    window._mineSetInventory?.({ bars: data.bars });

    // Update workshop header bars immediately
    const headerBars = document.getElementById('wsHeaderBars');
    if (headerBars) headerBars.textContent = `🔶 ${data.bars} bars`;

    // Force workshop UI to re-render with updated bars
    if (window._wsIsOpen?.()) {
      SKT()?.emit('workshop:getState');
    }

    // Big visible flash — unmissable
    const flash = document.createElement('div');
    flash.style.cssText = `
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      background:rgba(0,20,5,0.97);border:3px solid #44FF88;
      border-radius:20px;padding:28px 48px;text-align:center;
      color:white;font-family:sans-serif;z-index:600;pointer-events:none;
      animation:flashPop 0.3s ease-out;
    `;
    const partName = data.part.charAt(0).toUpperCase() + data.part.slice(1);
    flash.innerHTML = `
      <div style="font-size:3rem;margin-bottom:8px;">✅</div>
      <div style="font-size:1.5rem;font-weight:bold;color:#44FF88;">Robot ${partName} Crafted!</div>
      <div style="opacity:0.6;font-size:0.85rem;margin-top:6px;">${data.bars} bars remaining</div>
    `;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 2000);

    if (assemblyUIOpen) renderAssemblyUI();

    // Refresh workshop anvil UI to show green checkmark
    setTimeout(() => {
      if (window._wsIsOpen?.()) window.wsTab?.(window._wsNearStation?.() || 'anvil');
    }, 100);
  });

  // Another player's robots
  skt.on('robots:playerRobots', data => {
    const { username, robots } = data;
    if (username === USR()) return; // handled by robots:state

    // Remove old meshes for this player
    Object.keys(allRobotMeshes).forEach(id => {
      if (allRobotMeshes[id].ownerName === username) removeRobotMesh(id);
    });

    // Spawn new active ones
    robots.forEach(robot => getOrCreateRobotMesh(robot, username));
  });

  // Remote robot moved (also fires for own tasked robots)
  skt.on('robots:moved', data => {
    const rm = allRobotMeshes[data.robotId];
    if (!rm) return;
    rm.targetX = data.x;
    rm.targetZ = data.z;
    // Sync task state for own robots
    if (data.username === USR()) {
      const robot = myRobots.find(r => r.id === data.robotId);
      if (robot && data.tasked) {
        // keep task active
      }
    }
  });

  skt.on('robots:assembled', data => {
    // Avoid duplicate -- robots:state will sync the full list
    if (!myRobots.find(r => r.id === data.robot.id)) {
      myRobots = [...myRobots, data.robot];
    }
    robotsBuilt = data.robotsBuilt || robotsBuilt;
    window._myRobots = myRobots;
    if (!window._inStation && !window._inSanctum && window._playerZone !== 'space') robotsBtn.style.display = 'flex';

    // Unlock notifications
    if (data.robotsBuilt === 5) {
      setTimeout(() => NOTIFY('✨ Advanced Crafting unlocked! Enhanced & Premium builds now available in Assembly Bay!'), 2500);
    } else if (data.robotsBuilt === 10) {
      setTimeout(() => NOTIFY('🤖 Robot Bot unlocked! Assign a bot to build robots automatically!'), 2500);
    }

    if (data.passive) {
      const RARITY_COLORS = {
        common:    { bg:'rgba(100,200,100,0.2)', border:'#88FF88', text:'#88FF88', glow:'0 0 30px rgba(100,255,100,0.5)' },
        rare:      { bg:'rgba(0,100,255,0.2)',   border:'#4488FF', text:'#88AAFF', glow:'0 0 30px rgba(50,100,255,0.6)' },
        legendary: { bg:'rgba(255,150,0,0.2)',   border:'#FFD700', text:'#FFD700', glow:'0 0 40px rgba(255,200,0,0.7)' },
        bad:       { bg:'rgba(200,0,0,0.2)',     border:'#FF4444', text:'#FF6666', glow:'0 0 30px rgba(255,0,0,0.4)' },
      };
      const c = RARITY_COLORS[data.passive.rarity] || RARITY_COLORS.common;

      const reveal = document.createElement('div');
      reveal.style.cssText = `
        position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
        background:rgba(0,5,15,0.97);border:2px solid ${c.border};
        border-radius:20px;padding:32px 48px;text-align:center;color:white;
        font-family:'Segoe UI',sans-serif;z-index:700;pointer-events:none;
        box-shadow:${c.glow};max-width:360px;width:90%;
      `;
      const rarityLabel = data.passive.rarity.toUpperCase();
      const emoji = data.passive.good
        ? (data.passive.rarity==='legendary'?'🌟':data.passive.rarity==='rare'?'💫':'✨')
        : '💀';
      reveal.innerHTML = `
        <div style="font-size:2.5rem;margin-bottom:8px;">${emoji}</div>
        <div style="font-size:0.8rem;letter-spacing:3px;color:${c.text};margin-bottom:6px;">
          ${rarityLabel} PASSIVE
        </div>
        <div style="font-size:1.6rem;font-weight:bold;color:${c.text};margin-bottom:8px;">
          ${data.passive.name}
        </div>
        <div style="opacity:0.65;font-size:0.85rem;margin-bottom:16px;">
          ${data.passive.desc}
        </div>
        <div style="opacity:0.45;font-size:0.75rem;">
          ${data.robot.name} has been assembled
        </div>
      `;
      document.body.appendChild(reveal);

      // Play a little tone
      try {
        const ctx = new (window.AudioContext||window.webkitAudioContext)();
        const freqs = data.passive.good
          ? (data.passive.rarity==='legendary' ? [523,659,784,1047] : [440,554,659])
          : [220,196,165];
        freqs.forEach((f,i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.value = f;
          g.gain.setValueAtTime(0.3, ctx.currentTime + i*0.12);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i*0.12 + 0.5);
          o.connect(g); g.connect(ctx.destination);
          o.start(ctx.currentTime + i*0.12);
          o.stop(ctx.currentTime + i*0.12 + 0.5);
        });
        setTimeout(() => ctx.close(), 2000);
      } catch(e) {}

      setTimeout(() => {
        reveal.style.transition = 'opacity 0.8s';
        reveal.style.opacity = '0';
        setTimeout(() => reveal.remove(), 800);
      }, 4000);
    } else {
      NOTIFY(`🤖 ${data.robot.name} assembled! No passive rolled.`);
    }

    getOrCreateRobotMesh(data.robot, USR());
  });

  skt.on('robots:brokeBotRequest', data => {
    const popup = document.createElement('div');
    popup.style.cssText = `
      position:fixed;top:80px;left:50%;transform:translateX(-50%);
      background:rgba(0,0,20,0.97);border:2px solid #FF8800;border-radius:16px;
      padding:20px 28px;color:white;font-family:'Segoe UI',sans-serif;
      z-index:400;min-width:340px;text-align:center;
      box-shadow:0 0 30px rgba(255,136,0,0.4);
    `;
    popup.innerHTML = `
      <div style="font-size:1.1rem;font-weight:bold;color:#FF8800;margin-bottom:8px;">
        💼 ${data.robotName} is broke
      </div>
      <div style="opacity:0.7;font-size:0.85rem;margin-bottom:14px;line-height:1.6;">
        "${data.message}"
      </div>
      <div style="opacity:0.5;font-size:0.75rem;margin-bottom:14px;">
        Requesting: ${data.amount.toLocaleString()} SB
      </div>
      <div style="display:flex;gap:8px;justify-content:center;">
        <button onclick="
          window._mineGetSocket?.().emit('robots:brokeResponse',{robotId:'${data.robotId}',accept:true});
          this.closest('div[style]').remove();
        " style="background:rgba(0,200,100,0.2);color:#44FF88;
          border:1px solid rgba(0,200,100,0.4);border-radius:8px;
          padding:10px 24px;cursor:pointer;font-weight:bold;">
          ✅ Yes (${data.amount.toLocaleString()} SB)
        </button>
        <button onclick="
          window._mineGetSocket?.().emit('robots:brokeResponse',{robotId:'${data.robotId}',accept:false});
          this.closest('div[style]').remove();
        " style="background:rgba(255,50,50,0.15);color:#FF6666;
          border:1px solid rgba(255,50,50,0.3);border-radius:8px;
          padding:10px 24px;cursor:pointer;font-weight:bold;">
          ❌ No
        </button>
      </div>
    `;
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 30000);
  });

  skt.on('robots:taskUpdate', data => {
    const robot = myRobots.find(r => r.id === data.robotId);
    if (!robot) return;
    robot.task      = data.task;
    robot.taskState = data.taskState;
    robot.botOre    = data.botOre;
    robot.botBagSize= data.botBagSize;
    if (data.financePool !== undefined) robot.financePool = data.financePool;
    if (data.positions   !== undefined) robot.positions   = data.positions;
    if (data.tradeLog    !== undefined) robot.tradeLog    = data.tradeLog;
    window._myRobots = myRobots;
    const rm = allRobotMeshes[data.robotId];
    if (rm) rm.robot = robot;
  });

  skt.on('robots:welcomeBack', data => {
    // Big welcome back popup
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      background:rgba(0,10,30,0.97);border:2px solid rgba(0,255,200,0.5);
      border-radius:20px;padding:28px 36px;text-align:center;color:white;
      font-family:'Segoe UI',sans-serif;z-index:600;pointer-events:none;
      max-width:380px;width:90%;box-shadow:0 0 40px rgba(0,255,200,0.2);
    `;
    el.innerHTML = `
      <div style="font-size:1.8rem;margin-bottom:10px;">👋</div>
      <div style="font-size:1.1rem;font-weight:bold;color:#00FFCC;margin-bottom:12px;">
        Welcome Back!
      </div>
      <div style="font-size:0.85rem;opacity:0.75;line-height:1.9;white-space:pre-line;">
        ${data.msg.replace('Welcome back!\n','')}
      </div>
    `;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.6s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 600);
    }, 5000);
  });

  skt.on('robots:barsBoxUpdate', data => {
    barsBoxBars = data.bars || 0;
  });

  skt.on('robots:depositBoxUpdate', data => {
    depositOre = data.ore || 0;
  });

  skt.emit('robots:getBarsBox');
  skt.emit('robots:getDepositBox');
  skt.emit('robots:getState');
  // Expose live myRobots reference for vendor-client sell tab
  window._vendorSetMyRobots?.(() => myRobots);
  console.log('[Robots Client] Socket events bound');
}

// ── LERP REMOTE ROBOTS ────────────────────────────────────────────────────────
function lerpRemoteRobots(delta) {
  Object.entries(allRobotMeshes).forEach(([id, rm]) => {
    if (rm.ownerName === USR()) return; // my robots handled separately
    if (rm.targetX !== undefined) {
      rm.group.position.x += (rm.targetX - rm.group.position.x) * Math.min(1, 8*delta);
      rm.group.position.z += (rm.targetZ - rm.group.position.z) * Math.min(1, 8*delta);
      // Face direction of travel
      const dx = (rm.targetX||0) - rm.group.position.x;
      const dz = (rm.targetZ||0) - rm.group.position.z;
      if (Math.abs(dx)>0.05||Math.abs(dz)>0.05) {
        rm.group.rotation.y = Math.atan2(dx, dz);
      }
    }
  });
}

// ── DEPOSIT BOX ───────────────────────────────────────────────────────────────
const DEPOSIT_X = 68, DEPOSIT_Z = 4; // outside workshop west entrance, clear of walls
let depositOre = 0;
let nearDepositBox = false;

function buildDepositBox() {
  const scene = S(); if (!scene) return;

  // Crate body
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 1.2, 1.4),
    new THREE.MeshLambertMaterial({ color: 0x8B6644 })
  );
  box.position.set(DEPOSIT_X, 0.6, DEPOSIT_Z);
  box.castShadow = true; scene.add(box);

  // Lid
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(1.45, 0.18, 1.45),
    new THREE.MeshLambertMaterial({ color: 0x6B4623 })
  );
  lid.position.set(DEPOSIT_X, 1.29, DEPOSIT_Z);
  scene.add(lid);

  // Metal corners
  [[0.65,0.65],[-0.65,0.65],[0.65,-0.65],[-0.65,-0.65]].forEach(([ox,oz]) => {
    const corner = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 1.2, 0.12),
      new THREE.MeshLambertMaterial({ color: 0x888888 })
    );
    corner.position.set(DEPOSIT_X+ox, 0.6, DEPOSIT_Z+oz);
    scene.add(corner);
  });

  // Glowing ore indicator on top
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 6, 6),
    new THREE.MeshBasicMaterial({ color:0xFF9944, transparent:true, opacity:0.8 })
  );
  glow.position.set(DEPOSIT_X, 1.55, DEPOSIT_Z);
  glow.userData.isDepositGlow = true;
  scene.add(glow);

  // Sign post
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05,0.05,1.5,6),
    new THREE.MeshLambertMaterial({ color:0x888888 })
  );
  post.position.set(DEPOSIT_X+1.2, 0.75, DEPOSIT_Z);
  scene.add(post);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.12,0.7,1.2),
    new THREE.MeshLambertMaterial({ color:0x1a1a2e })
  );
  sign.position.set(DEPOSIT_X+1.26, 1.55, DEPOSIT_Z);
  scene.add(sign);
  const signFace = new THREE.Mesh(
    new THREE.BoxGeometry(0.1,0.55,1.0),
    new THREE.MeshLambertMaterial({ color:0xFF7722 })
  );
  signFace.position.set(DEPOSIT_X+1.28, 1.55, DEPOSIT_Z);
  scene.add(signFace);
}

// Deposit box HUD
const depositHUD = document.createElement('div');
depositHUD.style.cssText = `
  position:fixed;bottom:20px;left:calc(50% - 160px);transform:translateX(-50%);
  background:rgba(0,0,0,0.75);color:#FF9944;font-family:monospace;
  font-size:13px;padding:8px 18px;border-radius:12px;z-index:100;
  pointer-events:none;display:none;
  border:1px solid rgba(255,153,68,0.4);backdrop-filter:blur(6px);
  white-space:nowrap;
`;
document.body.appendChild(depositHUD);

const depositPrompt = document.createElement('div');
depositPrompt.style.cssText = `
  position:fixed;bottom:110px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,0.82);color:#FF9944;padding:12px 28px;border-radius:12px;
  font-family:sans-serif;font-size:15px;border:1px solid rgba(255,153,68,0.5);
  backdrop-filter:blur(8px);display:none;z-index:100;cursor:pointer;user-select:none;
`;
depositPrompt.addEventListener('click',    () => { SKT()?.emit('robots:pickupOre'); });
depositPrompt.addEventListener('touchend', e => { e.preventDefault(); SKT()?.emit('robots:pickupOre'); }, { passive:false });
document.body.appendChild(depositPrompt);

function updateDepositBox(delta, totalTime) {
  const cam = CAM(); if (!cam) return;
  if (window._inStation||window._inSanctum||window._ddsActive) { depositHUD.style.display="none"; depositPrompt.style.display="none"; return; }
  const dx = cam.position.x - DEPOSIT_X;
  const dz = cam.position.z - DEPOSIT_Z;
  nearDepositBox = Math.sqrt(dx*dx + dz*dz) < 5.0;

  // Pulse glow if has ore
  S()?.children.forEach(c => {
    if (c.userData?.isDepositGlow) {
      c.material.opacity = depositOre > 0
        ? 0.5 + Math.sin(totalTime * 3) * 0.3
        : 0.15;
      c.material.color.set(depositOre > 0 ? 0xFF9944 : 0x444444);
    }
  });

  if (nearDepositBox && depositOre > 0) {
    depositPrompt.textContent = `📦 Press E to pick up ${depositOre} ore from deposit box`;
    depositPrompt.style.display = 'block';
    depositHUD.textContent = `📦 Bot deposit: ${depositOre} ore`;
    depositHUD.style.display = 'block';
  } else if (depositOre > 0) {
    depositPrompt.style.display = 'none';
    depositHUD.textContent = `📦 Bot deposit: ${depositOre} ore`;
    depositHUD.style.display = 'block';
  } else {
    depositPrompt.style.display = 'none';
    depositHUD.style.display = 'none';
  }
}
// ── BARS BOX (smelt bot output) ───────────────────────────────────────────────
const BARS_BOX_X = 74, BARS_BOX_Z = 4;
let barsBoxBars = 0;
let nearBarsBox  = false;

function buildBarsBox() {
  const scene = S(); if (!scene) return;

  // Crate body — gold tinted
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 1.2, 1.4),
    new THREE.MeshLambertMaterial({ color: 0x886633 })
  );
  box.position.set(BARS_BOX_X, 0.6, BARS_BOX_Z);
  box.castShadow = true; scene.add(box);

  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(1.45, 0.18, 1.45),
    new THREE.MeshLambertMaterial({ color: 0x664422 })
  );
  lid.position.set(BARS_BOX_X, 1.29, BARS_BOX_Z);
  scene.add(lid);

  // Gold corner accents
  [[0.65,0.65],[-0.65,0.65],[0.65,-0.65],[-0.65,-0.65]].forEach(([ox,oz]) => {
    const corner = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 1.2, 0.12),
      new THREE.MeshLambertMaterial({ color: 0xFFD700 })
    );
    corner.position.set(BARS_BOX_X+ox, 0.6, BARS_BOX_Z+oz);
    scene.add(corner);
  });

  // Glowing bar indicator
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 6, 6),
    new THREE.MeshBasicMaterial({ color:0xFFD700, transparent:true, opacity:0.8 })
  );
  glow.position.set(BARS_BOX_X, 1.55, BARS_BOX_Z);
  glow.userData.isBarsGlow = true;
  scene.add(glow);

  // Sign
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05,0.05,1.5,6),
    new THREE.MeshLambertMaterial({ color:0x888888 })
  );
  post.position.set(BARS_BOX_X-1.2, 0.75, BARS_BOX_Z);
  scene.add(post);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.12,0.7,1.2),
    new THREE.MeshLambertMaterial({ color:0x1a1a2e })
  );
  sign.position.set(BARS_BOX_X-1.26, 1.55, BARS_BOX_Z);
  scene.add(sign);
  const signFace = new THREE.Mesh(
    new THREE.BoxGeometry(0.1,0.55,1.0),
    new THREE.MeshLambertMaterial({ color:0xFFD700 })
  );
  signFace.position.set(BARS_BOX_X-1.28, 1.55, BARS_BOX_Z);
  scene.add(signFace);
}

const barsBoxHUD = document.createElement('div');
barsBoxHUD.style.cssText = `
  position:fixed;bottom:20px;left:calc(50% + 160px);transform:translateX(-50%);
  background:rgba(0,0,0,0.75);color:#FFD700;font-family:monospace;
  font-size:13px;padding:8px 18px;border-radius:12px;z-index:100;
  pointer-events:none;display:none;
  border:1px solid rgba(255,215,0,0.4);backdrop-filter:blur(6px);
  white-space:nowrap;
`;
document.body.appendChild(barsBoxHUD);

const barsBoxPrompt = document.createElement('div');
barsBoxPrompt.style.cssText = `
  position:fixed;bottom:110px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,0.82);color:#FFD700;padding:12px 28px;border-radius:12px;
  font-family:sans-serif;font-size:15px;border:1px solid rgba(255,215,0,0.5);
  backdrop-filter:blur(8px);display:none;z-index:101;cursor:pointer;user-select:none;
`;
barsBoxPrompt.addEventListener('click',    () => SKT()?.emit('robots:pickupBars'));
barsBoxPrompt.addEventListener('touchend', e => { e.preventDefault(); SKT()?.emit('robots:pickupBars'); }, { passive:false });
document.body.appendChild(barsBoxPrompt);

function updateBarsBox(delta, totalTime) {
  const cam = CAM(); if (!cam) return;
  if (window._inStation||window._inSanctum||window._ddsActive) { barsBoxHUD.style.display="none"; barsBoxPrompt.style.display="none"; return; }
  const dx = cam.position.x - BARS_BOX_X;
  const dz = cam.position.z - BARS_BOX_Z;
  nearBarsBox = Math.sqrt(dx*dx + dz*dz) < 5.0;

  S()?.children.forEach(c => {
    if (c.userData?.isBarsGlow) {
      c.material.opacity = barsBoxBars > 0
        ? 0.5 + Math.sin(totalTime * 2.5) * 0.35
        : 0.15;
      c.material.color.set(barsBoxBars > 0 ? 0xFFD700 : 0x444433);
    }
  });

  if (nearBarsBox && barsBoxBars > 0) {
    barsBoxPrompt.textContent = `🔶 Press E to pick up ${barsBoxBars} bars from smelt box`;
    barsBoxPrompt.style.display = 'block';
    barsBoxHUD.textContent = `🔶 Smelt box: ${barsBoxBars} bars`;
    barsBoxHUD.style.display = 'block';
  } else if (barsBoxBars > 0) {
    barsBoxPrompt.style.display = 'none';
    barsBoxHUD.textContent = `🔶 Smelt box: ${barsBoxBars} bars`;
    barsBoxHUD.style.display = 'block';
  } else {
    barsBoxPrompt.style.display = 'none';
    barsBoxHUD.style.display   = 'none';
  }
}
const BOT_SAYINGS = [
  'BEEP BOOP. I am performing optimally. 🤖',
  'My legs hurt. Do robots get tired? Asking for a friend.',
  'I have calculated 47 ways to trip. I avoided them all.',
  'Processing... still processing... nope just daydreaming.',
  'I scanned the area. Found 0 threats. Found 12 snacks.',
  'Did you know I have feelings? I am choosing not to share them.',
  'My proficiency is increasing. Soon I will be unstoppable.',
  'I saw another robot today. We did not speak. It was tense.',
  'Task status: vibing.',
  'ERROR 404: chill not found. Just kidding I am very chill.',
  'I have been following you for hours. This is fine.',
  'My antenna picked up 3 wifi networks. None of them are secured.',
];

const TASK_SAYINGS = {
  mining: [
    'ON IT. My legs are already spinning.',
    'To the mine! Do not worry about the noise.',
    'I will collect ALL the rocks. Even the bad ones.',
  ],
  smelting: [
    'Smelting mode: ENGAGED. Fire is my friend now.',
    'I will turn ore into bars. This is my purpose.',
    'They said I could not handle the heat. They were wrong.',
    'The foundry calls. I answer.',
  ],
  slots: [
    'Deploying to casino. Calculating odds. Results may vary.',
    'I have run the numbers. The numbers say... spin anyway.',
    'This is fine. I am definitely not nervous about losing your money.',
    'Going to the casino. Do not wait up.',
  ],
};

// Bot interaction prompt
const botPrompt = document.createElement('div');
botPrompt.style.cssText = `
  position:fixed;bottom:110px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,0.82);color:#00FFCC;padding:12px 28px;border-radius:12px;
  font-family:sans-serif;font-size:15px;border:1px solid rgba(0,255,200,0.4);
  backdrop-filter:blur(8px);display:none;z-index:100;cursor:pointer;user-select:none;
  box-shadow:0 0 14px rgba(0,255,200,0.2);
`;
botPrompt.addEventListener('click', () => openNearestBotMenu());
botPrompt.addEventListener('touchend', e => { e.preventDefault(); openNearestBotMenu(); }, { passive:false });
document.body.appendChild(botPrompt);

// Bot menu overlay
const botMenuOverlay = document.createElement('div');
botMenuOverlay.style.cssText = `
  position:fixed;inset:0;background:rgba(0,5,15,0.94);color:white;
  font-family:'Segoe UI',sans-serif;z-index:350;display:none;
  align-items:center;justify-content:center;
`;
document.body.appendChild(botMenuOverlay);
let botMenuOpen = false;
let activeBotId = null;

function openNearestBotMenu() {
  if (BLOCKED() && !botMenuOpen) return;
  const robot = getNearestOwnedRobot();
  if (!robot) return;
  activeBotId = robot.id;
  botMenuOpen = true;
  if (document.pointerLockElement) document.exitPointerLock();
  // Request fresh state first, render after short delay
  SKT()?.emit('mine:getState');
  setTimeout(() => {
    renderBotMenu(robot);
    botMenuOverlay.style.display = 'flex';
  }, 80);
}

function getNearestOwnedRobot() {
  const cam = CAM(); if (!cam) return null;
  let closest = null, closestDist = 4.5;
  myRobots.filter(r => r.active).forEach(robot => {
    const rm = allRobotMeshes[robot.id];
    if (!rm) return;
    const dx = cam.position.x - rm.group.position.x;
    const dz = cam.position.z - rm.group.position.z;
    const d  = Math.sqrt(dx*dx + dz*dz);
    if (d < closestDist) { closestDist = d; closest = robot; }
  });
  return closest;
}

function renderBotMenu(robot) {
  const isTasked = robot.task && robot.task !== 'idle';
  const taskLabel = isTasked
    ? `🔧 Tasked: ${robot.task}`
    : '💤 Idle — following you';

  botMenuOverlay.innerHTML = `
    <div style="max-width:380px;width:100%;padding:24px;box-sizing:border-box;">

      <!-- Robot header -->
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:3rem;margin-bottom:6px;">🤖</div>
        <div style="font-size:1.5rem;font-weight:bold;color:#00FFCC;">${robot.name}</div>
        <div style="opacity:0.45;font-size:0.8rem;margin-top:4px;">${taskLabel}</div>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:8px;">
          <span style="background:rgba(255,255,255,0.08);border-radius:6px;
            padding:3px 10px;font-size:0.75rem;">
            ${robot.design.headShape} head
          </span>
          <span style="background:rgba(255,255,255,0.08);border-radius:6px;
            padding:3px 10px;font-size:0.75rem;">
            ${robot.design.bottomShape} legs
          </span>
        </div>
      </div>

      <!-- Action buttons -->
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px;">

        <!-- TALK -->
        <button onclick="window.rbTalk('${robot.id}')"
          style="background:rgba(0,255,200,0.1);color:#00FFCC;
          border:1px solid rgba(0,255,200,0.35);border-radius:12px;
          padding:16px;font-size:15px;font-weight:bold;cursor:pointer;
          display:flex;align-items:center;gap:12px;">
          <span style="font-size:1.5rem;">💬</span>
          <div style="text-align:left;">
            <div>Talk</div>
            <div style="font-size:0.75rem;opacity:0.5;font-weight:normal;">
              See what's on its mind
            </div>
          </div>
        </button>

        <!-- TASK -->
        <button onclick="window.rbTask('${robot.id}')"
          style="background:rgba(255,200,0,0.08);color:#FFD700;
          border:1px solid rgba(255,200,0,0.3);border-radius:12px;
          padding:16px;font-size:15px;font-weight:bold;cursor:pointer;
          display:flex;align-items:center;gap:12px;">
          <span style="font-size:1.5rem;">⚙️</span>
          <div style="text-align:left;">
            <div>Assign Task</div>
            <div style="font-size:0.75rem;opacity:0.5;font-weight:normal;">
              Put it to work
            </div>
          </div>
        </button>

        <!-- MANAGE -->
        <button onclick="window.rbManage()"
          style="background:rgba(255,255,255,0.05);color:white;
          border:1px solid rgba(255,255,255,0.15);border-radius:12px;
          padding:16px;font-size:15px;font-weight:bold;cursor:pointer;
          display:flex;align-items:center;gap:12px;">
          <span style="font-size:1.5rem;">📋</span>
          <div style="text-align:left;">
            <div>Manage Robots</div>
            <div style="font-size:0.75rem;opacity:0.5;font-weight:normal;">
              View all, dismiss, or summon
            </div>
          </div>
        </button>

      </div>

      <button onclick="window.rbCloseMenu()"
        style="width:100%;background:rgba(255,255,255,0.06);color:white;
        border:1px solid rgba(255,255,255,0.12);border-radius:10px;
        padding:10px;cursor:pointer;font-size:13px;">
        Back to campus
      </button>
    </div>
  `;
}

// ── BOT SPEECH BUBBLE ──────────────────────────────────────────────────────────
function showBotSpeech(robot, msg) {
  const rm = allRobotMeshes[robot.id]; if (!rm) return;
  // Clear any existing bubble
  if (rm.speechBubble) rm.speechBubble.remove();

  const bubble = document.createElement('div');
  bubble.style.cssText = `
    position:fixed;background:white;color:#111;font-family:sans-serif;
    font-size:13px;font-weight:bold;padding:10px 16px;border-radius:16px;
    pointer-events:none;z-index:200;transform:translate(-50%,-100%);
    box-shadow:0 4px 16px rgba(0,255,200,0.3);max-width:240px;text-align:center;
    border:2px solid #00FFCC;line-height:1.4;
  `;
  bubble.textContent = msg;
  document.body.appendChild(bubble);
  rm.speechBubble = bubble;
  rm.speechTimer  = 4.0;
}

function renderTaskMenu(robot) {
  const isTasked = robot.task && robot.task !== 'idle';
  const bagSize  = robot.botBagSize || 3;
  const speed    = robot.botSpeed   || 0.5;
  const durability = robot.durability ?? 100;
  const SPEED_TIERS = [0.5, 1.0, 2.0, 4.0];
  const speedIdx  = SPEED_TIERS.indexOf(speed);
  const nextSpeed = SPEED_TIERS[speedIdx + 1];
  const SPEED_COSTS = [8, 15, 25];
  const speedCost = SPEED_COSTS[speedIdx] || null;
  const bagCost   = bagSize <= 5 ? 5 : 10;
  const myBars = window._mineInventory?.bars ?? 0;
  const repairCost = Math.ceil((100 - durability) / 10) * (robot.deaths > 0 ? 2 : 1);
  const durColor = durability > 60 ? '#44FF88' : durability > 30 ? '#FFD700' : '#FF4444';

  botMenuOverlay.innerHTML = `
    <div style="max-width:400px;width:100%;padding:24px;box-sizing:border-box;max-height:90vh;overflow-y:auto;">
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:1.5rem;font-weight:bold;color:#FFD700;">⚙️ ${robot.name}</div>
        <div style="opacity:0.45;font-size:0.8rem;margin-top:4px;">
          ${isTasked ? `🔧 Currently: ${robot.task} -- Bag: ${robot.botOre||0}/${bagSize} ore` : '💤 Idle'}
        </div>
        <div style="opacity:0.35;font-size:0.75rem;margin-top:4px;">
          Speed: ${speed}x · Bag: ${bagSize} slots · Prof: ${robot.proficiency||0}
          ${robot.deaths > 0 ? ` · 🔥 REBORN x${robot.deaths}` : ''}
        </div>
        <!-- Durability bar -->
        <div style="margin-top:10px;">
          <div style="display:flex;justify-content:space-between;font-size:0.75rem;opacity:0.6;margin-bottom:4px;">
            <span>🛡️ Durability</span>
            <span style="color:${durColor}">${durability}/100</span>
          </div>
          <div style="background:rgba(255,255,255,0.1);border-radius:6px;height:8px;overflow:hidden;">
            <div style="background:${durColor};height:100%;width:${durability}%;transition:width 0.3s;border-radius:6px;"></div>
          </div>
          ${durability < 100 ? `
            <button onclick="window.rbRepair('${robot.id}')"
              ${myBars < repairCost ? 'disabled style="opacity:0.35;cursor:not-allowed;"' : ''}
              style="margin-top:8px;width:100%;background:rgba(0,200,100,0.15);color:#44FF88;
              border:1px solid rgba(0,200,100,0.4);border-radius:8px;
              padding:7px;font-size:12px;cursor:pointer;font-weight:bold;">
              🔧 Repair to 100 — ${repairCost} bars
            </button>` : ''}
        </div>
      </div>

      ${isTasked ? `
        <!-- RECALL -->
        <button onclick="window.rbRecall('${robot.id}')"
          style="width:100%;background:rgba(255,50,50,0.15);color:#FF6666;
          border:1px solid rgba(255,50,50,0.4);border-radius:12px;
          padding:14px;font-size:14px;font-weight:bold;cursor:pointer;margin-bottom:12px;
          display:flex;align-items:center;justify-content:center;gap:10px;">
          🏃 Recall ${robot.name}
          <span style="font-size:0.75rem;opacity:0.6;font-weight:normal;">
            (stops task, follows you again)
          </span>
        </button>
      ` : `
        <!-- ASSIGN TASKS -->
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
          <button onclick="window.rbStay('${robot.id}')"
            style="background:rgba(100,100,255,0.1);color:#AAAAFF;
            border:1px solid rgba(100,100,255,0.3);border-radius:12px;
            padding:12px;font-size:13px;font-weight:bold;cursor:pointer;
            display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.3rem;">🧍</span>
            <div style="text-align:left;">
              <div>Stay</div>
              <div style="font-size:0.7rem;opacity:0.55;font-weight:normal;">
                Stop following -- park in place until reassigned
              </div>
            </div>
          </button>
          <button onclick="window.rbAssignTask('${robot.id}','mining')"
            style="background:rgba(255,153,68,0.1);color:#FF9944;
            border:1px solid rgba(255,153,68,0.35);border-radius:12px;
            padding:12px;font-size:13px;font-weight:bold;cursor:pointer;
            display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.3rem;">⛏️</span>
            <div style="text-align:left;">
              <div>Mine Ore</div>
              <div style="font-size:0.7rem;opacity:0.55;font-weight:normal;">
                Runs to mine, collects ore, deposits at box near Workshop
              </div>
            </div>
          </button>
          <button onclick="window.rbAssignTask('${robot.id}','smelting')"
            style="background:rgba(255,80,0,0.1);color:#FF6622;
            border:1px solid rgba(255,80,0,0.35);border-radius:12px;
            padding:12px;font-size:13px;font-weight:bold;cursor:pointer;
            display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.3rem;">🔥</span>
            <div style="text-align:left;">
              <div>Smelt Bars</div>
              <div style="font-size:0.7rem;opacity:0.55;font-weight:normal;">
                Picks ore from box, walks to foundry, smelts slowly into bars
              </div>
            </div>
          </button>
          <button onclick="window.rbAssignTask('${robot.id}','slots')"
            style="background:rgba(150,0,255,0.1);color:#CC88FF;
            border:1px solid rgba(150,0,255,0.35);border-radius:12px;
            padding:12px;font-size:13px;font-weight:bold;cursor:pointer;
            display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.3rem;">🎰</span>
            <div style="text-align:left;">
              <div>Play Slots</div>
              <div style="font-size:0.7rem;opacity:0.55;font-weight:normal;">
                Walks to casino, gambles your SpaceBucks. Upgrades improve win chance
              </div>
            </div>
          </button>
        </div>
      `}

      ${robotsBuilt >= 25 && !isTasked ? `
        <button onclick="window.rbOpenFinance('${robot.id}')"
          style="width:100%;background:rgba(255,215,0,0.1);color:#FFD700;
          border:1px solid rgba(255,215,0,0.3);border-radius:12px;
          padding:12px;font-size:13px;font-weight:bold;cursor:pointer;
          display:flex;align-items:center;gap:10px;margin-top:8px;">
          <span style="font-size:1.3rem;">💼</span>
          <div style="text-align:left;">
            <div>Finance Bot ${robot.financeTier > 0 ? `(Tier ${robot.financeTier})` : ''}</div>
            <div style="font-size:0.7rem;opacity:0.55;font-weight:normal;">
              Send to market. Trades stocks and crypto with your SB.
              ${robot.financePool > 0 ? ` Pool: ${robot.financePool} SB` : ''}
            </div>
          </div>
        </button>` : robotsBuilt < 25 ? `
        <div style="opacity:0.3;font-size:0.75rem;text-align:center;padding:6px;">
          💼 Finance Bot unlocks at 25 robots built (${robotsBuilt}/25)
        </div>` : ''}

      <!-- UPGRADES -->
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);
        border-radius:12px;padding:14px;margin-bottom:12px;">
        <div style="font-weight:bold;font-size:0.85rem;margin-bottom:10px;opacity:0.7;">
          🔧 Bot Upgrades
        </div>

        <!-- Bag upgrade -->
        <div style="display:flex;justify-content:space-between;align-items:center;
          margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.07);">
          <div>
            <div style="font-size:0.85rem;">🎒 Carry Capacity</div>
            <div style="opacity:0.45;font-size:0.75rem;">${bagSize}/10 slots</div>
          </div>
          ${bagSize >= 10
            ? `<span style="color:#44FF88;font-size:0.8rem;">MAX</span>`
            : `<button onclick="window.rbUpgradeBag('${robot.id}')"
                ${myBars < bagCost ? 'disabled style="opacity:0.35;cursor:not-allowed;"' : ''}
                style="background:#223344;color:white;border:1px solid rgba(0,200,255,0.3);
                border-radius:8px;padding:6px 14px;cursor:pointer;font-size:12px;">
                +1 slot (${bagCost}b)
              </button>`}
        </div>

        <!-- Speed upgrade -->
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:0.85rem;">⚡ Move Speed</div>
            <div style="opacity:0.45;font-size:0.75rem;">${speed}x</div>
          </div>
          ${!nextSpeed
            ? `<span style="color:#44FF88;font-size:0.8rem;">MAX</span>`
            : `<button onclick="window.rbUpgradeSpeed('${robot.id}')"
                ${myBars < speedCost ? 'disabled style="opacity:0.35;cursor:not-allowed;"' : ''}
                style="background:#223344;color:white;border:1px solid rgba(0,200,255,0.3);
                border-radius:8px;padding:6px 14px;cursor:pointer;font-size:12px;">
                ${speed}x→${nextSpeed}x (${speedCost}b)
              </button>`}
        </div>
      </div>

      <button onclick="window.rbCloseMenu()"
        style="width:100%;background:rgba(255,255,255,0.06);color:white;
        border:1px solid rgba(255,255,255,0.12);border-radius:10px;
        padding:10px;cursor:pointer;font-size:13px;">
        Close
      </button>
    </div>
  `;
}

// ── WINDOW ACTIONS ────────────────────────────────────────────────────────────
window.rbTalk = (robotId) => {
  const robot = myRobots.find(r => r.id === robotId); if (!robot) return;
  const saying = BOT_SAYINGS[Math.floor(Math.random() * BOT_SAYINGS.length)];
  showBotSpeech(robot, saying);
  botMenuOverlay.style.display = 'none';
  botMenuOpen = false;
};

window.rbTask = (robotId) => {
  const robot = myRobots.find(r => r.id === robotId); if (!robot) return;
  renderTaskMenu(robot);
};

window.rbAssignTask = (robotId, task) => {
  const robot = myRobots.find(r => r.id === robotId); if (!robot) return;
  const sayings = TASK_SAYINGS[task] || ['On it!'];
  const saying = sayings[Math.floor(Math.random() * sayings.length)];
  robot.task = task;
  SKT()?.emit('robots:assignTask', { robotId, task });
  showBotSpeech(robot, saying);
  botMenuOverlay.style.display = 'none';
  botMenuOpen = false;
  NOTIFY(`🤖 ${robot.name} assigned to ${task}!`);
};

window.rbQuickAssign = (robotId, task) => {
  const robot = myRobots.find(r => r.id === robotId); if (!robot) return;
  const sayings = TASK_SAYINGS[task] || ['On it!'];
  const saying  = sayings[Math.floor(Math.random()*sayings.length)];
  robot.task      = task;
  robot.taskState = task === 'smelting' ? 'checking_ore_box'
                  : task === 'slots'    ? 'walking_to_casino'
                  : 'walking_to_mine';
  SKT()?.emit('robots:assignTask', { robotId, task });
  showBotSpeech(robot, saying);
  robotsUIOpen = false;
  robotsOverlay.style.display = 'none';
  NOTIFY(`🤖 ${robot.name} assigned to ${task}!`);
};

window.rbRepair = (robotId) => {
  SKT()?.emit('battle:repair', { robotId });
  window.rbCloseMenu();
};

window.rbStay = (robotId) => {
  const robot = myRobots.find(r => r.id === robotId); if (!robot) return;
  robot.task = 'stay';
  robot.taskState = null;
  SKT()?.emit('robots:assignTask', { robotId, task: 'stay' });
  window.rbCloseMenu();
  NOTIFY(`🧍 ${robot.name} is staying put.`);
};

window.showTradeLog = (robotId) => {
  const robot = myRobots.find(r => r.id === robotId);
  const log = robot?.tradeLog || [];
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:rgba(0,5,20,0.97);border:2px solid rgba(255,215,0,0.3);
    border-radius:14px;padding:20px;color:white;font-family:'Segoe UI',sans-serif;
    z-index:420;min-width:340px;max-height:70vh;overflow-y:auto;
    box-shadow:0 0 20px rgba(255,215,0,0.2);
  `;
  el.innerHTML = `
    <div style="font-weight:bold;color:#FFD700;margin-bottom:10px;">
      📋 ${robot?.name} Trade Log
    </div>
    ${log.length === 0 ? '<div style="opacity:0.4;font-size:0.8rem;">No trades yet.</div>' :
      log.map(t => {
        const d = new Date(t.time);
        const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
        const col  = t.action === 'BUY' ? '#44FF88' : '#FF6666';
        return `<div style="display:flex;justify-content:space-between;padding:5px 0;
          border-bottom:1px solid rgba(255,255,255,0.06);font-size:0.8rem;">
          <span style="color:${col};font-weight:bold;">${t.action}</span>
          <span>${t.sym}</span>
          <span>${t.price} SB/unit</span>
          ${t.amount ? `<span style="opacity:0.6;">${t.amount} SB</span>` : ''}
          ${t.reason ? `<span style="opacity:0.4;">${t.reason}</span>` : ''}
          <span style="opacity:0.35;">${time}</span>
        </div>`;
      }).join('')}
    <button onclick="this.parentNode.remove()"
      style="width:100%;margin-top:10px;background:rgba(255,255,255,0.07);color:white;
      border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:8px;cursor:pointer;">
      Close
    </button>
  `;
  document.body.appendChild(el);
};

window.rbOpenFinance = (robotId) => {
  const robot = myRobots.find(r => r.id === robotId); if (!robot) return;
  const overlay = document.createElement('div');
  overlay.id = 'financeOverlay';
  overlay.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:rgba(0,5,20,0.97);border:2px solid rgba(255,215,0,0.4);
    border-radius:16px;padding:24px;color:white;font-family:'Segoe UI',sans-serif;
    z-index:410;min-width:340px;box-shadow:0 0 30px rgba(255,215,0,0.2);
  `;
  const pool = robot.financePool || 0;
  overlay.innerHTML = `
    <div style="font-size:1.2rem;font-weight:bold;color:#FFD700;margin-bottom:6px;">💼 Finance Bot</div>
    <div style="opacity:0.5;font-size:0.8rem;margin-bottom:14px;">
      Send ${robot.name} to trade stocks and crypto on your behalf.
      ${pool > 0 ? `<br><span style="color:#44FF88;">Current pool: ${pool} SB</span>` : ''}
    </div>
    <div style="margin-bottom:10px;">
      <div style="font-size:0.8rem;opacity:0.6;margin-bottom:5px;">Strategy:</div>
      ${[['low','🐢 Low Risk','Buys green, sells red. Slow and steady.'],
         ['medium','📊 Medium Risk','Holds 10 stocks, rebalances every 10 min.'],
         ['high','🎲 High Risk','All in on 4 stocks + 1 crypto. 1 hour hold.']].map(([v,l,d])=>`
        <div onclick="this.parentNode.querySelectorAll('[data-strat]').forEach(e=>e.style.border='1px solid rgba(255,255,255,0.1)');this.style.border='2px solid #FFD700';window._finStrat='${v}';"
          data-strat="${v}"
          style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);
          border-radius:8px;padding:9px 12px;margin-bottom:5px;cursor:pointer;">
          <div style="font-weight:bold;font-size:0.85rem;">${l}</div>
          <div style="opacity:0.45;font-size:0.72rem;">${d}</div>
        </div>`).join('')}
    </div>
    <div style="margin-bottom:12px;">
      <div style="font-size:0.8rem;opacity:0.6;margin-bottom:5px;">Fund with (SB):</div>
      <input id="financeAmount" type="number" min="100" placeholder="e.g. 5000"
        style="width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);
        color:white;padding:9px;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box;">
    </div>
    <div style="display:flex;gap:8px;">
      <button onclick="
        const amt=parseInt(document.getElementById('financeAmount')?.value)||0;
        const strat=window._finStrat||'medium';
        if(amt<100){window._mineShowNotification('Minimum 100 SB!');return;}
        if(!window._finStrat){window._mineShowNotification('Pick a strategy!');return;}
        window._mineGetSocket?.().emit('robots:fundFinanceBot',{robotId:'${robotId}',amount:amt,strategy:strat});
        document.getElementById('financeOverlay')?.remove();
        window.rbCloseMenu();
      " style="flex:1;background:#886600;color:white;border:none;border-radius:8px;
        padding:10px;cursor:pointer;font-weight:bold;">
        💼 Deploy
      </button>
      ${pool > 0 ? `
      <button onclick="
        window._mineGetSocket?.().emit('robots:withdrawFinance',{robotId:'${robotId}'});
        document.getElementById('financeOverlay')?.remove();
        window.rbCloseMenu();
      " style="background:rgba(0,200,100,0.2);color:#44FF88;border:1px solid rgba(0,200,100,0.4);
        border-radius:8px;padding:10px 14px;cursor:pointer;font-size:12px;">
        💰 Withdraw
      </button>` : ''}
      <button onclick="window.showTradeLog('${robotId}')"
        style="background:rgba(255,215,0,0.1);color:#FFD700;border:1px solid rgba(255,215,0,0.3);
        border-radius:8px;padding:10px 14px;cursor:pointer;font-size:12px;">
        📋 Log
      </button>
      <button onclick="document.getElementById('financeOverlay')?.remove();"
        style="background:rgba(255,255,255,0.08);color:white;border:1px solid rgba(255,255,255,0.15);
        border-radius:8px;padding:10px 14px;cursor:pointer;font-size:12px;">
        Cancel
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
  window.rbCloseMenu();
};

window.rbRecall = (robotId) => {
  SKT()?.emit('robots:recall', { robotId });
  const robot = myRobots.find(r => r.id === robotId);
  if (robot) { robot.task = 'idle'; robot.taskState = null; }
  window.rbCloseMenu();
};

window.rbUpgradeBag = (robotId) => {
  SKT()?.emit('robots:upgradeBotBag', { robotId });
  window.rbCloseMenu();
};

window.rbUpgradeSpeed = (robotId) => {
  SKT()?.emit('robots:upgradeBotSpeed', { robotId });
  window.rbCloseMenu();
};

// Patch _mineSetInventory to keep _mineInventory in sync (don't overwrite the live reference)
const _origMineSetInv = window._mineSetInventory;
window._mineSetInventory = (data) => {
  _origMineSetInv?.(data);
  if (!window._mineInventory) window._mineInventory = {};
  if (data.bars !== undefined) window._mineInventory.bars = data.bars;
};

window.rbManage = () => {
  botMenuOverlay.style.display = 'none';
  botMenuOpen = false;
  robotsUIOpen = true;
  robotsOverlay.style.display = 'flex';
  renderRobotsUI();
};

window.rbCloseMenu = () => {
  botMenuOverlay.style.display = 'none';
  botMenuOpen = false;
};

// ── PROXIMITY CHECK FOR BOT PROMPT ────────────────────────────────────────────
let nearestBotId = null;

function updateBotProximity() {
  const cam = CAM(); if (!cam) return;
  nearestBotId = null;
  let closestDist = 4.5;

  myRobots.filter(r => r.active).forEach(robot => {
    const rm = allRobotMeshes[robot.id];
    if (!rm) return;
    const dx = cam.position.x - rm.group.position.x;
    const dz = cam.position.z - rm.group.position.z;
    const d  = Math.sqrt(dx*dx + dz*dz);
    if (d < closestDist) { closestDist = d; nearestBotId = robot.id; }
  });

  if (!BLOCKED() && !botMenuOpen && nearestBotId) {
    const robot = myRobots.find(r => r.id === nearestBotId);
    botPrompt.textContent = `🤖 Press E to interact with ${robot?.name || 'your bot'}`;
    botPrompt.style.display = 'block';
  } else if (!botMenuOpen) {
    botPrompt.style.display = 'none';
  }
}

// ── UPDATE SPEECH BUBBLES ──────────────────────────────────────────────────────
function updateBotSpeech(delta) {
  Object.values(allRobotMeshes).forEach(rm => {
    if (!rm.speechBubble || !rm.speechTimer) return;
    rm.speechTimer -= delta;

    // Project position to screen
    const wp  = rm.group.position.clone().add(new THREE.Vector3(0, 2.8, 0));
    const s   = projectToScreen(wp);
    const cam = CAM(); if (!cam) return;
    const dx  = cam.position.x - rm.group.position.x;
    const dz  = cam.position.z - rm.group.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);

    if (s.visible && dist < 30) {
      rm.speechBubble.style.left    = s.x + 'px';
      rm.speechBubble.style.top     = (s.y - 8) + 'px';
      rm.speechBubble.style.display = 'block';
      rm.speechBubble.style.opacity = Math.min(1, rm.speechTimer);
    } else {
      rm.speechBubble.style.display = 'none';
    }

    if (rm.speechTimer <= 0) {
      rm.speechBubble.remove();
      rm.speechBubble = null;
      rm.speechTimer  = 0;
    }
  });
}

// E key for bot interaction
document.addEventListener('keydown', e => {
  if (e.code === 'Escape') {
    if (botMenuOpen) { window.rbCloseMenu(); return; }
  }
  if (e.code !== 'KeyE') return;
  if (BLOCKED()) return;
  if (nearestBotId && !botMenuOpen) openNearestBotMenu();
});

// Patch blocked state
const _prevBlocked2 = window._mineIsBlocked;
window._mineIsBlocked = () => (_prevBlocked2?.() || false) || botMenuOpen;

// ── BLOCKED STATE ─────────────────────────────────────────────────────────────
const _prevBlocked = window._mineIsBlocked;
window._mineIsBlocked = () =>
  (_prevBlocked?.() || false) || assemblyUIOpen || robotsUIOpen || botMenuOpen;

document.addEventListener('keydown', e => {
  if (e.code === 'Escape') {
    if (botMenuOpen)    { window.rbCloseMenu(); return; }
    if (assemblyUIOpen || robotsUIOpen) { window.rbClose(); return; }
  }
  if (e.code !== 'KeyE') return;
  if (assemblyUIOpen || robotsUIOpen || botMenuOpen) return;
  // Bars box takes priority
  if (nearBarsBox && barsBoxBars > 0) { SKT()?.emit('robots:pickupBars'); return; }
  // Deposit box next
  if (nearDepositBox && depositOre > 0) {
    SKT()?.emit('robots:pickupOre');
    return;
  }
  if (!window._mineIsBlocked()) {
    if (nearestBotId) openNearestBotMenu();
  }
});
let _totalTime = 0;
(function loop() {
  requestAnimationFrame(loop);
})();

// ── INIT ──────────────────────────────────────────────────────────────────────
function init() {
  buildDepositBox();
  buildBarsBox();
  // Add robots tick to main animation — patch via existing loop
  let last = performance.now();
  (function robotLoop() {
    requestAnimationFrame(robotLoop);
    const now   = performance.now();
    const delta = Math.min((now - last) / 1000, 0.05);
    _totalTime += delta;
    last = now;

    if(window._inStation){return;}
    updateMyRobots(delta, _totalTime);
    lerpRemoteRobots(delta);
    updateAllRobots(delta, _totalTime);
    updateBotProximity();
    updateBotSpeech(delta);
    updateDepositBox(delta, _totalTime);
    updateBarsBox(delta, _totalTime);
    // Refresh robots management UI every 2s so status stays live
    if (robotsUIOpen && Math.floor(_totalTime*2) !== Math.floor((_totalTime-delta)*2)) {
      renderRobotsUI();
    }
  })();

  // Poll for socket
  const _poll = setInterval(() => {
    if (SKT() && SID()) { setupSocketEvents(); clearInterval(_poll); }
  }, 1000);

  console.log('[Robots Client] Initialized');
}

(function waitForBridge() {
  if (window._mineScene && window._mineCamera) init();
  else setTimeout(waitForBridge, 100);
})();
