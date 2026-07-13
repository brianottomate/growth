"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";

type ScrapePlatform = "instagram" | "facebook" | "linkedin" | "x";

const SUPPORTED: ScrapePlatform[] = ["instagram", "facebook", "linkedin", "x"];

function isSupported(p: string): p is ScrapePlatform {
  return (SUPPORTED as string[]).includes(p);
}

/**
 * Scrape a peer brand's recent posts across its supported channels. One month
 * is the manual default; the only wider option is three months. This is not a
 * daily refresh. One platform per request (LinkedIn/FB are async and slow).
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
  const [runningDays, setRunningDays] = useState<number | null>(null);

  const scrape = useMutation(
    trpc.channelSuggestion.scrapePosts.mutationOptions(),
  );

  // Only channels we have a mapper for AND a page link to scrape.
  const targets = channels.filter(
    (c) => isSupported(c.platform) && c.profileUrl,
  );
  if (targets.length === 0) return null;

  async function run(sinceDays: number) {
    setRunningDays(sinceDays);
    let inserted = 0;
    let refreshed = 0;
    const failed: string[] = [];
    for (const c of targets) {
      try {
        const r = await scrape.mutateAsync({
          brandId,
          platform: c.platform as ScrapePlatform,
          sinceDays,
        });
        inserted += r.inserted;
        refreshed += r.updatedExisting;
      } catch (e) {
        failed.push(c.platform);
        console.error(`scrape ${c.platform} failed`, e);
      }
    }
    setRunningDays(null);
    if (inserted > 0 || refreshed > 0) {
      toast.success(
        `Scraped ${targets.length - failed.length}/${targets.length} channels · ${inserted} new, ${refreshed} refreshed`,
      );
      router.refresh();
    }
    if (failed.length) {
      toast.error(`Couldn't scrape: ${failed.join(", ")}`);
    }
  }

  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground gap-1.5 rounded-r-none"
        onClick={() => run(30)}
        loading={runningDays !== null}
      >
        <Download className="size-3.5" />
        {runningDays
          ? `Scraping ${runningDays === 30 ? "month" : "3 months"}…`
          : "Scrape posts"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground rounded-l-none"
            disabled={runningDays !== null}
            aria-label="Choose scrape history window"
          >
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => run(30)}>
            Last month
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => run(90)}>
            Last 3 months
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
