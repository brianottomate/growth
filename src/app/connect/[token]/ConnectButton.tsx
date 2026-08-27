"use client";

import { useState } from "react";

/**
 * The OAuth URL is minted server-side on click (they expire, so no
 * pre-minting), which takes a second or two — without feedback the button
 * reads as broken. Plain navigation, just with a pending state.
 */
export function ConnectButton({ href }: { href: string }) {
  const [pending, setPending] = useState(false);

  return (
    <a
      href={href}
      aria-disabled={pending}
      onClick={(event) => {
        if (pending) {
          event.preventDefault();
          return;
        }
        setPending(true);
      }}
      className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
        pending
          ? "cursor-default bg-white/60 text-black/60"
          : "bg-white text-black hover:bg-white/85"
      }`}
    >
      {pending ? "Opening…" : "Connect"}
    </a>
  );
}
