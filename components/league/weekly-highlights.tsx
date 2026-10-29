import type { Snapshot, Team } from "@/lib/schema";
import { leagueAwards, teamMVPs, type weeklyMVPs } from "@/lib/weekly";
import { AwardReveal, MotionNumber } from "../ui/motion";
import { PixelIcon } from "../ui/pixel-icon";
import { PlayerAvatar, TeamAvatar } from "./avatars";
import { stat } from "./format";

export function LeagueAwards({ matchups, teams, onTeam }: {
  matchups: Snapshot["matchups"]; teams: Team[]; onTeam: (id: number) => void;
}) {
  const awards = leagueAwards(matchups);
  if (!awards.length) return null;
  const final = matchups.every(m => m.result !== "UNDECIDED");
  return <section className="weekly-awards" aria-label="League awards">
    <div className="section-heading"><h2>League awards</h2><span>Week {matchups[0].period}{final ? " · Final" : " · So far"}</span></div>
    <div className="award-grid">{awards.map(award => <AwardReveal key={`${matchups[0].period}:${award.stat}`}>
      <article className={`award-card ${["MISSES", "TO"].includes(award.stat) ? "dubious-award" : ""}`}>
        <span className="award-trophy" aria-hidden="true"><PixelIcon name="standings" size={24} /></span>
        <h3>{award.name}</h3>
        <div className="award-stat"><strong><MotionNumber>{award.value}</MotionNumber></strong><span>{award.label}</span></div>
        <div className="award-teams">{award.teamIds.map(id => {
          const team = teams.find(t => t.id === id);
          return team && <button key={id} className="identity" onClick={() => onTeam(id)}><TeamAvatar team={team} /><span>{team.name}</span></button>;
        })}</div>
      </article>
    </AwardReveal>)}</div>
  </section>;
}

export function MatchupMVP({ matchup, teams, ratings }: {
  matchup: Snapshot["matchups"][number]; teams: Team[]; ratings: ReturnType<typeof weeklyMVPs>;
}) {
  const finalists = [matchup.home, matchup.away].map(side => ({
    team: teams.find(t => t.id === side.teamId), players: teamMVPs(ratings, matchup.id, side.teamId),
  }));
  const complete = finalists.every(side => side.players.length > 0);
  const best = Math.max(...finalists.flatMap(side => side.players.map(p => p.score)));
  return <section className="matchup-mvps" aria-label="Matchup MVP">
    <div className="section-heading"><h2>Matchup MVP</h2><span>{matchup.result === "UNDECIDED" ? "So far" : "Final"}</span></div>
    {!complete ? <p className="mvp-unavailable">Weekly player stats unavailable.</p> : <div className="mvp-grid">{finalists.map(({ team, players }, index) => <div className={`mvp-side ${index ? "away" : "home"}`} key={team!.id}>
      <span className="mvp-team-name">{team!.name}</span>
      {players.map(({ player, score, contributions }) => <AwardReveal key={player.playerId}>
        <article className={`mvp-player ${score === best ? "matchup-mvp-winner" : ""}`}>
          <PlayerAvatar player={{ id: player.playerId, name: player.name }} large />
          <div className="mvp-identity"><strong>{player.name}</strong><div className="mvp-stats">{Object.entries(contributions).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([category]) => <span key={category}><b>{stat(player.stats[category], category)}</b> {category}</span>)}</div></div>
          {score === best && <span className="mvp-crown award-trophy" title="MVP: highest combined nine-category value from scored weekly totals. Shooting is weighted by attempts; fewer turnovers is better. Compared with the league’s scored players."><PixelIcon name="standings" size={24} /><span>MVP</span></span>}
        </article>
      </AwardReveal>)}
    </div>)}</div>}
  </section>;
}
