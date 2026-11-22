// Photo Vault: Jeff's own albums and photos, stored privately in Netlify Blobs.
// Metadata lives in the "life" store (albums/<id>, photos/<id>); image bytes in "life-photos" (<id>/t thumb, <id>/f full).
// The phone resizes each photo before upload (full ≤2400px, thumb ≤480px), so files stay small.
import { getStore } from "@netlify/blobs";
import { json, clip, num, newId, readPrefix, sign } from "./common.mjs";

export const bin = () => getStore({ name: "life-photos", consistency: "strong" });
export const imgKey = async (id) => (await sign("img." + id)).slice(0, 24);
const ID = /^[A-Za-z0-9_-]{1,40}$/;

async function withKeys(list) {
  return Promise.all(list.map(async (p) => ({ ...p, k: await imgKey(p.id) })));
}

export async function vault(req, s, p) {
  const m = req.method;
  const albums = async () => (await readPrefix(s, "albums/")).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt || 0) - (b.createdAt || 0));
  const photosOf = async (aid) => (await readPrefix(s, "photos/")).filter((x) => !aid || x.album === aid).sort((a, b) => (b.takenAt || b.createdAt || 0) - (a.takenAt || a.createdAt || 0));

  // GET vault → albums with counts and a cover
  if (!p[0] && m === "GET") {
    const [al, ph] = await Promise.all([albums(), photosOf()]);
    const out = await Promise.all(al.map(async (a) => {
      const mine = ph.filter((x) => x.album === a.id);
      const cover = mine.find((x) => x.id === a.cover) || mine[0];
      return { ...a, count: mine.length, cover: cover ? { id: cover.id, k: await imgKey(cover.id) } : null };
    }));
    return json({ albums: out, total: ph.length });
  }

  if (p[0] === "albums") {
    if (!p[1] && m === "POST") {
      const b = await req.json().catch(() => ({}));
      const name = clip(b.name, 60);
      if (!name) return json({ error: "Album needs a name" }, 400);
      const id = newId(), doc = { name, order: Date.now(), createdAt: Date.now() };
      await s.setJSON("albums/" + id, doc);
      return json({ id, ...doc, count: 0, cover: null });
    }
    const aid = p[1];
    if (!ID.test(aid || "")) return json({ error: "bad album" }, 400);
    const a = await s.get("albums/" + aid, { type: "json" });
    if (!a) return json({ error: "Album not found" }, 404);
    if (p[2] === "photos" && m === "GET") return json({ album: { id: aid, ...a }, photos: await withKeys(await photosOf(aid)) });
    if (m === "PUT") {
      const b = await req.json().catch(() => ({}));
      const doc = { ...a, name: clip(b.name ?? a.name, 60) || a.name, cover: ID.test(b.cover || "") ? b.cover : a.cover };
      await s.setJSON("albums/" + aid, doc);
      return json({ id: aid, ...doc });
    }
    if (m === "DELETE") {
      const ph = await photosOf(aid), B = bin();
      await Promise.all(ph.map((x) => Promise.all([s.delete("photos/" + x.id), B.delete(x.id + "/t"), B.delete(x.id + "/f")])));
      await s.delete("albums/" + aid);
      return json({ ok: true, removed: ph.length });
    }
  }

  // POST vault/upload (multipart: album, thumb, full, w, h, takenAt, name)
  if (p[0] === "upload" && m === "POST") {
    const f = await req.formData().catch(() => null);
    if (!f) return json({ error: "Upload failed" }, 400);
    const aid = String(f.get("album") || "");
    if (!ID.test(aid) || !(await s.get("albums/" + aid, { type: "json" }))) return json({ error: "Pick an album first" }, 400);
    const thumb = f.get("thumb"), full = f.get("full");
    if (!thumb || !full || typeof thumb === "string" || typeof full === "string") return json({ error: "Missing image" }, 400);
    if (full.size > 5.5e6) return json({ error: "That photo is too large" }, 413);
    const id = newId(), B = bin();
    await Promise.all([B.set(id + "/t", await thumb.arrayBuffer()), B.set(id + "/f", await full.arrayBuffer())]);
    const doc = { album: aid, name: clip(f.get("name"), 120), w: num(f.get("w")), h: num(f.get("h")), takenAt: +f.get("takenAt") || Date.now(), createdAt: Date.now(), size: full.size };
    await s.setJSON("photos/" + id, doc);
    return json({ id, ...doc, k: await imgKey(id) });
  }

  if (p[0] === "photos" && ID.test(p[1] || "")) {
    const key = "photos/" + p[1];
    const ph = await s.get(key, { type: "json" });
    if (!ph) return json({ error: "Photo not found" }, 404);
    if (m === "DELETE") {
      const B = bin();
      await Promise.all([s.delete(key), B.delete(p[1] + "/t"), B.delete(p[1] + "/f")]);
      return json({ ok: true });
    }
    if (m === "PUT") {
      const b = await req.json().catch(() => ({}));
      if (b.album && ID.test(b.album) && (await s.get("albums/" + b.album, { type: "json" }))) ph.album = b.album;
      await s.setJSON(key, ph);
      return json({ id: p[1], ...ph });
    }
  }
  return json({ error: "not found" }, 404);
}
