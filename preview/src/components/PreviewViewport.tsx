import { TabsList, TabsRoot, TabsTrigger } from "@wandercom/design-system-web/ui/tabs";
import type { ReactNode } from "react";

export type PreviewViewportMode = "desktop" | "mobile";

type Props = {
  children: ReactNode;
  mode: PreviewViewportMode;
  onModeChange: (mode: PreviewViewportMode) => void;
};

const isPreviewViewportMode = (value: string): value is PreviewViewportMode =>
  value === "desktop" || value === "mobile";

export function PreviewViewport({ children, mode, onModeChange }: Props) {
  return (
    <div className="bg-surface-secondary flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 lg:p-6">
      <TabsRoot
        value={mode}
        onValueChange={(value) => {
          if (isPreviewViewportMode(value)) onModeChange(value);
        }}
      >
        <TabsList aria-label="Preview viewport">
          <TabsTrigger value="desktop">Desktop</TabsTrigger>
          <TabsTrigger value="mobile">Mobile</TabsTrigger>
        </TabsList>
      </TabsRoot>

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div
          className={
            mode === "mobile"
              ? "flex h-full min-w-[390px] justify-center"
              : "h-full w-full min-w-[65rem]"
          }
        >
          <div
            className={[
              "bg-surface-primary @container h-full overflow-x-hidden overflow-y-auto overscroll-none rounded-xl contain-paint",
              mode === "mobile" ? "w-[390px] shrink-0" : "w-full",
            ].join(" ")}
            data-preview-viewport={mode}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
