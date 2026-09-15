"use client";
import { cva, type VariantProps } from "class-variance-authority";

import type * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "./index";

const avatarStyleVariants = cva("", {
  variants: {
    frame: {
      light: "border-2 border-white",
      surface: "border-2 bg-background shadow-sm",
    },
  },
});

function Avatar({
  className: customClassName,
  frame,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> &
  VariantProps<typeof avatarStyleVariants>) {
  const className = cn(avatarStyleVariants({ frame }), customClassName);

  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full",
        className,
      )}
      {...props}
    />
  );
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full object-cover", className)}
      {...props}
    />
  );
}

const avatarFallbackStyleVariants = cva("", {
  variants: {
    tone: {
      primary: "bg-primary text-primary-foreground",
      foreground: "text-foreground",
    },
    textSize: { xs: "text-xs", lg: "text-lg" },
    weight: { semibold: "font-semibold" },
  },
});

function AvatarFallback({
  className: customClassName,
  tone,
  textSize,
  weight,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback> &
  VariantProps<typeof avatarFallbackStyleVariants>) {
  const className = cn(
    avatarFallbackStyleVariants({ tone, textSize, weight }),
    customClassName,
  );

  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-muted",
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
