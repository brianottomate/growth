import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { processLead } from "@/server/services/sync.service";
import {
  extractBearerToken,
  safeTokenEquals,
} from "@/server/utils/webhook-auth";

interface HandleWebhookOptions {
  serviceLabel: string;
  defaultEventType: string;
}

interface NormalizedWebhookPayload {
  email: string | null;
  eventType: string;
  eventData: Record<string, unknown>;
  workflowStep: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Accept both payload styles:
 * 1) New flat payload: { email, event_type, ... }
 * 2) Legacy payload:   { event_name, data: { email, ... } }
 */
function normalizePayload(
  rawPayload: unknown,
  defaultEventType: string,
): NormalizedWebhookPayload {
  const payload = isRecord(rawPayload) ? rawPayload : {};
  const nestedData = isRecord(payload.data) ? payload.data : {};

  const email =
    asString(payload.email) ??
    asString(nestedData.email) ??
    asString(payload.customer_email) ??
    asString(nestedData.customer_email);

  const workflowStep =
    asString(payload.workflow_step) ?? asString(nestedData.workflow_step);

  const eventType =
    asString(payload.event_type) ??
    asString(payload.event_name) ??
    asString(nestedData.event_type) ??
    asString(nestedData.event_name) ??
    workflowStep ??
    defaultEventType;

  const eventData: Record<string, unknown> = {
    ...nestedData,
    ...payload,
  };
  delete eventData.data;
  eventData.event_type = eventType;

  return { email, eventType, eventData, workflowStep };
}

export async function handleCioToOutreachWebhook(
  request: NextRequest,
  options: HandleWebhookOptions,
) {
  const startMs = Date.now();

  try {
    const configuredToken = env.CUSTOMERIO_WEBHOOK_BEARER_TOKEN;
    if (!configuredToken) {
      console.error(
        `❌ [${options.serviceLabel}] CUSTOMERIO_WEBHOOK_BEARER_TOKEN not configured`,
      );
      return NextResponse.json(
        { error: "Webhook auth is not configured" },
        { status: 500 },
      );
    }

    const presentedToken = extractBearerToken(
      request.headers.get("authorization"),
    );
    if (!safeTokenEquals(presentedToken, configuredToken)) {
      console.error(`❌ [${options.serviceLabel}] Invalid bearer token`);
      return NextResponse.json(
        { error: "Invalid bearer token" },
        { status: 401 },
      );
    }

    const rawPayload = (await request.json()) as unknown;
    const normalized = normalizePayload(rawPayload, options.defaultEventType);

    if (!normalized.email) {
      console.warn(
        `⚠️ [${options.serviceLabel}] Missing email; skipping`,
        JSON.stringify(rawPayload).slice(0, 500),
      );
      return NextResponse.json(
        { success: true, skipped: true, reason: "no_email" },
        { status: 200 },
      );
    }

    console.log(
      `📨 [${options.serviceLabel}] Received: ${normalized.eventType} for ${normalized.email} (step: ${normalized.workflowStep ?? "n/a"}, ${Date.now() - startMs}ms)`,
    );

    const result = await processLead({
      email: normalized.email,
      eventType: normalized.eventType,
      eventData: normalized.eventData,
    });

    console.log(
      `📋 [${options.serviceLabel}] Sync result: ${result.status} — ${result.outreachAction ?? "no action"} (${result.processingTimeMs}ms)`,
    );

    return NextResponse.json({
      success: true,
      email: normalized.email,
      eventType: normalized.eventType,
      status: result.status,
      outreachAction: result.outreachAction,
      processingTimeMs: result.processingTimeMs,
    });
  } catch (error) {
    console.error(`❌ [${options.serviceLabel}] Error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
