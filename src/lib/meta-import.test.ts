import { describe, expect, test } from "bun:test";
import { isImportedMetaCatalog } from "./meta-import";

describe("imported catalog classification", () => {
  test("recognizes product-backed templates even without recovered images", () => {
    expect(
      isImportedMetaCatalog({
        metaImport: {
          rawCreative: {
            object_story_spec: {
              template_data: { format_option: "carousel_images_multi_items" },
            },
          },
        },
      }),
    ).toBe(true);
    expect(
      isImportedMetaCatalog({
        metaImport: { rawCreative: { product_set_id: "products" } },
      }),
    ).toBe(true);
  });
  test("does not label an ordinary carousel or an unresolved image ad as catalog", () => {
    expect(
      isImportedMetaCatalog({
        metaImport: {
          rawCreative: {
            object_story_spec: { link_data: { child_attachments: [] } },
          },
        },
      }),
    ).toBe(false);
    expect(isImportedMetaCatalog({ metaImport: { rawCreative: {} } })).toBe(
      false,
    );
    expect(isImportedMetaCatalog({})).toBe(false);
  });
});
