import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  Map,
  MonitorSmartphone,
  Store,
} from "lucide-react";

import type { RouterOutputs } from "@/trpc/react";

type ProductList = RouterOutputs["productStorefront"]["listProducts"];

export function ProductAtlasIndex({ products }: { products: ProductList }) {
  return (
    <main className="space-y-8">
      <header>
        <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
          Brand map · product truth
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Product Atlas
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          Connect the jobs people hire a product for to its journeys, stories,
          views, implementation references, and distribution storefronts.
        </p>
      </header>

      {products.length === 0 ? (
        <div className="bg-muted/30 rounded-2xl border border-dashed p-10 text-center">
          <Map className="text-muted-foreground mx-auto size-7" />
          <h2 className="mt-3 font-semibold">No products mapped yet</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Create the first product through Growth MCP or run the idempotent
            product/storefront seed.
          </p>
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {products.map((product) => (
            <Link
              key={product.id}
              href={`/app/product-atlas/${product.id}`}
              className="bg-card group hover:border-foreground/25 rounded-2xl border p-5 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-muted-foreground text-xs">
                    {product.brand.name}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">{product.name}</h2>
                  <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">
                    {product.description || "No product summary yet."}
                  </p>
                </div>
                <ArrowRight className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                <AtlasFact
                  icon={BriefcaseBusiness}
                  value={product.atlas.jobs.length}
                  label="jobs"
                />
                <AtlasFact
                  icon={MonitorSmartphone}
                  value={product.atlas.views.length}
                  label="views"
                />
                <AtlasFact
                  icon={Store}
                  value={product.storefronts.length}
                  label="storefronts"
                />
              </div>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}

function AtlasFact({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Store;
  value: number;
  label: string;
}) {
  return (
    <div className="bg-muted/40 rounded-xl px-3 py-2">
      <Icon className="text-muted-foreground size-3.5" />
      <p className="mt-2 text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground text-[10px] uppercase">{label}</p>
    </div>
  );
}
