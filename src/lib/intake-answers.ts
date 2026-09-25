/**
 * An intake's answers as the questions the form asked, in the form's order.
 * Client-safe: the brand's Submission tab and the Submissions review panel
 * both render it. The receipt is never rewritten, so a key a newer form adds
 * still shows, under its own name, after the known ones.
 */

export type IntakeAnswerValue =
  | { kind: "text"; text: string }
  | { kind: "yes"; yes: boolean }
  | { kind: "link"; url: string }
  | { kind: "homes"; all: boolean; urls: string[] };

export type IntakeAnswerRow = {
  key: string;
  label: string;
  value: IntakeAnswerValue | null;
};

const QUESTIONS: {
  key: string;
  label: string;
  kind: "text" | "yes" | "link";
}[] = [
  { key: "detailsConfirmed", label: "Details confirmed", kind: "yes" },
  { key: "reportEmails", label: "Report emails", kind: "text" },
  { key: "propertyNotes", label: "Notes on homes", kind: "text" },
  { key: "budget", label: "Monthly media budget", kind: "text" },
  { key: "billingAcknowledged", label: "Billing acknowledged", kind: "yes" },
  { key: "invoiceEmail", label: "Invoice email", kind: "text" },
  { key: "creativeDriveUrl", label: "Creative folder", kind: "link" },
  { key: "guestListDriveUrl", label: "Guest list", kind: "link" },
  { key: "accountsConnected", label: "Ad accounts connected", kind: "yes" },
];

/** `budget: "recommend"` is the form's "recommend one for me" chip. */
const BUDGET_RECOMMEND = /^recommend/i;

function isHttpUrl(value: string) {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

function valueOf(
  kind: "text" | "yes" | "link",
  raw: unknown,
  key: string,
): IntakeAnswerValue | null {
  if (kind === "yes")
    return typeof raw === "boolean" ? { kind, yes: raw } : null;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const text = raw.trim();
  if (kind === "link" && isHttpUrl(text)) return { kind: "link", url: text };
  if (key === "budget" && BUDGET_RECOMMEND.test(text))
    return { kind: "text", text: "Asked us to recommend one" };
  return { kind: "text", text };
}

function otherValue(raw: unknown): IntakeAnswerValue | null {
  if (typeof raw === "boolean") return { kind: "yes", yes: raw };
  if (typeof raw === "number") return { kind: "text", text: String(raw) };
  if (typeof raw === "string") {
    if (!raw.trim()) return null;
    return isHttpUrl(raw)
      ? { kind: "link", url: raw.trim() }
      : { kind: "text", text: raw.trim() };
  }
  if (raw == null) return null;
  return { kind: "text", text: JSON.stringify(raw) };
}

const KNOWN = new Set([
  "propertyUrls",
  "allProperties",
  ...QUESTIONS.map((q) => q.key),
]);

/** Splits camelCase for a key the form added after this list was written. */
function labelFor(key: string) {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function intakeAnswerRows(
  answers: Record<string, unknown>,
): IntakeAnswerRow[] {
  const urls = Array.isArray(answers.propertyUrls)
    ? answers.propertyUrls.filter(
        (url): url is string => typeof url === "string" && Boolean(url.trim()),
      )
    : [];
  const homes: IntakeAnswerRow = {
    key: "propertyUrls",
    label: "Homes to advertise",
    value:
      answers.allProperties === true || urls.length
        ? { kind: "homes", all: answers.allProperties === true, urls }
        : null,
  };
  const known = QUESTIONS.map((q) => ({
    key: q.key,
    label: q.label,
    value: valueOf(q.kind, answers[q.key], q.key),
  }));
  const other = Object.keys(answers)
    .filter((key) => !KNOWN.has(key))
    .map((key) => ({
      key,
      label: labelFor(key),
      value: otherValue(answers[key]),
    }))
    .filter((row) => row.value);
  // Homes sit where the form asks them: after the details step.
  return [...known.slice(0, 2), homes, ...known.slice(2), ...other];
}
