import "server-only";
import { emailFixtures } from "../email-fixtures";
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
        "## A place for everyone\\n\\nFind room to gather and reconnect.\\n\\n![A quiet home](https://growth-red.vercel.app/auth-hero.jpg)\\n\\n### Before you go\\n\\nThis is the complete second edition, including the final paragraph and CTA.".replaceAll(
          "\\n",
          "\n",
        ),
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
