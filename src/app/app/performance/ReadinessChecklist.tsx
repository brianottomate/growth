"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { orpc } from "@/orpc/client";
import { toast } from "@/components/ui/toast";
import type { LaunchItem } from "@/lib/launch-checklist";
import { ListChecks } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { ReadinessChecklist as Checklist } from "@/lib/performance-readiness";
import {
  ReadinessProgress,
  readinessGroupLabel,
  type ReadinessLinks,
} from "./ReadinessProgress";

/** Checked values come from the server; clicks record explicit milestones. */
export function ReadinessChecklist({
  checklist,
  links,
  defaultOpen = false,
  brandId,
  revision,
}: {
  checklist: Checklist;
  links: ReadinessLinks;
  defaultOpen?: boolean;
  brandId?: string;
  revision?: number;
}) {
  const router = useRouter();
  const save = useMutation(
    orpc.performance.setLaunchChecklist.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (error) => {
        toast.error(error.message);
        router.refresh();
      },
    }),
  );
  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={defaultOpen ? "checklist" : undefined}
    >
      <AccordionItem value="checklist" border="none">
        <AccordionTrigger appearance="compact" className="items-center">
          <span className="flex flex-1 items-baseline justify-between gap-3">
            <span className="flex items-center gap-2 text-base font-semibold">
              <ListChecks
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              Launch checklist
            </span>
            <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
              {checklist.done} of {checklist.total} done
            </span>
          </span>
        </AccordionTrigger>
        <div className="pb-4">
          <ReadinessProgress checklist={checklist} />
        </div>
        <AccordionContent className="space-y-4 pb-4">
          <Accordion
            type="multiple"
            defaultValue={checklist.groups
              .filter((group) => group.done < group.total)
              .map((group) => group.id)}
          >
            {checklist.groups.map((group) => {
              // A shared destination appears once in the phase header.
              const openItems = group.items.filter(
                (item) => !item.done && item.action && links[item.action.to],
              );
              const shared = openItems.filter(
                (item) =>
                  openItems.filter(
                    (other) =>
                      other.action?.to === item.action?.to &&
                      other.action?.label === item.action?.label,
                  ).length > 1,
              );
              const sharedActions = [
                ...new Map(
                  shared.map((item) => [item.action!.to, item.action!]),
                ).values(),
              ];
              return (
                <AccordionItem key={group.id} value={group.id}>
                  <div className="grid grid-cols-[minmax(0,1fr)_16px] items-center gap-x-3 @lg:grid-cols-[minmax(0,1fr)_auto_16px] [&>h3]:col-span-full [&>h3]:row-start-1 [&>h3]:grid [&>h3]:grid-cols-subgrid">
                    <AccordionTrigger
                      appearance="compact"
                      className="col-span-full grid min-w-0 grid-cols-subgrid items-center [&>svg]:col-start-2 @lg:[&>svg]:col-start-3"
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="text-sm font-medium">
                          {readinessGroupLabel(group.id, group.label)}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {group.done}/{group.total}
                        </span>
                      </span>
                    </AccordionTrigger>
                    {sharedActions.map((action) => (
                      <Link
                        key={action.to}
                        href={links[action.to]!}
                        className="z-10 col-span-full col-start-1 row-start-2 mb-2 inline-flex min-h-9 items-center gap-2 justify-self-end rounded-full border bg-card px-3 text-xs font-medium hover:bg-muted @lg:col-span-1 @lg:col-start-2 @lg:row-start-1 @lg:mb-0"
                      >
                        {action.label}
                        <span className="text-muted-foreground">
                          {
                            shared.filter(
                              (item) => item.action?.to === action.to,
                            ).length
                          }{" "}
                          items
                        </span>
                      </Link>
                    ))}
                  </div>
                  <AccordionContent className="pb-2">
                    <ul className="divide-y divide-border/60">
                      {group.items.map((item) => {
                        const href = item.action ? links[item.action.to] : null;
                        const sharedAction = sharedActions.some(
                          (action) =>
                            action.to === item.action?.to &&
                            action.label === item.action?.label,
                        );
                        return (
                          <li
                            key={item.id}
                            className="flex flex-wrap items-start gap-x-3 gap-y-1 py-3"
                          >
                            <Checkbox
                              aria-label={item.label}
                              checked={item.done}
                              disabled={
                                !brandId || revision == null || save.isPending
                              }
                              onCheckedChange={(checked) => {
                                if (brandId && revision != null)
                                  save.mutate({
                                    brandId,
                                    expectedRevision: revision,
                                    patch: [
                                      {
                                        item: item.id as LaunchItem,
                                        checked: checked === true,
                                      },
                                    ],
                                  });
                              }}
                              className="mt-0.5"
                            />
                            <span className="min-w-0 flex-1 basis-40">
                              <span className="sr-only">
                                {item.done ? "Complete: " : "Incomplete: "}
                              </span>
                              <span className="block text-sm font-medium">
                                {item.label}
                              </span>
                              {item.detail ? (
                                <span
                                  title={item.provenance}
                                  className="mt-0.5 block text-xs leading-5 text-muted-foreground"
                                >
                                  {item.detail}
                                </span>
                              ) : null}
                            </span>
                            {!item.done && href && !sharedAction ? (
                              <Link
                                href={href}
                                className="inline-flex min-h-8 items-center text-xs font-medium underline decoration-border underline-offset-4 hover:decoration-foreground"
                              >
                                {item.action!.label}
                              </Link>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
          <p className="text-xs text-muted-foreground">
            Recorded by your team and completed workflows.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
