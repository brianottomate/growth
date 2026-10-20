import {
  AppWindow,
  Building2,
  Calendar,
  CircleDollarSign,
  Table2,
  ClipboardCheck,
  Database,
  FileText,
  FlaskConical,
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
  Landmark,
} from "lucide-react";

/**
 * The app's sections, in sidebar order. One list feeds the sidebar and the
 * command menu, so a section added here is reachable from both.
 */
export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  exact?: boolean;
};

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
      {
        label: "Dashboard",
        href: "/app/performance",
        icon: Crosshair,
        exact: true,
      },
      { label: "Prospects", href: "/app/performance/prospects", icon: Target },
      {
        label: "Influencers",
        href: "/app/performance/influencer-collections",
        icon: Layers,
      },
      {
        label: "Clients",
        href: "/app/performance/clients",
        icon: Building2,
      },
    ],
  },
  {
    // Older detailed and prototype views kept reachable.
    label: "Archive",
    items: [
      { label: "Finance", href: "/app/performance/finance", icon: Landmark },
      {
        label: "Campaigns",
        href: "/app/performance/campaigns",
        icon: Megaphone,
      },
      {
        label: "Tracker",
        href: "/app/performance/tracker",
        icon: Table2,
      },
      {
        label: "Prototype",
        href: "/app/performance/prototype",
        icon: FlaskConical,
      },
    ],
  },
  {
    label: "Brand map",
    items: [
      { label: "Brands", href: "/app/brands", icon: Building2 },
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
      { label: "Initiatives", href: "/app/initiatives", icon: Target },
      { label: "Calendar", href: "/app/calendar", icon: Calendar },
      { label: "Campaigns", href: "/app/campaigns", icon: Megaphone },
      { label: "Studio", href: "/app/studio", icon: Sparkles },
    ],
  },
  {
    label: "Observe",
    items: [
      { label: "Landscape", href: "/app/landscape", icon: Globe },
      { label: "Timeline", href: "/app/feed-v5", icon: Rows3 },
      { label: "Blog", href: "/app/blog", icon: Newspaper },
      { label: "Newsletters", href: "/app/newsletters", icon: Mail },
      { label: "Spend", href: "/app/spend", icon: CircleDollarSign },
      { label: "Inbox", href: "/app/inbox", icon: InboxIcon },
      { label: "Listen", href: "/app/listen", icon: Radar },
    ],
  },
  {
    label: "Grow",
    items: [
      { label: "Leads", href: "/app/leads", icon: Database, exact: true },
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
      { label: "Media", href: "/app/media", icon: ImageIcon },
      {
        label: "Compositions",
        href: "/app/compositions",
        icon: LayoutTemplate,
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
      { label: "Team tools", href: "/app/admin", icon: FlaskConical },
    ],
  },
];
