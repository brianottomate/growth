export const AMPLIFICATION_ACTIONS = [
  "repost",
  "quote",
  "comment",
  "story_share",
] as const;

export type AmplificationAction = (typeof AMPLIFICATION_ACTIONS)[number];

export function isSlackMemberId(value: string): boolean {
  return /^[UW][A-Z0-9]{7,}$/.test(value.trim().toUpperCase());
}

const ACTION_LABELS: Record<AmplificationAction, string> = {
  repost: "repost",
  quote: "quote-post",
  comment: "comment",
  story_share: "share to Stories",
};

const slackText = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildAmplificationSlackMessage(input: {
  slackUserId: string;
  recipientRole: "coordinator" | "amplifier";
  amplifierName: string;
  actionKind: AmplificationAction;
  brandName: string;
  platform: string;
  title?: string | null;
  draftText?: string | null;
  notes?: string | null;
  plannedAt?: Date | null;
  sourceUrl?: string | null;
  workUrl: string;
}) {
  const request = `${ACTION_LABELS[input.actionKind]} this ${slackText(input.platform)} post for ${slackText(input.brandName)}`;
  const headline =
    input.recipientRole === "coordinator"
      ? `<@${input.slackUserId}> amplification handoff: ask ${slackText(input.amplifierName)} to ${request}.`
      : `<@${input.slackUserId}> could you ${request}?`;
  const details = [
    input.title ? `*Content:* ${slackText(input.title)}` : null,
    input.plannedAt
      ? `*Requested for:* <!date^${Math.floor(input.plannedAt.getTime() / 1000)}^{date_short_pretty} at {time}|${input.plannedAt.toISOString()}>`
      : null,
    input.draftText
      ? `*Suggested copy:*\n>${slackText(input.draftText).replace(/\n/g, "\n>")}`
      : null,
    input.notes ? `*Context:* ${slackText(input.notes)}` : null,
    input.sourceUrl ? `<${input.sourceUrl}|Open the live post>` : null,
    `<${input.workUrl}|Open the Growth work item>`,
  ].filter((line): line is string => Boolean(line));

  return {
    text: `${headline}\n${details.join("\n")}`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: headline } },
      { type: "section", text: { type: "mrkdwn", text: details.join("\n") } },
    ],
  };
}
