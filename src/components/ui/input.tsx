import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "./lib/utils";

const inputStyleVariants = cva("", {
  variants: {
    textSize: { xs: "text-xs md:text-xs", sm: "text-sm md:text-sm" },
    monospace: { true: "font-mono" },
    leading: { handle: "pl-6", icon: "pl-8", search: "pl-9" },
    tone: {
      error: "border-destructive focus-visible:ring-destructive",
      success: "border-green-600 focus-visible:ring-green-600",
    },
    appearance: {
      swatch: "p-0.5",
      inline:
        "border-transparent px-1 shadow-none hover:bg-muted/50 focus-visible:border-input dark:bg-transparent",
    },
  },
});

function Input({
  className: customClassName,
  textSize,
  monospace,
  leading,
  tone,
  appearance,
  type,
  ...props
}: React.ComponentProps<"input"> & VariantProps<typeof inputStyleVariants>) {
  const className = cn(
    inputStyleVariants({ textSize, monospace, leading, tone, appearance }),
    customClassName,
  );

  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
