import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "@/server/api/orpc";
import {
  isOutreachConfigured,
  testConnection,
  getProspects,
  isOutreachError,
} from "@/server/clients/outreach.client";

/**
 * Outreach oRPC Router
 *
 * Provides type-safe access to Outreach API endpoints.
 * All endpoints require authentication (protectedProcedure).
 */
export const outreachRouter = {
  /**
   * Test Outreach authentication
   *
   * Verifies that S2S credentials are configured and working.
   */
  testAuth: protectedProcedure.handler(async () => {
    if (!isOutreachConfigured) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message:
          "Outreach is not configured. Set OUTREACH_S2S_GUID, OUTREACH_PRIVATE_KEY, and OUTREACH_INSTALL_ID.",
      });
    }

    const result = await testConnection();

    if (!result.success) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: `Outreach connection failed: ${result.message}`,
      });
    }

    return {
      success: true,
      message: result.message,
    };
  }),

  /**
   * Get prospects from Outreach
   *
   * Fetches a paginated list of prospects with configurable page size.
   */
  getProspects: protectedProcedure
    .input(
      z.object({
        pageSize: z.number().min(1).max(100).default(10),
        pageNumber: z.number().min(1).optional(),
      }),
    )
    .handler(async ({ input }) => {
      if (!isOutreachConfigured) {
        throw new ORPCError("PRECONDITION_FAILED", {
          message:
            "Outreach is not configured. Set OUTREACH_S2S_GUID, OUTREACH_PRIVATE_KEY, and OUTREACH_INSTALL_ID.",
        });
      }

      try {
        const response = await getProspects({
          pageSize: input.pageSize,
          pageNumber: input.pageNumber,
        });

        return response;
      } catch (error) {
        console.error("[Outreach Router] Error fetching prospects:", error);

        if (isOutreachError(error)) {
          if (error.isRateLimited) {
            throw new ORPCError("TOO_MANY_REQUESTS", {
              message: `Rate limited. ${error.retryAfter ? `Retry after ${error.retryAfter}s` : ""}`,
            });
          }

          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: error.message,
          });
        }

        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Failed to fetch prospects from Outreach",
        });
      }
    }),
};
