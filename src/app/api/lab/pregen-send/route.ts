import { NextResponse } from "next/server";
import { z } from "zod";

import { enrolPregenDomains } from "@/server/services/pregen-send.service";
import { assertLabAccess } from "@/server/lab-access";

/**
 * Enrol a batch of pregen prospects in Kyle's sequence, from a script.
 *
 * Exists for the same reason as /api/lab/pregen-builds: the per-row button in
 * /app/leads needs a browser session, and batch sends happen from wherever the
 * operator is. This is NOT another send path — the shared service builds a
 * server-side caller for the same `leads.startPregenSequence` mutation the
 * button invokes. Dry by default: reports who WOULD be enrolled, calls HubSpot
 * for nothing.
 */

const BodySchema = z.object({
  domains: z.array(z.string().trim().min(3)).min(1).max(10),
  apply: z.boolean().default(false),
});

export async function POST(request: Request) {
  const denied = await assertLabAccess(request);
  if (denied) return denied;

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { apply } = parsed.data;
  const domains = [...new Set(parsed.data.domains.map((d) => d.toLowerCase()))];

  const results = await enrolPregenDomains(domains, {
    apply,
    actor: { id: "lab-pregen-send", email: "growth-lab@wander.com" },
  });

  return NextResponse.json({ mode: apply ? "apply" : "dry", results });
}
