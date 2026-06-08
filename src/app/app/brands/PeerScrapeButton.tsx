"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";

type ScrapePlatform = "instagram" | "facebook" | "linkedin" | "x";

const SUPPORTED: ScrapePlatform[] = ["instagram", "facebook", "linkedin", "x"];

function isSupported(p: string): p is ScrapePlatform {
  return (SUPPORTED as string[]).includes(p);
}

/**
 * Scrape a peer brand's recent posts (≤30 days) across its supported channels,
 * one platform per request (LinkedIn/FB are async and slow). Idempotent on the
 * server — safe to re-run. Refreshes so new posts appear in Feed/Calendar.
 */
export function PeerScrapeButton({
  brandId,
  channels,
}: {
  brandId: string;
  channels: { platform: string; profileUrl: string | null }[];
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [running, setRunning] = useState(false);

  const scrape = useMutation(trpc.channelSuggestion.scrapePosts.mutationOptions());

  // Only channels we have a mapper for AND a page link to scrape.
  const targets = channels.filter(
    (c) => isSupported(c.platform) && c.profileUrl,
  );
  if (targets.length === 0) return null;

  async function run() {
    setRunning(true);
    let inserted = 0;
    let skipped = 0;
    const failed: string[] = [];
    for (const c of targets) {
      try {
        const r = await scrape.mutateAsync({
          brandId,
          platform: c.platform as ScrapePlatform,
        });
        inserted += r.inserted;
        skipped += r.skippedExisting;
      } catch (e) {
        failed.push(c.platform);
        console.error(`scrape ${c.platform} failed`, e);
      }
    }
    setRunning(false);
    if (inserted > 0 || skipped > 0) {
      toast.success(
        `Scraped ${targets.length - failed.length}/${targets.length} channels · ${inserted} new, ${skipped} already had`,
      );
      router.refresh();
    }
    if (failed.length) {
      toast.error(`Couldn't scrape: ${failed.join(", ")}`);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground gap-1.5"
      onClick={run}
      loading={running}
    >
      <Download className="size-3.5" />
      {running ? "Scraping…" : "Scrape posts"}
    </Button>
  );
}
