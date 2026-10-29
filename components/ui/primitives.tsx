import type { ButtonHTMLAttributes, ReactNode } from "react";
export function Button({
  children,
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "quiet" | "accent";
}) {
  return (
    <button
      type="button"
      className={`button button-${variant} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <div className="panel-heading">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Tabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="tabs" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export function Toolbar({
  children,
  filters = false,
}: {
  children: ReactNode;
  filters?: boolean;
}) {
  return <div className={filters ? "filters" : "view-toolbar"}>{children}</div>;
}

export function ResultCount({
  count,
  singular,
  plural = `${singular}s`,
}: {
  count: number;
  singular: string;
  plural?: string;
}) {
  return (
    <span className="result-count">
      {count} {count === 1 ? singular : plural}
    </span>
  );
}

export function PageHeading({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <h1>{title}</h1>
      {detail && <span className="heading-detail">{detail}</span>}
      {action}
    </div>
  );
}

export function Notice({
  children,
  warning = false,
  action,
}: {
  children: ReactNode;
  warning?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className={`notice${warning ? " warning" : ""}`} role="status">
      {children}
      {action}
    </div>
  );
}
