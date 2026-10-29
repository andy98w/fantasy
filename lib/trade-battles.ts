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
export function chooseBattle(entries: TradeEntry[], previous?: [string, string]): [string, string] | null {
  const pairs: [string, string][] = [];
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    if (entries[i].tradeId === entries[j].tradeId) continue;
    pairs.push([entries[i].id, entries[j].id]);
  }
  const fresh = pairs.filter(pair => !previous || !pair.every(id => previous.includes(id)));
  const pool = fresh.length ? fresh : pairs;
  if (!pool.length) return null;
  const pair = pool[Math.floor(Math.random() * pool.length)];
  return Math.random() < 0.5 ? pair : [pair[1], pair[0]];
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
