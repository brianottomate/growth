import { expect, test } from "bun:test";
import {
  EMPTY_PITCH,
  pitchFieldsSchema,
  publicPitchSettings,
  selectPitchHomes,
  pitchOverrides,
  resolvePitchFields,
} from "./pitch-settings";

test("pitch exports contain presentation settings, never the writer identity or private CRM fields", () => {
  const fields = pitchFieldsSchema.parse({
    caption: "A private-feeling retreat",
    privateNotes: "Negotiation notes",
    contactEmail: "contact@example.com",
  });
  const result = publicPitchSettings({
    ...fields,
    revision: 2,
    updatedBy: "usr_rep",
    updatedAt: "2026-10-02",
  });
  expect(result?.caption).toBe("A private-feeling retreat");
  expect(result?.revision).toBe(2);
  expect(result).not.toHaveProperty("updatedBy");
  expect(result).not.toHaveProperty("privateNotes");
  expect(result).not.toHaveProperty("contactEmail");
  expect(publicPitchSettings(null)).toBeNull();
});

test("persisted media is shareable and proposed pricing retains a deliberate zero", () => {
  expect(
    pitchFieldsSchema.parse({ managementFeeDollars: 0 }).managementFeeDollars,
  ).toBe(0);
  for (const url of [
    "blob:local",
    "data:image/png;base64,AA",
    "javascript:alert(1)",
    "http://example.com/photo.jpg",
  ]) {
    expect(pitchFieldsSchema.safeParse({ imageUrls: [url] }).success).toBe(
      false,
    );
  }
  expect(
    pitchFieldsSchema.safeParse({
      ...EMPTY_PITCH,
      imageUrls: Array(4).fill("https://example.com/photo.jpg"),
    }).success,
  ).toBe(false);
});

test("the public pitch includes only selected homes from this brand, or all when unset", () => {
  const homes = [
    { url: "https://brand.com/a/" },
    { url: "https://brand.com/b" },
  ];
  expect(selectPitchHomes(homes, [])).toEqual(homes);
  expect(
    selectPitchHomes(homes, [
      "https://brand.com/a",
      "https://other.com/private",
    ]),
  ).toEqual([homes[0]!]);
});

test("storage keeps explicit overrides sparse and inherits updated brand/default values", () => {
  const overrides = pitchOverrides(
    pitchFieldsSchema.parse({ headline: "Custom", managementFeeDollars: 0 }),
  );
  expect(overrides).toEqual({ headline: "Custom", managementFeeDollars: 0 });
  const effective = resolvePitchFields(
    pitchFieldsSchema.parse(overrides),
    { name: "Updated brand", logo: "https://brand.com/logo.png" },
    "Maui",
  );
  expect(effective.brandName).toBe("Updated brand");
  expect(effective.headline).toBe("Custom");
  expect(effective.managementFeeDollars).toBe(0);
  expect(effective.location).toBe("Maui");
  expect(pitchOverrides(EMPTY_PITCH)).toEqual({});
});
