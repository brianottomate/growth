import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";
import {
  runGrowthWorkflow,
  type GrowthWorkflowName,
} from "@/server/services/growth-workflows.service";

const WORKFLOW_NAMES: GrowthWorkflowName[] = [
  "daily_comprehensive_sync",
  "outreach_auto_healing",
  "bdr_alignment_backfill",
  "backfill_checkout",
];

function isWorkflowName(value: string | null): value is GrowthWorkflowName {
  return !!value && WORKFLOW_NAMES.includes(value as GrowthWorkflowName);
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

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

function parseNumber(
  value: string | null,
  fallback: number,
  bounds?: { min?: number; max?: number },
): number {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;

  const min = bounds?.min ?? Number.NEGATIVE_INFINITY;
  const max = bounds?.max ?? Number.POSITIVE_INFINITY;
  return Math.max(min, Math.min(max, parsed));
}

async function runFromRequest(request: NextRequest) {
  const workflowParam = request.nextUrl.searchParams.get("job");

  if (!isWorkflowName(workflowParam)) {
    return NextResponse.json(
      {
        success: false,
        error: "Missing or invalid ?job= parameter",
        allowedJobs: WORKFLOW_NAMES,
      },
      { status: 400 },
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized",
      },
      { status: 401 },
    );
  }

  const dryRun = parseBoolean(
    request.nextUrl.searchParams.get("dryRun"),
    false,
  );
  const limit = parseNumber(request.nextUrl.searchParams.get("limit"), 1000, {
    min: 1,
    max: 10000,
  });
  const hoursBack = parseNumber(
    request.nextUrl.searchParams.get("hoursBack"),
    workflowParam === "outreach_auto_healing" ? 48 : 24,
    { min: 1, max: 720 },
  );
  const concurrency = parseNumber(
    request.nextUrl.searchParams.get("concurrency"),
    8,
    { min: 1, max: 25 },
  );
  const since = request.nextUrl.searchParams.get("since") ?? undefined;

  const result = await runGrowthWorkflow(workflowParam, {
    dryRun,
    limit,
    hoursBack,
    concurrency,
    sinceDate: since,
  });

  return NextResponse.json({
    success: true,
    workflow: workflowParam,
    options: {
      dryRun,
      limit,
      hoursBack,
      concurrency,
      ...(since ? { since } : {}),
    },
    result,
  });
}

export async function GET(request: NextRequest) {
  const job = request.nextUrl.searchParams.get("job");

  if (!job) {
    return NextResponse.json({
      status: "ok",
      service: "growth-cron",
      allowedJobs: WORKFLOW_NAMES,
      usage: "GET /api/cron/growth?job=daily_comprehensive_sync",
      auth: "Pass Authorization: Bearer <ADMIN_TOKEN>",
      timestamp: new Date().toISOString(),
    });
  }

  return runFromRequest(request);
}

export async function POST(request: NextRequest) {
  return runFromRequest(request);
}
