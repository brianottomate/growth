"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, Pause, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AudiencePanel, CampaignPanel, LaunchBrief } from "./LaunchPanels";
import { CatalogPanel } from "./CatalogPanel";
import { CreativePanel } from "./CreativePanel";

export function ClientWorkspace() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [qaNotice, setQaNotice] = useState(false);
  const [created, setCreated] = useState(false);

  return (
    <section className="min-w-0 space-y-5">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 font-semibold text-amber-600">
            DH
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">
                Desert House Co.
              </h2>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
                {created ? "In Meta · Awaiting your QA" : "Ready to launch"}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Fictional Scottsdale client · 3 client-selected starting
              properties · Handoff to Brooke
            </p>
          </div>
        </div>
        {created ? (
          <Button shape="round" onClick={() => setQaNotice(true)}>
            <ExternalLink aria-hidden="true" />
            Open Meta for QA
          </Button>
        ) : (
          <Button shape="round" onClick={() => setConfirmOpen(true)}>
            <Pause aria-hidden="true" />
            Create in Meta (paused)
          </Button>
        )}
      </header>

      <div className="flex flex-col justify-between gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 sm:flex-row sm:items-center">
        <div className="flex gap-3">
          <CheckCircle2
            className="mt-0.5 size-5 shrink-0 text-emerald-600"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-semibold">
              Everything in the local campaign build is complete.
            </p>
            <p className="text-xs text-muted-foreground">
              Local build complete → click Create in Meta (paused) → Brooke QA’s
              in Meta → Brooke enables → Live. All checks, values, and
              destinations shown here are simulated.
            </p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          Brooke owns QA and enablement
        </span>
      </div>

      {created ? (
        <div
          role="status"
          className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 text-sm"
        >
          <strong>In Meta · Awaiting your QA</strong>
          <span className="text-muted-foreground">
            {" "}
            — Demo state only. Paused; nothing is spending. Reload resets this
            simulation.
          </span>
        </div>
      ) : null}

      <Tabs defaultValue="brief" className="min-w-0">
        <div className="overflow-x-auto pb-1">
          <TabsList className="w-max">
            <TabsTrigger value="brief">Launch brief</TabsTrigger>
            <TabsTrigger value="creative">
              Properties &amp; creative
            </TabsTrigger>
            <TabsTrigger value="audience">Audience</TabsTrigger>
            <TabsTrigger value="campaign">Campaign build</TabsTrigger>
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="brief">
          <LaunchBrief />
        </TabsContent>
        <TabsContent value="creative">
          <CreativePanel />
        </TabsContent>
        <TabsContent value="audience">
          <AudiencePanel />
        </TabsContent>
        <TabsContent value="campaign">
          <CampaignPanel />
        </TabsContent>
        <TabsContent value="catalog">
          <CatalogPanel />
        </TabsContent>
      </Tabs>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Create fictional campaign in paused demo state?
            </DialogTitle>
            <DialogDescription>
              This is a local UI simulation. It will make no Meta or provider
              call, save nothing, and cannot start spend.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <p className="flex gap-2 font-medium">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Brooke remains the launch owner.
            </p>
            <p className="mt-2 text-muted-foreground">
              The next local status will be “In Meta · Awaiting your QA.” In a
              real launch, Brooke would QA in Meta, enable the campaign, and
              move it to Live.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setCreated(true);
                setConfirmOpen(false);
              }}
            >
              Confirm paused demo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={qaNotice} onOpenChange={setQaNotice}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Safe demo notice</DialogTitle>
            <DialogDescription>
              There is no Meta campaign to open. This prototype never connects
              to Meta, creates campaigns, or starts spend.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setQaNotice(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
