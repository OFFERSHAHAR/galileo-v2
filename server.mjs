import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const dist = join(root, "dist");
const production = process.env.NODE_ENV === "production" || process.env.RENDER === "true";
const port = Number(process.env.PORT || 10000);
const appsScriptUrl = String(process.env.APPS_SCRIPT_URL || "").trim();
const backendSecret = String(process.env.BACKEND_PROXY_SECRET || "");
const ownerPassword = String(process.env.OWNER_PASSWORD || "");
const managementSheetId = String(process.env.MANAGEMENT_SHEET_ID || "").trim();
const ownerUsername = String(process.env.OWNER_USERNAME || "or").trim().toLowerCase();

const SESSION_COOKIE = "galileo_session";
const OWNER_COOKIE = "galileo_owner_session";
const USER_SESSION_MS = 12 * 60 * 60 * 1000;
const OWNER_SESSION_MS = 30 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;
const MAX_BODY_BYTES = 16 * 1024 * 1024;
const sessions = new Map();
const loginAttempts = new Map();
const ownerChallenges = new Map();
const licenseCache = new Map();

const OWNER_ACTIONS = new Set([
  "getLicenses", "saveLicense", "updateLicenseStatus", "getMgmtClients", "getMgmtIssues",
  "saveMgmtClient", "deleteMgmtClient", "updateMgmtClientStatus", "updateMgmtIssueStatus",
  "sendSuperMessage"
]);
const USER_MANAGEMENT_ACTIONS = new Set(["getSuperMessages", "replySuperMessage", "saveMgmtIssue"]);
const MIME = {
  ".css":"text/css; charset=utf-8", ".html":"text/html; charset=utf-8", ".ico":"image/x-icon",
  ".js":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8", ".png":"image/png",
  ".svg":"image/svg+xml", ".webp":"image/webp", ".woff":"font/woff", ".woff2":"font/woff2"
};

function requiredConfig() {
  const missing = [
    ["APPS_SCRIPT_URL", appsScriptUrl], ["BACKEND_PROXY_SECRET", backendSecret],
    ["OWNER_PASSWORD", ownerPassword], ["MANAGEMENT_SHEET_ID", managementSheetId]
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  if (!existsSync(dist)) throw new Error("dist directory is missing; run npm run build first");
}

function json(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store", ...extraHeaders });
  res.end(JSON.stringify(body));
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim().slice(0, 80);
}

function userAgent(req) {
  return String(req.headers["user-agent"] || "unknown").slice(0, 240);
}

function hash(value) {
  return createHash("sha256").update(String(value)).digest();
}

function safeEqual(left, right) {
  return timingSafeEqual(hash(left), hash(right));
}

function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

function cookies(req) {
  return String(req.headers.cookie || "").split(";").reduce((out, item) => {
    const at = item.indexOf("=");
    if (at > 0) out[item.slice(0, at).trim()] = decodeURIComponent(item.slice(at + 1).trim());
    return out;
  }, {});
}

function setSessionCookie(res, id, maxAgeMs, name = SESSION_COOKIE) {
  const secure = production ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${name}=${encodeURIComponent(id)}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}`);
}

function clearSessionCookie(res, name = SESSION_COOKIE) {
  const secure = production ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${name}=; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=0`);
}

function sameOrigin(req) {
  const origin = String(req.headers.origin || "");
  const host = String(req.headers.host || "");
  if (origin) {
    try { return new URL(origin).host === host; } catch { return false; }
  }
  return String(req.headers["sec-fetch-site"] || "") === "same-origin";
}

async function readBody(req, limit = MAX_BODY_BYTES) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("request_too_large"), { status:413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw Object.assign(new Error("invalid_json"), { status:400 }); }
}

async function callAppsScript(action, payload = {}, sheetId = managementSheetId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(appsScriptUrl, {
      method:"POST",
      headers:{ "Content-Type":"text/plain; charset=utf-8" },
      body:JSON.stringify({ action, sheetId, backendSecret, ...payload }),
      signal:controller.signal,
      redirect:"follow"
    });
    if (!response.ok) throw new Error(`apps_script_http_${response.status}`);
    const result = await response.json();
    if (result?.error === "unauthorized") throw new Error("apps_script_unauthorized");
    return result;
  } finally {
    clearTimeout(timer);
  }
}

function safeAuditDetails(details = {}) {
  const blocked = new Set(["password", "code", "backendSecret", "licenseKey", "key", "token", "session"]);
  return Object.fromEntries(Object.entries(details).filter(([name]) => !blocked.has(name)).map(([name, value]) => [name, String(value ?? "").slice(0, 300)]));
}

async function audit(event, details = {}, alert = false) {
  const safe = safeAuditDetails(details);
  console.log(JSON.stringify({ type:"security_audit", event, at:new Date().toISOString(), ...safe }));
  if (!alert || !appsScriptUrl || !backendSecret || !managementSheetId) return;
  try { await callAppsScript("securityAlert", { event, details:safe }); }
  catch (error) { console.error(JSON.stringify({ type:"security_alert_failed", event, error:String(error?.message || error).slice(0, 160) })); }
}

function attemptKey(scope, req, identity = "") {
  return `${scope}:${clientIp(req)}:${String(identity).trim().toLowerCase().slice(0, 100)}`;
}

function checkAttempt(scope, req, identity = "") {
  const key = attemptKey(scope, req, identity);
  const now = Date.now();
  let state = loginAttempts.get(key);
  if (!state || now - state.startedAt > LOGIN_WINDOW_MS) state = { startedAt:now, failures:0, lockedUntil:0 };
  loginAttempts.set(key, state);
  return { key, state, locked:state.lockedUntil > now, retryAfter:Math.max(0, state.lockedUntil - now) };
}

function recordFailure(key, state) {
  state.failures += 1;
  if (state.failures >= MAX_LOGIN_FAILURES) state.lockedUntil = Date.now() + LOGIN_LOCK_MS;
  loginAttempts.set(key, state);
  return state;
}

function clearFailures(key) {
  loginAttempts.delete(key);
}

function issueSession(req, res, data, ttlMs, cookieName = SESSION_COOKIE) {
  const id = randomToken();
  const now = Date.now();
  sessions.set(id, { ...data, createdAt:now, lastSeen:now, expiresAt:now + ttlMs, userAgentHash:hash(userAgent(req)).toString("hex") });
  setSessionCookie(res, id, ttlMs, cookieName);
  return sessions.get(id);
}

function getSession(req, kind = "user") {
  const id = cookies(req)[kind === "owner" ? OWNER_COOKIE : SESSION_COOKIE];
  const session = id ? sessions.get(id) : null;
  if (!session) return null;
  if (session.expiresAt <= Date.now() || session.userAgentHash !== hash(userAgent(req)).toString("hex")) {
    sessions.delete(id);
    return null;
  }
  session.lastSeen = Date.now();
  return { id, data:session };
}

function requireSession(req, kind = "user") {
  const session = getSession(req, kind);
  if (!session || session.data.kind !== kind) throw Object.assign(new Error("auth_required"), { status:401 });
  return session;
}

async function requireActiveLicense(session) {
  const cacheKey = `${session.data.licenseKey}:${session.data.sheetId}`;
  const cached = licenseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (!cached.valid) throw Object.assign(new Error("license_suspended"), { status:403 });
    return cached.data;
  }
  const result = await callAppsScript("validateLicense", { key:session.data.licenseKey });
  const valid = result?.valid === true && String(result.sheetId) === String(session.data.sheetId);
  licenseCache.set(cacheKey, { valid, data:result, expiresAt:Date.now() + 5000 });
  if (!valid) {
    sessions.delete(session.id);
    throw Object.assign(new Error("license_suspended"), { status:403 });
  }
  return result;
}

function sanitizePasswords(value) {
  if (Array.isArray(value)) return value.map(sanitizePasswords);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key.toLowerCase() !== "password").map(([key, item]) => [key, sanitizePasswords(item)]));
}

function revokeTenantSessions(result) {
  const targetSheetId = String(result?.license?.sheetId || result?.client?.sheetId || "");
  const targetKey = String(result?.license?.key || "");
  if (!targetSheetId && !targetKey) return 0;
  let revoked = 0;
  for (const [id, session] of sessions) {
    if (session.kind === "user" && ((targetSheetId && session.sheetId === targetSheetId) || (targetKey && session.licenseKey === targetKey))) {
      sessions.delete(id);
      revoked += 1;
    }
  }
  licenseCache.clear();
  return revoked;
}

function publicSession(session) {
  return session.data.kind === "owner"
    ? { kind:"owner", username:ownerUsername, expiresAt:session.data.expiresAt }
    : { kind:"user", user:sanitizePasswords(session.data.user), sheetId:session.data.sheetId, expiresAt:session.data.expiresAt };
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") return json(res, 200, { ok:true });
  if (req.method === "GET" && url.pathname === "/api/session") {
    const session = requireSession(req, "user");
    await requireActiveLicense(session);
    return json(res, 200, publicSession(session));
  }
  if (req.method === "GET" && url.pathname === "/api/owner/session") {
    const session = requireSession(req, "owner");
    return json(res, 200, publicSession(session));
  }
  if (req.method !== "POST") return json(res, 405, { error:"method_not_allowed" }, { Allow:"GET, POST" });
  if (!sameOrigin(req)) return json(res, 403, { error:"cross_site_request_blocked" });

  if (url.pathname === "/api/license") {
    const body = await readBody(req, 32 * 1024);
    const key = String(body.key || "").trim().toUpperCase();
    const attempt = checkAttempt("license", req, key);
    if (attempt.locked) return json(res, 429, { valid:false, reason:"יותר מדי ניסיונות. נסה שוב מאוחר יותר.", retryAfter:attempt.retryAfter });
    const result = await callAppsScript("validateLicense", { key });
    if (!result?.valid) {
      recordFailure(attempt.key, attempt.state);
      void audit("license_validation_failed", { ip:clientIp(req), keySuffix:key.slice(-4), userAgent:userAgent(req) }, true);
    } else clearFailures(attempt.key);
    return json(res, 200, sanitizePasswords(result));
  }

  if (url.pathname === "/api/login") {
    const body = await readBody(req, 64 * 1024);
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    const sheetId = String(body.sheetId || "").trim();
    const licenseKey = String(body.licenseKey || "").trim().toUpperCase();
    const attempt = checkAttempt("user", req, username);
    if (attempt.locked) {
      void audit("user_login_locked", { ip:clientIp(req), username, userAgent:userAgent(req) }, true);
      return json(res, 429, { error:"login_locked", retryAfter:attempt.retryAfter });
    }
    if (!username || !password || !sheetId || !licenseKey) return json(res, 400, { error:"missing_credentials" });
    const result = await callAppsScript("authenticateUser", { username, password, licenseKey }, sheetId);
    if (!result?.success || !result?.user) {
      recordFailure(attempt.key, attempt.state);
      void audit("user_login_failed", { ip:clientIp(req), username, sheetId, userAgent:userAgent(req) }, true);
      if (result?.error === "license_suspended") return json(res, 403, { error:"license_suspended", reason:"⛔ השירות מושהה — נא לפנות למנהל המערכת" });
      return json(res, 401, { error:"invalid_credentials" });
    }
    clearFailures(attempt.key);
    const user = sanitizePasswords(result.user);
    issueSession(req, res, { kind:"user", user, sheetId, licenseKey }, USER_SESSION_MS);
    void audit("user_login_success", { ip:clientIp(req), username, role:user.role || "", sheetId, userAgent:userAgent(req) }, username !== ownerUsername);
    return json(res, 200, { success:true, user });
  }

  if (url.pathname === "/api/owner/login") {
    const body = await readBody(req, 32 * 1024);
    const challengeId = String(body.challengeId || "");
    const code = String(body.code || "").replace(/\D/g, "");
    const attempt = checkAttempt("owner", req, ownerUsername);
    if (attempt.locked) {
      void audit("owner_login_locked", { ip:clientIp(req), userAgent:userAgent(req) }, true);
      return json(res, 429, { error:"login_locked", retryAfter:attempt.retryAfter });
    }
    if (challengeId && code) {
      const challenge = ownerChallenges.get(challengeId);
      if (!challenge || challenge.expiresAt <= Date.now() || challenge.ip !== clientIp(req) || challenge.userAgentHash !== hash(userAgent(req)).toString("hex") || !safeEqual(code, challenge.code)) {
        recordFailure(attempt.key, attempt.state);
        void audit("owner_code_failed", { ip:clientIp(req), userAgent:userAgent(req) }, true);
        return json(res, 401, { error:"invalid_code" });
      }
      ownerChallenges.delete(challengeId);
      clearFailures(attempt.key);
      issueSession(req, res, { kind:"owner", username:ownerUsername }, OWNER_SESSION_MS, OWNER_COOKIE);
      void audit("owner_login_success", { ip:clientIp(req), userAgent:userAgent(req) });
      return json(res, 200, { success:true, kind:"owner" });
    }
    if (!safeEqual(String(body.password || ""), ownerPassword)) {
      recordFailure(attempt.key, attempt.state);
      void audit("owner_password_failed", { ip:clientIp(req), userAgent:userAgent(req) }, true);
      return json(res, 401, { error:"invalid_credentials" });
    }
    ownerChallenges.clear();
    const id = randomToken(24);
    const ownerCode = String(randomBytes(4).readUInt32BE(0) % 1000000).padStart(6, "0");
    ownerChallenges.set(id, { code:ownerCode, ip:clientIp(req), userAgentHash:hash(userAgent(req)).toString("hex"), expiresAt:Date.now() + 5 * 60 * 1000 });
    const delivery = await callAppsScript("sendOwnerLoginCode", { code:ownerCode, ip:clientIp(req), userAgent:userAgent(req) });
    if (!delivery?.sent) {
      ownerChallenges.delete(id);
      return json(res, 503, { error:"security_alert_channel_unavailable" });
    }
    void audit("owner_code_sent", { ip:clientIp(req), userAgent:userAgent(req) });
    return json(res, 200, { challenge:true, challengeId:id, expiresIn:300 });
  }

  if (url.pathname === "/api/logout" || url.pathname === "/api/owner/logout") {
    const kind = url.pathname === "/api/owner/logout" ? "owner" : "user";
    const session = getSession(req, kind);
    if (session) {
      sessions.delete(session.id);
      void audit("logout", { kind:session.data.kind, username:session.data.user?.username || session.data.username || "", ip:clientIp(req) });
    }
    clearSessionCookie(res, kind === "owner" ? OWNER_COOKIE : SESSION_COOKIE);
    return json(res, 200, { success:true });
  }

  if (url.pathname === "/api/backend") {
    const body = await readBody(req);
    const action = String(body.action || "").trim();
    if (!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(action)) return json(res, 400, { error:"invalid_action" });
    let session;
    let sheetId;
    if (OWNER_ACTIONS.has(action)) {
      session = requireSession(req, "owner");
      sheetId = managementSheetId;
    } else if (USER_MANAGEMENT_ACTIONS.has(action)) {
      session = requireSession(req, "user");
      await requireActiveLicense(session);
      sheetId = managementSheetId;
    } else {
      session = requireSession(req, "user");
      await requireActiveLicense(session);
      sheetId = session.data.sheetId;
    }
    const payload = { ...body };
    delete payload.sheetId;
    delete payload.licenseKey;
    const result = await callAppsScript(action, payload, sheetId);
    const revoked = action === "updateLicenseStatus" || action === "updateMgmtClientStatus" ? revokeTenantSessions(result) : 0;
    if (OWNER_ACTIONS.has(action)) void audit("owner_action", { action, username:ownerUsername, ip:clientIp(req), revokedSessions:revoked }, action === "updateLicenseStatus" || action === "updateMgmtClientStatus");
    return json(res, 200, sanitizePasswords(result));
  }

  return json(res, 404, { error:"not_found" });
}

function securityHeaders(res) {
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.onesignal.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://*.onesignal.com wss://*.onesignal.com; worker-src 'self' blob:; manifest-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
}

function serveStatic(req, res, url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return json(res, 400, { error:"invalid_path" }); }
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = resolve(dist, normalize(requested));
  const distRoot = resolve(dist);
  let file = candidate.startsWith(distRoot + sep) && existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(dist, "index.html");
  const extension = extname(file).toLowerCase();
  res.setHeader("Content-Type", MIME[extension] || "application/octet-stream");
  res.setHeader("Cache-Control", file.endsWith("index.html") ? "no-store" : file.includes(`${sep}assets${sep}`) ? "public, max-age=31536000, immutable" : "public, max-age=300");
  createReadStream(file).on("error", () => json(res, 500, { error:"read_failed" })).pipe(res);
}

if (process.argv.includes("--self-test")) {
  if (!safeEqual("same", "same") || safeEqual("left", "right")) throw new Error("safeEqual self-test failed");
  const clean = sanitizePasswords({ password:"secret", nested:[{ Password:"secret", ok:true }] });
  if ("password" in clean || "Password" in clean.nested[0] || clean.nested[0].ok !== true) throw new Error("password sanitizer self-test failed");
  const state = { startedAt:Date.now(), failures:0, lockedUntil:0 };
  for (let i = 0; i < MAX_LOGIN_FAILURES; i++) recordFailure("self-test", state);
  if (state.lockedUntil <= Date.now()) throw new Error("login lock self-test failed");
  sessions.set("target", { kind:"user", sheetId:"tenant-a", licenseKey:"key-a" });
  sessions.set("other", { kind:"user", sheetId:"tenant-b", licenseKey:"key-b" });
  if (revokeTenantSessions({ license:{ sheetId:"tenant-a", key:"key-a" } }) !== 1 || sessions.has("target") || !sessions.has("other")) throw new Error("session revocation self-test failed");
  const appsScriptSource = readFileSync(join(root, "code.js"), "utf8");
  for (const action of ["updateLicenseStatus", "updateMgmtClientStatus"]) {
    const start = appsScriptSource.indexOf(`action === "${action}"`);
    const segment = appsScriptSource.slice(start, start + 900);
    if (start < 0 || segment.includes("deleteRow") || segment.includes("rowIndex + 1")) throw new Error(`${action} must suspend without deleting or shifting rows`);
  }
  console.log("Security self-test passed");
  process.exit(0);
}

requiredConfig();

const server = createServer(async (req, res) => {
  securityHeaders(res);
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
    else if (req.method === "GET" || req.method === "HEAD") serveStatic(req, res, url);
    else json(res, 405, { error:"method_not_allowed" });
  } catch (error) {
    const status = Number(error?.status || 500);
    if (status >= 500) console.error(JSON.stringify({ type:"request_error", path:url.pathname, error:String(error?.message || error).slice(0, 180) }));
    if (!res.headersSent) json(res, status, { error:status >= 500 ? "server_error" : String(error.message || "request_failed") });
    else res.end();
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Galileo secure server listening on ${port}`);
  if (process.env.RENDER === "true") void audit("deployment_started", {
    serviceId:process.env.RENDER_SERVICE_ID || "", serviceName:process.env.RENDER_SERVICE_NAME || "",
    branch:process.env.RENDER_GIT_BRANCH || "", commit:process.env.RENDER_GIT_COMMIT || "",
    instanceId:process.env.RENDER_INSTANCE_ID || ""
  }, true);
});

// ponytail: one Render instance means in-memory sessions and locks are sufficient.
// Move these maps to Render Key Value only when the service is scaled horizontally.
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) if (session.expiresAt <= now) sessions.delete(id);
  for (const [id, challenge] of ownerChallenges) if (challenge.expiresAt <= now) ownerChallenges.delete(id);
  for (const [key, state] of loginAttempts) if (now - state.startedAt > LOGIN_WINDOW_MS && state.lockedUntil <= now) loginAttempts.delete(key);
  for (const [key, item] of licenseCache) if (item.expiresAt <= now) licenseCache.delete(key);
}, 60_000).unref();
