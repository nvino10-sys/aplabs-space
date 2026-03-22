// market-client.js -- Bank, Stock Market, Crypto Terminal
// Add to main.js: import('./market-client.js');

import * as THREE from 'three';

const S      = () => window._mineScene;
const CAM    = () => window._mineCamera;
const SKT    = () => window._mineGetSocket?.();
const USR    = () => window._mineGetUsername?.() || '';
const NOTIFY = (msg) => window._mineShowNotification?.(msg);

const BANK_X = 33, BANK_Z = -7;

// ── STATE ─────────────────────────────────────────────────────────────────────
let marketUIOpen = false;
let marketTab    = 'stocks'; // stocks | crypto | bank
let marketState  = { prices:{}, stocks:{}, cryptos:{}, portfolio:{stocks:{},crypto:{},savings:0}, chips:0, history:{} };
let tradeMode    = null; // { type:'stock'|'crypto', sym, action:'buy'|'sell' }
let nearATM      = false;
let nearTerminal = false;
let nearShadyGuy = false;

// ── BUILD BANK ────────────────────────────────────────────────────────────────
function buildBank() {
  const scene = S(); if (!scene) return;
  const X = BANK_X, Z = BANK_Z;

  // Main building body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(10, 5, 7),
    new THREE.MeshLambertMaterial({ color: 0xDDCCAA })
  );
  body.position.set(X, 2.5, Z);
  body.castShadow = true;
  scene.add(body);

  // Roof
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(10.4, 0.4, 7.4),
    new THREE.MeshLambertMaterial({ color: 0x887755 })
  );
  roof.position.set(X, 5.2, Z);
  scene.add(roof);

  // Columns at entrance
  [-3.5, 3.5].forEach(ox => {
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 5, 8),
      new THREE.MeshLambertMaterial({ color: 0xFFFFEE })
    );
    col.position.set(X + ox, 2.5, Z - 3.5);
    scene.add(col);
  });

  // Door
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 3, 0.1),
    new THREE.MeshLambertMaterial({ color: 0x443322 })
  );
  door.position.set(X, 1.5, Z - 3.51);
  scene.add(door);

  // Bank sign
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(5, 0.8, 0.15),
    new THREE.MeshLambertMaterial({ color: 0x112244 })
  );
  sign.position.set(X, 4.6, Z - 3.52);
  scene.add(sign);
  const signFace = new THREE.Mesh(
    new THREE.BoxGeometry(4.6, 0.5, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xFFD700 })
  );
  signFace.position.set(X, 4.6, Z - 3.58);
  scene.add(signFace);

  // Windows
  [[-3, 2.5],[-3, 1], [3, 2.5],[3, 1]].forEach(([ox, oy]) => {
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.2, 0.1),
      new THREE.MeshLambertMaterial({ color: 0x88CCFF, transparent:true, opacity:0.7 })
    );
    win.position.set(X + ox, oy, Z - 3.52);
    scene.add(win);
  });

  // ── ATM (left side) ──────────────────────────────────────────────────────
  const atm = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.8, 0.6),
    new THREE.MeshLambertMaterial({ color: 0x223344 })
  );
  atm.position.set(X - 5.5, 0.9, Z - 2);
  scene.add(atm);
  const atmScreen = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.6, 0.05),
    new THREE.MeshBasicMaterial({ color: 0x00FFCC, emissive:new THREE.Color(0x00AAAA), transparent:true, opacity:0.9 })
  );
  atmScreen.position.set(X - 5.5, 1.1, Z - 2.31);
  scene.add(atmScreen);
  const atmKeypad = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.3, 0.04),
    new THREE.MeshLambertMaterial({ color: 0x333333 })
  );
  atmKeypad.position.set(X - 5.5, 0.6, Z - 2.31);
  scene.add(atmKeypad);
  const atmSign = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.3, 0.05),
    new THREE.MeshBasicMaterial({ color: 0x00FFCC })
  );
  atmSign.position.set(X - 5.5, 1.65, Z - 2.31);
  scene.add(atmSign);
  scene.userData.atmPos = { x: X - 5.5, z: Z - 2 };

  // ── TRADING TERMINAL (right side) ────────────────────────────────────────
  const term = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 1.6, 0.8),
    new THREE.MeshLambertMaterial({ color: 0x111122 })
  );
  term.position.set(X + 5.5, 0.8, Z - 2);
  scene.add(term);
  const termScreen = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.7, 0.05),
    new THREE.MeshBasicMaterial({ color: 0xFF8800, transparent:true, opacity:0.9 })
  );
  termScreen.userData.isTermScreen = true;
  termScreen.position.set(X + 5.5, 1.0, Z - 2.41);
  scene.add(termScreen);

  // Scrolling price lines on terminal
  for (let i = 0; i < 5; i++) {
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.04, 0.03),
      new THREE.MeshBasicMaterial({ color: i%2===0 ? 0x00FF44 : 0xFF4444, transparent:true, opacity:0.7 })
    );
    line.position.set(X + 5.5, 0.7 + i*0.1, Z - 2.43);
    line.userData.tickerLine = true;
    line.userData.tickerIdx  = i;
    scene.add(line);
  }
  scene.userData.terminalPos = { x: X + 5.5, z: Z - 2 };

  // ── SHADY GUY NPC ────────────────────────────────────────────────────────
  buildShadyGuy(X, Z - 5.5);

  // Point lights
  const atmLight  = new THREE.PointLight(0x00FFCC, 0.5, 5);
  atmLight.position.set(X - 5.5, 2, Z - 2);
  scene.add(atmLight);
  const termLight = new THREE.PointLight(0xFF8800, 0.5, 5);
  termLight.position.set(X + 5.5, 2, Z - 2);
  scene.add(termLight);

  console.log('[Market] Bank built at', X, Z);
}

function buildShadyGuy(x, z) {
  const scene = S(); if (!scene) return;

  // Body -- long trenchcoat
  const coat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.35, 1.5, 8),
    new THREE.MeshLambertMaterial({ color: 0x221100 })
  );
  coat.position.set(x, 0.75, z);
  scene.add(coat);

  // Head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 8),
    new THREE.MeshLambertMaterial({ color: 0xFFCC88 })
  );
  head.position.set(x, 1.72, z);
  scene.add(head);

  // Hat -- brim
  const hatBrim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 0.05, 8),
    new THREE.MeshLambertMaterial({ color: 0x110800 })
  );
  hatBrim.position.set(x, 1.98, z);
  scene.add(hatBrim);
  const hatTop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.22, 0.3, 8),
    new THREE.MeshLambertMaterial({ color: 0x110800 })
  );
  hatTop.position.set(x, 2.13, z);
  scene.add(hatTop);

  // Eyes -- shifty
  [-0.07, 0.07].forEach(ox => {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 4, 4),
      new THREE.MeshBasicMaterial({ color: 0x333300 })
    );
    eye.position.set(x + ox, 1.75, z - 0.2);
    scene.add(eye);
  });

  // Collar popped up
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.27, 0.25, 8),
    new THREE.MeshLambertMaterial({ color: 0x330011 })
  );
  collar.position.set(x, 1.55, z);
  scene.add(collar);

  // Nameplate
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 1, 4),
    new THREE.MeshLambertMaterial({ color: 0x888888 })
  );
  post.position.set(x + 0.8, 0.5, z);
  scene.add(post);
  const nameplate = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.25, 0.05),
    new THREE.MeshLambertMaterial({ color: 0x111133 })
  );
  nameplate.position.set(x + 0.8, 1.05, z);
  scene.add(nameplate);

  scene.userData.shadyGuyPos = { x, z };
}

// ── MINI SPARKLINE ────────────────────────────────────────────────────────────
function sparkline(history, width, height, color) {
  if (!history || history.length < 2) return '';
  const pts = history.slice(-30);
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const xs = pts.map((_, i) => (i / (pts.length-1)) * width);
  const ys = pts.map(v => height - ((v - min) / range) * height);
  const d  = pts.map((_, i) => `${i===0?'M':'L'}${xs[i].toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const lastDir = pts[pts.length-1] >= pts[pts.length-2] ? '#44FF88' : '#FF4444';
  return `<svg width="${width}" height="${height}" style="display:block;">
    <polyline points="${pts.map((_,i)=>`${xs[i].toFixed(1)},${ys[i].toFixed(1)}`).join(' ')}"
      fill="none" stroke="${color||lastDir}" stroke-width="1.5" opacity="0.9"/>
  </svg>`;
}

// ── MARKET UI ─────────────────────────────────────────────────────────────────
const marketOverlay = document.createElement('div');
marketOverlay.style.cssText = `
  position:fixed;inset:0;background:rgba(0,5,15,0.97);color:white;
  font-family:'Segoe UI',sans-serif;z-index:350;display:none;
  align-items:flex-start;justify-content:center;overflow-y:auto;
`;
document.body.appendChild(marketOverlay);

function pct(cur, base) {
  if (!base) return '0.0';
  return (((cur-base)/base)*100).toFixed(1);
}
function pctColor(cur, base) { return cur >= base ? '#44FF88' : '#FF4444'; }
function fmt(n) {
  if (n >= 1000) return n.toLocaleString(undefined,{maximumFractionDigits:0});
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function renderMarketUI() {
  const s = marketState;
  const pf = s.portfolio || { stocks:{}, crypto:{}, savings:0 };

  // Portfolio value
  let portfolioValue = (s.chips || 0) + (pf.savings || 0);
  Object.entries(pf.stocks||{}).forEach(([sym,shares]) => { portfolioValue += (s.prices[sym]||0) * shares; });
  Object.entries(pf.crypto||{}).forEach(([sym,units])  => { portfolioValue += (s.prices[sym]||0) * units;  });

  marketOverlay.innerHTML = `
    <div style="max-width:560px;width:100%;padding:20px;box-sizing:border-box;min-height:100vh;">

      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div>
          <div style="font-size:1.4rem;font-weight:bold;color:#FFD700;">💰 APLabs Markets</div>
          <div style="opacity:0.4;font-size:0.75rem;">Est. whenever. Trust nobody.</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.8rem;opacity:0.5;">Net Worth</div>
          <div style="font-size:1.1rem;font-weight:bold;color:#FFD700;">${Math.floor(portfolioValue).toLocaleString()} SB</div>
          <div style="font-size:0.75rem;opacity:0.5;">💰 ${(s.chips||0).toLocaleString()} liquid</div>
        </div>
      </div>

      <!-- Tabs -->
      <div style="display:flex;gap:6px;margin-bottom:14px;">
        ${[['stocks','📈 Stocks'],['crypto','🪙 Crypto'],['bank','🏦 Bank'],['portfolio','📊 Portfolio']].map(([t,l]) => `
          <button onclick="window.marketTab('${t}')"
            style="flex:1;background:${marketTab===t?'rgba(255,215,0,0.15)':'rgba(255,255,255,0.05)'};
            color:${marketTab===t?'#FFD700':'rgba(255,255,255,0.6)'};
            border:1px solid ${marketTab===t?'rgba(255,215,0,0.4)':'rgba(255,255,255,0.1)'};
            border-radius:10px;padding:9px;cursor:pointer;font-size:13px;font-weight:bold;">
            ${l}
          </button>`).join('')}
      </div>

      ${marketTab === 'stocks'    ? renderStocksTab(s, pf) : ''}
      ${marketTab === 'crypto'    ? renderCryptoTab(s, pf) : ''}
      ${marketTab === 'bank'      ? renderBankTab(s, pf)   : ''}
      ${marketTab === 'portfolio' ? renderPortfolioTab(s, pf) : ''}

      <button onclick="window.closeMarket()"
        style="width:100%;background:rgba(255,255,255,0.07);color:white;
        border:1px solid rgba(255,255,255,0.15);border-radius:10px;
        padding:10px;cursor:pointer;font-size:13px;margin-top:10px;">
        Close
      </button>
    </div>
  `;
}

function renderStocksTab(s, pf) {
  return `
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${Object.entries(s.stocks||{}).map(([sym, stock]) => {
        const price   = s.prices[sym] || stock.base;
        const held    = pf.stocks?.[sym] || 0;
        const change  = pct(price, stock.base);
        const col     = pctColor(price, stock.base);
        return `
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);
            border-radius:12px;padding:12px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="flex:1;">
                <div style="display:flex;align-items:baseline;gap:6px;">
                  <span style="font-weight:bold;font-size:0.9rem;">${sym}</span>
                  <span style="opacity:0.4;font-size:0.72rem;">${stock.name}</span>
                </div>
                <div style="opacity:0.4;font-size:0.7rem;margin-top:1px;">${stock.desc}</div>
              </div>
              <div style="text-align:center;min-width:60px;">
                ${sparkline(s.history?.[sym], 60, 28)}
              </div>
              <div style="text-align:right;">
                <div style="font-weight:bold;">${fmt(price)} SB</div>
                <div style="font-size:0.75rem;color:${col};">${change >= 0 ? '+' : ''}${change}%</div>
                ${held > 0 ? `<div style="font-size:0.7rem;opacity:0.5;">${held} held</div>` : ''}
              </div>
            </div>
            <div style="display:flex;gap:6px;margin-top:8px;">
              <button onclick="window.marketTrade('stock','${sym}','buy')"
                style="flex:1;background:rgba(0,200,100,0.15);color:#44FF88;
                border:1px solid rgba(0,200,100,0.3);border-radius:8px;
                padding:6px;cursor:pointer;font-size:12px;font-weight:bold;">
                Buy
              </button>
              <button onclick="window.marketTrade('stock','${sym}','sell')"
                ${held===0?'disabled style="opacity:0.3;cursor:not-allowed;"':''}
                style="flex:1;background:rgba(255,50,50,0.15);color:#FF6666;
                border:1px solid rgba(255,50,50,0.3);border-radius:8px;
                padding:6px;cursor:pointer;font-size:12px;font-weight:bold;">
                Sell ${held > 0 ? `(${held})` : ''}
              </button>
            </div>
          </div>`;
      }).join('')}
    </div>
    ${renderTradePanel(s, pf)}
  `;
}

function renderCryptoTab(s, pf) {
  return `
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${Object.entries(s.cryptos||{}).map(([sym, crypto]) => {
        const price  = s.prices[sym] || crypto.base;
        const held   = pf.crypto?.[sym] || 0;
        const change = pct(price, crypto.base);
        const col    = pctColor(price, crypto.base);
        return `
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,140,0,0.15);
            border-radius:12px;padding:12px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="font-size:1.4rem;">🪙</div>
              <div style="flex:1;">
                <div style="display:flex;align-items:baseline;gap:6px;">
                  <span style="font-weight:bold;font-size:0.9rem;">${sym}</span>
                  <span style="opacity:0.4;font-size:0.72rem;">${crypto.name}</span>
                </div>
                <div style="opacity:0.4;font-size:0.7rem;">${crypto.desc}</div>
              </div>
              <div style="text-align:center;min-width:60px;">
                ${sparkline(s.history?.[sym], 60, 28)}
              </div>
              <div style="text-align:right;">
                <div style="font-weight:bold;">${fmt(price)} SB</div>
                <div style="font-size:0.75rem;color:${col};">${change >= 0 ? '+' : ''}${change}%</div>
                ${held > 0 ? `<div style="font-size:0.7rem;opacity:0.5;">${held} held</div>` : ''}
              </div>
            </div>
            <div style="display:flex;gap:6px;margin-top:8px;">
              <button onclick="window.marketTrade('crypto','${sym}','buy')"
                style="flex:1;background:rgba(255,140,0,0.15);color:#FFB84D;
                border:1px solid rgba(255,140,0,0.3);border-radius:8px;
                padding:6px;cursor:pointer;font-size:12px;font-weight:bold;">
                Buy
              </button>
              <button onclick="window.marketTrade('crypto','${sym}','sell')"
                ${held===0?'disabled style="opacity:0.3;cursor:not-allowed;"':''}
                style="flex:1;background:rgba(255,50,50,0.15);color:#FF6666;
                border:1px solid rgba(255,50,50,0.3);border-radius:8px;
                padding:6px;cursor:pointer;font-size:12px;font-weight:bold;">
                Sell ${held > 0 ? `(${held})` : ''}
              </button>
            </div>
          </div>`;
      }).join('')}
    </div>
    ${renderTradePanel(s, pf)}
  `;
}

function renderPortfolioTab(s, pf) {
  const rows = [];
  let totalInvested = 0;
  let totalCurrent  = 0;

  // Liquid SB
  const liquid = s.chips || 0;
  rows.push({ label:'💰 Liquid SB', category:'cash', current:liquid, invested:liquid, pctChange:0 });
  totalInvested += liquid;
  totalCurrent  += liquid;

  // Savings
  const savings = (pf.savings||0) + (s.interest||0);
  if (savings > 0) {
    rows.push({ label:'🏦 Savings', category:'bank', current:savings, invested:pf.savings||0, pctChange: pf.savings>0?((savings-pf.savings)/pf.savings*100):0 });
    totalInvested += pf.savings||0;
    totalCurrent  += savings;
  }

  // Stocks
  Object.entries(pf.stocks||{}).forEach(([sym, shares]) => {
    if (!shares) return;
    const price   = s.prices[sym] || 0;
    const base    = s.stocks?.[sym]?.base || price;
    const current = price * shares;
    const invested= base  * shares;
    const chg     = invested > 0 ? ((current-invested)/invested*100) : 0;
    rows.push({ label:`📈 ${sym} ×${shares}`, category:'stock', sym, current, invested, pctChange:chg });
    totalInvested += invested;
    totalCurrent  += current;
  });

  // Crypto (personal)
  Object.entries(pf.crypto||{}).forEach(([sym, units]) => {
    if (!units) return;
    const price   = s.prices[sym] || 0;
    const base    = s.cryptos?.[sym]?.base || price;
    const current = price * units;
    const invested= base  * units;
    const chg     = invested > 0 ? ((current-invested)/invested*100) : 0;
    rows.push({ label:`🪙 ${sym} ×${units}`, category:'crypto', sym, current, invested, pctChange:chg });
    totalInvested += invested;
    totalCurrent  += current;
  });

  // Finance bot pools
  const myRobots = window._myRobots || [];
  myRobots.filter(r => r.task === 'finance' && (r.financePool > 0 || Object.keys(r.positions||{}).length > 0)).forEach(r => {
    const pool = r.financePool || 0;
    let posValue = 0;
    const posLines = [];
    let totalInvestedInPos = 0;
    if (r.positions) {
      Object.entries(r.positions).forEach(([sym, data]) => {
        const price = s.prices[sym] || 0;
        const units = typeof data === 'object' ? (data.units||0) : (data/(price||1));
        const val   = Math.floor(price * units);
        const bp    = typeof data === 'object' ? data.buyPrice : price;
        const invested = typeof data === 'object' ? (data.invested||0) : val;
        const chg   = bp > 0 ? ((price-bp)/bp*100).toFixed(1) : '0.0';
        posValue += val;
        totalInvestedInPos += invested;
        posLines.push(`${sym}: ${val} SB (${chg >= 0 ? '+':''}${chg}%)`);
      });
    }
    const total        = pool + posValue;
    const origInvested = r._originalPool || total; // track original investment
    if (!r._originalPool) r._originalPool = total;
    const pctChange    = origInvested > 0 ? ((total - origInvested) / origInvested * 100) : 0;
    const strat   = r.financeStrategy || 'medium';
    const stratLabel = strat==='high'?'🎲 High':strat==='low'?'🐢 Low':'📊 Medium';
    const sub = [
      pool > 0 ? `Cash: ${pool} SB` : null,
      posLines.length > 0 ? `Positions: ${posLines.join(' · ')}` : null,
      `Strategy: ${stratLabel}`,
    ].filter(Boolean).join(' | ');
    rows.push({ label:`💼 ${r.name}`, category:'bot', current:total, invested:origInvested, pctChange, sub });
    totalInvested += origInvested;
    totalCurrent  += total;
  });

  const netChange    = totalInvested > 0 ? ((totalCurrent-totalInvested)/totalInvested*100) : 0;
  const netColor     = netChange >= 0 ? '#44FF88' : '#FF4444';
  const netSign      = netChange >= 0 ? '+' : '';

  return `
    <div style="display:flex;flex-direction:column;gap:6px;">

      <!-- Net worth summary bar -->
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);
        border-radius:12px;padding:14px;margin-bottom:4px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:0.75rem;opacity:0.5;">Total Net Worth</div>
            <div style="font-size:1.5rem;font-weight:bold;">${Math.floor(totalCurrent).toLocaleString()} SB</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:1.1rem;font-weight:bold;color:${netColor};">
              ${netSign}${netChange.toFixed(1)}%
            </div>
            <div style="font-size:0.75rem;color:${netColor};opacity:0.7;">
              ${netSign}${Math.floor(totalCurrent-totalInvested).toLocaleString()} SB
            </div>
          </div>
        </div>
        <!-- Bar breakdown -->
        <div style="display:flex;height:6px;border-radius:4px;overflow:hidden;margin-top:10px;gap:1px;">
          ${rows.filter(r=>r.current>0).map(r => {
            const w = (r.current/totalCurrent*100).toFixed(1);
            const col = r.category==='cash'?'#888888':r.category==='bank'?'#4488FF':r.category==='stock'?'#44FF88':r.category==='crypto'?'#FFB84D':'#FFD700';
            return `<div style="flex:${w};background:${col};min-width:2px;"></div>`;
          }).join('')}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">
          ${[['#888888','Cash'],['#4488FF','Bank'],['#44FF88','Stocks'],['#FFB84D','Crypto'],['#FFD700','Bots']].map(([col,lbl])=>`
            <span style="font-size:0.65rem;opacity:0.5;">
              <span style="color:${col};">■</span> ${lbl}
            </span>`).join('')}
        </div>
      </div>

      <!-- Holdings rows -->
      ${rows.filter(r => r.category !== 'cash' || rows.length === 1).map(r => {
        const col = r.pctChange > 0 ? '#44FF88' : r.pctChange < 0 ? '#FF4444' : 'rgba(255,255,255,0.4)';
        const sign = r.pctChange >= 0 ? '+' : '';
        return `
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);
            border-radius:10px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:0.85rem;font-weight:bold;">${r.label}</div>
              ${r.sub ? `<div style="font-size:0.7rem;opacity:0.4;">${r.sub}</div>` : ''}
            </div>
            <div style="text-align:right;">
              <div style="font-weight:bold;">${Math.floor(r.current).toLocaleString()} SB</div>
              ${Math.abs(r.pctChange) >= 0.01 ? `<div style="font-size:0.75rem;color:${r.pctChange >= 0 ? '#44FF88' : '#FF4444'};">${r.pctChange >= 0 ? '+' : ''}${r.pctChange.toFixed(1)}%</div>` : ''}
            </div>
          </div>`;
      }).join('')}

      ${rows.length <= 1 ? `
        <div style="text-align:center;opacity:0.4;padding:20px;font-size:0.85rem;">
          Nothing invested yet. Buy some stocks or crypto to get started.
        </div>` : ''}
    </div>
  `;
}

function renderBankTab(s, pf) {
  const savings  = pf.savings || 0;
  const interest = s.interest || 0;
  return `
    <div style="background:rgba(0,50,100,0.15);border:1px solid rgba(0,150,255,0.2);
      border-radius:14px;padding:16px;margin-bottom:12px;">
      <div style="font-size:1rem;font-weight:bold;color:#88CCFF;margin-bottom:10px;">
        🏦 Savings Account — 3% / hour
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
        <div>
          <div style="font-size:1.4rem;font-weight:bold;">${savings.toLocaleString()} SB</div>
          <div style="opacity:0.4;font-size:0.75rem;">Balance</div>
        </div>
        ${interest > 0 ? `
        <div style="text-align:right;">
          <div style="font-size:1.1rem;color:#44FF88;font-weight:bold;">+${interest} SB</div>
          <div style="opacity:0.4;font-size:0.75rem;">Accrued interest</div>
        </div>` : ''}
      </div>
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <input id="bankAmount" type="number" min="1" placeholder="Amount..."
          style="flex:1;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);
          color:white;padding:9px;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box;">
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="window.bankDeposit()"
          style="flex:1;background:rgba(0,150,255,0.2);color:#88CCFF;
          border:1px solid rgba(0,150,255,0.4);border-radius:8px;
          padding:8px;cursor:pointer;font-size:13px;font-weight:bold;">
          Deposit
        </button>
        <button onclick="window.bankWithdraw()"
          ${savings===0?'disabled style="opacity:0.3;cursor:not-allowed;"':''}
          style="flex:1;background:rgba(0,200,100,0.15);color:#44FF88;
          border:1px solid rgba(0,200,100,0.3);border-radius:8px;
          padding:8px;cursor:pointer;font-size:13px;font-weight:bold;">
          Withdraw
        </button>
      </div>
    </div>
  `;
}

function renderTradePanel(s, pf) {
  if (!tradeMode) return '';
  const { type, sym, action } = tradeMode;
  const price = s.prices[sym] || 0;
  const held  = type === 'stock' ? (pf.stocks?.[sym]||0) : (pf.crypto?.[sym]||0);
  return `
    <div style="background:rgba(0,0,0,0.4);border:1px solid rgba(255,215,0,0.3);
      border-radius:12px;padding:14px;margin-top:10px;">
      <div style="font-weight:bold;margin-bottom:8px;color:#FFD700;">
        ${action === 'buy' ? '💸 Buy' : '💰 Sell'} ${sym} @ ${fmt(price)} SB
      </div>
      <div style="display:flex;gap:8px;">
        <input id="tradeQty" type="number" min="1" ${action==='sell'?`max="${held}"`:''}
          placeholder="Quantity" value="1"
          style="flex:1;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);
          color:white;padding:9px;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box;">
        <button onclick="window.executeTrade()"
          style="background:${action==='buy'?'#006633':'#660022'};color:white;border:none;
          border-radius:8px;padding:9px 18px;cursor:pointer;font-size:13px;font-weight:bold;">
          ${action === 'buy' ? 'Buy' : 'Sell'}
        </button>
        <button onclick="window.cancelTrade()"
          style="background:rgba(255,255,255,0.08);color:white;border:1px solid rgba(255,255,255,0.15);
          border-radius:8px;padding:9px 14px;cursor:pointer;font-size:12px;">
          X
        </button>
      </div>
      <div style="opacity:0.4;font-size:0.72rem;margin-top:5px;">
        ${action==='buy' ? `Cost: ${fmt(price)} × qty | Balance: ${(s.chips||0).toLocaleString()} SB` :
                           `Held: ${held} | Revenue: ${fmt(price)} × qty`}
      </div>
    </div>
  `;
}

// ── WINDOW ACTIONS ─────────────────────────────────────────────────────────────
window.marketTab = (tab) => { marketTab = tab; tradeMode = null; renderMarketUI(); };
window.closeMarket = () => { marketOverlay.style.display='none'; marketUIOpen=false; };
window.marketTrade = (type, sym, action) => { tradeMode = { type, sym, action }; renderMarketUI(); };
window.cancelTrade = () => { tradeMode = null; renderMarketUI(); };

window.executeTrade = () => {
  if (!tradeMode) return;
  const qty = Math.max(1, parseInt(document.getElementById('tradeQty')?.value)||1);
  const { type, sym, action } = tradeMode;
  if (type === 'stock') {
    SKT()?.emit(action==='buy' ? 'market:buyStock' : 'market:sellStock', { sym, shares: qty });
  } else {
    SKT()?.emit(action==='buy' ? 'market:buyCrypto' : 'market:sellCrypto', { sym, units: qty });
  }
  tradeMode = null;
};

window.bankDeposit = () => {
  const amt = parseInt(document.getElementById('bankAmount')?.value)||0;
  if (amt < 1) return;
  SKT()?.emit('market:deposit', { amount: amt });
};
window.bankWithdraw = () => {
  const amt = parseInt(document.getElementById('bankAmount')?.value)||0;
  if (amt < 1) {
    // Withdraw all
    SKT()?.emit('market:withdraw', { amount: marketState.portfolio?.savings || 0 });
    return;
  }
  SKT()?.emit('market:withdraw', { amount: amt });
};

// ── PROMPTS ───────────────────────────────────────────────────────────────────
function makePrompt(color, text) {
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed;bottom:110px;left:50%;transform:translateX(-50%);
    background:rgba(0,0,0,0.82);color:${color};padding:12px 28px;border-radius:12px;
    font-family:sans-serif;font-size:15px;border:1px solid ${color}55;
    backdrop-filter:blur(8px);display:none;z-index:100;cursor:pointer;user-select:none;
  `;
  el.textContent = text;
  document.body.appendChild(el);
  return el;
}

const atmPrompt      = makePrompt('#00FFCC', '🏦 Press E for ATM (Savings)');
const terminalPrompt = makePrompt('#FF8800', '📈 Press E for Trading Terminal');
const shadyPrompt    = makePrompt('#FFD700', '🕵️ Press E to talk to Whiskers');

// Shady guy sayings
const SHADY_SAYS = [
  '"I have information. Very good information. Very legal."',
  '"Buy ZRPT. Trust me. I know people."',
  '"The market is a casino. I am the house. Heh heh."',
  '"SHLP is about to pump. Definitely not my shares."',
  '"I accept no liability for financial advice. I give none. I am just a man."',
  '"You want alpha? I have alpha. Right here in this coat."',
  '"Diversify they said. Into what? More MOOP? That is what I said."',
];

// ── SOCKET EVENTS ─────────────────────────────────────────────────────────────
function setupSocketEvents() {
  const skt = SKT(); if (!skt) return;

  skt.on('market:state', data => {
    marketState = { ...marketState, ...data };
    // Chips from server market state might be stale -- prefer live chips:update value
    if (marketUIOpen) renderMarketUI();
  });

  // Always keep chips in sync
  skt.on('chips:update', data => {
    marketState.chips = data.chips;
    if (marketUIOpen) renderMarketUI();
  });

  skt.on('market:prices', data => {
    marketState.prices = data.prices;
    if (marketUIOpen) renderMarketUI();
  });

  skt.on('market:history', data => {
    marketState.history = data.history;
    if (marketUIOpen) renderMarketUI();
  });

  skt.on('market:portfolioUpdate', data => {
    if (data.portfolio) marketState.portfolio = data.portfolio;
    if (data.chips !== undefined) marketState.chips = data.chips;
    if (marketUIOpen) renderMarketUI();
  });

  skt.on('chips:update', data => {
    marketState.chips = data.chips;
  });

  skt.emit('market:getState');
  console.log('[Market Client] Socket events bound');
}

// ── BLOCKED ────────────────────────────────────────────────────────────────────
const _prevBlocked = window._mineIsBlocked;
window._mineIsBlocked = () => (_prevBlocked?.() || false) || marketUIOpen;

// ── E KEY ─────────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.code === 'Escape' && marketUIOpen) { window.closeMarket(); return; }
  if (e.code !== 'KeyE') return;
  if (window._mineIsBlocked()) return;

  if (nearATM) {
    marketUIOpen = true; marketTab = 'bank'; tradeMode = null;
    if (document.pointerLockElement) document.exitPointerLock();
    marketOverlay.style.display = 'flex';
    SKT()?.emit('market:getState');
    renderMarketUI();
    return;
  }
  if (nearTerminal) {
    marketUIOpen = true; marketTab = 'stocks'; tradeMode = null;
    if (document.pointerLockElement) document.exitPointerLock();
    marketOverlay.style.display = 'flex';
    SKT()?.emit('market:getState');
    renderMarketUI();
    return;
  }
  if (nearShadyGuy) {
    const saying = SHADY_SAYS[Math.floor(Math.random()*SHADY_SAYS.length)];
    NOTIFY(`Whiskers: ${saying}`);
    return;
  }
});

// ── TICK ──────────────────────────────────────────────────────────────────────
let _totalTime = 0;
function tick(delta) {
  _totalTime += delta;
  const cam = CAM(); if (!cam) return;
  const ud = S()?.userData;

  // ATM proximity
  if (ud?.atmPos) {
    const dx = cam.position.x - ud.atmPos.x;
    const dz = cam.position.z - ud.atmPos.z;
    nearATM = Math.sqrt(dx*dx+dz*dz) < 3.5;
  }
  // Terminal proximity
  if (ud?.terminalPos) {
    const dx = cam.position.x - ud.terminalPos.x;
    const dz = cam.position.z - ud.terminalPos.z;
    nearTerminal = Math.sqrt(dx*dx+dz*dz) < 3.5;
  }
  // Shady guy proximity
  if (ud?.shadyGuyPos) {
    const dx = cam.position.x - ud.shadyGuyPos.x;
    const dz = cam.position.z - ud.shadyGuyPos.z;
    nearShadyGuy = Math.sqrt(dx*dx+dz*dz) < 3.5;
  }

  atmPrompt.style.display      = (!marketUIOpen && nearATM      && !nearTerminal) ? 'block' : 'none';
  terminalPrompt.style.display = (!marketUIOpen && nearTerminal && !nearATM)      ? 'block' : 'none';
  shadyPrompt.style.display    = (!marketUIOpen && nearShadyGuy && !nearATM && !nearTerminal) ? 'block' : 'none';

  // Animate terminal ticker lines
  S()?.children.forEach(c => {
    if (c.userData?.tickerLine) {
      c.material.opacity = 0.3 + Math.sin(_totalTime * 3 + c.userData.tickerIdx) * 0.4;
    }
  });
}

// ── INIT ──────────────────────────────────────────────────────────────────────
function init() {
  buildBank();

  // Add to Places menu
  if (window._placesMenu) {
    window._placesMenu.push({ name:'🏦 Bank', x: BANK_X, z: BANK_Z - 4 });
  }

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

  console.log('[Market Client] Initialized');
}

(function waitForBridge() {
  if (window._mineScene && window._mineCamera) init();
  else setTimeout(waitForBridge, 100);
})();
