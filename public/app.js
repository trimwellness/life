// Life — Jeff's master app. One page; sections open from the home tiles (#todo, #wish, #guns, #trim, #pkgs, #money, #photos).
(() => {
  const $app = document.getElementById("app");
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} },
  };
  let token = store.get("life.token");
  let D = { todo: [], wish: [], guns: [], pkgs: [], status: {} };
  let trim = null, money = null;
  const ui = { open: {}, todoShowDone: false, wishShowGot: false, pkgShowOld: false };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const usd = (n, cents = true) => "$" + (+n || 0).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  const sumItems = (g) => (g.items || []).reduce((t, i) => t + (+i.price || 0), 0);
  const todayKey = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const fmtDay = (k) => new Date(k + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const ago = (t) => { if (!t) return ""; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? m + "m ago" : m < 1440 ? Math.round(m / 60) + "h ago" : Math.round(m / 1440) + "d ago"; };

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  async function api(path, opts = {}) {
    const r = await fetch("/api/" + path, {
      method: opts.method || "GET",
      headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && d.error === "signin") { token = null; store.set("life.token", null); renderLogin(); throw new Error("signin"); }
    if (!r.ok) throw new Error(d.error || "Something went wrong");
    return d;
  }

  // ---------- Sign in: no PIN. The private link (…/#k=KEY) signs this device in once, for good. ----------
  function renderLogin(err = "") {
    $app.innerHTML = `<div class="login"><h1>Life</h1><div class="sub">Open Life from your private link on this device once and it stays signed in.</div>
      <div class="err" style="margin-top:14px">${esc(err)}</div></div>`;
  }
  async function linkSignIn() {
    const m = location.hash.match(/^#k=([^&]+)/);
    if (!m) return;
    history.replaceState(null, "", location.pathname);
    try { const d = await api("login", { method: "POST", body: { key: decodeURIComponent(m[1]) } }); token = d.token; store.set("life.token", token); }
    catch (x) { renderLogin(x.message); throw x; }
  }

  // ---------- Data ----------
  async function boot() {
    if (!token) return renderLogin();
    try { D = await api("all"); } catch (e) { if (e.message !== "signin") $app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    render();
    loadTrim(); loadMoney();
  }
  async function loadTrim() { try { trim = await api("trim"); } catch (_) { trim = { ready: false, why: "Couldn’t load" }; } if (["", "home", "trim"].includes(route())) render(); }
  async function loadMoney() { try { money = await api("money"); } catch (_) { money = { ready: false, why: "Couldn’t load" }; } if (["", "home", "money"].includes(route())) render(); }

  async function save(col, doc) {
    const { id, ...body } = doc;
    const saved = id ? await api(`c/${col}/${id}`, { method: "PUT", body }) : await api(`c/${col}`, { method: "POST", body });
    const list = D[col], i = list.findIndex((x) => x.id === saved.id);
    i >= 0 ? (list[i] = saved) : list.push(saved);
    render();
    return saved;
  }
  async function remove(col, id) {
    await api(`c/${col}/${id}`, { method: "DELETE" });
    D[col] = D[col].filter((x) => x.id !== id);
    render();
  }

  // ---------- Routing ----------
  const route = () => location.hash.replace(/^#/, "");
  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); if (route() === "trim") loadTrim(); });
  const top = (title, right = "") => `<div class="top"><button class="back" data-go="">‹ Life</button><div class="grow" style="flex:1"></div>${right}</div><h1>${title}</h1>`;

  function render() {
    const r = route();
    const page = { todo: pTodo, wish: pWish, guns: pGuns, trim: pTrim, pkgs: pPkgs, money: pMoney, photos: pPhotos }[r] || pHome;
    $app.innerHTML = page();
  }

  // ---------- Home ----------
  function pHome() {
    const open = D.todo.filter((t) => !t.done), dueToday = open.filter((t) => t.due && t.due <= todayKey()).length;
    const wishes = D.wish.filter((w) => !w.got);
    const active = D.pkgs.filter((p) => !p.delivered && !p.archived), ofd = active.filter((p) => p.statusCode === 4).length;
    const gunVal = D.guns.reduce((t, g) => t + sumItems(g), 0), gunCount = D.guns.filter((g) => g.group === "firearm").length;
    const hr = new Date().getHours(), hello = hr < 12 ? "Morning" : hr < 17 ? "Afternoon" : "Evening";
    const moneyTile = money?.ready ? `<div class="big money">${usd(money.cash ?? 0, false)}</div><div class="sm">Cash across accounts</div>` : `<div class="sm">${esc(money?.why || "Loading…")}</div>`;
    const trimTile = trim?.ready ? `<div class="big money">${usd(trim.daily.sales, false)}</div><div class="sm">Today · ${usd(trim.wtd.sales, false)} this week</div>` : `<div class="sm">${esc(trim?.why || "Loading…")}</div>`;
    return `<h1>${hello}, Jeff</h1><div class="sub">${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
    <div class="grid">
      <a class="tile" href="#money"><div><div class="ic">🏦</div><div class="nm">Money</div></div>${moneyTile}</a>
      <a class="tile" href="#trim"><div><div class="ic">💊</div><div class="nm">Trim Sales</div></div>${trimTile}</a>
      <a class="tile" href="#todo"><div><div class="ic">✅</div><div class="nm">To-Do</div></div><div><div class="big">${open.length}</div><div class="sm">${dueToday ? dueToday + " due today or late" : "open"}</div></div></a>
      <a class="tile" href="#pkgs"><div><div class="ic">📦</div><div class="nm">Packages</div></div><div><div class="big">${active.length}</div><div class="sm">${ofd ? ofd + " out for delivery" : "on the way"}</div></div></a>
      <a class="tile" href="#wish"><div><div class="ic">🎁</div><div class="nm">Wish List</div></div><div><div class="big">${wishes.length}</div><div class="sm">${usd(wishes.reduce((t, w) => t + (+w.price || 0), 0), false)} total</div></div></a>
      <a class="tile" href="#guns"><div><div class="ic">🔒</div><div class="nm">Gun Ledger</div></div><div><div class="big money">${usd(gunVal, false)}</div><div class="sm">${gunCount} firearms</div></div></a>
      <a class="tile" href="#photos"><div><div class="ic">🖼️</div><div class="nm">Photo Vault</div></div><div class="sm">OneDrive folders</div></a>
    </div>`;
  }

  // ---------- To-Do ----------
  function pTodo() {
    const open = D.todo.filter((t) => !t.done).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
    const done = D.todo.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    const today = todayKey();
    const row = (t) => `<div class="item ${t.done ? "done" : ""}">
      <button class="chk ${t.done ? "on" : ""}" data-act="todo-toggle" data-id="${t.id}">${t.done ? "✓" : ""}</button>
      <div class="grow" data-act="todo-edit" data-id="${t.id}" style="cursor:pointer"><div class="t">${esc(t.text)}</div>
      ${t.due ? `<div class="sub" style="color:${!t.done && t.due < today ? "var(--bad)" : !t.done && t.due === today ? "var(--warn)" : ""}">${t.due === today ? "Today" : fmtDay(t.due)}</div>` : ""}</div></div>`;
    return top("To-Do") + `
      <form class="card" data-form="todo-add"><div class="row"><input name="text" placeholder="Add a to-do…" class="grow" required>
      <button class="btn">Add</button></div><div class="row" style="margin-top:8px"><input name="due" type="date" style="max-width:190px"><span class="sub">optional due date</span></div></form>
      ${open.length ? `<div class="list">${open.map(row).join("")}</div>` : `<div class="empty">All clear.</div>`}
      ${done.length ? `<h3><button class="icon" data-act="todo-showdone" style="font-size:13px;color:var(--mute)">${ui.todoShowDone ? "▾" : "▸"} Done (${done.length})</button></h3>${ui.todoShowDone ? `<div class="list">${done.map(row).join("")}</div>` : ""}` : ""}`;
  }

  // ---------- Wish list ----------
  function pWish() {
    const pr = { high: 0, med: 1, low: 2 };
    const open = D.wish.filter((w) => !w.got).sort((a, b) => pr[a.priority] - pr[b.priority] || (b.price || 0) - (a.price || 0));
    const got = D.wish.filter((w) => w.got);
    const pill = { high: '<span class="pill bad">High</span>', med: '<span class="pill warn">Medium</span>', low: '<span class="pill">Low</span>' };
    const row = (w) => `<div class="item ${w.got ? "done" : ""}">
      <button class="chk ${w.got ? "on" : ""}" data-act="wish-toggle" data-id="${w.id}" title="Got it">${w.got ? "✓" : ""}</button>
      <div class="grow" data-act="wish-edit" data-id="${w.id}" style="cursor:pointer"><div class="t">${esc(w.name)}</div>
      <div class="sub">${w.price ? usd(w.price) + " · " : ""}${w.got ? "Got it" : pill[w.priority]}${w.notes ? " · " + esc(w.notes) : ""}</div></div>
      ${w.url ? `<a class="btn ghost sm" href="${esc(w.url)}" target="_blank" rel="noopener">Open</a>` : ""}</div>`;
    return top("Wish List", `<button class="btn sm" data-act="wish-new">+ Add</button>`) + `
      <div class="sub">${open.length} items · ${usd(open.reduce((t, w) => t + (+w.price || 0), 0))}</div><div style="height:12px"></div>
      ${open.length ? `<div class="list">${open.map(row).join("")}</div>` : `<div class="empty">Nothing on the list yet.</div>`}
      ${got.length ? `<h3><button class="icon" data-act="wish-showgot" style="font-size:13px;color:var(--mute)">${ui.wishShowGot ? "▾" : "▸"} Got it (${got.length})</button></h3>${ui.wishShowGot ? `<div class="list">${got.map(row).join("")}</div>` : ""}` : ""}`;
  }
  function wishForm(w = { priority: "med" }) {
    sheet(`<h2>${w.id ? "Edit" : "Add"} wish</h2><form data-form="wish-save" data-id="${w.id || ""}">
      <label>Item</label><input name="name" value="${esc(w.name)}" required>
      <label>Link</label><input name="url" type="url" value="${esc(w.url)}" placeholder="https://">
      <div class="row"><div class="grow"><label>Price</label><input name="price" inputmode="decimal" value="${w.price || ""}"></div>
      <div class="grow"><label>Priority</label><select name="priority">${["high", "med", "low"].map((p) => `<option value="${p}" ${w.priority === p ? "selected" : ""}>${{ high: "High", med: "Medium", low: "Low" }[p]}</option>`).join("")}</select></div></div>
      <label>Notes</label><textarea name="notes">${esc(w.notes)}</textarea>
      <div class="actions">${w.id ? `<button type="button" class="btn danger" data-act="wish-del" data-id="${w.id}">Delete</button>` : ""}<span class="sp"></span>
      <button type="button" class="btn ghost" data-act="close">Cancel</button><button class="btn">Save</button></div></form>`);
  }

  // ---------- Gun ledger ----------
  function pGuns() {
    const by = (grp) => D.guns.filter((g) => g.group === grp).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
    const fire = by("firearm"), gear = by("gear"), spare = by("spare");
    const fTot = fire.reduce((t, g) => t + sumItems(g), 0), gTot = gear.reduce((t, g) => t + sumItems(g), 0), sTot = spare.reduce((t, g) => t + sumItems(g), 0);
    const card = (g, i) => {
      const open = ui.open[g.id];
      return `<div class="card gun"><div class="head" data-act="gun-open" data-id="${g.id}">
        <div class="grow" style="flex:1"><div style="font-weight:600">${g.group === "firearm" ? i + 1 + ". " : ""}${esc(g.name)}</div>
        <div class="sub">${g.items.length > 1 ? g.items.length - 1 + " mod" + (g.items.length === 2 ? "" : "s") : "No mods tracked"}</div></div>
        <div class="money" style="font-weight:700">${usd(sumItems(g))}</div><span class="sub">${open ? "▾" : "▸"}</span></div>
        ${open ? `<div class="mods">${g.items.map((it) => `<div class="mod"><span>${esc(it.name)}</span><span class="money">${usd(it.price)}</span></div>`).join("")}
        ${g.notes ? `<div class="note">${esc(g.notes)}</div>` : ""}<div class="actions"><span class="sp"></span><button class="btn ghost sm" data-act="gun-edit" data-id="${g.id}">Edit</button></div></div>` : ""}</div>`;
    };
    return top("Gun Ledger", `<button class="btn sm" data-act="gun-new">+ Add</button>`) + `
      <div class="stats" style="margin-top:12px"><div class="stat wide"><div class="k">Collection + equipment</div><div class="v money">${usd(fTot + gTot + sTot)}</div>
      <div class="s">${fire.length} firearms ${usd(fTot)} · unassigned ${usd(gTot)} · spare ${usd(sTot)}</div></div></div>
      <h3>Firearms</h3>${fire.map(card).join("")}
      ${gear.length ? `<h3>Unassigned suppressors &amp; gear</h3>${gear.map(card).join("")}` : ""}
      ${spare.length ? `<h3>Spare equipment</h3>${spare.map(card).join("")}` : ""}`;
  }
  function gunForm(g = { group: "firearm", items: [{ name: "", price: "" }] }) {
    const others = D.guns.filter((x) => x.id !== g.id).sort((a, b) => a.name.localeCompare(b.name));
    const modRow = (it, i) => `<div class="modrow" data-mod>
      <input name="mn" value="${esc(it.name)}" placeholder="${i ? "Mod / accessory" : "The gun itself"}">
      <input name="mp" value="${it.price ?? ""}" inputmode="decimal" placeholder="$">
      ${i ? `<select name="mv" title="Move to" style="padding:0 2px;font-size:12px"><option value="">⋯</option><option value="__del">Remove</option>${others.map((o) => `<option value="${o.id}">→ ${esc(o.name)}</option>`).join("")}</select>` : "<span></span>"}</div>`;
    sheet(`<h2>${g.id ? "Edit" : "Add"}</h2><form data-form="gun-save" data-id="${g.id || ""}">
      <label>Name</label><input name="name" value="${esc(g.name)}" required>
      <label>Section</label><select name="group">${[["firearm", "Firearm / build"], ["gear", "Unassigned suppressor / gear"], ["spare", "Spare equipment"]].map(([v, t]) => `<option value="${v}" ${g.group === v ? "selected" : ""}>${t}</option>`).join("")}</select>
      <label>Items — first line is the gun; the ⋯ menu moves a mod to another gun</label><div id="mods">${g.items.map(modRow).join("")}</div>
      <button type="button" class="btn ghost sm" data-act="gun-addmod">+ Add mod</button>
      <label>Notes</label><textarea name="notes">${esc(g.notes)}</textarea>
      <div class="actions">${g.id ? `<button type="button" class="btn danger" data-act="gun-del" data-id="${g.id}">Delete</button>` : ""}<span class="sp"></span>
      <button type="button" class="btn ghost" data-act="close">Cancel</button><button class="btn">Save</button></div></form>`);
    window.__modRow = modRow;
  }

  // ---------- Trim sales ----------
  function pTrim() {
    const head = top("Trim Sales", `<button class="btn ghost sm" data-act="trim-refresh">Refresh</button>`);
    if (!trim) return head + `<div class="empty">Loading…</div>`;
    if (!trim.ready) return head + `<div class="card"><div style="font-weight:600">Not connected yet</div><div class="sub">${esc(trim.why)}</div></div>`;
    const diff = trim.wtd.sales - trim.lastWeekToDate.sales;
    const max = Math.max(1, ...trim.week.map((d) => d.sales));
    const t = trim.today;
    const stat = (k, r, extra = "") => `<div class="stat"><div class="k">${k}</div><div class="v money">${usd(r.sales, false)}</div><div class="s">${r.orders} order${r.orders === 1 ? "" : "s"}${extra}</div></div>`;
    return head + `<div class="sub">Week runs Mon–Sun · updated ${new Date(trim.asOf).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
      <div class="stats" style="margin-top:12px">
        ${stat("Today", trim.daily, ` · ${usd(trim.daily.profit, false)} profit`)}
        ${stat("Yesterday", trim.yesterday)}
        ${stat("Week to date", trim.wtd, `<br><span style="color:${diff >= 0 ? "var(--good)" : "var(--bad)"}">${diff >= 0 ? "▲" : "▼"} ${usd(Math.abs(diff), false)} vs last week</span>`)}
        ${stat("Month to date", trim.mtd, trim.mtd.sheet ? ` · incl. ${usd(trim.mtd.sheet, false)} P&L sheet` : "")}
        <div class="stat wide"><div class="k">Year to date</div><div class="v money">${usd(trim.ytd.sales, false)}</div><div class="s">${trim.ytd.orders} orders in tracker${trim.ytd.sheet ? ` + ${usd(trim.ytd.sheet, false)} from the P&L sheet` : ""}</div></div>
      </div>
      <h3>This week</h3><div class="card"><div class="bars">${trim.week.map((d) => `<div class="b ${d.day > t ? "fut" : ""}">
        <span class="money">${d.sales ? usd(d.sales, false) : ""}</span><i style="height:${Math.round((d.sales / max) * 82)}%"></i>
        <span style="${d.day === t ? "color:var(--text);font-weight:700" : ""}">${new Date(d.day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })}</span></div>`).join("")}</div></div>`;
  }

  // ---------- Packages ----------
  const CARRIER = { usps: "USPS", ups: "UPS", fedex: "FedEx", dhl: "DHL", intl: "Intl post", amazon: "Amazon" };
  const carrierLink = (p) => {
    const n = encodeURIComponent(p.tracking);
    return { usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`, ups: `https://www.ups.com/track?tracknum=${n}`, fedex: `https://www.fedex.com/fedextrack/?trknbr=${n}`, dhl: `https://www.dhl.com/us-en/home/tracking/tracking-express.html?tracking-id=${n}`, intl: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`, amazon: "https://www.amazon.com/gp/your-account/order-history" }[p.carrier];
  };
  const statusPill = (p) => {
    if (p.carrier === "amazon") return '<span class="pill">Track in Amazon</span>';
    if (p.error) return `<span class="pill bad">${esc(p.error)}</span>`;
    const c = p.statusCode, s = esc(p.status || (D.status.parcel ? "Waiting for first check" : "Tracking not set up"));
    return `<span class="pill ${c === 0 ? "good" : c === 4 || c === 3 ? "blue" : c === 6 || c === 7 ? "bad" : c === 2 ? "warn" : ""}">${s}</span>`;
  };
  function pPkgs() {
    const active = D.pkgs.filter((p) => !p.delivered && !p.archived).sort((a, b) => (a.statusCode === 4 ? -1 : 0) - (b.statusCode === 4 ? -1 : 0) || (b.createdAt || 0) - (a.createdAt || 0));
    const old = D.pkgs.filter((p) => p.delivered || p.archived).sort((a, b) => (b.deliveredAt || b.createdAt || 0) - (a.deliveredAt || a.createdAt || 0));
    const card = (p) => {
      const open = ui.open[p.id];
      return `<div class="card"><div class="row" data-act="pkg-open" data-id="${p.id}" style="cursor:pointer"><div class="grow">
        <div style="font-weight:600">${esc(p.label || "Package")}</div>
        <div class="sub">${CARRIER[p.carrier] || ""} · ${esc(p.tracking)}${p.from ? " · " + esc(p.from) : ""}</div>
        <div style="margin-top:6px">${statusPill(p)}</div>
        ${p.summary && p.summary !== p.status ? `<div class="note">${esc(p.summary)}</div>` : ""}
        ${p.expected && !p.delivered ? `<div class="note">Expected ${esc(p.expected)}</div>` : ""}</div><span class="sub">${open ? "▾" : "▸"}</span></div>
        ${open ? `<div style="margin-top:10px">${(p.events || []).map((e) => `<div class="ev">${esc(e.event)}<small>${esc([e.location, e.date].filter(Boolean).join(" · "))}</small></div>`).join("") || `<div class="note">No scans yet.</div>`}
          <div class="note">${p.checkedAt ? "Checked " + ago(p.checkedAt) : ""}</div>
          <div class="actions"><a class="btn ghost sm" href="${carrierLink(p)}" target="_blank" rel="noopener">Carrier site</a>
          <button class="btn ghost sm" data-act="pkg-archive" data-id="${p.id}">${p.archived ? "Unarchive" : p.delivered ? "Hide" : "Archive"}</button><span class="sp"></span>
          <button class="btn danger sm" data-act="pkg-del" data-id="${p.id}">Delete</button></div></div>` : ""}</div>`;
    };
    return top("Packages", `<button class="btn ghost sm" data-act="pkg-check">Check now</button>`) + `
      <form class="card" data-form="pkg-add"><input name="tracking" placeholder="Tracking number" autocomplete="off" required>
      <div class="row" style="margin-top:8px"><input name="label" placeholder="What is it? (e.g. Boots)" class="grow"><input name="from" placeholder="From (Amazon, Brownells…)" class="grow"></div>
      <div class="row" style="margin-top:8px"><span class="sub grow" id="cg">Carrier is detected from the number</span><button class="btn">Track</button></div></form>
      ${!D.status.parcel ? `<div class="card"><div class="sub">Tracking key isn’t set on this project yet — packages are saved but won’t update.</div></div>` : ""}
      ${active.length ? active.map(card).join("") : `<div class="empty">Nothing on the way.</div>`}
      ${old.length ? `<h3><button class="icon" data-act="pkg-showold" style="font-size:13px;color:var(--mute)">${ui.pkgShowOld ? "▾" : "▸"} Delivered &amp; archived (${old.length})</button></h3>${ui.pkgShowOld ? old.map(card).join("") : ""}` : ""}
      <h3>Delivery alerts</h3><div class="card"><div class="row"><div class="grow"><div style="font-weight:600">Notifications on this device</div>
      <div class="sub" id="pushst">${pushState()}</div></div><button class="btn sm" data-act="push-on">Turn on</button></div></div>`;
  }
  function pushState() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return /iPhone|iPad/.test(navigator.userAgent) ? "On iPhone: Share → Add to Home Screen, then open Life from that icon." : "This browser can’t do notifications.";
    if (!D.status.push) return "Push keys aren’t set on the project yet.";
    return Notification.permission === "granted" ? "On — you’ll get updates and deliveries." : Notification.permission === "denied" ? "Blocked in settings for this browser." : "Off";
  }
  async function pushOn() {
    try {
      const { key } = await api("push/key");
      if (!key) return toast("Push keys aren’t set yet");
      const reg = await navigator.serviceWorker.register("/sw.js");
      if ((await Notification.requestPermission()) !== "granted") return toast("Notifications not allowed");
      const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (key.length % 4)) % 4));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) });
      await api("push/sub", { method: "POST", body: { sub: sub.toJSON(), device: navigator.userAgent.slice(0, 80) } });
      await api("push/test", { method: "POST" });
      toast("Alerts on"); render();
    } catch (e) { toast(e.message); }
  }

  // ---------- Money ----------
  function pMoney() {
    const head = top("Money", `<button class="btn ghost sm" data-act="money-refresh">Refresh</button>`);
    if (!money) return head + `<div class="empty">Loading…</div>`;
    if (!money.ready) return head + `<div class="card"><div style="font-weight:600">Bank + Venmo</div><div class="sub">${esc(money.why)}. Balances and transactions will come straight from Blumenfeld Finance’s Plaid connections.</div></div>`;
    const accts = money.accounts || [];
    const grp = (t) => accts.filter((a) => a.type === t);
    const acct = (a) => `<div class="item"><div class="grow"><div class="t">${esc(a.name)}</div><div class="sub">${esc(a.institution || "")}${a.mask ? " ··" + esc(a.mask) : ""}</div></div><div class="money" style="font-weight:600">${usd(a.balance)}</div></div>`;
    const tx = (money.transactions || []).slice(0, 40);
    return head + `<div class="stats" style="margin-top:12px"><div class="stat"><div class="k">Cash</div><div class="v money">${usd(money.cash ?? 0)}</div></div>
      <div class="stat"><div class="k">Credit owed</div><div class="v money">${usd(money.credit ?? 0)}</div></div></div>
      ${money.lastSync ? `<div class="sub" style="margin-top:6px">Banks last synced ${ago(Date.parse(money.lastSync))} · Sync from Blumenfeld Finance</div>` : ""}
      ${["depository", "credit", "other"].map((t) => grp(t).length ? `<h3>${{ depository: "Bank & Venmo", credit: "Credit cards", other: "Other" }[t]}</h3><div class="list">${grp(t).map(acct).join("")}</div>` : "").join("")}
      ${tx.length ? `<h3>Recent</h3><div class="list">${tx.map((x) => `<div class="item"><div class="grow"><div class="t">${esc(x.name)}</div><div class="sub">${esc(x.date)}${x.pending ? " · pending" : ""} · ${esc(x.account || "")}</div></div><div class="money" style="color:${x.amount < 0 ? "var(--good)" : "var(--text)"}">${x.amount < 0 ? "+" : "−"}${usd(Math.abs(x.amount))}</div></div>`).join("")}</div>` : ""}`;
  }

  // ---------- Photos ----------
  function pPhotos() {
    return top("Photo Vault") + `<div class="card"><div style="font-weight:600">OneDrive folders</div><div class="sub">Coming next: once the Microsoft app registration is done, pick the OneDrive folders to show here and they’ll stay in sync.</div></div>`;
  }

  // ---------- Bottom sheet ----------
  function sheet(html) {
    closeSheet();
    const m = document.createElement("div");
    m.className = "modal"; m.id = "modal";
    m.innerHTML = `<div class="sheet">${html}</div>`;
    m.addEventListener("click", (e) => { if (e.target === m) closeSheet(); });
    document.body.appendChild(m);
    bindForms(m);
  }
  const closeSheet = () => document.getElementById("modal")?.remove();

  // ---------- Events ----------
  document.addEventListener("click", async (e) => {
    const go = e.target.closest("[data-go]");
    if (go) { location.hash = go.dataset.go; return; }
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act, id = el.dataset.id;
    const find = (col) => D[col].find((x) => x.id === id);
    try {
      switch (act) {
        case "close": closeSheet(); break;
        case "todo-toggle": { const t = find("todo"); await save("todo", { ...t, done: !t.done }); break; }
        case "todo-showdone": ui.todoShowDone = !ui.todoShowDone; render(); break;
        case "todo-edit": {
          const t = find("todo");
          sheet(`<h2>Edit to-do</h2><form data-form="todo-save" data-id="${t.id}"><label>To-do</label><input name="text" value="${esc(t.text)}" required>
            <label>Due</label><input name="due" type="date" value="${esc(t.due)}"><label>Notes</label><textarea name="notes">${esc(t.notes)}</textarea>
            <div class="actions"><button type="button" class="btn danger" data-act="todo-del" data-id="${t.id}">Delete</button><span class="sp"></span>
            <button type="button" class="btn ghost" data-act="close">Cancel</button><button class="btn">Save</button></div></form>`);
          break;
        }
        case "todo-del": await remove("todo", id); closeSheet(); break;
        case "wish-new": wishForm(); break;
        case "wish-edit": wishForm(find("wish")); break;
        case "wish-toggle": { const w = find("wish"); await save("wish", { ...w, got: !w.got }); break; }
        case "wish-showgot": ui.wishShowGot = !ui.wishShowGot; render(); break;
        case "wish-del": if (confirmDel()) { await remove("wish", id); closeSheet(); } break;
        case "gun-open": case "pkg-open": ui.open[id] = !ui.open[id]; render(); break;
        case "gun-new": gunForm(); break;
        case "gun-edit": gunForm(find("guns")); break;
        case "gun-addmod": document.getElementById("mods").insertAdjacentHTML("beforeend", window.__modRow({ name: "", price: "" }, 1)); break;
        case "gun-del": if (confirmDel()) { await remove("guns", id); closeSheet(); } break;
        case "trim-refresh": trim = null; render(); loadTrim(); break;
        case "money-refresh": money = null; render(); loadMoney(); break;
        case "pkg-check": {
          el.disabled = true; el.textContent = "Checking…";
          const r = await api("pkgs/check", { method: "POST" });
          if (r.pkgs) D.pkgs = r.pkgs;
          render(); toast(!r.ready ? "Tracking key isn’t set yet" : r.limited ? "Parcel is busy — try again in a bit" : `Checked ${r.updated} package${r.updated === 1 ? "" : "s"}`);
          break;
        }
        case "pkg-showold": ui.pkgShowOld = !ui.pkgShowOld; render(); break;
        case "pkg-archive": { const p = find("pkgs"); await save("pkgs", { ...p, archived: !p.archived }); break; }
        case "pkg-del": if (confirmDel()) await remove("pkgs", id); break;
        case "push-on": pushOn(); break;
      }
    } catch (x) { if (x.message !== "signin") toast(x.message); }
  });
  // A native confirm() would block the page; a second tap within 3 seconds confirms instead.
  let armed = 0;
  function confirmDel() { if (Date.now() - armed < 3000) { armed = 0; return true; } armed = Date.now(); toast("Tap Delete again to confirm"); return false; }

  function bindForms(root) {
    root.querySelectorAll("form[data-form]").forEach((f) => (f.onsubmit = (e) => { e.preventDefault(); submit(f); }));
  }
  new MutationObserver(() => bindForms($app)).observe($app, { childList: true });
  document.addEventListener("input", (e) => {
    if (e.target.name === "tracking" && e.target.closest('[data-form="pkg-add"]')) {
      const t = e.target.value.replace(/\s+/g, "").toUpperCase(), cg = document.getElementById("cg");
      const c = /^TBA\d+$/.test(t) ? "Amazon (track in the Amazon app)" : /^1Z/.test(t) ? "UPS" : /^(420\d{5}(\d{4})?)?9\d{19,25}$|^[A-Z]{2}\d{9}US$/.test(t) ? "USPS" : /^(\d{12}|\d{15}|\d{20})$/.test(t) ? "FedEx" : /^\d{10,11}$|^JJD/.test(t) ? "DHL" : t ? "USPS (best guess)" : "Carrier is detected from the number";
      if (cg) cg.textContent = c;
    }
  });

  async function submit(f) {
    const v = Object.fromEntries(new FormData(f).entries()), id = f.dataset.id || undefined;
    const btn = f.querySelector("button:not([type=button])");
    if (btn) btn.disabled = true;
    try {
      switch (f.dataset.form) {
        case "todo-add": await save("todo", { text: v.text, due: v.due }); break;
        case "todo-save": { const t = D.todo.find((x) => x.id === id); await save("todo", { ...t, text: v.text, due: v.due, notes: v.notes }); closeSheet(); break; }
        case "wish-save": { const w = D.wish.find((x) => x.id === id) || {}; await save("wish", { ...w, id, ...v }); closeSheet(); break; }
        case "pkg-add": await save("pkgs", { tracking: v.tracking, label: v.label, from: v.from }); toast("Tracking"); break;
        case "gun-save": {
          const rows = [...f.querySelectorAll("[data-mod]")].map((r) => ({ name: r.querySelector("[name=mn]").value.trim(), price: r.querySelector("[name=mp]").value.replace(/[$,]/g, ""), mv: r.querySelector("[name=mv]")?.value || "" }));
          const keep = rows.filter((r) => r.name && !r.mv).map(({ name, price }) => ({ name, price: +price || 0 }));
          const old = D.guns.find((x) => x.id === id) || {};
          await save("guns", { ...old, id, name: v.name, group: v.group, notes: v.notes, order: old.order ?? D.guns.length, items: keep });
          // Moved mods go onto the other gun.
          for (const r of rows.filter((r) => r.name && r.mv && r.mv !== "__del")) {
            const to = D.guns.find((x) => x.id === r.mv);
            if (to) await save("guns", { ...to, items: [...to.items, { name: r.name, price: +r.price || 0 }] });
          }
          closeSheet(); break;
        }
      }
    } catch (x) { if (x.message !== "signin") toast(x.message); }
    finally { if (btn) btn.disabled = false; }
  }

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.open) location.hash = e.data.open; });
  linkSignIn().then(boot, () => {});
})();
