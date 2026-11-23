// Temporary: checks which AI audio services are reachable through the AI Gateway. Removed after one run.
export default async () => {
  const v = (k) => process.env[k] || "";
  const out = {};
  const gb = v("GOOGLE_GEMINI_BASE_URL").replace(/\/$/, "");
  try { const r = await fetch(gb + "/v1beta/models", { headers: { "x-goog-api-key": v("GEMINI_API_KEY") } }); out.gmodels = r.status + " " + (await r.text()).replace(/\s+/g, " ").slice(0, 600); } catch (e) { out.gmodels = "ERR " + e.message; }
  for (const m of ["gemini-3-flash", "gemini-3-flash-preview", "gemini-3.0-flash", "gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-3-pro-preview", "gemini-2.0-flash"]) {
    try { const r = await fetch(gb + `/v1beta/models/${m}:generateContent`, { method: "POST", headers: { "x-goog-api-key": v("GEMINI_API_KEY"), "content-type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: "Say OK" }] }] }) }); out["g:" + m] = r.status + " " + (await r.text()).replace(/\s+/g, " ").slice(0, 90); } catch (e) { out["g:" + m] = "ERR"; }
  }
  const ob = v("OPENAI_BASE_URL").replace(/\/$/, "");
  for (const m of ["gpt-4o-mini-audio-preview", "gpt-4o-audio-preview", "gpt-audio-mini", "gpt-audio"]) {
    try { const r = await fetch(ob + "/chat/completions", { method: "POST", headers: { authorization: "Bearer " + v("OPENAI_API_KEY"), "content-type": "application/json" }, body: JSON.stringify({ model: m, modalities: ["text", "audio"], audio: { voice: "onyx", format: "mp3" }, messages: [{ role: "user", content: "Say: test." }] }) }); out["o:" + m] = r.status + " " + (await r.text()).replace(/\s+/g, " ").slice(0, 90); } catch (e) { out["o:" + m] = "ERR"; }
  }
  console.log("voiceprobe", JSON.stringify(out));
};
export const config = { schedule: "* * * * *" };
