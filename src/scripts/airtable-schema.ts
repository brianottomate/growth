/**
 * Script to read Airtable schema and display field IDs
 *
 * This helps us understand the structure of the Airtable base
 * so we can write data to it from the wander-fit.ts script.
 *
 * Usage: bun src/scripts/airtable-schema.ts <BASE_ID> <TABLE_ID>
 */

const AIRTABLE_API_TOKEN = process.env.AIRTABLE_API_TOKEN;
const BASE_ID = "appi3yQTj7eXkuNNv";
const TABLE_ID = "tblEm2zM5tFGWoaIH";

interface AirtableField {
  id: string;
  name: string;
  type: string;
  options?: {
    choices?: Array<{ id: string; name: string; color?: string }>;
  };
}

interface AirtableTable {
  id: string;
  name: string;
  primaryFieldId: string;
  fields: AirtableField[];
}

interface AirtableBase {
  id: string;
  name: string;
  tables: AirtableTable[];
}

async function getBaseSchema(baseId: string): Promise<AirtableBase> {
  const response = await fetch(
    `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
    {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_TOKEN}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch base schema: ${response.statusText}`);
  }

  return (await response.json()) as AirtableBase;
}

async function main() {
  if (!AIRTABLE_API_TOKEN) {
    console.error("❌ Error: AIRTABLE_API_TOKEN environment variable is not set");
    process.exit(1);
  }

  const baseId = BASE_ID;
  const tableIdOrName = TABLE_ID;

  console.log("🔵 Fetching Airtable base schema...\n");

  try {
    const base = await getBaseSchema(baseId);

    console.log(`📊 Base: ${base.name || baseId}`);
    console.log(`📋 Tables found: ${base.tables.length}\n`);

    for (const table of base.tables) {
      // If a specific table was requested, only show that one
      if (tableIdOrName && table.id !== tableIdOrName && table.name !== tableIdOrName) {
        continue;
      }

      console.log(`${"=".repeat(80)}`);
      console.log(`Table: ${table.name}`);
      console.log(`ID: ${table.id}`);
      console.log(`Primary Field ID: ${table.primaryFieldId}`);
      console.log(`${"=".repeat(80)}\n`);

      console.log("Fields:");
      console.log("-".repeat(80));

      for (const field of table.fields) {
        console.log(`\n📌 ${field.name}`);
        console.log(`   ID: ${field.id}`);
        console.log(`   Type: ${field.type}`);

        // Show options for single select / multi select fields
        if (field.options?.choices) {
          console.log(`   Options:`);
          for (const choice of field.options.choices) {
            console.log(`     - ${choice.name} (${choice.id})`);
          }
        }

        // Mark primary field
        if (field.id === table.primaryFieldId) {
          console.log(`   ⭐ PRIMARY FIELD`);
        }
      }

      console.log("\n" + "-".repeat(80) + "\n");
    }

    // Show TypeScript interface suggestion
    if (tableIdOrName) {
      const table = base.tables.find(
        (t) => t.id === tableIdOrName || t.name === tableIdOrName,
      );

      if (table) {
        console.log("\n💡 Suggested TypeScript Interface:\n");
        console.log("interface AirtableRecord {");
        console.log(`  id: string; // Record ID`);
        for (const field of table.fields) {
          const tsType = getTypeScriptType(field.type);
          console.log(`  "${field.name}": ${tsType}; // ${field.id}`);
        }
        console.log("}\n");
      }
    }

    console.log("✅ Schema fetched successfully!\n");
  } catch (error) {
    console.error("❌ Error fetching schema:");
    console.error(error);
    process.exit(1);
  }
}

function getTypeScriptType(airtableType: string): string {
  const typeMap: Record<string, string> = {
    singleLineText: "string",
    multilineText: "string",
    richText: "string",
    number: "number",
    percent: "number",
    currency: "number",
    rating: "number",
    checkbox: "boolean",
    date: "string",
    dateTime: "string",
    duration: "number",
    url: "string",
    email: "string",
    phoneNumber: "string",
    singleSelect: "string",
    multipleSelects: "string[]",
    singleCollaborator: "{ id: string; email: string }",
    multipleCollaborators: "Array<{ id: string; email: string }>",
    multipleRecordLinks: "string[]",
    multipleAttachments: "Array<{ id: string; url: string; filename: string }>",
    formula: "string | number",
    rollup: "any",
    count: "number",
    lookup: "any",
    multipleLookupValues: "any[]",
    createdTime: "string",
    lastModifiedTime: "string",
    createdBy: "{ id: string; email: string }",
    lastModifiedBy: "{ id: string; email: string }",
    button: "{ label: string; url: string }",
  };

  return typeMap[airtableType] || "any";
}

main().catch(console.error);
