import type { AmplifierHandle } from "@/server/db/schema";

export function normalizedSocialHandle(value: string | null | undefined) {
  return value?.trim().replace(/^@/, "").toLowerCase() ?? "";
}

export function amplifierHandlesAccount(
  handles: AmplifierHandle[] | null | undefined,
  platform: string,
  username: string | null | undefined,
) {
  const wanted = normalizedSocialHandle(username);
  return (
    !!wanted &&
    (handles ?? []).some(
      (handle) =>
        handle.platform === platform &&
        normalizedSocialHandle(handle.handle) === wanted,
    )
  );
}
