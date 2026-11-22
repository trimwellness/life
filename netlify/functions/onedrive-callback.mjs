// Microsoft sends Jeff back here after he approves Life's read-only access to his OneDrive.
import { store } from "../lib/common.mjs";
import { checkState, exchangeCode } from "../lib/onedrive.mjs";

const back = (msg) => new Response(null, { status: 302, headers: { location: "/#photos" + (msg ? "?od=" + encodeURIComponent(msg) : "") } });

export default async (req) => {
  const u = new URL(req.url);
  if (u.searchParams.get("error")) return back(u.searchParams.get("error_description") || "Microsoft sign-in was cancelled");
  if (!(await checkState(u.searchParams.get("state")))) return back("That sign-in link expired. Try Connect again.");
  try { await exchangeCode(store(), req, u.searchParams.get("code") || ""); return back("connected"); }
  catch (e) { return back(String(e.message || e).slice(0, 200)); }
};

export const config = { path: "/onedrive/callback" };
