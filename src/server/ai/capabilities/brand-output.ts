import { brandEmailSenderSchema } from "./outputs/shared";
import type { Brand } from "@/server/db/brand-schema";

type ConnectionFields = Pick<
  Brand,
  | "connectToken"
  | "connectTokenIssuedAt"
  | "connectTokenIssuedByEmail"
  | "connectTokenIssuedByName"
> & { emailSender?: Brand["emailSender"] };

/** Connection-link credentials belong to the operator UI, never model results. */
export function brandForAssistant<T extends ConnectionFields>(brand: T) {
  const {
    connectToken: _token,
    connectTokenIssuedAt: _issuedAt,
    connectTokenIssuedByEmail: _issuedByEmail,
    connectTokenIssuedByName: _issuedByName,
    emailSender,
    ...visible
  } = brand;
  return {
    ...visible,
    // Project only declared sender settings; preserve the stored record.
    ...("emailSender" in brand
      ? {
          emailSender:
            emailSender == null
              ? null
              : brandEmailSenderSchema.unwrap().strip().parse(emailSender),
        }
      : {}),
  };
}
