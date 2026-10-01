"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { BrandingPanel } from "@/components/brand/BrandingPanel";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { BrandIdentity } from "@/server/db/brand-schema";
import { orpc } from "@/orpc/client";

/** What the site says the brand looks like, and a button to read it again. */
export function BrandBrandingCard({
  brandId,
  logo,
  identity,
  website,
}: {
  brandId: string;
  logo: string | null;
  identity: BrandIdentity | null;
  website: string | null;
}) {
  const router = useRouter();
  const enrich = useMutation(
    orpc.brand.enrich.mutationOptions({
      onSuccess: () => {
        toast.success("Branding refreshed from the site");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-col items-start justify-between gap-3 @lg:flex-row">
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <h2 className="text-base font-semibold">Branding</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {identity?.extractedAt
              ? `Read from ${website ?? "the site"} on ${new Date(identity.extractedAt).toLocaleDateString()}. Compositions start from these.`
              : website
                ? "Not read yet. Re-enrich scrapes the site's logo, colours, fonts and tone."
                : "Add a website to read branding from."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!website || enrich.isPending}
          onClick={() => enrich.mutate({ brandId })}
        >
          <RefreshCw
            className={`mr-1.5 size-3.5 ${enrich.isPending ? "animate-spin" : ""}`}
          />
          {enrich.isPending ? "Reading site…" : "Re-enrich"}
        </Button>
      </div>
      <BrandingPanel identity={identity} logo={logo} />
    </section>
  );
}
