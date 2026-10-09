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
import { orpc } from "@/orpc/client";

type ScrapePlatform = "instagram" | "facebook" | "linkedin" | "x";

const SUPPORTED: ScrapePlatform[] = ["instagram", "facebook", "linkedin", "x"];

function isSupported(p: string): p is ScrapePlatform {
  return (SUPPORTED as string[]).includes(p);
}

/** Import a bounded sample from each configured social profile. */
export function PeerScrapeButton({
  brandId,
  channels,
}: {
  brandId: string;
  channels: { platform: string; profileUrl: string | null }[];
}) {
  const router = useRouter();
  const [runningDays, setRunningDays] = useState<string | null>(null);

  const scrape = useMutation(
    orpc.channelSuggestion.scrapePosts.mutationOptions(),
  );

  // Only channels we have a mapper for AND a page link to scrape.
  const targets = channels.filter(
    (c) => isSupported(c.platform) && c.profileUrl,
  );
  if (targets.length === 0) return null;

  async function run(limit: number, sinceDays: number | null = null) {
    setRunningDays(sinceDays ? `${sinceDays} days` : `latest ${limit}`);
    let inserted = 0;
    let refreshed = 0;
    const failed: string[] = [];
    for (const c of targets) {
      try {
        const r = await scrape.mutateAsync({
          brandId,
          platform: c.platform as ScrapePlatform,
          sinceDays,
          limit,
          classifyPosts: false,
        });
        inserted += r.inserted;
        refreshed += r.updatedExisting;
      } catch (e) {
        failed.push(c.platform);
        console.error(`scrape ${c.platform} failed`, e);
      }
    }
    setRunningDays(null);
    if (failed.length < targets.length) {
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
        tone="muted"
        shape="attached-left"
        onClick={() => run(10)}
        loading={runningDays !== null}
      >
        <Download className="size-3.5" />
        {runningDays ? `Importing ${runningDays}…` : "Import latest 10"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            tone="muted"
            shape="attached-right"
            disabled={runningDays !== null}
            aria-label="Choose import sample"
          >
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => run(5)}>
            Latest 5 posts per channel
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => run(10)}>
            Latest 10 posts per channel
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => run(30, 30)}>
            Last month
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => run(100, 90)}>
            Last 3 months
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
