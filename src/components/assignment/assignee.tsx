"use client";

// Ownership UI, shared across the board / calendar / feed / content-detail.
// Two levels of ownership exist (idea = content_post, spot = platform_post);
// this layer is unit-agnostic — each surface passes the current owner + an
// `onChange(ownerId | null)` that performs the right mutation + optimistic
// update. Interaction mirrors Trello: hover + Space self-toggles, clicking the
// avatar opens a member picker for assigning anyone.

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/components/ui/lib/utils";

export type Member = { id: string; name: string | null; image: string | null };

const SIZE = {
  sm: "size-5 text-[9px]",
  md: "size-6 text-[10px]",
  lg: "size-8 text-xs",
} as const;
type Size = keyof typeof SIZE;

function initials(m: Member) {
  const base = m.name?.trim() || "?";
  return base
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/**
 * The owner thumbnail. Three states:
 *   - assigned   → the member's photo / initials
 *   - suggested  → a ghosted member + sparkle (AI proposal, click to confirm)
 *   - empty      → a dashed "add owner" ghost
 */
export function OwnerAvatar({
  member,
  suggested = false,
  size = "md",
  className,
}: {
  member: Member | null;
  suggested?: boolean;
  size?: Size;
  className?: string;
}) {
  if (!member) {
    return (
      <span
        className={cn(
          "border-muted-foreground/40 text-muted-foreground/50 flex shrink-0 items-center justify-center rounded-full border border-dashed",
          SIZE[size],
          className,
        )}
        aria-label="Unassigned"
      >
        +
      </span>
    );
  }
  return (
    <span className={cn("relative shrink-0", className)} title={member.name ?? undefined}>
      {member.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.image}
          alt=""
          className={cn(
            "rounded-full object-cover",
            SIZE[size],
            suggested && "opacity-50",
          )}
        />
      ) : (
        <span
          className={cn(
            "bg-muted text-foreground flex items-center justify-center rounded-full font-semibold",
            SIZE[size],
            suggested && "opacity-50",
          )}
        >
          {initials(member)}
        </span>
      )}
      {suggested && (
        <Sparkles className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-violet-500/90 p-0.5 text-white" />
      )}
    </span>
  );
}

/** Overlapping spot-owner avatars (the stack over the platform-icon row). */
export function AvatarStack({
  members,
  max = 3,
  size = "sm",
}: {
  members: Member[];
  max?: number;
  size?: Size;
}) {
  if (!members.length) return null;
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return (
    <span className="flex items-center -space-x-1.5">
      {shown.map((m) => (
        <OwnerAvatar
          key={m.id}
          member={m}
          size={size}
          className="ring-card rounded-full ring-2"
        />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            "bg-muted text-muted-foreground ring-card flex items-center justify-center rounded-full font-medium ring-2",
            SIZE[size],
          )}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}

/**
 * Click-to-assign: the owner avatar as a popover trigger over a filterable
 * member list. `currentUserId` floats "you" to the top and labels it.
 */
export function AssigneeButton({
  value,
  suggested,
  members,
  currentUserId,
  onChange,
  size = "md",
  label = "Assign owner",
}: {
  value: Member | null;
  suggested?: Member | null;
  members: Member[];
  currentUserId: string;
  onChange: (ownerId: string | null) => void;
  size?: Size;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ordered = [...members].sort((a, b) =>
    a.id === currentUserId ? -1 : b.id === currentUserId ? 1 : 0,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={value ? `Owner: ${value.name ?? "assigned"}` : label}
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={(e) => e.stopPropagation()}
      >
        <OwnerAvatar member={value} suggested={!value && !!suggested} size={size} />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-56 p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder="Assign to…" />
          <CommandList>
            <CommandEmpty>No people found.</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  Clear owner
                </CommandItem>
              )}
              {ordered.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.name ?? ""} ${m.id}`}
                  onSelect={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  <OwnerAvatar member={m} size="sm" />
                  <span className="truncate">{m.name ?? "Unknown"}</span>
                  {m.id === currentUserId && (
                    <span className="text-muted-foreground ml-auto text-xs">you</span>
                  )}
                  {value?.id === m.id && (
                    <span className="text-foreground ml-auto text-xs">✓</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Multi-select assignees — an avatar stack that opens a member list where each
 * row toggles membership (the popover stays open so you can pick several).
 * `value` is the current set; `onChange` gets the full new list of ids.
 */
export function MultiAssigneeButton({
  value,
  members,
  currentUserId,
  onChange,
  size = "sm",
}: {
  value: Member[];
  members: Member[];
  currentUserId: string;
  onChange: (userIds: string[]) => void;
  size?: Size;
}) {
  const [open, setOpen] = useState(false);
  const selected = new Set(value.map((m) => m.id));
  const ordered = [...members].sort((a, b) =>
    a.id === currentUserId ? -1 : b.id === currentUserId ? 1 : 0,
  );
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange([...next]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Assignees"
        className="focus-visible:ring-ring rounded-full outline-none focus-visible:ring-2"
        onClick={(e) => e.stopPropagation()}
      >
        {value.length ? (
          <AvatarStack members={value} size={size} />
        ) : (
          <OwnerAvatar member={null} size={size} />
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-56 p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder="Assign people…" />
          <CommandList>
            <CommandEmpty>No people found.</CommandEmpty>
            <CommandGroup>
              {ordered.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.name ?? ""} ${m.id}`}
                  onSelect={() => toggle(m.id)}
                  className="gap-2"
                >
                  <OwnerAvatar member={m} size="sm" />
                  <span className="truncate">{m.name ?? "Unknown"}</span>
                  {m.id === currentUserId && (
                    <span className="text-muted-foreground ml-auto text-xs">you</span>
                  )}
                  {selected.has(m.id) && (
                    <span
                      className={cn(
                        "text-foreground text-xs",
                        m.id === currentUserId ? "" : "ml-auto",
                      )}
                    >
                      ✓
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Trello-style self-assign: while the host is hovered, Space toggles the
 * current user as owner (own ⇄ disown). Returns hover handlers to spread on the
 * card/row root. Ignores Space typed into inputs or with modifier keys.
 */
export function useSelfAssignHotkey({
  ownerId,
  currentUserId,
  onChange,
  enabled = true,
}: {
  ownerId: string | null;
  currentUserId: string;
  onChange: (ownerId: string | null) => void;
  enabled?: boolean;
}) {
  const hovered = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!hovered.current) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      e.preventDefault();
      onChange(ownerId === currentUserId ? null : currentUserId);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ownerId, currentUserId, onChange, enabled]);

  return {
    onMouseEnter: () => (hovered.current = true),
    onMouseLeave: () => (hovered.current = false),
  };
}
