"use client";

import { useState } from "react";
import {
  CATEGORIES,
  type Category,
  type Player,
  type Snapshot,
  type Team,
} from "@/lib/schema";
import { recordRanks, rosterValue, teamPower } from "@/lib/analysis";
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
  return (
    <Panel title={title}>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="League standings"
      >
        <table className="data-table standings-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th className="identity-col">Team</th>
              <th>W</th>
              <th>L</th>
              <th>T</th>
            </tr>
          </thead>
          <AnimatedRows revision={teams.map(t => `${t.id}:${t.wins}:${t.losses}:${t.ties}`).join("|")}>
            {[...teams]
              .sort(
                (a, b) => ranks.get(a.id)! - ranks.get(b.id)! || a.id - b.id,
              )
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
          Player power runs from 0–100. Team power adds up the roster’s category
          scores, excluding IR. Ratings use season averages and require {model.minimumGames} games.
        </p>
        <p>
          Estimated scores treat unrated players as average. Trade priorities
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
  const [sort, setSort] = useState<{ key: "power" | Category; descending: boolean }>({
    key: "power",
    descending: true,
  });
  const values = teamPower(teams, players).sort((a, b) => {
    const left = sort.key === "power" ? a.score : a.rated ? a.categories[sort.key] : null;
    const right = sort.key === "power" ? b.score : b.rated ? b.categories[sort.key] : null;
    if (left === null) return right === null ? a.team.id - b.team.id : 1;
    if (right === null) return -1;
    return (sort.descending ? right - left : left - right) || a.team.id - b.team.id;
  });
  const sortHeader = (key: "power" | Category) => (
    <th key={key} aria-sort={sort.key === key ? sort.descending ? "descending" : "ascending" : "none"}>
      <button onClick={() => setSort(current => ({
        key,
        descending: current.key === key ? !current.descending : true,
      }))}>
        {key === "power" ? "Power" : key}
        <span className="sort-arrow" aria-hidden="true">
          {sort.key === key ? sort.descending ? "↓" : "↑" : ""}
        </span>
      </button>
    </th>
  );
  return (
    <Panel title="Team power">
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Team power rankings"
      >
        <table className="data-table heatmap-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th className="identity-col">Team</th>
              {sortHeader("power")}
              {CATEGORIES.map(sortHeader)}
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
  const value = rosterValue(roster);
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
