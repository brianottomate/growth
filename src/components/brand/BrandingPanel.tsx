import type { BrandingProfile } from "@mendable/firecrawl-js";

import type { BrandIdentity } from "@/server/db/brand-schema";

/**
 * What Firecrawl read off the brand's site, rendered the way its own panel
 * does so the operator can check it against the real thing. Reads the raw
 * profile when the brand has one; falls back to the normalised identity.
 */
export function BrandingPanel({
  identity,
  logo,
  compact = false,
}: {
  identity: BrandIdentity | null;
  /** The brand row's logo, shown when the profile has none. */
  logo: string | null;
  compact?: boolean;
}) {
  const raw = identity?.raw;
  const colors = Object.entries(raw?.colors ?? identity?.colors ?? {}).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1].length > 0,
  );
  // Heading first, matching the Studio pickers.
  const fonts = [...(identity?.fonts ?? [])].sort(
    (a, b) => Number(b.role === "heading") - Number(a.role === "heading"),
  );
  const sizes = Object.entries(raw?.typography?.fontSizes ?? {}).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  const images = {
    logo: raw?.images?.logo ?? raw?.logo ?? identity?.logo ?? logo,
    favicon: raw?.images?.favicon ?? identity?.favicon ?? null,
    ogImage: raw?.images?.ogImage ?? null,
  };
  const buttons = raw?.components;
  const text = compact ? "text-[11px]" : "text-xs";

  return (
    <div className={`space-y-3 ${text}`}>
      <Row label="Theme">
        <span className="rounded-md border px-2 py-0.5 capitalize">
          {raw?.colorScheme ?? identity?.colorScheme ?? "unknown"}
        </span>
      </Row>

      <div className={`grid gap-2 ${compact ? "grid-cols-3" : "grid-cols-3"}`}>
        <ImageCell label="Logo" src={images.logo} />
        <ImageCell label="Favicon" src={images.favicon} />
        <ImageCell label="OG image" src={images.ogImage} cover />
      </div>

      {buttons?.buttonPrimary || buttons?.buttonSecondary ? (
        <Row label="Buttons">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["Primary", buttons.buttonPrimary],
                ["Secondary", buttons.buttonSecondary],
              ] as const
            ).map(([name, button]) =>
              button ? (
                <span
                  key={name}
                  className="px-3 py-1 font-medium"
                  style={{
                    background: button.background,
                    color: button.textColor,
                    border: button.borderColor
                      ? `1px solid ${button.borderColor}`
                      : undefined,
                    borderRadius: sanitiseRadius(button.borderRadius),
                  }}
                >
                  {name}
                </span>
              ) : null,
            )}
          </div>
        </Row>
      ) : null}

      <Row label="Colors">
        {colors.length === 0 ? (
          <span className="text-muted-foreground">None found on the site.</span>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {colors.map(([name, value]) => (
              <span key={name} className="flex items-center gap-1.5">
                <span
                  className="size-3 shrink-0 rounded-sm border"
                  style={{ background: value }}
                />
                <span className="text-muted-foreground capitalize">
                  {humanise(name)}
                </span>
                <span className="font-mono">{value}</span>
              </span>
            ))}
          </div>
        )}
      </Row>

      {fonts.length > 0 && (
        <Row label="Fonts">
          <div className="flex flex-col gap-0.5">
            {fonts.map((font) => (
              <span key={`${font.family}-${font.role ?? ""}`}>
                <span className="font-medium">{font.family}</span>
                {font.role ? (
                  <span className="text-muted-foreground"> ({font.role})</span>
                ) : null}
              </span>
            ))}
          </div>
        </Row>
      )}

      {sizes.length > 0 && (
        <Row label="Type sizes">
          <span className="font-mono text-muted-foreground">
            {sizes.map(([k, v]) => `${k} ${v}`).join(" · ")}
          </span>
        </Row>
      )}

      {raw?.spacing && (raw.spacing.baseUnit || raw.spacing.borderRadius) ? (
        <Row label="Spacing">
          <span className="font-mono text-muted-foreground">
            {[
              raw.spacing.baseUnit ? `base ${raw.spacing.baseUnit}` : null,
              raw.spacing.borderRadius
                ? `radius ${sanitiseRadius(raw.spacing.borderRadius)}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </Row>
      ) : null}

      {identity?.personality && (
        <Row label="Personality">
          <span>
            <span className="capitalize">{identity.personality.tone}</span>
            {" · "}
            <span className="capitalize">
              {identity.personality.energy}
            </span>{" "}
            energy
            {" · "}
            {identity.personality.targetAudience}
          </span>
        </Row>
      )}

      {!compact && raw?.confidence ? (
        <Row label="Confidence">
          <span className="font-mono text-muted-foreground">
            {Object.entries(raw.confidence as Record<string, number>)
              .map(([k, v]) => `${k} ${Math.round(v * 100)}%`)
              .join(" · ")}
          </span>
        </Row>
      ) : null}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-2">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ImageCell({
  label,
  src,
  cover = false,
}: {
  label: string;
  src: string | null | undefined;
  cover?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="border-b px-2 py-1 text-muted-foreground">{label}</div>
      <div className="flex h-16 items-center justify-center bg-white p-2">
        {src ? (
          // oxlint-disable-next-line nextjs/no-img-element
          <img
            src={src}
            alt=""
            className={
              cover
                ? "h-full w-full rounded-sm object-cover"
                : "max-h-full max-w-full object-contain"
            }
          />
        ) : (
          <span className="text-muted-foreground">none</span>
        )}
      </div>
    </div>
  );
}

/** Firecrawl reports pill radii as absurd px values; show them as pills. */
function sanitiseRadius(value: string | undefined) {
  if (!value) return undefined;
  const px = Number.parseFloat(value);
  return Number.isFinite(px) && px > 200 ? "999px" : value;
}

function humanise(key: string) {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}
