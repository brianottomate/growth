# Signals — inbound messages, and how far to generalize them

**Status:** design note, 2026-07-09 (Kristian's framing, captured so future work
uses the same vocabulary).

A **signal** is any message the outside world pushes at us. Email is the
primary signal type and the only one live today; SMS and WhatsApp are plausible
next ones; Impact's event postbacks are arguably a fourth. This note pins down
the generalization rule so we neither rebuild email handling per domain nor
drown the domains in a universal-inbox abstraction.

## The rule: generalize the TRANSPORT, never the STORAGE

**Common at the edge** — every transport normalizes into the same conceptual
shape before routing:

```
InboundSignal {
  channel:    "email" | "sms" | "whatsapp" | …
  externalId: string        // transport's id (Resend email id, Twilio SID)
  from:       string
  to:         string[]      // routing key — address, number, etc.
  subject?:   string        // email-only
  text:       string | null
  receivedAt: string
  raw:        unknown       // full payload, always kept
}
```

**Domain-specific at rest** — signals land in the table of the domain that owns
them, because the lifecycle IS the domain:

| Domain | Landing table | Lifecycle |
|---|---|---|
| Social listening (F5Bot alerts) | `mention` | new → engaged/skipped |
| Affiliate ops (partnerships@ mail) | `affiliate_item` | open → handled/dismissed |
| Content inspiration (competitor newsletters) | `brand_inspiration` | (its own) |

A universal `signal` table would flatten exactly the semantics (assignment,
proof-of-work, dedup keys, Slack trails) that make each desk usable. Same
philosophy as leads (one system of record, projections) and listening (shared
engine, domain tables).

## Where this lives today

The seam is the **recipient switch in `src/app/api/webhooks/resend/route.ts`**:
Resend inbound (catch-all on `lexaomo.resend.app`) fires the webhook, we fetch
the full email, and route by recipient local-part —

- `f5bot@…` → `f5bot.service.ts` → `mention`
- `inspo+<brandId>@…` → `inspiration-newsletter.service.ts` → `brand_inspiration`
- `affiliate+<programId>@…` → `affiliate-inbound.service.ts` → `affiliate_item`

The `+<token>` convention is the routing payload: it names the brand/program so
ingest resolves ownership deterministically. Unrouted recipients are logged and
ignored (visible in Vercel logs and the Resend dashboard — nothing is silently
lost, but unrouted mail is not persisted).

Downstream, every domain reuses the same engines: `triage.service.ts` for
scoring/drafting, `postOnSlack` radio broadcasts, and desk UIs with the shared
lifecycle grammar.

## Junk policy (affiliate, and the default for future signal domains)

Nothing is dropped. Every routed signal persists with its full text in `raw`
(Neon capacity is a non-issue — the whole DB is ~74 MB). Triage then sorts:

- **engage** → radio ping + Open queue
- **monitor** → Open queue, no ping
- **skip** → **auto-dismissed** with `decisionNote = "Auto-dismissed by triage: …"`,
  `resolvedById = null` (= the system filed it), one-click Reopen. The weekly
  report carries the auto-filed count so silent filtering stays auditable.

Attachments stay on the transport's side (Resend), reachable via the stored
`externalId` while retained; pipe them to R2 only if that ever becomes a real
need.

## When to extract more

Do **not** build the `InboundSignal` registry, a signal landing table, or a
transport interface now — one transport, three consumers doesn't justify it.
Extract when one of these fires:

1. **A second transport arrives** (Twilio SMS/WhatsApp webhook): extract the
   normalize-then-route registry so both transports feed the same domain
   handlers, keyed by (channel, recipient pattern).
2. **Replay/audit of unrouted signals matters**: add a minimal landing table
   for unrouted-only, not for everything.
3. **Two domains want the same signal**: the router learns fan-out to multiple
   handlers; storage still stays per-domain.
