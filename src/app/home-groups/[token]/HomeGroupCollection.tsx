"use client";
import { useState } from "react";
import { ArrowUpRight, ImageIcon, MapPin, Search } from "lucide-react";
import type { PublicHomeGroup } from "@/lib/home-group-shares";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

export function HomeGroupCollection({ initial }: { initial: PublicHomeGroup }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const filtered = initial.homes.filter((home) =>
    `${home.name} ${home.location ?? ""}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 24));
  const currentPage = Math.min(page, pages);
  return (
    <div className="space-y-8">
      <header className="space-y-4 border-b border-border pb-8">
        <Text variant="body-sm" color="secondary">
          A HANDPICKED COLLECTION
        </Text>
        <Heading as="h1" variant="display-sm" className="break-words">
          {initial.title}
        </Heading>
        <Text color="secondary">
          Explore the homes below. Reply to the person who shared this
          collection with your preferred homes and travel dates. Availability
          will be confirmed separately.
        </Text>
        <div className="flex flex-wrap items-center gap-3">
          <Text color="secondary">
            {initial.homes.length}{" "}
            {initial.homes.length === 1 ? "home" : "homes"}
          </Text>
          <div className="relative min-w-0 flex-1 basis-60">
            <Search className="absolute top-3 left-3 size-4 text-secondary" />
            <Input
              className="pl-9"
              aria-label="Search homes or destinations"
              placeholder="Search homes or destinations"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </header>
      {!filtered.length && (
        <div className="space-y-3 rounded-xl bg-surface-secondary p-8">
          <Heading as="h2" variant="headline-sm">
            No homes to show
          </Heading>
          <Text color="secondary">
            {search
              ? "Try another home name or destination."
              : "The team is refreshing this collection. Check back soon."}
          </Text>
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filtered
          .slice((currentPage - 1) * 24, currentPage * 24)
          .map((home) => (
            <article
              key={home.key}
              className="overflow-hidden rounded-xl border border-border bg-surface-primary"
            >
              <div className="aspect-[4/3] bg-surface-secondary">
                {home.photoUrl ? (
                  <img
                    src={home.photoUrl}
                    alt={home.name}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-secondary">
                    <ImageIcon
                      className="size-10"
                      aria-label="No photo available"
                    />
                  </div>
                )}
              </div>
              <div className="space-y-4 p-5">
                <Heading as="h2" variant="headline-sm" className="break-words">
                  {home.name}
                </Heading>
                {home.location && (
                  <Text color="secondary" className="flex items-start gap-2">
                    <MapPin className="size-4 shrink-0" />
                    {home.location}
                  </Text>
                )}
                {home.url && (
                  <Button asChild variant="outline" className="w-full">
                    <a
                      href={home.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      referrerPolicy="no-referrer"
                    >
                      View home <ArrowUpRight className="size-4" />
                    </a>
                  </Button>
                )}
              </div>
            </article>
          ))}
      </div>
      {pages > 1 && (
        <nav
          aria-label="Home pages"
          className="flex items-center justify-center gap-4"
        >
          <Button
            variant="outline"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </Button>
          <Text>
            Page {currentPage} of {pages}
          </Text>
          <Button
            variant="outline"
            disabled={currentPage === pages}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}
