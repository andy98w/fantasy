"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { Player } from "@/lib/schema";
import { matchesSearch } from "@/lib/table";
import { PixelIcon } from "../ui/pixel-icon";

export function AnalysisPlayerPicker({ players, value, onChange }: {
  players: Player[]; value?: number; onChange: (id: number) => void;
}) {
  const id = useId(), input = useRef<HTMLInputElement>(null), list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [active, setActive] = useState(0);
  const selected = players.find(p => p.id === value);
  const matches = players.filter(p => matchesSearch(`${p.name} ${p.nbaTeam}`, query))
    .sort((a, b) => a.name.localeCompare(b.name));
  const options = matches.slice(0, 50);
  const index = Math.min(active, options.length - 1);
  const choose = (player: Player) => { onChange(player.id); setOpen(false); setQuery(""); };
  useEffect(() => { if (open) list.current?.children[index]?.scrollIntoView({ block: "nearest" }); }, [index, open, query]);
  return <div className="analysis-picker" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setQuery(""); }
  }}>
    <div className="search-field">
      <PixelIcon name="search" size={14} />
      <input ref={input} role="combobox" aria-label="Find a player" aria-autocomplete="list" aria-expanded={open}
        aria-controls={open ? id : undefined} aria-activedescendant={open && options[index] ? `${id}-${options[index].id}` : undefined}
        placeholder="Find a player" autoComplete="off" value={open ? query : selected ? `${selected.name} · ${selected.nbaTeam}` : ""}
        onFocus={() => { setOpen(true); setActive(0); }}
        onClick={() => setOpen(true)}
        onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }}
        onKeyDown={event => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true);
            setActive(open ? Math.max(0, Math.min(options.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))) : 0);
          } else if (event.key === "Enter" && open) {
            event.preventDefault(); if (options[index]) choose(options[index]);
          } else if (event.key === "Escape") { event.preventDefault(); setOpen(false); setQuery(""); }
        }} />
      <button type="button" aria-label={open ? "Close player search" : "Choose player"} onMouseDown={event => event.preventDefault()}
        onClick={() => { if (open) { setOpen(false); setQuery(""); } else { input.current?.focus(); setOpen(true); } }}>
        <PixelIcon name={open ? "close" : "chevron"} size={12} />
      </button>
    </div>
    {open && <div className="analysis-picker-menu">
      <ul id={id} ref={list} role="listbox" aria-label="Players">
        {options.map((p, i) => <li id={`${id}-${p.id}`} key={p.id} role="option" aria-selected={p.id === value}
          className={i === index ? "active" : ""} onMouseDown={event => event.preventDefault()} onClick={() => choose(p)}>
          <span>{p.name}</span><small>{p.nbaTeam}</small>{p.id === value && <PixelIcon name="check" size={12} />}
        </li>)}
      </ul>
      {!options.length && <p role="status">No players found.</p>}
      {matches.length > options.length && <p>Type to narrow results.</p>}
    </div>}
  </div>;
}
