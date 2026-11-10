import { validGameId } from "@/lib/game-boxscore";
import { loadGameBoxscore } from "@/lib/game-boxscore-data";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = new URL(request.url).searchParams.get("player");
  if (!validGameId(id) || (player !== null && !/^[1-9]\d{0,11}$/.test(player))) return Response.json({ error: "Invalid game or player" }, { status: 400 });
  try {
    const data = await loadGameBoxscore(id), report = data.shotReport;
    return Response.json({ ...data, teams: data.teams.map(team => ({ ...team, players: team.players.filter(p => player === null || p.id === Number(player)) })),
      shotReport: report && { ...report, shots: report.shots.filter(s => player === null || s.playerId === Number(player)),
        expected: player === null ? report.expected : Object.fromEntries(Object.entries(report.expected).filter(([id]) => id === player)) } }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Shots unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "20" } }); }
}
