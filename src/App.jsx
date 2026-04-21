// ─── מרכזי — תומך בכל לקוח לפי sheetId ───────────────────────────────────
// הלקוח משתף את הגיליון שלו עם האימייל שלך ומכניס את ה-ID באפליקציה

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    // sheetId מגיע מהאפליקציה — כל לקוח שולח את שלו
    const SHEET_ID = data.sheetId || "1am5BQh6oesQXoJgdeTpiDTIEuzf8UdfWotPXSoqOLiU";
    const ss = SpreadsheetApp.openById(SHEET_ID);

    if (action === "getUsers") {
      const sheet = ss.getSheetByName("Users");
      const rows = sheet.getDataRange().getValues();
      let hi = rows.findIndex(r => r.some(c => String(c).toLowerCase() === "username"));
      if (hi === -1) hi = 0;
      const headers = rows[hi];
      const users = rows.slice(hi + 1).filter(r => r[0]).map(r => {
        const obj = {};
        headers.forEach((h, i) => obj[h] = r[i]);
        return obj;
      });
      return json({ users });
    }

    if (action === "getClients") {
      const sheet = ss.getSheetByName("לקוחות");
      const rows = sheet.getDataRange().getValues();
      let hi = rows.findIndex(r => String(r[0]).includes("שם_לקוח") || String(r[0]).includes("שם לקוח"));
      if (hi === -1) hi = 2;
      const clients = rows.slice(hi + 1).filter(r => r[0]).map(r => ({
        name: String(r[0]), phone: String(r[1]), address: String(r[2]), qrUrl: String(r[3]||"")
      }));
      return json({ clients });
    }

    if (action === "getTasks") {
      const sheet = ss.getSheetByName("משימות");
      const rows = sheet.getDataRange().getValues();
      let hi = rows.findIndex(r => String(r[0]).toUpperCase() === "ID");
      if (hi === -1) hi = 2;
      const tasks = rows.slice(hi + 1).filter(r => r[0]).map(r => {
        // Normalize date — remove timestamp if present
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
          changeLog: r[5] ? JSON.parse(String(r[5])) : []
        };
      });
      return json({ tasks });
    }

    if (action === "saveTasks") {
      const sheet = ss.getSheetByName("משימות");
      const rows = sheet.getDataRange().getValues();
      let hi = rows.findIndex(r => String(r[0]).toUpperCase() === "ID");
      if (hi === -1) hi = 2;
      const dataStart = hi + 2;
      const last = sheet.getLastRow();
      if (last >= dataStart) sheet.deleteRows(dataStart, last - dataStart + 1);
      data.tasks.forEach(t => {
        sheet.appendRow([t.id, t.date, t.client, t.operators.join(","), t.status, JSON.stringify(t.changeLog)]);
      });
      return json({ success: true });
    }

    if (action === "saveReport") {
      const sheet = ss.getSheetByName("דוחות");
      const r = data.report;
      sheet.appendRow([r.reportDate, r.operator, r.client, r.chlorine, r.ph, r.salt,
        r.waterLevel, r.clarity, r.fat, r.flow, r.elModel, r.elSerial,
        r.elDate, r.elNext, r.supplyLabel, r.poolStatus, r.customStatusText,
        r.restrictedUntil, r.notes]);
      return json({ success: true });
    }

    if (action === "saveSupplyDB") {
      const sheet = ss.getSheetByName("ציוד_לקוחות");
      const last = sheet.getLastRow();
      if (last > 3) sheet.deleteRows(4, last - 3);
      data.rows.forEach(r => sheet.appendRow(r));
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
          updatedAt: String(r[5])
        };
      });
      return json({ supplyDB: db });
    }

    if (action === "saveClients") {
      const sheet = ss.getSheetByName("לקוחות");
      const last = sheet.getLastRow();
      // Find header row
      let hi = 2;
      for (let i = 0; i < last; i++) {
        if (String(sheet.getRange(i+1,1).getValue()).includes("שם")) { hi = i+1; break; }
      }
      // Clear data rows
      if (last > hi) sheet.deleteRows(hi+1, last-hi);
      data.clients.forEach(c => sheet.appendRow([c.name, c.phone, c.address, c.qrUrl||""]));
      return json({ success: true });
    }

    if (action === "getLastReadings") {
      const sheet = ss.getSheetByName("דוחות");
      const rows = sheet.getDataRange().getValues();
      // Find header row
      let hi = rows.findIndex(r => String(r[0]).includes("תאריך"));
      if (hi === -1) hi = 2;
      const dataRows = rows.slice(hi + 1).filter(r => r[0]);
      // Get last reading per client (columns: date, operator, client, chlorine, ph...)
      const readings = {};
      dataRows.forEach(r => {
        const client = String(r[2]);
        const date   = String(r[0]);
        if (!readings[client] || date > readings[client].date) {
          readings[client] = { date, chlorine: r[3], ph: r[4] };
        }
      });
      return json({ lastReadings: readings });
    }

    if (action === "saveWorkLog") {
      const sheet = ss.getSheetByName("שעות_עבודה");
      const l = data.log;
      sheet.appendRow([l.date, l.operator, l.start, l.end, l.total]);
      return json({ success: true });
    }

    return json({ error: "unknown action" });

  } catch(err) {
    return json({ error: err.message });
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
