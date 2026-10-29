export function ValueFeedback({ children }: { children: string }) {
  return <span key={children} className="value-feedback">{children}</span>;
}
