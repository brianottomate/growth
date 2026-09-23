import { ORPCError, os } from "@orpc/server";
import { z } from "zod";

import {
  compactGrowthError,
  type GrowthErrorCode,
} from "@/server/ai/kernel/errors";
import type { GrowthAction } from "@/server/ai/kernel/tool";
import { auth } from "@/server/better-auth";
import { db } from "@/server/db";
import { createId } from "@/server/db/utils";
import { loadOrganizationWithAccess } from "@/server/services/security.service";
import {
  resolveWorkspaceOrganizationId,
  WorkspaceAccessError,
} from "@/server/workspace-actor";

export async function createAPIContext({ headers }: { headers: Headers }) {
  return {
    db,
    session: await auth.api.getSession({ headers }),
    authApi: auth.api,
    headers,
  };
}
export type APIContext = Awaited<ReturnType<typeof createAPIContext>>;

export const publicProcedure = os
  .$context<APIContext>()
  .use(async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      // A driver error's message is the whole failed statement. Drizzle threw
      // one straight through to the UI once: an operator re-ran "draft ads from
      // their homes" and got the full INSERT in place of "that ad already
      // exists". The real error still reaches the server logs untouched.
      if (
        error instanceof Error &&
        /^(insert into|update |delete from|select )/i.test(error.message.trim())
      ) {
        console.error("[rpc] driver error surfaced", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "The database rejected that write. It has been logged — check the server logs for the query.",
          cause: error,
        });
      }
      // Services throw plain Errors with operator-facing messages; oRPC would
      // replace those with a generic 500 message.
      if (error instanceof Error && !(error instanceof ORPCError))
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: error.message,
          cause: error,
        });
      throw error;
    }
  });

export const protectedProcedure = publicProcedure.use(({ context, next }) => {
  const session = context.session;
  if (!session?.user) throw new ORPCError("UNAUTHORIZED");
  return next({ context: { session } });
});

/**
 * Checks membership of the input's organization and exposes one shared
 * permission calculation. Chain after an `.input()` that includes
 * `organizationId`.
 */
export const organizationAccess = os
  .$context<{ session: NonNullable<APIContext["session"]> }>()
  .middleware(async ({ context, next }, input: { organizationId: string }) => {
    const { organization, membership, permissions } =
      await loadOrganizationWithAccess(
        input.organizationId,
        context.session.user.id,
      );
    return next({
      context: { organization, membership, orgPermissions: permissions },
    });
  });

export const organizationInput = z.object({ organizationId: z.string() });
export const organizationProcedure = protectedProcedure
  .input(organizationInput)
  .use(organizationAccess);

/** Resolves the organization the person is acting in; see `workspaceActor`. */
export const workspaceProcedure = protectedProcedure.use(
  async ({ context, next }) => {
    const userId = context.session.user.id;
    try {
      const orgId = await resolveWorkspaceOrganizationId({
        userId,
        preferredOrganizationId: context.session.session.activeOrganizationId,
      });
      return next({ context: { workspace: { orgId, userId } } });
    } catch (error) {
      if (error instanceof WorkspaceAccessError)
        throw new ORPCError("FORBIDDEN", { message: error.message });
      throw error;
    }
  },
);

const statusFor: Partial<Record<GrowthErrorCode, string>> = {
  invalid_input: "BAD_REQUEST",
  forbidden: "FORBIDDEN",
  not_found: "NOT_FOUND",
  rate_limited: "TOO_MANY_REQUESTS",
  timeout: "TIMEOUT",
  conflict: "CONFLICT",
  provider_unavailable: "SERVICE_UNAVAILABLE",
};

/** The assistant's error classification, as an HTTP status for the app. */
function actionFailure(error: Error) {
  const code = statusFor[compactGrowthError(error).code];
  return code
    ? new ORPCError(code, { message: error.message, cause: error })
    : error;
}

/**
 * Serves a typed Growth action to the app with the same input contract,
 * organization scope and failure classification the assistant and MCP get.
 */
export function actionProcedure<Schema extends z.ZodObject, Output>(
  action: GrowthAction<z.infer<Schema>, Output, Schema>,
) {
  return workspaceProcedure
    .input(action.inputSchema)
    .handler(async ({ context, input }) => {
      try {
        return await action.run(input as z.infer<Schema>, {
          ...context.workspace,
          surface: "app",
          runId: createId("run"),
        });
      } catch (error) {
        throw error instanceof Error && !(error instanceof ORPCError)
          ? actionFailure(error)
          : error;
      }
    });
}

export const adminProcedure = publicProcedure.use(({ context, next }) => {
  if (process.env.NODE_ENV === "development") return next();
  const session = context.session;
  if (!session?.user) throw new ORPCError("UNAUTHORIZED");
  if (session.user.email.toLowerCase() !== "kristian@wander.com")
    throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
  return next({ context: { session } });
});
