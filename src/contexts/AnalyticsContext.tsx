"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { track as vercelTrack } from "@vercel/analytics/react";
import posthog from "posthog-js";
import { usePathname } from "next/navigation";
import {
  homeGroupAnalyticsBlocked,
  isHomeGroupSharePath,
} from "@/lib/home-group-share-privacy";

import type {
  AnalyticsMetadata,
  ClientAnalyticsEventName,
  ClientEventPropertiesDefinition,
} from "@/lib/types/analytics.types";
import { sanitizeForVercel } from "@/lib/utils/analytics.utils";
import { env } from "@/env";
import { authClient } from "@/server/better-auth/client";

// =====================================================
// TYPES
// =====================================================

interface AnalyticsContextType {
  trackEvent: <T extends ClientAnalyticsEventName>(
    eventName: T,
    properties?: ClientEventPropertiesDefinition[T],
    meta?: AnalyticsMetadata,
  ) => void;
  identifyUser: () => void;
  reset: () => void;
}

interface ClientAnalyticsProvider {
  name: string;
  trackEvent: <T extends ClientAnalyticsEventName>(
    eventName: T,
    properties?: ClientEventPropertiesDefinition[T],
    meta?: AnalyticsMetadata,
  ) => void;
  identify?: (userId: string, traits: Record<string, unknown>) => void;
  reset?: () => void;
}

// =====================================================
// CONTEXT CREATION
// =====================================================

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(
  undefined,
);

export const useAnalytics = () => {
  const context = useContext(AnalyticsContext);
  if (context === undefined) {
    throw new Error("useAnalytics must be used within an AnalyticsProvider");
  }
  return context;
};

// =====================================================
// PROVIDER COMPONENT
// =====================================================

/**
 * Growth is an internal tool and the client-facing connect pages set no
 * tracking cookies: PostHog is unkeyed in every environment and Vercel Web
 * Analytics is cookieless. The consent banner was asking permission for
 * cookies nothing writes, so it is gone along with the gate it drove.
 */
const untrackedAnalytics: AnalyticsContextType = {
  trackEvent: () => undefined,
  identifyUser: () => undefined,
  reset: () => undefined,
};

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The public view does not even mount the session hook or tracking effects.
  if (isHomeGroupSharePath(pathname) || homeGroupAnalyticsBlocked()) {
    return (
      <AnalyticsContext.Provider value={untrackedAnalytics}>
        {children}
      </AnalyticsContext.Provider>
    );
  }
  return <TrackedAnalyticsProvider>{children}</TrackedAnalyticsProvider>;
}

function TrackedAnalyticsProvider({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const lastIdentifiedUserId = useRef<string | null>(null);

  // instrumentation-client.ts initializes PostHog with pageview capture off
  // because consent used to switch it on. Session recording stays off: that
  // was a consent-gated escalation, not the default.
  useEffect(() => {
    if (!env.NEXT_PUBLIC_POSTHOG_KEY || homeGroupAnalyticsBlocked()) return;
    posthog.set_config({
      capture_pageview: "history_change",
      capture_pageleave: true,
    });
    posthog.capture("$pageview");
  }, []);

  // Analytics providers array
  const providers: ClientAnalyticsProvider[] = useMemo(
    () => [
      // PostHog
      {
        name: "PostHog",
        trackEvent: <T extends ClientAnalyticsEventName>(
          eventName: T,
          properties?: ClientEventPropertiesDefinition[T],
        ) => {
          if (!env.NEXT_PUBLIC_POSTHOG_KEY || homeGroupAnalyticsBlocked())
            return;
          try {
            posthog.capture(eventName, properties);
          } catch (error) {
            console.error("❌ [Analytics] PostHog track failed:", error);
          }
        },
        identify: (userId, traits) => {
          if (!env.NEXT_PUBLIC_POSTHOG_KEY || homeGroupAnalyticsBlocked())
            return;
          try {
            posthog.identify(userId, traits);
          } catch (error) {
            console.error("❌ [Analytics] PostHog identify failed:", error);
          }
        },
        reset: () => {
          if (!env.NEXT_PUBLIC_POSTHOG_KEY || homeGroupAnalyticsBlocked())
            return;
          try {
            posthog.reset();
          } catch (error) {
            console.error("❌ [Analytics] PostHog reset failed:", error);
          }
        },
      },
      // Vercel Analytics
      {
        name: "Vercel",
        trackEvent: <T extends ClientAnalyticsEventName>(
          eventName: T,
          properties?: ClientEventPropertiesDefinition[T],
        ) => {
          try {
            vercelTrack(eventName, sanitizeForVercel(properties));
          } catch (error) {
            console.error("❌ [Analytics] Vercel track failed:", error);
          }
        },
      },
    ],
    [],
  );

  // Track event function
  const trackEvent = useCallback(
    <T extends ClientAnalyticsEventName>(
      eventName: T,
      properties?: ClientEventPropertiesDefinition[T],
      meta?: AnalyticsMetadata,
    ): void => {
      if (homeGroupAnalyticsBlocked()) return;
      console.log("🔵 [Analytics] Client event:", { eventName, properties });
      providers.forEach((provider) =>
        provider.trackEvent(eventName, properties, meta),
      );
    },
    [providers],
  );

  // Identify user function
  const identifyUser = useCallback(() => {
    if (!session.data?.user || homeGroupAnalyticsBlocked()) return;

    const userId = session.data.user.id;

    // Skip if already identified
    if (lastIdentifiedUserId.current === userId) return;

    const user = session.data.user;

    // User traits sent to analytics providers
    const traits = {
      email: user.email,
      name: user.name,
      username: user.username,
    };

    console.log("🔵 [Analytics] Identifying user:", userId);

    // Identify user in PostHog
    providers.forEach((provider) => {
      if (provider.identify) {
        provider.identify(userId, traits);
      }
    });

    // Track organization context if available
    if (
      env.NEXT_PUBLIC_POSTHOG_KEY &&
      session.data.session?.activeOrganizationId
    ) {
      const orgId = session.data.session.activeOrganizationId;
      posthog.group("organization", orgId);
      console.log("🔵 [Analytics] Organization context set:", orgId);
    }

    lastIdentifiedUserId.current = userId;
  }, [session.data, providers]);

  // Reset analytics
  const reset = useCallback(() => {
    if (homeGroupAnalyticsBlocked()) return;
    console.log("🔵 [Analytics] Resetting all providers");
    providers.forEach((provider) => {
      if (provider.reset) {
        provider.reset();
      }
    });
    lastIdentifiedUserId.current = null;
  }, [providers]);

  useEffect(() => {
    if (session.data?.user) identifyUser();
  }, [session.data, identifyUser]);

  return (
    <AnalyticsContext.Provider value={{ trackEvent, identifyUser, reset }}>
      {children}
    </AnalyticsContext.Provider>
  );
}
