"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  NEWSLETTER_TEMPLATES,
  RECIPE_CONTEXT_LABELS,
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

function recipeGroup(category: string) {
  return ["Booking", "During the stay", "After the stay"].includes(category)
    ? "Sequence emails"
    : "Blasts";
}

export function NewsletterTemplateStart({
  brandId,
  primary = false,
  initialTemplate = "season-ahead",
  onDrafted,
}: {
  brandId: string;
  primary?: boolean;
  initialTemplate?: NewsletterTemplateId;
  onDrafted?: (platformPostId: string) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [template, setTemplate] =
    useState<NewsletterTemplateId>(initialTemplate);
  const [group, setGroup] = useState(() =>
    recipeGroup(
      NEWSLETTER_TEMPLATES.find((item) => item.id === initialTemplate)!
        .category,
    ),
  );
  const [angle, setAngle] = useState("");
  const [offer, setOffer] = useState("");
  const [context, setContext] = useState<Record<string, string>>({});
  const [brief, setBrief] = useState("");
  const [homeId, setHomeId] = useState("");
  const [sendAt, setSendAt] = useState(defaultSendTime);
  const options = useQuery({
    ...orpc.newsletter.templateOptions.queryOptions({ input: { brandId } }),
    enabled: open,
  });
  const draft = useMutation(
    orpc.newsletter.draftFromTemplate.mutationOptions({
      onSuccess: (result) => {
        toast.success(`Drafted "${result.subject}"`);
        if (onDrafted) {
          onDrafted(result.platformPostId);
          setOpen(false);
          void queryClient.invalidateQueries({
            queryKey: orpc.emailSequence.emails.key(),
          });
        } else router.push(result.url);
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
      : template === "home-collection"
        ? (options.data?.collections ?? []).map((collection) => ({
            label: collection.label,
            hint: `${collection.homes} homes`,
          }))
        : [];
  const noHomes = chosen.homes > 0 && options.data?.homesWithPhoto === 0;
  const missingContext = chosen.requiredContext.some(
    (key) => !(key === "offer" ? offer.trim() : context[key]?.trim()),
  );
  const needsSpecificHomes = chosen.requiredContext.some((key) =>
    ["viewedHome", "savedHome", "checkout", "newHome", "upgrade"].includes(key),
  );

  return (
    <>
      <Button
        variant={primary ? "default" : "outline"}
        size="sm"
        onClick={() => setOpen(true)}
      >
        <LayoutTemplate className="size-4" />{" "}
        {onDrafted || initialTemplate === "season-ahead"
          ? "From template"
          : "Use this template"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!draft.isPending) setOpen(value);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Start from a template</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Choose a shared recipe. Your draft uses this brand’s voice, homes
            and email styling.
          </p>
          <Button variant="outline" asChild>
            <Link
              href={`/app/newsletters/templates?brandId=${encodeURIComponent(brandId)}`}
            >
              Browse the template wall
            </Link>
          </Button>

          <div className="space-y-3">
            <div className="flex gap-2" aria-label="Template groups">
              {["Blasts", "Sequence emails"].map((value) => (
                <Button
                  key={value}
                  variant={group === value ? "secondary" : "outline"}
                  size="sm"
                  disabled={draft.isPending}
                  aria-pressed={group === value}
                  onClick={() => {
                    setGroup(value);
                    setTemplate(
                      NEWSLETTER_TEMPLATES.find(
                        (item) => recipeGroup(item.category) === value,
                      )!.id,
                    );
                    setAngle("");
                    setContext({});
                    setHomeId("");
                  }}
                >
                  {value}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Groups describe common uses; an individual recipe can work in
              either. Each recipe creates one email.
            </p>
            <Label htmlFor="email-recipe">Email recipe</Label>
            <select
              id="email-recipe"
              value={template}
              disabled={draft.isPending}
              className="w-full rounded-md border bg-background p-2 text-sm"
              onChange={(event) => {
                setTemplate(event.target.value as NewsletterTemplateId);
                setAngle("");
                setContext({});
                setHomeId("");
              }}
            >
              {[
                ...new Set(
                  NEWSLETTER_TEMPLATES.filter(
                    (item) => recipeGroup(item.category) === group,
                  ).map((item) => item.category),
                ),
              ].map((category) => (
                <optgroup key={category} label={category}>
                  {NEWSLETTER_TEMPLATES.filter(
                    (item) => item.category === category,
                  ).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="text-sm text-muted-foreground">{chosen.summary}</p>
            {"trigger" in chosen && (
              <p className="text-xs text-muted-foreground">
                Intended use: {chosen.trigger}. Delivery stays inactive.
              </p>
            )}
            <div className="flex flex-wrap gap-1">
              {chosen.structure.map((part) => (
                <span
                  key={part}
                  className="rounded-md bg-muted px-1.5 py-0.5 text-xs"
                >
                  {part}
                </span>
              ))}
            </div>
            {chosen.requiredContext
              .filter((key) => key !== "offer")
              .map((key) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`recipe-${key}`}>
                    {RECIPE_CONTEXT_LABELS[key] ?? key}
                  </Label>
                  <Textarea
                    id={`recipe-${key}`}
                    value={context[key] ?? ""}
                    disabled={draft.isPending}
                    placeholder={
                      key.endsWith("Url")
                        ? "https://…"
                        : "Facts approved for this email"
                    }
                    onChange={(event) =>
                      setContext((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            {needsSpecificHomes && (
              <div className="space-y-1">
                <Label htmlFor="recipe-home">Home</Label>
                <select
                  id="recipe-home"
                  value={homeId}
                  onChange={(event) => setHomeId(event.target.value)}
                  disabled={draft.isPending}
                  className="w-full rounded-md border bg-background p-2 text-sm"
                >
                  <option value="">Choose the home this email is about</option>
                  {options.data?.homes.map((home) => (
                    <option key={home.id} value={home.id}>
                      {home.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="recipe-brief">Direction</Label>
              <Textarea
                id="recipe-brief"
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                disabled={draft.isPending}
                placeholder="What this email should say, and what to leave out"
              />
            </div>
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
            {!onDrafted && (
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
            )}
          </div>
          {onDrafted && (
            <p className="text-sm text-muted-foreground">
              This creates an unscheduled email for this step. Save the sequence
              draft to keep its assignment; the sequence controls timing.
            </p>
          )}

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
              disabled={
                draft.isPending ||
                noHomes ||
                missingContext ||
                (needsSpecificHomes && !homeId)
              }
              onClick={() =>
                draft.mutate({
                  brandId,
                  template,
                  brief: brief.trim() || undefined,
                  homeIds: homeId ? [homeId] : undefined,
                  verifiedContext: Object.fromEntries(
                    Object.entries(context).filter(([, value]) => value.trim()),
                  ),
                  angle: angle.trim() || undefined,
                  offer: offer.trim() || undefined,
                  plannedAt:
                    !onDrafted && sendAt
                      ? new Date(sendAt).toISOString()
                      : undefined,
                })
              }
            >
              {draft.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Writing draft
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
