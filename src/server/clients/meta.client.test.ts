import { expect, test } from "bun:test";
import { ensureMetaAdsPaused } from "./meta.client";

function provider(states: Record<string, string>, confirmed = "PAUSED") {
  const writes: string[] = [];
  return {
    writes,
    client: {
      statuses: async (ids: string[]) =>
        Object.fromEntries(
          ids
            .filter((id) => states[id])
            .map((id) => [id, { id, status: states[id]! }]),
        ),
      pause: async (id: string) => {
        writes.push(id);
        return { success: true };
      },
      status: async () => ({ status: confirmed }),
    },
  };
}

test("pauses an opening ad left active under a paused campaign", async () => {
  const p = provider({ opening: "ACTIVE", attached: "PAUSED" });
  await ensureMetaAdsPaused(["opening", "attached"], p.client);
  expect(p.writes).toEqual(["opening"]);
});

test("refuses to record a paused result when Meta keeps an ad active", async () => {
  const p = provider({ opening: "ACTIVE" }, "ACTIVE");
  const error = await ensureMetaAdsPaused(["opening"], p.client).catch(
    (error) => error as Error,
  );
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain("still ACTIVE");
});

test("requires Meta to return every created ad", async () => {
  const p = provider({ attached: "PAUSED" });
  const error = await ensureMetaAdsPaused(
    ["missing", "attached"],
    p.client,
  ).catch((error) => error as Error);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain("did not return ad missing");
  expect(p.writes).toEqual([]);
});
