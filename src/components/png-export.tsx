"use client";

import { useState } from "react";
import { ImageDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";

/** Marks chrome (buttons, menus) that never belongs in an export. */
export const EXPORT_HIDE = "data-export-hide";

function download(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
}

/** Data URLs of images already fetched, so a second export starts instantly. */
const inlined = new Map<string, Promise<string>>();

/** The mocks draw images at phone size; anything larger only bloats the capture. */
const MAX_EDGE = 1200;

/**
 * One image as a small data URL: fetched once through this link's media
 * route, downscaled, JPEG unless it is a PNG (logos keep their transparency).
 * Embedding dozens of full-size originals stalls the capture outright.
 */
function inline(mediaBase: string, src: string) {
  let data = inlined.get(src);
  if (!data) {
    data = (async () => {
      const response = await fetch(
        new URL(src, location.href).origin === location.origin
          ? src
          : `${mediaBase}/media?u=${encodeURIComponent(src)}`,
      );
      if (!response.ok) throw new Error(`Image ${response.status}`);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(
        1,
        MAX_EDGE / Math.max(bitmap.width, bitmap.height),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas
        .getContext("2d")!
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      return blob.type === "image/png"
        ? canvas.toDataURL("image/png")
        : canvas.toDataURL("image/jpeg", 0.88);
    })();
    data.catch(() => inlined.delete(src));
    inlined.set(src, data);
  }
  return data;
}

/**
 * Swap every cross-origin image under `root` for an inline copy fetched once
 * through this link's media route (R2 sends no CORS headers, so the capture
 * could not read them), and return a function that puts them back.
 */
async function inlineImages(root: HTMLElement, mediaBase: string) {
  const images = [...root.querySelectorAll("img")].filter((img) => {
    const src = img.currentSrc || img.src;
    return src.startsWith("http://") || src.startsWith("https://");
  });
  const originals = images.map((img) => ({
    img,
    src: img.getAttribute("src"),
    srcset: img.getAttribute("srcset"),
  }));
  const sources = [...new Set(images.map((img) => img.currentSrc || img.src))];
  const data = new Map<string, string>();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, sources.length) }, async () => {
      while (next < sources.length) {
        const src = sources[next++]!;
        data.set(src, await inline(mediaBase, src));
      }
    }),
  );
  for (const img of images) {
    const copy = data.get(img.currentSrc || img.src);
    if (!copy) continue;
    img.removeAttribute("srcset");
    img.src = copy;
  }
  // Wait for load, not `decode()`: decode never settles while the page is
  // not being painted (a background tab), and data URLs load at once anyway.
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve();
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
          setTimeout(resolve, 3000);
        }),
    ),
  );
  return () => {
    for (const { img, src, srcset } of originals) {
      if (srcset) img.setAttribute("srcset", srcset);
      if (src) img.setAttribute("src", src);
    }
  };
}

/**
 * PNG exports of a public link page, drawn in the browser: the whole page as
 * one tall image (a big screenshot), or one image per `[data-export-ad]`
 * section, zipped. With `sheetHref`, also the link's composed sheet, a fixed
 * layout rendered on the server. `mediaBase` is the link's path; its `/media`
 * route serves the page's images same-origin.
 */
export function PngExport({
  mediaBase,
  filename,
  sectionsLabel,
  sheetHref,
}: {
  mediaBase: string;
  filename: string;
  sectionsLabel?: string;
  sheetHref?: string;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (mode: "page" | "ads") => {
    const root = document.querySelector<HTMLElement>("[data-export-root]");
    if (!root || busy) return;
    setBusy(true);
    let restore: (() => void) | null = null;
    try {
      restore = await inlineImages(root, mediaBase);
      const { toPng } = await import("html-to-image");
      const options = {
        backgroundColor: "#ffffff",
        cacheBust: false,
        filter: (node: HTMLElement) =>
          !(node instanceof HTMLElement && node.hasAttribute(EXPORT_HIDE)),
      };
      if (mode === "page") {
        // Browsers cap a canvas side at 16,384px, so a long page trades
        // sharpness for fitting whole rather than being cut off.
        const pixelRatio = Math.min(1.5, 16_000 / root.scrollHeight);
        download(
          await toPng(root, { ...options, pixelRatio }),
          `${filename}.png`,
        );
      } else {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        const sections = [
          ...root.querySelectorAll<HTMLElement>("[data-export-ad]"),
        ];
        for (const [index, section] of sections.entries()) {
          const png = await toPng(section, {
            ...options,
            pixelRatio: Math.min(2, 16_000 / section.scrollHeight),
          });
          zip.file(
            `${filename}-${section.getAttribute("data-export-name") ?? `ad-${String(index + 1).padStart(2, "0")}`}.png`,
            png.split(",")[1]!,
            { base64: true },
          );
        }
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        download(url, `${filename}.zip`);
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch (error) {
      console.error("png export failed", error);
      toast.error("Could not export the PNG. Try again.");
    } finally {
      restore?.();
      setBusy(false);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy}>
          <ImageDown className="size-3.5" />
          {busy ? "Exporting…" : "Download PNG"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void run("page")}>
          Full page (one image)
        </DropdownMenuItem>
        {sectionsLabel && (
          <DropdownMenuItem onSelect={() => void run("ads")}>
            {sectionsLabel}
          </DropdownMenuItem>
        )}
        {sheetHref && (
          <DropdownMenuItem asChild>
            <a href={sheetHref}>Composed sheet (server)</a>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
