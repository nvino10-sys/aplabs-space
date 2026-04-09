// battle-client.js -- RoboDuel Arena
// Add to main.js: import('./battle-client.js');

import * as THREE from 'three';

const S      = () => window._mineScene;
const CAM    = () => window._mineCamera;
const SKT    = () => window._mineGetSocket?.();
const USR    = () => window._mineGetUsername?.() || '';
const NOTIFY = (msg) => window._mineShowNotification?.(msg);

const ARENA_X = 85, ARENA_Z = 34;

// ── STATE ─────────────────────────────────────────────────────────────────────
let battleUIOpen   = false;
let currentBattle  = null;
let challengeData  = null;
let activeLasers   = [];
let activeBattles  = [];
let myWreckage     = null;
let wreckagePileMesh = null;
let nearWreckage   = false;

// ── BUILD ARENA ───────────────────────────────────────────────────────────────
function buildArena() {
  const scene = S(); if (!scene) return;
  const X = ARENA_X, Z = ARENA_Z;

  // Dirt floor octagon -- approximated with large cylinder
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(10, 10, 0.3, 8),
    new THREE.MeshLambertMaterial({ color: 0x8B6914 })
  );
  floor.position.set(X, 0.15, Z);
  floor.receiveShadow = true;
  scene.add(floor);

  // Sand texture rings
  for (let r = 2; r <= 9; r += 3) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.08, 4, 8),
      new THREE.MeshBasicMaterial({ color: 0x6B4E1A, transparent: true, opacity: 0.5 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(X, 0.32, Z);
    scene.add(ring);
  }

  // Fence posts -- 8 sides
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const fx = X + Math.cos(angle) * 10.5;
    const fz = Z + Math.sin(angle) * 10.5;

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 3.5, 6),
      new THREE.MeshLambertMaterial({ color: 0x888888 })
    );
    post.position.set(fx, 1.75, fz);
    scene.add(post);

    // Chain link panel between posts
    const nextAngle = ((i + 1) / 8) * Math.PI * 2;
    const nx = X + Math.cos(nextAngle) * 10.5;
    const nz = Z + Math.sin(nextAngle) * 10.5;
    const mx = (fx + nx) / 2;
    const mz = (fz + nz) / 2;
    const dist = Math.sqrt((nx-fx)**2 + (nz-fz)**2);
    const fence = new THREE.Mesh(
      new THREE.BoxGeometry(dist, 3, 0.08),
      new THREE.MeshLambertMaterial({ color: 0x666666, transparent: true, opacity: 0.6, wireframe: true })
    );
    fence.position.set(mx, 1.75, mz);
    fence.lookAt(nx, 1.75, nz);
    fence.rotateY(Math.PI / 2);
    scene.add(fence);
  }

  // Entrance gate -- gap on west side
  const gateL = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 3.5, 0.2),
    new THREE.MeshLambertMaterial({ color: 0xFFD700 })
  );
  gateL.position.set(X - 10.5, 1.75, Z - 2);
  scene.add(gateL);
  const gateR = gateL.clone();
  gateR.position.set(X - 10.5, 1.75, Z + 2);
  scene.add(gateR);
  const gateTop = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.3, 4.5),
    new THREE.MeshLambertMaterial({ color: 0xFFD700 })
  );
  gateTop.position.set(X - 10.5, 3.6, Z);
  scene.add(gateTop);

  // Floodlights -- 4 corners
  [[-9,-9],[9,-9],[-9,9],[9,9]].forEach(([ox,oz]) => {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, 6, 6),
      new THREE.MeshLambertMaterial({ color: 0x555555 })
    );
    pole.position.set(X+ox, 3, Z+oz);
    scene.add(pole);
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.3, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xFFFF99, emissive: new THREE.Color(0xFFFF66), emissiveIntensity: 0.8 })
    );
    light.position.set(X+ox, 6.1, Z+oz);
    scene.add(light);
    const ptLight = new THREE.PointLight(0xFFFFAA, 0.8, 20);
    ptLight.position.set(X+ox, 6, Z+oz);
    scene.add(ptLight);
  });

  // Center marker
  const center = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.05, 8),
    new THREE.MeshBasicMaterial({ color: 0xFF4400 })
  );
  center.position.set(X, 0.33, Z);
  scene.add(center);

  // VS text marker -- two colored spots
  const spotA = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 0.05, 8),
    new THREE.MeshBasicMaterial({ color: 0x4488FF, transparent: true, opacity: 0.6 })
  );
  spotA.position.set(X - 4, 0.33, Z);
  scene.add(spotA);
  const spotB = spotA.clone();
  spotB.material = new THREE.MeshBasicMaterial({ color: 0xFF4444, transparent: true, opacity: 0.6 });
  spotB.position.set(X + 4, 0.33, Z);
  scene.add(spotB);

  // Referee NPC -- simple figure outside entrance
  buildReferee(X - 13, Z);

  // Sign above gate
  const signBoard = new THREE.Mesh(
    new THREE.BoxGeometry(5, 0.8, 0.2),
    new THREE.MeshLambertMaterial({ color: 0x1a0000 })
  );
  signBoard.position.set(X - 10.5, 4.5, Z);
  scene.add(signBoard);
  const signFace = new THREE.Mesh(
    new THREE.BoxGeometry(4.6, 0.5, 0.15),
    new THREE.MeshBasicMaterial({ color: 0xFF2200 })
  );
  signFace.position.set(X - 10.5, 4.5, Z + 0.1);
  scene.add(signFace);

  console.log('[Battle] Arena built at', X, Z);
}

function buildReferee(x, z) {
  const scene = S(); if (!scene) return;

  // Body
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 1.2, 8),
    new THREE.MeshLambertMaterial({ color: 0x111111 }) // black suit
  );
  body.position.set(x, 0.8, z);
  scene.add(body);

  // Head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 8),
    new THREE.MeshLambertMaterial({ color: 0xFFCC88 })
  );
  head.position.set(x, 1.7, z);
  scene.add(head);

  // White shirt stripe
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 1.2, 0.05),
    new THREE.MeshLambertMaterial({ color: 0xFFFFFF })
  );
  for (let i = 0; i < 3; i++) {
    const s = stripe.clone();
    s.position.set(x - 0.15 + i * 0.15, 0.8, z + 0.31);
    scene.add(s);
  }

  // Whistle
  const whistle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.2, 6),
    new THREE.MeshLambertMaterial({ color: 0xFFD700 })
  );
  whistle.rotation.z = Math.PI / 2;
  whistle.position.set(x + 0.35, 1.55, z + 0.1);
  scene.add(whistle);

  // Interaction prompt stored
  scene.userData.refereePos = { x, z };
}

// ── LASER BEAM ANIMATION ──────────────────────────────────────────────────────
function fireLaser(fromPos, toPos, color) {
  const scene = S(); if (!scene) return;
  const dir = new THREE.Vector3(toPos.x - fromPos.x, toPos.y - fromPos.y, toPos.z - fromPos.z);
  const len = dir.length();
  const mid = new THREE.Vector3(
    (fromPos.x + toPos.x) / 2,
    (fromPos.y + toPos.y) / 2,
    (fromPos.z + toPos.z) / 2
  );

  const laser = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, len, 4),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
  );
  laser.position.copy(mid);
  laser.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
  scene.add(laser);

  activeLasers.push({ mesh: laser, life: 0.4 });

  // Impact flash
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.8 })
  );
  flash.position.set(toPos.x, toPos.y, toPos.z);
  scene.add(flash);
  activeLasers.push({ mesh: flash, life: 0.2 });
}

// ── BATTLE UI ─────────────────────────────────────────────────────────────────
const battleOverlay = document.createElement('div');
battleOverlay.style.cssText = `
  position:fixed;inset:0;background:rgba(0,0,10,0.95);color:white;
  font-family:'Segoe UI',sans-serif;z-index:350;display:none;
  align-items:center;justify-content:center;overflow-y:auto;
`;
document.body.appendChild(battleOverlay);

// Challenge incoming overlay
const challengeOverlay = document.createElement('div');
challengeOverlay.style.cssText = `
  position:fixed;top:80px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,20,0.97);border:2px solid #FF4400;border-radius:16px;
  padding:20px 28px;color:white;font-family:'Segoe UI',sans-serif;
  z-index:400;display:none;text-align:center;min-width:320px;
  box-shadow:0 0 30px rgba(255,68,0,0.4);
`;
document.body.appendChild(challengeOverlay);

// Champion flash
const championFlash = document.createElement('div');
championFlash.style.cssText = `
  position:fixed;inset:0;background:rgba(0,0,0,0);color:white;
  font-family:'Segoe UI',sans-serif;z-index:500;display:none;
  align-items:center;justify-content:center;pointer-events:none;
`;
document.body.appendChild(championFlash);

// Durability bars during fight
const fightHUD = document.createElement('div');
fightHUD.style.cssText = `
  position:fixed;top:60px;left:50%;transform:translateX(-50%);
  display:none;z-index:200;font-family:'Segoe UI',sans-serif;
  background:rgba(0,0,0,0.8);border-radius:12px;padding:12px 20px;
  border:1px solid rgba(255,68,0,0.4);min-width:400px;
`;
document.body.appendChild(fightHUD);

function updateFightHUD(battle) {
  if (!battle) { fightHUD.style.display = 'none'; return; }
  const chalDur = Math.max(0, battle.challenger?.robot?.durability ?? 100);
  const defDur  = Math.max(0, battle.defender?.robot?.durability ?? 100);
  fightHUD.style.display = 'block';
  fightHUD.innerHTML = `
    <div style="display:flex;gap:16px;align-items:center;justify-content:center;">
      <div style="text-align:right;flex:1;">
        <div style="font-size:0.8rem;color:#4488FF;">${battle.challenger?.robot?.name||'Challenger'}</div>
        <div style="background:rgba(0,0,0,0.4);border-radius:4px;height:10px;overflow:hidden;margin-top:3px;">
          <div style="background:#4488FF;height:100%;width:${chalDur}%;transition:width 0.3s;"></div>
        </div>
        <div style="font-size:0.72rem;opacity:0.5;">${chalDur}/100</div>
      </div>
      <div style="font-size:1.2rem;font-weight:bold;color:#FF4400;">⚔️</div>
      <div style="text-align:left;flex:1;">
        <div style="font-size:0.8rem;color:#FF4444;">${battle.defender?.robot?.name||'Defender'}</div>
        <div style="background:rgba(0,0,0,0.4);border-radius:4px;height:10px;overflow:hidden;margin-top:3px;">
          <div style="background:#FF4444;height:100%;width:${defDur}%;transition:width 0.3s;"></div>
        </div>
        <div style="font-size:0.72rem;opacity:0.5;">${defDur}/100</div>
      </div>
    </div>
  `;
}

function renderBettingUI(battle) {
  battleOverlay.style.display = 'flex';
  battleUIOpen = true;
  if (document.pointerLockElement) document.exitPointerLock();

  const timeLeft = Math.max(0, Math.ceil((battle.bettingEnds - Date.now()) / 1000));

  battleOverlay.innerHTML = `
    <div style="max-width:480px;width:100%;padding:24px;box-sizing:border-box;">
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:2rem;font-weight:bold;color:#FF4400;">⚔️ ROBODUEL</div>
        <div style="opacity:0.5;font-size:0.8rem;margin-top:4px;">Place your bets! ${timeLeft}s remaining</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;margin-bottom:20px;">
        <div style="text-align:center;background:rgba(0,100,255,0.1);border:1px solid rgba(0,100,255,0.3);border-radius:12px;padding:14px;">
          <div style="font-size:1.1rem;font-weight:bold;color:#4488FF;">${battle.challenger.robot.name}</div>
          <div style="opacity:0.5;font-size:0.75rem;">${battle.challenger.username}</div>
          ${battle.challenger.robot.passive ? `<div style="font-size:0.72rem;color:#88FF88;margin-top:3px;">${battle.challenger.robot.passive.good?'✨':'💀'} ${battle.challenger.robot.passive.name}</div>` : ''}
          <div style="color:#4488FF;font-size:1.2rem;font-weight:bold;margin-top:6px;">${battle.challenger.odds}x</div>
          <button onclick="window.battleBet('${battle.battleId}','challenger')"
            style="margin-top:8px;background:rgba(0,100,255,0.3);color:white;border:1px solid rgba(0,100,255,0.5);
            border-radius:8px;padding:6px 14px;cursor:pointer;font-size:12px;font-weight:bold;width:100%;">
            Bet on ${battle.challenger.robot.name}
          </button>
        </div>

        <div style="text-align:center;opacity:0.6;font-size:1.5rem;">VS</div>

        <div style="text-align:center;background:rgba(255,50,50,0.1);border:1px solid rgba(255,50,50,0.3);border-radius:12px;padding:14px;">
          <div style="font-size:1.1rem;font-weight:bold;color:#FF6666;">${battle.defender.robot.name}</div>
          <div style="opacity:0.5;font-size:0.75rem;">${battle.defender.username}</div>
          ${battle.defender.robot.passive ? `<div style="font-size:0.72rem;color:#88FF88;margin-top:3px;">${battle.defender.robot.passive.good?'✨':'💀'} ${battle.defender.robot.passive.name}</div>` : ''}
          <div style="color:#FF6666;font-size:1.2rem;font-weight:bold;margin-top:6px;">${battle.defender.odds}x</div>
          <button onclick="window.battleBet('${battle.battleId}','defender')"
            style="margin-top:8px;background:rgba(255,50,50,0.3);color:white;border:1px solid rgba(255,50,50,0.5);
            border-radius:8px;padding:6px 14px;cursor:pointer;font-size:12px;font-weight:bold;width:100%;">
            Bet on ${battle.defender.robot.name}
          </button>
        </div>
      </div>

      ${battle.wager > 0 ? `
        <div style="text-align:center;opacity:0.6;font-size:0.82rem;margin-bottom:14px;">
          Player wager: ${battle.wager.toLocaleString()} SB each
        </div>` : ''}

      <div style="margin-bottom:14px;">
        <div style="font-size:0.8rem;opacity:0.5;margin-bottom:6px;">Your bet amount:</div>
        <input id="betAmount" type="number" min="10" placeholder="e.g. 100"
          style="width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);
          color:white;padding:10px;border-radius:10px;font-size:14px;outline:none;box-sizing:border-box;">
      </div>

      <div style="display:flex;gap:8px;justify-content:center;margin-bottom:10px;" id="betTotals">
        <span style="opacity:0.4;font-size:0.78rem;">Loading bet totals...</span>
      </div>

      <button onclick="window.closeBattleUI()"
        style="width:100%;background:rgba(255,255,255,0.07);color:white;
        border:1px solid rgba(255,255,255,0.15);border-radius:10px;
        padding:10px;cursor:pointer;font-size:13px;">
        Close (battle continues)
      </button>
    </div>
  `;
}

// ── WINDOW ACTIONS ────────────────────────────────────────────────────────────
window.battleBet = (battleId, side) => {
  const amount = parseInt(document.getElementById('betAmount')?.value) || 0;
  if (amount < 10) { NOTIFY('Minimum bet is 10 SB!'); return; }
  SKT()?.emit('battle:bet', { battleId, side, amount });
};

window.closeBattleUI = () => {
  battleOverlay.style.display = 'none';
  battleUIOpen = false;
};

window.acceptChallenge = (challengeId) => {
  challengeOverlay.style.display = 'none';
  const myRobots = (window._myRobots||[]).filter(r => r.active && (!r.task||r.task==='idle'||r.task==='stay') && (r.durability??100) > 0 && !r.isWreckage);
  if (myRobots.length === 0) {
    NOTIFY('No battle-ready robots!');
    SKT()?.emit('battle:decline', { challengeId });
    return;
  }

  // Show bot picker
  const picker = document.createElement('div');
  picker.id = 'defenderPicker';
  picker.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:rgba(0,0,20,0.97);border:2px solid #FF4400;border-radius:16px;
    padding:24px;color:white;font-family:'Segoe UI',sans-serif;
    z-index:410;min-width:320px;text-align:center;
    box-shadow:0 0 30px rgba(255,68,0,0.4);
  `;
  picker.innerHTML = `
    <div style="font-size:1.2rem;font-weight:bold;color:#FF4400;margin-bottom:14px;">
      ⚔️ Pick Your Fighter!
    </div>
    ${myRobots.map(r => `
      <div onclick="this.parentNode.querySelectorAll('[data-pick]').forEach(el=>el.style.border='1px solid rgba(255,255,255,0.1)');this.style.border='2px solid #FF4400';window._defRobotId='${r.id}';"
        data-pick="${r.id}"
        style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);
        border-radius:8px;padding:10px;margin-bottom:6px;cursor:pointer;text-align:left;">
        <div style="font-weight:bold;">${r.name}</div>
        <div style="opacity:0.45;font-size:0.75rem;">
          ⚡${r.botSpeed||0.5}x | 🛡️${r.durability??100}/100
          ${r.deaths>0?` | 🔥 REBORN x${r.deaths}`:''}
          ${r.passive?` | ${r.passive.good?'✨':'💀'} ${r.passive.name}`:''}
        </div>
      </div>`).join('')}
    <div style="display:flex;gap:8px;margin-top:12px;">
      <button onclick="
        const rid=window._defRobotId;
        if(!rid){window._mineShowNotification('Pick a robot!');return;}
        window._mineGetSocket?.().emit('battle:accept',{challengeId:'${challengeId}',robotId:rid});
        document.getElementById('defenderPicker')?.remove();
      " style="flex:1;background:#FF4400;color:white;border:none;border-radius:8px;
        padding:10px;cursor:pointer;font-weight:bold;">
        ⚔️ Fight!
      </button>
      <button onclick="
        window._mineGetSocket?.().emit('battle:decline',{challengeId:'${challengeId}'});
        document.getElementById('defenderPicker')?.remove();
      " style="flex:1;background:rgba(255,255,255,0.08);color:white;
        border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:10px;cursor:pointer;">
        Decline
      </button>
    </div>
  `;
  document.body.appendChild(picker);
  challengeData = null;
};

window.declineChallenge = (challengeId) => {
  SKT()?.emit('battle:decline', { challengeId });
  challengeOverlay.style.display = 'none';
  challengeData = null;
};

// Open battle betting from referee
window.openBettingFromReferee = () => {
  SKT()?.emit('battle:getActive');
};

// Request duel from player menu -- called from main.js player interaction
window.requestDuel = (targetSocketId) => {
  const myRobots = (window._myRobots||[]).filter(r => r.active && (!r.task||r.task==='idle'||r.task==='stay') && (r.durability??100) > 0);
  if (myRobots.length === 0) { NOTIFY('No battle-ready robots! Need an idle robot with durability.'); return; }

  // Show duel setup
  const duelSetup = document.createElement('div');
  duelSetup.id = 'duelSetupOverlay';
  duelSetup.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:rgba(0,0,20,0.97);border:2px solid #FF4400;border-radius:16px;
    padding:24px;color:white;font-family:'Segoe UI',sans-serif;
    z-index:400;min-width:320px;text-align:center;
    box-shadow:0 0 30px rgba(255,68,0,0.4);
  `;
  duelSetup.innerHTML = `
    <div style="font-size:1.3rem;font-weight:bold;color:#FF4400;margin-bottom:14px;">⚔️ Challenge to RoboDuel!</div>
    <div style="font-size:0.82rem;opacity:0.55;margin-bottom:14px;">Choose your bot and optional wager:</div>
    <div style="margin-bottom:12px;">
      ${myRobots.map(r => `
        <div onclick="this.parentNode.querySelectorAll('[data-bot]').forEach(el=>el.style.border='1px solid rgba(255,255,255,0.1)');this.style.border='2px solid #FF4400';window._duelRobotId='${r.id}';"
          data-bot="${r.id}"
          style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);
          border-radius:8px;padding:10px;margin-bottom:6px;cursor:pointer;text-align:left;">
          <div style="font-weight:bold;">${r.name}</div>
          <div style="opacity:0.45;font-size:0.75rem;">
            ⚡${r.botSpeed||0.5}x | 🛡️${r.durability??100}/100
            ${r.passive?` | ${r.passive.good?'✨':'💀'} ${r.passive.name}`:''}
          </div>
        </div>`).join('')}
    </div>
    <div style="margin-bottom:12px;">
      <div style="font-size:0.78rem;opacity:0.5;margin-bottom:5px;">Wager (optional):</div>
      <input id="duelWager" type="number" min="0" placeholder="0 SB"
        style="width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);
        color:white;padding:8px;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box;">
    </div>
    <div style="display:flex;gap:8px;">
      <button onclick="
        const rid=window._duelRobotId;
        const wager=parseInt(document.getElementById('duelWager')?.value)||0;
        if(!rid){window._mineShowNotification('Pick a robot!');return;}
        window._mineGetSocket?.().emit('battle:challenge',{targetSocketId:'${targetSocketId}',robotId:rid,wager});
        document.getElementById('duelSetupOverlay')?.remove();
        window._mineShowNotification('⚔️ Challenge sent!');
      "
        style="flex:1;background:#FF4400;color:white;border:none;border-radius:8px;
        padding:10px;cursor:pointer;font-weight:bold;font-size:13px;">
        ⚔️ Challenge!
      </button>
      <button onclick="document.getElementById('duelSetupOverlay')?.remove();"
        style="flex:1;background:rgba(255,255,255,0.08);color:white;border:1px solid rgba(255,255,255,0.15);
        border-radius:8px;padding:10px;cursor:pointer;font-size:13px;">
        Cancel
      </button>
    </div>
  `;
  document.body.appendChild(duelSetup);
};

// ── WRECKAGE PILE ─────────────────────────────────────────────────────────────
function buildWreckagePile(x, z) {
  clearWreckagePile();
  const scene = S(); if (!scene) return;
  const g = new THREE.Group();
  [[0,0,0x888888],[0.4,0.2,0x444444],[-0.3,0.3,0xFF2200],[0.2,-0.4,0x666666]].forEach(([ox,oz,col]) => {
    const chunk = new THREE.Mesh(
      new THREE.BoxGeometry(0.25+Math.random()*0.25, 0.15, 0.25+Math.random()*0.2),
      new THREE.MeshLambertMaterial({ color: col })
    );
    chunk.position.set(ox, 0.1, oz);
    chunk.rotation.y = Math.random() * Math.PI;
    g.add(chunk);
  });
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xFF4400, transparent: true, opacity: 0.9 })
  );
  core.position.set(0, 0.3, 0);
  core.userData.isWreckageCore = true;
  g.add(core);
  g.position.set(x, 0, z);
  g.userData.isWreckagePile = true;
  S()?.add(g);
  wreckagePileMesh = g;
}

function clearWreckagePile() {
  if (wreckagePileMesh) { S()?.remove(wreckagePileMesh); wreckagePileMesh = null; }
}

const wreckagePrompt = document.createElement('div');
wreckagePrompt.style.cssText = `
  position:fixed;bottom:110px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,0.82);color:#FF4400;padding:12px 28px;border-radius:12px;
  font-family:sans-serif;font-size:15px;border:1px solid rgba(255,68,0,0.5);
  backdrop-filter:blur(8px);display:none;z-index:102;cursor:pointer;user-select:none;
`;
wreckagePrompt.textContent = "💀 Press E to collect your robot's remains";
wreckagePrompt.addEventListener('click', () => SKT()?.emit('battle:collectWreckage'));
document.body.appendChild(wreckagePrompt);

// ── PROXIMITY ─────────────────────────────────────────────────────────────────
const refPrompt = document.createElement('div');
refPrompt.style.cssText = `
  position:fixed;bottom:110px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,0.82);color:#FF4400;padding:12px 28px;border-radius:12px;
  font-family:sans-serif;font-size:15px;border:1px solid rgba(255,68,0,0.5);
  backdrop-filter:blur(8px);display:none;z-index:100;cursor:pointer;
`;
refPrompt.textContent = '🏟️ Press E to view active battles & place bets';
refPrompt.addEventListener('click', window.openBettingFromReferee);
document.body.appendChild(refPrompt);

let nearReferee = false;

// ── SOCKET EVENTS ─────────────────────────────────────────────────────────────
function setupSocketEvents() {
  const skt = SKT(); if (!skt) return;

  // Incoming challenge
  skt.on('battle:challenged', data => {
    challengeData = data;
    challengeOverlay.style.display = 'block';
    challengeOverlay.innerHTML = `
      <div style="font-size:1.2rem;font-weight:bold;color:#FF4400;margin-bottom:8px;">⚔️ RoboDuel Challenge!</div>
      <div style="opacity:0.7;margin-bottom:6px;">${data.from} challenges you!</div>
      <div style="opacity:0.5;font-size:0.8rem;margin-bottom:4px;">
        Their bot: ${data.robot.name} | ⚡${data.robot.botSpeed||0.5}x | 🛡️${data.robot.durability??100}/100
        ${data.robot.passive?` | ${data.robot.passive.good?'✨':'💀'} ${data.robot.passive.name}`:''}
      </div>
      ${data.wager > 0 ? `<div style="color:#FFD700;font-size:0.85rem;margin-bottom:10px;">Wager: ${data.wager.toLocaleString()} SB</div>` : '<div style="margin-bottom:10px;"></div>'}
      <div style="display:flex;gap:8px;justify-content:center;">
        <button onclick="window.acceptChallenge('${data.challengeId}')"
          style="background:#FF4400;color:white;border:none;border-radius:8px;
          padding:10px 20px;cursor:pointer;font-weight:bold;">
          ⚔️ Accept!
        </button>
        <button onclick="window.declineChallenge('${data.challengeId}')"
          style="background:rgba(255,255,255,0.1);color:white;border:1px solid rgba(255,255,255,0.2);
          border-radius:8px;padding:10px 20px;cursor:pointer;">
          Decline
        </button>
      </div>
    `;
    // Auto-hide after 30s
    setTimeout(() => { challengeOverlay.style.display = 'none'; }, 30000);
  });

  // Battle announced -- show betting UI for spectators only
  skt.on('battle:announced', data => {
    currentBattle = data;
    activeBattles = activeBattles.filter(b => b.battleId !== data.battleId);
    activeBattles.push(data);
    // Only open betting UI automatically for spectators, not the fighters
    const isFighter = data.challenger.username === USR() || data.defender.username === USR();
    if (!isFighter) renderBettingUI(data);
  });

  // Teleport to arena
  skt.on('battle:teleportToArena', data => {
    const cam = CAM(); if (!cam) return;
    const offset = data.side === 'challenger' ? -4 : 4;
    cam.position.set(ARENA_X + offset, 1.7, ARENA_Z);
    NOTIFY('⚔️ You have been teleported to the arena!');
  });

  // Bet totals update
  skt.on('battle:betUpdate', data => {
    const totals = document.getElementById('betTotals');
    if (totals && currentBattle?.battleId === data.battleId) {
      totals.innerHTML = `
        <span style="color:#4488FF;font-size:0.78rem;">🔵 ${data.chalTotal.toLocaleString()} SB bet</span>
        <span style="opacity:0.3;">|</span>
        <span style="color:#FF6666;font-size:0.78rem;">🔴 ${data.defTotal.toLocaleString()} SB bet</span>
      `;
    }
  });

  // Battle starts
  skt.on('battle:start', data => {
    battleOverlay.style.display = 'none';
    battleUIOpen = false;
    fightHUD.style.display = 'block';
    const battle = activeBattles.find(b => b.battleId === data.battleId);
    if (battle) currentBattle = battle;
    NOTIFY('⚔️ FIGHT!');
  });

  // Round result -- fire laser animation
  skt.on('battle:round', data => {
    const battle = activeBattles.find(b => b.battleId === data.battleId);
    if (battle) {
      if (battle.challenger) battle.challenger.robot.durability = data.chalDurability;
      if (battle.defender)   battle.defender.robot.durability   = data.defDurability;
      updateFightHUD(battle);
    }

    if (data.hit) {
      // Determine positions -- challenger left, defender right of arena
      const atkIsChallenger = data.attackerId === currentBattle?.challenger?.username;
      const fromX = ARENA_X + (atkIsChallenger ? -4 : 4);
      const toX   = ARENA_X + (atkIsChallenger ? 4 : -4);
      const color = atkIsChallenger ? 0x4488FF : 0xFF4444;
      fireLaser(
        { x: fromX, y: 1.2, z: ARENA_Z },
        { x: toX,   y: 1.2, z: ARENA_Z },
        color
      );
    }
  });

  // Battle ended -- clean up arena
  skt.on('battle:ended', data => {
    fightHUD.style.display = 'none';
    activeBattles = activeBattles.filter(b => b.battleId !== data.battleId);
    currentBattle = null;

    // Clear all lasers
    activeLasers.forEach(l => S()?.remove(l.mesh));
    activeLasers = [];

    // Remove loser's bot mesh from world if destroyed
    if (data.loserDestroyed) {
      const rm = window._allRobotMeshes?.[data.loser.robot.id];
      if (rm) { S()?.remove(rm.group); delete window._allRobotMeshes[data.loser.robot.id]; }
      // Remove from myRobots if it was mine
      if (window._myRobots) {
        window._myRobots = window._myRobots.filter(r => r.id !== data.loser.robot.id);
      }
    }

    // Recall winner's bot to follow (un-stay it visually)
    const winnerRm = window._allRobotMeshes?.[data.winner.robot.id];
    if (winnerRm && winnerRm.robot) winnerRm.robot.task = 'idle';
  });

  // Champion flash
  skt.on('battle:champion', data => {
    championFlash.style.display = 'flex';
    championFlash.style.background = 'rgba(0,0,0,0.85)';
    championFlash.innerHTML = `
      <div style="text-align:center;">
        <div style="font-size:4rem;margin-bottom:8px;">🏆</div>
        <div style="font-size:2rem;font-weight:bold;color:#FFD700;letter-spacing:3px;">
          CHAMPION
        </div>
        <div style="font-size:1.4rem;color:white;margin-top:6px;">${data.botName}</div>
        <div style="opacity:0.5;font-size:0.9rem;margin-top:4px;">owned by ${data.ownerName}</div>
        ${data.loserDestroyed ? `
          <div style="color:#FF4444;font-size:0.85rem;margin-top:10px;animation:pulse 0.5s infinite;">
            💀 Enemy bot DESTROYED!
          </div>` : ''}
      </div>
    `;
    // Fade out
    setTimeout(() => {
      championFlash.style.transition = 'opacity 1s';
      championFlash.style.opacity = '0';
      setTimeout(() => {
        championFlash.style.display = 'none';
        championFlash.style.opacity = '1';
        championFlash.style.transition = '';
        championFlash.style.background = '';
      }, 1000);
    }, 5000);
  });

  // Active battles list (from referee)
  // Move bot to arena and stay it
  // All clients receive arena positions for both bots
  skt.on('robots:movedToArena', data => {
    data.robots.forEach(rd => {
      // Update own bots
      const myRobot = (window._myRobots||[]).find(r => r.id === rd.robotId);
      if (myRobot) {
        myRobot.task = 'stay';
        myRobot.taskState = null;
        SKT()?.emit('robots:assignTask', { robotId: rd.robotId, task: 'stay' });
      }
      // Update mesh for everyone -- own bots AND other players' bots
      const rm = window._allRobotMeshes?.[rd.robotId];
      if (rm) {
        rm.group.position.set(rd.x, 0, rd.z);
        rm.targetX = rd.x;
        rm.targetZ = rd.z;
        rm.group.rotation.y = rd.rotY;
        if (rm.robot) { rm.robot.task = 'stay'; rm.robot.taskState = null; }
      }
    });
  });

  skt.on('battle:moveBotToArena', data => {
    const robot = (window._myRobots||[]).find(r => r.id === data.robotId);
    if (!robot) return;
    robot.task = 'stay';
    robot.taskState = null;
    SKT()?.emit('robots:assignTask', { robotId: data.robotId, task: 'stay' });
    const rm = window._allRobotMeshes?.[data.robotId];
    if (rm) {
      // Hard snap -- clear all movement targets
      rm.group.position.set(data.x, 0, data.z);
      rm.targetX = data.x;
      rm.targetZ = data.z;
      rm.robot = robot; // sync robot state on mesh
      // Face opponent -- challenger (west side) faces east, defender (east side) faces west
      rm.group.rotation.y = data.x < ARENA_X ? Math.PI / 2 : -Math.PI / 2;
    }
  });

  // Wreckage on ground
  skt.on('battle:wreckagePublic', data => {
    // Show public wreckage pile to everyone
    buildWreckagePile(data.x, data.z);
    // Store as public so E key collects with ownerUsername
    myWreckage = { ...data, isPublic: true };
    NOTIFY(`⚠️ ${data.robot.name}'s remains are up for grabs at the arena!`);
  });

  skt.on('battle:wreckageDropped', data => {
    myWreckage = data;
    buildWreckagePile(data.x, data.z);
    NOTIFY(`💀 ${data.robot.name}'s remains are at the arena. Collect them!`);
  });

  skt.on('battle:wreckageClear', data => {
    if (data.username === USR()) myWreckage = null;
    clearWreckagePile();
  });

  skt.on('battle:wreckageCollected', data => {
    myWreckage = null;
    clearWreckagePile();
    // Refresh robots
    skt.emit('robots:getState');
  });

  skt.emit('battle:getWreckage');

  skt.on('battle:activeList', data => {
    const betting = (data.battles||[]).filter(b => b.phase === 'betting');
    if (betting.length === 0) {
      NOTIFY('No active battles to bet on right now.');
      return;
    }
    renderBettingUI(betting[0]);
  });

  console.log('[Battle Client] Socket events bound');
}

// ── BLOCKED STATE ─────────────────────────────────────────────────────────────
const _prevBlocked = window._mineIsBlocked;
window._mineIsBlocked = () => (_prevBlocked?.() || false) || battleUIOpen;

document.addEventListener('keydown', e => {
  if (e.code === 'Escape' && battleUIOpen) { window.closeBattleUI(); return; }
  if (e.code !== 'KeyE') return;
  if (window._mineIsBlocked()) return;
  if (nearWreckage) {
    const ownerUsername = myWreckage?.isPublic ? myWreckage.username : undefined;
    SKT()?.emit('battle:collectWreckage', ownerUsername ? { ownerUsername } : {});
    return;
  }
  if (nearReferee) window.openBettingFromReferee();
});

// ── TICK ──────────────────────────────────────────────────────────────────────
function tick(delta) {
  const cam = CAM(); if (!cam) return;

  // Referee proximity
  const ref = S()?.userData?.refereePos;
  if (ref) {
    const dx = cam.position.x - ref.x;
    const dz = cam.position.z - ref.z;
    nearReferee = Math.sqrt(dx*dx+dz*dz) < 4;
    refPrompt.style.display = (!battleUIOpen && nearReferee) ? 'block' : 'none';
  }

  // Wreckage proximity
  if (myWreckage && wreckagePileMesh) {
    const wx = wreckagePileMesh.position.x;
    const wz = wreckagePileMesh.position.z;
    const dx = cam.position.x - wx;
    const dz = cam.position.z - wz;
    nearWreckage = Math.sqrt(dx*dx+dz*dz) < 4;
    wreckagePrompt.style.display = nearWreckage ? 'block' : 'none';
    // Pulse the core
    wreckagePileMesh.children.forEach(c => {
      if (c.userData?.isWreckageCore) c.material.opacity = 0.5 + Math.sin(totalTime*3)*0.4;
    });
  } else {
    wreckagePrompt.style.display = 'none';
  }

  // Decay lasers
  for (let i = activeLasers.length - 1; i >= 0; i--) {
    const l = activeLasers[i];
    l.life -= delta;
    l.mesh.material.opacity = Math.max(0, l.life * 2);
    if (l.life <= 0) {
      S()?.remove(l.mesh);
      activeLasers.splice(i, 1);
    }
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────────
function init() {
  buildArena();

  const _poll = setInterval(() => {
    if (SKT()) { setupSocketEvents(); clearInterval(_poll); }
  }, 1000);

  let last = performance.now();
  (function loop() {
    requestAnimationFrame(loop);
    const now = performance.now();
    tick(Math.min((now-last)/1000, 0.05));
    last = now;
  })();

  console.log('[Battle Client] Initialized');
}

(function waitForBridge() {
  if (window._mineScene && window._mineCamera) init();
  else setTimeout(waitForBridge, 100);
})();
