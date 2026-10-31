import { z } from "zod";
import type { Snapshot } from "./schema";

export const auctionMutationSchema = z.object({
  action: z.enum(["save", "close"]),
  teamId: z.number().int().positive(),
  playerId: z.number().int(),
  note: z.string().trim().max(240).default(""),
  version: z.number().int().nonnegative(),
}).strict();
export type AuctionMutation = z.infer<typeof auctionMutationSchema>;
export type AuctionListing = {
  playerId: number; teamId: number; note: string; active: boolean; version: number; updatedAt: string;
};
export function auctionScope(data: Snapshot) { return `${data.mode}:${data.league.id}:${data.league.season}`; }
export function canListPlayer(data: Snapshot, teamId: number, playerId: number) {
  return data.teams.some(t => t.id === teamId) && data.players.some(p => p.id === playerId && p.teamId === teamId);
}
export function currentListings(rows: AuctionListing[], data: Snapshot) {
  return rows.filter(row => row.active && canListPlayer(data, row.teamId, row.playerId));
}
export class ListingConflict extends Error { readonly code = "LISTING_CONFLICT"; }
export function nextListing(old: AuctionListing | undefined, input: AuctionMutation): AuctionListing {
  // A retry after a lost response must be harmless, but never overwrite a newer edit.
  const active = input.action === "save";
  if (old && old.version === input.version + 1 && old.teamId === input.teamId && old.active === active && (!active || old.note === input.note)) return old;
  if ((old?.version ?? 0) !== input.version || (!old && !active) || (!active && old?.teamId !== input.teamId))
    throw new ListingConflict("Listing changed. Reload it before saving.");
  return { playerId: input.playerId, teamId: input.teamId, note: active ? input.note : old!.note, active, version: input.version + 1, updatedAt: new Date().toISOString() };
}
