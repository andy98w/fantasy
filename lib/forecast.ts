import { CATEGORIES, type ForecastSchedule, type Matchup, type Player, type Snapshot } from "./schema";
import { nbaAbbrev, nbaDate, type TodayData } from "./nba";
import { compareCategories, weekSides } from "./season";
import { availabilityReason, isUncertain, type AvailabilityScenario } from "./availability";

const COUNTS = ["PTS", "REB", "AST", "STL", "BLK", "3PM", "TO", "FGM", "FGA", "FTM", "FTA"] as const;
export type AvailabilityAssumption = { playerId: number; name: string; status: string; slot: string | null; reason: string };
export type ProjectionOptions = { scenario?: AvailabilityScenario };
export type ForecastWindow = ForecastSchedule["windows"][number];
export type Projection = {
  scenario: AvailabilityScenario;
  availabilityAsOf: string;
  assumptions: AvailabilityAssumption[];
  activationPlayerIds: number[];
  activationSlotsNeeded: number;
  exclusions: { playerId: number; date: string; reason: string }[];
  side: Matchup["home"];
  games: number;
  liveGames: number;
  benched: number;
  excluded: Player[];
  missing: Player[];
  issue: string | null;
  players: { player: Player; games: number }[];
  days: { date: string; lockedSlots: number; selectedPlayerIds: number[]; openSlots: string[]; benchedPlayerIds: number[] }[];
};

// Bipartite assignment, maximizing filled legal slots first, then player power.
// Greedy selection fails when a multi-position player takes a specialist's slot.
export function dailyLineupPlan(players: Player[], slots: string[]) {
  if (slots.length > 12) return { players: [] as Player[], openSlots: [] as string[] };
  type Choice = { score: number; players: Player[] };
  let states = new Map<number, Choice>([[0, { score: 0, players: [] }]]);
  for (const player of [...players].sort((a, b) => a.id - b.id)) {
    const next = new Map(states);
    for (const [mask, choice] of states) for (let i = 0; i < slots.length; i++) {
      if ((mask & (1 << i)) || !player.eligibleSlots.includes(slots[i])) continue;
      const target = mask | (1 << i), score = choice.score + (player.zTotal ?? 0);
      if (!next.has(target) || score > next.get(target)!.score)
        next.set(target, { score, players: [...choice.players, player] });
    }
    states = next;
  }
  const [mask, choice] = [...states.entries()].sort((a, b) => b[1].players.length - a[1].players.length || b[1].score - a[1].score)[0];
  return { players: choice.players, openSlots: slots.filter((_, index) => !(mask & (1 << index))) };
}

export function dailyLineup(players: Player[], slots: string[]): Player[] {
  return dailyLineupPlan(players, slots).players;
}

export function scheduledOpponent(schedule: ForecastSchedule | null, period: number, team: number): number | undefined {
  const matches = schedule?.pairs.filter(p => p.period === period && (p.home === team || p.away === team)) ?? [];
  if (matches.length !== 1) return undefined;
  return matches[0].home === team ? matches[0].away : matches[0].home;
}

export function projectTeam(data: Snapshot, teamId: number, window: ForecastWindow, now: number, today?: TodayData, options: ProjectionOptions = {}): Projection {
  const roster = data.players.filter(p => p.teamId === teamId);
  const scenario = options.scenario ?? "conservative";
  const affected = roster.filter(p => p.slot === "IR" || p.status !== "ACTIVE");
  const excluded: Player[] = [];
  const date = nbaDate(new Date(now));
  const canPlay = (p: Player, day: string) => {
    if (p.slot !== "IR" && p.status === "ACTIVE") return true;
    if (scenario === "conservative") return false;
    // A hypothetical return never overrides today's OUT status or IR placement.
    return day > date || (p.slot !== "IR" && isUncertain(p));
  };
  const result: Projection = {
    side: { teamId, wins: null, ties: null, stats: {}, performers: [], performanceComplete: false },
    scenario, availabilityAsOf: data.syncedAt,
    assumptions: affected.map(p => ({ playerId: p.id, name: p.name, status: p.status, slot: p.slot, reason: availabilityReason(p) })),
    activationPlayerIds: [], activationSlotsNeeded: 0, exclusions: [],
    games: 0, liveGames: 0, benched: 0, excluded, missing: [], issue: null, players: [], days: [],
  };
  const fail = (issue: string) => {
    result.issue = issue;
    result.side.stats = {};
    result.games = result.liveGames = result.benched = 0;
    result.players = []; result.days = [];
    return result;
  };
  const schedule = data.forecastSchedule;
  if (!schedule) return fail("Schedule unavailable.");
  const current = window.period === data.league.matchupPeriod;
  if (date > window.end || (current && date < window.start) || (!current && date >= window.start)) return fail("Waiting for the next league sync.");
  if (current && Math.abs(now - Date.parse(data.matchupSyncedAt ?? data.syncedAt)) > 15 * 60_000) return fail("Waiting for fresh matchup totals.");
  if (current && schedule.lineupDate !== date) return fail("Waiting for today’s lineups.");
  const activeCapacity = Object.entries(data.league.rosterSlots).filter(([slot]) => slot !== "IR").reduce((sum, [, n]) => sum + n, 0);
  const activeCount = roster.filter(p => p.slot !== "IR").length;
  if (activeCount > activeCapacity) return fail(`Roster needs ${activeCount - activeCapacity} non-IR roster slot(s) freed before projecting.`);
  const totals: Record<string, number | null> = Object.fromEntries(COUNTS.map(c => [c, 0]));
  if (current) {
    const actual = weekSides(data.matchups, window.period).get(teamId)?.stats;
    if (!actual || COUNTS.some(c => actual[c] == null || !Number.isFinite(actual[c]) || actual[c]! < 0))
      return fail("Current matchup totals unavailable.");
    for (const c of COUNTS) totals[c] = actual[c]!;
  }
  const counts = new Map<number, number>();
  const add = (player: Player, fraction: number) => {
    if (!(fraction > 0)) return;
    counts.set(player.id, (counts.get(player.id) ?? 0) + fraction);
    const valid = player.gamesPlayed > 0 && COUNTS.every(c => player.stats[c] != null && Number.isFinite(player.stats[c]) && player.stats[c]! >= 0)
      && player.stats.FGM! <= player.stats.FGA! && player.stats.FTM! <= player.stats.FTA!;
    if (!valid) { if (!result.missing.includes(player)) result.missing.push(player); return; }
    for (const c of COUNTS) totals[c]! += player.stats[c]! * fraction;
  };
  const days = [...new Set(schedule.games.filter(g => g.date >= window.start && g.date <= window.end && (!current || g.date >= date)).map(g => g.date))].sort();
  for (const day of days) {
    const games = schedule.games.filter(g => g.date === day);
    const gameFor = (p: Player) => games.find(g => [nbaAbbrev(g.home), nbaAbbrev(g.away)].includes(nbaAbbrev(p.nbaTeam)));
    const returning = roster.filter(p => p.slot === "IR" && canPlay(p, day) && gameFor(p));
    for (const p of returning) if (!result.activationPlayerIds.includes(p.id)) result.activationPlayerIds.push(p.id);
    // Once activated, a player keeps their roster place for this scenario.
    result.activationSlotsNeeded = Math.max(0, activeCount + result.activationPlayerIds.length - activeCapacity);
    if (result.activationSlotsNeeded) return fail(`IR return scenario needs ${result.activationSlotsNeeded} non-IR roster slot(s) freed. No drops assumed.`);
    const slots = [...schedule.slots];
    const candidates: Player[] = [];
    for (const player of roster) {
      const game = gameFor(player);
      if (!game) continue;
      const available = canPlay(player, day);
      if (!available) {
        if (!excluded.includes(player)) excluded.push(player);
        result.exclusions.push({ playerId: player.id, date: day, reason: availabilityReason(player) });
      }
      if (player.slot === "IR" && !available) continue;
      const live = day === date ? today?.games.find(g => g.id === game.id) : undefined;
      if (live && ["postponed", "cancelled", "suspended"].includes(live.state)) continue;
      const started = day === date && (Date.parse(game.startsAt) <= now || (live && ["live", "final"].includes(live.state)));
      if (started && current) {
        // A started player keeps their actual slot, even when their game is final.
        if (player.slot === null) return fail("Today’s lineup is incomplete.");
        if (player.slot === "BE") continue;
        const slot = slots.indexOf(player.slot);
        if (slot < 0) return fail("Today’s lineup could not be verified.");
        slots.splice(slot, 1);
        const fresh = today?.status === "ready" && today.date === date && today.fetchedAt && Math.abs(now - Date.parse(today.fetchedAt)) < 90_000;
        if (!fresh || !live || live.remainingFraction == null) return fail("Live game status unavailable.");
        if (live.state === "live" && available) { result.liveGames++; add(player, live.remainingFraction); }
      } else if (available) {
        candidates.push(player);
      }
    }
    const plan = dailyLineupPlan(candidates, slots), selected = plan.players;
    result.days.push({ date: day, lockedSlots: schedule.slots.length - slots.length, selectedPlayerIds: selected.map(p => p.id), openSlots: plan.openSlots, benchedPlayerIds: candidates.filter(p => !selected.includes(p)).map(p => p.id) });
    result.games += selected.length;
    result.benched += candidates.length - selected.length;
    for (const player of selected) add(player, 1);
  }
  result.players = [...counts].map(([id, games]) => ({ player: roster.find(p => p.id === id)!, games })).sort((a, b) => b.games - a.games || a.player.id - b.player.id);
  // Missing baselines must not look like zero production or a definitive winner.
  if (result.missing.length) return fail("Some players need more stats.");
  totals["FG%"] = totals.FGA! > 0 ? totals.FGM! / totals.FGA! : null;
  totals["FT%"] = totals.FTA! > 0 ? totals.FTM! / totals.FTA! : null;
  // Compare the displayed precision, so visually identical projections tie.
  for (const c of Object.keys(totals)) if (totals[c] != null)
    totals[c] = Math.round(totals[c]! * (c.includes("%") ? 1000 : 10)) / (c.includes("%") ? 1000 : 10);
  result.side.stats = totals;
  return result;
}

export function forecastScore(home: Projection, away: Projection) {
  return home.issue || away.issue ? null : compareCategories(home.side.stats, away.side.stats);
}
export function closeCategories(home: Projection, away: Projection) {
  return CATEGORIES.filter(c => {
    const a = home.side.stats[c], b = away.side.stats[c];
    return a != null && b != null && a !== b && (c.includes("%") ? Math.abs(a - b) <= .015 : Math.abs(a - b) / Math.max(a, b, 1) <= .05);
  });
}

/** Shared wire/UI summary: keep injury assumptions next to every projection. */
export function projectionSummary(p: Projection) {
  return { teamId: p.side.teamId, stats: p.side.stats, games: p.issue ? null : p.games,
    liveGames: p.issue ? null : p.liveGames, benchedGames: p.issue ? null : p.benched,
    issue: p.issue, scenario: p.scenario, availabilityAsOf: p.availabilityAsOf,
    assumptions: p.assumptions, exclusions: p.exclusions, activationPlayerIds: p.activationPlayerIds,
    activationSlotsNeeded: p.activationSlotsNeeded, excludedPlayerIds: p.excluded.map(p => p.id),
    missingPlayerIds: p.missing.map(p => p.id),
    players: p.issue ? [] : p.players.map(row => ({ playerId: row.player.id, games: row.games })) };
}

export function tradeProduction(data: Snapshot, teamId: number, before: Player[], after: Player[], now: number, scenario: AvailabilityScenario) {
  const window = data.forecastSchedule?.windows.find(w => w.period === data.league.matchupPeriod + 1);
  if (!window) return { window: null, issue: "Next-week schedule unavailable.", before: null, after: null };
  const project = (roster: Player[]) => projectTeam({ ...data, players: roster.map(p => ({ ...p, teamId })) }, teamId, window, now, undefined, { scenario });
  return { window, issue: null, before: project(before), after: project(after) };
}
