import { ExternalLink } from "lucide-react";

import { cn } from "@/components/ui/lib/utils";
import {
  SETTINGS_FIELDS,
  costPerBooking,
  settingsBookings,
  type SettingsDerived,
} from "@/lib/performance-settings";
import type { PerformanceSettings } from "@/server/db/brand-schema";

import { tile, SectionLabel } from "../../../_components";

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

type Cell = { text: string; href?: string; tone: "ok" | "warn" | "muted" };

/**
 * One client's settings as tiles, read-only. Derived tiles read what the app
 * already knows and say where from; settings tiles show the brand's
 * `performanceSettings`, which the agent writes (and an applied intake fills).
 * Nothing is edited here: ask in chat, and the change lands with a stamp.
 */
export function SettingsCard({
  derived,
  settings,
}: {
  derived: SettingsDerived;
  settings: PerformanceSettings | null;
}) {
  const bookings = settingsBookings(derived, settings);
  const cpb = costPerBooking(derived.actualSpend, bookings);

  const derivedCell = (key: string): Cell => {
    switch (key) {
      case "paidFee":
        return derived.paidFee != null
          ? { text: `${money(derived.paidFee)}/mo`, tone: "ok" }
          : { text: "No cycle yet", tone: "muted" };
      case "paidAdSpend": {
        if (derived.mediaBudget == null && derived.actualSpend === 0) {
          return { text: "No cycle yet", tone: "muted" };
        }
        const planned =
          derived.mediaBudget != null
            ? `${money(derived.mediaBudget)}/mo`
            : null;
        const spent =
          derived.actualSpend > 0
            ? `${money(derived.actualSpend)} spent`
            : null;
        return {
          text: [planned, spent].filter(Boolean).join(" · "),
          tone: "ok",
        };
      }
      case "onboardingLink":
        return derived.onboardingLink
          ? {
              text: host(derived.onboardingLink),
              href: derived.onboardingLink,
              tone: "ok",
            }
          : { text: "No intake link", tone: "muted" };
      case "fbConnection":
        return derived.fbConnection === "verified"
          ? { text: "Yes", tone: "ok" }
          : derived.fbConnection === "claimed"
            ? { text: "Claimed, not seen", tone: "warn" }
            : { text: "No", tone: "muted" };
      case "adsLive":
        return derived.adsLive === "live"
          ? { text: "Yes", tone: "ok" }
          : derived.adsLive === "paused"
            ? { text: "Built, paused", tone: "warn" }
            : derived.adsLive === "draft"
              ? { text: "Drafted", tone: "muted" }
              : { text: "No", tone: "muted" };
      case "cpb":
        return cpb != null
          ? { text: money(cpb), tone: "ok" }
          : {
              text: bookings ? "No spend yet" : "No bookings yet",
              tone: "muted",
            };
      default:
        return { text: "", tone: "muted" };
    }
  };

  const settingCell = (
    key: keyof PerformanceSettings,
    kind: "url" | "text" | "number",
  ): Cell => {
    if (key === "bookings") {
      if (derived.platformBookings > 0)
        return { text: String(derived.platformBookings), tone: "ok" };
      return settings?.bookings != null
        ? { text: String(settings.bookings), tone: "ok" }
        : { text: "Not set", tone: "muted" };
    }
    const value = settings?.[key];
    if (typeof value !== "string" || !value)
      return { text: "Not set", tone: "muted" };
    if (kind === "url" && /^https?:\/\//.test(value))
      return { text: host(value), href: value, tone: "ok" };
    return { text: value, tone: "ok" };
  };

  const sheet = SETTINGS_FIELDS.slice(0, 14);
  const intake = SETTINGS_FIELDS.slice(14);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5 @2xl:grid-cols-3 @5xl:grid-cols-5">
        {sheet.map((field) =>
          field.source === "derived" ? (
            <Tile
              key={field.key}
              label={field.label}
              from={field.from}
              {...derivedCell(field.key)}
            />
          ) : (
            <Tile
              key={field.key}
              label={field.label}
              from={
                field.key === "bookings" && derived.platformBookings > 0
                  ? "Meta"
                  : null
              }
              {...settingCell(field.key, field.kind)}
            />
          ),
        )}
      </div>

      <div className="space-y-2.5">
        <SectionLabel>From the intake</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5 @2xl:grid-cols-3 @5xl:grid-cols-5">
          {intake.map((field) =>
            field.source === "setting" ? (
              <Tile
                key={field.key}
                label={field.label}
                from={null}
                {...settingCell(field.key, field.kind)}
              />
            ) : null,
          )}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {settings?.updatedAt
          ? `Last set ${new Date(settings.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}${
              settings.updatedFrom === "intake"
                ? " from the intake"
                : settings.updatedBy
                  ? ` by ${settings.updatedBy}`
                  : ""
            }. `
          : ""}
        Settings change in chat.
      </p>
    </div>
  );
}

function Tile({
  label,
  from,
  text,
  href,
  tone,
}: {
  label: string;
  from: string | null;
  text: string;
  href?: string;
  tone: "ok" | "warn" | "muted";
}) {
  const body = (
    <span
      className={cn(
        "mt-1 block truncate text-[12.5px]",
        tone === "ok"
          ? "font-semibold"
          : tone === "warn"
            ? "text-amber-300"
            : "text-muted-foreground",
      )}
      title={text}
    >
      {text}
      {href ? (
        <ExternalLink className="ml-1 inline size-3 align-[-1px]" />
      ) : null}
    </span>
  );
  return (
    <div className={tile}>
      <div className="flex items-baseline justify-between gap-2">
        <SectionLabel className="text-[10px] tracking-[0.07em]">
          {label}
        </SectionLabel>
        {from ? (
          <span className="text-[9.5px] text-muted-foreground/70">{from}</span>
        ) : null}
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="hover:underline"
        >
          {body}
        </a>
      ) : (
        body
      )}
    </div>
  );
}
