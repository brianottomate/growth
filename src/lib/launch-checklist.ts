import { z } from "zod";
import {
  readinessChecklist,
  type ReadinessChecklist,
} from "./performance-readiness";

export const launchItemSchema = z.enum([
  "intake",
  "budget",
  "access",
  "homes",
  "contacts",
  "mark",
  "folder",
  "previews",
  "ads",
  "campaign",
  "audience",
  "pushed",
  "live",
]);
export type LaunchItem = z.infer<typeof launchItemSchema>;
export const launchPatchSchema = z
  .array(z.object({ item: launchItemSchema, checked: z.boolean() }))
  .min(1)
  .max(13)
  .refine(
    (patch) => new Set(patch.map((entry) => entry.item)).size === patch.length,
    "Each item may be updated once per request",
  );
export type LaunchEvent = {
  item: LaunchItem;
  checked: boolean;
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
  if (receipt && current.receipts.includes(receipt)) return current;
  const events = patch.map((entry) => ({ ...entry, ...stamp }));
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

/** Static labels/actions, with completion exclusively from explicit milestone writes. */
export function recordedLaunchChecklist(
  record: LaunchRecord,
): ReadinessChecklist {
  const template = readinessChecklist({
    intakeFiled: false,
    mediaBudget: null,
    accessVerified: false,
    accessClaimed: false,
    homesOnRecord: 0,
    homesAll: false,
    hasMark: false,
    reportEmails: false,
    invoiceEmail: false,
    creativeFolder: false,
    previewsKept: 0,
    adsDrafted: 0,
    campaigns: 0,
    audiences: 0,
    lookalikes: 0,
    pushed: false,
    live: false,
  });
  const groups = template.groups.map((group) => {
    const items = group.items.map((item) => {
      const event = record.items[item.id as LaunchItem];
      const done = event?.checked ?? false;
      return {
        ...item,
        done,
        detail: event
          ? `${done ? "Completed" : "Reopened"} · ${event.source === "workflow" ? "Workflow" : (event.byName ?? (event.source === "assistant" ? "Chat" : "Operator"))} · ${event.at.slice(0, 10)}`
          : "Not recorded",
        provenance: event
          ? `${event.source} · ${event.byName ?? event.by ?? "System"} · ${event.at}${event.evidence ? ` · ${event.evidence}` : ""}`
          : undefined,
        action: done
          ? null
          : item.id === "homes"
            ? { label: "Open homes", to: "homes" as const }
            : item.action,
      };
    });
    return { ...group, items, done: items.filter((item) => item.done).length };
  });
  return {
    groups,
    done: groups.reduce((sum, group) => sum + group.done, 0),
    total: template.total,
  };
}
