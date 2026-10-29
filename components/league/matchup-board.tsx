import { CATEGORIES, type Snapshot, type Team } from "@/lib/schema";
import { TeamAvatar } from "./avatars";
import { stat } from "./format";
import { Button, Empty } from "../ui/primitives";
import { PixelIcon } from "../ui/pixel-icon";
export function MatchupBoard({
  matchup,
  teams,
  onDetails,
}: {
  matchup?: Snapshot["matchups"][number];
  teams: Team[];
  onDetails?: () => void;
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
        <span>9 categories</span>
        {onDetails && (
          <Button variant="quiet" onClick={onDetails}>
            All matchups →
          </Button>
        )}
      </div>
      <div className="scoreboard-matchup">
        <div className="court-lines" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
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
            <strong className="home-score">{matchup.home.wins ?? "—"}</strong>
            <span>:</span>
            <strong className="away-score">{matchup.away.wins ?? "—"}</strong>
          </div>
          <span className="score-label">
            {matchup.home.ties ? `${matchup.home.ties} tied` : "Categories won"}
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
      <div className="category-grid">
        {CATEGORIES.map((category) => {
          const a = matchup.home.stats[category],
            b = matchup.away.stats[category];
          const known = a != null && b != null,
            tied = known && a === b,
            win = known && (category === "TO" ? a < b : a > b);
          const share = known && a + b > 0 ? (100 * a) / (a + b) : 50;
          return (
            <div
              className="category-cell"
              key={category}
              title={category === "TO" ? "Fewer turnovers wins" : undefined}
            >
              <span className="category-label">
                {category}
                {category === "TO" ? " ↓" : ""}
              </span>
              <div className="category-values">
                <strong className={known && (win || tied) ? "home-value" : ""}>
                  {stat(a, category)}
                </strong>
                <span className={known && (!win || tied) ? "away-value" : ""}>
                  {stat(b, category)}
                </span>
              </div>
              <div className="category-meter" aria-hidden="true">
                <span style={{ width: `${share}%` }} />
              </div>
              <small>
                {!known
                  ? "Pending"
                  : tied
                    ? "Tied"
                    : win
                      ? home.abbrev
                      : away.abbrev}
              </small>
            </div>
          );
        })}
      </div>
    </section>
  );
}
