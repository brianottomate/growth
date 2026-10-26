"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "./lib/utils";

// Modal by default: a non-modal popover portals outside an open dialog or
// sheet, whose scroll lock then swallows wheel and touch scrolling inside it.
function Popover({
  modal = true,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" modal={modal} {...props} />;
}

const popoverTriggerStyleVariants = cva("", {
  variants: {
    appearance: {
      avatar:
        "rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
    },
  },
});

function PopoverTrigger({
  className: customClassName,
  appearance,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger> &
  VariantProps<typeof popoverTriggerStyleVariants>) {
  const className = cn(
    popoverTriggerStyleVariants({ appearance }),
    customClassName,
  );

  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      className={className}
      {...props}
    />
  );
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
