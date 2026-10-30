import type { Snapshot, Team } from "@/lib/schema";
import { leagueAwards } from "@/lib/weekly";
import { AwardReveal, MotionNumber } from "../ui/motion";
import { PixelIcon } from "../ui/pixel-icon";
import { TeamAvatar } from "./avatars";

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
