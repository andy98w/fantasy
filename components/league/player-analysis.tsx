"use client";
import { useEffect, useMemo, useState } from "react";
import type { Player, Snapshot } from "@/lib/schema";
import type { PlayerGames } from "@/lib/player-games";
import type { GameBoxscore } from "@/lib/game-boxscore";
import type { ShotReport } from "@/lib/shots";
import { nbaAbbrev, NBA_TIMEZONE, type TodayData } from "@/lib/nba";
import { ShotChart } from "./shot-chart";
import { PlayerAvatar } from "./avatars";
import { Select } from "../ui/select";
import { Button, Empty, Panel } from "../ui/primitives";

const dateFormat = new Intl.DateTimeFormat("en-US", {month:"short", day:"numeric", timeZone:NBA_TIMEZONE});
export function PlayerAnalysis({data,today}:{data:Snapshot;today?:TodayData}) {
  const [playerId,setPlayerId] = useState(data.players.filter(p=>p.gamesPlayed>0).sort((a,b)=>(a.rank??9999)-(b.rank??9999))[0]?.id);
  const [query,setQuery] = useState("");
  const player = data.players.find(p=>p.id===playerId);
  const options = data.players.filter(p=>p.id===playerId || p.name.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name));
  return <>
    <div className="analysis-controls"><input type="search" aria-label="Find analysis player" placeholder="Find a player" value={query} onChange={e=>setQuery(e.target.value)} />
      <Select label="Analysis player" value={String(playerId??"")} onChange={id=>setPlayerId(Number(id))} options={options.map(p=>({value:String(p.id),label:`${p.name} · ${p.nbaTeam}`}))} />
    </div>
    {player ? <PlayerAnalysisGames key={`${player.id}:${data.league.season}`} player={player} season={data.league.season} today={data.mode === "live" ? today : undefined} /> : <Empty>No players available.</Empty>}
  </>;
}
function PlayerAnalysisGames({player,season,today}:{player:Player;season:number;today?:TodayData}) {
  const [log,setLog] = useState<PlayerGames|null>(null), [logError,setLogError]=useState(false),[choice,setChoice]=useState("latest"),[retry,setRetry]=useState(0);
  const [boxes,setBoxes]=useState<GameBoxscore[]>([]),[finished,setFinished]=useState(0),[failed,setFailed]=useState(0),[busy,setBusy]=useState(false);
  const [loadedIds,setLoadedIds]=useState("");
  useEffect(()=>{
    const controller=new AbortController(); setLogError(false);
    fetch(`/api/players/${player.id}/games?season=${season}`,{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])})
      .then(async r=>{if(!r.ok)throw Error();return r.json() as Promise<PlayerGames>;}).then(value=>{if(!controller.signal.aborted)setLog(value);})
      .catch(()=>{if(!controller.signal.aborted)setLogError(true);});
    return ()=>controller.abort();
  },[player.id,season,retry]);
  const games=useMemo(()=>{
    const current=today?.games.filter(g=>["live","final","suspended"].includes(g.state) && [g.home.abbrev,g.away.abbrev].some(t=>nbaAbbrev(t)===nbaAbbrev(player.nbaTeam)))??[];
    return [...new Map([...(log?.games.map(row=>row.game)??[]),...current].map(g=>[g.id,g])).values()].sort((a,b)=>Date.parse(b.startsAt)-Date.parse(a.startsAt));
  },[log,today,player.nbaTeam]);
  const ids=(choice==="season" ? games : games.filter(g=>g.id===(choice==="latest"?games[0]?.id:choice))).map(g=>g.id).join(",");
  useEffect(()=>{
    const controller=new AbortController(); let disposed=false;
    const gameIds=ids?ids.split(","):[];
    setLoadedIds(ids);setBoxes([]);setFinished(0);setFailed(0);setBusy(gameIds.length>0);
    let next=0,done=0,errors=0; const results:GameBoxscore[]=[];
    const run=async()=>{
      while(next<gameIds.length&&!disposed) {
        const id=gameIds[next++];
        try {
          const r=await fetch(`/api/games/${id}/shots?player=${player.id}`,{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
          if(!r.ok)throw Error();const box=await r.json() as GameBoxscore;
          if(box.game.id!==id)throw Error();results.push(box);
        }catch{if(!disposed)errors++;}
        done++;
        if(!disposed){setBoxes([...results].sort((a,b)=>Date.parse(b.game.startsAt)-Date.parse(a.game.startsAt)));setFinished(done);setFailed(errors);}
      }
    };
    void Promise.all(Array.from({length:Math.min(3,gameIds.length)},run)).then(()=>{if(!disposed)setBusy(false);});
    return ()=>{disposed=true;controller.abort();};
  },[ids,player.id,retry]);
  const selectedGame=games.find(g=>g.id===(choice==="latest"?games[0]?.id:choice));
  // Refresh an open live game without clearing its court or restarting season requests.
  useEffect(()=>{
    if(choice==="season"||selectedGame?.state!=="live")return;
    const controller=new AbortController();let pending=false;
    const timer=window.setInterval(async()=>{
      if(pending||document.visibilityState==="hidden")return;pending=true;
      try{const r=await fetch(`/api/games/${selectedGame.id}/shots?player=${player.id}`,{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
        if(!r.ok)throw Error("Shots unavailable");
        if(r.ok){const value=await r.json() as GameBoxscore;if(!controller.signal.aborted&&value.game.id===selectedGame.id)setBoxes([value]);}
      }catch{if(!controller.signal.aborted)setBoxes(previous=>previous.map(box=>({...box,stale:true})));}finally{pending=false;}
    },30000);
    return()=>{controller.abort();window.clearInterval(timer);};
  },[choice,selectedGame?.id,selectedGame?.state,player.id]);
  const currentBoxes = loadedIds === ids ? boxes : [];
  const report:ShotReport=useMemo(()=>({available:currentBoxes.some(b=>b.shotReport?.available),shots:currentBoxes.flatMap(b=>b.shotReport?.shots??[]),duration:Math.max(2880,...currentBoxes.map(b=>b.shotReport?.duration??0)),
    expected:currentBoxes.reduce<Record<string,number>>((all,b)=>{for(const [id,n] of Object.entries(b.shotReport?.expected??{}))all[id]=(all[id]??0)+n;return all;},{}),skipped:currentBoxes.reduce((sum,b)=>sum+(b.shotReport?.skipped??0),0)}),[currentBoxes]);
  const seasonView=choice==="season",boxPlayer=currentBoxes[0]?.teams.flatMap(t=>t.players).find(p=>p.id===player.id);
  const pairs=[["PTS","points"],["REB","rebounds"],["AST","assists"],["STL","steals"],["BLK","blocks"],["TO","turnovers"],["MIN","minutes"],
    [seasonView ? "FG%" : "FG", "fieldGoalsMade-fieldGoalsAttempted"], [seasonView ? "3PM" : "3PT", "threePointFieldGoalsMade-threePointFieldGoalsAttempted"], [seasonView ? "FT%" : "FT", "freeThrowsMade-freeThrowsAttempted"]];
  const dates=Object.fromEntries(games.map(g=>[g.id,dateFormat.format(new Date(g.startsAt))]));
  const unavailable=currentBoxes.filter(b=>!b.shotReport?.available).length;
  return <Panel>
    <div className="analysis-player"><PlayerAvatar player={player} large /><div><h2>{player.name}</h2><p>{seasonView?`Season per game · ${player.gamesPlayed} games`:selectedGame?`${dates[selectedGame.id]} · ${selectedGame.away.abbrev} at ${selectedGame.home.abbrev}`:"Recent game"}</p></div></div>
    <div className="analysis-stats">{pairs.map(([label,key])=><span key={key}>{label}<strong>{seasonView?(player.stats[label]===null||player.stats[label]===undefined?"—":label.includes("%") ? `${(player.stats[label] * 100).toFixed(1)}%` : Number(player.stats[label].toFixed(1))):boxPlayer?.didNotPlay?"—":boxPlayer?.stats[key]??"—"}</strong></span>)}</div>
    <div className="shot-controls" style={{padding:"0 24px"}}><Select label="Analysis game" value={choice} onChange={setChoice} options={[{value:"latest",label:"Most recent game"},{value:"season",label:"All games this season"},...games.map(g=>({value:g.id,label:`${dates[g.id]} · ${g.away.abbrev} at ${g.home.abbrev}`}))]} /><Button variant="quiet" onClick={()=>setRetry(n=>n+1)}>Refresh</Button></div>
    {logError&&<p className="analysis-progress" role="status">Game history unavailable. <Button variant="quiet" onClick={()=>setRetry(n=>n+1)}>Retry</Button></p>}
    {!log&&!logError&&<Empty>Loading games…</Empty>}
    {log?.stale&&<p className="analysis-progress">Game list may be out of date.</p>}
    {log&&!games.length&&<Empty>No games played this season.</Empty>}
    {busy&&<p className="analysis-progress" role="status">Loading shots · {finished}/{ids.split(",").length} games</p>}
    {(failed>0||unavailable>0)&&<p className="analysis-progress" role="status">{failed+unavailable} games unavailable. <Button variant="quiet" onClick={()=>setRetry(n=>n+1)}>Retry</Button></p>}
    {currentBoxes.some(b=>b.stale)&&<p className="analysis-progress">Some game data may be out of date.</p>}
    {seasonView&&currentBoxes.length>0&&<p className="analysis-progress">Shots from {currentBoxes.length-unavailable}/{games.length} games</p>}
    {boxPlayer?.didNotPlay&&!seasonView&&<p className="analysis-progress">Did not play{boxPlayer.reason?` · ${boxPlayer.reason}`:""}</p>}
    {currentBoxes.length>0&&<ShotChart key={`${choice}:${ids}`} report={report} teams={[]} fixedPlayer timeline={!seasonView} dates={dates} title={seasonView?"Season shot chart":"Shot chart"} />}
  </Panel>;
}
