"use client";

import { useEffect, useState } from "react";
import { CATEGORIES, type Category, type Player } from "@/lib/schema";
import { availableToday, gameLabel, nbaDate, NBA_TIMEZONE, playerStrengths, type NbaGame, type TodayData } from "@/lib/nba";
import { MotionNumber } from "../ui/motion";
import { Panel, Tabs, Empty, ResultCount } from "../ui/primitives";
import { Select } from "../ui/select";
import { NbaAvatar, PlayerAvatar, PowerBadge } from "./avatars";
import { ratingReason, stat, statusText } from "./format";

function GameCard({ game }: { game: NbaGame }) {
  return (
    <a className="today-game" href={`https://www.espn.com/nba/game/_/gameId/${encodeURIComponent(game.id)}`} target="_blank" rel="noopener noreferrer"
      aria-label={`${game.away.name} at ${game.home.name}, ${gameLabel(game)}`}>
      <span className={`today-game-state ${game.state === "live" ? "live" : ""}`}>
        {game.state === "live" && <i aria-hidden="true" />}{gameLabel(game)}
      </span>
      {[game.away, game.home].map((team) => (
        <span className="today-game-team" key={team.id}>
          <NbaAvatar team={team} />
          <span>{team.abbrev}</span>
          <strong><MotionNumber>{team.score ?? "—"}</MotionNumber></strong>
        </span>
      ))}
    </a>
  );
}

export function Today({ data, players, minimumGames, onPlayer }: {
  data?: TodayData; players: Player[]; minimumGames: number; onPlayer: (player: Player) => void;
}) {
  const [tab, setTab] = useState<"games" | "available">("games");
  const [category, setCategory] = useState<Category | "all">("all");
  const [notStarted, setNotStarted] = useState(false);
  const [now, setNow] = useState(() => data?.fetchedAt ? Date.parse(data.fetchedAt) : 0);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const oldDate = data && now > 0 && data.date !== nbaDate(new Date(now));
  const available = availableToday(players, data?.games ?? [], { category, notStarted, now });
  const dateLabel = data ? new Intl.DateTimeFormat("en-US", { timeZone: NBA_TIMEZONE, month: "short", day: "numeric" }).format(new Date(`${data.date}T12:00:00Z`)) : "";
  return (
    <Panel title="Today" className="today-panel" action={data && <span className="today-date">{dateLabel} · PT</span>}>
      <div className="today-tabs">
        <Tabs label="Today" value={tab} onChange={setTab} options={[{ value: "games", label: "Games" }, { value: "available", label: "Available players" }]} />
      </div>
      {!data ? <Empty>Game scores unavailable in demo.</Empty>
        : oldDate ? <Empty>Updating today’s games…</Empty>
        : data.status === "error" ? <Empty>Scores unavailable. Retrying automatically.</Empty>
        : <>
          {data.status === "stale" && <p className="today-stale" role="status">Scores may be out of date.</p>}
          {tab === "games" ? (
            data.games.length ? <div className="today-games">{data.games.map((game) => <GameCard key={game.id} game={game} />)}</div> : <Empty>No NBA games today.</Empty>
          ) : <>
            <div className="today-filters">
              <Select label="Category strength" value={category} onChange={(value) => setCategory(value as Category | "all")}
                options={[{ value: "all", label: "All categories" }, ...CATEGORIES.map((c) => ({ value: c, label: `${c} strength` }))]} />
              <label className="today-not-started"><input type="checkbox" checked={notStarted} onChange={(event) => setNotStarted(event.target.checked)} />Not started</label>
            </div>
            <div className="today-results-count"><ResultCount count={available.length} singular="player" /></div>
            <div className="today-players" tabIndex={available.length ? 0 : undefined} role="region" aria-label="Available players playing today">
              {available.map(({ player, game, opponent }) => {
                const strengths = category === "all" ? playerStrengths(player) : [category];
                return (
                  <button type="button" className="today-player" key={player.id} onClick={() => onPlayer(player)}>
                    <span className="today-player-heading">
                      <PlayerAvatar player={player} />
                      <span className="today-player-identity"><strong>{player.name}</strong><small>{player.nbaTeam} · {player.position}</small></span>
                      <PowerBadge value={player.power} reason={ratingReason(player, minimumGames)} />
                    </span>
                    <span className="today-player-game">{opponent} · {gameLabel(game)}</span>
                    <span className="today-player-tags">
                      <span className={player.availability === "WAIVERS" ? "waivers-tag" : "free-agent-tag"}>{player.availability === "WAIVERS" ? "Waivers" : "Free agent"}</span>
                      {player.status !== "ACTIVE" && <span className={player.status === "UNKNOWN" ? "unknown-status-tag" : "injury-tag"}>{player.status === "UNKNOWN" ? "Status unknown" : statusText(player.status)}</span>}
                    </span>
                    {strengths.length > 0 && <span className="today-strengths">{strengths.map((c) => <span key={c}>{c} <strong>{stat(player.stats[c], c)}</strong></span>)}</span>}
                  </button>
                );
              })}
              {!available.length && <Empty>{!data.games.length ? "No NBA games today." : category !== "all" ? `No available players with an above-average ${category} rating${notStarted ? " in games yet to start" : ""}.` : notStarted ? "No available players in games yet to start." : "No available players playing today."}</Empty>}
            </div>
          </>}
        </>}
    </Panel>
  );
}
