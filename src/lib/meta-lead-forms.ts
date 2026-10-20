// Meta instant (lead) forms: the spec Growth sends to Graph, and the house
// templates it builds them from. Forms belong to a Facebook Page and cannot
// be edited once created; a change is a new form. This module is imported by
// client components: keep it free of server code.

export type MetaLeadFormQuestion =
  | {
      type:
        | "EMAIL"
        | "PHONE"
        | "FULL_NAME"
        | "FIRST_NAME"
        | "LAST_NAME"
        | "STREET_ADDRESS"
        | "CITY";
    }
  | {
      type: "CUSTOM";
      /** Answer key; what the lead payload and HubSpot see. */
      key: string;
      label: string;
      /** Multiple choice when present; free text otherwise. */
      options?: { key: string; value: string }[];
    };

export type MetaLeadFormSpec = {
  name: string;
  privacyPolicyUrl: string;
  questions: MetaLeadFormQuestion[];
  /** Where the thank-you button sends people. */
  followUpUrl: string;
  /** Meta's "higher intent" form: a review step before submit. */
  higherIntent: boolean;
  locale: string;
};

export const META_LEAD_FORM_TEMPLATES = [
  "operator_qualification",
  "owner_acquisition",
  "guest_inquiry",
] as const;
export type MetaLeadFormTemplate = (typeof META_LEAD_FORM_TEMPLATES)[number];

export const META_LEAD_FORM_TEMPLATE_LABELS: Record<
  MetaLeadFormTemplate,
  { label: string; summary: string }
> = {
  operator_qualification: {
    label: "WanderOS operator qualification",
    summary:
      "Property managers: portfolio size in buckets, PMS, booking site, name, email, phone. Higher intent.",
  },
  owner_acquisition: {
    label: "Owner acquisition",
    summary:
      "Vacation-home owners for a Performance client: where the property is (the brand's markets), their connection to it, name, email, phone, street address and city. Hand-built form of October 2026.",
  },
  guest_inquiry: {
    label: "Guest inquiry",
    summary:
      "Travellers: name, email, phone, travel dates and group size. Thank-you button opens the brand's site.",
  },
};

/**
 * Portfolio buckets, by the low end: the lead router qualifies at 10 units,
 * so the boundary sits between 1-9 and 10-199. The older hand-built forms
 * say 1-10, which overlaps 10 and made the threshold ambiguous.
 */
export const OPERATOR_PORTFOLIO_BUCKETS = [
  "0",
  "1-9",
  "10-199",
  "200-750",
  "750-2000",
  "2000+",
] as const;

export const OPERATOR_PMS_OPTIONS = [
  "Guesty",
  "Streamline",
  "Rentals United",
  "Track",
  "Escapia",
  "Hostaway",
  "OwnerRez",
  "Other",
] as const;

const choice = (values: readonly string[]) =>
  values.map((value) => ({
    key: value.toLowerCase().replace(/[^a-z0-9+]+/g, "_"),
    value,
  }));

export const OWNER_CONNECTION_OPTIONS = [
  "I own or co-own it",
  "I'm under contract to purchase it",
  "I represent the owner",
  "I'm looking for a place to stay",
] as const;

export function leadFormFromTemplate(
  template: MetaLeadFormTemplate,
  brand: {
    name: string;
    website: string | null;
    privacyPolicyUrl: string;
    /** Where the brand takes homes, for the owner form's location question. */
    locations?: string[];
  },
): MetaLeadFormSpec {
  const site = brand.website ?? "https://www.wander.com";
  const month = new Date().toISOString().slice(0, 7);
  switch (template) {
    case "owner_acquisition": {
      const locations = brand.locations?.filter(Boolean) ?? [];
      return {
        name: `${month} · ${brand.name} owner acquisition`,
        privacyPolicyUrl: brand.privacyPolicyUrl,
        followUpUrl: site,
        higherIntent: false,
        locale: "en_US",
        questions: [
          locations.length
            ? {
                type: "CUSTOM",
                key: "property_location",
                label: "Where is the property you want help with?",
                options: choice([...locations, "Somewhere else"]),
              }
            : {
                type: "CUSTOM",
                key: "property_location",
                label: "Where is the property you want help with?",
              },
          {
            type: "CUSTOM",
            key: "property_connection",
            label: "What is your connection to the property?",
            options: choice(OWNER_CONNECTION_OPTIONS),
          },
          { type: "FULL_NAME" },
          { type: "EMAIL" },
          { type: "PHONE" },
          { type: "STREET_ADDRESS" },
          { type: "CITY" },
        ],
      };
    }
    case "operator_qualification":
      return {
        name: `${month} · WanderOS operator form`,
        privacyPolicyUrl: brand.privacyPolicyUrl,
        followUpUrl: "https://www.wander.com/os",
        higherIntent: true,
        locale: "en_US",
        questions: [
          {
            type: "CUSTOM",
            key: "managed_properties",
            label:
              "How many vacation rental properties do you currently manage?",
            options: choice(OPERATOR_PORTFOLIO_BUCKETS),
          },
          {
            type: "CUSTOM",
            key: "pms",
            label: "What is your current PMS?",
            options: choice(OPERATOR_PMS_OPTIONS),
          },
          {
            type: "CUSTOM",
            key: "booking_site",
            label:
              "Share your direct booking site or portfolio link, if you have one",
          },
          { type: "FULL_NAME" },
          { type: "EMAIL" },
          { type: "PHONE" },
        ],
      };
    case "guest_inquiry":
      return {
        name: `${month} · ${brand.name} guest inquiry`,
        privacyPolicyUrl: brand.privacyPolicyUrl,
        followUpUrl: site,
        higherIntent: false,
        locale: "en_US",
        questions: [
          { type: "FULL_NAME" },
          { type: "EMAIL" },
          { type: "PHONE" },
          {
            type: "CUSTOM",
            key: "travel_dates",
            label: "When are you planning to travel?",
          },
          {
            type: "CUSTOM",
            key: "group_size",
            label: "How many people are in your group?",
          },
        ],
      };
  }
}
