import { useState, useRef, useEffect } from "react";

const DEMO_USERS = [];
const DEMO_CLIENTS = [];

const GREETINGS = [
  "יאללה, יום עבודה מוצלח! 💪",
  "הבריכות מחכות לך! 🌊",
  "בוקר טוב, מתחילים! ☀️",
  "כוח כוח! אתה הטוב ביותר ⚡",
  "שיהיה יום חלק ויעיל 🏊",
  "קדימה, הפועלים הטובים ביותר! 🔧",
  "טיפול מעולה מתחיל עכשיו! ✨",
  "יום נהדר לפניך! 🌟",
  "לא היה לך קשה בבוקר ? אתה בבעיה !! 💚",
  "כל יום טיפול = יום מוצלח! 👏",
  "אתה החומר של האלופים! 🏆",
  "איפה גו 🏆",
];

const GREETINGS_BY_USER = {
  "or": [
    "איפה גו? 🏆",
    "קום תעבוד כבר! 😂",
    "הבריכות בוכות עליך! 🌊",
    "היה לך קשה בבוקר ?! 💪",
  ],
  "c": [
    "יאללה פרנקו! 💪",
    "בוקר טוב גאון! ☀️",
    "הכי טוב בעסק! 🏊",
  ],
};

const getDailyGreeting = (username) => {
  const key = String(username || "").trim().toLowerCase();
  const list = GREETINGS_BY_USER[key] || GREETINGS;
  return list[Math.floor(Math.random() * list.length)];
};

const CITY = "ישראל";
const wazeUrl = (a) => `https://waze.com/ul?q=${encodeURIComponent(a+", "+CITY)}&navigate=yes`;
const todayStr = () => new Date().toISOString().slice(0,10);
const fmtDate = s => { if(!s)return""; const[y,m,d]=s.split("-"); return`${d}/${m}/${y}`; };
const calcNext = (s,days=90) => { if(!s)return null; const d=new Date(s); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); };
const nowStr = () => new Date().toLocaleString("he-IL");

function getCompany() {
  try { return JSON.parse(localStorage.getItem("galileo_company")||"{}"); } catch { return {}; }
}
function saveCompany(data) {
  localStorage.setItem("galileo_company", JSON.stringify(data));
}

const FIXED_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzKKk_M0noXnKrniCsBDO4dAUWPDkpK8YH0QhhpJQfSaCyfqmAQlLJOb-sN5atSj5nj/exec";
const APP_VERSION = "v2.6 · 08.05.2026";
const DEFAULT_SUPER_PASS = "039076914";
const ONESIGNAL_APP_ID = "dc1af269-2502-41a4-89d5-a3aa8d5be956";
const ONESIGNAL_REST_KEY = import.meta.env.VITE_ONESIGNAL_REST_KEY || "";

function getSuperPass() { return localStorage.getItem("galileo_super_pass")||DEFAULT_SUPER_PASS; }
function setSuperPass(p) { localStorage.setItem("galileo_super_pass",p); }
const MGMT_SHEET_ID = "17jNBWSAkW17zfz4o2gY3wOsERa3_NAgSZ3b9HPkNspk";
const PUSH_SCRIPT_ACTIONS = [
  "sendOneSignalToUser",
  "sendOneSignal",
  "sendOneSignalNotification",
  "sendPushNotification",
  "sendPushToUser",
  "sendNotification",
  "sendNotificationToUser",
  "sendUserNotification",
  "sendPush",
  "pushToUser",
  "notifyUser",
];

async function mgmtCall(action, payload={}) {
  try {
    const r = await fetch(FIXED_SCRIPT_URL,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({action, sheetId: MGMT_SHEET_ID, ...payload})});
    return await r.json();
  } catch { return null; }
}
function getScriptUrl() {
  const c = getCompany();
  return c.scriptUrl || localStorage.getItem("galileo_script_url") || FIXED_SCRIPT_URL;
}
async function sheetCall(action, payload={}) {
  try {
    const company = getCompany();
    const sheetId = company.sheetId || localStorage.getItem("galileo_sheet_id") || "";
    const r = await fetch(getScriptUrl(),{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({action, sheetId, ...payload})});
    return await r.json();
  } catch { return null; }
}

async function postScriptAction(scriptUrl, action, payload={}) {
  try {
    const company = getCompany();
    const sheetId = company.sheetId || localStorage.getItem("galileo_sheet_id") || "";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(scriptUrl, {
      method: "POST",
      headers: {"Content-Type":"text/plain"},
      body: JSON.stringify({action, sheetId, ...payload}),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await r.text();
    try { return JSON.parse(text); }
    catch {
      const clean = text.trim().toLowerCase();
      if (["ok","sent","success","true"].includes(clean)) return {success:true, raw:text};
      return {success:false, raw:text};
    }
  } catch(e) {
    console.warn("Script action failed:", action, e);
    return null;
  }
}

function pushScriptResponseOk(res) {
  if (!res) return false;
  if (res.success === true || res.sent === true || res.ok === true) return true;
  if (Number(res.recipients || res.recipientCount || res.sentCount || 0) > 0) return true;
  if (res.id || res.notificationId) return true;
  if (typeof res.raw === "string" && /ok|sent|success/i.test(res.raw)) return true;
  return false;
}

async function sendPushViaScript(title, message, externalUserId) {
  const payload = {
    title,
    heading: title,
    headings: {"en": title, "he": title},
    message,
    body: message,
    text: message,
    content: message,
    contents: {"en": message, "he": message},
    externalUserId,
    externalId: externalUserId,
    external_id: externalUserId,
    userId: externalUserId,
    username: externalUserId,
    recipient: externalUserId,
    to: externalUserId,
    targetUser: externalUserId,
    include_aliases: {external_id: [externalUserId]},
  };
  const urls = [...new Set([getScriptUrl(), FIXED_SCRIPT_URL].filter(Boolean))];

  for (const action of PUSH_SCRIPT_ACTIONS) {
    for (const url of urls) {
      const res = await postScriptAction(url, action, payload);
      if (pushScriptResponseOk(res)) {
        console.log("OneSignal sent via script:", action, res);
        return true;
      }

      if (res?.error || res?.errors) {
        console.warn("OneSignal script error:", action, res.error || res.errors);
      }
    }
  }

  return false;
}

async function sendOneSignalToUser(title, message, externalUserId) {
  if (!externalUserId) { console.warn("OneSignal: external user id missing; targeted push not sent"); return false; }

  const sentByScript = await sendPushViaScript(title, message, externalUserId);
  if (sentByScript) return true;

  if (!ONESIGNAL_REST_KEY) {
    console.warn("OneSignal: REST KEY missing and script push failed");
    return false;
  }

  try {
    const payload = {
      app_id: ONESIGNAL_APP_ID,
      contents: {"en": message},
      headings: {"en": title},
      target_channel: "push",
    };
    payload.include_aliases = { external_id: [externalUserId] };
    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {"Content-Type":"application/json","Authorization":"Bearer "+ONESIGNAL_REST_KEY},
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.errors) { console.warn("OneSignal API error:", data.errors); return false; }
    if (!data.recipients || data.recipients < 1) { console.warn("OneSignal sent to 0 recipients:", data); return false; }
    console.log("OneSignal sent:", data.id, "recipients:", data.recipients);
    return true;
  } catch(e) { console.warn("OneSignal fetch error:", e); return false; }
}

function initOneSignal() {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.OneSignalInitialized) return Promise.resolve(true);
  if (window.OneSignalReadyPromise) return window.OneSignalReadyPromise;

  window.OneSignalReadyPromise = new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const init = async (OneSignal) => {
      try {
        if (!window.OneSignalInitialized) {
          await OneSignal.init({
            appId: ONESIGNAL_APP_ID,
            allowLocalhostAsSecureOrigin: true,
            notifyButton: { enable: false },
          });
          window.OneSignalInitialized = true;
          console.log("OneSignal ready");
        }
        finish(true);
      } catch (e) {
        console.warn("OneSignal init error:", e);
        const msg = String(e?.message || e || "").toLowerCase();
        if (msg.includes("already") || msg.includes("initialized")) {
          window.OneSignalInitialized = true;
          finish(true);
        } else {
          finish(false);
        }
      }
    };

    if (window.OneSignal?.init) {
      init(window.OneSignal);
      return;
    }

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(init);

    if (!window.OneSignalLoaded) {
      window.OneSignalLoaded = true;
      const script = document.createElement("script");
      script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
      script.defer = true;
      script.onerror = () => finish(false);
      document.head.appendChild(script);
    }

    setTimeout(() => finish(!!window.OneSignalInitialized), 8000);
  });

  return window.OneSignalReadyPromise;
}

async function runOneSignal(callback) {
  const ready = await initOneSignal();
  if (!ready) return false;

  if (window.OneSignal?.login || window.OneSignal?.Notifications) {
    try { return await callback(window.OneSignal); }
    catch (e) { console.warn("OneSignal action error:", e); return false; }
  }

  if (!window.OneSignalDeferred) return false;
  return new Promise((resolve) => {
    window.OneSignalDeferred.push(async function(OneSignal) {
      try { resolve(await callback(OneSignal)); }
      catch (e) { console.warn("OneSignal deferred action error:", e); resolve(false); }
    });
  });
}

async function loginOneSignalUser(username) {
  if (!username) return false;
  return runOneSignal(async (OneSignal) => {
    await OneSignal.login(username);
    console.log("OneSignal external_id:", username);
    return true;
  });
}

const haptic = (t="light") => navigator.vibrate?.({light:30,medium:50,success:[30,50,30]}[t]||30);

function Press({children,onClick,style={},disabled=false,tag="div"}) {
  const [p,setP] = useState(false);
  const Tag = tag;
  return (
    <Tag onPointerDown={()=>{if(!disabled){setP(true);haptic();}}} onPointerUp={()=>setP(false)}
      onPointerLeave={()=>setP(false)} onClick={disabled?undefined:onClick}
      style={{...style,transform:p?"scale(0.96)":"scale(1)",transition:"transform 0.12s cubic-bezier(0.34,1.56,0.64,1)",cursor:disabled?"not-allowed":"pointer",userSelect:"none",WebkitTapHighlightColor:"transparent"}}>
      {children}
    </Tag>
  );
}

function Toast({msg,visible}) {
  return (
    <div style={{position:"fixed",bottom:96,right:"50%",transform:`translateX(50%) translateY(${visible?0:16}px)`,background:"#0d47a1",color:"#fff",borderRadius:99,padding:"10px 22px",fontSize:13,fontWeight:700,zIndex:999,opacity:visible?1:0,transition:"all 0.35s cubic-bezier(0.34,1.56,0.64,1)",pointerEvents:"none",boxShadow:"0 8px 24px rgba(13,71,161,0.4)",whiteSpace:"nowrap"}}>
      {msg}
    </div>
  );
}

function BottomSheet({children,onClose,title}) {
  const [vis,setVis] = useState(false);
  useEffect(()=>{setTimeout(()=>setVis(true),10);},[]);
  const close = () => { setVis(false); setTimeout(onClose,350); };
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div onClick={close} style={{position:"absolute",inset:0,background:`rgba(0,0,0,${vis?0.45:0})`,transition:"background 0.3s",backdropFilter:"blur(4px)"}}/>
      <div style={{position:"relative",background:"#fff",borderRadius:"24px 24px 0 0",transform:vis?"translateY(0)":"translateY(100%)",transition:"transform 0.4s cubic-bezier(0.34,1.2,0.64,1)",maxHeight:"85vh",overflowY:"auto"}}>
        <div style={{padding:"16px 20px 8px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #f0f4f8",position:"sticky",top:0,background:"#fff",zIndex:1}}>
          <h2 style={{margin:0,fontSize:17,fontWeight:900,color:"#0d47a1"}}>{title}</h2>
          <Press onClick={close} style={{width:32,height:32,borderRadius:"50%",background:"#f0f4f8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"#546e7a"}}>✕</Press>
        </div>
        <div style={{padding:"16px 20px 32px"}}>{children}</div>
      </div>
    </div>
  );
}

const C = {blue:"#1565c0",lightBlue:"#42a5f5",bg:"#f0f7ff",white:"#fff",card:"#fff",text:"#1a237e",muted:"#90a4ae",border:"#e3f2fd",green:"#2e7d32",orange:"#e65100",red:"#c62828"};
const inp = {width:"100%",background:"#f5f9ff",border:"2px solid #e3f2fd",borderRadius:14,padding:"12px 14px",fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"'Plus Jakarta Sans',sans-serif",color:C.text};
const sel = {...inp,background:"#f5f9ff"};
const card = (extra={}) => ({background:C.white,borderRadius:16,padding:16,boxShadow:"0 2px 12px rgba(0,0,0,0.06)",border:"1px solid "+C.border,...extra});

function Badge({label,col="#1565c0",bg}) {
  return <span style={{background:bg||col+"18",color:col,border:`1px solid ${col}33`,borderRadius:99,padding:"3px 11px",fontSize:11,fontWeight:800}}>{label}</span>;
}

function Sec({icon,title,children}) {
  return (
    <div style={{marginBottom:22}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <span style={{fontSize:16}}>{icon}</span>
        <span style={{fontSize:11,fontWeight:800,color:C.muted,letterSpacing:"0.12em",textTransform:"uppercase"}}>{title}</span>
        <div style={{flex:1,height:1,background:"linear-gradient(90deg,#bbdefb,transparent)"}}/>
      </div>
      {children}
    </div>
  );
}

function PBar({done,total}) {
  const pct = total>0?Math.round((done/total)*100):0;
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.muted,marginBottom:6}}>
        <span>{done}/{total} משימות</span>
        <span style={{color:C.blue,fontWeight:800}}>{pct}%</span>
      </div>
      <div style={{height:8,background:C.border,borderRadius:99,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${C.blue},${C.lightBlue})`,borderRadius:99,transition:"width 0.5s cubic-bezier(0.34,1.2,0.64,1)"}}/>
      </div>
    </div>
  );
}

function SliderField({label,min,max,step=0.1,value,onChange,optimal,unit="",warnAbove,warnBelow,large=false}) {
  const pct=((value-min)/(max-min))*100;
  let col=C.green,txt="תקין";
  if(warnAbove&&value>warnAbove){col=C.red;txt="⚠️ גבוה";}
  else if(warnBelow&&value<warnBelow){col=C.orange;txt="⚠️ נמוך";}
  else if(optimal&&Math.abs(value-optimal)<0.3){col=C.blue;txt="✓ אופטימלי";}
  const showStatus = !!(warnAbove||warnBelow||optimal);
  const trackH = large ? 28 : 8;
  const sliderRef = useRef();
  const trackRef = useRef();
  const dragRef = useRef({active:false,sliding:false,startX:0,startY:0,pointerId:null});
  const [manualMode,setManualMode] = useState(false);
  const snap = (n) => Math.round(n / step) * step;
  const clamp = (n) => Math.min(max, Math.max(min, n));
  const normalize = (n) => Number(clamp(snap(Number(n)||0)).toFixed(3));
  const fineStep = step || 0.1;
  const coarseStep = Math.max(fineStep * 10, 1);
  const updateBy = (delta) => onChange(normalize(Number(value||0) + delta));
  const setValueFromPointer = (clientX) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect?.width) return;
    const raw = min + ((clientX - rect.left) / rect.width) * (max - min);
    onChange(normalize(raw));
  };
  const startSlide = (e) => {
    dragRef.current = {active:true,sliding:e.pointerType==="mouse",startX:e.clientX,startY:e.clientY,pointerId:e.pointerId};
    if (e.pointerType === "mouse") {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setValueFromPointer(e.clientX);
    }
  };
  const moveSlide = (e) => {
    const drag = dragRef.current;
    if (!drag.active) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.sliding) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        dragRef.current = {active:false,sliding:false,startX:0,startY:0,pointerId:null};
        return;
      }
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
      drag.sliding = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    e.preventDefault();
    setValueFromPointer(e.clientX);
  };
  const endSlide = (e) => {
    e.currentTarget.releasePointerCapture?.(dragRef.current.pointerId);
    dragRef.current = {active:false,sliding:false,startX:0,startY:0,pointerId:null};
  };
  return (
    <div style={{marginBottom:6}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{fontWeight:700,fontSize:large?18:14,color:C.text}}>{label}</span>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {showStatus&&<span style={{background:col+"15",color:col,borderRadius:99,padding:"3px 10px",fontSize:large?13:11,fontWeight:800,border:`1px solid ${col}30`}}>{txt}</span>}
          <span style={{color:showStatus?col:C.blue,fontSize:large?28:22,fontWeight:900,minWidth:large?70:50,textAlign:"right"}}>{value}{unit}</span>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
        {[[false,"\u05e1\u05dc\u05d9\u05d9\u05d3\u05e8"],[true,"\u05d4\u05e7\u05dc\u05d3\u05d4"]].map(([mode,labelText])=>(
          <Press key={String(mode)} onClick={()=>setManualMode(mode)}
            style={{padding:"8px 10px",borderRadius:10,textAlign:"center",fontSize:12,fontWeight:800,background:manualMode===mode?C.blue:"#f0f4f8",color:manualMode===mode?"#fff":C.muted}}>
            {labelText}
          </Press>
        ))}
      </div>
      <div dir="ltr" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:manualMode?10:8}}>
        {[[-coarseStep,`-${coarseStep}`],[-fineStep,`-${fineStep}`],[fineStep,`+${fineStep}`],[coarseStep,`+${coarseStep}`]].map(([delta,labelText])=>(
          <Press key={labelText} onClick={()=>updateBy(delta)}
            style={{padding:"8px 0",borderRadius:10,background:"#f5f9ff",border:`1px solid ${C.border}`,color:C.blue,fontSize:12,fontWeight:900,textAlign:"center"}}>
            {labelText}
          </Press>
        ))}
      </div>
      {manualMode&&(
        <input type="number" inputMode="decimal" min={min} max={max} step={step} value={value}
          onChange={e=>onChange(normalize(e.target.value))}
          onBlur={e=>onChange(normalize(e.target.value))}
          style={{...inp,marginBottom:10,textAlign:"center",fontSize:large?24:18,fontWeight:900,color:C.blue}}
        />
      )}
      <div ref={trackRef} dir="ltr" onPointerDown={startSlide} onPointerMove={moveSlide} onPointerUp={endSlide} onPointerCancel={endSlide} onPointerLeave={endSlide} style={{position:"relative",height:trackH,borderRadius:99,background:C.border,marginBottom:6,touchAction:"pan-y"}}>
        <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${pct}%`,borderRadius:99,background:`linear-gradient(90deg,${C.blue},${col})`,transition:"width 0.15s"}}/>
        {optimal&&<div style={{position:"absolute",top:-4,left:`${((optimal-min)/(max-min))*100}%`,width:large?3:2,height:large?36:16,background:C.blue,borderRadius:2,transform:"translateX(-50%)"}}/>}
        <input ref={sliderRef} type="range" min={min} max={max} step={step} value={value}
          onChange={e=>onChange(parseFloat(e.target.value))}
          dir="ltr"
          style={{position:"absolute",top:large?-16:-8,left:0,width:"100%",opacity:0,cursor:"pointer",height:large?60:24,touchAction:"pan-y",pointerEvents:"none",WebkitAppearance:"none"}}/>
      </div>
      <div dir="ltr" style={{display:"flex",justifyContent:"space-between",fontSize:large?12:10,color:C.muted}}>
        <span>{min}</span>{optimal&&<span style={{color:C.blue}}>אופטימלי {optimal}</span>}<span>{max}</span>
      </div>
    </div>
  );
}

function CollapsibleSlider({label,min,max,step,unit,warnAbove,warnBelow,optimal,val,fn,large,expandKey,form,sf}) {
  const isOpen = !!form[expandKey];
  const hasValue = val > 0;
  return (
    <div style={{...card({marginBottom:8})}}>
      <Press onClick={()=>sf(expandKey,!isOpen)}
        style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontWeight:700,fontSize:14,color:C.text}}>{label}</span>
          {hasValue&&!isOpen&&<span style={{background:"#e3f2fd",color:C.blue,borderRadius:99,padding:"2px 10px",fontSize:12,fontWeight:800}}>{val}{unit}</span>}
        </div>
        <span style={{fontSize:16,color:C.blue,display:"inline-block",transform:isOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▾</span>
      </Press>
      {isOpen&&<SliderField label={label} min={min} max={max} step={step} value={val} onChange={fn} unit={unit} warnAbove={warnAbove} warnBelow={warnBelow} optimal={optimal} large={large}/>}
    </div>
  );
}

function ToggleField({label,value,onChange}) {
  return (
    <div style={{...card(),marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{fontWeight:700,fontSize:14,color:C.text}}>{label}</span>
      <div style={{display:"flex",gap:6}}>
        {["תקין","לא תקין"].map(o=>(
          <Press key={o} onClick={()=>onChange(o)}
            style={{padding:"7px 14px",borderRadius:99,fontSize:12,fontWeight:800,background:value===o?(o==="תקין"?C.blue:C.red):"#f0f4f8",color:value===o?"#fff":C.muted,boxShadow:value===o?`0 4px 12px ${o==="תקין"?"rgba(21,101,192,0.3)":"rgba(198,40,40,0.3)"}`:  "none",transition:"all 0.2s"}}>
            {o}
          </Press>
        ))}
      </div>
    </div>
  );
}

function QRScanner({ onResult, onClose }) {
  const videoRef = useRef();
  const canvasRef = useRef();
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const rafRef = useRef();
  useEffect(() => {
    let stream;
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setScanning(true);
        scan();
      } catch { setError("לא ניתן לגשת למצלמה"); }
    };
    const scan = () => {
      if (!videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      rafRef.current = requestAnimationFrame(scan);
    };
    start();
    return () => { cancelAnimationFrame(rafRef.current); stream?.getTracks().forEach(t => t.stop()); };
  }, []);
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onResult(file.name.replace(/\.[^.]+$/, ""));
  };
  return (
    <div style={{position:"fixed",inset:0,background:"#000",zIndex:300,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <div style={{position:"absolute",top:16,right:16,zIndex:10}}>
        <Press onClick={onClose} style={{width:40,height:40,borderRadius:"50%",background:"rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:18}}>✕</Press>
      </div>
      <p style={{color:"rgba(255,255,255,0.7)",fontSize:13,fontWeight:600,marginBottom:16,textAlign:"center",padding:"0 20px"}}>כוון את המצלמה ל-QR Code של הלקוח</p>
      <div style={{position:"relative",width:280,height:280,marginBottom:24}}>
        <video ref={videoRef} style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:16}} playsInline muted/>
        <canvas ref={canvasRef} style={{display:"none"}}/>
        <div style={{position:"absolute",inset:0,borderRadius:16,border:"2px solid rgba(255,255,255,0.3)"}}>
          {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h])=>(
            <div key={v+h} style={{position:"absolute",[v]:0,[h]:0,width:30,height:30,borderTop:v==="top"?"3px solid #42a5f5":"none",borderBottom:v==="bottom"?"3px solid #42a5f5":"none",borderLeft:h==="left"?"3px solid #42a5f5":"none",borderRight:h==="right"?"3px solid #42a5f5":"none",borderRadius:v==="top"&&h==="left"?"8px 0 0 0":v==="top"&&h==="right"?"0 8px 0 0":v==="bottom"&&h==="left"?"0 0 0 8px":"0 0 8px 0"}}/>
          ))}
          {scanning && <div style={{position:"absolute",top:"50%",left:0,right:0,height:2,background:"rgba(66,165,245,0.7)",animation:"scanLine 2s linear infinite"}}/>}
        </div>
      </div>
      {error && <p style={{color:"#ef5350",fontSize:13,marginBottom:16}}>{error}</p>}
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
        <p style={{color:"rgba(255,255,255,0.5)",fontSize:12}}>או בחר תמונה של QR:</p>
        <label style={{background:"rgba(255,255,255,0.15)",borderRadius:12,padding:"10px 20px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>
          📁 העלה תמונה
          <input type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/>
        </label>
      </div>
      <style>{`@keyframes scanLine{0%{top:10%}50%{top:90%}100%{top:10%}}#onesignal-bell-container{display:none!important}`}</style>
    </div>
  );
}

function getLicense() { try { return JSON.parse(localStorage.getItem("galileo_license")||"{}"); } catch { return {}; } }
function saveLicense(data) { localStorage.setItem("galileo_license", JSON.stringify(data)); }

function LicenseScreen({ onDone, onSuperAdmin }) {
  const [key, setKey] = useState(getLicense().key||"");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const formatKey = (v) => {
    const clean = v.toUpperCase().replace(/[^A-Z0-9]/g,"");
    const parts = [clean.slice(0,3),clean.slice(3,7),clean.slice(7,11),clean.slice(11,15)].filter(Boolean);
    return parts.join("-");
  };
  const validate = async () => {
    if(!key.trim()){setErr("נא להזין מפתח רישיון");return;}
    setLoading(true); setErr("");
    const res = await mgmtCall("validateLicense",{key:key.trim()});
    if(res?.valid){
      saveLicense({key:key.trim(),company:res.company,sheetId:res.sheetId,plan:res.plan,status:res.status,expiry:res.expiry,adminEmail:res.adminEmail||"",logoUrl:res.logoUrl||""});
      saveCompany({name:res.company,sheetId:res.sheetId,scriptUrl:FIXED_SCRIPT_URL,adminEmail:res.adminEmail||"",logoUrl:res.logoUrl||""});
      if(res.sheetId) localStorage.setItem("galileo_sheet_id", res.sheetId);
      setLoading(false); onDone();
    } else {
      setErr(res?.reason||"מפתח לא תקין"); setLoading(false);
    }
  };
  return (
    <div dir="rtl" style={{minHeight:"100vh",background:`linear-gradient(145deg,#0d47a1,#1565c0,#1976d2)`,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}#onesignal-bell-container{display:none!important}`}</style>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{fontSize:64,marginBottom:12,filter:"drop-shadow(0 0 24px rgba(255,255,255,0.3))"}}>🌊</div>
          <h1 style={{color:"#fff",fontSize:26,fontWeight:900,margin:"0 0 6px",letterSpacing:"-0.5px"}}>POOLMANG.BY.OR2026</h1>
          <p style={{color:"rgba(255,255,255,0.55)",fontSize:14,margin:0}}>מערכת ניהול בריכות מקצועית</p>
        </div>
        <div style={{background:"rgba(255,255,255,0.1)",backdropFilter:"blur(20px)",borderRadius:24,padding:28,border:"1px solid rgba(255,255,255,0.2)",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
          <div style={{textAlign:"center",marginBottom:24}}>
            <div style={{fontSize:32,marginBottom:8}}>🔑</div>
            <h2 style={{color:"#fff",fontSize:18,fontWeight:900,margin:"0 0 6px"}}>הזן מפתח רישיון</h2>
            <p style={{color:"rgba(255,255,255,0.55)",fontSize:13,margin:0}}>קיבלת מפתח? הזן אותו כאן</p>
          </div>
          <input value={key} onChange={e=>{setKey(formatKey(e.target.value));setErr("");}}
            placeholder="PSP-XXXX-XXXX-XXXX" maxLength={19} onKeyDown={e=>e.key==="Enter"&&validate()}
            style={{width:"100%",background:"rgba(255,255,255,0.15)",border:"2px solid rgba(255,255,255,0.3)",borderRadius:14,padding:"14px 16px",fontSize:18,outline:"none",color:"#fff",fontFamily:"'Courier New',monospace",textAlign:"center",letterSpacing:"0.15em",caretColor:"#fff",backdropFilter:"blur(8px)",boxSizing:"border-box"}}/>
          {err&&<div style={{background:"rgba(198,40,40,0.3)",borderRadius:10,padding:"10px 14px",marginTop:12,color:"#ffcdd2",fontSize:13,fontWeight:700,textAlign:"center",border:"1px solid rgba(198,40,40,0.4)"}}>{err}</div>}
          <Press onClick={validate} style={{marginTop:16,padding:16,borderRadius:14,background:loading?"rgba(255,255,255,0.1)":"linear-gradient(135deg,rgba(255,255,255,0.25),rgba(255,255,255,0.15))",color:"#fff",fontWeight:900,fontSize:16,textAlign:"center",border:"1px solid rgba(255,255,255,0.3)",boxShadow:loading?"none":"0 6px 20px rgba(0,0,0,0.2)"}}>
            {loading?"⏳ בודק מפתח...":"אמת מפתח →"}
          </Press>
        </div>
        <p style={{textAlign:"center",fontSize:11,color:"rgba(255,255,255,0.25)",marginTop:16,letterSpacing:"0.05em"}}>POOLMANG.BY.OR2026 {APP_VERSION}</p>
      </div>
      <div onClick={onSuperAdmin} style={{position:"fixed",bottom:16,left:16,fontSize:28,opacity:0.22,padding:10,zIndex:10,WebkitTapHighlightColor:"transparent",cursor:"pointer"}}>⚙️</div>
    </div>
  );
}

const blank = () => ({
  reportDate:todayStr(),client:"",chlorine:1.5,ph:7.4,salt:3.5,chlora:0,hth:0,phUp:0,acidLiters:0,
  elModel:"",elSerial:"",elDate:"",waterLevel:"תקין",clarity:"תקין",fat:"תקין",flow:"תקין",
  acid:false,phUpSupply:false,saltPkg:false,saltBags:1,supplyStatus:"",supplyNote:"",poolStatus:"מאוזנת",customStatusText:"",restrictedUntil:"",
  notes:"",photos:[],clientLocked:false,adminReport:false,
});

function generateLicenseKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (n) => Array.from({length:n},()=>chars[Math.floor(Math.random()*chars.length)]).join("");
  return `PSP-${seg(4)}-${seg(4)}-${seg(4)}`;
}

function LicensesTab({C2, inp2, showMsg}) {
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newLic, setNewLic] = useState({company:"",sheetId:"",plan:"PRO",expiry:"",adminEmail:""});
  const [generated, setGenerated] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(()=>{ loadLicenses(); },[]);

  const initOneSignal = () => {
    if(typeof window==="undefined" || window.OneSignalLoaded) return;
    window.OneSignalLoaded = true;
    window.OneSignal = window.OneSignal || [];
    const script = document.createElement("script");
    script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
    script.defer = true;
    script.onload = () => {
      window.OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        allowLocalhostAsSecureOrigin: true,
        notifyButton: { enable: false },
      }).then(() => {
        console.log("OneSignal ready");
      }).catch(e => console.warn("OneSignal init error:", e));
    };
    document.head.appendChild(script);
  };

  const loadLicenses = async () => { setLoading(true); const res = await mgmtCall("getLicenses"); if(res?.licenses) setLicenses(res.licenses); setLoading(false); };
  const createLicense = async () => {
    if(!newLic.company||!newLic.sheetId){showMsg("⚠️ מלא שם חברה ו-Sheet ID");return;}
    const key = generateLicenseKey();
    await mgmtCall("saveLicense",{license:[key, newLic.company, newLic.sheetId, newLic.plan, "פעיל", newLic.expiry||"", newLic.adminEmail||""]});
    setGenerated(key); setNewLic({company:"",sheetId:"",plan:"PRO",expiry:"",adminEmail:""}); loadLicenses();
  };
  const updateLicenseStatus = async (rowIndex, status) => { await mgmtCall("updateLicenseStatus",{rowIndex, status}); loadLicenses(); showMsg(`✅ סטטוס עודכן ל${status}`); };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:800,color:C2.muted,letterSpacing:"0.1em",textTransform:"uppercase"}}>{licenses.length} רישיונות</div>
        <Press onClick={()=>{setShowForm(!showForm);setGenerated("");}} style={{padding:"8px 16px",borderRadius:99,background:showForm?"#ffebee":`linear-gradient(135deg,${C2.blue},#42a5f5)`,color:showForm?C2.red:"#fff",fontWeight:800,fontSize:12,boxShadow:showForm?"none":"0 4px 12px rgba(21,101,192,0.3)"}}>
          {showForm?"✕ ביטול":"🔑 רישיון חדש"}
        </Press>
      </div>
      {showForm&&(
        <div style={{background:C2.white,borderRadius:16,padding:16,marginBottom:16,border:`1px solid ${C2.border}`}}>
          <div style={{fontWeight:800,fontSize:14,color:C2.text,marginBottom:14}}>רישיון חדש</div>
          {[["company","שם חברה *"],["sheetId","Google Sheet ID *"],["adminEmail","מייל אדמין"]].map(([k,lbl])=>(
            <div key={k} style={{marginBottom:10}}>
              <label style={{fontSize:11,fontWeight:700,color:C2.muted,display:"block",marginBottom:4}}>{lbl}</label>
              <input value={newLic[k]||""} onChange={e=>setNewLic(p=>({...p,[k]:e.target.value}))} style={inp2} placeholder={lbl}/>
            </div>
          ))}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:C2.muted,display:"block",marginBottom:4}}>תוכנית</label>
              <select value={newLic.plan} onChange={e=>setNewLic(p=>({...p,plan:e.target.value}))} style={inp2}><option>PRO</option><option>Basic</option></select>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:C2.muted,display:"block",marginBottom:4}}>תוקף עד</label>
              <input type="date" value={newLic.expiry||""} onChange={e=>setNewLic(p=>({...p,expiry:e.target.value}))} style={inp2}/>
            </div>
          </div>
          <Press onClick={createLicense} style={{padding:"12px",borderRadius:12,background:`linear-gradient(135deg,${C2.blue},#42a5f5)`,color:"#fff",fontWeight:800,fontSize:14,textAlign:"center",marginBottom:generated?12:0}}>🔑 צור מפתח רישיון</Press>
          {generated&&(
            <div style={{background:"#e8f5e9",borderRadius:12,padding:16,border:"1px solid #c8e6c9",textAlign:"center",marginTop:12}}>
              <div style={{fontSize:11,fontWeight:700,color:C2.green,marginBottom:8}}>✅ שלח ללקוח:</div>
              <div style={{fontFamily:"monospace",fontSize:20,fontWeight:900,color:C2.text,letterSpacing:"0.1em",marginBottom:10}}>{generated}</div>
              <Press onClick={()=>{ navigator.clipboard?.writeText(generated); showMsg("📋 הועתק!"); }} style={{background:C2.green,color:"#fff",borderRadius:99,padding:"8px 20px",fontSize:13,fontWeight:700,display:"inline-block"}}>📋 העתק מפתח</Press>
            </div>
          )}
        </div>
      )}
      {loading&&<div style={{textAlign:"center",padding:32,color:C2.muted}}>⏳ טוען...</div>}
      {!loading&&licenses.length===0&&<div style={{background:C2.white,borderRadius:16,padding:32,textAlign:"center",color:C2.muted}}><div style={{fontSize:32,marginBottom:8}}>🔑</div><div style={{fontWeight:700}}>אין רישיונות עדיין</div></div>}
      {licenses.map((lic,i)=>{
        const [key,company,sheetId,plan,status,expiry] = lic;
        return (
          <div key={i} style={{background:C2.white,borderRadius:16,padding:16,marginBottom:10,border:`1px solid ${status==="מושהה"?C2.red+"33":C2.border}`,boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div><div style={{fontWeight:900,fontSize:15,color:C2.text}}>{company}</div><div style={{fontFamily:"monospace",fontSize:11,color:C2.muted,marginTop:3}}>{key}</div></div>
              <span style={{background:plan==="PRO"?"#e3f2fd":"#f3e5f5",color:plan==="PRO"?C2.blue:"#6a1b9a",borderRadius:99,padding:"4px 10px",fontSize:11,fontWeight:800}}>{plan}</span>
            </div>
            <div style={{fontSize:11,color:C2.muted,marginBottom:10}}>📅 תוקף: {expiry||"—"}</div>
            <div style={{display:"flex",gap:6}}>
              {["פעיל","מושהה"].map(s=>(
                <Press key={s} onClick={()=>updateLicenseStatus(i+2,s)} style={{padding:"6px 14px",borderRadius:99,fontSize:12,fontWeight:800,background:(status||"פעיל")===s?(s==="פעיל"?"#e8f5e9":"#ffebee"):"#f0f4f8",color:(status||"פעיל")===s?(s==="פעיל"?C2.green:C2.red):C2.muted}}>
                  {s==="פעיל"?"✅ פעיל":"⛔ מושהה"}
                </Press>
              ))}
              <Press onClick={()=>{ navigator.clipboard?.writeText(key); showMsg("📋 מפתח הועתק!"); }} style={{padding:"6px 14px",borderRadius:99,fontSize:12,fontWeight:800,background:"#e3f2fd",color:C2.blue}}>📋 העתק</Press>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SuperAdminScreen({ onClose }) {
  const [pass, setPass] = useState("");
  const [auth, setAuth] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("issues");
  const [clients, setClients] = useState([]);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [vis, setVis] = useState(false);
  const [dateFilter, setDateFilter] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [passMsg, setPassMsg] = useState("");
  const [editClient, setEditClient] = useState(null);
  const [newClient, setNewClient] = useState({name:"",contact:"",phone:"",email:"",plan:"PRO",status:"פעיל",sheetId:"",notes:""});
  const [showAddClient, setShowAddClient] = useState(false);
  const [issueNote, setIssueNote] = useState({});
  const [saving, setSaving] = useState(false);
  const [toast2, setToast2] = useState("");

  useEffect(()=>{ setTimeout(()=>setVis(true),10); },[]);
  const close = () => { setVis(false); setTimeout(onClose,350); haptic("medium"); };
  const showMsg = (m) => { setToast2(m); setTimeout(()=>setToast2(""),2500); };
  const login = () => { if(pass===getSuperPass()){ setAuth(true); loadData(); haptic("success"); } else { setErr("סיסמה שגויה"); haptic("medium"); } };
  const loadData = async () => { setLoading(true); const [cRes, iRes] = await Promise.all([mgmtCall("getMgmtClients"), mgmtCall("getMgmtIssues")]); if(cRes?.clients) setClients(cRes.clients); if(iRes?.issues) setIssues(iRes.issues); setLoading(false); };
  const saveClient = async (row) => { setSaving(true); await mgmtCall("saveMgmtClient", { row }); await loadData(); setSaving(false); showMsg("✅ נשמר"); haptic("success"); };
  const deleteClient = async (rowIndex) => { if(!window.confirm("למחוק לקוח זה?")) return; setSaving(true); await mgmtCall("deleteMgmtClient", { rowIndex }); await loadData(); setSaving(false); showMsg("🗑️ לקוח נמחק"); };
  const updateClientStatus = async (rowIndex, status) => { setSaving(true); await mgmtCall("updateMgmtClientStatus", { rowIndex, status }); await loadData(); setSaving(false); showMsg("✅ עודכן"); };
  const updateIssueStatus = async (idx, newStatus) => { const updated = [...issues]; updated[idx] = [...updated[idx]]; updated[idx][5] = newStatus; setIssues(updated); await mgmtCall("updateMgmtIssueStatus", { rowIndex: idx+2, status: newStatus }); showMsg("✅ סטטוס עודכן"); };
  const addIssueNote = async (idx, note) => { if(!note.trim()) return; const updated = [...issues]; updated[idx] = [...updated[idx]]; updated[idx][6] = note; setIssues(updated); await mgmtCall("updateMgmtIssueStatus", { rowIndex: idx+2, status: updated[idx][5], note }); setIssueNote({}); showMsg("✅ הערה נוספה"); };
  const filteredIssues = issues.filter(i => !dateFilter || String(i[2]).slice(0,10)===dateFilter);
  const pendingCount = issues.filter(i=>i[5]==="פתוח"||!i[5]).length;
  const C2 = { blue:"#1565c0", bg:"#f0f7ff", white:"#fff", text:"#1a237e", muted:"#90a4ae", border:"#e3f2fd", green:"#2e7d32", orange:"#e65100", red:"#c62828" };
  const inp2 = {width:"100%",background:"#f5f9ff",border:"2px solid #e3f2fd",borderRadius:12,padding:"10px 14px",fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"'Plus Jakarta Sans',sans-serif",color:C2.text};
  const statusColor = s => s==="טופל"?"#e8f5e9":s==="בטיפול"?"#e3f2fd":s==="הועבר"?"#f3e5f5":"#fff8e1";
  const statusTextColor = s => s==="טופל"?C2.green:s==="בטיפול"?C2.blue:s==="הועבר"?"#6a1b9a":C2.orange;

  const ClientForm = ({data, onSave, onCancel}) => {
    const [f, setF] = useState(data);
    return (
      <div style={{background:C2.white,borderRadius:16,padding:16,marginBottom:16,border:`1px solid ${C2.border}`}}>
        {[["name","שם חברה *"],["contact","איש קשר"],["phone","טלפון"],["email","מייל"],["sheetId","Sheet ID"],["logoUrl","URL לוגו (PNG שקוף — מוצג בשמירה למסך הבית)"]].map(([k,lbl])=>(
          <div key={k} style={{marginBottom:10}}>
            <label style={{fontSize:11,fontWeight:700,color:C2.muted,display:"block",marginBottom:4}}>{lbl}</label>
            <input value={f[k]||""} onChange={e=>setF(x=>({...x,[k]:e.target.value}))} style={inp2} placeholder={lbl}/>
          </div>
        ))}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={{fontSize:11,fontWeight:700,color:C2.muted,display:"block",marginBottom:4}}>מנוי</label><select value={f.plan||"PRO"} onChange={e=>setF(x=>({...x,plan:e.target.value}))} style={{...inp2}}><option>PRO</option><option>Basic</option><option>ניסיון</option></select></div>
          <div><label style={{fontSize:11,fontWeight:700,color:C2.muted,display:"block",marginBottom:4}}>סטטוס</label><select value={f.status||"פעיל"} onChange={e=>setF(x=>({...x,status:e.target.value}))} style={{...inp2}}><option>פעיל</option><option>מושהה</option><option>ניסיון</option></select></div>
        </div>
        <div style={{marginBottom:12}}><label style={{fontSize:11,fontWeight:700,color:C2.muted,display:"block",marginBottom:4}}>הערות</label><textarea value={f.notes||""} onChange={e=>setF(x=>({...x,notes:e.target.value}))} rows={2} style={{...inp2,resize:"none"}}/></div>
        <div style={{display:"flex",gap:8}}>
          <Press onClick={()=>onSave(f)} style={{flex:1,padding:"12px",borderRadius:12,background:`linear-gradient(135deg,${C2.blue},#42a5f5)`,color:"#fff",fontWeight:800,fontSize:13,textAlign:"center"}}>{saving?"⏳":"💾 שמור"}</Press>
          <Press onClick={onCancel} style={{padding:"12px 16px",borderRadius:12,background:"#f0f4f8",color:C2.muted,fontWeight:700,fontSize:13}}>ביטול</Press>
        </div>
      </div>
    );
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",flexDirection:"column"}}>
      <div onClick={close} style={{position:"absolute",inset:0,background:`rgba(0,0,0,${vis?0.6:0})`,transition:"background 0.3s",backdropFilter:"blur(6px)"}}/>
      <div dir="rtl" style={{position:"relative",background:"#f0f7ff",transform:vis?"translateY(0)":"translateY(100%)",transition:"transform 0.4s cubic-bezier(0.34,1.2,0.64,1)",height:"100vh",display:"flex",flexDirection:"column",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
        <div style={{background:`linear-gradient(145deg,#0d47a1,#1565c0,#1976d2)`,padding:"28px 20px 20px",position:"relative",overflow:"hidden",flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative"}}>
            <div>
              <div style={{color:"rgba(255,255,255,0.55)",fontSize:11,fontWeight:700,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:4}}>Super Admin</div>
              <div style={{color:"#fff",fontSize:22,fontWeight:900}}>POOLMANG.BY.OR2026</div>
              {auth&&<div style={{color:"rgba(255,255,255,0.6)",fontSize:12,marginTop:2}}>{clients.length} לקוחות · {pendingCount} תקלות ממתינות</div>}
            </div>
            <div style={{display:"flex",gap:8}}>
              {auth&&<Press onClick={()=>{loadData();haptic();}} style={{background:"rgba(255,255,255,0.15)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:12,padding:"8px 12px",color:"#fff",fontSize:13,fontWeight:700}}>🔄</Press>}
              <Press onClick={close} style={{width:36,height:36,borderRadius:"50%",background:"rgba(255,255,255,0.15)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:16}}>✕</Press>
            </div>
          </div>
        </div>
        {toast2&&<div style={{position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",background:"#0d47a1",color:"#fff",borderRadius:99,padding:"10px 22px",fontSize:13,fontWeight:700,zIndex:999,whiteSpace:"nowrap",boxShadow:"0 8px 24px rgba(13,71,161,0.4)"}}>{toast2}</div>}
        {!auth?(
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
            <div style={{background:"#fff",borderRadius:24,padding:28,width:"100%",maxWidth:340,boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}}>
              <div style={{fontSize:48,textAlign:"center",marginBottom:12}}>🔐</div>
              <div style={{fontWeight:900,fontSize:18,color:C2.text,textAlign:"center",marginBottom:20}}>כניסה מאובטחת</div>
              <input type="password" value={pass} onChange={e=>{setPass(e.target.value);setErr("");}} placeholder="סיסמה סודית" style={{...inp2,marginBottom:err?8:16}} onKeyDown={e=>e.key==="Enter"&&login()}/>
              {err&&<div style={{background:"#ffebee",borderRadius:10,padding:"8px 14px",marginBottom:12,color:C2.red,fontSize:13,fontWeight:700,textAlign:"center"}}>⚠️ {err}</div>}
              <Press onClick={login} style={{padding:"14px",borderRadius:14,background:`linear-gradient(135deg,${C2.blue},#42a5f5)`,color:"#fff",fontWeight:900,fontSize:15,textAlign:"center",boxShadow:"0 6px 20px rgba(21,101,192,0.4)"}}>כניסה →</Press>
            </div>
          </div>
        ):(
          <>
            <div style={{background:C2.white,padding:"8px 12px",borderBottom:`1px solid ${C2.border}`,display:"flex",gap:6,flexShrink:0,overflowX:"auto",boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
              {[["issues",`🔧 תקלות${pendingCount>0?` (${pendingCount})`:""}`],["clients","👥 לקוחות"],["licenses","🔑 רישיונות"],["stats","📊 סטטיסטיקות"],["settings","⚙️ הגדרות"]].map(([t,lbl])=>(
                <Press key={t} onClick={()=>{setTab(t);haptic();}} style={{padding:"9px 14px",borderRadius:99,fontSize:12,fontWeight:800,flexShrink:0,whiteSpace:"nowrap",background:tab===t?`linear-gradient(135deg,${C2.blue},#42a5f5)`:"#f0f4f8",color:tab===t?"#fff":C2.muted,boxShadow:tab===t?"0 4px 12px rgba(21,101,192,0.3)":"none"}}>{lbl}</Press>
              ))}
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"16px"}}>
              {loading&&<div style={{textAlign:"center",padding:60,color:C2.muted}}><div style={{fontSize:32,marginBottom:12}}>⏳</div><div style={{fontSize:14,fontWeight:700}}>טוען...</div></div>}
              {tab==="issues"&&!loading&&(
                <div>
                  {pendingCount>0&&<div style={{background:"#fff8e1",border:"1px solid #ffe082",borderRadius:16,padding:"14px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:22}}>🔔</span><div><div style={{fontWeight:800,fontSize:14,color:C2.orange}}>{pendingCount} תקלות ממתינות לטיפול</div><div style={{fontSize:11,color:"#bf6900",marginTop:2}}>לחץ על סטטוס לעדכון</div></div></div>}
                  <div style={{display:"flex",gap:8,marginBottom:16}}>
                    <input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)} style={{...inp2,flex:1,fontSize:12}}/>
                    {dateFilter&&<Press onClick={()=>setDateFilter("")} style={{padding:"10px 14px",borderRadius:10,background:"#ffebee",color:C2.red,fontWeight:700,fontSize:12}}>✕</Press>}
                  </div>
                  {filteredIssues.length===0&&<div style={{background:C2.white,borderRadius:16,padding:32,textAlign:"center",color:C2.muted}}><div style={{fontSize:32,marginBottom:8}}>✅</div><div style={{fontWeight:700}}>אין תקלות</div></div>}
                  {filteredIssues.map((issue,i)=>{
                    const priority=issue[4]||"רגיל"; const status=issue[5]||"פתוח";
                    const priColor=priority==="קריטי"?C2.red:priority==="דחוף"?C2.orange:C2.blue;
                    const realIdx=issues.indexOf(issue); const showNote=issueNote[realIdx]!==undefined;
                    return (
                      <div key={i} style={{background:C2.white,borderRadius:16,padding:16,marginBottom:12,border:`2px solid ${priColor}22`,boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                          <div style={{fontWeight:900,fontSize:15,color:C2.text}}>{issue[1]}</div>
                          <span style={{background:priColor+"18",color:priColor,borderRadius:99,padding:"4px 12px",fontSize:11,fontWeight:800}}>{priority}</span>
                        </div>
                        <div style={{fontSize:13,color:"#546e7a",marginBottom:6,lineHeight:1.6}}>{issue[3]}</div>
                        <div style={{fontSize:11,color:C2.muted,marginBottom:10}}>📅 {issue[2]}</div>
                        {issue[6]&&<div style={{background:"#e8f5e9",borderRadius:10,padding:"8px 12px",fontSize:12,color:C2.green,fontWeight:700,marginBottom:10}}>📝 {issue[6]}</div>}
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                          {["פתוח","בטיפול","הועבר","טופל"].map(s=>(
                            <Press key={s} onClick={()=>updateIssueStatus(realIdx,s)} style={{padding:"7px 12px",borderRadius:99,fontSize:11,fontWeight:800,background:status===s?statusColor(s):"#f0f4f8",color:status===s?statusTextColor(s):C2.muted,border:`1px solid ${status===s?statusTextColor(s)+"50":"transparent"}`,boxShadow:status===s?"0 2px 8px rgba(0,0,0,0.1)":"none"}}>
                              {s==="פתוח"?"🔴":s==="בטיפול"?"🔵":s==="הועבר"?"🟣":"🟢"} {s}
                            </Press>
                          ))}
                        </div>
                        <div style={{display:"flex",gap:8}}>
                          {!showNote?(
                            <Press onClick={()=>setIssueNote({...issueNote,[realIdx]:""})} style={{padding:"7px 14px",borderRadius:10,background:"#f0f4f8",color:C2.muted,fontSize:12,fontWeight:700}}>➕ הוסף הערה</Press>
                          ):(
                            <>
                              <input value={issueNote[realIdx]||""} onChange={e=>setIssueNote({...issueNote,[realIdx]:e.target.value})} placeholder="כתוב הערה..." style={{...inp2,flex:1,padding:"8px 12px",fontSize:12}}/>
                              <Press onClick={()=>addIssueNote(realIdx,issueNote[realIdx]||"")} style={{padding:"8px 14px",borderRadius:10,background:C2.blue,color:"#fff",fontWeight:700,fontSize:12}}>שמור</Press>
                              <Press onClick={()=>setIssueNote({})} style={{padding:"8px 10px",borderRadius:10,background:"#ffebee",color:C2.red,fontWeight:700,fontSize:12}}>✕</Press>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {tab==="clients"&&!loading&&(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <div style={{fontSize:12,fontWeight:800,color:C2.muted,letterSpacing:"0.1em",textTransform:"uppercase"}}>{clients.length} לקוחות</div>
                    <Press onClick={()=>setShowAddClient(!showAddClient)} style={{padding:"8px 16px",borderRadius:99,background:showAddClient?"#ffebee":`linear-gradient(135deg,${C2.blue},#42a5f5)`,color:showAddClient?C2.red:"#fff",fontWeight:800,fontSize:12,boxShadow:showAddClient?"none":"0 4px 12px rgba(21,101,192,0.3)"}}>{showAddClient?"✕ ביטול":"➕ לקוח חדש"}</Press>
                  </div>
                  {showAddClient&&<ClientForm data={newClient} onCancel={()=>setShowAddClient(false)} onSave={async(f)=>{ if(!f.name?.trim()){showMsg("⚠️ נא להזין שם חברה");return;} await saveClient([Date.now(),f.name,f.contact,f.phone,f.email,f.plan,f.status,f.sheetId,"","","","","","",f.notes,f.logoUrl||""]); setNewClient({name:"",contact:"",phone:"",email:"",plan:"PRO",status:"פעיל",sheetId:"",notes:"",logoUrl:""}); setShowAddClient(false); }}/>}
                  {clients.length===0&&!showAddClient&&<div style={{background:C2.white,borderRadius:16,padding:32,textAlign:"center",color:C2.muted}}><div style={{fontSize:32,marginBottom:8}}>👥</div><div style={{fontWeight:700}}>אין לקוחות עדיין</div></div>}
                  {clients.map((c,i)=>(
                    <div key={i}>
                      {editClient===i?(
                        <ClientForm data={{name:c[1],contact:c[2],phone:c[3],email:c[4],plan:c[5],status:c[6],sheetId:c[7],notes:c[14],logoUrl:c[15]||""}} onCancel={()=>setEditClient(null)} onSave={async(f)=>{ const row=[c[0],f.name,f.contact,f.phone,f.email,f.plan,f.status,f.sheetId,...c.slice(8,14),f.notes,f.logoUrl||""]; await saveClient(row); setEditClient(null); }}/>
                      ):(
                        <div style={{background:C2.white,borderRadius:16,padding:16,marginBottom:10,boxShadow:"0 2px 12px rgba(0,0,0,0.06)",border:`1px solid ${c[6]==="מושהה"?C2.red+"33":C2.border}`}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                            <div><div style={{fontWeight:900,fontSize:15,color:C2.text}}>{c[1]}</div><div style={{fontSize:12,color:C2.muted,marginTop:3}}>{c[2]} · {c[3]}</div></div>
                            <div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end"}}>
                              <span style={{background:c[5]==="PRO"?"#e3f2fd":"#f3e5f5",color:c[5]==="PRO"?C2.blue:"#6a1b9a",borderRadius:99,padding:"4px 10px",fontSize:11,fontWeight:800}}>{c[5]||"Basic"}</span>
                              <span style={{background:c[6]==="פעיל"?"#e8f5e9":c[6]==="מושהה"?"#ffebee":"#fff8e1",color:c[6]==="פעיל"?C2.green:c[6]==="מושהה"?C2.red:C2.orange,borderRadius:99,padding:"4px 10px",fontSize:11,fontWeight:800}}>{c[6]||"פעיל"}</span>
                            </div>
                          </div>
                          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                            {c[7]&&<a href={`https://docs.google.com/spreadsheets/d/${c[7]}`} target="_blank" rel="noreferrer" style={{background:"#e3f2fd",color:C2.blue,borderRadius:99,padding:"4px 12px",fontSize:11,fontWeight:700,textDecoration:"none"}}>📊 גיליון</a>}
                            {c[4]&&<a href={`mailto:${c[4]}`} style={{background:"#f5f5f5",color:"#555",borderRadius:99,padding:"4px 12px",fontSize:11,fontWeight:700,textDecoration:"none"}}>✉️ מייל</a>}
                            {c[3]&&<a href={`tel:${c[3]}`} style={{background:"#f5f5f5",color:"#555",borderRadius:99,padding:"4px 12px",fontSize:11,fontWeight:700,textDecoration:"none"}}>📞</a>}
                          </div>
                          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
                            {["פעיל","מושהה","ניסיון"].map(s=>(<Press key={s} onClick={()=>updateClientStatus(i+2,s)} style={{padding:"5px 12px",borderRadius:99,fontSize:11,fontWeight:800,background:(c[6]||"פעיל")===s?(s==="פעיל"?"#e8f5e9":s==="מושהה"?"#ffebee":"#fff8e1"):"#f0f4f8",color:(c[6]||"פעיל")===s?(s==="פעיל"?C2.green:s==="מושהה"?C2.red:C2.orange):C2.muted}}>{s}</Press>))}
                          </div>
                          <div style={{display:"flex",gap:8,marginTop:10}}>
                            <Press onClick={()=>setEditClient(i)} style={{flex:1,padding:"8px",borderRadius:10,background:"#e3f2fd",color:C2.blue,fontWeight:700,fontSize:12,textAlign:"center"}}>✏️ עריכה</Press>
                            <Press onClick={()=>deleteClient(i+2)} style={{padding:"8px 14px",borderRadius:10,background:"#ffebee",color:C2.red,fontWeight:700,fontSize:12}}>🗑️</Press>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {tab==="licenses"&&!loading&&<LicensesTab C2={C2} inp2={inp2} showMsg={showMsg}/>}
              {tab==="stats"&&!loading&&(
                <div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                    {[["👥","סה\"כ לקוחות",clients.length,C2.blue],["✅","לקוחות פעילים",clients.filter(c=>c[6]==="פעיל"||!c[6]).length,C2.green],["🔧","תקלות פתוחות",issues.filter(i=>i[5]==="פתוח"||!i[5]).length,C2.orange],["💎","מנוי PRO",clients.filter(c=>c[5]==="PRO").length,C2.blue]].map(([ic,lbl,val,col])=>(
                      <div key={lbl} style={{background:C2.white,borderRadius:16,padding:16,textAlign:"center",boxShadow:"0 2px 12px rgba(0,0,0,0.06)",border:`1px solid ${C2.border}`}}>
                        <div style={{fontSize:28,marginBottom:6}}>{ic}</div>
                        <div style={{fontSize:28,fontWeight:900,color:col,lineHeight:1}}>{val}</div>
                        <div style={{fontSize:11,color:C2.muted,marginTop:4,fontWeight:700}}>{lbl}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {tab==="settings"&&(
                <div style={{background:C2.white,borderRadius:16,padding:20,boxShadow:"0 2px 12px rgba(0,0,0,0.06)",border:`1px solid ${C2.border}`}}>
                  <div style={{fontWeight:900,fontSize:16,color:C2.text,marginBottom:20}}>🔑 שינוי סיסמת כניסה</div>
                  <div style={{marginBottom:12}}><label style={{fontSize:11,fontWeight:700,color:C2.muted,display:"block",marginBottom:6}}>סיסמה חדשה</label><input type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} style={inp2} placeholder="לפחות 6 תווים"/></div>
                  <div style={{marginBottom:16}}><label style={{fontSize:11,fontWeight:700,color:C2.muted,display:"block",marginBottom:6}}>אימות סיסמה</label><input type="password" value={newPass2} onChange={e=>setNewPass2(e.target.value)} style={inp2} placeholder="הזן שוב"/></div>
                  {passMsg&&<div style={{background:passMsg.includes("✅")?"#e8f5e9":"#ffebee",borderRadius:10,padding:"10px 14px",marginBottom:14,color:passMsg.includes("✅")?C2.green:C2.red,fontSize:13,fontWeight:700,textAlign:"center"}}>{passMsg}</div>}
                  <Press onClick={()=>{ if(!newPass||newPass.length<6){setPassMsg("⚠️ סיסמה חייבת להיות לפחות 6 תווים");return;} if(newPass!==newPass2){setPassMsg("⚠️ הסיסמאות לא תואמות");return;} setSuperPass(newPass); setNewPass(""); setNewPass2(""); setPassMsg("✅ סיסמה עודכנה!"); haptic("success"); setTimeout(()=>setPassMsg(""),3000); }} style={{padding:"14px",borderRadius:14,background:`linear-gradient(135deg,${C2.blue},#42a5f5)`,color:"#fff",fontWeight:900,fontSize:15,textAlign:"center",boxShadow:"0 6px 20px rgba(21,101,192,0.35)"}}>עדכן סיסמה</Press>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const company = getCompany();
  const [showSetup, setShowSetup] = useState(()=>{
    const lic = getLicense();
    if(lic.key && lic.sheetId) return false;
    try { const cached = localStorage.getItem("galileo_cache"); if(cached && JSON.parse(cached)?.users?.length) return false; } catch {}
    return true;
  });
  const [companyName, setCompanyName] = useState(company.name||"POOLMANG");
  const [user,setUser] = useState(()=>{ try { return JSON.parse(localStorage.getItem("galileo_user")||"null"); } catch { return null; } });
  const [greeting, setGreeting] = useState(()=>{
    try {
      const savedUser = JSON.parse(localStorage.getItem("galileo_user")||"null");
      return getDailyGreeting(savedUser?.username || "");
    } catch {
      return getDailyGreeting("");
    }
  });
  const [loginUser,setLoginUser] = useState("");
  const [loginPass,setLoginPass] = useState("");
  const [loginErr,setLoginErr] = useState("");
  const [loginLoading,setLoginLoading] = useState(false);
  const [sheetId,setSheetId] = useState("");
  const [clientPlan,setClientPlan] = useState({plan:"",status:""});
  const [allUsers,setAllUsers] = useState(DEMO_USERS);
  const [clients,setClients] = useState(DEMO_CLIENTS);
  const [tasks,setTasks] = useState([]);
  const [supplyDB,setSupplyDB] = useState({});
  const [lastReadings,setLastReadings] = useState({});
const [reports,setReports] = useState([]);

const [pending, setPending] = useState(() => {
  try {
    return JSON.parse(localStorage.getItem("galileo_pending_reports") || "[]");
  } catch {
    return [];
  }
});

useEffect(() => {
  localStorage.setItem(
    "galileo_pending_reports",
    JSON.stringify(pending)
  );
}, [pending]);



const [screen,setScreen] = useState(() => {
  try {
    const u = JSON.parse(localStorage.getItem("galileo_user") || "null");
    return u ? (u.role === "admin" ? "admin" : "daily") : "login";
  } catch {
    return "login";
  }
});
  const [syncing,setSyncing] = useState(false);
  const [actionStatus, setActionStatus] = useState({});
  const [pushCardOpen, setPushCardOpen] = useState(true);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(()=>{
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator?.standalone === true;
  });
  const [form,setForm] = useState(blank());
  const [adminTab,setAdminTab] = useState("progress");
  const [taskDate,setTaskDate] = useState(todayStr());
  const [taskClient,setTaskClient] = useState("");
  const [taskClientSearch,setTaskClientSearch] = useState("");
  const [taskClients,setTaskClients] = useState([]);
  const [taskOps,setTaskOps] = useState([]);
  const [taskNote,setTaskNote] = useState("");
  const [editTaskId,setEditTaskId] = useState(null);
  const [dailyDate,setDailyDate] = useState(todayStr());
  const [showConv,setShowConv] = useState(false);
  const [navTab,setNavTab] = useState(0);
  const [openDoneTasks,setOpenDoneTasks] = useState({});
  const [toast,setToast] = useState({msg:"",visible:false});
  const [workStart,setWorkStart] = useState(()=>localStorage.getItem("galileo_workstart")||null);
  const [workLogs,setWorkLogs] = useState(()=>{ try{return JSON.parse(localStorage.getItem("galileo_worklogs")||"[]");}catch{return [];} });
  const [showQR,setShowQR] = useState(false);
  const [showQRCode,setShowQRCode] = useState(null);
  const [dismissed,setDismissed] = useState(false);
  const [showSuperAdmin,setShowSuperAdmin] = useState(false);
  const [showReportIssue,setShowReportIssue] = useState(false);
  const [issueDesc,setIssueDesc] = useState("");
  const [issuePriority,setIssuePriority] = useState("רגיל");
  const [showGateCode,setShowGateCode] = useState({});
  const [operatorIssues,setOperatorIssues] = useState([]);
  const [showOperatorIssue,setShowOperatorIssue] = useState(false);
  const [opIssueClient,setOpIssueClient] = useState("");
  const [opIssueDesc,setOpIssueDesc] = useState("");
  const [opIssuePriority,setOpIssuePriority] = useState("רגיל");
  const [clientSearch,setClientSearch] = useState("");
  const [unassignedClients,setUnassignedClients] = useState([]);
  const [editingReport,setEditingReport] = useState(null);
  const [supplySearch,setSupplySearch] = useState({date:"",type:""});
  const [freeClients,setFreeClients] = useState([]);
  const [newClient,setNewClient] = useState({name:"",phone:"",address:""});
  const [adminClientSearch,setAdminClientSearch] = useState("");
  const [reportFilter,setReportFilter] = useState("");
  const [reportDateFilter,setReportDateFilter] = useState("");
  const [sheetReports,setSheetReports] = useState([]);
  const [treatmentCounts,setTreatmentCounts] = useState([]);
  const [chemicalRestrictionPrompt,setChemicalRestrictionPrompt] = useState(null);
  const logoLongPress = useRef();
  const fileRef = useRef();
  const toastTimer = useRef();

  const setAction = (key, status, resetMs = 0) => {
    setActionStatus(prev => ({...prev, [key]: status}));
    if (resetMs) {
      setTimeout(() => {
        setActionStatus(prev => prev[key] === status ? {...prev, [key]: "idle"} : prev);
      }, resetMs);
    }
  };
  const isActionLoading = (key) => actionStatus[key] === "loading";
  const actionLabel = (key, labels) => labels[actionStatus[key] || "idle"] || labels.idle;

  const sf = (k,v) => setForm(f=>({...f,[k]:v}));
  const {reportDate,client,chlorine,ph,salt,elModel,elSerial,elDate,waterLevel,clarity,fat,flow,acid,phUpSupply,saltPkg,saltBags,supplyStatus,supplyNote,poolStatus,customStatusText,restrictedUntil,notes,photos} = form;
  const fmtTime = (d) => d.toLocaleTimeString("he-IL",{hour:"2-digit",minute:"2-digit"});
  const formatDateInput = (d) => d.toISOString().slice(0,10);
  const applyChemicalRestriction = (minutes) => {
    const start = new Date();
    const end = new Date(start.getTime() + minutes * 60000);
    const text = `\u05d0\u05d9\u05df \u05dc\u05d4\u05e9\u05ea\u05de\u05e9 \u05d1\u05d1\u05e8\u05d9\u05db\u05d4 \u05de\u05d4\u05e9\u05e2\u05d4 ${fmtTime(start)} \u05e2\u05d3 ${fmtTime(end)}.`;
    setForm(f=>({...f,poolStatus:"\u05d0\u05d7\u05e8",customStatusText:text,restrictedUntil:formatDateInput(end),_chemicalRestrictionApplied:true}));
    setChemicalRestrictionPrompt(null);
    haptic("success");
  };
  const updateMeasurement = (key, value) => {
    sf(key,value);
    if ((key==="hth" || key==="phUp") && Number(value)>0 && !form._chemicalRestrictionApplied && !chemicalRestrictionPrompt) {
      setChemicalRestrictionPrompt({key});
    }
  };
  const clientPhone = (n) => (clients.find(c=>c.name===n)||{}).phone||"";
  const clientAddress = (n) => (clients.find(c=>c.name===n)||{}).address||"";
  const clientGateCode = (n) => (clients.find(c=>c.name===n)||{}).gateCode||"";
  const operatorUsers = allUsers.filter(u=>u.role==="operator");
  const opNames = operatorUsers.map(u=>u.name);
  const normalizeDate = (d) => String(d||"").trim().slice(0,10);
  const normalizeName = (n) => String(n||"").trim().toLowerCase();
  const DAY_NAMES = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
  const dateDayName = (dateStr) => { if(!dateStr) return ""; return DAY_NAMES[new Date(dateStr+"T12:00:00").getDay()]; };
  const normalizeDay = (d) => String(d||"").trim().replace(/^א$/,"ראשון").replace(/^ב$/,"שני").replace(/^ג$/,"שלישי").replace(/^ד$/,"רביעי").replace(/^ה$/,"חמישי").replace(/^ו$/,"שישי").replace(/^ש$/,"שבת").replace(/^1$/,"ראשון").replace(/^2$/,"שני").replace(/^3$/,"שלישי").replace(/^4$/,"רביעי").replace(/^5$/,"חמישי").replace(/^6$/,"שישי").replace(/^7$/,"שבת");

  const myDayClients = (date=dailyDate) => {
    const dayName = dateDayName(date);
    const anyHasSchedule = clients.some(c=>c.regularDays||c.regularOperator);
    if(!anyHasSchedule) return clients.filter(c=>!c.regularOperator || normalizeName(c.regularOperator)===normalizeName(user?.name));
    return clients.filter(c => {
      const days = String(c.regularDays||"").split(",").map(d=>normalizeDay(d.trim()));
      const opMatch = !c.regularOperator || normalizeName(c.regularOperator)===normalizeName(user?.name);
      const dayMatch = days.some(d=>d===dayName);
      return opMatch && dayMatch;
    });
  };

  const dayClientProfiles = (date=dailyDate) => {
    const existing = myTasks(date);
    const fromDays = myDayClients(date).filter(c=>!existing.find(t=>t.client===c.name));
    const dayProfiles = fromDays.map(c=>({id:`day-${c.name}`,client:c.name,operators:[user?.name],date,status:"pending",changeLog:[],_dayProfile:true}));
    return [...existing, ...dayProfiles];
  };

  const myTasks = (date=dailyDate) => tasks.filter(t=>{
    const tDate = normalizeDate(t.date);
    const tDate2 = tDate.includes("T") ? tDate.split("T")[0] : tDate;
    const dateMatch = tDate2 === date;
    const nameMatch = user?.role==="admin" || (t.operators||[]).some(op => normalizeName(op)===normalizeName(user?.name));
    return dateMatch && nameMatch;
  });

  const sendNotificationToAdmins = async (title, message) => {
    let sentCount = 0;
    const adminUsers = allUsers.filter(u => {
      const role = String(u.role || "").trim().toLowerCase();
      return (role === "admin" || role === "\u05de\u05e0\u05d4\u05dc" || role === "\u05d0\u05d3\u05de\u05d9\u05df") && u.username;
    });
    for (const admin of adminUsers) {
      const sent = await sendOneSignalToUser(title, message, admin.username);
      if (sent) sentCount++;
    }

    if (sentCount === 0 && sheetId) {
      const res = await sheetCall("sendOneSignalToAdmins", {title, message});
      sentCount = Number(res?.sent || 0);
      if (!sentCount) console.warn("OneSignal: admin notification not sent", res);
    }

    return sentCount;
  };

  const loadTreatmentCounts = async () => {
    const res = await sheetCall("getTreatmentCounts");
    if (Array.isArray(res?.treatments)) setTreatmentCounts(res.treatments);
    return res?.treatments || [];
  };

  const sendNotificationToOperators = async (operatorNames, title, message) => {
    const names = [...new Set((operatorNames || []).filter(Boolean).map(normalizeName))];
    const targets = allUsers.filter(u =>
      u.role === "operator" &&
      u.username &&
      names.includes(normalizeName(u.name))
    );

    if (!targets.length) {
      console.warn("OneSignal: no operator users found for task notification", operatorNames);
      return 0;
    }

    let sentCount = 0;
    for (const op of targets) {
      const sent = await sendOneSignalToUser(title, message, op.username);
      if (sent) sentCount++;
    }
    return sentCount;
  };

  const enablePushForCurrentUser = async () => {
    if (!user?.username) {
      showToast("⚠️ אין משתמש מחובר");
      return;
    }

    if (isActionLoading("push")) return;
    setAction("push", "loading");

    if (!window.isSecureContext && !["localhost","127.0.0.1"].includes(window.location.hostname)) {
      setAction("push", "error", 2200);
      showToast("⚠️ התראות דורשות HTTPS");
      return;
    }

    const ok = await runOneSignal(async (OneSignal) => {
        if (OneSignal.Notifications?.isPushSupported && !OneSignal.Notifications.isPushSupported()) {
          return "unsupported";
        }

        if (OneSignal.Notifications?.permission !== true && OneSignal.Notifications?.requestPermission) {
          await OneSignal.Notifications.requestPermission();
          if (OneSignal.Notifications.permission !== true) {
            return "denied";
          }
        }

        await OneSignal.login(user.username);
        return true;
    });

    if (ok === true) {
      setAction("push", "success", 1800);
      setPushCardOpen(false);
      showToast("✅ התראות הופעלו למשתמש שלך");
    } else if (ok === "denied") {
      setAction("push", "error", 2200);
      showToast("⚠️ הרשאת התראות לא אושרה");
    } else if (ok === "unsupported") {
      setAction("push", "error", 2200);
      showToast("⚠️ הדפדפן לא תומך בהתראות");
    } else {
      setAction("push", "error", 2200);
      showToast("⚠️ לא ניתן להפעיל התראות");
    }
  };

  const resetPushForCurrentUser = async () => {
    if (!user?.username || isActionLoading("pushReset")) return;
    setAction("pushReset", "loading");

    const ok = await runOneSignal(async (OneSignal) => {
      try {
        if (typeof OneSignal.logout === "function") await OneSignal.logout();
        if (OneSignal.User?.PushSubscription?.optOut) await OneSignal.User.PushSubscription.optOut();
        if (OneSignal.User?.PushSubscription?.optIn) await OneSignal.User.PushSubscription.optIn();
        if (OneSignal.Notifications?.permission !== true && OneSignal.Notifications?.requestPermission) {
          await OneSignal.Notifications.requestPermission();
        }
        await OneSignal.login(user.username);
        return true;
      } catch (e) {
        console.warn("Push reset error:", e);
        return false;
      }
    });

    if (ok) {
      setAction("pushReset", "success", 1800);
      setAction("push", "success", 1800);
      setPushCardOpen(false);
      showToast("✅ ההתראות אופסו וחוברו מחדש");
    } else {
      setAction("pushReset", "error", 2500);
      showToast("⚠️ איפוס נכשל, בדוק הרשאת התראות בדפדפן");
    }
  };

  const PushSetupCard = ({compact=false}) => (
    <div style={{...card({marginBottom: compact ? 10 : 12,background: "#e3f2fd",border: `1px solid ${C.lightBlue}`}),padding: compact ? "10px 14px" : "12px 16px"}}>
      <Press onClick={()=>setPushCardOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:18}}>🔔</span>
        <div style={{flex:1}}>
          <div style={{fontWeight:800,fontSize:13,color:C.blue}}>התראות אישיות</div>
          {pushCardOpen&&<div style={{fontSize:11,color:C.muted}}>נדרש לקבלת משימות ועדכונים לפי משתמש</div>}
        </div>
        <span style={{fontSize:12,fontWeight:800,color:C.blue,display:"inline-flex",alignItems:"center",gap:8}}>
          {actionLabel("push",{idle:"הפעל",loading:"⏳",success:"✅",error:"נסה שוב"})}
          <span style={{fontSize:14,display:"inline-block",transform:pushCardOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▾</span>
        </span>
      </Press>
      {pushCardOpen&&(
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
          <Press onClick={enablePushForCurrentUser} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:99,background:C.blue,color:"#fff",fontSize:12,fontWeight:800}}>
            <span>🔔</span>
            <span>{actionLabel("push",{idle:"הפעל",loading:"מפעיל...",success:"הופעל",error:"נסה שוב"})}</span>
          </Press>
          <Press onClick={resetPushForCurrentUser} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:99,background:"#fff",border:`1px solid ${C.border}`,color:C.muted,fontSize:12,fontWeight:800}}>
            <span>↻</span>
            <span>{actionLabel("pushReset",{idle:"איפוס התראות",loading:"מאפס...",success:"אופס",error:"נסה שוב"})}</span>
          </Press>
        </div>
      )}
    </div>
  );

  useEffect(()=>{
    if(!user) return;
    setGreeting(getDailyGreeting(user.username || ""));
    const refresh = async() => { const tR = await sheetCall("getTasks"); if(Array.isArray(tR?.tasks) && tR.tasks.length>0) { setTasks(tR.tasks); try { const cached = localStorage.getItem("galileo_cache"); const c = cached ? JSON.parse(cached) : {}; localStorage.setItem("galileo_cache", JSON.stringify({...c, tasks:tR.tasks})); } catch {} } };
    const interval = setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    return ()=>{ clearInterval(interval); window.removeEventListener("focus", refresh); };
  },[user]);

  const todayReported = reports.filter(r=>r.reportDate===dailyDate&&r.operator===user?.name).map(r=>r.client);

  const handleLogout = () => { localStorage.removeItem("galileo_user"); setUser(null); setLoginUser(""); setLoginPass(""); setScreen("login"); haptic("medium"); };

  const showToast = (msg) => { clearTimeout(toastTimer.current); setToast({msg,visible:true}); toastTimer.current = setTimeout(()=>setToast(t=>({...t,visible:false})),2500); };

  useEffect(() => {
    const standaloneQuery = window.matchMedia?.("(display-mode: standalone)");
    const updateStandalone = () => setIsStandalone(standaloneQuery?.matches || window.navigator?.standalone === true);
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
      showToast("✅ האפליקציה הותקנה");
    };

    updateStandalone();
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    standaloneQuery?.addEventListener?.("change", updateStandalone);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      standaloneQuery?.removeEventListener?.("change", updateStandalone);
    };
  }, []);

  const installApp = async () => {
    if (isStandalone) {
      showToast("✅ האפליקציה כבר מותקנת");
      return;
    }

    if (isActionLoading("install")) return;
    setAction("install", "loading");

    if (installPrompt) {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice.catch(() => null);
      setInstallPrompt(null);
      if (choice?.outcome === "accepted") {
        setAction("install", "success", 1800);
        showToast("✅ התקנת האפליקציה התחילה");
      } else {
        setAction("install", "error", 2200);
        showToast("⚠️ ההתקנה בוטלה");
      }
      return;
    }

    setAction("install", "manual", 3500);
    showToast("ב-Chrome לחץ ⋮ ואז התקנת האפליקציה / הוספה למסך הבית");
  };

  const InstallAppCard = ({compact=false}) => {
    if (isStandalone) return null;
    return (
      <Press
        onClick={installApp}
        style={{
          ...card({
            marginTop: compact ? 0 : 12,
            marginBottom: compact ? 10 : 0,
            background: "#e8f5e9",
            border: "1px solid #a5d6a7",
            display: "flex",
            alignItems: "center",
            gap: 10
          }),
          padding: compact ? "10px 14px" : "12px 16px"
        }}
      >
        <span style={{fontSize:18}}>⬇️</span>
        <div style={{flex:1}}>
          <div style={{fontWeight:800,fontSize:13,color:C.green}}>התקן אפליקציה</div>
          <div style={{fontSize:11,color:C.muted}}>פתח בלי דפדפן וקבל חוויה יציבה יותר</div>
        </div>
        <span style={{fontSize:12,fontWeight:800,color:C.green}}>
          {actionLabel("install",{idle:"התקן",loading:"⏳",success:"✅",manual:"⋮",error:"נסה שוב"})}
        </span>
      </Press>
    );
  };

  useEffect(() => {
    initOneSignal().then(() => {
      const savedUser = user || (() => {
        try { return JSON.parse(localStorage.getItem("galileo_user") || "null"); } catch { return null; }
      })();
      if (savedUser?.username) loginOneSignalUser(savedUser.username);
    });
  }, []);

  useEffect(()=>{
    try { const cached = localStorage.getItem("galileo_cache"); if(cached){ const {users,clients:cls,tasks:tsk,supplyDB:sdb,lastReadings:lr}=JSON.parse(cached); if(users?.length) setAllUsers(users); if(cls?.length) setClients(cls); if(tsk) setTasks(tsk); if(sdb) setSupplyDB(sdb); if(lr) setLastReadings(lr); setSheetId("connected"); } } catch {}
    const checkLicense = async () => {
      const lic = getLicense(); if(!lic.key) return;
      try { const res = await mgmtCall("validateLicense",{key:lic.key}); if(res?.valid){ saveLicense({...lic, plan:res.plan, status:res.status, expiry:res.expiry, logoUrl:res.logoUrl||""}); saveCompany({name:res.company, sheetId:res.sheetId, scriptUrl:FIXED_SCRIPT_URL, adminEmail:res.adminEmail||"", logoUrl:res.logoUrl||""}); setClientPlan({plan:res.plan, status:res.status}); if(res.sheetId) localStorage.setItem("galileo_sheet_id", res.sheetId); } else { localStorage.removeItem("galileo_user"); localStorage.removeItem("galileo_license"); setUser(null); setShowSetup(true); } } catch {}
    };
    checkLicense(); connectSheets(true);
  },[]);

  const connectSheets = async (bg=false) => {
    try { const cached = localStorage.getItem("galileo_cache"); if(cached){ const {users,clients:cls,tasks:tsk,supplyDB:sdb,lastReadings:lr}=JSON.parse(cached); if(users?.length) setAllUsers(users); if(cls?.length) setClients(cls); if(tsk) setTasks(tsk); if(sdb) setSupplyDB(sdb); if(lr) setLastReadings(lr); setSheetId("connected"); if(!bg) return; } } catch {}
    try {
      const [uR,cR,tR,sR,rR,ucR] = await Promise.all([sheetCall("getUsers"),sheetCall("getClients"),sheetCall("getTasks"),sheetCall("getSupplyDB"),sheetCall("getLastReadings"),sheetCall("getUnassignedClients")]);
      const u=uR?.users?.length?uR.users:null; const c=cR?.clients?.length?cR.clients:null; const t=Array.isArray(tR?.tasks)?tR.tasks:null; const s=sR?.supplyDB?sR.supplyDB:null; const lr=rR?.lastReadings?rR.lastReadings:null; const uc=ucR?.clients?.length?ucR.clients:null;
      if(u)setAllUsers(u); if(c)setClients(c); if(t)setTasks(t); if(s)setSupplyDB(s); if(lr)setLastReadings(lr); if(uc)setUnassignedClients(uc);
      localStorage.setItem("galileo_cache",JSON.stringify({users:u||allUsers,clients:c||clients,tasks:t||[],supplyDB:s||{},lastReadings:lr||{},cachedAt:Date.now()}));
      setSheetId("connected");
      try { const company = getCompany(); if(company.sheetId) { const mgmtRes = await mgmtCall("getMgmtClients"); const rec = (mgmtRes?.clients||[]).find(c=>String(c[7])===String(company.sheetId)); if(rec) setClientPlan({plan:rec[5]||"",status:rec[6]||""}); } } catch {}
    } catch {}
  };

  const _doLogin = (found) => {
    setUser(found);
    setGreeting(getDailyGreeting(found.username||""));
    loginOneSignalUser(found.username);
    localStorage.setItem("galileo_user", JSON.stringify(found));
    setScreen(found.role === "admin" ? "admin" : "daily");
    haptic("medium");
    connectSheets(true);
    // בדיקת מנוי מושהה ברקע — לא חוסם כניסה
    setTimeout(async () => {
      try {
        const company = getCompany();
        if (company.sheetId) {
          const mgmtRes = await mgmtCall("getMgmtClients");
          const myRecord = (mgmtRes?.clients||[]).find(c => String(c[7])===String(company.sheetId));
          if (myRecord && myRecord[6]==="מושהה") {
            setUser(null);
            localStorage.removeItem("galileo_user");
            setScreen("login");
            setLoginErr("⛔ המנוי שלך מושהה. לפרטים צור קשר עם מנהל המערכת.");
          }
        }
      } catch(e) {}
    }, 0);
  };

  const handleLogin = async () => {
    setLoginErr(""); setLoginLoading(true);
    setAction("login", "loading");

    const inputUser = loginUser.toLowerCase().trim();
    const inputPass = loginPass.trim();

    if (!inputUser || !inputPass) {
      setLoginErr("נא להזין שם משתמש וסיסמה");
      setLoginLoading(false);
      setAction("login", "error", 2000);
      return;
    }

    // cache-first — כניסה מיידית אם המשתמש קיים ב-cache
    try {
      const cacheData = JSON.parse(localStorage.getItem("galileo_cache")||"{}");
      if (Array.isArray(cacheData.users) && cacheData.users.length > 0) {
        const found = cacheData.users.find(u =>
          String(u.username||"").toLowerCase().trim() === inputUser &&
          String(u.password||"").trim() === inputPass
        );
        if (found) {
          setAction("login", "success", 1200);
          _doLogin(found);
          setLoginLoading(false);
          // רענן Sheets ברקע
          sheetCall("getUsers").then(uRes => {
            if (Array.isArray(uRes?.users) && uRes.users.length > 0) {
              setAllUsers(uRes.users);
              try {
                const c = JSON.parse(localStorage.getItem("galileo_cache")||"{}");
                localStorage.setItem("galileo_cache", JSON.stringify({...c, users:uRes.users, cachedAt:Date.now()}));
              } catch(e) {}
            }
          }).catch(()=>{});
          return;
        }
      }
    } catch(e) {}

    // אין cache — שלוף מ-Sheets
    let usersToCheck = [];
    try {
      const uRes = await sheetCall("getUsers");
      if (Array.isArray(uRes?.users) && uRes.users.length > 0) {
        usersToCheck = uRes.users;
        setAllUsers(uRes.users);
        try {
          const c = JSON.parse(localStorage.getItem("galileo_cache")||"{}");
          localStorage.setItem("galileo_cache", JSON.stringify({...c, users:uRes.users, cachedAt:Date.now()}));
        } catch(e) {}
      }
    } catch(e) {}

    if (!usersToCheck.length) {
      setLoginErr("לא נטענו משתמשים. בדוק Google Sheets.");
      setLoginLoading(false);
      setAction("login", "error", 2200);
      haptic("medium");
      return;
    }

    const found = usersToCheck.find(u =>
      String(u.username||"").toLowerCase().trim() === inputUser &&
      String(u.password||"").trim() === inputPass
    );

    if (found) {
      setAction("login", "success", 1200);
      _doLogin(found);
    } else {
      setLoginErr("שם משתמש או סיסמה שגויים");
      setAction("login", "error", 2200);
      haptic("medium");
    }
    setLoginLoading(false);
  };

  const saveTask = async (task) => {
    const isEdit=!!editTaskId;
    const cleanTask={...task, date: task.date?.slice(0,10)||todayStr()};
    const note = task.noteOverride !== undefined ? task.noteOverride : taskNote;
    const logEntry={at:nowStr(),note:note||(isEdit?"משימה עודכנה":"📋 משימה חדשה הוקצתה לך"),by:user?.name,needsAck:true,ackedBy:[]};
    const newTasks=isEdit?tasks.map(t=>t.id===editTaskId?{...t,...cleanTask,changeLog:[...(t.changeLog||[]),logEntry]}:t):[...tasks,{id:Date.now(),...cleanTask,status:"pending",changeLog:[logEntry]}];
    setTasks(newTasks); setEditTaskId(null); setTaskClient(""); setTaskClients([]); setTaskOps([]); setTaskNote("");
    if(sheetId) await sheetCall("saveTasks",{tasks:newTasks});
    if(isEdit) await sendNotificationToOperators(cleanTask.operators, "📋 משימה עודכנה", `${cleanTask.client?.split(" - ")[0] || ""} — ${fmtDate(cleanTask.date)}`);
    showToast(isEdit?"✏️ משימה עודכנה":"✅ משימה נוספה");
  };

  const updateTask = async (id,changes,logNote,isAdmin=false) => {
    const newTasks=tasks.map(t=>{ if(t.id!==id)return t; const entry={at:nowStr(),note:logNote,by:user?.name,...(isAdmin?{needsAck:true,ackedBy:[]}:{})}; return{...t,...changes,changeLog:[...(t.changeLog||[]),entry]}; });
    setTasks(newTasks); if(sheetId) await sheetCall("saveTasks",{tasks:newTasks});
    if(isAdmin) {
      const changedTask = newTasks.find(t=>t.id===id);
      await sendNotificationToOperators(changedTask?.operators || [], "📋 משימה עודכנה", `${changedTask?.client?.split(" - ")[0] || ""} — ${logNote}`);
    }
  };

  const ackChange = async (taskId,logIdx) => {
    const originalTask = tasks.find(t=>t.id===taskId);
    const originalLog = originalTask?.changeLog?.[logIdx];
    const newTasks=tasks.map(t=>{ if(t.id!==taskId)return t; const newLog=t.changeLog.map((e,i)=>{ if(i!==logIdx)return e; const ackedBy=[...(e.ackedBy||[])]; if(!ackedBy.includes(user?.name))ackedBy.push(user?.name); return{...e,ackedBy}; }); return{...t,changeLog:newLog}; });
    setTasks(newTasks); if(sheetId) await sheetCall("saveTasks",{tasks:newTasks});
    await sendNotificationToAdmins(
      "✅ מפעיל אישר משימה",
      `${user?.name || "מפעיל"} אישר: ${originalTask?.client?.split(" - ")[0] || "משימה"}${originalLog?.note ? ` — ${originalLog.note}` : ""}`
    );
    showToast("✓ קיבלת אישור נשלח");
  };

  const removeOp=async(id,n)=>{const t=tasks.find(x=>x.id===id);if(!t)return;await updateTask(id,{operators:t.operators.filter(o=>o!==n)},`הוסר ${n} מהמשימה`,true);await sendNotificationToOperators([n], "📋 הוסרת ממשימה", `${t.client?.split(" - ")[0] || ""} — ${fmtDate(t.date)}`);};
  const addOp=(id,n)=>{const t=tasks.find(x=>x.id===id);if(!t||t.operators.includes(n))return;updateTask(id,{operators:[...t.operators,n]},`נוסף ${n} למשימה`,true);};
  const markDone=(id)=>updateTask(id,{status:"done"},"דוח הוגש — בוצעה",false);

  const handleStartWork = () => {
    const now=new Date().toLocaleTimeString("he-IL",{hour:"2-digit",minute:"2-digit"});
    localStorage.setItem("galileo_workstart",now);
    setWorkStart(now);
    haptic("medium");
    showToast("▶ יום עבודה התחיל!");
    if(sheetId) sheetCall("saveWorkStart",{log:{username:user?.username||"",operator:user?.name,date:todayStr(),start:now}});
  };
  const handleEndWork = () => {
    if(!workStart)return;
    const end=new Date().toLocaleTimeString("he-IL",{hour:"2-digit",minute:"2-digit"});
    const [sh,sm]=workStart.split(":").map(Number); const [eh,em]=end.split(":").map(Number);
    const tot=(eh*60+em)-(sh*60+sm); const totalStr=`${Math.floor(tot/60)}:${String(tot%60).padStart(2,"0")}`;
    const log={id:Date.now(),operator:user?.name,date:todayStr(),start:workStart,end,total:totalStr};
    const newLogs=[...workLogs,log]; setWorkLogs(newLogs); localStorage.setItem("galileo_worklogs",JSON.stringify(newLogs)); localStorage.removeItem("galileo_workstart");
    setWorkStart(null); haptic("success"); showToast(`⏹ ${totalStr} שעות עבודה נשמרו`);
    if(sheetId) {
      sheetCall("clearWorkStart",{username:user?.username||"",operator:user?.name,date:todayStr()});
      sheetCall("saveWorkLog",{log});
    }
  };

  const buildWA = (r) => {
    const name=r.client?.split(" - ")[0]||"לקוח יקר"; const company = getCompany().name || "POOLMANG";
    const statusLine=r.poolStatus==="אחר"?`⚠️ *נדרשת תשומת לב:*\n${r.customStatusText}${r.restrictedUntil?`\nהבריכה לא זמינה עד ${fmtDate(r.restrictedUntil)}`:""}` :"✅ הבריכה מאוזנת ומוכנה לשימוש מלא";
    const waterLevelNotice = r.waterLevel==="לא תקין" ? `\n\n⚠️ לתשומת לבך חסר מים בבריכה נא למלא מים` : "";
    return `*טיפול בריכה הושלם!*\n\nשלום ${name},\n\n${user?.name} סיים את הטיפול בבריכה שלכם היום.\n\n${statusLine}${waterLevelNotice}${r.notes?`\n\n📝 ${r.notes}`:""}\n\nתמיד כאן בשבילכם,\n_צוות ${company}_`;
  };

  const handleSubmit = async () => {
    if (!client || syncing || isActionLoading("submitReport")) return;
    setAction("submitReport", "loading");
    setSyncing(true);
    const elNext=calcNext(elDate);
    const supplyLabel=[acid&&"חומצת מלח",phUpSupply&&"מעלה pH",saltPkg&&`מלח ×${saltBags}`].filter(Boolean).join(", ");
    if(client&&(acid||phUpSupply||saltPkg||supplyStatus)){ const supplyText=supplyStatus==="לא סופק"?`לא סופק${String(supplyNote||"").trim()?`: ${String(supplyNote||"").trim()}`:""}`:supplyStatus; const newDB={...supplyDB,[client]:{acid,phUpSupply,saltPkg,saltBags,supplyNote:supplyText,updatedAt:fmtDate(reportDate)}}; setSupplyDB(newDB); if(sheetId){const rows=Object.entries(newDB).map(([c,v])=>[c,v.acid?"כן":"לא",v.phUpSupply?"כן":"לא",v.saltPkg?"כן":"לא",v.saltBags||0,v.updatedAt,v.supplyNote||""]);await sheetCall("saveSupplyDB",{rows});} }
    const match=tasks.find(t=>t.date===reportDate&&t.client===client&&t.operators.includes(user?.name)&&t.status!=="done"); if(match)markDone(match.id);
    let photosBase64 = [];
    if(photos.length>0){ photosBase64 = await Promise.all(photos.map(url=> fetch(url).then(r=>r.blob()).then(blob=>new Promise(res=>{ const reader=new FileReader(); reader.onload=e=>res(e.target.result.split(",")[1]); reader.readAsDataURL(blob); })) )); }
const report = {
  id: crypto.randomUUID(),
  reportDate,
  operator:user?.name||"",
  client,
  chlorine,
  ph,
  salt,
  chlora:form.chlora>0?form.chlora:undefined,
  hth:form.hth>0?form.hth:undefined,
  phUp:form.phUp>0?form.phUp:undefined,
  acidLiters:form.acidLiters>0?form.acidLiters:undefined,
  elModel,
  elSerial,
  elDate,
  elNext:elNext||"",
  supplyLabel,
  waterLevel,
  clarity,
  fat,
  flow,
  poolStatus,
  customStatusText,
  restrictedUntil,
  notes,
  photosCount:photos.length
};
    setReports(r=>[...r,report]);
    let saved=false;
    const adminEmail = getCompany().adminEmail||"";
       if (sheetId) {
      const res = await sheetCall("saveReport", {
        report,
        photos: photosBase64,
        adminEmail,
        clientAddress: clientAddress(client),
        clientPhone: clientPhone(client),
      }).catch(() => null);

      saved = res?.success === true;

      if (saved && !res?.duplicate && user?.role !== "admin") {
        void sendNotificationToAdmins(
          `✅ דוח בוצע: ${client}`,
          `${user?.name || "מפעיל"} שלח דוח · כלור ${report.chlorine}, pH ${report.ph}`
        ).catch(e => console.warn("Admin report notification failed", e));
      }
    }

    if (!saved) {
      setPending(p => [...p, report]);
      setDismissed(false);
      setAction("submitReport", "local", 2200);
      showToast("⚠️ הדוח נשמר מקומית");
    } else {
      setAction("submitReport", "success", 1200);
      showToast("✅ הדוח נשלח");
    }

    setSyncing(false);

    const phone = clientPhone(client);
    const waMsg = buildWA(report);
    const waUrl = phone
      ? `https://wa.me/972${phone.replace(/^0/, "")}?text=${encodeURIComponent(waMsg)}`
      : `https://wa.me/?text=${encodeURIComponent(waMsg)}`;

    window.open(waUrl, "_blank");
    setScreen("done");
  };

  const syncPendingReports = async () => {
    if (!pending.length || syncing || isActionLoading("syncPending")) return;
    setAction("syncPending", "loading");
    setSyncing(true);

    let ok = true;
    for (const r of pending) {
      const res = await sheetCall("saveReport",{report:r}).catch(()=>null);
      if(!res?.success) ok=false;
    }

    if(ok){
      setPending([]);
      setAction("syncPending", "success", 1600);
      showToast("✅ כל הדוחות נשלחו!");
    } else {
      setAction("syncPending", "error", 2200);
      showToast("⚠️ חלק מהדוחות עדיין ממתינים");
    }

    setSyncing(false);
  };

  const openManualReport = async () => {
    if (isActionLoading("openManualReport")) return;
    setAction("openManualReport", "loading");
    haptic("medium");

    try {
      if(freeClients.length===0){
        const res = await sheetCall("getFreeClients");
        if(res?.clients?.length) setFreeClients(res.clients);
      }
      setForm(blank());
      setScreen("form");
    } finally {
      setAction("openManualReport", "idle");
    }
  };


  const clientSupply = (name) => supplyDB[name]||null;
  const largeSlider = String(user?.username||"").toLowerCase()==="or";

  const SLIDER_CONFIGS = [
    {key:"chlorine",label:"כלור",min:0,max:8,step:0.1,unit:" ppm",warnAbove:3,optimal:1.5,val:chlorine,fn:v=>sf("chlorine",v)},
    {key:"ph",label:"pH",min:5,max:9,step:0.1,unit:"",warnAbove:8,warnBelow:6,optimal:7.4,val:ph,fn:v=>sf("ph",v)},
    {key:"salt",label:"מלח",min:0,max:6,step:0.1,unit:" g/L",optimal:3.5,val:salt,fn:v=>sf("salt",v)},
    {key:"chlora",label:"טבליות כלור (TAB)",min:0,max:5,step:0.25,unit:"",val:form.chlora??0,fn:v=>sf("chlora",v)},
    {key:"hth",label:"HTH",min:0,max:5,step:0.5,unit:" cups",val:form.hth??0,fn:v=>updateMeasurement("hth",v)},
    {key:"phUp",label:"מעלה חומציות pH",min:0,max:5,step:0.5,unit:" כוסות",val:form.phUp??0,fn:v=>updateMeasurement("phUp",v)},
    {key:"acidLiters",label:"חומצת מלח",min:0,max:5,step:0.5,unit:" L",val:form.acidLiters??0,fn:v=>sf("acidLiters",v)},
  ];

  if (showSetup) return (
    <>
      <LicenseScreen onDone={()=>{ const c=getCompany(); setCompanyName(c.name||"POOLMANG"); setShowSetup(false); }} onSuperAdmin={()=>setShowSuperAdmin(true)}/>
      {showSuperAdmin&&<SuperAdminScreen onClose={()=>setShowSuperAdmin(false)}/>}
    </>
  );

  if(screen==="login") return (
    <div dir="rtl" style={{minHeight:"100vh",background:"linear-gradient(145deg,#0d47a1,#1565c0,#1976d2)",fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');*{-webkit-tap-highlight-color:transparent;box-sizing:border-box}input[type=range]{-webkit-appearance:none;height:6px;border-radius:99px;background:transparent}input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:#1565c0;box-shadow:0 2px 8px rgba(21,101,192,0.4)}textarea,input,select{font-family:'Plus Jakarta Sans',sans-serif}#onesignal-bell-container{display:none!important}`}</style>
      {showSuperAdmin&&<SuperAdminScreen onClose={()=>setShowSuperAdmin(false)}/>}
      <div style={{width:"100%",maxWidth:360}}>
        <div style={{textAlign:"center",marginBottom:36}} onPointerDown={()=>{ logoLongPress.current = setTimeout(()=>{ haptic("success"); setShowSetup(true); }, 3000); }} onPointerUp={()=>clearTimeout(logoLongPress.current)} onPointerLeave={()=>clearTimeout(logoLongPress.current)}>
          {(()=>{ const logoUrl = getCompany().logoUrl; return logoUrl ? (<img src={logoUrl} alt="logo" style={{width:80,height:80,objectFit:"contain",marginBottom:12,filter:"drop-shadow(0 0 20px rgba(255,255,255,0.3))",borderRadius:12}}/>) : (<div style={{fontSize:60,marginBottom:12,filter:"drop-shadow(0 0 20px rgba(255,255,255,0.3))",cursor:"pointer",userSelect:"none"}}>🌊</div>); })()}
          <h1 style={{color:"#fff",fontSize:24,fontWeight:900,margin:"0 0 6px",letterSpacing:"-0.5px"}}>{companyName}</h1>
          <p style={{color:"rgba(255,255,255,0.6)",fontSize:14,margin:0}}>מערכת ניהול בריכות</p>
          {clientPlan.plan&&(
            <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:12}}>
              <span style={{background:"rgba(255,255,255,0.2)",borderRadius:99,padding:"4px 14px",fontSize:12,fontWeight:800,color:"#fff"}}>{clientPlan.plan==="PRO"?"💎 PRO":clientPlan.plan==="Basic"?"⚡ Basic":"🔬 ניסיון"}</span>
              <span style={{background:clientPlan.status==="פעיל"?"rgba(46,125,50,0.5)":"rgba(198,40,40,0.5)",borderRadius:99,padding:"4px 14px",fontSize:12,fontWeight:800,color:"#fff"}}>{clientPlan.status==="פעיל"?"✅ פעיל":"⛔ "+clientPlan.status}</span>
            </div>
          )}
        </div>
        <div style={{background:"#fff",borderRadius:24,padding:24,boxShadow:"0 20px 60px rgba(0,0,0,0.25)"}}>
          <h2 style={{fontSize:18,fontWeight:900,color:C.text,margin:"0 0 20px",textAlign:"center"}}>כניסה למערכת</h2>
          <div style={{marginBottom:12}}><label style={{fontSize:12,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>שם משתמש</label><input value={loginUser} onChange={e=>setLoginUser(e.target.value)} placeholder="הכנס שם משתמש" style={inp} onKeyDown={e=>e.key==="Enter"&&handleLogin()}/></div>
          <div style={{marginBottom:loginErr?12:20}}><label style={{fontSize:12,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>סיסמה</label><input type="password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} placeholder="הכנס סיסמה" style={inp} onKeyDown={e=>e.key==="Enter"&&handleLogin()}/></div>
          {loginErr&&<div style={{background:"#ffebee",borderRadius:10,padding:"10px 14px",marginBottom:16,color:C.red,fontSize:13,fontWeight:700,textAlign:"center"}}>⚠️ {loginErr}</div>}
          <Press onClick={handleLogin} style={{padding:16,borderRadius:14,background:loginLoading?"#90caf9":`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:900,fontSize:16,textAlign:"center",boxShadow:loginLoading?"none":"0 6px 20px rgba(21,101,192,0.4)"}}>
            {actionLabel("login",{idle:"כניסה →",loading:"⏳ מתחבר...",success:"✅ התחברת",error:"⚠️ נסה שוב"})}
          </Press>
        </div>
        <InstallAppCard/>
        <p style={{textAlign:"center",fontSize:11,color:"rgba(255,255,255,0.35)",marginTop:16,marginBottom:0,letterSpacing:"0.05em"}}>POOLMANG.BY.OR2026 {APP_VERSION}</p>
      </div>
      <Toast msg={toast.msg} visible={toast.visible}/>
    </div>
  );

  if(screen==="daily") {
    const dayTasks = dayClientProfiles(dailyDate);
    const done = todayReported.filter(c=>dayTasks.some(t=>t.client===c)).length;
    return (
      <div dir="rtl" style={{minHeight:"100vh",background:C.bg,fontFamily:"'Plus Jakarta Sans',sans-serif",paddingBottom:90}}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');*{-webkit-tap-highlight-color:transparent;box-sizing:border-box;user-select:none;-webkit-user-select:none}input,textarea,select{user-select:text;-webkit-user-select:text}input[type=range]{-webkit-appearance:none;height:6px;border-radius:99px;background:transparent}input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:${C.blue};box-shadow:0 2px 8px rgba(21,101,192,0.4)}textarea,input,select{font-family:'Plus Jakarta Sans',sans-serif}#onesignal-bell-container{display:none!important}`}</style>
        <div style={{background:`linear-gradient(145deg,#0d47a1,${C.blue},${C.lightBlue})`,padding:"28px 20px 44px",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:-50,left:-50,width:200,height:200,borderRadius:"50%",background:"rgba(255,255,255,0.05)"}}/>
          <div style={{position:"relative",display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
            <div>
              <p style={{color:"rgba(255,255,255,0.65)",fontSize:12,fontWeight:600,margin:"0 0 4px"}}>{fmtDate(dailyDate)} 🌊</p>
              <h1 style={{color:"#fff",fontSize:24,fontWeight:900,margin:0,lineHeight:1.1}}>שלום, {user?.name}! {user?.icon}</h1>
              <p style={{color:"rgba(255,255,255,0.7)",fontSize:13,margin:"4px 0 0"}}>{greeting || user?.welcomeMessage}</p>
              {clientPlan.plan&&(
                <div style={{display:"flex",gap:6,marginTop:8}}>
                  <span style={{background:"rgba(255,255,255,0.2)",borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:800,color:"#fff"}}>{clientPlan.plan==="PRO"?"💎 PRO":clientPlan.plan==="Basic"?"⚡ Basic":"🔬 ניסיון"}</span>
                  <span style={{background:clientPlan.status==="פעיל"?"rgba(46,125,50,0.4)":"rgba(198,40,40,0.4)",borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:800,color:"#fff"}}>{clientPlan.status==="פעיל"?"✅ פעיל":"⛔ "+clientPlan.status}</span>
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <div onPointerDown={()=>{logoLongPress.current=setTimeout(()=>{haptic("success");setShowSetup(true);},3000);}} onPointerUp={()=>clearTimeout(logoLongPress.current)} onPointerLeave={()=>clearTimeout(logoLongPress.current)} style={{fontSize:18,cursor:"pointer",userSelect:"none",padding:"4px 6px",color:"rgba(255,255,255,0.4)"}}>⚙️</div>
              <Press onClick={handleLogout} style={{background:"rgba(255,255,255,0.15)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:12,padding:"8px 12px",color:"rgba(255,255,255,0.8)",fontSize:12,fontWeight:700}}>יציאה</Press>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,position:"relative"}}>
            {[[`${done}/${dayTasks.length}`,"משימות","📋"],[`${dayTasks.length>0?Math.round((done/dayTasks.length)*100):0}%`,"הושלם","✅"],[workStart?workStart:"--:--","התחלה","⏱️"]].map(([n,l,ic])=>(
              <div key={l} style={{background:"rgba(255,255,255,0.15)",backdropFilter:"blur(8px)",borderRadius:14,padding:"12px 8px",textAlign:"center",border:"1px solid rgba(255,255,255,0.2)"}}>
                <div style={{fontSize:16,marginBottom:2}}>{ic}</div>
                <div style={{color:"#fff",fontSize:18,fontWeight:900,lineHeight:1}}>{n}</div>
                <div style={{color:"rgba(255,255,255,0.65)",fontSize:10,fontWeight:600,marginTop:2}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{margin:"-20px 16px 0",position:"relative",zIndex:10}}>
          <InstallAppCard compact/>
          <PushSetupCard/>
          <div style={{...card({marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}),padding:"14px 18px"}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4}}>שעון עבודה</div>
              <div style={{fontSize:16,fontWeight:800,color:workStart?C.blue:C.muted}}>{workStart?`▶ פעיל מ-${workStart}`:"לא התחיל"}</div>
            </div>
            <Press onClick={workStart?handleEndWork:handleStartWork} style={{padding:"11px 18px",borderRadius:12,border:"none",color:"#fff",fontWeight:800,fontSize:13,background:workStart?`linear-gradient(135deg,#c62828,#ef5350)`:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,boxShadow:`0 4px 14px ${workStart?"rgba(198,40,40,0.3)":"rgba(21,101,192,0.35)"}`}}>
              {workStart?"⏹ סיום":"▶ התחלה"}
            </Press>
          </div>
          {dayTasks.length>0&&<div style={{...card(),padding:"14px 18px",marginBottom:4}}><PBar done={done} total={dayTasks.length}/></div>}
        </div>
        <div style={{padding:"16px 16px 0"}}>
          {pending.length>0&&!dismissed&&(
            <div style={{...card({background:"#fff8e1",border:"1px solid #ffe082",marginBottom:12,display:"flex",alignItems:"center",gap:10}),padding:"12px 16px"}}>
              <span style={{fontSize:18}}>⚠️</span>
              <div style={{flex:1}}><div style={{fontWeight:800,fontSize:13,color:C.orange}}>{pending.length} דוחות ממתינים לשליחה</div><div style={{fontSize:11,color:C.muted}}>שמורים מקומית — לחץ לשליחה</div></div>
              <Press onClick={syncPendingReports} style={{background:C.orange,borderRadius:99,padding:"6px 12px",color:"#fff",fontWeight:800,fontSize:12}}>{actionLabel("syncPending",{idle:"שלח",loading:"⏳ שולח...",success:"✅ נשלח",error:"⚠️ נסה שוב"})}</Press>
              <Press onClick={()=>setDismissed(true)} style={{color:C.muted,fontSize:18,padding:"0 4px"}}>✕</Press>
            </div>
          )}
          <Press onClick={openManualReport} disabled={isActionLoading("openManualReport")} style={{...card({marginBottom:16,display:"flex",alignItems:"center",gap:12,border:`2px dashed ${C.lightBlue}`,background:isActionLoading("openManualReport")?"#e3f2fd":"#f5f9ff",opacity:isActionLoading("openManualReport")?0.75:1}),padding:"14px 18px"}}>
            <div style={{width:40,height:40,borderRadius:12,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>📝</div>
            <div><div style={{fontWeight:800,fontSize:15,color:C.blue}}>{isActionLoading("openManualReport")?"⏳ פותח דוח...":"+ פתח דוח חדש"}</div><div style={{fontSize:12,color:C.muted}}>דוח ידני — לקוח מכל הרשימה</div></div>
          </Press>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div>
              <h2 style={{fontSize:12,fontWeight:800,color:C.muted,letterSpacing:"0.1em",textTransform:"uppercase",margin:0}}>סידור יומי</h2>
              <div style={{fontSize:13,fontWeight:800,color:C.blue,marginTop:2}}>יום {dateDayName(dailyDate)}</div>
            </div>
            <input type="date" value={dailyDate} onChange={e=>setDailyDate(e.target.value)} style={{fontSize:12,fontWeight:700,color:C.blue,border:"none",background:"transparent",outline:"none",cursor:"pointer"}}/>
          </div>
          <div style={{marginBottom:12,position:"relative"}}>
            <input value={clientSearch} onChange={e=>setClientSearch(e.target.value)} placeholder="🔍 חפש לקוח מכל הימים..." style={{...inp,fontSize:13}}/>
            {clientSearch&&(
              <div style={{position:"absolute",top:"100%",right:0,left:0,background:"#fff",borderRadius:12,boxShadow:"0 8px 24px rgba(0,0,0,0.15)",zIndex:100,maxHeight:240,overflowY:"auto",border:`1px solid ${C.border}`,marginTop:4}}>
                {[...clients,...unassignedClients.filter(uc=>!clients.find(c=>c.name===uc.name))].filter(c=>c.name.toLowerCase().includes(clientSearch.toLowerCase())).map(c=>(
                  <Press key={c.name} onClick={()=>{ setForm({...blank(),client:c.name,reportDate:dailyDate,clientLocked:true}); setClientSearch(""); setScreen("form"); haptic(); }} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderBottom:`1px solid ${C.border}`,background:"#fff"}}>
                    <div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff",flexShrink:0}}>{(c.poolType==="כלור")?"🧪":(c.poolType==="גלישה")?"🌊":(c.poolType==="סקימר")?"🔵":"🧂"}</div>
                    <div><div style={{fontWeight:700,fontSize:13,color:C.text}}>{c.name.split(" - ")[0]}</div>{c.address&&<div style={{fontSize:11,color:C.muted}}>{c.address}</div>}</div>
                  </Press>
                ))}
                {[...clients,...unassignedClients].filter(c=>c.name.toLowerCase().includes(clientSearch.toLowerCase())).length===0&&<div style={{padding:"14px 16px",color:C.muted,fontSize:13}}>לא נמצא לקוח</div>}
              </div>
            )}
          </div>
          {dayTasks.length===0&&<div style={{...card({textAlign:"center"}),padding:32}}><div style={{fontSize:40,marginBottom:8}}>📭</div><div style={{fontWeight:700,color:C.muted,fontSize:14}}>אין לקוחות לתאריך זה</div></div>}
          {dayTasks.map((t,i)=>{
            const isDone = todayReported.includes(t.client);
            const doneKey = `${dailyDate}:${t.id || t.client}`;
            const isDoneOpen = !!openDoneTasks[doneKey];
            const supply = clientSupply(t.client);
            const lastLog = t.changeLog?.[t.changeLog.length-1];
            const needsAck = lastLog?.needsAck && !(lastLog?.ackedBy||[]).includes(user?.name);
            const logIdx = t.changeLog?t.changeLog.length-1:-1;
            if(isDone && !isDoneOpen) {
              return (
                <div key={t.id} style={{...card({marginBottom:8,opacity:0.82,border:"2px solid #c8e6c9",padding:"10px 12px",display:"flex",alignItems:"center",gap:10})}}>
                  <div style={{width:30,height:30,borderRadius:"50%",background:"#e8f5e9",display:"flex",alignItems:"center",justifyContent:"center",color:C.green,fontWeight:900,flexShrink:0}}>✓</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:900,fontSize:14,color:C.text,textDecoration:"line-through",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.client.split(" - ")[0]}</div>
                    {clientAddress(t.client)&&<div style={{fontSize:11,color:C.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{clientAddress(t.client)}</div>}
                  </div>
                  <Badge label="בוצע" col={C.green}/>
                  <Press onClick={()=>{setOpenDoneTasks(x=>({...x,[doneKey]:true}));haptic();}} style={{width:34,height:34,borderRadius:10,background:"#f0f4f8",color:C.blue,fontWeight:900,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    ▾
                  </Press>
                </div>
              );
            }
            const poolType = (clients.find(c=>c.name===t.client)||{}).poolType||"מלח";
            const poolIcon = poolType==="כלור"?"🧪":poolType==="גלישה"?"🌊":poolType==="סקימר"?"🔵":"🧂";
            return (
              <div key={t.id} style={{...card({marginBottom:12,opacity:isDone?0.65:1,border:`2px solid ${needsAck?"#ff9800":isDone?"#c8e6c9":C.border}`,transition:"all 0.3s"})}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <div style={{width:40,height:40,borderRadius:"50%",background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{poolIcon}</div>
                      <div>
                        <div style={{fontWeight:900,fontSize:16,color:C.text,textDecoration:isDone?"line-through":"none"}}>{t.client.split(" - ")[0]}</div>
                        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginTop:2}}>
                          <span style={{fontSize:10,fontWeight:700,background:poolType==="כלור"?"#e3f2fd":poolType==="גלישה"?"#e0f7fa":poolType==="סקימר"?"#e8eaf6":"#e8f5e9",color:poolType==="כלור"?C.blue:poolType==="גלישה"?"#006064":poolType==="סקימר"?"#3949ab":C.green,borderRadius:99,padding:"2px 8px"}}>{poolType}</span>
                          {clientAddress(t.client)&&<span style={{fontSize:11,color:C.muted}}>📍 {clientAddress(t.client)}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                    <Badge label={isDone?"✓ בוצע":"⏳ ממתין"} col={isDone?C.green:C.orange}/>
                    {isDone&&<Press onClick={()=>{setOpenDoneTasks(x=>({...x,[doneKey]:false}));haptic();}} style={{padding:"6px 10px",borderRadius:10,background:"#f0f4f8",color:C.blue,fontWeight:900,fontSize:12}}>סגור</Press>}
                    {!isDone&&<Press onClick={()=>{setForm({...blank(),client:t.client,reportDate:dailyDate,clientLocked:true});setScreen("form");}} style={{padding:"8px 14px",borderRadius:10,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:800,fontSize:12,boxShadow:"0 3px 10px rgba(21,101,192,0.3)"}}>📝 דוח</Press>}
                  </div>
                </div>
                {needsAck&&(
                  <div style={{background:"#fff8e1",borderRadius:10,padding:"10px 12px",marginBottom:10,border:"1px solid #ffe082"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#e65100",marginBottom:4}}>🔔 {lastLog.note}</div>
                    <div style={{fontSize:10,color:"#bf6900",marginBottom:8}}>{lastLog.at} · {lastLog.by}</div>
                    <Press onClick={()=>{ackChange(t.id,logIdx);haptic("success");}} style={{padding:"8px 16px",borderRadius:99,background:"#e65100",color:"#fff",fontWeight:800,fontSize:12,display:"inline-block"}}>קיבלתי ✓</Press>
                  </div>
                )}
                {(()=>{const lr=lastReadings[t.client];if(!lr)return null;
                  return (
                    <div style={{marginBottom:10}}>
                      <div style={{background:"#e3f2fd",borderRadius:10,padding:"8px 12px",marginBottom:6,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                        <span style={{fontSize:12,fontWeight:700,color:C.blue}}>📊 מדידה אחרונה:</span>
                        <span style={{fontSize:12,fontWeight:800,color:"#1565c0"}}>Cl: {lr.chlorine}</span>
                        <span style={{fontSize:12,fontWeight:800,color:"#6a1b9a"}}>pH: {lr.ph}</span>
                        {lr.chlora>0&&<span style={{fontSize:12,fontWeight:800,color:"#e65100"}}>TAB: {lr.chlora}</span>}
                        {lr.hth>0&&<span style={{fontSize:12,fontWeight:800,color:"#283593"}}>HTH: {lr.hth} cups</span>}
                        {lr.phUp>0&&<span style={{fontSize:12,fontWeight:800,color:"#6a1b9a"}}>pH+: {lr.phUp} כוסות</span>}
                        {lr.acidLiters>0&&<span style={{fontSize:12,fontWeight:800,color:C.red}}>חומצה: {lr.acidLiters}L</span>}
                        <span style={{fontSize:10,color:C.muted,marginRight:"auto"}}>{lr.date}</span>
                      </div>
                      {String(lr.poolStatus||"").trim()==="\u05de\u05d0\u05d5\u05d6\u05e0\u05ea"&&String(lr.customStatusText||"").trim()&&(
                        <div style={{background:"#f5f9ff",borderRadius:10,padding:"8px 12px",marginBottom:6,border:`1px solid ${C.border}`,fontSize:12,color:C.muted,lineHeight:1.5}}>
                          <span style={{fontWeight:800,color:C.blue}}>{"\uD83D\uDCDD \u05d4\u05e2\u05e8\u05d4 \u05e4\u05e0\u05d9\u05de\u05d9\u05ea: "}</span>
                          {lr.customStatusText}
                        </div>
                      )}
                      {lr.missedTreatment&&(
                        <div style={{background:"#fff8e1",borderRadius:10,padding:"8px 12px",marginBottom:6,border:"1px solid #ffe082",fontSize:12,color:C.orange,fontWeight:800}}>
                          ⚠️ לא בוצע טיפול בתאריך {fmtDate(String(lr.date||"").slice(0,10))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {supply&&!isDone&&(
                  <div style={{background:"#e3f2fd",borderRadius:10,padding:"8px 12px",marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.blue,marginBottom:4}}>📦 ציוד נדרש:</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {supply.acid&&<span style={{background:C.white,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700,color:C.text,border:"1px solid "+C.border}}>🧪 חומצת מלח</span>}
                      {supply.phUpSupply&&<span style={{background:C.white,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700,color:C.text,border:"1px solid "+C.border}}>📈 מעלה pH</span>}
                      {supply.saltPkg&&<span style={{background:C.white,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700,color:C.text,border:"1px solid "+C.border}}>🧂 מלח ×{supply.saltBags}</span>}
                    </div>
                  </div>
                )}
                {clientGateCode(t.client)&&(
                  <Press onClick={()=>{setShowGateCode(g=>({...g,[t.client]:!g[t.client]}));haptic();}} style={{display:"inline-flex",alignItems:"center",gap:6,marginBottom:8,padding:"6px 14px",background:showGateCode[t.client]?"#fff3e0":"#f0f4f8",borderRadius:99,border:`1px solid ${showGateCode[t.client]?"#ffb74d":C.border}`}}>
                    <span style={{fontSize:12}}>🔑</span>
                    <span style={{fontSize:12,fontWeight:800,color:showGateCode[t.client]?C.orange:C.muted}}>{showGateCode[t.client]?clientGateCode(t.client):"הצג קוד שער"}</span>
                  </Press>
                )}
                {!isDone&&(
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {clientAddress(t.client)&&<a href={wazeUrl(clientAddress(t.client))} target="_blank" rel="noreferrer" style={{padding:"10px 14px",borderRadius:12,background:"#e8f5e9",color:C.green,fontWeight:800,fontSize:13,textDecoration:"none",textAlign:"center",border:"2px solid #c8e6c9",display:"flex",alignItems:"center",gap:4}}>🗺️ נווט</a>}
                    {clientPhone(t.client)&&<a href={`tel:${clientPhone(t.client)}`} style={{padding:"10px 14px",borderRadius:12,background:"#f3e5f5",color:"#6a1b9a",fontWeight:800,fontSize:13,textDecoration:"none",textAlign:"center",border:"2px solid #e1bee7",display:"flex",alignItems:"center",gap:4}}>📞</a>}
                  </div>
                )}
                <div style={{marginTop:isDone?0:8}}>
                  <Press onClick={()=>{setOpIssueClient(t.client);setShowOperatorIssue(true);haptic();}} style={{padding:"8px 14px",borderRadius:12,background:"#fff8e1",color:C.orange,fontWeight:800,fontSize:12,border:"1px solid #ffe082",display:"inline-flex",alignItems:"center",gap:6}}>🔧 דווח תקלה</Press>
                </div>
              </div>
            );
          })}
          {done===dayTasks.length&&dayTasks.length>0&&!clientSearch&&(
            <div style={{...card({textAlign:"center",background:"linear-gradient(135deg,#e8f5e9,#f1f8e9)"}),padding:28,border:"2px solid #c8e6c9"}}>
              <div style={{fontSize:44,marginBottom:8}}>🎉</div>
              <div style={{fontWeight:900,fontSize:18,color:C.green,marginBottom:4}}>סיימת הכל!</div>
              <div style={{color:C.muted,fontSize:13}}>יום עבודה מוצלח!</div>
            </div>
          )}
        </div>
        <div style={{position:"fixed",bottom:0,right:0,left:0,background:C.white,borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-around",padding:"10px 0 20px",boxShadow:"0 -4px 20px rgba(0,0,0,0.06)"}}>
          {[["🏠","בית",0],["📋","משימות",1],["📅","עתידי",2]].map(([ic,lb,idx])=>(
            <Press key={lb} onClick={()=>{ setNavTab(idx); haptic(); }} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"4px 10px",borderRadius:12,background:navTab===idx?"#e3f2fd":"transparent"}}>
              <span style={{fontSize:22}}>{ic}</span>
              <span style={{fontSize:10,fontWeight:800,color:navTab===idx?C.blue:C.muted}}>{lb}</span>
            </Press>
          ))}
        </div>
        {navTab===1&&(
          <BottomSheet title="📋 משימות היום" onClose={()=>setNavTab(0)}>
            {(()=>{
              const todayTasks = myTasks(dailyDate);
              if(todayTasks.length===0) return <div style={{textAlign:"center",padding:32,color:C.muted}}><div style={{fontSize:40,marginBottom:8}}>📭</div><div style={{fontWeight:700}}>אין משימות להיום</div></div>;
              return todayTasks.map(t=>(
                <div key={t.id} style={{...card({marginBottom:10})}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div style={{fontWeight:800,fontSize:15,color:C.text}}>{t.client.split(" - ")[0]}</div>
                    <Badge label={t.status==="done"?"✓ בוצע":"⏳ ממתין"} col={t.status==="done"?C.green:C.orange}/>
                  </div>
                  {clientAddress(t.client)&&<div style={{fontSize:12,color:C.muted,marginBottom:6}}>📍 {clientAddress(t.client)}</div>}
                  {(t.changeLog?.[t.changeLog.length-1]?.note)&&<div style={{background:"#fff8e1",borderRadius:8,padding:"6px 10px",fontSize:12,color:C.orange,fontWeight:600,marginBottom:8}}>📝 {t.changeLog[t.changeLog.length-1].note}</div>}
                  {t.status!=="done"&&<Press onClick={()=>{setForm({...blank(),client:t.client,reportDate:dailyDate,clientLocked:true});setNavTab(0);setScreen("form");haptic();}} style={{padding:"8px 14px",borderRadius:10,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:800,fontSize:12,display:"inline-block"}}>📝 פתח דוח</Press>}
                </div>
              ));
            })()}
          </BottomSheet>
        )}
        {navTab===2&&(
          <BottomSheet title="📅 משימות עתידיות" onClose={()=>setNavTab(0)}>
            {(()=>{
              const today = todayStr();
              const futureTasks = tasks.filter(t=>{ const d = normalizeDate(t.date); return d > today && (t.operators||[]).some(op=>normalizeName(op)===normalizeName(user?.name)); }).sort((a,b)=>normalizeDate(a.date).localeCompare(normalizeDate(b.date)));
              if(futureTasks.length===0) return <div style={{textAlign:"center",padding:32,color:C.muted}}><div style={{fontSize:40,marginBottom:8}}>📭</div><div style={{fontWeight:700}}>אין משימות עתידיות</div></div>;
              const grouped = {};
              futureTasks.forEach(t=>{ const d = normalizeDate(t.date); if(!grouped[d]) grouped[d]=[]; grouped[d].push(t); });
              return Object.entries(grouped).map(([date, dts])=>(
                <div key={date} style={{marginBottom:20}}>
                  <div style={{fontSize:12,fontWeight:800,color:C.blue,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
                    <span>📅 {fmtDate(date)}</span>
                    <span style={{background:"#e3f2fd",borderRadius:99,padding:"2px 10px",color:C.blue,fontSize:11}}>{dts.length} משימות</span>
                  </div>
                  {dts.map(t=>(
                    <div key={t.id} style={{...card({marginBottom:8})}}>
                      <div style={{fontWeight:800,fontSize:15,color:C.text,marginBottom:4}}>{t.client.split(" - ")[0]}</div>
                      {clientAddress(t.client)&&<div style={{fontSize:12,color:C.muted,marginBottom:6}}>📍 {clientAddress(t.client)}</div>}
                      {(t.changeLog?.[t.changeLog.length-1]?.note)&&<div style={{background:"#fff8e1",borderRadius:8,padding:"6px 10px",fontSize:12,color:C.orange,fontWeight:600}}>📝 {t.changeLog[t.changeLog.length-1].note}</div>}
                      {clientAddress(t.client)&&<a href={wazeUrl(clientAddress(t.client))} target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:8,padding:"6px 12px",background:"#e8f5e9",borderRadius:8,color:C.green,fontSize:12,fontWeight:700,textDecoration:"none"}}>🗺️ נווט</a>}
                    </div>
                  ))}
                </div>
              ));
            })()}
          </BottomSheet>
        )}
        {showOperatorIssue&&(
          <BottomSheet title="🔧 דווח על תקלה" onClose={()=>setShowOperatorIssue(false)}>
            <div>
              <div style={{marginBottom:12}}><label style={{fontSize:12,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>לקוח</label><div style={{...inp,color:C.blue,fontWeight:700}}>{opIssueClient}</div></div>
              <div style={{marginBottom:12}}><label style={{fontSize:12,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>תיאור התקלה</label><textarea value={opIssueDesc} onChange={e=>setOpIssueDesc(e.target.value)} rows={3} placeholder="תאר את הבעיה..." style={{...inp,resize:"none"}}/></div>
              <div style={{marginBottom:16}}>
                <label style={{fontSize:12,fontWeight:700,color:C.muted,display:"block",marginBottom:8}}>דחיפות</label>
                <div style={{display:"flex",gap:8}}>{["רגיל","דחוף","קריטי"].map(p=>(<Press key={p} onClick={()=>setOpIssuePriority(p)} style={{flex:1,padding:"10px",borderRadius:10,textAlign:"center",fontSize:13,fontWeight:800,background:opIssuePriority===p?(p==="קריטי"?C.red:p==="דחוף"?C.orange:C.blue):"#f0f4f8",color:opIssuePriority===p?"#fff":C.muted}}>{p}</Press>))}</div>
              </div>
              <Press onClick={async()=>{ if(!opIssueDesc.trim()){showToast("⚠️ נא לתאר את התקלה");return;} await sheetCall("saveOperatorIssue",{operator:user?.name,client:opIssueClient,desc:opIssueDesc,priority:opIssuePriority,date:todayStr()}); setOpIssueDesc("");setOpIssuePriority("רגיל");setShowOperatorIssue(false); showToast("✅ תקלה דווחה לאדמין");haptic("success"); }} style={{padding:"14px",borderRadius:14,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:900,fontSize:15,textAlign:"center",boxShadow:"0 4px 14px rgba(21,101,192,0.3)"}}>שלח דיווח →</Press>
            </div>
          </BottomSheet>
        )}
        {/* QR ושיחה מוסתרים זמנית */}
        <Toast msg={toast.msg} visible={toast.visible}/>
      </div>
    );
  }

  if(screen==="form") return (
    <div dir="rtl" style={{minHeight:"100vh",background:C.bg,fontFamily:"'Plus Jakarta Sans',sans-serif",paddingBottom:100}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');*{-webkit-tap-highlight-color:transparent;box-sizing:border-box;user-select:none;-webkit-user-select:none}input,textarea,select{user-select:text;-webkit-user-select:text}input[type=range]{-webkit-appearance:none;height:8px;border-radius:99px;background:transparent}input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:32px;height:32px;border-radius:50%;background:${C.blue};box-shadow:0 2px 8px rgba(21,101,192,0.4)}select option{background:#fff}#onesignal-bell-container{display:none!important}`}</style>
      <div style={{background:`linear-gradient(145deg,#0d47a1,${C.blue},${C.lightBlue})`,padding:"24px 20px 28px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-40,left:-40,width:160,height:160,borderRadius:"50%",background:"rgba(255,255,255,0.05)"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative"}}>
          <div><p style={{color:"rgba(255,255,255,0.65)",fontSize:12,fontWeight:600,margin:"0 0 4px"}}>{form.clientLocked?form.client.split(" - ")[0]:"בחר לקוח"}</p><h1 style={{color:"#fff",fontSize:22,fontWeight:900,margin:0}}>📝 דוח טיפול</h1></div>
          <Press onClick={()=>setScreen("daily")} style={{background:"rgba(255,255,255,0.15)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:12,padding:"8px 14px",color:"rgba(255,255,255,0.8)",fontSize:13,fontWeight:700}}>← חזרה</Press>
        </div>
      </div>
      <div style={{padding:"20px 16px 0"}}>
        <Sec icon="📋" title="פרטים">
          <div style={{...card(),marginBottom:12}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
              <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>תאריך</label><input type="date" value={reportDate} onChange={e=>sf("reportDate",e.target.value)} style={inp}/></div>
              <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>מפעיל</label><div style={{...inp,color:C.blue,fontWeight:700,display:"flex",alignItems:"center",gap:6,cursor:"default"}}><span>{user?.icon}</span>{user?.name}</div></div>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>לקוח</label>
              {form.clientLocked?(
                <div style={{...inp,color:C.blue,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"default"}}><span>🏊 {client}</span><span style={{fontSize:12,color:C.muted}}>🔒</span></div>
              ):(
                <select value={client} onChange={e=>sf("client",e.target.value)} style={sel}>
                  <option value="">בחר לקוח...</option>
                  {clients.length>0&&<optgroup label="לקוחות קבועים">{clients.map(c=><option key={c.name}>{c.name}</option>)}</optgroup>}
                  {freeClients.length>0&&<optgroup label="לקוחות נוספים">{freeClients.map(c=><option key={c.name}>{c.name}</option>)}</optgroup>}
                </select>
              )}
              {client&&clientPhone(client)&&<a href={`tel:${clientPhone(client)}`} style={{display:"flex",alignItems:"center",gap:8,marginTop:8,padding:"10px 14px",background:"#e8f5e9",border:`1px solid #c8e6c9`,borderRadius:12,textDecoration:"none",color:C.green,fontSize:13,fontWeight:700}}><span>📞</span><span>{client.split(" - ")[0]}</span><span style={{color:C.muted,fontSize:12,marginRight:"auto"}}>לחץ לחיוג</span></a>}
            </div>
          </div>
        </Sec>

        <Sec icon="📊" title="מדידות">
          {SLIDER_CONFIGS.map(s=>(
            <CollapsibleSlider key={s.key} label={s.label} min={s.min} max={s.max} step={s.step} unit={s.unit} warnAbove={s.warnAbove} warnBelow={s.warnBelow} optimal={s.optimal} val={s.val} fn={s.fn} large={largeSlider} expandKey={`_exp_${s.key}`} form={form} sf={sf}/>
          ))}
        </Sec>

        {form.adminReport&&(()=>{
          const poolType = (clients.find(c=>c.name===client)||{}).poolType||"";
          const isSalt = !poolType || poolType==="מלח" || poolType==="גלישה" || poolType==="סקימר";
          if(!isSalt) return null;
          return (
            <Sec icon="⚡" title="אלקטרודה">
              <div style={{...card()}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>דגם</label><input value={elModel} onChange={e=>sf("elModel",e.target.value)} style={inp} placeholder="דגם המכשיר"/></div>
                  <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>סריאלי</label><input value={elSerial} onChange={e=>sf("elSerial",e.target.value)} style={inp} placeholder="מספר סריאלי"/></div>
                </div>
                <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>תאריך ניקיון אחרון</label><input type="date" value={elDate} onChange={e=>sf("elDate",e.target.value)} style={inp}/></div>
                {calcNext(elDate,30)&&(()=>{
                  const d=Math.ceil((new Date(calcNext(elDate,30))-new Date())/864e5);
                  const bg=d<0?"#ffebee":d<7?"#fff8e1":"#e8f5e9"; const col=d<0?C.red:d<7?C.orange:C.green;
                  const txt=d<0?`⚠️ בדיקה באיחור של ${Math.abs(d)} ימים`:d<7?`⏰ בדיקה בעוד ${d} ימים (${fmtDate(calcNext(elDate,30))})`:`✅ בדיקה הבאה: ${fmtDate(calcNext(elDate,30))} (${d} ימים)`;
                  return <div style={{marginTop:10,background:bg,borderRadius:10,padding:"8px 12px",fontSize:12,fontWeight:700,color:col}}>{txt}</div>;
                })()}
              </div>
            </Sec>
          );
        })()}

        <Sec icon="🔍" title="בדיקות מצב">
          <ToggleField label="💧 גובה מים" value={waterLevel} onChange={v=>sf("waterLevel",v)}/>
          <ToggleField label="🔵 צלילות" value={clarity} onChange={v=>sf("clarity",v)}/>
          <ToggleField label="🧴 פס שומן" value={fat} onChange={v=>sf("fat",v)}/>
          <ToggleField label="🌀 זרימה" value={flow} onChange={v=>sf("flow",v)}/>
        </Sec>

        <Sec icon="🏊" title="מצב בריכה">
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:poolStatus==="אחר"?12:0}}>
            {["מאוזנת","אחר"].map(opt=>(
              <Press key={opt} onClick={()=>{sf("poolStatus",opt);haptic();}} style={{padding:14,borderRadius:14,textAlign:"center",fontWeight:800,fontSize:14,background:poolStatus===opt?(opt==="מאוזנת"?"#e8f5e9":"#ffebee"):C.white,color:poolStatus===opt?(opt==="מאוזנת"?C.green:C.red):C.muted,border:`2px solid ${poolStatus===opt?(opt==="מאוזנת"?"#c8e6c9":"#ffcdd2"):C.border}`,boxShadow:"0 2px 8px rgba(0,0,0,0.04)",transition:"all 0.2s"}}>
                {opt==="מאוזנת"?"✅ מאוזנת":"⚠️ אחר"}
              </Press>
            ))}
          </div>
          <div style={{...card()}}>
            <textarea value={customStatusText} onChange={e=>sf("customStatusText",e.target.value)} rows={2} placeholder={poolStatus==="אחר"?"תאר את הבעיה...":"הערה קצרה על מצב הבריכה (אופציונלי)..."} style={{...inp,resize:"none",marginBottom:poolStatus==="אחר"?10:0}}/>
            {poolStatus==="אחר"&&(
              <>
                <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>הגבלת שימוש עד</label>
                <input type="date" value={restrictedUntil} onChange={e=>sf("restrictedUntil",e.target.value)} style={inp}/>
              </>
            )}
          </div>
        </Sec>

        <Sec icon="📦" title="ציוד לטיפול הבא">
          <div style={{...card()}}>
            <div style={{background:"#e3f2fd",borderRadius:10,padding:"8px 12px",marginBottom:12,display:"flex",gap:6,alignItems:"center"}}><span>🔒</span><span style={{fontSize:11,fontWeight:700,color:C.blue}}>פנימי בלבד — לא נשלח ללקוח</span></div>
            {[["acid",acid,"🧪 חומצת מלח"],["phUpSupply",phUpSupply,"📈 מעלה pH"],["saltPkg",saltPkg,"🧂 שקי מלח"]].map(([k,v,lbl])=>(
              <Press key={k} onClick={()=>{sf(k,!v);haptic();}} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:`1px solid ${C.border}`}}>
                <div style={{width:26,height:26,borderRadius:8,border:`2px solid ${v?C.blue:C.border}`,background:v?C.blue:C.white,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s",flexShrink:0}}>{v&&<span style={{color:"#fff",fontSize:14}}>✓</span>}</div>
                <span style={{fontSize:14,fontWeight:700,color:C.text}}>{lbl}</span>
              </Press>
            ))}
            {saltPkg&&(
              <div style={{paddingTop:10}}>
                <label style={{fontSize:13,fontWeight:700,color:C.text,display:"block",marginBottom:8}}>כמות שקים:</label>
                <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
                  {[0,1,2,3,4,5,6,7,8,9,10].map(n=>(<Press key={n} onClick={()=>sf("saltBags",n)} style={{width:40,height:40,borderRadius:99,background:saltBags===n?C.blue:C.border,color:saltBags===n?"#fff":C.muted,fontWeight:800,fontSize:14,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{n}</Press>))}
                </div>
              </div>
            )}
            <div style={{paddingTop:12}}>
              <label style={{fontSize:13,fontWeight:700,color:C.text,display:"block",marginBottom:8}}>סטטוס אספקת חומרים</label>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:supplyStatus==="לא סופק"?10:0}}>
                {["סופק","לא סופק"].map(status=>(
                  <Press key={status} onClick={()=>{sf("supplyStatus",status); if(status==="סופק") sf("supplyNote",""); haptic();}}
                    style={{padding:"11px",borderRadius:12,textAlign:"center",fontWeight:800,fontSize:13,
                      background:supplyStatus===status?(status==="סופק"?"#e8f5e9":"#fff8e1"):"#f0f4f8",
                      color:supplyStatus===status?(status==="סופק"?C.green:C.orange):C.muted,
                      border:`2px solid ${supplyStatus===status?(status==="סופק"?"#c8e6c9":"#ffe082"):"transparent"}`}}>
                    {status==="סופק"?"✓ סופק":"⚠️ לא סופק"}
                  </Press>
                ))}
              </div>
              {supplyStatus==="לא סופק"&&(
                <textarea value={supplyNote} onChange={e=>sf("supplyNote",e.target.value)} rows={2}
                  placeholder="לדוגמה: חסרה חומצה במחסן..."
                  style={{...inp,resize:"none",minHeight:68}}/>
              )}
            </div>
          </div>
        </Sec>

        <Sec icon="📷" title="תמונות">
          <div style={{...card()}}>
            <input type="file" ref={fileRef} accept="image/*" multiple style={{display:"none"}} onChange={e=>{const files=Array.from(e.target.files).map(f=>URL.createObjectURL(f));sf("photos",[...photos,...files]);}}/>
            {photos.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>{photos.map((p,i)=>(<img key={i} src={p} alt="" style={{width:"100%",aspectRatio:"1",objectFit:"cover",borderRadius:10,border:`2px solid ${C.border}`}}/>))}</div>}
            <Press onClick={()=>fileRef.current?.click()} style={{padding:"12px",borderRadius:12,border:`2px dashed ${C.lightBlue}`,background:"#f5f9ff",color:C.blue,fontWeight:700,fontSize:13,textAlign:"center"}}>{photos.length>0?`+ הוסף עוד תמונות (${photos.length} נבחרו)`:"📸 הוסף תמונות"}</Press>
          </div>
        </Sec>

        <Sec icon="📝" title="הערות ללקוח">
          <textarea value={notes} onChange={e=>sf("notes",e.target.value)} rows={3} placeholder="הערה קצרה שתישלח בוואטסאפ..." style={{...inp,resize:"none",minHeight:80}}/>
        </Sec>

        {pending.length>0&&(
          <div style={{...card({background:"#fff8e1",border:`1px solid #ffe082`}),marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:13,fontWeight:700,color:C.orange}}>⚠️ {pending.length} דוחות ממתינים לשליחה</span>
            <Press onClick={syncPendingReports} style={{background:C.orange,borderRadius:99,padding:"6px 14px",color:"#fff",fontWeight:800,fontSize:12}}>{actionLabel("syncPending",{idle:"שלח הכל",loading:"⏳ שולח...",success:"✅ נשלח",error:"⚠️ נסה שוב"})}</Press>
          </div>
        )}
        <Press onClick={handleSubmit} disabled={!client||syncing||isActionLoading("submitReport")} style={{padding:"18px",borderRadius:16,background:actionStatus.submitReport==="success"?C.green:actionStatus.submitReport==="local"?C.orange:syncing||!client?"#90caf9":`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:900,fontSize:17,textAlign:"center",boxShadow:syncing||!client?"none":"0 8px 24px rgba(21,101,192,0.4)",marginBottom:8}}>{actionLabel("submitReport",{idle:"שלח דוח ⚡",loading:"⏳ שולח דוח...",success:"✅ נשלח",local:"⚠️ נשמר מקומית",error:"⚠️ שגיאה"})}</Press>
        <Press onClick={()=>setScreen("daily")} style={{padding:"14px",borderRadius:14,border:`2px solid ${C.border}`,background:C.white,color:C.muted,fontWeight:700,fontSize:14,textAlign:"center"}}>← ביטול</Press>
      </div>
      {chemicalRestrictionPrompt&&(
        <BottomSheet title={"\u05d4\u05d2\u05d1\u05dc\u05ea \u05e9\u05d9\u05de\u05d5\u05e9"} onClose={()=>setChemicalRestrictionPrompt(null)}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {[
              [30,"\u05d7\u05e6\u05d9 \u05e9\u05e2\u05d4"],
              [60,"\u05e9\u05e2\u05d4"],
              [120,"\u05e9\u05e2\u05ea\u05d9\u05d9\u05dd"],
              [240,"4 \u05e9\u05e2\u05d5\u05ea"],
              [720,"\u05e2\u05d3 \u05de\u05d7\u05e8"]
            ].map(([minutes,labelText])=>(
              <Press key={minutes} onClick={()=>applyChemicalRestriction(minutes)}
                style={{padding:"14px",borderRadius:12,background:"#f5f9ff",border:`1px solid ${C.border}`,color:C.blue,fontSize:14,fontWeight:900,textAlign:"center"}}>
                {labelText}
              </Press>
            ))}
          </div>
        </BottomSheet>
      )}
      <Toast msg={toast.msg} visible={toast.visible}/>
    </div>
  );

  if(screen==="done") {
    const last = reports[reports.length-1];
    return (
      <div dir="rtl" style={{minHeight:"100vh",background:`linear-gradient(145deg,#e3f2fd,${C.bg})`,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center"}}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');*{-webkit-tap-highlight-color:transparent;box-sizing:border-box}@keyframes pop{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}#onesignal-bell-container{display:none!important}`}</style>
        <div style={{fontSize:72,marginBottom:16,animation:"pop 0.5s cubic-bezier(0.34,1.56,0.64,1)"}}>✅</div>
        <h1 style={{fontSize:26,fontWeight:900,color:C.text,margin:"0 0 8px"}}>הדוח נשלח!</h1>
        <p style={{color:C.lightBlue,fontSize:15,margin:"0 0 28px",fontWeight:600}}>הלקוח יקבל הודעת WhatsApp עכשיו 💬</p>
        {last&&(
          <div style={{...card({width:"100%",maxWidth:340,marginBottom:20,textAlign:"right"})}}>
            <div style={{fontSize:12,fontWeight:800,color:C.muted,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:12}}>סיכום הדוח</div>
            {[["לקוח",last.client.split(" - ")[0]],["כלור",`${last.chlorine} ppm`],["pH",last.ph],["מלח",`${last.salt} g/L`],["מצב",last.poolStatus==="מאוזנת"?"✅ מאוזנת":"⚠️ "+last.customStatusText]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}><span style={{color:C.muted,fontSize:13,fontWeight:600}}>{k}</span><span style={{color:C.text,fontSize:13,fontWeight:800}}>{v}</span></div>
            ))}
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,width:"100%",maxWidth:340,marginBottom:10}}>
          <Press onClick={()=>{setForm(blank());setScreen("form");haptic();}} style={{padding:14,borderRadius:14,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:800,fontSize:14,textAlign:"center",boxShadow:"0 6px 20px rgba(21,101,192,0.35)"}}>+ דוח חדש</Press>
          <Press onClick={()=>setScreen("daily")} style={{padding:14,borderRadius:14,border:`2px solid ${C.border}`,background:C.white,color:C.blue,fontWeight:800,fontSize:14,textAlign:"center"}}>🏠 לוח יומי</Press>
        </div>
        {reports.length>0&&(
          <Press onClick={()=>{ const last=reports[reports.length-1]; setForm({...blank(),...last,clientLocked:true,reportDate:last.reportDate,client:last.client}); setEditingReport(last.id); setReports(r=>r.slice(0,-1)); setScreen("form"); haptic("medium"); showToast("✏️ ערוך והגש מחדש"); }} style={{padding:12,borderRadius:12,border:`2px solid ${C.orange}`,background:"#fff8e1",color:C.orange,fontWeight:800,fontSize:13,textAlign:"center",width:"100%",maxWidth:340}}>✏️ ערוך דוח אחרון</Press>
        )}
      </div>
    );
  }

  if(screen==="admin") {
    const progressData = operatorUsers.map(op=>{ const asgn = tasks.filter(t=>t.date===dailyDate&&t.operators.includes(op.name)); const done = todayReported.filter(c=>asgn.some(t=>t.client===c)).length; return {op,total:asgn.length,done}; });
    const dayTasks = tasks.filter(t=>t.date===taskDate);
    return (
      <div dir="rtl" style={{minHeight:"100vh",background:C.bg,fontFamily:"'Plus Jakarta Sans',sans-serif",paddingBottom:30}}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');*{-webkit-tap-highlight-color:transparent;box-sizing:border-box;user-select:none;-webkit-user-select:none}input,textarea,select{user-select:text;-webkit-user-select:text}select option{background:#fff}#onesignal-bell-container{display:none!important}`}</style>
        <div style={{background:`linear-gradient(145deg,#0d47a1,${C.blue},${C.lightBlue})`,padding:"28px 20px 24px",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:-50,left:-50,width:200,height:200,borderRadius:"50%",background:"rgba(255,255,255,0.05)"}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative"}}>
            <div>
              <p style={{color:"rgba(255,255,255,0.65)",fontSize:12,fontWeight:600,margin:"0 0 4px"}}>פאנל ניהול 👔</p>
              <h1 style={{color:"#fff",fontSize:22,fontWeight:900,margin:0}}>שלום, {user?.name}</h1>
              {clientPlan.plan&&(
                <div style={{display:"flex",gap:6,marginTop:6}}>
                  <span style={{background:"rgba(255,255,255,0.2)",borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:800,color:"#fff"}}>{clientPlan.plan==="PRO"?"💎 PRO":clientPlan.plan==="Basic"?"⚡ Basic":"🔬 ניסיון"}</span>
                  <span style={{background:clientPlan.status==="פעיל"?"rgba(46,125,50,0.4)":"rgba(198,40,40,0.4)",borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:800,color:"#fff"}}>{clientPlan.status==="פעיל"?"✅ פעיל":"⛔ "+clientPlan.status}</span>
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <Press onClick={()=>{setAdminTab("daily");window.scrollTo(0,0);haptic();}} style={{background:"rgba(255,255,255,0.15)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:12,padding:"8px 12px",color:"rgba(255,255,255,0.8)",fontSize:12,fontWeight:700}}>📋</Press>
              <Press onClick={()=>{setForm({...blank(),adminReport:true});setScreen("form");haptic("medium");}} style={{background:"rgba(255,255,255,0.15)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:12,padding:"8px 12px",color:"rgba(255,255,255,0.8)",fontSize:12,fontWeight:700}}>📝 דוח</Press>
              <Press onClick={handleLogout} style={{background:"rgba(255,255,255,0.15)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:12,padding:"8px 12px",color:"rgba(255,255,255,0.8)",fontSize:12,fontWeight:700}}>יציאה</Press>
            </div>
          </div>
        </div>
        <div style={{background:C.white,padding:"8px 12px",borderBottom:`1px solid ${C.border}`,display:"flex",gap:6,overflowX:"auto",position:"sticky",top:0,zIndex:50,boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
          {[["daily","📋 חלוקת עבודה"],["adminreport","📝 דוח ידני"],["progress","📊 התקדמות"],["hours","⏱️ שעות"],["qr","📷 QR"],["clients","👥 לקוחות"],["treatments","🔢 מספר טיפולים"],["reports","📄 דוחות"],["opissues","🔧 תקלות מפעיל"],["supply","📦 חומרים"],["users","👤 משתמשים"]].map(([t,lbl])=>(
            <Press key={t} onClick={()=>{setAdminTab(t);if(t==="treatments") void loadTreatmentCounts();haptic();}} style={{padding:"9px 14px",borderRadius:99,border:"none",fontSize:12,fontWeight:800,flexShrink:0,background:adminTab===t?`linear-gradient(135deg,${C.blue},${C.lightBlue})`:"#f0f4f8",color:adminTab===t?"#fff":C.muted,boxShadow:adminTab===t?"0 4px 12px rgba(21,101,192,0.3)":"none",transition:"all 0.2s"}}>{lbl}</Press>
          ))}
        </div>
        <div style={{padding:"20px 16px 0"}}>
          <InstallAppCard compact/>
          <PushSetupCard compact/>
          {adminTab==="adminreport"&&(
            <div>
              <div style={{...card({marginBottom:16,background:"#e3f2fd",border:`1px solid #90caf9`}),padding:"12px 16px",display:"flex",gap:10}}><span style={{fontSize:18}}>ℹ️</span><span style={{fontSize:12,color:C.blue,fontWeight:600}}>מלא דוח טיפול ידני — לכל לקוח</span></div>
              <div style={{marginBottom:14}}>
                <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>בחר לקוח</label>
                {form.client?(<div style={{...inp,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"default"}}><span style={{color:C.blue,fontWeight:700}}>🏊 {form.client.split(" - ")[0]}</span><span onClick={()=>{sf("client","");setAdminClientSearch("");}} style={{color:C.muted,cursor:"pointer",fontSize:16}}>✕</span></div>):(
                  <div style={{position:"relative"}}>
                    <input value={adminClientSearch} onChange={e=>setAdminClientSearch(e.target.value)} placeholder="🔍 חפש לקוח לפי שם או כתובת..." style={inp} autoComplete="off"/>
                    {adminClientSearch&&(
                      <div style={{position:"absolute",top:"100%",right:0,left:0,background:"#fff",borderRadius:12,boxShadow:"0 8px 24px rgba(0,0,0,0.15)",zIndex:100,maxHeight:260,overflowY:"auto",border:`1px solid ${C.border}`,marginTop:4}}>
                        {clients.filter(c=>`${c.name||""} ${c.address||""} ${c.phone||""}`.toLowerCase().includes(adminClientSearch.toLowerCase())).map(c=>(
                          <Press key={c.name} onClick={()=>{sf("client",c.name);setAdminClientSearch("");haptic();}} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderBottom:`1px solid ${C.border}`,background:"#fff"}}>
                            <div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff",flexShrink:0}}>🏊</div>
                            <div><div style={{fontWeight:700,fontSize:13,color:C.text}}>{c.name.split(" - ")[0]}</div>{c.address&&<div style={{fontSize:11,color:C.muted}}>{c.address}</div>}</div>
                          </Press>
                        ))}
                        {clients.filter(c=>`${c.name||""} ${c.address||""} ${c.phone||""}`.toLowerCase().includes(adminClientSearch.toLowerCase())).length===0&&<div style={{padding:"14px 16px",color:C.muted,fontSize:13}}>לא נמצא לקוח</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <Press onClick={()=>{ if(!form.client){showToast("⚠️ בחר לקוח");return;} setForm(f=>({...f,clientLocked:true,adminReport:true})); setScreen("form"); haptic("medium"); }} disabled={!form.client} style={{padding:"14px",borderRadius:14,background:form.client?`linear-gradient(135deg,${C.blue},${C.lightBlue})`:"#90caf9",color:"#fff",fontWeight:900,fontSize:15,textAlign:"center",boxShadow:form.client?"0 4px 14px rgba(21,101,192,0.3)":"none",marginBottom:8}}>📝 פתח דוח לאדמין</Press>
            </div>
          )}
          {adminTab==="daily"&&(
            <div>
              <div style={{...card({marginBottom:16})}}>
                <h3 style={{fontSize:14,fontWeight:800,color:C.text,margin:"0 0 14px"}}>{editTaskId?"✏️ עריכת משימה":"➕ הוספת משימות"}</h3>
                <div style={{marginBottom:10}}><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>תאריך</label><input type="date" value={taskDate} onChange={e=>setTaskDate(e.target.value)} style={inp}/></div>
                {!editTaskId&&(
                  <div style={{marginBottom:10}}>
                    <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>לקוחות <span style={{color:C.blue}}>({taskClients.length} נבחרו)</span></label>
                    <div style={{position:"relative",marginBottom:8}}><input value={taskClientSearch} onChange={e=>setTaskClientSearch(e.target.value)} placeholder="🔍 חפש וסמן לקוחות..." style={inp} autoComplete="off"/></div>
                    <div style={{maxHeight:200,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:12,background:"#f5f9ff"}}>
                      {clients.filter(c=>!taskClientSearch||c.name.toLowerCase().includes(taskClientSearch.toLowerCase())).map(c=>{
                        const selected = taskClients.find(x=>x.name===c.name);
                        return (
                          <Press key={c.name} onClick={()=>{ haptic(); setTaskClients(prev=>selected?prev.filter(x=>x.name!==c.name):[...prev,{name:c.name,note:""}]); }} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:`1px solid ${C.border}`,background:selected?"#e3f2fd":"transparent"}}>
                            <div style={{width:22,height:22,borderRadius:6,border:`2px solid ${selected?C.blue:C.border}`,background:selected?C.blue:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{selected&&<span style={{color:"#fff",fontSize:13,fontWeight:900}}>✓</span>}</div>
                            <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13,color:selected?C.blue:C.text}}>{c.name.split(" - ")[0]}</div>{c.address&&<div style={{fontSize:11,color:C.muted}}>{c.address}</div>}</div>
                          </Press>
                        );
                      })}
                    </div>
                    {taskClients.length>0&&(
                      <div style={{marginTop:10}}>
                        <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:8}}>לקוחות נבחרים — הוסף הערה לכל אחד:</div>
                        {taskClients.map((tc,i)=>(
                          <div key={tc.name} style={{background:C.white,borderRadius:12,padding:"10px 12px",marginBottom:8,border:`1px solid ${C.border}`}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                              <span style={{fontWeight:800,fontSize:13,color:C.blue}}>🏊 {tc.name.split(" - ")[0]}</span>
                              <Press onClick={()=>setTaskClients(prev=>prev.filter(x=>x.name!==tc.name))} style={{color:C.muted,fontSize:16,padding:"0 4px"}}>✕</Press>
                            </div>
                            <input value={tc.note} onChange={e=>{ const updated=[...taskClients]; updated[i]={...tc,note:e.target.value}; setTaskClients(updated); }} placeholder="הערה ספציפית ללקוח זה (אופציונלי)..." style={{...inp,fontSize:12,padding:"8px 12px"}}/>
                          </div>
                        ))}
                        <Press onClick={()=>setTaskClients([])} style={{padding:"6px 14px",borderRadius:99,background:"#ffebee",color:C.red,fontWeight:700,fontSize:12,display:"inline-block"}}>נקה הכל</Press>
                      </div>
                    )}
                  </div>
                )}
                {editTaskId&&(
                  <div style={{marginBottom:10}}>
                    <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>לקוח</label>
                    {taskClient?(<div style={{...inp,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"default"}}><span style={{color:C.blue,fontWeight:700}}>🏊 {taskClient.split(" - ")[0]}</span><span onClick={()=>{setTaskClient("");setTaskClientSearch("");}} style={{color:C.muted,cursor:"pointer",fontSize:16}}>✕</span></div>):(
                      <div style={{position:"relative"}}>
                        <input value={taskClientSearch} onChange={e=>setTaskClientSearch(e.target.value)} placeholder="🔍 חפש לקוח..." style={inp} autoComplete="off"/>
                        {taskClientSearch&&<div style={{position:"absolute",top:"100%",right:0,left:0,background:"#fff",borderRadius:12,boxShadow:"0 8px 24px rgba(0,0,0,0.15)",zIndex:100,maxHeight:220,overflowY:"auto",border:`1px solid ${C.border}`,marginTop:4}}>{clients.filter(c=>c.name.toLowerCase().includes(taskClientSearch.toLowerCase())).map(c=>(<div key={c.name} onClick={()=>{setTaskClient(c.name);setTaskClientSearch("");haptic();}} style={{padding:"12px 16px",fontSize:14,fontWeight:600,color:C.text,cursor:"pointer",borderBottom:`1px solid ${C.border}`}}>{c.name.split(" - ")[0]}</div>))}</div>}
                      </div>
                    )}
                  </div>
                )}
                <div style={{marginBottom:10}}>
                  <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>מפעילים</label>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>{taskOps.map(op=>(<span key={op} style={{background:C.blue,color:"#fff",borderRadius:99,padding:"5px 12px",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>{op}<span onClick={()=>setTaskOps(taskOps.filter(o=>o!==op))} style={{cursor:"pointer",opacity:0.7,fontSize:14}}>✕</span></span>))}</div>
                  <select defaultValue="" onChange={e=>{if(e.target.value&&!taskOps.includes(e.target.value)){setTaskOps([...taskOps,e.target.value]);e.target.value="";}}} style={sel}><option value="">+ הוסף מפעיל</option>{opNames.filter(n=>!taskOps.includes(n)).map(n=><option key={n}>{n}</option>)}</select>
                </div>
                <div style={{marginBottom:12}}><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>הערה (תופיע אצל המפעיל)</label><input value={taskNote} onChange={e=>setTaskNote(e.target.value)} placeholder="הערה אופציונלית..." style={inp}/></div>
                <Press onClick={async()=>{
                  if(isActionLoading("saveTasks")) return;
                  setAction("saveTasks", "loading");
                  if(editTaskId){
                    await saveTask({date:taskDate,client:taskClient,operators:taskOps});
                    setAction("saveTasks", "success", 1500);
                  } else {
                    if(!taskClients.length||!taskOps.length) { setAction("saveTasks", "idle"); return; }
                    const newTasksBatch = taskClients.map(tc=>({id:Date.now()+Math.floor(Math.random()*100000),date:taskDate.slice(0,10),client:tc.name,operators:[...taskOps],status:"pending",changeLog:[{at:nowStr(),note:tc.note||taskNote||"📋 משימה חדשה הוקצתה לך",by:user?.name,needsAck:true,ackedBy:[]}]}));
                    const newTasks = [...tasks, ...newTasksBatch];
                    setTasks(newTasks); setTaskClients([]); setTaskClientSearch(""); setTaskOps([]); setTaskNote("");
                    if(sheetId) await sheetCall("saveTasks",{tasks:newTasks});
                    setAction("saveTasks", "success", 1500);
                    showToast(`✅ ${newTasksBatch.length} משימות נוצרו`);
                    haptic("success");

                    const notifyOps = [...taskOps];
                    const notifyClients = [...taskClients];
                    const notifyDate = taskDate;
                    setTimeout(async () => {
                      let sentCount = 0;
                      let missingCount = 0;
                      const clientList = notifyClients.map(c=>c.name.split(" - ")[0]).join(", ");
                      for(const opName of notifyOps) {
                        const opUser = allUsers.find(u=>normalizeName(u.name)===normalizeName(opName));
                        if (!opUser?.username) {
                          console.warn("OneSignal: operator user not found or missing username", opName, opUser);
                          missingCount++;
                          continue;
                        }
                        const sent = await sendOneSignalToUser(`📋 משימות חדשות`, `${clientList} — ${fmtDate(notifyDate)}`, opUser?.username);
                        if(sent) sentCount++;
                      }
                      if (sentCount === notifyOps.length) showToast(`✅ ההתראות נשלחו`);
                      else if (missingCount) showToast(`⚠️ חסר שם משתמש ל-${missingCount} מפעילים`);
                      else showToast(`⚠️ ${sentCount}/${notifyOps.length} התראות נשלחו`);
                    }, 0);
                  }
                }} disabled={isActionLoading("saveTasks")||(editTaskId?(!taskClient||!taskOps.length):(!taskClients.length||!taskOps.length))} style={{padding:"13px",borderRadius:14,background:actionStatus.saveTasks==="success"?C.green:actionStatus.saveTasks==="warning"?C.orange:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:800,fontSize:14,textAlign:"center",boxShadow:`0 4px 14px rgba(21,101,192,0.3)`,opacity:(editTaskId?(!taskClient||!taskOps.length):(!taskClients.length||!taskOps.length))?0.5:1}}>
                  {actionStatus.saveTasks==="loading"?"⏳ שומר ושולח...":actionStatus.saveTasks==="success"?"✅ נשמר ונשלח":actionStatus.saveTasks==="warning"?"⚠️ נשמר, בדוק התראות":editTaskId?"💾 שמור שינויים":taskClients.length>1?`➕ צור ${taskClients.length} משימות`:"➕ הוסף משימה"}
                </Press>
              </div>
              <h3 style={{fontSize:12,fontWeight:800,color:C.muted,letterSpacing:"0.1em",textTransform:"uppercase",margin:"0 0 12px"}}>משימות — {fmtDate(taskDate)}</h3>
              {dayTasks.length===0&&<div style={{...card({textAlign:"center"}),padding:24,color:C.muted,fontSize:14}}>אין משימות לתאריך זה</div>}
              {dayTasks.map(t=>{
                const lastLog=t.changeLog?.[t.changeLog.length-1];
                return (
                  <div key={t.id} style={{...card({marginBottom:10})}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                      <div>
                        <div style={{fontWeight:800,fontSize:15,color:C.text,marginBottom:3}}>{t.client.split(" - ")[0]}</div>
                        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{t.operators.map(op=>(<span key={op} style={{background:"#e3f2fd",color:C.blue,borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:700,display:"inline-flex",alignItems:"center",gap:4}}>{op}<span onClick={()=>removeOp(t.id,op)} style={{cursor:"pointer",opacity:0.7,fontSize:12}}>✕</span></span>))}</div>
                      </div>
                      <Badge label={t.status==="done"?"✓ בוצע":"ממתין"} col={t.status==="done"?C.green:C.orange}/>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <select defaultValue="" onChange={e=>{if(e.target.value){addOp(t.id,e.target.value);e.target.value="";}}} style={{...sel,flex:1,fontSize:12,padding:"7px 10px"}}><option value="">+ הוסף מפעיל</option>{opNames.filter(n=>!t.operators.includes(n)).map(n=><option key={n}>{n}</option>)}</select>
                      <Press onClick={()=>{setEditTaskId(t.id);setTaskClient(t.client);setTaskOps(t.operators);setTaskDate(t.date);window.scrollTo(0,0);}} style={{padding:"7px 14px",borderRadius:10,background:"#e3f2fd",color:C.blue,fontSize:12,fontWeight:700}}>✏️</Press>
                      <Press onClick={()=>{ if(!window.confirm("למחוק?"))return; const deletedTask=t; const n=tasks.filter(x=>x.id!==t.id); setTasks(n); showToast("🗑️ משימה נמחקה"); void (async()=>{ try { if(sheetId) await sheetCall("saveTasks",{tasks:n}); await sendNotificationToOperators(deletedTask.operators||[], "🗑️ משימה נמחקה", `${deletedTask.client?.split(" - ")[0] || ""} — ${fmtDate(deletedTask.date)}`); } catch(e) { console.warn("Delete task background sync failed", e); } })(); }} style={{padding:"7px 14px",borderRadius:10,background:"#ffebee",color:C.red,fontSize:12,fontWeight:700}}>🗑️</Press>
                    </div>
                    {lastLog&&(
                      <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`,fontSize:11,color:C.muted}}>
                        🕐 {lastLog.at} — {lastLog.note}
                        {lastLog.needsAck&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}}>{t.operators.map(op=>{ const acked=(lastLog.ackedBy||[]).includes(op); return <span key={op} style={{background:acked?"#e8f5e9":"#fff3e0",color:acked?C.green:C.orange,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700}}>{acked?"✓":"⏳"} {op}</span>; })}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {adminTab==="progress"&&(
            <div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}><label style={{fontSize:12,fontWeight:700,color:C.muted}}>תאריך:</label><input type="date" value={dailyDate} onChange={e=>setDailyDate(e.target.value)} style={{...inp,maxWidth:160,color:C.blue,border:`1px solid ${C.lightBlue}`,fontWeight:700}}/></div>
              {progressData.map(({op,total,done})=>(
                <div key={op.name} style={{...card({marginBottom:12})}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:total?14:0}}>
                    <span style={{fontSize:28}}>{op.icon}</span>
                    <div style={{flex:1}}><div style={{fontWeight:800,fontSize:15,color:C.text}}>{op.name}</div><div style={{color:C.muted,fontSize:11,marginTop:2}}>{total===0?"אין משימות היום":`${done} הושלמו · ${total-done} נותרו`}</div></div>
                    <Badge label={`${done}/${total}`} col={done===total&&total>0?C.green:C.blue}/>
                  </div>
                  {total>0&&<PBar done={done} total={total}/>}
                  {tasks.filter(t=>t.date===dailyDate&&t.operators.includes(op.name)).map(t=>(<div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderTop:`1px solid ${C.border}`,marginTop:8}}><span style={{color:C.muted,fontSize:13}}>{t.client.split(" - ")[0]}</span><Badge label={t.status==="done"?"✓ בוצע":"ממתין"} col={t.status==="done"?C.green:C.orange}/></div>))}
                </div>
              ))}
            </div>
          )}
          {adminTab==="qr"&&(
            <div>
              <div style={{...card({marginBottom:16,background:"#e3f2fd",border:`1px solid #90caf9`}),padding:"12px 16px",display:"flex",gap:10,alignItems:"flex-start"}}><span style={{fontSize:20}}>ℹ️</span><div style={{fontSize:12,color:C.blue,fontWeight:600,lineHeight:1.6}}>לכל לקוח יש QR ייחודי. המפעיל סורק אותו → הדוח נפתח אוטומטית. הדפס את ה-QR ושים אצל הלקוח.</div></div>
              {clients.map(c=>(<div key={c.name} style={{...card({marginBottom:10}),display:"flex",alignItems:"center",gap:14}}><div style={{flex:1}}><div style={{fontWeight:800,fontSize:15,color:C.text,marginBottom:2}}>{c.name.split(" - ")[0]}</div><div style={{fontSize:12,color:C.muted}}>📍 {c.address||c.name.split(" - ")[1]||""}</div></div><Press onClick={()=>setShowQRCode(showQRCode===c.name?null:c.name)} style={{padding:"8px 14px",borderRadius:10,background:showQRCode===c.name?"#e3f2fd":C.border,color:showQRCode===c.name?C.blue:C.muted,fontWeight:700,fontSize:12}}>{showQRCode===c.name?"סגור":"📷 QR"}</Press></div>))}
              {showQRCode&&(()=>{ const encoded = encodeURIComponent(showQRCode.split(" - ")[0]); const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}&bgcolor=ffffff&color=1565c0&margin=10`; return (<div style={{...card({border:`2px solid ${C.lightBlue}`,textAlign:"center"}),padding:20,marginBottom:16}}><div style={{fontWeight:800,fontSize:15,color:C.text,marginBottom:12}}>{showQRCode.split(" - ")[0]}</div><img src={qrUrl} alt="QR" style={{width:180,height:180,borderRadius:12,marginBottom:12}}/><div style={{fontSize:11,color:C.muted,marginBottom:12}}>סרוק עם האפליקציה לפתיחת דוח</div><a href={qrUrl} download={`qr-${showQRCode.split(" - ")[0]}.png`} target="_blank" rel="noreferrer"><Press style={{padding:"10px 20px",borderRadius:10,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:700,fontSize:13,display:"inline-block"}}>⬇️ הורד QR</Press></a></div>); })()}
            </div>
          )}
          {adminTab==="hours"&&(
            <div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}><label style={{fontSize:12,fontWeight:700,color:C.muted}}>תאריך:</label><input type="date" value={dailyDate} onChange={e=>setDailyDate(e.target.value)} style={{...inp,maxWidth:160,color:C.blue,border:`1px solid ${C.lightBlue}`,fontWeight:700}}/></div>
              {operatorUsers.map(op=>{ const logs=workLogs.filter(l=>l.operator===op.name&&l.date===dailyDate); const tot=logs.reduce((a,l)=>{const[h,m]=l.total.split(":").map(Number);return a+h*60+m;},0); const totStr=tot>0?`${Math.floor(tot/60)}:${String(tot%60).padStart(2,"0")}`:"—"; return (<div key={op.name} style={{...card({marginBottom:12})}}><div style={{display:"flex",alignItems:"center",gap:12,marginBottom:logs.length?10:0}}><span style={{fontSize:28}}>{op.icon}</span><div style={{flex:1}}><div style={{fontWeight:800,fontSize:15,color:C.text}}>{op.name}</div><div style={{color:C.muted,fontSize:11,marginTop:2}}>{logs.length===0?"לא נרשמה עבודה":`${logs.length} סשנים · סה"כ ${totStr} שעות`}</div></div>{tot>0&&<Badge label={`⏱️ ${totStr}`} col={C.blue}/>}</div>{logs.map((l,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderTop:`1px solid ${C.border}`}}><span style={{color:C.muted,fontSize:12}}>🕐 {l.start} — {l.end}</span><span style={{color:C.blue,fontSize:12,fontWeight:800}}>{l.total} שע׳</span></div>))}</div>); })}
            </div>
          )}
          {adminTab==="clients"&&(
            <div>
              <div style={{...card({marginBottom:16})}}>
                <h3 style={{fontSize:14,fontWeight:800,color:C.text,margin:"0 0 14px"}}>➕ לקוח חדש</h3>
                <div style={{marginBottom:10}}><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>שם לקוח *</label><input value={newClient.name} onChange={e=>setNewClient(c=>({...c,name:e.target.value}))} placeholder="משפחת כהן" style={inp}/></div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>טלפון</label><input value={newClient.phone} onChange={e=>setNewClient(c=>({...c,phone:e.target.value}))} placeholder="05XXXXXXXX" style={inp} type="tel"/></div>
                  <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>כתובת</label><input value={newClient.address} onChange={e=>setNewClient(c=>({...c,address:e.target.value}))} placeholder="רחוב הים 1" style={inp}/></div>
                </div>
                <Press onClick={async()=>{ if(!newClient.name.trim()){showToast("⚠️ נא להזין שם לקוח");return;} const updated=[...clients,{name:newClient.name.trim(),phone:newClient.phone.trim(),address:newClient.address.trim(),qrUrl:""}]; setClients(updated); setNewClient({name:"",phone:"",address:""}); if(sheetId) await sheetCall("saveClients",{clients:updated}); showToast("✅ לקוח נוסף"); haptic("success"); }} style={{padding:"13px",borderRadius:14,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:800,fontSize:14,textAlign:"center",boxShadow:`0 4px 14px rgba(21,101,192,0.3)`}}>➕ הוסף לקוח</Press>
              </div>
              <h3 style={{fontSize:12,fontWeight:800,color:C.muted,letterSpacing:"0.1em",textTransform:"uppercase",margin:"0 0 12px"}}>לקוחות קיימים — {clients.length}</h3>
              {clients.map((c,i)=>(
                <div key={i} style={{...card({marginBottom:10})}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}><div style={{width:40,height:40,borderRadius:12,background:"#e3f2fd",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{(c.poolType==="כלור")?"🧪":(c.poolType==="גלישה")?"🌊":(c.poolType==="סקימר")?"🔵":"🧂"}</div><div style={{flex:1}}><div style={{fontWeight:800,fontSize:14,color:C.text}}>{c.name.split(" - ")[0]}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>{c.phone} · {c.address}</div></div>{c.phone&&<a href={`tel:${c.phone}`} style={{color:C.blue,fontSize:18,textDecoration:"none"}}>📞</a>}</div>
                  <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>{["מלח","כלור","גלישה","סקימר"].map(pt=>(<Press key={pt} onClick={async()=>{ const updated=clients.map(x=>x.name===c.name?{...x,poolType:pt}:x); setClients(updated); await sheetCall("saveClientPoolType",{clientName:c.name,poolType:pt}); showToast(`✅ ${c.name.split(" - ")[0]} — ${pt}`); haptic(); }} style={{padding:"5px 12px",borderRadius:99,fontSize:11,fontWeight:800,background:(c.poolType||"מלח")===pt?C.blue:"#f0f4f8",color:(c.poolType||"מלח")===pt?"#fff":C.muted}}>{pt}</Press>))}</div>
                </div>
              ))}
            </div>
          )}
          {adminTab==="treatments"&&(
            <div>
              <Press onClick={async()=>{ const rows=await loadTreatmentCounts(); showToast(rows.length?`✅ ${rows.length} לקוחות עודכנו`:"⚠️ אין נתונים"); }}
                style={{...card({marginBottom:14,background:"#e3f2fd",display:"flex",alignItems:"center",gap:10}),padding:"12px 16px"}}>
                <span style={{fontSize:16}}>🔄</span>
                <span style={{fontWeight:700,fontSize:13,color:C.blue}}>רענן מספר טיפולים</span>
              </Press>
              {treatmentCounts.length===0&&<div style={{...card({textAlign:"center"}),padding:28,color:C.muted}}>לחץ רענן כדי לטעון את מספר הטיפולים</div>}
              {treatmentCounts.map((row,i)=>{
                const doneCount = Number(row.monthlyTreatmentCount || 0);
                const balance = Number(row.monthlyTreatmentBalance ?? Math.max(0,4-doneCount));
                return (
                  <div key={`${row.client}-${i}`} style={{...card({marginBottom:10})}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:10}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:900,fontSize:15,color:C.text}}>{String(row.client||"").split(" - ")[0]}</div>
                        <div style={{fontSize:12,color:C.muted,marginTop:3}}>{doneCount} טיפולים בפועל מתוך 4 החודש</div>
                      </div>
                      <Badge label={`נותרו ${balance}`} col={balance===0?C.green:C.blue}/>
                    </div>
                    <PBar done={Math.min(doneCount,4)} total={4}/>
                  </div>
                );
              })}
            </div>
          )}
          {adminTab==="reports"&&(
            <div>
              <div style={{...card({marginBottom:14})}}>
                <div style={{marginBottom:10}}><input value={reportFilter} onChange={e=>setReportFilter(e.target.value)} placeholder="🔍 חפש לפי לקוח או מפעיל..." style={{...inp,marginBottom:0}}/></div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>תאריך</label><input type="date" value={reportDateFilter} onChange={e=>setReportDateFilter(e.target.value)} style={inp}/></div>
                  <div style={{display:"flex",alignItems:"flex-end"}}><Press onClick={async()=>{ showToast("⏳ טוען דוחות..."); const res = await sheetCall("getReports"); if(res?.reports?.length){setSheetReports(res.reports);showToast(`✅ ${res.reports.length} דוחות נטענו`);}else{showToast("⚠️ לא נמצאו דוחות");} }} style={{width:"100%",padding:"12px",borderRadius:14,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:800,fontSize:13,textAlign:"center"}}>🔄 טען מגיליון</Press></div>
                </div>
              </div>
              {(()=>{
                const allReports = [...sheetReports, ...reports.filter(r=>!r._fromSheet)];
                const seen = new Set(); const unique = allReports.filter(r=>{ if(seen.has(r.id))return false; seen.add(r.id); return true; });
                const filtered = unique.reverse().filter(r=>{ const matchText = !reportFilter || r.client?.includes(reportFilter) || r.operator?.includes(reportFilter); const matchDate = !reportDateFilter || r.reportDate===reportDateFilter; return matchText && matchDate; });
                if(filtered.length===0) return <div style={{...card({textAlign:"center"}),padding:32,color:C.muted,fontSize:14}}>אין דוחות — לחץ "טען מגיליון"</div>;
                return filtered.map((r,i)=>(
                  <div key={i} style={{...card({marginBottom:12})}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}><div><div style={{fontWeight:800,fontSize:15,color:C.text}}>{r.client?.split(" - ")[0]}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>👤 {r.operator} · 📅 {fmtDate(r.reportDate)}</div></div><Badge label={r.poolStatus==="מאוזנת"?"✅ מאוזנת":"⚠️ אחר"} col={r.poolStatus==="מאוזנת"?C.green:C.orange}/></div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:6}}>{[["כלור",`${r.chlorine} ppm`,"#e3f2fd","#1565c0"],["pH",r.ph,"#f3e5f5","#6a1b9a"],["מלח",`${r.salt} g/L`,"#e8f5e9","#1b5e20"]].map(([k,v,bg,col])=>(<div key={k} style={{background:bg,borderRadius:10,padding:"8px",textAlign:"center"}}><div style={{fontSize:10,fontWeight:700,color:"#90a4ae",marginBottom:2}}>{k}</div><div style={{fontSize:14,fontWeight:900,color:col}}>{v}</div></div>))}</div>
                    {r.notes&&<div style={{background:"#f5f9ff",borderRadius:10,padding:"8px 12px",fontSize:12,color:C.muted}}>📝 {r.notes}</div>}
                    {r.supplyLabel&&<div style={{marginTop:8,fontSize:11,color:C.blue,fontWeight:700}}>📦 {r.supplyLabel}</div>}
                  </div>
                ));
              })()}
            </div>
          )}
          {adminTab==="opissues"&&(
            <div>
              <Press onClick={async()=>{ const res=await sheetCall("getOperatorIssues"); if(res?.issues) setOperatorIssues(res.issues); showToast(`✅ ${res?.issues?.length||0} תקלות`); }} style={{...card({marginBottom:14,background:"#e3f2fd",display:"flex",alignItems:"center",gap:10}),padding:"12px 16px"}}><span style={{fontSize:16}}>🔄</span><span style={{fontWeight:700,fontSize:13,color:C.blue}}>טען תקלות מפעיל</span></Press>
              {operatorIssues.length===0&&<div style={{...card({textAlign:"center"}),padding:32,color:C.muted}}>לחץ טען לראות תקלות</div>}
              {operatorIssues.map((iss,i)=>{ const [id,operator,client,desc,priority,status,response,date]=iss; const priColor=priority==="קריטי"?C.red:priority==="דחוף"?C.orange:C.blue; return (<div key={i} style={{...card({marginBottom:12,border:`2px solid ${priColor}22`})}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><div><div style={{fontWeight:800,fontSize:14,color:C.text}}>{client?.split(" - ")[0]}</div><div style={{fontSize:12,color:C.muted}}>👤 {operator} · 📅 {date}</div></div><div style={{display:"flex",gap:5}}><span style={{background:priColor+"18",color:priColor,borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:800}}>{priority}</span><span style={{background:status==="טופל"?"#e8f5e9":"#fff8e1",color:status==="טופל"?C.green:C.orange,borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:800}}>{status}</span></div></div><div style={{fontSize:13,color:"#546e7a",marginBottom:10,lineHeight:1.5}}>{desc}</div>{response&&<div style={{background:"#e8f5e9",borderRadius:8,padding:"8px 12px",fontSize:12,color:C.green,fontWeight:700,marginBottom:8}}>✅ תגובת אדמין: {response}</div>}<div style={{display:"flex",gap:8}}>{["בטיפול","טופל"].map(s=>(<Press key={s} onClick={async()=>{ const updated=[...operatorIssues]; updated[i]=[...iss]; updated[i][5]=s; setOperatorIssues(updated); await sheetCall("updateOperatorIssue",{rowIndex:i+1,status:s}); showToast(`✅ עודכן ל-${s}`);haptic("success"); }} style={{padding:"7px 14px",borderRadius:99,fontSize:12,fontWeight:800,background:status===s?"#e8f5e9":"#f0f4f8",color:status===s?C.green:C.muted}}>{s}</Press>))}</div></div>); })}
            </div>
          )}
          {adminTab==="supply"&&(
            <div>
              <div style={{...card({marginBottom:14})}}>
                <div style={{fontWeight:800,fontSize:13,color:C.text,marginBottom:12}}>🔍 חיפוש חומרים שסופקו</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>תאריך</label><input type="date" value={supplySearch.date} onChange={e=>setSupplySearch(s=>({...s,date:e.target.value}))} style={inp}/></div>
                  <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>סוג חומר</label><select value={supplySearch.type} onChange={e=>setSupplySearch(s=>({...s,type:e.target.value}))} style={sel}><option value="">הכל</option><option>כלור TAB</option><option>HTH</option><option>מעלה pH</option><option>חומצת מלח</option><option>מלח</option></select></div>
                </div>
              </div>
              {(()=>{ const allRep=[...sheetReports,...reports]; const seen=new Set(); const filtered=allRep.filter(r=>{ if(seen.has(r.id))return false; seen.add(r.id); if(supplySearch.date&&r.reportDate!==supplySearch.date)return false; const hasSupply=r.chlora>0||r.hth>0||r.phUp>0||r.acidLiters>0||r.supplyLabel; if(!hasSupply)return false; if(supplySearch.type){const t=supplySearch.type;if(t==="כלור TAB"&&!(r.chlora>0))return false;if(t==="HTH"&&!(r.hth>0))return false;if(t==="מעלה pH"&&!(r.phUp>0))return false;if(t==="חומצת מלח"&&!(r.acidLiters>0))return false;if(t==="מלח"&&!r.supplyLabel?.includes("מלח"))return false;} return true; }).sort((a,b)=>b.reportDate?.localeCompare(a.reportDate)); if(filtered.length===0)return <div style={{...card({textAlign:"center"}),padding:32,color:C.muted}}>אין תוצאות — לחץ "טען מגיליון" בטאב דוחות</div>; return filtered.map((r,i)=>(<div key={i} style={{...card({marginBottom:10})}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><div><div style={{fontWeight:800,fontSize:14,color:C.text}}>{r.client?.split(" - ")[0]}</div><div style={{fontSize:12,color:C.muted}}>👤 {r.operator} · 📅 {fmtDate(r.reportDate)}</div></div></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{r.chlora>0&&<span style={{background:"#fff3e0",color:C.orange,borderRadius:99,padding:"4px 12px",fontSize:12,fontWeight:700}}>TAB: {r.chlora}</span>}{r.hth>0&&<span style={{background:"#e8eaf6",color:"#283593",borderRadius:99,padding:"4px 12px",fontSize:12,fontWeight:700}}>HTH: {r.hth} cups</span>}{r.phUp>0&&<span style={{background:"#f3e5f5",color:"#6a1b9a",borderRadius:99,padding:"4px 12px",fontSize:12,fontWeight:700}}>pH+: {r.phUp} כוסות</span>}{r.acidLiters>0&&<span style={{background:"#ffebee",color:C.red,borderRadius:99,padding:"4px 12px",fontSize:12,fontWeight:700}}>חומצה: {r.acidLiters}L</span>}{r.supplyLabel&&<span style={{background:"#e8f5e9",color:C.green,borderRadius:99,padding:"4px 12px",fontSize:12,fontWeight:700}}>{r.supplyLabel}</span>}</div></div>)); })()}
            </div>
          )}
          {adminTab==="users"&&(
            <div>
              {allUsers.map(u=>(<div key={u.username} style={{...card({marginBottom:10,display:"flex",alignItems:"center",gap:12})}}><span style={{fontSize:30}}>{u.icon}</span><div style={{flex:1}}><div style={{fontWeight:800,fontSize:15,color:C.text}}>{u.name}</div><div style={{color:C.muted,fontSize:12,marginTop:2}}>{u.username} · {u.phone}</div><div style={{color:"#b0bec5",fontSize:11,marginTop:2}}>"{u.welcomeMessage}"</div></div><Badge label={u.role==="admin"?"מנהל":"מפעיל"} col={u.role==="admin"?C.orange:C.blue}/></div>))}
              <div style={{marginTop:24}}><Press onClick={()=>setShowReportIssue(true)} style={{...card({background:"#fff8e1",border:"1px solid #ffe082",display:"flex",alignItems:"center",gap:12}),padding:"14px 16px"}}><span style={{fontSize:22}}>🔧</span><div><div style={{fontWeight:800,fontSize:14,color:C.orange}}>דווח על תקלה</div><div style={{fontSize:12,color:C.muted}}>שלח דיווח ישירות למפתח</div></div></Press></div>
            </div>
          )}
        </div>
        {showReportIssue&&(
          <BottomSheet title="🔧 דווח על תקלה" onClose={()=>setShowReportIssue(false)}>
            <div>
              <div style={{marginBottom:12}}><label style={{fontSize:12,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>תיאור הבעיה</label><textarea value={issueDesc} onChange={e=>setIssueDesc(e.target.value)} rows={4} placeholder="תאר את הבעיה בפירוט..." style={{...inp,resize:"none"}}/></div>
              <div style={{marginBottom:16}}><label style={{fontSize:12,fontWeight:700,color:C.muted,display:"block",marginBottom:8}}>עדיפות</label><div style={{display:"flex",gap:8}}>{["רגיל","דחוף","קריטי"].map(p=>(<Press key={p} onClick={()=>setIssuePriority(p)} style={{flex:1,padding:"10px",borderRadius:10,textAlign:"center",fontSize:13,fontWeight:800,background:issuePriority===p?(p==="קריטי"?C.red:p==="דחוף"?C.orange:C.blue):"#f0f4f8",color:issuePriority===p?"#fff":C.muted}}>{p}</Press>))}</div></div>
              <Press onClick={async()=>{ if(!issueDesc.trim()){showToast("⚠️ נא להזין תיאור");return;} setSyncing(true); const company=getCompany(); await mgmtCall("saveMgmtIssue",{issue:[Date.now(), company.name||"לא ידוע", todayStr(), issueDesc.trim(), issuePriority, "פתוח", "", ""]}); setSyncing(false); setIssueDesc(""); setIssuePriority("רגיל"); setShowReportIssue(false); showToast("✅ הדיווח נשלח!"); haptic("success"); }} style={{padding:"14px",borderRadius:14,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:900,fontSize:15,textAlign:"center",boxShadow:"0 4px 14px rgba(21,101,192,0.3)"}}>{syncing?"⏳ שולח...":"שלח דיווח →"}</Press>
            </div>
          </BottomSheet>
        )}
        <Toast msg={toast.msg} visible={toast.visible}/>
      </div>
    );
  }

  if(showSuperAdmin) return <SuperAdminScreen onClose={()=>setShowSuperAdmin(false)}/>;
  return null;
}
