import {
  getEmailDraftOutputSchema,
  createEmailSlotOutputSchema,
  createDigestFromRowOutputSchema,
  setDigestImageOutputSchema,
  updateEmailDraftOutputSchema,
  createProductUpdateDraftOutputSchema,
  generateEmailDraftOutputSchema,
  deleteEmailDraftOutputSchema,
} from "./outputs/email";
import "server-only";

import { waitUntil } from "@vercel/functions";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  EMAIL_DOCUMENT_FORMATS,
  emailDocumentDraftSchema,
  productUpdateEmailDraftSchema,
} from "@/lib/email-document";
import { DIGEST_TEMPLATE_KEY } from "@/lib/listings-digest";
import { db } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import { extractDigest } from "@/server/services/digest-extract.service";
import { matchDigestHomes } from "@/server/services/newsletter-homes.service";
import {
  createEmailSlot as createEmailSlotService,
  createProductUpdateDraft as createProductUpdateDraftService,
  getEmailWorkspace,
  runEmailGenerationJob,
  saveEmailDocument,
  startEmailGeneration,
} from "@/server/services/email-document.service";
import {
  ContentService,
  deliveryBlockReason,
} from "@/server/services/content.service";
import { growthAction, GrowthActionError } from "./types";

export const getEmailDraft = growthAction({
  outputSchema: getEmailDraftOutputSchema,
  description:
    "Read the canonical subject, Markdown body, CTA, revisions, planning context, and latest generation job for one owned newsletter issue or blast. Use this when the conversation is about a specific email slot; do not treat platform_post.text as the email body.",
  inputSchema: z.object({ platformPostId: z.string() }),
  execute: async ({ platformPostId }, ctx) => {
    const membership = await db.query.memberTable.findFirst({
      where: and(
        eq(memberTable.userId, ctx.userId),
        eq(memberTable.organizationId, ctx.orgId),
      ),
      columns: { role: true },
    });
    const workspace = await getEmailWorkspace({
      platformPostId,
      organizationId: ctx.orgId,
      userId: ctx.userId,
      canDeliver: membership?.role === "owner" || membership?.role === "admin",
    });
    return {
      ...workspace,
      url: `/app/newsletters/${platformPostId}`,
    };
  },
});

export const createEmailSlot = growthAction({
  outputSchema: createEmailSlotOutputSchema,
  description:
    "Create one empty newsletter issue or one-off blast as a Growth content-calendar slot after the operator has chosen the premise and timing. This deliberately does not generate the full email; generation happens only for an individually selected slot.",
  inputSchema: z.object({
    brandId: z.string(),
    title: z.string().trim().min(1).max(160),
    format: z.enum(EMAIL_DOCUMENT_FORMATS),
    hook: z.string().trim().max(2_000).optional(),
    purpose: z.string().trim().max(5_000).optional(),
    ctaText: z.string().trim().max(1_000).optional(),
    pillar: z.string().trim().max(120).optional(),
    seriesId: z.string().optional(),
    campaignId: z.string().optional(),
    plannedAt: z
      .string()
      .datetime()
      .optional()
      .describe(
        "Growth content-calendar time, never the operator's private calendar.",
      ),
  }),
  execute: async (input, ctx) =>
    createEmailSlotService({
      ...input,
      organizationId: ctx.orgId,
      userId: ctx.userId,
    }),
});

export const createDigestFromRow = growthAction({
  outputSchema: createDigestFromRowOutputSchema,
  description:
    "Turn a pasted block of property listings into a newsletter issue: reads the homes, their locations, guest counts, nightly rates and links, creates the email slot, and saves a digest document that previews as the real email. Use this whenever an operator pastes something that lists Wander homes for a send, in any shape — a spreadsheet row, a list from an email, a few typed lines. Pass what they pasted VERBATIM; do not re-type, reorder or summarize it, and do not fill in prices or links yourself. One digest per call.",
  inputSchema: z.object({
    brandId: z
      .string()
      .describe("The brand to create under (id from listBrands)."),
    row: z
      .string()
      .min(20)
      .max(50_000)
      .describe("Exactly what the operator pasted, unmodified."),
    title: z
      .string()
      .trim()
      .max(160)
      .optional()
      .describe("Overrides the sheet's Theme as the slot title."),
    subject: z
      .string()
      .trim()
      .max(200)
      .optional()
      .describe("Email subject line. Defaults to the theme; refine it after."),
    plannedAt: z
      .string()
      .datetime()
      .optional()
      .describe("Growth content-calendar time for the send."),
    format: z.enum(EMAIL_DOCUMENT_FORMATS).default("newsletter.broadcast"),
    platformPostId: z
      .string()
      .optional()
      .describe(
        "The issue to put the homes in, when one already exists: the issue the operator has open, or the slot you just created for this send. Its subject, preheader and intro are kept. Omit only when no slot exists yet; then one is created.",
      ),
  }),
  execute: async (input, ctx) => {
    const { digest, notes } = await extractDigest(input.row);
    if (!digest) {
      throw new GrowthActionError(
        "invalid_input",
        [
          "That paste did not contain any property listings I could read.",
          ...notes,
        ].join(" "),
      );
    }

    const theme = digest.theme ?? "Property digest";
    // An existing issue takes the homes and keeps its own words; a planned
    // slot's brief (subject, preheader, intro) is what the operator set.
    const existing = input.platformPostId
      ? await getEmailWorkspace({
          platformPostId: input.platformPostId,
          organizationId: ctx.orgId,
          userId: ctx.userId,
        })
      : null;
    const slot = existing
      ? {
          platformPostId: existing.spot.id,
          contentPostId: existing.content?.id ?? "",
        }
      : await createEmailSlotService({
          brandId: input.brandId,
          title: input.title ?? theme,
          format: input.format,
          purpose: digest.rationale ?? undefined,
          plannedAt: input.plannedAt,
          organizationId: ctx.orgId,
          userId: ctx.userId,
        });
    if (!slot?.platformPostId) {
      throw new Error("Could not create the email slot for this digest.");
    }

    // A Wander issue's homes are wander.com listings: match them now, so the
    // issue lands with tiers, prices for its stay and email photos rather
    // than nine "image needed" tiles and a button to press.
    const brandSlug =
      existing?.brand.slug ??
      (
        await db.query.brandTable.findFirst({
          where: eq(brandTable.id, input.brandId),
          columns: { slug: true },
        })
      )?.slug;
    const matched =
      brandSlug === "wander"
        ? await matchDigestHomes({
            digest,
            orgId: ctx.orgId,
            userId: ctx.userId,
            campaign:
              existing?.content?.title ??
              existing?.document.subject ??
              input.title ??
              theme,
          }).catch((error: unknown) => {
            console.error("[digest] wander.com matching failed", error);
            return null;
          })
        : null;
    const saved = matched?.digest ?? digest;

    await saveEmailDocument({
      platformPostId: slot.platformPostId,
      organizationId: ctx.orgId,
      userId: ctx.userId,
      draft: emailDocumentDraftSchema.parse({
        ...(existing
          ? {
              ctaLabel: existing.document.ctaLabel,
              ctaUrl: existing.document.ctaUrl,
            }
          : {}),
        subject: input.subject ?? (existing?.document.subject || theme),
        // The extracted rationale is advisory preview text — clamp it to the
        // document's 300-char preheader cap instead of failing the whole save
        // after the extraction already ran (Silvina hit this 4× on 08-07).
        preheader:
          existing?.document.preheader ||
          digest.rationale?.trim().slice(0, 300) ||
          null,
        // Intro copy is left to the operator rather than invented here: the
        // sheet supplies homes and a rationale, not a voice.
        bodyMarkdown: existing?.document.bodyMarkdown ?? "",
        templateKey: DIGEST_TEMPLATE_KEY,
        digest: saved,
      }),
      note: matched
        ? "Imported from a pasted home list and matched to wander.com"
        : "Imported from a planning-sheet row",
    });

    const outcomes = matched?.outcomes ?? [];
    const homes = saved.sections.reduce(
      (count, section) => count + section.properties.length,
      0,
    );
    const missingLinks = saved.sections.flatMap((section) =>
      section.properties
        .filter((property) => !property.href)
        .map((p) => p.name),
    );
    return {
      ok: true as const,
      platformPostId: slot.platformPostId,
      contentPostId: slot.contentPostId,
      title: input.title ?? theme,
      regions: saved.sections.map((section) => ({
        heading: section.heading,
        homes: section.properties.length,
      })),
      homes,
      // Surface the gaps rather than letting them be discovered at send time.
      missingLinks,
      // Not a count: a worklist. Which home, in which region, and the page to
      // grab the photo from. Naming the source page is the whole point — it
      // turns "nine images missing" into nine copy-pastes.
      imagesNeeded: saved.sections.flatMap((section) =>
        section.properties
          .filter((property) => !property.imageUrl)
          .map((property) => ({
            region: section.heading,
            home: property.name,
            hero: property.operated,
            sourceUrl: property.href,
          })),
      ),
      notes,
      url: `/app/newsletters/${slot.platformPostId}`,
      wanderMatch: matched
        ? {
            matched: outcomes.filter((row) => row.status === "matched").length,
            needPick: outcomes
              .filter(
                (row) => row.status === "ambiguous" || row.status === "missing",
              )
              .map((row) => row.name),
            failed: outcomes
              .filter((row) => row.status === "failed")
              .map((row) => row.name),
          }
        : null,
      nextStep: matched
        ? "The homes are matched to wander.com: each has its tier and an email photo with the tier pill, and its price line is the paste's (or, where the paste gave none, the home's cheapest stay on wander.com). Tell the operator how many matched and name any that need a pick (the board shows the candidates) or that failed. Then offer to draft the subject, preheader and intro."
        : "Every home needs a photo. List them for the operator with their source URLs so each one can be sourced, then call emailWrite.setDigestImage as each image URL comes back.",
    };
  },
});

export const setDigestImage = growthAction({
  outputSchema: setDigestImageOutputSchema,
  description:
    "Attach a photo to one home in a property digest. Use this when the operator pastes back an image URL for a specific home, or picks one from the media library. Match on the home's name as it appears in the digest; case and surrounding whitespace do not matter. Report which homes are still without a photo afterwards.",
  inputSchema: z.object({
    platformPostId: z.string(),
    images: z
      .array(
        z.object({
          home: z
            .string()
            .trim()
            .min(1)
            .describe("The home's name as it appears in the digest."),
          imageUrl: z.string().trim().url().max(2_000),
        }),
      )
      .min(1)
      .max(20),
  }),
  execute: async ({ platformPostId, images }, ctx) => {
    const workspace = await getEmailWorkspace({
      platformPostId,
      organizationId: ctx.orgId,
      userId: ctx.userId,
    });
    const digest = workspace.document.digest;
    if (!digest) {
      throw new GrowthActionError(
        "invalid_input",
        "That email is not a property digest.",
      );
    }

    const wanted = new Map(
      images.map((image) => [image.home.trim().toLowerCase(), image.imageUrl]),
    );
    const matched: string[] = [];
    const next = {
      ...digest,
      sections: digest.sections.map((section) => ({
        ...section,
        properties: section.properties.map((property) => {
          const imageUrl = wanted.get(property.name.trim().toLowerCase());
          if (!imageUrl) return property;
          matched.push(property.name);
          return { ...property, imageUrl };
        }),
      })),
    };

    // A name that matched nothing means the operator and the digest disagree
    // about what a home is called. Say so rather than reporting success.
    const unmatched = images
      .map((image) => image.home)
      .filter(
        (home) =>
          !matched.some(
            (name) => name.trim().toLowerCase() === home.trim().toLowerCase(),
          ),
      );

    await saveEmailDocument({
      platformPostId,
      organizationId: ctx.orgId,
      userId: ctx.userId,
      draft: emailDocumentDraftSchema.parse({
        subject: workspace.document.subject,
        preheader: workspace.document.preheader,
        bodyMarkdown: workspace.document.bodyMarkdown,
        ctaLabel: workspace.document.ctaLabel,
        ctaUrl: workspace.document.ctaUrl,
        templateKey: workspace.document.templateKey,
        handoffTargetRepo: workspace.document.handoffTargetRepo,
        productUpdate: workspace.document.productUpdate,
        digest: next,
      }),
      note: `Attached ${matched.length} digest image${matched.length === 1 ? "" : "s"}`,
    });

    const stillNeeded = next.sections.flatMap((section) =>
      section.properties
        .filter((property) => !property.imageUrl)
        .map((property) => ({ home: property.name, sourceUrl: property.href })),
    );
    return {
      ok: true as const,
      attached: matched,
      unmatched,
      stillNeeded,
      url: `/app/newsletters/${platformPostId}`,
    };
  },
});

export const updateEmailDraft = growthAction({
  outputSchema: updateEmailDraftOutputSchema,
  description:
    'Save an agreed conversational refinement to one email\'s canonical document and create a revision checkpoint. Pass only the fields that changed — but pass each changed field WHOLE: read the current value with getEmailDraft, rewrite the entire field with the change incorporated, and send the full replacement. Never attempt surgical partial edits or describe a diff; a field is replaced in its entirety. Liquid personalization tokens like {{ customer.first_name | default: "there" }} are allowed in subject and body — Customer.io expands them per recipient at delivery, and the workspace preview can simulate them.',
  inputSchema: z.object({
    platformPostId: z.string(),
    // Without the override, partial() still applies templateKey's default and
    // an omitted template silently resets to editorial.
    changes: emailDocumentDraftSchema
      .extend({ templateKey: z.string().trim().min(1).max(80) })
      .partial(),
    note: z.string().trim().max(300).optional(),
  }),
  execute: async ({ platformPostId, changes, note }, ctx) => {
    const workspace = await getEmailWorkspace({
      platformPostId,
      organizationId: ctx.orgId,
      userId: ctx.userId,
    });
    const document = emailDocumentDraftSchema.parse({
      subject: workspace.document.subject,
      preheader: workspace.document.preheader,
      bodyMarkdown: workspace.document.bodyMarkdown,
      ctaLabel: workspace.document.ctaLabel,
      ctaUrl: workspace.document.ctaUrl,
      templateKey: workspace.document.templateKey,
      handoffTargetRepo: workspace.document.handoffTargetRepo,
      productUpdate: workspace.document.productUpdate,
      // Carry the digest forward. Without it, any conversational tweak to the
      // subject line would silently drop nine parsed homes on the next save.
      digest: workspace.document.digest,
      ...changes,
    });
    const saved = await saveEmailDocument({
      platformPostId,
      organizationId: ctx.orgId,
      userId: ctx.userId,
      draft: document,
      note: note ?? "Saved from the Growth conversation",
    });
    return {
      ok: true as const,
      revision: saved.currentRevision,
      url: `/app/newsletters/${platformPostId}`,
    };
  },
});

export const createProductUpdateDraft = growthAction({
  outputSchema: createProductUpdateDraftOutputSchema,
  description:
    "Create one finished, previewable product-update email from verified repository evidence. Each claim must cite an exact repository and commit or pull-request ref. Use this after inspecting the relevant product repositories locally; omit internal-only changes. Creates a frozen Growth revision but never resolves recipients or sends.",
  inputSchema: z.object({
    brandId: z.string(),
    title: z.string().trim().min(1).max(160),
    format: z.enum(EMAIL_DOCUMENT_FORMATS).default("newsletter.broadcast"),
    plannedAt: z.string().datetime().optional(),
    purpose: z.string().trim().max(5_000).optional(),
    hook: z.string().trim().max(2_000).optional(),
    pillar: z.string().trim().max(120).optional(),
    draft: productUpdateEmailDraftSchema,
  }),
  execute: async (input, ctx) =>
    createProductUpdateDraftService({
      ...input,
      organizationId: ctx.orgId,
      userId: ctx.userId,
    }),
});

export const generateEmailDraft = growthAction({
  outputSchema: generateEmailDraftOutputSchema,
  description:
    "Start one deliberate AI draft or refinement job for the selected newsletter issue or blast. Never use this to batch-write a bank of slots. The job uses the slot brief, brand voice, current draft, and optional refinement instruction.",
  inputSchema: z.object({
    platformPostId: z.string(),
    brief: z.string().trim().max(10_000).optional(),
  }),
  execute: async (input, ctx) => {
    const job = await startEmailGeneration({
      ...input,
      organizationId: ctx.orgId,
      userId: ctx.userId,
    });
    if (job.status === "queued") {
      waitUntil(
        runEmailGenerationJob(job.id).catch((error) =>
          console.error("[email-generation] chat job failed", error),
        ),
      );
    }
    return {
      jobId: job.id,
      status: job.status,
      url: `/app/newsletters/${input.platformPostId}`,
    };
  },
});

export const deleteEmailDraft = growthAction({
  outputSchema: deleteEmailDraftOutputSchema,
  description:
    "Permanently delete one email draft: the spot, its canonical document, and its revisions. This is a real delete and cannot be undone. If the draft was the only thing rendered for its content idea, that idea goes too, so the pipeline does not keep counting an empty shell. An email with a delivery record is refused, because a sent message stays in the send ledger.",
  inputSchema: z.object({ platformPostId: z.string() }),
  execute: async ({ platformPostId }, ctx) => {
    // Resolves org access and 404s on anything outside it before we delete.
    const workspace = await getEmailWorkspace({
      platformPostId,
      organizationId: ctx.orgId,
      userId: ctx.userId,
    });
    const subject = workspace.document.subject;
    const blocked = await deliveryBlockReason([platformPostId]);
    if (blocked) throw new Error(blocked);
    const result = await ContentService.purgeSpot({ platformPostId });
    return {
      ok: true as const,
      action: "deleted" as const,
      email: { id: result.id, subject },
      ideaDeleted: Boolean(result.ideaDeleted),
      url: "/app/newsletters",
      next: "Confirm what was deleted by subject and date. Do not regenerate it unless asked.",
    };
  },
});

export const EMAIL_TOOLS = {
  getEmailDraft,
  createEmailSlot,
  createDigestFromRow,
  setDigestImage,
  createProductUpdateDraft,
  updateEmailDraft,
  generateEmailDraft,
  deleteEmailDraft,
} as const;
