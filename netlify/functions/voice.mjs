// Gerald's voice: speech → text (for talking to him) and text → speech (for his replies).
// Uses OpenAI's audio models through Netlify's AI Gateway. Audio isn't stored.
import { json, signedIn } from "../lib/common.mjs";

const v = (k) => process.env[k] || globalThis.Netlify?.env?.get?.(k) || "";
const base = () => (v("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
const auth = () => ({ authorization: "Bearer " + v("OPENAI_API_KEY") });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "not found" }, 404);
  if (!(await signedIn(req))) return json({ error: "signin" }, 401);
  const what = new URL(req.url).pathname.split("/").pop();

  if (what === "hear") {
    // Transcribe with Gemini through the AI Gateway (the phone sends 16 kHz WAV).
    const buf = await req.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > 8 * 1024 * 1024) return json({ error: "No audio" }, 400);
    const mime = (req.headers.get("content-type") || "audio/wav").split(";")[0];
    const data = Buffer.from(buf).toString("base64");
    const gb = (v("GOOGLE_GEMINI_BASE_URL") || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
    const r = await fetch(gb + "/v1beta/models/gemini-3-flash-preview:generateContent", {
      method: "POST", headers: { "x-goog-api-key": v("GEMINI_API_KEY"), "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ inline_data: { mime_type: mime, data } }, { text: "Transcribe exactly what the speaker says, in English. Context: Jeff is talking to his assistant Gerald about his calendar, to-dos, Trim Wellness sales, Meineke stores, packages, money and his gun vault. Return only the spoken words, no quotes or notes. If there is no speech, return an empty string." }] }], generationConfig: { temperature: 0 } }),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    if (!r.ok) { const why = `${r.status} ${(await r.text()).replace(/\s+/g, " ").slice(0, 160)}`; console.error("hear failed", why); return json({ error: "Couldn’t hear that", why }, 502); }
    const d = await r.json();
    const text = (d.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("").trim().replace(/^["“]|["”]$/g, "");
    return json({ text });
  }

  if (what === "say") {
    const b = await req.json().catch(() => ({}));
    const text = String(b.text || "").slice(0, 1200);
    if (!text) return json({ error: "No text" }, 400);
    const r = await fetch(base() + "/audio/speech", {
      method: "POST", headers: { ...auth(), "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "onyx", input: text, response_format: "mp3",
        instructions: "You are Gerald, a calm, polished, quietly confident personal assistant to a busy executive. Warm, measured, crisp diction; slightly formal; never rushed." }),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    if (!r.ok) { const why = `${r.status} ${(await r.text()).slice(0, 160)}`; console.error("say failed", why); return json({ error: "No voice", why }, 502); }
    return new Response(await r.arrayBuffer(), { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  }
  return json({ error: "not found" }, 404);
};

export const config = { path: "/voice/*" };
