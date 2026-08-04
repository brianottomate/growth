/**
 * Exact additive DDL for immutable Pregen evaluation receipts.
 *
 * Development and production currently share one Neon database, so running
 * this script is an intentional production operation. Rehearse the SQL on a
 * temporary Neon branch first. Do not replace it with an unattended db:push.
 *
 *   bun --conditions=react-server scripts/apply-pregen-evaluation-receipt-schema.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(sql`
  create table if not exists public.pregen_native_evaluation_receipt (
    id text primary key,
    build_id text not null references public.pregen_native_build(id) on delete cascade,
    kind text not null,
    status text not null,
    evaluator_type text not null,
    evaluator_name text not null,
    evaluator_version text not null,
    model text,
    input_refs jsonb not null,
    result jsonb not null,
    created_at timestamp not null default now(),
    constraint pregen_native_evaluation_receipt_kind_check check (
      kind in (
        'source_fidelity',
        'grounding',
        'responsive',
        'editorial',
        'visual_quality',
        'image_selection'
      )
    ),
    constraint pregen_native_evaluation_receipt_status_check check (
      status in ('passed', 'failed', 'needs_review')
    ),
    constraint pregen_native_evaluation_receipt_evaluator_type_check check (
      evaluator_type in ('deterministic', 'model', 'human')
    )
  )
`);

await db.execute(sql`
  create index if not exists pregen_native_evaluation_receipt_build_created_idx
    on public.pregen_native_evaluation_receipt (build_id, created_at)
`);

await db.execute(sql`
  create index if not exists pregen_native_evaluation_receipt_build_kind_created_idx
    on public.pregen_native_evaluation_receipt (build_id, kind, created_at)
`);

console.log("Pregen evaluation receipt schema is ready.");
