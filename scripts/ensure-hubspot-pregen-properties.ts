/**
 * Idempotently creates the minimal HubSpot contact-property contract used by
 * the two-touch pre-generated-sites pilot sequence.
 *
 * No contacts are updated and nobody is enrolled. Sequence authoring remains
 * in HubSpot's UI; these properties are only its reviewed-copy token surface.
 *
 *   bun --conditions=react-server scripts/ensure-hubspot-pregen-properties.ts
 */
import { env } from "@/env";

const token = env.HUBSPOT_ACCESS_TOKEN_OPERATED;
if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN_OPERATED is not configured");

const GROUP = {
  name: "growth_pregen_sites",
  label: "Growth - Pre-Gen Sites",
};

const PROPERTIES = [
  {
    name: "growth_pregen_preview_url",
    label: "Growth pregen preview URL",
    fieldType: "text",
    description:
      "Reviewed preview URL copied to the enrolled contact for reliable sequence personalization.",
  },
  {
    name: "growth_pregen_touch_1_subject",
    label: "Growth pregen touch 1 subject",
    fieldType: "text",
    description: "Human-reviewed subject for pregen sequence touch 1.",
  },
  {
    name: "growth_pregen_touch_1_body",
    label: "Growth pregen touch 1 body",
    fieldType: "textarea",
    description: "Human-reviewed body for pregen sequence touch 1.",
  },
  {
    name: "growth_pregen_touch_2_subject",
    label: "Growth pregen touch 2 subject",
    fieldType: "text",
    description: "Human-reviewed subject for pregen sequence touch 2.",
  },
  {
    name: "growth_pregen_touch_2_body",
    label: "Growth pregen touch 2 body",
    fieldType: "textarea",
    description: "Human-reviewed body for pregen sequence touch 2.",
  },
] as const;

async function hubspot<T>(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; data: T | null }> {
  const response = await fetch(`https://api.hubapi.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = response.status === 204 ? null : ((await response.json()) as T);
  if (!response.ok) {
    throw new Error(
      `HubSpot ${path} -> ${response.status}: ${JSON.stringify(data)}`,
    );
  }
  return { status: response.status, data };
}

async function ensureGroup() {
  const groups = await hubspot<{ results?: Array<{ name: string }> }>(
    "/crm/v3/properties/contacts/groups",
  );
  if (groups.data?.results?.some((group) => group.name === GROUP.name)) {
    console.log(`= property group ${GROUP.name}`);
    return;
  }
  await hubspot("/crm/v3/properties/contacts/groups", {
    method: "POST",
    body: JSON.stringify(GROUP),
  });
  console.log(`+ property group ${GROUP.name}`);
}

async function ensureProperty(property: (typeof PROPERTIES)[number]) {
  const encoded = encodeURIComponent(property.name);
  const existing = await fetch(
    `https://api.hubapi.com/crm/v3/properties/contacts/${encoded}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (existing.ok) {
    console.log(`= contact.${property.name}`);
    return;
  }
  if (existing.status !== 404) {
    throw new Error(
      `HubSpot property lookup ${property.name} -> ${existing.status}: ${await existing.text()}`,
    );
  }
  await hubspot("/crm/v3/properties/contacts", {
    method: "POST",
    body: JSON.stringify({
      ...property,
      groupName: GROUP.name,
      type: "string",
      hasUniqueValue: false,
      hidden: false,
      formField: false,
    }),
  });
  console.log(`+ contact.${property.name}`);
}

await ensureGroup();
for (const property of PROPERTIES) {
  await ensureProperty(property);
}

console.log(`Ready: ${PROPERTIES.length} two-touch pregen properties.`);
