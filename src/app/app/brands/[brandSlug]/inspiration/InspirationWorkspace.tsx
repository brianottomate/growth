"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, Camera, LayoutGrid, Plus, Scan, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

type Peer = {
  isOwn?: boolean;
  id: string;
  linkId: string;
  name: string;
  logo: string | null;
  description: string | null;
  website: string | null;
  purpose: "inspiration" | "competitor";
  instagram: string | null;
};

function instagramHandle(value: string): string | null {
  const input = value.trim();
  if (!input) return null;
  let handle = input.replace(/^@/, "");
  if (input.includes("/")) {
    try {
      const url = new URL(
        input.startsWith("http") ? input : `https://${input}`,
      );
      if (!["instagram.com", "www.instagram.com"].includes(url.hostname))
        return null;
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length !== 1) return null;
      handle = parts[0]!;
    } catch {
      return null;
    }
  }
  return /^[a-zA-Z0-9._]{1,30}$/.test(handle) &&
    !["p", "reel", "reels", "explore", "accounts"].includes(
      handle.toLowerCase(),
    )
    ? handle
    : null;
}

export function InspirationWorkspace({
  brandId,
  brandName,
  brands,
  ownBrand,
}: {
  brandId: string;
  brandName: string;
  brands: Peer[];
  ownBrand: Peer;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [profile, setProfile] = useState("");
  const [website, setWebsite] = useState("");
  const [purpose, setPurpose] = useState<Peer["purpose"]>("inspiration");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const create = useMutation(
    orpc.brand.create.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        setName("");
        setProfile("");
        setWebsite("");
        router.refresh();
        toast.success("Brand tracked");
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const remove = useMutation(
    orpc.brand.untrack.mutationOptions({
      onSuccess: () => {
        router.refresh();
        toast.success("Stopped tracking brand");
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const visible = [
    ownBrand,
    ...brands.filter(
      (brand) =>
        brand.id !== ownBrand.id &&
        (filter === "all" || brand.purpose === filter) &&
        `${brand.name} ${brand.instagram ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ),
  ];
  const handle = instagramHandle(profile);
  const header = (brand: Peer) => (
    <div className="flex items-center gap-3">
      {brand.logo ? (
        <Image
          src={brand.logo}
          width={40}
          height={40}
          unoptimized
          alt=""
          className="size-10 rounded-lg border object-contain"
        />
      ) : (
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-lg font-medium">
          {brand.name.slice(0, 1)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-semibold">{brand.name}</h2>
        <span className="text-xs text-muted-foreground">
          {brand.isOwn
            ? "Your brand"
            : brand.purpose === "competitor"
              ? "Competitor"
              : "Inspiration"}
        </span>
      </div>
    </div>
  );
  return (
    <div className="@container mx-auto w-full space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{brandName}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Inspiration & competitors
          </h1>
          <p className="text-sm text-muted-foreground">
            Keep the brands you learn from in view.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Track a brand
        </Button>
      </header>
      <Tabs defaultValue="brands" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="brands">
              <LayoutGrid />
              Brands · {brands.length + 1}
            </TabsTrigger>
            <TabsTrigger value="landscape">
              <Scan />
              Landscape
            </TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label="Search tracked brands"
              placeholder="Search brands…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-48"
            />
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-40" aria-label="Filter by purpose">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brands</SelectItem>
                <SelectItem value="inspiration">Inspiration</SelectItem>
                <SelectItem value="competitor">Competitors</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {visible.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-16 text-center">
            <Camera className="mx-auto mb-4 size-7 text-muted-foreground" />
            <h2 className="font-semibold">
              {brands.length
                ? "No matching brands"
                : "Build your reference collection"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {brands.length
                ? "Try another search or purpose."
                : "Track an inspiration or competitor brand to see it here and in Landscape."}
            </p>
            {!brands.length && (
              <Button
                variant="outline"
                className="mt-5"
                onClick={() => setOpen(true)}
              >
                Track your first brand
              </Button>
            )}
          </div>
        ) : (
          <>
            <TabsContent value="brands">
              <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
                {visible.map((brand) => (
                  <article
                    key={brand.linkId}
                    className="flex flex-col gap-4 rounded-xl border bg-card p-5"
                  >
                    {header(brand)}
                    <p className="line-clamp-3 min-h-10 text-sm text-muted-foreground">
                      {brand.description ??
                        "A reference for your next creative idea."}
                    </p>
                    <div className="mt-auto flex flex-wrap items-center gap-3 text-sm">
                      {brand.instagram && (
                        <a
                          href={brand.instagram}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 hover:underline"
                        >
                          <Camera className="size-4" />@
                          {instagramHandle(brand.instagram)}
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                      {brand.website && (
                        <a
                          href={
                            brand.website.startsWith("http")
                              ? brand.website
                              : `https://${brand.website}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:underline"
                        >
                          Website ↗
                        </a>
                      )}
                    </div>
                    {!brand.isOwn && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="self-start"
                        disabled={remove.isPending}
                        onClick={() =>
                          remove.mutate({ inspirationId: brand.linkId })
                        }
                      >
                        <X className="size-3.5" />
                        Stop tracking
                      </Button>
                    )}
                  </article>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="landscape" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Instagram profiles, side by side. Screenshot the references you
                like and paste them into chat. Public profiles must allow
                embeds.
              </p>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-5">
                {visible.map((brand) => {
                  const username = brand.instagram
                    ? instagramHandle(brand.instagram)
                    : null;
                  return (
                    <article
                      key={brand.linkId}
                      className="@container min-w-0 overflow-hidden rounded-xl border bg-card"
                    >
                      <div className="border-b p-4">{header(brand)}</div>
                      {username ? (
                        <>
                          <iframe
                            src={`https://www.instagram.com/${username}/embed/`}
                            title={`${brand.name} Instagram profile`}
                            loading="lazy"
                            className="block h-[calc(66.6667cqw+160px)] w-full border-0 bg-white"
                          />
                        </>
                      ) : (
                        <div className="flex h-64 flex-col items-center justify-center gap-2 p-5 text-center text-sm text-muted-foreground">
                          <Camera className="size-6" />
                          <p>No Instagram profile saved for this brand.</p>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </TabsContent>
          </>
        )}
      </Tabs>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Track a brand</DialogTitle>
            <DialogDescription>
              Add a reference for {brandName}. Instagram powers the Landscape
              view.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim() || !handle) return;
              create.mutate({
                name: name.trim(),
                scope: "reference",
                ownerBrandId: brandId,
                purpose,
                website: website.trim() || undefined,
                profile: {
                  platform: "instagram",
                  url: `https://www.instagram.com/${handle}/`,
                },
                enrich: false,
              });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="reference-name">Brand name</Label>
              <Input
                id="reference-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Airbnb"
                required
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference-instagram">
                Instagram handle or profile URL
              </Label>
              <Input
                id="reference-instagram"
                value={profile}
                onChange={(event) => setProfile(event.target.value)}
                placeholder="@airbnb"
                required
                aria-invalid={!!profile && !handle}
              />
              {profile && !handle && (
                <p className="text-sm text-muted-foreground">
                  Enter an Instagram handle or profile URL.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference-purpose">Purpose</Label>
              <Select
                value={purpose}
                onValueChange={(value) => setPurpose(value as Peer["purpose"])}
              >
                <SelectTrigger id="reference-purpose">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inspiration">Inspiration</SelectItem>
                  <SelectItem value="competitor">Competitor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference-website">Website (optional)</Label>
              <Input
                id="reference-website"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="airbnb.com"
                maxLength={2000}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={create.isPending}
                disabled={!name.trim() || !handle}
              >
                Track brand
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
