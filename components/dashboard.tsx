"use client";
import { useEffect, useMemo, useState } from "react";
import type { Player, Snapshot } from "@/lib/schema";
import { relevantNews } from "@/lib/analysis";
import { Navigation, navigation, type View } from "./league/navigation";
import { MatchupBoard } from "./league/matchup-board";
import { MatchupGrid } from "./league/matchup-grid";
import { PlayerTable } from "./league/player-table";
import { PlayerDialog } from "./league/player-dialog";
import { PowerMovers } from "./league/power-movers";
import { PlayerFilters } from "./league/player-filters";
import { TeamSelect } from "./league/team-select";
import {
  Standings,
  TeamRankings,
  TeamProfile,
  RankingHelp,
} from "./league/team-views";
import { Rivalries } from "./league/rivalries";
import { Records } from "./league/records";
import { TradeHub } from "./league/trade-hub";
import { Connection } from "./league/connection";
import { LeagueAwards } from "./league/weekly-highlights";
import { weeklyMVPs } from "@/lib/weekly";
import { Today } from "./league/today";
import type { TodayData } from "@/lib/nba";
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
}: {
  data: Snapshot;
  syncFailure: string | null;
  today?: TodayData;
}) {
  const [view, setView] = useState<View>("league");
  const [teamId, setTeamId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [sort, setSort] = useState<Sort>({ key: "power", descending: true });
  const [selectedId, setSelectedId] = useState<Player["id"] | null>(null);
  const selected =
    data.players.find((player) => player.id === selectedId) ?? null;
  const [minutes, setMinutes] = useState<number | null>(null);
  const [matchupId, setMatchupId] = useState(data.matchups[0]?.id);
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
      const hash = window.location.hash.slice(1);
      const aliases: Record<string, View> = {
        overview: "league",
        rankings: "players",
        news: "league",
        teams: "team",
      };
      const value = aliases[hash] ?? hash;
      if (
        [
          ...navigation.map((item) => item.value),
          "connection",
          "matchup",
        ].includes(value as View)
      )
        setView(value as View);
    };
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const go = (value: View) => {
    setView(value);
    if (value === "team") setTeamId(null);
    window.location.hash = value;
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const openTeam = (id: number) => {
    go("team");
    setTeamId(id);
  };
  const onSort = (key: string) =>
    setSort((current) => ({
      key,
      descending: current.key === key ? !current.descending : key !== "TO",
    }));
  const team = data.teams.find((team) => team.id === teamId);
  const roster = team
    ? data.players.filter((player) => player.teamId === team.id)
    : [];
  const visiblePlayers = useMemo(
    () =>
      sortPlayers(
        data.players.filter(
          (player) =>
            player.name.toLowerCase().includes(query.toLowerCase()) &&
            (position === "all" || player.eligibleSlots.includes(position)) &&
            (availability === "all" ||
              (availability === "rostered" && player.teamId !== null) ||
              (availability.startsWith("team:") &&
                player.teamId === Number(availability.slice(5))) ||
              (availability === "available" &&
                ["FREEAGENT", "WAIVERS"].includes(player.availability))),
        ),
        sort,
      ),
    [data.players, query, position, availability, sort],
  );
  const news = useMemo(
    () => relevantNews(data.news, data.players),
    [data.news, data.players],
  );
  const weeklyRatings = useMemo(() => weeklyMVPs(data.matchups), [data.matchups]);
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
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Navigation
        data={data}
        view={view}
        go={go}
        espn={espn}
        minutes={minutes}
      />
      <main className="main-content" id="main-content">
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
            Sync failed. Showing the last import.
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
          <>
            <MatchupGrid
              matchups={data.matchups}
              teams={data.teams}
              period={data.league.matchupPeriod}
              onMatchup={(id) => {
                setMatchupId(id);
                go("matchup");
              }}
            />
            <LeagueAwards matchups={data.matchups} teams={data.teams} onTeam={openTeam} />
            <div className="overview-grid">
              <Standings
                title="Standings"
                teams={data.teams}
                onTeam={openTeam}
              />
              <div className="league-sidebar">
                <Panel title="Roster news">
                  <NewsFeed items={news} limit={6} />
                </Panel>
                <Today data={today} players={data.players} minimumGames={data.model.minimumGames} onPlayer={(player) => setSelectedId(player.id)} />
              </div>
            </div>
          </>
        )}
        {view === "matchup" && (
          <>
            <Toolbar>
              <Button variant="quiet" onClick={() => go("league")}>
                ← League
              </Button>
            </Toolbar>
            <MatchupBoard
              ratings={weeklyRatings}
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
                  setTeamId(value === "all" ? null : Number(value))
                }
              />
              <ResultCount
                count={team ? roster.length : data.teams.length}
                singular={team ? "player" : "team"}
              />
            </Toolbar>
            {team ? (
              <>
                <TeamProfile team={team} teams={data.teams} roster={roster} />
                <Panel>
                  <PlayerTable
                    players={sortPlayers(roster, sort)}
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
              availability={availability}
              onAvailability={setAvailability}
              count={visiblePlayers.length}
              onReset={() => {
                setQuery("");
                setPosition("all");
                setAvailability("all");
              }}
            />
            <PowerMovers players={visiblePlayers} teams={data.teams} baselineAt={data.powerBaselineAt} onSelect={tableProps.onSelect} />
            <Panel>
              <PlayerTable players={visiblePlayers} {...tableProps} ownership trends baselineAt={data.powerBaselineAt} />
            </Panel>
          </>
        )}
        <div hidden={view !== "trades"}>
          <TradeHub data={data} active={view === "trades"} />
        </div>
        {view === "rivalries" && <Rivalries data={data} />}
        {view === "records" && <Records data={data} />}
        {view === "connection" && (
          <Connection data={data} syncFailure={syncFailure} />
        )}
      </main>
      <PlayerDialog
        player={selected}
        data={data}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
