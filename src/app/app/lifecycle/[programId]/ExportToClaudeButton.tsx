"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export type ExportStep = {
  name: string;
  delayMinutes: number | null;
  delayLabel: string | null;
  channel: string;
  system: string | null;
  subject: string | null;
  body: string | null;
};

export type ExportProgram = {
  name: string;
  description: string | null;
  kind: string;
  workspace: string;
  intendedTrigger: string | null;
};

function formatDelay(min: number | null, label: string | null): string {
  if (label) return label;
  if (min == null) return "—";
  if (min === 0) return "Day 0 (immediately)";
  if (min % 1440 === 0) return `Day ${min / 1440}`;
  if (min % 60 === 0) return `${min / 60}h after start`;
  return `${min}m after start`;
}

/**
 * Serialize a program + its steps into a self-contained sparring brief and hand
 * it to Claude. We deliberately DON'T build an in-house critique loop — the
 * brief lands on the clipboard and we open a fresh Claude chat to paste into,
 * so the sequence review happens where the model is actually good at it.
 */
function buildBrief(program: ExportProgram, steps: ExportStep[]): string {
  const stepBlocks = steps.length
    ? steps
        .map((s, i) => {
          const meta = [
            formatDelay(s.delayMinutes, s.delayLabel),
            s.channel,
            s.system ?? "untagged",
          ].join(" · ");
          return [
            `### Step ${i + 1} — ${s.name}`,
            `_${meta}_`,
            s.subject ? `**Subject:** ${s.subject}` : "**Subject:** _(none — same-thread follow-up)_",
            "",
            s.body?.trim() ? s.body.trim() : "_(no copy written yet)_",
          ].join("\n");
        })
        .join("\n\n")
    : "_(no steps yet)_";

  return `# Sequence review — ${program.name}

I'm building a cold-outbound email sequence and want you to spar with me on it. Be specific and opinionated, not diplomatic.

## Context
- **Goal / rationale:** ${program.description?.trim() || "(not specified)"}
- **Type:** ${program.kind} · **Workspace:** ${program.workspace}
- **Audience / trigger:** ${program.intendedTrigger?.trim() || "cold prospects (vacation-rental / property-management operators)"}
- **Merge variables available per lead:** \`{{firstName}}\`, \`{{companyName}}\`, \`{{domain}}\`, plus enrichment (detected PMS, estimated unit count, location) we can expose as custom variables. Fallback syntax is \`{{firstName|there}}\`.

## Current sequence (${steps.length} step${steps.length === 1 ? "" : "s"})

${stepBlocks}

## What I want from you
Review against cold-email best practice and push back where it's weak:
1. **Cadence & timing** — are the gaps between touches right? Too compressed / too sparse?
2. **Angle variation** — does each touch bring a new reason to care, or is it the same pitch repeated?
3. **Personalization** — where could the enrichment data make this land harder?
4. **Deliverability** — anything that risks spam filtering (links/images early, spammy phrasing, length)?
5. **CTA / conversion** — is the ask clear and is the conversion event right (reply vs. booked call)?

Walk me through your reasoning for each change. Then, so I can re-import your revision verbatim, end your reply with a single fenced \`\`\`json code block (nothing after it) — an array of steps in send order, each with: \`name\`, \`delayDays\` (number, days from start), \`subject\` (empty string for same-thread follow-ups), and \`body\` (plain text, keep merge tags like {{firstName|there}}).`;
}

export function ExportToClaudeButton({
  program,
  steps,
}: {
  program: ExportProgram;
  steps: ExportStep[];
}) {
  const [copied, setCopied] = useState(false);

  async function exportToClaude() {
    const brief = buildBrief(program, steps);
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast.success("Sequence brief copied — paste it into the Claude tab");
    } catch {
      toast.error("Couldn't copy to clipboard");
      return;
    }
    window.open("https://claude.ai/new", "_blank", "noopener,noreferrer");
  }

  return (
    <Button variant="outline" size="sm" onClick={exportToClaude}>
      {copied ? (
        <Check className="size-4 text-emerald-500" />
      ) : (
        <Sparkles className="size-4" />
      )}
      Spar with Claude
    </Button>
  );
}
