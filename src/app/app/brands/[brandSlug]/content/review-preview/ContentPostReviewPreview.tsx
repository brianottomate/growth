"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ReviewPreview,
  type ReviewStatus,
} from "@/components/review/ReviewPreview";
import { BriefOverview } from "@/app/app/content/[contentId]/BriefOverview";

/** Brand content-post structure with one parent review and delivery-only platform variants. */
export function ContentPostReviewPreview({ brandSlug }: { brandSlug: string }) {
  const coastal = brandSlug === "30a-beach-stays";
  const name = coastal ? "30A Beach Stays" : "Hollyhock Suites";
  const [status, setStatus] = useState<ReviewStatus>("ready");
  const title = coastal
    ? "Slow mornings, Gulf evenings"
    : "A rooftop worth gathering for";
  const photo = coastal
    ? "https://assets.wander.com/681708550099042737/fullres.webp"
    : "https://assets.wander.com/611347388535146618/fullres.webp";
  const caption = coastal
    ? "A little more space. A little less rush. 🌊\n\nPoolside mornings at The Canopy on 30A, a seasonal tram to the Gulf, and room for everyone to find their own pace.\n\nSave this for your next family beach getaway."
    : "Your next Louisville weekend starts above the city. 🥃\n\nPrivate rooftop, room for the whole group, and downtown just outside your door. Save this for your next getaway.";
  return (
    <div className="@container space-y-5 p-6">
      <nav className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href={`/app/brands/${brandSlug}/content`}>{name} · Content</Link>
        <span>/</span>
        <span>Post preview</span>
      </nav>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {name} · Guest experiences ·{" "}
          {coastal ? "Coastal weekends" : "City weekends"}
        </p>
        <Badge variant="outline">
          Sample content post · Local review prototype
        </Badge>
      </header>
      <BriefOverview
        brief={{
          hook: coastal
            ? "The whole family, one easy beach weekend."
            : "Your downtown weekend starts on the rooftop.",
          captionDirection:
            "Lead with the experience. Keep the tone warm and specific; invite guests to save this for their next trip.",
          visualDirection:
            "Bright property photography. Start with the gathering space, then show the pool and the bedrooms.",
          ctaText: "Save for your next getaway",
          ctaKeyword: null,
          kpi: "Saves and direct-booking visits",
        }}
        plannedAt={new Date("2026-10-09T15:00:00Z")}
      />
      <section
        aria-label="Content post review"
        className="space-y-3 rounded-xl border bg-card p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Content post review</h2>
          <select
            aria-label="Simulated content review state"
            className="rounded-md border bg-background px-2 py-1 text-xs"
            value={status}
            onChange={(event) => setStatus(event.target.value as ReviewStatus)}
          >
            <option value="draft">Draft example</option>
            <option value="ready">Ready example</option>
            <option value="approved">Approved example</option>
          </select>
        </div>
        <p className="text-xs text-muted-foreground">
          One sign-off covers the brief and the platform variants below.
          Publishing and scheduling remain separate.
        </p>
        <ReviewPreview key={status} initialStatus={status} />
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            Platform posts <span className="text-muted-foreground">3</span>
          </h2>
          <span className="text-xs text-muted-foreground">
            Delivery variants
          </span>
        </div>
        {[
          {
            platform: "Instagram",
            format: "Carousel · 4 slides",
            delivery: "Scheduled · Oct 9, 10:00 AM",
          },
          {
            platform: "Facebook",
            format: "Single image",
            delivery: "Unscheduled",
          },
          {
            platform: "Instagram",
            format: "Story · 3 frames",
            delivery: "Unscheduled",
          },
        ].map((post, index) => (
          <article
            key={index}
            className="overflow-hidden rounded-xl border bg-background"
          >
            <header className="flex flex-wrap items-start justify-between gap-2 p-4">
              <div>
                <h3 className="text-sm font-semibold">{post.platform}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {post.format} · @
                  {coastal ? "30abeachstays" : "hollyhocksuites"}
                </p>
              </div>
              <Badge variant="outline">{post.delivery}</Badge>
            </header>
            <img
              src={photo}
              alt={coastal ? "The Canopy on 30A" : "Hollyhock rooftop"}
              loading="lazy"
              className={`${index === 2 ? "aspect-[9/16] max-h-80" : "aspect-[4/3]"} w-full object-cover`}
            />
            <p className="p-4 text-sm leading-relaxed whitespace-pre-line">
              {index === 2
                ? "Your next getaway starts here.\nTap to explore your stay."
                : caption}
            </p>
            <footer className="flex justify-between border-t p-3 text-xs text-muted-foreground">
              <span>Reviewed with the content post</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  document
                    .querySelector('[aria-label="Content post review"]')
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                View review
              </Button>
            </footer>
          </article>
        ))}
      </section>
    </div>
  );
}
