"use client";
import { useEffect, useRef } from "react";
import { CATEGORIES, type Player, type Snapshot } from "@/lib/schema";
import { PlayerAvatar, PowerBadge, TeamAvatar } from "./avatars";
import { ratingReason, stat, statusText } from "./format";
import { NewsFeed } from "./news-feed";
import { Button } from "../ui/primitives";
import { PlayerInjuryOutlook } from "./player-injury";
import { PlayerRecentGames } from "./player-games";
import type { GameBoxscore } from "@/lib/game-boxscore";
import type { TodayData } from "@/lib/nba";
import { PixelIcon } from "../ui/pixel-icon";
import { RosteredPercent } from "./rostered-percent";
export function PlayerDialog({
  player,
  identity,
  gameBoxscore,
  data,
  today,
  onClose,
}: {
  player: Player | null;
  identity?: { id: number; name: string; nbaTeam: string };
  gameBoxscore?: GameBoxscore;
  data: Snapshot;
  today?: TodayData;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const profile = player ?? identity;
  const owner = data.teams.find((team) => team.id === player?.teamId);
  const ownership = owner?.name ?? (player?.availability === "FREEAGENT" ? "Free agent" : player?.availability === "WAIVERS" ? "Waivers" : "Ownership unavailable");
  const open = !!profile;
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="player-dialog player-profile-dialog"
      aria-label="Player details"
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      {profile && (
        <>
          <div className="dialog-topline" data-sticky-table-bar>
            <span>Player stats</span>
            <Button
              variant="quiet"
              aria-label="Close player details"
              onClick={onClose}
            >
              <PixelIcon name="close" size={16} />
            </Button>
          </div>
          <div className="player-dialog-heading">
            <PlayerAvatar player={profile} large />
            <div>
              <span className="muted">
                {profile.nbaTeam}{player?.position ? ` / ${player.position}` : ""}
              </span>
              <h2>{profile.name}</h2>
              <div className="player-profile-ownership" aria-label="Fantasy team">
                {owner && <TeamAvatar team={owner} />}
                <span>{ownership}</span>
                {player?.percentRostered != null && <span className="muted">· <RosteredPercent value={player.percentRostered} /> rostered</span>}
              </div>
              <span
                className={`status-label ${(player?.status ?? "UNKNOWN") !== "ACTIVE" ? "injured" : ""}`}
              >
                {statusText(player?.status ?? "UNKNOWN")}
              </span>
            </div>
            {player && <PowerBadge
              value={player.power}
              reason={ratingReason(player, data.model.minimumGames)}
            />}
          </div>
          {data.mode === "live" && <PlayerInjuryOutlook key={`${profile.id}:${data.league.season}`} playerId={profile.id} season={data.league.season} status={player?.status ?? "UNKNOWN"} />}
          {player && <div className="player-facts">
            <span>
              Rank{" "}
              <strong>{player.rank === null ? "NR" : `#${player.rank}`}</strong>
            </span>
            <span>
              Games <strong>{player.gamesPlayed}</strong>
            </span>
            <span>
              Category total <strong>{player.zTotal?.toFixed(2) ?? "—"}</strong>
            </span>
          </div>}
          {player && player.power === null && (
            <p className="inline-notice">
              Unrated: {ratingReason(player, data.model.minimumGames)}.
            </p>
          )}
          <PlayerRecentGames key={`${profile.id}:${data.league.season}`} playerId={profile.id} season={data.league.season} players={data.players} snapshot={data} today={today} gameBoxscore={gameBoxscore} />
          {!player && <p className="inline-notice">Season ratings unavailable for this player.</p>}
          {player && <><div className="contribution-header">
            <h3>Category value</h3>
            <span>Per game / Value</span>
          </div>
          <div className="contribution-list">
            {CATEGORIES.map((category) => {
              const value = player.contributions[category];
              return (
                <div key={category}>
                  <span>{category}</span>
                  <span>{stat(player.stats[category], category)}</span>
                  <div className="contribution-track">
                    <i />
                    <span
                      className={value >= 0 ? "positive" : "negative"}
                      style={{
                        left:
                          value >= 0
                            ? "50%"
                            : `${50 - Math.min(50, Math.abs(value ?? 0) * 12)}%`,
                        width: `${Math.min(50, Math.abs(value ?? 0) * 12)}%`,
                      }}
                    />
                  </div>
                  <strong
                    className={value >= 0 ? "positive-text" : "negative-text"}
                  >
                    {value == null
                      ? "—"
                      : `${value > 0 ? "+" : ""}${value.toFixed(2)}`}
                  </strong>
                </div>
              );
            })}
          </div>
          </>}
          {data.news.some((item) => item.playerIds.includes(profile.id)) && (
            <div className="dialog-news">
              <h3>News</h3>
              <NewsFeed
                items={data.news.filter((item) =>
                  item.playerIds.includes(profile.id),
                )}
                limit={3}
              />
            </div>
          )}
        </>
      )}
    </dialog>
  );
}
