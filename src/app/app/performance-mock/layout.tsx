import type { ReactNode } from "react";

/**
 * The fixture mock of the Performance client journey, kept apart from the live
 * desk under its own route. No "New client" action here: it is illustrative
 * only, on fictional data.
 */
export default function PerformanceMockLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">
        Wander Performance
      </h1>
      {children}
    </div>
  );
}
