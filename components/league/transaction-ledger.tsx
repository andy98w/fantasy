"use client";
import { useMemo, useState } from "react";
import type { Snapshot } from "@/lib/schema";
import { filterTransactions } from "@/lib/ledger";
import { Button, Empty, Toolbar } from "../ui/primitives";
import { Select } from "../ui/select";
import { SearchField } from "../ui/search-field";
import { TeamSelect } from "./team-select";
import { TeamAvatar } from "./avatars";
import { PlayerPreview } from "./player-preview";

const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });

export function TransactionLedger({ data }: { data: Snapshot }) {
  const [team, setTeam] = useState("all");
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(50);
  const filtered = useMemo(() => filterTransactions(data.transactions, data.players, team, type, query), [data.transactions, data.players, team, type, query]);
  const players = new Map(data.players.map(player => [player.id, player]));
  const teams = new Map(data.teams.map(t => [t.id, t]));
  const teamName = (id: number | null, poolLabel = "Free agents") => {
    const value = id === null ? undefined : teams.get(id);
    return value ? <span className="ledger-team"><TeamAvatar team={value} /><span>{value.name}</span></span> : <span>{id === null ? poolLabel : `Team ${id}`}</span>;
  };
  return <section className="transaction-ledger" aria-label="Transaction ledger">
    <Toolbar filters>
      <TeamSelect label="Filter activity by team" teams={data.teams} value={team} onChange={value => {setTeam(value); setLimit(50);}} />
      <Select label="Transaction type" value={type} onChange={value => {setType(value); setLimit(50);}} options={[{value:"all",label:"All activity"},{value:"ADD",label:"Adds"},{value:"DROP",label:"Drops"},{value:"TRADE",label:"Trades"}]} />
      <SearchField label="Search player" value={query} onChange={value => {setQuery(value); setLimit(50);}} />
    </Toolbar>
    {data.activitySyncError && <p className="history-warning" role="status">{data.activitySyncError}{data.transactions.length ? " Showing saved activity." : ""}</p>}
    {!filtered.length ? <Empty>{data.transactions.length ? "No matching transactions." : data.activitySyncError ? "Activity unavailable. Retrying automatically." : data.activitySyncedAt ? "No roster activity this season." : "Activity will appear after the next import."}</Empty> : <ol className="ledger-events">{filtered.slice(0, limit).map(event => {
      const timestamp = new Date(event.completedAt);
      const label = event.moves.some(move => move.type === "TRADE") ? "Trade" : event.moves.every(move => move.type === "ADD") ? "Add" : event.moves.every(move => move.type === "DROP") ? "Drop" : "Add / drop";
      return <li className="ledger-event" key={event.id}>
        <header><h2>{label}</h2><time dateTime={event.completedAt}>{date.format(timestamp)} · {time.format(timestamp)} PT</time></header>
        <ul className="ledger-moves">{event.moves.map((move, index) => {
          const player = players.get(move.playerId);
          return <li key={`${move.type}:${move.playerId}:${index}`}>
            <span className={`ledger-kind ${move.type.toLowerCase()}`}>{move.type === "ADD" ? move.via === "WAIVERS" ? "Waiver add" : "Added" : move.type === "DROP" ? "Dropped" : "Traded"}</span>
            <div className="ledger-player">{player ? <PlayerPreview player={player} /> : <span>Player #{move.playerId}</span>}</div>
            <div className="ledger-route">{teamName(move.fromTeamId, move.via === "WAIVERS" ? "Waivers" : "Free agents")}<span className="ledger-arrow" aria-label="to">→</span>{teamName(move.toTeamId, "Player pool")}</div>
          </li>;
        })}</ul>
      </li>;
    })}</ol>}
    {filtered.length > limit && <Button onClick={() => setLimit(value => value + 50)}>Show more</Button>}
  </section>;
}
