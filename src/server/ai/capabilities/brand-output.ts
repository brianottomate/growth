import { brandEmailSenderSchema } from "./outputs/shared";
import type { Brand } from "@/server/db/brand-schema";

type ConnectionFields = Pick<
  Brand,
  | "connectToken"
  | "connectTokenIssuedAt"
  | "connectTokenIssuedByEmail"
  | "connectTokenIssuedByName"
> & { emailSender: unknown };

/** Connection-link credentials belong to the operator UI, never model results. */
export function brandForAssistant<
  T extends ConnectionFields & { pitchSettings?: unknown },
>(brand: T) {
  const {
    pitchSettings: _pitchSettings,
    connectToken: _token,
    connectTokenIssuedAt: _issuedAt,
    connectTokenIssuedByEmail: _issuedByEmail,
    connectTokenIssuedByName: _issuedByName,
    emailSender,
    ...visible
  } = brand;
  // Historical sender JSON used a string here; current DNS setup is a typed object.
  const sender =
    emailSender &&
    typeof emailSender === "object" &&
    "marketingDomain" in emailSender &&
    typeof emailSender.marketingDomain === "string"
      ? { ...emailSender, marketingDomain: undefined }
      : emailSender;
  return {
    ...visible,
    // Project only declared sender settings; preserve the stored record.
    emailSender:
      emailSender == null
        ? null
        : brandEmailSenderSchema.unwrap().strip().parse(sender),
  };
}
