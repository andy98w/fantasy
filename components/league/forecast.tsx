"use client";
import { useMemo, useState } from "react";
import type { Snapshot } from "@/lib/schema";
import type { TodayData } from "@/lib/nba";
import { closeCategories, forecastScore, projectTeam, scheduledOpponent, type Projection } from "@/lib/forecast";
import { Select } from "../ui/select";
import { Empty, Tabs } from "../ui/primitives";
import { TeamAvatar } from "./avatars";
import { teamOptions } from "./team-select";
import { CategoryComparison } from "./category-comparison";
import { Rivalries } from "./rivalries";
import { MatchupClash } from "./matchup-clash";

const dayLabel = (date: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
function Coverage({ projection }: { projection: Projection }) {
  return <span className="forecast-games">{projection.issue ? projection.issue : `${projection.games} games${projection.liveGames ? ` + ${projection.liveGames} live` : ""}`}</span>;
}
export function Forecast({ data, today }: { data: Snapshot; today?: TodayData }) {
  const [horizon, setHorizon] = useState<"next" | "remaining" | "whatif">("next");
  const [a, setA] = useState(data.teams[0]?.id);
  const [b, setB] = useState<number | null>(null);
  const schedule = data.forecastSchedule;
  const period = data.league.matchupPeriod + (horizon === "next" ? 1 : 0);
  const window = schedule?.windows.find(w => w.period === period);
  const home = data.teams.find(t => t.id === a) ?? data.teams[0];
  const opponent = b ?? scheduledOpponent(schedule, period, home?.id);
  const away = data.teams.find(t => t.id === opponent && t.id !== home?.id) ?? data.teams.find(t => t.id !== home?.id);
  // The page refreshes automatically; tie projections to the same render instant.
  const projections = useMemo(() => {
    const now = Date.now();
    return window && home && away ? [projectTeam(data, home.id, window, now, today), projectTeam(data, away.id, window, now, today)] as const : null;
  }, [data, today, window, home, away]);
  const views = <Tabs label="Forecast view" value={horizon} onChange={value => { setHorizon(value); setB(null); }} options={[{ value: "next", label: "Next week" }, { value: "remaining", label: "Rest of this week" }, { value: "whatif", label: "What if" }]} />;
  if (horizon === "whatif") return <div className="forecast-room"><div className="rivalry-toolbar">{views}</div><Rivalries data={data} mode="whatif" /></div>;
  if (!home || !away) return <Empty>Two teams are needed for a forecast.</Empty>;
  const score = projections ? forecastScore(...projections) : null;
  const ready = score && !score.missing;
  const close = projections ? closeCategories(...projections) : [];
  return <div className="forecast-room">
    <div className="rivalry-toolbar">
      {views}
      {window && <span className="forecast-dates">Week {period} · {dayLabel(window.start)}–{dayLabel(window.end)}</span>}
    </div>
    <div className="rivalry-selectors">
      <Select label="First team" value={String(home.id)} onChange={value => { setA(Number(value)); setB(null); }} options={teamOptions(data.teams)} />
      <Select label="Second team" value={String(away.id)} onChange={value => setB(Number(value))} options={teamOptions(data.teams.filter(t => t.id !== home.id))} />
    </div>
    {!projections ? <Empty>{schedule ? "Forecast unavailable for this matchup period." : "Forecast available after the next schedule import."}</Empty> : <>
      <section className="rivalry-duel forecast-duel" aria-label={`Projected matchup: ${home.name} versus ${away.name}`}>
        <div className="rivalry-stage">
          <MatchupClash home={ready ? score.home : null} away={ready ? score.away : null} />
          <div className="rivalry-fighter home"><TeamAvatar team={home} large /><h2>{home.name}</h2><strong className="home-score">{ready ? score.home : "—"}</strong><Coverage projection={projections[0]} /></div>
          <div className="rivalry-vs forecast-vs"><span>Projected</span>{ready && score.ties > 0 && <small>{score.ties} tied</small>}</div>
          <div className="rivalry-fighter away"><TeamAvatar team={away} large /><h2>{away.name}</h2><strong className="away-score">{ready ? score.away : "—"}</strong><Coverage projection={projections[1]} /></div>
        </div>
        <CategoryComparison home={projections[0].side} away={projections[1].side} homeName={home.name} awayName={away.name} close={close} />
      </section>
      <details className="forecast-details"><summary>Forecast assumptions</summary>
        <p>Season averages × playable games. Daily lineups fill legal slots, then favor player power. IR and players marked out are excluded; day-to-day players are assumed to play. No future adds, drops, or returns are assumed.</p>
        {horizon === "remaining" && <p>Current scored totals plus remaining games. Players already started keep their lineup slots; live-game production is estimated from time remaining.</p>}
        <p>FG% and FT% use total makes and attempts. Close means within 5% for counting stats or 1.5 percentage points for shooting. This is a projection, not a win probability.</p>
        <div className="forecast-breakdowns">{projections.map((projection, index) => <div key={index}><h3>{index ? away.name : home.name}</h3>
          {projection.missing.length > 0 && <p>Missing stats: {projection.missing.map(p => p.name).join(", ")}</p>}
          {projection.excluded.length > 0 && <p>Excluded: {projection.excluded.map(p => `${p.name}${p.slot === "IR" ? " (IR)" : " (out)"}`).join(", ")}</p>}
          {projection.benched > 0 && <p>{projection.benched} player-games sit because lineup slots are full.</p>}
          <ul>{projection.players.map(({player, games}) => <li key={player.id}><span>{player.name}</span><span>{Number.isInteger(games) ? games : games.toFixed(1)} games</span></li>)}</ul>
        </div>)}</div>
      </details>
    </>}
  </div>;
}
