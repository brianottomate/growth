import {
  compilePostmarkTemplate,
  materializePostmarkTemplate,
  type EmailRecipient,
  UNSUBSCRIBE_PLACEHOLDER,
} from "@/lib/email-personalization";

type PostmarkSender = {
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
};

export function postmarkSetupMatches(
  prepared: {
    sender: PostmarkSender;
    serverId: number;
    messageStream: string;
  },
  current: {
    sender: PostmarkSender;
    serverId?: number;
    messageStream?: string;
  },
) {
  return (
    JSON.stringify(prepared.sender) === JSON.stringify(current.sender) &&
    prepared.serverId === current.serverId &&
    prepared.messageStream === current.messageStream
  );
}

/** Postmark templates reject link stylesheets; preserve the renderer's font. */
export function postmarkSafeHtml(html: string) {
  return html.replace(
    /<link\b[^>]*href="([^"]+)"[^>]*rel="stylesheet"[^>]*\/?>/g,
    (_tag, href: string) =>
      `<style>@import url("${href.replace(/&amp;/g, "&")}");</style>`,
  );
}

export function compilePostmarkBroadcast(input: {
  subject: string;
  html: string;
  text: string;
  recipientKeyPlaceholder: string;
  growthManagedUnsubscribe: boolean;
}) {
  const compiled = compilePostmarkTemplate({
    subject: input.subject,
    html: postmarkSafeHtml(input.html),
    text: input.text,
  });
  const unsubscribeKey = (content: string) =>
    input.growthManagedUnsubscribe
      ? content.replaceAll(UNSUBSCRIBE_PLACEHOLDER, "{{{unsubscribe_url}}}")
      : content;
  return {
    ...compiled,
    html: unsubscribeKey(compiled.html).replaceAll(
      input.recipientKeyPlaceholder,
      "{{{growth_recipient_key}}}",
    ),
    text: unsubscribeKey(compiled.text).replaceAll(
      input.recipientKeyPlaceholder,
      "{{{growth_recipient_key}}}",
    ),
  };
}

export function postmarkBroadcastModel(
  template: ReturnType<typeof compilePostmarkBroadcast>,
  recipient: EmailRecipient,
  input: { recipientKey: string; unsubscribeUrl?: string },
): Record<string, string> {
  return {
    ...template.modelFor(recipient),
    growth_recipient_key: input.recipientKey,
    ...(input.unsubscribeUrl ? { unsubscribe_url: input.unsubscribeUrl } : {}),
  };
}

/** A single seed email materialized from the exact live bulk template. */
export function materializePostmarkBroadcast(
  template: ReturnType<typeof compilePostmarkBroadcast>,
  recipient: EmailRecipient,
  input: { recipientKey: string; unsubscribeUrl?: string },
) {
  const model = postmarkBroadcastModel(template, recipient, input);
  return {
    subject: materializePostmarkTemplate(template.subject, model),
    html: materializePostmarkTemplate(template.html, model),
    text: materializePostmarkTemplate(template.text, model),
  };
}
