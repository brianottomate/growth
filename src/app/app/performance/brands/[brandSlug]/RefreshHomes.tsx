"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
export function RefreshHomes({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div>
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const response = await fetch(
              `/api/performance/catalog/${brandId}/studio`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "refresh" }),
              },
            );
            if (!response.ok) {
              const body = (await response.json()) as { error?: string };
              throw new Error(body.error ?? "Refresh failed");
            }
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Refresh failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Refreshing…" : "Refresh homes"}
      </Button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
