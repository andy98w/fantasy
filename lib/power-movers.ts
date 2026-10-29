import type { Player } from "./schema";
export function powerMovers(players: Player[], limit = 3) {
  const measured = players.filter(p => p.power !== null && p.powerTrendStatus === "measured" && p.powerChange7d !== null);
  return {
    risers: measured.filter(p => p.powerChange7d! > 0).sort((a,b) => b.powerChange7d! - a.powerChange7d! || a.id - b.id).slice(0, limit),
    fallers: measured.filter(p => p.powerChange7d! < 0).sort((a,b) => a.powerChange7d! - b.powerChange7d! || a.id - b.id).slice(0, limit),
  };
}
