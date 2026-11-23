// Temporary: confirms Gemini accepts WAV audio through the AI Gateway. Removed right after.
export default async () => {
  const rate = 16000, n = rate; const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 8) * 3000), 44 + i * 2);
  const gb = process.env.GOOGLE_GEMINI_BASE_URL.replace(/\/$/, "");
  const r = await fetch(gb + "/v1beta/models/gemini-3-flash-preview:generateContent", { method: "POST", headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "content-type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ inline_data: { mime_type: "audio/wav", data: b.toString("base64") } }, { text: "Transcribe this audio. If no speech, say NOSPEECH." }] }] }) });
  console.log("voiceprobe2", r.status, (await r.text()).replace(/\s+/g, " ").slice(0, 300));
};
export const config = { schedule: "* * * * *" };
