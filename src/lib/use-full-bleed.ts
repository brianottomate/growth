"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Break an element out of a centered (e.g. `max-w-5xl`) layout column to fill
 * the full width of its nearest scrollable ancestor — measured from real DOM
 * positions, so it works whether the sidebar is expanded or collapsed and
 * without touching the layout or other pages.
 *
 * Apply the returned `ref` + `style` to a wrapper div. Falls back to no-op
 * (renders at the column width) if the scroll area isn't wider than the column.
 */
export function useFullBleed() {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;

    const measure = () => {
      let scroller: HTMLElement | null = parent;
      while (scroller) {
        const cs = getComputedStyle(scroller);
        if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY)) break;
        scroller = scroller.parentElement;
      }
      const sc = scroller ?? document.documentElement;
      const pRect = parent.getBoundingClientRect();
      const ml = sc.getBoundingClientRect().left - pRect.left;
      if (ml < 0 && sc.clientWidth > parent.clientWidth) {
        setStyle({ marginLeft: ml, width: sc.clientWidth });
      } else {
        setStyle({});
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return { ref, style };
}
