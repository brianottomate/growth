/**
 * Blog author definitions
 * Separated from velite.config.ts to avoid Turbopack parsing issues
 *
 * Add your blog authors here to use them in your MDX blog posts.
 */

export const AUTHOR_KEYS = ["default"] as const;
export type AuthorKey = (typeof AUTHOR_KEYS)[number];

export type Author = {
  name: string;
  image: string;
  description: string;
  instagram?: string;
  email?: string;
};

// `satisfies` ensures the object keys match AuthorKey at compile time
export const AUTHORS = {
  default: {
    name: "Admin",
    image: "/placeholder.svg", // "/images/blog/authors/default.png",
    description: "Content creator",
    email: "hello@example.com",
  },
} as const satisfies Record<AuthorKey, Author>;
