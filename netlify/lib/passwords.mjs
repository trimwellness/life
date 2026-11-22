// Password manager storage. The phone encrypts the whole vault with a key made from Jeff's master password
// (PBKDF2-SHA256 → AES-256-GCM) before it's sent, so the server only ever holds ciphertext it can't read.
import { json } from "./common.mjs";

const B64 = /^[A-Za-z0-9+/=]+$/;
export async function passwords(req, s) {
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
