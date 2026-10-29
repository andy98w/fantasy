import type { Snapshot } from "@/lib/schema";
import { Panel } from "../ui/primitives";
export function Connection({
  data,
  syncFailure,
}: {
  data: Snapshot;
  syncFailure: string | null;
}) {
  return (
    <div className="connection-grid">
      <Panel title="ESPN import">
        <dl className="connection-details">
          <div>
            <dt>Status</dt>
            <dd>
              {data.mode === "demo"
                ? "Demo"
                : syncFailure
                  ? "Sync failed"
                  : "Connected"}
            </dd>
          </div>
          <div>
            <dt>League</dt>
            <dd>{data.league.id}</dd>
          </div>
          <div>
            <dt>Season</dt>
            <dd>{data.league.season}</dd>
          </div>
          <div>
            <dt>Last import</dt>
            <dd>
              {data.mode === "demo"
                ? "—"
                : new Date(data.syncedAt).toLocaleString("en-US", {
                    timeZone: "America/Los_Angeles",
                  }) + " PT"}
            </dd>
          </div>
          <div>
            <dt>Coverage</dt>
            <dd>
              {data.coverage.teamCount} teams / {data.coverage.playerCount}{" "}
              players
            </dd>
          </div>
        </dl>
      </Panel>
      <Panel title="Data notes">
        <div className="connection-notes">
          <p>Public dashboard. ESPN credentials stay on the server.</p>
          {syncFailure && <p className="negative-text">{syncFailure}</p>}
          <ul>
            {data.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          <a
            className="button"
            href="https://github.com/andy98w/fantasy/blob/main/docs/CONNECT_ESPN.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            Connection guide ↗
          </a>
        </div>
      </Panel>
    </div>
  );
}
