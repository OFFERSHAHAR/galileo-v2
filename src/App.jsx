import { Fragment, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

const DEMO_USERS = [];
const DEMO_CLIENTS = [];
const WA_TEMPLATE_STORAGE_KEY = "galileo_whatsapp_template";
const WA_ACID_SUPPLY_MESSAGE_STORAGE_KEY = "galileo_whatsapp_acid_supply_message";
const WA_PH_UP_SUPPLY_MESSAGE_STORAGE_KEY = "galileo_whatsapp_ph_up_supply_message";
const WA_SALT_SUPPLY_MESSAGE_STORAGE_KEY = "galileo_whatsapp_salt_supply_message";
const WA_TABLET_REMINDER_STORAGE_KEY = "galileo_whatsapp_tablet_reminder_message";
const WA_WATER_LEVEL_NOTICE_STORAGE_KEY = "galileo_whatsapp_water_level_notice_message";
const WA_DISABLED_CLIENTS_STORAGE_KEY = "galileo_whatsapp_disabled_clients";
const PENDING_OPERATOR_ISSUES_STORAGE_KEY = "galileo_pending_operator_issues";
const CHLORINE_TABLET_REMINDER_DAYS = 3;
const DEFAULT_CHLORINE_TABLET_REMINDER_MESSAGE = "יש להוסיף טבלית כלור :)";
const DEFAULT_WATER_LEVEL_NOTICE_MESSAGE = "⚠️ לתשומת ליבך - יש למלא מים עד לגובה הרצוי";
const DEFAULT_WA_MESSAGE_TEMPLATE = `*טיפול בריכה הושלם!*

שלום {clientName},

{operatorName} סיים את הטיפול בבריכה שלכם היום.

{reportDetails}

תמיד כאן בשבילכם,
_צוות {company}_`;

const normalizeWaMessageTemplate = (value) => String(value || "").trim() || DEFAULT_WA_MESSAGE_TEMPLATE;
const DEFAULT_ACID_SUPPLY_MESSAGE = "בטיפול הבא תסופק חומצת מלח לאיזון מי הבריכה.";
const DEFAULT_PH_UP_SUPPLY_MESSAGE = "בטיפול הבא יסופק מעלה pH לאיזון מי הבריכה.";
const DEFAULT_SALT_SUPPLY_MESSAGE = "בטיפול הבא יסופקו שקי מלח לבריכה בכמות {כמות}.";
const normalizeAcidSupplyMessage = (value) => String(value || "").trim() || DEFAULT_ACID_SUPPLY_MESSAGE;
const normalizePhUpSupplyMessage = (value) => String(value || "").trim() || DEFAULT_PH_UP_SUPPLY_MESSAGE;
const normalizeSaltSupplyMessage = (value) => String(value || "").trim() || DEFAULT_SALT_SUPPLY_MESSAGE;
const normalizeChlorineReminderMessage = (value) => String(value || "").trim() || DEFAULT_CHLORINE_TABLET_REMINDER_MESSAGE;
const normalizeWaterLevelNoticeMessage = (value) => String(value || "").trim() || DEFAULT_WATER_LEVEL_NOTICE_MESSAGE;
const DEFAULT_NEXT_SUPPLY_PRICES = {"חומצת מלח":100,"סודה אש":120};
const NEXT_SUPPLY_PRICE_COLUMN = "מחיר_פר_חומר_לטיפול_הבא";
const normalizeNextSupplyPrices = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {...DEFAULT_NEXT_SUPPLY_PRICES, ...Object.fromEntries(Object.entries(value).map(([k,v])=>[k, Number(v) || 0]))};
  }
  const text = String(value || "").trim();
  if (!text) return {...DEFAULT_NEXT_SUPPLY_PRICES};
  try { return normalizeNextSupplyPrices(JSON.parse(text)); } catch {}
  const prices = {...DEFAULT_NEXT_SUPPLY_PRICES};
  text.split(/[;\n,]+/).map(x=>x.trim()).filter(Boolean).forEach(part => {
    const m = part.match(/^(.+?)\s*[:=\-]\s*(\d+(?:\.\d+)?)/);
    if (m) prices[m[1].trim()] = Number(m[2]) || 0;
  });
  return prices;
};
const serializeNextSupplyPrices = (value) => JSON.stringify(normalizeNextSupplyPrices(value));
const nextSupplyPriceSummary = (supplyLabel, prices) => {
  const label = String(supplyLabel || "");
  const map = normalizeNextSupplyPrices(prices);
  const rows = [];
  if (label.includes("חומצת")) rows.push(`חומצת מלח - ${map["חומצת מלח"] || 0} שח`);
  if (label.includes("מעלה") || label.includes("סודה")) rows.push(`סודה אש - ${map["סודה אש"] || 0} שח`);
  return rows.join("\n");
};
const supplyDeliveryMessage = (supplyLabel, messages = {}) => {
  const label = String(supplyLabel || "");
  const parts = label.split(",").map(part => part.trim()).filter(Boolean);
  const rows = [];
  if (parts.some(part => part.includes("חומצת"))) rows.push(normalizeAcidSupplyMessage(messages.acid));
  if (parts.some(part => part.includes("מעלה") || part.includes("סודה"))) rows.push(normalizePhUpSupplyMessage(messages.phUp));
  const saltPart = parts.find(part => /^(?:שקי\s+)?מלח(?:\s*[×xX]\s*\d+)?$/.test(part));
  if (saltPart) {
    const saltMatch = saltPart.match(/[×xX]\s*(\d+)/);
    const quantity = String(saltMatch?.[1] || "").trim();
    rows.push(normalizeSaltSupplyMessage(messages.salt).replaceAll("{כמות}", quantity || "שנבחרה בדוח"));
  }
  return rows.join("\n");
};
const renderWaMessageTemplate = (template, values) => {
  const source = normalizeWaMessageTemplate(template);
  let text = Object.entries(values).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value ?? "")),
    source
  );
  if (!source.includes("{reportDetails}") && values.reportDetails) {
    text = `${text.trim()}\n\n${values.reportDetails}`;
  }
  return text.trim();
};

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
const localDayKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const todayStr = () => localDayKey();
const makeReportId = () => globalThis.crypto?.randomUUID?.() ||
  `report-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const isIOSDevice = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const touchMac = platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || touchMac;
};
const IPhoneComfortLayer = () => (
  <style>{`
    html, body, #root { overscroll-behavior-y: contain; }
    .galileo-ios-vh { min-height: 100vh; }
    .galileo-ios-sheet { height: 100vh; }
    @supports (-webkit-touch-callout: none) {
      @supports (min-height: 100dvh) {
        .galileo-ios-vh { min-height: 100dvh !important; }
        .galileo-ios-sheet { height: 100dvh !important; }
      }
    }
  `}</style>
);
const LOGIN_DAY_KEY = "galileo_login_day";
function getStoredUserForToday() {
  try {
    const saved = localStorage.getItem("galileo_user");
    if (!saved) return null;
    const loginDay = localStorage.getItem(LOGIN_DAY_KEY);
    const today = localDayKey();
    if (loginDay && loginDay !== today) {
      localStorage.removeItem("galileo_user");
      localStorage.removeItem(LOGIN_DAY_KEY);
      return null;
    }
    if (!loginDay) localStorage.setItem(LOGIN_DAY_KEY, today);
    return JSON.parse(saved || "null");
  } catch {
    return null;
  }
}
const fmtDate = s => {
  if(!s) return "";
  if(s instanceof Date && !isNaN(s)) return `${s.getDate()}/${s.getMonth()+1}/${s.getFullYear()}`;
  const raw = String(s).trim();
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(iso) return `${Number(iso[3])}/${Number(iso[2])}/${iso[1]}`;
  const monthOnly = raw.match(/^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+([A-Za-z]+)\s+(\d{1,2})$/i);
  if(monthOnly) {
    const monthIndex = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(monthOnly[1].slice(0,3).toLowerCase());
    if(monthIndex >= 0) return `${Number(monthOnly[2])}/${monthIndex+1}/${new Date().getFullYear()}`;
  }
  const parsed = new Date(raw);
  if(!isNaN(parsed)) return `${parsed.getDate()}/${parsed.getMonth()+1}/${parsed.getFullYear()}`;
  return raw;
};
const calcNext = (s,days=90) => { if(!s)return null; const d=new Date(s); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); };
const nowStr = () => new Date().toLocaleString("he-IL");
const isoAfterDays = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
};
const daysUntilIso = (value) => {
  const due = new Date(value || isoAfterDays(CHLORINE_TABLET_REMINDER_DAYS));
  if (Number.isNaN(due.getTime())) return CHLORINE_TABLET_REMINDER_DAYS;
  const today = new Date();
  today.setHours(0,0,0,0);
  const dueDay = new Date(due);
  dueDay.setHours(0,0,0,0);
  return Math.max(0, Math.ceil((dueDay - today) / 86400000));
};
const reminderCounterText = (days) => {
  if (days <= 0) return "נשלח היום";
  if (days === 1) return "נשלח בעוד יום";
  return `נשלח בעוד ${days} ימים`;
};

function getCompany() {
  try { return JSON.parse(localStorage.getItem("galileo_company")||"{}"); } catch { return {}; }
}

const DEFAULT_THEME_COLOR = "#1565c0";
const DEFAULT_APP_NAME = "גליליאו";
const DEFAULT_ICON_192 = "/icons/galileo-icon-192.png";
const DEFAULT_ICON_512 = "/icons/galileo-icon-512.png";
const DEFAULT_APPLE_ICON = "/icons/galileo-icon-180.png";
const DEFAULT_MASKABLE_ICON = "/icons/galileo-icon-maskable-512.png";
const DEFAULT_ICON_VERSION = "20260515c";
const versionIconUrl = (src) => `${src}?v=${DEFAULT_ICON_VERSION}`;

function defaultIconDataUrl(bg = DEFAULT_THEME_COLOR) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${bg}"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="220">🌊</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function setOrUpdateMeta(name, content) {
  if (typeof document === "undefined" || !content) return;
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setOrUpdateLink(rel, href, extra = {}) {
  if (typeof document === "undefined" || !href) return;
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  Object.entries(extra).forEach(([key, value]) => {
    if (value) el.setAttribute(key, value);
  });
}

function iconType(src) {
  const s = String(src || "").toLowerCase();
  if (s.includes("svg")) return "image/svg+xml";
  if (s.includes(".webp")) return "image/webp";
  if (s.includes(".jpg") || s.includes(".jpeg")) return "image/jpeg";
  return "image/png";
}

function normalizeBranding(data = {}) {
  const name = String(data.appName || data.name || DEFAULT_APP_NAME).trim() || DEFAULT_APP_NAME;
  const logoUrl = String(data.logoUrl || DEFAULT_APPLE_ICON).trim();
  const rawIcon192Url = String(data.icon192Url || "").trim();
  const rawIcon512Url = String(data.icon512Url || "").trim();
  const rawAppleIconUrl = String(data.appleIconUrl || "").trim();
  const rawMaskableIconUrl = String(data.maskableIconUrl || data.iconMaskableUrl || "").trim();
  const icon192Url = rawIcon192Url && rawIcon192Url !== logoUrl ? rawIcon192Url : versionIconUrl(DEFAULT_ICON_192);
  const icon512Url = rawIcon512Url && rawIcon512Url !== logoUrl ? rawIcon512Url : versionIconUrl(DEFAULT_ICON_512);
  const appleIconUrl = rawAppleIconUrl && rawAppleIconUrl !== logoUrl ? rawAppleIconUrl : versionIconUrl(DEFAULT_APPLE_ICON);
  const maskableIconUrl = rawMaskableIconUrl && rawMaskableIconUrl !== logoUrl ? rawMaskableIconUrl : versionIconUrl(DEFAULT_MASKABLE_ICON);
  const themeColor = String(data.themeColor || DEFAULT_THEME_COLOR).trim() || DEFAULT_THEME_COLOR;
  const backgroundColor = String(data.backgroundColor || themeColor).trim() || themeColor;
  return {
    name,
    shortName: String(data.shortName || name).trim() || name,
    logoUrl,
    icon192Url,
    icon512Url,
    appleIconUrl,
    maskableIconUrl,
    themeColor,
    backgroundColor,
  };
}

function applyTenantBranding(data = getCompany()) {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const brand = normalizeBranding(data);
  const fallbackIcon = defaultIconDataUrl(brand.themeColor);
  const icon192 = brand.icon192Url || brand.icon512Url || fallbackIcon;
  const icon512 = brand.icon512Url || brand.icon192Url || fallbackIcon;
  const appleIcon = brand.appleIconUrl || icon512 || icon192 || fallbackIcon;
  const maskableIcon = brand.maskableIconUrl || icon512 || fallbackIcon;

  document.title = `${brand.name} - ניהול בריכות`;
  setOrUpdateMeta("theme-color", brand.themeColor);
  setOrUpdateMeta("apple-mobile-web-app-title", brand.shortName);
  setOrUpdateLink("icon", appleIcon, { type: iconType(appleIcon) });
  setOrUpdateLink("apple-touch-icon", appleIcon, { sizes: "180x180" });

  const manifest = {
    name: `${brand.name} - ניהול בריכות`,
    short_name: brand.shortName,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: brand.backgroundColor,
    theme_color: brand.themeColor,
    lang: "he",
    dir: "rtl",
    icons: [
      { src: icon192, sizes: "192x192", type: iconType(icon192), purpose: "any" },
      { src: icon512, sizes: "512x512", type: iconType(icon512), purpose: "any" },
      { src: maskableIcon, sizes: "512x512", type: iconType(maskableIcon), purpose: "maskable" },
    ],
  };

  if (window.galileoManifestUrl) URL.revokeObjectURL(window.galileoManifestUrl);
  window.galileoManifestUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }));
  setOrUpdateLink("manifest", window.galileoManifestUrl);
}

function saveCompany(data) {
  localStorage.setItem("galileo_company", JSON.stringify(data));
  applyTenantBranding(data);
}

const FIXED_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzKKk_M0noXnKrniCsBDO4dAUWPDkpK8YH0QhhpJQfSaCyfqmAQlLJOb-sN5atSj5nj/exec";
const APP_VERSION = "v2.6 · 08.05.2026";
const APP_BUILD_ID = "20260731-first-report-self-whatsapp-1";
const APP_VERSION_URL = "/version.json";
const APP_ACCEPTED_BUILD_KEY = "galileo_accepted_app_build";
const APP_REFRESH_PENDING_KEY = "galileo_refresh_accept_pending";
const DEFAULT_SUPER_PASS = "1892346";
const SUPER_PASS_VERSION = "20260615-1";
const SUPER_PASS_VERSION_KEY = "galileo_super_pass_version";
const OFFICIAL_INTERFACE_OWNER = "אור";

const normalizeBuildId = (value) => String(value || "").trim();
function getAcceptedAppBuildId() {
  try { return normalizeBuildId(localStorage.getItem(APP_ACCEPTED_BUILD_KEY)); } catch { return ""; }
}
function markCurrentAppBuildAccepted() {
  try { localStorage.setItem(APP_ACCEPTED_BUILD_KEY, APP_BUILD_ID); } catch {}
}
function consumePendingRefreshAcceptance() {
  try {
    if (localStorage.getItem(APP_REFRESH_PENDING_KEY) === "1") {
      localStorage.removeItem(APP_REFRESH_PENDING_KEY);
      markCurrentAppBuildAccepted();
      return true;
    }
  } catch {}
  return false;
}
async function fetchLatestAppBuildId() {
  const res = await fetch(`${APP_VERSION_URL}?ts=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("version_fetch_failed");
  const data = await res.json();
  return normalizeBuildId(data.buildId || data.version || data.appBuildId);
}
async function hardRefreshApp() {
  try { localStorage.setItem(APP_REFRESH_PENDING_KEY, "1"); } catch {}
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => String(k || "").includes("galileo")).map(k => caches.delete(k)));
    }
  } catch {}
  try {
    if (navigator.serviceWorker?.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(reg => reg.update().catch(() => null)));
    }
  } catch {}
  const url = new URL(window.location.href);
  url.searchParams.set("appRefresh", String(Date.now()));
  window.location.replace(url.toString());
}

function getSuperPass() {
  if (localStorage.getItem(SUPER_PASS_VERSION_KEY) !== SUPER_PASS_VERSION) {
    localStorage.setItem("galileo_super_pass", DEFAULT_SUPER_PASS);
    localStorage.setItem(SUPER_PASS_VERSION_KEY, SUPER_PASS_VERSION);
    return DEFAULT_SUPER_PASS;
  }
  return localStorage.getItem("galileo_super_pass") || DEFAULT_SUPER_PASS;
}
function setSuperPass(p) {
  localStorage.setItem("galileo_super_pass", p);
  localStorage.setItem(SUPER_PASS_VERSION_KEY, SUPER_PASS_VERSION);
}
const MGMT_SHEET_ID = "17jNBWSAkW17zfz4o2gY3wOsERa3_NAgSZ3b9HPkNspk";
const SUPER_MESSAGE_TARGET = { username: "or", name: "אור מוסה" };
const SUPER_MESSAGE_TARGET_PASSWORD = "1892346";

function isSuperMessageTargetUser(user) {
  const username = String(user?.username || "").trim().toLowerCase();
  const password = String(user?.password || "").trim();
  return username === SUPER_MESSAGE_TARGET.username && password === SUPER_MESSAGE_TARGET_PASSWORD;
}

function isSuperMessageForTarget(msg) {
  const to = String(msg?.to || "").trim().toLowerCase();
  return to === SUPER_MESSAGE_TARGET.username;
}

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
function getConfiguredSheetId() {
  const c = getCompany();
  return String(c.sheetId || localStorage.getItem("galileo_sheet_id") || "").trim();
}
const sheetReadRequests = new Map();
const SHEET_READ_ACTIONS = new Set([
  "getBootstrapData","getOperatorRefreshData","getTasks","getUsers","getAdminOrders",
  "getOperatorRefreshVersion",
  "getSubOperatorShares","getSubOperatorApprovals","getPendingSubReports","getLastReadings",
  "getClientSettings","getReports","getReportStorageStatus",
  "getClients","getOperatorIssues","getTreatmentCounts","getOperatorDoneAlerts"
]);
async function sheetCall(action, payload={}) {
  const execute = async () => {
    const sheetId = getConfiguredSheetId();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const r = await fetch(getScriptUrl(),{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({action, sheetId, ...payload}),signal:controller.signal});
      return await r.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
  if (!SHEET_READ_ACTIONS.has(action)) return execute();
  const key = `${getScriptUrl()}:${getConfiguredSheetId()}:${action}:${JSON.stringify(payload || {})}`;
  if (sheetReadRequests.has(key)) return sheetReadRequests.get(key);
  const request = execute().finally(() => sheetReadRequests.delete(key));
  sheetReadRequests.set(key, request);
  return request;
}

const PENDING_REPORT_DB_NAME = "galileo-sync-db";
const PENDING_REPORT_DB_VERSION = 1;
const PENDING_REPORT_STORE = "pending-reports";
const PENDING_REPORT_SYNC_TAG = "galileo-pending-reports";

function pendingReportStorageId(item = {}) {
  const fixedId = String(item?.pendingStorageId || item?.queueId || "").trim();
  if (fixedId) return fixedId;
  const report = item?.report || item || {};
  const id = String(report.id || "").trim();
  if (id) return id;
  return [report.reportDate, report.operator, report.clientId || report.client]
    .map(value => String(value || "").trim().toLowerCase())
    .join("|");
}

function pendingReportLegacyPayloadFingerprintValue(item) {
  try {
    const wrapped = item?.report ? item : { report:item || {} };
    const report = {...(wrapped.report || {})};
    delete report.id;
    return JSON.stringify({
      report,
      supplyUpdate:wrapped.supplyUpdate || null,
      deliveryDecision:wrapped.deliveryDecision || null,
      updateOriginal:wrapped.updateOriginal || null,
      sendWhatsAppOnSave:wrapped.sendWhatsAppOnSave
    });
  } catch {
    return "";
  }
}

function pendingReportPayloadFingerprintValue(item) {
  const queueRevision = String(item?.queueRevision || "").trim();
  return queueRevision
    ? `revision:${queueRevision}`
    : pendingReportLegacyPayloadFingerprintValue(item);
}

function pendingQueueRevisionHash(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function ensurePendingReportQueueVersion(item, fallbackUpdatedAt = 0) {
  const wrapped = item?.report ? item : { report:item || {} };
  const pendingStorageId = String(wrapped.pendingStorageId || pendingReportStorageId(wrapped) || "").trim();
  const queueRevision = String(wrapped.queueRevision || "").trim() ||
    `legacy-${pendingQueueRevisionHash(`${pendingStorageId}|${pendingReportLegacyPayloadFingerprintValue(wrapped)}`)}`;
  const queueUpdatedAt = Number(wrapped.queueUpdatedAt || fallbackUpdatedAt || 0) || Date.now();
  return {...wrapped, pendingStorageId, queueRevision, queueUpdatedAt};
}

function openPendingReportDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb_unavailable"));
      return;
    }
    const request = indexedDB.open(PENDING_REPORT_DB_NAME, PENDING_REPORT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PENDING_REPORT_STORE)) {
        db.createObjectStore(PENDING_REPORT_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexeddb_open_failed"));
  });
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexeddb_request_failed"));
  });
}

async function loadPendingReportsFromIndexedDB() {
  const db = await openPendingReportDB();
  try {
    const transaction = db.transaction(PENDING_REPORT_STORE, "readonly");
    const records = await idbRequest(transaction.objectStore(PENDING_REPORT_STORE).getAll());
    return records
      .map(record => record?.item ? ensurePendingReportQueueVersion(record.item, record.updatedAt) : null)
      .filter(Boolean);
  } finally {
    db.close();
  }
}

function makePendingReportRecord(item, previous) {
  const company = getCompany();
  const previousItem = previous?.item;
  const wrappedItem = item?.report ? item : { report:item };
  const wrappedPrevious = previousItem?.report ? previousItem : null;
  const legacyMigration = !!wrappedPrevious &&
    !wrappedPrevious.queueRevision &&
    !!wrappedItem.queueRevision &&
    pendingReportLegacyPayloadFingerprintValue(wrappedPrevious) ===
      pendingReportLegacyPayloadFingerprintValue(wrappedItem);
  const sameReportPayload = !wrappedPrevious ||
    legacyMigration ||
    pendingReportPayloadFingerprintValue(wrappedPrevious) === pendingReportPayloadFingerprintValue(wrappedItem);
  const mergedItem = wrappedItem.replacePendingState
    ? {...wrappedItem, replacePendingState:false}
    : wrappedPrevious && sameReportPayload
    ? {
        ...wrappedPrevious,
        ...wrappedItem,
        report:wrappedItem.report || wrappedPrevious.report,
        savedToSheet:!!(wrappedPrevious.savedToSheet || wrappedItem.savedToSheet),
        whatsappSent:!!(wrappedPrevious.whatsappSent || wrappedItem.whatsappSent),
        deliveryDecision:wrappedPrevious.deliveryDecision || wrappedItem.deliveryDecision
      }
    : wrappedPrevious
    ? wrappedPrevious
    : item;
  return {
    id:pendingReportStorageId(item),
    item:mergedItem,
    scriptUrl:getScriptUrl(),
    sheetId:company.sheetId || localStorage.getItem("galileo_sheet_id") || "",
    updatedAt:Date.now()
  };
}

async function upsertPendingReportInIndexedDB(item) {
  const id = pendingReportStorageId(item);
  if (!id) return;
  const db = await openPendingReportDB();
  try {
    const transaction = db.transaction(PENDING_REPORT_STORE, "readwrite");
    const store = transaction.objectStore(PENDING_REPORT_STORE);
    const request = store.get(id);
    request.onsuccess = () => store.put(makePendingReportRecord(item, request.result));
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("indexeddb_write_failed"));
      transaction.onabort = () => reject(transaction.error || new Error("indexeddb_write_aborted"));
    });
  } finally {
    db.close();
  }
}

async function deletePendingReportFromIndexedDBIfUnchanged(item) {
  const id = pendingReportStorageId(item);
  if (!id) return true;
  const db = await openPendingReportDB();
  let deleted = false;
  try {
    const transaction = db.transaction(PENDING_REPORT_STORE, "readwrite");
    const store = transaction.objectStore(PENDING_REPORT_STORE);
    const request = store.get(id);
    request.onsuccess = () => {
      const current = request.result;
      if (!current) {
        deleted = true;
        return;
      }
      if (pendingReportPayloadFingerprintValue(current.item) !== pendingReportPayloadFingerprintValue(item)) return;
      store.delete(id);
      deleted = true;
    };
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("indexeddb_delete_failed"));
      transaction.onabort = () => reject(transaction.error || new Error("indexeddb_delete_aborted"));
    });
    return deleted;
  } finally {
    db.close();
  }
}

async function persistPendingReportsToIndexedDB(items = []) {
  const db = await openPendingReportDB();
  try {
    const transaction = db.transaction(PENDING_REPORT_STORE, "readwrite");
    const store = transaction.objectStore(PENDING_REPORT_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const existing = Array.isArray(request.result) ? request.result : [];
      const existingById = new Map(existing.map(record => [record.id, record]));
      items.forEach(item => {
        const id = pendingReportStorageId(item);
        if (!id) return;
        store.put(makePendingReportRecord(item, existingById.get(id)));
      });
    };
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("indexeddb_write_failed"));
      transaction.onabort = () => reject(transaction.error || new Error("indexeddb_write_aborted"));
    });
  } finally {
    db.close();
  }
}

async function requestPendingReportBackgroundSync() {
  if (!("serviceWorker" in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    if (registration.sync?.register) {
      await registration.sync.register(PENDING_REPORT_SYNC_TAG);
      return true;
    }
    return false;
  } catch (error) {
    console.warn("Pending report background sync registration failed", error);
    return false;
  }
}

const USAGE_SESSION_KEY = "galileo_usage_session_id";

function getUsageSessionId() {
  try {
    let id = sessionStorage.getItem(USAGE_SESSION_KEY);
    if (!id) {
      id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(USAGE_SESSION_KEY, id);
    }
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function getUsageUser() {
  try {
    return JSON.parse(localStorage.getItem("galileo_user") || "null") || {};
  } catch {
    return {};
  }
}

function cleanUsageMetadata(metadata = {}) {
  const blocked = new Set(["password","phone","email","message","notes","note","client","address","contact","photos","photo","image","gatecode","customstatustext"]);
  return Object.fromEntries(Object.entries(metadata || {}).filter(([key, value]) => {
    const cleanKey = String(key || "").replace(/[_\s-]/g, "").toLowerCase();
    return !blocked.has(cleanKey) && typeof value !== "function";
  }).map(([key, value]) => {
    const text = typeof value === "object" ? JSON.stringify(value || {}) : String(value ?? "");
    return [key, text.slice(0, 300)];
  }));
}

function trackUsageEvent(eventName, metadata = {}) {
  try {
    if (!eventName) return;
    const usageUser = getUsageUser();
    sheetCall("trackUsageEvent", {
      event: {
        timestamp: new Date().toISOString(),
        sessionId: getUsageSessionId(),
        userId: usageUser.username || usageUser.name || "",
        role: usageUser.role || "",
        screen: metadata.screen || "",
        event: eventName,
        target: metadata.target || "",
        metadata: cleanUsageMetadata(metadata),
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        appVersion: APP_VERSION
      }
    }).catch(() => null);
  } catch {}
}

function getOneSignalInstance() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.galileoOneSignalDisabled) return Promise.resolve(null);
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 7000);
    window.OneSignalDeferred.push(async function(OneSignal) {
      try {
        if (window.galileoOneSignalInitPromise) {
          await window.galileoOneSignalInitPromise;
        }
        clearTimeout(timer);
        resolve(OneSignal);
      } catch (e) {
        console.warn("Push init failed:", e);
        clearTimeout(timer);
        resolve(null);
      }
    });
  });
}

async function connectPushUser(username, prompt=false) {
  const externalId = String(username || "").trim().toLowerCase();
  if (!externalId) return { success:false, error:"missing_user" };
  const OneSignal = await getOneSignalInstance();
  if (!OneSignal) return { success:false, error:"sdk_unavailable" };
  try {
    if (typeof OneSignal.login === "function") await OneSignal.login(externalId);
    if (prompt && OneSignal.Slidedown?.promptPush) {
      await OneSignal.Slidedown.promptPush({ force: true });
    }
    if (prompt && OneSignal.Notifications?.requestPermission) {
      const permission = await OneSignal.Notifications.requestPermission();
      if (permission === false) return { success:false, error:"permission_denied" };
    }
    if (OneSignal.User?.PushSubscription?.optIn) {
      await OneSignal.User.PushSubscription.optIn();
    }
    for (let i = 0; i < 24; i++) {
      const activeNow = !!OneSignal.User?.PushSubscription?.optedIn && !!OneSignal.User?.PushSubscription?.id;
      if (activeNow) break;
      await new Promise(resolve => setTimeout(resolve, 450));
      if (typeof OneSignal.login === "function") await OneSignal.login(externalId);
      if (OneSignal.User?.PushSubscription?.optIn) await OneSignal.User.PushSubscription.optIn();
    }
    const active = !!OneSignal.User?.PushSubscription?.optedIn && !!OneSignal.User?.PushSubscription?.id;
    if (typeof OneSignal.login === "function") await OneSignal.login(externalId);
    let testSent = true;
    let testResponse = null;
    if (prompt && active) {
      testResponse = await sendAppNotificationToUserDetailed(
        "בדיקת התראות",
        "ההתראות חוברו בהצלחה",
        externalId
      ).catch(e => ({ success:false, error:String(e?.message || e) }));
      testSent = !!(testResponse?.success || testResponse?.sent || Number(testResponse?.recipients || 0) > 0);
    }
    return {
      success: prompt ? (active && testSent) : (active || OneSignal.Notifications?.permission === true),
      externalId,
      permission: OneSignal.Notifications?.permission,
      subscriptionId: OneSignal.User?.PushSubscription?.id || "",
      token: OneSignal.User?.PushSubscription?.token || "",
      testSent,
      testResponse,
      optedIn: !!OneSignal.User?.PushSubscription?.optedIn,
    };
  } catch (e) {
    console.warn("Push user connect failed:", e);
    return { success:false, error:String(e?.message || e) };
  }
}

async function sendAppNotificationToUser(title, message, username) {
  const externalUserId = String(username || "").trim().toLowerCase();
  if (!externalUserId) return false;
  const res = await sheetCall("sendAppNotificationToUser", { externalUserId, title, message });
  return !!(res?.success || res?.sent || Number(res?.recipients || 0) > 0);
}

async function sendAppNotificationToUserDetailed(title, message, username) {
  const externalUserId = String(username || "").trim().toLowerCase();
  if (!externalUserId) return { success:false, error:"missing_external_user_id" };
  const res = await sheetCall("sendAppNotificationToUser", { externalUserId, title, message });
  return res || { success:false, error:"script_no_response" };
}

const normalizeWhatsAppPhone = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("5")) return `972${digits}`;
  if (digits.length >= 10) return digits;
  return "";
};

const haptic = (t="light") => navigator.vibrate?.({light:30,medium:50,success:[30,50,30]}[t]||30);

function Press({children,onClick,style={},disabled=false,tag="div"}) {
  const [p,setP] = useState(false);
  const [flash,setFlash] = useState(false);
  const Tag = tag;
  const handleClick = (e) => {
    if (disabled) return;
    setFlash(true);
    setTimeout(()=>setFlash(false), 420);
    onClick?.(e);
  };
  return (
    <Tag onPointerDown={()=>{if(!disabled){setP(true);haptic();}}} onPointerUp={()=>setP(false)}
      onPointerLeave={()=>setP(false)} onClick={disabled?undefined:handleClick}
      style={{...style,position:style.position||"relative",transform:p?"scale(0.96)":"scale(1)",transition:"transform 0.12s cubic-bezier(0.34,1.56,0.64,1), filter 0.18s ease",filter:p?"brightness(0.98)":"none",cursor:disabled?"not-allowed":"pointer",userSelect:"none",WebkitTapHighlightColor:"transparent"}}>
      {flash&&<span style={{position:"absolute",top:6,left:6,width:7,height:7,borderRadius:99,background:"rgba(34,197,94,0.86)",boxShadow:"0 0 0 4px rgba(34,197,94,0.14)",pointerEvents:"none"}}/>}
      {children}
    </Tag>
  );
}

function Toast({msg,visible}) {
  return (
    <div style={{position:"fixed",bottom:"calc(96px + env(safe-area-inset-bottom, 0px))",right:"50%",transform:`translateX(50%) translateY(${visible?0:16}px)`,background:"#0d47a1",color:"#fff",borderRadius:99,padding:"10px 22px",fontSize:13,fontWeight:700,zIndex:999,opacity:visible?1:0,transition:"all 0.35s cubic-bezier(0.34,1.56,0.64,1)",pointerEvents:"none",boxShadow:"0 8px 24px rgba(13,71,161,0.4)",whiteSpace:"nowrap"}}>
      {msg}
    </div>
  );
}

const extractFirstUrl = (value) => {
  const match = String(value || "").match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0].replace(/[),.]+$/, "") : "";
};

const mediaUrlFromUser = (userData = {}) => {
  const preferred = ["welcomeImage","welcomeVideo","welcomeLink","welcomeMedia","welcomeInstagram","imageUrl","videoUrl","linkUrl","mediaUrl","url"];
  const entries = Object.entries(userData || {});
  const candidates = [
    ...preferred.map(key => [key, userData[key]]),
    ...entries.filter(([key]) => /welcome|image|video|link|media|instagram/i.test(String(key || ""))),
  ];
  for (const [key, value] of candidates) {
    const url = extractFirstUrl(value);
    if (url) return { url, source: key };
  }
  return null;
};

const youtubeEmbedUrl = (url) => {
  const s = String(url || "");
  const watch = s.match(/[?&]v=([^&]+)/);
  const short = s.match(/youtu\.be\/([^?&/]+)/);
  const embed = s.match(/youtube\.com\/embed\/([^?&/]+)/);
  const id = watch?.[1] || short?.[1] || embed?.[1];
  return id ? `https://www.youtube.com/embed/${id}` : "";
};

const drivePreviewUrl = (url) => {
  const id = String(url || "").match(/drive\.google\.com\/file\/d\/([^/]+)/)?.[1];
  return id ? `https://drive.google.com/file/d/${id}/preview` : "";
};

const instagramEmbedUrl = (url) => {
  const clean = String(url || "").split("?")[0].replace(/\/+$/, "");
  if (!/instagram\.com\/(p|reel|tv)\//i.test(clean)) return "";
  return `${clean}/embed`;
};

const classifyWelcomeMedia = (item) => {
  if (!item?.url) return null;
  const url = item.url;
  const clean = url.split("?")[0].toLowerCase();
  const yt = youtubeEmbedUrl(url);
  const drive = drivePreviewUrl(url);
  const instagram = instagramEmbedUrl(url);
  const vimeo = url.match(/vimeo\.com\/(\d+)/i)?.[1];
  if (yt) return {...item, type:"iframe", embedUrl:yt};
  if (drive) return {...item, type:"iframe", embedUrl:drive};
  if (instagram) return {...item, type:"iframe", embedUrl:instagram};
  if (vimeo) return {...item, type:"iframe", embedUrl:`https://player.vimeo.com/video/${vimeo}`};
  if (/\.(mp4|webm|ogg|m4v|mov)$/i.test(clean)) return {...item, type:"video"};
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(clean)) return {...item, type:"image"};
  return {...item, type:"link"};
};

function WelcomeMediaModal({media,onClose}) {
  if (!media) return null;
  const title = media.type === "video" || media.type === "iframe" ? "וידאו / עדכון" : media.type === "image" ? "תמונה / עדכון" : "קישור / עדכון";
  return (
    <div dir="rtl" style={{position:"fixed",inset:0,zIndex:1400,background:"rgba(15,23,42,0.38)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(10px)"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:420,maxHeight:"88vh",overflowY:"auto",background:"rgba(255,255,255,0.82)",backdropFilter:"blur(22px)",WebkitBackdropFilter:"blur(22px)",borderRadius:26,boxShadow:"0 28px 90px rgba(15,23,42,0.20), 0 1px 0 rgba(255,255,255,0.86) inset",border:"1px solid rgba(148,163,184,0.24)",padding:14}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:10}}>
          <div style={{fontSize:15,fontWeight:900,color:C.text}}>{title}</div>
          <Press onClick={onClose} style={{width:34,height:34,borderRadius:12,background:"rgba(241,245,249,0.84)",color:C.muted,fontWeight:900,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</Press>
        </div>
        {media.type === "image" && <img src={media.url} alt="" style={{width:"100%",maxHeight:"64vh",objectFit:"contain",borderRadius:14,background:"#f5f9ff",border:`1px solid ${C.border}`}}/>}
        {media.type === "video" && <video src={media.url} controls playsInline style={{width:"100%",maxHeight:"64vh",borderRadius:14,background:"#000"}}/>}
        {media.type === "iframe" && <iframe src={media.embedUrl} title="welcome-media" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen style={{width:"100%",aspectRatio:"16 / 9",border:0,borderRadius:14,background:"#000"}}/>}
        {media.type === "link" && (
          <div style={{background:"rgba(255,255,255,0.66)",border:`1px solid ${C.border}`,borderRadius:18,padding:16}}>
            <div style={{fontSize:13,fontWeight:800,color:C.text,marginBottom:10,wordBreak:"break-word"}}>{media.url}</div>
            <a href={media.url} target="_blank" rel="noreferrer" style={{display:"block",textAlign:"center",padding:"12px 16px",borderRadius:16,background:"linear-gradient(135deg,#2563eb,#7c3aed)",color:"#fff",fontWeight:900,fontSize:14,textDecoration:"none",boxShadow:"0 14px 32px rgba(79,70,229,0.22)"}}>פתח קישור</a>
          </div>
        )}
      </div>
    </div>
  );
}

const DAILY_EQUIPMENT_CHECKLIST = [
  {
    group: "בדיקות",
    items: ["ערכת בדיקה", "מד מלח", "כוס מדידה", "סוללות / טעינה"]
  },
  {
    group: "ניקוי",
    items: ["רשת עלים", "מברשת", "מוט טלסקופי", "שואב / ראש ניקוי"]
  },
  {
    group: "בטיחות",
    items: ["כפפות", "משקפי מגן", "מים לשתייה", "טלפון טעון"]
  }
];

function normalizeEquipmentChecklist(value) {
  const list = Array.isArray(value) ? value : DAILY_EQUIPMENT_CHECKLIST;
  const groups = list.map(group => ({
    group: String(group?.group || "ציוד").trim() || "ציוד",
    items: Array.isArray(group?.items) ? group.items.map(item => String(item || "").trim()).filter(Boolean) : []
  })).filter(group => group.items.length);
  return groups.length ? groups : DAILY_EQUIPMENT_CHECKLIST;
}

function equipmentChecklistStorageKey(userRef) {
  return `galileo_equipment_checklist:${String(userRef || "default").trim() || "default"}`;
}

function loadEquipmentChecklist(userRef) {
  try {
    return normalizeEquipmentChecklist(JSON.parse(localStorage.getItem(equipmentChecklistStorageKey(userRef)) || "null"));
  } catch {
    return DAILY_EQUIPMENT_CHECKLIST;
  }
}

function checklistToText(list) {
  return normalizeEquipmentChecklist(list).flatMap(group => group.items).join("\n");
}

function checklistFromText(text) {
  const items = String(text || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  return items.length ? [{group:"ציוד אישי", items}] : DAILY_EQUIPMENT_CHECKLIST;
}

function DailyBriefingModal({tasks,supplyTasks,workStart,supplyDB,supplyForPool,subOperators=[],equipmentChecklist=DAILY_EQUIPMENT_CHECKLIST,onStartWork,onConfirm,onClose,english=false}) {
  const list = Array.isArray(tasks) ? tasks : [];
  const materialList = Array.isArray(supplyTasks) ? supplyTasks : [];
  const linkedSubs = Array.isArray(subOperators) ? subOperators.filter(Boolean) : [];
  const checklist = normalizeEquipmentChecklist(equipmentChecklist);
  const tx = (hebrew, englishText) => english ? englishText : hebrew;
  const equipmentText = (value) => {
    if (!english) return value;
    const translations = {
      "בדיקות":"Testing", "ניקוי":"Cleaning", "בטיחות":"Safety", "ציוד אישי":"Personal equipment",
      "ערכת בדיקה":"Test kit", "מד מלח":"Salt meter", "כוס מדידה":"Measuring cup", "סוללות / טעינה":"Batteries / charging",
      "רשת עלים":"Leaf net", "מברשת":"Brush", "מוט טלסקופי":"Telescopic pole", "שואב / ראש ניקוי":"Vacuum / cleaning head",
      "כפפות":"Gloves", "משקפי מגן":"Safety glasses", "מים לשתייה":"Drinking water", "טלפון טעון":"Charged phone"
    };
    return translations[value] || value;
  };
  const [openMaterial,setOpenMaterial] = useState(null);
  const [equipmentChecked,setEquipmentChecked] = useState({});
  const supplyForTask = (task = {}) => {
    if (typeof supplyForPool === "function") return supplyForPool(task.client, task.clientId);
    const id = String(task.clientId || "").trim();
    if (id && supplyDB?.[id]) return supplyDB[id];
    if (id) {
      return Object.values(supplyDB || {}).find(item => String(item?.clientId || "").trim() === id) || null;
    }
    return supplyDB?.[task.client] || null;
  };
  const toggleEquipment = (group, item) => {
    const key = `${group}:${item}`;
    setEquipmentChecked(prev=>({...prev,[key]:!prev[key]}));
  };
  const materials = materialList.reduce((acc, task) => {
    const supply = supplyForTask(task);
    if (!supply) return acc;
    if (supply.acid) acc.acid += 1;
    if (supply.phUpSupply) acc.phUpSupply += 1;
    if (supply.saltPkg) acc.saltBags += Number(supply.saltBags || 0);
    return acc;
  }, { acid: 0, phUpSupply: 0, saltBags: 0 });
  const materialRecipients = materialList.reduce((acc, task) => {
    const supply = supplyForTask(task);
    if (!supply) return acc;
    const client = String(task.client || "").split(" - ")[0];
    if (supply.acid) acc.acid.push(client);
    if (supply.phUpSupply) acc.phUpSupply.push(client);
    if (supply.saltPkg && Number(supply.saltBags || 0) > 0) acc.saltBags.push(`${client} ×${Number(supply.saltBags || 0)}`);
    return acc;
  }, { acid: [], phUpSupply: [], saltBags: [] });
  const hasMaterials = materials.acid || materials.phUpSupply || materials.saltBags;
  return (
    <div dir={english?"ltr":"rtl"} style={{position:"fixed",inset:0,zIndex:1300,background:"rgba(15,23,42,0.38)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(10px)"}}>
      <div style={{width:"100%",maxWidth:420,maxHeight:"88vh",overflowY:"auto",background:"rgba(255,255,255,0.82)",backdropFilter:"blur(22px)",WebkitBackdropFilter:"blur(22px)",borderRadius:28,boxShadow:"0 28px 90px rgba(15,23,42,0.20), 0 1px 0 rgba(255,255,255,0.86) inset",border:"1px solid rgba(148,163,184,0.24)",padding:16}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:12}}>
          <div>
            <div style={{fontSize:18,fontWeight:900,color:C.text}}>{tx("פותחים יום","Start your day")}</div>
            <div style={{fontSize:12,fontWeight:700,color:C.muted,marginTop:2}}>{tx("סדר היום שהוכן לך","Your prepared route")}</div>
          </div>
          <Press onClick={onClose || onConfirm} style={{width:34,height:34,borderRadius:12,background:"rgba(241,245,249,0.84)",color:C.muted,fontWeight:900,fontSize:18,lineHeight:1,padding:0,display:"flex",alignItems:"center",justifyContent:"center"}}>×</Press>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
          <div style={{background:"#e3f2fd",borderRadius:14,padding:"12px 10px",textAlign:"center"}}>
            <div style={{fontSize:22,fontWeight:900,color:C.blue}}>{list.length}</div>
            <div style={{fontSize:11,fontWeight:800,color:C.muted}}>{tx("בריכות היום","Pools today")}</div>
          </div>
          <div style={{background:workStart?"#e8f5e9":"#fff8e1",borderRadius:14,padding:"12px 10px",textAlign:"center"}}>
            <div style={{fontSize:16,fontWeight:900,color:workStart?C.green:C.orange}}>{workStart || "--:--"}</div>
            <div style={{fontSize:11,fontWeight:800,color:C.muted}}>{tx("שעון עבודה","Work clock")}</div>
          </div>
        </div>
        {linkedSubs.length>0&&(
          <div style={{background:"#eef6ff",border:`1px solid ${C.border}`,borderRadius:14,padding:"10px 12px",marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:900,color:C.text,marginBottom:6}}>{tx("עוזר מפעיל משויך להיום","Assistant assigned today")}</div>
            {linkedSubs.map((sub,i)=>(
              <div key={sub.username || sub.name || i} style={{fontSize:12,fontWeight:800,color:C.blue,padding:"3px 0"}}>
                {sub.name || sub.username}
              </div>
            ))}
          </div>
        )}
        {!workStart&&(
          <Press onClick={onStartWork} style={{padding:"12px 14px",borderRadius:16,background:"linear-gradient(135deg,#2563eb,#7c3aed)",color:"#fff",fontWeight:900,fontSize:14,textAlign:"center",marginBottom:12,boxShadow:"0 14px 32px rgba(79,70,229,0.22)"}}>
            {tx("הפעל שעון","Start clock")}
          </Press>
        )}
        <div style={{background:"#f8fbff",border:`1px solid ${C.border}`,borderRadius:14,padding:12,marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:8}}>
            <div>
              <div style={{fontSize:12,fontWeight:900,color:C.text}}>{tx("צ׳ק ליסט ציוד יומי","Daily equipment checklist")}</div>
              <div style={{fontSize:10,fontWeight:800,color:C.muted,marginTop:2}}>{tx("מתאפס בכל פתיחה של פותחים יום","Resets whenever this screen opens")}</div>
            </div>
            <Badge label={`${Object.values(equipmentChecked).filter(Boolean).length}/${checklist.reduce((n,g)=>n+g.items.length,0)}`} col={C.blue}/>
          </div>
          {checklist.map(group=>(
            <div key={group.group} style={{marginTop:10}}>
              <div style={{fontSize:11,fontWeight:900,color:C.muted,marginBottom:6}}>{equipmentText(group.group)}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
                {group.items.map(item=>{
                  const key = `${group.group}:${item}`;
                  const checked = !!equipmentChecked[key];
                  return (
                    <Press key={key} onClick={()=>toggleEquipment(group.group,item)} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 10px",borderRadius:12,background:checked?"#e8f5e9":"#fff",border:`1px solid ${checked?"#c8e6c9":C.border}`,color:checked?C.green:C.text,textAlign:"right"}}>
                      <span style={{width:22,height:22,borderRadius:7,background:checked?C.green:"#f0f4f8",border:`1px solid ${checked?C.green:C.border}`,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,flexShrink:0}}>{checked?"✓":""}</span>
                      <span style={{fontSize:12,fontWeight:900,lineHeight:1.2}}>{equipmentText(item)}</span>
                    </Press>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div style={{background:"#f5f9ff",border:`1px solid ${C.border}`,borderRadius:14,padding:12,marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:900,color:C.text,marginBottom:8}}>{tx("חומרים לסיפוק היום","Materials to supply today")}</div>
          {hasMaterials ? (
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                <Press onClick={()=>setOpenMaterial(openMaterial==="acid"?null:"acid")} style={{background:"#ffebee",borderRadius:12,padding:"9px 6px",textAlign:"center"}}><div style={{fontSize:18,fontWeight:900,color:C.red}}>{materials.acid}</div><div style={{fontSize:10,fontWeight:800,color:C.muted}}>{tx("חומצה","Acid")}</div></Press>
                <Press onClick={()=>setOpenMaterial(openMaterial==="phUpSupply"?null:"phUpSupply")} style={{background:"#f3e5f5",borderRadius:12,padding:"9px 6px",textAlign:"center"}}><div style={{fontSize:18,fontWeight:900,color:"#6a1b9a"}}>{materials.phUpSupply}</div><div style={{fontSize:10,fontWeight:800,color:C.muted}}>{tx("מעלה pH","pH increaser")}</div></Press>
                <Press onClick={()=>setOpenMaterial(openMaterial==="saltBags"?null:"saltBags")} style={{background:"#e8f5e9",borderRadius:12,padding:"9px 6px",textAlign:"center"}}><div style={{fontSize:18,fontWeight:900,color:C.green}}>{materials.saltBags}</div><div style={{fontSize:10,fontWeight:800,color:C.muted}}>{tx("שקי מלח","Salt bags")}</div></Press>
              </div>
              {openMaterial&&(
                <div style={{marginTop:8,background:"#fff",border:`1px solid ${C.border}`,borderRadius:12,padding:"9px 10px"}}>
                  <div style={{fontSize:11,fontWeight:900,color:C.muted,marginBottom:6}}>{tx("מיועד ל:","For:")}</div>
                  {(materialRecipients[openMaterial] || []).length ? (materialRecipients[openMaterial] || []).map((name,i)=><div key={`${openMaterial}-${i}`} style={{fontSize:12,fontWeight:800,color:C.text,padding:"3px 0"}}>{name}</div>) : <div style={{fontSize:12,fontWeight:800,color:C.muted}}>{tx("אין נמענים לחומר הזה","No recipients for this material")}</div>}
                </div>
              )}
            </>
          ) : (
            <div style={{fontSize:12,fontWeight:800,color:C.muted,textAlign:"center",padding:"4px 0"}}>{tx("אין חומרים מסומנים לסיפוק","No materials marked for supply")}</div>
          )}
        </div>
        <div style={{border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden",marginBottom:14}}>
          {list.length===0&&<div style={{padding:18,textAlign:"center",fontSize:13,fontWeight:800,color:C.muted,background:"#f5f9ff"}}>{tx("אין סדר יום לתאריך הזה","No route for this date")}</div>}
          {list.slice(0,12).map((t,i)=>(
            <div key={t.id || `${t.client}-${i}`} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:i%2?"#fff":"#f5f9ff",borderTop:i?`1px solid ${C.border}`:"none"}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:"#e3f2fd",color:C.blue,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:12,flexShrink:0}}>{i+1}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:900,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{String(t.client || "").split(" - ")[0]}</div>
                {t.adminNote&&<div style={{fontSize:11,fontWeight:700,color:C.orange,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.adminNote}</div>}
              </div>
              <Badge label={t.status==="done"?tx("\u2713 \u05d1\u05d5\u05e6\u05e2","\u2713 Done"):tx("\u05de\u05de\u05ea\u05d9\u05df","Pending")} col={t.status==="done"?C.green:C.orange}/>
            </div>
          ))}
          {list.length>12&&<div style={{padding:10,textAlign:"center",fontSize:12,fontWeight:800,color:C.muted,background:"#f5f9ff"}}>{tx(`ועוד ${list.length-12} בריכות`,`${list.length-12} more pools`)}</div>}
        </div>
        <Press onClick={onConfirm} style={{padding:"13px 16px",borderRadius:16,background:"rgba(21,128,61,0.10)",color:C.green,fontWeight:900,fontSize:14,textAlign:"center",border:"1px solid rgba(21,128,61,0.18)"}}>
          {tx("אישרתי, עבור לעמוד הבית","Confirmed, go to home")}
        </Press>
      </div>
    </div>
  );
}

function WorkClockReminderModal({workStart,onStop,onClose,english=false}) {
  const t = (hebrew, englishText) => english ? englishText : hebrew;
  return (
    <div dir={english?"ltr":"rtl"} style={{position:"fixed",inset:0,zIndex:1350,background:"rgba(15,23,42,0.38)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(10px)"}}>
      <div style={{width:"100%",maxWidth:380,background:"rgba(255,255,255,0.82)",backdropFilter:"blur(22px)",WebkitBackdropFilter:"blur(22px)",borderRadius:28,boxShadow:"0 28px 90px rgba(15,23,42,0.20), 0 1px 0 rgba(255,255,255,0.86) inset",border:"1px solid rgba(148,163,184,0.24)",padding:18}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:12}}>
          <div>
            <div style={{fontSize:19,fontWeight:900,color:C.text}}>{t("זוכר לסגור שעון?","Remember to stop the clock?")}</div>
            <div style={{fontSize:12,fontWeight:700,color:C.muted,marginTop:3}}>{t("השעה 12:30 והשעון עדיין פעיל","It is 12:30 and the clock is still running")}</div>
          </div>
          <Press onClick={onClose} style={{width:34,height:34,borderRadius:12,background:"rgba(241,245,249,0.84)",color:C.muted,fontWeight:900,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</Press>
        </div>
        <div style={{background:"#fff8e1",border:"1px solid #ffe082",borderRadius:14,padding:"12px 14px",marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:800,color:C.orange,marginBottom:4}}>{t("שעון פעיל מ:","Clock active since:")}</div>
          <div style={{fontSize:24,fontWeight:900,color:C.orange}}>{workStart || "--:--"}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Press onClick={onStop} style={{padding:"13px 14px",borderRadius:16,background:`linear-gradient(135deg,#b91c1c,#ef4444)`,color:"#fff",fontWeight:900,fontSize:14,textAlign:"center",boxShadow:"0 14px 32px rgba(185,28,28,0.22)"}}>
            {t("עצור ושמור שעות","Stop and save hours")}
          </Press>
          <Press onClick={onClose} style={{padding:"13px 14px",borderRadius:16,background:"rgba(241,245,249,0.84)",color:C.muted,fontWeight:900,fontSize:14,textAlign:"center"}}>
            {t("אזכיר לעצמי","Remind me later")}
          </Press>
        </div>
      </div>
    </div>
  );
}

function BottomSheet({children,onClose,title}) {
  const [vis,setVis] = useState(false);
  useEffect(()=>{setTimeout(()=>setVis(true),10);},[]);
  const close = () => { setVis(false); setTimeout(onClose,350); };
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div onClick={close} style={{position:"absolute",inset:0,background:`rgba(15,23,42,${vis?0.36:0})`,transition:"background 0.3s",backdropFilter:"blur(8px)"}}/>
      <div style={{position:"relative",background:"rgba(255,255,255,0.86)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",border:"1px solid rgba(148,163,184,0.22)",borderRadius:"28px 28px 0 0",boxShadow:"0 -24px 70px rgba(15,23,42,0.16), 0 1px 0 rgba(255,255,255,0.86) inset",transform:vis?"translateY(0)":"translateY(100%)",transition:"transform 0.4s cubic-bezier(0.34,1.2,0.64,1)",maxHeight:"calc(85vh - env(safe-area-inset-top, 0px))",overflowY:"auto"}}>
        <div style={{padding:"16px 20px 8px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid rgba(148,163,184,0.16)",position:"sticky",top:0,background:"rgba(232,241,253,0.82)",backdropFilter:"blur(18px)",zIndex:1}}>
          <h2 style={{margin:0,fontSize:17,fontWeight:900,color:"#0d47a1"}}>{title}</h2>
          <Press onClick={close} style={{width:34,height:34,borderRadius:12,background:"rgba(241,245,249,0.84)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"#546e7a"}}>✕</Press>
        </div>
        <div style={{padding:"16px 20px calc(32px + env(safe-area-inset-bottom, 0px))"}}>{children}</div>
      </div>
    </div>
  );
}

const C = {blue:"#1d4ed8",lightBlue:"#3b82f6",bg:"#dbeafe",white:"rgba(241,247,255,0.86)",card:"rgba(232,241,253,0.80)",text:"#0f1f38",muted:"#52657f",border:"rgba(100,116,139,0.28)",green:"#15803d",orange:"#c2410c",red:"#b91c1c"};
const inp = {width:"100%",background:"rgba(226,237,250,0.78)",border:"1px solid rgba(148,163,184,0.24)",borderRadius:16,padding:"12px 14px",fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"'Plus Jakarta Sans',sans-serif",color:C.text,boxShadow:"inset 0 1px 0 rgba(255,255,255,0.75)"};
const sel = {...inp,background:"rgba(226,237,250,0.78)"};
const card = (extra={}) => ({background:C.card,borderRadius:22,padding:16,boxShadow:"0 18px 45px rgba(30,64,175,0.12), 0 1px 0 rgba(255,255,255,0.75) inset",border:"1px solid "+C.border,...extra});

function Badge({label,col="#1565c0",bg}) {
  return <span style={{minWidth:52,minHeight:24,display:"inline-flex",alignItems:"center",justifyContent:"center",background:bg||col+"18",color:col,border:`1px solid ${col}33`,borderRadius:99,padding:"0 11px",fontSize:11,fontWeight:800,lineHeight:1,whiteSpace:"nowrap"}}>{label}</span>;
}

function IndicatorBubbles({red=0, blue=0}) {
  const countStyle = (bg, side) => ({position:"absolute",top:4,[side]:7,minWidth:18,height:18,padding:"0 5px",borderRadius:99,display:"inline-flex",alignItems:"center",justifyContent:"center",background:bg,color:"#fff",fontSize:10,fontWeight:900,lineHeight:1,boxShadow:"0 0 0 2px rgba(255,255,255,0.92), 0 6px 14px rgba(15,23,42,0.18)",border:"1px solid rgba(255,255,255,0.9)",pointerEvents:"none",zIndex:3});
  return <>
    {Number(red) > 0 && <span style={countStyle("#dc2626", "right")}>{red}</span>}
    {Number(blue) > 0 && <span style={countStyle("#2563eb", "left")}>{blue}</span>}
  </>;
}

function TaskChangeInfo({log, operators=[]}) {
  if (!log?.note && !log?.at && !log?.by) return null;
  const pendingOperators = Array.isArray(operators) ? operators : [];
  return <div style={{background:"#f8fafc",borderRadius:10,padding:"10px 12px",fontSize:14,color:"#0f172a",fontWeight:800,lineHeight:1.55,marginBottom:8,border:"1px solid rgba(15,23,42,0.12)"}}>
    <div>🕐 {[log.at, log.note].filter(Boolean).join(" — ")}{log.by ? ` — ${log.by}` : ""}</div>
    {log.needsAck&&pendingOperators.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:7}}>{pendingOperators.map(op=>{ const acked=(log.ackedBy||[]).includes(op); return <span key={op} style={{background:acked?"#e8f5e9":"#fff3e0",color:acked?"#166534":"#9a3412",borderRadius:99,padding:"4px 10px",fontSize:12,fontWeight:900,border:`1px solid ${acked?"#bbf7d0":"#fed7aa"}`}}>{acked?"✓":"⏳"} {op}</span>; })}</div>}
  </div>;
}
function OperatorNoteBox({note}) {
  const clean = String(note || "").trim();
  if (!clean) return null;
  return <div style={{background:"#eef6ff",borderRadius:12,padding:"10px 12px",fontSize:14,color:"#0f172a",fontWeight:800,lineHeight:1.55,marginBottom:8,border:"1px solid rgba(37,99,235,0.22)"}}>
    <div style={{fontSize:12,fontWeight:900,color:"#1d4ed8",marginBottom:4}}>הערות משימה</div>
    <div>{clean}</div>
  </div>;
}
function Sec({icon,title,action,children}) {
  const displayTitle = String(title || "").includes("ציוד") && String(title || "").includes("טיפול") ? "חומרים לטיפול הבא" : title;
  return (
    <div style={{marginBottom:22}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <span style={{fontSize:16}}>{icon}</span>
        <span style={{fontSize:11,fontWeight:800,color:C.muted,letterSpacing:"0.12em",textTransform:"uppercase"}}>{displayTitle}</span>
        <div style={{flex:1,height:1,background:"linear-gradient(90deg,#bbdefb,transparent)"}}/>
        {action&&<div style={{display:"flex",alignItems:"center",justifyContent:"flex-end"}}>{action}</div>}
      </div>
      {children}
    </div>
  );
}

function PBar({done,total,label="משימות"}) {
  const pct = total>0?Math.round((done/total)*100):0;
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.muted,marginBottom:6}}>
        <span>{done}/{total} {label}</span>
        <span style={{color:C.blue,fontWeight:800}}>{pct}%</span>
      </div>
      <div style={{height:8,background:C.border,borderRadius:99,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${C.blue},${C.lightBlue})`,borderRadius:99,transition:"width 0.5s cubic-bezier(0.34,1.2,0.64,1)"}}/>
      </div>
    </div>
  );
}

function SliderField({label,min,max,step=0.1,value,onChange,optimal,unit="",warnAbove,warnBelow,large=false,disabled=false,disabledReason="",english=false}) {
  const pct=((value-min)/(max-min))*100;
  let col=C.green,txt=english?"Normal":"תקין";
  if(warnAbove&&value>warnAbove){col=C.red;txt=english?"⚠️ High":"⚠️ גבוה";}
  else if(warnBelow&&value<warnBelow){col=C.orange;txt=english?"⚠️ Low":"⚠️ נמוך";}
  else if(optimal&&Math.abs(value-optimal)<0.3){col=C.blue;txt=english?"✓ Optimal":"✓ אופטימלי";}
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
  const updateBy = (delta) => { if(!disabled) onChange(normalize(Number(value||0) + delta)); };
  const setValueFromPointer = (clientX) => {
    if (disabled) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect?.width) return;
    const raw = min + ((clientX - rect.left) / rect.width) * (max - min);
    onChange(normalize(raw));
  };
  const startSlide = (e) => {
    if (disabled) return;
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
    <div style={{marginBottom:6,opacity:disabled?0.58:1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{fontWeight:700,fontSize:large?18:14,color:C.text}}>{label}</span>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {showStatus&&<span style={{background:col+"15",color:col,borderRadius:99,padding:"3px 10px",fontSize:large?13:11,fontWeight:800,border:`1px solid ${col}30`}}>{txt}</span>}
          <span style={{color:showStatus?col:C.blue,fontSize:large?28:22,fontWeight:900,minWidth:large?70:50,textAlign:"right"}}>{value}{unit}</span>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
        {[[false,english?"Slider":"\u05e1\u05dc\u05d9\u05d9\u05d3\u05e8"],[true,english?"Manual input":"\u05d4\u05e7\u05dc\u05d3\u05d4"]].map(([mode,labelText])=>(
          <Press key={String(mode)} onClick={()=>!disabled&&setManualMode(mode)}
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
          disabled={disabled}
          style={{...inp,marginBottom:10,textAlign:"center",fontSize:large?24:18,fontWeight:900,color:C.blue}}
        />
      )}
      {disabled&&<div style={{fontSize:11,fontWeight:800,color:C.muted,marginBottom:8}}>{disabledReason || (english?"Locked for this pool type":"נעול לפי סיווג הבריכה")}</div>}
      <div ref={trackRef} dir="ltr" onPointerDown={startSlide} onPointerMove={moveSlide} onPointerUp={endSlide} onPointerCancel={endSlide} onPointerLeave={endSlide} style={{position:"relative",height:trackH,borderRadius:99,background:C.border,marginBottom:6,touchAction:"pan-y"}}>
        <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${pct}%`,borderRadius:99,background:`linear-gradient(90deg,${C.blue},${col})`,transition:"width 0.15s"}}/>
        {optimal&&<div style={{position:"absolute",top:-4,left:`${((optimal-min)/(max-min))*100}%`,width:large?3:2,height:large?36:16,background:C.blue,borderRadius:2,transform:"translateX(-50%)"}}/>}
        <input ref={sliderRef} type="range" min={min} max={max} step={step} value={value}
          onChange={e=>onChange(parseFloat(e.target.value))}
          disabled={disabled}
          dir="ltr"
          style={{position:"absolute",top:large?-16:-8,left:0,width:"100%",opacity:0,cursor:"pointer",height:large?60:24,touchAction:"pan-y",pointerEvents:"none",WebkitAppearance:"none"}}/>
      </div>
      <div dir="ltr" style={{display:"flex",justifyContent:"space-between",fontSize:large?12:10,color:C.muted}}>
        <span>{min}</span>{optimal&&<span style={{color:C.blue}}>{english?"Optimal":"אופטימלי"} {optimal}</span>}<span>{max}</span>
      </div>
    </div>
  );
}

const clientMetaLine = (c) => [
  c?.poolType && `סוג: ${c.poolType}`,
  c?.regularOperator && `מפעיל: ${c.regularOperator}`,
  c?.regularDays && `ימים: ${c.regularDays}`
].filter(Boolean).join(" · ");

const LOW_SALT_REPORT_TEXT = "מלח נמוך";
const numericSaltPpm = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const match = String(value || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
};
const isLowSaltFlagValue = (value) => {
  const text = String(value || "");
  return text.includes("נורת מלח") || text.includes("מלח נמוך");
};
const measuredSaltPpm = (value) => {
  if (value === null || value === undefined || String(value).trim() === "" || isLowSaltFlagValue(value)) return NaN;
  const n = numericSaltPpm(value);
  return Number.isFinite(n) && n > 0 ? n : NaN;
};
const isNormalSaltLevelValue = (value) => {
  const n = numericSaltPpm(value);
  return Number.isFinite(n) && n >= 2500;
};
const isLowSaltLevelValue = (value) => {
  const n = numericSaltPpm(value);
  return Number.isFinite(n) && n > 0 && n < 2500;
};
const isLowSaltReportValue = (value) => {
  if (isNormalSaltLevelValue(value)) return false;
  return isLowSaltFlagValue(value) || isLowSaltLevelValue(value);
};

function CollapsibleSlider({fieldKey="",label,min,max,step,unit,warnAbove,warnBelow,optimal,val,fn,large,expandKey,form,sf,disabled=false,disabledReason="",zeroButtonLabel="",phLowButton=false,saltLowLightButton=false,required=false,english=false}) {
  const isOpen = !!form[expandKey];
  const displayVal = Number(val) || 0;
  const zeroConfirmKey = `${expandKey}_zero`;
  const zeroConfirmed = !!form[zeroConfirmKey] && displayVal === 0;
  const saltLowActive = saltLowLightButton && !isNormalSaltLevelValue(val) && (!!form.lowSaltLight || isLowSaltLevelValue(val) || isLowSaltFlagValue(val));
  const hasValue = displayVal > 0 || (phLowButton && form.phLowConfirmed) || saltLowActive;
  const setSliderValue = (v) => {
    if (Number(v) > 0 && form[zeroConfirmKey]) sf(zeroConfirmKey, false);
    fn(v);
  };
  return (
    <div style={{...card({marginBottom:8})}}>
      <Press onClick={()=>sf(expandKey,!isOpen)}
        style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontWeight:700,fontSize:14,color:C.text}}>{label}</span>
          {required&&!disabled&&<span style={{background:"#ffebee",color:C.red,border:"1px solid #ffcdd2",borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:900}}>{english?"Required":"חובה"}</span>}
          {hasValue&&!isOpen&&<span style={{background:"#e3f2fd",color:C.blue,borderRadius:99,padding:"2px 10px",fontSize:12,fontWeight:800}}>{phLowButton&&form.phLowConfirmed?(english?"Low pH":"PH נמוך"):saltLowActive?(english?"Low salt":LOW_SALT_REPORT_TEXT):`${displayVal}${unit}`}</span>}
        </div>
        <span style={{fontSize:16,color:C.blue,display:"inline-block",transform:isOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▾</span>
      </Press>
      {isOpen&&(
        <>
          {zeroButtonLabel&&(
            <Press onClick={()=>{fn(0);sf(zeroConfirmKey,true);haptic();}} style={{padding:"9px 12px",borderRadius:12,background:zeroConfirmed?"#e8f5e9":"#f0f4f8",color:zeroConfirmed?C.green:C.muted,fontWeight:900,fontSize:12,textAlign:"center",marginBottom:10,border:`1px solid ${zeroConfirmed?"#c8e6c9":C.border}`}}>
              {zeroConfirmed?"✓ ":""}{zeroButtonLabel}
            </Press>
          )}
          {fieldKey==="chlorine"&&displayVal===0&&(
            <Press onClick={()=>{sf("chlorineZeroConfirmed",true);haptic("success");}} style={{padding:"9px 12px",borderRadius:12,background:form.chlorineZeroConfirmed?"#e8f5e9":"#fff8e1",color:form.chlorineZeroConfirmed?C.green:C.orange,fontWeight:900,fontSize:12,textAlign:"center",marginBottom:10,border:`1px solid ${form.chlorineZeroConfirmed?"#c8e6c9":"#ffe082"}`}}>
              {form.chlorineZeroConfirmed?"✓ ":""}{english?"Chlorine level 0":"רמת כלור 0"}
            </Press>
          )}
          {phLowButton&&displayVal===0&&(
            <Press onClick={()=>{sf("phLowConfirmed",true);fn(0);haptic("success");}} style={{padding:"9px 12px",borderRadius:12,background:form.phLowConfirmed?"#e8f5e9":"#fff8e1",color:form.phLowConfirmed?C.green:C.orange,fontWeight:900,fontSize:12,textAlign:"center",marginBottom:10,border:`1px solid ${form.phLowConfirmed?"#c8e6c9":"#ffe082"}`}}>
              {form.phLowConfirmed?"✓ ":""}{english?"Low pH":"PH נמוך"}
            </Press>
          )}
          {saltLowLightButton&&(
            <Press onClick={()=>{ if(isNormalSaltLevelValue(val)){sf("lowSaltLight",false);haptic("light");return;} sf("lowSaltLight",!form.lowSaltLight);haptic(saltLowActive?"light":"success");}} style={{padding:"9px 12px",borderRadius:12,background:saltLowActive?"#fff8e1":"#f0f4f8",color:saltLowActive?C.orange:C.muted,fontWeight:900,fontSize:12,textAlign:"center",marginBottom:10,border:`1px solid ${saltLowActive?"#ffe082":C.border}`}}>
              {saltLowActive?"✓ ":""}{english?"Low salt":"מלח נמוך"}
            </Press>
          )}
          <SliderField label={label} min={min} max={max} step={step} value={displayVal} onChange={setSliderValue} unit={unit} warnAbove={warnAbove} warnBelow={warnBelow} optimal={optimal} large={large} disabled={disabled} disabledReason={disabledReason} english={english}/>
        </>
      )}
    </div>
  );
}

function ToggleField({label,value,onChange,english=false}) {
  const options = [
    {value:"תקין",label:english?"Normal":"תקין"},
    {value:"לא תקין",label:english?"Not normal":"לא תקין"}
  ];
  return (
    <div style={{...card(),marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{fontWeight:700,fontSize:14,color:C.text}}>{label}</span>
      <div style={{display:"flex",gap:6}}>
        {options.map(option=>(
          <Press key={option.value} onClick={()=>onChange(option.value)}
            style={{padding:"7px 14px",borderRadius:99,fontSize:12,fontWeight:800,background:value===option.value?(option.value==="תקין"?C.blue:C.red):"#f0f4f8",color:value===option.value?"#fff":C.muted,boxShadow:value===option.value?`0 4px 12px ${option.value==="תקין"?"rgba(21,101,192,0.3)":"rgba(198,40,40,0.3)"}`:  "none",transition:"all 0.2s"}}>
            {option.label}
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
    <div style={{position:"fixed",inset:0,background:"linear-gradient(180deg,#0f172a 0%,#1e3a5f 52%,#eef6ff 100%)",zIndex:300,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <div style={{position:"absolute",top:16,right:16,zIndex:10}}>
        <Press onClick={onClose} style={{width:40,height:40,borderRadius:"50%",background:"rgba(255,255,255,0.22)",border:"1px solid rgba(255,255,255,0.32)",backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:18}}>✕</Press>
      </div>
      <p style={{color:"rgba(255,255,255,0.7)",fontSize:13,fontWeight:600,marginBottom:16,textAlign:"center",padding:"0 20px"}}>כוון את המצלמה ל-QR Code של הלקוח</p>
      <div style={{position:"relative",width:280,height:280,marginBottom:24}}>
        <video ref={videoRef} style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:24,boxShadow:"0 24px 60px rgba(15,23,42,0.28)",border:"1px solid rgba(255,255,255,0.32)"}} playsInline muted/>
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
        <label style={{background:"rgba(255,255,255,0.22)",border:"1px solid rgba(255,255,255,0.32)",backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",borderRadius:16,padding:"10px 20px",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer"}}>
          📁 העלה תמונה
          <input type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/>
        </label>
      </div>
      <style>{`@keyframes scanLine{0%{top:10%}50%{top:90%}100%{top:10%}}`}</style>
    </div>
  );
}

function getLicense() { try { return JSON.parse(localStorage.getItem("galileo_license")||"{}"); } catch { return {}; } }
function saveLicense(data) { localStorage.setItem("galileo_license", JSON.stringify(data)); }
function subOperatorLanguageStorageKey(user = {}) {
  const identity = String(user?.username || user?.name || "unknown").trim().toLowerCase();
  return `galileo_sub_operator_language:${identity}`;
}

function companyFromLicenseResponse(res = {}) {
  const displayName = res.companyName || res.company || res.appName || DEFAULT_APP_NAME;
  return {
    name: displayName,
    appName: res.appName || displayName,
    shortName: res.shortName || res.appName || displayName,
    sheetId: res.sheetId,
    scriptUrl: FIXED_SCRIPT_URL,
    adminEmail: res.adminEmail || "",
    logoUrl: res.logoUrl || "",
    icon192Url: res.icon192Url || "",
    icon512Url: res.icon512Url || "",
    appleIconUrl: res.appleIconUrl || "",
    themeColor: res.themeColor || DEFAULT_THEME_COLOR,
    backgroundColor: res.backgroundColor || res.themeColor || DEFAULT_THEME_COLOR,
  };
}

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
      const company = companyFromLicenseResponse(res);
      saveLicense({key:key.trim(),company:res.company,sheetId:res.sheetId,plan:res.plan,status:res.status,expiry:res.expiry,adminEmail:res.adminEmail||"",logoUrl:res.logoUrl||"",appName:company.appName,shortName:company.shortName,icon192Url:company.icon192Url,icon512Url:company.icon512Url,appleIconUrl:company.appleIconUrl,themeColor:company.themeColor,backgroundColor:company.backgroundColor});
      saveCompany(company);
      if(res.sheetId) localStorage.setItem("galileo_sheet_id", res.sheetId);
      setLoading(false); onDone();
    } else {
      setErr(res?.reason||"מפתח לא תקין"); setLoading(false);
    }
  };
  return (
    <div dir="rtl" className="galileo-ios-vh" style={{minHeight:"100vh",background:"linear-gradient(180deg,#e7f0fb 0%,#d7e6f7 45%,#e8eef8 100%)",fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"calc(24px + env(safe-area-inset-top, 0px)) 24px calc(24px + env(safe-area-inset-bottom, 0px))"}}>
      <IPhoneComfortLayer/>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}`}</style>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{width:92,height:92,margin:"0 auto 14px",borderRadius:28,background:"rgba(232,241,253,0.82)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:52,boxShadow:"0 24px 60px rgba(37,99,235,0.14), 0 1px 0 rgba(255,255,255,0.8) inset",border:"1px solid rgba(148,163,184,0.22)",backdropFilter:"blur(18px)"}}>🌊</div>
          <h1 style={{color:C.text,fontSize:28,fontWeight:900,margin:"0 0 6px",letterSpacing:"-0.5px"}}>POOLMANG.BY.OR2026</h1>
          <p style={{color:C.muted,fontSize:14,margin:0,fontWeight:700}}>מערכת ניהול בריכות מקצועית</p>
        </div>
        <div style={{background:"rgba(226,237,250,0.78)",backdropFilter:"blur(22px)",WebkitBackdropFilter:"blur(22px)",borderRadius:28,padding:28,border:"1px solid rgba(148,163,184,0.24)",boxShadow:"0 26px 70px rgba(37,99,235,0.12), 0 1px 0 rgba(255,255,255,0.86) inset"}}>
          <div style={{textAlign:"center",marginBottom:24}}>
            <div style={{fontSize:32,marginBottom:8}}>🔑</div>
            <h2 style={{color:C.text,fontSize:20,fontWeight:900,margin:"0 0 6px"}}>הזן מפתח רישיון</h2>
            <p style={{color:C.muted,fontSize:13,margin:0,fontWeight:700}}>קיבלת מפתח? הזן אותו כאן</p>
          </div>
          <input value={key} onChange={e=>{setKey(formatKey(e.target.value));setErr("");}}
            placeholder="PSP-XXXX-XXXX-XXXX" maxLength={19} onKeyDown={e=>e.key==="Enter"&&validate()}
            style={{width:"100%",background:"rgba(232,241,253,0.82)",border:"1px solid rgba(148,163,184,0.28)",borderRadius:16,padding:"14px 16px",fontSize:18,outline:"none",color:C.text,fontFamily:"'Courier New',monospace",textAlign:"center",letterSpacing:"0.15em",caretColor:C.blue,boxSizing:"border-box",boxShadow:"inset 0 1px 0 rgba(232,241,253,0.82)"}}/>
          {err&&<div style={{background:"rgba(185,28,28,0.10)",borderRadius:12,padding:"10px 14px",marginTop:12,color:C.red,fontSize:13,fontWeight:800,textAlign:"center",border:"1px solid rgba(185,28,28,0.18)"}}>{err}</div>}
          <Press onClick={validate} style={{marginTop:16,padding:16,borderRadius:18,background:loading?"rgba(148,163,184,0.24)":"linear-gradient(135deg,#2563eb,#7c3aed)",color:"#fff",fontWeight:900,fontSize:16,textAlign:"center",border:"1px solid rgba(255,255,255,0.36)",boxShadow:loading?"none":"0 16px 36px rgba(79,70,229,0.24)"}}>
            {loading?"⏳ בודק מפתח...":"אמת מפתח →"}
          </Press>
        </div>
        <p style={{textAlign:"center",fontSize:11,color:C.muted,marginTop:16,letterSpacing:"0.05em",fontWeight:800}}>POOLMANG.BY.OR2026 {APP_VERSION}</p>
      </div>
      <div onClick={onSuperAdmin} style={{position:"fixed",bottom:16,left:16,fontSize:28,opacity:0.35,padding:10,zIndex:10,WebkitTapHighlightColor:"transparent",cursor:"pointer",color:C.muted}}>⚙️</div>
    </div>
  );
}

const blank = () => ({
  reportDate:todayStr(),client:"",clientId:"",chlorine:0,ph:0,salt:0,chlora:0,hth:0,phUp:0,acidLiters:0,
  elModel:"",elSerial:"",elDate:"",waterLevel:"תקין",clarity:"תקין",fat:"תקין",flow:"",
  acid:false,phUpSupply:false,saltPkg:false,saltBags:0,supplyStatus:"",supplyNote:"",suppliedEquipment:[],chlorineZeroConfirmed:false,phLowConfirmed:false,poolStatus:"מאוזנת",customStatusText:"",restrictedUntil:"",
  notes:"",photos:[],clientLocked:false,adminReport:false,waterCheckOnly:false,lowSaltLight:false,sendReminder:false,chlorineReminderCreatedAt:"",chlorineReminderDueAt:"",chlorineReminderMessage:"",
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

const SUPER_MESSAGE_IMAGE_MAX_SIDE = 1280;
const SUPER_MESSAGE_IMAGE_QUALITY = 0.78;
const SUPER_MESSAGE_IMAGE_FALLBACK_MAX_SIDE = 560;
const SUPER_MESSAGE_IMAGE_FALLBACK_QUALITY = 0.62;

function superMessageImageSrc(msg = {}) {
  if (msg.imageUrl) return msg.imageUrl;
  if (msg.imageData) return `data:${msg.imageMime || "image/jpeg"};base64,${msg.imageData}`;
  return "";
}

function superMessageReplyImageSrc(msg = {}) {
  if (msg.replyImageUrl) return msg.replyImageUrl;
  if (msg.replyImageData) return `data:${msg.replyImageMime || "image/jpeg"};base64,${msg.replyImageData}`;
  return "";
}

function prepareSuperMessageImage(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }
    if (!String(file.type || "").startsWith("image/")) {
      reject(new Error("not image"));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const renderDataUrl = (maxSide, quality) => {
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          return canvas.toDataURL("image/jpeg", quality);
        };
        const dataUrl = renderDataUrl(SUPER_MESSAGE_IMAGE_MAX_SIDE, SUPER_MESSAGE_IMAGE_QUALITY);
        let fallbackUrl = dataUrl;
        if (fallbackUrl.length > 45000) {
          fallbackUrl = renderDataUrl(SUPER_MESSAGE_IMAGE_FALLBACK_MAX_SIDE, SUPER_MESSAGE_IMAGE_FALLBACK_QUALITY);
        }
        if (fallbackUrl.length > 45000) {
          fallbackUrl = renderDataUrl(420, 0.52);
        }
        URL.revokeObjectURL(url);
        const name = `${String(file.name || "super-message-image").replace(/\.[^.]+$/, "")}.jpg`;
        resolve({
          name,
          mimeType: "image/jpeg",
          data: dataUrl.split(",")[1] || "",
          fallbackData: fallbackUrl.split(",")[1] || "",
          previewUrl: dataUrl
        });
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });
}

function SuperAdminMessagesTab({ C2, inp2, showMsg }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [imageDraft, setImageDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const imageInputRef = useRef(null);

  const loadMessages = async () => {
    setLoading(true);
    const res = await mgmtCall("getSuperMessages", { to: SUPER_MESSAGE_TARGET.username });
    if (res?.messages) setMessages(res.messages);
    setLoading(false);
  };

  useEffect(() => { loadMessages(); }, []);

  const chooseImage = async (file) => {
    if (!file) return;
    setLoading(true);
    try {
      const image = await prepareSuperMessageImage(file);
      setImageDraft(image);
      showMsg("תמונה צורפה");
    } catch (e) {
      showMsg("בחירת התמונה נכשלה");
    } finally {
      setLoading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const sendMessage = async () => {
    const message = draft.trim();
    if (!message && !imageDraft) {
      showMsg("כתוב הודעה או צרף תמונה לפני שליחה");
      return;
    }
    setLoading(true);
    const res = await mgmtCall("sendSuperMessage", {
      from: "סופר אדמין",
      to: SUPER_MESSAGE_TARGET.username,
      toName: SUPER_MESSAGE_TARGET.name,
      message,
      image: imageDraft ? {
        name: imageDraft.name,
        mimeType: imageDraft.mimeType,
        data: imageDraft.data,
        fallbackData: imageDraft.fallbackData
      } : undefined
    });
    let saved = res?.success;
    let fallbackMessage = null;
    const needsImageFallback = !!imageDraft && (!saved || (saved && !res?.imageUrl && !res?.imageFileId && !res?.imageData));
    if ((!saved && !imageDraft && res?.error === "unknown action") || needsImageFallback) {
      const now = new Date();
      fallbackMessage = {
        id: `local-${now.getTime()}`,
        createdAt: now.toISOString(),
        from: "סופר אדמין",
        to: SUPER_MESSAGE_TARGET.username,
        toName: SUPER_MESSAGE_TARGET.name,
        message: message || "תמונה",
        reply: "",
        replyAt: "",
        status: "open",
        imageData: imageDraft?.fallbackData || "",
        imageName: imageDraft?.name || "",
        imageMime: imageDraft?.mimeType || ""
      };
      const fallback = await mgmtCall("appendMgmtRow", {
        sheet: "הודעות",
        row: [
          fallbackMessage.id,
          fallbackMessage.createdAt,
          fallbackMessage.from,
          fallbackMessage.to,
          fallbackMessage.toName,
          fallbackMessage.message,
          "",
          "",
          "open",
          "",
          "",
          fallbackMessage.imageName,
          fallbackMessage.imageMime,
          fallbackMessage.imageData
        ]
      });
      saved = fallback?.success;
    }
    if (saved) {
      setDraft("");
      setImageDraft(null);
      showMsg("ההודעה נשמרה ונשלחה לאור");
      if (fallbackMessage) setMessages(prev => [fallbackMessage, ...prev]);
      else await loadMessages();
    } else {
      showMsg("שמירת ההודעה נכשלה");
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{background:C2.white,borderRadius:16,padding:16,marginBottom:14,border:`1px solid ${C2.border}`,boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
        <div style={{fontSize:16,fontWeight:900,color:C2.text,marginBottom:4}}>הודעה לאור מוסה</div>
        <div style={{fontSize:12,fontWeight:800,color:C2.muted,marginBottom:12}}>השורה נשמרת בגליון הסופר־אדמין ונמחקת אוטומטית אחרי שעה</div>
        <textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={4} placeholder="כתוב הודעה..." style={{...inp2,resize:"vertical",marginBottom:12}}/>
        <input ref={imageInputRef} type="file" accept="image/*" onChange={e=>chooseImage(e.target.files?.[0])} style={{display:"none"}}/>
        {imageDraft&&(
          <div style={{marginBottom:12,border:`1px solid ${C2.border}`,borderRadius:14,overflow:"hidden",background:"#f5f9ff"}}>
            <img src={imageDraft.previewUrl} alt="" style={{width:"100%",maxHeight:260,objectFit:"contain",display:"block",background:"#fff"}}/>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"8px 10px"}}>
              <div style={{fontSize:11,fontWeight:900,color:C2.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{imageDraft.name}</div>
              <Press onClick={()=>setImageDraft(null)} style={{padding:"6px 10px",borderRadius:10,background:"#ffebee",color:C2.red,fontWeight:900,fontSize:11}}>הסר</Press>
            </div>
          </div>
        )}
        <div style={{display:"flex",gap:8}}>
          <Press onClick={sendMessage} style={{flex:1,padding:"13px",borderRadius:14,background:`linear-gradient(135deg,${C2.blue},#42a5f5)`,color:"#fff",fontWeight:900,fontSize:14,textAlign:"center"}}>
            {loading ? "שומר..." : "שלח הודעה"}
          </Press>
          <Press onClick={()=>imageInputRef.current?.click()} style={{padding:"13px 16px",borderRadius:14,background:"#e3f2fd",color:C2.blue,fontWeight:900,fontSize:14}}>תמונה</Press>
          <Press onClick={loadMessages} style={{padding:"13px 16px",borderRadius:14,background:"#f0f4f8",color:C2.blue,fontWeight:900,fontSize:14}}>רענן</Press>
        </div>
      </div>
      {messages.length===0 ? (
        <div style={{background:C2.white,borderRadius:16,padding:26,textAlign:"center",color:C2.muted,fontWeight:800,border:`1px solid ${C2.border}`}}>אין הודעות פעילות</div>
      ) : messages.map(msg=>(
        <div key={msg.id} style={{background:C2.white,borderRadius:16,padding:14,marginBottom:10,border:`1px solid ${msg.reply ? "#c8e6c9" : C2.border}`,boxShadow:"0 2px 12px rgba(0,0,0,0.05)"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:10,marginBottom:8}}>
            <div style={{fontSize:12,fontWeight:900,color:C2.blue}}>{msg.toName || SUPER_MESSAGE_TARGET.name}</div>
            <div style={{fontSize:11,fontWeight:800,color:C2.muted}}>{msg.createdAt}</div>
          </div>
          <div style={{fontSize:14,fontWeight:800,color:C2.text,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{msg.message}</div>
          {superMessageImageSrc(msg)&&(
            <a href={msg.imageFileUrl || superMessageImageSrc(msg)} target="_blank" rel="noreferrer" style={{display:"block",marginTop:10,borderRadius:14,overflow:"hidden",border:`1px solid ${C2.border}`,background:"#f5f9ff"}}>
              <img src={superMessageImageSrc(msg)} alt="" style={{width:"100%",maxHeight:260,objectFit:"contain",display:"block",background:"#fff"}}/>
            </a>
          )}
          {msg.reply ? (
            <div style={{marginTop:10,background:"#e8f5e9",borderRadius:12,padding:10,color:C2.green,fontSize:13,fontWeight:800,lineHeight:1.5}}>
              תשובת אור: {msg.reply}
              {superMessageReplyImageSrc(msg)&&(
                <a href={msg.replyImageFileUrl || superMessageReplyImageSrc(msg)} target="_blank" rel="noreferrer" style={{display:"block",marginTop:8,borderRadius:12,overflow:"hidden",border:"1px solid #c8e6c9",background:"#fff"}}>
                  <img src={superMessageReplyImageSrc(msg)} alt="" style={{width:"100%",maxHeight:240,objectFit:"contain",display:"block",background:"#fff"}}/>
                </a>
              )}
              {!superMessageReplyImageSrc(msg)&&String(msg.reply || "").trim()==="תמונה"&&(
                <div style={{marginTop:8,background:"#fff8e1",border:"1px solid #ffe082",borderRadius:10,padding:"7px 9px",color:C2.orange,fontSize:11,fontWeight:900}}>
                  תמונה לא נשמרה - צריך לפרוס את הסקריפט המעודכן
                </div>
              )}
              {msg.replyAt&&<div style={{fontSize:10,color:C2.muted,marginTop:4}}>{msg.replyAt}</div>}
            </div>
          ) : (
            <div style={{marginTop:10,background:"#fff8e1",borderRadius:99,padding:"6px 12px",display:"inline-block",color:C2.orange,fontSize:11,fontWeight:900}}>ממתין לתשובה</div>
          )}
        </div>
      ))}
    </div>
  );
}

function SuperMessageInbox({ user, C, showToast, showHomeCue=false, inline=false }) {
  const [messages, setMessages] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [replyImages, setReplyImages] = useState({});
  const [open, setOpen] = useState(true);
  const [panelVisible, setPanelVisible] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const isTarget = isSuperMessageTargetUser(user);

  const loadMessages = async () => {
    if (!isTarget) return;
    setFetchError("");
    const res = await mgmtCall("getSuperMessages", { to: "" });
    if (res?.messages) {
      const nextMessages = res.messages.filter(isSuperMessageForTarget);
      setMessages(nextMessages);
      if (!nextMessages.some(m => !m.reply)) setPanelVisible(false);
    } else if (res?.error) {
      setFetchError(String(res.error));
    }
  };

  useEffect(() => {
    if (!isTarget) return;
    loadMessages();
    const timer = setInterval(loadMessages, 60000);
    return () => clearInterval(timer);
  }, [isTarget]);

  const chooseReplyImage = async (msgId, file, input) => {
    if (!file) return;
    try {
      const image = await prepareSuperMessageImage(file);
      setReplyImages(x => ({...x, [msgId]: image}));
      showToast?.("תמונה צורפה");
    } catch (e) {
      showToast?.("בחירת התמונה נכשלה");
    } finally {
      if (input) input.value = "";
    }
  };

  const reply = async (msg) => {
    const text = String(drafts[msg.id] || "").trim();
    const image = replyImages[msg.id] || null;
    if (!text && !image) {
      showToast?.("כתוב תשובה או צרף תמונה לפני שליחה");
      return;
    }
    setPanelVisible(false);
    setDrafts(x=>({...x,[msg.id]:""}));
    setReplyImages(x=>({...x,[msg.id]:null}));
    setMessages(x=>x.filter(m=>m.id!==msg.id));
    showToast?.("התשובה נשלחת ברקע");
    mgmtCall("replySuperMessage", {
      id: msg.id,
      to: msg.to || SUPER_MESSAGE_TARGET.username,
      reply: image ? "" : text,
      replyText: image ? text : "",
      requiresReplyImage: !!image,
      replyImage: image ? {
        name: image.name,
        mimeType: image.mimeType,
        data: image.data,
        fallbackData: image.fallbackData
      } : undefined
    })
      .then(res => {
        const imageSaved = !image || !!(res?.replyImageStored || res?.replyImageUrl || res?.replyImageFileId || res?.replyImageData);
        if (res?.success && imageSaved) {
          showToast?.("התשובה נשמרה");
          loadMessages();
        } else {
          setMessages(x=>[msg, ...x.filter(m=>m.id!==msg.id)]);
          setPanelVisible(true);
          setDrafts(x=>({...x,[msg.id]:text}));
          setReplyImages(x=>({...x,[msg.id]:image}));
          showToast?.(image ? "שמירת תמונת התשובה נכשלה" : "שמירת התשובה נכשלה");
        }
      })
      .catch(() => {
        setMessages(x=>[msg, ...x.filter(m=>m.id!==msg.id)]);
        setPanelVisible(true);
        setDrafts(x=>({...x,[msg.id]:text}));
        setReplyImages(x=>({...x,[msg.id]:image}));
        showToast?.("שמירת התשובה נכשלה");
      });
  };

  if (!isTarget) return null;
  const active = messages.filter(m=>!m.reply);
  const showPanel = showHomeCue && panelVisible && active.length > 0;
  const activeMessageRows = active.map(msg=>(
    <div key={msg.id} style={{padding:12,borderRadius:14,background:"#f5f9ff",border:"1px solid #d7e6f7",marginBottom:10}}>
      <div style={{fontSize:13,fontWeight:900,color:C.text,lineHeight:1.55,whiteSpace:"pre-wrap",marginBottom:10}}>{msg.message}</div>
      {superMessageImageSrc(msg)&&(
        <a href={msg.imageFileUrl || superMessageImageSrc(msg)} target="_blank" rel="noreferrer" style={{display:"block",marginBottom:10,borderRadius:14,overflow:"hidden",border:"1px solid #d7e6f7",background:"#fff"}}>
          <img src={superMessageImageSrc(msg)} alt="" style={{width:"100%",maxHeight:300,objectFit:"contain",display:"block",background:"#fff"}}/>
        </a>
      )}
      <textarea value={drafts[msg.id]||""} onChange={e=>setDrafts(x=>({...x,[msg.id]:e.target.value}))} placeholder="כתוב תשובה..." rows={2} style={{width:"100%",border:"1px solid #d7e6f7",borderRadius:12,padding:10,fontSize:13,fontFamily:"inherit",resize:"none",marginBottom:8}}/>
      {replyImages[msg.id]?.previewUrl&&(
        <div style={{marginBottom:8,border:"1px solid #d7e6f7",borderRadius:12,overflow:"hidden",background:"#fff"}}>
          <img src={replyImages[msg.id].previewUrl} alt="" style={{width:"100%",maxHeight:210,objectFit:"contain",display:"block",background:"#fff"}}/>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"7px 9px"}}>
            <div style={{fontSize:11,fontWeight:900,color:C.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{replyImages[msg.id].name}</div>
            <Press onClick={()=>setReplyImages(x=>({...x,[msg.id]:null}))} style={{padding:"5px 9px",borderRadius:9,background:"#ffebee",color:C.red,fontSize:11,fontWeight:900}}>הסר</Press>
          </div>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1.4fr",gap:8}}>
        <label style={{padding:"10px",borderRadius:12,background:"#e3f2fd",color:C.blue,fontWeight:900,fontSize:12,textAlign:"center",cursor:"pointer"}}>
          תמונה
          <input type="file" accept="image/*" onChange={e=>chooseReplyImage(msg.id, e.target.files?.[0], e.target)} style={{display:"none"}}/>
        </label>
        <label style={{padding:"10px",borderRadius:12,background:"#fff8e1",color:C.orange,fontWeight:900,fontSize:12,textAlign:"center",cursor:"pointer"}}>
          צלם
          <input type="file" accept="image/*" capture="environment" onChange={e=>chooseReplyImage(msg.id, e.target.files?.[0], e.target)} style={{display:"none"}}/>
        </label>
        <Press onClick={()=>reply(msg)} style={{padding:"10px",borderRadius:12,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:900,fontSize:13,textAlign:"center"}}>שלח תשובה</Press>
      </div>
    </div>
  ));

  return (
    <>
    {showHomeCue&&(
      <Press onClick={async()=>{await loadMessages();setPanelVisible(true);haptic();if(!active.length&&!fetchError) showToast?.("אין הודעות פעילות כרגע");}} style={{position:inline?"relative":"fixed",top:inline?undefined:92,left:inline?undefined:14,zIndex:1180,display:"inline-flex",alignItems:"center",gap:8,padding:inline?"8px 12px":"9px 13px",borderRadius:14,background:active.length?"linear-gradient(135deg,#ef4444,#f97316)":"rgba(255,255,255,0.88)",color:active.length?"#fff":C.blue,border:`1px solid ${active.length?"rgba(255,255,255,0.35)":C.border}`,boxShadow:inline?"0 10px 24px rgba(15,23,42,0.12)":"0 14px 32px rgba(15,23,42,0.16)",fontSize:12,fontWeight:900,backdropFilter:"blur(14px)",whiteSpace:"nowrap"}}>
        <span>בוא נראה מה עכשיו</span>
        {active.length>0&&<span style={{minWidth:20,height:20,borderRadius:99,background:"#fff",color:C.red,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900}}>{active.length}</span>}
      </Press>
    )}
    {showHomeCue&&fetchError&&(
      <div style={{position:"fixed",top:136,left:14,zIndex:1180,maxWidth:250,padding:"7px 10px",borderRadius:12,background:"#fff8e1",border:"1px solid #ffe082",color:C.orange,fontSize:11,fontWeight:900,boxShadow:"0 10px 24px rgba(15,23,42,0.12)"}}>
        חיבור הודעות לא זמין בסקריפט הפרוס
      </div>
    )}
    {showPanel&&typeof document !== "undefined"&&createPortal(<div style={{position:"fixed",inset:0,zIndex:1200,display:"flex",alignItems:"flex-end",justifyContent:"center",padding:"0 12px calc(92px + env(safe-area-inset-bottom, 0px))",pointerEvents:"none"}}>
      <div style={{width:"100%",maxWidth:430,maxHeight:"min(72vh, 560px)",background:"rgba(255,255,255,0.97)",border:`2px solid ${C.blue}`,borderRadius:22,boxShadow:"0 24px 80px rgba(15,23,42,0.24)",overflow:"hidden",pointerEvents:"auto",touchAction:"pan-y"}}>
      <div style={{padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,background:"#e3f2fd"}}>
        <div style={{fontWeight:900,fontSize:14,color:C.text}}>הודעות מסופר־אדמין</div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{background:C.red,color:"#fff",borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:900}}>{active.length}</div>
          <Press onClick={()=>setPanelVisible(false)} style={{width:30,height:30,borderRadius:99,background:"rgba(255,255,255,0.82)",border:`1px solid ${C.border}`,color:C.muted,fontSize:18,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center"}}>×</Press>
        </div>
      </div>
      {open&&<div style={{padding:12,maxHeight:"calc(min(72vh, 560px) - 55px)",overflowY:"auto",WebkitOverflowScrolling:"touch",overscrollBehavior:"contain",touchAction:"pan-y"}}>
        {activeMessageRows}
      </div>}
      </div>
    </div>, document.body)}
    </>
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
  const emptyClientForm = {name:"",contact:"",phone:"",email:"",plan:"PRO",status:"פעיל",sheetId:"",notes:"",logoUrl:"",appName:"",shortName:"",icon192Url:"",icon512Url:"",appleIconUrl:"",themeColor:DEFAULT_THEME_COLOR,backgroundColor:DEFAULT_THEME_COLOR};
  const [newClient, setNewClient] = useState(emptyClientForm);
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
  const clientFormRow = (f, id = Date.now(), preserved = []) => [
    id, f.name || "", f.contact || "", f.phone || "", f.email || "", f.plan || "PRO", f.status || "פעיל", f.sheetId || "",
    ...(preserved.length ? preserved : ["","","","","",""]),
    f.notes || "", f.logoUrl || "", f.appName || f.name || "", f.shortName || f.appName || f.name || "",
    f.icon192Url || "", f.icon512Url || "", f.appleIconUrl || "",
    f.themeColor || DEFAULT_THEME_COLOR, f.backgroundColor || f.themeColor || DEFAULT_THEME_COLOR
  ];

  const ClientForm = ({data, onSave, onCancel}) => {
    const [f, setF] = useState(data);
    const brandPreview = normalizeBranding({...f, name:f.name || data?.name});
    return (
      <div style={{background:C2.white,borderRadius:16,padding:16,marginBottom:16,border:`1px solid ${C2.border}`}}>
        {[["name","שם חברה *"],["contact","איש קשר"],["phone","טלפון"],["email","מייל"],["sheetId","Sheet ID"],["appName","שם אפליקציה למסך הבית"],["shortName","שם קצר"],["logoUrl","URL לוגו בתוך האפליקציה"],["icon192Url","Icon 192 PNG"],["icon512Url","Icon 512 PNG"],["appleIconUrl","Apple touch icon PNG"]].map(([k,lbl])=>(
          <div key={k} style={{marginBottom:10}}>
            <label style={{fontSize:11,fontWeight:700,color:C2.muted,display:"block",marginBottom:4}}>{lbl}</label>
            <input value={f[k]||""} onChange={e=>setF(x=>({...x,[k]:e.target.value}))} style={inp2} placeholder={lbl}/>
          </div>
        ))}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          {[["themeColor","צבע ראשי"],["backgroundColor","צבע רקע"]].map(([k,lbl])=>(
            <div key={k}>
              <label style={{fontSize:11,fontWeight:700,color:C2.muted,display:"block",marginBottom:4}}>{lbl}</label>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input type="color" value={f[k]||DEFAULT_THEME_COLOR} onChange={e=>setF(x=>({...x,[k]:e.target.value}))} style={{width:44,height:38,border:"0",background:"transparent",padding:0}}/>
                <input value={f[k]||""} onChange={e=>setF(x=>({...x,[k]:e.target.value}))} style={{...inp2,padding:"9px 10px"}} placeholder="#1565c0"/>
              </div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,background:"#f5f9ff",border:`1px solid ${C2.border}`,borderRadius:14,padding:12,marginBottom:12}}>
          <div style={{width:46,height:46,borderRadius:12,background:brandPreview.themeColor,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:20,fontWeight:900}}>
            {brandPreview.appleIconUrl ? <img src={brandPreview.appleIconUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : "🌊"}
          </div>
          <div style={{minWidth:0}}>
            <div style={{fontSize:12,fontWeight:900,color:C2.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{brandPreview.name}</div>
            <div style={{fontSize:11,fontWeight:700,color:C2.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{brandPreview.shortName}</div>
          </div>
        </div>
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
      <div dir="rtl" className="galileo-ios-sheet" style={{position:"relative",background:"#f0f7ff",transform:vis?"translateY(0)":"translateY(100%)",transition:"transform 0.4s cubic-bezier(0.34,1.2,0.64,1)",height:"100vh",display:"flex",flexDirection:"column",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
        <IPhoneComfortLayer/>
        <div style={{background:`linear-gradient(145deg,#0d47a1,#1565c0,#1976d2)`,padding:"calc(28px + env(safe-area-inset-top, 0px)) 20px 20px",position:"relative",overflow:"hidden",flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative"}}>
            <div>
              <div style={{color:"rgba(255,255,255,0.55)",fontSize:11,fontWeight:700,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:4}}>Super Admin</div>
              <div style={{color:"#fff",fontSize:22,fontWeight:900}}>POOLMANG.BY.OR2026</div>
              <div style={{color:"rgba(255,255,255,0.82)",fontSize:12,fontWeight:800,marginTop:3}}>בעלים רשמי: {OFFICIAL_INTERFACE_OWNER}</div>
              {auth&&<div style={{color:"rgba(255,255,255,0.6)",fontSize:12,marginTop:2}}>{clients.length} לקוחות · {pendingCount} תקלות ממתינות</div>}
            </div>
            <div style={{display:"flex",gap:8}}>
              {auth&&<Press onClick={()=>{loadData();haptic();}} style={{background:"rgba(255,255,255,0.15)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:12,padding:"8px 12px",color:"#fff",fontSize:13,fontWeight:700}}>🔄</Press>}
              <Press onClick={close} style={{width:36,height:36,borderRadius:"50%",background:"rgba(255,255,255,0.15)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:16}}>✕</Press>
            </div>
          </div>
        </div>
        {toast2&&<div style={{position:"fixed",bottom:"calc(90px + env(safe-area-inset-bottom, 0px))",left:"50%",transform:"translateX(-50%)",background:"#0d47a1",color:"#fff",borderRadius:99,padding:"10px 22px",fontSize:13,fontWeight:700,zIndex:999,whiteSpace:"nowrap",boxShadow:"0 8px 24px rgba(13,71,161,0.4)"}}>{toast2}</div>}
        {!auth?(
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
            <div style={{background:"#fff",borderRadius:24,padding:28,width:"100%",maxWidth:340,boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}}>
              <div style={{fontSize:48,textAlign:"center",marginBottom:12}}>🔐</div>
              <div style={{fontWeight:900,fontSize:18,color:C2.text,textAlign:"center",marginBottom:20}}>כניסה מאובטחת</div>
              <div style={{fontWeight:800,fontSize:12,color:C2.muted,textAlign:"center",margin:"-12px 0 16px"}}>גישה לבעלים הרשמי: {OFFICIAL_INTERFACE_OWNER}</div>
              <input type="password" value={pass} onChange={e=>{setPass(e.target.value);setErr("");}} placeholder="סיסמה סודית" style={{...inp2,marginBottom:err?8:16}} onKeyDown={e=>e.key==="Enter"&&login()}/>
              {err&&<div style={{background:"#ffebee",borderRadius:10,padding:"8px 14px",marginBottom:12,color:C2.red,fontSize:13,fontWeight:700,textAlign:"center"}}>⚠️ {err}</div>}
              <Press onClick={login} style={{padding:"14px",borderRadius:14,background:`linear-gradient(135deg,${C2.blue},#42a5f5)`,color:"#fff",fontWeight:900,fontSize:15,textAlign:"center",boxShadow:"0 6px 20px rgba(21,101,192,0.4)"}}>כניסה →</Press>
            </div>
          </div>
        ):(
          <>
            <div style={{background:C2.white,padding:"8px 12px",borderBottom:`1px solid ${C2.border}`,display:"flex",gap:6,flexShrink:0,overflowX:"auto",boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
              {[["issues",`🔧 תקלות${pendingCount>0?` (${pendingCount})`:""}`],["clients","👥 לקוחות"],["messages","הודעות"],["licenses","🔑 רישיונות"],["stats","📊 סטטיסטיקות"],["settings","⚙️ הגדרות"]].map(([t,lbl])=>(
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
                  {showAddClient&&<ClientForm data={newClient} onCancel={()=>setShowAddClient(false)} onSave={async(f)=>{ if(!f.name?.trim()){showMsg("⚠️ נא להזין שם חברה");return;} await saveClient(clientFormRow(f)); setNewClient(emptyClientForm); setShowAddClient(false); }}/>}
                  {clients.length===0&&!showAddClient&&<div style={{background:C2.white,borderRadius:16,padding:32,textAlign:"center",color:C2.muted}}><div style={{fontSize:32,marginBottom:8}}>👥</div><div style={{fontWeight:700}}>אין לקוחות עדיין</div></div>}
                  {clients.map((c,i)=>(
                    <div key={i}>
                      {editClient===i?(
                        <ClientForm data={{name:c[1],contact:c[2],phone:c[3],email:c[4],plan:c[5],status:c[6],sheetId:c[7],notes:c[14],logoUrl:c[15]||"",appName:c[16]||c[1]||"",shortName:c[17]||c[1]||"",icon192Url:c[18]||"",icon512Url:c[19]||"",appleIconUrl:c[20]||"",themeColor:c[21]||DEFAULT_THEME_COLOR,backgroundColor:c[22]||c[21]||DEFAULT_THEME_COLOR}} onCancel={()=>setEditClient(null)} onSave={async(f)=>{ const row=clientFormRow(f,c[0],c.slice(8,14)); await saveClient(row); setEditClient(null); }}/>
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
              {tab==="messages"&&!loading&&<SuperAdminMessagesTab C2={C2} inp2={inp2} showMsg={showMsg}/>}
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
  const isIOS = isIOSDevice();
  const [showSetup, setShowSetup] = useState(()=>{
    const lic = getLicense();
    if(lic.key && lic.sheetId) return false;
    try { const cached = localStorage.getItem("galileo_cache"); if(cached && JSON.parse(cached)?.users?.length) return false; } catch {}
    return true;
  });
  const [companyName, setCompanyName] = useState(company.name||DEFAULT_APP_NAME);
  const [user,setUser] = useState(()=>getStoredUserForToday());
  const [subOperatorLanguage,setSubOperatorLanguage] = useState(()=>{
    try {
      return localStorage.getItem(subOperatorLanguageStorageKey(getStoredUserForToday())) === "en" ? "en" : "he";
    } catch {
      return "he";
    }
  });
  const [showSubLanguagePrompt,setShowSubLanguagePrompt] = useState(false);
  const [welcomeMedia,setWelcomeMedia] = useState(null);
  const [showDailyBriefing,setShowDailyBriefing] = useState(false);
  const [showEquipmentChecklistEditor,setShowEquipmentChecklistEditor] = useState(false);
  const [equipmentChecklist,setEquipmentChecklist] = useState(()=>loadEquipmentChecklist(getStoredUserForToday()?.username || getStoredUserForToday()?.name || "default"));
  const [equipmentChecklistDraft,setEquipmentChecklistDraft] = useState(()=>checklistToText(loadEquipmentChecklist(getStoredUserForToday()?.username || getStoredUserForToday()?.name || "default")));
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
  const [appUpdate,setAppUpdate] = useState({checking:false,available:false,latest:"",error:false});
  const [sheetId,setSheetId] = useState(() => getConfiguredSheetId() ? "connected" : "");
  const [dataConnectionStatus,setDataConnectionStatus] = useState(() =>
    typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "checking"
  );
  const [waMessageTemplate,setWaMessageTemplate] = useState(() => {
    try { return normalizeWaMessageTemplate(localStorage.getItem(WA_TEMPLATE_STORAGE_KEY)); } catch { return DEFAULT_WA_MESSAGE_TEMPLATE; }
  });
  const [waTemplateDraft,setWaTemplateDraft] = useState(() => {
    try { return normalizeWaMessageTemplate(localStorage.getItem(WA_TEMPLATE_STORAGE_KEY)); } catch { return DEFAULT_WA_MESSAGE_TEMPLATE; }
  });
  const [acidSupplyMessage,setAcidSupplyMessage] = useState(() => {
    try { return normalizeAcidSupplyMessage(localStorage.getItem(WA_ACID_SUPPLY_MESSAGE_STORAGE_KEY)); } catch { return DEFAULT_ACID_SUPPLY_MESSAGE; }
  });
  const [acidSupplyMessageDraft,setAcidSupplyMessageDraft] = useState(() => {
    try { return normalizeAcidSupplyMessage(localStorage.getItem(WA_ACID_SUPPLY_MESSAGE_STORAGE_KEY)); } catch { return DEFAULT_ACID_SUPPLY_MESSAGE; }
  });
  const [phUpSupplyMessage,setPhUpSupplyMessage] = useState(() => {
    try { return normalizePhUpSupplyMessage(localStorage.getItem(WA_PH_UP_SUPPLY_MESSAGE_STORAGE_KEY)); } catch { return DEFAULT_PH_UP_SUPPLY_MESSAGE; }
  });
  const [phUpSupplyMessageDraft,setPhUpSupplyMessageDraft] = useState(() => {
    try { return normalizePhUpSupplyMessage(localStorage.getItem(WA_PH_UP_SUPPLY_MESSAGE_STORAGE_KEY)); } catch { return DEFAULT_PH_UP_SUPPLY_MESSAGE; }
  });
  const [saltSupplyMessage,setSaltSupplyMessage] = useState(() => {
    try { return normalizeSaltSupplyMessage(localStorage.getItem(WA_SALT_SUPPLY_MESSAGE_STORAGE_KEY)); } catch { return DEFAULT_SALT_SUPPLY_MESSAGE; }
  });
  const [saltSupplyMessageDraft,setSaltSupplyMessageDraft] = useState(() => {
    try { return normalizeSaltSupplyMessage(localStorage.getItem(WA_SALT_SUPPLY_MESSAGE_STORAGE_KEY)); } catch { return DEFAULT_SALT_SUPPLY_MESSAGE; }
  });
  const [chlorineReminderMessage,setChlorineReminderMessage] = useState(() => {
    try { return normalizeChlorineReminderMessage(localStorage.getItem(WA_TABLET_REMINDER_STORAGE_KEY)); } catch { return DEFAULT_CHLORINE_TABLET_REMINDER_MESSAGE; }
  });
  const [chlorineReminderMessageDraft,setChlorineReminderMessageDraft] = useState(() => {
    try { return normalizeChlorineReminderMessage(localStorage.getItem(WA_TABLET_REMINDER_STORAGE_KEY)); } catch { return DEFAULT_CHLORINE_TABLET_REMINDER_MESSAGE; }
  });
  const [waterLevelNoticeMessage,setWaterLevelNoticeMessage] = useState(() => {
    try { return normalizeWaterLevelNoticeMessage(localStorage.getItem(WA_WATER_LEVEL_NOTICE_STORAGE_KEY)); } catch { return DEFAULT_WATER_LEVEL_NOTICE_MESSAGE; }
  });
  const [waterLevelNoticeMessageDraft,setWaterLevelNoticeMessageDraft] = useState(() => {
    try { return normalizeWaterLevelNoticeMessage(localStorage.getItem(WA_WATER_LEVEL_NOTICE_STORAGE_KEY)); } catch { return DEFAULT_WATER_LEVEL_NOTICE_MESSAGE; }
  });
  const [waDisabledClients,setWaDisabledClients] = useState(() => {
    try {
      const value = JSON.parse(localStorage.getItem(WA_DISABLED_CLIENTS_STORAGE_KEY) || "[]");
      return Array.isArray(value)
        ? value.map(item => String(item || "").trim()).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  });
  const [clientPlan,setClientPlan] = useState({plan:"",status:""});
  const [allUsers,setAllUsers] = useState(DEMO_USERS);
  const [clients,setClients] = useState(DEMO_CLIENTS);
  const [tasks,setTasks] = useState([]);
  const tasksRef = useRef(tasks);
  const [adminOrders,setAdminOrders] = useState([]);
  const [sharedSubOrders,setSharedSubOrders] = useState([]);
  const [subOperatorApprovals,setSubOperatorApprovals] = useState([]);
  const [supplyDB,setSupplyDB] = useState({});
  const [lastReadings,setLastReadings] = useState({});
const [reports,setReports] = useState([]);
const [completedReports,setCompletedReports] = useState(() => {
  try {
    return JSON.parse(localStorage.getItem("galileo_completed_reports") || "[]");
  } catch {
    return [];
  }
});

const [pending, setPending] = useState([]);
const [pendingStoreReady, setPendingStoreReady] = useState(false);
const [pendingOperatorIssues, setPendingOperatorIssues] = useState(() => {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_OPERATOR_ISSUES_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
});
const pendingRef = useRef(pending);
const pendingOperatorIssuesRef = useRef(pendingOperatorIssues);
const pendingReportSyncRunnerRef = useRef(null);
const pendingIssueSyncRunnerRef = useRef(null);
const [pendingSubReports, setPendingSubReports] = useState(() => {
  try {
    const value = JSON.parse(localStorage.getItem("galileo_sub_operator_pending_reports") || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
});
const [deferredSubReportIds, setDeferredSubReportIds] = useState(() => {
  try {
    const value = JSON.parse(localStorage.getItem("galileo_deferred_sub_report_ids") || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
});
const [activeSubReportApprovalId, setActiveSubReportApprovalId] = useState("");
const [approvalEditId, setApprovalEditId] = useState("");

useEffect(() => {
  tasksRef.current = tasks;
}, [tasks]);

useEffect(() => {
  pendingRef.current = pending;
}, [pending]);

useEffect(() => {
  pendingOperatorIssuesRef.current = pendingOperatorIssues;
}, [pendingOperatorIssues]);

useEffect(() => {
  try {
    localStorage.setItem(PENDING_OPERATOR_ISSUES_STORAGE_KEY, JSON.stringify(pendingOperatorIssues));
  } catch (error) {
    console.warn("Pending operator issue persistence failed", error);
  }
}, [pendingOperatorIssues]);

useEffect(() => {
  try {
    localStorage.setItem(WA_DISABLED_CLIENTS_STORAGE_KEY, JSON.stringify([...new Set(waDisabledClients)]));
  } catch {}
}, [waDisabledClients]);

const getPendingReportPayload = (item) => item?.report ? item.report : item;
const getPendingSupplyUpdate = (item) => item?.report ? item.supplyUpdate : undefined;
const isPendingReportSavedToSheet = (item) => !!(item?.report && item.savedToSheet);
const getPendingUpdateOriginal = (item) => item?.report ? item.updateOriginal : undefined;
const NO_TREATMENT_NOTE = "\u05dc\u05d0 \u05d1\u05d5\u05e6\u05e2 \u05d8\u05d9\u05e4\u05d5\u05dc";
const isNoTreatmentReport = (report = {}) =>
  report?.missedTreatment === true || String(report?.notes || "").includes(NO_TREATMENT_NOTE);
const isCompletedTreatmentReport = (report = {}) =>
  !isNoTreatmentReport(report) &&
  String(report?.chlorine ?? "").trim() !== "" &&
  String(report?.ph ?? "").trim() !== "" &&
  String(report?.flow ?? "").trim() !== "";
const shouldSendEditedReportToCustomer = (original, report) =>
  !report?.waterCheckOnly &&
  (!!original?.sendWhatsAppOnSave || (isNoTreatmentReport(original) && isCompletedTreatmentReport(report)));
const pendingReportWantsWhatsApp = (item, report) => {
  if (report?.waterCheckOnly) return false;
  if (!item?.report) return true;
  if (item.deliveryDecision?.version) return item.deliveryDecision.shouldSend === true;
  if (["disabled","not_requested","missing_phone","already_sent"].includes(item.whatsappSkipReason)) return false;
  if (item.sendWhatsAppOnSave === false) return false;
  if (item.sendWhatsAppOnSave === true) return true;
  if (item.updateOriginal) return shouldSendEditedReportToCustomer(item.updateOriginal, report) || item.sendWhatsAppOnSave !== false;
  return true;
};
const shouldSendPendingReportWhatsApp = (item, report) =>
  !item?.whatsappSent && pendingReportWantsWhatsApp(item, report);
const pendingReportNeedsTaskCompletion = (item) =>
  !!item?.taskCompletion?.required && item.taskCompletion.synced !== true;
const pendingReportQueueInfo = (item) => {
  const report = getPendingReportPayload(item) || {};
  const savedToSheet = isPendingReportSavedToSheet(item);
  const wantsWhatsApp = pendingReportWantsWhatsApp(item, report);
  const whatsAppDisabled = item?.deliveryDecision?.version
    ? item.deliveryDecision.skipReason === "disabled"
    : isWhatsAppDisabledForClient(report);
  const clientRecord = findClientByName(report.client, report.clientId);
  const phoneMissing = item?.deliveryDecision?.version
    ? item.deliveryDecision.skipReason === "missing_phone"
    : !!clientRecord && !normalizeWhatsAppPhone(clientRecord.phone);
  const whatsAppSent = !!item?.whatsappSent;
  const deliveryUnknown = item?.lastError === "delivery_status_unknown";

  if (item?.editingPaused) {
    return {
      stage:"editing",
      keep:true,
      label:"פתוח לעריכה · הסנכרון מושהה",
      tone:"warning"
    };
  }

  if (!savedToSheet) {
    if (whatsAppSent) {
      return { stage:"sheetPendingMessageSent", keep:true, label:"הודעה נשלחה · ממתין לשמירה בשיטס", tone:"warning" };
    }
    if (whatsAppDisabled) {
      return { stage:"sheetPendingWhatsAppDisabled", keep:true, label:"ווטסאפ כבוי · ממתין לשמירה בשיטס", tone:"warning" };
    }
    if (phoneMissing) {
      return { stage:"sheetPendingMissingPhone", keep:true, label:"אין טלפון · ממתין לשמירה בשיטס", tone:"warning" };
    }
    if (!wantsWhatsApp) {
      return { stage:"sheetPendingNoMessage", keep:true, label:"ללא הודעה · ממתין לשמירה בשיטס", tone:"warning" };
    }
    if (deliveryUnknown) {
      return {
        stage:"sheetPendingMessageUnknown",
        keep:true,
        label:"לא ניתן לוודא אם ההודעה נשלחה · ממתין לשמירה בשיטס",
        tone:"error"
      };
    }
    if (item?.lastError === "whatsapp_send_failed") {
      return { stage:"sheetPendingMessageFailed", keep:true, label:"הודעת ווטסאפ נכשלה · ממתין לשמירה בשיטס", tone:"error" };
    }
    return {
      stage:"sheetPending",
      keep:true,
      label:item?.whatsappSending ? "נשמר מקומית · שולח הודעה" : "נשמר מקומית · ממתין לשליחת הודעה",
      tone:"warning"
    };
  }
  if (report.flow === "לא תקין" && item?.criticalIssueQueued !== true) {
    return {
      stage:"adminIssuePending",
      keep:true,
      label:"נשמר בשיטס · ממתין לשמירת התקלה לאדמין",
      tone:"error"
    };
  }
  if (pendingReportNeedsTaskCompletion(item)) {
    return {
      stage:"taskPending",
      keep:true,
      label:"נשמר בשיטס · מעדכן את המשימה",
      tone:item?.taskCompletion?.lastError ? "error" : "warning"
    };
  }
  if (whatsAppSent) {
    return { stage:"complete", keep:false, label:"נשמר בשיטס · הודעה נשלחה", tone:"success" };
  }
  if (whatsAppDisabled) {
    return { stage:"whatsappDisabled", keep:false, label:"נשמר בשיטס - ווצאפ כבוי", tone:"success" };
  }
  if (phoneMissing && item?.deliveryDecision?.version) {
    return { stage:"missingPhone", keep:false, label:"נשמר בשיטס - אין טלפון", tone:"success" };
  }
  if (!wantsWhatsApp) {
    return { stage:"sheetSaved", keep:false, label:"נשמר בשיטס - ללא הודעה", tone:"success" };
  }
  if (deliveryUnknown) {
    return {
      stage:"messageUnknown",
      keep:true,
      label:"נשמר בשיטס · לא ניתן לוודא אם ההודעה נשלחה",
      tone:"error"
    };
  }
  if (!clientRecord) {
    return { stage:"clientLoading", keep:true, label:"נשמר בשיטס - ממתין לנתוני לקוח", tone:"warning" };
  }
  if (phoneMissing) {
    return { stage:"missingPhone", keep:false, label:"נשמר בשיטס - אין טלפון", tone:"success" };
  }
  return {
    stage:"messagePending",
    keep:true,
    label:item?.lastError === "whatsapp_send_failed" ? "נשמר בשיטס · הודעת ווטסאפ נכשלה" : "נשמר בשיטס · ממתין לשליחת הודעה",
    tone:item?.lastError === "whatsapp_send_failed" ? "error" : "warning"
  };
};
const shouldKeepPendingReport = (item) => pendingReportQueueInfo(item).keep;
const poolIdentityKey = (value = {}, fallbackName = "") => {
  const source = value && typeof value === "object" ? value : {};
  const nameValue = String(source.client || source.name || fallbackName || value || "").trim();
  const id = String(source.clientId || clientIdByName(nameValue) || "").trim();
  if (id) return `id:${id}`;
  const recordId = String(source.id || source.localId || source.reportId || "").trim();
  const name = String(source.client || source.name || fallbackName || value || "").trim().toLowerCase();
  return recordId ? `unresolved:${name}:${recordId}` : `unresolved:${name}`;
};
const samePoolIdentity = (left = {}, right = {}) => {
  const leftName = String(left?.client || left?.name || "").trim();
  const rightName = String(right?.client || right?.name || "").trim();
  const leftId = String(left?.clientId || clientIdByName(leftName) || "").trim();
  const rightId = String(right?.clientId || clientIdByName(rightName) || "").trim();
  if (leftId || rightId) return !!leftId && !!rightId && leftId === rightId;
  const leftRecordId = String(left?.id || left?.localId || left?.reportId || "").trim();
  const rightRecordId = String(right?.id || right?.localId || right?.reportId || "").trim();
  return !!leftRecordId && leftRecordId === rightRecordId &&
    leftName.toLowerCase() === rightName.toLowerCase();
};
const samePendingReport = (a, b) => {
  const leftStorageId = String(a?.pendingStorageId || a?.queueId || "").trim();
  const rightStorageId = String(b?.pendingStorageId || b?.queueId || "").trim();
  if (leftStorageId || rightStorageId) {
    return !!leftStorageId && !!rightStorageId && leftStorageId === rightStorageId;
  }
  const left = getPendingReportPayload(a) || {};
  const right = getPendingReportPayload(b) || {};
  if (left.id || right.id) return !!left.id && !!right.id && String(left.id) === String(right.id);
  return (
    normalizeDate(left.reportDate) === normalizeDate(right.reportDate) &&
    normalizeName(left.operator) === normalizeName(right.operator) &&
    samePoolIdentity(left, right)
  );
};
const pendingReportPayloadFingerprint = (item) => {
  return pendingReportPayloadFingerprintValue(item);
};
const makePendingReportItem = (report, supplyUpdate, meta = {}) => {
  const pendingStorageId = String(meta?.pendingStorageId || pendingReportStorageId(report) || "").trim();
  const queueRevision = String(meta?.queueRevision || "").trim() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const queueUpdatedAt = Number(meta?.queueUpdatedAt || 0) || Date.now();
  return { report, supplyUpdate, ...meta, pendingStorageId, queueRevision, queueUpdatedAt };
};
const nextPendingQueueMeta = (item = {}) => ({
  queueRevision:`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  queueUpdatedAt:Math.max(Date.now(), Number(item?.queueUpdatedAt || 0) + 1)
});
const setPendingEditingPaused = (item, editingPaused) => makePendingReportItem(
  getPendingReportPayload(item),
  getPendingSupplyUpdate(item),
  {
    ...item,
    ...nextPendingQueueMeta(item),
    editingPaused:!!editingPaused,
    replacePendingState:true
  }
);
const mergePendingReportItems = (existing, incoming) => {
  if (incoming?.replacePendingState) return {...incoming, replacePendingState:false};
  if (!existing?.report || !incoming?.report) return incoming;
  if (pendingReportPayloadFingerprint(existing) !== pendingReportPayloadFingerprint(incoming)) return existing;
  return {
    ...existing,
    ...incoming,
    report:incoming.report || existing.report,
    savedToSheet:!!(existing.savedToSheet || incoming.savedToSheet),
    whatsappSent:!!(existing.whatsappSent || incoming.whatsappSent),
    deliveryDecision:existing.deliveryDecision || incoming.deliveryDecision
  };
};
const setPendingReportItem = (item) => {
  setPending(prev => {
    const idx = prev.findIndex(x => samePendingReport(x, item));
    const next = idx < 0 ? [...prev, item] : [...prev];
    if (idx >= 0) next[idx] = mergePendingReportItems(next[idx], item);
    pendingRef.current = next;
    return next;
  });
};
const persistPendingReportItem = async (item, options = {}) => {
  if (!shouldKeepPendingReport(item)) {
    const deleted = await deletePendingReportFromIndexedDBIfUnchanged(item).catch(error => {
      console.warn("Completed pending report cleanup failed", error);
      return false;
    });
    if (deleted) {
      setPending(prev => {
        const next = prev.filter(x =>
          !samePendingReport(x, item) ||
          pendingReportPayloadFingerprint(x) !== pendingReportPayloadFingerprint(item)
        );
        pendingRef.current = next;
        return next;
      });
    }
    return item;
  }
  if (options.durableFirst) {
    await upsertPendingReportInIndexedDB(item);
    setPendingReportItem(item);
  } else {
    setPendingReportItem(item);
    await upsertPendingReportInIndexedDB(item);
  }
  void requestPendingReportBackgroundSync();
  return item;
};
const persistPendingReportBeforeSend = async (report, supplyUpdate, meta = {}) => {
  const item = makePendingReportItem(report, supplyUpdate, meta);
  return persistPendingReportItem(item, {durableFirst:true});
};
const isPendingReportDeletedLocally = (item) => {
  const id = pendingReportStorageId(item);
  return !!id && deletedPendingReportIdsRef.current.has(id);
};
const markPendingReportDeletedLocally = (item) => {
  const id = pendingReportStorageId(item);
  if (id) deletedPendingReportIdsRef.current.add(id);
};
const removePendingReport = async (item) => {
  const id = pendingReportStorageId(item);
  markPendingReportDeletedLocally(item);
  const deleted = await deletePendingReportFromIndexedDBIfUnchanged(item).catch(error => {
    console.warn("Immediate pending report deletion failed", error);
    return false;
  });
  if (!deleted) {
    if (id) deletedPendingReportIdsRef.current.delete(id);
    return false;
  }
  setPending(prev => {
    const next = prev.filter(x =>
      !samePendingReport(x, item) ||
      pendingReportPayloadFingerprint(x) !== pendingReportPayloadFingerprint(item)
    );
    pendingRef.current = next;
    return next;
  });
  return true;
};

useEffect(() => {
  let active = true;
  const legacyPending = (() => {
    try {
      const value = JSON.parse(localStorage.getItem("galileo_pending_reports") || "[]");
      return Array.isArray(value)
        ? value.map(item => ensurePendingReportQueueVersion(item))
        : [];
    } catch {
      return [];
    }
  })();
  const restorePendingItems = (storedItems = []) => {
    if (!active) return;
    const sourceItems = [...legacyPending, ...(storedItems || [])].map(item =>
      item?.editingPaused ? setPendingEditingPaused(item, false) : item
    );
    if (!sourceItems.length) return;
    setPending(previous => {
      const nextPending = sourceItems.reduce((items, storedItem) => {
        const index = items.findIndex(item => samePendingReport(item, storedItem));
        if (index < 0) return [...items, storedItem];
        const next = [...items];
        if (pendingReportPayloadFingerprint(next[index]) === pendingReportPayloadFingerprint(storedItem)) {
          next[index] = mergePendingReportItems(next[index], storedItem);
          return next;
        }
        const existingUpdatedAt = Number(next[index]?.queueUpdatedAt || 0);
        const storedUpdatedAt = Number(storedItem?.queueUpdatedAt || 0);
        if (storedUpdatedAt >= existingUpdatedAt) next[index] = storedItem;
        return next;
      }, previous);
      pendingRef.current = nextPending;
      return nextPending;
    });
  };
  loadPendingReportsFromIndexedDB()
    .then(storedItems => restorePendingItems(storedItems))
    .catch(error => {
      console.warn("Pending report IndexedDB restore failed", error);
      restorePendingItems();
    })
    .finally(() => {
      if (active) setPendingStoreReady(true);
    });
  return () => { active = false; };
}, []);

useEffect(() => {
  if (!pendingStoreReady) return;
  localStorage.setItem("galileo_pending_reports", JSON.stringify(pending));
  void persistPendingReportsToIndexedDB(pending)
    .then(() => pending.length ? requestPendingReportBackgroundSync() : false)
    .catch(error => console.warn("Pending report IndexedDB persistence failed", error));
}, [pending, pendingStoreReady]);

useEffect(() => {
  if (!("serviceWorker" in navigator)) return undefined;
  const onServiceWorkerMessage = event => {
    const message = event?.data || {};
    if (message.type !== "GALILEO_REPORT_SAVED_TO_SHEET" || !message.item) return;
    setPending(previous => {
      const next = previous.flatMap(item => {
        if (!samePendingReport(item, message.item)) return [item];
        if (pendingReportPayloadFingerprint(item) !== pendingReportPayloadFingerprint(message.item)) return [item];
        if (!shouldKeepPendingReport(message.item)) {
          void deletePendingReportFromIndexedDBIfUnchanged(message.item)
            .then(deleted => {
              if (!deleted) return;
              setPending(current => {
                const cleaned = current.filter(candidate =>
                  !samePendingReport(candidate, message.item) ||
                  pendingReportPayloadFingerprint(candidate) !== pendingReportPayloadFingerprint(message.item)
                );
                pendingRef.current = cleaned;
                return cleaned;
              });
            })
            .catch(error => console.warn("Background pending report cleanup failed", error));
          return [mergePendingReportItems(item, message.item)];
        }
        return [mergePendingReportItems(item, message.item)];
      });
      pendingRef.current = next;
      return next;
    });
  };
  navigator.serviceWorker.addEventListener("message", onServiceWorkerMessage);
  return () => navigator.serviceWorker.removeEventListener("message", onServiceWorkerMessage);
}, []);
const makePendingOperatorIssue = (issue = {}) => ({
  localId: issue.localId || `opissue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  operator: issue.operator || "",
  client: issue.client || "",
  clientId: issue.clientId || "",
  desc: issue.desc || "",
  priority: issue.priority || "רגיל",
  date: issue.date || todayStr(),
  createdAt: issue.createdAt || new Date().toISOString(),
  lastAttemptAt: issue.lastAttemptAt || "",
  attemptCount: Number(issue.attemptCount || 0),
  lastError: issue.lastError || ""
});
const pendingOperatorIssueKey = (issue = {}) => String(issue.localId || [issue.operator, issue.client, issue.desc, issue.priority, issue.date].map(normalizeName).join("|"));
const samePendingOperatorIssue = (a = {}, b = {}) => pendingOperatorIssueKey(a) === pendingOperatorIssueKey(b);
const samePendingOperatorIssueContent = (a = {}, b = {}) => {
  const aClientId = String(a.clientId || "").trim();
  const bClientId = String(b.clientId || "").trim();
  const samePool = aClientId || bClientId
    ? !!aClientId && !!bClientId && aClientId === bClientId
    : normalizeName(a.client) === normalizeName(b.client);
  return samePool &&
    normalizeName(a.operator) === normalizeName(b.operator) &&
    normalizeName(a.desc) === normalizeName(b.desc) &&
    normalizeName(a.priority) === normalizeName(b.priority) &&
    normalizeDate(a.date) === normalizeDate(b.date);
};
const operatorIssueToRow = (issue = {}) => [issue.localId || Date.now(), issue.operator || "", issue.client || "", issue.desc || "", issue.priority || "רגיל", "פתוח", "", issue.date || todayStr()];
const commitPendingOperatorIssues = (nextValue) => {
  const current = pendingOperatorIssuesRef.current;
  const next = typeof nextValue === "function" ? nextValue(current) : nextValue;
  const normalized = Array.isArray(next) ? next.map(makePendingOperatorIssue) : [];
  pendingOperatorIssuesRef.current = normalized;
  let persisted = true;
  try {
    localStorage.setItem(PENDING_OPERATOR_ISSUES_STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    persisted = false;
    console.warn("Pending operator issue persistence failed", error);
  }
  setPendingOperatorIssues(normalized);
  return {issues:normalized, persisted};
};
const addPendingOperatorIssue = (issue) => {
  const explicitLocalId = String(issue?.localId || "").trim();
  const matchingQueuedIssue = pendingOperatorIssuesRef.current.find(item => explicitLocalId
    ? samePendingOperatorIssue(item, issue)
    : samePendingOperatorIssueContent(item, issue)
  );
  const item = matchingQueuedIssue || makePendingOperatorIssue(issue);
  const result = commitPendingOperatorIssues(prev => prev.some(x => samePendingOperatorIssue(x, item)) ? prev : [...prev, item]);
  return {...item, _localPersisted:result.persisted};
};
const updatePendingOperatorIssue = (issue, changes) => {
  let updated = makePendingOperatorIssue({...issue, ...changes});
  commitPendingOperatorIssues(prev => prev.map(item => {
    if (!samePendingOperatorIssue(item, issue)) return item;
    updated = makePendingOperatorIssue({...item, ...changes});
    return updated;
  }));
  return updated;
};
const sameReportIdentity = (a = {}, b = {}) => {
  if (a.id && b.id) return String(a.id) === String(b.id);
  return (
    normalizeDate(a.reportDate) === normalizeDate(b.reportDate) &&
    normalizeName(a.operator) === normalizeName(b.operator) &&
    samePoolIdentity(a, b)
  );
};
const reportWithServerId = (report, response) => {
  const serverId = String(response?.id || "").trim();
  return serverId && serverId !== String(report?.id || "") ? {...report, id:serverId} : report;
};
const upsertReportByIdentity = (list, report) => {
  const idx = list.findIndex(x => sameReportIdentity(x, report));
  if (idx >= 0) {
    const next = [...list];
    next[idx] = report;
    return next;
  }
  return [...list, report];
};
const reportFoundInSheet = (sheetReport = {}, report = {}) => {
  const wantedId = String(report?.id || "").trim();
  const sheetId = String(sheetReport?.id || "").trim();
  const identityMatches = (wantedId && sheetId)
    ? wantedId === sheetId
    : (
      normalizeDate(sheetReport.reportDate) === normalizeDate(report.reportDate) &&
      normalizeName(sheetReport.operator) === normalizeName(report.operator) &&
      samePoolIdentity(sheetReport, report)
    );
  if (!identityMatches) return false;
  const fields = ["chlorine","ph","salt","waterLevel","clarity","fat","flow","elModel","elSerial","elDate","elNext","supplyLabel","poolStatus","customStatusText","restrictedUntil","notes","chlora","hth","phUp","acidLiters","suppliedEquipment","clientId","waterCheckOnly"];
  return fields.every(field => normalizeName(sheetReport?.[field]) === normalizeName(report?.[field]));
};
const getReportSheetStorageStatus = async (report) => {
  if (!getConfiguredSheetId() || !report?.client || !report?.reportDate) {
    return {checked:false, confirmed:false, matches:[]};
  }
  const res = await sheetCall("getReportStorageStatus", { report }).catch(() => null);
  if (!Array.isArray(res?.matches)) {
    return {checked:false, confirmed:false, matches:[]};
  }
  return {
    checked:true,
    confirmed:res.matches.some(match => match?.confirmed === true),
    matches:res.matches
  };
};
const confirmReportSavedToSheet = async (report) => {
  const status = await getReportSheetStorageStatus(report);
  if (!status.confirmed) console.warn("Report save was not confirmed in Sheets", {
    id: report?.id,
    reportDate: report?.reportDate,
    operator: report?.operator,
    client: report?.client
  });
  return status.confirmed;
};

useEffect(() => {
  localStorage.setItem("galileo_sub_operator_pending_reports", JSON.stringify(pendingSubReports));
}, [pendingSubReports]);

useEffect(() => {
  localStorage.setItem("galileo_deferred_sub_report_ids", JSON.stringify(deferredSubReportIds));
}, [deferredSubReportIds]);

useEffect(() => {
  localStorage.setItem("galileo_completed_reports", JSON.stringify(completedReports));
}, [completedReports]);

useEffect(() => {
  let active = true;
  consumePendingRefreshAcceptance();
  const checkForUpdate = async () => {
    setAppUpdate(prev => ({...prev,checking:true,error:false}));
    try {
      const latest = await fetchLatestAppBuildId();
      if (!active) return;
      const currentBuildAccepted = getAcceptedAppBuildId() === APP_BUILD_ID;
      const available = (!!latest && latest !== APP_BUILD_ID) || !currentBuildAccepted;
      setAppUpdate({checking:false,available,latest,error:false});
    } catch {
      if (active) setAppUpdate(prev => ({...prev,checking:false,error:true}));
    }
  };
  checkForUpdate();
  const onFocus = () => checkForUpdate();
  const onVisibility = () => { if (!document.hidden) checkForUpdate(); };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    active = false;
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}, []);

useEffect(() => {
  setWaTemplateDraft(waMessageTemplate);
  try { localStorage.setItem(WA_TEMPLATE_STORAGE_KEY, waMessageTemplate); } catch {}
}, [waMessageTemplate]);

useEffect(() => {
  setAcidSupplyMessageDraft(acidSupplyMessage);
  try { localStorage.setItem(WA_ACID_SUPPLY_MESSAGE_STORAGE_KEY, acidSupplyMessage); } catch {}
}, [acidSupplyMessage]);

useEffect(() => {
  setPhUpSupplyMessageDraft(phUpSupplyMessage);
  try { localStorage.setItem(WA_PH_UP_SUPPLY_MESSAGE_STORAGE_KEY, phUpSupplyMessage); } catch {}
}, [phUpSupplyMessage]);

useEffect(() => {
  setSaltSupplyMessageDraft(saltSupplyMessage);
  try { localStorage.setItem(WA_SALT_SUPPLY_MESSAGE_STORAGE_KEY, saltSupplyMessage); } catch {}
}, [saltSupplyMessage]);

useEffect(() => {
  setChlorineReminderMessageDraft(chlorineReminderMessage);
  try { localStorage.setItem(WA_TABLET_REMINDER_STORAGE_KEY, chlorineReminderMessage); } catch {}
}, [chlorineReminderMessage]);

useEffect(() => {
  setWaterLevelNoticeMessageDraft(waterLevelNoticeMessage);
  try { localStorage.setItem(WA_WATER_LEVEL_NOTICE_STORAGE_KEY, waterLevelNoticeMessage); } catch {}
}, [waterLevelNoticeMessage]);



const [screen,setScreen] = useState(() => {
  try {
    const u = getStoredUserForToday();
    const role = String(u?.role || "").trim().toLowerCase();
    const isAdminPanel = ["admin", "מנהל", "אדמין"].includes(role);
    return u ? (isAdminPanel ? "admin" : "daily") : "login";
  } catch {
    return "login";
  }
});

useEffect(() => {
  if (typeof document === "undefined") return;
  const styleId = "galileo-hide-push-bell";
  let style = document.getElementById(styleId);
  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
    document.head.appendChild(style);
  }
  style.textContent = "#onesignal-bell-container{display:none!important}";
  return () => {
    if (style && style.parentNode) style.parentNode.removeChild(style);
  };
}, [screen]);

useEffect(() => {
  if (screen !== "form" || typeof window === "undefined") return;
  requestAnimationFrame(() => {
    window.scrollTo({top:0,left:0,behavior:"auto"});
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
}, [screen]);

useEffect(() => {
  if (screen === "daily" && isAdminPanelRole(user?.role)) {
    setScreen("admin");
  }
}, [screen, user?.role]);

useEffect(() => {
  const enforceDailyProfileLogin = () => {
    if (!localStorage.getItem("galileo_user")) return;
    const loginDay = localStorage.getItem(LOGIN_DAY_KEY);
    const today = localDayKey();
    if (!loginDay) {
      localStorage.setItem(LOGIN_DAY_KEY, today);
      return;
    }
    if (loginDay === today) return;
    localStorage.removeItem("galileo_user");
    localStorage.removeItem(LOGIN_DAY_KEY);
    setUser(null);
    setLoginPass("");
    setScreen("login");
    setLoginErr("עבר יום חדש, נא להתחבר מחדש");
  };
  enforceDailyProfileLogin();
  const timer = setInterval(enforceDailyProfileLogin, 60 * 1000);
  window.addEventListener("focus", enforceDailyProfileLogin);
  document.addEventListener("visibilitychange", enforceDailyProfileLogin);
  return () => {
    clearInterval(timer);
    window.removeEventListener("focus", enforceDailyProfileLogin);
    document.removeEventListener("visibilitychange", enforceDailyProfileLogin);
  };
}, []);

  const [syncing,setSyncing] = useState(false);
  const [actionStatus, setActionStatus] = useState({});
  const [pushCardOpen, setPushCardOpen] = useState(true);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(()=>{
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator?.standalone === true;
  });
  const [form,setForm] = useState(blank());
  const [submittedReport,setSubmittedReport] = useState(null);
  const [adminTab,setAdminTab] = useState("dashboard");
  const [taskDate,setTaskDate] = useState(todayStr());
  const [taskClient,setTaskClient] = useState("");
  const [taskClientId,setTaskClientId] = useState("");
  const [taskClientSearch,setTaskClientSearch] = useState("");
  const [taskClients,setTaskClients] = useState([]);
  const [taskOps,setTaskOps] = useState([]);
  const [taskNote,setTaskNote] = useState("");
  const [editTaskId,setEditTaskId] = useState(null);
  const [dailyDate,setDailyDate] = useState(todayStr());
  const [showConv,setShowConv] = useState(false);
  const [navTab,setNavTab] = useState(0);
  const [additionalTaskActionId,setAdditionalTaskActionId] = useState(null);
  const [operatorTaskClient,setOperatorTaskClient] = useState("");
  const [operatorTaskClientId,setOperatorTaskClientId] = useState("");
  const [operatorTaskClientSearch,setOperatorTaskClientSearch] = useState("");
  const [operatorTaskNote,setOperatorTaskNote] = useState("");
  const [openDoneTasks,setOpenDoneTasks] = useState({});
  const [toast,setToast] = useState({msg:"",visible:false});
  const [workStart,setWorkStart] = useState(()=>localStorage.getItem("galileo_workstart")||null);
  const [workLogs,setWorkLogs] = useState(()=>{ try{return JSON.parse(localStorage.getItem("galileo_worklogs")||"[]");}catch{return [];} });
  const [workClockEditor,setWorkClockEditor] = useState(null);
  const [showClockReminder,setShowClockReminder] = useState(false);
  const [showQR,setShowQR] = useState(false);
  const [showQRCode,setShowQRCode] = useState(null);
  const [dismissed,setDismissed] = useState(false);
  const [showPendingReportNames,setShowPendingReportNames] = useState(false);
  const [showPendingIssueDetails,setShowPendingIssueDetails] = useState(false);
  const [pendingBackgroundSync,setPendingBackgroundSync] = useState(false);
  const [showSuperAdmin,setShowSuperAdmin] = useState(false);
  const [showReportIssue,setShowReportIssue] = useState(false);
  const [issueDesc,setIssueDesc] = useState("");
  const [issuePriority,setIssuePriority] = useState("רגיל");
  const [showGateCode,setShowGateCode] = useState({});
  const [operatorIssues,setOperatorIssues] = useState([]);
  const [operatorDoneAlerts,setOperatorDoneAlerts] = useState([]);
  const [dismissedCriticalIssueIds,setDismissedCriticalIssueIds] = useState(()=>{ try{return JSON.parse(localStorage.getItem("galileo_dismissed_critical_issues")||"[]");}catch{return [];} });
  const [showOperatorIssue,setShowOperatorIssue] = useState(false);
  const [opIssueClient,setOpIssueClient] = useState("");
  const [opIssueClientId,setOpIssueClientId] = useState("");
  const [opIssueDesc,setOpIssueDesc] = useState("");
  const [opIssuePriority,setOpIssuePriority] = useState("רגיל");
  const [internalNoteEdit,setInternalNoteEdit] = useState(null);
  const [clientSearch,setClientSearch] = useState("");
  const [editingReport,setEditingReport] = useState(null);
  const [supplySearch,setSupplySearch] = useState({date:"",dateTo:"",type:""});
  const [adminIssueSearch,setAdminIssueSearch] = useState({date:"",client:""});
  const [poolSourcesReady,setPoolSourcesReady] = useState(false);
  const emptyAdminClient = {name:"",phone:"",address:"",gateCode:"",regularDays:"",regularOperator:"",poolType:"מלח",waterCheckDays:""};
  const [newClient,setNewClient] = useState(emptyAdminClient);
  const [editingAdminClient,setEditingAdminClient] = useState(null);
  const [clientListSearch,setClientListSearch] = useState("");
  const [adminClientSearch,setAdminClientSearch] = useState("");
  const [manualWaClient,setManualWaClient] = useState("");
  const [manualWaClientId,setManualWaClientId] = useState("");
  const [manualWaClientSearch,setManualWaClientSearch] = useState("");
  const [manualWaMessage,setManualWaMessage] = useState("");
  const [manualWaSendAll,setManualWaSendAll] = useState(false);
  const [manualWaLastResult,setManualWaLastResult] = useState(null);
  const [selectedAdminOperator,setSelectedAdminOperator] = useState("");
  const [adminOrderDraft,setAdminOrderDraft] = useState([]);
  const [adminOrderClientSearch,setAdminOrderClientSearch] = useState("");
  const [adminOrderRemovedClients,setAdminOrderRemovedClients] = useState([]);
  const [adminOrderSavedPulse,setAdminOrderSavedPulse] = useState(false);
  const [operatorEditOrder,setOperatorEditOrder] = useState(false);
  const [operatorOrderDraft,setOperatorOrderDraft] = useState([]);
  const [subOperatorRefresh,setSubOperatorRefresh] = useState(0);
  const [reportFilter,setReportFilter] = useState("");
  const [saltSearch,setSaltSearch] = useState("");
  const [lowSaltSearch,setLowSaltSearch] = useState("");
  const [saltMinimum,setSaltMinimum] = useState(2500);
  const [applySaltMinimumToReports,setApplySaltMinimumToReports] = useState(false);
  const [selectedSaltReport,setSelectedSaltReport] = useState(null);
  const [reportDateFilter,setReportDateFilter] = useState("");
  const [reportDateToFilter,setReportDateToFilter] = useState("");
  const [sheetReports,setSheetReports] = useState([]);
  const [treatmentCounts,setTreatmentCounts] = useState([]);
  const [chemicalRestrictionPrompt,setChemicalRestrictionPrompt] = useState(null);
  const [confirmReportWhatsApp,setConfirmReportWhatsApp] = useState(null);
  const [openDailySupplyType,setOpenDailySupplyType] = useState(null);
  const [openCompletedPools,setOpenCompletedPools] = useState(false);
  const [openTodayTasks,setOpenTodayTasks] = useState(false);
  const [openMeasurementHistory,setOpenMeasurementHistory] = useState({});
  const [measurementHistoryByClient,setMeasurementHistoryByClient] = useState({});
  const [measurementHistoryLoading,setMeasurementHistoryLoading] = useState({});
  const [allDailyCardsCollapsed,setAllDailyCardsCollapsed] = useState(false);
  const logoLongPress = useRef();
  const longPressTimers = useRef({});
  const fileRef = useRef();
  const toastTimer = useRef();
  const operatorIssueSendingRef = useRef(false);
  const operatorIssueSyncRef = useRef(false);
  const operatorIssueInFlightIdsRef = useRef(new Set());
  const pendingSyncRef = useRef(false);
  const immediateReportIdsRef = useRef(new Set());
  const editingPendingReportIdsRef = useRef(new Set());
  const deletedPendingReportIdsRef = useRef(new Set());
  const operatorRefreshRef = useRef(false);
  const operatorRefreshVersionRef = useRef("");
  const operatorRefreshLastFullRef = useRef(0);
  const internalNoteClientRef = useRef("");

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
  const pushEnabledKey = (username) => `galileo_push_enabled_${String(username || "").trim().toLowerCase()}`;
  const isPushEnabledForLogin = () => {
    const key = pushEnabledKey(loginUser);
    if (!key || key.endsWith("_")) return false;
    try { return localStorage.getItem(key) === "true"; } catch { return false; }
  };
  const markPushEnabledForLogin = () => {
    const key = pushEnabledKey(loginUser);
    if (!key || key.endsWith("_")) return;
    try { localStorage.setItem(key, "true"); } catch {}
  };

  const sf = (k,v) => setForm(f=>({...f,[k]:v}));
  const {reportDate,client,chlorine,ph,salt,elModel,elSerial,elDate,waterLevel,clarity,fat,flow,acid,phUpSupply,saltPkg,saltBags,supplyStatus,supplyNote,suppliedEquipment=[],poolStatus,customStatusText,restrictedUntil,notes,photos,sendReminder} = form;
  const setChlorineReminderEnabled = (checked) => {
    setForm(f => {
      if (!checked) return {...f, sendReminder:false, chlorineReminderCreatedAt:"", chlorineReminderDueAt:"", chlorineReminderMessage:""};
      const createdAt = f.chlorineReminderCreatedAt || new Date().toISOString();
      const dueAt = f.chlorineReminderDueAt || isoAfterDays(CHLORINE_TABLET_REMINDER_DAYS);
      return {...f, sendReminder:true, chlorineReminderCreatedAt:createdAt, chlorineReminderDueAt:dueAt, chlorineReminderMessage:normalizeChlorineReminderMessage(chlorineReminderMessage)};
    });
    haptic();
  };
  const chlorineReminderDaysLeft = sendReminder ? daysUntilIso(form.chlorineReminderDueAt) : null;
  const fmtTime = (d) => d.toLocaleTimeString("he-IL",{hour:"2-digit",minute:"2-digit"});
  const formatDateInput = (d) => localDayKey(d);
  const normalizeDate = (d) => String(d||"").trim().slice(0,10);
  useEffect(() => {
    if (!client) {
      internalNoteClientRef.current = "";
      return;
    }
    if (poolStatus !== "\u05de\u05d0\u05d5\u05d6\u05e0\u05ea") return;
    const currentPoolKey = poolIdentityKey({client, clientId:form.clientId});
    if (internalNoteClientRef.current === currentPoolKey) return;
    internalNoteClientRef.current = currentPoolKey;
    const savedNote = String(lastReadingForClient(client, form.clientId)?.customStatusText || "").trim();
    setForm(f => (
      samePoolIdentity(f, {client, clientId:form.clientId}) && f.poolStatus === "\u05de\u05d0\u05d5\u05d6\u05e0\u05ea"
        ? {...f, customStatusText: savedNote}
        : f
    ));
  }, [client, form.clientId, poolStatus, lastReadings]);
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
    if (key==="phUp" && Number(value)>0 && !form._chemicalRestrictionApplied && !chemicalRestrictionPrompt) {
      setChemicalRestrictionPrompt({key});
    }
  };
  const clientLookupKey = (value) => String(value || "").split(" - ")[0].trim().toLowerCase();
  const storedClientId = (c) => String(c?.clientId || c?.id || c?.["לקוח_ID"] || c?.["מזהה_לקוח"] || "").trim();
  const allPoolRecords = () => {
    const seenIds = new Set();
    return clients.filter(c => {
      const id = storedClientId(c);
      if (!id) return true;
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
  };
  const findClientByName = (name, id = "") => {
    const poolRecords = allPoolRecords();
    const wantedId = String(id || "").trim();
    if (wantedId) {
      const byId = poolRecords.find(c => storedClientId(c) === wantedId);
      return byId || null;
    }
    const exact = poolRecords.filter(c => String(c.name || "") === String(name || ""));
    const matches = exact.length ? exact : poolRecords.filter(c => clientLookupKey(c.name) === clientLookupKey(name));
    return matches.length === 1 ? matches[0] : null;
  };
  const clientPhone = (n, id = "") => (findClientByName(n, id)||{}).phone||"";
  const clientAddress = (n, id = "") => (findClientByName(n, id)||{}).address||"";
  const clientGateCode = (n, id = "") => (findClientByName(n, id)||{}).gateCode||"";
  const normalizeName = (n) => String(n||"").trim().toLowerCase();
  const findPushUser = (value) => {
    if (!value) return null;
    if (typeof value === "object" && value.username) return value;
    const key = normalizeName(typeof value === "object" ? (value.username || value.name || value.phone) : value);
    if (!key) return null;
    return allUsers.find(u =>
      normalizeName(u?.username) === key ||
      normalizeName(u?.name) === key ||
      normalizeName(u?.phone) === key
    ) || null;
  };
  const isAdminRole = (role) => ["admin", "מנהל", "אדמין"].includes(String(role || "").trim().toLowerCase());
  const isOperatorRole = (role) => ["operator", "op", "מפעיל", "מפעיל קבוע", "מפעיל_קבוע"].includes(String(role || "").trim().toLowerCase());
  const isSubOperatorRole = (role) => ["sub_operator", "sub operator", "sub-operator", "suboperator", "sub_admin", "sub admin", "sub-admin", "subadmin", "עוזר", "עוזר מפעיל", "עוזר_מפעיל", "עוזר-מפעיל"].includes(String(role || "").trim().toLowerCase());
  const isSubOperatorUser = isSubOperatorRole(user?.role);
  const isSubOperatorEnglish = isSubOperatorUser && subOperatorLanguage === "en";
  const subText = (hebrew, english) => isSubOperatorEnglish ? english : hebrew;
  const subPoolLabel = (label) => {
    if (!isSubOperatorEnglish) return label;
    return String(label || "")
      .replace(/מלח/g, "Salt")
      .replace(/כלור/g, "Chlorine")
      .replace(/גלישה/g, "Overflow")
      .replace(/סקימר/g, "Skimmer");
  };
  const subClientMetaLine = (client) => {
    if (!isSubOperatorEnglish) return clientMetaLine(client);
    return [
      client?.poolType && `Pool: ${subPoolLabel(client.poolType)}`,
      client?.regularOperator && `Operator: ${client.regularOperator}`,
      client?.regularDays && `Days: ${client.regularDays}`
    ].filter(Boolean).join(" · ");
  };
  const subPlanStatus = (status) => {
    if (!isSubOperatorEnglish) return status;
    return ({
      "פעיל":"Active",
      "לא פעיל":"Inactive",
      "ניסיון":"Trial",
      "חסום":"Blocked",
      "בוטל":"Cancelled",
      "פג תוקף":"Expired"
    })[status] || status;
  };
  useEffect(()=>{
    if (!isSubOperatorRole(user?.role)) {
      setSubOperatorLanguage("he");
      setShowSubLanguagePrompt(false);
      return;
    }
    try {
      setSubOperatorLanguage(localStorage.getItem(subOperatorLanguageStorageKey(user)) === "en" ? "en" : "he");
    } catch {
      setSubOperatorLanguage("he");
    }
  },[user?.username,user?.name,user?.role]);
  const confirmSubOperatorLanguageChange = () => {
    if (!isSubOperatorUser) return;
    const nextLanguage = isSubOperatorEnglish ? "he" : "en";
    try { localStorage.setItem(subOperatorLanguageStorageKey(user), nextLanguage); } catch {}
    setSubOperatorLanguage(nextLanguage);
    setShowSubLanguagePrompt(false);
    haptic("success");
  };
  const operatorUsers = allUsers.filter(u=>isOperatorRole(u.role));
  const opNames = operatorUsers.map(u=>u.name);
  const userIdentityKey = (u={}) => [
    normalizeName(u?.username),
    normalizeName(u?.name),
    normalizeName(u?.phone)
  ].filter(Boolean).join("|");
  const dedupeUsers = (users=[]) => {
    const byKey = new Map();
    (users || []).filter(Boolean).forEach(u => {
      const key = userIdentityKey(u) || normalizeName(u?.username) || normalizeName(u?.name);
      if (!key) return;
      byKey.set(key, {...(byKey.get(key) || {}), ...u});
    });
    return [...byKey.values()];
  };
  const sameUserIdentity = (a={}, b={}) => {
    const aUser = normalizeName(a?.username);
    const bUser = normalizeName(b?.username);
    if (!aUser || !bUser || aUser !== bUser) return false;
    const aName = normalizeName(a?.name);
    const bName = normalizeName(b?.name);
    if (aName && bName) return aName === bName;
    const aPhone = normalizeName(a?.phone);
    const bPhone = normalizeName(b?.phone);
    if (aPhone && bPhone) return aPhone === bPhone;
    return true;
  };
  const applyFetchedUsers = (users=[]) => {
    if (!Array.isArray(users)) return [];
    const cleanUsers = dedupeUsers(users);
    setAllUsers(cleanUsers);
    try {
      const cached = JSON.parse(localStorage.getItem("galileo_cache") || "{}");
      localStorage.setItem("galileo_cache", JSON.stringify({...cached, users:cleanUsers, cachedAt:Date.now()}));
    } catch(e) {}
    setUser(current => {
      if (!current) return current;
      const fresh = cleanUsers.find(u => sameUserIdentity(current, u));
      if (!fresh) return current;
      const merged = {...current, ...fresh};
      localStorage.setItem("galileo_user", JSON.stringify(merged));
      return merged;
    });
    return cleanUsers;
  };
  const subOperatorUsers = allUsers.filter(u=>isSubOperatorRole(u.role));
  const isAdminPanelRole = (role) => isAdminRole(role);
  const clientDisplayName = (c) => String(c?.name || c || "").split(" - ")[0].trim();
  const sortByClientName = (list) => [...(list || [])].sort((a,b)=>clientDisplayName(a).localeCompare(clientDisplayName(b), "he"));
  const filterClientOptions = (list, query) => {
    const q = String(query || "").trim().toLowerCase();
    if (q.length < 2) return [];
    return sortByClientName(list).filter(c => {
      const fields = [
        clientDisplayName(c),
        c?.name,
        c?.address,
        c?.phone,
        c?.regularOperator,
        c?.poolType,
      ].map(v=>String(v||"").toLowerCase());
      return fields.some(v=>v.includes(q));
    });
  };
  const clientIdSeed = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\u0590-\u05ff-]/gi, "").slice(0, 42);
  const makeClientId = () => `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const stableClientId = (c, index = 0) => `client-${clientIdSeed([c?.name || c, c?.phone, c?.address].filter(Boolean).join("-")) || "unknown"}${index ? `-${index + 1}` : ""}`;
  const clientId = (c) => storedClientId(c) || stableClientId(c);
  const clientByName = (name, id = "") => findClientByName(name, id);
  const clientIdByName = (name, id = "") => {
    const wantedId = String(id || "").trim();
    if (wantedId) return wantedId;
    const poolRecords = allPoolRecords();
    const exact = poolRecords.filter(c => String(c?.name || "") === String(name || ""));
    const matches = exact.length ? exact : poolRecords.filter(c => clientLookupKey(c?.name) === clientLookupKey(name));
    return matches.length === 1 ? clientId(matches[0]) : "";
  };
  const reportClientOptions = () => {
    return { regular:clients, all:clients };
  };
  const clientRecordFor = (value) => {
    const raw = typeof value === "object" && value !== null ? value : {name:value};
    const name = String(raw?.name || raw?.client || value || "").trim();
    return {...(clientByName(name, raw?.clientId) || {}), ...raw, name:name || raw?.name || ""};
  };
  const whatsAppClientKeys = (value) => {
    const source = clientRecordFor(value);
    const name = String(source?.name || source?.client || value || "").trim();
    const id = String(source?.clientId || source?.["לקוח_ID"] || source?.["מזהה_לקוח"] || (name ? clientIdByName(name) : "") || "").trim();
    if (id) return [`id:${id}`];
    return name ? [`name:${normalizeName(name)}`] : [];
  };
  const legacyWhatsAppClientKeys = (value) => {
    const source = clientRecordFor(value);
    const name = String(source?.name || source?.client || value || "").trim();
    return name ? [`name:${normalizeName(name)}`, name, normalizeName(name)] : [];
  };
  const migrateWhatsAppDisabledKeys = (values = [], removeLegacy = false) => {
    const next = new Set((values || []).map(value => String(value || "").trim()).filter(Boolean));
    const records = allPoolRecords();
    const legacyNames = new Set();
    records.forEach(record => {
      const name = String(record?.name || "").trim();
      const normalizedName = normalizeName(name);
      if (!normalizedName) return;
      const legacyKeys = [`name:${normalizedName}`, name, normalizedName];
      if (!legacyKeys.some(key => next.has(key))) return;
      legacyNames.add(normalizedName);
      whatsAppClientKeys(record).forEach(key => next.add(key));
    });
    if (removeLegacy) {
      [...next].forEach(key => {
        const normalizedKey = key.startsWith("name:") ? key.slice(5) : normalizeName(key);
        if (!key.startsWith("id:") && legacyNames.has(normalizedKey)) next.delete(key);
      });
    }
    return [...next];
  };
  const isWhatsAppDisabledForClient = (value) => {
    const disabled = new Set(waDisabledClients);
    return (
      whatsAppClientKeys(value).some(key => disabled.has(key)) ||
      legacyWhatsAppClientKeys(value).some(key => disabled.has(key))
    );
  };
  const toggleWhatsAppForClient = (value) => {
    const keys = whatsAppClientKeys(value);
    if (!keys.length) return;
    const wasDisabled = isWhatsAppDisabledForClient(value);
    const hasLegacyBlock = legacyWhatsAppClientKeys(value).some(key => waDisabledClients.includes(key));
    if (wasDisabled && hasLegacyBlock && !poolSourcesReady) {
      showToast("נתוני הבריכות עדיין נטענים. החסימה נשארה פעילה");
      return;
    }
    setWaDisabledClients(prev => {
      const next = new Set(migrateWhatsAppDisabledKeys(prev, poolSourcesReady));
      if (wasDisabled) keys.forEach(key => next.delete(key));
      else keys.forEach(key => next.add(key));
      return [...next];
    });
    showToast(wasDisabled ? "שליחת ווצאפ הופעלה ללקוח" : "שליחת ווצאפ בוטלה ללקוח");
    haptic("medium");
  };
  const setWhatsAppForClients = (values = [], disabled = true, toastMessage = "") => {
    const keys = [...new Set((values || []).flatMap(value => whatsAppClientKeys(value)))];
    if (!keys.length) return;
    const hasLegacyBlock = (values || []).some(value =>
      legacyWhatsAppClientKeys(value).some(key => waDisabledClients.includes(key))
    );
    if (!disabled && hasLegacyBlock && !poolSourcesReady) {
      showToast("נתוני הבריכות עדיין נטענים. החסימה נשארה פעילה");
      return;
    }
    setWaDisabledClients(prev => {
      const next = new Set(migrateWhatsAppDisabledKeys(prev, poolSourcesReady));
      keys.forEach(key => disabled ? next.add(key) : next.delete(key));
      return [...next];
    });
    showToast(toastMessage || (disabled ? "שליחת ווצאפ בוטלה לכל הלקוחות המשויכים" : "שליחת ווצאפ הופעלה לכל הלקוחות המשויכים"));
    haptic("medium");
  };
  useEffect(() => {
    if (!poolSourcesReady) return;
    setWaDisabledClients(previous => {
      const migrated = migrateWhatsAppDisabledKeys(previous, true);
      if (migrated.length === previous.length && migrated.every(key => previous.includes(key))) {
        return previous;
      }
      return migrated;
    });
  }, [clients, poolSourcesReady]);
  const toggleWhatsAppForAllClients = () => {
    if (!clients.length) return;
    const allDisabled = clients.every(c => isWhatsAppDisabledForClient(c));
    setWhatsAppForClients(clients, !allDisabled, allDisabled ? "שליחת ווצאפ הופעלה לכל הלקוחות" : "שליחת ווצאפ בוטלה לכל הלקוחות");
  };
  const disabledWhatsAppClients = () => sortByClientName(clients.filter(c => isWhatsAppDisabledForClient(c)));
  const manualWaBaseClients = () => {
    if (manualWaSendAll) return sortByClientName(clients);
    const selected = manualWaClient ? findClientByName(manualWaClient, manualWaClientId) : null;
    return selected ? [selected] : [];
  };
  const manualWaRecipients = () => manualWaBaseClients()
    .map(c => ({...c, phone: normalizeWhatsAppPhone(c.phone || clientPhone(c.name, clientId(c)))}))
    .filter(c => c.phone && !isWhatsAppDisabledForClient(c));
  const WhatsAppClientToggle = ({client: clientValue, compact=false}) => {
    const disabled = isWhatsAppDisabledForClient(clientValue);
    return (
      <span
        onPointerDown={e=>e.stopPropagation()}
        onPointerUp={e=>e.stopPropagation()}
        onClick={e=>e.stopPropagation()}
        style={{display:"inline-flex",alignItems:"center",height:24,flexShrink:0}}
        title={disabled ? subText("שליחת ווצאפ כבויה ללקוח זה","WhatsApp is disabled for this client") : subText("שליחת ווצאפ פעילה ללקוח זה","WhatsApp is enabled for this client")}
      >
        <Press
          onClick={e=>{e.stopPropagation();toggleWhatsAppForClient(clientValue);}}
          style={{
            minHeight:compact ? 22 : 24,
            height:compact ? 22 : 24,
            display:"inline-flex",
            alignItems:"center",
            justifyContent:"center",
            padding:compact ? "0 8px" : "0 10px",
            borderRadius:99,
            border:`1px solid ${disabled ? "rgba(185,28,28,0.22)" : "rgba(21,128,61,0.22)"}`,
            background:disabled ? "#ffebee" : "#e8f5e9",
            color:disabled ? C.red : C.green,
            fontSize:compact ? 10 : 11,
            fontWeight:900,
            lineHeight:1,
            whiteSpace:"nowrap"
          }}
        >
          {disabled ? subText("ווצאפ כבוי","WhatsApp off") : subText("ווצאפ פעיל","WhatsApp on")}
        </Press>
      </span>
    );
  };
  const lastReadingForClient = (clientName, id = "") => {
    const wantedId = String(id || clientIdByName(clientName) || "").trim();
    const entries = Object.entries(lastReadings || {});
    const readings = entries.map(([, value]) => value);
    if (wantedId) {
      if (lastReadings?.[wantedId]) return lastReadings[wantedId];
      const byId = readings.find(r => String(r?.clientId || "").trim() === wantedId);
      if (byId) return byId;
      return null;
    }
    const matchingPools = allPoolRecords().filter(c =>
      clientLookupKey(c?.name) === clientLookupKey(clientName)
    );
    if (matchingPools.length > 1) return null;
    return lastReadings?.[clientName] ||
      entries.find(([key]) => normalizeName(key) === normalizeName(clientName))?.[1] ||
      readings.find(r => normalizeName(r?.client) === normalizeName(clientName)) ||
      null;
  };
  const ensureClientIds = (list = []) => {
    const used = new Set();
    return (list || []).map((c, i) => {
      const base = String(c?.clientId || c?.id || c?.["לקוח_ID"] || c?.["מזהה_לקוח"] || "").trim() || stableClientId(c);
      let id = base;
      let n = 2;
      while (used.has(id)) id = `${base}-${n++}`;
      used.add(id);
      return {...c, clientId:id};
    });
  };
  const adminClientRequiredFields = [
    ["name", "שם לקוח"],
    ["phone", "טלפון"],
    ["address", "כתובת"],
    ["gateCode", "קוד שער"],
    ["poolType", "סוג בריכה"],
    ["regularDays", "ימים קבועים"],
    ["regularOperator", "מפעיל קבוע"],
  ];
  const adminClientMissingFields = (c = {}) => adminClientRequiredFields.filter(([key]) => !String(c?.[key] || "").trim()).map(([, label]) => label);
  const adminClientDraft = (c = {}) => ({
    ...c,
    clientId: clientId(c),
    name: String(c.name || ""),
    phone: String(c.phone || ""),
    address: String(c.address || ""),
    gateCode: String(c.gateCode || ""),
    regularDays: String(c.regularDays || ""),
    regularOperator: String(c.regularOperator || ""),
    poolType: String(c.poolType || "מלח"),
    waterCheckDays: normalizeWaterCheckDays(c.waterCheckDays),
  });
  const saveAdminClientDetails = async (originalClientId, originalName, draft) => {
    const next = {...adminClientDraft(draft), clientId:clientId(draft), originalClientId, originalName};
    if (!next.name.trim()) { showToast("⚠️ נא להזין שם לקוח"); return; }
    const updated = ensureClientIds(clients.map(c =>
      samePoolIdentity({client:c.name,clientId:clientId(c)}, {client:originalName,clientId:originalClientId}) ? next : c
    ));
    if (sheetId) {
      const res = await sheetCall("saveClients", { clients: [next] });
      if (!res?.success) { showToast("⚠️ השמירה לגיליון נכשלה"); haptic("medium"); return; }
    }
    setClients(updated.map(({originalName: _originalName, originalClientId: _originalClientId, ...client}) => client));
    setEditingAdminClient(null);
    showToast("✅ פרטי לקוח נשמרו");
    haptic("success");
  };
  const deleteAdminClient = async (clientToDelete) => {
    const originalName = String(clientToDelete?.name || "").trim();
    const originalClientId = clientId(clientToDelete);
    if (!originalName) return;
    if (!window.confirm("לחיצה על אישור מוחקת לצמיתות לקוח זה פעולה זו לא ניתנת לביטול")) return;
    if (sheetId) {
      const res = await sheetCall("deleteClient", { clientId:originalClientId, originalName, clientName: originalName });
      if (!res?.success) { showToast("⚠️ המחיקה מהגיליון נכשלה"); haptic("medium"); return; }
    }
    setClients(prev => prev.filter(c => !samePoolIdentity(
      {client:c.name,clientId:clientId(c)},
      {client:originalName,clientId:originalClientId}
    )));
    if (editingAdminClient?.originalClientId === originalClientId) setEditingAdminClient(null);
    showToast("🗑️ לקוח נמחק");
    haptic("success");
  };
  const completedReportKey = (date, clientName, operatorName, clientIdValue = "") => [
    date,
    poolIdentityKey({client:clientName, clientId:clientIdValue}),
    normalizeName(operatorName)
  ].join("|");
  const rememberCompletedReport = (report) => {
    const key = completedReportKey(report.reportDate, report.client, report.operator || user?.name, report.clientId);
    setCompletedReports(prev => prev.includes(key) ? prev : [...prev, key]);
  };
  const forgetCompletedReport = (date, clientName, operatorName=user?.name, clientIdValue="") => {
    const key = completedReportKey(date, clientName, operatorName || user?.name, clientIdValue);
    setCompletedReports(prev => prev.filter(x => x !== key));
  };
  const isClientReportedDone = (date, clientName, clientIdValue = "") => {
    const opName = dailyOwnerName(date) || user?.name || "";
    const pool = {client:clientName, clientId:clientIdValue};
    const last = lastReadingForClient(clientName, clientIdValue);
    const allReports = [...sheetReports, ...reports];
    return allReports.some(r =>
        normalizeDate(r.reportDate) === date &&
        normalizeName(r.operator) === normalizeName(opName) &&
        samePoolIdentity(r, pool)
      ) ||
      completedReports.includes(completedReportKey(date, clientName, opName, clientIdValue)) ||
      normalizeDate(last?.date) === date;
  };
  const poolTags = (poolType) => String(poolType || "מלח").split(/[,+/|]/).map(x=>x.trim()).filter(Boolean);
  const primaryPoolType = (poolType) => poolTags(poolType).includes("כלור") ? "כלור" : "מלח";
  const secondaryPoolType = (poolType) => poolTags(poolType).find(x=>x==="סקימר" || x==="גלישה") || "";
  const formatPoolType = (poolType) => [primaryPoolType(poolType), secondaryPoolType(poolType)].filter(Boolean).join(" + ");
  const clientPoolTypeLabel = (clientName, clientIdValue = "") => {
    const poolType = findClientByName(clientName, clientIdValue)?.poolType;
    return poolType ? subPoolLabel(formatPoolType(poolType)) : "";
  };
  const operatorIssuePoolLabel = (clientName, clientIdValue = "") => {
    const pool = findClientByName(clientName, clientIdValue);
    return [
      String(clientName || "").split(" - ")[0],
      pool?.address,
      pool?.poolType && formatPoolType(pool.poolType)
    ].filter(Boolean).join(" · ");
  };
  const latestMeasuredSaltReports = () => {
    const loadedReports = [...sheetReports, ...reports.filter(r=>!r._fromSheet)];
    return allPoolRecords()
      .filter(pool => primaryPoolType(pool.poolType) !== "כלור")
      .map(pool => {
        const poolId = clientId(pool);
        const latestReading = lastReadingForClient(pool.name, poolId);
        const readingHistory = latestReading
          ? [latestReading, ...(Array.isArray(latestReading.previousMeasurements) ? latestReading.previousMeasurements : [])]
          : [];
        const candidates = [
          ...loadedReports.filter(report => samePoolIdentity(report, {client:pool.name, clientId:poolId})),
          ...readingHistory.map(reading => ({
            ...reading,
            client:reading.client || pool.name,
            clientId:reading.clientId || poolId,
            reportDate:reading.reportDate || reading.date || ""
          }))
        ]
          .filter(report => Number.isFinite(measuredSaltPpm(report.salt)))
          .sort((a,b) => measurementDate(b).localeCompare(measurementDate(a)));
        return candidates[0] || null;
      })
      .filter(Boolean);
  };
  const clientOptionLabel = (c) => [
    c?.name,
    c?.address,
    c?.poolType && subPoolLabel(formatPoolType(c.poolType)),
    c?.regularOperator
  ].filter(Boolean).join(" · ");
  const poolIconForType = (poolType) => primaryPoolType(poolType)==="כלור" ? "🧪" : secondaryPoolType(poolType)==="גלישה" ? "🌊" : secondaryPoolType(poolType)==="סקימר" ? "🔵" : "🧂";
  const setPoolTypePart = (poolType, part) => {
    const primary = part==="מלח" || part==="כלור" ? part : primaryPoolType(poolType);
    const secondary = part==="סקימר" || part==="גלישה" ? (secondaryPoolType(poolType)===part ? "" : part) : secondaryPoolType(poolType);
    return [primary, secondary].filter(Boolean).join(",");
  };
  const additionalTaskLogNote = (task) => {
    const logs = Array.isArray(task?.changeLog) ? task.changeLog : [];
    const closeWords = ["דוח הוגש", "בוצעה", "בוצע", "סומנה כבוצעה", "אדמין אישר", "אדמין דחה", "משימה עודכנה", "סדר היום", "הוסר", "נוסף"];
    const notes = logs.map(log => String(log?.note || "").trim()).filter(Boolean);
    return [...notes].reverse().find(note => !closeWords.some(word => normalizeName(note).includes(normalizeName(word)))) ||
      String(task?.note || "").trim();
  };
  const extractOperatorTaskNote = (task) => {
    const direct = String(task?.operatorNote || task?.requestNote || "").trim();
    if (direct) return direct;
    const logs = Array.isArray(task?.changeLog) ? task.changeLog : [];
    const blockedWords = ["אדמין", "מנהל", "סדר היום", "משימה עודכנה", "דוח הוגש", "בוצעה", "בוצע", "סומנה", "הוסר", "נוסף"];
    const defaultNotes = ["משימה אישית ממתינה לאישור", "משימה ממתינה לאישור ושליחה"];
    return logs.map(log => String(log?.note || "").trim()).find(note =>
      note &&
      !blockedWords.some(word => normalizeName(note).includes(normalizeName(word))) &&
      !defaultNotes.some(word => normalizeName(note) === normalizeName(word))
    ) || "";
  };
  const isLowPhValue = (value) => ["hp נמוך", "ph נמוך", "pH נמוך"].some(x => normalizeName(value) === normalizeName(x));
  const toggleSuppliedEquipment = (name) => {
    const current = Array.isArray(form.suppliedEquipment) ? form.suppliedEquipment : [];
    sf("suppliedEquipment", current.includes(name) ? current.filter(x=>x!==name) : [...current, name]);
  };
  const reportSupplyFlags = (source = {}) => {
    const label = String(source.supplyLabel || "");
    const labelParts = label.split(",").map(x=>x.trim()).filter(Boolean);
    const hasLabelPart = (...needles) => labelParts.some(part => needles.some(n => part.includes(n)));
    const saltMatch = label.match(/[×x]\s*(\d+)/i);
    const saltBagsValue = Number(source.saltBags || saltMatch?.[1] || 0);
    const hasSalt = source.saltPkg === true || hasLabelPart("שקי מלח", "מלח ×", "מלח x");
    return {
      acid: source.acid === true || hasLabelPart("חומצת"),
      phUpSupply: source.phUpSupply === true || hasLabelPart("מעלה"),
      saltPkg: hasSalt && saltBagsValue > 0,
      saltBags: saltBagsValue,
      suppliedEquipment: Array.isArray(source.suppliedEquipment)
        ? source.suppliedEquipment
        : String(source.suppliedEquipment || "").split(",").map(x=>x.trim()).filter(Boolean)
    };
  };
  const openDoneReportEditor = (task) => {
    const opName = dailyOwnerName(dailyDate) || user?.name || "";
    const taskClientId = String(task?.clientId || clientIdByName(task?.client) || "").trim();
    const reportCandidates = [...sheetReports, ...reports.filter(r=>!r._fromSheet)].reverse().filter(r => {
      if (normalizeDate(r.reportDate) !== normalizeDate(dailyDate)) return false;
      if (task?.reportId && String(r.id || "") === String(task.reportId)) return true;
      return samePoolIdentity(r, {client:task.client,clientId:taskClientId,id:task.id});
    });
    const existing = reportCandidates.find(r => normalizeName(r.operator) === normalizeName(opName)) || reportCandidates[0];
    const lr = lastReadingForClient(task.client, task.clientId) || {};
    const source = existing || {
      reportDate: dailyDate,
      client: task.client,
      operator: opName,
      chlorine: lr.chlorine ?? 0,
      ph: lr.ph ?? 0,
      salt: lr.salt ?? 0,
      chlora: lr.chlora ?? 0,
      hth: lr.hth ?? 0,
      phUp: lr.phUp ?? 0,
      acidLiters: lr.acidLiters ?? 0,
      waterLevel: "תקין",
      clarity: "תקין",
      fat: "תקין",
      flow: lr.flow || "",
      poolStatus: lr.poolStatus || "מאוזנת",
      customStatusText: lr.customStatusText || "",
      notes: lr.notes || ""
    };
    setForm({
      ...blank(),
      ...source,
      ...reportSupplyFlags(source),
      reportDate: source.reportDate || dailyDate,
      client: source.client || task.client,
      clientId: source.clientId || task.clientId || taskClientId,
      clientLocked: true,
      waterCheckOnly: !!task?._waterCheck || !!source.waterCheckOnly,
      ph: isLowPhValue(source.ph) ? 0 : source.ph,
      salt: isLowSaltFlagValue(source.salt) ? 0 : source.salt,
      chlorineZeroConfirmed: Number(source.chlorine || 0) === 0,
      phLowConfirmed: isLowPhValue(source.ph),
      lowSaltLight: isLowSaltReportValue(source.salt)
    });
    const sendWhatsAppOnSave = isNoTreatmentReport(source);
    setEditingReport({
      date: source.reportDate || dailyDate,
      client: source.client || task.client,
      clientId: source.clientId || task.clientId || taskClientId,
      operator: source.operator || opName,
      localId: existing?.id || task?.reportId || "",
      notes: source.notes || "",
      missedTreatment: !!source.missedTreatment,
      waterCheckOnly: !!task?._waterCheck || !!source.waterCheckOnly,
      sendWhatsAppOnSave
    });
    setOpenDoneTasks(x=>({...x,[`${dailyDate}:${task.id || task.client}`]:true}));
    setScreen("form");
    haptic("medium");
    showToast(sendWhatsAppOnSave ? "✏️ עריכת דוח — תישלח הודעה אחרי שמירה" : "✏️ עריכת דוח — ללא שליחת WhatsApp");
  };
  const DAY_NAMES = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
  const dateDayName = (dateStr) => { if(!dateStr) return ""; return DAY_NAMES[new Date(dateStr+"T12:00:00").getDay()]; };
  const normalizeDay = (d) => String(d||"").trim().replace(/^א$/,"ראשון").replace(/^ב$/,"שני").replace(/^ג$/,"שלישי").replace(/^ד$/,"רביעי").replace(/^ה$/,"חמישי").replace(/^ו$/,"שישי").replace(/^ש$/,"שבת").replace(/^1$/,"ראשון").replace(/^2$/,"שני").replace(/^3$/,"שלישי").replace(/^4$/,"רביעי").replace(/^5$/,"חמישי").replace(/^6$/,"שישי").replace(/^7$/,"שבת");
  const WATER_CHECK_DAYS = ["ראשון","שני","שלישי","רביעי","חמישי"];
  const normalizeWaterCheckDays = (value) => {
    const rawDays = Array.isArray(value) ? value : String(value || "").split(",");
    const selected = new Set(rawDays.map(d=>normalizeDay(d)).filter(d=>WATER_CHECK_DAYS.includes(d)));
    return WATER_CHECK_DAYS.filter(day=>selected.has(day)).join(", ");
  };
  const waterCheckDayList = (value) => normalizeWaterCheckDays(value).split(",").map(d=>d.trim()).filter(Boolean);
  const formatWaterCheckDays = (value) => waterCheckDayList(value).join(", ");
  const clientWaterCheckAssigned = (clientObj, date, opName) => {
    if (!clientObj || !opName) return false;
    const dayName = dateDayName(date);
    const opMatch = normalizeName(clientObj.regularOperator) === normalizeName(opName);
    return opMatch && waterCheckDayList(clientObj.waterCheckDays).includes(dayName);
  };
  const waterCheckTasksForOperator = (date=dailyDate, opName=dailyOwnerName(date) || user?.name || "") => {
    const targetDate = normalizeDate(date);
    return sortByClientName(clients)
      .filter(c => clientWaterCheckAssigned(c, targetDate, opName))
      .map((c, i) => {
        const id = clientId(c) || normalizeName(c.name);
        return {
          id:`water-check-${targetDate}-${id}`,
          client:c.name,
          clientId:clientId(c),
          operators:[opName],
          date:targetDate,
          status:"pending",
          changeLog:[],
          orderIndex:9000 + i,
          adminNote:"בדיקת מים",
          note:"בדיקת מים",
          createdByAdminOrder:true,
          _waterCheck:true
        };
      });
  };
  const WaterCheckDaysEditor = ({value,onChange}) => {
    const selectedDays = new Set(waterCheckDayList(value));
    const toggleDay = (day) => {
      const next = new Set(selectedDays);
      next.has(day) ? next.delete(day) : next.add(day);
      onChange(WATER_CHECK_DAYS.filter(d=>next.has(d)).join(", "));
      haptic();
    };
    return (
      <div style={{background:"rgba(241,247,255,0.72)",border:"1px solid "+C.border,borderRadius:12,padding:10,marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:800,color:C.muted,marginBottom:8}}>בדיקת מים</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(68px,1fr))",gap:6}}>
          {WATER_CHECK_DAYS.map(day=>{
            const active = selectedDays.has(day);
            return (
              <label key={day} style={{minHeight:34,display:"flex",alignItems:"center",justifyContent:"center",gap:6,borderRadius:10,border:"1px solid "+(active?C.blue:C.border),background:active?"#e3f2fd":"#fff",color:active?C.blue:C.text,fontSize:12,fontWeight:900,cursor:"pointer"}}>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={()=>toggleDay(day)}
                  style={{accentColor:C.blue,width:14,height:14}}
                />
                <span>{day}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  const clientAssignedToOperatorDate = (clientObj, date, opName) => {
    if (!clientObj || !opName) return false;
    const dayName = dateDayName(date);
    const days = String(clientObj.regularDays || "").split(",").map(d=>normalizeDay(d.trim())).filter(Boolean);
    const opMatch = normalizeName(clientObj.regularOperator) === normalizeName(opName);
    const dayMatch = days.some(d=>d === dayName);
    return opMatch && dayMatch;
  };
  const clientsForOperatorsAndDate = (list, date, opList) => {
    const ops = (opList || []).filter(Boolean);
    if (!ops.length) return sortByClientName(list);
    return sortByClientName(list).filter(c => ops.some(op => clientAssignedToOperatorDate(c, date, op)));
  };
  const toISODate = (value) => {
    if (!value) return "";
    if (value instanceof Date && !isNaN(value)) return value.toISOString().slice(0,10);
    const raw = String(value).trim();
    const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return `${iso[1]}-${String(iso[2]).padStart(2,"0")}-${String(iso[3]).padStart(2,"0")}`;
    const il = raw.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/);
    if (il) return `${String(il[3]).length===2?"20"+il[3]:il[3]}-${String(il[2]).padStart(2,"0")}-${String(il[1]).padStart(2,"0")}`;
    const parsed = new Date(raw);
    return isNaN(parsed) ? "" : parsed.toISOString().slice(0,10);
  };
  const nextTreatmentDateForClient = (clientName, afterDate, clientIdValue = "") => {
    const clientObj = findClientByName(clientName, clientIdValue);
    const baseIso = toISODate(afterDate) || todayStr();
    const days = String(clientObj?.regularDays || "").split(",").map(d=>normalizeDay(d.trim())).filter(Boolean);
    if (!days.length) return "";
    const base = new Date(`${baseIso}T12:00:00`);
    for (let offset = 1; offset <= 21; offset++) {
      const d = new Date(base);
      d.setDate(base.getDate() + offset);
      const iso = d.toISOString().slice(0,10);
      if (days.includes(dateDayName(iso))) return iso;
    }
    return "";
  };
  const clientSupplyFromDB = (db, name, id = "") => {
    const wantedId = String(id || "").trim();
    const resolvedId = wantedId || clientIdByName(name);
    if (!resolvedId) return null;
    if (db?.[resolvedId]) return db[resolvedId];
    if (resolvedId) {
      const byId = Object.values(db || {}).find(item => String(item?.clientId || "").trim() === resolvedId);
      if (byId) return byId;
      return clientIdByName(name) === resolvedId ? (db?.[name] || db?.[`legacy:${name}`] || null) : null;
    }
    return null;
  };
  const clientSupply = (name, id = "") => clientSupplyFromDB(supplyDB, name, id);
  const supplyStorageKey = (clientName, clientIdValue = "") => String(clientIdValue || "").trim() || clientName;
  const supplyDueDate = (clientName, supply, clientIdValue = "") => toISODate(supply?.nextSupplyDate) || nextTreatmentDateForClient(clientName, supply?.updatedAt, clientIdValue);
  const isSupplyDueForDate = (clientName, date, supply = clientSupply(clientName), clientIdValue = "") => {
    const due = supplyDueDate(clientName, supply, clientIdValue);
    return !due || due <= normalizeDate(date);
  };

  const myDayClients = (date=dailyDate, opName=user?.name) => {
    const dayName = dateDayName(date);
    const anyHasSchedule = clients.some(c=>c.regularDays||c.regularOperator);
    if(!anyHasSchedule) return clients.filter(c=>!c.regularOperator || normalizeName(c.regularOperator)===normalizeName(opName));
    return clients.filter(c => {
      const days = String(c.regularDays||"").split(",").map(d=>normalizeDay(d.trim()));
      const opMatch = !c.regularOperator || normalizeName(c.regularOperator)===normalizeName(opName);
      const dayMatch = days.some(d=>d===dayName);
      return opMatch && dayMatch;
    });
  };

  const dayClientProfiles = (date=dailyDate, opName=dailyOwnerName(date) || user?.name) => {
    return myDayClients(date, opName).map(c=>({id:`day-${clientId(c)}`,client:c.name,clientId:clientId(c),operators:[opName],date,status:"pending",changeLog:[],_dayProfile:true}));
  };

  const myTasks = (date=dailyDate) => tasks.filter(t=>{
    if (t.createdByAdminOrder || Number(t.orderIndex || 0) > 0) return false;
    const tDate = normalizeDate(t.date);
    const tDate2 = tDate.includes("T") ? tDate.split("T")[0] : tDate;
    const dateMatch = tDate2 === date;
    const ownerName = isSubOperatorRole(user?.role) ? dailyOwnerName(date) : user?.name;
    const subValues = isSubOperatorRole(user?.role) ? [user?.username, user?.name].map(normalizeName).filter(Boolean) : [];
    const nameMatch = isAdminPanelRole(user?.role) || (t.operators||[]).some(op => normalizeName(op)===normalizeName(ownerName) || subValues.includes(normalizeName(op)));
    return dateMatch && nameMatch;
  });
  const measurementDate = (source = {}) => normalizeDate(source.reportDate || source.date);
  const hasMeasurementValue = (value) => value !== "" && value !== null && value !== undefined;
  const mergeLatestReading = (previous = {}, incoming = {}) => {
    const byDate = new Map();
    [...(Array.isArray(previous.previousMeasurements) ? previous.previousMeasurements : []), previous, incoming].forEach(reading => {
      const date = measurementDate(reading);
      if (!date) return;
      byDate.set(date, {...reading, date, reportDate:date});
    });
    const ordered = [...byDate.values()].sort((a,b)=>measurementDate(b).localeCompare(measurementDate(a)));
    if (!ordered.length) return {...previous, ...incoming};
    const [latest, ...older] = ordered;
    return {...latest, previousMeasurements:older.slice(0,3)};
  };
  const clientMeasurementHistory = (clientName, id = "", latestReading = null) => {
    const wantedId = String(id || clientIdByName(clientName) || "").trim();
    const wantedName = normalizeName(clientName);
    const historyKey = wantedId || clientName;
    const latestDate = measurementDate(latestReading || {});
    const seenDates = new Set();
    const serverHistory = Array.isArray(latestReading?.previousMeasurements) ? latestReading.previousMeasurements : [];
    const fetchedHistory = Array.isArray(measurementHistoryByClient[historyKey]) ? measurementHistoryByClient[historyKey] : [];
    return [...serverHistory, ...fetchedHistory, ...sheetReports, ...reports]
      .filter(r => {
        const reportClientId = String(r?.clientId || "").trim();
        if (wantedId) {
          if (reportClientId) return reportClientId === wantedId;
          return clientIdByName(clientName) === wantedId && normalizeName(r?.client) === wantedName;
        }
        return normalizeName(r?.client) === wantedName;
      })
      .sort((a,b)=>measurementDate(b).localeCompare(measurementDate(a)))
      .filter(r => {
        const date = measurementDate(r);
        if (!date || date === latestDate || seenDates.has(date)) return false;
        seenDates.add(date);
        return true;
      })
      .slice(0,3);
  };
  const loadClientMeasurementHistory = async (clientName, id = "", historyKey = "") => {
    const key = historyKey || String(id || clientIdByName(clientName) || clientName);
    setMeasurementHistoryLoading(prev=>({...prev,[key]:true}));
    try {
      const result = await sheetCall("getReports", {client:clientName, clientId:id || clientIdByName(clientName), query:clientName, limit:100});
      if (Array.isArray(result?.reports)) setMeasurementHistoryByClient(prev=>({...prev,[key]:result.reports}));
    } catch (error) {
      console.warn("Measurement history load failed", error);
    } finally {
      setMeasurementHistoryLoading(prev=>({...prev,[key]:false}));
    }
  };
  const supplyPartsFromLabel = (label) => String(label || "").split(",").map(x=>x.trim()).filter(Boolean);
  const suppliedListFrom = (value) => Array.isArray(value)
    ? value
    : String(value || "").split(",").map(x=>x.trim()).filter(Boolean);
  const suppliedHas = (list, ...needles) => (list || []).some(item => needles.some(n => String(item || "").includes(n)));
  const supplyFromReportLike = (source = {}) => {
    const label = String(source.supplyLabel || source.meta?.supplyLabel || "");
    const parts = supplyPartsFromLabel(label);
    const saltPart = parts.find(x => x.includes("מלח"));
    const saltBagsValue = Number(source.saltBags || source.meta?.saltBags || saltPart?.match(/\d+/)?.[0] || 0);
    return {
      acid: source.acid === true || source.meta?.acid === true || parts.some(x => x.includes("חומצת")),
      phUpSupply: source.phUpSupply === true || source.meta?.phUpSupply === true || parts.some(x => x.includes("מעלה") || x.includes("סודה")),
      saltPkg: (source.saltPkg === true || source.meta?.saltPkg === true || parts.some(x => x.includes("מלח"))) && saltBagsValue > 0,
      saltBags: saltBagsValue,
      label
    };
  };
  const materialNamesFromSupply = (supply) => [
    supply?.phUpSupply && "סודה אש",
    supply?.acid && "חומצת מלח",
    supply?.saltPkg && Number(supply?.saltBags || 0) > 0 && `מלח ×${Number(supply?.saltBags || 0)}`
  ].filter(Boolean);
  const supplyLabelFromFlags = (flags = {}) => [
    flags.acid && "חומצת מלח",
    flags.phUpSupply && "מעלה pH",
    flags.saltPkg && Number(flags.saltBags || 0) > 0 && `מלח ×${Number(flags.saltBags || 0)}`
  ].filter(Boolean).join(", ");
  const hasPendingSupply = (supply = {}) => !!(supply.acid || supply.phUpSupply || (supply.saltPkg && Number(supply.saltBags || 0) > 0));
  const nextSupplyStateForReport = (clientName, source = {}, prevSupply = {}) => {
    const requested = supplyFromReportLike(source);
    const supplied = suppliedListFrom(source.suppliedEquipment);
    const suppliedAcid = suppliedHas(supplied, "חומצת");
    const suppliedPhUp = suppliedHas(supplied, "סודה", "מעלה");
    const suppliedSalt = suppliedHas(supplied, "מלח");
    const nextAcid = !!(requested.acid || prevSupply.acid) && !suppliedAcid;
    const nextPhUpSupply = !!(requested.phUpSupply || prevSupply.phUpSupply) && !suppliedPhUp;
    const requestedSaltBags = Number(requested.saltBags || 0);
    const prevSaltBags = Number(prevSupply.saltBags || 0);
    const nextSaltBags = suppliedSalt ? 0 : (requested.saltPkg ? requestedSaltBags : prevSaltBags);
    const nextSaltPkg = !!(requested.saltPkg || prevSupply.saltPkg) && nextSaltBags > 0 && !suppliedSalt;
    const explicitAfterSupplied = {
      acid: !!requested.acid && !suppliedAcid,
      phUpSupply: !!requested.phUpSupply && !suppliedPhUp,
      saltPkg: !!requested.saltPkg && requestedSaltBags > 0 && !suppliedSalt,
      saltBags: requestedSaltBags
    };
    const nextSupplyDate = nextAcid || nextPhUpSupply || nextSaltPkg ? nextTreatmentDateForClient(clientName, source.reportDate, source.clientId) : "";
    return {
      shouldUpdate: !!(requested.acid || requested.phUpSupply || requested.saltPkg || supplied.length || hasPendingSupply(prevSupply)),
      explicitAfterSupplied,
      nextSupply: {
        acid: nextAcid,
        phUpSupply: nextPhUpSupply,
        saltPkg: nextSaltPkg,
        saltBags: nextSaltPkg ? nextSaltBags : 0,
        supplyNote: "",
        updatedAt: source.reportDate || todayStr(),
        nextSupplyDate,
        assignedOperator: prevSupply.assignedOperator || "",
        materialPrices: normalizeNextSupplyPrices(prevSupply.materialPrices),
        supplyId: prevSupply.supplyId || "",
        client: clientName,
        clientId: source.clientId || prevSupply.clientId || clientIdByName(clientName)
      }
    };
  };
  const persistSupplyDB = (db) => {
    if (!sheetId) return;
    const rows = Object.entries(db).map(([key,v])=>{
      const clientName = v.client || findClientByName("", v.clientId)?.name || key;
      return [clientName,v.acid?"כן":"לא",v.phUpSupply?"כן":"לא",v.saltPkg?"כן":"לא",v.saltBags||0,v.updatedAt,v.supplyNote||"",v.nextSupplyDate||"",v.assignedOperator||"",serializeNextSupplyPrices(v.materialPrices),v.supplyId||"",v.clientId||clientIdByName(clientName)];
    });
    void sheetCall("saveSupplyDB",{rows}).catch(e=>console.warn("Supply sync failed", e));
  };
  useEffect(() => {
    if (!sheetId || !Object.keys(supplyDB || {}).length) return;
    const timer = setInterval(() => persistSupplyDB(supplyDB), 180000);
    return () => clearInterval(timer);
  }, [sheetId, supplyDB]);
  const supplyDBWithPoolUpdate = (db, clientName, supply) => {
    const resolvedClientId = String(supply?.clientId || clientIdByName(clientName) || "").trim();
    const key = supplyStorageKey(clientName, resolvedClientId);
    const next = {...(db || {}), [key]:{...supply, client:clientName, clientId:resolvedClientId}};
    if (resolvedClientId && key !== clientName && clientIdByName(clientName) === resolvedClientId) {
      delete next[clientName];
      delete next[`legacy:${clientName}`];
    }
    return next;
  };
  const buildSupplyUpdateForReport = (source = {}, baseSupplyDB = supplyDB) => {
    const clientName = source.client || "";
    if (!clientName) return null;
    const prevSupply = clientSupplyFromDB(baseSupplyDB, clientName, source.clientId) || {};
    const {shouldUpdate, nextSupply} = nextSupplyStateForReport(clientName, source, prevSupply);
    if (!shouldUpdate) return null;
    const db = supplyDBWithPoolUpdate(baseSupplyDB, clientName, nextSupply);
    const row = [clientName,nextSupply.acid?"כן":"לא",nextSupply.phUpSupply?"כן":"לא",nextSupply.saltPkg?"כן":"לא",nextSupply.saltBags||0,nextSupply.updatedAt,nextSupply.supplyNote||"",nextSupply.nextSupplyDate||"",nextSupply.assignedOperator||"",serializeNextSupplyPrices(nextSupply.materialPrices),nextSupply.supplyId||"",nextSupply.clientId||clientIdByName(clientName)];
    return {db, row};
  };

  const sendNotificationToAdmins = async (title, message) => {
    const res = await sheetCall("sendAppNotificationToAdmins", { title, message }).catch(()=>null);
    return Number(res?.sent || res?.recipients || 0);
  };

  const loadTreatmentCounts = async () => {
    const res = await sheetCall("getTreatmentCounts");
    if (Array.isArray(res?.treatments)) setTreatmentCounts(res.treatments);
    return res?.treatments || [];
  };

  const loadOperatorIssues = async (silent=false) => {
    const res = await sheetCall("getOperatorIssues");
    if (res?.issues) setOperatorIssues(res.issues);
    if (!silent) showToast(`✅ ${res?.issues?.length||0} תקלות`);
    return res?.issues || [];
  };
  const loadOperatorDoneAlerts = async () => {
    const res = await sheetCall("getOperatorDoneAlerts", { date:dailyDate }).catch(()=>null);
    const alerts = Array.isArray(res?.alerts) ? res.alerts : [];
    setOperatorDoneAlerts(alerts);
    return alerts;
  };
  const dismissOperatorDoneAlert = async (alert) => {
    if (!alert?.id) return;
    setOperatorDoneAlerts(prev => prev.filter(item => String(item.id) !== String(alert.id)));
    await sheetCall("dismissOperatorDoneAlert", { id:alert.id, dismissedBy:user?.name || user?.username || "" }).catch(e=>console.warn("Dismiss operator done alert failed", e));
  };
  const notifyOperatorDoneForDay = async () => {
    if (isActionLoading("operatorDone")) return;
    const operatorName = dailyOwnerName(dailyDate) || user?.name || user?.username || "מפעיל";
    const message = `${operatorName} המפעיל סיים הכל להיום:)`;
    setAction("operatorDone", "loading");
    const saveRes = await sheetCall("saveOperatorDoneAlert", {
      date:dailyDate,
      operator:operatorName,
      message,
      createdBy:user?.name || user?.username || operatorName
    }).catch(()=>null);
    if (!saveRes?.success) {
      setAction("operatorDone", "error", 2200);
      showToast("לא נשמרה התראת סיום לאדמין");
      haptic("medium");
      return;
    }
    await sendNotificationToAdmins("המפעיל סיים הכל להיום", message).catch(e=>console.warn("Operator done admin notification failed", e));
    setAction("operatorDone", "success", 1600);
    showToast("נשלח לאדמין");
    haptic("success");
  };
  const saveInternalNoteForClient = async () => {
    if (!internalNoteEdit?.client) return;
    const clientName = internalNoteEdit.client;
    const clientIdValue = String(internalNoteEdit.clientId || "").trim();
    const readingKey = clientIdValue || clientName;
    const note = internalNoteEdit.note || "";
    setInternalNoteEdit(null);
    setLastReadings(prev => {
      const next = {
        ...prev,
        [readingKey]: {
          ...(lastReadingForClient(clientName, clientIdValue) || {}),
          client:clientName,
          clientId:clientIdValue,
          date: lastReadingForClient(clientName, clientIdValue)?.date || todayStr(),
          poolStatus: lastReadingForClient(clientName, clientIdValue)?.poolStatus || "מאוזנת",
          customStatusText: note
        }
      };
      try {
        const cached = JSON.parse(localStorage.getItem("galileo_cache") || "{}");
        localStorage.setItem("galileo_cache", JSON.stringify({...cached, lastReadings: next, cachedAt: Date.now()}));
      } catch {}
      return next;
    });
    const res = await sheetCall("saveClientInternalNote", {client: clientName, clientId: clientIdValue, note}).catch(()=>null);
    if (res?.success) showToast("✅ הערה פנימית נשמרה");
    else showToast("⚠️ ההערה עודכנה מקומית, שמירה בשיטס נכשלה");
    haptic(res?.success ? "success" : "medium");
  };
  const issueText = (value) => String(value || "").trim();
  const isCriticalIssue = (priority) => issueText(priority).includes("קריט") || issueText(priority).includes("§");
  const isIssueInProgress = (status) => issueText(status).includes("בטיפול") || issueText(status).includes("˜™₪");
  const isIssueDone = (status) => issueText(status).includes("טופל") || issueText(status).includes("˜•₪");

  const sendPendingOperatorIssueItem = async (issue) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const offlineItem = updatePendingOperatorIssue(issue, {lastError:"offline"});
      return {success:false, item:offlineItem, offline:true};
    }
    const issueKey = pendingOperatorIssueKey(issue);
    if (operatorIssueInFlightIdsRef.current.has(issueKey)) return {success:false, item:issue, skipped:true};
    operatorIssueInFlightIdsRef.current.add(issueKey);
    const latestIssue = pendingOperatorIssuesRef.current.find(item => samePendingOperatorIssue(item, issue)) || issue;
    const clean = updatePendingOperatorIssue(latestIssue, {
      lastAttemptAt:new Date().toISOString(),
      attemptCount:Number(latestIssue?.attemptCount || 0) + 1,
      lastError:""
    });
    try {
      const res = await sheetCall("saveOperatorIssue", {
        localId: clean.localId,
        operator: clean.operator,
        client: clean.client,
        clientId: clean.clientId,
        desc: clean.desc,
        priority: clean.priority,
        date: clean.date
      }).catch(()=>null);
      if (res?.success) return {success:true, item:clean};
      const failedItem = updatePendingOperatorIssue(clean, {lastError:String(res?.error || "send_failed")});
      return {success:false, item:failedItem};
    } finally {
      operatorIssueInFlightIdsRef.current.delete(issueKey);
    }
  };

  const syncPendingOperatorIssues = async (maxItems = Infinity, silent = false, preferredIssue = null) => {
    const storedIssues = pendingOperatorIssuesRef.current;
    const scheduledIssues = [...storedIssues].sort((a,b) => {
      const priorityOrder = Number(isCriticalIssue(b?.priority)) - Number(isCriticalIssue(a?.priority));
      if (priorityOrder) return priorityOrder;
      const aAttempt = String(a?.lastAttemptAt || "");
      const bAttempt = String(b?.lastAttemptAt || "");
      if (!aAttempt && bAttempt) return -1;
      if (aAttempt && !bAttempt) return 1;
      return aAttempt.localeCompare(bAttempt) || String(a?.createdAt || "").localeCompare(String(b?.createdAt || ""));
    });
    const currentIssues = preferredIssue
      ? [
          storedIssues.find(item => samePendingOperatorIssue(item, preferredIssue)) || makePendingOperatorIssue(preferredIssue),
          ...scheduledIssues.filter(item => !samePendingOperatorIssue(item, preferredIssue))
        ]
      : scheduledIssues;
    if (!currentIssues.length) return {success:true, sent:0, failed:0};
    if (operatorIssueSyncRef.current) {
      if (preferredIssue && isCriticalIssue(preferredIssue.priority)) {
        const urgentResult = await sendPendingOperatorIssueItem(preferredIssue);
        if (urgentResult.success) {
          const {issues:remaining} = commitPendingOperatorIssues(latest =>
            latest.filter(item => !samePendingOperatorIssue(item, preferredIssue))
          );
          return {success:true, sent:1, failed:remaining.length};
        }
        return {success:false, sent:0, failed:pendingOperatorIssuesRef.current.length, skipped:!!urgentResult.skipped};
      }
      return {success:false, sent:0, failed:currentIssues.length, skipped:true};
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) return {success:false, sent:0, failed:currentIssues.length, offline:true};
    operatorIssueSyncRef.current = true;
    const itemsToSync = Number.isFinite(maxItems) ? currentIssues.slice(0, Math.max(1, maxItems)) : currentIssues;
    const sentKeys = new Set();
    const failedByKey = new Map();
    try {
      for (const item of itemsToSync) {
        const result = await sendPendingOperatorIssueItem(item);
        const key = pendingOperatorIssueKey(item);
        if (result.success) sentKeys.add(key);
        else failedByKey.set(key, result.item || item);
      }
      const {issues:remaining} = commitPendingOperatorIssues(latest => latest
        .filter(item => !sentKeys.has(pendingOperatorIssueKey(item)))
        .map(item => failedByKey.get(pendingOperatorIssueKey(item)) || item));
      const preferredStillPending = preferredIssue
        ? remaining.some(item => samePendingOperatorIssue(item, preferredIssue))
        : false;
      if (sentKeys.size && !silent) showToast(remaining.length ? `${remaining.length} תקלות עדיין ממתינות לשליחה` : "כל התקלות נשלחו לאדמין");
      return {
        success:preferredIssue ? !preferredStillPending : remaining.length === 0,
        sent:sentKeys.size,
        failed:remaining.length
      };
    } finally {
      operatorIssueSyncRef.current = false;
    }
  };

  const queueCriticalFlowIssue = (report) => {
    if (report.flow !== "לא תקין") return null;
    showToast("🚨 נרשמת תקלה קריטית בזרימה...");
    const issue = {
      localId:report.id ? `opissue-flow-${report.id}` : undefined,
      operator: report.operator || user?.name || "",
      client: operatorIssuePoolLabel(report.client, report.clientId),
      clientId: report.clientId || "",
      desc: `תקלה קריטית בזרימה - נפתחה אוטומטית מדוח טיפול (${fmtDate(report.reportDate)})`,
      priority: "קריטי",
      date: report.reportDate || todayStr()
    };
    const alreadyQueued = pendingOperatorIssuesRef.current.some(item => samePendingOperatorIssue(item, issue));
    const pendingIssue = addPendingOperatorIssue(issue);
    setPendingBackgroundSync(true);
    if (!alreadyQueued) setOperatorIssues(prev => [operatorIssueToRow(pendingIssue), ...prev]);
    return pendingIssue;
  };

  const deliverCriticalFlowIssue = async (pendingIssue) => {
    if (!pendingIssue) return null;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      showToast(pendingIssue._localPersisted
        ? "התקלה נשמרה מקומית ותישלח כשיחזור חיבור"
        : "שמירת התקלה בטלפון נכשלה - הדוח נשאר בתור וינסה ליצור אותה שוב");
      return { success:false, local:pendingIssue._localPersisted, offline:true };
    }
    const result = await syncPendingOperatorIssues(1, true, pendingIssue);
    if (result.success) {
      showToast("תקלה קריטית נשלחה לאדמין");
      return { success:true };
    }
    showToast(pendingIssue._localPersisted
      ? "התקלה נשמרה מקומית, בדוק חיבור"
      : "השליחה והשמירה המקומית נכשלו - השאר את האפליקציה פתוחה ונסה שוב");
    return { success:false, local:pendingIssue._localPersisted };
  };

  const reportCriticalFlowIssue = async (report) =>
    deliverCriticalFlowIssue(queueCriticalFlowIssue(report));

  const dismissCriticalIssue = (id) => {
    const next = [...new Set([...dismissedCriticalIssueIds, String(id)])];
    setDismissedCriticalIssueIds(next);
    localStorage.setItem("galileo_dismissed_critical_issues", JSON.stringify(next));
  };

  const notifyOperatorIssueAcknowledged = async () => false;

  const acknowledgeCriticalIssue = async (issue, index) => {
    const note = `אושר על ידי ${user?.name || "אדמין"} - תקלה קריטית בטיפול מיידי`;
    const issueId = issue?.[0];
    const updated = [...operatorIssues];
    updated[index] = [...issue];
    updated[index][5] = "בטיפול";
    updated[index][6] = note;
    setOperatorIssues(updated);
    dismissCriticalIssue(issueId);
    await sheetCall("updateOperatorIssue", {rowIndex:index+1, status:"בטיפול", response:note}).catch(e => console.warn("Critical issue sheet update failed", e));
    await notifyOperatorIssueAcknowledged(issue, note);
    showToast("✅ התקלה אושרה ונשלחה התראה למפעיל");
    haptic("success");
  };

  const sendNotificationToOperators = async (ops=[], title, message) => {
    const names = Array.isArray(ops) ? ops : [ops];
    const targets = names
      .map(findPushUser)
      .filter(u => u?.username);
    const results = await Promise.all(targets.map(u => sendAppNotificationToUser(title, message, u.username).catch(()=>false)));
    return results.filter(Boolean).length;
  };
  const sendNotificationToSubOperators = async (subs=[], title, message) => {
    const list = Array.isArray(subs) ? subs : [subs];
    const targets = list
      .map(findPushUser)
      .filter(u => u?.username);
    const results = await Promise.all(targets.map(u => sendAppNotificationToUser(title, message, u.username).catch(()=>false)));
    return results.filter(Boolean).length;
  };



  useEffect(()=>{
    getOneSignalInstance().catch(e => console.warn("Push preload failed:", e));
  },[]);

  useEffect(()=>{
    if(!user) return;
    setGreeting(getDailyGreeting(user.username || ""));
    const refresh = async() => {
      if (operatorRefreshRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      operatorRefreshRef.current = true;
      try {
        const versionR = await sheetCall("getOperatorRefreshVersion");
        const versionKey = `${String(versionR?.version || "")}:${dailyDate}`;
        const forceFullRefresh = Date.now() - operatorRefreshLastFullRef.current >= 60000;
        if (!forceFullRefresh && versionR?.version && operatorRefreshVersionRef.current === versionKey) return;
        const preserveLoadedReportRange = screen === "admin" && adminTab === "reports";
        const [liveR, repR] = await Promise.all([
          sheetCall("getOperatorRefreshData"),
          preserveLoadedReportRange
            ? Promise.resolve(null)
            : sheetCall("getReports", {fromDate:dailyDate, toDate:dailyDate, limit:300}),
        ]);
        const tR = {tasks:liveR?.tasks};
        const uR = {users:liveR?.users};
        const oR = {adminOrders:liveR?.adminOrders};
        const shR = {sharedSubOrders:liveR?.sharedSubOrders};
        const apR = {approvals:liveR?.subOperatorApprovals};
        const prR = {pendingSubReports:liveR?.pendingSubReports};
        const lrR = {lastReadings:liveR?.lastReadings};
        const setR = {settings:liveR?.settings};
        if(Array.isArray(tR?.tasks)) setTasks(tR.tasks);
        if(Array.isArray(oR?.adminOrders)) setAdminOrders(oR.adminOrders);
        if(Array.isArray(shR?.sharedSubOrders)) setSharedSubOrders(shR.sharedSubOrders);
        if(Array.isArray(apR?.approvals)) setSubOperatorApprovals(apR.approvals);
        if(Array.isArray(prR?.pendingSubReports)) setPendingSubReports(prR.pendingSubReports);
        if(lrR?.lastReadings) setLastReadings(lrR.lastReadings);
        if(setR?.settings?.waMessageTemplate) setWaMessageTemplate(normalizeWaMessageTemplate(setR.settings.waMessageTemplate));
        if(setR?.settings?.acidSupplyMessage) setAcidSupplyMessage(normalizeAcidSupplyMessage(setR.settings.acidSupplyMessage));
        if(setR?.settings?.phUpSupplyMessage) setPhUpSupplyMessage(normalizePhUpSupplyMessage(setR.settings.phUpSupplyMessage));
        if(setR?.settings?.saltSupplyMessage) setSaltSupplyMessage(normalizeSaltSupplyMessage(setR.settings.saltSupplyMessage));
        if(setR?.settings?.chlorineReminderMessage) setChlorineReminderMessage(normalizeChlorineReminderMessage(setR.settings.chlorineReminderMessage));
        if(setR?.settings?.waterLevelNoticeMessage) setWaterLevelNoticeMessage(normalizeWaterLevelNoticeMessage(setR.settings.waterLevelNoticeMessage));
        if(Array.isArray(repR?.reports)) {
          setSheetReports(previous => repR.reports.reduce(
            (next, report) => upsertReportByIdentity(next, report),
            previous
          ));
        }
        if(Array.isArray(uR?.users) && uR.users.length) applyFetchedUsers(uR.users);
        if (versionR?.version) operatorRefreshVersionRef.current = versionKey;
        operatorRefreshLastFullRef.current = Date.now();
        try {
          const cached = localStorage.getItem("galileo_cache");
          const c = cached ? JSON.parse(cached) : {};
          localStorage.setItem("galileo_cache", JSON.stringify({
            ...c,
            tasks:Array.isArray(tR?.tasks) ? tR.tasks : c.tasks,
            adminOrders:Array.isArray(oR?.adminOrders) ? oR.adminOrders : c.adminOrders,
            sharedSubOrders:Array.isArray(shR?.sharedSubOrders) ? shR.sharedSubOrders : c.sharedSubOrders,
            subOperatorApprovals:Array.isArray(apR?.approvals) ? apR.approvals : c.subOperatorApprovals,
            pendingSubReports:Array.isArray(prR?.pendingSubReports) ? prR.pendingSubReports : c.pendingSubReports,
            waMessageTemplate:setR?.settings?.waMessageTemplate || c.waMessageTemplate,
            acidSupplyMessage:setR?.settings?.acidSupplyMessage || c.acidSupplyMessage,
            phUpSupplyMessage:setR?.settings?.phUpSupplyMessage || c.phUpSupplyMessage,
            saltSupplyMessage:setR?.settings?.saltSupplyMessage || c.saltSupplyMessage,
            chlorineReminderMessage:setR?.settings?.chlorineReminderMessage || c.chlorineReminderMessage,
            waterLevelNoticeMessage:setR?.settings?.waterLevelNoticeMessage || c.waterLevelNoticeMessage,
            lastReadings:lrR?.lastReadings || c.lastReadings,
            sheetReports:Array.isArray(repR?.reports)
              ? repR.reports.reduce(
                  (next, report) => upsertReportByIdentity(next, report),
                  Array.isArray(c.sheetReports) ? c.sheetReports : []
                )
              : c.sheetReports,
            users:Array.isArray(uR?.users) && uR.users.length ? uR.users : c.users,
            cachedAt:Date.now()
          }));
        } catch {}
      } finally {
        operatorRefreshRef.current = false;
      }
    };
    const interval = setInterval(refresh, 10000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return ()=>{ clearInterval(interval); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refreshWhenVisible); };
  },[user, dailyDate, screen, adminTab]);

  useEffect(()=>{
    if(!user) return;
    const onStorage = (e) => {
      const key = e.key || "";
      if (key.startsWith("galileo_admin_order:") || key.startsWith("galileo_operator_order:") || key.startsWith("galileo_shared_sub_order:") || key.startsWith("galileo_sub_operator:")) {
        setSubOperatorRefresh(x=>x+1);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  },[user]);

  const localKey = (...parts) => parts.map(p=>String(p||"").replaceAll(":", "_")).join(":");
  const readLocalArray = (key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };


  const writeLocalArray = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value || []));
  };
  const savePendingSubReports = async (next) => {
    const clean = Array.isArray(next) ? next : [];
    setPendingSubReports(clean);
    localStorage.setItem("galileo_sub_operator_pending_reports", JSON.stringify(clean));
    const res = await sheetCall("savePendingSubReports", {pendingSubReports:clean});
    if (!res?.success) throw new Error(res?.error || "savePendingSubReports failed");
    return clean;
  };
  const removePendingSubReport = async (id) => {
    const next = pendingSubReports.filter(item => item.id !== id);
    try {
      await savePendingSubReports(next);
    } catch(e) {
      console.warn("Pending sub report removal sync failed", e);
      setPendingSubReports(next);
    }
    setDeferredSubReportIds(ids => ids.filter(x => x !== id));
    setActiveSubReportApprovalId(current => current === id ? "" : current);
  };
  const adminOrderKey = (date, opName) => localKey("galileo_admin_order", date, opName);
  const operatorOrderKey = (username, date) => localKey("galileo_operator_order", username, date);
  const sharedSubOrderKey = (date, opName, subUsername) => localKey("galileo_shared_sub_order", date, opName, subUsername);
  const subOperatorAssignKey = (date, opName) => localKey("galileo_sub_operator", date, opName);
  const subOperatorApprovalKey = (date, opName, subUsername) => localKey("galileo_sub_operator_approval", date, opName, subUsername);
  const canonicalSubUsername = (value) => {
    const v = normalizeName(value);
    if (!v) return "";
    const match = subOperatorUsers.find(su => normalizeName(su?.username) === v || normalizeName(su?.name) === v);
    return String(match?.username || value || "").trim();
  };
  const sharedSubMatch = (row, date, opName, subUsername) => {
    const target = normalizeName(canonicalSubUsername(subUsername));
    return normalizeDate(row?.date) === date &&
      normalizeName(row?.operator) === normalizeName(opName) &&
      (normalizeName(canonicalSubUsername(row?.subUsername)) === target || normalizeName(canonicalSubUsername(row?.subOperator)) === target);
  };
  const lockedClientsKey = (username, date) => localKey("galileo_locked_clients", username, date);
  const rawLinkedOperatorValue = (u) => String(
    u?.linkedOperator ||
    u?.assignedOperator ||
    u?.parentOperator ||
    u?.regularOperator ||
    u?.operator ||
    u?.["מפעיל משויך"] ||
    u?.["מפעיל_משויך"] ||
    u?.["מפעיל קבוע"] ||
    u?.["מפעיל_קבוע"] ||
    ""
  ).trim();
  const resolveOperatorName = (value) => {
    const v = normalizeName(value);
    if (!v) return "";
    const match = operatorUsers.find(op => normalizeName(op.name) === v || normalizeName(op.username) === v);
    return String(match?.name || value || "").trim();
  };
  const resolveKnownOperatorName = (value) => {
    const v = normalizeName(value);
    if (!v) return "";
    const match = operatorUsers.find(op => normalizeName(op.name) === v || normalizeName(op.username) === v);
    return String(match?.name || "").trim();
  };
  const getAssignedSubOperator = (date, opName) => {
    const fromUsers = subOperatorUsers.find(su => {
      const linked = rawLinkedOperatorValue(su);
      return normalizeName(resolveKnownOperatorName(linked) || linked) === normalizeName(opName);
    });
    if (fromUsers?.username) return String(fromUsers.username || "");
    return "";
  };
  const updateSubOperatorUserCache = (username, opName) => {
    if (!username) return;
    setAllUsers(prev => {
      const next = prev.map(u => normalizeName(u?.username) === normalizeName(username)
        ? {...u, linkedOperator:opName || "", assignedOperator:opName || "", operator:opName || ""}
        : u
      );
      try {
        const cached = localStorage.getItem("galileo_cache");
        const c = cached ? JSON.parse(cached) : {};
        localStorage.setItem("galileo_cache", JSON.stringify({...c, users:next}));
      } catch {}
      return next;
    });
    setUser(current => {
      if (!current || normalizeName(current.username) !== normalizeName(username)) return current;
      const merged = {...current, linkedOperator:opName || "", assignedOperator:opName || "", operator:opName || ""};
      localStorage.setItem("galileo_user", JSON.stringify(merged));
      return merged;
    });
  };
  const isSameSubOperator = (saved, u) => {
    const value = normalizeName(canonicalSubUsername(saved));
    return !!value && value === normalizeName(canonicalSubUsername(u?.username || u?.name));
  };
  const subOperatorValues = (u) => [canonicalSubUsername(u?.username || u?.name), u?.name].map(normalizeName).filter(Boolean);
  const setAssignedSubOperator = async (date, opName, username) => {
    const key = subOperatorAssignKey(date, opName);
    const nextUsername = canonicalSubUsername(username);
    const previousUsername = getAssignedSubOperator(date, opName);
    localStorage.removeItem(key);
    updateSubOperatorUserCache(previousUsername, "");
    updateSubOperatorUserCache(nextUsername, opName);
    setSubOperatorRefresh(x=>x+1);
    const previousUser = subOperatorUsers.find(su => isSameSubOperator(previousUsername, su));
    const nextUser = subOperatorUsers.find(su => isSameSubOperator(nextUsername, su));
    const removeValues = subOperatorValues(previousUser);
    const addValues = [nextUser?.name, nextUser?.username].filter(Boolean);
    const nextTasks = tasks.map(t => {
      const sameDayOperator = normalizeDate(t.date) === date && (t.operators || []).some(op => normalizeName(op) === normalizeName(opName));
      if (!sameDayOperator) return t;
      const cleanedOps = (t.operators || []).filter(op => !removeValues.includes(normalizeName(op)));
      addValues.forEach(v => {
        if (v && !cleanedOps.some(op => normalizeName(op) === normalizeName(v))) cleanedOps.push(v);
      });
      return {...t, operators: cleanedOps.filter(Boolean)};
    });
    setTasks(nextTasks);
    if (sheetId) {
      const changedTasks = nextTasks.filter((task, index) => task !== tasks[index]);
      const taskResult = await sheetCall("mutateTasks", {upserts:changedTasks}).catch(e => {
        console.warn("Sub-operator task assignment sync failed", e);
        return null;
      });
      if (Array.isArray(taskResult?.tasks)) setTasks(taskResult.tasks);
    }
    if (sheetId) {
      try {
        if (previousUsername && previousUsername !== nextUsername) await sheetCall("saveSubOperatorAssignment", {username: previousUsername, operator: ""});
        if (nextUsername) await sheetCall("saveSubOperatorAssignment", {username: nextUsername, operator: opName});
        const usersRes = await sheetCall("getUsers");
        if (Array.isArray(usersRes?.users) && usersRes.users.length > 0) applyFetchedUsers(usersRes.users);
      } catch(e) {
        console.warn("Sub-operator assignment sync failed", e);
      }
    }
    if (nextUser?.username) {
      void sendAppNotificationToUser("שיוך עוזר מפעיל", `שויכת למפעיל ${opName} לתאריך ${fmtDate(date)}`, nextUser.username)
        .catch(e => console.warn("Sub-operator assignment notification failed", e));
    }
    if (previousUser?.username && previousUser.username !== nextUser?.username) {
      void sendAppNotificationToUser("שיוך עוזר מפעיל הוסר", `השיוך למפעיל ${opName} לתאריך ${fmtDate(date)} הוסר`, previousUser.username)
        .catch(e => console.warn("Sub-operator unassignment notification failed", e));
    }
  };
  const findAssignedOperatorForSub = (date, subUser=user) => {
    if (!subUser) return "";
    const exact = operatorUsers.find(op => isSameSubOperator(getAssignedSubOperator(date, op.name), subUser))?.name;
    if (exact) return exact;
    const subValues = subOperatorValues(subUser);
    const orderMatch = adminOrders.find(o =>
      normalizeDate(o.date) === date &&
      subValues.includes(normalizeName(o.subOperator || ""))
    );
    if (orderMatch?.operator) return resolveOperatorName(orderMatch.operator);
    const taskMatch = tasks.find(t =>
      normalizeDate(t.date) === date &&
      (t.createdByAdminOrder || Number(t.orderIndex || 0) > 0) &&
      (t.operators || []).some(op => subValues.includes(normalizeName(op)))
    );
    const taskOperator = (taskMatch?.operators || []).find(op => !subValues.includes(normalizeName(op)));
    if (taskOperator) return resolveOperatorName(taskOperator);
    return "";
  };
  const linkedOperatorName = (u=user, date=dailyDate) => findAssignedOperatorForSub(date, u) || resolveOperatorName(rawLinkedOperatorValue(u));
  const dailyOwnerName = (date=dailyDate) => isSubOperatorRole(user?.role) ? (linkedOperatorName(user, date) || user?.name || "") : (user?.name || "");
  const isSubOperatorApproved = (date=dailyDate, opName=dailyOwnerName(date), subUsername=user?.username) =>
    subOperatorApprovals.some(row => sharedSubMatch(row, date, opName, subUsername) && row.approved !== false);
  const saveSubOperatorApprovals = async (next) => {
    setSubOperatorApprovals(next);
    const res = await sheetCall("saveSubOperatorApprovals", {approvals:next});
    if (!res?.success) throw new Error(res?.error || "saveSubOperatorApprovals failed");
  };
  const approveSubOperator = async (date, opName, subUsername) => {
    const subUser = subOperatorUsers.find(su => isSameSubOperator(subUsername, su));
    const row = {date, operator:opName, subUsername, subOperator:subUser?.name || subUsername, approved:true, approvedAt:nowStr(), approvedBy:user?.name || ""};
    const next = [...subOperatorApprovals.filter(x=>!sharedSubMatch(x, date, opName, subUsername)), row];
    try {
      await saveSubOperatorApprovals(next);
      localStorage.removeItem(subOperatorApprovalKey(date, opName, subUsername));
      setSubOperatorRefresh(x=>x+1);
      void sendAppNotificationToUser("אישור מילוי דוחות", `אושרת למילוי דוחות עבור ${opName} בתאריך ${fmtDate(date)}`, subUsername)
        .catch(e => console.warn("Sub-operator approval notification failed", e));
      showToast("✅ עוזר מפעיל אושר למילוי דוחות");
      haptic("success");
    } catch(e) {
      console.warn("Sub-operator approval sync failed", e);
      showToast("שמירת הרשאה נכשלה");
      haptic("medium");
    }
  };
  const revokeSubOperatorApproval = async (date, opName, subUsername) => {
    const next = subOperatorApprovals.filter(x=>!sharedSubMatch(x, date, opName, subUsername));
    try {
      await saveSubOperatorApprovals(next);
      localStorage.removeItem(subOperatorApprovalKey(date, opName, subUsername));
      setSubOperatorRefresh(x=>x+1);
      showToast("הרשאת העריכה בוטלה");
      haptic("medium");
    } catch(e) {
      console.warn("Sub-operator approval revoke failed", e);
      showToast("ביטול ההרשאה נכשל");
      haptic("medium");
    }
  };
  const todayReported = [
    ...sheetReports,
    ...reports.filter(r=>!r._fromSheet)
  ].filter((r, idx, arr) => {
    const opName = dailyOwnerName(dailyDate) || user?.name || "";
    if (normalizeDate(r.reportDate) !== dailyDate || normalizeName(r.operator) !== normalizeName(opName) || !r.client) return false;
    return arr.findIndex(x =>
      normalizeDate(x.reportDate) === dailyDate &&
      normalizeName(x.operator) === normalizeName(opName) &&
      samePoolIdentity(x, r)
    ) === idx;
  }).map(r=>({client:r.client,clientId:r.clientId||""}));
  const taskForClientOperator = (date, clientName, opName, clientIdValue = "") => tasks.find(t =>
    normalizeDate(t.date) === date &&
    samePoolIdentity(t, {client:clientName,clientId:clientIdValue}) &&
    (t.operators || []).some(op => normalizeName(op) === normalizeName(opName))
  );
  const taskDoneForClient = (date, clientName, opName, clientIdValue = "") => {
    const pool = {client:clientName,clientId:clientIdValue};
    const task = taskForClientOperator(date, clientName, opName, clientIdValue);
    return task?.status === "done" || reports.some(r => r.reportDate === date && samePoolIdentity(r, pool) && normalizeName(r.operator) === normalizeName(opName));
  };
  const progressReportsForOperator = (date, opName) => {
    const seen = new Set();
    return [...sheetReports, ...reports.filter(r=>!r._fromSheet)]
      .filter(r => normalizeDate(r.reportDate) === date && normalizeName(r.operator) === normalizeName(opName) && r.client)
      .filter(r => {
        const key = `${normalizeDate(r.reportDate)}:${normalizeName(r.operator)}:${poolIdentityKey(r)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };
  const getOperatorProgressEntries = (date, opName) => {
    const byClient = new Map();
    getAdminOrderEntries(date, opName).forEach((entry, index) => {
      if (!entry?.client) return;
      const normalizedEntry = {...entry, client:entry.client, clientId:entry.clientId||clientIdByName(entry.client), orderIndex:Number(entry.orderIndex || index + 1), reported:false, source:"order"};
      byClient.set(poolIdentityKey(normalizedEntry), normalizedEntry);
    });
    progressReportsForOperator(date, opName).forEach((report, index) => {
      const key = poolIdentityKey(report);
      const existing = byClient.get(key);
      byClient.set(key, {
        ...(existing || {client:report.client, clientId:report.clientId||clientIdByName(report.client), note:"", orderIndex:9999 + index, source:"report"}),
        reported:true,
        report
      });
    });
    return [...byClient.values()].sort((a,b)=>Number(a.orderIndex || 9999)-Number(b.orderIndex || 9999));
  };
  const baseOperatorClients = (date, opName) => {
    const dayName = dateDayName(date);
    const assigned = [];
    clients.forEach(c => {
      const days = String(c.regularDays || "").split(",").map(d=>normalizeDay(d.trim()));
      const opMatch = !c.regularOperator || normalizeName(c.regularOperator) === normalizeName(opName);
      const dayMatch = days.some(d=>d === dayName);
      if (opMatch && dayMatch) assigned.push({client:c.name,clientId:clientId(c)});
    });
    return assigned.filter(item=>item.client).map((item, index) => ({...item, note: "", orderIndex: index + 1}));
  };
  const getAdminOrderEntries = (date, opName) => {
    const fromTasks = getSheetAdminOrderEntries(date, opName);
    if (fromTasks.length) return fromTasks;
    return sheetId ? [] : getLocalAdminOrderEntries(date, opName);
  };
  const getLocalAdminOrderEntries = (date, opName) => readLocalArray(adminOrderKey(date, opName))
      .filter(x=>x?.client)
      .map((x, i)=>({client:x.client, clientId:x.clientId||clientIdByName(x.client), note:x.note || "", orderIndex:Number(x.orderIndex || i + 1)}));
  const getSheetAdminOrderEntries = (date, opName) => {
    const fromOrders = adminOrders
      .filter(o => normalizeDate(o.date) === date && normalizeName(o.operator) === normalizeName(opName))
      .map((o, i)=>({id:o.id, client:o.client, clientId:o.clientId||clientIdByName(o.client), note:o.adminNote || "", orderIndex:Number(o.orderIndex || i + 1), status:o.status || "pending", changeLog:o.changeLog || []}))
      .sort((a,b)=>a.orderIndex-b.orderIndex);
    if (fromOrders.length) {
      const byClient = new Map();
      fromOrders.forEach(o => byClient.set(poolIdentityKey(o), o));
      return [...byClient.values()].sort((a,b)=>a.orderIndex-b.orderIndex);
    }
    return tasks
      .filter(t =>
        normalizeDate(t.date) === date &&
        (t.operators || []).some(op => normalizeName(op) === normalizeName(opName)) &&
        (t.createdByAdminOrder || Number(t.orderIndex || 0) > 0)
      )
      .map((t, i)=>({id:t.id, client:t.client, clientId:t.clientId||clientIdByName(t.client), note:t.adminNote || "", orderIndex:Number(t.orderIndex || i + 1), status:t.status || "pending", changeLog:t.changeLog || []}))
      .sort((a,b)=>a.orderIndex-b.orderIndex);
  };
  const getEffectiveAdminOrderEntries = (date, opName) => {
    const fromSheet = getSheetAdminOrderEntries(date, opName);
    if (fromSheet.length) return fromSheet;
    return sheetId ? [] : getLocalAdminOrderEntries(date, opName).sort((a,b)=>a.orderIndex-b.orderIndex);
  };
  const prepareAdminOrderEntries = (entries) => {
    const byClient = new Map();
    (entries || []).filter(x=>x?.client).forEach((x, i) => {
      const orderNumber = Number(x.orderIndex);
      const normalizedEntry = {client:x.client, clientId:x.clientId||clientIdByName(x.client), note:x.note || "", orderIndex:Number.isFinite(orderNumber) && orderNumber > 0 ? orderNumber : i + 1};
      byClient.set(poolIdentityKey(normalizedEntry), normalizedEntry);
    });
    return [...byClient.values()].sort((a,b)=>Number(a.orderIndex || 9999)-Number(b.orderIndex || 9999)).map((x, i)=>({...x, orderIndex:Number(x.orderIndex || i + 1)}));
  };
  const adminOrderDedupeKey = (o) => [normalizeDate(o?.date), normalizeName(o?.operator), poolIdentityKey(o)].join("|");
  const dedupeAdminOrders = (orders) => {
    const map = new Map();
    (orders || []).filter(o=>o?.date && o?.operator && o?.client).forEach(o => map.set(adminOrderDedupeKey(o), o));
    return [...map.values()];
  };
  const syncAdminOrderTasks = async (date, opName, entries) => {
    const clean = prepareAdminOrderEntries(entries);
    if (sheetId) {
      const result = await sheetCall("saveAdminOrderScope", {
        date,
        operator:opName,
        orders:clean,
        changedAt:nowStr(),
        changedBy:user?.name || ""
      }).catch(() => null);
      if (!result?.success || !Array.isArray(result?.adminOrders)) {
        return {success:false, clean, error:result?.error || "admin order scope save failed"};
      }
      setAdminOrders(dedupeAdminOrders(result.adminOrders));
      writeLocalArray(adminOrderKey(date, opName), clean);
      setSubOperatorRefresh(x=>x+1);
      return {success:true, clean};
    }

    const sourceOrders = adminOrders;
    const existingByClient = new Map(sourceOrders
      .filter(o => normalizeDate(o.date) === date && normalizeName(o.operator) === normalizeName(opName))
      .map(o => [poolIdentityKey(o), o])
    );
    const orderRows = clean.map((entry, i) => {
      const existing = existingByClient.get(poolIdentityKey(entry));
      return {
        ...(existing || {}),
        id: existing?.id || `admin-order-${date}-${normalizeName(opName)}-${entry.clientId || normalizeName(entry.client)}`,
        date,
        operator: opName,
        client: entry.client,
        clientId: entry.clientId || clientIdByName(entry.client),
        status: existing?.status || "pending",
        changeLog: existing?.changeLog || [{at:nowStr(),note:"סדר יום עודכן",by:user?.name,needsAck:false,ackedBy:[]}],
        orderIndex: Number(entry.orderIndex || i + 1),
        adminNote: entry.note || ""
      };
    });
    const cleanedOrders = sourceOrders.filter(o => !(normalizeDate(o.date) === date && normalizeName(o.operator) === normalizeName(opName)));
    const nextOrders = dedupeAdminOrders([...cleanedOrders, ...orderRows]);
    setAdminOrders(nextOrders);
    writeLocalArray(adminOrderKey(date, opName), clean);
    setSubOperatorRefresh(x=>x+1);
    return {success:true, clean};
  };
  const loadAdminOrderDraft = (date, opName) => {
    const entries = opName ? getAdminOrderEntries(date, opName) : [];
    setAdminOrderDraft(entries);
    return entries;
  };
  const getSharedSubOrderEntries = (date, opName, subUsername) => {
    const fromSheet = sharedSubOrders
      .filter(x=>sharedSubMatch(x, date, opName, subUsername) && x?.client)
      .map((x, i)=>({id:x.id, client:x.client, clientId:x.clientId||clientIdByName(x.client), note:x.note || x.adminNote || "", orderIndex:Number(x.orderIndex || i + 1), status:x.status || "pending", changeLog:x.changeLog || [], completedAt:x.completedAt || "", completedBy:x.completedBy || "", reportId:x.reportId || ""}))
      .sort((a,b)=>a.orderIndex-b.orderIndex);
    if (fromSheet.length) return fromSheet;
    if (sheetId) return [];
    return readLocalArray(sharedSubOrderKey(date, opName, subUsername))
      .filter(x=>x?.client)
      .map((x, i)=>({id:x.id, client:x.client, clientId:x.clientId||clientIdByName(x.client), note:x.note || x.adminNote || "", orderIndex:Number(x.orderIndex || i + 1), status:x.status || "pending", changeLog:x.changeLog || [], completedAt:x.completedAt || "", completedBy:x.completedBy || "", reportId:x.reportId || ""}))
      .sort((a,b)=>a.orderIndex-b.orderIndex);
  };
  const entriesToDailyTasks = (date, opName, entries, idPrefix="order") => (entries || [])
    .filter(entry=>entry?.client)
    .map((entry, i) => {
      const orderIndex = Number(entry.orderIndex || i + 1);
      return {id:entry.id || `${idPrefix}-${date}-${entry.clientId || entry.client}`, client:entry.client, clientId:entry.clientId||clientIdByName(entry.client), operators:[opName], date, status:entry.status || "pending", changeLog:entry.changeLog || [], orderIndex, adminNote:entry.note || entry.adminNote || "", completedAt:entry.completedAt || "", completedBy:entry.completedBy || "", reportId:entry.reportId || "", createdByAdminOrder:true, _adminOrder:true, _waterCheck:!!entry._waterCheck};
    })
    .sort((a,b)=>Number(a.orderIndex||999)-Number(b.orderIndex||999));
  const moveAdminOrderItem = (from, to) => {
    if (from === to || from < 0 || to < 0) return;
    setAdminOrderDraft(current => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next.map((x, i)=>({...x, orderIndex:i + 1}));
    });
  };
  const getLockedClients = (date=dailyDate) => new Set(readLocalArray(lockedClientsKey(user?.username || user?.name, date)));
  const setClientLockedLocal = (task, locked, date=dailyDate) => {
    const poolKey = poolIdentityKey(task);
    const key = lockedClientsKey(user?.username || user?.name, date);
    const current = new Set(readLocalArray(key));
    locked ? current.add(poolKey) : current.delete(poolKey);
    writeLocalArray(key, [...current]);
  };
  const startClientLongPress = (task, locked=false) => {
    const poolKey = poolIdentityKey(task);
    clearTimeout(longPressTimers.current[poolKey]);
    longPressTimers.current[poolKey] = setTimeout(() => {
      setClientLockedLocal(task, !locked);
      showToast(!locked ? "ננעל זמנית" : "שוחרר לסדר היום");
      haptic("success");
      setOpenDoneTasks(x=>({...x}));
    }, 3000);
  };
  const stopClientLongPress = (task) => clearTimeout(longPressTimers.current[poolIdentityKey(task)]);
  const dailyTaskClientKey = (task) => poolIdentityKey(task);
  const mergeWaterChecksIntoDailyList = (baseList, waterChecks, date) => {
    const list = [];
    const indexByClient = new Map();
    const pushOrMerge = (task) => {
      const key = dailyTaskClientKey(task);
      if (!key) return;
      const existingIndex = indexByClient.get(key);
      if (existingIndex !== undefined) {
        const existing = list[existingIndex];
        const noteParts = [existing.adminNote || existing.note || "", task.adminNote || task.note || ""]
          .map(x => String(x || "").trim())
          .filter(Boolean);
        list[existingIndex] = {
          ...existing,
          clientId: existing.clientId || task.clientId || clientIdByName(existing.client || task.client),
          adminNote: [...new Set(noteParts)].join(" · "),
          note: [...new Set(noteParts)].join(" · "),
          _waterCheck: !!existing._waterCheck,
          _includesWaterCheck: !!(existing._waterCheck || task._waterCheck)
        };
        return;
      }
      indexByClient.set(key, list.length);
      list.push(task);
    };
    (baseList || []).forEach(pushOrMerge);
    (waterChecks || []).forEach(task => pushOrMerge({
      ...task,
      id: `day-water-check-${normalizeDate(date)}-${task.clientId || normalizeName(task.client)}`,
      date: normalizeDate(date),
      status: task.status || "pending",
      changeLog: task.changeLog || [],
      orderIndex: task.orderIndex || 9000,
      createdByAdminOrder: false,
      _dayProfile: true,
      _waterCheck: true,
      adminNote: task.adminNote || task.note || "בדיקת מים",
      note: task.note || task.adminNote || "בדיקת מים"
    }));
    return list;
  };
  const getOperatorDailyView = (date=dailyDate) => {
    const opName = dailyOwnerName(date);
    if (isSubOperatorRole(user?.role)) {
      const sharedEntries = getSharedSubOrderEntries(date, opName, user?.username || user?.name);
      return sharedEntries.length ? entriesToDailyTasks(date, opName, sharedEntries, "shared") : [];
    }
    const adminEntries = getEffectiveAdminOrderEntries(date, opName);
    const waterChecks = waterCheckTasksForOperator(date, opName);
    let list;
    if (adminEntries.length) {
      const ordered = entriesToDailyTasks(date, opName, adminEntries, "admin").map(t=>({...t, _adminLocalOrder:true}));
      const orderedKeys = new Set(ordered.map(dailyTaskClientKey));
      const extra = myTasks(date).filter(t=>t.adminApproval !== "pending" && t.adminApproval !== "rejected" && !orderedKeys.has(dailyTaskClientKey(t)));
      list = [...ordered, ...extra];
    } else {
      list = dayClientProfiles(date, opName);
    }
    list = mergeWaterChecksIntoDailyList(list, waterChecks, date);
    const operatorOrder = readLocalArray(operatorOrderKey(user?.username || user?.name, date));
    if (operatorOrder.length) {
      const orderMap = new Map(operatorOrder.map((clientName, i)=>[clientName, i]));
      const orderIndex = task => orderMap.has(dailyTaskClientKey(task))
        ? orderMap.get(dailyTaskClientKey(task))
        : (!task.clientId && clientIdByName(task.client) && orderMap.has(task.client) ? orderMap.get(task.client) : 9999);
      list = [...list].sort((a,b)=>orderIndex(a) - orderIndex(b));
    }
    return list;
  };
  const subOperatorsForOperator = (date, opName) => {
    const assigned = getAssignedSubOperator(date, opName);
    return subOperatorUsers.filter(su =>
      normalizeName(linkedOperatorName(su, date)) === normalizeName(opName) ||
      isSameSubOperator(assigned, su)
    );
  };
  const autoShareOrderAfterReport = async (report) => {
    if (!report?.reportDate || !report?.client || isSubOperatorRole(user?.role)) return;
    const opName = report.operator || dailyOwnerName(report.reportDate) || user?.name || "";
    const subs = subOperatorsForOperator(report.reportDate, opName);
    if (!opName || !subs.length) return;
    const currentList = getOperatorDailyView(report.reportDate);
    if (!currentList.length) return;
    const sharedEntries = currentList.map((t, i) => {
      const completedNow = samePoolIdentity(t, report);
      const done = completedNow || t.status === "done" || isClientReportedDone(report.reportDate, t.client, t.clientId);
      return {
        id: t.id,
        client: t.client,
        clientId: t.clientId || report.clientId || clientIdByName(t.client),
        note: t.adminNote || t.note || "",
        orderIndex: Number(t.orderIndex || i + 1),
        status: done ? "done" : "pending",
        changeLog: t.changeLog || [],
        completedAt: t.completedAt || (completedNow ? nowStr() : ""),
        completedBy: t.completedBy || (completedNow ? user?.name || "" : ""),
        reportId: t.reportId || (completedNow ? report.id || "" : "")
      };
    });
    const subKeys = new Set(subs.map(su => normalizeName(su.username || su.name)).filter(Boolean));
    const shareRows = subs.flatMap(su => sharedEntries.map((entry, i)=>({
      date: report.reportDate,
      operator: opName,
      subUsername: su.username || su.name || "",
      subOperator: su.name || su.username || "",
      client: entry.client,
      clientId: entry.clientId || clientIdByName(entry.client),
      note: entry.note || "",
      id: entry.id || "",
      status: entry.status || "pending",
      changeLog: entry.changeLog || [],
      completedAt: entry.completedAt || "",
      completedBy: entry.completedBy || "",
      reportId: entry.reportId || "",
      revoked: false,
      orderIndex: Number(entry.orderIndex || i + 1),
      sharedAt: nowStr(),
      sharedBy: user?.name || ""
    })));
    const nextShared = [
      ...sharedSubOrders.filter(row => !(
        normalizeDate(row?.date) === report.reportDate &&
        normalizeName(row?.operator) === normalizeName(opName) &&
        subKeys.has(normalizeName(row?.subUsername || row?.subOperator))
      )),
      ...shareRows
    ];
    try {
      const res = await sheetCall("saveSubOperatorShares", {sharedSubOrders: shareRows});
      if (!res?.success) throw new Error(res?.error || "saveSubOperatorShares failed");
      setSharedSubOrders(nextShared);
      subs.forEach(su => writeLocalArray(sharedSubOrderKey(report.reportDate, opName, su.username || su.name), sharedEntries));
      setSubOperatorRefresh(x=>x+1);
    } catch (e) {
      console.warn("Auto shared order sync failed", e);
    }
  };
  const moveDraftItem = (from, to) => {
    if (from === to || from < 0 || to < 0) return;
    setOperatorOrderDraft(current => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };
  const handleLogout = () => { trackUsageEvent("logout", {screen}); localStorage.removeItem("galileo_user"); localStorage.removeItem(LOGIN_DAY_KEY); setUser(null); setLoginUser(""); setLoginPass(""); setScreen("login"); haptic("medium"); };

  const showToast = (msg) => { clearTimeout(toastTimer.current); setToast({msg,visible:true}); toastTimer.current = setTimeout(()=>setToast(t=>({...t,visible:false})),2500); };

  const submitOperatorIssueReport = () => {
    const desc = opIssueDesc.trim();
    if (!desc) {
      showToast("⚠️ נא לתאר את התקלה");
      return;
    }
    if (operatorIssueSendingRef.current || isActionLoading("operatorIssueReport")) return;

    operatorIssueSendingRef.current = true;
    const issue = {
      operator: user?.name,
      client: operatorIssuePoolLabel(opIssueClient, opIssueClientId),
      clientId: opIssueClientId,
      desc,
      priority: opIssuePriority,
      date: todayStr()
    };

    const alreadyQueued = pendingOperatorIssuesRef.current.some(item =>
      samePendingOperatorIssueContent(item, issue)
    );
    const pendingIssue = addPendingOperatorIssue(issue);
    if (!alreadyQueued) setOperatorIssues(prev => [operatorIssueToRow(pendingIssue), ...prev]);
    setPendingBackgroundSync(true);
    setAction("operatorIssueReport", "loading");
    if (pendingIssue._localPersisted) {
      setShowOperatorIssue(false);
      setOpIssueClientId("");
      setOpIssueDesc("");
      setOpIssuePriority("רגיל");
      showToast("הדיווח נשמר מקומית, שולח ברקע...");
    } else {
      showToast("שמירת התקלה בטלפון נכשלה - מנסה לשלוח ישירות");
    }

    void (async () => {
      try {
        const result = await syncPendingOperatorIssues(1, true, pendingIssue);
        if (result.success) {
          if (!pendingIssue._localPersisted) {
            setShowOperatorIssue(false);
            setOpIssueClientId("");
            setOpIssueDesc("");
            setOpIssuePriority("רגיל");
          }
          setAction("operatorIssueReport", "success", 1600);
          showToast("תקלה דווחה לאדמין");
          haptic("success");
        } else {
          setAction("operatorIssueReport", pendingIssue._localPersisted ? "local" : "error", 2200);
          showToast(pendingIssue._localPersisted
            ? "התקלה נשמרה מקומית ותישלח כשיהיה חיבור"
            : "השליחה נכשלה והטופס נשאר פתוח - נסה שוב");
          haptic("medium");
        }
      } finally {
        operatorIssueSendingRef.current = false;
      }
    })();
  };

  const currentEquipmentChecklistUser = user?.username || user?.name || "default";
  const saveEquipmentChecklist = () => {
    const next = checklistFromText(equipmentChecklistDraft);
    setEquipmentChecklist(next);
    localStorage.setItem(equipmentChecklistStorageKey(currentEquipmentChecklistUser), JSON.stringify(next));
    setShowEquipmentChecklistEditor(false);
    showToast(subText("רשימת הצ׳ק ליסט נשמרה","Checklist saved"));
    haptic("success");
  };
  const resetEquipmentChecklist = () => {
    setEquipmentChecklist(DAILY_EQUIPMENT_CHECKLIST);
    setEquipmentChecklistDraft(checklistToText(DAILY_EQUIPMENT_CHECKLIST));
    localStorage.removeItem(equipmentChecklistStorageKey(currentEquipmentChecklistUser));
    showToast(subText("רשימת ברירת המחדל שוחזרה","Default checklist restored"));
    haptic("medium");
  };

  useEffect(() => {
    const loaded = loadEquipmentChecklist(currentEquipmentChecklistUser);
    setEquipmentChecklist(loaded);
    setEquipmentChecklistDraft(checklistToText(loaded));
    setShowEquipmentChecklistEditor(false);
  }, [currentEquipmentChecklistUser]);

  useEffect(() => {
    const standaloneQuery = window.matchMedia?.("(display-mode: standalone)");
    const updateStandalone = async () => {
      const installed = standaloneQuery?.matches || window.navigator?.standalone === true || localStorage.getItem("galileo_app_installed") === "true";
      if (installed) {
        setIsStandalone(true);
        return;
      }
      try {
        const related = await window.navigator?.getInstalledRelatedApps?.();
        if (Array.isArray(related) && related.length > 0) {
          localStorage.setItem("galileo_app_installed", "true");
          setIsStandalone(true);
        }
      } catch {}
    };
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    const onInstalled = () => {
      localStorage.setItem("galileo_app_installed", "true");
      setInstallPrompt(null);
      setIsStandalone(true);
      showToast(subText("✅ האפליקציה הותקנה","✅ App installed"));
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
    applyTenantBranding(getCompany());
    if (isStandalone) {
      showToast(subText("✅ האפליקציה כבר מותקנת","✅ App is already installed"));
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
        showToast(subText("✅ התקנת האפליקציה התחילה","✅ App installation started"));
      } else {
        setAction("install", "error", 2200);
        showToast(subText("⚠️ ההתקנה בוטלה","⚠️ Installation cancelled"));
      }
      return;
    }

    setAction("install", "manual", 3500);
    showToast(subText("ב-Chrome לחץ ⋮ ואז התקנת האפליקציה / הוספה למסך הבית","Open the browser menu and choose Install app or Add to Home Screen"));
  };

  const InstallAppCard = ({compact=false}) => {
    if (isStandalone) return null;
    return (
      <Press
        onClick={installApp}
        style={{
          ...card({
            marginTop: compact ? 0 : 12,
            marginBottom: compact ? 8 : 0,
            background: "#e8f5e9",
            border: "1px solid #a5d6a7",
            display: "flex",
            alignItems: "center",
            gap: 8
          }),
          padding: compact ? "7px 10px" : "9px 12px",
          borderRadius: 12
        }}
      >
        <span style={{fontSize:18}}>⬇️</span>
        <div style={{flex:1}}>
          <div style={{fontWeight:800,fontSize:13,color:C.green}}>{subText("התקן אפליקציה","Install app")}</div>
          <div style={{fontSize:11,color:C.muted}}>{subText("פתח בלי דפדפן וקבל חוויה יציבה יותר","Open without the browser for a more stable experience")}</div>
        </div>
        <span style={{fontSize:12,fontWeight:800,color:C.green}}>
          {actionLabel("install",{idle:subText("התקן","Install"),loading:"⏳",success:"✅",manual:"⋮",error:subText("נסה שוב","Retry")})}
        </span>
      </Press>
    );
  };

  const IOSInstallHint = ({compact=false}) => {
    if (!isIOS || isStandalone) return null;
    return (
      <div style={{...card({marginTop: compact ? 0 : 10, marginBottom: compact ? 8 : 0, background:"#fff8e1", border:"1px solid #ffe082", display:"flex", alignItems:"center", gap:10}), padding: compact ? "8px 10px" : "10px 12px", borderRadius:14}}>
        <span style={{fontSize:18}}>↗️</span>
        <div style={{flex:1}}>
          <div style={{fontWeight:900,fontSize:13,color:C.orange}}>{subText("הוסף למסך הבית באייפון","Add to the iPhone Home Screen")}</div>
          <div style={{fontSize:11,color:C.muted,lineHeight:1.45}}>{subText("לחץ שיתוף ואז הוסף למסך הבית כדי לפתוח כאפליקציה מלאה ולקבל התראות.","Tap Share, then Add to Home Screen, to open it as a full app and receive notifications.")}</div>
        </div>
      </div>
    );
  };

  useEffect(()=>{
    applyTenantBranding(getCompany());
    try { const cached = localStorage.getItem("galileo_cache"); if(cached){ const {users,clients:cls,tasks:tsk,adminOrders:ord,supplyDB:sdb,lastReadings:lr,sharedSubOrders:sh,subOperatorApprovals:ap,pendingSubReports:pr,sheetReports:sr}=JSON.parse(cached); if(users?.length) applyFetchedUsers(users); if(cls?.length) setClients(ensureClientIds(cls)); if(tsk) setTasks(tsk); if(ord) setAdminOrders(ord); if(sdb) setSupplyDB(sdb); if(lr) setLastReadings(lr); if(Array.isArray(sh)) setSharedSubOrders(sh); if(Array.isArray(ap)) setSubOperatorApprovals(ap); if(Array.isArray(pr)) setPendingSubReports(pr); if(Array.isArray(sr)) setSheetReports(sr); setSheetId("connected"); } } catch {}
    const checkLicense = async () => {
      const lic = getLicense(); if(!lic.key) return;
      try {
        const res = await mgmtCall("validateLicense",{key:lic.key});
        if(res?.valid === true){
          const company = companyFromLicenseResponse(res);
          saveLicense({...lic, company:company.name, sheetId:res.sheetId, plan:res.plan, status:res.status, expiry:res.expiry, logoUrl:res.logoUrl||"", appName:company.appName, shortName:company.shortName, icon192Url:company.icon192Url, icon512Url:company.icon512Url, appleIconUrl:company.appleIconUrl, themeColor:company.themeColor, backgroundColor:company.backgroundColor});
          saveCompany(company);
          setCompanyName(company.name || DEFAULT_APP_NAME);
          setClientPlan({plan:res.plan, status:res.status});
          if(res.sheetId) {
            localStorage.setItem("galileo_sheet_id", res.sheetId);
            setSheetId("connected");
          }
        } else if(res?.valid === false) {
          setDataConnectionStatus("offline");
          showToast("מפתח הגישה לא אומת כרגע. האפליקציה נשארת פתוחה עם המידע השמור");
        } else {
          setDataConnectionStatus("offline");
          showToast("לא ניתן לאמת את מפתח הגישה כרגע. החיבור נשמר ואפשר להמשיך לעבוד");
        }
      } catch {}
    };
    checkLicense(); setTimeout(()=>connectSheets(true), 80);
  },[]);

  useEffect(()=>{
    if(screen!=="admin" || adminTab!=="opissues") return;
    loadOperatorIssues(true);
    const timer = setInterval(()=>loadOperatorIssues(true), 9 * 60 * 1000);
    return () => clearInterval(timer);
  },[screen, adminTab]);

  useEffect(()=>{
    if(screen!=="admin" || !sheetId || !isAdminPanelRole(user?.role)) return;
    loadOperatorDoneAlerts();
    const timer = setInterval(()=>loadOperatorDoneAlerts(), 30000);
    return () => clearInterval(timer);
  },[screen, sheetId, dailyDate, user?.role]);

  useEffect(()=>{
    if(screen!=="daily") return;
    loadOperatorIssues(true);
    const timer = setInterval(()=>loadOperatorIssues(true), 60 * 1000);
    return () => clearInterval(timer);
  },[screen, user?.name]);

  useEffect(()=>{
    if(!user || isAdminPanelRole(user.role)) return;
    loadOperatorIssues(true);
    const timer = setInterval(()=>loadOperatorIssues(true), 9 * 60 * 1000);
    return () => clearInterval(timer);
  },[user?.username, user?.role]);

  useEffect(()=>{
    if(screen!=="admin" || !sheetId) return;
    let cancelled = false;
    const loadTimer = setTimeout(()=>{ (async()=>{
      try {
        if(["daily","progress"].includes(adminTab)){
          const reportLoadDate = adminTab==="daily" ? taskDate : dailyDate;
          const [rep,tR,oR,lrR] = await Promise.all([
            sheetCall("getReports",{fromDate:reportLoadDate,toDate:reportLoadDate,limit:300}).catch(()=>null),
            sheetCall("getTasks").catch(()=>null),
            sheetCall("getAdminOrders").catch(()=>null),
            sheetCall("getLastReadings").catch(()=>null)
          ]);
          if(cancelled) return;
          if(Array.isArray(rep?.reports)) setSheetReports(rep.reports);
          if(Array.isArray(tR?.tasks)) setTasks(tR.tasks);
          if(Array.isArray(oR?.adminOrders)) setAdminOrders(oR.adminOrders);
          if(lrR?.lastReadings) setLastReadings(lrR.lastReadings);
          return;
        }
        if(adminTab==="reports" || adminTab==="supply"){
          const rep = await sheetCall("getReports",{
            fromDate:reportDateFilter || "",
            toDate:reportDateToFilter || (reportDateFilter ? reportDateFilter : ""),
            query:reportFilter || "",
            limit:reportDateFilter || reportDateToFilter || reportFilter ? 500 : 250
          }).catch(()=>null);
          if(!cancelled && Array.isArray(rep?.reports)) {
            setSheetReports(rep.reports);
            setDataConnectionStatus("connected");
          } else if(!cancelled) {
            setDataConnectionStatus("offline");
          }
          return;
        }
        if(adminTab==="tasks"){
          const tR = await sheetCall("getTasks").catch(()=>null);
          if(!cancelled && Array.isArray(tR?.tasks)) setTasks(tR.tasks);
          return;
        }
        if(adminTab==="clients"){
          const cR = await sheetCall("getClients").catch(()=>null);
          if(cancelled) return;
          if(Array.isArray(cR?.clients)) setClients(ensureClientIds(cR.clients));
          return;
        }
        if(adminTab==="users"){
          const uR = await sheetCall("getUsers").catch(()=>null);
          if(!cancelled && Array.isArray(uR?.users)) applyFetchedUsers(uR.users);
          return;
        }
        if(adminTab==="opissues"){
          await loadOperatorIssues(true);
          return;
        }
        if(adminTab==="treatments"){
          await loadTreatmentCounts();
        }
      } catch {}
    })(); }, 140);
    return () => { cancelled = true; clearTimeout(loadTimer); };
  },[screen, adminTab, dailyDate, taskDate, sheetId, reportDateFilter, reportDateToFilter, reportFilter]);

  const connectSheets = async (bg=false) => {
    let cachedSheetData = {};
    try { const cached = localStorage.getItem("galileo_cache"); if(cached){ cachedSheetData=JSON.parse(cached) || {}; const {users,clients:cls,tasks:tsk,adminOrders:ord,supplyDB:sdb,lastReadings:lr,sharedSubOrders:sh,subOperatorApprovals:ap,pendingSubReports:pr,waMessageTemplate:wt,acidSupplyMessage:asm,phUpSupplyMessage:psm,saltSupplyMessage:ssm,chlorineReminderMessage:crm,waterLevelNoticeMessage:wlm,sheetReports:sr}=cachedSheetData; if(users?.length) applyFetchedUsers(users); if(cls?.length) setClients(ensureClientIds(cls)); if(tsk) setTasks(tsk); if(ord) setAdminOrders(ord); if(sdb) setSupplyDB(sdb); if(lr) setLastReadings(lr); if(Array.isArray(sh)) setSharedSubOrders(sh); if(Array.isArray(ap)) setSubOperatorApprovals(ap); if(Array.isArray(pr)) setPendingSubReports(pr); if(Array.isArray(sr)) setSheetReports(sr); if(wt) setWaMessageTemplate(normalizeWaMessageTemplate(wt)); if(asm) setAcidSupplyMessage(normalizeAcidSupplyMessage(asm)); if(psm) setPhUpSupplyMessage(normalizePhUpSupplyMessage(psm)); if(ssm) setSaltSupplyMessage(normalizeSaltSupplyMessage(ssm)); if(crm) setChlorineReminderMessage(normalizeChlorineReminderMessage(crm)); if(wlm) setWaterLevelNoticeMessage(normalizeWaterLevelNoticeMessage(wlm)); setSheetId("connected"); if(!bg) return; } } catch {}
    try {
      let boot = await sheetCall("getBootstrapData");
      let networkConnected = !!boot && [
        "users","clients","tasks","adminOrders","supplyDB","lastReadings","settings"
      ].some(key => Object.prototype.hasOwnProperty.call(boot, key));
      let u=boot?.users?.length?boot.users:null;
      let c=Array.isArray(boot?.clients)?boot.clients:null;
      let t=Array.isArray(boot?.tasks)?boot.tasks:null;
      let ord=Array.isArray(boot?.adminOrders)?boot.adminOrders:null;
      let s=boot?.supplyDB?boot.supplyDB:null;
      let lr=boot?.lastReadings?boot.lastReadings:null;
      let sh=Array.isArray(boot?.sharedSubOrders)?boot.sharedSubOrders:null;
      let ap=Array.isArray(boot?.subOperatorApprovals)?boot.subOperatorApprovals:null;
      let pr=Array.isArray(boot?.pendingSubReports)?boot.pendingSubReports:null;
      let wt=boot?.settings?.waMessageTemplate || boot?.waMessageTemplate || null;
      let asm=boot?.settings?.acidSupplyMessage || boot?.acidSupplyMessage || null;
      let psm=boot?.settings?.phUpSupplyMessage || boot?.phUpSupplyMessage || null;
      let ssm=boot?.settings?.saltSupplyMessage || boot?.saltSupplyMessage || null;
      let crm=boot?.settings?.chlorineReminderMessage || boot?.chlorineReminderMessage || null;
      let wlm=boot?.settings?.waterLevelNoticeMessage || boot?.waterLevelNoticeMessage || null;
      let poolSourcesLoaded = Array.isArray(boot?.clients);
      if(boot !== null && !u && !c && !t && !ord && !s && !lr){
        const [uR,cR,tR,oR,sR,rR,shR,apR,prR,setR] = await Promise.all([sheetCall("getUsers"),sheetCall("getClients"),sheetCall("getTasks"),sheetCall("getAdminOrders"),sheetCall("getSupplyDB"),sheetCall("getLastReadings"),sheetCall("getSubOperatorShares"),sheetCall("getSubOperatorApprovals"),sheetCall("getPendingSubReports"),sheetCall("getClientSettings")]);
        networkConnected = networkConnected || [
          uR?.users,cR?.clients,tR?.tasks,oR?.adminOrders,sR?.supplyDB,rR?.lastReadings,
          shR?.sharedSubOrders,apR?.approvals,prR?.pendingSubReports,setR?.settings
        ].some(value => value !== undefined && value !== null);
        u=uR?.users?.length?uR.users:null; c=Array.isArray(cR?.clients)?cR.clients:null; t=Array.isArray(tR?.tasks)?tR.tasks:null; ord=Array.isArray(oR?.adminOrders)?oR.adminOrders:null; s=sR?.supplyDB?sR.supplyDB:null; lr=rR?.lastReadings?rR.lastReadings:null; sh=Array.isArray(shR?.sharedSubOrders)?shR.sharedSubOrders:null; ap=Array.isArray(apR?.approvals)?apR.approvals:null; pr=Array.isArray(prR?.pendingSubReports)?prR.pendingSubReports:null; wt=setR?.settings?.waMessageTemplate || setR?.waMessageTemplate || wt; asm=setR?.settings?.acidSupplyMessage || setR?.acidSupplyMessage || asm; psm=setR?.settings?.phUpSupplyMessage || setR?.phUpSupplyMessage || psm; ssm=setR?.settings?.saltSupplyMessage || setR?.saltSupplyMessage || ssm; crm=setR?.settings?.chlorineReminderMessage || setR?.chlorineReminderMessage || crm; wlm=setR?.settings?.waterLevelNoticeMessage || setR?.waterLevelNoticeMessage || wlm;
        poolSourcesLoaded = Array.isArray(cR?.clients);
      }
      const cleanUsers = u ? applyFetchedUsers(u) : dedupeUsers(allUsers);
      if(Array.isArray(c))setClients(ensureClientIds(c)); if(t)setTasks(t); if(ord)setAdminOrders(ord); if(s)setSupplyDB(s); if(lr)setLastReadings(lr); if(sh)setSharedSubOrders(sh); if(ap)setSubOperatorApprovals(ap); if(pr)setPendingSubReports(pr); if(wt)setWaMessageTemplate(normalizeWaMessageTemplate(wt)); if(asm)setAcidSupplyMessage(normalizeAcidSupplyMessage(asm)); if(psm)setPhUpSupplyMessage(normalizePhUpSupplyMessage(psm)); if(ssm)setSaltSupplyMessage(normalizeSaltSupplyMessage(ssm)); if(crm)setChlorineReminderMessage(normalizeChlorineReminderMessage(crm)); if(wlm)setWaterLevelNoticeMessage(normalizeWaterLevelNoticeMessage(wlm));
      if(poolSourcesLoaded) setPoolSourcesReady(true);
      const reportsForCache = [
        ...(Array.isArray(cachedSheetData.sheetReports) ? cachedSheetData.sheetReports : []),
        ...(Array.isArray(sheetReports) ? sheetReports : [])
      ].reduce((next, report) => upsertReportByIdentity(next, report), []);
      localStorage.setItem("galileo_cache",JSON.stringify({
        users:cleanUsers,
        clients:Array.isArray(c) ? c : (Array.isArray(cachedSheetData.clients) ? cachedSheetData.clients : clients),
        tasks:Array.isArray(t) ? t : (Array.isArray(cachedSheetData.tasks) ? cachedSheetData.tasks : tasks),
        adminOrders:Array.isArray(ord) ? ord : (Array.isArray(cachedSheetData.adminOrders) ? cachedSheetData.adminOrders : adminOrders),
        supplyDB:s || cachedSheetData.supplyDB || supplyDB || {},
        lastReadings:lr || cachedSheetData.lastReadings || lastReadings || {},
        sharedSubOrders:Array.isArray(sh) ? sh : (Array.isArray(cachedSheetData.sharedSubOrders) ? cachedSheetData.sharedSubOrders : sharedSubOrders),
        subOperatorApprovals:Array.isArray(ap) ? ap : (Array.isArray(cachedSheetData.subOperatorApprovals) ? cachedSheetData.subOperatorApprovals : subOperatorApprovals),
        pendingSubReports:Array.isArray(pr) ? pr : (Array.isArray(cachedSheetData.pendingSubReports) ? cachedSheetData.pendingSubReports : pendingSubReports),
        sheetReports:reportsForCache,
        waMessageTemplate:wt || cachedSheetData.waMessageTemplate || waMessageTemplate,
        acidSupplyMessage:asm || cachedSheetData.acidSupplyMessage || acidSupplyMessage,
        phUpSupplyMessage:psm || cachedSheetData.phUpSupplyMessage || phUpSupplyMessage,
        saltSupplyMessage:ssm || cachedSheetData.saltSupplyMessage || saltSupplyMessage,
        chlorineReminderMessage:crm || cachedSheetData.chlorineReminderMessage || chlorineReminderMessage,
        waterLevelNoticeMessage:wlm || cachedSheetData.waterLevelNoticeMessage || waterLevelNoticeMessage,
        cachedAt:Date.now()
      }));
      setSheetId("connected");
      setDataConnectionStatus(networkConnected ? "connected" : "offline");
      setTimeout(async()=>{ try { const company = getCompany(); if(company.sheetId) { const mgmtRes = await mgmtCall("getMgmtClients"); const rec = (mgmtRes?.clients||[]).find(c=>String(c[7])===String(company.sheetId)); if(rec) setClientPlan({plan:rec[5]||"",status:rec[6]||""}); } } catch {} }, 100);
      return networkConnected;
    } catch {
      setDataConnectionStatus("offline");
      return false;
    }
  };

  const refreshCurrentPageData = async () => {
    if (!user || isActionLoading("refreshData")) return;
    setAction("refreshData", "loading");
    setDataConnectionStatus(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "checking");
    try {
      let refreshed = await connectSheets(true);
      if (!refreshed) throw new Error("bootstrap_refresh_failed");
      if (screen === "daily" || screen === "admin") await loadOperatorIssues(true);
      if (screen === "daily") {
        const rep = await sheetCall("getReports", {fromDate:dailyDate, toDate:dailyDate, limit:300}).catch(()=>null);
        if (Array.isArray(rep?.reports)) setSheetReports(rep.reports);
        else refreshed = false;
      }
      if (screen === "admin" && adminTab === "treatments") await loadTreatmentCounts();
      if (screen === "admin" && ["daily","progress","reports"].includes(adminTab)) {
        const refreshReportDate = adminTab === "daily" ? taskDate : adminTab === "progress" ? dailyDate : reportDateFilter;
        const rep = await sheetCall("getReports",{
          fromDate:refreshReportDate || "",
          toDate:adminTab === "reports" ? (reportDateToFilter || (refreshReportDate ? refreshReportDate : "")) : (refreshReportDate || ""),
          query:adminTab === "reports" ? (reportFilter || "") : "",
          limit:adminTab === "reports" ? (refreshReportDate || reportDateToFilter || reportFilter ? 500 : 250) : 300
        }).catch(()=>null);
        if (Array.isArray(rep?.reports)) setSheetReports(rep.reports);
        else refreshed = false;
      }
      if (!refreshed) throw new Error("page_refresh_failed");
      setSubOperatorRefresh(x=>x+1);
      setDataConnectionStatus("connected");
      setAction("refreshData", "success", 1400);
      showToast(subText("✅ הנתונים רועננו","✅ Data refreshed"));
      haptic("success");
    } catch (e) {
      console.warn("Refresh failed", e);
      setDataConnectionStatus("offline");
      setAction("refreshData", "error", 2200);
      showToast(subText("⚠️ אין חיבור לנתונים · המידע השמור נשאר זמין","⚠️ Data connection failed · saved data remains available"));
      haptic("medium");
    }
  };

  const RefreshTopButton = ({compact=false}) => (
    <Press
      onClick={refreshCurrentPageData}
      disabled={isActionLoading("refreshData")}
      title={dataConnectionStatus==="offline"
        ? subText("אין חיבור לנתונים · לחץ לניסיון נוסף","Data connection unavailable · tap to retry")
        : subText("רענון נתונים","Refresh data")}
      style={{
        background:isActionLoading("refreshData")
          ? "rgba(226,237,250,0.55)"
          : dataConnectionStatus==="offline"
            ? "#fff8e1"
            : "rgba(226,237,250,0.72)",
        backdropFilter:"blur(14px)",
        border:dataConnectionStatus==="offline"?"1px solid #ffe082":"1px solid rgba(148,163,184,0.22)",
        borderRadius:16,
        padding:compact?"9px 11px":"9px 12px",
        color:dataConnectionStatus==="offline"?C.orange:actionStatus.refreshData==="error"?C.red:C.blue,
        fontSize:12,
        fontWeight:900,
        minWidth:compact?42:"auto",
        textAlign:"center",
        opacity:isActionLoading("refreshData")?0.75:1,
        boxShadow:"0 10px 26px rgba(30,64,175,0.12)"
      }}
    >
      {actionLabel("refreshData",{idle:dataConnectionStatus==="offline"?"⚠️":dataConnectionStatus==="checking"?"…":"↻",loading:"⏳",success:"✅",error:"⚠️"})}
    </Press>
  );

  const _doLogin = (found) => {
    setUser(found);
    setGreeting(getDailyGreeting(found.username||""));
    setWelcomeMedia(classifyWelcomeMedia(mediaUrlFromUser(found)));
    setShowDailyBriefing(!isAdminPanelRole(found.role));
    localStorage.setItem("galileo_user", JSON.stringify(found));
    localStorage.setItem(LOGIN_DAY_KEY, localDayKey());
    setScreen(isAdminPanelRole(found.role) ? "admin" : "daily");
    trackUsageEvent("login_success", {screen:isAdminPanelRole(found.role) ? "admin" : "daily", target:found.role || ""});
    haptic("medium");
    setTimeout(()=>connectSheets(true), 80);
    connectPushUser(found.username, false).catch(e => console.warn("Push identity connect failed:", e));
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
            localStorage.removeItem(LOGIN_DAY_KEY);
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

    if (appUpdate.available) {
      showToast("עדכון זמין - ניתן להיכנס, לעדכן אחר כך");
    }

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
              const cleanUsers = applyFetchedUsers(uRes.users);
              try {
                const c = JSON.parse(localStorage.getItem("galileo_cache")||"{}");
                localStorage.setItem("galileo_cache", JSON.stringify({...c, users:cleanUsers, cachedAt:Date.now()}));
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
        usersToCheck = applyFetchedUsers(uRes.users);
        try {
          const c = JSON.parse(localStorage.getItem("galileo_cache")||"{}");
          localStorage.setItem("galileo_cache", JSON.stringify({...c, users:usersToCheck, cachedAt:Date.now()}));
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
    const cleanTask={...task, date: task.date?.slice(0,10)||todayStr(), clientId: task.clientId || clientIdByName(task.client)};
    const note = task.noteOverride !== undefined ? task.noteOverride : taskNote;
    const logEntry={at:nowStr(),note:note||(isEdit?"משימה עודכנה":"📋 משימה חדשה הוקצתה לך"),by:user?.name,needsAck:true,ackedBy:[]};
    const newTasks=isEdit?tasks.map(t=>t.id===editTaskId?{...t,...cleanTask,changeLog:[...(t.changeLog||[]),logEntry]}:t):[...tasks,{id:Date.now(),...cleanTask,status:"pending",changeLog:[logEntry]}];
    const changedTask = isEdit ? newTasks.find(t=>t.id===editTaskId) : newTasks[newTasks.length - 1];
    if(sheetId) {
      const result = await sheetCall("mutateTasks",{upserts:[changedTask]}).catch(()=>null);
      if (!result?.success || !Array.isArray(result?.tasks)) {
        showToast("שמירת המשימה נכשלה - נסה שוב");
        haptic("medium");
        return false;
      }
      setTasks(result.tasks);
    } else {
      setTasks(newTasks);
    }
    setEditTaskId(null); setTaskClient(""); setTaskClientId(""); setTaskClients([]); setTaskOps([]); setTaskNote("");
    if(isEdit) await sendNotificationToOperators(cleanTask.operators, "📋 משימה עודכנה", `${cleanTask.client?.split(" - ")[0] || ""} — ${fmtDate(cleanTask.date)}`);
    showToast(isEdit?"✏️ משימה עודכנה":"✅ משימה נוספה");
    return true;
  };

  const updateTask = async (id,changes,logNote,isAdmin=false) => {
    const newTasks=tasks.map(t=>{ if(t.id!==id)return t; const entry={at:nowStr(),note:logNote,by:user?.name,...(isAdmin?{needsAck:true,ackedBy:[]}:{})}; return{...t,...changes,changeLog:[...(t.changeLog||[]),entry]}; });
    const changedTask = newTasks.find(t=>t.id===id);
    if(sheetId) {
      const result = await sheetCall("mutateTasks",{upserts:[changedTask]}).catch(()=>null);
      if (!result?.success || !Array.isArray(result?.tasks)) {
        showToast("שמירת המשימה נכשלה - נסה שוב");
        haptic("medium");
        return false;
      }
      setTasks(result.tasks);
    } else {
      setTasks(newTasks);
    }
    if(isAdmin) {
      await sendNotificationToOperators(changedTask?.operators || [], "📋 משימה עודכנה", `${changedTask?.client?.split(" - ")[0] || ""} — ${logNote}`);
    }
    return true;
  };

  const openDatePicker = (e) => {
    try { e.currentTarget.showPicker?.(); } catch {}
  };

  const ackChange = async (taskId,logIdx) => {
    const originalTask = tasks.find(t=>t.id===taskId);
    if (!originalTask) {
      const originalOrder = adminOrders.find(o=>String(o.id)===String(taskId));
      if (!originalOrder) {
        showToast("סדר העבודה כבר לא קיים");
        haptic("medium");
        return;
      }
      const originalOrderLog = originalOrder?.changeLog?.[logIdx];
      let newOrders=adminOrders.map(o=>{ if(String(o.id)!==String(taskId))return o; const newLog=(o.changeLog||[]).map((e,i)=>{ if(i!==logIdx)return e; const ackedBy=[...(e.ackedBy||[])]; if(!ackedBy.includes(user?.name))ackedBy.push(user?.name); return{...e,ackedBy}; }); return{...o,changeLog:newLog}; });
      if(sheetId) {
        const saveResult = await sheetCall("ackAdminOrderChange",{
          orderId:taskId,
          logIndex:logIdx,
          ackedBy:user?.name || ""
        }).catch(()=>null);
        if(!saveResult?.success || !Array.isArray(saveResult?.adminOrders)) {
          showToast("שמירת האישור נכשלה - נסה שוב");
          haptic("medium");
          return;
        }
        newOrders=dedupeAdminOrders(saveResult.adminOrders);
      }
      setAdminOrders(newOrders);
      await sendNotificationToAdmins(
        "✅ מפעיל אישר סדר יום",
        `${user?.name || "מפעיל"} אישר: ${originalOrder?.client?.split(" - ")[0] || "בריכה"}${originalOrderLog?.note ? ` — ${originalOrderLog.note}` : ""}`
      );
      showToast(subText("✓ קיבלת אישור נשלח","✓ Confirmation sent"));
      return;
    }
    const originalLog = originalTask?.changeLog?.[logIdx];
    let newTasks=tasks.map(t=>{ if(t.id!==taskId)return t; const newLog=t.changeLog.map((e,i)=>{ if(i!==logIdx)return e; const ackedBy=[...(e.ackedBy||[])]; if(!ackedBy.includes(user?.name))ackedBy.push(user?.name); return{...e,ackedBy}; }); return{...t,changeLog:newLog}; });
    if(sheetId) {
      const changedTask = newTasks.find(t=>t.id===taskId);
      const result = await sheetCall("mutateTasks",{upserts:[changedTask]}).catch(()=>null);
      if (!result?.success || !Array.isArray(result?.tasks)) {
        showToast("שמירת האישור נכשלה - נסה שוב");
        haptic("medium");
        return;
      }
      newTasks=result.tasks;
    }
    setTasks(newTasks);
    await sendNotificationToAdmins(
      "✅ מפעיל אישר משימה",
      `${user?.name || "מפעיל"} אישר: ${originalTask?.client?.split(" - ")[0] || "משימה"}${originalLog?.note ? ` — ${originalLog.note}` : ""}`
    );
    showToast(subText("✓ קיבלת אישור נשלח","✓ Confirmation sent"));
  };

  const removeOp=async(id,n)=>{const t=tasks.find(x=>x.id===id);if(!t)return;const saved=await updateTask(id,{operators:t.operators.filter(o=>o!==n)},`הוסר ${n} מהמשימה`,true);if(saved)await sendNotificationToOperators([n], "📋 הוסרת ממשימה", `${t.client?.split(" - ")[0] || ""} — ${fmtDate(t.date)}`);};
  const addOp=(id,n)=>{const t=tasks.find(x=>x.id===id);if(!t||t.operators.includes(n))return;updateTask(id,{operators:[...t.operators,n]},`נוסף ${n} למשימה`,true);};
  const markDone=(id)=>updateTask(id,{status:"done"},"דוח הוגש — בוצעה",false);
  const taskMatchesReport = (task, report) =>
    normalizeDate(task?.date) === normalizeDate(report?.reportDate) &&
    samePoolIdentity(task, report) &&
    (task?.operators || []).some(op => normalizeName(op) === normalizeName(report?.operator));
  const pendingTaskCompletionForReport = (report, existing = null) => {
    if (existing?.required) return existing;
    const task = tasksRef.current.find(candidate =>
      candidate?.status !== "done" && taskMatchesReport(candidate, report)
    );
    return task
      ? {required:true, synced:false, taskId:task.id, lastError:""}
      : {required:false, synced:true, taskId:"", lastError:""};
  };
  const syncPendingReportTaskCompletion = async (item, report = getPendingReportPayload(item)) => {
    const completion = item?.taskCompletion || {required:false, synced:true, taskId:"", lastError:""};
    if (completion.required && completion.synced === true) return item;
    if (!getConfiguredSheetId()) {
      return {
        ...item,
        taskCompletion:{...completion, required:true, synced:false, lastError:"task_save_unavailable"}
      };
    }
    const result = await sheetCall("setTaskReportCompletion", {
      completed:true,
      taskId:completion.taskId || "",
      report,
      actor:user?.name || report?.operator || "",
      at:nowStr(),
      completedAt:new Date().toISOString()
    }).catch(() => null);
    if (!result?.success || !Array.isArray(result?.tasks)) {
      return {
        ...item,
        taskCompletion:{...completion, required:true, synced:false, lastError:"task_save_failed"}
      };
    }
    tasksRef.current = result.tasks;
    setTasks(result.tasks);
    return {
      ...item,
      taskCompletion:{
        ...completion,
        required:!!result.taskFound,
        taskId:result.task?.id || "",
        synced:true,
        lastError:""
      }
    };
  };
  const taskStatusLabel = (t) => t.adminApproval==="pending"
    ? subText("ממתין לאישור","Pending approval")
    : t.adminApproval==="rejected"
      ? subText("נדחה","Rejected")
      : t.status==="done"
        ? subText("✓ בוצע","✓ Done")
        : t.adminApproval==="approved"
          ? subText("מאושר","Approved")
          : subText("ממתין","Pending");
  const taskStatusColor = (t) => t.adminApproval==="pending" ? C.orange : t.adminApproval==="rejected" ? C.red : t.status==="done" ? C.green : t.adminApproval==="approved" ? C.blue : C.orange;

  const submitOperatorTaskRequest = async () => {
    if (!operatorTaskClient || isActionLoading("operatorTaskRequest")) return;
    const opName = dailyOwnerName(dailyDate) || user?.name || "";
    const note = String(operatorTaskNote || "").trim();
    const task = {
      id: Date.now(),
      date: dailyDate.slice(0,10),
      client: operatorTaskClient,
      clientId: operatorTaskClientId || clientIdByName(operatorTaskClient),
      operators: [opName],
      status: "pending",
      operatorCreated: true,
      adminApproval: "pending",
      requestedBy: user?.name || opName,
      changeLog: [{at:nowStr(),note:note || "\u05de\u05e9\u05d9\u05de\u05d4 \u05d0\u05d9\u05e9\u05d9\u05ea \u05de\u05de\u05ea\u05d9\u05e0\u05d4 \u05dc\u05d0\u05d9\u05e9\u05d5\u05e8",by:user?.name || opName,needsAck:false,ackedBy:[]}]
    };
    const newTasks = [...tasks, task];
    setAction("operatorTaskRequest", "loading");
    if (sheetId) {
      const result = await sheetCall("mutateTasks", {upserts:[task]}).catch(()=>null);
      if (!result?.success || !Array.isArray(result?.tasks)) {
        setAction("operatorTaskRequest", "error", 2200);
        showToast("המשימה לא נשמרה - נסה שוב");
        haptic("medium");
        return;
      }
      setTasks(result.tasks);
    } else {
      setTasks(newTasks);
    }
    setOperatorTaskClient("");
    setOperatorTaskClientId("");
    setOperatorTaskClientSearch("");
    setOperatorTaskNote("");
    await sendNotificationToAdmins("\u05de\u05e9\u05d9\u05de\u05d4 \u05d7\u05d3\u05e9\u05d4 \u05de\u05de\u05e4\u05e2\u05d9\u05dc", `${opName} \u2014 ${operatorTaskClient.split(" - ")[0]}`).catch(e => console.warn("Operator task request notification failed", e));
    setAction("operatorTaskRequest", "success", 1500);
    showToast("\u05d4\u05de\u05e9\u05d9\u05de\u05d4 \u05e0\u05e9\u05dc\u05d7\u05d4 \u05dc\u05d0\u05d9\u05e9\u05d5\u05e8 \u05d0\u05d3\u05de\u05d9\u05df");
    haptic("success");
  };

  const approveOperatorTaskRequest = async (id, approved = true) => {
    const target = tasks.find(t=>t.id===id);
    if (!target) return;
    const actionKey = `approveTask:${id}`;
    if (isActionLoading(actionKey)) return;
    const assignedOperators = [...new Set((target.operators || []).map(value=>String(value || "").trim()).filter(Boolean))];
    if (approved && !assignedOperators.length) {
      showToast("יש לשייך מפעיל לפני אישור");
      haptic("medium");
      return;
    }

    setAction(actionKey, "loading");
    const approvalLog = {
      at:nowStr(),
      note:approved ? "אדמין אישר ושלח את המשימה לסדר היום" : "אדמין דחה את המשימה",
      by:user?.name,
      needsAck:approved,
      ackedBy:[]
    };
    const nextTasks = tasks.map(t=>t.id===id ? {
      ...t,
      adminApproval:approved ? "approved" : "rejected",
      status:approved ? (t.status === "rejected" ? "pending" : (t.status || "pending")) : "rejected",
      changeLog:[...(t.changeLog||[]), approvalLog]
    } : t);

    let nextOrders = adminOrders;
    if (approved) {
      const taskDateValue = normalizeDate(target.date);
      const taskNote = String(target.adminNote || target.changeLog?.[target.changeLog.length - 1]?.note || "").trim();
      assignedOperators.forEach(opName => {
        const existingIndex = nextOrders.findIndex(order =>
          normalizeDate(order.date) === taskDateValue &&
          normalizeName(order.operator) === normalizeName(opName) &&
          samePoolIdentity(order, target)
        );
        if (existingIndex >= 0) {
          nextOrders = nextOrders.map((order, index) => index === existingIndex ? {
            ...order,
            clientId:order.clientId || target.clientId || clientIdByName(target.client),
            adminNote:taskNote || order.adminNote || "",
            status:order.status || "pending"
          } : order);
          return;
        }
        const nextOrderIndex = nextOrders
          .filter(order => normalizeDate(order.date) === taskDateValue && normalizeName(order.operator) === normalizeName(opName))
          .reduce((max, order) => Math.max(max, Number(order.orderIndex || 0)), 0) + 1;
        nextOrders = [...nextOrders, {
          id:`admin-order-${taskDateValue}-${normalizeName(opName)}-${target.clientId || normalizeName(target.client)}`,
          date:taskDateValue,
          operator:opName,
          client:target.client,
          clientId:target.clientId || clientIdByName(target.client),
          status:"pending",
          changeLog:[approvalLog],
          orderIndex:nextOrderIndex,
          adminNote:taskNote
        }];
      });
      nextOrders = dedupeAdminOrders(nextOrders);
    }

    let savedTasks = nextTasks;
    try {
      if (sheetId) {
        const approvalResult = await sheetCall("setOperatorTaskApproval", {
          taskId:id,
          approved,
          operators:assignedOperators,
          approvalLog,
          adminNote:String(target.adminNote || target.changeLog?.[target.changeLog.length - 1]?.note || "").trim()
        }).catch(()=>null);
        if (!approvalResult?.success || !Array.isArray(approvalResult?.tasks) || !Array.isArray(approvalResult?.adminOrders)) {
          throw new Error(approvalResult?.error || "task approval save failed");
        }
        savedTasks = approvalResult.tasks;
        nextOrders = dedupeAdminOrders(approvalResult.adminOrders);
      }
      setTasks(savedTasks);
      if (approved) {
        setAdminOrders(nextOrders);
        assignedOperators.forEach(opName => {
          const entries = nextOrders
            .filter(order => normalizeDate(order.date) === normalizeDate(target.date) && normalizeName(order.operator) === normalizeName(opName))
            .map(order => ({client:order.client, clientId:order.clientId, note:order.adminNote || "", orderIndex:order.orderIndex}));
          writeLocalArray(adminOrderKey(normalizeDate(target.date), opName), prepareAdminOrderEntries(entries));
        });
        setSubOperatorRefresh(x=>x+1);
      }
      setAction(actionKey, "success", 1600);
      void sendNotificationToOperators(assignedOperators, approved ? "משימה אושרה ונוספה לסדר היום" : "משימה נדחתה", `${target.client?.split(" - ")[0] || ""} — ${fmtDate(target.date)}`)
        .catch(error => console.warn("Operator task approval notification failed", error));
      showToast(approved ? "המשימה אושרה ונשלחה לסדר היום" : "המשימה נדחתה");
      haptic("success");
    } catch(error) {
      console.warn("Operator task approval save failed", error);
      setAction(actionKey, "error", 2400);
      showToast("האישור לא נשמר - נסה שוב");
      haptic("medium");
    }
  };
  const timeToMinutes = (value) => {
    const [h,m] = String(value || "").split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };
  const totalWorkMinutes = (start, end) => {
    const s = timeToMinutes(start);
    const e = timeToMinutes(end);
    if (s === null || e === null) return 0;
    return e >= s ? e - s : e + 1440 - s;
  };
  const minutesToHM = (minutes) => `${Math.floor(Math.max(0, minutes) / 60)}:${String(Math.max(0, minutes) % 60).padStart(2,"0")}`;
  const openWorkClockEditor = (mode="edit") => {
    const now = new Date().toLocaleTimeString("he-IL",{hour:"2-digit",minute:"2-digit"});
    setWorkClockEditor({
      mode,
      date: todayStr(),
      start: workStart || now,
      end: mode === "end" ? now : "",
    });
    haptic("medium");
  };
  const saveWorkClockEditor = async () => {
    if (!workClockEditor?.date || !workClockEditor?.start) {
      showToast(subText("⚠️ חובה להזין תאריך ושעת כניסה","⚠️ Date and start time are required"));
      haptic("medium");
      return;
    }
    const cleanStart = workClockEditor.start;
    const cleanEnd = workClockEditor.end || "";
    if (!cleanEnd) {
      localStorage.setItem("galileo_workstart", cleanStart);
      setWorkStart(cleanStart);
      setWorkClockEditor(null);
      showToast(subText("▶ שעת כניסה נשמרה","▶ Start time saved"));
      haptic("success");
      if(sheetId) await sheetCall("saveWorkStart",{log:{username:user?.username||"",operator:user?.name,date:workClockEditor.date,start:cleanStart}});
      trackUsageEvent("save_work_start", {screen:"daily", target:"clock_start", date:workClockEditor.date});
      return;
    }
    const totalMinutes = totalWorkMinutes(cleanStart, cleanEnd);
    const totalStr = minutesToHM(totalMinutes);
    const log = {id:Date.now(),operator:user?.name,date:workClockEditor.date,start:cleanStart,end:cleanEnd,total:totalStr};
    const newLogs = [...workLogs, log].sort((a,b)=>String(b.date).localeCompare(String(a.date)) || String(b.start).localeCompare(String(a.start)));
    setWorkLogs(newLogs);
    localStorage.setItem("galileo_worklogs",JSON.stringify(newLogs));
    localStorage.removeItem("galileo_workstart");
    setWorkStart(null);
    setWorkClockEditor(null);
    showToast(subText(`⏹ ${totalStr} שעות עבודה נשמרו`,`⏹ ${totalStr} work hours saved`));
    haptic("success");
    if(sheetId) {
      await sheetCall("clearWorkStart",{username:user?.username||"",operator:user?.name,date:workClockEditor.date});
      await sheetCall("saveWorkLog",{log});
    }
    trackUsageEvent("save_work_hours", {screen:"daily", target:"clock_log", date:workClockEditor.date, total:totalStr});
  };
  const handleStartWork = () => {
    if (workStart) return;
    const now = new Date().toLocaleTimeString("he-IL",{hour:"2-digit",minute:"2-digit"});
    const date = todayStr();
    localStorage.setItem("galileo_workstart", now);
    setWorkStart(now);
    showToast(subText("▶ שעון עבודה התחיל","▶ Work clock started"));
    haptic("success");
    trackUsageEvent("save_work_start", {screen:"daily", target:"clock_start_quick", date});
    void (async () => {
      if (sheetId) await sheetCall("saveWorkStart",{log:{username:user?.username||"",operator:user?.name,date,start:now}});
    })().catch(e => console.warn("Work start sync failed", e));
  };
  const handleEndWork = () => openWorkClockEditor("end");

  useEffect(() => {
    if (!workStart || isAdminPanelRole(user?.role)) return;
    const check = () => {
      const now = new Date();
      const today = todayStr();
      const key = `galileo_clock_reminder_1230_${user?.username || user?.name}_${today}`;
      if (localStorage.getItem(key) === "shown") return;
      if (now.getHours() === 12 && now.getMinutes() >= 30) {
        localStorage.setItem(key, "shown");
        setShowClockReminder(true);
      }
    };
    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [workStart, user?.username, user?.name, user?.role]);

  const buildWA = (r) => {
    const name=r.client?.split(" - ")[0]||"לקוח יקר"; const company = getCompany().name || "POOLMANG";
    const statusLine=r.poolStatus==="אחר"?`⚠️ *נדרשת תשומת לב:*\n${r.customStatusText}${r.restrictedUntil?`\nהבריכה לא זמינה עד ${fmtDate(r.restrictedUntil)}`:""}` :"✅ הבריכה מאוזנת ומוכנה לשימוש מלא";
    const waterLevelNotice = r.waterLevel==="לא תקין" ? `\n\n${normalizeWaterLevelNoticeMessage(waterLevelNoticeMessage)}` : "";
    const supplyNoticeText = supplyDeliveryMessage(r.supplyLabel, {
      acid:acidSupplyMessage,
      phUp:phUpSupplyMessage,
      salt:saltSupplyMessage
    });
    const priceSummary = nextSupplyPriceSummary(r.supplyLabel, clientSupply(r.client, r.clientId)?.materialPrices);
    const supplyNotice = supplyNoticeText
      ? `\n\n📦 *חומרים לטיפול הבא:*\n${[supplyNoticeText, priceSummary].filter(Boolean).join("\n")}`
      : "";
    const reportDetails = `${statusLine}${waterLevelNotice}${supplyNotice}${r.notes?`\n\n📝 ${r.notes}`:""}`.trim();
    return renderWaMessageTemplate(waMessageTemplate, {
      clientName: name,
      operatorName: user?.name || "",
      company,
      reportDetails
    });
  };

  const saveWaMessageTemplate = async () => {
    if (isActionLoading("saveWaTemplate")) return;
    const clean = normalizeWaMessageTemplate(waTemplateDraft);
    const cleanAcidSupplyMessage = normalizeAcidSupplyMessage(acidSupplyMessageDraft);
    const cleanPhUpSupplyMessage = normalizePhUpSupplyMessage(phUpSupplyMessageDraft);
    const cleanSaltSupplyMessage = normalizeSaltSupplyMessage(saltSupplyMessageDraft);
    const cleanChlorineReminderMessage = normalizeChlorineReminderMessage(chlorineReminderMessageDraft);
    const cleanWaterLevelNoticeMessage = normalizeWaterLevelNoticeMessage(waterLevelNoticeMessageDraft);
    setAction("saveWaTemplate", "loading");
    setWaMessageTemplate(clean);
    setAcidSupplyMessage(cleanAcidSupplyMessage);
    setPhUpSupplyMessage(cleanPhUpSupplyMessage);
    setSaltSupplyMessage(cleanSaltSupplyMessage);
    setChlorineReminderMessage(cleanChlorineReminderMessage);
    setWaterLevelNoticeMessage(cleanWaterLevelNoticeMessage);
    try { localStorage.setItem(WA_TEMPLATE_STORAGE_KEY, clean); } catch {}
    try { localStorage.setItem(WA_ACID_SUPPLY_MESSAGE_STORAGE_KEY, cleanAcidSupplyMessage); } catch {}
    try { localStorage.setItem(WA_PH_UP_SUPPLY_MESSAGE_STORAGE_KEY, cleanPhUpSupplyMessage); } catch {}
    try { localStorage.setItem(WA_SALT_SUPPLY_MESSAGE_STORAGE_KEY, cleanSaltSupplyMessage); } catch {}
    try { localStorage.setItem(WA_TABLET_REMINDER_STORAGE_KEY, cleanChlorineReminderMessage); } catch {}
    try { localStorage.setItem(WA_WATER_LEVEL_NOTICE_STORAGE_KEY, cleanWaterLevelNoticeMessage); } catch {}
    const res = sheetId ? await sheetCall("saveClientSettings", {settings:{waMessageTemplate:clean,acidSupplyMessage:cleanAcidSupplyMessage,phUpSupplyMessage:cleanPhUpSupplyMessage,saltSupplyMessage:cleanSaltSupplyMessage,chlorineReminderMessage:cleanChlorineReminderMessage,waterLevelNoticeMessage:cleanWaterLevelNoticeMessage}}).catch(()=>null) : null;
    if (sheetId && !res?.success) {
      setAction("saveWaTemplate", "error", 1800);
      showToast("שמירת ההודעה לגיליון נכשלה");
      return;
    }
    setAction("saveWaTemplate", "success", 1500);
    showToast("מלל הודעת WhatsApp נשמר");
  };

  const resetWaMessageTemplate = () => {
    setWaTemplateDraft(DEFAULT_WA_MESSAGE_TEMPLATE);
    setAcidSupplyMessageDraft(DEFAULT_ACID_SUPPLY_MESSAGE);
    setPhUpSupplyMessageDraft(DEFAULT_PH_UP_SUPPLY_MESSAGE);
    setSaltSupplyMessageDraft(DEFAULT_SALT_SUPPLY_MESSAGE);
    setChlorineReminderMessageDraft(DEFAULT_CHLORINE_TABLET_REMINDER_MESSAGE);
    setWaterLevelNoticeMessageDraft(DEFAULT_WATER_LEVEL_NOTICE_MESSAGE);
    haptic("medium");
  };

  const sendManualWhatsApp = async () => {
    if (isActionLoading("sendManualWa")) return;
    const message = String(manualWaMessage || "").trim();
    const recipients = manualWaRecipients();
    if (!message) {
      showToast("יש להזין מלל הודעה");
      haptic("medium");
      return;
    }
    if (!recipients.length) {
      showToast(manualWaSendAll ? "אין לקוחות זמינים לשליחה" : "בחר לקוח עם טלפון ו-WhatsApp פעיל");
      haptic("medium");
      return;
    }
    setManualWaLastResult(null);
    setAction("sendManualWa", "loading");
    const results = [];
    for (const recipient of recipients) {
      const res = await sheetCall("sendGreenApiWhatsApp", {
        phone: recipient.phone,
        chatId: `${recipient.phone}@c.us`,
        message,
        client: recipient.name
      }).catch(e => ({success:false,error:e?.message || "send_failed"}));
      results.push({
        client: recipient.name,
        ok: !!(res?.success || res?.idMessage || res?.response?.idMessage),
        error: res?.error || ""
      });
    }
    const sent = results.filter(r => r.ok).length;
    const failed = results.length - sent;
    setManualWaLastResult({sent,failed,total:results.length});
    setAction("sendManualWa", failed ? "error" : "success", failed ? 2600 : 1800);
    showToast(failed ? `נשלחו ${sent}, נכשלו ${failed}` : `נשלחו ${sent} הודעות`);
    haptic(failed ? "medium" : "success");
  };

  const sendReportWhatsApp = async (report, deliveryDecision = null) => {
    if (report?.waterCheckOnly) return {sent:true, skipped:true};
    if (deliveryDecision?.version && deliveryDecision.shouldSend === false) return {sent:true, skipped:true};
    if (!deliveryDecision?.version && isWhatsAppDisabledForClient(report)) {
      showToast(subText("ווצאפ כבוי ללקוח - הדוח נשמר ללא הודעה","WhatsApp is off for this client. The report was saved without a message"));
      return {sent:true, skipped:true};
    }
    const phone = normalizeWhatsAppPhone(deliveryDecision?.phone || clientPhone(report.client, report.clientId));
    const message = String(deliveryDecision?.message || buildWA(report)).trim();
    if (!phone) {
      showToast(subText("⚠️ אין טלפון ללקוח - הדוח נשמר והוסר מתור ההודעות","⚠️ The client has no phone number. The report was saved without a message"));
      return {sent:true, skipped:true};
    }

    const res = await sheetCall("sendGreenApiWhatsApp", {
      phone,
      chatId: `${phone}@c.us`,
      message,
      client: report.client,
      reportId: report.id,
      deliveryId:deliveryDecision?.deliveryId || `${report.id || ""}:completion`,
    }).catch(()=>null);

    if (res?.idMessage || res?.response?.idMessage) {
      showToast(subText("✅ הודעת WhatsApp נשלחה ללקוח","✅ WhatsApp message sent to the client"));
      return {sent:true, response:res};
    }

    console.warn("Green API send failed", res);
    const greenState = res?.stateInstance ? ` · ${res.stateInstance}` : "";
    const greenError = res?.error ? ` · ${res.error}` : "";
    showToast(subText(
      `⚠️ WhatsApp לא נשלח${res?.status ? ` (${res.status})` : ""}${greenState}${greenError}`,
      `⚠️ WhatsApp was not sent${res?.status ? ` (${res.status})` : ""}${greenState}${greenError}`
    ));
    const status = Number(res?.status || 0);
    const deliveryUnknown =
      res?.error === "delivery_status_unknown" ||
      status >= 500 ||
      (status >= 200 && status < 300);
    return {
      sent:false,
      error:deliveryUnknown ? "delivery_status_unknown" : (res?.error || "whatsapp_send_failed"),
      response:res || null
    };
  };
  const sendSelfWhatsAppTest = async () => {
    const actionKey = "sendSelfWhatsApp";
    if (isActionLoading(actionKey)) return;
    setAction(actionKey, "loading");
    const validPhoneFrom = (record = {}) => [record?.phone, user?.phone]
      .map(normalizeWhatsAppPhone)
      .find(value => /^9725\d{8}$/.test(value)) || "";
    let currentUserRecord = findPushUser(user?.username || user?.name || user?.phone) || {};
    const usersResponse = await sheetCall("getUsers").catch(() => null);
    if (Array.isArray(usersResponse?.users)) {
      const freshUsers = applyFetchedUsers(usersResponse.users);
      currentUserRecord = freshUsers.find(candidate => sameUserIdentity(candidate, user)) || currentUserRecord;
    }
    const phone = validPhoneFrom(currentUserRecord);
    if (!phone) {
      setAction(actionKey, "error", 2200);
      showToast(subText("⚠️ מספר הטלפון של המשתמש חסר או אינו תקין","⚠️ The signed-in user's phone number is missing or invalid"));
      haptic("medium");
      return;
    }
    const res = await sheetCall("sendGreenApiWhatsApp", {
      phone,
      chatId: `${phone}@c.us`,
      message: "כפתור שליחה לעצמי נלחץ",
      client: user?.name || user?.username || "מפעיל"
    }).catch(error => ({success:false,error:error?.message || "send_failed"}));
    const sent = !!(res?.success || res?.idMessage || res?.response?.idMessage);
    setAction(actionKey, sent ? "success" : "error", sent ? 1800 : 2600);
    showToast(sent
      ? subText("✅ הודעת הבדיקה נשלחה אליך","✅ Test message sent to you")
      : subText("⚠️ הודעת הבדיקה לא נשלחה - שירות הווצאפ אינו תקין","⚠️ Test message was not sent. The WhatsApp service is unavailable"));
    haptic(sent ? "success" : "medium");
  };
  const sendReportWhatsAppAfterSheetConfirm = async (report, deliveryDecision = null) => {
    if (deliveryDecision?.version && deliveryDecision.shouldSend === false) return { sent:true, sheetConfirmed:true, skipped:true };
    const sheetConfirmed = await confirmReportSavedToSheet(report);
    if (!sheetConfirmed) {
      showToast(subText("⚠️ הדוח עדיין לא אומת בשיטס - הודעת לקוח לא נשלחה","⚠️ The report has not been confirmed in Sheets. No client message was sent"));
      return { sent:false, sheetConfirmed:false };
    }
    const delivery = await sendReportWhatsApp(report, deliveryDecision);
    return { ...delivery, sheetConfirmed:true };
  };

  const queueSubOperatorReportForApproval = async (report, photosBase64, adminEmail) => {
    const item = {
      id: makeReportId(),
      status: "pending",
      createdAt: new Date().toISOString(),
      operator: report.operator,
      subUsername: user?.username || "",
      subName: user?.name || user?.username || "",
      report,
      photos: photosBase64,
      adminEmail,
      clientAddress: clientAddress(report.client, report.clientId),
      clientPhone: clientPhone(report.client, report.clientId),
    };
    const next = [item, ...pendingSubReports.filter(x => x.id !== item.id)];
    await savePendingSubReports(next);
    rememberCompletedReport(report);
    setAction("submitReport", "success", 1600);
    showToast(subText("הדוח ממתין לאישור מפעיל","Report is waiting for operator approval"));
    haptic("success");
  };

  const editPendingSubReport = (item) => {
    const r = item?.report || {};
    setApprovalEditId(item.id);
    setDeferredSubReportIds(ids => ids.filter(x => x !== item.id));
    setActiveSubReportApprovalId("");
    setEditingReport(null);
    setForm({
      ...blank(),
      ...r,
      ...reportSupplyFlags(r),
      client: r.client || "",
      reportDate: r.reportDate || todayStr(),
      photos: [],
      clientLocked: true,
    });
    setScreen("form");
    showToast("ערוך את הדוח ושלח");
    haptic("medium");
  };

  const approvePendingSubReport = async (item) => {
    if (!item || syncing || isActionLoading(`approveSubReport:${item.id}`)) return;
    const report = item.report;
    const supplyUpdateForApproval = buildSupplyUpdateForReport(report);
    const approvalPhone = normalizeWhatsAppPhone(clientPhone(report.client, report.clientId));
    const approvalWhatsAppDisabled = isWhatsAppDisabledForClient(report);
    const approvalShouldSend = !report?.waterCheckOnly && !approvalWhatsAppDisabled && !!approvalPhone;
    const deliveryDecision = {
      version:1,
      shouldSend:approvalShouldSend,
      skipReason:report?.waterCheckOnly ? "water_check" : approvalWhatsAppDisabled ? "disabled" : !approvalPhone ? "missing_phone" : "",
      phone:approvalPhone,
      message:approvalShouldSend ? buildWA(report) : "",
      deliveryId:`wa-${report.id || item.id || makeReportId()}`
    };
    setDeferredSubReportIds(ids => ids.includes(item.id) ? ids : [...ids, item.id]);
    setActiveSubReportApprovalId("");
    setAction(`approveSubReport:${item.id}`, "loading");

    let saved = false;
    let savedReport = report;
    if (getConfiguredSheetId()) {
      const res = await sheetCall("saveReport", {
        report,
        photos: item.photos || [],
        adminEmail: item.adminEmail || getCompany().adminEmail || "",
        clientAddress: item.clientAddress || clientAddress(report.client, report.clientId),
        clientPhone: item.clientPhone || clientPhone(report.client, report.clientId),
        supplyUpdate: supplyUpdateForApproval?.row || undefined,
      }).catch(() => null);
      saved = res?.success === true;
      if (saved) savedReport = reportWithServerId(report, res);
      if (saved && supplyUpdateForApproval?.db) setSupplyDB(supplyUpdateForApproval.db);
      if (saved && !res?.duplicate) {
        void sendNotificationToAdmins(
          `✅ דוח בוצע: ${report.client}`,
          `${item.subName || "עוזר מפעיל"} מילא דוח שאושר על ידי ${user?.name || "מפעיל"} · כלור ${report.chlorine}, pH ${report.ph}`
        ).catch(e => console.warn("Admin report notification failed", e));
      }
    }

    if (saved) {
      let approvalDeliveryItem = null;
      if (deliveryDecision.shouldSend) {
        try {
          approvalDeliveryItem = await persistPendingReportBeforeSend(
            savedReport,
            supplyUpdateForApproval?.row,
            {
              savedToSheet:true,
              sendWhatsAppOnSave:true,
              whatsappSending:true,
              whatsappSkipReason:"",
              whatsappSent:false,
              deliveryDecision
            }
          );
        } catch (error) {
          console.warn("Approved report delivery queue save failed", error);
          setDeferredSubReportIds(ids => ids.filter(id => id !== item.id));
          setAction(`approveSubReport:${item.id}`, "error", 2400);
          showToast("הדוח נשמר בשיטס, אך תור ההודעה לא נשמר בטלפון. האישור נשאר לניסיון נוסף");
          return;
        }
      }
      setReports(prev => upsertReportByIdentity(prev, savedReport));
      rememberCompletedReport(savedReport);
      setLastReadings(prev => {
        const readingId = String(report.clientId || clientIdByName(report.client) || "").trim();
        const readingKey = readingId || report.client;
        const previous = lastReadingForClient(report.client, readingId) || {};
        return {
          ...prev,
          [readingKey]: mergeLatestReading(previous, {
            client: report.client,
            clientId: readingId,
            date: report.reportDate,
            reportDate: report.reportDate,
            chlorine: report.chlorine,
            ph: report.ph,
            salt: report.salt,
            chlora: report.chlora ?? "",
            hth: report.hth ?? "",
            phUp: report.phUp ?? "",
            acidLiters: report.acidLiters ?? "",
            poolStatus: report.poolStatus,
            customStatusText: report.waterCheckOnly ? previous.customStatusText || "" : report.customStatusText,
            internalNoteDate: report.waterCheckOnly ? previous.internalNoteDate || "" : (report.internalNoteDate || report.reportDate),
            notes: report.notes,
            waterCheckOnly:!!report.waterCheckOnly,
            missedTreatment: false
          })
        };
      });
      const match = tasks.find(t => {
        if (normalizeDate(t.date) !== normalizeDate(report.reportDate) || t.status === "done") return false;
        return samePoolIdentity(t, report) &&
          (t.operators || []).some(op => normalizeName(op) === normalizeName(report.operator));
      });
      if (match) void markDone(match.id);
      await removePendingSubReport(item.id);
      setAction(`approveSubReport:${item.id}`, "success", 1400);
      showToast("✅ הדוח אושר ונשלח");
      void reportCriticalFlowIssue(savedReport).catch(e => console.warn("Critical flow issue failed", e));
      void (async () => {
        const whatsAppResult = await sendReportWhatsAppAfterSheetConfirm(savedReport, deliveryDecision).catch(e => {
          console.warn("WhatsApp send failed", e);
          return { sent:false, sheetConfirmed:false };
        });
        if (approvalDeliveryItem) {
          const deliveryState = {
            ...approvalDeliveryItem,
            savedToSheet:!!whatsAppResult.sheetConfirmed,
            whatsappSending:false,
            whatsappSent:!!whatsAppResult.sent,
            lastError:whatsAppResult.sent
              ? ""
              : (whatsAppResult.sheetConfirmed
                  ? (whatsAppResult.error || "whatsapp_send_failed")
                  : "sheet_confirm_failed")
          };
          await persistPendingReportItem(deliveryState).catch(e =>
            console.warn("Approved report delivery state save failed", e)
          );
        }
        if (!whatsAppResult.sent) {
          setDismissed(false);
          setPendingBackgroundSync(true);
        }
      })();
      void autoShareOrderAfterReport(savedReport);
      trackUsageEvent("approve_sub_report", {screen:"daily", target:"pending_sub_report"});
    } else {
      try {
        await persistPendingReportBeforeSend(report, supplyUpdateForApproval?.row, {
          savedToSheet:false,
          sendWhatsAppOnSave:deliveryDecision.shouldSend,
          whatsappSkipReason:deliveryDecision.skipReason,
          deliveryDecision,
          completionContext:{
            previousLastReading:lastReadingForClient(report.client, report.clientId) || null,
            previousLocalReport:null
          },
          taskCompletion:pendingTaskCompletionForReport(report)
        });
      } catch (error) {
        console.warn("Approved report local queue save failed", error);
        setDeferredSubReportIds(ids => ids.filter(id => id !== item.id));
        setAction(`approveSubReport:${item.id}`, "error", 2400);
        showToast("שמירת הדוח בטלפון נכשלה. הדוח נשאר ברשימת האישורים ולא הוסר");
        return;
      }
      await removePendingSubReport(item.id);
      setAction(`approveSubReport:${item.id}`, "local", 2200);
      trackUsageEvent("approve_sub_report_local", {screen:"daily", target:"pending_sub_report"});
      showToast("⚠️ הדוח נשמר מקומית לשליחה מאוחרת");
    }

  };

  const deferPendingSubReport = (item) => {
    if (!item?.id) return;
    setDeferredSubReportIds(ids => ids.includes(item.id) ? ids : [...ids, item.id]);
    setActiveSubReportApprovalId("");
    trackUsageEvent("defer_sub_report", {screen:"daily", target:"pending_sub_report"});
    showToast("הדוח הועבר לרשימת המתנה לאישור");
    haptic("medium");
  };

  const openPendingSubReportApproval = (item) => {
    if (!item?.id) return;
    setDeferredSubReportIds(ids => ids.filter(x => x !== item.id));
    setActiveSubReportApprovalId(item.id);
    haptic("medium");
  };

  const waterCheckReportMode = !!form.waterCheckOnly || !!editingReport?.waterCheckOnly;
  const handleSubmit = async (options = {}) => {
    if (!client || syncing || isActionLoading("submitReport")) return;
    const sendCustomerWhatsApp = options.sendCustomerWhatsApp !== false;
    const isEditingPendingReport = !!editingReport?.pendingLocal;
    const isEditingExistingReport = !!editingReport && !editingReport.pendingLocal;
    const pendingEditItem = isEditingPendingReport ? editingReport.pendingItem : null;
    if (chlorine === "" || (!waterCheckReportMode && ph === "") || !flow) {
      showToast(waterCheckReportMode
        ? subText("⚠️ חובה למלא כלור וזרימת מים","⚠️ Chlorine and water flow are required")
        : subText("⚠️ חובה למלא כלור, pH וזרימה","⚠️ Chlorine, pH and flow are required"));
      if (chlorine === "") sf("_exp_chlorine", true);
      else if (!waterCheckReportMode && ph === "") sf("_exp_ph", true);
      haptic("medium");
      return;
    }
    if (Number(chlorine) === 0 && !form.chlorineZeroConfirmed) {
      showToast(subText("⚠️ אשר במפורש רמת כלור 0","⚠️ Confirm a chlorine level of 0"));
      sf("_exp_chlorine", true);
      haptic("medium");
      return;
    }
    if (!waterCheckReportMode && Number(ph) === 0 && !form.phLowConfirmed) {
      showToast(subText("⚠️ חובה לבחור ערך pH או לסמן PH נמוך","⚠️ Select a pH value or mark pH as low"));
      sf("_exp_ph", true);
      haptic("medium");
      return;
    }
    if (!waterCheckReportMode && Number(form.chlora || 0) === 0 && !form._exp_chlora_zero) {
      showToast(subText("⚠️ חובה למלא טבליות כלור (TAB) או לסמן שאין צורך להוסיף","⚠️ Enter chlorine tablets (TAB) or mark that none are needed"));
      sf("_exp_chlora", true);
      haptic("medium");
      return;
    }
    setAction("submitReport", "loading");
    setSyncing(true);
    const elNext=calcNext(elDate);
    let nextSupplyDB = null;
    let supplyUpdate = null;
    const currentClientId = String(form.clientId || editingReport?.clientId || clientIdByName(client)).trim();
    const supplySource = {reportDate, client, clientId: currentClientId, acid, phUpSupply, saltPkg, saltBags, suppliedEquipment};
    const prevSupplyForClient = clientSupply(client, currentClientId) || {};
    const computedSupply = nextSupplyStateForReport(client, supplySource, prevSupplyForClient);
    const supplyLabel = supplyLabelFromFlags(computedSupply.explicitAfterSupplied);
    if(client&&computedSupply.shouldUpdate&&(!isSubOperatorRole(user?.role)||approvalEditId)){
      const supplyKey = supplyStorageKey(client, currentClientId);
      const newDB=supplyDBWithPoolUpdate(supplyDB, client, computedSupply.nextSupply);
      nextSupplyDB = newDB;
      const nextSupply = newDB[supplyKey];
      if (nextSupply) {
        supplyUpdate = [client,nextSupply.acid?"כן":"לא",nextSupply.phUpSupply?"כן":"לא",nextSupply.saltPkg?"כן":"לא",nextSupply.saltBags||0,nextSupply.updatedAt,nextSupply.supplyNote||"",nextSupply.nextSupplyDate||"",nextSupply.assignedOperator||"",serializeNextSupplyPrices(nextSupply.materialPrices),nextSupply.supplyId||"",nextSupply.clientId||currentClientId];
      }
    }
    const reportOperatorName = dailyOwnerName(reportDate) || user?.name;
    let photosBase64 = [];
    const report = {
  id: editingReport?.localId || makeReportId(),
  reportDate,
  operator:reportOperatorName||user?.name||"",
  client,
  clientId: currentClientId,
  chlorine,
  ph: waterCheckReportMode ? "" : (form.phLowConfirmed && Number(ph) === 0 ? "PH נמוך" : ph),
  salt: waterCheckReportMode || currentPrimaryPool === "כלור" ? "" : salt,
  chlora:form.chlora>0?form.chlora:(waterCheckReportMode?"":undefined),
  hth:form.hth>0?form.hth:(waterCheckReportMode?"":undefined),
  phUp:waterCheckReportMode?"":(form.phUp>0?form.phUp:undefined),
  acidLiters:waterCheckReportMode?"":(form.acidLiters>0?form.acidLiters:undefined),
  elModel:waterCheckReportMode?"":elModel,
  elSerial:waterCheckReportMode?"":elSerial,
  elDate:waterCheckReportMode?"":elDate,
  elNext:waterCheckReportMode?"":(elNext||""),
  supplyLabel:waterCheckReportMode?"":supplyLabel,
  suppliedEquipment: waterCheckReportMode ? "" : suppliedEquipment.join(", "),
  waterLevel:waterCheckReportMode?"":waterLevel,
  clarity:waterCheckReportMode?"":clarity,
  fat:waterCheckReportMode?"":fat,
  flow,
  poolStatus:waterCheckReportMode?"":poolStatus,
  customStatusText:waterCheckReportMode?"":customStatusText,
  restrictedUntil:waterCheckReportMode?"":restrictedUntil,
  notes:waterCheckReportMode?"":notes,
  waterCheckOnly: waterCheckReportMode,
  sendReminder: waterCheckReportMode ? false : !!form.sendReminder,
  chlorineReminderCreatedAt: waterCheckReportMode ? "" : (form.chlorineReminderCreatedAt || ""),
  chlorineReminderDueAt: waterCheckReportMode ? "" : (form.chlorineReminderDueAt || ""),
  chlorineReminderMessage: !waterCheckReportMode && form.sendReminder ? normalizeChlorineReminderMessage(form.chlorineReminderMessage || chlorineReminderMessage) : "",
  photosCount:0
};
    const sendEditedReportToCustomer = sendCustomerWhatsApp && isEditingExistingReport && shouldSendEditedReportToCustomer(editingReport, report);
    if (!isEditingExistingReport && isSubOperatorRole(user?.role) && !approvalEditId) {
      const adminEmail = getCompany().adminEmail || "";
      const queuePromise = queueSubOperatorReportForApproval(report, photosBase64, adminEmail);
      setSyncing(false);
      setEditingReport(null);
      setScreen("daily");
      try {
        await queuePromise;
        return;
      } catch(e) {
        console.warn("Sub-operator report queue failed", e);
        setAction("submitReport", "error", 2200);
        showToast(subText("שמירת הדוח לאישור נכשלה","Failed to save the report for approval"));
        haptic("medium");
        setSyncing(false);
        return;
      }
    }
    const pendingEditShouldSend = isEditingPendingReport
      ? !pendingEditItem?.whatsappSent && pendingReportWantsWhatsApp(pendingEditItem, report)
      : false;
    const shouldSendReportWhatsApp = !report.waterCheckOnly && (
      isEditingPendingReport
        ? pendingEditShouldSend
        : isEditingExistingReport
        ? sendEditedReportToCustomer
        : sendCustomerWhatsApp
    );
    const deliveryPhone = normalizeWhatsAppPhone(
      pendingEditItem?.deliveryDecision?.phone || clientPhone(report.client, report.clientId)
    );
    const existingDeliveryDecision = pendingEditItem?.deliveryDecision;
    const whatsappSkipReason = pendingEditItem?.whatsappSent
      ? "already_sent"
      : isEditingPendingReport && existingDeliveryDecision?.version
      ? (existingDeliveryDecision.shouldSend ? "" : (existingDeliveryDecision.skipReason || "not_requested"))
      : !shouldSendReportWhatsApp
        ? "not_requested"
        : isWhatsAppDisabledForClient(report)
          ? "disabled"
          : !deliveryPhone
            ? "missing_phone"
            : "";
    const deliveryDecision = {
      version:1,
      shouldSend:!whatsappSkipReason,
      skipReason:whatsappSkipReason,
      phone:deliveryPhone,
      message:whatsappSkipReason ? "" : buildWA(report),
      deliveryId:`${report.id}:completion`
    };
    const updateOriginal = isEditingExistingReport
      ? editingReport
      : (isEditingPendingReport && pendingEditItem?.savedToSheet ? editingReport.originalReport : undefined);
    const previousLocalReport = isEditingExistingReport
      ? [...sheetReports, ...reports].find(candidate =>
          (editingReport?.localId && String(candidate?.id || "") === String(editingReport.localId)) ||
          (
            normalizeDate(candidate?.reportDate) === normalizeDate(editingReport?.date) &&
            normalizeName(candidate?.operator) === normalizeName(editingReport?.operator) &&
            samePoolIdentity(candidate, editingReport)
          )
        ) || null
      : null;
    const inheritedCompletionContext = pendingEditItem?.completionContext;
    const completionContext = inheritedCompletionContext || {
      previousLastReading:lastReadingForClient(report.client, report.clientId) || null,
      previousLocalReport
    };
    const pendingOriginalReport = pendingEditItem ? getPendingReportPayload(pendingEditItem) : null;
    const pendingTaskTargetChanged = !!pendingOriginalReport && (
      normalizeDate(pendingOriginalReport.reportDate) !== normalizeDate(report.reportDate) ||
      normalizeName(pendingOriginalReport.operator) !== normalizeName(report.operator) ||
      !samePoolIdentity(pendingOriginalReport, report)
    );
    const inheritedTaskCompletion = pendingTaskTargetChanged ? null : pendingEditItem?.taskCompletion;
    const taskCompletion = inheritedTaskCompletion || (
      !isEditingExistingReport && (!isSubOperatorRole(user?.role) || approvalEditId)
        ? pendingTaskCompletionForReport(report)
        : {required:false, synced:true, taskId:"", lastError:""}
    );
    const pendingMeta = {
      sendWhatsAppOnSave:deliveryDecision.shouldSend,
      updateOriginal,
      completionContext,
      taskCompletion,
      whatsappSending:deliveryDecision.shouldSend,
      whatsappSkipReason,
      whatsappSent:!!pendingEditItem?.whatsappSent,
      deliveryDecision,
      editingPaused:false,
      replacePendingState:isEditingPendingReport,
      queueUpdatedAt:Math.max(Date.now(), Number(pendingEditItem?.queueUpdatedAt || 0) + 1),
      savedToSheet:false,
      criticalIssueQueued:!!pendingEditItem?.criticalIssueQueued,
      criticalIssueId:pendingEditItem?.criticalIssueId || ""
    };
    let pendingItem = null;
    immediateReportIdsRef.current.add(String(report.id || ""));
    try {
      pendingItem = await persistPendingReportBeforeSend(report, supplyUpdate, pendingMeta);
      if (isEditingPendingReport) {
        const pendingEditId = pendingReportStorageId(pendingEditItem);
        if (pendingEditId) editingPendingReportIdsRef.current.delete(pendingEditId);
      }
      setDismissed(false);
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setPendingBackgroundSync(true);
      }
    } catch (error) {
      immediateReportIdsRef.current.delete(String(report.id || ""));
      console.warn("Durable local report save failed", error);
      setAction("submitReport", "error", 2200);
      showToast(subText("שמירת הדוח בטלפון נכשלה - הדוח לא נשלח","Saving the report on this device failed. The report was not sent"));
      setSyncing(false);
      haptic("medium");
      return;
    }
    if (report.flow === "לא תקין" && !pendingItem?.criticalIssueQueued) {
      const pendingCriticalIssue = queueCriticalFlowIssue(report);
      pendingItem = {
        ...pendingItem,
        criticalIssueQueued:!!pendingCriticalIssue?._localPersisted,
        criticalIssueId:pendingCriticalIssue?.localId || ""
      };
      await persistPendingReportItem(pendingItem).catch(error =>
        console.warn("Critical issue queue state persistence failed", error)
      );
      void deliverCriticalFlowIssue(pendingCriticalIssue).catch(error =>
        console.warn("Critical flow issue delivery failed", error)
      );
    }
    if (isEditingExistingReport || isEditingPendingReport) {
      setReports(prev => {
        const next = [...prev];
        const idx = next.findIndex(r =>
          (report.id && String(r.id || "") === String(report.id)) ||
          (
            r.reportDate === editingReport.date &&
            samePoolIdentity(r, editingReport) &&
            r.operator === editingReport.operator
          )
        );
        if (idx >= 0) next[idx] = report;
        else next.push(report);
        return next;
      });
      if (editingReport.date !== report.reportDate || !samePoolIdentity(editingReport, report) || editingReport.operator !== report.operator) {
        forgetCompletedReport(editingReport.date, editingReport.client, editingReport.operator, editingReport.clientId);
      }
    } else {
      setReports(prev => upsertReportByIdentity(prev, report));
    }
    rememberCompletedReport(report);
    setLastReadings(prev => {
      const readingKey = currentClientId || client;
      const previous = lastReadingForClient(client, currentClientId) || {};
      const internalNote = report.waterCheckOnly ? String(previous.customStatusText || "").trim() : String(customStatusText || "").trim();
      const previousInternalNote = String(previous.customStatusText || "").trim();
      const internalNoteDate = internalNote
        ? (internalNote === previousInternalNote
            ? (previous.internalNoteDate || previous.customStatusDate || previous.date || reportDate)
            : reportDate)
        : "";
      return {
        ...prev,
        [readingKey]: mergeLatestReading(previous, {
           client,
           clientId: currentClientId,
           date: reportDate,
           reportDate,
           chlorine,
           ph: report.ph,
           salt:report.salt,
           chlora: report.chlora ?? "",
           hth: report.hth ?? "",
           phUp: report.phUp ?? "",
           acidLiters: report.acidLiters ?? "",
           poolStatus:report.poolStatus,
           customStatusText: internalNote,
           internalNoteDate,
           notes:report.notes,
           waterCheckOnly:report.waterCheckOnly,
           missedTreatment: false
         })
       };
     });

    setAction("submitReport", "success", 1200);
    showToast(whatsappSkipReason
      ? report.waterCheckOnly
        ? subText("✅ בדיקת המים נשמרה ללא הודעת סיום טיפול","✅ Water test saved without a treatment completion message")
        : subText("✅ הדוח נשמר בטלפון - שומר לשיטס ברקע","✅ Report saved on this device. Saving to Sheets in the background")
      : subText("✅ הדוח נשמר בטלפון - שולח ללקוח ושומר לשיטס ברקע","✅ Report saved on this device. Sending to the client and saving to Sheets"));
    setSyncing(false);
    if (approvalEditId) {
      void removePendingSubReport(approvalEditId).catch(e => console.warn("Pending approval cleanup failed", e));
      setApprovalEditId("");
    }
    setEditingReport(null);
    setSubmittedReport({...report,_deliveryDecision:deliveryDecision});
    setScreen("done");
    void (async () => {
      let activePendingItem = pendingItem;
      try {
        const saveRequest = getConfiguredSheetId()
          ? (
              updateOriginal
                ? sheetCall("updateReport", {
                    report,
                    original:updateOriginal,
                    supplyUpdate:supplyUpdate || undefined,
                    queueRevision:pendingItem?.queueRevision,
                    queueUpdatedAt:pendingItem?.queueUpdatedAt,
                  })
                : sheetCall("saveReport", {
                    report,
                    photos:photosBase64,
                    adminEmail:getCompany().adminEmail || "",
                    clientAddress:clientAddress(client,currentClientId),
                    clientPhone:clientPhone(client,currentClientId),
                    supplyUpdate:supplyUpdate || undefined,
                    queueRevision:pendingItem?.queueRevision,
                    queueUpdatedAt:pendingItem?.queueUpdatedAt,
                  })
            ).catch(() => null)
          : Promise.resolve(null);

        if (deliveryDecision.shouldSend) {
          const whatsAppResult = await sendReportWhatsApp(report, deliveryDecision).catch(error => {
            console.warn("WhatsApp send failed", error);
            return {sent:false, error:"whatsapp_send_failed"};
          });
          const whatsAppSent = !!whatsAppResult.sent;
          activePendingItem = {
            ...activePendingItem,
            whatsappSending:false,
            whatsappSent:whatsAppSent,
            lastError:whatsAppSent ? "" : (whatsAppResult.error || "whatsapp_send_failed")
          };
          await persistPendingReportItem(activePendingItem).catch(error =>
            console.warn("WhatsApp state persistence failed", error)
          );
          if (!whatsAppSent) {
            setDismissed(false);
            setPendingBackgroundSync(true);
            setAction("submitReport", "local", 2200);
          }
        } else {
          activePendingItem = {...activePendingItem, whatsappSending:false};
          await persistPendingReportItem(activePendingItem).catch(error =>
            console.warn("Skipped WhatsApp state persistence failed", error)
          );
        }

        const saveResponse = await saveRequest;
        if (saveResponse?.success === true) {
          const savedReport = reportWithServerId(report, saveResponse);
          const sheetConfirmed = await confirmReportSavedToSheet(savedReport);
          if (nextSupplyDB) setSupplyDB(nextSupplyDB);
          setReports(prev => upsertReportByIdentity(prev, savedReport));
          setSheetReports(prev => upsertReportByIdentity(prev, savedReport));
          if (!updateOriginal && !saveResponse?.duplicate && user?.role !== "admin") {
            void sendNotificationToAdmins(
              `✅ דוח בוצע: ${client}`,
              `${user?.name || "מפעיל"} שלח דוח · כלור ${report.chlorine}, pH ${report.ph}`
            ).catch(e => console.warn("Admin report notification failed", e));
          }
          if (!updateOriginal || shouldSendReportWhatsApp) {
            void autoShareOrderAfterReport(savedReport);
          }
          activePendingItem = {
            ...activePendingItem,
            report:savedReport,
            savedToSheet:sheetConfirmed,
            sheetError:sheetConfirmed ? "" : "sheet_confirm_failed"
          };
          if (sheetConfirmed) {
            activePendingItem = await syncPendingReportTaskCompletion(activePendingItem, savedReport);
          }
          await persistPendingReportItem(activePendingItem).catch(error =>
            console.warn("Sheet state persistence failed", error)
          );
          if (sheetConfirmed && !shouldKeepPendingReport(activePendingItem)) {
            setAction("submitReport", "success", 1200);
          } else {
            setDismissed(false);
            setPendingBackgroundSync(true);
            setAction("submitReport", "local", 2200);
          }
        } else {
          activePendingItem = {
            ...activePendingItem,
            whatsappSending:false,
            sheetError:"sheet_save_failed"
          };
          await persistPendingReportItem(activePendingItem).catch(error =>
            console.warn("Failed sheet state persistence failed", error)
          );
          setDismissed(false);
          setPendingBackgroundSync(true);
          setAction("submitReport", "local", 2200);
          showToast(subText("⚠️ הדוח נשמר בטלפון וממתין לשמירה בשיטס","⚠️ Report saved on this device and waiting to save to Sheets"));
        }
      } finally {
        immediateReportIdsRef.current.delete(String(report.id || ""));
      }
    })();
    return;
  };

  const handleSubmitPress = () => {
    if (!client || syncing || isActionLoading("submitReport")) return;
    if (waterCheckReportMode) {
      void handleSubmit({sendCustomerWhatsApp:false});
      return;
    }
    if (!isWhatsAppDisabledForClient({client,clientId:form.clientId})) {
      setConfirmReportWhatsApp({send:true});
      haptic("medium");
      return;
    }
    void handleSubmit();
  };

  const syncPendingReports = async (maxItems = Infinity, preferredItem = null) => {
    const currentPending = pendingRef.current;
    const pendingSource = preferredItem
      ? [preferredItem, ...currentPending.filter(item => !samePendingReport(item, preferredItem))]
      : currentPending;
    if (!pendingSource.length || pendingSyncRef.current || isActionLoading("syncPending")) {
      return { success:false, skipped:true, sent:0, failed:pendingSource.length };
    }
    pendingSyncRef.current = true;
    setAction("syncPending", "loading");

    const sent = [];
    const pausedEditing = pendingSource.filter(item => {
      const pendingId = pendingReportStorageId(item);
      return !!item?.editingPaused || (!!pendingId && editingPendingReportIdsRef.current.has(pendingId));
    });
    const pausedEditingIds = new Set(pausedEditing.map(pendingReportStorageId));
    const blockedUnknown = pendingSource.filter(item =>
      !isPendingReportDeletedLocally(item) &&
      !pausedEditingIds.has(pendingReportStorageId(item)) &&
      item?.lastError === "delivery_status_unknown"
    );
    const syncablePending = pendingSource.filter(item =>
      !isPendingReportDeletedLocally(item) &&
      !pausedEditingIds.has(pendingReportStorageId(item)) &&
      item?.lastError !== "delivery_status_unknown"
    );
    const itemsToSync = Number.isFinite(maxItems) ? syncablePending.slice(0, Math.max(1, maxItems)) : syncablePending;
    const failed = [
      ...pausedEditing,
      ...blockedUnknown,
      ...(Number.isFinite(maxItems) ? syncablePending.slice(itemsToSync.length) : [])
    ];
    let nextSupplyDBFromSync = supplyDB;
    let supplyDBChangedDuringSync = false;
    let skippedImmediateCount = pausedEditing.length;
    try {
      for (const item of itemsToSync) {
        if (isPendingReportDeletedLocally(item)) continue;
        const r = getPendingReportPayload(item);
        const immediateId = String(r?.id || "");
        const pendingId = pendingReportStorageId(item);
        if (
          (immediateId && immediateReportIdsRef.current.has(immediateId)) ||
          (pendingId && editingPendingReportIdsRef.current.has(pendingId))
        ) {
          skippedImmediateCount += 1;
          failed.push(item);
          continue;
        }
        const rebuiltSupply = buildSupplyUpdateForReport(r, nextSupplyDBFromSync);
        const supplyUpdate = rebuiltSupply?.row || getPendingSupplyUpdate(item);
        const updateOriginal = getPendingUpdateOriginal(item);
        const deliveryMeta = {
          deliveryDecision:item?.deliveryDecision,
          whatsappSkipReason:item?.whatsappSkipReason,
          whatsappSent:!!item?.whatsappSent,
          pendingStorageId:item?.pendingStorageId || pendingReportStorageId(item),
          queueRevision:item?.queueRevision,
          queueUpdatedAt:item?.queueUpdatedAt,
          completionContext:item?.completionContext,
          taskCompletion:item?.taskCompletion,
          criticalIssueQueued:!!item?.criticalIssueQueued,
          criticalIssueId:item?.criticalIssueId || "",
          editingPaused:false
        };
        let savedReport = r;
        let saveSucceeded = isPendingReportSavedToSheet(item);

        if (!saveSucceeded) {
          const res = updateOriginal
            ? await sheetCall("updateReport", {
                report:r,
                original:updateOriginal,
                supplyUpdate,
                queueRevision:item?.queueRevision,
                queueUpdatedAt:item?.queueUpdatedAt
              }).catch(() => null)
            : await sheetCall("saveReport", {
                report:r,
                supplyUpdate,
                queueRevision:item?.queueRevision,
                queueUpdatedAt:item?.queueUpdatedAt
              }).catch(() => null);
          saveSucceeded = res?.success === true;
          if (saveSucceeded) {
            savedReport = reportWithServerId(r, res);
            if (rebuiltSupply?.db) {
              nextSupplyDBFromSync = rebuiltSupply.db;
              supplyDBChangedDuringSync = true;
            }
          }
        }

        if (!saveSucceeded) {
          if (!isPendingReportDeletedLocally(item)) failed.push(item);
          continue;
        }

        const sheetConfirmed = await confirmReportSavedToSheet(savedReport);
        if (!sheetConfirmed) {
          if (!isPendingReportDeletedLocally(item)) failed.push(makePendingReportItem(savedReport, supplyUpdate, { ...deliveryMeta, savedToSheet:false, updateOriginal, sendWhatsAppOnSave:shouldSendPendingReportWhatsApp(item, savedReport), lastError:"sheet_confirm_failed" }));
          continue;
        }

        if (savedReport.flow === "לא תקין" && !deliveryMeta.criticalIssueQueued) {
          const pendingCriticalIssue = queueCriticalFlowIssue(savedReport);
          deliveryMeta.criticalIssueQueued = !!pendingCriticalIssue?._localPersisted;
          deliveryMeta.criticalIssueId = pendingCriticalIssue?.localId || "";
          void deliverCriticalFlowIssue(pendingCriticalIssue).catch(error =>
            console.warn("Pending report critical issue delivery failed", error)
          );
        }

        const taskCompletionItem = await syncPendingReportTaskCompletion(
          makePendingReportItem(savedReport, supplyUpdate, {
            ...deliveryMeta,
            savedToSheet:true,
            updateOriginal
          }),
          savedReport
        );
        deliveryMeta.taskCompletion = taskCompletionItem.taskCompletion;
        const sendWhatsAppOnSave = shouldSendPendingReportWhatsApp(item, savedReport);
        if (!sendWhatsAppOnSave) {
          const completedItem = makePendingReportItem(savedReport, supplyUpdate, { ...deliveryMeta, savedToSheet:true, updateOriginal, sendWhatsAppOnSave });
          if (shouldKeepPendingReport(completedItem)) failed.push(completedItem);
          else sent.push(completedItem);
          continue;
        }

        const whatsAppResult = await sendReportWhatsApp(savedReport, item?.deliveryDecision).catch(e => {
          console.warn("Pending WhatsApp send failed", e);
          return {sent:false, error:"whatsapp_send_failed"};
        });
        const whatsAppSent = !!whatsAppResult.sent;

        if (whatsAppSent) {
          const completedItem = makePendingReportItem(savedReport, supplyUpdate, { ...deliveryMeta, whatsappSent:true, savedToSheet:true, updateOriginal, sendWhatsAppOnSave });
          if (shouldKeepPendingReport(completedItem)) failed.push(completedItem);
          else sent.push(completedItem);
        } else {
          if (!isPendingReportDeletedLocally(item)) failed.push(makePendingReportItem(savedReport, supplyUpdate, {
            ...deliveryMeta,
            savedToSheet:true,
            updateOriginal,
            sendWhatsAppOnSave,
            lastError:whatsAppResult.error || "whatsapp_send_failed"
          }));
        }
      }

      const cleanedSentVersions = new Set();
      if (sent.length) {
        await Promise.all(sent.map(async item => {
          const deleted = await deletePendingReportFromIndexedDBIfUnchanged(item).catch(error => {
            console.warn("Completed pending report cleanup failed", error);
            return false;
          });
          if (deleted) {
            cleanedSentVersions.add(`${pendingReportStorageId(item)}|${pendingReportPayloadFingerprint(item)}`);
          }
        }));
        if (supplyDBChangedDuringSync) setSupplyDB(nextSupplyDBFromSync);
        setReports(prev => sent.reduce((acc, item) => upsertReportByIdentity(acc, getPendingReportPayload(item)), prev));
        setSheetReports(prev => sent.reduce((acc, item) => upsertReportByIdentity(acc, getPendingReportPayload(item)), prev));
        sent.forEach(item => {
          void autoShareOrderAfterReport(getPendingReportPayload(item));
        });
      }

      const visibleFailed = failed.filter(item => !isPendingReportDeletedLocally(item));
      setPending(current => {
        const next = [...current];
        itemsToSync.forEach(original => {
          const currentIndex = next.findIndex(item => samePendingReport(item, original));
          if (currentIndex < 0) return;
          if (pendingReportPayloadFingerprint(next[currentIndex]) !== pendingReportPayloadFingerprint(original)) return;
          const failedItem = visibleFailed.find(item => samePendingReport(item, original));
          if (failedItem) {
            next[currentIndex] = mergePendingReportItems(next[currentIndex], failedItem);
            return;
          }
          const sentItem = sent.find(item =>
            samePendingReport(item, original) &&
            pendingReportPayloadFingerprint(item) === pendingReportPayloadFingerprint(original)
          );
          if (sentItem && !cleanedSentVersions.has(`${pendingReportStorageId(sentItem)}|${pendingReportPayloadFingerprint(sentItem)}`)) {
            next[currentIndex] = mergePendingReportItems(next[currentIndex], sentItem);
            return;
          }
          next.splice(currentIndex, 1);
        });
        visibleFailed.forEach(failedItem => {
          if (isPendingReportDeletedLocally(failedItem)) return;
          if (!next.some(item => samePendingReport(item, failedItem))) next.push(failedItem);
        });
        pendingRef.current = next;
        return next;
      });
      setPendingBackgroundSync(
        visibleFailed.some(item => item?.lastError !== "delivery_status_unknown") ||
        cleanedSentVersions.size < sent.length ||
        pendingOperatorIssues.length > 0
      );
      const onlySkippedImmediate = visibleFailed.length > 0 && visibleFailed.length === skippedImmediateCount && sent.length === 0;
      if (onlySkippedImmediate) {
        setAction("syncPending", "idle");
      } else {
        setAction("syncPending", visibleFailed.length ? "error" : "success", visibleFailed.length ? 2200 : 1600);
        showToast(visibleFailed.length
          ? subText(`⚠️ ${visibleFailed.length} דוחות עדיין ממתינים לשליחה ללקוח`,`⚠️ ${visibleFailed.length} reports are still waiting to be sent to clients`)
          : subText("✅ כל הדוחות נשלחו ללקוחות!","✅ All reports were sent to clients!"));
      }
      const preferredStillPending = preferredItem ? visibleFailed.some(item => samePendingReport(item, preferredItem)) : false;
      return {
        success: preferredItem ? !preferredStillPending : visibleFailed.length === 0,
        sent: sent.length,
        failed: visibleFailed.length
      };
    } finally {
      pendingSyncRef.current = false;
    }

  };
  const togglePendingBackgroundSync = (e) => {
    e?.stopPropagation?.();
    setPendingBackgroundSync(active => {
      if (active && pending.length) {
        showToast(subText("שליחה ברקע נשארת פעילה עד שכל הלקוחות יקבלו הודעה","Background sending stays active until every client receives a message"));
        return true;
      }
      const next = !active;
      showToast(next
        ? subText("שליחת דוחות ברקע הופעלה","Background report sending started")
        : subText("שליחת דוחות ברקע נעצרה","Background report sending stopped"));
      return next;
    });
  };

  const openPendingReportForEdit = async (item, e) => {
    e?.stopPropagation?.();
    const r = getPendingReportPayload(item) || {};
    if (!r.client) return;
    if (r?.id && immediateReportIdsRef.current.has(String(r.id))) {
      showToast(subText("הדוח עדיין בתהליך שמירה. נסה לערוך שוב בעוד רגע","The report is still being saved. Try editing it again in a moment"));
      return;
    }
    if (pendingSyncRef.current || isActionLoading("syncPending")) {
      showToast(subText("הדוח מסתנכרן כרגע. נסה שוב בעוד רגע","The report is syncing now. Try again in a moment"));
      return;
    }
    const pendingId = pendingReportStorageId(item);
    if (pendingId) editingPendingReportIdsRef.current.add(pendingId);
    const pausedItem = setPendingEditingPaused(item, true);
    try {
      await persistPendingReportItem(pausedItem, {durableFirst:true});
    } catch (error) {
      if (pendingId) editingPendingReportIdsRef.current.delete(pendingId);
      console.warn("Pending report edit pause failed", error);
      showToast(subText("לא ניתן לפתוח את הדוח בבטחה לעריכה","The report could not be opened safely for editing"));
      haptic("medium");
      return;
    }
    setForm({
      ...blank(),
      ...r,
      ...reportSupplyFlags(r),
      reportDate: r.reportDate || todayStr(),
      client: r.client,
      clientLocked: true,
      ph: isLowPhValue(r.ph) ? 0 : r.ph,
      salt: isLowSaltFlagValue(r.salt) ? 0 : r.salt,
      chlorineZeroConfirmed: Number(r.chlorine || 0) === 0,
      phLowConfirmed: isLowPhValue(r.ph),
      lowSaltLight: isLowSaltReportValue(r.salt)
    });
    setEditingReport({
      date:r.reportDate,
      client:r.client,
      clientId:r.clientId || "",
      operator:r.operator || user?.name,
      localId:r.id,
      pendingLocal:true,
      pendingItem:pausedItem,
      originalReport:r
    });
    setScreen("form");
    haptic("medium");
    showToast(subText("הדוח הממתין נטען לעריכה ושליחה מחדש","Queued report loaded for editing and resubmission"));
  };

  const leaveReportForm = () => {
    const pendingItem = editingReport?.pendingLocal ? editingReport.pendingItem : null;
    if (pendingItem) {
      const pendingId = pendingReportStorageId(pendingItem);
      if (pendingId) editingPendingReportIdsRef.current.delete(pendingId);
      const resumedItem = setPendingEditingPaused(pendingItem, false);
      void persistPendingReportItem(resumedItem).catch(error => {
        console.warn("Pending report edit resume failed", error);
        setPendingReportItem(resumedItem);
        setPendingBackgroundSync(true);
      });
    }
    setEditingReport(null);
    setScreen("daily");
  };

  const cacheLastReadings = (value) => {
    try {
      const cached = JSON.parse(localStorage.getItem("galileo_cache") || "{}");
      localStorage.setItem("galileo_cache", JSON.stringify({...cached, lastReadings:value, cachedAt:Date.now()}));
    } catch {}
  };

  const restoreLastReadingsAfterPendingDelete = async (item, report) => {
    if (sheetId) {
      const response = await sheetCall("getLastReadings").catch(() => null);
      if (response?.lastReadings && typeof response.lastReadings === "object" && !Array.isArray(response.lastReadings)) {
        setLastReadings(response.lastReadings);
        cacheLastReadings(response.lastReadings);
        return;
      }
    }
    const context = item?.completionContext || {};
    const hasSnapshot = Object.prototype.hasOwnProperty.call(context, "previousLastReading");
    setLastReadings(previous => {
      const wantedId = String(report?.clientId || "").trim();
      const entry = Object.entries(previous || {}).find(([key, value]) =>
        (wantedId && (String(key) === wantedId || String(value?.clientId || "") === wantedId)) ||
        (!wantedId && normalizeName(value?.client || key) === normalizeName(report?.client))
      );
      if (!entry) return previous;
      const [readingKey, currentReading] = entry;
      if (measurementDate(currentReading) !== normalizeDate(report?.reportDate)) return previous;
      const next = {...previous};
      if (hasSnapshot) {
        if (context.previousLastReading) next[readingKey] = context.previousLastReading;
        else delete next[readingKey];
      } else {
        const older = (Array.isArray(currentReading?.previousMeasurements) ? currentReading.previousMeasurements : [])
          .find(reading => measurementDate(reading) !== normalizeDate(report?.reportDate));
        if (older) next[readingKey] = older;
        else delete next[readingKey];
      }
      cacheLastReadings(next);
      return next;
    });
  };

  const otherCompletionExistsForReport = (report) =>
    [...sheetReports, ...reports]
      .filter(candidate => !sameReportIdentity(candidate, report))
      .some(candidate =>
        normalizeDate(candidate?.reportDate) === normalizeDate(report?.reportDate) &&
        normalizeName(candidate?.operator) === normalizeName(report?.operator) &&
        samePoolIdentity(candidate, report)
      );

  const reopenTaskAfterPendingDelete = async (item, report, hasOtherCompletion) => {
    if (hasOtherCompletion || getPendingUpdateOriginal(item)) return true;
    const completion = item?.taskCompletion || {};
    if (!getConfiguredSheetId()) return false;
    const result = await sheetCall("setTaskReportCompletion", {
      completed:false,
      taskId:completion.taskId || "",
      report,
      actor:user?.name || report?.operator || "",
      at:nowStr(),
      completedByReport:completion.synced === true
    }).catch(() => null);
    if (!result?.success || !Array.isArray(result?.tasks)) return false;
    tasksRef.current = result.tasks;
    setTasks(result.tasks);
    return true;
  };

  const discardPendingReportCompletion = async (item, report, hasOtherCompletion) => {
    const previousLocalReport = item?.completionContext?.previousLocalReport;
    setReports(previous => {
      const withoutPending = previous.filter(candidate => !sameReportIdentity(candidate, report));
      return previousLocalReport ? upsertReportByIdentity(withoutPending, previousLocalReport) : withoutPending;
    });
    if (!getPendingUpdateOriginal(item) && !hasOtherCompletion) {
      forgetCompletedReport(report.reportDate, report.client, report.operator, report.clientId);
    }
    await restoreLastReadingsAfterPendingDelete(item, report);
  };

  const deletePendingReport = async (item, e) => {
    e?.stopPropagation?.();
    const pendingId = pendingReportStorageId(item);
    const report = getPendingReportPayload(item) || {};
    const actionKey = `deletePending:${pendingId}`;
    if (isActionLoading(actionKey)) return;
    if (item?.editingPaused || (pendingId && editingPendingReportIdsRef.current.has(pendingId))) {
      showToast(subText("סגור את עריכת הדוח לפני המחיקה","Close the report editor before deleting it"));
      return;
    }
    if (report?.id && immediateReportIdsRef.current.has(String(report.id))) {
      showToast(subText("הדוח עדיין בתהליך שמירה. נסה למחוק שוב בעוד רגע","The report is still being saved. Try deleting it again in a moment"));
      return;
    }
    if (pendingSyncRef.current || isActionLoading("syncPending")) {
      showToast(subText("הדוח מסתנכרן כרגע. נסה למחוק שוב בעוד רגע","The report is syncing now. Try deleting it again in a moment"));
      return;
    }
    if (!isPendingReportSavedToSheet(item) && typeof navigator !== "undefined" && navigator.onLine === false) {
      showToast(subText("אין חיבור ולכן לא ניתן לוודא שהדוח לא נשמר. המחיקה לא בוצעה","There is no connection, so the report storage status cannot be verified. It was not deleted"));
      haptic("medium");
      return;
    }
    setAction(actionKey, "loading");
    const pausedItem = setPendingEditingPaused(item, true);
    try {
      await persistPendingReportItem(pausedItem, {durableFirst:true});
    } catch (error) {
      console.warn("Pending report delete pause failed", error);
      setAction(actionKey, "error", 2200);
      showToast(subText("לא ניתן לעצור את סנכרון הדוח בבטחה","The report sync could not be paused safely"));
      haptic("medium");
      return;
    }

    const resumePausedItem = async (sourceItem = pausedItem) => {
      const resumedItem = setPendingEditingPaused(sourceItem, false);
      await persistPendingReportItem(resumedItem).catch(error => {
        console.warn("Pending report delete resume failed", error);
        setPendingReportItem(resumedItem);
        setPendingBackgroundSync(true);
      });
    };

    let storageStatus = isPendingReportSavedToSheet(item)
      ? {checked:true, confirmed:true}
      : await getReportSheetStorageStatus(report);
    if (!storageStatus.checked) {
      await resumePausedItem();
      setAction(actionKey, "error", 2200);
      showToast(subText("לא ניתן לוודא אם הדוח כבר נשמר. המחיקה בוטלה כדי לא לפגוע בנתונים","The report storage status could not be verified. Deletion was cancelled to protect the data"));
      haptic("medium");
      return;
    }

    const prepareSavedItemForDeletion = async (sourceItem) => {
      const trackedItem = sourceItem?.taskCompletion
        ? sourceItem
        : {...sourceItem, taskCompletion:pendingTaskCompletionForReport(report)};
      return syncPendingReportTaskCompletion(
        {...trackedItem, savedToSheet:true},
        report
      );
    };

    let itemToDelete = pausedItem;
    if (storageStatus.confirmed) {
      itemToDelete = await prepareSavedItemForDeletion(pausedItem);
      if (pendingReportNeedsTaskCompletion(itemToDelete)) {
        await resumePausedItem(itemToDelete);
        setAction(actionKey, "error", 2200);
        showToast(subText("הדוח כבר נשמר. עדכון המשימה עדיין ממתין לסנכרון","The report is already saved. Its task update is still waiting to sync"));
        haptic("medium");
        return;
      }
      setReports(previous => upsertReportByIdentity(previous, report));
      setSheetReports(previous => upsertReportByIdentity(previous, report));
      rememberCompletedReport(report);
    } else {
      const hasOtherCompletion = otherCompletionExistsForReport(report);
      const taskReopened = await reopenTaskAfterPendingDelete(item, report, hasOtherCompletion);
      if (!taskReopened) {
        await resumePausedItem();
        setAction(actionKey, "error", 2200);
        showToast(subText("עדכון המשימה נכשל ולכן הדוח לא נמחק. נסה שוב כשיש חיבור","The task could not be updated, so the report was not deleted. Try again when connected"));
        haptic("medium");
        return;
      }
      const latestStorageStatus = await getReportSheetStorageStatus(report);
      if (!latestStorageStatus.checked) {
        await resumePausedItem();
        setAction(actionKey, "error", 2200);
        showToast(subText("לא ניתן להשלים את בדיקת המחיקה. הדוח נשאר שמור בטלפון","The deletion check could not be completed. The report remains saved on this device"));
        haptic("medium");
        return;
      }
      if (latestStorageStatus.confirmed) {
        storageStatus = latestStorageStatus;
        itemToDelete = await prepareSavedItemForDeletion(pausedItem);
        if (pendingReportNeedsTaskCompletion(itemToDelete)) {
          await resumePausedItem(itemToDelete);
          setAction(actionKey, "error", 2200);
          showToast(subText("הדוח נשמר בזמן הבדיקה. עדכון המשימה עדיין ממתין לסנכרון","The report was saved during the check. Its task update is still waiting to sync"));
          haptic("medium");
          return;
        }
        setReports(previous => upsertReportByIdentity(previous, report));
        setSheetReports(previous => upsertReportByIdentity(previous, report));
        rememberCompletedReport(report);
      } else {
        itemToDelete = pausedItem;
      }
    }

    const deleted = await removePendingReport(itemToDelete);
    if (!deleted) {
      await resumePausedItem(itemToDelete);
      setAction(actionKey, "error", 2200);
      showToast(subText("מחיקת הדוח נכשלה והוא נשאר בתור המקומי","The report could not be deleted and remains in the local queue"));
      haptic("medium");
      return;
    }
    if (!storageStatus.confirmed) {
      await discardPendingReportCompletion(item, report, otherCompletionExistsForReport(report));
    }
    if (pendingRef.current.length === 0) setPendingBackgroundSync(false);
    setAction(actionKey, "success", 1200);
    showToast(storageStatus.confirmed
      ? subText("הדוח כבר נשמר והוסר מהתור המקומי בלבד","The report was already saved and was removed from the local queue only")
      : subText("הדוח נמחק והמשימה מסומנת כממתינה","The report was deleted and the task is marked as pending"));
    haptic("medium");
  };

  const retryPendingReport = async (item, e) => {
    e?.stopPropagation?.();
    const key = `retryPending:${pendingReportStorageId(item)}`;
    if (isActionLoading(key)) return;
    let retryItem = item;
    if (item?.lastError === "delivery_status_unknown") {
      const approved = window.confirm(
        "לא ניתן לדעת אם ההודעה הקודמת נשלחה. שליחה מחדש עלולה ליצור הודעה כפולה. לשלוח שוב?"
      );
      if (!approved) return;
      const report = getPendingReportPayload(item) || {};
      setAction(key, "loading");
      const reset = await sheetCall("resetGreenApiDeliveryGuard", {
        reportId:report.id,
        messageType:"reportCompletion",
        confirmReset:true
      }).catch(() => null);
      if (reset?.error === "delivery_already_confirmed") {
        retryItem = {...item, whatsappSent:true, lastError:""};
        await persistPendingReportItem(retryItem).catch(() => null);
      } else if (!reset?.success) {
        setAction(key, "error", 2200);
        showToast(subText(
          "לא ניתן כרגע לאפשר שליחה מחדש. הדוח נשאר שמור בתור",
          "The message retry could not be enabled. The report remains in the queue"
        ));
        return;
      } else {
        retryItem = {...item, lastError:""};
        await persistPendingReportItem(retryItem).catch(() => null);
      }
    }
    setAction(key, "loading");
    const result = await syncPendingReports(1, retryItem).catch(error => {
      console.warn("Manual pending report retry failed", error);
      return { success:false };
    });
    setAction(key, result?.success ? "success" : "error", result?.success ? 1400 : 2200);
  };

  const pendingReportToneStyle = (tone) => {
    if (tone === "success") return { background:"#e8f5e9", color:C.green, border:"1px solid #c8e6c9" };
    if (tone === "error") return { background:"#ffebee", color:C.red, border:"1px solid #ffcdd2" };
    return { background:"#fff8e1", color:C.orange, border:"1px solid #ffe082" };
  };

  const pendingReportSummary = () => pending.reduce((acc, item) => {
    const info = pendingReportQueueInfo(item);
    acc.total += 1;
    if (info.stage === "editing") acc.editing += 1;
    else if (info.stage.startsWith("sheetPending")) acc.sheet += 1;
    else if (info.stage === "taskPending") acc.task += 1;
    else if (info.stage === "adminIssuePending") acc.issue += 1;
    else acc.message += 1;
    return acc;
  }, { total:0, sheet:0, task:0, issue:0, message:0, editing:0 });

  const pendingReportSummaryText = () => {
    const s = pendingReportSummary();
    return [
      s.editing && subText(`${s.editing} בעריכה`,`${s.editing} being edited`),
      s.sheet && subText(`${s.sheet} לשיטס`,`${s.sheet} for Sheets`),
      s.task && subText(`${s.task} עדכוני משימה`,`${s.task} task updates`),
      s.issue && subText(`${s.issue} תקלות לאדמין`,`${s.issue} admin issues`),
      s.message && subText(`${s.message} הודעות`,`${s.message} messages`)
    ].filter(Boolean).join(" · ");
  };
  const pendingReportLabelText = (info) => {
    if (!isSubOperatorEnglish) return info.label;
    const labels = {
      sheetPendingMessageSent:"Message sent · waiting to save to Sheets",
      sheetPendingNoMessage:"No message · waiting to save to Sheets",
      sheetPendingWhatsAppDisabled:"WhatsApp off · waiting to save to Sheets",
      sheetPendingMissingPhone:"No phone · waiting to save to Sheets",
      sheetPendingMessageFailed:"WhatsApp message failed · waiting to save to Sheets",
      sheetPendingMessageUnknown:"Message delivery could not be verified · waiting to save to Sheets",
      complete:"Saved to Sheets · message sent",
      sheetSaved:"Saved to Sheets · no message",
      whatsappDisabled:"Saved to Sheets · WhatsApp off",
      clientLoading:"Saved to Sheets · waiting for client data",
      missingPhone:"Saved to Sheets · no phone",
      messageUnknown:"Saved to Sheets · message delivery could not be verified",
      adminIssuePending:"Saved to Sheets · waiting to save the admin issue",
      editing:"Open for editing · sync paused"
    };
    if (info.stage === "sheetPending") return info.tone === "error" ? "Saved locally · message failed" : "Saved locally · waiting to send message";
    if (info.stage === "messagePending") return info.tone === "error" ? "Saved to Sheets · WhatsApp message failed" : "Saved to Sheets · waiting to send message";
    return labels[info.stage] || info.label;
  };

  const renderPendingReportRows = () => pending.map((item,i)=>{
    const r = getPendingReportPayload(item)||{};
    const info = pendingReportQueueInfo(item);
    const retryKey = `retryPending:${pendingReportStorageId(item)}`;
    const deleteKey = `deletePending:${pendingReportStorageId(item)}`;
    return (
      <div key={r.id||i} style={{display:"grid",gridTemplateColumns:"auto minmax(0,1fr) auto",alignItems:"center",gap:10,padding:"6px 0",borderTop:i?`1px solid ${C.border}`:"none"}}>
        <Press disabled={isActionLoading(deleteKey)} onClick={(e)=>deletePendingReport(item,e)} style={{padding:"5px 9px",borderRadius:9,background:"#ffebee",color:C.red,fontSize:11,fontWeight:900,opacity:isActionLoading(deleteKey)?0.65:1}}>
          {actionLabel(deleteKey,{idle:subText("מחק","Delete"),loading:subText("בודק...","Checking..."),success:subText("נמחק","Deleted"),error:subText("נסה שוב","Retry")})}
        </Press>
        <div style={{minWidth:0}}>
          <div style={{fontSize:12,fontWeight:900,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.client||subText("לקוח ללא שם","Unnamed client")}</div>
          <div style={{display:"inline-flex",marginTop:4,padding:"3px 8px",borderRadius:99,fontSize:10,fontWeight:900,...pendingReportToneStyle(info.tone)}}>{pendingReportLabelText(info)}</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",justifyContent:"flex-end"}}>
          <Press onClick={(e)=>retryPendingReport(item,e)} style={{padding:"5px 9px",borderRadius:9,background:actionStatus[retryKey]==="success"?C.green:actionStatus[retryKey]==="error"?C.orange:"#e8f5e9",color:actionStatus[retryKey]==="success"?"#fff":C.green,fontSize:11,fontWeight:900}}>
            {actionLabel(retryKey,{idle:subText("נסה","Retry"),loading:subText("שולח...","Sending..."),success:subText("בוצע","Done"),error:subText("נכשל","Failed")})}
          </Press>
          <Press onClick={(e)=>openPendingReportForEdit(item,e)} style={{padding:"5px 9px",borderRadius:9,background:"#e3f2fd",color:C.blue,fontSize:11,fontWeight:900}}>{subText("טען","Load")}</Press>
        </div>
      </div>
    );
  });

  const pendingOperatorIssueStatusText = (issue) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return subText("אין חיבור · נשמר בטלפון","Offline · saved on this device");
    }
    if (issue?.lastError) {
      return subText("ניסיון השליחה נכשל · נשמר בטלפון","Sending failed · saved on this device");
    }
    if (issue?.lastAttemptAt) {
      return subText("ממתין לאישור שליחה","Waiting for delivery confirmation");
    }
    return subText("נשמר בטלפון · ממתין לשליחה","Saved on this device · waiting to send");
  };

  const retryPendingOperatorIssue = async (issue, e) => {
    e?.stopPropagation?.();
    const key = `retryPendingIssue:${pendingOperatorIssueKey(issue)}`;
    if (isActionLoading(key)) return;
    setAction(key, "loading");
    const result = await syncPendingOperatorIssues(1, true, issue).catch(error => {
      console.warn("Manual pending operator issue retry failed", error);
      return {success:false};
    });
    if (result?.skipped) {
      setAction(key, "idle");
      showToast(subText("השליחה כבר מתבצעת","Sending is already in progress"));
      return;
    }
    const success = !!result?.success;
    setAction(key, success ? "success" : "error", success ? 1400 : 2200);
    showToast(success
      ? subText("התקלה נשלחה לאדמין","The issue was sent to the admin")
      : result?.offline
        ? subText("אין חיבור · התקלה נשארה שמורה בטלפון","Offline · the issue remains saved on this device")
        : subText("השליחה נכשלה · התקלה נשארה שמורה בטלפון","Sending failed · the issue remains saved on this device"));
    haptic(success ? "success" : "medium");
  };

  const retryAllPendingOperatorIssues = async (e) => {
    e?.stopPropagation?.();
    const key = "syncPendingIssues";
    if (isActionLoading(key)) return;
    setAction(key, "loading");
    const result = await syncPendingOperatorIssues(Infinity, true).catch(error => {
      console.warn("Manual pending operator issue sync failed", error);
      return {success:false};
    });
    const success = !!result?.success;
    setAction(key, success ? "success" : "error", success ? 1400 : 2200);
    showToast(success
      ? subText("כל התקלות נשלחו לאדמין","All issues were sent to the admin")
      : result?.offline
        ? subText("אין חיבור · התקלות נשארו שמורות בטלפון","Offline · the issues remain saved on this device")
        : subText("חלק מהתקלות עדיין ממתינות לשליחה","Some issues are still waiting to be sent"));
    haptic(success ? "success" : "medium");
  };

  const renderPendingOperatorIssueRows = () => pendingOperatorIssues.map((issue, i) => {
    const retryKey = `retryPendingIssue:${pendingOperatorIssueKey(issue)}`;
    const priorityColor = isCriticalIssue(issue.priority) ? C.red : issue.priority === "דחוף" ? C.orange : C.blue;
    return (
      <div key={pendingOperatorIssueKey(issue)} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",alignItems:"center",gap:10,padding:"9px 0",borderTop:i?`1px solid ${C.border}`:"none"}}>
        <div style={{minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{fontSize:12,fontWeight:900,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{issue.client || subText("תקלה כללית","General issue")}</span>
            <span style={{padding:"2px 7px",borderRadius:99,background:`${priorityColor}14`,border:`1px solid ${priorityColor}35`,color:priorityColor,fontSize:9,fontWeight:900}}>{issue.priority || subText("רגיל","Normal")}</span>
          </div>
          <div style={{fontSize:11,fontWeight:700,color:C.muted,marginTop:3,lineHeight:1.4,overflowWrap:"anywhere"}}>{issue.desc}</div>
          <div style={{fontSize:10,fontWeight:900,color:issue.lastError?C.orange:C.muted,marginTop:4}}>{pendingOperatorIssueStatusText(issue)}</div>
        </div>
        <button type="button" disabled={isActionLoading(retryKey)} onClick={(e)=>retryPendingOperatorIssue(issue,e)} style={{minWidth:44,minHeight:44,padding:"7px 10px",borderRadius:9,background:actionStatus[retryKey]==="success"?C.green:actionStatus[retryKey]==="error"?"#fff7ed":"#e3f2fd",border:`1px solid ${actionStatus[retryKey]==="error"?"#fed7aa":C.border}`,color:actionStatus[retryKey]==="success"?"#fff":actionStatus[retryKey]==="error"?C.orange:C.blue,fontFamily:"inherit",fontSize:11,fontWeight:900,opacity:isActionLoading(retryKey)?0.7:1,cursor:isActionLoading(retryKey)?"wait":"pointer"}}>
          {actionLabel(retryKey,{idle:subText("נסה שוב","Retry"),loading:subText("שולח...","Sending..."),success:subText("נשלח","Sent"),error:subText("נכשל","Failed")})}
        </button>
      </div>
    );
  });

  pendingReportSyncRunnerRef.current = syncPendingReports;
  pendingIssueSyncRunnerRef.current = syncPendingOperatorIssues;

  useEffect(() => {
    if (pending.length || pendingOperatorIssues.length) setPendingBackgroundSync(true);
  }, [pending.length, pendingOperatorIssues.length]);

  useEffect(() => {
    if (!pendingBackgroundSync) return;
    if (!pending.length && !pendingOperatorIssues.length) return;

    const retryPending = (maxItems = Infinity) => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        if (pendingOperatorIssuesRef.current.length) void pendingIssueSyncRunnerRef.current?.(maxItems, true);
        if (pendingRef.current.length) void requestPendingReportBackgroundSync();
        return;
      }
      if (pendingRef.current.length) void pendingReportSyncRunnerRef.current?.(maxItems);
      if (pendingOperatorIssuesRef.current.length) void pendingIssueSyncRunnerRef.current?.(maxItems, true);
    };
    const retryAllPending = () => retryPending();
    const retryOnePending = () => retryPending(1);

    const retryTimer = window.setTimeout(retryAllPending, 250);
    const retryInterval = window.setInterval(retryOnePending, 15000);
    window.addEventListener("online", retryAllPending);
    window.addEventListener("focus", retryAllPending);
    document.addEventListener("visibilitychange", retryAllPending);

    return () => {
      window.clearTimeout(retryTimer);
      window.clearInterval(retryInterval);
      window.removeEventListener("online", retryAllPending);
      window.removeEventListener("focus", retryAllPending);
      document.removeEventListener("visibilitychange", retryAllPending);
    };
  }, [pending.length, pendingOperatorIssues.length, pendingBackgroundSync]);

  const openManualReport = () => {
    if (isActionLoading("openManualReport")) return;
    setAction("openManualReport", "loading");
    haptic("medium");
    setClientSearch("");
    setEditingReport(null);
    setForm(blank());
    setScreen("form");
    setAction("openManualReport", "idle");
  };
  const largeSlider = String(user?.username||"").toLowerCase()==="or";
  const currentPoolType = (findClientByName(client, form.clientId)||{}).poolType || "מלח";
  const currentPrimaryPool = primaryPoolType(currentPoolType);

  const SLIDER_CONFIGS = [
    {key:"chlorine",label:"כלור",min:0,max:8,step:0.1,unit:" ppm",warnAbove:3,optimal:1.5,val:chlorine,fn:v=>setForm(f=>({...f,chlorine:v,chlorineZeroConfirmed:Number(v)===0?f.chlorineZeroConfirmed:false})),required:true},
    {key:"ph",label:"pH",min:5,max:9,step:0.1,unit:"",warnAbove:8,warnBelow:6,optimal:7.4,val:ph,fn:v=>setForm(f=>({...f,ph:v,phLowConfirmed:Number(v)===0?f.phLowConfirmed:false})),phLowButton:true,required:true},
    {key:"salt",label:"רמת מלח",min:0,max:6000,step:100,unit:" PPM",optimal:3500,val:salt,fn:v=>setForm(f=>({...f,salt:v,lowSaltLight:isNormalSaltLevelValue(v)?false:f.lowSaltLight})),disabled:currentPrimaryPool==="כלור",disabledReason:"נעול בבריכת כלור",saltLowLightButton:true},
    {key:"chlora",label:"טבליות כלור (TAB)",min:0,max:5,step:0.25,unit:"",val:form.chlora??0,fn:v=>sf("chlora",v),zeroButtonLabel:"אין צורך להוסיף",required:true},
    {key:"hth",label:"HTH",min:0,max:5,step:0.5,unit:" cups",val:form.hth??0,fn:v=>sf("hth",v)},
    {key:"phUp",label:"מעלה pH",min:0,max:5,step:0.5,unit:" כוסות",val:form.phUp??0,fn:v=>updateMeasurement("phUp",v),disabled:currentPrimaryPool==="מלח",disabledReason:"נעול בבריכת מלח"},
    {key:"acidLiters",label:"חומצת מלח",min:0,max:5,step:0.5,unit:" L",val:form.acidLiters??0,fn:v=>sf("acidLiters",v),disabled:currentPrimaryPool==="כלור",disabledReason:"נעול בבריכת כלור"},
  ];

  const REPORT_SLIDER_CONFIGS = SLIDER_CONFIGS.map(s => s.key === "salt"
    ? {...s, label:"רמת מלח", min:0, max:6000, step:100, unit:" PPM", optimal:3500, disabledReason:"נעול בבריכת כלור"}
    : s
  );
  const subSliderLabel = (slider) => {
    if (!isSubOperatorEnglish) return slider.label;
    return {
      chlorine:"Chlorine",
      ph:"pH",
      salt:"Salt level",
      chlora:"Chlorine tablets (TAB)",
      hth:"HTH",
      phUp:"pH increaser",
      acidLiters:"Hydrochloric acid"
    }[slider.key] || slider.label;
  };
  const subSliderUnit = (slider) => isSubOperatorEnglish && slider.key === "phUp" ? " cups" : slider.unit;
  const subSliderDisabledReason = (slider) => {
    if (!isSubOperatorEnglish) return slider.disabledReason;
    if (slider.disabledReason === "נעול בבריכת כלור") return "Locked for a chlorine pool";
    if (slider.disabledReason === "נעול בבריכת מלח") return "Locked for a salt pool";
    return slider.disabledReason;
  };

  if (showSetup) return (
    <>
      <IPhoneComfortLayer/>
      <LicenseScreen onDone={()=>{ const c=getCompany(); setCompanyName(c.name||DEFAULT_APP_NAME); setShowSetup(false); }} onSuperAdmin={()=>setShowSuperAdmin(true)}/>
      {showSuperAdmin&&<SuperAdminScreen onClose={()=>setShowSuperAdmin(false)}/>}
    </>
  );

  if(screen==="login") {
    return (
    <div dir="rtl" className={isIOS ? "galileo-ios-vh" : undefined} style={{minHeight:"100vh",background:"linear-gradient(180deg,#e7f0fb 0%,#d7e6f7 45%,#e8eef8 100%)",fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",padding:"calc(24px + env(safe-area-inset-top, 0px)) 24px calc(24px + env(safe-area-inset-bottom, 0px))"}}>
      <IPhoneComfortLayer/>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');*{-webkit-tap-highlight-color:transparent;box-sizing:border-box}input[type=range]{-webkit-appearance:none;height:6px;border-radius:99px;background:transparent}input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:#1565c0;box-shadow:0 2px 8px rgba(21,101,192,0.4)}textarea,input,select{font-family:'Plus Jakarta Sans',sans-serif}`}</style>
      {showSuperAdmin&&<SuperAdminScreen onClose={()=>setShowSuperAdmin(false)}/>}
      <div style={{width:"100%",maxWidth:360}}>
        <div style={{textAlign:"center",marginBottom:36}} onPointerDown={()=>{ logoLongPress.current = setTimeout(()=>{ haptic("success"); setShowSetup(true); }, 3000); }} onPointerUp={()=>clearTimeout(logoLongPress.current)} onPointerLeave={()=>clearTimeout(logoLongPress.current)}>
          {(()=>{ const logoUrl = normalizeBranding(getCompany()).logoUrl; return logoUrl ? (<div style={{width:138,height:138,margin:"0 auto 14px",padding:18,borderRadius:38,background:"linear-gradient(145deg,rgba(244,249,255,0.92),rgba(213,226,244,0.86))",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 26px 64px rgba(30,64,175,0.16), 0 1px 0 rgba(255,255,255,0.82) inset",border:"1px solid rgba(148,163,184,0.28)",overflow:"hidden"}}><img src={logoUrl} alt="logo" style={{width:"100%",height:"100%",objectFit:"contain",display:"block",borderRadius:24,background:"rgba(255,255,255,0.92)",boxShadow:"0 10px 28px rgba(15,23,42,0.08)"}}/></div>) : (<div style={{width:92,height:92,margin:"0 auto 14px",borderRadius:28,background:"rgba(232,241,253,0.82)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:52,boxShadow:"0 24px 60px rgba(37,99,235,0.14), 0 1px 0 rgba(255,255,255,0.8) inset",cursor:"pointer",userSelect:"none"}}>🌊</div>); })()}
          <h1 style={{color:C.text,fontSize:28,fontWeight:900,margin:"0 0 6px",letterSpacing:"-0.5px"}}>{companyName}</h1>
          <p style={{color:C.muted,fontSize:14,margin:0,fontWeight:800}}>מערכת ניהול בריכות</p>
          {clientPlan.plan&&(
            <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:12}}>
              <span style={{background:"rgba(30,64,175,0.14)",border:"1px solid rgba(37,99,235,0.18)",borderRadius:99,padding:"4px 14px",fontSize:12,fontWeight:900,color:C.blue}}>{clientPlan.plan==="PRO"?"💎 PRO":clientPlan.plan==="Basic"?"⚡ Basic":"🔬 ניסיון"}</span>
              <span style={{background:clientPlan.status==="פעיל"?"rgba(21,128,61,0.10)":"rgba(185,28,28,0.10)",borderRadius:99,padding:"4px 14px",fontSize:12,fontWeight:900,color:clientPlan.status==="פעיל"?C.green:C.red}}>{clientPlan.status==="פעיל"?"✅ פעיל":"⛔ "+clientPlan.status}</span>
            </div>
          )}
        </div>
        <div style={{background:"rgba(226,237,250,0.78)",backdropFilter:"blur(22px)",WebkitBackdropFilter:"blur(22px)",borderRadius:28,padding:24,boxShadow:"0 26px 70px rgba(37,99,235,0.12), 0 1px 0 rgba(255,255,255,0.86) inset",border:"1px solid rgba(148,163,184,0.24)"}}>
          <h2 style={{fontSize:20,fontWeight:900,color:C.text,margin:"0 0 20px",textAlign:"center"}}>כניסה למערכת</h2>
          {appUpdate.available&&(
            <div style={{background:"#fff8e1",border:"1px solid #ffe082",borderRadius:18,padding:14,marginBottom:16,boxShadow:"0 10px 26px rgba(245,158,11,0.12)"}}>
              <div style={{fontSize:15,fontWeight:900,color:C.orange,textAlign:"center",marginBottom:6}}>עדכון זמין</div>
              <div style={{fontSize:12,fontWeight:800,color:"#7c5a00",textAlign:"center",lineHeight:1.5,marginBottom:12}}>מומלץ לעדכן, אבל אפשר להיכנס גם בלי עדכון.</div>
              <Press onClick={hardRefreshApp} style={{padding:13,borderRadius:14,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:900,fontSize:14,textAlign:"center",boxShadow:"0 12px 26px rgba(37,99,235,0.22)"}}>עדכן אפליקציה</Press>
            </div>
          )}
          <div style={{marginBottom:12}}><label style={{fontSize:12,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>שם משתמש</label><input value={loginUser} onChange={e=>setLoginUser(e.target.value)} placeholder="הכנס שם משתמש" style={inp} onKeyDown={e=>e.key==="Enter"&&handleLogin()}/></div>
          <div style={{marginBottom:loginErr?12:20}}><label style={{fontSize:12,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>סיסמה</label><input type="password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} placeholder="הכנס סיסמה" style={inp} onKeyDown={e=>e.key==="Enter"&&handleLogin()}/></div>
          {loginErr&&<div style={{background:"#ffebee",borderRadius:10,padding:"10px 14px",marginBottom:16,color:C.red,fontSize:13,fontWeight:700,textAlign:"center"}}>⚠️ {loginErr}</div>}
          <Press onClick={handleLogin} disabled={false} style={{padding:16,borderRadius:18,background:loginLoading?"#90caf9":"linear-gradient(135deg,#2563eb,#7c3aed)",color:"#fff",fontWeight:900,fontSize:16,textAlign:"center",boxShadow:loginLoading?"none":"0 16px 36px rgba(79,70,229,0.24)",opacity:1}}>
            {actionLabel("login",{idle:"כניסה →",loading:"⏳ מתחבר...",success:"✅ התחברת",error:"⚠️ נסה שוב"})}
          </Press>
          {!appUpdate.available&&(
            <Press onClick={hardRefreshApp} style={{marginTop:10,padding:13,borderRadius:18,background:"rgba(255,255,255,0.72)",border:"1px solid rgba(148,163,184,0.30)",color:C.blue,fontWeight:900,fontSize:14,textAlign:"center"}}>
              עדכן אפליקציה
            </Press>
          )}
          <Press onClick={async()=>{ setAction("push","loading"); const res = await connectPushUser(loginUser, true); if(res?.success){ markPushEnabledForLogin(); setAction("push","success"); } else setAction("push","error",2200); showToast(res?.success ? "✅ ההתראות הופעלו" : "⚠️ לא ניתן להפעיל התראות"); }} style={{marginTop:10,padding:13,borderRadius:18,background:"rgba(30,64,175,0.12)",border:"1px solid rgba(37,99,235,0.18)",color:C.blue,fontWeight:900,fontSize:14,textAlign:"center"}}>
            {isPushEnabledForLogin() ? "✅ התראות מופעלות" : actionLabel("push",{idle:"🔔 הפעל התראות",loading:"⏳ מפעיל...",success:"✅ התראות מופעלות",error:"⚠️ נסה שוב"})}
          </Press>
        </div>
        <InstallAppCard/>
        <IOSInstallHint/>
        <p style={{textAlign:"center",fontSize:10.5,color:C.muted,marginTop:16,marginBottom:0,letterSpacing:"0.03em",fontWeight:800,lineHeight:1.55}}>
          © 2026 Poolmang™ by Or Musa. All rights reserved.
          <br/>
          {APP_VERSION}
        </p>
      </div>
      <Toast msg={toast.msg} visible={toast.visible}/>
    </div>
  );
  }

  if(screen==="daily") {
    const isSubOperator = isSubOperatorRole(user?.role);
    const displayedDayName = (date) => isSubOperatorEnglish
      ? new Intl.DateTimeFormat("en-US",{weekday:"long"}).format(new Date(`${date}T12:00:00`))
      : dateDayName(date);
    const currentDailyOwner = dailyOwnerName(dailyDate);
    const canSubOperatorReport = !isSubOperator || (currentDailyOwner && isSubOperatorApproved(dailyDate, currentDailyOwner, user?.username));
    const assignedSubOperators = isSubOperator ? [] : subOperatorUsers.filter(su => normalizeName(linkedOperatorName(su, dailyDate)) === normalizeName(user?.name) || isSameSubOperator(getAssignedSubOperator(dailyDate, user?.name), su));
    const linkedSubOperators = (() => {
      if(isSubOperator) return [];
      const linked = [...assignedSubOperators];
      const seen = new Set(linked.map(su => normalizeName(su.username || su.name)));
      const subValuesByUser = subOperatorUsers.map(su => ({ su, values: subOperatorValues(su) }));
      tasks
        .filter(t => normalizeDate(t.date) === dailyDate && (t.createdByAdminOrder || Number(t.orderIndex || 0) > 0) && (t.operators || []).some(op => normalizeName(op) === normalizeName(user?.name)))
        .forEach(t => {
          const ops = (t.operators || []).map(normalizeName);
          subValuesByUser.forEach(({ su, values }) => {
            if(values.some(v => ops.includes(v))) {
              const key = normalizeName(su.username || su.name);
              if(!seen.has(key)) {
                seen.add(key);
                linked.push(su);
              }
            }
          });
        });
      return linked;
    })();
    const pendingSubReportsForOperator = !isSubOperator
      ? pendingSubReports.filter(item => item?.status === "pending" && normalizeName(item.operator) === normalizeName(user?.name))
      : [];
    const pendingSubReportForOperator = activeSubReportApprovalId
      ? pendingSubReportsForOperator.find(item => item.id === activeSubReportApprovalId)
      : pendingSubReportsForOperator.find(item => !deferredSubReportIds.includes(item.id));
    const orderedDayTasks = getOperatorDailyView(dailyDate);
    const hasSharedOrderForSub = isSubOperator ? getSharedSubOrderEntries(dailyDate, currentDailyOwner, user?.username || user?.name).length > 0 : true;
    const explicitSupplyKey = (entry = {}) => {
      const resolvedId = String(entry.clientId || clientIdByName(entry.client) || "").trim();
      return resolvedId ? poolIdentityKey({client:entry.client,clientId:resolvedId}) : "";
    };
    const storedSupplyKey = (value) => {
      const raw = String(value || "").trim();
      if (raw.startsWith("id:")) return raw;
      if (!raw || raw.startsWith("unresolved:")) return "";
      const resolvedId = clientIdByName(raw);
      return resolvedId ? poolIdentityKey({client:raw,clientId:resolvedId}) : "";
    };
    const explicitSupplyClients = new Set([
      ...getAdminOrderEntries(dailyDate, currentDailyOwner).map(explicitSupplyKey),
      ...getSharedSubOrderEntries(dailyDate, currentDailyOwner, user?.username || user?.name).map(explicitSupplyKey),
      ...readLocalArray(operatorOrderKey(user?.username || user?.name, dailyDate)).map(storedSupplyKey)
    ].filter(Boolean));
    const lockedClients = getLockedClients(dailyDate);
    const isTaskLocked = task => lockedClients.has(dailyTaskClientKey(task)) ||
      (!task.clientId && !!clientIdByName(task.client) && lockedClients.has(task.client));
    const lockedDayTasks = orderedDayTasks.filter(isTaskLocked);
    const activeDayTasks = orderedDayTasks.filter(t=>!isTaskLocked(t));
    const dayTasks = (!isSubOperator && operatorEditOrder) ? operatorOrderDraft : activeDayTasks;
    const todayManualTasks = myTasks(dailyDate);
    const todayVisibleManualTasks = todayManualTasks.filter(t=>t.adminApproval !== "rejected");
    const isDailyTaskDone = (task) => {
      const additionalClientTasks = todayManualTasks
        .filter(ft => samePoolIdentity(ft, task) && !ft.createdByAdminOrder && Number(ft.orderIndex || 0) <= 0 && ft.adminApproval !== "pending" && ft.adminApproval !== "rejected");
      return task.status === "done" || isClientReportedDone(dailyDate, task.client, task.clientId) || additionalClientTasks.some(ft => ft.status === "done");
    };
    const isManualTaskDone = (task) =>
      task.status === "done" || isClientReportedDone(normalizeDate(task.date), task.client, task.clientId);
    const displayDayTasks = operatorEditOrder
      ? dayTasks
      : dayTasks
        .map((task, sourceIndex)=>({task, sourceIndex, done:isDailyTaskDone(task)}))
        .sort((a,b)=>Number(a.done)-Number(b.done) || a.sourceIndex-b.sourceIndex)
        .map(x=>x.task);
    const dailyWhatsAppClients = displayDayTasks.filter(t=>t.client);
    const allDailyWhatsAppDisabled = dailyWhatsAppClients.length > 0 && dailyWhatsAppClients.every(task => isWhatsAppDisabledForClient(task));
    const toggleDailyWhatsAppClients = () => setWhatsAppForClients(dailyWhatsAppClients, !allDailyWhatsAppDisabled);
    const dailySupplyTasks = orderedDayTasks.filter(t =>
      explicitSupplyClients.has(dailyTaskClientKey(t)) &&
      isSupplyDueForDate(t.client, dailyDate, clientSupply(t.client, t.clientId), t.clientId)
    );
    const taskChangesCount = orderedDayTasks.filter(t => {
      const lastLog = t.changeLog?.[t.changeLog.length - 1];
      return !t._adminOrder && lastLog?.needsAck && !(lastLog?.ackedBy || []).includes(user?.name);
    }).length;
    const shareOrderWithSubOperators = async () => {
      if (isSubOperator) return;
      const subs = assignedSubOperators || [];
      if (!subs.length) {
        showToast("אין עוזר מפעיל משויך");
        return;
      }
      const opName = user?.name || "";
      const currentList = operatorEditOrder ? operatorOrderDraft : activeDayTasks;
      const sharedEntries = (currentList || []).map((t, i)=>({
        id:t.id,
        client:t.client,
        clientId:t.clientId||clientIdByName(t.client),
        note:t.adminNote || t.note || "",
        orderIndex:Number(t.orderIndex || i + 1),
        status:t.status === "done" || isClientReportedDone(dailyDate, t.client, t.clientId) ? "done" : "pending",
        changeLog:t.changeLog || [],
        completedAt:t.completedAt || "",
        completedBy:t.completedBy || "",
        reportId:t.reportId || ""
      }));
      const subKeys = new Set(subs.map(su => normalizeName(su.username || su.name)).filter(Boolean));
      const shareRows = subs.flatMap(su => sharedEntries.map((entry, i)=>({
        date: dailyDate,
        operator: opName,
        subUsername: su.username || su.name || "",
        subOperator: su.name || su.username || "",
        client: entry.client,
        clientId: entry.clientId || clientIdByName(entry.client),
        note: entry.note || "",
        id: entry.id || "",
        status: entry.status || "pending",
        changeLog: entry.changeLog || [],
        completedAt: entry.completedAt || "",
        completedBy: entry.completedBy || "",
        reportId: entry.reportId || "",
        revoked: false,
        orderIndex: Number(entry.orderIndex || i + 1),
        sharedAt: nowStr(),
        sharedBy: user?.name || ""
      })));
      const nextShared = [
        ...sharedSubOrders.filter(row => !(
          normalizeDate(row?.date) === dailyDate &&
          normalizeName(row?.operator) === normalizeName(opName) &&
          subKeys.has(normalizeName(row?.subUsername || row?.subOperator))
        )),
        ...shareRows
      ];
      try {
        const res = await sheetCall("saveSubOperatorShares", {sharedSubOrders: shareRows});
        if (!res?.success) throw new Error(res?.error || "saveSubOperatorShares failed");
        setSharedSubOrders(nextShared);
      } catch (e) {
        console.warn("Shared order sync failed", e);
        showToast("שיתוף הסדר נכשל");
        haptic("medium");
        return;
      }
      subs.forEach(su => writeLocalArray(sharedSubOrderKey(dailyDate, opName, su.username || su.name), sharedEntries));
      if (operatorEditOrder) {
        writeLocalArray(operatorOrderKey(user?.username || user?.name, dailyDate), sharedEntries.map(dailyTaskClientKey));
        setOperatorEditOrder(false);
      }
      setSubOperatorRefresh(x=>x+1);
      void sendNotificationToSubOperators(subs, "סדר יום שותף", `${opName} שיתף איתך ${sharedEntries.length} בריכות לתאריך ${fmtDate(dailyDate)}`)
        .catch(e => console.warn("Shared order notification failed", e));
      showToast(`סדר שותף ל-${subs.length} עוזר מפעיל`);
      haptic("success");
    };
    const criticalOperatorNotice = null;
    const done = dayTasks.filter(isDailyTaskDone).length;
    const isDailyOrderComplete = dayTasks.length > 0 && done === dayTasks.length && !operatorEditOrder;
    const completedDayTasks = dayTasks.filter(isDailyTaskDone);
    const operatorProgressEntries = getOperatorProgressEntries(dailyDate, dailyOwnerName(dailyDate) || user?.name || "");
    const operatorProgressDone = operatorProgressEntries.filter(entry => entry.reported).length;
    const doneManualTasks = todayVisibleManualTasks.filter(isManualTaskDone).length;
    const workMonthKey = normalizeDate(dailyDate).slice(0,7);
    const operatorWorkLogs = workLogs.filter(log=>normalizeName(log.operator)===normalizeName(user?.name));
    const monthWorkLogs = operatorWorkLogs.filter(log=>normalizeDate(log.date).slice(0,7)===workMonthKey);
    const monthWorkMinutes = monthWorkLogs.reduce((sum, log)=>sum + totalWorkMinutes(log.start, log.end), 0);
    const editorTotalMinutes = workClockEditor?.end ? totalWorkMinutes(workClockEditor.start, workClockEditor.end) : 0;
    const openWorkClockPicker = (id) => {
      const inputEl = document.getElementById(id);
      inputEl?.focus?.();
      try { inputEl?.showPicker?.(); } catch {}
      if (!inputEl?.showPicker) inputEl?.click?.();
    };
    const dailySupplySummary = dailySupplyTasks.reduce((acc, task) => {
      const supply = clientSupply(task.client, task.clientId);
      if (!supply) return acc;
      if (supply.acid) acc.acid += 1;
      if (supply.phUpSupply) acc.phUpSupply += 1;
      if (supply.saltPkg) acc.saltBags += Number(supply.saltBags || 0);
      return acc;
    }, { acid:0, phUpSupply:0, saltBags:0 });
    const dailySupplyRecipients = dailySupplyTasks.reduce((acc, task) => {
      const supply = clientSupply(task.client, task.clientId);
      if (!supply) return acc;
      const clientName = String(task.client || "").split(" - ")[0];
      const destination = [clientName, clientAddress(task.client, task.clientId)].filter(Boolean).join(" · ");
      if (supply.acid) acc.acid.push(destination);
      if (supply.phUpSupply) acc.phUpSupply.push(destination);
      if (supply.saltPkg && Number(supply.saltBags || 0) > 0) acc.saltBags.push(`${destination} ×${Number(supply.saltBags || 0)}`);
      return acc;
    }, { acid:[], phUpSupply:[], saltBags:[] });
    const hasDailySupply = dailySupplySummary.acid || dailySupplySummary.phUpSupply || dailySupplySummary.saltBags;
    const operatorShellBg = "linear-gradient(180deg,#e7f0fb 0%,#d7e6f7 42%,#e8eef8 100%)";
    const operatorHeroBg = "linear-gradient(135deg,rgba(244,249,255,0.90),rgba(196,219,244,0.82) 48%,rgba(216,225,242,0.88))";
    const operatorPrimaryGradient = "linear-gradient(135deg,#2563eb,#7c3aed)";
    return (
      <div dir={isSubOperatorEnglish?"ltr":"rtl"} lang={isSubOperatorEnglish?"en":"he"} className={isIOS ? "galileo-ios-vh" : undefined} style={{minHeight:"100vh",background:operatorShellBg,fontFamily:"'Plus Jakarta Sans',sans-serif",paddingBottom:"calc(112px + env(safe-area-inset-bottom, 0px))"}}>
        <IPhoneComfortLayer/>
        {isSubOperator&&showSubLanguagePrompt&&(
          <BottomSheet title={isSubOperatorEnglish?"החלפת שפה":"Switch language"} onClose={()=>setShowSubLanguagePrompt(false)}>
            <div dir={isSubOperatorEnglish?"rtl":"ltr"}>
              <div style={{fontSize:17,fontWeight:900,color:C.text,marginBottom:16,textAlign:"center",lineHeight:1.5}}>
                {isSubOperatorEnglish?"האם אתה רוצה לעבור לעברית?":"Do you want to switch to English?"}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <Press onClick={confirmSubOperatorLanguageChange} style={{padding:"13px",borderRadius:14,background:"linear-gradient(135deg,#2563eb,#7c3aed)",color:"#fff",fontSize:14,fontWeight:900,textAlign:"center"}}>
                  {isSubOperatorEnglish?"כן, עבור לעברית":"Yes, switch to English"}
                </Press>
                <Press onClick={()=>setShowSubLanguagePrompt(false)} style={{padding:"13px",borderRadius:14,background:"#f0f4f8",color:C.muted,fontSize:14,fontWeight:900,textAlign:"center",border:`1px solid ${C.border}`}}>
                  {isSubOperatorEnglish?"לא":"No"}
                </Press>
              </div>
            </div>
          </BottomSheet>
        )}
        <WelcomeMediaModal media={welcomeMedia} onClose={()=>setWelcomeMedia(null)}/>
        {showDailyBriefing&&!welcomeMedia&&!isDailyOrderComplete&&<DailyBriefingModal tasks={orderedDayTasks} supplyTasks={dailySupplyTasks} workStart={workStart} supplyDB={supplyDB} supplyForPool={clientSupply} subOperators={!isSubOperator?linkedSubOperators:[]} equipmentChecklist={equipmentChecklist} onStartWork={handleStartWork} onConfirm={()=>setShowDailyBriefing(false)} onClose={()=>setShowDailyBriefing(false)} english={isSubOperatorEnglish}/>}
        {showClockReminder&&!welcomeMedia&&!showDailyBriefing&&<WorkClockReminderModal workStart={workStart} onClose={()=>setShowClockReminder(false)} onStop={()=>{setShowClockReminder(false);handleEndWork();}} english={isSubOperatorEnglish}/>}
        {workClockEditor&&(
          <div style={{position:"fixed",inset:0,zIndex:1500,background:"rgba(15,23,42,0.48)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(10px)"}}>
            <div style={{width:"100%",maxWidth:430,maxHeight:"88vh",overflowY:"auto",background:"rgba(255,255,255,0.92)",borderRadius:26,padding:16,boxShadow:"0 28px 90px rgba(15,23,42,0.28)",border:"1px solid rgba(148,163,184,0.24)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:12}}>
                <div>
                  <div style={{fontSize:18,fontWeight:900,color:C.text}}>{subText("ניהול שעות עבודה","Work hours")}</div>
                  <div style={{fontSize:12,fontWeight:800,color:C.muted,marginTop:2}}>{subText("אפשר להזין גם תאריכים קודמים","Previous dates can also be entered")}</div>
                </div>
                <Press onClick={()=>setWorkClockEditor(null)} style={{width:34,height:34,borderRadius:12,background:"#f0f4f8",color:C.muted,fontWeight:900,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</Press>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                <Press onClick={()=>openWorkClockPicker("work-clock-date")} style={{gridColumn:"1 / -1",cursor:"pointer"}}>
                  <label style={{fontSize:11,fontWeight:800,color:C.muted,display:"block",marginBottom:6}}>{subText("תאריך עבודה","Work date")}</label>
                  <input id="work-clock-date" type="date" value={workClockEditor.date} onChange={e=>setWorkClockEditor(x=>({...x,date:e.target.value}))} style={{...inp,cursor:"pointer",pointerEvents:"none"}}/>
                </Press>
                <Press onClick={()=>openWorkClockPicker("work-clock-start")} style={{cursor:"pointer"}}>
                  <label style={{fontSize:11,fontWeight:800,color:C.muted,display:"block",marginBottom:6}}>{subText("שעת כניסה","Start time")}</label>
                  <input id="work-clock-start" type="time" value={workClockEditor.start} onChange={e=>setWorkClockEditor(x=>({...x,start:e.target.value}))} style={{...inp,fontSize:20,fontWeight:900,color:C.blue,textAlign:"center",cursor:"pointer",pointerEvents:"none"}}/>
                </Press>
                <Press onClick={()=>openWorkClockPicker("work-clock-end")} style={{cursor:"pointer"}}>
                  <label style={{fontSize:11,fontWeight:800,color:C.muted,display:"block",marginBottom:6}}>{subText("שעת יציאה","End time")}</label>
                  <input id="work-clock-end" type="time" value={workClockEditor.end} onChange={e=>setWorkClockEditor(x=>({...x,end:e.target.value}))} style={{...inp,fontSize:20,fontWeight:900,color:C.blue,textAlign:"center",cursor:"pointer",pointerEvents:"none"}}/>
                </Press>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                <div style={{background:"#e3f2fd",borderRadius:14,padding:"12px 10px",textAlign:"center"}}>
                  <div style={{fontSize:22,fontWeight:900,color:C.blue}}>{workClockEditor.end ? minutesToHM(editorTotalMinutes) : "--:--"}</div>
                  <div style={{fontSize:11,fontWeight:900,color:C.muted}}>{subText("סך הכל משמרת","Shift total")}</div>
                </div>
                <div style={{background:"#e8f5e9",borderRadius:14,padding:"12px 10px",textAlign:"center"}}>
                  <div style={{fontSize:22,fontWeight:900,color:C.green}}>{minutesToHM(monthWorkMinutes)}</div>
                  <div style={{fontSize:11,fontWeight:900,color:C.muted}}>{subText("סיכום החודש","Monthly total")}</div>
                </div>
              </div>
              <Press onClick={saveWorkClockEditor} style={{padding:"14px",borderRadius:16,background:"linear-gradient(135deg,#2563eb,#7c3aed)",color:"#fff",fontSize:15,fontWeight:900,textAlign:"center",boxShadow:"0 14px 32px rgba(79,70,229,0.24)",marginBottom:12}}>{subText("שמור שעות","Save hours")}</Press>
              <div style={{border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden"}}>
                <div style={{padding:"10px 12px",background:"#f5f9ff",fontSize:12,fontWeight:900,color:C.text}}>{subText("רישומי שעות","Work logs")}</div>
                {operatorWorkLogs.length===0&&<div style={{padding:14,textAlign:"center",fontSize:12,fontWeight:800,color:C.muted}}>{subText("אין רישומי שעות עדיין","No work logs yet")}</div>}
                {operatorWorkLogs.slice(0,8).map((log,i)=>(
                  <div key={log.id || `${log.date}-${log.start}-${i}`} style={{display:"flex",justifyContent:"space-between",gap:10,padding:"10px 12px",borderTop:`1px solid ${C.border}`,background:i%2?"#fff":"#fbfdff"}}>
                    <div><div style={{fontSize:13,fontWeight:900,color:C.text}}>{fmtDate(log.date)}</div><div style={{fontSize:11,fontWeight:800,color:C.muted}}>{log.start} - {log.end}</div></div>
                    <Badge label={`⏱️ ${log.total}`} col={C.blue}/>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {pendingSubReportForOperator&&(()=>{ const item=pendingSubReportForOperator; const r=item.report||{}; const approvalClient=findClientByName(r.client,r.clientId); const approvalMeasurements=[
          ["תאריך",fmtDate(r.reportDate),C.text],
          ["זרימה",r.flow || "-",r.flow==="לא תקין"?C.red:C.text],
          ["כלור",hasMeasurementValue(r.chlorine)?r.chlorine:"-",C.text],
          !r.waterCheckOnly&&hasMeasurementValue(r.ph)&&["pH",r.ph,C.text],
          !r.waterCheckOnly&&primaryPoolType(approvalClient?.poolType)!=="כלור"&&hasMeasurementValue(r.salt)&&["מלח",r.salt,C.text],
          r.waterCheckOnly&&Number(r.chlora)>0&&["טבליות כלור",r.chlora,C.text],
          r.waterCheckOnly&&Number(r.hth)>0&&["HTH",r.hth,C.text],
          !r.waterCheckOnly&&["מצב",r.poolStatus || "-",C.text]
        ].filter(Boolean); return (
          <div style={{position:"fixed",inset:0,zIndex:1500,background:"rgba(15,23,42,0.62)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <div style={{width:"100%",maxWidth:420,background:"rgba(255,255,255,0.96)",borderRadius:24,padding:18,boxShadow:"0 28px 90px rgba(15,23,42,0.34)",border:"1px solid rgba(148,163,184,0.32)"}}>
              <div style={{fontSize:18,fontWeight:900,color:C.text,marginBottom:4}}>דוח ממתין לאישור</div>
              <div style={{fontSize:12,fontWeight:800,color:C.muted,marginBottom:12}}>נשלח על ידי {item.subName || item.subUsername || "עוזר מפעיל"}</div>
              <div style={{background:"#f5f9ff",border:`1px solid ${C.border}`,borderRadius:16,padding:12,display:"grid",gap:8,marginBottom:12}}>
                <div style={{fontSize:15,fontWeight:900,color:C.text}}>{String(r.client||"").split(" - ")[0]}</div>
                <div style={{fontSize:11,fontWeight:800,color:C.muted}}>{[approvalClient?.address,formatPoolType(approvalClient?.poolType)].filter(Boolean).join(" · ")}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {approvalMeasurements.map(([label,value,color])=><div key={label} style={{fontSize:12,fontWeight:800,color:C.muted}}>{label}<br/><b style={{color}}>{value}</b></div>)}
                </div>
                {(r.customStatusText||r.notes)&&<div style={{fontSize:12,fontWeight:800,color:C.text,lineHeight:1.5,background:"#fff",borderRadius:12,padding:"8px 10px"}}>{r.customStatusText || r.notes}</div>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <Press onClick={()=>editPendingSubReport(item)} style={{padding:"13px",borderRadius:14,background:"#fff8e1",color:C.orange,fontSize:13,fontWeight:900,textAlign:"center",border:"1px solid #ffe082"}}>ערוך לפני שליחה</Press>
                <Press onClick={()=>approvePendingSubReport(item)} style={{padding:"13px",borderRadius:14,background:"linear-gradient(135deg,#2563eb,#7c3aed)",color:"#fff",fontSize:13,fontWeight:900,textAlign:"center",boxShadow:"0 12px 28px rgba(79,70,229,0.25)"}}>{actionLabel(`approveSubReport:${item.id}`,{idle:"אשר ושלח",loading:"שולח...",success:"נשלח",local:"נשמר"})}</Press>
              </div>
              <Press onClick={()=>deferPendingSubReport(item)} style={{marginTop:10,padding:"12px",borderRadius:14,background:"#f0f4f8",color:C.muted,fontSize:13,fontWeight:900,textAlign:"center",border:`1px solid ${C.border}`}}>קריאה ואישור מאוחר יותר</Press>
            </div>
          </div>
        );})()}
        {internalNoteEdit&&(
          <BottomSheet title="הערה פנימית" onClose={()=>setInternalNoteEdit(null)}>
            <div style={{fontSize:13,fontWeight:900,color:C.text,marginBottom:10}}>{internalNoteEdit.client?.split(" - ")[0]}</div>
            <textarea value={internalNoteEdit.note} onChange={e=>setInternalNoteEdit(x=>({...x,note:e.target.value}))} rows={4} placeholder="הערה פנימית למפעילים בלבד..." style={{...inp,resize:"none",minHeight:110,marginBottom:12}}/>
            <div style={{background:"#e3f2fd",borderRadius:10,padding:"8px 12px",marginBottom:12,display:"flex",gap:6,alignItems:"center"}}>
              <span>🔒</span>
              <span style={{fontSize:11,fontWeight:800,color:C.blue}}>פנימי בלבד — לא יוצר דוח ולא נשלח ללקוח</span>
            </div>
            <Press onClick={saveInternalNoteForClient} style={{padding:"14px",borderRadius:14,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:900,fontSize:15,textAlign:"center",boxShadow:"0 4px 14px rgba(21,101,192,0.3)"}}>שמור הערה</Press>
          </BottomSheet>
        )}
        {criticalOperatorNotice&&(()=>{
          const [id, operator, clientName, desc, priority, status, response, date] = criticalOperatorNotice;
          return (
            <div style={{position:"fixed",inset:0,zIndex:1450,background:"rgba(0,0,0,0.62)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
              <div style={{width:"100%",maxWidth:390,background:"#fff",borderRadius:20,padding:18,boxShadow:"0 24px 80px rgba(0,0,0,0.35)",border:`3px solid ${C.red}`}}>
                <div style={{fontSize:22,fontWeight:900,color:C.red,marginBottom:6}}>🚨 תקלה קריטית אושרה</div>
                <div style={{fontSize:13,fontWeight:800,color:C.text,marginBottom:10}}>{clientName?.split(" - ")[0]} · {fmtDate(date)}</div>
                <div style={{background:"#ffebee",borderRadius:12,padding:"10px 12px",fontSize:13,color:C.red,fontWeight:800,lineHeight:1.5,marginBottom:10}}>{desc}</div>
                {response&&<div style={{background:"#f5f9ff",borderRadius:12,padding:"10px 12px",fontSize:12,color:C.muted,fontWeight:800,lineHeight:1.5,marginBottom:12}}>תגובת אדמין: {response}</div>}
                <Press onClick={()=>dismissCriticalIssue(id)} style={{padding:"13px",borderRadius:14,background:C.red,color:"#fff",fontWeight:900,fontSize:14,textAlign:"center"}}>הבנתי</Press>
              </div>
            </div>
          );
        })()}
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');*{-webkit-tap-highlight-color:transparent;box-sizing:border-box;user-select:none;-webkit-user-select:none}input,textarea,select{user-select:text;-webkit-user-select:text}input[type=range]{-webkit-appearance:none;height:6px;border-radius:99px;background:transparent}input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:${C.blue};box-shadow:0 2px 8px rgba(21,101,192,0.4)}textarea,input,select{font-family:'Plus Jakarta Sans',sans-serif}`}</style>
        <div style={{margin:"12px 14px 0",background:operatorHeroBg,border:"1px solid rgba(148,163,184,0.22)",borderRadius:28,padding:"22px 18px 24px",position:"relative",overflow:"hidden",boxShadow:"0 26px 70px rgba(37,99,235,0.12), 0 1px 0 rgba(255,255,255,0.82) inset",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)"}}>
          <div style={{position:"relative",display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
            <div>
              <p style={{color:C.muted,fontSize:12,fontWeight:800,margin:"0 0 4px",letterSpacing:"0.04em"}}>{fmtDate(dailyDate)} 🌊</p>
              <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <h1 style={{color:C.text,fontSize:28,fontWeight:900,margin:0,lineHeight:1.08}}>{subText("שלום","Hello")}, {user?.name || user?.username || subText("מפעיל","Operator")}! {user?.icon}</h1>
                <SuperMessageInbox user={user} C={C} showToast={showToast} showHomeCue={navTab===0} inline/>
              </div>
              <p style={{color:C.muted,fontSize:13,margin:"5px 0 0",fontWeight:700}}>{isSubOperatorEnglish?"Ready for today's route":greeting || user?.welcomeMessage}</p>
              {clientPlan.plan&&(
                <div style={{display:"flex",gap:6,marginTop:8}}>
                  <span style={{background:"rgba(30,64,175,0.14)",border:"1px solid rgba(37,99,235,0.18)",borderRadius:99,padding:"4px 11px",fontSize:11,fontWeight:900,color:C.blue}}>{clientPlan.plan==="PRO"?"💎 PRO":clientPlan.plan==="Basic"?"⚡ Basic":subText("🔬 ניסיון","🔬 Trial")}</span>
                  <span style={{background:clientPlan.status==="פעיל"?"rgba(21,128,61,0.10)":"rgba(185,28,28,0.10)",borderRadius:99,padding:"4px 11px",fontSize:11,fontWeight:900,color:clientPlan.status==="פעיל"?C.green:C.red}}>{clientPlan.status==="פעיל"?subText("✅ פעיל","✅ Active"):"⛔ "+subPlanStatus(clientPlan.status)}</span>
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              {isSubOperator&&<Press onClick={()=>{setShowSubLanguagePrompt(true);haptic();}} title={subText("שפה נוכחית: עברית","Current language: English")} style={{width:42,height:42,borderRadius:16,background:"rgba(226,237,250,0.72)",backdropFilter:"blur(14px)",border:"1px solid rgba(148,163,184,0.22)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:21,boxShadow:"0 10px 26px rgba(30,64,175,0.12)"}}>
                {isSubOperatorEnglish?"🇬🇧":"🇮🇱"}
              </Press>}
              <RefreshTopButton compact/>
              {isAdminPanelRole(user?.role)&&<Press onClick={()=>{setScreen("admin");setAdminTab("dashboard");window.scrollTo(0,0);haptic("medium");}} style={{background:adminPrimaryGradient,border:"1px solid rgba(255,255,255,0.38)",borderRadius:16,padding:"9px 12px",color:"#fff",fontSize:12,fontWeight:900,whiteSpace:"nowrap",boxShadow:"0 14px 32px rgba(79,70,229,0.24)"}}>מחוונים</Press>}
              {!isAdminPanelRole(user?.role)&&<Press onClick={handleLogout} style={{background:"rgba(226,237,250,0.72)",backdropFilter:"blur(14px)",border:"1px solid rgba(148,163,184,0.22)",borderRadius:16,padding:"9px 12px",color:C.muted,fontSize:12,fontWeight:900}}>{subText("יציאה","Log out")}</Press>}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1.35fr 1fr 1fr",gap:10,position:"relative"}}>
            <Press onClick={()=>{setOpenCompletedPools(v=>!v);haptic();}} style={{background:"rgba(226,237,250,0.72)",backdropFilter:"blur(14px)",borderRadius:18,padding:"12px 10px",textAlign:"center",border:`1px solid ${openCompletedPools?"rgba(21,101,192,0.62)":"rgba(148,163,184,0.20)"}`,boxShadow:"0 12px 28px rgba(30,64,175,0.12)",cursor:"pointer"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,alignItems:"center"}}>
                <div>
                  <div style={{fontSize:16,marginBottom:2}}>📋</div>
                  <div style={{color:C.text,fontSize:20,fontWeight:900,lineHeight:1}}>{done}/{dayTasks.length}</div>
                  <div style={{color:C.muted,fontSize:10,fontWeight:800,marginTop:3}}>{subText("בריכות","Pools")}</div>
                </div>
                <div>
                  <div style={{fontSize:16,marginBottom:2}}>✅</div>
                  <div style={{color:C.text,fontSize:20,fontWeight:900,lineHeight:1}}>{dayTasks.length>0?Math.round((done/dayTasks.length)*100):0}%</div>
                  <div style={{color:C.muted,fontSize:10,fontWeight:800,marginTop:3}}>{subText("הושלם","Complete")}</div>
                </div>
              </div>
            </Press>
            <Press onClick={()=>{setOpenTodayTasks(v=>!v);haptic();}} style={{background:"rgba(226,237,250,0.72)",backdropFilter:"blur(14px)",borderRadius:18,padding:"12px 8px",textAlign:"center",border:`1px solid ${openTodayTasks?"rgba(21,101,192,0.62)":"rgba(148,163,184,0.20)"}`,boxShadow:"0 12px 28px rgba(30,64,175,0.12)",cursor:"pointer"}}>
              <div style={{fontSize:16,marginBottom:2}}>📌</div>
              <div style={{color:C.text,fontSize:20,fontWeight:900,lineHeight:1}}>{doneManualTasks}/{todayVisibleManualTasks.length}</div>
              <div style={{color:C.muted,fontSize:10,fontWeight:800,marginTop:3}}>{subText("משימות","Tasks")}</div>
            </Press>
            <Press onClick={()=>openWorkClockEditor(workStart?"end":"start")} style={{background:"rgba(226,237,250,0.72)",backdropFilter:"blur(14px)",borderRadius:18,padding:"12px 8px",textAlign:"center",border:"1px solid rgba(148,163,184,0.20)",boxShadow:"0 12px 28px rgba(30,64,175,0.12)",cursor:"pointer"}}>
              <div style={{fontSize:16,marginBottom:2}}>⏱️</div>
              <div style={{color:C.text,fontSize:20,fontWeight:900,lineHeight:1}}>{workStart?workStart:"--:--"}</div>
              <div style={{color:C.muted,fontSize:10,fontWeight:800,marginTop:3}}>{subText("התחלה","Start")}</div>
            </Press>
          </div>
          {openTodayTasks&&(
            <div style={{marginTop:10,background:"rgba(244,249,255,0.82)",border:`1px solid ${C.border}`,borderRadius:16,padding:"10px 12px",boxShadow:"0 12px 28px rgba(30,64,175,0.10)"}}>
              <div style={{fontSize:12,fontWeight:900,color:C.text,marginBottom:8}}>{subText("משימות היום","Today's tasks")}</div>
              {todayVisibleManualTasks.length ? todayVisibleManualTasks.map((t,i)=>{
                const note = additionalTaskLogNote(t);
                const effectiveTask = isManualTaskDone(t) ? {...t,status:"done"} : t;
                return (
                  <div key={`${t.id || t.client}-task-${i}`} style={{padding:"8px 0",borderBottom:i<todayVisibleManualTasks.length-1?`1px solid ${C.border}`:"none",display:"grid",gap:6}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                      <span style={{fontSize:13,fontWeight:900,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{String(t.client || "").split(" - ")[0]}</span>
                      <Badge label={taskStatusLabel(effectiveTask)} col={taskStatusColor(effectiveTask)}/>
                    </div>
                    {note&&<div style={{fontSize:11,fontWeight:800,color:C.blue,background:"#e3f2fd",borderRadius:9,padding:"6px 8px",lineHeight:1.4}}>{subText("הערת משימה:","Task note:")} {note}</div>}
                  </div>
                );
              }) : <div style={{fontSize:12,fontWeight:800,color:C.muted,textAlign:"center",padding:"4px 0"}}>{subText("אין משימות להיום","No tasks for today")}</div>}
            </div>
          )}
          {openCompletedPools&&(
            <div style={{marginTop:10,background:"rgba(244,249,255,0.82)",border:`1px solid ${C.border}`,borderRadius:16,padding:"10px 12px",boxShadow:"0 12px 28px rgba(30,64,175,0.10)"}}>
              <div style={{fontSize:12,fontWeight:900,color:C.text,marginBottom:8}}>{subText("בריכות שהושלמו","Completed pools")}</div>
              {completedDayTasks.length ? completedDayTasks.map((t,i)=>{
                const lr = lastReadingForClient(t.client, t.clientId) || {};
                const note = String(lr.customStatusText || "").trim();
                const noteDate = normalizeDate(lr.internalNoteDate || lr.customStatusDate || lr.date);
                return (
                  <Press key={`${t.id || t.client}-done-${i}`} onClick={()=>openDoneReportEditor(t)} style={{padding:"8px 0",borderBottom:i<completedDayTasks.length-1?`1px solid ${C.border}`:"none",display:"grid",gap:5}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                      <span style={{fontSize:13,fontWeight:900,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{String(t.client || "").split(" - ")[0]}</span>
                      <span style={{fontSize:11,fontWeight:900,color:C.green,background:"#e8f5e9",borderRadius:99,padding:"3px 9px",flexShrink:0}}>{subText("בוצע","Done")}</span>
                    </div>
                    {(lr.chlorine!==undefined || lr.ph!==undefined || lr.salt!==undefined)&&(
                      <div style={{display:"flex",gap:8,flexWrap:"wrap",fontSize:11,fontWeight:800,color:C.muted}}>
                        {lr.chlorine!==undefined&&<span>{subText("כלור:","Chlorine:")} {lr.chlorine}</span>}
                        {lr.ph!==undefined&&<span>pH: {lr.ph}</span>}
                        {lr.chlora!==undefined&&<span>TAB: {lr.chlora}</span>}
                        {lr.date&&<span>{fmtDate(String(lr.date).slice(0,10))}</span>}
                      </div>
                    )}
                    {note&&<div style={{fontSize:11,fontWeight:800,color:C.blue,background:"#e3f2fd",borderRadius:9,padding:"6px 8px",lineHeight:1.4}}>{subText("הערה פנימית","Internal note")}{noteDate ? ` (${fmtDate(noteDate)})` : ""}: {note}</div>}
                  </Press>
                );
              }) : <div style={{fontSize:12,fontWeight:800,color:C.muted,textAlign:"center",padding:"4px 0"}}>{subText("אין בריכות שהושלמו עדיין","No completed pools yet")}</div>}
            </div>
          )}
        </div>
        <div style={{margin:"14px 16px 0",position:"relative",zIndex:10}}>
          <InstallAppCard compact/>
          <IOSInstallHint compact/>
          <div style={{...card({marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}),padding:"14px 18px"}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4}}>{subText("שעון עבודה","Work clock")}</div>
              <div style={{fontSize:16,fontWeight:800,color:workStart?C.blue:C.muted}}>{workStart?subText(`▶ פעיל מ-${workStart}`,`▶ Active since ${workStart}`):subText("לא התחיל","Not started")}</div>
            </div>
            <Press onClick={workStart?handleEndWork:handleStartWork} style={{padding:"11px 18px",borderRadius:16,border:"none",color:"#fff",fontWeight:900,fontSize:13,background:workStart?`linear-gradient(135deg,#b91c1c,#ef4444)`:operatorPrimaryGradient,boxShadow:`0 14px 32px ${workStart?"rgba(185,28,28,0.22)":"rgba(79,70,229,0.24)"}`}}>
              {workStart?subText("⏹ סיום","⏹ Stop"):subText("▶ התחלה","▶ Start")}
            </Press>
          </div>
          {!isSubOperator&&linkedSubOperators.length>0&&<div style={{...card({marginBottom:12})}}>
            <div style={{fontSize:12,fontWeight:900,color:C.text,marginBottom:8}}>אישור עוזר מפעיל לדוחות</div>
            {linkedSubOperators.map((su,i)=>{ const approved=isSubOperatorApproved(dailyDate,user?.name,su.username); return <div key={`${su.username || ""}-${su.name || ""}-${i}`} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderTop:`1px solid ${C.border}`}}>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:900,color:C.text}}>{su.name||su.username}</div><div style={{fontSize:11,fontWeight:800,color:approved?C.green:C.muted}}>{approved?"מאושר למילוי דוחות":"צפייה בלבד"}</div></div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
                <Press onClick={()=>approveSubOperator(dailyDate,user?.name,su.username)} style={{padding:"7px 11px",borderRadius:12,background:approved?"#e8f5e9":"linear-gradient(135deg,#2563eb,#7c3aed)",color:approved?C.green:"#fff",fontSize:12,fontWeight:900}}>{approved?"מאושר":"אשר עריכה"}</Press>
                {approved&&<Press onClick={()=>revokeSubOperatorApproval(dailyDate,user?.name,su.username)} style={{padding:"7px 11px",borderRadius:12,background:"#ffebee",color:C.red,fontSize:12,fontWeight:900,border:"1px solid rgba(185,28,28,0.18)"}}>בטל הרשאה</Press>}
              </div>
            </div>;})}
          </div>}
          {!isSubOperator&&pendingSubReportsForOperator.length>0&&<div style={{...card({marginBottom:12,border:"2px solid rgba(194,65,12,0.18)",background:"#fffaf3"})}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:8}}>
              <div>
                <div style={{fontSize:13,fontWeight:900,color:C.text}}>דוחות עוזר מפעיל</div>
                <div style={{fontSize:11,fontWeight:800,color:C.orange,marginTop:2}}>נדרש אישור מפעיל · {pendingSubReportsForOperator.length} ממתינים</div>
              </div>
              <Badge label={`${pendingSubReportsForOperator.length}`} col={C.orange}/>
            </div>
            {pendingSubReportsForOperator.map((item,i)=>{ const r=item.report||{}; const deferred=deferredSubReportIds.includes(item.id); return (
              <div key={item.id || i} style={{display:"grid",gridTemplateColumns:"1fr auto",gap:10,alignItems:"center",padding:"10px 0",borderTop:i?`1px solid ${C.border}`:"none"}}>
                <Press onClick={()=>openPendingSubReportApproval(item)} style={{minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:900,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{String(r.client||"").split(" - ")[0] || "דוח ללא לקוח"}</div>
                  <div style={{fontSize:11,fontWeight:800,color:C.muted,marginTop:3}}>
                    {item.subName || item.subUsername || "עוזר מפעיל"} · {fmtDate(r.reportDate)} · כלור {r.chlorine ?? "-"} · pH {r.ph ?? "-"}
                  </div>
                  {deferred&&<div style={{display:"inline-block",marginTop:5,padding:"3px 8px",borderRadius:99,background:"#fff8e1",color:C.orange,fontSize:10,fontWeight:900}}>לאישור מאוחר יותר</div>}
                </Press>
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
                  <Press onClick={()=>openPendingSubReportApproval(item)} style={{padding:"7px 10px",borderRadius:10,background:"#f0f4f8",color:C.blue,fontSize:11,fontWeight:900,border:`1px solid ${C.border}`}}>קרא</Press>
                  <Press onClick={()=>approvePendingSubReport(item)} style={{padding:"7px 10px",borderRadius:10,background:actionStatus[`approveSubReport:${item.id}`]==="success"?C.green:operatorPrimaryGradient,color:"#fff",fontSize:11,fontWeight:900}}>אשר</Press>
                </div>
              </div>
            );})}
          </div>}
          {dayTasks.length>0&&<div style={{...card(),padding:"14px 18px",marginBottom:4}}><PBar done={done} total={dayTasks.length} label={subText("בריכות","pools")}/></div>}
          <div style={{...card({marginBottom:4})}}>
            <div style={{fontSize:12,fontWeight:900,color:C.text,marginBottom:8}}>{subText("חומרים לסיפוק היום","Materials to supply today")}</div>
            {hasDailySupply ? (
              <>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                  <Press onClick={()=>setOpenDailySupplyType(openDailySupplyType==="acid"?null:"acid")} style={{background:"#ffebee",borderRadius:12,padding:"9px 6px",textAlign:"center"}}><div style={{fontSize:18,fontWeight:900,color:C.red}}>{dailySupplySummary.acid}</div><div style={{fontSize:10,fontWeight:800,color:C.muted}}>{subText("חומצה","Acid")}</div></Press>
                  <Press onClick={()=>setOpenDailySupplyType(openDailySupplyType==="phUpSupply"?null:"phUpSupply")} style={{background:"#f3e5f5",borderRadius:12,padding:"9px 6px",textAlign:"center"}}><div style={{fontSize:18,fontWeight:900,color:"#6a1b9a"}}>{dailySupplySummary.phUpSupply}</div><div style={{fontSize:10,fontWeight:800,color:C.muted}}>{subText("מעלה pH","pH increaser")}</div></Press>
                  <Press onClick={()=>setOpenDailySupplyType(openDailySupplyType==="saltBags"?null:"saltBags")} style={{background:"#e8f5e9",borderRadius:12,padding:"9px 6px",textAlign:"center"}}><div style={{fontSize:18,fontWeight:900,color:C.green}}>{dailySupplySummary.saltBags}</div><div style={{fontSize:10,fontWeight:800,color:C.muted}}>{subText("שקי מלח","Salt bags")}</div></Press>
                </div>
                {openDailySupplyType&&(
                  <div style={{marginTop:8,background:"#f5f9ff",border:`1px solid ${C.border}`,borderRadius:12,padding:"9px 10px"}}>
                    <div style={{fontSize:11,fontWeight:900,color:C.muted,marginBottom:6}}>{subText("מיועד ל:","For:")}</div>
                    {(dailySupplyRecipients[openDailySupplyType] || []).length ? (dailySupplyRecipients[openDailySupplyType] || []).map((name,i)=><div key={`${openDailySupplyType}-${i}`} style={{fontSize:12,fontWeight:800,color:C.text,padding:"3px 0"}}>{name}</div>) : <div style={{fontSize:12,fontWeight:800,color:C.muted}}>{subText("אין נמענים לחומר הזה","No recipients for this material")}</div>}
                  </div>
                )}
              </>
            ) : (
              <div style={{fontSize:12,fontWeight:800,color:C.muted,textAlign:"center",padding:"4px 0"}}>{subText("אין חומרים מסומנים לסיפוק","No materials marked for supply")}</div>
            )}
          </div>
        </div>
        <div style={{padding:"16px 16px 0"}}>
          {pendingOperatorIssues.length>0&&(
            <div style={{...card({background:"#fff8e1",border:"1px solid #ffe082",marginBottom:12,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}),padding:"12px 16px"}}>
              <span style={{fontSize:18}}>🔧</span>
              <div style={{flex:1,minWidth:150}}>
                <div style={{fontWeight:900,fontSize:13,color:C.orange}}>{pendingOperatorIssues.length} {subText("תקלות שממתינות לאדמין","issues waiting for the admin")}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>{subText("שמורות בטלפון עד לקבלת אישור שליחה","Saved on this device until delivery is confirmed")}</div>
              </div>
              <button type="button" disabled={isActionLoading("syncPendingIssues")} onClick={retryAllPendingOperatorIssues} style={{minHeight:44,background:actionStatus.syncPendingIssues==="success"?C.green:actionStatus.syncPendingIssues==="error"?"#fff7ed":C.orange,border:`1px solid ${actionStatus.syncPendingIssues==="error"?"#fed7aa":"transparent"}`,borderRadius:10,padding:"7px 11px",color:actionStatus.syncPendingIssues==="error"?C.orange:"#fff",fontFamily:"inherit",fontWeight:900,fontSize:12,opacity:isActionLoading("syncPendingIssues")?0.7:1,cursor:isActionLoading("syncPendingIssues")?"wait":"pointer"}}>
                {actionLabel("syncPendingIssues",{idle:subText("נסה לשלוח הכל","Retry all"),loading:subText("שולח...","Sending..."),success:subText("נשלח","Sent"),error:subText("נסה שוב","Retry")})}
              </button>
              <button type="button" aria-expanded={showPendingIssueDetails} aria-label={showPendingIssueDetails?"הסתר פרטי תקלות":"הצג פרטי תקלות"} onClick={()=>setShowPendingIssueDetails(v=>!v)} style={{width:44,height:44,display:"grid",placeItems:"center",border:0,background:"transparent",color:C.muted,fontFamily:"inherit",fontSize:18,fontWeight:900,cursor:"pointer"}}>
                <span aria-hidden="true" style={{transform:showPendingIssueDetails?"rotate(180deg)":"none",transition:"transform .18s"}}>⌄</span>
              </button>
              {showPendingIssueDetails&&<div style={{flexBasis:"100%",background:"rgba(255,255,255,0.76)",borderRadius:12,padding:"4px 10px",border:"1px solid rgba(245,158,11,0.22)"}}>
                {renderPendingOperatorIssueRows()}
              </div>}
            </div>
          )}
          {pending.length>0&&!dismissed&&(
            <div onClick={()=>setShowPendingReportNames(v=>!v)} style={{...card({background:"#fff8e1",border:"1px solid #ffe082",marginBottom:12,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}),padding:"12px 16px",cursor:"pointer"}}>
              <span style={{fontSize:18}}>⚠️</span>
              <div style={{flex:1}}><div style={{fontWeight:800,fontSize:13,color:C.orange}}>{pending.length} {subText("דוחות בתור","queued reports")}</div><div style={{fontSize:11,color:C.muted}}>{pendingReportSummaryText()} · {pendingBackgroundSync ? subText("סנכרון ברקע פעיל","Background sync active") : subText("שמורים מקומית — אפשר לנסות ידנית","Saved locally — manual retry is available")}</div></div>
              <Press onClick={togglePendingBackgroundSync} style={{background:pendingBackgroundSync?C.green:"#fff7ed",border:`1px solid ${pendingBackgroundSync?"#86efac":"#fed7aa"}`,borderRadius:99,padding:"6px 12px",color:pendingBackgroundSync?"#fff":C.orange,fontWeight:900,fontSize:12}}>{pendingBackgroundSync?subText("עצור רקע","Stop sync"):subText("הפעל רקע","Start sync")}</Press>
              <Press onClick={(e)=>{e.stopPropagation();syncPendingReports();}} style={{background:C.orange,borderRadius:99,padding:"6px 12px",color:"#fff",fontWeight:800,fontSize:12}}>{actionLabel("syncPending",{idle:subText("שלח","Send"),loading:subText("⏳ שולח...","⏳ Sending..."),success:subText("✅ נשלח","✅ Sent"),error:subText("⚠️ נסה שוב","⚠️ Retry")})}</Press>
              <Press onClick={(e)=>{e.stopPropagation();setDismissed(true);}} style={{color:C.muted,fontSize:18,padding:"0 4px"}}>✕</Press>
              {showPendingReportNames&&<div style={{flexBasis:"100%",background:"rgba(255,255,255,0.72)",borderRadius:12,padding:"8px 10px",border:"1px solid rgba(245,158,11,0.22)"}}>
                {renderPendingReportRows()}
              </div>}
            </div>
          )}
          <div style={{...card({marginBottom:12})}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
              <div>
                <div style={{fontSize:13,fontWeight:900,color:C.text}}>{subText("צ׳ק ליסט ציוד אישי","Personal equipment checklist")}</div>
                <div style={{fontSize:11,fontWeight:800,color:C.muted,marginTop:2}}>{normalizeEquipmentChecklist(equipmentChecklist).reduce((n,g)=>n+g.items.length,0)} {subText("פריטים שיופיעו בפתיחת יום","items shown at the start of the day")}</div>
              </div>
              <Press onClick={()=>setShowEquipmentChecklistEditor(v=>!v)} style={{padding:"7px 11px",borderRadius:10,background:showEquipmentChecklistEditor?"#fff8e1":"#e3f2fd",color:showEquipmentChecklistEditor?C.orange:C.blue,fontSize:12,fontWeight:900,border:`1px solid ${showEquipmentChecklistEditor?"#ffe082":C.lightBlue}`}}>
                {showEquipmentChecklistEditor?subText("סגור","Close"):subText("ערוך","Edit")}
              </Press>
            </div>
            {showEquipmentChecklistEditor&&(
              <div style={{marginTop:10}}>
                <textarea value={equipmentChecklistDraft} onChange={e=>setEquipmentChecklistDraft(e.target.value)} rows={7} placeholder={subText("פריט אחד בכל שורה\nערכת בדיקה\nרשת עלים\nכפפות","One item per line\nTest kit\nLeaf net\nGloves")} style={{...inp,minHeight:130,resize:"vertical",lineHeight:1.5,fontSize:13}}/>
                <div style={{display:"flex",gap:8,marginTop:8}}>
                  <Press onClick={saveEquipmentChecklist} style={{flex:1,padding:"10px 12px",borderRadius:12,background:"linear-gradient(135deg,#2563eb,#7c3aed)",color:"#fff",fontSize:13,fontWeight:900,textAlign:"center"}}>{subText("שמור רשימה","Save list")}</Press>
                  <Press onClick={resetEquipmentChecklist} style={{padding:"10px 12px",borderRadius:12,background:"#f0f4f8",color:C.muted,fontSize:13,fontWeight:900,border:`1px solid ${C.border}`}}>{subText("ברירת מחדל","Default")}</Press>
                </div>
              </div>
            )}
          </div>
          {!isSubOperator&&<Press onClick={openManualReport} disabled={isActionLoading("openManualReport")} style={{...card({marginBottom:16,display:"flex",alignItems:"center",gap:12,border:`2px dashed ${C.lightBlue}`,background:isActionLoading("openManualReport")?"#e3f2fd":"#f5f9ff",opacity:isActionLoading("openManualReport")?0.75:1}),padding:"14px 18px"}}>
            <div style={{width:40,height:40,borderRadius:12,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>📝</div>
            <div><div style={{fontWeight:800,fontSize:15,color:C.blue}}>{isActionLoading("openManualReport")?"⏳ פותח דוח...":"+ פתח דוח חדש"}</div><div style={{fontSize:12,color:C.muted}}>דוח ידני — לקוח מכל הרשימה</div></div>
          </Press>}
          {canSubOperatorReport&&hasSharedOrderForSub&&dayTasks.length>0&&(
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",margin:"-4px 0 14px"}}>
              <Press onClick={()=>{setAllDailyCardsCollapsed(v=>!v);haptic("medium");}} style={{padding:"9px 15px",borderRadius:12,background:allDailyCardsCollapsed?"#fff8e1":"#e3f2fd",color:allDailyCardsCollapsed?C.orange:C.blue,fontWeight:900,fontSize:12,border:`2px solid ${allDailyCardsCollapsed?"#ffe082":C.lightBlue}`,boxShadow:"0 8px 18px rgba(37,99,235,0.08)"}}>
                {allDailyCardsCollapsed?subText("בטל","Expand"):subText("כווץ","Collapse")}
              </Press>
              <Press onClick={toggleDailyWhatsAppClients} style={{padding:"9px 13px",borderRadius:12,background:allDailyWhatsAppDisabled?"#ffebee":"#e8f5e9",color:allDailyWhatsAppDisabled?C.red:C.green,fontWeight:900,fontSize:12,border:`2px solid ${allDailyWhatsAppDisabled?"rgba(185,28,28,0.18)":"#c8e6c9"}`,boxShadow:"0 8px 18px rgba(21,128,61,0.08)",whiteSpace:"nowrap"}}>
                {allDailyWhatsAppDisabled?subText("ווצאפ כבוי לכולם","WhatsApp off for all"):subText("ווצאפ פעיל לכולם","WhatsApp on for all")}
              </Press>
              <Press disabled={isActionLoading("sendSelfWhatsApp")} onClick={sendSelfWhatsAppTest} style={{padding:"9px 12px",borderRadius:12,background:C.red,color:"#fff",fontWeight:900,fontSize:12,border:"2px solid rgba(127,29,29,0.18)",boxShadow:"0 8px 18px rgba(185,28,28,0.18)",whiteSpace:"nowrap",opacity:isActionLoading("sendSelfWhatsApp")?0.7:1}}>
                {actionLabel("sendSelfWhatsApp",{idle:subText("שליחה לעצמי","Send to myself"),loading:subText("שולח...","Sending..."),success:subText("נשלח","Sent"),error:subText("נכשל","Failed")})}
              </Press>
            </div>
          )}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div>
              <h2 style={{fontSize:12,fontWeight:800,color:C.muted,letterSpacing:"0.1em",textTransform:"uppercase",margin:0}}>{subText("סידור יומי","Daily route")}</h2>
              <div style={{fontSize:13,fontWeight:800,color:C.blue,marginTop:2}}>{displayedDayName(dailyDate)}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {!isSubOperator&&<Press onClick={()=>{
                if(operatorEditOrder) {
                  writeLocalArray(operatorOrderKey(user?.username || user?.name, dailyDate), operatorOrderDraft.map(dailyTaskClientKey));
                  setOperatorEditOrder(false);
                  showToast("סדר מקומי נשמר");
                } else {
                  setOperatorOrderDraft(activeDayTasks);
                  setOperatorEditOrder(true);
                }
                haptic("medium");
              }} style={{padding:"6px 10px",borderRadius:10,background:operatorEditOrder?"#fff8e1":"#f0f4f8",color:operatorEditOrder?C.orange:C.blue,fontSize:11,fontWeight:900,border:`1px solid ${operatorEditOrder?"#ffe082":C.border}`}}>
                {operatorEditOrder?"סיום עריכה":"עריכת סדר"}
              </Press>}
              {!isSubOperator&&assignedSubOperators.length>0&&<Press onClick={shareOrderWithSubOperators} style={{padding:"6px 10px",borderRadius:10,background:"#e8f5e9",color:C.green,fontSize:11,fontWeight:900,border:"1px solid #c8e6c9"}}>
                שתף סדר
              </Press>}
              <input type="date" value={dailyDate} onClick={openDatePicker} onFocus={openDatePicker} onChange={e=>{setDailyDate(e.target.value);setOperatorEditOrder(false);}} style={{fontSize:12,fontWeight:700,color:C.blue,border:"none",background:"transparent",outline:"none",cursor:"pointer",maxWidth:112}}/>
            </div>
          </div>
          {isSubOperator&&!hasSharedOrderForSub&&(
            <div style={{...card({textAlign:"center",marginBottom:12,border:"2px dashed rgba(37,99,235,0.24)",background:"#f5f9ff"}),padding:28}}>
              <div style={{fontSize:34,marginBottom:8}}>⏳</div>
              <div style={{fontWeight:900,color:C.text,fontSize:15}}>{subText("ממתין לשיתוף מהמפעיל","Waiting for the operator to share the route")}</div>
              <div style={{fontWeight:800,color:C.muted,fontSize:12,marginTop:6,lineHeight:1.45}}>
                {subText(`הסדר יוצג כאן רק אחרי ש-${currentDailyOwner || "המפעיל המשויך"} ילחץ על שתף סדר.`, `The route will appear after ${currentDailyOwner || "the assigned operator"} shares it.`)}
              </div>
            </div>
          )}
          {canSubOperatorReport&&hasSharedOrderForSub&&<div style={{marginBottom:12,position:"relative"}}>
            <input value={clientSearch} onChange={e=>setClientSearch(e.target.value)} placeholder={subText("🔍 חפש לקוח מכל הימים לפי א-ב...","🔍 Search clients from all days...")} style={{...inp,fontSize:13}}/>
            {clientSearch&&(
              <div style={{position:"absolute",top:"100%",right:0,left:0,background:"#fff",borderRadius:12,boxShadow:"0 8px 24px rgba(0,0,0,0.15)",zIndex:100,maxHeight:240,overflowY:"auto",border:`1px solid ${C.border}`,marginTop:4}}>
                {filterClientOptions(clients, clientSearch).map(c=>(
                  <Press key={clientId(c)} onClick={()=>{ setEditingReport(null); setForm({...blank(),client:c.name,clientId:clientId(c),reportDate:dailyDate,clientLocked:true}); setClientSearch(""); setScreen("form"); haptic(); }} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderBottom:`1px solid ${C.border}`,background:"#fff"}}>
                    <div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff",flexShrink:0}}>{poolIconForType(c.poolType)}</div>
                    <div><div style={{fontWeight:700,fontSize:13,color:C.text}}>{c.name.split(" - ")[0]}</div>{c.address&&<div style={{fontSize:11,color:C.muted}}>{c.address}</div>}{c.regularOperator&&<div style={{fontSize:11,color:C.blue,fontWeight:800,marginTop:2}}>{subText("מפעיל משויך:","Assigned operator:")} {c.regularOperator}</div>}</div>
                  </Press>
                ))}
                {filterClientOptions(clients, clientSearch).length===0&&<div style={{padding:"14px 16px",color:C.muted,fontSize:13}}>{subText("הקלד לפחות 2 אותיות מתחילת שם הלקוח","Type at least 2 letters from the client's name")}</div>}
              </div>
            )}
          </div>}
          {dayTasks.length===0&&!isSubOperator&&<div style={{...card({textAlign:"center"}),padding:32}}><div style={{fontSize:40,marginBottom:8}}>📭</div><div style={{fontWeight:700,color:C.muted,fontSize:14}}>אין לקוחות לתאריך זה</div></div>}
          {dayTasks.length===0&&isSubOperator&&hasSharedOrderForSub&&<div style={{...card({textAlign:"center"}),padding:32}}><div style={{fontSize:40,marginBottom:8}}>📭</div><div style={{fontWeight:700,color:C.muted,fontSize:14}}>{subText("הסדר שותף ללא לקוחות לתאריך זה","The shared route has no clients for this date")}</div></div>}
          {!isDailyOrderComplete&&displayDayTasks.map((t,i)=>{
            const doneKey = `${dailyDate}:${t.id || t.client}`;
            const isDoneOpen = !!openDoneTasks[doneKey];
            const supply = clientSupply(t.client, t.clientId);
            const showTaskSupply = explicitSupplyClients.has(dailyTaskClientKey(t)) && isSupplyDueForDate(t.client, dailyDate, supply, t.clientId);
            const lastLog = t.changeLog?.[t.changeLog.length-1];
            const needsAck = !isSubOperator && !t._adminOrder && lastLog?.needsAck && !(lastLog?.ackedBy||[]).includes(user?.name);
            const logIdx = t.changeLog?t.changeLog.length-1:-1;
            const additionalClientTasks = myTasks(dailyDate)
              .filter(ft => samePoolIdentity(ft, t) && !ft.createdByAdminOrder && Number(ft.orderIndex || 0) <= 0 && ft.adminApproval !== "pending" && ft.adminApproval !== "rejected");
            const additionalTaskNotes = additionalClientTasks.map(additionalTaskLogNote).filter(Boolean);
            const hasAdditionalTasks = additionalClientTasks.length > 0;
            const isAdditionalTaskDone = additionalClientTasks.some(ft => ft.status === "done");
            const isDone = t.status==="done" || isClientReportedDone(dailyDate, t.client, t.clientId) || isAdditionalTaskDone;
            const isWaterCheckTask = !!t._waterCheck;
            const forceCollapsed = allDailyCardsCollapsed && !operatorEditOrder;
            if(isDone && !isDoneOpen) {
              return (
                <div
                  key={t.id}
                  draggable={!isSubOperator&&operatorEditOrder}
                  onDragStart={e=>!isSubOperator&&operatorEditOrder&&e.dataTransfer.setData("text/plain", String(i))}
                  onDragOver={e=>!isSubOperator&&operatorEditOrder&&e.preventDefault()}
                  onDrop={e=>{ if(!isSubOperator&&operatorEditOrder){ e.preventDefault(); moveDraftItem(Number(e.dataTransfer.getData("text/plain")), i); } }}
                  onPointerDown={()=>!isSubOperator&&!operatorEditOrder&&startClientLongPress(t, false)}
                  onPointerUp={()=>stopClientLongPress(t)}
                  onPointerLeave={()=>stopClientLongPress(t)}
                  onClick={()=>canSubOperatorReport&&!operatorEditOrder&&openDoneReportEditor(t)}
                  style={{...card({marginBottom:8,opacity:0.82,border:"2px solid #c8e6c9",padding:"10px 12px",display:"grid",gridTemplateColumns:"34px minmax(0,1fr) 34px",gridTemplateAreas:'"expand body status" "actions actions actions"',alignItems:"center",columnGap:10,rowGap:8,background:operatorEditOrder?"#fffde7":isWaterCheckTask?"#ecfdf5":"#fff",direction:"ltr"})}}
                >
                  <div style={{gridArea:"status",width:30,height:30,borderRadius:"50%",background:"#e8f5e9",display:"flex",alignItems:"center",justifyContent:"center",color:C.green,fontWeight:900,justifySelf:"end",direction:"rtl"}}>✓</div>
                  <div style={{gridArea:"body",minWidth:0,textAlign:isSubOperatorEnglish?"left":"right",direction:isSubOperatorEnglish?"ltr":"rtl"}}>
                    <div style={{minHeight:24,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",justifyContent:"flex-start"}}>
                      <div style={{fontWeight:900,fontSize:14,color:C.text,textDecoration:"line-through",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",minWidth:0,maxWidth:"100%"}}>{t.client.split(" - ")[0]}</div>
                      <WhatsAppClientToggle client={{client:t.client,clientId:t.clientId}} compact/>{isWaterCheckTask&&<Badge label={subText("בדיקת מים","Water test")} col={C.green}/>}
                    </div>
                    {hasAdditionalTasks&&<div style={{fontWeight:900,fontSize:15,color:C.blue,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginTop:2}}>{subText("משימה נוספת","Additional task")}</div>}
                    {clientAddress(t.client,t.clientId)&&<div style={{fontSize:11,color:C.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{clientAddress(t.client,t.clientId)}</div>}
                  </div>
                  <div style={{gridArea:"actions",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap",minWidth:0,direction:isSubOperatorEnglish?"ltr":"rtl"}}>
                    <Badge label={subText("בוצע","Done")} col={C.green}/>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",justifyContent:"flex-start",direction:isSubOperatorEnglish?"ltr":"rtl"}}>
                      {canSubOperatorReport&&<Press onClick={(e)=>{e.stopPropagation();openDoneReportEditor(t);}} style={{height:28,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 10px",borderRadius:10,background:"#fff8e1",color:C.orange,fontWeight:900,fontSize:12}}>{subText("ערוך","Edit")}</Press>}
                      <Press onClick={(e)=>{e.stopPropagation();forgetCompletedReport(dailyDate,t.client,undefined,t.clientId);setOpenDoneTasks(x=>({...x,[doneKey]:true}));showToast(subText("הכיווץ בוטל","Card expanded"));haptic("medium");}} style={{height:28,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 10px",borderRadius:10,background:"#ffebee",color:C.red,fontWeight:900,fontSize:12}}>{subText("בטל כיווץ","Expand")}</Press>
                      {!isSubOperator&&operatorEditOrder&&(
                        <div style={{display:"flex",gap:4}}>
                          <Press onClick={()=>moveDraftItem(i, Math.max(0, i-1))} style={{width:28,height:28,borderRadius:8,background:"#fff8e1",color:C.orange,fontWeight:900,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>↑</Press>
                          <Press onClick={()=>moveDraftItem(i, Math.min(dayTasks.length-1, i+1))} style={{width:28,height:28,borderRadius:8,background:"#fff8e1",color:C.orange,fontWeight:900,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>↓</Press>
                        </div>
                      )}
                    </div>
                  </div>
                  <Press onClick={(e)=>{e.stopPropagation();setOpenDoneTasks(x=>({...x,[doneKey]:true}));haptic();}} style={{gridArea:"expand",width:34,height:34,borderRadius:10,background:"#f0f4f8",color:C.blue,fontWeight:900,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",justifySelf:"start"}}>
                    ▾
                  </Press>
                </div>
              );
            }
            const poolType = (findClientByName(t.client,t.clientId)||{}).poolType||"מלח";
            const poolLabel = formatPoolType(poolType);
            const poolIcon = isWaterCheckTask ? "💧" : poolIconForType(poolType);
            return (
              <div
                key={t.id}
                draggable={!isSubOperator&&operatorEditOrder}
                onDragStart={e=>!isSubOperator&&operatorEditOrder&&e.dataTransfer.setData("text/plain", String(i))}
                onDragOver={e=>!isSubOperator&&operatorEditOrder&&e.preventDefault()}
                onDrop={e=>{ if(!isSubOperator&&operatorEditOrder){ e.preventDefault(); moveDraftItem(Number(e.dataTransfer.getData("text/plain")), i); } }}
                onPointerDown={()=>!isSubOperator&&!operatorEditOrder&&startClientLongPress(t, false)}
                onPointerUp={()=>stopClientLongPress(t)}
                onPointerLeave={()=>stopClientLongPress(t)}
                style={{...card({marginBottom:12,opacity:isDone?0.65:1,border:`2px solid ${operatorEditOrder?"#ffe082":needsAck?"#ff9800":isWaterCheckTask?"#16a34a":isDone?"#c8e6c9":C.border}`,transition:"all 0.3s",background:operatorEditOrder?"#fffde7":isWaterCheckTask?"#ecfdf5":"#fff"})}}
              >
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:10}}>
                  <div style={{flex:1,minWidth:0,textAlign:isSubOperatorEnglish?"left":"right"}}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:4}}>
                      <div style={{width:40,height:40,borderRadius:"50%",background:isWaterCheckTask?"#16a34a":`linear-gradient(135deg,${C.blue},${C.lightBlue})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{poolIcon}</div>
                      <div style={{minWidth:0,textAlign:isSubOperatorEnglish?"left":"right",display:"grid",gap:4,justifyItems:"start"}}>
                        <div style={{minHeight:24,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",justifyContent:"flex-start"}}>
                          <div style={{fontWeight:900,fontSize:16,color:C.text,textDecoration:isDone?"line-through":"none"}}>{t.client.split(" - ")[0]}</div>
                          <WhatsAppClientToggle client={{client:t.client,clientId:t.clientId}} compact/>{isWaterCheckTask&&<Badge label={subText("בדיקת מים","Water test")} col={C.green}/>}
                        </div>
                        <div style={{minHeight:24,display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-start"}}>
                          <span style={{minHeight:22,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,background:primaryPoolType(poolType)==="כלור"?"#e3f2fd":secondaryPoolType(poolType)==="גלישה"?"#e0f7fa":secondaryPoolType(poolType)==="סקימר"?"#e8eaf6":"#e8f5e9",color:primaryPoolType(poolType)==="כלור"?C.blue:secondaryPoolType(poolType)==="גלישה"?"#006064":secondaryPoolType(poolType)==="סקימר"?"#3949ab":C.green,borderRadius:99,padding:"0 8px",lineHeight:1}}>{subPoolLabel(poolLabel)}</span>
                          {clientAddress(t.client,t.clientId)&&<span style={{minHeight:22,display:"inline-flex",alignItems:"center",fontSize:11,color:C.muted}}>📍 {clientAddress(t.client,t.clientId)}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{width:84,display:"flex",flexDirection:"column",alignItems:"stretch",gap:6,flexShrink:0}}>
                    <Badge label={isDone?subText("✓ בוצע","✓ Done"):subText("⏳ ממתין","⏳ Pending")} col={isDone?C.green:C.orange}/>
                    {isDone&&<Press onClick={()=>{setOpenDoneTasks(x=>({...x,[doneKey]:false}));haptic();}} style={{padding:"6px 10px",borderRadius:10,background:"#f0f4f8",color:C.blue,fontWeight:900,fontSize:12}}>{subText("סגור","Close")}</Press>}
                    {!isDone&&canSubOperatorReport&&<Press onClick={()=>{setEditingReport(null);setForm({...blank(),client:t.client,clientId:t.clientId||clientIdByName(t.client),reportDate:dailyDate,clientLocked:true,waterCheckOnly:isWaterCheckTask});setScreen("form");}} style={{height:32,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 12px",borderRadius:10,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:800,fontSize:12,boxShadow:"0 3px 10px rgba(21,101,192,0.3)"}}>📝 {subText("דוח","Report")}</Press>}
                  </div>
                </div>
                {!forceCollapsed&&<>
                {operatorEditOrder&&(
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,background:"#fff8e1",borderRadius:10,padding:"7px 10px",marginBottom:10,border:"1px solid #ffe082"}}>
                    <span style={{fontSize:12,fontWeight:900,color:C.orange}}>#{i+1}</span>
                    <div style={{display:"flex",gap:6}}>
                      <Press onClick={()=>moveDraftItem(i, Math.max(0, i-1))} style={{width:34,height:30,borderRadius:8,background:"#fff",color:C.orange,fontWeight:900,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",border:"1px solid #ffe082"}}>↑</Press>
                      <Press onClick={()=>moveDraftItem(i, Math.min(dayTasks.length-1, i+1))} style={{width:34,height:30,borderRadius:8,background:"#fff",color:C.orange,fontWeight:900,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",border:"1px solid #ffe082"}}>↓</Press>
                    </div>
                  </div>
                )}
                {needsAck&&(
                  <div style={{background:"#fff8e1",borderRadius:10,padding:"10px 12px",marginBottom:10,border:"1px solid #ffe082"}}>
                    <TaskChangeInfo log={lastLog} operators={t.operators} />
                    <Press onClick={()=>{ackChange(t.id,logIdx);haptic("success");}} style={{padding:"8px 16px",borderRadius:99,background:"#e65100",color:"#fff",fontWeight:800,fontSize:12,display:"inline-block"}}>קיבלתי ✓</Press>
                  </div>
                )}
                {String(t.adminNote||"").trim()&&(
                  <div style={{background:"#fff8e1",borderRadius:10,padding:"9px 12px",marginBottom:10,border:"1px solid #ffe082",fontSize:12,color:C.text,fontWeight:800,lineHeight:1.5}}>
                    <div style={{color:C.orange,fontWeight:900,marginBottom:2}}>📝 {subText("הערה לטיפול","Treatment note")}</div>
                    <div>{t.adminNote}</div>
                  </div>
                )}
                {hasAdditionalTasks&&(
                  <div style={{background:"#eef6ff",borderRadius:12,padding:"12px 14px",marginBottom:10,border:`2px solid rgba(21,101,192,0.24)`,color:C.text,lineHeight:1.5}}>
                    <div style={{fontSize:17,fontWeight:900,color:C.blue,marginBottom:additionalTaskNotes.length?4:0}}>{subText("משימה נוספת","Additional task")}</div>
                    {additionalTaskNotes.length>0&&<div style={{fontSize:12,fontWeight:800}}>{additionalTaskNotes.join(" · ")}</div>}
                  </div>
                )}
                {(()=>{const lr=lastReadingForClient(t.client,t.clientId);if(!lr)return (
                  <div style={{marginBottom:10}}>
                    {!isSubOperator&&<Press onClick={()=>{setInternalNoteEdit({client:t.client,clientId:t.clientId||clientIdByName(t.client),note:""});haptic();}} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:99,background:"#f0f4f8",color:C.blue,fontWeight:900,fontSize:11}}>
                      ✏️ הוסף הערה פנימית
                    </Press>}
                    {isSubOperator&&(
                      <div style={{background:"#f5f9ff",border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 12px",fontSize:12,fontWeight:800,color:C.muted}}>
                        {subText("אין מדידה אחרונה להצגה","No previous measurement available")}
                      </div>
                    )}
                  </div>
                );
                  const noteDate = normalizeDate(lr.internalNoteDate || lr.customStatusDate || lr.date);
                  return (
                    <div style={{marginBottom:10}}>
                      {(()=>{ const historyKey = t.clientId || t.client; const history = clientMeasurementHistory(t.client, t.clientId, lr); const historyOpen = !!openMeasurementHistory[historyKey]; return (
                        <>
                      <Press onClick={()=>{const opening=!historyOpen;setOpenMeasurementHistory(x=>({...x,[historyKey]:opening}));if(opening)void loadClientMeasurementHistory(t.client,t.clientId,historyKey);haptic();}} style={{background:"#e3f2fd",borderRadius:10,padding:"8px 12px",marginBottom:6,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",cursor:"pointer",width:"100%",border:historyOpen?`1px solid ${C.blue}`:"1px solid transparent"}}>
                        <span style={{fontSize:12,fontWeight:700,color:C.blue}}>📊 {subText("מדידה אחרונה:","Last measurement:")}</span>
                        {hasMeasurementValue(lr.chlorine)&&<span style={{fontSize:12,fontWeight:800,color:"#1565c0"}}>Cl: {lr.chlorine}</span>}
                        {hasMeasurementValue(lr.ph)&&<span style={{fontSize:12,fontWeight:800,color:"#6a1b9a"}}>pH: {lr.ph}</span>}
                        {lr.chlora>0&&<span style={{fontSize:12,fontWeight:800,color:"#e65100"}}>TAB: {lr.chlora}</span>}
                        {lr.hth>0&&<span style={{fontSize:12,fontWeight:800,color:"#283593"}}>HTH: {lr.hth} cups</span>}
                        {lr.phUp>0&&<span style={{fontSize:12,fontWeight:800,color:"#6a1b9a"}}>pH+: {lr.phUp} {subText("כוסות","cups")}</span>}
                        {lr.acidLiters>0&&<span style={{fontSize:12,fontWeight:800,color:C.red}}>{subText("חומצה:","Acid:")} {lr.acidLiters}L</span>}
                        <span style={{fontSize:11,color:C.text,marginRight:"auto",fontWeight:800}}>{fmtDate(String(lr.date||"").slice(0,10))}</span>
                      </Press>
                      {historyOpen&&(
                        <div style={{background:"#f5f9ff",borderRadius:10,padding:"8px 10px",marginBottom:6,border:`1px solid ${C.border}`,display:"grid",gap:6}}>
                          {measurementHistoryLoading[historyKey] ? <div style={{fontSize:11,fontWeight:800,color:C.muted,textAlign:"center"}}>{subText("טוען מדידות קודמות...","Loading previous measurements...")}</div> : history.length ? history.map((r,idx)=>(
                            <div key={`${r.id || r.reportDate || idx}-history`} style={{display:"grid",gridTemplateColumns:"82px 1fr",gap:8,alignItems:"center",padding:"6px 0",borderBottom:idx<history.length-1?`1px solid ${C.border}`:"none"}}>
                              <span style={{fontSize:11,fontWeight:900,color:C.text}}>{fmtDate(measurementDate(r))}</span>
                              <span style={{fontSize:11,fontWeight:800,color:C.muted,display:"flex",gap:8,flexWrap:"wrap"}}>
                                {hasMeasurementValue(r.chlorine)&&<span style={{color:"#1565c0"}}>Cl: {r.chlorine}</span>}
                                {hasMeasurementValue(r.ph)&&<span style={{color:"#6a1b9a"}}>pH: {r.ph}</span>}
                                {hasMeasurementValue(r.chlora)&&<span style={{color:C.green}}>TAB: {r.chlora}</span>}
                                {hasMeasurementValue(r.hth)&&<span style={{color:"#283593"}}>HTH: {r.hth}</span>}
                              </span>
                            </div>
                          )) : <div style={{fontSize:11,fontWeight:800,color:C.muted,textAlign:"center"}}>{subText("אין מדידות קודמות","No previous measurements")}</div>}
                        </div>
                      )}
                        </>
                      ); })()}
                      {String(lr.customStatusText||"").trim()&&(
                        <div style={{background:"#f5f9ff",borderRadius:10,padding:"8px 12px",marginBottom:6,border:`1px solid ${C.border}`,fontSize:12,color:C.muted,lineHeight:1.5}}>
                          <span style={{fontWeight:800,color:C.blue}}>📝 {subText("הערה פנימית","Internal note")}{noteDate ? ` (${fmtDate(noteDate)})` : ""}: </span>
                          {lr.customStatusText}
                        </div>
                      )}
                      {!isSubOperator&&<Press onClick={()=>{setInternalNoteEdit({client:t.client,clientId:t.clientId||clientIdByName(t.client),note:String(lr.customStatusText||"")});haptic();}} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:99,background:"#f0f4f8",color:C.blue,fontWeight:900,fontSize:11,marginBottom:6}}>
                        ✏️ ערוך הערה פנימית
                      </Press>}
                      {lr.missedTreatment&&(
                        <div style={{background:"#fff8e1",borderRadius:10,padding:"8px 12px",marginBottom:6,border:"1px solid #ffe082",fontSize:12,color:C.orange,fontWeight:800}}>
                          ⚠️ {subText("לא בוצע טיפול בתאריך","No treatment was completed on")} {fmtDate(String(lr.date||"").slice(0,10))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {supply&&showTaskSupply&&!isDone&&(
                  <div style={{background:"#e3f2fd",borderRadius:10,padding:"8px 12px",marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:4}}>
                      <div style={{fontSize:11,fontWeight:700,color:C.blue}}>📦 {subText("חומרים נדרשים:","Required materials:")}</div>
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {supply.acid&&<span style={{background:C.white,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700,color:C.text,border:"1px solid "+C.border}}>🧪 {subText("חומצת מלח","Hydrochloric acid")}</span>}
                      {supply.phUpSupply&&<span style={{background:C.white,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700,color:C.text,border:"1px solid "+C.border}}>📈 {subText("מעלה pH","pH increaser")}</span>}
                      {supply.saltPkg&&<span style={{background:C.white,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700,color:C.text,border:"1px solid "+C.border}}>🧂 {subText("מלח","Salt")} ×{supply.saltBags}</span>}
                    </div>
                  </div>
                )}
                {clientGateCode(t.client,t.clientId)&&(
                  <Press onClick={()=>{const key=dailyTaskClientKey(t);setShowGateCode(g=>({...g,[key]:!g[key]}));haptic();}} style={{display:"inline-flex",alignItems:"center",gap:6,marginBottom:8,padding:"6px 14px",background:showGateCode[dailyTaskClientKey(t)]?"#fff3e0":"#f0f4f8",borderRadius:99,border:`1px solid ${showGateCode[dailyTaskClientKey(t)]?"#ffb74d":C.border}`}}>
                    <span style={{fontSize:12}}>🔑</span>
                    <span style={{fontSize:12,fontWeight:800,color:showGateCode[dailyTaskClientKey(t)]?C.orange:C.muted}}>{showGateCode[dailyTaskClientKey(t)]?clientGateCode(t.client,t.clientId):subText("הצג קוד שער","Show gate code")}</span>
                  </Press>
                )}
                {!isDone&&(
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {clientAddress(t.client,t.clientId)&&<a href={wazeUrl(clientAddress(t.client,t.clientId))} target="_blank" rel="noreferrer" style={{padding:"10px 14px",borderRadius:12,background:"#e8f5e9",color:C.green,fontWeight:800,fontSize:13,textDecoration:"none",textAlign:"center",border:"2px solid #c8e6c9",display:"flex",alignItems:"center",gap:4}}>🗺️ {subText("נווט","Navigate")}</a>}
                    {clientPhone(t.client,t.clientId)&&<a href={`tel:${clientPhone(t.client,t.clientId)}`} style={{padding:"10px 14px",borderRadius:12,background:"#f3e5f5",color:"#6a1b9a",fontWeight:800,fontSize:13,textDecoration:"none",textAlign:"center",border:"2px solid #e1bee7",display:"flex",alignItems:"center",gap:4}}>📞</a>}
                  </div>
                )}
                {!isSubOperator&&<div style={{marginTop:isDone?0:8}}>
                  <Press onClick={()=>{setOpIssueClient(t.client);setOpIssueClientId(t.clientId || clientIdByName(t.client));setShowOperatorIssue(true);haptic();}} style={{padding:"8px 14px",borderRadius:12,background:"#fff8e1",color:C.orange,fontWeight:800,fontSize:12,border:"1px solid #ffe082",display:"inline-flex",alignItems:"center",gap:6}}>🔧 דווח תקלה</Press>
                </div>}
                </>}
              </div>
            );
          })}
          {lockedDayTasks.length>0&&(
            <div style={{...card({marginBottom:12,background:"#f5f9ff",border:`1px solid ${C.border}`})}}>
              <div style={{fontSize:12,fontWeight:900,color:C.muted,marginBottom:8}}>{subText("נעולים זמנית","Temporarily locked")}</div>
              {lockedDayTasks.map(t=>(
                <div key={`locked-${t.id || dailyTaskClientKey(t)}`} onPointerDown={()=>startClientLongPress(t, true)} onPointerUp={()=>stopClientLongPress(t)} onPointerLeave={()=>stopClientLongPress(t)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderTop:`1px solid ${C.border}`}}>
                  <div style={{width:28,height:28,borderRadius:"50%",background:"#fff8e1",color:C.orange,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,flexShrink:0}}>⏸</div>
                  <div style={{flex:1,minWidth:0,textAlign:isSubOperatorEnglish?"left":"right"}}>
                    <div style={{minHeight:24,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",justifyContent:"flex-start"}}>
                      <div style={{fontSize:13,fontWeight:900,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.client.split(" - ")[0]}</div>
                      <WhatsAppClientToggle client={{client:t.client,clientId:t.clientId}} compact/>
                    </div>
                    <div style={{fontSize:10,color:C.muted}}>{subText("לחיצה ארוכה לשחרור","Press and hold to unlock")}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {isDailyOrderComplete&&!clientSearch&&(
            <div style={{...card({textAlign:"center",background:"linear-gradient(135deg,#e8f5e9,#f1f8e9)"}),padding:28,border:"2px solid #c8e6c9"}}>
              <div style={{fontSize:44,marginBottom:8}}>🎉</div>
              <div style={{fontWeight:900,fontSize:18,color:C.green,marginBottom:4}}>{subText("סיימת הכל!","All done!")}</div>
              <div style={{color:C.muted,fontSize:13}}>{subText("יום עבודה מוצלח!","Great work today!")}</div>
            </div>
          )}
        </div>
        <div style={{position:"fixed",right:12,left:12,bottom:"calc(12px + env(safe-area-inset-bottom, 0px))",zIndex:70,background:"rgba(255,255,255,0.70)",padding:"9px 10px calc(9px + env(safe-area-inset-bottom, 0px))",border:"1px solid rgba(148,163,184,0.24)",borderRadius:24,display:"flex",justifyContent:"space-around",gap:8,boxShadow:"0 24px 70px rgba(15,23,42,0.14), 0 1px 0 rgba(255,255,255,0.86) inset",backdropFilter:"blur(22px)",WebkitBackdropFilter:"blur(22px)"}}>
          {[["\uD83C\uDFE0",subText("\u05D1\u05D9\u05EA","Home"),0],["\uD83D\uDCCB",subText("\u05DE\u05E9\u05D9\u05DE\u05D5\u05EA","Tasks"),1],["\uD83D\uDCCA",subText("\u05D4\u05EA\u05E7\u05D3\u05DE\u05D5\u05EA","Progress"),3],["\uD83D\uDCC5",subText("\u05E2\u05EA\u05D9\u05D3\u05D9","Upcoming"),2]].map(([ic,lb,idx])=>(
            <Press key={lb} onClick={()=>{ setNavTab(idx); haptic(); }} style={{position:"relative",display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"7px 12px",borderRadius:18,background:navTab===idx?operatorPrimaryGradient:"rgba(241,245,249,0.50)",boxShadow:navTab===idx?"0 12px 28px rgba(79,70,229,0.22)":"none"}}>
              <IndicatorBubbles red={idx===1 ? taskChangesCount : 0} />
              <span style={{fontSize:22}}>{ic}</span>
              <span style={{fontSize:10,fontWeight:900,color:navTab===idx?"#fff":C.muted}}>{lb}</span>
            </Press>
          ))}
        </div>
        {navTab===1&&(
          <BottomSheet title={subText("📋 משימות היום","📋 Today's tasks")} onClose={()=>setNavTab(0)}>
            {!isSubOperator&&(
              <div style={{...card({marginBottom:12,background:"rgba(245,249,255,0.86)",border:`1px solid ${C.border}`})}}>
                <div style={{fontSize:13,fontWeight:900,color:C.text,marginBottom:10}}>{"\u05d9\u05e6\u05d9\u05e8\u05ea \u05de\u05e9\u05d9\u05de\u05d4 \u05dc\u05d0\u05d9\u05e9\u05d5\u05e8"}</div>
                {operatorTaskClient?(
                  <div style={{...inp,display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <span style={{color:C.blue,fontWeight:900}}>🏊 {operatorTaskClient.split(" - ")[0]}{clientAddress(operatorTaskClient,operatorTaskClientId)?` · ${clientAddress(operatorTaskClient,operatorTaskClientId)}`:""}</span>
                    <span onClick={()=>{setOperatorTaskClient("");setOperatorTaskClientId("");setOperatorTaskClientSearch("");}} style={{color:C.muted,cursor:"pointer",fontSize:16}}>×</span>
                  </div>
                ):(
                  <div style={{position:"relative",marginBottom:8}}>
                    <input value={operatorTaskClientSearch} onChange={e=>setOperatorTaskClientSearch(e.target.value)} placeholder={"\u05d1\u05d7\u05e8 \u05dc\u05e7\u05d5\u05d7 \u05dc\u05de\u05e9\u05d9\u05de\u05d4..."} style={inp} autoComplete="off"/>
                    {operatorTaskClientSearch&&<div style={{maxHeight:180,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:12,background:"#fff",boxShadow:"0 8px 24px rgba(0,0,0,0.12)",marginTop:4}}>
                      {filterClientOptions(clients, operatorTaskClientSearch).map(c=>(
                        <Press key={clientId(c)} onClick={()=>{setOperatorTaskClient(c.name);setOperatorTaskClientId(clientId(c));setOperatorTaskClientSearch("");haptic();}} style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`}}>
                          <div style={{fontSize:13,fontWeight:900,color:C.text}}>{c.name.split(" - ")[0]}</div>
                          <div style={{fontSize:11,fontWeight:800,color:C.muted}}>{[c.address,subClientMetaLine(c)].filter(Boolean).join(" · ")}</div>
                        </Press>
                      ))}
                      {filterClientOptions(clients, operatorTaskClientSearch).length===0&&<div style={{padding:"12px 14px",fontSize:12,color:C.muted}}>{"\u05dc\u05d0 \u05e0\u05de\u05e6\u05d0 \u05dc\u05e7\u05d5\u05d7"}</div>}
                    </div>}
                  </div>
                )}
                <input value={operatorTaskNote} onChange={e=>setOperatorTaskNote(e.target.value)} placeholder={"\u05d4\u05e2\u05e8\u05d4 \u05dc\u05d0\u05d3\u05de\u05d9\u05df..."} style={{...inp,marginBottom:10}}/>
                <Press onClick={submitOperatorTaskRequest} disabled={!operatorTaskClient||isActionLoading("operatorTaskRequest")} style={{padding:"12px",borderRadius:14,background:actionStatus.operatorTaskRequest==="success"?C.green:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:900,fontSize:13,textAlign:"center",opacity:!operatorTaskClient||isActionLoading("operatorTaskRequest")?0.55:1}}>{actionLabel("operatorTaskRequest",{idle:"\u05e9\u05dc\u05d7 \u05dc\u05d0\u05d9\u05e9\u05d5\u05e8 \u05d0\u05d3\u05de\u05d9\u05df",loading:"\u05e9\u05d5\u05dc\u05d7...",success:"\u05e0\u05e9\u05dc\u05d7",error:"\u05e0\u05e1\u05d4 \u05e9\u05d5\u05d1"})}</Press>
              </div>
            )}            {(()=>{
              const todayTasks = myTasks(dailyDate);
              if(todayTasks.length===0) return <div style={{textAlign:"center",padding:32,color:C.muted}}><div style={{fontSize:40,marginBottom:8}}>📭</div><div style={{fontWeight:700}}>{subText("אין משימות להיום","No tasks for today")}</div></div>;
              return todayTasks.map(t=>{ const effectiveDone=isManualTaskDone(t); const effectiveTask=effectiveDone?{...t,status:"done"}:t; return (
                <div key={t.id} style={{...card({marginBottom:10})}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:6}}>
                    <div style={{minHeight:24,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",justifyContent:"flex-start",textAlign:"right"}}>
                      <div style={{fontWeight:800,fontSize:15,color:C.text}}>{t.client.split(" - ")[0]}</div>
                      <WhatsAppClientToggle client={{client:t.client,clientId:t.clientId}} compact/>
                    </div>
                    <Badge label={taskStatusLabel(effectiveTask)} col={taskStatusColor(effectiveTask)}/>
                  </div>
                  {clientAddress(t.client,t.clientId)&&<div style={{fontSize:12,color:C.muted,marginBottom:6}}>📍 {clientAddress(t.client,t.clientId)}</div>}
                  <TaskChangeInfo log={t.changeLog?.[t.changeLog.length-1]} operators={t.operators} />
                  {!effectiveDone&&t.adminApproval!=="pending"&&t.adminApproval!=="rejected"&&(
                    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                      {additionalTaskActionId===t.id ? (
                        <Press onClick={async()=>{await markDone(t.id);setAdditionalTaskActionId(null);showToast(subText("✓ משימה סומנה כבוצעה","✓ Task marked as done"));haptic("success");}} style={{padding:"8px 16px",borderRadius:10,background:C.green,color:"#fff",fontWeight:900,fontSize:12,display:"inline-block"}}>{subText("בוצע","Done")}</Press>
                      ) : (
                        <Press onClick={async()=>{setAdditionalTaskActionId(t.id);haptic();const receiptLogIndex=(t.changeLog||[]).length-1;const receiptLog=t.changeLog?.[receiptLogIndex];try{if(receiptLogIndex>=0&&receiptLog?.needsAck&&!(receiptLog.ackedBy||[]).includes(user?.name)){await ackChange(t.id,receiptLogIndex);}else if((receiptLog?.ackedBy||[]).includes(user?.name)){showToast(subText("האישור כבר נשלח לאדמין","Confirmation already sent to the admin"));}else{await sendNotificationToAdmins("✅ מפעיל אישר קבלת משימה",`${user?.name||"מפעיל"} אישר קבלת משימה: ${t.client?.split(" - ")[0]||"משימה"}`);showToast(subText("האישור נשלח לאדמין","Confirmation sent to the admin"));}}catch(e){console.warn("Task receipt admin notification failed",e);setAdditionalTaskActionId(null);showToast(subText("שליחת האישור לאדמין נכשלה","Failed to send confirmation to the admin"));}}} style={{padding:"8px 14px",borderRadius:10,background:"#fff8e1",border:"1px solid #ffe082",color:C.orange,fontWeight:900,fontSize:12,display:"inline-block"}}>{subText("מאשר","Confirm")}</Press>
                      )}
                      {additionalTaskActionId!==t.id&&canSubOperatorReport&&<Press onClick={()=>{setEditingReport(null);setForm({...blank(),client:t.client,clientId:t.clientId||clientIdByName(t.client),reportDate:dailyDate,clientLocked:true});setNavTab(0);setScreen("form");haptic();}} style={{padding:"8px 14px",borderRadius:10,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:800,fontSize:12,display:"inline-block"}}>📝 {subText("פתח דוח","Open report")}</Press>}
                    </div>
                  )}
                </div>
              );});
            })()}
          </BottomSheet>
        )}
        {navTab===3&&(
          <BottomSheet title={subText("\uD83D\uDCCA \u05D4\u05EA\u05E7\u05D3\u05DE\u05D5\u05EA \u05D9\u05D5\u05DE\u05D9\u05EA","📊 Daily progress")} onClose={()=>setNavTab(0)}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:12,flexWrap:"wrap"}}>
              <input type="date" value={dailyDate} onClick={openDatePicker} onFocus={openDatePicker} onChange={e=>setDailyDate(e.target.value)} style={{...inp,maxWidth:170,color:C.blue,border:`1px solid ${C.lightBlue}`,fontWeight:900,cursor:"pointer"}}/>
              <Badge label={`${operatorProgressDone}/${operatorProgressEntries.length}`} col={operatorProgressEntries.length&&operatorProgressDone===operatorProgressEntries.length?C.green:C.blue}/>
            </div>
            {operatorProgressEntries.length>0 ? (
              <>
                <PBar done={operatorProgressDone} total={operatorProgressEntries.length} label={subText("\u05D1\u05E8\u05D9\u05DB\u05D5\u05EA","pools")}/>
                <div style={{marginTop:12}}>
                  {operatorProgressEntries.map((entry,i)=>(
                    <div key={`${entry.client}-${i}`} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,padding:"10px 0",borderTop:i?`1px solid ${C.border}`:"none"}}>
                      <span style={{fontSize:13,fontWeight:900,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{String(entry.client||"").split(" - ")[0]}</span>
                      <Badge label={entry.reported?subText("\u2713 \u05D3\u05D5\u05D7 \u05E0\u05D5\u05E6\u05E8","✓ Report created"):subText("\u05DE\u05DE\u05EA\u05D9\u05DF \u05DC\u05D3\u05D5\u05D7","Waiting for report")} col={entry.reported?C.green:C.orange}/>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{textAlign:"center",padding:28,color:C.muted,fontWeight:800}}>{subText("\u05D0\u05D9\u05DF \u05D1\u05E8\u05D9\u05DB\u05D5\u05EA \u05DC\u05EA\u05D0\u05E8\u05D9\u05DA \u05D6\u05D4","No pools for this date")}</div>
            )}
          </BottomSheet>
        )}
        {navTab===2&&(
          <BottomSheet title={subText("📅 משימות עתידיות","📅 Upcoming tasks")} onClose={()=>setNavTab(0)}>
            {(()=>{
              const today = todayStr();
              const futureTasks = tasks.filter(t=>{ if (t.createdByAdminOrder || Number(t.orderIndex || 0) > 0 || t.adminApproval === "rejected") return false; const d = normalizeDate(t.date); const ownerName = isSubOperator ? dailyOwnerName(d) : user?.name; return d > today && (t.operators||[]).some(op=>normalizeName(op)===normalizeName(ownerName)); }).sort((a,b)=>normalizeDate(a.date).localeCompare(normalizeDate(b.date)));
              if(futureTasks.length===0) return <div style={{textAlign:"center",padding:32,color:C.muted}}><div style={{fontSize:40,marginBottom:8}}>📭</div><div style={{fontWeight:700}}>{subText("אין משימות עתידיות","No upcoming tasks")}</div></div>;
              const grouped = {};
              futureTasks.forEach(t=>{ const d = normalizeDate(t.date); if(!grouped[d]) grouped[d]=[]; grouped[d].push(t); });
              return Object.entries(grouped).map(([date, dts])=>(
                <div key={date} style={{marginBottom:20}}>
                  <div style={{fontSize:12,fontWeight:800,color:C.blue,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
                    <span>📅 {fmtDate(date)}</span>
                    <span style={{background:"#e3f2fd",borderRadius:99,padding:"2px 10px",color:C.blue,fontSize:11}}>{dts.length} {subText("משימות","tasks")}</span>
                  </div>
                  {dts.map(t=>(
                    <div key={t.id} style={{...card({marginBottom:8})}}>
                      <div style={{fontWeight:800,fontSize:15,color:C.text,marginBottom:4}}>{t.client.split(" - ")[0]}</div>
                      {clientAddress(t.client,t.clientId)&&<div style={{fontSize:12,color:C.muted,marginBottom:6}}>📍 {clientAddress(t.client,t.clientId)}</div>}
                      <TaskChangeInfo log={t.changeLog?.[t.changeLog.length-1]} operators={t.operators} />
                      {clientAddress(t.client,t.clientId)&&<a href={wazeUrl(clientAddress(t.client,t.clientId))} target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:8,padding:"6px 12px",background:"#e8f5e9",borderRadius:8,color:C.green,fontSize:12,fontWeight:700,textDecoration:"none"}}>🗺️ {subText("נווט","Navigate")}</a>}
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
              <div style={{marginBottom:12}}><label style={{fontSize:12,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>לקוח ובריכה</label><div style={{...inp,color:C.blue,fontWeight:700}}>{operatorIssuePoolLabel(opIssueClient, opIssueClientId)}</div></div>
              <div style={{marginBottom:12}}><label style={{fontSize:12,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>תיאור התקלה</label><textarea value={opIssueDesc} onChange={e=>setOpIssueDesc(e.target.value)} rows={3} placeholder="תאר את הבעיה..." style={{...inp,resize:"none"}}/></div>
              <div style={{marginBottom:16}}>
                <label style={{fontSize:12,fontWeight:700,color:C.muted,display:"block",marginBottom:8}}>דחיפות</label>
                <div style={{display:"flex",gap:8}}>{["רגיל","דחוף","קריטי"].map(p=>(<Press key={p} onClick={()=>setOpIssuePriority(p)} style={{flex:1,padding:"10px",borderRadius:10,textAlign:"center",fontSize:13,fontWeight:800,background:opIssuePriority===p?(p==="קריטי"?C.red:p==="דחוף"?C.orange:C.blue):"#f0f4f8",color:opIssuePriority===p?"#fff":C.muted}}>{p}</Press>))}</div>
              </div>
              <Press disabled={isActionLoading("operatorIssueReport")} onClick={submitOperatorIssueReport} style={{padding:"14px",borderRadius:14,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:900,fontSize:15,textAlign:"center",boxShadow:"0 4px 14px rgba(21,101,192,0.3)",opacity:isActionLoading("operatorIssueReport")?0.72:1}}>{actionLabel("operatorIssueReport",{idle:"שלח דיווח →",loading:"⏳ שולח...",success:"✅ נשלח",error:"⚠️ נסה שוב"})}</Press>
            </div>
          </BottomSheet>
        )}
        {/* QR ושיחה מוסתרים זמנית */}
        <Toast msg={toast.msg} visible={toast.visible}/>
      </div>
    );
  }

  if(screen==="form") return (
    <div dir={isSubOperatorEnglish?"ltr":"rtl"} lang={isSubOperatorEnglish?"en":"he"} className={isIOS ? "galileo-ios-vh" : undefined} style={{minHeight:"100vh",background:"linear-gradient(180deg,#e7f0fb 0%,#d7e6f7 42%,#e8eef8 100%)",fontFamily:"'Plus Jakarta Sans',sans-serif",paddingBottom:"calc(100px + env(safe-area-inset-bottom, 0px))"}}>
      <IPhoneComfortLayer/>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');*{-webkit-tap-highlight-color:transparent;box-sizing:border-box;user-select:none;-webkit-user-select:none}input,textarea,select{user-select:text;-webkit-user-select:text}input[type=range]{-webkit-appearance:none;height:8px;border-radius:99px;background:transparent}input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:32px;height:32px;border-radius:50%;background:${C.blue};box-shadow:0 2px 8px rgba(21,101,192,0.4)}select option{background:#fff}`}</style>
      <div style={{margin:"12px 14px 0",background:"linear-gradient(135deg,rgba(244,249,255,0.90),rgba(196,219,244,0.82) 48%,rgba(216,225,242,0.88))",border:"1px solid rgba(148,163,184,0.22)",borderRadius:28,padding:"22px 18px",position:"relative",overflow:"hidden",boxShadow:"0 26px 70px rgba(37,99,235,0.12), 0 1px 0 rgba(255,255,255,0.82) inset",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative"}}>
          <div><p style={{color:C.muted,fontSize:12,fontWeight:800,margin:"0 0 4px"}}>{form.clientLocked?form.client.split(" - ")[0]:subText("בחר לקוח","Select client")}</p><h1 style={{color:C.text,fontSize:28,fontWeight:900,margin:0,lineHeight:1.08}}>📝 {waterCheckReportMode?subText("דוח בדיקת מים","Water test report"):subText("דוח טיפול","Treatment report")}</h1></div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <RefreshTopButton compact/>
            <Press onClick={leaveReportForm} style={{background:"rgba(226,237,250,0.72)",backdropFilter:"blur(14px)",border:"1px solid rgba(148,163,184,0.22)",borderRadius:16,padding:"9px 14px",color:C.muted,fontSize:13,fontWeight:900}}>{subText("← חזרה","Back →")}</Press>
          </div>
        </div>
      </div>
      <div style={{padding:"18px 16px 0"}}>
        <Sec icon="📋" title={subText("פרטים","Details")} action={!waterCheckReportMode&&client ? <WhatsAppClientToggle client={{client,clientId:form.clientId}} compact/> : null}>
          <div style={{...card(),marginBottom:12}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
              <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>{subText("תאריך","Date")}</label><input type="date" value={reportDate} onChange={e=>sf("reportDate",e.target.value)} style={inp}/></div>
              <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>{subText("מפעיל","Operator")}</label><div style={{...inp,color:C.blue,fontWeight:700,display:"flex",alignItems:"center",gap:6,cursor:"default"}}><span>{user?.icon}</span>{user?.name}</div></div>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>{subText("לקוח","Client")}</label>
              {form.clientLocked?(
                <div style={{...inp,color:C.blue,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"default"}}><span>🏊 {client}</span><span style={{fontSize:12,color:C.muted}}>🔒</span></div>
              ):(
                <div style={{position:"relative"}}>
                   <input value={clientSearch} onChange={e=>setClientSearch(e.target.value)} placeholder={subText("🔍 חפש לקוח לפי שם, כתובת, טלפון או מפעיל...","🔍 Search by name, address, phone or operator...")} style={{...inp,marginBottom:clientSearch?4:0}} autoComplete="off"/>
                   {clientSearch&&(
                     <div style={{maxHeight:220,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:12,background:"#fff",boxShadow:"0 8px 24px rgba(0,0,0,0.12)",marginBottom:8}}>
                       {filterClientOptions(reportClientOptions().all, clientSearch).map(c=>(
                         <Press key={clientId(c)} onClick={()=>{setForm(f=>({...f,client:c.name,clientId:clientId(c)}));setClientSearch("");haptic();}} style={{padding:"11px 14px",borderBottom:`1px solid ${C.border}`}}>
                           <div style={{fontSize:14,fontWeight:900,color:C.text}}>{c.name.split(" - ")[0]}</div>
                           <div style={{fontSize:11,fontWeight:800,color:C.muted,marginTop:2}}>{[c.address,subClientMetaLine(c)].filter(Boolean).join(" · ")||subText("ללא פרטי זיהוי נוספים","No additional identifying details")}</div>
                         </Press>
                       ))}
                       {filterClientOptions(reportClientOptions().all, clientSearch).length===0&&<div style={{padding:"14px 16px",color:C.muted,fontSize:13}}>{subText("הקלד לפחות 2 אותיות לחיפוש","Type at least 2 letters to search")}</div>}
                     </div>
                   )}
                   <select value={form.clientId || (client ? clientIdByName(client) : "")} onChange={e=>{const selected=findClientByName("",e.target.value);setForm(f=>({...f,client:selected?.name||"",clientId:selected?clientId(selected):""}));}} style={sel}>
                     <option value="">{subText("בחר לקוח...","Select client...")}</option>
                     {reportClientOptions().regular.length>0&&<optgroup label={subText("לקוחות קבועים","Regular clients")}>{reportClientOptions().regular.map(c=><option key={clientId(c)} value={clientId(c)}>{clientOptionLabel(c)}</option>)}</optgroup>}
                   </select>
                 </div>
               )}
               {client&&(()=>{ const c=findClientByName(client,form.clientId); const meta=[c?.address,subClientMetaLine(c)].filter(Boolean).join(" · "); return meta?<div style={{marginTop:8,fontSize:12,fontWeight:800,color:C.blue,background:"#e3f2fd",borderRadius:10,padding:"8px 12px"}}>{meta}</div>:null; })()}
               {client&&clientPhone(client,form.clientId)&&<a href={`tel:${clientPhone(client,form.clientId)}`} style={{display:"flex",alignItems:"center",gap:8,marginTop:8,padding:"10px 14px",background:"#e8f5e9",border:`1px solid #c8e6c9`,borderRadius:12,textDecoration:"none",color:C.green,fontSize:13,fontWeight:700}}><span>📞</span><span>{client.split(" - ")[0]}</span><span style={{color:C.muted,fontSize:12,marginRight:"auto"}}>{subText("לחץ לחיוג","Tap to call")}</span></a>}
               {client&&lastReadingForClient(client,form.clientId)&&(()=>{ const lr=lastReadingForClient(client,form.clientId); const note=String(lr.customStatusText||"").trim(); const noteDate=normalizeDate(lr.internalNoteDate || lr.customStatusDate || lr.date); return (
                 <div style={{marginTop:8,display:"grid",gap:6}}>
                   <div style={{background:"#e3f2fd",borderRadius:10,padding:"8px 12px",display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                     <span style={{fontSize:12,fontWeight:900,color:C.blue}}>{subText("מדידה אחרונה:","Last measurement:")}</span>
                     {hasMeasurementValue(lr.chlorine)&&<span style={{fontSize:12,fontWeight:800,color:"#1565c0"}}>{subText("כלור:","Chlorine:")} {lr.chlorine}</span>}
                     {hasMeasurementValue(lr.ph)&&<span style={{fontSize:12,fontWeight:800,color:"#6a1b9a"}}>pH: {lr.ph}</span>}
                     {hasMeasurementValue(lr.chlora)&&<span style={{fontSize:12,fontWeight:800,color:C.green}}>TAB: {lr.chlora}</span>}
                     {hasMeasurementValue(lr.hth)&&<span style={{fontSize:12,fontWeight:800,color:"#283593"}}>HTH: {lr.hth}</span>}
                     {lr.date&&<span style={{fontSize:11,fontWeight:800,color:C.muted,marginRight:"auto"}}>{fmtDate(String(lr.date).slice(0,10))}</span>}
                   </div>
                  {note&&<div style={{background:"#f5f9ff",border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 12px",fontSize:12,fontWeight:800,color:C.muted,lineHeight:1.5}}>
                    <span style={{color:C.blue}}>{subText("הערה פנימית","Internal note")}{noteDate ? ` (${fmtDate(noteDate)})` : ""}: </span>{note}
                  </div>}
                </div>
              ); })()}
            </div>
          </div>
        </Sec>

        <Sec icon="📊" title={waterCheckReportMode?subText("בדיקת מים","Water test"):subText("מדידות","Measurements")}>
          {!waterCheckReportMode&&<label style={{display:"flex",alignItems:"center",gap:12,margin:"0 0 12px",padding:"12px 14px",borderRadius:14,background:sendReminder?"#e8f5e9":C.white,border:`2px solid ${sendReminder?"#c8e6c9":C.border}`,boxShadow:"0 2px 8px rgba(0,0,0,0.04)",cursor:"pointer",userSelect:"none"}}>
            <input type="checkbox" checked={!!sendReminder} onChange={e=>setChlorineReminderEnabled(e.target.checked)} style={{width:22,height:22,accentColor:C.green,flexShrink:0}}/>
            <span style={{fontSize:14,fontWeight:900,color:C.text,flex:1}}>{subText("שלח תזכורת","Send reminder")}</span>
            {sendReminder&&<span style={{fontSize:12,fontWeight:900,color:C.green,background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:99,padding:"4px 10px",whiteSpace:"nowrap"}}>{isSubOperatorEnglish?(chlorineReminderDaysLeft<=0?"Sent today":chlorineReminderDaysLeft===1?"Sends in 1 day":`Sends in ${chlorineReminderDaysLeft} days`):reminderCounterText(chlorineReminderDaysLeft)}</span>}
          </label>}
          {REPORT_SLIDER_CONFIGS.filter(s=>!waterCheckReportMode || ["chlorine","chlora","hth"].includes(s.key)).map(s=>(
            <Fragment key={s.key}>
            <CollapsibleSlider fieldKey={s.key} label={subSliderLabel(s)} min={s.min} max={s.max} step={s.step} unit={subSliderUnit(s)} warnAbove={s.warnAbove} warnBelow={s.warnBelow} optimal={s.optimal} val={s.val} fn={s.fn} large={largeSlider} expandKey={`_exp_${s.key}`} form={form} sf={sf} disabled={s.disabled} disabledReason={subSliderDisabledReason(s)} zeroButtonLabel={isSubOperatorEnglish&&s.zeroButtonLabel?"No need to add":s.zeroButtonLabel} phLowButton={s.phLowButton} saltLowLightButton={s.saltLowLightButton} required={waterCheckReportMode?s.key==="chlorine":s.required} english={isSubOperatorEnglish}/>
              {s.key==="salt"&&(
                <div style={{display:"flex",alignItems:"center",gap:10,margin:"6px 0 12px"}}>
                  <div style={{height:1,flex:1,background:"linear-gradient(90deg,rgba(21,101,192,0.05),rgba(21,101,192,0.32))"}}/>
                  <div style={{padding:"4px 14px",borderRadius:99,background:"rgba(21,101,192,0.10)",border:"1px solid rgba(21,101,192,0.22)",color:C.blue,fontSize:12,fontWeight:900}}>{subText("איזון","Balance")}</div>
                  <div style={{height:1,flex:1,background:"linear-gradient(90deg,rgba(21,101,192,0.32),rgba(21,101,192,0.05))"}}/>
                </div>
              )}
            </Fragment>
          ))}
        </Sec>

        {!waterCheckReportMode&&form.adminReport&&(()=>{
          const poolType = (findClientByName(client,form.clientId)||{}).poolType||"";
          const isSalt = !poolType || primaryPoolType(poolType)==="מלח";
          if(!isSalt) return null;
          return (
            <Sec icon="⚡" title={subText("אלקטרודה","Electrode")}>
              <div style={{...card()}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>{subText("דגם","Model")}</label><input value={elModel} onChange={e=>sf("elModel",e.target.value)} style={inp} placeholder={subText("דגם המכשיר","Device model")}/></div>
                  <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>{subText("סריאלי","Serial")}</label><input value={elSerial} onChange={e=>sf("elSerial",e.target.value)} style={inp} placeholder={subText("מספר סריאלי","Serial number")}/></div>
                </div>
                <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>{subText("תאריך ניקיון אחרון","Last cleaning date")}</label><input type="date" value={elDate} onChange={e=>sf("elDate",e.target.value)} style={inp}/></div>
                {calcNext(elDate,30)&&(()=>{
                  const d=Math.ceil((new Date(calcNext(elDate,30))-new Date())/864e5);
                  const bg=d<0?"#ffebee":d<7?"#fff8e1":"#e8f5e9"; const col=d<0?C.red:d<7?C.orange:C.green;
                  const txt=isSubOperatorEnglish
                    ? d<0?`⚠️ Inspection overdue by ${Math.abs(d)} days`:d<7?`⏰ Inspection in ${d} days (${fmtDate(calcNext(elDate,30))})`:`✅ Next inspection: ${fmtDate(calcNext(elDate,30))} (${d} days)`
                    : d<0?`⚠️ בדיקה באיחור של ${Math.abs(d)} ימים`:d<7?`⏰ בדיקה בעוד ${d} ימים (${fmtDate(calcNext(elDate,30))})`:`✅ בדיקה הבאה: ${fmtDate(calcNext(elDate,30))} (${d} ימים)`;
                  return <div style={{marginTop:10,background:bg,borderRadius:10,padding:"8px 12px",fontSize:12,fontWeight:700,color:col}}>{txt}</div>;
                })()}
              </div>
            </Sec>
          );
        })()}

        <Sec icon="🔍" title={waterCheckReportMode?subText("זרימת מים","Water flow"):subText("בדיקות מצב","Condition checks")}>
          {!waterCheckReportMode&&<ToggleField label={subText("💧 גובה מים","💧 Water level")} value={waterLevel} onChange={v=>sf("waterLevel",v)} english={isSubOperatorEnglish}/>}
          {!waterCheckReportMode&&<ToggleField label={subText("🔵 צלילות","🔵 Clarity")} value={clarity} onChange={v=>sf("clarity",v)} english={isSubOperatorEnglish}/>}
          {!waterCheckReportMode&&<ToggleField label={subText("🧴 פס שומן","🧴 Oil line")} value={fat} onChange={v=>sf("fat",v)} english={isSubOperatorEnglish}/>}
          <ToggleField label={waterCheckReportMode?subText("🌀 זרימת מים *","🌀 Water flow *"):subText("🌀 זרימה","🌀 Flow")} value={flow} onChange={v=>sf("flow",v)} english={isSubOperatorEnglish}/>
        </Sec>

        {!waterCheckReportMode&&<Sec icon="🏊" title={subText("מצב בריכה","Pool condition")}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:poolStatus==="אחר"?12:0}}>
            {["מאוזנת","אחר"].map(opt=>(
              <Press key={opt} onClick={()=>{sf("poolStatus",opt);haptic();}} style={{padding:14,borderRadius:14,textAlign:"center",fontWeight:800,fontSize:14,background:poolStatus===opt?(opt==="מאוזנת"?"#e8f5e9":"#ffebee"):C.white,color:poolStatus===opt?(opt==="מאוזנת"?C.green:C.red):C.muted,border:`2px solid ${poolStatus===opt?(opt==="מאוזנת"?"#c8e6c9":"#ffcdd2"):C.border}`,boxShadow:"0 2px 8px rgba(0,0,0,0.04)",transition:"all 0.2s"}}>
                {opt==="מאוזנת"?subText("✅ מאוזנת","✅ Balanced"):subText("⚠️ אחר","⚠️ Other")}
              </Press>
            ))}
          </div>
          <div style={{...card()}}>
            <textarea value={customStatusText} onChange={e=>sf("customStatusText",e.target.value)} rows={2} placeholder={poolStatus==="אחר"?subText("תאר את הבעיה...","Describe the issue..."):subText("הערה פנימית...","Internal note...")} style={{...inp,resize:"none",marginBottom:poolStatus==="אחר"?10:0}}/>
            {poolStatus==="מאוזנת"&&<div style={{fontSize:11,fontWeight:800,color:C.blue,marginTop:6}}>{subText("הערה זו נשמרת כהערה פנימית ואינה נשלחת ללקוח.","This is saved as an internal note and is not sent to the client.")}</div>}
            {poolStatus==="אחר"&&(
              <>
                <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>{subText("הגבלת שימוש עד","Restrict use until")}</label>
                <input type="date" value={restrictedUntil} onChange={e=>sf("restrictedUntil",e.target.value)} style={inp}/>
              </>
            )}
          </div>
        </Sec>}

        {!waterCheckReportMode&&<Sec icon="📦" title={subText("חומרים לטיפול הבא","Materials for the next treatment")}>
          <div style={{...card()}}>
            <div style={{background:"#e3f2fd",borderRadius:10,padding:"8px 12px",marginBottom:12,display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}><span>💬</span><span style={{fontSize:11,fontWeight:700,color:C.blue}}>{subText("הלקוח יקבל הודעה שהחומרים יסופקו בטיפול הבא","The client will be notified that these materials will be supplied at the next treatment")}</span></div>
            {[["acid",acid,subText("🧪 חומצת מלח","🧪 Hydrochloric acid")],["phUpSupply",phUpSupply,subText("📈 מעלה pH","📈 pH increaser")],["saltPkg",saltPkg,subText("🧂 שקי מלח","🧂 Salt bags")]].map(([k,v,lbl])=>(
              <Press key={k} onClick={()=>{sf(k,!v);haptic();}} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:`1px solid ${C.border}`}}>
                <div style={{width:26,height:26,borderRadius:8,border:`2px solid ${v?C.blue:C.border}`,background:v?C.blue:C.white,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s",flexShrink:0}}>{v&&<span style={{color:"#fff",fontSize:14}}>✓</span>}</div>
                <span style={{fontSize:14,fontWeight:700,color:C.text}}>{lbl}</span>
              </Press>
            ))}
            {saltPkg&&(
              <div style={{paddingTop:10}}>
                <label style={{fontSize:13,fontWeight:700,color:C.text,display:"block",marginBottom:8}}>{subText("כמות שקים:","Number of bags:")}</label>
                <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
                  {[0,1,2,3,4,5,6,7,8,9,10].map(n=>(<Press key={n} onClick={()=>sf("saltBags",n)} style={{width:40,height:40,borderRadius:99,background:saltBags===n?C.blue:C.border,color:saltBags===n?"#fff":C.muted,fontWeight:800,fontSize:14,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{n}</Press>))}
                </div>
              </div>
            )}
            <div style={{paddingTop:12}}>
              <label style={{fontSize:13,fontWeight:700,color:C.text,display:"block",marginBottom:8}}>{subText("חומרים שסופקו היום","Materials supplied today")}</label>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8}}>
                {["סודה אש","חומצת מלח","שקי מלח"].map(item=>{
                  const selected = suppliedEquipment.includes(item);
                  return (
                    <Press key={item} onClick={()=>{toggleSuppliedEquipment(item);haptic();}}
                      style={{padding:"11px",borderRadius:12,textAlign:"center",fontWeight:800,fontSize:13,
                        background:selected?"#e8f5e9":"#f0f4f8",
                        color:selected?C.green:C.muted,
                        border:`2px solid ${selected?"#c8e6c9":"transparent"}`}}>
                      {selected?"✓ ":""}{isSubOperatorEnglish?({"סודה אש":"Soda ash","חומצת מלח":"Hydrochloric acid","שקי מלח":"Salt bags"}[item]||item):item}
                    </Press>
                  );
                })}
              </div>
            </div>
          </div>
        </Sec>}

        {false&&<Sec icon="📷" title="תמונות">
          <div style={{...card()}}>
            <input type="file" ref={fileRef} accept="image/*" multiple style={{display:"none"}} disabled onChange={()=>{}}/>
            {photos.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>{photos.map((p,i)=>(<img key={i} src={p} alt="" style={{width:"100%",aspectRatio:"1",objectFit:"cover",borderRadius:10,border:`2px solid ${C.border}`}}/>))}</div>}
            <div style={{padding:"12px",borderRadius:12,background:"#f5f9ff",color:C.muted,fontWeight:700,fontSize:13,textAlign:"center"}}>העלאת תמונות מוסתרת</div>
          </div>
        </Sec>}

        {!waterCheckReportMode&&<Sec icon="📝" title={subText("הערות ללקוח","Client notes")}>
          <textarea value={notes} onChange={e=>sf("notes",e.target.value)} rows={3} placeholder={subText("הערה קצרה שתישלח בוואטסאפ...","A short note to be sent by WhatsApp...")} style={{...inp,resize:"none",minHeight:80}}/>
        </Sec>}

        {pending.length>0&&(
          <div onClick={()=>setShowPendingReportNames(v=>!v)} style={{...card({background:"#fff8e1",border:`1px solid #ffe082`}),marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",cursor:"pointer"}}>
            <span style={{fontSize:13,fontWeight:700,color:C.orange}}>⚠️ {pending.length} {subText("דוחות בתור","queued reports")} · {pendingReportSummaryText()}</span>
            <Press onClick={togglePendingBackgroundSync} style={{background:pendingBackgroundSync?C.green:"#fff7ed",border:`1px solid ${pendingBackgroundSync?"#86efac":"#fed7aa"}`,borderRadius:99,padding:"6px 12px",color:pendingBackgroundSync?"#fff":C.orange,fontWeight:900,fontSize:12}}>{pendingBackgroundSync?subText("עצור רקע","Stop sync"):subText("הפעל רקע","Start sync")}</Press>
            <Press onClick={(e)=>{e.stopPropagation();syncPendingReports();}} style={{background:C.orange,borderRadius:99,padding:"6px 14px",color:"#fff",fontWeight:800,fontSize:12}}>{actionLabel("syncPending",{idle:subText("שלח הכל","Send all"),loading:subText("⏳ שולח...","⏳ Sending..."),success:subText("✅ נשלח","✅ Sent"),error:subText("⚠️ נסה שוב","⚠️ Retry")})}</Press>
            {showPendingReportNames&&<div style={{flexBasis:"100%",background:"rgba(255,255,255,0.72)",borderRadius:12,padding:"8px 10px",border:"1px solid rgba(245,158,11,0.22)"}}>
              {renderPendingReportRows()}
            </div>}
          </div>
        )}
        <Press onClick={handleSubmitPress} disabled={!client||syncing||isActionLoading("submitReport")} style={{padding:"18px",borderRadius:18,background:actionStatus.submitReport==="success"?C.green:actionStatus.submitReport==="local"?C.orange:syncing||!client?"#90caf9":"linear-gradient(135deg,#2563eb,#7c3aed)",color:"#fff",fontWeight:900,fontSize:17,textAlign:"center",boxShadow:syncing||!client?"none":"0 16px 36px rgba(79,70,229,0.24)",marginBottom:8}}>{actionLabel("submitReport",{idle:subText("שלח דוח ⚡","Submit report ⚡"),loading:subText("⏳ שולח דוח...","⏳ Submitting report..."),success:subText("✅ נשלח","✅ Sent"),local:subText("⚠️ נשמר מקומית","⚠️ Saved locally"),error:subText("⚠️ שגיאה","⚠️ Error")})}</Press>
        <Press onClick={leaveReportForm} style={{padding:"14px",borderRadius:18,border:`1px solid ${C.border}`,background:"rgba(226,237,250,0.78)",color:C.muted,fontWeight:800,fontSize:14,textAlign:"center",boxShadow:"0 10px 26px rgba(37,99,235,0.06)"}}>{subText("← ביטול","Cancel")}</Press>
      </div>
      {confirmReportWhatsApp&&(
        <BottomSheet title={subText("\u05e9\u05dc\u05d9\u05d7\u05ea \u05d5\u05d5\u05e6\u05d0\u05e4","Send WhatsApp")} onClose={()=>setConfirmReportWhatsApp(null)}>
          <div style={{fontSize:16,fontWeight:900,color:C.text,marginBottom:14,textAlign:"center",lineHeight:1.5}}>{subText("\u05d4\u05d0\u05dd \u05dc\u05e9\u05dc\u05d5\u05d7 \u05dc\u05dc\u05e7\u05d5\u05d7 \u05d4\u05d5\u05d3\u05e2\u05ea \u05d5\u05d5\u05e6\u05d0\u05e4?","Send the client a WhatsApp message?")}</div>
          <label style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,padding:"13px 14px",borderRadius:14,background:confirmReportWhatsApp.send?"#e8f5e9":"#ffebee",border:`2px solid ${confirmReportWhatsApp.send?"#c8e6c9":"#ffcdd2"}`,cursor:"pointer"}}>
            <input type="checkbox" checked={!!confirmReportWhatsApp.send} onChange={e=>setConfirmReportWhatsApp(x=>({...x,send:e.target.checked}))} style={{width:22,height:22,accentColor:C.green,flexShrink:0}}/>
            <span style={{fontSize:14,fontWeight:900,color:confirmReportWhatsApp.send?C.green:C.red,flex:1}}>{confirmReportWhatsApp.send?subText("\u05dc\u05e9\u05dc\u05d5\u05d7 \u05d5\u05d5\u05e6\u05d0\u05e4 \u05dc\u05dc\u05e7\u05d5\u05d7","Send WhatsApp to the client"):subText("\u05dc\u05d0 \u05dc\u05e9\u05dc\u05d5\u05d7 \u05d5\u05d5\u05e6\u05d0\u05e4","Do not send WhatsApp")}</span>
          </label>
          <Press onClick={()=>{ const sendCustomerWhatsApp = !!confirmReportWhatsApp.send; setConfirmReportWhatsApp(null); void handleSubmit({sendCustomerWhatsApp}); }} style={{padding:"14px",borderRadius:14,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontSize:15,fontWeight:900,textAlign:"center",boxShadow:"0 12px 28px rgba(37,99,235,0.22)"}}>{subText("\u05d0\u05d9\u05e9\u05d5\u05e8","Confirm")}</Press>
        </BottomSheet>
      )}
      {chemicalRestrictionPrompt&&(
        <BottomSheet title={subText("\u05d4\u05d2\u05d1\u05dc\u05ea \u05e9\u05d9\u05de\u05d5\u05e9","Use restriction")} onClose={()=>setChemicalRestrictionPrompt(null)}>
          <Press onClick={()=>applyChemicalRestriction(360)}
            style={{padding:"16px",borderRadius:14,background:"#fff8e1",border:"1px solid #ffe082",color:C.orange,fontSize:15,fontWeight:900,textAlign:"center"}}>
            {subText("הגבל שימוש ל-6 שעות","Restrict use for 6 hours")}
          </Press>
        </BottomSheet>
      )}
      <Toast msg={toast.msg} visible={toast.visible}/>
    </div>
  );

  if(screen==="done") {
    const last = submittedReport || reports[reports.length-1];
    const lastWaDisabled = last?._deliveryDecision?.skipReason === "disabled" ||
      (!last?._deliveryDecision?.version && last ? isWhatsAppDisabledForClient(last) : false);
    const lastWaterCheck = !!last?.waterCheckOnly;
    const lastClientRecord = last ? findClientByName(last.client,last.clientId) : null;
    const lastPrimaryPool = primaryPoolType(lastClientRecord?.poolType);
    const lastMessageSkipped = last?._deliveryDecision?.version && last._deliveryDecision.shouldSend === false;
    const summaryRows = last ? [
      [subText("לקוח","Client"),last.client.split(" - ")[0]],
      hasMeasurementValue(last.chlorine) && [subText("כלור","Chlorine"),`${last.chlorine} ppm`],
      hasMeasurementValue(last.ph) && ["pH",last.ph],
      lastPrimaryPool!=="כלור" && hasMeasurementValue(last.salt) && [subText("רמת מלח","Salt level"),`${last.salt} PPM`],
      Number(last.chlora)>0 && ["TAB",last.chlora],
      Number(last.hth)>0 && ["HTH",last.hth],
      last.flow && [subText("זרימה","Flow"),last.flow],
      !lastWaterCheck && last.poolStatus && [subText("מצב","Condition"),last.poolStatus==="מאוזנת"?subText("✅ מאוזנת","✅ Balanced"):"⚠️ "+last.customStatusText]
    ].filter(Boolean) : [];
    return (
      <div dir={isSubOperatorEnglish?"ltr":"rtl"} lang={isSubOperatorEnglish?"en":"he"} className={isIOS ? "galileo-ios-vh" : undefined} style={{minHeight:"100vh",background:"linear-gradient(180deg,#e7f0fb 0%,#d7e6f7 45%,#e8eef8 100%)",fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"calc(24px + env(safe-area-inset-top, 0px)) 24px calc(24px + env(safe-area-inset-bottom, 0px))",textAlign:"center",color:C.text}}>
        <IPhoneComfortLayer/>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');*{-webkit-tap-highlight-color:transparent;box-sizing:border-box}@keyframes pop{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
        <div style={{position:"absolute",top:14,left:14}}><RefreshTopButton compact/></div>
        <div style={{width:104,height:104,borderRadius:32,background:"rgba(232,241,253,0.82)",border:"1px solid rgba(148,163,184,0.22)",boxShadow:"0 22px 55px rgba(37,99,235,0.12), 0 1px 0 rgba(232,241,253,0.82) inset",display:"flex",alignItems:"center",justifyContent:"center",fontSize:58,marginBottom:18,animation:"pop 0.5s cubic-bezier(0.34,1.56,0.64,1)"}}>✅</div>
        <h1 style={{fontSize:26,fontWeight:900,color:C.text,margin:"0 0 8px"}}>{subText("הדוח נשלח!","Report submitted!")}</h1>
        <p style={{color:C.muted,fontSize:15,margin:"0 0 28px",fontWeight:700}}>{lastWaterCheck
          ? subText("בדיקת המים נשמרה ללא הודעת סיום טיפול","The water test was saved without a treatment completion message")
          : lastWaDisabled
            ? subText("שליחת ווצאפ כבויה ללקוח זה - הדוח נשמר ללא הודעה","WhatsApp is off for this client — the report was saved without a message")
            : lastMessageSkipped
              ? subText("הדוח נשמר ללא הודעת ווצאפ","The report was saved without a WhatsApp message")
              : subText("הלקוח יקבל הודעת ווצאפ עכשיו","The client will receive a WhatsApp message now")}</p>
        {last&&(
          <div style={{...card({width:"100%",maxWidth:340,marginBottom:20,textAlign:"right"})}}>
            <div style={{fontSize:12,fontWeight:800,color:C.muted,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:12}}>{subText("סיכום הדוח","Report summary")}</div>
            {summaryRows.map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}><span style={{color:C.muted,fontSize:13,fontWeight:600}}>{k}</span><span style={{color:C.text,fontSize:13,fontWeight:800}}>{v}</span></div>
            ))}
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,width:"100%",maxWidth:340,marginBottom:10}}>
          <Press onClick={()=>{setEditingReport(null);setSubmittedReport(null);setForm(blank());setScreen("form");haptic();}} style={{padding:14,borderRadius:18,background:"linear-gradient(135deg,#2563eb,#7c3aed)",color:"#fff",fontWeight:900,fontSize:14,textAlign:"center",boxShadow:"0 16px 36px rgba(79,70,229,0.24)"}}>+ {subText("דוח חדש","New report")}</Press>
          <Press onClick={()=>setScreen("daily")} style={{padding:14,borderRadius:18,border:`1px solid ${C.border}`,background:"rgba(226,237,250,0.78)",color:C.blue,fontWeight:900,fontSize:14,textAlign:"center",boxShadow:"0 10px 26px rgba(37,99,235,0.06)"}}>🏠 {subText("לוח יומי","Daily board")}</Press>
        </div>
        {last&&(
          <Press onClick={()=>{ setForm({...blank(),...last,...reportSupplyFlags(last),ph:isLowPhValue(last.ph)?0:last.ph,salt:isLowSaltFlagValue(last.salt)?0:last.salt,clientLocked:true,reportDate:last.reportDate,client:last.client,clientId:last.clientId||"",chlorineZeroConfirmed:Number(last.chlorine||0)===0,phLowConfirmed:isLowPhValue(last.ph),lowSaltLight:isLowSaltReportValue(last.salt)}); setEditingReport({date:last.reportDate,client:last.client,clientId:last.clientId||"",operator:last.operator||user?.name,localId:last.id,waterCheckOnly:!!last.waterCheckOnly}); setScreen("form"); haptic("medium"); showToast(subText("✏️ עריכה ללא WhatsApp","✏️ Editing without WhatsApp")); }} style={{padding:12,borderRadius:18,border:`1px solid rgba(194,65,12,0.24)`,background:"rgba(255,247,237,0.82)",color:C.orange,fontWeight:900,fontSize:13,textAlign:"center",width:"100%",maxWidth:340,boxShadow:"0 10px 24px rgba(194,65,12,0.08)"}}>✏️ {subText("ערוך דוח אחרון","Edit last report")}</Press>
        )}
      </div>
    );
  }

  if(screen==="admin") {
    const progressDate = adminTab==="daily" ? taskDate : dailyDate;
    const progressData = operatorUsers.map(op=>{
      const entries = getOperatorProgressEntries(progressDate, op.name);
      const total = entries.length;
      const done = entries.filter(x=>x.reported).length;
      return {op,total,done,pending:Math.max(0,total-done),entries};
    });
    const activeAdminOperator = selectedAdminOperator || operatorUsers[0]?.name || "";
    const adminOrderHasDraftContext = adminOrderDraft.length > 0 || !!selectedAdminOperator || adminOrderRemovedClients.length > 0;
    const adminOrderList = adminOrderHasDraftContext ? adminOrderDraft : (activeAdminOperator ? getAdminOrderEntries(taskDate, activeAdminOperator) : []);
    const adminOrderClientKey = (value = {}) => {
      const source = value && typeof value === "object" ? value : {name:value};
      return poolIdentityKey({
        client:source.client || source.name || value,
        clientId:source.clientId || ""
      });
    };
    const adminOrderKeys = new Set(adminOrderList.map(adminOrderClientKey));
    const allOrderClients = clients;
    const adminOrderClientByKey = new Map(allOrderClients.map(c=>[adminOrderClientKey(c),c]));
    const adminOrderClientRecord = value => adminOrderClientByKey.get(adminOrderClientKey(value)) ||
      findClientByName(value?.client || value?.name || value, value?.clientId);
    const adminOrderEligibleMap = new Map();
    allOrderClients.forEach(c => {
      if (activeAdminOperator && clientAssignedToOperatorDate(c, taskDate, activeAdminOperator)) adminOrderEligibleMap.set(adminOrderClientKey(c), c);
    });
    const adminOrderAssignedTodayCount = activeAdminOperator
      ? new Set(allOrderClients
          .filter(c => clientAssignedToOperatorDate(c, taskDate, activeAdminOperator))
          .map(c => String(c.clientId || c.id || c.name || "").trim() || normalizeName(c.name))
        ).size
      : 0;
    adminOrderList.forEach(entry => {
      const base = adminOrderClientRecord(entry) || {name:entry.client,clientId:entry.clientId};
      adminOrderEligibleMap.set(adminOrderClientKey(entry), base);
    });
    const adminOrderSearchActive = adminOrderClientSearch.trim().length > 0;
    const adminOrderSearchPool = adminOrderSearchActive ? allOrderClients : [...adminOrderEligibleMap.values()];
    const adminOrderEligibleClients = filterClientOptions(sortByClientName(adminOrderSearchPool), adminOrderClientSearch);
    const hasLowSaltLight = (clientName, clientIdValue = "") => {
      const lr = lastReadingForClient(clientName, clientIdValue);
      if (isLowSaltReportValue(lr?.salt)) return true;
      const latest = [...sheetReports, ...reports]
        .filter(r => samePoolIdentity(r, {client:clientName,clientId:clientIdValue}))
        .sort((a,b)=>normalizeDate(b.reportDate).localeCompare(normalizeDate(a.reportDate)))[0];
      return isLowSaltReportValue(latest?.salt);
    };
    const selectedAdminOrderEntries = adminOrderList
      .filter(entry => !adminOrderClientSearch || filterClientOptions([{name:entry.client, ...(adminOrderClientRecord(entry)||{})}], adminOrderClientSearch).length)
      .sort((a,b)=>Number(a.orderIndex || 9999)-Number(b.orderIndex || 9999));
    const adminOrderWaterCheckClients = sortByClientName(allOrderClients)
      .filter(c => activeAdminOperator && clientWaterCheckAssigned(c, taskDate, activeAdminOperator));
    const unselectedAdminOrderClientsBase = adminOrderEligibleClients.filter(c=>!adminOrderKeys.has(adminOrderClientKey(c)));
    const removedVisibleClients = adminOrderRemovedClients
      .map(item => {
        const removed = typeof item === "object" && item !== null ? item : {name:item};
        const key = adminOrderClientKey(removed);
        const mapped = adminOrderClientByKey.get(key) || {};
        return {...mapped, ...removed, name:removed.name || removed.client || mapped.name || ""};
      })
      .filter(c => c?.name && !adminOrderKeys.has(adminOrderClientKey(c)));
    const unselectedAdminOrderClients = sortByClientName([
      ...unselectedAdminOrderClientsBase,
      ...removedVisibleClients.filter(c=>!unselectedAdminOrderClientsBase.some(x=>adminOrderClientKey(x)===adminOrderClientKey(c)))
    ]);
    const addClientToAdminOrder = (clientValue) => {
      const source = typeof clientValue === "object" ? clientValue : (adminOrderClientRecord(clientValue) || {name:clientValue});
      const clientName = source.name || source.client || "";
      const key = adminOrderClientKey(source);
      setAdminOrderDraft(prev=>[...adminOrderList,{client:clientName,clientId:source.clientId || clientIdByName(clientName),note:"",orderIndex:adminOrderList.length+1}]);
      setAdminOrderRemovedClients(prev=>prev.filter(item=>adminOrderClientKey(item)!==key));
      setAdminOrderClientSearch("");
      haptic();
    };
    const removeClientFromAdminOrder = (entry) => {
      const source = adminOrderClientRecord(entry) || {name:entry.client,clientId:entry.clientId};
      const removedClient = {...source, name:entry.client, clientId:entry.clientId || source.clientId || clientIdByName(entry.client)};
      const key = adminOrderClientKey(removedClient);
      setAdminOrderRemovedClients(prev=>prev.some(item=>adminOrderClientKey(item)===key) ? prev : [...prev, removedClient]);
      setAdminOrderDraft(adminOrderList.filter(x=>adminOrderClientKey(x)!==key).map((x,idx)=>({...x,orderIndex:idx+1})));
    };
    const updateAdminOrderIndex = (index, value) => {
      setAdminOrderDraft(adminOrderList.map((x, idx)=>idx===index?{...x,orderIndex:value === "" ? "" : Math.max(1, Number(value) || 1)}:x));
    };
    const loadDefaultAdminOrder = () => {
      const defaults = baseOperatorClients(taskDate, activeAdminOperator);
      if (!defaults.length) {
        showToast("אין בריכות משויכות למפעיל ביום הזה");
        haptic("medium");
        return;
      }
      const existingByClient = new Map(adminOrderList.map(entry=>[adminOrderClientKey(entry), entry]));
      const loaded = defaults.map((entry, i) => {
        const existing = existingByClient.get(adminOrderClientKey(entry));
        return {...entry, note:existing?.note || entry.note || "", orderIndex:i + 1};
      });
      adminOrderList.forEach(entry => {
        if (!loaded.some(x=>adminOrderClientKey(x)===adminOrderClientKey(entry))) loaded.push({...entry, orderIndex:loaded.length + 1});
      });
      setAdminOrderDraft(loaded);
      setAdminOrderRemovedClients([]);
      setAdminOrderClientSearch("");
      showToast(`נטענו ${defaults.length} בריכות ברירת מחדל`);
      haptic("success");
    };
    const taskClientOptions = sortByClientName(clients);
    const dayTasks = tasks.filter(t=>normalizeDate(t.date)===taskDate && t.status!=="done" && !t.createdByAdminOrder && Number(t.orderIndex || 0) <= 0).sort((a,b)=>String((a.operators||[])[0]||"").localeCompare(String((b.operators||[])[0]||""), "he") || normalizeName(a.client).localeCompare(normalizeName(b.client)));
    const criticalAdminIssueIndex = operatorIssues.findIndex(iss => isCriticalIssue(iss[4]) && !isIssueInProgress(iss[5]) && !isIssueDone(iss[5]) && !dismissedCriticalIssueIds.includes(String(iss[0])));
    const criticalAdminIssue = criticalAdminIssueIndex >= 0 ? operatorIssues[criticalAdminIssueIndex] : null;
    const activeOperatorDoneAlert = operatorDoneAlerts[0] || null;
    const adminShellBg = "linear-gradient(180deg,#e7f0fb 0%,#d7e6f7 42%,#e8eef8 100%)";
    const adminHeroBg = "linear-gradient(135deg,rgba(244,249,255,0.90),rgba(196,219,244,0.82) 48%,rgba(216,225,242,0.88))";
    const adminHeroText = {color:"#10233f"};
    const adminSoftText = {color:"#64748b"};
    const adminPrimaryGradient = "linear-gradient(135deg,#2563eb,#7c3aed)";
    const adminGlass = (extra={}) => card({background:"rgba(226,237,250,0.78)",border:"1px solid rgba(148,163,184,0.22)",boxShadow:"0 22px 55px rgba(30,64,175,0.14), 0 1px 0 rgba(255,255,255,0.76) inset",...extra});
    const isSubAdminPanel = false;
    const dashboardTasksToday = tasks.filter(t=>normalizeDate(t.date)===dailyDate);
    const dashboardOpenTasks = tasks.filter(t=>t.status!=="done" && t.adminApproval!=="rejected").length;
    const dashboardDoneToday = dashboardTasksToday.filter(t=>t.status==="done").length;
    const dashboardReportCount = [...sheetReports, ...reports].length;
    const dashboardCriticalIssues = operatorIssues.filter(iss=>isCriticalIssue(iss[4]) && !isIssueDone(iss[5])).length;
    const dashboardSupplyToday = Object.entries(supplyDB || {}).reduce((acc, [storageKey, supply]) => {
      const clientName = supply?.client || findClientByName("", supply?.clientId)?.name || storageKey;
      const clientObj = findClientByName(clientName, supply?.clientId);
      if (!supply?.clientId && !clientObj) return acc;
      const resolvedClientId = supply?.clientId || clientId(clientObj);
      if (!isSupplyDueForDate(clientName, dailyDate, supply, resolvedClientId)) return acc;
      if (supply?.phUpSupply) acc.phUpSupply += 1;
      if (supply?.acid) acc.acid += 1;
      return acc;
    }, { phUpSupply:0, acid:0 });
    const supplyLabelParts = (label) => String(label || "").split(",").map(x=>x.trim()).filter(Boolean);
    const allowedSupplyLabelParts = (label) => supplyLabelParts(label).filter(x=>x.includes("מעלה") || x.includes("חומצת") || x.includes("מלח"));
    const reportHasAllowedSupply = (r) => allowedSupplyLabelParts(r?.supplyLabel).length > 0;
    const reportMatchesSupplyType = (r, type) => {
      if (!type) return true;
      const labels = allowedSupplyLabelParts(r?.supplyLabel).join(" ");
      if (type === "מעלה pH") return labels.includes("מעלה");
      if (type === "חומצת מלח") return labels.includes("חומצת");
      if (type === "מלח") return labels.includes("מלח");
      return true;
    };
    const dailySupplyOperatorByClient = new Map();
    operatorUsers.forEach(op => {
      getAdminOrderEntries(dailyDate, op.name).forEach(entry => {
        if (entry?.client) dailySupplyOperatorByClient.set(poolIdentityKey(entry), op.name);
      });
    });
    const dailySupplyRows = Object.entries(supplyDB || {}).reduce((rows, [storageKey, supply]) => {
      const clientName = supply?.client || findClientByName("", supply?.clientId)?.name || storageKey;
      const clientObj = findClientByName(clientName, supply?.clientId);
      if (!supply?.clientId && !clientObj) return rows;
      const resolvedClientId = supply?.clientId || clientId(clientObj);
      if (!isSupplyDueForDate(clientName, dailyDate, supply, resolvedClientId)) return rows;
      const materials = [
        supply?.phUpSupply && "סודה אש",
        supply?.acid && "חומצת מלח",
        supply?.saltPkg && Number(supply?.saltBags || 0) > 0 && `מלח ×${Number(supply?.saltBags || 0)}`
      ].filter(Boolean);
      if (!materials.length) return rows;
      const operator = supply?.assignedOperator || dailySupplyOperatorByClient.get(poolIdentityKey({client:clientName,clientId:resolvedClientId})) || clientObj?.regularOperator || "ללא שיוך";
      rows.push({operator, client:clientName, clientId:resolvedClientId, materials});
      return rows;
    }, []).sort((a,b)=>normalizeName(a.operator).localeCompare(normalizeName(b.operator)) || normalizeName(a.client).localeCompare(normalizeName(b.client)));
    const dailySupplyGroups = dailySupplyRows.reduce((groups, row) => {
      const key = row.operator || "ללא שיוך";
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
      return groups;
    }, {});
    const goAdminBubble = (tab) => {
      haptic("light");
      trackUsageEvent("admin_bubble_click", {screen:"admin_dashboard", target:tab});
      setTimeout(() => {
        setAdminTab(tab);
        window.scrollTo({top:0,left:0,behavior:"smooth"});
      }, 160);
    };
    const adminTabs = isSubAdminPanel
      ? [["daily","📋 חלוקת עבודה"],["progress","📊 התקדמות"],["hours","⏱️ שעות"],["clients","👥 לקוחות"],["reports","📄 דוחות"],["opissues","🔧 תקלות מפעיל"],["supply","📦 חומרים"]]
      : [["daily","📋 חלוקת עבודה"],["tasks","📌 משימות"],["adminreport","📝 דוח ידני"],["progress","📊 התקדמות"],["hours","⏱️ שעות"],["clients","👥 לקוחות"],["treatments","🔢 מספר טיפולים"],["reports","📄 דוחות"],["opissues","🔧 תקלות מפעיל"],["supply","📦 חומרים"],["users","👤 משתמשים"]];
    adminTabs.unshift(["dashboard","מחוונים"]);
    if (!isSubAdminPanel) adminTabs.push(["settings","⚙️ הגדרות"]);
    const pendingAdminTaskApprovals = tasks.filter(t=>t.adminApproval==="pending").length;
    const pendingSubReportApprovals = pendingSubReports.filter(item=>item?.status==="pending").length;
    const pendingLocalReportsCount = pending.filter(shouldKeepPendingReport).length;
    const adminIndicatorCounts = {
      daily: {red: pendingSubReportApprovals},
      tasks: {red: pendingAdminTaskApprovals},
      reports: {red: pendingLocalReportsCount},
      opissues: {red: dashboardCriticalIssues},
      supply: {blue: dailySupplyRows.length}
    };
    const adminDashboardBubbles = [
      {tab:"daily", icon:"📋", title:"חלוקת עבודה", value:operatorUsers.length, meta:"יצירת סדר יום למפעיל", tone:"#2563eb"},
      {tab:"tasks", icon:"📌", title:"משימות", value:dashboardOpenTasks, meta:"פתוחות לטיפול", tone:"#7c3aed", hidden:isSubAdminPanel},
      {tab:"adminreport", icon:"📝", title:"דוח ידני", value:"+", meta:"פתיחת דוח ללקוח", tone:"#4f46e5", hidden:isSubAdminPanel},
      {tab:"progress", icon:"📊", title:"התקדמות", value:`${dashboardDoneToday}/${dashboardTasksToday.length}`, meta:"ביצוע יומי", tone:"#0891b2"},
      {tab:"hours", icon:"⏱️", title:"שעות", value:workLogs.length, meta:"רישומי עבודה מקומיים", tone:"#64748b"},
      {tab:"clients", icon:"👥", title:"לקוחות", value:clients.length, meta:"ברשימת הלקוחות", tone:"#15803d"},
      {tab:"treatments", icon:"🔢", title:"מספר טיפולים", value:treatmentCounts.length || "-", meta:"ייטען בכניסה", tone:"#1d4ed8", hidden:isSubAdminPanel},
      {tab:"reports", icon:"📄", title:"דוחות", value:dashboardReportCount, meta:"טעונים כרגע", tone:"#0f766e"},
      {tab:"opissues", icon:"🔧", title:"תקלות", value:operatorIssues.length, meta:dashboardCriticalIssues ? `${dashboardCriticalIssues} קריטיות` : "לוח תקלות", tone:dashboardCriticalIssues ? C.red : "#c2410c"},
      {tab:"supply", icon:"📦", title:"חומרים", value:<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,width:"100%",maxWidth:120}}><div><div style={{fontSize:20,fontWeight:900,color:"#6a1b9a",lineHeight:1}}>{dashboardSupplyToday.phUpSupply}</div><div style={{fontSize:9,fontWeight:900,color:C.muted,marginTop:3}}>סודה אש</div></div><div><div style={{fontSize:20,fontWeight:900,color:C.red,lineHeight:1}}>{dashboardSupplyToday.acid}</div><div style={{fontSize:9,fontWeight:900,color:C.muted,marginTop:3}}>חומצת מלח</div></div></div>, meta:"נדרש לסיפוק היום", tone:"#b45309"},
      {tab:"users", icon:"👤", title:"משתמשים", value:allUsers.length, meta:"פעילים במערכת", tone:"#475569", hidden:isSubAdminPanel},
      {tab:"settings", icon:"⚙️", title:"הגדרות", value:"WA", meta:"מלל הודעות", tone:"#4f46e5", hidden:isSubAdminPanel}
    ].filter(b=>!b.hidden);
    const adminDisplayName = user?.name || user?.username || (isSubAdminPanel ? "סאב אדמין" : "מנהל");
    return (
      <div dir="rtl" className={isIOS ? "galileo-ios-vh" : undefined} style={{minHeight:"100vh",background:adminShellBg,fontFamily:"'Plus Jakarta Sans',sans-serif",paddingBottom:"calc(112px + env(safe-area-inset-bottom, 0px))"}}>
        <IPhoneComfortLayer/>
        <WelcomeMediaModal media={welcomeMedia} onClose={()=>setWelcomeMedia(null)}/>
        {activeOperatorDoneAlert&&(
          <div style={{position:"fixed",inset:0,zIndex:1220,display:"flex",alignItems:"center",justifyContent:"center",padding:18,background:"rgba(15,23,42,0.36)",backdropFilter:"blur(8px)"}}>
            <div style={{width:"100%",maxWidth:360,background:"rgba(255,255,255,0.98)",borderRadius:22,padding:20,border:"1px solid rgba(148,163,184,0.24)",boxShadow:"0 28px 80px rgba(15,23,42,0.28)",textAlign:"center"}}>
              <div style={{fontSize:34,marginBottom:8}}>✅</div>
              <div style={{fontSize:17,fontWeight:900,color:C.text,lineHeight:1.45,marginBottom:8}}>{activeOperatorDoneAlert.message || `${activeOperatorDoneAlert.operator || "מפעיל"} המפעיל סיים הכל להיום:)`}</div>
              <div style={{fontSize:12,fontWeight:800,color:C.muted,marginBottom:16}}>{fmtDate(activeOperatorDoneAlert.date || dailyDate)}</div>
              <Press onClick={()=>dismissOperatorDoneAlert(activeOperatorDoneAlert)} style={{padding:"12px 18px",borderRadius:14,background:C.blue,color:"#fff",fontWeight:900,fontSize:14,display:"inline-block",minWidth:120}}>סגור</Press>
            </div>
          </div>
        )}
        {criticalAdminIssue&&(()=>{
          const [id, operator, clientName, desc, priority, status, response, date] = criticalAdminIssue;
          return (
            <div style={{position:"fixed",inset:0,zIndex:1600,background:"rgba(0,0,0,0.68)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
              <div style={{width:"100%",maxWidth:420,background:"#fff",borderRadius:22,padding:18,boxShadow:"0 28px 90px rgba(0,0,0,0.42)",border:`3px solid ${C.red}`}}>
                <div style={{fontSize:24,fontWeight:900,color:C.red,marginBottom:6}}>🚨 תקלה קריטית</div>
                <div style={{fontSize:13,fontWeight:900,color:C.text,marginBottom:10}}>דורשת אישור מיידי לפני המשך עבודה</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                  <div style={{background:"#f5f9ff",borderRadius:12,padding:10}}><div style={{fontSize:10,fontWeight:800,color:C.muted}}>לקוח</div><div style={{fontSize:13,fontWeight:900,color:C.text}}>{clientName?.split(" - ")[0]}</div></div>
                  <div style={{background:"#f5f9ff",borderRadius:12,padding:10}}><div style={{fontSize:10,fontWeight:800,color:C.muted}}>מפעיל</div><div style={{fontSize:13,fontWeight:900,color:C.text}}>{operator}</div></div>
                </div>
                <div style={{background:"#ffebee",borderRadius:12,padding:"10px 12px",fontSize:13,color:C.red,fontWeight:800,lineHeight:1.5,marginBottom:12}}>{desc}</div>
                <Press onClick={()=>acknowledgeCriticalIssue(criticalAdminIssue, criticalAdminIssueIndex)} style={{padding:"14px",borderRadius:14,background:C.red,color:"#fff",fontWeight:900,fontSize:15,textAlign:"center",boxShadow:"0 6px 18px rgba(198,40,40,0.32)"}}>אשר טיפול מיידי</Press>
              </div>
            </div>
          );
        })()}
        {selectedSaltReport&&(
          <div style={{position:"fixed",inset:0,zIndex:1500,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setSelectedSaltReport(null)}>
            <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:380,background:"#fff",borderRadius:18,padding:16,boxShadow:"0 24px 70px rgba(0,0,0,0.35)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:12}}>
                <div style={{fontSize:16,fontWeight:900,color:C.text}}>מדידת מלח</div>
                <Press onClick={()=>setSelectedSaltReport(null)} style={{width:34,height:34,borderRadius:10,background:"#f0f4f8",color:C.muted,fontWeight:900,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</Press>
              </div>
              {[
                ["לקוח", selectedSaltReport.client?.split(" - ")[0]],
                ["מפעיל", selectedSaltReport.operator],
                ["תאריך", fmtDate(selectedSaltReport.reportDate)],
                ["רמת מלח", `${selectedSaltReport.salt || 0} PPM`],
                ["כלור", selectedSaltReport.chlorine],
                ["pH", selectedSaltReport.ph],
              ].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",gap:10,padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontSize:12,fontWeight:800,color:C.muted}}>{k}</span>
                  <span style={{fontSize:13,fontWeight:900,color:k==="מלח"?C.green:C.text}}>{v || "-"}</span>
                </div>
              ))}
              {selectedSaltReport.notes&&<div style={{marginTop:10,background:"#f5f9ff",borderRadius:10,padding:"9px 12px",fontSize:12,fontWeight:700,color:C.muted,lineHeight:1.5}}>📝 {selectedSaltReport.notes}</div>}
            </div>
          </div>
        )}
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');*{-webkit-tap-highlight-color:transparent;box-sizing:border-box;user-select:none;-webkit-user-select:none}input,textarea,select{user-select:text;-webkit-user-select:text}select option{background:#fff}`}</style>
        <div style={{margin:"12px 14px 0",background:adminHeroBg,border:"1px solid rgba(148,163,184,0.22)",borderRadius:28,padding:"22px 18px 20px",position:"relative",overflow:"hidden",boxShadow:"0 26px 70px rgba(37,99,235,0.12), 0 1px 0 rgba(255,255,255,0.82) inset",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative"}}>
            <div>
              <p style={{...adminSoftText,fontSize:12,fontWeight:800,margin:"0 0 4px",letterSpacing:"0.04em"}}>{isSubAdminPanel ? "פאנל סאב אדמין 🧩" : "פאנל ניהול 👔"}</p>
              <h1 style={{...adminHeroText,fontSize:28,fontWeight:900,margin:0,lineHeight:1.08}}>שלום, {adminDisplayName}</h1>
              {clientPlan.plan&&(
                <div style={{display:"flex",gap:6,marginTop:6}}>
                  <span style={{background:"rgba(30,64,175,0.14)",border:"1px solid rgba(37,99,235,0.18)",borderRadius:99,padding:"4px 11px",fontSize:11,fontWeight:900,color:C.blue}}>{clientPlan.plan==="PRO"?"💎 PRO":clientPlan.plan==="Basic"?"⚡ Basic":"🔬 ניסיון"}</span>
                  <span style={{background:clientPlan.status==="פעיל"?"rgba(21,128,61,0.10)":"rgba(185,28,28,0.10)",borderRadius:99,padding:"4px 11px",fontSize:11,fontWeight:900,color:clientPlan.status==="פעיל"?C.green:C.red}}>{clientPlan.status==="פעיל"?"✅ פעיל":"⛔ "+clientPlan.status}</span>
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <RefreshTopButton compact/>
              {adminTab==="dashboard" ? (
                <Press onClick={handleLogout} style={{background:"rgba(226,237,250,0.72)",backdropFilter:"blur(14px)",border:"1px solid rgba(148,163,184,0.22)",borderRadius:16,padding:"9px 12px",color:C.muted,fontSize:12,fontWeight:900}}>יציאה</Press>
              ) : (
                <Press onClick={()=>{setAdminTab("dashboard");window.scrollTo(0,0);haptic();}} style={{background:adminPrimaryGradient,border:"1px solid rgba(255,255,255,0.38)",borderRadius:16,padding:"9px 12px",color:"#fff",fontSize:12,fontWeight:900,boxShadow:"0 14px 32px rgba(79,70,229,0.24)"}}>מחוונים</Press>
              )}
            </div>
          </div>
        </div>
        <div style={{padding:"18px 16px 0"}}>
          <InstallAppCard compact/>
          <IOSInstallHint compact/>
          {adminTab==="dashboard"&&(
            <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(148px,1fr))",gap:12,marginBottom:14}}>
                {adminDashboardBubbles.map((b,i)=>(
                  <Press key={b.tab} onClick={()=>goAdminBubble(b.tab)} style={{position:"relative",minHeight:148,aspectRatio:"1 / 1",borderRadius:18,padding:16,background:`linear-gradient(145deg,rgba(255,255,255,0.94),${b.tone}18)`,border:`1px solid ${b.tone}30`,boxShadow:`0 18px 38px ${b.tone}16, 0 1px 0 rgba(255,255,255,0.90) inset`,display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",textAlign:"center",overflow:"hidden"}}>
                    <IndicatorBubbles red={adminIndicatorCounts[b.tab]?.red || 0} blue={adminIndicatorCounts[b.tab]?.blue || 0} />
                    <div style={{position:"absolute",inset:9,borderRadius:14,border:`1px solid ${b.tone}18`,pointerEvents:"none"}}/>
                    <div style={{width:42,height:42,borderRadius:"50%",background:`${b.tone}16`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,marginBottom:8}}>{b.icon}</div>
                    <div style={{fontSize:24,fontWeight:900,color:b.tone,lineHeight:1}}>{b.value}</div>
                    <div style={{fontSize:13,fontWeight:900,color:C.text,marginTop:7}}>{b.title}</div>
                    <div style={{fontSize:11,fontWeight:800,color:C.muted,marginTop:3,lineHeight:1.25}}>{b.meta}</div>
                  </Press>
                ))}
              </div>
              <div style={{...adminGlass({padding:"13px 15px",display:"flex",alignItems:"center",gap:10,marginBottom:14})}}>
                <div style={{width:34,height:34,borderRadius:"50%",background:"rgba(37,99,235,0.12)",color:C.blue,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900}}>i</div>
                <div style={{fontSize:12,fontWeight:800,color:C.muted,lineHeight:1.45}}>לחיצה על בועה פותחת את העמוד המקורי וטוענת רק אז את הנתונים המעודכנים שלו.</div>
              </div>
            </div>
          )}
          {adminTab==="settings"&&(
            <div>
              <div style={{...adminGlass({marginBottom:14})}}>
                <div style={{fontSize:18,fontWeight:900,color:C.text,marginBottom:6}}>מלל הודעת WhatsApp ללקוח</div>
                <div style={{fontSize:12,fontWeight:800,color:C.muted,marginBottom:10}}>הנתונים הדינמיים נשמרים דרך {"{reportDetails}"}</div>
                <textarea
                  value={waTemplateDraft}
                  onChange={e=>setWaTemplateDraft(e.target.value)}
                  rows={10}
                  style={{...inp,resize:"vertical",minHeight:210,whiteSpace:"pre-wrap",lineHeight:1.55,marginBottom:10}}
                />
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                  {[["{clientName}","שם לקוח"],["{operatorName}","שם מפעיל"],["{company}","שם חברה"],["{reportDetails}","פרטי הדוח"]].map(([token,label])=>(
                    <button key={token} type="button" onClick={()=>setWaTemplateDraft(v=>`${v}${v.endsWith("\n")||!v?"":" "}${token}`)} style={{border:"1px solid rgba(37,99,235,0.20)",background:"rgba(219,234,254,0.86)",color:C.blue,borderRadius:99,padding:"6px 10px",fontSize:11,fontWeight:900}}>{label} ({token})</button>
                  ))}
                </div>
                <div style={{fontSize:14,fontWeight:900,color:C.text,margin:"2px 0 6px"}}>מלל תזכורת טבלית כלור</div>
                <textarea
                  value={chlorineReminderMessageDraft}
                  onChange={e=>setChlorineReminderMessageDraft(e.target.value)}
                  rows={3}
                  style={{...inp,resize:"vertical",minHeight:78,whiteSpace:"pre-wrap",lineHeight:1.55,marginBottom:12}}
                />
                <div style={{fontSize:14,fontWeight:900,color:C.text,margin:"2px 0 6px"}}>מלל גובה מים לא תקין</div>
                <textarea
                  value={waterLevelNoticeMessageDraft}
                  onChange={e=>setWaterLevelNoticeMessageDraft(e.target.value)}
                  rows={3}
                  style={{...inp,resize:"vertical",minHeight:78,whiteSpace:"pre-wrap",lineHeight:1.55,marginBottom:12}}
                />
                <div style={{fontSize:14,fontWeight:900,color:C.text,margin:"2px 0 6px"}}>הודעת אספקת חומצת מלח</div>
                <textarea
                  value={acidSupplyMessageDraft}
                  onChange={e=>setAcidSupplyMessageDraft(e.target.value)}
                  rows={3}
                  style={{...inp,resize:"vertical",minHeight:78,whiteSpace:"pre-wrap",lineHeight:1.55,marginBottom:12}}
                />
                <div style={{fontSize:14,fontWeight:900,color:C.text,margin:"2px 0 6px"}}>הודעת אספקת מעלה pH</div>
                <textarea
                  value={phUpSupplyMessageDraft}
                  onChange={e=>setPhUpSupplyMessageDraft(e.target.value)}
                  rows={3}
                  style={{...inp,resize:"vertical",minHeight:78,whiteSpace:"pre-wrap",lineHeight:1.55,marginBottom:12}}
                />
                <div style={{fontSize:14,fontWeight:900,color:C.text,margin:"2px 0 6px"}}>הודעת אספקת שקי מלח</div>
                <textarea
                  value={saltSupplyMessageDraft}
                  onChange={e=>setSaltSupplyMessageDraft(e.target.value)}
                  rows={3}
                  style={{...inp,resize:"vertical",minHeight:78,whiteSpace:"pre-wrap",lineHeight:1.55,marginBottom:8}}
                />
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                  <button type="button" onClick={()=>setSaltSupplyMessageDraft(v=>`${v}${v.endsWith("\n")||!v?"":" "}{כמות}`)} style={{border:"1px solid rgba(37,99,235,0.20)",background:"rgba(219,234,254,0.86)",color:C.blue,borderRadius:99,padding:"6px 10px",fontSize:11,fontWeight:900}}>כמות שקים ({"{כמות}"})</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <Press onClick={saveWaMessageTemplate} style={{padding:"13px",borderRadius:14,background:actionStatus.saveWaTemplate==="success"?C.green:adminPrimaryGradient,color:"#fff",fontSize:13,fontWeight:900,textAlign:"center",boxShadow:"0 12px 28px rgba(79,70,229,0.22)"}}>
                    {actionLabel("saveWaTemplate",{idle:"שמור מלל",loading:"שומר...",success:"נשמר",error:"שגיאה"})}
                  </Press>
                  <Press onClick={resetWaMessageTemplate} style={{padding:"13px",borderRadius:14,background:"rgba(241,245,249,0.86)",color:C.muted,fontSize:13,fontWeight:900,textAlign:"center",border:`1px solid ${C.border}`}}>שחזר ברירת מחדל</Press>
                </div>
              </div>
              {(()=>{ const disabledClients = disabledWhatsAppClients(); const recipients = manualWaRecipients(); const baseClients = manualWaBaseClients(); const blockedSelected = baseClients.filter(c=>isWhatsAppDisabledForClient(c)); const missingPhoneSelected = baseClients.filter(c=>!isWhatsAppDisabledForClient(c) && !normalizeWhatsAppPhone(c.phone || clientPhone(c.name,clientId(c)))); const canSendManual = String(manualWaMessage||"").trim() && recipients.length && !isActionLoading("sendManualWa"); return (
              <div style={{...adminGlass({marginBottom:14})}}>
                <div style={{fontSize:18,fontWeight:900,color:C.text,marginBottom:6}}>הודעת WhatsApp יזומה</div>
                <div style={{fontSize:12,fontWeight:800,color:C.muted,marginBottom:10}}>שליחה חופשית בלבד, ללא דוח, סקר או תזכורת.</div>
                <textarea
                  value={manualWaMessage}
                  onChange={e=>setManualWaMessage(e.target.value)}
                  rows={4}
                  placeholder="כתוב כאן הודעה יזומה ללקוח..."
                  style={{...inp,resize:"vertical",minHeight:112,whiteSpace:"pre-wrap",lineHeight:1.55,marginBottom:12}}
                />
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <Press onClick={()=>{setManualWaSendAll(false);haptic();}} style={{padding:"11px",borderRadius:14,textAlign:"center",fontSize:13,fontWeight:900,border:`2px solid ${!manualWaSendAll?C.blue:C.border}`,background:!manualWaSendAll?"#e3f2fd":"#fff",color:!manualWaSendAll?C.blue:C.muted}}>לקוח אחד</Press>
                  <Press onClick={()=>{setManualWaSendAll(true);setManualWaClient("");setManualWaClientId("");setManualWaClientSearch("");haptic();}} style={{padding:"11px",borderRadius:14,textAlign:"center",fontSize:13,fontWeight:900,border:`2px solid ${manualWaSendAll?C.blue:C.border}`,background:manualWaSendAll?"#e3f2fd":"#fff",color:manualWaSendAll?C.blue:C.muted}}>שליחה לכולם</Press>
                </div>
                {!manualWaSendAll&&(
                  <div style={{position:"relative",marginBottom:12}}>
                    {manualWaClient?(
                      <div style={{...inp,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"default"}}>
                        <span style={{color:C.blue,fontWeight:800}}>🏊 {manualWaClient.split(" - ")[0]}{clientAddress(manualWaClient,manualWaClientId)?` · ${clientAddress(manualWaClient,manualWaClientId)}`:""}</span>
                        <span onClick={()=>{setManualWaClient("");setManualWaClientId("");setManualWaClientSearch("");}} style={{color:C.muted,cursor:"pointer",fontSize:16}}>✕</span>
                      </div>
                    ):(
                      <>
                        <input value={manualWaClientSearch} onChange={e=>setManualWaClientSearch(e.target.value)} placeholder="🔍 בחר לקוח לשליחה..." style={inp} autoComplete="off"/>
                        {manualWaClientSearch&&(
                          <div style={{position:"absolute",top:"100%",right:0,left:0,background:"#fff",borderRadius:12,boxShadow:"0 8px 24px rgba(0,0,0,0.15)",zIndex:120,maxHeight:240,overflowY:"auto",border:`1px solid ${C.border}`,marginTop:4}}>
                            {filterClientOptions(clients, manualWaClientSearch).map(c=>(
                              <Press key={clientId(c)} onClick={()=>{setManualWaClient(c.name);setManualWaClientId(clientId(c));setManualWaClientSearch("");setManualWaSendAll(false);haptic();}} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderBottom:`1px solid ${C.border}`,background:"#fff"}}>
                                <div style={{flex:1,minWidth:0}}><div style={{fontWeight:800,fontSize:13,color:C.text}}>{c.name.split(" - ")[0]}</div>{c.address&&<div style={{fontSize:11,color:C.muted}}>{c.address}</div>}<div style={{fontSize:11,color:isWhatsAppDisabledForClient(c)?C.red:C.muted}}>{isWhatsAppDisabledForClient(c)?"WhatsApp כבוי":(c.phone || "ללא טלפון")}</div></div>
                              </Press>
                            ))}
                            {filterClientOptions(clients, manualWaClientSearch).length===0&&<div style={{padding:"14px 16px",color:C.muted,fontSize:13}}>הקלד לפחות 2 אותיות מתחילת שם הלקוח</div>}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:12}}>
                  <Badge label={`נבחרו לשליחה: ${recipients.length}`} col={recipients.length?C.green:C.muted}/>
                  {blockedSelected.length>0&&<Badge label={`WhatsApp כבוי: ${blockedSelected.length}`} col={C.red}/>}
                  {missingPhoneSelected.length>0&&<Badge label={`ללא טלפון: ${missingPhoneSelected.length}`} col={C.orange}/>}
                  {manualWaLastResult&&<Badge label={`נשלחו ${manualWaLastResult.sent}/${manualWaLastResult.total}`} col={manualWaLastResult.failed?C.orange:C.green}/>}
                </div>
                <Press onClick={()=>canSendManual&&sendManualWhatsApp()} style={{padding:"13px",borderRadius:14,background:actionStatus.sendManualWa==="success"?C.green:actionStatus.sendManualWa==="error"?C.orange:adminPrimaryGradient,color:"#fff",fontSize:13,fontWeight:900,textAlign:"center",boxShadow:"0 12px 28px rgba(79,70,229,0.22)",opacity:canSendManual?1:0.55,marginBottom:12}}>
                  {actionLabel("sendManualWa",{idle:"שלח הודעה",loading:"שולח...",success:"נשלח",error:"שגיאה"})}
                </Press>
                <div style={{border:`1px solid ${C.border}`,borderRadius:14,background:"#f8fafc",padding:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:disabledClients.length?8:0}}>
                    <div style={{fontSize:12,fontWeight:900,color:C.text}}>לקוחות עם WhatsApp כבוי</div>
                    <Badge label={`${disabledClients.length}`} col={disabledClients.length?C.red:C.green}/>
                  </div>
                  {disabledClients.length>0?(
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",maxHeight:128,overflowY:"auto"}}>
                      {disabledClients.map(c=><span key={clientId(c)} title={c.address||""} style={{background:"#ffebee",color:C.red,borderRadius:99,padding:"5px 10px",fontSize:11,fontWeight:800}}>{c.name.split(" - ")[0]}{c.address?` · ${c.address}`:""}</span>)}
                    </div>
                  ):<div style={{fontSize:12,fontWeight:800,color:C.muted}}>אין לקוחות כבויים.</div>}
                </div>
              </div>
              ); })()}
              <div style={{...adminGlass({marginBottom:14,background:"rgba(255,255,255,0.82)"})}}>
                <div style={{fontSize:13,fontWeight:900,color:C.text,marginBottom:8}}>תצוגה מקדימה</div>
                <div style={{whiteSpace:"pre-wrap",fontSize:13,fontWeight:700,color:C.text,lineHeight:1.65,background:"#f8fafc",border:`1px solid ${C.border}`,borderRadius:14,padding:12}}>
                  {renderWaMessageTemplate(waTemplateDraft, {
                    clientName:"לקוח לדוגמה",
                    operatorName:user?.name || "מפעיל",
                    company:getCompany().name || "POOLMANG",
                    reportDetails:`✅ הבריכה מאוזנת ומוכנה לשימוש מלא\n\n📦 *חומרים לטיפול הבא:*\n${supplyDeliveryMessage("חומצת מלח, מעלה pH, מלח ×2", {
                      acid:acidSupplyMessageDraft,
                      phUp:phUpSupplyMessageDraft,
                      salt:saltSupplyMessageDraft
                    })}\n\n📝 הערת דוגמה`
                  })}
                </div>
              </div>
            </div>
          )}
          {adminTab==="adminreport"&&(
            <div>
              <div style={{...card({marginBottom:16,background:"#e3f2fd",border:`1px solid #90caf9`}),padding:"12px 16px",display:"flex",gap:10}}><span style={{fontSize:18}}>ℹ️</span><span style={{fontSize:12,color:C.blue,fontWeight:600}}>מלא דוח טיפול ידני — לכל לקוח</span></div>
              <div style={{marginBottom:14}}>
                <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>בחר לקוח</label>
                {form.client?(<div style={{...inp,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"default"}}><span style={{color:C.blue,fontWeight:700}}>🏊 {form.client.split(" - ")[0]}</span><span onClick={()=>{setForm(f=>({...f,client:"",clientId:""}));setAdminClientSearch("");}} style={{color:C.muted,cursor:"pointer",fontSize:16}}>✕</span></div>):(
                  <div style={{position:"relative"}}>
                    <input value={adminClientSearch} onChange={e=>setAdminClientSearch(e.target.value)} placeholder="🔍 חפש לקוח לפי שם, כתובת או מפעיל..." style={inp} autoComplete="off"/>
                    {adminClientSearch&&(
                      <div style={{position:"absolute",top:"100%",right:0,left:0,background:"#fff",borderRadius:12,boxShadow:"0 8px 24px rgba(0,0,0,0.15)",zIndex:100,maxHeight:260,overflowY:"auto",border:`1px solid ${C.border}`,marginTop:4}}>
                        {filterClientOptions(clients, adminClientSearch).map(c=>(
                          <Press key={clientId(c)} onClick={()=>{setForm(f=>({...f,client:c.name,clientId:clientId(c)}));setAdminClientSearch("");haptic();}} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderBottom:`1px solid ${C.border}`,background:"#fff"}}>
                            <div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff",flexShrink:0}}>🏊</div>
                            <div><div style={{fontWeight:700,fontSize:13,color:C.text}}>{c.name.split(" - ")[0]}</div><div style={{fontSize:11,color:C.muted}}>{[c.address,clientMetaLine(c)].filter(Boolean).join(" · ")||"ללא פרטי זיהוי נוספים"}</div></div>
                          </Press>
                        ))}
                        {filterClientOptions(clients, adminClientSearch).length===0&&<div style={{padding:"14px 16px",color:C.muted,fontSize:13}}>הקלד לפחות 2 אותיות מתחילת שם הלקוח</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <Press onClick={()=>{ if(!form.client){showToast("⚠️ בחר לקוח");return;} setEditingReport(null); setForm(f=>({...f,clientLocked:true,adminReport:true})); setScreen("form"); haptic("medium"); }} disabled={!form.client} style={{padding:"14px",borderRadius:14,background:form.client?`linear-gradient(135deg,${C.blue},${C.lightBlue})`:"#90caf9",color:"#fff",fontWeight:900,fontSize:15,textAlign:"center",boxShadow:form.client?"0 4px 14px rgba(21,101,192,0.3)":"none",marginBottom:8}}>📝 פתח דוח לאדמין</Press>
            </div>
          )}
          {adminTab==="daily"&&(
            <div>
              <div style={{...card({marginBottom:16})}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:12}}>
                  <div>
                    <h3 style={{fontSize:14,fontWeight:900,color:C.text,margin:"0 0 3px"}}>חדר בקרה יומי</h3>
                    <div style={{fontSize:11,color:C.muted,fontWeight:700}}>סדר נשמר ומסתנכרן למפעיל דרך Google Sheets</div>
                  </div>
                  <input type="date" value={taskDate} onClick={openDatePicker} onFocus={openDatePicker} onChange={e=>{setTaskDate(e.target.value);setAdminOrderRemovedClients([]); if(activeAdminOperator) loadAdminOrderDraft(e.target.value, activeAdminOperator);}} style={{...inp,maxWidth:132,fontSize:12,margin:0,color:C.blue,fontWeight:800,cursor:"pointer"}}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginBottom:12}}>
                  {progressData.map(({op,total,done,pending})=>(
                    <Press key={op.name} onClick={()=>{setSelectedAdminOperator(op.name);setAdminOrderRemovedClients([]);loadAdminOrderDraft(taskDate, op.name);haptic();}} style={{padding:"10px 12px",borderRadius:12,background:activeAdminOperator===op.name?"#e3f2fd":"#f5f9ff",border:`2px solid ${activeAdminOperator===op.name?C.lightBlue:C.border}`,textAlign:"right"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                        <span style={{fontSize:20}}>{op.icon}</span>
                        <span style={{fontSize:13,fontWeight:900,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{op.name}</span>
                      </div>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                        <Badge label={`${total} בריכות`} col={C.blue}/>
                        <Badge label={`${done} בוצעו`} col={C.green}/>
                        <Badge label={`${pending} ממתינות`} col={C.orange}/>
                      </div>
                    </Press>
                  ))}
                </div>
                {activeAdminOperator&&(
                  <div style={{borderTop:`1px solid ${C.border}`,paddingTop:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:10}}>
                      <div style={{fontSize:13,fontWeight:900,color:C.blue}}>סדר עבודה: {activeAdminOperator}</div>
                      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                        <Press onClick={loadDefaultAdminOrder} style={{padding:"7px 12px",borderRadius:10,background:"#e3f2fd",color:C.blue,fontSize:12,fontWeight:900,border:`1px solid ${C.lightBlue}`}}>טען</Press>
                        <Press disabled={isActionLoading("saveAdminOrder")} onClick={async()=>{
                          if(isActionLoading("saveAdminOrder")) return;
                          setAction("saveAdminOrder", "loading");
                          const sync=await syncAdminOrderTasks(taskDate, activeAdminOperator, adminOrderList);
                          if(!sync.success){
                            setAction("saveAdminOrder", "error", 2200);
                            showToast("לא ניתן לאמת את רשימת הסדרים - לא נשמר דבר");
                            haptic("medium");
                            return;
                          }
                          const clean=sync.clean;
                          setAdminOrderDraft(clean);
                          setAdminOrderSavedPulse(true);
                          setTimeout(()=>setAdminOrderSavedPulse(false),900);
                          setAction("saveAdminOrder", "success", 1500);
                          showToast("סדר נשמר, שולח התראה...");
                          haptic("success");
                          void (async()=>{
                            const opSent=await sendNotificationToOperators([activeAdminOperator], "סדר היום עודכן", `${clean.length} בריכות לתאריך ${fmtDate(taskDate)}`);
                            const assignedSub=subOperatorUsers.find(su=>isSameSubOperator(getAssignedSubOperator(taskDate, activeAdminOperator), su));
                            let subSent=0;
                            if(assignedSub?.username) subSent=await sendNotificationToSubOperators([assignedSub], "סדר היום עודכן", `סדר היום של ${activeAdminOperator} עודכן לתאריך ${fmtDate(taskDate)}`);
                            showToast(opSent>0||subSent>0?"התראה נשלחה":"התראה לא נשלחה");
                          })().catch(e=>{console.warn("Admin order notification failed", e);showToast("התראה לא נשלחה");});
                        }} style={{padding:"7px 12px",borderRadius:10,background:adminOrderSavedPulse?"linear-gradient(135deg,#16a34a,#22c55e)":C.green,color:"#fff",fontSize:12,fontWeight:900,transform:adminOrderSavedPulse?"scale(1.06)":"scale(1)",boxShadow:adminOrderSavedPulse?"0 0 0 4px rgba(34,197,94,.16),0 10px 24px rgba(22,163,74,.28)":"none",transition:"transform .18s ease, box-shadow .18s ease, background .18s ease",opacity:isActionLoading("saveAdminOrder")?0.72:1}}>
                          {actionLabel("saveAdminOrder",{idle:"שמור סדר ושלח למפעיל",loading:"מאמת ושומר...",success:"נשמר ✓",error:"נסה שוב"})}
                        </Press>
                      </div>
                    </div>
                    {subOperatorUsers.length>0&&<div style={{background:"rgba(241,247,255,0.72)",border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 12px",marginBottom:10}}>
                      <label style={{fontSize:11,fontWeight:900,color:C.muted,display:"block",marginBottom:6}}>שיוך עוזר מפעיל למפעיל זה</label>
                      <select value={getAssignedSubOperator(taskDate, activeAdminOperator)} onChange={e=>{void setAssignedSubOperator(taskDate, activeAdminOperator, e.target.value); showToast(e.target.value?"✅ עוזר מפעיל שויך":"שיוך עוזר מפעיל הוסר"); haptic("medium");}} style={{...sel,fontSize:12,margin:0}}>
                        <option value="">ללא עוזר מפעיל</option>
                        {subOperatorUsers.map((su,i)=><option key={`${su.username || ""}-${su.name || ""}-${i}`} value={su.username}>{su.name || su.username}</option>)}
                      </select>
                      <div style={{fontSize:10,fontWeight:800,color:C.muted,marginTop:6}}>העוזר יראה את סדר היום של {activeAdminOperator}. מילוי דוחות ייפתח רק אחרי אישור מפעיל.</div>
                    </div>}
                    <input value={adminOrderClientSearch} onChange={e=>setAdminOrderClientSearch(e.target.value)} placeholder="חפש מכל הלקוחות, הימים והמפעילים..." style={{...inp,fontSize:12,marginBottom:8}}/>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,margin:"10px 0 8px"}}>
                      <div style={{fontSize:12,fontWeight:900,color:C.green}}>נבחרו / משויכות להיום</div>
                      <Badge label={<span dir="ltr" style={{unicodeBidi:"isolate"}}>{selectedAdminOrderEntries.length}/{adminOrderAssignedTodayCount}</span>} col={C.green}/>
                    </div>
                    {adminOrderWaterCheckClients.length>0&&(
                      <div style={{margin:"0 0 10px"}}>
                        <div style={{fontSize:11,fontWeight:900,color:C.green,marginBottom:6}}>בדיקות מים</div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                          {adminOrderWaterCheckClients.map(c=>(
                            <span key={`water-check-admin-${clientId(c)}`} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minHeight:24,padding:"0 10px",borderRadius:99,background:"#e8f5e9",border:"1px solid #c8e6c9",color:C.green,fontSize:11,fontWeight:900,whiteSpace:"nowrap"}}>
                              {String(c.name || "").split(" - ")[0]}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedAdminOrderEntries.length===0&&<div style={{padding:18,borderRadius:12,background:"#f5f9ff",color:C.muted,fontSize:13,textAlign:"center",fontWeight:700,marginBottom:10}}>אין בריכות שנבחרו לסדר היום</div>}
                    {selectedAdminOrderEntries.map((entry)=>{
                      const i = adminOrderList.findIndex(x=>adminOrderClientKey(x)===adminOrderClientKey(entry));
                      const poolRecord = adminOrderClientRecord(entry);
                      const poolMeta = [poolRecord?.address,poolRecord?.poolType&&formatPoolType(poolRecord.poolType)].filter(Boolean).join(" · ");
                      const lowSaltWarning = hasLowSaltLight(entry.client, entry.clientId);
                      const waterCheckDaysText = formatWaterCheckDays((poolRecord || {}).waterCheckDays);
                      return (
                      <div key={`${entry.clientId || entry.client}-${i}`} draggable onDragStart={e=>e.dataTransfer.setData("text/plain", String(i))} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();moveAdminOrderItem(Number(e.dataTransfer.getData("text/plain")), i);}} style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 12px",marginBottom:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                          <input type="number" inputMode="numeric" min="1" value={entry.orderIndex || ""} onChange={e=>updateAdminOrderIndex(i, e.target.value)} onClick={e=>e.stopPropagation()} style={{width:42,height:32,borderRadius:999,background:"#e3f2fd",color:C.blue,border:`1px solid ${C.border}`,textAlign:"center",fontWeight:900,fontSize:14,flexShrink:0,outline:"none"}}/>
                          <div style={{flex:1,minWidth:0,fontSize:13,fontWeight:900,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{entry.client.split(" - ")[0]}</div>
                          {waterCheckDaysText&&<span style={{padding:"5px 10px",borderRadius:999,background:"#e8f5e9",border:"1px solid #c8e6c9",color:C.green,fontSize:11,fontWeight:900,whiteSpace:"nowrap"}}>בדיקת מים: {waterCheckDaysText}</span>}
                          {lowSaltWarning&&<span style={{padding:"5px 10px",borderRadius:999,background:"#fff7ed",border:"1px solid #fdba74",color:C.orange,fontSize:11,fontWeight:900,whiteSpace:"nowrap"}}>מלח נמוך</span>}
                          <Press onClick={(e)=>{e.stopPropagation();removeClientFromAdminOrder(entry);}} style={{padding:"5px 9px",borderRadius:8,background:"#ffebee",color:C.red,fontSize:12,fontWeight:900}}>הסר</Press>
                        </div>
                        {poolMeta&&<div style={{fontSize:10,color:C.muted,fontWeight:800,marginBottom:7,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{poolMeta}</div>}
                        <input value={entry.note || ""} onChange={e=>setAdminOrderDraft(adminOrderList.map((x,idx)=>idx===i?{...x,note:e.target.value}:x))} placeholder="הערה למפעיל לבריכה זו..." style={{...inp,fontSize:12,padding:"8px 10px",margin:0}}/>
                      </div>
                    )})}
                    <div style={{height:1,background:C.border,margin:"14px 0 10px",position:"relative"}}>
                      <span style={{position:"absolute",right:0,top:-10,background:"#f5f9ff",border:`1px solid ${C.border}`,borderRadius:99,padding:"2px 10px",fontSize:10,fontWeight:900,color:C.muted}}>לא נבחרו לסדר היום</span>
                    </div>
                    {unselectedAdminOrderClients.length===0&&<div style={{padding:16,borderRadius:12,background:"#f8fafc",color:C.muted,fontSize:13,textAlign:"center",fontWeight:700}}>אין בריכות נוספות ליום הזה</div>}
                    {unselectedAdminOrderClients.map(c=>{
                      const removed = adminOrderRemovedClients.some(item=>adminOrderClientKey(item)===adminOrderClientKey(c));
                      const waterCheckDaysText = formatWaterCheckDays(c.waterCheckDays);
                      return (
                      <Press key={clientId(c)} onClick={()=>addClientToAdminOrder(c)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"9px 12px",border:`1px solid ${removed?"#fbbf24":C.border}`,borderRadius:12,background:removed?"#fffbeb":"#fff",marginBottom:8}}>
                        <div style={{minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            <span style={{fontSize:13,fontWeight:800,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name.split(" - ")[0]}</span>
                            {waterCheckDaysText&&<span style={{padding:"3px 8px",borderRadius:999,background:"#e8f5e9",border:"1px solid #c8e6c9",color:C.green,fontSize:10,fontWeight:900,whiteSpace:"nowrap"}}>בדיקת מים: {waterCheckDaysText}</span>}
                          </div>
                          {c.address&&<div style={{fontSize:11,color:C.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.address}</div>}
                          <div style={{fontSize:11,color:C.blue,fontWeight:800,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginTop:2}}>
                            {clientMetaLine(c) || "ללא שיוך קבוע"}
                          </div>
                          {removed&&<div style={{fontSize:10,color:C.orange,fontWeight:900,marginTop:2}}>הוסר מהסדר ולא יישלח למפעיל</div>}
                        </div>
                        <Badge label={removed?"החזר":"הוסף"} col={removed?C.orange:C.blue}/>
                      </Press>
                    )})}
                  </div>
                )}
              </div>
            </div>
          )}
          {adminTab==="tasks"&&(
            <div>
              <div style={{...card({marginBottom:16})}}>
                <h3 style={{fontSize:14,fontWeight:800,color:C.text,margin:"0 0 14px"}}>{editTaskId?"✏️ עריכת משימה":"➕ הוספת משימות"}</h3>
                <div style={{marginBottom:10}}><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>תאריך</label><input type="date" value={taskDate} onChange={e=>setTaskDate(e.target.value)} style={inp}/></div>
                {!editTaskId&&(
                  <div style={{marginBottom:10}}>
                    <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>לקוחות <span style={{color:C.blue}}>({taskClients.length} נבחרו)</span></label>
                    <div style={{position:"relative",marginBottom:8}}><input value={taskClientSearch} onChange={e=>setTaskClientSearch(e.target.value)} placeholder="🔍 חפש מכל הלקוחות..." style={inp} autoComplete="off"/></div>
                    <div style={{maxHeight:200,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:12,background:"#f5f9ff"}}>
                      {filterClientOptions(taskClientOptions, taskClientSearch).map(c=>{
                        const selected = taskClients.find(x=>samePoolIdentity({client:x.name,clientId:x.clientId},{client:c.name,clientId:clientId(c)}));
                        return (
                          <Press key={clientId(c)} onClick={()=>{ haptic(); setTaskClients(prev=>selected?prev.filter(x=>!samePoolIdentity({client:x.name,clientId:x.clientId},{client:c.name,clientId:clientId(c)})):[...prev,{name:c.name,clientId:clientId(c),address:c.address||"",note:""}]); }} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:`1px solid ${C.border}`,background:selected?"#e3f2fd":"transparent"}}>
                            <div style={{width:22,height:22,borderRadius:6,border:`2px solid ${selected?C.blue:C.border}`,background:selected?C.blue:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{selected&&<span style={{color:"#fff",fontSize:13,fontWeight:900}}>✓</span>}</div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontWeight:700,fontSize:13,color:selected?C.blue:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name.split(" - ")[0]}</div>
                              <div style={{fontSize:11,color:C.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{clientMetaLine(c) || "ללא שיוך יום ומפעיל"}</div>
                              {c.address&&<div style={{fontSize:10,color:C.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",opacity:0.78}}>{c.address}</div>}
                            </div>
                          </Press>
                        );
                      })}
                    </div>
                    {taskClients.length>0&&(
                      <div style={{marginTop:10}}>
                        <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:8}}>לקוחות נבחרים — הוסף הערה לכל אחד:</div>
                        {taskClients.map((tc,i)=>(
                          <div key={tc.clientId || tc.name} style={{background:C.white,borderRadius:12,padding:"10px 12px",marginBottom:8,border:`1px solid ${C.border}`}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                              <span style={{fontWeight:800,fontSize:13,color:C.blue}}>🏊 {tc.name.split(" - ")[0]}</span>
                              <Press onClick={()=>setTaskClients(prev=>prev.filter(x=>!samePoolIdentity({client:x.name,clientId:x.clientId},{client:tc.name,clientId:tc.clientId})))} style={{color:C.muted,fontSize:16,padding:"0 4px"}}>✕</Press>
                            </div>
                            {tc.address&&<div style={{fontSize:10,color:C.muted,marginBottom:6}}>{tc.address}</div>}
                            {clientPoolTypeLabel(tc.name,tc.clientId)&&<div style={{fontSize:10,color:C.muted,marginBottom:6,fontWeight:800}}>{clientPoolTypeLabel(tc.name,tc.clientId)}</div>}
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
                    {taskClient?(<div style={{...inp,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"default"}}><span style={{color:C.blue,fontWeight:700}}>🏊 {[taskClient.split(" - ")[0],clientAddress(taskClient,taskClientId),clientPoolTypeLabel(taskClient,taskClientId)].filter(Boolean).join(" · ")}</span><span onClick={()=>{setTaskClient("");setTaskClientId("");setTaskClientSearch("");}} style={{color:C.muted,cursor:"pointer",fontSize:16}}>✕</span></div>):(
                      <div style={{position:"relative"}}>
                        <input value={taskClientSearch} onChange={e=>setTaskClientSearch(e.target.value)} placeholder="🔍 חפש לקוח..." style={inp} autoComplete="off"/>
                        {taskClientSearch&&<div style={{position:"absolute",top:"100%",right:0,left:0,background:"#fff",borderRadius:12,boxShadow:"0 8px 24px rgba(0,0,0,0.15)",zIndex:100,maxHeight:220,overflowY:"auto",border:`1px solid ${C.border}`,marginTop:4}}>{filterClientOptions(taskClientOptions, taskClientSearch).map(c=>(<div key={clientId(c)} onClick={()=>{setTaskClient(c.name);setTaskClientId(clientId(c));setTaskClientSearch("");haptic();}} style={{padding:"12px 16px",fontSize:14,fontWeight:600,color:C.text,cursor:"pointer",borderBottom:`1px solid ${C.border}`}}><div>{c.name.split(" - ")[0]}</div><div style={{fontSize:11,color:C.muted}}>{[c.address,clientMetaLine(c)].filter(Boolean).join(" · ")}</div></div>))}{filterClientOptions(taskClientOptions, taskClientSearch).length===0&&<div style={{padding:"14px 16px",color:C.muted,fontSize:13}}>הקלד לפחות 2 אותיות מתחילת שם הלקוח</div>}</div>}
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
                    const saved = await saveTask({date:taskDate,client:taskClient,clientId:taskClientId,operators:taskOps});
                    setAction("saveTasks", saved ? "success" : "error", saved ? 1500 : 2200);
                  } else {
                    if(!taskClients.length||!taskOps.length) { setAction("saveTasks", "idle"); return; }
                    const newTasksBatch = taskClients.map(tc=>({id:Date.now()+Math.floor(Math.random()*100000),date:taskDate.slice(0,10),client:tc.name,clientId:tc.clientId||clientIdByName(tc.name),operators:[...taskOps],status:"pending",adminApproval:"pending",requestedBy:user?.name||"",changeLog:[{at:nowStr(),note:tc.note||taskNote||"משימה ממתינה לאישור ושליחה",by:user?.name,needsAck:false,ackedBy:[]}]}));
                    const newTasks = [...tasks, ...newTasksBatch];
                    if(sheetId) {
                      const result = await sheetCall("mutateTasks",{upserts:newTasksBatch}).catch(()=>null);
                      if (!result?.success || !Array.isArray(result?.tasks)) {
                        setAction("saveTasks", "error", 2200);
                        showToast("המשימות לא נשמרו - נסה שוב");
                        haptic("medium");
                        return;
                      }
                      setTasks(result.tasks);
                    } else {
                      setTasks(newTasks);
                    }
                    setTaskClients([]); setTaskClientSearch(""); setTaskOps([]); setTaskNote("");
                    setAction("saveTasks", "success", 1500);
                    showToast(`✅ ${newTasksBatch.length} משימות נוצרו וממתינות לאישור`);
                    haptic("success");

                  }
                }} disabled={isActionLoading("saveTasks")||(editTaskId?(!taskClient||!taskOps.length):(!taskClients.length||!taskOps.length))} style={{padding:"13px",borderRadius:14,background:actionStatus.saveTasks==="success"?C.green:actionStatus.saveTasks==="warning"?C.orange:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:800,fontSize:14,textAlign:"center",boxShadow:`0 4px 14px rgba(21,101,192,0.3)`,opacity:(editTaskId?(!taskClient||!taskOps.length):(!taskClients.length||!taskOps.length))?0.5:1}}>
                  {actionStatus.saveTasks==="loading"?"⏳ שומר ושולח...":actionStatus.saveTasks==="success"?"✅ נשמר ונשלח":actionStatus.saveTasks==="warning"?"⚠️ נשמר, בדוק התראות":editTaskId?"אשר ושלח":taskClients.length>1?`➕ צור ${taskClients.length} משימות`:"➕ הוסף משימה"}
                </Press>
              </div>
              <h3 style={{fontSize:12,fontWeight:800,color:C.muted,letterSpacing:"0.1em",textTransform:"uppercase",margin:"0 0 12px"}}>משימות — {fmtDate(taskDate)}</h3>
              {dayTasks.length===0&&<div style={{...card({textAlign:"center"}),padding:24,color:C.muted,fontSize:14}}>אין משימות לתאריך זה</div>}
              {dayTasks.map((t,i)=>{
                const lastLog=t.changeLog?.[t.changeLog.length-1];
                const operatorNote = extractOperatorTaskNote(t);
                const primaryOp = String((t.operators || [])[0] || "");
                const prevPrimaryOp = i > 0 ? String((dayTasks[i-1]?.operators || [])[0] || "") : "";
                return (
                  <Fragment key={t.id}>
                    {primaryOp!==prevPrimaryOp&&<div style={{fontSize:12,fontWeight:900,color:C.blue,margin:"12px 0 8px",padding:"0 4px"}}>{primaryOp || "\u05dc\u05dc\u05d0 \u05de\u05e4\u05e2\u05d9\u05dc"}</div>}
                  <div style={{...card({marginBottom:10})}}>
                    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",alignItems:"start",gap:10,marginBottom:8}}>
                      <div style={{minWidth:0}}>
                        <div style={{fontWeight:800,fontSize:15,color:C.text,marginBottom:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.client.split(" - ")[0]}</div>
                        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{t.operators.map(op=>(<span key={op} style={{background:"#e3f2fd",color:C.blue,borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:700,display:"inline-flex",alignItems:"center",gap:4}}>{op}<span onClick={()=>removeOp(t.id,op)} style={{cursor:"pointer",opacity:0.7,fontSize:12}}>✕</span></span>))}</div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"minmax(54px,auto) 42px 92px",gap:6,alignItems:"start",justifyItems:"stretch"}}>
                        <div style={{minWidth:54,display:"flex",justifyContent:"center",paddingTop:4}}><Badge label={taskStatusLabel(t)} col={taskStatusColor(t)}/></div>
                        <Press onClick={()=>{setEditTaskId(t.id);setTaskClient(t.client);setTaskClientId(t.clientId||clientIdByName(t.client));setTaskOps(t.operators);setTaskDate(t.date);window.scrollTo(0,0);}} style={{width:42,height:32,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:10,background:"#e3f2fd",color:C.blue,fontSize:17,fontWeight:900,border:`1px solid ${C.border}`}}>✏️</Press>
                        <div style={{width:92,minHeight:58,display:"flex",flexDirection:"column",gap:4}}>
                            <Press onClick={()=>approveOperatorTaskRequest(t.id,true)} style={{width:"100%",height:32,padding:"0 8px",borderRadius:9,background:actionStatus[`approveTask:${t.id}`]==="success"?C.green:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontSize:11,fontWeight:900,whiteSpace:"nowrap",display:"flex",alignItems:"center",justifyContent:"center"}}>
                              {actionLabel(`approveTask:${t.id}`,{idle:"אשר ושלח",loading:"שולח...",success:"נשלח",error:"נסה שוב"})}
                            </Press>
                            {t.adminApproval==="pending"&&<Press onClick={()=>approveOperatorTaskRequest(t.id,false)} style={{width:"100%",height:22,padding:0,borderRadius:7,background:"#ffebee",color:C.red,fontSize:10,fontWeight:900,border:"1px solid #ffcdd2",display:"flex",alignItems:"center",justifyContent:"center"}}>דחה</Press>}
                        </div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <select defaultValue="" onChange={e=>{if(e.target.value){addOp(t.id,e.target.value);e.target.value="";}}} style={{...sel,flex:1,fontSize:12,padding:"7px 10px"}}><option value="">+ הוסף מפעיל</option>{opNames.filter(n=>!t.operators.includes(n)).map(n=><option key={n}>{n}</option>)}</select>
                      <Press onClick={async()=>{ if(!window.confirm("למחוק?"))return; const deletedTask=t; const n=tasks.filter(x=>x.id!==t.id); if(sheetId){const result=await sheetCall("mutateTasks",{deleteIds:[t.id]}).catch(()=>null);if(!result?.success||!Array.isArray(result?.tasks)){showToast("מחיקת המשימה נכשלה - נסה שוב");haptic("medium");return;}setTasks(result.tasks);}else{setTasks(n);}showToast("🗑️ משימה נמחקה");void sendNotificationToOperators(deletedTask.operators||[], "🗑️ משימה נמחקה", `${deletedTask.client?.split(" - ")[0] || ""} — ${fmtDate(deletedTask.date)}`).catch(e=>console.warn("Delete task notification failed",e));}} style={{padding:"7px 14px",borderRadius:10,background:"#ffebee",color:C.red,fontSize:12,fontWeight:700}}>🗑️</Press>
                    </div>
                    {operatorNote&&<OperatorNoteBox note={operatorNote} />}
                    {lastLog&&<div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`}}><TaskChangeInfo log={lastLog} operators={t.operators} /></div>}
                  </div>
                  </Fragment>
                );
              })}
            </div>
          )}
          {adminTab==="progress"&&(
            <div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}><label style={{fontSize:12,fontWeight:700,color:C.muted}}>תאריך:</label><input type="date" value={dailyDate} onClick={openDatePicker} onFocus={openDatePicker} onChange={e=>setDailyDate(e.target.value)} style={{...inp,maxWidth:160,color:C.blue,border:`1px solid ${C.lightBlue}`,fontWeight:700,cursor:"pointer"}}/></div>
              {progressData.map(({op,total,done,entries})=>(
                <div key={op.name} style={{...card({marginBottom:12})}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:total?14:0}}>
                    <span style={{fontSize:28}}>{op.icon}</span>
                    <div style={{flex:1}}><div style={{fontWeight:800,fontSize:15,color:C.text}}>{op.name}</div><div style={{color:C.muted,fontSize:11,marginTop:2}}>{total===0?"אין משימות היום":`${done} הושלמו · ${total-done} נותרו`}</div></div>
                    <Badge label={`${done}/${total}`} col={done===total&&total>0?C.green:C.blue}/>
                  </div>
                  {total>0&&<PBar done={done} total={total} label="בריכות"/>}
                  {entries.map((entry,i)=>(<div key={`${op.name}-${entry.clientId || entry.client}-${i}`} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderTop:`1px solid ${C.border}`,marginTop:8}}><span style={{color:C.muted,fontSize:13}}>{[entry.client.split(" - ")[0],clientAddress(entry.client,entry.clientId),clientPoolTypeLabel(entry.client,entry.clientId)].filter(Boolean).join(" · ")}</span><Badge label={entry.reported?"✓ דוח נוצר":"ממתין לדוח"} col={entry.reported?C.green:C.orange}/></div>))}
                </div>
              ))}
            </div>
          )}
          {adminTab==="qr"&&(
            <div>
              <div style={{...card({marginBottom:16,background:"#e3f2fd",border:`1px solid #90caf9`}),padding:"12px 16px",display:"flex",gap:10,alignItems:"flex-start"}}><span style={{fontSize:20}}>ℹ️</span><div style={{fontSize:12,color:C.blue,fontWeight:600,lineHeight:1.6}}>לכל לקוח יש QR ייחודי. המפעיל סורק אותו → הדוח נפתח אוטומטית. הדפס את ה-QR ושים אצל הלקוח.</div></div>
              {clients.map(c=>{ const poolId=clientId(c); return (<div key={poolId} style={{...card({marginBottom:10}),display:"flex",alignItems:"center",gap:14,textAlign:"right"}}><div style={{flex:1,minWidth:0}}><div style={{minHeight:24,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",justifyContent:"flex-start",marginBottom:2}}><div style={{fontWeight:800,fontSize:15,color:C.text}}>{c.name.split(" - ")[0]}</div><WhatsAppClientToggle client={c} compact/></div><div style={{fontSize:12,color:C.muted}}>📍 {c.address||c.name.split(" - ")[1]||""}</div></div><Press onClick={()=>setShowQRCode(showQRCode===poolId?null:poolId)} style={{height:32,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 14px",borderRadius:10,background:showQRCode===poolId?"#e3f2fd":C.border,color:showQRCode===poolId?C.blue:C.muted,fontWeight:700,fontSize:12}}>{showQRCode===poolId?"סגור":"📷 QR"}</Press></div>);})}
              {showQRCode&&(()=>{ const qrClient=findClientByName("",showQRCode); if(!qrClient)return null; const qrName=String(qrClient.name||"").split(" - ")[0]; const encoded = encodeURIComponent(qrName); const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}&bgcolor=ffffff&color=1565c0&margin=10`; return (<div style={{...card({border:`2px solid ${C.lightBlue}`,textAlign:"center"}),padding:20,marginBottom:16}}><div style={{fontWeight:800,fontSize:15,color:C.text,marginBottom:4}}>{qrName}</div>{qrClient.address&&<div style={{fontSize:11,color:C.muted,marginBottom:8}}>{qrClient.address}</div>}<img src={qrUrl} alt="QR" style={{width:180,height:180,borderRadius:12,marginBottom:12}}/><div style={{fontSize:11,color:C.muted,marginBottom:12}}>סרוק עם האפליקציה לפתיחת דוח</div><a href={qrUrl} download={`qr-${qrName}.png`} target="_blank" rel="noreferrer"><Press style={{padding:"10px 20px",borderRadius:10,background:`linear-gradient(135deg,${C.blue},${C.lightBlue})`,color:"#fff",fontWeight:700,fontSize:13,display:"inline-block"}}>⬇️ הורד QR</Press></a></div>); })()}
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
                  <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>טלפון *</label><input value={newClient.phone} onChange={e=>setNewClient(c=>({...c,phone:e.target.value}))} placeholder="05XXXXXXXX" style={inp} type="tel"/></div>
                  <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>כתובת *</label><input value={newClient.address} onChange={e=>setNewClient(c=>({...c,address:e.target.value}))} placeholder="רחוב הים 1" style={inp}/></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>קוד שער *</label><input value={newClient.gateCode} onChange={e=>setNewClient(c=>({...c,gateCode:e.target.value}))} placeholder="1234#" style={inp}/></div>
                  <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>ימים קבועים *</label><input value={newClient.regularDays} onChange={e=>setNewClient(c=>({...c,regularDays:e.target.value}))} placeholder="ראשון, שלישי" style={inp}/></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>מפעיל קבוע *</label><select value={newClient.regularOperator} onChange={e=>setNewClient(c=>({...c,regularOperator:e.target.value}))} style={sel}><option value="">ללא שיוך</option>{opNames.map(n=><option key={n}>{n}</option>)}</select></div>
                  <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>סוג בריכה *</label><select value={primaryPoolType(newClient.poolType)} onChange={e=>setNewClient(c=>({...c,poolType:setPoolTypePart(c.poolType,e.target.value)}))} style={sel}><option>מלח</option><option>כלור</option></select></div>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                  {["סקימר","גלישה"].map(pt=>(<Press key={pt} onClick={()=>setNewClient(c=>({...c,poolType:setPoolTypePart(c.poolType,pt)}))} style={{padding:"6px 12px",borderRadius:99,fontSize:12,fontWeight:800,background:secondaryPoolType(newClient.poolType)===pt?C.blue:"#f0f4f8",color:secondaryPoolType(newClient.poolType)===pt?"#fff":C.muted}}>{pt}</Press>))}
                </div>
                <WaterCheckDaysEditor value={newClient.waterCheckDays} onChange={value=>setNewClient(c=>({...c,waterCheckDays:value}))}/>
                <Press onClick={async()=>{ if(!newClient.name.trim()){showToast("⚠️ נא להזין שם לקוח");return;} const clientToAdd={clientId:makeClientId(),name:newClient.name.trim(),phone:newClient.phone.trim(),address:newClient.address.trim(),gateCode:newClient.gateCode.trim(),qrUrl:"",poolType:newClient.poolType||"מלח",regularDays:newClient.regularDays.trim(),regularOperator:newClient.regularOperator||"",waterCheckDays:normalizeWaterCheckDays(newClient.waterCheckDays)}; if(sheetId){const res=await sheetCall("saveClients",{clients:[clientToAdd]});if(!res?.success){showToast("⚠️ הוספת הבריכה נכשלה");haptic("medium");return;}} setClients(prev=>ensureClientIds([...prev,clientToAdd])); setNewClient({...emptyAdminClient}); showToast("✅ לקוח נוסף"); haptic("success"); }} style={{padding:"13px",borderRadius:14,background:"linear-gradient(135deg,#1d4ed8,#7c3aed)",color:"#fff",fontWeight:800,fontSize:14,textAlign:"center",boxShadow:"0 16px 36px rgba(79,70,229,0.24)"}}>➕ הוסף לקוח</Press>
              </div>
              <h3 style={{fontSize:12,fontWeight:800,color:C.muted,letterSpacing:"0.1em",textTransform:"uppercase",margin:"0 0 12px"}}>לקוחות קיימים — {clients.length}</h3>
              <div style={{position:"relative",marginBottom:12}}>
                <input value={clientListSearch} onChange={e=>setClientListSearch(e.target.value)} placeholder="🔍 חפש לקוח לפי שתי אותיות ראשונות..." style={{...inp,fontSize:13}}/>
              </div>
              {clients.length>0&&(()=>{
                const allClientsWhatsAppDisabled = clients.every(c=>isWhatsAppDisabledForClient(c));
                const disabledCount = clients.filter(c=>isWhatsAppDisabledForClient(c)).length;
                return (
                  <Press onClick={toggleWhatsAppForAllClients} style={{marginBottom:12,padding:"12px 14px",borderRadius:14,background:allClientsWhatsAppDisabled?"#ffebee":"#e8f5e9",border:`1px solid ${allClientsWhatsAppDisabled?"rgba(185,28,28,0.22)":"rgba(21,128,61,0.22)"}`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,color:allClientsWhatsAppDisabled?C.red:C.green,fontWeight:900,fontSize:13,boxShadow:"0 10px 24px rgba(15,23,42,0.06)"}}>
                    <span>{allClientsWhatsAppDisabled?"הפעל ווצאפ לכל הלקוחות":"כבה ווצאפ לכל הלקוחות"}</span>
                    <Badge label={`${disabledCount}/${clients.length} כבוי`} col={allClientsWhatsAppDisabled?C.red:C.green}/>
                  </Press>
                );
              })()}
              {(clientListSearch.trim().length>=2?filterClientOptions(clients, clientListSearch):sortByClientName(clients)).map((c)=>{ const missing=adminClientMissingFields(c); const poolId=clientId(c); const isEditing=editingAdminClient?.originalClientId===poolId; const draft=isEditing?editingAdminClient.draft:null; return (
                <div key={poolId} style={{...card({marginBottom:10,border:missing.length?"1px solid rgba(194,65,12,0.28)":"1px solid "+C.border})}}>
                  {!isEditing&&<>
                    <div style={{display:"flex",alignItems:"flex-start",gap:12,textAlign:"right"}}>
                      <div style={{width:42,height:42,borderRadius:14,background:"rgba(219,234,254,0.86)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{poolIconForType(c.poolType)}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{minHeight:24,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",justifyContent:"flex-start",marginBottom:6}}>
                          <div style={{fontWeight:900,fontSize:15,color:C.text}}>{clientDisplayName(c)}</div>
                          <WhatsAppClientToggle client={c} compact/>
                          {missing.length>0&&<span style={{minHeight:22,display:"inline-flex",alignItems:"center",justifyContent:"center",background:"rgba(255,247,237,0.9)",border:"1px solid rgba(194,65,12,0.24)",color:C.orange,borderRadius:99,padding:"0 9px",fontSize:10,fontWeight:900,lineHeight:1}}>פרטים חסרים</span>}
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:4}}>
                          {[["טלפון",c.phone],["כתובת",c.address],["קוד שער",c.gateCode],["יום קבוע",c.regularDays],["מפעיל קבוע",c.regularOperator],["סוג בריכה",formatPoolType(c.poolType)],["בדיקת מים",formatWaterCheckDays(c.waterCheckDays)||"לא מוגדר"]].map(([label,value])=>(
                            <div key={label} style={{background:"rgba(241,247,255,0.62)",border:"1px solid "+C.border,borderRadius:12,padding:"7px 8px",minWidth:0}}>
                              <div style={{fontSize:10,color:C.muted,fontWeight:800,marginBottom:2}}>{label}</div>
                              <div style={{fontSize:12,color:value?C.text:C.orange,fontWeight:900,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{value||"חסר"}</div>
                            </div>
                          ))}
                        </div>
                        {missing.length>0&&<div style={{fontSize:11,color:C.orange,fontWeight:800,marginTop:8}}>חסר: {missing.join(", ")}</div>}
                      </div>
                      {c.phone&&<a href={"tel:"+c.phone} style={{color:C.blue,fontSize:18,textDecoration:"none",paddingTop:4}}>📞</a>}
                    </div>
                    <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap",alignItems:"center"}}>
                      {["מלח","כלור","סקימר","גלישה"].map(pt=>(<Press key={pt} onClick={async()=>{ const nextType=setPoolTypePart(c.poolType,pt); if(sheetId){const res=await sheetCall("saveClientPoolType",{clientName:c.name,clientId:poolId,poolType:nextType});if(!res?.success){showToast("⚠️ עדכון סוג הבריכה נכשל");haptic("medium");return;}} setClients(prev=>prev.map(x=>clientId(x)===poolId?{...x,poolType:nextType}:x)); showToast("✅ "+clientDisplayName(c)+" — "+formatPoolType(nextType)); haptic(); }} style={{padding:"5px 12px",borderRadius:99,fontSize:11,fontWeight:800,background:(pt==="מלח"||pt==="כלור"?primaryPoolType(c.poolType)===pt:secondaryPoolType(c.poolType)===pt)?C.blue:"#f0f4f8",color:(pt==="מלח"||pt==="כלור"?primaryPoolType(c.poolType)===pt:secondaryPoolType(c.poolType)===pt)?"#fff":C.muted}}>{pt}</Press>))}
                      <Press onClick={()=>deleteAdminClient(c)} style={{marginInlineStart:"auto",padding:"6px 12px",borderRadius:12,background:"#ffebee",border:"1px solid rgba(185,28,28,0.18)",color:C.red,fontSize:12,fontWeight:900}}>🗑️ מחיקה</Press>
                      <Press onClick={()=>{setEditingAdminClient({originalClientId:poolId,originalName:c.name,draft:adminClientDraft(c)});haptic();}} style={{padding:"6px 12px",borderRadius:12,background:"rgba(219,234,254,0.86)",border:"1px solid "+C.border,color:C.blue,fontSize:12,fontWeight:900}}>✏️ עריכה</Press>
                    </div>
                  </>}
                  {isEditing&&<>
                    <div style={{fontSize:13,fontWeight:900,color:C.text,marginBottom:10}}>עריכת פרטי לקוח</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                      <div><label style={{fontSize:10,fontWeight:800,color:C.muted,display:"block",marginBottom:5}}>שם לקוח *</label><input value={draft.name} onChange={e=>setEditingAdminClient(x=>({...x,draft:{...x.draft,name:e.target.value}}))} style={inp}/></div>
                      <div><label style={{fontSize:10,fontWeight:800,color:C.muted,display:"block",marginBottom:5}}>טלפון *</label><input value={draft.phone} onChange={e=>setEditingAdminClient(x=>({...x,draft:{...x.draft,phone:e.target.value}}))} style={inp} type="tel"/></div>
                      <div><label style={{fontSize:10,fontWeight:800,color:C.muted,display:"block",marginBottom:5}}>כתובת *</label><input value={draft.address} onChange={e=>setEditingAdminClient(x=>({...x,draft:{...x.draft,address:e.target.value}}))} style={inp}/></div>
                      <div><label style={{fontSize:10,fontWeight:800,color:C.muted,display:"block",marginBottom:5}}>קוד שער *</label><input value={draft.gateCode} onChange={e=>setEditingAdminClient(x=>({...x,draft:{...x.draft,gateCode:e.target.value}}))} style={inp}/></div>
                      <div><label style={{fontSize:10,fontWeight:800,color:C.muted,display:"block",marginBottom:5}}>ימים קבועים *</label><input value={draft.regularDays} onChange={e=>setEditingAdminClient(x=>({...x,draft:{...x.draft,regularDays:e.target.value}}))} style={inp}/></div>
                      <div><label style={{fontSize:10,fontWeight:800,color:C.muted,display:"block",marginBottom:5}}>מפעיל קבוע *</label><select value={draft.regularOperator} onChange={e=>setEditingAdminClient(x=>({...x,draft:{...x.draft,regularOperator:e.target.value}}))} style={sel}><option value="">ללא שיוך</option>{opNames.map(n=><option key={n}>{n}</option>)}</select></div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                      <div><label style={{fontSize:10,fontWeight:800,color:C.muted,display:"block",marginBottom:5}}>סוג בריכה *</label><select value={primaryPoolType(draft.poolType)} onChange={e=>setEditingAdminClient(x=>({...x,draft:{...x.draft,poolType:setPoolTypePart(x.draft.poolType,e.target.value)}}))} style={sel}><option>מלח</option><option>כלור</option></select></div>
                      <div style={{display:"flex",gap:6,alignItems:"end"}}>{["סקימר","גלישה"].map(pt=>(<Press key={pt} onClick={()=>setEditingAdminClient(x=>({...x,draft:{...x.draft,poolType:setPoolTypePart(x.draft.poolType,pt)}}))} style={{flex:1,padding:"10px 6px",borderRadius:12,fontSize:11,fontWeight:900,background:secondaryPoolType(draft.poolType)===pt?C.blue:"#f0f4f8",color:secondaryPoolType(draft.poolType)===pt?"#fff":C.muted}}>{pt}</Press>))}</div>
                    </div>
                    <WaterCheckDaysEditor value={draft.waterCheckDays} onChange={value=>setEditingAdminClient(x=>({...x,draft:{...x.draft,waterCheckDays:value}}))}/>
                    <div style={{display:"flex",gap:8}}>
                      <Press onClick={()=>saveAdminClientDetails(editingAdminClient.originalClientId,editingAdminClient.originalName,draft)} style={{flex:1,padding:"11px",borderRadius:14,background:"linear-gradient(135deg,#1d4ed8,#7c3aed)",color:"#fff",fontSize:13,fontWeight:900,textAlign:"center"}}>שמור</Press>
                      <Press onClick={()=>{setEditingAdminClient(null);haptic();}} style={{padding:"11px 14px",borderRadius:14,background:"rgba(241,247,255,0.72)",border:"1px solid "+C.border,color:C.muted,fontSize:13,fontWeight:900}}>ביטול</Press>
                    </div>
                  </>}
                </div>
              );})}
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
                const quota = Number(row.monthlyTreatmentQuota || (doneCount + Number(row.monthlyTreatmentBalance || 0)) || 4);
                const balance = Number(row.monthlyTreatmentBalance ?? Math.max(0,quota-doneCount));
                return (
                  <div key={`${row.clientId || row.client}-${i}`} style={{...card({marginBottom:10})}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:10}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:900,fontSize:15,color:C.text}}>{String(row.client||"").split(" - ")[0]}</div>
                        {clientAddress(row.client,row.clientId)&&<div style={{fontSize:11,color:C.muted,marginTop:2}}>{clientAddress(row.client,row.clientId)}</div>}
                        <div style={{fontSize:12,color:C.muted,marginTop:3}}>{doneCount} טיפולים בפועל מתוך {quota} החודש</div>
                      </div>
                      <Badge label={`נותרו ${balance}`} col={balance===0?C.green:C.blue}/>
                    </div>
                    <PBar done={Math.min(doneCount,quota)} total={quota || 1} label="טיפולים"/>
                  </div>
                );
              })}
            </div>
          )}
          {adminTab==="reports"&&(
            <div>
              <div style={{...card({marginBottom:14})}}>
                <div style={{marginBottom:12,border:`1px solid ${C.border}`,borderRadius:14,background:"rgba(245,249,255,0.78)",padding:10}}>
                  <div style={{fontSize:12,fontWeight:900,color:C.blue,marginBottom:8}}>חיפוש דוחות כללי</div>
                  <input value={reportFilter} onChange={e=>setReportFilter(e.target.value)} placeholder="🔍 חפש לפי לקוח או מפעיל..." style={{...inp,marginBottom:0}}/>
                </div>
                <div style={{height:1,background:C.border,margin:"12px 0"}}/>
                <div style={{marginBottom:12,border:`1px solid ${C.border}`,borderRadius:14,background:"rgba(245,249,255,0.78)",padding:10}}>
                  <div style={{fontSize:12,fontWeight:900,color:C.blue,marginBottom:8}}>חיפוש מדידות מלח</div>
                  <input value={saltSearch} onChange={e=>setSaltSearch(e.target.value)} placeholder="חיפוש מדידות מלח לפי לקוח או מפעיל..." style={{...inp,marginBottom:0}}/>
                  {saltSearch.trim().length>=2&&(
                    <div style={{marginTop:8,maxHeight:190,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:12,background:"#fff"}}>
                      {(()=>{
                        const q = saltSearch.trim().toLowerCase();
                        const rows = [...sheetReports, ...reports.filter(r=>!r._fromSheet)]
                          .filter(r => primaryPoolType(findClientByName(r.client,r.clientId)?.poolType)!=="כלור" && Number.isFinite(measuredSaltPpm(r.salt)) && (String(r.client||"").toLowerCase().includes(q) || String(r.operator||"").toLowerCase().includes(q)))
                          .slice(0, 12);
                        if(!rows.length) return <div style={{padding:"12px 14px",fontSize:12,fontWeight:800,color:C.muted,textAlign:"center"}}>לא נמצאו מדידות מלח</div>;
                        return rows.map((r,i)=>(
                          <Press tag="button" key={`${r.id || r.client}-${i}`} onClick={()=>setSelectedSaltReport(r)} style={{display:"flex",width:"100%",alignItems:"center",justifyContent:"space-between",gap:8,padding:"10px 12px",border:`0`,borderTop:i?`1px solid ${C.border}`:"none",background:"#fff",fontFamily:"inherit",textAlign:"right"}}>
                            <div style={{minWidth:0}}>
                              <div style={{fontSize:13,fontWeight:900,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{String(r.client||"").split(" - ")[0]}</div>
                              <div style={{fontSize:11,fontWeight:700,color:C.muted}}>{r.operator} · {fmtDate(r.reportDate)}</div>
                            </div>
                            <Badge label={`${r.salt} PPM`} col={C.green}/>
                          </Press>
                        ));
                      })()}
                    </div>
                  )}
                </div>
                <div style={{height:1,background:C.border,margin:"12px 0"}}/>
                <div style={{marginBottom:10,border:`1px solid ${C.border}`,borderRadius:14,background:"rgba(245,249,255,0.78)",padding:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:9}}>
                    <div style={{fontSize:13,fontWeight:900,color:C.blue}}>רמת מלח לקוחות</div>
                    <Badge label={`מינימום ${Number(saltMinimum).toLocaleString("he-IL")} PPM`} col={C.blue}/>
                  </div>
                  <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 11px",marginBottom:9}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",marginBottom:7}}>
                      <label style={{display:"inline-flex",alignItems:"center",gap:7,fontSize:11,fontWeight:900,color:applySaltMinimumToReports?C.blue:C.muted,cursor:"pointer"}}>
                        <input type="checkbox" checked={applySaltMinimumToReports} onChange={e=>setApplySaltMinimumToReports(e.target.checked)} style={{width:18,height:18,margin:0,accentColor:C.blue}}/>
                        החל גם על הדוחות
                      </label>
                      <div style={{fontSize:11,fontWeight:900,color:C.text}}>סינון מדד מינימום</div>
                    </div>
                    <div dir="ltr" style={{display:"grid",gridTemplateColumns:"44px minmax(0,1fr) 44px",alignItems:"center",gap:8}}>
                      <button type="button" aria-label="הפחת מאה" title="הפחת 100" disabled={saltMinimum<=0} onClick={()=>{setSaltMinimum(value=>Math.max(0,value-100));haptic();}} style={{width:44,height:44,borderRadius:10,border:`1px solid ${C.border}`,background:"#f0f4f8",color:C.blue,fontSize:22,fontWeight:900,lineHeight:1,cursor:saltMinimum<=0?"not-allowed":"pointer",opacity:saltMinimum<=0?0.45:1}}>−</button>
                      <input
                        type="range"
                        min="0"
                        max="6000"
                        step="100"
                        value={saltMinimum}
                        onChange={e=>setSaltMinimum(Number(e.target.value))}
                        aria-label="סינון מדד מינימום למלח"
                        style={{width:"100%",margin:0,accentColor:C.blue}}
                      />
                      <button type="button" aria-label="הוסף מאה" title="הוסף 100" disabled={saltMinimum>=6000} onClick={()=>{setSaltMinimum(value=>Math.min(6000,value+100));haptic();}} style={{width:44,height:44,borderRadius:10,border:`1px solid ${C.border}`,background:"#e3f2fd",color:C.blue,fontSize:22,fontWeight:900,lineHeight:1,cursor:saltMinimum>=6000?"not-allowed":"pointer",opacity:saltMinimum>=6000?0.45:1}}>+</button>
                    </div>
                    <div style={{margin:"0 52px"}}>
                      <div dir="ltr" aria-hidden="true" style={{position:"relative",height:9,margin:"0 7px"}}>
                        {Array.from({length:13},(_,i)=>i*500).map(value=><span key={value} style={{position:"absolute",left:`${value/60}%`,top:1,width:1,height:value%1000===0?7:5,background:value%1000===0?"#94a3b8":"#cbd5e1",transform:"translateX(-0.5px)"}}/>)}
                      </div>
                      <div dir="ltr" aria-hidden="true" style={{display:"flex",justifyContent:"space-between",fontSize:9,fontWeight:800,color:C.muted}}>
                        {[0,2000,4000,6000].map(value=><span key={value}>{value.toLocaleString("he-IL")}</span>)}
                      </div>
                    </div>
                  </div>
                  <input value={lowSaltSearch} onChange={e=>setLowSaltSearch(e.target.value)} placeholder="חיפוש חופשי לפי לקוח, מפעיל או יום..." style={{...inp,marginBottom:8,background:"#fff"}}/>
                  {(()=>{
                    const q = lowSaltSearch.trim().toLowerCase();
                    const rows = latestMeasuredSaltReports()
                      .filter(r=>measuredSaltPpm(r.salt)<=saltMinimum)
                      .filter(r=>{
                        if(!q) return true;
                        const pool = findClientByName(r.client,r.clientId);
                        const dayText = fmtDate(r.reportDate);
                        return [r.client,r.operator,dayText,r.reportDate,pool?.address,pool?.poolType].some(value=>String(value||"").toLowerCase().includes(q));
                      })
                      .sort((a,b)=>measuredSaltPpm(a.salt)-measuredSaltPpm(b.salt) || String(a.client||"").localeCompare(String(b.client||""), "he"));
                    if(!rows.length) return <div style={{padding:"10px 12px",borderRadius:10,background:"#fff",fontSize:12,fontWeight:800,color:C.muted,textAlign:"center"}}>לא נמצאו בריכות מתחת למדד המינימום {Number(saltMinimum).toLocaleString("he-IL")} PPM</div>;
                    return <div style={{maxHeight:260,overflowY:"auto",borderRadius:10,background:"#fff",border:`1px solid ${C.border}`}}>
                      <div style={{padding:"7px 12px",fontSize:10,fontWeight:900,color:C.muted,background:"#f8fafc",borderBottom:`1px solid ${C.border}`}}>{rows.length} בריכות · המדידה האחרונה שנמדדה</div>
                      {rows.map((r,i)=>{
                        const pool = findClientByName(r.client,r.clientId);
                        const poolMeta = [pool?.address,pool?.poolType&&formatPoolType(pool.poolType)].filter(Boolean).join(" · ");
                        const ppm = measuredSaltPpm(r.salt);
                        return <Press tag="button" key={`${r.clientId || r.id || r.client}-${r.reportDate}-${i}`} onClick={()=>setSelectedSaltReport(r)} style={{display:"flex",width:"100%",alignItems:"center",justifyContent:"space-between",gap:8,padding:"10px 12px",border:0,borderTop:i?`1px solid ${C.border}`:"none",background:"#fff",fontFamily:"inherit",textAlign:"right"}}>
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:900,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{String(r.client||"").split(" - ")[0]}</div>
                            {poolMeta&&<div style={{fontSize:10,fontWeight:800,color:C.blue,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginTop:1}}>{poolMeta}</div>}
                            <div style={{fontSize:11,fontWeight:800,color:C.muted,marginTop:2}}>👤 {r.operator || "-"} · 📅 {fmtDate(r.reportDate)}</div>
                          </div>
                          <span style={{padding:"5px 10px",borderRadius:999,background:ppm<=2500?"#ffebee":"#e3f2fd",border:`1px solid ${ppm<=2500?"#ffcdd2":"#bbdefb"}`,color:ppm<=2500?C.red:C.blue,fontSize:11,fontWeight:900,whiteSpace:"nowrap"}}>{ppm.toLocaleString("he-IL")} PPM</span>
                        </Press>;
                      })}
                    </div>;
                  })()}
                </div>
                <div style={{height:1,background:C.border,margin:"12px 0"}}/>
                <div style={{border:`1px solid ${C.border}`,borderRadius:14,background:"rgba(245,249,255,0.78)",padding:10}}>
                  <div style={{fontSize:12,fontWeight:900,color:C.blue,marginBottom:8}}>סינון לפי תאריכים</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                    <div style={{minWidth:0}}><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>מתאריך</label><input type="date" value={reportDateFilter} onChange={e=>setReportDateFilter(e.target.value)} style={{...inp,minWidth:0}}/></div>
                    <div style={{minWidth:0}}><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>עד תאריך</label><input type="date" value={reportDateToFilter} onChange={e=>setReportDateToFilter(e.target.value)} style={{...inp,minWidth:0}}/></div>
                    <div style={{display:"flex",alignItems:"flex-end",minWidth:0}}>
                      <Press disabled={isActionLoading("loadReports")} onClick={async()=>{
                        if(isActionLoading("loadReports")) return;
                        setAction("loadReports", "loading");
                        showToast("⏳ טוען דוחות...");
                        const res = await sheetCall("getReports",{
                          fromDate:reportDateFilter || "",
                          toDate:reportDateToFilter || (reportDateFilter ? reportDateFilter : ""),
                          query:reportFilter || "",
                          limit:reportDateFilter || reportDateToFilter || reportFilter ? 500 : 250
                        });
                        if(Array.isArray(res?.reports)){
                          setSheetReports(res.reports);
                          setDataConnectionStatus("connected");
                          setAction("loadReports", "success", 1400);
                          showToast(res.reports.length ? `✅ ${res.reports.length} דוחות נטענו` : "לא נמצאו דוחות בטווח שנבחר");
                        }else{
                          setDataConnectionStatus("offline");
                          setAction("loadReports", "error", 2200);
                          showToast("טעינת הדוחות נכשלה · המידע השמור נשאר זמין");
                        }
                      }} style={{width:"100%",minWidth:0,padding:"12px 6px",borderRadius:14,background:actionStatus.loadReports==="error"?"#fff8e1":`linear-gradient(135deg,${C.blue},${C.lightBlue})`,border:actionStatus.loadReports==="error"?"1px solid #ffe082":"none",color:actionStatus.loadReports==="error"?C.orange:"#fff",fontWeight:800,fontSize:13,textAlign:"center",opacity:isActionLoading("loadReports")?0.72:1}}>
                        {actionLabel("loadReports",{idle:"🔄 טען מגיליון",loading:"טוען...",success:"נטען ✓",error:"נסה שוב"})}
                      </Press>
                    </div>
                  </div>
                </div>
              </div>
              {(()=>{
                const allReports = [...sheetReports, ...reports.filter(r=>!r._fromSheet)];
                const unique = allReports.filter((r, idx, arr)=>arr.findIndex(x=>sameReportIdentity(x, r))===idx);
                const filtered = unique.reverse().filter(r=>{
                  const d=toISODate(r.reportDate) || normalizeDate(r.reportDate);
                  const q=reportFilter.trim().toLowerCase();
                  const matchText = !q || String(r.client||"").toLowerCase().includes(q) || String(r.operator||"").toLowerCase().includes(q);
                  const matchFrom = !reportDateFilter || d>=reportDateFilter;
                  const matchTo = !reportDateToFilter || d<=reportDateToFilter;
                  const saltPpm = measuredSaltPpm(r.salt);
                  const matchSalt = !applySaltMinimumToReports || (Number.isFinite(saltPpm) && saltPpm<=saltMinimum);
                  return matchText && matchFrom && matchTo && matchSalt;
                });
                if(filtered.length===0) return <div style={{...card({textAlign:"center"}),padding:32,color:C.muted,fontSize:14}}>{applySaltMinimumToReports?`אין דוחות מתחת למדד המינימום ${Number(saltMinimum).toLocaleString("he-IL")} PPM`:'אין דוחות — לחץ "טען מגיליון"'}</div>;
                return filtered.map((r,i)=>{ const reportClient=findClientByName(r.client,r.clientId); const measurements=[
                  hasMeasurementValue(r.chlorine)&&["כלור",`${r.chlorine} ppm`,"#e3f2fd","#1565c0"],
                  !r.waterCheckOnly&&hasMeasurementValue(r.ph)&&["pH",r.ph,"#f3e5f5","#6a1b9a"],
                  !r.waterCheckOnly&&primaryPoolType(reportClient?.poolType)!=="כלור"&&hasMeasurementValue(r.salt)&&["רמת מלח",`${r.salt} PPM`,"#e8f5e9","#1b5e20"],
                  r.waterCheckOnly&&Number(r.chlora)>0&&["טבליות כלור",r.chlora,"#fff3e0","#e65100"],
                  r.waterCheckOnly&&Number(r.hth)>0&&["HTH",r.hth,"#e8eaf6","#283593"],
                  r.waterCheckOnly&&r.flow&&["זרימה",r.flow,"#e0f7fa",r.flow==="לא תקין"?C.red:"#006064"]
                ].filter(Boolean); return (
                  <div key={r.id || `${r.clientId || r.client}-${r.reportDate}-${i}`} style={{...card({marginBottom:12})}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}><div><div style={{fontWeight:800,fontSize:15,color:C.text}}>{r.client?.split(" - ")[0]}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{[reportClient?.address,formatPoolType(reportClient?.poolType)].filter(Boolean).join(" · ")}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>👤 {r.operator} · 📅 {fmtDate(r.reportDate)}</div></div><Badge label={r.waterCheckOnly?"💧 בדיקת מים":r.poolStatus==="מאוזנת"?"✅ מאוזנת":"⚠️ אחר"} col={r.waterCheckOnly?C.blue:r.poolStatus==="מאוזנת"?C.green:C.orange}/></div>
                    {measurements.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(88px,1fr))",gap:8,marginBottom:6}}>{measurements.map(([k,v,bg,col])=>(<div key={k} style={{background:bg,borderRadius:10,padding:"8px",textAlign:"center"}}><div style={{fontSize:10,fontWeight:700,color:"#90a4ae",marginBottom:2}}>{k}</div><div style={{fontSize:14,fontWeight:900,color:col}}>{v}</div></div>))}</div>}
                    {r.notes&&(()=>{ const noTreatmentNote = String(r.notes || "").includes("לא בוצע טיפול"); return <div style={{background:noTreatmentNote?"#ffebee":"#f5f9ff",border:noTreatmentNote?"1px solid #ffcdd2":"none",borderRadius:10,padding:"8px 12px",fontSize:12,color:noTreatmentNote?C.red:C.muted,fontWeight:noTreatmentNote?900:undefined}}>📝 {r.notes}</div>; })()}
                    {r.supplyLabel&&<div style={{marginTop:8,fontSize:11,color:C.blue,fontWeight:700}}>📦 {r.supplyLabel}</div>}
                  </div>
                );});
              })()}
            </div>
          )}
          {adminTab==="opissues"&&(
            <div>
              <div style={{...card({marginBottom:14,background:"#e3f2fd",display:"flex",alignItems:"center",gap:10}),padding:"12px 16px"}}><span style={{fontSize:16}}>🔄</span><span style={{fontWeight:700,fontSize:13,color:C.blue}}>תקלות נטענות אוטומטית ומתעדכנות כל 9 דקות</span></div>
              <div style={{...card({marginBottom:14})}}>
                <div style={{fontWeight:900,fontSize:13,color:C.text,marginBottom:12}}>חיפוש תקלות פתוחות</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>תאריך</label><input type="date" value={adminIssueSearch.date} onChange={e=>setAdminIssueSearch(s=>({...s,date:e.target.value}))} style={inp}/></div>
                  <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>שם לקוח</label><input value={adminIssueSearch.client} onChange={e=>setAdminIssueSearch(s=>({...s,client:e.target.value}))} placeholder="חיפוש לפי לקוח..." style={inp}/></div>
                </div>
              </div>
              {(()=>{
                const filteredIssues = operatorIssues
                  .map((iss, originalIndex)=>({iss, originalIndex}))
                  .filter(({iss})=>{
                    const [, , client, , , status, , date] = iss;
                    if (isIssueDone(status)) return false;
                    const issueDate = normalizeDate(date).slice(0,10);
                    const matchDate = !adminIssueSearch.date || issueDate === adminIssueSearch.date;
                    const q = normalizeName(adminIssueSearch.client);
                    const matchClient = !q || normalizeName(client).includes(q);
                    return matchDate && matchClient;
                  });
                if(filteredIssues.length===0) return <div style={{...card({textAlign:"center"}),padding:32,color:C.muted}}>אין תקלות פתוחות להצגה כרגע</div>;
                return filteredIssues.map(({iss, originalIndex})=>{ const [id,operator,client,desc,priority,status,response,date]=iss; const priColor=priority==="קריטי"?C.red:priority==="דחוף"?C.orange:C.blue; return (<div key={id || originalIndex} style={{...card({marginBottom:12,border:`2px solid ${priColor}22`})}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><div><div style={{fontWeight:800,fontSize:14,color:C.text}}>{client?.split(" - ")[0]}</div><div style={{fontSize:12,color:C.muted}}>👤 {operator} · 📅 {fmtDate(date)}</div></div><div style={{display:"flex",gap:5}}><span style={{background:priColor+"18",color:priColor,borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:800}}>{priority}</span><span style={{background:"#fff8e1",color:C.orange,borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:800}}>{status || "פתוח"}</span></div></div><div style={{fontSize:13,color:"#546e7a",marginBottom:10,lineHeight:1.5}}>{desc}</div>{response&&<div style={{background:"#e8f5e9",borderRadius:8,padding:"8px 12px",fontSize:12,color:C.green,fontWeight:700,marginBottom:8}}>✅ תגובת אדמין: {response}</div>}<div style={{display:"flex",gap:8}}>{["בטיפול","טופל"].map(s=>(<Press key={s} onClick={async()=>{ const updated=[...operatorIssues]; updated[originalIndex]=[...iss]; updated[originalIndex][5]=s; setOperatorIssues(updated); await sheetCall("updateOperatorIssue",{rowIndex:originalIndex+1,status:s}); showToast(`✅ עודכן ל-${s}`);haptic("success"); }} style={{padding:"7px 14px",borderRadius:99,fontSize:12,fontWeight:800,background:status===s?"#e8f5e9":"#f0f4f8",color:status===s?C.green:C.muted}}>{s}</Press>))}</div></div>); });
              })()}
            </div>
          )}
          {adminTab==="supply"&&(
            <div>
              <div style={{...card({marginBottom:14})}}>
                <div style={{fontWeight:800,fontSize:13,color:C.text,marginBottom:12}}>🔍 חיפוש חומרים שסופקו</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>מתאריך</label><input type="date" value={supplySearch.date} onChange={e=>setSupplySearch(s=>({...s,date:e.target.value}))} style={inp}/></div>
                  <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>עד תאריך</label><input type="date" value={supplySearch.dateTo} onChange={e=>setSupplySearch(s=>({...s,dateTo:e.target.value}))} style={inp}/></div>
                  <div><label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6}}>סוג חומר</label><select value={supplySearch.type} onChange={e=>setSupplySearch(s=>({...s,type:e.target.value}))} style={sel}><option value="">הכל</option><option>מעלה pH</option><option>חומצת מלח</option><option>מלח</option></select></div>
                </div>
              </div>
              <div style={{...card({marginBottom:14,background:"rgba(245,249,255,0.82)"})}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:12}}>
                  <div>
                    <div style={{fontWeight:900,fontSize:14,color:C.text}}>חומרים לסיפוק היום</div>
                    <div style={{fontSize:11,fontWeight:800,color:C.muted,marginTop:2}}>מופרד לפי מפעיל ושם לקוח</div>
                  </div>
                  <Badge label={`${dailySupplyRows.length} לקוחות`} col={dailySupplyRows.length ? C.orange : C.muted}/>
                </div>
                {dailySupplyRows.length===0&&<div style={{padding:"14px 12px",borderRadius:12,background:"rgba(226,237,250,0.72)",color:C.muted,fontSize:12,fontWeight:800,textAlign:"center"}}>אין חומרים לסיפוק היום</div>}
                {Object.entries(dailySupplyGroups).map(([operator, rows])=>(
                  <div key={operator} style={{border:`1px solid ${C.border}`,borderRadius:14,background:"rgba(255,255,255,0.70)",overflow:"hidden",marginTop:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,padding:"10px 12px",background:"rgba(226,237,250,0.70)",borderBottom:`1px solid ${C.border}`}}>
                      <div style={{fontSize:13,fontWeight:900,color:C.text}}>👤 {operator}</div>
                      <Badge label={`${rows.length}`} col={C.blue}/>
                    </div>
                    {rows.map((row,i)=>(
                      <div key={`${operator}-${row.clientId || row.client}-${i}`} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:10,alignItems:"center",padding:"10px 12px",borderTop:i?`1px solid ${C.border}`:"none"}}>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:900,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{row.client.split(" - ")[0]}</div>
                          {clientAddress(row.client,row.clientId)&&<div style={{fontSize:11,fontWeight:700,color:C.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginTop:2}}>📍 {clientAddress(row.client,row.clientId)}</div>}
                          {clientPoolTypeLabel(row.client,row.clientId)&&<div style={{fontSize:10,fontWeight:800,color:C.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginTop:2}}>{clientPoolTypeLabel(row.client,row.clientId)}</div>}
                        </div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
                          {row.materials.map(material=><span key={material} style={{background:material.includes("חומצת")?"#ffebee":material.includes("סודה")?"#f3e5f5":"#e8f5e9",color:material.includes("חומצת")?C.red:material.includes("סודה")?"#6a1b9a":C.green,borderRadius:99,padding:"4px 10px",fontSize:11,fontWeight:900,whiteSpace:"nowrap"}}>{material}</span>)}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {(()=>{ const allRep=[...sheetReports,...reports]; const unique=allRep.filter((r, idx, arr)=>arr.findIndex(x=>sameReportIdentity(x, r))===idx); const filtered=unique.filter(r=>{ const d=toISODate(r.reportDate) || normalizeDate(r.reportDate); if(supplySearch.date&&d<supplySearch.date)return false; if(supplySearch.dateTo&&d>supplySearch.dateTo)return false; return reportHasAllowedSupply(r) && reportMatchesSupplyType(r, supplySearch.type); }).sort((a,b)=>(toISODate(b.reportDate) || normalizeDate(b.reportDate)).localeCompare(toISODate(a.reportDate) || normalizeDate(a.reportDate))); if(filtered.length===0)return <div style={{...card({textAlign:"center"}),padding:32,color:C.muted}}>אין תוצאות — לחץ "טען מגיליון" בטאב דוחות</div>; return filtered.map((r,i)=>{ const labelText=allowedSupplyLabelParts(r.supplyLabel).join(", "); const poolMeta=[clientAddress(r.client,r.clientId),clientPoolTypeLabel(r.client,r.clientId)].filter(Boolean).join(" · "); return (<div key={i} style={{...card({marginBottom:10})}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><div><div style={{fontWeight:800,fontSize:14,color:C.text}}>{r.client?.split(" - ")[0]}</div>{poolMeta&&<div style={{fontSize:11,color:C.muted,marginTop:2}}>{poolMeta}</div>}<div style={{fontSize:12,color:C.muted}}>👤 {r.operator} · 📅 {fmtDate(r.reportDate)}</div></div></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{r.phUp>0&&<span style={{background:"#f3e5f5",color:"#6a1b9a",borderRadius:99,padding:"4px 12px",fontSize:12,fontWeight:700}}>מעלה pH כוסות: {r.phUp}</span>}{r.acidLiters>0&&<span style={{background:"#ffebee",color:C.red,borderRadius:99,padding:"4px 12px",fontSize:12,fontWeight:700}}>חומצת מלח L: {r.acidLiters}</span>}{labelText&&<span style={{background:"#e8f5e9",color:C.green,borderRadius:99,padding:"4px 12px",fontSize:12,fontWeight:700}}>{labelText}</span>}</div></div>); }); })()}
            </div>
          )}
          {adminTab==="users"&&(
            <div>
              {allUsers.map((u,i)=>{ const subRole=isSubOperatorRole(u.role); const adminRole=isAdminPanelRole(u.role); return <div key={`${u.username || ""}-${u.name || ""}-${i}`} style={{...card({marginBottom:10,display:"flex",alignItems:"center",gap:12})}}><span style={{fontSize:30}}>{u.icon}</span><div style={{flex:1}}><div style={{fontWeight:800,fontSize:15,color:C.text}}>{u.name}</div><div style={{color:C.muted,fontSize:12,marginTop:2}}>{u.username} · {u.phone}</div><div style={{color:"#b0bec5",fontSize:11,marginTop:2}}>"{u.welcomeMessage}"</div>{subRole&&rawLinkedOperatorValue(u)&&<div style={{color:C.blue,fontSize:11,fontWeight:900,marginTop:4}}>משויך ל: {resolveOperatorName(rawLinkedOperatorValue(u))}</div>}</div><Badge label={adminRole?"מנהל":subRole?"עוזר מפעיל":"מפעיל"} col={adminRole?C.orange:subRole?C.green:C.blue}/></div>;})}
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
