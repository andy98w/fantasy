"use client";
import { SortableHeader, TableToolbar, TableEmpty, useTableControls } from "../ui/table-controls";
import { CATEGORIES, type Category, type Matchup } from "@/lib/schema";
import { compareCategories } from "@/lib/season";
import { stat, categorySearch } from "./format";
import { MatchupClash } from "./matchup-clash";
export function CategoryComparison({ home, away, homeName, awayName, finished = false, categories = CATEGORIES, close = [] }: {
  home: Matchup["home"]; away: Matchup["away"]; homeName: string; awayName: string; finished?: boolean; categories?: readonly Category[]; close?: readonly Category[];
}) {
  const control = useTableControls(categories, {
    search: categorySearch,
    value: (category, key) => key === "category" ? category : key === "home" ? home.stats[category] : away.stats[category],
  });
  return (
    <div className="category-comparison-table">
      <TableToolbar label="Search categories" query={control.query} onQuery={control.setQuery} />
      <table className="matchup-categories" aria-label="Category comparison">
        <thead>
          <tr><SortableHeader column="home" sort={control.sort} onSort={control.onSort}>{homeName}</SortableHeader><SortableHeader column="category" sort={control.sort} onSort={control.onSort} descending={false}>Category</SortableHeader><SortableHeader column="away" sort={control.sort} onSort={control.onSort}>{awayName}</SortableHeader></tr>
        </thead>
        <tbody>
          {control.rows.map((category, index) => {
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
                    {known && !tied && close.includes(category) && <small>Close</small>}
                    {(!known || tied) && <small>{known ? "Tied" : "Pending"}</small>}
                  </span>
                </th>
                <td className={known && (!win || tied) ? "away-value" : ""}>
                  <span className="category-value">{stat(b, category)}</span>
                </td>
              </tr>
            );
          })}
          {!control.rows.length && <TableEmpty columns={3} />}
        </tbody>
      </table>
    </div>
  );
}
