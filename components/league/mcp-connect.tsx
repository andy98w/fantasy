"use client";
import { useState } from "react";
import type { Team } from "../../lib/schema";
import { CopyField } from "../ui/copy-field";
import { Panel, Tabs } from "../ui/primitives";
import { Select } from "../ui/select";

// Cloud chat clients cannot reach the viewer's localhost, even on the local dashboard.
const endpoint = "https://web-production-8d109.up.railway.app/mcp";
const apps = [
  { value: "chatgpt", label: "ChatGPT" },
  { value: "claude", label: "Claude" },
  { value: "other", label: "Other" },
] as const;

export function McpConnect({ teams }: { teams: Pick<Team, "id" | "name">[] }) {
  const [app, setApp] = useState<"chatgpt" | "claude" | "other">("chatgpt");
  const [teamId, setTeamId] = useState("choose");
  const team = teams.find(t => String(t.id) === teamId);
  const prompt = `Use the connected Fantasy tools to help me with our 9-category basketball league. ${team ? `My fantasy team is ${JSON.stringify(team.name)} (team ID ${team.id}).` : "Ask me which fantasy team I manage."}

Check current rosters, injuries, schedules and data freshness before recommending moves. Suggest pickups and trades based on category strengths and weaknesses. Ask which categories I'm punting rather than assuming. Distinguish actual stats from forecasts, and flag missing or stale data.

Start by reviewing my team and this week's matchup. If the Fantasy tools aren't connected, tell me to finish the connection setup first.`;
  return <div className="mcp-layout">
    <Panel title="1. Connect your app" className="mcp-connection">
      <div className="mcp-content">
        <Tabs label="AI app" value={app} options={apps} onChange={setApp} />
        <CopyField label="Server URL" value={endpoint} />
        {app === "chatgpt" ? <ol className="mcp-steps">
          <li>In ChatGPT on the web, open <strong>Plugins</strong>. Choose <strong>+</strong>, then <strong>Add custom MCP server</strong>.</li>
          <li>Name it <strong>Fantasy</strong>, paste the URL above, and choose <strong>No authentication</strong>.</li>
          <li>Review the connection notice, create the plugin, then install it. In a chat, type <strong>@</strong> and select <strong>Fantasy</strong>.</li>
        </ol> : app === "claude" ? <ol className="mcp-steps">
          <li>In Claude, open <strong>Customize → Connectors</strong>. Choose <strong>+ Add → Add custom connector</strong>.</li>
          <li>Name it <strong>Fantasy</strong> and paste the URL above. Continue with <strong>No sign in</strong>, then add it.</li>
          <li>In a chat, open <strong>+ → Connectors</strong> and enable <strong>Fantasy</strong>.</li>
        </ol> : <ol className="mcp-steps">
          <li>Open your agent’s MCP settings and add a <strong>remote server</strong>.</li>
          <li>Name it <strong>Fantasy</strong> and paste the URL above. Transport: <strong>Streamable HTTP</strong>. Authentication: <strong>None</strong>.</li>
          <li>Save, then reconnect or refresh the tool list.</li>
        </ol>}
        <p className="mcp-access">Read-only. No Fantasy login, API key or skill file needed.</p>
        <details className="mcp-details">
          <summary>Need help connecting?</summary>
          <p>Connect first; pasting a prompt alone won’t give your app access to the league. If the option is missing, check your app’s workspace permissions.</p>
          {app === "chatgpt" && <p><a href="https://developers.openai.com/api/docs/guides/custom-mcp-server" target="_blank" rel="noreferrer">ChatGPT setup guide</a></p>}
          {app === "claude" && <p><a href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" target="_blank" rel="noreferrer">Claude setup guide</a></p>}
          <p>The server uses Streamable HTTP. Opening its URL in a browser returns “Method not allowed.” If tools don’t appear, check the URL ends in <code>/mcp</code> and reconnect.</p>
        </details>
      </div>
    </Panel>
    <Panel title="2. Start a conversation" className="mcp-prompts">
      <div className="mcp-content">
        <div className="mcp-team-picker">
          <span>Your fantasy team</span>
          <Select label="Your fantasy team" value={teamId} onChange={setTeamId} options={[
            { value: "choose", label: "Choose a team" },
            ...teams.map(t => ({ value: String(t.id), label: t.name })),
          ]} />
        </div>
        <CopyField key={prompt} label="Paste this into your connected chat" value={prompt} multiline buttonLabel="Copy starter prompt" />
      </div>
    </Panel>
  </div>;
}
