import { CATEGORIES, type Snapshot, type Team } from "@/lib/schema";
import { TeamAvatar } from "./avatars";
import { Panel } from "../ui/primitives";
export function Standings({
  teams,
  mineId,
  scoringType,
  onTeam,
}: {
  teams: Team[];
  mineId: number;
  scoringType: string;
  onTeam: (id: number) => void;
}) {
  return (
    <Panel>
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
              <th>Talent</th>
              <th>Rated</th>
            </tr>
          </thead>
          <tbody>
            {[...teams]
              .sort((a, b) => (a.standing ?? 999) - (b.standing ?? 999))
              .map((team) => (
                <tr
                  key={team.id}
                  className={team.id === mineId ? "my-row" : ""}
                >
                  <td className="rank-cell">{team.standing ?? "—"}</td>
                  <td className="identity-col">
                    <button
                      className="identity"
                      onClick={() => onTeam(team.id)}
                    >
                      <TeamAvatar team={team} />
                      <strong>{team.name}</strong>
                      {team.id === mineId && (
                        <span className="you-label">You</span>
                      )}
                    </button>
                  </td>
                  <td>{team.wins}</td>
                  <td>{team.losses}</td>
                  <td>{team.ties}</td>
                  <td>{team.talent?.toFixed(1) ?? "—"}</td>
                  <td className="muted">
                    {team.rankedPlayers}/{team.rosterSize}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="panel-note">
        {scoringType === "H2H_CATEGORY"
          ? "Record counts individual categories."
          : "Record counts weekly matchups."}
      </p>
    </Panel>
  );
}
export function RankingHelp({ model }: { model: Snapshot["model"] }) {
  return (
    <details className="ranking-help">
      <summary>Scoring method</summary>
      <div>
        <p>
          Rank orders players by the sum of their nine category z-scores. Power
          is a 0–100 percentile against {model.poolSize} reference players,
          selected by minutes per game.
        </p>
        <p>
          Shooting percentages are weighted by attempts. Fewer turnovers adds
          value. Players need {model.minimumGames} games and complete stats.
          These are season averages, not projections.
        </p>
        <p>
          Team talent adds roster values, including bench and IR. Incomplete
          rosters remain unranked.
        </p>
      </div>
    </details>
  );
}
export function TeamRankings({
  teams,
  onTeam,
}: {
  teams: Team[];
  onTeam: (id: number) => void;
}) {
  return (
    <Panel>
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
              <th>Talent</th>
              <th>Rated</th>
              {CATEGORIES.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...teams]
              .sort((a, b) => (a.talentRank ?? 999) - (b.talentRank ?? 999))
              .map((team) => (
                <tr key={team.id}>
                  <td className="rank-cell">
                    {team.talentRank === null ? "—" : `#${team.talentRank}`}
                  </td>
                  <td className="identity-col">
                    <button
                      className="identity"
                      onClick={() => onTeam(team.id)}
                    >
                      <TeamAvatar team={team} />
                      <strong>{team.name}</strong>
                    </button>
                  </td>
                  <td>{team.talent?.toFixed(1) ?? "—"}</td>
                  <td className="muted">
                    {team.rankedPlayers}/{team.rosterSize}
                  </td>
                  {CATEGORIES.map((category) => {
                    const value = team.categoryProfile[category];
                    return (
                      <td key={category}>
                        <span
                          className={`heat-cell ${value == null || team.rankedPlayers === 0 ? "" : value >= 0 ? "positive" : "negative"}`}
                        >
                          {value == null || team.rankedPlayers === 0
                            ? "—"
                            : `${value > 0 ? "+" : ""}${value.toFixed(1)}`}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="panel-note">
        {teams.filter((t) => t.talentRank !== null).length}/{teams.length} fully
        rated teams. Category totals include rated players only.
      </p>
    </Panel>
  );
}
export function TeamProfile({ team }: { team: Team }) {
  return (
    <div className="team-profile">
      <TeamAvatar team={team} large />
      <div className="team-profile-name">
        <h2>{team.name}</h2>
        <span>
          {team.wins}–{team.losses}–{team.ties}
        </span>
      </div>
      <div>
        <span>Standing</span>
        <strong>{team.standing === null ? "—" : `#${team.standing}`}</strong>
      </div>
      <div>
        <span>Talent</span>
        <strong>{team.talent?.toFixed(1) ?? "NR"}</strong>
      </div>
      <div>
        <span>Rated</span>
        <strong>
          {team.rankedPlayers}/{team.rosterSize}
        </strong>
      </div>
    </div>
  );
}
