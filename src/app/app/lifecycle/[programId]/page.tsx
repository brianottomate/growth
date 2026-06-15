import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

import { db } from "@/server/db";
import {
  brandTable,
  lifecycleProgramStepTable,
  lifecycleProgramTable,
  memberTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { ProgramFlow } from "./ProgramFlow";
import { StepBodies } from "./StepBodies";
import { ExportToClaudeButton } from "./ExportToClaudeButton";

const WORKSPACE_LABEL: Record<string, string> = {
  marketplace: "Marketplace",
  os: "WanderOS",
  shared: "Shared",
};

export default async function ProgramFlowPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const program = await db.query.lifecycleProgramTable.findFirst({
    where: eq(lifecycleProgramTable.id, programId),
    with: {
      steps: {
        orderBy: [
          asc(lifecycleProgramStepTable.delayMinutes),
          asc(lifecycleProgramStepTable.position),
        ],
        with: {
          campaign: { columns: { id: true, name: true, runState: true } },
        },
      },
    },
  });
  if (!program || program.deletedAt) notFound();

  // Same org-membership gate as the lifecycle overview page.
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, program.brandId),
  });
  if (!brand?.organizationId) notFound();
  const membership = await db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.userId, session.user.id),
      eq(memberTable.organizationId, brand.organizationId),
    ),
  });
  if (!membership) notFound();

  return (
    <div className="flex flex-col pb-8">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/app/lifecycle"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            <ArrowLeft className="size-3" />
            Lifecycle
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {program.name}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {WORKSPACE_LABEL[program.workspace] ?? program.workspace} ·{" "}
            {program.steps.length} step
            {program.steps.length === 1 ? "" : "s"}
            {program.description ? ` — ${program.description}` : ""}
          </p>
        </div>
        <ExportToClaudeButton
          program={{
            name: program.name,
            description: program.description,
            kind: program.kind,
            workspace: program.workspace,
            intendedTrigger: program.intendedTrigger,
          }}
          steps={program.steps.map((s) => ({
            name: s.name,
            delayMinutes: s.delayMinutes,
            delayLabel: s.delayLabel,
            channel: s.channel,
            system: s.system,
            subject: s.subject,
            body: s.body,
          }))}
        />
      </div>

      <ProgramFlow
        program={{
          name: program.name,
          intendedTrigger: program.intendedTrigger,
        }}
        steps={program.steps.map((s) => ({
          id: s.id,
          name: s.name,
          channel: s.channel,
          status: s.status,
          system: s.system,
          delayMinutes: s.delayMinutes,
          delayLabel: s.delayLabel,
          subject: s.subject,
          url: s.url,
          parentStepId: s.parentStepId,
          branchLabel: s.branchLabel,
          campaign: s.campaign
            ? { name: s.campaign.name, runState: s.campaign.runState }
            : null,
        }))}
      />

      <StepBodies
        steps={program.steps.map((s) => ({
          id: s.id,
          name: s.name,
          subject: s.subject,
          body: s.body,
          delayMinutes: s.delayMinutes,
          delayLabel: s.delayLabel,
        }))}
      />
    </div>
  );
}
