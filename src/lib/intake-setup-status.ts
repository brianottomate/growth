import type { PerformanceConnectionSummary } from "./performance-connections";

export type IntakeSetupCheck = {
  key: string;
  label: string;
  state: "ready" | "action_required" | "pending" | "unknown";
  detail: string;
};

/** Client-facing projection: no account IDs, pixel IDs, tokens or DNS records. */
export function intakeSetupSummary(
  connection: PerformanceConnectionSummary,
  email: "verified" | "pending" | "not_prepared" | "unknown",
  google: "connected" | "missing" | "reconnect" | "unknown",
  metaAuthorized = false,
) {
  const checks: IntakeSetupCheck[] = [
    {
      key: "meta",
      label: "Meta Ads",
      state:
        connection.meta === "ready"
          ? "ready"
          : connection.meta === "unknown"
            ? "unknown"
            : connection.meta === "reconnect" || connection.meta === "blocked"
              ? "action_required"
              : metaAuthorized
                ? "pending"
                : "action_required",
      detail: {
        ready: "Your Meta ad account is connected.",
        unknown: "We could not verify Meta right now. Try checking again.",
        reconnect: "Reconnect Meta using the account connection link above.",
        blocked:
          "Review your ad account's restrictions in Meta, or ask your Wander contact for help.",
        incomplete: metaAuthorized
          ? "Wander needs to finish selecting and verifying your ad account."
          : "Open the account connection link and approve Meta access.",
      }[connection.meta],
    },
    {
      key: "billing",
      label: "Meta ad billing",
      state:
        connection.billing === "present"
          ? "ready"
          : connection.billing === "unknown"
            ? "unknown"
            : connection.billing === "not_selected"
              ? "pending"
              : "action_required",
      detail: {
        present:
          "A payment method is present. Meta still checks payments when ads run.",
        missing: "Add a payment method in Meta's Billing & payments.",
        payment_issue: "Review the payment issue in Meta's Billing & payments.",
        unknown:
          "Billing could not be verified. Your Wander contact can help check billing access.",
        not_selected:
          "Billing can be checked once your ad account is selected.",
      }[connection.billing],
    },
    {
      key: "pixel",
      label: "Website tracking",
      state:
        connection.pixelId &&
        connection.sitePixelIds?.includes(connection.pixelId)
          ? "ready"
          : connection.pixelId && connection.sitePixelIds === null
            ? "unknown"
            : "pending",
      detail: connection.pixelId
        ? connection.sitePixelIds?.includes(connection.pixelId)
          ? "Your selected Meta pixel is installed on your WanderOS website. Event delivery is checked separately."
          : connection.sitePixelIds === null
            ? "Your pixel is saved, but we could not verify its installation right now."
            : "Your pixel is saved. Wander needs to install and verify it on your website."
        : "Wander needs to finish preparing your website tracking.",
    },
    {
      key: "google",
      label: "Google Ads connection",
      state:
        google === "connected"
          ? "ready"
          : google === "unknown"
            ? "unknown"
            : "action_required",
      detail: {
        connected:
          "Your Google Ads authorization is connected. Campaign setup is reviewed separately.",
        missing:
          "Open the account connection link to connect Google Ads, if included in your plan.",
        reconnect: "Reconnect Google Ads using the account connection link.",
        unknown: "We could not verify the Google Ads connection right now.",
      }[google],
    },
    {
      key: "email",
      label: "Email and DNS (recommended)",
      state:
        email === "verified"
          ? "ready"
          : email === "pending"
            ? "action_required"
            : email === "unknown"
              ? "unknown"
              : "pending",
      detail: {
        verified: "Your email domain's authentication records are verified.",
        pending:
          "Complete the email and DNS setup link, then check again. DNS changes may take time to appear.",
        not_prepared: "Wander needs to prepare your email domain setup link.",
        unknown:
          "We could not verify your email DNS right now. Try checking again.",
      }[email],
    },
  ];
  return { ready: checks.every((check) => check.state === "ready"), checks };
}
