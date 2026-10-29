import type { Player, Team } from "@/lib/schema";
import { powerMovers } from "@/lib/power-movers";
import { MotionNumber } from "../ui/motion";
import { PlayerAvatar, PowerBadge } from "./avatars";
import { dateLabel } from "./format";

export function PowerChange({ player, baselineAt }: { player: Player; baselineAt?: string | null }) {
  const value = player.powerChange7d;
  const title = baselineAt ? `Power change since ${dateLabel(baselineAt)}` : "Seven days of saved ratings needed";
  if (player.powerTrendStatus === "new") return <span className="power-change new" title="Newly rated since the comparison date">New</span>;
  if (player.powerTrendStatus !== "measured" || value === null) return <span className="power-change muted" title={title}>—</span>;
  const text = value === 0 ? "0" : `${value > 0 ? "↑" : "↓"}${Math.abs(value).toFixed(1).replace(/\.0$/, "")}`;
  return <span className={`power-change ${value > 0 ? "positive" : value < 0 ? "negative" : "muted"}`} title={title} aria-label={`${value > 0 ? "Up" : value < 0 ? "Down" : "Unchanged"}${value ? ` ${Math.abs(value)} power points over seven days` : ""}`}><MotionNumber>{text}</MotionNumber></span>;
}
export function PowerMovers({ players, teams, baselineAt, onSelect }: {
  players: Player[]; teams: Team[]; baselineAt: string | null; onSelect: (player: Player) => void;
}) {
  const { risers, fallers } = powerMovers(players);
  if (!baselineAt || (!risers.length && !fallers.length)) return null;
  return <section className="power-movers" aria-label="Seven-day power movers">
    {([{ title: "Risers", items: risers, tone: "rising" }, { title: "Fallers", items: fallers, tone: "falling" }] as const).map(group => <div className={`mover-group ${group.tone}`} key={group.title}>
      <div className="mover-heading"><h2>{group.title}</h2><span>7 days</span></div>
      {group.items.length ? <div className="mover-list">{group.items.map(player => <button key={player.id} className="mover-player" onClick={() => onSelect(player)}>
        <PlayerAvatar player={player} /><span className="mover-name"><strong>{player.name}</strong><small>{player.nbaTeam} / {player.position} · {teams.find(t => t.id === player.teamId)?.abbrev ?? (player.availability === "WAIVERS" ? "Waivers" : player.availability === "FREEAGENT" ? "FA" : "—")}</small></span>
        <PowerBadge value={player.power} /><PowerChange player={player} baselineAt={baselineAt} />
      </button>)}</div> : <div className="movers-empty">No {group.title.toLowerCase()} match these filters.</div>}
    </div>)}
  </section>;
}
