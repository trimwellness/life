// OneDrive (personal) through Microsoft Graph. Jeff signs in once; the refresh token is kept in the "life" store
// (meta/onedrive) and swapped for short-lived access tokens as needed. Read-only: Files.Read.
import { env, sign, same } from "./common.mjs";

const SCOPE = "offline_access User.Read Files.Read";
const tenant = () => env("MS_TENANT") || "consumers";
const AUTH = () => `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0`;
export const GRAPH = "https://graph.microsoft.com/v1.0";
export const odReady = () => !!(env("MS_CLIENT_ID") && env("MS_CLIENT_SECRET"));
export const redirectUri = (req) => (env("MS_REDIRECT_URI") || new URL(req.url).origin + "/onedrive/callback");

// Signed, 10-minute state so only a signed-in Life session can start the sign-in.
export async function makeState() { const exp = Date.now() + 10 * 60e3; return `${exp}.${await sign("od." + exp)}`; }
export async function checkState(st) { const [exp, sig] = String(st || "").split("."); return !!exp && +exp > Date.now() && same(sig, await sign("od." + exp)); }

export function authorizeUrl(req, state) {
  const q = new URLSearchParams({ client_id: env("MS_CLIENT_ID"), response_type: "code", redirect_uri: redirectUri(req), response_mode: "query", scope: SCOPE, state, prompt: "select_account" });
  return `${AUTH()}/authorize?${q}`;
}

async function tokenCall(params) {
  const r = await fetch(`${AUTH()}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("MS_CLIENT_ID"), client_secret: env("MS_CLIENT_SECRET"), scope: SCOPE, ...params }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error(d.error_description?.split("\n")[0] || d.error || `Microsoft sign-in failed (${r.status})`);
  return d;
}

export async function exchangeCode(s, req, code) {
  const d = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri(req) });
  const me = await fetch(`${GRAPH}/me`, { headers: { authorization: "Bearer " + d.access_token } }).then((r) => r.json()).catch(() => ({}));
  const prev = (await s.get("meta/onedrive", { type: "json" })) || {};
  await s.setJSON("meta/onedrive", { ...prev, refresh: d.refresh_token, access: d.access_token, exp: Date.now() + (d.expires_in - 120) * 1000, account: me.userPrincipalName || me.mail || me.displayName || "", name: me.displayName || "", folders: prev.folders || [] });
}

export async function accessToken(s) {
  const od = await s.get("meta/onedrive", { type: "json" });
  if (!od?.refresh) return null;
  if (od.access && od.exp > Date.now()) return od.access;
  const d = await tokenCall({ grant_type: "refresh_token", refresh_token: od.refresh });
  await s.setJSON("meta/onedrive", { ...od, access: d.access_token, refresh: d.refresh_token || od.refresh, exp: Date.now() + (d.expires_in - 120) * 1000 });
  return d.access_token;
}

export async function graph(s, path) {
  const tok = await accessToken(s);
  if (!tok) throw new Error("OneDrive isn’t connected");
  const r = await fetch(path.startsWith("http") ? path : GRAPH + path, { headers: { authorization: "Bearer " + tok } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error?.message || `OneDrive said ${r.status}`);
  return d;
}
