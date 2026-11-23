// Password manager storage. The phone encrypts the whole vault with a key made from Jeff's master password
// (PBKDF2-SHA256 → AES-256-GCM) before it's sent, so the server only ever holds ciphertext it can't read.
import { json, newId } from "./common.mjs";
import { getStore } from "@netlify/blobs";

// Encrypted document scans (encrypted on the phone before upload, like the vault itself).
const files = () => getStore({ name: "life-photos", consistency: "strong" });
const FID = /^[A-Za-z0-9_-]{6,40}$/;

const B64 = /^[A-Za-z0-9+/=]+$/;
export async function passwords(req, s, p = []) {
  if (p[0] === "file") {
    const bin = files();
    if (req.method === "POST" && !p[1]) {
      const buf = await req.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > 12 * 1024 * 1024) return json({ error: "File too big (12 MB max)" }, 413);
      const id = newId(); await bin.set(`pwf/${id}`, buf); return json({ id });
    }
    if (!FID.test(p[1] || "")) return json({ error: "bad id" }, 400);
    if (req.method === "GET") { const b = await bin.get(`pwf/${p[1]}`, { type: "arrayBuffer" }); return b ? new Response(b, { headers: { "content-type": "application/octet-stream", "cache-control": "private, max-age=86400" } }) : json({ error: "not found" }, 404); }
    if (req.method === "DELETE") { await bin.delete(`pwf/${p[1]}`); return json({ ok: true }); }
    return json({ error: "not found" }, 404);
  }
  if (p.length) return json({ error: "not found" }, 404);
  const key = "pw/vault";
  if (req.method === "GET") return json((await s.get(key, { type: "json" })) || { empty: true });
  if (req.method === "PUT") {
    const b = await req.json().catch(() => ({}));
    if (![b.data, b.salt].every((x) => typeof x === "string" && B64.test(x)) || b.data.length > 3_000_000 || !(b.iter >= 100000 && b.iter <= 5_000_000)) return json({ error: "Bad vault" }, 400);
    const old = await s.get(key, { type: "json" });
    if (old && old.ver !== b.ver) return json({ error: "Your passwords changed on another device. Lock and unlock to reload." }, 409);
    const doc = { data: b.data, salt: b.salt, iter: b.iter, ver: (old?.ver || 0) + 1, at: Date.now() };
    await s.setJSON(key, doc);
    return json({ ver: doc.ver });
  }
  return json({ error: "not found" }, 404);
}
