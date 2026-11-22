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
    const track = [], nums = [], idx = [];
    for (let i = 0; i < 300; i++) { // fifth-of-a-second chrono scale on the outer track
      const a = i * 1.2, big = i % 25 === 0, mid = i % 5 === 0;
      track.push(L(a, 121, big ? 110 : mid ? 114 : 117.5, `stroke="#e9d38a" stroke-width="${big ? 1.4 : mid ? 1 : 0.5}" opacity="${mid ? 0.9 : 0.55}"`));
    }
    for (let n = 5; n <= 60; n += 5) { const [x, y] = P(n * 6, 128.5); nums.push(`<text x="${x.toFixed(1)}" y="${(y + 2.6).toFixed(1)}" text-anchor="middle" font-size="7.2" font-weight="600" fill="#2a1d05" font-family="-apple-system,Helvetica,sans-serif">${n}</text>`); }
    for (let h = 0; h < 12; h++) {
      if (h === 4) continue; // date window
      const deg = h * 30, w = h === 0 ? 8 : 5.5, len = h === 0 ? 20 : 15;
      idx.push(`<g transform="rotate(${deg} ${c} ${c})"><rect x="${c - w / 2}" y="${c - 107}" width="${w}" height="${len}" rx="1.2" fill="url(#gIdx)" stroke="#5a420f" stroke-width=".5"/><rect x="${c - 1.3}" y="${c - 105}" width="2.6" height="${len - 4}" rx=".8" fill="#f2f6e6" opacity=".92"/></g>`);
    }
    const sub = (x, y, id, labels, marks) => {
      const t = [];
      for (let i = 0; i < marks; i++) { const a = (i * 360) / marks, rad = (a * Math.PI) / 180, big = labels.length && i % (marks / labels.length) === 0;
        t.push(`<line x1="${x + 22 * Math.sin(rad)}" y1="${y - 22 * Math.cos(rad)}" x2="${x + (big ? 17.5 : 19.5) * Math.sin(rad)}" y2="${y - (big ? 17.5 : 19.5) * Math.cos(rad)}" stroke="#e9d38a" stroke-width="${big ? 1 : 0.5}"/>`); }
      const lab = labels.map((l, i) => { const a = (i * 2 * Math.PI) / labels.length; return `<text x="${x + 12.5 * Math.sin(a)}" y="${y - 12.5 * Math.cos(a) + 2.2}" text-anchor="middle" font-size="5.6" fill="#e9d38a" font-family="-apple-system,Helvetica,sans-serif">${l}</text>`; }).join("");
      return `<circle cx="${x}" cy="${y}" r="25" fill="url(#gSub)" stroke="url(#gIdx)" stroke-width="1.6"/>${Array.from({ length: 40 }, (_, i) => `<circle cx="${x}" cy="${y}" r="${24 - i * 0.6}" fill="none" stroke="#000" stroke-width=".25" opacity=".18"/>`).join("")}${t.join("")}${lab}
        <g id="${id}"><line x1="${x}" y1="${y + 5}" x2="${x}" y2="${y - 20}" stroke="url(#gIdx)" stroke-width="1.6" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="2.4" fill="url(#gIdx)"/></g>`;
    };
    const [dx, dy] = P(120, 89);
    return `<svg viewBox="0 0 300 300" aria-label="Watch" id="watchSvg" style="cursor:pointer">
      <defs>
        <linearGradient id="gCase" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbe7a1"/><stop offset=".25" stop-color="#c9982c"/><stop offset=".5" stop-color="#fff3c4"/><stop offset=".75" stop-color="#a87a1e"/><stop offset="1" stop-color="#e9c766"/></linearGradient>
        <linearGradient id="gIdx" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a87a1e"/><stop offset=".5" stop-color="#fff0b8"/><stop offset="1" stop-color="#b8862b"/></linearGradient>
        <radialGradient id="gDial" cx=".5" cy=".38" r=".7"><stop offset="0" stop-color="#2f8a3c"/><stop offset=".55" stop-color="#145a22"/><stop offset="1" stop-color="#06260d"/></radialGradient>
        <radialGradient id="gSub" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#1c6a2b"/><stop offset="1" stop-color="#0a3814"/></radialGradient>
        <linearGradient id="gGlass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2.6" stdDeviation="2" flood-opacity=".7"/></filter>
      </defs>
      <rect x="${c + 133}" y="${c - 74}" width="9" height="16" rx="2.5" fill="url(#gCase)" transform="rotate(45 ${c + 137} ${c - 66})" id="pushA"/>
      <rect x="${c + 133}" y="${c + 58}" width="9" height="16" rx="2.5" fill="url(#gCase)" transform="rotate(-45 ${c + 137} ${c + 66})"/>
      <rect x="${c + 140}" y="${c - 9}" width="9" height="18" rx="2.5" fill="url(#gCase)"/>
      <circle cx="${c}" cy="${c}" r="146" fill="url(#gCase)"/>
      <circle cx="${c}" cy="${c}" r="136" fill="url(#gCase)" transform="rotate(180 ${c} ${c})"/>
      <circle cx="${c}" cy="${c}" r="133.5" fill="none" stroke="#6b4e12" stroke-width=".8"/>
      ${nums.join("")}
      <circle cx="${c}" cy="${c}" r="122" fill="url(#gDial)" stroke="#2b2111" stroke-width="1.6"/>
      <g opacity=".1">${Array.from({ length: 90 }, (_, i) => L(i * 4, 0, 122, 'stroke="#fff" stroke-width=".5"')).join("")}</g>
      ${track.join("")}${idx.join("")}
      <text x="${c}" y="${c - 66}" text-anchor="middle" font-family="Didot,'Bodoni 72',Georgia,serif" font-size="17" letter-spacing="5" fill="url(#gIdx)">LIFE</text>
      <text x="${c}" y="${c - 54}" text-anchor="middle" font-family="-apple-system,Helvetica,sans-serif" font-size="5.6" letter-spacing="2.4" fill="#e9d38a">BLUMENFELD</text>
      <text x="${c}" y="${c - 30}" text-anchor="middle" font-family="-apple-system,Helvetica,sans-serif" font-size="5.4" letter-spacing="2.2" fill="#e9d38a">CHRONOGRAPH</text>
      <text x="${c}" y="${c + 92}" text-anchor="middle" font-family="-apple-system,Helvetica,sans-serif" font-size="4.6" letter-spacing="1.8" fill="#bfa45a">AUTOMATIC · EST. 2026</text>
      ${sub(c - 55, c, "subS", ["60", "20", "40"], 60)}
      ${sub(c + 55, c, "subM", ["30", "10", "20"], 30)}
      ${sub(c, c + 55, "subH", ["12", "3", "6", "9"], 24)}
      <g filter="url(#sh)" transform="rotate(30 ${dx} ${dy})"><rect x="${dx - 11}" y="${dy - 8}" width="22" height="16" rx="2" fill="#f6f1e4" stroke="url(#gIdx)" stroke-width="2"/>
      <text id="wDate" x="${dx}" y="${dy + 4.6}" text-anchor="middle" font-family="-apple-system,Helvetica,sans-serif" font-weight="700" font-size="12" fill="#111">1</text></g>
      <g id="hh" filter="url(#sh)"><path d="M${c - 4.6} ${c + 12} L${c - 4} ${c - 50} L${c} ${c - 62} L${c + 4} ${c - 50} L${c + 4.6} ${c + 12} Z" fill="url(#gIdx)" stroke="#5a420f" stroke-width=".5"/><rect x="${c - 1.4}" y="${c - 52}" width="2.8" height="38" rx="1" fill="#f2f6e6" opacity=".92"/></g>
      <g id="mm" filter="url(#sh)"><path d="M${c - 3.8} ${c + 16} L${c - 3} ${c - 90} L${c} ${c - 102} L${c + 3} ${c - 90} L${c + 3.8} ${c + 16} Z" fill="url(#gIdx)" stroke="#5a420f" stroke-width=".5"/><rect x="${c - 1.2}" y="${c - 92}" width="2.4" height="68" rx=".9" fill="#f2f6e6" opacity=".92"/></g>
      <g id="cs" filter="url(#sh)"><line x1="${c}" y1="${c + 28}" x2="${c}" y2="${c - 118}" stroke="#ff6a3d" stroke-width="1.3" stroke-linecap="round"/><path d="M${c - 2.6} ${c - 104} L${c} ${c - 118} L${c + 2.6} ${c - 104} Z" fill="#ff6a3d"/><circle cx="${c}" cy="${c + 22}" r="4" fill="#ff6a3d"/></g>
      <circle cx="${c}" cy="${c}" r="5.5" fill="url(#gIdx)" stroke="#5a420f" stroke-width=".8"/><circle cx="${c}" cy="${c}" r="1.8" fill="#ff6a3d"/>
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
  const NY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", day: "numeric" });
  const rot = (id, deg, x = 150, y = 150) => { const el = document.getElementById(id); if (el) el.setAttribute("transform", `rotate(${deg.toFixed(3)} ${x} ${y})`); };
  function tickWatch() {
    if (document.getElementById("hh")) {
      const now = new Date(), p = Object.fromEntries(NY.formatToParts(now).map((x) => [x.type, x.value]));
      const beat = Math.floor(now.getMilliseconds() / 125) * 125;
      const s = +p.second + beat / 1000, m = +p.minute + s / 60, h = (+p.hour % 12) + m / 60;
      rot("hh", h * 30); rot("mm", m * 6);
      rot("subS", s * 6, 95, 150);
      const cm = Math.floor(chronoMs() / 125) * 125 / 1000; // chrono seconds, in 1/8 beats
      rot("cs", (cm % 60) * 6); rot("subM", ((cm / 60) % 30) * 12, 205, 150); rot("subH", ((cm / 3600) % 12) * 30, 150, 205);
      const d = document.getElementById("wDate");
      if (d && d.textContent !== p.day) d.textContent = p.day;
    }
    requestAnimationFrame(tickWatch);
  }
  requestAnimationFrame(tickWatch);

  // ---------- Home ----------
  function pHome() {
    const open = D.todo.filter((t) => !t.done), dueToday = open.filter((t) => t.due && t.due <= todayKey()).length;
    const wishes = D.wish.filter((w) => !w.got);
    const active = D.pkgs.filter((p) => !p.delivered && !p.archived), ofd = active.filter((p) => p.statusCode === 4).length;
    const trimIn = trim?.ready && Array.isArray(trim.incoming) ? trim.incoming.length : 0;
    const n = (v, fmt) => `<span data-count="${+v || 0}"${fmt ? ` data-fmt="${fmt}"` : ""}>${fmt === "usd" ? usd(v, false) : v}</span>`;
    const moneyTile = money?.ready
      ? `<div class="row2"><div><div class="big money">${n(money.cash ?? 0, "usd")}</div><div class="sm">Cash across accounts</div></div>
         <div style="text-align:right"><div class="big money" style="font-size:18px;color:var(--gold2)">${n(money.credit ?? 0, "usd")}</div><div class="sm">Credit owed</div></div></div>`
      : `<div class="sm">${esc(money?.why || "Loading…")}</div>`;
    const max = trim?.ready ? Math.max(1, ...trim.week.map((d) => d.sales)) : 1;
    const trimTile = trim?.ready
      ? `<div class="row2"><div><div class="big money">${n(trim.daily.sales, "usd")}</div><div class="sm">Today · ${usd(trim.wtd.sales, false)} wk</div></div>
         <div class="spark">${trim.week.map((d, i) => `<i style="height:${Math.max(6, Math.round((d.sales / max) * 100))}%;animation-delay:${0.3 + i * 0.06}s;${d.day > trim.today ? "opacity:.25" : ""}"></i>`).join("")}</div></div>`
      : `<div class="sm">${esc(trim?.why || "Loading…")}</div>`;
    const tile = (href, ic, name, body, i, cls = "") => `<a class="tile ${cls}" href="#${href}" style="--i:${i}"><div class="row"><div class="ic">${svg(ic)}</div><div class="nm" style="margin:0">${name}</div></div>${body}</a>`;
    return `<div class="watch">${watchSVG()}</div>
    <div class="grid${lastRoute === null || true ? " enterTiles" : ""}">
      ${tile("money", "wallet", "Money", moneyTile, 0, "wide")}
      ${tile("trim", "chart", "Trim Sales", trimTile, 1, "wide")}
      ${tile("todo", "check", "To-Do", `<div><div class="big">${n(open.length)}</div><div class="sm">${dueToday ? dueToday + " due or late" : "open"}</div></div>`, 2)}
      ${tile("pkgs", "box", "Incoming", `<div><div class="big">${n(active.length + trimIn)}</div><div class="sm">${ofd ? ofd + " out for delivery" : `${active.length} personal · ${trimIn} Trim PO${trimIn === 1 ? "" : "s"}`}</div></div>`, 3)}
      ${tile("wish", "gift", "Wish List", `<div><div class="big">${n(wishes.length)}</div><div class="sm">${usd(wishes.reduce((t, w) => t + (+w.price || 0), 0), false)} total</div></div>`, 4)}
      ${tile("photos", "photo", "Photos", `<div><div class="big" style="font-size:16px;color:var(--mute)">Soon</div><div class="sm">OneDrive folders</div></div>`, 5)}
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
