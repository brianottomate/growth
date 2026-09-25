"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";

import { cn } from "./lib/utils";

import { useMediaQuery } from "./hooks/use-media-query";
import {
  Drawer,
  DrawerClose as DrawerClosePrimitive,
  DrawerContent as DrawerContentPrimitive,
  DrawerDescription as DrawerDescriptionPrimitive,
  DrawerFooter as DrawerFooterPrimitive,
  DrawerHeader as DrawerHeaderPrimitive,
  DrawerOverlay as DrawerOverlayPrimitive,
  DrawerPortal as DrawerPortalPrimitive,
  DrawerTitle as DrawerTitlePrimitive,
  DrawerTrigger as DrawerTriggerPrimitive,
} from "./drawer";
import { ScrollArea } from "./scroll-area";

// Original Dialog Components (Desktop)
function DialogRoot({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTriggerPrimitive({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortalPrimitive({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClosePrimitive({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlayPrimitive({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

function DialogContentPrimitive({
  className,
  children,
  showCloseButton = true,
  size = "default",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  size?: "default" | "sm" | "lg" | "xl" | "2xl" | "full";
}) {
  return (
    <DialogPortalPrimitive data-slot="dialog-portal">
      <DialogOverlayPrimitive />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          {
            "sm:max-w-lg": size === "default",
            "sm:max-w-sm": size === "sm",
            "sm:max-w-2xl": size === "lg",
            "sm:max-w-4xl": size === "xl",
            "sm:max-w-6xl": size === "2xl",
            "sm:max-w-[calc(100vw-2rem)]": size === "full",
          },
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-3 right-3 rounded-full bg-muted p-2 opacity-80 ring-offset-background transition-all hover:scale-105 hover:bg-muted/80 hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortalPrimitive>
  );
}

function DialogHeaderPrimitive({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooterPrimitive({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-row justify-end gap-3 px-1 py-4", className)}
      {...props}
    />
  );
}

function DialogTitlePrimitive({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescriptionPrimitive({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

// Responsive Dialog Components (Public API)
function Dialog({
  repositionInputs = false, // Default to false for better mobile keyboard handling (ironically)
  ...props
}: React.ComponentProps<typeof DialogRoot> & {
  repositionInputs?: boolean;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return <DialogRoot {...props} />;
  }

  return <Drawer repositionInputs={repositionInputs} {...props} />;
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogTriggerPrimitive>) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return <DialogTriggerPrimitive {...props} />;
  }

  return <DrawerTriggerPrimitive {...props} />;
}

const dialogContentStyleVariants = cva("", {
  variants: { tone: { media: "border-white/10 bg-black/95 text-white" } },
});

function DialogContent({
  className: customClassName,
  tone,
  children,
  scrollable = false,
  size = "default",
  ...props
}: React.ComponentProps<typeof DialogContentPrimitive> & {
  scrollable?: boolean;
  size?: "default" | "sm" | "lg" | "xl" | "2xl" | "full";
} & VariantProps<typeof dialogContentStyleVariants>) {
  // A container, so page components opened in a dialog lay out by its width.
  const className = cn(
    "@container",
    dialogContentStyleVariants({ tone }),
    customClassName,
  );

  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return (
      <DialogContentPrimitive
        className={cn(className, scrollable && "max-h-[90dvh] overflow-y-auto")}
        size={size}
        {...props}
      >
        {children}
      </DialogContentPrimitive>
    );
  }

  // Filter out showCloseButton for drawer (not supported)
  const { showCloseButton: _showCloseButton, ...drawerProps } = props;

  return (
    <DrawerContentPrimitive
      className={cn("px-4", className)}
      scrollable={scrollable}
      {...drawerProps}
    >
      {children}
    </DrawerContentPrimitive>
  );
}

const dialogHeaderStyleVariants = cva("", {
  variants: {
    divider: { default: "border-b", media: "border-b border-white/10" },
  },
});

function DialogHeader({
  className: customClassName,
  divider,
  ...props
}: React.ComponentProps<typeof DialogHeaderPrimitive> &
  VariantProps<typeof dialogHeaderStyleVariants>) {
  const className = cn(dialogHeaderStyleVariants({ divider }), customClassName);

  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return <DialogHeaderPrimitive className={className} {...props} />;
  }

  return <DrawerHeaderPrimitive className={className} {...props} />;
}

function DialogFooter({
  className,
  ...props
}: React.ComponentProps<typeof DialogFooterPrimitive>) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return <DialogFooterPrimitive className={className} {...props} />;
  }

  return <DrawerFooterPrimitive className={className} {...props} />;
}

const dialogTitleStyleVariants = cva("", {
  variants: { tone: { media: "text-white" } },
});

function DialogTitle({
  className: customClassName,
  tone,
  ...props
}: React.ComponentProps<typeof DialogTitlePrimitive> &
  VariantProps<typeof dialogTitleStyleVariants>) {
  const className = cn(dialogTitleStyleVariants({ tone }), customClassName);

  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    // Desktop: Keep original alignment (usually text-left)
    return <DialogTitlePrimitive className={className} {...props} />;
  }

  // Mobile: Use flex centering for perfect alignment
  return (
    <DrawerTitlePrimitive
      className={cn("flex items-center justify-center", className)}
      {...props}
    />
  );
}

const dialogDescriptionStyleVariants = cva("", {
  variants: { tone: { media: "text-white/55" } },
});

function DialogDescription({
  className: customClassName,
  tone,
  ...props
}: React.ComponentProps<typeof DialogDescriptionPrimitive> &
  VariantProps<typeof dialogDescriptionStyleVariants>) {
  const className = cn(
    dialogDescriptionStyleVariants({ tone }),
    customClassName,
  );

  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return <DialogDescriptionPrimitive className={className} {...props} />;
  }

  return <DrawerDescriptionPrimitive className={className} {...props} />;
}

function DialogClose({
  className,
  ...props
}: React.ComponentProps<typeof DialogClosePrimitive>) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return <DialogClosePrimitive className={className} {...props} />;
  }

  return <DrawerClosePrimitive className={className} {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogOverlayPrimitive>) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return <DialogOverlayPrimitive className={className} {...props} />;
  }

  return <DrawerOverlayPrimitive className={className} {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPortalPrimitive>) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return <DialogPortalPrimitive {...props} />;
  }

  return <DrawerPortalPrimitive {...props} />;
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};

// SimpleDialog - A less verbose way to create dialogs
type SimpleDialogProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  trigger?: React.ReactNode;
  footer?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  showCloseButton?: boolean;
  scrollable?: boolean;
  repositionInputs?: boolean;
  drawerHeight?: string;
  size?: "default" | "sm" | "lg" | "xl" | "2xl" | "full";
};

export function SimpleDialog({
  title,
  description,
  children,
  trigger,
  footer,
  open,
  onOpenChange,
  className,
  showCloseButton = true,
  scrollable = false,
  repositionInputs = false, // Default to false for better mobile keyboard handling
  size = "default",
}: SimpleDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      repositionInputs={repositionInputs}
    >
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        className={className}
        showCloseButton={showCloseButton}
        scrollable={scrollable && !footer} // Disable DialogContent's scrollable if we have footer (we'll handle it manually)
        size={size}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {/* Handle scrollable content with footer - use special layout on both desktop and mobile */}
        {scrollable && footer ? (
          <div className="flex max-h-[90dvh] min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-1 py-4">{children}</div>
            <DialogFooter className="border-t py-3">
              <div className="w-full">{footer}</div>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="px-1 py-4">{children}</div>
            {footer && (
              <DialogFooter className="border-t py-3">
                <div className="w-full">{footer}</div>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ScrollableDialogContent - A wrapper that ensures proper scrolling in complex dialogs
type ScrollableDialogContentProps = React.ComponentProps<
  typeof DialogContent
> & {
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function ScrollableDialogContent({
  children,
  footer,
  className,
  ...props
}: ScrollableDialogContentProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <DialogContent
      className={cn(
        className,
        // Apply overflow styles only on desktop
        isDesktop && "max-h-[90dvh] overflow-y-auto",
      )}
      scrollable={true}
      {...props}
    >
      {isDesktop ? (
        // Desktop: Direct content (original working approach)
        children
      ) : (
        // Mobile: ScrollArea wrapped (for drawer compatibility)
        <ScrollArea className="max-h-[85dvh]">{children}</ScrollArea>
      )}
      {footer && <DialogFooter>{footer}</DialogFooter>}
    </DialogContent>
  );
}
