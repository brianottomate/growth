"use client";
import { useState } from "react";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EmailClientPreview } from "@/lib/email-client-preview";
import { EmailPreviewFrame } from "@/app/app/newsletters/[id]/EmailPreviewFrame";

export function EmailClientReview({
  preview,
  printUrl,
}: {
  preview: EmailClientPreview;
  printUrl: string;
}) {
  const [index, setIndex] = useState(0),
    edition = preview.editions[index]!;
  return (
    <main
      data-theme="light"
      className="min-h-screen bg-background text-foreground"
    >
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <p className="text-xs tracking-widest text-muted-foreground uppercase">
              Email creative review
            </p>
            <h1 className="mt-1 text-xl font-semibold">{preview.brandName}</h1>
          </div>
          <Button asChild variant="outline">
            <a href={printUrl} target="_blank" rel="noreferrer">
              <Download className="size-4" />
              Save all as PDF
            </a>
          </Button>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 p-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div>
            <h2 className="font-semibold">
              {preview.editions.length}{" "}
              {preview.editions.length === 1 ? "email" : "emails"} to review
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              This link reflects the latest saved creative. Dates are tentative
              plans. This preview does not approve or schedule delivery.
            </p>
          </div>
          <nav aria-label="Email editions" className="space-y-2">
            {preview.editions.map((item, i) => (
              <button
                key={item.id}
                type="button"
                aria-current={index === i ? "true" : undefined}
                onClick={() => setIndex(i)}
                className="w-full space-y-2 rounded-xl border p-3 text-left aria-current:border-foreground aria-current:bg-muted"
              >
                <span className="block text-xs text-muted-foreground">
                  Email {i + 1} · {item.series ?? "Broadcast"}
                </span>
                <span className="block text-sm font-medium">
                  {item.subject || "Untitled email"}
                </span>
                {item.plannedAt && (
                  <span className="block text-xs text-muted-foreground">
                    Tentative ·{" "}
                    {new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      timeZone: "UTC",
                    }).format(new Date(item.plannedAt))}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <p className="text-xs text-muted-foreground">
            Link expires {new Date(preview.expiresAt).toLocaleDateString()}.
          </p>
        </aside>
        <section className="min-w-0 space-y-4" aria-label="Selected email">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Email {index + 1} of {preview.editions.length}
            </span>
            <div className="flex gap-2">
              <Button
                aria-label="Previous email"
                size="icon-sm"
                variant="outline"
                disabled={!index}
                onClick={() => setIndex((i) => i - 1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                aria-label="Next email"
                size="icon-sm"
                variant="outline"
                disabled={index === preview.editions.length - 1}
                onClick={() => setIndex((i) => i + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border">
            <div className="space-y-2 border-b p-4">
              <p className="text-xs text-muted-foreground">Subject</p>
              <h2 className="text-lg font-semibold">
                {edition.subject || "Untitled email"}
              </h2>
              {edition.preheader && (
                <p className="text-sm text-muted-foreground">
                  {edition.preheader}
                </p>
              )}
            </div>
            <EmailPreviewFrame key={edition.id} html={edition.html} />
          </div>
        </section>
      </div>
    </main>
  );
}
