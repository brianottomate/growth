"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  GitCompareArrows,
  LoaderCircle,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { useTRPC, type RouterOutputs } from "@/trpc/react";

type Reference = RouterOutputs["productStorefront"]["listReferences"][number];

export function StorefrontReferences({
  storefrontId,
}: {
  storefrontId: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const referenceBrandsOptions =
    trpc.productStorefront.listReferenceBrands.queryOptions({
      storefrontId,
    });
  const referencesOptions = trpc.productStorefront.listReferences.queryOptions({
    storefrontId,
  });
  const referenceBrandsQuery = useQuery(referenceBrandsOptions);
  const referencesQuery = useQuery(referencesOptions);
  const brands = useMemo(
    () => referenceBrandsQuery.data ?? [],
    [referenceBrandsQuery.data],
  );
  const references = referencesQuery.data ?? [];

  const [referenceBrandId, setReferenceBrandId] = useState("");
  const [purpose, setPurpose] = useState<"competitor" | "inspiration">(
    "competitor",
  );
  const [sourceUrl, setSourceUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [steer, setSteer] = useState("");

  useEffect(() => {
    if (referenceBrandId || !brands[0]) return;
    setReferenceBrandId(brands[0].id);
    setPurpose(brands[0].purpose);
  }, [brands, referenceBrandId]);

  const selectedBrand = useMemo(
    () => brands.find((brand) => brand.id === referenceBrandId),
    [brands, referenceBrandId],
  );

  const invalidateReferences = () =>
    queryClient.invalidateQueries({ queryKey: referencesOptions.queryKey });

  const captureMutation = useMutation(
    trpc.productStorefront.captureReference.mutationOptions({
      onSuccess: async () => {
        await invalidateReferences();
        setSourceUrl("");
        setNotes("");
        setSteer("");
        toast.success("Reference snapshot captured");
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const removeMutation = useMutation(
    trpc.productStorefront.removeReference.mutationOptions({
      onSuccess: async () => {
        await invalidateReferences();
        toast.success("Reference snapshot removed");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <section className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <GitCompareArrows className="size-4" />
        </div>
        <div>
          <h2 className="font-semibold">Storefront references</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Capture a public competitor or inspiration listing as a
            point-in-time snapshot. Growth keeps the source evidence, observed
            time, and a structured comparison without changing your target
            storefront.
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold">Capture a public listing</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            AI reads the URL once and saves a bounded snapshot. Capture it again
            later to preserve how the listing changed over time.
          </p>
        </div>

        {referenceBrandsQuery.isLoading ? (
          <p className="text-xs text-muted-foreground">
            Loading tracked brands...
          </p>
        ) : brands.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-xs">
            <p>
              No competitor or inspiration brands are tracked for this product.
            </p>
            <Link
              href="/app/brands"
              className="mt-2 inline-block font-medium text-primary"
            >
              Add one in Brands
            </Link>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs">
                <span className="mb-1 block text-muted-foreground">Brand</span>
                <select
                  value={referenceBrandId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    setReferenceBrandId(nextId);
                    const brand = brands.find((item) => item.id === nextId);
                    if (brand) setPurpose(brand.purpose);
                  }}
                  className="w-full rounded-lg border bg-background px-3 py-2"
                >
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-muted-foreground">
                  Purpose
                </span>
                <select
                  value={purpose}
                  onChange={(event) =>
                    setPurpose(event.target.value as typeof purpose)
                  }
                  className="w-full rounded-lg border bg-background px-3 py-2"
                >
                  <option value="competitor">Competitor</option>
                  <option value="inspiration">Inspiration</option>
                </select>
              </label>
            </div>
            <label className="block text-xs">
              <span className="mb-1 block text-muted-foreground">
                Public storefront URL
              </span>
              <input
                type="url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://chromewebstore.google.com/detail/..."
                className="w-full rounded-lg border bg-background px-3 py-2"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs">
                <span className="mb-1 block text-muted-foreground">
                  Internal note (optional)
                </span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Why this listing matters to us."
                  className="min-h-20 w-full rounded-lg border bg-background px-3 py-2"
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-muted-foreground">
                  AI guidance (optional)
                </span>
                <textarea
                  value={steer}
                  onChange={(event) => setSteer(event.target.value)}
                  placeholder="Focus on screenshot sequencing and the opening line."
                  className="min-h-20 w-full rounded-lg border bg-background px-3 py-2"
                />
              </label>
            </div>
            <button
              onClick={() => {
                if (!selectedBrand)
                  return toast.error("Choose a reference brand");
                if (!sourceUrl.trim()) return toast.error("Add a public URL");
                captureMutation.mutate({
                  storefrontId,
                  referenceBrandId: selectedBrand.id,
                  purpose,
                  sourceUrl: sourceUrl.trim(),
                  notes: notes.trim() || undefined,
                  steer: steer.trim() || undefined,
                });
              }}
              disabled={captureMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
            >
              {captureMutation.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Capture snapshot
            </button>
          </>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Saved snapshots</h3>
          <span className="text-xs text-muted-foreground">
            {references.length} total
          </span>
        </div>
        {referencesQuery.isLoading ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Loading snapshots...
          </p>
        ) : referencesQuery.error ? (
          <p className="rounded-xl border p-4 text-xs text-destructive">
            {referencesQuery.error.message}
          </p>
        ) : references.length === 0 ? (
          <p className="rounded-xl border border-dashed py-10 text-center text-xs text-muted-foreground">
            No snapshots yet.
          </p>
        ) : (
          references.map((reference) => (
            <ReferenceCard
              key={reference.id}
              reference={reference}
              removing={
                removeMutation.isPending &&
                removeMutation.variables?.referenceId === reference.id
              }
              onRemove={() => {
                if (
                  window.confirm(
                    `Remove the ${reference.referenceBrand.name} snapshot from ${new Date(reference.observedAt).toLocaleString()}?`,
                  )
                ) {
                  removeMutation.mutate({ referenceId: reference.id });
                }
              }}
            />
          ))
        )}
      </div>
    </section>
  );
}

function ReferenceCard({
  reference,
  removing,
  onRemove,
}: {
  reference: Reference;
  removing: boolean;
  onRemove: () => void;
}) {
  const snapshot = reference.snapshot;
  return (
    <article className="space-y-5 rounded-xl border bg-card p-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold">{reference.referenceBrand.name}</h4>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] capitalize">
              {reference.purpose}
            </span>
          </div>
          <p className="mt-1 text-sm">{reference.name}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Observed {new Date(reference.observedAt).toLocaleString()} via{" "}
            {reference.sourceProvider ?? reference.captureMethod}
            {reference.model ? ` · ${reference.model}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={reference.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs"
          >
            Source <ExternalLink className="size-3" />
          </a>
          <button
            onClick={onRemove}
            disabled={removing}
            aria-label="Remove snapshot"
            className="rounded-lg border p-2 text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            {removing ? (
              <LoaderCircle className="size-3 animate-spin" />
            ) : (
              <Trash2 className="size-3" />
            )}
          </button>
        </div>
      </header>

      {(snapshot.listing.openingLine || snapshot.listing.summary) && (
        <div className="rounded-lg border p-3">
          {snapshot.listing.openingLine && (
            <p className="text-sm font-medium">
              {snapshot.listing.openingLine}
            </p>
          )}
          {snapshot.listing.summary && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {snapshot.listing.summary}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <ReferenceList title="Strengths" items={snapshot.strengths} />
        <ReferenceList title="Gaps" items={snapshot.gaps} />
        <ReferenceList
          title="Patterns to borrow"
          items={snapshot.patternsToBorrow}
        />
      </div>

      {snapshot.imageSequence.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold">Image sequence</h5>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {snapshot.imageSequence.map((image) => (
              <div
                key={`${image.position}-${image.caption}`}
                className="rounded-lg border p-3"
              >
                <p className="text-xs font-medium">
                  {image.position}. {image.caption || "Untitled image"}
                </p>
                {image.purpose && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {image.purpose}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {snapshot.contrasts.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold">
            Compared with our storefront
          </h5>
          <div className="mt-2 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-3 py-2 font-medium">Dimension</th>
                  <th className="px-3 py-2 font-medium">Reference</th>
                  <th className="px-3 py-2 font-medium">Ours</th>
                  <th className="px-3 py-2 font-medium">Takeaway</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.contrasts.map((contrast) => (
                  <tr
                    key={`${contrast.dimension}-${contrast.takeaway}`}
                    className="border-t align-top"
                  >
                    <td className="px-3 py-2 font-medium">
                      {contrast.dimension}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {contrast.referenceObservation}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {contrast.targetObservation}
                    </td>
                    <td className="px-3 py-2">{contrast.takeaway}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reference.notes && (
        <p className="border-t pt-3 text-xs text-muted-foreground">
          Note: {reference.notes}
        </p>
      )}
    </article>
  );
}

function ReferenceList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h5 className="text-xs font-semibold">{title}</h5>
      {items.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">None observed.</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden>•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
