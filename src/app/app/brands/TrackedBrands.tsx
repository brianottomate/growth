"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { useTRPC } from "@/trpc/react";

export type TrackedLite = {
  inspirationId: string;
  id: string;
  name: string;
  purpose: string;
};

const PURPOSES = [
  { value: "competitor", label: "Competitor" },
  { value: "inspiration", label: "Inspiration" },
];

function PurposeTag({ purpose }: { purpose: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
        purpose === "competitor"
          ? "bg-amber-500/10 text-amber-500"
          : "bg-sky-500/10 text-sky-400"
      }`}
    >
      {purpose}
    </span>
  );
}

export function TrackedBrands({
  ownerBrandId,
  tracked,
}: {
  ownerBrandId: string;
  tracked: TrackedLite[];
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [purpose, setPurpose] = useState("competitor");
  const [referenceType, setReferenceType] = useState("company");
  type TrackedPlatform =
    | "linkedin"
    | "instagram"
    | "x"
    | "facebook"
    | "youtube"
    | "tiktok";
  const [platform, setPlatform] = useState<TrackedPlatform>("linkedin");
  const [profileUrl, setProfileUrl] = useState("");

  const refresh = () => router.refresh();
  const createM = useMutation(
    trpc.brand.create.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        setName("");
        setWebsite("");
        setPurpose("competitor");
        setReferenceType("company");
        setPlatform("linkedin");
        setProfileUrl("");
        refresh();
      },
    }),
  );
  const untrackM = useMutation(
    trpc.brand.untrack.mutationOptions({ onSuccess: refresh }),
  );

  const save = () =>
    createM.mutate({
      name,
      scope: "reference",
      ownerBrandId,
      purpose: purpose as never,
      referenceType: referenceType as "company" | "personal",
      website: website || undefined,
      profile: profileUrl.trim()
        ? { platform, url: profileUrl.trim() }
        : undefined,
    });

  return (
    <div className="mt-4 border-t pt-4">
      <div className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wide uppercase">
        Tracking · {tracked.length}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {tracked.map((t) => (
          <div
            key={t.inspirationId}
            className="group hover:bg-accent flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors"
          >
            <Link
              href={`#tracked-brand-${t.id}`}
              className="flex items-center gap-2"
              title={`Jump to ${t.name}`}
            >
              <span className="bg-muted flex size-5 items-center justify-center rounded text-[10px] font-semibold">
                {t.name.slice(0, 2)}
              </span>
              <span className="text-xs font-medium">{t.name}</span>
              <PurposeTag purpose={t.purpose} />
            </Link>
            <button
              onClick={() =>
                untrackM.mutate({ inspirationId: t.inspirationId })
              }
              disabled={untrackM.isPending}
              title="Stop tracking"
              className="text-muted-foreground hover:text-foreground opacity-0 transition-opacity group-hover:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}

        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground gap-1.5"
          onClick={() => setOpen(true)}
        >
          <Plus className="size-3.5" />
          Add tracked brand
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add tracked brand</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Airbnb"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Brand type</Label>
              <Select value={referenceType} onValueChange={setReferenceType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Company</SelectItem>
                  <SelectItem value="personal">Personal brand</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Purpose</Label>
              <Select value={purpose} onValueChange={setPurpose}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PURPOSES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Public profile</Label>
              <div className="flex gap-2">
                <Select
                  value={platform}
                  onValueChange={(value) =>
                    setPlatform(value as TrackedPlatform)
                  }
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="x">X</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={profileUrl}
                  onChange={(e) => setProfileUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/…"
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Optional — saves the exact public profile immediately, without
                discovery.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Website</Label>
              <Input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="airbnb.com"
              />
              <p className="text-muted-foreground text-xs">
                Optional — we&apos;ll auto-fill details from the site.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={createM.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={save}
              loading={createM.isPending}
              disabled={!name.trim()}
            >
              Track
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
