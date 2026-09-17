"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BrandingPanel } from "@/components/brand/BrandingPanel";
import type { BrandIdentity } from "@/server/db/brand-schema";

/**
 * The brand's identity at the head of the Ads tab: the mark the creatives draw
 * from and what the site scrape read, folded away until wanted. Read-only here;
 * the mark itself is chosen on the brand page, which this links to.
 */
export function BrandProfile({
  brandSlug,
  logo,
  markUrl,
  identity,
  website,
}: {
  brandSlug: string;
  logo: string | null;
  /** The resolved brand mark (vector/PNG), or the logo when there is no mark. */
  markUrl: string | null;
  identity: BrandIdentity | null;
  website: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border px-4">
      <Accordion type="single" collapsible>
        <AccordionItem value="brand-profile" border="none">
          <AccordionTrigger appearance="compact">
            <span className="flex items-center gap-2.5">
              <span className="relative flex size-6 shrink-0 items-center justify-center overflow-hidden rounded bg-white p-0.5">
                {markUrl ? (
                  <>
                    {/* oxlint-disable-next-line nextjs/no-img-element */}
                    <img
                      src={markUrl}
                      alt=""
                      className="size-full object-contain"
                    />
                  </>
                ) : null}
              </span>
              <span className="text-sm font-medium">Brand profile</span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white p-1">
                    {markUrl ? (
                      <>
                        {/* oxlint-disable-next-line nextjs/no-img-element */}
                        <img
                          src={markUrl}
                          alt=""
                          className="size-full object-contain"
                        />
                      </>
                    ) : null}
                  </span>
                  <div className="text-[11px] leading-tight">
                    <div className="font-medium">Mark on creatives</div>
                    <div className="text-muted-foreground">
                      {markUrl
                        ? "Drawn from the brand mark"
                        : "No mark set — falls back to the logo"}
                    </div>
                  </div>
                </div>
                <Link
                  href={`/app/brands/${brandSlug}#brand-mark`}
                  className="shrink-0 text-[11.5px] text-sky-300 hover:underline"
                >
                  Edit mark
                </Link>
              </div>

              <BrandingPanel identity={identity} logo={logo} compact />

              {website ? (
                <a
                  href={website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  <ExternalLink className="size-3" />
                </a>
              ) : null}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
