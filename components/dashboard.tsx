"use client";
import { useEffect, useMemo, useState } from "react";
import type { Player, Snapshot } from "@/lib/schema";
import { Navigation, navigation, type View } from "./league/navigation";
import { MatchupBoard } from "./league/matchup-board";
import { PlayerTable } from "./league/player-table";
import { PlayerDialog } from "./league/player-dialog";
import { PlayerFilters } from "./league/player-filters";
import { MatchupGrid } from "./league/matchup-grid";
import { TeamDirectory } from "./league/team-directory";
import { TeamSelect } from "./league/team-select";
import {
  Standings,
  TeamRankings,
  TeamProfile,
  RankingHelp,
} from "./league/team-views";
import { Connection } from "./league/connection";
import { NewsFeed } from "./league/news-feed";
import { sortPlayers, type Sort } from "./league/format";
import {
  Button,
  Panel,
  Tabs,
  Toolbar,
  ResultCount,
  PageHeading,
  Notice,
} from "./ui/primitives";

export default function Dashboard({
  data,
  syncFailure,
}: {
  data: Snapshot;
  syncFailure: string | null;
}) {
  const [view, setView] = useState<View>("overview");
  const [teamId, setTeamId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [rankingScope, setRankingScope] = useState<"players" | "teams">(
    "players",
  );
  const [newsScope, setNewsScope] = useState("all");
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
      const value = window.location.hash.slice(1);
      if (
        [...navigation.map((item) => item.value), "connection"].includes(
          value as View,
        )
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
  const news = data.news.filter(
    (item) =>
      newsScope === "all" ||
      item.playerIds.some((id) =>
        data.players.some(
          (player) => player.id === id && player.teamId === Number(newsScope),
        ),
      ),
  );
  const espn = `https://fantasy.espn.com/basketball/league?leagueId=${data.league.id}&seasonId=${data.league.season}`;
  const tableProps = {
    teams: data.teams,
    minimumGames: data.model.minimumGames,
    sort,
    onSort,
    onSelect: (player: Player) => setSelectedId(player.id),
  };
  const resetFilters = () => {
    setQuery("");
    setPosition("all");
    setAvailability("all");
  };
  const filters = (
    <PlayerFilters
      teams={data.teams}
      query={query}
      onQuery={setQuery}
      position={position}
      onPosition={setPosition}
      availability={availability}
      onAvailability={setAvailability}
      count={visiblePlayers.length}
      onReset={resetFilters}
    />
  );
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
              : navigation.find((item) => item.value === view)!.label
          }
          detail={
            view === "players" || view === "rankings"
              ? "Season per game"
              : undefined
          }
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
        {view === "overview" && (
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
            <div className="overview-grid">
              <Standings
                title="Standings"
                teams={data.teams}
                scoringType={data.league.scoringType}
                onTeam={openTeam}
              />
              <Panel
                title="News"
                action={
                  <Button variant="quiet" onClick={() => go("news")}>
                    All news →
                  </Button>
                }
              >
                <NewsFeed items={data.news} limit={5} />
              </Panel>
            </div>
          </>
        )}
        {view === "matchup" && (
          <>
            <div
              className="matchup-picker"
              role="group"
              aria-label="Select matchup"
            >
              {data.matchups.map((matchup) => {
                const home = data.teams.find(
                    (t) => t.id === matchup.home.teamId,
                  )!,
                  away = data.teams.find((t) => t.id === matchup.away.teamId)!;
                return (
                  <button
                    key={matchup.id}
                    aria-pressed={matchup.id === matchupId}
                    onClick={() => setMatchupId(matchup.id)}
                  >
                    <span>{home.abbrev}</span>
                    <strong>
                      {matchup.home.wins ?? "—"} : {matchup.away.wins ?? "—"}
                    </strong>
                    <span>{away.abbrev}</span>
                  </button>
                );
              })}
            </div>
            <MatchupBoard
              matchup={data.matchups.find(
                (matchup) => matchup.id === matchupId,
              )}
              teams={data.teams}
            />
            <p className="footnote">
              ESPN scored lineups. Fewer turnovers wins.
            </p>
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
                <TeamProfile team={team} />
                <Panel>
                  <PlayerTable
                    players={sortPlayers(roster, sort)}
                    {...tableProps}
                  />
                </Panel>
              </>
            ) : (
              <TeamDirectory teams={data.teams} onTeam={openTeam} />
            )}
          </>
        )}
        {view === "players" && (
          <>
            {filters}
            <Panel>
              <PlayerTable players={visiblePlayers} {...tableProps} ownership />
            </Panel>
            <RankingHelp model={data.model} />
          </>
        )}
        {view === "league" && (
          <Standings
            teams={data.teams}
            scoringType={data.league.scoringType}
            onTeam={openTeam}
          />
        )}
        {view === "rankings" && (
          <>
            <Toolbar>
              <Tabs
                label="Ranking type"
                value={rankingScope}
                options={[
                  { value: "players", label: "Players" },
                  { value: "teams", label: "Teams" },
                ]}
                onChange={(value) => {
                  setRankingScope(value);
                  setSort({ key: "power", descending: true });
                }}
              />
              <span className="muted">
                {rankingScope === "players"
                  ? `${data.players.filter((p) => p.rank !== null).length} rated / ${data.model.minimumGames} games minimum`
                  : "Roster talent"}
              </span>
            </Toolbar>
            {rankingScope === "players" ? (
              <>
                {filters}
                <Panel>
                  <PlayerTable
                    players={visiblePlayers}
                    {...tableProps}
                    ownership
                  />
                </Panel>
              </>
            ) : (
              <TeamRankings teams={data.teams} onTeam={openTeam} />
            )}
            <RankingHelp model={data.model} />
          </>
        )}
        {view === "news" && (
          <>
            <Toolbar>
              <TeamSelect
                teams={data.teams}
                label="News team"
                allLabel="All news"
                value={newsScope}
                onChange={setNewsScope}
              />
              <ResultCount count={news.length} singular="headline" />
            </Toolbar>
            <Panel className="news-page">
              <NewsFeed items={news} />
            </Panel>
          </>
        )}
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
