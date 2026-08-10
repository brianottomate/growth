export function appendLiveUrlToPlatformPost(
  text: string | null,
  liveUrl: string,
): string | null {
  const current = text?.trim() ?? "";
  if (current.includes(liveUrl)) return null;
  return [current, liveUrl].filter(Boolean).join("\n\n");
}
