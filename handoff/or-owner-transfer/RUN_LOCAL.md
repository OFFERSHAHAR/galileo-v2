# הרצה מקומית

## דרישות

- Node.js מותקן במחשב.
- גישה לאינטרנט בזמן `npm install`.

## הרצה

```bash
cd source
npm install
npm run dev
```

לאחר מכן פותחים את הכתובת שמופיעה בטרמינל.

## Build לבדיקה לפני העלאה

```bash
npm run build
```

אם build עובר בלי שגיאות, הקבצים הסטטיים נוצרים בתיקיית `dist`.

## Google Apps Script

אם יש שינוי ב־`apps-script/Code.js`:

1. לפתוח את פרויקט Google Apps Script.
2. להחליף את תוכן `Code.gs` בתוכן הקובץ.
3. לשמור.
4. לבצע Deploy חדש.
5. לוודא שהאפליקציה משתמשת בכתובת Web App הנכונה.
