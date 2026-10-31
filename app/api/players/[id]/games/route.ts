import { createPlayerGamesLoader, validPlayerGamesRequest } from "@/lib/player-games";
const shared = globalThis as typeof globalThis & { playerGamesLoader?: ReturnType<typeof createPlayerGamesLoader> };
const load = shared.playerGamesLoader ??= createPlayerGamesLoader();
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const season = new URL(request.url).searchParams.get("season") ?? "";
  if (!validPlayerGamesRequest(id, season)) return Response.json({ error: "Invalid player or season" }, { status: 400 });
  try {
    return Response.json(await load(id, season), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Game log unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "20" } });
  }
}
