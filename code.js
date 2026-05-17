  // ─── מרכזי — תומך בכל לקוח לפי sheetId ───────────────────────────────────
  // הלקוח משתף את הגיליון שלו עם האימייל שלך ומכניס את ה-ID באפליקציה

  function doPost(e) {
    try {
      const data = JSON.parse(e.postData.contents);
      const action = data.action;

      // sheetId מגיע מהאפליקציה — כל לקוח שולח את שלו
      const SHEET_ID = data.sheetId || "1am5BQh6oesQXoJgdeTpiDTIEuzf8UdfWotPXSoqOLiU";
      const ss = SpreadsheetApp.openById(SHEET_ID);

      if (action === "sendOneSignalToAdmins" || action === "sendNotificationToAdmins") {
        return json(sendOneSignalToAdmins_(ss, data));
      }

      if (
        action === "sendOneSignalToUser" ||
        action === "sendOneSignal" ||
        action === "sendOneSignalNotification" ||
        action === "sendPushNotification" ||
        action === "sendPushToUser" ||
        action === "sendNotification" ||
        action === "sendNotificationToUser" ||
        action === "sendUserNotification" ||
        action === "sendPush" ||
        action === "pushToUser" ||
        action === "notifyUser"
      ) {
        return json(sendOneSignalToUser_(data));
      }

      if (action === "sendGreenApiWhatsApp") {
        return json(sendGreenApiWhatsApp_(data));
      }

      if (action === "getGreenApiStatus") {
        return json(getGreenApiStatus_());
      }

      if (action === "validateLicense") {
        const sheet = ss.getSheetByName("רישיונות");
        if(!sheet) return json({ valid:false, reason:"טבלת רישיונות לא נמצאה" });
        const rows = sheet.getDataRange().getValues();
        const row = rows.slice(1).find(r => String(r[0]).trim().toUpperCase() === String(data.key||"").trim().toUpperCase());
        if(!row) return json({ valid:false, reason:"מפתח לא תקין" });
        const status = String(row[4]||"פעיל");
        if(status==="מושהה") return json({ valid:false, reason:"⛔ המנוי מושהה — צור קשר עם מנהל המערכת" });
        const expiry = row[5] ? (row[5] instanceof Date ? Utilities.formatDate(row[5],"Asia/Jerusalem","dd/MM/yyyy") : String(row[5])) : "";
        const branding = getClientBrandingBySheetId_(String(row[2] || ""));
        return json({ valid:true, company:String(branding.company || row[1] || ""), sheetId:String(row[2]), plan:String(row[3]||"PRO"), status, expiry, adminEmail:String(row[6]||""), ...branding });
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
        sheet.getRange(data.rowIndex + 1, 5).setValue(data.status);
        return json({ success:true });
      }

      if (action === "getMgmtClients") {
        const sheet = ss.getSheetByName("לקוחות");
        if(!sheet) return json({ clients: [] });
        const rows = sheet.getDataRange().getValues();
        return json({ clients: rows.slice(1).filter(r=>r[0]) });
      }

      if (action === "getMgmtIssues") {
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
        sheet.getRange(data.rowIndex + 1, 7).setValue(data.status);
        return json({ success: true });
      }

      if (action === "updateMgmtIssueStatus") {
        const sheet = ss.getSheetByName("תקלות");
        if(!sheet) return json({ error: "no sheet" });
        sheet.getRange(data.rowIndex, 6).setValue(data.status);
        if(data.note) sheet.getRange(data.rowIndex, 7).setValue(data.note);
        return json({ success: true });
      }

      if (action === "getUnassignedClients") {
        let sheet = ss.getSheetByName("לקוחות_ללא_שיוך");
        if(!sheet) {
          // fallback — return all clients without day assignment
          sheet = ss.getSheetByName("לקוחות");
          if(!sheet) return json({ clients:[] });
          const rows = sheet.getDataRange().getValues();
          let hi = rows.findIndex(r => isClientNameHeader_(r[0]));
          if(hi===-1) hi=0;
          const clients = rows.slice(hi+1).filter(r=>r[0]).map(r=>({
            name:String(r[0]), phone:String(r[1]), address:String(r[2])
          }));
          return json({ clients });
        }
        const rows = sheet.getDataRange().getValues();
        const clients = rows.slice(1).filter(r=>r[0]).map(r=>({
          name:String(r[0]), phone:String(r[1]||""), address:String(r[2]||"")
        }));
        return json({ clients });
      }

    if (action === "getFreeClients") {
      // לקוחות ללא שיוך יום ומפעיל — מגיעים מטאב "לקוחות_חופשיים"
      const sheet = ss.getSheetByName("לקוחות_חופשיים");
      if(!sheet) return json({ clients:[] });
        const rows = sheet.getDataRange().getValues();
        let hi = rows.findIndex(r => String(r[0]).includes("שם"));
        if(hi===-1) hi=0;
        const clients = rows.slice(hi+1).filter(r=>r[0]).map(r=>({
          name: String(r[0]), phone: String(r[1]||""), address: String(r[2]||""),
          poolType: String(r[3]||"מלח"), gateCode: String(r[4]||"")
        }));
      return json({ clients });
    }

    if (action === "getBootstrapData") {
      return json({
        users: getUsers_(ss),
        clients: getClients_(ss),
        tasks: getTasks_(ss),
        adminOrders: getAdminOrders_(ss),
        sharedSubOrders: getSubOperatorShares_(ss),
        subOperatorApprovals: getSubOperatorApprovals_(ss),
        pendingSubReports: getPendingSubReports_(ss),
        supplyDB: getSupplyDB_(ss),
        lastReadings: getLastReadings_(ss),
        unassignedClients: getUnassignedClients_(ss)
      });
    }

    if (action === "saveClientPoolType") {
      const sheet = ss.getSheetByName("לקוחות");
      if(!sheet) return json({ error:"no sheet" });
        const rows = sheet.getDataRange().getValues();
        for(let i=1;i<rows.length;i++){
          if(String(rows[i][0])===String(data.clientName)){
            sheet.getRange(i+1,6).setValue(data.poolType);
            return json({ success:true });
          }
        }
        return json({ error:"client not found" });
      }

      if (action === "saveOperatorIssue") {
        const sheet = ss.getSheetByName("תקלות_מפעילים") || ss.insertSheet("תקלות_מפעילים");
        if(sheet.getLastRow()===0) sheet.appendRow(["id","מפעיל","לקוח","תיאור","דחיפות","סטטוס","תגובת_אדמין","תאריך"]);
        const duplicateRow = findDuplicateOperatorIssueRow_(sheet, data);
        if (duplicateRow) return json({ success:true, duplicate:true, row:duplicateRow });
        sheet.appendRow([Date.now(), data.operator, data.client, data.desc, data.priority, "פתוח", "", data.date||new Date().toISOString().slice(0,10)]);
        if (String(data.priority || "") === "קריטי" || String(data.priority || "") === "׳§׳¨׳™׳˜׳™") {
          sendOneSignalToAdmins_(ss, {
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
        return json({ users: getUsers_(ss) });
      }

      if (action === "saveSubOperatorAssignment") {
        return json(saveSubOperatorAssignment_(ss, data));
      }

      if (action === "getClients") {
        const sheet = ss.getSheetByName("לקוחות");
        const rows = sheet.getDataRange().getValues();
        let hi = rows.findIndex(r => isClientNameHeader_(r[0]));
        if (hi === -1) hi = 2;
        const headers = (rows[hi] || []).map(h => String(h || "").trim());
        const quotaIdx = headers.indexOf("מכסת_טיפולים_חודשית");
        const clients = rows.slice(hi + 1).filter(r => r[0]).map(r => ({
          name: String(r[0]), phone: String(r[1]), address: String(r[2]), qrUrl: String(r[3]||""), gateCode: String(r[4]||""), poolType: String(r[5]||"מלח"), regularDays: String(r[6]||""), regularOperator: String(r[7]||""), monthlyTreatmentBalance: Number(r[8] || 0), monthlyTreatmentCount: Number(r[9] || 0), monthlyTreatmentQuota: Number(quotaIdx >= 0 ? r[quotaIdx] || 0 : 0)
        }));
        return json({ clients });
      }

      if (action === "getTreatmentCounts") {
        return json({ treatments: refreshMonthlyTreatmentCounters_(ss) });
      }

      if (action === "getTasks") {
        return json({ tasks: getTasks_(ss) });
      }

      if (action === "saveTasks") {
        const sheet = ss.getSheetByName("משימות");
        const rows = sheet.getDataRange().getValues();
        let hi = rows.findIndex(r => String(r[0]).toUpperCase() === "ID");
        if (hi === -1) hi = 2;
        const dataStart = hi + 2;
        const last = sheet.getLastRow();
        if (last >= dataStart) sheet.deleteRows(dataStart, last - dataStart + 1);
        dedupeTasks_(data.tasks || []).filter(t => !isAdminOrderTask_(t)).forEach(t => {
          sheet.appendRow([t.id, t.date, t.client, t.operators.join(","), t.status, JSON.stringify(t.changeLog), t.orderIndex || 0, t.adminNote || "", t.createdByAdminOrder === true]);
        });
        return json({ success: true });
      }

      if (action === "getAdminOrders") {
        return json({ adminOrders: getAdminOrders_(ss) });
      }

      if (action === "saveAdminOrders") {
        saveAdminOrders_(ss, data.adminOrders || []);
        return json({ success: true });
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
        const sheet = ss.getSheetByName("דוחות");
        ensureColumns(sheet, ["ציוד_שסופק"]);
        const r = data.report;
        const duplicateRow = findDuplicateReportRow_(sheet, r);
        if (duplicateRow) {
          Logger.log("Duplicate report skipped: row " + duplicateRow);
          return json({ success: true, duplicate: true, row: duplicateRow });
        }

        sheet.appendRow([r.reportDate, r.operator, r.client, r.chlorine, r.ph, r.salt,
          r.waterLevel, r.clarity, r.fat, r.flow, r.elModel, r.elSerial,
          r.elDate, r.elNext, r.supplyLabel, r.poolStatus, r.customStatusText,
          r.restrictedUntil, r.notes, r.chlora||0, r.hth||0, r.phUp||0, r.acidLiters||0, r.suppliedEquipment||""]);
        refreshMonthlyTreatmentCounters_(ss);

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
        
        // TODO: OneSignal notification to admin (requires REST API key)
        // Uncomment when REST API key is configured in Apps Script
        // const notifyAdmin = () => {
        //   const payload = {
        //     "include_email_tokens": [data.adminEmail],
        //     "headings": {"en": "New Report: " + r.client},
        //     "contents": {"en": "Chlorine: " + r.chlorine},
        //   };
        //   UrlFetchApp.fetch("https://onesignal.com/api/v1/notifications", {...});
        // };

        return json({ success: true });
      }

      if (action === "updateReport") {
        const sheet = ss.getSheetByName("דוחות");
        ensureColumns(sheet, ["ציוד_שסופק"]);
        const r = data.report;
        const row = findLatestReportRow_(sheet, data.original || {}, r);
        if (!row) return json({ success:false, error:"report row not found" });
        sheet.getRange(row, 1, 1, 24).setValues([reportRowValues_(r)]);
        refreshMonthlyTreatmentCounters_(ss);
        return json({ success:true, row });
      }

      if (action === "saveSupplyDB") {
        const sheet = ss.getSheetByName("ציוד_לקוחות");
        ensureColumns(sheet, ["לקוח","חומצת_מלח","מעלה_pH","שקי_מלח","כמות_שקים","עודכן","הערת_חומרים"]);
        const last = sheet.getLastRow();
        if (last > 3) sheet.deleteRows(4, last - 3);
        dedupeRowsByFirstCell_(data.rows || []).forEach(r => sheet.appendRow(r));
        return json({ success: true });
      }

      if (action === "getSupplyDB") {
        const sheet = ss.getSheetByName("ציוד_לקוחות");
        const rows = sheet.getDataRange().getValues();
        const db = {};
        rows.slice(3).filter(r => r[0]).forEach(r => {
          db[String(r[0])] = {
            acid: r[1] === "כן", phUp: r[2] === "כן",
            saltPkg: r[3] === "כן", saltBags: parseInt(r[4]) || 1,
            updatedAt: String(r[5]),
            supplyNote: String(r[6]||"")
          };
        });
        return json({ supplyDB: db });
      }

      if (action === "getMgmtClients") {
        const sheet = ss.getSheetByName("לקוחות");
        if (!sheet) return json({ rows: [] });
        const rows = sheet.getDataRange().getValues();
        return json({ rows: rows.slice(1).filter(r=>r[0]) });
      }

      if (action === "getMgmtIssues") {
        const sheet = ss.getSheetByName("תקלות");
        if (!sheet) return json({ rows: [] });
        const rows = sheet.getDataRange().getValues();
        return json({ rows: rows.slice(1).filter(r=>r[0]) });
      }

      if (action === "appendMgmtRow") {
        const sheet = ss.getSheetByName(data.sheet);
        if (!sheet) return json({ error: "sheet not found" });
        sheet.appendRow(data.row);
        return json({ success: true });
      }

      if (action === "getReports") {
        const sheet = ss.getSheetByName("דוחות");
        const rows = sheet.getDataRange().getValues();
        let hi = rows.findIndex(r => String(r[0]).includes("תאריך"));
        if (hi === -1) hi = 2;
        const reports = rows.slice(hi + 1).filter(r => r[0]).map((r,i) => ({
          id: `sheet-${i}`, // unique ID with sheet prefix
          _fromSheet: true,
          reportDate: r[0] instanceof Date ? Utilities.formatDate(r[0],"Asia/Jerusalem","yyyy-MM-dd") : String(r[0]).slice(0,10),
          operator: String(r[1]),
          client: String(r[2]),
          chlorine: r[3],
          ph: r[4],
          salt: r[5],
          waterLevel: String(r[6]),
          clarity: String(r[7]),
          fat: String(r[8]),
          flow: String(r[9]),
          poolStatus: String(r[15])||"מאוזנת",
          customStatusText: String(r[16]||""),
          notes: String(r[18]||""),
          supplyLabel: String(r[14]||""),
          chlora: r[19]||0,
          hth: r[20]||0,
          phUp: r[21]||0,
          acidLiters: r[22]||0,
          suppliedEquipment: String(r[23]||""),
        }));
        return json({ reports });
      }

      if (action === "saveClients") {
        const sheet = ss.getSheetByName("לקוחות");
        return json(saveClients_(sheet, data.clients || []));
    }

      if (action === "getLastReadings") {
        const sheet = ss.getSheetByName("דוחות");
        const rows = sheet.getDataRange().getValues();
        let hi = rows.findIndex(r => String(r[0]).includes("תאריך"));
        if (hi === -1) hi = 2;
        const dataRows = rows.slice(hi + 1).filter(r => r[0]);
        // columns: 0=date, 1=operator, 2=client, 3=chlorine, 4=ph, 5=salt,
        // 6=waterLevel, 7=clarity, 8=fat, 9=flow, 10=elModel, 11=elSerial, 12=elDate, 13=elNext
        // 14=supplyLabel, 15=poolStatus, 16=customStatus, 17=restrictedUntil, 18=notes, 19=chlora, 20=hth
        const readings = {};
        const lastInternalNotes = {};
        dataRows.forEach(r => {
          const client = String(r[2]);
          const date   = String(r[0]);
          const internalNote = String(r[16]||"").trim();
          if (internalNote) lastInternalNotes[client] = internalNote;
          if (!readings[client] || date > readings[client].date) {
            readings[client] = {
              date, chlorine: r[3], ph: r[4],
              chlora: r[19]||0, hth: r[20]||0, phUp: r[21]||0, acidLiters: r[22]||0,
              elModel: String(r[10]||""), elSerial: String(r[11]||""),
              elDate: r[12] instanceof Date ? Utilities.formatDate(r[12],"Asia/Jerusalem","yyyy-MM-dd") : String(r[12]||""),
              elNext: r[13] instanceof Date ? Utilities.formatDate(r[13],"Asia/Jerusalem","yyyy-MM-dd") : String(r[13]||""),
              poolStatus: String(r[15]||""),
              customStatusText: internalNote || lastInternalNotes[client] || String(readings[client]?.customStatusText || ""),
              notes: String(r[18]||""),
              missedTreatment: String(r[18]||"").trim() === "לא בוצע טיפול"
            };
          }
        });
        return json({ lastReadings: readings });
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
    s.appendRow(["שם_לקוח","טלפון","כתובת","qr_url","קוד_שער","סוג_בריכה","ימים_קבועים","מפעיל_קבוע","יתרת_טיפולים_חודשית","מונה_טיפולים_בפועל","מכסת_טיפולים_חודשית","חודש_טיפולים"]);
  } else {
    ensureColumns(s, ["שם_לקוח","טלפון","כתובת","qr_url","קוד_שער","סוג_בריכה","ימים_קבועים","מפעיל_קבוע","יתרת_טיפולים_חודשית","מונה_טיפולים_בפועל","מכסת_טיפולים_חודשית","חודש_טיפולים"]);
  }
    
    // ── דוחות ──
    s = clientSS.getSheetByName("דוחות");
    if(!s) {
      s = clientSS.insertSheet("דוחות");
      s.appendRow(["תאריך","מפעיל","לקוח","כלור","pH","מלח","גובה_מים","צלילות","פס_שומן","זרימה","דגם_אלקטרודה","סריאלי_אלקטרודה","תאריך_ניקיון","תאריך_ניקיון_הבא","ציוד_נדרש","מצב_בריכה","פירוט_מצב","הגבלה_עד","הערות","chlora","hth","phUp","acidLiters","ציוד_שסופק"]);
    } else {
      ensureColumns(s, ["תאריך","מפעיל","לקוח","כלור","pH","מלח","גובה_מים","צלילות","פס_שומן","זרימה","דגם_אלקטרודה","סריאלי_אלקטרודה","תאריך_ניקיון","תאריך_ניקיון_הבא","ציוד_נדרש","מצב_בריכה","פירוט_מצב","הגבלה_עד","הערות","chlora","hth","phUp","acidLiters","ציוד_שסופק"]);
    }
    
    // ── משימות ──
    s = clientSS.getSheetByName("משימות");
    if(!s) {
      s = clientSS.insertSheet("משימות");
      s.appendRow(["id","תאריך","לקוח","מפעילים","סטטוס","changeLog"]);
    } else {
      ensureColumns(s, ["id","תאריך","לקוח","מפעילים","סטטוס","changeLog"]);
    }

    // ── חלוקת_עבודה ──
    s = clientSS.getSheetByName("חלוקת_עבודה");
    if(!s) {
      s = clientSS.insertSheet("חלוקת_עבודה");
      s.appendRow(["id","תאריך","מפעיל","לקוח","סדר","הערת_מנהל","סטטוס","changeLog"]);
    } else {
      ensureColumns(s, ["id","תאריך","מפעיל","לקוח","סדר","הערת_מנהל","סטטוס","changeLog"]);
    }
    
    // ── ציוד_לקוחות ──
    s = clientSS.getSheetByName("ציוד_לקוחות");
    if(!s) {
      s = clientSS.insertSheet("ציוד_לקוחות");
      s.appendRow(["לקוח","חומצת_מלח","מעלה_pH","שקי_מלח","כמות_שקים","עודכן","הערת_חומרים"]);
    } else {
      ensureColumns(s, ["לקוח","חומצת_מלח","מעלה_pH","שקי_מלח","כמות_שקים","עודכן","הערת_חומרים"]);
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
      if(t.getHandlerFunction() === "checkNotifications") {
        ScriptApp.deleteTrigger(t);
      }
    });

    // צור trigger חדש — כל 5 דקות
    ScriptApp.newTrigger("checkNotifications")
      .timeBased()
      .everyMinutes(5)
      .create();

    Logger.log("✅ Trigger נוצר — checkNotifications כל 5 דקות");
  }

  function checkNotifications() {
    const clientSS = SpreadsheetApp.openById("1NthErqOJOFHJ482q3zg2daFX9SGCFeByXjdoZxvV-no");
    checkNotificationsForSheet_(clientSS);
  }

  function getNotificationSpreadsheets_() {
    const ids = {};
    ids["1am5BQh6oesQXoJgdeTpiDTIEuzf8UdfWotPXSoqOLiU"] = true;
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
        const res = sendOneSignalToAdmins_(ss, {
          title: `🚨 ${urgent.length} תקלות קריטיות לא טופלו!`,
          message: urgent.map(r => r[2]).join(", ")
        });
        Logger.log("📢 תזכורת תקלות נשלחה לאדמינים בלבד: " + JSON.stringify(res));
      }
    }

    sendNoonWorkClockReminders_(ss);
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

      const res = sendOneSignalToUser_({
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
    if (hour < 16) return;

    const today = Utilities.formatDate(now, "Asia/Jerusalem", "yyyy-MM-dd");
    const props = PropertiesService.getScriptProperties();
    const key = "missingDailyReports:" + ss.getId() + ":" + today;
    if (props.getProperty(key) === "done") return;

    const clientsSheet = ss.getSheetByName("לקוחות");
    const reportsSheet = ss.getSheetByName("דוחות");
    if (!clientsSheet || !reportsSheet) return;

    const clientRows = clientsSheet.getDataRange().getValues();
    if (clientRows.length < 2) {
      props.setProperty(key, "done");
      return;
    }

    const dayName = hebrewDayName_(today);
    const assigned = clientRows.slice(1)
      .filter(r => r[0])
      .map(r => ({
        client: String(r[0] || "").trim(),
        operator: String(r[7] || "").trim(),
        days: String(r[6] || "").split(",").map(normalizeHebrewDay_).filter(Boolean)
      }))
      .filter(x => x.client && x.days.includes(dayName));

    const reportRows = reportsSheet.getDataRange().getValues();
    const alreadyReported = {};
    reportRows.slice(1).forEach(r => {
      const date = normalizeSheetDate_(r[0]);
      const client = String(r[2] || "").trim();
      if (date === today && client) alreadyReported[client] = true;
    });

    let appended = 0;
    assigned.forEach(item => {
      if (alreadyReported[item.client]) return;
      reportsSheet.appendRow([
        today,
        item.operator,
        item.client,
        0, 0, 0,
        "", "", "", "",
        "", "", "", "",
        "",
        "",
        "",
        "",
        "לא בוצע טיפול",
        0, 0, 0, 0
      ]);
      alreadyReported[item.client] = true;
      appended++;
    });

    refreshMonthlyTreatmentCounters_(ss);
    props.setProperty(key, "done");
    Logger.log("Missing daily reports appended: " + appended + " for " + today);
  }

  function refreshMonthlyTreatmentCounters_(ss) {
    const clientsSheet = ss.getSheetByName("לקוחות");
    const reportsSheet = ss.getSheetByName("דוחות");
    if (!clientsSheet || !reportsSheet) return [];

    ensureColumns(clientsSheet, ["יתרת_טיפולים_חודשית", "מונה_טיפולים_בפועל", "מכסת_טיפולים_חודשית", "חודש_טיפולים"]);

    const clientsRows = clientsSheet.getDataRange().getValues();
    if (!clientsRows.length) return [];
    const headerRowIndex = findHeaderRowIndex_(clientsSheet, ["שם_לקוח", "שם לקוח", "יתרת_טיפולים_חודשית", "מונה_טיפולים_בפועל"]);
    const headers = (clientsRows[headerRowIndex] || []).map(h => String(h || "").trim());
    const balanceIdx = headers.indexOf("יתרת_טיפולים_חודשית");
    const countIdx = headers.indexOf("מונה_טיפולים_בפועל");
    const quotaIdx = headers.indexOf("מכסת_טיפולים_חודשית");
    const quotaMonthIdx = headers.indexOf("חודש_טיפולים");
    const monthKey = Utilities.formatDate(new Date(), "Asia/Jerusalem", "yyyy-MM");
    const counts = {};

    reportsSheet.getDataRange().getValues().slice(1).forEach(r => {
      const date = normalizeSheetDate_(r[0]);
      const client = String(r[2] || "").trim();
      const notes = String(r[18] || "").trim();
      if (!client || !date.startsWith(monthKey) || notes === "לא בוצע טיפול") return;
      counts[client] = (counts[client] || 0) + 1;
    });

    const treatments = [];
    for (let i = headerRowIndex + 1; i < clientsRows.length; i++) {
      const client = String(clientsRows[i][0] || "").trim();
      if (!client) continue;
      const actual = counts[client] || 0;
      const row = clientsRows[i];
      const regularDays = String(row[6] || "");
      const savedMonth = quotaMonthIdx >= 0 ? String(row[quotaMonthIdx] || "").trim() : "";
      const typedQuota = quotaIdx >= 0 ? Number(row[quotaIdx] || 0) : 0;
      const typedBalance = balanceIdx >= 0 ? Number(row[balanceIdx] || 0) : 0;
      const calculatedQuota = countClientCalendarTreatments_(regularDays, new Date()) || 4;
      const manualQuota = typedQuota || (typedBalance ? typedBalance + actual : 0);
      const quota = (savedMonth === monthKey || !savedMonth)
        ? Math.max(0, Math.round(manualQuota || calculatedQuota))
        : calculatedQuota;
      const balance = Math.max(0, quota - actual);
      if (balanceIdx >= 0) clientsSheet.getRange(i + 1, balanceIdx + 1).setValue(balance);
      if (countIdx >= 0) clientsSheet.getRange(i + 1, countIdx + 1).setValue(actual);
      if (quotaIdx >= 0) clientsSheet.getRange(i + 1, quotaIdx + 1).setValue(quota);
      if (quotaMonthIdx >= 0) clientsSheet.getRange(i + 1, quotaMonthIdx + 1).setValue(monthKey);
      treatments.push({ client, monthlyTreatmentBalance: balance, monthlyTreatmentCount: actual, monthlyTreatmentQuota: quota });
    }
    return treatments;
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
    return String(value || "").trim().slice(0, 10);
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

  function sendOneSignalNotification(title, message) {
    Logger.log("Broadcast notification blocked. Use sendOneSignalToAdmins_ or sendOneSignalToUser_ instead.");
    return {
      success: false,
      blocked: true,
      reason: "Broadcast to All is disabled"
    };
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

    Logger.log("Green API state URL: " + url);
    Logger.log("Green API state status: " + code);
    Logger.log("Green API state response: " + text);

    const state = String(parsed.stateInstance || parsed.state || "");

    return {
      success: code >= 200 && code < 300 && state === "authorized",
      ok: code >= 200 && code < 300 && state === "authorized",
      status: code,
      stateInstance: state,
      response: parsed
    };
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

    const url = config.apiUrl + "/waInstance" + config.idInstance + "/sendMessage/" + config.apiTokenInstance;
    const payload = {
      chatId: chatId,
      message: message
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

    Logger.log("Green API URL: " + url);
    Logger.log("Green API chatId: " + chatId);
    Logger.log("Green API status: " + code);
    Logger.log("Green API response: " + text);

    const idMessage = parsed.idMessage || "";

    return {
      success: code >= 200 && code < 300 && !parsed.error && !!idMessage,
      ok: code >= 200 && code < 300 && !parsed.error && !!idMessage,
      status: code,
      chatId: chatId,
      idMessage: idMessage,
      response: parsed
    };
  }

  function normalizeGreenApiPhone_(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.indexOf("972") === 0) return digits;
    if (digits.indexOf("0") === 0) return "972" + digits.slice(1);
    if (digits.length === 9 && digits.indexOf("5") === 0) return "972" + digits;
    return digits;
  }

  function saveClientInternalNote_(ss, data) {
    const sheet = ss.getSheetByName("דוחות");
    if (!sheet) return { success:false, error:"reports sheet not found" };

    const client = String(data.client || "").trim();
    const note = String(data.note || "");
    if (!client) return { success:false, error:"missing client" };

    const rows = sheet.getDataRange().getValues();
    let hi = rows.findIndex(r => String(r[0]).includes("תאריך"));
    if (hi === -1) hi = 0;

    let targetRow = 0;
    let targetDate = "";
    for (let i = hi + 1; i < rows.length; i++) {
      const rowClient = String(rows[i][2] || "").trim();
      if (rowClient !== client) continue;
      const rowDate = normalizeSheetDate_(rows[i][0]);
      if (!targetRow || rowDate >= targetDate) {
        targetRow = i + 1;
        targetDate = rowDate;
      }
    }

    if (!targetRow) {
      return { success:false, error:"no report row for client", client:client };
    }

    // Column 17 is פירוט_מצב / customStatusText.
    sheet.getRange(targetRow, 17).setValue(note);
    return { success:true, row:targetRow, client:client, note:note };
  }
  

  function sendOneSignalToUser_(data) {
    const props = PropertiesService.getScriptProperties();
    const APP_ID = String(props.getProperty("ONESIGNAL_APP_ID") || "dc1af269-2502-41a4-89d5-a3aa8d5be956").trim();
    const REST_API_KEY = String(props.getProperty("ONESIGNAL_REST_API_KEY") || "").trim();

    const title = String(data.title || data.heading || "Pool Alert");
    const message = String(data.message || data.body || data.text || data.content || "New notification");
    const externalUserId = String(
      data.externalUserId ||
      data.externalId ||
      data.external_id ||
      data.username ||
      data.userId ||
      data.recipient ||
      data.to ||
      data.targetUser ||
      ""
    ).trim();

    if (!externalUserId) {
      return { success:false, error:"missing externalUserId" };
    }

    if (!REST_API_KEY) {
      return { success:false, error:"missing OneSignal REST API key" };
    }

    const payload = {
      app_id: APP_ID,
      target_channel: "push",
      include_aliases: {
        external_id: [externalUserId]
      },
      headings: { en: title, he: title },
      contents: { en: message, he: message }
    };

    const options = {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: "Key " + REST_API_KEY
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const res = UrlFetchApp.fetch("https://api.onesignal.com/notifications", options);
    const code = res.getResponseCode();
    const text = res.getContentText();

    Logger.log("OneSignal targeted user: " + externalUserId);
    Logger.log("OneSignal targeted status: " + code);
    Logger.log("OneSignal targeted response: " + text);

    let parsed = {};
    try {
      parsed = JSON.parse(text);
    } catch(e) {
      parsed = { raw:text };
    }

    const recipients = Number(parsed.recipients || 0);
    const ok = code >= 200 && code < 300 && !parsed.errors && recipients > 0;

    return {
      success: ok,
      ok,
      sent: ok,
      status: code,
      recipients,
      id: parsed.id || "",
      externalUserId,
      response: parsed
    };
  }

  function sendOneSignalToAdmins_(ss, data) {
    const usersSheet = ss.getSheetByName("Users");
    if (!usersSheet) return { success:false, error:"Users sheet not found" };

    const rows = usersSheet.getDataRange().getValues();
    let hi = rows.findIndex(r => r.some(c => String(c).toLowerCase().trim() === "username"));
    if (hi === -1) hi = 0;

    const headers = rows[hi].map(h => String(h).trim());
    const usernameIdx = headers.findIndex(h => h.toLowerCase() === "username");
    const roleIdx = headers.findIndex(h => h.toLowerCase() === "role");
    const nameIdx = headers.findIndex(h => h.toLowerCase() === "name");

    const admins = rows.slice(hi + 1)
      .filter(r => r[0])
      .map(r => ({
        username: String(r[usernameIdx >= 0 ? usernameIdx : 0] || "").trim(),
        role: String(r[roleIdx >= 0 ? roleIdx : 2] || "").trim().toLowerCase(),
        name: String(r[nameIdx >= 0 ? nameIdx : 3] || "").trim(),
      }))
      .filter(u => u.username && isAdminRole_(u.role));

    Logger.log("Admin notification targets: " + JSON.stringify(admins));

    let sent = 0;
    const results = [];
    admins.forEach(admin => {
      const res = sendOneSignalToUser_({
        externalUserId: admin.username,
        title: data.title || data.heading || "Pool Alert",
        message: data.message || data.body || data.text || "New notification"
      });
      results.push({ username: admin.username, name: admin.name, result: res });
      if (res && res.success) sent++;
    });

    return {
      success: sent > 0,
      sent,
      total: admins.length,
      results
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

    const res = sendOneSignalToUser_({
      externalUserId: user.username,
      title: "✅ התקלה סומנה כטופלה",
      message: messageParts.join(" · ") || "התקלה שפתחת טופלה"
    });

    Logger.log("Operator issue done notification: " + JSON.stringify(res));
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

    const res = sendOneSignalToUser_({
      externalUserId: user.username,
      title: "🚨 תקלה קריטית אושרה",
      message: messageParts.join(" · ") || "תקלה קריטית אושרה ונמצאת בטיפול מיידי"
    });

    Logger.log("Operator critical issue ack notification: " + JSON.stringify(res));
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

  function reportRowValues_(r) {
    return [r.reportDate, r.operator, r.client, r.chlorine, r.ph, r.salt,
      r.waterLevel, r.clarity, r.fat, r.flow, r.elModel, r.elSerial,
      r.elDate, r.elNext, r.supplyLabel, r.poolStatus, r.customStatusText,
      r.restrictedUntil, r.notes, r.chlora||0, r.hth||0, r.phUp||0, r.acidLiters||0, r.suppliedEquipment||""];
  }

  function findLatestReportRow_(sheet, original, report) {
    if (!sheet || sheet.getLastRow() < 2) return 0;
    const date = normalizeReportDate_(original.date || original.reportDate || report.reportDate);
    const client = normalizeReportValue_(original.client || report.client);
    const operator = normalizeReportValue_(original.operator || report.operator);
    const rows = sheet.getDataRange().getValues();
    let hi = rows.findIndex(r => String(r[0]).includes("תאריך"));
    if (hi === -1) hi = 0;

    for (let i = rows.length - 1; i > hi; i--) {
      if (!rows[i][0]) continue;
      if (
        normalizeReportDate_(rows[i][0]) === date &&
        normalizeReportValue_(rows[i][1]) === operator &&
        normalizeReportValue_(rows[i][2]) === client
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

function findDuplicateReportRow_(sheet, report) {
    if (!sheet || sheet.getLastRow() < 2) return 0;

    const targetKey = reportDuplicateKeyFromReport_(report);
    const rows = sheet.getDataRange().getValues();
    let hi = rows.findIndex(r => String(r[0]).includes("תאריך"));
    if (hi === -1) hi = 0;

    for (let i = hi + 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      if (reportDuplicateKeyFromRow_(rows[i]) === targetKey) return i + 1;
    }

    return 0;
  }

  function findDuplicateOperatorIssueRow_(sheet, issue) {
    if (!sheet || sheet.getLastRow() < 2) return 0;
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
      normalizeReportValue_(r.suppliedEquipment || "")
    ].join("|");
  }

  function reportDuplicateKeyFromRow_(r) {
    return [
      normalizeReportDate_(r[0]),
      normalizeReportValue_(r[1]),
      normalizeReportValue_(r[2]),
      normalizeReportValue_(r[3]),
      normalizeReportValue_(r[4]),
      normalizeReportValue_(r[5]),
      normalizeReportValue_(r[6]),
      normalizeReportValue_(r[7]),
      normalizeReportValue_(r[8]),
      normalizeReportValue_(r[9]),
      normalizeReportValue_(r[10]),
      normalizeReportValue_(r[11]),
      normalizeReportDate_(r[12]),
      normalizeReportDate_(r[13]),
      normalizeReportValue_(r[15]),
      normalizeReportValue_(r[16]),
      normalizeReportDate_(r[17]),
      normalizeReportValue_(r[18]),
      normalizeReportValue_(r[19] || 0),
      normalizeReportValue_(r[20] || 0),
      normalizeReportValue_(r[21] || 0),
      normalizeReportValue_(r[22] || 0),
      normalizeReportValue_(r[23] || "")
    ].join("|");
  }

  function normalizeReportDate_(value) {
    if (!value) return "";
    if (value instanceof Date) return Utilities.formatDate(value, "Asia/Jerusalem", "yyyy-MM-dd");
    return String(value).trim().slice(0, 10);
  }

function normalizeReportValue_(value) {
  if (value === null || value === undefined) return "";
  const s = String(value).trim();
  if (s === "") return "";
  const n = Number(s);
  if (!isNaN(n)) return String(Math.round(n * 1000) / 1000);
  return s;
}

function dedupeRowsByFirstCell_(rows) {
  const map = {};
  (rows || []).filter(r => r && r[0]).forEach(r => {
    map[normalizeReportValue_(r[0]).toLowerCase()] = r;
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
  return [
    normalizeAdminOrderDate_(o && o.date),
    normalizeReportValue_(o && o.operator).toLowerCase(),
    normalizeReportValue_(o && o.client).toLowerCase()
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

function getClients_(ss) {
  const sheet = ss.getSheetByName("לקוחות");
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  let hi = rows.findIndex(r => isClientNameHeader_(r[0]));
  if (hi === -1) hi = 2;
  const headers = (rows[hi] || []).map(h => String(h || "").trim());
  const quotaIdx = headers.indexOf("מכסת_טיפולים_חודשית");
  return rows.slice(hi + 1).filter(r => r[0]).map(r => ({
    name: String(r[0]), phone: String(r[1]), address: String(r[2]), qrUrl: String(r[3]||""), gateCode: String(r[4]||""), poolType: String(r[5]||"מלח"), regularDays: String(r[6]||""), regularOperator: String(r[7]||""), monthlyTreatmentBalance: Number(r[8] || 0), monthlyTreatmentCount: Number(r[9] || 0), monthlyTreatmentQuota: Number(quotaIdx >= 0 ? r[quotaIdx] || 0 : 0)
  }));
}

function saveClients_(sheet, clients) {
  if (!sheet) return { success:false, error:"clients sheet not found" };
  const headerRowIndex = findHeaderRowIndex_(sheet, ["שם_לקוח", "שם לקוח", "שם", "לקוח", "שם הלקוח"]);
  const headerRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 3;
  ensureColumns(sheet, [
    "קוד_שער",
    "סוג_בריכה",
    "ימים_קבועים",
    "מפעיל_קבוע",
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
    name: ["שם_לקוח", "שם לקוח", "שם", "לקוח", "שם הלקוח"],
    phone: ["טלפון", "נייד", "מספר טלפון"],
    address: ["כתובת"],
    qrUrl: ["qr_url", "QR", "קישור_QR"],
    gateCode: ["קוד_שער", "קוד שער"],
    poolType: ["סוג_בריכה", "סוג בריכה"],
    regularDays: ["ימים_קבועים", "ימים קבועים"],
    regularOperator: ["מפעיל_קבוע", "מפעיל קבוע"],
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
  const existing = {};
  const existingByRow = {};
  const nameIdx = colOf("name");
  if (lastRow >= dataStart) {
    sheet.getRange(dataStart, 1, lastRow - headerRow, lastCol).getValues().forEach((row, offset) => {
      const name = String(row[nameIdx >= 0 ? nameIdx : 0] || "").trim();
      const rowNumber = dataStart + offset;
      if (name) existing[normalizeReportValue_(name)] = { row, rowNumber };
      existingByRow[rowNumber] = row;
    });
  }

  const managedKeys = [
    "name",
    "phone",
    "address",
    "qrUrl",
    "gateCode",
    "poolType",
    "regularDays",
    "regularOperator",
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
      name: String(c.name || "").trim(),
      phone: String(c.phone || ""),
      address: String(c.address || ""),
      qrUrl: String(c.qrUrl || ""),
      gateCode: String(c.gateCode || ""),
      poolType: String(c.poolType || "מלח"),
      regularDays: String(c.regularDays || ""),
      regularOperator: String(c.regularOperator || ""),
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
  const byClientName = {};
  clients.filter(c => c && String(c.name || "").trim()).forEach(c => {
    byClientName[normalizeReportValue_(c.originalName || c.name).toLowerCase()] = c;
  });
  Object.keys(byClientName).map(key => byClientName[key]).forEach(c => {
    const record = existing[normalizeReportValue_(c.originalName || c.name)] || existing[normalizeReportValue_(c.name)];
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
  const requestedExisting = Object.keys(byClientName).length;
  if (clients.length && requestedExisting && matched === 0 && appended === 0) {
    return { success:false, error:"no matching client rows found", count:clients.length, updated, appended, matched };
  }
  return { success:true, count:clients.length, updated, appended, matched };
}

function getTasks_(ss) {
  const sheet = ss.getSheetByName("משימות");
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  let hi = rows.findIndex(r => String(r[0]).toUpperCase() === "ID");
  if (hi === -1) hi = 2;
  return rows.slice(hi + 1).filter(r => r[0]).map(r => {
    let date = r[1];
    if (date instanceof Date) {
      date = Utilities.formatDate(date, "Asia/Jerusalem", "yyyy-MM-dd");
    } else {
      date = String(date).slice(0,10);
    }
    return {
      id: r[0], date,
      client: r[2],
      operators: r[3] ? String(r[3]).split(",").map(x => x.trim()) : [],
      status: r[4],
      changeLog: r[5] ? JSON.parse(String(r[5])) : [],
      orderIndex: Number(r[6] || 0),
      adminNote: String(r[7] || ""),
      createdByAdminOrder: String(r[8] || "").toLowerCase() === "true" || r[8] === true
    };
  }).filter(t => !isAdminOrderTask_(t));
}

function isAdminOrderTask_(t) {
  return !!(t && (t.createdByAdminOrder === true || Number(t.orderIndex || 0) > 0));
}

function taskKey_(t) {
  const operators = (t && t.operators || []).map(op => normalizeReportValue_(op).toLowerCase()).filter(Boolean).sort().join(",");
  return [
    normalizeAdminOrderDate_(t && t.date),
    normalizeReportValue_(t && t.client).toLowerCase(),
    operators
  ].join("|");
}

function dedupeTasks_(tasks) {
  const map = {};
  (tasks || []).filter(t => t && t.date && t.client && !isAdminOrderTask_(t)).forEach(t => {
    const key = taskKey_(t);
    map[key] = {
      id: t.id || key,
      date: normalizeAdminOrderDate_(t.date),
      client: String(t.client || ""),
      operators: Array.isArray(t.operators) ? t.operators : String(t.operators || "").split(",").map(x => x.trim()).filter(Boolean),
      status: String(t.status || "pending"),
      changeLog: Array.isArray(t.changeLog) ? t.changeLog : [],
      orderIndex: Number(t.orderIndex || 0),
      adminNote: String(t.adminNote || ""),
      createdByAdminOrder: t.createdByAdminOrder === true
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
        changeLog: r[7] ? JSON.parse(String(r[7])) : []
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
    existingKeys[[o.date, normalizeReportValue_(o.operator), normalizeReportValue_(o.client)].join("|")] = true;
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
      changeLog: r[5] ? JSON.parse(String(r[5])) : []
    };
  }).filter(Boolean);
  legacyOrders.forEach(o => {
    const key = [o.date, normalizeReportValue_(o.operator), normalizeReportValue_(o.client)].join("|");
    if (!existingKeys[key]) orders.push(o);
  });
  return dedupeAdminOrders_(orders);
}

function saveAdminOrders_(ss, adminOrders) {
  let sheet = ss.getSheetByName("חלוקת_עבודה");
  if (!sheet) sheet = ss.insertSheet("חלוקת_עבודה");

  const headers = ["id","\u05ea\u05d0\u05e8\u05d9\u05da","\u05de\u05e4\u05e2\u05d9\u05dc","\u05dc\u05e7\u05d5\u05d7","\u05e1\u05d3\u05e8","\u05d4\u05e2\u05e8\u05ea_\u05de\u05e0\u05d4\u05dc","\u05e1\u05d8\u05d8\u05d5\u05e1","changeLog"];
  const rows = dedupeAdminOrders_(adminOrders).filter(o => o && o.client).map(o => ([
    o.id,
    o.date,
    o.operator || "",
    o.client,
    Number(o.orderIndex || 0),
    o.adminNote || "",
    o.status || "pending",
    JSON.stringify(o.changeLog || [])
  ]));

  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function getSubOperatorShares_(ss) {
  const sheet = ss.getSheetByName("SubOperatorShares");
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  return rows.slice(1).filter(r => r[0] && r[1] && r[4]).map(r => {
    let date = r[0];
    if (date instanceof Date) date = Utilities.formatDate(date, "Asia/Jerusalem", "yyyy-MM-dd");
    else date = String(date || "").slice(0, 10);
    return {
      date,
      operator: String(r[1] || ""),
      subUsername: String(r[2] || ""),
      subOperator: String(r[3] || ""),
      client: String(r[4] || ""),
      orderIndex: Number(r[5] || 0),
      note: String(r[6] || ""),
      sharedAt: String(r[7] || ""),
      sharedBy: String(r[8] || "")
    };
  });
}

function saveSubOperatorShares_(ss, sharedSubOrders) {
  let sheet = ss.getSheetByName("SubOperatorShares");
  if (!sheet) sheet = ss.insertSheet("SubOperatorShares");
  const headers = ["date","operator","subUsername","subOperator","client","orderIndex","note","sharedAt","sharedBy"];
  const seen = {};
  const rows = (sharedSubOrders || []).filter(r => r && r.date && r.operator && r.client).map(r => {
    const key = [
      String(r.date || "").slice(0, 10),
      normalizeReportValue_(r.operator),
      normalizeReportValue_(r.subUsername || r.subOperator),
      normalizeReportValue_(r.client)
    ].join("|");
    if (seen[key]) return null;
    seen[key] = true;
    return [
      String(r.date || "").slice(0, 10),
      r.operator || "",
      r.subUsername || "",
      r.subOperator || "",
      r.client || "",
      Number(r.orderIndex || 0),
      r.note || "",
      r.sharedAt || "",
      r.sharedBy || ""
    ];
  }).filter(Boolean);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
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
  rows.slice(3).filter(r => r[0]).forEach(r => {
    db[String(r[0])] = {
      acid: r[1] === "כן", phUp: r[2] === "כן",
      saltPkg: r[3] === "כן", saltBags: parseInt(r[4]) || 1,
      updatedAt: String(r[5]),
      supplyNote: String(r[6]||"")
    };
  });
  return db;
}

function getLastReadings_(ss) {
  const sheet = ss.getSheetByName("דוחות");
  if (!sheet) return {};
  const rows = sheet.getDataRange().getValues();
  let hi = rows.findIndex(r => String(r[0]).includes("תאריך"));
  if (hi === -1) hi = 2;
  const readings = {};
  rows.slice(hi + 1).filter(r => r[0]).forEach(r => {
    const client = String(r[2]);
    const date = normalizeSheetDate_(r[0]);
    if (!readings[client] || date > readings[client].date) {
      readings[client] = {
        date, chlorine: r[3], ph: r[4],
        chlora: r[19]||0, hth: r[20]||0, phUp: r[21]||0, acidLiters: r[22]||0,
        elModel: String(r[10]||""), elSerial: String(r[11]||""),
        elDate: r[12] instanceof Date ? Utilities.formatDate(r[12],"Asia/Jerusalem","yyyy-MM-dd") : String(r[12]||""),
        elNext: r[13] instanceof Date ? Utilities.formatDate(r[13],"Asia/Jerusalem","yyyy-MM-dd") : String(r[13]||""),
        poolStatus: String(r[15]||""),
        customStatusText: String(r[16]||""),
        notes: String(r[18]||""),
        missedTreatment: String(r[18]||"").trim() === "לא בוצע טיפול"
      };
    }
  });
  return readings;
}

function getUnassignedClients_(ss) {
  let sheet = ss.getSheetByName("לקוחות_ללא_שיוך");
  if(!sheet) {
    sheet = ss.getSheetByName("לקוחות");
    if(!sheet) return [];
    const rows = sheet.getDataRange().getValues();
    let hi = rows.findIndex(r => isClientNameHeader_(r[0]));
    if(hi===-1) hi=0;
    return rows.slice(hi+1).filter(r=>r[0]).map(r=>({
      name:String(r[0]), phone:String(r[1]), address:String(r[2])
    }));
  }
  const rows = sheet.getDataRange().getValues();
  return rows.slice(1).filter(r=>r[0]).map(r=>({
    name:String(r[0]), phone:String(r[1]||""), address:String(r[2]||"")
  }));
}

function getClientBrandingBySheetId_(sheetId) {
  const id = String(sheetId || "").trim();
  if (!id) return {};

  try {
    const mgmt = SpreadsheetApp.openById("17jNBWSAkW17zfz4o2gY3wOsERa3_NAgSZ3b9HPkNspk");
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


function json(obj) {
  return ContentService
      .createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
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
      const lastCol = reportSheet.getLastColumn();
      const headers = reportSheet.getRange(1,1,1,lastCol).getValues()[0];
    const neededR = ["chlora","hth","phUp","acidLiters","ציוד_שסופק"];
      neededR.forEach((name, i) => {
        if(!headers.includes(name)) {
          reportSheet.getRange(1, lastCol+i+1).setValue(name);
          Logger.log("✅ דוחות - הוספה: " + name);
        }
      });
    }

    // ── טאב לקוחות_חופשיים: צור אם לא קיים ──
    if(!ss.getSheetByName("לקוחות_חופשיים")) {
      const fc = ss.insertSheet("לקוחות_חופשיים");
      fc.appendRow(["שם_לקוח","טלפון","כתובת","סוג_בריכה","קוד_שער"]);
      Logger.log("✅ נוצר טאב: לקוחות_חופשיים");
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
    sendOneSignalNotification("בדיקה", "זוהי הודעת בדיקה");
  }

  function testClientAdminNotification() {
    const ss = SpreadsheetApp.openById("1NthErqOJOFHJ482q3zg2daFX9SGCFeByXjdoZxvV-no");
    const res = sendOneSignalToAdmins_(ss, {
      title: "Client admin notification test",
      message: "Test notification for internal admin only"
    });
    Logger.log(JSON.stringify(res));
  }

  function testOneSignalToUser() {
    const targetUsername = "admin";
    const res = sendOneSignalToUser_({
      externalUserId: targetUsername,
      title: "בדיקת התראה",
      message: "אם קיבלת את זה, החיבור להתראות תקין"
    });
    Logger.log(JSON.stringify(res));
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
