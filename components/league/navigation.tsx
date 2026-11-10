"use client";
import { useEffect, useRef, type MouseEvent } from "react";
import type { Snapshot } from "@/lib/schema";
import { PixelIcon, type IconName } from "../ui/pixel-icon";
export const navigation = [
  { value: "league", label: "League", icon: "home" },
  { value: "team", label: "Teams", icon: "roster" },
  { value: "players", label: "Players", icon: "players" },
  { value: "analysis", label: "Analysis", icon: "ball" },
  { value: "trades", label: "Trades", icon: "trade" },
  { value: "forecast", label: "Forecast", icon: "matchup" },
  { value: "records", label: "Records", icon: "standings" },
  { value: "mcp", label: "MCP", icon: "code" },
] as const satisfies readonly {
  value: string;
  label: string;
  icon: IconName;
}[];
export type View =
  (typeof navigation)[number]["value"] | "connection" | "matchup";
export function Navigation({
  data,
  view,
  go,
  espn,
  minutes,
}: {
  data: Snapshot;
  view: View | null;
  go: (view: View) => void;
  espn: string;
  minutes: number | null;
}) {
  const navigate = (event: MouseEvent<HTMLAnchorElement>, next: View) => {
    // Preserve ordinary link behavior for opening a tab/window with modifiers.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    go(next);
  };
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navRef.current?.querySelector('a[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  }, [view]);
  return (
    <header className="app-header">
      <div className="masthead">
        <a
          className="brand"
          href="#league"
          onClick={(event) => navigate(event, "league")}
          aria-label="Fantasy league"
        >
          <span className="brand-ball">
            <PixelIcon name="ball" size={28} />
          </span>
          Fantasy
        </a>
        <div className="league-name">
          <strong>{data.league.name.trim()}</strong>
          <span>
            {data.league.season - 1}–{String(data.league.season).slice(2)} /{" "}
            {data.teams.length} teams
          </span>
        </div>
        <div className="header-actions">
          <div className="sync-control">
            <a
              href="#connection"
              title="Sync status"
              aria-label={`Sync status: ${data.mode === "demo" ? "demo" : minutes === null ? "imported" : `updated ${minutes} minutes ago`}`}
              onClick={(event) => navigate(event, "connection")}
              className={view === "connection" ? "selected" : ""}
            >
              <span
                key={data.syncedAt}
                className={`sync-dot ${data.mode === "demo" || (minutes ?? 0) > 15 ? "stale" : ""}`}
              />
              {data.mode === "demo"
                ? "Demo"
                : minutes === null
                  ? "Imported"
                  : minutes === 0
                    ? "Updated now"
                    : `Updated ${minutes}m ago`}
            </a>
          </div>
          <a
            href={espn}
            className="button button-quiet espn-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            ESPN
            <PixelIcon name="external" size={12} />
          </a>
        </div>
      </div>
      <div className="navigation-row">
        <nav ref={navRef} aria-label="Main navigation">
          {navigation.map((item) => (
            <a
              key={item.value}
              className={item.value === "mcp" ? "nav-mcp" : undefined}
              href={`#${item.value}`}
              onClick={(event) => navigate(event, item.value)}
              aria-current={
                view === item.value ||
                (view === "matchup" && item.value === "league")
                  ? "page"
                  : undefined
              }
            >
              <PixelIcon name={item.icon} size={16} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
