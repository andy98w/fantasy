import { CATEGORIES, type Category, type Matchup } from "@/lib/schema";
import { compareCategories } from "@/lib/season";
import { stat } from "./format";
import { MatchupClash } from "./matchup-clash";
export function CategoryComparison({ home, away, homeName, awayName, finished = false, categories = CATEGORIES }: {
  home: Matchup["home"]; away: Matchup["away"]; homeName: string; awayName: string; finished?: boolean; categories?: readonly Category[];
}) {
  return (
      <table className="matchup-categories" aria-label="Category comparison">
        <thead className="visually-hidden">
          <tr><th scope="col">{homeName}</th><th scope="col">Category</th><th scope="col">{awayName}</th></tr>
        </thead>
        <tbody>
          {categories.map((category, index) => {
            const a = home.stats[category],
              b = away.stats[category];
            const result = compareCategories(home.stats, away.stats, [category]);
            const known = result.missing === 0, tied = result.ties > 0, win = result.home > 0;
            return (
              <tr key={category}>
                <td className={known && (win || tied) ? "home-value" : ""}>
                  <span className="category-value">{stat(a, category)}</span>
                </td>
                <th scope="row" title={category === "TO" ? "Fewer turnovers wins" : undefined}>
                  <MatchupClash home={a ?? null} away={b ?? null} lowerWins={category === "TO"} finished={finished} compact phase={index + 1} />
                  <span className="category-label">
                    {category}{category === "TO" ? " ↓" : ""}
                    {(!known || tied) && <small>{known ? "Tied" : "Pending"}</small>}
                  </span>
                </th>
                <td className={known && (!win || tied) ? "away-value" : ""}>
                  <span className="category-value">{stat(b, category)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
  );
}
