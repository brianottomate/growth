/**
 * Client initialization that must finish before React hydration.
 *
 * Theme selection and privacy-first analytics are intentionally independent:
 * a storage failure must not prevent PostHog initialization.
 */
import posthog from "posthog-js";

import { env } from "./env";
import {
  blockHomeGroupShareAnalytics,
  homeGroupAnalyticsBlocked,
  containsHomeGroupShareUrl,
} from "./lib/home-group-share-privacy";

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

if (env.NEXT_PUBLIC_POSTHOG_KEY && !homeGroupAnalyticsBlocked()) {
  posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: "/ingest",
    ui_host: "https://eu.posthog.com",
    person_profiles: "identified_only",
    defaults: "2025-11-30",
    capture_performance: true,
    // A share token is a credential. Drop the entire event rather than risk
    // overlooking a nested URL, referrer, or performance resource name.
    before_send: (event) => {
      if (
        window.location.pathname.startsWith("/report/") ||
        JSON.stringify(event).includes("/report/") ||
        homeGroupAnalyticsBlocked() ||
        containsHomeGroupShareUrl(JSON.stringify(event))
      )
        return null;
      return event;
    },
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

// Block before a client-side transition can enqueue data for the bearer URL.
// PostHog's consent API persists to cookie/localStorage (not memory), so use
// our document-lifetime gate and supported config instead of changing consent.
export function onRouterTransitionStart(url: string) {
  if (!containsHomeGroupShareUrl(url)) return;
  blockHomeGroupShareAnalytics();
  if (env.NEXT_PUBLIC_POSTHOG_KEY) {
    posthog.set_config({
      capture_pageview: false,
      capture_pageleave: false,
      capture_performance: false,
      autocapture: false,
      disable_session_recording: true,
    });
  }
}
