import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading client workspace"
      className="space-y-5"
    >
      <span className="sr-only">Loading client workspace…</span>
      {[0, 1, 2].map((card) => (
        <div
          key={card}
          aria-hidden="true"
          className="space-y-4 rounded-xl border p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-8 w-28" />
          </div>
          <Skeleton className="h-28 w-full" />
        </div>
      ))}
    </div>
  );
}
