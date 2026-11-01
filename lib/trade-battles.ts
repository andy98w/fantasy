import { z } from "zod";
import type { Trade } from "./schema";
export type BattleMode = "best";
export type TradeEntry = { id: string; tradeId: string; teamId: number; completedAt: string; received: number[]; sent: number[] };
export type BattleRating = { entryId: string; rating: number; votes: number; wins: number };
export const voteSchema = z.object({
  requestId: z.string().uuid(),
  mode: z.literal("best").default("best"),
  leftId: z.string().min(1).max(240),
  rightId: z.string().min(1).max(240),
  winnerId: z.string().min(1).max(240),
}).strict();
export type BattleVote = z.infer<typeof voteSchema>;
export type VoteResult = { winnerId: string; delta: number; winnerRating: number; loserRating: number };
export function tradeEntries(trades: Trade[]): TradeEntry[] {
  return trades.flatMap(trade => [...new Set(trade.moves.flatMap(m => [m.fromTeamId, m.toTeamId]))].map(teamId => ({
    id: `${trade.id}:${teamId}`, tradeId: trade.id, teamId, completedAt: trade.completedAt,
    received: [...new Set(trade.moves.filter(m => m.toTeamId === teamId).map(m => m.playerId))],
    sent: [...new Set(trade.moves.filter(m => m.fromTeamId === teamId).map(m => m.playerId))],
  })));
}
export function validBattle(vote: BattleVote, entries: TradeEntry[]): boolean {
  const left = entries.find(e => e.id === vote.leftId), right = entries.find(e => e.id === vote.rightId);
  return !!left && !!right && left.tradeId !== right.tradeId && [left.id, right.id].includes(vote.winnerId);
}
export function elo(winner: number, loser: number): { winner: number; loser: number; delta: number } {
  const expected = 1 / (1 + 10 ** ((loser - winner) / 400));
  const delta = 32 * (1 - expected);
  return { winner: winner + delta, loser: loser - delta, delta };
}
type BattlePair = [string, string];
type BattleSelection = {
  ratings?: BattleRating[];
  previous?: BattlePair;
  recent?: BattlePair[];
  random?: () => number;
};

// Mix weighted selection with 20% uniform exploration so established deals and
// distant MMR opponents can still appear. Random is injectable for simulations.
function weightedPick<T>(items: T[], weight: (item: T) => number, random: () => number): T {
  const weights = items.map(weight);
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = random();
  for (let i = 0; i < items.length; i++) {
    cursor -= 0.2 / items.length + 0.8 * weights[i] / total;
    if (cursor < 0) return items[i];
  }
  return items[items.length - 1];
}

export function chooseBattle(entries: TradeEntry[], { ratings = [], previous, recent = [], random = Math.random }: BattleSelection = {}): BattlePair | null {
  const pairs: [TradeEntry, TradeEntry][] = [];
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    if (entries[i].tradeId === entries[j].tradeId) continue;
    pairs.push([entries[i], entries[j]]);
  }
  const fresh = pairs.filter(pair => !previous || !pair.every(entry => previous.includes(entry.id)));
  let pool = fresh.length ? fresh : pairs;
  if (!pool.length) return null;

  // Prefer a new actual trade, not just the other team's side of the same deal.
  // Small leagues fall back gracefully when both sides cannot be replaced.
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const previousTrades = new Set(previous?.map(id => byId.get(id)?.tradeId));
  const overlap = (pair: [TradeEntry, TradeEntry]) => pair.filter(entry => previousTrades.has(entry.tradeId)).length;
  const leastOverlap = Math.min(...pool.map(overlap));
  pool = pool.filter(pair => overlap(pair) === leastOverlap);

  const ratingById = new Map(ratings.map(rating => [rating.entryId, rating]));
  const recentTrades = recent.slice(-3).flatMap(pair => pair.map(id => byId.get(id)?.tradeId));
  const freshness = (entry: TradeEntry) => 0.5 ** recentTrades.filter(id => id === entry.tradeId).length;
  const eligible = [...new Map(pool.flat().map(entry => [entry.id, entry])).values()];
  const anchor = weightedPick(eligible, entry => freshness(entry) / Math.sqrt(1 + (ratingById.get(entry.id)?.votes ?? 0)), random);
  const opponents = pool.filter(pair => pair.includes(anchor)).map(pair => pair[0] === anchor ? pair[1] : pair[0]);
  const anchorRating = ratingById.get(anchor.id)?.rating ?? 1000;
  const opponent = weightedPick(opponents, entry => {
    const gap = ((ratingById.get(entry.id)?.rating ?? 1000) - anchorRating) / 200;
    return freshness(entry) / (1 + gap * gap);
  }, random);
  return random() < 0.5 ? [anchor.id, opponent.id] : [opponent.id, anchor.id];
}
export function rankEntries(entries: TradeEntry[], ratings: BattleRating[]) {
  const map = new Map(ratings.map(r => [r.entryId, r]));
  const sorted = entries.map(entry => ({ entry, ...(map.get(entry.id) ?? { entryId: entry.id, rating: 1000, votes: 0, wins: 0 }) }))
    .sort((a, b) => Number(b.votes > 0) - Number(a.votes > 0) || Math.round(b.rating) - Math.round(a.rating) || a.entry.id.localeCompare(b.entry.id));
  let rank = 0;
  return sorted.map((row, i) => {
    if (i === 0 || Math.round(row.rating) !== Math.round(sorted[i - 1].rating)) rank = i + 1;
    return { ...row, rank: row.votes ? rank : null };
  });
}
