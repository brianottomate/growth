import { Button } from "@wandercom/design-system-web/ui/button";
import { Text } from "@wandercom/design-system-web/ui/text";
import { ToggleGroup, ToggleGroupItem } from "@wandercom/design-system-web/ui/toggle-group";
import { ChevronRightIcon, XIcon } from "lucide-react";
import { useState } from "react";

import type { BlockEntry } from "../data/manifest";
import { manifest } from "../data/manifest";
import type { TemplateEntry } from "../data/templates";
import { templates } from "../data/templates";
import type { Selection } from "./PreviewApp";
import { ThemeCustomizer } from "./ThemeCustomizer";

export type SidebarTab = "sections" | "templates";

type SelectKind = "block" | "template";

type Props = {
  selection: Selection;
  onSelect: (kind: SelectKind, id: string) => void;
  isOpen: boolean;
  onClose: () => void;
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
};

const SECTION_LABELS: Record<string, string> = {
  hero: "Hero",
  content: "Content",
  services: "Services",
  categories: "Categories",
  reviews: "Reviews",
  metrics: "Metrics",
  video: "Video",
  photos: "Photos",
  faqs: "FAQs",
  "feature-list": "Feature List",
  "key-selling-points": "Key Selling Points",
  cta: "Call to Action",
  form: "Form",
  html: "HTML",
  "blog-gallery": "Blog Gallery",
  "collection-gallery": "Collection Gallery",
  cards: "Cards",
  testimonials: "Testimonials",
  "homepage-hero": "Homepage Hero",
  "search-bar": "Search Bar",
  "property-gallery": "Property Gallery",
  team: "Team",
};

type Group = { sectionType: string; label: string; blocks: BlockEntry[] };

const groups: Group[] = Object.entries(
  manifest.reduce(
    (acc, block) => {
      const k = block.sectionType;
      if (!acc[k]) acc[k] = [];
      acc[k].push(block);
      return acc;
    },
    {} as Record<string, BlockEntry[]>,
  ),
).map(([sectionType, blocks]) => ({
  sectionType,
  label: SECTION_LABELS[sectionType] ?? sectionType,
  blocks,
}));

function variantLabel(block: BlockEntry): string {
  if (!block.sectionVariant) return "Default";
  return block.sectionVariant
    .replace(new RegExp(`^${block.sectionType}-`), "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function SidebarItem({
  block,
  isActive,
  onSelect,
  indent = false,
}: {
  block: BlockEntry;
  isActive: boolean;
  onSelect: (kind: SelectKind, id: string) => void;
  indent?: boolean;
}) {
  return (
    <button
      onClick={() => onSelect("block", block.id)}
      className={[
        "w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors",
        indent ? "pl-7" : "",
        isActive
          ? "bg-surface-tertiary text-primary font-medium"
          : "text-secondary hover:bg-surface-secondary hover:text-primary",
        "cursor-pointer",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {indent ? variantLabel(block) : block.title}
    </button>
  );
}

function TemplateItem({
  template,
  isActive,
  onSelect,
}: {
  template: TemplateEntry;
  isActive: boolean;
  onSelect: (kind: SelectKind, id: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect("template", template.id)}
      className={[
        "w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors",
        isActive
          ? "bg-surface-tertiary text-primary font-medium"
          : "text-secondary hover:bg-surface-secondary hover:text-primary",
        "cursor-pointer",
      ].join(" ")}
    >
      {template.title}
    </button>
  );
}

function SidebarGroup({
  group,
  selection,
  openGroups,
  onToggle,
  onSelect,
}: {
  group: Group;
  selection: Selection;
  openGroups: Set<string>;
  onToggle: (key: string) => void;
  onSelect: (kind: SelectKind, id: string) => void;
}) {
  const isOpen = openGroups.has(group.sectionType);
  const hasMultiple = group.blocks.length > 1;
  const activeBlockId = selection.kind === "block" ? selection.id : null;
  const isGroupActive = group.blocks.some((b) => b.id === activeBlockId);

  if (!hasMultiple) {
    const block = group.blocks[0];
    return <SidebarItem block={block} isActive={block.id === activeBlockId} onSelect={onSelect} />;
  }

  return (
    <div>
      <button
        onClick={() => onToggle(group.sectionType)}
        className={[
          "flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm transition-colors",
          isGroupActive && !isOpen
            ? "bg-surface-tertiary text-primary font-medium"
            : "text-secondary hover:bg-surface-secondary hover:text-primary",
        ].join(" ")}
      >
        <span>{group.label}</span>
        <ChevronRightIcon
          className={[
            "text-tertiary size-3.5 shrink-0 transition-transform duration-150",
            isOpen ? "rotate-90" : "",
          ].join(" ")}
        />
      </button>

      {isOpen && (
        <div className="mt-0.5 flex flex-col gap-0.5 pb-1">
          {group.blocks.map((block) => (
            <SidebarItem
              key={block.id}
              block={block}
              isActive={block.id === activeBlockId}
              onSelect={onSelect}
              indent
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ selection, onSelect, isOpen, onClose, tab, onTabChange }: Props) {
  const activeBlockId = selection.kind === "block" ? selection.id : null;
  const activeTemplateId = selection.kind === "template" ? selection.id : null;

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (activeBlockId) {
      const block = manifest.find((b) => b.id === activeBlockId);
      if (block) initial.add(block.sectionType);
    }
    return initial;
  });

  const effectiveOpenGroups = (() => {
    const s = new Set(openGroups);
    if (activeBlockId) {
      const block = manifest.find((b) => b.id === activeBlockId);
      if (block) s.add(block.sectionType);
    }
    return s;
  })();

  const toggle = (key: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  const handleSelect = (kind: SelectKind, id: string) => {
    onSelect(kind, id);
    onClose();
  };

  const tabs = (
    <div className="px-4 py-3">
      <ToggleGroup
        type="single"
        size="sm"
        value={tab}
        onValueChange={(v) => {
          if (v === "sections" || v === "templates") onTabChange(v);
        }}
        className="w-full"
      >
        <ToggleGroupItem value="sections" className="flex-1">
          Sections
        </ToggleGroupItem>
        <ToggleGroupItem value="templates" className="flex-1">
          Templates
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );

  const nav = (
    <>
      {tabs}
      <nav className="flex-1 overflow-y-auto overscroll-none p-2">
        {tab === "sections" ? (
          <div className="flex flex-col gap-0.5">
            {groups.map((group) => (
              <SidebarGroup
                key={group.sectionType}
                group={group}
                selection={selection}
                openGroups={effectiveOpenGroups}
                onToggle={toggle}
                onSelect={handleSelect}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {templates.map((template) => (
              <TemplateItem
                key={template.id}
                template={template}
                isActive={template.id === activeTemplateId}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </nav>

      <div className="border-surface-tertiary relative shrink-0 border-t px-4 py-3">
        <div className="flex items-center justify-between">
          <Text variant="body-sm" color="tertiary" as="span">
            {tab === "templates" ? `${templates.length} templates` : `${manifest.length} blocks`}
          </Text>
          <ThemeCustomizer />
        </div>
      </div>
    </>
  );

  return (
    <>
      <aside className="border-surface-tertiary bg-surface-primary hidden h-screen w-[260px] shrink-0 flex-col border-r lg:flex">
        <div className="border-surface-tertiary flex h-[52px] shrink-0 items-center border-b px-4">
          <Text variant="body" color="primary" weight="medium">
            Blocks Preview
          </Text>
        </div>
        {nav}
      </aside>

      <div
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-200 lg:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden
      />

      <aside
        className={`border-surface-tertiary bg-surface-primary fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r transition-transform duration-200 ease-in-out lg:hidden ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-surface-tertiary flex h-[52px] shrink-0 items-center justify-between border-b px-4">
          <Text variant="body-sm" color="primary" weight="medium">
            Blocks Preview
          </Text>
          <Button
            variant="ghost"
            size="icon-md"
            onClick={onClose}
            className="text-tertiary hover:bg-surface-secondary hover:text-primary size-8"
            aria-label="Close sidebar"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
        {nav}
      </aside>
    </>
  );
}
