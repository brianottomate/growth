"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";

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
import { orpc } from "@/orpc/client";

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

type TrackedPlatform =
  | "linkedin"
  | "instagram"
  | "x"
  | "facebook"
  | "youtube"
  | "tiktok";

/**
 * Peers this brand tracks, as one quiet footer line: names jump to the peer
 * card further down, "+ track a brand" opens the dialog.
 */
export function TrackedBrands({
  ownerBrandId,
  tracked,
}: {
  ownerBrandId: string;
  tracked: TrackedLite[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [purpose, setPurpose] = useState("competitor");
  const [referenceType, setReferenceType] = useState("company");
  const [platform, setPlatform] = useState<TrackedPlatform>("linkedin");
  const [profileUrl, setProfileUrl] = useState("");

  const refresh = () => router.refresh();
  const createM = useMutation(
    orpc.brand.create.mutationOptions({
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
    orpc.brand.untrack.mutationOptions({ onSuccess: refresh }),
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
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
      <span className="text-muted-foreground">Tracking · {tracked.length}</span>
      {tracked.map((t) => (
        <span
          key={t.inspirationId}
          className="group inline-flex items-center gap-1"
        >
          <Link
            href={`#tracked-brand-${t.id}`}
            className="font-medium text-foreground/80 hover:text-foreground"
            title={`${t.purpose} · jump to ${t.name}`}
          >
            {t.name}
          </Link>
          <button
            onClick={() => untrackM.mutate({ inspirationId: t.inspirationId })}
            disabled={untrackM.isPending}
            title="Stop tracking"
            className="text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-foreground pointer-coarse:opacity-100"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300"
      >
        + track a brand
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Track a brand</DialogTitle>
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
            <div className="grid grid-cols-2 gap-3">
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
              <p className="text-xs text-muted-foreground">
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
              <p className="text-xs text-muted-foreground">
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
