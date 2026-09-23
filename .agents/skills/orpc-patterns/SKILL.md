---
name: orpc-patterns
description: Growth's oRPC + TanStack Query patterns. Use when adding or calling a procedure in src/server/api/routers, from a client component, a server component, or a server-side service.
allowed-tools: Read, Write, Edit
---

# oRPC patterns

Routers are plain objects of procedures in `src/server/api/routers/*.router.ts`,
registered in `src/server/api/root.ts`. The browser calls them at
`POST /api/rpc/<router>/<procedure>`.

## Procedures

```typescript
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "@/server/api/orpc";

export const brandRouter = {
  getById: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      const brand = await loadBrand(ctx, input.brandId);
      if (!brand) throw new ORPCError("NOT_FOUND", { message: "Brand not found" });
      return brand;
    }),
};
```

- `publicProcedure`, `protectedProcedure` (session required), `adminProcedure`.
- `workspaceProcedure` adds `context.workspace` (`orgId`, `userId`): the
  session's active organization after a live membership check. Use it
  instead of resolving the org inside a router.
- When a Growth action (`src/server/ai/capabilities`) already does the
  operation, serve it: `list: actionProcedure(listPersonas)`. The app then gets
  the action's input schema, org scope and error classification, and the
  assistant, MCP and app stay one definition. Extend the action (e.g. make a
  field `nullish` so the UI can clear it) rather than writing a parallel
  procedure.
- Organization-scoped: `organizationProcedure` when the input is only
  `organizationId`; otherwise
  `protectedProcedure.input(organizationInput.extend({...})).use(organizationAccess)`.
- A plain `Error` thrown by a service keeps its message for the operator.
  Throw `ORPCError` when the caller needs a specific status code.

## Client components

```typescript
"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/orpc/client";

const brand = useQuery(orpc.brand.getById.queryOptions({ input: { brandId } }));
const lazy = useQuery(
  orpc.brand.getById.queryOptions({ input: { brandId }, enabled: open }),
);

const queryClient = useQueryClient();
const create = useMutation(
  orpc.brand.create.mutationOptions({
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: orpc.brand.list.key() }),
  }),
);
```

- `queryKey({ input })` is the exact key (use it for `setQueryData`);
  `key()` or `key({ input })` is a prefix for invalidation.
- Types: `RouterOutputs["brand"]["getById"]` from `@/orpc/client`.

## Server components

```typescript
import { HydrateClient, orpc, prefetch, serverApi } from "@/orpc/server";

const brand = await serverApi.brand.getById({ brandId });
prefetch(orpc.content.board.queryOptions({ input: { brandId } }));
return <HydrateClient><Board /></HydrateClient>;
```

Outside a request (scripts, services), use
`createRouterClient(appRouter, { context })` from `@orpc/server`.
