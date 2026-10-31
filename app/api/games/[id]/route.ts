import { validGameId } from "@/lib/game-boxscore";
import { createGameBoxscoreLoader } from "@/lib/game-boxscore-loader";

const shared = globalThis as typeof globalThis & { gameBoxscoreLoader?: ReturnType<typeof createGameBoxscoreLoader> };
const load = shared.gameBoxscoreLoader ??= createGameBoxscoreLoader();
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validGameId(id)) return Response.json({ error: "Invalid game ID" }, { status: 400 });
  try {
    return Response.json(await load(id), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Box score unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "20" } });
  }
}
