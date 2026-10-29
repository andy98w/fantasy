"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  LayoutDashboard,
  ListFilter,
  Newspaper,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Swords,
  Trophy,
  Users,
  X,
} from "lucide-react";
import {
  CATEGORIES,
  type Category,
  type Player,
  type Snapshot,
  type Team,
} from "@/lib/schema";

type View =
  | "overview"
  | "matchup"
  | "team"
  | "players"
  | "league"
  | "rankings"
  | "news"
  | "connection";
const nav = [
  ["overview", "Overview", LayoutDashboard],
  ["matchup", "Matchups", Swords],
  ["team", "My team", Users],
  ["players", "Players", ListFilter],
  ["league", "League", Trophy],
  ["rankings", "Power rankings", ArrowUpRight],
  ["news", "News", Newspaper],
] as const;
const categoryLabels: Record<string, string> = {
  PTS: "Points",
  REB: "Rebounds",
  AST: "Assists",
  STL: "Steals",
  BLK: "Blocks",
  "3PM": "Threes",
  "FG%": "Field goals",
  "FT%": "Free throws",
  TO: "Turnovers",
};
const initials = (name: string) =>
  name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("");
const stat = (v: number | null | undefined, cat: string) =>
  v == null
    ? "—"
    : cat.includes("%")
      ? `${(v * 100).toFixed(1)}%`
      : Number.isInteger(v)
        ? v.toString()
        : v.toFixed(1);
const statusText = (s: string) =>
  s === "DAY_TO_DAY"
    ? "Day to day"
    : s === "OUT"
      ? "Out"
      : s === "ACTIVE"
        ? "Healthy"
        : s.replaceAll("_", " ").toLowerCase();
function TeamBadge({ team, small = false }: { team: Team; small?: boolean }) {
  return (
    <span className={`team-badge ${small ? "small" : ""} color-${team.id % 4}`}>
      {team.abbrev || initials(team.name)}
    </span>
  );
}
function PlayerAvatar({ player }: { player: Player }) {
  return (
    <span className={`player-avatar color-${Math.abs(player.id) % 4}`}>
      {initials(player.name)}
    </span>
  );
}
function Power({ value }: { value: number | null }) {
  return (
    <span className={`power ${value !== null && value >= 75 ? "strong" : ""}`}>
      {value === null ? "—" : value.toFixed(0)}
    </span>
  );
}

export default function Dashboard({
  data,
  syncFailure,
}: {
  data: Snapshot;
  syncFailure: string | null;
}) {
  const [view, setView] = useState<View>("overview");
  const [teamId, setTeamId] = useState(data.league.myTeamId);
  const [query, setQuery] = useState("");
  const [availability, setAvailability] = useState("all");
  const [position, setPosition] = useState("all");
  const [sort, setSort] = useState("power");
  const [descending, setDescending] = useState(true);
  const [selected, setSelected] = useState<Player | null>(null);
  const [newsScope, setNewsScope] = useState("all");
  const [matchupId, setMatchupId] = useState(
    data.matchups.find((m) =>
      [m.home.teamId, m.away.teamId].includes(data.league.myTeamId),
    )?.id ?? data.matchups[0]?.id,
  );
  const [showMethod, setShowMethod] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const modalRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const update = () => {
      const hash = window.location.hash.slice(1);
      if ([...nav.map((n) => n[0]), "connection"].includes(hash as View))
        setView(hash as View);
    };
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    if (selected) modalRef.current?.showModal();
    else modalRef.current?.close();
  }, [selected]);
  const go = (v: View) => {
    setView(v);
    window.location.hash = v;
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const mine = data.teams.find((t) => t.id === data.league.myTeamId)!;
  const team = data.teams.find((t) => t.id === teamId) ?? mine;
  const roster = data.players.filter((p) => p.teamId === team.id);
  const myRoster = data.players.filter((p) => p.teamId === mine.id);
  const available = data.players.filter((p) =>
    ["FREEAGENT", "WAIVERS"].includes(p.availability),
  ).length;
  const fullyRatedTeams = data.teams.filter(
    (t) => t.talentRank !== null,
  ).length;
  const rankedTeams = [...data.teams].sort(
    (a, b) => (a.talentRank ?? 999) - (b.talentRank ?? 999),
  );
  const matchup = data.matchups.find((m) => m.id === matchupId);
  const left = matchup?.home;
  const right = matchup?.away;
  const leftTeam = data.teams.find((t) => t.id === left?.teamId);
  const rightTeam = data.teams.find((t) => t.id === right?.teamId);
  const alerts = myRoster.filter((p) =>
    ["OUT", "DAY_TO_DAY", "INJURY_RESERVE"].includes(p.status),
  );
  const minutes = now
    ? Math.max(0, Math.floor((now - new Date(data.syncedAt).getTime()) / 60000))
    : 0;
  const stale = data.mode === "live" && minutes > 15;
  const visiblePlayers = useMemo(() => {
    const list = data.players.filter(
      (p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) &&
        (availability === "all" ||
          (availability === "available" &&
            ["FREEAGENT", "WAIVERS"].includes(p.availability)) ||
          (availability === "mine" && p.teamId === mine.id)) &&
        (position === "all" || p.eligibleSlots.includes(position)),
    );
    return list.sort((a, b) => {
      const av = sort === "power" ? a.zTotal : a.stats[sort];
      const bv = sort === "power" ? b.zTotal : b.stats[sort];
      if (av == null) return bv == null ? 0 : 1;
      if (bv == null) return -1;
      return descending ? bv - av : av - bv;
    });
  }, [data.players, query, availability, position, sort, descending, mine.id]);
  const news = data.news.filter(
    (n) =>
      newsScope === "all" ||
      n.playerIds.some((id) => myRoster.some((p) => p.id === id)),
  );
  const espn = `https://fantasy.espn.com/basketball/team?leagueId=${data.league.id}&teamId=${data.league.myTeamId}&seasonId=${data.league.season}`;
  const titles: Record<View, string> = {
    overview: "Your league, in focus.",
    matchup: "Every category counts.",
    team: team.name,
    players: "Find your next advantage.",
    league: "The whole league.",
    rankings: "Beyond the standings.",
    news: "Around the league.",
    connection: "Your connection.",
  };
  function sortedPlayers(players: Player[]) {
    return [...players].sort((a, b) => {
      const av = sort === "power" ? a.zTotal : a.stats[sort];
      const bv = sort === "power" ? b.zTotal : b.stats[sort];
      if (av == null) return bv == null ? 0 : 1;
      if (bv == null) return -1;
      return descending ? bv - av : av - bv;
    });
  }
  function sortBy(key: string) {
    if (sort === key) setDescending(!descending);
    else {
      setSort(key);
      setDescending(true);
    }
  }
  function playerTable(players: Player[], compact = false) {
    return (
      <div className="table-scroll">
        <table className="players-table">
          <thead>
            <tr>
              <th className="player-col">Player</th>
              <th>
                <button onClick={() => sortBy("power")}>
                  Power{" "}
                  {sort === "power" && (
                    <ArrowDown
                      size={12}
                      style={{
                        transform: descending ? "none" : "rotate(180deg)",
                      }}
                    />
                  )}
                </button>
              </th>
              {(compact ? ["PTS", "REB", "AST", "FG%"] : CATEGORIES).map(
                (c) => (
                  <th key={c}>
                    <button onClick={() => sortBy(c)}>
                      {c}
                      {sort === c && <ArrowDown size={11} />}
                    </button>
                  </th>
                ),
              )}
              <th>{view === "players" ? "Roster" : "Status"}</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td className="player-col">
                  <button
                    className="player-button"
                    onClick={() => setSelected(p)}
                  >
                    <PlayerAvatar player={p} />
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {p.nbaTeam} <span className="dot-separator" />{" "}
                        {p.position}
                        {p.slot === "BE" ? " · Bench" : ""}
                      </small>
                    </span>
                  </button>
                </td>
                <td>
                  <Power value={p.power} />
                </td>
                {(compact ? ["PTS", "REB", "AST", "FG%"] : CATEGORIES).map(
                  (c) => (
                    <td key={c}>{stat(p.stats[c], c)}</td>
                  ),
                )}
                <td>
                  {view === "players" ? (
                    <span
                      className={`availability ${p.teamId === null ? "free" : ""}`}
                    >
                      {p.teamId === null
                        ? p.availability === "FREEAGENT"
                          ? "Free agent"
                          : p.availability === "WAIVERS"
                            ? "Waivers"
                            : "Unknown"
                        : data.teams.find((t) => t.id === p.teamId)?.abbrev}
                    </span>
                  ) : (
                    <span
                      className={`status ${p.status === "ACTIVE" ? "healthy" : "injured"}`}
                    >
                      {p.status === "ACTIVE" && <span />}
                      {statusText(p.status)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!players.length && (
          <div className="empty">
            <Search size={26} />
            <h3>No players match.</h3>
            <p>Try another name or broaden your filters.</p>
          </div>
        )}
      </div>
    );
  }
  function matchupBoard(full = false) {
    if (!matchup || !left || !right || !leftTeam || !rightTeam)
      return (
        <div className="panel empty">
          <Swords />
          <h3>No matchup available.</h3>
          <p>Your team may have a bye, or the matchup has not started.</p>
        </div>
      );
    return (
      <section className={`matchup-panel ${full ? "full" : ""}`}>
        <div className="panel-top">
          <span className="section-label">Week {matchup.period} matchup</span>
          <span className="subtle">
            {data.mode === "demo" ? "Sample matchup" : "ESPN category totals"}
          </span>
        </div>
        <div className="matchup-teams">
          <div className="contender">
            <TeamBadge team={leftTeam} />
            <div>
              <h2>{leftTeam.name}</h2>
              <span>
                {leftTeam.id === mine.id
                  ? "Your team"
                  : `${leftTeam.wins}-${leftTeam.losses}-${leftTeam.ties}`}
              </span>
            </div>
          </div>
          <div className="score">
            <span>{left.wins ?? "—"}</span>
            <i>:</i>
            <span>{right.wins ?? "—"}</span>
          </div>
          <div className="contender opponent">
            <div>
              <h2>{rightTeam.name}</h2>
              <span>
                {rightTeam.id === mine.id
                  ? "Your team"
                  : `${rightTeam.wins}-${rightTeam.losses}-${rightTeam.ties}`}
              </span>
            </div>
            <TeamBadge team={rightTeam} />
          </div>
        </div>
        <div className="category-grid">
          {CATEGORIES.map((c) => {
            const a = left.stats[c],
              b = right.stats[c];
            const known = a != null && b != null;
            const won = known && (c === "TO" ? a < b : a > b);
            const tied = known && a === b;
            const share =
              known && a + b > 0
                ? Math.max(8, Math.min(92, (100 * a) / (a + b)))
                : 50;
            return (
              <div
                key={c}
                className={`category ${known ? (tied ? "tied" : won ? "winning" : "losing") : ""}`}
              >
                <div className="category-name">
                  {c}
                  {known && won && <Check size={12} />}
                </div>
                <div className="category-values">
                  <strong>{stat(a, c)}</strong>
                  <span>{stat(b, c)}</span>
                </div>
                <div className="comparison-track">
                  <span style={{ width: `${share}%` }} />
                  <i />
                </div>
                {full && (
                  <small>
                    {categoryLabels[c]}
                    {c === "TO" ? " · Fewer wins" : ""}
                  </small>
                )}
              </div>
            );
          })}
        </div>
        <div className="matchup-footer">
          <span>
            <span className="legend-dot blue" />
            {leftTeam.abbrev} <span className="legend-dot orange" />
            {rightTeam.abbrev}
            <span className="lower-note">Lower turnovers win</span>
          </span>
          {!full && (
            <button className="text-button" onClick={() => go("matchup")}>
              Matchup details <ChevronRight size={15} />
            </button>
          )}
        </div>
      </section>
    );
  }
  function newsList(limit = 100) {
    if (!news.length)
      return (
        <div className="news-empty">
          <Newspaper size={27} />
          <h3>
            {data.mode === "demo"
              ? "News connects with your league."
              : "No matching headlines yet."}
          </h3>
          <p>
            {data.mode === "demo"
              ? "ESPN and RotoWire headlines will appear here after your first import."
              : "New headlines appear after the next successful news sync."}
          </p>
          {data.mode === "demo" && (
            <button className="text-button" onClick={() => go("connection")}>
              Connection status <ChevronRight size={15} />
            </button>
          )}
        </div>
      );
    return (
      <div className="news-list">
        {news.slice(0, limit).map((n) => (
          <a key={n.id} href={n.url} target="_blank" rel="noopener noreferrer">
            <div className="news-source">
              {n.source}
              <span>
                {n.publishedAt
                  ? new Date(n.publishedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      timeZone: "America/Los_Angeles",
                    })
                  : "Date unavailable"}
              </span>
            </div>
            <h3>
              {n.title}
              <ArrowUpRight size={15} />
            </h3>
            {n.playerIds.length > 0 && (
              <small>
                {n.playerIds
                  .map((id) => data.players.find((p) => p.id === id)?.name)
                  .filter(Boolean)
                  .join(", ")}
              </small>
            )}
          </a>
        ))}
      </div>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" onClick={() => go("overview")}>
          <span className="brand-mark">
            9<span />
          </span>
          <span>
            ninecat<span className="brand-period">.</span>
          </span>
        </a>
        <div className="league-selector">
          <span className="league-icon">
            <Trophy size={18} />
          </span>
          <div>
            <strong>{data.league.name}</strong>
            <small>{data.teams.length} teams · 9 categories</small>
          </div>
        </div>
        <nav aria-label="Main navigation">
          {nav.map(([key, label, Icon]) => (
            <a
              key={key}
              aria-label={label}
              href={`#${key}`}
              onClick={() => {
                if (key === "team") setTeamId(mine.id);
                go(key);
              }}
              className={view === key ? "active" : ""}
            >
              <Icon size={19} />
              <span>{label}</span>
              {key === "news" && data.news.length > 0 && (
                <span className="nav-count">{data.news.length}</span>
              )}
            </a>
          ))}
          <a
            className="mobile-connection"
            aria-label="Connection"
            href="#connection"
            onClick={() => go("connection")}
          >
            <Settings2 size={19} />
            <span>Connection</span>
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="read-only">
            <ShieldCheck size={17} />
            <span>Read-only by design</span>
          </div>
          <a href="#connection" onClick={() => go("connection")}>
            <Settings2 size={17} />
            Connection
          </a>
          <a href={espn} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={17} />
            Open ESPN
          </a>
          <div className="sidebar-team">
            <TeamBadge team={mine} small />
            <div>
              <strong>{mine.name}</strong>
              <small>Your team</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            Fantasy basketball <ChevronRight size={14} />{" "}
            <strong>
              {data.league.season - 1}–{String(data.league.season).slice(2)}
            </strong>
          </span>
          <div className="top-actions">
            <label className="global-search">
              <Search size={16} />
              <input
                aria-label="Search players"
                placeholder="Search players…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  go("players");
                }}
              />
            </label>
            <span className="user-avatar">{mine.abbrev}</span>
          </div>
        </header>
        <main className="main-content" id="main-content">
          {data.mode === "demo" ? (
            <div className="demo-banner">
              <span>
                <span className="status-dot" />
                <strong>Demo league</strong> Fictional players and sample stats.
                Your ESPN league is not connected yet.
              </span>
              <button onClick={() => go("connection")}>
                Connect your league <ChevronRight size={14} />
              </button>
            </div>
          ) : (
            (syncFailure || stale) && (
              <div className="warning-banner">
                {syncFailure ??
                  "Data is more than 15 minutes old. Showing the last successful import."}
              </div>
            )
          )}
          <div className="page-heading">
            <div>
              <p className="page-context">
                {view === "overview"
                  ? `Week ${data.league.matchupPeriod} · Head-to-head, 9-cat`
                  : (nav.find((n) => n[0] === view)?.[1] ?? "League settings")}
              </p>
              <h1>{titles[view]}</h1>
            </div>
            <button
              className="refresh-button"
              onClick={() => {
                setRefreshing(true);
                window.location.reload();
              }}
              disabled={refreshing}
            >
              <RefreshCw size={14} />
              {refreshing
                ? "Loading…"
                : data.mode === "demo"
                  ? "Refresh view"
                  : minutes > 0
                    ? `Updated ${minutes}m ago`
                    : "Just updated"}
            </button>
          </div>
          {view === "overview" && (
            <>
              {matchupBoard()}
              <div className="summary-strip">
                <div>
                  <span>League standing</span>
                  <strong>
                    {mine.standing
                      ? `${mine.standing}${mine.standing === 1 ? "st" : mine.standing === 2 ? "nd" : mine.standing === 3 ? "rd" : "th"}`
                      : "—"}{" "}
                    <small>of {data.teams.length}</small>
                  </strong>
                  <button onClick={() => go("league")}>
                    View standings <ChevronRight size={13} />
                  </button>
                </div>
                <div>
                  <span>Roster talent rank</span>
                  <strong>
                    {mine.talentRank ? `#${mine.talentRank}` : "—"}
                    <small>of {fullyRatedTeams} fully rated teams</small>
                  </strong>
                  <button onClick={() => go("rankings")}>
                    Explore rankings <ChevronRight size={13} />
                  </button>
                </div>
                <div>
                  <span>Roster watch</span>
                  <strong>
                    {alerts.length}
                    <small>
                      injury {alerts.length === 1 ? "flag" : "flags"}
                    </small>
                  </strong>
                  <button
                    onClick={() => {
                      setTeamId(mine.id);
                      go("team");
                    }}
                  >
                    {alerts.length ? "Review your roster" : "See your team"}{" "}
                    <ChevronRight size={13} />
                  </button>
                </div>
                <div>
                  <span>Available players</span>
                  <strong>
                    {available}
                    <small>free agents & waivers</small>
                  </strong>
                  <button
                    onClick={() => {
                      setAvailability("available");
                      go("players");
                    }}
                  >
                    Explore players <ChevronRight size={13} />
                  </button>
                </div>
              </div>
              <div className="overview-columns">
                <section className="panel roster-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Your roster</h2>
                      <p>Season averages. Tap a player for the full picture.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => {
                        setTeamId(mine.id);
                        go("team");
                      }}
                    >
                      All players <ChevronRight size={15} />
                    </button>
                  </div>
                  {playerTable(sortedPlayers(myRoster).slice(0, 7), true)}
                </section>
                <section className="panel">
                  <div className="panel-title">
                    <h2>League pulse</h2>
                    <Newspaper size={18} />
                  </div>
                  {newsList(4)}
                  <div className="panel-bottom">
                    <button className="text-button" onClick={() => go("news")}>
                      All news <ChevronRight size={15} />
                    </button>
                  </div>
                </section>
              </div>
              <section className="panel league-peek">
                <div className="panel-title">
                  <div>
                    <h2>The talent board</h2>
                    <p>Roster value, independent of the standings.</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => go("rankings")}
                  >
                    Full rankings <ChevronRight size={15} />
                  </button>
                </div>
                <div className="peek-teams">
                  {rankedTeams.slice(0, 4).map((t, i) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTeamId(t.id);
                        go("team");
                      }}
                    >
                      <span className="peek-rank">{t.talentRank ?? "—"}</span>
                      <TeamBadge team={t} small />
                      <div>
                        <strong>{t.name}</strong>
                        <small>
                          {t.rankedPlayers}/{t.rosterSize} players rated
                        </small>
                      </div>
                      <span>{t.talent?.toFixed(1) ?? "—"}</span>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}
          {view === "matchup" && (
            <>
              <div className="matchup-picker">
                {data.matchups.map((m) => (
                  <button
                    className={m.id === matchupId ? "selected" : ""}
                    key={m.id}
                    onClick={() => setMatchupId(m.id)}
                  >
                    {data.teams.find((t) => t.id === m.home.teamId)?.abbrev}
                    <span>
                      {m.home.wins ?? "—"} : {m.away.wins ?? "—"}
                    </span>
                    {data.teams.find((t) => t.id === m.away.teamId)?.abbrev}
                  </button>
                ))}
              </div>
              {matchupBoard(true)}
              <div className="explanation">
                <Clock3 size={20} />
                <div>
                  <h3>Actual results, straight from ESPN.</h3>
                  <p>
                    Totals reflect ESPN’s scored lineups for this matchup.
                    Roster changes and stat corrections appear after the next
                    sync. Weekly forecasts are not included in this first
                    release.
                  </p>
                </div>
              </div>
            </>
          )}
          {view === "team" && (
            <>
              <div className="team-toolbar">
                <label>
                  Team{" "}
                  <select
                    value={teamId}
                    onChange={(e) => setTeamId(Number(e.target.value))}
                  >
                    {data.teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <span>
                  {roster.length} players · {team.wins}-{team.losses}-
                  {team.ties}
                </span>
              </div>
              <div className="profile-strip">
                {CATEGORIES.map((c) => (
                  <div key={c}>
                    <span>{c}</span>
                    <strong
                      className={
                        (team.categoryProfile[c] ?? 0) >= 0
                          ? "positive"
                          : "negative"
                      }
                    >
                      {(team.categoryProfile[c] ?? 0) > 0 ? "+" : ""}
                      {team.categoryProfile[c]?.toFixed(1) ?? "—"}
                    </strong>
                  </div>
                ))}
              </div>
              <p className="table-note">
                Category contributions from {team.rankedPlayers}/
                {team.rosterSize} rated players. Includes bench and injured
                players; this is roster talent, not a weekly forecast.
              </p>
              <section className="panel">
                {playerTable(sortedPlayers(roster))}
              </section>
            </>
          )}
          {view === "players" && (
            <>
              <div className="filters">
                <label className="search-field">
                  <Search size={17} />
                  <input
                    aria-label="Filter players by name"
                    placeholder="Player name"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Availability"
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value)}
                >
                  <option value="all">All players</option>
                  <option value="available">Available players</option>
                  <option value="mine">My roster</option>
                </select>
                <select
                  aria-label="Position"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                >
                  <option value="all">All positions</option>
                  {["PG", "SG", "SF", "PF", "C"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
                <span>{visiblePlayers.length} players</span>
                <button
                  className="text-button"
                  onClick={() => {
                    setQuery("");
                    setPosition("all");
                    setAvailability("all");
                  }}
                >
                  Reset
                </button>
              </div>
              <section className="panel">{playerTable(visiblePlayers)}</section>
              <p className="table-note">
                Power is a percentile against the fixed {data.model.poolSize}
                -player reference pool. Minimum {data.model.minimumGames} games.
                Stats are season averages; missing stats remain blank.
              </p>
            </>
          )}
          {view === "league" && (
            <section className="panel">
              <div className="panel-title">
                <div>
                  <h2>Standings</h2>
                  <p>
                    {data.league.scoringType === "H2H_CATEGORY"
                      ? "Each category counts toward the record."
                      : "Weekly matchup results determine the record."}
                  </p>
                </div>
                <span className="pill">ESPN standings</span>
              </div>
              <div className="table-scroll">
                <table className="league-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Team</th>
                      <th>W</th>
                      <th>L</th>
                      <th>T</th>
                      <th>Roster talent</th>
                      <th>Players rated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.teams]
                      .sort((a, b) => (a.standing ?? 999) - (b.standing ?? 999))
                      .map((t) => (
                        <tr key={t.id}>
                          <td>{t.standing ?? "—"}</td>
                          <td>
                            <button
                              className="team-link"
                              onClick={() => {
                                setTeamId(t.id);
                                go("team");
                              }}
                            >
                              <TeamBadge team={t} small />
                              <strong>{t.name}</strong>
                              {t.id === mine.id && (
                                <span className="you-tag">You</span>
                              )}
                            </button>
                          </td>
                          <td>{t.wins}</td>
                          <td>{t.losses}</td>
                          <td>{t.ties}</td>
                          <td>{t.talentRank ? `#${t.talentRank}` : "—"}</td>
                          <td>
                            {t.rankedPlayers}/{t.rosterSize}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {view === "rankings" && (
            <>
              <div className="ranking-intro">
                <div>
                  <h2>Roster talent</h2>
                  <p className="coverage-note">
                    {fullyRatedTeams} of {data.teams.length} teams have complete
                    ratings. Unrated teams are not included in the rank.
                  </p>
                  <p>
                    A transparent first look at team strength. Sum of each
                    player’s nine-category value, including bench and injured
                    players.
                  </p>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => setShowMethod(!showMethod)}
                >
                  <CircleHelp size={16} />
                  {showMethod ? "Hide methodology" : "How it works"}
                </button>
              </div>
              {showMethod && (
                <div className="methodology">
                  <h3>Every score has a reason.</h3>
                  <p>
                    We standardize per-game counting stats against a fixed
                    fantasy-relevant player pool. Turnovers are reversed.
                    Shooting impact is makes minus baseline percentage ×
                    attempts, so volume matters. The nine z-scores sum to player
                    value; power displays its reference-pool percentile.
                  </p>
                  <p>
                    Reference pool: {data.model.poolSize} players.{" "}
                    {data.model.poolRule}. At least {data.model.minimumGames}{" "}
                    games required. A team with incomplete player ratings
                    receives no talent rank. This model is descriptive, not a
                    forecast or win probability.
                  </p>
                </div>
              )}
              <section className="panel">
                <div className="table-scroll">
                  <table className="heatmap">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Team</th>
                        <th>Talent</th>
                        {CATEGORIES.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rankedTeams.map((t) => (
                        <tr key={t.id}>
                          <td className="rank-num">{t.talentRank ?? "—"}</td>
                          <td>
                            <button
                              className="team-link"
                              onClick={() => {
                                setTeamId(t.id);
                                go("team");
                              }}
                            >
                              <TeamBadge team={t} small />
                              <strong>{t.name}</strong>
                            </button>
                          </td>
                          <td>
                            <strong>{t.talent?.toFixed(1) ?? "—"}</strong>
                          </td>
                          {CATEGORIES.map((c) => {
                            const v = t.categoryProfile[c] ?? 0;
                            return (
                              <td key={c}>
                                <span
                                  className={`heat ${v >= 0 ? "positive" : "negative"}`}
                                  style={{
                                    background:
                                      v >= 0
                                        ? `rgba(38,114,91,${Math.min(0.28, 0.04 + Math.abs(v) * 0.025)})`
                                        : `rgba(197,104,61,${Math.min(0.24, 0.04 + Math.abs(v) * 0.025)})`,
                                  }}
                                >
                                  {v > 0 ? "+" : ""}
                                  {v.toFixed(1)}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <p className="table-note">
                Category totals use only rated players. Positive values indicate
                above-baseline contributions; negative values indicate
                below-baseline contributions. Weekly team power is the next
                model milestone.
              </p>
            </>
          )}
          {view === "news" && (
            <>
              <div className="segmented">
                <button
                  className={newsScope === "all" ? "selected" : ""}
                  onClick={() => setNewsScope("all")}
                >
                  All league news
                </button>
                <button
                  className={newsScope === "mine" ? "selected" : ""}
                  onClick={() => setNewsScope("mine")}
                >
                  My players
                </button>
              </div>
              <section className="panel news-page">{newsList()}</section>
              <p className="table-note">
                Headlines link to their original publisher. Feeds may omit
                stories; player matching uses full names where source IDs are
                unavailable.
              </p>
            </>
          )}
          {view === "connection" && (
            <div className="connection-grid">
              <section className="panel connection-card">
                <ShieldCheck size={32} />
                <h2>
                  {data.mode === "demo"
                    ? "Ready for your league."
                    : "Your ESPN league is connected."}
                </h2>
                <p>
                  {data.mode === "demo"
                    ? "You’re exploring a fictional league. Connect ESPN to replace this sample with your teams, players and matchups."
                    : "ESPN remains the source of truth. This dashboard only reads league data."}
                </p>
                <dl>
                  <div>
                    <dt>League ID</dt>
                    <dd>{data.league.id}</dd>
                  </div>
                  <div>
                    <dt>Season</dt>
                    <dd>{data.league.season}</dd>
                  </div>
                  <div>
                    <dt>Mode</dt>
                    <dd>
                      {data.mode === "demo" ? "Demo data" : "Live import"}
                    </dd>
                  </div>
                  <div>
                    <dt>Last league import</dt>
                    <dd>
                      {data.mode === "demo"
                        ? "Not connected"
                        : new Date(data.syncedAt).toLocaleString("en-US", {
                            timeZone: "America/Los_Angeles",
                          }) + " PT"}
                    </dd>
                  </div>
                  <div>
                    <dt>Player coverage</dt>
                    <dd>
                      {data.coverage.playerCount}{" "}
                      {data.mode === "demo" ? "sample" : "imported"} players
                    </dd>
                  </div>
                </dl>
                <a
                  className="primary-button"
                  href={espn}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open your ESPN league <ExternalLink size={15} />
                </a>
              </section>
              <section className="panel connection-card">
                <h2>Private by default.</h2>
                <p>
                  ESPN access is configured by the site owner on the server.
                  Your ESPN password is never requested by this dashboard, and
                  account cookies never reach the browser.
                </p>
                <h3>For the site owner</h3>
                <p>
                  Follow the repository’s connection guide to configure session
                  cookies, run an import, and switch from demo to live data.
                </p>
                <a
                  className="text-button"
                  href="https://github.com/andy98w/fantasy/blob/main/docs/CONNECT_ESPN.md"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Connection guide <ArrowUpRight size={16} />
                </a>
                <h3>Data quality notes</h3>
                <ul>
                  {data.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>
              ninecat. <span>Your league, a clearer view.</span>
            </span>
            <span>
              {data.mode === "demo"
                ? "Demo data · Not connected to ESPN"
                : "Read-only · Data from ESPN"}
              <span className="footer-dot" /> {data.model.version}
            </span>
          </footer>
        </main>
      </div>
      <dialog
        ref={modalRef}
        className="player-dialog"
        aria-label="Player details"
        onCancel={() => setSelected(null)}
        onClick={(e) => {
          if (e.target === modalRef.current) setSelected(null);
        }}
      >
        {selected && (
          <>
            <button
              className="dialog-close"
              aria-label="Close player details"
              onClick={() => setSelected(null)}
            >
              <X size={20} />
            </button>
            <div className="player-dialog-header">
              <PlayerAvatar player={selected} />
              <div>
                <p>
                  {selected.nbaTeam} · {selected.position}
                </p>
                <h2>{selected.name}</h2>
                <span
                  className={`status ${selected.status === "ACTIVE" ? "healthy" : "injured"}`}
                >
                  {statusText(selected.status)}
                </span>
              </div>
              <Power value={selected.power} />
            </div>
            <div className="player-meta">
              <span>
                <strong>{selected.gamesPlayed}</strong> games played
              </span>
              <span>
                <strong>{selected.rank ? `#${selected.rank}` : "—"}</strong>{" "}
                player rank
              </span>
              <span>
                <strong>{selected.zTotal?.toFixed(2) ?? "—"}</strong> total
                value
              </span>
            </div>
            <h3>Where the value comes from</h3>
            <p className="subtle">
              Category z-scores. Positive is better, including turnovers.
            </p>
            <div className="contribution-list">
              {CATEGORIES.map((c) => {
                const z = selected.contributions[c];
                return (
                  <div key={c}>
                    <span>{c}</span>
                    <span>{stat(selected.stats[c], c)}</span>
                    <div className="contribution-track">
                      <i />
                      <span
                        className={z >= 0 ? "positive-bar" : "negative-bar"}
                        style={{
                          left:
                            z >= 0
                              ? "50%"
                              : `${50 - Math.min(50, Math.abs(z ?? 0) * 12)}%`,
                          width: `${Math.min(50, Math.abs(z ?? 0) * 12)}%`,
                        }}
                      />
                    </div>
                    <strong>
                      {z == null ? "—" : `${z > 0 ? "+" : ""}${z.toFixed(2)}`}
                    </strong>
                  </div>
                );
              })}
            </div>
            <p className="table-note">
              {selected.gamesPlayed < 10
                ? "Small sample: interpret early-season rankings cautiously. "
                : ""}
              {selected.power === null
                ? "Not enough complete data to rank this player."
                : "Power is a percentile, not a forecast."}
            </p>
            {data.news
              .filter((n) => n.playerIds.includes(selected.id))
              .slice(0, 3)
              .map((n) => (
                <a
                  className="player-news"
                  key={n.id}
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {n.title}
                  <ArrowUpRight size={14} />
                </a>
              ))}
          </>
        )}
      </dialog>
    </div>
  );
}
