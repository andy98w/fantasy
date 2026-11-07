import { Disclosure } from "../ui/disclosure";
import { CATEGORIES, type Player } from "@/lib/schema";
import type { Outlook } from "@/lib/outlook";
import { stat } from "./format";

/** Compact audit trail shared by forecasts and trade estimates. */
export function OutlookDetails({ player, estimate }: { player: Player; estimate: Outlook }) {
  const prior = estimate.priorSeason ? player.previousSeason : null;
  return <Disclosure className="forecast-details" title={<>{player.name} · {estimate.source.replaceAll("_", " ")}</>}>
    <p>{estimate.currentGames} current games{prior ? ` · ${prior.season - 1}–${String(prior.season).slice(-2)}: ${estimate.priorGames} games` : ""}</p>
    {estimate.warnings.length > 0 && <p>{estimate.warnings.join(" · ")}</p>}
    <div className="table-scroll"><table className="data-table"><thead><tr><th>Per game</th><th>Current</th><th>Previous</th><th>Outlook</th><th>Current weight</th></tr></thead>
      <tbody>{[...CATEGORIES, "MIN", "FGA", "FTA"].map(category => <tr key={category}><td>{category}</td><td>{stat(estimate.currentGames ? player.stats[category] : null, category)}</td><td>{stat(prior?.stats[category], category)}</td><td>{stat(estimate.stats?.[category], category)}</td><td>{estimate.currentWeights[category] == null ? "—" : `${Math.round(100 * estimate.currentWeights[category])}%`}</td></tr>)}</tbody>
    </table></div>
    {estimate.source === "blended" && <p>Counting-stat weights apply to per-minute rates when minutes are available. Shooting weights use attempts; points come from projected makes.</p>}
  </Disclosure>;
}
