"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./primitives";

export function CopyField({ label, value, multiline = false, buttonLabel = "Copy URL" }: { label: string; value: string; multiline?: boolean; buttonLabel?: string }) {
  const id = useId(), input = useRef<HTMLInputElement>(null), textarea = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  useEffect(() => {
    if (status !== "copied") return;
    const timer = setTimeout(() => setStatus("idle"), 2500);
    return () => clearTimeout(timer);
  }, [status]);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setStatus("copied"); }
    catch { const field = multiline ? textarea.current : input.current; field?.focus(); field?.select(); setStatus("manual"); }
  }
  return <div className="copy-field">
    <label htmlFor={id}>{label}</label>
    <div className={`copy-field-row${multiline ? " copy-field-multiline" : ""}`}>
      {multiline
        ? <textarea ref={textarea} id={id} value={value} readOnly spellCheck={false} rows={10} onFocus={event => event.target.select()} />
        : <input ref={input} id={id} value={value} readOnly spellCheck={false} onFocus={event => event.target.select()} />}
      <Button variant="accent" onClick={copy}>{status === "copied" ? "Copied" : buttonLabel}</Button>
    </div>
    <span className={status === "manual" ? "copy-field-message" : "sr-only"} role="status">
      {status === "copied" ? "Copied to clipboard." : status === "manual" ? "Text selected. Copy it with your keyboard or touch menu." : ""}
    </span>
  </div>;
}
