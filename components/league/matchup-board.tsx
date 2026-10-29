import { type Snapshot, type Team } from "@/lib/schema";
import { TeamAvatar } from "./avatars";
import { CategoryComparison } from "./category-comparison";
import { Button, Empty } from "../ui/primitives";
import { PixelIcon } from "../ui/pixel-icon";
import { MatchupClash } from "./matchup-clash";
import { MatchupMVP } from "./weekly-highlights";
import type { weeklyMVPs } from "@/lib/weekly";
import { MotionNumber } from "../ui/motion";
export function MatchupBoard({
  matchup,
  teams,
  onDetails,
  ratings = [],
}: {
  matchup?: Snapshot["matchups"][number];
  teams: Team[];
  onDetails?: () => void;
  ratings?: ReturnType<typeof weeklyMVPs>;
}) {
  const home = teams.find((t) => t.id === matchup?.home.teamId),
    away = teams.find((t) => t.id === matchup?.away.teamId);
  if (!matchup || !home || !away)
    return (
      <section className="panel">
        <Empty>No matchup this week.</Empty>
      </section>
    );
  return (
    <section className="scoreboard">
      <div className="scoreboard-heading">
        <h2>Week {matchup.period}</h2>
        {onDetails && (
          <Button variant="quiet" onClick={onDetails}>
            All matchups →
          </Button>
        )}
      </div>
      <div className="scoreboard-matchup">
        <MatchupClash home={matchup.home.wins} away={matchup.away.wins} finished={matchup.result !== "UNDECIDED"} />
        <div className="contender home">
          <TeamAvatar team={home} large />
          <div>
            <span className="team-code">{home.abbrev}</span>
            <h3>{home.name}</h3>
            <small>
              {home.wins}–{home.losses}–{home.ties}
            </small>
          </div>
        </div>
        <div className="matchup-score">
          <div className="score-digits">
            <strong className="home-score"><MotionNumber>{matchup.home.wins ?? "—"}</MotionNumber></strong>
            <span>:</span>
            <strong className="away-score"><MotionNumber>{matchup.away.wins ?? "—"}</MotionNumber></strong>
          </div>
          <span className="score-label">
            {matchup.result !== "UNDECIDED" ? "Final" : matchup.home.ties ? `${matchup.home.ties} tied` : "Categories won"}
          </span>
          <PixelIcon name="ball" size={20} />
        </div>
        <div className="contender away">
          <TeamAvatar team={away} large />
          <div>
            <span className="team-code">{away.abbrev}</span>
            <h3>{away.name}</h3>
            <small>
              {away.wins}–{away.losses}–{away.ties}
            </small>
          </div>
        </div>
      </div>
      <CategoryComparison home={matchup.home} away={matchup.away} homeName={home.name} awayName={away.name} finished={matchup.result !== "UNDECIDED"} />
      <MatchupMVP matchup={matchup} teams={teams} ratings={ratings} />
    </section>
  );
}
