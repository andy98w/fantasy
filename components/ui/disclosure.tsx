import type { ReactNode } from "react";
import { PixelIcon } from "./pixel-icon";

/** Shared, keyboard-native container for supporting detail throughout the dashboard. */
export function Disclosure({ title, children, className = "" }: {
  title: ReactNode; children: ReactNode; className?: string;
}) {
  return <details className={`disclosure ${className}`}>
    <summary><span>{title}</span><PixelIcon name="chevron" size={12} /></summary>
    <div className="disclosure-body">{children}</div>
  </details>;
}
