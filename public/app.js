// Life — Jeff's master app. One page; sections open from the home tiles (#todo, #wish, #trim, #pkgs (Incoming), #money, #photos).
(() => {
  const $app = document.getElementById("app");
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} },
  };
  let token = store.get("life.token");
  let D = { todo: [], wish: [], pkgs: [], status: {} };
  let trim = null, money = null;
  const ui = { open: {}, todoShowDone: false, wishShowGot: false, pkgShowOld: false, inTab: "personal" };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const usd = (n, cents = true) => "$" + (+n || 0).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
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
    $app.innerHTML = `<div class="login"><h1>Life</h1><div class="sub">Paste your private link once and this device stays signed in.</div>
      <form id="lf"><input id="lk" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Paste private link" style="letter-spacing:0;font-size:16px;text-align:left">
      <div class="err">${esc(err)}</div><button class="btn" style="width:100%">Sign in</button></form></div>`;
    document.getElementById("lf").onsubmit = async (e) => {
      e.preventDefault();
      const raw = document.getElementById("lk").value.trim(), m = raw.match(/k=([^&\s]+)/);
      try {
        const d = await api("login", { method: "POST", body: { key: decodeURIComponent(m ? m[1] : raw) } });
        token = d.token; store.set("life.token", token); boot();
      } catch (x) { if (x.message !== "signin") renderLogin(x.message); }
    };
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
    try { D = { todo: [], wish: [], pkgs: [], status: {}, ...(await api("all")) }; } catch (e) { if (e.message !== "signin") $app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    render();
    loadTrim(); loadMoney();
  }
  async function loadTrim() { try { trim = await api("trim"); } catch (_) { trim = { ready: false, why: "Couldn’t load" }; } if (["", "trim", "pkgs"].includes(route())) render(); }
  async function loadMoney() { try { money = await api("money"); } catch (_) { money = { ready: false, why: "Couldn’t load" }; } if (["", "money"].includes(route())) render(); }

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
  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); if (route() === "trim" || route() === "pkgs") loadTrim(); });
  const TABS = [["", "Home", "home"], ["money", "Money", "wallet"], ["trim", "Trim", "chart"], ["todo", "To-Do", "check"], ["pkgs", "Incoming", "box"]];
  const ICON = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M3 10h18"/><circle cx="16.5" cy="15" r="1.2"/>',
    chart: '<path d="M3 20h18"/><path d="M6 16v-4M11 16V7M16 16v-6M20 5l-5 4-4-3-6 5"/>',
    check: '<path d="M8.5 12.5l2.5 2.5 5-6"/><rect x="3.5" y="3.5" width="17" height="17" rx="4"/>',
    box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    gift: '<rect x="3" y="8" width="18" height="13" rx="1.5"/><path d="M12 8v13M3 12.5h18M12 8C10 4 6 4 6 6.5S12 8 12 8zm0 0c2-4 6-4 6-1.5S12 8 12 8z"/>',
    photo: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
  const top = (title, right = "") => {
    const isTab = TABS.some(([r]) => r === route());
    return `<div class="top">${isTab ? "" : `<button class="back" data-go="">‹ Home</button>`}<div style="flex:1"></div>${right}</div><h1>${title}</h1>`;
  };

  function tabBar() {
    let nav = document.querySelector("nav.tabs");
    if (!nav) {
      nav = document.createElement("nav");
      nav.className = "tabs";
      nav.innerHTML = `<div class="in"><span class="ind"></span>${TABS.map(([r, n, ic]) => `<a href="#${r}" data-tab="${r}">${svg(ic)}<span>${n}</span></a>`).join("")}</div>`;
      document.body.appendChild(nav);
    }
    const r = route(), i = TABS.findIndex(([x]) => x === r);
    nav.querySelectorAll("a").forEach((a) => a.classList.toggle("on", a.dataset.tab === r));
    const ind = nav.querySelector(".ind");
    ind.style.opacity = i < 0 ? 0 : 1;
    if (i >= 0) ind.style.left = i * 20 + "%";
  }

  let lastRoute = null;
  function render() {
    const r = route();
    const page = { todo: pTodo, wish: pWish, trim: pTrim, pkgs: pPkgs, money: pMoney, photos: pPhotos }[r] || pHome;
    const fresh = r !== lastRoute;
    lastRoute = r;
    $app.innerHTML = `<div class="${fresh ? "enter" : ""}">${page()}</div>`;
    tabBar();
    if (fresh) countUp();
    else $app.querySelectorAll(".grid.enterTiles").forEach((g) => g.classList.remove("enterTiles"));
    if (!fresh) $app.querySelectorAll("[data-count]").forEach((el) => (el.textContent = fmtCount(el)));
  }

  // Numbers roll up from zero when a page opens.
  const fmtCount = (el, v = +el.dataset.count) => (el.dataset.fmt === "usd" ? usd(v, false) : Math.round(v).toLocaleString("en-US"));
  function countUp() {
    const els = [...$app.querySelectorAll("[data-count]")];
    if (!els.length) return;
    const t0 = performance.now(), dur = 900;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      els.forEach((el) => { if (el.isConnected) el.textContent = fmtCount(el, +el.dataset.count * e); });
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- Watch: original green-dial chronograph. Real Eastern time and date; small seconds at 9 sweep at
  // 8 beats a second; tap the watch to start/stop the chronograph, double-tap to reset (30-min counter at 3, 12-hour at 6).
  function watchSVG() {
    const c = 150, P = (a, r) => [c + r * Math.sin((a * Math.PI) / 180), c - r * Math.cos((a * Math.PI) / 180)];
    const L = (a, r1, r2, st) => { const [x1, y1] = P(a, r1), [x2, y2] = P(a, r2); return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" ${st}/>`; };
    const F = "-apple-system,Helvetica,Arial,sans-serif";
    // Tachymeter bezel: speed = 3600 / elapsed seconds.
    const tach = [60, 65, 70, 75, 80, 90, 100, 110, 120, 130, 150, 170, 200, 240, 300, 400, 500];
    const bez = tach.map((v) => { const a = (3600 / v) * 6 % 360, [x, y] = P(a, 131); return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle" font-size="8.4" font-weight="600" fill="#e9d38a" font-family="${F}" transform="rotate(${a} ${x.toFixed(1)} ${(y + 3).toFixed(1)})">${v}</text>`; }).join("");
    const bezTicks = Array.from({ length: 120 }, (_, i) => { const sec = 7.2 + i * 0.44; return sec < 60 ? L(sec * 6, 139, i % 5 ? 136 : 134, `stroke="#c9a54e" stroke-width="${i % 5 ? 0.5 : 0.9}"`) : ""; }).join("");
    const track = [], idx = [];
    for (let i = 0; i < 240; i++) { const big = i % 20 === 0, mid = i % 4 === 0; track.push(L(i * 1.5, 115, big ? 107 : mid ? 110 : 112.5, `stroke="#c9a54e" stroke-width="${big ? 1.1 : mid ? 0.7 : 0.35}" opacity="${mid ? 0.85 : 0.5}"`)); }
    const trackNums = Array.from({ length: 12 }, (_, i) => { const n = (i + 1) * 5, [x, y] = P(n * 6, 101); return n === 15 ? "" : `<text x="${x.toFixed(1)}" y="${(y + 2).toFixed(1)}" text-anchor="middle" font-size="5.4" fill="#3a3a3a" font-family="${F}">${n}</text>`; }).join("");
    for (let h = 0; h < 12; h++) {
      if (h === 3) continue; // day-date
      const deg = h * 30, w = h % 3 === 0 ? 3.6 : 2.8;
      idx.push(`<g transform="rotate(${deg} ${c} ${c})"><rect x="${c - w / 2}" y="${c - 105}" width="${w}" height="${h % 3 === 0 ? 10 : 8}" rx=".8" fill="url(#gSteel)" stroke="#555" stroke-width=".35"/></g>`);
    }
    const R = 34; // subdial radius
    const sub = (x, y, id, labels, marks) => {
      const t = [];
      for (let i = 0; i < marks; i++) { const rad = (i * 2 * Math.PI) / marks, big = i % (marks / labels.length) === 0;
        t.push(`<line x1="${(x + (R - 2) * Math.sin(rad)).toFixed(2)}" y1="${(y - (R - 2) * Math.cos(rad)).toFixed(2)}" x2="${(x + (big ? R - 8 : R - 5) * Math.sin(rad)).toFixed(2)}" y2="${(y - (big ? R - 8 : R - 5) * Math.cos(rad)).toFixed(2)}" stroke="#d9bd6a" stroke-width="${big ? 1.1 : 0.5}"/>`); }
      const lab = labels.map((l, i) => { const a = (i * 2 * Math.PI) / labels.length; return `<text x="${(x + (R - 15) * Math.sin(a)).toFixed(1)}" y="${(y - (R - 15) * Math.cos(a) + 2.6).toFixed(1)}" text-anchor="middle" font-size="7" font-weight="600" fill="#e9d38a" font-family="${F}">${l}</text>`; }).join("");
      return `<circle cx="${x}" cy="${y}" r="${R + 1.8}" fill="url(#gSteel)"/><circle cx="${x}" cy="${y}" r="${R}" fill="url(#gSub)"/>
        ${Array.from({ length: 28 }, (_, i) => `<circle cx="${x}" cy="${y}" r="${R - 1 - i * 1.1}" fill="none" stroke="#fff" stroke-width=".25" opacity=".07"/>`).join("")}${t.join("")}${lab}
        <g id="${id}"><line x1="${x}" y1="${y + 6}" x2="${x}" y2="${y - (R - 4)}" stroke="#f6dd8c" stroke-width="1.8" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="3" fill="url(#gSteel)" stroke="#666" stroke-width=".4"/></g>`;
    };
    return `<svg viewBox="0 0 300 300" aria-label="Watch" id="watchSvg" style="cursor:pointer">
      <defs>
        <linearGradient id="gSteel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbe7a1"/><stop offset=".28" stop-color="#b8862b"/><stop offset=".55" stop-color="#fff3c4"/><stop offset=".8" stop-color="#9c7018"/><stop offset="1" stop-color="#e9c766"/></linearGradient>
        <radialGradient id="gDial" cx=".5" cy=".35" r=".75"><stop offset="0" stop-color="#262421"/><stop offset=".6" stop-color="#0e0d0b"/><stop offset="1" stop-color="#030303"/></radialGradient>
        <radialGradient id="gSub" cx=".5" cy=".35" r=".75"><stop offset="0" stop-color="#1d1b17"/><stop offset="1" stop-color="#050505"/></radialGradient>
        <radialGradient id="gBez" cx=".5" cy=".5" r=".5"><stop offset=".85" stop-color="#1c1c1c"/><stop offset="1" stop-color="#050505"/></radialGradient>
        <linearGradient id="gGlass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2.2" stdDeviation="1.6" flood-opacity=".55"/></filter>
        <path id="tachArc" d="M ${P(6.5, 128)[0]} ${P(6.5, 128)[1]} A 128 128 0 0 1 ${P(38, 128)[0]} ${P(38, 128)[1]}"/>
      </defs>
      <circle cx="${c}" cy="${c}" r="149" fill="url(#gSteel)"/>
      <circle cx="${c}" cy="${c}" r="145" fill="url(#gBez)"/>
      ${bezTicks}${bez}
      <text font-size="6.4" font-weight="700" letter-spacing="1.6" fill="#f6dd8c" font-family="${F}"><textPath href="#tachArc">BLUMENFELD</textPath></text>
      <circle cx="${c}" cy="${c}" r="121" fill="url(#gSteel)"/>
      <circle cx="${c}" cy="${c}" r="118" fill="url(#gDial)"/>
      <circle cx="${c}" cy="${c}" r="72" fill="none" stroke="#d4af37" stroke-width=".5" opacity=".35"/>
      <g opacity=".08">${Array.from({ length: 90 }, (_, i) => L(i * 4, 0, 118, 'stroke="#fff" stroke-width=".35"')).join("")}</g>
      ${track.join("")}${idx.join("")}
      ${sub(c, c - 53, "subM", ["30", "5", "10", "15", "20", "25"], 30)}
      ${sub(c - 53, c, "subS", ["60", "15", "30", "45"], 60)}
      ${sub(c, c + 53, "subH", ["12", "2", "4", "6", "8", "10"], 24)}
      <text x="${c + 34}" y="${c - 16}" text-anchor="middle" font-size="7.2" font-weight="700" letter-spacing="2" fill="url(#gSteel)" font-family="Didot,'Bodoni 72',Georgia,serif">LIFE</text>
      <text x="${c + 34}" y="${c - 9.5}" text-anchor="middle" font-size="3.4" letter-spacing="1.2" fill="#bfa45a" font-family="${F}">CHRONOGRAPH</text>
      <g filter="url(#sh)"><rect x="${c + 50}" y="${c - 8}" width="40" height="16" rx="1.5" fill="url(#gSteel)"/>
        <rect x="${c + 52}" y="${c - 6.4}" width="21" height="12.8" fill="#fff"/><rect x="${c + 74.5}" y="${c - 6.4}" width="13.5" height="12.8" fill="#fff"/>
        <text id="wDay" x="${c + 62.5}" y="${c + 3.6}" text-anchor="middle" font-size="9" font-weight="700" fill="#111" font-family="${F}">MON</text>
        <text id="wDate" x="${c + 81.2}" y="${c + 3.6}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#111" font-family="${F}">1</text></g>
      <g id="hh" filter="url(#sh)"><path d="M${c - 4.4} ${c + 12} L${c - 3.6} ${c - 50} L${c} ${c - 60} L${c + 3.6} ${c - 50} L${c + 4.4} ${c + 12} Z" fill="url(#gSteel)" stroke="#555" stroke-width=".5"/><rect x="${c - 1.3}" y="${c - 50}" width="2.6" height="36" rx="1" fill="#f4f1e6"/></g>
      <g id="mm" filter="url(#sh)"><path d="M${c - 3.6} ${c + 16} L${c - 2.8} ${c - 86} L${c} ${c - 98} L${c + 2.8} ${c - 86} L${c + 3.6} ${c + 16} Z" fill="url(#gSteel)" stroke="#555" stroke-width=".5"/><rect x="${c - 1.1}" y="${c - 88}" width="2.2" height="64" rx=".8" fill="#fff"/></g>
      <g id="cs" filter="url(#sh)"><line x1="${c}" y1="${c + 26}" x2="${c}" y2="${c - 113}" stroke="#f6dd8c" stroke-width="1.2" stroke-linecap="round"/><circle cx="${c}" cy="${c + 20}" r="3.8" fill="url(#gSteel)" stroke="#666" stroke-width=".4"/></g>
      <circle cx="${c}" cy="${c}" r="5.2" fill="url(#gSteel)" stroke="#555" stroke-width=".7"/><circle cx="${c}" cy="${c}" r="1.6" fill="#1a1306"/>
      <ellipse cx="${c - 20}" cy="${c - 62}" rx="96" ry="58" fill="url(#gGlass)" transform="rotate(-18 ${c} ${c})"/>
    </svg>`;
  }
  // Chronograph: tap to start/stop, double-tap to reset. Kept for the session.
  const chrono = { run: false, start: 0, acc: 0 };
  const chronoMs = () => chrono.acc + (chrono.run ? performance.now() - chrono.start : 0);
  let lastTap = 0;
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#watchSvg")) return;
    const now = performance.now();
    if (now - lastTap < 320) { chrono.run = false; chrono.acc = 0; lastTap = 0; if (navigator.vibrate) navigator.vibrate(20); return; }
    lastTap = now;
    if (chrono.run) { chrono.acc += now - chrono.start; chrono.run = false; } else { chrono.start = now; chrono.run = true; }
    if (navigator.vibrate) navigator.vibrate(10);
  });
  const NY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", day: "numeric", weekday: "short" });
  const rot = (id, deg, x = 150, y = 150) => { const el = document.getElementById(id); if (el) el.setAttribute("transform", `rotate(${deg.toFixed(3)} ${x} ${y})`); };
  function tickWatch() {
    if (document.getElementById("hh")) {
      const now = new Date(), p = Object.fromEntries(NY.formatToParts(now).map((x) => [x.type, x.value]));
      const beat = Math.floor(now.getMilliseconds() / 125) * 125;
      const s = +p.second + beat / 1000, m = +p.minute + s / 60, h = (+p.hour % 12) + m / 60;
      rot("hh", h * 30); rot("mm", m * 6);
      rot("subS", s * 6, 97, 150);
      const cm = Math.floor(chronoMs() / 125) * 125 / 1000; // chrono seconds, in 1/8 beats
      rot("cs", (cm % 60) * 6); rot("subM", ((cm / 60) % 30) * 12, 150, 97); rot("subH", ((cm / 3600) % 12) * 30, 150, 203);
      const d = document.getElementById("wDate");
      if (d && d.textContent !== p.day) d.textContent = p.day;
      const w = document.getElementById("wDay"), wd = String(p.weekday || "").toUpperCase();
      if (w && w.textContent !== wd) w.textContent = wd;
    }
    requestAnimationFrame(tickWatch);
  }
  requestAnimationFrame(tickWatch);

  // ---------- Home ----------
  function pHome() {
    const today = todayKey();
    const open = D.todo.filter((t) => !t.done).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
    const late = open.filter((t) => t.due && t.due <= today).length;
    const wishes = D.wish.filter((w) => !w.got);
    const active = D.pkgs.filter((p) => !p.delivered && !p.archived), ofd = active.filter((p) => p.statusCode === 4).length;
    const trimIn = trim?.ready && Array.isArray(trim.incoming) ? trim.incoming.length : 0;
    const n = (v, fmt) => `<span data-count="${+v || 0}"${fmt ? ` data-fmt="${fmt}"` : ""}>${fmt === "usd" ? usd(v, false) : v}</span>`;

    // Portfolio
    const accts = money?.accounts || [];
    const portfolio = money?.ready
      ? `<div class="lbl">Liquid cash</div><div class="hero-num">${n(money.cash ?? 0, "usd")}</div>
         <div class="cols"><div><div class="lbl">Credit owed</div><div class="v">${usd(money.credit ?? 0, false)}</div></div>
         <div><div class="lbl">Accounts</div><div class="v">${accts.length}</div></div>
         <div><div class="lbl">Synced</div><div class="v">${money.lastSync ? ago(Date.parse(money.lastSync)) : "—"}</div></div></div>`
      : `<div class="lbl">Liquid cash</div><div class="quiet">${esc(money?.why || "Loading…")}</div>`;

    // Trim: elegant gold line over the week
    let trimBody = `<div class="quiet">${esc(trim?.why || "Loading…")}</div>`;
    if (trim?.ready) {
      const wk = trim.week.filter((d) => d.day <= trim.today), max = Math.max(1, ...trim.week.map((d) => d.sales));
      const W = 300, H = 64, pts = wk.map((d, i) => [(i / 6) * W, H - 6 - (d.sales / max) * (H - 14)]);
      const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
      const area = pts.length ? `${line} L${pts[pts.length - 1][0].toFixed(1)} ${H} L0 ${H} Z` : "";
      const last = pts[pts.length - 1] || [0, H];
      const diff = trim.wtd.sales - trim.lastWeekToDate.sales;
      trimBody = `<div class="row" style="align-items:flex-end"><div class="grow"><div class="lbl">Today</div><div class="hero-num">${n(trim.daily.sales, "usd")}</div></div>
        <div class="delta ${diff >= 0 ? "up" : "down"}">${diff >= 0 ? "▲" : "▼"} ${usd(Math.abs(diff), false)}<small>vs last week</small></div></div>
        <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4af37" stop-opacity=".35"/><stop offset="1" stop-color="#d4af37" stop-opacity="0"/></linearGradient></defs>
          <path d="${area}" fill="url(#ga)" class="area"/><path d="${line}" fill="none" stroke="#f0d27a" stroke-width="1.6" class="draw" vector-effect="non-scaling-stroke"/>
          <circle cx="${last[0]}" cy="${last[1]}" r="3.2" fill="#f6dd8c" class="dot"/></svg>
        <div class="days">${["M", "T", "W", "T", "F", "S", "S"].map((d, i) => `<span class="${trim.week[i]?.day === trim.today ? "on" : ""}">${d}</span>`).join("")}</div>
        <div class="cols"><div><div class="lbl">Week</div><div class="v">${usd(trim.wtd.sales, false)}</div></div>
        <div><div class="lbl">Month</div><div class="v">${usd(trim.mtd.sales, false)}</div></div>
        <div><div class="lbl">Year</div><div class="v">${usd(trim.ytd.sales, false)}</div></div></div>`;
    }

    const row = (href, ic, title, sub, val, i) => `<a class="arow" href="#${href}" style="--i:${i}"><span class="aic">${svg(ic)}</span>
      <span class="grow"><span class="at">${title}</span><span class="as">${sub}</span></span><span class="av">${val}</span><span class="chev">›</span></a>`;
    const nextTodo = open[0] ? esc(open[0].text) + (open[0].due ? ` · ${open[0].due === today ? "today" : fmtDay(open[0].due)}` : "") : "Nothing open";
    const nextPkg = ofd ? `${ofd} out for delivery` : active[0]?.status ? `${esc(active[0].label || "Package")} · ${esc(active[0].status)}` : `${active.length} personal · ${trimIn} Trim PO${trimIn === 1 ? "" : "s"}`;

    return `<section class="hero">
        <div class="spot"></div>
        <div class="watch">${watchSVG()}</div>
        <div class="crest"><i></i><span>Blumenfeld</span><i></i></div>
      </section>
      <a class="lux" href="#money" style="--i:0"><div class="lux-h"><span>Portfolio</span><span class="chev">›</span></div>${portfolio}</a>
      <a class="lux" href="#trim" style="--i:1"><div class="lux-h"><span>Trim Wellness</span><span class="chev">›</span></div>${trimBody}</a>
      <div class="lux agenda" style="--i:2"><div class="lux-h"><span>Agenda</span></div>
        ${row("todo", "check", "To-Do", nextTodo, `${open.length}${late ? `<em>${late} due</em>` : ""}`, 0)}
        ${row("pkgs", "box", "Incoming", nextPkg, active.length + trimIn, 1)}
        ${row("wish", "gift", "Wish List", wishes.length ? `${usd(wishes.reduce((t, w) => t + (+w.price || 0), 0), false)} across ${wishes.length} item${wishes.length === 1 ? "" : "s"}` : "Empty", wishes.length, 2)}
        ${row("photos", "photo", "Photo Vault", "OneDrive · coming soon", "", 3)}
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

  // ---------- Incoming: personal packages + Trim purchase orders ----------
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
    const personal = `
      <form class="card" data-form="pkg-add"><input name="tracking" placeholder="Tracking number" autocomplete="off" required>
      <div class="row" style="margin-top:8px"><input name="label" placeholder="What is it? (e.g. Boots)" class="grow"><input name="from" placeholder="From (Amazon, Brownells…)" class="grow"></div>
      <div class="row" style="margin-top:8px"><span class="sub grow" id="cg">Carrier is detected from the number</span><button class="btn">Track</button></div></form>
      ${!D.status.parcel ? `<div class="card"><div class="sub">Tracking key isn’t set on this project yet — packages are saved but won’t update.</div></div>` : ""}
      ${active.length ? active.map(card).join("") : `<div class="empty">Nothing on the way.</div>`}
      ${old.length ? `<h3><button class="icon" data-act="pkg-showold" style="font-size:13px;color:var(--mute)">${ui.pkgShowOld ? "▾" : "▸"} Delivered &amp; archived (${old.length})</button></h3>${ui.pkgShowOld ? old.map(card).join("") : ""}` : ""}
      <h3>Delivery alerts</h3><div class="card"><div class="row"><div class="grow"><div style="font-weight:600">Notifications on this device</div>
      <div class="sub" id="pushst">${pushState()}</div></div><button class="btn sm" data-act="push-on">Turn on</button></div></div>`;
    const pos = trim?.ready && Array.isArray(trim.incoming) ? trim.incoming : null;
    const poPill = (k) => {
      if (k.delivered) return '<span class="pill good">Delivered</span>';
      if (k.error) return `<span class="pill bad">${esc(k.error)}</span>`;
      const s = k.status || "Waiting for first scan";
      return `<span class="pill ${/out for delivery|pickup/i.test(s) ? "blue" : /transit/i.test(s) ? "warn" : /attempt|attention/i.test(s) ? "bad" : ""}">${esc(s)}</span>`;
    };
    const trimCard = (po) => {
      const open = ui.open["po" + po.id], items = po.items || [], pk = po.packages || [];
      const left = pk.filter((k) => !k.delivered).length;
      return `<div class="card"><div class="row" data-act="po-open" data-id="${esc(po.id)}" style="cursor:pointer"><div class="grow">
        <div style="font-weight:700">${esc(po.supplier || "Supplier")}${po.orderNo ? ` <span class="sub">· PO ${esc(po.orderNo)}</span>` : ""}</div>
        <div class="sub">${po.date ? fmtDay(po.date) + " · " : ""}${items.length ? items.slice(0, 3).map((i) => `${i.qty}× ${esc(i.name)}`).join(", ") + (items.length > 3 ? ` +${items.length - 3} more` : "") : esc(po.status)}</div>
        <div style="margin-top:7px">${pk.length ? (left ? `<span class="pill">${pk.length} package${pk.length === 1 ? "" : "s"}${left !== pk.length ? ` · ${pk.length - left} delivered` : ""}</span> ` + poPill(pk.find((k) => !k.delivered) || pk[0]) : poPill({ delivered: true })) : '<span class="pill">No tracking yet</span>'}</div></div>
        <span class="sub">${open ? "▾" : "▸"}</span></div>
        ${open ? `<div style="margin-top:10px">${pk.map((k) => `<div class="ev"><div class="row"><div class="grow">${esc((CARRIER[k.carrier] || "") + " " + k.tracking)}<small>${esc(k.summary || "")}${k.checkedAt ? " · checked " + ago(k.checkedAt) : ""}</small></div>${poPill(k)}</div>
          <a class="btn ghost sm" style="margin-top:6px;display:inline-block" href="${carrierLink({ tracking: k.tracking, carrier: k.carrier || guessCarrier(k.tracking) })}" target="_blank" rel="noopener">Carrier site</a></div>`).join("")}
          ${items.length > 3 ? `<div class="note">${items.map((i) => `${i.qty}× ${esc(i.name)}`).join(" · ")}</div>` : ""}</div>` : ""}</div>`;
    };
    const trimHtml = !trim ? `<div class="empty">Loading…</div>` : !trim.ready ? `<div class="card"><div class="sub">${esc(trim.why)}</div></div>`
      : !pos ? `<div class="card"><div class="sub">Trim tracker needs its latest update to share purchase orders.</div></div>`
      : pos.length ? `<div class="note" style="margin:0 0 10px">Open purchase orders from the Trim tracker · statuses update there every 15 minutes</div>${pos.map(trimCard).join("")}` : `<div class="empty">No purchase orders on the way.</div>`;
    const tab = ui.inTab;
    return top("Incoming", tab === "personal" ? `<button class="btn ghost sm" data-act="pkg-check">Check now</button>` : `<button class="btn ghost sm" data-act="trim-refresh">Refresh</button>`) + `
      <div class="seg" style="margin-top:12px"><button class="${tab === "personal" ? "on" : ""}" data-act="in-tab" data-id="personal">Personal (${active.length})</button><button class="${tab === "trim" ? "on" : ""}" data-act="in-tab" data-id="trim">Trim Incoming (${pos ? pos.length : "–"})</button></div>
      ${tab === "trim" ? trimHtml : personal}`;
  }
  const guessCarrier = (t) => { t = String(t || "").replace(/\s+/g, "").toUpperCase(); return /^1Z/.test(t) ? "ups" : /^(\d{12}|\d{15}|\d{20})$/.test(t) ? "fedex" : /^\d{10,11}$|^JJD/.test(t) ? "dhl" : "usps"; };
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
        case "pkg-open": ui.open[id] = !ui.open[id]; render(); break;
        case "po-open": ui.open["po" + id] = !ui.open["po" + id]; render(); break;
        case "in-tab": ui.inTab = id; render(); break;
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
      }
    } catch (x) { if (x.message !== "signin") toast(x.message); }
    finally { if (btn) btn.disabled = false; }
  }

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.open) location.hash = e.data.open; });
  linkSignIn().then(boot, () => {});
})();
