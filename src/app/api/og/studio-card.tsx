import type { OgOptions } from "@/lib/og-studio";

export function StudioCard({
  options,
  photo,
}: {
  options: OgOptions;
  photo?: string;
}) {
  const square = options.format === "square";
  const split = options.layout === "split" && Boolean(photo);
  const editorial = options.layout === "editorial" && Boolean(photo);
  const centered = options.layout === "centered";
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#0A0A0A",
        color: "#FFFFFF",
        position: "relative",
        fontFamily: "sans-serif",
      }}
    >
      {photo && (split || editorial) ? (
        <img
          alt=""
          src={photo}
          width={split ? 510 : 1200}
          height={square ? 1200 : 630}
          style={{ position: "absolute", right: 0, top: 0, objectFit: "cover" }}
        />
      ) : null}
      {editorial ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background:
              "linear-gradient(0deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.65) 60%, rgba(0,0,0,0.25) 100%)",
          }}
        />
      ) : null}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "relative",
          width: split ? 690 : 1200,
          height: "100%",
          padding: square ? "88px 72px" : "64px 72px",
          alignItems: centered ? "center" : "flex-start",
          textAlign: centered ? "center" : "left",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 28,
            letterSpacing: 6,
            fontWeight: 700,
          }}
        >
          WANDER{" "}
          <span style={{ color: "#C9A86A", letterSpacing: 1, marginLeft: 18 }}>
            Growth
          </span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: editorial ? "flex-end" : "center",
            paddingBottom: editorial ? 32 : 0,
            width: "100%",
          }}
        >
          {options.eyebrow ? (
            <div
              style={{
                fontSize: 20,
                color: "#C9A86A",
                letterSpacing: 4,
                textTransform: "uppercase",
                marginBottom: 22,
              }}
            >
              {options.eyebrow}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              fontSize: split
                ? square
                  ? 60
                  : options.title.length > 48
                    ? 42
                    : 56
                : square
                  ? 88
                  : options.title.length > 60
                    ? 60
                    : 76,
              flexShrink: 0,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: -2,
            }}
          >
            {options.title}
          </div>
          {options.description ? (
            <div
              style={{
                display: "flex",
                fontSize: split ? 22 : 28,
                flexShrink: 0,
                lineHeight: 1.4,
                color: "rgba(255,255,255,0.78)",
                marginTop: 20,
              }}
            >
              {options.description}
            </div>
          ) : null}
        </div>
        <div
          style={{
            display: "flex",
            borderTop: "2px solid #C9A86A",
            paddingTop: 18,
            fontSize: 20,
            color: "rgba(255,255,255,0.7)",
          }}
        >
          {options.footer}
        </div>
      </div>
    </div>
  );
}
