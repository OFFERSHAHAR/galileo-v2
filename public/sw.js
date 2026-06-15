const CACHE = "galileo-v2-cache-v14";
const STATIC = ["/", "/index.html", "/manifest.json"];
const DB_NAME = "galileo-sync-db";
const DB_VERSION = 1;
const REPORT_STORE = "pending-reports";
const REPORT_SYNC_TAG = "galileo-pending-reports";

if (!["localhost", "127.0.0.1", "::1"].includes(self.location.hostname)) {
  try {
    importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
  } catch (error) {
    console.warn("OneSignal service worker import failed", error);
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REPORT_STORE)) {
        db.createObjectStore(REPORT_STORE, { keyPath:"id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexeddb_open_failed"));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexeddb_request_failed"));
  });
}

async function readPendingRecords() {
  const db = await openDB();
  try {
    const transaction = db.transaction(REPORT_STORE, "readonly");
    return await requestResult(transaction.objectStore(REPORT_STORE).getAll());
  } finally {
    db.close();
  }
}

async function updatePendingRecordIfPresent(record) {
  const db = await openDB();
  try {
    const transaction = db.transaction(REPORT_STORE, "readwrite");
    const store = transaction.objectStore(REPORT_STORE);
    let updated = false;
    const request = store.get(record.id);
    request.onsuccess = () => {
      if (!request.result) return;
      updated = true;
      store.put(record);
    };
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("indexeddb_write_failed"));
      transaction.onabort = () => reject(transaction.error || new Error("indexeddb_write_aborted"));
    });
    return updated;
  } finally {
    db.close();
  }
}

async function postSheet(scriptUrl, sheetId, action, payload = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(scriptUrl, {
      method:"POST",
      headers:{"Content-Type":"text/plain"},
      body:JSON.stringify({ action, sheetId, ...payload }),
      signal:controller.signal
    });
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

const normalize = value => String(value ?? "").trim().toLowerCase();
const normalizeDate = value => String(value || "").trim().slice(0, 10);

function reportFoundInSheet(sheetReport = {}, report = {}) {
  const wantedId = normalize(report.id);
  const foundId = normalize(sheetReport.id);
  const identityMatches = wantedId && foundId
    ? wantedId === foundId
    : normalizeDate(sheetReport.reportDate) === normalizeDate(report.reportDate) &&
      normalize(sheetReport.operator) === normalize(report.operator) &&
      normalize(sheetReport.client) === normalize(report.client);
  if (!identityMatches) return false;
  const fields = ["chlorine","ph","salt","waterLevel","clarity","fat","flow","elModel","elSerial","elDate","elNext","supplyLabel","poolStatus","customStatusText","restrictedUntil","notes","chlora","hth","phUp","acidLiters","suppliedEquipment","clientId"];
  return fields.every(field => normalize(sheetReport[field]) === normalize(report[field]));
}

async function confirmSaved(record, report) {
  if (!record.scriptUrl || !record.sheetId || !report.client || !report.reportDate) return false;
  const response = await postSheet(record.scriptUrl, record.sheetId, "getReportStorageStatus", { report });
  return Array.isArray(response?.matches) && response.matches.some(item => item?.confirmed === true);
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type:"window", includeUncontrolled:true });
  clients.forEach(client => client.postMessage(message));
}

async function savePendingRecord(record) {
  const item = record.item || {};
  const report = item.report || item;
  if (!record.scriptUrl || !record.sheetId || !report?.client || !report?.reportDate) return false;
  if (item?.report && item.savedToSheet) return true;

  const original = item?.report ? item.updateOriginal : undefined;
  const supplyUpdate = item?.report ? item.supplyUpdate : undefined;
  const response = await postSheet(
    record.scriptUrl,
    record.sheetId,
    original ? "updateReport" : "saveReport",
    original ? { report, original, supplyUpdate } : { report, supplyUpdate }
  );
  if (response?.success !== true) return false;

  const serverId = normalize(response.id);
  const savedReport = serverId && serverId !== normalize(report.id) ? { ...report, id:String(response.id) } : report;
  if (!await confirmSaved(record, savedReport)) return false;

  const savedItem = item?.report
    ? { ...item, report:savedReport, savedToSheet:true }
    : { report:savedReport, savedToSheet:true };
  const updatedRecord = { ...record, item:savedItem, sheetSavedAt:Date.now(), updatedAt:Date.now() };
  const updated = await updatePendingRecordIfPresent(updatedRecord);
  if (updated) {
    await notifyClients({ type:"GALILEO_REPORT_SAVED_TO_SHEET", id:record.id, item:savedItem });
  }
  return true;
}

async function flushPendingReports() {
  const records = await readPendingRecords();
  let hasFailures = false;
  for (const record of records) {
    try {
      const saved = await savePendingRecord(record);
      if (!saved) hasFailures = true;
    } catch (error) {
      hasFailures = true;
      console.warn("Background report sheet save failed", error);
    }
  }
  if (hasFailures) {
    const registration = await self.registration;
    await registration.sync?.register?.(REPORT_SYNC_TAG).catch(() => null);
  }
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(STATIC.map(url => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("sync", event => {
  if (event.tag === REPORT_SYNC_TAG) event.waitUntil(flushPendingReports());
});

self.addEventListener("periodicsync", event => {
  if (event.tag === REPORT_SYNC_TAG) event.waitUntil(flushPendingReports());
});

self.addEventListener("message", event => {
  if (event.data?.type === "PROCESS_PENDING_REPORTS") event.waitUntil(flushPendingReports());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname === "/version.json") return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || (request.mode === "navigate" ? caches.match("/index.html") : undefined)))
  );
});
