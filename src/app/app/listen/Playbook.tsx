"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { orpc, type RouterOutputs } from "@/orpc/client";

type Overview = RouterOutputs["listening"]["overview"];

/**
 * The brand listening "story" — the shared judgment injected into every scan
 * and reply draft. Voice is read-only here (it lives on the brand fingerprint,
 * shared with publishing). Its own tab on /app/listen.
 */
export function Playbook({
  brandId,
  brandName,
  story,
  brandVoice,
}: {
  brandId: string;
  brandName: string;
  story: Overview["story"];
  brandVoice: string | null;
}) {
  const queryClient = useQueryClient();
  const save = useMutation(
    orpc.listening.updateStory.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.listening.overview.queryKey(),
        });
        toast.success("Playbook saved");
      },
      onError: (e) => toast.error(e.message || "Failed to save"),
    }),
  );

  const [signalGuidance, setSignal] = useState(story?.signalGuidance ?? "");
  const [replyGuidance, setReply] = useState(story?.replyGuidance ?? "");
  const [productBoilerplate, setProduct] = useState(
    story?.productBoilerplate ?? "",
  );

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Playbook</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The shared judgment injected into every scan and reply draft — what
            counts as signal, and how {brandName} replies. Edit it live; it
            takes effect on the next scan.
          </p>
        </div>
        <Button
          size="sm"
          disabled={save.isPending}
          onClick={() =>
            save.mutate({
              brandId,
              story: { signalGuidance, replyGuidance, productBoilerplate },
            })
          }
        >
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          Save playbook
        </Button>
      </div>

      {brandVoice && (
        <p className="mt-4 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Voice</span> — shared
          with publishing, edited on the brand fingerprint, not here:{" "}
          {brandVoice.length > 240
            ? `${brandVoice.slice(0, 240)}…`
            : brandVoice}
        </p>
      )}

      <div className="mt-4 space-y-4">
        <Field
          label="What counts as signal"
          hint="High vs low signal; what's worth engaging with."
        >
          <Textarea
            value={signalGuidance}
            onChange={(e) => setSignal(e.target.value)}
            rows={5}
          />
        </Field>
        <Field
          label="How we reply"
          hint={`Etiquette and judgment specific to ${brandName}.`}
        >
          <Textarea
            value={replyGuidance}
            onChange={(e) => setReply(e.target.value)}
            rows={4}
          />
        </Field>
        <Field
          label="Product framing"
          hint="WanderOS / Sites / Operated boilerplate (optional)."
        >
          <Textarea
            value={productBoilerplate}
            onChange={(e) => setProduct(e.target.value)}
            rows={3}
          />
        </Field>
      </div>

      {story?.updatedAt && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Last edited {new Date(story.updatedAt).toLocaleString()}
          {story.updatedBy ? ` by ${story.updatedBy}` : ""}
        </p>
      )}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {hint && <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}
