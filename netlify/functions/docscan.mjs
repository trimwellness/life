// Reads a photo/PDF of an ID card or document and returns the fields for the Documents form.
// Nothing is stored or logged here; the encrypted copy is saved separately by the phone.
import Anthropic from "@anthropic-ai/sdk";
import { json, signedIn } from "../lib/common.mjs";

const MODEL = "claude-sonnet-5-5";
const TYPES = ["dl", "ccw", "mmj", "auto", "ssn", "passport", "health", "reg", "other"];
const PROMPT = `You are reading photos or a PDF of one personal document (front and back may both be included).
Return ONLY a JSON object with these keys (use "" when not visible; never guess):
{"type": one of ${JSON.stringify(TYPES)} (dl=driver's license or state ID, ccw=concealed carry / license to carry firearms, mmj=medical marijuana card, auto=vehicle insurance card or policy, ssn=Social Security card, passport, health=health insurance card, reg=vehicle registration, other),
 "name": a short label such as "PA Driver's License" or "Progressive Auto Insurance",
 "number": the main ID/license/policy/card number exactly as printed,
 "holder": the person's full name as printed,
 "issuer": the issuing agency or company (e.g. "PennDOT", "Cumberland County Sheriff", "Progressive"),
 "issued": issue/effective date as YYYY-MM-DD,
 "expires": expiration date as YYYY-MM-DD,
 "notes": other useful details on one or two short lines (e.g. class/endorsements, vehicle year/make/model and VIN, policy period, member/group numbers, date of birth) }`;

export default async (req) => {
  if (req.method !== "POST") return json({ error: "not found" }, 404);
  if (!(await signedIn(req))) return json({ error: "signin" }, 401);
  const b = await req.json().catch(() => ({}));
  const files = (Array.isArray(b.files) ? b.files : []).slice(0, 3).filter((f) => typeof f?.data === "string" && f.data.length < 7_000_000);
  if (!files.length) return json({ error: "No file" }, 400);
  const v = (k) => process.env[k] || globalThis.Netlify?.env?.get?.(k);
  const ai = new Anthropic({ apiKey: v("ANTHROPIC_API_KEY"), baseURL: v("ANTHROPIC_BASE_URL") });
  const content = files.map((f) => f.mime === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data } }
    : { type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.data } });
  content.push({ type: "text", text: PROMPT });
  const ask = (c) => ai.messages.create({ model: MODEL, max_tokens: 700, messages: [{ role: "user", content: c }] });
  try {
    let r;
    try { r = await ask(content); }
    catch (e) {
      // If a PDF was the problem, try again with just the photos.
      const imgs = content.filter((c) => c.type !== "document");
      if (imgs.length > 1 && imgs.length < content.length) r = await ask(imgs); else throw e;
    }
    const txt = r.content.filter((c) => c.type === "text").map((c) => c.text).join("");
    const m = txt.match(/\{[\s\S]*\}/);
    const d = m ? JSON.parse(m[0]) : {};
    const s = (x, n = 200) => String(x ?? "").slice(0, n);
    const date = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(x || "") ? x : "");
    return json({ type: TYPES.includes(d.type) ? d.type : "other", name: s(d.name, 80), number: s(d.number, 60), holder: s(d.holder, 100), issuer: s(d.issuer, 100), issued: date(d.issued), expires: date(d.expires), notes: s(d.notes, 400) });
  } catch (e) {
    const why = `${e.status || ""} ${String(e.message || e)}`.trim().slice(0, 200);
    console.error("docscan failed", why);
    return json({ error: "Couldn’t read it", why }, 502);
  }
};

export const config = { path: "/docscan" };
