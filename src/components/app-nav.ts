import {
  AppWindow,
  Building2,
  Calendar,
  CircleDollarSign,
  ClipboardCheck,
  Database,
  FileText,
  Gauge,
  Globe,
  Handshake,
  Image as ImageIcon,
  Inbox as InboxIcon,
  Layers,
  LayoutTemplate,
  ListTree,
  type LucideIcon,
  Mail,
  Map,
  Megaphone,
  MessageSquare,
  Newspaper,
  Crosshair,
  Radar,
  MailCheck,
  Repeat,
  Radio,
  Rows3,
  Sparkles,
  Target,
  Users,
} from "lucide-react";

/**
 * The app's sections, in sidebar order. One list feeds the sidebar and the
 * command menu, so a section added here is reachable from both.
 */
/**
 * A view of the sidebar for one kind of work. "performance" is the paid-media
 * path (brand, ads, accounts, the library behind the cards); "all" is the
 * whole app. Stored per browser, so a marketer's sidebar stays short.
 */
export type NavFocus = "all" | "performance";
export const NAV_FOCUS_STORAGE_KEY = "growth_nav_focus";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  exact?: boolean;
  /** Focuses this item belongs to besides "all". */
  focus?: readonly Exclude<NavFocus, "all">[];
};

/** The sidebar groups as one focus sees them; empty groups drop out. */
export function navGroupsFor(focus: NavFocus) {
  if (focus === "all") return NAV_GROUPS;
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.focus?.includes(focus)),
  })).filter((group) => group.items.length > 0);
}

export const NAV_GROUPS: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { label: "Next", href: "/app/next", icon: MessageSquare },
      { label: "Review", href: "/app/review", icon: ClipboardCheck },
    ],
  },
  {
    label: "Wander Performance",
    items: [
      { label: "Accounts", href: "/app/performance", icon: Handshake, focus: ["performance"] },
    ],
  },
  {
    label: "Brand map",
    items: [
      { label: "Brands", href: "/app/brands", icon: Building2, focus: ["performance"] },
      { label: "Channels", href: "/app/channels", icon: Radio },
      { label: "Website", href: "/app/website", icon: Globe },
      { label: "Apps & marketplaces", href: "/app/apps", icon: AppWindow },
      { label: "Product Atlas", href: "/app/product-atlas", icon: Map },
      { label: "Personas", href: "/app/audiences", icon: Target },
    ],
  },
  {
    label: "Plan & publish",
    items: [
      { label: "Content", href: "/app/content", icon: FileText },
      { label: "Series", href: "/app/series", icon: ListTree },
      { label: "Calendar", href: "/app/calendar", icon: Calendar },
      { label: "Campaigns", href: "/app/campaigns", icon: Megaphone },
      { label: "Studio", href: "/app/studio", icon: Sparkles },
    ],
  },
  {
    label: "Observe",
    items: [
      { label: "Timeline", href: "/app/feed-v5", icon: Rows3 },
      { label: "Blog", href: "/app/blog", icon: Newspaper },
      { label: "Newsletters", href: "/app/newsletters", icon: Mail },
      { label: "Ads", href: "/app/ads", icon: Crosshair, focus: ["performance"] },
      { label: "Spend", href: "/app/spend", icon: CircleDollarSign, focus: ["performance"] },
      { label: "Inbox", href: "/app/inbox", icon: InboxIcon },
      { label: "Listen", href: "/app/listen", icon: Radar },
    ],
  },
  {
    label: "Grow",
    items: [
      { label: "Leads", href: "/app/leads", icon: Database, exact: true, focus: ["performance"] },
      {
        // Not a route of its own — send-review was deleted (same table, same
        // scorer, a drifting copy of the same card) and its default view lives
        // on as this URL into the leads review density. Named for what it opens,
        // not for the dead route: keeping "Send review" here made the deletion
        // look like it never happened.
        label: "Review queue",
        href: "/app/leads?pop=target&view=review",
        icon: ClipboardCheck,
      },
      { label: "Pre-gen sites", href: "/app/pregen", icon: Globe },
      { label: "Lifecycle", href: "/app/lifecycle", icon: Repeat },
      { label: "Transactional", href: "/app/transactional", icon: MailCheck },
    ],
  },
  {
    label: "Library",
    items: [
      { label: "Media", href: "/app/media", icon: ImageIcon, focus: ["performance"] },
      {
        label: "Compositions",
        href: "/app/compositions",
        icon: LayoutTemplate,
        focus: ["performance"],
      },
      { label: "Pillars", href: "/app/pillars", icon: Layers },
      { label: "People", href: "/app/people", icon: Users },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Affiliate", href: "/app/affiliate", icon: Handshake },
      { label: "Engineering", href: "/app/engineering", icon: Gauge },
    ],
  },
];
