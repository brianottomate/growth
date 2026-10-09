"use client";

import { useState } from "react";
import Link from "next/link";
import {
  NEWSLETTER_TEMPLATES,
  RECIPE_CONTEXT_LABELS,
  type NewsletterTemplateId,
} from "@/lib/newsletter-templates";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NewsletterTemplateStart } from "../NewsletterTemplateStart";

const categories = [
  ...new Set(NEWSLETTER_TEMPLATES.map((item) => item.category)),
];

function StructurePreview({ parts }: { parts: readonly string[] }) {
  return (
    <div
      className="mx-auto w-full max-w-64 space-y-3 rounded-lg border bg-background p-5 shadow-sm"
      aria-label="Template structure"
    >
      {parts.map((part, index) => (
        <div
          key={`${index}-${part}`}
          className={
            index === 0
              ? "border-b pb-3 text-xs font-semibold"
              : part.toLowerCase().includes("home")
                ? "rounded-md border bg-muted/40 p-5 text-center text-xs"
                : part === "Action" || part === "Button"
                  ? "rounded-md bg-foreground px-3 py-2 text-center text-xs text-background"
                  : "text-xs text-muted-foreground"
          }
        >
          {part}
        </div>
      ))}
    </div>
  );
}

export function TemplateWall({
  brandId,
  referenceCopy,
}: {
  brandId?: string;
  referenceCopy: Record<string, string>;
}) {
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<NewsletterTemplateId | null>(null);
  const chosen = NEWSLETTER_TEMPLATES.find((item) => item.id === selected);
  const templates = NEWSLETTER_TEMPLATES.filter(
    (item) =>
      (category === "All" || item.category === category) &&
      `${item.label} ${item.summary} ${item.category}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/newsletters" className="text-sm text-muted-foreground">
          ← Emails
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">Email template library</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Shared recipes for every brand. Explore the structure, then draft with
          your brand’s styling, homes and verified facts.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Search templates"
          placeholder="Search templates…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-xs"
        />
        {["All", ...categories].map((value) => (
          <Button
            key={value}
            size="sm"
            variant={category === value ? "secondary" : "ghost"}
            aria-pressed={category === value}
            onClick={() => setCategory(value)}
          >
            {value}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {templates.length} templates · Structure previews; final email design
        follows the selected brand.
      </p>
      <div className="grid grid-cols-1 gap-5 @xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4">
        {templates.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => setSelected(item.id)}
            className="overflow-hidden rounded-xl border text-left transition-colors hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex h-80 items-start overflow-hidden bg-muted/40 p-5">
              <StructurePreview parts={item.structure} />
            </div>
            <div className="space-y-2 border-t p-4">
              <p className="text-xs text-muted-foreground">{item.category}</p>
              <h2 className="font-medium">{item.label}</h2>
              <p className="text-sm text-muted-foreground">{item.summary}</p>
              {item.requiredContext.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {item.requiredContext.length} required{" "}
                  {item.requiredContext.length === 1 ? "fact" : "facts"}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
      {!templates.length && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No templates match. Try another search or category.
        </p>
      )}
      <Dialog
        open={!!chosen}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          {chosen && (
            <>
              <DialogHeader>
                <DialogTitle>{chosen.label}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="rounded-xl bg-muted/40 p-5">
                  <StructurePreview parts={chosen.structure} />
                </div>
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    {chosen.category}
                  </p>
                  <p>{chosen.summary}</p>
                  {"trigger" in chosen && (
                    <div>
                      <h3 className="text-sm font-medium">When to use it</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {chosen.trigger}
                      </p>
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm font-medium">Facts needed</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {chosen.requiredContext.length
                        ? chosen.requiredContext
                            .map((key) => RECIPE_CONTEXT_LABELS[key] ?? key)
                            .join(", ")
                        : "Brand context; no additional guest or reservation facts required."}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This shows the recipe’s structure. Creating a draft adapts
                    it to the brand; selecting a template does not activate
                    delivery.
                  </p>
                  {brandId ? (
                    <NewsletterTemplateStart
                      key={chosen.id}
                      brandId={brandId}
                      initialTemplate={chosen.id}
                    />
                  ) : (
                    <Button variant="outline" asChild>
                      <Link href="/app/performance/clients">
                        Choose a client to draft for
                      </Link>
                    </Button>
                  )}
                  {referenceCopy[chosen.id] && (
                    <details className="rounded-lg border p-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        Inspect reference copy
                      </summary>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Illustrative source copy. Guest, home and booking
                        details are examples to replace with verified brand
                        facts.
                      </p>
                      <p className="mt-3 text-sm whitespace-pre-line">
                        {referenceCopy[chosen.id]}
                      </p>
                    </details>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
