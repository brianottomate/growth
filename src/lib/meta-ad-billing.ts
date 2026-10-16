export type MetaAdBillingStatus =
  | "present"
  | "missing"
  | "payment_issue"
  | "unknown"
  | "not_selected";

/** Meta refusing to charge an ad account, as a push reported it. */
export type MetaBillingIssue = {
  subcode: number | null;
  message: string;
  at: string;
};

/** Meta's "No Payment Method" refusal (code 100) on a create. */
const NO_PAYMENT_METHOD_SUBCODE = 1359188;

/** The key metaBillingIssues uses: the ad account id without `act_`. */
export function metaBillingIssueKey(adAccountId: string) {
  return adAccountId.replace(/^act_/i, "");
}

/**
 * The billing refusal in a failed Meta write, if that is what it was. Zernio
 * forwards Meta's error as JSON after "Zernio <path> failed: <status> ".
 */
export function metaBillingIssueFrom(
  error: unknown,
): Omit<MetaBillingIssue, "at"> | null {
  const text = error instanceof Error ? error.message : String(error);
  const start = text.indexOf("{");
  if (start < 0) return null;
  let body!: {
    error?: unknown;
    platformError?: {
      error_subcode?: unknown;
      error_user_title?: unknown;
      error_user_msg?: unknown;
    };
  };
  // The push may wrap it in its own sentence, so the JSON can end early.
  let end = text.lastIndexOf("}");
  for (;;) {
    if (end < start) return null;
    try {
      body = JSON.parse(text.slice(start, end + 1)) as typeof body;
      break;
    } catch {
      end = text.lastIndexOf("}", end - 1);
    }
  }
  const platformError = body.platformError;
  if (
    platformError?.error_subcode !== NO_PAYMENT_METHOD_SUBCODE &&
    platformError?.error_user_title !== "No Payment Method"
  )
    return null;
  return {
    subcode:
      typeof platformError.error_subcode === "number"
        ? platformError.error_subcode
        : null,
    message:
      typeof platformError.error_user_msg === "string"
        ? platformError.error_user_msg
        : typeof body.error === "string"
          ? body.error
          : "No Payment Method",
  };
}

/** Zernio owns billing visibility; an absent funding source alone proves nothing.
 * A refusal Meta returned on a push outranks Zernio's "ok".
 * https://docs.zernio.com/ad-accounts/list-ad-accounts
 */
export function metaAdBillingStatus(
  account: {
    billingStatus?: string;
    accountStatus?: number | string | null;
    disableReason?: number;
  },
  pushIssue?: MetaBillingIssue | null,
): Exclude<MetaAdBillingStatus, "not_selected"> {
  if (pushIssue) return "payment_issue";
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
