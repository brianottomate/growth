import { createHash } from "node:crypto";
import {
  fillFields,
  unknownFields,
  leftoverTemplateSyntax,
} from "@/lib/email-personalization";
import { z } from "zod";
import { brandSendBlockers } from "@/lib/email-delivery";
import type {
  BrandEmailDelivery,
  BrandEmailSender,
  BrandLegalIdentity,
} from "@/server/db/brand-schema";
import type {
  LifecycleAttributes,
  LifecycleCondition,
  LifecycleEmailPayload,
  LifecycleExecutionSettings,
  LifecycleExecutionSnapshot,
} from "@/lib/validators/lifecycle-runtime";

export function contentHash(value: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, item]) => [k, canonical(item)]),
      );
    return v;
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

export function matchesCondition(
  condition: LifecycleCondition,
  attributes: LifecycleAttributes,
) {
  const value = Object.hasOwn(attributes, condition.field)
    ? attributes[condition.field]
    : undefined;
  if (condition.operator === "exists")
    return condition.value === true ? value != null : value == null;
  // Missing live data must never accidentally satisfy a negative condition.
  if (value == null) return false;
  switch (condition.operator) {
    case "eq":
      return value === condition.value;
    case "neq":
      return value !== condition.value;
    case "gt":
      return (
        typeof value === "number" &&
        typeof condition.value === "number" &&
        value > condition.value
      );
    case "gte":
      return (
        typeof value === "number" &&
        typeof condition.value === "number" &&
        value >= condition.value
      );
    case "lt":
      return (
        typeof value === "number" &&
        typeof condition.value === "number" &&
        value < condition.value
      );
    case "lte":
      return (
        typeof value === "number" &&
        typeof condition.value === "number" &&
        value <= condition.value
      );
  }
}

type SequenceEmail = {
  id: string;
  name: string;
  platformPostId: string | null;
  subject: string;
  body: string;
  renderedHtml: string;
  renderedText: string;
  delayMinutes: number;
  position: number;
};
export function compileJourney(
  settings: LifecycleExecutionSettings,
  steps: SequenceEmail[],
  delivery: LifecycleExecutionSnapshot["delivery"] = null,
  postalAddress: string | null = null,
) {
  const errors: string[] = [];
  const sender = /<([^<>]+)>$/.exec(settings.from)?.[1] ?? settings.from;
  if (!z.email().safeParse(sender).success)
    errors.push("From must be an email address or Name <email@example.com>.");
  if (!steps.length || steps.length > 50)
    errors.push("A sequence requires 1–50 email steps.");
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  let previousOffset = 0;
  for (const step of ordered) {
    if (!step.subject.trim() || !step.body.trim())
      errors.push(`${step.name}: subject and body are required.`);
    if (/[\r\n]/.test(step.subject))
      errors.push(`${step.name}: subject must be one line.`);
    if (
      !Number.isInteger(step.delayMinutes) ||
      step.delayMinutes < previousOffset ||
      step.delayMinutes > 525600
    )
      errors.push(
        `${step.name}: invalid wait or total duration exceeds one year.`,
      );
    previousOffset = step.delayMinutes;
    const unknown = unknownFields(
      `${step.subject} ${step.renderedHtml} ${step.renderedText}`,
    );
    if (unknown.length)
      errors.push(
        `${step.name}: unknown email fields: ${[...new Set(unknown)].join(", ")}`,
      );
  }
  const snapshot: LifecycleExecutionSnapshot = {
    settings,
    delivery,
    postalAddress,
    steps: ordered.map((step) => ({
      id: step.id,
      name: step.name,
      subject: step.subject,
      body: step.body,
      platformPostId: step.platformPostId,
      renderedHtml: step.renderedHtml,
      renderedText: step.renderedText,
      delayMinutes: step.delayMinutes,
      parentStepId: null,
      condition: null,
    })),
  };
  // Catch unsupported template syntax before activation, with harmless sample fields.
  for (const step of snapshot.steps) {
    const sample = {
      email: "preview@example.com",
      first_name: "Guest",
      last_home: "Your last stay",
    };
    const rendered = fillFields(
      `${step.subject} ${step.renderedHtml} ${step.renderedText}`,
      sample,
      { html: false },
    ).replaceAll("{{{ pm:unsubscribe }}}", "");
    if (leftoverTemplateSyntax(rendered))
      errors.push(
        `${step.name}: unsupported template syntax remains in the rendered email.`,
      );
  }
  return {
    snapshot,
    contentHash: contentHash(snapshot),
    errors,
    variables: [
      ...new Set(
        snapshot.steps.flatMap((s) =>
          [...`${s.subject} ${s.body}`.matchAll(/\{\{\s*([a-z_]+)/g)].map(
            (m) => m[1]!,
          ),
        ),
      ),
    ],
  };
}

export function renderLifecycleEmail(input: {
  snapshot: LifecycleExecutionSnapshot;
  step: LifecycleExecutionSnapshot["steps"][number];
  attributes: LifecycleAttributes;
  email: string;
  deliveryId: string;
}): LifecycleEmailPayload {
  if (!input.snapshot.delivery)
    throw new Error(
      "Prepare a version with the brand’s Postmark server and stream.",
    );
  const recipient = {
    email: input.email,
    first_name:
      typeof input.attributes.first_name === "string"
        ? input.attributes.first_name
        : null,
    last_home:
      typeof input.attributes.last_home === "string"
        ? input.attributes.last_home
        : null,
  };
  const subject = fillFields(input.step.subject, recipient, {
    html: false,
  }).replace(/[\r\n]/g, " ");
  const html = fillFields(input.step.renderedHtml, recipient, { html: true });
  const text = fillFields(input.step.renderedText, recipient, { html: false });
  if (
    !html ||
    leftoverTemplateSyntax(
      [subject, html, text].join("\n").replaceAll("{{{ pm:unsubscribe }}}", ""),
    )
  )
    throw new Error("Unresolved template syntax in the reviewed email.");
  return {
    from: input.snapshot.settings.from,
    to: input.email,
    ...(input.snapshot.settings.replyTo
      ? { replyTo: input.snapshot.settings.replyTo }
      : {}),
    subject,
    html,
    text,
    delivery: input.snapshot.delivery,
  };
}

export function assertJourneyBrand(
  snapshot: LifecycleExecutionSnapshot,
  brand: {
    name: string;
    emailDelivery: BrandEmailDelivery | null;
    emailSender: BrandEmailSender | null;
    legalIdentity: BrandLegalIdentity | null;
  },
) {
  const blockers = brandSendBlockers(brand);
  if (blockers.length) throw new Error(blockers.join(" "));
  if (
    snapshot.delivery?.provider !== "postmark" ||
    snapshot.delivery.serverId !== brand.emailDelivery?.serverId ||
    snapshot.delivery.messageStream !== brand.emailDelivery.messageStream
  )
    throw new Error(
      "The brand’s Postmark destination changed or was not configured at review. Prepare a new version.",
    );
  const from =
    /<([^<>]+)>$/.exec(snapshot.settings.from)?.[1] ?? snapshot.settings.from;
  if (from.toLowerCase() !== brand.emailSender?.fromEmail?.toLowerCase())
    throw new Error(
      "Use the brand’s configured from-address before activating this journey.",
    );
  if (!snapshot.postalAddress)
    throw new Error("Prepare a version with the brand’s postal address.");
}
