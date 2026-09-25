"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { intakeBrandRef } from "@/lib/intake-ref";
import { orpc } from "@/orpc/client";

/**
 * Submitted intakes for one account or the workspace, and the apply step
 * that promotes one into the account, its cycle and its homes.
 *
 * The blob is shown as-is rather than mapped into fields. Most of what a
 * client tells us is prose that the campaign agent reads whole, so rendering
 * it back as a form would only invite someone to edit a receipt.
 */
export function IntakePanel({ accountId }: { accountId?: string }) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const intakesOptions = orpc.performance.intakes.queryOptions({
    input: accountId ? { accountId } : {},
  });
  const intakes = useQuery(intakesOptions);
  const rows = intakes.data ?? [];

  function refreshIntake(intakeId: string) {
    // Keep the other list scopes fresh when the operator navigates back to them.
    void queryClient.invalidateQueries({
      queryKey: orpc.performance.intakes.key(),
    });
    void queryClient.invalidateQueries({
      queryKey: orpc.performance.previewIntake.queryKey({
        input: { intakeId },
      }),
    });
  }

  if (intakes.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading submissions…
      </p>
    );
  }
  if (intakes.isError) {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-sm text-destructive">
          Could not load submissions. Please try again.
        </p>
        <Button
          size="sm"
          variant="outline"
          loading={intakes.isFetching}
          onClick={() => void intakes.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }
  if (rows.length === 0) {
    if (accountId) return null;
    return (
      <div
        role="status"
        className="rounded-lg border border-dashed p-8 text-center"
      >
        <p className="text-sm text-muted-foreground">No submissions yet</p>
      </div>
    );
  }

  return (
    <section aria-label="Intake submissions" className="space-y-3">
      {accountId && <h2 className="text-sm font-semibold">Intake</h2>}
      <div className="divide-y rounded-xl border bg-card">
        {rows.map((intake) => (
          <div key={intake.id} className="px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <FileText
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              <span className="font-medium">
                {new Date(intake.submittedAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              {accountId ? (
                <span className="text-xs text-muted-foreground">
                  {intakeBrandRef(intake)}
                </span>
              ) : (
                <>
                  <Link
                    href={`/app/performance/${intake.accountId}`}
                    className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {intakeBrandRef(intake)}
                  </Link>
                  {(intake.submittedByName || intake.submittedByEmail) && (
                    <span className="text-xs text-muted-foreground">
                      Issued by{" "}
                      {intake.submittedByName || intake.submittedByEmail}
                      {intake.submittedByName && intake.submittedByEmail
                        ? ` (${intake.submittedByEmail})`
                        : null}
                    </span>
                  )}
                </>
              )}
              <StatusPill status={intake.status} />
              <span className="text-xs text-muted-foreground">
                {intake.mediaBudgetDollars != null
                  ? `$${intake.mediaBudgetDollars}/mo`
                  : intake.budgetIsRecommendation
                    ? "asked for a recommendation"
                    : "no budget given"}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-7"
                aria-expanded={openId === intake.id}
                aria-controls={`intake-${intake.id}`}
                aria-label={`${openId === intake.id ? "Hide" : "Review"} submission for ${intakeBrandRef(intake)}`}
                onClick={() =>
                  setOpenId(openId === intake.id ? null : intake.id)
                }
              >
                {openId === intake.id ? "Hide" : "Review"}
              </Button>
            </div>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <Signal ok={Boolean(intake.billingAcknowledgedAt)}>
                Billing acknowledged
              </Signal>
              <Signal ok={Boolean(intake.guestListConsentAt)}>
                Guest-list consent
              </Signal>
              {/* Two separate facts on purpose: what they said, and what we
                  saw. The gap is the failure worth chasing. */}
              <Signal ok={Boolean(intake.accessClaimedAt)}>
                Access claimed
              </Signal>
              <Signal ok={Boolean(intake.zernioVerifiedAt)}>
                Verified in Zernio
              </Signal>
            </div>

            {openId === intake.id && (
              <div id={`intake-${intake.id}`}>
                <VerifyAccess
                  intakeId={intake.id}
                  verifiedPageId={intake.verifiedPageId}
                  onVerified={() => refreshIntake(intake.id)}
                />
                <IntakeDetail
                  intakeId={intake.id}
                  onApplied={() => refreshIntake(intake.id)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <Badge
      variant={
        status === "applied"
          ? "default"
          : status === "verified"
            ? "secondary"
            : "outline"
      }
    >
      {status}
    </Badge>
  );
}

function Signal({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      {ok ? (
        <CheckCircle2 aria-hidden="true" className="size-3 text-primary" />
      ) : (
        <CircleDashed aria-hidden="true" className="size-3" />
      )}
      <span className="sr-only">{ok ? "Confirmed: " : "Not confirmed: "}</span>
      {children}
    </span>
  );
}

function IntakeDetail({
  intakeId,
  onApplied,
}: {
  intakeId: string;
  onApplied: () => void;
}) {
  const preview = useQuery(
    orpc.performance.previewIntake.queryOptions({ input: { intakeId } }),
  );
  const [budget, setBudget] = useState("");
  const apply = useMutation(
    orpc.performance.applyIntake.mutationOptions({ onSuccess: onApplied }),
  );

  if (preview.isPending) {
    return <p className="mt-3 text-xs text-muted-foreground">Loading…</p>;
  }
  if (!preview.data) return null;
  const data = preview.data;
  const applied = data.intake.status === "applied";

  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      <div>
        <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
          What they told us
        </p>
        <pre className="mt-1.5 max-h-64 overflow-auto rounded-lg border bg-background p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
          {JSON.stringify(data.intake.answers, null, 2)}
        </pre>
      </div>

      {!applied && (
        <div className="space-y-2">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            Applying writes
          </p>
          <ul className="space-y-1 text-xs">
            <li>Account marked active</li>
            <li>
              {data.willCreateCycle ? "Opens" : "Updates"} cycle {data.period}
              {data.needsBudgetDecision
                ? ", budget needs setting below"
                : ` at $${data.mediaBudgetDollars}`}
            </li>
            {data.newProperties.length > 0 && (
              <li>
                Adds {data.newProperties.length} home(s):{" "}
                {data.newProperties.map((row) => row.title).join(", ")}
              </li>
            )}
          </ul>
          {data.needsBudgetDecision && (
            <Input
              value={budget}
              inputMode="numeric"
              aria-label="Media budget, whole dollars per month"
              placeholder="Media budget, whole dollars per month"
              onChange={(event) => setBudget(event.target.value)}
              textSize="xs"
              className="h-8 max-w-xs"
            />
          )}
        </div>
      )}

      {data.blockers.length > 0 && (
        <ul className="space-y-1 text-xs text-destructive">
          {data.blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      )}

      {applied ? (
        <div className="space-y-0.5 text-xs text-muted-foreground">
          <p className="font-medium">Applied</p>
          {(data.intake.appliedSummary ?? []).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : (
        <Button
          size="sm"
          disabled={
            data.blockers.length > 0 ||
            (data.needsBudgetDecision && !budget.trim())
          }
          loading={apply.isPending}
          onClick={() =>
            apply.mutate({
              intakeId,
              mediaBudgetDollars: budget.trim()
                ? Number.parseInt(budget.replace(/[^0-9]/g, ""), 10)
                : undefined,
            })
          }
        >
          Apply intake
        </Button>
      )}
      {apply.error && (
        <p className="text-xs text-destructive">{apply.error.message}</p>
      )}
    </div>
  );
}

/**
 * Did the Leadsie grant land? Asks Zernio directly rather than trusting the
 * client's tick, because the two disagree often enough to be the first thing
 * worth checking when an onboarding stalls.
 */
function VerifyAccess({
  intakeId,
  verifiedPageId,
  onVerified,
}: {
  intakeId: string;
  verifiedPageId: string | null;
  onVerified: () => void;
}) {
  const verify = useMutation(
    orpc.performance.verifyIntakeAccess.mutationOptions({
      onSuccess: (result) => {
        if (result.matched) onVerified();
      },
    }),
  );
  const bind = useMutation(
    orpc.performance.setIntakeVerifiedPage.mutationOptions({
      onSuccess: onVerified,
    }),
  );
  const result = verify.data;

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          loading={verify.isPending}
          onClick={() => verify.mutate({ intakeId })}
        >
          Check access in Zernio
        </Button>
        {verifiedPageId && (
          <span className="text-xs text-muted-foreground">
            Page {verifiedPageId}
          </span>
        )}
      </div>

      {result?.matched && (
        <p className="text-xs text-primary">
          Found {result.matched.name ?? result.matched.id}. Their Page is
          reachable from Wander&apos;s Meta connection.
        </p>
      )}

      {result && !result.matched && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            No Page named like &ldquo;{result.brandName}&rdquo;. Either the
            grant has not landed, or their Page is named differently. Pick it if
            you recognise it.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.candidates.map((page) => (
              <Button
                key={page.id}
                size="sm"
                variant="outline"
                className="h-7"
                disabled={bind.isPending}
                onClick={() => bind.mutate({ intakeId, pageId: page.id })}
              >
                {page.name ?? page.id}
              </Button>
            ))}
          </div>
        </div>
      )}

      {result?.errors.map((message) => (
        <p key={message} className="text-xs text-destructive">
          {message}
        </p>
      ))}
      {verify.error && (
        <p className="text-xs text-destructive">{verify.error.message}</p>
      )}
    </div>
  );
}
