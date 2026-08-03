// Packaging shim: the published @wandercom/website-registry dist imports the
// bare "@wandercom/design-system-icons" root, but the published icons package
// only exports "./*" subpaths. Alias the root to this re-export (wired in
// astro.config.mjs) until the upstream pair publishes with a "." export.
export { Icon } from "@wandercom/design-system-icons/icon";
