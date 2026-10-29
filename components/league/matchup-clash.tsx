"use client";
import { useEffect, useRef, type CSSProperties } from "react";
import { useReducedMotion } from "../ui/motion";

// Short rows need fewer, larger bends so the bolt never looks like a compressed scribble.
const tallEdge = [[0, 0], [14, -4], [24, 8], [27, -3], [43, -11],
  [48, 5], [61, -2], [70, 11], [74, -5], [88, 4], [100, 0]];
const shortEdge = [[0, 0], [28, -5], [45, 5], [50, -2], [72, 6], [100, 0]];

export function MatchupClash({
  home,
  away,
  phase = 0,
  lowerWins = false,
  compact = false,
  finished = false,
}: {
  home: number | null;
  away: number | null;
  phase?: number;
  lowerWins?: boolean;
  compact?: boolean;
  finished?: boolean;
}) {
  const known = home !== null && away !== null;
  const total = (home ?? 0) + (away ?? 0);
  const share = known && total > 0 ? (lowerWins ? away! : home!) / total : 0.5;
  const active = known && total > 0;
  // The score ratio controls territory; leave a sliver for the trailing team.
  const territory = Math.max(0.12, Math.min(0.88, share));
  const dominance = Math.abs(share - 0.5) * 2;
  const direction = Math.sign(share - 0.5);
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef({ direction, finished, known });
  const reduced = useReducedMotion();
  useEffect(() => {
    const old = previous.current;
    previous.current = { direction, finished, known };
    const victory = finished && !old.finished && direction !== 0;
    const flip = !finished && known && old.known && direction !== 0 && direction !== old.direction;
    if (reduced || (!victory && !flip) || document.visibilityState !== "visible") return;
    const target = ref.current?.querySelector(victory ? direction > 0 ? ".clash-home" : ".clash-away" : ".clash-contact svg");
    const animation = target?.animate(victory ? [
      { opacity: 1 }, { opacity: .45, offset: .35 }, { opacity: 1 },
    ] : [
      { transform: "scaleX(1)", opacity: .7 },
      { transform: "scaleX(2.2)", opacity: 1, offset: .25 },
      { transform: "scaleX(1)", opacity: 1 },
    ], { duration: victory ? 1000 : 700, easing: "ease-out" });
    return () => animation?.cancel();
  }, [direction, finished, known, reduced]);
  const edge = compact ? shortEdge : tallEdge;
  const bolt = edge.map(([y, x], index) => `${index ? "L" : "M"}${x + 32} ${y * 4}`).join(" ");
  const territoryClip = `polygon(0 0, ${edge.map(([y, x]) => `calc(var(--clash-split) + ${x}px) ${y}%`).join(", ")}, 0 100%)`;
  return (
    <span
      ref={ref}
      className="matchup-clash"
      aria-hidden="true"
      data-active={active && !finished}
      data-final={finished}
      data-winner={finished ? direction > 0 ? "home" : direction < 0 ? "away" : "tie" : undefined}
      data-empty={!known || total === 0}
      data-compact={compact}
      style={{
        // Compensate for the track's 32px overscan so territory matches the visible box.
        "--clash-split": `calc(${territory * 100}% + ${32 - 64 * territory}px)`,
        "--clash-push": `${(compact ? 5 : 9) + 7 * (1 - dominance)}px`,
        "--clash-drive": `${direction * (compact ? 7 : 12) * (0.4 + dominance)}px`,
        "--clash-delay": `${-(phase % 7) * 0.53}s`,
      } as CSSProperties}
    >
      <span className="clash-track">
        <span className="clash-territory clash-away" />
        <span className="clash-territory clash-home" style={{ clipPath: territoryClip }} />
        {known && (
          <span className="clash-contact">
            <svg viewBox="0 0 64 400" preserveAspectRatio="none" fill="none">
              <path className="clash-bolt-halo" vectorEffect="non-scaling-stroke" d={bolt} />
              <path className="clash-bolt-teal" vectorEffect="non-scaling-stroke" d={bolt} />
              <path className="clash-bolt-coral" vectorEffect="non-scaling-stroke" d={bolt} />
              <path className="clash-bolt" vectorEffect="non-scaling-stroke" d={bolt} />
              {!compact && <>
                <path className="clash-branch branch-one" vectorEffect="non-scaling-stroke" d="M29 108 L12 130 L20 132 L2 158" />
                <path className="clash-branch branch-two" vectorEffect="non-scaling-stroke" d="M43 280 L57 254 L49 249 L64 221" />
              </>}
            </svg>
            <i className="clash-spark spark-one" />
            <i className="clash-spark spark-two" />
            <i className="clash-spark spark-three" />
          </span>
        )}
      </span>
    </span>
  );
}
