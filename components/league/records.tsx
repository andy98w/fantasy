"use client";
import { useState } from "react";
import type { Snapshot } from "@/lib/schema";
import { Tabs } from "../ui/primitives";
import { LeagueAwards } from "./weekly-highlights";
import { Rivalries } from "./rivalries";
import { TransactionLedger } from "./transaction-ledger";
import { Standings } from "./team-views";
import { MatchupArchive } from "./matchup-archive";

export function Records({ data, onTeam = () => {} }: { data: Snapshot; onTeam?: (id: number) => void }) {
  const [tab, setTab] = useState<"matchups" | "week" | "standings" | "duel" | "ledger">("matchups");
  return <div className="records-room">
    <div className="rivalry-toolbar"><Tabs label="Record book" value={tab} onChange={setTab} options={[{value:"matchups",label:"Matchups"},{value:"standings",label:"Standings"},{value:"week",label:"This week"},{value:"duel",label:"Head-to-head"},{value:"ledger",label:"Ledger"}]} /><span className="records-period">{tab === "week" ? `Week ${data.league.matchupPeriod}${data.matchups.some(m => m.result === "UNDECIDED") ? " · In progress" : " · Final"}` : `${data.league.season - 1}–${String(data.league.season).slice(2)}`}</span></div>
    {data.historySyncError && tab !== "duel" && tab !== "ledger" && <p className="history-warning" role="status">{data.historySyncError} Showing saved records.</p>}
    {tab === "matchups" ? <MatchupArchive data={data} /> : tab === "ledger" ? <TransactionLedger data={data} /> : tab === "duel" ? <Rivalries data={data} mode="duel" /> : tab === "standings" ? <Standings title="Standings" teams={data.teams} onTeam={onTeam} /> : <LeagueAwards matchups={data.matchups} teams={data.teams} onTeam={onTeam} />}
  </div>;
}
