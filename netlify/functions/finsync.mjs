// Keeps bank data fresh: every 2 hours, asks Blumenfeld Finance to sync with Plaid.
import { store } from "../lib/common.mjs";
import { finSync } from "../lib/feeds.mjs";

export default async () => {
  const r = await finSync(store()).catch((e) => ({ error: String(e.message || e) }));
  console.log("bank sync", JSON.stringify(r));
};

export const config = { schedule: "17 */2 * * *" };
