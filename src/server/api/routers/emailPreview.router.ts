import { actionProcedure } from "@/server/api/orpc";
import {
  emailPreviewOptionsAction,
  shareEmailPreviewAction,
} from "@/server/ai/capabilities/email-client-preview";
export const emailPreviewRouter = {
  options: actionProcedure(emailPreviewOptionsAction),
  createLink: actionProcedure(shareEmailPreviewAction),
};
