"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
export function OperationJobCard({
  runId,
  onPrompt,
}: {
  runId: string;
  onPrompt: (text: string) => void;
}) {
  const [status, setStatus] = useState("running");
  const [message, setMessage] = useState<string>();
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let terminal = false;
      try {
        const response = await fetch(
          `/api/overview/operations?runId=${encodeURIComponent(runId)}`,
          { cache: "no-store" },
        );
        if ([401, 403, 404].includes(response.status)) {
          terminal = true;
          if (!disposed) {
            setStatus("unavailable");
            setMessage(
              "This result is unavailable in your current workspace. Refresh after signing in to the workspace where you started it.",
            );
          }
        } else if (response.ok) {
          const result = (await response.json()) as {
            ok: boolean;
            data?: { status: string; message?: string };
          };
          if (!disposed && result.ok && result.data) {
            setStatus(result.data.status);
            setMessage(result.data.message);
            terminal = result.data.status !== "running";
            if (terminal) window.dispatchEvent(new Event("growth:write"));
          }
        }
      } catch {
        /* Retry after a transient disconnect. */
      }
      if (!disposed && !terminal)
        timer = setTimeout(() => void poll(), document.hidden ? 30_000 : 3000);
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [runId]);
  return (
    <div
      className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm"
      role="status"
    >
      <p>
        {status === "running"
          ? "Working in the background…"
          : status === "completed"
            ? "Work completed"
            : status === "interrupted"
              ? "Work was interrupted"
              : status === "unavailable"
                ? "Result unavailable"
                : "Work failed"}
      </p>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
      {status !== "running" && status !== "unavailable" && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onPrompt(
              `Read operationRead__status for runId ${runId} and explain the saved result. Do not repeat the operation.`,
            )
          }
        >
          Review result
        </Button>
      )}
    </div>
  );
}
