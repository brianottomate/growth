import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "@/server/api/orpc";
import {
  isInstantlyConfigured,
  isInstantlyError,
  testConnection,
  listLeads,
  getLead,
  patchLead,
  addLeadsBulk,
  listCampaigns,
  getCampaignAnalytics,
  listLeadLists,
} from "@/server/clients/instantly.client";
import type { LeadInterestStatus } from "@/server/clients/instantly.types";

/**
 * Instantly oRPC Router
 *
 * Type-safe access to Instantly.ai API for lead management,
 * campaigns, and AI-enrichment write-back workflows.
 */
export const instantlyRouter = {
  testAuth: protectedProcedure.handler(async () => {
    if (!isInstantlyConfigured) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message: "Instantly is not configured. Set INSTANTLY_API_KEY.",
      });
    }

    const result = await testConnection();
    if (!result.success) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: `Instantly connection failed: ${result.message}`,
      });
    }

    return result;
  }),

  listLeads: protectedProcedure
    .input(
      z.object({
        campaign: z.string().uuid().optional(),
        list_id: z.string().uuid().optional(),
        search: z.string().optional(),
        filter: z.string().optional(),
        in_campaign: z.boolean().optional(),
        in_list: z.boolean().optional(),
        limit: z.number().min(1).max(100).default(50),
        starting_after: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      try {
        return await listLeads({
          campaign: input.campaign,
          list_id: input.list_id,
          search: input.search,
          filter: input.filter,
          in_campaign: input.in_campaign,
          in_list: input.in_list,
          limit: input.limit,
          starting_after: input.starting_after,
        });
      } catch (error) {
        if (isInstantlyError(error)) {
          throw new ORPCError(
            error.isRateLimited ? "TOO_MANY_REQUESTS" : "BAD_REQUEST",
            { message: error.message },
          );
        }
        throw error;
      }
    }),

  getLead: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .handler(async ({ input }) => {
      const lead = await getLead(input.id);
      if (!lead) {
        throw new ORPCError("NOT_FOUND", { message: "Lead not found" });
      }
      return lead;
    }),

  patchLead: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: z.object({
          first_name: z.string().optional(),
          last_name: z.string().optional(),
          company_name: z.string().optional(),
          phone: z.string().optional(),
          website: z.string().optional(),
          lt_interest_status: z.number().optional(),
          custom_variables: z
            .record(
              z.string(),
              z.union([z.string(), z.number(), z.boolean(), z.null()]),
            )
            .optional(),
        }),
      }),
    )
    .handler(async ({ input }) => {
      try {
        return await patchLead(input.id, {
          ...input.data,
          lt_interest_status: input.data.lt_interest_status as
            | LeadInterestStatus
            | undefined,
          custom_variables: input.data.custom_variables,
        });
      } catch (error) {
        if (isInstantlyError(error)) {
          throw new ORPCError(
            error.statusCode === 404 ? "NOT_FOUND" : "BAD_REQUEST",
            { message: error.message },
          );
        }
        throw error;
      }
    }),

  addLeadsBulk: protectedProcedure
    .input(
      z.object({
        campaign_id: z.string().uuid().optional(),
        list_id: z.string().uuid().optional(),
        leads: z
          .array(
            z.object({
              email: z.string().email().optional(),
              first_name: z.string().optional(),
              last_name: z.string().optional(),
              company_name: z.string().optional(),
              phone: z.string().optional(),
              website: z.string().optional(),
              custom_variables: z
                .record(
                  z.string(),
                  z.union([z.string(), z.number(), z.boolean(), z.null()]),
                )
                .optional(),
            }),
          )
          .min(1)
          .max(1000),
        skip_if_in_workspace: z.boolean().default(true),
      }),
    )
    .handler(async ({ input }) => {
      return await addLeadsBulk({
        ...input,
        leads: input.leads.map((l) => ({
          ...l,
          custom_variables: l.custom_variables,
        })),
      });
    }),

  listCampaigns: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        starting_after: z.string().optional(),
        search: z.string().optional(),
        status: z.number().optional(),
      }),
    )
    .handler(async ({ input }) => {
      return await listCampaigns(input);
    }),

  getCampaignAnalytics: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        ids: z.array(z.string().uuid()).optional(),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        exclude_total_leads_count: z.boolean().optional(),
      }),
    )
    .handler(async ({ input }) => {
      return await getCampaignAnalytics(input);
    }),

  listLeadLists: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        starting_after: z.string().optional(),
        has_enrichment_task: z.boolean().optional(),
        search: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      return await listLeadLists(input);
    }),
};
