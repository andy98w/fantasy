"use client";
import { useEffect, useState } from "react";
import { CopyField } from "../ui/copy-field";
import { Panel } from "../ui/primitives";

export function McpConnect() {
  const [endpoint, setEndpoint] = useState("https://web-production-8d109.up.railway.app/mcp");
  useEffect(() => { setEndpoint(new URL("/mcp", window.location.origin).href); }, []);
  return <div className="mcp-layout">
    <Panel title="Connect your agent" className="mcp-connection">
      <div className="mcp-content">
        <p className="mcp-intro">Ask your agent about this league’s players, matchups, and trades.</p>
        <CopyField label="MCP server URL" value={endpoint} />
        <ol className="mcp-steps">
          <li>Open your agent’s MCP settings and add a <strong>remote server</strong>.</li>
          <li>Name it <strong>Fantasy</strong> and paste the URL above. Choose <strong>Streamable HTTP</strong> if asked for a transport. Authentication: <strong>None</strong>.</li>
          <li>Save, then reconnect or refresh the tool list.</li>
        </ol>
        <p className="mcp-access">Read-only access. No login or API key needed.</p>
        <details className="mcp-details">
          <summary>Connection details</summary>
          <p>Your client must support remote MCP over Streamable HTTP. The URL is for an MCP client; opening it in a browser returns “Method not allowed.”</p>
          <p>The tools read the same league data as this dashboard. They cannot change rosters, submit trades, vote, or post auction listings.</p>
          <p>If tools don’t appear, check that the URL ends in <code>/mcp</code>, then reconnect.</p>
        </details>
      </div>
    </Panel>
    <Panel title="Try asking" className="mcp-prompts">
      <ul>
        <li>Which free agents playing today could help Kirk’s Mercs in blocks?</li>
        <li>Which categories are closest in my matchup, and how many games are left?</li>
        <li>How has my team’s power changed over the past week?</li>
      </ul>
      <p>Tell your agent which team you manage.</p>
    </Panel>
  </div>;
}
