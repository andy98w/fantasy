import type { CSSProperties } from "react";

// The surrounding numeric label carries the value; this is a visual comparison.
export function CategoryMeter({ value, range }: { value: number | null; range: number }) {
  const strength = value === null ? 0 : Math.min(1, Math.abs(value) / Math.max(1, range));
  return (
    <span className="category-strength-meter" aria-hidden="true" data-negative={(value ?? 0) < 0}>
      <i style={{ "--strength": strength } as CSSProperties} />
    </span>
  );
}
