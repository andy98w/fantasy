import {
  CATEGORIES,
  type Player,
  type Snapshot,
  type Team,
} from "@/lib/schema";
import { recordRanks, rosterValue, teamPower } from "@/lib/analysis";
import { TeamAvatar } from "./avatars";
import { Panel } from "../ui/primitives";
import { signedZ } from "./format";

export function Standings({
  teams,
  title,
  scoringType,
  onTeam,
}: {
  teams: Team[];
  title?: string;
  scoringType: string;
  onTeam: (id: number) => void;
}) {
  const ranks = recordRanks(teams);
  return (
    <Panel title={title}>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="League standings"
      >
        <table className="data-table standings-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th className="identity-col">Team</th>
              <th>W</th>
              <th>L</th>
              <th>T</th>
            </tr>
          </thead>
          <tbody>
            {[...teams]
              .sort(
                (a, b) => ranks.get(a.id)! - ranks.get(b.id)! || a.id - b.id,
              )
              .map((team) => (
                <tr key={team.id}>
                  <td className="rank-cell">{ranks.get(team.id)}</td>
                  <td className="identity-col">
                    <button
                      className="identity"
                      onClick={() => onTeam(team.id)}
                    >
                      <TeamAvatar team={team} />
                      <strong>{team.name}</strong>
                    </button>
                  </td>
                  <td>{team.wins}</td>
                  <td>{team.losses}</td>
                  <td>{team.ties}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="panel-note">
        {scoringType === "H2H_CATEGORY"
          ? "Category record."
          : "Weekly matchup record."}{" "}
        Equal win percentages share a rank. ESPN seeds may differ.
      </p>
    </Panel>
  );
}

export function RankingHelp({ model }: { model: Snapshot["model"] }) {
  return (
    <details className="ranking-help power-help">
      <summary>How power works</summary>
      <div>
        <p>
          Players: nine category z-scores measure season per-game value. Power
          is a 0–100 percentile against {model.poolSize} reference players.
          Players need {model.minimumGames} games and complete stats. Equal
          underlying values share a rank (1, 2, 2, 4); rounded display scores
          can look equal.
        </p>
        <p>
          Teams: power is the sum of roster category values, including bench and
          IR. Each unrated player is provisionally assigned the reference-player
          average (zero in each category). Coverage shows how much is measured.
          Teams with no rated players remain unranked. More roster slots can
          change the total.
        </p>
        <p>
          Shooting impact is weighted by attempts; fewer turnovers adds value.
          These are observed values, not forecasts or win probabilities.
          Injuries, schedules and legal starting lineups are not projected.
        </p>
        <p>
          Trades keep the same reference pool. Punt weights a category at 0×,
          Normal at 1×, Priority at 2×. Category changes show unweighted value;
          the overall fit score uses each team’s priorities. Missing players
          retain the same provisional assumption.
        </p>
      </div>
    </details>
  );
}

export function Coverage({ roster }: { roster: Player[] }) {
  const value = rosterValue(roster);
  return (
    <span
      className={`coverage-label ${value.provisional ? "provisional" : ""}`}
      title={
        value.missing.length
          ? `Reference-average estimate for: ${value.missing.map((p) => p.name).join(", ")}`
          : "All roster players have measured values"
      }
    >
      {value.rated}/{value.size} rated
      {value.provisional ? " · provisional" : ""}
    </span>
  );
}

export function TeamRankings({
  teams,
  players,
  onTeam,
}: {
  teams: Team[];
  players: Player[];
  onTeam: (id: number) => void;
}) {
  const values = teamPower(teams, players);
  return (
    <Panel title="Team power">
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Team power rankings"
      >
        <table className="data-table heatmap-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th className="identity-col">Team</th>
              <th>Power z</th>
              <th>Coverage</th>
              {CATEGORIES.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {values.map((value) => (
              <tr key={value.team.id}>
                <td className="rank-cell">
                  {value.rank === null ? "—" : `#${value.rank}`}
                </td>
                <td className="identity-col">
                  <button
                    className="identity"
                    onClick={() => onTeam(value.team.id)}
                  >
                    <TeamAvatar team={value.team} />
                    <strong>{value.team.name}</strong>
                  </button>
                </td>
                <td>
                  {value.score?.toFixed(1) ?? "—"}
                  {value.provisional && value.score !== null ? "*" : ""}
                </td>
                <td>
                  <Coverage
                    roster={players.filter((p) => p.teamId === value.team.id)}
                  />
                </td>
                {CATEGORIES.map((category) => (
                  <td key={category}>
                    <CategoryValue
                      value={value.rated ? value.categories[category] : null}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="panel-note">
        * Provisional: unrated players use reference-average value. Coverage is
        not a confidence probability.
      </p>
    </Panel>
  );
}

export function CategoryValue({ value }: { value: number | null }) {
  return (
    <span
      className={`heat-cell ${value === null ? "" : value > 0 ? "positive" : value < 0 ? "negative" : ""}`}
    >
      {value === null ? "—" : signedZ(value)}
    </span>
  );
}

export function CategoryProfile({ roster }: { roster: Player[] }) {
  const value = rosterValue(roster);
  return (
    <div className="team-category-profile" aria-label="Category strengths">
      {CATEGORIES.map((category) => (
        <div key={category}>
          <span>{category}</span>
          <CategoryValue
            value={value.rated ? value.categories[category] : null}
          />
        </div>
      ))}
    </div>
  );
}

export function TeamProfile({
  team,
  teams,
  roster,
}: {
  team: Team;
  teams: Team[];
  roster: Player[];
}) {
  const value = rosterValue(roster);
  return (
    <>
      <div className="team-profile">
        <TeamAvatar team={team} large />
        <div className="team-profile-name">
          <h2>{team.name}</h2>
          <span>
            {team.wins}–{team.losses}–{team.ties}
          </span>
        </div>
        <div>
          <span>Record rank</span>
          <strong>#{recordRanks(teams).get(team.id)}</strong>
        </div>
        <div>
          <span>ESPN seed</span>
          <strong>{team.standing === null ? "—" : `#${team.standing}`}</strong>
        </div>
        <div>
          <span>Power z{value.provisional ? " (provisional)" : ""}</span>
          <strong>{value.score?.toFixed(1) ?? "—"}</strong>
        </div>
        <div>
          <span>Coverage</span>
          <Coverage roster={roster} />
        </div>
      </div>
      <CategoryProfile roster={roster} />
      {value.missing.length > 0 && (
        <p className="panel-note missing-players">
          Reference-average estimates:{" "}
          {value.missing.map((p) => p.name).join(", ")}.
        </p>
      )}
    </>
  );
}
