"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveClientMetaChoice } from "./actions";
export function MetaOAuthChoice({
  token,
  accounts,
  pages,
  pageId,
}: {
  token: string;
  accounts: {
    id: string;
    name: string;
    currency?: string;
    selectable: boolean;
  }[];
  pages: { id: string; name: string }[];
  pageId: string;
}) {
  const [state, save, pending] = useActionState(saveClientMetaChoice, null);
  return (
    <form action={save} className="mt-6 space-y-5">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-2">
        <Label htmlFor="adAccountId">Ad account</Label>
        <Select name="adAccountId" required>
          <SelectTrigger id="adAccountId" className="w-full">
            <SelectValue placeholder="Choose the account for your ads" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id} disabled={!a.selectable}>
                {a.name} · {a.id}
                {a.currency ? ` · ${a.currency}` : ""}
                {!a.selectable ? " · unavailable" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="pageId">Facebook Page for your ads</Label>
        <Select name="pageId" defaultValue={pageId || undefined} required>
          <SelectTrigger id="pageId" className="w-full">
            <SelectValue placeholder="Choose your brand’s Page" />
          </SelectTrigger>
          <SelectContent>
            {pages.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button
        type="submit"
        disabled={pending || !accounts.length || !pages.length}
      >
        {pending ? "Connecting…" : "Use this account"}
      </Button>
    </form>
  );
}
