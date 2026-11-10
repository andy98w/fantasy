import { createGameBoxscoreLoader } from "./game-boxscore-loader";
const shared = globalThis as typeof globalThis & { gameBoxscoreLoader?: ReturnType<typeof createGameBoxscoreLoader> };
export const loadGameBoxscore = shared.gameBoxscoreLoader ??= createGameBoxscoreLoader();
