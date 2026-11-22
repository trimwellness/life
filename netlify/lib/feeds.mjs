// Live data from the other apps: Trim Wellness (twtracker /life-feed) and Blumenfeld Finance (Plaid).
import { env } from "./common.mjs";

// Trim Wellness totals come from twtracker's read-only /life-feed.
export async function trimData() {
  const url = env("TRIM_FEED_URL") || "https://twtracker.netlify.app/life-feed", key = env("LIFE_FEED_KEY");
  if (!key) return ({ ready: false, why: "LIFE_FEED_KEY isn’t set" });
  const r = await fetch(url, { headers: { "x-life-key": key } }).catch(() => null);
  if (!r) return ({ ready: false, why: "twtracker couldn’t be reached" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return ({ ready: false, why: d.error || `twtracker said ${r.status}` });
  return ({ ready: true, ...d });
}

// Bank + Venmo come from Blumenfeld Finance (Plaid lives there). Life signs in to that app as Jeff with his own
// finance PIN (FINANCE_PIN) and reads the same account data his finance screens show, so his privacy settings apply.
const FIN = () => (env("FINANCE_URL") || "https://chipper-narwhal-7a0883.netlify.app").replace(/\/+$/, "");
async function finLogin(s) {
  const r = await fetch(FIN() + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ who: env("FINANCE_WHO") || "jeff", pin: env("FINANCE_PIN") }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.token) throw new Error(d.error || `Finance sign-in failed (${r.status})`);
  await s.setJSON("meta/fin-token", { token: d.token, at: Date.now() });
  return d.token;
}
export async function moneyData(s, txLimit = 60) {
  if (!env("FINANCE_PIN")) return ({ ready: false, why: "Add FINANCE_PIN (your Blumenfeld Finance PIN) on the blumenfeld-life project" });
  try {
    let tok = (await s.get("meta/fin-token", { type: "json" }))?.token || (await finLogin(s));
    const get = (t) => fetch(FIN() + "/api/plaid/data", { headers: { authorization: "Bearer " + t } });
    let r = await get(tok);
    if (r.status === 401) r = await get((tok = await finLogin(s)));
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return ({ ready: false, why: d.error || `Finance app said ${r.status}` });
    const A = d.accounts || [];
    const bal = (a) => (a.type === "depository" ? a.available ?? a.current : a.current) ?? 0;
    const acct = Object.fromEntries(A.map((a) => [a.id, a]));
    const accounts = A.map((a) => ({ id: a.id, name: a.name || a.officialName || "Account", institution: a.institution || "", mask: a.mask || "",
      type: a.type === "depository" || a.type === "credit" ? a.type : "other", subtype: a.subtype || "", balance: bal(a), limit: a.limit ?? null }));
    const transactions = (d.transactions || []).slice().sort((x, y) => String(y.date).localeCompare(String(x.date))).slice(0, txLimit)
      .map((t) => ({ name: t.name, date: t.date, amount: t.amount, pending: !!t.pending, account: acct[t.accountId] ? `${acct[t.accountId].name}${acct[t.accountId].mask ? " ··" + acct[t.accountId].mask : ""}` : "" }));
    const sum = (f) => A.filter(f).reduce((t, a) => t + (+bal(a) || 0), 0);
    return ({ ready: true, lastSync: d.lastSync || null, cash: sum((a) => a.type === "depository"), credit: sum((a) => a.type === "credit"), accounts, transactions });
  } catch (e) {
    return ({ ready: false, why: String(e.message || e).slice(0, 200) });
  }
}

