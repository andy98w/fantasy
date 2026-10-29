"use client";
import { useMemo, useState } from "react";
import { CATEGORIES, type Category, type Snapshot, type Matchup } from "@/lib/schema";
import { allPlay, compareCategories, rivalry, seasonMatchups, weekSides } from "@/lib/season";
import { tradeEntries } from "@/lib/trade-battles";
import { Select } from "../ui/select";
import { Tabs, Empty, Panel } from "../ui/primitives";
import { AnimatedRows, MotionNumber } from "../ui/motion";
import { TeamAvatar } from "./avatars";
import { teamOptions } from "./team-select";
import { MatchupClash } from "./matchup-clash";
import { CategoryComparison } from "./category-comparison";
import { TradeSide } from "./trade-battles";

function WeekSelect({ matches, value, onChange }: { matches: Matchup[]; value: number; onChange: (value: number) => void }) {
  const periods = [...new Set(matches.map(m => m.period))].sort((a, b) => b - a);
  return <Select label="Matchup week" value={String(value)} onChange={v => onChange(Number(v))}
    options={periods.map(period => ({ value: String(period), label: `Week ${period}${matches.some(m => m.period === period && m.result === "UNDECIDED") ? " · Live" : " · Final"}` }))} />;
}
export function Rivalries({ data }: { data: Snapshot }) {
  const matches = useMemo(() => seasonMatchups(data), [data]);
  const [tab, setTab] = useState<"duel" | "whatif">("duel");
  const [a, setA] = useState(data.teams[0]?.id);
  const [b, setB] = useState(data.teams[1]?.id);
  const [period, setPeriod] = useState(data.league.matchupPeriod);
  const [categories, setCategories] = useState<readonly Category[]>(CATEGORIES);
  const home = data.teams.find(t => t.id === a) ?? data.teams[0];
  const away = data.teams.find(t => t.id === b && t.id !== home?.id) ?? data.teams.find(t => t.id !== home?.id);
  const selectedPeriod = matches.some(m => m.period === period) ? period : matches.at(-1)?.period ?? data.league.matchupPeriod;
  const sides = weekSides(matches, selectedPeriod);
  const x = sides.get(home?.id), y = sides.get(away?.id ?? -1);
  const score = x && y ? compareCategories(x.stats, y.stats) : null;
  const head = rivalry(matches, home?.id ?? -1, away?.id ?? -1);
  const shared = data.trades.filter(t => t.moves.some(m => (m.fromTeamId === home?.id && m.toTeamId === away?.id) || (m.fromTeamId === away?.id && m.toTeamId === home?.id)));
  const entries = tradeEntries(shared);
  const simulation = allPlay(data.teams, matches, selectedPeriod, categories);
  const completeWeek = matches.some(m => m.period === selectedPeriod) && !matches.some(m => m.period === selectedPeriod && m.result === "UNDECIDED");
  if (!home || !away) return <Empty>Two teams are needed for rivalries.</Empty>;
  return <div className="rivalries">
    <div className="rivalry-toolbar"><Tabs label="Rivalries" value={tab} onChange={setTab} options={[{ value: "duel", label: "Head-to-head" }, { value: "whatif", label: "What if" }]} /><WeekSelect matches={matches} value={selectedPeriod} onChange={setPeriod} /></div>
    {data.historySyncError && <p className="history-warning" role="status">{data.historySyncError} Showing saved results.</p>}
    {tab === "duel" ? <>
      <div className="rivalry-selectors">
        <Select label="First rival" value={String(home.id)} onChange={v => { const id = Number(v); setA(id); if (id === away.id) setB(home.id); }} options={teamOptions(data.teams)} />
        <Select label="Second rival" value={String(away.id)} onChange={v => setB(Number(v))} options={teamOptions(data.teams.filter(t => t.id !== home.id))} />
      </div>
      <section className="rivalry-duel" aria-label={`${home.name} versus ${away.name}`}>
        <div className="rivalry-stage" key={`${home.id}:${away.id}`}>
          <MatchupClash home={score && !score.missing ? score.home : null} away={score && !score.missing ? score.away : null} finished={completeWeek} />
          <div className="rivalry-fighter home"><TeamAvatar team={home} large /><h2>{home.name}</h2><strong className="home-score">{score && !score.missing ? score.home : "—"}</strong></div>
          <div className="rivalry-vs"><span>VS</span><small>Week {selectedPeriod}</small></div>
          <div className="rivalry-fighter away"><TeamAvatar team={away} large /><h2>{away.name}</h2><strong className="away-score">{score && !score.missing ? score.away : "—"}</strong></div>
        </div>
        {x && y ? <CategoryComparison home={x} away={y} homeName={home.name} awayName={away.name} finished={completeWeek} /> : <Empty>No scored matchup for one of these teams this week.</Empty>}
      </section>
      <div className="rivalry-history-grid">
        <Panel title="Season head-to-head" action={<span className="rivalry-record">{head.wins}–{head.losses}{head.ties ? `–${head.ties}` : ""}</span>}>
          {head.meetings.length ? <><div className="rivalry-history-caption">{home.name} vs {away.name}</div><ul className="rivalry-meetings">{head.meetings.map(m => {
            const first = m.home.teamId === home.id ? m.home : m.away, second = m.home.teamId === home.id ? m.away : m.home;
            const s = compareCategories(first.stats, second.stats);
            return <li key={m.id}><span>Week {m.period}{head.closestIds.includes(m.id) && <small className="closest-meeting">Closest</small>}</span><b className={s.home > s.away ? "home-value" : s.away > s.home ? "away-value" : ""}>{s.missing ? "—" : `${s.home}–${s.away}${s.ties ? ` (${s.ties} tied)` : ""}`}</b><span>{m.result === "TIE" ? "Tie" : (m.result === "HOME" ? m.home.teamId : m.away.teamId) === home.id ? home.name : away.name}</span></li>;
          })}</ul></> : <Empty>No completed meetings yet.</Empty>}
        </Panel>
        <Panel title="Trades between them">
          {shared.length ? <div className="rivalry-trades">{shared.map(trade => <details key={trade.id}><summary>{new Intl.DateTimeFormat("en-US", {month:"short",day:"numeric",timeZone:"America/Los_Angeles"}).format(new Date(trade.completedAt))}<span>{trade.moves.length} players</span></summary><div className="rivalry-trade-sides">{entries.filter(e => e.tradeId === trade.id && [home.id,away.id].includes(e.teamId)).map(e => <TradeSide key={e.id} entry={e} data={data} />)}</div></details>)}</div> : <Empty>No trades between these teams.</Empty>}
        </Panel>
      </div>
    </> : <section className="what-if">
      <div className="what-if-heading"><h2>Everyone plays everyone</h2><span>{completeWeek ? "Final weekly totals" : "Week in progress"}</span></div>
      <div className="category-switches" role="group" aria-label="Scoring categories">{CATEGORIES.map(category => <button key={category} type="button" aria-pressed={categories.includes(category)} disabled={categories.length === 1 && categories.includes(category)} onClick={() => setCategories(old => old.includes(category) ? old.filter(c => c !== category) : CATEGORIES.filter(c => c === category || old.includes(c)))}>{category}{!categories.includes(category) && <span aria-hidden="true"> ×</span>}</button>)}</div>
      {simulation.missing.length > 0 && <p className="history-warning">Missing weekly stats: {simulation.missing.map(t => t.name).join(", ")}</p>}
      <Panel>{simulation.rows.length ? <div className="table-scroll"><table className="data-table what-if-table"><thead><tr><th>Rank</th><th className="identity-col">Team</th><th>Wins</th><th>Losses</th><th>Ties</th><th>Category wins</th></tr></thead>
        <AnimatedRows revision={`${selectedPeriod}:${categories.join()}:${simulation.rows.map(r => `${r.team.id}:${r.points}`).join()}`}>{simulation.rows.map(row => <tr key={row.team.id} data-motion-key={row.team.id}>
          <td className="rank-cell"><MotionNumber>{`#${row.rank}`}</MotionNumber></td><td className="identity-col"><span className="identity"><TeamAvatar team={row.team} /><strong>{row.team.name}</strong></span></td>
          <td><MotionNumber>{row.wins}</MotionNumber></td><td><MotionNumber>{row.losses}</MotionNumber></td><td><MotionNumber>{row.ties}</MotionNumber></td><td><MotionNumber>{row.categoryWins}</MotionNumber></td>
        </tr>)}</AnimatedRows></table></div> : <Empty>At least two teams need scored totals.</Empty>}</Panel>
    </section>}
  </div>;
}
