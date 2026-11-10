import type { View } from "../components/league/navigation";
import type { Snapshot } from "./schema";

export type DashboardRoute = { view: View; teamId: number | null; matchupId?: number };
const views = new Set<View>(["league", "team", "players", "analysis", "trades", "forecast", "records", "mcp", "connection", "matchup"]);
const aliases: Record<string, View> = { overview: "league", rankings: "players", news: "league", teams: "team", rivalries: "forecast" };
const idFrom = (value: string | null) => value !== null && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : undefined;

export function dashboardRoute(hash: string, data: Pick<Snapshot, "teams" | "matchups">): DashboardRoute | null {
  const [name, query = ""] = hash.replace(/^#/, "").split("?");
  const view = (aliases[name] ?? (name || "league")) as View;
  // In-page anchors (such as Skip to content) do not navigate the dashboard.
  if (!views.has(view)) return null;
  const params = new URLSearchParams(query);
  if (view === "matchup") {
    const id = idFrom(params.get("id")), period = idFrom(params.get("week"));
    const matchup = params.has("id")
      ? data.matchups.find(m => m.id === id && (!params.has("week") || m.period === period))
      : data.matchups[0];
    // An expired link should not silently open a different matchup.
    return matchup ? { view, teamId: null, matchupId: matchup.id } : { view: "league", teamId: null };
  }
  const teamId = idFrom(params.get("id"));
  return { view, teamId: view === "team" && data.teams.some(t => t.id === teamId) ? teamId! : null };
}

export function dashboardHash(view: View, details: { teamId?: number | null; matchupId?: number; period?: number } = {}) {
  const params = new URLSearchParams();
  if (view === "team" && details.teamId != null) params.set("id", String(details.teamId));
  if (view === "matchup" && details.matchupId != null) {
    params.set("id", String(details.matchupId));
    if (details.period != null) params.set("week", String(details.period));
  }
  return `#${view}${params.size ? `?${params}` : ""}`;
}
