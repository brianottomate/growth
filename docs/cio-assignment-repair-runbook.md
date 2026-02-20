# CIO Assignment Diagnostic + Repair Runbook

This flow avoids guessing `hoursBack` by auditing a batch of recent Outreach prospects and repairing only detected mismatches.

## 1) Diagnostic (read-only)

Pull the latest Outreach prospects, compare owner in Outreach vs assignment in Customer.io, and emit a JSON report.

```bash
bun run cio:diagnose --source outreach --limit 1000 --concurrency 5
```

Optional file-driven mode (JSON or CSV with `email`):

```bash
bun run cio:diagnose --source file --input ./data/emails.csv --limit 1000
```

## 2) Repair dry-run

Use the diagnostic report as input and preview writes.

```bash
bun run cio:repair --input ./reports/cio-assignment-diagnostic-<timestamp>.json --concurrency 3
```

## 3) Repair apply

Execute writes for actionable rows (`missing_cio_assignment` and `mismatch`).

```bash
bun run cio:repair --input ./reports/cio-assignment-diagnostic-<timestamp>.json --apply true --concurrency 3
```

## Notes

- Scripts set `SKIP_ENV_VALIDATION=1` internally to avoid unrelated env blocking.
- Repair only writes when Outreach owner has both `id` and `email`.
- Output reports are written to `./reports/` by default.
