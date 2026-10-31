"use client";
import { useState } from "react";
import type { Snapshot } from "@/lib/schema";
import { Tabs, Toolbar } from "../ui/primitives";
import { TradeCalculator } from "./trade-calculator";
import { TradeBattles } from "./trade-battles";
import { AuctionHouse } from "./auction-house";
import { RankingHelp } from "./team-views";
export function TradeHub({ data, active }: { data: Snapshot; active: boolean }) {
  const [tab, setTab] = useState<"calculator" | "battles" | "auction">("battles");
  return <>
    <div className="trade-hub-tabs"><Toolbar><Tabs label="Trades" value={tab} onChange={setTab} options={[{ value: "calculator", label: "Calculator" }, { value: "battles", label: "Battles" }, { value: "auction", label: "Auction House" }]} /></Toolbar></div>
    <div hidden={tab !== "calculator"}><RankingHelp model={data.model} /><TradeCalculator data={data} /></div>
    <div hidden={tab !== "battles"}><TradeBattles data={data} active={active && tab === "battles"} /></div>
    {tab === "auction" && <AuctionHouse key={`${data.mode}:${data.league.id}:${data.league.season}`} data={data} active={active} />}
  </>;
}
