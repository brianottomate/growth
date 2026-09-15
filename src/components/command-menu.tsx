"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Building2, FileText } from "lucide-react";

import { NAV_GROUPS } from "@/components/app-nav";
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
import { BUSINESS_LABEL, DELIVERY_LABEL } from "@/lib/performance-stage";
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
      description="Go to a section, or search content ideas and their platform posts."
    >
      <Command>
        <CommandInput placeholder="Go to a section, or search ideas, copy, brands, platforms…" />
        <CommandList>
          <CommandEmpty>
            {isLoading ? "Loading content…" : "No content found."}
          </CommandEmpty>

          {/* Every section the sidebar lists, so "leads" or "compositions"
              typed here goes there. The group name is part of the match, so
              "grow" or "library" surfaces a whole section. */}
          <CommandGroup heading="Go to">
            {NAV_GROUPS.flatMap((group) =>
              group.items.map((item) => (
                <CommandItem
                  key={item.href}
                  value={[group.label, item.label, item.href]
                    .filter(Boolean)
                    .join(" ")}
                  onSelect={() => go(item.href)}
                >
                  <item.icon />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {group.label ? (
                    <CommandShortcut className="tracking-normal">
                      {group.label}
                    </CommandShortcut>
                  ) : null}
                </CommandItem>
              )),
            )}
          </CommandGroup>

          {data?.clients.length ? (
            <>
              <CommandSeparator />
              <CommandGroup heading={`Clients · ${data.clients.length}`}>
                {data.clients.map((client) => (
                  <CommandItem
                    key={client.id}
                    value={[
                      client.name,
                      client.website,
                      client.relationship,
                      client.business ? BUSINESS_LABEL[client.business] : null,
                      client.delivery ? DELIVERY_LABEL[client.delivery] : null,
                      "performance",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onSelect={() => go(client.href)}
                  >
                    <Building2 />
                    <span className="min-w-0 flex-1 truncate">
                      {client.name}
                    </span>
                    <CommandShortcut className="max-w-32 truncate tracking-normal">
                      {client.business
                        ? [
                            BUSINESS_LABEL[client.business],
                            client.delivery && client.delivery !== "not_started"
                              ? DELIVERY_LABEL[client.delivery]
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : client.relationship}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}

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
