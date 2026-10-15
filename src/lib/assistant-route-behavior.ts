/**
 * `/app/next/<threadId>` is the assistant at full width. The URL owns which
 * session is shown there, and the dock takes over the main area instead of
 * mounting a second chat, so a running turn survives expanding or collapsing.
 */
export function assistantPageThreadId(pathname: string): string | null {
  return /^\/app\/next\/([^/]+)$/.exec(pathname)?.[1] ?? null;
}

/**
 * `/app/next` is the assistant's own home, so arriving there with the dock
 * collapsed would leave the session list with nowhere to talk. Individual blog
 * articles are review and editing surfaces, so the assistant should be
 * alongside the article when it opens on desktop. Keep this narrow: the blog
 * index and standalone Dato preview retain the user's global choice.
 */
export function shouldAutoOpenAssistant(pathname: string): boolean {
  return pathname === "/app/next" || /^\/app\/blog\/[^/]+$/.test(pathname);
}
