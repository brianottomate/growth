/**
 * Individual blog articles are review and editing surfaces, so the assistant
 * should be alongside the article when it opens on desktop. Keep this narrow:
 * the blog index and standalone Dato preview retain the user's global choice.
 */
export function shouldAutoOpenAssistant(pathname: string): boolean {
  return /^\/app\/blog\/[^/]+$/.test(pathname);
}
