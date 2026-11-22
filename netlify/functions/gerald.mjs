// Gerald — Jeff's assistant inside Life. Claude through Netlify's AI Gateway (no API key to manage).
// Each request gets a fresh fact sheet (to-dos, wish list, packages, Trim sales + incoming POs, bank accounts and
// recent transactions) and a small set of tools for changing Life's own lists. Gerald can't move money or touch
// the other apps; it only reads them.
import Anthropic from "@anthropic-ai/sdk";
import { store, json, clip, num, newId, readPrefix, signedIn } from "../lib/common.mjs";
import { trimData, moneyData } from "../lib/feeds.mjs";
import { guessCarrier, clean, checkPackages, parcelReady } from "../lib/parcel.mjs";

const MODEL = "claude-sonnet-5-5";
const $ = (n) => "$" + (+n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nowNY = () => new Date().toLocaleString("en-US", { timeZone: "America/New_York", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
const todayNY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

function factSheet({ todo, wish, pkgs, trim, money }) {
  const out = [];
  const open = todo.filter((t) => !t.done).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  out.push(`## To-do (${open.length} open)`);
  open.forEach((t) => out.push(`- [id ${t.id}] ${t.text}${t.due ? ` (due ${t.due})` : ""}${t.notes ? ` — ${t.notes}` : ""}`));
  const done = todo.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 10);
  if (done.length) out.push(`Recently done: ${done.map((t) => t.text).join("; ")}`);

  const wl = wish.filter((w) => !w.got);
  out.push(`\n## Wish list (${wl.length} items, ${$(wl.reduce((s, w) => s + (+w.price || 0), 0))})`);
  wl.forEach((w) => out.push(`- [id ${w.id}] ${w.name}${w.price ? " " + $(w.price) : ""} · ${w.priority} priority${w.url ? " · " + w.url : ""}${w.notes ? " — " + w.notes : ""}`));

  const act = pkgs.filter((p) => !p.delivered && !p.archived);
  out.push(`\n## Personal packages on the way (${act.length})`);
  act.forEach((p) => out.push(`- [id ${p.id}] ${p.label || "Package"}${p.from ? " from " + p.from : ""} · ${p.carrier} ${p.tracking} · ${p.status || "not checked yet"}${p.summary && p.summary !== p.status ? " · " + p.summary : ""}${p.expected ? " · expected " + p.expected : ""}`));
  const recent = pkgs.filter((p) => p.delivered).sort((a, b) => (b.deliveredAt || 0) - (a.deliveredAt || 0)).slice(0, 5);
  if (recent.length) out.push(`Recently delivered: ${recent.map((p) => `${p.label || p.tracking} (${new Date(p.deliveredAt).toLocaleDateString("en-US")})`).join("; ")}`);

  out.push(`\n## Trim Wellness (Jeff's supplement business; week runs Mon–Sun)`);
  if (trim.ready) {
    const r = (x) => `${$(x.sales)} from ${x.orders} orders${x.profit != null ? `, ${$(x.profit)} profit` : ""}`;
    out.push(`Today ${r(trim.daily)} · Yesterday ${r(trim.yesterday)} · Week to date ${r(trim.wtd)} (last week same point: ${$(trim.lastWeekToDate.sales)}) · Month to date ${$(trim.mtd.sales)} · Year to date ${$(trim.ytd.sales)}${trim.ytd.sheet ? ` (incl. ${$(trim.ytd.sheet)} from the pre-tracker P&L sheet)` : ""}`);
    out.push(`This week by day: ${trim.week.map((d) => `${d.day} ${$(d.sales)}`).join(", ")}`);
    const inc = trim.incoming || [];
    out.push(`Incoming purchase orders (${inc.length}):`);
    inc.forEach((po) => out.push(`- PO ${po.orderNo || "?"} from ${po.supplier || "?"} (${po.date || "no date"}, ${po.status}): ${(po.items || []).map((i) => `${i.qty}× ${i.name}`).join(", ") || "no items listed"}; packages: ${(po.packages || []).map((k) => `${k.carrier || ""} ${k.tracking} ${k.delivered ? "DELIVERED" : k.status || "no scans yet"}${k.summary ? " (" + k.summary + ")" : ""}`).join("; ") || "no tracking yet"}`));
  } else out.push(`Not available right now: ${trim.why}`);

  out.push(`\n## Money (Blumenfeld Finance / Plaid; Jeff's view)`);
  if (money.ready) {
    out.push(`Cash ${$(money.cash)} · Credit card balances owed ${$(money.credit)}${money.lastSync ? ` · banks last synced ${money.lastSync}` : ""}`);
    money.accounts.forEach((a) => out.push(`- ${a.name}${a.institution ? " (" + a.institution + ")" : ""}${a.mask ? " ··" + a.mask : ""}: ${a.type} ${$(a.balance)}${a.limit ? ` of ${$(a.limit)} limit` : ""}`));
    out.push(`Transactions, newest first (positive = money out, negative = money in):`);
    money.transactions.forEach((t) => out.push(`${t.date} | ${t.name} | ${t.amount} | ${t.account}${t.pending ? " | pending" : ""}`));
  } else out.push(`Not available right now: ${money.why}`);
  return out.join("\n");
}

const SYSTEM = (facts) => `You are Gerald, the personal assistant inside "Life", Jeff Blumenfeld's private app. Jeff is a district manager for an auto-service franchise and runs Trim Wellness, a supplement business, on the side; he's married to Lindsey and lives in Newville, PA.
Style: a discreet, sharp executive assistant. Lead with the answer. Short — usually 1–4 sentences or a tight list. Plain text with light markdown (bold, short lists) only. Casual is fine; swearing is fine if Jeff does. Numbers as $1,234.
Rules:
- Answer only from the data below or what Jeff tells you. If it isn't there, say so plainly and say where it would come from. Never invent amounts, dates or statuses.
- Do arithmetic carefully when asked for totals (e.g. spending at a merchant); state the date range you covered. The transaction list may not reach far back.
- Use the tools to change Life's lists when Jeff asks (add/complete to-dos, add wish-list items, track packages). Confirm what you did in one line. For anything outside these tools (moving money, editing Trim orders, the finance app), say you can't do that from here.
- Don't give investment, tax or legal verdicts; give the facts he needs.
It is now ${nowNY()} (America/New_York). Today's date: ${todayNY()}.

# Jeff's live data
${facts}`;

const TOOLS = [
  { name: "add_todo", description: "Add an item to Jeff's to-do list.", input_schema: { type: "object", properties: { text: { type: "string" }, due: { type: "string", description: "YYYY-MM-DD, optional" }, notes: { type: "string" } }, required: ["text"] } },
  { name: "complete_todo", description: "Mark a to-do done by its id.", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "add_wish", description: "Add an item to Jeff's wish list.", input_schema: { type: "object", properties: { name: { type: "string" }, price: { type: "number" }, url: { type: "string" }, priority: { type: "string", enum: ["high", "med", "low"] }, notes: { type: "string" } }, required: ["name"] } },
  { name: "track_package", description: "Start tracking a personal package by tracking number.", input_schema: { type: "object", properties: { tracking: { type: "string" }, label: { type: "string", description: "What it is" }, from: { type: "string", description: "Store or sender" } }, required: ["tracking"] } },
];

async function runTool(s, name, a) {
  if (name === "add_todo") {
    const id = newId();
    await s.setJSON("todo/" + id, { text: clip(a.text, 300), due: /^\d{4}-\d{2}-\d{2}$/.test(a.due || "") ? a.due : "", done: false, doneAt: null, notes: clip(a.notes, 1000) });
    return `Added to-do ${id}: ${a.text}${a.due ? " due " + a.due : ""}`;
  }
  if (name === "complete_todo") {
    const doc = await s.get("todo/" + clip(a.id, 40), { type: "json" });
    if (!doc) return "No to-do with that id.";
    await s.setJSON("todo/" + a.id, { ...doc, done: true, doneAt: Date.now() });
    return `Marked done: ${doc.text}`;
  }
  if (name === "add_wish") {
    const id = newId();
    await s.setJSON("wish/" + id, { name: clip(a.name, 200), url: /^https?:\/\//i.test(a.url || "") ? clip(a.url, 1000) : "", price: num(a.price), priority: ["high", "med", "low"].includes(a.priority) ? a.priority : "med", notes: clip(a.notes, 1000), got: false, gotAt: null });
    return `Added to wish list: ${a.name}`;
  }
  if (name === "track_package") {
    const tracking = clean(a.tracking).slice(0, 40);
    if (!tracking) return "That tracking number is empty.";
    const id = newId();
    await s.setJSON("pkgs/" + id, { tracking, carrier: guessCarrier(tracking), label: clip(a.label, 120), from: clip(a.from, 120), archived: false, createdAt: Date.now() });
    if (parcelReady()) await checkPackages(s, { read: false }).catch(() => {});
    return `Tracking ${tracking} (${guessCarrier(tracking).toUpperCase()})${a.label ? " — " + a.label : ""}`;
  }
  return "Unknown tool.";
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!(await signedIn(req))) return json({ error: "signin" }, 401);
  const has = (k) => !!(process.env[k] || Netlify.env.get(k));
  console.log("gerald env", JSON.stringify({ base: has("ANTHROPIC_BASE_URL"), key: has("ANTHROPIC_API_KEY"), gw: has("NETLIFY_AI_GATEWAY_URL"), gwKey: has("NETLIFY_AI_GATEWAY_KEY") }));

  const b = await req.json().catch(() => ({}));
  const history = (Array.isArray(b.messages) ? b.messages : []).slice(-16)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!history.length || history[history.length - 1].role !== "user") return json({ error: "Nothing to answer" }, 400);
  while (history.length && history[0].role !== "user") history.shift();

  const s = store();
  const [todo, wish, pkgs, trim, money] = await Promise.all([
    readPrefix(s, "todo/"), readPrefix(s, "wish/"), readPrefix(s, "pkgs/"),
    trimData().catch((e) => ({ ready: false, why: e.message })), moneyData(s, 400).catch((e) => ({ ready: false, why: e.message })),
  ]);

  // Netlify's AI Gateway normally fills in ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL; pass them explicitly in case
  // they're only visible through Netlify.env.
  const v = (k) => process.env[k] || Netlify.env.get(k) || undefined;
  const ai = new Anthropic({ apiKey: v("ANTHROPIC_API_KEY"), baseURL: v("ANTHROPIC_BASE_URL") });
  const messages = [...history];
  let changed = false, reply = "";
  try {
    for (let step = 0; step < 4; step++) {
      const r = await ai.messages.create({ model: MODEL, max_tokens: 900, system: SYSTEM(factSheet({ todo, wish, pkgs, trim, money })), tools: TOOLS, messages });
      const text = r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
      const uses = r.content.filter((c) => c.type === "tool_use");
      if (!uses.length || r.stop_reason !== "tool_use") { reply = text; break; }
      messages.push({ role: "assistant", content: r.content });
      const results = [];
      for (const u of uses) {
        const out = await runTool(s, u.name, u.input || {}).catch((e) => "Failed: " + e.message);
        results.push({ type: "tool_result", tool_use_id: u.id, content: out });
        changed = true;
      }
      messages.push({ role: "user", content: results });
      reply = text;
    }
  } catch (e) {
    console.error("gerald", e);
    return json({ error: "Gerald couldn’t answer just now. " + String(e.message || e).slice(0, 160) }, 502);
  }
  return json({ reply: reply || "Done.", changed });
};

export const config = { path: "/gerald" };
