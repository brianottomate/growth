/**
 * The per-guest fields an email can use, written into copy as
 * `{{first_name}}` or with a fallback, `{{first_name|there}}`.
 *
 * Growth fills them itself when it renders an email per guest; for a bulk send
 * the same copy compiles to Postmark's template syntax instead. Customer.io
 * Liquid never appears here.
 */

export const EMAIL_FIELDS = {
  first_name: "The guest's first name",
  last_home: "The home of their most recent completed stay",
} as const;

export type EmailField = keyof typeof EMAIL_FIELDS;

export type EmailRecipient = {
  email: string;
  first_name?: string | null;
  last_home?: string | null;
};

/** What the preview fills fields with. */
export const SAMPLE_RECIPIENT: EmailRecipient = {
  email: "jane@example.com",
  first_name: "Jane",
  last_home: "Lakota Park Villa 211",
};

/**
 * Where a rendered email's unsubscribe link goes: Postmark's own syntax. On a
 * Postmark-managed broadcast stream Postmark fills it; on a stream that leaves
 * unsubscribes to Growth, the send swaps in the guest's signed link.
 */
export const UNSUBSCRIBE_PLACEHOLDER = "{{{ pm:unsubscribe }}}";

const FIELD = /\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Every field an email uses that Growth does not know. */
export function unknownFields(text: string) {
  return [...text.matchAll(FIELD)]
    .map((match) => match[1]!)
    .filter((name) => !Object.hasOwn(EMAIL_FIELDS, name));
}

/**
 * Fill every field for one guest. A field the guest has no value for takes
 * its fallback, or disappears. HTML output escapes the value.
 */
export function fillFields(
  text: string,
  recipient: EmailRecipient,
  options: { html: boolean },
) {
  return text.replace(FIELD, (_match, name: string, fallback?: string) => {
    const value = Object.hasOwn(EMAIL_FIELDS, name)
      ? recipient[name as EmailField]?.trim()
      : undefined;
    const filled = value || fallback?.trim() || "";
    return options.html ? escapeHtml(filled) : filled;
  });
}

/**
 * One email as a Postmark bulk template: each field occurrence becomes its
 * own key (`f0`, `f1`, ...) and `modelFor` resolves value-or-fallback per
 * guest, so the template needs no sections. HTML escapes the value (`{{f0}}`);
 * the subject and text take it raw (`{{{f0}}}`).
 */
export function compilePostmarkTemplate(parts: {
  subject: string;
  html: string;
  text: string;
}) {
  const fields: { name: string; fallback: string }[] = [];
  const compile = (content: string, raw: boolean) =>
    content.replace(FIELD, (_match, name: string, fallback?: string) => {
      const key = `f${fields.length}`;
      fields.push({ name, fallback: fallback?.trim() ?? "" });
      return raw ? `{{{${key}}}}` : `{{${key}}}`;
    });
  return {
    subject: compile(parts.subject, true),
    html: compile(parts.html, false),
    text: compile(parts.text, true),
    modelFor(recipient: EmailRecipient) {
      return Object.fromEntries(
        fields.map(({ name, fallback }, index) => {
          const value = Object.hasOwn(EMAIL_FIELDS, name)
            ? recipient[name as EmailField]?.trim()
            : undefined;
          return [`f${index}`, value || fallback];
        }),
      );
    },
  };
}

/**
 * Template syntax that would reach a reader as literal text: Customer.io
 * Liquid, or braces left over after filling.
 */
export function leftoverTemplateSyntax(html: string) {
  return /\{\{|\{%/.test(html);
}
