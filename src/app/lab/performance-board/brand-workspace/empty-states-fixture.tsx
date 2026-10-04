"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  Check,
  FileText,
  Globe,
  House,
  Image,
  Layers,
  MapPin,
  MessageSquare,
  Palette,
  Radio,
  RotateCcw,
  Send,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { WorkspaceMap } from "./workspace-map";
import {
  BrandStoryContent,
  MarketDetails,
} from "@/app/app/performance/brands/[brandSlug]/brand-content";

type Section = {
  id: string;
  group: string;
  title: string;
  description: string;
  empty: string;
  detail: string;
  action: string;
  icon: LucideIcon;
  result: string[];
  question: string;
  templates?: boolean;
};

const sections: Section[] = [
  {
    id: "identity",
    group: "Brand foundations",
    title: "Brand identity",
    icon: Palette,
    description:
      "The logo, colors and typography that carry through every piece of creative.",
    empty: "Give the brand a visual starting point",
    detail: "Use the brand’s website to prepare an identity you can refine.",
    action: "Create identity",
    result: [
      "Brand mark · Summit Stays",
      "Forest, cream and stone palette",
      "Serif headings · sans-serif body",
    ],
    question:
      "Would you like to explore the website’s existing identity or describe a different direction?",
  },
  {
    id: "story",
    group: "Brand foundations",
    title: "Brand story",
    icon: FileText,
    description:
      "What makes the brand distinctive, who books its homes, and how its copy should sound.",
    empty: "Give the creative a shared direction",
    detail:
      "Draft a story from the brand’s identity, homes and guest reviews, then save it here.",
    action: "Write story",
    result: [
      "Room to reconnect in the mountains.",
      "Families and friends looking for space to gather and easy access to the outdoors.",
      "Voice · warm, specific and quietly confident",
    ],
    question:
      "What should lead the story: time together, the mountain setting, or the homes themselves?",
  },
  {
    id: "markets",
    group: "Brand foundations",
    title: "Markets",
    icon: MapPin,
    description:
      "Group the brand’s home locations into markets that inform copy and campaign targeting.",
    empty: "Turn home locations into useful markets",
    detail:
      "Use the 12 available homes to draft and save an initial set of markets.",
    action: "Define markets",
    result: ["Blue Ridge · 8 homes", "Smoky Mountains · 4 homes"],
    question:
      "Should we group nearby towns together, or keep each destination distinct?",
  },
  {
    id: "personas",
    group: "Brand foundations",
    title: "Personas",
    icon: Users,
    description:
      "Describe the guests you’re creating for and what brings them to these homes.",
    empty: "Start with the people behind the booking",
    detail:
      "Use the brand story, homes and guest evidence to draft and save initial personas.",
    action: "Define personas",
    result: [
      "Families reconnecting · space for shared meals and time outside",
      "Friends on a long weekend · a comfortable base for exploring",
    ],
    question: "Which guests do you most want the creative to speak to?",
  },
  {
    id: "featured",
    group: "Homes & creative",
    title: "Featured homes",
    icon: House,
    description:
      "A small selection of homes to lead the brand’s advertising and starter creative.",
    empty: "Choose the homes that lead",
    detail:
      "Rank the available homes using bookings, reviews and photography, then feature an initial set.",
    action: "Select homes",
    result: [
      "Pine Ridge Lodge · Blue Ridge",
      "Creekside Cabin · Blue Ridge",
      "The Lookout · Smoky Mountains",
    ],
    question:
      "Should the selection prioritize proven bookings, destination variety, or a particular trip type?",
  },
  {
    id: "hero",
    group: "Homes & creative",
    title: "Hero home",
    icon: Image,
    description:
      "One representative home for checking the brand mark and previewing creative formats.",
    empty: "Put a real home behind the brand",
    detail:
      "Choose a representative home and photo from the featured set, then save it as the hero.",
    action: "Choose hero",
    result: ["Pine Ridge Lodge", "Exterior photo · brand preview source"],
    question:
      "Should the preview lead with an exterior, a gathering space, or the surrounding landscape?",
  },
  {
    id: "catalog",
    group: "Homes & creative",
    title: "Catalog cards",
    icon: Layers,
    description:
      "Reusable home cards with photography and copy, ready for review and export.",
    empty: "Build the first home cards",
    detail:
      "Create draft cards from the featured homes using the brand’s identity and story.",
    action: "Create cards",
    result: [
      "Pine Ridge Lodge · draft card",
      "Creekside Cabin · draft card",
      "The Lookout · draft card",
    ],
    question:
      "What should the cards emphasize, and which format would you like to explore?",
  },
  {
    id: "ads",
    group: "Campaign planning",
    title: "Ads",
    icon: Sparkles,
    description:
      "The creative this campaign will use: a clear idea, relevant homes and a booking destination.",
    empty: "Give the campaign its first creative",
    detail:
      "Create and save starter ad drafts from the selected homes, photos and brand story.",
    action: "Create ads",
    templates: true,
    result: [
      "A weekend worth getting everyone together for. · static draft",
      "Find your mountain gathering place. · carousel draft",
    ],
    question:
      "What should this campaign help guests imagine, and which homes should we lead with?",
  },
  {
    id: "audiences",
    group: "Campaign planning",
    title: "Audiences",
    icon: Users,
    description:
      "Define who this campaign should reach using guest origins, markets and trip motivations.",
    empty: "Reach the right guests",
    detail:
      "Broad targeting is available. Add an initial audience using the brand’s markets and booking history.",
    action: "Add audience",
    result: [
      "Regional family trips · ages 30–65",
      "Georgia & North Carolina · example geography",
    ],
    question:
      "Would you like to keep targeting broad or explore a specific geography or guest group?",
  },
  {
    id: "platforms",
    group: "Campaign planning",
    title: "Platforms",
    icon: Radio,
    description:
      "Choose where the campaign will run and prepare its budget and delivery settings.",
    empty: "Prepare a platform plan",
    detail:
      "Create a draft Meta plan from the campaign’s goal and recorded media budget. Review it before pushing.",
    action: "Create Meta plan",
    result: [
      "Meta Ads · draft plan",
      "$2,000 monthly media budget · illustrative",
      "Ready to review · no delivery started",
    ],
    question: "Which platform and budget should we plan around?",
  },
];

export function EmptyStatesFixture() {
  const [map, setMap] = useState(false);
  const [placement, setPlacement] = useState<
    "compare" | "centered" | "header" | "both"
  >("compare");
  const [editing, setEditing] = useState<Section | null>(null);
  const [editText, setEditText] = useState("");
  const [editedResults, setEditedResults] = useState<Record<string, string[]>>(
    {},
  );
  const [filled, setFilled] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<Section | null>(null);
  const [templateSection, setTemplateSection] = useState<Section | null>(null);
  const [templateChoice, setTemplateChoice] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const save = (section: Section) =>
    setFilled((current) => new Set([...current, section.id]));
  const open = (section: Section) => {
    setActive(section);
    setMessage("");
    setNotes([]);
  };

  const sectionActions = (
    section: Section,
    ready: boolean,
    inHeader = false,
  ) => {
    const single = ["identity", "story", "hero"].includes(section.id);
    return (
      <>
        {ready && single ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditing(section);
              setEditText(
                (editedResults[section.id] ?? section.result).join("\n"),
              );
            }}
          >
            Edit
          </Button>
        ) : (
          <Button
            size="sm"
            variant={inHeader || ready ? "outline" : "default"}
            onClick={() => {
              if (section.id === "ads") setTemplateChoice(null);
              save(section);
            }}
          >
            <Sparkles className="size-3.5" />
            {section.action}
          </Button>
        )}
        {section.templates && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTemplateSection(section)}
          >
            <Layers className="size-3.5" />
            From templates
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => open(section)}>
          <MessageSquare className="size-3.5" />
          Shape
        </Button>
      </>
    );
  };
  const sectionCard = (
    section: Section,
    location: "centered" | "header" | "both",
  ) => {
    const ready = filled.has(section.id);
    const Icon = section.icon;
    const inHeader = location !== "centered" || ready;
    const result =
      editedResults[section.id] ??
      (section.id === "ads" && templateChoice
        ? [
            `${templateChoice} · ad draft`,
            templateChoice === "Collection carousel"
              ? "Find your mountain gathering place. · carousel"
              : "A weekend worth getting everyone together for.",
          ]
        : section.result);
    return (
      <section
        aria-labelledby={`${section.id}-${location}-title`}
        className="@container h-full rounded-xl border bg-card p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3
              id={`${section.id}-${location}-title`}
              className="text-base font-semibold"
            >
              {section.title}
            </h3>
            {ready && (
              <Check
                className="size-3.5 text-muted-foreground"
                aria-label="Saved draft"
              />
            )}
          </div>
          {inHeader && (
            <div className="flex flex-wrap gap-2">
              {sectionActions(section, ready, true)}
            </div>
          )}
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {section.description}
        </p>
        <div className="mt-5">
          {ready ? (
            section.id === "story" ? (
              <BrandStoryContent story={result.join("\n\n")} />
            ) : section.id === "markets" ? (
              <div className="space-y-4">
                {result.map((line, index) => {
                  const [name] = line.split(" · ");
                  return (
                    <div key={line} className="space-y-1.5 text-sm">
                      <p className="font-medium">{name}</p>
                      <MarketDetails
                        market={{
                          id: String(index),
                          label: name ?? line,
                          towns: [name ?? line],
                        }}
                        homes={index === 0 ? 8 : 4}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {result.map((line) => (
                  <p className="text-sm leading-6" key={line}>
                    {line}
                  </p>
                ))}
              </div>
            )
          ) : (
            <EmptyState
              compact
              icon={Icon}
              title={section.empty}
              description={section.detail}
              actions={
                location === "header"
                  ? undefined
                  : sectionActions(section, false)
              }
            />
          )}
        </div>
      </section>
    );
  };

  if (map)
    return (
      <>
        <Button
          className="fixed top-5 right-6 z-20"
          onClick={() => setMap(false)}
        >
          Empty states fixture
        </Button>
        <WorkspaceMap />
      </>
    );

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="border-b px-5 py-6 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <Link
            href="/lab/performance-board"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:underline"
          >
            <ArrowLeft className="size-3.5" />
            Performance vision board
          </Link>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground">
                Brand workspace / empty states
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                A useful place to start
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setMap(true)}>
                Workspace map
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilled(new Set());
                  setActive(null);
                  setTemplateChoice(null);
                  setEditedResults({});
                }}
              >
                <RotateCcw className="size-3.5" />
                Reset
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilled(new Set(sections.map((s) => s.id)))}
              >
                Show filled states
              </Button>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            One workflow to create a starting point. One conversation to shape
            it together. Story and markets share their content rendering with
            the workspace. Other filled sections remain examples. Every change
            stays in this fixture.
          </p>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="mb-8 flex items-center gap-3 rounded-xl border bg-card p-4">
          <div className="flex size-11 items-center justify-center rounded-lg bg-muted text-sm font-semibold">
            SS
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Summit Stays</p>
            <p className="text-xs text-muted-foreground">
              12 example homes · Blue Ridge & Smoky Mountains
            </p>
          </div>
          <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
            Interactive fixture
          </span>
        </div>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
          <div
            role="group"
            aria-label="Action placement comparison"
            className="flex flex-wrap gap-1"
          >
            {(
              [
                { id: "compare", label: "Side by side" },
                { id: "centered", label: "Centered actions" },
                { id: "header", label: "Header actions" },
                { id: "both", label: "Both places" },
              ] as const
            ).map((option) => (
              <Button
                key={option.id}
                size="sm"
                variant={placement === option.id ? "default" : "ghost"}
                aria-pressed={placement === option.id}
                onClick={() => setPlacement(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {placement === "both"
              ? "Actions in the header and the empty state"
              : "Same content and state in both versions"}
          </p>
        </div>
        {placement === "compare" && (
          <div className="mb-4 hidden grid-cols-2 gap-5 lg:grid">
            <div>
              <p className="text-sm font-semibold">A · Centered when empty</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Actions move to the header when filled.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold">B · Always in the header</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The action location stays the same.
              </p>
            </div>
          </div>
        )}
        <div className="space-y-5">
          {sections.map((section, index) => (
            <div key={section.id}>
              {sections[index - 1]?.group !== section.group && (
                <h2 className="mt-8 mb-4 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  {section.group}
                </h2>
              )}
              {placement === "compare" ? (
                <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs text-muted-foreground lg:hidden">
                      A · Centered when empty
                    </p>
                    {sectionCard(section, "centered")}
                  </div>
                  <div>
                    <p className="mb-2 text-xs text-muted-foreground lg:hidden">
                      B · Always in the header
                    </p>
                    {sectionCard(section, "header")}
                  </div>
                </div>
              ) : (
                sectionCard(section, placement)
              )}
            </div>
          ))}
        </div>
        <p className="mt-8 text-xs leading-5 text-muted-foreground">
          All homes, copy, targeting and budgets are illustrative. Workflow
          buttons save example drafts locally; chat is a conversation preview.
        </p>
      </div>
      <Sheet
        open={Boolean(editing)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditing(null);
        }}
      >
        {editing && (
          <SheetContent className="w-full sm:max-w-md">
            <SheetHeader divided>
              <SheetTitle>Edit {editing.title.toLowerCase()}</SheetTitle>
              <SheetDescription>Changes stay in this fixture.</SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
              <label htmlFor="fixture-edit" className="text-sm">
                Example content
              </label>
              <textarea
                id="fixture-edit"
                className="min-h-48 flex-1 rounded-lg border bg-background p-3 text-sm leading-6"
                value={editText}
                onChange={(event) => setEditText(event.target.value)}
              />
              <Button
                onClick={() => {
                  setEditedResults((current) => ({
                    ...current,
                    [editing.id]: editText
                      .split("\n")
                      .filter((line) => line.trim()),
                  }));
                  setEditing(null);
                }}
              >
                Save changes
              </Button>
            </div>
          </SheetContent>
        )}
      </Sheet>
      <Sheet
        open={Boolean(templateSection)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setTemplateSection(null);
        }}
      >
        {templateSection && (
          <SheetContent className="w-full sm:max-w-2xl">
            <SheetHeader divided>
              <SheetTitle>Create ads from a template</SheetTitle>
              <SheetDescription>
                Choose a starting format. We’ll fill it with the example brand’s
                homes and copy.
              </SheetDescription>
            </SheetHeader>
            <div className="grid grid-cols-1 gap-4 overflow-y-auto p-5 sm:grid-cols-2">
              {[
                {
                  name: "Home spotlight",
                  detail: "One home, one clear reason to book.",
                  layout: "static",
                },
                {
                  name: "Collection carousel",
                  detail: "Several homes around a shared trip idea.",
                  layout: "carousel",
                },
                {
                  name: "Editorial story",
                  detail: "A headline-led layout with supporting photography.",
                  layout: "editorial",
                },
              ].map((template) => (
                <article
                  key={template.name}
                  className="overflow-hidden rounded-xl border bg-card"
                >
                  <div
                    className="flex aspect-[4/3] items-center justify-center bg-muted p-6"
                    aria-hidden="true"
                  >
                    {template.layout === "carousel" ? (
                      <div className="flex w-full gap-2">
                        {[1, 2, 3].map((n) => (
                          <div
                            key={n}
                            className="flex aspect-[3/4] flex-1 items-center justify-center rounded-md border bg-background"
                          >
                            <House className="size-5 text-muted-foreground" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex h-full w-full flex-col justify-between rounded-lg border bg-background p-4">
                        {template.layout === "editorial" && (
                          <div className="space-y-2">
                            <div className="h-2 w-3/4 rounded bg-foreground/30" />
                            <div className="h-2 w-1/2 rounded bg-foreground/20" />
                          </div>
                        )}
                        <House className="size-8 self-center text-muted-foreground" />
                        <div className="h-2 w-2/3 rounded bg-foreground/20" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-3 p-4">
                    <div>
                      <h3 className="text-sm font-semibold">{template.name}</h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {template.detail}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTemplateChoice(template.name);
                        save(templateSection);
                        setTemplateSection(null);
                      }}
                    >
                      Use template
                    </Button>
                  </div>
                </article>
              ))}
            </div>
            <p className="px-5 text-xs text-muted-foreground">
              Example templates · creates a local fixture draft
            </p>
          </SheetContent>
        )}
      </Sheet>
      <Sheet
        open={Boolean(active)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setActive(null);
        }}
      >
        {active && (
          <SheetContent className="w-full gap-0 sm:max-w-md">
            <SheetHeader divided className="p-5">
              <SheetDescription>
                Summit Stays · fixture conversation
              </SheetDescription>
              <SheetTitle>{active.title}</SheetTitle>
            </SheetHeader>
            <div className="flex-1 space-y-5 overflow-y-auto p-5 text-sm leading-6">
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                <Globe className="size-3" />
                Fixture conversation
              </span>
              <p>
                {filled.has(active.id)
                  ? `There’s a saved ${active.title.toLowerCase()} draft to work from.`
                  : `There’s no saved ${active.title.toLowerCase()} draft yet. We have the brand’s 12 example homes to work from.`}
              </p>
              <p>{active.question}</p>
              {notes.map((note, index) => (
                <div
                  key={`${index}-${note}`}
                  className="rounded-xl bg-muted p-3"
                >
                  {note}
                </div>
              ))}
              {notes.length > 0 && (
                <div className="space-y-3">
                  <p>Here’s a starting point to review:</p>
                  {active.result.map((line) => (
                    <p className="border-l-2 pl-3" key={line}>
                      {line}
                    </p>
                  ))}
                  <Button
                    size="sm"
                    onClick={() => {
                      save(active);
                      setNotes((current) => [
                        ...current,
                        "Saved the example draft to this section.",
                      ]);
                    }}
                  >
                    <Check className="size-3.5" />
                    Save example draft
                  </Button>
                </div>
              )}
            </div>
            <form
              className="border-t p-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (message.trim()) {
                  setNotes((current) => [...current, message.trim()]);
                  setMessage("");
                }
              }}
            >
              <label htmlFor="fixture-chat" className="sr-only">
                Discuss {active.title.toLowerCase()}
              </label>
              <div className="flex gap-2">
                <input
                  id="fixture-chat"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Describe what you’d like to explore…"
                  className="min-w-0 flex-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                />
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Send example message"
                  disabled={!message.trim()}
                >
                  <Send className="size-4" />
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Demo only · no live reads or writes
              </p>
            </form>
          </SheetContent>
        )}
      </Sheet>
    </main>
  );
}
