import "server-only";
import {
  brandMarkInspectionSchema,
  renderSavedBrandMarkInspection,
} from "@/server/services/brand-mark-inspection.service";
import { chatModelOutput } from "./chat-context";

/** Identity owns both structured reads and optional visual verification. */
export async function chatBrandIdentityOutput(output: unknown) {
  const result = output as {
    ok?: boolean;
    action?: string;
    data?: { inspection?: unknown };
  } | null;
  const inspection = brandMarkInspectionSchema.safeParse(
    result?.data?.inspection,
  );
  if (!result?.ok || result.action !== "identity" || !inspection.success)
    return chatModelOutput("brandRead", output);
  try {
    const rendered = await renderSavedBrandMarkInspection(inspection.data);
    return {
      type: "content" as const,
      value: [
        {
          type: "text" as const,
          text: JSON.stringify({
            identity: output,
            panelOrder: [
              "color on white",
              "white on charcoal",
              "dark on white",
              ...(rendered.onPhoto ? ["white on selected preview photo"] : []),
            ],
            warnings: rendered.warnings,
          }),
        },
        {
          type: "image-data" as const,
          data: rendered.image.toString("base64"),
          mediaType: "image/png",
        },
      ],
    };
  } catch {
    return {
      type: "text" as const,
      value: JSON.stringify({
        identity: output,
        warning:
          "Saved mark images could not be rendered. Visual appearance remains unverified; do not claim the edit is visually correct.",
      }),
    };
  }
}
