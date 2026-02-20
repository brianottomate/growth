import Link from "next/link";
import { BarChart3 } from "lucide-react";

import { cn } from "@/components/ui";
import { Heading } from "@wandercom/design-system-web/ui/heading";

import HeaderClient from "./HeaderClient";

// Navigation structure for the header
const navigation = {
  product: [
    {
      name: "Features",
      description: "See what we can do for you",
      href: "/#features",
      icon: "ChartPieIcon" as const,
    },
    {
      name: "How it Works",
      description: "Learn how it works",
      href: "/#how-it-works",
      icon: "CursorArrowRaysIcon" as const,
    },
    {
      name: "About",
      description: "Learn more about us",
      href: "/#about",
      icon: "FingerPrintIcon" as const,
    },
  ],
  callsToAction: [],
  simple: [{ name: "Blog", href: "/blog" }],
};

interface HeaderProps {
  container?: boolean;
  showBanner?: boolean;
}

export default function Header({
  container = false,
  showBanner = false,
}: HeaderProps) {
  return (
    <header
      className={cn(
        "bg-surface-primary/80 border-primary sticky inset-x-0 z-30 border-b backdrop-blur-sm",
        showBanner ? "top-28 md:top-16 lg:top-12" : "top-0",
      )}
    >
      <nav
        aria-label="Global"
        className={cn(
          "flex items-center justify-between p-6 lg:px-8",
          container ? "mx-auto max-w-7xl" : "mx-auto max-w-7xl",
        )}
      >
        {/* Logo Section */}
        <div className="flex lg:flex-1">
          <Link href="/" className="flex items-center space-x-2">
            <div className="bg-surface-secondary border-secondary flex size-6 items-center justify-center rounded-md border">
              <BarChart3 className="text-primary size-4" />
            </div>
            <Heading variant="headline-sm" asChild className="text-xl">
              <span>Wander</span>
            </Heading>
          </Link>
        </div>

        <HeaderClient navigation={navigation} />
      </nav>
    </header>
  );
}
