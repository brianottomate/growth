export const WORKFLOW_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];
export const workflowActive = (status?: string) =>
  status === "queued" || status === "running";
export type WorkflowActivityRun = {
  id: string;
  title: string;
  destination: string;
  href: string;
  status: WorkflowStatus;
  message: string;
  count?: { completed: number; total: number; unit: string };
  steps?: { title: string; status: WorkflowStatus }[];
  issue?: string;
  dismissed: boolean;
  parentRunId: string | null;
  updatedAt: string;
};
