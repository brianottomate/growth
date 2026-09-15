import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "./index";

const textareaStyleVariants = cva("", {
  variants: {
    textSize: { xs: "text-xs md:text-xs", sm: "text-sm md:text-sm" },
    monospace: { true: "font-mono" },
    appearance: {
      composer:
        "border-0 bg-transparent px-1.5 py-1 shadow-none focus-visible:ring-0 dark:bg-transparent",
    },
  },
});

function Textarea({
  className: customClassName,
  textSize,
  monospace,
  appearance,
  ...props
}: React.ComponentProps<"textarea"> &
  VariantProps<typeof textareaStyleVariants>) {
  const className = cn(
    textareaStyleVariants({ textSize, monospace, appearance }),
    customClassName,
  );

  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
