import "server-only";
import { emailFixtures, previewHomes } from "../email-fixtures";
import { getEmailDraftOutputSchema } from "@/server/ai/capabilities/outputs/email";
import { emailDocumentDraftSchema } from "@/lib/email-document";
import { renderDesignSystemNewsletter } from "@/server/email/design-system-newsletter-renderer";
import type { EmailClientPreview } from "@/lib/email-client-preview";

export async function clientReviewFixture(): Promise<EmailClientPreview> {
  const data = getEmailDraftOutputSchema.parse(
    (emailFixtures[0]!.payload as { data: unknown }).data,
  );
  const documents = [
    emailDocumentDraftSchema.parse(data.document),
    emailDocumentDraftSchema.parse({
      ...data.document,
      subject: "The next chapter: a weekend made for gathering",
      preheader: "Your second newsletter edition.",
      bodyMarkdown:
        "Hi there,\n\nPlan a weekend made for gathering, with a creekside home base and room for game nights.\n\n<!-- homes -->\n\nFind the right fit for your next Grand County escape.",
      digest: {
        schema: "wander-growth.listings-digest.v1",
        sections: [
          {
            heading: "Your next mountain stay",
            layout: "list",
            showPrices: false,
            properties: [previewHomes[1], previewHomes[2]],
          },
        ],
      },
    }),
  ];
  return {
    brandName: data.brand.name,
    expiresAt: "2026-11-18T12:00:00Z",
    editions: await Promise.all(
      documents.map(async (document, index) => ({
        id: `demo-email-${index}`,
        subject: document.subject,
        preheader: document.preheader ?? null,
        series: data.content?.series?.name ?? null,
        plannedAt: index ? "2026-11-20T17:00:00Z" : data.spot.scheduledAt,
        html: (
          await renderDesignSystemNewsletter({
            document,
            brandName: data.brand.name,
          })
        ).html,
      })),
    ),
  };
}
