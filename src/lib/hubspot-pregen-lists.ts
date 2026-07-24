export const HUBSPOT_ACCOUNT_ID = "22480390";

export const HUBSPOT_PREGEN_LISTS = {
  recycled: {
    label: "Recycled",
    company: {
      id: "3808",
      name: "Pre-Gen Sites | Recycled Leads (Companies)",
    },
    contact: {
      id: "3809",
      name: "Pre-Gen Sites | Recycled Leads (Contacts)",
    },
  },
  untouched: {
    label: "Untouched",
    company: {
      id: "3811",
      name: "Pre-Gen Sites | Untouched Leads (Companies)",
    },
    contact: {
      id: "3812",
      name: "Pre-Gen Sites | Untouched Leads (Contacts)",
    },
  },
} as const;

export type HubspotPregenCohort = keyof typeof HUBSPOT_PREGEN_LISTS;

export const hubspotListUrl = (listId: string) =>
  `https://app.hubspot.com/contacts/${HUBSPOT_ACCOUNT_ID}/objectLists/${listId}/filters`;
