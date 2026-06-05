"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Copies a pre-built text block to the clipboard — the "export to ChatGPT /
 * Claude" hand-off. Pass server-rendered markdown via `text`.
 */
export function CopyButton({
  text,
  label = "Copy",
  size = "sm",
}: {
  text: string;
  label?: string;
  size?: "sm" | "default";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size={size}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
