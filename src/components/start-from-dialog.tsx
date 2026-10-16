"use client";

import type { ReactNode } from "react";
import { LayoutTemplate, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export type StartFromOption<Id extends string = string> = {
  id: Id;
  label: string;
  /** Option groups in the select. */
  category: string;
  /** Optional top-level toggle; options without one always show. */
  group?: string;
  summary?: ReactNode;
  /** Shown instead of allowing submit when the option cannot run here. */
  unavailable?: string;
};

/**
 * "From template": pick one typed starting point, fill in what it needs, and
 * make the thing in one click. Callers own their catalog and inputs; this owns
 * the shape every card shares.
 */
export function StartFromDialog<Id extends string>({
  open,
  onOpenChange,
  trigger,
  title,
  intro,
  options,
  groups,
  group,
  onGroupChange,
  value,
  onValueChange,
  selectLabel = "Start from",
  children,
  submitLabel,
  busyLabel,
  busy,
  canSubmit = true,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: { label: string; primary?: boolean; icon?: ReactNode };
  title: string;
  intro?: ReactNode;
  options: StartFromOption<Id>[];
  groups?: string[];
  group?: string;
  onGroupChange?: (group: string) => void;
  value: Id;
  onValueChange: (id: Id) => void;
  selectLabel?: string;
  /** Inputs for the chosen option. */
  children?: ReactNode;
  submitLabel: string;
  busyLabel: string;
  busy: boolean;
  canSubmit?: boolean;
  onSubmit: () => void;
}) {
  const visible = options.filter(
    (option) => !groups || !option.group || option.group === group,
  );
  const chosen = options.find((option) => option.id === value);
  return (
    <>
      {trigger && (
        <Button
          variant={trigger.primary ? "default" : "outline"}
          size="sm"
          onClick={() => onOpenChange(true)}
        >
          {trigger.icon ?? <LayoutTemplate className="size-4" />}{" "}
          {trigger.label}
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) onOpenChange(next);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {intro && <div className="space-y-2">{intro}</div>}
          <div className="space-y-3">
            {groups && (
              <div className="flex gap-2" aria-label="Template groups">
                {groups.map((item) => (
                  <Button
                    key={item}
                    variant={group === item ? "secondary" : "outline"}
                    size="sm"
                    disabled={busy}
                    aria-pressed={group === item}
                    onClick={() => onGroupChange?.(item)}
                  >
                    {item}
                  </Button>
                ))}
              </div>
            )}
            <Label htmlFor="start-from-option">{selectLabel}</Label>
            <select
              id="start-from-option"
              value={value}
              disabled={busy}
              className="w-full rounded-md border bg-background p-2 text-sm"
              onChange={(event) => onValueChange(event.target.value as Id)}
            >
              {[...new Set(visible.map((option) => option.category))].map(
                (category) => (
                  <optgroup key={category} label={category}>
                    {visible
                      .filter((option) => option.category === category)
                      .map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                  </optgroup>
                ),
              )}
            </select>
            {chosen?.summary && (
              <div className="text-sm text-muted-foreground">
                {chosen.summary}
              </div>
            )}
            {chosen?.unavailable ? (
              <p className="text-sm text-muted-foreground">
                {chosen.unavailable}
              </p>
            ) : (
              children
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={busy || !canSubmit || Boolean(chosen?.unavailable)}
              onClick={onSubmit}
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> {busyLabel}
                </>
              ) : (
                submitLabel
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
