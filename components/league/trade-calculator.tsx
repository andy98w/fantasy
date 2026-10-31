"use client";

import { SortableHeader, TableToolbar, TableEmpty, useTableControls } from "../ui/table-controls";
import { useState } from "react";
import {
  CATEGORIES,
  type Category,
  type Player,
  type Snapshot,
  type Team,
} from "@/lib/schema";
import {
  DEFAULT_WEIGHTS,
  exchangePlayers,
  rosterValue,
  teamRating,
  type Weights,
} from "@/lib/analysis";
import { Button, Empty, Notice, Panel, Toolbar } from "../ui/primitives";
import { Select } from "../ui/select";
import { SearchField } from "../ui/search-field";
import { teamOptions } from "./team-select";
import { PlayerAvatar, TeamAvatar } from "./avatars";
import { CategoryValue } from "./team-views";
import { signedZ as signed, statusText, categorySearch } from "./format";
import { CategoryMeter } from "../ui/category-meter";
import { ValueFeedback } from "../ui/value-feedback";

const score = (value: number | null) => (value === null ? "—" : signed(value));

function TradeRoster({
  label,
  teamId,
  otherId,
  teams,
  players,
  selected,
  onTeam,
  onToggle,
}: {
  label: string;
  teamId: number;
  otherId: number;
  teams: Team[];
  players: Player[];
  selected: number[];
  onTeam: (id: number) => void;
  onToggle: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const team = teams.find((t) => t.id === teamId)!;
  const roster = players.filter((p) => p.teamId === teamId);
  const outgoing = roster.filter((p) => selected.includes(p.id));
  const value = rosterValue(outgoing, DEFAULT_WEIGHTS, { includeIR: true });
  return (
    <Panel title={label}>
      <div className="trade-roster-controls">
        <Select
          label={label}
          value={String(teamId)}
          onChange={(id) => {
            setQuery("");
            onTeam(Number(id));
          }}
          options={teamOptions(teams.filter((t) => t.id !== otherId))}
          className="team-select"
        />
        <SearchField
          label={`Search ${label.toLowerCase()} roster`}
          value={query}
          onChange={setQuery}
        />
      </div>
      <div
        className="trade-roster-list"
        role="group"
        aria-label={`${team.name} sends`}
      >
        {roster
          .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
          .map((player) => (
            <label
              className={`trade-player ${selected.includes(player.id) ? "selected" : ""}`}
              key={player.id}
            >
              <input
                type="checkbox"
                checked={selected.includes(player.id)}
                onChange={() => onToggle(player.id)}
                aria-label={`Send ${player.name}`}
              />
              <PlayerAvatar player={player} />
              <span className="trade-player-name">
                <strong>{player.name}</strong>
                <small>
                  {player.position} /{" "}
                  {player.status === "ACTIVE"
                    ? player.nbaTeam
                    : statusText(player.status)}
                  {player.slot === "IR" ? " · IR" : ""}
                </small>
              </span>
              <span title="Player value">
                {score(player.zTotal)}
              </span>
            </label>
          ))}
        {!roster.some((p) =>
          p.name.toLowerCase().includes(query.toLowerCase()),
        ) && <Empty>No matching players.</Empty>}
      </div>
      <div className="trade-outgoing">
        <strong><ValueFeedback>{`${outgoing.length} outgoing`}</ValueFeedback></strong>
        <span>
          Value: {outgoing.length ? score(value.score) : "0.0"}
          {value.provisional ? " (est.)" : ""}
        </span>
      </div>
    </Panel>
  );
}

function TradeImpact({
  team,
  beforeRoster,
  afterRoster,
  sent,
  received,
  weights,
  onWeight,
  capacity,
  active,
}: {
  team: Team;
  beforeRoster: Player[];
  afterRoster: Player[];
  sent: Player[];
  received: Player[];
  weights: Weights;
  onWeight: (category: Category, value: number) => void;
  capacity: number;
  active: boolean;
}) {
  const before = teamRating(beforeRoster, weights),
    after = teamRating(afterRoster, weights);
  const hasData = before.rated > 0 && after.rated > 0;
  const delta = (category: Category) =>
    after.categories[category] - before.categories[category];
  const gains = CATEGORIES.filter((c) => weights[c] > 0 && delta(c) >= 0.05);
  const losses = CATEGORIES.filter((c) => weights[c] > 0 && delta(c) <= -0.05);
  const allPunted = CATEGORIES.every((c) => weights[c] === 0);
  const [priority, setPriority] = useState("all");
  const control = useTableControls(CATEGORIES.filter(category => priority === "all" || String(weights[category]) === priority), {
    search: categorySearch,
    value: (category, key) => key === "category" ? category : key === "before" ? before.rated ? before.categories[category] : null : key === "after" ? after.rated ? after.categories[category] : null : key === "change" ? hasData ? delta(category) : null : weights[category],
  });
  const deltaRange = Math.max(1, ...CATEGORIES.map((c) => Math.abs(delta(c))));
  return (
    <Panel>
      <div className="trade-impact-heading">
        <TeamAvatar team={team} />
        <h2>{team.name}</h2>
      </div>
      <div className="trade-impact-body">
        <div className="trade-exchange">
          <p>
            <span>Sends</span> {sent.map((p) => p.name).join(", ") || "—"}
          </p>
          <p>
            <span>Receives</span>{" "}
            {received.map((p) => p.name).join(", ") || "—"}
          </p>
        </div>
        <div className="trade-metrics">
          <div>
            <span>Roster</span>
            <strong>
              {beforeRoster.length} → {afterRoster.length}
            </strong>
          </div>
          <div>
            <span>Rated players</span>
            <strong>
              {before.rated}/{before.size} → {after.rated}/{after.size}
            </strong>
          </div>
          <div>
            <span>
              Team fit
              {before.provisional || after.provisional ? " (est.)" : ""}
            </span>
            <strong>
              {score(before.score)} → {score(after.score)}
            </strong>
          </div>
          <div>
            <span>Fit change</span>
            <strong
              className={
                !hasData
                  ? ""
                  : after.score! >= before.score!
                    ? "positive-text"
                    : "negative-text"
              }
            >
              <ValueFeedback>{allPunted
                ? "No categories"
                : hasData
                  ? signed(after.score! - before.score!)
                  : "—"}</ValueFeedback>
            </strong>
          </div>
        </div>
        {afterRoster.length > capacity && (
          <p className="inline-notice">
            Roster exceeds the {capacity}-player limit by {afterRoster.length - capacity}.
          </p>
        )}
        <p className="trade-verdict" aria-live="polite" hidden={!active}>
          {!hasData
              ? "Not enough stats to compare."
              : allPunted
                ? "Select at least one category."
                : [
                    gains.length ? `Improves ${gains.join(", ")}.` : "",
                    losses.length ? `Weakens ${losses.join(", ")}.` : "",
                  ]
                    .filter(Boolean)
                    .join(" ") ||
                  "No notable category changes."}
        </p>
      </div>
      <TableToolbar label={`Search ${team.name} categories`} query={control.query} onQuery={control.setQuery}>
        <Select label={`${team.name} priority filter`} value={priority} onChange={setPriority} options={[{value:"all",label:"All priorities"},{value:"0",label:"Punt"},{value:"1",label:"Normal"},{value:"2",label:"Priority"}]} />
      </TableToolbar>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label={`${team.name} trade impact`}
      >
        <table className="data-table trade-impact-table">
          <thead>
            <tr>
              {[["category", "Category"], ["before", "Before"], ["after", "After"], ["change", "Change"], ["priority", "Priority"]].map(([key, label]) => <SortableHeader key={key} column={key} sort={control.sort} onSort={control.onSort} descending={key !== "category"}>{label}</SortableHeader>)}
            </tr>
          </thead>
          <tbody>
            {control.rows.map((category) => (
              <tr
                key={category}
                className={weights[category] === 0 ? "punted-category" : ""}
              >
                <td>{category}</td>
                <td>
                  {before.rated ? signed(before.categories[category]) : "—"}
                </td>
                <td>
                  {after.rated ? signed(after.categories[category]) : "—"}
                </td>
                <td>
                  <CategoryValue value={hasData ? delta(category) : null} />
                  <CategoryMeter value={hasData ? delta(category) : null} range={deltaRange} />
                </td>
                <td>
                  <Select
                    label={`${team.name} ${category} priority`}
                    value={String(weights[category])}
                    onChange={(value) => onWeight(category, Number(value))}
                    options={[
                      { value: "0", label: "Punt" },
                      { value: "1", label: "Normal" },
                      { value: "2", label: "Priority" },
                    ]}
                    className="weight-select"
                  />
                </td>
              </tr>
            ))}
            {!control.rows.length && <TableEmpty columns={5} />}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function TradeCalculator({ data }: { data: Snapshot }) {
  const [leftId, setLeftId] = useState(data.teams[0]?.id);
  const [rightId, setRightId] = useState(data.teams[1]?.id);
  const [leftSelected, setLeftSelected] = useState<number[]>([]);
  const [rightSelected, setRightSelected] = useState<number[]>([]);
  const [leftWeights, setLeftWeights] = useState<Weights>({
    ...DEFAULT_WEIGHTS,
  });
  const [rightWeights, setRightWeights] = useState<Weights>({
    ...DEFAULT_WEIGHTS,
  });
  const leftTeam = data.teams.find((t) => t.id === leftId),
    rightTeam = data.teams.find((t) => t.id === rightId);
  if (!leftTeam || !rightTeam)
    return <Empty>Two teams are required to compare a trade.</Empty>;
  const reset = () => {
    setLeftSelected([]);
    setRightSelected([]);
    setLeftWeights({ ...DEFAULT_WEIGHTS });
    setRightWeights({ ...DEFAULT_WEIGHTS });
  };
  let trade: ReturnType<typeof exchangePlayers> | undefined,
    error: string | undefined;
  try {
    trade = exchangePlayers(
      data.players,
      leftId,
      rightId,
      leftSelected,
      rightSelected,
    );
  } catch (cause) {
    error = (cause as Error).message;
  }
  const toggle = (ids: number[], id: number) =>
    ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
  const capacity = Object.values(data.league.rosterSlots).reduce(
    (sum, count) => sum + count,
    0,
  );
  const active = leftSelected.length + rightSelected.length > 0;
  return (
    <>
      <Toolbar>
        <Button variant="quiet" onClick={reset}>
          Reset trade
        </Button>
      </Toolbar>
      {error && (
        <Notice
          warning
          action={
            <Button variant="quiet" onClick={reset}>
              Reset trade
            </Button>
          }
        >
          {error}
        </Notice>
      )}
      <div className="trade-grid">
        <TradeRoster
          label="Team A"
          teamId={leftId}
          otherId={rightId}
          teams={data.teams}
          players={data.players}
          selected={leftSelected}
          onTeam={(id) => {
            setLeftId(id);
            setLeftSelected([]);
            setLeftWeights({ ...DEFAULT_WEIGHTS });
          }}
          onToggle={(id) => setLeftSelected((ids) => toggle(ids, id))}
        />
        <TradeRoster
          label="Team B"
          teamId={rightId}
          otherId={leftId}
          teams={data.teams}
          players={data.players}
          selected={rightSelected}
          onTeam={(id) => {
            setRightId(id);
            setRightSelected([]);
            setRightWeights({ ...DEFAULT_WEIGHTS });
          }}
          onToggle={(id) => setRightSelected((ids) => toggle(ids, id))}
        />
      </div>
      {trade && (
        <div className="trade-grid trade-results">
          <TradeImpact
            team={leftTeam}
            beforeRoster={trade.left.before}
            afterRoster={trade.left.after}
            sent={trade.left.sent}
            received={trade.left.received}
            weights={leftWeights}
            onWeight={(category, value) =>
              setLeftWeights((weights) => ({ ...weights, [category]: value }))
            }
            capacity={capacity}
            active={active}
          />
          <TradeImpact
            team={rightTeam}
            beforeRoster={trade.right.before}
            afterRoster={trade.right.after}
            sent={trade.right.sent}
            received={trade.right.received}
            weights={rightWeights}
            onWeight={(category, value) =>
              setRightWeights((weights) => ({ ...weights, [category]: value }))
            }
            capacity={capacity}
            active={active}
          />
        </div>
      )}
    </>
  );
}
