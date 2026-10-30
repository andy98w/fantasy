"use client";
import { useState } from "react";
import type { Snapshot } from "@/lib/schema";
import { Tabs, Toolbar } from "../ui/primitives";
import { TradeCalculator } from "./trade-calculator";
import { TradeBattles, TradeHistory } from "./trade-battles";
import { RankingHelp } from "./team-views";
export function TradeHub({ data, active }: { data: Snapshot; active: boolean }) {
  const [tab, setTab] = useState<"calculator" | "battles" | "history">("battles");
  return <>
    <div className="trade-hub-tabs"><Toolbar><Tabs label="Trades" value={tab} onChange={setTab} options={[{ value: "calculator", label: "Calculator" }, { value: "battles", label: "Battles" }, { value: "history", label: "History" }]} /></Toolbar></div>
    <div hidden={tab !== "calculator"}><RankingHelp model={data.model} /><TradeCalculator data={data} /></div>
    <div hidden={tab !== "battles"}><TradeBattles data={data} active={active && tab === "battles"} /></div>
    {tab === "history" && <TradeHistory data={data} />}
  </>;
}
