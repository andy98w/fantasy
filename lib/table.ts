export type TableSort = { key: string; descending: boolean };
export type SortValue = string | number | readonly number[] | null | undefined;
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
export function compareTableValues(a: SortValue, b: SortValue, descending = false): number {
  const missing = (v: SortValue) => v == null || (typeof v === "number" && !Number.isFinite(v));
  if (missing(a)) return missing(b) ? 0 : 1;
  if (missing(b)) return -1;
  let result = 0;
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      result = (a[i] ?? 0) - (b[i] ?? 0); if (result) break;
    }
  } else result = typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b));
  return descending ? -result : result;
}
export function statSortValue(value?: string): SortValue {
  if (!value || ["—", "--", "DNP", ""].includes(value.trim())) return null;
  const text = value.trim();
  if (/^\d+-\d+$/.test(text)) return text.split("-").map(Number);
  if (/^\d+:\d{2}$/.test(text)) { const [m, s] = text.split(":").map(Number); return m + s / 60; }
  const number = Number(text.replace(/%$/, "").replaceAll(",", "").replace("−", "-"));
  return Number.isFinite(number) ? number : null;
}
const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export function matchesSearch(text: string, query: string): boolean {
  const haystack = normalize(text);
  return normalize(query).trim().split(/\s+/).every(word => haystack.includes(word));
}
export function tableRows<T>(rows: readonly T[], query: string, sort: TableSort | null,
  search: (row: T) => string, value: (row: T, key: string) => SortValue): T[] {
  const filtered = rows.filter(row => matchesSearch(search(row), query));
  return sort ? filtered.sort((a, b) => compareTableValues(value(a, sort.key), value(b, sort.key), sort.descending)) : filtered;
}
