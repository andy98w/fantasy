import { statusText } from "./format";

export function PlayerStatus({ status = "UNKNOWN" }: { status?: string }) {
  return <span className={`status-label ${status !== "ACTIVE" && status !== "UNKNOWN" ? "injured" : ""}`} title={`Current status: ${statusText(status)}`}>{statusText(status)}</span>;
}
