// Container entry point: never silently publish demo data or use ephemeral storage.
const missing = ["DATABASE_URL", "ESPN_LEAGUE_ID", "ESPN_SEASON"].filter(key => !process.env[key]?.trim());
if (process.env.DATA_MODE !== "live") missing.push("DATA_MODE=live");
for (const key of ["ESPN_LEAGUE_ID", "ESPN_SEASON"]) {
  if (process.env[key] && !/^[1-9]\d*$/.test(process.env[key])) missing.push(`valid ${key}`);
}
if (missing.length) {
  console.error(`Production configuration required: ${missing.join(", ")}.`);
  process.exit(1);
}
if (process.env.ESPN_S2 || process.env.ESPN_SWID) {
  console.error("ESPN cookies belong on the sync worker only. Remove them from the web service.");
  process.exit(1);
}
await import("../server.js");
