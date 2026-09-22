// A brand's homes as a Meta "Hotels and rentals" catalog feed. Client-safe:
// the ad-previews page counts and describes rows in the browser, and the
// export route writes the same rows to a file.
//
// Catalog exports enrich address fields from the warehouse before freezing.

export type HotelFeedHome = {
  streetAddress?: string | null;
  streetAddress2?: string | null;
  streetAddress3?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;

  id: string;
  name: string;
  url: string;
  imageUrl?: string | null;
  city?: string | null;
  /** Two-letter state code, e.g. "CO". */
  state?: string | null;
  /** ISO-3166 alpha-2, e.g. "US". */
  country?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  guests?: number | null;
  /** Cheapest nightly rate in whole dollars. */
  nightlyFrom?: number | null;
};

export type HotelFeedRow = {
  streetAddress?: string | null;
  streetAddress2?: string | null;
  streetAddress3?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;

  id: string;
  brand: string;
  description: string;
  title: string;
  link: string;
  imageUrl: string;
  city: string;
  region: string;
  country: string;
  /** "1234.00 USD", or empty when the feed quoted no rate. */
  price: string;
  /** Bedrooms and guests ride along as custom fields so product sets can filter on them. */
  bedrooms: number | null;
  guests: number | null;
};

/** Meta's hotel template header, with the image columns the template omits but the ads need. */
export const HOTEL_FEED_COLUMNS = [
  "id",
  "brand",
  "description",
  "title",
  "link",
  "image[0].url",
  "image[0].tag[0]",
  "address.addr1",
  "address.city",
  "address.region",
  "address.country",
  "latitude",
  "longitude",
  "neighborhood[0]",
  "custom_label_0",
  "custom_label_1",
  "custom_number_0",
  "custom_number_1",
  "price",
  "hotel_category",
] as const;

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  MX: "Mexico",
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** A plain-text description written from the listing facts and nothing else. */
export function hotelFeedDescription(home: HotelFeedHome): string {
  const where = [home.city, home.state].filter(Boolean).join(", ");
  const facts = [
    home.bedrooms ? plural(home.bedrooms, "bedroom", "bedrooms") : null,
    home.bathrooms ? plural(home.bathrooms, "bath", "baths") : null,
    home.guests ? `sleeps ${home.guests}` : null,
  ].filter((part): part is string => Boolean(part));
  const parts = [
    `${home.name}${where ? ` in ${where}` : ""}.`,
    facts.length > 0 ? `${facts.join(", ")}.` : null,
    home.nightlyFrom
      ? `From $${home.nightlyFrom.toLocaleString("en-US")} a night.`
      : null,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" ").replace(/^(\w)/, (c) => c.toUpperCase());
}

/**
 * Feed rows for the homes that can be in a catalog: a listing needs a photo
 * to be a card. Homes without one are reported by the caller, not dropped
 * silently.
 */
export function hotelFeedRows(
  homes: HotelFeedHome[],
  brandName: string,
): HotelFeedRow[] {
  return homes.flatMap((home) => {
    if (!home.imageUrl) return [];
    return [
      {
        id: home.id,
        brand: brandName,
        description: hotelFeedDescription(home),
        title: home.name,
        link: home.url,
        imageUrl: home.imageUrl,
        streetAddress: home.streetAddress,
        streetAddress2: home.streetAddress2,
        streetAddress3: home.streetAddress3,
        postalCode: home.postalCode,
        latitude: home.latitude,
        longitude: home.longitude,
        city: home.city ?? "",
        region: home.state ?? "",
        country: home.country
          ? (COUNTRY_NAMES[home.country] ?? home.country)
          : "",
        price: home.nightlyFrom ? `${home.nightlyFrom.toFixed(2)} USD` : "",
        bedrooms: home.bedrooms ?? null,
        guests: home.guests ?? null,
      },
    ];
  });
}

function csvCell(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The feed as Meta's hotel CSV, header row first. */
export function hotelFeedCsv(rows: HotelFeedRow[]): string {
  const lines = [HOTEL_FEED_COLUMNS.join(",")];
  for (const row of rows) {
    const cells: Record<
      (typeof HOTEL_FEED_COLUMNS)[number],
      string | number | null
    > = {
      id: row.id,
      brand: row.brand,
      description: row.description,
      title: row.title,
      link: row.link,
      "image[0].url": row.imageUrl,
      "image[0].tag[0]": "Exterior",
      "address.addr1": row.streetAddress ?? "",
      "address.city": row.city,
      "address.region": row.region,
      "address.country": row.country,
      latitude: row.latitude ?? "",
      longitude: row.longitude ?? "",
      "neighborhood[0]": row.city,
      custom_label_0: row.region,
      custom_label_1: row.bedrooms ? `${row.bedrooms} bedrooms` : "",
      custom_number_0: row.guests,
      custom_number_1: row.bedrooms,
      price: row.price,
      hotel_category: "vacation rental",
    };
    lines.push(
      HOTEL_FEED_COLUMNS.map((column) => csvCell(cells[column])).join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

function xml(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The feed as Meta's hotel XML: a `listings` document of `listing` nodes.
 * This is the travel-catalog shape, not the RSS `item` shape product feeds
 * use; a Hotels and rentals catalog rejects the latter.
 */
export function hotelFeedXml(rows: HotelFeedRow[], feedTitle: string): string {
  const listings = rows
    .map((row) =>
      [
        "  <listing>",
        `    <hotel_id>${xml(row.id)}</hotel_id>`,
        `    <name>${xml(row.title)}</name>`,
        `    <brand>${xml(row.brand)}</brand>`,
        `    <description>${xml(row.description)}</description>`,
        `    <url>${xml(row.link)}</url>`,
        "    <image>",
        `      <url>${xml(row.imageUrl)}</url>`,
        "      <tag>Exterior</tag>",
        "    </image>",
        '    <address format="simple">',
        `      <component name="addr1">${xml(row.streetAddress)}</component>`,
        `      <component name="postal_code">${xml(row.postalCode)}</component>`,
        `      <component name="city">${xml(row.city)}</component>`,
        `      <component name="region">${xml(row.region)}</component>`,
        `      <component name="country">${xml(row.country)}</component>`,
        "    </address>",
        row.latitude != null
          ? `    <latitude>${xml(row.latitude)}</latitude>`
          : null,
        row.longitude != null
          ? `    <longitude>${xml(row.longitude)}</longitude>`
          : null,
        row.city ? `    <neighborhood>${xml(row.city)}</neighborhood>` : null,
        row.price ? `    <base_price>${xml(row.price)}</base_price>` : null,
        row.guests != null
          ? `    <custom_number_0>${row.guests}</custom_number_0>`
          : null,
        row.bedrooms != null
          ? `    <custom_number_1>${row.bedrooms}</custom_number_1>`
          : null,
        "    <hotel_category>vacation rental</hotel_category>",
        "  </listing>",
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<listings>\n  <title>${xml(feedTitle)}</title>\n${listings}\n</listings>\n`;
}
