import type { getMetaConnectChoice } from "@/server/services/meta-connect-setup.service";
type Choice = NonNullable<Awaited<ReturnType<typeof getMetaConnectChoice>>>;
export function MetaAccountChoice({
  token,
  choice,
}: {
  token: string;
  brandName: string;
  choice: Choice;
}) {
  const chosen = choice.accounts.find((a) => a.id === choice.selectedId);
  if (!chosen) return null;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 text-sm">
        <p className="text-xs text-muted-foreground">Ad account</p>
        <p className="font-medium">{chosen.name}</p>
        <p className="text-xs text-muted-foreground">
          {[chosen.businessName, chosen.id, chosen.currency]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <a
        href={`/connect/${token}/meta/start?returnTo=connect`}
        className="text-sm underline"
      >
        Change account
      </a>
    </div>
  );
}
