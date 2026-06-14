// Swedish date/time/number formatting. Kickoffs are UTC; we render in
// Europe/Stockholm so the pool sees local times.
const TZ = "Europe/Stockholm";

const timeFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayKeyFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const weekdayFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, weekday: "short" });
const dayMonthFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, day: "numeric", month: "short" });
const fullFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });

export const svTime = (d: Date) => timeFmt.format(d);
export const svDateKey = (d: Date) => dayKeyFmt.format(d); // YYYY-MM-DD
export const svWeekday = (d: Date) => weekdayFmt.format(d).replace(".", "");
export const svDayMonth = (d: Date) => dayMonthFmt.format(d).replace(".", "");
export const svFullDate = (d: Date) => fullFmt.format(d);

export function svDayLabel(d: Date, now = new Date()): string {
  const k = svDateKey(d);
  const today = svDateKey(now);
  const tomorrow = svDateKey(new Date(now.getTime() + 86400000));
  const yesterday = svDateKey(new Date(now.getTime() - 86400000));
  if (k === today) return "Idag";
  if (k === tomorrow) return "Imorgon";
  if (k === yesterday) return "Igår";
  const wd = svWeekday(d);
  return wd.charAt(0).toUpperCase() + wd.slice(1) + " " + svDayMonth(d);
}

export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]/g, "");
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const kr = (n: number) => n.toLocaleString("sv-SE") + " kr";
