import { actionProcedure } from "../orpc";
import {
  addReviewCommentAction,
  deleteReviewCommentAction,
  listReviewCommentsAction,
} from "@/server/ai/capabilities/review";
export const reviewRouter = {
  comments: actionProcedure(listReviewCommentsAction),
  addComment: actionProcedure(addReviewCommentAction),
  deleteComment: actionProcedure(deleteReviewCommentAction),
};
