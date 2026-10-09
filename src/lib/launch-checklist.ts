import { z } from "zod";
import {
  LAUNCH_MILESTONES,
  type ObservedFacts,
  type ReadinessChecklist,
  type ReadinessItem,
} from "./performance-readiness";

export const launchItemSchema = z.enum([
  "signed",
  "intake_sent",
  "intake",
  "invoice_sent",
  "invoice_paid",
  "budget",
  "access",
  "google_access",
  "wanderos",
  "email_domain",
  "guest_list",
]);
export type LaunchItem = z.infer<typeof launchItemSchema>;
/** A tick, an untick, a skip, or a tick dated to when it happened (YYYY-MM-DD). */
export const launchPatchSchema = z
  .array(
    z.object({
      item: launchItemSchema,
      checked: z.boolean(),
      skipped: z.boolean().optional(),
      at: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
  )
  .min(1)
  .max(11)
  .refine(
    (patch) => new Set(patch.map((entry) => entry.item)).size === patch.length,
    "Each item may be updated once per request",
  );
export type LaunchEvent = {
  item: LaunchItem;
  checked: boolean;
  /** Not applicable to this client; settled without being done. */
  skipped?: boolean;
  by: string | null;
  byName?: string | null;
  source: "manual" | "assistant" | "workflow";
  at: string;
  evidence: string | null;
};
export type LaunchRecord = {
  revision: number;
  items: Partial<Record<LaunchItem, LaunchEvent>>;
  history: LaunchEvent[];
  receipts: string[];
};
export const emptyLaunchRecord = (): LaunchRecord => ({
  revision: 0,
  items: {},
  history: [],
  receipts: [],
});

export function applyLaunchPatch(
  current: LaunchRecord,
  patch: z.infer<typeof launchPatchSchema>,
  stamp: Omit<LaunchEvent, "item" | "checked">,
  receipt?: string,
): LaunchRecord {
  const events: LaunchEvent[] = patch.map(({ at, skipped, ...entry }) => ({
    ...entry,
    ...stamp,
    skipped: !entry.checked && skipped === true,
    at: at ? `${at}T12:00:00.000Z` : stamp.at,
  }));
  return {
    revision: current.revision + 1,
    items: {
      ...current.items,
      ...Object.fromEntries(events.map((event) => [event.item, event])),
    },
    history: [...current.history, ...events].slice(-100),
    receipts: receipt ? [...current.receipts, receipt] : current.receipts,
  };
}

const fmtDay = (date: Date) =>
  date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/** What the app sees for an observed item: done, and the line that says so. */
function observe(
  id: string,
  facts: ObservedFacts | undefined,
): Pick<ReadinessItem, "done" | "detail"> {
  if (id === "intake")
    return facts?.intakeFiledAt
      ? { done: true, detail: `Filed ${fmtDay(facts.intakeFiledAt)}` }
      : { done: false, detail: "Not filed" };
  if (id === "invoice_paid")
    return facts?.feePaidAt
      ? { done: true, detail: `Paid ${fmtDay(facts.feePaidAt)}` }
      : { done: false, detail: "Not paid" };
  if (id === "wanderos")
    return facts?.wanderOsConnected
      ? { done: true, detail: "Connected" }
      : { done: false, detail: "Not connected" };
  return { done: false, detail: null };
}

/**
 * Static labels and actions. Observed items read the app's own facts;
 * recorded items complete only from explicit milestone writes.
 */
export function recordedLaunchChecklist(
  record: LaunchRecord,
  facts?: ObservedFacts,
): ReadinessChecklist {
  const groups = LAUNCH_MILESTONES.map((group) => {
    const items = group.items.map((item): ReadinessItem => {
      if (item.observed) {
        const seen = observe(item.id, facts);
        return {
          id: item.id,
          label: item.label,
          observed: true,
          done: seen.done,
          skipped: false,
          dated: false,
          detail: seen.detail,
          action: seen.done ? null : item.action,
        };
      }
      const event = record.items[item.id as LaunchItem];
      const done = event?.checked ?? false;
      const skipped = !done && event?.skipped === true;
      const who =
        event?.source === "workflow"
          ? "Workflow"
          : (event?.byName ??
            (event?.source === "assistant" ? "Chat" : "Operator"));
      return {
        id: item.id,
        label: item.label,
        observed: false,
        done,
        skipped,
        dated: item.dated === true,
        detail: event
          ? `${done ? "Completed" : skipped ? "Skipped" : "Reopened"} · ${who} · ${event.at.slice(0, 10)}`
          : "Not recorded",
        provenance: event
          ? `${event.source} · ${event.byName ?? event.by ?? "System"} · ${event.at}${event.evidence ? ` · ${event.evidence}` : ""}`
          : undefined,
        action: done || skipped ? null : item.action,
      };
    });
    return {
      id: group.id,
      label: group.label,
      items,
      done: items.filter((item) => item.done || item.skipped).length,
      total: items.length,
    };
  });
  return {
    groups,
    done: groups.reduce((sum, group) => sum + group.done, 0),
    total: groups.reduce((sum, group) => sum + group.total, 0),
  };
}
