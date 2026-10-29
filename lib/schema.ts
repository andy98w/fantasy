import { z } from "zod";
export const CATEGORIES = [
  "PTS",
  "REB",
  "AST",
  "STL",
  "BLK",
  "3PM",
  "FG%",
  "FT%",
  "TO",
] as const;
export type Category = (typeof CATEGORIES)[number];
const numeric = z.number().finite();
const stats = z.record(z.string(), numeric.nullable());
export const playerSchema = z.object({
  id: numeric,
  name: z.string(),
  nbaTeam: z.string(),
  position: z.string(),
  eligibleSlots: z.array(z.string()),
  teamId: numeric.nullable(),
  slot: z.string().nullable(),
  status: z.string(),
  availability: z.string(),
  gamesPlayed: numeric,
  stats,
  power: numeric.nullable(),
  zTotal: numeric.nullable(),
  rank: numeric.nullable(),
  contributions: z.record(z.string(), numeric),
});
export const teamSchema = z.object({
  id: numeric,
  name: z.string(),
  abbrev: z.string(),
  wins: numeric,
  losses: numeric,
  ties: numeric,
  standing: numeric.nullable(),
  talent: numeric.nullable(),
  talentRank: numeric.nullable(),
  rankedPlayers: numeric,
  rosterSize: numeric,
  categoryProfile: z.record(z.string(), numeric),
});
const side = z.object({
  teamId: numeric,
  wins: numeric.nullable(),
  ties: numeric.nullable(),
  stats,
});
export const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(["demo", "live"]),
  syncedAt: z.string().datetime({ offset: true }),
  newsSyncedAt: z.string().optional(),
  league: z.object({
    id: numeric,
    season: numeric,
    name: z.string(),
    myTeamId: numeric,
    scoringType: z.string(),
    matchupPeriod: numeric,
    scoringPeriod: numeric,
    categories: z.array(z.string()),
    rosterSlots: z.record(z.string(), numeric),
  }),
  teams: z.array(teamSchema),
  players: z.array(playerSchema),
  matchups: z.array(
    z.object({ id: numeric, period: numeric, home: side, away: side }),
  ),
  news: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      title: z.string(),
      url: z.url().refine((url) => /^https?:\/\//.test(url)),
      publishedAt: z.string().nullable(),
      playerIds: z.array(numeric),
    }),
  ),
  model: z.object({
    version: z.string(),
    basis: z.string(),
    poolSize: numeric,
    minimumGames: numeric,
    poolRule: z.string(),
    poolIds: z.array(numeric),
  }),
  coverage: z.object({
    playerCount: numeric,
    rosteredCount: numeric,
    teamCount: numeric,
  }),
  warnings: z.array(z.string()),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Player = z.infer<typeof playerSchema>;
export type Team = z.infer<typeof teamSchema>;
