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
