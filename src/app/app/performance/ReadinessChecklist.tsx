"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DatePicker,
  fromDateInputValue,
  toDateInputValue,
} from "@/components/ui/date-picker";
import { orpc } from "@/orpc/client";
import { toast } from "@/components/ui/toast";
import type { LaunchItem } from "@/lib/launch-checklist";
import { Check, ListChecks } from "lucide-react";
import { cn } from "@/components/ui/lib/utils";

import {
  AccordionRoot as Accordion,
  AccordionPanel as AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@wandercom/design-system-web/ui/accordion";
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
}: {
  checklist: Checklist;
  links: ReadinessLinks;
  defaultOpen?: boolean;
  brandId?: string;
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
    <Accordion defaultValue={defaultOpen ? ["checklist"] : []}>
      <AccordionItem value="checklist">
        <AccordionTrigger className="items-center">
          <span className="flex flex-1 items-baseline justify-between gap-3">
            <span className="flex items-center gap-2 text-base font-semibold">
              <ListChecks
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              Onboarding checklist
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
            multiple
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
                  <div className="grid grid-cols-[minmax(0,1fr)_20px] items-center gap-x-3 @lg:grid-cols-[minmax(0,1fr)_auto_20px] [&>h3]:col-span-full [&>h3]:row-start-1 [&>h3]:grid [&>h3]:grid-cols-subgrid">
                    <AccordionTrigger className="col-span-full grid min-w-0 grid-cols-subgrid items-center [&>svg]:col-start-2 @lg:[&>svg]:col-start-3">
                      <span className="flex items-baseline gap-2">
                        <span className="text-sm font-medium">
                          {readinessGroupLabel(group.id, group.label)}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {group.done}/{group.total}
                        </span>
                      </span>
                    </AccordionTrigger>
                    {sharedActions.length > 0 && (
                      <div className="z-10 col-span-full col-start-1 row-start-2 mb-2 flex flex-wrap justify-end gap-2 @lg:col-span-1 @lg:col-start-2 @lg:row-start-1 @lg:mb-0">
                        {sharedActions.map((action) => (
                          <Link
                            key={action.to}
                            href={links[action.to]!}
                            className="inline-flex min-h-9 items-center gap-2 rounded-full border bg-card px-3 text-xs font-medium hover:bg-muted"
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
                    )}
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
                          <MilestoneRow
                            key={item.id}
                            item={item}
                            href={sharedAction ? null : href}
                            disabled={!brandId || save.isPending}
                            onRecord={(entry) => {
                              if (brandId)
                                save.mutate({
                                  brandId,
                                  patch: [
                                    { item: item.id as LaunchItem, ...entry },
                                  ],
                                });
                            }}
                          />
                        );
                      })}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * One milestone: a checkbox, the label and who recorded it, a date field for
 * milestones that happen outside the app, a skip for ones that do not apply
 * to this client, and the link that resolves it.
 */
function MilestoneRow({
  item,
  href,
  disabled,
  onRecord,
}: {
  item: Checklist["groups"][number]["items"][number];
  href: string | null;
  disabled: boolean;
  onRecord: (entry: {
    checked: boolean;
    skipped?: boolean;
    at?: string;
  }) => void;
}) {
  const [date, setDate] = useState(today);
  const settled = item.done || item.skipped;
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 py-3">
      {item.observed ? (
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 flex size-4 items-center justify-center rounded-[4px] border",
            item.done
              ? "border-foreground bg-foreground text-background"
              : "border-dashed border-border",
          )}
        >
          {item.done ? <Check className="size-3" /> : null}
        </span>
      ) : (
        <Checkbox
          aria-label={item.label}
          checked={item.done ? true : item.skipped ? "indeterminate" : false}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onRecord(
              checked === true && item.dated
                ? { checked: true, at: date }
                : { checked: checked === true },
            )
          }
          className="mt-0.5"
        />
      )}
      <span className="min-w-0 flex-1 basis-40">
        <span className="sr-only">
          {item.done
            ? "Complete: "
            : item.skipped
              ? "Skipped: "
              : "Incomplete: "}
        </span>
        <span
          className={cn(
            "block text-sm font-medium",
            item.skipped && "text-muted-foreground line-through",
          )}
        >
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
      {!settled ? (
        <span className="flex items-center gap-3">
          {item.dated ? (
            <DatePicker
              aria-label={`${item.label} date`}
              value={fromDateInputValue(date)}
              onChange={(picked) =>
                setDate(picked ? toDateInputValue(picked) : today())
              }
              disabled={disabled}
              clearable={false}
              align="end"
              className="h-8"
            />
          ) : null}
          {href ? (
            <Link
              href={href}
              className="inline-flex min-h-8 items-center text-xs font-medium underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              {item.action!.label}
            </Link>
          ) : null}
          {item.observed ? null : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRecord({ checked: false, skipped: true })}
              className="inline-flex min-h-8 items-center text-xs text-muted-foreground hover:text-foreground"
            >
              Skip
            </button>
          )}
        </span>
      ) : item.skipped ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onRecord({ checked: false, skipped: false })}
          className="inline-flex min-h-8 items-center text-xs text-muted-foreground hover:text-foreground"
        >
          Reopen
        </button>
      ) : null}
    </li>
  );
}
