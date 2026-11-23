// Temporary: runs one Gerald question server-side to see what comes back. Removed right after.
import gerald from "./gerald.mjs";
import { makeToken } from "../lib/common.mjs";
export default async () => {
  const tok = await makeToken();
  const r = await gerald(new Request("https://x/gerald", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + tok }, body: JSON.stringify({ messages: [{ role: "user", content: "What have I spent money on this week?" }], pw: null }) }));
  console.log("gprobe", r.status, (await r.text()).slice(0, 600));
};
export const config = { schedule: "* * * * *" };
