"use client";

import { useState } from "react";

import { InfoAlert } from "@/components/ui/alert";
import { useInAppBrowser } from "@/hooks/useInAppBrowser";

export function InAppBrowserAlert() {
  const { isInAppBrowser, browserName } = useInAppBrowser();
  const [linkCopied, setLinkCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      console.error("Failed to copy link");
    }
  };

  if (!isInAppBrowser) return null;

  return (
    <InfoAlert>
      <p className="font-semibold">Whoa there</p>
      <p className="mt-1">
        You&apos;re using {browserName}&apos;s in-app browser. Google sign-in
        won&apos;t work here.
      </p>
      <div className="mt-2 space-y-2 text-xs">
        <p>
          <strong>Option 1:</strong> Tap the <strong>⋯</strong> menu or browser
          icon and select &quot;Open in Browser&quot;
        </p>
        <div>
          <p>
            <strong>Option 2:</strong> Copy this link and paste it into
            Safari/Chrome
          </p>
          <button
            type="button"
            onClick={handleCopyLink}
            className="mt-1 inline-flex items-center gap-1.5 self-start rounded-md bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800 hover:bg-blue-200"
          >
            {linkCopied ? <>✓ Link copied!</> : <>📋 Copy link</>}
          </button>
        </div>
        <p>
          <strong>Option 3:</strong> Continue with email and password below
        </p>
      </div>
    </InfoAlert>
  );
}
