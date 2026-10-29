"use client";
import { useEffect, useRef } from "react";
import { CATEGORIES, type Player, type Snapshot } from "@/lib/schema";
import { PlayerAvatar, PowerBadge } from "./avatars";
import { ratingReason, stat, statusText } from "./format";
import { NewsFeed } from "./news-feed";
import { Button } from "../ui/primitives";
import { PixelIcon } from "../ui/pixel-icon";
export function PlayerDialog({
  player,
  data,
  onClose,
}: {
  player: Player | null;
  data: Snapshot;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = player !== null;
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="player-dialog"
      aria-label="Player details"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      {player && (
        <>
          <div className="dialog-topline">
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
            <PlayerAvatar player={player} large />
            <div>
              <span className="muted">
                {player.nbaTeam} / {player.position}
              </span>
              <h2>{player.name}</h2>
              <span
                className={`status-label ${player.status !== "ACTIVE" ? "injured" : ""}`}
              >
                {statusText(player.status)}
              </span>
            </div>
            <PowerBadge
              value={player.power}
              reason={ratingReason(player, data.model.minimumGames)}
            />
          </div>
          <div className="player-facts">
            <span>
              Rank{" "}
              <strong>{player.rank === null ? "NR" : `#${player.rank}`}</strong>
            </span>
            <span>
              Games <strong>{player.gamesPlayed}</strong>
            </span>
            <span>
              Total z-score <strong>{player.zTotal?.toFixed(2) ?? "—"}</strong>
            </span>
          </div>
          {player.power === null && (
            <p className="inline-notice">
              Unrated: {ratingReason(player, data.model.minimumGames)}.
            </p>
          )}
          <div className="contribution-header">
            <h3>Category value</h3>
            <span>Per game / z-score</span>
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
          <p className="panel-note">
            Positive adds value, including turnovers.
            {player.gamesPlayed < 10 ? " Small sample." : ""}
          </p>
          {data.news.some((item) => item.playerIds.includes(player.id)) && (
            <div className="dialog-news">
              <h3>News</h3>
              <NewsFeed
                items={data.news.filter((item) =>
                  item.playerIds.includes(player.id),
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
