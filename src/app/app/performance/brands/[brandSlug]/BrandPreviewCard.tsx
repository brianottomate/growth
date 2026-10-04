"use client";

import { useState } from "react";
import type { BrandPreviewCopy } from "@/lib/brand-preview-copy";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import {
  BrandFontPicker,
  brandFonts,
  type BrandFonts,
} from "@/components/brand/BrandFontPicker";
import {
  BrandPreviewStrip,
  type PreviewHome,
} from "@/components/brand/BrandPreviewStrip";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import type { BrandIdentity } from "@/server/db/brand-schema";
import { orpc } from "@/orpc/client";

export function BrandPreviewCard({
  brandId,
  brandName,
  identity,
  previewHome,
  previewCopy,
  children,
}: {
  brandId: string;
  brandName: string;
  identity: BrandIdentity | null;
  previewHome: PreviewHome | null;
  previewCopy?: BrandPreviewCopy | null;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const saved = brandFonts(identity);
  const [editing, setEditing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draft, setDraft] = useState<BrandFonts | null>(null);
  const fonts = draft ?? saved;
  const dirty =
    draft !== null &&
    (draft.heading !== saved.heading || draft.body !== saved.body);

  const setFonts = useMutation(
    orpc.brand.setFonts.mutationOptions({
      onSuccess: () => {
        setDraft(null);
        setEditing(false);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const preview = (draftFonts = false) => (
    <BrandPreviewStrip
      brandId={brandId}
      brandName={brandName}
      home={previewHome}
      previewCopy={previewCopy}
      bodyFontFamily={
        draftFonts && dirty && fonts.body !== saved.body ? fonts.body : null
      }
      fontFamily={
        draftFonts && dirty && fonts.heading !== saved.heading
          ? fonts.heading
          : null
      }
    />
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span>
            <span className="text-muted-foreground">Heading</span>{" "}
            {saved.heading ?? "Default"}
          </span>
          <span>
            <span className="text-muted-foreground">Body</span>{" "}
            {saved.body ?? "Default"}
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setDraft(null);
            setEditing(true);
          }}
        >
          Edit fonts
        </Button>
      </div>
      {children}
      <details
        className="border-t pt-3"
        onToggle={(event) => setPreviewOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm text-muted-foreground">
          Preview
        </summary>
        {previewOpen && <div className="pt-4">{preview()}</div>}
      </details>
      <SimpleDialog
        open={editing}
        onOpenChange={(open) => {
          if (!setFonts.isPending) {
            setEditing(open);
            if (!open) setDraft(null);
          }
        }}
        title="Typography"
        size="xl"
        scrollable
      >
        <div className="space-y-5">
          <BrandFontPicker
            value={fonts}
            disabled={setFonts.isPending}
            onChange={setDraft}
          />
          {preview(true)}
          <div className="flex flex-wrap justify-end gap-2">
            {identity?.fontsChosen && (
              <Button
                size="sm"
                variant="outline"
                disabled={setFonts.isPending}
                onClick={() =>
                  setFonts.mutate({ id: brandId, heading: null, body: null })
                }
              >
                Reset to site fonts
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={setFonts.isPending}
              onClick={() => {
                setDraft(null);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!dirty || setFonts.isPending}
              onClick={() => setFonts.mutate({ id: brandId, ...fonts })}
            >
              {setFonts.isPending ? "Saving…" : "Save fonts"}
            </Button>
          </div>
        </div>
      </SimpleDialog>
    </div>
  );
}
