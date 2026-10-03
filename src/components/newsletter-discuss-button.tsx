"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  sendAssistantIntent,
  type ReviewEmailIntent,
} from "@/lib/assistant-events";

async function captureEmail(html: string): Promise<Blob> {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;left:-10000px;top:0;width:680px;height:900px;border:0;pointer-events:none";
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("Email preview timed out")),
        15000,
      );
      frame.onload = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      frame.srcdoc = html;
      document.body.appendChild(frame);
    });
    const doc = frame.contentDocument;
    if (!doc?.body) throw new Error("Email preview unavailable");
    await Promise.race([
      Promise.all(
        Array.from(doc.images).map((image) =>
          image.decode().catch(() => undefined),
        ),
      ),
      new Promise((resolve) => window.setTimeout(resolve, 5000)),
    ]);
    const height = Math.max(
      doc.body.scrollHeight,
      doc.documentElement.scrollHeight,
    );
    if (height > 16000)
      throw new Error("Email is too tall for a complete image");
    frame.style.height = `${height}px`;
    const { toJpeg } = await import("html-to-image");
    const dataUrl = await toJpeg(doc.body, {
      width: 680,
      height,
      pixelRatio: 1,
      quality: 0.9,
      backgroundColor: "#ffffff",
      skipFonts: true,
      imagePlaceholder: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><rect width="100%" height="100%" fill="#eeeeee"/><text x="20" y="100" fill="#666666">Image unavailable in browser preview</text></svg>')}`,
    });
    return await (await fetch(dataUrl)).blob();
  } finally {
    frame.remove();
  }
}

export function NewsletterDiscussButton({
  brandId,
  brandName,
  subject,
  contextText,
  captureHtml,
}: {
  brandId: string;
  brandName: string;
  subject: string;
  contextText: string;
  captureHtml: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const discuss = async () => {
    setBusy(true);
    let screenshot: ReviewEmailIntent["screenshot"];
    let visualNote =
      "No rendered image is available; limit visual claims accordingly.";
    try {
      if (captureHtml) {
        try {
          const blob = await captureEmail(captureHtml);
          const fileName = "newsletter-full-preview.jpg";
          const response = await fetch("/api/upload/chat", {
            method: "POST",
            headers: { "Content-Type": "image/jpeg" },
            body: blob,
          });
          if (!response.ok) throw new Error("Image upload failed");
          const target = (await response.json()) as { url: string };
          screenshot = { url: target.url, fileName, mediaType: "image/jpeg" };
          visualNote =
            "Attached: full-length email preview at 680px width. This is a browser rendering, not an inbox-client compatibility test. Unresolved Liquid remains template source; image defaults are used where supplied. Unavailable images are labeled placeholders, not original artwork.";
        } catch (error) {
          console.warn(
            "Newsletter preview attachment failed",
            error instanceof Event
              ? {
                  type: error.type,
                  source: (error.target as HTMLImageElement | null)?.src?.slice(
                    0,
                    300,
                  ),
                }
              : error,
          );
          toast.info(
            "Opening with email copy and results. The preview image could not be attached.",
          );
        }
      }
      sendAssistantIntent({
        type: "review_email",
        newThread: true,
        brandId,
        brandName,
        visibleText: `Review “${subject}” and suggest improvements to the copy, offer, CTA and visual layout.`,
        contextText: `${contextText}\n\n${visualNote}`,
        screenshot,
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      variant="outline"
      size="sm"
      loading={busy}
      onClick={() => void discuss()}
    >
      <MessageCircle className="size-3.5" />
      {busy ? "Preparing email…" : "Discuss this email"}
    </Button>
  );
}
