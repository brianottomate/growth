import "server-only";

/** Optional editorial feedback; never a delivery gate. */
export async function emailLinkWarnings(html: string) {
  const links = [
    ...new Set(
      [...html.matchAll(/href="([^"]+)"/g)]
        .map((match) => match[1]!.replace(/&amp;/g, "&"))
        .filter((href) => /^https?:\/\//.test(href)),
    ),
  ];
  const broken: string[] = [];
  for (let index = 0; index < links.length; index += 6) {
    await Promise.all(
      links.slice(index, index + 6).map(async (href) => {
        try {
          const response = await fetch(href, {
            redirect: "follow",
            signal: AbortSignal.timeout(15_000),
            headers: { "user-agent": "WanderGrowthLinkCheck/1.0" },
          });
          await response.body?.cancel();
          if (response.status >= 400)
            broken.push(`${href} (${response.status})`);
        } catch {
          broken.push(`${href} (no response)`);
        }
      }),
    );
  }
  return broken.map((link) => `Could not verify link: ${link}`);
}
