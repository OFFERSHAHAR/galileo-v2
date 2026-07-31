const CACHE_PREFIX = "galileo-v2-cache-";
const CACHE = `${CACHE_PREFIX}v16`;
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

async function pendingRecordIsCurrent(record) {
  const db = await openDB();
  try {
    const transaction = db.transaction(REPORT_STORE, "readonly");
    const current = await requestResult(transaction.objectStore(REPORT_STORE).get(record.id));
    const recordRevision = String(record?.item?.queueRevision || "");
    const currentRevision = String(current?.item?.queueRevision || "");
    if (recordRevision || currentRevision) {
      return !!recordRevision && recordRevision === currentRevision;
    }
    return !!current && Number(current.updatedAt || 0) === Number(record.updatedAt || 0);
  } finally {
    db.close();
  }
}

async function updatePendingRecordIfPresent(record) {
  const db = await openDB();
  try {
    const transaction = db.transaction(REPORT_STORE, "readwrite");
    const store = transaction.objectStore(REPORT_STORE);
    let result = { updated:false, superseded:false, item:null };
    const request = store.get(record.id);
    request.onsuccess = () => {
      const existingRecord = request.result;
      if (!existingRecord) return;
      const existingItem = existingRecord.item?.report
        ? existingRecord.item
        : { report:existingRecord.item };
      const incomingItem = record.item?.report
        ? record.item
        : { report:record.item };
      const sourceUpdatedAt = Number(record.sourceUpdatedAt ?? record.updatedAt ?? 0);
      const sourceRevision = String(record?.item?.queueRevision || "");
      const existingRevision = String(existingItem?.queueRevision || "");
      const superseded = (
        (sourceRevision || existingRevision) &&
        (!sourceRevision || sourceRevision !== existingRevision)
      ) || Number(existingRecord.updatedAt || 0) > sourceUpdatedAt;
      if (superseded) {
        result = { updated:true, superseded:true, item:existingItem };
        return;
      }
      const mergedItem = {
        ...existingItem,
        ...incomingItem,
        report:incomingItem.report || existingItem.report,
        savedToSheet:!!(existingItem.savedToSheet || incomingItem.savedToSheet),
        whatsappSent:!!(existingItem.whatsappSent || incomingItem.whatsappSent),
        deliveryDecision:existingItem.deliveryDecision || incomingItem.deliveryDecision
      };
      result = { updated:true, superseded:false, item:mergedItem };
      store.put({
        ...existingRecord,
        ...record,
        item:mergedItem
      });
    };
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("indexeddb_write_failed"));
      transaction.onabort = () => reject(transaction.error || new Error("indexeddb_write_aborted"));
    });
    return result;
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
const samePool = (left = {}, right = {}) => {
  const leftId = normalize(left.clientId);
  const rightId = normalize(right.clientId);
  if (leftId || rightId) return !!leftId && !!rightId && leftId === rightId;
  return normalize(left.client) === normalize(right.client);
};

function reportFoundInSheet(sheetReport = {}, report = {}) {
  const wantedId = normalize(report.id);
  const foundId = normalize(sheetReport.id);
  const identityMatches = wantedId && foundId
    ? wantedId === foundId
    : normalizeDate(sheetReport.reportDate) === normalizeDate(report.reportDate) &&
      normalize(sheetReport.operator) === normalize(report.operator) &&
      samePool(sheetReport, report);
  if (!identityMatches) return false;
  const fields = ["chlorine","ph","salt","waterLevel","clarity","fat","flow","elModel","elSerial","elDate","elNext","supplyLabel","poolStatus","customStatusText","restrictedUntil","notes","chlora","hth","phUp","acidLiters","suppliedEquipment","clientId","waterCheckOnly"];
  return fields.every(field => normalize(sheetReport[field]) === normalize(report[field]));
}

async function confirmSaved(record, report) {
  if (!record.scriptUrl || !record.sheetId || !report.client || !report.reportDate) return false;
  const response = await postSheet(record.scriptUrl, record.sheetId, "getReportStorageStatus", { report });
  const wantedId = normalize(report.id);
  return Array.isArray(response?.matches) && response.matches.some(item =>
    item?.confirmed === true ||
    (!!wantedId && normalize(item?.id) === wantedId)
  );
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type:"window", includeUncontrolled:true });
  clients.forEach(client => client.postMessage(message));
}

async function savePendingRecord(record) {
  const item = record.item || {};
  const report = item.report || item;
  if (!record.scriptUrl || !record.sheetId || !report?.client || !report?.reportDate) return false;
  if (item?.editingPaused) return true;
  if (item?.report && item.savedToSheet) return true;
  if (!await pendingRecordIsCurrent(record)) return false;

  const original = item?.report ? item.updateOriginal : undefined;
  const supplyUpdate = item?.report ? item.supplyUpdate : undefined;
  const response = await postSheet(
    record.scriptUrl,
    record.sheetId,
    original ? "updateReport" : "saveReport",
    original
      ? {
          report,
          original,
          supplyUpdate,
          queueRevision:item.queueRevision,
          queueUpdatedAt:item.queueUpdatedAt
        }
      : {
          report,
          supplyUpdate,
          queueRevision:item.queueRevision,
          queueUpdatedAt:item.queueUpdatedAt
        }
  );
  if (response?.success !== true) return false;

  const serverId = normalize(response.id);
  const savedReport = serverId && serverId !== normalize(report.id) ? { ...report, id:String(response.id) } : report;
  if (!await confirmSaved(record, savedReport)) return false;

  const savedItem = item?.report
    ? { ...item, report:savedReport, savedToSheet:true, pendingStorageId:item.pendingStorageId || record.id }
    : { report:savedReport, savedToSheet:true, pendingStorageId:record.id };
  const updatedRecord = {
    ...record,
    item:savedItem,
    sourceUpdatedAt:Number(record.updatedAt || 0),
    sheetSavedAt:Date.now(),
    updatedAt:Date.now()
  };
  const updateResult = await updatePendingRecordIfPresent(updatedRecord);
  if (updateResult.updated && !updateResult.superseded) {
    await notifyClients({ type:"GALILEO_REPORT_SAVED_TO_SHEET", id:record.id, item:updateResult.item || savedItem });
  }
  return !updateResult.superseded;
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
    caches.open(CACHE)
      .then(cache => cache.addAll(STATIC))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
          .map(key => caches.delete(key))
      ))
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
  if (
    event.data?.type === "PROCESS_PENDING_REPORTS" &&
    self.registration.sync?.register
  ) {
    event.waitUntil(flushPendingReports());
  }
});

// Bundled assets have content hashes and can stay cache-first.
const IMMUTABLE = /^\/assets\//;

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

function staleWhileRevalidate(request, event) {
  const cachePromise = caches.open(CACHE);
  const network = cachePromise.then(cache =>
    fetch(request)
      .then(async response => {
        if (response.ok) await cache.put(request, response.clone());
        return response;
      })
      .catch(() => null)
  );

  event.waitUntil(network.then(() => undefined).catch(() => undefined));

  return cachePromise.then(async cache => {
    const cached = await cache.match(request);
    if (cached) return cached;
    return (await network) || (request.mode === "navigate" ? cache.match("/index.html") : undefined);
  });
}

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname === "/version.json") return;

  event.respondWith(
    (IMMUTABLE.test(url.pathname) ? cacheFirst(request) : staleWhileRevalidate(request, event))
      .catch(() => caches.match(request).then(cached => cached || (request.mode === "navigate" ? caches.match("/index.html") : undefined)))
  );
});
