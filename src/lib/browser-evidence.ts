import { z } from "zod";

export function canonicalEvidenceUrl(
  value: string,
  platform: "instagram" | "twitter",
) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error("Use a public HTTPS post link");
  if (platform === "instagram") {
    if (!["instagram.com", "www.instagram.com"].includes(url.hostname))
      throw new Error("Expected an Instagram post link");
    const match =
      /^\/(?:[\w.]+\/)?(?:p|reel|reels)\/([\w-]+)(?:\/c\/(\d+))?\/?$/.exec(
        url.pathname,
      );
    const comment = url.searchParams.get("comment_id");
    if (
      !match ||
      (comment && !/^\d+$/.test(comment)) ||
      (comment && match[2] && comment !== match[2])
    )
      throw new Error("Invalid Instagram post link");
    return `https://www.instagram.com/p/${match[1]}/${match[2] || comment ? `c/${match[2] ?? comment}/` : ""}`;
  }
  if (
    !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(
      url.hostname,
    )
  )
    throw new Error("Expected an X post link");
  const match = /^\/([\w]+)\/status\/(\d+)\/?$/.exec(url.pathname);
  if (!match) throw new Error("Invalid X post link");
  return `https://x.com/${match[1]!.toLowerCase()}/status/${match[2]}`;
}

const note = z.string().trim().min(1).max(5000);
export const browserEvidenceRunSchema = z
  .object({
    brandId: z.string().min(1),
    runKey: z.string().trim().min(1).max(200),
    startedAt: z.iso.datetime({ offset: true }),
    finishedAt: z.iso.datetime({ offset: true }),
    outcome: z.enum(["completed", "partial", "blocked"]),
    report: note,
    captures: z
      .array(
        z
          .object({
            platform: z.enum(["instagram", "twitter"]),
            url: z.url(),
            author: z.string().trim().min(1).max(100),
            observedAt: z.iso.datetime({ offset: true }),
            evidence: note,
            decision: z.enum(["engage", "monitor", "skip"]),
            rationale: note,
            draft: note.optional(),
            receipt: z
              .object({
                url: z.url(),
                parentUrl: z.url(),
                account: z.string().trim().min(1).max(100),
                text: note,
                postedAt: z.iso.datetime({ offset: true }),
                authorization: note,
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
  .superRefine((run, ctx) => {
    if (Date.parse(run.finishedAt) < Date.parse(run.startedAt))
      ctx.addIssue({
        code: "custom",
        message: "Run finishes before it starts",
      });
    const seen = new Set<string>();
    for (const [index, capture] of run.captures.entries()) {
      try {
        const key = canonicalEvidenceUrl(capture.url, capture.platform);
        if (seen.has(key))
          throw new Error("Each canonical post can appear once per run");
        seen.add(key);
        if (
          Date.parse(capture.observedAt) < Date.parse(run.startedAt) ||
          Date.parse(capture.observedAt) > Date.parse(run.finishedAt)
        )
          throw new Error("Observation falls outside the run");
        if (capture.draft && capture.decision !== "engage")
          throw new Error("A pending reply requires an engage decision");
        if (capture.receipt) {
          const receipt = canonicalEvidenceUrl(
            capture.receipt.url,
            capture.platform,
          );
          if (
            canonicalEvidenceUrl(
              capture.receipt.parentUrl,
              capture.platform,
            ) !== key
          )
            throw new Error("Receipt parent differs from captured post");
          if (capture.draft && capture.draft !== capture.receipt.text)
            throw new Error("Draft differs from posted receipt text");
          if (
            capture.platform === "twitter" &&
            new URL(receipt).pathname.split("/")[1] !==
              capture.receipt.account.replace(/^@/, "").toLowerCase()
          )
            throw new Error("Receipt account differs from posting account");
          if (
            capture.platform === "instagram" &&
            (!receipt.includes("/c/") ||
              receipt.split("/p/")[1]?.split("/")[0] !==
                key.split("/p/")[1]?.split("/")[0])
          )
            throw new Error(
              "Use a comment receipt on the captured Instagram post",
            );
        }
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          path: ["captures", index],
          message: error instanceof Error ? error.message : "Invalid evidence",
        });
      }
    }
  });
export type BrowserEvidenceRun = z.infer<typeof browserEvidenceRunSchema>;
