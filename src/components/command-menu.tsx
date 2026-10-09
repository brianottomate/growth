"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";

import { NAV_GROUPS } from "@/components/app-nav";
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
import { orpc } from "@/orpc/client";

export const OPEN_COMMAND_MENU_EVENT = "growth-command-menu:open";

export function CommandMenu() {
  const router = useRouter();
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
    ...orpc.content.searchIndex.queryOptions(),
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
      description="Go to a section, client, or prospect."
    >
      <Command>
        <CommandInput placeholder="Search sections, clients, prospects…" />
        <CommandList>
          <CommandEmpty>
            {isLoading ? "Loading clients…" : "No results found."}
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
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
