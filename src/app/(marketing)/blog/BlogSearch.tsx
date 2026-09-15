"use client";

import { useQueryState } from "nuqs";
import { Search, X } from "lucide-react";
import { useTransition } from "react";

import { Text } from "@wandercom/design-system-web/ui/text";
import type { Post } from "#velite";

interface BlogSearchProps {
  allPosts: readonly Post[];
  resultCount: number;
}

// Extract all unique tags from posts (case-insensitive deduplication) (unused, keeping for future use)
// oxlint-disable-next-line typescript/no-unused-vars
function getAllTags(posts: readonly Post[]): string[] {
  const tagMap = new Map<string, string>();
  posts.forEach((post) => {
    post.tags.forEach((tag) => {
      const normalized = tag.toLowerCase();
      if (!tagMap.has(normalized)) {
        tagMap.set(normalized, tag);
      }
    });
  });
  return Array.from(tagMap.values()).sort();
}

function getAllCategories(posts: readonly Post[]): string[] {
  const categories = new Set<string>();
  posts.forEach((post) => {
    if (post.category) {
      categories.add(post.category);
    }
  });
  return Array.from(categories).sort();
}

export function BlogSearch({ allPosts, resultCount }: BlogSearchProps) {
  const [searchQuery, setSearchQuery] = useQueryState("q", {
    defaultValue: "",
  });
  const [selectedTag, setSelectedTag] = useQueryState("tag", {
    defaultValue: "",
  });
  const [selectedCategory, setSelectedCategory] = useQueryState("category", {
    defaultValue: "",
  });
  const [isPending, startTransition] = useTransition();

  const allCategories = getAllCategories(allPosts);
  const hasActiveFilters = searchQuery || selectedTag || selectedCategory;

  const handleSearchChange = (value: string) => {
    startTransition(() => {
      void setSearchQuery(value || null);
    });
  };

  const handleCategoryClick = (category: string) => {
    startTransition(() => {
      void setSelectedCategory(selectedCategory === category ? null : category);
    });
  };

  const handleClearAll = () => {
    startTransition(() => {
      void setSearchQuery(null);
      void setSelectedTag(null);
      void setSelectedCategory(null);
    });
  };

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
          <Search className="size-5 text-tertiary" />
        </div>
        <input
          type="text"
          placeholder="Search posts by title, description, category, tags, or author..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="block w-full rounded-lg border border-secondary bg-surface-input py-3 pr-12 pl-11 text-primary shadow-sm placeholder:text-tertiary focus:border-primary focus:ring-2 focus:ring-current/20 focus:outline-none sm:text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => handleSearchChange("")}
            className="absolute inset-y-0 right-0 flex items-center pr-4 text-tertiary transition-colors hover:text-primary"
            aria-label="Clear search"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      {/* Category Filters */}
      {allCategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Text variant="body-sm" weight="medium" className="text-secondary">
            Category:
          </Text>
          {allCategories.map((category) => {
            const isActive =
              selectedCategory?.toLowerCase() === category.toLowerCase();
            return (
              <button
                key={category}
                onClick={() => handleCategoryClick(category)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-linear-to-r from-amber-600 to-amber-700 text-white shadow-sm"
                    : "bg-surface-secondary text-primary hover:bg-surface-tertiary"
                }`}
              >
                {category}
              </button>
            );
          })}
          {selectedCategory && (
            <button
              onClick={() => handleCategoryClick(selectedCategory)}
              className="text-sm font-medium text-secondary transition-colors hover:text-primary"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Results Info & Clear Button */}
      <div className="flex items-center justify-between border-t border-secondary pt-4">
        <Text variant="body-sm" color="secondary">
          {isPending ? (
            <span className="opacity-50">Searching...</span>
          ) : (
            <>
              Showing{" "}
              <span className="font-semibold text-primary">{resultCount}</span>{" "}
              {resultCount === 1 ? "post" : "posts"}
              {hasActiveFilters && (
                <span className="text-tertiary"> (filtered)</span>
              )}
            </>
          )}
        </Text>
        {hasActiveFilters && (
          <button
            onClick={handleClearAll}
            className="text-sm font-medium text-secondary transition-colors hover:text-primary"
          >
            Clear all filters
          </button>
        )}
      </div>
    </div>
  );
}
