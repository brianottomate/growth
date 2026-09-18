/**
 * Client initialization that must finish before React hydration.
 *
 * Theme selection and privacy-first analytics are intentionally independent:
 * a storage failure must not prevent PostHog initialization.
 */
import posthog from "posthog-js";

import { env } from "./env";

const validThemeModes = ["light", "dark", "auto"] as const;
type ThemeMode = (typeof validThemeModes)[number];

try {
  const savedMode = window.localStorage.getItem("theme-mode") ?? "auto";
  const mode: ThemeMode = validThemeModes.includes(savedMode as ThemeMode)
    ? (savedMode as ThemeMode)
    : "auto";

  document.documentElement.dataset.theme =
    mode === "auto"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : mode;
} catch {
  document.documentElement.dataset.theme = "dark";
}

if (env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: "/ingest",
    ui_host: "https://eu.posthog.com",
    person_profiles: "identified_only",
    defaults: "2025-11-30",
    capture_performance: true,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    loaded: (ph) => {
      if (env.NEXT_PUBLIC_VERCEL_ENV !== "production") {
        ph.debug();
      }
    },
  });
}
