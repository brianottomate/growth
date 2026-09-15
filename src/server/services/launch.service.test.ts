import { describe, expect, it } from "bun:test";

import { launchDeliverableSchema, type LaunchDeliverable } from "@/lib/launch";

/**
 * The patch-key filter in setDeliverable. `status` carries a zod default that
 * survives `.partial()`, so parsing a patch alone reintroduces it and an
 * unrelated field update would reset the surface's status.
 */
function patchKeys(
  patch: Partial<Omit<LaunchDeliverable, "surface">>,
  surface: string,
) {
  const parsed = launchDeliverableSchema.partial().parse({ ...patch, surface });
  return Object.fromEntries(
    Object.entries(parsed).filter(([key]) => key === "surface" || key in patch),
  );
}

describe("setDeliverable patch shaping", () => {
  it("does not smuggle a default status into an unrelated patch", () => {
    const parsed = launchDeliverableSchema
      .partial()
      .parse({ surface: "email", readyBy: "2026-09-18" });
    expect(parsed.status).toBe("not_started");

    expect(patchKeys({ readyBy: "2026-09-18" }, "email")).toEqual({
      surface: "email",
      readyBy: "2026-09-18",
    });
  });

  it("keeps a status the caller did send", () => {
    expect(patchKeys({ status: "drafting" }, "email")).toEqual({
      surface: "email",
      status: "drafting",
    });
  });

  it("keeps an owner name even when it is not a resolvable member", () => {
    expect(
      patchKeys({ ownerName: "bogdan.korishev@gmail.com" }, "blog_or_social"),
    ).toEqual({
      surface: "blog_or_social",
      ownerName: "bogdan.korishev@gmail.com",
    });
  });
});
