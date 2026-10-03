import Link from "next/link";
import { ArrowUpRight, Image, Gauge, Palette, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Team tools" };

const GROUPS = [
  {
    title: "Share cards & brand",
    icon: Image,
    description: "Prepare images and check the pages people share.",
    links: [
      {
        label: "OG Studio",
        href: "/lab/og-preview",
        note: "Live editor, preset wall, and PNG downloads",
      },
      {
        label: "Wander.com metadata audit",
        href: "/lab/og-map",
        note: "Inspect social cards and missing metadata",
      },
      {
        label: "Media library",
        href: "/app/media",
        note: "Find assets used by the team",
      },
    ],
  },
  {
    title: "Support & diagnostics",
    icon: Gauge,
    description: "Investigate data and tracking when teammates need help.",
    links: [
      {
        label: "Data health",
        href: "/app/engineering",
        note: "Live counts and data coverage by domain",
      },
      {
        label: "Tracking audit",
        href: "/lab/tracking-audit",
        note: "Provider and surface coverage",
      },
      {
        label: "Integration diagnostics",
        href: "/lab",
        note: "Authenticated provider inspection tools",
      },
    ],
  },
  {
    title: "Product workbenches",
    icon: Palette,
    description: "Review UI behavior and content generation.",
    links: [
      {
        label: "Design system",
        href: "/lab/design-system",
        note: "Shared components and style contracts",
      },
      {
        label: "Assistant gallery",
        href: "/lab/design-system/chat",
        note: "Conversation states and tool cards",
      },
      {
        label: "Pregen run review",
        href: "/lab/pregen-review",
        note: "Source captures and evaluation receipts",
      },
      {
        label: "Blog workbench",
        href: "/lab/blog-workbench",
        note: "Article generation and editorial receipts",
      },
    ],
  },
  {
    title: "Your account",
    icon: Users,
    description: "Maintain your profile and sign-in details.",
    links: [
      {
        label: "Account settings",
        href: "/app/account",
        note: "Profile and email verification",
      },
    ],
  },
];

export default function TeamToolsPage() {
  return (
    <div className="space-y-8 p-4 @xl:p-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Team tools</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          A home for Growth support tools and creative workbenches. Available to
          signed-in teammates. Diagnostics can contain live customer data.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-2">
        {GROUPS.map((group) => (
          <Card key={group.title}>
            <CardHeader>
              <group.icon className="mb-2 size-5 text-muted-foreground" />
              <CardTitle>{group.title}</CardTitle>
              <CardDescription>{group.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {group.links.map((link) => (
                <div key={link.href}>
                  <Button
                    asChild
                    variant="ghost"
                    className="w-full justify-between"
                  >
                    <Link href={link.href}>
                      {link.label}
                      <ArrowUpRight />
                    </Link>
                  </Button>
                  <p className="px-3 text-xs text-muted-foreground">
                    {link.note}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
