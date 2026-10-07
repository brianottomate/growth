"use client";

import { useState } from "react";
import {
  GalleryHorizontalEnd,
  ImageIcon,
  Plus,
  Type,
  Video,
} from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { useWorkspaceMutation } from "../useWorkspaceMutation";
import { TextAdForm } from "@/app/app/brands/[brandSlug]/ads/_views/TextAdCard";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form } from "@/components/ui/form";
import { RadioGroupCardsField } from "@/components/ui/radio-group-cards-field";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { AD_FORMAT_LABEL, HAND_MADE_AD_FORMATS } from "@/lib/performance-ads";
import { safeHomeUrl } from "@/lib/ad-preview-links";
import { orpc } from "@/orpc/client";

type Format = (typeof HAND_MADE_AD_FORMATS)[number] | "text";

const FORMAT_ICONS = {
  static: ImageIcon,
  carousel: GalleryHorizontalEnd,
  video: Video,
  text: Type,
} satisfies Record<Format, typeof ImageIcon>;

/** Shared manual creation; home-aware authoring belongs in Ad Studio. */
export function AddAdDialog({
  brandId,
  website,
  campaignId = null,
}: {
  brandId: string;
  website: string | null;
  campaignId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const formatForm = useForm<{ format: Format }>({
    defaultValues: { format: "static" },
  });
  const format = useWatch({ control: formatForm.control, name: "format" });
  const [name, setName] = useState("");
  const [linkUrl, setLinkUrl] = useState(website ?? "");
  const add = useWorkspaceMutation(
    orpc.ads.addAdShell.mutationOptions({
      onSuccess: (result) => {
        toast.success(`${result.name} is ready for creative and copy.`);
        setOpen(false);
        setName("");
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  return (
    <SimpleDialog
      open={open}
      onOpenChange={(next) => {
        if (!add.isPending) setOpen(next);
      }}
      title="Create an ad"
      size={format === "text" ? "lg" : "default"}
      scrollable
      className="flex max-h-[90dvh] flex-col"
      trigger={
        <Button size="sm" variant="outline">
          <Plus className="size-3" />
          Create ad
        </Button>
      }
      footer={
        format !== "text" ? (
          <Button
            size="sm"
            loading={add.isPending}
            disabled={Boolean(linkUrl.trim()) && !safeHomeUrl(linkUrl.trim())}
            onClick={() => {
              add.mutate({
                brandId,
                format,
                campaignId: campaignId ?? undefined,
                name: name.trim() || undefined,
                linkUrl: linkUrl.trim() || undefined,
              });
            }}
          >
            Create ad
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <Form {...formatForm}>
          <RadioGroupCardsField
            control={formatForm.control}
            name="format"
            label="Format"
            gridCols={3}
            options={[...HAND_MADE_AD_FORMATS, "text" as const].map((value) => {
              const Icon = FORMAT_ICONS[value];
              return {
                value,
                label: value === "text" ? "Text" : AD_FORMAT_LABEL[value],
                icon: <Icon className="size-4" aria-hidden="true" />,
              };
            })}
          />
        </Form>
        {format === "text" ? (
          open && (
            <TextAdForm
              brandId={brandId}
              campaignId={campaignId}
              website={website}
              onSaved={() => setOpen(false)}
            />
          )
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="shell-name">Ad name (optional)</Label>
              <Input
                id="shell-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name this ad"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shell-url">Destination URL (optional)</Label>
              <Input
                id="shell-url"
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com/landing-page"
              />
              {linkUrl.trim() && !safeHomeUrl(linkUrl.trim()) ? (
                <p role="alert" className="text-xs text-destructive">
                  Use a valid HTTP or HTTPS URL.
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </SimpleDialog>
  );
}
