/**
 * ValueShop25 Chat Widget v1.6.78
 * WhatsApp-inspiriertes Design, Status-Dot, Toggle-Switch, Session-Tracking
 *
 * v1.6.78 (Cache-Fix):
 *   • Server liefert widget.js mit no-cache Header damit Browser nicht
 *     auf alten gecachten Versionen hängen bleiben.
 *   • Klarer Boot-Log im Browser: window.__VS25_LOADED = true wenn geladen
 *   • Defensive Boot: bei Exceptions wird mindestens die Bubble gerendert.
 *
 * v1.5.38: sessionStorage statt localStorage (Chat-ID nur fuer Tab-Lebensdauer).
 */
(function(){
'use strict';

// (1.6.78) Sofortiger sichtbarer Boot-Marker damit der User in der Browser-
// Console sieht, dass das Script geladen wurde. Falls dieser Log fehlt:
// → widget.js wurde NICHT geladen (Network-Issue oder Cache-Problem).
try {
  window.__VS25_LOADED = true;
  window.__VS25_VERSION = '1.6.78';
  window.__VS25_BOOT_AT = Date.now();
  if (window.console && console.log) {
    console.log('%c[VS25-Widget] v1.6.78 script loaded', 'color: #128c7e; font-weight: bold');
  }
} catch(_) {}

// (1.6.78) Fetch-Sicherung: in extrem alten Browsern (IE11 ohne Polyfill, jsdom
// ohne fetch-Setup) ist fetch nicht definiert. Wir kapseln alle Calls so dass
// fehlende fetch NIE zu einem ReferenceError fuehrt der das Widget zerstoert.
var _safeFetch = (typeof fetch === 'function') ? fetch : function(){
  return { then: function(){ return { then: function(){ return { catch: function(){} }; }, catch: function(){} }; }, catch: function(){} };
};

// Bombensicherer Tracking-POST: wiederholt bei Netzfehler / Server-Cold-Start (Render),
// damit JEDER Besuch und Seitenaufruf zuverlässig geloggt wird (und die Push auslöst).
function _postTrack(path, body, tries){
  tries = (typeof tries === 'number') ? tries : 3;
  try {
    return _safeFetch(API+path, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'X-Chat-ID': (chatId||'') },
      body: JSON.stringify(body),
      keepalive: true
    }).then(function(r){
      if(r && r.ok === false && tries > 1) throw new Error('http_'+r.status);
      return (r && r.json) ? r.json().catch(function(){ return {}; }) : {};
    }).catch(function(){
      if(tries > 1){
        return new Promise(function(res){ setTimeout(res, 900); })
          .then(function(){ return _postTrack(path, body, tries-1); });
      }
      return {};
    });
  } catch(_) {
    return Promise.resolve({});
  }
}

var API=(function(){var s=document.querySelectorAll('script[src*="widget.js"]');return s.length?s[s.length-1].src.replace('/widget.js',''):'https://ai-agent-lix6.onrender.com';})();
var chatId=null,isOpen=false,isTyping=false,_proDone=false,_handover=false,_faqUsed=false,_proTimer=null,_statusInt=null,_lastMsgTs=0;

// ─── Storage-Wrapper: sessionStorage statt localStorage ─────────────────────
// sessionStorage hält die Chat-ID nur solange wie der Tab offen ist.
// Beim Schließen / Verlassen der Domain ist der Chat aus Kundensicht "weg".
var STORAGE_KEY='vs25_cid';
function _ssGet(){ try { return sessionStorage.getItem(STORAGE_KEY); } catch(_) { return null; } }
function _ssSet(v){ try { sessionStorage.setItem(STORAGE_KEY,v); } catch(_) {} }
function _ssClear(){
  try { sessionStorage.removeItem(STORAGE_KEY); } catch(_) {}
  // Defensiv: falls noch alte localStorage-Reste vorhanden sind, weg damit.
  try { localStorage.removeItem(STORAGE_KEY); } catch(_) {}
}
// Migration: falls ein alter Eintrag noch in localStorage hängt, einmalig
// in die Session übernehmen und dann aus localStorage entfernen.
try {
  var _legacy = localStorage.getItem(STORAGE_KEY);
  if (_legacy && !_ssGet()) _ssSet(_legacy);
  if (_legacy) localStorage.removeItem(STORAGE_KEY);
} catch(_) {}

function smartTitle(){
  var url=location.pathname;
  var m=url.match(/\/product\/([^/?#]+)/);if(m)return m[1].replace(/-/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});
  var cm=url.match(/\/category\/([^/?#]+)/);if(cm)return 'Kategorie: '+cm[1].replace(/-/g,' ');
  if(/\/checkout/i.test(url))return'Checkout';if(/\/cart|warenkorb/i.test(url))return'Warenkorb';
  if(url==='/'||url==='')return'Startseite';
  var t=(document.title||'').split(/\s[–|-]\s/)[0].trim();return t.length>50?t.substring(0,50)+'…':(t||'Seite');
}

// ── CSS ───────────────────────────────────────────────────────────────────────
var CSS=[
'#vs25 *{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}',
// Bubble
'#vs25-bbl{position:fixed;bottom:24px;right:22px;z-index:99998;width:60px;height:60px;border-radius:50%;background:#25d366;box-shadow:0 4px 16px rgba(37,211,102,0.4);cursor:pointer;border:none;outline:none;display:flex;align-items:center;justify-content:center;transition:transform .2s,box-shadow .2s}',
'#vs25-bbl:hover{transform:scale(1.06)}',
'#vs25-bbl svg{width:28px;height:28px;fill:white}',
// Status dot on bubble
'#vs25-status-dot{position:absolute;bottom:2px;right:2px;width:13px;height:13px;border-radius:50%;border:2px solid white;background:#4caf50;}',
'#vs25-status-dot.online{background:#25d366;box-shadow:0 0 0 2px rgba(37,211,102,.3);animation:vspulse 2s infinite}',
'#vs25-status-dot.manual{background:#ff9800;box-shadow:0 0 0 2px rgba(255,152,0,.3);animation:vspulse 2s infinite}',
'#vs25-status-dot.offline{background:#f44336;animation:none}',
'@keyframes vspulse{0%,100%{opacity:1}50%{opacity:.55}}',
// Proactive invite bubble
'#vs25-inv{position:fixed;bottom:96px;right:22px;z-index:99997;background:white;color:#111b21;border-radius:12px 12px 2px 12px;padding:10px 28px 10px 14px;max-width:240px;box-shadow:0 4px 16px rgba(0,0,0,.15);font-size:.85rem;line-height:1.4;cursor:pointer;display:none;animation:vspop .3s ease-out}',
'#vs25-inv.on{display:block}#vs25-inv::after{content:"";position:absolute;bottom:-6px;right:16px;border-left:6px solid transparent;border-top:6px solid white}',
'.vs25-ix{position:absolute;top:4px;right:6px;font-size:.75rem;color:#8696a0;cursor:pointer;background:none;border:none;line-height:1}',
'@keyframes vspop{from{opacity:0;transform:scale(.88) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}',
// Panel - always portrait hochformat
'#vs25-pnl{position:fixed;z-index:99999;display:none;flex-direction:column;bottom:0;right:0;width:100%;height:100%;overflow:hidden;background:#efeae2;box-shadow:0 8px 32px rgba(11,20,26,0.2);transform:translateY(100%);transition:transform .3s cubic-bezier(.32,.72,0,1)}',
'#vs25-pnl.on{display:flex;transform:translateY(0)}',
// Force portrait on desktop screen
'@media(min-width:540px){',
'  #vs25-pnl{bottom:90px;right:24px;width:375px;height:620px;border-radius:12px;border:1px solid rgba(11,20,26,0.08);transform:none;transition:none}',
'  #vs25-pnl.on{display:flex}',
'}',
// Drag handle on mobile
'.vs25-drag{display:none;justify-content:center;padding:8px 0 4px;background:#008069;flex-shrink:0}',
'.vs25-drag span{width:36px;height:4px;border-radius:2px;background:rgba(255,255,255,.35)}',
'@media(max-width:539px){.vs25-drag{display:flex}}',
// Header - WhatsApp Green
'.vs25-hdr{background:#008069;padding:10px 12px;display:flex;align-items:center;gap:8px;flex-shrink:0;box-shadow:0 1px 3px rgba(0,0,0,0.15)}',
'.vs25-back{background:none;border:none;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:4px;margin-right:2px;transition:opacity .15s;flex-shrink:0}',
'.vs25-back:hover{opacity:.8}',
'.vs25-back svg{width:22px;height:22px;fill:white}',
'.vs25-hdr-av{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;position:relative}',
'.vs25-hdr-av .vs25-av-dot{position:absolute;bottom:0px;right:0px;width:9px;height:9px;border-radius:50%;border:1.5px solid #008069;background:#25d366}',
'.vs25-hdr-av .vs25-av-dot.manual{background:#ff9800}',
'.vs25-hdr-av .vs25-av-dot.offline{background:#f44336}',
'.vs25-hdr-info{flex:1;min-width:0}',
'.vs25-hdr-name{color:white;font-weight:700;font-size:.92rem;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'.vs25-hdr-sub{color:rgba(255,255,255,.85);font-size:.72rem;margin-top:2px}',
// KI Toggle in header
'.vs25-toggle-wrap{display:flex;align-items:center;gap:4px;flex-shrink:0;margin-right:8px}',
'.vs25-toggle-label{color:rgba(255,255,255,.9);font-size:.7rem;font-weight:600}',
'.vs25-toggle{position:relative;width:34px;height:18px;cursor:pointer;flex-shrink:0}',
'.vs25-toggle input{opacity:0;width:0;height:0;position:absolute}',
'.vs25-slider{position:absolute;inset:0;background:rgba(255,255,255,.3);border-radius:18px;transition:.2s;cursor:pointer}',
'.vs25-slider::before{content:"";position:absolute;height:12px;width:12px;left:3px;bottom:3px;background:white;border-radius:50%;transition:.2s}',
'.vs25-toggle input:checked + .vs25-slider{background:#25d366}',
'.vs25-toggle input:checked + .vs25-slider::before{transform:translateX(16px)}',
// Messages area - WhatsApp light background with subtle doodle pattern
'.vs25-msgs{flex:1;overflow-y:auto;padding:14px 14px 8px;display:flex;flex-direction:column;gap:6px;background-color:#efeae2;background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'80\' height=\'80\' viewBox=\'0 0 80 80\'%3E%3Cg fill=\'%23e5ddd5\' fill-opacity=\'0.3\'%3E%3Cpath d=\'M10 15h2v2h-2zm10 5h2v2h-2zm-10 15h2v2h-2zm20-10h2v2h-2zm10-10h2v2h-2zm10 20h2v2h-2zm10 10h2v2h-2zm-30 20h2v2h-2zm-10 10h2v2h-2zm20 10h2v2h-2zm10-10h2v2h-2zm10-10h2v2h-2zm10 20h2v2h-2zm10 10h2v2h-2z\'/%3E%3C/g%3E%3C/svg%3E")}',
'.vs25-msgs::-webkit-scrollbar{width:4px}.vs25-msgs::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:2px}',
'.vs25-msg{display:flex;flex-direction:column;max-width:85%;margin-bottom:6px}',
'.vs25-msg.u{align-self:flex-end}',
'.vs25-msg.b{align-self:flex-start}',
// WhatsApp bubbles with tails
'.vs25-bub{padding:6px 10px;font-size:.92rem;line-height:1.45;word-break:break-word;white-space:pre-wrap;position:relative;min-height:32px;box-shadow:0 1px 0.5px rgba(0,0,0,.13);padding-right:60px}',
'.vs25-msg.b .vs25-bub{background:#ffffff;color:#111b21;border-radius:0 8px 8px 8px}',
'.vs25-msg.u .vs25-bub{background:#d9fdd3;color:#111b21;border-radius:8px 0 8px 8px}',
// Timestamp inside bubble
'.vs25-ts{position:absolute;bottom:4px;right:8px;font-size:.66rem;color:#8696a0;display:flex;align-items:center;gap:3px;line-height:1}',
'.vs25-ticks{color:#53bdeb;font-size:0.75rem;font-weight:bold;margin-left:2px}',
// Date separator
'.vs25-date-sep{text-align:center;margin:6px 0;font-size:.7rem;color:#667781}',
'.vs25-date-sep span{background:#ffffff;padding:4px 12px;border-radius:8px;box-shadow:0 1px 0.5px rgba(0,0,0,.13)}',
// Typing indicator
'.vs25-typ .vs25-bub{display:flex;align-items:center;gap:4px;padding:10px 14px;min-width:54px}',
'.vs25-typ span{width:6px;height:6px;border-radius:50%;background:#8696a0;animation:vsb 1.3s infinite}',
'.vs25-typ span:nth-child(2){animation-delay:.2s}.vs25-typ span:nth-child(3){animation-delay:.4s}',
'@keyframes vsb{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}}',
// Suggestions (FAQ) Area - horizontally scrollable, attractive, modern look
'.vs25-fq{padding:6px 8px;background:transparent;flex-shrink:0;overflow:hidden}',
'.vs25-fqg{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:4px 2px}',
'.vs25-fqg::-webkit-scrollbar{display:none}',
'.vs25-chip{background:white;border:1px solid #25d366;color:#128c7e;font-size:.78rem;font-weight:600;padding:8px 14px;border-radius:18px;cursor:pointer;line-height:1.2;transition:all .18s ease;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,0.06);white-space:nowrap;flex-shrink:0}',
'.vs25-chip:hover{background:#25d366;color:white;border-color:#25d366;transform:translateY(-1px)}',
'.vs25-chip:active{transform:translateY(0)}',
// Input area
'.vs25-ir{padding:8px 10px;background:#f0f2f5;display:flex;gap:6px;align-items:center;flex-shrink:0;border-top:1px solid rgba(0,0,0,0.05)}',
'.vs25-inp{flex:1;background:white;border:none;color:#111b21;border-radius:20px;padding:9px 15px;font-size:0.92rem;font-family:inherit;resize:none;max-height:100px;overflow-y:auto;line-height:1.4;outline:none;box-shadow:0 1px 2px rgba(0,0,0,0.1)}',
'.vs25-snd{width:38px;height:38px;border-radius:50%;flex-shrink:0;background:#00a884;border:none;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s,transform .1s;box-shadow:0 1px 3px rgba(0,0,0,0.2)}',
'.vs25-snd:hover{background:#008f72}',
'.vs25-snd:active{transform:scale(.92)}',
'.vs25-snd svg{width:18px;height:18px;fill:white}',
'.vs25-snd:disabled{background:#a6b9bc;cursor:not-allowed;box-shadow:none;transform:none}',
'.vs25-ft{text-align:center;padding:4px;color:#8696a0;font-size:.62rem;background:#f0f2f5;flex-shrink:0}',
// Mobile optimizations
'@media(max-width:539px){',
'  #vs25-pnl{bottom:0;right:0;width:100%;height:100%;border-radius:0}',
'  .vs25-ir{padding-bottom:calc(8px + env(safe-area-inset-bottom))}',
'  .vs25-ft{padding-bottom:calc(6px + env(safe-area-inset-bottom))}',
'}'
].join('');

var INVITES=['💬 Fragen zur eSIM? Ich helfe sofort!','🤔 Noch unsicher? Kostenlose Beratung!','👋 Passende eSIM finden – frag mich!','🔍 Ich finde den richtigen Tarif für dich!'];

function build(){
  if(document.getElementById('vs25')) return;
  var w=document.createElement('div'); w.id='vs25';
  var st=document.createElement('style'); st.textContent=CSS; document.head.appendChild(st);
  var inv=INVITES[Math.floor(Math.random()*INVITES.length)];

  w.innerHTML=
    '<button id="vs25-bbl" aria-label="Chat öffnen">'+
      '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>'+
      '<span id="vs25-status-dot" class="online"></span>'+
    '</button>'+
    '<div id="vs25-inv"><button class="vs25-ix" id="vs25-ix">✕</button>'+esc(inv)+'</div>'+
    '<div id="vs25-pnl">'+
      '<div class="vs25-drag"><span></span></div>'+
      '<div class="vs25-hdr">'+
        '<button class="vs25-back" id="vs25-back" title="Schließen" aria-label="Schließen"><svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg></button>'+
        '<div class="vs25-hdr-av">🤖<span class="vs25-av-dot" id="vs25-av-dot"></span></div>'+
        '<div class="vs25-hdr-info">'+
          '<div class="vs25-hdr-name">ValueShop25 Support</div>'+
          '<div class="vs25-hdr-sub" id="vs25-hdr-sub">KI Assistent · Online</div>'+
        '</div>'+
        '<div class="vs25-toggle-wrap">'+
          '<span class="vs25-toggle-label">KI</span>'+
          '<label class="vs25-toggle"><input type="checkbox" id="vs25-ki-toggle" checked><span class="vs25-slider"></span></label>'+
        '</div>'+
      '</div>'+
      '<div class="vs25-msgs" id="vs25-msgs"></div>'+
      '<div class="vs25-fq" id="vs25-fq"><div class="vs25-fqg" id="vs25-fqg"></div></div>'+
      '<div class="vs25-ir">'+
        '<textarea class="vs25-inp" id="vs25-inp" placeholder="Nachricht schreiben…" rows="1"></textarea>'+
        '<button class="vs25-snd" id="vs25-snd" aria-label="Senden"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>'+
      '</div>'+
      '<div class="vs25-ft"><span id="vs25-ft-text">Powered by ValueShop25 AI</span></div>'+
    '</div>';

  document.body.appendChild(w);

  document.getElementById('vs25-bbl').onclick=openChat;
  document.getElementById('vs25-back').onclick=closeChat;
  document.getElementById('vs25-snd').onclick=sendMsg;
  document.getElementById('vs25-ki-toggle').onchange=toggleKI;
  document.getElementById('vs25-inv').onclick=function(e){if(e.target.id==='vs25-ix'){hideInv();return;}hideInv();openChat();};
  document.getElementById('vs25-ix').onclick=function(e){e.stopPropagation();hideInv();};
  document.getElementById('vs25-inp').addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();}});
  document.getElementById('vs25-inp').addEventListener('input',function(){
    this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px';
    hideFaq();
  });

  passiveTrack();startSession();loadFaq();
  _proTimer=setTimeout(showInv,28000);

  // ─── Seitenwechsel-Tracking ───────────────────────────────────────────────
  // sessionStorage NICHT bei Navigation löschen — der Besucher soll über
  // alle Seiten hinweg als DERSELBE Besucher mit weiteren Seitenaufrufen
  // erkannt werden. sessionStorage endet automatisch beim Schließen des Tabs.
  // (Kein pagehide/beforeunload-Clear mehr.)
}

function passiveTrack(){
  // Lightweight beacon - updates existing session, never creates new one
  var saved=_ssGet()||chatId;
  _postTrack('/api/widget/beacon', {fingerprint:fp(),pageUrl:location.href,pageTitle:smartTitle(),chatId:saved})
  .then(function(d){
    if(d && d.chatId && !_ssGet()) _ssSet(d.chatId);
  });
}

function startSession(){
  _safeFetch(API+'/api/widget/config').then(function(r){return r.json();}).then(function(d){
    var ft=document.getElementById('vs25-ft-text');
    if(ft){if(d.poweredBy===null||d.poweredBy===''){ft.parentElement.style.display='none';}else if(d.poweredBy){ft.textContent=d.poweredBy;}}
    if(d.botName){
      var nameEl = document.querySelector('.vs25-hdr-name');
      if (nameEl) nameEl.textContent = d.botName;
    }
  }).catch(function(){});

  var saved=_ssGet();

  // RESUME: if we already know this visitor (current browser session),
  // skip full init to avoid duplicate sessions.
  if(saved){
    chatId=saved;
    loadHist();
    startStatusPoll();
    passiveTrack(); // Just update last_seen on existing session
    return;
  }

  // NEW VISITOR: full init creates session + chatId (mit Retry → kein verlorener Besuch)
  _postTrack('/api/widget/init', {fingerprint:fp(),pageUrl:location.href,pageTitle:smartTitle(),chatId:null})
  .then(function(d){
    if(!d || d.banned) return;
    if(!d.chatId) return;
    chatId=d.chatId; _ssSet(chatId);
    if(d.welcome) addMsg('b',d.welcome);
    loadHist(); startStatusPoll();
  });
}

function loadHist(){
  if(!chatId) return;
  _safeFetch(API+'/api/widget/history',{headers:{'X-Chat-ID':chatId}})
  .then(function(r){return r.json();}).then(function(d){
    var msgs=d.messages||[],el=document.getElementById('vs25-msgs');
    if(msgs.length&&el&&!el.children.length){msgs.slice(-20).forEach(function(m){addMsg(m.role==='user'?'u':'b',m.content,true);});scrl();}
    if(msgs.length){ var last=msgs[msgs.length-1]; _lastMsgTs = last.created_at ? new Date(last.created_at).getTime() : Date.now(); }
  }).catch(function(){});
}

// Pollt neue Mitarbeiter-Antworten (manuelle Admin-Nachrichten) und hängt sie an
function pollNewMessages(){
  if(!chatId) return;
  _safeFetch(API+'/api/widget/history',{headers:{'X-Chat-ID':chatId}})
  .then(function(r){return r.json();}).then(function(d){
    var msgs=d.messages||[];
    msgs.forEach(function(m){
      var ts = m.created_at ? new Date(m.created_at).getTime() : 0;
      // Nur neue Assistenten-Nachrichten (Admin-/KI-Antworten) anhängen
      if(ts > _lastMsgTs && m.role!=='user'){
        addMsg('b', m.content);
        _lastMsgTs = ts;
      }
    });
  }).catch(function(){});
}

function loadFaq(){
  _safeFetch(API+'/api/widget/faq').then(function(r){return r.json();}).then(function(d){
    var bar=document.getElementById('vs25-fqg'); if(!bar) return; bar.innerHTML='';
    (d.faqs||[]).forEach(function(q){
      var btn=document.createElement('button'); btn.className='vs25-chip'; btn.textContent=q;
      btn.onclick=function(){openChat();document.getElementById('vs25-inp').value=q;hideFaq();sendMsg();};
      bar.appendChild(btn);
    });
  }).catch(function(){});
}

function hideFaq(){if(_faqUsed) return;_faqUsed=true;var el=document.getElementById('vs25-fq');if(el)el.style.display='none';}

function sendMsg(){
  if(isTyping||!chatId) return;
  var inp=document.getElementById('vs25-inp'),text=(inp.value||'').trim();
  if(!text) return;
  inp.value='';inp.style.height='auto';
  hideFaq();addMsg('u',text);showTyp(true);
  document.getElementById('vs25-snd').disabled=true;
  _safeFetch(API+'/api/widget/message',{method:'POST',headers:{'Content-Type':'application/json','X-Chat-ID':chatId},body:JSON.stringify({message:text,chatId})})
  .then(function(r){return r.json();}).then(function(d){
    showTyp(false);document.getElementById('vs25-snd').disabled=false;
    if(d.reply) addMsg('b',d.reply);
    _lastMsgTs = Date.now();  // verhindert Doppel-Anzeige beim nächsten Poll
  }).catch(function(){showTyp(false);document.getElementById('vs25-snd').disabled=false;addMsg('b','Bitte erneut versuchen.');});
}

function toggleKI(){
  var tog=document.getElementById('vs25-ki-toggle');
  var isKIon=tog.checked; // true = KI an, false = Mitarbeiter
  _handover=!isKIon;
  if(!chatId) return;

  _safeFetch(API+'/api/widget/handover',{method:'POST',headers:{'Content-Type':'application/json','X-Chat-ID':chatId},
    body:JSON.stringify({chatId,request:_handover})}).catch(function(){});

  if(_handover){
    addMsg('b','👤 Ein Mitarbeiter wurde benachrichtigt und meldet sich bald. Die KI ist pausiert.');
    setStatusUI('manual');
  } else {
    addMsg('b','✅ KI-Support ist wieder aktiv.');
    setStatusUI('online');
  }
}

function setStatusUI(status){
  var dot=document.getElementById('vs25-status-dot');
  var avDot=document.getElementById('vs25-av-dot');
  var sub=document.getElementById('vs25-hdr-sub');
  var tog=document.getElementById('vs25-ki-toggle');

  if(dot){dot.className=status;}
  if(avDot){avDot.className='vs25-av-dot '+(status==='online'?'':''+status);}
  if(sub){
    sub.textContent=status==='online'?'KI Assistent · Online':status==='manual'?'Mitarbeiter angefordert':'KI Offline';
  }
  if(tog&&status!=='offline'){tog.checked=status==='online';}
}

function startStatusPoll(){
  if(_statusInt) clearInterval(_statusInt);
  _statusInt=setInterval(function(){
    if(!chatId) return;
    pollNewMessages();
    _safeFetch(API+'/api/widget/status',{headers:{'X-Chat-ID':chatId}})
    .then(function(r){return r.json();}).then(function(d){setStatusUI(d.status||'online');}).catch(function(){});
  }, 15000);
}

function openChat(){
  if(isOpen) return;isOpen=true;hideInv();_proDone=true;clearTimeout(_proTimer);
  document.getElementById('vs25-pnl').classList.add('on');
  setTimeout(function(){document.getElementById('vs25-inp')?.focus();scrl();},80);
  trackPage();
}
function closeChat(){isOpen=false;document.getElementById('vs25-pnl').classList.remove('on');}
function showInv(){if(_proDone||isOpen) return;document.getElementById('vs25-inv').classList.add('on');_proDone=true;}
function hideInv(){document.getElementById('vs25-inv').classList.remove('on');}

function trackPage(){
  if(!chatId){setTimeout(trackPage,2000);return;}
  _postTrack('/api/widget/activity', {pageUrl:location.href,pageTitle:smartTitle(),chatId});
}

function addMsg(role,text,noScroll){
  var el=document.getElementById('vs25-msgs'); if(!el) return;
  var d=document.createElement('div'); d.className='vs25-msg '+role;
  var t=new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
  var ticks = role === 'u' ? '<span class="vs25-ticks">✓✓</span>' : '';
  d.innerHTML='<div class="vs25-bub">'+esc(text)+'<span class="vs25-ts">'+t+ticks+'</span></div>';
  el.appendChild(d); if(!noScroll) scrl();
}

function showTyp(show){
  isTyping=show;var ex=document.getElementById('vs25-typ');
  if(!show){if(ex)ex.remove();return;}if(ex) return;
  var d=document.createElement('div');d.id='vs25-typ';d.className='vs25-msg b vs25-typ';
  d.innerHTML='<div class="vs25-bub"><span></span><span></span><span></span></div>';
  document.getElementById('vs25-msgs').appendChild(d);scrl();
}

function scrl(){var e=document.getElementById('vs25-msgs');if(e)e.scrollTop=e.scrollHeight;}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');}
function fp(){return btoa([navigator.userAgent,navigator.language,screen.width+'x'+screen.height,Intl.DateTimeFormat().resolvedOptions().timeZone].join('|')).substring(0,32);}

var _lastUrl=location.href;
setInterval(function(){
  if(location.href!==_lastUrl){
    _lastUrl=location.href;
    passiveTrack();        // Update session's last_page (never creates new session)
    if(chatId) trackPage(); // Log activity
    if(!isOpen){_proDone=false;clearTimeout(_proTimer);_proTimer=setTimeout(showInv,28000);}
  }
},1500);

// (1.6.78) Defensive Boot-Strategie. Falls build() einen Fehler wirft,
// loggen wir das in die Browser-Console damit der User Diagnose hat.
function _safeBuild(){
  try {
    build();
    if (window.console && console.log) {
      console.log('%c[VS25-Widget] v1.6.78 widget visible',
                  'color: #4caf50; font-weight: bold');
    }
  } catch (e) {
    if (window.console && console.error) {
      console.error('[VS25-Widget] build() Fehler:', e);
    }
    // Retry nach 200ms (zb falls document.body noch nicht da war)
    setTimeout(function(){
      try { build(); } catch(_) {}
    }, 200);
  }
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',_safeBuild); else _safeBuild();
})();
