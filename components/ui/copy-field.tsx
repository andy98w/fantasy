"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./primitives";

export function CopyField({ label, value }: { label: string; value: string }) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  useEffect(() => {
    if (status !== "copied") return;
    const timer = setTimeout(() => setStatus("idle"), 2500);
    return () => clearTimeout(timer);
  }, [status]);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setStatus("copied"); }
    catch { input.current?.focus(); input.current?.select(); setStatus("manual"); }
  }
  return <div className="copy-field">
    <label htmlFor={id}>{label}</label>
    <div className="copy-field-row">
      <input ref={input} id={id} value={value} readOnly spellCheck={false} onFocus={event => event.target.select()} />
      <Button variant="accent" onClick={copy}>{status === "copied" ? "Copied" : "Copy URL"}</Button>
    </div>
    <span className={status === "manual" ? "copy-field-message" : "sr-only"} role="status">
      {status === "copied" ? "URL copied to clipboard." : status === "manual" ? "URL selected. Copy it with your keyboard or touch menu." : ""}
    </span>
  </div>;
}
