import { z } from "zod";

/** Catalog gate: an output must describe its data, including nested fields.
 * Open extensions use z.json(), which emits an explicit recursive JSON union. */
export function assertOutputContract(name: string, schema: z.ZodType) {
  if (schema instanceof z.ZodLazy || schema.safeParse(undefined).success) {
    throw new Error(`${name} must declare a concrete required result shape`);
  }
  const json = z.toJSONSchema(schema, { target: "draft-7" });
  function visit(value: unknown, path: string) {
    if (typeof value === "boolean") {
      if (value) throw new Error(`${path} accepts arbitrary data`);
      return;
    }
    if (typeof value !== "object" || value === null)
      throw new Error(`${path} is not a schema`);
    const node = value as Record<string, unknown>;
    if (
      !(
        "type" in node ||
        "$ref" in node ||
        "const" in node ||
        "enum" in node ||
        "anyOf" in node ||
        "oneOf" in node ||
        "allOf" in node ||
        "not" in node
      )
    ) {
      throw new Error(`${path} has no output shape`);
    }
    for (const keyword of [
      "properties",
      "$defs",
      "definitions",
      "patternProperties",
    ]) {
      const entries = node[keyword];
      if (entries && typeof entries === "object")
        for (const [key, child] of Object.entries(entries)) {
          if (keyword === "properties" && key === "connectToken")
            throw new Error(`${path} exposes a connection credential`);
          visit(child, `${path}.${key}`);
        }
    }
    for (const keyword of ["anyOf", "oneOf", "allOf", "prefixItems"]) {
      const children = node[keyword];
      if (Array.isArray(children))
        children.forEach((child, index) =>
          visit(child, `${path}.${keyword}[${index}]`),
        );
    }
    for (const keyword of ["items", "additionalProperties"]) {
      const child = node[keyword];
      if (Array.isArray(child))
        child.forEach((entry, index) =>
          visit(entry, `${path}.${keyword}[${index}]`),
        );
      else if (child !== undefined) visit(child, `${path}.${keyword}`);
    }
  }
  visit(json, name);
  return json;
}
