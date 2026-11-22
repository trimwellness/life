// Life API. Everything except /api/login needs the device token handed out by the private link.
import { store, COLS, env, json, clip, num, newId, readPrefix, makeToken, signedIn, same } from "../lib/common.mjs";
import { pushReady, hashOf, sendPush } from "../lib/push.mjs";
import { trimData, moneyData } from "../lib/feeds.mjs";
import { odReady, makeState, authorizeUrl, graph } from "../lib/onedrive.mjs";
import { parcelReady, checkPackages, guessCarrier, clean } from "../lib/parcel.mjs";

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

// What each collection keeps; anything else sent is dropped.
const CLEAN = {
  todo: (b, old = {}) => ({ text: clip(b.text, 300), due: /^\d{4}-\d{2}-\d{2}$/.test(b.due) ? b.due : "", done: !!b.done, doneAt: b.done ? old.doneAt || Date.now() : null, notes: clip(b.notes, 1000) }),
  wish: (b, old = {}) => ({ name: clip(b.name, 200), url: /^https?:\/\//i.test(b.url || "") ? clip(b.url, 1000) : "", price: num(b.price), priority: ["high", "med", "low"].includes(b.priority) ? b.priority : "med", notes: clip(b.notes, 1000), got: !!b.got, gotAt: b.got ? old.gotAt || Date.now() : null }),
  pkgs: (b, old = {}) => {
    const tracking = clean(b.tracking).slice(0, 40);
    const carrier = ["usps", "ups", "fedex", "dhl", "intl", "amazon"].includes(b.carrier) ? b.carrier : guessCarrier(tracking);
    const keep = tracking === clean(old.tracking) ? old : {};
    return { ...keep, tracking, carrier, label: clip(b.label, 120), from: clip(b.from, 120), archived: !!b.archived, ...(keep.createdAt ? {} : { createdAt: Date.now() }) };
  },
};

// The gun ledger was removed; clear any of its saved data once.
async function clearGuns(s) {
  if (await s.get("meta/guns-cleared", { type: "json" })) return;
  const { blobs } = await s.list({ prefix: "guns/" });
  await Promise.all(blobs.map((b) => s.delete(b.key)));
  await s.delete("meta/seeded");
  await s.setJSON("meta/guns-cleared", { at: Date.now() });
}

async function login(req, s) {
  const want = env("LIFE_LINK_KEY");
  if (!want) return json({ error: "LIFE_LINK_KEY isn’t set on the Netlify project yet." }, 503);
  const lock = (await s.get("meta/login", { type: "json" })) || { fails: 0, until: 0 };
  if (lock.until > Date.now()) return json({ error: "Too many tries. Wait 15 minutes." }, 429);
  const b = await req.json().catch(() => ({}));
  if (!same(String(b.key || ""), want)) {
    const fails = (lock.fails || 0) + 1;
    await s.setJSON("meta/login", fails >= 5 ? { fails: 0, until: Date.now() + 15 * 60e3 } : { fails, until: 0 });
    return json({ error: "That link isn’t right" }, 401);
  }
  await s.setJSON("meta/login", { fails: 0, until: 0 });
  return json({ token: await makeToken() });
}

// ---- Photo Vault (OneDrive) ----
const isMedia = (it) => it.image || it.photo || it.video || /^(image|video)\//.test(it.file?.mimeType || "");
async function photos(req, s, p, url) {
  if (!odReady()) return json({ ready: false, configured: false });
  const od = (await s.get("meta/onedrive", { type: "json" })) || {};
  if (!p[0]) return json({ ready: true, configured: true, connected: !!od.refresh, account: od.account || "", folders: od.folders || [] });
  if (p[0] === "start") return json({ url: authorizeUrl(req, await makeState()) });
  if (p[0] === "disconnect" && req.method === "POST") { await s.setJSON("meta/onedrive", { folders: od.folders || [] }); return json({ ok: true }); }
  if (p[0] === "folders" && req.method === "PUT") {
    const b = await req.json().catch(() => ({}));
    const folders = (Array.isArray(b.folders) ? b.folders : []).slice(0, 30).map((f) => ({ id: clip(f.id, 120), name: clip(f.name, 120), path: clip(f.path, 400) })).filter((f) => f.id);
    await s.setJSON("meta/onedrive", { ...od, folders });
    return json({ folders });
  }
  if (p[0] === "browse") {
    const id = url.searchParams.get("id") || "root";
    const base = id === "root" ? "/me/drive/root" : `/me/drive/items/${encodeURIComponent(id)}`;
    const [me, kids] = await Promise.all([graph(s, `${base}?$select=id,name,parentReference`), graph(s, `${base}/children?$select=id,name,folder,image,photo,video,file&$top=500`)]);
    const path = me.parentReference?.path ? decodeURIComponent(me.parentReference.path.replace(/^\/drive\/root:?/, "")) + "/" + me.name : "";
    return json({ id: me.id, name: id === "root" ? "OneDrive" : me.name, path: path || "/", parent: id === "root" ? null : me.parentReference?.id || "root",
      folders: (kids.value || []).filter((k) => k.folder).map((k) => ({ id: k.id, name: k.name, count: k.folder.childCount })).sort((a, b) => a.name.localeCompare(b.name)),
      media: (kids.value || []).filter(isMedia).length });
  }
  if (p[0] === "items") {
    const id = url.searchParams.get("folder");
    if (!id) return json({ error: "folder needed" }, 400);
    const next = url.searchParams.get("next");
    const d = await graph(s, next && next.startsWith("https://graph.microsoft.com/") ? next : `/me/drive/items/${encodeURIComponent(id)}/children?$expand=thumbnails&$top=120`);
    const items = (d.value || []).filter(isMedia).map((it) => {
      const t = it.thumbnails?.[0] || {};
      return { id: it.id, name: it.name, video: !!it.video || /^video\//.test(it.file?.mimeType || ""), taken: it.photo?.takenDateTime || it.createdDateTime,
        thumb: t.medium?.url || t.small?.url || "", large: t.large?.url || t.medium?.url || "", full: it["@microsoft.graph.downloadUrl"] || "" };
    });
    return json({ items, next: d["@odata.nextLink"] || null });
  }
  return json({ error: "not found" }, 404);
}

export default async (req) => {
  const s = store();
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const m = req.method;

  if (parts[0] === "login" && m === "POST") return login(req, s);
  if (!(await signedIn(req))) return json({ error: "signin" }, 401);

  try {
    if (parts[0] === "all" && m === "GET") {
      await clearGuns(s);
      const out = {};
      for (const c of COLS) out[c] = await readPrefix(s, c + "/");
      out.status = { parcel: parcelReady(), push: pushReady(), finance: !!env("FINANCE_PIN"), trim: !!env("LIFE_FEED_KEY"), photos: odReady() };
      return json(out);
    }

    if (parts[0] === "c" && COLS.includes(parts[1])) {
      const col = parts[1];
      if (m === "POST" && !parts[2]) {
        const b = await req.json().catch(() => ({}));
        const id = newId(), doc = CLEAN[col](b);
        if (col === "pkgs" && !doc.tracking) return json({ error: "Tracking number needed" }, 400);
        await s.setJSON(`${col}/${id}`, doc);
        if (col === "pkgs" && parcelReady()) await checkPackages(s, { read: false }).catch((e) => console.error(e));
        const saved = await s.get(`${col}/${id}`, { type: "json" });
        return json({ id, ...saved });
      }
      const id = parts[2];
      if (!ID_RE.test(id || "")) return json({ error: "bad id" }, 400);
      const key = `${col}/${id}`;
      if (m === "PUT") {
        const b = await req.json().catch(() => ({}));
        const old = (await s.get(key, { type: "json" })) || {};
        const doc = CLEAN[col](b, old);
        await s.setJSON(key, doc);
        return json({ id, ...doc });
      }
      if (m === "DELETE") { await s.delete(key); return json({ ok: true }); }
    }

    if (parts[0] === "trim") return json(await trimData());
    if (parts[0] === "money") return json(await moneyData(s));
    if (parts[0] === "photos") return photos(req, s, parts.slice(1), url);

    if (parts[0] === "pkgs" && parts[1] === "check" && m === "POST") {
      const r = await checkPackages(s);
      return json({ ...r, pkgs: await readPrefix(s, "pkgs/") });
    }

    if (parts[0] === "push") {
      const pub = pushReady();
      if (parts[1] === "key") return json({ key: pub });
      if (!pub) return json({ error: "Push keys aren’t set" }, 503);
      if (parts[1] === "sub" && m === "POST") {
        const b = await req.json().catch(() => ({}));
        if (!b.sub || !b.sub.endpoint) return json({ error: "no subscription" }, 400);
        await s.setJSON("push/" + (await hashOf(b.sub.endpoint)), { sub: b.sub, device: clip(b.device, 80), at: Date.now() });
        return json({ ok: true });
      }
      if (parts[1] === "test" && m === "POST") return json(await sendPush(s, { title: "Life", body: "Alerts are on for this device.", tag: "test", url: "/#pkgs" }));
    }

    return json({ error: "not found" }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: String(e.message || e).slice(0, 300) }, 500);
  }
};

export const config = { path: "/api/*" };
