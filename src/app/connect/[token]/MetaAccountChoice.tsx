"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { getMetaConnectChoice } from "@/server/services/meta-connect-setup.service";
import { MetaAccountSubmit } from "./MetaAccountSubmit";
import { selectClientMetaAccount } from "./actions";

type Choice = NonNullable<Awaited<ReturnType<typeof getMetaConnectChoice>>>;

const details = (account: Choice["accounts"][number]) =>
  [account.businessName, account.id, account.currency]
    .filter(Boolean)
    .join(" · ");

/** The Meta ad account Wander uses: chosen once, then shown with Change. */
export function MetaAccountChoice({
  token,
  brandName,
  choice,
}: {
  token: string;
  brandName: string;
  choice: Choice;
}) {
  const chosen = choice.accounts.find((a) => a.id === choice.selectedId);
  const [changing, setChanging] = useState(false);

  if (chosen && !changing)
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-sm">
          <p className="text-xs text-muted-foreground">Ad account</p>
          <p className="font-medium">{chosen.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {details(chosen)}
          </p>
        </div>
        {choice.accounts.length > 1 && (
          <Button size="sm" variant="outline" onClick={() => setChanging(true)}>
            Change
          </Button>
        )}
      </div>
    );

  return (
    <form action={selectClientMetaAccount} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <div className="text-sm">
        <p className="font-medium">Which ad account should Wander use?</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose the account that should run {brandName}&apos;s ads and pay
          Meta. Your login may have access to accounts for other businesses.
        </p>
      </div>
      <fieldset className="space-y-2">
        <legend className="sr-only">Choose your Meta ad account</legend>
        {choice.accounts.map((account) => (
          <label
            key={account.id}
            className="flex cursor-pointer gap-3 rounded-lg border border-border p-3"
          >
            <input
              type="radio"
              name="adAccountId"
              value={account.id}
              required
              disabled={!account.selectable}
              defaultChecked={account.id === choice.selectedId}
              className="mt-1"
            />
            <span className="min-w-0 text-sm">
              <span className="block font-medium">{account.name}</span>
              <span className="block text-xs text-muted-foreground">
                {details(account)}
              </span>
              {account.reason && (
                <span className="mt-1 block text-xs">{account.reason}</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <MetaAccountSubmit />
        {chosen && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setChanging(false)}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
