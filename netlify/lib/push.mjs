// Web push to every phone/computer that turned alerts on (Packages page). Keys: VAPID_PUBLIC / VAPID_PRIVATE.
import webpush from "web-push";
import { env } from "./common.mjs";

export function pushReady() {
  const pub = env("VAPID_PUBLIC"), priv = env("VAPID_PRIVATE");
  if (!pub || !priv) return null;
  webpush.setVapidDetails("mailto:jeff.meinekepa@gmail.com", pub, priv);
  return pub;
}
export async function hashOf(str) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
export async function sendPush(s, payload) {
  if (!pushReady()) return { sent: 0, failed: 0, reason: "keys missing" };
  const { blobs } = await s.list({ prefix: "push/" });
  let sent = 0, failed = 0;
  await Promise.all(blobs.map(async (b) => {
    const rec = await s.get(b.key, { type: "json" });
    if (!rec || !rec.sub) return;
    try {
      await webpush.sendNotification(rec.sub, JSON.stringify(payload), { TTL: 86400, urgency: "high" });
      sent++;
    } catch (e) {
      failed++;
      if (e.statusCode === 404 || e.statusCode === 410) await s.delete(b.key);
      else console.error("push failed", e.statusCode, e.body);
    }
  }));
  return { sent, failed };
}
