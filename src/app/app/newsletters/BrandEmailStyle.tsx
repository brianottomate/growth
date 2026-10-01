"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  brandEmailThemeSchema,
  type BrandEmailTheme,
} from "@/lib/brand-email-style";
import { orpc } from "@/orpc/client";

export function BrandEmailStyle({
  brandId,
  brandName,
  theme,
  copyGuide,
}: {
  brandId: string;
  brandName: string;
  theme?: BrandEmailTheme | null;
  copyGuide?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [backgroundColor, setBackground] = useState(
    theme?.backgroundColor ?? "",
  );
  const [accentColor, setAccent] = useState(theme?.accentColor ?? "");
  const [accentTextColor, setAccentText] = useState(
    theme?.accentTextColor ?? "",
  );
  const [guide, setGuide] = useState(copyGuide ?? "");
  const save = useMutation(
    orpc.brand.update.mutationOptions({
      onSuccess: () => {
        toast.success("Brand email style saved");
        setOpen(false);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setBackground(theme?.backgroundColor ?? "");
          setAccent(theme?.accentColor ?? "");
          setAccentText(theme?.accentTextColor ?? "");
          setGuide(copyGuide ?? "");
          setOpen(true);
        }}
      >
        Brand email style
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{brandName} email style</DialogTitle>
            <DialogDescription>
              Colors apply to this brand’s email previews and sends. The copy
              guide applies to new drafts and rewrites.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const parsed = brandEmailThemeSchema.safeParse({
                ...(backgroundColor.trim() && {
                  backgroundColor: backgroundColor.trim(),
                }),
                ...(accentColor.trim() && { accentColor: accentColor.trim() }),
                ...(accentTextColor.trim() && {
                  accentTextColor: accentTextColor.trim(),
                }),
              });
              if (!parsed.success) {
                toast.error(
                  "Use six-digit hex colors, such as #24543a, or leave blank for defaults.",
                );
                return;
              }
              save.mutate({
                id: brandId,
                emailStyle: {
                  theme: parsed.data,
                  copyGuide: guide.trim() || null,
                },
              });
            }}
            className="space-y-4"
          >
            {[
              {
                id: "email-background",
                label: "Background",
                value: backgroundColor,
                set: setBackground,
                placeholder: "#f7f7f7",
              },
              {
                id: "email-accent",
                label: "Button color",
                value: accentColor,
                set: setAccent,
                placeholder: "#1a1a1a",
              },
              {
                id: "email-accent-text",
                label: "Button text",
                value: accentTextColor,
                set: setAccentText,
                placeholder: "#ffffff",
              },
            ].map((field) => (
              <div key={field.id} className="space-y-1.5">
                <Label htmlFor={field.id}>{field.label}</Label>
                <Input
                  id={field.id}
                  value={field.value}
                  placeholder={field.placeholder}
                  onChange={(event) => field.set(event.target.value)}
                  maxLength={7}
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label htmlFor="email-copy-guide">Email copy guide</Label>
              <Textarea
                id="email-copy-guide"
                value={guide}
                onChange={(event) => setGuide(event.target.value)}
                maxLength={4000}
                rows={5}
                placeholder="Voice, preferred wording, phrases to avoid, and verified brand promises."
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Leave colors blank to use the shared neutral defaults. Existing
              copy stays as written until you rewrite it.
            </p>
            <DialogFooter>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save style"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
