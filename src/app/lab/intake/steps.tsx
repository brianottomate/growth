"use client";

/**
 * The brand section of the proposed intake, rendered read-only.
 *
 * Started as a copy of wander.com's IntakeForm.tsx at 047911505c
 * (2026-10-16) and now diverges on purpose: sending moves ahead of the
 * account connection, and the guest list carries its consent. This is the
 * design to port back, not a mirror of what wander.com runs today.
 */

import { Button } from "@wandercom/design-system-web/ui/button";
import { Checkbox } from "@wandercom/design-system-web/ui/checkbox";
import { Input } from "@wandercom/design-system-web/ui/input";
import { Textarea } from "@wandercom/design-system-web/ui/textarea";
import type {
  IntakeAnswers as Answers,
  IntakeListing,
  IntakePrefill,
} from "./fixtures";

const BUDGET_PRESETS = ["$2,500", "$5,000", "$10,000", "$20,000"];
const MIN_PER_PROPERTY = 200;
export const SUPPORT_EMAIL = "performance@wander.com";

export type Step = {
  label: string;
  title: string;
  help?: string;
  body: React.ReactNode;
  complete: boolean;
};

/** Read-only: every handler in the copied markup lands here. */
const noop = () => undefined;

export function buildBrandSteps(
  prefill: IntakePrefill,
  listings: { supported: boolean; listings: IntakeListing[] },
  a: Answers,
): Step[] {
  const set = noop as <K extends keyof Answers>(
    key: K,
    value: Answers[K],
  ) => void;
  return [
    {
      label: "Your details",
      title: "First let's confirm your direct booking site",
      complete: a.detailsConfirmed,
      body: (
        <>
          <div className="rounded-xl border border-border-secondary p-4 text-sm">
            <p className="font-medium">{prefill.brand}</p>
            {prefill.site && (
              <p className="mt-1 text-secondary">{prefill.site}</p>
            )}
          </div>
          <Check
            checked={a.detailsConfirmed}
            onChange={(v) => set("detailsConfirmed", v)}
            label="That's correct"
            required
          />
          <Field
            label="Who should receive the monthly performance report?"
            optional
            hint="Separate emails with a comma"
          >
            <Input
              value={a.reportEmails}
              onChange={(e) => set("reportEmails", e.target.value)}
            />
          </Field>
        </>
      ),
    },
    {
      label: "Properties",
      title: "Which homes should we advertise?",
      help: "Aim for 4–8 homes.",
      complete: a.allProperties || a.propertyUrls.length > 0,
      body: (
        <>
          <p className="text-sm leading-relaxed text-secondary">
            This is your chance to feature the homes that best represent your
            brand, the ones with your strongest owner relationships, and the
            ones you most want booked. Guests who land on your site search
            around from there and book others, so the ad&apos;s job is getting
            them through the door rather than covering every listing.
          </p>
          <PropertyPicker
            listings={listings.listings}
            supported={listings.supported}
            selected={a.propertyUrls}
            all={a.allProperties}
          />
          <Field
            label="Anything we should know about those?"
            optional
            hint="One coming offline for renovation, one you are pushing harder this season, anything that changes how we would treat it."
          >
            <Textarea
              rows={3}
              value={a.propertyNotes}
              onChange={(e) => set("propertyNotes", e.target.value)}
            />
          </Field>
        </>
      ),
    },
    {
      label: "Budget",
      title: "Let's set your ad budget for the first month",
      help: "Set your budget for ads. We recommend starting with at least $2,500 a month. We will not exceed it and you will be billed at the end of the month.",
      complete: Boolean(a.budget.trim()) && a.billingAcknowledged,
      body: (
        <>
          <div className="flex flex-wrap gap-2">
            {BUDGET_PRESETS.map((preset) => (
              <Chip key={preset} active={a.budget === preset}>
                {preset}
              </Chip>
            ))}
            <Chip active={a.budget === "recommend"}>
              Tell me what you&apos;d recommend
            </Chip>
          </div>
          <Field
            label="Or another amount"
            optional
            hint="We recommend starting with at least $2,500 a month."
          >
            <Input
              inputMode="numeric"
              placeholder="$ per month"
              value={
                BUDGET_PRESETS.includes(a.budget) || a.budget === "recommend"
                  ? ""
                  : a.budget
              }
              onChange={(e) => set("budget", e.target.value)}
            />
          </Field>
          <BudgetPerProperty
            budget={a.budget}
            propertyCount={a.propertyUrls.length}
            all={a.allProperties}
          />
          <Check
            checked={a.billingAcknowledged}
            onChange={(v) => set("billingAcknowledged", v)}
            label="Got it. Ad spend is invoiced at the end of each month, for what actually ran."
            required
          />
          <Field
            label="Should invoices go somewhere else?"
            optional
            hint="A bookkeeper, an owner, or an accounts inbox."
          >
            <Input
              value={a.invoiceEmail}
              onChange={(e) => set("invoiceEmail", e.target.value)}
            />
          </Field>
        </>
      ),
    },
    {
      label: "Content and guests",
      title: "Where can we find your photos and guest list?",
      help: "We build the ads from your booking site: your photography, your homes, your logo.",
      complete: !a.guestListDriveUrl.trim() || a.guestConsent,
      body: (
        <>
          <Field
            label="Photos and video"
            optional
            hint="A Google Drive or Dropbox link. Include content from the specific homes you want to feature, plus the best content you have overall. Walkthroughs, drone shots, anything you or your team filmed, plus any creator content you have the rights to use."
          >
            <Input
              type="url"
              placeholder="https://drive.google.com/..."
              value={a.creativeDriveUrl}
              onChange={(e) => set("creativeDriveUrl", e.target.value)}
            />
          </Field>
          <Field
            label="Past guest list"
            optional
            hint="Name and email is all we use: to find more people like your best guests, and to stop paying to reach people who already stayed. The same link works if it is all one folder."
          >
            <Input
              type="url"
              placeholder="https://drive.google.com/..."
              value={a.guestListDriveUrl}
              onChange={(e) => set("guestListDriveUrl", e.target.value)}
            />
          </Field>
          {a.guestListDriveUrl.trim() && (
            <Check
              checked={a.guestConsent}
              onChange={(v) => set("guestConsent", v)}
              label="These guests gave us their details when they booked or signed up, and we may use them for advertising and email."
              required
            />
          )}
          <p className="rounded-lg border border-border-primary px-3 py-2.5 text-xs leading-relaxed text-secondary">
            <span className="font-medium text-primary">
              Check the sharing settings first.
            </span>
            {
              " A private link opens for you but not for us. In Google Drive, click Share and set General access to “Anyone with the link”. In Dropbox, copy a link that allows viewing."
            }
          </p>
        </>
      ),
    },
    {
      label: "Send",
      title: "Send it in",
      help: `${prefill.repName ?? "Your Wander contact"} starts on your launch plan as soon as this arrives. Connecting your accounts and setting up email come next, now or later from this same link.`,
      complete: true,
      body: (
        <>
          <ReviewList answers={a} />
          <Field label="Anything else we should know?" optional>
            <Textarea
              rows={3}
              value={a.anythingElse}
              onChange={(e) => set("anythingElse", e.target.value)}
            />
          </Field>
          <Button variant="primary" size="md" className="w-full">
            Send it in
          </Button>
        </>
      ),
    },
  ];
}

function ReviewList({ answers: a }: { answers: Answers }) {
  const rows: [string, string][] = [
    [
      "Homes",
      a.allProperties
        ? "All of them"
        : a.propertyUrls.length
          ? `${a.propertyUrls.length} selected`
          : "None yet",
    ],
    [
      "Monthly budget",
      a.budget === "recommend" ? "Your recommendation" : a.budget || "Not set",
    ],
    ["Report goes to", a.reportEmails || "You"],
    ["Photos and video", a.creativeDriveUrl ? "Link added" : "No link"],
    ["Guest list", a.guestListDriveUrl ? "Link added" : "No link"],
  ];
  return (
    <dl className="divide-y divide-border-primary rounded-xl border border-border-secondary text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
          <dt className="text-secondary">{label}</dt>
          <dd className="text-right font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---- pieces -----------------------------------------------------------

export function Field({
  label,
  children,
  hint,
  optional,
  required,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  optional?: boolean;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium">{label}</span>
        {optional && (
          <span className="text-[11px] text-secondary">Optional</span>
        )}
        {required && (
          <span className="text-[11px] text-amber-500">Required</span>
        )}
      </div>
      {hint && <p className="text-xs leading-relaxed text-secondary">{hint}</p>}
      {children}
    </div>
  );
}

export function Check({
  checked,
  onChange,
  label,
  required,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed">
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => onChange(next === true)}
        className="mt-0.5 shrink-0"
      />
      <span>
        {label}
        {required && !checked && (
          <span className="ml-1.5 text-[11px] text-amber-500">Required</span>
        )}
      </span>
    </label>
  );
}

export function Chip({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        active
          ? "border-primary bg-primary text-surface-primary"
          : "border-border-secondary hover:border-primary"
      }`}
    >
      {children}
    </button>
  );
}

function PropertyPicker({
  listings,
  supported,
  selected,
  all,
}: {
  listings: IntakeListing[];
  supported: boolean;
  selected: string[];
  all: boolean;
}) {
  // The live picker floats ticked homes above a search filter. With no
  // query to type, its first 60 rows are simply the list.
  const shown = listings.slice(0, 60);

  return (
    <div className="space-y-3">
      <Chip active={all}>All of them</Chip>

      {(!all || supported) && (
        <>
          {supported && listings.length > 0 && (
            <>
              {listings.length > 12 && (
                <Input
                  value=""
                  placeholder={`Search ${listings.length} homes by name or URL…`}
                  onChange={noop}
                />
              )}
              <div className="max-h-72 divide-y divide-border-primary overflow-y-auto rounded-xl border border-border-secondary">
                {shown.map((row) => (
                  <div
                    key={row.url}
                    className="flex items-center gap-3 px-3 py-2 text-sm"
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <Checkbox
                        checked={selected.includes(row.url)}
                        className="shrink-0"
                      />
                      {row.imageUrl ? (
                        // oxlint-disable-next-line nextjs/no-img-element
                        <img
                          src={row.imageUrl}
                          alt=""
                          loading="lazy"
                          className="size-10 shrink-0 rounded-md bg-surface-secondary object-cover"
                        />
                      ) : (
                        <span className="size-10 shrink-0 rounded-md bg-surface-secondary" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {row.name}
                      </span>
                    </label>
                    {row.bedrooms != null && (
                      <span className="shrink-0 text-xs text-secondary">
                        {row.bedrooms} bd
                      </span>
                    )}
                    <span className="shrink-0 px-1 text-xs text-secondary">
                      ↗
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {!supported && (
            <>
              <div className="flex gap-2">
                <Input
                  type="url"
                  value=""
                  placeholder="https://yoursite.com/..."
                  onChange={noop}
                />
                <Button variant="secondary" size="md" className="shrink-0">
                  Add
                </Button>
              </div>
              {/* The live form keeps pasted URLs in state but never lists
                  them, so only the count below shows what was added. */}
            </>
          )}

          {selected.length > 0 && (
            <p className="text-xs text-secondary">
              {selected.length} home{selected.length === 1 ? "" : "s"} selected
              {selected.length > 10
                ? ". More than ten spreads the budget thin."
                : "."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function BudgetPerProperty({
  budget,
  propertyCount,
  all,
}: {
  budget: string;
  propertyCount: number;
  all: boolean;
}) {
  const dollars = Number.parseFloat(budget.replace(/[^0-9.]/g, ""));
  if (all || propertyCount === 0 || !Number.isFinite(dollars) || dollars <= 0) {
    return null;
  }
  const per = Math.round(dollars / propertyCount);
  if (per >= MIN_PER_PROPERTY) {
    return null;
  }
  return (
    <p className="text-xs leading-relaxed text-amber-600">
      That is about ${per} per home per month across {propertyCount} homes.
      Under ${MIN_PER_PROPERTY} each, the spend spreads too thin to get real
      traction. Either raise the budget or feature fewer homes.
    </p>
  );
}
