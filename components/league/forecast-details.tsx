import type { Projection } from "@/lib/forecast";
import type { Snapshot, Team } from "@/lib/schema";
import { TeamAvatar } from "./avatars";
import { OutlookDetails } from "./outlook-details";
import { PlayerStatus } from "./player-status";

const dayLabel = (date: string) => new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", timeZone: "UTC",
}).format(new Date(`${date}T12:00:00Z`));
const gamesLabel = (games: number) => `${Number.isInteger(games) ? games : games.toFixed(1)} ${games === 1 ? "game" : "games"}`;

function TeamBreakdown({ team, projection, data, side }: {
  team: Team; projection: Projection; data: Snapshot; side: "home" | "away";
}) {
  const playerName = (id: number) => data.players.find(player => player.id === id)?.name ?? String(id);
  // Keep distinct reasons, but show repeated dates together for each player.
  const exclusions = new Map<number, Map<string, string[]>>();
  for (const row of projection.exclusions) {
    const reasons = exclusions.get(row.playerId) ?? new Map<string, string[]>();
    const dates = reasons.get(row.reason) ?? [];
    if (!dates.includes(row.date)) dates.push(row.date);
    reasons.set(row.reason, dates);
    exclusions.set(row.playerId, reasons);
  }
  const affectedIds = [...new Set([...projection.assumptions.map(player => player.playerId), ...exclusions.keys()])];
  return <section className={`forecast-team-panel ${side}`} aria-label={`${team.name} forecast details`}>
    <header className="forecast-team-heading">
      <TeamAvatar team={team} />
      <h3>{team.name}</h3>
      {!projection.issue && <span className="forecast-game-count">{gamesLabel(projection.games)}{projection.liveGames > 0 && <small>+ {projection.liveGames} live</small>}</span>}
    </header>
    <div className="forecast-team-section">
      <div className="forecast-section-heading"><h4>Availability</h4><time dateTime={projection.availabilityAsOf}>{new Date(projection.availabilityAsOf).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} PT</time></div>
      {affectedIds.length ? <ul className="forecast-availability-list">{affectedIds.map(id => {
        const assumption = projection.assumptions.find(player => player.playerId === id);
        const player = data.players.find(player => player.id === id);
        return <li key={id}>
          <div className="forecast-player-status"><strong>{assumption?.name ?? playerName(id)}</strong><span><PlayerStatus status={assumption?.status ?? player?.status} />{(assumption?.slot ?? player?.slot) === "IR" && <span className="forecast-ir-label">IR</span>}</span></div>
          {[...(exclusions.get(id) ?? [])].map(([reason, dates]) => <p key={reason}><span className="forecast-excluded-dates">Excluded {dates.sort().map(dayLabel).join(", ")}</span><span>{reason.replace(/^[A-Z_]+: /, "")}</span></p>)}
        </li>;
      })}</ul> : <p className="forecast-quiet">No availability restrictions.</p>}
      {projection.activationPlayerIds.length > 0 && <div className="forecast-detail-note"><strong>Assumed IR returns</strong><p>{projection.activationPlayerIds.map(playerName).join(", ")}</p><p>{projection.activationSlotsNeeded > 0 ? `${projection.activationSlotsNeeded} roster ${projection.activationSlotsNeeded === 1 ? "slot" : "slots"} must be freed.` : "Fits current roster capacity."}</p></div>}
      {projection.rosterExclusions.length > 0 && <div className="forecast-detail-note"><strong>Hypothetically excluded</strong><p>{projection.rosterExclusions.map(player => player.name).join(", ")}</p></div>}
      {projection.missing.length > 0 && <div className="forecast-detail-note warning"><strong>Missing stats</strong><p>{projection.missing.map(player => player.name).join(", ")}</p></div>}
    </div>
    <div className="forecast-team-section">
      <div className="forecast-section-heading"><h4>Playable games</h4><span>Projected</span></div>
      {projection.issue ? <p className="forecast-detail-note warning">{projection.issue}</p> : projection.players.length ? <ul className="forecast-games-list">{projection.players.map(({ player, games }) => <li key={player.id}><span>{player.name}</span><span className="forecast-player-games">{gamesLabel(games)}</span></li>)}</ul> : <p className="forecast-quiet">No playable games in this window.</p>}
      {projection.benched > 0 && <p className="forecast-quiet">{projection.benched} player-games benched · lineup slots full</p>}
    </div>
    <details className="forecast-inputs"><summary>Player outlook inputs</summary><div>{projection.outlookEstimates.length ? projection.outlookEstimates.map(estimate => {
      const player = data.players.find(player => player.id === estimate.playerId);
      return player ? <OutlookDetails key={player.id} player={player} estimate={estimate} /> : null;
    }) : <p className="forecast-quiet">No outlook inputs available.</p>}</div></details>
  </section>;
}

export function ForecastDetails({ data, teams, projections, remaining }: {
  data: Snapshot; teams: [Team, Team]; projections: readonly [Projection, Projection]; remaining: boolean;
}) {
  return <details className="forecast-audit">
    <summary>Forecast assumptions<span>Availability & playable games</span></summary>
    <div className="forecast-audit-body">
      <div className="forecast-team-panels">{projections.map((projection, index) => <TeamBreakdown key={teams[index].id} team={teams[index]} projection={projection} data={data} side={index ? "away" : "home"} />)}</div>
      <details className="forecast-method"><summary>How this forecast is calculated</summary>
        <div className="forecast-method-grid">
          <section><h4>Production</h4><p>Balanced per-game outlook × playable games. Current stats blend with the previous season; minutes follow the current role and shooting weights use attempts. Without usable history, only current stats are used.</p><p>Daily lineups fill legal slots, then favor outlook value. Historical validation is limited; role changes need review.</p></section>
          <section><h4>Availability</h4><p>Conservative excludes IR and all non-active statuses, including day-to-day and unknown.</p><p>If available includes uncertain players; OUT, suspended and IR players return after today. IR needs roster space; no drops are assumed. This scenario does not predict a return date.</p></section>
          <section><h4>Scoring</h4>{remaining && <p>Scored totals plus remaining games. Started players keep their slots; live production uses time remaining.</p>}<p>FG% and FT% use total makes and attempts. Close means within 5% for counting stats or 1.5 percentage points for shooting.</p><p>A projection, not a win probability.</p></section>
        </div>
      </details>
    </div>
  </details>;
}
