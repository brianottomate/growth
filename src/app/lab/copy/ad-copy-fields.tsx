"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export type AdCopyValues = {
  primaryText: string;
  headline: string;
  description: string;
};

export function AdCopyFields({
  value,
  onChange,
  compact = false,
}: {
  compact?: boolean;
  value?: AdCopyValues;
  onChange?: (value: AdCopyValues) => void;
}) {
  const id = useId();
  const editor = (
    <div className="space-y-3">
      {(
        [
          ["primaryText", "Primary text", 3],
          ["headline", "Headline", 2],
          ["description", "Description", 2],
        ] as const
      ).map(([field, label, rows]) => (
        <div key={field} className="space-y-1">
          <label htmlFor={`${id}-${field}`} className="text-xs font-medium">
            {label}
          </label>
          <Textarea
            id={`${id}-${field}`}
            rows={rows}
            className="min-h-0 text-sm"
            value={value?.[field] ?? ""}
            readOnly={!onChange}
            placeholder={
              value ? "No copy for this field" : "Generate to preview"
            }
            onChange={(event) => {
              if (value) onChange?.({ ...value, [field]: event.target.value });
            }}
          />
        </div>
      ))}
    </div>
  );
  return (
    <div className="space-y-3">
      <dl className="space-y-3 text-sm">
        {(
          [
            ["primaryText", "Primary text"],
            ["headline", "Headline"],
            ["description", "Description"],
          ] as const
        ).map(([field, label]) => (
          <div key={field}>
            <dt className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              {label}
            </dt>
            <dd
              className={`mt-1 break-words whitespace-pre-wrap ${compact && field === "primaryText" ? "max-h-40 overflow-auto pr-2" : ""}`}
            >
              {value?.[field] || (
                <span className="text-muted-foreground">
                  {value ? "—" : "Awaiting generation"}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {onChange && (
        <Dialog>
          <DialogTrigger asChild>
            <Button size="xs" variant="outline">
              Edit copy
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit preview copy</DialogTitle>
              <DialogDescription>
                Changes update the local preview. The generated snapshot stays
                intact.
              </DialogDescription>
            </DialogHeader>
            {editor}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
