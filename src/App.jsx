import { useState, useRef, useEffect, useCallback } from "react";

// ─── Demo data ─────────────────────────────────────────────────────────────
const DEMO_USERS = [
  { username:"admin", password:"1234", role:"admin",    name:"מנהל גליליאו", icon:"👔", welcomeMessage:"ברוך הבא למרכז הניהול", phone:"0501234567" },
  { username:"avi",   password:"1234", role:"operator", name:"אבי כהן",       icon:"🏊", welcomeMessage:"יאללה לעבודה אבי! 💪",  phone:"0521234567" },
  { username:"yossi", password:"1234", role:"operator", name:"יוסי לוי",      icon:"🌊", welcomeMessage:"יום טוב יוסי!",          phone:"0531234567" },
  { username:"moti",  password:"1234", role:"operator", name:"מוטי גולן",     icon:"⚡", welcomeMessage:"בוקר טוב מוטי!",          phone:"0541234567" },
];
const DEMO_CLIENTS = [
  { name:"משפחת כהן - הגפן 12",   phone:"0521111111", address:"רחוב הגפן 12" },
  { name:"משפחת לוי - הזית 5",    phone:"0522222222", address:"רחוב הזית 5" },
  { name:"מלון כרמי",              phone:"0523333333", address:"רחוב האלמוגים 1" },
  { name:"משפחת גולן - הגעתון 3", phone:"0524444444", address:"רחוב הגעתון 3" },
  { name:"וילה ים - הנמל 18",     phone:"0525555555", address:"רחוב הנמל 18" },
];

const CITY     = "אילת";
const wazeUrl  = (a) => `https://waze.com/ul?q=${encodeURIComponent(a+", "+CITY)}&navigate=yes`;
const todayStr = () => new Date().toISOString().slice(0,10);
const fmtDate  = s => { if(!s)return""; const[y,m,d]=s.split("-"); return`${d}/${m}/${y}`; };
const calcNext = (s,days=90) => { if(!s)return null; const d=new Date(s); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); };
const nowStr   = () => new Date().toLocaleString("he-IL");

// ─── Company settings ──────────────────────────────────────────────────────
function getCompany() {
  try { return JSON.parse(localStorage.getItem("galileo_company")||"{}"); } catch { return {}; }
}
function saveCompany(data) {
  localStorage.setItem("galileo_company", JSON.stringify(data));
}

const FIXED_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzKKk_M0noXnKrniCsBDO4dAUWPDkpK8YH0QhhpJQfSaCyfqmAQlLJOb-sN5atSj5nj/exec";
const DEFAULT_SUPER_PASS = "039076914";
function getSuperPass() { return localStorage.getItem("galileo_super_pass")||DEFAULT_SUPER_PASS; }
function setSuperPass(p) { localStorage.setItem("galileo_super_pass",p); }
const MGMT_SHEET_ID    = "17jNBWSAkW17zfz4o2gY3wOsERa3_NAgSZ3b9HPkNspk";

async function mgmtCall(action, payload={}) {
  try {
    const r = await fetch(FIXED_SCRIPT_URL,{
      method:"POST",
      headers:{"Content-Type":"text/plain"},
      body:JSON.stringify({action, sheetId: MGMT_SHEET_ID, ...payload})
    });
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
    const r = await fetch(getScriptUrl(),{method:"POST",headers:{"Content-Type":"text/plain"},
      body:JSON.stringify({action, sheetId, ...payload})});
    return await r.json();
  } catch { return null; }
}

// ─── Haptic ────────────────────────────────────────────────────────────────
const haptic = (t="light") => navigator.vibrate?.({light:30,medium:50,success:[30,50,30]}[t]||30);

// ─── Press component ───────────────────────────────────────────────────────
function Press({children,onClick,style={},disabled=false,tag="div"}) {
  const [p,setP] = useState(false);
  const Tag = tag;
  return (
    <Tag onPointerDown={()=>{if(!disabled){setP(true);haptic();}}} onPointerUp={()=>setP(false)}
      onPointerLeave={()=>setP(false)} onClick={disabled?undefined:onClick}
      style={{...style,transform:p?"scale(0.96)":"scale(1)",
        transition:"transform 0.12s cubic-bezier(0.34,1.56,0.64,1)",
        cursor:disabled?"not-allowed":"pointer",userSelect:"none",WebkitTapHighlightColor:"transparent"}}>
      {children}
    </Tag>
  );
}

// ─── Toast ─────────────────────────────────────────────────────────────────
function Toast({msg,visible}) {
  return (
    <div style={{position:"fixed",bottom:96,right:"50%",transform:`translateX(50%) translateY(${visible?0:16}px)`,
      background:"#0d47a1",color:"#fff",borderRadius:99,padding:"10px 22px",fontSize:13,fontWeight:700,
      zIndex:999,opacity:visible?1:0,transition:"all 0.35s cubic-bezier(0.34,1.56,0.64,1)",
      pointerEvents:"none",boxShadow:"0 8px 24px rgba(13,71,161,0.4)",whiteSpace:"nowrap"}}>
      {msg}
    </div>
  );
}

// ─── Bottom Sheet ──────────────────────────────────────────────────────────
function BottomSheet({children,onClose,title}) {
  const [vis,setVis] = useState(false);
  useEffect(()=>{setTimeout(()=>setVis(true),10);},[]);
  const close = () => { setVis(false); setTimeout(onClose,350); };
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div onClick={close} style={{position:"absolute",inset:0,background:`rgba(0,0,0,${vis?0.45:0})`,
        transition:"background 0.3s",backdropFilter:"blur(4px)"}}/>
      <div style={{position:"relative",background:"#fff",borderRadius:"24px 24px 0 0",
        transform:vis?"translateY(0)":"translateY(100%)",
        transition:"transform 0.4s cubic-bezier(0.34,1.2,0.64,1)",
        maxHeight:"85vh",overflowY:"auto"}}>
        <div style={{padding:"16px 20px 8px",display:"flex",justifyContent:"space-between",alignItems:"center",
          borderBottom:"1px solid #f0f4f8",position:"sticky",top:0,background:"#fff",zIndex:1}}>
          <h2 style={{margin:0,fontSize:17,fontWeight:900,color:"#0d47a1"}}>{title}</h2>
          <Press onClick={close} style={{width:32,height:32,borderRadius:"50%",background:"#f0f4f8",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"#546e7a"}}>✕</Press>
        </div>
        <div style={{padding:"16px 20px 32px"}}>{children}</div>
      </div>
    </div>
  );
}

// ─── UI Atoms ──────────────────────────────────────────────────────────────
const C = {
  blue:"#1565c0", lightBlue:"#42a5f5", bg:"#f0f7ff",
  white:"#fff", card:"#fff", text:"#1a237e",
  muted:"#90a4ae", border:"#e3f2fd", green:"#2e7d32",
  orange:"#e65100", red:"#c62828",
};

const inp = {width:"100%",background:"#f5f9ff",border:"2px solid #e3f2fd",borderRadius:14,padding:"12px 14px",
  fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"'Plus Jakarta Sans',sans-serif",color:C.text};
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
        <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${C.blue},${C.lightBlue})`,
          borderRadius:99,transition:"width 0.5s cubic-bezier(0.34,1.2,0.64,1)"}}/>
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
  const thumbH = large ? 60 : 24;
  const thumbTop = large ? -16 : -8;

  return (
    <div style={{...card(),marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <span style={{fontWeight:700,fontSize:large?18:14,color:C.text}}>{label}</span>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {showStatus&&<span style={{background:col+"15",color:col,borderRadius:99,padding:"3px 10px",fontSize:large?13:11,fontWeight:800,border:`1px solid ${col}30`}}>{txt}</span>}
          <span style={{color:showStatus?col:C.blue,fontSize:large?28:22,fontWeight:900,minWidth:large?70:50,textAlign:"right"}}>{value}{unit}</span>
        </div>
      </div>
      <div dir="ltr" style={{position:"relative",height:trackH,borderRadius:99,background:C.border,marginBottom:6}}>
        <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${pct}%`,borderRadius:99,
          background:`linear-gradient(90deg,${C.blue},${col})`,transition:"width 0.15s"}}/>
        {optimal&&<div style={{position:"absolute",top:-4,left:`${((optimal-min)/(max-min))*100}%`,
          width:large?3:2,height:large?36:16,background:C.blue,borderRadius:2,transform:"translateX(-50%)"}}/>}
        <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(parseFloat(e.target.value))}
          dir="ltr"
          style={{position:"absolute",top:thumbTop,left:0,width:"100%",opacity:0,cursor:"pointer",
            height:thumbH,touchAction:"none",WebkitAppearance:"none"}}/>
      </div>
      <div dir="ltr" style={{display:"flex",justifyContent:"space-between",fontSize:large?12:10,color:C.muted}}>
        <span>{min}</span>{optimal&&<span style={{color:C.blue}}>אופטימלי {optimal}</span>}<span>{max}</span>
      </div>
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
            style={{padding:"7px 14px",borderRadius:99,fontSize:12,fontWeight:800,
              background:value===o?(o==="תקין"?C.blue:C.red):"#f0f4f8",
              color:value===o?"#fff":C.muted,
              boxShadow:value===o?`0 4px 12px ${o==="תקין"?"rgba(21,101,192,0.3)":"rgba(198,40,40,0.3)"}`:  "none",
              transition:"all 0.2s"}}>
            {o}
          </Press>
        ))}
      </div>
    </div>
  );
}

// ─── QR Scanner ───────────────────────────────────────────────────────────
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
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        try {
          // Simple QR detection via URL params in image data text
          // For production use jsQR library
          const text = canvas.toDataURL();
          if (text) {
            // We'll use a file input as fallback for demo
          }
        } catch {}
      }
      rafRef.current = requestAnimationFrame(scan);
    };

    start();
    return () => {
      cancelAnimationFrame(rafRef.current);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Fallback: scan from image file
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d").drawImage(img, 0, 0);
      // Try to read QR text from canvas - simplified
      onResult(file.name.replace(/\.[^.]+$/, ""));
    };
    img.src = url;
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
        {/* Scan frame */}
        <div style={{position:"absolute",inset:0,borderRadius:16,border:"2px solid rgba(255,255,255,0.3)"}}>
          {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h])=>(
            <div key={v+h} style={{position:"absolute",[v]:0,[h]:0,width:30,height:30,
              borderTop:v==="top"?"3px solid #42a5f5":"none",
              borderBottom:v==="bottom"?"3px solid #42a5f5":"none",
              borderLeft:h==="left"?"3px solid #42a5f5":"none",
              borderRight:h==="right"?"3px solid #42a5f5":"none",
              borderRadius:v==="top"&&h==="left"?"8px 0 0 0":v==="top"&&h==="right"?"0 8px 0 0":v==="bottom"&&h==="left"?"0 0 0 8px":"0 0 8px 0"}}/>
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

      <style>{`@keyframes scanLine{0%{top:10%}50%{top:90%}100%{top:10%}}`}</style>
    </div>
  );
}

// ─── Setup Screen ─────────────────────────────────────────────────────────
function SetupScreen({ onDone, onSuperAdmin }) {
  const [name,   setName]   = useState(getCompany().name||"");
  const [sheetId, setSheetId] = useState(getCompany().sheetId||"");
  const [adminEmail, setAdminEmail] = useState(getCompany().adminEmail||"");
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");

  const save = async () => {
    if (!name.trim()) { setErr("נא להזין שם חברה"); return; }
    setSaving(true);
    saveCompany({ name: name.trim(), sheetId: sheetId.trim(), scriptUrl: FIXED_SCRIPT_URL, adminEmail: adminEmail.trim() });
    if (sheetId.trim()) localStorage.setItem("galileo_sheet_id", sheetId.trim());
    setTimeout(() => { setSaving(false); onDone(); }, 600);
  };

  return (
    <div dir="rtl" style={{minHeight:"100vh",background:`linear-gradient(145deg,#0d47a1,#1565c0,#1976d2)`,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}`}</style>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:56,marginBottom:10,filter:"drop-shadow(0 0 20px rgba(255,255,255,0.3))"}}>🌊</div>
          <h1 style={{color:"#fff",fontSize:26,fontWeight:900,margin:"0 0 6px"}}>הגדרת מערכת</h1>
          <p style={{color:"rgba(255,255,255,0.65)",fontSize:13,margin:0}}>הזן את פרטי החברה שלך</p>
        </div>

        <div style={{background:"#fff",borderRadius:24,padding:24,boxShadow:"0 20px 60px rgba(0,0,0,0.25)"}}>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,fontWeight:700,color:"#90a4ae",display:"block",marginBottom:6}}>שם החברה *</label>
            <input value={name} onChange={e=>{setName(e.target.value);setErr("");}} placeholder="לדוגמה: גליליאו בריכות"
              style={{width:"100%",background:"#f5f9ff",border:"2px solid #e3f2fd",borderRadius:12,padding:"12px 14px",fontSize:14,outline:"none",fontFamily:"'Plus Jakarta Sans',sans-serif",color:"#1a237e",boxSizing:"border-box"}}/>
          </div>

          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,fontWeight:700,color:"#90a4ae",display:"block",marginBottom:6}}>Google Sheet ID <span style={{fontWeight:400,opacity:0.7}}>(אופציונלי)</span></label>
            <input value={sheetId} onChange={e=>setSheetId(e.target.value)} placeholder="1abc123xyz..."
              style={{width:"100%",background:"#f5f9ff",border:"2px solid #e3f2fd",borderRadius:12,padding:"12px 14px",fontSize:13,outline:"none",fontFamily:"'Plus Jakarta Sans',sans-serif",color:"#1a237e",boxSizing:"border-box"}}/>
            <p style={{fontSize:11,color:"#90a4ae",marginTop:6,marginBottom:0}}>
              מתוך כתובת הגיליון: docs.google.com/spreadsheets/d/<b>ID</b>/edit
            </p>
          </div>

          <div style={{marginBottom:6}}>
            <label style={{fontSize:12,fontWeight:700,color:"#90a4ae",display:"block",marginBottom:6}}>מייל מנהל לדוחות עם תמונות <span style={{fontWeight:400,opacity:0.7}}>(אופציונלי)</span></label>
            <input value={adminEmail} onChange={e=>setAdminEmail(e.target.value)} placeholder="admin@gmail.com" type="email"
              style={{width:"100%",background:"#f5f9ff",border:"2px solid #e3f2fd",borderRadius:12,padding:"12px 14px",fontSize:13,outline:"none",fontFamily:"'Plus Jakarta Sans',sans-serif",color:"#1a237e",boxSizing:"border-box"}}/>
          </div>

          {err && <div style={{background:"#ffebee",borderRadius:10,padding:"10px 14px",marginBottom:12,color:"#c62828",fontSize:13,fontWeight:700}}>{err}</div>}

          <Press onClick={save}
            style={{marginTop:16,padding:16,borderRadius:14,background:saving?"#90caf9":"linear-gradient(135deg,#1565c0,#42a5f5)",
              color:"#fff",fontWeight:900,fontSize:16,textAlign:"center",
              boxShadow:saving?"none":"0 6px 20px rgba(21,101,192,0.4)"}}>
            {saving?"⏳ שומר...":"התחל →"}
          </Press>
        </div>

        {/* Gear — Super Admin */}
        <div onClick={onSuperAdmin}
          style={{position:"fixed",bottom:16,left:16,fontSize:28,opacity:0.22,padding:10,zIndex:10,WebkitTapHighlightColor:"transparent",cursor:"pointer"}}>
          ⚙️
        </div>
      </div>
    </div>
  );
}

const blank = () => ({
  reportDate:todayStr(),client:"",chlorine:1.5,ph:7.4,salt:3.5,chlora:0,hth:0,
  elModel:"",elSerial:"",elDate:"",
  waterLevel:"תקין",clarity:"תקין",fat:"תקין",flow:"תקין",
  acid:false,phUp:false,saltPkg:false,saltBags:1,
  poolStatus:"מאוזנת",customStatusText:"",restrictedUntil:"",
  notes:"",photos:[],clientLocked:false,
});

// ─── Super Admin Screen ───────────────────────────────────────────────────
function SuperAdminScreen({ onClose }) {
  const [pass, setPass]             = useState("");
  const [auth, setAuth]             = useState(false);
  const [err,  setErr]              = useState("");
  const [tab,  setTab]              = useState("issues");
  const [clients, setClients]       = useState([]);
  const [issues,  setIssues]        = useState([]);
  const [loading, setLoading]       = useState(false);
  const [vis, setVis]               = useState(false);
  const [dateFilter, setDateFilter] = useState("");
  const [newPass, setNewPass]       = useState("");
  const [newPass2, setNewPass2]     = useState("");
  const [passMsg, setPassMsg]       = useState("");
  const [editClient, setEditClient] = useState(null); // client being edited
  const [newClient, setNewClient]   = useState({name:"",contact:"",phone:"",email:"",plan:"PRO",status:"פעיל",sheetId:"",notes:""});
  const [showAddClient, setShowAddClient] = useState(false);
  const [issueNote, setIssueNote]   = useState({});
  const [saving, setSaving]         = useState(false);
  const [toast2, setToast2]         = useState("");

  useEffect(()=>{ setTimeout(()=>setVis(true),10); },[]);
  const close = () => { setVis(false); setTimeout(onClose,350); haptic("medium"); };

  const showMsg = (m) => { setToast2(m); setTimeout(()=>setToast2(""),2500); };

  const login = () => {
    if(pass===getSuperPass()){ setAuth(true); loadData(); haptic("success"); }
    else { setErr("סיסמה שגויה"); haptic("medium"); }
  };

  const loadData = async () => {
    setLoading(true);
    const [cRes, iRes] = await Promise.all([mgmtCall("getMgmtClients"), mgmtCall("getMgmtIssues")]);
    if(cRes?.clients) setClients(cRes.clients);
    if(iRes?.issues)  setIssues(iRes.issues);
    setLoading(false);
  };

  const saveClient = async (row) => {
    setSaving(true);
    await mgmtCall("saveMgmtClient", { row });
    await loadData();
    setSaving(false);
    showMsg("✅ נשמר");
    haptic("success");
  };

  const deleteClient = async (rowIndex) => {
    if(!window.confirm("למחוק לקוח זה?")) return;
    setSaving(true);
    await mgmtCall("deleteMgmtClient", { rowIndex });
    await loadData();
    setSaving(false);
    showMsg("🗑️ לקוח נמחק");
    haptic("medium");
  };

  const updateClientStatus = async (rowIndex, status) => {
    setSaving(true);
    await mgmtCall("updateMgmtClientStatus", { rowIndex, status });
    await loadData();
    setSaving(false);
    showMsg("✅ עודכן");
    haptic("success");
  };

  const updateIssueStatus = async (idx, newStatus) => {
    haptic("success");
    const updated = [...issues];
    updated[idx] = [...updated[idx]];
    updated[idx][5] = newStatus;
    setIssues(updated);
    await mgmtCall("updateMgmtIssueStatus", { rowIndex: idx+2, status: newStatus });
    showMsg("✅ סטטוס עודכן");
  };

  const addIssueNote = async (idx, note) => {
    if(!note.trim()) return;
    const updated = [...issues];
    updated[idx] = [...updated[idx]];
    updated[idx][6] = note;
    setIssues(updated);
    await mgmtCall("updateMgmtIssueStatus", { rowIndex: idx+2, status: updated[idx][5], note });
    setIssueNote({});
    showMsg("✅ הערה נוספה");
    haptic("success");
  };

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
        {[["name","שם חברה *"],["contact","איש קשר"],["phone","טלפון"],["email","מייל"],["sheetId","Sheet ID"]].map(([k,lbl])=>(
          <div key={k} style={{marginBottom:10}}>
            <label style={{fontSize:11,fontWeight:700,color:C2.muted,display:"block",marginBottom:4}}>{lbl}</label>
            <input value={f[k]||""} onChange={e=>setF(x=>({...x,[k]:e.target.value}))} style={inp2} placeholder={lbl}/>
          </div>
        ))}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div>
            <label style={{fontSize:11,fontWeight:700,color:C2.muted,display:"block",marginBottom:4}}>מנוי</label>
            <select value={f.plan||"PRO"} onChange={e=>setF(x=>({...x,plan:e.target.value}))} style={{...inp2}}>
              <option>PRO</option><option>Basic</option><option>ניסיון</option>
            </select>
          </div>
          <div>
            <label style={{fontSize:11,fontWeight:700,color:C2.muted,display:"block",marginBottom:4}}>סטטוס</label>
            <select value={f.status||"פעיל"} onChange={e=>setF(x=>({...x,status:e.target.value}))} style={{...inp2}}>
              <option>פעיל</option><option>מושהה</option><option>ניסיון</option>
            </select>
          </div>
        </div>
        <div style={{marginBottom:12}}>
          <label style={{fontSize:11,fontWeight:700,color:C2.muted,display:"block",marginBottom:4}}>הערות</label>
          <textarea value={f.notes||""} onChange={e=>setF(x=>({...x,notes:e.target.value}))} rows={2} style={{...inp2,resize:"none"}}/>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Press onClick={()=>onSave(f)} style={{flex:1,padding:"12px",borderRadius:12,background:`linear-gradient(135deg,${C2.blue},#42a5f5)`,color:"#fff",fontWeight:800,fontSize:13,textAlign:"center"}}>
            {saving?"⏳":"💾 שמור"}
          </Press>
          <Press onClick={onCancel} style={{padding:"12px 16px",borderRadius:12,background:"#f0f4f8",color:C2.muted,fontWeight:700,fontSize:13}}>
            ביטול
          </Press>
        </div>
      </div>
    );
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",flexDirection:"column"}}>
      <div onClick={close} style={{position:"absolute",inset:0,background:`rgba(0,0,0,${vis?0.6:0})`,transition:"background 0.3s",backdropFilter:"blur(6px)"}}/>
      <div dir="rtl" style={{position:"relative",background:"#f0f7ff",
        transform:vis?"translateY(0)":"translateY(100%)",
        transition:"transform 0.4s cubic-bezier(0.34,1.2,0.64,1)",
        height:"100vh",display:"flex",flexDirection:"column",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>

        {/* Header */}
        <div style={{background:`linear-gradient(145deg,#0d47a1,#1565c0,#1976d2)`,padding:"28px 20px 20px",position:"relative",overflow:"hidden",flexShrink:0}}>
          <div style={{position:"absolute",top:-40,left:-40,width:160,height:160,borderRadius:"50%",background:"rgba(255,255,255,0.05)"}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative"}}>
            <div>
              <div style={{color:"rgba(255,255,255,0.55)",fontSize:11,fontWeight:700,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:4}}>Super Admin</div>
              <div style={{color:"#fff",fontSize:22,fontWeight:900}}>PoolSync PRO</div>
              {auth&&<div style={{color:"rgba(255,255,255,0.6)",fontSize:12,marginTop:2}}>{clients.length} לקוחות · {pendingCount} תקלות ממתינות</div>}
            </div>
            <div style={{display:"flex",gap:8}}>
              {auth&&<Press onClick={()=>{loadData();haptic();}} style={{background:"rgba(255,255,255,0.15)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:12,padding:"8px 12px",color:"#fff",fontSize:13,fontWeight:700}}>🔄</Press>}
              <Press onClick={close} style={{width:36,height:36,borderRadius:"50%",background:"rgba(255,255,255,0.15)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:16}}>✕</Press>
            </div>
          </div>
        </div>

        {/* Toast */}
        {toast2&&<div style={{position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",background:"#0d47a1",color:"#fff",borderRadius:99,padding:"10px 22px",fontSize:13,fontWeight:700,zIndex:999,whiteSpace:"nowrap",boxShadow:"0 8px 24px rgba(13,71,161,0.4)"}}>{toast2}</div>}

        {!auth?(
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
            <div style={{background:"#fff",borderRadius:24,padding:28,width:"100%",maxWidth:340,boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}}>
              <div style={{fontSize:48,textAlign:"center",marginBottom:12}}>🔐</div>
              <div style={{fontWeight:900,fontSize:18,color:C2.text,textAlign:"center",marginBottom:20}}>כניסה מאובטחת</div>
              <input type="password" value={pass} onChange={e=>{setPass(e.target.value);setErr("");}}
                placeholder="סיסמה סודית" style={{...inp2,marginBottom:err?8:16}} onKeyDown={e=>e.key==="Enter"&&login()}/>
              {err&&<div style={{background:"#ffebee",borderRadius:10,padding:"8px 14px",marginBottom:12,color:C2.red,fontSize:13,fontWeight:700,textAlign:"center"}}>⚠️ {err}</div>}
              <Press onClick={login} style={{padding:"14px",borderRadius:14,background:`linear-gradient(135deg,${C2.blue},#42a5f5)`,color:"#fff",fontWeight:900,fontSize:15,textAlign:"center",boxShadow:"0 6px 20px rgba(21,101,192,0.4)"}}>כניסה →</Press>
            </div>
          </div>
        ):(
          <>
            {/* Tabs */}
            <div style={{background:C2.white,padding:"8px 12px",borderBottom:`1px solid ${C2.border}`,display:"flex",gap:6,flexShrink:0,overflowX:"auto",boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
              {[["issues",`🔧 תקלות${pendingCount>0?` (${pendingCount})`:""}`,],["clients","👥 לקוחות"],["stats","📊 סטטיסטיקות"],["settings","⚙️ הגדרות"]].map(([t,lbl])=>(
                <Press key={t} onClick={()=>{setTab(t);haptic();}}
                  style={{padding:"9px 14px",borderRadius:99,fontSize:12,fontWeight:800,flexShrink:0,whiteSpace:"nowrap",
                    background:tab===t?`linear-gradient(135deg,${C2.blue},#42a5f5)`:"#f0f4f8",
                    color:tab===t?"#fff":C2.muted,boxShadow:tab===t?"0 4px 12px rgba(21,101,192,0.3)":"none"}}>
                  {lbl}
                </Press>
              ))}
            </div>

            <div style={{flex:1,overflowY:"auto",padding:"16px"}}>
              {loading&&<div style={{textAlign:"center",padding:60,color:C2.muted}}><div style={{fontSize:32,marginBottom:12}}>⏳</div><div style={{fontSize:14,fontWeight:700}}>טוען...</div></div>}

              {/* ── תקלות ── */}
              {tab==="issues"&&!loading&&(
                <div>
                  {pendingCount>0&&(
                    <div style={{background:"#fff8e1",border:"1px solid #ffe082",borderRadius:16,padding:"14px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
                      <span style={{fontSize:22}}>🔔</span>
                      <div>
                        <div style={{fontWeight:800,fontSize:14,color:C2.orange}}>{pendingCount} תקלות ממתינות לטיפול</div>
                        <div style={{fontSize:11,color:"#bf6900",marginTop:2}}>לחץ על סטטוס לעדכון</div>
                      </div>
                    </div>
                  )}
                  <div style={{display:"flex",gap:8,marginBottom:16}}>
                    <input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)} style={{...inp2,flex:1,fontSize:12}}/>
                    {dateFilter&&<Press onClick={()=>setDateFilter("")} style={{padding:"10px 14px",borderRadius:10,background:"#ffebee",color:C2.red,fontWeight:700,fontSize:12}}>✕</Press>}
                  </div>
                  {filteredIssues.length===0&&<div style={{background:C2.white,borderRadius:16,padding:32,textAlign:"center",color:C2.muted}}><div style={{fontSize:32,marginBottom:8}}>✅</div><div style={{fontWeight:700}}>אין תקלות</div></div>}
                  {filteredIssues.map((issue,i)=>{
                    const priority=issue[4]||"רגיל";
                    const status=issue[5]||"פתוח";
                    const priColor=priority==="קריטי"?C2.red:priority==="דחוף"?C2.orange:C2.blue;
                    const realIdx=issues.indexOf(issue);
                    const showNote=issueNote[realIdx]!==undefined;
                    return (
                      <div key={i} style={{background:C2.white,borderRadius:16,padding:16,marginBottom:12,border:`2px solid ${priColor}22`,boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                          <div style={{fontWeight:900,fontSize:15,color:C2.text}}>{issue[1]}</div>
                          <span style={{background:priColor+"18",color:priColor,borderRadius:99,padding:"4px 12px",fontSize:11,fontWeight:800}}>{priority}</span>
                        </div>
                        <div style={{fontSize:13,color:"#546e7a",marginBottom:6,lineHeight:1.6}}>{issue[3]}</div>
                        <div style={{fontSize:11,color:C2.muted,marginBottom:10}}>📅 {issue[2]}</div>
                        {issue[6]&&<div style={{background:"#e8f5e9",borderRadius:10,padding:"8px 12px",fontSize:12,color:C2.green,fontWeight:700,marginBottom:10}}>📝 {issue[6]}</div>}

                        {/* Status buttons */}
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                          {["פתוח","בטיפול","הועבר","טופל"].map(s=>(
                            <Press key={s} onClick={()=>updateIssueStatus(realIdx,s)}
                              style={{padding:"7px 12px",borderRadius:99,fontSize:11,fontWeight:800,
                                background:status===s?statusColor(s):"#f0f4f8",
                                color:status===s?statusTextColor(s):C2.muted,
                                border:`1px solid ${status===s?statusTextColor(s)+"50":"transparent"}`,
                                boxShadow:status===s?"0 2px 8px rgba(0,0,0,0.1)":"none"}}>
                              {s==="פתוח"?"🔴":s==="בטיפול"?"🔵":s==="הועבר"?"🟣":"🟢"} {s}
                            </Press>
                          ))}
                        </div>

                        {/* Add note */}
                        <div style={{display:"flex",gap:8}}>
                          {!showNote?(
                            <Press onClick={()=>setIssueNote({...issueNote,[realIdx]:""})}
                              style={{padding:"7px 14px",borderRadius:10,background:"#f0f4f8",color:C2.muted,fontSize:12,fontWeight:700}}>
                              ➕ הוסף הערה
                            </Press>
                          ):(
                            <>
                              <input value={issueNote[realIdx]||""} onChange={e=>setIssueNote({...issueNote,[realIdx]:e.target.value})}
                                placeholder="כתוב הערה..." style={{...inp2,flex:1,padding:"8px 12px",fontSize:12}}/>
                              <Press onClick={()=>addIssueNote(realIdx,issueNote[realIdx]||"")}
                                style={{padding:"8px 14px",borderRadius:10,background:C2.blue,color:"#fff",fontWeight:700,fontSize:12}}>שמור</Press>
                              <Press onClick={()=>setIssueNote({})}
                                style={{padding:"8px 10px",borderRadius:10,background:"#ffebee",color:C2.red,fontWeight:700,fontSize:12}}>✕</Press>
                            </>
                          )}
                          {/* Email client */}
                          {clients.find(c=>c[1]===issue[1])?.[4]&&(
                            <a href={`mailto:${clients.find(c=>c[1]===issue[1])[4]}?subject=עדכון תקלה&body=שלום,\nתקלה: ${issue[3]}\nסטטוס: ${status}`}
                              style={{padding:"7px 14px",borderRadius:10,background:"#e3f2fd",color:C2.blue,fontSize:12,fontWeight:700,textDecoration:"none"}}>
                              ✉️ מייל
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── לקוחות ── */}
              {tab==="clients"&&!loading&&(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <div style={{fontSize:12,fontWeight:800,color:C2.muted,letterSpacing:"0.1em",textTransform:"uppercase"}}>{clients.length} לקוחות</div>
                    <Press onClick={()=>setShowAddClient(!showAddClient)}
                      style={{padding:"8px 16px",borderRadius:99,background:showAddClient?"#ffebee":`linear-gradient(135deg,${C2.blue},#42a5f5)`,color:showAddClient?C2.red:"#fff",fontWeight:800,fontSize:12,boxShadow:showAddClient?"none":"0 4px 12px rgba(21,101,192,0.3)"}}>
                      {showAddClient?"✕ ביטול":"➕ לקוח חדש"}
                    </Press>
                  </div>

                  {showAddClient&&(
                    <ClientForm data={newClient} onCancel={()=>setShowAddClient(false)} onSave={async(f)=>{
                      if(!f.name?.trim()){showMsg("⚠️ נא להזין שם חברה");return;}
                      await saveClient([Date.now(),f.name,f.contact,f.phone,f.email,f.plan,f.status,f.sheetId,"","","","","","",f.notes]);
                      setNewClient({name:"",contact:"",phone:"",email:"",plan:"PRO",status:"פעיל",sheetId:"",notes:""});
                      setShowAddClient(false);
                    }}/>
                  )}

                  {clients.length===0&&!showAddClient&&<div style={{background:C2.white,borderRadius:16,padding:32,textAlign:"center",color:C2.muted}}><div style={{fontSize:32,marginBottom:8}}>👥</div><div style={{fontWeight:700}}>אין לקוחות עדיין</div></div>}

                  {clients.map((c,i)=>(
                    <div key={i}>
                      {editClient===i?(
                        <ClientForm data={{name:c[1],contact:c[2],phone:c[3],email:c[4],plan:c[5],status:c[6],sheetId:c[7],notes:c[14]}} onCancel={()=>setEditClient(null)} onSave={async(f)=>{
                          const row=[c[0],f.name,f.contact,f.phone,f.email,f.plan,f.status,f.sheetId,...c.slice(8,14),f.notes];
                          await saveClient(row);
                          setEditClient(null);
                        }}/>
                      ):(
                        <div style={{background:C2.white,borderRadius:16,padding:16,marginBottom:10,boxShadow:"0 2px 12px rgba(0,0,0,0.06)",border:`1px solid ${c[6]==="מושהה"?C2.red+"33":C2.border}`}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                            <div>
                              <div style={{fontWeight:900,fontSize:15,color:C2.text}}>{c[1]}</div>
                              <div style={{fontSize:12,color:C2.muted,marginTop:3}}>{c[2]} · {c[3]}</div>
                            </div>
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

                          {/* Quick status */}
                          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
                            {["פעיל","מושהה","ניסיון"].map(s=>(
                              <Press key={s} onClick={()=>updateClientStatus(i+2,s)}
                                style={{padding:"5px 12px",borderRadius:99,fontSize:11,fontWeight:800,
                                  background:(c[6]||"פעיל")===s?(s==="פעיל"?"#e8f5e9":s==="מושהה"?"#ffebee":"#fff8e1"):"#f0f4f8",
                                  color:(c[6]||"פעיל")===s?(s==="פעיל"?C2.green:s==="מושהה"?C2.red:C2.orange):C2.muted}}>
                                {s}
                              </Press>
                            ))}
                          </div>

                          {/* Issues count */}
                          {(()=>{
                            const ci=issues.filter(iss=>String(iss[1])===String(c[1]));
                            if(!ci.length)return null;
                            return (
                              <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C2.border}`}}>
                                <div style={{fontSize:11,fontWeight:700,color:C2.muted,marginBottom:4}}>תקלות ({ci.length})</div>
                                {ci.map((iss,j)=>(
                                  <div key={j} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 0",color:"#546e7a"}}>
                                    <span>{iss[3]?.slice(0,30)}...</span>
                                    <span style={{color:statusTextColor(iss[5]),fontWeight:700}}>{iss[5]||"פתוח"}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}

                          {/* Edit / Delete */}
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

              {/* ── סטטיסטיקות ── */}
              {tab==="stats"&&!loading&&(
                <div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                    {[
                      ["👥","סה\"כ לקוחות",clients.length,C2.blue],
                      ["✅","לקוחות פעילים",clients.filter(c=>c[6]==="פעיל"||!c[6]).length,C2.green],
                      ["🔧","תקלות פתוחות",issues.filter(i=>i[5]==="פתוח"||!i[5]).length,C2.orange],
                      ["💎","מנוי PRO",clients.filter(c=>c[5]==="PRO").length,C2.blue],
                    ].map(([ic,lbl,val,col])=>(
                      <div key={lbl} style={{background:C2.white,borderRadius:16,padding:16,textAlign:"center",boxShadow:"0 2px 12px rgba(0,0,0,0.06)",border:`1px solid ${C2.border}`}}>
                        <div style={{fontSize:28,marginBottom:6}}>{ic}</div>
                        <div style={{fontSize:28,fontWeight:900,color:col,lineHeight:1}}>{val}</div>
                        <div style={{fontSize:11,color:C2.muted,marginTop:4,fontWeight:700}}>{lbl}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{fontSize:12,fontWeight:800,color:C2.muted,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:12}}>פילוח לפי סטטוס</div>
                  {[["פעיל",C2.green],["מושהה",C2.red],["ניסיון",C2.orange]].map(([s,col])=>{
                    const cnt=clients.filter(c=>(c[6]||"פעיל")===s).length;
                    const pct=clients.length>0?Math.round((cnt/clients.length)*100):0;
                    return (
                      <div key={s} style={{background:C2.white,borderRadius:12,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
                        <div style={{width:10,height:10,borderRadius:"50%",background:col,flexShrink:0}}/>
                        <div style={{flex:1,fontWeight:700,fontSize:13,color:C2.text}}>{s}</div>
                        <div style={{fontWeight:900,fontSize:15,color:col}}>{cnt}</div>
                        <div style={{background:"#f0f4f8",borderRadius:99,padding:"3px 10px",fontSize:11,color:C2.muted,fontWeight:700}}>{pct}%</div>
                      </div>
                    );
                  })}

                  <div style={{fontSize:12,fontWeight:800,color:C2.muted,letterSpacing:"0.1em",textTransform:"uppercase",margin:"16px 0 12px"}}>תקלות לפי סטטוס</div>
                  {["פתוח","בטיפול","הועבר","טופל"].map(s=>{
                    const cnt=issues.filter(i=>(i[5]||"פתוח")===s).length;
                    const col=statusTextColor(s);
                    return (
                      <div key={s} style={{background:C2.white,borderRadius:12,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
                        <div style={{width:10,height:10,borderRadius:"50%",background:col,flexShrink:0}}/>
                        <div style={{flex:1,fontWeight:700,fontSize:13,color:C2.text}}>{s}</div>
                        <div style={{fontWeight:900,fontSize:15,color:col}}>{cnt}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── הגדרות ── */}
              {tab==="settings"&&(
                <div>
                  <div style={{background:C2.white,borderRadius:16,padding:20,boxShadow:"0 2px 12px rgba(0,0,0,0.06)",border:`1px solid ${C2.border}`}}>
                    <div style={{fontWeight:900,fontSize:16,color:C2.text,marginBottom:20}}>🔑 שינוי סיסמת כניסה</div>
                    <div style={{marginBottom:12}}>
                      <label style={{fontSize:11,fontWeight:700,color:C2.muted,display:"block",marginBottom:6}}>סיסמה חדשה</label>
                      <input type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} style={inp2} placeholder="לפחות 6 תווים"/>
                    </div>
                    <div style={{marginBottom:16}}>
                      <label style={{fontSize:11,fontWeight:700,color:C2.muted,display:"block",marginBottom:6}}>אימות סיסמה</label>
                      <input type="password" value={newPass2} onChange={e=>setNewPass2(e.target.value)} style={inp2} placeholder="הזן שוב"/>
                    </div>
                    {passMsg&&<div style={{background:passMsg.includes("✅")?"#e8f5e9":"#ffebee",borderRadius:10,padding:"10px 14px",marginBottom:14,color:passMsg.includes("✅")?C2.green:C2.red,fontSize:13,fontWeight:700,textAlign:"center"}}>{passMsg}</div>}
                    <Press onClick={()=>{
                      if(!newPass||newPass.length<6){setPassMsg("⚠️ סיסמה חייבת להיות לפחות 6 תווים");return;}
                      if(newPass!==newPass2){setPassMsg("⚠️ הסיסמאות לא תואמות");return;}
                      setSuperPass(newPass); setNewPass(""); setNewPass2("");
                      setPassMsg("✅ סיסמה עודכנה!"); haptic("success");
                      setTimeout(()=>setPassMsg(""),3000);
                    }} style={{padding:"14px",borderRadius:14,background:`linear-gradient(135deg,${C2.blue},#42a5f5)`,color:"#fff",fontWeight:900,fontSize:15,textAlign:"center",boxShadow:"0 6px 20px rgba(21,101,192,0.35)"}}>
                      עדכן סיסמה
                    </Press>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const company = getCompany();
  const [showSetup, setShowSetup] = useState(()=>{
    const c = getCompany();
    // אם יש שם חברה — לא מציגים setup
    if(c.name) return false;
    // אם יש cache עם נתונים — כנראה כבר הוגדר
    try {
      const cached = localStorage.getItem("galileo_cache");
      if(cached && JSON.parse(cached)?.users?.length) return false;
    } catch {}
    return true;
  });
  const [companyName, setCompanyName] = useState(company.name||"גליליאו");
  const [user,setUser]               = useState(()=>{
    try { return JSON.parse(localStorage.getItem("galileo_user")||"null"); } catch { return null; }
  });
  const [loginUser,setLoginUser]     = useState("");
  const [loginPass,setLoginPass]     = useState("");
  const [loginErr,setLoginErr]       = useState("");
  const [loginLoading,setLoginLoading] = useState(false);
  const [sheetId,setSheetId]         = useState("");
  const [clientPlan,setClientPlan]   = useState({plan:"",status:""});
  const [allUsers,setAllUsers]       = useState(DEMO_USERS);
  const [clients,setClients]         = useState(DEMO_CLIENTS);
  const [tasks,setTasks]             = useState([]);
  const [supplyDB,setSupplyDB]       = useState({});
  const [lastReadings,setLastReadings] = useState({}); // {clientName: {chlorine, ph, date}}
  const [reports,setReports]         = useState([]);
  const [pending,setPending]         = useState([]);
  const [screen,setScreen]           = useState(()=>{
    try {
      const u = JSON.parse(localStorage.getItem("galileo_user")||"null");
      return u ? (u.role==="admin"?"admin":"daily") : "login";
    } catch { return "login"; }
  });
  const [syncing,setSyncing]         = useState(false);
  const [form,setForm]               = useState(blank());
  const [adminTab,setAdminTab]       = useState("daily");
  const [taskDate,setTaskDate]       = useState(todayStr());
  const [taskClient,setTaskClient]   = useState("");
  const [taskOps,setTaskOps]         = useState([]);
  const [taskNote,setTaskNote]       = useState("");
  const [editTaskId,setEditTaskId]   = useState(null);
  const [dailyDate,setDailyDate]     = useState(todayStr());
  const [showConv,setShowConv]       = useState(false);
  const [convTarget,setConvTarget]   = useState("");
  const [navTab,setNavTab]           = useState(0);
  const [toast,setToast]             = useState({msg:"",visible:false});
  const [reportSheet,setReportSheet] = useState(null);
  const [workStart,setWorkStart]     = useState(()=>localStorage.getItem("galileo_workstart")||null);
  const [workLogs,setWorkLogs]       = useState(()=>{try{return JSON.parse(localStorage.getItem("galileo_worklogs")||"[]");}catch{return [];}});
  const [showQR,setShowQR]           = useState(false);
  const [showQRCode,setShowQRCode]   = useState(null);
  const [dismissed,setDismissed]     = useState(false);
  const [showSuperAdmin,setShowSuperAdmin] = useState(false);
  const [showReportIssue,setShowReportIssue] = useState(false);
  const [issueDesc,setIssueDesc]         = useState("");
  const [issuePriority,setIssuePriority] = useState("רגיל");
  const [newClient,setNewClient]     = useState({name:"",phone:"",address:""});
  const [reportFilter,setReportFilter] = useState("");
  const [reportDateFilter,setReportDateFilter] = useState("");
  const [sheetReports,setSheetReports] = useState([]);
  const logoLongPress = useRef();
  const fileRef = useRef();
  const toastTimer = useRef();

  const sf = (k,v) => setForm(f=>({...f,[k]:v}));
  const {reportDate,client,chlorine,ph,salt,elModel,elSerial,elDate,
    waterLevel,clarity,fat,flow,acid,phUp,saltPkg,saltBags,
    poolStatus,customStatusText,restrictedUntil,notes,photos} = form;

  const clientPhone   = (n) => (clients.find(c=>c.name===n)||{}).phone||"";
  const clientAddress = (n) => (clients.find(c=>c.name===n)||{}).address||"";
  const operatorUsers = allUsers.filter(u=>u.role==="operator");
  const opNames       = operatorUsers.map(u=>u.name);

  // ── Normalize helpers ─────────────────────────────────────────────────────
  const normalizeDate = (d) => String(d||"").trim().slice(0,10);
  const normalizeName = (n) => String(n||"").trim().toLowerCase();

  const myTasks = (date=dailyDate) => tasks.filter(t=>{
    const tDate = normalizeDate(t.date);
    const tDate2 = tDate.includes("T") ? tDate.split("T")[0] : tDate;
    const dateMatch = tDate2 === date;
    const nameMatch = user?.role==="admin" ||
      (t.operators||[]).some(op => normalizeName(op)===normalizeName(user?.name));
    return dateMatch && nameMatch;
  });

  // ── Auto refresh tasks every 10 seconds + on focus ──────────────────────
  useEffect(()=>{
    if(!user) return;

    const refresh = async() => {
      const tR = await sheetCall("getTasks");
      if(Array.isArray(tR?.tasks) && tR.tasks.length>0) {
        setTasks(tR.tasks);
        try {
          const cached = localStorage.getItem("galileo_cache");
          const c = cached ? JSON.parse(cached) : {};
          localStorage.setItem("galileo_cache", JSON.stringify({...c, tasks:tR.tasks}));
        } catch {}
      }
    };

    const interval = setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    return ()=>{ clearInterval(interval); window.removeEventListener("focus", refresh); };
  },[user]);
  const todayReported = reports.filter(r=>r.reportDate===dailyDate&&r.operator===user?.name).map(r=>r.client);

  const handleLogout = () => {
    localStorage.removeItem("galileo_user");
    setUser(null);
    setLoginUser("");
    setLoginPass("");
    setScreen("login");
    haptic("medium");
  };

  const showToast = (msg) => {
    clearTimeout(toastTimer.current);
    setToast({msg,visible:true});
    toastTimer.current = setTimeout(()=>setToast(t=>({...t,visible:false})),2500);
  };

  // ── Load cache on start ───────────────────────────────────────────────────
  useEffect(()=>{
    try {
      const cached = localStorage.getItem("galileo_cache");
      if(cached){
        const {users,clients:cls,tasks:tsk,supplyDB:sdb,lastReadings:lr}=JSON.parse(cached);
        if(users?.length) setAllUsers(users);
        if(cls?.length)   setClients(cls);
        if(tsk)           setTasks(tsk);
        if(sdb)           setSupplyDB(sdb);
        if(lr)            setLastReadings(lr);
        setSheetId("connected");
      }
    } catch {}
    // Refresh in background
    connectSheets(true);
  },[]);

  // ── Sheets ────────────────────────────────────────────────────────────────
  const connectSheets = async (bg=false) => {
    try {
      const cached = localStorage.getItem("galileo_cache");
      if(cached){
        const {users,clients:cls,tasks:tsk,supplyDB:sdb,lastReadings:lr}=JSON.parse(cached);
        if(users?.length) setAllUsers(users);
        if(cls?.length)   setClients(cls);
        if(tsk)           setTasks(tsk);
        if(sdb)           setSupplyDB(sdb);
        if(lr)            setLastReadings(lr);
        setSheetId("connected");
        if(!bg) return;
      }
    } catch {}
    try {
      const [uR,cR,tR,sR,rR] = await Promise.all([
        sheetCall("getUsers"),sheetCall("getClients"),sheetCall("getTasks"),
        sheetCall("getSupplyDB"),sheetCall("getLastReadings")
      ]);
      const u=uR?.users?.length?uR.users:null;
      const c=cR?.clients?.length?cR.clients:null;
      const t=Array.isArray(tR?.tasks)?tR.tasks:null;
      const s=sR?.supplyDB?sR.supplyDB:null;
      const lr=rR?.lastReadings?rR.lastReadings:null;
      if(u)setAllUsers(u); if(c)setClients(c); if(t)setTasks(t); if(s)setSupplyDB(s); if(lr)setLastReadings(lr);
      localStorage.setItem("galileo_cache",JSON.stringify({users:u||allUsers,clients:c||clients,tasks:t||[],supplyDB:s||{},lastReadings:lr||{},cachedAt:Date.now()}));
      setSheetId("connected");
      // Fetch plan/status from mgmt
      try {
        const company = getCompany();
        if(company.sheetId) {
          const mgmtRes = await mgmtCall("getMgmtClients");
          const rec = (mgmtRes?.clients||[]).find(c=>String(c[7])===String(company.sheetId));
          if(rec) setClientPlan({plan:rec[5]||"",status:rec[6]||""});
        }
      } catch {}
    } catch {}
  };

  const handleLogin = async () => {
    setLoginErr(""); setLoginLoading(true);

    let usersToCheck = [...allUsers];

    // נסה לשלוף מ-Sheets
    try {
      const uRes = await sheetCall("getUsers");
      if (uRes?.users?.length) {
        usersToCheck = uRes.users;
        setAllUsers(uRes.users);
        try {
          const cached = localStorage.getItem("galileo_cache");
          const cacheData = cached ? JSON.parse(cached) : {};
          localStorage.setItem("galileo_cache", JSON.stringify({...cacheData, users:uRes.users}));
        } catch {}
      }
    } catch {}

    // בדוק אם המנוי מושהה
    try {
      const company = getCompany();
      if(company.sheetId) {
        const mgmtRes = await mgmtCall("getMgmtClients");
        const mgmtClients = mgmtRes?.clients||[];
        const myRecord = mgmtClients.find(c => String(c[7])===String(company.sheetId));
        if(myRecord && myRecord[6]==="מושהה") {
          setLoginErr("⛔ המנוי שלך מושהה. לפרטים צור קשר עם מנהל המערכת.");
          setLoginLoading(false);
          haptic("medium");
          return;
        }
      }
    } catch {}

    // חפש משתמש — case insensitive, trim, password כ-string
    const found = usersToCheck.find(u=>
      String(u.username||"").toLowerCase().trim() === loginUser.toLowerCase().trim() &&
      String(u.password||"").trim() === loginPass.trim()
    );

    if(found){
      setUser(found);
      localStorage.setItem("galileo_user", JSON.stringify(found));
      setScreen(found.role==="admin"?"admin":"daily");
      haptic("medium");
      connectSheets(true);
    } else {
      setLoginErr("שם משתמש או סיסמה שגויים");
    }
    setLoginLoading(false);
  };

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const saveTask = async (task) => {
    const isEdit=!!editTaskId;
    const cleanTask={...task, date: task.date?.slice(0,10)||todayStr()};
    // needsAck תמיד — גם ביצירה וגם בעריכה
    const logEntry={at:nowStr(),note:taskNote||(isEdit?"משימה עודכנה":"📋 משימה חדשה הוקצתה לך"),by:user?.name,needsAck:true,ackedBy:[]};
    const newTasks=isEdit?tasks.map(t=>t.id===editTaskId?{...t,...cleanTask,changeLog:[...(t.changeLog||[]),logEntry]}:t):[...tasks,{id:Date.now(),...cleanTask,status:"pending",changeLog:[logEntry]}];
    setTasks(newTasks); setEditTaskId(null); setTaskClient(""); setTaskOps([]); setTaskNote("");
    if(sheetId) await sheetCall("saveTasks",{tasks:newTasks});
    showToast(isEdit?"✏️ משימה עודכנה":"✅ משימה נוספה");
  };

  const updateTask = async (id,changes,logNote,isAdmin=false) => {
    const newTasks=tasks.map(t=>{
      if(t.id!==id)return t;
      const entry={at:nowStr(),note:logNote,by:user?.name,...(isAdmin?{needsAck:true,ackedBy:[]}:{})};
      return{...t,...changes,changeLog:[...(t.changeLog||[]),entry]};
    });
    setTasks(newTasks);
    if(sheetId) await sheetCall("saveTasks",{tasks:newTasks});
  };

  const ackChange = async (taskId,logIdx) => {
    const newTasks=tasks.map(t=>{
      if(t.id!==taskId)return t;
      const newLog=t.changeLog.map((e,i)=>{
        if(i!==logIdx)return e;
        const ackedBy=[...(e.ackedBy||[])];
        if(!ackedBy.includes(user?.name))ackedBy.push(user?.name);
        return{...e,ackedBy};
      });
      return{...t,changeLog:newLog};
    });
    setTasks(newTasks);
    if(sheetId) await sheetCall("saveTasks",{tasks:newTasks});
    showToast("✓ קיבלת אישור נשלח");
  };

  const removeOp=(id,n)=>updateTask(id,{operators:tasks.find(t=>t.id===id)?.operators.filter(o=>o!==n)||[]},`הוסר ${n} מהמשימה`,true);
  const addOp=(id,n)=>{const t=tasks.find(x=>x.id===id);if(!t||t.operators.includes(n))return;updateTask(id,{operators:[...t.operators,n]},`נוסף ${n} למשימה`,true);};
  const markDone=(id)=>updateTask(id,{status:"done"},"דוח הוגש — בוצעה",false);

  // ── Work hours ────────────────────────────────────────────────────────────
  const handleStartWork = () => {
    const now=new Date().toLocaleTimeString("he-IL",{hour:"2-digit",minute:"2-digit"});
    localStorage.setItem("galileo_workstart",now);
    setWorkStart(now); haptic("medium"); showToast("▶ יום עבודה התחיל!");
  };
  const handleEndWork = () => {
    if(!workStart)return;
    const end=new Date().toLocaleTimeString("he-IL",{hour:"2-digit",minute:"2-digit"});
    const [sh,sm]=workStart.split(":").map(Number);
    const [eh,em]=end.split(":").map(Number);
    const tot=(eh*60+em)-(sh*60+sm);
    const totalStr=`${Math.floor(tot/60)}:${String(tot%60).padStart(2,"0")}`;
    const log={id:Date.now(),operator:user?.name,date:todayStr(),start:workStart,end,total:totalStr};
    const newLogs=[...workLogs,log];
    setWorkLogs(newLogs);
    localStorage.setItem("galileo_worklogs",JSON.stringify(newLogs));
    localStorage.removeItem("galileo_workstart");
    setWorkStart(null); haptic("success"); showToast(`⏹ ${totalStr} שעות עבודה נשמרו`);
    if(sheetId) sheetCall("saveWorkLog",{log});
  };

  // ── Report submit ─────────────────────────────────────────────────────────
  const buildWA = (r) => {
    const name=r.client?.split(" - ")[0]||"לקוח יקר";
    const statusLine=r.poolStatus==="אחר"?`⚠️ *נדרשת תשומת לב:*\n${r.customStatusText}${r.restrictedUntil?`\nהבריכה לא זמינה עד ${fmtDate(r.restrictedUntil)}`:""}` :"✅ הבריכה מאוזנת ומוכנה לשימוש מלא";
    return `🏊 *צוות גליליאו טיפל בבריכתכם!*\n\nשלום ${name} 👋\n\n${user?.name} סיים את הטיפול המסור בבריכה שלכם היום 💙\n\n${statusLine}${r.notes?`\n\n📝 ${r.notes}`:""}\n\nתמיד כאן בשבילכם 🌊\n_צוות גליליאו_`;
  };

  const handleSubmit = async () => {
    const elNext=calcNext(elDate);
    const supplyLabel=[acid&&"חומצת מלח",phUp&&"מעלה pH",saltPkg&&`מלח ×${saltBags}`].filter(Boolean).join(", ");
    if(client&&(acid||phUp||saltPkg)){
      const newDB={...supplyDB,[client]:{acid,phUp,saltPkg,saltBags,updatedAt:fmtDate(reportDate)}};
      setSupplyDB(newDB);
      if(sheetId){const rows=Object.entries(newDB).map(([c,v])=>[c,v.acid?"כן":"לא",v.phUp?"כן":"לא",v.saltPkg?"כן":"לא",v.saltBags||0,v.updatedAt]);await sheetCall("saveSupplyDB",{rows});}
    }
    const match=tasks.find(t=>t.date===reportDate&&t.client===client&&t.operators.includes(user?.name)&&t.status!=="done");
    if(match)markDone(match.id);

    // Convert photos to base64
    let photosBase64 = [];
    if(photos.length>0){
      photosBase64 = await Promise.all(photos.map(url=>
        fetch(url).then(r=>r.blob()).then(blob=>new Promise(res=>{
          const reader=new FileReader();
          reader.onload=e=>res(e.target.result.split(",")[1]);
          reader.readAsDataURL(blob);
        }))
      ));
    }

    const report={id:Date.now(),reportDate,operator:user?.name||"",client,chlorine,ph,salt,chlora:form.chlora||0,hth:form.hth||0,elModel,elSerial,elDate,elNext:elNext||"",supplyLabel,waterLevel,clarity,fat,flow,poolStatus,customStatusText,restrictedUntil,notes,photosCount:photos.length};
    setReports(r=>[...r,report]);
    setSyncing(true);
    let saved=false;
    const adminEmail = getCompany().adminEmail||"";
    if(sheetId){
      const res=await sheetCall("saveReport",{report, photos:photosBase64, adminEmail, clientAddress:clientAddress(client), clientPhone:clientPhone(client)}).catch(()=>null);
      saved=res?.success===true;
    }
    if(!saved){setPending(p=>[...p,report]);setDismissed(false);}
    setSyncing(false);
    const phone=clientPhone(client);
    const waMsg=buildWA(report);
    const waUrl=phone?`https://wa.me/972${phone.replace(/^0/,"")}?text=${encodeURIComponent(waMsg)}`:`https://wa.me/?text=${encodeURIComponent(waMsg)}`;
    window.open(waUrl,"_blank");
    setScreen("done");
  };

  const clientSupply = (name) => supplyDB[name]||null;

  // ════════════════════════════════════════════════════════════════════════════
  // SCREEN: LOGIN
  // ════════════════════════════════════════════════════════════════════════════
  // ── Setup screen ──────────────────────────────────────────────────────────
  if (showSetup) return (
    <>
      <SetupScreen onDone={()=>{ const c=getCompany(); setCompanyName(c.name||"גליליאו"); setShowSetup(false); }} onSuperAdmin={()=>setShowSuperAdmin(true)}/>
      {showSuperAdmin&&<SuperAdminScreen onClose={()=>setShowSuperAdmin(false)}/>}
    </>
  );

  if(screen==="login") return (
    <div dir="rtl" style={{minHeight:"100vh",background:"linear-gradient(145deg,#0d47a1,#1565c0,#1976d2)",fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');*{-webkit-tap-highlight-color:transparent;box-sizing:border-box}`}</style>

      {showSuperAdmin&&<SuperAdminScreen onClose={()=>setShowSuperAdmin(false)}/>}

      <div style={{width:"100%",maxWidth:360}}>
        {/* Logo — long press 3s to return to setup */}
        <div style={{textAlign:"center",marginBottom:36}}
          onPointerDown={()=>{ logoLongPress.current = setTimeout(()=>{ haptic("success"); setShowSetup(true); }, 3000); }}
          onPointerUp={()=>clearTimeout(logoLongPress.current)}
          onPointerLeave={()=>clearTimeout(logoLongPress.current)}>
          <div style={{fontSize:60,marginBottom:12,filter:"drop-shadow(0 0 20px rgba(255,255,255,0.3))",cursor:"pointer",userSelect:"none"}}>🌊</div>
          <h1 style={{color:"#fff",fontSize:28,fontWeight:900,margin:"0 0 6px",letterSpacing:"-0.5px"}}>{companyName}</h1>
          <p style={{color:"rgba(255,255,255,0.6)",fontSize:14,margin:0}}>מערכת ניהול בריכות</p>
        </div>

        {/* Card */}
        <div style={{background:"#fff",borderRadius:24,padding:24,boxShadow:"0 20px 60px rgba(0,0,0,0.25)"}}>
          <h2 style={{fontSize:18,fontWeight:900,color:C.text,margin:"0 0 20px",textAlign:"center"}}>כניסה למערכת</h2>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:12,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>שם משתמש</label>
            <input value={loginUser} onChange={e=>setLoginUser(e.target.value)} placeholder="הכנס שם משתמש"
              style={inp} onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
          </div>
          <div style={{marginBottom:loginErr?12:20}}>
            <label style={{fontSize:12,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>סיסמה</label>
            <input type="password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} placeholder="הכנס סיסמה"
              style={inp} onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
          </div>
          {loginErr&&<div style={{background:"#ffebee",borderRadius:10,padding:"10px 14px",marginBottom:16,color:C.red,fontSize:13,fontWeight:700,textAlign:"center"}}>⚠️ {loginErr}</div>}
          <Press onClick={handleLogin}
            style={{padding:16,borderRadius:14,background:loginLoading?"#90caf9":`linear-gradient(135deg,${C.blue},${C.lightBlue})`,
              color:"#fff",fontWeight:900,fontSize:16,textAlign:"center",
              boxShadow:loginLoading?"none":"0 6px 20px rgba(21,101,192,0.4)"}}>
            {loginLoading?"⏳ מתחבר...":"כניסה →"}
          </Press>
          <p style={{textAlign:"center",fontSize:11,color:C.muted,marginTop:16,marginBottom:0}}>
            demo: admin/1234 · avi/1234
          </p>
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // SCREEN: DAILY BOARD (OPERATOR)
  // ════════════════════════════════════════════════════════════════════════════
  if(screen==="daily") {
    const dayTasks = myTasks(dailyDate);
    const done     = todayReported.filter(c=>dayTasks.some(t=>t.client===c)).length;

    return (
      <div dir="rtl" style={{minHeight:"100vh",background:C.bg,fontFamily:"'Plus Jakarta Sans',sans-serif",paddingBottom:90}}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');*{-webkit-tap-highlight-color:transparent;box-sizing:border-box}input[type=range]{-webkit-appearance:none;height:6px;border-radius:99px;background:transparent}input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:${C.blue};box-shadow:0 2px 8px rgba(21,101,192,0.4)}textarea,input,select{font-family:'Plus Jakarta Sans',sans-serif}`}</style>

        {/* Header */}
        <div style={{background:`linear-gradient(145deg,#0d47a1,${C.blue},${C.lightBlue})`,padding:"28px 20px 44px",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:-50,left:-50,width:200,height:200,borderRadius:"50%",background:"rgba(255,255,255,0.05)"}}/>
          <div style={{position:"absolute",bottom:-80,right:-40,width:260,height:260,borderRadius:"50%",background:"rgba(255,255,255,0.04)"}}/>
          <div style={{position:"relative",display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
            <div>
              <p style={{color:"rgba(255,255,255,0.65)",fontSize:12,fontWeight:600,margin:"0 0 4px"}}>{fmtDate(dailyDate)} 🌊</p>
              <h1 style={{color:"#fff",fontSize:24,fontWeight:900,margin:0,lineHeight:1.1}}>שלום, {user?.name}! {user?.icon}</h1>
              <p style={{color:"rgba(255,255,255,0.7)",fontSize:13,margin:"4px 0 0"}}>{user?.welcomeMessage}</p>
              {clientPlan.plan&&(
                <div style={{display:"flex",gap:6,marginTop:8}}>
                  <span style={{background:"rgba(255,255,255,0.2)",borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:800,color:"#fff"}}>
                    {clientPlan.plan==="PRO"?"💎 PRO":clientPlan.plan==="Basic"?"⚡ Basic":"🔬 ניסיון"}
                  </span>
                  <span style={{background:clientPlan.status==="פעיל"?"rgba(46,125,50,0.4)":clientPlan.status==="מושהה"?"rgba(198,40,40,0.4)":"rgba(230,81,0,0.4)",borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:800,color:"#fff"}}>
                    {clientPlan.status==="פעיל"?"✅ פעיל":clientPlan.status==="מושהה"?"⛔ מושהה":"🔬 ניסיון"}
                  </span>
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <div onPointerDown={()=>{logoLongPress.current=setTimeout(()=>{haptic("success");setShowSetup(true);},3000);}}
                onPointerUp={()=>clearTimeout(logoLongPress.current)}
                onPointerLeave={()=>clearTimeout(logoLongPress.current)}
                style={{fontSize:18,cursor:"pointer",userSelect:"none",padding:"4px 6px",color:"rgba(255,255,255,0.4)"}}>⚙️</div>
              <Press onClick={handleLogout}
                style={{background:"rgba(255,255,255,0.15)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:12,padding:"8px 12px",color:"rgba(255,255,255,0.8)",fontSize:12,fontWeight:700}}>
                יציאה
              </Press>
            </div>
          </div>
          {/* Stats */}
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

        {/* Floating card */}
        <div style={{margin:"-20px 16px 0",position:"relative",zIndex:10}}>
          {/* Work timer */}
          <div style={{...card({marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}),padding:"14px 18px"}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4}}>שעון עבודה</div>
              <div style={{fontSize:16,fontWeight:800,color:workStart?C.blue:C.muted}}>{workStart?`▶ פעיל מ-${workStart}`:"לא התחיל"}</div>
            </div>
            <Press onClick={workStart?handleEndWork:handleStartWork}
              style={{padding:"11px 18px",borderRadius:12,border:"none",color:"#fff",fontWeight:800,fontSize:13,
                background:workStart?`linear-gradient(135deg,#c62828,#ef5350)`:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,
                boxShadow:`0 4px 14px ${workStart?"rgba(198,40,40,0.3)":"rgba(21,101,192,0.35)"}`}}>
              {workStart?"⏹ סיום":"▶ התחלה"}
            </Press>
          </div>

          {/* Progress */}
          {dayTasks.length>0&&(
            <div style={{...card(),padding:"14px 18px",marginBottom:4}}>
              <PBar done={done} total={dayTasks.length}/>
            </div>
          )}
        </div>

        {/* Tasks */}
        <div style={{padding:"16px 16px 0"}}>
          {/* Pending banner */}
          {pending.length>0&&!dismissed&&(
            <div style={{...card({background:"#fff8e1",border:"1px solid #ffe082",marginBottom:12,display:"flex",alignItems:"center",gap:10}),padding:"12px 16px"}}>
              <span style={{fontSize:18}}>⚠️</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:800,fontSize:13,color:C.orange}}>{pending.length} דוחות ממתינים לשליחה</div>
                <div style={{fontSize:11,color:C.muted}}>שמורים מקומית — לחץ לשליחה</div>
              </div>
              <Press onClick={async()=>{
                setSyncing(true);
                let ok=true;
                for(const r of pending){
                  const res=await sheetCall("saveReport",{report:r}).catch(()=>null);
                  if(!res?.success)ok=false;
                }
                if(ok){setPending([]);showToast("✅ כל הדוחות נשלחו!");}
                setSyncing(false);
              }} style={{background:C.orange,borderRadius:99,padding:"6px 12px",color:"#fff",fontWeight:800,fontSize:12}}>
                {syncing?"...":"שלח"}
              </Press>
              <Press onClick={()=>setDismissed(true)}
                style={{color:C.muted,fontSize:18,padding:"0 4px"}}>✕</Press>
            </div>
          )}

          {/* Manual report button */}
          <Press onClick={()=>{setForm(blank());setScreen("form");haptic("medium");}}
            style={{...card({marginBottom:16,display:"flex",alignItems:"center",gap:12,border:`2px dashed ${C.lightBlue}`,background:"#f5f9ff"}),padding:"14px 18px"}}>
            <div style={{width:40,height:40,borderRadius:12,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>📝</div>
            <div>
              <div style={{fontWeight:800,fontSize:15,color:C.blue}}>+ פתח דוח חדש</div>
              <div style={{fontSize:12,color:C.muted}}>דוח ידני — בחירת לקוח חופשית</div>
            </div>
          </Press>

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <h2 style={{fontSize:12,fontWeight:800,color:C.muted,letterSpacing:"0.1em",textTransform:"uppercase",margin:0}}>משימות היום</h2>
            <input type="date" value={dailyDate} onChange={e=>setDailyDate(e.target.value)}
              style={{fontSize:12,fontWeight:700,color:C.blue,border:"none",background:"transparent",outline:"none",cursor:"pointer"}}/>
          </div>

          {dayTasks.length===0&&(
            <div style={{...card({textAlign:"center"}),padding:32}}>
              <div style={{fontSize:40,marginBottom:8}}>📭</div>
              <div style={{fontWeight:700,color:C.muted,fontSize:14}}>אין משימות לתאריך זה</div>
            </div>
          )}

          {dayTasks.map((t,i)=>{
            const done = todayReported.includes(t.client);
            const supply = clientSupply(t.client);
            const lastLog = t.changeLog?.[t.changeLog.length-1];
            const needsAck = lastLog?.needsAck && !(lastLog?.ackedBy||[]).includes(user?.name);
            const logIdx = t.changeLog?t.changeLog.length-1:-1;
            return (
              <div key={t.id} style={{...card({marginBottom:12,opacity:done?0.65:1,
                border:`2px solid ${needsAck?"#ff9800":done?"#c8e6c9":C.border}`,
                transition:"all 0.3s"})}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:900,fontSize:16,color:C.text,marginBottom:3,textDecoration:done?"line-through":"none"}}>{t.client.split(" - ")[0]}</div>
                    {clientAddress(t.client)&&<div style={{fontSize:12,color:C.muted}}>📍 {clientAddress(t.client)}</div>}
                  </div>
                  <Badge label={done?"✓ בוצע":"⏳ ממתין"} col={done?C.green:C.orange}/>
                </div>

                {/* Admin alert */}
                {needsAck&&(
                  <div style={{background:"#fff8e1",borderRadius:10,padding:"10px 12px",marginBottom:10,border:"1px solid #ffe082"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#e65100",marginBottom:4}}>🔔 {lastLog.note}</div>
                    <div style={{fontSize:10,color:"#bf6900",marginBottom:8}}>{lastLog.at} · {lastLog.by}</div>
                    <Press onClick={()=>{ackChange(t.id,logIdx);haptic("success");}}
                      style={{padding:"8px 16px",borderRadius:99,background:"#e65100",color:"#fff",fontWeight:800,fontSize:12,display:"inline-block"}}>
                      קיבלתי ✓
                    </Press>
                  </div>
                )}

                {/* Last readings */}
                {(()=>{const lr=lastReadings[t.client];if(!lr)return null;
                  return (
                    <div style={{background:"#e3f2fd",borderRadius:10,padding:"8px 12px",marginBottom:10,display:"flex",gap:12,alignItems:"center"}}>
                      <span style={{fontSize:12,fontWeight:700,color:C.blue}}>📊 מדידה אחרונה:</span>
                      <span style={{fontSize:12,fontWeight:800,color:"#1565c0"}}>Cl: {lr.chlorine}</span>
                      <span style={{fontSize:12,fontWeight:800,color:"#6a1b9a"}}>pH: {lr.ph}</span>
                      <span style={{fontSize:10,color:C.muted,marginRight:"auto"}}>{lr.date}</span>
                    </div>
                  );
                })()}

                {/* Supply */}
                {supply&&!done&&(
                  <div style={{background:"#e3f2fd",borderRadius:10,padding:"8px 12px",marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.blue,marginBottom:4}}>📦 ציוד נדרש:</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {supply.acid&&<span style={{background:C.white,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700,color:C.text,border:"1px solid "+C.border}}>🧪 חומצת מלח</span>}
                      {supply.phUp&&<span style={{background:C.white,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700,color:C.text,border:"1px solid "+C.border}}>📈 מעלה pH</span>}
                      {supply.saltPkg&&<span style={{background:C.white,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700,color:C.text,border:"1px solid "+C.border}}>🧂 מלח ×{supply.saltBags}</span>}
                    </div>
                  </div>
                )}

                {/* Follow-up for restricted pool */}
                {(()=>{
                  const lr=lastReadings[t.client];
                  const isRestricted = lr?.poolStatus==="אחר" && lr?.restrictedUntil;
                  if(!isRestricted) return null;
                  const phone = clientPhone(t.client);
                  const msg = `שלום!\nהגבלת השימוש בבריכה הסתיימה ב-${fmtDate(lr.restrictedUntil)}.\nהבריכה מוכנה לשימוש מלא 🏊\n_צוות גליליאו_`;
                  return (
                    <a href={`https://wa.me/972${phone.replace(/^0/,"")}?text=${encodeURIComponent(msg)}`}
                      target="_blank" rel="noreferrer"
                      style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",background:"#fff8e1",borderRadius:10,marginBottom:10,textDecoration:"none",border:"1px solid #ffe082"}}>
                      <span style={{fontSize:16}}>📲</span>
                      <span style={{fontSize:12,fontWeight:700,color:C.orange}}>שלח follow-up — בריכה חזרה לפעילות</span>
                    </a>
                  );
                })()}

                {/* Action buttons */}
                {!done&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8}}>
                    <Press onClick={()=>{setForm({...blank(),client:t.client,reportDate:dailyDate,clientLocked:true});setScreen("form");}}
                      style={{padding:"11px",borderRadius:12,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,
                        color:"#fff",fontWeight:800,fontSize:13,textAlign:"center",
                        boxShadow:"0 4px 14px rgba(21,101,192,0.3)"}}>
                      📝 פתח דוח
                    </Press>
                    {clientAddress(t.client)&&(
                      <a href={wazeUrl(clientAddress(t.client))} target="_blank" rel="noreferrer"
                        style={{padding:"11px 14px",borderRadius:12,background:"#e8f5e9",color:C.green,fontWeight:800,fontSize:13,textDecoration:"none",textAlign:"center",border:"2px solid #c8e6c9",display:"flex",alignItems:"center",gap:4}}>
                        🗺️
                      </a>
                    )}
                    {clientPhone(t.client)&&(
                      <a href={`tel:${clientPhone(t.client)}`}
                        style={{padding:"11px 14px",borderRadius:12,background:"#f3e5f5",color:"#6a1b9a",fontWeight:800,fontSize:13,textDecoration:"none",textAlign:"center",border:"2px solid #e1bee7",display:"flex",alignItems:"center",gap:4}}>
                        📞
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {done===dayTasks.length&&dayTasks.length>0&&(
            <div style={{...card({textAlign:"center",background:"linear-gradient(135deg,#e8f5e9,#f1f8e9)"}),padding:28,border:"2px solid #c8e6c9"}}>
              <div style={{fontSize:44,marginBottom:8}}>🎉</div>
              <div style={{fontWeight:900,fontSize:18,color:C.green,marginBottom:4}}>סיימת הכל!</div>
              <div style={{color:C.muted,fontSize:13}}>יום עבודה מוצלח!</div>
            </div>
          )}
        </div>

        {/* Bottom nav */}
        <div style={{position:"fixed",bottom:0,right:0,left:0,background:C.white,borderTop:`1px solid ${C.border}`,
          display:"flex",justifyContent:"space-around",padding:"10px 0 20px",
          boxShadow:"0 -4px 20px rgba(0,0,0,0.06)"}}>
          {[["🏠","בית"],["📋","משימות"],["📷","סרוק QR"],["💬","שיחה"]].map(([ic,lb],i)=>(
            <Press key={lb} onClick={()=>{
              if(i===2){setShowQR(true);}
              else if(i===3){setShowConv(true);setConvTarget("");}
              else setNavTab(i);
              haptic();
            }} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"4px 14px",borderRadius:12,background:navTab===i&&i<2?"#e3f2fd":"transparent"}}>
              <span style={{fontSize:22}}>{ic}</span>
              <span style={{fontSize:10,fontWeight:800,color:navTab===i&&i<2?C.blue:C.muted}}>{lb}</span>
            </Press>
          ))}
        </div>

        {/* QR Scanner */}
        {showQR&&(
          <QRScanner
            onClose={()=>setShowQR(false)}
            onResult={(scannedUrl)=>{
              setShowQR(false);
              // Try match by qrUrl first, then by client name
              const byUrl  = clients.find(c=>c.qrUrl&&scannedUrl.includes(c.qrUrl));
              const byName = clients.find(c=>scannedUrl.includes(c.name.split(" - ")[0]));
              const matched = byUrl || byName;
              // Find matching task
              const matchTask = matched && myTasks(dailyDate).find(t=>
                t.client===matched.name || t.client.includes(matched.name.split(" - ")[0])
              );
              if(matchTask){
                haptic("success");
                setForm({...blank(),client:matchTask.client,reportDate:dailyDate,clientLocked:true});
                setScreen("form");
                showToast(`✅ נפתח דוח עבור ${matchTask.client.split(" - ")[0]}`);
              } else if(matched) {
                // Client found but no task — open free report
                haptic("medium");
                setForm({...blank(),client:matched.name,reportDate:dailyDate,clientLocked:true});
                setScreen("form");
                showToast(`📝 נפתח דוח עבור ${matched.name.split(" - ")[0]}`);
              } else {
                showToast("⚠️ לקוח לא זוהה");
              }
            }}
          />
        )}

        {showConv&&(
          <BottomSheet title="💬 פתח שיחה" onClose={()=>setShowConv(false)}>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:12}}>בחר עם מי לדבר:</div>
              {allUsers.filter(u=>u.role==="admin").map(u=>(
                <a key={u.username} href={`https://wa.me/972${u.phone?.replace(/^0/,"")}?text=${encodeURIComponent(`שלום ${u.name}, כאן ${user?.name}`)}`}
                  target="_blank" rel="noreferrer"
                  style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:`1px solid ${C.border}`,textDecoration:"none"}}>
                  <span style={{fontSize:28}}>{u.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,fontSize:15,color:C.text}}>{u.name}</div>
                    <div style={{fontSize:12,color:C.muted}}>מנהל</div>
                  </div>
                  <span style={{background:"#e8f5e9",color:C.green,borderRadius:99,padding:"6px 14px",fontSize:12,fontWeight:800}}>💬 WhatsApp</span>
                </a>
              ))}
              {operatorUsers.filter(u=>u.name!==user?.name).map(u=>(
                <a key={u.username} href={`https://wa.me/972${u.phone?.replace(/^0/,"")}?text=${encodeURIComponent(`שלום ${u.name}, כאן ${user?.name}`)}`}
                  target="_blank" rel="noreferrer"
                  style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:`1px solid ${C.border}`,textDecoration:"none"}}>
                  <span style={{fontSize:28}}>{u.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,fontSize:15,color:C.text}}>{u.name}</div>
                    <div style={{fontSize:12,color:C.muted}}>מפעיל</div>
                  </div>
                  <span style={{background:"#e3f2fd",color:C.blue,borderRadius:99,padding:"6px 14px",fontSize:12,fontWeight:800}}>💬 WhatsApp</span>
                </a>
              ))}
            </div>
          </BottomSheet>
        )}

        <Toast msg={toast.msg} visible={toast.visible}/>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCREEN: REPORT FORM
  // ════════════════════════════════════════════════════════════════════════════
  if(screen==="form") return (
    <div dir="rtl" style={{minHeight:"100vh",background:C.bg,fontFamily:"'Plus Jakarta Sans',sans-serif",paddingBottom:100}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');*{-webkit-tap-highlight-color:transparent;box-sizing:border-box}input[type=range]{-webkit-appearance:none;height:8px;border-radius:99px;background:transparent}input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:32px;height:32px;border-radius:50%;background:${C.blue};box-shadow:0 2px 8px rgba(21,101,192,0.4)}select option{background:#fff}`}</style>

      {/* Header */}
      <div style={{background:`linear-gradient(145deg,#0d47a1,${C.blue},${C.lightBlue})`,padding:"24px 20px 28px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-40,left:-40,width:160,height:160,borderRadius:"50%",background:"rgba(255,255,255,0.05)"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative"}}>
          <div>
            <p style={{color:"rgba(255,255,255,0.65)",fontSize:12,fontWeight:600,margin:"0 0 4px"}}>{form.clientLocked?form.client.split(" - ")[0]:"בחר לקוח"}</p>
            <h1 style={{color:"#fff",fontSize:22,fontWeight:900,margin:0}}>📝 דוח טיפול</h1>
          </div>
          <Press onClick={()=>setScreen("daily")}
            style={{background:"rgba(255,255,255,0.15)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:12,padding:"8px 14px",color:"rgba(255,255,255,0.8)",fontSize:13,fontWeight:700}}>
            ← חזרה
          </Press>
        </div>
      </div>

      <div style={{padding:"20px 16px 0"}}>
        {/* Basic info */}
        <Sec icon="📋" title="פרטים">
          <div style={{...card(),marginBottom:12}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>תאריך</label>
                <input type="date" value={reportDate} onChange={e=>sf("reportDate",e.target.value)} style={inp}/>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>מפעיל</label>
                <div style={{...inp,color:C.blue,fontWeight:700,display:"flex",alignItems:"center",gap:6,cursor:"default"}}><span>{user?.icon}</span>{user?.name}</div>
              </div>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>לקוח</label>
              {form.clientLocked?(
                <div style={{...inp,color:C.blue,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"default"}}>
                  <span>🏊 {client}</span><span style={{fontSize:12,color:C.muted}}>🔒</span>
                </div>
              ):(
                <select value={client} onChange={e=>sf("client",e.target.value)} style={sel}>
                  <option value="">בחר לקוח...</option>
                  {clients.map(c=><option key={c.name}>{c.name}</option>)}
                </select>
              )}
              {client&&clientPhone(client)&&(
                <a href={`tel:${clientPhone(client)}`}
                  style={{display:"flex",alignItems:"center",gap:8,marginTop:8,padding:"10px 14px",background:"#e8f5e9",border:`1px solid #c8e6c9`,borderRadius:12,textDecoration:"none",color:C.green,fontSize:13,fontWeight:700}}>
                  <span>📞</span><span>{client.split(" - ")[0]}</span>
                  <span style={{color:C.muted,fontSize:12,marginRight:"auto"}}>לחץ לחיוג</span>
                </a>
              )}
            </div>
          </div>
        </Sec>

        {/* Measurements */}
        <Sec icon="📊" title="מדידות">
          <SliderField label="כלור" min={0} max={8} value={chlorine} onChange={v=>sf("chlorine",v)} unit=" ppm" warnAbove={3} optimal={1.5} large={String(user?.username||"").toLowerCase()==="or"}/>
          <SliderField label="pH"   min={5} max={9} value={ph}       onChange={v=>sf("ph",v)}       warnAbove={8} warnBelow={6} optimal={7.4} large={String(user?.username||"").toLowerCase()==="or"}/>
          <SliderField label="מלח"  min={0} max={6} value={salt}     onChange={v=>sf("salt",v)}     unit=" g/L" optimal={3.5} large={String(user?.username||"").toLowerCase()==="or"}/>
          <SliderField label="טבליות כלור (TAB)" min={0} max={5} step={0.25} value={form.chlora??0} onChange={v=>sf("chlora",v)} unit="" large={String(user?.username||"").toLowerCase()==="or"}/>
          <SliderField label="HTH"  min={0} max={5} step={0.5}  value={form.hth??0}    onChange={v=>sf("hth",v)}    unit=" cups" large={String(user?.username||"").toLowerCase()==="or"}/>
        </Sec>

        {/* Electrode */}
        <Sec icon="⚡" title="אלקטרודה">
          <div style={{...card()}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>דגם</label>
                <input value={elModel} onChange={e=>sf("elModel",e.target.value)} style={inp} placeholder="דגם המכשיר"/>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>סריאלי</label>
                <input value={elSerial} onChange={e=>sf("elSerial",e.target.value)} style={inp} placeholder="מספר סריאלי"/>
              </div>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>תאריך ניקיון אחרון</label>
              <input type="date" value={elDate} onChange={e=>sf("elDate",e.target.value)} style={inp}/>
            </div>
            {calcNext(elDate)&&(()=>{
              const d=Math.ceil((new Date(calcNext(elDate))-new Date())/864e5);
              const bg=d<0?"#ffebee":d<14?"#fff8e1":"#e8f5e9";
              const col=d<0?C.red:d<14?C.orange:C.green;
              const txt=d<0?`⚠️ ניקיון באיחור ${Math.abs(d)} ימים`:d<14?`⏰ ניקיון הבא בעוד ${d} ימים (${fmtDate(calcNext(elDate))})`:`✅ ניקיון הבא: ${fmtDate(calcNext(elDate))} (${d} ימים)`;
              return <div style={{marginTop:10,background:bg,borderRadius:10,padding:"8px 12px",fontSize:12,fontWeight:700,color:col}}>{txt}</div>;
            })()}
          </div>
        </Sec>

        {/* Status checks */}
        <Sec icon="🔍" title="בדיקות מצב">
          <ToggleField label="💧 גובה מים"  value={waterLevel} onChange={v=>sf("waterLevel",v)}/>
          <ToggleField label="🔵 צלילות"    value={clarity}    onChange={v=>sf("clarity",v)}/>
          <ToggleField label="🧴 פס שומן"   value={fat}        onChange={v=>sf("fat",v)}/>
          <ToggleField label="🌀 זרימה"     value={flow}       onChange={v=>sf("flow",v)}/>
        </Sec>

        {/* Pool status */}
        <Sec icon="🏊" title="מצב בריכה">
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:poolStatus==="אחר"?12:0}}>
            {["מאוזנת","אחר"].map(opt=>(
              <Press key={opt} onClick={()=>{sf("poolStatus",opt);haptic();}}
                style={{padding:14,borderRadius:14,textAlign:"center",fontWeight:800,fontSize:14,
                  background:poolStatus===opt?(opt==="מאוזנת"?"#e8f5e9":"#ffebee"):C.white,
                  color:poolStatus===opt?(opt==="מאוזנת"?C.green:C.red):C.muted,
                  border:`2px solid ${poolStatus===opt?(opt==="מאוזנת"?"#c8e6c9":"#ffcdd2"):C.border}`,
                  boxShadow:"0 2px 8px rgba(0,0,0,0.04)",transition:"all 0.2s"}}>
                {opt==="מאוזנת"?"✅ מאוזנת":"⚠️ אחר"}
              </Press>
            ))}
          </div>
          {poolStatus==="אחר"&&(
            <div style={{...card()}}>
              <textarea value={customStatusText} onChange={e=>sf("customStatusText",e.target.value)} rows={2}
                placeholder="תאר את הבעיה..." style={{...inp,resize:"none",marginBottom:10}}/>
              <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>הגבלת שימוש עד</label>
              <input type="date" value={restrictedUntil} onChange={e=>sf("restrictedUntil",e.target.value)} style={inp}/>
            </div>
          )}
        </Sec>

        {/* Supplies */}
        <Sec icon="📦" title="ציוד לטיפול הבא">
          <div style={{...card()}}>
            <div style={{background:"#e3f2fd",borderRadius:10,padding:"8px 12px",marginBottom:12,display:"flex",gap:6,alignItems:"center"}}>
              <span>🔒</span><span style={{fontSize:11,fontWeight:700,color:C.blue}}>פנימי בלבד — לא נשלח ללקוח</span>
            </div>
            {[["acid",acid,"🧪 חומצת מלח"],["phUp",phUp,"📈 מעלה pH"],["saltPkg",saltPkg,"🧂 שקי מלח"]].map(([k,v,lbl])=>(
              <Press key={k} onClick={()=>{sf(k,!v);haptic();}}
                style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:`1px solid ${C.border}`}}>
                <div style={{width:26,height:26,borderRadius:8,border:`2px solid ${v?C.blue:C.border}`,
                  background:v?C.blue:C.white,display:"flex",alignItems:"center",justifyContent:"center",
                  transition:"all 0.2s",flexShrink:0}}>
                  {v&&<span style={{color:"#fff",fontSize:14}}>✓</span>}
                </div>
                <span style={{fontSize:14,fontWeight:700,color:C.text}}>{lbl}</span>
              </Press>
            ))}
            {saltPkg&&(
              <div style={{paddingTop:10,display:"flex",alignItems:"center",gap:10}}>
                <label style={{fontSize:13,fontWeight:700,color:C.text}}>כמות שקים:</label>
                {[1,2,3,4,5].map(n=>(
                  <Press key={n} onClick={()=>sf("saltBags",n)}
                    style={{width:34,height:34,borderRadius:99,background:saltBags===n?C.blue:C.border,
                      color:saltBags===n?"#fff":C.muted,fontWeight:800,fontSize:13,textAlign:"center",
                      display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {n}
                  </Press>
                ))}
              </div>
            )}
          </div>
        </Sec>

        {/* Photos */}
        <Sec icon="📷" title="תמונות">
          <div style={{...card()}}>
            <input type="file" ref={fileRef} accept="image/*" multiple style={{display:"none"}} onChange={e=>{const files=Array.from(e.target.files).map(f=>URL.createObjectURL(f));sf("photos",[...photos,...files]);}}/>
            {photos.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
                {photos.map((p,i)=>(<img key={i} src={p} alt="" style={{width:"100%",aspectRatio:"1",objectFit:"cover",borderRadius:10,border:`2px solid ${C.border}`}}/>))}
              </div>
            )}
            <Press onClick={()=>fileRef.current?.click()}
              style={{padding:"12px",borderRadius:12,border:`2px dashed ${C.lightBlue}`,background:"#f5f9ff",color:C.blue,fontWeight:700,fontSize:13,textAlign:"center"}}>
              {photos.length>0?`+ הוסף עוד תמונות (${photos.length} נבחרו)`:"📸 הוסף תמונות"}
            </Press>
          </div>
        </Sec>

        {/* Notes */}
        <Sec icon="📝" title="הערות ללקוח">
          <textarea value={notes} onChange={e=>sf("notes",e.target.value)} rows={3}
            placeholder="הערה קצרה שתישלח בוואטסאפ..."
            style={{...inp,resize:"none",minHeight:80}}/>
        </Sec>

        {/* Pending banner */}
        {pending.length>0&&(
          <div style={{...card({background:"#fff8e1",border:`1px solid #ffe082`}),marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:13,fontWeight:700,color:C.orange}}>⚠️ {pending.length} דוחות ממתינים לשליחה</span>
            <Press onClick={async()=>{setSyncing(true);let ok=true;for(const r of pending){const res=await sheetCall("saveReport",{report:r}).catch(()=>null);if(!res?.success)ok=false;}if(ok){setPending([]);showToast("✅ כל הדוחות נשלחו!");}setSyncing(false);}}
              style={{background:C.orange,borderRadius:99,padding:"6px 14px",color:"#fff",fontWeight:800,fontSize:12}}>
              {syncing?"...":"שלח הכל"}
            </Press>
          </div>
        )}

        {/* Submit */}
        <Press onClick={handleSubmit} disabled={!client||syncing}
          style={{padding:"18px",borderRadius:16,background:syncing||!client?"#90caf9":`linear-gradient(135deg,${C.blue},${C.lightBlue})`,
            color:"#fff",fontWeight:900,fontSize:17,textAlign:"center",
            boxShadow:syncing||!client?"none":"0 8px 24px rgba(21,101,192,0.4)",marginBottom:8}}>
          {syncing?"⏳ שומר...":"שלח דוח ⚡"}
        </Press>
        <Press onClick={()=>setScreen("daily")}
          style={{padding:"14px",borderRadius:14,border:`2px solid ${C.border}`,background:C.white,color:C.muted,fontWeight:700,fontSize:14,textAlign:"center"}}>
          ← ביטול
        </Press>
      </div>
      <Toast msg={toast.msg} visible={toast.visible}/>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // SCREEN: DONE
  // ════════════════════════════════════════════════════════════════════════════
  if(screen==="done") {
    const last = reports[reports.length-1];
    return (
      <div dir="rtl" style={{minHeight:"100vh",background:`linear-gradient(145deg,#e3f2fd,${C.bg})`,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center"}}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');*{-webkit-tap-highlight-color:transparent;box-sizing:border-box}@keyframes pop{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
        <div style={{fontSize:72,marginBottom:16,animation:"pop 0.5s cubic-bezier(0.34,1.56,0.64,1)"}}>✅</div>
        <h1 style={{fontSize:26,fontWeight:900,color:C.text,margin:"0 0 8px"}}>הדוח נשלח!</h1>
        <p style={{color:C.lightBlue,fontSize:15,margin:"0 0 28px",fontWeight:600}}>הלקוח יקבל הודעת WhatsApp עכשיו 💬</p>

        {last&&(
          <div style={{...card({width:"100%",maxWidth:340,marginBottom:20,textAlign:"right"})}}>
            <div style={{fontSize:12,fontWeight:800,color:C.muted,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:12}}>סיכום הדוח</div>
            {[["לקוח",last.client.split(" - ")[0]],["כלור",`${last.chlorine} ppm`],["pH",last.ph],["מלח",`${last.salt} g/L`],["מצב",last.poolStatus==="מאוזנת"?"✅ מאוזנת":"⚠️ "+last.customStatusText]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                <span style={{color:C.muted,fontSize:13,fontWeight:600}}>{k}</span>
                <span style={{color:C.text,fontSize:13,fontWeight:800}}>{v}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,width:"100%",maxWidth:340}}>
          <Press onClick={()=>{setForm(blank());setScreen("form");haptic();}}
            style={{padding:14,borderRadius:14,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:800,fontSize:14,textAlign:"center",boxShadow:"0 6px 20px rgba(21,101,192,0.35)"}}>
            + דוח חדש
          </Press>
          <Press onClick={()=>setScreen("daily")}
            style={{padding:14,borderRadius:14,border:`2px solid ${C.border}`,background:C.white,color:C.blue,fontWeight:800,fontSize:14,textAlign:"center"}}>
            🏠 לוח יומי
          </Press>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCREEN: ADMIN
  // ════════════════════════════════════════════════════════════════════════════
  if(screen==="admin") {
    const progressData = operatorUsers.map(op=>{
      const asgn = tasks.filter(t=>t.date===dailyDate&&t.operators.includes(op.name));
      const done  = todayReported.filter(c=>asgn.some(t=>t.client===c)).length;
      return {op,total:asgn.length,done};
    });
    const dayTasks = tasks.filter(t=>t.date===taskDate);

    return (
      <div dir="rtl" style={{minHeight:"100vh",background:C.bg,fontFamily:"'Plus Jakarta Sans',sans-serif",paddingBottom:30}}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');*{-webkit-tap-highlight-color:transparent;box-sizing:border-box}select option{background:#fff}`}</style>

        {/* Header */}
        <div style={{background:`linear-gradient(145deg,#0d47a1,${C.blue},${C.lightBlue})`,padding:"28px 20px 24px",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:-50,left:-50,width:200,height:200,borderRadius:"50%",background:"rgba(255,255,255,0.05)"}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative"}}>
            <div>
              <p style={{color:"rgba(255,255,255,0.65)",fontSize:12,fontWeight:600,margin:"0 0 4px"}}>פאנל ניהול 👔</p>
              <h1 style={{color:"#fff",fontSize:22,fontWeight:900,margin:0}}>שלום, {user?.name}</h1>
              {clientPlan.plan&&(
                <div style={{display:"flex",gap:6,marginTop:6}}>
                  <span style={{background:"rgba(255,255,255,0.2)",borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:800,color:"#fff"}}>
                    {clientPlan.plan==="PRO"?"💎 PRO":clientPlan.plan==="Basic"?"⚡ Basic":"🔬 ניסיון"}
                  </span>
                  <span style={{background:clientPlan.status==="פעיל"?"rgba(46,125,50,0.4)":"rgba(198,40,40,0.4)",borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:800,color:"#fff"}}>
                    {clientPlan.status==="פעיל"?"✅ פעיל":"⛔ "+clientPlan.status}
                  </span>
                </div>
              )}
            </div>
            <Press onClick={handleLogout}
              style={{background:"rgba(255,255,255,0.15)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:12,padding:"8px 12px",color:"rgba(255,255,255,0.8)",fontSize:12,fontWeight:700}}>
              יציאה
            </Press>
          </div>
        </div>

        {/* Tabs */}
        <div style={{background:C.white,padding:"8px 12px",borderBottom:`1px solid ${C.border}`,display:"flex",gap:6,overflowX:"auto",position:"sticky",top:0,zIndex:50,boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
          {[["daily","📋 חלוקת עבודה"],["progress","📊 התקדמות"],["hours","⏱️ שעות"],["qr","📷 QR"],["clients","👥 לקוחות"],["reports","📄 דוחות"],["users","👤 משתמשים"]].map(([t,lbl])=>(
            <Press key={t} onClick={()=>{setAdminTab(t);haptic();}}
              style={{padding:"9px 14px",borderRadius:99,border:"none",fontSize:12,fontWeight:800,flexShrink:0,
                background:adminTab===t?`linear-gradient(135deg,${C.blue},${C.lightBlue})`:"#f0f4f8",
                color:adminTab===t?"#fff":C.muted,
                boxShadow:adminTab===t?"0 4px 12px rgba(21,101,192,0.3)":"none",transition:"all 0.2s"}}>
              {lbl}
            </Press>
          ))}
        </div>

        <div style={{padding:"20px 16px 0"}}>

          {/* ── TAB: daily ── */}
          {adminTab==="daily"&&(
            <div>
              <div style={{...card({marginBottom:16})}}>
                <h3 style={{fontSize:14,fontWeight:800,color:C.text,margin:"0 0 14px"}}>{editTaskId?"✏️ עריכת משימה":"➕ הוספת משימה"}</h3>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div>
                    <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>תאריך</label>
                    <input type="date" value={taskDate} onChange={e=>setTaskDate(e.target.value)} style={inp}/>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>לקוח</label>
                    <select value={taskClient} onChange={e=>setTaskClient(e.target.value)} style={sel}>
                      <option value="">בחר לקוח...</option>
                      {clients.map(c=><option key={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{marginBottom:10}}>
                  <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>מפעילים</label>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                    {taskOps.map(op=>(
                      <span key={op} style={{background:C.blue,color:"#fff",borderRadius:99,padding:"5px 12px",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>
                        {op}
                        <span onClick={()=>setTaskOps(taskOps.filter(o=>o!==op))} style={{cursor:"pointer",opacity:0.7,fontSize:14}}>✕</span>
                      </span>
                    ))}
                  </div>
                  <select defaultValue="" onChange={e=>{if(e.target.value&&!taskOps.includes(e.target.value)){setTaskOps([...taskOps,e.target.value]);e.target.value="";}}} style={sel}>
                    <option value="">+ הוסף מפעיל</option>
                    {opNames.filter(n=>!taskOps.includes(n)).map(n=><option key={n}>{n}</option>)}
                  </select>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>הערה (תופיע אצל המפעיל)</label>
                  <input value={taskNote} onChange={e=>setTaskNote(e.target.value)} placeholder="הערה אופציונלית..." style={inp}/>
                </div>
                <Press onClick={()=>saveTask({date:taskDate,client:taskClient,operators:taskOps})}
                  disabled={!taskClient||!taskOps.length}
                  style={{padding:"13px",borderRadius:14,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:800,fontSize:14,textAlign:"center",boxShadow:`0 4px 14px rgba(21,101,192,0.3)`,opacity:!taskClient||!taskOps.length?0.5:1}}>
                  {editTaskId?"💾 שמור שינויים":"➕ הוסף משימה"}
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
                        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                          {t.operators.map(op=>(
                            <span key={op} style={{background:"#e3f2fd",color:C.blue,borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:700,display:"inline-flex",alignItems:"center",gap:4}}>
                              {op}
                              <span onClick={()=>removeOp(t.id,op)} style={{cursor:"pointer",opacity:0.7,fontSize:12}}>✕</span>
                            </span>
                          ))}
                        </div>
                      </div>
                      <Badge label={t.status==="done"?"✓ בוצע":"ממתין"} col={t.status==="done"?C.green:C.orange}/>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <select defaultValue="" onChange={e=>{if(e.target.value){addOp(t.id,e.target.value);e.target.value="";}}} style={{...sel,flex:1,fontSize:12,padding:"7px 10px"}}>
                        <option value="">+ הוסף מפעיל</option>
                        {opNames.filter(n=>!t.operators.includes(n)).map(n=><option key={n}>{n}</option>)}
                      </select>
                      <Press onClick={()=>{setEditTaskId(t.id);setTaskClient(t.client);setTaskOps(t.operators);setTaskDate(t.date);window.scrollTo(0,0);}}
                        style={{padding:"7px 14px",borderRadius:10,background:"#e3f2fd",color:C.blue,fontSize:12,fontWeight:700}}>✏️</Press>
                      <Press onClick={async()=>{
                if(!window.confirm("למחוק?"))return;
                // הוסף לוג מחיקה לכל שאר המשימות של אותו לקוח שיום
                const n=tasks.filter(x=>x.id!==t.id);
                setTasks(n);
                if(sheetId)await sheetCall("saveTasks",{tasks:n});
                showToast("🗑️ משימה נמחקה");
              }}
                        style={{padding:"7px 14px",borderRadius:10,background:"#ffebee",color:C.red,fontSize:12,fontWeight:700}}>🗑️</Press>
                    </div>
                    {lastLog&&(
                      <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`,fontSize:11,color:C.muted}}>
                        🕐 {lastLog.at} — {lastLog.note}
                        {lastLog.needsAck&&(
                          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}}>
                            {t.operators.map(op=>{
                              const acked=(lastLog.ackedBy||[]).includes(op);
                              return <span key={op} style={{background:acked?"#e8f5e9":"#fff3e0",color:acked?C.green:C.orange,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700}}>{acked?"✓":"⏳"} {op}</span>;
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── TAB: progress ── */}
          {adminTab==="progress"&&(
            <div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                <label style={{fontSize:12,fontWeight:700,color:C.muted}}>תאריך:</label>
                <input type="date" value={dailyDate} onChange={e=>setDailyDate(e.target.value)} style={{...inp,maxWidth:160,color:C.blue,border:`1px solid ${C.lightBlue}`,fontWeight:700}}/>
              </div>
              {progressData.map(({op,total,done})=>(
                <div key={op.name} style={{...card({marginBottom:12})}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:total?14:0}}>
                    <span style={{fontSize:28}}>{op.icon}</span>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:800,fontSize:15,color:C.text}}>{op.name}</div>
                      <div style={{color:C.muted,fontSize:11,marginTop:2}}>{total===0?"אין משימות היום":`${done} הושלמו · ${total-done} נותרו`}</div>
                    </div>
                    <Badge label={`${done}/${total}`} col={done===total&&total>0?C.green:C.blue}/>
                  </div>
                  {total>0&&<PBar done={done} total={total}/>}
                  {tasks.filter(t=>t.date===dailyDate&&t.operators.includes(op.name)).map(t=>(
                    <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderTop:`1px solid ${C.border}`,marginTop:8}}>
                      <span style={{color:C.muted,fontSize:13}}>{t.client.split(" - ")[0]}</span>
                      <Badge label={t.status==="done"?"✓ בוצע":"ממתין"} col={t.status==="done"?C.green:C.orange}/>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* ── TAB: QR ── */}
          {adminTab==="qr"&&(
            <div>
              <div style={{...card({marginBottom:16,background:"#e3f2fd",border:`1px solid #90caf9`}),padding:"12px 16px",display:"flex",gap:10,alignItems:"flex-start"}}>
                <span style={{fontSize:20}}>ℹ️</span>
                <div style={{fontSize:12,color:C.blue,fontWeight:600,lineHeight:1.6}}>
                  לכל לקוח יש QR ייחודי. המפעיל סורק אותו → הדוח נפתח אוטומטית.
                  הדפס את ה-QR ושים אצל הלקוח.
                </div>
              </div>
              {clients.map(c=>(
                <div key={c.name} style={{...card({marginBottom:10}),display:"flex",alignItems:"center",gap:14}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,fontSize:15,color:C.text,marginBottom:2}}>{c.name.split(" - ")[0]}</div>
                    <div style={{fontSize:12,color:C.muted}}>📍 {c.address||c.name.split(" - ")[1]||""}</div>
                  </div>
                  <Press onClick={()=>setShowQRCode(showQRCode===c.name?null:c.name)}
                    style={{padding:"8px 14px",borderRadius:10,background:showQRCode===c.name?"#e3f2fd":C.border,color:showQRCode===c.name?C.blue:C.muted,fontWeight:700,fontSize:12}}>
                    {showQRCode===c.name?"סגור":"📷 QR"}
                  </Press>
                </div>
              ))}
              {showQRCode&&(()=>{
                const encoded = encodeURIComponent(showQRCode.split(" - ")[0]);
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}&bgcolor=ffffff&color=1565c0&margin=10`;
                return (
                  <div style={{...card({border:`2px solid ${C.lightBlue}`,textAlign:"center"}),padding:20,marginBottom:16}}>
                    <div style={{fontWeight:800,fontSize:15,color:C.text,marginBottom:12}}>{showQRCode.split(" - ")[0]}</div>
                    <img src={qrUrl} alt="QR" style={{width:180,height:180,borderRadius:12,marginBottom:12}}/>
                    <div style={{fontSize:11,color:C.muted,marginBottom:12}}>סרוק עם האפליקציה לפתיחת דוח</div>
                    <a href={qrUrl} download={`qr-${showQRCode.split(" - ")[0]}.png`} target="_blank" rel="noreferrer">
                      <Press style={{padding:"10px 20px",borderRadius:10,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:700,fontSize:13,display:"inline-block"}}>
                        ⬇️ הורד QR
                      </Press>
                    </a>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── TAB: hours ── */}
          {adminTab==="hours"&&(
            <div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                <label style={{fontSize:12,fontWeight:700,color:C.muted}}>תאריך:</label>
                <input type="date" value={dailyDate} onChange={e=>setDailyDate(e.target.value)} style={{...inp,maxWidth:160,color:C.blue,border:`1px solid ${C.lightBlue}`,fontWeight:700}}/>
              </div>
              {operatorUsers.map(op=>{
                const logs=workLogs.filter(l=>l.operator===op.name&&l.date===dailyDate);
                const tot=logs.reduce((a,l)=>{const[h,m]=l.total.split(":").map(Number);return a+h*60+m;},0);
                const totStr=tot>0?`${Math.floor(tot/60)}:${String(tot%60).padStart(2,"0")}`:"—";
                return (
                  <div key={op.name} style={{...card({marginBottom:12})}}>
                    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:logs.length?10:0}}>
                      <span style={{fontSize:28}}>{op.icon}</span>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:800,fontSize:15,color:C.text}}>{op.name}</div>
                        <div style={{color:C.muted,fontSize:11,marginTop:2}}>{logs.length===0?"לא נרשמה עבודה":`${logs.length} סשנים · סה"כ ${totStr} שעות`}</div>
                      </div>
                      {tot>0&&<Badge label={`⏱️ ${totStr}`} col={C.blue}/>}
                    </div>
                    {logs.map((l,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderTop:`1px solid ${C.border}`}}>
                        <span style={{color:C.muted,fontSize:12}}>🕐 {l.start} — {l.end}</span>
                        <span style={{color:C.blue,fontSize:12,fontWeight:800}}>{l.total} שע׳</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── TAB: clients ── */}
          {adminTab==="clients"&&(
            <div>
              {/* Add new client */}
              <div style={{...card({marginBottom:16})}}>
                <h3 style={{fontSize:14,fontWeight:800,color:C.text,margin:"0 0 14px"}}>➕ לקוח חדש</h3>
                <div style={{marginBottom:10}}>
                  <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>שם לקוח *</label>
                  <input value={newClient.name} onChange={e=>setNewClient(c=>({...c,name:e.target.value}))}
                    placeholder="משפחת כהן" style={inp}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div>
                    <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>טלפון</label>
                    <input value={newClient.phone} onChange={e=>setNewClient(c=>({...c,phone:e.target.value}))}
                      placeholder="05XXXXXXXX" style={inp} type="tel"/>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>כתובת</label>
                    <input value={newClient.address} onChange={e=>setNewClient(c=>({...c,address:e.target.value}))}
                      placeholder="רחוב הים 1" style={inp}/>
                  </div>
                </div>
                <Press onClick={async()=>{
                  if(!newClient.name.trim()){showToast("⚠️ נא להזין שם לקוח");return;}
                  const updated=[...clients,{name:newClient.name.trim(),phone:newClient.phone.trim(),address:newClient.address.trim(),qrUrl:""}];
                  setClients(updated);
                  setNewClient({name:"",phone:"",address:""});
                  if(sheetId) await sheetCall("saveClients",{clients:updated});
                  showToast("✅ לקוח נוסף");
                  haptic("success");
                }} style={{padding:"13px",borderRadius:14,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:800,fontSize:14,textAlign:"center",boxShadow:`0 4px 14px rgba(21,101,192,0.3)`}}>
                  ➕ הוסף לקוח
                </Press>
              </div>

              {/* Clients list */}
              <h3 style={{fontSize:12,fontWeight:800,color:C.muted,letterSpacing:"0.1em",textTransform:"uppercase",margin:"0 0 12px"}}>
                לקוחות קיימים — {clients.length}
              </h3>
              {clients.map((c,i)=>(
                <div key={i} style={{...card({marginBottom:10,display:"flex",alignItems:"center",gap:12})}}>
                  <div style={{width:40,height:40,borderRadius:12,background:"#e3f2fd",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🏊</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,fontSize:14,color:C.text}}>{c.name.split(" - ")[0]}</div>
                    <div style={{fontSize:12,color:C.muted,marginTop:2}}>{c.phone} · {c.address}</div>
                  </div>
                  {c.phone&&<a href={`tel:${c.phone}`} style={{color:C.blue,fontSize:18,textDecoration:"none"}}>📞</a>}
                </div>
              ))}
            </div>
          )}

          {/* ── TAB: reports ── */}
          {adminTab==="reports"&&(
            <div>
              {/* Filters */}
              <div style={{...card({marginBottom:14})}}>
                <div style={{marginBottom:10}}>
                  <input value={reportFilter} onChange={e=>setReportFilter(e.target.value)}
                    placeholder="🔍 חפש לפי לקוח או מפעיל..."
                    style={{...inp,marginBottom:0}}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div>
                    <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>תאריך</label>
                    <input type="date" value={reportDateFilter} onChange={e=>setReportDateFilter(e.target.value)} style={inp}/>
                  </div>
                  <div style={{display:"flex",alignItems:"flex-end"}}>
                    <Press onClick={async()=>{
                      showToast("⏳ טוען דוחות...");
                      const res = await sheetCall("getReports");
                      if(res?.reports?.length){
                        setSheetReports(res.reports);
                        showToast(`✅ ${res.reports.length} דוחות נטענו`);
                      } else {
                        showToast("⚠️ לא נמצאו דוחות");
                      }
                    }} style={{width:"100%",padding:"12px",borderRadius:14,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:800,fontSize:13,textAlign:"center"}}>
                      🔄 טען מגיליון
                    </Press>
                  </div>
                </div>
              </div>

              {/* Reports list */}
              {(()=>{
                const allReports = [...sheetReports, ...reports];
                // Deduplicate by id
                const seen = new Set();
                const unique = allReports.filter(r=>{ if(seen.has(r.id))return false; seen.add(r.id); return true; });
                const filtered = unique.reverse().filter(r=>{
                  const matchText = !reportFilter || r.client?.includes(reportFilter) || r.operator?.includes(reportFilter);
                  const matchDate = !reportDateFilter || r.reportDate===reportDateFilter;
                  return matchText && matchDate;
                });
                if(filtered.length===0) return (
                  <div style={{...card({textAlign:"center"}),padding:32,color:C.muted,fontSize:14}}>
                    אין דוחות — לחץ "טען מגיליון"
                  </div>
                );
                return filtered.map((r,i)=>(
                  <div key={i} style={{...card({marginBottom:12})}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                      <div>
                        <div style={{fontWeight:800,fontSize:15,color:C.text}}>{r.client?.split(" - ")[0]}</div>
                        <div style={{fontSize:12,color:C.muted,marginTop:2}}>👤 {r.operator} · 📅 {fmtDate(r.reportDate)}</div>
                      </div>
                      <Badge label={r.poolStatus==="מאוזנת"?"✅ מאוזנת":"⚠️ אחר"} col={r.poolStatus==="מאוזנת"?C.green:C.orange}/>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:6}}>
                      {[["כלור",`${r.chlorine} ppm`,"#e3f2fd","#1565c0"],["pH",r.ph,"#f3e5f5","#6a1b9a"],["מלח",`${r.salt} g/L`,"#e8f5e9","#1b5e20"]].map(([k,v,bg,col])=>(
                        <div key={k} style={{background:bg,borderRadius:10,padding:"8px",textAlign:"center"}}>
                          <div style={{fontSize:10,fontWeight:700,color:"#90a4ae",marginBottom:2}}>{k}</div>
                          <div style={{fontSize:14,fontWeight:900,color:col}}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {(r.chlora>0||r.hth>0)&&(
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:6}}>
                        {r.chlora>0&&<div style={{background:"#fff3e0",borderRadius:10,padding:"8px",textAlign:"center"}}><div style={{fontSize:10,fontWeight:700,color:"#90a4ae",marginBottom:2}}>כלרה</div><div style={{fontSize:14,fontWeight:900,color:"#e65100"}}>{r.chlora} kg</div></div>}
                        {r.hth>0&&<div style={{background:"#e8eaf6",borderRadius:10,padding:"8px",textAlign:"center"}}><div style={{fontSize:10,fontWeight:700,color:"#90a4ae",marginBottom:2}}>HTH</div><div style={{fontSize:14,fontWeight:900,color:"#283593"}}>{r.hth} kg</div></div>}
                      </div>
                    )}
                    {r.notes&&<div style={{background:"#f5f9ff",borderRadius:10,padding:"8px 12px",fontSize:12,color:C.muted}}>📝 {r.notes}</div>}
                    {r.supplyLabel&&<div style={{marginTop:8,fontSize:11,color:C.blue,fontWeight:700}}>📦 {r.supplyLabel}</div>}
                  </div>
                ));
              })()}
            </div>
          )}

          {/* ── TAB: users ── */}
          {adminTab==="users"&&(
            <div>
              {allUsers.map(u=>(
                <div key={u.username} style={{...card({marginBottom:10,display:"flex",alignItems:"center",gap:12})}}>
                  <span style={{fontSize:30}}>{u.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,fontSize:15,color:C.text}}>{u.name}</div>
                    <div style={{color:C.muted,fontSize:12,marginTop:2}}>{u.username} · {u.phone}</div>
                    <div style={{color:"#b0bec5",fontSize:11,marginTop:2}}>"{u.welcomeMessage}"</div>
                  </div>
                  <Badge label={u.role==="admin"?"מנהל":"מפעיל"} col={u.role==="admin"?C.orange:C.blue}/>
                </div>
              ))}

              {/* Report issue button */}
              <div style={{marginTop:24}}>
                <Press onClick={()=>setShowReportIssue(true)}
                  style={{...card({background:"#fff8e1",border:"1px solid #ffe082",display:"flex",alignItems:"center",gap:12}),padding:"14px 16px"}}>
                  <span style={{fontSize:22}}>🔧</span>
                  <div>
                    <div style={{fontWeight:800,fontSize:14,color:C.orange}}>דווח על תקלה</div>
                    <div style={{fontSize:12,color:C.muted}}>שלח דיווח ישירות למפתח</div>
                  </div>
                </Press>
              </div>
            </div>
          )}
        </div>

        {/* Report Issue Modal */}
        {showReportIssue&&(
          <BottomSheet title="🔧 דווח על תקלה" onClose={()=>setShowReportIssue(false)}>
            <div>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:12,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>תיאור הבעיה</label>
                <textarea value={issueDesc} onChange={e=>setIssueDesc(e.target.value)}
                  rows={4} placeholder="תאר את הבעיה בפירוט..."
                  style={{...inp,resize:"none"}}/>
              </div>
              <div style={{marginBottom:16}}>
                <label style={{fontSize:12,fontWeight:700,color:C.muted,display:"block",marginBottom:8}}>עדיפות</label>
                <div style={{display:"flex",gap:8}}>
                  {["רגיל","דחוף","קריטי"].map(p=>(
                    <Press key={p} onClick={()=>setIssuePriority(p)}
                      style={{flex:1,padding:"10px",borderRadius:10,textAlign:"center",fontSize:13,fontWeight:800,
                        background:issuePriority===p?(p==="קריטי"?C.red:p==="דחוף"?C.orange:C.blue):"#f0f4f8",
                        color:issuePriority===p?"#fff":C.muted}}>
                      {p}
                    </Press>
                  ))}
                </div>
              </div>
              <Press onClick={async()=>{
                if(!issueDesc.trim()){showToast("⚠️ נא להזין תיאור");return;}
                setSyncing(true);
                const company=getCompany();
                await mgmtCall("saveMgmtIssue",{issue:[
                  Date.now(), company.name||"לא ידוע", todayStr(),
                  issueDesc.trim(), issuePriority, "פתוח", "", ""
                ]});
                setSyncing(false);
                setIssueDesc("");
                setIssuePriority("רגיל");
                setShowReportIssue(false);
                showToast("✅ הדיווח נשלח!");
                haptic("success");
              }} style={{padding:"14px",borderRadius:14,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:900,fontSize:15,textAlign:"center",boxShadow:"0 4px 14px rgba(21,101,192,0.3)"}}>
                {syncing?"⏳ שולח...":"שלח דיווח →"}
              </Press>
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
