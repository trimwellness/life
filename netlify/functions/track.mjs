// Checks package statuses twice an hour and sends alerts when something changes.
import { store } from "../lib/common.mjs";
import { checkPackages } from "../lib/parcel.mjs";

export default async () => {
  const r = await checkPackages(store()).catch((e) => ({ error: String(e.message || e) }));
  console.log("package check", JSON.stringify(r));
};

export const config = { schedule: "7,37 * * * *" };
