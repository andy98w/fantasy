"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Refresh the saved snapshot, never ESPN directly. */
export function AutoRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const refresh = () => {
      if (!pending && document.visibilityState === "visible" && navigator.onLine)
        startTransition(() => router.refresh());
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [router, pending]);

  return null;
}
