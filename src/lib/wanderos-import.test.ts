import { expect, test } from "bun:test";
import { initialImportSteps, runWanderOsImportSteps } from "./wanderos-import";

test("an import failure stops setup; retry resumes without importing completed homes again", async () => {
  const steps = initialImportSteps();
  const calls: string[] = [];
  let failSelection = true;
  const operations = {
    homes: async () => {
      calls.push("homes");
      return "164 homes imported";
    },
    featured: async () => {
      calls.push("featured");
      if (failSelection) throw new Error("Selection unavailable");
      return "5 Featured homes selected";
    },
    personas: async () => {
      calls.push("personas");
      return "3 personas";
    },
    ads: async () => {
      calls.push("ads");
      return "11 drafts";
    },
    broadcast: async () => {
      calls.push("broadcast");
      return "1 broadcast";
    },
    catalog: async () => {
      calls.push("catalog");
      return "Cards prepared";
    },
    destinations: async () => {
      calls.push("destinations");
      return "3 destinations created";
    },
  };
  const checkpoints: string[][] = [];
  const save = async () => {
    checkpoints.push(steps.map((step) => step.status));
  };
  const failure = await runWanderOsImportSteps(steps, operations, save).then(
    () => null,
    (error: Error) => error.message,
  );
  expect(failure).toBe("Selection unavailable");
  expect(calls).toEqual(["homes", "featured"]);
  expect(steps.map((step) => step.status)).toEqual([
    "ready",
    "error",
    "pending",
    "pending",
    "pending",
    "pending",
    "pending",
  ]);
  expect(steps[1]?.message).toBe("Selection unavailable");
  failSelection = false;
  await runWanderOsImportSteps(steps, operations, save);
  expect(calls).toEqual([
    "homes",
    "featured",
    "featured",
    "destinations",
    "personas",
    "ads",
    "broadcast",
    "catalog",
  ]);
  expect(steps.map((step) => step.status)).toEqual([
    "ready",
    "ready",
    "ready",
    "ready",
    "ready",
    "ready",
    "ready",
  ]);
  expect(checkpoints).toContainEqual([
    "ready",
    "processing",
    "pending",
    "pending",
    "pending",
    "pending",
    "pending",
  ]);
});

test("a completed setup does not repeat selections or destination creation on resume", async () => {
  const steps = initialImportSteps().map((step) => ({
    ...step,
    status: "ready" as const,
  }));
  const unexpected = async () => {
    throw new Error("Completed step repeated");
  };
  await runWanderOsImportSteps(
    steps,
    {
      homes: unexpected,
      featured: unexpected,
      destinations: unexpected,
      catalog: unexpected,
      personas: unexpected,
      ads: unexpected,
      broadcast: unexpected,
    },
    async () => {
      throw new Error("Completed workflow should not checkpoint again");
    },
  );
  expect(steps.every((step) => step.status === "ready")).toBe(true);
});
