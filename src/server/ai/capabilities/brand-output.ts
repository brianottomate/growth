import type { Brand } from "@/server/db/brand-schema";

type ConnectionFields = Pick<
  Brand,
  | "connectToken"
  | "connectTokenIssuedAt"
  | "connectTokenIssuedByEmail"
  | "connectTokenIssuedByName"
>;

/** Connection-link credentials belong to the operator UI, never model results. */
export function brandForAssistant<T extends ConnectionFields>(brand: T) {
  const {
    connectToken: _token,
    connectTokenIssuedAt: _issuedAt,
    connectTokenIssuedByEmail: _issuedByEmail,
    connectTokenIssuedByName: _issuedByName,
    ...visible
  } = brand;
  return visible;
}
