"use client";

import { SortableHeader, TableToolbar, TableEmpty, useTableControls } from "../ui/table-controls";
import {
  CATEGORIES,
  type Category,
  type Player,
  type Snapshot,
  type Team,
} from "@/lib/schema";
import { recordRanks, rosterValue, teamRating, teamPower } from "@/lib/analysis";
import { TeamAvatar } from "./avatars";
import { Panel } from "../ui/primitives";
import { signedZ } from "./format";
import { AnimatedRows, MotionNumber } from "../ui/motion";
import { CategoryMeter } from "../ui/category-meter";

export function Standings({
  teams,
  title,
  onTeam,
}: {
  teams: Team[];
  title?: string;
  onTeam: (id: number) => void;
}) {
  const ranks = recordRanks(teams);
  const control = useTableControls(teams, {
    initialSort: { key: "rank", descending: false }, search: team => `${team.name} ${team.abbrev}`,
    value: (team, key) => key === "rank" ? ranks.get(team.id) : key === "name" ? team.name : key === "wins" ? team.wins : key === "losses" ? team.losses : team.ties,
  });
  return (
    <Panel title={title}>
      <TableToolbar label="Search standings" query={control.query} onQuery={control.setQuery} />
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="League standings"
      >
        <table className="data-table standings-table">
          <thead>
            <tr>
              {[ ["rank", "Rank"], ["name", "Team"], ["wins", "W"], ["losses", "L"], ["ties", "T"] ].map(([key, label]) => <SortableHeader key={key} column={key} sort={control.sort} onSort={control.onSort} descending={!["rank", "name", "losses"].includes(key)} className={key === "name" ? "identity-col" : undefined}>{label}</SortableHeader>)}
            </tr>
          </thead>
          <AnimatedRows revision={teams.map(t => `${t.id}:${t.wins}:${t.losses}:${t.ties}`).join("|")}>
            {control.rows
              .map((team) => (
                <tr key={team.id} data-motion-key={team.id}>
                  <td className="rank-cell">{ranks.get(team.id)}</td>
                  <td className="identity-col">
                    <button
                      className="identity"
                      onClick={() => onTeam(team.id)}
                    >
                      <TeamAvatar team={team} />
                      <strong>{team.name}</strong>
                    </button>
                  </td>
                  <td><MotionNumber>{team.wins}</MotionNumber></td>
                  <td><MotionNumber>{team.losses}</MotionNumber></td>
                  <td><MotionNumber>{team.ties}</MotionNumber></td>
                </tr>
              ))}
            {!control.rows.length && <TableEmpty columns={5} />}
          </AnimatedRows>
        </table>
      </div>
    </Panel>
  );
}

export function RankingHelp({ model }: { model: Snapshot["model"] }) {
  return (
    <details className="ranking-help power-help">
      <summary>How power works</summary>
      <div>
        <p>
          + means stronger than average; − means weaker. For turnovers,
          fewer is better. Category scores are relative values, not stat totals.
        </p>
        <p>
          Player power runs from 0–100. Team power tapers each roster category before
          adding them: extreme strengths and weaknesses count progressively less.
          Bench and IR are included; injuries do not discount roster value. The heatmap shows the original category values.
        </p>
        <p>
          Ratings use season averages and require {model.minimumGames} games.
          Team power is a rating, not a win probability. Estimated scores treat
          unrated players as average. Trade priorities
          adjust team fit: Punt ignores a category; Priority counts it twice.
        </p>
      </div>
    </details>
  );
}

export function Coverage({ roster }: { roster: Player[] }) {
  const value = rosterValue(roster);
  return (
    <span
      className={`coverage-label ${value.provisional ? "provisional" : ""}`}
      title={
        value.missing.length
          ? `Unrated: ${value.missing.map((p) => p.name).join(", ")}`
          : "All players rated"
      }
    >
      {value.rated}/{value.size} rated
      {value.provisional ? " · Estimated" : ""}
    </span>
  );
}

export function TeamRankings({
  teams,
  players,
  onTeam,
}: {
  teams: Team[];
  players: Player[];
  onTeam: (id: number) => void;
}) {
  const control = useTableControls(teamPower(teams, players), {
    initialSort: { key: "power", descending: true },
    search: value => `${value.team.name} ${value.team.abbrev}`,
    value: (value, key) => key === "name" ? value.team.name : key === "rank" ? value.rank : key === "power" ? value.score : value.rated ? value.categories[key as Category] : null,
  });
  const values = control.rows;
  const sortHeader = (key: string, label = key) => <SortableHeader key={key} column={key} sort={control.sort} onSort={control.onSort} descending={!["name", "rank"].includes(key)} className={key === "name" ? "identity-col" : undefined}>{label}</SortableHeader>;
  return (
    <Panel title="Team power">
      <TableToolbar label="Search team power" query={control.query} onQuery={control.setQuery} />
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Team power rankings"
      >
        <table className="data-table heatmap-table">
          <thead>
            <tr>
              {sortHeader("rank", "Rank")}
              {sortHeader("name", "Team")}
              {sortHeader("power", "Power")}
              {CATEGORIES.map(category => sortHeader(category))}
            </tr>
          </thead>
          <AnimatedRows revision={values.map(v => `${v.team.id}:${v.score}`).join("|")}>
            {values.map((value) => (
              <tr key={value.team.id} data-motion-key={value.team.id}>
                <td className="rank-cell">
                  {value.rank === null ? "—" : `#${value.rank}`}
                </td>
                <td className="identity-col">
                  <button
                    className="identity"
                    onClick={() => onTeam(value.team.id)}
                  >
                    <TeamAvatar team={value.team} />
                    <strong>{value.team.name}</strong>
                  </button>
                </td>
                <td><MotionNumber>{value.score?.toFixed(1) ?? "—"}</MotionNumber></td>
                {CATEGORIES.map((category) => (
                  <td key={category}>
                    <CategoryValue
                      value={value.rated ? value.categories[category] : null}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {!values.length && <TableEmpty columns={CATEGORIES.length + 3} />}
          </AnimatedRows>
        </table>
      </div>
    </Panel>
  );
}

export function CategoryValue({ value }: { value: number | null }) {
  return (
    <span
      className={`heat-cell ${value === null ? "" : value > 0 ? "positive" : value < 0 ? "negative" : ""}`}
    >
      {value === null ? "—" : signedZ(value)}
    </span>
  );
}

export function CategoryProfile({ roster }: { roster: Player[] }) {
  const value = rosterValue(roster);
  const range = Math.max(1, ...CATEGORIES.map((category) => Math.abs(value.categories[category])));
  return (
    <div className="team-category-profile" aria-label="Category strengths">
      {CATEGORIES.map((category) => (
        <div key={category}>
          <span>{category}</span>
          <CategoryValue
            value={value.rated ? value.categories[category] : null}
          />
          <CategoryMeter value={value.rated ? value.categories[category] : null} range={range} />
        </div>
      ))}
    </div>
  );
}

export function TeamProfile({
  team,
  teams,
  roster,
}: {
  team: Team;
  teams: Team[];
  roster: Player[];
}) {
  const value = teamRating(roster);
  return (
    <>
      <div className="team-profile">
        <TeamAvatar team={team} large />
        <div className="team-profile-name">
          <h2>{team.name}</h2>
          <span>
            {team.wins}–{team.losses}–{team.ties}
          </span>
        </div>
        <div>
          <span>Record rank</span>
          <strong>#{recordRanks(teams).get(team.id)}</strong>
        </div>
        <div>
          <span>ESPN seed</span>
          <strong>{team.standing === null ? "—" : `#${team.standing}`}</strong>
        </div>
        <div>
          <span>Power{value.provisional ? " (est.)" : ""}</span>
          <strong>{value.score?.toFixed(1) ?? "—"}</strong>
        </div>
        <div>
          <span>Rated players</span>
          <Coverage roster={roster} />
        </div>
      </div>
      <CategoryProfile roster={roster} />
    </>
  );
}
