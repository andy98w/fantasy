"use client";
import { useState, type ReactNode } from "react";
import { tableRows, type SortValue, type TableSort } from "@/lib/table";
import { SearchField } from "./search-field";

export function useTableControls<T>(items: readonly T[], options: {
  initialSort?: TableSort; search: (row: T) => string; value: (row: T, key: string) => SortValue;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TableSort | null>(options.initialSort ?? null);
  const onSort = (key: string, descending = true) => setSort(old => ({ key, descending: old?.key === key ? !old.descending : descending }));
  return { query, setQuery, sort, onSort, rows: tableRows(items, query, sort, options.search, options.value) };
}
export function SortableHeader({ column, children, sort, onSort, descending = true, className, title }: {
  column: string; children: ReactNode; sort: TableSort | null; onSort: (key: string, descending?: boolean) => void;
  descending?: boolean; className?: string; title?: string;
}) {
  const active = sort?.key === column;
  return <th scope="col" className={className} title={title} aria-sort={active ? sort.descending ? "descending" : "ascending" : "none"}>
    <button type="button" className="table-sort-button" onClick={() => onSort(column, descending)}>{children}<span className="sort-arrow" aria-hidden="true">{active ? sort.descending ? "↓" : "↑" : "↕"}</span></button>
  </th>;
}
export function TableToolbar({ label, query, onQuery, children }: { label: string; query: string; onQuery: (value: string) => void; children?: ReactNode }) {
  return <div className="table-toolbar"><SearchField label={label} value={query} onChange={onQuery} />{children}</div>;
}
export function TableEmpty({ columns }: { columns: number }) {
  return <tr><td colSpan={columns} className="table-empty">No matching results.</td></tr>;
}
