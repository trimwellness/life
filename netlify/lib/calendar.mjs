// Calendar: events, repeat rules, and push reminders. Times are Jeff's local time (America/New_York).
import { clip } from "./common.mjs";
import { sendPush } from "./push.mjs";

export const TZ = "America/New_York";
export const KINDS = ["work", "med", "appt", "personal", "bill", "other"];
export const REPEATS = ["none", "daily", "weekdays", "days", "weekly", "biweekly", "monthly", "yearly"];
export const REMINDERS = [0, 5, 15, 30, 60, 120, 1440, 2880, 10080];
const D = /^\d{4}-\d{2}-\d{2}$/, T = /^([01]\d|2[0-3]):[0-5]\d$/;

export function cleanEvent(b, old = {}) {
  const rem = Array.isArray(b.reminders) ? [...new Set(b.reminders.map(Number).filter((x) => REMINDERS.includes(x)))].sort((a, c) => a - c) : [0, 1440];
  const done = Array.isArray(b.done) ? b.done.filter((x) => D.test(x)).slice(-400) : old.done || [];
  return {
    title: clip(b.title, 140) || "Event",
    kind: KINDS.includes(b.kind) ? b.kind : "other",
    date: D.test(b.date || "") ? b.date : localDate(Date.now()),
    time: T.test(b.time || "") ? b.time : "",
    end: T.test(b.end || "") ? b.end : "",
    repeat: REPEATS.includes(b.repeat) ? b.repeat : "none",
    days: Array.isArray(b.days) ? [...new Set(b.days.map(Number).filter((x) => x >= 0 && x <= 6))].sort() : [],
    until: D.test(b.until || "") ? b.until : "",
    reminders: rem,
    location: clip(b.location, 200),
    notes: clip(b.notes, 1500),
    done,
    createdAt: old.createdAt || Date.now(),
  };
}

// ---- time helpers (local New York time <-> UTC)
const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
function parts(ms) { const o = {}; for (const p of fmt.formatToParts(new Date(ms))) o[p.type] = p.value; return o; }
const offsetMin = (ms) => { const p = parts(ms); return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000) / 60000; };
export function localToUtc(date, time = "09:00") {
  const [y, m, d] = date.split("-").map(Number), [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const t1 = guess - offsetMin(guess) * 60000;
  return guess - offsetMin(t1) * 60000;
}
export function localDate(ms) { const p = parts(ms); return `${p.year}-${p.month}-${p.day}`; }
const addDays = (date, n) => { const t = new Date(date + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const dow = (date) => new Date(date + "T12:00:00Z").getUTCDay();

export function occursOn(ev, d) {
  if (d < ev.date || (ev.until && d > ev.until)) return false;
  switch (ev.repeat) {
    case "daily": return true;
    case "weekdays": { const w = dow(d); return w > 0 && w < 6; }
    case "days": return (ev.days || []).includes(dow(d));
    case "weekly": return dow(d) === dow(ev.date);
    case "biweekly": return dow(d) === dow(ev.date) && Math.round((Date.parse(d) - Date.parse(ev.date)) / 864e5) % 14 === 0;
    case "monthly": return d.slice(8) === ev.date.slice(8);
    case "yearly": return d.slice(5) === ev.date.slice(5);
    default: return d === ev.date;
  }
}
export function occurrences(ev, from, to) { const out = []; for (let d = from < ev.date ? ev.date : from; d <= to; d = addDays(d, 1)) if (occursOn(ev, d)) out.push(d); return out; }

const clock = (t) => { const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
const KIND_NAME = { work: "Work", med: "Medication", appt: "Appointment", personal: "Personal", bill: "Bill", other: "" };
function dayWord(d, now) { const t = localDate(now); if (d === t) return "Today"; if (d === addDays(t, 1)) return "Tomorrow"; return new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }); }
// Notification text, written like a calendar app's: title = what, body = when · where.
function reminderText(ev, d, off, now) {
  const span = ev.time ? clock(ev.time) + (ev.end ? ` – ${clock(ev.end)}` : "") : "All day";
  let when = off > 0 && off < 1440 ? `Starts in ${off >= 60 ? `${off / 60} hour${off === 60 ? "" : "s"}` : `${off} minutes`} · ${span}` : `${dayWord(d, now)} · ${span}`;
  if (ev.kind === "med") return { title: "Medication Reminder", body: `${ev.title} · ${ev.time ? clock(ev.time) : "Today"}` };
  if (ev.kind === "bill") return { title: "Payment Due", body: `${ev.title} · ${dayWord(d, now)}` };
  return { title: ev.title, body: [when, ev.location].filter(Boolean).join(" · ") };
}

// Runs every 5 minutes: sends any reminder whose time has come (and hasn't been sent).
export { reminderText };
export async function runReminders(s, now = Date.now()) {
  const { blobs } = await s.list({ prefix: "events/" });
  const evs = (await Promise.all(blobs.map(async (b) => ({ id: b.key.slice(7), ...(await s.get(b.key, { type: "json" })) })))).filter((e) => e.date);
  const sent = (await s.get("meta/rem-sent", { type: "json" })) || {};
  const today = localDate(now), from = addDays(today, -1), to = addDays(today, 8);
  let n = 0;
  for (const ev of evs) {
    for (const d of occurrences(ev, from, to)) {
      if ((ev.done || []).includes(d)) continue;
      const at = localToUtc(d, ev.time || "09:00");
      for (const off of ev.reminders || []) {
        const fire = at - off * 60000, key = `${ev.id}|${d}|${off}`;
        if (fire > now || fire < now - 20 * 60000 || sent[key]) continue;
        await sendPush(s, { ...reminderText(ev, d, off, now), tag: key, url: "/#cal" });
        sent[key] = now; n++;
      }
    }
  }
  for (const k of Object.keys(sent)) if (sent[k] < now - 3 * 864e5) delete sent[k];
  if (n) await s.setJSON("meta/rem-sent", sent);
  return { checked: evs.length, sent: n };
}

// Next N days as plain text lines, for Gerald.
export function agendaLines(evs, days = 14, now = Date.now()) {
  const today = localDate(now), to = addDays(today, days), rows = [];
  for (const ev of evs) for (const d of occurrences(ev, today, to)) rows.push([d + (ev.time || "00:00"), `- ${d}${ev.time ? " " + clock(ev.time) : " (all day)"}: ${ev.title} [${ev.kind}${ev.repeat !== "none" ? ", repeats " + (ev.repeat === "days" ? "on " + (ev.days || []).map((x) => "Sun Mon Tue Wed Thu Fri Sat".split(" ")[x]).join("/") : ev.repeat) : ""}]${ev.location ? " @ " + ev.location : ""}${(ev.done || []).includes(d) ? " — done" : ""} (event ${ev.id})`]);
  return rows.sort((a, b) => a[0].localeCompare(b[0])).map((r) => r[1]);
}
