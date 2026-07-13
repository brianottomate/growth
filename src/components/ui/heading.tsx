import type * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "./lib/utils";

type HeadingVariant =
  | "display-lg"
  | "display"
  | "display-sm"
  | "headline-lg"
  | "headline"
  | "headline-sm";

type ResponsiveVariant =
  | HeadingVariant
  | Partial<Record<"base" | "sm" | "md" | "lg" | "xl" | "2xl", HeadingVariant>>;

const classes: Record<HeadingVariant, string> = {
  "display-lg": "text-5xl leading-tight tracking-tight font-medium",
  display: "text-4xl leading-tight tracking-tight font-medium",
  "display-sm": "text-3xl leading-tight tracking-tight font-medium",
  "headline-lg": "text-3xl leading-9 tracking-tight font-medium",
  headline: "text-2xl leading-8 tracking-tight font-medium",
  "headline-sm": "text-base leading-5 font-medium",
};

function responsiveClasses(variant: ResponsiveVariant | undefined) {
  if (!variant) return classes.headline;
  if (typeof variant === "string") return classes[variant];

  return Object.entries(variant)
    .map(([breakpoint, value]) => {
      if (!value) return "";
      return breakpoint === "base" ? classes[value] : `${breakpoint}:${classes[value]}`;
    })
    .join(" ");
}

type HeadingElement = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

export function Heading({
  className,
  variant,
  color = "primary",
  as: Tag = "h2",
  asChild = false,
  ...props
}: Omit<React.ComponentProps<"h1">, "color"> & {
  variant?: ResponsiveVariant;
  color?: "primary" | "secondary" | "tertiary";
  as?: HeadingElement;
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : Tag;
  return (
    <Comp
      className={cn(
        "font-sans",
        responsiveClasses(variant),
        color === "secondary" && "text-secondary",
        color === "tertiary" && "text-tertiary",
        color === "primary" && "text-primary",
        className,
      )}
      {...props}
    />
  );
}
