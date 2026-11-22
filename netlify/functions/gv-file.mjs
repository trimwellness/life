// Serves Gun Vault photos and PDFs. Each URL carries a key derived from the file id and Life's secret.
import { same } from "../lib/common.mjs";
import { files, fileKey } from "../lib/gunvault.mjs";

export default async (req) => {
  const u = new URL(req.url);
  const id = u.pathname.split("/").pop();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !same(u.searchParams.get("k") || "", await fileKey(id))) return new Response("Not found", { status: 404 });
  const bin = files();
  let r = u.searchParams.get("s") === "t" ? await bin.getWithMetadata(`gv/${id}/t`, { type: "arrayBuffer" }) : null;
  if (!r) r = await bin.getWithMetadata(`gv/${id}/f`, { type: "arrayBuffer" });
  if (!r) return new Response("Not found", { status: 404 });
  const ct = r.metadata?.ct || "image/jpeg";
  return new Response(r.data, { headers: { "content-type": ct, "content-disposition": ct === "application/pdf" ? "inline" : "inline", "cache-control": "private, max-age=31536000, immutable" } });
};

export const config = { path: "/vault/file/*" };
