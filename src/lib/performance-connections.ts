import type { MetaAdBillingStatus } from "@/lib/meta-ad-billing";

export type PerformanceConnectionSummary = {
  profile: "connected" | "missing";
  meta: "ready" | "incomplete" | "reconnect" | "unknown";
  billing: MetaAdBillingStatus;
  route: string;
  clientSetupComplete: boolean;
  pixelId: string | null;
  sitePixelIds: string[] | null;
  customerPixelId: string | null;
};

export function performanceConnectionLines(
  value: PerformanceConnectionSummary,
) {
  const pixel = value.pixelId;
  const installed = value.sitePixelIds;
  return [
    {
      label: "Zernio",
      value:
        value.profile === "connected"
          ? "Brand profile connected"
          : "No brand profile",
      ready: value.profile === "connected",
    },
    {
      label: "Meta Ads",
      value: `${{ ready: "Ready", incomplete: "Setup incomplete", reconnect: "Needs reconnection", unknown: "Status unavailable" }[value.meta]} · ${value.route}`,
      ready: value.meta === "ready",
    },
    {
      label: "Ad billing",
      value: {
        present: "Payment method present",
        missing: "Payment method missing · Add in Meta billing",
        payment_issue: "Payment issue · Review Meta billing",
        unknown: "Unverified · Check Meta billing access",
        not_selected: "Select an ad account",
      }[value.billing],
      ready: value.billing === "present",
    },
    {
      label: "Pixel",
      value: pixel
        ? `${pixel} · ${installed === null ? "WanderOS unverified" : installed.includes(pixel) ? "Installed on WanderOS" : "Not installed on WanderOS"}`
        : value.customerPixelId
          ? `${value.customerPixelId} on site · Select ad pixel`
          : installed?.length
            ? "Site pixels present · Select ad pixel"
            : "No ad pixel selected",
      ready: Boolean(pixel && installed?.includes(pixel)),
    },
  ];
}
