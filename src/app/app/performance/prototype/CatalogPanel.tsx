"use client";

import { CatalogCards } from "../brands/[brandSlug]/ads/CatalogCards";

import type { WorkspaceHome } from "./ClientWorkspace";

/**
 * The real catalog: the same production `CatalogCards` the Ads tab renders,
 * every card a live composition and the Meta CSV/XML the real feed export.
 */
export function CatalogPanel({
  brandId,
  homes,
}: {
  brandId: string;
  homes: WorkspaceHome[];
}) {
  if (homes.length === 0) {
    return (
      <p className="rounded-xl border bg-card p-6 text-center text-xs text-muted-foreground">
        No homes with a photo on this brand&apos;s feed yet.
      </p>
    );
  }
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <CatalogCards brandId={brandId} homes={homes} />
    </div>
  );
}
