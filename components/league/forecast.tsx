"use client";
import { Disclosure } from "../ui/disclosure";
import { useMemo, useState } from "react";
import type { Snapshot } from "@/lib/schema";
import type { TodayData } from "@/lib/nba";
import { closeCategories, forecastScore, projectTeam, scheduledOpponent, type Projection } from "@/lib/forecast";
import type { AvailabilityScenario } from "@/lib/availability";
import { Select } from "../ui/select";
import { Empty, Tabs } from "../ui/primitives";
import { TeamAvatar } from "./avatars";
import { teamOptions } from "./team-select";
import { CategoryComparison } from "./category-comparison";
import { Rivalries } from "./rivalries";
import { MatchupClash } from "./matchup-clash";

import { buildOutlook } from "@/lib/outlook";
import { ForecastDetails } from "./forecast-details";

const dayLabel = (date: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
function Coverage({ projection }: { projection: Projection }) {
  return <span className="forecast-games">{projection.issue ? projection.issue : `${projection.games} games${projection.liveGames ? ` + ${projection.liveGames} live` : ""}`}{projection.baselineEstimates.map(p => <small className="forecast-baseline" key={p.playerId}>{p.name}: estimated from {p.season - 1}–{String(p.season).slice(-2)} ({p.gamesPlayed} games)</small>)}</span>;
}
export function Forecast({ data, today }: { data: Snapshot; today?: TodayData }) {
  const [horizon, setHorizon] = useState<"next" | "remaining" | "whatif">("next");
  const [scenario, setScenario] = useState<AvailabilityScenario>("conservative");
  const [omitted, setOmitted] = useState<number[]>([]);
  const [a, setA] = useState(data.teams[0]?.id);
  const [b, setB] = useState<number | null>(null);
  const schedule = data.forecastSchedule;
  const period = data.league.matchupPeriod + (horizon === "next" ? 1 : 0);
  const window = schedule?.windows.find(w => w.period === period);
  const home = data.teams.find(t => t.id === a) ?? data.teams[0];
  const opponent = b ?? scheduledOpponent(schedule, period, home?.id);
  const away = data.teams.find(t => t.id === opponent && t.id !== home?.id) ?? data.teams.find(t => t.id !== home?.id);
  // The page refreshes automatically; tie projections to the same render instant.
  const outlook = useMemo(() => buildOutlook(data), [data]);
  const projections = useMemo(() => {
    const now = Date.now();
    return window && home && away ? [projectTeam(data, home.id, window, now, today, { scenario, outlook, omittedPlayerIds: scenario === "if_available" ? omitted : [] }), projectTeam(data, away.id, window, now, today, { scenario, outlook, omittedPlayerIds: scenario === "if_available" ? omitted : [] })] as const : null;
  }, [data, today, window, home, away, scenario, omitted, outlook]);
  const views = <Tabs label="Forecast view" value={horizon} onChange={value => { setHorizon(value); setB(null); }} options={[{ value: "next", label: "Next week" }, { value: "remaining", label: "Rest of this week" }, { value: "whatif", label: "What if" }]} />;
  if (horizon === "whatif") return <div className="forecast-room"><div className="rivalry-toolbar">{views}</div><Rivalries data={data} mode="whatif" /></div>;
  if (!home || !away) return <Empty>Two teams are needed for a forecast.</Empty>;
  const score = projections ? forecastScore(...projections) : null;
  const ready = score && !score.missing;
  const close = projections ? closeCategories(...projections) : [];
  return <div className="forecast-room">
    <div className="rivalry-toolbar">
      {views}
      <Select label="Availability scenario" value={scenario} onChange={value => setScenario(value as AvailabilityScenario)} options={[{value:"conservative",label:"Conservative availability"},{value:"if_available",label:"If available / IR activated"}]} />
      {window && <span className="forecast-dates">Week {period} · {dayLabel(window.start)}–{dayLabel(window.end)}</span>}
    </div>
    <div className="rivalry-selectors">
      <Select label="First team" value={String(home.id)} onChange={value => { setA(Number(value)); setB(null); setOmitted([]); }} options={teamOptions(data.teams)} />
      <Select label="Second team" value={String(away.id)} onChange={value => { setB(Number(value)); setOmitted([]); }} options={teamOptions(data.teams.filter(t => t.id !== home.id))} />
    </div>
    {scenario === "if_available" && <p className="forecast-games">Assumes returns after today; not a return-date prediction.</p>}
    {scenario === "if_available" && <Disclosure className="forecast-details" title={<>Hypothetical roster exclusions{omitted.length ? ` (${omitted.length})` : ""}</>}>
      <p>Choose players to leave out of this forecast to make room for IR returns. This only changes future projections; today’s started lineups stay locked. ESPN rosters stay unchanged.</p>
      <div className="forecast-breakdowns">{[home, away].map(team => <div key={team.id}><h3>{team.name}</h3>{data.players.filter(p => p.teamId === team.id).map(p => <label className="forecast-roster-option" key={p.id}><input type="checkbox" checked={omitted.includes(p.id)} onChange={event => setOmitted(ids => event.target.checked ? [...ids, p.id] : ids.filter(id => id !== p.id))} />Exclude {p.name}{p.slot === "IR" ? " (IR)" : ""}</label>)}</div>)}</div>
    </Disclosure>}
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
      <ForecastDetails data={data} teams={[home, away]} projections={projections} remaining={horizon === "remaining"} />
    </>}
  </div>;
}
