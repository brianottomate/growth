import * as React from "react";
import {
  Body,
  Column,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

/**
 * Marketing listings digest — React Email rebuild of the hand-built
 * Customer.io broadcast format (reference: CIO newsletter 1551,
 * "Labor day and beyond prices (8/2)").
 *
 * Props are deliberately JSON-serializable so a composer UI or a
 * search-backed property picker can emit them without touching JSX.
 * Paragraph strings support a minimal inline markdown subset:
 * **bold** and [label](url).
 */

export type DigestProperty = {
  /** Kicker line, e.g. "SEVIERVILLE, TN" — rendered uppercase. */
  location: string;
  /** Optional guest count appended to the kicker, e.g. 12 → "· 12 GUESTS". */
  guests?: number;
  /** Card title, e.g. "Home in Sevierville". */
  title: string;
  /** Star rating shown as "★ 4.8". Omit for unrated homes. */
  rating?: number;
  /** Shows a "New" tag after the title (used instead of a rating). */
  isNew?: boolean;
  /** Pre-formatted price line, e.g. "$2,234 for 2 nights (September 5-7)". */
  priceLabel: string;
  /** Pre-formatted savings pill, e.g. "Save ~$170 booking on Wander". */
  savingsLabel?: string;
  image: { src: string; alt?: string };
  /** Deep link — property page with checkIn/checkOut/search params. */
  href: string;
};

export type FlowItem =
  | { kind: "html"; html: string }
  | { kind: "group"; index: number };

/** How a group of homes lays out: its first big and the rest compact by default. */
export type DigestLayout = "feature" | "list" | "grid";

export type DigestSection = {
  heading: string;
  layout?: DigestLayout | null;
  featured: DigestProperty;
  more: DigestProperty[];
  cta?: { label: string; href: string };
};

/**
 * Everything around the homes that belongs to the sender rather than the
 * issue. Each block is optional: a brand without a concierge line, value
 * props or a tagline simply goes without that block.
 */
export type DigestChrome = {
  /** Whose email this is: alt text and the footer's logo. */
  brandName: string;
  /** A logo above everything, for a sender without a branded hero banner. */
  headerLogoSrc?: string;
  valueProps?: { iconSrc: string; label: string }[];
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  concierge?: { avatarsSrc?: string; note: string };
  /** The icon beside the issue's theme line. */
  trendingIconSrc?: string;
  help?: {
    heading: string;
    text: string;
    avatarsSrc?: string;
    textCta?: { label: string; href: string };
    callCta?: { label: string; href: string };
  };
  footer: {
    logoSrc?: string;
    tagline?: string;
    address?: string;
    /** "{% unsubscribe_url %}" for Customer.io, the provider's placeholder otherwise. */
    unsubscribeUrl: string;
  };
};

export type ListingsDigestProps = DigestChrome & {
  previewText: string;
  hero?: { src: string; alt: string; href: string };
  /** The subject, as the email's title. */
  heading: string;
  /** Inline markdown subset: **bold**, [label](url). */
  paragraphs?: string[];
  /**
   * The body in reading order: sanitized copy and the home groups it places.
   * When it places any, the button follows it; groups it leaves out follow
   * the button.
   */
  flow?: FlowItem[];
  /** The issue's theme line above the homes. */
  trending?: { kicker: string; heading: string };
  sections: DigestSection[];
};

const colors = {
  page: "#f5f4f0",
  card: "#fffffe",
  ink: "#1a1a1a",
  body: "#3a3a3a",
  muted: "#5f5f5f",
  faint: "#a3a3a3",
  savingsText: "#306530",
  savingsBg: "#edf0ec",
  buttonSecondaryBg: "#e9e8e3",
  divider: "#ececea",
};

const fontStack =
  "'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";

const kickerStyle: React.CSSProperties = {
  fontSize: "11px",
  letterSpacing: "1px",
  textTransform: "uppercase",
  color: colors.muted,
  fontWeight: 600,
  margin: "0 0 4px",
};

/**
 * The phone layout. Most of this list is read on a phone, so the narrow
 * screen is the one the layout is tuned for: the card loses most of its
 * padding and every listed home stacks, photo over text, instead of
 * squeezing its text into a 200px column beside a 180px photo.
 *
 * It is a max-width query over the side-by-side base, the email convention,
 * because clients that ignore embedded styles (desktop Outlook, mostly) are
 * the wide ones: they keep the row, and the phone apps that read the query
 * (iOS Mail, Gmail) stack.
 */
const PHONE_CSS = `
@media only screen and (max-width: 520px) {
  .wd-body { padding: 12px 8px !important; }
  .wd-card { padding: 16px !important; }
  .wd-stack { display: block !important; width: 100% !important; padding-left: 0 !important; }
  .wd-stack-text { padding-top: 12px !important; }
  .wd-stack-img { width: 100% !important; height: auto !important; }
  .wd-grid-cell { display: block !important; width: 100% !important; padding: 0 0 16px 0 !important; }
}
`;

const pillButton = (variant: "dark" | "light"): React.CSSProperties => ({
  display: "inline-block",
  backgroundColor: variant === "dark" ? colors.ink : colors.buttonSecondaryBg,
  color: variant === "dark" ? "#ffffff" : colors.ink,
  fontSize: "15px",
  fontWeight: 600,
  textDecoration: "none",
  borderRadius: "9999px",
  padding: "12px 24px",
  // The gap to the next button, beside it or, wrapped on a phone, below it.
  margin: "0 8px 8px 0",
});

/** Renders the **bold** / [label](url) subset used by paragraph strings. */
function renderInline(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return tokens.map((token, i) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(token);
    if (bold) {
      return (
        <strong key={i} style={{ color: colors.ink }}>
          {bold[1]}
        </strong>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
    if (link) {
      return (
        <Link
          key={i}
          href={link[2]}
          style={{ color: colors.ink, textDecoration: "underline" }}
        >
          {link[1]}
        </Link>
      );
    }
    return <React.Fragment key={i}>{token}</React.Fragment>;
  });
}

function TitleLine({ property }: { property: DigestProperty }) {
  return (
    <>
      {property.title}
      {property.isNew ? " · New" : null}
      {property.rating !== undefined
        ? ` · ★ ${property.rating.toFixed(1)}`
        : null}
    </>
  );
}

function Kicker({ property }: { property: DigestProperty }) {
  return (
    <Text style={kickerStyle}>
      {property.location}
      {property.guests !== undefined ? ` · ${property.guests} GUESTS` : null}
    </Text>
  );
}

function SavingsPill({ label, small }: { label: string; small?: boolean }) {
  return (
    <Text style={{ margin: small ? "6px 0 0" : "10px 0 0" }}>
      <span
        style={{
          display: "inline-block",
          backgroundColor: colors.savingsBg,
          color: colors.savingsText,
          fontSize: small ? "12px" : "13px",
          fontWeight: 600,
          borderRadius: "8px",
          padding: small ? "4px 10px" : "6px 12px",
        }}
      >
        {label}
      </span>
    </Text>
  );
}

function FeaturedCard({ property }: { property: DigestProperty }) {
  return (
    <Section style={{ paddingTop: "12px" }}>
      <Link href={property.href}>
        <Img
          src={property.image.src}
          alt={property.image.alt ?? property.title}
          width={552}
          style={{ width: "100%", borderRadius: "12px" }}
        />
      </Link>
      <Section style={{ paddingTop: "12px" }}>
        <Kicker property={property} />
        <Link href={property.href} style={{ textDecoration: "none" }}>
          <Text
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: colors.ink,
              margin: "0 0 4px",
            }}
          >
            <TitleLine property={property} />
          </Text>
        </Link>
        <Text style={{ fontSize: "15px", color: colors.body, margin: 0 }}>
          {property.priceLabel}
        </Text>
        {property.savingsLabel ? (
          <SavingsPill label={property.savingsLabel} />
        ) : null}
      </Section>
    </Section>
  );
}

function CompactCard({
  property,
  stack = true,
}: {
  property: DigestProperty;
  /** Photo over text on a phone; a list keeps its rows side by side. */
  stack?: boolean;
}) {
  const width = stack ? 180 : 120;
  return (
    <Section style={{ paddingTop: "16px" }}>
      <Row>
        <Column
          className={stack ? "wd-stack" : undefined}
          style={{ width: `${width}px`, verticalAlign: "top" }}
        >
          <Link href={property.href}>
            <Img
              className={stack ? "wd-stack-img" : undefined}
              src={property.image.src}
              alt={property.image.alt ?? property.title}
              width={width}
              height={stack ? 120 : 84}
              style={{
                borderRadius: "12px",
                objectFit: "cover",
              }}
            />
          </Link>
        </Column>
        <Column
          className={stack ? "wd-stack wd-stack-text" : undefined}
          style={{ paddingLeft: stack ? "16px" : "12px", verticalAlign: "top" }}
        >
          <Kicker property={property} />
          <Link href={property.href} style={{ textDecoration: "none" }}>
            <Text
              style={{
                fontSize: "15px",
                fontWeight: 700,
                color: colors.ink,
                margin: "0 0 4px",
              }}
            >
              <TitleLine property={property} />
            </Text>
          </Link>
          <Text style={{ fontSize: "14px", color: colors.body, margin: 0 }}>
            {property.priceLabel}
          </Text>
          {property.savingsLabel ? (
            <SavingsPill label={property.savingsLabel} small />
          ) : null}
        </Column>
      </Row>
    </Section>
  );
}

function GridCard({ property }: { property: DigestProperty }) {
  return (
    <>
      <Link href={property.href}>
        <Img
          src={property.image.src}
          alt={property.image.alt ?? property.title}
          width={264}
          style={{ width: "100%", borderRadius: "12px" }}
        />
      </Link>
      <Kicker property={property} />
      <Link href={property.href} style={{ textDecoration: "none" }}>
        <Text
          style={{
            fontSize: "15px",
            fontWeight: 700,
            color: colors.ink,
            margin: "4px 0 2px",
          }}
        >
          <TitleLine property={property} />
        </Text>
      </Link>
      <Text style={{ fontSize: "14px", color: colors.body, margin: 0 }}>
        {property.priceLabel}
      </Text>
    </>
  );
}

/** One group of homes, in its layout. `data-group` lets a preview find it. */
function HomeGroup({
  section,
  index,
}: {
  section: DigestSection;
  index: number;
}) {
  const homes = [section.featured, ...section.more];
  const pairs = homes.reduce<DigestProperty[][]>(
    (rows, home, i) =>
      i % 2 ? (rows.at(-1)!.push(home), rows) : [...rows, [home]],
    [],
  );
  return (
    <Section data-group={index} style={{ paddingTop: "8px" }}>
      {section.heading ? (
        <Text
          style={{
            fontSize: "20px",
            fontWeight: 700,
            color: colors.ink,
            margin: "12px 0 0",
          }}
        >
          {section.heading}
        </Text>
      ) : null}
      {section.layout === "feature" ? (
        homes.map((home) => <FeaturedCard key={home.href} property={home} />)
      ) : section.layout === "list" ? (
        homes.map((home) => (
          <CompactCard key={home.href} property={home} stack={false} />
        ))
      ) : section.layout === "grid" ? (
        pairs.map((pair) => (
          <Section key={pair[0]!.href} style={{ paddingTop: "16px" }}>
            <Row>
              {pair.map((home, i) => (
                <Column
                  key={home.href}
                  className="wd-grid-cell"
                  style={{
                    width: "50%",
                    verticalAlign: "top",
                    paddingLeft: i ? "8px" : 0,
                    paddingRight: i ? 0 : "8px",
                  }}
                >
                  <GridCard property={home} />
                </Column>
              ))}
              {pair.length === 1 ? <Column style={{ width: "50%" }} /> : null}
            </Row>
          </Section>
        ))
      ) : (
        <>
          <FeaturedCard property={section.featured} />
          {section.more.map((home) => (
            <CompactCard key={home.href} property={home} />
          ))}
        </>
      )}
      {section.cta && (
        <Section style={{ paddingTop: "20px" }}>
          <Link href={section.cta.href} style={pillButton("dark")}>
            {section.cta.label} →
          </Link>
        </Section>
      )}
    </Section>
  );
}

function Divider() {
  return (
    <Section style={{ paddingTop: "24px" }}>
      <div style={{ borderTop: `1px solid ${colors.divider}` }} />
    </Section>
  );
}

export default function ListingsDigest(props: ListingsDigestProps) {
  const placed = new Set(
    (props.flow ?? []).flatMap((item) =>
      item.kind === "group" ? [item.index] : [],
    ),
  );
  const ctaBlock = (
    <>
      {props.valueProps?.length ? (
        <Section style={{ paddingTop: "4px" }}>
          <Row>
            {props.valueProps.map((valueProp) => (
              <Column key={valueProp.label} align="center">
                <Text
                  style={{
                    fontSize: "14px",
                    fontWeight: 700,
                    color: colors.ink,
                    margin: 0,
                  }}
                >
                  <Img
                    src={valueProp.iconSrc}
                    alt=""
                    width={24}
                    height={24}
                    style={{
                      display: "inline-block",
                      verticalAlign: "middle",
                      marginRight: "8px",
                    }}
                  />
                  <span style={{ verticalAlign: "middle" }}>
                    {valueProp.label}
                  </span>
                </Text>
              </Column>
            ))}
          </Row>
        </Section>
      ) : null}

      {props.primaryCta && (
        <Section style={{ paddingTop: "24px" }}>
          <Link href={props.primaryCta.href} style={pillButton("dark")}>
            {props.primaryCta.label} →
          </Link>
        </Section>
      )}
      {props.secondaryCta && (
        <Section style={{ paddingTop: "12px" }}>
          <Link href={props.secondaryCta.href} style={pillButton("light")}>
            {props.secondaryCta.label}
          </Link>
        </Section>
      )}

      {props.concierge && (
        <Section style={{ paddingTop: "16px" }}>
          <Row>
            {props.concierge.avatarsSrc && (
              <Column style={{ width: "80px" }}>
                <Img
                  src={props.concierge.avatarsSrc}
                  alt={`${props.brandName} team`}
                  width={72}
                />
              </Column>
            )}
            <Column
              style={{
                paddingLeft: props.concierge.avatarsSrc ? "8px" : 0,
              }}
            >
              <Text
                style={{ fontSize: "13px", color: colors.faint, margin: 0 }}
              >
                {props.concierge.note}
              </Text>
            </Column>
          </Row>
        </Section>
      )}
    </>
  );
  const homesBlock = (
    <>
      {props.trending && (
        <>
          <Divider />

          <Section style={{ paddingTop: "20px" }}>
            <Row>
              {props.trendingIconSrc && (
                <Column style={{ width: "42px", verticalAlign: "top" }}>
                  <Img
                    src={props.trendingIconSrc}
                    alt=""
                    width={30}
                    height={30}
                  />
                </Column>
              )}
              <Column>
                <Text style={{ ...kickerStyle, margin: "0 0 2px" }}>
                  {props.trending.kicker}
                </Text>
                <Text
                  style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    color: colors.ink,
                    margin: 0,
                  }}
                >
                  {props.trending.heading}
                </Text>
              </Column>
            </Row>
          </Section>
        </>
      )}

      {props.sections.map((section, index) =>
        placed.has(index) ? null : (
          <React.Fragment key={index}>
            <Divider />
            <HomeGroup section={section} index={index} />
          </React.Fragment>
        ),
      )}
    </>
  );

  return (
    <Html lang="en">
      <Head>
        <link
          href="https://fonts.googleapis.com/css?family=Instrument+Sans:400,500,600,700"
          rel="stylesheet"
        />
        <style>{PHONE_CSS}</style>
      </Head>
      <Preview>{props.previewText}</Preview>
      <Body
        className="wd-body"
        style={{
          backgroundColor: colors.page,
          fontFamily: fontStack,
          margin: 0,
          padding: "24px 12px",
        }}
      >
        <Container
          className="wd-card"
          style={{
            maxWidth: "600px",
            backgroundColor: colors.card,
            borderRadius: "16px",
            padding: "24px",
          }}
        >
          {props.headerLogoSrc && (
            <Img
              src={props.headerLogoSrc}
              alt={props.brandName}
              height={32}
              style={{ height: "32px", width: "auto", marginBottom: "20px" }}
            />
          )}
          {props.hero && (
            <Link href={props.hero.href}>
              <Img
                src={props.hero.src}
                alt={props.hero.alt}
                width={552}
                style={{ width: "100%", borderRadius: "12px" }}
              />
            </Link>
          )}

          <Section style={{ paddingTop: "20px" }}>
            <Text
              style={{
                fontSize: "22px",
                lineHeight: "28px",
                fontWeight: 700,
                color: colors.ink,
                margin: "0 0 12px",
              }}
            >
              {props.heading}
            </Text>
            {props.flow?.map((item, i) =>
              item.kind === "html" ? (
                <div
                  key={i}
                  style={{
                    fontSize: "15px",
                    lineHeight: "24px",
                    color: colors.body,
                  }}
                  dangerouslySetInnerHTML={{ __html: item.html }}
                />
              ) : props.sections[item.index] ? (
                <HomeGroup
                  key={i}
                  section={props.sections[item.index]!}
                  index={item.index}
                />
              ) : null,
            )}
            {props.flow
              ? null
              : (props.paragraphs ?? []).map((paragraph, i) => (
                  <Text
                    key={i}
                    style={{
                      fontSize: "15px",
                      lineHeight: "24px",
                      color: colors.body,
                      margin: "0 0 12px",
                    }}
                  >
                    {renderInline(paragraph)}
                  </Text>
                ))}
          </Section>

          {ctaBlock}
          {homesBlock}

          {props.help && (
            <>
              <Divider />

              <Section style={{ paddingTop: "20px" }}>
                <Text
                  style={{
                    fontSize: "18px",
                    fontWeight: 700,
                    color: colors.ink,
                    margin: "0 0 12px",
                  }}
                >
                  {props.help.heading}
                </Text>
                <Row>
                  {props.help.avatarsSrc && (
                    <Column style={{ width: "104px", verticalAlign: "top" }}>
                      <Img
                        src={props.help.avatarsSrc}
                        alt={`${props.brandName} team`}
                        width={96}
                      />
                    </Column>
                  )}
                  <Column
                    style={{
                      paddingLeft: props.help.avatarsSrc ? "8px" : 0,
                      verticalAlign: "top",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: "14px",
                        lineHeight: "22px",
                        color: colors.body,
                        margin: 0,
                      }}
                    >
                      {props.help.text}
                    </Text>
                  </Column>
                </Row>
                <Section style={{ paddingTop: "16px" }}>
                  {props.help.textCta && (
                    <Link
                      href={props.help.textCta.href}
                      style={pillButton("dark")}
                    >
                      {props.help.textCta.label}
                    </Link>
                  )}
                  {props.help.callCta && (
                    <Link
                      href={props.help.callCta.href}
                      style={pillButton("light")}
                    >
                      {props.help.callCta.label}
                    </Link>
                  )}
                </Section>
              </Section>
            </>
          )}

          <Divider />

          <Section style={{ paddingTop: "24px" }}>
            {props.footer.logoSrc && (
              <Img
                src={props.footer.logoSrc}
                alt={props.brandName}
                width={120}
              />
            )}
            {props.footer.tagline && (
              <Text
                style={{
                  fontSize: "13px",
                  color: colors.muted,
                  margin: "8px 0 16px",
                }}
              >
                {props.footer.tagline}
              </Text>
            )}
            {props.footer.address && (
              <Text
                style={{ fontSize: "11px", color: colors.faint, margin: 0 }}
              >
                {props.footer.address}
              </Text>
            )}
            <Text style={{ fontSize: "11px", margin: "4px 0 0" }}>
              <Link
                href={props.footer.unsubscribeUrl}
                style={{ color: colors.faint, textDecoration: "underline" }}
              >
                Unsubscribe
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const cioAsset = (id: string) =>
  `https://userimg-assets.customeriomail.com/images/client-env-142511/${id}`;

/**
 * Real content of CIO newsletter 1551 ("Labor day and beyond prices (8/2)")
 * so the react-email preview matches the email Kyle actually sent.
 * Note: tier badges and the hero headline are baked into these images.
 */
/** Sample chrome for the template's own preview (CIO newsletter 1551). */
const SAMPLE_CHROME = {
  brandName: "Wander",
  valueProps: [
    {
      iconSrc: cioAsset("01KYQRV2KKD3CA8BMAH0ZPGECA.png"),
      label: "Best homes",
    },
    {
      iconSrc: cioAsset("01KYQS88F0XSPRMQ7RV9DE4592.png"),
      label: "24/7 service",
    },
    {
      iconSrc: cioAsset("01KZ1PY8AT3CYQF5HTYJKZKGSP.png"),
      label: "Great prices",
    },
  ],
  primaryCta: {
    label: "Explore your next adventure",
    href: "https://www.wander.com/",
  },
  secondaryCta: {
    label: "Text with your Concierge",
    href: "sms:+14157993400?body=Hello!%20I'm%20interested%20in%20potentially%20booking%20a%20trip.%20Can%20you%20help%3F",
  },
  concierge: {
    avatarsSrc: cioAsset("01KYR02DY9B3C1X848ZJ2GRR6P.png"),
    note: "Responses in 3 mins • Available 24/7",
  },
  help: {
    heading: "Need help? We're here for you.",
    text: "Your Personal Concierge is available to help you think through options and make your reservation.",
    avatarsSrc: cioAsset("01KYR02DY9B3C1X848ZJ2GRR6P.png"),
    textCta: {
      label: "Text with your Concierge",
      href: "sms:+14157993400?body=Hello!%20I'm%20interested%20in%20potentially%20booking%20a%20trip.%20Can%20you%20help%3F",
    },
    callCta: { label: "Call your Concierge", href: "tel:+14157993400" },
  },
  footer: {
    logoSrc: cioAsset("01KXNRPZDGBB5VWW26X4VP4NBA.png"),
    tagline: "Find your happy place ®",
    address:
      "Wander.com, Inc. · 200 Academy Drive, Suite 200 · Austin, TX 78704",
    unsubscribeUrl: "{% unsubscribe_url %}",
  },
  trendingIconSrc: cioAsset("01KYQVY92DAZ950150HGJ8BX1Z.png"),
} satisfies DigestChrome;

ListingsDigest.PreviewProps = {
  ...SAMPLE_CHROME,
  previewText: "👀 Must-see prices for Labor Day and beyond...",
  hero: {
    src: cioAsset("01KZ1M6KDQNN9665KGD2GFBKX7.jpg"),
    alt: "Labor day weekend vibes, great prices",
    href: "https://www.wander.com",
  },
  heading: "Must-see prices for Labor Day and beyond",
  paragraphs: [
    "👋 Hi there,",
    "**ICYMI, we lowered rates at every single [Wander](https://www.wander.com) last week.** Now is the perfect time to snag that end of summer trip for Labor Day weekend or plan ahead for even lower fall rates or lock down your holiday plans.",
    "**Not sure where to go?** Your Personal Concierge is just a text or call away to help you with trip planning, questions or making a reservation.",
  ],
  trending: {
    kicker: "Trending right now",
    heading: "Labor day destinations at lower rates",
  },
  sections: [
    {
      heading: "Smoky mountain majesty",
      featured: {
        location: "Sevierville, TN",
        guests: 12,
        title: "Home in Sevierville",
        isNew: true,
        priceLabel: "$2,234 for 2 nights (September 5-7)",
        savingsLabel: "Save ~$170 booking on Wander",
        image: { src: cioAsset("01KZ1NRXJHM1G4Y3AVYBJK901T.jpg") },
        href: "https://www.wander.com/property/wander-clabo-mountain?boundaries=-84.20714518946765,35.36739763429215,-82.90414480487628,36.45937837759895&priceMax=160000&tiers=LUXURY,ICONIC&page=1&checkIn=2026-09-05&searchId=dde6ddaf-6bbc-5a38-b266-f9f188f6557d&checkOut=2026-09-07",
      },
      more: [
        {
          location: "Sevierville, TN",
          guests: 24,
          title: "Home in Sevierville",
          rating: 5.0,
          priceLabel: "$3,276 for 2 nights (September 5-7)",
          savingsLabel: "Save ~$250",
          image: { src: cioAsset("01KZ1NX5PB7FXEDFCE2STA8Q9T.jpg") },
          href: "https://www.wander.com/property/wander-smoky-heights?boundaries=-84.20714518946765%2C35.36739763429215%2C-82.90414480487628%2C36.45937837759895&priceMax=160000&tiers=LUXURY%2CICONIC&page=1&checkIn=2026-09-07&checkOut=2026-09-09&searchId=dde6ddaf-6bbc-5a38-b266-f9f188f6557d",
        },
        {
          location: "Mineral Bluff, Georgia",
          title: "Home in Mineral Bluff",
          rating: 4.8,
          priceLabel: "$1,675 for 2 nights (September 5-7)",
          savingsLabel: "Save ~$130",
          image: { src: cioAsset("01KZ1P3BDF765GRJD30FQZAQ46.jpg") },
          href: "https://www.wander.com/property/modern-mountain-view-luxe-glass-frame-cabin-675050242483161325?boundaries=-84.84069612565817,34.45406052426571,-83.71074079353696,35.3734534391359&priceMax=160000&tiers=LUXURY,ICONIC&page=1&checkIn=2026-09-07&searchId=fcad5a8f-9620-500c-9795-1343d290a7a2&checkOut=2026-09-09",
        },
      ],
      cta: {
        label: "Explore the smoky mountains",
        href: "https://www.wander.com/s?location=Smoky+Mountains&boundaries=-83.8628944455722%2C35.449729729729725%2C-83.19710555442781%2C35.99027027027027&locationType=city&country=US&copy=Smoky+Mountains%2C+Tennessee+%26+North+Carolina&tiers=LUXURY%2CICONIC",
      },
    },
    {
      heading: "Southern California dreaming",
      featured: {
        location: "San Bernardino, CA",
        guests: 6,
        title: "Home in Big Bear",
        rating: 4.6,
        priceLabel: "$1,352 for 2 nights (September 5-7)",
        savingsLabel: "Save ~$100 booking on Wander",
        image: { src: cioAsset("01KZ1R17NKEVXP6HCMAGQB6C99.jpg") },
        href: "https://www.wander.com/property/wander-big-bear-lake?boundaries=-117.50721699273988,33.77438960652879,-116.29758805870583,34.71526945117867&priceMax=200000&tiers=LUXURY,ICONIC&page=1&checkIn=2026-09-05&searchId=24da5d6f-89c2-5525-b39a-472ce624b002&checkOut=2026-09-07",
      },
      more: [
        {
          location: "Palomar Mountain, CA",
          guests: 8,
          title: "Home in Palomar",
          rating: 4.8,
          priceLabel: "$2,393 for 2 nights (September 5-7)",
          savingsLabel: "Save ~$190",
          image: { src: cioAsset("01KZ1Q688REXYC1SHZFZFB84N8.jpg") },
          href: "https://www.wander.com/property/wander-palomar-mountain?boundaries=-120.71490591101869,31.982117985761036,-116.54296429606183,35.811232463919936&priceMax=160000&tiers=LUXURY,ICONIC&page=1&searchId=30991b1c-cb8c-5bd1-8dd0-4d1fe29ef16f&checkIn=2026-09-05&checkOut=2026-09-07",
        },
        {
          location: "Encinitas, CA",
          guests: 9,
          title: "Home in Encinitas",
          rating: 4.7,
          priceLabel: "$4,411 for 3 nights (September 9-12)",
          savingsLabel: "Save ~$350",
          image: { src: cioAsset("01KZ1QPZM15X6V28TZMT1GCXV4.jpg") },
          href: "https://www.wander.com/property/wander-encinitas-coast?boundaries=-118.11476476261797,32.65467671323688,-116.84609954222339,33.83404672382484&priceMax=200000&tiers=LUXURY,ICONIC&page=1&checkIn=2026-09-09&searchId=e8d14d75-8855-53b4-9006-1a13eccb2259&checkOut=2026-09-12",
        },
      ],
      cta: {
        label: "Visit Southern California",
        href: "https://www.wander.com/s?location=Southern+California&boundaries=-121.4381759185545%2C32.52950806725737%2C-114.1312110028529%2C35.80923606255937&locationType=city&country=US&state=california&copy=Southern+California%2C+California&tiers=LUXURY%2CICONIC",
      },
    },
    {
      heading: "Red rocks in Southern Utah",
      featured: {
        location: "St. George, UT",
        guests: 26,
        title: "Home in St. George",
        rating: 4.9,
        priceLabel: "$2,091 for 2 nights (September 3-5)",
        savingsLabel: "Save ~$160 booking on Wander",
        image: { src: cioAsset("01KZ1RMCNTMF3V0W0Y2VR7RQ8A.jpg") },
        href: "https://www.wander.com/property/wander-st-george-vista?boundaries=-114.10615687094794,36.46007602126494,-111.86425845878493,38.42101289784324&priceMax=200000&tiers=LUXURY,ICONIC&page=1&searchId=1b08a6ca-aeba-5b28-a66d-848f96a524eb&checkIn=2026-09-03&checkOut=2026-09-05",
      },
      more: [
        {
          location: "Ivins, UT",
          guests: 6,
          title: "Home in Ivins",
          rating: 4.9,
          priceLabel: "$3,450 for 2 nights (August 7-9)",
          savingsLabel: "Save ~$270",
          image: { src: cioAsset("01KZ1RY5XFPNSKJVA1V9JH2E2A.jpg") },
          href: "https://www.wander.com/property/wander-ivins-canyon?boundaries=-114.10615687094794,36.46007602126494,-111.86425845878493,38.42101289784324&priceMax=200000&tiers=LUXURY,ICONIC&page=1&searchId=1b08a6ca-aeba-5b28-a66d-848f96a524eb&checkIn=2026-08-07&checkOut=2026-08-10",
        },
        {
          location: "Hurricane, UT",
          guests: 14,
          title: "Home in Hurricane",
          rating: 5.0,
          priceLabel: "$4,948 for 2 nights (August 14-16)",
          savingsLabel: "Save ~$395",
          image: { src: cioAsset("01KZ1SAF32YB62BGJHD4EPSC5D.jpg") },
          href: "https://www.wander.com/property/wander-hurricane-cliffs?boundaries=-114.10615687094794,36.46007602126494,-111.86425845878493,38.42101289784324&priceMax=200000&tiers=LUXURY,ICONIC&page=1&checkIn=2026-08-14&searchId=1b08a6ca-aeba-5b28-a66d-848f96a524eb&checkOut=2026-08-16",
        },
      ],
      cta: {
        label: "Escape to Southern Utah",
        href: "https://www.wander.com/s?boundaries=-114.09429609161542%2C36.94497419467372%2C-110.50168775918446%2C40.29562530869154&page=1",
      },
    },
  ],
} satisfies ListingsDigestProps;
