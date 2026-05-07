# PoolSync PRO v2.5 — תמצית זיכרון מלאה

**עדכון:** 07.05.2026 | **גרסה:** v2.5 | **מצב:** production-ready

---

## 📋 סיכום הפרויקט

**PoolSync PRO** — מערכת ניהול בריכות שחייה לחברות ישראליות.
- **Frontend:** React 18 + Vite + Tailwind CSS (App.jsx — 3183 שורות)
- **Backend:** Google Apps Script (galileo-script-v2.js)
- **Database:** Google Sheets (שיטס נפרד לכל לקוח)
- **Hosting:** Render (CDN)
- **Notifications:** OneSignal (push alerts)

---

## 🗂️ קבצים עיקריים

### Frontend (GitHub)
| קובץ | מיקום | תוכן |
|------|------|------|
| **App.jsx** | `src/App.jsx` | אפליקציה React כוללת (הכל בקובץ אחד) |
| **main.jsx** | `src/main.jsx` | entry point |
| **index.html** | root | HTML template |
| **vite.config.js** | root | Vite config |
| **package.json** | root | npm packages |
| **sw.js** | `public/sw.js` | Service Worker |
| **manifest.json** | `public/manifest.json` | PWA manifest |

### Backend (Apps Script — נפרד)
| קובץ | שם | תוכן |
|------|------|------|
| **galileo-script-v2.js** | POOL SYS 1 | 517 שורות |
| | poolsys1@gmail.com | ניהול sheets + שליחת דוחות |

### Sheets (Google)
| שם | ID | שימוש |
|---|---|---|
| **Default** | 1am5BQh6oesQXoJgdeTpiDTIEuzf8UdfWotPXSoqOLiU | דוחות ראשיים |
| **MGMT** | 17jNBWSAkW17zfz4o2gY3wOsERa3_NAgSZ3b9HPkNspk | ניהול רישיונות |
| **Template** | 1NthErqOJOFHJ482q3zg2daFX9SGCFeByXjdoZxvV-no | עותק ללקוחות |

---

## 🔑 קונפיגורציה חיונית

### App.jsx (שורות קריטיות)

**שורה 51:** גרסה
```javascript
const APP_VERSION = "v2.5 · 07.05.2026";
```

**שורה 50:** Apps Script URL
```javascript
const FIXED_SCRIPT_URL = "https://script.google.com/macros/s/YOUR_ID/exec";
```

**שורה 489:** OneSignal App ID
```javascript
appId: "YOUR_ONESIGNAL_APP_ID",
```

**שורה 2494:** OneSignal notify button
```javascript
notifyButton: { enable: false }, // login only
```

### galileo-script-v2.js (פונקציות חיוניות)

- **saveLicense** (שורה 32) → יוצר sheets אוטומטית
- **setupClientSheet()** (שורה 518) → יוצר 7 טאבים
- **ensureColumns()** (שורה 570) → מוסיף עמודות חסרות
- **saveReport** (שורה 249) → שומר דוח + שולח mail

---

## 👥 תפקידים וגישה

| תפקיד | גישה | הערות |
|-------|------|------|
| **Super Admin** | ⚙️ שמאל תחתון | סיסמה: 039076914 |
| **admin** | פאנל ניהול מלא | רישיונות, משתמשים |
| **operator** | לוח יומי + דוחות | משימות, נוטיפיקציות |

### Demo Users (בגיליון Template)
```
admin / 1234 / admin / מנהל / 👔
avi / 1234 / operator / אבי / 🏊
or / 123456 / operator / אור / 🌊 (סליידרים גדולים!)
```

---

## 📊 טאבים בגיליון לקוח (7 סה"כ)

1. **Users** (משתמשים) — עמודות: username, password, role, name, icon, welcomeMessage, phone, welcomeImage, welcomeInstagram
2. **לקוחות** — עמודות: שם, טלפון, כתובת, qr_url, קוד_שער, **סוג_בריכה**, **ימים_קבועים**, **מפעיל_קבוע**
3. **דוחות** — עמודות: תאריך, מפעיל, לקוח, כלור, pH, מלח, גובה_מים, צלילות, פס_שומן, זרימה, דגם_אלקטרודה, סריאלי, תאריך_ניקיון, תאריך_הבא, ציוד, מצב, פירוט, הגבלה, הערות, **chlora**, **hth**, **phUp**, **acidLiters**
4. **משימות** — id, תאריך, לקוח, מפעילים, סטטוס, changeLog
5. **ציוד_לקוחות** — לקוח, חומצת_מלח, מעלה_pH, שקי_מלח, כמות, עודכן
6. **שעות_עבודה** — id, מפעיל, תאריך, התחלה, סיום, סה"כ
7. **תקלות_מפעילים** — id, מפעיל, לקוח, תיאור, דחיפות, סטטוס, תגובת_אדמין, תאריך

---

## 🎨 דיזיין ורעיון

### צבעים (Tailwind)
- **bg:** slate-950 (רקע כהה)
- **text:** white (#fff)
- **primary:** blue (C.blue = #1565c0)
- **accent:** cyan-400/500
- **roles:** amber (admin), emerald (instructor), rose (errors)

### תמונות
- **Logo:** Octopus בתוך מטבע כחול (base64 split 70-char chunks)
- **Favicon:** ico ישיר ב-HTML

### RTL
- כל העברית בעברית מלאה
- `dir="rtl"` בדיו ראשי

---

## 🔔 התראות (OneSignal)

### נוטיפיקציות ממומשות

1. **דוח שמור** — למפעיל
   - "✅ דוח בוצע: לקוח"
   - מדידות: כלור pH

2. **משימה חדשה** — למפעיל מסויים
   - "📋 משימות חדשות בשבילך"
   - רשימת לקוחות + תאריך

3. **תזכורת 12:00** — למפעיל
   - "⏰ סגור שעון עבודה"
   - בשעה 12:00 (צהריים) ו-16:00

4. **כפתור הרשמה** — ברכיב login בלבד
   - `notifyButton: { enable: false }` (מוסתר בעבודה)
   - נמצא בשמאל תחתון של Login

---

## 📱 מסכים (Screens)

| מסך | תפקיד | גישה |
|-----|-------|------|
| **login** | התחברות + אפשרות OneSignal | הכל |
| **form** | הזנת דוח | operator + admin |
| **done** | סיום דוח + קישור WhatsApp | operator |
| **dashboard** | לוח יומי | operator |
| **admin** | ניהול (רישיונות, משימות, דוחות) | admin |

---

## 🚀 ניפוץ וקישורים

### URLs
- **Live:** https://galileo-v2.onrender.com
- **GitHub:** https://github.com/OFFERSHAHAR/galileo-v2
- **Apps Script:** poolsys1@gmail.com

### License Key
- Format: `PSP-XXXX-XXXX-XXXX`
- בדיקה מול MGMT Sheet → טאב "רישיונות"

---

## 🛠️ פונקציות חשובות (App.jsx)

| פונקציה | מטרה | שורה |
|---------|------|------|
| **myDayClients()** | לקוחות לפי יום + מפעיל | 1150 |
| **dayClientProfiles()** | לקוחות + משימות | 1158 |
| **sendNotification()** | OneSignal push | 504 |
| **handleLogout()** | התחרור | 1254 |
| **buildWA()** | וטסאפ טקסט | 1270 |
| **sheetCall()** | קריאה ל-Apps Script | 1300 |

---

## 📝 פעולות (Actions) — Apps Script

| Action | פונקציה |
|--------|--------|
| saveLicense | שמירת רישיון + setup sheet |
| getUsers | קריאת משתמשים |
| getClients | קריאת לקוחות |
| saveReport | שמירת דוח |
| saveOperatorIssue | תקלה מפעיל |
| getOperatorIssues | קריאת תקלות |
| updateOperatorIssue | עדכון תקלה |
| getFreeClients | לקוחות חופשיים |
| saveSupplyDB | שמירת ציוד |
| saveTasks | משימות |

---

## 🔐 localStorage Keys

```javascript
galileo_license      // מפתח
galileo_company      // שם
galileo_user         // משתמש מחובר
galileo_sheet_id     // Sheet ID
galileo_cache        // דוחות local
galileo_worklogs     // שעון עבודה
galileo_workstart    // התחלה
galileo_super_pass   // סיסמה Super Admin
```

---

## ✨ בעדכונים האחרונים (v2.5)

✅ OneSignal התראות  
✅ משימות → לקוחות חופשיים (דוח ידני)  
✅ Collapsible סליידרים (רק מדידות חשובות)  
✅ יצירה אוטומטית של sheets  
✅ תזכורת 12:00 סגור שעון  
✅ סוגי בריכה (מלח, כלור, גלישה, סקימר)  
✅ ימים קבועים וציוד פרטי  

---

## 🔧 Troubleshooting

| בעיה | פתרון |
|------|--------|
| דוחות כפולים | `_fromSheet` flag בקוד |
| סליידר מתאפס | `phUpSupply` vs `phUp` (שם שונה) |
| משתמש לא רואה משימות | בדוק `regularDays` בגיליון |
| OneSignal לא עובד | החלף `YOUR_ONESIGNAL_APP_ID` |
| Render לא מתעדכן | `git push` + 2-3 דקות |

---

## 📞 צוות ופרטים

- **Repo Owner:** OFFERSHAHAR
- **Apps Script Account:** poolsys1@gmail.com
- **Render:** galileo-v2.onrender.com
- **Deploy:** GitHub → Render (automatic)

---

## 📚 קבצי תיעוד

1. **CLAUDE.md** — הנחיות פנימיות
2. **DOWNLOAD_INSTRUCTIONS.txt** — הורדה קבצים
3. **GITHUB_CMD_SIMPLE.txt** — CMD פקודות
4. **PROJECT_SETUP.md** — setup מקומי
5. **FULL_DOWNLOAD_GUIDE.txt** — הנחיות מלאות
6. **MEMORY_FULL.md** — קובץ זה!

---

## 🎯 התחלה מהר

```bash
# Clone
git clone https://github.com/OFFERSHAHAR/galileo-v2.git
cd galileo-v2

# Install
npm install

# Edit lines 50, 489 in src/App.jsx

# Run
npm run dev

# Build
npm run build
```

**זהו! כל המידע שצריך לצ'אט חדש.**

