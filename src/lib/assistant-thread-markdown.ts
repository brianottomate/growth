import type { UIMessage } from "ai";

function json(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function toolName(part: { type?: string; toolName?: string }) {
  if (part.toolName) return part.toolName;
  return part.type?.startsWith("tool-") ? part.type.slice(5) : "tool";
}

/** A portable, complete-enough transcript: readable conversation first, with
 * tool inputs/results preserved in collapsible details blocks. */
export function assistantThreadAsMarkdown(input: {
  threadId: string;
  title: string;
  messages: UIMessage[];
}) {
  const lines = [
    `# ${input.title}`,
    "",
    `Thread ID: \`${input.threadId}\``,
    "",
  ];

  for (const message of input.messages) {
    const role =
      message.role === "user"
        ? "You"
        : message.role === "assistant"
          ? "Assistant"
          : "System";
    lines.push(`## ${role}`, "");
    for (const part of message.parts) {
      if (part.type === "text") {
        lines.push(part.text, "");
        continue;
      }
      if (part.type === "file") {
        const file = part as { filename?: string; url?: string };
        lines.push(
          file.url
            ? `[${file.filename ?? "Attachment"}](${file.url})`
            : (file.filename ?? "Attachment"),
          "",
        );
        continue;
      }
      if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
        const tool = part as unknown as {
          type?: string;
          toolName?: string;
          state?: string;
          input?: unknown;
          output?: unknown;
          errorText?: string;
        };
        lines.push(
          `<details><summary>Tool: ${toolName(tool)} · ${tool.state ?? "recorded"}</summary>`,
          "",
          "```json",
          json({
            input: tool.input,
            output: tool.output,
            error: tool.errorText,
          }),
          "```",
          "",
          "</details>",
          "",
        );
      }
    }
  }

  return lines.join("\n").trimEnd();
}
