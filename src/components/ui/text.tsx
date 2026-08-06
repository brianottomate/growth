import type * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "./lib/utils";

type TextVariant =
  | "body-lg-long"
  | "body-lg"
  | "body-long"
  | "body"
  | "body-sm";
type ResponsiveVariant =
  | TextVariant
  | Partial<Record<"base" | "sm" | "md" | "lg" | "xl" | "2xl", TextVariant>>;

const classes: Record<TextVariant, string> = {
  "body-lg-long": "text-base leading-6",
  "body-lg": "text-base leading-5",
  "body-long": "text-sm leading-5",
  body: "text-sm leading-[1.0625rem]",
  "body-sm": "text-xs leading-[0.9375rem]",
};

function responsiveClasses(variant: ResponsiveVariant | undefined) {
  if (!variant) return classes.body;
  if (typeof variant === "string") return classes[variant];

  return Object.entries(variant)
    .map(([breakpoint, value]) => {
      if (!value) return "";
      return breakpoint === "base"
        ? classes[value]
        : `${breakpoint}:${classes[value]}`;
    })
    .join(" ");
}

type TextElement =
  | "p"
  | "span"
  | "div"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6";

export function Text({
  className,
  variant,
  weight = "normal",
  color = "primary",
  as: Tag = "p",
  asChild = false,
  ...props
}: Omit<React.ComponentProps<"p">, "color"> & {
  variant?: ResponsiveVariant;
  weight?: "normal" | "medium";
  color?: "primary" | "secondary" | "tertiary";
  as?: TextElement;
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : Tag;
  return (
    <Comp
      className={cn(
        "font-sans",
        responsiveClasses(variant),
        weight === "medium" ? "font-medium" : "font-normal",
        color === "secondary" && "text-secondary",
        color === "tertiary" && "text-tertiary",
        color === "primary" && "text-primary",
        className,
      )}
      {...props}
    />
  );
}
