export type PlatformThreadNode = {
  id: string;
  parentPlatformPostId: string | null;
  sequence: number | null;
};

export type PlatformThreadGroup<T extends PlatformThreadNode> = {
  root: T;
  items: T[];
};

const bySequence = <T extends PlatformThreadNode>(a: T, b: T) =>
  (a.sequence ?? Number.MAX_SAFE_INTEGER) -
    (b.sequence ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id);

/**
 * Group flat platform-post rows into publishing units. A thread is one root
 * platform post plus ordered descendants, not a content series and not several
 * unrelated cross-post cards.
 *
 * Orphans and malformed cycles remain visible as their own groups so bad data
 * can be repaired from the UI instead of disappearing.
 */
export function groupPlatformThreads<T extends PlatformThreadNode>(
  posts: T[],
): PlatformThreadGroup<T>[] {
  const byId = new Map(posts.map((post) => [post.id, post]));
  const children = new Map<string, T[]>();

  for (const post of posts) {
    if (!post.parentPlatformPostId || !byId.has(post.parentPlatformPostId)) {
      continue;
    }
    const siblings = children.get(post.parentPlatformPostId) ?? [];
    siblings.push(post);
    children.set(post.parentPlatformPostId, siblings);
  }
  for (const siblings of children.values()) siblings.sort(bySequence);

  const visited = new Set<string>();
  const collect = (root: T) => {
    const items: T[] = [];
    const visit = (post: T) => {
      if (visited.has(post.id)) return;
      visited.add(post.id);
      items.push(post);
      for (const child of children.get(post.id) ?? []) visit(child);
    };
    visit(root);
    return items;
  };

  const roots = posts.filter(
    (post) =>
      !post.parentPlatformPostId || !byId.has(post.parentPlatformPostId),
  );
  const groups = roots.map((root) => ({ root, items: collect(root) }));

  for (const post of posts) {
    if (!visited.has(post.id)) {
      groups.push({ root: post, items: collect(post) });
    }
  }

  return groups;
}

export const threadFormatForPlatform = (
  platform: string,
  itemCount: number,
): { format?: string; archetype?: string } => {
  if (platform === "x") {
    return itemCount > 1
      ? { format: "x.thread", archetype: "thread" }
      : { format: "x.tweet", archetype: "text" };
  }
  if (platform === "threads") {
    return itemCount > 1
      ? { format: "threads.thread", archetype: "thread" }
      : { format: "threads.post", archetype: "text" };
  }
  return {};
};

/**
 * X counts every HTTP(S) URL as its fixed t.co length. Array.from keeps emoji
 * and other astral Unicode characters from being counted as two UTF-16 units.
 */
export const platformTextLength = (text: string, platform: string) => {
  const normalized =
    platform === "x" ? text.replace(/https?:\/\/\S+/g, "x".repeat(23)) : text;
  return Array.from(normalized).length;
};
