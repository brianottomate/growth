import {
  listPlaybooksActionOutputSchema,
  readPlaybookActionOutputSchema,
} from "./outputs/playbooks";
import "server-only";

import { z } from "zod";

import { getPlaybook, listPlaybooks } from "@/server/ai/playbooks";
import { growthAction, GrowthActionError } from "./types";

/**
 * Playbooks are the procedures the assistant follows step by step: the
 * checked-in markdown under content/playbooks. A procedure playbook is a skill
 * in the tool-loop sense: the model reads it, then runs the listed actions in
 * order with the existing tools, stopping where the playbook says to stop.
 */
export const listPlaybooksAction = growthAction({
  outputSchema: listPlaybooksActionOutputSchema,
  description:
    "The playbooks available: id, title, kind and summary. procedure playbooks are step-by-step jobs to follow with the other tools (setting up a new client, for one); the rest ground product claims and reply methodology.",
  inputSchema: z.object({
    kind: z
      .enum(["procedure", "product-reference", "reply-guide", "positioning"])
      .optional(),
  }),
  execute: async ({ kind }) => ({
    playbooks: listPlaybooks()
      .filter((playbook) => !kind || playbook.kind === kind)
      .map((playbook) => ({
        id: playbook.id,
        title: playbook.title,
        kind: playbook.kind,
        summary: playbook.summary,
      })),
  }),
});

export const readPlaybookAction = growthAction({
  outputSchema: readPlaybookActionOutputSchema,
  description:
    "The full text of one playbook by id. Read a procedure playbook before starting the job it describes, then follow its steps in order and report each one as it lands.",
  inputSchema: z.object({ id: z.string().min(1) }),
  execute: async ({ id }) => {
    const playbook = getPlaybook(id);
    if (!playbook) {
      throw new GrowthActionError(
        "not_found",
        `Unknown playbook: ${id}. Known: ${listPlaybooks()
          .map((row) => row.id)
          .join(", ")}`,
      );
    }
    return {
      id: playbook.id,
      title: playbook.title,
      kind: playbook.kind,
      body: playbook.body,
    };
  },
});
