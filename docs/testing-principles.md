# Testing principles

Growth tests exist to protect product behavior and operational safety. A test is
worth keeping when its failure would identify a real regression in a business
rule, operator outcome, security boundary, data contract, or provider boundary.

## The 10% rule

Treat tests as a scarce maintenance budget. Write or retain the highest-value
roughly 10% of plausible unit tests and default to omitting the other 90%.
Do not automatically pair every helper, component, branch, or refactor with a
new test file. Routine labels, styling, layout, formatting, and reversible
implementation changes usually need the existing static gates and appropriate
manual or preview verification, rather than more unit tests.

Prioritize failures that can cause unauthorized access, unintended spend or
sends, cross-brand data exposure, destructive reconciliation, lost operator
work, incorrect financial attribution, or a broken provider contract. Prefer
one test at the meaningful boundary over many tests of its internal helpers.
Keep required positive cases alongside rejection cases so a guard that rejects
everything cannot masquerade as correct protection.

A new test must earn its place: state the concrete failure it catches and why
the existing suite or contract gate does not already catch it. A real bug with
a consequential outcome is a good reason to add a small regression test.
Look for weaker or duplicate tests to replace, but do not remove essential
protection to meet a quota. This is not a hard test-count cap, a coverage target,
or a requirement to delete 90% of every future batch of tests.

The retention decisions in `docs/testing-retention-plan.json` record the initial
reset and its exceptions. They are historical evidence, not an expanding
allowlist that future work must ask permission to change.

## Hard constraint

Do not add or keep a test solely to increase coverage or exercise mock wiring.

Before adding a test, state the behavior in business terms. Good examples:

- an operator cannot be redirected to an external callback after authentication;
- a platform campaign outside a campaign's channel or active window is not suggested;
- recipient data and credentials never cross an email handoff boundary;
- spend from overlapping sources is attributed once;
- generated outreach cannot claim unsupported product behavior.

If the only useful description is "calls helper X," "invokes dependency Y," or
"covers branch Z," test the observable behavior instead or delete the test.

## Review checklist

A test should satisfy all of these:

1. It names the decision, outcome, or invariant it protects.
2. It asserts an observable result rather than a private sequence of calls.
3. Its fixtures contain only the domain facts needed to explain the scenario.
4. It can fail when the protected behavior changes incorrectly.
5. It does not duplicate a stronger test at a more meaningful boundary.
6. Its expected regression cost justifies maintaining it under the 10% rule.

Mocks are acceptable only when an external boundary cannot be exercised safely
or deterministically. In that case, assertions still belong on the resulting
business behavior—not on call counts alone. Infrastructure shims such as the
`server-only` test setup are not substitutes for domain assertions.

There is intentionally no coverage target. Review value is determined by the
business behavior protected, and `bun test` is the normal unit-test gate.
