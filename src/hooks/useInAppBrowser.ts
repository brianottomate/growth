import { useState } from "react";

interface InAppBrowserInfo {
  isInAppBrowser: boolean;
  browserName: string | null;
}

const inAppBrowsers = [
  { pattern: /Instagram/i, name: "Instagram" },
  { pattern: /FBAN|FBAV/i, name: "Facebook" },
  { pattern: /LinkedInApp/i, name: "LinkedIn" },
  { pattern: /Twitter/i, name: "X" },
  { pattern: /musical_ly|TikTok/i, name: "TikTok" },
  { pattern: /Line\//i, name: "Line" },
  { pattern: /Snapchat/i, name: "Snapchat" },
  { pattern: /WeChat/i, name: "WeChat" },
];

function detectInAppBrowser(): InAppBrowserInfo {
  if (typeof navigator === "undefined") {
    return { isInAppBrowser: false, browserName: null };
  }

  const userAgent = navigator.userAgent || navigator.vendor;

  for (const browser of inAppBrowsers) {
    if (browser.pattern.test(userAgent)) {
      return { isInAppBrowser: true, browserName: browser.name };
    }
  }

  return { isInAppBrowser: false, browserName: null };
}

/**
 * Detects if the user is viewing the page in an in-app browser
 * (LinkedIn, Instagram, Facebook, Twitter/X, TikTok, etc.)
 */
export function useInAppBrowser(): InAppBrowserInfo {
  const [info] = useState<InAppBrowserInfo>(detectInAppBrowser);
  return info;
}
