// vendor-client.js -- Robot Marketplace Kiosk
// Add to main.js bridge block: import('./vendor-client.js');

import * as THREE from 'three';

const S      = () => window._mineScene;
const CAM    = () => window._mineCamera;
const SKT    = () => window._mineGetSocket?.();
const USR    = () => window._mineGetUsername?.() || '';
const NOTIFY = (msg) => window._mineShowNotification?.(msg);

// Kiosk position
const KIOSK_X = 65, KIOSK_Z = -9;

// State
let vendorUIOpen   = false;
let nearKiosk      = false;
let vendorTab      = 'browse'; // browse | sell | capacity
let vendorState    = { listings:[], myListings:[], capacity:3, capacityCosts:{2:2000,3:10000}, chips:0 };
let selectedRobotId = null;
let askPrice        = '';

// ── BUILD KIOSK ───────────────────────────────────────────────────────────────
function buildKiosk() {
  const scene = S(); if (!scene) return;
  const X = KIOSK_X, Z = KIOSK_Z;

  // Base platform
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(3.5, 0.2, 2.5),
    new THREE.MeshLambertMaterial({ color: 0x333344 })
  );
  base.position.set(X, 0.1, Z);
  scene.add(base);

  // Main counter body
  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 1.0, 0.6),
    new THREE.MeshLambertMaterial({ color: 0x1a1a2e })
  );
  counter.position.set(X, 0.7, Z + 0.5);
  counter.castShadow = true;
  scene.add(counter);

  // Counter top -- glowing
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(3.3, 0.1, 0.7),
    new THREE.MeshLambertMaterial({ color: 0x00FFCC, emissive: new THREE.Color(0x00FFCC), emissiveIntensity: 0.3 })
  );
  top.position.set(X, 1.22, Z + 0.5);
  scene.add(top);

  // Back wall / backdrop
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 2.2, 0.15),
    new THREE.MeshLambertMaterial({ color: 0x0d0d1a })
  );
  back.position.set(X, 1.2, Z - 0.3);
  scene.add(back);

  // Screen panel on back wall
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 1.4, 0.08),
    new THREE.MeshLambertMaterial({ color: 0x001133, emissive: new THREE.Color(0x002244), emissiveIntensity: 0.8 })
  );
  screen.position.set(X, 1.4, Z - 0.22);
  scene.add(screen);

  // Scrolling scan line effect -- thin strips
  for (let i = 0; i < 5; i++) {
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, 0.04, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x004488, transparent: true, opacity: 0.4 })
    );
    line.position.set(X, 0.72 + i * 0.26, Z - 0.19);
    line.userData.scanLine = true;
    line.userData.scanOffset = i * 0.2;
    scene.add(line);
  }

  // Robot icon on screen -- simplified bot shape
  const botHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.25, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x00FFCC })
  );
  botHead.position.set(X - 0.9, 1.55, Z - 0.19);
  scene.add(botHead);
  const botBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.3, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x0088AA })
  );
  botBody.position.set(X - 0.9, 1.25, Z - 0.19);
  scene.add(botBody);

  // Price tag graphic
  const tag = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.25, 0.06),
    new THREE.MeshBasicMaterial({ color: 0xFFD700 })
  );
  tag.position.set(X - 0.9, 0.98, Z - 0.19);
  scene.add(tag);

  // Roof canopy
  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(4.0, 0.12, 2.0),
    new THREE.MeshLambertMaterial({ color: 0x0d0d1a })
  );
  canopy.position.set(X, 2.38, Z);
  scene.add(canopy);

  // Canopy trim -- cyan
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(4.1, 0.06, 2.1),
    new THREE.MeshLambertMaterial({ color: 0x00FFCC, emissive: new THREE.Color(0x00FFCC), emissiveIntensity: 0.4 })
  );
  trim.position.set(X, 2.32, Z);
  scene.add(trim);

  // Support pillars
  [[-1.5, 0], [1.5, 0], [-1.5, -0.7], [1.5, -0.7]].forEach(([ox, oz]) => {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 2.3, 6),
      new THREE.MeshLambertMaterial({ color: 0x222233 })
    );
    pillar.position.set(X + ox, 1.15, Z + oz);
    scene.add(pillar);
  });

  // Sign above canopy
  const signBoard = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.55, 0.12),
    new THREE.MeshLambertMaterial({ color: 0x0a0a1a })
  );
  signBoard.position.set(X, 2.8, Z - 0.3);
  scene.add(signBoard);

  // Sign text blocks -- "BOT MARKET"
  const signGlow = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.35, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x00FFCC, transparent: true, opacity: 0.85 })
  );
  signGlow.position.set(X, 2.8, Z - 0.24);
  scene.add(signGlow);

  // Ambient point light
  const light = new THREE.PointLight(0x00FFCC, 0.6, 8);
  light.position.set(X, 2, Z);
  scene.add(light);

  console.log('[Vendor] Kiosk built at', X, Z);
}

// ── VENDOR UI ─────────────────────────────────────────────────────────────────
const vendorOverlay = document.createElement('div');
vendorOverlay.style.cssText = `
  position:fixed;inset:0;background:rgba(0,5,15,0.96);color:white;
  font-family:'Segoe UI',sans-serif;z-index:350;display:none;
  align-items:center;justify-content:center;overflow-y:auto;
`;
document.body.appendChild(vendorOverlay);

function passiveBadge(passive) {
  if (!passive) return '';
  const colors = {
    legendary: ['rgba(255,200,0,0.2)','#FFD700'],
    rare:      ['rgba(0,100,255,0.2)','#88AAFF'],
    bad:       ['rgba(255,0,0,0.2)','#FF6666'],
    common:    ['rgba(100,200,100,0.2)','#88FF88'],
  };
  const [bg, col] = colors[passive.rarity] || colors.common;
  return `<span style="background:${bg};color:${col};border-radius:5px;
    padding:1px 6px;font-size:0.7rem;font-weight:bold;margin-left:4px;">
    ${passive.good ? '✨' : '💀'} ${passive.name}
  </span>`;
}

function robotCard(robot, actions = '') {
  const passive = robot.passive;
  return `
    <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(0,255,200,0.2);
      border-radius:12px;padding:12px;margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="font-size:1.4rem;">🤖</div>
        <div style="flex:1;">
          <div style="font-weight:bold;font-size:0.9rem;">${robot.name}</div>
          <div style="opacity:0.45;font-size:0.72rem;">
            ${robot.design?.headShape} · ${robot.design?.torsoShape} · ${robot.design?.bottomShape}
            &nbsp;|&nbsp; ⚡${robot.botSpeed || 0.5}x
            &nbsp;|&nbsp; 🎒${robot.botBagSize || 3}
          </div>
          ${passive ? `<div style="margin-top:3px;">${passiveBadge(passive)}</div>` : ''}
        </div>
        <div style="display:flex;gap:4px;">
          ${['headColor','torsoColor','bottomColor'].map(c =>
            `<span style="width:14px;height:14px;border-radius:3px;display:inline-block;
              background:${robot.design?.[c]||'#444'};border:1px solid rgba(255,255,255,0.2);"></span>`
          ).join('')}
        </div>
      </div>
      ${actions}
    </div>`;
}

function renderVendorUI() {
  const s = vendorState;
  const myRobots = (window._myRobotParts !== undefined)
    ? (window._myRobots || []).filter(r => r.active && (!r.task || r.task === 'idle' || r.task === 'stay'))
    : [];

  vendorOverlay.innerHTML = `
    <div style="max-width:520px;width:100%;padding:22px;box-sizing:border-box;max-height:90vh;overflow-y:auto;">

      <!-- Header -->
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:1.8rem;font-weight:bold;color:#00FFCC;">🤖 Bot Market</div>
        <div style="opacity:0.4;font-size:0.78rem;">Buy, sell, and upgrade your robot fleet</div>
        <div style="margin-top:6px;opacity:0.6;font-size:0.8rem;">
          💰 ${(s.chips||0).toLocaleString()} SB &nbsp;|&nbsp;
          Slots: ${s.capacity}/3
        </div>
      </div>

      <!-- Tabs -->
      <div style="display:flex;gap:6px;margin-bottom:16px;">
        ${[['browse','🏪 Browse'],['sell','💸 Sell'],['capacity','🔓 Slots']].map(([t,l]) => `
          <button onclick="window.vendorTab('${t}')"
            style="flex:1;background:${vendorTab===t?'rgba(0,255,200,0.15)':'rgba(255,255,255,0.05)'};
            color:${vendorTab===t?'#00FFCC':'rgba(255,255,255,0.6)'};
            border:1px solid ${vendorTab===t?'rgba(0,255,200,0.5)':'rgba(255,255,255,0.1)'};
            border-radius:10px;padding:9px;cursor:pointer;font-size:13px;font-weight:bold;">
            ${l}
          </button>`).join('')}
      </div>

      <!-- BROWSE TAB -->
      ${vendorTab === 'browse' ? `
        ${s.listings.length === 0 ? `
          <div style="text-align:center;opacity:0.35;padding:40px 0;font-size:0.9rem;">
            No robots listed yet.<br>Be the first to sell!
          </div>` :
          s.listings.map(listing => `
            ${robotCard(listing.robot, `
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
                <div>
                  <div style="color:#FFD700;font-weight:bold;font-size:1rem;">
                    ${listing.price.toLocaleString()} SB
                  </div>
                  <div style="opacity:0.4;font-size:0.72rem;">
                    Appraised at: ~${listing.appraisal.toLocaleString()} SB
                  </div>
                </div>
                <button onclick="window.vendorBuy('${listing.id}')"
                  ${(s.chips||0) < listing.price ? 'disabled style="opacity:0.35;cursor:not-allowed;"' : ''}
                  style="background:rgba(0,255,200,0.15);color:#00FFCC;
                  border:1px solid rgba(0,255,200,0.4);border-radius:8px;
                  padding:6px 14px;cursor:pointer;font-size:12px;font-weight:bold;">
                  Buy
                </button>
              </div>`
            )}`).join('')
        }` : ''}

      <!-- SELL TAB -->
      ${vendorTab === 'sell' ? `
        ${myRobots.length === 0 ? `
          <div style="text-align:center;opacity:0.35;padding:40px 0;font-size:0.9rem;">
            No idle robots to sell.<br>Recall any tasked bots first.
          </div>` : `
          <div style="opacity:0.5;font-size:0.78rem;margin-bottom:12px;">
            Select a robot to list. Recalled/idle bots only.
          </div>
          ${myRobots.map(robot => {
            const appraisal = robotsAPI_appraise(robot);
            const listPrice = Math.round(appraisal * 2);
            const isSelected = selectedRobotId === robot.id;
            return `
              <div onclick="window.vendorSelectRobot('${robot.id}')"
                style="background:${isSelected?'rgba(0,255,200,0.1)':'rgba(255,255,255,0.04)'};
                border:1px solid ${isSelected?'rgba(0,255,200,0.5)':'rgba(255,255,255,0.1)'};
                border-radius:12px;padding:12px;margin-bottom:8px;cursor:pointer;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="font-size:1.4rem;">${isSelected?'✅':'🤖'}</div>
                  <div style="flex:1;">
                    <div style="font-weight:bold;font-size:0.9rem;">${robot.name}</div>
                    <div style="opacity:0.4;font-size:0.72rem;">
                      ⚡${robot.botSpeed||0.5}x &nbsp;|&nbsp; 🎒${robot.botBagSize||3}
                      ${robot.passive ? ` &nbsp;|&nbsp; ${robot.passive.good?'✨':'💀'} ${robot.passive.name}` : ''}
                    </div>
                    <div style="margin-top:4px;font-size:0.78rem;">
                      <span style="color:#FFD700;">You get: ${appraisal.toLocaleString()} SB</span>
                      <span style="opacity:0.35;margin-left:8px;">Vendor lists at: ${listPrice.toLocaleString()} SB</span>
                    </div>
                  </div>
                </div>
              </div>`;
          }).join('')}

          ${selectedRobotId ? `
            <div style="margin-top:14px;background:rgba(0,0,0,0.3);border-radius:12px;padding:14px;">
              <div style="opacity:0.6;font-size:0.82rem;margin-bottom:10px;line-height:1.7;">
                The vendor pays you <strong style="color:#FFD700;">${robotsAPI_appraise(myRobots.find(r=>r.id===selectedRobotId)||{}).toLocaleString()} SB</strong> immediately.<br>
                They'll relist it for double. No take-backs.
              </div>
              <button onclick="window.vendorListRobot()"
                style="width:100%;background:#AA6600;color:white;border:none;border-radius:10px;
                padding:12px;font-size:14px;font-weight:bold;cursor:pointer;">
                💸 Sell to Vendor
              </button>
            </div>` : ''}
        `}` : ''}

      <!-- CAPACITY TAB -->
      ${vendorTab === 'capacity' ? `
        <div style="text-align:center;margin-bottom:20px;opacity:0.55;font-size:0.85rem;line-height:1.8;">
          More robot slots let you build and operate a bigger fleet.<br>
          More bots = more automation = more empire.
        </div>

        ${[1,2,3,4,5].map(slot => {
          const owned  = s.capacity >= slot;
          const cost   = s.capacityCosts[slot];
          const next   = s.capacity + 1 === slot;
          const canBuy = next && (s.chips||0) >= cost;
          return `
            <div style="background:${owned?'rgba(0,255,200,0.08)':'rgba(255,255,255,0.03)'};
              border:1px solid ${owned?'rgba(0,255,200,0.3)':'rgba(255,255,255,0.08)'};
              border-radius:12px;padding:14px;margin-bottom:10px;
              display:flex;align-items:center;gap:12px;">
              <div style="font-size:1.6rem;">${owned ? '✅' : '🔒'}</div>
              <div style="flex:1;">
                <div style="font-weight:bold;">Slot ${slot}</div>
                <div style="opacity:0.45;font-size:0.78rem;">
                  ${slot === 1 ? 'Starter slot — free' : `Unlocks robot slot ${slot}`}
                </div>
              </div>
              ${owned
                ? `<span style="color:#00FFCC;font-size:0.82rem;">Owned</span>`
                : next
                  ? `<button onclick="window.vendorBuyCapacity()"
                      ${!canBuy?'disabled style="opacity:0.35;cursor:not-allowed;"':''}
                      style="background:rgba(0,200,150,0.2);color:#00FFCC;
                      border:1px solid rgba(0,200,150,0.5);border-radius:8px;
                      padding:8px 16px;cursor:pointer;font-size:12px;font-weight:bold;">
                      ${cost.toLocaleString()} SB
                    </button>`
                  : `<span style="opacity:0.3;font-size:0.8rem;">Unlock slot ${slot-1} first</span>`
              }
            </div>`;
        }).join('')}
      ` : ''}

      <button onclick="window.closeVendor()"
        style="width:100%;background:rgba(255,255,255,0.07);color:white;
        border:1px solid rgba(255,255,255,0.15);border-radius:10px;
        padding:10px;cursor:pointer;font-size:13px;margin-top:10px;">
        Close
      </button>
    </div>
  `;
}

// Appraise locally using passive/upgrade values
function robotsAPI_appraise(robot) {
  let base = 200;
  base += Math.max(0, (robot.botBagSize || 3) - 3) * 150;
  base += Math.max(0, [0.5,1,2,4].indexOf(robot.botSpeed || 0.5)) * 300;
  if (robot.passive) {
    const b = { common:500, rare:1500, legendary:5000, bad:-300 };
    base += b[robot.passive.rarity] || 0;
  }
  return Math.max(50, base);
}

// ── WINDOW ACTIONS ─────────────────────────────────────────────────────────────
window.vendorTab = (tab) => { vendorTab = tab; renderVendorUI(); };
window.vendorSelectRobot = (id) => { selectedRobotId = id; renderVendorUI(); };
window.vendorSetPrice = (v) => { askPrice = v; };
window.vendorListRobot = () => {
  if (!selectedRobotId) return;
  SKT()?.emit('vendor:list', { robotId: selectedRobotId });
  selectedRobotId = null;
  vendorTab = 'browse';
};
window.vendorBuy = (listingId) => {
  SKT()?.emit('vendor:buy', { listingId });
};
window.vendorCancel = (listingId) => {
  SKT()?.emit('vendor:cancel', { listingId });
};
window.vendorBuyCapacity = () => {
  SKT()?.emit('vendor:upgradeCapacity');
};
window.closeVendor = () => {
  vendorOverlay.style.display = 'none';
  vendorUIOpen = false;
};

// ── KIOSK PROMPT ─────────────────────────────────────────────────────────────────
const kioskPrompt = document.createElement('div');
kioskPrompt.style.cssText = `
  position:fixed;bottom:110px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,0.82);color:#00FFCC;padding:12px 28px;border-radius:12px;
  font-family:sans-serif;font-size:15px;border:1px solid rgba(0,255,200,0.4);
  backdrop-filter:blur(8px);display:none;z-index:100;cursor:pointer;user-select:none;
`;
kioskPrompt.textContent = '🤖 Press E to open Bot Market';
kioskPrompt.addEventListener('click', openVendor);
kioskPrompt.addEventListener('touchend', e => { e.preventDefault(); openVendor(); }, { passive:false });
document.body.appendChild(kioskPrompt);

function openVendor() {
  if (document.pointerLockElement) document.exitPointerLock();
  vendorUIOpen = true;
  vendorTab    = 'browse';
  vendorOverlay.style.display = 'flex';
  // Expose myRobots for the sell tab
  window._myRobots = window._myRobots || [];
  SKT()?.emit('vendor:getState');
  renderVendorUI();
}

// ── SOCKET EVENTS ─────────────────────────────────────────────────────────────
function setupSocketEvents() {
  const skt = SKT(); if (!skt) return;

  skt.on('vendor:state', data => {
    vendorState = { ...vendorState, ...data };
    if (vendorUIOpen) renderVendorUI();
  });

  skt.on('vendor:listings', data => {
    vendorState.listings = data.listings || [];
    if (vendorUIOpen) renderVendorUI();
  });

  skt.on('vendor:listed', data => {
    NOTIFY(`💰 Sold ${data.listing.robot.name}!`);
    // Remove mesh from world using global reference
    const rm = window._allRobotMeshes?.[data.listing.robotId];
    if (rm) {
      S()?.remove(rm.group);
      delete window._allRobotMeshes[data.listing.robotId];
    }
    if (window._myRobots) window._myRobots = window._myRobots.filter(r => r.id !== data.listing.robotId);
    SKT()?.emit('vendor:getState');
  });

  skt.on('vendor:bought', data => {
    // Robot was bought -- add to myRobots
    if (window._myRobots) window._myRobots.push(data.robot);
    SKT()?.emit('robots:getState');
    if (vendorUIOpen) renderVendorUI();
  });

  skt.emit('vendor:getState');
  console.log('[Vendor Client] Socket events bound');
}

// Patch blocked state
const _prevVendorBlocked = window._mineIsBlocked;
window._mineIsBlocked = () => (_prevVendorBlocked?.() || false) || vendorUIOpen;

// E key
document.addEventListener('keydown', e => {
  if (e.code === 'Escape' && vendorUIOpen) { window.closeVendor(); return; }
  if (e.code !== 'KeyE') return;
  if (window._mineIsBlocked()) return;
  if (nearKiosk) openVendor();
});

// ── TICK ──────────────────────────────────────────────────────────────────────
function tick(delta, totalTime) {
  const cam = CAM(); if (!cam) return;
  const dx = cam.position.x - KIOSK_X;
  const dz = cam.position.z - KIOSK_Z;
  nearKiosk = Math.sqrt(dx*dx + dz*dz) < 4.5;

  kioskPrompt.style.display = (!vendorUIOpen && nearKiosk) ? 'block' : 'none';

  // Animate scan lines
  S()?.children.forEach(c => {
    if (c.userData?.scanLine) {
      c.position.y = (KIOSK_Z + 0.72 + ((totalTime * 0.3 + c.userData.scanOffset) % 1.3));
      c.material.opacity = 0.2 + Math.sin(totalTime * 2 + c.userData.scanOffset) * 0.15;
    }
  });
}

// ── INIT ──────────────────────────────────────────────────────────────────────
function init() {
  buildKiosk();

  // Expose myRobots mirror for sell tab
  const _origRobotsState = window._mineSetInventory;
  // Poll socket
  const _poll = setInterval(() => {
    if (SKT()) { setupSocketEvents(); clearInterval(_poll); }
  }, 1000);

  // Tick loop
  let last = performance.now();
  let totalTime = 0;
  (function loop() {
    requestAnimationFrame(loop);
    const now = performance.now();
    const delta = Math.min((now - last) / 1000, 0.05);
    totalTime += delta;
    last = now;
    tick(delta, totalTime);
  })();

  // Keep _myRobots in sync with robots-client myRobots
  setInterval(() => {
    if (window._myRobotsRef) window._myRobots = window._myRobotsRef();
  }, 2000);

  console.log('[Vendor Client] Initialized');
}

// Expose so robots-client can give us a live reference
window._vendorSetMyRobots = (fn) => { window._myRobotsRef = fn; };

(function waitForBridge() {
  if (window._mineScene && window._mineCamera) init();
  else setTimeout(waitForBridge, 100);
})();
