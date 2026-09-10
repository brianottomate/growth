"use client";

import Link from "next/link";
import { CircleCheck, Circle } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/components/ui/lib/utils";
import type {
  ReadinessChecklist as Checklist,
  ReadinessFix,
} from "@/lib/performance-readiness";

// `_components` reaches the desk service, which is server-only, so the label
// is spelled out here rather than imported.
const sectionLabel =
  "text-muted-foreground text-[10.5px] font-semibold tracking-[0.09em] uppercase";

/**
 * The client's production checklist as one accordion: the count and the bar
 * stay visible, and a single click shows all fourteen items under their phase.
 * Every tick is read from the database, so the list is a statement of where
 * things stand rather than a form; an unticked item links to the page that
 * resolves it.
 */
export function ReadinessChecklist({
  checklist,
  links,
  defaultOpen = false,
}: {
  checklist: Checklist;
  links: Record<ReadinessFix, string | null>;
  /** A single client has room to show the list; a list of them does not. */
  defaultOpen?: boolean;
}) {
  const complete = checklist.done === checklist.total;
  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={defaultOpen ? "checklist" : undefined}
    >
      <AccordionItem value="checklist" className="border-b-0">
        <AccordionTrigger className="py-2.5 hover:no-underline">
          <span className="flex flex-1 items-baseline justify-between gap-3">
            <span className={sectionLabel}>Checklist</span>
            <span
              className={cn(
                "text-[11.5px] tabular-nums",
                complete ? "text-emerald-400" : "text-muted-foreground",
              )}
            >
              {checklist.done} of {checklist.total}
            </span>
          </span>
        </AccordionTrigger>

        <div className="bg-muted/60 h-1 overflow-hidden rounded-full">
          <div
            className={cn(
              "h-full rounded-full transition-[width]",
              complete ? "bg-emerald-400" : "bg-sky-400/80",
            )}
            style={{
              width: `${checklist.total ? (checklist.done / checklist.total) * 100 : 0}%`,
            }}
          />
        </div>

        <AccordionContent className="space-y-3 pt-3 pb-2">
          {checklist.groups.map((group) => (
            <section key={group.id} className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className={sectionLabel}>{group.label}</span>
                <span className="text-muted-foreground/70 text-[10px] tabular-nums">
                  {group.done}/{group.total}
                </span>
              </div>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const href = item.action ? links[item.action.to] : null;
                  return (
                    <li
                      key={item.id}
                      className="flex items-start gap-2 pl-0.5 text-[12.5px] leading-5"
                    >
                      {item.done ? (
                        <CircleCheck className="mt-[3px] size-3.5 shrink-0 text-emerald-400" />
                      ) : (
                        <Circle className="text-muted-foreground/50 mt-[3px] size-3.5 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span
                          className={item.done ? "" : "text-muted-foreground"}
                        >
                          {item.label}
                        </span>
                        {item.detail ? (
                          <span className="text-muted-foreground/80 text-[11.5px]">
                            {" "}
                            · {item.detail}
                          </span>
                        ) : null}
                      </span>
                      {!item.done && href ? (
                        <Link
                          href={href}
                          className="shrink-0 text-[11.5px] text-sky-300 hover:underline"
                        >
                          {item.action!.label}
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
