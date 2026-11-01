import { handleMcpRequest } from "@/lib/mcp/http";
import { loadLeague, loadPowerHistory } from "@/lib/data";
import { loadToday } from "@/lib/nba-data";
import { createGameBoxscoreLoader } from "@/lib/game-boxscore-loader";
import { createPlayerGamesLoader } from "@/lib/player-games";
import { auctionStore } from "@/lib/auction-store";
import { battleStore } from "@/lib/battle-store";

import { createScoreboardLoader } from "@/lib/mcp/scoreboard-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const shared = globalThis as typeof globalThis & { scoreboardLoader?: ReturnType<typeof createScoreboardLoader>; gameBoxscoreLoader?: ReturnType<typeof createGameBoxscoreLoader>; playerGamesLoader?: ReturnType<typeof createPlayerGamesLoader> };
const loadBoxscore = shared.gameBoxscoreLoader ??= createGameBoxscoreLoader();
const loadPlayerGames = shared.playerGamesLoader ??= createPlayerGamesLoader();
const loadScoreboard = shared.scoreboardLoader ??= createScoreboardLoader();
function handle(request: Request) {
  return handleMcpRequest(request, { loadLeague, loadToday, loadBoxscore, loadPlayerGames, loadPowerHistory, loadScoreboard,
    ratings: async scope => battleStore().ratings(scope, "best"), listings: async scope => auctionStore().list(scope) });
}
export { handle as POST, handle as GET, handle as DELETE, handle as OPTIONS };
