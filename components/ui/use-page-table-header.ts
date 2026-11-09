"use client";
import { useEffect, useRef } from "react";

/** CSS sticky is trapped by horizontal overflow wrappers; move the real header
 * within its table, relative to the viewport or a containing vertical scroller.
 */
export function usePageTableHeader() {
  const ref = useRef<HTMLTableElement>(null);
  useEffect(() => {
    const table = ref.current;
    const head = table?.tHead;
    if (!table || !head) return;
    const ancestors: HTMLElement[] = [];
    for (let parent = table.parentElement; parent && parent !== document.body; parent = parent.parentElement)
      ancestors.push(parent);
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!table.getClientRects().length) return;
      let top = 0;
      for (const parent of ancestors) {
        if (!/(auto|scroll)/.test(getComputedStyle(parent).overflowY) || parent.scrollHeight <= parent.clientHeight + 1) continue;
        top = Math.max(top, parent.getBoundingClientRect().top + parent.clientTop);
        // Keep table labels below the dialog's sticky title/close controls.
        const bar = parent.querySelector<HTMLElement>(":scope > [data-sticky-table-bar]");
        if (bar && getComputedStyle(bar).position === "sticky")
          top = Math.max(top, bar.getBoundingClientRect().bottom);
      }
      const bounds = table.getBoundingClientRect();
      const offset = Math.max(0, Math.min(top - bounds.top, bounds.height - head.offsetHeight));
      head.style.transform = `translateY(${offset}px)`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(table);
    observer.observe(head);
    observer.observe(document.body);
    for (const parent of ancestors) observer.observe(parent);
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("toggle", schedule, true);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("toggle", schedule, true);
      head.style.removeProperty("transform");
    };
  }, []);
  return ref;
}
