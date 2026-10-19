import "server-only";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/server/db";
import {
  brandTable,
  platformPostTable,
  platformDocumentTable,
  productionPacketTable,
  emailSequenceTable,
  emailSequenceStepTable,
} from "@/server/db/schema";
import { env } from "@/env";
import {
  EMAIL_READ_FORMATS,
  emailDocumentDraftSchema,
  type EmailDocumentDraft,
} from "@/lib/email-document";
import type {
  createEmailPreviewInput,
  EmailClientPreview,
} from "@/lib/email-client-preview";
import { renderDesignSystemNewsletter } from "@/server/email/design-system-newsletter-renderer";
import { ensureBrandConnect } from "./brand-connect.service";
import {
  inspectEmailPreviewToken,
  signEmailPreviewToken,
  verifyEmailPreviewToken,
} from "./email-preview-token";

async function ownedBrand(orgId: string, brandId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, orgId),
      isNull(brandTable.deletedAt),
    ),
  });
  if (!brand)
    throw new ORPCError("NOT_FOUND", {
      message: "Brand not found in this workspace.",
    });
  return brand;
}
async function emailRows(brandId: string, ids?: string[]) {
  return db.query.platformPostTable.findMany({
    where: and(
      eq(platformPostTable.brandId, brandId),
      eq(platformPostTable.source, "owned"),
      eq(platformPostTable.platform, "newsletter"),
      inArray(platformPostTable.format, [...EMAIL_READ_FORMATS]),
      ids ? inArray(platformPostTable.id, ids) : undefined,
    ),
    with: { contentPost: { with: { series: true } } },
    orderBy: (post, { asc }) => [asc(post.scheduledAt), asc(post.createdAt)],
  });
}
async function documents(brandId: string, ids: string[]) {
  if (!ids.length) return new Map<string, EmailDocumentDraft>();
  const rows = await db
    .select({
      id: platformDocumentTable.platformPostId,
      document: productionPacketTable.document,
    })
    .from(platformDocumentTable)
    .innerJoin(
      productionPacketTable,
      eq(productionPacketTable.id, platformDocumentTable.documentId),
    )
    .where(
      and(
        inArray(platformDocumentTable.platformPostId, ids),
        eq(productionPacketTable.brandId, brandId),
      ),
    );
  return new Map(
    rows.flatMap((row) =>
      row.document.type === "email"
        ? [
            [
              row.id,
              emailDocumentDraftSchema.parse(row.document.content),
            ] as const,
          ]
        : [],
    ),
  );
}
export async function emailPreviewOptions(orgId: string, brandId: string) {
  await ownedBrand(orgId, brandId);
  const [emails, sequenceSteps] = await Promise.all([
    emailRows(brandId),
    db
      .select({ id: emailSequenceStepTable.platformPostId })
      .from(emailSequenceStepTable)
      .innerJoin(
        emailSequenceTable,
        eq(emailSequenceTable.id, emailSequenceStepTable.sequenceId),
      )
      .where(
        and(
          eq(emailSequenceTable.brandId, brandId),
          isNull(emailSequenceTable.deletedAt),
        ),
      ),
  ]);
  const sequenceIds = new Set(sequenceSteps.map((step) => step.id));
  const rows = emails.filter(
    (row) =>
      !sequenceIds.has(row.id) &&
      !["archived", "rejected"].includes(row.status),
  );
  const docs = await documents(
    brandId,
    rows.map((row) => row.id),
  );
  return {
    editions: rows
      .filter((row) => docs.has(row.id))
      .map((row) => ({
        id: row.id,
        subject:
          docs.get(row.id)!.subject ||
          row.contentPost?.title ||
          "Untitled email",
        series: row.contentPost?.series?.name ?? null,
        status: row.status,
        plannedAt: row.scheduledAt?.toISOString() ?? null,
      })),
  };
}
export async function createEmailClientPreview(
  orgId: string,
  input: z.infer<typeof createEmailPreviewInput>,
) {
  const brand = await ownedBrand(orgId, input.brandId);
  const available = await emailPreviewOptions(orgId, brand.id);
  if (
    new Set(input.platformPostIds).size !== input.platformPostIds.length ||
    input.platformPostIds.some(
      (id) => !available.editions.some((edition) => edition.id === id),
    )
  )
    throw new ORPCError("BAD_REQUEST", {
      message: "Choose existing emails from this brand.",
    });
  if (!env.BETTER_AUTH_SECRET)
    throw new Error("Preview signing is not configured.");
  const { token: brandToken } = await ensureBrandConnect(brand.id);
  const expiresAt = Date.now() + input.expiresInDays * 86400000;
  const token = signEmailPreviewToken(
    {
      brandId: brand.id,
      organizationId: orgId,
      platformPostIds: available.editions
        .filter((edition) => input.platformPostIds.includes(edition.id))
        .map((edition) => edition.id),
      expiresAt,
    },
    env.BETTER_AUTH_SECRET,
    brandToken,
  );
  return {
    url: new URL(`/email-preview/${token}`, env.NEXT_PUBLIC_BASE_URL).href,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}
/** Public reads never create documents or access audiences, provider ledgers or Growth sessions. */
export async function loadEmailClientPreview(
  token: string,
): Promise<EmailClientPreview | null> {
  const untrusted = inspectEmailPreviewToken(token);
  if (!untrusted || !env.BETTER_AUTH_SECRET) return null;
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, untrusted.brandId),
      eq(brandTable.organizationId, untrusted.organizationId),
      isNull(brandTable.deletedAt),
    ),
  });
  if (!brand?.connectToken) return null;
  const claims = verifyEmailPreviewToken(
    token,
    env.BETTER_AUTH_SECRET,
    brand.connectToken,
  );
  if (!claims) return null;
  const editions = await renderEmailSelection(brand, claims.platformPostIds);
  return editions.length
    ? {
        brandName: brand.name,
        expiresAt: new Date(claims.expiresAt).toISOString(),
        editions,
      }
    : null;
}

async function renderEmailSelection(
  brand: typeof brandTable.$inferSelect,
  ids: string[],
) {
  const rows = (await emailRows(brand.id, ids)).filter(
    (row) => !["archived", "rejected"].includes(row.status),
  );
  const docs = await documents(
    brand.id,
    rows.map((row) => row.id),
  );
  const editions = await Promise.all(
    ids.flatMap((id) => {
      const row = rows.find((item) => item.id === id),
        document = docs.get(id);
      if (!row || !document) return [];
      return [
        (async () => {
          const rendered = await renderDesignSystemNewsletter({
            document,
            brandName: brand.name,
            logo: brand.brandIdentity?.logo ?? brand.logo,
            sender: brand.emailSender,
            legal: brand.legalIdentity,
            recipient: { email: "preview@example.invalid" },
          });
          return {
            id,
            subject: document.subject,
            preheader: document.preheader ?? null,
            series: row.contentPost?.series?.name ?? null,
            plannedAt: row.scheduledAt?.toISOString() ?? null,
            html: rendered.html,
          };
        })(),
      ];
    }),
  );
  return editions;
}
export async function loadOwnedEmailPrint(
  orgId: string,
  brandId: string,
  ids: string[],
) {
  const brand = await ownedBrand(orgId, brandId);
  const editions = await renderEmailSelection(brand, ids);
  if (editions.length !== ids.length)
    throw new ORPCError("NOT_FOUND", {
      message: "Some selected emails are no longer available for this brand.",
    });
  return { brandName: brand.name, editions };
}
