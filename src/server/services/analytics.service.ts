import { headers } from "next/headers";
import { track as vercelServerTrack } from "@vercel/analytics/server";
import { ipAddress, waitUntil } from "@vercel/functions";

import type {
  AnalyticsMetadata,
  ServerAnalyticsEventName,
  ServerEventPropertiesDefinition,
  UserTraits,
} from "@/lib/types/analytics.types";
import { omitNullish, sanitizeForVercel } from "@/lib/utils/analytics.utils";

// Import PostHog client functions
import {
  captureEvent as posthogCapture,
  identifyUser as posthogIdentify,
  isPostHogConfigured,
} from "@/server/clients/posthog.client";

// =====================================================
// PROVIDER INTERFACE
// =====================================================

interface ServerAnalyticsProvider {
  id: string;
  trackServerEvent?: <T extends ServerAnalyticsEventName>(
    userId: string,
    event: T,
    properties: ServerEventPropertiesDefinition[T],
    meta?: AnalyticsMetadata,
  ) => Promise<unknown> | void;
  identifyServerUser?: (
    userId: string,
    traits: UserTraits,
  ) => Promise<unknown> | void;
}

// =====================================================
// PROVIDER CONFIGURATION
// =====================================================

const serverAnalyticsProviders: ServerAnalyticsProvider[] = [
  // PostHog (only if configured)
  ...(isPostHogConfigured
    ? [
        {
          id: "posthog" as const,
          trackServerEvent: <T extends ServerAnalyticsEventName>(
            userId: string,
            event: T,
            properties: ServerEventPropertiesDefinition[T],
            meta?: AnalyticsMetadata,
          ) => {
            return posthogCapture({
              distinctId: userId,
              event,
              properties: properties as Record<string, unknown>,
              timestamp: meta?.timestamp,
              groups: meta?.groups as Record<string, string | number> | undefined,
            });
          },
          identifyServerUser: (userId: string, traits: UserTraits) => {
            return posthogIdentify({
              distinctId: userId,
              properties: omitNullish(traits),
            });
          },
        },
      ]
    : []),
  // Vercel Analytics (always enabled)
  {
    id: "vercel",
    trackServerEvent: <T extends ServerAnalyticsEventName>(
      userId: string,
      event: T,
      properties: ServerEventPropertiesDefinition[T],
    ) => {
      return vercelServerTrack(
        event,
        sanitizeForVercel({
          userId,
          ...properties,
        }),
      );
    },
  },
  // Optional: Slack notifications for critical events
  // {
  //   id: "slack",
  //   trackServerEvent: <T extends ServerAnalyticsEventName>(
  //     userId: string,
  //     event: T,
  //     properties: ServerEventPropertiesDefinition[T],
  //   ) => {
  //     // Only send to Slack for specific critical events
  //     const criticalEvents: ServerAnalyticsEventName[] = ["user_signed_up"];
  //
  //     if (criticalEvents.includes(event)) {
  //       return slackNotify({
  //         emoji: "🎉",
  //         title: `${event.replace(/_/g, " ").toUpperCase()}`,
  //         fields: {
  //           userId,
  //           ...properties,
  //         },
  //         context: event,
  //       });
  //     }
  //   },
  // },
];

// =====================================================
// PUBLIC API
// =====================================================

/**
 * Track a server-side analytics event
 *
 * Fire-and-forget operation using waitUntil - doesn't block HTTP response.
 * Auto-enriches with IP address for PostHog GeoIP.
 *
 * @example
 * ```ts
 * trackServerEvent(userId, "user_signed_up", {
 *   email: "user@example.com",
 *   method: "google"
 * });
 * ```
 */
export function trackServerEvent<T extends ServerAnalyticsEventName>(
  userId: string,
  event: T,
  properties: ServerEventPropertiesDefinition[T],
  meta?: AnalyticsMetadata,
): void {
  console.log("🔵 [Analytics] Tracking server event:", {
    userId,
    event,
    properties,
  });

  waitUntil(
    (async () => {
      try {
        // Auto-extract IP for PostHog GeoIP if not provided
        const ip = meta?.ip ?? ipAddress({ headers: await headers() });
        const enrichedMeta = ip ? { ...meta, ip } : meta;

        // Send to all providers in parallel
        await Promise.allSettled(
          serverAnalyticsProviders.map(async (provider) => {
            if (provider.trackServerEvent) {
              await provider.trackServerEvent(
                userId,
                event,
                properties,
                enrichedMeta,
              );
            }
          }),
        );

        console.log("✅ [Analytics] Server event tracked:", { event });
      } catch (error) {
        console.error("❌ [Analytics] Failed to track server event:", {
          error: error instanceof Error ? error.message : "Unknown error",
          event,
          userId,
        });
      }
    })(),
  );
}

/**
 * Identify a user with their traits (profile information)
 *
 * Fire-and-forget operation using waitUntil.
 *
 * @example
 * ```ts
 * identifyServerUser(userId, {
 *   email: "user@example.com",
 *   name: "John Doe"
 * });
 * ```
 */
export function identifyServerUser(userId: string, traits: UserTraits): void {
  console.log("🔵 [Analytics] Identifying user:", { userId, traits });

  for (const provider of serverAnalyticsProviders) {
    if (provider.identifyServerUser) {
      waitUntil(
        Promise.resolve(provider.identifyServerUser(userId, traits)).catch(
          (error) => {
            console.error("❌ [Analytics] Failed to identify user:", {
              error: error instanceof Error ? error.message : "Unknown error",
              provider: provider.id,
              userId,
            });
          },
        ),
      );
    }
  }
}
