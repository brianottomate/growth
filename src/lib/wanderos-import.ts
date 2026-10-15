import { z } from "zod";

export const WANDEROS_IMPORT_STEPS = [
  "homes",
  "featured",
  "destinations",
  "personas",
  "ads",
  "broadcast",
  "catalog",
] as const;
export const WANDEROS_IMPORT_LABELS = {
  homes: "Import homes",
  featured: "Select Featured homes",
  destinations: "Create destinations",
  personas: "Prepare personas",
  ads: "Draft starter ads",
  broadcast: "Draft first broadcast",
  catalog: "Prepare catalog",
};
export const wanderOsImportStepSchema = z.object({
  step: z.enum(WANDEROS_IMPORT_STEPS),
  status: z.enum(["pending", "processing", "ready", "error"]),
  message: z.string(),
});
export const wanderOsImportRunSchema = z.object({
  id: z.string(),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  steps: z.array(wanderOsImportStepSchema),
  error: z.string().nullable(),
});
export type WanderOsImportStep = z.infer<typeof wanderOsImportStepSchema>;
export const initialImportSteps = (): WanderOsImportStep[] =>
  WANDEROS_IMPORT_STEPS.map((step) => ({
    step,
    status: "pending",
    message: "",
  }));

/** Retry unfinished steps without repeating completed selections or drafts. */
export async function runWanderOsImportSteps(
  steps: WanderOsImportStep[],
  operations: Record<
    (typeof WANDEROS_IMPORT_STEPS)[number],
    () => Promise<string>
  >,
  save: (steps: WanderOsImportStep[]) => Promise<void>,
) {
  for (const current of steps) {
    if (current.status === "ready") continue;
    current.status = "processing";
    current.message = "";
    await save(steps);
    try {
      current.message = await operations[current.step]();
      current.status = "ready";
      await save(steps);
    } catch (error) {
      current.status = "error";
      current.message = error instanceof Error ? error.message : "Step failed";
      await save(steps);
      throw error;
    }
  }
}
