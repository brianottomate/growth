"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type CompositionOption<Id extends string> = {
  id: Id;
  label: string;
  previewUrl?: string | null;
  details?: ReactNode;
};

/** Visual choices only; callers own preview data and persistence. */
export function CompositionPicker<Id extends string>({
  options,
  value,
  onChange,
  disabled = false,
  pendingId = null,
  selectedLabel = "selected",
  aspectRatio = "1 / 1",
}: {
  options: CompositionOption<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  disabled?: boolean;
  pendingId?: Id | null;
  selectedLabel?: string;
  aspectRatio?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Compositions"
      className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-4"
    >
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <div
            key={option.id}
            className={cn(
              "space-y-2 rounded-lg border p-2 text-sm",
              selected && "ring-2 ring-foreground",
            )}
          >
            <button
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(option.id)}
              className="block w-full space-y-2 text-left"
            >
              {option.previewUrl && (
                <CompositionPreview
                  key={option.previewUrl}
                  src={option.previewUrl}
                  label={option.label}
                  aspectRatio={aspectRatio}
                />
              )}
              <span className="block font-medium">
                {option.label}
                {selected
                  ? ` · ${selectedLabel}`
                  : pendingId === option.id
                    ? " · saving…"
                    : ""}
              </span>
            </button>
            {option.details}
          </div>
        );
      })}
    </div>
  );
}

/** Opens the same visual picker for a local, unsaved composition choice. */
export function CompositionSelector<Id extends string>({
  options,
  value,
  onChange,
  aspectRatio,
  disabled,
}: {
  options: CompositionOption<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  aspectRatio?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        aria-label="Choose composition"
        onClick={() => setOpen(true)}
        className="w-full justify-between"
      >
        {options.find((option) => option.id === value)?.label ?? value}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Choose composition</DialogTitle>
            <DialogDescription>
              Preview the layout with your current image and text.
            </DialogDescription>
          </DialogHeader>
          <div className="@container">
            <CompositionPicker
              options={options}
              value={value}
              aspectRatio={aspectRatio}
              onChange={(id) => {
                onChange(id);
                setOpen(false);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CompositionPreview({
  src,
  label,
  aspectRatio,
}: {
  src: string;
  label: string;
  aspectRatio: string;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div
      className="flex items-center justify-center rounded-md bg-muted p-3 text-center text-xs text-muted-foreground"
      style={{ aspectRatio }}
    >
      Preview unavailable
    </div>
  ) : (
    <Image
      src={src}
      alt={label}
      width={320}
      height={320}
      unoptimized
      loading="lazy"
      className="w-full rounded-md bg-muted object-contain"
      style={{ aspectRatio }}
      onError={() => setFailed(true)}
    />
  );
}
