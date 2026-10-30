import type { LeagueTransaction, Player } from "./schema";

export function filterTransactions(events: LeagueTransaction[], players: Player[], team: string, type: string, query: string) {
  const names = new Map(players.map(player => [player.id, player.name.toLowerCase()]));
  const search = query.trim().toLowerCase();
  return events.filter(event => event.moves.some(move =>
    (team === "all" || move.fromTeamId === Number(team) || move.toTeamId === Number(team)) &&
    (type === "all" || move.type === type) &&
    (!search || (names.get(move.playerId) ?? `player #${move.playerId}`).includes(search))
  )).sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt) || b.id.localeCompare(a.id));
}
