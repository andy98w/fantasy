"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CATEGORIES, type Player } from "@/lib/schema";
import { PlayerAvatar, PowerBadge } from "./avatars";
import { stat, statusText } from "./format";

/** A shared hover/focus/tap preview, rendered in the browser's top layer. */
export function PlayerPreview({ player }: { player: Player }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const clearTimer = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const hide = () => { clearTimer(); card.current?.hidePopover(); };
  const show = () => {
    clearTimer();
    const node = card.current, anchor = trigger.current;
    if (!node || !anchor) return;
    node.showPopover();
    const rect = anchor.getBoundingClientRect();
    const width = node.offsetWidth, height = node.offsetHeight;
    node.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
    const below = rect.bottom + 8;
    node.style.top = `${Math.max(12, Math.min(below + height <= window.innerHeight - 12 ? below : rect.top - height - 8, window.innerHeight - height - 12))}px`;
  };
  const leave = () => { clearTimer(); timer.current = setTimeout(hide, 180); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (!open) return;
    const close = () => card.current?.hidePopover();
    const scroll = (event: Event) => {
      if (!(event.target instanceof Node) || !card.current?.contains(event.target)) close();
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", scroll, true);
    return () => { window.removeEventListener("resize", close); window.removeEventListener("scroll", scroll, true); };
  }, [open]);
  return <>
    <button ref={trigger} type="button" className="player-preview-trigger"
      aria-label={`Stats for ${player.name}`} aria-expanded={open} aria-controls={id}
      onPointerEnter={event => { if (event.pointerType === "mouse") { clearTimer(); timer.current = setTimeout(show, 180); } }}
      onPointerLeave={event => { if (event.pointerType === "mouse") leave(); }}
      onFocus={event => { if (event.currentTarget.matches(":focus-visible")) show(); }}
      onBlur={event => { if (!card.current?.contains(event.relatedTarget)) hide(); }}
      onClick={show}>
      <PlayerAvatar player={player} /><span>{player.name}</span>
    </button>
    <div ref={card} id={id} popover="auto" className="player-preview" role="region" aria-label={`${player.name} current stats`}
      onToggle={event => setOpen(event.newState === "open")}
      onPointerEnter={clearTimer} onPointerLeave={event => { if (event.pointerType === "mouse") leave(); }}>
      <header><div><strong>{player.name}</strong><small>{player.nbaTeam} / {player.position} · {statusText(player.status)}{player.slot === "IR" ? " · IR" : ""}</small></div><PowerBadge value={player.power} reason="Not enough complete stats" /></header>
      <p>Current season · Per game · {player.gamesPlayed} GP</p>
      <dl>{CATEGORIES.map(category => <div key={category}><dt>{category}</dt><dd>{stat(player.stats[category], category)}</dd></div>)}</dl>
    </div>
  </>;
}
