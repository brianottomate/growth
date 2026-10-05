import { emailCopyGuidance } from "@/lib/brand-email-style";
import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
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
import { messageSendSummary } from "@/lib/email-delivery";
import { db, withTransaction } from "@/server/db";
import {
  brandTable,
  channelTable,
  contentPostTable,
  emailDocumentTable,
  emailDocumentVersionTable,
  emailGenerationJobTable,
  homeTable,
  messageSendTable,
  platformPostTable,
  seriesTable,
  type EmailDocumentSnapshot,
} from "@/server/db/schema";
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
  await db
    .insert(emailDocumentTable)
    .values({
      platformPostId: spot.id,
      subject: spot.text ?? spot.contentPost?.title ?? "",
      handoffTargetRepo: spot.brand?.slug ?? null,
      createdBy: input.userId,
    })
    .onConflictDoNothing({ target: emailDocumentTable.platformPostId });
  const document = await db.query.emailDocumentTable.findFirst({
    where: eq(emailDocumentTable.platformPostId, spot.id),
  });
  if (!document) throw new Error("Could not create the email document.");
  return { document, spot };
}

async function persistRevision(input: {
  emailDocumentId: string;
  platformPostId: string;
  contentPostId?: string | null;
  draft: EmailDocumentDraft;
  source: "generation" | "manual" | "restore";
  note?: string;
  userId: string | null;
  expectedRevision?: number;
}) {
  const snapshot = snapshotOf(input.draft);
  return withTransaction(async (tx) => {
    const current = await tx.query.emailDocumentTable.findFirst({
      where: eq(emailDocumentTable.id, input.emailDocumentId),
    });
    if (!current) throw new Error("Email document not found.");
    if (
      input.expectedRevision !== undefined &&
      input.expectedRevision !== current.currentRevision
    ) {
      throw new Error(
        "The email has a newer revision. Load it before saving your changes.",
      );
    }
    const revision = current.currentRevision + 1;
    const [document] = await tx
      .update(emailDocumentTable)
      .set({ ...snapshot, currentRevision: revision, updatedAt: new Date() })
      .where(
        and(
          eq(emailDocumentTable.id, current.id),
          eq(emailDocumentTable.currentRevision, current.currentRevision),
        ),
      )
      .returning();
    if (!document)
      throw new Error(
        "The email changed during this save. Load its newest revision and retry.",
      );
    await tx.insert(emailDocumentVersionTable).values({
      emailDocumentId: current.id,
      revision,
      snapshot,
      source: input.source,
      note: input.note,
      createdBy: input.userId,
    });
    await tx
      .update(platformPostTable)
      .set(
        current.currentRevision === 0
          ? { text: snapshot.subject || null, status: "draft" }
          : { text: snapshot.subject || null },
      )
      .where(eq(platformPostTable.id, input.platformPostId));
    if (input.contentPostId && current.currentRevision === 0) {
      await tx
        .update(contentPostTable)
        .set({ status: "draft" })
        .where(eq(contentPostTable.id, input.contentPostId));
    }
    return document;
  });
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
  const document = await db.query.emailDocumentTable.findFirst({
    where: eq(emailDocumentTable.platformPostId, spot.id),
  });
  if (!document) throw new Error("Email document has not been initialized.");
  const [versions, latestJob, rawMessageSends, [homes]] = await Promise.all([
    db.query.emailDocumentVersionTable.findMany({
      where: eq(emailDocumentVersionTable.emailDocumentId, document.id),
      orderBy: [desc(emailDocumentVersionTable.revision)],
      limit: 30,
    }),
    db.query.emailGenerationJobTable.findFirst({
      where: eq(emailGenerationJobTable.emailDocumentId, document.id),
      orderBy: [desc(emailGenerationJobTable.createdAt)],
    }),
    db.query.messageSendTable.findMany({
      where: eq(messageSendTable.emailDocumentId, document.id),
      orderBy: [desc(messageSendTable.createdAt)],
      limit: 20,
      columns: {
        id: true,
        revision: true,
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
    versions,
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
    },
  };
}

export async function saveEmailDocument(input: {
  platformPostId: string;
  organizationId: string;
  userId: string;
  draft: EmailDocumentDraft;
  note?: string;
  expectedRevision?: number;
}) {
  const parsed = emailDocumentDraftSchema.parse(input.draft);
  const { document, spot } = await ensureEmailDocument(input);
  return persistRevision({
    emailDocumentId: document.id,
    platformPostId: spot.id,
    contentPostId: spot.contentPostId,
    draft: parsed,
    source: "manual",
    note: input.note ?? "Manual save",
    expectedRevision: input.expectedRevision,
    userId: input.userId,
  });
}

export async function restoreEmailDocumentVersion(input: {
  platformPostId: string;
  versionId: string;
  organizationId: string;
  userId: string;
}) {
  const { document, spot } = await ensureEmailDocument(input);
  const version = await db.query.emailDocumentVersionTable.findFirst({
    where: and(
      eq(emailDocumentVersionTable.id, input.versionId),
      eq(emailDocumentVersionTable.emailDocumentId, document.id),
    ),
  });
  if (!version) throw new Error("Email revision not found.");
  return persistRevision({
    emailDocumentId: document.id,
    platformPostId: spot.id,
    contentPostId: spot.contentPostId,
    draft: version.snapshot,
    source: "restore",
    note: `Restored revision ${version.revision}`,
    userId: input.userId,
  });
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
    await tx.insert(emailDocumentTable).values({
      platformPostId: spot.id,
      subject: input.title,
      handoffTargetRepo: brand.slug,
      createdBy: input.userId,
    });
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
    revision: document.currentRevision,
  };
}

export async function startEmailGeneration(input: {
  platformPostId: string;
  organizationId: string;
  userId: string;
  brief?: string;
}) {
  const { document } = await ensureEmailDocument(input);
  const active = await db.query.emailGenerationJobTable.findFirst({
    where: and(
      eq(emailGenerationJobTable.emailDocumentId, document.id),
      inArray(emailGenerationJobTable.status, ["queued", "running"]),
    ),
    orderBy: [desc(emailGenerationJobTable.createdAt)],
  });
  if (active) return active;
  const [job] = await db
    .insert(emailGenerationJobTable)
    .values({
      emailDocumentId: document.id,
      platformPostId: input.platformPostId,
      status: "queued",
      brief: input.brief,
      model: EMAIL_GENERATION_MODEL,
      createdBy: input.userId,
    })
    .returning();
  if (!job) throw new Error("Could not queue the email draft.");
  return job;
}

export async function runEmailGenerationJob(jobId: string) {
  const job = await db.query.emailGenerationJobTable.findFirst({
    where: eq(emailGenerationJobTable.id, jobId),
  });
  if (job?.status !== "queued") return;
  await db
    .update(emailGenerationJobTable)
    .set({ status: "running", startedAt: new Date(), error: null })
    .where(eq(emailGenerationJobTable.id, job.id));

  try {
    const document = await db.query.emailDocumentTable.findFirst({
      where: eq(emailDocumentTable.id, job.emailDocumentId),
    });
    const spot = await db.query.platformPostTable.findFirst({
      where: eq(platformPostTable.id, job.platformPostId),
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
        job.brief?.trim()
          ? `Latest refinement brief:\n${job.brief.trim()}`
          : null,
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

    await persistRevision({
      emailDocumentId: document.id,
      platformPostId: spot.id,
      contentPostId: spot.contentPostId,
      expectedRevision: document.currentRevision,
      draft: {
        ...output,
        templateKey: document.templateKey,
        handoffTargetRepo: document.handoffTargetRepo,
        productUpdate: document.productUpdate,
        // The model writes words; the homes are data it never returns. Left
        // out, a generation on a property digest wiped every home.
        digest: document.digest,
      },
      source: "generation",
      note: job.brief?.trim() || "Generated from the selected content slot",
      userId: job.createdBy,
    });
    await db
      .update(emailGenerationJobTable)
      .set({ status: "succeeded", completedAt: new Date() })
      .where(eq(emailGenerationJobTable.id, job.id));
  } catch (error) {
    await db
      .update(emailGenerationJobTable)
      .set({
        status: "failed",
        error:
          error instanceof Error ? error.message : "Email generation failed",
        completedAt: new Date(),
      })
      .where(eq(emailGenerationJobTable.id, job.id));
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
    revision: workspace.document.currentRevision,
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
