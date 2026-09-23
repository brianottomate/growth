import { actionProcedure } from "@/server/api/orpc";
import { syncBrandBlog as syncBrandBlogAction } from "@/server/ai/capabilities/operations";

export const blogRouter = {
  sync: actionProcedure(syncBrandBlogAction),
};
