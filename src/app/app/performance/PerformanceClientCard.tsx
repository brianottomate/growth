"use client";

import { useEffect, useState, type ReactNode, type CSSProperties } from "react";
import Link from "next/link";
import { trackerDate } from "@/lib/performance-settings";
import { performanceWebsiteUrl } from "@/lib/performance-card";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  AlignJustify,
  Rows3,
  Rows4,
  ListChecks,
  MoreHorizontal,
  Check,
  MessageSquare,
  BriefcaseBusiness,
} from "lucide-react";
import { sendAssistantIntent } from "@/lib/assistant-events";
import { orpc } from "@/orpc/client";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PerformanceNote } from "./PerformanceNote";
import { ReadinessProgress } from "./ReadinessProgress";
import { statusChips, statusTone } from "./AccountStatus";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { BrandLogo } from "./_components";
import {
  PIPELINE_COLUMNS,
  type PipelineStage,
} from "@/lib/performance-pipeline";
import {
  CATALOG_STATES,
  CREATIVE_STATES,
  NEWSLETTER_STATES,
  PLATFORM_STATES,
  SITE_STATES,
  DNS_STATES,
  ZERNIO_ACCESS_STATES,
  INTAKE_STATES,
  PAYMENT_STATES,
  COMMERCIAL_STATES,
  performanceCardStateSchema,
  performanceAmountSchema,
  recordedStatus,
  recordedPlatforms,
  type PerformanceCardState,
} from "@/lib/performance-card-state";
import { type PerformancePipelineCard } from "@/lib/performance-card";

export type CardDetail = "Dense" | "Compact" | "Overview" | "Detailed";
export type CardView = "All" | "Commercial" | "Creative" | "Delivery";
export const CARD_VIEWS: CardView[] = [
  "All",
  "Commercial",
  "Creative",
  "Delivery",
];
const cardTheme = {
  "--performance-positive": "#16a34a",
  "--performance-active": "#3b82f6",
  "--performance-attention": "#ca8a04",
  "--performance-payment-open": "#d97706",
} as CSSProperties;
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

export function PerformanceClientCard({
  card,
  view = "All",
  detailSignal,
  context = "board",
}: {
  card: PerformancePipelineCard;
  view?: CardView;
  detailSignal?: { detail: CardDetail; revision: number };
  context?: "board" | "client";
}) {
  const [detail, setDetail] = useState<CardDetail>(
    detailSignal?.detail ?? "Compact",
  );
  const [editing, setEditing] = useState(false);
  const signalDetail = detailSignal?.detail;
  const signalRevision = detailSignal?.revision;
  useEffect(() => {
    if (signalDetail) setDetail(signalDetail);
  }, [signalDetail, signalRevision]);
  const compact = detail === "Compact";
  const show = (section: CardView) => view === "All" || view === section;
  const state = card.state;
  const platforms = recordedPlatforms(state);
  const intakeUrl = performanceWebsiteUrl(card.intakeUrl ?? null);
  if (context === "board" && detail === "Dense")
    return (
      <>
        <DenseCard
          card={card}
          view={view}
          onDetail={setDetail}
          onEdit={() => setEditing(true)}
        />
        {editing && (
          <EditClientState card={card} onClose={() => setEditing(false)} />
        )}
      </>
    );
  return (
    <article
      aria-label={`${card.name} client card`}
      className={
        context === "client"
          ? "rounded-xl border p-4"
          : "rounded-xl border bg-card p-3"
      }
      style={cardTheme}
    >
      <header
        className={`grid ${context === "client" ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-[44px_minmax(0,1fr)_auto]"} items-start gap-x-2.5 gap-y-1`}
      >
        {context === "board" ? (
          <BrandLogo brand={card} className="row-span-2 size-11" />
        ) : null}
        <h3
          className={`${context === "client" ? "col-start-1" : "col-start-2"} row-start-1 min-w-0 self-center text-sm font-semibold`}
        >
          {context === "client" ? (
            <span className="flex items-center gap-2 text-base">
              <BriefcaseBusiness
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              Account summary
            </span>
          ) : (
            <Link
              href={card.href}
              className="hover:underline focus-visible:outline-ring"
            >
              {card.name}
            </Link>
          )}
        </h3>
        <div
          className={`${context === "client" ? "col-start-2" : "col-start-3"} row-start-1 flex items-center gap-1`}
        >
          <Button
            variant="ghost"
            size="icon-xs"
            title="Open in chat"
            aria-label={`Open ${card.name} in chat`}
            onClick={() =>
              sendAssistantIntent({
                type: "work_performance_client",
                newThread: true,
                brandId: card.id,
                brandName: card.name,
                visibleText: `Open ${card.name}'s Performance account in chat.`,
              })
            }
          >
            <MessageSquare className="size-3.5" />
          </Button>
          {context === "board" ? (
            <div
              role="group"
              aria-label={`${card.name} card detail`}
              className="flex rounded-md border p-0.5"
            >
              {(
                [
                  { name: "Dense", label: "Dense", icon: Rows4 },
                  { name: "Compact", label: "Compact", icon: AlignJustify },
                  { name: "Overview", label: "Summary", icon: Rows3 },
                  { name: "Detailed", label: "Milestones", icon: ListChecks },
                ] as const
              ).map(({ name, label, icon: Icon }) => (
                <Button
                  key={name}
                  variant={detail === name ? "secondary" : "ghost"}
                  size="icon-xs"
                  className="size-5"
                  title={label}
                  aria-label={`${label} ${card.name}`}
                  aria-pressed={detail === name}
                  onClick={() => setDetail(name)}
                >
                  <Icon className="size-3" />
                </Button>
              ))}
            </div>
          ) : null}
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
              {intakeUrl && (
                <DropdownMenuItem asChild>
                  <a href={intakeUrl} target="_blank" rel="noopener noreferrer">
                    Open intake form ↗
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                Edit client state…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {show("Commercial") && (
          <div
            className={`${context === "client" ? "col-start-1" : "col-start-2"} col-span-2 row-start-2 flex flex-wrap gap-x-3 gap-y-1`}
            title={
              state.billingPeriod
                ? `Billing month · ${state.billingPeriod}`
                : "Billing month not recorded"
            }
          >
            <Payment
              label="Management"
              amount={card.management}
              status={state.managementPayment}
            />
            <Payment
              label="Ad budget"
              amount={card.spend}
              status={state.spendPayment}
            />
          </div>
        )}
      </header>
      {context === "board" && !compact && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" textSize="caption" className="h-6">
            {state.includedHomes == null
              ? "Homes not recorded"
              : `${state.includedHomes} included homes`}
          </Badge>
          <Badge variant="outline" textSize="caption" className="h-6">
            {card.campaignCount} campaigns
          </Badge>
          <Badge variant="outline" textSize="caption" className="h-6">
            {card.adCount} ads
          </Badge>
        </div>
      )}
      {context === "client" ? (
        <div
          id="payments"
          className="mt-3 flex scroll-mt-4 flex-wrap gap-x-5 gap-y-2 border-t pt-3 text-xs"
        >
          <Status label="Management payment" value={state.managementPayment} />
          <Status label="Ad spend payment" value={state.spendPayment} />
          {state.billingPeriod ? (
            <span className="text-muted-foreground">
              Billing month · {state.billingPeriod}
            </span>
          ) : null}
          {card.effectiveDate ? (
            <span className="text-muted-foreground">
              Effective · {trackerDate(card.effectiveDate)}
            </span>
          ) : null}
          {card.terms ? (
            <span className="text-muted-foreground">Terms · {card.terms}</span>
          ) : null}
          {card.endDate ? (
            <span className="text-muted-foreground">
              Ends · {trackerDate(card.endDate)}
            </span>
          ) : null}
        </div>
      ) : compact ? (
        <div className="mt-2 space-y-1.5">
          {show("Creative") && (
            <div className="flex flex-wrap gap-1.5">
              <Status
                label="Catalog"
                value={state.catalog}
                href={`${card.href}/catalog`}
                compact
              />
              <Status
                label="Ads"
                value={state.ads}
                href={`${card.href}/ads`}
                compact
              />
              <Status
                label="Email"
                value={state.newsletter}
                href={`${card.href}/newsletters`}
                compact
              />
            </div>
          )}
          {show("Delivery") && (
            <div className="flex flex-wrap gap-1.5">
              <Status
                label="Zernio access"
                value={state.zernioAccess}
                compact
              />
              {platforms.map((platform) => (
                <Status
                  key={platform.label}
                  label={platform.label}
                  value={platform.status}
                  href={`${card.href}/campaigns`}
                  compact
                  platform
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {show("Commercial") && (
            <CardSection title="Commercial & billing">
              <Status label="Relationship" value={state.commercial} />
              {(card.effectiveDate || card.endDate || card.terms) && (
                <dl className="space-y-1 text-xs">
                  {[
                    ["Effective date", trackerDate(card.effectiveDate)],
                    ["Terms", card.terms],
                    ["End date", trackerDate(card.endDate)],
                  ].map(([label, value]) =>
                    value ? (
                      <div key={label} className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="text-right">{value}</dd>
                      </div>
                    ) : null,
                  )}
                </dl>
              )}
              <Sequence
                label="Intake form"
                value={state.intake}
                states={INTAKE_STATES}
                detailed={detail === "Detailed"}
              />
              {state.billingPeriod && (
                <p className="text-[10px] text-muted-foreground">
                  Billing month · {state.billingPeriod}
                </p>
              )}
              <Status
                label="Management payment"
                value={state.managementPayment}
              />
              <Status label="Spend payment" value={state.spendPayment} />
            </CardSection>
          )}
          {show("Creative") && (
            <CardSection title="Creative">
              <Sequence
                label="Catalog"
                value={state.catalog}
                states={CATALOG_STATES}
                href={`${card.href}/catalog`}
                detailed={detail === "Detailed"}
              />
              <Sequence
                label="Ads"
                value={state.ads}
                states={CREATIVE_STATES}
                href={`${card.href}/ads`}
                detailed={detail === "Detailed"}
              />
              <Sequence
                label="Newsletter content"
                value={state.newsletter}
                states={NEWSLETTER_STATES}
                href={`${card.href}/newsletters`}
                detailed={detail === "Detailed"}
              />
            </CardSection>
          )}
          {show("Delivery") && (
            <>
              {platforms.length > 0 && (
                <CardSection title="Platform delivery">
                  {platforms.map((platform) => (
                    <Sequence
                      key={platform.label}
                      label={platform.label}
                      value={platform.status}
                      states={PLATFORM_STATES.filter(
                        (step) =>
                          (step !== "Scheduled" && step !== "Ended") ||
                          step === platform.status,
                      )}
                      href={`${card.href}/campaigns`}
                      detailed={detail === "Detailed"}
                    />
                  ))}
                  {detail === "Detailed" && (
                    <p className="text-[10px] text-muted-foreground">
                      Current recorded state; Paused and Live are reversible.
                    </p>
                  )}
                </CardSection>
              )}
              <CardSection title="Zernio access">
                <Status label="Account access" value={state.zernioAccess} />
                {detail === "Detailed" && (
                  <p className="text-xs text-muted-foreground">
                    {state.zernioAccess === "Connected"
                      ? "The team has recorded Zernio access as connected."
                      : state.zernioAccess === "Not connected"
                        ? "Zernio access still needs to be connected."
                        : "Zernio access has not been checked yet."}
                  </p>
                )}
              </CardSection>
              <CardSection title="WanderOS & email DNS">
                <Status
                  label="WanderOS connected"
                  value={recordedStatus(state.siteConnected)}
                />
                <Sequence
                  label="Site"
                  href={performanceWebsiteUrl(card.website) ?? undefined}
                  value={state.site}
                  states={SITE_STATES}
                  detailed={detail === "Detailed"}
                />
                <Status
                  label="Email DNS"
                  value={state.emailDns}
                  href={`${card.href}/newsletters`}
                />
              </CardSection>
            </>
          )}
        </>
      )}
      {context === "board" && card.readiness ? (
        <section
          aria-label="Recorded launch progress"
          className="mt-3 space-y-3 border-t pt-3"
        >
          <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
            <span>Onboarding checklist</span>
            <span className="whitespace-nowrap tabular-nums">
              {card.readiness.checklist.done}/{card.readiness.checklist.total}
            </span>
          </div>
          <ReadinessProgress checklist={card.readiness.checklist} compact />
        </section>
      ) : null}
      <PerformanceNote
        text={card.note}
        editedBy={card.noteEditedBy}
        editedAt={card.noteEditedAt}
      />
      {editing && (
        <EditClientState card={card} onClose={() => setEditing(false)} />
      )}
    </article>
  );
}

/**
 * The card at a glance: name and money on top, every recorded status as a
 * coloured dot with its name, the checklist as one bar, and the next step as
 * one line. About a third the height of Compact; the value sits in the title.
 */
function DenseCard({
  card,
  view,
  onDetail,
  onEdit,
}: {
  card: PerformancePipelineCard;
  view: CardView;
  onDetail: (detail: CardDetail) => void;
  onEdit: () => void;
}) {
  const chips = statusChips(card.state).filter(
    (chip) =>
      chip.value &&
      (view === "All" ? chip.lens !== "Commercial" : chip.lens === view),
  );
  const checklist = card.readiness?.checklist;
  return (
    <article
      aria-label={`${card.name} client card`}
      className="rounded-xl border bg-card px-3 py-2.5"
      style={cardTheme}
    >
      <div className="flex items-center gap-2.5">
        <BrandLogo brand={card} className="size-7 text-[10px]" />
        <div className="min-w-0 flex-1">
          <Link
            href={card.href}
            className="block truncate text-[13px] font-semibold hover:underline"
          >
            {card.name}
          </Link>
          <p className="truncate text-[11px] text-muted-foreground tabular-nums">
            {card.management == null && card.spend == null
              ? (card.website?.replace(/^https?:\/\//, "") ?? "—")
              : `${card.management == null ? "—" : money(card.management)} · ${card.spend == null ? "—" : money(card.spend)}`}
          </p>
        </div>
        {checklist ? (
          <div className="w-14 shrink-0 space-y-1 text-right">
            <span className="block text-[10px] text-muted-foreground tabular-nums">
              {checklist.done}/{checklist.total}
            </span>
            <div className="h-[3px] overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground"
                style={{
                  width: `${checklist.total ? (checklist.done / checklist.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="-mr-1"
              aria-label={`Options for ${card.name}`}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onDetail("Compact")}>
              Show more on this card
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                sendAssistantIntent({
                  type: "work_performance_client",
                  newThread: true,
                  brandId: card.id,
                  brandName: card.name,
                  visibleText: `Open ${card.name}'s Performance account in chat.`,
                })
              }
            >
              Open in chat
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onEdit}>
              Edit client state…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {chips.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
          {chips.map((chip) => (
            <span
              key={chip.label}
              title={`${chip.label} · ${chip.value}`}
              className="inline-flex items-center gap-1 text-muted-foreground"
            >
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-muted-foreground/40"
                style={{
                  backgroundColor: statusTone(chip.value)?.color ?? undefined,
                }}
              />
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function CardSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-3 space-y-2 border-t pt-3">
      <h4 className="text-xs font-medium">{title}</h4>
      {children}
    </section>
  );
}
function ReadyDot({
  ready,
  attention = false,
}: {
  ready: boolean;
  attention?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className="size-1.5 shrink-0 rounded-full bg-muted-foreground"
      style={{
        backgroundColor: ready
          ? "var(--performance-positive)"
          : attention
            ? "var(--performance-attention)"
            : undefined,
      }}
    />
  );
}
function Payment({
  label,
  amount,
  status,
}: {
  label: string;
  amount: number | null;
  status?: string | null;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px]"
      title={`${label} · ${recordedStatus(status)}`}
      aria-label={`${label}: ${amount == null ? "Not recorded" : money(amount)}, ${recordedStatus(status)}`}
    >
      <span className="text-muted-foreground">{label}</span>
      <span
        className="font-medium tabular-nums"
        style={{
          color:
            status === "Paid"
              ? "var(--performance-positive)"
              : status === "Open"
                ? "var(--performance-payment-open)"
                : undefined,
        }}
      >
        {amount == null ? "—" : money(amount)}
      </span>
    </span>
  );
}
function statusStyle(value?: string | null): CSSProperties | undefined {
  const tone = [
    "Live",
    "Approved",
    "Export ready",
    "Verified",
    "Paid",
    "Submitted",
  ].includes(value ?? "")
    ? "positive"
    : ["Paused", "In review", "DNS pending"].includes(value ?? "")
      ? "attention"
      : ["In production", "Drafting", "Building"].includes(value ?? "")
        ? "active"
        : null;
  if (!tone) return undefined;
  const color = `var(--performance-${tone})`;
  return {
    color,
    borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
    backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
  };
}
function Status({
  label,
  value,
  href,
  compact = false,
  platform = false,
}: {
  label: string;
  value?: string | null;
  href?: string;
  compact?: boolean;
  platform?: boolean;
}) {
  const display =
    value === "In production" ? "Creating" : recordedStatus(value);
  const attention =
    compact && ["In review", "DNS pending"].includes(value ?? "");
  const labelContent = href ? (
    <Link
      href={href}
      className="underline decoration-border underline-offset-4 hover:text-foreground"
    >
      {label}
    </Link>
  ) : (
    label
  );
  const badge = (
    <Badge
      variant="outline"
      style={
        !compact || (platform && ["Live", "Paused"].includes(value ?? ""))
          ? statusStyle(value)
          : undefined
      }
      textSize={compact ? "caption" : undefined}
    >
      {attention && <ReadyDot ready={false} attention />}
      {compact && (
        <span className="font-normal text-muted-foreground">
          {labelContent}
        </span>
      )}
      {display}
    </Badge>
  );
  return compact ? (
    badge
  ) : (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{labelContent}</span>
      {badge}
    </div>
  );
}
function Sequence({
  label,
  value,
  states,
  href,
  detailed,
}: {
  label: string;
  value?: string | null;
  states: readonly string[];
  href?: string;
  detailed: boolean;
}) {
  if (!detailed) return <Status label={label} value={value} href={href} />;
  const current = states.indexOf(value ?? "");
  return (
    <div className="rounded-lg border p-3">
      <Status label={label} value={value} href={href} />
      <ol
        aria-label={`${label} milestones`}
        className="mt-3 grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${states.length},minmax(0,1fr))`,
        }}
      >
        {states.map((state, index) => (
          <li key={state} aria-current={current === index ? "step" : undefined}>
            <div
              className={`mb-2 h-0.5 rounded-full ${index <= current ? "bg-foreground" : "bg-muted"}`}
            />
            <span
              className="flex size-5 items-center justify-center rounded-full border text-muted-foreground"
              style={current === index ? statusStyle(value) : undefined}
            >
              {index < current ? (
                <Check className="size-3" />
              ) : current === index ? (
                <span className="size-1.5 rounded-full bg-current" />
              ) : null}
            </span>
            <span
              className={`mt-2 block text-[10px] leading-4 ${index === current ? "font-semibold" : "text-muted-foreground"}`}
            >
              {state === "In production"
                ? "Creating"
                : state === "Export ready"
                  ? "Export"
                  : state}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const editFields = [
  {
    key: "commercial",
    label: "Commercial relationship",
    options: COMMERCIAL_STATES,
  },
  { key: "intake", label: "Intake form", options: INTAKE_STATES },
  {
    key: "managementPayment",
    label: "Management payment",
    options: PAYMENT_STATES,
  },
  { key: "spendPayment", label: "Spend payment", options: PAYMENT_STATES },
  { key: "catalog", label: "Catalog", options: CATALOG_STATES },
  { key: "ads", label: "Ad creative", options: CREATIVE_STATES },
  {
    key: "newsletter",
    label: "Newsletter content",
    options: NEWSLETTER_STATES,
  },
  { key: "meta", label: "Meta delivery", options: PLATFORM_STATES },
  { key: "google", label: "Google delivery", options: PLATFORM_STATES },
  { key: "site", label: "Site progress", options: SITE_STATES },
  {
    key: "zernioAccess",
    label: "Zernio access",
    options: ZERNIO_ACCESS_STATES,
  },
  { key: "emailDns", label: "Email DNS", options: DNS_STATES },
] as const;

function EditClientState({
  card,
  onClose,
}: {
  card: PerformancePipelineCard;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<PerformanceCardState>({ ...card.state });
  const [stage, setStage] = useState<PipelineStage>(card.stage);
  const [note, setNote] = useState(card.note ?? "");
  const [management, setManagement] = useState(
    card.management == null ? "" : String(card.management),
  );
  const [spend, setSpend] = useState(
    card.spend == null ? "" : String(card.spend),
  );
  const save = useMutation(
    orpc.brand.setPerformanceSettings.mutationOptions({
      onSuccess: () => {
        onClose();
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  function apply() {
    const validated = performanceCardStateSchema.safeParse(state);
    if (!validated.success) {
      toast.error("Check the billing month and home count.");
      return;
    }
    const fee = management === "" ? null : Number(management);
    const budget = spend === "" ? null : Number(spend);
    if (
      [fee, budget].some(
        (amount) =>
          amount != null && !performanceAmountSchema.safeParse(amount).success,
      )
    ) {
      toast.error("Enter amounts in dollars, with up to two decimal places.");
      return;
    }
    const cardPatch: PerformanceCardState = {};
    for (const [key, value] of Object.entries(validated.data))
      if (value !== card.state[key as keyof PerformanceCardState])
        (cardPatch as Record<string, unknown>)[key] = value;
    save.mutate({
      brandId: card.id,
      patch: {
        ...(Object.keys(cardPatch).length ? { cardState: cardPatch } : {}),
        ...(stage !== card.stage ? { pipelineStage: stage } : {}),
        ...(fee !== card.management ? { monthlyFee: fee } : {}),
        ...(budget !== card.spend ? { agreedAdSpend: budget } : {}),
        ...(note.trim() !== (card.note ?? "")
          ? { note: note.trim() || null }
          : {}),
      },
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {card.name}</DialogTitle>
          <DialogDescription>
            Record current client state. Apply saves these facts; Cancel
            discards changes. Recording delivery or payment status does not
            launch campaigns or take payments.
          </DialogDescription>
        </DialogHeader>
        <fieldset
          disabled={save.isPending}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <label className="space-y-1 text-xs">
            Client journey
            <Select
              disabled={save.isPending}
              value={stage}
              onValueChange={(value) => setStage(value as PipelineStage)}
            >
              <SelectTrigger size="sm" aria-label="Client journey">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PIPELINE_COLUMNS.map((column) => (
                  <SelectItem key={column.id} value={column.id}>
                    {column.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          {editFields.map(({ key, label, options }) => (
            <label key={key} className="space-y-1 text-xs">
              {label}
              <Select
                disabled={save.isPending}
                value={state[key] ?? "__unset__"}
                onValueChange={(value) =>
                  setState((current) => ({
                    ...current,
                    [key]: value === "__unset__" ? null : value,
                  }))
                }
              >
                <SelectTrigger size="sm" aria-label={label}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unset__">Not recorded</SelectItem>
                  {options.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value === "In production" ? "Creating" : value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ))}
          <label className="space-y-1 text-xs">
            WanderOS connected
            <Select
              disabled={save.isPending}
              value={
                state.siteConnected == null
                  ? "__unset__"
                  : String(state.siteConnected)
              }
              onValueChange={(value) =>
                setState((current) => ({
                  ...current,
                  siteConnected:
                    value === "__unset__" ? null : value === "true",
                }))
              }
            >
              <SelectTrigger size="sm" aria-label="WanderOS connected">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unset__">Not recorded</SelectItem>
                <SelectItem value="true">Connected</SelectItem>
                <SelectItem value="false">Not connected</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-xs">
            Management ($)
            <Input
              aria-label="Management amount"
              type="number"
              min="0"
              step="0.01"
              value={management}
              onChange={(event) => setManagement(event.target.value)}
            />
          </label>
          <label className="space-y-1 text-xs">
            Spend ($)
            <Input
              aria-label="Spend amount"
              type="number"
              min="0"
              step="0.01"
              value={spend}
              onChange={(event) => setSpend(event.target.value)}
            />
          </label>
          <label className="space-y-1 text-xs">
            Billing month
            <Input
              aria-label="Billing month"
              type="month"
              value={state.billingPeriod ?? ""}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  billingPeriod: event.target.value || null,
                }))
              }
            />
          </label>
          <label className="space-y-1 text-xs">
            Included homes
            <Input
              aria-label="Included homes"
              type="number"
              min="0"
              step="1"
              value={state.includedHomes ?? ""}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  includedHomes:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                }))
              }
            />
          </label>
        </fieldset>
        <label className="block space-y-1 text-xs">
          Note
          <Textarea
            aria-label="Client note"
            value={note}
            maxLength={2000}
            rows={3}
            disabled={save.isPending}
            placeholder="Context for the team…"
            onChange={(event) => setNote(event.target.value)}
          />
          <span className="text-muted-foreground">
            Plain text · leave empty to remove.
          </span>
        </label>
        <DialogFooter>
          <Button variant="outline" disabled={save.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={save.isPending} onClick={apply}>
            {save.isPending ? "Saving…" : "Apply changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
