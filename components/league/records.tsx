"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Snapshot } from "@/lib/schema";
import { leagueRecords, seasonMatchups, type LeagueRecord } from "@/lib/season";
import { Tabs, Empty } from "../ui/primitives";
import { AwardReveal, MotionNumber, useReducedMotion } from "../ui/motion";
import { PixelIcon } from "../ui/pixel-icon";
import { TeamAvatar } from "./avatars";
import { LeagueAwards } from "./weekly-highlights";
import { Rivalries } from "./rivalries";
import { Standings } from "./team-views";

function RecordCard({ record, data, season }: { record: LeagueRecord; data: Snapshot; season: boolean }) {
  const signature = `${record.value}:${record.holders.map(h => `${h.teamId}:${h.matchupId}`).join()}`;
  const previous = useRef(signature), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flash, setFlash] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    setFlash(false);
    if (previous.current !== signature && season && record.newRecord && !reduced) {
      setFlash(true); timer.current = setTimeout(() => setFlash(false), 1800);
    }
    previous.current = signature;
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [signature, season, record.newRecord, reduced]);
  const holders = [...record.holders].sort((a, b) => b.period - a.period || a.teamId - b.teamId);
  const holder = (h: typeof holders[number]) => {
    const team = data.teams.find(t => t.id === h.teamId);
    return <div className="record-holder" key={`${h.matchupId}:${h.teamId}`}>{team && <TeamAvatar team={team} />}<span>{team?.name ?? `Team ${h.teamId}`}<small>Week {h.period}</small></span></div>;
  };
  return <AwardReveal><article className={`record-card ${record.dubious ? "dubious-record" : ""} ${flash ? "record-broken" : ""}`}>
    <div className="record-emblem"><span className="award-trophy"><PixelIcon name="standings" size={40} /></span><span className="trophy-plinth" /></div>
    {season && record.newRecord && <span className="record-new">New record</span>}
    <h2>{record.name}</h2>
    <strong className="record-value"><MotionNumber>{record.percent ? `${(record.value * 100).toFixed(1)}%` : record.value}</MotionNumber></strong>
    <span className="record-unit">{!season && ["blowout", "close"].includes(record.id) ? "category lead" : record.label}</span>
    <div className="record-holders">{holders.slice(0, 2).map(holder)}{holders.length > 2 && <details><summary>{holders.length - 2} more tied</summary>{holders.slice(2).map(holder)}</details>}</div>
  </article></AwardReveal>;
}
export function Records({ data, onTeam = () => {} }: { data: Snapshot; onTeam?: (id: number) => void }) {
  const matches = useMemo(() => seasonMatchups(data), [data]);
  const finals = matches.filter(m => m.result !== "UNDECIDED");
  const [tab, setTab] = useState<"week" | "season" | "standings" | "duel" | "whatif">(finals.length ? "season" : "week");
  const selected = tab === "season" ? finals : matches.filter(m => m.period === data.league.matchupPeriod);
  const records = leagueRecords(selected);
  return <div className="records-room">
    <div className="rivalry-toolbar"><Tabs label="Record book" value={tab} onChange={setTab} options={[{value:"standings",label:"Standings"},{value:"week",label:"This week"},{value:"season",label:"Season records"},{value:"duel",label:"Head-to-head"},{value:"whatif",label:"What if"}]} /><span className="records-period">{tab === "week" ? `Week ${data.league.matchupPeriod}${selected.some(m => m.result === "UNDECIDED") ? " · In progress" : " · Final"}` : `${data.league.season - 1}–${String(data.league.season).slice(2)}`}</span></div>
    {data.historySyncError && tab !== "duel" && tab !== "whatif" && <p className="history-warning" role="status">{data.historySyncError} Showing saved records.</p>}
    {tab === "duel" || tab === "whatif" ? <Rivalries data={data} mode={tab} /> : tab === "standings" ? <Standings title="Standings" teams={data.teams} onTeam={onTeam} /> : tab === "week" ? <LeagueAwards matchups={data.matchups} teams={data.teams} onTeam={onTeam} /> : records.length ? <div className="record-cabinet" key={tab}>{records.map(record => <RecordCard record={record} data={data} season={tab === "season"} key={record.id} />)}</div>
      : <div className="record-vacant"><PixelIcon name="standings" size={64} /><h2>{tab === "season" ? "The record book is waiting." : "No scores yet."}</h2><Empty>{tab === "season" ? "Season records unlock after the first completed matchup." : "Weekly leaders appear when games begin."}</Empty></div>}
  </div>;
}
