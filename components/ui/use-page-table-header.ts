"use client";
import { useEffect, useRef } from "react";

/** Keep the real, sortable header visible during page scroll, including wide tables.
 * CSS sticky alone is trapped by the table's horizontal overflow container.
 */
export function usePageTableHeader(enabled: boolean) {
  const ref = useRef<HTMLTableElement>(null);
  useEffect(() => {
    const table = ref.current;
    const head = table?.tHead;
    if (!enabled || !table || !head) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const bounds = table.getBoundingClientRect();
      const offset = Math.max(0, Math.min(-bounds.top, bounds.height - head.offsetHeight));
      head.style.transform = `translateY(${offset}px)`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(table);
    observer.observe(head);
    // Content above the table can resize after loading or filtering.
    observer.observe(document.body);
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      head.style.removeProperty("transform");
    };
  }, [enabled]);
  return ref;
}
