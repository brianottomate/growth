"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { currentPeriod, periodLabel } from "@/lib/performance-billing";
import {
  shiftBillingPeriod,
  wanderMediaContribution,
} from "@/lib/billing-cycles";
import type { PerformanceAccount, PerformanceCycle } from "@/server/db/schema";

const money = (value: number | null) =>
  value == null
    ? "Not set"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(value);
function formText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}
function amount(form: FormData, key: string) {
  const raw = formText(form, key);
  if (!raw) return null;
  const value = Number(raw);
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    Math.round(value * 100) / 100 !== value
  )
    throw new Error("Use a nonnegative amount with up to two decimal places.");
  return value;
}

export function BillingClient({
  brandId,
  accountId,
}: {
  brandId: string;
  accountId: string | null;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const data = useQuery(
    orpc.performance.get.queryOptions({
      input: { accountId: accountId ?? "" },
      enabled: Boolean(accountId),
    }),
  );
  const promote = useMutation(
    orpc.performance.promoteToClient.mutationOptions({
      onSuccess: () => {
        router.refresh();
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const refresh = async () => {
    await queryClient.invalidateQueries();
    router.refresh();
  };
  if (!accountId)
    return (
      <section className="space-y-3 rounded-xl border p-5">
        <h2 className="font-semibold">Client billing</h2>
        <p className="text-sm text-muted-foreground">
          Create the client account to record commercial terms and plan billing
          months.
        </p>
        <Button
          disabled={promote.isPending}
          onClick={() => promote.mutate({ brandId })}
        >
          Create client account
        </Button>
      </section>
    );
  if (!data.data)
    return (
      <p className="text-sm text-muted-foreground">
        {data.error?.message ?? "Loading billing…"}
      </p>
    );
  const account = data.data.account;
  return (
    <div className="space-y-6">
      <Terms account={account} onSaved={refresh} />
      <Cycles accountId={accountId} cycles={account.cycles} onSaved={refresh} />
    </div>
  );
}

type TermsAccount = Pick<
  PerformanceAccount,
  | "id"
  | "monthlyFee"
  | "agreedAdSpend"
  | "clientMediaContribution"
  | "effectiveDate"
  | "terms"
  | "endDate"
> & { updatedAt: Date | string };
function Terms({
  account,
  onSaved,
}: {
  account: TermsAccount;
  onSaved: () => Promise<void>;
}) {
  const save = useMutation(
    orpc.performance.updateAccount.mutationOptions({
      onSuccess: async () => {
        await onSaved();
        toast.success(
          "Account terms saved. Existing months kept their amounts.",
        );
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h2 className="font-semibold">Account terms</h2>
        <p className="text-sm text-muted-foreground">
          Defaults for new billing months. Existing cycles stay as recorded.
        </p>
      </div>
      <form
        key={JSON.stringify(account)}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const form = new FormData(event.currentTarget);
            save.mutate({
              accountId: account.id,
              expectedUpdatedAt: new Date(account.updatedAt).toISOString(),
              monthlyFee: amount(form, "monthlyFee"),
              agreedAdSpend: amount(form, "agreedAdSpend"),
              clientMediaContribution: amount(form, "clientMediaContribution"),
              effectiveDate: formText(form, "effectiveDate") || null,
              endDate: formText(form, "endDate") || null,
              terms: formText(form, "terms") || null,
            });
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        <div className="grid grid-cols-1 items-end gap-4 @xl:grid-cols-3">
          <Field
            name="monthlyFee"
            label="Monthly management fee"
            value={account.monthlyFee}
          />
          <Field
            name="agreedAdSpend"
            label="Monthly ad budget"
            value={account.agreedAdSpend}
          />
          <Field
            name="clientMediaContribution"
            label="Monthly client media charge"
            value={account.clientMediaContribution}
          />
          <Field
            name="effectiveDate"
            label="Effective date"
            value={account.effectiveDate}
            type="date"
          />
          <Field name="terms" label="Term" value={account.terms} type="text" />
          <Field
            name="endDate"
            label="End date (exclusive)"
            value={account.endDate}
            type="date"
          />
        </div>
        <p className="text-sm">
          Wander media contribution:{" "}
          <strong>
            {money(
              wanderMediaContribution(
                account.agreedAdSpend,
                account.clientMediaContribution,
              ),
            )}
            /mo
          </strong>
        </p>
        <Button type="submit" disabled={save.isPending}>
          Save terms
        </Button>
      </form>
    </section>
  );
}

type BillingCycle = Pick<
  PerformanceCycle,
  | "id"
  | "period"
  | "status"
  | "billedAmount"
  | "mediaBudget"
  | "clientMediaContribution"
  | "notes"
  | "actualSpendCents"
> & {
  feePaidAt: Date | string | null;
  mediaPaidAt: Date | string | null;
  updatedAt: Date | string;
};
function Cycles({
  accountId,
  cycles,
  onSaved,
}: {
  accountId: string;
  cycles: BillingCycle[];
  onSaved: () => Promise<void>;
}) {
  const [period, setPeriod] = useState(shiftBillingPeriod(currentPeriod(), 3));
  const generate = useMutation(
    orpc.performance.generateCycles.mutationOptions({
      onSuccess: async (result) => {
        await onSaved();
        toast.success(`${result.created} billing months added`);
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const add = useMutation(
    orpc.performance.openCycle.mutationOptions({
      onSuccess: async () => {
        await onSaved();
        toast.success("Billing month added");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="font-semibold">Monthly billing</h2>
          <p className="text-sm text-muted-foreground">
            Current month plus two ahead, within the account dates. Partial
            months need review.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={generate.isPending}
          onClick={() => generate.mutate({ accountId })}
        >
          Generate missing months
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="add-period">Add a specific month</Label>
          <Input
            id="add-period"
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          disabled={
            add.isPending || !period || cycles.some((c) => c.period === period)
          }
          onClick={() => add.mutate({ accountId, period })}
        >
          Add month
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Amounts are in USD. Payment status is recorded manually. Stripe is not
        connected.
      </p>
      {!cycles.length && (
        <p className="text-sm text-muted-foreground">
          Set an effective date and activate the account to generate months, or
          add one above.
        </p>
      )}
      {[...cycles]
        .sort((a, b) => {
          const current = currentPeriod();
          const group = (period: string) =>
            period === current ? 0 : period > current ? 1 : 2;
          return (
            group(a.period) - group(b.period) ||
            (group(a.period) === 2
              ? b.period.localeCompare(a.period)
              : a.period.localeCompare(b.period))
          );
        })
        .map((cycle) => (
          <Cycle
            key={cycle.id + JSON.stringify(cycle)}
            cycle={cycle}
            onSaved={onSaved}
          />
        ))}
    </section>
  );
}
function Cycle({
  cycle,
  onSaved,
}: {
  cycle: BillingCycle;
  onSaved: () => Promise<void>;
}) {
  const save = useMutation(
    orpc.performance.updateCycle.mutationOptions({
      onSuccess: async () => {
        await onSaved();
        toast.success("Billing month saved");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const total =
    cycle.billedAmount == null || cycle.clientMediaContribution == null
      ? null
      : cycle.billedAmount + cycle.clientMediaContribution;
  return (
    <form
      className="space-y-4 rounded-xl border bg-card p-5"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const form = new FormData(event.currentTarget);
          save.mutate({
            cycleId: cycle.id,
            expectedUpdatedAt: new Date(cycle.updatedAt).toISOString(),
            billedAmount: amount(form, "billedAmount"),
            mediaBudget: amount(form, "mediaBudget"),
            clientMediaContribution: amount(form, "clientMediaContribution"),
            notes: formText(form, "notes") || null,
            feePaid: form.get("feePaid") === "on",
            mediaPaid: form.get("mediaPaid") === "on",
          });
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
    >
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="font-semibold">
          {periodLabel(cycle.period)}
          {cycle.period === currentPeriod() ? " · Current month" : ""}
        </h3>
        <span className="text-xs text-muted-foreground capitalize">
          {cycle.status}
        </span>
      </div>
      <div className="grid grid-cols-1 items-end gap-4 @xl:grid-cols-3">
        <Field
          name="billedAmount"
          label="Management fee charged"
          value={cycle.billedAmount}
          prefix={cycle.id}
        />
        <Field
          name="mediaBudget"
          label="Full ad budget"
          value={cycle.mediaBudget}
          prefix={cycle.id}
        />
        <Field
          name="clientMediaContribution"
          label="Client media charge"
          value={cycle.clientMediaContribution}
          prefix={cycle.id}
        />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <span>
          Expected client charge <strong>{money(total)}</strong>
        </span>
        <span>
          Wander media contribution{" "}
          <strong>
            {money(
              wanderMediaContribution(
                cycle.mediaBudget,
                cycle.clientMediaContribution,
              ),
            )}
          </strong>
        </span>
        <span>
          Actual spend{" "}
          <strong>
            {money(
              cycle.actualSpendCents == null
                ? null
                : cycle.actualSpendCents / 100,
            )}
          </strong>
        </span>
      </div>
      <div className="flex flex-wrap gap-5 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="feePaid"
            defaultChecked={Boolean(cycle.feePaidAt)}
          />
          Fee paid
          {cycle.feePaidAt
            ? ` · ${new Date(cycle.feePaidAt).toLocaleDateString()}`
            : ""}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="mediaPaid"
            defaultChecked={Boolean(cycle.mediaPaidAt)}
          />
          Client media charge paid
          {cycle.mediaPaidAt
            ? ` · ${new Date(cycle.mediaPaidAt).toLocaleDateString()}`
            : ""}
        </label>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${cycle.id}-notes`}>Adjustment notes</Label>
        <Textarea
          id={`${cycle.id}-notes`}
          name="notes"
          defaultValue={cycle.notes ?? ""}
        />
      </div>
      <Button type="submit" disabled={save.isPending}>
        Save month
      </Button>
    </form>
  );
}
function Field({
  name,
  label,
  value,
  type = "number",
  prefix = "terms",
}: {
  name: string;
  label: string;
  value: string | number | null;
  type?: string;
  prefix?: string;
}) {
  const id = `${prefix}-${name}`;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        defaultValue={value ?? ""}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "0.01" : undefined}
      />
    </div>
  );
}
