"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { orpc } from "@/orpc/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/toast";

export function SequenceTestPanel({
  sequenceId,
  ready,
  onStarted,
}: {
  sequenceId: string;
  ready: boolean;
  onStarted: () => unknown;
}) {
  const [recipients, setRecipients] = useState("");
  const [fast, setFast] = useState(true);
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState("");
  const preview = useMutation(
    orpc.emailSequence.previewTest.mutationOptions({
      onSuccess: () => {
        setRequestId(crypto.randomUUID());
        setOpen(true);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const start = useMutation(
    orpc.emailSequence.startTest.mutationOptions({
      onSuccess: (result) => {
        setOpen(false);
        void onStarted();
        if (result.queued) toast.success("Test sequence scheduled");
        else
          toast.error(
            "Test saved, but scheduling failed. Use Recover queued work.",
          );
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const review = preview.data;
  return (
    <section className="mb-5 space-y-3 rounded-xl border p-4">
      <h3 className="font-medium">Test sequence</h3>
      <p className="text-sm text-muted-foreground">
        Run the saved emails to one or several recipients. Live delivery can
        stay paused. Test individual emails with Send test to me in the email
        editor.
      </p>
      <Input
        aria-label="Test recipients"
        placeholder="Email addresses, separated by commas (blank uses your account)"
        value={recipients}
        onChange={(event) => setRecipients(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Select
          value={fast ? "fast" : "normal"}
          onValueChange={(value) => setFast(value === "fast")}
        >
          <SelectTrigger className="w-56" aria-label="Test timing">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fast">One-minute waits</SelectItem>
            <SelectItem value="normal">Configured waits</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          disabled={!ready || preview.isPending || start.isPending}
          onClick={() =>
            preview.mutate({
              sequenceId,
              fast,
              recipientEmails: recipients.split(/[,;\s]+/).filter(Boolean),
            })
          }
        >
          Review test
        </Button>
      </div>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run test sequence</AlertDialogTitle>
            <AlertDialogDescription>
              This schedules real test emails to{" "}
              {review?.recipientEmails.join(", ")}. Live activation stays
              unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {review && (
            <div className="space-y-2 text-sm">
              {review.snapshot.steps.map((step, index) => (
                <div key={step.id}>
                  {index + 1}. {step.subject} ·{" "}
                  {step.delayMinutes === 0
                    ? "Immediately"
                    : `+${step.delayMinutes} min`}
                </div>
              ))}
              <p className="text-muted-foreground">
                Personalization: {review.snapshot.test?.attributes.first_name},
                Example home. Later waits start after the previous send is
                accepted.
              </p>
              {review.errors.map((error) => (
                <p key={error} role="alert">
                  {error}
                </p>
              ))}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={start.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !review || Boolean(review.errors.length) || start.isPending
              }
              onClick={(event) => {
                event.preventDefault();
                if (review)
                  start.mutate({
                    sequenceId,
                    fast: preview.variables.fast,
                    recipientEmails: review.recipientEmails,
                    reviewedHash: review.contentHash,
                    requestId,
                    confirmSends: true,
                  });
              }}
            >
              Run test
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
