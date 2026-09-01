import { describe, expect, it } from "bun:test";
import { InvalidToolInputError } from "ai";

import { streamErrorMessage } from "./stream-error";

/**
 * A rejected tool call must reach the model and the screen as the one
 * sentence that explains it — not the serialized zod error it arrives in.
 */
describe("streamErrorMessage", () => {
  const zodish = (issues: unknown[]) => {
    const cause = new Error("big serialized dump ".repeat(100));
    (cause as unknown as { issues: unknown[] }).issues = issues;
    return new InvalidToolInputError({
      toolName: "adsWrite",
      toolInput: "{}",
      cause,
    });
  };

  it("extracts the discriminator sentence from a wrong-action call", () => {
    const message = streamErrorMessage(
      zodish([
        {
          code: "invalid_union",
          path: ["action"],
          message:
            "Invalid discriminator value. Expected 'draftCampaign' | 'addAudience'",
        },
      ]),
    );
    expect(message).toBe(
      "Invalid input for adsWrite: action: Invalid discriminator value. Expected 'draftCampaign' | 'addAudience'",
    );
  });

  it("lists at most three issues and counts the rest", () => {
    const message = streamErrorMessage(
      zodish(
        Array.from({ length: 5 }, (_, index) => ({
          path: [`field${index}`],
          message: "required",
        })),
      ),
    );
    expect(message).toContain("field0: required");
    expect(message).toContain("(+2 more)");
    expect(message).not.toContain("field3");
  });

  it("truncates when there is no issues array to mine", () => {
    const error = new InvalidToolInputError({
      toolName: "adsWrite",
      toolInput: "{}",
      cause: new Error("x".repeat(2000)),
    });
    expect(streamErrorMessage(error).length).toBeLessThan(600);
  });
});
