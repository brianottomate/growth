"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LayoutTemplate, Loader2 } from "lucide-react";

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
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import {
  NEWSLETTER_TEMPLATES,
  type NewsletterTemplateId,
} from "@/lib/newsletter-templates";
import { orpc } from "@/orpc/client";

/** Next Thursday at 10:00 local, as a datetime-local value. */
function defaultSendTime() {
  const date = new Date();
  date.setDate(date.getDate() + ((4 - date.getDay() + 7) % 7 || 7));
  date.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T10:00`;
}

export function NewsletterTemplateStart({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [template, setTemplate] =
    useState<NewsletterTemplateId>("season-ahead");
  const [angle, setAngle] = useState("");
  const [offer, setOffer] = useState("");
  const [sendAt, setSendAt] = useState(defaultSendTime);
  const options = useQuery({
    ...orpc.newsletter.templateOptions.queryOptions({ input: { brandId } }),
    enabled: open,
  });
  const draft = useMutation(
    orpc.newsletter.draftFromTemplate.mutationOptions({
      onSuccess: (result) => {
        toast.success(`Drafted "${result.subject}"`);
        router.push(result.url);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const chosen = NEWSLETTER_TEMPLATES.find((item) => item.id === template)!;
  const suggestions =
    template === "season-ahead"
      ? (options.data?.seasons ?? []).map((season) => ({
          label: season.label,
          hint: season.when ?? "",
        }))
      : (options.data?.collections ?? []).map((collection) => ({
          label: collection.label,
          hint: `${collection.homes} homes`,
        }));
  const noHomes = options.data?.homesWithPhoto === 0;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <LayoutTemplate className="size-4" /> Start from a template
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!draft.isPending) setOpen(value);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Start from a template</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {NEWSLETTER_TEMPLATES.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={draft.isPending}
                onClick={() => {
                  setTemplate(item.id);
                  setAngle("");
                }}
                aria-pressed={template === item.id}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  template === item.id
                    ? "border-foreground bg-accent/40"
                    : "hover:bg-accent/40",
                )}
              >
                <div className="text-sm font-medium">{item.label}</div>
                <div className="text-xs text-muted-foreground">
                  {item.summary}
                </div>
                <ol className="mt-2 flex flex-wrap gap-1">
                  {item.structure.map((part) => (
                    <li
                      key={part}
                      className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {part}
                    </li>
                  ))}
                </ol>
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-angle">{chosen.angleLabel}</Label>
            <Input
              id="template-angle"
              value={angle}
              disabled={draft.isPending}
              placeholder={`${chosen.anglePlaceholder}, or leave empty`}
              onChange={(event) => setAngle(event.target.value)}
            />
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    disabled={draft.isPending}
                    onClick={() => setAngle(suggestion.label)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                      angle === suggestion.label
                        ? "border-foreground bg-accent/40"
                        : "text-muted-foreground hover:bg-accent/40",
                    )}
                  >
                    {suggestion.label}
                    <span className="ml-1 opacity-60">{suggestion.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="template-offer">Offer</Label>
              <Input
                id="template-offer"
                value={offer}
                disabled={draft.isPending}
                placeholder="$50 off 3+ nights, code FALL50"
                onChange={(event) => setOffer(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="template-send">Send</Label>
              <Input
                id="template-send"
                type="datetime-local"
                value={sendAt}
                disabled={draft.isPending}
                onChange={(event) => setSendAt(event.target.value)}
              />
            </div>
          </div>

          {noHomes && (
            <p className="text-sm text-destructive">
              No homes with photos yet. Refresh homes on Setup first.
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              disabled={draft.isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={draft.isPending || noHomes}
              onClick={() =>
                draft.mutate({
                  brandId,
                  template,
                  angle: angle.trim() || undefined,
                  offer: offer.trim() || undefined,
                  plannedAt: sendAt
                    ? new Date(sendAt).toISOString()
                    : undefined,
                })
              }
            >
              {draft.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Picking homes and
                  writing
                </>
              ) : (
                "Draft email"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
