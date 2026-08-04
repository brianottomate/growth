import Link from "next/link";

// Lab index — the directory of everything in the private workspace.
// Add new experiments here so they stay findable.

const PAGES: { name: string; href: string; note?: string }[] = [
  {
    name: "Property showcase",
    href: "/lab/property-showcase",
    note: "North Topsail scroll-world storyboard",
  },
  {
    name: "Property-card motion",
    href: "/lab/motion",
    note: "original masked hover vs full-frame treatment",
  },
  {
    name: "OG map",
    href: "/lab/og-map",
    note: "wander.com OG-image audit (Firecrawl)",
  },
  {
    name: "Tracking audit",
    href: "/lab/tracking-audit",
    note: "provider × surface matrix",
  },
  { name: "Whiteboard", href: "/lab/whiteboard" },
  { name: "Pregen sites", href: "/lab/pregen-sites" },
  {
    name: "Pregen run workbench",
    href: "/lab/pregen-review",
    note: "live persisted runs: source capture, renderer, evaluation receipts",
  },
  {
    name: "Blog golden run",
    href: "/lab/blog-workbench",
    note: "SEO brief → grounding → Opus article → receipts, fixture-backed",
  },
  { name: "Growth system", href: "/lab/growth-system", note: "system map" },
  { name: "Message streams", href: "/lab/message-streams", note: "system map" },
  { name: "System map", href: "/lab/system" },
];

const DIAGNOSTICS: { name: string; href: string; note?: string }[] = [
  {
    name: "BigQuery",
    href: "/api/lab/bigquery",
    note: "connectivity + table access; ?email= for lead lookup",
  },
  { name: "BigQuery analytics", href: "/api/lab/bigquery-analytics" },
  { name: "BigQuery conversions", href: "/api/lab/bigquery-conversions" },
  {
    name: "BigQuery property images",
    href: "/api/lab/bigquery-property-images",
  },
  { name: "Customer.io", href: "/api/lab/cio" },
  { name: "Minerva", href: "/api/lab/minerva" },
  { name: "Outreach", href: "/api/lab/outreach" },
  { name: "Meta", href: "/api/lab/meta" },
  { name: "Instantly", href: "/api/lab/instantly" },
  { name: "Instantly write-test", href: "/api/lab/instantly-write" },
  { name: "CIO→Outreach dry-run", href: "/api/lab/cio-to-outreach" },
];

export default function LabIndexPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Lab</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Private workspace — prototypes, system maps, and integration
          diagnostics. Admin-gated; API routes also accept{" "}
          <code>Authorization: Bearer &lt;ADMIN_TOKEN&gt;</code> for curl.
        </p>
      </div>

      <section>
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
          Pages
        </h2>
        <ul className="space-y-2">
          {PAGES.map((p) => (
            <li key={p.href}>
              <Link href={p.href} className="text-primary hover:underline">
                {p.name}
              </Link>
              {p.note && (
                <span className="text-muted-foreground ml-2 text-xs">
                  {p.note}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
          Integration diagnostics (JSON)
        </h2>
        <ul className="space-y-2">
          {DIAGNOSTICS.map((d) => (
            <li key={d.href}>
              <Link href={d.href} className="text-primary hover:underline">
                {d.name}
              </Link>
              {d.note && (
                <span className="text-muted-foreground ml-2 text-xs">
                  {d.note}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
