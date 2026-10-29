import { loadLeague } from "@/lib/data";
import { battleStore } from "@/lib/battle-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Readiness checks our saved data and vote storage, never ESPN availability.
export async function GET() {
  const reply = (ready: boolean) => Response.json({ status: ready ? "ready" : "unavailable" }, {
    status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" },
  });
  if (process.env.DATA_MODE !== "live" || !process.env.DATABASE_URL) return reply(false);
  try {
    const { snapshot } = await loadLeague();
    if (!snapshot) return reply(false);
    await battleStore().ratings(`live:${snapshot.league.id}:${snapshot.league.season}`, "best");
    return reply(true);
  } catch { return reply(false); }
}
