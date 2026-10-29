import type { Snapshot, Team } from "@/lib/schema";
import { TeamAvatar } from "./avatars";
import { Empty } from "../ui/primitives";
export function MatchupGrid({
  matchups,
  teams,
  period,
  onMatchup,
}: {
  matchups: Snapshot["matchups"];
  teams: Team[];
  period: number;
  onMatchup: (id: number) => void;
}) {
  return (
    <section className="league-matchups" aria-label={`Week ${period} matchups`}>
      <div className="section-heading">
        <h2>Week {period}</h2>
        <span>{matchups.length} matchups</span>
      </div>
      {matchups.length ? (
        <div className="matchup-grid">
          {matchups.map((matchup) => {
            const home = teams.find((team) => team.id === matchup.home.teamId),
              away = teams.find((team) => team.id === matchup.away.teamId);
            if (!home || !away) return null;
            return (
              <button
                className="matchup-card"
                key={matchup.id}
                onClick={() => onMatchup(matchup.id)}
                aria-label={`${home.name} vs ${away.name}: ${matchup.home.wins ?? "pending"} to ${matchup.away.wins ?? "pending"}`}
              >
                <span className="matchup-card-team">
                  <TeamAvatar team={home} />
                  <span className="matchup-card-name">
                    {home.name}
                    <small>
                      {home.wins}–{home.losses}–{home.ties}
                    </small>
                  </span>
                  <strong className="home-score">
                    {matchup.home.wins ?? "—"}
                  </strong>
                </span>
                <span className="matchup-card-team">
                  <TeamAvatar team={away} />
                  <span className="matchup-card-name">
                    {away.name}
                    <small>
                      {away.wins}–{away.losses}–{away.ties}
                    </small>
                  </span>
                  <strong className="away-score">
                    {matchup.away.wins ?? "—"}
                  </strong>
                </span>
                {matchup.home.ties ? (
                  <span className="matchup-card-ties">
                    {matchup.home.ties} tied
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <Empty>No matchups this week.</Empty>
      )}
    </section>
  );
}
