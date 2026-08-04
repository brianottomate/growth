import "server-only";

import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import {
  firecrawl,
  isFirecrawlConfigured,
} from "@/server/clients/firecrawl.client";
import { R2 } from "@/server/clients/r2.client";
import { db } from "@/server/db";
import {
  pregenNativeBuildTable,
  pregenNativeCrawlPageTable,
} from "@/server/db/schema";

import {
  sourceGeometrySchema,
  type PregenSourceVisualReceipt,
} from "./source-visual-types";

const CAPTURE_VIEWPORTS = [
  { name: "desktop" as const, width: 1440, height: 900, mobile: false },
  { name: "mobile" as const, width: 390, height: 844, mobile: true },
];

const SOURCE_GEOMETRY_SCRIPT = String.raw`(() => {
  const tidy = (value, max = 140) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 80 && rect.height > 48 && style.display !== "none" && style.visibility !== "hidden";
  };
  const landmarks = [];
  const header = document.querySelector("header");
  if (header && visible(header)) landmarks.push({ element: header, label: "Header" });
  const headings = Array.from(document.querySelectorAll(
    "main h1, main h2, main h3, [role='main'] h1, [role='main'] h2, [role='main'] h3"
  )).filter(visible);
  for (const heading of headings) {
    let element = heading.closest("section, article, [data-section], [role='region']") || heading.parentElement || heading;
    let rect = element.getBoundingClientRect();
    if (rect.height > 5000 && heading.parentElement) element = heading.parentElement;
    landmarks.push({ element, label: tidy(heading.textContent) });
  }
  const footer = document.querySelector("footer");
  if (footer && visible(footer)) landmarks.push({ element: footer, label: "Footer" });
  if (landmarks.length < 4) {
    for (const element of Array.from(document.querySelectorAll("main > *, [role='main'] > *")).filter(visible)) {
      landmarks.push({ element, label: null });
    }
  }
  landmarks.sort((a, b) => a.element.getBoundingClientRect().top - b.element.getBoundingClientRect().top);
  const seen = new Set();
  const sections = [];
  for (const landmark of landmarks) {
    const element = landmark.element;
    const rect = element.getBoundingClientRect();
    const key = [Math.round(rect.top + scrollY), landmark.label || ""].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    const heading = element.querySelector("h1, h2, h3");
    const style = getComputedStyle(element);
    const background = style.backgroundImage && style.backgroundImage !== "none" ? style.backgroundImage : null;
    sections.push({
      index: sections.length,
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role"),
      label: landmark.label || tidy(element.getAttribute("aria-label") || element.getAttribute("data-section") || heading?.textContent || element.id || element.tagName),
      x: Math.round(rect.left + scrollX),
      y: Math.round(rect.top + scrollY),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      headingCount: element.querySelectorAll("h1, h2, h3, h4").length,
      imageCount: element.querySelectorAll("img, picture, video").length,
      linkCount: element.querySelectorAll("a, button").length,
      backgroundImage: background ? tidy(background, 500) : null,
    });
    if (sections.length >= 24) break;
  }
  return JSON.stringify({
    version: "source-geometry/v1",
    viewport: { width: innerWidth, height: innerHeight },
    document: {
      width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
      height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0) > innerWidth + 1,
    },
    sections,
  });
})()`;

export async function capturePregenSourceVisual(
  buildId: string,
): Promise<PregenSourceVisualReceipt> {
  if (!isFirecrawlConfigured) {
    throw new Error("Firecrawl is not configured");
  }

  const [build, homepage] = await Promise.all([
    db.query.pregenNativeBuildTable.findFirst({
      where: eq(pregenNativeBuildTable.id, buildId),
      columns: { id: true },
      with: { prospect: { columns: { sourceUrl: true } } },
    }),
    db.query.pregenNativeCrawlPageTable.findFirst({
      where: and(
        eq(pregenNativeCrawlPageTable.buildId, buildId),
        eq(pregenNativeCrawlPageTable.kind, "homepage"),
      ),
      columns: { id: true, url: true, metadata: true },
    }),
  ]);

  if (!build?.prospect || !homepage) {
    throw new Error(`No homepage crawl exists for build ${buildId}`);
  }

  const capturedAt = new Date().toISOString();
  let finalUrl = homepage.url;
  const captures: PregenSourceVisualReceipt["captures"] = [];

  for (const viewport of CAPTURE_VIEWPORTS) {
    const result = await firecrawl.scrape(build.prospect.sourceUrl, {
      formats: ["markdown"],
      onlyMainContent: false,
      blockAds: true,
      waitFor: 4_000,
      timeout: 60_000,
      proxy: "auto",
      mobile: viewport.mobile,
      actions: [
        { type: "wait", milliseconds: 1_000 },
        {
          type: "screenshot",
          fullPage: false,
          quality: 60,
          viewport: { width: viewport.width, height: viewport.height },
        },
        { type: "executeJavascript", script: SOURCE_GEOMETRY_SCRIPT },
        {
          type: "screenshot",
          fullPage: true,
          quality: 88,
          viewport: { width: viewport.width, height: viewport.height },
        },
      ],
    });

    const screenshotUrl = findActionScreenshot(result.actions);
    if (!screenshotUrl) {
      throw new Error(`Firecrawl returned no ${viewport.name} screenshot`);
    }

    const geometry = findGeometry(result.actions);
    if (!geometry) {
      throw new Error(`Firecrawl returned no ${viewport.name} geometry`);
    }

    const screenshotResponse = await fetch(screenshotUrl, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!screenshotResponse.ok) {
      throw new Error(
        `Could not download ${viewport.name} screenshot (${screenshotResponse.status})`,
      );
    }

    const body = Buffer.from(await screenshotResponse.arrayBuffer());
    const contentType =
      screenshotResponse.headers.get("content-type") ?? "image/jpeg";
    const dimensions = readImageDimensions(body, contentType);
    const extension = contentType.includes("png") ? "png" : "jpg";
    const screenshotKey = R2.buildUploadKey(
      "pregen-source",
      buildId,
      `${viewport.name}-${capturedAt.replace(/[:.]/g, "-")}.${extension}`,
    );
    const durableScreenshotUrl = await R2.putBuffer(
      screenshotKey,
      body,
      contentType,
    );

    finalUrl = readFinalUrl(result.metadata, finalUrl);
    captures.push({
      viewport: viewport.name,
      width: dimensions.width,
      height: dimensions.height,
      fullPage: true,
      screenshotUrl: durableScreenshotUrl,
      screenshotKey,
      sha256: createHash("sha256").update(body).digest("hex"),
      contentType,
      bytes: body.byteLength,
      geometry,
    });
  }

  const receipt: PregenSourceVisualReceipt = {
    version: "source-visual/v1",
    buildId,
    crawlPageId: homepage.id,
    requestedUrl: build.prospect.sourceUrl,
    finalUrl,
    capturedAt,
    engine: "firecrawl-v2",
    captures,
  };

  await db
    .update(pregenNativeCrawlPageTable)
    .set({
      metadata: {
        ...(homepage.metadata ?? {}),
        sourceVisualReceipt: receipt,
      },
    })
    .where(eq(pregenNativeCrawlPageTable.id, homepage.id));

  return receipt;
}

function findActionScreenshot(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const screenshots = (value as Record<string, unknown>).screenshots;
  if (!Array.isArray(screenshots)) return null;
  const urls = screenshots.filter(
    (item): item is string => typeof item === "string" && isUrl(item),
  );
  return urls.at(-1) ?? null;
}

function findGeometry(value: unknown) {
  const candidates: unknown[] = [value];
  while (candidates.length > 0) {
    const candidate = candidates.shift();
    if (typeof candidate === "string") {
      try {
        candidates.push(JSON.parse(candidate));
      } catch {
        // Not a JSON action result.
      }
      continue;
    }
    const parsed = sourceGeometrySchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
    if (Array.isArray(candidate)) {
      for (const item of candidate as unknown[]) candidates.push(item);
    } else if (candidate && typeof candidate === "object") {
      for (const item of Object.values(candidate as Record<string, unknown>)) {
        candidates.push(item);
      }
    }
  }
  return null;
}

function readFinalUrl(
  metadata: Record<string, unknown> | undefined,
  fallback: string,
): string {
  const value = metadata?.sourceURL ?? metadata?.url;
  return typeof value === "string" && URL.canParse(value) ? value : fallback;
}

function readImageDimensions(
  body: Buffer,
  contentType: string,
): { width: number; height: number } {
  if (contentType.includes("png") && body.length >= 24) {
    return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
  }

  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    let offset = 2;
    while (offset + 9 < body.length) {
      if (body[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = body[offset + 1];
      if (marker === undefined) break;
      const length = body.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          height: body.readUInt16BE(offset + 5),
          width: body.readUInt16BE(offset + 7),
        };
      }
      if (length < 2) break;
      offset += length + 2;
    }
  }

  throw new Error(`Unsupported screenshot image type: ${contentType}`);
}

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
