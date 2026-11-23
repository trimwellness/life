// Life — Jeff's master app. One page; sections open from the home tiles (#todo, #wish, #trim, #pkgs (Incoming), #money, #photos, #guns).
(() => {
  const $app = document.getElementById("app");
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} },
  };
  let token = store.get("life.token");
  let D = { todo: [], wish: [], pkgs: [], events: [], status: {} };
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
    const r = await fetch(path.startsWith("/") ? path : "/api/" + path, {
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
    try { D = { todo: [], wish: [], pkgs: [], events: [], status: {}, ...(await api("all")) }; } catch (e) { if (e.message !== "signin") $app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    render();
    loadTrim(); loadMoney(); loadGV(); loadAlbums(); pwLoad();
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
  const route = () => location.hash.replace(/^#/, "").split("?")[0];
  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); if (route() === "trim" || route() === "pkgs") loadTrim(); });
  const TABS = [["", "Home", "home"], ["money", "Money", "wallet"], ["trim", "Trim", "chart"], ["guns", "Vault", "shield"], ["more", "More", "grid"]];
  const MORE = ["todo", "pkgs", "wish", "photos", "keys", "cal", "docs"];
  const ICON = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M3 10h18"/><circle cx="16.5" cy="15" r="1.2"/>',
    chart: '<path d="M3 20h18"/><path d="M6 16v-4M11 16V7M16 16v-6M20 5l-5 4-4-3-6 5"/>',
    check: '<path d="M8.5 12.5l2.5 2.5 5-6"/><rect x="3.5" y="3.5" width="17" height="17" rx="4"/>',
    box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    gift: '<rect x="3" y="8" width="18" height="13" rx="1.5"/><path d="M12 8v13M3 12.5h18M12 8C10 4 6 4 6 6.5S12 8 12 8zm0 0c2-4 6-4 6-1.5S12 8 12 8z"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.3"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><circle cx="8.5" cy="14" r="1"/><circle cx="12" cy="14" r="1"/>',
    id: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16c.6-1.6 1.7-2.3 3-2.3s2.4.7 3 2.3M14 10h4M14 13.5h3"/>',
    leaf: '<path d="M12 21v-6M12 15c-4-1-7-4-8-9 4 0 7 2 8 5 1-3 4-5 8-5-1 5-4 8-8 9z"/>',
    car: '<path d="M4 16v-3.5l2-4.5h12l2 4.5V16M3 16h18v3H3zM7 19v1.5M17 19v1.5"/><circle cx="7.5" cy="13.5" r="1"/><circle cx="16.5" cy="13.5" r="1"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.3 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.3-3.5-8.5s1-6 3.5-8.5z"/>',
    plus: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/>',
    doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>',
    shield: '<path d="M12 3l8 3v6c0 4.6-3.4 8.2-8 9-4.6-.8-8-4.4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    photo: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
  const top = (title, right = "") => {
    const isTab = TABS.some(([r]) => r === route());
    const eyebrow = { "To-Do": "Today’s list", "Wish List": "Wants", "Trim Sales": "Trim Wellness", Incoming: "Deliveries", Money: "Portfolio", "Photo Vault": "Memories", "Gun Vault": "Safe Ledger", Passwords: "Encrypted", Calendar: "Schedule", Documents: "Encrypted" }[title] || "Life";
    return `<div class="top">${isTab ? "" : `<button class="back" data-go="">‹ Home</button>`}<div style="flex:1"></div>${right}</div><h1 data-eyebrow="${eyebrow}">${title}</h1>`;
  };

  function tabBar() {
    let nav = document.querySelector("nav.tabs");
    if (!nav) {
      nav = document.createElement("nav");
      nav.className = "tabs";
      nav.innerHTML = `<div class="in"><span class="ind"></span>${TABS.map(([r, n, ic]) => r === "more" ? `<a href="#" data-act="more" data-tab="more">${svg(ic)}<span>${n}</span></a>` : `<a href="#${r}" data-tab="${r}">${svg(ic)}<span>${n}</span></a>`).join("")}</div>`;
      document.body.appendChild(nav);
      const fab = document.createElement("button");
      fab.className = "gfab"; fab.dataset.act = "gerald"; fab.setAttribute("aria-label", "Ask Gerald"); fab.innerHTML = "G";
      document.body.appendChild(fab);
    }
    const r = route(), cur = MORE.includes(r) ? "more" : r, i = TABS.findIndex(([x]) => x === cur);
    nav.querySelectorAll("a").forEach((a) => a.classList.toggle("on", a.dataset.tab === cur));
    const ind = nav.querySelector(".ind");
    ind.style.opacity = i < 0 ? 0 : 1;
    if (i >= 0) ind.style.left = `calc(${i * 20}% + 4px)`;
  }
  // "More": every other section in one sheet.
  function moreSheet() {
    const open = D.todo.filter((t) => !t.done).length, inc = D.pkgs.filter((p) => !p.delivered && !p.archived).length + (trim?.ready && Array.isArray(trim.incoming) ? trim.incoming.length : 0), wishes = D.wish.filter((w) => !w.got).length;
    const t = (href, ic, name, sub) => `<a class="more-t" href="#${href}" data-act="close-more">${svg(ic)}<b>${name}</b><small>${sub}</small></a>`;
    const nx = upcoming(1)[0];
    sheet(`<div class="more-h">Everything</div><div class="more-g">
      ${t("cal", "cal", "Calendar", nx ? esc(nx[1].title).slice(0, 18) : "Nothing soon")}${t("todo", "check", "To-Do", `${open} open`)}${t("pkgs", "box", "Incoming", `${inc} on the way`)}${t("wish", "gift", "Wish List", `${wishes} item${wishes === 1 ? "" : "s"}`)}
      ${t("photos", "photo", "Photo Vault", PV.albums ? `${PV.total || 0} photos` : "Albums")}${t("keys", "lock", "Passwords", PW.key ? `${PW.vault.items.length} logins` : "Locked")}${t("docs", "id", "Documents", PW.key ? `${(PW.vault.docs || []).length} saved` : "Locked")}
      </div>`);
    document.getElementById("modal")?.classList.add("more-modal");
  }

  let lastRoute = null;
  function render() {
    const r = route();
    const page = { todo: pTodo, wish: pWish, trim: pTrim, pkgs: pPkgs, money: pMoney, photos: pPhotos, guns: pGuns, keys: pKeys, cal: pCal, docs: pDocs }[r] || pHome;
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
  // Line-drawing watch: thin dark-gold outlines on black, like a technical illustration. Centre (150, 220).
  const WX = 150, WY = 220;
  function watchSVG() {
    const c = WX, cy = WY, P = (a, r) => [c + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
    const L = (a, r1, r2, st = "") => { const [x1, y1] = P(a, r1), [x2, y2] = P(a, r2); return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" ${st}/>`; };
    const F = "-apple-system,Helvetica,Arial,sans-serif", G = "#b38b3a", G2 = "#d9b45f", G3 = "#7d5f24";
    // bracelet: three-row links running off the top and bottom
    const links = (y0, y1) => { let o = `<path d="M88 ${y0} V${y1} M212 ${y0} V${y1} M122 ${y0} V${y1} M178 ${y0} V${y1}"/>`; for (let y = y0; y <= y1; y += 26) o += `<path d="M88 ${y} H122 M178 ${y} H212"/><path d="M122 ${y + 13} H178"/>`; return o; };
    const tach = [60, 65, 70, 75, 80, 90, 100, 110, 120, 130, 150, 170, 200, 240, 300, 400, 500];
    const bez = tach.map((v) => { const a = ((3600 / v) * 6) % 360, [x, y] = P(a, 118.5); return `<text x="${x.toFixed(1)}" y="${(y + 2.6).toFixed(1)}" text-anchor="middle" font-size="7.4" fill="${G2}" stroke="none" font-family="${F}">${v}</text>`; }).join("");
    const bezDots = tach.map((v) => { const [x, y] = P(((3600 / v) * 6) % 360, 111.5); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r=".9" fill="${G2}" stroke="none"/>`; }).join("");
    const track = Array.from({ length: 240 }, (_, i) => L(i * 1.5, 94, i % 4 ? 90 : 87.5, `stroke-width="${i % 4 ? 0.35 : 0.6}"`)).join("");
    const idx = [];
    for (let h = 0; h < 12; h++) { if (h === 3) continue; const [x1, y1] = P(h * 30, 85), [x2, y2] = P(h * 30, h % 3 ? 74 : 70);
      idx.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${G2}" stroke-width="${h % 3 ? 3.2 : 4}" stroke-linecap="butt"/>`); }
    const R = 26;
    const sub = (x, y, id, labels, marks) => {
      let o = `<circle cx="${x}" cy="${y}" r="${R}" fill="none"/>`;
      for (let i = 0; i < marks; i++) { const a = (i * 2 * Math.PI) / marks, big = i % (marks / labels.length) === 0;
        o += `<line x1="${(x + R * Math.sin(a)).toFixed(2)}" y1="${(y - R * Math.cos(a)).toFixed(2)}" x2="${(x + (R - (big ? 4.5 : 2.5)) * Math.sin(a)).toFixed(2)}" y2="${(y - (R - (big ? 4.5 : 2.5)) * Math.cos(a)).toFixed(2)}" stroke-width="${big ? 0.8 : 0.35}"/>`; }
      o += labels.map((l, i) => { const a = (i * 2 * Math.PI) / labels.length; return `<text x="${(x + (R - 11) * Math.sin(a)).toFixed(1)}" y="${(y - (R - 11) * Math.cos(a) + 2.3).toFixed(1)}" text-anchor="middle" font-size="6.2" fill="${G2}" stroke="none" font-family="${F}">${l}</text>`; }).join("");
      return o + `<g id="${id}"><line x1="${x}" y1="${y + 4}" x2="${x}" y2="${y - R + 5}" stroke="${G2}" stroke-width="1.3" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="2.6" fill="none" stroke="${G2}" stroke-width=".9"/></g>`;
    };
    const hand = (id, len, w) => `<g id="${id}"><path d="M${c - w} ${cy + 14} L${c - w * 0.75} ${cy - len + 14} L${c} ${cy - len} L${c + w * 0.75} ${cy - len + 14} L${c + w} ${cy + 14} Z" fill="none" stroke="${G2}" stroke-width="1.1" stroke-linejoin="round"/><line x1="${c}" y1="${cy - len + 16}" x2="${c}" y2="${cy - 12}" stroke="${G2}" stroke-width=".6"/></g>`;
    return `<svg viewBox="0 0 300 440" aria-label="Watch" id="watchSvg" style="cursor:pointer">
      <defs><linearGradient id="braceFade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="440"><stop offset="0" stop-color="${G}" stop-opacity="0"/><stop offset=".19" stop-color="${G}"/><stop offset=".81" stop-color="${G}"/><stop offset="1" stop-color="${G}" stop-opacity="0"/></linearGradient></defs>
      <g fill="none" stroke="${G}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <g stroke="url(#braceFade)">${links(0, 92)}${links(348, 440)}</g>
        <path d="M88 92 C76 112 66 140 62 170 M212 92 C224 112 234 140 238 170 M88 348 C76 328 66 300 62 270 M212 348 C224 328 234 300 238 270"/>
        <path d="M84 98 H216 M84 342 H216" stroke="${G3}"/>
        <rect x="273" y="204" width="13" height="32" rx="3"/>${Array.from({ length: 7 }, (_, i) => `<line x1="${275 + i * 1.6}" y1="205" x2="${275 + i * 1.6}" y2="235" stroke-width=".4"/>`).join("")}
        <g transform="rotate(-30 ${c} ${cy})"><rect x="${c + 128}" y="${cy - 9}" width="12" height="18" rx="2.5"/><line x1="${c + 124}" y1="${cy - 5}" x2="${c + 128}" y2="${cy - 5}"/><line x1="${c + 124}" y1="${cy + 5}" x2="${c + 128}" y2="${cy + 5}"/></g>
        <g transform="rotate(30 ${c} ${cy})"><rect x="${c + 128}" y="${cy - 9}" width="12" height="18" rx="2.5"/><line x1="${c + 124}" y1="${cy - 5}" x2="${c + 128}" y2="${cy - 5}"/><line x1="${c + 124}" y1="${cy + 5}" x2="${c + 128}" y2="${cy + 5}"/></g>
        <circle cx="${c}" cy="${cy}" r="128" fill="none" stroke-width="1.2"/>
        <circle cx="${c}" cy="${cy}" r="125.5" stroke="${G3}" stroke-width=".6"/>
        <circle cx="${c}" cy="${cy}" r="108"/>
        <circle cx="${c}" cy="${cy}" r="104" stroke="${G3}" stroke-width=".6"/>
        ${bezDots}
        <circle cx="${c}" cy="${cy}" r="98"/>
        ${track}
        <circle cx="${c}" cy="${cy}" r="86" stroke-width=".6"/>
        ${idx.join("")}
        ${sub(c, cy - 52, "subM", ["30", "10", "20"], 30)}
        ${sub(c - 52, cy, "subS", ["60", "20", "40"], 60)}
        ${sub(c, cy + 52, "subH", ["12", "3", "6", "9"], 24)}
        <rect x="${c + 30}" y="${cy - 7.5}" width="22" height="15" rx="1"/><rect x="${c + 53}" y="${cy - 7.5}" width="14" height="15" rx="1"/>
      </g>
      ${bez}
      <path id="tachArc" d="M ${P(9, 118.5)[0]} ${P(9, 118.5)[1]} A 118.5 118.5 0 0 1 ${P(38, 118.5)[0]} ${P(38, 118.5)[1]}" fill="none"/>
      <text font-size="7" letter-spacing="1.5" fill="${G2}" font-family="${F}" dy="2.6"><textPath href="#tachArc">BLUMENFELD</textPath></text>
      <text id="wDay" x="${c + 41}" y="${cy + 3}" text-anchor="middle" font-size="7.5" fill="${G2}" font-family="${F}">MON</text>
      <text id="wDate" x="${c + 60}" y="${cy + 3}" text-anchor="middle" font-size="8" fill="${G2}" font-family="${F}">1</text>
      ${hand("hh", 60, 4.6)}${hand("mm", 92, 3.6)}
      <g id="cs"><line x1="${c}" y1="${cy + 24}" x2="${c}" y2="${cy - 96}" stroke="${G2}" stroke-width="1" stroke-linecap="round"/><path d="M${c - 2.2} ${cy - 84} L${c} ${cy - 96} L${c + 2.2} ${cy - 84} Z" fill="${G2}"/><circle cx="${c}" cy="${cy + 18}" r="3.2" fill="none" stroke="${G2}" stroke-width="1"/></g>
      <circle cx="${c}" cy="${cy}" r="4.6" fill="none" stroke="${G2}" stroke-width="1.2"/><circle cx="${c}" cy="${cy}" r="1.3" fill="${G2}"/>
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
  const rot = (id, deg, x = WX, y = WY) => { const el = document.getElementById(id); if (el) el.setAttribute("transform", `rotate(${deg.toFixed(3)} ${x} ${y})`); };
  function tickWatch() {
    if (!document.hidden && document.getElementById("hh")) {
      const now = new Date(), p = Object.fromEntries(NY.formatToParts(now).map((x) => [x.type, x.value]));
      const beat = Math.floor(now.getMilliseconds() / 125) * 125;
      const s = +p.second + beat / 1000, m = +p.minute + s / 60, h = (+p.hour % 12) + m / 60;
      rot("hh", h * 30); rot("mm", m * 6);
      rot("subS", s * 6, WX - 52, WY);
      const cm = Math.floor(chronoMs() / 125) * 125 / 1000; // chrono seconds, in 1/8 beats
      rot("cs", (cm % 60) * 6); rot("subM", ((cm / 60) % 30) * 12, WX, WY - 52); rot("subH", ((cm / 3600) % 12) * 30, WX, WY + 52);
      const d = document.getElementById("wDate");
      if (d && d.textContent !== p.day) d.textContent = p.day;
      const w = document.getElementById("wDay"), wd = String(p.weekday || "").toUpperCase();
      if (w && w.textContent !== wd) w.textContent = wd;
    }
    // Hands only move in 1/8-second beats, so update 8 times a second instead of every frame.
    setTimeout(tickWatch, 125 - (Date.now() % 125) + 2);
  }
  tickWatch();

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
      const W = 300, H = 40, pts = wk.map((d, i) => [(i / 6) * W, H - 6 - (d.sales / max) * (H - 14)]);
      const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
      const area = pts.length ? `${line} L${pts[pts.length - 1][0].toFixed(1)} ${H} L0 ${H} Z` : "";
      const last = pts[pts.length - 1] || [0, H];
      const diff = trim.wtd.sales - trim.lastWeekToDate.sales;
      trimBody = `<div class="tsm"><div class="tsm-l"><div class="lbl">Today</div><div class="tsm-num">${n(trim.daily.sales, "usd")}</div>
          <div class="delta ${diff >= 0 ? "up" : "down"}">${diff >= 0 ? "▲" : "▼"} ${usd(Math.abs(diff), false)} <small>vs last wk</small></div></div>
        <svg class="chart tsm-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4af37" stop-opacity=".35"/><stop offset="1" stop-color="#d4af37" stop-opacity="0"/></linearGradient></defs>
          <path d="${area}" fill="url(#ga)" class="area"/><path d="${line}" fill="none" stroke="#f0d27a" stroke-width="1.6" class="draw" vector-effect="non-scaling-stroke"/>
          <circle cx="${last[0]}" cy="${last[1]}" r="3" fill="#f6dd8c" class="dot"/></svg></div>
        <div class="tsm-cols"><span><i>Wk</i> ${usd(trim.wtd.sales, false)}</span><span><i>Mo</i> ${usd(trim.mtd.sales, false)}</span><span><i>Yr</i> ${usd(trim.ytd.sales, false)}</span></div>`;
    }

    const box = (href, ic, title, val, sub, i, fmt) => `<a class="lux qbox" href="#${href}" style="--i:${i}"><div class="lux-h"><span>${title}</span><span class="aic">${svg(ic)}</span></div>
      <div class="qv">${val === "" ? `<span class="qlock">${svg("lock")}</span>` : n(val, fmt)}</div><div class="qs">${sub}</div></a>`;
    const row = (href, ic, title, sub, val, i) => `<a class="arow" href="#${href}" style="--i:${i}"><span class="aic">${svg(ic)}</span>
      <span class="grow"><span class="at">${title}</span><span class="as">${sub}</span></span><span class="av">${val}</span><span class="chev">›</span></a>`;
    const nextTodo = open[0] ? esc(open[0].text) + (open[0].due ? ` · ${open[0].due === today ? "today" : fmtDay(open[0].due)}` : "") : "Nothing open";
    const nextPkg = ofd ? `${ofd} out for delivery` : active[0]?.status ? `${esc(active[0].label || "Package")} · ${esc(active[0].status)}` : `${active.length} personal · ${trimIn} Trim PO${trimIn === 1 ? "" : "s"}`;

    return `<section class="hero">
        <div class="spot"></div>
        <div class="duo"><div class="combo">
          <div class="watch">${watchSVG()}</div>
          <figure class="us"><picture><source srcset="/us.webp?v=6" type="image/webp"><img src="/us.png?v=6" alt="Jeff and Lindsey" draggable="false"></picture></figure>
        </div></div>
        <button class="askbar" data-act="gerald"><span class="gdot">G</span><span class="grow">Ask Gerald anything…</span><span class="chev">›</span></button>
      </section>
      <a class="lux" href="#money" style="--i:0"><div class="lux-h"><span>Portfolio</span><span class="chev">›</span></div>${portfolio}</a>
      ${(() => { const up = upcoming(3); return `<a class="lux lux-sm" href="#cal" style="--i:1"><div class="lux-h"><span>Calendar</span><span class="chev">›</span></div>
        ${up.length ? up.map(([d, e]) => `<div class="hc-row"><span class="cal-bar" style="background:${(KIND[e.kind] || KIND.other)[1]}"></span><span class="hc-when">${esc(dayLabel(d).replace(/^(\w+day), /, ""))}<small>${clk(e.time)}</small></span><span class="hc-t">${esc(e.title)}</span></div>`).join("") : `<div class="sub">Nothing coming up. Tap to add.</div>`}</a>`; })()}
      <a class="lux lux-sm" href="#trim" style="--i:1"><div class="lux-h"><span>Trim Wellness</span><span class="chev">›</span></div>${trimBody}</a>
      <div class="quad">
        ${box("todo", "check", "To-Do", open.length, late ? `<em>${late} due</em>${esc(open[0]?.text || "")}` : nextTodo, 2)}
        ${box("pkgs", "box", "Incoming", active.length + trimIn, nextPkg, 3)}
        ${box("wish", "gift", "Wish List", wishes.length, wishes.length ? usd(wishes.reduce((t, w) => t + (+w.price || 0), 0), false) + " total" : "Empty", 4)}
        ${box("photos", "photo", "Photo Vault", PV.albums ? PV.total || 0 : 0, PV.albums ? `${PV.albums.length} album${PV.albums.length === 1 ? "" : "s"}` : "Your albums", 5)}
        ${(() => { const t = gvTotals(); return box("guns", "shield", "Gun Vault", t ? Math.round(t.all) : 0, t ? `${GV.data.firearms.length} firearms · ${GV.data.nfa.length} NFA` : "Safe Ledger", 6, "usd"); })()}
        ${box("keys", "lock", "Passwords", "", PW.key ? `${PW.vault.items.length} logins` : "Encrypted · tap to unlock", 7)}
      </div>
`;
  }

  // Original business maxims, one per day of the year.
  const QUOTES = [
    "Build the business you'd want to buy.",
    "The customer remembers how you made them feel long after they forget the price.",
    "Standards aren't what you say. They're what you tolerate.",
    "Small wins, stacked daily, beat big plans left on paper.",
    "Lead from the front on the hard days. That's the only time it counts.",
    "Cash is the scoreboard. Culture is how you keep winning.",
    "Hire for attitude, train for skill, keep for character.",
    "Every bay full, every promise kept.",
    "If it isn't measured, it's just a guess with confidence.",
    "Your team watches what you do far more than what you say.",
    "Done right beats done twice.",
    "The best time to fix a problem is before the customer finds it.",
    "Momentum is built in the boring hours.",
    "A follow-up call is worth ten promises.",
    "Be the calmest person in the room when things go sideways.",
    "Profit is the reward for solving problems people will pay to have solved.",
    "Invest in people before you invest in equipment.",
    "Excuses don't scale. Systems do.",
    "Win the morning and the rest of the day follows.",
    "Make the next step obvious for your team, and they'll take it.",
    "Trust is earned in drops and lost in buckets.",
    "The details nobody sees are the ones that build the reputation.",
    "Grow quietly. Let the results be loud.",
    "Pressure is a privilege. It means something's riding on you.",
    "Don't manage the numbers. Manage the habits that make them.",
    "A good leader takes a little more blame and a little less credit.",
    "Discipline today buys freedom tomorrow.",
    "Treat every Tuesday like it's Black Friday and Black Friday takes care of itself.",
    "Build it with someone who believes in you, and build it for them too.",
    "Consistency is the most underrated competitive advantage.",
    "The work you avoid is usually the work that matters most.",
    "Raise the floor before you chase the ceiling.",
    "Wealth is patience with a plan.",
    "Show up the same on the hard days as the easy ones.",
    "Teach the why and the how takes care of itself.",
    "Protect your reputation like it's your best asset, because it is.",
    "Say what you'll do, do what you said, then do a little more.",
    "Good people stay where they're seen, heard and paid fairly.",
    "Clarity is kindness. Tell people exactly what winning looks like.",
    "You don't rise to your goals; you fall to your systems.",
  ];
  const dayOfYear = () => { const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" })); return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5); };

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
      <button class="btn">Add</button></div><label class="duefield"><span>Due date</span><input name="due" type="date"></label></form>
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
    const head = top("Money", `<button class="btn ghost sm" data-act="money-refresh">${money?.syncing ? "Syncing…" : "Sync banks"}</button>`);
    if (!money || (money.syncing && !money.ready)) return head + `<div class="empty">${money?.syncing ? "Syncing with your banks…" : "Loading…"}</div>`;
    if (!money.ready) return head + `<div class="card"><div style="font-weight:600">Bank + Venmo</div><div class="sub">${esc(money.why)}. Balances and transactions will come straight from Blumenfeld Finance’s Plaid connections.</div></div>`;
    const accts = money.accounts || [];
    const grp = (t) => accts.filter((a) => a.type === t);
    const acct = (a) => `<div class="item"><div class="grow"><div class="t">${esc(a.name)}</div><div class="sub">${esc(a.institution || "")}${a.mask ? " ··" + esc(a.mask) : ""}</div></div><div class="money" style="font-weight:600">${usd(a.balance)}</div></div>`;
    const tx = (money.transactions || []).slice(0, 40);
    return head + `<div class="stats" style="margin-top:12px"><div class="stat"><div class="k">Cash</div><div class="v money">${usd(money.cash ?? 0)}</div></div>
      <div class="stat"><div class="k">Credit owed</div><div class="v money">${usd(money.credit ?? 0)}</div></div></div>
      ${money.lastSync ? `<div class="sub" style="margin-top:6px">Banks last synced ${ago(Date.parse(money.lastSync))} · syncs automatically every 2 hours</div>` : ""}
      ${(money.syncErrors || []).length ? `<div class="card" style="margin-top:10px;border-color:rgba(255,122,107,.5)"><b style="color:#ff9585">Needs attention</b>${money.syncErrors.map((x) => `<div class="sub" style="margin-top:4px">${esc(x.bank)}: ${esc(x.error)}</div>`).join("")}<div class="sub" style="margin-top:6px">Open Blumenfeld Finance and reconnect that bank.</div></div>` : ""}
      ${["depository", "credit", "other"].map((t) => grp(t).length ? `<h3>${{ depository: "Bank & Venmo", credit: "Credit cards", other: "Other" }[t]}</h3><div class="list">${grp(t).map(acct).join("")}</div>` : "").join("")}
      ${tx.length ? `<h3>Recent</h3><div class="list">${tx.map((x) => `<div class="item"><div class="grow"><div class="t">${esc(x.name)}</div><div class="sub">${esc(x.date)}${x.pending ? " · pending" : ""} · ${esc(x.account || "")}</div></div><div class="money" style="color:${x.amount < 0 ? "var(--good)" : "var(--text)"}">${x.amount < 0 ? "+" : "−"}${usd(Math.abs(x.amount))}</div></div>`).join("")}</div>` : ""}`;
  }

  // ---------- Photo Vault: your own albums, uploaded from the phone ----------
  const PV = { albums: null, album: null, photos: [], up: null };
  const img = (p, s = "t") => `/vault/img/${p.id}?s=${s}&k=${p.k}`;
  async function loadAlbums() {
    try { const r = await api("vault"); PV.albums = r.albums; PV.total = r.total; } catch (e) { PV.albums = []; toast(e.message); }
    if (["", "photos"].includes(route())) render();
  }
  async function openAlbum(id) {
    PV.album = (PV.albums || []).find((a) => a.id === id) || { id, name: "" }; PV.photos = null; render(); window.scrollTo(0, 0);
    try { const r = await api(`vault/albums/${id}/photos`); PV.album = { ...PV.album, ...r.album }; PV.photos = r.photos; } catch (e) { toast(e.message); PV.photos = []; }
    render();
  }
  function pPhotos() {
    if (PV.album) return pAlbum();
    const head = top("Photo Vault", `<button class="btn ghost sm" data-act="pv-new">+ Album</button>`);
    if (!PV.albums) { setTimeout(loadAlbums, 0); return head + `<div class="empty">Loading…</div>`; }
    if (!PV.albums.length) return head + `<div class="card" style="text-align:center;padding:30px 18px"><div class="hero-num" style="font-size:28px">Start your vault</div>
      <div class="sub" style="margin:8px 0 18px">Make an album, then add photos from your phone.</div><button class="btn" data-act="pv-new">Create first album</button></div>`;
    return head + `<div class="pv-albums">${PV.albums.map((a, i) => `<button class="pv-album" data-act="pv-album" data-id="${a.id}" style="--d:${i * 60}ms">
        <div class="pv-cover">${a.cover ? `<img loading="lazy" src="${img(a.cover)}" alt="">` : `<span>${svg("photo")}</span>`}</div>
        <div class="pv-aname">${esc(a.name)}</div><div class="pv-acount">${a.count} photo${a.count === 1 ? "" : "s"}</div></button>`).join("")}</div>`;
  }
  function pAlbum() {
    const a = PV.album, ph = PV.photos;
    const head = `<div class="top"><button class="back" data-act="pv-back">‹ Albums</button><div style="flex:1"></div><button class="btn ghost sm" data-act="pv-amenu">Edit</button></div>
      <h1 data-eyebrow="Photo Vault">${esc(a.name)}</h1>`;
    const add = `<label class="btn pv-add">${svg("photo")} Add photos<input type="file" accept="image/*" multiple data-upload hidden></label>`;
    const prog = PV.up ? `<div class="pv-prog"><i style="width:${Math.round((PV.up.done / PV.up.total) * 100)}%"></i><span>Uploading ${PV.up.done} of ${PV.up.total}…</span></div>` : "";
    if (!ph) return head + add + `<div class="empty">Loading…</div>`;
    return head + add + prog + (ph.length
      ? `<div class="pv-grid">${ph.map((p, n) => `<button class="pv-ph" data-act="pv-open" data-id="${n}" style="--d:${Math.min(n, 30) * 18}ms"><img loading="lazy" src="${img(p)}" alt=""></button>`).join("")}</div>`
      : `<div class="empty">No photos yet. Tap Add photos.</div>`);
  }

  // Resize on the phone before upload: full ≤2400px, thumb ≤480px (square crop), JPEG.
  function loadImage(file) {
    return new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => res({ im, u }); im.onerror = () => { URL.revokeObjectURL(u); rej(new Error("Couldn’t read " + file.name)); }; im.src = u; });
  }
  const toBlob = (c, q) => new Promise((r) => c.toBlob(r, "image/jpeg", q));
  async function shrink(file) {
    const { im, u } = await loadImage(file);
    const W = im.naturalWidth, H = im.naturalHeight, k = Math.min(1, 2400 / Math.max(W, H));
    const c = document.createElement("canvas"); c.width = Math.round(W * k); c.height = Math.round(H * k);
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    const full = await toBlob(c, 0.86);
    const side = Math.min(W, H), t = document.createElement("canvas"); t.width = t.height = 480;
    t.getContext("2d").drawImage(im, (W - side) / 2, (H - side) / 2, side, side, 0, 0, 480, 480);
    const thumb = await toBlob(t, 0.78);
    URL.revokeObjectURL(u);
    return { full, thumb, w: c.width, h: c.height };
  }
  async function uploadFiles(files) {
    files = [...files].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name));
    if (!files.length || !PV.album) return;
    PV.up = { done: 0, total: files.length }; render();
    let failed = 0;
    for (const f of files) {
      try {
        const r = await shrink(f), fd = new FormData();
        fd.append("album", PV.album.id); fd.append("name", f.name); fd.append("w", r.w); fd.append("h", r.h); fd.append("takenAt", f.lastModified || Date.now());
        fd.append("thumb", r.thumb, "t.jpg"); fd.append("full", r.full, "f.jpg");
        const res = await fetch("/api/vault/upload", { method: "POST", headers: { authorization: "Bearer " + token }, body: fd });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Upload failed");
        PV.photos = [d, ...(PV.photos || [])];
      } catch (e) { failed++; console.error(e); }
      PV.up.done++; render();
    }
    PV.up = null; render();
    toast(failed ? `${files.length - failed} added · ${failed} failed` : `${files.length} photo${files.length === 1 ? "" : "s"} added`);
    PV.albums = null; // refresh counts/covers next time
  }
  document.addEventListener("change", (e) => { if (e.target.matches("input[data-upload]")) { uploadFiles(e.target.files); e.target.value = ""; } });

  function albumSheet(a) {
    sheet(`<h2>${a ? "Edit album" : "New album"}</h2><form data-form="pv-album" data-id="${a?.id || ""}"><label>Name</label><input name="name" value="${esc(a?.name || "")}" placeholder="e.g. Wedding" required autofocus>
      <div class="actions">${a ? `<button type="button" class="btn danger" data-act="pv-adel" data-id="${a.id}">Delete album</button>` : ""}<span class="sp"></span>
      <button type="button" class="btn ghost" data-act="close">Cancel</button><button class="btn">${a ? "Save" : "Create"}</button></div></form>`);
  }

  // Full-screen viewer: swipe or arrows; set as cover, move or delete.
  function pvView(n) {
    const ph = PV.photos || [], p = ph[n]; if (!p) return;
    let v = document.getElementById("pvview");
    if (!v) {
      v = document.createElement("div"); v.id = "pvview"; v.className = "pv-view"; document.body.appendChild(v);
      let x0 = null;
      v.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
      v.addEventListener("touchend", (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) pvView(+v.dataset.n + (dx < 0 ? 1 : -1)); }, { passive: true });
      v.addEventListener("click", async (e) => {
        const a = e.target.closest("[data-pv]")?.dataset.pv, i = +v.dataset.n, cur = (PV.photos || [])[i];
        if (a === "close" || e.target === v) v.remove();
        else if (a === "prev") pvView(i - 1);
        else if (a === "next") pvView(i + 1);
        else if (a === "cover" && cur) { await api(`vault/albums/${PV.album.id}`, { method: "PUT", body: { cover: cur.id } }); toast("Album cover set"); PV.albums = null; }
        else if (a === "del" && cur) { if (!confirmDel()) return; await api(`vault/photos/${cur.id}`, { method: "DELETE" }); PV.photos.splice(i, 1); PV.albums = null; render(); if (!PV.photos.length) v.remove(); else pvView(Math.min(i, PV.photos.length - 1)); }
        else if (a === "move" && cur) {
          const others = (PV.albums || []).filter((x) => x.id !== PV.album.id);
          if (!others.length) return toast("Make another album first");
          v.querySelector(".pv-move").innerHTML = others.map((x) => `<button data-pv="to" data-id="${x.id}">${esc(x.name)}</button>`).join("");
        } else if (a === "to" && cur) { await api(`vault/photos/${cur.id}`, { method: "PUT", body: { album: e.target.dataset.id } }); PV.photos.splice(i, 1); PV.albums = null; toast("Moved"); render(); if (!PV.photos.length) v.remove(); else pvView(Math.min(i, PV.photos.length - 1)); }
      });
    }
    v.dataset.n = n;
    const when = p.takenAt ? new Date(p.takenAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
    v.innerHTML = `<img src="${img(p, "f")}" alt="">
      <div class="pv-bar"><span>${esc(when)}</span><span>${n + 1} / ${ph.length}</span></div>
      <div class="pv-tools"><button data-pv="cover">Set cover</button><button data-pv="move">Move</button><button data-pv="del" class="bad">Delete</button></div><div class="pv-move"></div>
      <button class="pv-x" data-pv="close">×</button>${n > 0 ? '<button class="pv-nav l" data-pv="prev">‹</button>' : ""}${n < ph.length - 1 ? '<button class="pv-nav r" data-pv="next">›</button>' : ""}`;
  }

  // ---------- Gun Vault: the Safe Ledger, inside Life ----------
  const GV = { data: null, tab: "firearms", open: {}, serial: {}, importing: false, up: null };
  const GVC = [["firearms", "Firearms"], ["nfa", "NFA"], ["mags", "Mags"], ["spares", "Spares"], ["gear", "Gear"]];
  const gvFile = (id, s = "t") => `/vault/file/${id}?s=${s}&k=${GV.data?.keys?.[id] || ""}`;
  const sumP = (p) => (p || []).reduce((a, x) => a + (+x.price || 0), 0);
  const cwT = (o) => sumP(o.customWork);
  const GVAL = {
    firearms: (o) => sumP(o.parts) + cwT(o),
    nfa: (o) => (+o.price || 0) + sumP(o.accessories) + cwT(o),
    mags: (o) => (+o.price || 0) * Math.max(0, +o.qty || 0) + (o.bases || []).filter((b) => b?.name).reduce((a, b) => a + (+b.price || 0) * (+b.qty || 0), 0),
    spares: (o) => (+o.price || 0) + sumP(o.parts),
    gear: (o) => (+o.price || 0) * Math.max(1, +o.qty || 1),
  };
  const DOCS = ["Serial", "Receipt", "Tax Stamp", "Approved Form", "Document"];
  const coverOf = (o) => { const p = o.photos || []; return p.find((x) => x.id === o.cover && x.type !== "pdf") || p.find((x) => x.type !== "pdf" && !DOCS.includes(x.label)) || p.find((x) => x.type !== "pdf") || (o.img ? { id: o.img } : null) || ((o.parts || []).find((x) => x.img) ? { id: o.parts.find((x) => x.img).img } : null) || ((o.accessories || []).find((x) => x.img) ? { id: o.accessories.find((x) => x.img).img } : null); };
  const gvTotals = () => { const d = GV.data; if (!d || d.error) return null; const t = {}; let all = 0; for (const [c] of GVC) { t[c] = (d[c] || []).reduce((a, o) => a + GVAL[c](o), 0); all += t[c]; } return { ...t, all }; };
  const magCount = () => (GV.data?.mags || []).reduce((a, m) => a + (+m.qty || 0), 0);

  async function loadGV() {
    try { GV.data = await api("gv"); } catch (e) { if (e.message !== "signin") GV.data = GV.data || { error: e.message }; }
    if (GV.data?.importing) runImport();
    if (["", "guns"].includes(route())) render();
  }
  async function runImport() {
    if (GV.importing) return;
    GV.importing = { left: null };
    try {
      for (let i = 0; i < 40; i++) {
        const r = await api("/gv-import", { method: "POST" });
        if (!r.ok) throw new Error(r.error || "Import stopped");
        GV.importing = { left: r.left, total: r.total };
        if (route() === "guns") render();
        if (!r.left) break;
      }
      GV.importing = false; GV.data = await api("gv"); toast("Safe Ledger imported");
    } catch (e) { GV.importing = false; if (e.message !== "signin") toast(e.message); }
    if (["", "guns"].includes(route())) render();
  }
  const gvFind = (col, id) => (GV.data?.[col] || []).find((x) => x.id === id);
  const firearmName = (id) => gvFind("firearms", id)?.name || "";

  function pGuns() {
    const head = top("Gun Vault", GV.data && !GV.data.error ? `<button class="btn ghost sm" data-act="gv-new">+ Add</button>` : "").replace(/<h1 [^>]*>Gun Vault<\/h1>/, GV.data && !GV.data.error ? "" : "$&");
    if (!GV.data) { setTimeout(loadGV, 0); return head + `<div class="empty">Loading…</div>`; }
    if (GV.data.error) return head + `<div class="empty">${esc(GV.data.error)}</div>`;
    const t = gvTotals(), d = GV.data, imp = GV.importing;
    const banner = imp ? `<div class="pv-prog"><i style="width:${imp.total ? Math.round(((imp.total - imp.left) / imp.total) * 100) : 4}%"></i><span>Bringing in your Safe Ledger${imp.total ? ` · ${imp.total - imp.left} of ${imp.total} files` : "…"}</span></div>` : "";
    const sum = `<section class="gv-hero"><picture><source srcset="/gv-hero.webp?v=4" type="image/webp"><img src="/gv-hero.jpg?v=4" alt="" draggable="false"></picture><div class="gv-hero-txt"><div><div class="gv-eb">Safe Ledger</div><div class="gv-title">Gun Vault</div></div><div><div class="lbl" style="color:var(--gold);text-align:right;font-size:9.5px">Collection value</div><div class="hero-num"><span data-count="${Math.round(t.all)}" data-fmt="usd">${usd(t.all, false)}</span></div></div></div>
      </section>
      <div class="lux gv-sum" style="--i:0"><div class="cols" style="margin:0;padding:0;border:0"><div><div class="lbl">Firearms</div><div class="v">${d.firearms.length} · ${usd(t.firearms, false)}</div></div>
      <div><div class="lbl">NFA</div><div class="v">${d.nfa.length} · ${usd(t.nfa, false)}</div></div>
      <div><div class="lbl">Mags</div><div class="v">${magCount()} · ${usd(t.mags, false)}</div></div></div></div>`;
    const col = GV.tab, items = d[col] || [];
    const seg = `<div class="seg gv-seg">${GVC.map(([c, n]) => `<button class="${c === col ? "on" : ""}" data-act="gv-tab" data-id="${c}">${n}</button>`).join("")}</div>`;
    const sub = `<div class="gv-tot"><span>${items.length} ${GVC.find(([c]) => c === col)[1].toLowerCase()}${col === "mags" ? ` · ${magCount()} total` : ""}</span><span>${usd(t[col], false)}</span></div>`;
    return head + sum + banner + seg + sub + (items.length ? `<div class="gv-list">${items.map((o, i) => gvCard(col, o, i)).join("")}</div>` : `<div class="empty">${imp ? "Importing…" : "Nothing here yet."}</div>`);
  }

  function gvSub(col, o) {
    if (col === "firearms") return [o.caliber, o.type].filter(Boolean).join(" · ");
    if (col === "nfa") return [o.itemType, o.caliber, o.form].filter(Boolean).join(" · ");
    if (col === "mags") return [o.caliber, o.capacity ? o.capacity + " rd" : "", `×${+o.qty || 0}`].filter(Boolean).join(" · ");
    return [o.category, o.qty > 1 ? `×${o.qty}` : ""].filter(Boolean).join(" · ");
  }
  const kv = (k, v) => (v === "" || v == null ? "" : `<div class="gv-kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`);
  const lines = (title, arr, fmt) => (arr && arr.length ? `<div class="gv-sec">${title}</div><div class="gv-lines">${arr.map(fmt).join("")}</div>` : "");
  const partLine = (x) => `<div class="gv-line">${x.img && GV.data.keys[x.img] ? `<img src="${gvFile(x.img)}" alt="" loading="lazy">` : ""}<span class="grow">${esc(x.name)}${x.mtype || x.thread ? `<small>${esc([x.mtype, x.thread].filter(Boolean).join(" · "))}</small>` : ""}</span><b>${x.price ? usd(x.price) : "—"}</b></div>`;

  function gvCard(col, o, i) {
    const key = col + "/" + o.id, open = GV.open[key], c = coverOf(o), val = GVAL[col](o);
    let body = "";
    if (open) {
      const ph = o.photos || [];
      const strip = `<div class="gv-strip">${ph.map((p, n) => p.type === "pdf"
        ? `<a class="gv-ph pdf" href="${gvFile(p.id, "f")}" target="_blank" rel="noopener"><span>PDF</span><small>${esc(p.label || "Document")}</small></a>`
        : `<button class="gv-ph" data-act="gv-view" data-id="${key}|${n}"><img src="${gvFile(p.id)}" alt="" loading="lazy"><small>${esc(p.label || "")}</small></button>`).join("")}
        <label class="gv-ph add">${GV.up === key ? "<span>Uploading…</span>" : `<span>+</span><small>Photo / PDF</small>`}<input type="file" accept="image/*,application/pdf" multiple data-gvupload="${key}" hidden></label></div>`;
      const serial = o.serial ? `<button class="gv-serial" data-act="gv-serial" data-id="${key}"><span>Serial</span><b>${GV.serial[key] ? esc(o.serial) : "•••• tap to show"}</b></button>` : "";
      const sp = o.specs || {};
      const specs = Object.keys(sp).length ? `<div class="gv-sec">Specs</div><div class="gv-grid">${Object.entries(sp).filter(([, v]) => v).map(([k, v]) => kv(k.replace(/^oal$/, "length").replace(/^msrp$/, "MSRP").replace(/^sku$/, "SKU"), v)).join("")}</div>` : "";
      let facts = "";
      if (col === "firearms") facts = kv("Purchased", o.purchaseDate) + kv("From", o.purchasedFrom) + kv("Serial source", o.serialFrom);
      if (col === "nfa") {
        const host = o.hostId ? `<button class="gv-link" data-act="gv-goto" data-id="firearms/${esc(o.hostId)}">On ${esc(firearmName(o.hostId) || o.hostId)} ›</button>` : "";
        facts = `<div class="gv-row"><span class="pill ${/approv/i.test(o.status) ? "good" : "warn"}">${esc(o.status || "Pending")}</span>${host}</div>` + kv("Make", o.make) + kv("Model", o.model) + kv("Price", o.price ? usd(o.price) : "") + kv("Submitted", o.submitted) + kv("Approved", o.approved) + kv("Form #", o.formNumber) + kv("Owner", o.owner) + kv("From", o.purchasedFrom);
      }
      if (col === "mags") {
        const fits = (o.fits || []).map((f) => `<button class="gv-link" data-act="gv-goto" data-id="firearms/${esc(f)}">${esc(firearmName(f) || f)}</button>`).join("");
        facts = kv("Make", o.make) + kv("Capacity", o.capacity) + kv("Quantity", o.qty) + kv("Each", o.price ? usd(o.price) : "") + (fits ? `<div class="gv-sec">Fits</div><div class="gv-row wrap">${fits}</div>` : "");
      }
      if (col === "spares") facts = kv("Category", o.category) + kv("Price", o.price ? usd(o.price) : "") + kv("Type", o.mtype) + kv("Thread", o.thread);
      if (col === "gear") facts = kv("Category", o.category) + kv("Quantity", o.qty) + kv("Each", o.price ? usd(o.price) : "");
      const cans = col === "firearms" ? (GV.data.nfa || []).filter((n) => n.hostId === o.id) : [];
      body = `<div class="gv-body">${strip}${serial}<div class="gv-facts">${facts}</div>
        ${cans.length ? `<div class="gv-sec">NFA on this gun</div><div class="gv-row wrap">${cans.map((n) => `<button class="gv-link" data-act="gv-goto" data-id="nfa/${esc(n.id)}">${esc(n.name)} ›</button>`).join("")}</div>` : ""}
        ${lines(col === "nfa" ? "Accessories" : "Build", col === "nfa" ? o.accessories : o.parts, partLine)}
        ${lines("Custom work", o.customWork, (x) => `<div class="gv-line"><span class="grow">${esc(x.type || "Work")}${x.details ? " · " + esc(x.details) : ""}<small>${esc([x.vendor, x.date].filter(Boolean).join(" · "))}</small></span><b>${usd(x.price)}</b></div>`)}
        ${lines("Base pads", (o.bases || []).filter((b) => b?.name), (b) => `<div class="gv-line"><span class="grow">${esc(b.name)}${b.plus ? ` <small>+${esc(b.plus)} rounds · ×${esc(b.qty)}</small>` : ""}</span><b>${usd((+b.price || 0) * (+b.qty || 0))}</b></div>`)}
        ${specs}${o.notes ? `<div class="gv-sec">Notes</div><div class="gv-notes">${esc(o.notes)}</div>` : ""}
        <div class="gv-acts"><button class="btn ghost sm" data-act="gv-edit" data-id="${key}">Edit</button></div></div>`;
    }
    return `<div class="gv-card ${open ? "open" : ""}" id="gv-${esc(o.id)}" style="--d:${Math.min(i, 20) * 45}ms">
      <button class="gv-head" data-act="gv-open" data-id="${key}"><span class="gv-thumb">${c && GV.data.keys[c.id] ? `<img src="${gvFile(c.id)}" alt="" loading="lazy">` : svg("shield")}</span>
      <span class="grow"><span class="gv-name">${esc(o.name)}</span><span class="gv-meta">${esc(gvSub(col, o))}</span></span><span class="gv-val">${val ? usd(val, false) : ""}</span></button>${body}</div>`;
  }

  // Full-screen photo viewer for one item's pictures (PDFs open in a new tab).
  function gvView(key, n) {
    const [col, id] = key.split("/"), o = gvFind(col, id); if (!o) return;
    const ph = (o.photos || []).map((p, i) => ({ ...p, i })).filter((p) => p.type !== "pdf");
    let k = ph.findIndex((p) => p.i === n); if (k < 0) k = 0;
    const p = ph[k]; if (!p) return;
    let v = document.getElementById("gvview");
    if (!v) {
      v = document.createElement("div"); v.id = "gvview"; v.className = "pv-view"; document.body.appendChild(v);
      let x0 = null;
      v.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
      v.addEventListener("touchend", (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); }, { passive: true });
      const step = (d) => { const o2 = gvFind(...v.dataset.key.split("/")); const l = (o2.photos || []).map((p, i) => ({ ...p, i })).filter((p) => p.type !== "pdf"); const j = l.findIndex((p) => p.i === +v.dataset.n) + d; if (l[j]) gvView(v.dataset.key, l[j].i); };
      v.addEventListener("click", async (e) => {
        const a = e.target.closest("[data-pv]")?.dataset.pv;
        if (a === "close" || e.target === v) v.remove();
        else if (a === "prev") step(-1); else if (a === "next") step(1);
        else if (a === "cover") { const [c2, i2] = v.dataset.key.split("/"), o2 = gvFind(c2, i2); const ph2 = o2.photos[+v.dataset.n]; await gvSave(c2, { ...o2, cover: ph2.id }); toast("Cover set"); }
        else if (a === "del") { if (!confirmDel()) return; const [c2, i2] = v.dataset.key.split("/"), o2 = gvFind(c2, i2); const photos = o2.photos.filter((_, j) => j !== +v.dataset.n); await gvSave(c2, { ...o2, photos }); v.remove(); toast("Removed"); }
      });
    }
    v.dataset.key = key; v.dataset.n = p.i;
    v.innerHTML = `<img src="${gvFile(p.id, "f")}" alt="">
      <div class="pv-bar"><span>${esc(o.name)} · ${esc(p.label || "Photo")}</span><span>${k + 1} / ${ph.length}</span></div>
      <div class="pv-tools"><button data-pv="cover">Set cover</button><button data-pv="del" class="bad">Remove</button></div>
      <button class="pv-x" data-pv="close">×</button>${k > 0 ? '<button class="pv-nav l" data-pv="prev">‹</button>' : ""}${k < ph.length - 1 ? '<button class="pv-nav r" data-pv="next">›</button>' : ""}`;
  }

  async function gvSave(col, rec) {
    const { _keys, ...body } = rec;
    const r = rec.id && gvFind(col, rec.id) ? await api(`gv/${col}/${encodeURIComponent(rec.id)}`, { method: "PUT", body }) : await api(`gv/${col}`, { method: "POST", body });
    if (r._keys) Object.assign(GV.data.keys, r._keys);
    delete r._keys;
    const list = GV.data[col], i = list.findIndex((x) => x.id === r.id);
    i >= 0 ? (list[i] = r) : list.push(r);
    render();
    return r;
  }

  // Photos and PDFs added from the phone. Photos are resized first (full ≤2400px, thumb ≤640px).
  async function gvShrink(file) {
    const { im, u } = await loadImage(file);
    const out = async (max, q) => { const W = im.naturalWidth, H = im.naturalHeight, k = Math.min(1, max / Math.max(W, H)), c = document.createElement("canvas"); c.width = Math.round(W * k); c.height = Math.round(H * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); return toBlob(c, q); };
    const full = await out(2400, 0.86), thumb = await out(640, 0.8);
    URL.revokeObjectURL(u);
    return { full, thumb };
  }
  async function gvUpload(key, list) {
    const [col, id] = key.split("/");
    list = [...list]; if (!list.length) return;
    GV.up = key; render();
    const added = [];
    for (const f of list) {
      try {
        const fd = new FormData(), pdf = /pdf/i.test(f.type) || /\.pdf$/i.test(f.name);
        if (pdf) fd.append("file", f, f.name);
        else { const r = await gvShrink(f); fd.append("file", r.full, "f.jpg"); fd.append("thumb", r.thumb, "t.jpg"); }
        const res = await fetch("/api/gv/file", { method: "POST", headers: { authorization: "Bearer " + token }, body: fd });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Upload failed");
        GV.data.keys[d.id] = d.k;
        added.push({ id: d.id, type: d.type, label: pdf ? f.name.replace(/\.pdf$/i, "").slice(0, 40) || "Document" : "Photo", added: todayKey() });
      } catch (e) { toast(e.message); }
    }
    GV.up = null;
    const o = gvFind(col, id);
    if (o && added.length) { await gvSave(col, { ...o, photos: [...(o.photos || []), ...added] }); toast(`${added.length} added`); } else render();
  }
  document.addEventListener("change", (e) => { if (e.target.matches("input[data-gvupload]")) { gvUpload(e.target.dataset.gvupload, e.target.files); e.target.value = ""; } });

  // Edit / add sheet. Lists (parts, accessories, base pads, custom work) are rows you can add to or remove.
  const ROWS = {
    parts: [["name", "Part", "grow"], ["price", "$", "num"]],
    accessories: [["name", "Accessory", "grow"], ["price", "$", "num"]],
    bases: [["name", "Base pad", "grow"], ["plus", "+rds", "num"], ["qty", "Qty", "num"], ["price", "$ ea", "num"]],
    customWork: [["type", "Work", "grow"], ["vendor", "Vendor", "grow"], ["price", "$", "num"]],
  };
  const rowHTML = (list, x = {}) => `<div class="gv-er" data-list="${list}">${ROWS[list].map(([f, ph, cls]) => `<input name="${list}.${f}" placeholder="${ph}" value="${esc(x[f] ?? "")}" class="${cls}" ${cls === "num" ? 'inputmode="decimal"' : ""}>`).join("")}<button type="button" class="gv-x" data-act="gv-rmrow">×</button></div>`;
  const rowsBlock = (list, title, arr) => `<label>${title}</label><div class="gv-rows" data-rows="${list}">${(arr || []).map((x) => rowHTML(list, x)).join("")}</div><button type="button" class="btn ghost sm" data-act="gv-addrow" data-id="${list}">+ Add ${title.toLowerCase().replace(/s$/, "")}</button>`;
  const FIELDS = {
    firearms: [["name", "Name"], ["type", "Type"], ["caliber", "Caliber"], ["serial", "Serial"], ["purchaseDate", "Purchased", "date"], ["purchasedFrom", "From"]],
    nfa: [["name", "Name"], ["itemType", "Item"], ["make", "Make"], ["model", "Model"], ["caliber", "Caliber"], ["serial", "Serial"], ["price", "Price", "num"], ["form", "Form"], ["status", "Status"], ["submitted", "Submitted", "date"], ["approved", "Approved", "date"], ["formNumber", "Form #"], ["owner", "Owner"], ["purchasedFrom", "From"]],
    mags: [["name", "Name"], ["make", "Make"], ["caliber", "Caliber"], ["capacity", "Capacity", "num"], ["qty", "Quantity", "num"], ["price", "Price each", "num"]],
    spares: [["name", "Name"], ["category", "Category"], ["serial", "Serial"], ["price", "Price", "num"]],
    gear: [["name", "Name"], ["category", "Category"], ["qty", "Quantity", "num"], ["price", "Price each", "num"]],
  };
  const LISTS = { firearms: [["parts", "Parts"], ["customWork", "Custom work"]], nfa: [["accessories", "Accessories"]], mags: [["bases", "Base pads"]], spares: [["parts", "Parts"]], gear: [] };
  function gvEdit(col, o = {}) {
    const f = FIELDS[col].map(([k, l, t]) => `<div class="gv-ef"><label>${l}</label><input name="${k}" value="${esc(o[k] ?? "")}" ${t === "date" ? 'type="date"' : t === "num" ? 'inputmode="decimal"' : ""} ${k === "name" ? "required" : ""}></div>`).join("");
    const host = col === "nfa" ? `<div class="gv-ef"><label>Mounted on</label><select name="hostId"><option value="">—</option>${GV.data.firearms.map((g) => `<option value="${esc(g.id)}" ${g.id === o.hostId ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select></div>` : "";
    const fits = col === "mags" ? `<label>Fits</label><div class="gv-fits">${GV.data.firearms.map((g) => `<label><input type="checkbox" name="fits" value="${esc(g.id)}" ${(o.fits || []).includes(g.id) ? "checked" : ""}> ${esc(g.name)}</label>`).join("")}</div>` : "";
    const photos = (o.photos || []).length ? `<label>Photos & documents</label><div class="gv-rows">${o.photos.map((p, n) => `<div class="gv-er"><input name="plabel.${n}" value="${esc(p.label || "")}" class="grow" placeholder="Label"><span class="gv-ptype">${p.type === "pdf" ? "PDF" : "Photo"}</span><label class="gv-rm"><input type="checkbox" name="pdel.${n}"> Remove</label></div>`).join("")}</div>` : "";
    sheet(`<h2>${o.id ? "Edit" : "Add"} ${esc(GVC.find(([c]) => c === col)[1].replace(/s$/, "").replace("NFA", "NFA item").toLowerCase().replace("nfa item", "NFA item"))}</h2>
      <form data-form="gv-save" data-id="${col}/${esc(o.id || "")}"><div class="gv-efs">${f}${host}</div>${fits}
      ${LISTS[col].map(([l, t]) => rowsBlock(l, t, o[l])).join("")}
      <label>Notes</label><textarea name="notes">${esc(o.notes || "")}</textarea>${photos}
      <div class="actions">${o.id ? `<button type="button" class="btn danger" data-act="gv-del" data-id="${col}/${esc(o.id)}">Delete</button>` : ""}<span class="sp"></span>
      <button type="button" class="btn ghost" data-act="close">Cancel</button><button class="btn">Save</button></div></form>`);
  }
  async function gvSubmit(f) {
    const [col, id] = f.dataset.id.split("/"), o = (id && gvFind(col, id)) || {}, fd = new FormData(f);
    const rec = { ...o };
    for (const [k, , t] of FIELDS[col]) { const v = String(fd.get(k) ?? "").trim(); rec[k] = t === "num" ? (v === "" ? "" : +v.replace(/[$,]/g, "") || 0) : v; }
    if (col === "nfa") rec.hostId = fd.get("hostId") || "";
    if (col === "mags") rec.fits = fd.getAll("fits");
    for (const [l] of LISTS[col]) {
      const old = o[l] || [];
      rec[l] = [...f.querySelectorAll(`[data-rows="${l}"] .gv-er`)].map((row, n) => {
        const x = { ...(old[n] || {}) };
        ROWS[l].forEach(([k, , cls]) => { const v = row.querySelector(`[name="${l}.${k}"]`).value.trim(); x[k] = cls === "num" ? (v === "" ? 0 : +v.replace(/[$,]/g, "") || 0) : v; });
        return x;
      }).filter((x) => x.name || x.type);
    }
    rec.notes = String(fd.get("notes") || "");
    if (o.photos) rec.photos = o.photos.map((p, n) => ({ ...p, label: String(fd.get("plabel." + n) ?? p.label) })).filter((_, n) => !fd.get("pdel." + n));
    const r = await gvSave(col, rec);
    GV.open[col + "/" + r.id] = true;
    closeSheet(); render();
  }

  // ---------- Passwords: encrypted on this phone with your master password; the server only stores ciphertext ----------
  const PW = { key: null, vault: null, meta: null, q: "", cat: "", reveal: {}, err: "", busy: false, timer: 0 };
  const PW_ITER = 600000;
  const b64e = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
  const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function pwDerive(master, salt, iter) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(master), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function pwEncrypt(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return b64e(out);
  }
  async function pwDecrypt(key, data) { const raw = b64d(data); return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12)))); }
  function pwLock() { try { Object.values(DOCST.urls).forEach((u) => URL.revokeObjectURL(u)); DOCST.urls = {}; } catch (_) {} PW.key = null; PW.vault = null; PW.reveal = {}; clearTimeout(PW.timer); closeSheet(); if (["keys", "docs"].includes(route())) render(); }
  const pwTouch = () => { clearTimeout(PW.timer); if (PW.key) PW.timer = setTimeout(pwLock, 5 * 60e3); };
  let pwHidden = 0;
  document.addEventListener("visibilitychange", () => { if (document.hidden) pwHidden = Date.now(); else if (PW.key && Date.now() - pwHidden > 60e3) pwLock(); });
  ["click", "keydown", "touchstart"].forEach((ev) => document.addEventListener(ev, () => PW.key && pwTouch(), { passive: true }));

  async function pwLoad() { try { PW.meta = await api("pw"); } catch (e) { PW.meta = { error: e.message }; } if (route() === "keys") render(); }
  async function pwPersist() {
    const data = await pwEncrypt(PW.key, PW.vault);
    const r = await api("pw", { method: "PUT", body: { data, salt: PW.meta.salt, iter: PW.meta.iter, ver: PW.meta.ver } });
    PW.meta = { ...PW.meta, data, ver: r.ver };
  }
  function pwGen(n = 20) {
    const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%^&*-_=+?"], all = sets.join("");
    const rnd = (m) => { const a = new Uint32Array(1); let x; do { crypto.getRandomValues(a); x = a[0]; } while (x >= Math.floor(2 ** 32 / m) * m); return x % m; };
    const out = sets.map((s) => s[rnd(s.length)]); while (out.length < n) out.push(all[rnd(all.length)]);
    for (let i = out.length - 1; i > 0; i--) { const j = rnd(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
    return out.join("");
  }
  const host = (u) => { try { return new URL(/^https?:/i.test(u) ? u : "https://" + u).hostname.replace(/^www\./, ""); } catch (_) { return ""; } };

  function pKeys() {
    const lockBtn = PW.key ? `<button class="btn ghost sm" data-act="pw-lock">Lock</button>` : "";
    const head = top("Passwords", PW.key ? `<button class="btn ghost sm" data-act="pw-new">+ Add</button>` : "").replace('<div style="flex:1"></div>', `<div style="flex:1"></div>${lockBtn}<span style="width:8px"></span>`);
    if (!PW.meta) { setTimeout(pwLoad, 0); return head + `<div class="empty">Loading…</div>`; }
    if (PW.meta.error) return head + `<div class="empty">${esc(PW.meta.error)}</div>`;
    if (!PW.key) {
      const first = PW.meta.empty;
      return head + `<div class="lux pw-lockcard" style="--i:0"><div class="pw-lockic">${svg("lock")}</div>
        <div class="hero-num" style="font-size:26px;text-align:center">${first ? "Create your master password" : "Locked"}</div>
        <div class="sub" style="text-align:center;margin:6px 0 16px">${first ? "Everything is encrypted on this phone with it. Nobody can reset it, not even me, so pick something you won't forget." : "Enter your master password."}</div>
        <form data-form="${first ? "pw-create" : "pw-unlock"}"><input name="m" type="password" autocomplete="off" placeholder="Master password" required minlength="${first ? 6 : 1}">
        ${first ? `<input name="m2" type="password" autocomplete="off" placeholder="Type it again" required style="margin-top:8px">` : ""}
        <div class="err">${esc(PW.err)}</div><button class="btn" style="width:100%;margin-top:10px" ${PW.busy ? "disabled" : ""}>${PW.busy ? "Working…" : first ? "Create vault" : "Unlock"}</button></form></div>`;
    }
    const q = PW.q.toLowerCase().trim();
    const all = [...PW.vault.items].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    const items = all.filter((x) => (!PW.cat || (x.cat || "Other") === PW.cat) && (!q || [x.title, x.user, x.url, x.cat, x.notes].join(" ").toLowerCase().includes(q)));
    const counts = {}; all.forEach((x) => (counts[x.cat || "Other"] = (counts[x.cat || "Other"] || 0) + 1));
    const chips = `<div class="pv-chips"><button class="${!PW.cat ? "on" : ""}" data-act="pw-cat" data-id="">All ${all.length}</button>${PW_CATS.filter((c) => counts[c]).map((c) => `<button class="${PW.cat === c ? "on" : ""}" data-act="pw-cat" data-id="${esc(c)}">${esc(c)} ${counts[c]}</button>`).join("")}</div>`;
    const rowH = (x) => `<div class="item pw-item" data-act="pw-open" data-id="${x.id}">${pwAv(x)}
        <div class="grow"><div class="t">${esc(x.title)}</div><div class="sub">${esc(x.user || host(x.url) || "")}</div></div>
        <button class="btn ghost sm" data-act="pw-copy" data-id="${x.id}" data-f="pass">Copy</button></div>`;
    const groups = PW_CATS.map((c) => [c, items.filter((x) => (x.cat || "Other") === c)]).filter(([, l]) => l.length);
    const body = !items.length ? `<div class="empty">${all.length ? "No matches." : "No logins yet. Tap + Add."}</div>`
      : q || PW.cat ? `<div class="list">${items.map(rowH).join("")}</div>`
      : groups.map(([c, l]) => `<h3 class="pw-h">${esc(c)} <span>${l.length}</span></h3><div class="list">${l.map(rowH).join("")}</div>`).join("");
    return head + `<input class="pw-search" type="search" placeholder="Search name, username, site…" value="${esc(PW.q)}" data-pwsearch autocomplete="off" autocapitalize="off">${chips}${body}
      <label class="btn ghost" style="display:block;text-align:center;margin-top:16px;text-transform:none;letter-spacing:0;font-size:15px">Import from Chrome or Apple (CSV)<input type="file" accept=".csv,text/csv,text/comma-separated-values" data-pwimport hidden></label>
      <div class="sub" style="text-align:center;margin-top:14px">Locks after 5 minutes idle · <button class="icon" data-act="pw-change" style="font-size:14px;color:var(--gold2)">Change master password</button></div>`;
  }
  const pwItem = (id) => PW.vault.items.find((x) => x.id === id);
  function pwOpen(x) {
    const r = PW.reveal[x.id];
    const row = (k, v, f, extra = "") => v ? `<div class="pw-row"><div class="grow"><div class="lbl">${k}</div><div class="pw-v ${f === "pass" ? "mono" : ""}">${esc(v)}</div></div>${extra}<button class="btn ghost sm" data-act="pw-copy" data-id="${x.id}" data-f="${f}">Copy</button></div>` : "";
    sheet(`<div class="pw-dh">${pwAv(x)}<div><h2 style="margin:0">${esc(x.title)}</h2><div class="sub">${esc(host(x.url) || "")}</div></div></div><div class="sub" style="margin:2px 0 6px">${esc(x.cat || "Other")}</div>
      ${row("Username", x.user, "user")}
      ${row("Password", r ? x.pass : "••••••••••", "pass", `<button class="btn ghost sm" data-act="pw-reveal" data-id="${x.id}">${r ? "Hide" : "Show"}</button>`)}
      ${x.url ? `<div class="pw-row"><div class="grow"><div class="lbl">Website</div><div class="pw-v">${esc(x.url)}</div></div><a class="btn ghost sm" href="${esc(/^https?:/i.test(x.url) ? x.url : "https://" + x.url)}" target="_blank" rel="noopener">Open</a></div>` : ""}
      ${x.notes ? `<div class="lbl" style="margin-top:12px">Notes</div><div class="gv-notes" style="margin-top:4px">${esc(x.notes)}</div>` : ""}
      <div class="actions"><button type="button" class="btn danger" data-act="pw-del" data-id="${x.id}">Delete</button><span class="sp"></span><button class="btn ghost" data-act="close">Close</button><button class="btn" data-act="pw-edit" data-id="${x.id}">Edit</button></div>`);
  }
  function pwForm(x = {}) {
    sheet(`<h2>${x.id ? "Edit login" : "Add login"}</h2><form data-form="pw-save" data-id="${x.id || ""}">
      <label>Name</label><input name="title" value="${esc(x.title)}" placeholder="e.g. Chase" required autocomplete="off">
      <label>Username or email</label><input name="user" value="${esc(x.user)}" autocomplete="off" autocapitalize="off">
      <label>Password</label><div class="row"><input name="pass" value="${esc(x.pass)}" class="grow mono" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"><button type="button" class="btn ghost sm" data-act="pw-gen">Generate</button></div>
      <label>Website</label><input name="url" value="${esc(x.url)}" placeholder="chase.com" autocomplete="off" autocapitalize="off">
      <label>Category</label><select name="cat"><option value="">Auto</option>${PW_CATS.map((c) => `<option ${x.cat === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
      <label>Notes</label><textarea name="notes">${esc(x.notes)}</textarea>
      <div class="actions"><span class="sp"></span><button type="button" class="btn ghost" data-act="close">Cancel</button><button class="btn">Save</button></div></form>`);
  }
  async function pwCopy(text) {
    try { await navigator.clipboard.writeText(text); toast("Copied"); }
    catch (_) { const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); toast("Copied"); }
  }
  document.addEventListener("input", (e) => { if (e.target.matches("[data-pwsearch]")) { PW.q = e.target.value; const pos = e.target.selectionStart; render(); const s = document.querySelector("[data-pwsearch]"); if (s) { s.focus(); s.setSelectionRange(pos, pos); } } });
  async function pwSubmit(f, v) {
    const kind = f.dataset.form;
    if (kind === "pw-create" || kind === "pw-unlock") {
      PW.err = ""; PW.busy = true; render();
      try {
        if (kind === "pw-create") {
          if (v.m !== v.m2) throw new Error("Those don’t match");
          const salt = crypto.getRandomValues(new Uint8Array(16));
          PW.key = await pwDerive(v.m, salt, PW_ITER); PW.vault = { items: [] };
          PW.meta = { salt: b64e(salt), iter: PW_ITER, ver: 0 };
          await pwPersist();
        } else {
          PW.meta = await api("pw");
          const key = await pwDerive(v.m, b64d(PW.meta.salt), PW.meta.iter);
          try { PW.vault = await pwDecrypt(key, PW.meta.data); } catch (_) { throw new Error("Wrong master password"); }
          PW.key = key;
          const nn = await pwNames(); if (nn) setTimeout(() => toast(`Renamed ${nn} login${nn === 1 ? "" : "s"}`), 2600);
          const n = await pwAutoCats(nn > 0); if (n) setTimeout(() => toast(`Sorted ${n} login${n === 1 ? "" : "s"} into categories`), 300);
        }
        pwTouch();
      } catch (e) { PW.key = null; PW.err = e.message; }
      PW.busy = false; render(); return;
    }
    if (kind === "pw-save") {
      const id = f.dataset.id, item = { id: id || newPwId(), title: v.title.trim(), user: v.user.trim(), pass: v.pass, url: v.url.trim(), notes: v.notes, at: Date.now() }; item.cat = v.cat || pwCatGuess(item);
      const i = PW.vault.items.findIndex((x) => x.id === id);
      i >= 0 ? (PW.vault.items[i] = item) : PW.vault.items.push(item);
      await pwPersist(); closeSheet(); render(); toast("Saved");
    }
    if (kind === "pw-newmaster") {
      if (v.m.length < 6) throw new Error("Use at least 6 characters");
      if (v.m !== v.m2) throw new Error("Those don’t match");
      const salt = crypto.getRandomValues(new Uint8Array(16));
      PW.key = await pwDerive(v.m, salt, PW_ITER); PW.meta = { ...PW.meta, salt: b64e(salt), iter: PW_ITER };
      await pwPersist(); closeSheet(); toast("Master password changed");
    }
  }

  // Import a CSV export from Chrome / Google Password Manager or Apple Passwords. Read and encrypted on this phone only.
  function parseCSV(t) {
    const rows = []; let row = [], f = "", q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
      else f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim()));
  }
  async function pwImport(file) {
    if (!PW.key) return toast("Unlock first");
    const rows = parseCSV((await file.text()).replace(/^\uFEFF/, ""));
    if (rows.length < 2) return toast("That file has no passwords");
    const h = rows[0].map((x) => x.trim().toLowerCase()), col = (...names) => h.findIndex((x) => names.includes(x));
    const iT = col("name", "title"), iU = col("url", "website", "login_uri"), iN = col("username", "login_username", "login"), iP = col("password", "login_password"), iX = col("note", "notes");
    if (iP < 0) return toast("Couldn’t find a password column in that file");
    const seen = new Set(PW.vault.items.map((x) => [host(x.url) || x.title, x.user, x.pass].join("|")));
    let added = 0, dup = 0;
    for (const r of rows.slice(1)) {
      const url = (r[iU] || "").trim(), pass = r[iP] || "", user = (r[iN] || "").trim();
      if (!pass && !user) continue;
      const raw = ((iT >= 0 && r[iT]) || "").trim(), title = !raw || looksLikeHost(raw) ? brandName(url || raw) : raw;
      const sig = [host(url) || title, user, pass].join("|");
      if (seen.has(sig)) { dup++; continue; }
      seen.add(sig);
      const it = { id: newPwId(), title, user, pass, url, notes: iX >= 0 ? r[iX] || "" : "", at: Date.now() }; it.cat = pwCatGuess(it);
      PW.vault.items.push(it);
      added++;
    }
    if (added) await pwPersist();
    render();
    sheet(`<h2>Import done</h2><div class="sub" style="font-size:16px;color:#efe6cf">${added} login${added === 1 ? "" : "s"} added${dup ? ` · ${dup} duplicate${dup === 1 ? "" : "s"} skipped` : ""}.</div>
      <div class="card" style="margin-top:14px;border-color:rgba(255,122,107,.5)"><b style="color:#ff9585">Delete the export file now.</b><div class="sub" style="margin-top:6px">It holds every password in plain text. Delete it from Files (and Recently Deleted), Downloads, and anywhere you sent or saved it.</div></div>
      <div class="actions"><span class="sp"></span><button class="btn" data-act="close">Done</button></div>`);
  }
  document.addEventListener("change", (e) => { if (e.target.matches("input[data-pwimport]")) { const f = e.target.files[0]; e.target.value = ""; if (f) pwImport(f).catch((x) => toast(x.message)); } });


  // Friendly names and logos from each login's website: identity.walmart.com → "Walmart".
  const BRANDS = { tmobile: "T-Mobile", "t-mobile": "T-Mobile", paypal: "PayPal", youtube: "YouTube", linkedin: "LinkedIn", facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", ebay: "eBay", icloud: "iCloud", appleid: "Apple ID", apple: "Apple", hbomax: "HBO Max", max: "Max", att: "AT&T", usaa: "USAA", irs: "IRS", ssa: "Social Security", usps: "USPS", ups: "UPS", fedex: "FedEx", dhl: "DHL", aa: "American Airlines", homedepot: "Home Depot", bestbuy: "Best Buy", lowes: "Lowe's", samsclub: "Sam's Club", capitalone: "Capital One", wellsfargo: "Wells Fargo", bankofamerica: "Bank of America", americanexpress: "American Express", amex: "American Express", chase: "Chase", citi: "Citi", creditkarma: "Credit Karma", cashapp: "Cash App", doordash: "DoorDash", ubereats: "Uber Eats", grubhub: "Grubhub", tekmetric: "Tekmetric", autovitals: "AutoVitals", autozone: "AutoZone", oreillyauto: "O'Reilly", advanceautoparts: "Advance Auto Parts", napaonline: "NAPA", partstech: "PartsTech", silencershop: "Silencer Shop", gunbroker: "GunBroker", primaryarms: "Primary Arms", basspro: "Bass Pro", sigsauer: "SIG Sauer", eotechinc: "EOTech", danieldefense: "Daniel Defense", palmettostatearmory: "Palmetto State Armory", mychart: "MyChart", myhonda: "MyHonda", hondalink: "HondaLink", ezpass: "E-ZPass", e_zpass: "E-ZPass", ppl: "PPL", pplelectric: "PPL Electric", metlife: "MetLife", geico: "GEICO", statefarm: "State Farm", libertymutual: "Liberty Mutual", progressive: "Progressive", turbotax: "TurboTax", hrblock: "H&R Block", freetaxusa: "FreeTaxUSA", idme: "ID.me", "id": "ID.me", github: "GitHub", gitlab: "GitLab", openai: "OpenAI", chatgpt: "ChatGPT", claude: "Claude", netlify: "Netlify", godaddy: "GoDaddy", hulu: "Hulu", espn: "ESPN", nfl: "NFL", nba: "NBA", mlb: "MLB", siriusxm: "SiriusXM", playstation: "PlayStation", xbox: "Xbox", draftkings: "DraftKings", fanduel: "FanDuel", airbnb: "Airbnb", vrbo: "Vrbo", tripadvisor: "Tripadvisor", walmart: "Walmart", amazon: "Amazon", target: "Target", costco: "Costco", netflix: "Netflix", spotify: "Spotify", disneyplus: "Disney+", paramountplus: "Paramount+", peacocktv: "Peacock", primevideo: "Prime Video", microsoft: "Microsoft", live: "Microsoft", outlook: "Outlook", office: "Microsoft 365", google: "Google", gmail: "Gmail", yahoo: "Yahoo", aol: "AOL", dropbox: "Dropbox", adobe: "Adobe", canva: "Canva", shopify: "Shopify", squarespace: "Squarespace", venmo: "Venmo", zelle: "Zelle", sofi: "SoFi", robinhood: "Robinhood", coinbase: "Coinbase", fidelity: "Fidelity", vanguard: "Vanguard", schwab: "Charles Schwab", etrade: "E*TRADE", xfinity: "Xfinity", verizon: "Verizon", comcast: "Comcast", ring: "Ring", adt: "ADT", cvs: "CVS", walgreens: "Walgreens", goodrx: "GoodRx", myfitnesspal: "MyFitnessPal", x: "X", twitter: "X", reddit: "Reddit", pinterest: "Pinterest", snapchat: "Snapchat", discord: "Discord", whatsapp: "WhatsApp", nextdoor: "Nextdoor", indeed: "Indeed", adp: "ADP", paychex: "Paychex", gusto: "Gusto", quickbooks: "QuickBooks", intuit: "Intuit", groupon: "Groupon", ticketmaster: "Ticketmaster", stubhub: "StubHub", uber: "Uber", lyft: "Lyft", delta: "Delta", united: "United", southwest: "Southwest", jetblue: "JetBlue", marriott: "Marriott", hilton: "Hilton", hyatt: "Hyatt", ihg: "IHG", expedia: "Expedia", booking: "Booking.com", kayak: "Kayak", carfax: "Carfax", carvana: "Carvana", kbb: "Kelley Blue Book", sheetz: "Sheetz", wawa: "Wawa", tractorsupply: "Tractor Supply", cabelas: "Cabela's", chewy: "Chewy", etsy: "Etsy", temu: "Temu", shein: "SHEIN", kohls: "Kohl's", macys: "Macy's", nike: "Nike", ulta: "Ulta", sephora: "Sephora", instacart: "Instacart", weis: "Weis", giantfoodstores: "Giant", wegmans: "Wegmans", aldi: "ALDI", starlink: "Starlink", eero: "eero", netgear: "NETGEAR", tplink: "TP-Link", asus: "ASUS", sonos: "Sonos", ecobee: "ecobee", wyze: "Wyze", blink: "Blink", arlo: "Arlo", myq: "myQ" };
  const SLD = /^(co|com|net|org|gov|edu|ac)\.[a-z]{2}$/;
  function regDomain(h) { const p = (h || "").toLowerCase().split(".").filter(Boolean); if (p.length <= 2) return p.join("."); const last2 = p.slice(-2).join("."); return SLD.test(last2) ? p.slice(-3).join(".") : last2; }
  const looksLikeHost = (t) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test((t || "").trim()) || /^https?:\/\//i.test(t || "");
  function brandName(urlOrHost) {
    const h = host(urlOrHost) || String(urlOrHost || "").toLowerCase(), d = regDomain(h), label = d.split(".")[0] || "";
    if (/^\d+$/.test(label) || !label) return h || "Login";
    if (h.endsWith(".gov") && h.includes("pa.gov")) return "PA.gov";
    return BRANDS[label] || BRANDS[label.replace(/-/g, "")] || label.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  }
  const logoDomain = (x) => regDomain(host(x.url) || (looksLikeHost(x.title) ? host(x.title) : ""));
  const pwAv = (x) => { const d = logoDomain(x), L = esc((x.title || "?")[0].toUpperCase()); return d ? `<span class="pw-av logo"><img src="/favicon/${encodeURIComponent(d)}" alt="" loading="lazy" onerror="this.parentNode.classList.remove('logo');this.replaceWith(document.createTextNode('${L}'))"></span>` : `<span class="pw-av">${L}</span>`; };
  async function pwNames() { let n = 0; for (const x of PW.vault.items) if (looksLikeHost(x.title) || !x.title) { const b = brandName(x.url || x.title); if (b && b !== x.title) { x.title = b; n++; } } return n; }

  // Categories: guessed from the site/name on this phone; you can change any one in Edit.
  const PW_CATS = ["Banking & Money", "Shopping", "Email & Accounts", "Social", "Streaming & Media", "Work", "Bills & Utilities", "Auto", "Travel", "Health", "Government & Taxes", "Firearms & Outdoors", "Wi-Fi & Devices", "Other"];
  const PW_RULES = [
    ["Work", /meineke|tekmetric|autovitals|emig|driven|adp|paychex|gusto|indeed|slack|zoom|teams|workday|quickbooks|intuit|xero|bill\.com|autointegrate|silverrock|partstech|worldpac|napa|autozone|advance|oreilly|carquest|mitchell|alldata|identifix|prodemand|groupon|wickedfile|trim|twtracker/],
    ["Firearms & Outdoors", /gun|firearm|ammo|silencer|suppressor|rugged|silencershop|palmetto|psa|brownells|midway|primary ?arms|opticsplanet|eurooptic|gunbroker|sportsman|outdoor|hunting|fishing|range|nra|uspsa|holosun|eotech|vortex|sig ?sauer|sigsauer|glock|kriss|danieldefense|aero ?precision|optics/],
    ["Banking & Money", /bank|chase|wellsfargo|citi|capitalone|amex|americanexpress|discover|venmo|paypal|cash\.app|cashapp|zelle|fidelity|vanguard|schwab|robinhood|etrade|coinbase|sofi|ally|pnc|truist|m&t|mtb\.com|mandtbank|members1st|creditkarma|experian|equifax|transunion|synchrony|barclays|usaa|navyfed|credit ?union|mortgage|loan|plaid|stripe|square|acorns|marcus|lendingclub|affirm|klarna|afterpay|mint|ynab|rocketmoney/],
    ["Streaming & Media", /netflix|hulu|disney|hbo|max\.com|peacock|paramount|youtube|spotify|pandora|siriusxm|audible|kindle|primevideo|appletv|espn|fubo|sling|directv|roku|twitch|crunchyroll|plex|nfl|nba|mlb|dazn|tidal|ticketmaster|stubhub|playstation|xbox|steam|epicgames|nintendo|ea\.com|fanduel|draftkings/],
    ["Social", /facebook|instagram|twitter|x\.com|tiktok|snapchat|linkedin|reddit|pinterest|threads|discord|telegram|whatsapp|nextdoor|tumblr|bereal|youtube\.com\/account/],
    ["Government & Taxes", /\.gov|irs|ssa|socialsecurity|turbotax|hrblock|taxact|freetaxusa|usps|uscis|state\.pa|pa\.gov|mypath|revenue|courts|voter|id\.me|login\.gov|atf|eforms/],
    ["Health", /mychart|patient|health|medical|hospital|clinic|pharmacy|cvs|walgreens|rite ?aid|goodrx|labcorp|quest|upmc|geisinger|wellspan|pennstate ?health|dental|vision|optum|aetna|cigna|humana|bluecross|bcbs|highmark|capital ?blue|unitedhealth|hims|ro\.co|teladoc|fitbit|whoop|myfitnesspal|peloton|strava|oura|gym|planet ?fitness/],
    ["Auto", /honda|toyota|ford|chevy|gm\.com|nissan|hyundai|kia|subaru|tesla|carfax|kbb|carvana|autotrader|cars\.com|penndot|dmv|tolls|ezpass|e-zpass|gasbuddy|sheetz|wawa|shell|exxon|bp\.com|carmax|onstar|myhonda|hondalink/],
    ["Travel", /airbnb|vrbo|booking|expedia|hotels|marriott|hilton|hyatt|ihg|wyndham|choicehotels|delta|united|american ?air|aa\.com|southwest|jetblue|spirit|frontier|alaska ?air|uber|lyft|hertz|enterprise|avis|budget|tripadvisor|kayak|priceline|amtrak|tsa|global ?entry|cruise|carnival|royalcaribbean/],
    ["Bills & Utilities", /t-?mobile|verizon|att\.com|at&t|comcast|xfinity|spectrum|ppl|met-?ed|firstenergy|pplelectric|ugi|columbia ?gas|water|sewer|electric|energy|gas company|waste|republic|insurance|geico|progressive|statefarm|allstate|libertymutual|nationwide|erie|travelers|lemonade|ring\.com|adt|simplisafe|vivint|starlink/],
    ["Wi-Fi & Devices", /wi-?fi|router|netgear|eero|orbi|tp-?link|asus|linksys|camera|printer|hp\.com|epson|canon|sonos|alexa|echo|smartthings|nest|ecobee|govee|tesla ?app|myq|chamberlain|blink|wyze|arlo|192\.168|10\.0\./],
    ["Email & Accounts", /google|gmail|outlook|hotmail|live\.com|microsoft|yahoo|aol|icloud|appleid|apple\.com|proton|zoho|dropbox|onedrive|box\.com|adobe|github|gitlab|netlify|anthropic|claude|openai|chatgpt|1password|lastpass|bitwarden|godaddy|namecheap|squarespace|wix|shopify|canva/],
    ["Shopping", /amazon|walmart|target|costco|samsclub|ebay|etsy|bestbuy|homedepot|lowes|wayfair|shein|temu|aliexpress|kohls|macys|nordstrom|nike|adidas|ulta|sephora|chewy|instacart|doordash|ubereats|grubhub|kroger|giant|weis|wegmans|aldi|shop|store|apple\.com\/shop|qvc|zappos|oldnavy|gap\.com|carhartt|tractorsupply|cabelas|basspro|scheels/],
  ];
  const pwCatGuess = (x) => { const t = [x.title, x.url, host(x.url), x.notes].join(" ").toLowerCase(); return (PW_RULES.find(([, re]) => re.test(t)) || ["Other"])[0]; };
  async function pwAutoCats(force) { let n = 0; for (const x of PW.vault.items) if (!x.cat) { x.cat = pwCatGuess(x); n++; } if (n || force) await pwPersist().catch((e) => toast(e.message)); return n; }
  const newPwId = () => b64e(crypto.getRandomValues(new Uint8Array(9))).replace(/[+/=]/g, "x");

  // ---------- Calendar ----------
  const KIND = { work: ["Work", "#d4af37"], med: ["Medication", "#6fd58f"], appt: ["Appointment", "#8fb8ff"], personal: ["Personal", "#e7a6ff"], bill: ["Bill", "#ff9a6b"], other: ["Other", "#bdb39b"] };
  const REMS = [[0, "At time"], [15, "15 min"], [30, "30 min"], [60, "1 hour"], [120, "2 hours"], [1440, "24 hours"], [2880, "2 days"], [10080, "1 week"]];
  const REP = [["none", "Doesn’t repeat"], ["daily", "Every day"], ["weekdays", "Weekdays"], ["days", "Specific days of the week"], ["weekly", "Every week"], ["biweekly", "Every 2 weeks"], ["monthly", "Every month"], ["yearly", "Every year"]];
  const CAL = { month: null, sel: null };
  const dkey = (t) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  const dAdd = (d, n) => { const t = new Date(d + "T12:00:00"); t.setDate(t.getDate() + n); return dkey(t); };
  const dDow = (d) => new Date(d + "T12:00:00").getDay();
  function occOn(ev, d) {
    if (!ev.date || d < ev.date || (ev.until && d > ev.until)) return false;
    switch (ev.repeat) {
      case "daily": return true;
      case "weekdays": { const w = dDow(d); return w > 0 && w < 6; }
      case "days": return (ev.days || []).includes(dDow(d));
      case "weekly": return dDow(d) === dDow(ev.date);
      case "biweekly": return dDow(d) === dDow(ev.date) && Math.round((new Date(d + "T12:00:00") - new Date(ev.date + "T12:00:00")) / 864e5) % 14 === 0;
      case "monthly": return d.slice(8) === ev.date.slice(8);
      case "yearly": return d.slice(5) === ev.date.slice(5);
      default: return d === ev.date;
    }
  }
  const evOn = (d) => (D.events || []).filter((e) => occOn(e, d)).sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00"));
  const clk = (t) => { if (!t) return "All day"; const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
  const dayLabel = (d) => { const t = todayKey(); if (d === t) return "Today"; if (d === dAdd(t, 1)) return "Tomorrow"; if (d === dAdd(t, -1)) return "Yesterday"; return new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }); };
  function upcoming(n = 3, days = 21) {
    const out = [], now = new Date(), t = todayKey(), hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    for (let i = 0; i <= days && out.length < n; i++) { const d = dAdd(t, i); for (const e of evOn(d)) { if (i === 0 && e.time && (e.end || e.time) < hm) continue; if ((e.done || []).includes(d) || out.some(([, x]) => x.id === e.id)) continue; out.push([d, e]); if (out.length >= n) break; } }
    return out;
  }
  const evRow = (d, e) => { const done = (e.done || []).includes(d), [kn, kc] = KIND[e.kind] || KIND.other;
    return `<div class="item cal-ev ${done ? "done" : ""}" data-act="ev-open" data-id="${e.id}|${d}"><span class="cal-bar" style="background:${kc}"></span>
      <div class="cal-time">${clk(e.time)}${e.end ? `<small>${clk(e.end)}</small>` : ""}</div>
      <div class="grow"><div class="t">${esc(e.title)}</div><div class="sub">${esc(kn)}${e.location ? " · " + esc(e.location) : ""}${e.repeat !== "none" ? " · ↻" : ""}${(e.reminders || []).length ? " · 🔔" : ""}</div></div>
      ${e.kind === "med" ? `<button class="btn ${done ? "" : "ghost"} sm" data-act="ev-done" data-id="${e.id}|${d}">${done ? "✓ Taken" : "Taken"}</button>` : ""}</div>`; };

  function pCal() {
    const t = todayKey(); CAL.sel = CAL.sel || t; CAL.month = CAL.month || t.slice(0, 7);
    const head = top("Calendar", `<button class="btn ghost sm" data-act="ev-new">+ Add</button>`);
    const [y, m] = CAL.month.split("-").map(Number), first = new Date(y, m - 1, 1), start = dAdd(dkey(first), -first.getDay());
    const title = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    let cells = "";
    for (let i = 0; i < 42; i++) {
      const d = dAdd(start, i), evs = evOn(d), inM = d.slice(0, 7) === CAL.month;
      if (i === 35 && !inM) break;
      cells += `<button class="cal-d ${inM ? "" : "out"} ${d === t ? "today" : ""} ${d === CAL.sel ? "sel" : ""}" data-act="cal-day" data-id="${d}"><span>${+d.slice(8)}</span><i>${[...new Set(evs.map((e) => e.kind))].slice(0, 3).map((k) => `<b style="background:${(KIND[k] || KIND.other)[1]}"></b>`).join("")}</i></button>`;
    }
    const grid = `<div class="lux cal-card" style="--i:0"><div class="cal-top"><button class="icon" data-act="cal-mo" data-id="-1">‹</button><div class="cal-mo">${title}</div><button class="icon" data-act="cal-mo" data-id="1">›</button></div>
      <div class="cal-w">${["S", "M", "T", "W", "T", "F", "S"].map((x) => `<span>${x}</span>`).join("")}</div><div class="cal-g">${cells}</div>
      ${CAL.month !== t.slice(0, 7) || CAL.sel !== t ? `<button class="cal-today" data-act="cal-day" data-id="${t}">Back to today</button>` : ""}</div>`;
    const evs = evOn(CAL.sel);
    const day = `<h3 class="pw-h" style="margin-top:20px">${esc(dayLabel(CAL.sel))} <span>${evs.length || ""}</span></h3>${evs.length ? `<div class="list">${evs.map((e) => evRow(CAL.sel, e)).join("")}</div>` : `<div class="empty" style="padding:18px">Nothing scheduled. <button class="icon" data-act="ev-new" style="color:var(--gold2);font-size:15px">Add something</button></div>`}`;
    const up = upcoming(6, 30).filter(([d]) => d !== CAL.sel);
    const next = up.length ? `<h3 class="pw-h">Coming up</h3><div class="list">${up.map(([d, e]) => evRow(d, e).replace('<div class="cal-time">', `<div class="cal-time"><small class="cal-when">${esc(dayLabel(d).replace(/^(\w+day), /, ""))}</small>`)).join("")}</div>` : "";
    const perm = typeof Notification !== "undefined" ? Notification.permission : "default";
    const alerts = perm === "granted" ? "" : `<div class="card" style="margin-top:16px"><div class="row"><div class="grow"><div style="font-weight:600">Reminders on this phone</div><div class="sub">${pushState()}</div></div><button class="btn sm" data-act="push-on">Turn on</button></div></div>`;
    return head + grid + day + next + alerts;
  }

  function evForm(e = {}, d) {
    const r = e.reminders || [0, 1440];
    sheet(`<h2>${e.id ? "Edit" : "New"} event</h2><form data-form="ev-save" data-id="${e.id || ""}">
      <label>Title</label><input name="title" value="${esc(e.title)}" placeholder="e.g. District meeting, Take meds" required>
      <label>Type</label><div class="cal-kinds">${Object.entries(KIND).map(([k, [n, c]]) => `<label class="cal-kind"><input type="radio" name="kind" value="${k}" ${(e.kind || "work") === k ? "checked" : ""}><span style="--c:${c}">${n}</span></label>`).join("")}</div>
      <label>${e.repeat && e.repeat !== "none" ? "Starts" : "Date"}</label><input type="date" name="date" value="${esc(e.date || d || todayKey())}" required>
      <div class="cal-2"><div><label>Start time</label><input type="time" name="time" value="${esc(e.time || "")}"></div><div><label>End time</label><input type="time" name="end" value="${esc(e.end || "")}"></div></div>
      <div class="sub" style="margin:4px 0 2px">Leave Start empty for an all-day item (reminders go at 9 AM).</div>
      <label>Repeat</label><select name="repeat">${REP.map(([k, n]) => `<option value="${k}" ${(e.repeat || "none") === k ? "selected" : ""}>${n}</option>`).join("")}</select>
      <div class="cal-days" ${(e.repeat || "none") === "days" ? "" : "hidden"}>${["S", "M", "T", "W", "T", "F", "S"].map((n, i) => `<label class="cal-rem cal-dw"><input type="checkbox" name="dw" value="${i}" ${(e.days || [new Date((e.date || d || todayKey()) + "T12:00:00").getDay()]).includes(i) ? "checked" : ""}><span>${n}</span></label>`).join("")}</div>
      <div class="cal-until" ${(e.repeat || "none") === "none" ? "hidden" : ""}><label>Ends (optional)</label><input type="date" name="until" value="${esc(e.until || "")}"></div>
      <label>Remind me</label><div class="cal-rems">${REMS.map(([v, n]) => `<label class="cal-rem"><input type="checkbox" name="rem" value="${v}" ${r.includes(v) ? "checked" : ""}><span>${n}</span></label>`).join("")}</div>
      <label>Location</label><input name="location" value="${esc(e.location || "")}">
      <label>Notes</label><textarea name="notes">${esc(e.notes || "")}</textarea>
      <div class="actions">${e.id ? `<button type="button" class="btn danger" data-act="ev-del" data-id="${e.id}">Delete</button>` : ""}<span class="sp"></span><button type="button" class="btn ghost" data-act="close">Cancel</button><button class="btn">Save</button></div></form>`);
    const F = document.querySelector('form[data-form="ev-save"]');
    const sync = () => { F.querySelector(".cal-days").hidden = F.repeat.value !== "days"; F.querySelector(".cal-until").hidden = F.repeat.value === "none"; };
    F.repeat.addEventListener("change", sync);
    F.querySelectorAll("[name=kind]").forEach((x) => x.addEventListener("change", () => { if (x.value === "med" && !e.id) { F.repeat.value = "daily"; F.querySelectorAll("[name=rem]").forEach((c) => (c.checked = c.value === "0")); sync(); } }));
  }
  function evOpen(id, d) {
    const e = (D.events || []).find((x) => x.id === id); if (!e) return;
    const [kn, kc] = KIND[e.kind] || KIND.other, done = (e.done || []).includes(d);
    const rem = (e.reminders || []).map((v) => (REMS.find(([x]) => x === v) || [, v + " min"])[1]).join(", ") || "None";
    sheet(`<div class="cal-dh"><span class="cal-bar" style="background:${kc}"></span><div><h2 style="margin:0">${esc(e.title)}</h2><div class="sub">${esc(kn)}</div></div></div>
      <div class="gv-kv"><span>When</span><b>${esc(dayLabel(d))} · ${clk(e.time)}${e.end ? "–" + clk(e.end) : ""}</b></div>
      ${e.repeat !== "none" ? `<div class="gv-kv"><span>Repeats</span><b>${esc(e.repeat === "days" ? "Every " + (e.days || []).map((x) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][x]).join(", ") : REP.find(([k]) => k === e.repeat)[1])}${e.until ? " until " + esc(e.until) : ""}</b></div>` : ""}
      <div class="gv-kv"><span>Reminders</span><b>${esc(rem)}</b></div>
      ${e.location ? `<div class="gv-kv"><span>Where</span><b><a href="https://maps.apple.com/?q=${encodeURIComponent(e.location)}" target="_blank" rel="noopener" style="color:var(--gold2)">${esc(e.location)}</a></b></div>` : ""}
      ${e.notes ? `<div class="gv-notes" style="margin-top:12px">${esc(e.notes)}</div>` : ""}
      <div class="actions">${e.kind === "med" ? `<button class="btn ${done ? "" : "ghost"}" data-act="ev-done" data-id="${e.id}|${d}">${done ? "✓ Taken" : "Mark taken"}</button>` : ""}${e.repeat !== "none" ? `<button class="btn ghost" data-act="ev-skip" data-id="${e.id}|${d}">Skip this one</button>` : ""}<span class="sp"></span><button class="btn ghost" data-act="close">Close</button><button class="btn" data-act="ev-edit" data-id="${e.id}">Edit</button></div>`);
  }
  async function evToggleDone(id, d, skip) {
    const e = D.events.find((x) => x.id === id); if (!e) return;
    const done = new Set(e.done || []); done.has(d) && !skip ? done.delete(d) : done.add(d);
    await save("events", { ...e, done: [...done] });
    if (skip) toast("Skipped");
  }

  // ---------- Documents: ID cards & papers, encrypted with the Passwords master password ----------
  const DOC_TYPES = [["dl", "Driver’s License", "id"], ["ccw", "Concealed Carry Permit", "shield"], ["mmj", "Medical Marijuana Card", "leaf"], ["auto", "Vehicle Insurance", "car"], ["ssn", "Social Security Card", "id"], ["passport", "Passport", "globe"], ["health", "Health Insurance", "plus"], ["reg", "Vehicle Registration", "car"], ["other", "Other", "doc"]];
  const DOCST = { view: {}, urls: {}, up: false };
  const dt = (k) => DOC_TYPES.find(([x]) => x === k) || DOC_TYPES[DOC_TYPES.length - 1];
  const docList = () => (PW.vault.docs = PW.vault.docs || []);
  async function encBytes(u8) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, PW.key, u8)); const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out; }
  async function decBytes(u8) { return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: u8.slice(0, 12) }, PW.key, u8.slice(12))); }
  async function docFileUrl(f) {
    if (DOCST.urls[f.fid]) return DOCST.urls[f.fid];
    const r = await fetch("/api/pw/file/" + f.fid, { headers: { authorization: "Bearer " + token } });
    if (!r.ok) throw new Error("Couldn’t load file");
    const u = URL.createObjectURL(new Blob([await decBytes(new Uint8Array(await r.arrayBuffer()))], { type: f.mime || "image/jpeg" }));
    return (DOCST.urls[f.fid] = u);
  }
  function docExp(d) {
    if (!d.expires) return "";
    const days = Math.round((new Date(d.expires + "T12:00:00") - new Date(todayKey() + "T12:00:00")) / 864e5);
    const when = new Date(d.expires + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    if (days < 0) return `<span class="pill bad">Expired ${when}</span>`;
    if (days <= 60) return `<span class="pill warn">Expires in ${days} day${days === 1 ? "" : "s"}</span>`;
    return `<span class="pill">Expires ${when}</span>`;
  }
  function pDocs() {
    const lockBtn = PW.key ? `<button class="btn ghost sm" data-act="pw-lock">Lock</button>` : "";
    const head = top("Documents", PW.key ? `<button class="btn ghost sm" data-act="doc-new">+ Add</button>` : "").replace('<div style="flex:1"></div>', `<div style="flex:1"></div>${lockBtn}<span style="width:8px"></span>`);
    if (!PW.key) return pKeys().replace(/^[\s\S]*?(<div class="lux pw-lockcard")/, head + "$1").replace("Enter your master password.", "Documents are encrypted with your Passwords master password.");
    const L = docList().slice().sort((a, b) => DOC_TYPES.findIndex(([k]) => k === a.type) - DOC_TYPES.findIndex(([k]) => k === b.type));
    setTimeout(docThumbs, 0);
    return head + (L.length ? `<div class="doc-g">${L.map((d, i) => `<button class="doc-c" data-act="doc-open" data-id="${d.id}" style="--d:${i * 50}ms">
        <span class="doc-img" data-thumb="${d.files?.[0]?.mime?.startsWith("image") ? d.files[0].fid : ""}">${svg(dt(d.type)[2])}</span>
        <b>${esc(d.name || dt(d.type)[1])}</b>${docExp(d) || `<small>${d.files?.length ? d.files.length + " file" + (d.files.length > 1 ? "s" : "") : "No scans yet"}</small>`}</button>`).join("")}</div>`
      : `<div class="empty">No documents yet.<br><button class="btn" data-act="doc-new" style="margin-top:12px">Add your first</button></div>`)
      + `<div class="sub" style="text-align:center;margin-top:16px">Encrypted on this phone · locks with Passwords</div>`;
  }
  async function docThumbs() {
    for (const el of document.querySelectorAll(".doc-img[data-thumb]:not([data-done])")) {
      el.dataset.done = 1; const fid = el.dataset.thumb; if (!fid) continue;
      const d = docList().find((x) => x.files?.[0]?.fid === fid);
      try { const u = await docFileUrl(d.files[0]); el.innerHTML = `<img src="${u}" alt="">`; } catch (_) {}
    }
  }
  function docOpen(id) {
    const d = docList().find((x) => x.id === id); if (!d) return;
    const show = DOCST.view[id];
    const row = (k, v, f, mask) => v ? `<div class="pw-row"><div class="grow"><div class="lbl">${k}</div><div class="pw-v ${mask ? "mono" : ""}">${mask && !show ? "•••• " + esc(String(v).slice(-4)) : esc(v)}</div></div>${mask ? `<button class="btn ghost sm" data-act="doc-show" data-id="${id}">${show ? "Hide" : "Show"}</button>` : ""}<button class="btn ghost sm" data-act="doc-copy" data-id="${id}" data-f="${f}">Copy</button></div>` : "";
    sheet(`<div class="cal-dh"><span class="pw-av">${svg(dt(d.type)[2])}</span><div><h2 style="margin:0">${esc(d.name || dt(d.type)[1])}</h2><div class="sub">${esc(dt(d.type)[1])}</div></div></div>
      <div class="doc-files">${(d.files || []).map((f, n) => `<button class="doc-f" data-act="doc-file" data-id="${id}|${n}"><span class="doc-fi" data-fid="${f.fid}">${f.mime === "application/pdf" ? "PDF" : "…"}</span><small>${esc(f.side || "")}</small></button>`).join("")}
        <label class="doc-f add">${DOCST.up ? "<span>Uploading…</span>" : `<span>+</span><small>Photo / PDF</small>`}<input type="file" accept="image/*,application/pdf" multiple data-docupload="${id}" hidden></label></div>
      ${row("Number", d.number, "number", true)}${row("Name on document", d.holder, "holder")}${row("Issued by", d.issuer, "issuer")}
      ${d.issued ? `<div class="gv-kv"><span>Issued</span><b>${esc(d.issued)}</b></div>` : ""}${d.expires ? `<div class="gv-kv"><span>Expires</span><b>${esc(d.expires)}</b></div>` : ""}
      ${d.notes ? `<div class="gv-notes" style="margin-top:12px">${esc(d.notes)}</div>` : ""}
      <div class="actions"><button type="button" class="btn danger" data-act="doc-del" data-id="${id}">Delete</button><span class="sp"></span><button class="btn ghost" data-act="close">Close</button><button class="btn" data-act="doc-edit" data-id="${id}">Edit</button></div>`);
    document.querySelectorAll(".doc-fi[data-fid]").forEach(async (el) => { const f = d.files.find((x) => x.fid === el.dataset.fid); if (f.mime === "application/pdf") return; try { el.innerHTML = `<img src="${await docFileUrl(f)}" alt="">`; } catch (_) { el.textContent = "!"; } });
  }
  function docForm(d = {}) {
    sheet(`<h2>${d.id ? "Edit" : "Add"} document</h2><form data-form="doc-save" data-id="${d.id || ""}">
      <label>Type</label><select name="type">${DOC_TYPES.map(([k, n]) => `<option value="${k}" ${(d.type || "dl") === k ? "selected" : ""}>${n}</option>`).join("")}</select>
      <label>Label (optional)</label><input name="name" value="${esc(d.name || "")}" placeholder="e.g. Jeff’s license, Lindsey’s card">
      <label>Number</label><input name="number" value="${esc(d.number || "")}" autocomplete="off" autocapitalize="characters" class="mono">
      <label>Name on document</label><input name="holder" value="${esc(d.holder || "")}">
      <label>Issued by</label><input name="issuer" value="${esc(d.issuer || "")}" placeholder="e.g. PennDOT, Cumberland County Sheriff, Progressive">
      <div class="cal-2"><div><label>Issued</label><input type="date" name="issued" value="${esc(d.issued || "")}"></div><div><label>Expires</label><input type="date" name="expires" value="${esc(d.expires || "")}"></div></div>
      <label class="doc-chk"><input type="checkbox" name="remind" ${d.id ? "" : "checked"}> Add a renewal reminder to Calendar (30 days before it expires)</label>
      <label>Notes</label><textarea name="notes">${esc(d.notes || "")}</textarea>
      ${d.id ? "" : `<label>Scans (front, back, PDF)</label><input type="file" name="files" accept="image/*,application/pdf" multiple>`}
      <div class="actions"><span class="sp"></span><button type="button" class="btn ghost" data-act="close">Cancel</button><button class="btn">${DOCST.up ? "Saving…" : "Save"}</button></div></form>`);
  }
  async function docUploadFiles(list) {
    const out = [];
    for (const f of [...list]) {
      const pdf = /pdf/i.test(f.type) || /\.pdf$/i.test(f.name);
      let bytes, mime = "application/pdf";
      if (pdf) bytes = new Uint8Array(await f.arrayBuffer());
      else { const { im, u } = await loadImage(f); const k = Math.min(1, 2200 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas"); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); bytes = new Uint8Array(await (await toBlob(c, 0.86)).arrayBuffer()); mime = "image/jpeg"; }
      const r = await fetch("/api/pw/file", { method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/octet-stream" }, body: await encBytes(bytes) });
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Upload failed");
      out.push({ fid: d.id, mime, side: ["Front", "Back"][out.length] || (pdf ? "PDF" : "Photo") });
    }
    return out;
  }
  async function docSubmit(f) {
    const fd = new FormData(f), id = f.dataset.id, L = docList(), old = L.find((x) => x.id === id) || {};
    const d = { ...old, id: id || newPwId(), type: fd.get("type"), name: String(fd.get("name") || "").trim(), number: String(fd.get("number") || "").trim(), holder: String(fd.get("holder") || "").trim(), issuer: String(fd.get("issuer") || "").trim(), issued: fd.get("issued") || "", expires: fd.get("expires") || "", notes: String(fd.get("notes") || ""), files: old.files || [] };
    const picks = fd.getAll("files").filter((x) => x && x.size);
    if (picks.length) { DOCST.up = true; toast("Encrypting & uploading…"); try { d.files = [...d.files, ...(await docUploadFiles(picks))]; } finally { DOCST.up = false; } }
    const i = L.findIndex((x) => x.id === d.id); i >= 0 ? (L[i] = d) : L.push(d);
    await pwPersist();
    if (fd.get("remind") && d.expires) {
      const t = new Date(d.expires + "T12:00:00"); t.setDate(t.getDate() - 30); const when = dkey(t) < todayKey() ? todayKey() : dkey(t);
      const nm = d.name || dt(d.type)[1];
      await save("events", { title: `Renew ${nm}`, kind: "personal", date: when, time: "", end: "", repeat: "none", until: "", reminders: [0], location: "", notes: `${nm} expires ${d.expires}.`, days: [] }).catch(() => {});
    }
    closeSheet(); render(); toast("Saved");
  }
  document.addEventListener("change", async (e) => {
    if (!e.target.matches("input[data-docupload]")) return;
    const id = e.target.dataset.docupload, list = e.target.files; e.target.value = "";
    const d = docList().find((x) => x.id === id); if (!d || !list.length) return;
    DOCST.up = true; docOpen(id);
    try { d.files = [...(d.files || []), ...(await docUploadFiles(list))]; await pwPersist(); toast("Added"); } catch (x) { toast(x.message); }
    DOCST.up = false; docOpen(id); render();
  });
  async function docViewFile(id, n) {
    const d = docList().find((x) => x.id === id), f = d?.files?.[n]; if (!f) return;
    let u; try { u = await docFileUrl(f); } catch (x) { return toast(x.message); }
    if (f.mime === "application/pdf") { const a = document.createElement("a"); a.href = u; a.target = "_blank"; a.download = (d.name || dt(d.type)[1]) + ".pdf"; a.click(); return; }
    const v = document.createElement("div"); v.className = "pv-view"; v.id = "docview";
    v.innerHTML = `<img src="${u}" alt=""><div class="pv-bar"><span>${esc(d.name || dt(d.type)[1])} · ${esc(f.side || "")}</span></div><div class="pv-tools"><button data-dv="del" class="bad">Remove</button></div><button class="pv-x" data-dv="close">×</button>`;
    v.addEventListener("click", async (e) => { const a = e.target.closest("[data-dv]")?.dataset.dv; if (a === "close" || e.target === v) v.remove(); if (a === "del" && confirmDel()) { d.files.splice(n, 1); await pwPersist(); fetch("/api/pw/file/" + f.fid, { method: "DELETE", headers: { authorization: "Bearer " + token } }); v.remove(); docOpen(id); } });
    document.body.appendChild(v);
  }

  // ---------- Gerald ----------
  const chat = { msgs: [], busy: false };
  const SUGGEST = ["Brief me on today", "How's Trim doing this week?", "What's coming in?", "What did I spend on gas this month?"];
  const md = (s) => esc(s).replace(/\[\[login:([A-Za-z0-9_-]+)\]\]/g, (_, id) => `<button class="gv-link" data-act="pw-g" data-id="${id}">Open ${esc(PW.key ? pwItem(id)?.title || "login" : "login")} ›</button>`).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^\s*[-•]\s+(.*)$/gm, "<li>$1</li>").replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m.replace(/\n/g, "")}</ul>`).replace(/\n/g, "<br>");
  function geraldHTML() {
    return `<div class="g-head"><span class="gdot big">G</span><div class="grow"><div class="g-name">Gerald</div><div class="sub">Your assistant · sees everything in Life</div></div><button class="icon" data-act="close" style="font-size:26px">×</button></div>
      <div class="g-log" id="glog">${chat.msgs.length ? chat.msgs.map((m) => `<div class="gm ${m.role}">${m.role === "assistant" ? md(m.content) : esc(m.content)}</div>`).join("") : `<div class="g-hello">Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, Jeff. What can I do for you?</div>`}
      ${chat.busy ? `<div class="gm assistant typing"><i></i><i></i><i></i></div>` : ""}</div>
      ${chat.msgs.length ? "" : `<div class="g-sugg">${SUGGEST.map((q) => `<button data-act="g-ask" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>`}
      <form class="g-in" data-form="gerald"><input name="q" placeholder="Ask or tell Gerald…" autocomplete="off" ${chat.busy ? "disabled" : ""}><button class="btn" ${chat.busy ? "disabled" : ""}>Send</button></form>`;
  }
  function openGerald() {
    let m = document.getElementById("gmodal");
    if (!m) {
      m = document.createElement("div");
      m.className = "modal gmodal"; m.id = "gmodal";
      m.innerHTML = `<div class="sheet gsheet"></div>`;
      m.addEventListener("click", (e) => { if (e.target === m) m.remove(); });
      document.body.appendChild(m);
    }
    m.firstChild.innerHTML = geraldHTML();
    bindForms(m);
    const log = document.getElementById("glog"); if (log) log.scrollTop = log.scrollHeight;
  }
  async function askGerald(q) {
    q = String(q || "").trim();
    if (!q || chat.busy) return;
    chat.msgs.push({ role: "user", content: q }); chat.busy = true; openGerald();
    try {
      const pw = PW.key ? [...PW.vault.items.map((x) => ({ id: x.id, t: x.title, u: x.user, h: host(x.url), c: x.cat || "" })), ...(PW.vault.docs || []).map((d) => ({ id: d.id, t: (d.name || dt(d.type)[1]) + " (document)", u: "", h: "", c: d.expires ? "expires " + d.expires : "document" }))] : PW.meta && !PW.meta.empty ? "locked" : null;
      const r = await api("/gerald", { method: "POST", body: { messages: chat.msgs.slice(-16), pw } });
      chat.msgs.push({ role: "assistant", content: r.reply });
      if (r.changed) { D = { todo: [], wish: [], pkgs: [], events: [], status: {}, ...(await api("all")) }; render(); }
    } catch (e) { if (e.message !== "signin") chat.msgs.push({ role: "assistant", content: e.message }); }
    chat.busy = false;
    if (document.getElementById("gmodal")) { openGerald(); document.querySelector("#gmodal input[name=q]")?.focus(); }
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
        case "close": closeSheet(); document.getElementById("gmodal")?.remove(); break;
        case "gerald": openGerald(); setTimeout(() => document.querySelector("#gmodal input[name=q]")?.focus(), 350); break;
        case "g-ask": askGerald(el.dataset.q); break;
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
        case "money-refresh": { if (money?.syncing) break; money = { ...(money || {}), syncing: true }; render();
          try { money = await api("money?sync=1"); toast(money.syncFailed ? "Bank sync didn’t finish — showing last data" : money.syncErrors?.length ? `${money.syncErrors.length} bank(s) need attention` : "Banks synced"); } catch (_) { money = { ready: false, why: "Couldn’t load" }; } render(); break; }
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
        case "pv-new": albumSheet(); break;
        case "pv-album": openAlbum(id); break;
        case "pv-back": PV.album = null; PV.photos = []; if (!PV.albums) loadAlbums(); render(); break;
        case "pv-amenu": albumSheet(PV.album); break;
        case "pv-adel": if (confirmDel()) { await api(`vault/albums/${id}`, { method: "DELETE" }); closeSheet(); PV.album = null; PV.albums = null; render(); toast("Album deleted"); } break;
        case "pv-open": pvView(+id); break;
        case "more": e.preventDefault(); moreSheet(); break;
        case "cal-day": CAL.sel = id; CAL.month = id.slice(0, 7); render(); break;
        case "cal-mo": { const [yy, mm] = CAL.month.split("-").map(Number), t2 = new Date(yy, mm - 1 + +id, 1); CAL.month = dkey(t2).slice(0, 7); render(); break; }
        case "ev-new": evForm({}, route() === "cal" ? CAL.sel : todayKey()); break;
        case "ev-open": { const [i, d] = id.split("|"); evOpen(i, d); break; }
        case "ev-edit": evForm(D.events.find((x) => x.id === id)); break;
        case "ev-done": { const [i, d] = id.split("|"); await evToggleDone(i, d); if (document.getElementById("modal")) evOpen(i, d); break; }
        case "ev-skip": { const [i, d] = id.split("|"); await evToggleDone(i, d, true); closeSheet(); break; }
        case "ev-del": if (confirmDel()) { await remove("events", id); closeSheet(); toast("Deleted"); } break;
        case "close-more": closeSheet(); break;
        case "pw-lock": pwLock(); break;
        case "doc-new": docForm(); break;
        case "doc-open": docOpen(id); break;
        case "doc-edit": docForm(docList().find((x) => x.id === id)); break;
        case "doc-show": DOCST.view[id] = !DOCST.view[id]; docOpen(id); break;
        case "doc-copy": { const d = docList().find((x) => x.id === id); if (d) pwCopy(d[el.dataset.f] || ""); break; }
        case "doc-file": { const [i, n] = id.split("|"); docViewFile(i, +n); break; }
        case "doc-del": if (confirmDel()) { const d = docList().find((x) => x.id === id); PW.vault.docs = docList().filter((x) => x.id !== id); await pwPersist(); (d?.files || []).forEach((f) => fetch("/api/pw/file/" + f.fid, { method: "DELETE", headers: { authorization: "Bearer " + token } })); closeSheet(); render(); toast("Deleted"); } break;
        case "pw-cat": PW.cat = PW.cat === id ? "" : id; render(); break;
        case "pw-g": { if (!PW.key) { toast("Unlock Passwords first"); document.getElementById("gmodal")?.remove(); location.hash = "keys"; break; } const x = pwItem(id); if (x) pwOpen(x); else toast("That login isn’t here anymore"); break; }
        case "pw-new": pwForm(); break;
        case "pw-open": pwOpen(pwItem(id)); break;
        case "pw-edit": pwForm(pwItem(id)); break;
        case "pw-reveal": PW.reveal[id] = !PW.reveal[id]; pwOpen(pwItem(id)); break;
        case "pw-copy": { const x = pwItem(id); if (x) pwCopy(x[el.dataset.f] || ""); break; }
        case "pw-gen": { const i = el.closest("form").querySelector("[name=pass]"); i.value = pwGen(); break; }
        case "pw-del": if (confirmDel()) { PW.vault.items = PW.vault.items.filter((x) => x.id !== id); await pwPersist(); closeSheet(); render(); toast("Deleted"); } break;
        case "pw-change": sheet(`<h2>New master password</h2><form data-form="pw-newmaster"><input name="m" type="password" autocomplete="off" placeholder="New master password" required><input name="m2" type="password" autocomplete="off" placeholder="Type it again" required style="margin-top:8px"><div class="actions"><span class="sp"></span><button type="button" class="btn ghost" data-act="close">Cancel</button><button class="btn">Change</button></div></form>`); break;
        case "gv-tab": GV.tab = id; render(); break;
        case "gv-open": GV.open[id] = !GV.open[id]; render(); break;
        case "gv-serial": GV.serial[id] = !GV.serial[id]; render(); break;
        case "gv-view": { const [k, n] = id.split("|"); gvView(k, +n); break; }
        case "gv-goto": { const [c, i] = id.split("/"); GV.tab = c; GV.open[id] = true; render(); setTimeout(() => document.getElementById("gv-" + i)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60); break; }
        case "gv-new": gvEdit(GV.tab); break;
        case "gv-edit": { const [c, i] = id.split("/"); gvEdit(c, gvFind(c, i)); break; }
        case "gv-del": if (confirmDel()) { const [c, i] = id.split("/"); await api(`gv/${c}/${encodeURIComponent(i)}`, { method: "DELETE" }); GV.data[c] = GV.data[c].filter((x) => x.id !== i); closeSheet(); render(); toast("Deleted"); } break;
        case "gv-addrow": el.previousElementSibling.insertAdjacentHTML("beforeend", rowHTML(id)); el.previousElementSibling.lastElementChild.querySelector("input").focus(); break;
        case "gv-rmrow": el.closest(".gv-er").remove(); break;
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
        case "gerald": f.reset(); askGerald(v.q); break;
        case "gv-save": await gvSubmit(f); break;
        case "ev-save": { const fd = new FormData(f); const body = { title: v.title, kind: fd.get("kind") || "other", date: v.date, time: v.time, end: v.end, repeat: v.repeat, days: fd.getAll("dw").map(Number), until: v.repeat === "none" ? "" : v.until, location: v.location, notes: v.notes, reminders: fd.getAll("rem").map(Number) };
          const old = f.dataset.id && D.events.find((x) => x.id === f.dataset.id); await save("events", { ...(old || {}), ...body, ...(old ? { id: old.id } : {}) }); closeSheet(); CAL.sel = body.date; CAL.month = body.date.slice(0, 7);
          if (typeof Notification !== "undefined" && Notification.permission !== "granted" && body.reminders.length) toast("Turn on reminders on the Calendar page to get alerts"); else toast("Saved"); break; }
        case "doc-save": await docSubmit(f); break;
        case "pw-create": case "pw-unlock": case "pw-save": case "pw-newmaster": await pwSubmit(f, v); break;
        case "pv-album": {
          if (id) { const r = await api(`vault/albums/${id}`, { method: "PUT", body: { name: v.name } }); PV.album = { ...PV.album, name: r.name }; }
          else { const r = await api("vault/albums", { method: "POST", body: { name: v.name } }); PV.albums = [...(PV.albums || []), r]; closeSheet(); openAlbum(r.id); break; }
          PV.albums = null; closeSheet(); render(); break;
        }
        case "todo-add": await save("todo", { text: v.text, due: v.due }); break;
        case "todo-save": { const t = D.todo.find((x) => x.id === id); await save("todo", { ...t, text: v.text, due: v.due, notes: v.notes }); closeSheet(); break; }
        case "wish-save": { const w = D.wish.find((x) => x.id === id) || {}; await save("wish", { ...w, id, ...v }); closeSheet(); break; }
        case "pkg-add": await save("pkgs", { tracking: v.tracking, label: v.label, from: v.from }); toast("Tracking"); break;
      }
    } catch (x) { if (x.message !== "signin") toast(x.message); }
    finally { if (btn) btn.disabled = false; }
  }

  // ---------- Auto-update: when a new version is live, reload on its own ----------
  // Checks every minute and whenever Life comes back to the foreground. Waits while a sheet is open or you're typing.
  const myVer = (document.querySelector('script[src*="app.js"]')?.getAttribute("src").match(/v=(\d+)/) || [])[1];
  let pendingVer = null;
  async function checkVersion() {
    try {
      const html = await (await fetch("/?_=" + Date.now(), { cache: "no-store" })).text();
      const v = (html.match(/app\.js\?v=(\d+)/) || [])[1];
      if (v && myVer && v !== myVer) pendingVer = v;
    } catch (_) {}
    applyUpdate();
  }
  function applyUpdate() {
    if (!pendingVer) return;
    const busy = document.getElementById("modal") || document.getElementById("gmodal") || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
    if (busy) return;
    try { sessionStorage.setItem("life.updated", "1"); } catch (_) {}
    location.reload();
  }
  setInterval(checkVersion, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkVersion(); });
  document.addEventListener("focusout", () => setTimeout(applyUpdate, 300));
  try { if (sessionStorage.getItem("life.updated")) { sessionStorage.removeItem("life.updated"); setTimeout(() => toast("Life updated"), 900); } } catch (_) {}

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.open) location.hash = e.data.open; });
  linkSignIn().then(boot, () => {});
})();
