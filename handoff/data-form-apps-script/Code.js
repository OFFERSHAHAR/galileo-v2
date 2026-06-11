// פקד סינון נפרד עבור פרויקט "טופס נתונים".
// Script project:
// 1pbV9HK0UrywoLW02sVzNg4DAaPtkbZByrSh1DIDbVfUUkq-Jm3_SwIn8
// Spreadsheet:
// 1NthErqOJOFHJ482q3zg2daFX9SGCFeByXjdoZxvV-no

const DFC_SPREADSHEET_ID = "1NthErqOJOFHJ482q3zg2daFX9SGCFeByXjdoZxvV-no";
const DFC_CONTROL_SHEET_NAME = "פקד_טופס_נתונים";

function installDataFormControl() {
  const ss = dfcSpreadsheet_();
  const result = dfcEnsureControlSheet_(ss);
  dfcEnsureOnEditTrigger_(ss);
  return result;
}

function refreshDataFormControl() {
  return dfcEnsureControlSheet_(dfcSpreadsheet_());
}

function dataFormControlOnEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (!sheet || sheet.getName() !== DFC_CONTROL_SHEET_NAME) return;
  const cell = e.range.getA1Notation();
  if (cell !== "B17" && cell !== "B18") return;
  const checked = e.range.getValue() === true || String(e.value || "").toUpperCase() === "TRUE";
  if (!checked) return;

  try {
    const ss = e.source || dfcSpreadsheet_();
    const criteria = dfcReadCriteria_(ss);
    const result = cell === "B17"
      ? dfcApplyFilter_(ss, criteria)
      : dfcClearFilter_(ss, criteria.sheetName);
    sheet.getRange("B20").setValue(dfcResultText_(result, cell === "B17"));
  } catch (err) {
    sheet.getRange("B20").setValue(err && err.message ? err.message : String(err));
  } finally {
    e.range.setValue(false);
  }
}

function dfcSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(DFC_SPREADSHEET_ID);
}

function dfcEnsureControlSheet_(ss) {
  let control = ss.getSheetByName(DFC_CONTROL_SHEET_NAME);
  const previous = control ? control.getRange("B3:B15").getValues().map(row => row[0]) : [];
  if (!control) control = ss.insertSheet(DFC_CONTROL_SHEET_NAME, 0);

  const sheetNames = ss.getSheets()
    .map(sheet => sheet.getName())
    .filter(name => name !== DFC_CONTROL_SHEET_NAME);
  const previousSheet = String(previous[0] || "");
  const defaultSheet = sheetNames.includes(previousSheet)
    ? previousSheet
    : (sheetNames.includes("טופס נתונים") ? "טופס נתונים" : (sheetNames[0] || ""));

  control.clear();
  if (control.setRightToLeft) control.setRightToLeft(true);
  control.getRange("A1:B1").merge();
  control.getRange("A1")
    .setValue("פקד סינון לטופס נתונים")
    .setBackground("#1d4ed8")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setFontSize(14)
    .setHorizontalAlignment("center");

  control.getRange("A3:B15").setValues([
    ["גיליון לסינון", defaultSheet],
    ["תאריך תחילת תקופת הביטוח מ-", previous[1] || ""],
    ["תאריך תחילת תקופת הביטוח עד", previous[2] || ""],
    ["שנות משכנתא", previous[3] || ""],
    ["תאריך סיום תקופת הביטוח מ-", previous[4] || ""],
    ["תאריך סיום תקופת הביטוח עד", previous[5] || ""],
    ["שם המבוטח", previous[6] || ""],
    ["ת.ז.", previous[7] || ""],
    ["רחוב", previous[8] || ""],
    ["יישוב", previous[9] || ""],
    ["נייד", previous[10] || ""],
    ["טקסט חופשי", previous[11] || ""],
    ["מספר שורות להצגה", previous[12] || ""]
  ]);
  control.getRange("A17:B18").setValues([
    ["סנן עכשיו", false],
    ["נקה סינון", false]
  ]);
  control.getRange("A20:B20").setValues([["תוצאה", "מוכן"]]);
  control.getRange("A22:B25").setValues([
    ["איך משתמשים", "ממלאים תנאים בתאים הלבנים"],
    ["הפעלה", "מסמנים סנן עכשיו"],
    ["ניקוי", "מסמנים נקה סינון"],
    ["חשוב", "הפקד מסתיר שורות בלבד ולא מוחק נתונים"]
  ]);

  control.getRange("A3:A20")
    .setFontWeight("bold")
    .setBackground("#e8eef8")
    .setFontColor("#172033");
  control.getRange("B3:B20")
    .setBackground("#ffffff")
    .setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);
  control.getRange("A17:B18").setBackground("#ecfdf5");
  control.getRange("B17:B18").insertCheckboxes();
  control.getRange("B4:B5").setNumberFormat("dd/mm/yyyy");
  control.getRange("B8:B9").setNumberFormat("dd/mm/yyyy");
  control.setColumnWidth(1, 220);
  control.setColumnWidth(2, 260);
  control.setFrozenRows(1);

  if (sheetNames.length) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(sheetNames, true)
      .setAllowInvalid(false)
      .build();
    control.getRange("B3").setDataValidation(rule);
  }

  return {
    success: true,
    controlSheet: DFC_CONTROL_SHEET_NAME,
    spreadsheet: ss.getName(),
    targetSheets: sheetNames
  };
}

function dfcEnsureOnEditTrigger_(ss) {
  const spreadsheetId = ss.getId();
  const handler = "dataFormControlOnEdit";
  const exists = ScriptApp.getProjectTriggers().some(trigger => {
    if (trigger.getHandlerFunction() !== handler) return false;
    if (typeof trigger.getTriggerSourceId !== "function") return true;
    return trigger.getTriggerSourceId() === spreadsheetId;
  });
  if (!exists) {
    ScriptApp.newTrigger(handler).forSpreadsheet(ss).onEdit().create();
  }
}

function dfcReadCriteria_(ss) {
  const control = ss.getSheetByName(DFC_CONTROL_SHEET_NAME);
  if (!control) throw new Error("טאב הפקד לא נמצא");
  const values = control.getRange("B3:B15").getValues().map(row => row[0]);
  return {
    sheetName: String(values[0] || ""),
    startFrom: values[1],
    startTo: values[2],
    mortgageYears: values[3],
    endFrom: values[4],
    endTo: values[5],
    insuredName: values[6],
    idNumber: values[7],
    street: values[8],
    city: values[9],
    mobile: values[10],
    freeText: values[11],
    limit: Number(values[12] || 0) || 0
  };
}

function dfcApplyFilter_(ss, criteria) {
  const sheet = dfcTargetSheet_(ss, criteria.sheetName);
  const info = dfcHeaderInfo_(sheet);
  const dataRows = Math.max(sheet.getLastRow() - info.headerRow, 0);
  dfcClearFilter_(ss, sheet.getName());
  if (!dataRows) return { success: true, sheetName: sheet.getName(), matched: 0, total: 0, hidden: 0 };

  const indexes = {
    startDate: dfcColumn_(info.headers, ["תאריך תחילת תקופת הביטוח", "תחילת תקופת הביטוח", "תאריך התחלה", "תחילת ביטוח"]),
    mortgageYears: dfcColumn_(info.headers, ["שנות משכנתא", "שנים", "שנות"]),
    endDate: dfcColumn_(info.headers, ["תאריך סיום תקופת הביטוח", "סיום תקופת הביטוח", "תאריך סיום", "סיום ביטוח"]),
    insuredName: dfcColumn_(info.headers, ["שם המבוטח", "מבוטח", "שם"]),
    idNumber: dfcColumn_(info.headers, ["ת.ז.", "תז", "תעודת זהות", "מספר זהות"]),
    street: dfcColumn_(info.headers, ["רחוב"]),
    city: dfcColumn_(info.headers, ["יישוב", "ישוב", "עיר"]),
    mobile: dfcColumn_(info.headers, ["נייד", "טלפון", "פלאפון", "mobile"])
  };

  dfcValidateColumns_(indexes, criteria);

  const startFrom = dfcDateNumber_(criteria.startFrom);
  const startTo = dfcDateNumber_(criteria.startTo);
  const endFrom = dfcDateNumber_(criteria.endFrom);
  const endTo = dfcDateNumber_(criteria.endTo);
  const needles = {
    mortgageYears: dfcNormalize_(criteria.mortgageYears),
    insuredName: dfcNormalize_(criteria.insuredName),
    idNumber: dfcNormalize_(criteria.idNumber),
    street: dfcNormalize_(criteria.street),
    city: dfcNormalize_(criteria.city),
    mobile: dfcNormalize_(criteria.mobile),
    freeText: dfcNormalize_(criteria.freeText)
  };

  const values = sheet.getRange(info.headerRow + 1, 1, dataRows, info.lastCol).getValues();
  const hiddenRows = [];
  let matched = 0;

  values.forEach((row, offset) => {
    let ok = true;
    if (ok && (startFrom || startTo)) {
      const rowDate = dfcDateNumber_(row[indexes.startDate]);
      ok = rowDate !== null && (!startFrom || rowDate >= startFrom) && (!startTo || rowDate <= startTo);
    }
    if (ok && (endFrom || endTo)) {
      const rowDate = dfcDateNumber_(row[indexes.endDate]);
      ok = rowDate !== null && (!endFrom || rowDate >= endFrom) && (!endTo || rowDate <= endTo);
    }
    if (ok && needles.mortgageYears) ok = dfcNormalize_(row[indexes.mortgageYears]).includes(needles.mortgageYears);
    if (ok && needles.insuredName) ok = dfcNormalize_(row[indexes.insuredName]).includes(needles.insuredName);
    if (ok && needles.idNumber) ok = dfcNormalize_(row[indexes.idNumber]).includes(needles.idNumber);
    if (ok && needles.street) ok = dfcNormalize_(row[indexes.street]).includes(needles.street);
    if (ok && needles.city) ok = dfcNormalize_(row[indexes.city]).includes(needles.city);
    if (ok && needles.mobile) ok = dfcNormalize_(row[indexes.mobile]).includes(needles.mobile);
    if (ok && needles.freeText) ok = dfcNormalize_(row.join(" ")).includes(needles.freeText);

    if (ok && criteria.limit && matched >= criteria.limit) ok = false;
    if (ok) matched++;
    else hiddenRows.push(info.headerRow + 1 + offset);
  });

  dfcHideRows_(sheet, hiddenRows);
  return {
    success: true,
    sheetName: sheet.getName(),
    matched,
    total: dataRows,
    hidden: hiddenRows.length
  };
}

function dfcClearFilter_(ss, sheetName) {
  const sheet = dfcTargetSheet_(ss, sheetName);
  const filter = sheet.getFilter();
  if (filter) filter.remove();
  sheet.showRows(1, Math.max(sheet.getMaxRows(), 1));
  return { success: true, sheetName: sheet.getName() };
}

function dfcTargetSheet_(ss, sheetName) {
  const name = String(sheetName || "").trim();
  let sheet = name ? ss.getSheetByName(name) : null;
  if (!sheet || sheet.getName() === DFC_CONTROL_SHEET_NAME) {
    sheet = ss.getSheets().find(s => s.getName() !== DFC_CONTROL_SHEET_NAME);
  }
  if (!sheet) throw new Error("לא נמצא גיליון נתונים לסינון");
  return sheet;
}

function dfcHeaderInfo_(sheet) {
  const known = [
    "תאריך תחילת תקופת הביטוח",
    "שנות משכנתא",
    "תאריך סיום תקופת הביטוח",
    "שם המבוטח",
    "ת.ז.",
    "רחוב",
    "יישוב",
    "נייד"
  ].map(dfcHeaderKey_);
  const maxRows = Math.min(Math.max(sheet.getLastRow(), 1), 30);
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const rows = sheet.getRange(1, 1, maxRows, lastCol).getValues();

  let fallback = 0;
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map(value => String(value || "").trim());
    const nonEmpty = cells.filter(Boolean).length;
    if (nonEmpty >= 2 && fallback === 0) fallback = i;
    const matches = cells.filter(cell => known.includes(dfcHeaderKey_(cell))).length;
    if (matches >= 2) {
      return { headerRow: i + 1, lastCol, headers: cells };
    }
  }
  const headers = rows[fallback] ? rows[fallback].map(value => String(value || "").trim()) : [];
  return { headerRow: fallback + 1, lastCol, headers };
}

function dfcValidateColumns_(indexes, criteria) {
  const missing = [];
  if ((dfcDateNumber_(criteria.startFrom) || dfcDateNumber_(criteria.startTo)) && indexes.startDate < 0) missing.push("תאריך תחילת תקופת הביטוח");
  if (dfcNormalize_(criteria.mortgageYears) && indexes.mortgageYears < 0) missing.push("שנות משכנתא");
  if ((dfcDateNumber_(criteria.endFrom) || dfcDateNumber_(criteria.endTo)) && indexes.endDate < 0) missing.push("תאריך סיום תקופת הביטוח");
  if (dfcNormalize_(criteria.insuredName) && indexes.insuredName < 0) missing.push("שם המבוטח");
  if (dfcNormalize_(criteria.idNumber) && indexes.idNumber < 0) missing.push("ת.ז.");
  if (dfcNormalize_(criteria.street) && indexes.street < 0) missing.push("רחוב");
  if (dfcNormalize_(criteria.city) && indexes.city < 0) missing.push("יישוב");
  if (dfcNormalize_(criteria.mobile) && indexes.mobile < 0) missing.push("נייד");
  if (missing.length) throw new Error("חסרות עמודות: " + missing.join(", "));
}

function dfcColumn_(headers, aliases) {
  const wanted = aliases.map(dfcHeaderKey_);
  for (let i = 0; i < headers.length; i++) {
    if (wanted.includes(dfcHeaderKey_(headers[i]))) return i;
  }
  return -1;
}

function dfcHeaderKey_(value) {
  return String(value || "")
    .trim()
    .replace(/[.\s_\-"'״׳:]/g, "")
    .toLowerCase();
}

function dfcNormalize_(value) {
  return String(value === null || value === undefined ? "" : value)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function dfcDateNumber_(value) {
  const key = dfcDateKey_(value);
  return key ? Number(key.replace(/-/g, "")) : null;
}

function dfcDateKey_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, "Asia/Jerusalem", "yyyy-MM-dd");
  }
  const text = String(value || "").trim();
  if (!text) return "";
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  const local = text.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2}|\d{4})$/);
  if (local) {
    let year = Number(local[3]);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    return `${year}-${String(local[2]).padStart(2, "0")}-${String(local[1]).padStart(2, "0")}`;
  }
  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) return Utilities.formatDate(parsed, "Asia/Jerusalem", "yyyy-MM-dd");
  return "";
}

function dfcHideRows_(sheet, rows) {
  if (!rows.length) return;
  let start = rows[0];
  let count = 1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i] === start + count) {
      count++;
    } else {
      sheet.hideRows(start, count);
      start = rows[i];
      count = 1;
    }
  }
  sheet.hideRows(start, count);
}

function dfcResultText_(result, isFilter) {
  if (!result || !result.success) return result && result.error ? result.error : "הפעולה נכשלה";
  if (!isFilter) return "הסינון נוקה בגיליון " + result.sheetName;
  return "נמצאו " + result.matched + " מתוך " + result.total + " שורות";
}
