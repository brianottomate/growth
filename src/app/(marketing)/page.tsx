import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Heading } from "@wandercom/design-system-web/ui/heading";
import { Text } from "@wandercom/design-system-web/ui/text";
import { Button } from "@wandercom/design-system-web/ui/button";

// Every statically-reachable route, grouped. Dynamic routes (/blog/[slug],
// /app/org/[orgSlug], etc.) are omitted since they need an id to resolve.
const LINK_GROUPS: {
  label: string;
  links: { name: string; href: string }[];
}[] = [
  // NOTE: the old "Prototypes" group (system maps, whiteboard, tracking
  // audit) moved to /lab — Kristian's admin-gated private workspace. Don't
  // link lab pages from public surfaces.
  {
    label: "Marketing & misc",
    links: [
      { name: "Brand", href: "/brand" },
      { name: "Growth", href: "/growth" },
      { name: "Zernio", href: "/zernio" },
      { name: "Zernio ads", href: "/zernio/ads" },
      { name: "Design system", href: "/design-system" },
      { name: "Blog", href: "/blog" },
      { name: "Contact", href: "/contact" },
    ],
  },
];

export default function IntroPage() {
  return (
    <div className="relative isolate">
      {/* Subtle background glow */}
      <div
        className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
        aria-hidden="true"
      >
        <div
          className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-primary/30 to-primary opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
          style={{
            clipPath:
              "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
          }}
        />
      </div>

      <div className="mx-auto max-w-5xl px-6">
        {/* Hero */}
        <div className="flex flex-col items-center pt-24 pb-16 text-center sm:pt-32">
          <Heading variant={{ base: "display", md: "display-lg" }} as="h1">
            Wander <span className="text-primary">Growth</span>
          </Heading>

          <Text
            variant="body-lg-long"
            color="secondary"
            className="mt-6 max-w-2xl"
          >
            The growth team&apos;s back-office — brand and content operations,
            lead prospecting, lifecycle automation, and social listening, in one
            place.
          </Text>

          <div className="mt-10 flex items-center justify-center">
            <Link href="/app">
              <Button variant="primary" size="lg" className="gap-2">
                Open Growth
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Jump-to index — every reachable route in one click */}
        <div className="border-t border-secondary py-16">
          <Text
            as="h2"
            variant="body-sm"
            weight="medium"
            color="secondary"
            className="mb-8 tracking-wider uppercase"
          >
            Jump to
          </Text>
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3">
            {LINK_GROUPS.map((group) => (
              <div key={group.label}>
                <Text
                  as="h3"
                  variant="body-sm"
                  weight="medium"
                  className="mb-3"
                >
                  {group.label}
                </Text>
                <ul className="space-y-1.5">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
