"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendAssistantIntent } from "@/lib/assistant-events";

/** A URL becomes a website, or nothing the assistant should be sent. */
function normalizeWebsite(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!url.hostname.includes(".")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * The start of the client journey: a website, handed to the assistant, which
 * runs the new-client-setup playbook (brand, mark, photos, campaign shell,
 * first ads) and stops before anything is pushed.
 */
export function NewClientBox() {
  const [value, setValue] = useState("");
  const website = normalizeWebsite(value);
  const start = () => {
    if (!website) return;
    sendAssistantIntent({
      type: "set_up_client",
      website,
      visibleText: `Set up ${website.replace(/^https?:\/\//, "")} as a client: brand, mark, photos, a campaign shell and first ads from their homes. Stop before pushing.`,
    });
    setValue("");
  };
  return (
    <form
      className="flex w-full max-w-md items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        start();
      }}
    >
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="theirsite.com"
        aria-label="New client website"
        className="h-9"
      />
      <Button type="submit" size="sm" disabled={!website} className="h-9 shrink-0">
        <Sparkles className="size-3.5" />
        New client
      </Button>
    </form>
  );
}
