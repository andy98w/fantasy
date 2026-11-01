import { z } from "zod";
import { type Category } from "../schema";
import { nbaDate } from "../nba";

export const dateInput = z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(value => {
  const time = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}, "Use a valid YYYY-MM-DD date.").describe("Pacific calendar date, YYYY-MM-DD. Range endpoints are inclusive.");
export const dateRangeShape = { from: dateInput.optional(), to: dateInput.optional() };
export const shiftDate = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export function inDateRange(timestamp: string, from?: string, to?: string) {
  const date = nbaDate(new Date(timestamp));
  return (!from || date >= from) && (!to || date <= to);
}
export function compareNullable(a: number | null | undefined, b: number | null | undefined, descending: boolean) {
  return a == null ? b == null ? 0 : 1 : b == null ? -1 : (a - b) * (descending ? -1 : 1);
}
const keys: Partial<Record<Category, string>> = { PTS: "points", REB: "rebounds", AST: "assists", STL: "steals", BLK: "blocks", TO: "turnovers" };
export function gameStat(stats: Record<string, string>, category: Category): number | null {
  if (keys[category]) {
    const value = stats[keys[category]!];
    return value?.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
  }
  const key = category === "FG%" ? "fieldGoalsMade-fieldGoalsAttempted" : category === "FT%" ? "freeThrowsMade-freeThrowsAttempted" : "threePointFieldGoalsMade-threePointFieldGoalsAttempted";
  const pair = stats[key]?.match(/^(\d+)\s*[-/]\s*(\d+)$/);
  if (!pair) return null;
  const made = Number(pair[1]), attempts = Number(pair[2]);
  if (made > attempts) return null;
  return category === "3PM" ? made : attempts > 0 ? made / attempts : null;
}
