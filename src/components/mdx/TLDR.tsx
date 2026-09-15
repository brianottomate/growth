import type React from "react";

interface TLDRProps {
  children: React.ReactNode;
}

export function TLDR({ children }: TLDRProps) {
  return (
    <div className="mb-8 max-w-3xl rounded-lg border border-secondary bg-surface-secondary shadow-md">
      <div className="flex p-6">
        <div className="prose max-w-none text-primary lg:prose-lg dark:prose-invert [&_h3]:mb-4 [&_h3]:text-xl [&_h3]:font-bold [&_li]:text-secondary [&_strong]:font-semibold [&_ul]:my-4 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
          {children}
        </div>
      </div>
    </div>
  );
}
