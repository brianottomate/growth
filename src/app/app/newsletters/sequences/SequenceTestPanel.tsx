"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function SequenceTestAction({
  sequenceId,
  disabled,
}: {
  sequenceId: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const overview = useQuery(
    orpc.emailSequence.executionOverview.queryOptions({
      input: { sequenceId },
      enabled: open,
    }),
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          title={disabled ? "Save the draft before testing" : undefined}
        >
          Test sequence
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Test sequence</DialogTitle>
        </DialogHeader>
        {overview.isPending ? (
          <p>Checking delivery setup…</p>
        ) : overview.error ? (
          <p role="alert">{overview.error.message}</p>
        ) : (
          <>
            {!overview.data.readiness.ready && (
              <p role="alert">
                Setup remaining: {overview.data.readiness.missing.join(", ")}
              </p>
            )}
            <SequenceTestPanel
              sequenceId={sequenceId}
              ready={overview.data.readiness.ready}
              onStarted={() => {
                setOpen(false);
                return client.invalidateQueries({
                  queryKey: orpc.emailSequence.executionOverview.key(),
                });
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

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
