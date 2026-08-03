import { MenuIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { manifest } from "../data/manifest";
import { resolveTemplateBlock, templates } from "../data/templates";
import { BlockPropsPanel } from "./BlockPropsPanel";
import { BlockRenderer, TemplateBlockRenderer } from "./BlockRenderer";
import type { PreviewViewportMode } from "./PreviewViewport";
import { PreviewViewport } from "./PreviewViewport";
import type { SidebarTab } from "./Sidebar";
import { Sidebar } from "./Sidebar";

export type Selection =
  | { kind: "none" }
  | { kind: "block"; id: string }
  | { kind: "template"; id: string };

function parsePath(pathname: string): Selection {
  const m = pathname.match(/^\/(blocks|templates)\/([^/]+)\/?$/);
  if (!m) return { kind: "none" };
  const [, kind, id] = m;
  return kind === "blocks" ? { kind: "block", id } : { kind: "template", id };
}

function selectionToPath(s: Selection): string {
  if (s.kind === "block") return `/blocks/${s.id}`;
  if (s.kind === "template") return `/templates/${s.id}`;
  return "/";
}

function readSelection(): Selection {
  if (typeof window === "undefined") return { kind: "none" };
  return parsePath(window.location.pathname);
}

function WelcomeScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="border-surface-tertiary bg-surface-secondary flex size-14 items-center justify-center rounded-2xl border text-2xl">
        🧱
      </div>
      <div>
        <h1 className="text-primary text-lg font-semibold">Blocks Preview</h1>
        <p className="text-tertiary mt-1 text-sm">Select a block from the sidebar to preview it.</p>
      </div>
    </div>
  );
}

function ContentHeader({ selection }: { selection: Selection }) {
  if (selection.kind === "template") {
    const template = templates.find((t) => t.id === selection.id);
    if (!template) return null;
    return (
      <div className="border-surface-tertiary bg-surface-primary hidden h-[52px] shrink-0 items-center border-b px-6 lg:flex">
        <span className="text-primary text-sm font-medium">{template.title}</span>
      </div>
    );
  }

  if (selection.kind === "block") {
    const block = manifest.find((b) => b.id === selection.id);
    if (!block) return null;
    return (
      // Desktop only — on mobile the top bar handles the title
      <div className="border-surface-tertiary bg-surface-primary hidden h-[52px] shrink-0 items-center border-b px-6 lg:flex">
        <div className="flex items-baseline gap-2">
          <span className="text-primary text-sm font-medium">{block.title}</span>
          {block.sectionVariant && (
            <span className="text-tertiary text-xs">variant: {block.sectionVariant}</span>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export function PreviewApp() {
  const [selection, setSelection] = useState<Selection>(readSelection);
  const [tab, setTab] = useState<SidebarTab>(() => {
    const initial = readSelection();
    return initial.kind === "template" ? "templates" : "sections";
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [previewViewport, setPreviewViewport] = useState<PreviewViewportMode>("desktop");

  // Sync with browser back/forward navigation
  useEffect(() => {
    const onPopState = () => {
      const next = parsePath(window.location.pathname);
      setSelection(next);
      if (next.kind === "template") setTab("templates");
      else if (next.kind === "block") setTab("sections");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleSelect = (kind: "block" | "template", id: string) => {
    const next: Selection = { kind, id };
    const path = selectionToPath(next);
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
    setSelection(next);
    setTab(kind === "template" ? "templates" : "sections");
  };

  const selectedTemplate =
    selection.kind === "template" ? (templates.find((t) => t.id === selection.id) ?? null) : null;
  const selectedBlock =
    selection.kind === "block" ? (manifest.find((b) => b.id === selection.id) ?? null) : null;

  return (
    <div className="bg-surface-primary flex h-screen overflow-hidden">
      <Sidebar
        selection={selection}
        onSelect={handleSelect}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        tab={tab}
        onTabChange={setTab}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar — hidden on desktop */}
        <div className="border-surface-tertiary bg-surface-primary flex h-[52px] shrink-0 items-center gap-2 border-b px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-secondary hover:bg-surface-secondary hover:text-primary flex size-8 items-center justify-center rounded-md transition-colors"
            aria-label="Open navigation"
          >
            <MenuIcon className="size-4" />
          </button>
          <span className="text-primary text-sm font-medium">
            {selectedTemplate
              ? selectedTemplate.title
              : selectedBlock
                ? selectedBlock.title
                : "Blocks Preview"}
          </span>
          {!selectedTemplate && selectedBlock?.sectionVariant && (
            <span className="text-tertiary text-xs">{selectedBlock.sectionVariant}</span>
          )}
        </div>

        {selection.kind !== "none" ? (
          <>
            <ContentHeader selection={selection} />
            {selectedBlock && <BlockPropsPanel id={selectedBlock.id} />}
            {selectedTemplate || selectedBlock ? (
              <PreviewViewport mode={previewViewport} onModeChange={setPreviewViewport}>
                {selectedTemplate ? (
                  <div
                    className="relative flex min-h-full transform-gpu flex-col"
                    data-theme={selectedTemplate.theme}
                  >
                    {selectedTemplate.blocks.map((block, idx) => {
                      const { id, theme, mockVariant } = resolveTemplateBlock(block);
                      return (
                        <TemplateBlockRenderer
                          key={`${selectedTemplate.id}:${id}:${idx}`}
                          id={id}
                          theme={theme}
                          mockVariant={mockVariant}
                          layout={selectedTemplate.layout}
                          kind={selectedTemplate.kind}
                        />
                      );
                    })}
                  </div>
                ) : selectedBlock ? (
                  <BlockRenderer id={selectedBlock.id} />
                ) : (
                  <WelcomeScreen />
                )}
              </PreviewViewport>
            ) : (
              <WelcomeScreen />
            )}
          </>
        ) : (
          <WelcomeScreen />
        )}
      </div>
    </div>
  );
}
