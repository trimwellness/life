// One-time import of the Safe Ledger into the Gun Vault. Kept in its own function so the large encrypted bundle
// never loads with the main API. Delete this file and netlify/gvseed once the import is done.
import { store, json, env, signedIn } from "../lib/common.mjs";
import { files, GV_COLS } from "../lib/gunvault.mjs";
import bundleData from "../gvseed/data.mjs";

// ---- One-time import of the encrypted Safe Ledger bundle (netlify/gvseed). Runs in chunks so each call stays quick.
async function decrypt(b64) {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const k = Uint8Array.from(atob(env("GV_SEED_KEY").replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", k, "AES-GCM", false, ["decrypt"]);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12)));
}
export async function seedStep(s) {
  const done = (await s.get("meta/gv-seeded", { type: "json" })) || null;
  if (done?.all) return { ok: true, left: 0 };
  if (!env("GV_SEED_KEY")) return { ok: false, error: "Import key isn’t set" };
  const bundle = bundleData;
  const t0 = Date.now(), prog = done || { records: false, files: [] };
  if (!prog.records) {
    const data = JSON.parse(new TextDecoder().decode(await decrypt(bundle.seed)));
    for (const col of GV_COLS) for (const r of data[col] || []) if (!(await s.get(`gv/${col}/${r.id}`))) await s.setJSON(`gv/${col}/${r.id}`, r);
    prog.records = true;
    await s.setJSON("meta/gv-seeded", prog);
  }
  const bin = files(), have = new Set(prog.files);
  for (const [id, f] of Object.entries(bundle.files)) {
    if (have.has(id)) continue;
    if (Date.now() - t0 > 7000) break;
    await bin.set(`gv/${id}/f`, await decrypt(f.f), { metadata: { ct: f.ct } });
    if (f.t) await bin.set(`gv/${id}/t`, await decrypt(f.t), { metadata: { ct: "image/jpeg" } });
    have.add(id);
  }
  prog.files = [...have];
  const left = Object.keys(bundle.files).length - have.size;
  if (!left) prog.all = Date.now();
  await s.setJSON("meta/gv-seeded", prog);
  return { ok: true, left, total: Object.keys(bundle.files).length };
}


export default async (req) => {
  if (req.method !== "POST") return json({ error: "not found" }, 404);
  if (!(await signedIn(req))) return json({ error: "signin" }, 401);
  try { return json(await seedStep(store())); } catch (e) { console.error(e); return json({ ok: false, error: String(e.message || e).slice(0, 200) }, 500); }
};

export const config = { path: "/gv-import" };
