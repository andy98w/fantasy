import "server-only";
import { createNbaLoader } from "./nba-loader";

const globalCache = globalThis as unknown as { nbaLoader?: ReturnType<typeof createNbaLoader> };
export const loadToday = globalCache.nbaLoader ??= createNbaLoader();
