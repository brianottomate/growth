import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { intakeEmailPreferencesSchema } from "@/lib/intake-email-preferences";
import { requireGatewayAuth } from "@/server/services/hubspot-gateway.service";
import {
  INTAKE_CONNECT_KEYS,
  intakeSetup,
  recheckIntakeEmailDomain,
  saveIntakeEmailPreferences,
  selectIntakeMetaAccount,
  startIntakeConnect,
  syncIntakeConnect,
} from "@/server/services/performance-intake-setup.service";

const token = z.string().min(16).max(200);

/**
 * The intake's sections after sending, for wander.com. Token only: a slug
 * link never sees what was sent or what is connected.
 *
 * GET /api/intake/v1/setup?token=...   every section's live state
 * POST /api/intake/v1/setup            one action, by `action`
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireGatewayAuth(request);
  if (unauthorized) return unauthorized;

  const parsed = token.safeParse(request.nextUrl.searchParams.get("token"));
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }
  const setup = await intakeSetup(parsed.data);
  return setup
    ? NextResponse.json(setup)
    : NextResponse.json({ error: "Unknown link" }, { status: 404 });
}

const actionSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("connect"),
    token,
    channel: z.enum(INTAKE_CONNECT_KEYS),
  }),
  z.strictObject({
    action: z.literal("sync"),
    token,
    connected: z.string().max(40),
  }),
  z.strictObject({
    action: z.literal("metaAccount"),
    token,
    adAccountId: z.string().regex(/^act_\d+$/),
  }),
  z.strictObject({ action: z.literal("emailCheck"), token }),
  z.strictObject({
    action: z.literal("emailPreferences"),
    token,
    replyTo: z.email().max(320),
    preferences: intakeEmailPreferencesSchema,
    /** The email footer's sender, which marketing email must show. */
    legalName: z.string().trim().min(1).max(200).optional(),
    address: z
      .strictObject({
        line1: z.string().trim().min(1).max(200),
        line2: z.string().trim().max(200).nullable(),
        city: z.string().trim().min(1).max(100),
        region: z.string().trim().max(100).nullable(),
        postalCode: z.string().trim().max(20).nullable(),
        country: z.string().trim().length(2).toUpperCase(),
      })
      .optional(),
  }),
]);

export async function POST(request: NextRequest) {
  const unauthorized = requireGatewayAuth(request);
  if (unauthorized) return unauthorized;

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const input = parsed.data;

  try {
    const result = await run(input);
    return result
      ? NextResponse.json(result)
      : NextResponse.json({ error: "Unknown link" }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (input.action === "connect" && message === "already_connected") {
      return NextResponse.json({ alreadyConnected: true });
    }
    if (message === "Unknown connect link") {
      return NextResponse.json({ error: "Unknown link" }, { status: 404 });
    }
    console.error(`intake setup ${input.action} failed`, error);
    return NextResponse.json({ error: "Setup failed" }, { status: 502 });
  }
}

async function run(input: z.infer<typeof actionSchema>) {
  switch (input.action) {
    case "connect":
      return {
        url: await startIntakeConnect(input.token, input.channel),
      };
    case "sync":
      return syncIntakeConnect(input.token, input.connected);
    case "metaAccount":
      return {
        saved: await selectIntakeMetaAccount(input.token, input.adAccountId),
      };
    case "emailCheck":
      return recheckIntakeEmailDomain(input.token);
    case "emailPreferences":
      return saveIntakeEmailPreferences(input.token, input);
  }
}
