export type MetaAdBillingStatus =
  | "present"
  | "missing"
  | "payment_issue"
  | "unknown"
  | "not_selected";

/** Zernio owns billing visibility; an absent funding source alone proves nothing.
 * https://docs.zernio.com/ad-accounts/list-ad-accounts
 */
export function metaAdBillingStatus(account: {
  billingStatus?: string;
  accountStatus?: number | string | null;
  disableReason?: number;
}): Exclude<MetaAdBillingStatus, "not_selected"> {
  const status = Number(account.accountStatus);
  if (
    status === 3 ||
    status === 8 ||
    status === 9 ||
    account.disableReason === 3
  )
    return "payment_issue";
  if (account.billingStatus === "ok") return "present";
  if (account.billingStatus === "missing") return "missing";
  return "unknown";
}
