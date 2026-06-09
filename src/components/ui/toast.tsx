"use client";

import type { ToasterProps } from "sonner";
import { Toaster as Sonner, toast } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  // Feed Sonner the wandercom design-system tokens directly. These are real,
  // theme-aware custom properties emitted by the tokens package (so the toast
  // follows the active data-theme), unlike the shadcn `--popover`/`--border`
  // aliases, which live in an `@theme inline` block and don't resolve at runtime.
  return (
    <Sonner
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--color-surface-modal)",
          "--normal-text": "var(--color-primary)",
          "--normal-border": "var(--color-border-primary)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster, toast };
