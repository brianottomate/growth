"use client";

import { useState } from "react";
import { Button } from "@wandercom/design-system-web/ui/button";

export function CopyPrompt({ text, label }: { text: string; label: string }) {
  const [status, setStatus] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        size="sm"
        variant="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setStatus("Copied");
          } catch {
            setStatus("Clipboard unavailable. Select the prompt text to copy.");
          }
        }}
      >
        {label}
      </Button>
      <span role="status" className="text-sm text-secondary">
        {status}
      </span>
    </div>
  );
}
