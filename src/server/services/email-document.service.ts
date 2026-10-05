import { emailCopyGuidance } from "@/lib/brand-email-style";
import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  EMAIL_DOCUMENT_FORMATS,
  emailDocumentDraftSchema,
  formatEmailImplementationHandoff,
  productUpdateEmailDraftSchema,
  type EmailDocumentDraft,
  type EmailDocumentFormat,
  type ProductUpdateEmailDraft,
} from "@/lib/email-document";
import { brandSendBlockers, messageSendSummary } from "@/lib/email-delivery";
import { db, withTransaction } from "@/server/db";
import {
  brandTable,
  channelTable,
  contentPostTable,
  productionPacketTable,
  platformDocumentTable,
  homeTable,
  messageSendTable,
  platformPostTable,
  seriesTable,
  type EmailDocumentSnapshot,
} from "@/server/db/schema";
import {
  emptyCreativeDocument,
  creativeDocumentSchema,
  type CreativeDocument,
} from "@/lib/creative-document";
import {
  beginDocumentRun,
  claimDocumentRun,
  documentForPlatform,
  failDocumentRun,
  finishDocumentRun,
  latestDocumentRun,
  saveCreativeDocument,
} from "./creative-document.service";
import { HOMES_MARKER } from "@/lib/listings-digest";
import {
  leftoverTemplateSyntax,
  SAMPLE_RECIPIENT,
  unknownFields,
} from "@/lib/email-personalization";
import { renderDesignSystemNewsletter } from "@/server/email/design-system-newsletter-renderer";

export const EMAIL_GENERATION_MODEL = "claude-sonnet-5";

const generatedDraftSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  preheader: z.string().trim().max(300).nullable(),
  bodyMarkdown: z
    .string()
    .min(1)
    .max(100_000)
    .describe(
      "Complete email body in clean Markdown. Do not repeat the subject as an H1 and do not include raw HTML.",
    ),
  ctaLabel: z.string().trim().max(100).nullable(),
  ctaUrl: z.string().url().max(2_000).nullable(),
});

function isEmailFormat(value: string | null): value is EmailDocumentFormat {
  return EMAIL_DOCUMENT_FORMATS.includes(value as EmailDocumentFormat);
}

function snapshotOf(document: EmailDocumentDraft): EmailDocumentSnapshot {
  return {
    subject: document.subject,
    preheader: document.preheader ?? null,
    bodyMarkdown: document.bodyMarkdown,
    ctaLabel: document.ctaLabel ?? null,
    ctaUrl: document.ctaUrl ?? null,
    templateKey: document.templateKey,
    handoffTargetRepo: document.handoffTargetRepo ?? null,
    productUpdate: document.productUpdate ?? null,
    digest: document.digest ?? null,
  };
}

export async function requireOwnedEmailSpot(
  platformPostId: string,
  organizationId: string,
) {
  const spot = await db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.id, platformPostId),
    with: {
      brand: true,
      contentPost: { with: { series: true } },
    },
  });
  if (
    spot?.source !== "owned" ||
    spot.platform !== "newsletter" ||
    !isEmailFormat(spot.format) ||
    spot.brand?.organizationId !== organizationId
  ) {
    throw new Error(
      "That newsletter issue is not available in this workspace.",
    );
  }
  return spot;
}

export async function ensureEmailDocument(input: {
  platformPostId: string;
  organizationId: string;
  userId: string;
}) {
  const spot = await requireOwnedEmailSpot(
    input.platformPostId,
    input.organizationId,
  );
  let selected = await documentForPlatform(spot.id, input.organizationId);
  if (!selected) {
    await withTransaction(async (tx) => {
      const [currentSpot] = await tx
        .select()
        .from(platformPostTable)
        .where(eq(platformPostTable.id, spot.id))
        .for("update");
      if (!currentSpot) throw new Error("Email slot no longer exists.");
      const existing = await tx.query.platformDocumentTable.findFirst({
        where: eq(platformDocumentTable.platformPostId, spot.id),
      });
      if (existing) return;
      let contentPostId = currentSpot.contentPostId;
      const title =
        spot.contentPost?.title ?? currentSpot.text ?? "Email draft";
      if (!contentPostId) {
        const [content] = await tx
          .insert(contentPostTable)
          .values({
            brandId: spot.brandId,
            title,
            status: "draft",
            createdById: input.userId,
            origin: "human",
          })
          .returning();
        contentPostId = content!.id;
        await tx
          .update(platformPostTable)
          .set({ contentPostId })
          .where(eq(platformPostTable.id, spot.id));
      }
      const document = emptyCreativeDocument("email", title);
      document.brief.direction = spot.contentPost?.captionDirection ?? "";
      const [packet] = await tx
        .insert(productionPacketTable)
        .values({
          organizationId: input.organizationId,
          brandId: spot.brandId,
          contentPostId,
          title,
          documentType: "email",
          document,
          prompt: document.brief.direction,
          createdBy: input.userId,
          status: "draft",
        })
        .returning();
      await tx
        .insert(platformDocumentTable)
        .values({ platformPostId: spot.id, documentId: packet!.id });
    });
    selected = await documentForPlatform(spot.id, input.organizationId);
  }
  if (selected?.document.type !== "email")
    throw new Error("Expected an email document.");
  return { document: emailView(selected, spot.id), spot };
}

function emailView(
  row: {
    id: string;
    document: CreativeDocument | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string | null;
  },
  platformPostId: string,
) {
  const document = creativeDocumentSchema.parse(row.document);
  if (document.type !== "email") throw new Error("Expected email document.");
  return {
    ...snapshotOf(document.content),
    id: row.id,
    platformPostId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
  };
}

export async function getEmailWorkspace(input: {
  platformPostId: string;
  organizationId: string;
  userId: string;
  canDeliver?: boolean;
}) {
  const spot = await requireOwnedEmailSpot(
    input.platformPostId,
    input.organizationId,
  );
  const { document } = await ensureEmailDocument(input);
  const run = await latestDocumentRun(document.id, input.organizationId);
  const latestJob = run
    ? {
        id: run.id,
        status: run.status,
        error: run.error,
        createdAt: run.createdAt,
        completedAt: run.completedAt,
      }
    : undefined;
  const [rawMessageSends, [homes]] = await Promise.all([
    db.query.messageSendTable.findMany({
      where: eq(messageSendTable.documentId, document.id),
      orderBy: [desc(messageSendTable.createdAt)],
      limit: 20,
      columns: {
        id: true,
        contentHash: true,
        provider: true,
        providerBroadcastId: true,
        providerMessageId: true,
        audienceKind: true,
        audienceReference: true,
        audienceLabel: true,
        status: true,
        error: true,
        approvedAt: true,
        sentAt: true,
        createdAt: true,
      },
    }),
    db
      .select({ count: count() })
      .from(homeTable)
      .where(
        and(
          eq(homeTable.brandId, spot.brand.id),
          eq(homeTable.source, "wanderos"),
          isNull(homeTable.deletedAt),
        ),
      ),
  ]);
  const homeCount = homes?.count ?? 0;
  return {
    document,
    latestJob,
    messageSends: rawMessageSends.map(messageSendSummary),
    canDeliver: input.canDeliver ?? false,
    spot: {
      id: spot.id,
      format: spot.format as EmailDocumentFormat,
      status: spot.status,
      scheduledAt: spot.scheduledAt,
      publishedAt: spot.publishedAt,
      media: spot.media ?? [],
    },
    content: spot.contentPost
      ? {
          id: spot.contentPost.id,
          title: spot.contentPost.title ?? "Untitled email",
          purpose: spot.contentPost.captionDirection,
          hook: spot.contentPost.hook,
          ctaText: spot.contentPost.ctaText,
          pillar: spot.contentPost.pillar,
          plannedAt: spot.contentPost.plannedAt,
          series: spot.contentPost.series
            ? {
                id: spot.contentPost.series.id,
                name: spot.contentPost.series.name,
              }
            : null,
        }
      : null,
    brand: {
      id: spot.brand.id,
      name: spot.brand.name,
      slug: spot.brand.slug,
      homeCount,
      sendBlockers: brandSendBlockers(spot.brand),
    },
  };
}

export async function saveEmailDocument(input: {
  platformPostId: string;
  organizationId: string;
  userId: string;
  draft: EmailDocumentDraft;
  note?: string;
  runId?: string;
}) {
  const { document, spot } = await ensureEmailDocument(input);
  const selected = await documentForPlatform(spot.id, input.organizationId);
  if (selected?.document.type !== "email")
    throw new Error("Email document not found.");
  const next: CreativeDocument = {
    ...selected.document,
    content: emailDocumentDraftSchema.parse(input.draft),
  };
  if (input.runId) {
    const applied = await finishDocumentRun(input.runId, next);
    if (!applied)
      throw new Error(
        "Generation was cancelled or timed out. The saved email was preserved.",
      );
  } else
    await saveCreativeDocument({
      ...input,
      documentId: document.id,
      document: next,
    });
  await db
    .update(platformPostTable)
    .set({
      text: next.content.subject,
      ...(spot.status === "slot" ? { status: "draft" as const } : {}),
    })
    .where(eq(platformPostTable.id, spot.id));
  return (await ensureEmailDocument(input)).document;
}

export async function createEmailSlot(input: {
  organizationId: string;
  userId: string;
  brandId: string;
  title: string;
  format: EmailDocumentFormat;
  hook?: string;
  purpose?: string;
  ctaText?: string;
  pillar?: string;
  seriesId?: string;
  plannedAt?: string;
}) {
  const [brand, series, newsletterChannel] = await Promise.all([
    db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.id, input.brandId),
        eq(brandTable.organizationId, input.organizationId),
        isNull(brandTable.deletedAt),
      ),
    }),
    input.seriesId
      ? db.query.seriesTable.findFirst({
          where: and(
            eq(seriesTable.id, input.seriesId),
            eq(seriesTable.brandId, input.brandId),
            isNull(seriesTable.deletedAt),
          ),
        })
      : null,
    db.query.channelTable.findFirst({
      where: and(
        eq(channelTable.brandId, input.brandId),
        eq(channelTable.kind, "newsletter"),
        eq(channelTable.platform, "newsletter"),
        eq(channelTable.isActive, true),
        isNull(channelTable.deletedAt),
      ),
    }),
  ]);
  if (!brand) throw new Error("Brand not found in this workspace.");
  if (input.seriesId && !series)
    throw new Error("Series not found for this brand.");
  const plannedAt = input.plannedAt ? new Date(input.plannedAt) : null;
  if (plannedAt && Number.isNaN(plannedAt.getTime())) {
    throw new Error("Invalid content-calendar date.");
  }
  const pillar = series?.pillar ?? input.pillar;

  return withTransaction(async (tx) => {
    const [content] = await tx
      .insert(contentPostTable)
      .values({
        brandId: brand.id,
        title: input.title,
        hook: input.hook,
        captionDirection: input.purpose,
        ctaText: input.ctaText,
        pillar,
        seriesId: series?.id,
        plannedAt,
        status: "slot",
        slotKind: series ? "anchored" : "freeflow",
        origin: "human",
        ownerId: input.userId,
        createdById: input.userId,
        targetSpots: [
          {
            platform: "newsletter",
            format: input.format,
            archetype: "article",
            scheduledAt: plannedAt?.toISOString(),
          },
        ],
      })
      .returning({ id: contentPostTable.id });
    if (!content) throw new Error("Could not create the email slot.");
    const [spot] = await tx
      .insert(platformPostTable)
      .values({
        brandId: brand.id,
        contentPostId: content.id,
        channelId: newsletterChannel?.id,
        platform: "newsletter",
        format: input.format,
        archetype: "article",
        source: "owned",
        status: "slot",
        origin: "human",
        ownerId: input.userId,
        scheduledAt: plannedAt,
      })
      .returning({ id: platformPostTable.id });
    if (!spot) throw new Error("Could not create the newsletter spot.");
    const document = emptyCreativeDocument("email", input.title);
    if (document.type !== "email") throw new Error("Invalid email type.");
    document.content.handoffTargetRepo = brand.slug;
    document.brief.purpose = input.purpose ?? "";
    document.brief.direction = input.hook ?? "";
    document.brief.cta = input.ctaText ?? "";
    const [packet] = await tx
      .insert(productionPacketTable)
      .values({
        organizationId: input.organizationId,
        brandId: brand.id,
        contentPostId: content.id,
        title: input.title,
        prompt: document.brief.direction,
        documentType: "email",
        document,
        createdBy: input.userId,
        status: "draft",
      })
      .returning();
    await tx
      .insert(platformDocumentTable)
      .values({ platformPostId: spot.id, documentId: packet!.id });
    return {
      contentPostId: content.id,
      platformPostId: spot.id,
      url: `/app/newsletters/${spot.id}`,
    };
  });
}

export async function createProductUpdateDraft(input: {
  organizationId: string;
  userId: string;
  brandId: string;
  title: string;
  format: EmailDocumentFormat;
  plannedAt?: string;
  purpose?: string;
  hook?: string;
  pillar?: string;
  draft: ProductUpdateEmailDraft;
}) {
  const draft = productUpdateEmailDraftSchema.parse(input.draft);
  const slot = await createEmailSlot({
    organizationId: input.organizationId,
    userId: input.userId,
    brandId: input.brandId,
    title: input.title,
    format: input.format,
    plannedAt: input.plannedAt,
    purpose:
      input.purpose ??
      `Evidence-backed WanderOS product update covering ${draft.productUpdate.periodStart} through ${draft.productUpdate.periodEnd}.`,
    hook: input.hook,
    pillar: input.pillar ?? "WanderOS product updates",
    ctaText: draft.ctaLabel ?? undefined,
  });
  const document = await saveEmailDocument({
    platformPostId: slot.platformPostId,
    organizationId: input.organizationId,
    userId: input.userId,
    draft,
    note: `Created from ${draft.productUpdate.changes.length} verified product changes`,
  });
  return {
    ...slot,
    emailDocumentId: document.id,
  };
}

export async function startEmailGeneration(input: {
  platformPostId: string;
  organizationId: string;
  userId: string;
  brief?: string;
}) {
  const { document } = await ensureEmailDocument(input);
  const selected = await documentForPlatform(
    input.platformPostId,
    input.organizationId,
  );
  if (!selected) throw new Error("Document not found.");
  if (input.brief?.trim())
    await saveCreativeDocument({
      ...input,
      documentId: document.id,
      document: {
        ...selected.document,
        brief: { ...selected.document.brief, direction: input.brief.trim() },
      },
    });
  return beginDocumentRun({
    ...input,
    documentId: document.id,
    operation: "write",
    provider: "anthropic",
    model: EMAIL_GENERATION_MODEL,
    extra: { platformPostId: input.platformPostId },
  });
}

export async function runEmailGenerationJob(jobId: string) {
  const job = await claimDocumentRun(jobId);
  if (!job) return;
  try {
    const source = creativeDocumentSchema.parse(job.input.document);
    if (source.type !== "email" || !job.createdBy)
      throw new Error("Invalid email run.");
    const document = source.content;
    const platformPostId = String(job.input.platformPostId);
    const spot = await db.query.platformPostTable.findFirst({
      where: eq(platformPostTable.id, platformPostId),
      with: {
        brand: true,
        channel: true,
        contentPost: { with: { series: true } },
      },
    });
    if (!document || !spot?.brand || !isEmailFormat(spot.format)) {
      throw new Error("The email slot no longer exists.");
    }
    const brandVoice = spot.brand.brandFingerprint?.fingerprintText?.trim();
    const channelVoice =
      spot.channel?.channelFingerprint?.fingerprintText?.trim();
    const content = spot.contentPost;
    const productEvidence = document.productUpdate
      ? JSON.stringify(document.productUpdate, null, 2)
      : null;
    const { output } = await generateText({
      model: anthropic(EMAIL_GENERATION_MODEL),
      output: Output.object({
        name: "NewsletterDraft",
        schema: generatedDraftSchema,
      }),
      temperature: 0.7,
      system: [
        `You are the editorial email writer for ${spot.brand.name}.`,
        spot.format === "newsletter.blast"
          ? "This is a one-off email blast. It must feel timely and complete without pretending to be a recurring newsletter issue."
          : "This is an issue in a recurring editorial newsletter. It should feel like one installment in an ongoing reader relationship.",
        brandVoice ? `Brand voice:\n${brandVoice}` : null,
        emailCopyGuidance(spot.brand),
        spot.brand.story?.trim()
          ? `Brand story:\n${spot.brand.story.trim()}`
          : null,
        channelVoice ? `Newsletter voice:\n${channelVoice}` : null,
        "Return an honest, useful draft in Markdown. Do not invent product facts, customer quotes, metrics, dates, or links. Preserve provided URLs exactly. Do not add unsubscribe language; the product sending runtime owns the compliance footer. Use one clear CTA at most.",
        `The draft may contain markers like ${HOMES_MARKER} or <!-- homes 2 -->, each where a group of home cards appears. Keep every marker exactly once, in a sensible place, and do not list those homes in the text.`,
        "Per-guest fields like {{first_name|there}} are filled per recipient; keep any the draft uses, written exactly as they are.",
        "Keep every image in the current draft (each <p><img …></p>, such as a header card) exactly as written and in the same place.",
        document.digest
          ? "This issue is a property digest: the homes render below your text from structured data, each with its photo, location, price and link. Write the subject, preheader and a short intro (a greeting and one or two paragraphs) that sets up the theme and the places. Do not list the homes, their prices or their links in the body, and leave the CTA empty; the digest carries both. Claim nothing about the homes, prices, savings, seasons or availability beyond what the prompt states: no rates rising, no limited-time offers, no urgency you were not given."
          : null,
        productEvidence
          ? "This is an evidence-backed WanderOS product update. Every customer-facing product claim must be supported by verified shipped evidence in the prompt. Omit merged-only, ambiguous, operational, documentation-only, CI, dependency, refactor, or internal changes."
          : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
      prompt: [
        content?.title ? `Working title: ${content.title}` : null,
        content?.series ? `Series: ${content.series.name}` : null,
        content?.pillar ? `Content pillar: ${content.pillar}` : null,
        content?.hook ? `Hook / premise: ${content.hook}` : null,
        content?.captionDirection
          ? `Purpose and direction: ${content.captionDirection}`
          : null,
        content?.visualDirection
          ? `Visual direction: ${content.visualDirection}`
          : null,
        content?.ctaText ? `CTA intent: ${content.ctaText}` : null,
        `Saved editorial brief (the current writing direction; prefer it over older planning context):\n${JSON.stringify(source.brief)}`,
        "Only treat the brief's sourced, supported claims as facts. Constraints and open questions are not evidence. Omit unverified claims rather than presenting them as confirmed.",
        document.digest
          ? `The homes in this issue, by place:\n${document.digest.sections
              .map(
                (section) =>
                  `${section.heading}: ${section.properties
                    .map((property) =>
                      [property.name, property.city, property.priceLabel]
                        .filter(Boolean)
                        .join(", "),
                    )
                    .join("; ")}`,
              )
              .join("\n")}`
          : null,
        productEvidence
          ? `Verified product change evidence (the only allowed source for product claims):\n${productEvidence}`
          : null,
        document.subject || document.bodyMarkdown
          ? `Current draft to improve:\nSubject: ${document.subject || "(unset)"}\nPreheader: ${document.preheader || "(unset)"}\n\n${document.bodyMarkdown || "(empty)"}`
          : null,
        "Draft this one email now.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    });

    await saveEmailDocument({
      platformPostId: spot.id,
      organizationId: job.organizationId,
      userId: job.createdBy,
      runId: job.id,
      draft: {
        ...document,
        ...output,
        digest: document.digest,
        productUpdate: document.productUpdate,
      },
    });
  } catch (error) {
    await failDocumentRun(jobId, error);
    throw error;
  }
}

/**
 * Rewrite one block of an email's body, on request: a paragraph, a list, a
 * heading. The rest of the email is context only, so copy elsewhere (checked
 * offers, dates, availability) is never touched.
 */
export async function rewriteEmailBlock(input: {
  platformPostId: string;
  organizationId: string;
  /** The block's source, as it sits in the body. */
  block: string;
  format: "html" | "markdown";
  instruction?: string;
  /** The unsaved draft on screen, for context. */
  subject: string;
  bodyMarkdown: string;
}) {
  const spot = await requireOwnedEmailSpot(
    input.platformPostId,
    input.organizationId,
  );
  const brandVoice = spot.brand.brandFingerprint?.fingerprintText?.trim();
  const { output } = await generateText({
    model: anthropic(EMAIL_GENERATION_MODEL),
    output: Output.object({
      name: "EmailBlock",
      schema: z.object({
        block: z
          .string()
          .min(1)
          .describe(
            input.format === "html"
              ? "The rewritten block as one HTML element of the same kind (a <p>, <ul> or heading), nothing around it."
              : "The rewritten block as Markdown of the same kind (a paragraph, list or heading), nothing around it.",
          ),
      }),
    }),
    temperature: 0.7,
    system: [
      `You edit one block of a marketing email for ${spot.brand.name}.`,
      brandVoice ? `Brand voice:\n${brandVoice}` : null,
      emailCopyGuidance(spot.brand),
      "Rewrite only the block you are given. Keep every fact it states: offers, codes, dates, prices, home names and availability. Invent nothing. Keep every link and its URL exactly. Keep per-guest fields like {{first_name|there}} exactly as written. Do not add unsubscribe language.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    prompt: [
      `Subject: ${input.subject || "(unset)"}`,
      `The whole email body, for context only:\n${input.bodyMarkdown}`,
      `The block to rewrite:\n${input.block}`,
      input.instruction?.trim()
        ? `What to change: ${input.instruction.trim()}`
        : "Make it clearer and tighter in the brand's voice.",
    ].join("\n\n"),
  });
  return { block: output.block.trim() };
}

export async function renderEmailPreview(input: {
  platformPostId: string;
  organizationId: string;
  userId: string;
  draft?: EmailDocumentDraft;
  /**
   * "template" shows per-guest fields as written; "full" fills them for a
   * sample guest, "sparse" for a guest Growth knows nothing about, which is
   * what shows a missing fallback.
   */
  viewAs?: "template" | "full" | "sparse";
  blockIds?: boolean;
}) {
  const { document, spot } = await ensureEmailDocument(input);
  const draft = emailDocumentDraftSchema.parse(input.draft ?? document);
  const sender = spot.brand.emailSender;
  const recipient =
    input.viewAs === "full"
      ? SAMPLE_RECIPIENT
      : input.viewAs === "sparse"
        ? { email: SAMPLE_RECIPIENT.email }
        : undefined;
  const rendered = await renderDesignSystemNewsletter({
    document: draft,
    brandName: spot.brand.name,
    logo: spot.brand.brandIdentity?.logo ?? spot.brand.logo,
    sender,
    legal: spot.brand.legalIdentity,
    recipient,
    blockIds: input.blockIds,
  });
  const copy = [draft.subject, draft.preheader ?? "", draft.bodyMarkdown].join(
    "\n",
  );
  const unknown = [...new Set(unknownFields(copy))];
  const warnings = [
    !sender
      ? `${spot.brand.name} has no email sender set, so the email shows only its name and logo.`
      : !spot.brand.legalIdentity?.address
        ? `${spot.brand.name} has no postal address in its footer.`
        : null,
    unknown.length
      ? `Unknown ${unknown.length === 1 ? "field" : "fields"}: ${unknown.map((name) => `{{${name}}}`).join(", ")}.`
      : null,
    recipient && leftoverTemplateSyntax(rendered.html)
      ? "Template syntax is left in the email and would show as text."
      : null,
  ].filter((warning): warning is string => Boolean(warning));
  return { html: rendered.html, warnings };
}

export async function exportEmailHandoff(input: {
  platformPostId: string;
  organizationId: string;
  userId: string;
}) {
  const workspace = await getEmailWorkspace(input);
  return formatEmailImplementationHandoff({
    subject: workspace.document.subject,
    preheader: workspace.document.preheader,
    bodyMarkdown: workspace.document.bodyMarkdown,
    ctaLabel: workspace.document.ctaLabel,
    ctaUrl: workspace.document.ctaUrl,
    templateKey: workspace.document.templateKey,
    handoffTargetRepo: workspace.document.handoffTargetRepo,
    productUpdate: workspace.document.productUpdate,
    brandName: workspace.brand.name,
    brandSlug: workspace.brand.slug,
    contentTitle:
      workspace.content?.title ?? workspace.document.subject ?? "Email",
    contentPostId: workspace.content?.id ?? "standalone",
    platformPostId: workspace.spot.id,
    format: workspace.spot.format,
    seriesName: workspace.content?.series?.name,
    plannedAt: workspace.content?.plannedAt?.toISOString(),
    scheduledAt: workspace.spot.scheduledAt?.toISOString(),
    purpose: workspace.content?.purpose,
    hook: workspace.content?.hook,
    ctaIntent: workspace.content?.ctaText,
    assetReferences: workspace.spot.media.map((item) => ({
      assetId: item.assetId,
      url: item.url,
      type: item.type,
    })),
  });
}
