// Calendar reminders: checks every 5 minutes and pushes anything that's due.
import { store } from "../lib/common.mjs";
import { runReminders } from "../lib/calendar.mjs";

export default async () => {
  const r = await runReminders(store()).catch((e) => ({ error: String(e.message || e) }));
  if (r.sent || r.error) console.log("reminders", JSON.stringify(r));
};

export const config = { schedule: "*/5 * * * *" };
