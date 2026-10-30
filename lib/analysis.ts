import {
  CATEGORIES,
  type Category,
  type Player,
  type Snapshot,
  type Team,
} from "./schema";

export type Weights = Record<Category, number>;
export const DEFAULT_WEIGHTS: Weights = Object.fromEntries(
  CATEGORIES.map((category) => [category, 1]),
) as Weights;
const rounded = (value: number) =>
  Math.round((value + Number.EPSILON) * 1000) / 1000;

export function rosterValue(
  roster: Player[],
  weights: Weights = DEFAULT_WEIGHTS,
  { includeIR = false }: { includeIR?: boolean } = {},
) {
  const contributing = roster.filter((player) => includeIR || player.slot !== "IR");
  const rated = contributing.filter((player) => player.zTotal !== null);
  const missing = contributing.filter((player) => player.zTotal === null);
  const categories = Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      rounded(
        rated.reduce(
          (sum, player) => sum + (player.contributions[category] ?? 0),
          0,
        ),
      ),
    ]),
  ) as Record<Category, number>;
  return {
    size: contributing.length,
    rated: rated.length,
    missing,
    categories,
    score: rated.length
      ? rounded(
          CATEGORIES.reduce(
            (sum, category) => sum + categories[category] * weights[category],
            0,
          ),
        )
      : null,
    provisional: missing.length > 0,
  };
}

/** Record rank is intentionally separate from ESPN's imported playoff seed. */
export function recordRanks(teams: Team[]): Map<number, number> {
  const percentage = (team: Team) => {
    const games = team.wins + team.losses + team.ties;
    return games ? (team.wins + team.ties / 2) / games : 0;
  };
  const sorted = [...teams].sort(
    (a, b) => percentage(b) - percentage(a) || a.id - b.id,
  );
  const result = new Map<number, number>();
  let rank = 0,
    previous: number | undefined;
  sorted.forEach((team, index) => {
    const score = percentage(team);
    if (previous === undefined || Math.abs(score - previous) > 1e-10)
      rank = index + 1;
    result.set(team.id, rank);
    previous = score;
  });
  return result;
}

export function teamPower(teams: Team[], players: Player[]) {
  const values = teams.map((team) => ({
    team,
    ...rosterValue(players.filter((player) => player.teamId === team.id)),
    rank: null as number | null,
  }));
  values.sort((a, b) =>
    a.score === null
      ? b.score === null
        ? a.team.id - b.team.id
        : 1
      : b.score === null
        ? -1
        : b.score - a.score || a.team.id - b.team.id,
  );
  let rank = 0,
    previous: number | undefined;
  values.forEach((value, index) => {
    if (value.score === null) return;
    if (value.score !== previous) rank = index + 1;
    value.rank = rank;
    previous = value.score;
  });
  return values;
}

export function exchangePlayers(
  players: Player[],
  leftTeam: number,
  rightTeam: number,
  leftIds: number[],
  rightIds: number[],
) {
  if (leftTeam === rightTeam) throw new Error("Choose two different teams.");
  if (
    new Set([...leftIds, ...rightIds]).size !==
    leftIds.length + rightIds.length
  )
    throw new Error("A player can only be included once.");
  const left = players.filter((p) => p.teamId === leftTeam);
  const right = players.filter((p) => p.teamId === rightTeam);
  if (
    leftIds.some((id) => !left.some((p) => p.id === id)) ||
    rightIds.some((id) => !right.some((p) => p.id === id))
  )
    throw new Error(
      "A selected player is no longer on this roster. Reset the trade.",
    );
  const sentLeft = left.filter((p) => leftIds.includes(p.id));
  const sentRight = right.filter((p) => rightIds.includes(p.id));
  return {
    left: {
      before: left,
      after: [...left.filter((p) => !leftIds.includes(p.id)), ...sentRight],
      sent: sentLeft,
      received: sentRight,
    },
    right: {
      before: right,
      after: [...right.filter((p) => !rightIds.includes(p.id)), ...sentLeft],
      sent: sentRight,
      received: sentLeft,
    },
  };
}

export function relevantNews(
  news: Snapshot["news"],
  players: Player[],
  teamId?: number,
) {
  const ids = new Set(
    players
      .filter((player) =>
        teamId === undefined
          ? player.teamId !== null
          : player.teamId === teamId,
      )
      .map((player) => player.id),
  );
  const important = (title: string) =>
    /injur|out\b|questionable|doubtful|surgery|return|start|bench|minutes|role|ruled|sidelined|available|absence/i.test(
      title,
    )
      ? 1
      : 0;
  return news
    .filter((item) => item.playerIds.some((id) => ids.has(id)))
    .sort((a, b) => {
      // Keep old injury stories from outranking fresh news indefinitely.
      const day = (item: Snapshot["news"][number]) =>
        Math.floor((Date.parse(item.publishedAt ?? "") || 0) / 86400000);
      return (
        day(b) - day(a) ||
        important(b.title) - important(a.title) ||
        (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")
      );
    });
}
