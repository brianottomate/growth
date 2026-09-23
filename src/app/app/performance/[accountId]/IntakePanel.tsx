"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { intakeBrandRef } from "@/lib/intake-ref";
import { orpc } from "@/orpc/client";

/**
 * Submitted intakes for one account, and the apply step that promotes one
 * into the account, its cycle and its homes.
 *
 * The blob is shown as-is rather than mapped into fields. Most of what a
 * client tells us is prose that the campaign agent reads whole, so rendering
 * it back as a form would only invite someone to edit a receipt.
 */
export function IntakePanel({ accountId }: { accountId: string }) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const intakes = useQuery(
    orpc.performance.intakes.queryOptions({ input: { accountId } }),
  );
  const rows = intakes.data ?? [];

  if (intakes.isPending) return null;
  if (rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Intake</h2>
      <div className="divide-y rounded-xl border bg-card">
        {rows.map((intake) => (
          <div key={intake.id} className="px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <FileText className="size-4 text-muted-foreground" />
              <span className="font-medium">
                {new Date(intake.submittedAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <span className="text-xs text-muted-foreground">
                {intakeBrandRef(intake)}
              </span>
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
              <VerifyAccess
                intakeId={intake.id}
                verifiedPageId={intake.verifiedPageId}
                onVerified={() =>
                  void queryClient.invalidateQueries({
                    queryKey: orpc.performance.intakes.queryKey({
                      input: { accountId },
                    }),
                  })
                }
              />
            )}

            {openId === intake.id && (
              <IntakeDetail
                intakeId={intake.id}
                onApplied={() =>
                  void queryClient.invalidateQueries({
                    queryKey: orpc.performance.intakes.queryKey({
                      input: { accountId },
                    }),
                  })
                }
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "applied"
      ? "bg-emerald-500/15 text-emerald-300"
      : status === "verified"
        ? "bg-sky-500/15 text-sky-300"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] capitalize ${tone}`}>
      {status}
    </span>
  );
}

function Signal({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      {ok ? (
        <CheckCircle2 className="size-3 text-emerald-400" />
      ) : (
        <CircleDashed className="size-3" />
      )}
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
              placeholder="Media budget, whole dollars per month"
              onChange={(event) => setBudget(event.target.value)}
              textSize="xs"
              className="h-8 max-w-xs"
            />
          )}
        </div>
      )}

      {data.blockers.length > 0 && (
        <ul className="space-y-1 text-xs text-amber-300">
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
        <p className="text-xs text-red-300">{apply.error.message}</p>
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
        <p className="text-xs text-emerald-300">
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
        <p key={message} className="text-xs text-amber-300">
          {message}
        </p>
      ))}
      {verify.error && (
        <p className="text-xs text-red-300">{verify.error.message}</p>
      )}
    </div>
  );
}
