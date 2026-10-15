"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function DownloadCampaignAds({ campaignId }: { campaignId: string }) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/performance/campaigns/${campaignId}/export`,
      );
      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        throw new Error(error.error ?? "Could not download campaign ads");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? "campaign-ads.zip";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not download campaign ads",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() => void download()}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Download className="size-3.5" />
      )}
      {busy ? "Preparing download…" : "Download ads"}
    </Button>
  );
}
