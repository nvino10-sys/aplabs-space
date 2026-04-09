// planet-client.js -- Planet God Game UI
// Opens as full-screen overlay from sanctum armillary
// No zone transition -- stays in sanctum zone

(function() {

var planetState = null;
var TIER_NAMES_CLIENT=['Asteroid','Smooth Ball','Infant Planet','Young Planet','Developing World','Established World','Advanced Civilization','Galactic Power','MAX RANK'];
var planetCanvas = null;
var planetCtx = null;
var planetAnimId = null;
var planetActive = false;
var _t = 0;

function PC_SKT() { return window._mineGetSocket && window._mineGetSocket(); }
function PC_NOTIFY(msg) { window._mineShowNotification?.(msg); }
function showPlanetEvent(msg, col) {
  PC_NOTIFY(msg);
  var el=document.createElement('div');
  el.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);'
    +'background:rgba(10,0,25,0.97);border:3px solid '+(col||'#AA44FF')+';border-radius:16px;'
    +'padding:24px 40px;font-family:Courier New,monospace;font-size:18px;font-weight:bold;'
    +'color:'+(col||'#EE99FF')+';text-align:center;z-index:999;letter-spacing:0.1em;'
    +'box-shadow:0 0 40px '+(col||'#AA44FF')+'66;pointer-events:none;';
  el.textContent=msg;
  document.body.appendChild(el);
  setTimeout(function(){el.style.transition='opacity 0.8s';el.style.opacity='0';setTimeout(function(){el.remove();},800);},2200);
}

// ── WIRE SOCKET EVENTS ────────────────────────────────────────────────────────
(function wireSocket() {
  var skt = PC_SKT();
  if (!skt) { setTimeout(wireSocket, 400); return; }

  skt.on('planet:poured',  function(d) { PC_NOTIFY('💧 Poured! Reservoir: '+Math.floor(d.reservoirWoL||0).toLocaleString()+' WoL'); });
  skt.on('planet:state',   function(d) {
    var prevCount=(planetState&&planetState.buildings)?planetState.buildings.length:0;
    planetState=d;
    if(d.darkMatter!==undefined){window._scDarkMatter=d.darkMatter; if(typeof scUpdateDMHUD==='function')scUpdateDMHUD();}
    if(planetActive) renderPlanetUI();
    // Pan to new building
    if(d.buildings&&d.buildings.length>prevCount){
      var nb=d.buildings[d.buildings.length-1];
      if(nb) panToBuilding(nb.lon||0, nb.lat||0.5);
    }
  });
  skt.on('planet:created', function(d) { planetState=d; window._planetDestroyedMsg=null; PC_NOTIFY('✦ Planet created in zone '+d.zone+'!'); if(planetActive) renderPlanetUI(); });
  skt.on('planet:tierUp',  function(d) { showPlanetEvent('✦ EVOLVED TO '+d.tierName.toUpperCase()+'!', '#AA44FF'); });
  skt.on('planet:error',   function(d) { PC_NOTIFY('Planet: '+d); });
  skt.on('planet:upgradeOK', function(d) { PC_NOTIFY('✦ '+d.msg); });
  skt.on('planet:dmBalance', function(d) { if(planetState) planetState.darkMatter=d.darkMatter; if(planetActive) updatePlanetHUD(); });
  skt.on('planet:none',    function() { planetState=null; if(planetActive) renderPlanetUI(); });
  skt.on('planet:destroyed', function(d) {
    window._planetDestroyedMsg = d;
    planetState = null;
    if (planetActive) renderPlanetUI();
  });
  skt.on('planet:dailyPay', function(d){ showPlanetEvent('DAILY INCOME: +'+d.amount.toLocaleString()+' DM','#FFCC44'); });
})();

// ── OPEN/CLOSE ────────────────────────────────────────────────────────────────
window.openPlanetClient = function() {
  if (planetActive) return;
  planetActive = true;
  buildPlanetUI();
  PC_SKT()?.emit('planet:get');
};

function closePlanetClient() {
  planetActive = false;
  if (planetAnimId) { cancelAnimationFrame(planetAnimId); planetAnimId=null; }
  var ov = document.getElementById('planetOverlay');
  if (ov) ov.remove();
}

// ── BUILD UI ──────────────────────────────────────────────────────────────────
function buildPlanetUI() {
  document.getElementById('planetOverlay')?.remove();

  var ov = document.createElement('div');
  ov.id = 'planetOverlay';
  ov.style.cssText = 'position:fixed;inset:0;background:#000208;z-index:950;'
    +'display:flex;flex-direction:column;font-family:Courier New,monospace;color:#CC88FF;overflow:hidden;';

  var _isMob=window.innerWidth<=900;
  ov.innerHTML =
    // Header
    '<div id="plHeader" style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-bottom:1px solid rgba(150,50,255,0.25);flex-shrink:0;">'
      +'<div style="font-size:13px;font-weight:bold;color:#EE99FF;letter-spacing:0.08em;">✦ COSMIC ARMILLARY</div>'
      +'<div id="plTierLabel" style="font-size:10px;color:#AA77DD;"></div>'
      +'<div id="plCloseBtn" style="padding:5px 12px;border:1px solid rgba(150,50,255,0.4);border-radius:8px;cursor:pointer;font-size:11px;color:#774499;">✕</div>'
    +'</div>'
    +(_isMob ?
      // MOBILE: globe top, panels below as tabs
      '<div style="flex:1;overflow-y:auto;display:flex;flex-direction:column;">'
        +'<div style="display:flex;align-items:center;justify-content:center;padding:8px 0;flex-shrink:0;">'
          +'<canvas id="plGlobe" style="display:block;"></canvas>'
        +'</div>'
        +'<div id="plGlobeLabel" style="font-size:10px;color:#886699;text-align:center;margin-bottom:4px;"></div>'
        +'<div style="display:flex;border-bottom:1px solid rgba(100,30,200,0.2);">'
          +'<div id="plTabStats" style="flex:1;padding:8px;text-align:center;font-size:11px;color:#CC88FF;cursor:pointer;border-bottom:2px solid #AA44FF;">STATS</div>'
          +'<div id="plTabAction" style="flex:1;padding:8px;text-align:center;font-size:11px;color:#664488;cursor:pointer;">ACTIONS</div>'
        +'</div>'
        +'<div id="plMobContent" style="flex:1;overflow-y:auto;padding:12px 14px;">'
          +'<div id="plResourcePanel"></div>'
        +'</div>'
      +'</div>'
    :
      // DESKTOP: three column
      '<div style="display:flex;flex:1;overflow:hidden;min-height:0;">'
        +'<div id="plLeft" style="width:220px;flex-shrink:0;padding:16px 14px;border-right:1px solid rgba(100,30,200,0.2);display:flex;flex-direction:column;gap:14px;overflow-y:auto;">'
          +'<div id="plResourcePanel"></div>'
        +'</div>'
        +'<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;">'
          +'<canvas id="plGlobe" style="display:block;"></canvas>'
          +'<div id="plGlobeLabel" style="font-size:10px;color:#886699;margin-top:8px;text-align:center;"></div>'
        +'</div>'
        +'<div id="plRight" style="width:220px;flex-shrink:0;padding:16px 14px;border-left:1px solid rgba(100,30,200,0.2);display:flex;flex-direction:column;gap:12px;overflow-y:auto;">'
          +'<div id="plActionPanel"></div>'
        +'</div>'
      +'</div>'
    );

  document.body.appendChild(ov);

  // Close button
  document.getElementById('plCloseBtn').addEventListener('click', closePlanetClient);
  document.getElementById('plCloseBtn').addEventListener('touchend',function(e){e.preventDefault();closePlanetClient();},{passive:false});
  // Mobile tabs
  if(window.innerWidth<=900){
    var _tabStats=document.getElementById('plTabStats');
    var _tabAction=document.getElementById('plTabAction');
    var _mobContent=document.getElementById('plMobContent');
    if(_tabStats&&_tabAction&&_mobContent){
      _tabStats.addEventListener('click',function(){
        _tabStats.style.color='#CC88FF';_tabStats.style.borderBottom='2px solid #AA44FF';
        _tabAction.style.color='#664488';_tabAction.style.borderBottom='none';
        _mobContent.innerHTML='<div id="plResourcePanel"></div>';
        updatePlanetHUD();
      });
      _tabAction.addEventListener('click',function(){
        _tabAction.style.color='#CC88FF';_tabAction.style.borderBottom='2px solid #AA44FF';
        _tabStats.style.color='#664488';_tabStats.style.borderBottom='none';
        _mobContent.innerHTML='<div id="plActionPanel"></div>';
        updateActionPanel();
      });
    }
  }
  document.getElementById('plCloseBtn').addEventListener('touchend', function(e){ e.preventDefault(); closePlanetClient(); }, {passive:false});

  // Init globe canvas
  planetCanvas = document.getElementById('plGlobe');
  var globeSize = Math.min(window.innerWidth - 480, window.innerHeight - 160, 340);
  globeSize = Math.max(180, globeSize);
  planetCanvas.width = globeSize;
  planetCanvas.height = globeSize;
  planetCtx = planetCanvas.getContext('2d');

  renderPlanetUI();
  startGlobeLoop();
  wireGlobeTouchControls();
}

function renderPlanetUI() {
  if (!planetActive) return;
  updatePlanetHUD();
  updateActionPanel();
  updateRequestsPanel();
}

function updatePlanetHUD() {
  var lp = document.getElementById('plResourcePanel');
  var tl = document.getElementById('plTierLabel');
  var gl = document.getElementById('plGlobeLabel');
  if (!lp) return;

  if (!planetState) {
    tl.textContent = window._planetDestroyedMsg ? 'Planet Destroyed' : 'No planet yet';
    gl.textContent = '';
    if (window._planetDestroyedMsg) {
      var _dm = window._planetDestroyedMsg;
      var _ago = _dm.at ? Math.round((Date.now()-_dm.at)/60000)+' min ago' : 'recently';
      lp.innerHTML = '<div style="color:#FF4444;font-size:13px;font-weight:bold;margin-bottom:10px;">PLANET DESTROYED</div>'
        +'<div style="color:#CC8888;font-size:11px;line-height:2;">'
        +'We are deeply sorry for your loss.<br>'
        +'<span style="color:#FF6666;">'+(_dm.name||'Your planet')+'</span> was taken down by '
        +'<span style="color:#FF4444;">'+(_dm.by||'an unknown attacker')+'</span> '+_ago+'.<br>'
        +(_dm.wolLooted>0 ? '<span style="color:#00CCFF;">'+Math.round(_dm.wolLooted).toLocaleString()+' WoL</span> was looted from your reservoir.<br>' : '')
        +'<br><span style="color:#AA88CC;">That is quite tragic. But the cosmos is unforgiving.</span>'
        +'</div>'
        +'<div style="margin-top:16px;color:#775599;font-size:11px;">Ready to rebuild? Cost: <span style="color:#CC88FF;">10,000,000 DM</span></div>';
    } else {
      lp.innerHTML = '<div style="color:#664488;font-size:11px;line-height:1.8;">No planet created yet.<br>Cost: <span style="color:#CC88FF;">10,000,000 DM</span> from sanctum account.</div>';
    }
    return;
  }

  var p = planetState;
  var resFilePct = p.reservoirCap > 0 ? Math.round((p.reservoirWoL/p.reservoirCap)*100) : 0;
  var resColor = resFilePct > 66 ? '#00FFCC' : resFilePct > 33 ? '#FFAA00' : '#FF4444';

  tl.textContent = (p.tierName||'Asteroid') + (p.zone ? ' — Zone '+p.zone : '');
  gl.textContent = (p.name||'Unknown') + ' | Pours: '+(p.pourCount||0);

  lp.innerHTML =
    // DM balance
    '<div style="margin-bottom:12px;">'
      +'<div style="font-size:9px;color:#775599;margin-bottom:3px;letter-spacing:0.08em;">SANCTUM DARK MATTER</div>'
      +'<div style="font-size:14px;color:#CC88FF;font-weight:bold;">◈ '+(p.darkMatter||0).toLocaleString()+'</div>'
    +'</div>'
    // WoL wallet
    +'<div style="margin-bottom:12px;">'
      +'<div style="font-size:9px;color:#775599;margin-bottom:3px;letter-spacing:0.08em;">WATER OF LIFE WALLET</div>'
      +'<div style="font-size:14px;color:#00CCFF;font-weight:bold;">💧 '+Math.floor(p.wolWallet||0).toLocaleString()+'</div>'
    +'</div>'
    // Pre-planet: show pour progress
    +(p.tier < 2 ?
      '<div style="margin-bottom:12px;">'
      +'<div style="font-size:9px;color:#775599;margin-bottom:4px;letter-spacing:0.08em;">POUR PROGRESS</div>'
      +'<div style="background:rgba(0,10,30,0.8);border:1px solid rgba(0,150,200,0.3);border-radius:6px;height:12px;overflow:hidden;">'
        +'<div style="height:100%;width:'+(((p.poursSinceTier||0)/(p.poursNeeded||1))*100)+'%;background:#0088FF;transition:width 0.5s;"></div>'
      +'</div>'
      +'<div style="font-size:9px;color:#0088FF;margin-top:3px;">'+(p.poursSinceTier||0)+' / '+(p.poursNeeded||1)+' pours · Reservoir: '+Math.floor((p.reservoirWoL||0)).toLocaleString()+' WoL</div>'
      +'</div>'
    :
      '<div style="margin-bottom:12px;">'
      +'<div style="font-size:9px;color:#775599;margin-bottom:4px;letter-spacing:0.08em;">RESERVOIR</div>'
      +'<div style="background:rgba(0,10,30,0.8);border:1px solid rgba(0,150,200,0.3);border-radius:6px;height:12px;overflow:hidden;">'
        +'<div style="height:100%;width:'+resFilePct+'%;background:'+resColor+';transition:width 0.5s;"></div>'
      +'</div>'
      +'<div style="font-size:9px;color:'+resColor+';margin-top:3px;">'+Math.floor(p.reservoirWoL||0).toLocaleString()+' / '+(p.reservoirCap||100000).toLocaleString()+' WoL ('+resFilePct+'%)</div>'
      +'Keep your reservoir full — your population drinks it. Empty = people die.</div>'
    )
    // Population growth estimate
    +(p.tier>=2 ? '<div style="margin-bottom:8px;"><div style="font-size:9px;color:#775599;margin-bottom:3px;">HAPPINESS</div><div style="background:rgba(0,10,30,0.8);border:1px solid rgba(200,150,0,0.3);border-radius:6px;height:8px;overflow:hidden;"><div style="height:100%;width:'+(p.happiness||0)+'%;background:'+(p.happiness>60?'#44FF88':p.happiness>30?'#FFAA00':'#FF4444')+';transition:width 0.5s;"></div></div><div style="font-size:8px;color:#886644;margin-top:2px;">'+(p.happiness||0)+'%'+(p.blessed?' BLESSED':'')+' ('+(p.requestsCompletedToday||0)+'/5 requests today)</div></div>' : '')
    +(p.tier >= 2 && p.population < p.populationCap ?
      (function(){
        var fillPct2 = p.reservoirCap > 0 ? (p.reservoirWoL||0)/p.reservoirCap : 0;
        var _floors=[0,0,10,50,200,500,1500,5000,10000];
        var _floor=_floors[p.tier]||10;
        var growthPerTick = fillPct2 >= 0.9 ? Math.max(_floor, Math.floor(p.population*0.05)) : 0;
        return '<div style="margin-bottom:8px;font-size:9px;color:#556633;">⏱ Next tick: +'
          +growthPerTick+' people '+(fillPct2>=0.9?'':'(need 90%+ reservoir)')+'</div>';
      })()
    : '')
    // Population
    +(p.tier >= 2 ?
    '<div style="margin-bottom:12px;">'
      +'<div style="font-size:9px;color:#775599;margin-bottom:3px;letter-spacing:0.08em;">POPULATION</div>'
      +'<div style="font-size:13px;color:#FFCC88;">👥 '+p.population.toLocaleString()+' / '+p.populationCap.toLocaleString()+'</div>'
    +'</div>' : '')
    // Upgrades owned
    +(p.tier>=2 ? '<div style="font-size:9px;color:#554477;margin-top:4px;">Capacity upgrades: '+(p.capUpgrades||0)+'<br>Efficiency upgrades: '+(p.efficiencyUpgrades||0)+'</div>' : '');
}

function updateActionPanel() {
  var rp = document.getElementById('plActionPanel');
  if (!rp) return;

  if (!planetState) {
    rp.innerHTML =
      '<div style="font-size:10px;color:#775599;line-height:1.7;margin-bottom:16px;">Claim a dimensional zone and begin shaping your world.</div>'
      +'<div id="plCreateBtn" style="'+btnStyle('#AA44FF')+'">✦ CREATE PLANET<br><span style="font-size:9px;opacity:0.7;">Cost: 10M DM</span></div>';
    document.getElementById('plCreateBtn').addEventListener('click', function(){ PC_SKT()?.emit('planet:create'); });
    document.getElementById('plCreateBtn').addEventListener('touchend', function(e){ e.preventDefault(); PC_SKT()?.emit('planet:create'); }, {passive:false});
    return;
  }

  var p = planetState;
  var wolNeeded = p.wolNeededForPour || 50000;
  var canPour = (p.wolWallet||0) >= wolNeeded && (p.darkMatter||0) >= 500000;
  var reservoirFull = p.reservoirWoL >= p.reservoirCap;
  var poursReady = (p.poursSinceTier||0) >= (p.poursNeeded||1);
  var needsFullRes = p.tier >= 2; // reservoir only required from tier 2+
  var canEvolve = (!needsFullRes || reservoirFull) && (p.darkMatter||0) >= 500000 && poursReady && p.tier < 8;

  rp.innerHTML =
    // Pour button
    '<div style="margin-bottom:16px;">'
      +'<div style="font-size:9px;color:#775599;margin-bottom:6px;letter-spacing:0.08em;">POUR WATER OF LIFE</div>'
      +'<div style="font-size:9px;color:#446666;margin-bottom:8px;">Needs: '+wolNeeded.toLocaleString()+' WoL + 500K DM</div>'
      +'<div id="plPourBtn" style="'+btnStyle(canPour?'#00CCFF':'#333355')+'opacity:'+(canPour?1:0.5)+';'+(canPour?'':'cursor:not-allowed;')+'">💧 POUR<br><span style="font-size:9px;opacity:0.7;">'+(canPour?'500K DM + '+wolNeeded.toLocaleString()+' WoL':'Not enough resources')+'</span></div>'
    +'</div>'
    // Evolve button
    +(p.tier < 8 ?
    '<div style="margin-bottom:16px;">'
      +'<div style="font-size:9px;color:#775599;margin-bottom:6px;letter-spacing:0.08em;">EVOLVE PLANET</div>'
      +'<div style="font-size:9px;color:#446644;margin-bottom:8px;">Needs: '+(p.tier>=2?'Full reservoir + ':'')+'500K DM + '+(p.poursNeeded||2)+' pours</div>'
      +'<div id="plEvolveBtn" style="'+btnStyle(canEvolve?'#AA44FF':'#332244')+'opacity:'+(canEvolve?1:0.5)+';'+(canEvolve?'':'cursor:not-allowed;')+'">✦ EVOLVE — Tier '+p.tier+' → '+(p.tier+1)+'<br><span style="font-size:9px;opacity:0.7;">'+(poursReady?'READY · ':'Need '+(p.poursNeeded||1)+' pours · ')+(TIER_NAMES_CLIENT[(p.tier+1)]||'')+'</span></div>'
    +'</div>' : '<div style="color:#FFDD44;font-size:11px;text-align:center;">★ MAX RANK ★</div>')
    // Upgrades
    +'<div style="border-top:1px solid rgba(100,30,200,0.2);padding-top:12px;margin-top:4px;">'
      +'<div style="font-size:9px;color:#775599;margin-bottom:8px;letter-spacing:0.08em;">UPGRADES (1M DM each)</div>'
      +'<div id="plCapBtn" style="'+btnStyle('#336655')+'margin-bottom:8px;">⬡ +10% Reservoir Cap</div>'
      +'<div id="plEffBtn" style="'+btnStyle('#334455')+'">⏱ +1 Day Efficiency</div>'
    +'</div>'
  ;

  if (canPour) {
    document.getElementById('plPourBtn').addEventListener('click', function(){ triggerRainCloud(); PC_SKT()?.emit('planet:pour'); });
    document.getElementById('plPourBtn').addEventListener('touchend', function(e){ e.preventDefault(); PC_SKT()?.emit('planet:pour'); }, {passive:false});
  }
  if (canEvolve) {
    document.getElementById('plEvolveBtn').addEventListener('click', function(){ PC_SKT()?.emit('planet:evolve'); });
    document.getElementById('plEvolveBtn').addEventListener('touchend', function(e){ e.preventDefault(); PC_SKT()?.emit('planet:evolve'); }, {passive:false});
  }
  document.getElementById('plCapBtn').addEventListener('click', function(){ PC_SKT()?.emit('planet:upgrade',{type:'capacity'}); });
  document.getElementById('plCapBtn').addEventListener('touchend', function(e){ e.preventDefault(); PC_SKT()?.emit('planet:upgrade',{type:'capacity'}); }, {passive:false});
  document.getElementById('plEffBtn').addEventListener('click', function(){ PC_SKT()?.emit('planet:upgrade',{type:'efficiency'}); });
  document.getElementById('plEffBtn').addEventListener('touchend', function(e){ e.preventDefault(); PC_SKT()?.emit('planet:upgrade',{type:'efficiency'}); }, {passive:false});

}

function hexToRgb(hex){
  return parseInt(hex.slice(1,3),16)+','+parseInt(hex.slice(3,5),16)+','+parseInt(hex.slice(5,7),16);
}
function formatDM(n){
  if(n>=1000000000)return (n/1000000000).toFixed(0)+'B';
  if(n>=1000000)return (n/1000000).toFixed(0)+'M';
  if(n>=1000)return (n/1000).toFixed(0)+'K';
  return String(n);
}

var BUILDING_DEFS_CLIENT={
  cottage:{label:'Cottage',dmForce:1000000},
  farm:{label:'Farm',dmForce:5000000},
  market:{label:'Market',dmForce:20000000},
  fort:{label:'Fort',dmForce:50000000},
  barracks:{label:'Barracks',dmForce:40000000},
  village:{label:'Village',dmForce:100000000},
  city:{label:'City',dmForce:100000000},
};

function updateRequestsPanel() {
  if (!planetActive||!planetState) return;
  var p=planetState;
  document.getElementById('plRequestsPanel')?.remove();
  var reqs=p.requests||[];
  var panel=document.createElement('div');
  panel.id='plRequestsPanel';
  panel.style.cssText='position:fixed;bottom:0;left:0;right:0;background:rgba(0,4,14,0.97);'
    +'border-top:2px solid rgba(150,50,255,0.4);padding:10px 16px;z-index:10;max-height:220px;overflow-y:auto;';
  var badge=reqs.length?'<span style="background:#AA44FF;color:#fff;border-radius:10px;padding:1px 7px;font-size:10px;margin-left:8px;">'+reqs.length+'</span>':'';
  var blessStr=p.blessed?'  <span style="color:#FFDD44;font-size:10px;">BLESSED</span>':'';
  var html='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
    +'<div style="font-size:10px;font-weight:bold;color:#CC88FF;letter-spacing:0.08em;">REQUESTS'+badge+blessStr+'</div>'
    +'<div style="font-size:9px;color:#664488;">'+(p.requestsCompletedToday||0)+'/5 today</div></div>';
  if (reqs.length) {
    reqs.forEach(function(r){
      html+='<div style="background:rgba(30,0,60,0.8);border:1px solid rgba(120,40,200,0.4);border-radius:8px;padding:8px 10px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">'
        +'<div><div style="font-size:10px;color:#EE99FF;font-weight:bold;">Build '+r.label+'</div>'
        +'<div style="font-size:9px;color:#664488;margin-top:2px;">'+r.wolCost.toLocaleString()+' WoL + '+r.dmEndorse.toLocaleString()+' DM</div></div>'
        +'<div style="display:flex;gap:6px;">'
        +'<div class="plEndBtn" data-id="'+r.id+'" style="padding:5px 10px;background:rgba(80,0,140,0.9);border:1px solid #AA44FF;border-radius:6px;color:#EE99FF;font-size:10px;cursor:pointer;">ENDORSE</div>'
        +'<div class="plDnyBtn" data-id="'+r.id+'" style="padding:5px 8px;background:rgba(40,0,20,0.9);border:1px solid #442222;border-radius:6px;color:#664444;font-size:10px;cursor:pointer;">DENY</div>'
        +'</div></div>';
    });
  } else {
    html+='<div style="font-size:9px;color:#442266;text-align:center;padding:6px;">Population will submit requests as they grow.</div>';
  }
  if (p.tier>=2) {
    html+='<div style="margin-top:8px;border-top:1px solid rgba(80,20,120,0.3);padding-top:8px;">'
      +'<div style="font-size:9px;color:#553377;margin-bottom:6px;">FORCE BUILD (DM)</div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:5px;">';
    Object.keys(BUILDING_DEFS_CLIENT).forEach(function(bt){
      var def=BUILDING_DEFS_CLIENT[bt];
      html+='<div class="plFrcBtn" data-type="'+bt+'" style="padding:4px 8px;background:rgba(20,0,40,0.8);border:1px solid rgba(80,30,120,0.5);border-radius:5px;color:#886699;font-size:9px;cursor:pointer;">'+def.label+' ('+formatDM(def.dmForce)+')</div>';
    });
    html+='</div></div>';
  }
  panel.innerHTML=html;
  var ov=document.getElementById('planetOverlay');
  if (ov){ ov.appendChild(panel); }
  panel.querySelectorAll('.plEndBtn').forEach(function(b){
    b.addEventListener('click',function(){PC_SKT()?.emit('planet:endorse',{reqId:parseInt(b.dataset.id)});});
    b.addEventListener('touchend',function(e){e.preventDefault();PC_SKT()?.emit('planet:endorse',{reqId:parseInt(b.dataset.id)});},{passive:false});
  });
  panel.querySelectorAll('.plDnyBtn').forEach(function(b){
    b.addEventListener('click',function(){PC_SKT()?.emit('planet:deny',{reqId:parseInt(b.dataset.id)});});
    b.addEventListener('touchend',function(e){e.preventDefault();PC_SKT()?.emit('planet:deny',{reqId:parseInt(b.dataset.id)});},{passive:false});
  });
  panel.querySelectorAll('.plFrcBtn').forEach(function(b){
    b.addEventListener('click',function(){PC_SKT()?.emit('planet:forcebuild',{type:b.dataset.type});});
  });
}

function btnStyle(col) {
  return 'padding:10px 14px;background:rgba(0,5,20,0.85);border:2px solid '+col+';border-radius:10px;'
    +'color:'+col+';font-size:11px;font-weight:bold;cursor:pointer;text-align:center;'
    +'letter-spacing:0.06em;user-select:none;-webkit-tap-highlight-color:transparent;';
}

// ── GLOBE RENDERER ────────────────────────────────────────────────────────────
function wireGlobeTouchControls() {
  if (!planetCanvas) return;
  planetCanvas.addEventListener('touchstart',function(e){
    e.preventDefault();
    if(e.touches.length===1){
      _globeTouch.active=true; _globeTouch.lastX=e.touches[0].clientX;
      _globeTouch.pinchDist=0;
    } else if(e.touches.length===2){
      _globeTouch.active=false;
      var dx=e.touches[0].clientX-e.touches[1].clientX;
      var dy=e.touches[0].clientY-e.touches[1].clientY;
      _globeTouch.pinchDist=Math.sqrt(dx*dx+dy*dy);
    }
  },{passive:false});
  planetCanvas.addEventListener('touchmove',function(e){
    e.preventDefault();
    if(e.touches.length===1&&_globeTouch.active){
      var dx=e.touches[0].clientX-_globeTouch.lastX;
      _globeSpinOffset+=dx*0.01;
      _globeTouch.lastX=e.touches[0].clientX;
    } else if(e.touches.length===2){
      var dx2=e.touches[0].clientX-e.touches[1].clientX;
      var dy2=e.touches[0].clientY-e.touches[1].clientY;
      var newDist=Math.sqrt(dx2*dx2+dy2*dy2);
      if(_globeTouch.pinchDist>0){
        var scale=newDist/_globeTouch.pinchDist;
        _globeZoom=Math.max(0.8,Math.min(4,_globeZoom*scale));
      }
      _globeTouch.pinchDist=newDist;
    }
  },{passive:false});
  planetCanvas.addEventListener('touchend',function(){ _globeTouch.active=false; });
  // Mouse drag for desktop
  var _mdown=false, _mlastX=0;
  planetCanvas.addEventListener('mousedown',function(e){_mdown=true;_mlastX=e.clientX;});
  planetCanvas.addEventListener('mousemove',function(e){if(_mdown){_globeSpinOffset+=(e.clientX-_mlastX)*0.008;_mlastX=e.clientX;}});
  planetCanvas.addEventListener('mouseup',function(){_mdown=false;});
  planetCanvas.addEventListener('wheel',function(e){
    _globeZoom=Math.max(0.8,Math.min(4,_globeZoom-(e.deltaY>0?0.1:-0.1)));
  },{passive:true});
}

function startGlobeLoop() {
  function loop() {
    if (!planetActive) return;
    planetAnimId = requestAnimationFrame(loop);
    _t += 0.016;
    drawGlobe();
  }
  loop();
}


// ── GLOBE HEIGHTMAP ───────────────────────────────────────────────────────────
var _globeMap = null;
var _globeMapSize = 256;
var _birds = [];
var _boats = [];
var _rainCloud = null;
var _globeSpinOffset = 0;
var _globeZoom = 1.0;
var _globeTargetSpin = null;
var _globeTargetZoom = null;
var _globeTouch = { active:false, lastX:0, pinchDist:0 };
var _roads = []; // [{from,to,progress,done}]

function _noise(x,y) {
  var n = Math.sin(x*127.1+y*311.7)*43758.5453;
  return n - Math.floor(n);
}
function _smoothNoise(x,y) {
  var ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  var a=_noise(ix,iy),b=_noise(ix+1,iy),c=_noise(ix,iy+1),d=_noise(ix+1,iy+1);
  var ux=fx*fx*(3-2*fx),uy=fy*fy*(3-2*fy);
  return a+(b-a)*ux+(c-a)*uy+(a-b-c+d)*ux*uy;
}
function _fbm(x,y,oct) {
  var v=0,a=0.5,f=1;
  for(var i=0;i<oct;i++){v+=a*_smoothNoise(x*f,y*f);a*=0.5;f*=2.1;}
  return v;
}

function buildGlobeMap() {
  var S=_globeMapSize;
  _globeMap=new Float32Array(S*S);
  for(var y=0;y<S;y++) for(var x=0;x<S;x++) {
    var lon=x/S, lat=y/S;
    var h=_fbm(lon*4,lat*4,6);
    // Pole ice caps
    var latN=Math.abs(lat-0.5)*2;
    h+=latN*latN*0.3;
    _globeMap[y*S+x]=h;
  }
  // Spawn birds and boats
  _birds=[];
  for(var b=0;b<12;b++) _birds.push({a:Math.random()*Math.PI*2,inc:(Math.random()-0.5)*0.3,spd:0.004+Math.random()*0.003,r:1.08+Math.random()*0.04});
  _boats=[];
  for(var bt=0;bt<6;bt++) _boats.push({lon:Math.random(),lat:0.35+Math.random()*0.3,spd:0.0002+Math.random()*0.0002,dir:Math.random()>0.5?1:-1});
}

function globeColor(h, waterAmt, metalAmt, lifeAmt) {
  var seaLevel=0.42+waterAmt*0.12;
  if(h<seaLevel-0.08) return [15,40,120];    // deep ocean
  if(h<seaLevel)      return [25,65,160];    // shallow ocean
  if(h<seaLevel+0.02) return [210,190,140];  // beach
  if(h<seaLevel+0.08) {
    if(lifeAmt>0.3) return [lrp(80,40,metalAmt),lrp(160,100,metalAmt),lrp(60,40,metalAmt)]; // lowland green
    return [lrp(140,80,metalAmt),lrp(120,80,metalAmt),lrp(80,60,metalAmt)]; // barren
  }
  if(h<seaLevel+0.18) {
    if(lifeAmt>0.4) return [lrp(55,35,metalAmt),lrp(130,90,metalAmt),lrp(45,35,metalAmt)]; // highland
    return [lrp(120,80,metalAmt),lrp(100,75,metalAmt),lrp(80,65,metalAmt)];
  }
  if(h<seaLevel+0.28) return [lrp(120,80,metalAmt),lrp(100,80,metalAmt),lrp(90,75,metalAmt)]; // mountain
  return [240,245,255]; // snow cap
}
function lrp(a,b,t){return Math.round(a+(b-a)*t);}

function drawGlobe() {
  if (!planetCtx || !planetCanvas) return;
  var W=planetCanvas.width, H=planetCanvas.height;
  var cx=W/2, cy=H/2, r=W/2-12;
  planetCtx.clearRect(0,0,W,H);
  // Apply zoom -- scale around center
  if(_globeZoom!==1.0){
    planetCtx.save();
    planetCtx.translate(cx,cy);
    planetCtx.scale(_globeZoom,_globeZoom);
    planetCtx.translate(-cx,-cy);
  }
  var tier=planetState?(planetState.tier||0):0;
  var resPct=planetState&&planetState.reservoirCap>0?(planetState.reservoirWoL||0)/planetState.reservoirCap:0;

  // Space glow
  var bg=planetCtx.createRadialGradient(cx,cy,r*0.7,cx,cy,r*1.4);
  bg.addColorStop(0,'rgba(20,0,60,0)'); bg.addColorStop(1,'rgba(20,0,60,0.18)');
  planetCtx.fillStyle=bg; planetCtx.beginPath(); planetCtx.arc(cx,cy,r*1.4,0,Math.PI*2); planetCtx.fill();

  if(!planetState||tier===0){drawAsteroid(cx,cy,r,_t);return;}
  if(tier===1){drawRockyBall(cx,cy,r,_t);return;}

  if(!_globeMap) buildGlobeMap();

  var waterAmt=Math.min(0.6,Math.max(0.1,resPct*0.5+tier*0.04));
  var lifeAmt=Math.min(1,Math.max(0,(tier-2)/3));
  var metalAmt=Math.min(1,Math.max(0,(tier-5)/3));
  var spin=_globeSpinOffset;
  var S=_globeMapSize;

  // Draw planet pixel by pixel using imageData
  var id=planetCtx.createImageData(W,H);
  var d=id.data;
  for(var py=0;py<H;py++) {
    for(var px=0;px<W;px++) {
      var dx=(px-cx)/r, dy=(py-cy)/r;
      var dist2=dx*dx+dy*dy;
      if(dist2>1) continue;
      var dz=Math.sqrt(1-dist2);
      // Sphere → lat/lon
      var lat=Math.asin(dy)/Math.PI+0.5;
      var lon=((Math.atan2(dx,dz)/(Math.PI*2))+spin)%1;
      if(lon<0)lon+=1;
      var mx=Math.floor(lon*S), my=Math.floor(lat*S);
      if(mx<0||mx>=S||my<0||my>=S) continue;
      var h=_globeMap[my*S+mx];
      var col=globeColor(h,waterAmt,metalAmt,lifeAmt);
      // Lighting -- simple diffuse from top-left
      var light=Math.max(0.25, 0.3+dx*0.4+dy*(-0.3)+dz*0.6);
      // Terminator shadow
      var terminator=Math.max(0,Math.min(1,(dx+0.5)*3));
      light*=(0.3+terminator*0.7);
      var idx=(py*W+px)*4;
      d[idx]  =Math.min(255,col[0]*light);
      d[idx+1]=Math.min(255,col[1]*light);
      d[idx+2]=Math.min(255,col[2]*light);
      d[idx+3]=255;
    }
  }
  planetCtx.putImageData(id,0,0);

  // Clip everything after to sphere
  planetCtx.save();
  planetCtx.beginPath(); planetCtx.arc(cx,cy,r,0,Math.PI*2); planetCtx.clip();

  // Ocean sparkles
  if(resPct>0.2) {
    var seaL=0.42+waterAmt*0.12;
    for(var si=0;si<8;si++) {
      var sa=_t*0.3+si*0.8, sr=0.3+Math.sin(_t*0.5+si)*0.4;
      var spx=cx+Math.cos(sa)*r*sr, spy=cy+Math.sin(sa)*r*0.5;
      if(Math.hypot(spx-cx,spy-cy)<r) {
        planetCtx.beginPath(); planetCtx.arc(spx,spy,1.5,0,Math.PI*2);
        planetCtx.fillStyle='rgba(180,220,255,'+(0.3+Math.sin(_t+si)*0.2)+')';
        planetCtx.fill();
      }
    }
  }

  // Clouds removed

  // Boats removed

  planetCtx.restore();

  // Birds outside clip -- orbit around planet
  if(tier>=3 && lifeAmt>0.2) {
    _birds.forEach(function(b){
      b.a+=b.spd;
      var bx=cx+Math.cos(b.a)*r*b.r;
      var by=cy+Math.sin(b.a)*r*(0.7+Math.sin(b.a*0.5)*0.15);
      var wing=Math.sin(_t*8+b.a*3)*0.4;
      planetCtx.save(); planetCtx.translate(bx,by); planetCtx.rotate(b.a+Math.PI/2);
      planetCtx.strokeStyle='rgba(50,30,20,0.7)'; planetCtx.lineWidth=1;
      // V shape wings
      planetCtx.beginPath();
      planetCtx.moveTo(-3,wing*2); planetCtx.lineTo(0,0); planetCtx.lineTo(3,wing*2);
      planetCtx.stroke();
      planetCtx.restore();
    });
  }

  // Atmosphere halo
  if(tier>=2) {
    var atmA=Math.min(1,lifeAmt*0.6+0.1);
    var atmCol=metalAmt>0.5?'rgba(80,90,110,':'rgba(100,170,255,';
    var halo=planetCtx.createRadialGradient(cx,cy,r*0.9,cx,cy,r*1.1);
    halo.addColorStop(0,atmCol+atmA+')');
    halo.addColorStop(1,atmCol+'0)');
    planetCtx.beginPath(); planetCtx.arc(cx,cy,r*1.1,0,Math.PI*2);
    planetCtx.fillStyle=halo; planetCtx.fill();
  }

  // City lights -- only on dark terminator side, properly masked
  if(tier>=4 && lifeAmt>0.5) {
    planetCtx.save();
    planetCtx.beginPath(); planetCtx.arc(cx,cy,r,0,Math.PI*2); planetCtx.clip();
    // Dark terminator
    var cityG=planetCtx.createLinearGradient(cx-r*0.1,cy,cx+r,cy);
    cityG.addColorStop(0,'rgba(0,0,0,0)'); cityG.addColorStop(0.5,'rgba(0,0,5,0.6)'); cityG.addColorStop(1,'rgba(0,0,10,0.9)');
    planetCtx.fillStyle=cityG; planetCtx.fillRect(cx,cy-r,r,r*2);
    // Lights only where dark -- use destination-atop
    [[0.62,-0.2],[0.68,0.1],[0.58,0.36],[0.72,-0.4],[0.52,0.54],[0.64,0.24],[0.74,0.0]].forEach(function(l){
      var lx=cx+l[0]*r, ly=cy+l[1]*r;
      if(lx>cx+r*0.35) { // only right half dark side
        planetCtx.beginPath(); planetCtx.arc(lx,ly,1.5,0,Math.PI*2);
        planetCtx.fillStyle='rgba(255,235,130,0.85)'; planetCtx.fill();
      }
    });
    planetCtx.restore();
  }

  // Metal plating
  if(tier>=6) {
    planetCtx.save();
    planetCtx.beginPath(); planetCtx.arc(cx,cy,r,0,Math.PI*2); planetCtx.clip();
    planetCtx.globalAlpha=metalAmt*0.35; planetCtx.strokeStyle='#556677'; planetCtx.lineWidth=1;
    for(var gi=-5;gi<=5;gi++){
      planetCtx.beginPath(); planetCtx.moveTo(cx+gi*r/4,cy-r); planetCtx.lineTo(cx+gi*r/4,cy+r); planetCtx.stroke();
      planetCtx.beginPath(); planetCtx.moveTo(cx-r,cy+gi*r/4); planetCtx.lineTo(cx+r,cy+gi*r/4); planetCtx.stroke();
    }
    if(metalAmt>0.7){
      [[0.4,-0.3],[-0.3,0.4],[0.1,0.5],[-0.5,-0.1]].forEach(function(pt){
        planetCtx.globalAlpha=metalAmt*0.9;
        planetCtx.beginPath(); planetCtx.arc(cx+pt[0]*r,cy+pt[1]*r,4,0,Math.PI*2);
        planetCtx.fillStyle='#FF4400'; planetCtx.shadowColor='#FF4400'; planetCtx.shadowBlur=8; planetCtx.fill(); planetCtx.shadowBlur=0;
      });
    }
    planetCtx.globalAlpha=1; planetCtx.restore();
  }

  // Rain cloud animation
  if (_rainCloud) {
    _rainCloud.t += 0.016;
    var rc = _rainCloud;
    var rProg = rc.t / rc.maxT;
    if (rProg >= 1) { _rainCloud = null; }
    else {
      // Cloud drifts in from left, hovers, then fades
      var cx2 = cx - r*0.8 + rProg*r*1.2;
      var cy2 = cy - r*0.55;
      planetCtx.save();
      // Cloud body
      planetCtx.globalAlpha = Math.min(1, (1-Math.abs(rProg-0.5)*2)*1.8) * 0.9;
      [[0,0,28],[20,5,22],[-20,5,22],[10,-8,18],[-10,-8,18]].forEach(function(b){
        planetCtx.beginPath(); planetCtx.arc(cx2+b[0],cy2+b[1],b[2],0,Math.PI*2);
        var cg2=planetCtx.createRadialGradient(cx2+b[0],cy2+b[1],0,cx2+b[0],cy2+b[1],b[2]);
        cg2.addColorStop(0,'rgba(220,235,255,0.95)'); cg2.addColorStop(1,'rgba(180,210,255,0.4)');
        planetCtx.fillStyle=cg2; planetCtx.fill();
      });
      // Rain drops
      if (rProg > 0.2 && rProg < 0.85) {
        planetCtx.strokeStyle='rgba(100,160,255,0.7)'; planetCtx.lineWidth=1.5;
        for (var ri=0;ri<12;ri++) {
          var rx=cx2-30+ri*5+Math.sin(_t*3+ri)*3;
          var ry=cy2+30+(((_t*80+ri*20)%50));
          if (Math.hypot(rx-cx,ry-cy)<r) {
            planetCtx.beginPath(); planetCtx.moveTo(rx,ry); planetCtx.lineTo(rx-2,ry+8); planetCtx.stroke();
          }
        }
      }
      planetCtx.globalAlpha=1; planetCtx.restore();
    }
  }
  // Buildings on surface
  if (tier>=2 && planetState.buildings && planetState.buildings.length) {
    // Tween spin and zoom
  if(_globeTargetSpin!==null){var ds=_globeTargetSpin-_globeSpinOffset;if(Math.abs(ds)<0.01){_globeSpinOffset=_globeTargetSpin;_globeTargetSpin=null;}else{_globeSpinOffset+=ds*0.05;}}
  if(_globeTargetZoom!==null){var dz=_globeTargetZoom-_globeZoom;if(Math.abs(dz)<0.005){_globeZoom=_globeTargetZoom;_globeTargetZoom=null;}else{_globeZoom+=dz*0.06;}}
  var bSpin=_globeSpinOffset;
    planetCtx.save();
    planetCtx.beginPath(); planetCtx.arc(cx,cy,r,0,Math.PI*2); planetCtx.clip();
    planetState.buildings.forEach(function(b){
      if (!b.active) return;
      var theta=((b.lon||0)-bSpin/(Math.PI*2))*Math.PI*2;
      var phi=(0.5-(b.lat||0.5))*Math.PI;
      var bx3=Math.cos(phi)*Math.sin(theta);
      var by3=Math.sin(phi);
      var bz3=Math.cos(phi)*Math.cos(theta);
      if (bz3<0.1) return; // behind planet
      var bsx=cx+bx3*r, bsy=cy-by3*r;
      var sc=bz3*0.85; // scale by depth
      planetCtx.save();
      planetCtx.translate(bsx,bsy);
      planetCtx.scale(sc,sc);
      if (b.type==='cottage'||b.type==='village') {
        // House -- triangle roof + rectangle base
        var n=b.type==='village'?3:1;
        for(var ni=0;ni<n;ni++){
          var ox=ni*7-n*3;
          planetCtx.fillStyle='#AAFFCC';
          planetCtx.fillRect(ox-3,0,6,5); // base
          planetCtx.fillStyle='#FF8866';
          planetCtx.beginPath(); planetCtx.moveTo(ox-4,-1); planetCtx.lineTo(ox,-(4+ni)); planetCtx.lineTo(ox+4,-1); planetCtx.fill(); // roof
        }
      } else if (b.type==='city') {
        // Skyline -- varied height rectangles
        var heights=[8,12,10,14,9,11];
        var cols=['#FFDD44','#FFB800','#FFE566','#FFCC00','#FFD433','#FFC400'];
        for(var ci=0;ci<6;ci++){
          planetCtx.fillStyle=cols[ci];
          planetCtx.fillRect(-15+ci*5,-heights[ci],4,heights[ci]);
          // Windows
          planetCtx.fillStyle='rgba(0,0,0,0.3)';
          for(var wi=0;wi<Math.floor(heights[ci]/4);wi++){
            planetCtx.fillRect(-14+ci*5,-heights[ci]+2+wi*4,2,2);
          }
        }
        // Glow
        planetCtx.globalAlpha=0.25;
        var cg=planetCtx.createRadialGradient(0,0,0,0,0,20);
        cg.addColorStop(0,'rgba(255,220,50,0.8)'); cg.addColorStop(1,'transparent');
        planetCtx.fillStyle=cg; planetCtx.beginPath(); planetCtx.arc(0,0,20,0,Math.PI*2); planetCtx.fill();
        planetCtx.globalAlpha=1;
      } else if (b.type==='fort') {
        // Castle -- main tower + battlements
        planetCtx.fillStyle='#AA3333';
        planetCtx.fillRect(-6,-10,12,10); // tower
        // Battlements
        for(var bi=0;bi<4;bi++){
          planetCtx.fillStyle=bi%2===0?'#CC4444':'#882222';
          planetCtx.fillRect(-6+bi*3,-13,2,4);
        }
        // Gate arch
        planetCtx.fillStyle='#220000';
        planetCtx.beginPath(); planetCtx.arc(0,-2,2.5,Math.PI,0); planetCtx.fill();
        planetCtx.fillRect(-2.5,-2,5,4);
        // Glow
        planetCtx.globalAlpha=0.2;
        planetCtx.fillStyle='rgba(255,50,50,0.5)';
        planetCtx.beginPath(); planetCtx.arc(0,-5,14,0,Math.PI*2); planetCtx.fill();
        planetCtx.globalAlpha=1;
      } else if (b.type==='farm') {
        // Grid field pattern
        planetCtx.strokeStyle='#88AA44'; planetCtx.lineWidth=0.8;
        for(var fi=0;fi<4;fi++){
          planetCtx.beginPath(); planetCtx.moveTo(-8+fi*4,-8); planetCtx.lineTo(-8+fi*4,8); planetCtx.stroke();
          planetCtx.beginPath(); planetCtx.moveTo(-8,-8+fi*4); planetCtx.lineTo(8,-8+fi*4); planetCtx.stroke();
        }
        planetCtx.globalAlpha=0.3;
        planetCtx.fillStyle='#66AA22';
        planetCtx.fillRect(-8,-8,16,16);
        planetCtx.globalAlpha=1;
      } else if (b.type==='market') {
        // Dome + columns
        planetCtx.fillStyle='#44FFAA';
        planetCtx.beginPath(); planetCtx.arc(0,-4,7,Math.PI,0); planetCtx.fill();
        planetCtx.fillRect(-8,-4,2,8); planetCtx.fillRect(-4,-4,2,8);
        planetCtx.fillRect(2,-4,2,8); planetCtx.fillRect(6,-4,2,8);
        planetCtx.fillRect(-9,4,18,2);
      } else if (b.type==='barracks') {
        // Long building + flag
        planetCtx.fillStyle='#FF8800';
        planetCtx.fillRect(-9,-4,18,8);
        for(var bri=0;bri<3;bri++){
          planetCtx.fillStyle='#CC6600';
          planetCtx.fillRect(-7+bri*6,-4,4,8);
        }
        // Flag
        planetCtx.strokeStyle='#FFAA00'; planetCtx.lineWidth=1;
        planetCtx.beginPath(); planetCtx.moveTo(0,-4); planetCtx.lineTo(0,-10); planetCtx.stroke();
        planetCtx.fillStyle='#FF4400';
        planetCtx.beginPath(); planetCtx.moveTo(0,-10); planetCtx.lineTo(5,-8); planetCtx.lineTo(0,-6); planetCtx.fill();
      }
      // Night light glow on dark side
      var lightSide = Math.cos(((b.lon||0)+_globeSpinOffset/(Math.PI*2))%1*Math.PI*2-Math.PI);
      if (lightSide < 0.2) {
        planetCtx.globalAlpha=(0.2-lightSide)*0.8*(0.7+Math.sin(_t*2+b.id)*0.3);
        var lCol=b.type==='city'?'rgba(255,220,80,':(b.type==='fort'?'rgba(255,80,80,':'rgba(150,255,180,');
        var lg=planetCtx.createRadialGradient(0,0,0,0,0,12);
        lg.addColorStop(0,lCol+'0.8)'); lg.addColorStop(1,lCol+'0)');
        planetCtx.fillStyle=lg; planetCtx.beginPath(); planetCtx.arc(0,0,12,0,Math.PI*2); planetCtx.fill();
        planetCtx.globalAlpha=1;
      }
      planetCtx.restore();
    });
    planetCtx.restore();
  }
  // Roads between buildings
  if (tier>=3 && planetState.buildings && planetState.buildings.length>1) {
    var blds=planetState.buildings.filter(function(b){return b.active;});
    var bSpin2=_globeSpinOffset;
    planetCtx.save();
    planetCtx.beginPath(); planetCtx.arc(cx,cy,r,0,Math.PI*2); planetCtx.clip();
    // Connect nearby buildings with roads
    for(var ri=0;ri<Math.min(blds.length,20);ri++){
      for(var rj=ri+1;rj<Math.min(blds.length,20);rj++){
        var ba=blds[ri], bb=blds[rj];
        var lonDiff=Math.abs(ba.lon-bb.lon), latDiff=Math.abs(ba.lat-bb.lat);
        if(lonDiff>0.15||latDiff>0.15) continue; // only connect nearby
        // Project both to screen
        function bProj(b){
          var th=((b.lon||0)-bSpin2/(Math.PI*2))*Math.PI*2;
          var ph=(0.5-(b.lat||0.5))*Math.PI;
          var x3=Math.cos(ph)*Math.sin(th), y3=Math.sin(ph), z3=Math.cos(ph)*Math.cos(th);
          if(z3<0.1) return null;
          return {x:cx+x3*r, y:cy-y3*r, z:z3};
        }
        var pa=bProj(ba), pb=bProj(bb);
        if(!pa||!pb) continue;
        planetCtx.beginPath(); planetCtx.moveTo(pa.x,pa.y); planetCtx.lineTo(pb.x,pb.y);
        planetCtx.strokeStyle='rgba(40,30,20,'+(Math.min(pa.z,pb.z)*0.6)+')';
        planetCtx.lineWidth=1.2*(Math.min(pa.z,pb.z));
        planetCtx.stroke();
      }
    }
    // Worker ants moving along roads
    var workerT=(_t*0.8)%1;
    for(var wi=0;wi<Math.min(blds.length-1,8);wi++){
      var wba=blds[wi], wbb=blds[(wi+1)%blds.length];
      var wt=(workerT+wi*0.13)%1;
      var wth=(((wba.lon+(wbb.lon-wba.lon)*wt)||0)-bSpin2/(Math.PI*2))*Math.PI*2;
      var wph=(0.5-((wba.lat+(wbb.lat-wba.lat)*wt)||0.5))*Math.PI;
      var wx3=Math.cos(wph)*Math.sin(wth), wy3=Math.sin(wph), wz3=Math.cos(wph)*Math.cos(wth);
      if(wz3<0.1) continue;
      var wsx=cx+wx3*r, wsy=cy-wy3*r;
      planetCtx.beginPath(); planetCtx.arc(wsx,wsy,1.5*wz3,0,Math.PI*2);
      planetCtx.fillStyle='rgba(255,230,150,'+(wz3*0.9)+')'; planetCtx.fill();
    }
    planetCtx.restore();
  }
  // Restore zoom
  if(_globeZoom!==1.0) planetCtx.restore();
  // Rim shading + specular
  var rim=planetCtx.createRadialGradient(cx,cy,r*0.65,cx,cy,r);
  rim.addColorStop(0,'rgba(0,0,0,0)'); rim.addColorStop(1,'rgba(0,0,10,0.7)');
  planetCtx.beginPath(); planetCtx.arc(cx,cy,r,0,Math.PI*2); planetCtx.fillStyle=rim; planetCtx.fill();
  var spec=planetCtx.createRadialGradient(cx-r*0.32,cy-r*0.32,0,cx-r*0.32,cy-r*0.32,r*0.3);
  spec.addColorStop(0,'rgba(255,255,255,0.22)'); spec.addColorStop(1,'rgba(255,255,255,0)');
  planetCtx.beginPath(); planetCtx.arc(cx,cy,r,0,Math.PI*2); planetCtx.fillStyle=spec; planetCtx.fill();
}

function drawRockyBall(cx,cy,r,t) {
  var ctx=planetCtx;
  var g=ctx.createRadialGradient(cx-r*0.25,cy-r*0.25,r*0.05,cx,cy,r);
  g.addColorStop(0,'#8a8a9a'); g.addColorStop(0.5,'#5a5a6a'); g.addColorStop(1,'#2a2a3a');
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
  // Surface texture
  ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.clip();
  for(var i=0;i<20;i++){
    var bx=cx+(Math.sin(i*137.5)*0.8)*r, by=cy+(Math.cos(i*97.3)*0.7)*r;
    var br=r*(0.04+Math.sin(i*53)*0.03);
    ctx.beginPath(); ctx.arc(bx,by,br,0,Math.PI*2);
    ctx.fillStyle='rgba(40,40,55,0.4)'; ctx.fill();
  }
  ctx.restore();
  // Rim
  var rim=ctx.createRadialGradient(cx,cy,r*0.65,cx,cy,r);
  rim.addColorStop(0,'rgba(0,0,0,0)'); rim.addColorStop(1,'rgba(0,0,0,0.65)');
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle=rim; ctx.fill();
}

function drawAsteroid(cx, cy, r, t) {
  var ctx = planetCtx;
  ctx.save(); ctx.translate(cx,cy); ctx.rotate(t*0.08);
  ctx.beginPath();
  var pts=14;
  for(var i=0;i<pts;i++){
    var a=(i/pts)*Math.PI*2;
    var nr=r*(0.55+0.38*Math.sin(i*2.3+0.5)*Math.cos(i*1.7+1));
    if(i===0) ctx.moveTo(Math.cos(a)*nr,Math.sin(a)*nr);
    else ctx.lineTo(Math.cos(a)*nr,Math.sin(a)*nr);
  }
  ctx.closePath();
  var g=ctx.createRadialGradient(r*0.1,-r*0.2,0,0,0,r);
  g.addColorStop(0,'#aaaabc'); g.addColorStop(0.4,'#606070'); g.addColorStop(1,'#1e1e2a');
  ctx.fillStyle=g; ctx.fill();
  ctx.strokeStyle='rgba(80,80,100,0.4)'; ctx.lineWidth=1.5; ctx.stroke();
  [[r*0.25,r*0.1,r*0.1],[r*-0.28,r*0.22,r*0.07],[r*0.08,r*-0.28,r*0.055],[r*-0.1,r*-0.12,r*0.04]].forEach(function(c){
    ctx.beginPath(); ctx.arc(c[0],c[1],c[2],0,Math.PI*2);
    ctx.strokeStyle='rgba(30,30,45,0.6)'; ctx.lineWidth=1.5; ctx.stroke();
    var cg=ctx.createRadialGradient(c[0],c[1],0,c[0],c[1],c[2]);
    cg.addColorStop(0,'rgba(15,15,25,0.4)'); cg.addColorStop(1,'rgba(15,15,25,0)');
    ctx.fillStyle=cg; ctx.fill();
  });
  ctx.restore();
}

function panToBuilding(lon, lat) {
  // Convert building lon to spin offset that centers it
  _globeTargetSpin = -(lon * Math.PI * 2 - Math.PI);
  _globeTargetZoom = 2.2;
  // Zoom back out after 3s
  setTimeout(function(){ _globeTargetZoom = 1.0; }, 3000);
}

function triggerRainCloud() {
  if (!planetCanvas) return;
  var W=planetCanvas.width, H=planetCanvas.height;
  _rainCloud = { t:0, maxT:3.5 };
}

function lerpColor(a, b, t) {
  function hex(h){ return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]; }
  function toHex(n){ return ('0'+Math.round(n).toString(16)).slice(-2); }
  var ca=hex(a),cb=hex(b);
  return '#'+toHex(ca[0]+(cb[0]-ca[0])*t)+toHex(ca[1]+(cb[1]-ca[1])*t)+toHex(ca[2]+(cb[2]-ca[2])*t);
}


console.log('[Planet Client] Loaded');
})();
