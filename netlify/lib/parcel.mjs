// Package tracking through the Parcel app (same PARCEL_API_KEY as twtracker). Personal packages are added to the
// same Parcel account with a "Life:" label; twtracker ignores them because it only matches its own order numbers.
// Parcel allows 20 new deliveries a day and 20 status reads an hour for the whole account, shared with twtracker
// (which reads 8 times an hour), so Life adds at most 8 a day and reads twice an hour.
import { env, readPrefix } from "./common.mjs";
import { sendPush } from "./push.mjs";

const BASE = "https://api.parcel.app/external";
const LIFE_ADDS_PER_DAY = 8;
export const parcelReady = () => !!env("PARCEL_API_KEY");

export const clean = (t) => String(t || "").replace(/\s+/g, "").toUpperCase();
export function guessCarrier(t) {
  t = clean(t);
  if (/^TBA\d+$/.test(t)) return "amazon";
  if (/^1Z[0-9A-Z]{16}$/.test(t)) return "ups";
  if (/^(420\d{5}(\d{4})?)?9\d{19,25}$|^[A-Z]{2}\d{9}US$/.test(t)) return "usps";
  if (/^(\d{12}|\d{15}|\d{20})$/.test(t)) return "fedex";
  if (/^\d{10,11}$|^JJD\d+$/.test(t)) return "dhl";
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(t)) return "intl";
  return "usps";
}
const CODE = { usps: "usps", ups: "ups", fedex: "fedex", dhl: "dhl", intl: "usps" };
const sameNum = (a, b) => a === b || (a.length > 20 && b.length > 20 && (a.endsWith(b) || b.endsWith(a)));
export const STATUS = { 0: "Delivered", 1: "No recent updates", 2: "In transit", 3: "Ready for pickup", 4: "Out for delivery", 5: "Not found yet", 6: "Delivery attempt failed", 7: "Needs attention", 8: "Label created" };

async function call(path, opts = {}) {
  const r = await fetch(`${BASE}/${path}`, { ...opts, headers: { "api-key": env("PARCEL_API_KEY"), "content-type": "application/json", ...(opts.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (r.status === 429) return { limited: true };
  if (r.status === 401 || r.status === 403) throw new Error("Parcel didn’t accept the API key");
  return { ok: r.ok && d.success !== false, d };
}
async function deliveries() {
  const all = [];
  for (const mode of ["active", "recent"]) {
    const r = await call(`deliveries/?filter_mode=${mode}`);
    if (r.limited) return all.length ? all : null;
    if (!r.ok) throw new Error(r.d?.error_message || "Parcel couldn’t be reached");
    all.push(...(r.d.deliveries || []));
  }
  return all;
}

export async function checkPackages(s, opts = {}) {
  if (!parcelReady()) return { ready: false };
  const out = { ready: true, added: 0, updated: 0, waiting: 0, errors: 0, limited: false };
  const pkgs = (await readPrefix(s, "pkgs/")).filter((p) => !p.delivered && !p.archived && p.carrier !== "amazon");
  if (!pkgs.length) return out;

  const day = new Date().toISOString().slice(0, 10);
  const q = (await s.get("meta/parcel", { type: "json" })) || {};
  let used = q.day === day ? q.used || 0 : 0;
  for (const p of pkgs.filter((p) => p.parcelFor !== clean(p.tracking))) {
    if (used >= LIFE_ADDS_PER_DAY) { out.waiting++; continue; }
    const n = clean(p.tracking);
    const r = await call("add-delivery/", { method: "POST", body: JSON.stringify({ tracking_number: n, carrier_code: CODE[p.carrier] || "usps", description: ("Life: " + (p.label || "Package")).slice(0, 80) }) });
    if (r.limited) { used = LIFE_ADDS_PER_DAY; out.waiting++; continue; }
    used++;
    const upd = { ...p, parcelFor: n };
    if (!r.ok && !/already/i.test(r.d?.error_message || "")) { upd.error = String(r.d?.error_message || "Parcel didn’t take this number").slice(0, 200); out.errors++; }
    else { delete upd.error; out.added++; }
    await save(s, upd);
    Object.assign(p, upd);
  }
  await s.setJSON("meta/parcel", { day, used });

  if (opts.read === false) return out;
  const got = await deliveries();
  if (!got) { out.limited = true; return out; }
  const found = got.map((x) => ({ ...x, n: clean(x.tracking_number) }));
  for (const p of pkgs) {
    const hit = found.find((x) => sameNum(x.n, clean(p.tracking)));
    if (!hit) continue;
    const code = Number(hit.status_code);
    const events = (Array.isArray(hit.events) ? hit.events : []).slice(0, 25).map((e) => ({ event: String(e.event || "").slice(0, 200), location: String(e.location || "").slice(0, 120), date: String(e.date || "").slice(0, 40) }));
    const latest = events[0] || {};
    const status = STATUS[code] || "Checking";
    const summary = [latest.event, latest.location].filter(Boolean).join(" · ") || status;
    const upd = { ...p, statusCode: code, status, summary, events, checkedAt: Date.now() };
    if (hit.date_expected) upd.expected = String(hit.date_expected).slice(0, 40);
    if (code === 0) { upd.delivered = true; upd.deliveredAt = Date.parse(latest.date) || Date.now(); }
    const changed = p.statusCode !== code || p.summary !== summary;
    await save(s, upd);
    out.updated++;
    // Alert on every change after the first reading; on the first reading only if it's already notable.
    if (changed && (p.statusCode !== undefined || [0, 3, 4, 6, 7].includes(code))) {
      const head = code === 0 ? "Package Delivered" : code === 4 ? "Out for Delivery" : code === 6 || code === 7 ? "Delivery Exception" : "Package Update";
      await sendPush(s, { title: head, body: `${p.label || "Package"} — ${summary}`, tag: "pkg-" + p.id, url: "/#pkgs" });
    }
  }
  return out;
}

async function save(s, p) {
  const { id, ...rest } = p;
  await s.setJSON("pkgs/" + id, rest);
}
