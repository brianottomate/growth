import Link from "next/link";

const TABS: { href: string; label: string; key: string }[] = [
  { href: "/app/feed", label: "Current feed", key: "current" },
  { href: "/app/feed-v2", label: "Lanes (v2)", key: "v2" },
  { href: "/app/feed-v3", label: "Dashboard (v3)", key: "v3" },
  { href: "/app/feed-v4", label: "Command (v4)", key: "v4" },
];

export function ProtoNav({
  active,
}: {
  active: "current" | "v2" | "v3" | "v4";
}) {
  return (
    <div className="mb-5 flex flex-wrap gap-2 text-xs">
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            className={`rounded-full border px-3 py-1 font-medium transition-colors ${
              on
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
