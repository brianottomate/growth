"use client";

import { usePathname } from "next/navigation";

import { NewClientDialog } from "./NewClientDialog";

/**
 * "New client" belongs on the desk, not inside one client's tabs — once you
 * are on a brand, starting a different client from its header is noise. Hidden
 * on every brand view, shown everywhere else in the section.
 */
export function HeaderNewClient() {
  const pathname = usePathname();
  if (
    pathname.startsWith("/app/performance/brands/") ||
    pathname.startsWith("/app/performance/prototype")
  )
    return null;
  return <NewClientDialog />;
}
