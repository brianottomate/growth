# Testing principles

Growth tests exist to protect product behavior and operational safety. A test is
worth keeping when its failure would identify a real regression in a business
rule, operator outcome, security boundary, data contract, or provider boundary.

## Hard constraint

Do not add or keep a test solely to increase coverage or exercise mock wiring.

Before adding a test, state the behavior in business terms. Good examples:

- an operator cannot be redirected to an external callback after authentication;
- a campaign outside an initiative's channel or active window is not suggested;
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

Mocks are acceptable only when an external boundary cannot be exercised safely
or deterministically. In that case, assertions still belong on the resulting
business behavior—not on call counts alone. Infrastructure shims such as the
`server-only` test setup are not substitutes for domain assertions.

There is intentionally no coverage target. Review value is determined by the
business behavior protected, and `bun test` is the normal unit-test gate.
