import {
  isZernioConfigured,
  listZernioAccounts,
  type ZernioAccount,
} from "@/server/clients/zernio.client";

export async function ZernioAccountsList() {
  if (!isZernioConfigured) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <code className="font-mono">ZERNIO_API_KEY</code> is not set — add it to{" "}
        <code className="font-mono">.env</code> to see connected accounts.
      </div>
    );
  }

  let accounts: ZernioAccount[];
  try {
    accounts = await listZernioAccounts();
  } catch (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        <p className="font-semibold">Failed to fetch accounts</p>
        <p className="mt-1 font-mono text-xs">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
        No accounts connected yet. Connect one in the Zernio dashboard.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
      {accounts.map((account) => {
        const id = account._id ?? account.id ?? "?";
        const label =
          account.displayName ?? account.name ?? account.username ?? id;
        return (
          <li
            key={id}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">
                {label}
              </p>
              <p className="mt-0.5 font-mono text-xs text-gray-500">{id}</p>
            </div>
            <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700">
              {account.platform}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
