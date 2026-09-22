export function applyMetaTrackingDefaults<
  T extends { pixelId?: string; customEventType?: string },
>(settings: T, defaults?: { pixelId: string; customEventType: string }) {
  return {
    ...settings,
    pixelId: settings.pixelId || defaults?.pixelId,
    customEventType: settings.customEventType || defaults?.customEventType,
  };
}
