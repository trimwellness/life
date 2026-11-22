// Serves Photo Vault images. Each URL carries a key derived from the photo id and Life's secret, so only the app
// (which hands out these URLs to signed-in devices) can show them.
import { same } from "../lib/common.mjs";
import { bin, imgKey } from "../lib/vault.mjs";

export default async (req) => {
  const u = new URL(req.url);
  const id = u.pathname.split("/").pop();
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || !same(u.searchParams.get("k") || "", await imgKey(id))) return new Response("Not found", { status: 404 });
  const size = u.searchParams.get("s") === "f" ? "f" : "t";
  const data = await bin().get(`${id}/${size}`, { type: "arrayBuffer" });
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(data, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=31536000, immutable" } });
};

export const config = { path: "/vault/img/*" };
