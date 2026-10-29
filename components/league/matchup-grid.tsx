"use client";

import type { Snapshot, Team } from "@/lib/schema";
import { MatchupClash } from "./matchup-clash";
import { TeamAvatar } from "./avatars";
import { MotionNumber } from "../ui/motion";
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
      </div>
      {matchups.length ? (
        <div className="matchup-grid">
          {matchups.map((matchup, index) => {
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
                    <span className="matchup-card-title">{home.name}</span>
                    <small>
                      {home.wins}–{home.losses}–{home.ties}
                    </small>
                  </span>
                  <strong className="home-score">
                    <MotionNumber>{matchup.home.wins ?? "—"}</MotionNumber>
                  </strong>
                </span>
                <span className="matchup-card-team">
                  <TeamAvatar team={away} />
                  <span className="matchup-card-name">
                    <span className="matchup-card-title">{away.name}</span>
                    <small>
                      {away.wins}–{away.losses}–{away.ties}
                    </small>
                  </span>
                  <strong className="away-score">
                    <MotionNumber>{matchup.away.wins ?? "—"}</MotionNumber>
                  </strong>
                </span>
                <MatchupClash home={matchup.home.wins} away={matchup.away.wins} phase={index} finished={matchup.result !== "UNDECIDED"} />
                {matchup.result !== "UNDECIDED" ? <span className="matchup-card-ties">Final</span> : matchup.home.ties ? (
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
