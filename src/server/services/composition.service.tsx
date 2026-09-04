import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { ImageResponse } from "next/og";

import {
  getCompositionFormat,
  getCompositionIdentity,
  type CompositionSpec,
  type FreezeCompositionInput,
} from "@/lib/compositions";
import { R2 } from "@/server/clients/r2.client";
import { db } from "@/server/db";
import { brandTable, mediaAssetTable, memberTable } from "@/server/db/schema";
import { fetchSatoriImageSource } from "@/server/services/composition-source";
import { importImageBuffer } from "@/server/services/media.service";

export type CompositionContext = {
  brand: {
    id: string;
    name: string;
    organizationId: string;
    brandIdentity: {
      colorScheme?: "light" | "dark";
      colors?: { primary?: string; secondary?: string; accent?: string };
    } | null;
  };
  sourceUrl: string | null;
  /** The source as satori can render it: a data URI in a format it decodes. */
  sourceImage: string | null;
};

export class CompositionAccessError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 404 | 422,
  ) {
    super(message);
  }
}

function safeHex(value: string | undefined, fallback: string) {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function safeFilename(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "composition"
  );
}

function clamp(value: string | undefined, max: number) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;
}

function wrapText(value: string, maxCharacters: number) {
  return value.split(/\s+/).reduce<string[]>((lines, word) => {
    const current = lines.at(-1);
    if (!current || current.length + word.length + 1 > maxCharacters) {
      lines.push(word);
    } else {
      lines[lines.length - 1] = `${current} ${word}`;
    }
    return lines;
  }, []);
}

export async function resolveCompositionContext(
  userId: string,
  spec: CompositionSpec,
): Promise<CompositionContext> {
  const brand = await db.query.brandTable.findFirst({
    where: and(eq(brandTable.id, spec.brandId), isNull(brandTable.deletedAt)),
    columns: {
      id: true,
      name: true,
      organizationId: true,
      brandIdentity: true,
    },
  });
  if (!brand?.organizationId) {
    throw new CompositionAccessError("Brand not found", 404);
  }

  const membership = await db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.userId, userId),
      eq(memberTable.organizationId, brand.organizationId),
    ),
    columns: { id: true },
  });
  if (!membership) {
    throw new CompositionAccessError("No access to this brand", 403);
  }

  let sourceUrl: string | null = null;
  if (spec.sourceMediaAssetId) {
    const source = await db.query.mediaAssetTable.findFirst({
      where: and(
        eq(mediaAssetTable.id, spec.sourceMediaAssetId),
        eq(mediaAssetTable.brandId, brand.id),
        eq(mediaAssetTable.provider, "r2"),
        eq(mediaAssetTable.kind, "image"),
        eq(mediaAssetTable.status, "ready"),
        isNull(mediaAssetTable.deletedAt),
      ),
      columns: { url: true },
    });
    if (!source?.url || !R2.isPublicUrl(source.url)) {
      throw new CompositionAccessError(
        "Choose a ready image from this brand's library",
        422,
      );
    }
    sourceUrl = source.url;
  }

  if (spec.templateId !== "brand-statement" && !sourceUrl) {
    throw new CompositionAccessError(
      "This blueprint needs a source image",
      422,
    );
  }

  return {
    brand: {
      ...brand,
      organizationId: brand.organizationId,
      brandIdentity: brand.brandIdentity ?? null,
    },
    sourceUrl,
    sourceImage: sourceUrl ? await fetchSatoriImageSource(sourceUrl) : null,
  };
}

function BrandMark({
  brandName,
  inverse = false,
  markSize = 36,
  textSize = 24,
}: {
  brandName: string;
  inverse?: boolean;
  markSize?: number;
  textSize?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        color: inverse ? "#ffffff" : "#111111",
        fontSize: textSize,
        fontWeight: 700,
        letterSpacing: "-0.02em",
      }}
    >
      <div
        style={{
          display: "flex",
          width: markSize,
          height: markSize,
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: Math.round(markSize * 0.34),
          background: inverse ? "rgba(255,255,255,0.2)" : "#111111",
          color: "#ffffff",
          fontSize: Math.round(markSize * 0.48),
        }}
      >
        {brandName.slice(0, 1).toUpperCase()}
      </div>
      {clamp(brandName, 32)}
    </div>
  );
}

function Message({
  spec,
  color,
  titleSize,
}: {
  spec: CompositionSpec;
  color: string;
  titleSize: number;
}) {
  const titleLines = wrapText(
    clamp(spec.title, 120),
    spec.formatId === "story"
      ? 22
      : spec.formatId === "portrait" || spec.formatId === "square"
        ? 26
        : 42,
  );
  const subtitleLines = wrapText(
    clamp(spec.subtitle, 220),
    spec.formatId === "story"
      ? 44
      : spec.formatId === "portrait" || spec.formatId === "square"
        ? 52
        : 76,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", color }}>
      {spec.eyebrow ? (
        <div
          style={{
            display: "flex",
            marginBottom: 20,
            fontSize: Math.max(18, titleSize * 0.3),
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          {clamp(spec.eyebrow, 40)}
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          maxWidth: "100%",
          fontSize: titleSize,
          fontWeight: 760,
          lineHeight: 0.98,
          letterSpacing: "-0.045em",
        }}
      >
        {titleLines.map((line) => (
          <div key={line} style={{ display: "flex" }}>
            {line}
          </div>
        ))}
      </div>
      {spec.subtitle ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            marginTop: 24,
            maxWidth: "92%",
            fontSize: Math.max(21, titleSize * 0.36),
            lineHeight: 1.28,
            opacity: 0.78,
          }}
        >
          {subtitleLines.map((line) => (
            <div key={line} style={{ display: "flex" }}>
              {line}
            </div>
          ))}
        </div>
      ) : null}
      {spec.cta ? (
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            marginTop: 30,
            padding: "13px 20px",
            borderRadius: 999,
            background: color,
            color: color === "#ffffff" ? "#111111" : "#ffffff",
            fontSize: Math.max(18, titleSize * 0.28),
            fontWeight: 700,
          }}
        >
          {clamp(spec.cta, 60)}
        </div>
      ) : null}
    </div>
  );
}

function resolveAccent(spec: CompositionSpec, context: CompositionContext) {
  return safeHex(
    spec.accent ??
      context.brand.brandIdentity?.colors?.accent ??
      context.brand.brandIdentity?.colors?.primary,
    "#18a8b5",
  );
}

/**
 * Everything a render reads: the spec's identity plus the brand inputs the
 * templates draw, the name in the mark and the resolved accent. Stored on the
 * asset and matched on reuse, so a rename or a palette change renders again.
 */
function renderInputs(
  spec: FreezeCompositionInput,
  context: CompositionContext,
) {
  return {
    ...getCompositionIdentity(spec),
    brandName: context.brand.name,
    renderedAccent: resolveAccent(spec, context),
  };
}

export function renderComposition(
  spec: CompositionSpec,
  context: CompositionContext,
) {
  const format = getCompositionFormat(spec.formatId);
  const accent = resolveAccent(spec, context);
  const portrait = format.height > format.width;
  const square = format.height === format.width;
  const padding = portrait ? 68 : 58;
  const titleSize = portrait ? 78 : 68;
  const imagePosition =
    spec.imagePosition === "top"
      ? "center top"
      : spec.imagePosition === "bottom"
        ? "center bottom"
        : "center center";

  let content: React.ReactNode;
  if (spec.templateId === "image-hero") {
    content = (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
          background: "#111111",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={context.sourceImage!}
          alt=""
          width={format.width}
          height={format.height}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: imagePosition,
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.54) 48%, rgba(0,0,0,0.08) 100%)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            position: "absolute",
            inset: 0,
            padding,
          }}
        >
          <BrandMark brandName={context.brand.name} inverse />
          <div style={{ display: "flex", maxWidth: portrait ? "92%" : "64%" }}>
            <Message spec={spec} color="#ffffff" titleSize={titleSize} />
          </div>
        </div>
      </div>
    );
  } else if (spec.templateId === "split-frame") {
    content = (
      <div
        style={{
          display: "flex",
          flexDirection: portrait ? "column" : "row",
          width: "100%",
          height: "100%",
          padding,
          gap: 46,
          background: "#f5f4f0",
          color: "#111111",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: portrait ? "100%" : "44%",
            height: portrait ? "43%" : "100%",
          }}
        >
          <BrandMark brandName={context.brand.name} />
          <Message spec={spec} color="#111111" titleSize={portrait ? 72 : 62} />
        </div>
        <div
          style={{
            display: "flex",
            flex: 1,
            padding: 14,
            borderRadius: 34,
            background: "#181818",
            boxShadow: "0 24px 60px rgba(0,0,0,0.24)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={context.sourceImage!}
            alt=""
            width={format.width}
            height={format.height}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: imagePosition,
              borderRadius: 22,
            }}
          />
        </div>
      </div>
    );
  } else if (spec.templateId === "editorial-overlay") {
    content = (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
          background: "#111111",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={context.sourceImage!}
          alt=""
          width={format.width}
          height={format.height}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: imagePosition,
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.08) 72%)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            position: "absolute",
            inset: 0,
            padding,
          }}
        >
          <BrandMark brandName={context.brand.name} inverse />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                width: 90,
                height: 8,
                marginBottom: 28,
                borderRadius: 8,
                background: accent,
              }}
            />
            <Message
              spec={spec}
              color="#ffffff"
              titleSize={portrait ? 84 : 72}
            />
          </div>
        </div>
      </div>
    );
  } else if (spec.templateId === "product-proof") {
    const landscape = format.width > format.height;
    const proofPadding = square ? 80 : padding;
    const copyWidth = landscape ? "46%" : square ? "48%" : "70%";
    const proofWidth = landscape ? "48%" : square ? "51%" : "72%";
    const proofHeight = landscape ? "82%" : square ? "65%" : "56%";
    const proofRight = landscape ? -24 : square ? -18 : -96;
    const proofBottom = landscape ? -30 : square ? -42 : -82;
    const proofTitleSize = landscape ? 58 : square ? 68 : 78;
    const proofSubtitleSize = landscape ? 25 : square ? 30 : 34;
    content = (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
          padding: proofPadding,
          color: "#17171b",
          background: "#f4f1ea",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "relative",
            width: "100%",
            height: "100%",
          }}
        >
          <BrandMark
            brandName={context.brand.name}
            markSize={square ? 48 : 42}
            textSize={square ? 30 : 27}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: copyWidth,
              marginTop: square ? 76 : portrait ? 112 : 62,
            }}
          >
            <div
              style={{
                display: "flex",
                width: square ? 82 : 72,
                height: 7,
                marginBottom: square ? 38 : 30,
                borderRadius: 8,
                background: accent,
              }}
            />
            {spec.eyebrow ? (
              <div
                style={{
                  display: "flex",
                  marginBottom: square ? 34 : 26,
                  color: "#66676e",
                  fontSize: square ? 24 : 21,
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  lineHeight: 1.35,
                  textTransform: "uppercase",
                }}
              >
                {clamp(spec.eyebrow, 40)}
              </div>
            ) : null}
            <div
              style={{
                display: "flex",
                color: "#17171b",
                fontSize: proofTitleSize,
                fontWeight: 700,
                letterSpacing: "-0.035em",
                lineHeight: 1.04,
              }}
            >
              {clamp(spec.title, 120)}
            </div>
            {spec.subtitle ? (
              <div
                style={{
                  display: "flex",
                  marginTop: square ? 34 : 26,
                  color: "#55565d",
                  fontSize: proofSubtitleSize,
                  lineHeight: 1.32,
                }}
              >
                {clamp(spec.subtitle, 220)}
              </div>
            ) : null}
            {spec.cta ? (
              <div
                style={{
                  display: "flex",
                  alignSelf: "flex-start",
                  marginTop: square ? 34 : 28,
                  padding: square ? "18px 30px" : "15px 25px",
                  borderRadius: 999,
                  color: "#ffffff",
                  background: "#17171b",
                  fontSize: square ? 25 : 22,
                  fontWeight: 700,
                }}
              >
                {clamp(spec.cta, 60)}
              </div>
            ) : null}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            position: "absolute",
            width: proofWidth,
            height: proofHeight,
            right: proofRight,
            bottom: proofBottom,
            overflow: "hidden",
            borderRadius: square ? "26px 0 0 0" : 28,
            background: "#ffffff",
            boxShadow: "0 28px 70px rgba(24,24,27,0.16)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={context.sourceImage!}
            alt=""
            width={format.width}
            height={format.height}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: imagePosition,
            }}
          />
        </div>
      </div>
    );
  } else {
    content = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding,
          color: "#ffffff",
          background: `linear-gradient(145deg, #0b0b0c 0%, #151515 54%, ${accent} 180%)`,
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            position: "absolute",
            width: portrait ? 620 : 520,
            height: portrait ? 620 : 520,
            right: -150,
            top: -180,
            borderRadius: 999,
            background: accent,
            opacity: 0.22,
          }}
        />
        <BrandMark brandName={context.brand.name} inverse />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            maxWidth: portrait ? "96%" : "84%",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 90,
              height: 8,
              marginBottom: 34,
              borderRadius: 8,
              background: accent,
            }}
          />
          <Message spec={spec} color="#ffffff" titleSize={portrait ? 92 : 80} />
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 19,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            opacity: 0.5,
          }}
        >
          Made with {context.brand.name}
        </div>
      </div>
    );
  }

  return new ImageResponse(content, {
    width: format.width,
    height: format.height,
  });
}

/**
 * A ready render of exactly this spec for this brand as it is now, if one
 * exists. Resolves the context the same way `freezeComposition` does (so the
 * caller must own the brand and the source must be ready) and matches on the
 * stored render inputs, so a plain rerun finds the earlier card while a
 * changed subtitle, a bumped template, a rename or a new accent renders again.
 */
export async function findFrozenComposition(input: {
  userId: string;
  spec: FreezeCompositionInput;
}) {
  const context = await resolveCompositionContext(input.userId, input.spec);
  const wanted = JSON.stringify(renderInputs(input.spec, context));
  return db.query.mediaAssetTable.findFirst({
    where: and(
      eq(mediaAssetTable.brandId, input.spec.brandId),
      eq(mediaAssetTable.provider, "r2"),
      eq(mediaAssetTable.kind, "image"),
      eq(mediaAssetTable.status, "ready"),
      isNull(mediaAssetTable.deletedAt),
      sql`${mediaAssetTable.metadata} -> 'composition' @> ${wanted}::jsonb`,
    ),
    orderBy: (asset, { desc }) => [desc(asset.createdAt)],
    columns: { id: true, url: true },
  });
}

export async function freezeComposition(input: {
  userId: string;
  spec: FreezeCompositionInput;
}) {
  const context = await resolveCompositionContext(input.userId, input.spec);
  const format = getCompositionFormat(input.spec.formatId);
  const image = renderComposition(input.spec, context);
  const bytes = Buffer.from(await image.arrayBuffer());
  const filename = `${safeFilename(input.spec.assetTitle)}-${input.spec.formatId}.png`;

  return importImageBuffer({
    brandId: input.spec.brandId,
    uploadedBy: input.userId,
    body: bytes,
    contentType: "image/png",
    filename,
    title: input.spec.assetTitle,
    alt: input.spec.title,
    width: format.width,
    height: format.height,
    metadata: {
      composition: {
        ...renderInputs(input.spec, context),
        renderedAt: new Date().toISOString(),
      },
    },
  });
}
