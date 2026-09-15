"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "./lib/utils";

const labelStyleVariants = cva("", {
  variants: {
    textSize: { xs: "text-xs" },
    tone: { muted: "text-muted-foreground" },
  },
});

function Label({
  className: customClassName,
  textSize,
  tone,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> &
  VariantProps<typeof labelStyleVariants>) {
  const className = cn(labelStyleVariants({ textSize, tone }), customClassName);

  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
