import { cn } from "@/components/ui/lib/utils";

/**
 * A rubber stamp for signed-off work. `fresh` thumps it down, for the moment
 * someone approves; on load it just sits there.
 */
export function ApprovedStamp({
  at,
  fresh = false,
  className,
}: {
  /** When it was approved; printed small under the word. */
  at?: string | Date | null;
  fresh?: boolean;
  className?: string;
}) {
  const date = at ? new Date(at) : null;
  return (
    <span
      role="img"
      aria-label="Approved"
      className={cn(
        "inline-flex -rotate-6 flex-col items-center rounded-md border-[3px] border-double border-current px-2 py-0.5 leading-none text-primary opacity-90 select-none",
        fresh &&
          "animate-in duration-300 ease-out fade-in spin-in-12 zoom-in-150",
        className,
      )}
    >
      <span className="text-[11px] font-bold tracking-[0.2em] uppercase">
        Approved
      </span>
      {date && !Number.isNaN(date.getTime()) && (
        <span className="mt-0.5 text-[8px] font-medium tracking-widest uppercase">
          {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      )}
    </span>
  );
}
