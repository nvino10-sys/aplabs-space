// ship-client.js -- Ship System UI
// Triggered via window._openShipMenu() from station E-key on ship

const SHIP_SKT    = () => window._mineGetSocket?.();
const SHIP_NOTIFY = (m) => window._mineShowNotification?.(m);

const SHIP_QUALITY_COLORS = {
  Common:'#AAAAAA', Uncommon:'#44CC44', Rare:'#4488FF',
  Epic:'#AA44FF', Legendary:'#FFB300', Mythic:'#FF2244',
};
const RANK_COLORS = { F:'#888888', E:'#44AA44', D:'#4488FF', C:'#AA44FF', B:'#FFB300', A:'#FF6600', Z:'#FF2244' };
const CLASS_ICONS = { fighter:'✈', miner:'⛏', destroyer:'💥', frigate:'🛸' };
const SLOTS = ['nav','engine','warp','shield','weapon1','weapon2'];
const SLOT_LABELS = { nav:'Navigation', engine:'Engine', warp:'Warp Drive', shield:'Shield', weapon1:'Weapon I', weapon2:'Weapon II' };
const SLOT_ICONS  = { nav:'🧭', engine:'⚡', warp:'🌀', shield:'🛡', weapon1:'🔫', weapon2:'💥' };
// Gundam slots -- sword is sanctum-exclusive
const GUNDAM_SLOTS = ['helmet','body','legs','jetpack','weapon1','weapon2','sword'];
const GUNDAM_SLOT_LABELS = { helmet:'Helmet', body:'Body Armor', legs:'Leg Drive', jetpack:'Jetpack', weapon1:'Turret-L', weapon2:'Turret-R', sword:'Sword Core' };
const GUNDAM_SLOT_ICONS  = { helmet:'⛑', body:'🛡', legs:'⚡', jetpack:'🚀', weapon1:'🔫', weapon2:'💥', sword:'⚔' };
// Menu context -- 'station' for ships, 'sanctum' for gundams
let _menuContext = 'station';
function _isGundam() { return _menuContext === 'sanctum'; }
function _activeSlots() { return _isGundam() ? GUNDAM_SLOTS : SLOTS; }
function _slotLabel(s) { return _isGundam() ? (GUNDAM_SLOT_LABELS[s]||s) : (SLOT_LABELS[s]||s); }
function _slotIcon(s)  { return _isGundam() ? (GUNDAM_SLOT_ICONS[s]||'⬡') : (SLOT_ICONS[s]||'⬡'); }
function _socketPrefix() { return _isGundam() ? 'gundam' : 'ship'; }
function _currency(sd) { return _isGundam() ? (sd.darkMatter||0) : (sd.bars||0); }
function _currencyLabel() { return _isGundam() ? 'Dark Matter' : 'bars'; }
const CRAFT_COSTS = { F:250, E:750, D:2000, C:6000, B:20000, A:60000, Z:200000 };

let shipMenuOpen   = false;
let shipMenuEl     = null;
let shipData       = null;
let activeTab      = 'hangar';
let selectedShipId = null;
let selectedPartId = null;

function injectShipStyles() {
  if (document.getElementById('shipCSS')) return;
  const s = document.createElement('style');
  s.id = 'shipCSS';
  s.textContent = [
    '.ship-tab-btn{background:none;border:none;color:rgba(150,200,255,0.5);font-family:Courier New,monospace;',
    'font-size:13px;letter-spacing:0.12em;padding:14px 22px;cursor:pointer;border-bottom:2px solid transparent;transition:all 0.15s;flex-shrink:0;white-space:nowrap;}',
    '.ship-tab-btn:hover{color:#88CCFF;}',
    '.ship-tab-btn.active{color:#00CCFF;border-bottom-color:#00CCFF;background:rgba(0,100,200,0.08);}',
    '.sbar{height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;margin-top:3px;}',
    '.sbar-fill{height:100%;border-radius:3px;transition:width 0.4s;}',
    '.slot-box{background:rgba(0,20,40,0.6);border:1px solid rgba(0,100,200,0.2);border-radius:8px;padding:10px 12px;cursor:pointer;transition:all 0.15s;min-height:60px;}',
    '.slot-box:hover{border-color:rgba(0,180,255,0.5);}',
    '.part-card{background:rgba(0,15,30,0.8);border-radius:8px;padding:10px 12px;cursor:pointer;transition:all 0.15s;border:1px solid rgba(255,255,255,0.08);}',
    '.part-card:hover{background:rgba(0,30,60,0.9);}',
    '.part-card.sel{border-color:#00AAFF;box-shadow:0 0 10px rgba(0,170,255,0.3);}',
    '.fleet-card{background:rgba(0,15,35,0.8);border:1px solid rgba(0,100,200,0.2);border-radius:8px;padding:10px 14px;cursor:pointer;transition:all 0.15s;min-width:140px;}',
    '.fleet-card:hover{border-color:rgba(0,180,255,0.4);}',
    '.ship-btn{background:rgba(0,30,70,0.8);border:1px solid rgba(0,136,255,0.4);color:#0088FF;font-family:Courier New,monospace;font-size:12px;padding:9px 14px;border-radius:6px;cursor:pointer;letter-spacing:0.08em;transition:all 0.15s;}',
    '.ship-btn:hover{background:rgba(0,50,110,0.9);}',
    '.ship-btn:disabled{opacity:0.35;cursor:not-allowed;}',
    '.ship-btn-red{background:rgba(40,0,0,0.7);border:1px solid rgba(255,50,50,0.3);color:rgba(255,100,100,0.7);}',
    '@keyframes lgPulse{0%,100%{box-shadow:0 0 12px #FFB300}50%{box-shadow:0 0 24px #FFB300}}',
    '@keyframes mPulse{0%,100%{box-shadow:0 0 14px #FF2244}50%{box-shadow:0 0 28px #FF2244}}',
    '@keyframes obBlink{0%,100%{opacity:0.6}50%{opacity:1}}',
    '@keyframes drawSpin{from{transform:rotateY(90deg);opacity:0}to{transform:rotateY(0);opacity:1}}',
    '@keyframes fingerBob{from{transform:translateY(0)}to{transform:translateY(-10px)}}',
    /* Mobile ship menu */
    '@media(max-width:768px){'
    +'.ship-tab-btn{font-size:11px;padding:10px 13px;letter-spacing:0.05em;flex-shrink:0;white-space:nowrap;}'
    +'.fleet-card{min-width:120px;}'
    +'#shipTabContent{padding:14px!important;}'
    +'}',
  ].join('');
  document.head.appendChild(s);
}

window._openShipMenu = function() {
  if (shipMenuOpen) return;
  _menuContext = 'station';
  if (document.pointerLockElement) document.exitPointerLock();
  injectShipStyles();
  shipMenuOpen = true;
  SHIP_SKT()?.emit('ship:getData');
};
window._openGundamMenu = function() {
  if (shipMenuOpen) return;
  _menuContext = 'sanctum';
  if (document.pointerLockElement) document.exitPointerLock();
  injectShipStyles();
  shipMenuOpen = true;
  SHIP_SKT()?.emit('gundam:getData');
};

function closeShipMenu() {
  if (shipMenuEl) { shipMenuEl.remove(); shipMenuEl = null; }
  shipMenuOpen = false;
  if (window._inSanctum) {
    var sc = document.getElementById("scCanvas");
    console.log("[CloseMenu] scCanvas:", sc ? sc.style.display+" z:"+sc.style.zIndex : "NOT FOUND");
    var allCanvas = document.querySelectorAll("canvas");
    allCanvas.forEach(function(c){ console.log("[CloseMenu] canvas:", c.id||"no-id", "display:", c.style.display, "z:", c.style.zIndex); });
    var bigDivs = document.querySelectorAll("div[style*=fixed]");
    bigDivs.forEach(function(d){ console.log("[CloseMenu] fixed div:", d.id||d.className||"?", "z:", d.style.zIndex); });
  }
  _menuContext = 'station';
  if (window._inSanctum) {
    var sc = document.getElementById('scCanvas');
    if (sc) {
      sc.style.display = 'block';
      sc.style.pointerEvents = 'auto';
      sc.style.zIndex = '90';
    }
  }
}
window.closeShipMenu = closeShipMenu;

document.addEventListener('keydown', function(e) {
  if (e.code === 'Escape' && shipMenuOpen) { e.stopPropagation(); closeShipMenu(); }
}, true);

// ── SOCKETS ──────────────────────────────────────────────────────────────────
function setupShipSockets() {
  const skt = SHIP_SKT();
  if (!skt) { setTimeout(setupShipSockets, 600); return; }

  skt.on('ship:data', function(data) {
    shipData = data;
    window._shipMenuData = data;
    selectedShipId = data.activeShipId || (data.ships && data.ships[0] ? data.ships[0].id : null);
    if (!shipMenuOpen || _menuContext !== 'station') return;
    if (!data.soldBroken) showOnboarding();
    else showMainMenu();
  });
  skt.on('gundam:data', function(data) {
    // Map gundam data to ship menu structure
    shipData = {
      ships:            data.gundams || [],
      activeShipId:     data.activeGundamId || null,
      inventory:        data.gundamInventory || [],
      recipes:          data.gundamRecipes || {},
      bars:             data.darkMatter || 0,
      darkMatter:       data.darkMatter || 0,
      researchLevel:    data.gundamResearchLevel || 0,
      researchXP:       data.gundamResearchXP || 0,
      researchTitle:    data.gundamResearchTitle || 'Rookie Pilot',
      researchCost:     data.gundamResearchCost || 500,
      pendingBlueprint: data.pendingGundamBP || null,
      drawsLeft:        data.drawsLeft || 0,
      drawsUsed:        data.drawsUsed || 0,
      soldBroken:       true, // gundams skip onboarding
      drawReady:        data.drawReady !== undefined ? data.drawReady : ((data.drawsLeft||0) > 0 && (data.gundamCount||0) < (data.maxGundams||5)),
      maxShips:         data.maxGundams || 5,
      tutorialDone:     true,
    };
    window._shipMenuData = shipData;
    selectedShipId = data.activeGundamId || (data.gundams && data.gundams[0] ? data.gundams[0].id : null);
    if (!shipMenuOpen || _menuContext !== 'sanctum') return;
    showMainMenu();
  });

  skt.on('ship:soldBroken', function(data) {
    shipData = Object.assign({}, shipData, data, { soldBroken:true, pendingBlueprint:data.blueprint });
    finishOnboarding(data);
  });

  skt.on('ship:drawResult', function(data) {
    shipData.pendingBlueprint = data.blueprint;
    shipData.drawReady = false;
    refreshTab();
    showDrawReveal(data.blueprint);
  });
  skt.on('gundam:drawResult', function(data) {
    shipData.pendingBlueprint = data.blueprint;
    shipData.drawReady = false;
    refreshTab();
    showDrawReveal(data.blueprint);
  });

  skt.on('gundam:crafted', function(data) {
    // Map gundam craft result to ship structure
    if (shipData) shipData.bars = data.darkMatter;
    if (data.gundam) {
      if (!shipData.ships) shipData.ships = [];
      shipData.ships.push(data.gundam);
      shipData.pendingBlueprint = null;
    }
    if (shipMenuOpen) showMainMenu();
  });
  skt.on('ship:crafted', function(data) {
    if (!shipData) return;
    shipData.ships = shipData.ships || [];
    shipData.ships.push(data.ship);
    shipData.pendingBlueprint = null;
    shipData.bars = data.bars;
    shipData.engLevel = data.engLevel;
    selectedShipId = data.ship.id;
    refreshTab();
    if (data.leveled) SHIP_NOTIFY('Engineering Level Up! Lv ' + data.newLevel);
    SHIP_NOTIFY(data.ship.name + ' is ready.');
  });

  skt.on('ship:researched', function(data) {
    if (!shipData) return;
    shipData.research[data.slot] = data.newLevel;
    shipData.bars = data.bars;
    shipData.engLevel = data.engLevel;
    shipData.inventory = shipData.inventory || [];
    shipData.inventory.push(data.part);
    refreshTab();
    SHIP_NOTIFY('Research complete! Got: ' + data.part.rarity + ' ' + data.part.name);
  });

  skt.on('gundam:equipped', function(data) {
    if (data.gundam && shipData) {
      var idx = (shipData.ships||[]).findIndex(function(g){return g.id===data.gundam.id;});
      if (idx>=0) shipData.ships[idx] = data.gundam;
      if (data.gundamInventory) shipData.inventory = data.gundamInventory;
    }
    if (shipMenuOpen) showMainMenu();
  });
  skt.on('gundam:scrapped', function(data) {
    if (shipData && data.darkMatter !== undefined) shipData.bars = data.darkMatter;
    if (data.gundamId && shipData.ships) shipData.ships = shipData.ships.filter(function(g){ return g.id !== data.gundamId; });
    SHIP_NOTIFY('Gundam scrapped. +' + data.refund + ' Dark Matter returned.');
    if (shipMenuOpen) refreshTab();
  });

  skt.on('ship:equipped', function(data) {
    var ship = (shipData.ships||[]).find(function(s){ return s.id === selectedShipId; });
    if (ship) Object.assign(ship.slots, data.ship.slots);
    shipData.inventory = data.inventory;
    refreshTab();
    // After equip — check if engine is now equipped, guide next step
    setTimeout(function() {
      if (!ship || !ship.slots) return;
      if (!ship.slots.engine) {
        SHIP_NOTIFY('Part equipped! You still need an engine to fly. Keep researching or check the Fleet Vendors.');
      } else {
        SHIP_NOTIFY('Engine equipped! Your ship can now fly. Head to HANGAR to set it active.');
      }
    }, 400);
  });

  skt.on('ship:unequipped', function(data) {
    var ship = (shipData.ships||[]).find(function(s){ return s.id === selectedShipId; });
    if (ship) Object.assign(ship.slots, data.ship.slots);
    shipData.inventory = data.inventory;
    refreshTab();
  });

  skt.on('ship:discarded', function(data) {
    shipData.inventory = data.inventory;
    selectedPartId = null;
    refreshTab();
  });

    skt.on('gundam:activeSet', function(data) {
      shipData.activeShipId = data.activeGundamId;
      selectedShipId = data.activeGundamId;
      if (typeof refreshShipMenu === 'function') refreshShipMenu();
    });
  skt.on('ship:activeSet', function(data) {
    shipData.activeShipId = data.shipId;
    window._shipMenuData = shipData;
    if (data.warnings && data.warnings.length) {
      data.warnings.forEach(function(w){ SHIP_NOTIFY('⚠ ' + w); });
    } else {
      SHIP_NOTIFY('Active ship changed.');
    }
    refreshTab();
  });

  skt.on('ship:blueprintSold', function(data) {
    shipData.bars = data.bars;
    shipData.pendingBlueprint = null;
    SHIP_NOTIFY('Blueprint sold for ' + data.refund + ' '+_currencyLabel());
    refreshTab();
  });

  skt.on('ship:error', function(msg) {
    SHIP_NOTIFY('!! ' + msg);
    // Re-enable any stuck roll/recraft buttons
    if (shipMenuEl) {
      shipMenuEl.querySelectorAll('button').forEach(function(b) {
        if (b.textContent === 'ROLLING...' || b.textContent === '[ PROCESSING... ]') {
          b.disabled = false;
          b.style.opacity = '1';
          b.textContent = b.textContent === 'ROLLING...' ? 'ROLL RANDOM PART — ' + fmtNum(shipData.researchCost||250) + ' ' + _currencyLabel() : '[ SELL SHIP ]';
        }
      });
    }
  });

  skt.on('gundam:partRolled', function(data) {
    shipData.inventory = shipData.inventory || [];
    shipData.inventory.push(data.part);
    shipData.bars          = data.darkMatter; // dark matter mapped to bars for display
    shipData.researchLevel = data.gundamResearchLevel;
    shipData.researchCost  = data.gundamResearchCost;
    refreshTab();
    var msg = (data.isNew ? 'NEW RECIPE: ' : 'Crafted: ') + data.part.rarity + ' ' + data.part.name;
    SHIP_NOTIFY(msg);
    if (data.isNew) showPartReveal(data.part, true);
  });
  skt.on('ship:partRolled', function(data) {
    window._shipMenuData = shipData;
    shipData.inventory = shipData.inventory || [];
    shipData.inventory.push(data.part);
    shipData.bars          = data.bars;
    shipData.researchLevel = data.researchLevel;
    shipData.researchXP    = data.researchXP;
    shipData.researchTitle = data.researchTitle;
    shipData.researchCost  = data.researchCost || Math.round(250*(1+data.researchLevel*0.15));
    shipData.recipes       = data.recipes;
    refreshTab();
    var msg = (data.isNew ? 'NEW RECIPE: ' : 'Crafted: ') + data.part.rarity + ' ' + data.part.name;
    SHIP_NOTIFY(msg);
    if (data.isNew) showPartReveal(data.part, true);
  });

  skt.on('ship:permitGranted', function(data) {
    if (!shipData.permits) shipData.permits = {};
    shipData.permits[data.factionId] = data.expiry;
    shipData.bars = data.bars;
    refreshTab();
    SHIP_NOTIFY('Mining permit granted for ' + data.factionId + ' (24h).');
  });

  skt.on('ship:scrapped', function(data) {
    shipData.ships      = data.ships;
    shipData.bars       = data.bars;
    shipData.activeShipId = data.activeShipId;
    selectedShipId = data.activeShipId;
    refreshTab();
    SHIP_NOTIFY((_isGundam()?'Gundam':'Ship')+' scrapped. +' + data.refund + ' '+_currencyLabel()+' returned.');
  });


  skt.on('ship:recipeUnlearned', function(data) {
    shipData.bars    = data.bars;
    shipData.recipes = data.recipes;
    refreshTab();
    SHIP_NOTIFY('+50 bars — recipe unlearned.');
  });

  // Inventory updated from space loot
  skt.on('ship:inventoryUpdate', function(data) {
    if (data.inventory) shipData.inventory = data.inventory;
    if (activeTab === 'parts') refreshTab();
  });

  // Bars updated from space loot/dock
  skt.on('ship:barsUpdate', function(data) {
    if (data.bars !== undefined) shipData.bars = data.bars;
    var hdr = document.getElementById('shipBarsHdr');
    if (hdr) hdr.textContent = Math.floor(data.bars).toLocaleString() + ' ' + _currencyLabel();
  });

  // Parts granted from loot -- refresh parts tab if open
  skt.on('deepspace:lootGranted', function(data) {
    if (data.count > 0 && activeTab === 'parts') refreshTab();
  });

  // Miner status -- update global and re-render if mining tab open
  skt.on('faction:playerMinerStatus', function(data) {
    window._playerMinerStatus = data;
    // Only re-render the miners pane -- never rebuild whole tab (causes duplicates)
    if (activeTab === 'mining') {
      var pane = document.getElementById('miningMinersPane');
      if (pane && window._renderMiners) window._renderMiners();
    }
  });
  skt.on('faction:minerDispatched', function(data) {
    SHIP_NOTIFY('Dispatched: ' + (data.pilotName||'Miner') + ' to ' + (data.mineZone||'zone'));
    skt.emit('faction:getPlayerMiners');
  });
  skt.on('faction:minerRecalled', function(data) {
    SHIP_NOTIFY('Miner recalled.');
    skt.emit('ship:getData'); // refresh ship inventory
    skt.emit('faction:getPlayerMiners');
  });

  // Miner status -- update global and re-render if mining tab open
  skt.on('faction:playerMinerStatus', function(data) {
    window._playerMinerStatus = data;
    if (activeTab === 'mining') {
      var pane = document.getElementById('miningMinersPane');
      if (pane) {
        var ct2 = shipMenuEl ? shipMenuEl.querySelector('#shipTabContent') : null;
        if (ct2) buildMiningTab(ct2);
      }
    }
  });
  skt.on('faction:minerDispatched', function(data) {
    SHIP_NOTIFY('Dispatched: ' + (data.pilotName||'Miner') + ' to ' + (data.mineZone||'zone'));
    skt.emit('faction:getPlayerMiners');
  });
  skt.on('faction:minerRecalled', function(data) {
    SHIP_NOTIFY('Miner recalled.');
    skt.emit('ship:getData'); // refresh ship inventory
    skt.emit('faction:getPlayerMiners');
  });

  skt.on('ship:recrafted', function(data) {
    shipData.inventory = shipData.inventory || [];
    shipData.inventory.push(data.part);
    shipData.bars = data.bars;
    refreshTab();
    SHIP_NOTIFY('Recrafted: ' + data.part.rarity + ' ' + data.part.name);
  });

  skt.on('ship:designSaved', function(data) {
    var ship = (shipData.ships||[]).find(function(s){ return s.id === data.shipId; });
    if (ship) ship.design = data.design;
    // No refreshTab — design tab manages its own state to avoid resetting user inputs
  });

  skt.on('ship:designLocked', function(data) {
    var ship = (shipData.ships||[]).find(function(s){ return s.id === data.shipId; });
    if (ship) ship.designLocked = true;
    // Navigate to hangar and show locked confirmation
    activeTab = 'hangar';
    if (shipMenuEl) {
      shipMenuEl.querySelectorAll('.ship-tab-btn').forEach(function(b){ b.classList.toggle('active', b.dataset.tab==='hangar'); });
    }
    window._pendingDesignLock = data.shipId;
    refreshTab();
  });
}

// ── ONBOARDING ───────────────────────────────────────────────────────────────
function showOnboarding() {
  if (shipMenuEl) shipMenuEl.remove();
  var el = document.createElement('div');
  el.id = 'shipOB';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.96);z-index:800;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Courier New,monospace;';

  var linesDiv = document.createElement('div');
  linesDiv.style.cssText = 'max-width:520px;text-align:center;';

  var sellArea = document.createElement('div');
  sellArea.style.cssText = 'display:none;margin-top:40px;text-align:center;';

  var label = document.createElement('div');
  label.style.cssText = 'color:rgba(255,255,255,0.35);font-size:12px;letter-spacing:0.2em;margin-bottom:16px;';
  label.textContent = 'SHIP VALUE: SCRAP';
  sellArea.appendChild(label);

  var sellBtn = document.createElement('button');
  sellBtn.textContent = '[ SELL SHIP ]';
  sellBtn.style.cssText = 'background:linear-gradient(135deg,#1a3a1a,#0d2a0d);border:2px solid #44FF44;color:#44FF44;font-family:Courier New,monospace;font-size:18px;font-weight:bold;padding:16px 52px;border-radius:8px;cursor:pointer;box-shadow:0 0 20px rgba(68,255,68,0.4);letter-spacing:0.15em;';
  sellArea.appendChild(sellBtn);

  var finger = document.createElement('div');
  finger.textContent = 'tap here';
  finger.style.cssText = 'font-size:14px;color:#44FF44;margin-top:12px;animation:fingerBob 0.8s ease-in-out infinite alternate;letter-spacing:0.1em;';
  sellArea.appendChild(finger);

  var closeBtn = document.createElement('button');
  closeBtn.textContent = 'X';
  closeBtn.style.cssText = 'position:absolute;top:20px;right:24px;background:none;border:none;color:rgba(255,255,255,0.3);font-size:22px;cursor:pointer;';
  closeBtn.onclick = closeShipMenu;

  el.appendChild(linesDiv);
  el.appendChild(sellArea);
  el.appendChild(closeBtn);
  document.body.appendChild(el);
  shipMenuEl = el;

  var lines = [
    { text:'Your ship...', color:'#CCCCCC', size:'22px', delay:600 },
    { text:'smells funny.', color:'#AAAAAA', size:'18px', delay:900 },
    { text:'A worm may have had an incident in here.', color:'#888888', size:'13px', delay:1400, italic:true },
    { text:'────────────────────────────', color:'rgba(255,255,255,0.1)', size:'12px', delay:500 },
    { text:'STATUS: DESTROYED', color:'#FF4444', size:'28px', delay:800 },
    { text:'────────────────────────────', color:'rgba(255,255,255,0.1)', size:'12px', delay:400 },
    { text:"You're going to need to sell that.", color:'#AACCFF', size:'15px', delay:900 },
    { text:'Find a way out of here.', color:'#AACCFF', size:'15px', delay:1000 },
  ];

  var t = 800;
  lines.forEach(function(line) {
    t += line.delay;
    (function(ln, delay) {
      setTimeout(function() {
        var d = document.createElement('div');
        d.style.cssText = 'color:'+ln.color+';font-size:'+(ln.size||'16px')+';margin:8px 0;letter-spacing:0.08em;animation:obBlink 2s ease-in-out infinite;'+(ln.italic?'font-style:italic;':'');
        d.textContent = ln.text;
        linesDiv.appendChild(d);
      }, delay);
    })(line, t);
  });

  (function(delay) {
    setTimeout(function() { sellArea.style.display = 'block'; }, delay + 800);
  })(t);

  sellBtn.onclick = function() {
    sellBtn.disabled = true;
    sellBtn.textContent = '[ PROCESSING... ]';
    sellBtn.style.opacity = '0.6';
    SHIP_SKT()?.emit('ship:sellBroken');
  };
}

function finishOnboarding(data) {
  var el = document.getElementById('shipOB');
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);

  var wrap = document.createElement('div');
  wrap.style.cssText = 'text-align:center;font-family:Courier New,monospace;max-width:500px;';

  function addLine(text, css) {
    var d = document.createElement('div');
    d.style.cssText = css;
    d.textContent = text;
    wrap.appendChild(d);
  }

  addLine('TRANSACTION COMPLETE', 'color:#44FF44;font-size:14px;letter-spacing:0.2em;margin-bottom:8px;');
  addLine('+ 1,000 BARS', 'color:#CCFFCC;font-size:28px;font-weight:bold;margin:12px 0;');
  addLine('+ 1e55 SpaceBucks', 'color:#AACCFF;font-size:20px;margin:8px 0;');

  var hr = document.createElement('div');
  hr.style.cssText = 'border:1px solid rgba(255,255,255,0.1);margin:24px auto;width:320px;';
  wrap.appendChild(hr);

  addLine('Your first ship blueprint has been generated.', 'color:#CCCCCC;font-size:14px;margin-bottom:20px;');

  if (data.blueprint) {
    var bpDiv = document.createElement('div');
    bpDiv.innerHTML = blueprintCardHTML(data.blueprint);
    wrap.appendChild(bpDiv);
  }

  var openBtn = document.createElement('button');
  openBtn.textContent = 'OPEN SHIP TERMINAL';
  openBtn.style.cssText = 'margin-top:28px;background:linear-gradient(135deg,#001833,#00264d);border:2px solid #0088FF;color:#88CCFF;font-family:Courier New,monospace;font-size:15px;padding:14px 40px;border-radius:8px;cursor:pointer;letter-spacing:0.1em;';
  openBtn.onclick = function() {
    closeShipMenu();
    setTimeout(function() { shipMenuOpen = true; injectShipStyles(); showMainMenu(); }, 100);
  };
  wrap.appendChild(openBtn);
  el.appendChild(wrap);
}

// ── MAIN MENU ────────────────────────────────────────────────────────────────
function showMainMenu() {
  if (shipMenuEl) shipMenuEl.remove();

  var el = document.createElement('div');
  el.id = 'shipMenu';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,3,12,0.97);z-index:800;display:flex;flex-direction:column;font-family:Courier New,monospace;overflow:hidden;';

  // Header
  var isMobileMenu = window.innerWidth < 900;
  var hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;flex-direction:column;border-bottom:1px solid rgba(0,100,200,0.25);background:rgba(0,8,20,0.8);flex-shrink:0;';
  var titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:' + (isMobileMenu?'8px 12px':'0 24px') + ';';
  var titleWrap = document.createElement('div');
  titleWrap.style.cssText = 'display:flex;align-items:center;gap:' + (isMobileMenu?'8px':'16px') + ';font-size:' + (isMobileMenu?'10px':'12px') + ';color:rgba(150,200,255,0.7);flex:1;min-width:0;';
  titleWrap.innerHTML = '<span style="color:#00AAFF;font-size:' + (isMobileMenu?'13px':'18px') + ';font-weight:bold;letter-spacing:0.1em;white-space:nowrap;">SHIP SYSTEMS</span>'
    + '<span style="color:rgba(255,255,255,0.2);">|</span>'
    + '<span style="color:rgba(150,200,255,0.7);white-space:nowrap;">Lv <span id="ssEng" style="color:#FFB300;font-weight:bold;"></span></span>'
    + '<span style="color:rgba(255,255,255,0.2);">|</span>'
    + '<span id="shipBarsHdr" style="color:#44FF88;white-space:nowrap;"><span id="ssBars"></span> <span id="ssBarsLabel">bars</span></span>';
  var tabWrap = document.createElement('div');
  tabWrap.style.cssText = 'display:flex;align-items:center;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:' + (isMobileMenu?'0 4px 2px':'0 16px') + ';';
  var tabWrap = document.createElement('div');
  tabWrap.style.cssText = 'display:flex;align-items:center;';

  // Show mining tab if player owns, has dispatched, or has ever crafted a miner
  var hasMiner = (shipData.ships && shipData.ships.some(function(s){ return s.class === 'miner'; }))
    || (window._playerMinerStatus && window._playerMinerStatus.length > 0)
    || shipData.hasMinerAccess
    || (shipData.totalShipsCrafted && shipData.totalShipsCrafted > 0);
  var tabDefs = [['hangar','HANGAR'],['design','DESIGN'],['research','RESEARCH'],['parts','PARTS'],['draw','DAILY DRAW']];
  if (hasMiner) tabDefs.push(['mining','MINING']);
  var _newPartsCount = window._shipNewParts || 0;
  tabDefs.forEach(function(td) {
    var b = document.createElement('button');
    b.className = 'ship-tab-btn' + (td[0]==='hangar' ? ' active' : '');
    b.dataset.tab = td[0];
    b.textContent = td[1] + (td[0]==='parts' && _newPartsCount>0 ? ' ●'+_newPartsCount : '');
    if (td[0]==='parts' && _newPartsCount>0) b.style.color='#00FFB8';
    b.addEventListener('click', function() {
      el.querySelectorAll('.ship-tab-btn').forEach(function(x){ x.classList.remove('active'); });
      b.classList.add('active');
      activeTab = td[0];
      if (td[0] === 'parts') window._shipNewParts = 0; // clear before refresh so dot goes away
      refreshTab();
    });
    tabWrap.appendChild(b);
  });

  var xBtn = document.createElement('button');
  xBtn.textContent = 'X';
  xBtn.style.cssText = 'background:none;border:none;color:rgba(255,255,255,0.3);font-size:20px;cursor:pointer;padding:14px 16px;margin-left:8px;';
  xBtn.onclick = closeShipMenu;
  titleRow.appendChild(titleWrap);
  titleRow.appendChild(xBtn);
  hdr.appendChild(titleRow);

  hdr.appendChild(tabWrap);

  var content = document.createElement('div');
  content.id = 'shipTabContent';
  content.style.cssText = 'flex:1;overflow-y:auto;padding:24px;scrollbar-width:thin;scrollbar-color:#0a2a4a transparent;';

  el.appendChild(hdr);
  el.appendChild(content);
  document.body.appendChild(el);
  shipMenuEl = el;

  refreshTab();
}

function refreshTab() {
  if (!shipMenuEl || !shipData) return;
  var engEl  = shipMenuEl.querySelector('#ssEng');
  var barsEl = shipMenuEl.querySelector('#ssBars');
  var barsLblEl = shipMenuEl.querySelector('#ssBarsLabel');
  if (barsLblEl) barsLblEl.textContent = _currencyLabel();
  if (engEl)  engEl.textContent  = shipData.researchLevel !== undefined ? shipData.researchLevel : (shipData.engLevel || 0);
  if (barsEl) barsEl.textContent = fmtNum(shipData.bars || 0) + ' ' + _currencyLabel();
  var ct = shipMenuEl.querySelector('#shipTabContent');
  if (!ct) return;
  while (ct.firstChild) ct.removeChild(ct.firstChild);
  if      (activeTab === 'hangar')   buildHangarTab(ct);
  else if (activeTab === 'research') buildResearchTab(ct);
  else if (activeTab === 'parts') {
    buildPartsTab(ct);
  }
  else if (activeTab === 'draw')     buildDrawTab(ct);
  else if (activeTab === 'mining')   buildMiningTab(ct);
  else if (activeTab === 'design')   { if (_isGundam()) buildGundamDesignTab(ct); else buildDesignTab(ct); }
}

// ── HANGAR ───────────────────────────────────────────────────────────────────
function buildHangarTab(ct) {
  var ships = shipData.ships || [];
  if (!ships.length) {
    showCenteredMsg(ct, 'NO SHIPS IN FLEET', 'Craft your first blueprint from the DAILY DRAW tab.', null);
    return;
  }
  // Show design locked confirmation if coming from finalize
  if (window._pendingDesignLock) {
    var lockedShipId = window._pendingDesignLock;
    var lockedShip   = ships.find(function(s){ return s.id===lockedShipId; });
    window._pendingDesignLock = null;
    if (lockedShip) {
      var qc = SHIP_QUALITY_COLORS[lockedShip.quality]||'#888';
      // Full screen lock confirmation with preview
      var lockScreen = document.createElement('div');
      lockScreen.style.cssText = 'max-width:700px;margin:0 auto;text-align:center;font-family:Courier New,monospace;padding:20px 0;';

      var lockIcon = document.createElement('div');
      lockIcon.style.cssText = 'font-size:36px;margin-bottom:8px;';
      lockIcon.textContent = '🔒';
      lockScreen.appendChild(lockIcon);

      var lockTitle = document.createElement('div');
      lockTitle.style.cssText = 'color:#44FF88;font-size:18px;font-weight:bold;letter-spacing:0.12em;margin-bottom:4px;';
      lockTitle.textContent = 'DESIGN LOCKED';
      lockScreen.appendChild(lockTitle);

      var lockName = document.createElement('div');
      lockName.style.cssText = 'color:'+qc+';font-size:14px;margin-bottom:4px;text-shadow:0 0 10px '+qc+';';
      lockName.textContent = lockedShip.name;
      lockScreen.appendChild(lockName);

      var lockSub = document.createElement('div');
      lockSub.style.cssText = 'color:rgba(150,200,255,0.4);font-size:12px;margin-bottom:20px;';
      lockSub.textContent = lockedShip.quality.toUpperCase()+' '+( lockedShip.classLabel||lockedShip.class)+' · RANK '+lockedShip.rank;
      lockScreen.appendChild(lockSub);

      // Ship preview canvas
      var previewRow = document.createElement('div');
      previewRow.style.cssText = 'display:flex;justify-content:center;margin-bottom:20px;';
      var cw = document.createElement('div');
      cw.style.cssText = 'border-radius:12px;overflow:hidden;background:#00040C;border:2px solid '+qc+'66;box-shadow:0 0 20px '+qc+'33;';
      var pCanvas = document.createElement('canvas');
      pCanvas.width=360; pCanvas.height=220; pCanvas.style.cssText='display:block;';
      cw.appendChild(pCanvas);
      previewRow.appendChild(cw);
      lockScreen.appendChild(previewRow);

      var lockMsg = document.createElement('div');
      lockMsg.style.cssText = 'color:rgba(150,200,255,0.5);font-size:13px;margin-bottom:20px;line-height:1.7;';
      lockMsg.textContent = 'Your ship is ready. Head to the PARTS tab to equip your loadout. An engine is required to fly — equip one to activate your ship.';
      lockScreen.appendChild(lockMsg);

      var goPartsBtn = document.createElement('button');
      goPartsBtn.className = 'ship-btn';
      goPartsBtn.style.cssText = 'font-size:14px;padding:14px 40px;border-color:rgba(0,200,100,0.6);color:#44FF88;';
      goPartsBtn.textContent = '→ EQUIP PARTS';
      goPartsBtn.addEventListener('click', function() {
        activeTab = 'parts';
        shipMenuEl.querySelectorAll('.ship-tab-btn').forEach(function(b){ b.classList.toggle('active',b.dataset.tab==='parts'); });
        refreshTab();
      });
      lockScreen.appendChild(goPartsBtn);
      ct.appendChild(lockScreen);

      // Draw ship preview
      var lDesign = lockedShip.design || { nose:'dart', body:'sleek', engines:'twin', colPri:'#4488CC', colSec:'#223344', colGlow:'#00CCFF' };
      requestAnimationFrame(function() { drawShipPreview(pCanvas, lockedShip, lDesign, Date.now()); });

      // Auto-navigate to parts after 4s if user doesn't click
      setTimeout(function() {
        if (shipMenuEl && activeTab === 'hangar') {
          activeTab = 'parts';
          shipMenuEl.querySelectorAll('.ship-tab-btn').forEach(function(b){ b.classList.toggle('active',b.dataset.tab==='parts'); });
          refreshTab();
        }
      }, 4000);
      return; // Don't render rest of hangar behind lock screen
    }
  }
  var ship = ships.find(function(s){ return s.id === selectedShipId; }) || ships[0];

  // Fleet header with cap
  var fleetHdr = document.createElement('div');
  var _sc = ships.length, _maxS = shipData.maxShips||5, _mc = ships.filter(function(s){return s.class==='miner';}).length;
  fleetHdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;';
  fleetHdr.innerHTML = '<span style="color:rgba(150,200,255,0.5);font-size:11px;letter-spacing:0.1em;">YOUR FLEET</span>'
    +'<span style="font-size:11px;"><span style="color:'+(_sc>=_maxS?'#FF8844':'#44FF88')+';font-weight:bold;">'+_sc+'/'+_maxS+'</span>'
    +' ships &nbsp;·&nbsp; <span style="color:rgba(150,200,255,0.4);">'+_mc+'/3 miners</span></span>';
  ct.appendChild(fleetHdr);
  var fleet = document.createElement('div');
  fleet.style.cssText = 'display:flex;gap:10px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:8px;margin-bottom:16px;scrollbar-width:thin;scrollbar-color:#0a2a4a transparent;';
  ships.forEach(function(s) {
    var qc = SHIP_QUALITY_COLORS[s.quality] || '#888';
    var isActive = s.id === selectedShipId;
    var card = document.createElement('div');
    card.className = 'fleet-card';
    card.style.cssText = 'background:rgba(0,15,35,0.8);border:1px solid '+(isActive?qc:'rgba(0,100,200,0.2)')+';border-radius:8px;padding:10px 14px;cursor:pointer;transition:all 0.15s;min-width:160px;'
      +(isActive?'box-shadow:0 0 12px '+qc+'44;':'');

    // Mini preview canvas if design exists, else icon
    var previewWrap = document.createElement('div');
    previewWrap.style.cssText = 'margin-bottom:6px;border-radius:6px;overflow:hidden;background:#00040C;';
    if (s.design && s.design.nose) {
      var mini = document.createElement('canvas');
      mini.width = 140; mini.height = 70;
      mini.style.cssText = 'display:block;';
      previewWrap.appendChild(mini);
      (function(ship, canvas) {
        requestAnimationFrame(function() {
          var d = ship.design;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#00040C'; ctx.fillRect(0,0,140,70);
          // Tiny stars
          var rng = mulberry32(ship.id ? ship.id.charCodeAt(0) : 42);
          for (var i=0;i<30;i++) { ctx.fillStyle='rgba(255,255,255,'+(0.2+rng()*0.6)+')'; ctx.fillRect(rng()*140,rng()*70,1,1); }
          var sqc = SHIP_QUALITY_COLORS[ship.quality] || '#4488CC';
          ctx.save(); ctx.translate(70, 35);
          ctx.scale(0.38, 0.38);
          if (d.body === 'ufo') {
            drawUFOBody(ctx, d, 0.1, sqc, 4, 0);
          } else {
            drawEngineGlow(ctx, d.engines, ship.class, 0);
            drawShipBody(ctx, d, ship.class, 0.1, sqc, 4);
          }
          ctx.restore();
        });
      })(s, mini);
    } else {
      var iconCanvas = document.createElement('canvas');
      iconCanvas.width=140; iconCanvas.height=70;
      iconCanvas.style.cssText='display:block;';
      (function(ship, cv) {
        requestAnimationFrame(function(){
          var ctx2 = cv.getContext('2d');
          ctx2.fillStyle='#00040C'; ctx2.fillRect(0,0,140,70);
          var rng2 = mulberry32(ship.id ? ship.id.charCodeAt(0)+1 : 99);
          for(var i=0;i<20;i++){ctx2.fillStyle='rgba(255,255,255,'+(0.2+rng2()*0.5)+')';ctx2.fillRect(rng2()*140,rng2()*70,1,1);}
          var sqc2 = SHIP_QUALITY_COLORS[ship.quality]||'#4488CC';
          // Glow halo behind icon
          var grd = ctx2.createRadialGradient(70,35,5,70,35,36);
          grd.addColorStop(0, sqc2+'66');
          grd.addColorStop(1, 'transparent');
          ctx2.fillStyle=grd; ctx2.beginPath(); ctx2.arc(70,35,36,0,Math.PI*2); ctx2.fill();
          ctx2.font='bold 30px Arial';
          ctx2.textAlign='center'; ctx2.textBaseline='middle';
          ctx2.shadowColor=sqc2; ctx2.shadowBlur=18;
          ctx2.fillStyle='#FFFFFF';
          ctx2.fillText(CLASS_ICONS[ship.class]||'?', 70, 37);
          ctx2.shadowBlur=0;
        });
      })(s, iconCanvas);
      previewWrap.appendChild(iconCanvas);
    }
    card.appendChild(previewWrap);

    var qDiv = document.createElement('div');
    qDiv.style.cssText = 'color:'+qc+';font-size:10px;font-weight:bold;';
    qDiv.textContent = s.quality.toUpperCase();
    card.appendChild(qDiv);

    var nDiv = document.createElement('div');
    nDiv.style.cssText = 'color:#AACCFF;font-size:11px;margin-top:2px;';
    nDiv.textContent = s.name;
    card.appendChild(nDiv);

    var cDiv = document.createElement('div');
    cDiv.style.cssText = 'color:rgba(150,200,255,0.4);font-size:10px;';
    cDiv.textContent = (s.classLabel||s.class) + ' · ' + s.rank;
    card.appendChild(cDiv);

    if (shipData.activeShipId === s.id) {
      var aDiv = document.createElement('div');
      aDiv.style.cssText = 'color:#44FF88;font-size:10px;margin-top:3px;';
      aDiv.textContent = '▶ ACTIVE';
      card.appendChild(aDiv);
    }
    if (!s.designLocked) {
      var dDiv = document.createElement('div');
      dDiv.style.cssText = 'color:#FFDD44;font-size:10px;margin-top:2px;';
      dDiv.textContent = '✏ Needs Design';
      card.appendChild(dDiv);
    }

    card.addEventListener('click', function() { selectedShipId = s.id; refreshTab(); });
    fleet.appendChild(card);
  });
  ct.appendChild(fleet);
  buildShipDetail(ct, ship);
}

function buildShipDetail(ct, ship) {
  if (!ship) return;
  var qc    = SHIP_QUALITY_COLORS[ship.quality] || '#888';
  var rankC = RANK_COLORS[ship.rank] || '#888';
  var st    = ship.stats;

  // SHIP CANNOT FLY banner if no engine -- skip for gundams
  var hasEngine = _isGundam() || (ship.slots && ship.slots.engine);
  if (!hasEngine) {
    var noBanner = document.createElement('div');
    noBanner.style.cssText = 'background:rgba(60,0,0,0.85);border:1px solid rgba(255,50,50,0.5);border-radius:10px;padding:12px 18px;margin-bottom:18px;display:flex;align-items:center;gap:12px;';
    noBanner.innerHTML = '<span style="font-size:20px;">🚫</span>'
      + '<div><div style="color:#FF4444;font-size:13px;font-weight:bold;letter-spacing:0.1em;">SHIP CANNOT FLY</div>'
      + '<div style="color:rgba(255,150,150,0.6);font-size:11px;">No engine equipped. Go to RESEARCH to craft one, or check the Fleet Vendors.</div></div>';
    ct.appendChild(noBanner);
  }

  var grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:' + (window.innerWidth<768?'1fr':'1fr 1fr') + ';gap:16px;max-width:900px;margin:0 auto;';

  // Left card
  var left = document.createElement('div');
  left.style.cssText = 'background:rgba(0,10,25,0.8);border:1px solid ' + qc + '44;border-radius:12px;padding:22px;';
  if (ship.quality === 'Legendary') left.style.animation = 'lgPulse 2s ease-in-out infinite';
  if (ship.quality === 'Mythic')    left.style.animation = 'mPulse 2s ease-in-out infinite';

  left.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:16px;">'
    + '<div><div style="font-size:36px;">'+(_isGundam()?(GUNDAM_CLASS_ICONS[ship.class]||'⚙'):(CLASS_ICONS[ship.class]||'?'))+'</div>'
    + '<div style="color:'+qc+';font-size:13px;font-weight:bold;margin-top:4px;">'+ship.quality.toUpperCase()+'</div></div>'
    + '<div style="text-align:right;"><div style="color:'+rankC+';font-size:28px;font-weight:bold;">RANK '+ship.rank+'</div>'
    + '<div style="color:rgba(150,200,255,0.4);font-size:11px;">'+(ship.classLabel||ship.class)+'</div></div></div>'
    + '<div style="color:#CCEEFF;font-size:15px;font-weight:bold;margin-bottom:4px;">'+ship.name+'</div>'
    + '<div style="border:1px solid rgba(0,100,200,0.2);margin:14px 0;"></div>';

  var statDefs = _isGundam() ? [
    ['Shield HP', fmtNum(st.shieldHP||0), Math.min(100,((st.shieldHP||0)/500000)*100), '#4488FF'],
    ['Shield Regen', fmtNum(st.shieldRegen||0)+'/s', Math.min(100,((st.shieldRegen||0)/5000)*100), '#44AAFF'],
    ['Speed', (st.speed||0)+'x', Math.min(100,(st.speed||0)*100), '#44FF88'],
    ['Sword Dmg', fmtNum(st.swordDmg||0), Math.min(100,((st.swordDmg||0)/2000000)*100), '#FF4444'],
    ['Turret Dmg', fmtNum(st.turretDmg||0), Math.min(100,((st.turretDmg||0)/1000000)*100), '#FF8800'],
    ['Warp Range', (st.warpRange||0)+'x', Math.min(100,((st.warpRange||0)/3.5)*100), '#AA44FF'],
  ] : [
    ['Hull', st.hull + ' hits', (st.hull/10)*100, '#FFB300'],
    ['Shield HP', fmtNum(st.shield), Math.min(100,(st.shield/100000)*100), '#4488FF'],
    ['Shield Regen', st.shieldRegen+'/s', Math.min(100,(st.shieldRegen/10)*100), '#44AAFF'],
    ['Engine', (st.engine*10).toFixed(1)+'x', st.engine*100, '#44FF88'],
    ['Missile', fmtNum(st.missileDmg||0), Math.min(100,((st.missileDmg||0)/1000000)*100), '#FF4444'],
    ['Warp', (st.warp*5).toFixed(1)+'x', st.warp*100, '#AA88FF'],
    ['Nav Radius', String(st.nav), (st.nav/10)*100, '#FFFF44'],
    ['Cargo', st.cargo+' slots', Math.min(100,(st.cargo/100)*100), '#FF8844'],
    ['Weapon Cap', st.weaponCap+'/10', (st.weaponCap/10)*100, '#FF4488'],
  ];

  statDefs.forEach(function(r) {
    var row = document.createElement('div');
    row.style.cssText = 'margin-bottom:10px;';
    row.innerHTML = '<div style="display:flex;justify-content:space-between;font-size:12px;">'
      + '<span style="color:rgba(150,200,255,0.55);">'+r[0]+'</span>'
      + '<span style="color:'+r[3]+';font-weight:bold;">'+r[1]+'</span></div>'
      + '<div class="sbar"><div class="sbar-fill" style="width:'+Math.min(100,r[2])+'%;background:'+r[3]+';"></div></div>';
    left.appendChild(row);
  });

  var isActive = shipData.activeShipId === ship.id;
  if (!isActive) {
    var ab = document.createElement('button');
    ab.className = 'ship-btn';
    ab.style.width = '100%';
    ab.style.marginTop = '12px';
    ab.textContent = 'SET AS ACTIVE SHIP';
    ab.addEventListener('click', function() { SHIP_SKT()?.emit(_socketPrefix()+':setActive', { shipId: ship.id, gundamId: ship.id }); });
    left.appendChild(ab);
  } else {
    var atag = document.createElement('div');
    atag.style.cssText = 'color:#44FF88;font-size:12px;text-align:center;margin-top:12px;';
    atag.textContent = 'ACTIVE SHIP';
    left.appendChild(atag);
  }

  // Scrap ship button
  var scrapBtn = document.createElement('button');
  scrapBtn.style.cssText = 'width:100%;margin-top:8px;background:none;border:1px solid rgba(255,80,80,0.2);border-radius:6px;color:rgba(255,100,100,0.35);font-family:Courier New,monospace;font-size:10px;padding:6px;cursor:pointer;letter-spacing:0.06em;';
  var _scrapRefund = Math.floor(((CRAFT_COSTS&&CRAFT_COSTS[ship.rank])||250)*0.25);
  scrapBtn.textContent = 'SCRAP '+(_isGundam()?'GUNDAM':'SHIP')+' (+'+_scrapRefund+' '+_currencyLabel()+')';
  if (_isGundam()) {
    var _dbbtn = document.createElement('button');
    _dbbtn.className = 'ship-btn';
    _dbbtn.style.cssText = 'width:100%;margin-top:10px;padding:14px;font-size:13px;letter-spacing:0.12em;background:linear-gradient(135deg,#0a001a,#000820);border-color:rgba(150,0,255,0.8);color:#CC88FF;box-shadow:0 0 20px rgba(150,0,255,0.4);';
    _dbbtn.innerHTML = '<span>⚡</span> DIMENSIONAL BATTLEFIELD';
    _dbbtn.addEventListener('click', function(){
      var _ubtn = document.getElementById('scUndockBtn');
      if (_ubtn) { _ubtn.click(); }
      else { SC_SKT()?.emit('gundam:undock', { gundamId: ship.id }); }
    });
    left.appendChild(_dbbtn);
  }
  scrapBtn.addEventListener('mouseenter',function(){scrapBtn.style.color='rgba(255,100,100,0.8)';scrapBtn.style.borderColor='rgba(255,80,80,0.5)';});
  scrapBtn.addEventListener('mouseleave',function(){scrapBtn.style.color='rgba(255,100,100,0.35)';scrapBtn.style.borderColor='rgba(255,80,80,0.2)';});
  (function(sid,sname){scrapBtn.addEventListener('click',function(){
    if(!confirm('Scrap "'+sname+'"? You will receive '+_scrapRefund+' '+_currencyLabel()+'. All equipped parts are lost.')) return;
    SHIP_SKT()?.emit('ship:scrapShip',{shipId:sid});
  });})(ship.id,ship.name);
  left.appendChild(scrapBtn);

  // Right: loadout
  var right = document.createElement('div');
  var lbl = document.createElement('div');
  lbl.style.cssText = 'color:rgba(150,200,255,0.45);font-size:11px;letter-spacing:0.15em;margin-bottom:14px;';
  lbl.textContent = 'LOADOUT';
  right.appendChild(lbl);

  var slotGrid = document.createElement('div');
  slotGrid.style.cssText = 'display:grid;grid-template-columns:' + (window.innerWidth<768?'1fr':'1fr 1fr') + ';gap:10px;';

  _activeSlots().forEach(function(slotId) {
    var part = ship.slots[slotId];
    var rc   = part ? (SHIP_QUALITY_COLORS[part.rarity]||'#888') : 'rgba(0,100,200,0.2)';
    var box  = document.createElement('div');
    box.className = 'slot-box';
    box.style.borderColor = rc;

    var slbl = document.createElement('div');
    slbl.style.cssText = 'font-size:11px;color:rgba(150,200,255,0.4);letter-spacing:0.1em;';
    slbl.textContent = _slotIcon(slotId) + ' ' + _slotLabel(slotId).toUpperCase();
    box.appendChild(slbl);

    if (part) {
      var pn = document.createElement('div');
      pn.style.cssText = 'color:'+rc+';font-size:12px;font-weight:bold;margin-top:4px;';
      pn.textContent = part.name;
      box.appendChild(pn);

      var ps = document.createElement('div');
      ps.style.cssText = 'font-size:10px;color:rgba(150,200,255,0.4);margin-top:2px;';
      ps.textContent = Object.entries(part.stats).map(function(e){ return e[0]+': '+e[1]; }).join(' / ');
      box.appendChild(ps);

      if (part.passive) {
        var pp = document.createElement('div');
        pp.style.cssText = 'font-size:10px;color:#FFAA44;margin-top:2px;';
        pp.textContent = 'passive: ' + part.passive;
        box.appendChild(pp);
      }
      if (part.special) {
        var psp = document.createElement('div');
        psp.style.cssText = 'font-size:10px;color:#FF4488;margin-top:2px;';
        psp.textContent = 'special: ' + part.special;
        box.appendChild(psp);
      }

      var uBtn = document.createElement('div');
      uBtn.style.cssText = 'font-size:10px;color:rgba(255,100,100,0.4);margin-top:6px;cursor:pointer;';
      uBtn.textContent = '[ unequip ]';
      (function(sid, shipId) {
        uBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          SHIP_SKT()?.emit(_socketPrefix()+':unequip', { slot: sid, shipId: shipId, gundamId: shipId });
        });
      })(slotId, ship.id);
      box.appendChild(uBtn);
    } else {
      var emp = document.createElement('div');
      emp.style.cssText = 'color:rgba(150,200,255,0.18);font-size:12px;margin-top:6px;';
      emp.textContent = '-- empty --';
      box.appendChild(emp);
      // Click empty slot → show acquire hint
      box.addEventListener('click', function() {
        showSlotHint(slotId);
      });
    }
    slotGrid.appendChild(box);
  });

  right.appendChild(slotGrid);
  grid.appendChild(left);
  grid.appendChild(right);
  ct.appendChild(grid);
}

// ── RESEARCH ─────────────────────────────────────────────────────────────────
var SLOT_ICONS_DISPLAY = {
  nav:     { icon:'🧭', color:'#FFFF44' },
  engine:  { icon:'⚡', color:'#44FF88' },
  warp:    { icon:'🌀', color:'#AA88FF' },
  shield:  { icon:'🛡', color:'#4488FF' },
  weapon1: { icon:'🔫', color:'#FF4444' },
  weapon2: { icon:'💥', color:'#FF6644' },
};

function buildPartCard(part, showEquip) {
  var rc = SHIP_QUALITY_COLORS[part.rarity] || '#888';
  var si = SLOT_ICONS_DISPLAY[part.slot] || { icon:'⬡', color:'#888' };
  var ships = shipData.ships || [];
  var activeShip = ships.find(function(s){ return s.id===selectedShipId; }) || ships[0];

  var card = document.createElement('div');
  card.style.cssText = 'background:rgba(0,12,28,0.85);border:2px solid '+rc+'66;border-radius:10px;padding:12px;position:relative;';

  // Slot icon badge top-right
  var badge = document.createElement('div');
  badge.style.cssText = 'position:absolute;top:10px;right:10px;font-size:20px;opacity:0.85;';
  badge.textContent = si.icon;
  badge.title = SLOT_LABELS[part.slot] || part.slot;
  card.appendChild(badge);

  var rh = document.createElement('div');
  rh.style.cssText = 'margin-bottom:5px;';
  rh.innerHTML = '<span style="font-size:10px;color:'+rc+';font-weight:bold;letter-spacing:0.08em;">'+part.rarity.toUpperCase()+'</span>'
    + ' <span style="font-size:10px;color:rgba(150,200,255,0.35);">'+( SLOT_LABELS[part.slot]||part.slot)+'</span>';
  card.appendChild(rh);

  var pn = document.createElement('div');
  pn.style.cssText = 'color:#CCEEFF;font-size:12px;font-weight:bold;margin-bottom:6px;padding-right:28px;';
  pn.textContent = part.name;
  card.appendChild(pn);

  var ps = document.createElement('div');
  ps.style.cssText = 'font-size:10px;margin-bottom:6px;';
  ps.innerHTML = formatPartStats(part);
  card.appendChild(ps);

  if (part.passive) {
    var pp = document.createElement('div');
    pp.style.cssText = 'font-size:10px;color:#FFAA44;margin-bottom:2px;';
    pp.textContent = 'passive: ' + part.passive;
    card.appendChild(pp);
  }
  if (part.special) {
    var psp = document.createElement('div');
    psp.style.cssText = 'font-size:10px;color:#FF4488;margin-bottom:4px;';
    psp.textContent = 'special: ' + part.special;
    card.appendChild(psp);
  }

  if (showEquip && activeShip) {
    var equipped = activeShip.slots && activeShip.slots[part.slot];
    var eBtn = document.createElement('button');
    eBtn.className = 'ship-btn';
    eBtn.style.cssText = 'width:100%;font-size:11px;padding:7px;margin-top:4px;';
    eBtn.textContent = equipped ? 'SWAP EQUIPPED' : 'EQUIP';
    eBtn.title = equipped ? ('Replace: '+equipped.name) : ('Equip to '+part.slot+' slot');
    (function(partId, slotId, shipId) {
      eBtn.addEventListener('click', function() {
        eBtn.disabled = true;
        SHIP_SKT()?.emit(_socketPrefix()+':equip', { partId: partId, slot: slotId, shipId: shipId, gundamId: shipId });
      });
    })(part.id, part.slot, activeShip.id);
    card.appendChild(eBtn);
  }

  return card;
}

function showTutorialGate(rollBtn, cost) {
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:850;display:flex;align-items:center;justify-content:center;font-family:Courier New,monospace;';

  var box = document.createElement('div');
  box.style.cssText = 'background:rgba(0,10,28,0.98);border:1px solid rgba(0,150,255,0.4);border-radius:14px;padding:32px;max-width:480px;text-align:center;';

  box.innerHTML = '<div style="font-size:36px;margin-bottom:12px;">⚠️</div>'
    + '<div style="color:#FFDD44;font-size:16px;font-weight:bold;margin-bottom:10px;letter-spacing:0.1em;">HOLD ON!</div>'
    + '<div style="color:#AACCFF;font-size:13px;line-height:1.8;margin-bottom:18px;">'
    + 'You might want that <b style="color:#44FF88;">' + fmtNum(cost) + ' '+_currencyLabel()+'</b> for something else.<br>'
    + 'Make sure your first part is equipped on your ship first.<br><br>'
    + '<span style="color:rgba(150,200,255,0.4);font-size:11px;">Once you\'re ready, you can keep crafting as many parts as you want.</span>'
    + '</div>';

  var doneBtn = document.createElement('button');
  doneBtn.className = 'ship-btn';
  doneBtn.style.cssText = 'font-size:13px;padding:12px 28px;margin-right:10px;border-color:rgba(68,255,136,0.5);color:#44FF88;';
  doneBtn.textContent = "I am done with the tutorial";
  doneBtn.addEventListener('click', function() {
    shipData.tutorialDone = true;
    SHIP_SKT()?.emit('ship:tutorialDone');
    overlay.remove();
    // Fire the craft immediately — no need to click again
    rollBtn.disabled = true;
    rollBtn.textContent = 'CRAFTING...';
    rollBtn.style.opacity = '0.6';
    rollBtn.click();
  });

  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'ship-btn';
  cancelBtn.style.cssText = 'font-size:13px;padding:12px 28px;';
  cancelBtn.textContent = 'Go equip my part first';
  cancelBtn.addEventListener('click', function() {
    overlay.remove();
    activeTab = 'parts';
    shipMenuEl.querySelectorAll('.ship-tab-btn').forEach(function(b){ b.classList.toggle('active',b.dataset.tab==='parts'); });
    refreshTab();
  });

  box.appendChild(doneBtn);
  box.appendChild(cancelBtn);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

function showSlotHint(slotId) {
  var existing = document.getElementById('slotHintBanner');
  if (existing) existing.remove();

  var si   = SLOT_ICONS_DISPLAY[slotId] || { icon:'⬡', color:'#888' };
  var name = SLOT_LABELS[slotId] || slotId;

  var banner = document.createElement('div');
  banner.id = 'slotHintBanner';
  banner.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);'
    + 'background:rgba(0,10,28,0.97);border:1px solid rgba(0,120,255,0.4);border-radius:10px;'
    + 'padding:14px 22px;z-index:900;font-family:Courier New,monospace;display:flex;align-items:center;gap:14px;'
    + 'box-shadow:0 4px 24px rgba(0,0,0,0.6);min-width:320px;max-width:480px;';
  banner.innerHTML = '<span style="font-size:24px;">'+si.icon+'</span>'
    + '<div style="flex:1;">'
    + '<div style="color:#AACCFF;font-size:13px;font-weight:bold;margin-bottom:3px;">'+name+' — Empty</div>'
    + '<div style="color:rgba(150,200,255,0.5);font-size:11px;line-height:1.6;">'
    + 'Acquire more parts through <b style="color:#FFDD44;">Research</b> or visit the <b style="color:#FFAA44;">Fleet Vendors</b> and <b style="color:#FFAA44;">Auction House</b> at the station.'
    + '</div></div>'
    + '<div id="slotHintClose" style="color:rgba(255,255,255,0.25);font-size:18px;cursor:pointer;padding:4px 8px;">✕</div>';

  document.body.appendChild(banner);
  document.getElementById('slotHintClose').addEventListener('click', function() { banner.remove(); });
  setTimeout(function() { if (banner.parentNode) banner.remove(); }, 4000);
}

function buildResearchTab(ct) {
  var rl         = shipData.researchLevel || 0;
  var rxp        = shipData.researchXP   || 0;
  var title      = shipData.researchTitle || 'Scavenger';
  var cost       = shipData.researchCost  || 250;
  var bars       = shipData.bars          || 0;
  var recipes    = shipData.recipes       || {};
  var inv        = shipData.inventory     || [];
  var recipeList = Object.values(recipes);
  var canAfford  = bars >= cost;
  var partsCrafted = Math.round(rxp * 10); // 10 parts per level
  var tutDone    = shipData.tutorialDone || false;
  var hasOnePart = inv.length > 0;

  var wrap = document.createElement('div');
  wrap.style.cssText = 'max-width:860px;margin:0 auto;';

  // ── RESEARCH LEVEL CARD ──
  var card = document.createElement('div');
  card.style.cssText = 'background:rgba(0,12,28,0.85);border:1px solid rgba(0,100,200,0.3);border-radius:12px;padding:20px 24px;margin-bottom:24px;';

  var topRow = document.createElement('div');
  topRow.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;';

  var lvlBlock = document.createElement('div');
  lvlBlock.innerHTML = '<div style="color:rgba(150,200,255,0.45);font-size:11px;letter-spacing:0.15em;margin-bottom:4px;">RESEARCH LEVEL</div>'
    + '<div style="color:#00AAFF;font-size:36px;font-weight:bold;line-height:1;">' + rl + '<span style="color:rgba(150,200,255,0.3);font-size:16px;">/100</span></div>'
    + '<div style="color:#AACCFF;font-size:13px;margin-top:4px;letter-spacing:0.08em;">' + title.toUpperCase() + '</div>';

  var progressBlock = document.createElement('div');
  progressBlock.style.cssText = 'text-align:right;';
  progressBlock.innerHTML = '<div style="color:rgba(150,200,255,0.4);font-size:11px;margin-bottom:6px;">Progress to next level</div>'
    + '<div style="color:#FFDD44;font-size:18px;font-weight:bold;">' + (rxp % 1).toFixed(1) + ' / 1.0</div>'
    + '<div style="color:rgba(150,200,255,0.3);font-size:10px;margin-top:3px;">Parts crafted: ' + partsCrafted + ' / 1000</div>';

  topRow.appendChild(lvlBlock);
  topRow.appendChild(progressBlock);
  card.appendChild(topRow);

  // Progress bar — fills as parts crafted 0-1000
  var barWrap = document.createElement('div');
  barWrap.style.cssText = 'height:8px;background:rgba(0,100,200,0.15);border-radius:4px;overflow:hidden;margin-bottom:14px;';
  var barFill = document.createElement('div');
  var pct = ((rxp % 1) * 100).toFixed(1);
  barFill.style.cssText = 'height:100%;width:'+pct+'%;background:linear-gradient(90deg,#0055AA,#00AAFF);border-radius:4px;transition:width 0.6s;';
  barWrap.appendChild(barFill);
  card.appendChild(barWrap);

  // Milestone pills
  var milestones = document.createElement('div');
  milestones.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;';
  var TITLES = ['Scavenger','Mechanic','Engineer','Technician','Specialist','Artificer','Inventor','Architect','Visionary','Legendary','Mythic'];
  TITLES.forEach(function(t, i) {
    var lvlReq = i * 10;
    var reached = rl >= lvlReq;
    var pill = document.createElement('div');
    pill.style.cssText = 'font-size:9px;padding:3px 8px;border-radius:10px;letter-spacing:0.06em;'
      + 'background:' + (reached ? 'rgba(0,80,180,0.5)' : 'rgba(0,20,40,0.4)') + ';'
      + 'color:' + (reached ? '#88CCFF' : 'rgba(150,200,255,0.2)') + ';'
      + 'border:1px solid ' + (reached ? 'rgba(0,136,255,0.3)' : 'rgba(255,255,255,0.04)') + ';';
    pill.textContent = lvlReq + ' ' + t;
    milestones.appendChild(pill);
  });
  card.appendChild(milestones);

  // Roll button row
  var rollRow = document.createElement('div');
  rollRow.style.cssText = 'display:flex;align-items:center;gap:14px;';

  var rollBtn = document.createElement('button');
  rollBtn.className = 'ship-btn';
  rollBtn.style.cssText = 'font-size:14px;padding:12px 32px;' + (!canAfford ? 'opacity:0.35;cursor:not-allowed;' : '');
  rollBtn.disabled = !canAfford;
  rollBtn.textContent = 'CRAFT RANDOM PART — ' + fmtNum(cost) + ' ' + _currencyLabel();
  rollBtn.addEventListener('click', function() {
    if (rollBtn.disabled) return;
    // Gate second craft — check live shipData not stale closure var
    var hasAnyPart = (shipData.inventory||[]).length > 0;
    if (hasAnyPart && !shipData.tutorialDone) {
      showTutorialGate(rollBtn, cost);
      return;
    }
    rollBtn.disabled = true;
    rollBtn.textContent = 'CRAFTING...';
    rollBtn.style.opacity = '0.6';
    SHIP_SKT()?.emit(_socketPrefix()+':rollPart');
  });

  var balNote = document.createElement('div');
  balNote.style.cssText = 'color:' + (canAfford ? 'rgba(150,200,255,0.4)' : 'rgba(255,100,100,0.5)') + ';font-size:11px;';
  balNote.textContent = canAfford ? ('Balance: ' + fmtNum(bars) + ' ' + _currencyLabel()) : ('Need ' + fmtNum(cost-bars) + ' more ' + _currencyLabel());

  rollRow.appendChild(rollBtn);
  rollRow.appendChild(balNote);
  card.appendChild(rollRow);
  wrap.appendChild(card);

  // ── PARTS IN INVENTORY ──
  if (inv.length) {
    var invHdr = document.createElement('div');
    invHdr.style.cssText = 'color:rgba(150,200,255,0.45);font-size:11px;letter-spacing:0.15em;margin-bottom:10px;';
    invHdr.textContent = 'YOUR PARTS — ' + inv.length + ' in inventory';
    wrap.appendChild(invHdr);

    var invGrid = document.createElement('div');
    invGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-bottom:24px;';
    inv.forEach(function(part) {
      invGrid.appendChild(buildPartCard(part, true));
    });
    wrap.appendChild(invGrid);
  }

  // ── RECIPE BOOK ──
  if (recipeList.length) {
    var recipeHeader = document.createElement('div');
    recipeHeader.style.cssText = 'color:rgba(150,200,255,0.45);font-size:11px;letter-spacing:0.15em;margin-bottom:14px;';
    recipeHeader.innerHTML = 'RECIPE BOOK — '+recipeList.length+' DISCOVERED'
      +'<span style="color:rgba(150,200,255,0.25);font-size:9px;margin-left:8px;">(CRAFT RANDOM PART to discover — loot drops do not create recipes)</span>';
    wrap.appendChild(recipeHeader);

    // Group by slot
    var SLOT_ORDER = ['engine','shield','weapon1','weapon2','warp','nav'];
    var SLOT_GROUP_LABELS = {
      engine:'ENGINE', shield:'SHIELD', weapon1:'CANNON (Bullets)',
      weapon2:'MISSILE BAY', warp:'WARP DRIVE', nav:'NAVIGATION'
    };
    var grouped = {};
    recipeList.forEach(function(r) { (grouped[r.slot] = grouped[r.slot]||[]).push(r); });

    SLOT_ORDER.forEach(function(slotKey) {
      var group = grouped[slotKey]; if (!group || !group.length) return;
      var si = SLOT_ICONS_DISPLAY[slotKey] || { icon:'⬡', color:'#888' };

      var groupHeader = document.createElement('div');
      groupHeader.style.cssText = 'display:flex;align-items:center;gap:8px;margin:16px 0 8px;';
      groupHeader.innerHTML = '<span style="font-size:16px;">'+si.icon+'</span>'
        + '<span style="color:'+si.color+';font-size:10px;font-weight:bold;letter-spacing:0.15em;">'
        + SLOT_GROUP_LABELS[slotKey] + ' — ' + group.length + '</span>'
        + '<div style="flex:1;height:1px;background:'+si.color+'22;margin-left:4px;"></div>';
      wrap.appendChild(groupHeader);

      var recGrid = document.createElement('div');
      recGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;margin-bottom:4px;';

      var RARITY_SORT2={Mythic:0,Legendary:1,Epic:2,Rare:3,Uncommon:4,Common:5};
      group.sort(function(a,b){return (RARITY_SORT2[a.rarity]||9)-(RARITY_SORT2[b.rarity]||9);});
      var _rl2=shipData.researchLevel||0, _sc2=1+_rl2*0.1;
      function expRange(sl){
        if(sl==='weapon1'||sl==='weapon2') return fmtNum(Math.round(1000*_sc2))+'-'+fmtNum(Math.round(10000*_sc2))+' dmg';
        if(sl==='shield') return '+'+fmtNum(Math.round(1000*_sc2))+'-'+fmtNum(Math.round(10000*_sc2))+' HP';
        if(sl==='engine') return '+5-'+Math.round(25+_rl2*0.1)+'% speed';
        if(sl==='warp')   return (1.1).toFixed(1)+'-'+(1.5+_rl2*0.035).toFixed(1)+'x warp';
        if(sl==='nav')    return '+2-15% nav'; return '';}
      group.forEach(function(recipe) {
      var rc  = recipe.rarityColor || '#888';
      var si  = SLOT_ICONS_DISPLAY[recipe.slot] || { icon:'⬡', color:'#888' };
      var rcard = document.createElement('div');
      rcard.style.cssText = 'background:rgba(0,12,28,0.8);border:2px solid '+rc+'55;border-radius:10px;padding:12px;';

      var rh = document.createElement('div');
      rh.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;';
      rh.innerHTML = '<span style="font-size:10px;color:'+rc+';font-weight:bold;letter-spacing:0.08em;">'+recipe.rarity.toUpperCase()+'</span>'
        + '<span style="font-size:16px;" title="'+(SLOT_LABELS[recipe.slot]||recipe.slot)+'">'+si.icon+'</span>';
      rcard.appendChild(rh);

      var rn = document.createElement('div');
      rn.style.cssText = 'color:#CCEEFF;font-size:12px;font-weight:bold;margin-bottom:6px;';
      rn.textContent = recipe.name;
      rcard.appendChild(rn);

      var _rng=expRange(recipe.slot);
      if(_rng){var rr2=document.createElement('div');rr2.style.cssText='font-size:10px;color:rgba(150,200,255,0.4);margin-bottom:4px;';rr2.textContent='~'+_rng+' @ rl'+_rl2;rcard.appendChild(rr2);}
      if (recipe.passive) {
        var rp = document.createElement('div');
        rp.style.cssText = 'font-size:10px;color:#FFAA44;margin-bottom:2px;';
        rp.textContent = 'passive: ' + recipe.passive;
        rcard.appendChild(rp);
      }
      if (recipe.passive2) {
        var rp2b=document.createElement('div');rp2b.style.cssText='font-size:10px;color:#FFAA44;margin-bottom:2px;';
        rp2b.textContent='passive: '+recipe.passive2;rcard.appendChild(rp2b);
      }
      if (recipe.special) {
        var rs = document.createElement('div');
        rs.style.cssText = 'font-size:10px;color:#FF4488;margin-bottom:6px;';
        rs.textContent = 'special: ' + recipe.special;
        rcard.appendChild(rs);
      }

      var craftBtn = document.createElement('button');
      craftBtn.className = 'ship-btn';
      craftBtn.style.cssText = 'width:100%;font-size:11px;padding:7px;margin-top:6px;'
        + (!canAfford ? 'opacity:0.35;cursor:not-allowed;' : '');
      craftBtn.disabled = !canAfford;
      craftBtn.textContent = 'CRAFT — ' + fmtNum(cost) + ' ' + _currencyLabel();
      (function(key, btn) {
        btn.addEventListener('click', function() {
          if (btn.disabled) return;
          var hasAnyPart = (shipData.inventory||[]).length > 0;
          if (hasAnyPart && !shipData.tutorialDone) {
            showTutorialGate(btn, cost);
            return;
          }
          btn.disabled = true;
          btn.textContent = 'CRAFTING...';
          SHIP_SKT()?.emit('ship:recraft', { recipeKey: key });
        });
      })(recipe.key, craftBtn);
      rcard.appendChild(craftBtn);
      // Unlearn button
      var unlearnBtn = document.createElement('button');
      unlearnBtn.style.cssText = 'width:100%;margin-top:5px;background:none;border:1px solid rgba(255,80,80,0.2);border-radius:6px;color:rgba(255,100,100,0.35);font-family:Courier New,monospace;font-size:10px;padding:5px;cursor:pointer;letter-spacing:0.06em;';
      unlearnBtn.textContent = 'UNLEARN (+50 '+_currencyLabel()+')';
      unlearnBtn.addEventListener('mouseenter', function(){ unlearnBtn.style.color='rgba(255,100,100,0.8)'; unlearnBtn.style.borderColor='rgba(255,80,80,0.5)'; });
      unlearnBtn.addEventListener('mouseleave', function(){ unlearnBtn.style.color='rgba(255,100,100,0.35)'; unlearnBtn.style.borderColor='rgba(255,80,80,0.2)'; });
      (function(rkey, rname) {
        unlearnBtn.addEventListener('click', function() {
          if (!confirm('Unlearn "'+rname+'"? You will receive 50 bars. This cannot be undone.')) return;
          SHIP_SKT()?.emit('ship:unlearnRecipe', { recipeKey: rkey });
        });
      })(recipe.key, recipe.name);
      rcard.appendChild(unlearnBtn);
      recGrid.appendChild(rcard);
      }); // end group.forEach
      wrap.appendChild(recGrid);
    }); // end SLOT_ORDER.forEach
  } else if (!inv.length) {
    var noRec = document.createElement('div');
    noRec.style.cssText = 'color:rgba(150,200,255,0.2);font-size:13px;text-align:center;padding:30px;';
    noRec.textContent = 'No recipes yet. Craft your first part above.';
    wrap.appendChild(noRec);
  }

  ct.appendChild(wrap);
}


function buildPartsTab(ct) {
  var inv        = shipData.inventory || [];
  var ships      = shipData.ships || [];
  var activeShip = ships.find(function(s){ return s.id===selectedShipId; }) || ships[0];
  var hasEngine  = activeShip && activeShip.slots && activeShip.slots.engine;

  // ── STATE 1: No parts at all ──
  if (!inv.length) {
    var noPartsWrap = document.createElement('div');
    noPartsWrap.style.cssText = 'max-width:500px;margin:40px auto;text-align:center;font-family:Courier New,monospace;';

    var icon = document.createElement('div');
    icon.style.cssText = 'font-size:48px;margin-bottom:16px;';
    icon.textContent = '🔬';
    noPartsWrap.appendChild(icon);

    var msg = document.createElement('div');
    msg.style.cssText = 'color:#AACCFF;font-size:16px;font-weight:bold;margin-bottom:8px;';
    msg.textContent = "It looks like you don't have any parts yet.";
    noPartsWrap.appendChild(msg);

    var sub = document.createElement('div');
    sub.style.cssText = 'color:rgba(150,200,255,0.45);font-size:13px;margin-bottom:28px;line-height:1.7;';
    sub.textContent = 'Head to the RESEARCH tab to craft your first part. Each roll costs bars and gives you a random part for your ship.';
    noPartsWrap.appendChild(sub);

    var resBtn = document.createElement('button');
    resBtn.className = 'ship-btn';
    resBtn.style.cssText = 'font-size:14px;padding:14px 36px;animation:obBlink 1.2s ease-in-out infinite;border-color:#00CCFF;color:#00CCFF;';
    resBtn.textContent = '→ GO TO RESEARCH';
    resBtn.addEventListener('click', function() {
      activeTab = 'research';
      shipMenuEl.querySelectorAll('.ship-tab-btn').forEach(function(b){ b.classList.toggle('active', b.dataset.tab==='research'); });
      refreshTab();
    });
    noPartsWrap.appendChild(resBtn);
    ct.appendChild(noPartsWrap);
    return;
  }

  // ── STATE 2: Has parts — show guided equip ──
  // Guidance banner
  var guideBanner = document.createElement('div');
  var enginePart = inv.find(function(p){ return p.slot==='engine'; });
  if (!hasEngine) {
    guideBanner.style.cssText = 'background:rgba(0,15,35,0.85);border:1px solid rgba(0,150,255,0.3);border-radius:10px;padding:14px 18px;margin-bottom:18px;display:flex;align-items:flex-start;gap:14px;';
    guideBanner.innerHTML = '<div style="font-size:24px;flex-shrink:0;">⚡</div>'
      +'<div><div style="color:#AACCFF;font-size:13px;font-weight:bold;margin-bottom:4px;">Equip your parts to activate your ship</div>'
      +(enginePart
        ? '<div style="color:rgba(150,200,255,0.5);font-size:12px;line-height:1.7;">Click a part below to select it, then click <b style="color:#0088FF;">EQUIP</b> to attach it to your ship. <span style="color:#FFDD44;">An engine part is required</span> — equip that first!</div>'
        : '<div style="color:rgba(150,200,255,0.5);font-size:12px;line-height:1.7;">You don\'t have an engine part yet. Try rolling more parts in RESEARCH or check the <b style="color:#FFAA44;">Auction House</b> and <b style="color:#FFAA44;">Fleet Vendors</b> at the station.</div>')
      +'</div>';
    ct.appendChild(guideBanner);
  } else {
    guideBanner.style.cssText = 'background:rgba(0,20,10,0.8);border:1px solid rgba(0,200,100,0.3);border-radius:10px;padding:12px 18px;margin-bottom:18px;display:flex;align-items:center;gap:12px;';
    guideBanner.innerHTML = '<span style="font-size:20px;">✅</span>'
      +'<span style="color:#44FF88;font-size:13px;">Engine equipped! Equip more parts to boost your stats — or head to HANGAR to activate your ship.</span>';
    ct.appendChild(guideBanner);
  }

  var ships      = shipData.ships || [];
  var activeShip = ships.find(function(s){ return s.id === selectedShipId; }) || ships[0];

  var wrap = document.createElement('div');
  wrap.style.cssText = 'max-width:900px;margin:0 auto;';

  var desc = document.createElement('div');
  desc.style.cssText = 'color:rgba(150,200,255,0.38);font-size:12px;margin-bottom:16px;';
  desc.textContent = inv.length + ' part' + (inv.length!==1?'s':'') + ' in inventory. Click to select, then equip.';
  wrap.appendChild(desc);

  // NEW FROM SPACE section -- show first time parts tab opens after dock
  var _newIds = window._shipNewPartIds || [];
  if (_newIds.length > 0) {
    var newParts = inv.filter(function(p){ return _newIds.indexOf(p.id) >= 0; });
    window._shipNewPartIds = []; // clear after showing
    window._shipNewParts = 0;
    if (newParts.length > 0) {
      var newSec = document.createElement('div');
      newSec.style.cssText = 'background:rgba(0,255,184,0.05);border:1px solid rgba(0,255,184,0.25);border-radius:10px;padding:14px;margin-bottom:20px;animation:obBlink 1.5s ease-in-out 3;';
      var newHdr = document.createElement('div');
      newHdr.style.cssText = 'color:#00FFB8;font-size:11px;font-weight:bold;letter-spacing:0.2em;margin-bottom:12px;';
      newHdr.textContent = '⭐ JUST ARRIVED FROM SPACE — ' + newParts.length + ' NEW PART' + (newParts.length>1?'S':'');
      newSec.appendChild(newHdr);
      var newGrid = document.createElement('div');
      newGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;';
      newParts.forEach(function(part) {
        var rc = SHIP_QUALITY_COLORS[part.rarity]||'#888';
        var nc = document.createElement('div');
        nc.style.cssText = 'background:rgba(0,255,184,0.06);border:2px solid '+rc+';border-radius:10px;padding:10px;box-shadow:0 0 12px '+rc+'33;';
        nc.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">'
          +'<span style="font-size:10px;color:'+rc+';font-weight:bold;">'+part.rarity.toUpperCase()+'</span>'
          +'<span style="font-size:10px;color:rgba(150,200,255,0.4);">'+(SLOT_ICONS[part.slot]||'')+' '+(SLOT_LABELS[part.slot]||part.slot)+'</span></div>'
          +'<div style="color:#CCEEFF;font-size:12px;font-weight:bold;margin-bottom:4px;">'+part.name+'</div>'
          +'<div style="font-size:10px;color:rgba(150,200,255,0.45);">'+formatPartStats(part)+'</div>';
        newGrid.appendChild(nc);
      });
      newSec.appendChild(newGrid);
      wrap.appendChild(newSec);
    }
  }

  var SLOT_SORT_O = {engine:0,shield:1,weapon1:2,weapon2:3,warp:4,nav:5};
  var RAR_SORT_O  = {Mythic:0,Legendary:1,Epic:2,Rare:3,Uncommon:4,Common:5};
  var sortedInv = inv.slice().sort(function(a,b){
    var sd=(SLOT_SORT_O[a.slot]||9)-(SLOT_SORT_O[b.slot]||9);
    return sd!==0?sd:(RAR_SORT_O[a.rarity]||9)-(RAR_SORT_O[b.rarity]||9);
  });
  var grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;';
  var _curSlot = null;

  sortedInv.forEach(function(part) {
    if (part.slot !== _curSlot) {
      _curSlot = part.slot;
      var _sh = document.createElement('div');
      _sh.style.cssText = 'grid-column:1/-1;display:flex;align-items:center;gap:8px;margin:10px 0 2px;border-top:1px solid rgba(0,150,255,0.1);padding-top:10px;';
      _sh.innerHTML = '<span style="font-size:14px;">'+(SLOT_ICONS[part.slot]||'\u29e1')+'</span>'
        +'<span style="color:rgba(100,180,255,0.6);font-size:10px;font-weight:bold;letter-spacing:0.15em;">'+(SLOT_LABELS[part.slot]||part.slot).toUpperCase()+'</span>';
      grid.appendChild(_sh);
    }

    var rc  = SHIP_QUALITY_COLORS[part.rarity] || '#888';
    var sel = part.id === selectedPartId;

    var card = document.createElement('div');
    card.className = 'part-card' + (sel ? ' sel' : '');
    if (sel) card.style.borderColor = rc;

    var hd = document.createElement('div');
    hd.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
    hd.innerHTML = '<span style="font-size:10px;color:'+rc+';font-weight:bold;">'+part.rarity.toUpperCase()+'</span>'
      + '<span style="font-size:10px;color:rgba(150,200,255,0.38);">' + SLOT_ICONS[part.slot] + ' ' + SLOT_LABELS[part.slot] + '</span>';
    card.appendChild(hd);

    var pn = document.createElement('div');
    pn.style.cssText = 'color:#CCEEFF;font-size:12px;font-weight:bold;margin-bottom:6px;';
    pn.textContent = part.name;
    card.appendChild(pn);

    var ps = document.createElement('div');
    ps.style.cssText = 'font-size:10px;color:rgba(150,200,255,0.45);';
    var statStr = formatPartStats(part);
    ps.innerHTML = statStr;
    card.appendChild(ps);

    if (part.passive) {
      var pp = document.createElement('div');
      pp.style.cssText = 'font-size:10px;color:#FFAA44;margin-top:4px;';
      pp.textContent = 'passive: ' + part.passive;
      card.appendChild(pp);
    }
    if (part.passive2) {
      var pp2 = document.createElement('div');
      pp2.style.cssText = 'font-size:10px;color:#FFAA44;margin-top:2px;';
      pp2.textContent = 'passive: ' + part.passive2;
      card.appendChild(pp2);
    }
    if (part.special) {
      var psp = document.createElement('div');
      psp.style.cssText = 'font-size:10px;color:#FF4488;margin-top:4px;';
      psp.textContent = 'special: ' + part.special;
      card.appendChild(psp);
    }

    if (sel && activeShip) {
      var btns = document.createElement('div');
      btns.style.cssText = 'display:flex;gap:8px;margin-top:10px;';

      var eBtn = document.createElement('button');
      eBtn.className = 'ship-btn';
      eBtn.style.cssText = 'flex:1;font-size:11px;padding:7px;';
      eBtn.textContent = 'EQUIP';
      (function(partId, slotId, shipId) {
        eBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          SHIP_SKT()?.emit(_socketPrefix()+':equip', { partId:partId, slot:slotId, shipId:shipId, gundamId:shipId });
          selectedPartId = null;
        });
      })(part.id, part.slot, activeShip.id);

      var dBtn = document.createElement('button');
      dBtn.className = 'ship-btn ship-btn-red';
      dBtn.style.cssText = 'font-size:11px;padding:7px 10px;';
      dBtn.textContent = 'DEL';
      (function(partId) {
        dBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          if (confirm('Discard this part?')) SHIP_SKT()?.emit('ship:discard', { partId: partId });
        });
      })(part.id);

      btns.appendChild(eBtn);
      btns.appendChild(dBtn);
      card.appendChild(btns);
    }

    (function(partId) {
      card.addEventListener('click', function() {
        selectedPartId = selectedPartId === partId ? null : partId;
        refreshTab();
      });
    })(part.id);

    grid.appendChild(card);
  });

  wrap.appendChild(grid);
  ct.appendChild(wrap);
}

// ── DRAW TAB ──────────────────────────────────────────────────────────────────
function buildMiningTab(ct) {
  var skt = SHIP_SKT();
  if (skt) { skt.emit('faction:getPlayerMiners'); skt.emit('faction:getLeaderboard'); }

  var hdr = document.createElement('div');
  hdr.style.cssText = 'color:#44FF88;font-size:13px;font-weight:bold;letter-spacing:0.1em;margin-bottom:6px;';
  hdr.textContent = 'MINING CONTROL';
  ct.appendChild(hdr);

  var sub = document.createElement('div');
  sub.style.cssText = 'color:rgba(150,200,255,0.4);font-size:10px;margin-bottom:18px;line-height:1.7;';
  sub.textContent = 'Dispatch miner ships autonomously. 3 runs per assignment. Loop: mine (2.5 min) → Star Forge → return base (~7 min total).';
  ct.appendChild(sub);

  // Active miners section
  var minersDiv = document.createElement('div');
  minersDiv.id = 'miningMinersPane';
  minersDiv.style.cssText = 'margin-bottom:18px;';
  ct.appendChild(minersDiv);

  window._renderMiners = function renderMiners() {
    if (!document.getElementById('miningMinersPane')) return;
    minersDiv.innerHTML = '';
    var miners = window._playerMinerStatus || [];
    if (!miners.length) {
      var emp = document.createElement('div');
      emp.style.cssText = 'color:rgba(150,200,255,0.3);font-size:11px;padding:12px;background:rgba(0,15,35,0.6);border-radius:8px;text-align:center;margin-bottom:10px;';
      emp.textContent = 'No active miners. Dispatch one below.';
      minersDiv.appendChild(emp);
    } else {
      var STATE_LABELS = { idle:'Idle', traveling_mine:'>> Mine', mining:'[MINING]',
        traveling_forge:'>> Forge', forging:'[SMELTING]',
        traveling_home:'>> Home', depositing:'[DEPOSITING]', on_break:'[ON BREAK]' };
      var STATE_COLORS = { mining:'#44FF88', forging:'#FFAA00', on_break:'rgba(150,200,255,0.4)',
        traveling_forge:'#FFDD44', traveling_home:'#FFDD44' };
      miners.forEach(function(m) {
        var card = document.createElement('div');
        card.style.cssText = 'background:rgba(0,15,35,0.8);border:1px solid rgba(0,100,200,0.2);border-radius:8px;padding:10px 14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;';
        var sc = STATE_COLORS[m.state] || 'rgba(150,200,255,0.6)';
        card.innerHTML = '<div style="font-size:20px;">⛏</div>'
          + '<div style="flex:1;">'
          + '<div style="color:#AACCFF;font-size:12px;font-weight:bold;">' + (m.pilotName||'Miner') + '</div>'
          + '<div style="color:' + sc + ';font-size:10px;margin-top:2px;">' + (STATE_LABELS[m.state]||m.state) + '  ·  Zone ' + (m.zone||'—') + '</div>'
          + '<div style="color:rgba(150,200,255,0.4);font-size:10px;">Run ' + ((m.runsCompleted||0)+1) + '/' + (m.maxRuns||3) + '  ·  Ore: ' + (m.ore||0) + '/10</div>'
          + '</div>'
          + '<div style="color:#FF4444;font-size:10px;background:rgba(30,0,0,0.7);border:1px solid rgba(255,50,50,0.3);border-radius:6px;padding:4px 10px;cursor:pointer;" class="recall-btn">Recall</div>';
        card.querySelector('.recall-btn').addEventListener('click', function() {
          skt && skt.emit('faction:recallMiner', { shipId: m.shipId });
          setTimeout(function(){ skt && skt.emit('faction:getPlayerMiners'); setTimeout(renderMiners,300); }, 200);
        });
        minersDiv.appendChild(card);
      });
    }
  }
  if (window._renderMiners) window._renderMiners();

  // Auto-refresh while tab open
  var ri = setInterval(function() {
    if (!document.getElementById('miningMinersPane')) { clearInterval(ri); window._renderMiners = null; return; }
    skt && skt.emit('faction:getPlayerMiners');
    setTimeout(function(){ if (window._renderMiners) window._renderMiners(); }, 300);
  }, 8000);

  // ── PERMITS ──
  var permHdr = document.createElement('div');
  permHdr.style.cssText = 'color:rgba(150,200,255,0.6);font-size:10px;letter-spacing:0.1em;margin-bottom:8px;font-weight:bold;';
  permHdr.textContent = 'MINING PERMITS — 100 bars · 24h';
  ct.appendChild(permHdr);
  var permits = shipData.permits || {};
  var PERMIT_FACTIONS = [
    { id:'verus', name:'Verus Prime',  zone:'4-5', color:'#FF6644' },
    { id:'slv',   name:'SLV',          zone:'3-2', color:'#44AAFF' },
    { id:'omig',  name:'Omigolation',  zone:'2-2', color:'#AA44FF' },
  ];
  var permRow = document.createElement('div');
  permRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;';
  PERMIT_FACTIONS.forEach(function(pf) {
    var expiry = permits[pf.id] || 0;
    var active = expiry > Date.now();
    var remaining = active ? Math.ceil((expiry-Date.now())/3600000)+'h left' : 'EXPIRED';
    var pCard = document.createElement('div');
    pCard.style.cssText = 'flex:1;min-width:120px;background:rgba(0,12,28,0.8);border:1px solid '+(active?pf.color+'88':'rgba(0,100,200,0.2)')+';border-radius:8px;padding:10px;';
    pCard.innerHTML = '<div style="color:'+pf.color+';font-size:10px;font-weight:bold;margin-bottom:3px;">'+pf.name+'</div>'
      +'<div style="color:rgba(150,200,255,0.4);font-size:9px;margin-bottom:6px;">Zone '+pf.zone+'</div>'
      +'<div style="color:'+(active?'#44FF88':'rgba(255,100,100,0.6)')+';font-size:9px;margin-bottom:6px;">'+(active?'✓ '+remaining:'✗ No permit')+'</div>';
    if (!active) {
      var buyBtn = document.createElement('button');
      buyBtn.className = 'ship-btn';
      buyBtn.style.cssText = 'width:100%;font-size:9px;padding:5px;border-color:'+pf.color+'66;color:'+pf.color+';';
      buyBtn.textContent = 'BUY 100★';
      (function(fid){ buyBtn.addEventListener('click', function(){
        SHIP_SKT()?.emit('ship:buyPermit', { factionId: fid });
      }); })(pf.id);
      pCard.appendChild(buyBtn);
    }
    permRow.appendChild(pCard);
  });
  ct.appendChild(permRow);

  // ── DISPATCH SECTION ──
  var dh = document.createElement('div');
  dh.style.cssText = 'color:rgba(150,200,255,0.6);font-size:10px;letter-spacing:0.1em;margin-bottom:8px;font-weight:bold;';
  dh.textContent = 'DISPATCH MINER';
  ct.appendChild(dh);

  var minerShips = (shipData.ships||[]).filter(function(s){ return s.class === 'miner'; });
  if (!minerShips.length) {
    var nm = document.createElement('div');
    nm.style.cssText = 'color:rgba(255,180,50,0.6);font-size:11px;padding:10px;background:rgba(20,10,0,0.6);border-radius:8px;margin-bottom:16px;';
    nm.textContent = 'No miner class ships. Craft a miner blueprint from DAILY DRAW.';
    ct.appendChild(nm);
  } else {
    var MINE_ZONES = [
      { label:'Verus Prime Mine (4-5)', zone:'4-5', danger:'High' },
      { label:'SLV Mine (3-2)',         zone:'3-2', danger:'Moderate' },
      { label:'Omig Mine (2-2)',        zone:'2-2', danger:'Moderate' },
    ];
    var selShip = minerShips[0].id, selZone = MINE_ZONES[0].zone;

    var ss = document.createElement('select');
    ss.style.cssText = 'width:100%;background:rgba(0,15,35,0.8);border:1px solid rgba(0,100,200,0.3);border-radius:8px;color:#AACCFF;font-family:Courier New,monospace;font-size:11px;padding:8px 10px;margin-bottom:8px;';
    minerShips.forEach(function(s) {
      var o = document.createElement('option'); o.value=s.id;
      o.textContent = s.name + ' — ' + s.quality + ' Rank ' + s.rank; ss.appendChild(o);
    });
    ss.addEventListener('change', function(){ selShip = ss.value; });
    ct.appendChild(ss);

    var sz = document.createElement('select');
    sz.style.cssText = 'width:100%;background:rgba(0,15,35,0.8);border:1px solid rgba(0,100,200,0.3);border-radius:8px;color:#AACCFF;font-family:Courier New,monospace;font-size:11px;padding:8px 10px;margin-bottom:12px;';
    MINE_ZONES.forEach(function(z) {
      var o = document.createElement('option'); o.value=z.zone;
      o.textContent = z.label + ' [' + z.danger + ' danger]'; sz.appendChild(o);
    });
    sz.addEventListener('change', function(){ selZone = sz.value; });
    ct.appendChild(sz);

    var db = document.createElement('button');
    db.className = 'ship-btn';
    db.style.cssText = 'width:100%;font-size:13px;padding:12px;background:linear-gradient(135deg,rgba(0,30,10,0.9),rgba(0,50,20,0.9));border-color:rgba(0,200,100,0.5);color:#44FF88;letter-spacing:0.1em;';
    db.textContent = 'DISPATCH MINER →';
    db.addEventListener('click', function() {
      if (!skt) return;
      skt.emit('faction:dispatchPlayerMiner', { shipId: selShip, mineZone: selZone, runsCount: 3 });
      db.textContent = '✓ Dispatched!'; db.disabled = true;
      setTimeout(function(){ db.textContent='DISPATCH MINER →'; db.disabled=false; skt.emit('faction:getPlayerMiners'); setTimeout(renderMiners,300); }, 2000);
    });
    ct.appendChild(db);
  }

  // Faction leaderboard preview
  var lh = document.createElement('div');
  lh.style.cssText = 'color:rgba(255,170,0,0.6);font-size:10px;letter-spacing:0.1em;margin:18px 0 8px;font-weight:bold;';
  lh.textContent = 'FACTION STANDINGS';
  ct.appendChild(lh);

  var board = window._factionLeaderboard || [];
  if (!board.length) {
    var lb0 = document.createElement('div');
    lb0.style.cssText = 'color:rgba(150,200,255,0.3);font-size:10px;';
    lb0.textContent = 'Loading...';
    ct.appendChild(lb0);
  } else {
    board.slice(0,4).forEach(function(f,i) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(0,50,100,0.2);font-size:10px;';
      var medals = ['#FFD700','#C0C0C0','#CD7F32','#555'];
      row.innerHTML = '<span style="color:'+(medals[i]||'#555')+';min-width:16px;">#'+(i+1)+'</span>'
        + '<span style="color:'+(f.color||'#FFF')+';flex:1;">' + f.name + '</span>'
        + '<span style="color:rgba(150,200,255,0.5);">' + f.fleetScore + ' pts</span>'
        + '<span style="color:rgba(150,200,255,0.3);margin-left:8px;">' + f.activeMiners + '/3 miners</span>';
      ct.appendChild(row);
    });
  }
}

function buildDrawTab(ct) {
  var bp        = shipData.pendingBlueprint;
  var drawReady = shipData.drawReady;
  var drawsLeft = shipData.drawsLeft !== undefined ? shipData.drawsLeft : (drawReady ? 1 : 0);
  var drawsUsed = shipData.drawsUsed || 0;
  var nextWin   = shipData.nextWindowIn || 0;
  var bars      = shipData.bars || 0;
  var craftCost = bp ? (CRAFT_COSTS[bp.rank] || 250) : 0;
  var canCraft  = !!(bp && bars >= craftCost);
  var hasShip   = (shipData.ships||[]).some(function(s){return s.crafted;});

  var wrap = document.createElement('div');
  wrap.style.cssText = 'max-width:600px;margin:0 auto;';

  // Draw counter -- 3 dots showing usage
  var ctrRow = document.createElement('div');
  ctrRow.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:10px;margin-bottom:8px;';
  for (var di=0; di<3; di++) {
    var dot = document.createElement('div');
    var used = di < drawsUsed;
    dot.style.cssText = 'width:14px;height:14px;border-radius:50%;border:2px solid '+(used?'rgba(170,68,255,0.3)':'#AA44FF')+';background:'+(used?'transparent':'rgba(170,68,255,0.25)')+';transition:all 0.3s;';
    ctrRow.appendChild(dot);
  }
  wrap.appendChild(ctrRow);
  var ctrLbl = document.createElement('div');
  ctrLbl.style.cssText = 'text-align:center;font-size:11px;letter-spacing:0.08em;margin-bottom:20px;';
  var h0=Math.floor(nextWin/3600000), m0=Math.floor((nextWin%3600000)/60000);
  if (drawsUsed >= 3) {
    ctrLbl.style.color = 'rgba(150,200,255,0.3)';
    ctrLbl.textContent = '3/3 draws used today — resets in ' + h0 + 'h ' + m0 + 'm';
  } else {
    ctrLbl.style.color = 'rgba(150,200,255,0.5)';
    ctrLbl.textContent = drawsUsed + '/3 draws used today'+(drawsUsed>0&&nextWin>0?' — resets in '+h0+'h '+m0+'m':'');
  }
  wrap.appendChild(ctrLbl);

  // Block draw if any ship needs design
  var _needsDesign = (shipData.ships||[]).find(function(s){return !s.designLocked;});
  if (_needsDesign && !bp) {
    var designWarn = document.createElement('div');
    designWarn.style.cssText = 'text-align:center;background:rgba(255,220,0,0.06);border:1px solid rgba(255,220,0,0.25);border-radius:10px;padding:18px;margin-bottom:20px;';
    designWarn.innerHTML = '<div style="color:#FFDD44;font-size:13px;font-weight:bold;margin-bottom:6px;">DESIGN REQUIRED</div>'
      +'<div style="color:rgba(150,200,255,0.4);font-size:12px;margin-bottom:14px;line-height:1.7;">"'+_needsDesign.name+'" needs a design before you can draw another ship.</div>';
    var goDesign = document.createElement('button');
    goDesign.className='ship-btn';
    goDesign.style.cssText='font-size:12px;padding:9px 28px;border-color:#FFDD44;color:#FFDD44;';
    goDesign.textContent='→ GO TO DESIGN';
    goDesign.addEventListener('click',function(){activeTab='design';shipMenuEl.querySelectorAll('.ship-tab-btn').forEach(function(b){b.classList.toggle('active',b.dataset.tab==='design');});refreshTab();});
    designWarn.appendChild(goDesign);
    wrap.appendChild(designWarn);
  }

  if (drawReady && !_needsDesign) {
    var banner = document.createElement('div');
    banner.style.cssText = 'text-align:center;margin-bottom:28px;';
    var blinkLbl = document.createElement('div');
    blinkLbl.style.cssText = 'color:#FFDD44;font-size:13px;letter-spacing:0.15em;margin-bottom:12px;animation:obBlink 1.5s infinite;';
    blinkLbl.textContent = 'DRAW READY';
    banner.appendChild(blinkLbl);
    var drawBtn = document.createElement('button');
    drawBtn.className = 'ship-btn';
    drawBtn.style.cssText = 'background:linear-gradient(135deg,#1a0033,#330055);border-color:#AA44FF;color:#CC88FF;font-size:16px;padding:16px 48px;box-shadow:0 0 20px rgba(170,68,255,0.4);';
    drawBtn.textContent = '[ DRAW BLUEPRINT ]';
    drawBtn.addEventListener('click', function() { SHIP_SKT()?.emit(_socketPrefix()+':claimDraw'); });
    banner.appendChild(drawBtn);
    wrap.appendChild(banner);
  } else if (!bp && drawsLeft > 0 && (shipData.ships||[]).length >= (shipData.maxShips||5)) {
    var _curCount = (shipData.ships||[]).length, _maxCount = shipData.maxShips||5;
    var fleetFull = document.createElement('div');
    fleetFull.style.cssText = 'text-align:center;background:rgba(255,100,0,0.08);border:1px solid rgba(255,100,0,0.25);border-radius:10px;padding:18px;margin-bottom:20px;';
    fleetFull.innerHTML = '<div style="color:#FF8844;font-size:13px;font-weight:bold;margin-bottom:6px;">FLEET FULL ('+_curCount+'/'+_maxCount+')</div>'
      +'<div style="color:rgba(150,200,255,0.4);font-size:12px;line-height:1.7;">Scrap a ship from the HANGAR tab to make room for a new draw.</div>';
    wrap.appendChild(fleetFull);
  } else if (!bp && drawsLeft <= 0) {
    var allUsed = document.createElement('div');
    allUsed.style.cssText = 'text-align:center;color:rgba(150,200,255,0.3);margin-bottom:24px;font-size:13px;line-height:1.8;';
    allUsed.innerHTML = 'All 3 draws used for today.<br><span style="font-size:11px;">Resets in ' + h0 + 'h ' + m0 + 'm</span>';
    wrap.appendChild(allUsed);
  } else if (!bp) {
    var wait = document.createElement('div');
    wait.style.cssText = 'text-align:center;color:rgba(150,200,255,0.3);margin-bottom:24px;font-size:13px;';
    wait.textContent = 'No draw available.';
    wrap.appendChild(wait);
  }

  var hr = document.createElement('div');
  hr.style.cssText = 'border:1px solid rgba(0,100,200,0.15);margin:20px 0;';
  wrap.appendChild(hr);

  if (bp) {
    var lbl = document.createElement('div');
    lbl.style.cssText = 'color:rgba(150,200,255,0.45);font-size:11px;letter-spacing:0.15em;margin-bottom:14px;text-align:center;';
    lbl.textContent = 'PENDING BLUEPRINT';
    wrap.appendChild(lbl);

    var bpDiv = document.createElement('div');
    bpDiv.innerHTML = blueprintCardHTML(bp);
    wrap.appendChild(bpDiv);

    var craftBtn = document.createElement('button');
    craftBtn.className = 'ship-btn';
    craftBtn.style.cssText = 'width:100%;margin-top:16px;font-size:13px;padding:14px;';
    craftBtn.disabled = !canCraft;
    if (!canCraft) craftBtn.style.opacity = '0.35';
    craftBtn.textContent = 'BUILD -- ' + craftCost + ' ' + _currencyLabel() + (!canCraft ? '  (need ' + (craftCost-bars) + ' more)' : '');
    craftBtn.addEventListener('click', function() { if (canCraft) SHIP_SKT()?.emit(_socketPrefix()+':craft'); });
    wrap.appendChild(craftBtn);

    var hint = document.createElement('div');
    hint.style.cssText = 'color:rgba(150,200,255,0.28);font-size:11px;margin-top:10px;text-align:center;';
    hint.textContent = "Can't afford it? Sell this blueprint or wait for a better draw tomorrow.";
    wrap.appendChild(hint);

    var sbBtn = document.createElement('button');
    sbBtn.style.cssText = 'display:block;margin:10px auto 0;background:none;border:none;color:rgba(255,150,50,0.4);font-family:Courier New,monospace;font-size:11px;cursor:pointer;text-decoration:underline;';
    sbBtn.textContent = 'sell blueprint (+' + Math.floor(craftCost*0.25) + ' bars)';
    sbBtn.addEventListener('click', function() { SHIP_SKT()?.emit('ship:sellBlueprint'); });
    wrap.appendChild(sbBtn);
  } else {
    var none = document.createElement('div');
    none.style.cssText = 'text-align:center;color:rgba(150,200,255,0.2);font-size:13px;';
    none.textContent = 'No pending blueprint.';
    wrap.appendChild(none);
  }

  ct.appendChild(wrap);
}

// ── BLUEPRINT CARD ────────────────────────────────────────────────────────────
function blueprintCardHTML(bp) {
  var qc    = SHIP_QUALITY_COLORS[bp.quality] || '#888';
  var rankC = RANK_COLORS[bp.rank] || '#888';
  var st    = bp.stats;
  return '<div style="background:rgba(0,8,20,0.9);border:1px solid '+qc+'55;border-radius:10px;padding:18px;box-shadow:0 0 16px '+qc+'18;">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">'
    + '<div><div style="font-size:28px;">'+(CLASS_ICONS[bp.class]||'?')+'</div>'
    + '<div style="color:rgba(150,200,255,0.45);font-size:11px;margin-top:4px;">'+(bp.classLabel||bp.class)+'</div></div>'
    + '<div style="text-align:right;">'
    + '<div style="color:'+qc+';font-size:13px;font-weight:bold;">'+bp.quality.toUpperCase()+'</div>'
    + '<div style="color:'+rankC+';font-size:22px;font-weight:bold;">RANK '+bp.rank+'</div></div></div>'
    + '<div style="color:#CCEEFF;font-size:14px;font-weight:bold;margin-bottom:10px;">'+bp.name+'</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;color:rgba(150,200,255,0.45);">'
    + '<div>Hull: <b style="color:#FFB300;">'+(st.hull||0)+' hits</b></div>'
    + '<div>Shield: <b style="color:#4488FF;">'+fmtNum(st.shieldHP||st.shield||0)+'</b></div>'
    + '<div>Engine: <b style="color:#44FF88;">'+((st.engine||0.5)*10).toFixed(1)+'x</b></div>'
    + '<div>Missile: <b style="color:#FF4444;">'+fmtNum(st.missileDmg||0)+'</b></div>'
    + '<div>Bullet: <b style="color:#FF6644;">'+fmtNum(st.bulletDmg||0)+'</b></div>'
    + '<div>Warp: <b style="color:#AA88FF;">'+((st.warp||1).toFixed(1))+'x</b></div>'
    + '<div>Cargo: <b style="color:#FF8844;">'+(st.cargo||10)+' slots</b></div>'
    + '<div>Weapon Cap: <b style="color:#FF4488;">'+(st.weaponCap||0)+'</b></div>'
    + '</div></div>';
}

// ── DRAW REVEAL ───────────────────────────────────────────────────────────────
function showDrawReveal(bp) {
  var qc = SHIP_QUALITY_COLORS[bp.quality] || '#888';
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:900;display:flex;align-items:center;justify-content:center;font-family:Courier New,monospace;cursor:pointer;';
  ov.innerHTML = '<div style="text-align:center;max-width:440px;">'
    + '<div style="color:rgba(150,200,255,0.45);font-size:12px;letter-spacing:0.2em;margin-bottom:20px;">NEW BLUEPRINT</div>'
    + '<div style="font-size:48px;margin-bottom:12px;animation:drawSpin 0.6s ease-out;">'+(CLASS_ICONS[bp.class]||'?')+'</div>'
    + '<div style="color:'+qc+';font-size:22px;font-weight:bold;text-shadow:0 0 20px '+qc+';margin-bottom:8px;">'+bp.quality.toUpperCase()+'</div>'
    + '<div style="color:#CCEEFF;font-size:18px;margin-bottom:6px;">'+bp.name+'</div>'
    + '<div style="color:rgba(150,200,255,0.45);font-size:13px;margin-bottom:24px;">'+(bp.classLabel||bp.class)+' Rank '+bp.rank+'</div>'
    + '<div style="color:rgba(150,200,255,0.28);font-size:11px;">click to continue</div></div>';
  ov.addEventListener('click', function() { ov.remove(); });
  document.body.appendChild(ov);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function formatPartStats(part) {
  var s = part.stats || {};
  var parts = [];
  if (s.missileDmg)   parts.push('<span style="color:#FF4444;">missile dmg: '+fmtNum(s.missileDmg)+'</span>');
  if (s.bulletDmg)    parts.push('<span style="color:#FF6644;">bullet dmg: '+fmtNum(s.bulletDmg)+'</span>');
  if (s.elemType && (s.missileDmg||s.bulletDmg))
                      parts.push('<span style="color:#FFAA44;">'+s.elemType+' ('+Math.round((s.elemRatio||0.5)*100)+'% elem)</span>');
  if (s.hpBonus)      parts.push('<span style="color:#4488FF;">+'+fmtNum(s.hpBonus)+' HP</span>');
  if (s.regenBonus)   parts.push('<span style="color:#44AAFF;">+'+fmtNum(s.regenBonus)+' regen</span>');
  if (s.resistances)  {
    Object.entries(s.resistances).forEach(function(e){
      parts.push('<span style="color:#AA44FF;">'+e[0]+' resist: '+fmtNum(e[1])+'</span>');
    });
  }
  if (s.speedBonus)   parts.push('<span style="color:#44FF88;">speed +'+Math.round(s.speedBonus*100)+'%</span>');
  if (s.boostBonus)   parts.push('<span style="color:#88FF44;">boost +'+Math.round(s.boostBonus*100)+'%</span>');
  if (s.distMult)     parts.push('<span style="color:#AA88FF;">warp '+s.distMult+'x</span>');
  if (s.navBonus)     parts.push('<span style="color:#FFFF44;">nav +'+Math.round(s.navBonus*100)+'%</span>');
  if (s.cloakDur)     parts.push('<span style="color:#88AAFF;">cloak '+s.cloakDur+'s</span>');
  return parts.join(' &nbsp;·&nbsp; ') || '<span style="color:rgba(150,200,255,0.3);">no stats</span>';
}

function fmtNum(n) {
  if (typeof n !== 'number' || isNaN(n)) return '0';
  if (n >= 1e15) {
    // Scientific notation: e.g. 1.0e55
    var exp = Math.floor(Math.log10(n));
    var coef = n / Math.pow(10, exp);
    return coef.toFixed(2) + 'e' + exp;
  }
  if (n >= 1e12) return (n/1e12).toFixed(1)+'T';
  if (n >= 1e9)  return (n/1e9).toFixed(1)+'B';
  if (n >= 1e6)  return (n/1e6).toFixed(1)+'M';
  if (n >= 1e3)  return (n/1e3).toFixed(1)+'K';
  return String(Math.floor(n));
}

setTimeout(setupShipSockets, 2000);
console.log('[Ship Client] Loaded');

// ── PART REVEAL ──────────────────────────────────────────────────────────────
function showPartReveal(part, isNew) {
  var rc = SHIP_QUALITY_COLORS[part.rarity] || '#888';
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:900;display:flex;align-items:center;justify-content:center;font-family:Courier New,monospace;cursor:pointer;';
  ov.innerHTML = '<div style="text-align:center;max-width:420px;">'
    + (isNew ? '<div style="color:#FFDD44;font-size:11px;letter-spacing:0.2em;margin-bottom:12px;animation:obBlink 1s infinite;">NEW RECIPE DISCOVERED</div>' : '')
    + '<div style="color:'+rc+';font-size:20px;font-weight:bold;letter-spacing:0.12em;text-shadow:0 0 16px '+rc+';margin-bottom:8px;">'+part.rarity.toUpperCase()+'</div>'
    + '<div style="color:#CCEEFF;font-size:18px;font-weight:bold;margin-bottom:6px;">'+part.name+'</div>'
    + '<div style="color:rgba(150,200,255,0.45);font-size:11px;margin-bottom:14px;">'+SLOT_LABELS[part.slot]+'</div>'
    + '<div style="font-size:11px;color:rgba(150,200,255,0.5);">'
    + Object.entries(part.stats).map(function(e){ return e[0]+': <span style="color:#88CCFF;">'+e[1]+'</span>'; }).join(' &nbsp;·&nbsp; ')
    + '</div>'
    + (part.passive ? '<div style="font-size:11px;color:#FFAA44;margin-top:8px;">passive: '+part.passive+'</div>' : '')
    + (part.passive2 ? '<div style="font-size:11px;color:#FFAA44;margin-top:4px;">passive: '+part.passive2+'</div>' : '')
    + (part.special  ? '<div style="font-size:11px;color:#FF4488;margin-top:8px;">special: '+part.special+'</div>' : '')
    + '<div style="color:rgba(150,200,255,0.25);font-size:10px;margin-top:20px;">click to continue</div>'
    + '</div>';
  ov.addEventListener('click', function() { ov.remove(); });
  document.body.appendChild(ov);
}

// ── GUNDAM DESIGN SYSTEM ──────────────────────────────────────────────────────
var GUNDAM_CLASS_ICONS = { sniper:'🎯', swordsman:'⚔', tank:'🛡', guardian:'✨', phantom:'👻' };
var GUNDAM_DESIGNS = {
  head: [
    { id:'standard',  label:'Standard Helm',    desc:'Balanced visor — versatile',             effect:null },
    { id:'vfin',      label:'V-Fin Crown',      desc:'Iconic twin fins — +5% sensor range',    effect:'vfin' },
    { id:'halo',      label:'Halo Unit',        desc:'Angelic ring — glows in combat',         effect:'halo' },
    { id:'horn',      label:'Horn Plate',       desc:'Single horn — menacing presence',        effect:'horn' },
    { id:'phantom',   label:'Phantom Mask',     desc:'Full face mask — reduces target lock',   effect:'phantom' },
    { id:'crown',     label:'Nova Crown',       desc:'Radiant crown — max visual impact',      effect:'crown' },
  ],
  body: [
    { id:'standard',  label:'Standard Frame',   desc:'Balanced build — all-rounder',           effect:null },
    { id:'heavy',     label:'Heavy Armor',      desc:'Thick plates — +15% shield',            effect:'heavyplates' },
    { id:'sleek',     label:'Sleek Frame',      desc:'Aerodynamic — +10% speed',              effect:null },
    { id:'cape',      label:'Cape Unit',        desc:'Flowing energy cape — unique look',      effect:'cape' },
    { id:'wings',     label:'Wing Pack',        desc:'Folded wings — unfurl in warp',          effect:'wings' },
    { id:'shield',    label:'Shield Bearer',    desc:'Integrated arm shield',                  effect:'armshield' },
  ],
  legs: [
    { id:'standard',  label:'Standard Legs',   desc:'Balanced mobility',                       effect:null },
    { id:'thrusters', label:'Thruster Legs',   desc:'Rocket boost — dash ability',             effect:'thrustertrail' },
    { id:'heavy',     label:'Heavy Stompers',  desc:'Armored — ground slam on landing',        effect:'stomp' },
    { id:'blades',    label:'Blade Runners',   desc:'Energy blades on shins',                  effect:'shinblades' },
    { id:'hover',     label:'Hover Skates',    desc:'Leaves energy trail while moving',        effect:'hoverskate' },
    { id:'grav',      label:'Grav Anchors',    desc:'Magnetic lock — immune to knockback',     effect:null },
  ],
  jetpack: [
    { id:'standard',  label:'Standard Pack',   desc:'Reliable twin jets',                      effect:null },
    { id:'wings',     label:'Angel Wings',     desc:'Feathered energy wings',                  effect:'angelwings' },
    { id:'rocket',    label:'Rocket Array',    desc:'Six rockets — max thrust',                effect:'rocketflare' },
    { id:'dark',      label:'Dark Veil',       desc:'Black flame jets — dark matter burn',     effect:'darkflame' },
    { id:'solar',     label:'Solar Fins',      desc:'Solar panel wings — passive DM charge',   effect:'solarfins' },
    { id:'phantom',   label:'Phantom Jets',    desc:'Invisible thrust — eerie effect',         effect:'phantomjet' },
  ],
  sword: [
    { id:'saber',     label:'Beam Saber',      desc:'Classic single blade — balanced reach',   effect:'beamsaber' },
    { id:'katana',    label:'Plasma Katana',   desc:'Curved edge — fastest swing speed',       effect:'katana' },
    { id:'double',    label:'Double Blade',    desc:'Twin ends — sweeps both directions',      effect:'doubleblade' },
    { id:'lance',     label:'Energy Lance',    desc:'Extended reach — pierces shields',        effect:'lance' },
    { id:'scythe',    label:'Plasma Scythe',   desc:'Wide arc — maximum sweep radius',        effect:'scythe' },
    { id:'twin',      label:'Twin Daggers',    desc:'Dual wield — rapid strikes',             effect:'twindaggers' },
  ],
};

var gundamDesignAnimFrame = null;

function buildGundamDesignTab(ct) {
  while (ct.firstChild) ct.removeChild(ct.firstChild);
  var gundams = shipData.ships || [];
  if (!gundams.length) {
    showCenteredMsg(ct, 'No Gundams to design.', 'Craft a blueprint first from the DAILY DRAW tab.', null);
    return;
  }
  var needsDesign = gundams.filter(function(g){ return !g.designLocked; });
  if (!needsDesign.length) {
    showCenteredMsg(ct, 'All designs locked.', 'Craft a new blueprint to design another gundam.', null);
    return;
  }
  if (!selectedShipId || gundams.find(function(g){return g.id===selectedShipId&&g.designLocked;})) {
    selectedShipId = needsDesign[0].id;
  }
  var gundam = gundams.find(function(g){return g.id===selectedShipId;})||needsDesign[0];
  var design = JSON.parse(JSON.stringify(gundam.design||{}));
  if (!design.head)     design.head    = 'standard';
  if (!design.body)     design.body    = 'standard';
  if (!design.legs)     design.legs    = 'standard';
  if (!design.jetpack)  design.jetpack = 'standard';
  if (!design.sword)    design.sword   = 'saber';
  if (!design.colPri)   design.colPri  = '#00CCFF';
  if (!design.colVisor) design.colVisor= '#FF4444';
  if (!design.colGlow)  design.colGlow = '#00FFAA';
  if (!design.colAccent)design.colAccent='#FFFFFF';

  var qc = SHIP_QUALITY_COLORS[gundam.quality]||'#888';

  // ── GUNDAM NAME BAR ──
  var nameBar = document.createElement('div');
  nameBar.style.cssText='display:flex;align-items:center;gap:12px;margin-bottom:20px;padding:10px 16px;background:rgba(0,10,25,0.8);border:1px solid rgba(255,140,0,0.2);border-radius:10px;';
  nameBar.innerHTML='<div style="font-size:22px;">⚙</div>'
    +'<div style="flex:1;"><div style="color:rgba(255,200,100,0.4);font-size:10px;letter-spacing:0.15em;">GUNDAM FRAME</div>'
    +'<div style="color:#FFAA00;font-size:14px;font-weight:bold;">'+gundam.name+'</div>'
    +'<div style="color:'+qc+';font-size:10px;">'+gundam.quality+' · RANK '+gundam.rank+'</div></div>';
  ct.appendChild(nameBar);

  // ── TWO COLUMN LAYOUT ──
  var layout = document.createElement('div');
  layout.style.cssText='display:flex;gap:20px;';

  // ── LEFT: OPTIONS ──
  var leftCol = document.createElement('div');
  leftCol.style.cssText='flex:1;min-width:0;';

  function makeSection(label, parts, key) {
    var hdr=document.createElement('div');
    hdr.style.cssText='color:rgba(150,200,255,0.4);font-size:10px;letter-spacing:0.15em;margin-bottom:8px;margin-top:16px;';
    hdr.textContent=label;
    leftCol.appendChild(hdr);
    var grid=document.createElement('div');
    grid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:4px;';
    parts.forEach(function(p){
      var card=document.createElement('div');
      card.style.cssText='padding:8px 10px;border-radius:8px;border:1px solid rgba(0,100,200,'+(design[key]===p.id?'0.8)':'0.2)')+';background:rgba(0,10,30,'+(design[key]===p.id?'0.9)':'0.4)')+';cursor:pointer;transition:all 0.15s;';
      card.innerHTML='<div style="color:'+(design[key]===p.id?'#88CCFF':'rgba(150,200,255,0.6)')+';font-size:11px;font-weight:bold;">'+p.label+'</div>'
        +'<div style="color:rgba(150,200,255,0.4);font-size:9px;margin-top:2px;">'+p.desc+'</div>'
        +(p.effect?'<div style="color:rgba(255,200,0,0.5);font-size:9px;margin-top:2px;">✦ '+p.effect.toUpperCase()+'</div>':'');
      card.addEventListener('click',function(){
        design[key]=p.id;
        gundam.design=JSON.parse(JSON.stringify(design));
        buildGundamDesignTab(ct);
      });
      grid.appendChild(card);
    });
    leftCol.appendChild(grid);
  }

  makeSection('HEAD', GUNDAM_DESIGNS.head, 'head');
  makeSection('BODY', GUNDAM_DESIGNS.body, 'body');
  makeSection('LEGS', GUNDAM_DESIGNS.legs, 'legs');
  makeSection('JETPACK', GUNDAM_DESIGNS.jetpack, 'jetpack');
  makeSection('SWORD STYLE', GUNDAM_DESIGNS.sword, 'sword');

  // ── COLORS ──
  var colorHdr=document.createElement('div');
  colorHdr.style.cssText='color:rgba(150,200,255,0.4);font-size:10px;letter-spacing:0.15em;margin-bottom:8px;margin-top:16px;';
  colorHdr.textContent='ARMOR COLORS';
  leftCol.appendChild(colorHdr);
  var GCOLORS=['#00CCFF','#4488FF','#FF4444','#FF8800','#44FF88','#AA44FF','#FFFF00','#FFFFFF','#111122','#FF2288'];
  var COLOR_LABELS={colPri:'Primary Armor',colVisor:'Visor / Eyes',colGlow:'Engine Glow',colAccent:'Accent Trim'};
  Object.keys(COLOR_LABELS).forEach(function(key){
    var row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:8px;';
    var lbl=document.createElement('div');
    lbl.style.cssText='color:rgba(150,200,255,0.5);font-size:10px;width:90px;';
    lbl.textContent=COLOR_LABELS[key];
    row.appendChild(lbl);
    GCOLORS.forEach(function(col){
      var sw=document.createElement('div');
      sw.style.cssText='width:20px;height:20px;border-radius:50%;background:'+col+';cursor:pointer;border:2px solid '+(design[key]===col?'#FFF':'transparent')+';flex-shrink:0;';
      sw.addEventListener('click',function(){
        design[key]=col;
        gundam.design=JSON.parse(JSON.stringify(design));
        buildGundamDesignTab(ct);
      });
      row.appendChild(sw);
    });
    leftCol.appendChild(row);
  });

  layout.appendChild(leftCol);

  // ── RIGHT: LIVE PREVIEW ──
  var rightCol=document.createElement('div');
  rightCol.style.cssText='width:260px;flex-shrink:0;';
  var previewHdr=document.createElement('div');
  previewHdr.style.cssText='color:rgba(150,200,255,0.4);font-size:10px;letter-spacing:0.15em;margin-bottom:8px;text-align:center;';
  previewHdr.textContent='LIVE PREVIEW';
  rightCol.appendChild(previewHdr);
  var pCanvas=document.createElement('canvas');
  pCanvas.width=260; pCanvas.height=320;
  pCanvas.style.cssText='width:260px;height:320px;border:1px solid rgba(0,100,200,0.2);border-radius:10px;background:rgba(0,5,20,0.9);display:block;';
  rightCol.appendChild(pCanvas);

  // Quality badge
  var qBadge=document.createElement('div');
  qBadge.style.cssText='text-align:center;margin-top:8px;font-size:12px;font-weight:bold;color:'+qc+';letter-spacing:0.15em;';
  qBadge.textContent=gundam.quality.toUpperCase()+' · RANK '+gundam.rank;
  rightCol.appendChild(qBadge);

  // Class badge
  var clsBadge=document.createElement('div');
  clsBadge.style.cssText='text-align:center;margin-top:4px;font-size:10px;color:rgba(255,160,0,0.7);letter-spacing:0.1em;';
  clsBadge.textContent=(gundam.classIcon||'⚙')+' '+((gundam.classLabel||gundam.class||'').toUpperCase());
  rightCol.appendChild(clsBadge);

  layout.appendChild(rightCol);
  ct.appendChild(layout);

  // ── FINALIZE BUTTON ──
  var finBtn=document.createElement('button');
  finBtn.className='ship-btn';
  finBtn.style.cssText='width:100%;margin-top:24px;padding:14px;font-size:15px;background:linear-gradient(135deg,#1a0033,#330055);border-color:#AA44FF;color:#CC88FF;';
  finBtn.textContent='FINALIZE DESIGN →';
  finBtn.addEventListener('click',function(){
    gundam.design=JSON.parse(JSON.stringify(design));
    gundam.designLocked=true;
    SHIP_SKT()?.emit('gundam:lockDesign',{gundamId:gundam.id,design:design});
    activeTab='hangar';
    refreshTab();
  });
  ct.appendChild(finBtn);

  // ── DRAW PREVIEW ──
  if (gundamDesignAnimFrame) { cancelAnimationFrame(gundamDesignAnimFrame); gundamDesignAnimFrame=null; }
  (function animPreview(){
    gundamDesignAnimFrame = requestAnimationFrame(animPreview);
    var ctx=pCanvas.getContext('2d');
    ctx.clearRect(0,0,260,320);
    // Background
    var bg=ctx.createLinearGradient(0,0,0,320);
    bg.addColorStop(0,'#000008'); bg.addColorStop(1,'#001020');
    ctx.fillStyle=bg; ctx.fillRect(0,0,260,320);
    // Stars
    ctx.fillStyle='rgba(200,220,255,0.4)';
    for(var i=0;i<30;i++){ctx.fillRect((i*73)%260,(i*47)%320,1,1);}
    // Draw mech centered
    var mx=130, my=240;
    var t=Date.now()/1000;
    drawGundamPreview(ctx,mx,my,design,t,gundam.quality);
  })();
}

function drawGundamPreview(ctx, x, floor, design, t, quality) {
  var pri   = design.colPri    || '#1144BB';
  var visor = design.colVisor  || '#FF2200';
  var glow  = design.colGlow   || '#00FFCC';
  var acc   = design.colAccent || '#AACCFF';
  var bob   = Math.sin(t * 1.1) * 2;
  var pulse = 0.6 + Math.sin(t * 3) * 0.4;

  function rect(col, rx, ry, rw, rh, a) {
    ctx.globalAlpha = a !== undefined ? a : 1;
    ctx.fillStyle = col; ctx.fillRect(rx, ry, rw, rh);
    ctx.globalAlpha = 1;
  }
  function gRect(col, rx, ry, rw, rh, blur) {
    ctx.shadowColor = col; ctx.shadowBlur = blur || 10;
    ctx.fillStyle = col; ctx.fillRect(rx, ry, rw, rh);
    ctx.shadowBlur = 0;
  }
  function trap(col, cx, ty, topW, botW, h) {
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(cx - topW/2, ty); ctx.lineTo(cx + topW/2, ty);
    ctx.lineTo(cx + botW/2, ty + h); ctx.lineTo(cx - botW/2, ty + h);
    ctx.closePath(); ctx.fill();
  }

  var legH = 52, bodyH = 58, headH = 38, sw = 54;
  var bodyY = floor - legH - bodyH + bob;
  var headY = bodyY - headH;
  var hd = design.head || 'standard';
  var bd = design.body || 'standard';
  var lgs = design.legs || 'standard';
  var jp = design.jetpack || 'standard';
  var bw = bd === 'heavy' ? sw + 12 : bd === 'sleek' ? sw - 8 : sw;

  // ── GROUND SHADOW ──
  ctx.globalAlpha = 0.2; ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(x, floor + bob + 4, 28, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  // ── MISSILE LAUNCHERS (back shoulders) ──
  var mlC = '#0a1525';
  rect(mlC, x - bw/2 - 26, bodyY - 6, 14, 44);
  rect(mlC, x + bw/2 + 12, bodyY - 6, 14, 44);
  // Launcher tubes
  for (var mi = 0; mi < 4; mi++) {
    rect('#0d1e33', x - bw/2 - 25, bodyY - 4 + mi * 10, 12, 7);
    rect('#0d1e33', x + bw/2 + 13, bodyY - 4 + mi * 10, 12, 7);
    // Warhead glow
    gRect(visor, x - bw/2 - 26, bodyY - 2 + mi * 10, 4, 5, 8);
    gRect(visor, x + bw/2 + 22, bodyY - 2 + mi * 10, 4, 5, 8);
  }

  // ── JETPACK ──
  if (jp === 'wings' || jp === 'solar') {
    ctx.save(); ctx.globalAlpha = 0.8;
    var wc = jp === 'wings' ? acc : glow;
    ctx.strokeStyle = wc; ctx.lineWidth = 3;
    ctx.shadowColor = wc; ctx.shadowBlur = 10;
    for (var ws = -1; ws <= 1; ws += 2) {
      ctx.beginPath();
      ctx.moveTo(x + ws * (bw/2 + 2), bodyY + 10);
      ctx.bezierCurveTo(x + ws * (bw/2 + 60), bodyY - 20, x + ws * (bw/2 + 55), bodyY + 50, x + ws * (bw/2 + 2), bodyY + bodyH - 8);
      ctx.stroke();
    }
    ctx.shadowBlur = 0; ctx.restore();
  } else if (jp === 'dark') {
    rect('#1a0022', x - bw/2 - 12, bodyY + 6, 9, 44);
    rect('#1a0022', x + bw/2 + 3, bodyY + 6, 9, 44);
    ctx.globalAlpha = pulse * 0.7;
    gRect('rgba(200,0,255,0.9)', x - bw/2 - 12, bodyY + 44, 9, 12, 18);
    gRect('rgba(200,0,255,0.9)', x + bw/2 + 3, bodyY + 44, 9, 12, 18);
    ctx.globalAlpha = 1;
  } else if (jp === 'rocket') {
    for (var ri = 0; ri < 3; ri++) {
      rect('#0a1525', x - bw/2 - 13, bodyY + 3 + ri * 14, 10, 11);
      gRect(glow, x - bw/2 - 13, bodyY + 12 + ri * 14, 10, 4, 10);
      rect('#0a1525', x + bw/2 + 3, bodyY + 3 + ri * 14, 10, 11);
      gRect(glow, x + bw/2 + 3, bodyY + 12 + ri * 14, 10, 4, 10);
    }
  } else if (jp === 'phantom') {
    ctx.globalAlpha = 0.25 + Math.sin(t * 2) * 0.15;
    gRect(glow, x - bw/2 - 10, bodyY + 6, 8, 44, 16);
    gRect(glow, x + bw/2 + 2, bodyY + 6, 8, 44, 16);
    ctx.globalAlpha = 1;
  } else {
    // Standard twin jets -- angular
    rect('#0d1e33', x - bw/2 - 11, bodyY + 6, 9, 40);
    rect('#0d1e33', x + bw/2 + 2, bodyY + 6, 9, 40);
    gRect(glow, x - bw/2 - 11, bodyY + 42, 9, 8, 14);
    gRect(glow, x + bw/2 + 2, bodyY + 42, 9, 8, 14);
  }

  // ── LEGS ──
  var lw = lgs === 'heavy' ? 20 : lgs === 'sleek' ? 13 : 16;
  // Thighs
  trap(pri, x - 13, bodyY + bodyH, 16, lw, 20);
  trap(pri, x + 13, bodyY + bodyH, 16, lw, 20);
  // Knee armor
  rect(acc, x - 13 - lw/2, bodyY + bodyH + 16, lw + 2, 10);
  rect(acc, x + 13 - lw/2, bodyY + bodyH + 16, lw + 2, 10);
  gRect(glow, x - 13 - lw/2 + 2, bodyY + bodyH + 17, lw - 2, 3, 6);
  gRect(glow, x + 13 - lw/2 + 2, bodyY + bodyH + 17, lw - 2, 3, 6);
  // Shins
  rect(pri, x - 13 - lw/2 + 1, bodyY + bodyH + 26, lw, 18);
  rect(pri, x + 13 - lw/2 - 1, bodyY + bodyH + 26, lw, 18);
  // Shin detail strip
  rect(acc, x - 13 - lw/2 + 3, bodyY + bodyH + 30, lw - 4, 4, 0.5);
  rect(acc, x + 13 - lw/2 + 1, bodyY + bodyH + 30, lw - 4, 4, 0.5);
  // Boots
  var bc = lgs === 'heavy' ? acc : pri;
  rect(bc, x - 13 - lw/2 - 2, bodyY + bodyH + 44, lw + 6, 8 + bob);
  rect(bc, x + 13 - lw/2 - 4, bodyY + bodyH + 44, lw + 6, 8 + bob);
  // Leg effects
  if (lgs === 'blades') {
    gRect(visor, x - 8, bodyY + bodyH + 28, 3, 18, 8);
    gRect(visor, x + 5, bodyY + bodyH + 28, 3, 18, 8);
  } else if (lgs === 'hover' || lgs === 'thrusters') {
    ctx.globalAlpha = 0.35 + Math.sin(t * 5) * 0.3;
    gRect(glow, x - 15, floor + bob, 14, 5, 14);
    gRect(glow, x + 1, floor + bob, 14, 5, 14);
    ctx.globalAlpha = 1;
  }

  // ── BODY ──
  // Main torso -- trapezoidal (wider at shoulders)
  trap(pri, x, bodyY, bw + 14, bw - 2, bodyH);
  // Chest center armor plate
  trap(acc, x, bodyY + 2, 28, 20, 16);
  // Chest reactor core
  ctx.shadowColor = glow; ctx.shadowBlur = 16;
  ctx.globalAlpha = 0.8 + pulse * 0.2;
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(x, bodyY + 14, 6, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  // Inner core ring
  ctx.strokeStyle = acc; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, bodyY + 14, 10, 0, Math.PI * 2); ctx.stroke();
  // ABS PLATES -- 6 pack
  for (var row = 0; row < 3; row++) {
    rect(acc, x - 14, bodyY + 26 + row * 10, 11, 8, 0.5);
    rect(acc, x + 3, bodyY + 26 + row * 10, 11, 8, 0.5);
    // Neon edge on abs
    gRect(glow, x - 14, bodyY + 26 + row * 10, 11, 2, 4);
    gRect(glow, x + 3, bodyY + 26 + row * 10, 11, 2, 4);
  }
  // Hip joints glowing
  gRect(glow, x - bw/2, bodyY + bodyH - 8, 7, 7, 10);
  gRect(glow, x + bw/2 - 7, bodyY + bodyH - 8, 7, 7, 10);
  // Side vents
  rect(acc, x - bw/2 + 2, bodyY + 36, 6, 14, 0.6);
  rect(acc, x + bw/2 - 8, bodyY + 36, 6, 14, 0.6);

  // ── SHOULDERS ──
  var shW = bd === 'shield' ? 26 : 20;
  trap(acc, x - bw/2 - shW/2 + 2, bodyY - 4, shW + 4, shW - 2, 22);
  trap(acc, x + bw/2 + shW/2 - 2, bodyY - 4, shW + 4, shW - 2, 22);
  // Shoulder neon trim
  gRect(glow, x - bw/2 - shW + 4, bodyY, shW - 2, 3, 8);
  gRect(glow, x + bw/2 + 2, bodyY, shW - 2, 3, 8);
  // Shield on left shoulder
  if (bd === 'shield') {
    rect(pri, x - bw/2 - 32, bodyY + 22, 16, 28);
    gRect(glow, x - bw/2 - 32, bodyY + 22, 16, 3, 6);
  }

  // ── ARMS ──
  // Upper arms
  rect(pri, x - bw/2 - 10, bodyY + 22, 9, 22);
  rect(pri, x + bw/2 + 1, bodyY + 22, 9, 22);
  // Elbow joints
  gRect(glow, x - bw/2 - 11, bodyY + 40, 11, 5, 8);
  gRect(glow, x + bw/2 + 0, bodyY + 40, 11, 5, 8);
  // Forearms -- with arm cannon
  rect(pri, x - bw/2 - 11, bodyY + 44, 11, 20);
  rect(pri, x + bw/2 + 0, bodyY + 44, 11, 20);
  // ARM CANNONS
  rect('#0a1525', x - bw/2 - 13, bodyY + 46, 5, 16);
  rect('#0a1525', x + bw/2 + 8, bodyY + 46, 5, 16);
  gRect(visor, x - bw/2 - 13, bodyY + 60, 5, 4, 8);
  gRect(visor, x + bw/2 + 8, bodyY + 60, 5, 4, 8);

  // ── HEAD ──
  // Neck
  rect(pri, x - 8, headY + headH - 4, 16, 8);
  // Main helm -- trapezoidal visor shape
  trap(pri, x, headY, 30, 34, headH - 2);
  // Face plate
  trap(acc, x, headY + 6, 24, 20, 14);
  // VISOR -- glowing strip
  gRect(visor, x - 14, headY + 10, 28, 10, 14);
  // Visor inner details
  rect('#000', x - 12, headY + 12, 9, 6, 0.6);
  rect('#000', x + 3, headY + 12, 9, 6, 0.6);
  // Chin plate
  rect(acc, x - 10, headY + headH - 10, 20, 8);

  // Head effects
  if (hd === 'vfin') {
    // V-Fin -- iconic twin fins
    ctx.fillStyle = acc;
    ctx.beginPath(); ctx.moveTo(x - 2, headY); ctx.lineTo(x - 8, headY - 22); ctx.lineTo(x - 2, headY - 4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 2, headY); ctx.lineTo(x + 8, headY - 22); ctx.lineTo(x + 2, headY - 4); ctx.fill();
    // Center fin
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.moveTo(x - 2, headY - 2); ctx.lineTo(x, headY - 16); ctx.lineTo(x + 2, headY - 2); ctx.fill();
    gRect(glow, x - 1, headY - 16, 2, 16, 6);
  } else if (hd === 'halo') {
    ctx.save();
    ctx.strokeStyle = glow; ctx.lineWidth = 4;
    ctx.globalAlpha = 0.7 + Math.sin(t * 2) * 0.3;
    ctx.shadowColor = glow; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.ellipse(x, headY - 10, 20, 6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0; ctx.restore();
  } else if (hd === 'horn') {
    ctx.fillStyle = visor;
    ctx.beginPath(); ctx.moveTo(x - 3, headY); ctx.lineTo(x, headY - 24); ctx.lineTo(x + 3, headY); ctx.fill();
    gRect(visor, x - 2, headY - 24, 4, 24, 6);
  } else if (hd === 'crown') {
    for (var ci = 0; ci < 5; ci++) {
      var cxp = x - 16 + ci * 8;
      var cyp = headY - (ci % 2 === 0 ? 14 : 7);
      ctx.globalAlpha = 0.8 + Math.sin(t * 3 + ci) * 0.2;
      gRect(glow, cxp, cyp, 4, headY - cyp, 8);
    }
    ctx.globalAlpha = 1;
  } else if (hd === 'phantom') {
    rect('rgba(0,0,0,0.7)', x - 14, headY + 4, 28, 20);
    gRect(visor, x - 10, headY + 11, 7, 5, 6);
    gRect(visor, x + 3, headY + 11, 7, 5, 6);
  }

  // ── SWORD ──
  var sw2 = design.sword || 'saber';
  var handX = x + bw/2 + 14; // right hand position
  var handY = bodyY + 44;
  if (sw2 === 'saber') {
    // Single beam saber -- upward
    gRect(visor, handX, handY - 40, 4, 44, 12);
    gRect('#ffffff', handX + 1, handY - 40, 2, 44, 6);
    rect(acc, handX - 2, handY, 8, 8); // hilt
    rect('#333', handX - 3, handY + 6, 10, 12); // grip
  } else if (sw2 === 'katana') {
    // Curved katana -- diagonal
    ctx.save(); ctx.translate(handX + 2, handY); ctx.rotate(-0.3);
    gRect(visor, -2, -48, 4, 52, 12);
    gRect('#ffffff', -1, -48, 2, 52, 4);
    rect(acc, -4, 0, 8, 6);
    rect('#333', -4, 6, 8, 14);
    ctx.restore();
  } else if (sw2 === 'double') {
    // Double blade -- extends both up and down
    gRect(visor, handX, handY - 44, 4, 36, 12);
    gRect(visor, handX, handY + 10, 4, 30, 12);
    gRect('#ffffff', handX + 1, handY - 44, 2, 36, 4);
    gRect('#ffffff', handX + 1, handY + 10, 2, 30, 4);
    rect('#333', handX - 2, handY - 6, 8, 16); // center grip
    rect(acc, handX - 4, handY - 2, 12, 4); // cross guard
  } else if (sw2 === 'lance') {
    // Energy lance -- long diagonal
    ctx.save(); ctx.translate(handX, handY + 4); ctx.rotate(-0.15);
    gRect(visor, -2, -60, 5, 70, 10);
    gRect('#ffffff', -1, -60, 3, 70, 4);
    // Tip
    ctx.fillStyle = visor; ctx.beginPath();
    ctx.moveTo(-2,-60); ctx.lineTo(3,-60); ctx.lineTo(1,-72); ctx.fill();
    rect('#333', -3, 6, 10, 14);
    ctx.restore();
  } else if (sw2 === 'scythe') {
    // Plasma scythe -- curved wide blade
    ctx.save(); ctx.translate(handX, handY);
    ctx.strokeStyle = visor; ctx.lineWidth = 5; ctx.shadowColor = visor; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.bezierCurveTo(-30, -40, -20, -60, 10, -50); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.bezierCurveTo(-30, -40, -20, -60, 10, -50); ctx.stroke();
    ctx.shadowBlur = 0;
    rect('#333', -3, 0, 8, 16);
    ctx.restore();
  } else if (sw2 === 'twin') {
    // Twin daggers -- one in each hand
    gRect(visor, handX, handY - 22, 3, 26, 10);
    gRect('#ffffff', handX + 1, handY - 22, 1, 26, 4);
    rect('#333', handX - 1, handY + 2, 6, 10);
    var lhX = x - bw/2 - 14;
    gRect(visor, lhX, handY - 22, 3, 26, 10);
    gRect('#ffffff', lhX + 1, handY - 22, 1, 26, 4);
    rect('#333', lhX - 1, handY + 2, 6, 10);
  }

  // ── QUALITY AURA ──
  var qa = { Common:0, Uncommon:4, Rare:8, Epic:14, Legendary:20, Mythic:28 }[quality] || 0;
  if (qa > 0) {
    ctx.globalAlpha = 0.15 + pulse * 0.1;
    ctx.shadowColor = glow; ctx.shadowBlur = qa;
    var ag = ctx.createRadialGradient(x, bodyY + bodyH/2, 0, x, bodyY + bodyH/2, 80);
    ag.addColorStop(0, glow.replace(')', ',0.3)').replace('rgb', 'rgba'));
    ag.addColorStop(1, 'transparent');
    ctx.fillStyle = ag;
    ctx.fillRect(x - 80, headY - 20, 160, legH + bodyH + headH + 40);
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
}

// ── SHIP DESIGN SYSTEM v2 ─────────────────────────────────────────────────────

var SHIP_DESIGNS = {
  fighter: {
    nose: [
      { id:'dart',   label:'Dart',        desc:'Needle tip — +5% speed',        speedMod: 0.05, ufoLabel:'Medium Disc',  ufoDesc:'Standard 72u diameter' },
      { id:'prong',  label:'Split Prong', desc:'Twin tips — dual weapon slot',   speedMod: 0.02, ufoLabel:'Large Disc',   ufoDesc:'Wide 88u saucer — +cargo/hull' },
      { id:'wedge',  label:'Wedge',       desc:'Blunt plate — +8% hull',         speedMod:-0.04, ufoLabel:'Mega Disc',    ufoDesc:'Massive disc — maximum presence' },
      { id:'razor',  label:'Razor',       desc:'Swept blade — +3% speed',        speedMod: 0.03, ufoLabel:'Slim Disc',    ufoDesc:'Thin 58u profile — top speed' },
    ],
    body: [
      { id:'sleek',   label:'Sleek',    desc:'Thin fuselage — +8% speed',      speedMod: 0.08 },
      { id:'armored', label:'Armored',  desc:'Wide hull — +12% hull resist',    speedMod:-0.06 },
      { id:'canopy',  label:'Canopy',   desc:'Raised bubble — +nav range',      speedMod:-0.02 },
      { id:'stealth', label:'Stealth',  desc:'Flat angular — low signature',    speedMod: 0.04 },
    ],
    engines: [
      { id:'twin',   label:'Twin Pod',    desc:'Dual balanced — reliable',      speedMod: 0.05 },
      { id:'single', label:'Single Burn', desc:'One massive — top raw speed',   speedMod: 0.10 },
      { id:'quad',   label:'Quad Micro',  desc:'Four small — precise control',  speedMod: 0.03 },
    ],
  },
  miner: {
    nose: [
      { id:'scoop', label:'Scoop',    desc:'Wide curved — +ore intake',        speedMod:-0.05 },
      { id:'drill', label:'Drill',    desc:'Pointed drill — penetrates rock',   speedMod: 0.02 },
      { id:'jaw',   label:'Flat Jaw', desc:'Wide mouth — max cargo intake',     speedMod:-0.08 },
      { id:'wedge', label:'Wedge',    desc:'Balanced approach',                 speedMod:-0.02 },
    ],
    body: [
      { id:'cargo',   label:'Cargo Bay',  desc:'Max storage — +40% cargo',     speedMod:-0.10 },
      { id:'tanker',  label:'Tanker',     desc:'Rounded — balanced cargo/speed',speedMod:-0.05 },
      { id:'modular', label:'Modular',    desc:'Upgradeable segments',          speedMod:-0.03 },
      { id:'compact', label:'Compact',    desc:'Lean miner — best speed',       speedMod: 0.02 },
    ],
    engines: [
      { id:'heavydual', label:'Heavy Dual',  desc:'Pulls heavy loads',         speedMod: 0.0  },
      { id:'bigone',    label:'Single Big',  desc:'Steady haul speed',         speedMod:-0.03 },
      { id:'sidemount', label:'Side Mounts', desc:'Better maneuver',           speedMod: 0.04 },
    ],
  },
  destroyer: {
    nose: [
      { id:'cannon', label:'Cannon',      desc:'Barrel front — weapon bonus',  speedMod:-0.03 },
      { id:'hammer', label:'Hammer',      desc:'Flat plate — ram damage',       speedMod:-0.06 },
      { id:'spikes', label:'Spike Array', desc:'Forward spikes — close shred',  speedMod:-0.02 },
      { id:'lancer', label:'Lancer',      desc:'Long point — range bonus',      speedMod: 0.01 },
    ],
    body: [
      { id:'battleplate', label:'Battle Plate', desc:'Max hull rating',        speedMod:-0.08 },
      { id:'dread',       label:'Dreadnought',  desc:'Heaviest class',         speedMod:-0.12 },
      { id:'stealth',     label:'Stealth',      desc:'Lower radar profile',    speedMod: 0.03 },
      { id:'cruiser',     label:'Cruiser',      desc:'Endurance rating',       speedMod:-0.04 },
    ],
    engines: [
      { id:'burnquad',    label:'Burn Quad',   desc:'Four high-output burns',  speedMod: 0.06 },
      { id:'afterburner', label:'Afterburner', desc:'Speed burst capability',  speedMod: 0.08 },
      { id:'cluster',     label:'Cluster',     desc:'Agile for size',          speedMod: 0.04 },
    ],
  },
  frigate: {
    nose: [
      { id:'standard', label:'Standard', desc:'Balanced versatile',            speedMod: 0.0  },
      { id:'lancer',   label:'Lancer',   desc:'Extended range weapons',        speedMod: 0.02 },
      { id:'broad',    label:'Broad',    desc:'Wide command bridge',            speedMod:-0.03 },
      { id:'dart',     label:'Dart',     desc:'Fast intercept profile',         speedMod: 0.04 },
    ],
    body: [
      { id:'command', label:'Command', desc:'Crew efficiency bonus',            speedMod:-0.02 },
      { id:'patrol',  label:'Patrol',  desc:'Lean — extended range',           speedMod: 0.04 },
      { id:'cruiser', label:'Cruiser', desc:'Heavy endurance',                  speedMod:-0.05 },
      { id:'sleek',   label:'Sleek',   desc:'Fast frigate build',               speedMod: 0.06 },
    ],
    engines: [
      { id:'tri',       label:'Balanced Tri', desc:'Perfect balance',          speedMod: 0.02 },
      { id:'dualheavy', label:'Dual Heavy',   desc:'Solid power',              speedMod: 0.0  },
      { id:'eco',       label:'Eco Single',   desc:'Longest range',            speedMod:-0.02 },
    ],
  },
  ufo: {
    nose: [
      { id:'dome',    label:'Dome',       desc:'Classic saucer top',            speedMod: 0.0  },
      { id:'spike',   label:'Spike',      desc:'Center antenna — +nav range',   speedMod: 0.03 },
      { id:'flat',    label:'Flat Top',   desc:'Low profile — +stealth',        speedMod: 0.02 },
    ],
    body: [
      { id:'classic', label:'Classic',    desc:'Standard disc — balanced',      speedMod: 0.05 },
      { id:'wide',    label:'Wide Disc',  desc:'Huge disc — +cargo/hull',       speedMod:-0.05 },
      { id:'thin',    label:'Thin Ring',  desc:'Minimal disc — top speed',      speedMod: 0.10 },
    ],
    engines: [
      { id:'antigrav', label:'Anti-Grav', desc:'Hovering field — silent',       speedMod: 0.08 },
      { id:'beam',     label:'Beam Drive',desc:'Energy beam — fast burst',      speedMod: 0.06 },
      { id:'ring',     label:'Ring Drive', desc:'Ring propulsion — efficient',  speedMod: 0.04 },
    ],
  },
};

var QUALITY_SHINE = {
  Common:    { glow:0,   color:'#888888', alpha:0.0,  anim:false },
  Uncommon:  { glow:4,   color:'#44CC44', alpha:0.12, anim:false },
  Rare:      { glow:8,   color:'#4488FF', alpha:0.22, anim:false },
  Epic:      { glow:12,  color:'#AA44FF', alpha:0.32, anim:false },
  Legendary: { glow:18,  color:'#FFB300', alpha:0.48, anim:true  },
  Mythic:    { glow:24,  color:'#FF2244', alpha:0.65, anim:true  },
};

var designAnimFrame = null;
var designOrigin = null; // null = not chosen yet, 'human' or 'alien'
var designAnimFrame = null;

// ── DESIGN TAB ───────────────────────────────────────────────────────────────
// ── HELPER: centered message ─────────────────────────────────────────────────
function showCenteredMsg(ct, title, body, btnLabel, btnFn) {
  var wrap = document.createElement('div');
  wrap.style.cssText = 'text-align:center;max-width:480px;margin:60px auto;font-family:Courier New,monospace;';
  var t = document.createElement('div');
  t.style.cssText = 'color:#AACCFF;font-size:15px;font-weight:bold;margin-bottom:10px;letter-spacing:0.08em;';
  t.textContent = title;
  wrap.appendChild(t);
  var b = document.createElement('div');
  b.style.cssText = 'color:rgba(150,200,255,0.4);font-size:12px;line-height:1.8;white-space:pre-line;margin-bottom:20px;';
  b.textContent = body;
  wrap.appendChild(b);
  if (btnLabel && btnFn) {
    var btn = document.createElement('button');
    btn.className = 'ship-btn';
    btn.style.cssText = 'font-size:13px;padding:11px 28px;';
    btn.textContent = btnLabel;
    btn.addEventListener('click', btnFn);
    wrap.appendChild(btn);
  }
  ct.appendChild(wrap);
}

function buildDesignTab(ct) {
  while (ct.firstChild) ct.removeChild(ct.firstChild);
  var ships = shipData.ships || [];
  if (!ships.length) {
    showCenteredMsg(ct, 'No ships to design.', 'Craft a blueprint first from the DAILY DRAW tab.', null);
    return;
  }
  // Check if any ship still needs designing
  var needsDesign = ships.filter(function(s){ return !s.designLocked; });
  if (!needsDesign.length) {
    showCenteredMsg(ct, 'All designs are locked.',
      'You don\'t have a new ship that needs designing right now. Craft a new blueprint from the DAILY DRAW tab to design another ship.',
      null);
    return;
  }
  // Default selectedShipId to first unlocked ship
  if (!selectedShipId || ships.find(function(s){return s.id===selectedShipId && s.designLocked;})) {
    selectedShipId = needsDesign[0].id;
  }

  // ── STEP 1: PICK MANUFACTURER ──
  if (!designOrigin) {
    buildManufacturerPicker(ct, needsDesign);
    return;
  }

  var ship   = ships.find(function(s){ return s.id===selectedShipId; }) || ships[0];
  var cls    = ship.class || 'fighter';
  var rawDefs= SHIP_DESIGNS[cls] || SHIP_DESIGNS.fighter;
  var design = JSON.parse(JSON.stringify(ship.design || {}));
  if (!design.nose)     design.nose    = rawDefs.nose[0].id;
  // Always force ufo for alien, always force non-ufo for human
  if (designOrigin === 'alien') design.body = 'ufo';
  else if (!design.body || design.body === 'ufo') design.body = rawDefs.body.filter(function(o){return o.id!=='ufo';})[0].id;
  if (!design.engines)  design.engines = rawDefs.engines[0].id;
  if (!design.colPri)   design.colPri   = '#4488CC';
  if (!design.colSec)   design.colSec   = '#223344';
  if (!design.colGlow)  design.colGlow  = '#00CCFF';

  var defs = {
    nose:    designOrigin==='alien' ? rawDefs.nose : rawDefs.nose,
    body:    designOrigin==='alien' ? rawDefs.body.filter(function(o){return o.id==='ufo';}) : rawDefs.body.filter(function(o){return o.id!=='ufo';}),
    engines: rawDefs.engines,
  };
  var qc = SHIP_QUALITY_COLORS[ship.quality] || '#888';

  // ── MANUFACTURER BAR ──
  var mfgBar = document.createElement('div');
  mfgBar.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:20px;padding:10px 16px;background:rgba(0,10,25,0.8);border:1px solid rgba(0,100,200,0.2);border-radius:10px;';
  var mfgIcon = document.createElement('div');
  mfgIcon.style.cssText = 'font-size:22px;';
  mfgIcon.textContent = designOrigin==='human' ? '⬡' : '◈';
  var mfgTxt = document.createElement('div');
  mfgTxt.style.cssText = 'flex:1;';
  mfgTxt.innerHTML = '<div style="color:rgba(150,200,255,0.4);font-size:10px;letter-spacing:0.15em;">MANUFACTURER</div>'
    +'<div style="color:#00CCFF;font-size:14px;font-weight:bold;">'+(designOrigin==='human'?'Human Fleet Systems':'Alien Collective')+'</div>';
  var changeBtn = document.createElement('button');
  changeBtn.className = 'ship-btn';
  changeBtn.style.cssText = 'font-size:11px;padding:6px 14px;';
  changeBtn.textContent = 'CHANGE';
  changeBtn.addEventListener('click', function() {
    designOrigin = null;
    if (designAnimFrame) { cancelAnimationFrame(designAnimFrame); designAnimFrame=null; }
    buildDesignTab(ct);
  });
  mfgBar.appendChild(mfgIcon); mfgBar.appendChild(mfgTxt); mfgBar.appendChild(changeBtn);
  ct.appendChild(mfgBar);

  // ── SHIP SELECTOR ──
  if (ships.length > 1) {
    var selHdr = document.createElement('div');
    selHdr.style.cssText = 'color:rgba(150,200,255,0.4);font-size:10px;letter-spacing:0.15em;margin-bottom:8px;';
    selHdr.textContent = 'SELECT SHIP';
    ct.appendChild(selHdr);
    var fleetRow = document.createElement('div');
    fleetRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;';
    ships.forEach(function(s) {
      var sqc = SHIP_QUALITY_COLORS[s.quality]||'#888';
      var fc  = document.createElement('div');
      fc.className = 'fleet-card';
      fc.style.borderColor = s.id===selectedShipId ? sqc : 'rgba(0,100,200,0.2)';
      fc.innerHTML = '<div style="font-size:16px;">'+(CLASS_ICONS[s.class]||'🚀')+'</div>'
        +'<div style="color:'+sqc+';font-size:10px;font-weight:bold;">'+s.quality.toUpperCase()+'</div>'
        +'<div style="color:#AACCFF;font-size:11px;">'+s.name+'</div>';
      fc.addEventListener('click', function(){ selectedShipId=s.id; buildDesignTab(ct); });
      fleetRow.appendChild(fc);
    });
    ct.appendChild(fleetRow);
  }

  // ── MAIN GRID ──
  var wrap = document.createElement('div');
  wrap.style.cssText = 'display:grid;grid-template-columns:1fr 360px;gap:24px;max-width:960px;';

  // ── LEFT ──
  var left = document.createElement('div');

  // Ship name
  var sn = document.createElement('div');
  sn.style.cssText = 'color:#AACCFF;font-size:13px;font-weight:bold;margin-bottom:2px;';
  sn.textContent = ship.name;
  left.appendChild(sn);
  var sc = document.createElement('div');
  sc.style.cssText = 'color:rgba(150,200,255,0.35);font-size:11px;margin-bottom:14px;letter-spacing:0.1em;';
  sc.textContent = (ship.classLabel||cls).toUpperCase()+' · RANK '+ship.rank+' · '+ship.quality.toUpperCase();
  left.appendChild(sc);

  // Speed readout (only for human ships)
  if (designOrigin === 'human') {
    var spdDiv = document.createElement('div');
    spdDiv.style.cssText = 'background:rgba(0,20,40,0.6);border:1px solid rgba(0,100,200,0.2);border-radius:7px;padding:7px 12px;margin-bottom:12px;font-size:11px;';
    function updateSpd() {
      var spd = calcDesignSpeed(ship, design);
      spdDiv.innerHTML = '<span style="color:rgba(150,200,255,0.4);">Engine: </span>'
        +'<span style="color:#44FF88;font-weight:bold;">'+(spd.final*10).toFixed(2)+'x</span>'
        +' <span style="color:rgba(150,200,255,0.22);">base '+(spd.base*10).toFixed(2)+'x</span>'
        +' <span style="color:'+(spd.mod>=0?'#44FF88':'#FF6644')+'">'+(spd.mod>=0?'+':'')+(spd.mod*10).toFixed(2)+' aero</span>';
    }
    updateSpd();
    left.appendChild(spdDiv);
  }

  // Section pickers — alien only shows body if ufo
  var sectionsToShow = designOrigin==='alien' ? ['engines'] : ['nose','body','engines'];
  sectionsToShow.forEach(function(section) {
    var sw = document.createElement('div');
    sw.style.cssText = 'margin-bottom:13px;';
    var sl = document.createElement('div');
    sl.style.cssText = 'color:rgba(150,200,255,0.5);font-size:11px;letter-spacing:0.15em;margin-bottom:7px;';
    sl.textContent = section==='engines' && designOrigin==='alien' ? 'PROPULSION' : section.toUpperCase();
    sw.appendChild(sl);
    var optList = defs[section] || [];
    if (!optList.length) return;
    var ch = document.createElement('div');
    ch.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:5px;';
    var btnEls = [];
    optList.forEach(function(opt) {
      var btn = document.createElement('div');
      function renderBtn() {
        var isSel = design[section]===opt.id;
        btn.style.cssText = 'padding:7px 11px;border-radius:7px;cursor:pointer;transition:border 0.1s,background 0.1s;'
          +'background:'+(isSel?'rgba(0,30,70,0.9)':'rgba(0,12,28,0.6)')+';'
          +'border:1px solid '+(isSel?qc:'rgba(0,100,200,0.18)')+';'
          +'box-shadow:'+(isSel?'0 0 7px '+qc+'33':'none')+';';
        btn.innerHTML = '<div style="color:'+(isSel?qc:'#AACCFF')+';font-size:12px;font-weight:bold;margin-bottom:2px;">'+opt.label+'</div>'
          +'<div style="color:rgba(150,200,255,0.3);font-size:10px;">'+opt.desc+'</div>';
      }
      renderBtn();
      btn._render = renderBtn;
      btn.addEventListener('click', function() {
        design[section] = opt.id;
        btnEls.forEach(function(b){ b._render(); });
        if (typeof updateSpd === 'function') updateSpd();
        ship.design = JSON.parse(JSON.stringify(design));
        SHIP_SKT()?.emit('ship:saveDesign',{shipId:ship.id,design:design});
        if (previewCanvas) drawShipPreview(previewCanvas,ship,design,Date.now());
        if (wrap && wrap._updateStats) wrap._updateStats();
      });
      btnEls.push(btn);
      ch.appendChild(btn);
    });
    sw.appendChild(ch);
    left.appendChild(sw);
  });

  // ── 3 COLOR PICKERS ──
  var colorHdr = document.createElement('div');
  colorHdr.style.cssText = 'color:rgba(150,200,255,0.5);font-size:11px;letter-spacing:0.15em;margin-bottom:10px;margin-top:4px;';
  colorHdr.textContent = 'HULL COLORS';
  left.appendChild(colorHdr);

  var colorDefs = designOrigin==='alien'
    ? [['colPri','Disc Body'],['colSec','Dome'],['colGlow','Ring Lights']]
    : [['colPri','Primary Hull'],['colSec','Accent / Nose'],['colGlow','Engine Glow']];

  colorDefs.forEach(function(cd) {
    var key = cd[0], label = cd[1];
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px;';
    var lbl = document.createElement('div');
    lbl.style.cssText = 'color:rgba(150,200,255,0.4);font-size:11px;min-width:100px;';
    lbl.textContent = label;
    var swatch = document.createElement('div');
    swatch.style.cssText = 'width:28px;height:28px;border-radius:6px;background:'+(design[key]||'#4488CC')+';border:2px solid rgba(255,255,255,0.2);cursor:pointer;position:relative;';
    var inp = document.createElement('input');
    inp.type = 'color'; inp.value = design[key]||'#4488CC';
    inp.style.cssText = 'position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;';
    inp.addEventListener('input', function() {
      design[key] = inp.value;
      swatch.style.background = inp.value;
      ship.design = JSON.parse(JSON.stringify(design));
      if (previewCanvas) drawShipPreview(previewCanvas,ship,design,Date.now());
    });
    inp.addEventListener('change', function() {
      SHIP_SKT()?.emit('ship:saveDesign',{shipId:ship.id,design:design});
    });
    swatch.appendChild(inp);
    // Quick swatches
    var sw = document.createElement('div');
    sw.style.cssText = 'display:flex;gap:4px;';
    var swatchColors = ['#4488CC','#CC4444','#44CC88','#CC8844','#8844CC','#222222','#AAAAAA','#FF6600'];
    swatchColors.forEach(function(col) {
      var s = document.createElement('div');
      s.style.cssText = 'width:16px;height:16px;border-radius:3px;cursor:pointer;background:'+col+';border:1px solid rgba(255,255,255,0.15);';
      s.addEventListener('click', function() {
        design[key] = col; inp.value = col; swatch.style.background = col;
        ship.design = JSON.parse(JSON.stringify(design));
        SHIP_SKT()?.emit('ship:saveDesign',{shipId:ship.id,design:design});
        if (previewCanvas) drawShipPreview(previewCanvas,ship,design,Date.now());
        if (wrap && wrap._updateStats) wrap._updateStats();
      });
      sw.appendChild(s);
    });
    row.appendChild(lbl); row.appendChild(swatch); row.appendChild(sw);
    left.appendChild(row);
  });

  // Readiness + Finalize
  var hasEngine = ship.slots && ship.slots.engine;
  var rd = document.createElement('div');
  rd.style.cssText = 'font-size:11px;line-height:1.9;margin-top:12px;margin-bottom:12px;';
  rd.innerHTML = '<span style="color:#44FF88;">✓</span> <span style="color:rgba(150,200,255,0.4);">Ship designed</span><br>'
    +(hasEngine?'<span style="color:#44FF88;">✓</span>':'<span style="color:#FF4444;">✗</span>')
    +' <span style="color:rgba(150,200,255,0.4);">Engine equipped</span>'
    +(!hasEngine?' <span style="color:rgba(255,100,100,0.4);font-size:10px;">— equip from PARTS tab</span>':'');
  left.appendChild(rd);

  var finalBtn = document.createElement('button');
  finalBtn.className = 'ship-btn';
  finalBtn.style.cssText = 'width:100%;font-size:13px;padding:12px;background:linear-gradient(135deg,rgba(0,30,70,0.9),rgba(0,50,100,0.9));border-color:rgba(0,180,255,0.6);color:#00CCFF;letter-spacing:0.1em;';
  finalBtn.textContent = 'FINALIZE DESIGN →';
  finalBtn.addEventListener('click', function() {
    finalBtn.disabled = true;
    finalBtn.textContent = 'SAVING...';
    finalBtn.style.opacity = '0.6';
    // Save design first, then lock
    ship.design = JSON.parse(JSON.stringify(design));
    SHIP_SKT()?.emit('ship:saveDesign', { shipId: ship.id, design: design });
    setTimeout(function() {
      SHIP_SKT()?.emit('ship:lockDesign', { shipId: ship.id });
    }, 300);
  });
  left.appendChild(finalBtn);

  // ── RIGHT: preview ──
  var right = document.createElement('div');
  right.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
  var pvl = document.createElement('div');
  pvl.style.cssText = 'color:rgba(150,200,255,0.4);font-size:11px;letter-spacing:0.15em;margin-bottom:10px;';
  pvl.textContent = designOrigin==='alien' ? 'UFO PREVIEW' : 'LIVE PREVIEW';
  right.appendChild(pvl);
  var cw = document.createElement('div');
  cw.style.cssText = 'border-radius:12px;overflow:hidden;background:#00040C;border:1px solid rgba(0,100,200,0.22);';
  var previewCanvas = document.createElement('canvas');
  previewCanvas.width=360; previewCanvas.height=220; previewCanvas.style.cssText='display:block;';
  cw.appendChild(previewCanvas);
  right.appendChild(cw);
  var badge = document.createElement('div');
  badge.style.cssText = 'margin-top:9px;color:'+qc+';font-size:12px;font-weight:bold;letter-spacing:0.12em;text-shadow:0 0 10px '+qc+';';
  badge.textContent = ship.quality.toUpperCase()+' · RANK '+ship.rank;
  right.appendChild(badge);
  // Second preview for alien showing how it looks in combat (uses ship body render for scale reference)
  if (designOrigin === 'alien') {
    var pvl2 = document.createElement('div');
    pvl2.style.cssText = 'color:rgba(150,200,255,0.4);font-size:11px;letter-spacing:0.15em;margin-top:16px;margin-bottom:10px;';
    pvl2.textContent = 'SCALE REFERENCE';
    right.appendChild(pvl2);
    var cw2 = document.createElement('div');
    cw2.style.cssText = 'border-radius:12px;overflow:hidden;background:#00040C;border:1px solid rgba(170,68,255,0.22);';
    var previewCanvas2 = document.createElement('canvas');
    previewCanvas2.width=360; previewCanvas2.height=160; previewCanvas2.style.cssText='display:block;';
    cw2.appendChild(previewCanvas2);
    right.appendChild(cw2);
    var scaleNote = document.createElement('div');
    scaleNote.style.cssText = 'color:rgba(150,200,255,0.25);font-size:10px;margin-top:6px;text-align:center;';
    scaleNote.textContent = 'UFO vs Fighter — alien ships are wider than human class';
    right.appendChild(scaleNote);
  }

  // Stats panel — updates as design changes
  var statsPanel = document.createElement('div');
  statsPanel.id = 'designStatsPanel';
  statsPanel.style.cssText = 'margin-top:14px;width:100%;background:rgba(0,10,25,0.7);border:1px solid rgba(0,100,200,0.2);border-radius:8px;padding:12px;font-size:11px;';
  function buildStatsPanel() {
    statsPanel.innerHTML = '';
    var st = ship.stats || {};
    var spd = calcDesignSpeed(ship, design);
    var statDefs = [
      ['Hull',      st.hull ? st.hull+' hits'         : '--',  '#FFB300'],
      ['Shield',    st.shield ? fmtNum(st.shield)      : '--',  '#4488FF'],
      ['Engine',    (spd.final*10).toFixed(2)+'x',             '#44FF88'],
      ['Damage',    st.damage ? (st.damage*10).toFixed(1)+'x' : '--', '#FF4444'],
      ['Warp',      st.warp ? (st.warp*5).toFixed(1)+'x'      : '--', '#AA88FF'],
      ['Cargo',     st.cargo ? st.cargo+' slots'       : '--',  '#FF8844'],
      ['Nav',       st.nav ? String(st.nav)            : '--',  '#FFFF44'],
      ['WeaponCap', st.weaponCap ? st.weaponCap+'/10'  : '--',  '#FF4488'],
    ];
    var grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:5px;';
    statDefs.forEach(function(sd) {
      var d = document.createElement('div');
      d.style.cssText = 'color:rgba(150,200,255,0.4);';
      d.innerHTML = sd[0]+': <span style="color:'+sd[2]+';font-weight:bold;">'+sd[1]+'</span>';
      grid.appendChild(d);
    });
    statsPanel.appendChild(grid);
    // Aero modifier note for human ships
    if (designOrigin === 'human') {
      var aeroNote = document.createElement('div');
      aeroNote.style.cssText = 'color:rgba(150,200,255,0.25);font-size:10px;margin-top:7px;border-top:1px solid rgba(0,100,200,0.15);padding-top:6px;';
      var mod = spd.mod;
      aeroNote.textContent = 'Aero modifier: '+(mod>=0?'+':'')+(mod*10).toFixed(2)+'x from body design';
      statsPanel.appendChild(aeroNote);
    }
  }
  buildStatsPanel();
  // Rebuild stats when any option changes — override btn click
  var _origBtnClick = null; // stats will update via direct call below
  right.appendChild(statsPanel);

  // Patch: update stats panel whenever a section button is clicked
  wrap._updateStats = function() { buildStatsPanel(); };

  wrap.appendChild(left); wrap.appendChild(right);
  ct.appendChild(wrap);

  if (designAnimFrame) { cancelAnimationFrame(designAnimFrame); designAnimFrame=null; }
  requestAnimationFrame(function(){
    drawShipPreview(previewCanvas, ship, design, Date.now());
    // Draw scale comparison for alien
    if (designOrigin === 'alien' && typeof previewCanvas2 !== 'undefined' && previewCanvas2) {
      drawScaleComparison(previewCanvas2, ship, design);
    }
  });
}

function buildManufacturerPicker(ct, ships) {
  var wrap = document.createElement('div');
  wrap.style.cssText = 'max-width:600px;margin:40px auto;text-align:center;font-family:Courier New,monospace;';

  var hdr = document.createElement('div');
  hdr.style.cssText = 'color:rgba(150,200,255,0.4);font-size:11px;letter-spacing:0.2em;margin-bottom:28px;';
  hdr.textContent = 'SELECT MANUFACTURER';
  wrap.appendChild(hdr);

  var row = document.createElement('div');
  row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:20px;';

  var mfgDefs = [
    { id:'human', icon:'⬡', name:'Human Fleet Systems', desc:'Fighter, Miner, Destroyer, Frigate. Conventional aerodynamics. Parts are interchangeable across the fleet.', color:'#0088FF' },
    { id:'alien', icon:'◈', name:'Alien Collective',     desc:'UFO disc design. Anti-gravity propulsion. Ring light customization. Unknown origin — and they like it that way.', color:'#AA44FF' },
  ];

  mfgDefs.forEach(function(mfg) {
    var card = document.createElement('div');
    card.style.cssText = 'background:rgba(0,10,25,0.85);border:1px solid '+mfg.color+'44;border-radius:14px;padding:28px 20px;cursor:pointer;transition:all 0.2s;';
    card.innerHTML = '<div style="font-size:52px;margin-bottom:12px;">'+mfg.icon+'</div>'
      +'<div style="color:'+mfg.color+';font-size:14px;font-weight:bold;letter-spacing:0.1em;margin-bottom:10px;">'+mfg.name+'</div>'
      +'<div style="color:rgba(150,200,255,0.35);font-size:11px;line-height:1.7;">'+mfg.desc+'</div>';
    card.addEventListener('mouseover', function(){ card.style.borderColor=mfg.color+'AA'; card.style.boxShadow='0 0 20px '+mfg.color+'22'; });
    card.addEventListener('mouseout',  function(){ card.style.borderColor=mfg.color+'44'; card.style.boxShadow='none'; });
    card.addEventListener('click', function() {
      designOrigin = mfg.id;
      buildDesignTab(ct);
    });
    row.appendChild(card);
  });

  wrap.appendChild(row);
  ct.appendChild(wrap);
}

// ── PREVIEW RENDERER ─────────────────────────────────────────────────────────
function drawShipPreview(canvas, ship, design, startTime) {
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W=canvas.width, H=canvas.height;
  var shine = QUALITY_SHINE[ship.quality] || QUALITY_SHINE.Common;
  var isUFO = design.body === 'ufo';

  function frame() {
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#00040C'; ctx.fillRect(0,0,W,H);
    var rng=mulberry32(99);
    for (var i=0;i<70;i++){
      var b=0.2+rng()*0.8; ctx.fillStyle='rgba(255,255,255,'+b+')';
      ctx.fillRect(rng()*W,rng()*H,rng()<0.15?2:1,rng()<0.15?2:1);
    }
    var phase  = shine.anim ? (Date.now()-startTime)/1000 : 0;
    var pulseA = shine.anim ? shine.alpha*(0.7+0.3*Math.sin(phase*3)) : shine.alpha;

    ctx.save();
    ctx.translate(W*0.5, H*0.5);
    if (isUFO) {
      drawUFOBody(ctx, design, pulseA, shine.color, shine.glow, phase);
    } else {
      drawEngineGlow(ctx, design.engines, ship.class, phase);
      drawShipBody(ctx, design, ship.class, pulseA, shine.color, shine.glow);
    }
    ctx.restore();

    if (shine.glow>0){
      ctx.save(); ctx.strokeStyle=shine.color; ctx.lineWidth=2;
      ctx.globalAlpha=pulseA*0.5; ctx.shadowColor=shine.color; ctx.shadowBlur=shine.glow;
      ctx.strokeRect(2,2,W-4,H-4); ctx.restore();
    }
    if (shine.anim) designAnimFrame=requestAnimationFrame(frame);
  }
  frame();
}

// ── UFO RENDERER ─────────────────────────────────────────────────────────────
// ── UFO RENDERER ─────────────────────────────────────────────────────────────
// Reference: classic saucer - wide flat disc, rounded dome center-top,
// oval lights around disc rim, tractor beam shooting down, no wings/nose
function drawUFOBody(ctx, design, glowA, glowCol, glowSz, phase) {
  var bodyCol  = design.colPri  || '#888888'; // disc body
  var domeCol  = design.colSec  || '#88CCFF'; // dome glass
  var lightCol = design.colGlow || '#FFDD44'; // rim lights + beam

  var bodyLight = shadeColor(bodyCol, 0.25);
  var bodyDark  = shadeColor(bodyCol, -0.35);

  // ── TRACTOR BEAM (behind disc, pointing down) ──
  ctx.save();
  var beamAlpha = 0.25 + 0.15*Math.sin(phase*3);
  var grad = ctx.createLinearGradient(0, 18, 0, 110);
  grad.addColorStop(0, hexToRgba(lightCol, beamAlpha));
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(-28, 20);
  ctx.lineTo(-60, 110);
  ctx.lineTo( 60, 110);
  ctx.lineTo( 28, 20);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ── DISC SHADOW ──
  ctx.save();
  ctx.beginPath(); ctx.ellipse(4, 22, 80, 10, 0, 0, Math.PI*2);
  ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.globalAlpha=0.5; ctx.fill();
  ctx.restore();

  // ── LOWER DISC BULGE (bottom of saucer) ──
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, 8, 72, 18, 0, 0, Math.PI*2);
  ctx.fillStyle = bodyDark;
  ctx.globalAlpha = 1;
  if(glowA>0){ctx.shadowColor=glowCol; ctx.shadowBlur=glowSz*0.3;}
  ctx.fill();
  ctx.restore();

  // ── MAIN DISC (center slab) ──
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, 0, 80, 13, 0, 0, Math.PI*2);
  ctx.fillStyle = bodyCol;
  ctx.globalAlpha = 1;
  if(glowA>0){ctx.shadowColor=glowCol; ctx.shadowBlur=glowSz*0.5;}
  ctx.fill();
  ctx.restore();

  // ── DISC TOP SURFACE (upper highlight) ──
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, -2, 78, 10, 0, Math.PI, Math.PI*2);
  ctx.fillStyle = bodyLight;
  ctx.globalAlpha = 0.7;
  ctx.fill();
  ctx.restore();

  // ── DISC OUTLINE ──
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, 0, 80, 13, 0, 0, Math.PI*2);
  ctx.strokeStyle = bodyDark;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8;
  ctx.stroke();
  ctx.restore();

  // ── RIM LIGHTS (oval bumps around edge like reference) ──
  var rimCount = 8;
  for (var i=0; i<rimCount; i++) {
    var a = (i/rimCount)*Math.PI*2;
    var lx = Math.cos(a)*62;
    var ly = Math.sin(a)*9;
    var bright = 0.6 + 0.4*Math.sin(a*2 + phase*2.5);
    // Light housing (dark bump)
    ctx.save();
    ctx.beginPath(); ctx.ellipse(lx, ly, 8, 5, a, 0, Math.PI*2);
    ctx.fillStyle = bodyDark; ctx.globalAlpha = 0.9; ctx.fill(); ctx.restore();
    // Light glow
    ctx.save();
    ctx.beginPath(); ctx.ellipse(lx, ly, 5, 3.5, a, 0, Math.PI*2);
    ctx.fillStyle = lightCol;
    ctx.globalAlpha = bright;
    ctx.shadowColor = lightCol; ctx.shadowBlur = 10+bright*6;
    ctx.fill(); ctx.restore();
  }

  // ── DOME BASE RING ──
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, -8, 34, 7, 0, 0, Math.PI*2);
  ctx.fillStyle = bodyCol; ctx.globalAlpha = 1; ctx.fill();
  ctx.strokeStyle = bodyDark; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();

  // ── DOME (rounded glass bubble) ──
  ctx.save();
  // Dome fill
  ctx.beginPath();
  ctx.ellipse(0, -10, 30, 28, 0, Math.PI, Math.PI*2);
  ctx.fillStyle = hexToRgba(domeCol, 0.6);
  ctx.globalAlpha = 0.9;
  ctx.shadowColor = domeCol; ctx.shadowBlur = 14;
  ctx.fill();
  // Dome outline
  ctx.beginPath();
  ctx.ellipse(0, -10, 30, 28, 0, Math.PI, Math.PI*2);
  ctx.strokeStyle = hexToRgba(domeCol, 0.8);
  ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7; ctx.stroke();
  ctx.restore();

  // ── DOME GLASS SHINE ──
  ctx.save();
  // Main shine highlight top-left
  ctx.beginPath();
  ctx.ellipse(-8, -26, 10, 6, -0.5, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.globalAlpha = 0.6; ctx.fill();
  // Secondary softer highlight
  ctx.beginPath();
  ctx.ellipse(4, -18, 6, 4, 0.3, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.globalAlpha = 0.5; ctx.fill();
  ctx.restore();

  // ── QUALITY GLOW OVERLAY ──
  if (glowA > 0) {
    ctx.save();
    ctx.globalAlpha = glowA * 0.2;
    ctx.fillStyle = glowCol;
    ctx.shadowColor = glowCol; ctx.shadowBlur = glowSz * 3;
    ctx.beginPath(); ctx.ellipse(0, 0, 85, 16, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

function drawEngineGlow(ctx, eng, cls, phase) {
  var a=0.65+0.35*Math.sin(phase*8);
  ctx.save();
  var eX=cls==='destroyer'?-62:cls==='miner'?-66:cls==='frigate'?-56:-52;
  switch(eng){
    case 'twin': case 'dualheavy': case 'heavydual': case 'burnquad':
      flame(ctx,eX,-9,a,14); flame(ctx,eX,9,a,14); break;
    case 'single': case 'bigone': case 'afterburner':
      flame(ctx,eX,0,a,22); break;
    case 'eco': flame(ctx,eX,0,a*0.7,12); break;
    case 'quad': case 'cluster':
      [-13,-5,5,13].forEach(function(oy){flame(ctx,eX,oy,a*0.8,8);}); break;
    case 'tri':
      flame(ctx,eX,-12,a,10); flame(ctx,eX,12,a,10); flame(ctx,eX,0,a*0.85,8); break;
    case 'sidemount':
      flame(ctx,eX,-18,a,8); flame(ctx,eX,18,a,8); break;
    default: flame(ctx,eX,-8,a,10); flame(ctx,eX,8,a,10);
  }
  ctx.restore();
}

function flame(ctx,x,y,alpha,size){
  size=size||10;
  var len=size*(2.2+Math.random()*0.6);
  var gr=ctx.createLinearGradient(x,y,x-len,y);
  gr.addColorStop(0,'rgba(0,180,255,'+alpha+')');
  gr.addColorStop(0.45,'rgba(80,200,255,'+(alpha*0.65)+')');
  gr.addColorStop(1,'rgba(0,80,200,0)');
  ctx.save(); ctx.fillStyle=gr; ctx.globalAlpha=alpha; ctx.shadowColor='#00AAFF'; ctx.shadowBlur=size; ctx.fillRect(x-len,y-size/2,len,size); ctx.restore();
}

function fillGlow(ctx,color,glowCol,glowA,glowSz){
  ctx.save(); ctx.fillStyle=color;
  if(glowA>0&&glowSz>0){ctx.shadowColor=glowCol;ctx.shadowBlur=glowSz;ctx.globalAlpha=0.6+glowA*0.4;}
  ctx.fill(); ctx.restore();
}

function rectGlow(ctx,x,y,w,h,color,glowCol,glowA,glowSz){
  ctx.save(); ctx.fillStyle=color;
  if(glowA>0&&glowSz>0){ctx.shadowColor=glowCol;ctx.shadowBlur=glowSz;ctx.globalAlpha=0.6+glowA*0.4;}
  ctx.fillRect(x,y,w,h); ctx.restore();
}

function hexToRgba(hex,alpha){
  if(!hex||hex.length<7) return 'rgba(100,150,200,'+alpha+')';
  var r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return 'rgba('+r+','+g+','+b+','+alpha+')';
}

function shadeColor(hex,amt){
  if(!hex||hex.length<7) return hex||'#444';
  var r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  r=Math.max(0,Math.min(255,Math.round(r+(amt>0?r*amt:(255+r*amt)))));
  g=Math.max(0,Math.min(255,Math.round(g+(amt>0?g*amt:(255+g*amt)))));
  b=Math.max(0,Math.min(255,Math.round(b+(amt>0?b*amt:(255+b*amt)))));
  return '#'+r.toString(16).padStart(2,'0')+g.toString(16).padStart(2,'0')+b.toString(16).padStart(2,'0');
}

function calcDesignSpeed(ship,design){
  var cls=ship.class||'fighter';
  var defs=SHIP_DESIGNS[cls]||SHIP_DESIGNS.fighter;
  var base=ship.stats?ship.stats.engine:0.5;
  var mod=0;
  ['nose','body','engines'].forEach(function(sec){
    var opt=(defs[sec]||[]).find(function(o){return o.id===design[sec];});
    if(opt) mod+=(opt.speedMod||0);
  });
  return {base:base,mod:mod,final:Math.max(0.1,base+mod)};
}

function mulberry32(seed){
  return function(){
    seed|=0; seed=seed+0x6D2B79F5|0;
    var t=Math.imul(seed^seed>>>15,1|seed);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return((t^t>>>14)>>>0)/4294967296;
  };
}

var _origRefreshTab = refreshTab;
refreshTab = function() {
  if (designAnimFrame) { cancelAnimationFrame(designAnimFrame); designAnimFrame=null; }
  _origRefreshTab();
};


// ── SCALE COMPARISON RENDERER ────────────────────────────────────────────────
function drawScaleComparison(canvas, ship, design) {
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W=canvas.width, H=canvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#00040C'; ctx.fillRect(0,0,W,H);

  // Stars
  var rng=mulberry32(77);
  for(var i=0;i<50;i++){ var b=0.2+rng()*0.7; ctx.fillStyle='rgba(255,255,255,'+b+')'; ctx.fillRect(rng()*W,rng()*H,1,1); }

  // UFO on left at scale
  ctx.save();
  ctx.translate(W*0.32, H*0.45);
  ctx.scale(0.85, 0.85);
  drawUFOBody(ctx, design, 0.2, '#AA44FF', 6, 0);
  ctx.restore();

  // Human fighter on right at same scale for comparison
  ctx.save();
  ctx.translate(W*0.74, H*0.48);
  ctx.scale(0.65, 0.65);
  var fakeDesign = { nose:'dart', body:'sleek', engines:'twin', colPri:'#445566', colSec:'#334455', colGlow:'#4488CC' };
  drawEngineGlow(ctx, 'twin', 'fighter', 0);
  drawShipBody(ctx, fakeDesign, 'fighter', 0.1, '#4488CC', 4);
  ctx.restore();

  // Labels
  ctx.fillStyle='rgba(170,68,255,0.6)'; ctx.font='10px Courier New'; ctx.textAlign='center';
  ctx.fillText('UFO', W*0.32, H*0.9);
  ctx.fillStyle='rgba(0,136,255,0.5)';
  ctx.fillText('Fighter', W*0.74, H*0.9);

  // VS divider
  ctx.fillStyle='rgba(150,200,255,0.2)'; ctx.font='bold 14px Courier New'; ctx.textAlign='center';
  ctx.fillText('VS', W*0.52, H*0.5);
  ctx.fillStyle='rgba(150,200,255,0.1)'; ctx.fillRect(W*0.5-0.5, H*0.15, 1, H*0.7);
}

// ── HUMAN SHIP RENDERER ───────────────────────────────────────────────────────
function drawShipBody(ctx, design, cls, glowA, glowCol, glowSz) {
  var hullCol = design.colPri  || '#4488CC';
  var accCol  = design.colSec  || '#223344';
  var glwCol  = design.colGlow || '#00CCFF';
  var dark    = shadeColor(hullCol,-0.4);
  var light   = shadeColor(accCol, 0.3);
  var glass   = hexToRgba(glwCol, 0.7);

  var bH = cls==='destroyer'?34:cls==='miner'?40:cls==='frigate'?28:22;
  var bW = cls==='destroyer'?76:cls==='miner'?84:cls==='frigate'?72:72;
  var bX = -bW*0.55;

  // WINGS — sweep back
  ctx.save();
  var wSpan=cls==='destroyer'?30:cls==='miner'?26:cls==='frigate'?22:18;
  ctx.beginPath(); ctx.moveTo(10,-8); ctx.lineTo(-30,-8-wSpan); ctx.lineTo(-40,-8-wSpan+6); ctx.lineTo(-20,-8); ctx.closePath();
  fillGlow(ctx,dark,glowCol,glowA*0.7,glowSz*0.4);
  ctx.beginPath(); ctx.moveTo(10,8); ctx.lineTo(-30,8+wSpan); ctx.lineTo(-40,8+wSpan-6); ctx.lineTo(-20,8); ctx.closePath();
  fillGlow(ctx,dark,glowCol,glowA*0.7,glowSz*0.4);
  ctx.save(); ctx.beginPath(); ctx.arc(-30,-8-wSpan,2.5,0,Math.PI*2); ctx.fillStyle='#FF4444'; ctx.globalAlpha=0.9; ctx.fill(); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.arc(-30, 8+wSpan,2.5,0,Math.PI*2); ctx.fillStyle='#44FF44'; ctx.globalAlpha=0.9; ctx.fill(); ctx.restore();
  ctx.restore();

  // BODY
  ctx.save();
  switch(design.body){
    case 'sleek': case 'patrol':
      ctx.beginPath(); ctx.moveTo(bX,-bH*0.35); ctx.lineTo(bX+bW,-bH*0.5); ctx.lineTo(bX+bW,bH*0.5); ctx.lineTo(bX,bH*0.35); ctx.closePath();
      fillGlow(ctx,hullCol,glowCol,glowA,glowSz); break;
    case 'armored': case 'battleplate': case 'dread': case 'cruiser':
      rectGlow(ctx,bX,-bH/2,bW,bH,hullCol,glowCol,glowA,glowSz);
      rectGlow(ctx,bX+8,-bH/2,bW-16,6,accCol,glowCol,glowA*0.5,0);
      rectGlow(ctx,bX+8,bH/2-6,bW-16,6,accCol,glowCol,glowA*0.5,0); break;
    case 'canopy': case 'command':
      rectGlow(ctx,bX,-bH/2,bW,bH,hullCol,glowCol,glowA,glowSz);
      ctx.beginPath(); ctx.ellipse(bX+bW*0.55,-bH/2-7,bW*0.22,10,0,Math.PI,Math.PI*2);
      fillGlow(ctx,glass,glowCol,glowA*0.6,glowSz*0.5); break;
    case 'stealth':
      ctx.beginPath(); ctx.moveTo(bX,0); ctx.lineTo(bX+bW*0.2,-bH*0.55); ctx.lineTo(bX+bW,-bH*0.4); ctx.lineTo(bX+bW,bH*0.4); ctx.lineTo(bX+bW*0.2,bH*0.55); ctx.closePath();
      fillGlow(ctx,hullCol,glowCol,glowA,glowSz); break;
    case 'cargo': case 'tanker':
      rectGlow(ctx,bX,-bH/2,bW,bH,hullCol,glowCol,glowA,glowSz);
      ctx.save(); ctx.strokeStyle=dark; ctx.lineWidth=1.5; ctx.globalAlpha=0.6;
      ctx.beginPath(); ctx.moveTo(bX,-bH*0.2); ctx.lineTo(bX+bW,-bH*0.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bX,bH*0.2); ctx.lineTo(bX+bW,bH*0.2); ctx.stroke();
      ctx.restore(); break;
    case 'modular': case 'compact':
      rectGlow(ctx,bX,-bH/2,bW*0.48,bH,dark,glowCol,glowA,glowSz);
      rectGlow(ctx,bX+bW*0.5,-bH/2+4,bW*0.48,bH-8,hullCol,glowCol,glowA*0.8,glowSz*0.5); break;
    default:
      rectGlow(ctx,bX,-bH/2,bW,bH,hullCol,glowCol,glowA,glowSz);
  }
  ctx.restore();

  // NOSE
  ctx.save();
  var nX=bX+bW;
  switch(design.nose){
    case 'dart': case 'standard':
      ctx.beginPath(); ctx.moveTo(nX,-bH*0.45); ctx.lineTo(nX+36,0); ctx.lineTo(nX,bH*0.45); ctx.closePath(); fillGlow(ctx,light,glowCol,glowA,glowSz); break;
    case 'prong':
      ctx.beginPath(); ctx.moveTo(nX,-4); ctx.lineTo(nX+34,-10); ctx.lineTo(nX,-14); ctx.closePath(); fillGlow(ctx,light,glowCol,glowA,glowSz);
      ctx.beginPath(); ctx.moveTo(nX, 4); ctx.lineTo(nX+34, 10); ctx.lineTo(nX, 14); ctx.closePath(); fillGlow(ctx,light,glowCol,glowA,glowSz); break;
    case 'wedge': case 'broad': case 'hammer':
      rectGlow(ctx,nX,-bH*0.55,22,bH*1.1,light,glowCol,glowA,glowSz); break;
    case 'razor': case 'lancer':
      ctx.beginPath(); ctx.moveTo(nX,-3); ctx.lineTo(nX+44,0); ctx.lineTo(nX,3); ctx.closePath(); fillGlow(ctx,light,glowCol,glowA,glowSz); break;
    case 'scoop':
      ctx.beginPath(); ctx.arc(nX+6,0,bH*0.55,-Math.PI*0.5,Math.PI*0.5); ctx.lineTo(nX,bH*0.55); ctx.lineTo(nX,-bH*0.55); ctx.closePath(); fillGlow(ctx,light,glowCol,glowA*0.7,glowSz); break;
    case 'cannon':
      rectGlow(ctx,nX,-5,44,10,light,glowCol,glowA,glowSz);
      rectGlow(ctx,nX,-bH*0.45,14,bH*0.4,dark,glowCol,glowA*0.7,0);
      rectGlow(ctx,nX,bH*0.05,14,bH*0.4,dark,glowCol,glowA*0.7,0); break;
    case 'spikes':
      for(var sp=-2;sp<=2;sp++){ctx.beginPath();ctx.moveTo(nX,sp*8-3);ctx.lineTo(nX+28,sp*8);ctx.lineTo(nX,sp*8+3);ctx.closePath();fillGlow(ctx,light,glowCol,glowA*0.85,glowSz*0.4);} break;
    default:
      ctx.beginPath(); ctx.moveTo(nX,-bH*0.4); ctx.lineTo(nX+30,0); ctx.lineTo(nX,bH*0.4); ctx.closePath(); fillGlow(ctx,light,glowCol,glowA,glowSz);
  }
  ctx.restore();

  // ENGINE PODS
  ctx.save();
  var eX=bX;
  switch(design.engines){
    case 'twin': case 'dualheavy':
      rectGlow(ctx,eX-18,-bH*0.35,18,bH*0.28,dark,glowCol,glowA*0.6,glowSz*0.4);
      rectGlow(ctx,eX-18,bH*0.07,18,bH*0.28,dark,glowCol,glowA*0.6,glowSz*0.4); break;
    case 'single': case 'bigone': case 'afterburner': case 'eco':
      rectGlow(ctx,eX-22,-bH*0.4,22,bH*0.8,dark,glowCol,glowA*0.7,glowSz*0.5); break;
    case 'quad': case 'cluster':
      [-2,-1,0,1].forEach(function(q){rectGlow(ctx,eX-14,q*bH*0.2-4,14,9,dark,glowCol,glowA*0.5,glowSz*0.3);}); break;
    case 'tri':
      rectGlow(ctx,eX-16,-bH*0.42,16,bH*0.28,dark,glowCol,glowA*0.6,glowSz*0.4);
      rectGlow(ctx,eX-16,bH*0.14,16,bH*0.28,dark,glowCol,glowA*0.6,glowSz*0.4);
      rectGlow(ctx,eX-12,-bH*0.13,12,bH*0.26,dark,glowCol,glowA*0.5,glowSz*0.3); break;
    case 'heavydual': case 'burnquad':
      rectGlow(ctx,eX-24,-bH*0.42,24,bH*0.33,dark,glowCol,glowA*0.7,glowSz*0.5);
      rectGlow(ctx,eX-24,bH*0.09,24,bH*0.33,dark,glowCol,glowA*0.7,glowSz*0.5); break;
    default:
      rectGlow(ctx,eX-18,-bH*0.3,18,bH*0.6,dark,glowCol,glowA*0.6,glowSz*0.4);
  }
  ctx.restore();

  // COCKPIT WINDOW
  ctx.save(); ctx.fillStyle=glass; ctx.globalAlpha=0.85; ctx.shadowColor=glwCol; ctx.shadowBlur=8; ctx.fillRect(bX+bW*0.35,-5,16,10); ctx.restore();

  // QUALITY SHINE
  if(glowA>0){ ctx.save(); ctx.globalAlpha=glowA*0.12; ctx.fillStyle=glowCol; ctx.shadowColor=glowCol; ctx.shadowBlur=glowSz*2; ctx.fillRect(bX-26,-bH*0.7,bW+60,bH*1.4); ctx.restore(); }
}

// ── EXPOSE RENDERERS FOR DEEPSPACE ──────────────────────────────────────────
window.drawShipBody      = drawShipBody;
window.drawUFOBody       = drawUFOBody;
window.drawEngineGlow    = drawEngineGlow;
window.mulberry32        = mulberry32;
window.SHIP_QUALITY_COLORS = SHIP_QUALITY_COLORS;
