import { CATEGORIES, type Category, type Matchup, type Snapshot, type Team } from "./schema";
type Side = Matchup["home"];
export function seasonMatchups(data: Pick<Snapshot, "matchups" | "matchupHistory">): Matchup[] {
  const matches = new Map(data.matchupHistory.filter(m => m.result !== "UNDECIDED").map(m => [m.id, m]));
  for (const m of data.matchups) matches.set(m.id, m);
  return [...matches.values()].sort((a, b) => a.period - b.period || a.id - b.id);
}
export function compareCategories(a: Side["stats"], b: Side["stats"], categories: readonly Category[] = CATEGORIES) {
  let home = 0, away = 0, ties = 0, missing = 0;
  for (const c of categories) {
    const x = a[c], y = b[c];
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) { missing++; continue; }
    if (Math.abs(x - y) < 1e-10) ties++;
    else if (c === "TO" ? x < y : x > y) home++;
    else away++;
  }
  return { home, away, ties, missing };
}
export function weekSides(matches: Matchup[], period: number) {
  const sides = new Map<number, Side>();
  const duplicates = new Set<number>();
  for (const m of matches.filter(m => m.period === period)) for (const side of [m.home, m.away]) {
    if (sides.has(side.teamId)) duplicates.add(side.teamId);
    sides.set(side.teamId, side);
  }
  // A duplicate team/week is ambiguous, not two independent performances to add together.
  for (const id of duplicates) sides.delete(id);
  return sides;
}
export function allPlay(teams: Team[], matches: Matchup[], period: number, categories: readonly Category[]) {
  const sides = weekSides(matches, period);
  const ready = teams.filter(t => {
    const stats = sides.get(t.id)?.stats;
    return categories.length > 0 && stats && categories.every(c => stats[c] != null && Number.isFinite(stats[c]));
  });
  const rows = ready.map(team => {
    let wins = 0, losses = 0, ties = 0, categoryWins = 0;
    for (const other of ready) if (other.id !== team.id) {
      const score = compareCategories(sides.get(team.id)!.stats, sides.get(other.id)!.stats, categories);
      categoryWins += score.home;
      if (score.home > score.away) wins++;
      else if (score.home < score.away) losses++;
      else ties++;
    }
    return { team, wins, losses, ties, categoryWins, points: wins + ties / 2, games: ready.length - 1, rank: 0 };
  }).sort((a, b) => b.points - a.points || a.team.id - b.team.id);
  rows.forEach((row, i) => { row.rank = i && row.points === rows[i - 1].points ? rows[i - 1].rank : i + 1; });
  return { rows: ready.length > 1 ? rows : [], missing: teams.filter(t => !ready.includes(t)) };
}
export function rivalry(matches: Matchup[], a: number, b: number) {
  const meetings = matches.filter(m => m.result !== "UNDECIDED" && [m.home.teamId, m.away.teamId].includes(a) && [m.home.teamId, m.away.teamId].includes(b) && a !== b);
  let wins = 0, losses = 0, ties = 0;
  let categoriesFor = 0, categoriesAgainst = 0;
  for (const m of meetings) {
    const home = m.home.teamId === a;
    const score = compareCategories(home ? m.home.stats : m.away.stats, home ? m.away.stats : m.home.stats);
    if (!score.missing) { categoriesFor += score.home; categoriesAgainst += score.away; }
    if (m.result === "TIE") ties++;
    else if ((m.result === "HOME") === home) wins++;
    else losses++;
  }
  const margins = meetings.flatMap(m => {
    const score = compareCategories(m.home.stats, m.away.stats);
    return score.missing ? [] : [{ id: m.id, margin: Math.abs(score.home - score.away) }];
  });
  const closest = Math.min(...margins.map(m => m.margin));
  return { meetings: [...meetings].reverse(), wins, losses, ties, categoriesFor, categoriesAgainst,
    closestIds: margins.filter(m => m.margin === closest).map(m => m.id) };
}
export type RecordHolder = { teamId: number; period: number; matchupId: number };
export type LeagueRecord = { id: string; name: string; label: string; value: number; percent?: boolean; dubious?: boolean; holders: RecordHolder[]; newRecord: boolean };
export function leagueRecords(matches: Matchup[]): LeagueRecord[] {
  const definitions = [
    { id: "PTS", name: "Bucket Machine", label: "points", stat: "PTS" },
    { id: "BLK", name: "Block Party", label: "blocks", stat: "BLK" },
    { id: "AST", name: "Dime Dealer", label: "assists", stat: "AST" },
    { id: "REB", name: "Board Boss", label: "rebounds", stat: "REB" },
    { id: "STL", name: "Pickpocket", label: "steals", stat: "STL" },
    { id: "3PM", name: "Rainmaker", label: "threes", stat: "3PM" },
    { id: "MISSES", name: "Brick Factory", label: "missed field goals", stat: "MISSES", dubious: true },
    { id: "TO", name: "Butterfingers", label: "turnovers", stat: "TO", dubious: true },
    { id: "FG%", name: "Cold Spell", label: "FG% · 50+ attempts", stat: "FG%", dubious: true, lower: true, percent: true },
  ];
  const candidates = matches.flatMap(m => [m.home, m.away].map(side => ({ side, teamId: side.teamId, period: m.period, matchupId: m.id })));
  const choose = (id: string, name: string, label: string, xs: (RecordHolder & { value: number })[], lower = false, rest = {}): LeagueRecord[] => {
    if (!xs.length) return [];
    const value = (lower ? Math.min : Math.max)(...xs.map(x => x.value));
    const holders = xs.filter(x => Math.abs(x.value - value) < 1e-10);
    const first = Math.min(...holders.map(x => x.period));
    const latest = Math.max(...matches.map(m => m.period));
    return [{ id, name, label, value, holders, newRecord: first === latest && xs.some(x => x.period < latest), ...rest }];
  };
  const records = definitions.flatMap(d => {
    const xs = candidates.flatMap(({ side, ...holder }) => {
      const s = side.stats;
      const value = d.stat === "MISSES" ? s.FGA != null && s.FGM != null ? s.FGA - s.FGM : null : s[d.stat];
      if (value == null || !Number.isFinite(value) || value < 0 || (!d.lower && value === 0) || (d.percent && (s.FGA ?? 0) < 50)) return [];
      return [{ ...holder, value }];
    });
    return choose(d.id, d.name, d.label, xs, d.lower, { percent: d.percent, dubious: d.dubious });
  });
  const wins = matches.flatMap(m => {
    const score = compareCategories(m.home.stats, m.away.stats);
    if (score.missing || score.home === score.away) return [];
    return [{ teamId: score.home > score.away ? m.home.teamId : m.away.teamId, period: m.period, matchupId: m.id, value: Math.abs(score.home - score.away) }];
  });
  records.push(...choose("blowout", "Demolition", "category margin", wins), ...choose("close", "By a Thread", "category margin", wins, true));
  // Ties and losses end a winning streak. Only actual completed matchups count.
  const runs = new Map<number, number>(), streaks: (RecordHolder & { value: number })[] = [];
  for (const m of [...matches].filter(m => m.result !== "UNDECIDED").sort((a, b) => a.period - b.period || a.id - b.id)) {
    for (const side of ["home", "away"] as const) {
      const id = m[side].teamId, won = m.result === side.toUpperCase();
      const value = won ? (runs.get(id) ?? 0) + 1 : 0;
      runs.set(id, value);
      if (value) streaks.push({ teamId: id, period: m.period, matchupId: m.id, value });
    }
  }
  records.push(...choose("streak", "On a Roll", "consecutive wins", streaks));
  return records;
}
