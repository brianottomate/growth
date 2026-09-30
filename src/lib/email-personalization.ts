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

/** The same fields in Postmark's template syntax, for a bulk send. */
export function toPostmarkTemplate(text: string) {
  return text.replace(FIELD, (_match, name: string, fallback?: string) =>
    fallback?.trim()
      ? `{{#${name}}}{{${name}}}{{/${name}}}{{^${name}}}${fallback.trim()}{{/${name}}}`
      : `{{${name}}}`,
  );
}

/**
 * Template syntax that would reach a reader as literal text: Customer.io
 * Liquid, or braces left over after filling.
 */
export function leftoverTemplateSyntax(html: string) {
  return /\{\{|\{%/.test(html);
}
