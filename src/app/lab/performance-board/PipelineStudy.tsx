"use client";

import { useState, type CSSProperties } from "react";
import {
  Check,
  AlignJustify,
  ChevronLeft,
  ChevronRight,
  Rows3,
  ListChecks,
  ExternalLink,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PerformanceNote } from "@/app/app/performance/PerformanceNote";

const stages = [
  "Prospects",
  "Signed",
  "Onboarding",
  "Launch prep",
  "First month",
  "Ongoing",
  "On hold",
] as const;
const catalogStates = [
  "Not started",
  "In production",
  "Approved",
  "Export ready",
  "Live",
];
const intakeStates = ["Not sent", "Sent", "Viewed", "Submitted"];
const emailDomainStates = ["Not connected", "DNS pending", "Verified"];
const newsletterStates = ["Not started", "Drafting", "In review", "Approved"];
const siteStates = ["Not started", "Building", "Ready", "Live"];
const cardViews = ["All", "Commercial", "Creative", "Delivery"] as const;
type Fixture = {
  name: string;
  url: string;
  mark: string;
  logo: string | null;
  billingPeriod: string;
  catalogFact: string;
  adFact: string;
  adCreative: string;
  platforms: { label: string; status: string }[];
  siteConnected: boolean;
  business: string;
  feePayment: string;
  mediaPayment: string;
  stage: (typeof stages)[number];
  catalog: string;
  ads: string;
  site: string;
  siteUrl: string;
  note: string;
  intake: string;
  emailDomain: string;
  newsletter: string;
  mediaBudget: number | null;
  managementFee: number | null;
};
const fixtures: Fixture[] = [
  {
    name: "AR Vacations",
    mark: "AV",
    logo: "https://www.arkansasvacationrental.com/i/width=200,dpr=1,format=jpeg?src=https%3A%2F%2Fassets-websites.wander.com%2F621122097845897893%2Flogo-ExJLlmRHlej6jfgv0D5bX.png",
    url: "https://arkansasvacationrental.com",
    stage: "Prospects",
    business: "Signed",
    feePayment: "Open",
    mediaPayment: "Open",
    mediaBudget: 2500,
    managementFee: 2500,
    billingPeriod: "2026-10",
    catalog: "In production",
    catalogFact: "30 included homes",
    ads: "Draft",
    adFact: "3 campaigns \u00b7 26 ads",
    adCreative: "In production",
    platforms: [
      { label: "Meta", status: "Draft" },
      { label: "Google", status: "No platform record" },
    ],
    site: "Building",
    siteUrl: "https://arkansasvacationrental.com",
    siteConnected: true,
    emailDomain: "DNS pending",
    newsletter: "Not started",
    intake: "Sent",
    note: "",
  },
  {
    name: "30A Beach Stays",
    mark: "3B",
    logo: "https://www.30abeachstays.com/i/width=200,dpr=1,format=jpeg?src=https%3A%2F%2Fassets-websites.wander.com%2F660568836512155950%2Flogo-BeYoWldnDbYxDOOr1zuj7.png",
    url: "https://www.30abeachstays.com/",
    stage: "Signed",
    business: "Signed",
    feePayment: "Paid",
    mediaPayment: "Open",
    mediaBudget: null,
    managementFee: 2500,
    billingPeriod: "2026-09",
    catalog: "Approved",
    catalogFact: "31 included homes",
    ads: "Draft",
    adFact: "1 campaign \u00b7 17 ads \u00b7 Meta draft",
    adCreative: "In production",
    platforms: [
      { label: "Meta", status: "Draft" },
      { label: "Google", status: "No platform record" },
    ],
    site: "Live",
    siteUrl: "https://www.30abeachstays.com/",
    siteConnected: true,
    emailDomain: "DNS pending",
    newsletter: "Not started",
    intake: "Viewed",
    note: "",
  },
  {
    name: "Legacy RnR",
    mark: "LR",
    logo: "https://de.cdn-website.com/cd3ccc7f05bf47668318483fdba6fe2a/dms3rep/multi/LegacyRnR_Logo_Green.svg",
    url: "https://legacy-rnr.wanderos.com/",
    stage: "Onboarding",
    business: "Signed",
    feePayment: "Paid",
    mediaPayment: "Paid",
    mediaBudget: 2500,
    managementFee: 2500,
    billingPeriod: "2026-09",
    catalog: "Export ready",
    catalogFact: "19 included homes",
    ads: "Pushed to Meta",
    adFact: "5 campaigns \u00b7 57 ads \u00b7 Meta paused",
    adCreative: "Approved",
    platforms: [
      { label: "Meta", status: "Paused" },
      { label: "Google", status: "No platform record" },
    ],
    site: "Ready",
    siteUrl: "https://legacy-rnr.wanderos.com/",
    siteConnected: true,
    emailDomain: "Verified",
    newsletter: "Drafting",
    intake: "Submitted",
    note: "",
  },
  {
    name: "Chalets Hocking Hills",
    mark: "CH",
    logo: "https://assets-websites.wander.com/689568371653477969/logo-ilVqvHldjlgWHJKXT4io7.png",
    url: "https://www.chaletshh.com",
    stage: "First month",
    business: "Signed",
    feePayment: "Paid",
    mediaPayment: "Open",
    mediaBudget: 7500,
    managementFee: 3000,
    billingPeriod: "2026-09",
    catalog: "Approved",
    catalogFact: "21 included homes",
    ads: "Pushed to Google",
    adFact: "11 campaigns \u00b7 77 ads \u00b7 Google paused",
    adCreative: "Approved",
    platforms: [
      { label: "Meta", status: "Paused" },
      { label: "Google", status: "Paused" },
    ],
    site: "Live",
    siteUrl: "https://www.chaletshh.com",
    siteConnected: true,
    emailDomain: "Verified",
    newsletter: "In review",
    intake: "Submitted",
    note: "",
  },
  {
    name: "Winter Park Escapes",
    mark: "WP",
    logo: "https://www.winterparkescapes.com/i/width=200,dpr=1,format=jpeg?src=https%3A%2F%2Fassets-websites.wander.com%2F659510124225759302%2Flogo-YqcMt2jFFBtUcwFLSzdjB.png",
    url: "https://www.winterparkescapes.com",
    stage: "Ongoing",
    business: "Signed",
    feePayment: "Paid",
    mediaPayment: "Paid",
    mediaBudget: 2500,
    managementFee: 2500,
    billingPeriod: "2026-09",
    catalog: "In production",
    catalogFact: "219 included homes · catalog update in production",
    ads: "Draft",
    adFact: "7 campaigns \u00b7 54 ads \u00b7 Meta draft",
    adCreative: "Approved",
    platforms: [
      { label: "Meta", status: "Live" },
      { label: "Google", status: "No platform record" },
    ],
    site: "Live",
    siteUrl: "https://www.winterparkescapes.com",
    siteConnected: true,
    emailDomain: "Verified",
    newsletter: "Approved",
    intake: "Submitted",
    note: "",
  },
];

export function PipelineStudy() {
  const [cards, setCards] = useState(fixtures);
  const [collapsed, setCollapsed] = useState(true);
  const [editing, setEditing] = useState<Fixture | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [compactCards, setCompactCards] = useState<string[]>(
    fixtures.map((card) => card.name),
  );
  const [cardView, setCardView] = useState<(typeof cardViews)[number]>("All");
  const allDetailed = cards.every((card) => expanded.includes(card.name));
  const allCompact = cards.every(
    (card) => compactCards.includes(card.name) && !expanded.includes(card.name),
  );
  function isCompact(name: string) {
    return compactCards.includes(name) && !expanded.includes(name);
  }
  function setCardDetail(
    name: string,
    detail: "Compact" | "Overview" | "Detailed",
  ) {
    setCompactCards((current) =>
      detail === "Compact"
        ? [...current.filter((item) => item !== name), name]
        : current.filter((item) => item !== name),
    );
    setExpanded((current) =>
      detail === "Detailed"
        ? [...current.filter((item) => item !== name), name]
        : current.filter((item) => item !== name),
    );
  }
  function change(name: string, patch: Partial<Fixture>) {
    setCards((current) =>
      current.map((card) =>
        card.name === name ? { ...card, ...patch } : card,
      ),
    );
  }
  return (
    <section
      aria-label="Pipeline UI study"
      className="rounded-2xl border bg-background p-5"
      style={
        {
          "--fixture-positive": "#16a34a",
          "--fixture-attention": "#ca8a04",
          "--fixture-active": "#3b82f6",
        } as CSSProperties
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Pipeline · UI study</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Design fixtures with real client names, logos, and URLs. Journey and
            production stages are illustrative; edits stay on this board.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label="Fixture pipeline detail level"
          >
            <Button
              variant={allCompact ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={allCompact}
              onClick={() => {
                setCompactCards(cards.map((card) => card.name));
                setExpanded([]);
              }}
            >
              Compact
            </Button>
            <Button
              variant={
                !allDetailed && !compactCards.length ? "secondary" : "ghost"
              }
              size="sm"
              aria-pressed={!allDetailed && !compactCards.length}
              onClick={() => {
                setCompactCards([]);
                setExpanded([]);
              }}
            >
              Summary
            </Button>
            <Button
              variant={allDetailed ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={allDetailed}
              onClick={() => {
                setCompactCards([]);
                setExpanded(cards.map((card) => card.name));
              }}
            >
              Milestones
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCards(fixtures);
              setCollapsed(true);
              setExpanded([]);
              setCompactCards(fixtures.map((card) => card.name));
              setCardView("All");
            }}
          >
            Reset fixtures
          </Button>
        </div>
      </div>
      <div
        className="mt-4 flex flex-wrap items-center gap-1"
        role="group"
        aria-label="Fixture card view"
      >
        {cardViews.map((view) => (
          <Button
            key={view}
            variant={cardView === view ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={cardView === view}
            onClick={() => setCardView(view)}
          >
            {view}
          </Button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Client journey is manual. Creative can return to production while
        platform delivery stays Live. Winter Park Escapes illustrates a catalog
        update in progress for an ongoing client.
      </p>
      <div
        className="mt-4 grid items-start gap-3"
        style={{
          gridTemplateColumns: `${collapsed ? "48px" : "1fr"} repeat(4, minmax(250px, 1fr))`,
        }}
      >
        {stages.map((stage) => {
          const rows = cards.filter((card) => card.stage === stage);
          if (stage === "Prospects" && collapsed)
            return (
              <button
                key={stage}
                type="button"
                aria-label="Expand fixture Prospects"
                aria-expanded={false}
                onClick={() => setCollapsed(false)}
                className="flex min-h-64 flex-col items-center gap-4 rounded-xl border bg-muted/30 py-3 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <ChevronRight className="size-4" />
                <span className="text-xs">{rows.length}</span>
                <span
                  style={{ writingMode: "vertical-rl" }}
                  className="text-sm font-medium"
                >
                  Prospects
                </span>
              </button>
            );
          return (
            <div key={stage} className="rounded-xl border bg-muted/20 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{stage}</h3>
                <span className="text-xs text-muted-foreground">
                  {rows.length}
                </span>
                {stage === "Prospects" && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Collapse fixture Prospects"
                    onClick={() => setCollapsed(true)}
                  >
                    <ChevronLeft />
                  </Button>
                )}
              </div>
              {rows.map((card) => (
                <article
                  key={card.name}
                  className="mb-3 rounded-xl border bg-card p-3 last:mb-0"
                >
                  <header className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-x-2.5 gap-y-1">
                    <div
                      role="img"
                      aria-label={`${card.name} logo`}
                      className="row-span-2 flex size-8 items-center justify-center rounded-lg border bg-background font-serif text-sm font-semibold tracking-wider"
                    >
                      {card.logo ? (
                        <img
                          src={card.logo}
                          alt={`${card.name} logo`}
                          className="size-full rounded-lg bg-white object-contain p-1"
                        />
                      ) : (
                        card.mark
                      )}
                    </div>
                    <div className="col-start-2 row-start-1 min-w-0 self-center">
                      <h4 className="text-sm font-semibold">
                        <a
                          href="#performance-overview"
                          className="hover:underline focus-visible:outline-ring"
                          aria-label={`${card.name} Performance overview fixture link`}
                        >
                          {card.name}
                        </a>
                      </h4>
                    </div>
                    <div className="col-start-3 row-start-1 flex items-start">
                      <div className="flex items-center gap-1">
                        <div
                          role="group"
                          aria-label={`${card.name} card detail`}
                          className="flex items-center rounded-md border p-0.5"
                        >
                          {(
                            [
                              { label: "Compact", icon: AlignJustify },
                              { label: "Overview", icon: Rows3 },
                              { label: "Detailed", icon: ListChecks },
                            ] as const
                          ).map(({ label, icon: Icon }) => {
                            const selected =
                              label === "Compact"
                                ? isCompact(card.name)
                                : label === "Detailed"
                                  ? expanded.includes(card.name)
                                  : !isCompact(card.name) &&
                                    !expanded.includes(card.name);
                            return (
                              <Button
                                key={label}
                                variant={selected ? "secondary" : "ghost"}
                                size="icon-xs"
                                className="size-5"
                                title={
                                  label === "Overview"
                                    ? "Summary"
                                    : label === "Detailed"
                                      ? "Milestones"
                                      : label
                                }
                                aria-label={`${label === "Overview" ? "Summary" : label === "Detailed" ? "Milestones" : label} ${card.name}`}
                                aria-pressed={selected}
                                onClick={() => setCardDetail(card.name, label)}
                              >
                                <Icon className="size-3" />
                              </Button>
                            );
                          })}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Options for ${card.name}`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => setEditing({ ...card })}
                            >
                              Edit card & client stage…
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    {(cardView === "All" || cardView === "Commercial") && (
                      <div
                        className="col-span-2 col-start-2 row-start-2 flex flex-wrap items-center gap-x-3 gap-y-1"
                        title={`Billing month · ${card.billingPeriod}`}
                      >
                        <CompactPayment
                          label="Management"
                          amount={card.managementFee}
                          state={card.feePayment}
                        />
                        <CompactPayment
                          label="Spend"
                          amount={card.mediaBudget}
                          state={card.mediaPayment}
                        />
                      </div>
                    )}
                  </header>
                  <div
                    className="mt-2 flex flex-wrap items-center gap-1.5"
                    hidden={isCompact(card.name)}
                    aria-label={`${card.name} inventory counts`}
                  >
                    {!isCompact(card.name) && (
                      <>
                        <Badge
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                        >
                          {card.catalogFact.split(" · ")[0]}
                        </Badge>
                        {card.adFact
                          .split(" · ")
                          .slice(0, 2)
                          .map((count) => (
                            <Badge
                              key={count}
                              variant="outline"
                              className="h-6 px-2 text-[10px]"
                            >
                              {count}
                            </Badge>
                          ))}
                      </>
                    )}
                  </div>
                  {isCompact(card.name) && (
                    <div
                      className="mt-2 space-y-1.5"
                      aria-label={`${card.name} compact statuses`}
                    >
                      {(cardView === "All" || cardView === "Creative") && (
                        <div className="flex flex-wrap gap-1.5">
                          <CompactStatus
                            label="Catalog"
                            value={card.catalog}
                            href="#performance-catalog"
                          />
                          <CompactStatus
                            label="Ads"
                            value={card.adCreative}
                            href="#performance-ad-studio"
                          />
                          <CompactStatus
                            label="Email"
                            value={card.newsletter}
                            href="#performance-email"
                          />
                        </div>
                      )}
                      {(cardView === "All" || cardView === "Delivery") && (
                        <div className="flex flex-wrap gap-1.5">
                          {card.platforms
                            .filter(
                              (platform) =>
                                !["No platform record", "Not created"].includes(
                                  platform.status,
                                ),
                            )
                            .map((platform) => (
                              <CompactStatus
                                key={platform.label}
                                label={platform.label}
                                value={platform.status}
                              />
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                  <section
                    className="mt-3 border-t pt-3"
                    aria-label={`${card.name} commercial and billing`}
                    hidden={
                      isCompact(card.name) ||
                      (cardView !== "All" && cardView !== "Commercial")
                    }
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h5 className="text-xs font-medium">
                        Commercial & billing
                      </h5>
                      <Badge variant="outline">{card.business}</Badge>
                    </div>
                    <dl className="mb-3">
                      {expanded.includes(card.name) ? (
                        <StatusMilestones
                          label="Intake form"
                          value={card.intake}
                          states={intakeStates}
                          labels={intakeStates}
                        />
                      ) : (
                        <StatusRow label="Intake form" value={card.intake} />
                      )}
                    </dl>
                    <p className="mb-2 text-[10px] text-muted-foreground">
                      {card.billingPeriod}
                    </p>
                  </section>
                  <section
                    className="mt-3 border-t pt-3"
                    aria-label={`${card.name} creative`}
                    hidden={
                      isCompact(card.name) ||
                      (cardView !== "All" && cardView !== "Creative")
                    }
                  >
                    <h5 className="mb-3 text-xs font-medium">Creative</h5>
                    <dl className="space-y-3">
                      {expanded.includes(card.name) ? (
                        <StatusMilestones
                          label="Catalog"
                          href="#performance-catalog"
                          value={card.catalog}
                          states={catalogStates}
                          labels={[
                            "Not started",
                            "Creating",
                            "Approved",
                            "Export",
                            "Live",
                          ]}
                        />
                      ) : (
                        <StatusRow
                          label="Catalog"
                          value={card.catalog}
                          href="#performance-catalog"
                        />
                      )}
                      {card.catalogFact.includes(" · ") && (
                        <p className="text-[10px] text-muted-foreground">
                          {card.catalogFact.split(" · ").slice(1).join(" · ")}
                        </p>
                      )}
                      {expanded.includes(card.name) ? (
                        <StatusMilestones
                          label="Ads"
                          href="#performance-ad-studio"
                          value={card.adCreative}
                          states={[
                            "Not started",
                            "In production",
                            "In review",
                            "Approved",
                          ]}
                          labels={[
                            "Not started",
                            "Creating",
                            "Review",
                            "Approved",
                          ]}
                        />
                      ) : (
                        <StatusRow
                          label="Ads"
                          value={card.adCreative}
                          href="#performance-ad-studio"
                        />
                      )}
                      {expanded.includes(card.name) ? (
                        <StatusMilestones
                          label="Newsletter content"
                          href="#performance-email"
                          value={card.newsletter}
                          states={newsletterStates}
                          labels={[
                            "Not started",
                            "Drafting",
                            "Review",
                            "Approved",
                          ]}
                        />
                      ) : (
                        <StatusRow
                          label="Newsletter content"
                          href="#performance-email"
                          value={card.newsletter}
                        />
                      )}
                    </dl>
                  </section>
                  <section
                    className="mt-3 border-t pt-3"
                    aria-label={`${card.name} platform delivery`}
                    hidden={
                      isCompact(card.name) ||
                      (cardView !== "All" && cardView !== "Delivery")
                    }
                  >
                    <h5 className="mb-3 text-xs font-medium">
                      Platform delivery
                    </h5>
                    <dl className="space-y-3">
                      {card.platforms
                        .filter(
                          (platform) =>
                            !["No platform record", "Not created"].includes(
                              platform.status,
                            ),
                        )
                        .map((platform) =>
                          expanded.includes(card.name) ? (
                            <StatusMilestones
                              key={platform.label}
                              label={platform.label}
                              value={platform.status}
                              states={[
                                "No platform record",
                                "Draft",
                                "Paused",
                                "Live",
                              ]}
                              labels={[
                                "Not created",
                                "Draft",
                                "Paused",
                                "Live",
                              ]}
                            />
                          ) : (
                            <StatusRow
                              key={platform.label}
                              label={platform.label}
                              value={platform.status}
                            />
                          ),
                        )}
                      {expanded.includes(card.name) && (
                        <p className="text-[10px] text-muted-foreground">
                          Current platform state. Delivery can move between
                          Paused and Live independently of the client stage.
                        </p>
                      )}
                    </dl>
                  </section>
                  <section
                    className="mt-3 border-t pt-3"
                    aria-label={`${card.name} site and email infrastructure`}
                    hidden={
                      isCompact(card.name) ||
                      (cardView !== "All" && cardView !== "Delivery")
                    }
                  >
                    <h5 className="mb-3 text-xs font-medium">
                      WanderOS & email DNS
                    </h5>
                    <dl>
                      <SiteReadiness
                        card={card}
                        detailed={expanded.includes(card.name)}
                      />
                    </dl>
                  </section>
                  <PerformanceNote text={card.note} />
                </article>
              ))}
              {!rows.length && (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No fixture here
                </p>
              )}
            </div>
          );
        })}
      </div>
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editing?.name}</DialogTitle>
            <DialogDescription>
              Fixture only. Apply changes to this board; Cancel keeps the card
              unchanged.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-4">
              <FixtureStatus
                label="Client stage"
                name={editing.name}
                value={editing.stage}
                options={[...stages]}
                onChange={(stage) =>
                  setEditing({ ...editing, stage: stage as Fixture["stage"] })
                }
              />
              <FixtureStatus
                label="Commercial relationship"
                name={editing.name}
                value={editing.business}
                options={[
                  "Prospect",
                  "Pitch sent",
                  "Meeting booked",
                  "Signed",
                  "Paused",
                  "Lost",
                  "Churned",
                ]}
                onChange={(business) => setEditing({ ...editing, business })}
              />
              <FixtureStatus
                label="Management payment"
                name={editing.name}
                value={editing.feePayment}
                options={["Not invoiced", "Open", "Paid"]}
                onChange={(feePayment) =>
                  setEditing({ ...editing, feePayment })
                }
              />
              <FixtureStatus
                label="Spend payment"
                name={editing.name}
                value={editing.mediaPayment}
                options={["Not invoiced", "Open", "Paid"]}
                onChange={(mediaPayment) =>
                  setEditing({ ...editing, mediaPayment })
                }
              />
              <FixtureStatus
                label="Intake form"
                name={editing.name}
                value={editing.intake}
                options={[...intakeStates, "No submission recorded"]}
                onChange={(intake) => setEditing({ ...editing, intake })}
              />
              <FixtureStatus
                label="Catalog"
                name={editing.name}
                value={editing.catalog}
                options={catalogStates}
                onChange={(catalog) => setEditing({ ...editing, catalog })}
              />
              <label className="space-y-1 text-xs">
                Ad creative status
                <Input
                  value={editing.adCreative}
                  onChange={(event) =>
                    setEditing({ ...editing, adCreative: event.target.value })
                  }
                />
              </label>
              {editing.platforms.map((platform, index) => (
                <label key={platform.label} className="space-y-1 text-xs">
                  {platform.label} delivery
                  <Input
                    value={platform.status}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        platforms: editing.platforms.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, status: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
              ))}
              <FixtureStatus
                label="WanderOS"
                name={editing.name}
                value={editing.site}
                options={[...siteStates, "Live status unknown"]}
                onChange={(site) => setEditing({ ...editing, site })}
              />
              <label className="space-y-1 text-xs">
                Site URL (snapshot)
                <Input
                  value={editing.siteUrl}
                  onChange={(event) =>
                    setEditing({ ...editing, siteUrl: event.target.value })
                  }
                />
              </label>
              <FixtureStatus
                label="WanderOS · email domain & DNS"
                name={editing.name}
                value={editing.emailDomain}
                options={[
                  ...emailDomainStates,
                  "No domain configured",
                  "Verification unknown",
                ]}
                onChange={(emailDomain) =>
                  setEditing({ ...editing, emailDomain })
                }
              />
              <FixtureStatus
                label="Newsletter content"
                name={editing.name}
                value={editing.newsletter}
                options={[...newsletterStates, "Not checked"]}
                onChange={(newsletter) =>
                  setEditing({ ...editing, newsletter })
                }
              />
              <label className="space-y-1 text-xs">
                Monthly spend budget
                <Input
                  type="number"
                  min={0}
                  value={editing.mediaBudget ?? ""}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      mediaBudget: Math.max(0, Number(event.target.value)),
                    })
                  }
                />
              </label>
              <label className="space-y-1 text-xs">
                Monthly management fee
                <Input
                  type="number"
                  min={0}
                  value={editing.managementFee ?? ""}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      managementFee: Math.max(0, Number(event.target.value)),
                    })
                  }
                />
              </label>
              <label className="space-y-1 text-xs">
                Note
                <Textarea
                  value={editing.note}
                  maxLength={2000}
                  rows={3}
                  onChange={(event) =>
                    setEditing({ ...editing, note: event.target.value })
                  }
                />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editing) change(editing.name, editing);
                setEditing(null);
              }}
            >
              Apply changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="mt-3 text-xs text-muted-foreground">
        Open questions: which production milestones are useful at a glance?
        Where does review end and delivery begin? No database model is implied
        by this study.
      </p>
    </section>
  );
}

function FixtureStatus({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" aria-label={`${label} fixture for ${name}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option === "In production" ? "Creating" : option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
function StatusRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <dt className="text-muted-foreground">
        <FixtureLabel label={label} href={href} />
      </dt>
      <dd>
        <Badge
          style={statusStyle(value)}
          variant={
            value === "Not started" ||
            value === "Not sent" ||
            value === "Not connected"
              ? "outline"
              : "secondary"
          }
        >
          {value === "In production" ? "Creating" : value}
        </Badge>
      </dd>
    </div>
  );
}

function CompactPayment({
  label,
  amount,
  state,
}: {
  label: string;
  amount: number | null;
  state: string;
}) {
  return (
    <div
      className="flex items-center gap-1.5 text-[10px]"
      title={`${label} · ${state}`}
      aria-label={`${label}: ${amount == null ? "Not set" : money(amount)}, ${state}`}
    >
      <span className="text-muted-foreground">{label}</span>
      <span
        className="font-medium tabular-nums"
        style={{
          color:
            state === "Paid"
              ? "var(--fixture-positive)"
              : state === "Open"
                ? "#d97706"
                : undefined,
        }}
      >
        {amount == null ? "—" : money(amount)}
      </span>
    </div>
  );
}

function CompactStatus({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const platformState =
    (label === "Meta" || label === "Google") &&
    (value === "Live" || value === "Paused");
  const needsAttention = value === "In review" || value === "DNS pending";
  const shortValue =
    value === "In production"
      ? "Creating"
      : value === "No platform record"
        ? "Not created"
        : value === "Not started"
          ? "Not started"
          : value === "DNS pending"
            ? "Pending"
            : value;
  const content = (
    <>
      {needsAttention && (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: "var(--fixture-attention)" }}
        />
      )}
      <span className="font-normal text-muted-foreground">{label}</span>
      <span>{shortValue}</span>
    </>
  );
  return (
    <Badge
      variant="outline"
      style={platformState ? statusStyle(value) : undefined}
      className="gap-1.5 text-[10px]"
      title={`${label} · ${value === "In production" ? "Creating" : value}`}
    >
      {href ? (
        <a
          href={href}
          className="inline-flex items-center gap-1.5 hover:underline focus-visible:outline-ring"
        >
          {content}
        </a>
      ) : (
        content
      )}
    </Badge>
  );
}

function FixtureLabel({ label, href }: { label: string; href?: string }) {
  return href ? (
    <a
      href={href}
      className="underline decoration-border underline-offset-4 hover:text-foreground focus-visible:outline-ring"
    >
      {label}
    </a>
  ) : (
    label
  );
}

function statusStyle(value: string): CSSProperties {
  const tone = [
    "Paid",
    "Live",
    "Approved",
    "Export ready",
    "Verified",
    "Submitted",
  ].includes(value)
    ? "positive"
    : ["Paused", "In review", "DNS pending"].includes(value)
      ? "attention"
      : ["In production", "Drafting", "Building"].includes(value)
        ? "active"
        : null;
  if (!tone) return {};
  const color = `var(--fixture-${tone})`;
  return {
    color,
    borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
    backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
  };
}

/** A fixture-only alternative to the shared badge row, for visual comparison. */
function StatusMilestones({
  label,
  value,
  states,
  labels,
  pausedValue,
  href,
}: {
  label: string;
  value: string;
  states: string[];
  labels: string[];
  pausedValue?: string;
  href?: string;
}) {
  const paused = value === pausedValue;
  const current = paused ? states.length - 1 : states.indexOf(value);

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3 text-xs">
        <dt className="text-muted-foreground">
          <FixtureLabel label={label} href={href} />
        </dt>
        <dd>
          <Badge variant="outline" style={statusStyle(value)}>
            {value === "In production" ? "Creating" : value}
          </Badge>
        </dd>
      </div>
      <dd className="mt-3">
        <ol
          aria-label={`${label} milestones`}
          className="grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${states.length}, minmax(0, 1fr))`,
          }}
        >
          {states.map((state, index) => (
            <li
              key={state}
              aria-current={index === current ? "step" : undefined}
              className="min-w-0"
              title={state}
            >
              <div
                className={`mb-2 h-0.5 rounded-full ${index <= current ? "bg-foreground" : "bg-muted"}`}
              />
              <span
                style={index === current ? statusStyle(value) : undefined}
                className={`flex size-5 items-center justify-center rounded-full border ${index === current ? "border-foreground ring-2 ring-current/20" : "border-border text-muted-foreground"}`}
              >
                {index < current ? (
                  <Check className="size-3" aria-hidden="true" />
                ) : index === current ? (
                  <span className="size-1.5 rounded-full bg-current" />
                ) : null}
              </span>
              <span
                className={`mt-2 block text-[10px] leading-4 ${index === current ? "font-semibold" : "text-muted-foreground"}`}
              >
                {labels[index]}
              </span>
              <span className="sr-only">
                {current < 0
                  ? "Not mapped"
                  : index < current
                    ? "Completed"
                    : index === current
                      ? "Current"
                      : "Upcoming"}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[10px] text-muted-foreground">
          {current < 0
            ? "Milestones shown for reference · current step not selected"
            : paused
              ? "Delivery is paused on Meta"
              : current < states.length - 1
                ? `Next · ${states[current + 1] === "In production" ? "Creating" : states[current + 1]}`
                : `${label} · ${value === "In production" ? "Creating" : value}`}
        </p>
      </dd>
    </div>
  );
}

function SiteReadiness({
  card,
  detailed = false,
}: {
  card: Fixture;
  detailed?: boolean;
}) {
  const siteLive = card.site === "Live";
  const emailReady = card.emailDomain === "Verified";
  return (
    <div className="space-y-2">
      <StatusRow label="WanderOS" value={card.site} />
      {detailed ? (
        <dd className="space-y-2 rounded-md border p-2.5">
          <ReadinessCheck
            complete={card.siteConnected}
            label="WanderOS connected"
            detail={
              card.siteConnected
                ? "WanderOS connection in place"
                : "No connection recorded"
            }
          />
          <ReadinessCheck
            complete={siteLive}
            label="Site live"
            detail={card.siteUrl ? card.siteUrl : "No site URL yet"}
          />
          <ReadinessCheck
            complete={emailReady}
            label="Email DNS verified"
            detail={card.emailDomain}
          />
        </dd>
      ) : (
        <StatusRow label="Email DNS" value={card.emailDomain} />
      )}
    </div>
  );
}

function ReadinessCheck({
  complete,
  label,
  detail,
}: {
  complete: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span
        className={`mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border ${complete ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/40"}`}
        aria-label={complete ? "Complete" : "Pending"}
      >
        {complete && <Check className="size-2.5" />}
      </span>
      <div className="min-w-0">
        <p>{label}</p>
        <p className="text-[10px] break-all text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
