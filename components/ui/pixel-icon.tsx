export type IconName =
  | "home"
  | "matchup"
  | "roster"
  | "players"
  | "standings"
  | "rankings"
  | "news"
  | "settings"
  | "search"
  | "external"
  | "refresh"
  | "close"
  | "ball";
const shapes: Record<IconName, string> = {
  home: "M10 2h4v2h2v2h2v2h2v2h2v4h-4v8h-6v-6H8v6H2v-8H0v-4h2V8h2V6h2V4h4z",
  matchup:
    "M2 2h4v4h4v4h4v4h4v4h4v4h-6v-4h-4v-4H8v-4H4V6H2z M18 2h4v4h-4v4h-4V6h4z M2 18h4v-4h4v4H6v4H2z",
  roster: "M6 2h4v4h4V2h4v4h4v6h-4v10H6V12H2V6h4z M10 10v8h4v-8z",
  players: "M4 2h6v6H4z M14 4h6v6h-6z M2 12h10v10H2z M16 14h6v8h-6z",
  standings:
    "M6 2h12v2h4v10h-6v4h2v4H6v-4h2v-4H2V4h4z M4 6v6h2V6z M18 6v6h2V6z",
  rankings: "M2 14h4v8H2z M10 8h4v14h-4z M18 2h4v20h-4z",
  news: "M2 2h18v4h4v16H2z M6 6v6h6V6z M14 6v2h4V6z M14 10v2h4v-2z M6 16v2h12v-2z",
  settings: "M8 0h8v4h4v4h4v8h-4v4h-4v4H8v-4H4v-4H0V8h4V4h4z M8 8v8h8V8z",
  search:
    "M4 2h10v2h2v2h2v8h-2v2h-2v2H6v-2H4v-2H2V6h2z M6 6v8h8V6z M16 16h4v4h4v4h-6v-4h-2z",
  external: "M12 2h10v10h-4V8l-8 8-2-2 8-8h-4z M2 6h6v4H6v10h10v-4h4v8H2z",
  refresh: "M6 2h12v4h4V2h2v12H12v-4h6V6H6v12h12v-2h4v6H2V6h4z",
  close:
    "M2 2h4v4h4v4h4V6h4V2h4v4h-4v4h-4v4h4v4h4v4h-4v-4h-4v-4h-4v4H6v4H2v-4h4v-4h4v-4H6V6H2z",
  ball: "M6 0h12v2h4v4h2v12h-2v4h-4v2H6v-2H2v-4H0V6h2V2h4z M10 2v8H2v4h8v8h4v-8h8v-4h-8V2z M4 4v4h4V4z M16 4v4h4V4z M4 16v4h4v-4z M16 16v4h4v-4z",
};
export function PixelIcon({
  name,
  size = 18,
}: {
  name: IconName;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule="evenodd"
      aria-hidden="true"
      className="pixel-icon"
    >
      <path d={shapes[name]} />
    </svg>
  );
}
