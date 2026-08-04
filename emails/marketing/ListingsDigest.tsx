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

export type DigestSection = {
  heading: string;
  featured: DigestProperty;
  more: DigestProperty[];
  cta: { label: string; href: string };
};

export type ListingsDigestProps = {
  previewText: string;
  hero: { src: string; alt: string; href: string };
  greeting: string;
  /** Inline markdown subset: **bold**, [label](url). */
  paragraphs: string[];
  valueProps: { iconSrc: string; label: string }[];
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
  concierge: { avatarsSrc: string; note: string };
  trending: { iconSrc: string; kicker: string; heading: string };
  sections: DigestSection[];
  help: {
    heading: string;
    text: string;
    avatarsSrc: string;
    textCta: { label: string; href: string };
    callCta: { label: string; href: string };
  };
  footer: {
    logoSrc: string;
    tagline: string;
    address: string;
    /** Keep "{% unsubscribe_url %}" for Customer.io-executed sends. */
    unsubscribeUrl: string;
  };
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

const pillButton = (variant: "dark" | "light"): React.CSSProperties => ({
  display: "inline-block",
  backgroundColor: variant === "dark" ? colors.ink : colors.buttonSecondaryBg,
  color: variant === "dark" ? "#ffffff" : colors.ink,
  fontSize: "15px",
  fontWeight: 600,
  textDecoration: "none",
  borderRadius: "9999px",
  padding: "12px 24px",
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
      {property.rating !== undefined ? ` · ★ ${property.rating.toFixed(1)}` : null}
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

function SavingsPill({
  label,
  small,
}: {
  label: string;
  small?: boolean;
}) {
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

function CompactCard({ property }: { property: DigestProperty }) {
  return (
    <Section style={{ paddingTop: "16px" }}>
      <Row>
        <Column style={{ width: "180px", verticalAlign: "top" }}>
          <Link href={property.href}>
            <Img
              src={property.image.src}
              alt={property.image.alt ?? property.title}
              width={180}
              height={120}
              style={{
                borderRadius: "12px",
                objectFit: "cover",
              }}
            />
          </Link>
        </Column>
        <Column style={{ paddingLeft: "16px", verticalAlign: "top" }}>
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

function Divider() {
  return (
    <Section style={{ paddingTop: "24px" }}>
      <div style={{ borderTop: `1px solid ${colors.divider}` }} />
    </Section>
  );
}

export default function ListingsDigest(props: ListingsDigestProps) {
  return (
    <Html lang="en">
      <Head>
        <link
          href="https://fonts.googleapis.com/css?family=Instrument+Sans:400,500,600,700"
          rel="stylesheet"
        />
      </Head>
      <Preview>{props.previewText}</Preview>
      <Body
        style={{
          backgroundColor: colors.page,
          fontFamily: fontStack,
          margin: 0,
          padding: "24px 12px",
        }}
      >
        <Container
          style={{
            maxWidth: "600px",
            backgroundColor: colors.card,
            borderRadius: "16px",
            padding: "24px",
          }}
        >
          <Link href={props.hero.href}>
            <Img
              src={props.hero.src}
              alt={props.hero.alt}
              width={552}
              style={{ width: "100%", borderRadius: "12px" }}
            />
          </Link>

          <Section style={{ paddingTop: "20px" }}>
            <Text
              style={{ fontSize: "15px", color: colors.ink, margin: "0 0 12px" }}
            >
              {props.greeting}
            </Text>
            {props.paragraphs.map((paragraph, i) => (
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

          <Section style={{ paddingTop: "24px" }}>
            <Link href={props.primaryCta.href} style={pillButton("dark")}>
              {props.primaryCta.label} →
            </Link>
          </Section>
          <Section style={{ paddingTop: "12px" }}>
            <Link href={props.secondaryCta.href} style={pillButton("light")}>
              {props.secondaryCta.label}
            </Link>
          </Section>

          <Section style={{ paddingTop: "16px" }}>
            <Row>
              <Column style={{ width: "80px" }}>
                <Img
                  src={props.concierge.avatarsSrc}
                  alt="Wander Concierge Team"
                  width={72}
                />
              </Column>
              <Column style={{ paddingLeft: "8px" }}>
                <Text
                  style={{ fontSize: "13px", color: colors.faint, margin: 0 }}
                >
                  {props.concierge.note}
                </Text>
              </Column>
            </Row>
          </Section>

          <Divider />

          <Section style={{ paddingTop: "20px" }}>
            <Row>
              <Column style={{ width: "42px", verticalAlign: "top" }}>
                <Img
                  src={props.trending.iconSrc}
                  alt=""
                  width={30}
                  height={30}
                />
              </Column>
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

          {props.sections.map((section) => (
            <React.Fragment key={section.heading}>
              <Divider />
              <Section style={{ paddingTop: "20px" }}>
                <Text
                  style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    color: colors.ink,
                    margin: 0,
                  }}
                >
                  {section.heading}
                </Text>
              </Section>
              <FeaturedCard property={section.featured} />
              {section.more.map((property) => (
                <CompactCard key={property.href} property={property} />
              ))}
              <Section style={{ paddingTop: "20px" }}>
                <Link href={section.cta.href} style={pillButton("dark")}>
                  {section.cta.label} →
                </Link>
              </Section>
            </React.Fragment>
          ))}

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
              <Column style={{ width: "104px", verticalAlign: "top" }}>
                <Img
                  src={props.help.avatarsSrc}
                  alt="Wander Concierge Team"
                  width={96}
                />
              </Column>
              <Column style={{ paddingLeft: "8px", verticalAlign: "top" }}>
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
              <Link href={props.help.textCta.href} style={pillButton("dark")}>
                {props.help.textCta.label}
              </Link>
              <span style={{ display: "inline-block", width: "12px" }} />
              <Link href={props.help.callCta.href} style={pillButton("light")}>
                {props.help.callCta.label}
              </Link>
            </Section>
          </Section>

          <Divider />

          <Section style={{ paddingTop: "24px" }}>
            <Img src={props.footer.logoSrc} alt="Wander" width={120} />
            <Text
              style={{
                fontSize: "13px",
                color: colors.muted,
                margin: "8px 0 16px",
              }}
            >
              {props.footer.tagline}
            </Text>
            <Text style={{ fontSize: "11px", color: colors.faint, margin: 0 }}>
              {props.footer.address}
            </Text>
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
ListingsDigest.PreviewProps = {
  previewText: "👀 Must-see prices for Labor Day and beyond...",
  hero: {
    src: cioAsset("01KZ1M6KDQNN9665KGD2GFBKX7.jpg"),
    alt: "Labor day weekend vibes, great prices",
    href: "https://www.wander.com",
  },
  greeting: "👋 Hi there,",
  paragraphs: [
    "**ICYMI, we lowered rates at every single [Wander](https://www.wander.com) last week.** Now is the perfect time to snag that end of summer trip for Labor Day weekend or plan ahead for even lower fall rates or lock down your holiday plans.",
    "**Not sure where to go?** Your Personal Concierge is just a text or call away to help you with trip planning, questions or making a reservation.",
  ],
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
  trending: {
    iconSrc: cioAsset("01KYQVY92DAZ950150HGJ8BX1Z.png"),
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
    address: "Wander.com, Inc. · 200 Academy Drive, Suite 200 · Austin, TX 78704",
    unsubscribeUrl: "{% unsubscribe_url %}",
  },
} satisfies ListingsDigestProps;
