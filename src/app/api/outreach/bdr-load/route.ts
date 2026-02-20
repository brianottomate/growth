import { NextResponse } from "next/server";
import {
  getUsers,
  getOwnerProspectLoad,
  isOutreachConfigured,
  isOutreachError,
} from "@/server/clients/outreach.client";

interface BdrCandidate {
  outreachUserId: string;
  name: string;
  email: string;
  title: string | null;
  active: boolean;
  locked: boolean;
}

function parseCsvParam(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function toTimestamp(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? Number.POSITIVE_INFINITY : ts;
}

/**
 * BDR load endpoint for assignment workflows.
 *
 * GET /api/outreach/bdr-load
 * GET /api/outreach/bdr-load?activeOnly=true&titleIncludes=bdr
 * GET /api/outreach/bdr-load?activeOnly=true&titleIncludes=bdr&excludeTitleContains=manager,enablement
 * GET /api/outreach/bdr-load?allowUserIds=3,32,33,37
 * GET /api/outreach/bdr-load?includeEmails=serrelle.baker@wander.com,catherine@wander.com
 */
export async function GET(request: Request) {
  if (!isOutreachConfigured) {
    return NextResponse.json(
      {
        success: false,
        error: "Outreach is not configured",
      },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("activeOnly") !== "false";
  const titleIncludes = (searchParams.get("titleIncludes") ?? "bdr")
    .trim()
    .toLowerCase();
  const excludeTitleContains = parseCsvParam(
    searchParams.get("excludeTitleContains"),
  ).map((value) => value.toLowerCase());
  const emailDomain = searchParams.get("emailDomain")?.toLowerCase() ?? null;
  const allowUserIds = new Set(parseCsvParam(searchParams.get("allowUserIds")));
  const excludeUserIds = new Set(
    parseCsvParam(searchParams.get("excludeUserIds")),
  );
  const includeEmails = new Set(
    parseCsvParam(searchParams.get("includeEmails")).map((email) =>
      email.toLowerCase(),
    ),
  );
  const excludeEmails = new Set(
    parseCsvParam(searchParams.get("excludeEmails")).map((email) =>
      email.toLowerCase(),
    ),
  );
  const pageSize = Number.parseInt(searchParams.get("pageSize") ?? "100", 10);
  const cappedPageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 200) : 100;

  try {
    const usersResponse = await getUsers({ pageSize: cappedPageSize });

    let candidates: BdrCandidate[] = usersResponse.data.map((user) => ({
      outreachUserId: String(user.id),
      name: user.attributes.name,
      email: user.attributes.email,
      title: user.attributes.title,
      active: !user.attributes.locked,
      locked: user.attributes.locked,
    }));

    if (activeOnly) {
      candidates = candidates.filter((u) => u.active);
    }

    if (titleIncludes.length > 0) {
      candidates = candidates.filter((u) =>
        (u.title ?? "").toLowerCase().includes(titleIncludes),
      );
    }

    if (excludeTitleContains.length > 0) {
      candidates = candidates.filter(
        (u) =>
          !excludeTitleContains.some((needle) =>
            (u.title ?? "").toLowerCase().includes(needle),
          ),
      );
    }

    if (emailDomain) {
      candidates = candidates.filter((u) =>
        u.email.toLowerCase().endsWith(`@${emailDomain}`),
      );
    }

    if (allowUserIds.size > 0) {
      candidates = candidates.filter((u) => allowUserIds.has(u.outreachUserId));
    }

    if (excludeUserIds.size > 0) {
      candidates = candidates.filter((u) => !excludeUserIds.has(u.outreachUserId));
    }

    if (includeEmails.size > 0) {
      candidates = candidates.filter((u) =>
        includeEmails.has(u.email.toLowerCase()),
      );
    }

    if (excludeEmails.size > 0) {
      candidates = candidates.filter(
        (u) => !excludeEmails.has(u.email.toLowerCase()),
      );
    }

    const loads = await Promise.all(
      candidates.map(async (candidate) => {
        try {
          const load = await getOwnerProspectLoad({
            ownerId: candidate.outreachUserId,
          });
          return {
            ...candidate,
            ...load,
            status: "ok" as const,
          };
        } catch (error) {
          return {
            ...candidate,
            prospectCount: null,
            sampleProspectId: null,
            lastProspectTouchedAt: null,
            lastProspectUpdatedAt: null,
            status: "error" as const,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      }),
    );

    const sortable = loads.filter((l) => l.status === "ok");
    const recommendedNext =
      sortable.length === 0
        ? null
        : [...sortable].sort((a, b) => {
            const countA = a.prospectCount ?? Number.POSITIVE_INFINITY;
            const countB = b.prospectCount ?? Number.POSITIVE_INFINITY;
            if (countA !== countB) return countA - countB;

            const touchedA = toTimestamp(a.lastProspectTouchedAt);
            const touchedB = toTimestamp(b.lastProspectTouchedAt);
            if (touchedA !== touchedB) return touchedA - touchedB;

            return Number(a.outreachUserId) - Number(b.outreachUserId);
          })[0];

    return NextResponse.json({
      success: true,
      totalUsers: usersResponse.meta?.count ?? usersResponse.data.length,
      candidateCount: candidates.length,
      filters: {
        activeOnly,
        titleIncludes,
        excludeTitleContains,
        emailDomain,
        allowUserIds: Array.from(allowUserIds),
        excludeUserIds: Array.from(excludeUserIds),
        includeEmails: Array.from(includeEmails),
        excludeEmails: Array.from(excludeEmails),
        pageSize: cappedPageSize,
      },
      loads,
      recommendation: recommendedNext
        ? {
            outreachUserId: recommendedNext.outreachUserId,
            name: recommendedNext.name,
            email: recommendedNext.email,
            reason:
              "Lowest prospectCount, then oldest lastProspectTouchedAt, then lowest userId",
          }
        : null,
      usage: {
        default: "/api/outreach/bdr-load",
        activeBdrOnly:
          "/api/outreach/bdr-load?activeOnly=true&titleIncludes=bdr",
        excludeManagers:
          "/api/outreach/bdr-load?activeOnly=true&titleIncludes=bdr&excludeTitleContains=manager",
        allowListById:
          "/api/outreach/bdr-load?allowUserIds=3,32,33,37",
        allowListByEmail:
          "/api/outreach/bdr-load?includeEmails=serrelle.baker@wander.com,catherine@wander.com,james.crawford@wander.com",
      },
    });
  } catch (error) {
    console.error("❌ [Outreach BDR Load] Error:", error);

    if (isOutreachError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          statusCode: error.statusCode ?? null,
          retryAfter: error.retryAfter ?? null,
        },
        { status: error.statusCode ?? 500 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
