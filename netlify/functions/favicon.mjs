// Site logos for the Passwords list. Fetched server-side (so the phone never talks to a third party) and cached.
import { getStore } from "@netlify/blobs";

const ok = (d) => /^(?=.{3,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,24}$/.test(d);
export default async (req) => {
  const d = decodeURIComponent(new URL(req.url).pathname.split("/").pop() || "").toLowerCase();
  if (!ok(d)) return new Response("", { status: 404 });
  const bin = getStore({ name: "life-photos" }), key = `fav/${d}`;
  const hit = await bin.getWithMetadata(key, { type: "arrayBuffer" });
  const send = (buf, ct) => new Response(buf, { headers: { "content-type": ct, "cache-control": "public, max-age=2592000" } });
  if (hit) return hit.metadata?.none ? new Response("", { status: 404, headers: { "cache-control": "public, max-age=86400" } }) : send(hit.data, hit.metadata?.ct || "image/png");
  const tries = [`https://www.google.com/s2/favicons?domain=${d}&sz=128`, `https://icons.duckduckgo.com/ip3/${d}.ico`];
  for (const u of tries) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) continue;
      const buf = await r.arrayBuffer();
      if (buf.byteLength < 120) continue;
      const ct = r.headers.get("content-type") || "image/png";
      await bin.set(key, buf, { metadata: { ct } });
      return send(buf, ct);
    } catch (_) {}
  }
  await bin.set(key, "", { metadata: { none: true } });
  return new Response("", { status: 404 });
};

export const config = { path: "/favicon/*" };
