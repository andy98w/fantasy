"use client";
import { useState } from "react";
import type { Player, Team } from "@/lib/schema";
import type { NbaTeam } from "@/lib/nba";
import { initials } from "./format";
function Avatar({
  src,
  name,
  kind,
  size = "small",
}: {
  src?: string | null;
  name: string;
  kind: "team" | "player";
  size?: "small" | "large";
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className={`avatar avatar-${kind} avatar-${size}`}>
      {src && src !== failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(src)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
export function TeamAvatar({
  team,
  large = false,
}: {
  team: Team;
  large?: boolean;
}) {
  return (
    <Avatar
      src={team.logoUrl}
      name={team.abbrev || team.name}
      kind="team"
      size={large ? "large" : "small"}
    />
  );
}
export function NbaAvatar({ team }: { team: NbaTeam }) {
  return <Avatar src={team.logo} name={team.abbrev} kind="team" />;
}
export function PlayerAvatar({
  player,
  large = false,
}: {
  player: Pick<Player, "id" | "name">;
  large?: boolean;
}) {
  return (
    <Avatar
      src={
        player.id > 0
          ? `https://a.espncdn.com/i/headshots/nba/players/full/${player.id}.png`
          : null
      }
      name={player.name}
      kind="player"
      size={large ? "large" : "small"}
    />
  );
}
export function PowerBadge({
  value,
  reason,
}: {
  value: number | null;
  reason?: string;
}) {
  return (
    <span
      className={`power-badge ${value === null ? "unrated" : value >= 75 ? "high" : ""}`}
      title={value === null ? reason : `${value.toFixed(1)} / 100 percentile`}
      aria-label={
        value === null
          ? `Unrated: ${reason}`
          : `Power ${value.toFixed(1)} out of 100`
      }
    >
      {value === null ? "NR" : value.toFixed(0)}
      {value !== null && (
        <span className="power-meter" aria-hidden="true">
          <i style={{ width: `${value}%` }} />
        </span>
      )}
    </span>
  );
}
