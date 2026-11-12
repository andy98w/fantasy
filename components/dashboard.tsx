"use client";
import { useEffect, useMemo, useState } from "react";
import type { Player, Snapshot } from "@/lib/schema";
import { dashboardRoute, dashboardHash } from "@/lib/dashboard-route";
import { relevantNews } from "@/lib/analysis";
import { Navigation, navigation, type View } from "./league/navigation";
import { MatchupBoard } from "./league/matchup-board";
import { MatchupGrid } from "./league/matchup-grid";
import { PlayerTable } from "./league/player-table";
import { PlayerAnalysis } from "./league/player-analysis";
import { PlayerDialog } from "./league/player-dialog";
import { PowerMovers } from "./league/power-movers";
import { PlayerFilters } from "./league/player-filters";
import { TeamSelect } from "./league/team-select";
import {
  TeamRankings,
  TeamProfile,
  RankingHelp,
} from "./league/team-views";
import { Forecast } from "./league/forecast";
import { Records } from "./league/records";
import { TradeHub } from "./league/trade-hub";
import { McpConnect } from "./league/mcp-connect";
import { Connection } from "./league/connection";
import type { RecapRoster } from "@/lib/recap-roster";
import { DailyPerformers } from "./league/daily-performers";
import { Today } from "./league/today";
import { nbaAbbrev, type TodayData } from "@/lib/nba";
import { NewsFeed } from "./league/news-feed";
import { sortPlayers, type Sort } from "./league/format";
import {
  Button,
  Panel,
  Toolbar,
  ResultCount,
  PageHeading,
  Notice,
} from "./ui/primitives";

export default function Dashboard({
  data,
  syncFailure,
  today,
  recapRoster,
}: {
  data: Snapshot;
  syncFailure: string | null;
  today?: TodayData;
  recapRoster?: RecapRoster;
}) {
  const [routeReady, setRouteReady] = useState(false);
  const [view, setView] = useState<View>("league");
  const [teamId, setTeamId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("all");
  const [nbaTeam, setNbaTeam] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [sort, setSort] = useState<Sort>({ key: "power", descending: true });
  const [pinnedIds, setPinnedIds] = useState<Player["id"][]>([]);
  const [selectedId, setSelectedId] = useState<Player["id"] | null>(null);
  const selected =
    data.players.find((player) => player.id === selectedId) ?? null;
  const [minutes, setMinutes] = useState<number | null>(null);
  const [matchupId, setMatchupId] = useState<number | undefined>(data.matchups[0]?.id);
  useEffect(() => {
    const update = () =>
      setMinutes(
        Math.max(
          0,
          Math.floor((Date.now() - new Date(data.syncedAt).getTime()) / 60000),
        ),
      );
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, [data.syncedAt]);
  useEffect(() => {
    const update = () => {
      const route = dashboardRoute(window.location.hash, data);
      setRouteReady(true);
      if (!route) return;
      setView(route.view);
      setTeamId(route.teamId);
      setMatchupId(route.matchupId);
    };
    update();
    const onHashChange = () => {
      // Native hash links do not notify Next's router. Keep its refresh URL in sync.
      window.history.replaceState(null, "", window.location.href);
      update();
    };
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", update);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", update);
    };
  }, [data.teams, data.matchups]);
  const go = (value: View, details: { teamId?: number | null; matchupId?: number } = {}) => {
    const matchup = data.matchups.find(m => m.id === details.matchupId);
    const hash = dashboardHash(value, { ...details, period: matchup?.period });
    const route = dashboardRoute(hash, data)!;
    setView(route.view);
    setTeamId(route.teamId);
    setMatchupId(route.matchupId);
    // Next patches the History API to update its canonical URL. Assigning
    // location.hash leaves that URL stale and router.refresh() restores it.
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const openTeam = (id: number) => go("team", { teamId: id });
  const onSort = (key: string) =>
    setSort((current) => ({
      key,
      descending: current.key === key ? !current.descending : !["TO", "name", "rank", "team", "status"].includes(key),
    }));
  const team = data.teams.find((team) => team.id === teamId);
  const roster = team
    ? data.players.filter((player) => player.teamId === team.id)
    : [];
  const nbaTeams = useMemo(
    () => [...new Set(data.players.map(player => nbaAbbrev(player.nbaTeam)).filter(Boolean))],
    [data.players],
  );
  const visiblePlayers = useMemo(
    () =>
      sortPlayers(
        data.players.filter(
          (player) =>
            player.name.toLowerCase().includes(query.toLowerCase()) &&
            (position === "all" || player.eligibleSlots.includes(position)) &&
            (nbaTeam === "all" || nbaAbbrev(player.nbaTeam) === nbaTeam) &&
            (availability === "all" ||
              (availability === "rostered" && player.teamId !== null) ||
              (availability.startsWith("team:") &&
                player.teamId === Number(availability.slice(5))) ||
              (availability === "available" &&
                ["FREEAGENT", "WAIVERS"].includes(player.availability))),
        ),
        sort, data.teams,
      ),
    [data.players, data.teams, query, position, nbaTeam, availability, sort],
  );
  const pinnedPlayers = useMemo(
    () => sortPlayers(data.players.filter(player => pinnedIds.includes(player.id)), sort, data.teams),
    [data.players, data.teams, pinnedIds, sort],
  );
  const togglePin = (id: Player["id"]) => setPinnedIds(current =>
    current.includes(id) ? current.filter(pinnedId => pinnedId !== id) : [...current, id],
  );
  const news = useMemo(
    () => relevantNews(data.news, data.players),
    [data.news, data.players],
  );
  const teamNews = team ? relevantNews(data.news, data.players, team.id) : [];
  const espn = `https://fantasy.espn.com/basketball/league?leagueId=${data.league.id}&seasonId=${data.league.season}`;
  const tableProps = {
    teams: data.teams,
    minimumGames: data.model.minimumGames,
    sort,
    onSort,
    onSelect: (player: Player) => setSelectedId(player.id),
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content" onClick={(event) => {
        event.preventDefault();
        const main = document.getElementById("main-content");
        main?.focus({ preventScroll: true });
        main?.scrollIntoView();
      }}>
        Skip to content
      </a>
      <Navigation
        data={data}
        view={routeReady ? view : null}
        go={go}
        espn={espn}
        minutes={minutes}
      />
      <main className="main-content" id="main-content" tabIndex={-1} aria-busy={!routeReady}>
        {routeReady ? <>
        {data.mode === "demo" ? (
          <Notice
            action={
              <Button variant="quiet" onClick={() => go("connection")}>
                Connection
              </Button>
            }
          >
            Demo league · Fictional stats
          </Notice>
        ) : syncFailure ? (
          <Notice
            warning
            action={
              <Button variant="quiet" onClick={() => go("connection")}>
                Details
              </Button>
            }
          >
            Updates unavailable. Showing the last import.
          </Notice>
        ) : (minutes ?? 0) > 15 ? (
          <Notice
            warning
            action={
              <Button variant="quiet" onClick={() => go("connection")}>
                Sync status
              </Button>
            }
          >
            Data is {minutes} minutes old.
          </Notice>
        ) : null}
        <PageHeading
          title={
            view === "connection"
              ? "Connection"
              : view === "matchup"
                ? "Matchup"
                : navigation.find((item) => item.value === view)!.label
          }
          detail={view === "players" ? "Season per game" : undefined}
          action={
            <button
              className="mobile-import"
              onClick={() => go("connection")}
              aria-label="Sync status"
            >
              {data.mode === "demo"
                ? "Demo"
                : minutes === null
                  ? "Imported"
                  : minutes === 0
                    ? "Updated now"
                    : `${minutes}m ago`}
            </button>
          }
        />
        {(["players", "team"] as View[]).includes(view) && (
          <RankingHelp model={data.model} />
        )}
        {view === "league" && (
          <div className="overview-grid">
            <div className="league-main">
              <MatchupGrid matchups={data.matchups} teams={data.teams} period={data.league.matchupPeriod} fetchedAt={data.matchupSyncedAt ?? data.syncedAt}
                onMatchup={(id) => go("matchup", { matchupId: id })} />
              <DailyPerformers data={data} today={today} onPlayer={(player) => setSelectedId(player.id)} />
            </div>
            <aside className="league-sidebar" aria-label="League news and today's games">
              <Panel title="Roster news"><NewsFeed items={news} limit={6} /></Panel>
              <Today data={today} players={data.players} minimumGames={data.model.minimumGames} onPlayer={(player) => setSelectedId(player.id)} />
            </aside>
          </div>
        )}
        {view === "matchup" && (
          <>
            <Toolbar>
              <Button variant="quiet" onClick={() => go("league")}>
                ← League
              </Button>
            </Toolbar>
            <MatchupBoard
              recapRoster={recapRoster}
              today={today}
              players={data.players}
              onPlayer={(player) => setSelectedId(player.id)}
              matchup={
                data.matchups.find((matchup) => matchup.id === matchupId) ??
                data.matchups[0]
              }
              teams={data.teams}
            />
          </>
        )}
        {view === "team" && (
          <>
            <Toolbar>
              <TeamSelect
                teams={data.teams}
                label="Select team"
                value={teamId === null ? "all" : String(teamId)}
                onChange={(value) =>
                  go("team", { teamId: value === "all" ? null : Number(value) })
                }
              />
              <ResultCount
                count={team ? roster.length : data.teams.length}
                singular={team ? "player" : "team"}
              />
            </Toolbar>
            {team ? (
              <>
                <TeamProfile team={team} teams={data.teams} roster={roster} players={data.players} />
                <Panel>
                  <PlayerTable
                    players={sortPlayers(roster, sort, data.teams)}
                    {...tableProps}
                  />
                </Panel>
                <div className="team-news">
                  <Panel title="Team news">
                    <NewsFeed items={teamNews} limit={6} />
                  </Panel>
                </div>
              </>
            ) : (
              <TeamRankings
                teams={data.teams}
                players={data.players}
                onTeam={openTeam}
              />
            )}
          </>
        )}
        {view === "players" && (
          <>
            <PlayerFilters
              teams={data.teams}
              query={query}
              onQuery={setQuery}
              position={position}
              onPosition={setPosition}
              nbaTeam={nbaTeam}
              nbaTeams={nbaTeams}
              onNbaTeam={setNbaTeam}
              availability={availability}
              onAvailability={setAvailability}
              count={visiblePlayers.length}
              onReset={() => {
                setQuery("");
                setPosition("all");
                setNbaTeam("all");
                setAvailability("all");
              }}
            />
            <PowerMovers players={visiblePlayers} teams={data.teams} baselineAt={data.powerBaselineAt} onSelect={tableProps.onSelect} />
            <Panel>
              <PlayerTable searchable={false} players={visiblePlayers} {...tableProps} ownership trends baselineAt={data.powerBaselineAt}
                pinning={{ players: pinnedPlayers, onToggle: togglePin, onClear: () => setPinnedIds([]) }} />
            </Panel>
          </>
        )}
        <div hidden={view !== "trades"}>
          <TradeHub data={data} active={view === "trades"} />
        </div>
        {view === "analysis" && <PlayerAnalysis data={data} today={today} />}
        {view === "forecast" && <Forecast data={data} today={today} />}
        {view === "records" && <Records data={data} onTeam={openTeam} />}
        {view === "mcp" && <McpConnect teams={data.teams} />}
        {view === "connection" && (
          <Connection data={data} syncFailure={syncFailure} />
        )}
        </> : <div className="empty-state" role="status">Loading…</div>}
      </main>
      <PlayerDialog
        player={selected}
        data={data}
        today={today}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
