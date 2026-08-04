import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  pregenNativeBuildTable,
  type PregenNativeBuildStep,
} from "@/server/db/schema";
import {
  parsePregenSourceVisualReceipt,
  type PregenSourceVisualReceipt,
} from "@/server/services/pregen/source-visual-types";

export type PregenLiveRun = {
  prospect: {
    id: string;
    name: string;
    domain: string;
    sourceUrl: string;
    status: string;
  };
  build: {
    id: string;
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
    steps: Array<{
      step: PregenNativeBuildStep;
      startedAt: string;
      finishedAt: string | null;
      stats: Record<string, number>;
      error: string | null;
    }>;
  };
  sourceCapture: {
    pageCount: number;
    byKind: Array<{ kind: string; count: number }>;
    screenshot: "captured" | "not-captured";
    geometry: "captured" | "not-captured";
    visualReceipt: PregenSourceVisualReceipt | null;
  };
  sourcePreview: {
    url: string;
    state: "live" | "blocked" | "unavailable";
    checkedAt: string;
  };
  artifact: {
    id: string;
    version: number;
    createdAt: string;
    pageCount: number;
    sections: Array<{
      id: string;
      index: number;
      type: string;
      label: string;
    }>;
  };
  extractedPropertyCount: number;
  preview: {
    url: string;
    state: "live" | "unavailable";
    checkedAt: string;
  };
};

export async function loadPregenLiveRun(
  buildId?: string,
): Promise<PregenLiveRun | null> {
  const build = await db.query.pregenNativeBuildTable.findFirst({
    where: buildId
      ? eq(pregenNativeBuildTable.id, buildId)
      : eq(pregenNativeBuildTable.status, "succeeded"),
    orderBy: [desc(pregenNativeBuildTable.createdAt)],
    with: {
      prospect: true,
      artifact: true,
      crawlPages: {
        columns: { kind: true, metadata: true },
      },
    },
  });

  if (!build?.prospect || !build.artifact) return null;
  const artifact = build.artifact;
  const prospect = build.prospect;

  const sectionRows = artifact.pages.flatMap((page, pageIndex) =>
    page.sections.map((section, sectionIndex) => {
      const record = asRecord(section);
      const type =
        readString(record, "type") ??
        readString(record, "kind") ??
        readString(record, "blockType") ??
        "unknown-section";

      return {
        id: `${page.slug}-${sectionIndex}`,
        index: sectionRowsIndex(artifact.pages, pageIndex, sectionIndex),
        type,
        label: humanize(type),
      };
    }),
  );

  const kindCounts = new Map<string, number>();
  let visualReceipt: PregenSourceVisualReceipt | null = null;
  for (const page of build.crawlPages) {
    kindCounts.set(page.kind, (kindCounts.get(page.kind) ?? 0) + 1);
    if (page.kind === "homepage") {
      visualReceipt = parsePregenSourceVisualReceipt(
        page.metadata?.sourceVisualReceipt,
      );
    }
  }

  const previewBaseUrl =
    process.env.NODE_ENV === "development"
      ? "http://localhost:4400"
      : "https://pregen-preview.vercel.app";
  const previewUrl = `${previewBaseUrl}/p/${encodeURIComponent(prospect.previewToken)}`;
  const [previewState, sourcePreview] = await Promise.all([
    checkPreview(previewUrl),
    checkSourcePreview(prospect.sourceUrl),
  ]);

  return {
    prospect: {
      id: prospect.id,
      name: prospect.name ?? prospect.domain,
      domain: prospect.domain,
      sourceUrl: prospect.sourceUrl,
      status: prospect.status,
    },
    build: {
      id: build.id,
      status: build.status,
      startedAt: build.startedAt?.toISOString() ?? null,
      finishedAt: build.finishedAt?.toISOString() ?? null,
      steps: build.stepLog.map((entry) => ({
        step: entry.step,
        startedAt: entry.startedAt,
        finishedAt: entry.finishedAt ?? null,
        stats: entry.stats ?? {},
        error: entry.error ?? null,
      })),
    },
    sourceCapture: {
      pageCount: build.crawlPages.length,
      byKind: [...kindCounts.entries()]
        .map(([kind, count]) => ({ kind, count }))
        .sort((a, b) => a.kind.localeCompare(b.kind)),
      screenshot: visualReceipt ? "captured" : "not-captured",
      geometry: visualReceipt ? "captured" : "not-captured",
      visualReceipt,
    },
    sourcePreview,
    artifact: {
      id: artifact.id,
      version: artifact.version,
      createdAt: artifact.createdAt.toISOString(),
      pageCount: artifact.pages.length,
      sections: sectionRows,
    },
    extractedPropertyCount: build.extractedProperties?.length ?? 0,
    preview: {
      url: previewUrl,
      state: previewState,
      checkedAt: new Date().toISOString(),
    },
  };
}

async function checkSourcePreview(
  url: string,
): Promise<PregenLiveRun["sourcePreview"]> {
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(4_000),
    });
    const finalUrl = response.url || url;

    if (!response.ok) {
      return { url: finalUrl, state: "unavailable", checkedAt };
    }

    const xFrameOptions = response.headers
      .get("x-frame-options")
      ?.toLowerCase();
    const contentSecurityPolicy = response.headers
      .get("content-security-policy")
      ?.toLowerCase();
    const hasFrameAncestors = contentSecurityPolicy
      ?.split(";")
      .some((directive) => directive.trim().startsWith("frame-ancestors"));

    if (xFrameOptions || hasFrameAncestors) {
      return { url: finalUrl, state: "blocked", checkedAt };
    }

    return { url: finalUrl, state: "live", checkedAt };
  } catch {
    return { url, state: "unavailable", checkedAt };
  }
}

async function checkPreview(url: string): Promise<"live" | "unavailable"> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok ? "live" : "unavailable";
  } catch {
    return "unavailable";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function humanize(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sectionRowsIndex(
  pages: Array<{ sections: unknown[] }>,
  pageIndex: number,
  sectionIndex: number,
): number {
  return (
    pages
      .slice(0, pageIndex)
      .reduce((total, page) => total + page.sections.length, 0) +
    sectionIndex +
    1
  );
}
