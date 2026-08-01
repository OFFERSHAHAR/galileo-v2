  // ─── מרכזי — תומך בכל לקוח לפי sheetId ───────────────────────────────────
  // הלקוח משתף את הגיליון שלו עם האימייל שלך ומכניס את ה-ID באפליקציה

  var GALILEO_SCRIPT_BUILD_ = "20260801-secure-gateway-v1";
  var BACKEND_PROXY_SECRET_SHA256_ = "de93cb656ff2e8f74d83231532976b2daaa4a98099723fbee9a4ac05c6aa6477";

  function managementSpreadsheet_() {
    const id = PropertiesService.getScriptProperties().getProperty("MANAGEMENT_SHEET_ID") || "17jNBWSAkW17zfz4o2gY3wOsERa3_NAgSZ3b9HPkNspk";
    return SpreadsheetApp.openById(id);
  }

  function isBackendProxyAuthorized_(data) {
    const expected = String(PropertiesService.getScriptProperties().getProperty("BACKEND_PROXY_SECRET_SHA256") || BACKEND_PROXY_SECRET_SHA256_).toLowerCase();
    const provided = String(data && data.backendSecret || "");
    if (!expected || !provided) return false;
    const actual = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, provided, Utilities.Charset.UTF_8)
      .map(byte => ("0" + ((byte + 256) % 256).toString(16)).slice(-2)).join("");
    let different = expected.length ^ actual.length;
    for (let i = 0; i < Math.max(expected.length, actual.length); i++) different |= expected.charCodeAt(i % expected.length) ^ actual.charCodeAt(i % actual.length);
    return different === 0;
  }

  function publicUser_(user) {
    const blocked = { password:true, "סיסמה":true, "סיסמא":true };
    const clean = {};
    Object.keys(user || {}).forEach(key => {
      if (!blocked[String(key).toLowerCase()]) clean[key] = user[key];
    });
    return clean;
  }

  function publicUsers_(ss) {
    return getUsers_(ss).map(publicUser_);
  }

  function validateLicenseRequest_(data) {
    const key = String(data && data.key || "").trim().toUpperCase();
    if (!key) return { valid:false, reason:"מפתח לא תקין" };
    const mgmt = managementSpreadsheet_();
    const sheet = mgmt.getSheetByName("רישיונות");
    if (!sheet) return { valid:false, reason:"טבלת רישיונות לא נמצאה" };
    const rows = sheet.getDataRange().getValues();
    const row = rows.slice(1).find(r => String(r[0]).trim().toUpperCase() === key);
    if (!row) return { valid:false, reason:"מפתח לא תקין" };
    const sheetId = String(row[2] || "").trim();
    const licenseStatus = String(row[4] || "פעיל").trim();
    const clientsSheet = mgmt.getSheetByName("לקוחות");
    const client = clientsSheet
      ? clientsSheet.getDataRange().getValues().slice(1).find(r => String(r[7] || "").trim() === sheetId)
      : null;
    const clientStatus = String(client && client[6] || "פעיל").trim();
    if (licenseStatus === "מושהה" || clientStatus === "מושהה") {
      return { valid:false, reason:"⛔ השירות מושהה — נא לפנות למנהל המערכת", suspended:true };
    }
    const expiry = row[5] ? (row[5] instanceof Date ? Utilities.formatDate(row[5],"Asia/Jerusalem","dd/MM/yyyy") : String(row[5])) : "";
    const branding = getClientBrandingBySheetId_(sheetId);
    return { valid:true, company:String(branding.company || row[1] || ""), sheetId, plan:String(row[3] || "PRO"), status:licenseStatus, expiry, adminEmail:String(row[6] || ""), ...branding };
  }

  function authenticateUser_(data) {
    const license = validateLicenseRequest_({ key:data.licenseKey });
    if (!license.valid || String(data.sheetId || "").trim() !== license.sheetId) {
      return { success:false, error:license.suspended ? "license_suspended" : "invalid_credentials", reason:license.reason };
    }
    const username = String(data.username || "").trim().toLowerCase();
    const password = String(data.password || "");
    const user = getUsers_(SpreadsheetApp.openById(license.sheetId)).find(item =>
      String(item.username || "").trim().toLowerCase() === username && String(item.password || "") === password
    );
    if (!user || String(user.status || user.Status || user["סטטוס"] || "פעיל").trim() === "מושהה") {
      return { success:false, error:"invalid_credentials" };
    }
    return { success:true, user:publicUser_(user), license:{ sheetId:license.sheetId, key:String(data.licenseKey || "").trim().toUpperCase() } };
  }

  function sendOwnerLoginCode_(data) {
    const props = PropertiesService.getScriptProperties();
    const email = String(props.getProperty("SECURITY_ALERT_EMAIL") || Session.getEffectiveUser().getEmail() || "").trim();
    const ownerId = String(props.getProperty("SECURITY_OWNER_USER_ID") || "or").trim().toLowerCase();
    const code = String(data.code || "").replace(/\D/g, "");
    if (!/^\d{6}$/.test(code)) return { sent:false, error:"invalid_code" };
    let sent = false;
    if (email) {
      try {
        MailApp.sendEmail(email, "קוד כניסה מאובטח ל-Galileo", "קוד הכניסה החד-פעמי שלך: " + code + "\nהקוד תקף ל-5 דקות.");
        sent = true;
      } catch (e) {}
    }
    try {
      const push = sendAppNotificationToUser_({ externalUserId:ownerId, title:"קוד כניסה מאובטח", message:"קוד הכניסה: " + code + " (תקף ל-5 דקות)" }, managementSpreadsheet_());
      sent = sent || !!(push && (push.success || push.sent || Number(push.recipients || 0) > 0));
    } catch (e) {}
    return { sent:sent };
  }

  function securityAlert_(data) {
    const props = PropertiesService.getScriptProperties();
    const ss = managementSpreadsheet_();
    let sheet = ss.getSheetByName("SecurityAudit");
    if (!sheet) {
      sheet = ss.insertSheet("SecurityAudit");
      sheet.appendRow(["timestamp", "event", "details"]);
    }
    const event = String(data.event || "security_event").slice(0, 120);
    const details = JSON.stringify(data.details || {}).slice(0, 4000);
    sheet.appendRow([new Date(), event, details]);
    const message = event + "\n" + details;
    let sent = false;
    const email = String(props.getProperty("SECURITY_ALERT_EMAIL") || Session.getEffectiveUser().getEmail() || "").trim();
    if (email) {
      try { MailApp.sendEmail(email, "התראת אבטחה Galileo", message); sent = true; } catch (e) {}
    }
    try {
      const push = sendAppNotificationToUser_({ externalUserId:String(props.getProperty("SECURITY_OWNER_USER_ID") || "or"), title:"התראת אבטחה", message:message }, ss);
      sent = sent || !!(push && (push.success || push.sent || Number(push.recipients || 0) > 0));
    } catch (e) {}
    return { success:true, sent:sent };
  }

  function doPost(e) {
    const json = jsonResponse_;
    let writeSpreadsheet = null;
    let invalidateAfterWrite = false;
    try {
      const data = JSON.parse(e.postData.contents);
      const action = data.action;

      // Green API posts its own unsigned webhook. Every Galileo action must come
      // through the server proxy and carry the server-only secret.
      if (action && !isBackendProxyAuthorized_(data)) return json({ success:false, error:"unauthorized" });

      if (action === "validateLicense") return json(validateLicenseRequest_(data));
      if (action === "authenticateUser") return json(authenticateUser_(data));
      if (action === "sendOwnerLoginCode") return json(sendOwnerLoginCode_(data));
      if (action === "securityAlert") return json(securityAlert_(data));

      // sheetId מגיע מהאפליקציה — כל לקוח שולח את שלו
      const SHEET_ID = data.sheetId || "1NthErqOJOFHJ482q3zg2daFX9SGCFeByXjdoZxvV-no";

      // ponytail: the version probe is the app's most frequent call (it polls on a
      // timer) and only needs the ID string for its Properties key. openById costs
      // 300-500ms of spreadsheet binding for nothing, so answer before we pay it.
      if (action === "getOperatorRefreshVersion") {
        return json({ version: PropertiesService.getScriptProperties()
          .getProperty("operatorDataVersion:" + SHEET_ID) || "0" });
      }
      if (action === "getScriptBuild") {
        return json({ build: GALILEO_SCRIPT_BUILD_ });
      }

      // ponytail: these three take only `data` — they never read the sheet.
      // Routing them before openById saves 300-500ms of spreadsheet binding per send.
      if (action === "sendGreenApiWhatsApp") return json(sendGreenApiWhatsApp_(data));
      if (action === "resetGreenApiDeliveryGuard") return json(resetGreenApiDeliveryGuard_(data));
      if (action === "getGreenApiStatus") return json(getGreenApiStatus_());
      if (action === "ensureGreenApiPollWebhooks") return json(ensureGreenApiPollWebhooks_(data));

      const ss = SpreadsheetApp.openById(SHEET_ID);
      invalidateAfterWrite = operatorDataWriteActions_().indexOf(action) >= 0;
      if (invalidateAfterWrite) {
        writeSpreadsheet = ss;
        invalidateOperatorDataCaches_(ss);
      }

      if (
        action === "sendAppNotificationToUser" ||
        action === "sendNotificationToUser" ||
        action === "sendUserNotification"
      ) {
        return json(sendAppNotificationToUser_(data, ss));
      }

      if (
        action === "sendAppNotificationToAdmins" ||
        action === "sendNotificationToAdmins"
      ) {
        return json(sendAppNotificationToAdmins_(ss, data));
      }

      if (action === "syncAppNotificationUsers" || action === "syncOneSignalUsersFromSheet") {
        return json(syncAppNotificationUsers_(ss));
      }

      if (action === "sendGreenApiWhatsApp") {
        return json(sendGreenApiWhatsApp_(data));
      }

      if (action === "sendGreenApiPoll") {
        return json(sendGreenApiPoll_(data, ss));
      }

      if (action === "processChlorineReminders") {
        return json(sendDueChlorineTabletReminders_(ss));
      }

      if (action === "ensureGreenApiPollWebhooks") {
        return json(ensureGreenApiPollWebhooks_(data));
      }

      if (!action && data.typeWebhook === "incomingMessageReceived") {
        return json(handleGreenApiIncomingWebhook_(data, ss));
      }

      if (action === "getGreenApiStatus") {
        return json(getGreenApiStatus_());
      }

      if (action === "getClientSettings") {
        return json({ settings: getClientSettings_(ss) });
      }

      if (action === "getScriptDiagnostics") {
        const reportsSheet = ss.getSheetByName("דוחות");
        return json({
          build: GALILEO_SCRIPT_BUILD_,
          reportsSheetFound: !!reportsSheet,
          reportsLastRow: reportsSheet ? reportsSheet.getLastRow() : 0,
          reportsLastColumn: reportsSheet ? reportsSheet.getLastColumn() : 0,
          reportsReadColumns: reportsSheet
            ? Math.max(1, Math.min(reportsSheet.getLastColumn(), reportHeaders_().length))
            : 0
        });
      }

      if (action === "saveClientSettings") {
        return json(saveClientSettings_(ss, data.settings || {}));
      }

      if (action === "trackUsageEvent") {
        return json(trackUsageEvent_(ss, data.event || {}));
      }

      if (action === "getLicenses") {
        const sheet = ss.getSheetByName("רישיונות");
        if(!sheet) return json({ licenses:[] });
        const rows = sheet.getDataRange().getValues();
        return json({ licenses: rows.slice(1).filter(r=>r[0]) });
      }

      if (action === "saveLicense") {
        let sheet = ss.getSheetByName("רישיונות");
        if(!sheet) {
          sheet = ss.insertSheet("רישיונות");
          sheet.appendRow(["key","company","sheetId","plan","status","expiry","adminEmail"]);
        }
        sheet.appendRow(data.license);
        
        // Auto-setup client sheet with all tabs and columns
        const clientSheetId = data.license[2]; // sheetId is index 2
        try {
          const clientSS = SpreadsheetApp.openById(clientSheetId);
          setupClientSheet(clientSS);
        } catch(e) {
          Logger.log("Could not setup client sheet: " + e);
        }
        
        return json({ success:true });
      }

      if (action === "updateLicenseStatus") {
        const sheet = ss.getSheetByName("רישיונות");
        if(!sheet) return json({ error:"no sheet" });
        const rowIndex = Number(data.rowIndex);
        if (!Number.isInteger(rowIndex) || rowIndex < 2 || rowIndex > sheet.getLastRow()) return json({ success:false, error:"invalid_row" });
        const row = sheet.getRange(rowIndex, 1, 1, 7).getValues()[0];
        sheet.getRange(rowIndex, 5).setValue(data.status);
        return json({ success:true, license:{ key:String(row[0] || ""), sheetId:String(row[2] || ""), status:String(data.status || "") } });
      }

      if (action === "getMgmtClients") {
        const sheet = ss.getSheetByName("לקוחות");
        if(!sheet) return json({ clients: [] });
        const rows = sheet.getDataRange().getValues();
        return json({ clients: rows.slice(1).filter(r=>r[0]) });
      }

      if (action === "getMgmtIssues") {
        const sheet = ss.getSheetByName("תקלות");
        if(!sheet) return json({ issues: [] });
        const rows = sheet.getDataRange().getValues();
        return json({ issues: rows.slice(1).filter(r=>r[0]) });
      }

      if (action === "saveMgmtIssue") {
        const sheet = ss.getSheetByName("תקלות");
        if(!sheet) return json({ error: "no sheet" });
        sheet.appendRow(data.issue);
        return json({ success: true });
      }

      if (action === "saveMgmtClient") {
        const sheet = ss.getSheetByName("לקוחות");
        if(!sheet) return json({ error: "no sheet" });
        const rows = sheet.getDataRange().getValues();
        // Find row by ID
        const id = data.row[0];
        let found = false;
        for(let i=1; i<rows.length; i++){
          if(String(rows[i][0])===String(id)){
            sheet.getRange(i+1, 1, 1, data.row.length).setValues([data.row]);
            found = true; break;
          }
        }
        if(!found) sheet.appendRow(data.row);
        syncLicenseCompanyFromClient_(ss, data.row);
        return json({ success: true });
      }

      if (action === "deleteMgmtClient") {
        const sheet = ss.getSheetByName("לקוחות");
        if(!sheet) return json({ error: "no sheet" });
        sheet.deleteRow(data.rowIndex + 1);
        return json({ success: true });
      }

      if (action === "updateMgmtClientStatus") {
        const sheet = ss.getSheetByName("לקוחות");
        if(!sheet) return json({ error: "no sheet" });
        const rowIndex = Number(data.rowIndex);
        if (!Number.isInteger(rowIndex) || rowIndex < 2 || rowIndex > sheet.getLastRow()) return json({ success:false, error:"invalid_row" });
        const row = sheet.getRange(rowIndex, 1, 1, Math.max(8, sheet.getLastColumn())).getValues()[0];
        sheet.getRange(rowIndex, 7).setValue(data.status);
        return json({ success:true, client:{ id:String(row[0] || ""), sheetId:String(row[7] || ""), status:String(data.status || "") } });
      }

      if (action === "updateMgmtIssueStatus") {
        const sheet = ss.getSheetByName("תקלות");
        if(!sheet) return json({ error: "no sheet" });
        sheet.getRange(data.rowIndex, 6).setValue(data.status);
        if(data.note) sheet.getRange(data.rowIndex, 7).setValue(data.note);
        return json({ success: true });
      }

      if (action === "getSuperMessages") {
        return json(getSuperMessages_(ss, data));
      }

      if (action === "sendSuperMessage") {
        return json(sendSuperMessage_(ss, data));
      }

      if (action === "replySuperMessage") {
        return json(replySuperMessage_(ss, data));
      }

      if (action === "getUnassignedClients") {
        return json({ clients:getUnassignedClients_(ss) });
      }

    if (action === "getBootstrapData") {
      const cacheKey = "bootstrap:" + ss.getId();
      const cached = cacheGetBig_(cacheKey);
      if (cached) return json(cached);
      const result = buildBootstrapData_(ss);
      cachePutBig_(cacheKey, result, 21600);
      return json(result);
    }

    if (action === "getOperatorRefreshData") {
      const cacheKey = "operatorRefresh:" + ss.getId();
      const cached = cacheGetBig_(cacheKey);
      if (cached) return json(cached);
      const result = buildOperatorRefreshData_(ss);
      cachePutBig_(cacheKey, result, 21600);
      return json(result);
    }

    if (action === "getOperatorRefreshVersion") {
      return json({ version:getOperatorDataVersion_(ss) });
    }

    if (action === "saveClientPoolType") {
      const sheet = ss.getSheetByName("לקוחות");
      if(!sheet) return json({ error:"no sheet" });
      const rows = sheet.getDataRange().getValues();
      const headerRowIndex = findHeaderRowIndex_(sheet, ["שם_לקוח", "שם לקוח", "שם", "לקוח", "שם הלקוח"]);
      const headers = (rows[headerRowIndex] || []).map(h => String(h || "").trim());
      const nameIdx = headers.findIndex(isClientNameHeader_);
      const clientIdIdx = headers.findIndex(h => ["clientid","client_id","id"].includes(String(h || "").trim().toLowerCase()));
      const poolTypeIdx = headers.findIndex(h => ["סוג_בריכה","סוג בריכה","pooltype"].includes(String(h || "").trim().toLowerCase()));
      const wantedId = String(data.clientId || "").trim();
      const wantedName = normalizeReportValue_(data.clientName).toLowerCase();
      const matches = [];
      for(let i=headerRowIndex + 1;i<rows.length;i++){
        const rowId = clientIdIdx >= 0 ? String(rows[i][clientIdIdx] || "").trim() : "";
        const rowName = nameIdx >= 0 ? normalizeReportValue_(rows[i][nameIdx]).toLowerCase() : "";
        if ((wantedId && rowId === wantedId) || (!wantedId && wantedName && rowName === wantedName)) matches.push(i);
      }
      if (!matches.length) return json({ error:"client not found" });
      if (!wantedId && matches.length > 1) return json({ error:"ambiguous client name" });
      if (poolTypeIdx < 0) return json({ error:"pool type column not found" });
      sheet.getRange(matches[0] + 1, poolTypeIdx + 1).setValue(data.poolType);
      return json({ success:true });
      }

      if (action === "saveOperatorIssue") {
        const sheet = ss.getSheetByName("תקלות_מפעילים") || ss.insertSheet("תקלות_מפעילים");
        if(sheet.getLastRow()===0) sheet.appendRow(["id","מפעיל","לקוח","תיאור","דחיפות","סטטוס","תגובת_אדמין","תאריך"]);
        const duplicateRow = findDuplicateOperatorIssueRow_(sheet, data);
        if (duplicateRow) return json({ success:true, duplicate:true, row:duplicateRow });
        sheet.appendRow([String(data.localId || "").trim() || Date.now(), data.operator, data.client, data.desc, data.priority, "פתוח", "", data.date||new Date().toISOString().slice(0,10)]);
        if (String(data.priority || "") === "קריטי") {
          sendAppNotificationToAdmins_(ss, {
            title: "🚨 תקלה קריטית",
            message: `${data.client || ""} · מפעיל: ${data.operator || ""} · ${data.desc || ""}`
          });
        }
        return json({ success:true });
      }

      if (action === "getOperatorIssues") {
        const sheet = ss.getSheetByName("תקלות_מפעילים");
        if(!sheet) return json({ issues:[] });
        const rows = sheet.getDataRange().getValues();
        return json({ issues: rows.slice(1).filter(r=>r[0]) });
      }

      if (action === "getOperatorDoneAlerts") {
        return json({ alerts: getOperatorDoneAlerts_(ss, data) });
      }

      if (action === "saveOperatorDoneAlert") {
        return json(saveOperatorDoneAlert_(ss, data));
      }

      if (action === "dismissOperatorDoneAlert") {
        return json(dismissOperatorDoneAlert_(ss, data));
      }

      if (action === "updateOperatorIssue") {
        const sheet = ss.getSheetByName("תקלות_מפעילים");
        if(!sheet) return json({ error:"no sheet" });
        const row = sheet.getRange(data.rowIndex+1, 1, 1, 8).getValues()[0];
        const previousStatus = String(row[5] || "");
        sheet.getRange(data.rowIndex+1, 6).setValue(data.status);
        if(data.response) sheet.getRange(data.rowIndex+1, 7).setValue(data.response);
        const nextStatus = String(data.status || "");
        if ((nextStatus.indexOf("בטיפול") >= 0 || nextStatus.indexOf("˜™₪") >= 0) && previousStatus !== nextStatus) {
          notifyOperatorIssueAcknowledged_(ss, row, data.response);
        }
        if ((nextStatus.indexOf("טופל") >= 0 || nextStatus.indexOf("˜•₪") >= 0) && previousStatus !== nextStatus) {
          notifyOperatorIssueDone_(ss, row, data.response);
        }
        return json({ success:true });
      }

      if (action === "getUsers") {
        return json({ users: publicUsers_(ss) });
      }

      if (action === "saveSubOperatorAssignment") {
        return json(saveSubOperatorAssignment_(ss, data));
      }

      if (action === "getClients") {
        return json({ clients: getClients_(ss) });
      }

      if (action === "getTreatmentCounts") {
        return json({ treatments: refreshMonthlyTreatmentCounters_(ss) });
      }

      if (action === "getTasks") {
        return json({ tasks: getTasks_(ss) });
      }

      if (action === "saveTasks") {
        return json(withGalileoWriteLock_(function () {
          return { success:true, tasks:saveTasks_(ss, data.tasks || []) };
        }));
      }

      if (action === "mutateTasks") {
        return json(withGalileoWriteLock_(function () {
          return mutateTasks_(ss, data);
        }));
      }

      if (action === "setTaskReportCompletion") {
        return json(withGalileoWriteLock_(function () {
          return setTaskReportCompletion_(ss, data);
        }));
      }

      if (action === "getAdminOrders") {
        return json({ adminOrders: getAdminOrders_(ss) });
      }

      if (action === "saveAdminOrders") {
        return json(withGalileoWriteLock_(function () {
          saveAdminOrders_(ss, data.adminOrders || []);
          return { success:true, adminOrders:getAdminOrders_(ss) };
        }));
      }

      if (action === "saveAdminOrderScope") {
        return json(withGalileoWriteLock_(function () {
          return saveAdminOrderScope_(ss, data);
        }));
      }

      if (action === "ackAdminOrderChange") {
        return json(withGalileoWriteLock_(function () {
          return ackAdminOrderChange_(ss, data);
        }));
      }

      if (action === "setOperatorTaskApproval") {
        return json(withGalileoWriteLock_(function () {
          return setOperatorTaskApproval_(ss, data);
        }));
      }

      if (action === "getSubOperatorShares") {
        return json({ sharedSubOrders: getSubOperatorShares_(ss) });
      }

      if (action === "saveSubOperatorShares") {
        saveSubOperatorShares_(ss, data.sharedSubOrders || []);
        return json({ success: true });
      }

      if (action === "getSubOperatorApprovals") {
        return json({ approvals: getSubOperatorApprovals_(ss) });
      }

      if (action === "saveSubOperatorApprovals") {
        saveSubOperatorApprovals_(ss, data.approvals || []);
        return json({ success: true });
      }

      if (action === "getPendingSubReports") {
        return json({ pendingSubReports: getPendingSubReports_(ss) });
      }

      if (action === "savePendingSubReports") {
        savePendingSubReports_(ss, data.pendingSubReports || []);
        return json({ success: true });
      }

      if (action === "saveReport") {
        const r = Object.assign({}, data.report || {});
        r.queueRevision = String(data.queueRevision || r.queueRevision || "").trim();
        r.queueUpdatedAt = Number(data.queueUpdatedAt || r.queueUpdatedAt || 0);
        const identityResult = ensureReportClientIdentity_(ss, r);
        if (!identityResult.success) return json(identityResult);
        const resolvedOperator = reportOperatorName_(ss, r);
        if (resolvedOperator) r.operator = resolvedOperator;
        if (!String(r.id || "").trim()) r.id = Utilities.getUuid();
        const existingReportSheets = reportSheetList_(ss);
        const lock = LockService.getScriptLock();
        try {
          lock.waitLock(10000);
          if (!acceptReportQueueVersion_(ss, r, data)) {
            return json({ success:false, error:"superseded_report_version", superseded:true, id:r.id || "" });
          }
          if (data.supplyUpdate) {
            const supplyResult = upsertSupplyDBRow_(ss, data.supplyUpdate);
            if (!supplyResult.success) return json({ success:false, error:supplyResult.error || "supply save failed" });
          }

          const mainSheet = getMainReportsSheet_(ss);
          const operatorSheet = getOperatorReportsSheet_(ss, r && r.operator);
          const targets = operatorSheet.getName() === mainSheet.getName() ? [mainSheet] : [mainSheet, operatorSheet];
          let savedRow = 0;
          let mainRow = 0;
          let savedId = String(r.id || "");
          let wrote = false;
          let updated = false;
          const writtenSheets = [];
          const updatedSheets = [];
          const savedLocations = [];
          targets.forEach(sheet => {
            const existing = findDuplicateReportRow_(sheet, r);
            if (existing.row) {
              if (!savedRow) savedRow = existing.row;
              if (sheet.getName() === mainSheet.getName()) mainRow = existing.row;
              if (!savedId && existing.id) savedId = existing.id;
              if (savedId && existing.id === savedId) {
                const currentValues = sheet.getRange(existing.row, 1, 1, sheet.getLastColumn()).getValues()[0];
                if (
                  !reportRowMatchesReport_(currentValues, r) ||
                  !reportRowQueueVersionMatchesReport_(currentValues, r)
                ) {
                  sheet.getRange(existing.row, 1, 1, reportHeaders_().length).setValues([reportRowValues_(r)]);
                  updated = true;
                  updatedSheets.push(sheet.getName());
                }
              }
              savedLocations.push({ sheet:sheet.getName(), row:existing.row });
              return;
            }
            const reportToWrite = savedId && !r.id ? Object.assign({}, r, { id: savedId }) : r;
            sheet.appendRow(reportRowValues_(reportToWrite));
            savedRow = sheet.getLastRow();
            if (sheet.getName() === mainSheet.getName()) mainRow = savedRow;
            savedId = savedId || reportToWrite.id || "";
            wrote = true;
            writtenSheets.push(sheet.getName());
            savedLocations.push({ sheet:sheet.getName(), row:savedRow });
          });
          const removedSheets = deleteReportCopiesOutsideTargets_(
            existingReportSheets,
            savedId || r.id || "",
            targets.map(sheet => sheet.getName())
          );
          writeReportIndex_(ss, savedId || r.id || "", savedLocations);
          data._savedReportRow = mainRow || savedRow;
          data._savedReportDuplicate = !wrote && !updated;
          data._savedReportUpdated = updated;
          data._savedReportId = savedId || r.id || "";
          data._savedReportTargets = targets.map(sheet => sheet.getName());
          data._savedReportWrittenSheets = writtenSheets;
          data._savedReportUpdatedSheets = updatedSheets;
          data._savedReportRemovedSheets = removedSheets;
        } finally {
          try { lock.releaseLock(); } catch(e) {}
        }
        refreshClientTreatmentCounter_(ss, r.client, r.clientId);
        markSubOperatorShareDone_(ss, r);
        data._chlorineReminder = queueChlorineTabletReminderSafe_(ss, r, data, data._savedReportId || r.id || "");

        // Send email with photos if adminEmail provided
        if (data.adminEmail && data.adminEmail.includes("@")) {
          try {
            const subject = `🏊 דוח טיפול — ${r.client} — ${r.reportDate}`;
            const body = `
  דוח טיפול בבריכה
  ================
  לקוח: ${r.client}
  כתובת: ${data.clientAddress||""}
  טלפון: ${data.clientPhone||""}
  תאריך: ${r.reportDate}
  מפעיל: ${r.operator}

  מדידות:
  כלור: ${r.chlorine} ppm
  pH: ${r.ph}
  רמת מלח: ${r.salt} PPM

  בדיקות מצב:
  גובה מים: ${r.waterLevel}
  צלילות: ${r.clarity}
  פס שומן: ${r.fat}
  זרימה: ${r.flow}

  מצב בריכה: ${r.poolStatus}
  ${r.customStatusText?"פירוט: "+r.customStatusText:""}
  ${r.restrictedUntil?"הגבלה עד: "+r.restrictedUntil:""}
  ${r.supplyLabel?"חומרים לטיפול הבא: "+r.supplyLabel:""}
  ${r.notes?"הערות: "+r.notes:""}
            `.trim();

            const attachments = (data.photos||[]).map((b64,i)=>{
              const bytes = Utilities.base64Decode(b64);
              return {
                fileName: `תמונה_${i+1}.jpg`,
                content: bytes,
                mimeType: "image/jpeg"
              };
            });

            MailApp.sendEmail({
              to: data.adminEmail,
              subject: subject,
              body: body,
              attachments: attachments.length > 0 ? attachments : undefined
            });
          } catch(e) {
            // Email failed silently — report still saved
          }
        }

        return json({ success: true, duplicate: !!data._savedReportDuplicate, updated: !!data._savedReportUpdated, row: data._savedReportRow || 0, id: data._savedReportId || r.id || "", targets: data._savedReportTargets || [], writtenSheets: data._savedReportWrittenSheets || [], updatedSheets: data._savedReportUpdatedSheets || [], removedSheets: data._savedReportRemovedSheets || [], chlorineReminder: data._chlorineReminder || null });
      }

      if (action === "updateReport") {
        const r = Object.assign({}, data.report || {});
        r.queueRevision = String(data.queueRevision || r.queueRevision || "").trim();
        r.queueUpdatedAt = Number(data.queueUpdatedAt || r.queueUpdatedAt || 0);
        const identityResult = ensureReportClientIdentity_(ss, r);
        if (!identityResult.success) return json(identityResult);
        const resolvedOperator = reportOperatorName_(ss, r);
        if (resolvedOperator) r.operator = resolvedOperator;
        const existingReportSheets = reportSheetList_(ss);
        const lock = LockService.getScriptLock();
        let result = null;
        try {
          lock.waitLock(10000);
          if (!acceptReportQueueVersion_(ss, r, data)) {
            return json({ success:false, error:"superseded_report_version", superseded:true, id:r.id || "" });
          }
          if (data.supplyUpdate) {
            const supplyResult = upsertSupplyDBRow_(ss, data.supplyUpdate);
            if (!supplyResult.success) return json({ success:false, error:supplyResult.error || "supply save failed" });
          }
          result = updateReportAcrossSheets_(ss, data.original || {}, r, existingReportSheets);
          if (!result.updated) return json({ success:false, error:"report row not found" });
        } finally {
          try { lock.releaseLock(); } catch(e) {}
        }
        refreshClientTreatmentCounter_(ss, result.report && result.report.client, result.report && result.report.clientId);
        markSubOperatorShareDone_(ss, result.report);
        const reminderResult = queueChlorineTabletReminderSafe_(ss, result.report, data, result.id);
        return json({ success:true, row:result.mainRow || result.row, id:result.id, copiesUpdated:result.updated, copiesCreated:result.created, chlorineReminder:reminderResult });
      }

      if (action === "saveSupplyDB") {
        const results = [];
        dedupeRowsByFirstCell_(data.rows || []).forEach(r => {
          results.push(upsertSupplyDBRow_(ss, r));
        });
        const failed = results.find(r => !r.success);
        return json({ success: !failed, results: results, error: failed && failed.error });
      }

      if (action === "getSupplyDB") {
        return json({ supplyDB: getSupplyDB_(ss) });
      }

      if (action === "getMgmtClients") {
        const sheet = ss.getSheetByName("לקוחות");
        if (!sheet) return json({ rows: [] });
        const rows = sheet.getDataRange().getValues();
        return json({ rows: rows.slice(1).filter(r=>r[0]) });
      }

      if (action === "appendMgmtRow") {
        let sheet = ss.getSheetByName(data.sheet);
        if (!sheet && String(data.sheet || "") === "הודעות") {
          sheet = getSuperMessagesSheet_(ss);
        }
        if (!sheet) return json({ error: "sheet not found" });
        sheet.appendRow(data.row);
        return json({ success: true });
      }

      if (action === "getReports") {
        const fromDate = normalizeSheetDate_(data.fromDate || data.reportDate || data.dateFrom || "");
        const toDate = normalizeSheetDate_(data.toDate || data.dateTo || "");
        const query = String(data.query || data.search || "").trim().toLowerCase();
        const wantedClient = String(data.client || data.clientName || "").trim().toLowerCase();
        const wantedClientId = String(data.clientId || "").trim();
        const namedClients = wantedClient
          ? allClientRecords_(ss).filter(client => String(client.name || "").trim().toLowerCase() === wantedClient)
          : [];
        if (!wantedClientId && wantedClient && namedClients.length > 1) {
          return json({ reports:[], error:"ambiguous client name" });
        }
        const allowLegacyNameMatch = !wantedClientId || !wantedClient || namedClients.length === 1;
        const limit = Math.max(0, Number(data.limit || 0) || 0);
        const reportQuery = {
          fromDate:fromDate,
          toDate:toDate,
          query:query,
          wantedClient:wantedClient,
          wantedClientId:wantedClientId,
          allowLegacyNameMatch:allowLegacyNameMatch,
          limit:limit
        };
        const reportRowsCacheKey = reportQueryCacheKey_(ss, reportQuery);
        let dataRows = cacheGetBig_(reportRowsCacheKey);
        if (!Array.isArray(dataRows)) {
          const mainReportsSheet = ss.getSheetByName("דוחות");
          dataRows = mainReportsSheet
            ? reportRowsForQuery_(mainReportsSheet, reportQuery)
            : allReportRows_(ss);
          cachePutBig_(reportRowsCacheKey, dataRows, 300);
        }
        if (wantedClient || wantedClientId) {
          dataRows = dataRows.filter(r => {
            const rowClientId = String(reportCell_(r,24) || "").trim();
            if (wantedClientId && rowClientId) return rowClientId === wantedClientId;
            return allowLegacyNameMatch && wantedClient && String(reportCell_(r,2) || "").trim().toLowerCase() === wantedClient;
          });
        }
        if (fromDate) dataRows = dataRows.filter(r => normalizeSheetDate_(reportCell_(r,0)) >= fromDate);
        if (toDate) dataRows = dataRows.filter(r => normalizeSheetDate_(reportCell_(r,0)) <= toDate);
        if (query) {
          dataRows = dataRows.filter(r => {
            const haystack = [
              reportCell_(r,1),
              reportCell_(r,2),
              reportCell_(r,5),
              reportCell_(r,14),
              reportCell_(r,18)
            ].map(v => String(v || "").toLowerCase()).join(" ");
            return haystack.indexOf(query) >= 0;
          });
        }
        dataRows = dedupeReportRows_(dataRows).sort((a,b) => normalizeSheetDate_(reportCell_(a,0)).localeCompare(normalizeSheetDate_(reportCell_(b,0))));
        if (limit && dataRows.length > limit) dataRows = dataRows.slice(dataRows.length - limit);
        const reports = dataRows.map((r,i) => {
          const waterCheckOnly = reportWaterCheckOnlyFromRow_(r);
          return {
            id: reportIdCell_(r),
            _fromSheet: true,
            reportDate: normalizeSheetDate_(reportCell_(r,0)) || String(reportCell_(r,0)).slice(0,10),
            operator: String(reportCell_(r,1)),
            client: String(reportCell_(r,2)),
            chlorine: reportCell_(r,3),
            ph: waterCheckOnly ? null : reportCell_(r,4),
            salt: waterCheckOnly ? null : reportCell_(r,5),
            waterLevel: waterCheckOnly ? "" : String(reportCell_(r,6)),
            clarity: waterCheckOnly ? "" : String(reportCell_(r,7)),
            fat: waterCheckOnly ? "" : String(reportCell_(r,8)),
            flow: String(reportCell_(r,9)),
            elModel: waterCheckOnly ? "" : String(reportCell_(r,10)||""),
            elSerial: waterCheckOnly ? "" : String(reportCell_(r,11)||""),
            elDate: waterCheckOnly ? "" : (reportCell_(r,12) instanceof Date ? Utilities.formatDate(reportCell_(r,12),"Asia/Jerusalem","yyyy-MM-dd") : String(reportCell_(r,12)||"").slice(0,10)),
            elNext: waterCheckOnly ? "" : (reportCell_(r,13) instanceof Date ? Utilities.formatDate(reportCell_(r,13),"Asia/Jerusalem","yyyy-MM-dd") : String(reportCell_(r,13)||"").slice(0,10)),
            poolStatus: waterCheckOnly ? "" : (String(reportCell_(r,15))||"\u05de\u05d0\u05d5\u05d6\u05e0\u05ea"),
            customStatusText: waterCheckOnly ? "" : String(reportCell_(r,16)||""),
            restrictedUntil: waterCheckOnly ? "" : (reportCell_(r,17) instanceof Date ? Utilities.formatDate(reportCell_(r,17),"Asia/Jerusalem","yyyy-MM-dd") : String(reportCell_(r,17)||"").slice(0,10)),
            notes: waterCheckOnly ? "" : String(reportCell_(r,18)||""),
            supplyLabel: waterCheckOnly ? "" : String(reportCell_(r,14)||""),
            chlora: waterCheckOnly ? reportCell_(r,19) : (reportCell_(r,19)||0),
            hth: waterCheckOnly ? reportCell_(r,20) : (reportCell_(r,20)||0),
            phUp: waterCheckOnly ? null : (reportCell_(r,21)||0),
            acidLiters: waterCheckOnly ? null : (reportCell_(r,22)||0),
            suppliedEquipment: waterCheckOnly ? "" : String(reportCell_(r,23)||""),
            clientId: String(reportCell_(r,24)||""),
            waterCheckOnly
          };
        });
        return json({ reports });
      }

      if (action === "getReportStorageStatus") {
        return json({ matches: reportStorageStatus_(ss, data.report || data) });
      }

      if (action === "getMaterialApprovals") {
        return json({ approvals: getMaterialApprovals_(ss) });
      }

      if (action === "updateMaterialApproval") {
        return json(updateMaterialApproval_(ss, data));
      }

      if (action === "syncDailyMaterialApprovals") {
        return json(syncDailyMaterialApprovals_(ss, data.date));
      }

      if (action === "saveClients") {
        const sheet = ss.getSheetByName("לקוחות");
        return json(saveClients_(sheet, data.clients || []));
    }

      if (action === "deleteClient") {
        const sheet = ss.getSheetByName("לקוחות");
        return json(deleteClient_(sheet, data));
      }

      if (action === "getLastReadings") {
        return json({ lastReadings: getLastReadings_(ss) });
      }
      if (action === "saveClientInternalNote") {
        return json(saveClientInternalNote_(ss, data));
      }

      if (action === "saveWorkLog") {
        const sheet = ss.getSheetByName("שעות_עבודה");
        const l = data.log;
        sheet.appendRow([l.date, l.operator, l.start, l.end, l.total]);
        return json({ success: true });
      }

      if (action === "saveWorkStart") {
        const l = data.log || {};
        const sheet = getOrCreateActiveWorkSheet_(ss);
        upsertActiveWork_(sheet, {
          username: String(l.username || data.username || ""),
          operator: String(l.operator || data.operator || ""),
          date: String(l.date || data.date || Utilities.formatDate(new Date(), "Asia/Jerusalem", "yyyy-MM-dd")),
          start: String(l.start || data.start || Utilities.formatDate(new Date(), "Asia/Jerusalem", "HH:mm")),
        });
        return json({ success: true });
      }

      if (action === "clearWorkStart") {
        const sheet = getOrCreateActiveWorkSheet_(ss);
        clearActiveWork_(sheet, {
          username: String(data.username || ""),
          operator: String(data.operator || ""),
          date: String(data.date || Utilities.formatDate(new Date(), "Asia/Jerusalem", "yyyy-MM-dd")),
        });
        return json({ success: true });
      }

      return json({ error: "unknown action" });

    } catch(err) {
      return json({ error: err.message });
    } finally {
      if (invalidateAfterWrite && writeSpreadsheet) {
        try { bumpOperatorDataVersion_(writeSpreadsheet); } catch(e) {}
      }
    }
  }

  function setupClientSheet(clientSS) {
    // ── Users ──
    let s = clientSS.getSheetByName("Users");
    if(!s) {
      s = clientSS.insertSheet("Users");
      s.appendRow(["username","password","role","name","icon","welcomeMessage","phone","welcomeImage","welcomeInstagram","linkedOperator","assignedOperator"]);
    } else {
      ensureColumns(s, ["username","password","role","name","icon","welcomeMessage","phone","welcomeImage","welcomeInstagram","linkedOperator","assignedOperator"]);
    }
    
    // ── לקוחות ──
    s = clientSS.getSheetByName("לקוחות");
    if(!s) {
      s = clientSS.insertSheet("לקוחות");
    s.appendRow(["clientId","שם_לקוח","טלפון","כתובת","qr_url","קוד_שער","סוג_בריכה","ימים_קבועים","מפעיל_קבוע","ימי_בדיקת_מים","יתרת_טיפולים_חודשית","מונה_טיפולים_בפועל","מכסת_טיפולים_חודשית","חודש_טיפולים"]);
  } else {
    ensureColumns(s, ["clientId","שם_לקוח","טלפון","כתובת","qr_url","קוד_שער","סוג_בריכה","ימים_קבועים","מפעיל_קבוע","ימי_בדיקת_מים","יתרת_טיפולים_חודשית","מונה_טיפולים_בפועל","מכסת_טיפולים_חודשית","חודש_טיפולים"]);
  }
    
    // ── דוחות ──
    s = clientSS.getSheetByName("דוחות");
    if(!s) {
      s = clientSS.insertSheet("דוחות");
    }
    ensureReportsSheetReportId_(s);
    
    // ── משימות ──
    s = clientSS.getSheetByName("משימות");
    if(!s) {
      s = clientSS.insertSheet("משימות");
      s.appendRow(taskHeaders_());
    } else {
      ensureColumns(s, taskHeaders_());
    }
    // ── חלוקת_עבודה ──
    s = clientSS.getSheetByName("חלוקת_עבודה");
    if(!s) {
      s = clientSS.insertSheet("חלוקת_עבודה");
      s.appendRow(["id","תאריך","מפעיל","לקוח","סדר","הערת_מנהל","סטטוס","changeLog","clientId"]);
    } else {
      ensureColumns(s, ["id","תאריך","מפעיל","לקוח","סדר","הערת_מנהל","סטטוס","changeLog","clientId"]);
    }
    
    // ── ציוד_לקוחות ──
    s = clientSS.getSheetByName("ציוד_לקוחות");
    if(!s) {
      s = clientSS.insertSheet("ציוד_לקוחות");
      s.appendRow(["לקוח","חומצת_מלח","מעלה_pH","שקי_מלח","כמות_שקים","עודכן","הערת_חומרים","nextSupplyDate","assignedOperator","מחיר_פר_חומר_לטיפול_הבא","supplyId","clientId"]);
    } else {
      ensureColumns(s, ["לקוח","חומצת_מלח","מעלה_pH","שקי_מלח","כמות_שקים","עודכן","הערת_חומרים","nextSupplyDate","assignedOperator","מחיר_פר_חומר_לטיפול_הבא","supplyId","clientId"]);
    }
    
    // ── שעות_עבודה ──
    s = clientSS.getSheetByName("שעות_עבודה");
    if(!s) {
      s = clientSS.insertSheet("שעות_עבודה");
      s.appendRow(["id","מפעיל","תאריך","התחלה","סיום","סה\"כ"]);
    }
    
    // ── תקלות_מפעילים ──
    s = clientSS.getSheetByName("תקלות_מפעילים");
    if(!s) {
      s = clientSS.insertSheet("תקלות_מפעילים");
      s.appendRow(["id","מפעיל","לקוח","תיאור","דחיפות","סטטוס","תגובת_אדמין","תאריך"]);
    }

    s = clientSS.getSheetByName("SubOperatorShares");
    if(!s) {
      s = clientSS.insertSheet("SubOperatorShares");
      s.appendRow(subOperatorShareHeaders_());
    } else if (s.getLastRow() === 0) {
      s.appendRow(subOperatorShareHeaders_());
    } else {
      ensureColumns(s, subOperatorShareHeaders_());
    }

    s = clientSS.getSheetByName("ClientSettings");
    if(!s) {
      s = clientSS.insertSheet("ClientSettings");
      s.appendRow(["key","value"]);
    } else if (s.getLastRow() === 0) {
      s.appendRow(["key","value"]);
    }

    s = clientSS.getSheetByName("UsageEvents");
    if(!s) {
      s = clientSS.insertSheet("UsageEvents");
      s.appendRow(["timestamp","sessionId","userId","role","screen","event","target","metadata","userAgent","appVersion"]);
    } else if (s.getLastRow() === 0) {
      s.appendRow(["timestamp","sessionId","userId","role","screen","event","target","metadata","userAgent","appVersion"]);
    } else {
      ensureColumns(s, ["timestamp","sessionId","userId","role","screen","event","target","metadata","userAgent","appVersion"]);
    }

    s = clientSS.getSheetByName("MaterialApprovals");
    if(!s) {
      s = clientSS.insertSheet("MaterialApprovals");
      s.appendRow(materialApprovalHeaders_());
    } else if (s.getLastRow() === 0) {
      s.appendRow(materialApprovalHeaders_());
    } else {
      ensureColumns(s, materialApprovalHeaders_());
    }

    s = clientSS.getSheetByName("תזכורות_כלור");
    if(!s) {
      s = clientSS.insertSheet("תזכורות_כלור");
      s.appendRow(chlorineReminderHeaders_());
    } else if (s.getLastRow() === 0) {
      s.appendRow(chlorineReminderHeaders_());
    } else {
      ensureColumns(s, chlorineReminderHeaders_());
    }
    
    Logger.log("✅ Client sheet setup complete: " + clientSS.getName());
  }

  function ensureSeparatedWorkSheets(sheetId) {
    const id = sheetId || "1NthErqOJOFHJ482q3zg2daFX9SGCFeByXjdoZxvV-no";
    const ss = SpreadsheetApp.openById(id);
    setupClientSheet(ss);
    Logger.log("✅ נוצרו/עודכנו גיליונות נפרדים: משימות, חלוקת_עבודה");
  }

  function ensureColumns(sheet, requiredHeaders) {
    const headerRowIndex = findHeaderRowIndex_(sheet, requiredHeaders);
    const headerRow = headerRowIndex + 1;
    const headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getValues()[0];
    let lastCol = sheet.getLastColumn();
    
    requiredHeaders.forEach(h => {
      if(!headers.includes(h)) {
        lastCol++;
        sheet.getRange(headerRow, lastCol).setValue(h);
        Logger.log("Added column: " + h);
      }
    });
  }

  function findHeaderRowIndex_(sheet, requiredHeaders) {
    const maxRows = Math.min(Math.max(sheet.getLastRow(), 1), 10);
    const lastCol = Math.max(sheet.getLastColumn(), 1);
    const rows = sheet.getRange(1, 1, maxRows, lastCol).getValues();
    const sheetName = sheet.getName();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].map(c => String(c || "").trim());
      if (requiredHeaders.some(h => row.includes(h))) return i;
      if (sheetName === "לקוחות" && row.some(c => isClientNameHeader_(c))) return i;
      if (sheetName === "Users" && row.some(c => c.toLowerCase() === "username")) return i;
      if (sheetName === "דוחות" && row.some(c => c.includes("תאריך"))) return i;
      if (sheetName === "משימות" && row.some(c => c.toUpperCase() === "ID")) return i;
      if (sheetName === "חלוקת_עבודה" && row.some(c => c.toUpperCase() === "ID")) return i;
    }

    return 0;
  }

  function setupTriggers() {
    // מחק triggers ישנים
    ScriptApp.getProjectTriggers().forEach(t => {
      if(["checkNotifications","syncDailyMaterialApprovals","cleanupSuperMessagesHourly"].includes(t.getHandlerFunction())) {
        ScriptApp.deleteTrigger(t);
      }
    });

    // צור trigger חדש — כל 5 דקות
    ScriptApp.newTrigger("checkNotifications")
      .timeBased()
      .everyMinutes(5)
      .create();

    ScriptApp.newTrigger("cleanupSuperMessagesHourly")
      .timeBased()
      .everyHours(1)
      .create();

    Logger.log("✅ Triggers נוצרו — checkNotifications כל 5 דקות, cleanupSuperMessagesHourly כל שעה");
  }

  function checkNotifications() {
    const clientSS = SpreadsheetApp.openById("1NthErqOJOFHJ482q3zg2daFX9SGCFeByXjdoZxvV-no");
    checkNotificationsForSheet_(clientSS);
  }

  function getNotificationSpreadsheets_() {
    const ids = {};
    ids["1NthErqOJOFHJ482q3zg2daFX9SGCFeByXjdoZxvV-no"] = true;
    ids["17jNBWSAkW17zfz4o2gY3wOsERa3_NAgSZ3b9HPkNspk"] = true;

    try {
      const mgmt = SpreadsheetApp.openById("17jNBWSAkW17zfz4o2gY3wOsERa3_NAgSZ3b9HPkNspk");
      const licenses = mgmt.getSheetByName("רישיונות");
      if (licenses) {
        licenses.getDataRange().getValues().slice(1).forEach(r => {
          const sheetId = String(r[2] || "").trim();
          const status = String(r[4] || "פעיל").trim();
          if (sheetId && status !== "מושהה") ids[sheetId] = true;
        });
      }
    } catch(e) {
      Logger.log("Could not load license sheet ids: " + e);
    }

    return Object.keys(ids).map(id => {
      try { return SpreadsheetApp.openById(id); }
      catch(e) { Logger.log("Could not open spreadsheet " + id + ": " + e); return null; }
    }).filter(Boolean);
  }

  function checkNotificationsForSheet_(ss) {
    // בדוק תקלות דחופות שלא טופלו
    const issues = ss.getSheetByName("תקלות_מפעילים");
    if(issues) {
      const rows = issues.getDataRange().getValues();
      const urgent = rows.slice(1).filter(r =>
        r[4] === "קריטי" && r[5] === "פתוח"
      );

      if(urgent.length > 0 && shouldSendIssueReminder_(ss)) {
        const res = sendAppNotificationToAdmins_(ss, {
          title: `🚨 ${urgent.length} תקלות קריטיות לא טופלו!`,
          message: urgent.map(r => r[2]).join(", ")
        });
        Logger.log("Admin issue reminder push status: " + !!res.success);
      }
    }

    sendNoonWorkClockReminders_(ss);
    sendDueChlorineTabletReminders_(ss);
    appendMissingDailyReportsAfterFour_(ss);
  }

  function shouldSendIssueReminder_(ss) {
    const REMINDER_EVERY_HOURS = 3;
    const props = PropertiesService.getScriptProperties();
    const key = "lastIssueReminder:" + ss.getId();
    const now = Date.now();
    const last = Number(props.getProperty(key) || 0);
    const due = !last || (now - last) >= REMINDER_EVERY_HOURS * 60 * 60 * 1000;
    if (due) props.setProperty(key, String(now));
    return due;
  }

  function sendNoonWorkClockReminders_(ss) {
    const now = new Date();
    const hour = Number(Utilities.formatDate(now, "Asia/Jerusalem", "H"));
    const minute = Number(Utilities.formatDate(now, "Asia/Jerusalem", "m"));

    if (hour !== 12 || minute > 9) return;

    const today = Utilities.formatDate(now, "Asia/Jerusalem", "yyyy-MM-dd");
    const sheet = getOrCreateActiveWorkSheet_(ss);
    const rows = sheet.getDataRange().getValues();
    if (rows.length < 2) return;

    for (let i = 1; i < rows.length; i++) {
      const rowDate = String(rows[i][2] || "").slice(0, 10);
      const notified = String(rows[i][4] || "");
      if (rowDate !== today || notified === today) continue;

      const username = String(rows[i][0] || "").trim();
      const operator = String(rows[i][1] || "").trim();
      const start = String(rows[i][3] || "").trim();
      if (!username) continue;

      const res = sendAppNotificationToUser_({
        externalUserId: username,
        title: "⏰ תזכורת: שעון עבודה",
        message: `השעון פעיל מ-${start || "הבוקר"} — אם יצאת להפסקה, אל תשכח לכבות`
      });

      if (res && res.success) {
        sheet.getRange(i + 1, 5).setValue(today);
        Logger.log("נשלחה תזכורת שעון ל-" + (operator || username));
      }
    }
  }

  function appendMissingDailyReportsAfterFour_(ss) {
    const now = new Date();
    const hour = Number(Utilities.formatDate(now, "Asia/Jerusalem", "H"));
    if (hour < 23) return;

    const today = Utilities.formatDate(now, "Asia/Jerusalem", "yyyy-MM-dd");
    const props = PropertiesService.getScriptProperties();
    const key = "missingDailyReports:" + ss.getId() + ":" + today;
    if (props.getProperty(key) === "done") return;

    const clientsSheet = ss.getSheetByName("לקוחות");
    if (!clientsSheet) return;

    const clients = getClients_(ss);
    if (!clients.length) {
      props.setProperty(key, "done");
      return;
    }

    const dayName = hebrewDayName_(today);
    const assigned = clients
      .map(client => ({
        client: String(client.name || "").trim(),
        clientId: String(client.clientId || "").trim(),
        operator: String(client.regularOperator || "").trim(),
        days: String(client.regularDays || "").split(",").map(normalizeHebrewDay_).filter(Boolean)
      }))
      .filter(x => x.client && x.days.includes(dayName));

    const reportRows = allReportRows_(ss);
    const alreadyReported = {};
    reportRows.forEach(r => {
      const date = normalizeSheetDate_(reportCell_(r,0));
      const client = String(reportCell_(r,2) || "").trim();
      const clientId = String(reportCell_(r,24) || "").trim();
      if (date === today && client) alreadyReported[poolIdentityKey_(clientId, client)] = true;
    });

    let appended = 0;
    assigned.forEach(item => {
      const poolKey = poolIdentityKey_(item.clientId, item.client);
      if (alreadyReported[poolKey]) return;
      const missingReport = {
        id: Utilities.getUuid(),
        reportDate: today,
        operator: item.operator,
        client: item.client,
        clientId: item.clientId,
        chlorine: 0, ph: 0, salt: 0,
        waterLevel: "", clarity: "", fat: "", flow: "",
        elModel: "", elSerial: "", elDate: "", elNext: "",
        supplyLabel: "", poolStatus: "", customStatusText: "", restrictedUntil: "",
        notes: "\u05dc\u05d0 \u05d1\u05d5\u05e6\u05e2 \u05d8\u05d9\u05e4\u05d5\u05dc",
        chlora: 0, hth: 0, phUp: 0, acidLiters: 0, suppliedEquipment: ""
      };
      const mainSheet = getMainReportsSheet_(ss);
      const operatorSheet = getOperatorReportsSheet_(ss, item.operator);
      const targetSheets = operatorSheet.getName() === mainSheet.getName() ? [mainSheet] : [mainSheet, operatorSheet];
      targetSheets.forEach(sheet => {
        if (!findDuplicateReportRow_(sheet, missingReport).row) sheet.appendRow(reportRowValues_(missingReport));
      });
      alreadyReported[poolKey] = true;
      appended++;
    });

    refreshMonthlyTreatmentCounters_(ss);
    props.setProperty(key, "done");
    Logger.log("Missing daily reports appended: " + appended + " for " + today);
  }

  function refreshMonthlyTreatmentCounters_(ss) {
    const clientsSheet = ss.getSheetByName("לקוחות");
    if (!clientsSheet) return [];

    ensureColumns(clientsSheet, ["יתרת_טיפולים_חודשית", "מונה_טיפולים_בפועל", "מכסת_טיפולים_חודשית", "חודש_טיפולים"]);

    const clientsRows = clientsSheet.getDataRange().getValues();
    if (!clientsRows.length) return [];
    const headerRowIndex = findHeaderRowIndex_(clientsSheet, ["שם_לקוח", "שם לקוח", "יתרת_טיפולים_חודשית", "מונה_טיפולים_בפועל"]);
    const headers = (clientsRows[headerRowIndex] || []).map(h => String(h || "").trim());
    const normalizedHeaders = headers.map(h => String(h || "").replace(/[\s_\-]/g, "").toLowerCase());
    const columnOf = (names, fallback) => {
      const wanted = names.map(name => String(name || "").replace(/[\s_\-]/g, "").toLowerCase());
      const index = normalizedHeaders.findIndex(header => wanted.indexOf(header) >= 0);
      return index >= 0 ? index : fallback;
    };
    const clientIdIdx = columnOf(["clientId","client_id","id"], -1);
    const nameIdx = columnOf(["שם_לקוח","שם לקוח","שם","לקוח","שם הלקוח","client","name"], 0);
    const regularDaysIdx = columnOf(["ימים_קבועים","ימים קבועים","regularDays"], 6);
    const balanceIdx = columnOf(["יתרת_טיפולים_חודשית"], -1);
    const countIdx = columnOf(["מונה_טיפולים_בפועל"], -1);
    const quotaIdx = columnOf(["מכסת_טיפולים_חודשית"], -1);
    const quotaMonthIdx = columnOf(["חודש_טיפולים"], -1);
    const monthKey = Utilities.formatDate(new Date(), "Asia/Jerusalem", "yyyy-MM");
    const counts = {};
    const legacyCounts = {};
    const clientNameCounts = {};

    clientsRows.slice(headerRowIndex + 1).forEach(row => {
      const name = normalizeReportValue_(row[nameIdx]).toLowerCase();
      if (name) clientNameCounts[name] = (clientNameCounts[name] || 0) + 1;
    });

    dedupeReportRows_(reportRowsFromSheet_(getMainReportsSheet_(ss))).forEach(r => {
      const date = normalizeSheetDate_(reportCell_(r,0));
      const client = String(reportCell_(r,2) || "").trim();
      const clientId = String(reportCell_(r,24) || "").trim();
      const notes = String(reportCell_(r,18) || "").trim();
      if (!client || !date.startsWith(monthKey) || reportWaterCheckOnlyFromRow_(r) || notes === "\u05dc\u05d0 \u05d1\u05d5\u05e6\u05e2 \u05d8\u05d9\u05e4\u05d5\u05dc") return;
      if (clientId) {
        const key = poolIdentityKey_(clientId, client);
        counts[key] = (counts[key] || 0) + 1;
      } else {
        const nameKey = normalizeReportValue_(client).toLowerCase();
        legacyCounts[nameKey] = (legacyCounts[nameKey] || 0) + 1;
      }
    });

    const treatments = [];
    const dataStartRow = headerRowIndex + 1;
    const dataRows = clientsRows.slice(dataStartRow);
    const balanceValues = balanceIdx >= 0 ? dataRows.map(row => [row[balanceIdx]]) : null;
    const countValues = countIdx >= 0 ? dataRows.map(row => [row[countIdx]]) : null;
    const quotaValues = quotaIdx >= 0 ? dataRows.map(row => [row[quotaIdx]]) : null;
    const monthValues = quotaMonthIdx >= 0 ? dataRows.map(row => [row[quotaMonthIdx]]) : null;
    for (let i = headerRowIndex + 1; i < clientsRows.length; i++) {
      const client = String(clientsRows[i][nameIdx] || "").trim();
      if (!client) continue;
      const clientId = clientIdIdx >= 0 ? String(clientsRows[i][clientIdIdx] || "").trim() : "";
      const normalizedClient = normalizeReportValue_(client).toLowerCase();
      const dataIndex = i - dataStartRow;
      const actual = (counts[poolIdentityKey_(clientId, client)] || 0) +
        (clientNameCounts[normalizedClient] === 1 ? (legacyCounts[normalizedClient] || 0) : 0);
      const row = clientsRows[i];
      const regularDays = String(row[regularDaysIdx] || "");
      const savedMonth = quotaMonthIdx >= 0 ? String(row[quotaMonthIdx] || "").trim() : "";
      const typedQuota = quotaIdx >= 0 ? Number(row[quotaIdx] || 0) : 0;
      const typedBalance = balanceIdx >= 0 ? Number(row[balanceIdx] || 0) : 0;
      const calculatedQuota = countClientCalendarTreatments_(regularDays, new Date()) || 4;
      const manualQuota = typedQuota || (typedBalance ? typedBalance + actual : 0);
      const quota = (savedMonth === monthKey || !savedMonth)
        ? Math.max(0, Math.round(manualQuota || calculatedQuota))
        : calculatedQuota;
      const balance = Math.max(0, quota - actual);
      if (balanceValues) balanceValues[dataIndex][0] = balance;
      if (countValues) countValues[dataIndex][0] = actual;
      if (quotaValues) quotaValues[dataIndex][0] = quota;
      if (monthValues) monthValues[dataIndex][0] = monthKey;
      treatments.push({ client, clientId, monthlyTreatmentBalance: balance, monthlyTreatmentCount: actual, monthlyTreatmentQuota: quota });
    }
    if (dataRows.length) {
      if (balanceValues) clientsSheet.getRange(dataStartRow + 1, balanceIdx + 1, dataRows.length, 1).setValues(balanceValues);
      if (countValues) clientsSheet.getRange(dataStartRow + 1, countIdx + 1, dataRows.length, 1).setValues(countValues);
      if (quotaValues) clientsSheet.getRange(dataStartRow + 1, quotaIdx + 1, dataRows.length, 1).setValues(quotaValues);
      if (monthValues) clientsSheet.getRange(dataStartRow + 1, quotaMonthIdx + 1, dataRows.length, 1).setValues(monthValues);
    }
    return treatments;
  }

  function refreshClientTreatmentCounter_(ss, clientName, clientId) {
    const wantedClient = String(clientName || "").trim();
    const wantedClientId = String(clientId || "").trim();
    if (!wantedClient) return null;
    const clientsSheet = ss.getSheetByName("לקוחות");
    if (!clientsSheet) return null;
    ensureColumns(clientsSheet, ["יתרת_טיפולים_חודשית", "מונה_טיפולים_בפועל", "מכסת_טיפולים_חודשית", "חודש_טיפולים"]);
    const rows = clientsSheet.getDataRange().getValues();
    if (!rows.length) return null;
    const headerRowIndex = findHeaderRowIndex_(clientsSheet, ["שם_לקוח", "שם לקוח", "יתרת_טיפולים_חודשית", "מונה_טיפולים_בפועל"]);
    const headers = (rows[headerRowIndex] || []).map(h => String(h || "").trim());
    const normalizedHeaders = headers.map(h => String(h || "").replace(/[\s_\-]/g, "").toLowerCase());
    const columnOf = (names, fallback) => {
      const wanted = names.map(name => String(name || "").replace(/[\s_\-]/g, "").toLowerCase());
      const index = normalizedHeaders.findIndex(header => wanted.indexOf(header) >= 0);
      return index >= 0 ? index : fallback;
    };
    const clientIdIdx = columnOf(["clientId","client_id","id"], -1);
    const nameIdx = columnOf(["שם_לקוח","שם לקוח","שם","לקוח","שם הלקוח","client","name"], 0);
    const regularDaysIdx = columnOf(["ימים_קבועים","ימים קבועים","regularDays"], 6);
    const balanceIdx = columnOf(["יתרת_טיפולים_חודשית"], -1);
    const countIdx = columnOf(["מונה_טיפולים_בפועל"], -1);
    const quotaIdx = columnOf(["מכסת_טיפולים_חודשית"], -1);
    const quotaMonthIdx = columnOf(["חודש_טיפולים"], -1);
    const normalizedWantedName = normalizeReportValue_(wantedClient).toLowerCase();
    const matchingNameRows = rows.filter((row, index) => index > headerRowIndex && normalizeReportValue_(row[nameIdx]).toLowerCase() === normalizedWantedName);
    if (!wantedClientId && matchingNameRows.length !== 1) return null;
    const clientRowIndex = rows.findIndex((row, index) => {
      if (index <= headerRowIndex) return false;
      const rowId = clientIdIdx >= 0 ? String(row[clientIdIdx] || "").trim() : "";
      if (wantedClientId) return rowId === wantedClientId;
      return normalizeReportValue_(row[nameIdx]).toLowerCase() === normalizedWantedName;
    });
    if (clientRowIndex < 0) return null;

    const monthKey = Utilities.formatDate(new Date(), "Asia/Jerusalem", "yyyy-MM");
    const actual = dedupeReportRows_(reportRowsFromSheet_(getMainReportsSheet_(ss))).reduce((count, row) => {
      const date = normalizeSheetDate_(reportCell_(row,0));
      const client = String(reportCell_(row,2) || "").trim();
      const rowClientId = String(reportCell_(row,24) || "").trim();
      const notes = String(reportCell_(row,18) || "").trim();
      const samePool = wantedClientId
        ? (rowClientId ? rowClientId === wantedClientId : matchingNameRows.length === 1 && normalizeReportValue_(client).toLowerCase() === normalizedWantedName)
        : normalizeReportValue_(client).toLowerCase() === normalizedWantedName;
      return samePool && date.startsWith(monthKey) && !reportWaterCheckOnlyFromRow_(row) && notes !== "\u05dc\u05d0 \u05d1\u05d5\u05e6\u05e2 \u05d8\u05d9\u05e4\u05d5\u05dc" ? count + 1 : count;
    }, 0);
    const row = rows[clientRowIndex];
    const regularDays = String(row[regularDaysIdx] || "");
    const savedMonth = quotaMonthIdx >= 0 ? String(row[quotaMonthIdx] || "").trim() : "";
    const typedQuota = quotaIdx >= 0 ? Number(row[quotaIdx] || 0) : 0;
    const typedBalance = balanceIdx >= 0 ? Number(row[balanceIdx] || 0) : 0;
    const calculatedQuota = countClientCalendarTreatments_(regularDays, new Date()) || 4;
    const manualQuota = typedQuota || (typedBalance ? typedBalance + actual : 0);
    const quota = (savedMonth === monthKey || !savedMonth)
      ? Math.max(0, Math.round(manualQuota || calculatedQuota))
      : calculatedQuota;
    const balance = Math.max(0, quota - actual);
    if (balanceIdx >= 0) clientsSheet.getRange(clientRowIndex + 1, balanceIdx + 1).setValue(balance);
    if (countIdx >= 0) clientsSheet.getRange(clientRowIndex + 1, countIdx + 1).setValue(actual);
    if (quotaIdx >= 0) clientsSheet.getRange(clientRowIndex + 1, quotaIdx + 1).setValue(quota);
    if (quotaMonthIdx >= 0) clientsSheet.getRange(clientRowIndex + 1, quotaMonthIdx + 1).setValue(monthKey);
    return { client:wantedClient, clientId:wantedClientId, monthlyTreatmentBalance:balance, monthlyTreatmentCount:actual, monthlyTreatmentQuota:quota };
  }

  function countClientCalendarTreatments_(regularDays, date) {
    const wantedDays = String(regularDays || "")
      .split(/[,;|/\\\s]+/)
      .map(normalizeHebrewDay_)
      .filter(Boolean);
    if (!wantedDays.length) return 0;

    const year = Number(Utilities.formatDate(date, "Asia/Jerusalem", "yyyy"));
    const month = Number(Utilities.formatDate(date, "Asia/Jerusalem", "M"));
    const daysInMonth = new Date(year, month, 0).getDate();
    let count = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (wantedDays.includes(hebrewDayName_(dateStr))) count++;
    }
    return count;
  }

  function normalizeSheetDate_(value) {
    if (value instanceof Date) return Utilities.formatDate(value, "Asia/Jerusalem", "yyyy-MM-dd");
    const text = String(value || "").trim();
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
    const local = text.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/);
    if (local) {
      const year = String(local[3]).length === 2 ? `20${local[3]}` : local[3];
      return `${year}-${String(local[2]).padStart(2, "0")}-${String(local[1]).padStart(2, "0")}`;
    }
    return "";
  }

  function hebrewDayName_(dateStr) {
    const dayNames = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
    return dayNames[new Date(dateStr + "T12:00:00").getDay()];
  }

  function normalizeHebrewDay_(value) {
    return String(value || "").trim()
      .replace(/^א$/, "ראשון").replace(/^ב$/, "שני").replace(/^ג$/, "שלישי")
      .replace(/^ד$/, "רביעי").replace(/^ה$/, "חמישי").replace(/^ו$/, "שישי")
      .replace(/^ש$/, "שבת").replace(/^1$/, "ראשון").replace(/^2$/, "שני")
      .replace(/^3$/, "שלישי").replace(/^4$/, "רביעי").replace(/^5$/, "חמישי")
      .replace(/^6$/, "שישי").replace(/^7$/, "שבת");
  }

  function getOrCreateActiveWorkSheet_(ss) {
    let sheet = ss.getSheetByName("שעון_פעיל");
    if (!sheet) {
      sheet = ss.insertSheet("שעון_פעיל");
      sheet.appendRow(["username","operator","date","start","noonNotified"]);
    }
    return sheet;
  }

  function upsertActiveWork_(sheet, entry) {
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const sameUser = String(rows[i][0] || "") === entry.username || String(rows[i][1] || "") === entry.operator;
      const sameDate = String(rows[i][2] || "").slice(0, 10) === entry.date;
      if (sameUser && sameDate) {
        sheet.getRange(i + 1, 1, 1, 5).setValues([[entry.username, entry.operator, entry.date, entry.start, ""]]);
        return;
      }
    }
    sheet.appendRow([entry.username, entry.operator, entry.date, entry.start, ""]);
  }

  function clearActiveWork_(sheet, entry) {
    const rows = sheet.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      const sameUser = String(rows[i][0] || "") === entry.username || String(rows[i][1] || "") === entry.operator;
      const sameDate = String(rows[i][2] || "").slice(0, 10) === entry.date;
      if (sameUser && sameDate) sheet.deleteRow(i + 1);
    }
  }
  function getOneSignalConfig_() {
    const props = PropertiesService.getScriptProperties();
    return {
      appId: String(props.getProperty("ONESIGNAL_APP_ID") || "17b43ba4-9ebf-4b66-934c-ee8eb0c98930").trim(),
      apiKey: String(props.getProperty("ONESIGNAL_REST_API_KEY") || "").trim()
    };
  }

  function sendAppNotification(title, message) {
    return sendAppNotificationToAdmins_(SpreadsheetApp.getActiveSpreadsheet(), { title:title, message:message });
  }

  function getGreenApiConfig_() {
    const props = PropertiesService.getScriptProperties();
    const apiUrl = String(props.getProperty("GREEN_API_URL") || "https://7103.api.greenapi.com").replace(/\/+$/, "");
    const idInstance = String(
      props.getProperty("GREEN_API_ID_INSTANCE") ||
      props.getProperty("GREEN_API_INSTANCE_ID") ||
      props.getProperty("ID_INSTANCE") ||
      props.getProperty("idInstance") ||
      ""
    ).trim();
    const apiTokenInstance = String(
      props.getProperty("GREEN_API_TOKEN_INSTANCE") ||
      props.getProperty("GREEN_API_API_TOKEN_INSTANCE") ||
      props.getProperty("API_TOKEN_INSTANCE") ||
      props.getProperty("apiTokenInstance") ||
      ""
    ).trim();

    return {
      apiUrl: apiUrl,
      idInstance: idInstance,
      apiTokenInstance: apiTokenInstance
    };
  }

  function getGreenApiStatus_() {
    const config = getGreenApiConfig_();

    if (!config.idInstance || !config.apiTokenInstance) {
      return {
        success: false,
        error: "missing_green_api_config",
        message: "Set GREEN_API_ID_INSTANCE and GREEN_API_TOKEN_INSTANCE in Apps Script properties"
      };
    }

    const statusCacheKey = "greenApiState:" + config.idInstance;
    try {
      const hit = CacheService.getScriptCache().get(statusCacheKey);
      if (hit) return JSON.parse(hit);
    } catch(e) {}

    const url = config.apiUrl + "/waInstance" + config.idInstance + "/getStateInstance/" + config.apiTokenInstance;
    const res = UrlFetchApp.fetch(url, {
      method: "get",
      muteHttpExceptions: true
    });

    const code = res.getResponseCode();
    const text = res.getContentText();
    let parsed = {};
    try {
      parsed = JSON.parse(text);
    } catch(e) {
      parsed = { raw:text };
    }

    Logger.log("Green API state status: " + code);

    const state = String(parsed.stateInstance || parsed.state || "");

    const result = {
      success: code >= 200 && code < 300 && state === "authorized",
      ok: code >= 200 && code < 300 && state === "authorized",
      status: code,
      stateInstance: state,
      response: parsed
    };

    // ponytail: cache authorized only. A cached failure would outlive the fix for it.
    if (result.success) {
      try { CacheService.getScriptCache().put(statusCacheKey, JSON.stringify(result), 300); } catch(e) {}
    }
    return result;
  }

  function greenApiMessageType_(data) {
    return String(data.messageType || data.whatsappMessageType || (data.reportId ? "reportCompletion" : "")).trim();
  }

  function greenApiIdempotencyKey_(data) {
    const reportId = String(data.reportId || "").trim();
    const messageType = greenApiMessageType_(data);
    if (!reportId || !messageType) return "";
    try {
      const raw = [String(data.sheetId || ""), reportId, messageType].join("|");
      const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8)
        .map(value => (value < 0 ? value + 256 : value).toString(16).padStart(2, "0"))
        .join("");
      return "greenApiSent:" + digest;
    } catch(e) {
      return "";
    }
  }

  function greenApiLedgerLocation_(key) {
    const digest = String(key || "").split(":").pop() || "";
    return {
      property:"greenApiLedger:" + digest.slice(0, 2),
      token:digest.slice(2, 18)
    };
  }

  function greenApiReadLedgerEntry_(key) {
    if (!key) return null;
    try {
      const location = greenApiLedgerLocation_(key);
      const raw = PropertiesService.getScriptProperties().getProperty(location.property);
      if (!raw) return null;
      const bucket = JSON.parse(raw);
      if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
        return { status:"error", error:"ledger_read_failed" };
      }
      const entry = bucket[location.token];
      if (entry === undefined) return null;
      if (!Array.isArray(entry) || !entry[0]) {
        return { status:"error", error:"ledger_read_failed" };
      }
      const status = String(entry[0]);
      const idMessage = String(entry[1] || "");
      const at = Number(entry[2] || 0);
      if (
        ["sending","sent","unknown"].indexOf(status) < 0 ||
        !Number.isFinite(at) ||
        at <= 0 ||
        (status === "sent" && !idMessage)
      ) {
        return { status:"error", error:"ledger_read_failed" };
      }
      const age = Date.now() - at;
      if (age > 180 * 24 * 60 * 60 * 1000) return null;
      return { status:status, idMessage:idMessage, at:at };
    } catch(e) {
      return { status:"error", error:"ledger_read_failed" };
    }
  }

  function greenApiWriteLedgerEntry_(key, status, idMessage) {
    if (!key) return;
    const location = greenApiLedgerLocation_(key);
    const properties = PropertiesService.getScriptProperties();
    let bucket = {};
    const raw = properties.getProperty(location.property);
    if (raw) {
      bucket = JSON.parse(raw);
      if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
        throw new Error("ledger_write_failed");
      }
    }
    const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
    Object.keys(bucket).forEach(token => {
      if (!Array.isArray(bucket[token]) || Number(bucket[token][2] || 0) < cutoff) delete bucket[token];
    });
    if (status) bucket[location.token] = [status, String(idMessage || ""), Date.now()];
    else delete bucket[location.token];
    properties.setProperty(location.property, JSON.stringify(bucket));
  }

  function greenApiLedgerResult_(entry, chatId) {
    if (!entry) return null;
    if (entry.status === "error") {
      return {
        success:false,
        ok:false,
        error:"idempotency_guard_unavailable",
        retryable:true,
        idempotent:true
      };
    }
    if (entry.status === "sent" && entry.idMessage) {
      return {
        success:true,
        ok:true,
        status:200,
        chatId:chatId,
        idMessage:entry.idMessage,
        response:{ idMessage:entry.idMessage },
        duplicate:true,
        idempotent:true
      };
    }
    if (entry.status === "sending" && Date.now() - entry.at < 10 * 60 * 1000) {
      return { success:false, ok:false, error:"message_send_in_progress", retryable:true, idempotent:true };
    }
    if (entry.status === "sending" || entry.status === "unknown") {
      return { success:false, ok:false, error:"delivery_status_unknown", retryable:false, idempotent:true };
    }
    return null;
  }

  function greenApiCachedSendResult_(cache, key, chatId) {
    if (!key) return null;
    try {
      const cached = JSON.parse(cache.get(key) || "null");
      if (!cached || !cached.idMessage) return null;
      return {
        success: true,
        ok: true,
        status: Number(cached.status || 200),
        chatId: chatId,
        idMessage: String(cached.idMessage),
        response: { idMessage:String(cached.idMessage) },
        duplicate: true,
        idempotent: true
      };
    } catch(e) {
      return null;
    }
  }

  function beginGreenApiIdempotentSend_(key, chatId) {
    if (!key) return { proceed:true };
    let cache = null;
    try { cache = CacheService.getScriptCache(); } catch(e) {}
    const cached = greenApiCachedSendResult_(cache, key, chatId);
    if (cached) return { proceed:false, result:cached };
    const persisted = greenApiLedgerResult_(greenApiReadLedgerEntry_(key), chatId);
    if (persisted) return { proceed:false, result:persisted };

    let lock = null;
    let acquiredLock = false;
    try {
      lock = LockService.getScriptLock();
      if (!lock.hasLock()) {
        if (!lock.tryLock(5000)) {
          return { proceed:false, result:{ success:false, ok:false, error:"message_send_in_progress", retryable:true, idempotent:true } };
        }
        acquiredLock = true;
      }
    } catch(e) {
      return {
        proceed:false,
        result:{ success:false, ok:false, error:"idempotency_guard_unavailable", retryable:true, idempotent:true }
      };
    }
    try {
      const lockedCached = greenApiCachedSendResult_(cache, key, chatId);
      if (lockedCached) return { proceed:false, result:lockedCached };
      const lockedPersisted = greenApiLedgerResult_(greenApiReadLedgerEntry_(key), chatId);
      if (lockedPersisted) return { proceed:false, result:lockedPersisted };
      if (cache && cache.get(key + ":sending")) {
        return { proceed:false, result:{ success:false, ok:false, error:"message_send_in_progress", retryable:true, idempotent:true } };
      }
      greenApiWriteLedgerEntry_(key, "sending", "");
      if (cache) cache.put(key + ":sending", "1", 120);
      return { proceed:true };
    } catch(e) {
      return {
        proceed:false,
        result:{ success:false, ok:false, error:"idempotency_guard_unavailable", retryable:true, idempotent:true }
      };
    } finally {
      try { if (lock && acquiredLock) lock.releaseLock(); } catch(e) {}
    }
  }

  function finishGreenApiIdempotentSend_(key, result) {
    if (!key) return;
    let cache = null;
    try { cache = CacheService.getScriptCache(); } catch(e) {}
    let lock = null;
    let acquiredLock = false;
    try {
      lock = LockService.getScriptLock();
      if (!lock.hasLock()) {
        if (!lock.tryLock(5000)) return;
        acquiredLock = true;
      }
      if (result && result.success && result.idMessage) {
        greenApiWriteLedgerEntry_(key, "sent", result.idMessage);
        if (cache) {
          cache.put(key, JSON.stringify({
            status: result.status || 200,
            idMessage: result.idMessage
          }), 21600);
        }
      } else if (result && Number(result.status || 0) >= 400 && Number(result.status || 0) < 500) {
        greenApiWriteLedgerEntry_(key, "", "");
      } else {
        greenApiWriteLedgerEntry_(key, "unknown", "");
      }
    } catch(e) {
    } finally {
      try { if (cache) cache.remove(key + ":sending"); } catch(e) {}
      try { if (lock && acquiredLock) lock.releaseLock(); } catch(e) {}
    }
  }

  function resetGreenApiDeliveryGuard_(data) {
    if (!data || data.confirmReset !== true) {
      return { success:false, error:"explicit_confirmation_required" };
    }
    const key = greenApiIdempotencyKey_(data);
    if (!key) return { success:false, error:"missing_delivery_identity" };
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(5000);
      const entry = greenApiReadLedgerEntry_(key);
      if (entry && entry.status === "error") {
        return { success:false, error:"idempotency_guard_unavailable" };
      }
      let cache = null;
      try { cache = CacheService.getScriptCache(); } catch(e) {}
      if (
        (entry && entry.status === "sent") ||
        greenApiCachedSendResult_(cache, key, "")
      ) {
        return { success:false, error:"delivery_already_confirmed" };
      }
      if (entry && entry.status === "sending" && Date.now() - entry.at < 10 * 60 * 1000) {
        return { success:false, error:"message_send_in_progress" };
      }
      greenApiWriteLedgerEntry_(key, "", "");
      try {
        if (cache) {
          cache.remove(key);
          cache.remove(key + ":sending");
        }
      } catch(e) {}
      return { success:true };
    } catch(e) {
      return { success:false, error:"idempotency_guard_unavailable" };
    } finally {
      try { lock.releaseLock(); } catch(e) {}
    }
  }

  function sendGreenApiWhatsApp_(data) {
    const config = getGreenApiConfig_();

    if (!config.idInstance || !config.apiTokenInstance) {
      return {
        success: false,
        error: "missing_green_api_config",
        message: "Set GREEN_API_ID_INSTANCE and GREEN_API_TOKEN_INSTANCE in Apps Script properties"
      };
    }

    const phone = normalizeGreenApiPhone_(data.phone || data.to || data.clientPhone || "");
    const message = String(data.message || data.text || data.body || "").trim();

    if (!phone) return { success:false, error:"missing_phone" };
    if (!message) return { success:false, error:"missing_message" };

    const state = getGreenApiStatus_();
    if (!state.success) {
      return {
        success: false,
        ok: false,
        error: "green_api_not_authorized",
        status: state.status,
        stateInstance: state.stateInstance || "",
        response: state.response
      };
    }

    const chatId = phone + "@c.us";
    const idempotencyKey = greenApiIdempotencyKey_(data);
    const idempotency = beginGreenApiIdempotentSend_(idempotencyKey, chatId);
    if (!idempotency.proceed) return idempotency.result;

    const url = config.apiUrl + "/waInstance" + config.idInstance + "/sendMessage/" + config.apiTokenInstance;
    const payload = {
      chatId: chatId,
      message: message
    };
    let result = null;
    try {
      const res = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      const code = res.getResponseCode();
      const text = res.getContentText();
      let parsed = {};
      try {
        parsed = JSON.parse(text);
      } catch(e) {
        parsed = { raw:text };
      }

      Logger.log("Green API status: " + code);

      const idMessage = parsed.idMessage || "";
      result = {
        success: code >= 200 && code < 300 && !parsed.error && !!idMessage,
        ok: code >= 200 && code < 300 && !parsed.error && !!idMessage,
        status: code,
        chatId: chatId,
        idMessage: idMessage,
        response: parsed
      };
      return result;
    } finally {
      finishGreenApiIdempotentSend_(idempotencyKey, result);
    }
  }

  function sendGreenApiPoll_(data, ss) {
    const config = getGreenApiConfig_();

    if (!config.idInstance || !config.apiTokenInstance) {
      return {
        success: false,
        error: "missing_green_api_config",
        message: "Set GREEN_API_ID_INSTANCE and GREEN_API_TOKEN_INSTANCE in Apps Script properties"
      };
    }

    const phone = normalizeGreenApiPhone_(data.phone || data.to || data.clientPhone || "");
    const message = String(data.message || "האם מאושר לספק חומרים לאיזון המים?").trim();
    const options = Array.isArray(data.options) && data.options.length ? data.options : ["מאשר אספקה", "לא מאשר"];
    const materialPrices = parseNextSupplyPrices_(data.materialPrices);
    const priceSummary = nextSupplyPriceSummary_(data.supplyLabel || "", materialPrices);

    if (!phone) return { success:false, error:"missing_phone" };
    if (!message) return { success:false, error:"missing_message" };

    const state = getGreenApiStatus_();
    if (!state.success) {
      return {
        success: false,
        ok: false,
        error: "green_api_not_authorized",
        status: state.status,
        stateInstance: state.stateInstance || "",
        response: state.response
      };
    }

    const webhookSetup = data.ensureWebhook === true ? ensureGreenApiPollWebhooks_(data) : { success:true, skipped:true };

    const chatId = phone + "@c.us";
    const url = config.apiUrl + "/waInstance" + config.idInstance + "/sendPoll/" + config.apiTokenInstance;
    const payload = {
      chatId: chatId,
      message: message,
      options: options.map(optionName => ({ optionName: String(optionName) })),
      multipleAnswers: data.multipleAnswers === true
    };

    const res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = res.getResponseCode();
    const text = res.getContentText();
    let parsed = {};
    try {
      parsed = JSON.parse(text);
    } catch(e) {
      parsed = { raw:text };
    }

    const idMessage = parsed.idMessage || "";
    const success = code >= 200 && code < 300 && !parsed.error && !!idMessage;
    if (ss) {
      const sheet = getMaterialApprovalsSheet_(ss);
      sheet.appendRow([
        Utilities.formatDate(new Date(), "Asia/Jerusalem", "yyyy-MM-dd HH:mm:ss"),
        data.client || "",
        phone,
        data.reportId || "",
        idMessage,
        success ? "pending" : "send_failed",
        "",
        "",
        "",
        JSON.stringify({
          chatId: chatId,
          message: message,
          options: options,
          supplyLabel: data.supplyLabel || "",
          phUp: data.phUp || 0,
          acidLiters: data.acidLiters || 0,
          saltBags: data.saltBags || 0,
          materialPrices: materialPrices,
          priceSummary: priceSummary,
          status: code,
          response: parsed,
          webhookSetup: webhookSetup
        })
      ]);
    }

    return {
      success: success,
      ok: success,
      status: code,
      chatId: chatId,
      idMessage: idMessage,
      webhookSetup: webhookSetup,
      response: parsed
    };
  }

  function getGreenApiWebhookUrl_(data) {
    const props = PropertiesService.getScriptProperties();
    const explicit = String(
      (data && data.webhookUrl) ||
      props.getProperty("GREEN_API_WEBHOOK_URL") ||
      props.getProperty("WEBHOOK_URL") ||
      ""
    ).trim();
    if (explicit) return explicit;

    try {
      return ScriptApp.getService().getUrl();
    } catch(e) {
      return "";
    }
  }

  function ensureGreenApiPollWebhooks_(data) {
    const config = getGreenApiConfig_();
    if (!config.idInstance || !config.apiTokenInstance) {
      return { success:false, skipped:true, error:"missing_green_api_config" };
    }

    const webhookUrl = getGreenApiWebhookUrl_(data || {});
    if (!webhookUrl) return { success:false, skipped:true, error:"missing_webhook_url" };

    const props = PropertiesService.getScriptProperties();
    const cacheKey = "GREEN_API_POLL_WEBHOOKS_CONFIGURED";
    const cache = String(props.getProperty(cacheKey) || "");
    const now = Date.now();
    const parts = cache.split("|");
    const cachedUrl = parts[0] || "";
    const cachedAt = Number(parts[1] || 0);
    if (cachedUrl === webhookUrl && now - cachedAt < 24 * 60 * 60 * 1000) {
      return { success:true, skipped:true, cached:true, webhookUrl:webhookUrl };
    }

    const url = config.apiUrl + "/waInstance" + config.idInstance + "/setSettings/" + config.apiTokenInstance;
    const payload = {
      webhookUrl: webhookUrl,
      incomingWebhook: "yes",
      pollMessageWebhook: "yes"
    };

    const res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = res.getResponseCode();
    const text = res.getContentText();
    let parsed = {};
    try {
      parsed = JSON.parse(text);
    } catch(e) {
      parsed = { raw:text };
    }

    const success = code >= 200 && code < 300 && parsed.saveSettings !== false && !parsed.error;
    if (success) props.setProperty(cacheKey, webhookUrl + "|" + now);

    Logger.log("Green API webhook setup status: " + code);

    return {
      success: success,
      status: code,
      webhookUrl: webhookUrl,
      response: parsed
    };
  }

  function materialApprovalHeaders_() {
    return ["timestamp","client","phone","reportId","pollMessageId","status","answer","answeredAt","sender","raw"];
  }

  function chlorineReminderHeaders_() {
    return ["id","reportId","לקוח","clientId","טלפון","מפעיל","תאריך_דוח","createdAt","dueAt","daysDelay","message","status","sentAt","greenApiMessageId","error","updatedAt"];
  }

  function getMaterialApprovalsSheet_(ss) {
    let sheet = ss.getSheetByName("MaterialApprovals");
    if (!sheet) {
      sheet = ss.insertSheet("MaterialApprovals");
      sheet.appendRow(materialApprovalHeaders_());
    } else if (sheet.getLastRow() === 0) {
      sheet.appendRow(materialApprovalHeaders_());
    } else {
      ensureColumns(sheet, materialApprovalHeaders_());
    }
    return sheet;
  }

  function getChlorineReminderSheet_(ss) {
    let sheet = ss.getSheetByName("תזכורות_כלור");
    if (!sheet) {
      sheet = ss.insertSheet("תזכורות_כלור");
      sheet.appendRow(chlorineReminderHeaders_());
    } else if (sheet.getLastRow() === 0) {
      sheet.appendRow(chlorineReminderHeaders_());
    } else {
      ensureColumns(sheet, chlorineReminderHeaders_());
    }
    return sheet;
  }

  function isTruthy_(value) {
    if (value === true) return true;
    const text = String(value || "").trim().toLowerCase();
    return ["true","1","yes","y","כן","מסומן"].includes(text);
  }

  function reminderDateText_(date) {
    return Utilities.formatDate(date, "Asia/Jerusalem", "yyyy-MM-dd HH:mm:ss");
  }

  function parseReminderDate_(value) {
    if (!value) return null;
    if (value instanceof Date && !isNaN(value)) return value;
    const text = String(value).trim();
    const parsed = new Date(text);
    if (!isNaN(parsed)) return parsed;
    const normalized = normalizeReportDate_(text);
    if (normalized) return new Date(normalized + "T00:00:00+02:00");
    return null;
  }

  function addReminderDays_(date, days) {
    const d = new Date((date || new Date()).getTime());
    d.setDate(d.getDate() + (Number(days) || 3));
    return d;
  }

  function updateChlorineReminderRow_(sheet, rowNumber, headers, updates) {
    Object.keys(updates || {}).forEach(key => {
      const idx = headers.indexOf(key);
      if (idx >= 0) sheet.getRange(rowNumber, idx + 1).setValue(updates[key]);
    });
  }

  function getClientPhoneForReminder_(ss, clientName, clientId, fallbackPhone) {
    const fallback = normalizeGreenApiPhone_(fallbackPhone || "");
    if (fallback) return fallback;
    const wantedId = normalizeReportValue_(clientId).toLowerCase();
    const wantedName = normalizeReportValue_(clientName).toLowerCase();
    const clients = allClientRecords_(ss);
    const found = wantedId
      ? clients.find(c => normalizeReportValue_(c.clientId).toLowerCase() === wantedId)
      : (() => {
          const matches = clients.filter(c => wantedName && normalizeReportValue_(c.name).toLowerCase() === wantedName);
          return matches.length === 1 ? matches[0] : null;
        })();
    return normalizeGreenApiPhone_(found && found.phone);
  }

  function findChlorineReminderRow_(sheet, headers, reportId, reminderId) {
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return { row:0, status:"" };
    const reportIdx = headers.indexOf("reportId");
    const idIdx = headers.indexOf("id");
    const statusIdx = headers.indexOf("status");
    for (let i = values.length - 1; i >= 1; i--) {
      const row = values[i];
      const sameReport = reportIdx >= 0 && reportId && String(row[reportIdx] || "").trim() === reportId;
      const sameId = idIdx >= 0 && reminderId && String(row[idIdx] || "").trim() === reminderId;
      if (sameReport || sameId) {
        return { row:i + 1, status:statusIdx >= 0 ? String(row[statusIdx] || "").trim() : "" };
      }
    }
    return { row:0, status:"" };
  }

  function queueChlorineTabletReminderSafe_(ss, report, data, reportIdOverride) {
    try {
      return queueChlorineTabletReminder_(ss, report, data, reportIdOverride);
    } catch(e) {
      Logger.log("Chlorine reminder queue failed");
      return { success:false, error:String(e) };
    }
  }

  function queueChlorineTabletReminder_(ss, report, data, reportIdOverride) {
    const r = report || {};
    if (!isTruthy_(r.sendReminder)) return { skipped:true };

    const sheet = getChlorineReminderSheet_(ss);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h || "").trim());
    const reportId = String(reportIdOverride || r.id || Utilities.getUuid()).trim();
    const client = String(r.client || "").trim();
    const clientId = String(r.clientId || "").trim();
    const operator = String(r.operator || "").trim();
    const createdAtDate = parseReminderDate_(r.chlorineReminderCreatedAt) || new Date();
    const dueAtDate = parseReminderDate_(r.chlorineReminderDueAt) || addReminderDays_(createdAtDate, 3);
    const createdAt = reminderDateText_(createdAtDate);
    const dueAt = reminderDateText_(dueAtDate);
    const phone = getClientPhoneForReminder_(ss, client, clientId, data && data.clientPhone);
    const reminderId = "chlorine-" + (reportId || Utilities.getUuid());
    const now = reminderDateText_(new Date());
    const message = String(r.chlorineReminderMessage || "יש להוסיף טבלית כלור :)").trim() || "יש להוסיף טבלית כלור :)";
    const existing = findChlorineReminderRow_(sheet, headers, reportId, reminderId);

    if (existing.row && existing.status === "נשלחה") {
      return { success:true, skipped:true, alreadySent:true, row:existing.row, dueAt };
    }

    const record = {
      id: reminderId,
      reportId,
      "לקוח": client,
      clientId,
      "טלפון": phone,
      "מפעיל": operator,
      "תאריך_דוח": normalizeReportDate_(r.reportDate) || r.reportDate || "",
      createdAt,
      dueAt,
      daysDelay: 3,
      message,
      status: "ממתינה",
      sentAt: "",
      greenApiMessageId: "",
      error: phone ? "" : "missing_phone",
      updatedAt: now
    };

    if (existing.row) {
      updateChlorineReminderRow_(sheet, existing.row, headers, record);
      return { success:true, queued:true, updated:true, row:existing.row, dueAt };
    }

    sheet.appendRow(headers.map(h => record[h] !== undefined ? record[h] : ""));
    return { success:true, queued:true, row:sheet.getLastRow(), dueAt };
  }

  function sendDueChlorineTabletReminders_(ss) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(5000);
      const sheet = getChlorineReminderSheet_(ss);
      const values = sheet.getDataRange().getValues();
      if (values.length < 2) return { success:true, sent:0, failed:0 };

      const headers = values[0].map(h => String(h || "").trim());
      const idx = name => headers.indexOf(name);
      const statusIdx = idx("status");
      const dueIdx = idx("dueAt");
      const phoneIdx = idx("טלפון");
      const clientIdx = idx("לקוח");
      const clientIdIdx = idx("clientId");
      const reportIdx = idx("reportId");
      const messageIdx = idx("message");
      const now = new Date();
      let sent = 0;
      let failed = 0;

      for (let i = 1; i < values.length; i++) {
        const row = values[i];
        const status = statusIdx >= 0 ? String(row[statusIdx] || "").trim() : "";
        if (status && status !== "ממתינה") continue;

        const dueAt = dueIdx >= 0 ? parseReminderDate_(row[dueIdx]) : null;
        if (!dueAt || dueAt.getTime() > now.getTime()) continue;

        const rowNumber = i + 1;
        const client = clientIdx >= 0 ? String(row[clientIdx] || "").trim() : "";
        const clientId = clientIdIdx >= 0 ? String(row[clientIdIdx] || "").trim() : "";
        const reportId = reportIdx >= 0 ? String(row[reportIdx] || "").trim() : "";
        const phone = getClientPhoneForReminder_(ss, client, clientId, phoneIdx >= 0 ? row[phoneIdx] : "");
        const message = String(messageIdx >= 0 ? row[messageIdx] || "" : "").trim() || "יש להוסיף טבלית כלור :)";

        if (!phone) {
          failed++;
          updateChlorineReminderRow_(sheet, rowNumber, headers, {
            status: "שגיאה",
            error: "missing_phone",
            updatedAt: reminderDateText_(new Date())
          });
          continue;
        }

        try {
          const res = sendGreenApiWhatsApp_({ phone, message, client, reportId, messageType:"chlorineReminder", sheetId:ss.getId() });
          if (res && res.success) {
            sent++;
            updateChlorineReminderRow_(sheet, rowNumber, headers, {
              "טלפון": phone,
              status: "נשלחה",
              sentAt: reminderDateText_(new Date()),
              greenApiMessageId: res.idMessage || "",
              error: "",
              updatedAt: reminderDateText_(new Date())
            });
          } else {
            failed++;
            updateChlorineReminderRow_(sheet, rowNumber, headers, {
              "טלפון": phone,
              status: "שגיאה",
              error: JSON.stringify(res || { error:"send_failed" }).slice(0, 500),
              updatedAt: reminderDateText_(new Date())
            });
          }
        } catch(e) {
          failed++;
          updateChlorineReminderRow_(sheet, rowNumber, headers, {
            "טלפון": phone,
            status: "שגיאה",
            error: String(e).slice(0, 500),
            updatedAt: reminderDateText_(new Date())
          });
        }
      }

      return { success:true, sent, failed };
    } catch(e) {
      Logger.log("Chlorine reminder send failed");
      return { success:false, error:String(e) };
    } finally {
      try { lock.releaseLock(); } catch(e) {}
    }
  }

  function getMaterialApprovals_(ss) {
    const sheet = getMaterialApprovalsSheet_(ss);
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];
    const headers = values[0].map(String);
    return values.slice(1).map((row, idx) => {
      const item = { rowIndex: idx + 2 };
      headers.forEach((h, i) => item[h] = row[i]);
      try {
        item.meta = item.raw ? JSON.parse(String(item.raw)) : {};
      } catch(e) {
        item.meta = {};
      }
      return item;
    }).filter(item => item.pollMessageId || item.reportId || item.client);
  }

  function updateMaterialApproval_(ss, data) {
    const sheet = getMaterialApprovalsSheet_(ss);
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(String);
    const statusCol = headers.indexOf("status");
    const rawCol = headers.indexOf("raw");
    let row = Number(data.rowIndex || 0);
    if (!row && data.pollMessageId) {
      const pollCol = headers.indexOf("pollMessageId");
      const found = values.findIndex((r, idx) => idx > 0 && String(r[pollCol] || "") === String(data.pollMessageId));
      if (found > 0) row = found + 1;
    }
    if (row < 2 || row > sheet.getLastRow()) return { success:false, error:"approval_not_found" };
    if (statusCol >= 0) sheet.getRange(row, statusCol + 1).setValue(data.status || "admin_added");
    if (rawCol >= 0) {
      let raw = {};
      try { raw = JSON.parse(String(sheet.getRange(row, rawCol + 1).getValue() || "{}")); } catch(e) {}
      raw.admin = {
        status: data.status || "admin_added",
        operator: data.operator || "",
        supplyDate: data.supplyDate || "",
        updatedAt: Utilities.formatDate(new Date(), "Asia/Jerusalem", "yyyy-MM-dd HH:mm:ss")
      };
      sheet.getRange(row, rawCol + 1).setValue(JSON.stringify(raw));
    }
    return { success:true };
  }

  function normalizeApprovalText_(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isApprovedMaterialApproval_(approval) {
    const status = normalizeApprovalText_(approval.status);
    const answer = normalizeApprovalText_(approval.answer);
    return (status === "approved" || (answer.indexOf("מאשר") >= 0 && answer.indexOf("לא") < 0)) &&
      ["admin_added","auto_added","added","rejected"].indexOf(status) < 0;
  }

  function materialSupplyFromApproval_(approval) {
    const meta = approval.meta || {};
    const label = String(meta.supplyLabel || "").trim();
    const parts = label.split(",").map(x => x.trim()).filter(Boolean);
    const saltPart = parts.find(x => x.indexOf("מלח") >= 0) || "";
    const saltBags = Number(meta.saltBags || (saltPart.match(/\d+/) || [0])[0] || 0);
    return {
      acid: parts.some(x => x.indexOf("חומצת") >= 0),
      phUpSupply: parts.some(x => x.indexOf("מעלה") >= 0 || x.indexOf("סודה") >= 0),
      saltPkg: parts.some(x => x.indexOf("מלח") >= 0) && saltBags > 0,
      saltBags: saltBags
    };
  }

  function hasMaterialSupply_(supply) {
    return !!(supply && (supply.acid || supply.phUpSupply || (supply.saltPkg && Number(supply.saltBags || 0) > 0)));
  }

  function parseNextSupplyPrices_(value) {
    const defaults = {"חומצת מלח":100,"סודה אש":120};
    if (value && typeof value === "object") {
      Object.keys(value).forEach(function(key) {
        const n = Number(value[key]);
        if (!isNaN(n) && n >= 0) defaults[key] = n;
      });
      return defaults;
    }
    const text = String(value || "").trim();
    if (!text) return defaults;
    try {
      return parseNextSupplyPrices_(JSON.parse(text));
    } catch(e) {}
    text.split(/[;\n,]+/).map(function(x){ return x.trim(); }).filter(Boolean).forEach(function(part) {
      const m = part.match(/^(.+?)\s*[:=\-]\s*(\d+(?:\.\d+)?)/);
      if (m) defaults[m[1].trim()] = Number(m[2]) || 0;
    });
    return defaults;
  }

  function nextSupplyPriceSummary_(supplyLabel, prices) {
    const label = String(supplyLabel || "");
    const map = parseNextSupplyPrices_(prices);
    const rows = [];
    if (label.indexOf("חומצת") >= 0) rows.push("חומצת מלח - " + (map["חומצת מלח"] || 0) + " שח");
    if (label.indexOf("מעלה") >= 0 || label.indexOf("סודה") >= 0) rows.push("סודה אש - " + (map["סודה אש"] || 0) + " שח");
    return rows.join("\n");
  }

  function defaultNextSupplyPricesText_() {
    return JSON.stringify(parseNextSupplyPrices_({}));
  }

  function ensureNextSupplyPriceColumn_(sheet) {
    if (!sheet) return;
    ensureColumns(sheet, ["מחיר_פר_חומר_לטיפול_הבא"]);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    const idx = headers.indexOf("מחיר_פר_חומר_לטיפול_הבא") + 1;
    if (!idx) return;
    const last = sheet.getLastRow();
    if (last < 4) return;
    const range = sheet.getRange(4, idx, last - 3, 1);
    const values = range.getValues();
    let changed = false;
    const fallback = defaultNextSupplyPricesText_();
    const next = values.map(function(row) {
      if (String(row[0] || "").trim()) return row;
      changed = true;
      return [fallback];
    });
    if (changed) range.setValues(next);
  }

  function supplyIdForClient_(client, clientId) {
    const normalized = poolIdentityKey_(clientId, client);
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, normalized, Utilities.Charset.UTF_8);
    return "SUP-" + Utilities.base64EncodeWebSafe(digest).replace(/=+$/,"").slice(0, 12);
  }

  function supplyHeaderMap_(sheet) {
    const headers = ["לקוח","חומצת_מלח","מעלה_pH","שקי_מלח","כמות_שקים","עודכן","הערת_חומרים","nextSupplyDate","assignedOperator","מחיר_פר_חומר_לטיפול_הבא","supplyId","clientId"];
    if (sheet.getLastRow() === 0) sheet.appendRow(headers);
    ensureColumns(sheet, headers);
    while (sheet.getLastRow() < 3) sheet.appendRow([""]);
    const row = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    const map = {};
    row.forEach(function(h, i) { map[h] = i + 1; });
    return map;
  }

  function upsertSupplyDBRow_(ss, inputRow) {
    try {
      let sheet = ss.getSheetByName("ציוד_לקוחות");
      if (!sheet) sheet = ss.insertSheet("ציוד_לקוחות");
      const row = Array.isArray(inputRow) ? inputRow.slice() : [];
      const client = String(row[0] || "").trim();
      const clientId = String(row[11] || "").trim();
      if (!client) return { success:false, error:"missing supply client" };
      const map = supplyHeaderMap_(sheet);
      const normalizedClient = normalizeReportValue_(client).toLowerCase();
      let sameNamePoolCount = 0;
      const clientsSheet = ss.getSheetByName("לקוחות");
      if (clientsSheet) {
        const clientRows = clientsSheet.getDataRange().getValues();
        const clientHeaderIndex = clientRows.findIndex(values => values.some(isClientNameHeader_));
        const clientHeaders = (clientRows[clientHeaderIndex] || []).map(value => String(value || "").trim());
        const clientNameIndex = clientHeaders.findIndex(isClientNameHeader_);
        if (clientNameIndex >= 0) {
          sameNamePoolCount = clientRows.slice(clientHeaderIndex + 1)
            .filter(values => normalizeReportValue_(values[clientNameIndex]).toLowerCase() === normalizedClient)
            .length;
        }
      }
      if (!clientId && sameNamePoolCount !== 1) {
        return { success:false, error:"ambiguous supply client", client:client };
      }
      const allowLegacyNameFallback = sameNamePoolCount === 1;
      let targetRow = 0;
      const last = sheet.getLastRow();
      if (last >= 4) {
        const clients = sheet.getRange(4, map["לקוח"], last - 3, 1).getValues();
        const clientIds = map["clientId"] ? sheet.getRange(4, map["clientId"], last - 3, 1).getValues() : [];
        for (let i = 0; i < clients.length; i++) {
          const rowClientId = String(clientIds[i] && clientIds[i][0] || "").trim();
          if (clientId && rowClientId && clientId === rowClientId) {
            targetRow = i + 4;
            break;
          }
        }
        if (!targetRow && allowLegacyNameFallback) {
          for (let i = 0; i < clients.length; i++) {
            const rowClientId = String(clientIds[i] && clientIds[i][0] || "").trim();
            if (clientId && rowClientId) continue;
            if (normalizeReportValue_(clients[i][0]).toLowerCase() === normalizedClient) {
              targetRow = i + 4;
              break;
            }
          }
        }
      }
      if (!targetRow) {
        targetRow = Math.max(sheet.getLastRow() + 1, 4);
        sheet.getRange(targetRow, map["לקוח"]).setValue(client);
      }
      const values = {
        "לקוח": client,
        "חומצת_מלח": row[1] || "לא",
        "מעלה_pH": row[2] || "לא",
        "שקי_מלח": row[3] || "לא",
        "כמות_שקים": row[4] || 0,
        "עודכן": row[5] || "",
        "הערת_חומרים": row[6] || "",
        "nextSupplyDate": row[7] || "",
        "assignedOperator": row[8] || "",
        "מחיר_פר_חומר_לטיפול_הבא": row[9] || defaultNextSupplyPricesText_(),
        "supplyId": row[10] || supplyIdForClient_(client, clientId),
        "clientId": clientId
      };
      Object.keys(values).forEach(function(header) {
        if (map[header]) sheet.getRange(targetRow, map[header]).setValue(values[header]);
      });
      const saved = sheet.getRange(targetRow, 1, 1, sheet.getLastColumn()).getValues()[0];
      const get = function(header) { return String(saved[(map[header] || 1) - 1] || "").trim(); };
      const materialOk = get("חומצת_מלח") === String(values["חומצת_מלח"]) &&
        get("מעלה_pH") === String(values["מעלה_pH"]) &&
        get("שקי_מלח") === String(values["שקי_מלח"]);
      const dateOk = get("nextSupplyDate") === String(values["nextSupplyDate"]);
      const operatorOk = get("assignedOperator") === String(values["assignedOperator"]);
      const idOk = !!get("supplyId");
      const clientIdOk = !clientId || get("clientId") === clientId;
      if (!materialOk || !dateOk || !operatorOk || !idOk || !clientIdOk) {
        return { success:false, row:targetRow, error:"supply verification failed", materialOk:materialOk, dateOk:dateOk, operatorOk:operatorOk, idOk:idOk, clientIdOk:clientIdOk };
      }
      return { success:true, row:targetRow, supplyId:get("supplyId") };
    } catch(e) {
      return { success:false, error:String(e) };
    }
  }

  function writeSupplyDB_(ss, db) {
    Object.keys(db || {}).forEach(storageKey => {
      const v = db[storageKey] || {};
      const rawKey = String(storageKey || "");
      const client = String(v.client || (rawKey.indexOf("legacy:") === 0 ? rawKey.slice(7) : rawKey) || "").trim();
      const clientId = String(v.clientId || "").trim();
      if (!client) return;
      upsertSupplyDBRow_(ss, [
        client,
        v.acid ? "כן" : "לא",
        v.phUpSupply ? "כן" : "לא",
        v.saltPkg ? "כן" : "לא",
        v.saltBags || 0,
        v.updatedAt || "",
        v.supplyNote || "",
        v.nextSupplyDate || "",
        v.assignedOperator || "",
        JSON.stringify(parseNextSupplyPrices_(v.materialPrices)),
        v.supplyId || supplyIdForClient_(client, clientId),
        clientId
      ]);
    });
    return;
    let sheet = ss.getSheetByName("ציוד_לקוחות");
    if (!sheet) sheet = ss.insertSheet("ציוד_לקוחות");
    const headers = ["לקוח","חומצת_מלח","מעלה_pH","שקי_מלח","כמות_שקים","עודכן","הערת_חומרים","nextSupplyDate","assignedOperator","מחיר_פר_חומר_לטיפול_הבא"];
    if (sheet.getLastRow() === 0) sheet.appendRow(headers);
    ensureColumns(sheet, headers);
    while (sheet.getLastRow() < 3) sheet.appendRow([""]);
    const last = sheet.getLastRow();
    if (last > 3) sheet.deleteRows(4, last - 3);
    Object.keys(db || {}).forEach(client => {
      const v = db[client] || {};
      sheet.appendRow([
        client,
        v.acid ? "כן" : "לא",
        v.phUpSupply ? "כן" : "לא",
        v.saltPkg ? "כן" : "לא",
        v.saltBags || 0,
        v.updatedAt || "",
        v.supplyNote || "",
        v.nextSupplyDate || "",
        v.assignedOperator || "",
        JSON.stringify(parseNextSupplyPrices_(v.materialPrices))
      ]);
    });
  }

  function markMaterialApprovalSynced_(ss, approval, status, operator, date) {
    const sheet = getMaterialApprovalsSheet_(ss);
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(String);
    const statusCol = headers.indexOf("status");
    const rawCol = headers.indexOf("raw");
    let row = Number(approval.rowIndex || 0);
    if (!row && approval.pollMessageId) {
      const pollCol = headers.indexOf("pollMessageId");
      const found = values.findIndex((r, idx) => idx > 0 && String(r[pollCol] || "") === String(approval.pollMessageId));
      if (found > 0) row = found + 1;
    }
    if (row < 2 || row > sheet.getLastRow()) return false;
    if (statusCol >= 0) sheet.getRange(row, statusCol + 1).setValue(status);
    if (rawCol >= 0) {
      let raw = {};
      try { raw = JSON.parse(String(sheet.getRange(row, rawCol + 1).getValue() || "{}")); } catch(e) {}
      raw.autoSync = {
        status: status,
        operator: operator || "",
        supplyDate: date || "",
        updatedAt: Utilities.formatDate(new Date(), "Asia/Jerusalem", "yyyy-MM-dd HH:mm:ss")
      };
      sheet.getRange(row, rawCol + 1).setValue(JSON.stringify(raw));
    }
    return true;
  }

  function syncDailyMaterialApprovals_(ss, date) {
    const targetDate = String(date || Utilities.formatDate(new Date(), "Asia/Jerusalem", "yyyy-MM-dd")).slice(0, 10);
    return {
      success: true,
      disabled: true,
      date: targetDate,
      synced: [],
      waitingForOrder: []
    };
    /*
      Legacy customer-poll sync is intentionally disabled. Customers no longer
      approve materials, and name-only answers cannot identify one of several pools.
    */
    const orders = getAdminOrders_(ss).filter(o => String(o.date || "").slice(0, 10) === targetDate && o.client && o.operator);
    const ordersByClient = {};
    orders.sort((a,b) => Number(a.orderIndex || 9999) - Number(b.orderIndex || 9999)).forEach(o => {
      const key = normalizeReportValue_(o.client);
      if (!ordersByClient[key]) ordersByClient[key] = [];
      ordersByClient[key].push(o);
    });

    const approvals = getMaterialApprovals_(ss).filter(isApprovedMaterialApproval_);
    const db = getSupplyDB_(ss);
    const synced = [];
    const waitingForOrder = [];

    approvals.forEach(approval => {
      const matchingOrders = ordersByClient[normalizeReportValue_(approval.client)] || [];
      const supply = materialSupplyFromApproval_(approval);
      if (!hasMaterialSupply_(supply)) return;
      if (matchingOrders.length !== 1) {
        waitingForOrder.push(approval.client);
        return;
      }

      const order = matchingOrders[0];
      const client = order.client || approval.client;
      const clientId = String(order.clientId || "").trim();
      const storageKey = clientId || ("legacy:" + client);
      const prev = db[storageKey] || {};
      db[storageKey] = {
        ...prev,
        client: client,
        clientId: clientId,
        acid: !!(prev.acid || supply.acid),
        phUpSupply: !!(prev.phUpSupply || supply.phUpSupply),
        saltPkg: !!(prev.saltPkg || supply.saltPkg),
        saltBags: supply.saltPkg ? Number(supply.saltBags || prev.saltBags || 0) : Number(prev.saltBags || 0),
        supplyNote: prev.supplyNote || "",
        updatedAt: targetDate,
        nextSupplyDate: targetDate,
        assignedOperator: order.operator
      };
      markMaterialApprovalSynced_(ss, approval, "auto_added", order.operator, targetDate);
      synced.push({ client:client, clientId:clientId, operator:order.operator });
    });

    if (synced.length) writeSupplyDB_(ss, db);
    Logger.log("Daily material approvals sync: " + JSON.stringify({date:targetDate, synced:synced.length, waitingForOrder:waitingForOrder.length}));
    return {
      success: true,
      date: targetDate,
      synced: synced,
      waitingForOrder: waitingForOrder
    };
  }

  function syncDailyMaterialApprovals() {
    const ss = getNotificationSyncSpreadsheet_();
    const res = syncDailyMaterialApprovals_(ss);
    Logger.log(JSON.stringify(res));
    return res;
  }

  function dryRunReportMaterialSupplyFlow() {
    const tests = [
      {
        name: "quantities_do_not_create_supply",
        approval: { meta: { supplyLabel: "", acidLiters: 2, phUp: 1, saltBags: 1 } },
        expected: { acid:false, phUpSupply:false, saltPkg:false, saltBags:0, has:false }
      },
      {
        name: "acid_label_creates_acid_only",
        approval: { meta: { supplyLabel: "חומצת מלח" } },
        expected: { acid:true, phUpSupply:false, saltPkg:false, saltBags:0, has:true }
      },
      {
        name: "ph_up_label_creates_ph_up_only",
        approval: { meta: { supplyLabel: "מעלה pH" } },
        expected: { acid:false, phUpSupply:true, saltPkg:false, saltBags:0, has:true }
      },
      {
        name: "salt_without_quantity_is_not_supply",
        approval: { meta: { supplyLabel: "מלח" } },
        expected: { acid:false, phUpSupply:false, saltPkg:false, saltBags:0, has:false }
      },
      {
        name: "salt_with_quantity_creates_supply",
        approval: { meta: { supplyLabel: "מלח ×2" } },
        expected: { acid:false, phUpSupply:false, saltPkg:true, saltBags:2, has:true }
      }
    ];

    const results = tests.map(function(test) {
      const actual = materialSupplyFromApproval_(test.approval);
      actual.has = hasMaterialSupply_(actual);
      const ok = actual.acid === test.expected.acid &&
        actual.phUpSupply === test.expected.phUpSupply &&
        actual.saltPkg === test.expected.saltPkg &&
        Number(actual.saltBags || 0) === Number(test.expected.saltBags || 0) &&
        actual.has === test.expected.has;
      return { name:test.name, ok:ok, expected:test.expected, actual:actual };
    });

    const summary = {
      success: results.every(function(r) { return r.ok; }),
      dryRun: true,
      writesToSheets: false,
      sendsWhatsApp: false,
      results: results
    };
    Logger.log(JSON.stringify(summary));
    return summary;
  }

  function testMaterialApprovalWebhookDryRun() {
    const ss = getNotificationSyncSpreadsheet_();
    const sheet = getMaterialApprovalsSheet_(ss);
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(String);
    const pollCol = headers.indexOf("pollMessageId");
    const statusCol = headers.indexOf("status");
    const rowIndex = values.findIndex((row, idx) =>
      idx > 0 &&
      String(row[pollCol] || "").trim() &&
      String(row[statusCol] || "").trim() === "pending"
    );

    if (rowIndex < 1) {
      Logger.log("No pending material approval poll found for dry run");
      return { success:false, error:"no_pending_poll" };
    }

    const pollMessageId = String(values[rowIndex][pollCol] || "").trim();
    const fakeWebhook = {
      typeWebhook: "incomingMessageReceived",
      senderData: {
        chatId: "972500000000@c.us",
        sender: "972500000000@c.us",
        senderName: "System dry run"
      },
      messageData: {
        typeMessage: "pollUpdateMessage",
        pollMessageData: {
          stanzaId: pollMessageId,
          name: "האם מאושר לספק חומרים לאיזון המים?",
          votes: [
            { optionName: "מאשר אספקה", optionVoters: ["972500000000@c.us"] },
            { optionName: "לא מאשר", optionVoters: [] }
          ],
          multipleAnswers: false
        }
      }
    };

    const result = handleGreenApiIncomingWebhook_(fakeWebhook, ss);
    Logger.log("Green API webhook dry run status: " + !!result.success);
    return result;
  }

  function handleGreenApiIncomingWebhook_(data, ss) {
    const messageData = data.messageData || {};
    if (messageData.typeMessage !== "pollUpdateMessage") {
      return { success:true, ignored:true, typeMessage:messageData.typeMessage || "" };
    }

    const poll = messageData.pollMessageData || {};
    const pollMessageId = String(poll.stanzaId || "");
    const votes = Array.isArray(poll.votes) ? poll.votes : [];
    const selected = votes.filter(v => Array.isArray(v.optionVoters) && v.optionVoters.length > 0);
    const answer = selected.map(v => String(v.optionName || "")).filter(Boolean).join(", ");
    if (!pollMessageId || !answer) {
      return { success:true, ignored:true, reason:"missing_poll_or_answer" };
    }

    const sheet = getMaterialApprovalsSheet_(ss);
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(String);
    const pollCol = headers.indexOf("pollMessageId");
    const statusCol = headers.indexOf("status");
    const answerCol = headers.indexOf("answer");
    const answeredAtCol = headers.indexOf("answeredAt");
    const senderCol = headers.indexOf("sender");
    const rawCol = headers.indexOf("raw");
    const rowIndex = values.findIndex((row, idx) => idx > 0 && String(row[pollCol] || "") === pollMessageId);
    if (rowIndex < 1) {
      Logger.log("Ignored unknown Green API poll update");
      return { success:true, ignored:true, matched:false, reason:"unknown_poll", pollMessageId:pollMessageId };
    }
    if (rowIndex < 1) {
      sheet.appendRow([
        Utilities.formatDate(new Date(), "Asia/Jerusalem", "yyyy-MM-dd HH:mm:ss"),
        "",
        String((data.senderData || {}).chatId || ""),
        "",
        pollMessageId,
        answer.indexOf("לא") >= 0 ? "rejected" : "approved",
        answer,
        Utilities.formatDate(new Date(), "Asia/Jerusalem", "yyyy-MM-dd HH:mm:ss"),
        String((data.senderData || {}).sender || ""),
        JSON.stringify(data)
      ]);
      return { success:true, saved:true, matched:false, answer:answer };
    }

    const row = rowIndex + 1;
    let storedRaw = {};
    try {
      storedRaw = rawCol >= 0 ? JSON.parse(String(values[rowIndex][rawCol] || "{}")) : {};
    } catch(e) {
      storedRaw = {};
    }
    const allowedOptions = Array.isArray(storedRaw.options) ? storedRaw.options.map(String) : [];
    if (allowedOptions.length && allowedOptions.indexOf(answer) < 0) {
      Logger.log("Ignored unexpected Green API poll answer");
      return { success:true, ignored:true, matched:true, reason:"unexpected_answer", pollMessageId:pollMessageId, answer:answer };
    }
    const answerIndex = allowedOptions.indexOf(answer);
    const pollStatus = answerIndex > 0 ? "rejected" : "";
    const status = answer.indexOf("לא") >= 0 ? "rejected" : "approved";
    if (statusCol >= 0) sheet.getRange(row, statusCol + 1).setValue(pollStatus || status);
    if (answerCol >= 0) sheet.getRange(row, answerCol + 1).setValue(answer);
    if (answeredAtCol >= 0) sheet.getRange(row, answeredAtCol + 1).setValue(Utilities.formatDate(new Date(), "Asia/Jerusalem", "yyyy-MM-dd HH:mm:ss"));
    if (senderCol >= 0) sheet.getRange(row, senderCol + 1).setValue(String((data.senderData || {}).sender || ""));
    if (rawCol >= 0) sheet.getRange(row, rawCol + 1).setValue(JSON.stringify(data));

    try {
      sendAppNotificationToAdmins_(ss, {
        title: status === "approved" ? "לקוח אישר אספקת חומרים" : "לקוח לא אישר אספקת חומרים",
        message: `${values[rowIndex][1] || "לקוח"} · ${answer}`
      });
    } catch(e) {
      Logger.log("Material approval admin notification failed");
    }

    return { success:true, saved:true, matched:true, answer:answer, status:status };
  }

  function normalizeGreenApiPhone_(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.indexOf("972") === 0) return digits;
    if (digits.indexOf("0") === 0) return "972" + digits.slice(1);
    if (digits.length === 9 && digits.indexOf("5") === 0) return "972" + digits;
    if (digits.length >= 10) return digits;
    return "";
  }

  function clientInternalNoteHeaders_() {
    return ["clientId","לקוח","הערה_פנימית","תאריך_עדכון"];
  }

  function getClientInternalNotesSheet_(ss) {
    let sheet = ss.getSheetByName("הערות_לקוחות");
    if (!sheet) {
      sheet = ss.insertSheet("הערות_לקוחות");
      sheet.appendRow(clientInternalNoteHeaders_());
      return sheet;
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(clientInternalNoteHeaders_());
      return sheet;
    }
    ensureColumns(sheet, clientInternalNoteHeaders_());
    return sheet;
  }

  function getClientInternalNotes_(ss) {
    const sheet = ss.getSheetByName("הערות_לקוחות");
    if (!sheet) return { byId:{}, byClient:{} };
    const rows = sheet.getDataRange().getValues();
    if (rows.length < 2) return { byId:{}, byClient:{} };
    const byId = {};
    const byClient = {};
    rows.slice(1).forEach((r, index) => {
      const clientId = String(r[0] || "").trim();
      const client = String(r[1] || "").trim();
      if (!client && !clientId) return;
      const entry = {
        clientId: clientId,
        client: client,
        note: String(r[2] || ""),
        date: normalizeSheetDate_(r[3]) || String(r[3] || ""),
        row: index + 2
      };
      if (clientId && (!byId[clientId] || entry.date > byId[clientId].date || (entry.date === byId[clientId].date && entry.row > byId[clientId].row))) byId[clientId] = entry;
      if (client && (!byClient[client] || entry.date > byClient[client].date || (entry.date === byClient[client].date && entry.row > byClient[client].row))) byClient[client] = entry;
    });
    return { byId:byId, byClient:byClient };
  }

  function saveClientInternalNote_(ss, data) {
    const client = String(data.client || "").trim();
    const clientId = String(data.clientId || "").trim();
    const note = String(data.note || "");
    if (!client) return { success:false, error:"missing client" };
    if (!clientId && clientNameMatchCount_(ss, client) !== 1) {
      return { success:false, error:"ambiguous client name", client:client };
    }

    const sheet = getClientInternalNotesSheet_(ss);
    const rows = sheet.getDataRange().getValues();
    const updatedAt = Utilities.formatDate(new Date(), "Asia/Jerusalem", "yyyy-MM-dd");
    const targetRows = [];
    for (let i = 1; i < rows.length; i++) {
      const rowId = String(rows[i][0] || "").trim();
      const rowClient = String(rows[i][1] || "").trim();
      if ((clientId && rowId === clientId) || (!clientId && rowClient === client)) targetRows.push(i + 1);
    }

    const row = [clientId, client, note, updatedAt];
    if (targetRows.length) targetRows.forEach(targetRow => sheet.getRange(targetRow, 1, 1, row.length).setValues([row]));
    else sheet.appendRow(row);

    return { success:true, row:targetRows[targetRows.length - 1] || sheet.getLastRow(), rowsUpdated:targetRows.length || 1, client:client, clientId:clientId, note:note, internalNoteDate:updatedAt };
  }

  function sendOneSignalRequest_(payload, label) {
    const config = getOneSignalConfig_();
    if (!config.appId) return { success:false, ok:false, error:"missing_app_id", recipients:0 };
    if (!config.apiKey) return { success:false, ok:false, error:"missing_rest_api_key", recipients:0 };

    const body = Object.assign({
      app_id: config.appId,
      target_channel: "push",
      ttl: 259200
    }, payload || {});

    const res = UrlFetchApp.fetch("https://api.onesignal.com/notifications", {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Key " + config.apiKey },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });

    const status = res.getResponseCode();
    const text = res.getContentText();
    let parsed = {};
    try {
      parsed = JSON.parse(text);
    } catch(e) {
      parsed = { raw:text };
    }

    Logger.log("Push status: " + status);

    const recipients = Number(parsed.recipients || 0);
    const ok = status >= 200 && status < 300 && recipients > 0 && !parsed.errors;
    return {
      success: ok,
      ok: ok,
      sent: ok,
      status: status,
      recipients: recipients,
      id: parsed.id || "",
      response: parsed
    };
  }

  function createOneSignalUser_(user) {
    const config = getOneSignalConfig_();
    if (!config.appId) return { success:false, error:"missing_app_id" };
    if (!config.apiKey) return { success:false, error:"missing_rest_api_key" };

    const username = String(user.username || "").trim().toLowerCase();
    if (!username) return { success:false, error:"missing_username" };

    const payload = {
      identity: {
        external_id: username
      },
      properties: {
        tags: {
          username: username,
          name: String(user.name || ""),
          role: String(user.role || ""),
          phone: String(user.phone || "")
        }
      }
    };

    const res = UrlFetchApp.fetch("https://api.onesignal.com/apps/" + encodeURIComponent(config.appId) + "/users", {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Key " + config.apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const status = res.getResponseCode();
    const text = res.getContentText();
    let parsed = {};
    try {
      parsed = JSON.parse(text);
    } catch(e) {
      parsed = { raw:text };
    }

    const duplicate = status === 409 || String(text || "").toLowerCase().indexOf("already") >= 0;
    Logger.log("Push user sync status: " + status);

    return {
      success: (status >= 200 && status < 300) || duplicate,
      status: status,
      duplicate: duplicate,
      username: username,
      response: parsed
    };
  }

  function syncAppNotificationUsers_(ss) {
    const users = (getUsers_(ss) || [])
      .filter(u => String(u.username || "").trim())
      .map(u => ({
        username: String(u.username || "").trim().toLowerCase(),
        name: String(u.name || ""),
        role: String(u.role || ""),
        phone: String(u.phone || "")
      }));

    const seen = {};
    const uniqueUsers = users.filter(u => {
      if (seen[u.username]) return false;
      seen[u.username] = true;
      return true;
    });

    const results = uniqueUsers.map(createOneSignalUser_);
    const ok = results.filter(r => r && r.success).length;
    return {
      success: ok === uniqueUsers.length,
      synced: ok,
      total: uniqueUsers.length,
      results: results
    };
  }

  function getNotificationSyncSpreadsheet_() {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;

    const props = PropertiesService.getScriptProperties();
    const sheetId = String(
      props.getProperty("GALILEO_SHEET_ID") ||
      props.getProperty("SHEET_ID") ||
      props.getProperty("CLIENT_SHEET_ID") ||
      "1NthErqOJOFHJ482q3zg2daFX9SGCFeByXjdoZxvV-no"
    ).trim();

    if (!sheetId) throw new Error("missing sheet id");
    return SpreadsheetApp.openById(sheetId);
  }

  function syncAppNotificationUsers() {
    const ss = getNotificationSyncSpreadsheet_();
    const res = syncAppNotificationUsers_(ss);
    Logger.log("Push user sync completed: " + !!res.success);
    return res;
  }

  function syncOneSignalUsersFromSheet() {
    return syncAppNotificationUsers();
  }

  function getPushBrandTitle_(ss) {
    let settings = {};
    try {
      settings = getClientSettings_(ss) || {};
    } catch(e) {}

    const fromSettings = String(
      settings.pushTitle ||
      settings.notificationTitle ||
      settings.shortName ||
      settings.appName ||
      settings.company ||
      settings.companyName ||
      ""
    ).trim();
    if (fromSettings) return fromSettings;

    try {
      const branding = getClientBrandingBySheetId_(ss.getId()) || {};
      return String(
        branding.shortName ||
        branding.appName ||
        branding.company ||
        ""
      ).trim();
    } catch(e) {
      return "";
    }
  }

  function testPushToGil() {
    const ss = getNotificationSyncSpreadsheet_();
    const res = sendAppNotificationToUser_({
      externalUserId: "גיל",
      title: "בדיקת התראה",
      message: "בדיקה מגוגל סקריפט"
    }, ss);
    Logger.log("Push test completed: " + !!res.success);
    return res;
  }

  function sendAppNotificationToUser_(data, ss) {
    const externalUserId = String(
      data.externalUserId ||
      data.externalId ||
      data.username ||
      data.to ||
      data.recipient ||
      ""
    ).trim().toLowerCase();

    if (!externalUserId) return { success:false, sent:false, error:"missing_external_user_id" };

    const actionTitle = String(data.title || data.heading || "").trim();
    const title = String(data.appTitle || data.brandTitle || getPushBrandTitle_(ss) || actionTitle || "Galileo").trim();
    const rawMessage = String(data.message || data.body || data.text || "עדכון חדש").trim();
    const message = actionTitle && actionTitle !== title && rawMessage.indexOf(actionTitle) !== 0
      ? `${actionTitle}\n${rawMessage}`
      : rawMessage;

    const result = sendOneSignalRequest_({
      include_aliases: { external_id: [externalUserId] },
      headings: { he:title, en:title },
      contents: { he:message, en:message }
    }, externalUserId);

    result.externalUserId = externalUserId;
    return result;
  }

  function sendAppNotificationToAdmins_(ss, data) {
    const users = getUsers_(ss) || [];
    const admins = users.filter(u => u.username && isAdminRole_(u.role));
    const results = admins.map(admin => sendAppNotificationToUser_({
      externalUserId: admin.username,
      title: data.title,
      message: data.message || data.body || data.text
    }, ss));
    const sent = results.filter(r => r && (r.success || r.sent || Number(r.recipients || 0) > 0)).length;
    return {
      success: sent > 0,
      sent: sent,
      total: admins.length,
      recipients: sent,
      results: results
    };
  }

  function isAdminRole_(role) {
    const r = String(role || "").trim().toLowerCase();
    return r === "admin" || r === "\u05de\u05e0\u05d4\u05dc" || r === "\u05d0\u05d3\u05de\u05d9\u05df";
  }

  function notifyOperatorIssueDone_(ss, issueRow, response) {
    const operatorName = String(issueRow[1] || "").trim();
    const clientName = String(issueRow[2] || "").trim();
    const desc = String(issueRow[3] || "").trim();
    const user = findUserByName_(ss, operatorName, "operator");
    if (!user || !user.username) {
      Logger.log("Operator issue done notification skipped, user not found: " + operatorName);
      return { success:false, error:"operator user not found", operator: operatorName };
    }

    const messageParts = [
      clientName ? `לקוח: ${clientName}` : "",
      desc ? `תקלה: ${desc}` : "",
      response ? `תגובת אדמין: ${response}` : ""
    ].filter(Boolean);

    const res = sendAppNotificationToUser_({
      externalUserId: user.username,
      title: "✅ התקלה סומנה כטופלה",
      message: messageParts.join(" · ") || "התקלה שפתחת טופלה"
    }, ss);

    Logger.log("Operator issue done push status: " + !!res.success);
    return res;
  }

  function notifyOperatorIssueAcknowledged_(ss, issueRow, response) {
    const operatorName = String(issueRow[1] || "").trim();
    const clientName = String(issueRow[2] || "").trim();
    const desc = String(issueRow[3] || "").trim();
    const user = findUserByName_(ss, operatorName, "operator");
    if (!user || !user.username) {
      Logger.log("Operator critical issue ack notification skipped, user not found: " + operatorName);
      return { success:false, error:"operator user not found", operator: operatorName };
    }

    const messageParts = [
      clientName ? `לקוח: ${clientName}` : "",
      desc ? `תקלה: ${desc}` : "",
      response ? `אישור אדמין: ${response}` : ""
    ].filter(Boolean);

    const res = sendAppNotificationToUser_({
      externalUserId: user.username,
      title: "🚨 תקלה קריטית אושרה",
      message: messageParts.join(" · ") || "תקלה קריטית אושרה ונמצאת בטיפול מיידי"
    }, ss);

    Logger.log("Operator issue acknowledgement push status: " + !!res.success);
    return res;
  }

  function findUserByName_(ss, name, role) {
    const usersSheet = ss.getSheetByName("Users");
    if (!usersSheet || !name) return null;

    const rows = usersSheet.getDataRange().getValues();
    let hi = rows.findIndex(r => r.some(c => String(c).toLowerCase().trim() === "username"));
    if (hi === -1) hi = 0;

    const headers = rows[hi].map(h => String(h).trim());
    const usernameIdx = headers.findIndex(h => h.toLowerCase() === "username");
    const roleIdx = headers.findIndex(h => h.toLowerCase() === "role");
    const nameIdx = headers.findIndex(h => h.toLowerCase() === "name");
    const targetName = normalizeUserName_(name);
    const targetRole = String(role || "").toLowerCase();

    for (let i = hi + 1; i < rows.length; i++) {
      const username = String(rows[i][usernameIdx >= 0 ? usernameIdx : 0] || "").trim();
      const userRole = String(rows[i][roleIdx >= 0 ? roleIdx : 2] || "").trim().toLowerCase();
      const userName = String(rows[i][nameIdx >= 0 ? nameIdx : 3] || "").trim();
      if (!username || !userName) continue;
      if (targetRole && userRole !== targetRole) continue;
      if (normalizeUserName_(userName) === targetName) {
        return { username, role:userRole, name:userName };
      }
    }

    return null;
  }

  function normalizeUserName_(value) {
    return String(value || "").trim().toLowerCase();
  }

  function reportHeaders_() {
    return ["reportId","תאריך","מפעיל","לקוח","כלור","pH","מלח","גובה_מים","צלילות","פס_שומן","זרימה","דגם_אלקטרודה","סריאלי_אלקטרודה","תאריך_ניקיון","תאריך_ניקיון_הבא","ציוד_נדרש","מצב_בריכה","פירוט_מצב","הגבלה_עד","הערות","chlora","hth","phUp","acidLiters","ציוד_שסופק","clientId","waterCheckOnly","queueRevision","queueUpdatedAt"];
  }

  function reportRowValues_(r) {
    const waterCheckOnly = isTruthy_(r.waterCheckOnly);
    return [
      r.id || Utilities.getUuid(),
      r.reportDate,
      r.operator,
      r.client,
      r.chlorine,
      waterCheckOnly ? "" : r.ph,
      waterCheckOnly ? "" : r.salt,
      waterCheckOnly ? "" : r.waterLevel,
      waterCheckOnly ? "" : r.clarity,
      waterCheckOnly ? "" : r.fat,
      r.flow,
      waterCheckOnly ? "" : r.elModel,
      waterCheckOnly ? "" : r.elSerial,
      waterCheckOnly ? "" : r.elDate,
      waterCheckOnly ? "" : r.elNext,
      waterCheckOnly ? "" : r.supplyLabel,
      waterCheckOnly ? "" : r.poolStatus,
      waterCheckOnly ? "" : r.customStatusText,
      waterCheckOnly ? "" : r.restrictedUntil,
      waterCheckOnly ? "" : r.notes,
      r.chlora || 0,
      r.hth || 0,
      waterCheckOnly ? "" : (r.phUp || 0),
      waterCheckOnly ? "" : (r.acidLiters || 0),
      waterCheckOnly ? "" : (r.suppliedEquipment || ""),
      r.clientId || "",
      waterCheckOnly,
      r.queueRevision || "",
      Number(r.queueUpdatedAt || 0)
    ];
  }

  function reportHasIdColumn_(row) {
    const first = String(row && row[0] || "").trim();
    const second = row && row.length > 1 ? row[1] : "";
    return first === "reportId" || (!!first && !!normalizeReportDate_(second) && !normalizeReportDate_(first));
  }

  function reportCell_(row, index) {
    return reportHasIdColumn_(row) ? row[index + 1] : row[index];
  }

  function reportIdCell_(row) {
    return reportHasIdColumn_(row) ? String(row[0] || "").trim() : "";
  }

  function reportWaterCheckOnlyFromRow_(row) {
    return isTruthy_(reportCell_(row,25));
  }

  function normalizeReportComparableValue_(value, index) {
    if ([0,12,13,17].indexOf(index) >= 0) return normalizeReportDate_(value);
    if (index === 25) return isTruthy_(value) ? "true" : "false";
    return normalizeReportValue_(value);
  }

  function reportRowContentKey_(row) {
    const values = [];
    for (let index = 0; index <= 25; index++) {
      values.push(normalizeReportComparableValue_(reportCell_(row,index), index));
    }
    return JSON.stringify(values);
  }

  function reportRowMatchesReport_(row, report) {
    return reportRowContentKey_(row) === reportRowContentKey_(reportRowValues_(report));
  }

  function reportRowQueueVersionMatchesReport_(row, report) {
    return (
      String(reportCell_(row, 26) || "").trim() === String(report && report.queueRevision || "").trim() &&
      Number(reportCell_(row, 27) || 0) === Number(report && report.queueUpdatedAt || 0)
    );
  }

  function ensureReportsSheetReportId_(sheet) {
    if (!sheet) return;
    const lastRow = Math.max(sheet.getLastRow(), 1);
    const lastCol = Math.max(sheet.getLastColumn(), 1);
    const rows = sheet.getRange(1, 1, Math.min(lastRow, 10), lastCol).getValues();
    let headerRow = rows.findIndex(r => String(r[0] || "").trim() === "reportId" || r.some(c => String(c || "").includes("תאריך")));
    if (headerRow < 0) headerRow = 0;
    const headerRowNumber = headerRow + 1;
    const firstHeader = String(sheet.getRange(headerRowNumber, 1).getValue() || "").trim();
    if (firstHeader !== "reportId") {
      sheet.insertColumnBefore(1);
      sheet.getRange(headerRowNumber, 1).setValue("reportId");
    }
    const headers = reportHeaders_();
    if (sheet.getMaxColumns() < headers.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
    }
    sheet.getRange(headerRowNumber, 1, 1, headers.length).setValues([headers]);
    const headerValues = sheet.getRange(headerRowNumber, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(String);
    if (headerValues.indexOf("clientId") < 0) {
      sheet.getRange(headerRowNumber, sheet.getLastColumn() + 1).setValue("clientId");
    }
    const dataRowCount = Math.max(sheet.getLastRow() - headerRowNumber, 0);
    if (!dataRowCount) return;
    const idRange = sheet.getRange(headerRowNumber + 1, 1, dataRowCount, 1);
    const ids = idRange.getValues();
    const data = sheet.getRange(headerRowNumber + 1, 1, dataRowCount, sheet.getLastColumn()).getValues();
    const updates = [];
    let changed = false;
    data.forEach((r, index) => {
      if (!String(ids[index][0] || "").trim() && r[1]) {
        const comparableRow = r.slice();
        comparableRow[0] = "legacy";
        const clientId = String(reportCell_(comparableRow,24) || "").trim();
        updates.push([clientId ? deterministicLegacyReportId_(comparableRow) : Utilities.getUuid()]);
        changed = true;
      } else {
        updates.push([ids[index][0]]);
      }
    });
    if (changed && updates.length) idRange.setValues(updates);
  }

  function operatorReportsSheetName_(operator) {
    const clean = canonicalOperatorName_(operator).replace(/[\\\/\?\*\[\]\:]/g, "-");
    const mapped = {
      "אור מוסה": "אור_מוסה",
      "אור פרנקו": "אור_פרנקו",
      "גיל פלג": "גיל_פלג"
    };
    return mapped[clean] || (clean ? clean.slice(0, 99) : "דוחות");
  }

  function canonicalOperatorName_(operator) {
    const clean = String(operator || "").trim().replace(/_/g, " ").replace(/\s+/g, " ");
    const mapped = {
      "אור מוסא": "אור מוסה",
      "אור מוסה": "אור מוסה",
      "אור פרנקו": "אור פרנקו",
      "גיל פלד": "גיל פלג",
      "גיל פלג": "גיל פלג"
    };
    return mapped[clean] || clean;
  }

  function reportOperatorName_(ss, report) {
    const direct = canonicalOperatorName_(report && report.operator);
    const reportClientId = String(report && report.clientId || "").trim();
    const reportClient = normalizeReportValue_(report && report.client);
    const clients = allClientRecords_(ss);
    const match = reportClientId
      ? clients.find(c => String(c.clientId || "").trim() === reportClientId)
      : (() => {
          const matches = clients.filter(c => reportClient && normalizeReportValue_(c.name) === reportClient);
          return matches.length === 1 ? matches[0] : null;
        })();
    return canonicalOperatorName_(match && match.regularOperator) || direct;
  }

  function ensureReportClientIdentity_(ss, report) {
    const clientId = String(report && report.clientId || "").trim();
    if (clientId) return { success:true, clientId:clientId };

    const clientName = normalizeReportValue_(report && report.client);
    const matches = allClientRecords_(ss).filter(client =>
      clientName && normalizeReportValue_(client.name) === clientName
    );
    if (matches.length > 1) {
      return { success:false, error:"ambiguous client name", client:report && report.client || "" };
    }
    if (matches.length === 1) {
      report.clientId = String(matches[0].clientId || "").trim();
    }
    return { success:true, clientId:String(report && report.clientId || "").trim() };
  }

  function reportQueueVersionKey_(ss, reportId) {
    const id = String(reportId || "").trim();
    if (!id) return "";
    const raw = [ss.getId(), id].join("|");
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8)
      .map(value => (value < 0 ? value + 256 : value).toString(16).padStart(2, "0"))
      .join("");
    return "reportQueueVersion:" + digest.slice(0, 40);
  }

  function storedReportQueueVersion_(ss, reportId) {
    const id = String(reportId || "").trim();
    const sheet = ss.getSheetByName("דוחות");
    if (!id || !sheet || sheet.getLastRow() < 2) return { version:0, revision:"" };
    ensureReportsSheetReportId_(sheet);
    const rows = sheet.getDataRange().getValues();
    const headerIndex = rows.findIndex(row => String(row[0] || "").trim() === "reportId");
    if (headerIndex < 0) return { version:0, revision:"" };
    const headers = rows[headerIndex].map(value => String(value || "").trim());
    const revisionIndex = headers.indexOf("queueRevision");
    const versionIndex = headers.indexOf("queueUpdatedAt");
    for (let index = rows.length - 1; index > headerIndex; index--) {
      if (String(rows[index][0] || "").trim() !== id) continue;
      return {
        version:versionIndex >= 0 ? Number(rows[index][versionIndex] || 0) : 0,
        revision:revisionIndex >= 0 ? String(rows[index][revisionIndex] || "").trim() : ""
      };
    }
    return { version:0, revision:"" };
  }

  function acceptReportQueueVersion_(ss, report, data) {
    const version = Number(data && data.queueUpdatedAt || 0);
    const revision = String(data && data.queueRevision || "").trim();
    const key = reportQueueVersionKey_(ss, report && report.id);
    if (!key) return true;
    const stored = storedReportQueueVersion_(ss, report && report.id);
    if (stored.version > version) return false;
    if (stored.version > 0 && !version) return false;
    if (
      stored.version > 0 &&
      stored.version === version &&
      stored.revision &&
      revision &&
      stored.revision !== revision
    ) return false;
    if (!version) return true;
    try {
      const cache = CacheService.getScriptCache();
      const current = Number(cache.get(key) || 0);
      if (current > version) return false;
      cache.put(key, String(version), 21600);
    } catch(e) {}
    return true;
  }

  function getOperatorReportsSheet_(ss, operator) {
    const name = operatorReportsSheetName_(operator);
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    ensureReportsSheetReportId_(sheet);
    return sheet;
  }

  function getMainReportsSheet_(ss) {
    let sheet = ss.getSheetByName("דוחות");
    if (!sheet) {
      sheet = ss.insertSheet("דוחות");
    }
    ensureReportsSheetReportId_(sheet);
    return sheet;
  }

  function isReportDataSheet_(sheet) {
    if (!sheet || sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) return false;
    const expected = reportHeaders_();
    const rows = sheet.getRange(
      1,
      1,
      Math.min(sheet.getLastRow(), 10),
      Math.min(sheet.getLastColumn(), expected.length)
    ).getValues();
    return rows.some(row => {
      const headers = row.map(value => String(value || "").trim());
      if (headers[0] === expected[0]) {
        return expected.slice(0, 5).every((header, index) => headers[index] === header);
      }
      return expected.slice(1, 5).every((header, index) => headers[index] === header);
    });
  }

  function reportSheetList_(ss) {
    const main = ss.getSheetByName("דוחות");
    const sheets = main ? [main] : [];
    const operatorSheetNames = {
      "אור_מוסה":true, "אור_פרנקו":true, "גיל_פלג":true,
      "אור מוסה":true, "אור פרנקו":true, "גיל פלד":true, "גיל פלג":true
    };
    getClientsByHeaders_(ss).forEach(client => {
      const operator = canonicalOperatorName_(client.regularOperator);
      if (!operator) return;
      operatorSheetNames[operator] = true;
      operatorSheetNames[operatorReportsSheetName_(operator)] = true;
      operatorSheetNames["דוחות - " + operator] = true;
    });
    ss.getSheets().forEach(sheet => {
      const name = sheet.getName();
      const isOperatorSheet =
        !!operatorSheetNames[name] ||
        name.indexOf("דוחות - ") === 0 ||
        isReportDataSheet_(sheet);
      if (isOperatorSheet && sheets.indexOf(sheet) < 0) sheets.push(sheet);
    });
    sheets.forEach(ensureReportsSheetReportId_);
    return sheets;
  }

  function reportIndexKey_(ss, reportId) {
    return "reportIndex:" + ss.getId() + ":" + String(reportId || "").trim();
  }

  function readReportIndex_(ss, reportId) {
    const id = String(reportId || "").trim();
    if (!id) return [];
    const cache = CacheService.getScriptCache();
    let locations = [];
    try { locations = JSON.parse(cache.get(reportIndexKey_(ss, id)) || "[]"); } catch(e) { return []; }
    const valid = (locations || []).map(location => {
      const sheet = ss.getSheetByName(String(location.sheet || ""));
      const row = Number(location.row || 0);
      if (!sheet || row < 2 || row > sheet.getLastRow()) return null;
      const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
      return reportIdCell_(values) === id ? { sheet:sheet, row:row, values:values } : null;
    }).filter(Boolean);
    if (valid.length !== locations.length) {
      try { cache.remove(reportIndexKey_(ss, id)); } catch(e) {}
    }
    return valid;
  }

  function writeReportIndex_(ss, reportId, locations) {
    const id = String(reportId || "").trim();
    if (!id || !(locations || []).length) return;
    const clean = locations.map(location => ({
      sheet:String(location.sheet && location.sheet.getName ? location.sheet.getName() : location.sheet || ""),
      row:Number(location.row || 0)
    })).filter(location => location.sheet && location.row > 0);
    if (!clean.length) return;
    try { CacheService.getScriptCache().put(reportIndexKey_(ss, id), JSON.stringify(clean), 21600); } catch(e) {}
  }

  function reportRowConfirmed_(row, report) {
    const wantedId = String(report && report.id || "").trim();
    if (wantedId && reportIdCell_(row) === wantedId) return reportRowMatchesReport_(row, report);
    return reportDuplicateKeyFromRow_(row) === reportDuplicateKeyFromReport_(report);
  }

  function reportRowsFromSheet_(sheet) {
    if (!sheet || sheet.getLastRow() < 2) return [];
    const rows = sheet.getDataRange().getValues();
    let hi = rows.findIndex(r => String(r[0]).includes("reportId"));
    if (hi === -1) hi = rows.findIndex(r => String(r[0]).includes("תאריך"));
    if (hi === -1) hi = 0;
    return rows.slice(hi + 1).filter(r => reportCell_(r,0));
  }

  function reportQueryCacheKey_(ss, query) {
    const raw = JSON.stringify(query || {});
    const digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      raw,
      Utilities.Charset.UTF_8
    ).map(value => (value < 0 ? value + 256 : value).toString(16).padStart(2, "0")).join("");
    return [
      "reportQuery",
      ss.getId(),
      getOperatorDataVersion_(ss),
      GALILEO_SCRIPT_BUILD_,
      digest.slice(0, 24)
    ].join(":");
  }

  function reportRowsForQuery_(sheet, query) {
    if (!sheet || sheet.getLastRow() < 2) return [];
    const lastRow = sheet.getLastRow();
    const lastColumn = Math.max(1, Math.min(sheet.getLastColumn(), reportHeaders_().length));
    const previewRowCount = Math.min(lastRow, 10);
    const preview = sheet.getRange(
      1,
      1,
      previewRowCount,
      Math.min(lastColumn, reportHeaders_().length)
    ).getValues();
    let headerIndex = preview.findIndex(row => String(row[0] || "").trim() === "reportId");
    if (headerIndex < 0) headerIndex = preview.findIndex(row => String(row[0] || "").indexOf("תאריך") >= 0);
    if (headerIndex < 0) headerIndex = 0;
    const headers = (preview[headerIndex] || []).map(value => String(value || "").trim());
    const hasIdColumn = headers[0] === "reportId";
    const columnNumber = (name, fallback) => {
      const index = headers.indexOf(name);
      return index >= 0 ? index + 1 : fallback;
    };
    const dateColumn = columnNumber("תאריך", hasIdColumn ? 2 : 1);
    const clientColumn = columnNumber("לקוח", hasIdColumn ? 4 : 3);
    const clientIdColumn = headers.indexOf("clientId") >= 0 ? headers.indexOf("clientId") + 1 : 0;
    const dataStartRow = headerIndex + 2;
    const dataRowCount = Math.max(0, lastRow - dataStartRow + 1);
    if (!dataRowCount) return [];
    const dateValueIndex = hasIdColumn ? 1 : 0;
    const normalizedDateByRow = {};

    let candidateRows = null;
    const intersectCandidates = rows => {
      const next = {};
      (rows || []).forEach(row => { next[Number(row)] = true; });
      if (candidateRows === null) {
        candidateRows = next;
        return;
      }
      Object.keys(candidateRows).forEach(row => {
        if (!next[row]) delete candidateRows[row];
      });
    };

    if (query.fromDate || query.toDate) {
      const dateRange = sheet.getRange(dataStartRow, dateColumn, dataRowCount, 1);
      const displayedDates = dateRange.getDisplayValues();
      let rawDates = null;
      const matchingRows = [];
      displayedDates.forEach((row, index) => {
        let date = normalizeSheetDate_(row[0]);
        if (!date && String(row[0] || "").trim()) {
          if (!rawDates) rawDates = dateRange.getValues();
          date = normalizeSheetDate_(rawDates[index][0]);
        }
        if (!date) return;
        normalizedDateByRow[dataStartRow + index] = date;
        if (query.fromDate && date < query.fromDate) return;
        if (query.toDate && date > query.toDate) return;
        matchingRows.push(dataStartRow + index);
      });
      intersectCandidates(matchingRows);
    }

    if (query.wantedClient || query.wantedClientId) {
      const names = sheet.getRange(dataStartRow, clientColumn, dataRowCount, 1).getValues();
      const ids = clientIdColumn
        ? sheet.getRange(dataStartRow, clientIdColumn, dataRowCount, 1).getValues()
        : [];
      const matchingRows = [];
      names.forEach((row, index) => {
        const rowId = clientIdColumn ? String(ids[index][0] || "").trim() : "";
        const rowName = String(row[0] || "").trim().toLowerCase();
        if (query.wantedClientId && rowId) {
          if (rowId === query.wantedClientId) matchingRows.push(dataStartRow + index);
          return;
        }
        if (query.allowLegacyNameMatch && query.wantedClient && rowName === query.wantedClient) {
          matchingRows.push(dataStartRow + index);
        }
      });
      intersectCandidates(matchingRows);
    }

    if (query.query) {
      let foundRows = null;
      try {
        const seenRows = {};
        foundRows = [];
        sheet.createTextFinder(query.query)
          .matchCase(false)
          .useRegularExpression(false)
          .findAll()
          .forEach(range => {
            const row = range.getRow();
            if (row >= dataStartRow && !seenRows[row]) {
              seenRows[row] = true;
              foundRows.push(row);
            }
          });
      } catch(e) {
        foundRows = null;
      }
      if (Array.isArray(foundRows)) intersectCandidates(foundRows);
    }

    if (candidateRows === null) {
      const wanted = Math.max(1, Number(query.limit || 250));
      const first = Math.max(dataStartRow, lastRow - wanted + 1);
      candidateRows = {};
      for (let row = first; row <= lastRow; row++) candidateRows[row] = true;
    }

    let indexes = Object.keys(candidateRows).map(Number).sort((a,b) => a-b);
    const limit = Math.max(0, Number(query.limit || 0));
    if (limit && indexes.length > limit * 4) indexes = indexes.slice(indexes.length - limit * 4);
    if (!indexes.length) return [];

    const wantedRows = {};
    indexes.forEach(row => { wantedRows[row] = true; });
    const groups = [];
    indexes.forEach(row => {
      const current = groups[groups.length - 1];
      if (current && row - current.end <= 75 && row - current.start < 500) {
        current.end = row;
      } else {
        groups.push({start:row, end:row});
      }
    });

    const result = [];
    groups.forEach(group => {
      const rows = sheet.getRange(group.start, 1, group.end - group.start + 1, lastColumn).getValues();
      rows.forEach((row, index) => {
        const sheetRow = group.start + index;
        if (normalizedDateByRow[sheetRow]) row[dateValueIndex] = normalizedDateByRow[sheetRow];
        if (wantedRows[sheetRow] && reportCell_(row,0)) result.push(row);
      });
    });
    return result;
  }

  function allReportRows_(ss, reportSheets) {
    const sheets = Array.isArray(reportSheets) ? reportSheets : reportSheetList_(ss);
    if (!sheets.length) return [];

    const clientNameCounts = {};
    allClientRecords_(ss).forEach(client => {
      const key = normalizeReportValue_(client && client.name).toLowerCase();
      if (key) clientNameCounts[key] = (clientNameCounts[key] || 0) + 1;
    });
    const legacyNameIsUnique = row =>
      clientNameCounts[normalizeReportValue_(reportCell_(row,2)).toLowerCase()] === 1;
    const primaryRows = reportRowsFromSheet_(sheets[0]);
    const primaryContentKeys = {};
    const seenIds = {};
    primaryRows.forEach(row => {
      const id = reportIdCell_(row);
      const clientId = String(reportCell_(row,24) || "").trim();
      if (id) seenIds[id] = true;
      if (clientId || legacyNameIsUnique(row)) {
        primaryContentKeys[reportRowContentKey_(row)] = true;
      }
    });

    const rows = primaryRows.slice();
    sheets.slice(1).forEach(sheet => {
      reportRowsFromSheet_(sheet).forEach(row => {
        const id = reportIdCell_(row);
        const clientId = String(reportCell_(row,24) || "").trim();
        if (id && seenIds[id]) return;
        const safeLegacyMatch = !clientId && legacyNameIsUnique(row);
        if ((clientId || safeLegacyMatch) && primaryContentKeys[reportRowContentKey_(row)]) {
          if (id) seenIds[id] = true;
          return;
        }
        rows.push(row);
        if (id) seenIds[id] = true;
      });
    });
    return rows;
  }

  function deleteReportCopiesOutsideTargets_(reportSheets, reportId, targetNames) {
    const id = String(reportId || "").trim();
    if (!id) return [];
    const keep = {};
    (targetNames || []).forEach(name => { keep[String(name || "")] = true; });
    const removedSheets = [];
    (reportSheets || []).forEach(sheet => {
      if (keep[sheet.getName()] || sheet.getLastRow() < 2) return;
      const ids = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
      let removed = false;
      for (let index = ids.length - 1; index >= 0; index--) {
        if (String(ids[index][0] || "").trim() !== id) continue;
        sheet.deleteRow(index + 1);
        removed = true;
      }
      if (removed) removedSheets.push(sheet.getName());
    });
    return removedSheets;
  }

  function dedupeReportRows_(rows) {
    const seen = {};
    const deduped = [];
    (rows || []).forEach(row => {
      const id = reportIdCell_(row);
      if (!id) {
        deduped.push(row);
        return;
      }
      const key = "id:" + id;
      const existingIndex = seen[key];
      if (existingIndex !== undefined) {
        deduped[existingIndex] = row;
      } else {
        const index = deduped.length;
        deduped.push(row);
        seen[key] = index;
      }
    });
    return deduped;
  }

  function updateReportAcrossSheets_(ss, original, report, reportSheets) {
    const matches = [];
    const seenMatches = {};
    const addMatch = (sheet, row) => {
      if (!sheet || !row) return;
      const key = sheet.getSheetId() + ":" + row;
      if (seenMatches[key]) return;
      seenMatches[key] = true;
      matches.push({ sheet:sheet, row:row });
    };
    const wantedId = String(report && report.id || original && (original.id || original.localId) || "").trim();
    const indexed = readReportIndex_(ss, wantedId);
    indexed.forEach(match => addMatch(match.sheet, match.row));
    (reportSheets || reportSheetList_(ss)).forEach(sheet => {
      if (wantedId) {
        if (sheet.getLastRow() < 2) return;
        sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues().forEach((row, index) => {
          if (String(row[0] || "").trim() === wantedId) addMatch(sheet, index + 1);
        });
      } else {
        const row = findLatestReportRow_(sheet, original, report);
        addMatch(sheet, row);
      }
    });
    if (!matches.length) return { updated:0, created:0, row:0, mainRow:0, id:"", report:report };
    matches.sort((left, right) =>
      left.sheet.getName().localeCompare(right.sheet.getName()) || left.row - right.row
    );

    let savedId = String(report && report.id || "").trim();
    if (!savedId) {
      const first = matches[0];
      const values = first.sheet.getRange(first.row, 1, 1, first.sheet.getLastColumn()).getValues()[0];
      savedId = reportIdCell_(values) || Utilities.getUuid();
    }
    const finalReport = Object.assign({}, report, { id:savedId });
    const mainSheet = getMainReportsSheet_(ss);
    const operatorSheet = getOperatorReportsSheet_(ss, finalReport.operator);
    const requiredNames = [mainSheet.getName(), operatorSheet.getName()];
    let mainRow = 0;
    const obsoleteMatches = [];
    const keptRequiredSheets = {};
    matches.forEach(match => {
      const sheetName = match.sheet.getName();
      if (requiredNames.indexOf(sheetName) < 0 || keptRequiredSheets[sheetName]) {
        obsoleteMatches.push(match);
        return;
      }
      keptRequiredSheets[sheetName] = true;
      match.sheet.getRange(match.row, 1, 1, reportHeaders_().length).setValues([reportRowValues_(finalReport)]);
      if (sheetName === "דוחות") mainRow = match.row;
    });

    let created = 0;
    const requiredSheets = [mainSheet, operatorSheet];
    requiredSheets.forEach(sheet => {
      if (keptRequiredSheets[sheet.getName()]) return;
      sheet.appendRow(reportRowValues_(finalReport));
      created++;
      if (sheet.getName() === "דוחות") mainRow = sheet.getLastRow();
    });
    obsoleteMatches
      .sort((a, b) => b.row - a.row)
      .forEach(match => match.sheet.deleteRow(match.row));
    writeReportIndex_(ss, savedId, requiredSheets.map(sheet => ({
      sheet:sheet,
      row:matches.find(match =>
        match.sheet.getName() === sheet.getName() &&
        obsoleteMatches.indexOf(match) < 0
      )?.row || sheet.getLastRow()
    })));
    return { updated:matches.length - obsoleteMatches.length, created:created, removed:obsoleteMatches.length, row:matches[0].row, mainRow:mainRow, id:savedId, report:finalReport };
  }

  function findLatestReportRowAcrossSheets_(ss, original, report) {
    let found = { sheet:null, row:0, date:"" };
    reportSheetList_(ss).forEach(sheet => {
      const row = findLatestReportRow_(sheet, original, report);
      if (!row) return;
      const rowValues = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
      const date = normalizeReportDate_(reportCell_(rowValues,0));
      if (!found.row || date >= found.date) found = { sheet, row, date };
    });
    return found;
  }

  function findDuplicateReportRowAcrossSheets_(ss, report) {
    let found = { row:0, id:"", sheet:null };
    reportSheetList_(ss).some(sheet => {
      const duplicate = findDuplicateReportRow_(sheet, report);
      if (!duplicate.row) return false;
      found = { row:duplicate.row, id:duplicate.id || "", sheet };
      return true;
    });
    return found;
  }

  function reportStorageStatus_(ss, report) {
    const reportId = String(report && report.id || "").trim();
    const indexed = readReportIndex_(ss, reportId);
    if (indexed.length) {
      return indexed.map(match => ({
        sheet:match.sheet.getName(),
        row:match.row,
        id:reportId,
        confirmed:reportRowConfirmed_(match.values, report)
      }));
    }
    const matches = reportSheetList_(ss).map(sheet => {
      const match = findDuplicateReportRow_(sheet, report);
      if (!match.row) return null;
      const values = sheet.getRange(match.row, 1, 1, sheet.getLastColumn()).getValues()[0];
      return { sheet:sheet.getName(), row:match.row, id:match.id || reportId, confirmed:reportRowConfirmed_(values, report) };
    }).filter(Boolean);
    writeReportIndex_(ss, reportId, matches);
    return matches;
  }

  function findLatestReportRow_(sheet, original, report) {
    if (!sheet || sheet.getLastRow() < 2) return 0;
    ensureReportsSheetReportId_(sheet);
    const wantedId = String(report && report.id || original && (original.id || original.localId) || "").trim();
    const date = normalizeReportDate_(original.date || original.reportDate || report.reportDate);
    const client = normalizeReportValue_(original.client || report.client);
    const clientId = String(original.clientId || report.clientId || "").trim();
    const operator = normalizeReportValue_(original.operator || report.operator);
    const waterModeKnown = Object.prototype.hasOwnProperty.call(original || {}, "waterCheckOnly") ||
      Object.prototype.hasOwnProperty.call(report || {}, "waterCheckOnly");
    const wantedWaterMode = isTruthy_(
      Object.prototype.hasOwnProperty.call(original || {}, "waterCheckOnly")
        ? original.waterCheckOnly
        : report.waterCheckOnly
    );
    const rows = sheet.getDataRange().getValues();
    let hi = rows.findIndex(r => String(r[0]).includes("תאריך"));
    if (hi === -1) hi = 0;

    if (wantedId) {
      for (let i = rows.length - 1; i > hi; i--) {
        if (reportIdCell_(rows[i]) === wantedId) return i + 1;
      }
      return 0;
    }
    if (!clientId && clientNameMatchCount_(sheet.getParent(), client) !== 1) return 0;

    for (let i = rows.length - 1; i > hi; i--) {
      if (!rows[i][0]) continue;
      const rowClientId = String(reportCell_(rows[i],24) || "").trim();
      if (clientId ? rowClientId !== clientId : rowClientId) continue;
      if (
        normalizeReportDate_(reportCell_(rows[i],0)) === date &&
        normalizeReportValue_(reportCell_(rows[i],1)) === operator &&
        normalizeReportValue_(reportCell_(rows[i],2)) === client &&
        (!waterModeKnown || reportWaterCheckOnlyFromRow_(rows[i]) === wantedWaterMode)
      ) {
        return i + 1;
      }
    }

    return 0;
  }

  function isClientNameHeader_(value) {
    const h = String(value || "").trim();
    return h === "שם" || h === "שם_לקוח" || h === "שם לקוח" || h === "לקוח" || h === "שם הלקוח";
  }

  function clientNameMatchCount_(ss, clientName) {
    const sheet = ss && ss.getSheetByName("לקוחות");
    if (!sheet) return 0;
    const rows = sheet.getDataRange().getValues();
    const headerRowIndex = rows.findIndex(row => row.some(isClientNameHeader_));
    if (headerRowIndex < 0) return 0;
    const nameIndex = (rows[headerRowIndex] || []).findIndex(isClientNameHeader_);
    if (nameIndex < 0) return 0;
    const wanted = normalizeReportValue_(clientName).toLowerCase();
    return rows.slice(headerRowIndex + 1)
      .filter(row => normalizeReportValue_(row[nameIndex]).toLowerCase() === wanted)
      .length;
  }

function findDuplicateReportRow_(sheet, report) {
    if (!sheet || sheet.getLastRow() < 2) return { row:0, id:"" };

    ensureReportsSheetReportId_(sheet);
    const targetId = String(report && report.id || "").trim();
    const targetKey = reportDuplicateKeyFromReport_(report);
    const rows = sheet.getDataRange().getValues();
    let hi = rows.findIndex(r => String(r[0]).includes("תאריך"));
    if (hi === -1) hi = 0;

    if (targetId) {
      for (let i = hi + 1; i < rows.length; i++) {
        const rowId = reportIdCell_(rows[i]);
        if (rowId && rowId === targetId) return { row:i + 1, id:rowId };
      }
    }

    for (let i = hi + 1; i < rows.length; i++) {
      if (!reportCell_(rows[i],0)) continue;
      if (reportIdCell_(rows[i])) continue;
      if (reportDuplicateKeyFromRow_(rows[i]) === targetKey) return { row:i + 1, id:reportIdCell_(rows[i]) };
    }

    return { row:0, id:"" };
  }

  function findDuplicateOperatorIssueRow_(sheet, issue) {
    if (!sheet || sheet.getLastRow() < 2) return 0;
    const targetId = String(issue.localId || "").trim();
    const targetKey = [
      normalizeReportDate_(issue.date || new Date()),
      normalizeReportValue_(issue.operator).toLowerCase(),
      normalizeReportValue_(issue.client).toLowerCase(),
      normalizeReportValue_(issue.desc).toLowerCase(),
      normalizeReportValue_(issue.priority).toLowerCase(),
      "פתוח"
    ].join("|");
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (targetId && String(rows[i][0] || "").trim() === targetId) return i + 1;
      const rowKey = [
        normalizeReportDate_(rows[i][7]),
        normalizeReportValue_(rows[i][1]).toLowerCase(),
        normalizeReportValue_(rows[i][2]).toLowerCase(),
        normalizeReportValue_(rows[i][3]).toLowerCase(),
        normalizeReportValue_(rows[i][4]).toLowerCase(),
        normalizeReportValue_(rows[i][5] || "פתוח")
      ].join("|");
      if (rowKey === targetKey) return i + 1;
    }
    return 0;
  }

  function reportDuplicateKeyFromReport_(r) {
    return [
      normalizeReportDate_(r.reportDate),
      normalizeReportValue_(r.operator),
      normalizeReportValue_(r.client),
      normalizeReportValue_(r.chlorine),
      normalizeReportValue_(r.ph),
      normalizeReportValue_(r.salt),
      normalizeReportValue_(r.waterLevel),
      normalizeReportValue_(r.clarity),
      normalizeReportValue_(r.fat),
      normalizeReportValue_(r.flow),
      normalizeReportValue_(r.elModel),
      normalizeReportValue_(r.elSerial),
      normalizeReportDate_(r.elDate),
      normalizeReportDate_(r.elNext),
      normalizeReportValue_(r.poolStatus),
      normalizeReportValue_(r.customStatusText),
      normalizeReportDate_(r.restrictedUntil),
      normalizeReportValue_(r.notes),
      normalizeReportValue_(r.chlora || 0),
      normalizeReportValue_(r.hth || 0),
      normalizeReportValue_(r.phUp || 0),
      normalizeReportValue_(r.acidLiters || 0),
      normalizeReportValue_(r.suppliedEquipment || ""),
      String(r.clientId || "").trim(),
      isTruthy_(r.waterCheckOnly) ? "true" : "false"
    ].join("|");
  }

  function reportDuplicateKeyFromRow_(r) {
    return [
      normalizeReportDate_(reportCell_(r,0)),
      normalizeReportValue_(reportCell_(r,1)),
      normalizeReportValue_(reportCell_(r,2)),
      normalizeReportValue_(reportCell_(r,3)),
      normalizeReportValue_(reportCell_(r,4)),
      normalizeReportValue_(reportCell_(r,5)),
      normalizeReportValue_(reportCell_(r,6)),
      normalizeReportValue_(reportCell_(r,7)),
      normalizeReportValue_(reportCell_(r,8)),
      normalizeReportValue_(reportCell_(r,9)),
      normalizeReportValue_(reportCell_(r,10)),
      normalizeReportValue_(reportCell_(r,11)),
      normalizeReportDate_(reportCell_(r,12)),
      normalizeReportDate_(reportCell_(r,13)),
      normalizeReportValue_(reportCell_(r,15)),
      normalizeReportValue_(reportCell_(r,16)),
      normalizeReportDate_(reportCell_(r,17)),
      normalizeReportValue_(reportCell_(r,18)),
      normalizeReportValue_(reportCell_(r,19) || 0),
      normalizeReportValue_(reportCell_(r,20) || 0),
      normalizeReportValue_(reportCell_(r,21) || 0),
      normalizeReportValue_(reportCell_(r,22) || 0),
      normalizeReportValue_(reportCell_(r,23) || ""),
      String(reportCell_(r,24) || "").trim(),
      reportWaterCheckOnlyFromRow_(r) ? "true" : "false"
    ].join("|");
  }

  function normalizeReportDate_(value) {
    if (!value) return "";
    if (value instanceof Date) return Utilities.formatDate(value, "Asia/Jerusalem", "yyyy-MM-dd");
    const text = String(value).trim();
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
    const local = text.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/);
    if (local) {
      const year = String(local[3]).length === 2 ? `20${local[3]}` : local[3];
      return `${year}-${String(local[2]).padStart(2, "0")}-${String(local[1]).padStart(2, "0")}`;
    }
    return "";
  }

  function deterministicLegacyReportId_(row) {
    const raw = reportDuplicateKeyFromRow_(row);
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8)
      .map(value => (value < 0 ? value + 256 : value).toString(16).padStart(2, "0"))
      .join("");
    return "legacy-" + digest.slice(0, 32);
  }

function normalizeReportValue_(value) {
  if (value === null || value === undefined) return "";
  const s = String(value).trim();
  if (s === "") return "";
  const n = Number(s);
  if (!isNaN(n)) return String(Math.round(n * 1000) / 1000);
  return s;
}

function poolIdentityKey_(clientId, clientName) {
  const id = String(clientId || "").trim();
  return id
    ? "id:" + id
    : "name:" + normalizeReportValue_(clientName).toLowerCase();
}

function dedupeRowsByFirstCell_(rows) {
  const map = {};
  (rows || []).filter(r => r && r[0]).forEach((r, index) => {
    const clientId = String(r[11] || "").trim();
    const supplyId = String(r[10] || "").trim();
    const key = clientId
      ? poolIdentityKey_(clientId, r[0])
      : supplyId
      ? "supply:" + supplyId
      : "legacy-row:" + index;
    map[key] = r;
  });
  return Object.keys(map).map(k => map[k]);
}

function syncLicenseCompanyFromClient_(ss, row) {
  try {
    const company = String(row && row[1] || "").trim();
    const sheetId = String(row && row[7] || "").trim();
    if (!company || !sheetId) return;
    const sheet = ss.getSheetByName("רישיונות");
    if (!sheet) return;
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][2] || "").trim() === sheetId) {
        sheet.getRange(i + 1, 2).setValue(company);
      }
    }
  } catch(e) {
    Logger.log("License company sync failed: " + e);
  }
}

function normalizeAdminOrderDate_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, "Asia/Jerusalem", "yyyy-MM-dd");
  return String(value || "").trim().slice(0, 10);
}

function adminOrderKey_(o) {
  const poolKey = String(o && o.clientId || "").trim()
    ? poolIdentityKey_(o && o.clientId, o && o.client)
    : "legacy-order:" + String(o && o.id || "");
  return [
    normalizeAdminOrderDate_(o && o.date),
    normalizeReportValue_(o && o.operator).toLowerCase(),
    poolKey
  ].join("|");
}

function dedupeAdminOrders_(adminOrders) {
  const map = {};
  (adminOrders || []).filter(o => o && o.date && o.operator && o.client).forEach(o => {
    map[adminOrderKey_(o)] = {
      id: o.id || adminOrderKey_(o),
      date: normalizeAdminOrderDate_(o.date),
      operator: String(o.operator || ""),
      client: String(o.client || ""),
      clientId: String(o.clientId || ""),
      orderIndex: Number(o.orderIndex || 0),
      adminNote: String(o.adminNote || ""),
      status: String(o.status || "pending"),
      changeLog: Array.isArray(o.changeLog) ? o.changeLog : []
    };
  });
  return Object.keys(map).map(k => map[k]);
}

function getUsers_(ss) {
  const sheet = ss.getSheetByName("Users");
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  let hi = rows.findIndex(r => r.some(c => String(c).toLowerCase() === "username"));
  if (hi === -1) hi = 0;
  const headers = rows[hi].map(h => String(h || "").trim());
  return rows.slice(hi + 1).filter(r => r[0]).map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = r[i]);
    obj.username = String(obj.username || obj.Username || obj["שם משתמש"] || obj["שם_משתמש"] || "").trim();
    obj.password = obj.password ?? obj.Password ?? obj["סיסמה"] ?? obj["סיסמא"] ?? "";
    obj.role = String(obj.role || obj.Role || obj["תפקיד"] || obj["סוג משתמש"] || obj["סוג_משתמש"] || "").trim();
    obj.name = String(obj.name || obj.Name || obj["שם"] || obj["שם מלא"] || obj["שם_מלא"] || "").trim();
    obj.phone = String(obj.phone || obj.Phone || obj["טלפון"] || obj["נייד"] || "").trim();
    const linkedOperator = String(
      obj.linkedOperator ||
      obj.assignedOperator ||
      obj.parentOperator ||
      obj.operator ||
      obj.regularOperator ||
      obj["מפעיל משויך"] ||
      obj["מפעיל_משויך"] ||
      obj["מפעיל קבוע"] ||
      obj["מפעיל_קבוע"] ||
      ""
    ).trim();
    obj.linkedOperator = linkedOperator;
    obj.assignedOperator = String(obj.assignedOperator || linkedOperator || "").trim();
    return obj;
  });
}

function saveSubOperatorAssignment_(ss, data) {
  const sheet = ss.getSheetByName("Users");
  if (!sheet) return { success:false, error:"Users sheet not found" };
  ensureColumns(sheet, ["username","linkedOperator","assignedOperator"]);
  const rows = sheet.getDataRange().getValues();
  let hi = rows.findIndex(r => r.some(c => String(c).toLowerCase() === "username"));
  if (hi === -1) hi = 0;
  const headers = rows[hi].map(h => String(h || "").trim());
  const usernameIdx = headers.findIndex(h => h.toLowerCase() === "username");
  const linkedIdx = headers.indexOf("linkedOperator");
  const assignedIdx = headers.indexOf("assignedOperator");
  const target = String(data.username || "").trim().toLowerCase();
  if (!target || usernameIdx < 0 || linkedIdx < 0 || assignedIdx < 0) return { success:false, error:"missing columns" };
  for (let i = hi + 1; i < rows.length; i++) {
    if (String(rows[i][usernameIdx] || "").trim().toLowerCase() !== target) continue;
    const row = i + 1;
    const operator = String(data.operator || "").trim();
    sheet.getRange(row, linkedIdx + 1).setValue(operator);
    sheet.getRange(row, assignedIdx + 1).setValue(operator);
    return { success:true, row };
  }
  return { success:false, error:"user not found" };
}

function getClientsByHeaders_(ss) {
  const sheets = ss.getSheets();
  const hasClientHeader = (sh, allColumns) => {
    const lastRow = Math.min(sh.getLastRow(), 8);
    if (!lastRow) return false;
    const lastCol = allColumns ? Math.max(sh.getLastColumn(), 1) : 1;
    return sh.getRange(1, 1, lastRow, lastCol).getValues().some(row => row.some(cell => isClientNameHeader_(cell)));
  };
  const clientSheet = ss.getSheetByName("לקוחות");
  const sheet = (clientSheet && hasClientHeader(clientSheet, true))
    ? clientSheet
    : sheets.find(sh => hasClientHeader(sh, false));
  if (!sheet) return [];
  if (sheet.getName() === "לקוחות") {
    ensureColumns(sheet, [
      "clientId",
      "קוד_שער",
      "סוג_בריכה",
      "ימים_קבועים",
      "מפעיל_קבוע",
      "ימי_בדיקת_מים",
      "יתרת_טיפולים_חודשית",
      "מונה_טיפולים_בפועל",
      "מכסת_טיפולים_חודשית",
      "חודש_טיפולים"
    ]);
  }

  const rows = sheet.getDataRange().getValues();
  let hi = rows.findIndex(r => r.some(cell => isClientNameHeader_(cell)));
  if (hi === -1) hi = 2;
  const headers = (rows[hi] || []).map(h => String(h || "").trim());
  const normalizeHeader = (value) => String(value || "").replace(/[\s_\-]/g, "").toLowerCase();
  const columnOf = (names, fallback) => {
    const wanted = names.map(normalizeHeader);
    const idx = headers.findIndex(header => wanted.includes(normalizeHeader(header)));
    return idx >= 0 ? idx : fallback;
  };
  const columnsOf = (names, fallback) => {
    const wanted = names.map(normalizeHeader);
    const indexes = headers.map((header, idx) => wanted.includes(normalizeHeader(header)) ? idx : -1).filter(idx => idx >= 0);
    return indexes.length ? indexes : [fallback];
  };
  const cleanPhone = (value) => {
    const raw = String(value || "").trim();
    if (!raw || raw.charAt(0) === "#") return "";
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    if (digits.indexOf("972") === 0 && digits.length >= 11) return digits;
    if (digits.indexOf("0") === 0 && digits.length >= 10) return "972" + digits.slice(1);
    if (digits.length === 9 && digits.indexOf("5") === 0) return "972" + digits;
    if (digits.length >= 10) return digits;
    return "";
  };
  const firstPhone = (row, indexes) => {
    for (const idx of indexes) {
      if (idx < 0) continue;
      const phone = cleanPhone(row[idx]);
      if (phone) return phone;
    }
    return "";
  };
  const clientIdIdx = columnOf(["clientId", "client_id", "id"], -1);
  const nameIdx = columnOf(["שם_לקוח", "שם לקוח", "שם", "לקוח", "שם הלקוח", "client", "name"], 0);
  const phoneIdx = columnOf(["טלפון", "נייד", "מספר טלפון", "phone", "mobile"], 1);
  const addressIdx = columnOf(["כתובת", "address"], 2);
  const qrIdx = columnOf(["qr_url", "QR", "קישור_QR", "qr"], 3);
  const gateIdx = columnOf(["קוד_שער", "קוד שער", "gateCode", "gate"], 4);
  const poolTypeIdx = columnOf(["סוג_בריכה", "סוג בריכה", "poolType"], 5);
  const regularDaysIdx = columnOf(["ימים_קבועים", "ימים קבועים", "regularDays"], 6);
  const regularOperatorIdx = columnOf(["מפעיל_קבוע", "מפעיל קבוע", "regularOperator"], 7);
  const waterCheckDaysIdx = columnOf(["ימי_בדיקת_מים", "ימי בדיקת מים", "waterCheckDays"], -1);
  const balanceIdx = columnOf(["יתרת_טיפולים_חודשית", "יתרת טיפולים חודשית", "monthlyTreatmentBalance"], 8);
  const countIdx = columnOf(["מונה_טיפולים_בפועל", "מונה טיפולים בפועל", "monthlyTreatmentCount"], 9);
  const quotaIdx = columnOf(["מכסת_טיפולים_חודשית", "מכסת טיפולים חודשית", "monthlyTreatmentQuota"], -1);
  const phoneIndexes = columnsOf(["phone", "mobile", "whatsapp", "wa"], phoneIdx);
  const dataRows = rows.slice(hi + 1);

  if (clientIdIdx >= 0 && dataRows.length) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      const idRange = sheet.getRange(hi + 2, clientIdIdx + 1, dataRows.length, 1);
      const latestIds = idRange.getValues();
      const usedIds = {};
      let idsChanged = false;
      const idValues = dataRows.map((row, index) => {
        const hasClient = !!String(row[nameIdx] || "").trim();
        let id = String(latestIds[index][0] || "").trim();
        if (hasClient && (!id || usedIds[id])) {
          id = "client-" + Utilities.getUuid();
          idsChanged = true;
        }
        row[clientIdIdx] = id;
        if (id) usedIds[id] = true;
        return [id];
      });
      if (idsChanged) idRange.setValues(idValues);
    } finally {
      try { lock.releaseLock(); } catch(e) {}
    }
  }

  return dataRows.filter(r => r[nameIdx]).map(r => ({
    clientId: String(clientIdIdx >= 0 ? r[clientIdIdx] || "" : ""),
    name: String(r[nameIdx] || ""),
    phone: firstPhone(r, phoneIndexes),
    address: String(r[addressIdx] || ""),
    qrUrl: String(r[qrIdx] || ""),
    gateCode: String(r[gateIdx] || ""),
    poolType: String(r[poolTypeIdx] || "מלח"),
    regularDays: String(r[regularDaysIdx] || ""),
    regularOperator: String(r[regularOperatorIdx] || ""),
    waterCheckDays: String(waterCheckDaysIdx >= 0 ? r[waterCheckDaysIdx] || "" : ""),
    monthlyTreatmentBalance: Number(r[balanceIdx] || 0),
    monthlyTreatmentCount: Number(r[countIdx] || 0),
    monthlyTreatmentQuota: Number(quotaIdx >= 0 ? r[quotaIdx] || 0 : 0)
  }));
}

function getClients_(ss) {
  return getClientsByHeaders_(ss);
}

function allClientRecords_(ss) {
  const records = getClients_(ss).slice();
  if (ss.getSheetByName("לקוחות_ללא_שיוך")) {
    records.push.apply(records, getUnassignedClients_(ss));
  }
  const seenIds = {};
  return records.filter(client => {
    const id = String(client && client.clientId || "").trim();
    if (!id) return true;
    if (seenIds[id]) return false;
    seenIds[id] = true;
    return true;
  });
}

function getClientSettingsSheet_(ss) {
  let sheet = ss.getSheetByName("ClientSettings");
  if (!sheet) {
    sheet = ss.insertSheet("ClientSettings");
    sheet.appendRow(["key","value"]);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(["key","value"]);
  }
  return sheet;
}

function getClientSettings_(ss) {
  const sheet = getClientSettingsSheet_(ss);
  const rows = sheet.getDataRange().getValues();
  const settings = {};
  rows.slice(1).forEach(row => {
    const key = String(row[0] || "").trim();
    if (key) settings[key] = String(row[1] || "");
  });
  return settings;
}

function saveClientSettings_(ss, settings) {
  const sheet = getClientSettingsSheet_(ss);
  const rows = sheet.getDataRange().getValues();
  const indexByKey = {};
  rows.slice(1).forEach((row, i) => {
    const key = String(row[0] || "").trim();
    if (key) indexByKey[key] = i + 2;
  });

  Object.keys(settings || {}).forEach(key => {
    const value = String(settings[key] || "");
    const row = indexByKey[key];
    if (row) {
      sheet.getRange(row, 2).setValue(value);
    } else {
      sheet.appendRow([key, value]);
    }
  });
  return { success:true, settings:getClientSettings_(ss) };
}

function operatorDoneAlertHeaders_() {
  return ["id","date","operator","message","createdAt","createdBy","dismissedAt","dismissedBy"];
}

function getOperatorDoneAlertsSheet_(ss) {
  let sheet = ss.getSheetByName("סיום_מפעילים");
  if (!sheet) {
    sheet = ss.insertSheet("סיום_מפעילים");
    sheet.appendRow(operatorDoneAlertHeaders_());
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(operatorDoneAlertHeaders_());
  } else {
    ensureColumns(sheet, operatorDoneAlertHeaders_());
  }
  return sheet;
}

function operatorDoneAlertId_(date, operator) {
  return [normalizeAdminOrderDate_(date), normalizeReportValue_(operator).toLowerCase()].join(":");
}

function operatorDoneAlertObject_(headers, row, rowNumber) {
  const obj = { rowIndex: rowNumber };
  headers.forEach((h, i) => obj[h] = row[i]);
  return {
    rowIndex: rowNumber,
    id: String(obj.id || ""),
    date: normalizeAdminOrderDate_(obj.date),
    operator: String(obj.operator || ""),
    message: String(obj.message || ""),
    createdAt: String(obj.createdAt || ""),
    createdBy: String(obj.createdBy || ""),
    dismissedAt: String(obj.dismissedAt || ""),
    dismissedBy: String(obj.dismissedBy || "")
  };
}

function getOperatorDoneAlerts_(ss, data) {
  const sheet = getOperatorDoneAlertsSheet_(ss);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  const targetDate = normalizeAdminOrderDate_(data && data.date);
  return values.slice(1).map((row, idx) => operatorDoneAlertObject_(headers, row, idx + 2))
    .filter(item => item.id && !item.dismissedAt && (!targetDate || item.date === targetDate))
    .sort((a,b)=>String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function saveOperatorDoneAlert_(ss, data) {
  const sheet = getOperatorDoneAlertsSheet_(ss);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const date = normalizeAdminOrderDate_(data.date || new Date());
  const operator = String(data.operator || "").trim();
  if (!operator) return { success:false, error:"missing_operator" };
  const id = String(data.id || "").trim() || operatorDoneAlertId_(date, operator);
  const message = String(data.message || `${operator} המפעיל סיים הכל להיום:)`);
  const createdAt = Utilities.formatDate(new Date(), "Asia/Jerusalem", "yyyy-MM-dd HH:mm:ss");
  const values = sheet.getDataRange().getValues();
  const idCol = headers.indexOf("id");
  const rowIndex = values.findIndex((row, idx) => idx > 0 && String(row[idCol] || "") === id);
  const rowValues = headers.map(h => {
    if (h === "id") return id;
    if (h === "date") return date;
    if (h === "operator") return operator;
    if (h === "message") return message;
    if (h === "createdAt") return createdAt;
    if (h === "createdBy") return String(data.createdBy || operator);
    if (h === "dismissedAt" || h === "dismissedBy") return "";
    return "";
  });
  if (rowIndex > 0) {
    sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([rowValues]);
    return { success:true, duplicate:true, id };
  }
  sheet.appendRow(rowValues);
  return { success:true, id };
}

function dismissOperatorDoneAlert_(ss, data) {
  const sheet = getOperatorDoneAlertsSheet_(ss);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { success:false, error:"empty" };
  const headers = values[0].map(String);
  const idCol = headers.indexOf("id");
  const dismissedAtCol = headers.indexOf("dismissedAt");
  const dismissedByCol = headers.indexOf("dismissedBy");
  const id = String(data.id || "").trim();
  const rowIndex = values.findIndex((row, idx) => idx > 0 && String(row[idCol] || "") === id);
  if (rowIndex <= 0) return { success:false, error:"not_found" };
  const rowNumber = rowIndex + 1;
  if (dismissedAtCol >= 0) sheet.getRange(rowNumber, dismissedAtCol + 1).setValue(Utilities.formatDate(new Date(), "Asia/Jerusalem", "yyyy-MM-dd HH:mm:ss"));
  if (dismissedByCol >= 0) sheet.getRange(rowNumber, dismissedByCol + 1).setValue(String(data.dismissedBy || ""));
  return { success:true };
}

function getUsageEventsSheet_(ss) {
  const headers = ["timestamp","sessionId","userId","role","screen","event","target","metadata","userAgent","appVersion"];
  let sheet = ss.getSheetByName("UsageEvents");
  if (!sheet) {
    sheet = ss.insertSheet("UsageEvents");
    sheet.appendRow(headers);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  } else {
    ensureColumns(sheet, headers);
  }
  return sheet;
}

function cleanUsageValue_(value, maxLen) {
  return String(value || "").slice(0, maxLen || 180);
}

function trackUsageEvent_(ss, event) {
  const safeEvent = event || {};
  const sheet = getUsageEventsSheet_(ss);
  let metadata = "{}";
  try {
    metadata = JSON.stringify(safeEvent.metadata || {});
  } catch (e) {
    metadata = "{}";
  }
  sheet.appendRow([
    safeEvent.timestamp ? new Date(safeEvent.timestamp) : new Date(),
    cleanUsageValue_(safeEvent.sessionId, 80),
    cleanUsageValue_(safeEvent.userId, 120),
    cleanUsageValue_(safeEvent.role, 60),
    cleanUsageValue_(safeEvent.screen, 80),
    cleanUsageValue_(safeEvent.event, 80),
    cleanUsageValue_(safeEvent.target, 120),
    metadata.slice(0, 1000),
    cleanUsageValue_(safeEvent.userAgent, 300),
    cleanUsageValue_(safeEvent.appVersion, 80)
  ]);
  return { success:true };
}

function stableClientId_(client) {
  const raw = [
    client && client.name,
    client && client.phone,
    client && client.address
  ].filter(Boolean).join("|") || Utilities.getUuid();
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  return "client-" + Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, "").slice(0, 18);
}

function saveClients_(sheet, clients) {
  if (!sheet) return { success:false, error:"clients sheet not found" };
  const headerRowIndex = findHeaderRowIndex_(sheet, ["שם_לקוח", "שם לקוח", "שם", "לקוח", "שם הלקוח"]);
  const headerRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 3;
  ensureColumns(sheet, [
    "clientId",
    "קוד_שער",
    "סוג_בריכה",
    "ימים_קבועים",
    "מפעיל_קבוע",
    "ימי_בדיקת_מים",
    "יתרת_טיפולים_חודשית",
    "מונה_טיפולים_בפועל",
    "מכסת_טיפולים_חודשית",
    "חודש_טיפולים"
  ]);

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0].map(h => String(h || "").trim());
  const headerMap = {};
  headers.forEach((header, idx) => { if (header) headerMap[header] = idx; });
  const aliases = {
    clientId: ["clientId", "client_id", "id"],
    name: ["שם_לקוח", "שם לקוח", "שם", "לקוח", "שם הלקוח"],
    phone: ["טלפון", "נייד", "מספר טלפון"],
    address: ["כתובת"],
    qrUrl: ["qr_url", "QR", "קישור_QR"],
    gateCode: ["קוד_שער", "קוד שער"],
    poolType: ["סוג_בריכה", "סוג בריכה"],
    regularDays: ["ימים_קבועים", "ימים קבועים"],
    regularOperator: ["מפעיל_קבוע", "מפעיל קבוע"],
    waterCheckDays: ["ימי_בדיקת_מים", "ימי בדיקת מים"],
    monthlyTreatmentBalance: ["יתרת_טיפולים_חודשית"],
    monthlyTreatmentCount: ["מונה_טיפולים_בפועל"],
    monthlyTreatmentQuota: ["מכסת_טיפולים_חודשית"],
    monthlyTreatmentMonth: ["חודש_טיפולים"]
  };
  const colOf = (key) => {
    const names = aliases[key] || [key];
    for (const name of names) if (headerMap[name] !== undefined) return headerMap[name];
    return -1;
  };

  const dataStart = headerRow + 1;
  const lastRow = sheet.getLastRow();
  const nameIdx = colOf("name");
  const clientIdIdx = colOf("clientId");
  const existingById = {};
  const existingByName = {};
  if (lastRow >= dataStart) {
    sheet.getRange(dataStart, 1, lastRow - headerRow, lastCol).getValues().forEach((row, offset) => {
      const name = String(row[nameIdx >= 0 ? nameIdx : 0] || "").trim();
      const id = clientIdIdx >= 0 ? String(row[clientIdIdx] || "").trim() : "";
      const rowNumber = dataStart + offset;
      const record = { row, rowNumber };
      if (id) existingById[id] = record;
      if (name) {
        const nameKey = normalizeReportValue_(name).toLowerCase();
        if (!existingByName[nameKey]) existingByName[nameKey] = [];
        existingByName[nameKey].push(record);
      }
    });
  }

  const managedKeys = [
    "clientId",
    "name",
    "phone",
    "address",
    "qrUrl",
    "gateCode",
    "poolType",
    "regularDays",
    "regularOperator",
    "waterCheckDays",
    "monthlyTreatmentBalance",
    "monthlyTreatmentCount",
    "monthlyTreatmentQuota",
    "monthlyTreatmentMonth"
  ];
  const setValue = (row, key, value) => {
    const idx = colOf(key);
    if (idx >= 0) row[idx] = value;
  };
  const valueFor = (c, key, original) => {
    const monthIdx = colOf("monthlyTreatmentMonth");
    const values = {
      clientId: String(c.clientId || c.id || (clientIdIdx >= 0 ? original[clientIdIdx] : "") || ("client-" + Utilities.getUuid())),
      name: String(c.name || "").trim(),
      phone: String(c.phone || ""),
      address: String(c.address || ""),
      qrUrl: String(c.qrUrl || ""),
      gateCode: String(c.gateCode || ""),
      poolType: String(c.poolType || "מלח"),
      regularDays: String(c.regularDays || ""),
      regularOperator: String(c.regularOperator || ""),
      waterCheckDays: String(c.waterCheckDays || ""),
      monthlyTreatmentBalance: numberOrZero(c.monthlyTreatmentBalance),
      monthlyTreatmentCount: numberOrZero(c.monthlyTreatmentCount),
      monthlyTreatmentQuota: numberOrZero(c.monthlyTreatmentQuota ?? c.monthlyTreatmentBalance),
      monthlyTreatmentMonth: c.monthlyTreatmentMonth ?? (monthIdx >= 0 ? original[monthIdx] : "") ?? ""
    };
    return values[key];
  };
  const sameCellValue = (a, b) => {
    if (a instanceof Date || b instanceof Date) return String(a) === String(b);
    return String(a ?? "") === String(b ?? "");
  };
  const numberOrZero = (value) => Number(value ?? 0) || 0;
  let updated = 0;
  let appended = 0;
  let matched = 0;
  const uniqueClients = {};
  clients.filter(c => c && String(c.name || "").trim()).forEach((c, index) => {
    const id = String(c.clientId || c.id || "").trim();
    const key = id ? ("id:" + id) : ("row:" + index);
    uniqueClients[key] = c;
  });
  Object.keys(uniqueClients).map(key => uniqueClients[key]).forEach(c => {
    const wantedId = String(c.clientId || c.id || c.originalClientId || "").trim();
    const originalNameKey = normalizeReportValue_(c.originalName || c.name).toLowerCase();
    const nameCandidates = existingByName[originalNameKey] || [];
    const record = (wantedId && existingById[wantedId]) ||
      (c.originalName && nameCandidates.length === 1 ? nameCandidates[0] : null) ||
      (!wantedId && nameCandidates.length === 1 ? nameCandidates[0] : null);
    if (record) {
      matched++;
      managedKeys.forEach(key => {
        const idx = colOf(key);
        if (idx < 0) return;
        if (key === "monthlyTreatmentMonth" && !Object.prototype.hasOwnProperty.call(c, "monthlyTreatmentMonth")) return;
        const nextValue = valueFor(c, key, record.row);
        if (!sameCellValue(record.row[idx], nextValue)) {
          sheet.getRange(record.rowNumber, idx + 1).setValue(nextValue);
          record.row[idx] = nextValue;
          updated++;
        }
      });
      return;
    }

    const row = Array.from({ length: lastCol }, () => "");
    managedKeys.forEach(key => setValue(row, key, valueFor(c, key, row)));
    sheet.appendRow(row);
    appended++;
  });
  return { success:true, count:clients.length, updated, appended, matched };
}

function deleteClient_(sheet, data) {
  if (!sheet) return { success:false, error:"clients sheet not found" };

  const targetId = String(data.clientId || data.id || "").trim();
  const targetName = String(data.originalName || data.clientName || data.name || "").trim();
  if (!targetId && !targetName) return { success:false, error:"missing client identity" };

  const headerRowIndex = findHeaderRowIndex_(sheet, ["שם_לקוח", "שם לקוח", "שם", "לקוח", "שם הלקוח"]);
  const headerRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 3;
  const dataStart = headerRow + 1;
  const lastRow = sheet.getLastRow();
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  if (lastRow < dataStart) return { success:false, error:"client not found", clientName:targetName };

  const headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0].map(h => String(h || "").trim());
  let nameIdx = headers.findIndex(h => isClientNameHeader_(h));
  if (nameIdx < 0) nameIdx = 0;
  const clientIdIdx = headers.findIndex(h => ["clientid","client_id","id"].includes(String(h || "").trim().toLowerCase()));

  const targetKey = normalizeReportValue_(targetName).toLowerCase();
  const rows = sheet.getRange(dataStart, 1, lastRow - headerRow, lastCol).getValues();
  const matches = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const rowId = clientIdIdx >= 0 ? String(rows[i][clientIdIdx] || "").trim() : "";
    const rowName = String(rows[i][nameIdx] || "").trim();
    if ((targetId && rowId === targetId) || (!targetId && normalizeReportValue_(rowName).toLowerCase() === targetKey)) matches.push(i);
  }
  if (!matches.length) return { success:false, error:"client not found", clientName:targetName, clientId:targetId };
  if (!targetId && matches.length > 1) return { success:false, error:"ambiguous client name", clientName:targetName };
  const rowNumber = dataStart + matches[0];
  sheet.deleteRow(rowNumber);
  return { success:true, deleted:true, row:rowNumber, clientName:targetName, clientId:targetId };

}

function taskHeaders_() {
  return ["id","תאריך","לקוח","מפעילים","סטטוס","changeLog","orderIndex","adminNote","createdByAdminOrder","clientId","operatorCreated","adminApproval","requestedBy"];
}

function withGalileoWriteLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

function taskColumnIndex_(headers, names, fallback) {
  const normalized = headers.map(h => String(h || "").trim().replace(/[\s_\-]/g, "").toLowerCase());
  const wanted = names.map(name => String(name || "").trim().replace(/[\s_\-]/g, "").toLowerCase());
  const found = normalized.findIndex(header => wanted.includes(header));
  return found >= 0 ? found : fallback;
}

function getTasks_(ss) {
  const sheet = ss.getSheetByName("משימות");
  if (!sheet) return [];
  const originalRows = sheet.getDataRange().getValues();
  let hi = originalRows.findIndex(r => String(r[0]).toUpperCase() === "ID" || String(r[0]).toLowerCase() === "id");
  if (hi === -1) hi = 2;
  const originalHeaders = (originalRows[hi] || []).map(h => String(h || "").trim());
  const legacyShiftedClientId = originalHeaders.indexOf("clientId") === 6 && originalHeaders.indexOf("orderIndex") < 0;
  ensureColumns(sheet, taskHeaders_());
  const rows = sheet.getDataRange().getValues();
  const headers = (rows[hi] || []).map(h => String(h || "").trim());
  const idx = {
    id: taskColumnIndex_(headers, ["id","ID"], 0),
    date: taskColumnIndex_(headers, ["תאריך","date"], 1),
    client: taskColumnIndex_(headers, ["לקוח","client"], 2),
    operators: taskColumnIndex_(headers, ["מפעילים","operators"], 3),
    status: taskColumnIndex_(headers, ["סטטוס","status"], 4),
    changeLog: taskColumnIndex_(headers, ["changeLog"], 5),
    orderIndex: taskColumnIndex_(headers, ["orderIndex","סדר"], 6),
    adminNote: taskColumnIndex_(headers, ["adminNote","הערת_מנהל","הערת מנהל"], 7),
    createdByAdminOrder: taskColumnIndex_(headers, ["createdByAdminOrder"], 8),
    clientId: legacyShiftedClientId ? 9 : taskColumnIndex_(headers, ["clientId"], 9),
    operatorCreated: taskColumnIndex_(headers, ["operatorCreated"], 10),
    adminApproval: taskColumnIndex_(headers, ["adminApproval"], 11),
    requestedBy: taskColumnIndex_(headers, ["requestedBy"], 12)
  };
  return rows.slice(hi + 1).filter(r => r[idx.id]).map(r => {
    let date = r[idx.date];
    if (date instanceof Date) {
      date = Utilities.formatDate(date, "Asia/Jerusalem", "yyyy-MM-dd");
    } else {
      date = String(date).slice(0,10);
    }
    const adminApproval = String(r[idx.adminApproval] || "");
    return {
      id: r[idx.id], date,
      client: r[idx.client],
      operators: r[idx.operators] ? String(r[idx.operators]).split(",").map(x => x.trim()) : [],
      status: String(r[idx.status] || "pending"),
      changeLog: r[idx.changeLog] ? JSON.parse(String(r[idx.changeLog])) : [],
      orderIndex: Number(r[idx.orderIndex] || 0),
      adminNote: String(r[idx.adminNote] || ""),
      createdByAdminOrder: String(r[idx.createdByAdminOrder] || "").toLowerCase() === "true" || r[idx.createdByAdminOrder] === true,
      clientId: String(r[idx.clientId] || ""),
      operatorCreated: String(r[idx.operatorCreated] || "").toLowerCase() === "true" || r[idx.operatorCreated] === true || !!adminApproval,
      adminApproval,
      requestedBy: String(r[idx.requestedBy] || "")
    };
  }).filter(t => !isAdminOrderTask_(t));
}

function saveTasks_(ss, tasks) {
  let sheet = ss.getSheetByName("משימות");
  const headers = taskHeaders_();
  if (!sheet) {
    sheet = ss.insertSheet("משימות");
    sheet.appendRow(headers);
  }
  ensureColumns(sheet, headers);
  const rows = sheet.getDataRange().getValues();
  let hi = rows.findIndex(r => String(r[0]).toUpperCase() === "ID" || String(r[0]).toLowerCase() === "id");
  if (hi === -1) hi = 0;
  sheet.getRange(hi + 1, 1, 1, headers.length).setValues([headers]);
  const dataStart = hi + 2;
  const last = sheet.getLastRow();
  if (last >= dataStart) sheet.deleteRows(dataStart, last - dataStart + 1);
  const cleanTasks = dedupeTasks_(tasks || []).filter(t => !isAdminOrderTask_(t));
  const taskRows = cleanTasks.map(t => ([
    t.id,
    t.date,
    t.client,
    t.operators.join(","),
    t.status,
    JSON.stringify(t.changeLog),
    t.orderIndex || 0,
    t.adminNote || "",
    t.createdByAdminOrder === true,
    t.clientId || "",
    t.operatorCreated === true,
    t.adminApproval || "",
    t.requestedBy || ""
  ]));
  if (taskRows.length) sheet.getRange(dataStart, 1, taskRows.length, headers.length).setValues(taskRows);
  return cleanTasks;
}

function mutateTasks_(ss, data) {
  const deleteIds = {};
  (data && data.deleteIds || []).forEach(function (id) {
    deleteIds[String(id)] = true;
  });
  const currentTasks = getTasks_(ss).filter(function (task) {
    return !deleteIds[String(task && task.id)];
  });
  const taskIndexes = {};
  currentTasks.forEach(function (task, index) {
    taskIndexes[String(task && task.id)] = index;
  });
  (data && data.upserts || []).forEach(function (task) {
    if (!task || task.id === null || task.id === undefined || !task.date || !task.client) return;
    const key = String(task.id);
    if (taskIndexes[key] === undefined) {
      taskIndexes[key] = currentTasks.length;
      currentTasks.push(task);
    } else {
      currentTasks[taskIndexes[key]] = task;
    }
  });
  const savedTasks = saveTasks_(ss, currentTasks);
  return { success:true, tasks:savedTasks };
}

function taskMatchesReport_(task, report) {
  if (normalizeAdminOrderDate_(task && task.date) !== normalizeAdminOrderDate_(report && report.reportDate)) return false;
  const taskClientId = String(task && task.clientId || "").trim();
  const reportClientId = String(report && report.clientId || "").trim();
  if (taskClientId || reportClientId) {
    if (!taskClientId || !reportClientId || taskClientId !== reportClientId) return false;
  } else {
    return false;
  }
  const operator = normalizeReportValue_(report && report.operator).toLowerCase();
  return !!operator && (task && task.operators || []).some(function (value) {
    return normalizeReportValue_(value).toLowerCase() === operator;
  });
}

function setTaskReportCompletion_(ss, data) {
  const report = data && data.report || {};
  const requestedTaskId = String(data && data.taskId || "").trim();
  const completed = data && data.completed !== false;
  const tasks = getTasks_(ss);
  const matchingTasks = tasks.filter(function (task) {
    return taskMatchesReport_(task, report);
  });
  let task = requestedTaskId
    ? matchingTasks.find(function (candidate) { return String(candidate.id) === requestedTaskId; })
    : null;
  if (!task) {
    task = matchingTasks.find(function (candidate) {
      return completed ? candidate.status !== "done" : candidate.status === "done";
    }) || matchingTasks[0] || null;
  }
  if (!task) return { success:true, taskFound:false, tasks:tasks };

  if (completed && task.status === "done") {
    return { success:true, taskFound:true, task:task, tasks:tasks };
  }
  if (!completed && task.status !== "done") {
    return { success:true, taskFound:true, task:task, tasks:tasks };
  }

  const completionNotes = {"דוח הוגש — בוצעה":true, "דוח נשמר — בוצעה":true};
  const completedByReport = data && data.completedByReport === true ||
    (task.changeLog || []).some(function (entry) {
      return completionNotes[String(entry && entry.note || "")] === true;
    });
  if (!completed && !completedByReport) {
    return { success:true, taskFound:true, task:task, tasks:tasks, unchanged:true };
  }

  const actor = String(data && data.actor || "");
  const reportId = String(report && report.id || "");
  const nextTask = completed
    ? Object.assign({}, task, {
        status:"done",
        completedAt:String(data && data.completedAt || ""),
        completedBy:actor,
        reportId:reportId,
        changeLog:(task.changeLog || []).concat([{
          at:String(data && data.at || ""),
          note:"דוח נשמר — בוצעה",
          by:actor
        }])
      })
    : Object.assign({}, task, {
        status:"pending",
        completedAt:"",
        completedBy:"",
        reportId:"",
        changeLog:(task.changeLog || []).concat([{
          at:String(data && data.at || ""),
          note:"דוח מקומי נמחק — הוחזרה לממתינה",
          by:actor
        }])
      });
  const nextTasks = tasks.map(function (candidate) {
    return String(candidate.id) === String(task.id) ? nextTask : candidate;
  });
  const savedTasks = saveTasks_(ss, nextTasks);
  return { success:true, taskFound:true, task:nextTask, tasks:savedTasks };
}
function isAdminOrderTask_(t) {
  return !!(t && (t.createdByAdminOrder === true || Number(t.orderIndex || 0) > 0));
}

function taskKey_(t) {
  const operators = (t && t.operators || []).map(op => normalizeReportValue_(op).toLowerCase()).filter(Boolean).sort().join(",");
  const poolKey = String(t && t.clientId || "").trim()
    ? poolIdentityKey_(t && t.clientId, t && t.client)
    : "legacy-task:" + String(t && t.id || "");
  return [
    normalizeAdminOrderDate_(t && t.date),
    poolKey,
    operators
  ].join("|");
}

function dedupeTasks_(tasks) {
  const map = {};
  (tasks || []).filter(t => t && t.date && t.client && !isAdminOrderTask_(t)).forEach(t => {
    const key = taskKey_(t);
    const adminApproval = String(t.adminApproval || "");
    map[key] = {
      id: t.id || key,
      date: normalizeAdminOrderDate_(t.date),
      client: String(t.client || ""),
      operators: Array.isArray(t.operators) ? t.operators : String(t.operators || "").split(",").map(x => x.trim()).filter(Boolean),
      status: String(t.status || "pending"),
      changeLog: Array.isArray(t.changeLog) ? t.changeLog : [],
      orderIndex: Number(t.orderIndex || 0),
      adminNote: String(t.adminNote || ""),
      createdByAdminOrder: t.createdByAdminOrder === true,
      clientId: String(t.clientId || ""),
      operatorCreated: t.operatorCreated === true || String(t.operatorCreated || "").toLowerCase() === "true" || !!adminApproval,
      adminApproval,
      requestedBy: String(t.requestedBy || "")
    };
  });
  return Object.keys(map).map(k => map[k]);
}
function getAdminOrders_(ss) {
  const sheet = ss.getSheetByName("חלוקת_עבודה");
  let orders = [];
  if (sheet) {
    const rows = sheet.getDataRange().getValues();
    let hi = rows.findIndex(r => String(r[0]).toUpperCase() === "ID");
    if (hi === -1) hi = 0;
    orders = rows.slice(hi + 1).filter(r => r[0]).map(r => {
      let date = r[1];
      if (date instanceof Date) {
        date = Utilities.formatDate(date, "Asia/Jerusalem", "yyyy-MM-dd");
      } else {
        date = String(date || "").slice(0,10);
      }
      return {
        id: r[0],
        date,
        operator: String(r[2] || ""),
        client: String(r[3] || ""),
        orderIndex: Number(r[4] || 0),
        adminNote: String(r[5] || ""),
        status: String(r[6] || "pending"),
        changeLog: r[7] ? JSON.parse(String(r[7])) : [],
        clientId: String(r[8] || "")
      };
    });
  }

  const legacySheet = ss.getSheetByName("משימות");
  if (!legacySheet) return dedupeAdminOrders_(orders);
  const rows = legacySheet.getDataRange().getValues();
  let hi = rows.findIndex(r => String(r[0]).toUpperCase() === "ID");
  if (hi === -1) hi = 2;
  const existingKeys = {};
  orders.forEach(o => {
    existingKeys[adminOrderKey_(o)] = true;
  });
  const legacyOrders = rows.slice(hi + 1).filter(r => r[0]).map(r => {
    let date = r[1];
    if (date instanceof Date) {
      date = Utilities.formatDate(date, "Asia/Jerusalem", "yyyy-MM-dd");
    } else {
      date = String(date || "").slice(0,10);
    }
    const orderIndex = Number(r[6] || 0);
    const createdByAdminOrder = String(r[8] || "").toLowerCase() === "true" || r[8] === true;
    if (!createdByAdminOrder && orderIndex <= 0) return null;
    const operators = r[3] ? String(r[3]).split(",").map(x => x.trim()).filter(Boolean) : [];
    return {
      id: r[0],
      date,
      operator: operators[0] || "",
      client: String(r[2] || ""),
      orderIndex,
      adminNote: String(r[7] || ""),
      status: String(r[4] || "pending"),
      changeLog: r[5] ? JSON.parse(String(r[5])) : [],
      clientId: String(r[9] || "")
    };
  }).filter(Boolean);
  legacyOrders.forEach(o => {
    const key = adminOrderKey_(o);
    if (!existingKeys[key]) orders.push(o);
  });
  return dedupeAdminOrders_(orders);
}

function saveAdminOrders_(ss, adminOrders) {
  let sheet = ss.getSheetByName("חלוקת_עבודה");
  if (!sheet) sheet = ss.insertSheet("חלוקת_עבודה");

  const headers = ["id","\u05ea\u05d0\u05e8\u05d9\u05da","\u05de\u05e4\u05e2\u05d9\u05dc","\u05dc\u05e7\u05d5\u05d7","\u05e1\u05d3\u05e8","\u05d4\u05e2\u05e8\u05ea_\u05de\u05e0\u05d4\u05dc","\u05e1\u05d8\u05d8\u05d5\u05e1","changeLog","clientId"];
  const rows = dedupeAdminOrders_(adminOrders).filter(o => o && o.client).map(o => ([
    o.id,
    o.date,
    o.operator || "",
    o.client,
    Number(o.orderIndex || 0),
    o.adminNote || "",
    o.status || "pending",
    JSON.stringify(o.changeLog || []),
    o.clientId || ""
  ]));

  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function adminOrderScopeMatches_(order, date, operator) {
  return normalizeAdminOrderDate_(order && order.date) === date &&
    normalizeReportValue_(order && order.operator).toLowerCase() === normalizeReportValue_(operator).toLowerCase();
}

function saveAdminOrderScope_(ss, data) {
  const date = normalizeAdminOrderDate_(data && data.date);
  const operator = String(data && data.operator || "").trim();
  if (!date || !operator) return { success:false, error:"missing order scope" };

  const currentOrders = getAdminOrders_(ss);
  const existingByPool = {};
  currentOrders.filter(function (order) {
    return adminOrderScopeMatches_(order, date, operator);
  }).forEach(function (order) {
    existingByPool[poolIdentityKey_(order.clientId, order.client)] = order;
  });

  const changedAt = String(data && data.changedAt || "");
  const changedBy = String(data && data.changedBy || "");
  const incoming = dedupeAdminOrders_((data && data.orders || []).map(function (entry, index) {
    return {
      id:entry && entry.id,
      date:date,
      operator:operator,
      client:String(entry && entry.client || ""),
      clientId:String(entry && entry.clientId || ""),
      orderIndex:Number(entry && entry.orderIndex || index + 1),
      adminNote:String(entry && (entry.adminNote || entry.note) || "")
    };
  }));
  const scopedOrders = incoming.map(function (entry, index) {
    const existing = existingByPool[poolIdentityKey_(entry.clientId, entry.client)];
    return Object.assign({}, existing || {}, entry, {
      id:existing && existing.id || entry.id || [
        "admin-order",
        date,
        normalizeReportValue_(operator).toLowerCase(),
        entry.clientId || normalizeReportValue_(entry.client).toLowerCase()
      ].join("-"),
      status:existing && existing.status || "pending",
      changeLog:existing && existing.changeLog && existing.changeLog.length
        ? existing.changeLog
        : [{at:changedAt, note:"סדר יום עודכן", by:changedBy, needsAck:false, ackedBy:[]}],
      orderIndex:Number(entry.orderIndex || index + 1)
    });
  });
  const nextOrders = dedupeAdminOrders_(
    currentOrders.filter(function (order) {
      return !adminOrderScopeMatches_(order, date, operator);
    }).concat(scopedOrders)
  );
  saveAdminOrders_(ss, nextOrders);
  return { success:true, adminOrders:nextOrders, scopeOrders:scopedOrders };
}

function ackAdminOrderChange_(ss, data) {
  const orderId = String(data && data.orderId || "");
  const logIndex = Number(data && data.logIndex);
  const ackedBy = String(data && data.ackedBy || "").trim();
  const orders = getAdminOrders_(ss);
  const index = orders.findIndex(function (order) {
    return String(order && order.id) === orderId;
  });
  if (index < 0) return { success:false, error:"admin order not found" };
  const original = orders[index];
  if (!Number.isInteger(logIndex) || logIndex < 0 || logIndex >= (original.changeLog || []).length) {
    return { success:false, error:"admin order log not found" };
  }
  const nextLog = (original.changeLog || []).map(function (entry, entryIndex) {
    if (entryIndex !== logIndex) return entry;
    const names = Array.isArray(entry.ackedBy) ? entry.ackedBy.slice() : [];
    if (ackedBy && names.indexOf(ackedBy) < 0) names.push(ackedBy);
    return Object.assign({}, entry, {ackedBy:names});
  });
  const updatedOrder = Object.assign({}, original, {changeLog:nextLog});
  const nextOrders = orders.map(function (order, orderIndex) {
    return orderIndex === index ? updatedOrder : order;
  });
  saveAdminOrders_(ss, nextOrders);
  return {
    success:true,
    adminOrders:nextOrders,
    adminOrder:updatedOrder,
    acknowledgedLog:nextLog[logIndex]
  };
}

function setOperatorTaskApproval_(ss, data) {
  const taskId = String(data && data.taskId || "");
  const approved = data && data.approved !== false;
  const assignedOperators = (data && data.operators || []).map(function (value) {
    return String(value || "").trim();
  }).filter(Boolean);
  if (approved && !assignedOperators.length) return { success:false, error:"missing operators" };

  const currentTasks = getTasks_(ss);
  const taskIndex = currentTasks.findIndex(function (task) {
    return String(task && task.id) === taskId;
  });
  if (taskIndex < 0) return { success:false, error:"task not found" };
  const target = currentTasks[taskIndex];
  const approvalLog = Object.assign({}, data && data.approvalLog || {});
  const nextTask = Object.assign({}, target, {
    operators:assignedOperators.length ? assignedOperators : target.operators,
    adminApproval:approved ? "approved" : "rejected",
    status:approved ? (target.status === "rejected" ? "pending" : (target.status || "pending")) : "rejected",
    changeLog:(target.changeLog || []).concat([approvalLog])
  });
  const nextTasks = currentTasks.map(function (task, index) {
    return index === taskIndex ? nextTask : task;
  });

  const currentOrders = getAdminOrders_(ss);
  let nextOrders = currentOrders.slice();
  if (approved) {
    const date = normalizeAdminOrderDate_(target.date);
    const note = String(data && data.adminNote || "");
    assignedOperators.forEach(function (operator) {
      const existingIndex = nextOrders.findIndex(function (order) {
        const sameScope = adminOrderScopeMatches_(order, date, operator);
        const orderClientId = String(order && order.clientId || "").trim();
        const taskClientId = String(target && target.clientId || "").trim();
        return sameScope && !!orderClientId && !!taskClientId && orderClientId === taskClientId;
      });
      if (existingIndex >= 0) {
        nextOrders[existingIndex] = Object.assign({}, nextOrders[existingIndex], {
          clientId:nextOrders[existingIndex].clientId || target.clientId || "",
          adminNote:note || nextOrders[existingIndex].adminNote || "",
          status:nextOrders[existingIndex].status || "pending"
        });
        return;
      }
      const nextOrderIndex = nextOrders.filter(function (order) {
        return adminOrderScopeMatches_(order, date, operator);
      }).reduce(function (max, order) {
        return Math.max(max, Number(order.orderIndex || 0));
      }, 0) + 1;
      nextOrders.push({
        id:["admin-order", date, normalizeReportValue_(operator).toLowerCase(), target.clientId || normalizeReportValue_(target.client).toLowerCase()].join("-"),
        date:date,
        operator:operator,
        client:target.client,
        clientId:target.clientId || "",
        status:"pending",
        changeLog:[approvalLog],
        orderIndex:nextOrderIndex,
        adminNote:note
      });
    });
    nextOrders = dedupeAdminOrders_(nextOrders);
  }

  if (approved) saveAdminOrders_(ss, nextOrders);
  try {
    const savedTasks = saveTasks_(ss, nextTasks);
    return { success:true, tasks:savedTasks, adminOrders:nextOrders, task:nextTask };
  } catch(error) {
    if (approved) {
      try {
        saveAdminOrders_(ss, currentOrders);
      } catch(rollbackError) {
        throw new Error("task approval failed and order rollback failed: " + error.message + "; " + rollbackError.message);
      }
    }
    throw error;
  }
}

function getSubOperatorShares_(ss) {
  const sheet = ss.getSheetByName("SubOperatorShares");
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0] || [];
  const idx = subOperatorShareHeaderMap_(headers);
  return rows.slice(1).filter(r => r[idx.date] && r[idx.operator] && r[idx.client]).map(r => {
    let date = r[idx.date];
    if (date instanceof Date) date = Utilities.formatDate(date, "Asia/Jerusalem", "yyyy-MM-dd");
    else date = String(date || "").slice(0, 10);
    return {
      date,
      operator: String(r[idx.operator] || ""),
      subUsername: String(r[idx.subUsername] || ""),
      subOperator: String(r[idx.subOperator] || ""),
      client: String(r[idx.client] || ""),
      clientId: String(r[idx.clientId] || ""),
      orderIndex: Number(r[idx.orderIndex] || 0),
      note: String(r[idx.note] || ""),
      sharedAt: String(r[idx.sharedAt] || ""),
      sharedBy: String(r[idx.sharedBy] || ""),
      id: String(r[idx.id] || ""),
      status: String(r[idx.status] || ""),
      changeLog: parseJsonArray_(r[idx.changeLog]),
      completedAt: String(r[idx.completedAt] || ""),
      completedBy: String(r[idx.completedBy] || ""),
      reportId: String(r[idx.reportId] || ""),
      revoked: String(r[idx.revoked] || "").toLowerCase() === "true"
    };
  }).filter(r => !r.revoked);
}

function parseJsonArray_(value) {
  try {
    const parsed = value ? JSON.parse(String(value)) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch(e) {
    return [];
  }
}

function saveSubOperatorShares_(ss, sharedSubOrders) {
  let sheet = ss.getSheetByName("SubOperatorShares");
  if (!sheet) sheet = ss.insertSheet("SubOperatorShares");
  const headers = subOperatorShareHeaders_();
  ensureColumns(sheet, headers);
  const existingValues = sheet.getDataRange().getValues();
  const existingHeaders = existingValues[0] || headers;
  const existingIdx = subOperatorShareHeaderMap_(existingHeaders);
  const incoming = (sharedSubOrders || []).filter(r => r && r.date && r.operator && r.client);
  const scopeKeys = {};
  incoming.forEach(r => {
    scopeKeys[subOperatorScopeKey_(r.date, r.operator, r.subUsername || r.subOperator)] = true;
  });
  const seen = {};
  const existingRows = existingValues.slice(1).filter(r => r[existingIdx.date] && r[existingIdx.operator] && r[existingIdx.client]).map(r => ({
    date: r[existingIdx.date],
    operator: r[existingIdx.operator],
    subUsername: r[existingIdx.subUsername],
    subOperator: r[existingIdx.subOperator],
    client: r[existingIdx.client],
    clientId: r[existingIdx.clientId],
    orderIndex: r[existingIdx.orderIndex],
    note: r[existingIdx.note],
    sharedAt: r[existingIdx.sharedAt],
    sharedBy: r[existingIdx.sharedBy],
    id: r[existingIdx.id],
    status: r[existingIdx.status],
    changeLog: parseJsonArray_(r[existingIdx.changeLog]),
    completedAt: r[existingIdx.completedAt],
    completedBy: r[existingIdx.completedBy],
    reportId: r[existingIdx.reportId],
    revoked: r[existingIdx.revoked]
  })).filter(r => !scopeKeys[subOperatorScopeKey_(r.date, r.operator, r.subUsername || r.subOperator)]);
  const rows = [...existingRows, ...incoming].filter(r => r && r.date && r.operator && r.client).map(r => {
    const poolKey = String(r.clientId || "").trim()
      ? poolIdentityKey_(r.clientId, r.client)
      : "legacy-share:" + String(r.id || "");
    const key = [
      String(r.date || "").slice(0, 10),
      normalizeReportValue_(r.operator),
      normalizeReportValue_(r.subUsername || r.subOperator),
      poolKey
    ].join("|");
    if (seen[key]) return null;
    seen[key] = true;
    return [
      String(r.date || "").slice(0, 10),
      r.operator || "",
      r.subUsername || "",
      r.subOperator || "",
      r.client || "",
      r.clientId || "",
      Number(r.orderIndex || 0),
      r.note || "",
      r.sharedAt || "",
      r.sharedBy || "",
      r.id || "",
      r.status || "",
      JSON.stringify(r.changeLog || []),
      r.completedAt || "",
      r.completedBy || "",
      r.reportId || "",
      r.revoked === true ? true : false
    ];
  }).filter(Boolean);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function subOperatorShareHeaders_() {
  return ["date","operator","subUsername","subOperator","client","clientId","orderIndex","note","sharedAt","sharedBy","id","status","changeLog","completedAt","completedBy","reportId","revoked"];
}

function subOperatorShareHeaderMap_(headers) {
  const names = subOperatorShareHeaders_();
  const map = {};
  names.forEach((name, fallback) => {
    const idx = headers.indexOf(name);
    map[name] = idx >= 0 ? idx : fallback;
  });
  return map;
}

function subOperatorScopeKey_(date, operator, subUsername) {
  return [
    String(date || "").slice(0, 10),
    normalizeReportValue_(operator),
    normalizeReportValue_(subUsername)
  ].join("|");
}

function markSubOperatorShareDone_(ss, report) {
  const sheet = ss.getSheetByName("SubOperatorShares");
  if (!sheet || !report) return;
  const headers = subOperatorShareHeaders_();
  ensureColumns(sheet, headers);
  const rows = sheet.getDataRange().getValues();
  const idx = subOperatorShareHeaderMap_(rows[0] || headers);
  const reportDate = String(report.reportDate || "").slice(0, 10);
  const reportOperator = normalizeReportValue_(report.operator);
  const reportClient = normalizeReportValue_(report.client);
  const reportClientId = String(report.clientId || "").trim();
  if (!reportDate || !reportOperator || !reportClient) return;
  if (!reportClientId && clientNameMatchCount_(ss, reportClient) !== 1) return;
  const completedAt = Utilities.formatDate(new Date(), "Asia/Jerusalem", "yyyy-MM-dd HH:mm:ss");
  for (let i = 1; i < rows.length; i++) {
    const sameDate = String(rows[i][idx.date] || "").slice(0, 10) === reportDate;
    const sameOperator = normalizeReportValue_(rows[i][idx.operator]) === reportOperator;
    const rowClientId = String(rows[i][idx.clientId] || "").trim();
    const sameClient = reportClientId
      ? rowClientId === reportClientId
      : !rowClientId && normalizeReportValue_(rows[i][idx.client]) === reportClient;
    if (!sameDate || !sameOperator || !sameClient) continue;
    sheet.getRange(i + 1, idx.status + 1).setValue("done");
    sheet.getRange(i + 1, idx.completedAt + 1).setValue(rows[i][idx.completedAt] || completedAt);
    sheet.getRange(i + 1, idx.completedBy + 1).setValue(report.completedBy || report.subName || report.operator || "");
    sheet.getRange(i + 1, idx.reportId + 1).setValue(report.id || "");
  }
}

function getSubOperatorApprovals_(ss) {
  const sheet = ss.getSheetByName("SubOperatorApprovals");
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  return rows.slice(1).filter(r => r[0] && r[1] && r[2]).map(r => {
    let date = r[0];
    if (date instanceof Date) date = Utilities.formatDate(date, "Asia/Jerusalem", "yyyy-MM-dd");
    else date = String(date || "").slice(0, 10);
    const approvedText = String(r[4] || "").toLowerCase();
    return {
      date,
      operator: String(r[1] || ""),
      subUsername: String(r[2] || ""),
      subOperator: String(r[3] || ""),
      approved: approvedText !== "false" && approvedText !== "0" && approvedText !== "no",
      approvedAt: String(r[5] || ""),
      approvedBy: String(r[6] || "")
    };
  });
}

function saveSubOperatorApprovals_(ss, approvals) {
  let sheet = ss.getSheetByName("SubOperatorApprovals");
  if (!sheet) sheet = ss.insertSheet("SubOperatorApprovals");
  const headers = ["date","operator","subUsername","subOperator","approved","approvedAt","approvedBy"];
  const byKey = {};
  (approvals || []).filter(r => r && r.date && r.operator && (r.subUsername || r.subOperator)).forEach(r => {
    const key = [
      String(r.date || "").slice(0, 10),
      normalizeReportValue_(r.operator),
      normalizeReportValue_(r.subUsername || r.subOperator)
    ].join("|");
    byKey[key] = r;
  });
  const rows = Object.keys(byKey).map(key => {
    const r = byKey[key];
    return [
      String(r.date || "").slice(0, 10),
      r.operator || "",
      r.subUsername || "",
      r.subOperator || "",
      r.approved === false ? false : true,
      r.approvedAt || "",
      r.approvedBy || ""
    ];
  });
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function getPendingSubReports_(ss) {
  const sheet = ss.getSheetByName("PendingSubReports");
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  return rows.slice(1).filter(r => r[0]).map(r => {
    let item = {};
    try {
      item = r[6] ? JSON.parse(String(r[6])) : {};
    } catch(e) {
      item = {};
    }
    return {
      id: String(r[0] || item.id || ""),
      status: String(r[1] || item.status || "pending"),
      createdAt: String(r[2] || item.createdAt || ""),
      operator: String(r[3] || item.operator || ""),
      subUsername: String(r[4] || item.subUsername || ""),
      subName: String(r[5] || item.subName || ""),
      ...item
    };
  });
}

function savePendingSubReports_(ss, pendingSubReports) {
  let sheet = ss.getSheetByName("PendingSubReports");
  if (!sheet) sheet = ss.insertSheet("PendingSubReports");
  const headers = ["id","status","createdAt","operator","subUsername","subName","payload"];
  const byId = {};
  (pendingSubReports || []).filter(item => item && item.id).forEach(item => {
    byId[String(item.id)] = item;
  });
  const rows = Object.keys(byId).map(id => {
    const item = byId[id];
    return [
      id,
      item.status || "pending",
      item.createdAt || "",
      item.operator || item.report?.operator || "",
      item.subUsername || "",
      item.subName || "",
      JSON.stringify(item)
    ];
  });
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function getSupplyDB_(ss) {
  const sheet = ss.getSheetByName("ציוד_לקוחות");
  if (!sheet) return {};
  const rows = sheet.getDataRange().getValues();
  const db = {};
  const clientIdsByName = {};
  allClientRecords_(ss).forEach(clientRecord => {
    const nameKey = normalizeReportValue_(clientRecord.name).toLowerCase();
    const id = String(clientRecord.clientId || "").trim();
    if (!nameKey || !id) return;
    if (!clientIdsByName[nameKey]) clientIdsByName[nameKey] = [];
    if (clientIdsByName[nameKey].indexOf(id) < 0) clientIdsByName[nameKey].push(id);
  });
  rows.slice(3).filter(r => r[0]).forEach(r => {
    const client = String(r[0] || "");
    const savedClientId = String(r[11] || "").trim();
    const matchingIds = clientIdsByName[normalizeReportValue_(client).toLowerCase()] || [];
    const clientId = savedClientId || (matchingIds.length === 1 ? matchingIds[0] : "");
    db[clientId || ("legacy:" + client)] = {
      client,
      acid: r[1] === "כן", phUp: r[2] === "כן", phUpSupply: r[2] === "כן",
      saltPkg: r[3] === "כן", saltBags: parseInt(r[4]) || 0,
      updatedAt: String(r[5]),
      supplyNote: String(r[6]||""),
      nextSupplyDate: String(r[7]||""),
      assignedOperator: String(r[8]||""),
      materialPrices: parseNextSupplyPrices_(r[9]),
      supplyId: String(r[10] || ""),
      clientId
    };
  });
  return db;
}

function getLastReadings_(ss) {
  const readings = {};
  const histories = {};
  const clientNotes = getClientInternalNotes_(ss);
  const reportRows = dedupeReportRows_(allReportRows_(ss));
  const clientIdsByName = {};
  allClientRecords_(ss).forEach(client => {
    const nameKey = normalizeReportValue_(client.name).toLowerCase();
    const id = String(client.clientId || "").trim();
    if (!nameKey || !id) return;
    if (!clientIdsByName[nameKey]) clientIdsByName[nameKey] = [];
    if (clientIdsByName[nameKey].indexOf(id) < 0) clientIdsByName[nameKey].push(id);
  });
  const reportPoolId = row => {
    const savedId = String(reportCell_(row,24) || "").trim();
    if (savedId) return savedId;
    const nameKey = normalizeReportValue_(reportCell_(row,2)).toLowerCase();
    const matchingIds = clientIdsByName[nameKey] || [];
    return matchingIds.length === 1 ? matchingIds[0] : "";
  };
  const lastReportNotes = {};
  reportRows.forEach(r => {
    const client = String(reportCell_(r,2) || "").trim();
    const clientId = reportPoolId(r);
    const poolKey = poolIdentityKey_(clientId, client);
    const date = normalizeSheetDate_(reportCell_(r,0));
    const note = String(reportCell_(r,16)||"").trim();
    if (client && date && note && (!lastReportNotes[poolKey] || date >= lastReportNotes[poolKey].date)) {
      lastReportNotes[poolKey] = { note:note, date:date };
    }
  });
  reportRows.forEach((r, reportOrder) => {
    const client = String(reportCell_(r,2) || "").trim();
    const date = normalizeSheetDate_(reportCell_(r,0));
    if (!client || !date) return;
    const clientId = reportPoolId(r);
    const poolKey = poolIdentityKey_(clientId, client);
    const waterCheckOnly = reportWaterCheckOnlyFromRow_(r);
    if (!histories[poolKey]) histories[poolKey] = [];
    histories[poolKey].push({
      client, clientId, date, reportDate:date,
      chlorine: reportCell_(r,3),
      ph: waterCheckOnly ? null : reportCell_(r,4),
      salt: waterCheckOnly ? null : reportCell_(r,5),
      chlora: waterCheckOnly ? reportCell_(r,19) : (reportCell_(r,19)||0),
      hth: waterCheckOnly ? reportCell_(r,20) : (reportCell_(r,20)||0),
      phUp: waterCheckOnly ? null : (reportCell_(r,21)||0),
      acidLiters: waterCheckOnly ? null : (reportCell_(r,22)||0),
      elModel: waterCheckOnly ? "" : String(reportCell_(r,10)||""),
      elSerial: waterCheckOnly ? "" : String(reportCell_(r,11)||""),
      elDate: waterCheckOnly ? "" : (reportCell_(r,12) instanceof Date ? Utilities.formatDate(reportCell_(r,12),"Asia/Jerusalem","yyyy-MM-dd") : String(reportCell_(r,12)||"")),
      elNext: waterCheckOnly ? "" : (reportCell_(r,13) instanceof Date ? Utilities.formatDate(reportCell_(r,13),"Asia/Jerusalem","yyyy-MM-dd") : String(reportCell_(r,13)||"")),
      poolStatus: waterCheckOnly ? "" : String(reportCell_(r,15)||""),
      customStatusText: waterCheckOnly ? "" : String(reportCell_(r,16)||""),
      notes: waterCheckOnly ? "" : String(reportCell_(r,18)||""),
      missedTreatment: !waterCheckOnly && String(reportCell_(r,18)||"").trim() === "לא בוצע טיפול",
      waterCheckOnly,
      _reportOrder: reportOrder
    });
  });
  Object.keys(histories).forEach(poolKey => {
    const ordered = histories[poolKey]
      .sort((a,b) => b.date.localeCompare(a.date) || b._reportOrder - a._reportOrder)
      .slice(0,4);
    if (!ordered.length) return;
    const latest = Object.assign({}, ordered[0]);
    delete latest._reportOrder;
    const matchingClientIds = clientIdsByName[normalizeReportValue_(latest.client).toLowerCase()] || [];
    const legacyClientNote = matchingClientIds.length === 1 ? clientNotes.byClient[latest.client] : null;
    const clientNote = (latest.clientId && clientNotes.byId[latest.clientId]) || legacyClientNote || null;
    const reportNote = lastReportNotes[poolKey] || null;
    readings[latest.clientId || latest.client] = {
      ...latest,
      customStatusText: clientNote ? clientNote.note : (reportNote ? reportNote.note : latest.customStatusText),
      internalNoteDate: clientNote ? clientNote.date : "",
      previousMeasurements: ordered.slice(1,4).map(reading => ({
        client: reading.client,
        clientId: reading.clientId,
        date: reading.date,
        reportDate: reading.reportDate,
        chlorine: reading.chlorine,
        ph: reading.ph,
        salt: reading.salt,
        chlora: reading.chlora,
        hth: reading.hth,
        phUp: reading.phUp,
        acidLiters: reading.acidLiters,
        waterCheckOnly: reading.waterCheckOnly
      }))
    };
  });
  return readings;
}
function getUnassignedClients_(ss) {
  let sheet = ss.getSheetByName("לקוחות_ללא_שיוך");
  if(!sheet) {
    return getClients_(ss);
  }
  ensureColumns(sheet, ["clientId"]);
  const rows = sheet.getDataRange().getValues();
  if (!rows.length) return [];
  const headers = rows[0].map(h => String(h || "").trim());
  const foundNameIdx = headers.findIndex(isClientNameHeader_);
  const nameIdx = foundNameIdx >= 0 ? foundNameIdx : 0;
  const phoneIdx = headers.findIndex(h => ["טלפון","נייד","phone","mobile"].indexOf(String(h || "").trim().toLowerCase()) >= 0);
  const addressIdx = headers.findIndex(h => ["כתובת","address"].indexOf(String(h || "").trim().toLowerCase()) >= 0);
  const clientIdIdx = headers.findIndex(h => ["clientid","client_id","id"].indexOf(String(h || "").trim().toLowerCase()) >= 0);
  const dataRows = rows.slice(1);
  if (clientIdIdx >= 0 && dataRows.length) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      const idRange = sheet.getRange(2, clientIdIdx + 1, dataRows.length, 1);
      const latestIds = idRange.getValues();
      const used = {};
      let changed = false;
      const nextIds = dataRows.map((row, index) => {
        let id = String(latestIds[index][0] || "").trim();
        if (row[nameIdx] && (!id || used[id])) {
          id = "client-" + Utilities.getUuid();
          changed = true;
        }
        row[clientIdIdx] = id;
        if (id) used[id] = true;
        return [id];
      });
      if (changed) idRange.setValues(nextIds);
    } finally {
      try { lock.releaseLock(); } catch(e) {}
    }
  }
  return dataRows.filter(r=>r[nameIdx]).map(r=>({
    clientId:String(clientIdIdx >= 0 ? r[clientIdIdx] || "" : ""),
    name:String(r[nameIdx] || ""),
    phone:String(phoneIdx >= 0 ? r[phoneIdx] || "" : ""),
    address:String(addressIdx >= 0 ? r[addressIdx] || "" : "")
  }));
}

function superMessageHeaders_() {
  return ["id","createdAt","from","to","toName","message","reply","replyAt","status","imageUrl","imageFileId","imageName","imageMime","imageData","replyImageUrl","replyImageFileId","replyImageName","replyImageMime","replyImageData"];
}

function ensureSuperMessageColumns_(sheet) {
  const headers = superMessageHeaders_();
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || ""));
  headers.forEach(header => {
    if (!existing.includes(header)) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
    }
  });
}

function superMessageHeaderMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(h => String(h || ""));
  return headers.reduce((acc, header, index) => {
    acc[header] = index;
    return acc;
  }, {});
}

function deleteSuperMessageImage_(fileId) {
  const id = String(fileId || "").trim();
  if (!id) return;
  try {
    DriveApp.getFileById(id).setTrashed(true);
  } catch (e) {
    Logger.log("Could not delete super message image: " + e);
  }
}

function saveSuperMessageImage_(image) {
  if (!image) return {};
  const rawData = String(image.data || image.base64 || "").trim().replace(/^data:[^,]+,/, "");
  if (!rawData) return {};
  const mimeType = String(image.mimeType || "image/jpeg").trim();
  if (!/^image\//i.test(mimeType)) throw new Error("invalid image type");
  const safeName = String(image.name || "super-message-image.jpg").replace(/[\\/:*?"<>|]/g, "_").slice(0, 90) || "super-message-image.jpg";
  const bytes = Utilities.base64Decode(rawData);
  const blob = Utilities.newBlob(bytes, mimeType, safeName);
  const file = DriveApp.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const fileId = file.getId();
  return {
    imageUrl: "https://drive.google.com/thumbnail?id=" + encodeURIComponent(fileId) + "&sz=w1200",
    imageFileUrl: "https://drive.google.com/file/d/" + encodeURIComponent(fileId) + "/view",
    imageFileId: fileId,
    imageName: safeName,
    imageMime: mimeType
  };
}

function getSuperMessagesSheet_(ss) {
  let sheet = ss.getSheetByName("הודעות");
  if (!sheet) {
    sheet = ss.insertSheet("הודעות");
    sheet.appendRow(superMessageHeaders_());
  }
  if (sheet.getLastRow() < 1) {
    sheet.appendRow(superMessageHeaders_());
  }
  ensureSuperMessageColumns_(sheet);
  return sheet;
}

function cleanupSuperMessages_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const map = superMessageHeaderMap_(sheet);
  const imageFileIdIndex = map.imageFileId;
  const replyImageFileIdIndex = map.replyImageFileId;
  const expireAt = Date.now() - 60 * 60 * 1000;
  for (let i = rows.length - 1; i >= 0; i--) {
    const createdAt = rows[i][1];
    const createdTime = createdAt instanceof Date ? createdAt.getTime() : new Date(String(createdAt || "")).getTime();
    if (createdTime && createdTime < expireAt) {
      if (imageFileIdIndex !== undefined) deleteSuperMessageImage_(rows[i][imageFileIdIndex]);
      if (replyImageFileIdIndex !== undefined) deleteSuperMessageImage_(rows[i][replyImageFileIdIndex]);
      sheet.deleteRow(i + 2);
    }
  }
}

function getSuperMessages_(ss, data) {
  const sheet = getSuperMessagesSheet_(ss);
  cleanupSuperMessages_(sheet);
  const target = String(data.to || "").trim().toLowerCase();
  const rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues() : [];
  const map = superMessageHeaderMap_(sheet);
  const value = (row, header) => {
    const index = map[header];
    return index === undefined ? "" : row[index];
  };
  const messages = rows
    .filter(r => value(r, "id") && (!target || String(value(r, "to") || "").trim().toLowerCase() === target))
    .map(r => ({
      id: String(value(r, "id") || ""),
      createdAt: value(r, "createdAt") instanceof Date ? Utilities.formatDate(value(r, "createdAt"), "Asia/Jerusalem", "yyyy-MM-dd HH:mm:ss") : String(value(r, "createdAt") || ""),
      from: String(value(r, "from") || ""),
      to: String(value(r, "to") || ""),
      toName: String(value(r, "toName") || ""),
      message: String(value(r, "message") || ""),
      reply: String(value(r, "reply") || ""),
      replyAt: value(r, "replyAt") instanceof Date ? Utilities.formatDate(value(r, "replyAt"), "Asia/Jerusalem", "yyyy-MM-dd HH:mm:ss") : String(value(r, "replyAt") || ""),
      status: String(value(r, "status") || "open"),
      imageUrl: String(value(r, "imageUrl") || ""),
      imageFileUrl: value(r, "imageFileId") ? "https://drive.google.com/file/d/" + encodeURIComponent(String(value(r, "imageFileId"))) + "/view" : "",
      imageName: String(value(r, "imageName") || ""),
      imageMime: String(value(r, "imageMime") || ""),
      imageData: String(value(r, "imageData") || ""),
      replyImageUrl: String(value(r, "replyImageUrl") || ""),
      replyImageFileUrl: value(r, "replyImageFileId") ? "https://drive.google.com/file/d/" + encodeURIComponent(String(value(r, "replyImageFileId"))) + "/view" : "",
      replyImageName: String(value(r, "replyImageName") || ""),
      replyImageMime: String(value(r, "replyImageMime") || ""),
      replyImageData: String(value(r, "replyImageData") || "")
    }))
    .reverse();
  return { success:true, messages };
}

function sendSuperMessage_(ss, data) {
  const message = String(data.message || "").trim();
  let imageMeta = {};
  try {
    imageMeta = saveSuperMessageImage_(data.image);
  } catch (e) {
    const image = data.image || {};
    const fallbackData = String(image.fallbackData || image.data || image.base64 || "").trim().replace(/^data:[^,]+,/, "");
    if (fallbackData) {
      imageMeta = {
        imageData: fallbackData,
        imageName: String(image.name || "super-message-image.jpg").replace(/[\\/:*?"<>|]/g, "_").slice(0, 90),
        imageMime: String(image.mimeType || "image/jpeg").trim()
      };
    } else {
      return { success:false, error:"image upload failed", detail:String(e) };
    }
  }
  if (!message && !imageMeta.imageUrl && !imageMeta.imageData) return { success:false, error:"empty message" };
  const sheet = getSuperMessagesSheet_(ss);
  cleanupSuperMessages_(sheet);
  const now = new Date();
  const id = Utilities.getUuid();
  const headers = superMessageHeaders_();
  const row = headers.map(header => {
    if (header === "id") return id;
    if (header === "createdAt") return now;
    if (header === "from") return String(data.from || "סופר אדמין");
    if (header === "to") return String(data.to || "or");
    if (header === "toName") return String(data.toName || "אור מוסה");
    if (header === "message") return message;
    if (header === "reply") return "";
    if (header === "replyAt") return "";
    if (header === "status") return "open";
    return imageMeta[header] || "";
  });
  sheet.appendRow(row);
  return { success:true, id, ...imageMeta };
}

function replySuperMessage_(ss, data) {
  const id = String(data.id || "").trim();
  const reply = String(data.replyText !== undefined ? data.replyText : data.reply || "").trim();
  let replyImageMeta = {};
  try {
    replyImageMeta = saveSuperMessageImage_(data.replyImage);
  } catch (e) {
    const image = data.replyImage || {};
    const fallbackData = String(image.fallbackData || image.data || image.base64 || "").trim().replace(/^data:[^,]+,/, "");
    if (fallbackData) {
      replyImageMeta = {
        imageData: fallbackData,
        imageName: String(image.name || "or-reply-image.jpg").replace(/[\\/:*?"<>|]/g, "_").slice(0, 90),
        imageMime: String(image.mimeType || "image/jpeg").trim()
      };
    } else {
      return { success:false, error:"reply image upload failed", detail:String(e) };
    }
  }
  if (!id || (!reply && !replyImageMeta.imageUrl && !replyImageMeta.imageData)) return { success:false, error:"missing data" };
  const sheet = getSuperMessagesSheet_(ss);
  cleanupSuperMessages_(sheet);
  const rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues() : [];
  const map = superMessageHeaderMap_(sheet);
  const setByHeader = (rowNumber, header, value) => {
    const index = map[header];
    if (index !== undefined) sheet.getRange(rowNumber, index + 1).setValue(value);
  };
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || "") === id) {
      const rowNumber = i + 2;
      setByHeader(rowNumber, "reply", reply || (replyImageMeta.imageUrl || replyImageMeta.imageData ? "תמונה" : ""));
      setByHeader(rowNumber, "replyAt", new Date());
      setByHeader(rowNumber, "status", "replied");
      setByHeader(rowNumber, "replyImageUrl", replyImageMeta.imageUrl || "");
      setByHeader(rowNumber, "replyImageFileId", replyImageMeta.imageFileId || "");
      setByHeader(rowNumber, "replyImageName", replyImageMeta.imageName || "");
      setByHeader(rowNumber, "replyImageMime", replyImageMeta.imageMime || "");
      setByHeader(rowNumber, "replyImageData", replyImageMeta.imageData || "");
      return { success:true, replyImageStored: !!(replyImageMeta.imageUrl || replyImageMeta.imageData), ...replyImageMeta };
    }
  }
  return { success:false, error:"message not found" };
}

function cleanupSuperMessagesHourly() {
  const ss = SpreadsheetApp.openById("17jNBWSAkW17zfz4o2gY3wOsERa3_NAgSZ3b9HPkNspk");
  const sheet = getSuperMessagesSheet_(ss);
  cleanupSuperMessages_(sheet);
}

function getClientBrandingBySheetId_(sheetId) {
  const id = String(sheetId || "").trim();
  if (!id) return {};

  try {
    const mgmt = managementSpreadsheet_();
    const sheet = mgmt.getSheetByName("לקוחות");
    if (!sheet) return {};

    const rows = sheet.getDataRange().getValues();
    const row = rows.slice(1).find(r => String(r[7] || "").trim() === id);
    if (!row) return {};

    const logoUrl = String(row[15] || "").trim();
    const icon192Url = String(row[18] || logoUrl).trim();
    const icon512Url = String(row[19] || icon192Url || logoUrl).trim();

    return {
      company: String(row[1] || "").trim(),
      logoUrl,
      appName: String(row[16] || row[1] || "").trim(),
      shortName: String(row[17] || row[16] || row[1] || "").trim(),
      icon192Url,
      icon512Url,
      appleIconUrl: String(row[20] || icon512Url || icon192Url || logoUrl).trim(),
      themeColor: String(row[21] || "#1565c0").trim(),
      backgroundColor: String(row[22] || row[21] || "#1565c0").trim()
    };
  } catch(e) {
    Logger.log("Client branding lookup failed: " + e);
    return {};
  }
}


function jsonResponse_(obj) {
  return ContentService
      .createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  }

function json(obj) {
  return jsonResponse_(obj);
}

function operatorDataVersionKey_(ss) {
  return "operatorDataVersion:" + ss.getId();
}

// ponytail: CacheService drops any single value over 100KB and reports success,
// so the old bootstrap cache was writing nothing and every login re-read 12 sheets.
// Split across numbered keys; a missing chunk just misses the cache.
var CACHE_CHUNK_ = 90000;

function cachePutBig_(key, obj, seconds) {
  try {
    var text = JSON.stringify(obj);
    var parts = {};
    var count = Math.ceil(text.length / CACHE_CHUNK_);
    for (var i = 0; i < count; i++) parts[key + ":" + i] = text.substr(i * CACHE_CHUNK_, CACHE_CHUNK_);
    parts[key + ":n"] = String(count);
    CacheService.getScriptCache().putAll(parts, seconds);
  } catch (e) {}
}

function cacheGetBig_(key) {
  try {
    var cache = CacheService.getScriptCache();
    var count = Number(cache.get(key + ":n") || 0);
    if (!count) return null;
    var keys = [];
    for (var i = 0; i < count; i++) keys.push(key + ":" + i);
    var parts = cache.getAll(keys);
    var text = "";
    for (var j = 0; j < count; j++) {
      var part = parts[key + ":" + j];
      if (part === null || part === undefined) return null; // partial expiry — treat as a miss
      text += part;
    }
    return JSON.parse(text);
  } catch (e) { return null; }
}

function cacheRemoveBig_(key) {
  try {
    var cache = CacheService.getScriptCache();
    var count = Number(cache.get(key + ":n") || 0);
    var keys = [key + ":n"];
    for (var i = 0; i < count; i++) keys.push(key + ":" + i);
    cache.removeAll(keys);
  } catch (e) {}
}

function getOperatorDataVersion_(ss) {
  return PropertiesService.getScriptProperties().getProperty(operatorDataVersionKey_(ss)) || "0";
}

function invalidateOperatorDataCaches_(ss) {
  try {
    cacheRemoveBig_("operatorRefresh:" + ss.getId());
    cacheRemoveBig_("bootstrap:" + ss.getId());
  } catch(e) {}
}

function bumpOperatorDataVersion_(ss) {
  const version = String(Date.now());
  PropertiesService.getScriptProperties().setProperty(operatorDataVersionKey_(ss), version);
  invalidateOperatorDataCaches_(ss);
  return version;
}

// ─── בונים ומחמם קאש ──────────────────────────────────────────────────────────

function buildBootstrapData_(ss) {
  return {
    users: publicUsers_(ss),
    clients: getClients_(ss),
    tasks: getTasks_(ss),
    adminOrders: getAdminOrders_(ss),
    sharedSubOrders: getSubOperatorShares_(ss),
    subOperatorApprovals: getSubOperatorApprovals_(ss),
    pendingSubReports: getPendingSubReports_(ss),
    materialApprovals: getMaterialApprovals_(ss),
    settings: getClientSettings_(ss),
    supplyDB: getSupplyDB_(ss),
    lastReadings: getLastReadings_(ss),
    unassignedClients: getUnassignedClients_(ss)
  };
}

function buildOperatorRefreshData_(ss) {
  return {
    users: publicUsers_(ss),
    tasks: getTasks_(ss),
    adminOrders: getAdminOrders_(ss),
    sharedSubOrders: getSubOperatorShares_(ss),
    subOperatorApprovals: getSubOperatorApprovals_(ss),
    pendingSubReports: getPendingSubReports_(ss),
    materialApprovals: getMaterialApprovals_(ss),
    settings: getClientSettings_(ss),
    lastReadings: getLastReadings_(ss)
  };
}

/**
 * מחמם קאש. להתקין כטריגר מבוסס־זמן.
 *
 * זה לא "שומר על השרת ער" — ל-Apps Script אין תהליך שאפשר לשמור חם, כל doPost
 * הוא ריצה חדשה. מה שכן אפשר לשלוט בו זה הקאש, וזה בדיוק החלק היקר:
 * 12 קריאות גיליון מלאות. הטריגר דואג שהקריאה הזו תיפול עליו ולא על מפעיל.
 *
 * ID של גיליונות מגיע מ-Script Property בשם WARM_SHEET_IDS (מופרד בפסיקים),
 * כדי שהוספת לקוח לא תדרוש שינוי קוד.
 */
function warmGalileoCache() {
  const raw = PropertiesService.getScriptProperties().getProperty("WARM_SHEET_IDS") || "";
  const ids = raw.split(",").map(function (v) { return v.trim(); }).filter(Boolean);
  const report = { checked: ids.length, warmed: 0, skipped: 0, failed: 0 };

  for (let i = 0; i < ids.length; i++) {
    try {
      if (warmOneSheet_(ids[i])) report.warmed++; else report.skipped++;
    } catch (e) {
      report.failed++;
      console.error("warm failed for " + ids[i] + ": " + e);
    }
  }
  console.log("warmGalileoCache: " + JSON.stringify(report));
  return report;
}

/** מחזיר true אם באמת נעשתה עבודה. false = הקאש כבר היה חם. */
function warmOneSheet_(sheetId) {
  const cache = CacheService.getScriptCache();
  const bootKey = "bootstrap:" + sheetId;
  const refreshKey = "operatorRefresh:" + sheetId;

  // ponytail: כל הרעיון הוא שהריצה תהיה חינמית כשאין מה לעשות. בדיקת נוכחות
  // היא קריאת קאש אחת; רק אם היא נכשלת משלמים על openById וקריאת הגיליונות.
  const needBoot = !cache.get(bootKey + ":n");
  const needRefresh = !cache.get(refreshKey + ":n");
  if (!needBoot && !needRefresh) return false;

  const ss = SpreadsheetApp.openById(sheetId);
  if (needBoot) cachePutBig_(bootKey, buildBootstrapData_(ss), 21600);
  if (needRefresh) cachePutBig_(refreshKey, buildOperatorRefreshData_(ss), 21600);
  return true;
}

/** להריץ פעם אחת ידנית מהעורך כדי להתקין את הטריגר. */
function installWarmTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === "warmGalileoCache"; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger("warmGalileoCache").timeBased().everyMinutes(15).create();
  return "installed: warmGalileoCache every 15 minutes";
}

function operatorDataWriteActions_() {
  return [
    "saveTasks","mutateTasks","setTaskReportCompletion","saveAdminOrders","saveAdminOrderScope",
    "ackAdminOrderChange","setOperatorTaskApproval","saveSubOperatorShares","saveSubOperatorApprovals",
    "savePendingSubReports","saveReport","updateReport","saveSupplyDB","saveClients",
    "deleteClient","saveClientInternalNote","saveClientSettings","updateMaterialApproval",
    "syncDailyMaterialApprovals","saveSubOperatorAssignment","saveOperatorDoneAlert",
    "dismissOperatorDoneAlert","saveClientPoolType","saveLicense"
  ];
}

  function doOptions(e) {
    return ContentService
      .createTextOutput("")
      .setMimeType(ContentService.MimeType.TEXT);
  }

  // ── הרץ פעם אחת ידנית מ-Apps Script כדי להוסיף עמודות וטאבים חסרים ──
  function setupSheet() {
    // 🔴 שנה את ה-ID לשיטס שאתה רוצה לעדכן!
    const sheetId = "1NthErqOJOFHJ482q3zg2daFX9SGCFeByXjdoZxvV-no"; // Template Sheet
    const ss = SpreadsheetApp.openById(sheetId);

    // ── טאב Users: הוסף עמודות חסרות ──
    const usersSheet = ss.getSheetByName("Users");
    if(usersSheet) {
      const usersHeaders = usersSheet.getRange(1,1,1,usersSheet.getLastColumn()).getValues()[0];
      const neededUsers = ["welcomeImage","welcomeInstagram","linkedOperator","assignedOperator"];
      let lastCol = usersSheet.getLastColumn();
      neededUsers.forEach(name => {
        if(!usersHeaders.includes(name)) {
          lastCol++;
          usersSheet.getRange(1, lastCol).setValue(name);
          Logger.log("✅ Users - הוספה: " + name);
        } else {
          Logger.log("⏭️ Users - קיים: " + name);
        }
      });
    } else {
      const s = ss.insertSheet("Users");
      s.appendRow(["username","password","role","name","icon","welcomeMessage","phone","welcomeImage","welcomeInstagram","linkedOperator","assignedOperator"]);
      Logger.log("✅ נוצר טאב: Users");
    }

    // ── טאב לקוחות: הוסף עמודות חסרות ──
    const clientSheet = ss.getSheetByName("לקוחות");
    if(clientSheet) {
      const headerRowIndex = findHeaderRowIndex_(clientSheet, ["שם_לקוח", "שם לקוח", "שם", "לקוח", "שם הלקוח"]);
      const headerRow = headerRowIndex + 1;
      const headers = clientSheet.getRange(headerRow,1,1,clientSheet.getLastColumn()).getValues()[0];
      const needed = [
        {name:"קוד_שער", col:5},
        {name:"סוג_בריכה", col:6},
        {name:"ימים_קבועים", col:7},
        {name:"מפעיל_קבוע", col:8},
        {name:"ימי_בדיקת_מים", col:13},
      {name:"יתרת_טיפולים_חודשית", col:9},
      {name:"מונה_טיפולים_בפועל", col:10},
      {name:"מכסת_טיפולים_חודשית", col:11},
      {name:"חודש_טיפולים", col:12},
    ];
      needed.forEach(({name, col}) => {
        if(!headers.includes(name)) {
          clientSheet.getRange(headerRow, col).setValue(name);
          Logger.log("✅ הוספה: " + name);
        } else {
          Logger.log("⏭️ קיים: " + name);
        }
      });
    }

    // ── טאב דוחות: הוסף עמודות חסרות ──
    const reportSheet = ss.getSheetByName("דוחות");
    if(reportSheet) {
      ensureReportsSheetReportId_(reportSheet);
    }

    // ── טאב תקלות_מפעילים: צור אם לא קיים ──
    if(!ss.getSheetByName("תקלות_מפעילים")) {
      const s = ss.insertSheet("תקלות_מפעילים");
      s.appendRow(["id","מפעיל","לקוח","תיאור","דחיפות","סטטוס","תגובת_אדמין","תאריך"]);
      Logger.log("✅ נוצר טאב: תקלות_מפעילים");
    }

    // ── טאב לקוחות_ללא_שיוך: צור אם לא קיים ──
    if(!ss.getSheetByName("לקוחות_ללא_שיוך")) {
      const s = ss.insertSheet("לקוחות_ללא_שיוך");
      s.appendRow(["שם_לקוח","טלפון","כתובת","קוד_שער","סוג_בריכה"]);
      Logger.log("✅ נוצר טאב: לקוחות_ללא_שיוך");
    }

    // ── גיליון ניהול: טאב רישיונות ──
    const mgmtId = "17jNBWSAkW17zfz4o2gY3wOsERa3_NAgSZ3b9HPkNspk";
    const mgmt = SpreadsheetApp.openById(mgmtId);
    if(!mgmt.getSheetByName("רישיונות")) {
      const ls = mgmt.insertSheet("רישיונות");
      ls.appendRow(["key","company","sheetId","plan","status","expiry","adminEmail"]);
      Logger.log("✅ נוצר טאב: רישיונות בגיליון ניהול");
    }

    Logger.log("🎉 setupSheet הסתיים");
  }
  function testNotification() {
    Logger.log(JSON.stringify({success:false, disabled:true}));
  }

  function testClientAdminNotification() {
    const ss = SpreadsheetApp.openById("1NthErqOJOFHJ482q3zg2daFX9SGCFeByXjdoZxvV-no");
    const res = sendAppNotificationToAdmins_(ss, {
      title: "Client admin notification test",
      message: "Test notification for internal admin only"
    });
    Logger.log("Client admin push test status: " + !!res.success);
  }

  function auditClientSheetStructureFull(sheetId) {
    const ss = SpreadsheetApp.openById(sheetId || "1NthErqOJOFHJ482q3zg2daFX9SGCFeByXjdoZxvV-no");
    const expected = {
      "Users": ["username","password","role","name","icon","welcomeMessage","phone","welcomeImage","welcomeInstagram","linkedOperator","assignedOperator"],
      "לקוחות": ["שם_לקוח","טלפון","כתובת","qr_url","קוד_שער","סוג_בריכה","ימים_קבועים","מפעיל_קבוע","ימי_בדיקת_מים","יתרת_טיפולים_חודשית","מונה_טיפולים_בפועל","מכסת_טיפולים_חודשית","חודש_טיפולים"],
      "דוחות": reportHeaders_(),
      "משימות": ["id","תאריך","לקוח","מפעילים","סטטוס","changeLog"],
      "חלוקת_עבודה": ["id","תאריך","מפעיל","לקוח","סדר","הערת_מנהל","סטטוס","changeLog"],
      "ציוד_לקוחות": ["לקוח","חומצת_מלח","מעלה_pH","שקי_מלח","כמות_שקים","עודכן","הערת_חומרים","nextSupplyDate","assignedOperator","מחיר_פר_חומר_לטיפול_הבא","supplyId","clientId"],
      "שעות_עבודה": ["id","מפעיל","תאריך","התחלה","סיום","סה\"כ"],
      "שעון_פעיל": ["username","operator","date","start","noonNotified"],
      "תקלות_מפעילים": ["id","מפעיל","לקוח","תיאור","דחיפות","סטטוס","תגובת_אדמין","תאריך"],
      "לקוחות_ללא_שיוך": ["שם_לקוח","טלפון","כתובת","קוד_שער","סוג_בריכה"],
      "SubOperatorShares": ["date","operator","subUsername","subOperator","client","orderIndex","note","sharedAt","sharedBy","id","status","changeLog","completedAt","completedBy","reportId","revoked"],
      "SubOperatorApprovals": ["date","operator","subUsername","subOperator","approved","approvedAt","approvedBy"],
      "PendingSubReports": ["id","status","createdAt","operator","subUsername","subName","payload"],
      "ClientSettings": ["key","value"],
      "UsageEvents": ["timestamp","sessionId","userId","role","screen","event","target","metadata","userAgent","appVersion"],
      "MaterialApprovals": ["timestamp","client","phone","reportId","pollMessageId","status","answer","answeredAt","sender","raw"],
      "תזכורות_כלור": ["id","reportId","לקוח","clientId","טלפון","מפעיל","תאריך_דוח","createdAt","dueAt","daysDelay","message","status","sentAt","greenApiMessageId","error","updatedAt"]
    };
    const expectedNames = Object.keys(expected);
    const report = {
      spreadsheet: ss.getName(),
      checkedAt: Utilities.formatDate(new Date(), "Asia/Jerusalem", "yyyy-MM-dd HH:mm:ss"),
      ok: true,
      sheets: {},
      extraTabs: ss.getSheets().map(s => s.getName()).filter(name => !expected[name])
    };

    expectedNames.forEach(name => {
      const sheet = ss.getSheetByName(name);
      const needed = expected[name];
      if (!sheet) {
        report.ok = false;
        report.sheets[name] = { exists:false, missing:needed, extra:[], orderMismatch:false, columns:[] };
        return;
      }
      let headerRowIndex = 0;
      try {
        const found = findHeaderRowIndex_(sheet, needed);
        headerRowIndex = found >= 0 ? found : 0;
      } catch(e) {
        headerRowIndex = 0;
      }
      const lastCol = Math.max(sheet.getLastColumn(), 1);
      const columns = sheet.getRange(headerRowIndex + 1, 1, 1, lastCol).getValues()[0].map(h => String(h || "").trim()).filter(Boolean);
      const missing = needed.filter(h => !columns.includes(h));
      const extra = columns.filter(h => !needed.includes(h));
      const orderMismatch = missing.length === 0 && needed.some((h, i) => columns[i] !== h);
      const exact = missing.length === 0 && extra.length === 0 && !orderMismatch;
      if (!exact) report.ok = false;
      report.sheets[name] = {
        exists:true,
        headerRow: headerRowIndex + 1,
        expectedCount: needed.length,
        actualCount: columns.length,
        missing,
        extra,
        orderMismatch,
        exact,
        columns
      };
    });

    if (report.extraTabs.length) report.ok = false;
    Logger.log(JSON.stringify(report, null, 2));
    return report;
  }

  function ensureNextSupplyPricesColumn(sheetId) {
    const ss = SpreadsheetApp.openById(sheetId || "1NthErqOJOFHJ482q3zg2daFX9SGCFeByXjdoZxvV-no");
    let sheet = ss.getSheetByName("ציוד_לקוחות");
    if (!sheet) {
      sheet = ss.insertSheet("ציוד_לקוחות");
      sheet.appendRow(["לקוח","חומצת_מלח","מעלה_pH","שקי_מלח","כמות_שקים","עודכן","הערת_חומרים","nextSupplyDate","assignedOperator","מחיר_פר_חומר_לטיפול_הבא","supplyId","clientId"]);
    }
    ensureNextSupplyPriceColumn_(sheet);
    const res = {
      success: true,
      sheet: sheet.getName(),
      column: "מחיר_פר_חומר_לטיפול_הבא",
      defaultPrices: parseNextSupplyPrices_({})
    };
    Logger.log(JSON.stringify(res));
    return res;
  }

  const DESIGN_SHEET_ID = "17jNBWSAkW17zfz4o2gY3wOsERa3_NAgSZ3b9HPkNspk";

  function designMySystemSheets() {
    const ss = SpreadsheetApp.openById(DESIGN_SHEET_ID);

    const sheetNames = [
      "לקוחות",
      "רישיונות",
      "תקלות",
      "מנויים"
    ];

    sheetNames.forEach((name) => {
      const sheet = ss.getSheetByName(name);
      if (sheet) {
        designOneSheet(sheet);
      }
    });

    SpreadsheetApp.flush();
  }

  function designOneSheet(sheet) {
    const lastRow = Math.max(sheet.getLastRow(), 2);
    const lastCol = Math.max(sheet.getLastColumn(), 1);

    const fullRange = sheet.getRange(1, 1, lastRow, lastCol);
    const headerRange = sheet.getRange(1, 1, 1, lastCol);
    const headers = headerRange.getValues()[0].map(h => String(h).trim());

    sheet.setRightToLeft(true);
    sheet.setFrozenRows(1);

    // בסיס נקי לכל הטבלה
    fullRange
      .setFontFamily("Arial")
      .setFontSize(10)
      .setFontColor("#111827")
      .setBackground("#FFFFFF")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle")
      .setWrap(true);

    // שורת כותרת מקצועית
    headerRange
      .setBackground("#1565C0")
      .setFontColor("#FFFFFF")
      .setFontWeight("bold")
      .setFontSize(11)
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");

    sheet.setRowHeight(1, 42);

    if (lastRow > 1) {
      sheet.setRowHeights(2, lastRow - 1, 34);
    }

    // גבולות עדינים
    fullRange.setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      "#DADCE0",
      SpreadsheetApp.BorderStyle.SOLID
    );

    // שורות מתחלפות רק באזור נתונים
    for (let row = 2; row <= lastRow; row++) {
      const color = row % 2 === 0 ? "#FFFFFF" : "#F8FAFC";
      sheet.getRange(row, 1, 1, lastCol).setBackground(color);
    }

    // פילטר
    const existingFilter = sheet.getFilter();
    if (existingFilter) existingFilter.remove();

    sheet.getRange(1, 1, lastRow, lastCol).createFilter();

    // התאמת רוחב עמודות לפי שם עמודה
    headers.forEach((header, i) => {
      const col = i + 1;
      setSmartColumnWidth(sheet, col, header);
      styleColumnByHeader(sheet, col, header, lastRow);
    });

    // צביעה חכמה לפי ערכים
    applySystemConditionalColors(sheet, headers, lastRow);

    // הגנה ויזואלית לעמודות טכניות
    markTechnicalColumns(sheet, headers, lastRow);

    // זום אי אפשר לשנות מסקריפט, אבל העיצוב יתאים גם ב־75%-100%
  }

  function setSmartColumnWidth(sheet, col, header) {
    const h = header.toLowerCase();

    if (
      h.includes("sheet") ||
      h.includes("sheetid") ||
      h.includes("sheet id") ||
      h.includes("sheetId".toLowerCase())
    ) {
      sheet.setColumnWidth(col, 280);
      return;
    }

    if (
      h.includes("key") ||
      h.includes("admin") ||
      h.includes("email") ||
      h.includes("מייל")
    ) {
      sheet.setColumnWidth(col, 210);
      return;
    }

    if (
      h.includes("שם") ||
      h.includes("חברה") ||
      h.includes("לקוח") ||
      h.includes("איש קשר")
    ) {
      sheet.setColumnWidth(col, 150);
      return;
    }

    if (
      h.includes("הערות") ||
      h.includes("תיאור")
    ) {
      sheet.setColumnWidth(col, 260);
      return;
    }

    if (
      h.includes("תאריך") ||
      h.includes("כניסה") ||
      h.includes("הצטרפות") ||
      h.includes("חידוש") ||
      h.includes("expiry")
    ) {
      sheet.setColumnWidth(col, 130);
      return;
    }

    if (
      h.includes("סטטוס") ||
      h.includes("status") ||
      h.includes("plan") ||
      h.includes("סוג מנוי") ||
      h.includes("גרסה")
    ) {
      sheet.setColumnWidth(col, 110);
      return;
    }

    sheet.setColumnWidth(col, 120);
  }

  function styleColumnByHeader(sheet, col, header, lastRow) {
    if (lastRow < 2) return;

    const h = header.toLowerCase();
    const dataRange = sheet.getRange(2, col, lastRow - 1, 1);

    // טקסטים בעברית לימין
    if (
      h.includes("שם") ||
      h.includes("חברה") ||
      h.includes("לקוח") ||
      h.includes("איש קשר") ||
      h.includes("הערות")
    ) {
      dataRange.setHorizontalAlignment("right");
    }

    // מיילים באנגלית לשמאל
    if (
      h.includes("email") ||
      h.includes("מייל") ||
      h.includes("admin")
    ) {
      dataRange.setHorizontalAlignment("left");
    }

    // מזהים ארוכים
    if (
      h.includes("sheet") ||
      h.includes("key")
    ) {
      dataRange
        .setHorizontalAlignment("left")
        .setFontFamily("Consolas")
        .setFontSize(9);
    }

    // תאריכים
    if (
      h.includes("תאריך") ||
      h.includes("expiry") ||
      h.includes("כניסה") ||
      h.includes("הצטרפות") ||
      h.includes("חידוש")
    ) {
      dataRange.setNumberFormat("dd/MM/yyyy");
    }

    // מספרים
    if (
      h.includes("טלפון") ||
      h.includes("מספר") ||
      h.includes("דוחות") ||
      h.includes("מפעילים")
    ) {
      dataRange.setHorizontalAlignment("center");
    }
  }

  function applySystemConditionalColors(sheet, headers, lastRow) {
    if (lastRow < 2) return;

    let rules = [];

    headers.forEach((header, i) => {
      const col = i + 1;
      const h = header.toLowerCase();
      const range = sheet.getRange(2, col, lastRow - 1, 1);

      // סטטוס / status
      if (h.includes("סטטוס") || h.includes("status")) {
        rules.push(
          SpreadsheetApp.newConditionalFormatRule()
            .whenTextContains("פעיל")
            .setBackground("#E8F5E9")
            .setFontColor("#1B5E20")
            .setRanges([range])
            .build()
        );

        rules.push(
          SpreadsheetApp.newConditionalFormatRule()
            .whenTextContains("לא פעיל")
            .setBackground("#FFEBEE")
            .setFontColor("#B71C1C")
            .setRanges([range])
            .build()
        );

        rules.push(
          SpreadsheetApp.newConditionalFormatRule()
            .whenTextContains("חסום")
            .setBackground("#FCE4EC")
            .setFontColor("#880E4F")
            .setRanges([range])
            .build()
        );
      }

    // Subscription plan
    if (h.includes("plan") || h.includes("סוג מנוי")) {
      const proRule = SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains("PRO")
        .setBackground("#F3E8FF")
        .setFontColor("#6B21A8")
        .setRanges([range])
        .build();
      const freeRule = SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains("FREE")
        .setBackground("#E0F2FE")
        .setFontColor("#075985")
        .setRanges([range])
        .build();
      rules.push(proRule);
      rules.push(freeRule);
    }

      // תקלות
      if (h.includes("דחיפות") || h.includes("תקלה") || h.includes("סטטוס")) {
        rules.push(
          SpreadsheetApp.newConditionalFormatRule()
            .whenTextContains("דחוף")
            .setBackground("#FEE2E2")
            .setFontColor("#991B1B")
            .setRanges([range])
            .build()
        );

        rules.push(
          SpreadsheetApp.newConditionalFormatRule()
            .whenTextContains("פתוח")
            .setBackground("#FEF3C7")
            .setFontColor("#92400E")
            .setRanges([range])
            .build()
        );

        rules.push(
          SpreadsheetApp.newConditionalFormatRule()
            .whenTextContains("בוצע")
            .setBackground("#DCFCE7")
            .setFontColor("#166534")
            .setRanges([range])
            .build()
        );
      }
    });

    sheet.setConditionalFormatRules(rules);
  }

  function markTechnicalColumns(sheet, headers, lastRow) {
    headers.forEach((header, i) => {
      const col = i + 1;
      const h = header.toLowerCase();

      const isTechnical =
        h.includes("key") ||
        h.includes("sheetid") ||
        h.includes("sheet id") ||
        h.includes("adminemail") ||
        h.includes("admin") ||
        h.includes("id");

      if (!isTechnical) return;

      const range = sheet.getRange(1, col, lastRow, 1);

      range
        .setBackground("#EEF2FF")
        .setFontColor("#1E293B");

      sheet.getRange(1, col)
        .setBackground("#1E40AF")
        .setFontColor("#FFFFFF");
    });
  }
