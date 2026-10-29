"use client";
import { useEffect, useMemo, useState } from "react";
import type { Player, Snapshot } from "@/lib/schema";
import { Navigation, navigation, type View } from "./league/navigation";
import { MatchupBoard } from "./league/matchup-board";
import { PlayerTable } from "./league/player-table";
import { PlayerDialog } from "./league/player-dialog";
import { PlayerFilters } from "./league/player-filters";
import { TeamAvatar } from "./league/avatars";
import {
  Standings,
  TeamRankings,
  TeamProfile,
  RankingHelp,
} from "./league/team-views";
import { Connection } from "./league/connection";
import { NewsFeed } from "./league/news-feed";
import { sortPlayers, type Sort } from "./league/format";
import { Button, Panel, Tabs } from "./ui/primitives";

export default function Dashboard({
  data,
  syncFailure,
}: {
  data: Snapshot;
  syncFailure: string | null;
}) {
  const mine = data.teams.find((team) => team.id === data.league.myTeamId)!;
  const [view, setView] = useState<View>("overview");
  const [teamId, setTeamId] = useState(mine.id);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [rankingScope, setRankingScope] = useState<"players" | "teams">(
    "players",
  );
  const [newsScope, setNewsScope] = useState<"all" | "mine">("all");
  const [sort, setSort] = useState<Sort>({ key: "power", descending: true });
  const [selected, setSelected] = useState<Player | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const myMatchup = data.matchups.find((matchup) =>
    [matchup.home.teamId, matchup.away.teamId].includes(mine.id),
  );
  const [matchupId, setMatchupId] = useState(
    myMatchup?.id ?? data.matchups[0]?.id,
  );
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
    if (value === "team") setTeamId(mine.id);
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
  const team = data.teams.find((team) => team.id === teamId) ?? mine;
  const roster = data.players.filter((player) => player.teamId === team.id);
  const myRoster = data.players.filter((player) => player.teamId === mine.id);
  const alerts = myRoster.filter((player) =>
    ["OUT", "DAY_TO_DAY", "INJURY_RESERVE"].includes(player.status),
  );
  const visiblePlayers = useMemo(
    () =>
      sortPlayers(
        data.players.filter(
          (player) =>
            player.name.toLowerCase().includes(query.toLowerCase()) &&
            (position === "all" || player.eligibleSlots.includes(position)) &&
            (availability === "all" ||
              (availability === "mine" && player.teamId === mine.id) ||
              (availability === "available" &&
                ["FREEAGENT", "WAIVERS"].includes(player.availability))),
        ),
        sort,
      ),
    [data.players, query, position, availability, mine.id, sort],
  );
  const news = data.news.filter(
    (item) =>
      newsScope === "all" ||
      item.playerIds.some((id) => myRoster.some((player) => player.id === id)),
  );
  const espn = `https://fantasy.espn.com/basketball/team?leagueId=${data.league.id}&teamId=${mine.id}&seasonId=${data.league.season}`;
  const tableProps = {
    teams: data.teams,
    minimumGames: data.model.minimumGames,
    sort,
    onSort,
    onSelect: setSelected,
  };
  const resetFilters = () => {
    setQuery("");
    setPosition("all");
    setAvailability("all");
  };
  const filters = (
    <PlayerFilters
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
        mine={mine}
        view={view}
        go={go}
        espn={espn}
        minutes={minutes}
      />
      <main className="main-content" id="main-content">
        {data.mode === "demo" ? (
          <div className="notice">
            Demo league · Fictional stats{" "}
            <button onClick={() => go("connection")}>Connection</button>
          </div>
        ) : syncFailure ? (
          <div className="notice warning" role="status">
            Sync failed. Showing the last import.{" "}
            <button onClick={() => go("connection")}>Details</button>
          </div>
        ) : (minutes ?? 0) > 15 ? (
          <div className="notice warning" role="status">
            Data is {minutes} minutes old.{" "}
            <button onClick={() => go("connection")}>Import status</button>
          </div>
        ) : null}
        <div className="page-heading">
          <h1>
            {view === "connection"
              ? "Connection"
              : navigation.find((item) => item.value === view)?.label}
          </h1>
          {view === "players" || view === "rankings" ? (
            <span className="heading-detail">Season per game</span>
          ) : null}
          <button
            className="mobile-import"
            onClick={() => go("connection")}
            aria-label="Import status"
          >
            {data.mode === "demo"
              ? "Demo"
              : minutes === null
                ? "Imported"
                : minutes === 0
                  ? "Updated now"
                  : `${minutes}m ago`}
          </button>
        </div>
        {view === "overview" && (
          <>
            <MatchupBoard
              matchup={myMatchup}
              teams={data.teams}
              onDetails={() => go("matchup")}
            />
            <div className="roster-summary">
              <button className="identity" onClick={() => openTeam(mine.id)}>
                <TeamAvatar team={mine} />
                <strong>{mine.name}</strong>
              </button>
              <span>
                Standing{" "}
                <strong>
                  {mine.standing ? `#${mine.standing}` : "—"}
                  <small>/{data.teams.length}</small>
                </strong>
              </span>
              <span>
                Record{" "}
                <strong>
                  {mine.wins}–{mine.losses}–{mine.ties}
                </strong>
              </span>
              <button
                onClick={() => openTeam(mine.id)}
                className={alerts.length ? "injury-link" : ""}
              >
                {`${alerts.length} ${alerts.length === 1 ? "injury" : "injuries"}`}
              </button>
              <Button variant="quiet" onClick={() => openTeam(mine.id)}>
                Full roster →
              </Button>
            </div>
            <div className="overview-grid">
              <Panel
                title="My roster"
                action={<span className="panel-meta">Per game</span>}
              >
                <PlayerTable
                  players={sortPlayers(myRoster, sort)}
                  {...tableProps}
                  compact
                />
              </Panel>
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
            <div className="view-toolbar">
              <select
                aria-label="Select team"
                value={teamId}
                onChange={(event) => setTeamId(Number(event.target.value))}
              >
                {data.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <span className="muted">{roster.length} players</span>
            </div>
            <TeamProfile team={team} />
            <Panel>
              <PlayerTable
                players={sortPlayers(roster, sort)}
                {...tableProps}
              />
            </Panel>
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
            mineId={mine.id}
            scoringType={data.league.scoringType}
            onTeam={openTeam}
          />
        )}
        {view === "rankings" && (
          <>
            <div className="view-toolbar">
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
            </div>
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
            <div className="view-toolbar">
              <Tabs
                label="News filter"
                value={newsScope}
                options={[
                  { value: "all", label: "All news" },
                  { value: "mine", label: "My players" },
                ]}
                onChange={setNewsScope}
              />
              <span className="muted">{news.length} headlines</span>
            </div>
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
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
