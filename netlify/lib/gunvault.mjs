// Gun Vault: the Safe Ledger, inside Life. Records live in the "life" store under gv/<collection>/<id>;
// photos and PDFs live in the "life-photos" store under gv/<fileId>/f (full) and gv/<fileId>/t (thumbnail).
import { getStore } from "@netlify/blobs";
import { json, newId, sign, env } from "./common.mjs";

export const GV_COLS = ["firearms", "nfa", "mags", "spares", "gear"];
export const files = () => getStore({ name: "life-photos", consistency: "strong" });
export const fileKey = async (id) => (await sign("gvf." + id)).slice(0, 24);
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const FID = /^[A-Za-z0-9_-]{1,64}$/;

async function list(s, col) {
  const { blobs } = await s.list({ prefix: `gv/${col}/` });
  const out = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })));
  return out.filter(Boolean).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.name).localeCompare(String(b.name)));
}

// Every file id a record points to (photos, part pictures, spare picture).
function fileIds(r) {
  const ids = new Set();
  (r.photos || []).forEach((p) => p?.id && ids.add(p.id));
  [...(r.parts || []), ...(r.accessories || [])].forEach((p) => p?.img && ids.add(p.img));
  if (r.img) ids.add(r.img);
  return [...ids].filter((x) => FID.test(x));
}

// Keep a record sane: plain JSON, capped size, forced id.
function cleanRecord(b, id) {
  const r = JSON.parse(JSON.stringify(b || {}));
  r.id = id;
  if (JSON.stringify(r).length > 60000) throw new Error("That record is too big");
  return r;
}

export async function gunvault(req, s, p) {
  const m = req.method;

  // GET gv → every collection plus signed keys for each file
  if (!p[0] && m === "GET") {
    const out = {};
    for (const col of GV_COLS) out[col] = await list(s, col);
    const ids = new Set(GV_COLS.flatMap((c) => out[c].flatMap(fileIds)));
    const keys = {};
    await Promise.all([...ids].map(async (id) => (keys[id] = await fileKey(id))));
    const seeded = await s.get("meta/gv-seeded", { type: "json" });
    return json({ ...out, keys, importing: !!env("GV_SEED_KEY") && !seeded?.all });
  }

  // POST gv/file (multipart: file, thumb?) → stores a photo or PDF; returns its id and key
  if (p[0] === "file" && m === "POST") {
    const fd = await req.formData();
    const f = fd.get("file"), t = fd.get("thumb");
    if (!f || typeof f === "string") return json({ error: "No file" }, 400);
    if (f.size > 8 * 1024 * 1024) return json({ error: "File is over 8 MB" }, 413);
    const ct = /pdf/i.test(f.type) || /\.pdf$/i.test(f.name || "") ? "application/pdf" : "image/jpeg";
    const id = newId(), bin = files();
    await bin.set(`gv/${id}/f`, await f.arrayBuffer(), { metadata: { ct } });
    if (t && typeof t !== "string") await bin.set(`gv/${id}/t`, await t.arrayBuffer(), { metadata: { ct: "image/jpeg" } });
    return json({ id, k: await fileKey(id), type: ct === "application/pdf" ? "pdf" : "image" });
  }

  const col = p[0];
  if (!GV_COLS.includes(col)) return json({ error: "not found" }, 404);

  if (m === "POST" && !p[1]) {
    const b = await req.json().catch(() => ({}));
    const id = newId(), r = cleanRecord({ order: Date.now(), ...b }, id);
    await s.setJSON(`gv/${col}/${id}`, r);
    return json(r);
  }
  const id = p[1];
  if (!ID.test(id || "")) return json({ error: "bad id" }, 400);
  if (m === "PUT") {
    const r = cleanRecord(await req.json().catch(() => ({})), id);
    await s.setJSON(`gv/${col}/${id}`, r);
    const keys = {};
    await Promise.all(fileIds(r).map(async (x) => (keys[x] = await fileKey(x))));
    return json({ ...r, _keys: keys });
  }
  if (m === "DELETE") { await s.delete(`gv/${col}/${id}`); return json({ ok: true }); }
  return json({ error: "not found" }, 404);
}
