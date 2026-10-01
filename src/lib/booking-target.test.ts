import { expect, test } from "bun:test";
import { bookingTargetInputSchema, bookingTargetUrl } from "./booking-target";

test("date-only targets let availability choose homes without copying search identity", () => {
  expect(
    bookingTargetUrl({
      website: "https://www.chaletshh.com",
      checkIn: "2026-11-15",
      checkOut: "2026-11-21",
      guests: 2,
    }),
  ).toBe(
    "https://www.chaletshh.com/s?checkin=2026-11-15&checkout=2026-11-21&guests=2",
  );
});
test("group targets use stable external unit IDs alongside dates", () => {
  const url = new URL(
    bookingTargetUrl({
      website: "https://www.chaletshh.com",
      unitIds: ["unit-b", "unit-a", "unit-b"],
      checkIn: "2026-11-15",
      checkOut: "2026-11-21",
    }),
  );
  expect(url.searchParams.get("unitIds")).toBe("unit-a,unit-b");
  expect(url.searchParams.get("checkin")).toBe("2026-11-15");
  expect(url.searchParams.has("search_id")).toBe(false);
});
test("property targets preserve the property path and reject other brands", () => {
  expect(
    bookingTargetUrl({
      website: "https://www.chaletshh.com",
      homeUrl:
        "https://www.chaletshh.com/property/123/a-frame?search_id=old&checkin=2020-01-01&checkout=2020-01-03&unitIds=old&guests=8",
      guests: 2,
    }),
  ).toBe("https://www.chaletshh.com/property/123/a-frame?guests=2");
  expect(() =>
    bookingTargetUrl({
      website: "https://www.chaletshh.com",
      homeUrl: "https://another-brand.com/property/123",
    }),
  ).toThrow();
});
test("booking targets reject impossible dates, partial stays and ambiguous selections", () => {
  const base = { brandId: "brand_1", name: "November" };
  for (const fields of [
    { checkIn: "2026-02-30", checkOut: "2026-03-02" },
    { checkIn: "2026-11-15" },
    { checkIn: "2026-11-21", checkOut: "2026-11-15" },
    { homeId: "home_1", homeGroupId: "group_1" },
  ])
    expect(
      bookingTargetInputSchema.safeParse({ ...base, ...fields }).success,
    ).toBe(false);
  expect(
    bookingTargetInputSchema.safeParse({
      ...base,
      homeGroupId: "group_1",
      checkIn: "2026-11-15",
      checkOut: "2026-11-21",
    }).success,
  ).toBe(true);
});
