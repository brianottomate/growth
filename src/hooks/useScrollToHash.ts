import { useEffect } from "react";

/**
 * Scroll to the element the URL fragment names once `ready` is true. The
 * browser only does this on its own for elements present at load; a list
 * fetched on the client needs the nudge after its data arrives.
 */
export function useScrollToHash(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const id = window.location.hash.slice(1);
    if (!id) return;
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [ready]);
}
