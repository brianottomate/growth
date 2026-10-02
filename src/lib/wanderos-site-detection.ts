/** Asset origins identify WanderOS; arbitrary numeric HTML content does not. */
export function wanderOsIdFromHtml(html: string): string | null {
  return (
    /(?:https?:)?\/\/(?:assets-websites|wander-upload-assets)\.wander\.com\/(\d{12,20})\//i.exec(
      html,
    )?.[1] ?? null
  );
}
export function plausibleWanderOsId(id: string | null): boolean {
  return id !== null && /^\d{6,20}$/.test(id);
}
