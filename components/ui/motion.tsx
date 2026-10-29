"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}
export function MotionNumber({ children }: { children: string | number }) {
  const ref = useRef<HTMLSpanElement>(null), previous = useRef(children);
  const reduced = useReducedMotion();
  useEffect(() => {
    const changed = previous.current !== children;
    previous.current = children;
    if (!changed || reduced || document.visibilityState !== "visible") return;
    const animation = ref.current?.animate([
      { transform: "translateY(-3px) scale(1.18)", color: "var(--gold)" },
      { transform: "translateY(0) scale(1)", color: "inherit" },
    ], { duration: 450, easing: "cubic-bezier(.2,.8,.3,1)" });
    return () => animation?.cancel();
  }, [children, reduced]);
  return <span ref={ref} className="motion-number">{children}</span>;
}
export function AnimatedRows({ children, revision }: { children: ReactNode; revision: string }) {
  const ref = useRef<HTMLTableSectionElement>(null);
  const positions = useRef(new Map<string, number>());
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    const parent = ref.current;
    if (!parent || !parent.getClientRects().length) { positions.current.clear(); return; }
    const previous = positions.current, next = new Map<string, number>();
    const animations: Animation[] = [];
    for (const row of Array.from(parent.rows)) {
      const key = row.dataset.motionKey!;
      const top = row.offsetTop;
      next.set(key, top);
      const before = previous.get(key);
      if (!reduced && document.visibilityState === "visible" && before !== undefined && Math.abs(before - top) > 1)
        animations.push(row.animate([{ transform: `translateY(${before - top}px)` }, { transform: "translateY(0)" }], { duration: 500, easing: "cubic-bezier(.2,.8,.3,1)" }));
    }
    positions.current = next;
    return () => animations.forEach(animation => animation.cancel());
  }, [revision, reduced]);
  return <tbody ref={ref}>{children}</tbody>;
}
export function AwardReveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null), seen = useRef(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!ref.current || reduced || seen.current) return;
    let animation: Animation | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || seen.current) return;
      seen.current = true; observer.disconnect();
      animation = ref.current?.querySelector(".award-trophy")?.animate([
        { transform: "translateY(-18px) rotate(-12deg) scale(.7)", opacity: 0 },
        { transform: "translateY(3px) rotate(4deg) scale(1.08)", opacity: 1, offset: .7 },
        { transform: "translateY(0) rotate(0) scale(1)", opacity: 1 },
      ], { duration: 650, easing: "ease-out" });
    }, { threshold: .4 });
    observer.observe(ref.current);
    return () => { observer.disconnect(); animation?.cancel(); };
  }, [reduced]);
  return <div ref={ref} className="award-reveal">{children}</div>;
}
