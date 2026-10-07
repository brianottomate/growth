import type { LifecycleExecutionSnapshot } from "@/lib/validators/lifecycle-runtime";

/** Test authority comes from a server-created immutable revision, never an event name. */
export function isTestJourney(
  snapshot: LifecycleExecutionSnapshot,
  email: string,
) {
  return snapshot.test?.email === email;
}
export function canRunJourney(
  snapshot: LifecycleExecutionSnapshot,
  email: string,
  execution: { enabled: boolean; runtimeId: string | null } | undefined,
  runtimeId: string,
) {
  if (snapshot.test) return isTestJourney(snapshot, email);
  return Boolean(execution?.enabled && execution.runtimeId === runtimeId);
}
