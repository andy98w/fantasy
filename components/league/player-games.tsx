"use client";
import { useEffect, useState } from "react";
import type { PlayerGames } from "@/lib/player-games";
import { BOX_COLUMNS } from "@/lib/game-boxscore";
import { NBA_TIMEZONE, type NbaGame } from "@/lib/nba";
import { Button, Empty } from "../ui/primitives";
import { SortableHeader, TableToolbar, TableEmpty, useTableControls } from "../ui/table-controls";
import { Select } from "../ui/select";
import { statSortValue } from "@/lib/table";
import { GameDialog } from "./game-dialog";

const columns = BOX_COLUMNS.filter(([key]) => key !== "plusMinus");
const dateFormat = new Intl.DateTimeFormat("en-US", { timeZone: NBA_TIMEZONE, month: "short", day: "numeric" });
export function PlayerRecentGames({ playerId, season }: { playerId: number; season: number }) {
  const [data, setData] = useState<PlayerGames | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<NbaGame | null>(null);
  const [limit, setLimit] = useState(10);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    fetch(`/api/players/${playerId}/games?season=${season}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) })
      .then(async (response) => { if (!response.ok) throw new Error("Unavailable"); return await response.json() as PlayerGames; })
      .then((value) => { if (!controller.signal.aborted) { setData(value); setError(value.stale); } })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [playerId, season, retry]);
  const [result, setResult] = useState("all");
  const control = useTableControls((data?.games ?? []).filter(row => result === "all" || row.result === result), {
    initialSort: { key: "date", descending: true },
    search: row => `${dateFormat.format(new Date(row.game.startsAt))} ${row.opponent} ${row.game.home.name} ${row.game.away.name} ${row.result}`,
    value: (row, key) => key === "date" ? Date.parse(row.game.startsAt) : key === "result" ? row.result : statSortValue(row.stats[key]),
  });
  return <section className="player-recent-games" aria-label="Recent games">
    <h3>Recent games</h3>
    {error && <p className="today-stale" role="status">{data ? "Game log may be out of date." : "Game log unavailable."} <Button variant="quiet" onClick={() => setRetry((value) => value + 1)}>Retry</Button></p>}
    {!data ? !error && <Empty>Loading games…</Empty> : !data.games.length ? <Empty>No games played this season.</Empty> : <>
      <TableToolbar label="Search games" query={control.query} onQuery={control.setQuery}>
        <Select label="Game result" value={result} onChange={setResult} options={[{value:"all",label:"All results"},{value:"W",label:"Wins"},{value:"L",label:"Losses"}]} />
      </TableToolbar>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Recent game stats">
        <table className="data-table player-games-table">
          <thead><tr><SortableHeader column="date" sort={control.sort} onSort={control.onSort}>Game</SortableHeader><SortableHeader column="result" sort={control.sort} onSort={control.onSort} descending={false}>Result</SortableHeader>{columns.map(([key, label]) => <SortableHeader column={key} key={key} sort={control.sort} onSort={control.onSort} descending={key !== "turnovers"} title={key.includes("Made-") ? "Sort by makes, then attempts" : undefined}>{label}</SortableHeader>)}</tr></thead>
          <tbody>{control.rows.slice(0, limit).map(({ game, opponent, result, stats }) => <tr key={game.id} onClick={() => setSelected(game)}>
            <th scope="row"><button type="button" aria-haspopup="dialog" aria-label={`View ${dateFormat.format(new Date(game.startsAt))} ${opponent} box score`} onClick={(event) => { event.stopPropagation(); setSelected(game); }}>
              <span>{dateFormat.format(new Date(game.startsAt))}</span><strong>{opponent}</strong>
            </button></th>
            <td className={result === "W" ? "positive-text" : "negative-text"}>{result}</td>
            {columns.map(([key]) => <td key={key}>{stats[key] ?? "—"}</td>)}
          </tr>)}{!control.rows.length && <TableEmpty columns={columns.length + 2} />}</tbody>
        </table>
      </div>
      {control.rows.length > limit && <Button variant="quiet" onClick={() => setLimit((value) => value + 10)}>Older games</Button>}
    </>}
    {selected && <GameDialog key={selected.id} game={selected} onClose={() => setSelected(null)} />}
  </section>;
}
