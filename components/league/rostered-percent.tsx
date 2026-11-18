import { rosteredPercent } from "@/lib/sneaky-picks";

export const ROSTERED_TITLE = "Rostered across ESPN fantasy leagues; not availability in this league.";
export function RosteredPercent({ value }: { value?: number | null }) {
  return <span title={value == null ? "ESPN roster percentage unavailable" : ROSTERED_TITLE}>{rosteredPercent(value)}</span>;
}
