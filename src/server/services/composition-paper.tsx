/* oxlint-disable nextjs/no-img-element -- image elements are rendered by Satori */
import type { ReactNode } from "react";
import type { CompositionSpec } from "@/lib/compositions";

/** A photo essay keeps the image continuous and moves the caption, not the brand. */
export function PaperComposition({
  spec,
  source,
  width,
  height,
  imagePosition,
  brandMark,
  headingWeight,
  bodyFamily,
}: {
  spec: CompositionSpec;
  source: string;
  width: number;
  height: number;
  imagePosition: string;
  brandMark: ReactNode;
  headingWeight?: number | null;
  bodyFamily?: string | null;
}) {
  const unit = Math.min(width / 1080, height / 1100);
  const px = (value: number) => Math.round(value * unit);
  const placement = spec.paperPlacement ?? "lower-left";
  const cover = placement === "cover";
  const footer = placement === "footer";
  const wide = width > height;
  const top = spec.formatId === "story" ? Math.round(height * 0.15) : px(48);
  const bottom = spec.formatId === "story" ? Math.round(height * 0.16) : px(52);
  const captionBody = bodyFamily ? { fontFamily: bodyFamily } : {};
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width,
        height,
        background: "#171918",
        color: "#ffffff",
      }}
    >
      <img
        src={source}
        alt=""
        width={width}
        height={height}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width,
          height,
          objectFit: "cover",
          objectPosition: imagePosition,
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 0,
          top: 0,
          width,
          height,
          background: cover
            ? "linear-gradient(180deg, rgba(0,0,0,0.25), transparent 35%, rgba(0,0,0,0.08) 45%, rgba(0,0,0,0.75) 100%)"
            : "linear-gradient(180deg, rgba(0,0,0,0.25), transparent 25%)",
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          top,
          left: px(48),
          right: px(48),
        }}
      >
        {brandMark}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          ...(cover
            ? { left: px(48), right: px(48), bottom }
            : footer
              ? {
                  left: 0,
                  right: 0,
                  bottom: spec.formatId === "story" ? bottom : 0,
                }
              : placement === "upper-right"
                ? { right: px(48), top: top + px(110) }
                : placement === "lower-right"
                  ? { right: px(48), bottom }
                  : { left: px(48), bottom }),
          ...(!cover
            ? {
                background: "#f2eee5",
                color: "#22241f",
                padding: px(38),
                width: footer
                  ? width
                  : Math.round(width * (wide ? 0.46 : 0.65)),
              }
            : {}),
        }}
      >
        {spec.eyebrow && (
          <div
            style={{
              display: "flex",
              ...captionBody,
              fontSize: px(19),
              letterSpacing: "0.12em",
              lineHeight: 1.3,
              marginBottom: px(20),
            }}
          >
            {spec.eyebrow}
          </div>
        )}
        <div
          style={{
            display: "flex",
            fontWeight: headingWeight ?? 600,
            fontSize: px(cover ? 104 : 70),
            lineHeight: 1.06,
            letterSpacing:
              headingWeight && headingWeight < 600 ? "0" : "-0.025em",
            maxWidth: cover ? "85%" : "100%",
          }}
        >
          {spec.title}
        </div>
        {spec.subtitle && (
          <div
            style={{
              display: "flex",
              ...captionBody,
              fontSize: px(28),
              lineHeight: 1.35,
              marginTop: px(22),
              maxWidth: "94%",
            }}
          >
            {spec.subtitle}
          </div>
        )}
        {spec.cta && (
          <div
            style={{
              display: "flex",
              ...captionBody,
              marginTop: px(30),
              paddingTop: px(22),
              borderTop: cover
                ? "1px solid rgba(255,255,255,0.4)"
                : "1px solid #cec8bc",
              fontSize: px(23),
              lineHeight: 1.3,
            }}
          >
            {spec.cta}
          </div>
        )}
      </div>
    </div>
  );
}
