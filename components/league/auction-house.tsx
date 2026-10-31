"use client";
import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/lib/schema";
import { currentListings, type AuctionListing, type AuctionMutation } from "@/lib/auction";
import { matchesSearch, compareTableValues } from "@/lib/table";
import { Button, Empty, Panel, Toolbar } from "../ui/primitives";
import { Select } from "../ui/select";
import { SearchField } from "../ui/search-field";
import { TeamSelect, teamOptions } from "./team-select";
import { TeamAvatar, PowerBadge } from "./avatars";
import { PlayerPreview } from "./player-preview";

function mergeListings(old: AuctionListing[], incoming: AuctionListing[]) {
  const rows = new Map(old.map(row => [row.playerId, row]));
  for (const row of incoming) if ((rows.get(row.playerId)?.version ?? 0) <= row.version) rows.set(row.playerId, row);
  return [...rows.values()];
}
export function AuctionHouse({ data, active }: { data: Snapshot; active: boolean }) {
  const [listings, setListings] = useState<AuctionListing[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [acting, setActing] = useState("choose");
  const [draft, setDraft] = useState({ playerId: "choose", note: "", version: 0 });
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const submitting = useRef(false);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController(); let running = false;
    const load = async () => {
      if (running) return; running = true;
      try {
        const response = await fetch("/api/auction", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        const value = await response.json();
        if (!response.ok) throw new Error();
        if (!controller.signal.aborted) { setListings(old => mergeListings(old, value.listings)); setReady(true); setLoadError(""); }
      } catch { if (!controller.signal.aborted) setLoadError("Listings unavailable. Try again."); }
      finally { running = false; }
    };
    void load();
    const visible = () => { if (document.visibilityState === "visible") void load(); };
    const timer = setInterval(visible, 15000);
    document.addEventListener("visibilitychange", visible);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [active, refresh]);
  const roster = data.players.filter(p => String(p.teamId) === acting).sort((a, b) => a.name.localeCompare(b.name));
  const player = roster.find(p => String(p.id) === draft.playerId);
  const existing = listings.find(row => row.playerId === player?.id);
  const editing = existing?.active && existing.teamId === Number(acting);
  const selectPlayer = (id: string) => {
    const row = listings.find(item => String(item.playerId) === id);
    setDraft({ playerId: id, note: row?.active && row.teamId === Number(acting) ? row.note : "", version: row?.version ?? 0 });
    setError(""); setFeedback("");
  };
  const edit = (row: AuctionListing) => {
    setActing(String(row.teamId)); setDraft({ playerId: String(row.playerId), note: row.note, version: row.version }); setError(""); setFeedback("");
  };
  const mutate = async (input: AuctionMutation) => {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError(""); setFeedback("");
    try {
      const response = await fetch("/api/auction", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(15000) });
      const value = await response.json();
      if (!response.ok) { if (response.status === 409) setRefresh(n => n + 1); throw new Error(value.error ?? "Could not save the listing."); }
      setListings(old => mergeListings(old, [value.listing]));
      setDraft({ playerId: "choose", note: "", version: 0 });
      setFeedback(input.action === "close" ? "Listing removed." : "Listing saved.");
    } catch (err) {
      setError(err instanceof Error && !["TypeError", "TimeoutError"].includes(err.name) ? err.message : "Could not confirm the save. Try again.");
    } finally { submitting.current = false; setBusy(false); }
  };
  const visible = currentListings(listings, data).filter(row => {
    const player = data.players.find(p => p.id === row.playerId)!;
    const team = data.teams.find(t => t.id === row.teamId)!;
    return (teamFilter === "all" || String(row.teamId) === teamFilter) && matchesSearch(`${player.name} ${player.position} ${player.nbaTeam} ${team.name} ${row.note}`, query);
  }).sort((a, b) => {
    const pa = data.players.find(p => p.id === a.playerId)!, pb = data.players.find(p => p.id === b.playerId)!;
    return sort === "power" ? compareTableValues(pa.power, pb.power, true) : sort === "name" ? compareTableValues(pa.name, pb.name) : b.updatedAt.localeCompare(a.updatedAt);
  });
  return <section className="auction-house" aria-label="Auction House">
    <div className="auction-heading"><h2>Auction House</h2><span>Open to trades</span></div>
    <div className="auction-layout">
      <Panel title={editing ? "Edit listing" : "List a player"} className="auction-composer">
        <div className="auction-form">
          <div className="auction-field"><span>Acting as</span><Select label="Acting as" value={acting} disabled={busy} onChange={value => { setActing(value); setDraft({ playerId: "choose", note: "", version: 0 }); setError(""); setFeedback(""); }} options={[{ value: "choose", label: "Choose a team" }, ...teamOptions(data.teams)]} /></div>
          <p className="auction-open-note">Anyone can post or edit as any team.</p>
          <div className="auction-field"><span>Player</span><Select label="Player to list" value={draft.playerId} disabled={busy || acting === "choose" || !ready} onChange={selectPlayer} options={[{ value: "choose", label: "Choose a player" }, ...roster.map(p => ({ value: String(p.id), label: p.name }))]} /></div>
          <label><span>Looking for <small>Optional</small></span><textarea aria-label="Looking for" rows={3} maxLength={240} disabled={busy} value={draft.note} placeholder="Assists, a center, a 2-for-1…" onChange={event => setDraft(old => ({ ...old, note: event.target.value }))} /></label>
          <Button onClick={() => { if (player) void mutate({ action: "save", teamId: Number(acting), playerId: player.id, note: draft.note.trim(), version: draft.version }); }} variant="accent" disabled={!player || busy || !ready}>{busy ? "Saving…" : editing ? "Save listing" : "List player"}</Button>
          {(error || feedback) && <p className={error ? "auction-error" : "auction-feedback"} role="status">{error || feedback}</p>}
        </div>
      </Panel>
      <div className="auction-board">
        <Toolbar filters><SearchField label="Search listings" value={query} onChange={setQuery} /><TeamSelect label="Filter listings by team" teams={data.teams} value={teamFilter} onChange={setTeamFilter} /><Select label="Sort listings" value={sort} onChange={setSort} options={[{ value: "newest", label: "Newest first" }, { value: "power", label: "Player power" }, { value: "name", label: "Player name" }]} /></Toolbar>
        {loadError && <div className="auction-error" role="status">{loadError} <Button variant="quiet" onClick={() => setRefresh(n => n + 1)}>Retry</Button></div>}
        {!ready && !loadError ? <Empty>Loading listings…</Empty> : ready && !visible.length ? <Empty>{query || teamFilter !== "all" ? "No matching listings." : "No players listed. Choose a team to put someone on the block."}</Empty> : <div className="auction-listings">{visible.map(row => {
          const p = data.players.find(p => p.id === row.playerId)!, team = data.teams.find(t => t.id === row.teamId)!;
          return <article className="auction-card" key={row.playerId}>
            <header><span className="auction-owner"><TeamAvatar team={team} />{team.name}</span><time dateTime={row.updatedAt}>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }).format(new Date(row.updatedAt))}</time></header>
            <div className="auction-player"><div><PlayerPreview player={p} /><small>{p.nbaTeam} / {p.position}</small></div><div className="auction-power"><small>Power</small><PowerBadge value={p.power} reason="Not enough stats" /></div></div>
            <p className="auction-ask">{row.note ? <><span>Looking for</span>{row.note}</> : "Open to offers"}</p>
            {String(row.teamId) === acting && <footer><Button variant="quiet" disabled={busy} onClick={() => edit(row)}>Edit</Button><Button variant="quiet" disabled={busy} aria-label={`Remove ${p.name} listing`} onClick={() => void mutate({ action: "close", teamId: row.teamId, playerId: row.playerId, note: "", version: row.version })}>Remove</Button></footer>}
          </article>;
        })}</div>}
      </div>
    </div>
  </section>;
}
