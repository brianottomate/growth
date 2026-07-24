"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Calendar, FileText, Rows3 } from "lucide-react";

import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useTRPC } from "@/trpc/react";

export const OPEN_COMMAND_MENU_EVENT = "growth-command-menu:open";

export function CommandMenu() {
  const router = useRouter();
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_MENU_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_MENU_EVENT, onOpen);
    };
  }, []);

  const { data, isLoading } = useQuery({
    ...trpc.content.searchIndex.queryOptions(),
    enabled: open,
  });

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search Wander Growth"
      description="Search content ideas and their platform posts."
    >
      <Command>
        <CommandInput placeholder="Search ideas, copy, brands, or platforms…" />
        <CommandList>
          <CommandEmpty>
            {isLoading ? "Loading content…" : "No content found."}
          </CommandEmpty>

          <CommandGroup heading="Jump to">
            <CommandItem
              value="Content ideas board"
              onSelect={() => go("/app/content")}
            >
              <FileText />
              Content
            </CommandItem>
            <CommandItem
              value="Content calendar"
              onSelect={() => go("/app/calendar")}
            >
              <Calendar />
              Calendar
            </CommandItem>
            <CommandItem
              value="Content timeline posts"
              onSelect={() => go("/app/feed-v5")}
            >
              <Rows3 />
              Timeline
            </CommandItem>
          </CommandGroup>

          {data?.ideas.length ? (
            <>
              <CommandSeparator />
              <CommandGroup heading={`Ideas · ${data.ideas.length}`}>
                {data.ideas.map((idea) => (
                  <CommandItem
                    key={idea.id}
                    value={[
                      idea.title,
                      idea.hook,
                      idea.brandName,
                      idea.pillar,
                      idea.seriesName,
                      idea.status,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onSelect={() => go(idea.href)}
                  >
                    <FileText />
                    <span className="min-w-0 flex-1 truncate">
                      {idea.title}
                    </span>
                    <CommandShortcut className="max-w-32 truncate tracking-normal">
                      {idea.brandName}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}

          {data?.posts.length ? (
            <>
              <CommandSeparator />
              <CommandGroup heading={`Platform posts · ${data.posts.length}`}>
                {data.posts.map((post) => (
                  <CommandItem
                    key={post.id}
                    value={[
                      post.title,
                      post.text,
                      post.brandName,
                      post.platform,
                      post.format,
                      post.status,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onSelect={() => go(post.href)}
                  >
                    <ChannelLogo platform={post.platform} className="size-4" />
                    <span className="min-w-0 flex-1 truncate">
                      {post.text?.trim() || post.title}
                    </span>
                    <CommandShortcut className="tracking-normal">
                      {platformLabel(post.platform)}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
