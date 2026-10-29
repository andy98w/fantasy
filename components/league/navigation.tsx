"use client";
import type { Snapshot, Team } from "@/lib/schema";
import { TeamAvatar } from "./avatars";
import { PixelIcon, type IconName } from "../ui/pixel-icon";
import { Button } from "../ui/primitives";
export const navigation = [
  { value: "overview", label: "Overview", icon: "home" },
  { value: "matchup", label: "Matchups", icon: "matchup" },
  { value: "team", label: "Roster", icon: "roster" },
  { value: "players", label: "Players", icon: "players" },
  { value: "league", label: "Standings", icon: "standings" },
  { value: "rankings", label: "Rankings", icon: "rankings" },
  { value: "news", label: "News", icon: "news" },
] as const satisfies readonly {
  value: string;
  label: string;
  icon: IconName;
}[];
export type View = (typeof navigation)[number]["value"] | "connection";
export function Navigation({
  data,
  mine,
  view,
  go,
  espn,
  minutes,
}: {
  data: Snapshot;
  mine: Team;
  view: View;
  go: (view: View) => void;
  espn: string;
  minutes: number | null;
}) {
  return (
    <header className="app-header">
      <div className="masthead">
        <a
          className="brand"
          href="#overview"
          onClick={() => go("overview")}
          aria-label="Ninecat overview"
        >
          <span className="brand-ball">
            <PixelIcon name="ball" size={28} />
          </span>
          ninecat<span className="brand-nine">9</span>
        </a>
        <div className="league-name">
          <strong>{data.league.name.trim()}</strong>
          <span>
            {data.league.season - 1}–{String(data.league.season).slice(2)} /{" "}
            {data.teams.length} teams
          </span>
        </div>
        <div className="header-actions">
          <a
            href={espn}
            className="button button-quiet espn-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            ESPN
            <PixelIcon name="external" size={12} />
          </a>
          <button
            className="my-team-button"
            onClick={() => go("team")}
            aria-label={`Open ${mine.name} roster`}
          >
            <TeamAvatar team={mine} />
            <span>{mine.name}</span>
          </button>
        </div>
      </div>
      <div className="navigation-row">
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <a
              key={item.value}
              href={`#${item.value}`}
              onClick={() => go(item.value)}
              aria-current={view === item.value ? "page" : undefined}
            >
              <PixelIcon name={item.icon} size={16} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="sync-control">
          <a
            href="#connection"
            title="Import status"
            aria-label={`Import status: ${data.mode === "demo" ? "demo" : minutes === null ? "imported" : `updated ${minutes} minutes ago`}`}
            onClick={() => go("connection")}
            className={view === "connection" ? "selected" : ""}
          >
            <span
              className={`sync-dot ${data.mode === "demo" || (minutes ?? 0) > 15 ? "stale" : ""}`}
            />
            {data.mode === "demo"
              ? "Demo"
              : minutes === null
                ? "Imported"
                : minutes === 0
                  ? "Updated now"
                  : `${minutes}m ago`}
          </a>
          <Button
            variant="quiet"
            aria-label="Reload latest imported data"
            title="Reload latest imported data"
            onClick={() => window.location.reload()}
          >
            <PixelIcon name="refresh" size={13} />
          </Button>
        </div>
      </div>
    </header>
  );
}
