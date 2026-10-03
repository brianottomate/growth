import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PipelineStudy } from "../PipelineStudy";

export const metadata = {
  title: "Pipeline fixture · Performance vision board",
};

export default function PipelineFixturePage() {
  return (
    <main className="flex h-dvh flex-col bg-background text-foreground">
      <header className="shrink-0 border-b px-8 py-6">
        <Link
          href="/lab/performance-board"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Performance vision board
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Pipeline fixture
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          An interactive study of pipeline cards and states, with sample client
          data.
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-auto bg-muted/20 p-8">
        <div className="min-w-[1800px]">
          <PipelineStudy />
        </div>
      </div>
    </main>
  );
}
