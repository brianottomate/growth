"use client";
import { useEffect } from "react";

/** Three seconds of uninterrupted visible dwell, one successful view per tab session. */
export function ClientPageViewBeacon({
  endpoint,
  sessionKey,
}: {
  endpoint: string;
  sessionKey: string;
}) {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("noping") === "1")
      return;
    let visitId = crypto.randomUUID();
    try {
      if (sessionStorage.getItem(sessionKey + ":sent")) return;
      visitId =
        (sessionStorage.getItem(sessionKey) as
          | `${string}-${string}-${string}-${string}-${string}`
          | null) ?? visitId;
      sessionStorage.setItem(sessionKey, visitId);
    } catch {}
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const fire = async () => {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visitId }),
          keepalive: true,
        });
        if (!response.ok || stopped) return;
        try {
          sessionStorage.setItem(sessionKey + ":sent", "1");
        } catch {}
        document.removeEventListener("visibilitychange", onVisibility);
      } catch {
        /* Tracking never blocks setup. */
      }
    };
    const onVisibility = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible")
        timer = setTimeout(() => {
          void fire();
        }, 3000);
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [endpoint, sessionKey]);
  return null;
}
