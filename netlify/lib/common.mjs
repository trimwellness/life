// Shared server helpers: the data store, JSON responses, sign-in tokens.
import { getStore } from "@netlify/blobs";

export const store = () => getStore({ name: "life", consistency: "strong" });
export const COLS = ["todo", "wish", "pkgs", "events", "work"];
export const env = (k) => (Netlify.env.get(k) || "").trim();

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const clip = (v, n) => String(v ?? "").trim().slice(0, n);
export const num = (v) => (Number.isFinite(+v) ? Math.round(+v * 100) / 100 : 0);
export const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

export async function readPrefix(s, prefix) {
  const { blobs } = await s.list({ prefix });
  const out = await Promise.all(blobs.map(async (b) => ({ id: b.key.slice(prefix.length), data: await s.get(b.key, { type: "json" }) })));
  return out.filter((x) => x.data).map((x) => ({ id: x.id, ...x.data }));
}

// ---- Sign-in: no PIN. Opening the private link (/#k=LIFE_LINK_KEY) once signs that device in for good.
const enc = new TextEncoder();
const secret = () => env("LIFE_SECRET") || "life:" + env("LIFE_LINK_KEY");
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export async function sign(msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}
export function same(a, b) {
  a = String(a || ""); b = String(b || "");
  if (!a || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
export async function makeToken() {
  const exp = Date.now() + 3650 * 864e5;
  return `${exp}.${await sign("life." + exp)}`;
}
export async function signedIn(req) {
  if (!env("LIFE_LINK_KEY")) return false;
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const [exp, sig] = t.split(".");
  if (!exp || !sig || +exp < Date.now()) return false;
  return same(sig, await sign("life." + exp));
}
