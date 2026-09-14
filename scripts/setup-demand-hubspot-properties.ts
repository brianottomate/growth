/**
 * Create the "Demand Sales" contact property group and every `demand_*`
 * property in HubSpot from the manifest in
 * src/server/services/demand/field-mapping.ts.
 *
 * Idempotent: existing group/properties are left alone (reported as
 * "exists"), so re-running after adding a property to the manifest creates
 * only the new one. Never deletes or edits anything already in the portal.
 *
 *   bun --conditions=react-server scripts/setup-demand-hubspot-properties.ts
 *   bun --conditions=react-server scripts/setup-demand-hubspot-properties.ts --dry-run
 */
import { Client } from "@hubspot/api-client";
import type {
  PropertyCreateFieldTypeEnum,
  PropertyCreateTypeEnum,
} from "@hubspot/api-client/lib/codegen/crm/properties/models/PropertyCreate";

import { env } from "@/env";
import {
  DEMAND_PROPERTY_DEFINITIONS,
  DEMAND_PROPERTY_GROUP,
} from "@/server/services/demand/field-mapping";

const dryRun = process.argv.includes("--dry-run");

if (!env.HUBSPOT_ACCESS_TOKEN_OPERATED) {
  console.error("HUBSPOT_ACCESS_TOKEN_OPERATED is not set");
  process.exit(1);
}

const client = new Client({ accessToken: env.HUBSPOT_ACCESS_TOKEN_OPERATED });
const OBJECT = "contacts";

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    Number((error as { code?: unknown }).code) === 404
  );
}

// ---- group ----------------------------------------------------------
try {
  await client.crm.properties.groupsApi.getByName(
    OBJECT,
    DEMAND_PROPERTY_GROUP,
  );
  console.log(`group   ${DEMAND_PROPERTY_GROUP}: exists`);
} catch (error) {
  if (!isNotFound(error)) throw error;
  if (dryRun) {
    console.log(`group   ${DEMAND_PROPERTY_GROUP}: would create`);
  } else {
    await client.crm.properties.groupsApi.create(OBJECT, {
      name: DEMAND_PROPERTY_GROUP,
      label: "Demand Sales",
      displayOrder: -1,
    });
    console.log(`group   ${DEMAND_PROPERTY_GROUP}: created`);
  }
}

// ---- properties -----------------------------------------------------
let created = 0;
let existing = 0;
for (const definition of DEMAND_PROPERTY_DEFINITIONS) {
  try {
    await client.crm.properties.coreApi.getByName(OBJECT, definition.name);
    existing++;
    console.log(`property ${definition.name}: exists`);
    continue;
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  if (dryRun) {
    console.log(
      `property ${definition.name}: would create (${definition.type})`,
    );
    continue;
  }

  await client.crm.properties.coreApi.create(OBJECT, {
    name: definition.name,
    label: definition.label,
    // The manifest's literal unions are a subset of the SDK's enums.
    type: definition.type as PropertyCreateTypeEnum,
    fieldType: definition.fieldType as PropertyCreateFieldTypeEnum,
    groupName: DEMAND_PROPERTY_GROUP,
    description:
      "description" in definition ? definition.description : undefined,
    options:
      "options" in definition
        ? definition.options.map((option, index) => ({
            label: option.label,
            value: option.value,
            displayOrder: index,
            hidden: false,
          }))
        : undefined,
    referencedObjectType:
      "referencedObjectType" in definition
        ? definition.referencedObjectType
        : undefined,
  });
  created++;
  console.log(`property ${definition.name}: created`);
}

console.log(
  `\n${dryRun ? "Dry run — " : ""}${created} created, ${existing} already present, ${DEMAND_PROPERTY_DEFINITIONS.length} in manifest.`,
);
