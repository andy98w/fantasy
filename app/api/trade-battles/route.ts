import { loadLeague } from "@/lib/data";
import { battleStore, VoteConflict } from "@/lib/battle-store";
import { tradeEntries, validBattle, voteSchema } from "@/lib/trade-battles";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  const { snapshot } = await loadLeague();
  if (!snapshot) return json({ error: "League unavailable." }, 503);
  try {
    const scope = `${snapshot.mode}:${snapshot.league.id}:${snapshot.league.season}`;
    return json({ ratings: await battleStore().ratings(scope, "best") });
  } catch { return json({ error: "Rankings unavailable. Try again." }, 503); }
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (origin !== new URL(request.url).origin && new URL(origin).host !== request.headers.get("host"))
        return json({ error: "Vote from this site." }, 403);
    } catch { return json({ error: "Invalid origin." }, 403); }
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Expected a JSON vote." }, 415);
  if (Number(request.headers.get("content-length") ?? 0) > 2048) return json({ error: "Vote is too large." }, 413);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return json({ error: "Vote is too large." }, 413);
    body = voteSchema.safeParse(JSON.parse(raw));
  } catch { return json({ error: "Invalid vote." }, 400); }
  if (!body.success) return json({ error: "Invalid vote." }, 400);
  const { snapshot } = await loadLeague();
  if (!snapshot) return json({ error: "League unavailable." }, 503);
  if (!validBattle(body.data, tradeEntries(snapshot.trades))) return json({ error: "Choose two different trades and one winner." }, 400);
  try {
    const scope = `${snapshot.mode}:${snapshot.league.id}:${snapshot.league.season}`;
    const result = await battleStore().vote(scope, body.data);
    return json({ result });
  } catch (error) {
    // Cached stores survive development hot reloads, so also recognize their stable error code.
    const conflict = error instanceof VoteConflict || (error instanceof Error && "code" in error && error.code === "VOTE_CONFLICT");
    return json({ error: conflict ? "This vote was already submitted differently." : "Vote could not be saved. Try again." }, conflict ? 409 : 503);
  }
}
