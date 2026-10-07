import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { emailSequenceTable } from "@/server/db/schema";
import {
  createEmailSlot,
  saveEmailDocument,
} from "@/server/services/email-document.service";
import {
  saveEmailSequence,
  listSequenceEmails,
} from "@/server/services/email-sequence.service";

export async function createFlexTestSequence(input: {
  organizationId: string;
  userId: string;
  brandId: string;
}) {
  await listSequenceEmails(input.organizationId, input.brandId);
  const existing = await db.query.emailSequenceTable.findFirst({
    where: and(
      eq(emailSequenceTable.brandId, input.brandId),
      eq(emailSequenceTable.triggerEvent, "test.manual"),
      eq(emailSequenceTable.name, "Flex test sequence"),
      isNull(emailSequenceTable.deletedAt),
    ),
  });
  if (existing) return { id: existing.id };
  const steps = [];
  for (let index = 0; index < 3; index++) {
    const slot = await createEmailSlot({
      ...input,
      title: `Flex test email ${index + 1}`,
      format: "newsletter.blast",
    });
    await saveEmailDocument({
      ...input,
      platformPostId: slot.platformPostId,
      draft: {
        subject: `Flex test email ${index + 1} of 3`,
        bodyMarkdown: `Hi {{first_name|there}},\n\nThis is email ${index + 1} of your Flex test sequence.${index < 2 ? " The next email is scheduled one minute after this send is accepted." : " Your test sequence is complete."}`,
        templateKey: "editorial",
      },
    });
    steps.push({
      id: randomUUID(),
      platformPostId: slot.platformPostId,
      name: `Email ${index + 1}`,
      waitMinutes: index ? 1 : 0,
    });
  }
  return saveEmailSequence({
    ...input,
    draft: {
      name: "Flex test sequence",
      description:
        "Three editable test emails, one minute apart. Run manually to chosen recipients.",
      triggerEvent: "test.manual",
      exitCondition: null,
      steps,
    },
  });
}
