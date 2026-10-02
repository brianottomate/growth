import { policyForGrowthTool } from "./policy";

/** A second generated edit must wait for another model step and its fresh state. */
export function createChatWriteGate() {
  let wrote = false;
  return {
    nextStep: () => {
      wrote = false;
    },
    beforeExecute: (name: string, input: unknown) => {
      const policy = policyForGrowthTool(name, input);
      if (
        !policy.consequence.endsWith("write") &&
        policy.consequence !== "background-run"
      )
        return;
      if (wrote)
        throw new Error(
          "Only one edit is allowed per step. Review the previous result, read current state, then edit the next entity in a new step.",
        );
      wrote = true;
    },
  };
}
