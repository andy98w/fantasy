"use client";

import { useMemo, useState } from "react";
import type { Snapshot } from "@/lib/schema";
import { archiveScore, matchupArchive, type ArchiveMatchup } from "@/lib/matchup-archive";
import { Button, Empty } from "../ui/primitives";
import { Select } from "../ui/select";
import { TeamAvatar } from "./avatars";
import { CategoryComparison } from "./category-comparison";
import { MatchupClash } from "./matchup-clash";

const dayLabel = (date: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

function ArchiveResult({ entry, data }: { entry: ArchiveMatchup; data: Snapshot }) {
  const home = data.teams.find(team => team.id === entry.homeId), away = data.teams.find(team => team.id === entry.awayId);
  const homeName = home?.name ?? `Team ${entry.homeId}`, awayName = away?.name ?? `Team ${entry.awayId}`;
  const score = archiveScore(entry), match = entry.match;
  const final = entry.state === "Final";
  const homeWon = final && match?.result === "HOME", awayWon = final && match?.result === "AWAY";
  const outcome = (won: boolean) => final ? match?.result === "TIE" ? "Tied" : won ? "Won" : "Lost" : "";
  return <details className="archive-match" aria-label={`${homeName} versus ${awayName}`}>
    <summary className="archive-match-summary">
      <MatchupClash home={score.categoryTotals ? Number(score.home) : null} away={score.categoryTotals ? Number(score.away) : null} finished compact />
      <span className={`archive-team home ${homeWon ? "archive-winner" : ""}`}>
        {home && <TeamAvatar team={home} />}
        <span className="archive-team-name"><strong>{homeName}</strong>{final && <small>{outcome(homeWon)}</small>}</span>
      </span>
      <span className="archive-result">
        <small>{entry.state}</small>
        <span className="archive-score"><strong className="home-score">{score.home}</strong><span>–</span><strong className="away-score">{score.away}</strong></span>
        <small>{score.ties ? `${score.ties} tied ${score.ties === 1 ? "category" : "categories"}` : final && !score.categoryTotals ? "Score unavailable" : ""}</small>
      </span>
      <span className={`archive-team away ${awayWon ? "archive-winner" : ""}`}>
        {away && <TeamAvatar team={away} />}
        <span className="archive-team-name"><strong>{awayName}</strong>{final && <small>{outcome(awayWon)}</small>}</span>
      </span>
      <span className="archive-expand" aria-hidden="true">⌄</span>
    </summary>
    <div className="archive-match-detail">
      {entry.state === "Scheduled" ? <Empty>Scheduled matchup. Results will appear after scoring begins.</Empty>
        : !match ? <Empty>Scores for this matchup have not been imported.</Empty>
        : !score.categoryTotals && final && !Object.keys(match.home.stats).length && !Object.keys(match.away.stats).length
          ? <Empty>The result is confirmed. Category totals were not recovered after the league reset.</Empty>
          : <>
            {!score.categoryTotals && <p className="history-warning">Some category totals are unavailable; the full category score cannot be calculated.</p>}
            <CategoryComparison home={match.home} away={match.away} homeName={homeName} awayName={awayName} finished={final} />
          </>}
    </div>
  </details>;
}

export function MatchupArchive({ data }: { data: Snapshot }) {
  const archive = useMemo(() => matchupArchive(data), [data]);
  const [selected, setSelected] = useState<number | null>(null);
  const period = selected !== null && archive.periods.includes(selected) ? selected : data.league.matchupPeriod;
  const index = archive.periods.indexOf(period);
  const entries = archive.entries.filter(row => row.period === period);
  const window = data.forecastSchedule?.windows.find(window => window.period === period);
  const expected = Math.floor(data.teams.length / 2);
  const known = entries.filter(row => row.match !== null || row.state === "Scheduled").length;
  const selectPeriod = (value: number) => setSelected(value);
  return <section className="matchup-archive" aria-label="Weekly matchup archive">
    <div className="archive-toolbar">
      <div className="archive-week-controls">
        <Button variant="quiet" aria-label="Previous week" disabled={index <= 0} onClick={() => selectPeriod(archive.periods[index - 1])}>←</Button>
        <Select label="Matchup week" value={String(period)} onChange={value => selectPeriod(Number(value))}
          options={archive.periods.map(week => ({ value: String(week), label: `Week ${week}${week === data.league.matchupPeriod ? " · Current" : week > data.league.matchupPeriod ? " · Scheduled" : ""}` }))} />
        <Button variant="quiet" aria-label="Next week" disabled={index < 0 || index === archive.periods.length - 1} onClick={() => selectPeriod(archive.periods[index + 1])}>→</Button>
      </div>
      <span className="records-period">{window ? `${dayLabel(window.start)}–${dayLabel(window.end)}` : `Week ${period}`}</span>
    </div>
    {known > 0 && known < expected && <p className="history-warning">{known} of {expected} matchups available. The remaining matchups have not been imported.</p>}
    {entries.length ? <div className="archive-matches" key={period}>{entries.map(entry => <ArchiveResult key={entry.key} entry={entry} data={data} />)}</div>
      : <Empty>No matchups have been imported for Week {period}.</Empty>}
  </section>;
}
