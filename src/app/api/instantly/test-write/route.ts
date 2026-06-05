import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import {
  createLead,
  deleteLead,
  getLead,
  isInstantlyConfigured,
  patchLead,
} from "@/server/clients/instantly.client";

/**
 * Smoke-test the Instantly write surface end-to-end.
 *
 * Lifecycle: create → patch (custom_variables) → get → delete on a sentinel
 * lead. Each step's response is returned so you can eyeball whether
 * custom_variables actually round-trip (the canonical pregen write-back use
 * case).
 *
 * GET /api/instantly/test-write
 *   [?list_id=<uuid>]   — optional Instantly lead list to create the lead in
 *   [?keep=1]           — skip the final delete (leaves the lead for manual inspection)
 *
 * Auth: Authorization: Bearer <ADMIN_TOKEN>  (also accepts ?token= or x-admin-token)
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!isInstantlyConfigured) {
    return NextResponse.json(
      { success: false, error: "Instantly is not configured. Set INSTANTLY_API_KEY." },
      { status: 500 },
    );
  }

  const listId = request.nextUrl.searchParams.get("list_id") ?? undefined;
  const keep = request.nextUrl.searchParams.get("keep") === "1";

  const runId = Date.now();
  const sentinelEmail = `claude-smoke-test+${runId}@wander.com`;

  const steps: Array<{ step: string; ok: boolean; data?: unknown; error?: string }> = [];

  // 1. CREATE
  let leadId: string | undefined;
  try {
    const created = await createLead({
      email: sentinelEmail,
      first_name: "Claude",
      last_name: "Smoke Test",
      company_name: "Wander (smoke test)",
      ...(listId ? { list_id: listId } : {}),
      custom_variables: {
        smoke_test_run_id: runId,
        smoke_test_step: "created",
        created_at: new Date().toISOString(),
      },
    });
    leadId = created.id;
    steps.push({ step: "create", ok: true, data: created });
  } catch (error) {
    steps.push({ step: "create", ok: false, error: errorMessage(error) });
    return NextResponse.json({ success: false, sentinelEmail, steps }, { status: 500 });
  }

  // 2. PATCH — write-back custom_variables (the pregen use case shape)
  try {
    const patched = await patchLead(leadId, {
      custom_variables: {
        smoke_test_run_id: runId,
        smoke_test_step: "patched",
        pregen_site_url: "https://wander.com/os/preview?siteId=smoke-test",
        pregen_status: "ready",
        pregen_score: 0.87,
        patched_at: new Date().toISOString(),
      },
    });
    steps.push({ step: "patch", ok: true, data: patched });
  } catch (error) {
    steps.push({ step: "patch", ok: false, error: errorMessage(error) });
  }

  // 3. GET — confirm custom_variables are readable after write
  try {
    const fetched = await getLead(leadId);
    steps.push({ step: "get", ok: true, data: fetched });
  } catch (error) {
    steps.push({ step: "get", ok: false, error: errorMessage(error) });
  }

  // 4. DELETE — clean up unless ?keep=1
  if (!keep) {
    try {
      await deleteLead(leadId);
      steps.push({ step: "delete", ok: true });
    } catch (error) {
      steps.push({ step: "delete", ok: false, error: errorMessage(error) });
    }
  } else {
    steps.push({ step: "delete", ok: true, data: "skipped (keep=1)" });
  }

  const success = steps.every((s) => s.ok);
  return NextResponse.json({ success, sentinelEmail, leadId, steps });
}

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  const queryToken = request.nextUrl.searchParams.get("token");
  const adminTokenHeader = request.headers.get("x-admin-token");
  const token = bearer ?? queryToken ?? adminTokenHeader;
  return token === env.ADMIN_TOKEN;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
