// editWindow.js -- item 34 (Gary, 28 Oct 2026): a person may edit the text of
// TODAY's or YESTERDAY's act, nothing older. Same window as back-filling a
// missed day. Dates are the phone's calendar dates ("YYYY-MM-DD").

/** The calendar day before `ymd` ("2026-11-01" -> "2026-10-31"). */
export function dayBefore(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** True when the act dated `actDate` may be edited on `today`. */
export function canEditAct(actDate, today) {
  if (!actDate || !today) return false;
  return actDate === today || actDate === dayBefore(today);
}
