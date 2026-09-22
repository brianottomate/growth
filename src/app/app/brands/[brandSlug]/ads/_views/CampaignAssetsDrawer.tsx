"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export function CampaignAssetsDrawer({
  count,
  brandId,
  children,
}: {
  count: number;
  brandId: string;
  children: ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" shape="round" density="editorial">
          Assets · {count}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Campaign assets · {count}</SheetTitle>
          <SheetDescription>
            Browse and manage the media available to this campaign.
          </SheetDescription>
          <Link
            className="text-sm underline"
            href={`/app/media?brand=${encodeURIComponent(brandId)}`}
          >
            Open in media library
          </Link>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
