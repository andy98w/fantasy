"use client";
import { StickyTable } from "../ui/sticky-table";
import { Disclosure } from "../ui/disclosure";
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
      {[{ side: home, name: homeName }, { side: away, name: awayName }].flatMap(({ side, name }) =>
        (side.statCorrections ?? []).map(correction => <Disclosure className="forecast-details" key={`${side.teamId}:${correction.id}`} title={<>{name}: restored {correction.date} totals</>}>
          <p>{correction.label}</p>
          <dl className="detail-facts">
            <div><dt>FG</dt><dd>{correction.stats.FGM}/{correction.stats.FGA}</dd></div>
            <div><dt>FT</dt><dd>{correction.stats.FTM}/{correction.stats.FTA}</dd></div>
            {CATEGORIES.filter(category => !["FG%", "FT%"].includes(category)).map(category => <div key={category}><dt>{category}</dt><dd>{correction.stats[category]}</dd></div>)}
          </dl>
          <p>Added to team totals only. Shooting percentages use combined makes and attempts; these totals are not assigned to individual player rows.</p>
        </Disclosure>))}
      <TableToolbar label="Search categories" query={control.query} onQuery={control.setQuery} />
      <StickyTable className="matchup-categories" aria-label="Category comparison">
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
      </StickyTable>
    </div>
  );
}
