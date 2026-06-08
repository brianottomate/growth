/**
 * Branded OG card for Wander Growth.
 *
 * Wander's design system is a disciplined monochrome palette (true black,
 * white, dark neutral); this card leans into that editorial, luxury-travel
 * feel — a deep black field, a tracked WANDER wordmark, and a single champagne
 * accent for the eyebrow + hairline. Shared by `/api/og` and `/api/og/blog`.
 *
 * Note: rendered at the edge via `next/og` (Satori), which can't read the
 * design-system CSS variables, so the palette is mirrored here as literals.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;

const GOLD = "#C9A86A";
const WHITE = "#FFFFFF";
const MUTED = "rgba(255,255,255,0.62)";

function clamp(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;
}

export function OgCard({
  title,
  eyebrow,
  description,
  footer = "Internal · Wander growth team",
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  footer?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "72px 80px",
        background: "linear-gradient(145deg, #0A0A0A 0%, #000000 100%)",
        fontFamily: "system-ui, sans-serif",
        position: "relative",
      }}
    >
      {/* warm vignette in the corner for depth */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 80% 14%, rgba(201,168,106,0.14) 0%, transparent 46%)",
        }}
      />

      {/* wordmark */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <span
          style={{
            fontSize: "30px",
            fontWeight: 700,
            color: WHITE,
            letterSpacing: "7px",
          }}
        >
          WANDER
        </span>
        <span style={{ fontSize: "30px", color: GOLD, letterSpacing: "1px" }}>
          Growth
        </span>
      </div>

      {/* title block */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
        }}
      >
        {eyebrow ? (
          <span
            style={{
              fontSize: "22px",
              color: GOLD,
              letterSpacing: "5px",
              textTransform: "uppercase",
              marginBottom: "22px",
            }}
          >
            {clamp(eyebrow, 28)}
          </span>
        ) : null}
        <h1
          style={{
            fontSize: "76px",
            fontWeight: 600,
            color: WHITE,
            lineHeight: 1.04,
            letterSpacing: "-2px",
            margin: 0,
            maxWidth: "960px",
          }}
        >
          {clamp(title, 80)}
        </h1>
        {description ? (
          <p
            style={{
              fontSize: "28px",
              color: MUTED,
              lineHeight: 1.4,
              marginTop: "28px",
              maxWidth: "880px",
            }}
          >
            {clamp(description, 140)}
          </p>
        ) : null}
      </div>

      {/* hairline footer */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ height: "2px", width: "72px", background: GOLD }} />
        <span
          style={{
            marginLeft: "20px",
            fontSize: "20px",
            color: MUTED,
            letterSpacing: "1px",
          }}
        >
          {clamp(footer, 60)}
        </span>
      </div>
    </div>
  );
}
