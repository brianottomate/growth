"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendAssistantIntent } from "@/lib/assistant-events";

/** A URL becomes a website, or nothing the assistant should be sent. */
function normalizeWebsite(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    );
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
export function NewClientDialog({
  variant = "default",
  size = "sm",
}: {
  variant?: "default" | "outline";
  size?: "sm" | "default";
}) {
  const [open, setOpen] = useState(false);
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
    setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} shape="round">
          <Sparkles className="size-3.5" />
          New client
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            start();
          }}
        >
          <DialogHeader>
            <DialogTitle>New client</DialogTitle>
            <DialogDescription>
              The assistant sets up the brand and drafts the first ads. Nothing
              is pushed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-4">
            <Label htmlFor="new-client-website">Website</Label>
            <Input
              id="new-client-website"
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="theirsite.com"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!website}>
              <Sparkles className="size-3.5" />
              Start in chat
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
