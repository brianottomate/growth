"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { SURFACE_GROUPS } from "./surfaces";
import { AtlasContext } from "./atlas-context";

function sourceHref(path: string, group: string, slug: string) {
  if (path.includes("{")) return null;
  if (group === "client" || group === "detail")
    return `/app/performance/clients/${encodeURIComponent(slug)}${path}`;
  return path || null;
}

export function PerformanceBoard() {
  const [slug, setSlug] = useState("porchlit-properties");
  return (
    <main className="flex h-dvh flex-col bg-background text-foreground">
      <header className="shrink-0 border-b px-8 py-6">
        <div className="flex items-center justify-between gap-6">
          <div>
            <Link
              href="/app/admin"
              className="text-xs text-muted-foreground hover:underline"
            >
              Team tools / Product workbenches
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Performance vision board
            </h1>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Client for links
            <input
              aria-label="Client slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-36 rounded-md border bg-background px-3 py-2 text-foreground"
            />
          </label>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Current client navigation and workflow responsibilities, alongside
          planning notes for what comes next.
        </p>
        <Link
          href="/lab/performance-board/pipeline"
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs hover:bg-muted"
        >
          Pipeline fixture
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
        <Link
          href="/lab/performance-board/brand-workspace"
          className="mt-3 ml-3 inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs hover:bg-muted"
        >
          Brand workspace fixture
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
        <Link
          href="/lab/performance-board/workflow-runs"
          className="mt-3 ml-3 inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs hover:bg-muted"
        >
          Workflow activity fixture
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
        <Link
          href="/lab/performance-board/creative-workspaces"
          className="mt-3 ml-3 inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs hover:bg-muted"
        >
          Creative workspaces fixture
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
        <p className="mt-2 text-xs text-muted-foreground">
          Loose lenses: Kyle · overview & detail / Sil · production / Brooke ·
          launch / Mikayla · financials / Brian · email & lifecycle. Nothing is
          locked in. Borrowing Atlas jobs, journeys, views, and observations;
          this board remains separate.
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>
            <span className="mr-2 rounded-full border px-2 py-0.5 text-foreground">
              Workflow
            </span>
            Direct server function, including AI or BigQuery work, without chat.
          </span>
          <span>
            <span className="mr-2 rounded-full border px-2 py-0.5 text-foreground">
              Chat-powered
            </span>
            Work guided and performed through the chat.
          </span>
          <span>
            <span className="mr-2 rounded-full border px-2 py-0.5 text-foreground">
              Human
            </span>
            Occasional emphasis on human attention or judgment, not every manual
            action.
          </span>
          <span>
            <span className="mr-2 rounded-full border px-2 py-0.5 text-foreground">
              Approval
            </span>
            Explicit human sign-off.
          </span>
        </div>
      </header>
      <div
        className="min-h-0 flex-1 overflow-auto bg-muted/20 p-8"
        aria-label="Performance planning board"
      >
        <div className="min-w-[1800px] space-y-8">
          <div className="flex w-max items-start gap-4 [&_article]:p-3 [&_aside]:p-3 [&_h2]:text-lg [&_h3]:text-sm [&_p]:text-xs [&_p]:leading-5 [&>section]:w-[420px] [&>section]:shrink-0 [&>section]:p-4">
            <section
              aria-label="Workflow zero: dashboard"
              id="performance-overview"
              className="rounded-2xl border bg-background/60 p-4"
            >
              <h2 className="text-lg font-semibold">00 · Dashboard</h2>
              <article className="mt-4 rounded-xl border bg-card p-3">
                <h3 className="font-semibold">Client journey · implemented</h3>
                <span className="mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px]">
                  Human
                </span>
                <p className="mt-2 text-muted-foreground">
                  Dashboard shows the shared journey: Prospects → Signed →
                  Onboarding → Launch prep → First month → Ongoing, with On hold
                  separate. First month means initial launch and settling in,
                  selected by the team. Stages are manual and chat-driven;
                  campaigns, payments, exports, and elapsed time never advance a
                  client.
                </p>
                <Link
                  href="/lab/performance-board/pipeline"
                  className="mt-3 inline-flex items-center gap-1 text-xs underline underline-offset-4"
                >
                  Open pipeline fixture
                  <ArrowUpRight className="size-3" aria-hidden="true" />
                </Link>
              </article>
              <article className="mt-3 rounded-xl border bg-card p-3">
                <h3 className="font-semibold">Card views · implemented</h3>
                <p className="mt-2 text-muted-foreground">
                  All, Commercial, Creative, and Delivery filter details on the
                  same journey. Choose Compact, Overview, or Detailed per card,
                  or apply a detail mode to every card. Search finds clients or
                  sites, and journey columns can be collapsed.
                </p>
              </article>
              <article className="mt-3 rounded-xl border bg-card p-3">
                <h3 className="font-semibold">Record facts independently</h3>
                <p className="mt-2 text-muted-foreground">
                  Cards are read-only until Edit client state opens a staged
                  dialog. Apply saves; Cancel discards. Management fees and
                  agreed ad spend are separate from recorded payment statuses.
                  Missing facts show Not recorded.
                </p>
                <p className="mt-2 text-muted-foreground">
                  Creating means making or revising creative. Catalog and ads
                  progress independently of platform delivery: a catalog can
                  return to Creating while Meta stays Live. Creative review,
                  WanderOS connected, Site Live, and Email DNS readiness remain
                  separate facts.
                </p>
              </article>
              <aside className="mt-3 rounded-xl border border-dashed p-3">
                <h3 className="font-semibold">Next · business summary</h3>
                <p className="mt-2 text-muted-foreground">
                  Planned above the pipeline; not implemented yet. Start with
                  Management MRR from configured monthly fees, excluding ad
                  spend. Fees do not prove collected revenue. Historical monthly
                  bars need snapshots or dated changes.
                </p>
              </aside>
              <article className="mt-3 rounded-xl border bg-card p-3">
                <h3 className="font-semibold">
                  Planned · cross-brand campaign results
                </h3>
                <span className="mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px]">
                  Human
                </span>
                <p className="mt-2 text-muted-foreground">
                  A shared view of how campaigns are going across brands and
                  channels. Working names: Results, Tracking, or Attribution.
                  Keep this distinct from creating and launching one campaign.
                </p>
                <p className="mt-2 text-muted-foreground">
                  Later, bring together spend, delivery, bookings, and other
                  results. Distinguish recorded bookings from attributed
                  results; the attribution model and data sources are still to
                  define. Until attribution data exists, attributed metrics and
                  the leaderboard show — / Coming soon, never zero.
                </p>
              </article>
              <aside className="mt-3 rounded-xl border border-dashed p-3">
                <h3 className="font-semibold">Channel & tracking context</h3>
                <p className="mt-2 text-muted-foreground">
                  Meta is the primary channel in the current operating model.
                  Some brands may add Google when spend supports it. On
                  WanderOS, tracking configuration can differ when using
                  Wander’s Meta pixel versus the client’s. Handle setup checks
                  manually for now; spend thresholds and cross-channel
                  measurement remain open.
                </p>
              </aside>
            </section>
            <section
              aria-label="Workflow one: lead to signed client"
              className="rounded-2xl border bg-background/60 p-6"
            >
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">
                  01 · Applicable lead → signed client
                </h2>
                <span className="text-xs text-muted-foreground">
                  Kyle · Sales
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                HubSpot holds the wider database. Growth brings in the
                applicable leads we choose to work on.
              </p>
              <AtlasContext journey="sales" slug={slug} />
              <div className="mt-4 space-y-2">
                {[
                  [
                    "Select a lead",
                    "Today: a salesperson searches HubSpot from Prospects. Only applicable leads enter the Performance workflow.",
                  ],
                  [
                    "Create the prospect",
                    "Create or associate the Growth brand, then enrich it. This becomes the account we prepare and pitch.",
                  ],
                  [
                    "Prepare the pitch",
                    "Generate a pitch page that sales can use. Desired flow: have this ready as part of prospect creation.",
                  ],
                  [
                    "Prepare ahead",
                    "Brand infrastructure can be set up before signing, when useful. Preparation does not mean the client is live.",
                  ],
                  [
                    "Sales does its thing",
                    "Calls, follow-ups, and negotiation can happen outside Growth. HubSpot remains the place for sales activity.",
                  ],
                  [
                    "Client signs",
                    "Signing is the handoff into the next workflow. We'll map what happens after this together.",
                  ],
                ].map(([title, description]) => (
                  <article
                    key={title}
                    className="rounded-xl border bg-card p-4"
                  >
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {description}
                    </p>
                  </article>
                ))}
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <aside className="rounded-xl border border-dashed p-4">
                  <h3 className="font-medium">Selective intake</h3>
                  <p className="mt-2 text-muted-foreground">
                    About 200,000 HubSpot records, per our discussion. Bringing
                    every record into Growth is not the goal. The eligibility
                    rule is still to define.
                  </p>
                </aside>
                <aside className="rounded-xl border border-dashed p-4">
                  <h3 className="font-medium">
                    Observation · planned automation
                  </h3>
                  <p className="mt-2 text-muted-foreground">
                    Explore a HubSpot webhook next week to create applicable
                    prospects and prepare their pitches. Potentially mirror more
                    sales statuses too.
                  </p>
                </aside>
                <aside className="rounded-xl border border-dashed p-4">
                  <h3 className="font-medium">WanderOS · live requirement</h3>
                  <p className="mt-2 text-muted-foreground">
                    Prefer brands already on WanderOS. A brand without it can
                    still be a prospect and be prepared; it needs to be on
                    WanderOS before going live with Performance.
                  </p>
                </aside>
              </div>
            </section>
            <section
              id="performance-setup"
              aria-label="Workflow two: brand setup"
              className="rounded-2xl border bg-background/60 p-6"
            >
              <h2 className="text-xl font-semibold">02 · Brand setup</h2>
              <p className="mt-2 text-muted-foreground">Mikayla</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Sil or Kristian prepares the shared creative foundations here.
                Homes and destinations live in WanderOS; connection and sync
                controls live in Settings. Client intake is reviewed on
                Overview.
              </p>
              <AtlasContext journey="setup" slug={slug} />
              <div className="mt-4 space-y-2">
                {[
                  [
                    "Branding & brand mark",
                    "Enrich the brand from its website and save its creative mark before importing WanderOS. Both are required foundations for catalog and ad creative.",
                  ],
                  [
                    "Brand story & personas",
                    "Save the brand story before importing WanderOS; draft it from the website first, then refine it with home and guest evidence later. Define personas after the story is saved; personas remain optional for WanderOS import. Direct workflows save context; Shape supports refinement.",
                  ],
                  [
                    "Brand preview & typography",
                    "Choose a general brand image from the website, library or home photos. Check heading/body fonts and the creative mark. The image does not select a representative home or import property facts.",
                  ],
                ].map(([title, description]) => (
                  <article
                    key={title}
                    className="rounded-xl border bg-card p-4"
                  >
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {description}
                    </p>
                  </article>
                ))}
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <aside className="rounded-xl border border-dashed p-4">
                  <h3 className="font-medium">Current split</h3>
                  <p className="mt-2 text-muted-foreground">
                    Overview holds account facts, observed launch progress,
                    intake, contacts and media. Setup holds identity, story and
                    personas. Extra holds client page activity until it has a
                    permanent home.
                  </p>
                </aside>
                <aside className="rounded-xl border border-dashed p-4">
                  <h3 className="font-medium">App-building principle</h3>
                  <p className="mt-2 text-muted-foreground">
                    Prefer read-only views where practical. Chat performs
                    database updates, then refreshes the view. Expose forms
                    where direct editing helps the teammate.
                  </p>
                </aside>
              </div>
            </section>
            <section
              id="performance-wanderos"
              aria-label="WanderOS: homes and destinations"
              className="rounded-2xl border bg-background/60 p-6"
            >
              <h2 className="text-xl font-semibold">02b · WanderOS</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Complete brand identity, story and creative mark in Setup first.
                Then import WanderOS homes, select Featured homes, create
                destinations and prepare catalog cards in one automatic flow.
              </p>
              <AtlasContext journey="wanderos" slug={slug} />
              <div className="mt-4 space-y-2">
                {[
                  [
                    "Featured homes & groups",
                    "Choose the homes that lead advertising and creative. Starter recommendations add to the current featured set; reusable groups organize other selections.",
                  ],
                  [
                    "Destinations",
                    "Group home locations into destinations that inform copy and campaign targeting. Guest personas remain in Setup.",
                  ],
                  [
                    "Booking targets",
                    "Choose homes, stay dates, or both to build reusable storefront destinations. Apply them explicitly to campaigns or ads; the booking site handles availability.",
                  ],
                  [
                    "All homes & workbenches",
                    "Browse the inventory, feature homes, and open an individual home for photos and booking context. Manually added homes can also be grouped.",
                  ],
                ].map(([title, description]) => (
                  <article
                    key={title}
                    className="rounded-xl border bg-card p-4"
                  >
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {description}
                    </p>
                  </article>
                ))}
              </div>
              <aside className="mt-4 rounded-xl border border-dashed p-4">
                <h3 className="font-medium">Connection & sync</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Website detection can run before brand setup. Import stays
                  blocked until identity, story and creative mark are saved,
                  including requests from chat or API. Configure the booking
                  site and refresh the feed in Settings. Automatic feed and
                  booking links depend on WanderOS; selection does not establish
                  live availability or launch a campaign.
                </p>
              </aside>
            </section>
            <section
              aria-label="Workflow three: catalog"
              id="performance-catalog"
              className="rounded-2xl border bg-background/60 p-6"
            >
              <h2 className="text-xl font-semibold">03 · Catalog</h2>
              <p className="mt-2 text-muted-foreground">Sil</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Sil’s production workflow · Meta catalog creative. Initial
                preparation runs automatically during WanderOS import, after
                brand identity, story and creative mark are saved.
              </p>
              <AtlasContext journey="catalog" slug={slug} />
              <div className="mt-4 space-y-2">
                {[
                  [
                    "What should be in place",
                    "Brand identity, saved story and creative mark precede the WanderOS import and its initial catalog preparation. Imported homes and usable photos supply the cards. Personas and complete onboarding are not required.",
                  ],
                  [
                    "Choose the catalog card",
                    "Start in Catalog with the card template selector at the top. Work from the list of home cards or switch to the grid view.",
                  ],
                  [
                    "Work through each home",
                    "Review the photo and its overlaid composition text. Select images, refine card copy and visual treatment, and decide which homes to include.",
                  ],
                  [
                    "Job · catalog ad copy",
                    "Proposed: a section near the top for the Meta catalog ad’s copy, separate from the composition text on each home image. Map the fields and where that copy is used.",
                  ],
                  [
                    "Card review & editing",
                    "Separate on-image headline and facts from home amenities and composition metadata. Quick actions include choose photo, new photo, new copy, exclude, and approve. Compose/artwork modes and per-card composition overrides belong in the editor.",
                  ],
                  [
                    "Job · visual crop editor",
                    "Explore a fixed-format frame with drag-to-position and zoom over the original photo. Preserve the source image and apply the crop before composition text. The renderer already supports a focal point, but catalog cards do not yet expose or persist it.",
                  ],
                  [
                    "Workflow · new copy / new photo",
                    "Run a focused server function to generate new copy or choose a new photo, often using AI, without a conversation. Keep these direct actions distinct from chat-based collaboration.",
                  ],
                  [
                    "Chat-powered · refine together",
                    "Use the chat to discuss, direct, and refine catalog work with the agent. This is a different interaction path from running a standalone generation workflow.",
                  ],
                  [
                    "Review & export",
                    "Review and approve included cards, then export catalog creative. Current export checks include at least one home, approval of included cards, and valid artwork.",
                  ],
                ].map(([title, description]) => (
                  <article
                    key={title}
                    className="rounded-xl border bg-card p-4"
                  >
                    <h3 className="font-semibold">{title}</h3>
                    {title === "Card review & editing" ||
                    title === "Review & export" ? (
                      <span className="mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px]">
                        {title === "Review & export" ? "Approval" : "Human"}
                      </span>
                    ) : null}
                    {title?.startsWith("Workflow ·") ||
                    title?.startsWith("Chat-powered ·") ? (
                      <span className="mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px]">
                        {title.startsWith("Workflow ·")
                          ? "Workflow"
                          : "Chat-powered"}
                      </span>
                    ) : null}
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {description}
                    </p>
                  </article>
                ))}
              </div>
              <p className="mt-5 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                Observation · catalog is Meta-specific; regular ads belong to Ad
                studio and the more general campaign workflow. The exact Meta
                catalog campaign/ad-set arrangement is still to verify.
              </p>
              <p className="mt-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                Observation · Cancel currently discards text edits but a home
                gallery photo selection saves immediately, changing the home’s
                shared hero. Consider staging that selection until Apply, and
                clarifying a card-only photo versus the home’s shared hero.
                Recorded for follow-up; editor behavior is unchanged.
              </p>
            </section>
            {[
              {
                id: "studio",
                title: "04 · Ad studio",
                owner: "Sil",
                steps: [
                  [
                    "Create regular ads",
                    "Plan a production space for ad ideas, copy, photos/artwork, compositions, and size variants. Catalog creative remains its own workflow.",
                  ],
                  [
                    "Review & hand off",
                    "Explore how approved creative reaches Brooke’s campaign delivery workflow. Current campaigns already contain inline studio editing; this column proposes a role-based split, not a change to the app yet.",
                  ],
                ],
              },
              {
                id: "campaigns",
                title: "05 · Campaigns",
                owner: "Brooke",
                steps: [
                  [
                    "Booking targets · WanderOS",
                    "Attach a reusable homes/dates booking target as the campaign’s fallback destination for Meta and Google. Existing ad-specific links are preserved. Manage targets in WanderOS; this is not an availability report.",
                  ],
                  [
                    "Ads · inline studio",
                    "Create starter ideas or add an ad, then edit copy, photos/artwork, composition, and size variants inside the campaign. The creative pool and media library supply assets rather than being mandatory workflow steps. Map this shared studio against the separate Ad studio page.",
                  ],
                  [
                    "Delivery · audiences",
                    "Review creative approval and campaign audiences: guest-origin geography, age, optional persona links, and linked Meta audiences. Suggestions draw on brand evidence. With no audiences, Meta uses one broad ad set; each configured audience becomes an ad set.",
                  ],
                  [
                    "Platforms · setup & previews",
                    "Plan provider-specific delivery. Meta’s card includes account/Page, objective, budget and budget mode, schedule, placements, conversion tracking, and placement-by-placement previews. Readiness checks identify missing configuration or artwork. Other platforms have their own settings and compilation rules.",
                  ],
                  [
                    "Review, push & launch",
                    "Creative approval, provider push, and live delivery are separate states. Meta push creates the campaign paused; launching is a separate action. After push, platform rows show delivery controls and stored performance stats. Clarify Sil’s production-to-Brooke launch handoff.",
                  ],
                ],
              },
              {
                id: "email",
                title: "06 · Email & lifecycle",
                owner: "Brian · Sil",
                steps: [
                  [
                    "Marketing domain & setup",
                    "The Email page combines sender/domain setup and email production, with warehouse-backed audience preparation. Lifecycle planning stays separate.",
                  ],
                  [
                    "Plan & style marketing emails",
                    "Work in chat, start from a template, or establish the brand’s email style. Blast, newsletter, and sequence belong to the marketing email workflow discussed here.",
                  ],
                  [
                    "Separate lifecycle planning",
                    "The separate Lifecycle surface is for theorizing and mapping a company’s transactional and lifecycle emails. Keep that planning purpose distinct from marketing email production; clarify the connections later.",
                  ],
                  [
                    "Newsletter capture",
                    "An existing, underused surface worth exploring. Capture this as an opportunity for a later walkthrough rather than expanding the workflow now.",
                  ],
                  [
                    "Review & delivery",
                    "Outline: approvals, sending, and performance feedback. Define handoffs and operating views together.",
                  ],
                ],
              },
            ].map((workflow) => (
              <section
                key={workflow.id}
                aria-label={workflow.title}
                id={
                  workflow.id === "studio"
                    ? "performance-ad-studio"
                    : workflow.id === "email"
                      ? "performance-email"
                      : "performance-campaigns"
                }
                className="rounded-2xl border bg-background/60 p-6"
              >
                <h2 className="text-xl font-semibold">{workflow.title}</h2>
                <p className="mt-2 text-muted-foreground">{workflow.owner}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {workflow.id === "email"
                    ? "Brian’s lens · marketing email production and separate lifecycle planning."
                    : workflow.id === "studio"
                      ? "Proposed production lens · regular ad creative."
                      : "Shared campaign workspace · inline creative production, audience planning, and provider delivery."}
                </p>
                <AtlasContext journey={workflow.id} slug={slug} />
                <div className="mt-4 space-y-2">
                  {workflow.steps.map(([title, description]) => (
                    <article
                      key={title}
                      className="rounded-xl border bg-card p-4"
                    >
                      <h3 className="font-semibold">{title}</h3>
                      {title === "Review, push & launch" ||
                      title === "Review & hand off" ? (
                        <span className="mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px]">
                          Approval
                        </span>
                      ) : title === "Plan & style marketing emails" ? (
                        <span className="mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px]">
                          Chat-powered
                        </span>
                      ) : null}
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {description}
                      </p>
                    </article>
                  ))}
                </div>
                <p className="mt-5 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  {workflow.id === "campaigns"
                    ? "Observation · Audiences and Platforms sit inside Delivery in the implementation. Explore the overlap between campaign inline editing, Ad studio, and the media library before rearranging pages."
                    : workflow.id === "studio"
                      ? "Planning split only · decide which editing stays inline and which work belongs in Ad studio."
                      : "Walkthrough notes · connections and component examples to explore together."}
                </p>
              </section>
            ))}
            <section
              aria-label="Workflow seven: billing and finance"
              className="rounded-2xl border bg-background/60 p-4"
            >
              <h2 className="text-lg font-semibold">07 · Billing & finance</h2>
              <p className="mt-2 text-muted-foreground">Mikayla</p>
              <p className="mt-2 text-muted-foreground">
                Workflow placeholder · map together later.
              </p>
              <article className="mt-4 rounded-xl border bg-card p-3">
                <h3 className="font-semibold">Financial overview</h3>
                <p className="mt-2 text-muted-foreground">Kyle · Mikayla</p>
                <span className="mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px]">
                  Human
                </span>
                <p className="mt-2 text-muted-foreground">
                  A financial view for revenue and commercial oversight. Likely
                  belongs under Billing & finance rather than sharing one
                  dashboard with campaign results. Metrics and placement are
                  still to define.
                </p>
              </article>
            </section>
          </div>
          <section aria-label="Shared readiness concept" className="space-y-3">
            <h2 className="text-lg font-semibold">What should be in place</h2>
            <p className="text-xs text-muted-foreground">
              Proposed shared concept · what supports creation, review, and
              delivery. WanderOS import requires brand identity, saved story and
              creative mark. Other readiness notes remain planning concepts;
              complete onboarding is not a blanket prerequisite.
            </p>
            <div className="flex w-max items-start gap-4">
              {[
                {
                  name: "Catalog",
                  create:
                    "Homes to include, usable photos, and basic visual defaults.",
                  review:
                    "Image copy and crops checked; included cards approved. Catalog ad copy is a separate job to define.",
                  deliver:
                    "Valid catalog export and the destination platform’s catalog setup. Map the publishing handoff.",
                },
                {
                  name: "Ad studio",
                  create:
                    "An ad idea or brief, source photos/artwork, and brand context to guide the copy.",
                  review:
                    "Ad copy, destination, composition, and required size variants checked and approved.",
                  deliver:
                    "Approved creative handed to a campaign. Production itself does not require a connected ad account.",
                },
                {
                  name: "Campaigns",
                  create:
                    "A campaign goal, creative, and a destination. Audiences can start broad; booking targets are optional.",
                  review:
                    "Approved ads plus provider-specific audience, account, budget, schedule, placement, and tracking configuration.",
                  deliver:
                    "Provider readiness passes, push reviewed, then launch as a separate decision. WanderOS is the agreed Performance go-live requirement.",
                },
                {
                  name: "Email",
                  create:
                    "A message goal, brand style or template, and content. Domain connection need not block drafting.",
                  review:
                    "Content and links checked; sender and intended audience clarified.",
                  deliver:
                    "Verified marketing sender/domain, eligible recipients, and send or sequence settings. Confirm the exact requirements in a later walkthrough.",
                },
              ].map((product) => (
                <article
                  key={product.name}
                  className="w-[420px] rounded-2xl border bg-card p-4"
                >
                  <h3 className="text-sm font-semibold">{product.name}</h3>
                  <dl className="mt-3 space-y-3 text-xs">
                    {[
                      ["Create", product.create],
                      ["Review", product.review],
                      ["Deliver", product.deliver],
                    ].map(([stage, inputs]) => (
                      <div key={stage}>
                        <dt className="font-medium">{stage}</dt>
                        <dd className="mt-1 leading-5 text-muted-foreground">
                          {inputs}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Shared ingredients: brand identity, source assets, message,
              audience, and destination. Each job uses only what it needs. Gaps
              should point to the next useful action; approval and delivery
              remain separate.
            </p>
          </section>
          <section aria-label="Future workflows" className="space-y-3">
            <h2 className="text-lg font-semibold">Future</h2>
            <div className="flex w-max gap-4">
              <article className="w-[420px] rounded-2xl border border-dashed bg-background/60 p-4">
                <h3 className="text-sm font-semibold">Influencers</h3>
              </article>
            </div>
          </section>
          <div className="grid grid-cols-5 items-start gap-5">
            {SURFACE_GROUPS.map((group) => (
              <section
                key={group.id}
                className="rounded-2xl border bg-card p-5"
              >
                <h2 className="text-lg font-semibold tracking-tight">
                  {group.title}
                </h2>
                <p className="mt-1 mb-5 text-xs text-muted-foreground">
                  {group.note}
                </p>
                <div className="space-y-3">
                  {group.surfaces.map((surface) => {
                    const href = sourceHref(surface.path, group.id, slug);
                    return (
                      <article
                        key={surface.name}
                        className="rounded-xl border bg-background/60 p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold">
                            {surface.name}
                          </h3>
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Open ${surface.name}`}
                              className="rounded p-1 text-muted-foreground hover:bg-muted"
                            >
                              <ArrowUpRight className="size-4" />
                            </a>
                          ) : null}
                        </div>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          {surface.parts.join(" · ")}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          <section className="rounded-2xl border border-dashed p-6">
            <h2 className="text-lg font-semibold">Component extracts</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Room to place pieces side by side as we explore.
            </p>
            <div className="mt-5 grid grid-cols-4 gap-5">
              {[
                "Client card",
                "Launch brief",
                "Audience & seed lists",
                "Campaign preview",
              ].map((name) => (
                <div
                  key={name}
                  className="flex h-40 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground"
                >
                  {name} · to add
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
