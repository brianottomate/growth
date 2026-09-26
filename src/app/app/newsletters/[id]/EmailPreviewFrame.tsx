"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X } from "lucide-react";

import { cn } from "@/components/ui/lib/utils";

/**
 * Widths an email is read at. Phone first: most of the list opens the issue
 * on a phone, so that is the view the preview starts in. Desktop is the 600px
 * card on its page margin.
 */
const DEVICES = {
  phone: { label: "Phone", width: 375 },
  tablet: { label: "Tablet", width: 768 },
  desktop: { label: "Desktop", width: 1024 },
} as const;
type Device = keyof typeof DEVICES;

/** The side panel is narrow, so it offers the two that matter there. */
const PANEL_DEVICES: Device[] = ["phone", "desktop"];

function DeviceSwitch({
  devices,
  value,
  onChange,
  dark,
}: {
  devices: Device[];
  value: Device;
  onChange: (device: Device) => void;
  dark?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex overflow-hidden rounded-md border",
        dark ? "border-white/20" : "border-slate-200",
      )}
    >
      {devices.map((device) => (
        <button
          key={device}
          type="button"
          onClick={() => onChange(device)}
          className={cn(
            "px-2 py-1 text-[11px] font-medium",
            value === device
              ? dark
                ? "bg-white text-slate-900"
                : "bg-slate-800 text-white"
              : dark
                ? "text-white/70 hover:bg-white/10"
                : "bg-white text-slate-600 hover:bg-slate-100",
          )}
        >
          {DEVICES[device].label}
        </button>
      ))}
    </div>
  );
}

/**
 * The email at a real reading width. When the panel is narrower than that
 * width the frame is scaled down to fit rather than squeezed, so what shows
 * is the layout a reader at that width gets, only smaller.
 */
function ScaledFrame({
  html,
  width,
  height,
}: {
  html: string;
  width: number;
  height: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(width);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAvailable(entry.contentRect.width);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const scale = Math.min(1, available / width);
  return (
    <div ref={boxRef} className="w-full" style={{ height: height * scale }}>
      <iframe
        srcDoc={html}
        sandbox=""
        title="Newsletter preview"
        className="mx-auto block bg-white"
        style={{
          width,
          height,
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: "top left",
        }}
      />
    </div>
  );
}

export function EmailPreviewFrame({ html }: { html: string }) {
  const [device, setDevice] = useState<Device>("phone");
  const [fullscreen, setFullscreen] = useState<Device | null>(null);

  useEffect(() => {
    if (!fullscreen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [fullscreen]);

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
        <DeviceSwitch
          devices={PANEL_DEVICES}
          value={device}
          onChange={setDevice}
        />
        <button
          type="button"
          onClick={() => setFullscreen(device)}
          title="Full screen"
          aria-label="Open the preview full screen"
          className="grid size-7 place-items-center rounded-md text-slate-600 hover:bg-slate-200"
        >
          <Maximize2 className="size-3.5" />
        </button>
      </div>
      <div className="bg-slate-100 py-3">
        <ScaledFrame html={html} width={DEVICES[device].width} height={760} />
      </div>

      {/* Portalled to the body: the app's page area is a CSS container, and a
          container is the containing block for fixed children, so rendered in
          place the "full screen" view would fill only the page area. */}
      {fullscreen && typeof document !== "undefined"
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Email preview"
              className="fixed inset-0 z-[100] flex flex-col bg-black/85"
            >
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <DeviceSwitch
                  devices={["phone", "tablet", "desktop"]}
                  value={fullscreen}
                  onChange={setFullscreen}
                  dark
                />
                <button
                  type="button"
                  onClick={() => setFullscreen(null)}
                  aria-label="Close the preview"
                  className="grid size-8 place-items-center rounded-md text-white/80 hover:bg-white/10"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
                <div
                  className="mx-auto h-full"
                  style={{ maxWidth: DEVICES[fullscreen].width }}
                >
                  <ScaledFrame
                    html={html}
                    width={DEVICES[fullscreen].width}
                    height={
                      typeof window === "undefined"
                        ? 900
                        : Math.max(600, window.innerHeight - 80)
                    }
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
