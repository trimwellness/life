// TEMPORARY: checks which ways of reading Jeff's shared OneDrive folder work without a Microsoft app registration.
const LINK = "https://1drv.ms/f/c/f9d1198789224b95/IgCVSyKJhxnRIID5aQAAAAAAAWV3T64JmHJK5yC2yBc9_nE";
const enc = "u!" + btoa(LINK).replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
const show = async (label, url, opts = {}) => {
  try {
    const r = await fetch(url, { redirect: "manual", ...opts });
    const body = (await r.text()).slice(0, 700).replace(/\s+/g, " ");
    console.log("PROBE", label, r.status, "loc=" + (r.headers.get("location") || "").slice(0, 400), "body=" + body);
    return r;
  } catch (e) { console.log("PROBE", label, "ERR", e.message); }
};
export default async () => {
  await show("A onedrive-api", `https://api.onedrive.com/v1.0/shares/${enc}/root?expand=children`);
  await show("B graph-anon", `https://graph.microsoft.com/v1.0/shares/${enc}/driveItem?$expand=children`);
  await show("C short-link", LINK);
  // follow the redirect chain by hand
  let url = LINK;
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { redirect: "manual" }).catch(() => null);
    if (!r) break;
    const loc = r.headers.get("location");
    console.log("PROBE hop", i, r.status, (loc || "").slice(0, 500));
    if (!loc) { const t = await r.text(); console.log("PROBE final-body", t.slice(0, 1500).replace(/\s+/g, " ")); break; }
    url = new URL(loc, url).toString();
  }
  await show("D onedrive-api-badger", `https://api.onedrive.com/v1.0/shares/${enc}/driveItem?$expand=children`, { headers: { prefer: "autoredeem" } });
};
export const config = { schedule: "* * * * *" };
