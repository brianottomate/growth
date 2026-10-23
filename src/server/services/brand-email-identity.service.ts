import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { brandMarketingDomainSchema } from "@/lib/email-dns";
import { brandSendBlockers } from "@/lib/email-delivery";
import { withTransaction } from "@/server/db";
import type {
  BrandEmailSender,
  BrandLegalIdentity,
} from "@/server/db/brand-schema";
import { brandTable } from "@/server/db/schema";

export type BrandPostalAddress = NonNullable<
  NonNullable<BrandLegalIdentity["address"]>
>;

export type BrandEmailIdentityInput = {
  brandId: string;
  organizationId: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  legalName: string;
  address: BrandPostalAddress;
};

export class BrandEmailIdentityError extends Error {
  constructor(
    readonly code: "BAD_REQUEST" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "BrandEmailIdentityError";
  }
}

function cleanOptional(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

export function planBrandEmailIdentityUpdate(
  input: Omit<BrandEmailIdentityInput, "brandId" | "organizationId">,
  current: {
    emailSender: BrandEmailSender | null;
    legalIdentity: BrandLegalIdentity | null;
  },
) {
  const marketingDomain = brandMarketingDomainSchema.safeParse(
    current.emailSender?.marketingDomain,
  );
  if (!marketingDomain.success)
    throw new BrandEmailIdentityError(
      "BAD_REQUEST",
      "Prepare this brand's authenticated marketing domain before setting its sender.",
    );

  const fromEmail = input.fromEmail.trim().toLowerCase();
  const replyTo = input.replyTo.trim().toLowerCase();
  const fromDomain = fromEmail.split("@").at(-1);
  if (fromDomain !== marketingDomain.data.sendingDomain.toLowerCase())
    throw new BrandEmailIdentityError(
      "BAD_REQUEST",
      `The From address must use ${marketingDomain.data.sendingDomain}.`,
    );

  const emailSender: BrandEmailSender = {
    ...current.emailSender,
    fromName: input.fromName.trim(),
    fromEmail,
    replyTo,
  };
  const legalIdentity: BrandLegalIdentity = {
    ...(current.legalIdentity ?? {}),
    legalName: input.legalName.trim(),
    address: {
      line1: input.address.line1.trim(),
      line2: cleanOptional(input.address.line2),
      city: input.address.city.trim(),
      region: cleanOptional(input.address.region),
      postalCode: cleanOptional(input.address.postalCode),
      country: cleanOptional(input.address.country)?.toUpperCase() ?? null,
    },
  };
  return {
    emailSender,
    legalIdentity,
    sendingDomain: marketingDomain.data.sendingDomain,
  };
}

/**
 * Update the sender and required legal footer on the canonical brand row.
 * The locked row keeps domain validation and the two JSONB patches atomic.
 */
export async function setBrandEmailIdentity(input: BrandEmailIdentityInput) {
  return withTransaction(async (tx) => {
    const [brand] = await tx
      .select({
        id: brandTable.id,
        name: brandTable.name,
        emailDelivery: brandTable.emailDelivery,
        emailSender: brandTable.emailSender,
        legalIdentity: brandTable.legalIdentity,
      })
      .from(brandTable)
      .where(
        and(
          eq(brandTable.id, input.brandId),
          eq(brandTable.organizationId, input.organizationId),
          isNull(brandTable.deletedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!brand)
      throw new BrandEmailIdentityError(
        "NOT_FOUND",
        "Brand not found in this workspace.",
      );

    const next = planBrandEmailIdentityUpdate(input, brand);
    const [saved] = await tx
      .update(brandTable)
      .set({
        emailSender: next.emailSender,
        legalIdentity: next.legalIdentity,
      })
      .where(
        and(
          eq(brandTable.id, brand.id),
          eq(brandTable.organizationId, input.organizationId),
          isNull(brandTable.deletedAt),
        ),
      )
      .returning({
        id: brandTable.id,
        name: brandTable.name,
        emailDelivery: brandTable.emailDelivery,
        emailSender: brandTable.emailSender,
        legalIdentity: brandTable.legalIdentity,
      });
    if (!saved)
      throw new BrandEmailIdentityError(
        "NOT_FOUND",
        "Brand is no longer available in this workspace.",
      );

    return {
      brandId: saved.id,
      sendingDomain: next.sendingDomain,
      emailSender: {
        fromName: next.emailSender.fromName,
        fromEmail: next.emailSender.fromEmail!,
        replyTo: next.emailSender.replyTo!,
      },
      legalIdentity: {
        legalName: next.legalIdentity.legalName!,
        address: {
          line1: next.legalIdentity.address!.line1,
          line2: next.legalIdentity.address!.line2 ?? null,
          city: next.legalIdentity.address!.city,
          region: next.legalIdentity.address!.region ?? null,
          postalCode: next.legalIdentity.address!.postalCode ?? null,
          country: next.legalIdentity.address!.country ?? null,
        },
      },
      sendBlockers: brandSendBlockers(saved),
    };
  });
}
