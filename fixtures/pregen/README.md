# Pregen real-run fixtures

These fixtures preserve selected real Pregen builds for deterministic workbench
development and regression tests. They are exports of persisted runs, not
handwritten example businesses.

The export deliberately omits the prospect preview token and property-page
Markdown. It keeps the homepage source corpus, build trace, generated artifact,
property extraction, and any build-scoped visual receipt.

Export a run with:

```sh
bun --conditions=react-server scripts/lab/export-pregen-run-fixture.ts <build-id>
```
