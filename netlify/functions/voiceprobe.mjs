// Temporary: checks which AI audio services are reachable through the AI Gateway. Removed after one run.
export default async () => {
  const v = (k) => process.env[k] || globalThis.Netlify?.env?.get?.(k) || "";
  const keys = Object.keys(process.env).filter((k) => /OPENAI|GEMINI|GOOGLE|ANTHROPIC|AI_GATEWAY/i.test(k));
  const out = { keys };
  try {
    const r = await fetch((v("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "") + "/audio/speech", { method: "POST", headers: { authorization: "Bearer " + v("OPENAI_API_KEY"), "content-type": "application/json" }, body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "onyx", input: "Test." }) });
    out.openaiTts = r.status + " " + (r.ok ? (await r.arrayBuffer()).byteLength + "b" : (await r.text()).slice(0, 200));
  } catch (e) { out.openaiTts = "ERR " + e.message; }
  try {
    const base = (v("GOOGLE_GEMINI_BASE_URL") || v("GEMINI_BASE_URL") || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
    const r = await fetch(base + "/v1beta/models/gemini-2.5-flash:generateContent", { method: "POST", headers: { "x-goog-api-key": v("GEMINI_API_KEY") || v("GOOGLE_API_KEY"), "content-type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: "Say OK" }] }] }) });
    out.gemini = base + " " + r.status + " " + (await r.text()).slice(0, 200);
  } catch (e) { out.gemini = "ERR " + e.message; }
  console.log("voiceprobe", JSON.stringify(out));
};
export const config = { schedule: "* * * * *" };
