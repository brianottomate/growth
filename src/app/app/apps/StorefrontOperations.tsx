"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Store,
  TriangleAlert,
} from "lucide-react";

import {
  storefrontSurfaceIds,
  storefrontSurfaceRegistry,
  type StorefrontFreshnessStatus,
  type StorefrontSurfaceId,
} from "@/lib/product-atlas";
import { cn } from "@/lib/utils";
import type { RouterOutputs } from "@/orpc/client";

type Storefronts = RouterOutputs["productStorefront"]["listStorefronts"];

const freshnessMeta: Record<
  StorefrontFreshnessStatus,
  { label: string; icon: typeof Store; className: string }
> = {
  stale: {
    label: "Stale",
    icon: TriangleAlert,
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  },
  up_to_date: {
    label: "Up to date",
    icon: CheckCircle2,
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  },
  unknown: {
    label: "Unknown",
    icon: CircleDashed,
    className: "border-border bg-muted/50 text-muted-foreground",
  },
};

export function StorefrontOperations({
  storefronts,
}: {
  storefronts: Storefronts;
}) {
  const [surface, setSurface] = useState<StorefrontSurfaceId | "all">("all");
  const [productId, setProductId] = useState("all");
  const products = useMemo(
    () =>
      [
        ...new Map(
          storefronts.map((item) => [item.product.id, item.product]),
        ).values(),
      ].sort((a, b) => a.name.localeCompare(b.name)),
    [storefronts],
  );
  const visible = storefronts.filter(
    (item) =>
      (surface === "all" || item.surface === surface) &&
      (productId === "all" || item.productId === productId),
  );
  const stale = storefronts.filter((item) => item.freshnessStatus === "stale");
  const current = storefronts.filter(
    (item) => item.freshnessStatus === "up_to_date",
  );

  return (
    <main className="space-y-8">
      <header>
        <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Brand map · distribution operations
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Apps & storefronts
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Keep target copy and Media Library assets aligned with what is
          actually published in every app store, marketplace, and connector.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary value={storefronts.length} label="storefronts" icon={Store} />
        <Summary value={stale.length} label="stale" icon={TriangleAlert} />
        <Summary value={current.length} label="confirmed" icon={CheckCircle2} />
        <Summary
          value={storefronts.filter((item) => !item.managerUserId).length}
          label="unassigned"
          icon={Clock3}
        />
      </section>

      {stale.length > 0 && (
        <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5">
          <h2 className="font-semibold">Update queue</h2>
          <div className="mt-3 space-y-2">
            {stale.map((item) => (
              <Link
                key={item.id}
                href={`/app/apps/${item.id}`}
                className="flex items-center justify-between rounded-xl border bg-background p-3 hover:border-amber-500/40"
              >
                <div>
                  <p className="text-sm font-medium">
                    {item.product.name} ·{" "}
                    {storefrontSurfaceRegistry[item.surface].shortLabel}
                  </p>
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                    {item.staleNote}
                  </p>
                </div>
                <ArrowRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <select
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
            className="rounded-lg border bg-background px-3 py-2 text-xs"
          >
            <option value="all">All products</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
          <select
            value={surface}
            onChange={(event) =>
              setSurface(event.target.value as StorefrontSurfaceId | "all")
            }
            className="rounded-lg border bg-background px-3 py-2 text-xs"
          >
            <option value="all">All surfaces</option>
            {storefrontSurfaceIds.map((id) => (
              <option key={id} value={id}>
                {storefrontSurfaceRegistry[id].label}
              </option>
            ))}
          </select>
          <Link
            href="/app/apps/playbook"
            className="ml-auto rounded-lg border px-3 py-2 text-xs text-primary"
          >
            Field playbook
          </Link>
          <Link
            href="/app/product-atlas"
            className="rounded-lg border px-3 py-2 text-xs text-primary"
          >
            Product Atlas
          </Link>
        </div>

        {visible.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            No storefronts match this filter.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {visible.map((item) => {
              const meta = freshnessMeta[item.freshnessStatus];
              const Icon = meta.icon;
              return (
                <Link
                  key={item.id}
                  href={`/app/apps/${item.id}`}
                  className="rounded-2xl border bg-card p-5 hover:border-foreground/25"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {item.product.brand.name}
                      </p>
                      <h2 className="mt-1 font-semibold">
                        {item.product.name}
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {storefrontSurfaceRegistry[item.surface].label}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px]",
                        meta.className,
                      )}
                    >
                      <Icon className="size-3" /> {meta.label}
                    </span>
                  </div>
                  <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="capitalize">{item.listingStatus}</span>
                    <span>
                      {item.manager?.name ??
                        item.manager?.email ??
                        "No manager"}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function Summary({
  value,
  label,
  icon: Icon,
}: {
  value: number;
  label: string;
  icon: typeof Store;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <Icon className="size-4 text-muted-foreground" />
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
    </div>
  );
}
