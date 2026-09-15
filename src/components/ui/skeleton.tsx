import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./index";

const skeletonStyleVariants = cva("", {
  variants: { shape: { round: "rounded-full", soft: "rounded-lg" } },
});

function Skeleton({
  className: customClassName,
  shape,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof skeletonStyleVariants>) {
  const className = cn(skeletonStyleVariants({ shape }), customClassName);

  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-accent", className)}
      {...props}
    />
  );
}

export { Skeleton };
