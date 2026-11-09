"use client";
import type { ComponentPropsWithoutRef } from "react";
import { usePageTableHeader } from "./use-page-table-header";

/** A single real header, shared by page tables and tables inside scrolling dialogs. */
export function StickyTable({ className = "", ...props }: ComponentPropsWithoutRef<"table">) {
  const ref = usePageTableHeader();
  return <table {...props} ref={ref} className={`page-sticky-header ${className}`} />;
}
